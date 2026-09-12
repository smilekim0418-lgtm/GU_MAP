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
    const PROJECT_ROOT = new URL('../../../', SCRIPT.src).href;

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
            .then(bundle => {
                cache[floor] = project(bundle, meta.affine);
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

    /** cm 정수 좌표 -> WGS84 -> ZREF 기준 픽셀. 경계 상자도 같이 만든다. */
    function projectFlat(flat, affine) {
        const count = flat.length / 2;
        const xy = new Float64Array(flat.length);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < count; i++) {
            const mx = flat[i * 2] / 100, my = flat[i * 2 + 1] / 100;
            const lon = affine.lon[0] * mx + affine.lon[1] * my + affine.lon[2];
            const lat = affine.lat[0] * mx + affine.lat[1] * my + affine.lat[2];
            const point = window.map.project(L.latLng(lat, lon), ZREF);
            xy[i * 2] = point.x; xy[i * 2 + 1] = point.y;
            if (point.x < minX) minX = point.x;
            if (point.x > maxX) maxX = point.x;
            if (point.y < minY) minY = point.y;
            if (point.y > maxY) maxY = point.y;
        }
        return { xy: xy, box: [minX, minY, maxX, maxY] };
    }

    function project(bundle, affine) {
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

    /* ─────────────── 캔버스 레이어 ─────────────── */
    const CadCanvas = L.Layer.extend({
        onAdd: function (map) {
            this._canvas = L.DomUtil.create('canvas', 'techno-cad-canvas');
            this._canvas.style.pointerEvents = 'none';
            this._canvas.style.position = 'absolute';
            map.getPane('overlayPane').appendChild(this._canvas);
            map.on('moveend zoomend resize', this._reset, this);
            map.on('zoomanim', this._animate, this);
            this._reset();
        },
        onRemove: function (map) {
            map.off('moveend zoomend resize', this._reset, this);
            map.off('zoomanim', this._animate, this);
            if (this._canvas && this._canvas.parentNode) {
                this._canvas.parentNode.removeChild(this._canvas);
            }
            this._canvas = null;
        },
        _animate: function (event) {
            // 줌 애니메이션 동안에는 이미 그려 둔 그림을 같이 확대·이동시킨다.
            // 다시 그리면 한 프레임이 통째로 밀린다.
            const map = this._map;
            if (!this._canvas || typeof map._latLngBoundsToNewLayerBounds !== 'function') return;
            const scale = map.getZoomScale(event.zoom);
            const offset = map._latLngBoundsToNewLayerBounds(
                map.getBounds(), event.zoom, event.center).min;
            L.DomUtil.setTransform(this._canvas, offset, scale);
        },
        _reset: function () {
            if (!this._canvas || !this._map) return;
            const map = this._map;
            const size = map.getSize();
            const ratio = window.devicePixelRatio || 1;
            L.DomUtil.setTransform(this._canvas, null, 1);
            L.DomUtil.setPosition(this._canvas, map.containerPointToLayerPoint([0, 0]));
            this._canvas.width = Math.round(size.x * ratio);
            this._canvas.height = Math.round(size.y * ratio);
            this._canvas.style.width = size.x + 'px';
            this._canvas.style.height = size.y + 'px';
            this.draw();
        },
        draw: function () {
            if (!this._canvas || !this._map) return;
            const map = this._map;
            const ratio = window.devicePixelRatio || 1;
            const ctx = this._canvas.getContext('2d');
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

            const floor = window.technoActiveFloor || '1F';
            const data = cache[floor];
            if (!data) return;

            const zoom = map.getZoom();
            const scale = Math.pow(2, zoom - ZREF);
            const origin = map.getPixelOrigin();
            const shift = map.containerPointToLayerPoint([0, 0]);
            const size = map.getSize();
            const offX = origin.x + shift.x, offY = origin.y + shift.y;
            const pad = 40;
            const onScreen = box =>
                !(box[0] * scale - offX > size.x + pad || box[2] * scale - offX < -pad ||
                  box[1] * scale - offY > size.y + pad || box[3] * scale - offY < -pad);

            if (showLines || showRooms) this._drawOutline(ctx, data, scale, offX, offY, onScreen);
            if (showRooms) this._drawRooms(ctx, data, scale, offX, offY, onScreen);
            if (showLines) this._drawLines(ctx, data, zoom, scale, offX, offY, onScreen);
            if (showRooms && zoom >= ROOM_LABEL_ZOOM) {
                this._drawRoomNumbers(ctx, data, zoom, scale, offX, offY, size);
            }
        },
        _trace: function (ctx, entry, scale, offX, offY) {
            const xy = entry.xy;
            ctx.moveTo(xy[0] * scale - offX, xy[1] * scale - offY);
            for (let i = 2; i < xy.length; i += 2) {
                ctx.lineTo(xy[i] * scale - offX, xy[i + 1] * scale - offY);
            }
        },
        _drawLines: function (ctx, data, zoom, scale, offX, offY, onScreen) {
            // 얇은 흰 획을 먼저 깔면 위성지도·흰 바탕 어디서도 선이 읽힌다.
            const width = zoom >= 20 ? 1.4 : zoom >= 19 ? 1.1 : 0.9;
            for (const pass of [
                { colour: 'rgba(255,255,255,0.85)', width: width + 1.6 },
                { colour: 'rgba(15,23,42,0.88)', width: width }
            ]) {
                ctx.strokeStyle = pass.colour;
                ctx.lineWidth = pass.width;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                ctx.setLineDash([]);
                ctx.beginPath();
                for (const path of data.paths) {
                    if (onScreen(path.box)) this._trace(ctx, path, scale, offX, offY);
                }
                ctx.stroke();
            }
        },
        _drawOutline: function (ctx, data, scale, offX, offY, onScreen) {
            // 이 층 건물 외곽선. 멀리서 보면 방 하나하나는 안 보여도 건물이
            // 어디까지인지는 보여야 한다.
            if (!data.outline.length) return;
            ctx.beginPath();
            for (const ring of data.outline) {
                if (!onScreen(ring.box)) continue;
                this._trace(ctx, ring, scale, offX, offY);
                ctx.closePath();
            }
            ctx.strokeStyle = 'rgba(79,70,229,0.9)';
            ctx.lineWidth = 2.6;
            ctx.setLineDash([]);
            ctx.stroke();
        },
        _drawRooms: function (ctx, data, scale, offX, offY, onScreen) {
            // 확정 구획과 검토가 필요한 구획을 실선·점선으로 가른다. 한 구획에
            // 번호가 여럿이거나 방이 잘린 것은 경계를 그대로 믿으면 안 된다.
            for (const solid of [true, false]) {
                ctx.beginPath();
                let any = false;
                for (const room of data.rooms) {
                    if (!room.ring || onScreen(room.ring.box) === false) continue;
                    if ((room.status === 'single_label_candidate') !== solid) continue;
                    this._trace(ctx, room.ring, scale, offX, offY);
                    ctx.closePath();
                    any = true;
                }
                if (!any) continue;
                ctx.fillStyle = solid ? 'rgba(99,102,241,0.10)' : 'rgba(217,119,6,0.10)';
                ctx.fill('evenodd');
                ctx.strokeStyle = solid ? 'rgba(99,102,241,0.75)' : 'rgba(217,119,6,0.85)';
                ctx.lineWidth = 1.6;
                ctx.setLineDash(solid ? [] : [5, 4]);
                ctx.stroke();
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

    function refresh() {
        const map = window.map;
        if (!map) return;
        const visible = nearby();
        const wantCanvas = visible && (showLines || showRooms);
        if (wantCanvas && !map.hasLayer(canvasLayer)) canvasLayer.addTo(map);
        if (!wantCanvas && map.hasLayer(canvasLayer)) map.removeLayer(canvasLayer);

        const wantDoors = visible && showDoors;
        if (wantDoors && !map.hasLayer(doorLayer)) doorLayer.addTo(map);
        if (!wantDoors && map.hasLayer(doorLayer)) map.removeLayer(doorLayer);

        if (!visible) return;
        renderDoors();
        const floor = window.technoActiveFloor || '1F';
        if ((showLines || showRooms) && !cache[floor]) {
            loadFloor(floor).then(() => canvasLayer.draw());
        } else {
            canvasLayer.draw();
        }
    }
    window.refreshTechnoCadLayer = refresh;

    /* ─────────────── 패널 안의 켜고 끄기 ─────────────── */
    function control(id, label, checked, onChange) {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:10px;' +
            'color:var(--text-muted);cursor:pointer;';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.id = id;
        box.checked = checked;
        box.style.cssText = 'width:13px;height:13px;accent-color:#6366f1;cursor:pointer;';
        box.addEventListener('change', () => onChange(box.checked));
        row.appendChild(box);
        row.appendChild(document.createTextNode(label));
        return row;
    }

    function mountUI() {
        const panel = document.getElementById('techno-indoor-panel');
        if (!panel) return false;
        if (document.getElementById('ti-cad-box')) return true;

        const box = document.createElement('div');
        box.id = 'ti-cad-box';
        box.style.cssText = 'padding-top:6px;margin-top:2px;border-top:1px solid rgba(255,255,255,.06);' +
            'display:flex;flex-direction:column;gap:5px;';
        const title = document.createElement('div');
        title.style.cssText = 'font-size:10px;font-weight:800;color:#818cf8;';
        title.textContent = '학교 공식 CAD 도면';
        box.appendChild(title);
        box.appendChild(control('ti-cad-lines', 'CAD 벽·문 선형', showLines, value => {
            showLines = value; refresh();
        }));
        box.appendChild(control('ti-cad-rooms', 'CAD 호실 경계·번호', showRooms, value => {
            showRooms = value; refresh();
        }));
        box.appendChild(control('ti-cad-doors', '외부 출입문', showDoors, value => {
            showDoors = value; refresh();
        }));
        box.appendChild(control('ti-cad-cands', '막힌 출입문 후보까지', showCandidates, value => {
            showCandidates = value; refresh();
        }));

        const note = document.createElement('div');
        note.style.cssText = 'font-size:9px;color:var(--text-muted);line-height:1.5;';
        note.textContent = '호실 번호는 확대하면 나온다. 주황 점선은 CAD 구획이 방 하나와 ' +
            '딱 맞지 않아 검토가 필요한 곳이다.';
        box.appendChild(note);

        // 360 투어 프로토타입. 아직 실사진이 없어 CAD 로 합성한 화면이다.
        const tour = document.createElement('a');
        tour.id = 'ti-cad-tour';
        tour.href = new URL('테크노관-360투어.html', PROJECT_ROOT).href;
        tour.target = '_blank';
        tour.rel = 'noopener';
        tour.textContent = '실내 360 투어 열기 (프로토타입) ↗';
        tour.style.cssText = 'display:block;text-align:center;margin-top:4px;padding:7px 10px;' +
            'border:1px dashed #a78bfa;border-radius:8px;background:rgba(124,58,237,.18);' +
            'color:#ddd6fe;font-size:10px;font-weight:700;text-decoration:none;';
        box.appendChild(tour);

        // 기존 CAD 뷰어 진입 버튼(map-techno-cad-entry.js)이 있으면 그 위에 둔다.
        const entry = document.getElementById('ti-official-cad');
        panel.insertBefore(box, entry || null);
        return true;
    }

    /* ─────────────── 붙이기 ─────────────── */
    function start() {
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
