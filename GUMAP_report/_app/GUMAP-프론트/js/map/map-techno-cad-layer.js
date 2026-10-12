/**
 * 테크노관 학교 공식 CAD 도면 레이어
 * map-techno-cad-layer.js
 * ──────────────────────────────────────────────────────────
 * 학교에서 받은 001.테크노관.dwg 의 벽·문·계단 선형을 기존 IMDF 실내지도 위에
 * 겹쳐 그린다. 기존 방 폴리곤·호실 정보·길찾기는 그대로 두고, 이 레이어만 따로
 * 켜고 끈다. 끄면 예전 화면 그대로다.
 *
 * 선형은 층마다 1만 개가 넘어서 L.Polyline 으로 올리면 층을 바꿀 때마다 화면이
 * 멎는다. 그래서 캔버스 한 장에 직접 그린다. 층 데이터는 그 층을 처음 볼 때
 * 받아 온다(층당 0.1~0.35 MB).
 *
 * 좌표: CAD 로컬 미터에 층별 1차 변환을 걸어 WGS84 로 보낸다. 변환 계수는
 * publish.py 가 기존 지도의 좌표계에 맞춰 계산해 TECHNO_CAD 에 넣어 둔다.
 * CAD 를 늘리거나 기존 좌표를 고치지 않는다.
 */
(function () {
    'use strict';

    const DATA = window.TECHNO_CAD;
    if (!DATA || !Array.isArray(DATA.floors)) {
        console.warn('[CAD] TECHNO_CAD 데이터가 없습니다. publish.py --write 를 실행하세요.');
        return;
    }

    // 루트 index.html 과 GUMAP-일반지도/index.html 이 같은 스크립트를 쓴다. 페이지
    // 기준 상대경로를 쓰면 한쪽에서 데이터 경로가 어긋나므로, 스크립트 자기
    // 위치에서 프로젝트 루트를 되짚는다. (js/map/ 에서 세 단계 위가 루트다)
    const SCRIPT = document.currentScript;
    const PROJECT_ROOT = new URL('/', location.href).href;  /* [REPORT] 사본 위치가 달라 루트 기준으로 */

    const FLOORS = {};
    DATA.floors.forEach(f => { FLOORS[f.floor] = f; });

    // 투영 기준 줌. 점마다 한 번만 투영해 두고, 그릴 때는 배율과 평행이동만 건다.
    // 줌마다 3만 개를 다시 투영하면 층 전환이 눈에 띄게 끊긴다.
    const ZREF = 20;
    const TECHNO_CENTER = [36.146643, 128.394348];
    const MIN_ZOOM = 17;
    const NEAR_M = 1200;

    const cache = {};      // floor -> {paths:[...], rooms:[...]}
    const pending = {};    // floor -> Promise
    let showLines = true;
    let showRooms = true;
    let showDoors = true;
    let showCandidates = false;

    // 호실 번호는 확대해야 읽힌다. 이보다 멀면 글자가 서로 겹쳐 도면만 더럽힌다.
    const ROOM_LABEL_ZOOM = 19;

    function baseUrl() {
        return new URL(DATA.base || 'GUMAP-학교지도/data/cad/', PROJECT_ROOT).href;
    }

    function loadFloor(floor) {
        if (cache[floor]) return Promise.resolve(cache[floor]);
        if (pending[floor]) return pending[floor];
        const meta = FLOORS[floor];
        if (!meta) return Promise.resolve(null);

        pending[floor] = fetch(baseUrl() + encodeURIComponent(floor) + '.json')
            .then(res => {
                if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
                return res.json();
            })
            // 층을 처음 볼 때 하는 일(투영 → 경로 만들기)을 한 덩어리로 돌리면 느린
            // 기기에서 100 ms 넘게 화면이 멈춘다. 단계마다 한 번씩 브라우저에 차례를
            // 넘겨서 그 사이에 입력과 애니메이션이 처리되게 한다.
            .then(bundle => nextTask().then(() => projectOnly(bundle, meta.affine)))
            .then(data => nextTask().then(() => prebuild(data)))
            .then(data => {
                cache[floor] = data;
                delete pending[floor];
                return cache[floor];
            })
            .catch(err => {
                delete pending[floor];
                console.warn('[CAD] ' + floor + ' 선형을 불러오지 못했습니다:', err);
                return null;
            });
        return pending[floor];
    }

    /**
     * 위경도 -> ZREF 픽셀. Leaflet 기본 좌표계(EPSG:3857)의 map.project 와 같은 식이다.
     * 층마다 점이 수만 개라 점마다 L.latLng 객체를 만드는 비용이 층을 처음 열 때의
     * 멈춤 대부분이었다. 다른 좌표계를 쓰는 지도면 원래 함수로 돌아간다.
     */
    const ZREF_SCALE = 256 * Math.pow(2, ZREF);
    const MAX_LAT = 85.0511287798;
    const out = [0, 0];
    function toZrefPixel(lat, lon) {
        const map = window.map;
        if (!map.options.crs || map.options.crs !== L.CRS.EPSG3857) {
            const point = map.project(L.latLng(lat, lon), ZREF);
            out[0] = point.x; out[1] = point.y;
            return out;
        }
        const sin = Math.sin(Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI / 180);
        out[0] = ZREF_SCALE * (lon / 360 + 0.5);
        out[1] = ZREF_SCALE * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI));
        return out;
    }

    /** cm 정수 좌표 -> WGS84 -> ZREF 기준 픽셀. 경계 상자도 같이 만든다. */
    function projectFlat(flat, affine) {
        const count = flat.length / 2;
        const xy = new Float64Array(flat.length);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < count; i++) {
            const mx = flat[i * 2] / 100, my = flat[i * 2 + 1] / 100;
            const lon = affine.lon[0] * mx + affine.lon[1] * my + affine.lon[2];
            const lat = affine.lat[0] * mx + affine.lat[1] * my + affine.lat[2];
            const point = toZrefPixel(lat, lon);
            xy[i * 2] = point[0]; xy[i * 2 + 1] = point[1];
            if (point[0] < minX) minX = point[0];
            if (point[0] > maxX) maxX = point[0];
            if (point[1] < minY) minY = point[1];
            if (point[1] > maxY) maxY = point[1];
        }
        return { xy: xy, box: [minX, minY, maxX, maxY] };
    }

    function nextTask() {
        return new Promise(resolve => setTimeout(resolve, 0));
    }

    function projectOnly(bundle, affine) {
        const paths = bundle.paths.map(flat => projectFlat(flat, affine));
        const rooms = (bundle.rooms || []).map(room => ({
            // 번호가 둘 이상 들어간 구획이 있다. 글자를 겹쳐 찍지 않고 한 줄로 잇는다.
            text: room.ids.join('·'),
            status: room.status,
            areaM2: room.area_m2,
            at: projectFlat(room.at, affine).xy,
            ring: room.ring ? projectFlat(room.ring, affine) : null
        }));
        const outline = (bundle.outline || []).map(flat => projectFlat(flat, affine));
        return { paths: paths, rooms: rooms, outline: outline };
    }

    /**
     * 층마다 선형을 Path2D 로 **한 번만** 만들어 둔다.
     *
     * 예전에는 지도를 옮길 때마다 선 1만여 개를 자바스크립트로 한 점씩
     * moveTo/lineTo 했다. 4배 느린 CPU(보급형 휴대폰 수준)에서 팬이 끝날 때마다
     * 50 ms 넘는 프레임이 생겨 화면이 턱턱 멈췄다. 경로를 미리 만들어 두면
     * 그릴 때는 변환 행렬 하나만 걸고 stroke 한 번이면 된다.
     *
     * 좌표는 ZREF 픽셀에서 층 경계 상자 왼쪽 위를 뺀 값으로 넣는다. ZREF 픽셀은
     * 1억 단위라 그대로 넣으면 캔버스 내부 정밀도에서 선이 흔들린다.
     */
    function prebuild(data) {
        let minX = Infinity, minY = Infinity;
        for (const entry of data.paths.concat(data.outline)) {
            if (entry.box[0] < minX) minX = entry.box[0];
            if (entry.box[1] < minY) minY = entry.box[1];
        }
        if (!isFinite(minX)) { minX = 0; minY = 0; }
        const anchor = [minX, minY];
        const trace = (path, entry, close) => {
            const xy = entry.xy;
            path.moveTo(xy[0] - minX, xy[1] - minY);
            for (let i = 2; i < xy.length; i += 2) path.lineTo(xy[i] - minX, xy[i + 1] - minY);
            if (close) path.closePath();
        };
        const lines = new Path2D();
        data.paths.forEach(entry => trace(lines, entry, false));
        const outline = new Path2D();
        data.outline.forEach(entry => trace(outline, entry, true));
        const solidRooms = new Path2D(), reviewRooms = new Path2D();
        data.rooms.forEach(room => {
            if (!room.ring) return;
            trace(room.status === 'single_label_candidate' ? solidRooms : reviewRooms, room.ring, true);
        });
        data.anchor = anchor;
        data.path2d = { lines: lines, outline: outline, solidRooms: solidRooms, reviewRooms: reviewRooms };
        return data;
    }

    /* ─────────────── 캔버스 레이어 ─────────────── */
    // 화면보다 사방으로 이만큼(화면 크기 비율) 더 그려 둔다. 그 안에서 지도를
    // 옮기는 동안에는 다시 그리지 않고 이미 그린 그림이 같이 움직인다.
    const PAD = 0.35;
    // 휴대폰은 화면 배율이 3 이라 여백까지 그대로 그리면 캔버스 하나에 30 MB 가 넘는다.
    // 선 굵기 1 px 짜리 도면은 배율 2 로도 충분히 선명하다.
    function canvasRatio() { return Math.min(2, window.devicePixelRatio || 1); }
    function padFor(size) { return size.x <= 768 ? 0.25 : PAD; }

    const CadCanvas = L.Layer.extend({
        onAdd: function (map) {
            this._canvas = L.DomUtil.create('canvas', 'techno-cad-canvas');
            this._canvas.style.pointerEvents = 'none';
            this._canvas.style.position = 'absolute';
            map.getPane('overlayPane').appendChild(this._canvas);
            map.on('moveend', this._onMoveEnd, this);
            map.on('zoomend resize', this._reset, this);
            map.on('zoomanim', this._animate, this);
            this._reset();
        },
        onRemove: function (map) {
            map.off('moveend', this._onMoveEnd, this);
            map.off('zoomend resize', this._reset, this);
            map.off('zoomanim', this._animate, this);
            if (this._canvas && this._canvas.parentNode) {
                this._canvas.parentNode.removeChild(this._canvas);
            }
            this._canvas = null;
            this._drawn = null;
        },
        _animate: function (event) {
            // 줌 애니메이션 동안에는 이미 그려 둔 그림을 같이 확대·이동시킨다.
            // 다시 그리면 한 프레임이 통째로 밀린다.
            const map = this._map;
            if (!this._canvas || !this._drawn) return;
            const scale = map.getZoomScale(event.zoom);
            // 캔버스 왼쪽 위(여백 포함)가 새 줌에서 놓일 레이어 좌표
            const topLeft = map.unproject(this._drawn.world.min, this._drawn.zoom);
            const offset = map._latLngToNewLayerPoint(topLeft, event.zoom, event.center);
            L.DomUtil.setTransform(this._canvas, offset, scale);
        },
        _onMoveEnd: function () {
            // 그려 둔 여백 안에서만 움직였으면 다시 그릴 필요가 없다.
            const map = this._map;
            if (!this._canvas || !map) return;
            const view = map.getPixelBounds();
            const drawn = this._drawn;
            if (drawn && drawn.zoom === map.getZoom() &&
                view.min.x >= drawn.world.min.x && view.min.y >= drawn.world.min.y &&
                view.max.x <= drawn.world.max.x && view.max.y <= drawn.world.max.y) {
                return;
            }
            this._reset();
        },
        _reset: function () {
            if (!this._canvas || !this._map) return;
            const map = this._map;
            const size = map.getSize();
            const ratio = canvasRatio();
            const pad = padFor(size);
            const padX = Math.round(size.x * pad), padY = Math.round(size.y * pad);
            const cssW = size.x + padX * 2, cssH = size.y + padY * 2;
            const view = map.getPixelBounds();
            this._drawn = {
                zoom: map.getZoom(),
                world: L.bounds([view.min.x - padX, view.min.y - padY],
                                [view.max.x + padX, view.max.y + padY])
            };
            L.DomUtil.setTransform(this._canvas, null, 1);
            L.DomUtil.setPosition(this._canvas, map.containerPointToLayerPoint([-padX, -padY]));
            // 크기가 같으면 버퍼를 새로 잡지 않는다. width 를 대입하는 것만으로도
            // 캔버스 전체를 다시 할당한다.
            const pxW = Math.round(cssW * ratio), pxH = Math.round(cssH * ratio);
            if (this._canvas.width !== pxW || this._canvas.height !== pxH) {
                this._canvas.width = pxW;
                this._canvas.height = pxH;
                this._canvas.style.width = cssW + 'px';
                this._canvas.style.height = cssH + 'px';
            }
            this.draw();
        },
        draw: function () {
            if (!this._canvas || !this._map || !this._drawn) return;
            const ratio = canvasRatio();
            const ctx = this._canvas.getContext('2d');
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

            const floor = window.technoActiveFloor || '1F';
            const data = cache[floor];
            if (!data) return;

            const zoom = this._drawn.zoom;
            const scale = Math.pow(2, zoom - ZREF);
            // 캔버스 왼쪽 위의 월드 픽셀 좌표
            const offX = this._drawn.world.min.x, offY = this._drawn.world.min.y;
            const size = { x: this._canvas.width / ratio, y: this._canvas.height / ratio };
            // Path2D 좌표(앵커 기준 ZREF 픽셀) -> 캔버스 픽셀
            const toCanvas = () => ctx.setTransform(
                ratio * scale, 0, 0, ratio * scale,
                ratio * (data.anchor[0] * scale - offX), ratio * (data.anchor[1] * scale - offY));

            if (showLines || showRooms) this._drawOutline(ctx, data, scale, toCanvas);
            if (showRooms) this._drawRooms(ctx, data, scale, toCanvas);
            if (showLines) this._drawLines(ctx, data, zoom, scale, toCanvas);
            if (showRooms && zoom >= ROOM_LABEL_ZOOM) {
                ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
                this._drawRoomNumbers(ctx, data, zoom, scale, offX, offY, size);
            }
        },
        _drawLines: function (ctx, data, zoom, scale, toCanvas) {
            // 얇은 흰 획을 먼저 깔면 위성지도·흰 바탕 어디서도 선이 읽힌다.
            // 변환 행렬에 배율이 들어가 있으므로 선 굵기는 배율로 나눠 화면 픽셀에 맞춘다.
            const width = zoom >= 20 ? 1.4 : zoom >= 19 ? 1.1 : 0.9;
            toCanvas();
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.setLineDash([]);
            for (const pass of [
                { colour: 'rgba(255,255,255,0.85)', width: width + 1.6 },
                { colour: 'rgba(15,23,42,0.88)', width: width }
            ]) {
                ctx.strokeStyle = pass.colour;
                ctx.lineWidth = pass.width / scale;
                ctx.stroke(data.path2d.lines);
            }
        },
        _drawOutline: function (ctx, data, scale, toCanvas) {
            // 이 층 건물 외곽선. 멀리서 보면 방 하나하나는 안 보여도 건물이
            // 어디까지인지는 보여야 한다.
            if (!data.outline.length) return;
            toCanvas();
            ctx.strokeStyle = 'rgba(79,70,229,0.9)';
            ctx.lineWidth = 2.6 / scale;
            ctx.setLineDash([]);
            ctx.stroke(data.path2d.outline);
        },
        _drawRooms: function (ctx, data, scale, toCanvas) {
            // 확정 구획과 검토가 필요한 구획을 실선·점선으로 가른다. 한 구획에
            // 번호가 여럿이거나 방이 잘린 것은 경계를 그대로 믿으면 안 된다.
            toCanvas();
            for (const solid of [true, false]) {
                const path = solid ? data.path2d.solidRooms : data.path2d.reviewRooms;
                ctx.fillStyle = solid ? 'rgba(99,102,241,0.10)' : 'rgba(217,119,6,0.10)';
                ctx.fill(path, 'evenodd');
                ctx.strokeStyle = solid ? 'rgba(99,102,241,0.75)' : 'rgba(217,119,6,0.85)';
                ctx.lineWidth = 1.6 / scale;
                ctx.setLineDash(solid ? [] : [5 / scale, 4 / scale]);
                ctx.stroke(path);
            }
            ctx.setLineDash([]);
        },
        _drawRoomNumbers: function (ctx, data, zoom, scale, offX, offY, size) {
            const fontSize = Math.min(18, Math.max(10, 11 + (zoom - ROOM_LABEL_ZOOM) * 3.5));
            ctx.font = '700 ' + fontSize + 'px -apple-system, "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineJoin = 'round';
            ctx.lineWidth = Math.max(3, fontSize * 0.32);
            for (const room of data.rooms) {
                const x = room.at[0] * scale - offX, y = room.at[1] * scale - offY;
                if (x < -60 || y < -30 || x > size.x + 60 || y > size.y + 30) continue;
                ctx.strokeStyle = 'rgba(255,255,255,0.92)';
                ctx.strokeText(room.text, x, y);
                ctx.fillStyle = room.status === 'single_label_candidate'
                    ? 'rgba(30,27,75,0.95)' : 'rgba(146,64,14,0.95)';
                ctx.fillText(room.text, x, y);
            }
        }
    });

    const canvasLayer = new CadCanvas();
    const doorLayer = L.layerGroup();
    window.technoCadLayer = canvasLayer;
    window.technoCadDoorLayer = doorLayer;

    /* ─────────────── 출입구 마커 ─────────────── */
    const LEAF_TEXT = {
        single: '여닫이', double_acting: '양방향 자재문', none: '문짝 없음', unknown: '미상'
    };
    const PLACEMENT_TEXT = { exterior: '건물 바깥', courtyard: '중정·옥외공간' };

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g,
            c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function doorIcon(entry) {
        const open = entry.certainty === 'high';
        const colour = open ? '#16a34a' : '#a16207';
        return L.divIcon({
            className: 'techno-cad-door',
            html: '<div style="width:22px;height:22px;border-radius:50%;display:flex;' +
                'align-items:center;justify-content:center;font-size:12px;line-height:1;' +
                'background:' + (open ? 'rgba(22,163,74,.92)' : 'rgba(30,41,59,.85)') + ';' +
                'border:2px ' + (open ? 'solid' : 'dashed') + ' ' + colour + ';' +
                'box-shadow:0 2px 6px rgba(0,0,0,.45);">🚪</div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11]
        });
    }

    function renderDoors() {
        doorLayer.clearLayers();
        if (!showDoors) return;
        const floor = window.technoActiveFloor || '1F';
        const meta = FLOORS[floor];
        if (!meta) return;
        meta.entrances.forEach(entry => {
            const open = entry.certainty === 'high';
            if (!open && !showCandidates) return;
            const marker = L.marker([entry.lat, entry.lon], {
                icon: doorIcon(entry),
                zIndexOffset: 500
            });
            const run = entry.outside_run_m == null ? '미상' : entry.outside_run_m + ' m';
            marker.bindPopup(
                '<div style="font-size:12px;min-width:210px;">' +
                '<div style="font-weight:800;margin-bottom:6px;">🚪 테크노관 ' +
                escapeHtml(floor) + ' 외부 출입문' +
                (open
                    ? '<span style="margin-left:6px;font-size:10px;background:#16a34a;color:#fff;padding:1px 6px;border-radius:10px;">트인 곳</span>'
                    : '<span style="margin-left:6px;font-size:10px;background:#a16207;color:#fff;padding:1px 6px;border-radius:10px;">후보</span>') +
                '</div>' +
                '<div style="line-height:1.7;color:#94a3b8;">' +
                '<div>나가는 쪽 · <span style="color:#e2e8f0">' + escapeHtml(PLACEMENT_TEXT[entry.placement] || entry.placement) + '</span></div>' +
                '<div>문 종류 · <span style="color:#e2e8f0">' + escapeHtml(LEAF_TEXT[entry.leaf] || entry.leaf || '미상') + '</span></div>' +
                '<div>문 폭 · <span style="color:#e2e8f0">' + (entry.width_m ? entry.width_m.toFixed(2) + ' m' : '미상') + '</span></div>' +
                '<div>나가서 트인 거리 · <span style="color:#e2e8f0">' + escapeHtml(run) + '</span></div>' +
                '</div>' +
                '<div style="margin-top:8px;padding:6px;background:rgba(148,163,184,.12);border-radius:6px;' +
                'font-size:10px;color:#94a3b8;line-height:1.5;">' +
                (open ? '학교 CAD 도면에서 이 층 건물 외곽을 넘는 문으로 읽었다. '
                      : '외곽을 넘지만 나가자마자 막힌다. 계단실·발코니일 수 있다. ') +
                '실제로 열려 있는지, 잠겨 있는지는 확인하지 않았다. 길찾기에는 쓰지 않는다.</div>' +
                '</div>');
            doorLayer.addLayer(marker);
        });
    }

    /* ─────────────── 표시 제어 ─────────────── */
    function nearby() {
        if (!window.map) return false;
        return window.map.getZoom() >= MIN_ZOOM &&
            window.map.distance(window.map.getCenter(), TECHNO_CENTER) <= NEAR_M;
    }

    // 마지막으로 그린 상태. 지도를 옮기기만 했으면(층·토글 그대로) 출입문 마커를
    // 다시 만들거나 캔버스를 다시 그리지 않는다. 캔버스는 스스로 여백 밖으로
    // 나갔을 때만 다시 그린다(CadCanvas._onMoveEnd).
    let lastDoors = '', lastCanvas = '';

    function refresh() {
        const map = window.map;
        if (!map) return;
        const visible = nearby();
        const wantCanvas = visible && (showLines || showRooms);
        if (wantCanvas && !map.hasLayer(canvasLayer)) canvasLayer.addTo(map);
        if (!wantCanvas && map.hasLayer(canvasLayer)) { map.removeLayer(canvasLayer); lastCanvas = ''; }

        const wantDoors = visible && showDoors;
        if (wantDoors && !map.hasLayer(doorLayer)) doorLayer.addTo(map);
        if (!wantDoors && map.hasLayer(doorLayer)) map.removeLayer(doorLayer);

        if (!visible) return;
        const floor = window.technoActiveFloor || '1F';
        const doorKey = [floor, showDoors, showCandidates].join('|');
        if (doorKey !== lastDoors) { renderDoors(); lastDoors = doorKey; }
        if ((showLines || showRooms) && !cache[floor]) {
            loadFloor(floor).then(() => { canvasLayer.draw(); lastCanvas = [floor, showLines, showRooms, !!cache[floor]].join('|'); });
            return;
        }
        const canvasKey = [floor, showLines, showRooms, !!cache[floor]].join('|');
        if (canvasKey !== lastCanvas) { canvasLayer.draw(); lastCanvas = canvasKey; }
    }
    window.refreshTechnoCadLayer = refresh;

    /* ─────────────── 패널 안의 켜고 끄기 ─────────────── */
    function control(id, label, checked, onChange, hint) {
        // 모양은 css/indoor.css 의 .ti-switch 가 정한다 (토글 스위치)
        const row = document.createElement('label');
        row.className = 'ti-switch';
        if (hint) row.title = hint;
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.id = id;
        box.checked = checked;
        box.setAttribute('role', 'switch');
        box.addEventListener('change', () => onChange(box.checked));
        row.appendChild(document.createTextNode(label));
        row.appendChild(box);
        return row;
    }

    function mountUI() {
        const panel = document.getElementById('techno-indoor-panel');
        if (!panel) return false;
        if (document.getElementById('ti-cad-box')) return true;
        // 새 패널은 '지도 표시' 구획을 비워 두고 기다린다. 없으면 패널 끝에 붙는다.
        const slot = document.getElementById('ti-layers-slot') || panel;

        const box = document.createElement('div');
        box.id = 'ti-cad-box';
        box.style.cssText = 'display:flex;flex-direction:column;gap:5px;';
        const title = document.createElement('div');
        title.textContent = '학교 공식 CAD 도면';
        box.appendChild(title);
        box.appendChild(control('ti-cad-lines', '도면 벽·문 선', showLines, value => {
            showLines = value; refresh();
        }));
        box.appendChild(control('ti-cad-rooms', '호실 경계·번호', showRooms, value => {
            showRooms = value; refresh();
        }, '호실 번호는 확대하면 나온다. 주황 점선은 CAD 구획이 방 하나와 딱 맞지 않아 검토가 필요한 곳이다.'));
        box.appendChild(control('ti-cad-doors', '외부 출입문', showDoors, value => {
            showDoors = value; refresh();
        }));
        box.appendChild(control('ti-cad-cands', '막힌 출입문 후보', showCandidates, value => {
            showCandidates = value; refresh();
        }, '건물 외곽을 넘지만 나가자마자 막히는 문. 계단실·발코니일 수 있다.'));

        // 360 투어 프로토타입. 아직 실사진이 없어 CAD 로 합성한 화면이다.
        const tour = document.createElement('a');
        tour.id = 'ti-cad-tour';
        tour.href = new URL('테크노관-360투어.html', PROJECT_ROOT).href;
        tour.target = '_blank';
        tour.rel = 'noopener';
        tour.textContent = '실내 로드뷰 전체 화면으로 보기 ↗';
        box.appendChild(tour);

        slot.appendChild(box);
        // 기존 CAD 뷰어 진입 버튼(map-techno-cad-entry.js)이 먼저 붙었으면 맨 아래로 내린다.
        const entry = document.getElementById('ti-official-cad');
        if (entry) slot.appendChild(entry);
        return true;
    }

    /* ─────────────── 붙이기 ─────────────── */
    function start() {
        if ((window.GUMAP_WEEK || 99) < 8) return;  /* [REPORT] CAD·360 로드뷰는 8주차 */
        if (!window.map || typeof L === 'undefined') { setTimeout(start, 300); return; }
        if (!mountUI()) {
            const observer = new MutationObserver(() => { if (mountUI()) observer.disconnect(); });
            observer.observe(document.body, { childList: true, subtree: true });
            window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
        }

        // 층 전환은 실내지도 모듈이 renderTechnoFloor 로 알린다. 거기에 얹어야
        // 층 버튼·검색 결과 이동 어느 쪽으로 바뀌든 같이 따라간다.
        const original = window.renderTechnoFloor;
        if (typeof original === 'function' && !original._cadWrapped) {
            const wrapped = function () {
                const result = original.apply(this, arguments);
                refresh();
                return result;
            };
            wrapped._cadWrapped = true;
            window.renderTechnoFloor = window.renderTechnoB1Floor = wrapped;
        }

        window.map.on('zoomend moveend', refresh);
        refresh();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
