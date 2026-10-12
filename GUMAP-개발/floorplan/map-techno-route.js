/**
 * 테크노관 실내 길찾기 — 지도 연동
 * map-techno-route.js
 * ──────────────────────────────────────────────────────────
 * 알고리즘은 map-techno-route-core.js (= 에디터의 techno-route-core.js) 가 갖고,
 * 그래프는 map-techno-nav-data.js (window.TECHNO_NAV_DATA) 가 갖는다.
 * 이 파일은 Leaflet 렌더링과 패널 UI 만 담당한다.
 *
 * 층 전환은 map-techno-indoor.js 의 window.technoActiveFloor 를 따른다.
 * 이 파일은 그 모듈을 고치지 않고, 층이 바뀌었는지만 지켜보다 다시 그린다.
 */
(function () {
    'use strict';

    var engine = null;
    var group = null;
    var start = null;          // {floor, x, y}
    var result = null;
    var pickingStart = false;
    var lastFloor = null;

    var STYLE = {
        halo:  { color: '#0f172a', weight: 11, opacity: 0.35, lineCap: 'round', lineJoin: 'round' },
        line:  { color: '#22d3ee', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' },
        ghost: { color: '#64748b', weight: 3, opacity: 0.35, dashArray: '6,8' },
        outdoor: { color: '#16a34a', weight: 5, opacity: 0.9, dashArray: '10,6',
                   lineCap: 'round' }
    };

    function init() {
        if (!window.TECHNO_NAV_DATA || !window.TechnoRoute) {
            console.warn('[실내길찾기] 그래프 또는 엔진이 로드되지 않았습니다.');
            return false;
        }
        engine = window.TechnoRoute.load(window.TECHNO_NAV_DATA);
        group = L.layerGroup();
        window.technoRouteLayerGroup = group;
        console.log('[실내길찾기] 그래프 로드: 노드 ' +
            window.TECHNO_NAV_DATA.meta.counts.nodes + ' · 엣지 ' +
            window.TECHNO_NAV_DATA.meta.counts.edges);
        return true;
    }

    /* ───────────────────── 공개 API ───────────────────── */

    /** 출발 지점을 지도 좌표로 지정한다. */
    window.setTechnoRouteStart = function (lat, lng, floor) {
        if (!engine) return null;
        outdoorToken++;
        outdoorLoading = false;
        result = null;
        floor = floor || window.technoActiveFloor || '1F';

        // 건물 밖을 눌렀으면 실내 출발점으로 우기지 않는다. 도면 픽셀로
        // 바꿔 두면 엔진이 그 점을 벽 안쪽으로 끌어당기고(pushInside),
        // 실외 구간이 통째로 사라져 문에서부터 경로가 시작돼 버린다.
        if (!insideBuilding(lat, lng)) return useOutdoorStart(lat, lng, null, true);

        var pixels = engine.latLngToPx(floor, lat, lng);
        if (!pixels) return null;
        start = { floor: floor, x: pixels[0], y: pixels[1] };
        outdoorStart = null;
        var spot = engine.locate(floor, pixels[0], pixels[1]);
        if (spot.where === 'unknown' || spot.where === 'outside') {
            if (window.showToast) window.showToast('⚠ 테크노관 ' + floor + ' 안쪽을 눌러 주세요');
        }
        pickingStart = false;
        paintPickButton();
        // 실외 패널의 출발지 칸·핀도 같은 곳을 가리키게 한다
        mirrorStartOutdoors(lat, lng, floor + ' ' +
            (spot.where === 'room' ? spot.room_id : '복도'));
        resetPlayback();

        // 목적지가 이미 정해져 있으면 바로 길을 찾는다.
        // "여기까지 길찾기" → "지도를 클릭하세요" → 클릭 순서로 오면 여기서
        // 이어 주지 않는 한 아무 일도 일어나지 않는다.
        var select = document.getElementById('tr-dest');
        if (select && select.value) {
            runFromControls();
            return spot;
        }
        render();
        return spot;
    };

    /** 목적지 방으로 경로를 계산한다. roomLabel 은 도면 방 번호(예: "301"). */
    window.routeInsideTechno = function (roomLabel, floor, options) {
        if (!engine) { console.warn('[실내길찾기] 엔진 없음'); return null; }
        if (!start && outdoorStart) {
            return runOutdoorRoute({ room_id: roomLabel, floor: floor }, options);
        }
        outdoorToken++;
        outdoorLoading = false;
        if (!start) {
            pickingStart = true;
            if (window.showToast) window.showToast('🧭 출발 위치를 지도에서 눌러 주세요');
            renderPanel();
            paintPickButton();
            return null;
        }
        try {
            result = engine.route(start, { room_id: roomLabel, floor: floor },
                { avoidStairs: !!(options && options.avoidStairs) });
        } catch (error) {
            result = { error: error.message };
        }
        resetPlayback();
        render();
        return result;
    };

    /**
     * 버스·차로 건물 앞까지 온 다음의 실내 구간. 방까지 가장 빠른 출입구에서
     * 출발하는 경로를 그리고 그 출입구({name, floor, latlng})를 돌려준다.
     * 실외 출발지는 건드리지 않는다 - 실외 패널의 대중교통 경로가 그 출발지를
     * 그대로 쓰고, 도착지만 이 출입구로 잡으면 두 경로가 문에서 이어진다.
     */
    window.routeTechnoFromArrival = function (roomLabel, floor, options) {
        if (!engine || !engine.hasEntrances()) return null;
        outdoorToken++;          // 진행 중인 도보 실측이 이 경로를 덮지 않게
        var destination = { room_id: roomLabel, floor: floor };
        var routeOptions = { avoidStairs: !!(options && options.avoidStairs) };
        var best = null;
        engine.entrances().forEach(function (entrance) {
            try {
                var one = engine.route({ outdoor: true, lat: entrance.lat, lng: entrance.lon },
                                       destination, routeOptions);
                if (!best || one.duration_s < best.duration_s) best = one;
            } catch (error) { /* 이 문으로는 방까지 길이 없다 */ }
        });
        var select = document.getElementById('tr-dest');
        if (select) select.value = (floor || '') + '|' + roomLabel;
        settle(best || { error: (floor || '') + ' ' + roomLabel + ' 까지 가는 실내 경로가 없습니다.' });
        return best ? best.entrance : null;
    };

    window.clearTechnoRoute = function () {
        outdoorToken++;
        outdoorLoading = false;
        outdoorStart = null;
        resetPlayback();
        if (play.group && window.map && window.map.hasLayer(play.group)) {
            window.map.removeLayer(play.group);
        }
        start = null;
        result = null;
        pickingStart = false;
        paintPickButton();
        render();
    };

    window.getTechnoRouteResult = function () { return result; };

    /** 실내 출발점을 찍는 중인지. 실외 클릭 팝업이 끼어들지 않게 쓴다. */
    window.isTechnoRoutePicking = function () { return pickingStart; };

    window.getTechnoRouteStart = function () {
        return start ? { floor: start.floor, x: start.x, y: start.y, where: 'indoor' }
                     : (outdoorStart ? { where: 'outdoor', lat: outdoorStart.lat,
                                         lng: outdoorStart.lng, name: outdoorStart.name }
                                     : null);
    };

    /* ─────────────── 실외 출발지/도착지와 하나로 묶기 ───────────────
     *
     * 실외 팝업의 "🛫 출발지"(setRoutingPoint)와 실내 길찾기의 출발점은 서로를
     * 몰라서 따로 놀았다. 허공을 눌러 출발지를 찍고 방 박스에서 "여기까지
     * 길찾기"를 눌러도 아무 일이 없었던 이유다.
     *
     * 이제 출발지는 한 곳에서 관리한다. 어디를 눌렀든:
     *   건물 안  → 실내 출발점으로 잡고, 목적지가 정해져 있으면 바로 길찾기
     *   건물 밖  → 실외 출발지로 두고, 방을 고르면 그 방을 실외 도착지로 잡는다
     *              (외부 출입문이 아직 그래프에 없어 실내 구간은 못 잇는다)
     */

    var outdoorStart = null;      // 건물 밖 출발지 {lat, lng, name}
    var outdoorToken = 0;         // 늦게 온 실외 실측이 새 경로를 덮지 않게
    var outdoorLoading = false;
    var outdoorProgress = null;
    var loadingCard = null;
    var syncing = false;          // setRoutingPoint ↔ setTechnoRouteStart 재귀 방지
    var nativeSetRoutingPoint = null;

    /** 건물 외곽 폴리곤 안인가. IMDF building 링은 [lon, lat] 순서다. */
    function insideBuilding(lat, lng) {
        var bundle = window.IMDF_TECHNO_DATA;
        if (!bundle || !window.TechnoRoute) return false;
        var features = (bundle.building && bundle.building.features) || [];
        if (!features.length || !features[0].geometry) return false;
        var rings = features[0].geometry.coordinates;
        return window.TechnoRoute._geometry.pointInRings(rings, lng, lat);
    }

    /**
     * 건물 밖 출발지를 세운다. 실내 출발점은 버린다.
     *
     * 출발지가 들어오는 문은 둘이다 - 실외 팝업의 "🛫 출발지"(adoptStart)와
     * 지도 클릭(setTechnoRouteStart). 어느 쪽으로 들어오든 밖이면 여기로
     * 모인다. 한쪽만 실외로 분류하던 탓에 지도를 눌러 출발지를 잡으면
     * 실외 구간이 빠졌다.
     *
     * @param mirror 실외 패널의 출발지 칸·핀도 같이 옮길지. 팝업에서 들어온
     *        경우엔 이미 옮겨져 있으므로 다시 부르지 않는다.
     */
    function useOutdoorStart(lat, lng, name, mirror) {
        outdoorToken++;
        outdoorLoading = false;
        result = null;
        outdoorStart = { lat: lat, lng: lng, name: name || '지정한 위치' };
        start = null;
        pickingStart = false;
        paintPickButton();
        if (mirror) mirrorStartOutdoors(lat, lng, outdoorStart.name);
        resetPlayback();

        // 목적지가 이미 정해져 있으면 바로 잇는다. 실내 출발점일 때와 같다.
        var select = document.getElementById('tr-dest');
        if (select && select.value) runFromControls();
        else render();
        return { where: 'outdoor', lat: lat, lng: lng };
    }

    /** 실외에서 찍은 출발지를 실내 쪽으로 받아들인다. */
    function adoptStart(lat, lng, name) {
        if (!engine) return;
        if (!insideBuilding(lat, lng)) {
            useOutdoorStart(lat, lng, name, false);
            return;
        }
        outdoorStart = null;
        // 여러 층이 같은 좌표에 겹쳐 있으므로 "지금 보고 있는 층"으로 본다.
        var floor = window.technoActiveFloor || '1F';
        syncing = true;
        try {
            window.setTechnoRouteStart(lat, lng, floor);
        } finally {
            syncing = false;
        }
    }

    /**
     * 실외 도착지가 다른 곳으로 바뀌면 전에 고른 방과 그 방까지의 실내 경로를 버린다.
     * 남겨 두면 새 경로 옆에 옛 실내 경로가 그대로 보이고, 다음에 출발지를 바꿀 때
     * (useOutdoorStart → runFromControls) 그 방까지 경로를 다시 그렸다.
     * 버스로 와서 들어갈 출입구를 도착지로 잡는 경우(routeTechnoFromArrival 다음)는 그대로 둔다.
     */
    function forgetRoomUnlessEntrance(lat, lng) {
        var door = result && !result.error && result.entrance && result.entrance.latlng;
        if (door && Math.abs(door[0] - lat) < 1e-7 && Math.abs(door[1] - lng) < 1e-7) return;
        var select = document.getElementById('tr-dest');
        if (select) select.value = '';
        if (!result && !outdoorLoading) return;
        outdoorToken++;
        outdoorLoading = false;
        result = null;
        resetPlayback();
        render();
    }

    /** 실외 setRoutingPoint 를 감싸 출발지를 공유한다. map-click.js 가 나중에
     *  로드되므로 존재를 확인한 뒤 한 번만 감싼다. */
    function wrapRoutingPoint() {
        if (typeof window.setRoutingPoint !== 'function') return;
        if (window.setRoutingPoint.__gumapWrapped) return;
        nativeSetRoutingPoint = window.setRoutingPoint;
        var wrapped = function (type, lat, lng, name) {
            var outcome = nativeSetRoutingPoint.apply(this, arguments);
            if (type === 'START' && !syncing) adoptStart(lat, lng, name);
            if (type === 'END' && !syncing) forgetRoomUnlessEntrance(lat, lng);
            return outcome;
        };
        wrapped.__gumapWrapped = true;
        window.setRoutingPoint = wrapped;
    }

    /** 실내 출발점을 실외 패널에도 반영한다 (핀 · 출발지 칸). */
    function mirrorStartOutdoors(lat, lng, label) {
        if (syncing || typeof nativeSetRoutingPoint !== 'function') return;
        syncing = true;
        try {
            nativeSetRoutingPoint('START', lat, lng, label);
        } finally {
            syncing = false;
        }
    }

    /* ───────────────────── 렌더링 ───────────────────── */

    function renderLoadingCard() {
        if (!outdoorLoading || !outdoorProgress) {
            if (loadingCard) loadingCard.remove();
            loadingCard = null;
            return;
        }
        if (!window.map || !window.map.getContainer) return;
        if (!loadingCard) {
            loadingCard = document.createElement('div');
            loadingCard.className = 'techno-route-loading';
            loadingCard.setAttribute('role', 'status');
            loadingCard.setAttribute('aria-live', 'polite');
            loadingCard.innerHTML =
                '<span class="tr-loading-spinner" aria-hidden="true"></span>' +
                '<div class="tr-loading-copy"><strong>걸어서 가는 길을 찾고 있어요</strong>' +
                '<span class="tr-loading-destination"></span>' +
                '<span class="tr-loading-caption">교내 보행로와 출입구를 확인하고 있어요</span>' +
                '<div class="tr-loading-track" role="progressbar" aria-label="출입구 경로 확인" ' +
                'aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div></div>' +
                '<button type="button" class="tr-loading-cancel">취소</button>';
            loadingCard.querySelector('button').addEventListener('click', function () {
                window.clearTechnoRoute();
            });
            if (L.DomEvent) L.DomEvent.disableClickPropagation(loadingCard);
            window.map.getContainer().appendChild(loadingCard);
        }
        loadingCard.querySelector('.tr-loading-destination').textContent =
            '도착 · ' + outdoorProgress.label;
        var percent = outdoorProgress.total
            ? Math.round(outdoorProgress.completed / outdoorProgress.total * 100) : 0;
        loadingCard.querySelector('.tr-loading-track').setAttribute('aria-valuenow', String(percent));
        loadingCard.querySelector('.tr-loading-track i').style.width = percent + '%';
        if (outdoorProgress.completed) {
            loadingCard.querySelector('.tr-loading-caption').textContent =
                '출입구 ' + outdoorProgress.completed + ' / ' + outdoorProgress.total + '곳 확인';
        }
    }


    function render() {
        if (!group || !window.map) return;
        group.clearLayers();
        if (!window.map.hasLayer(group)) group.addTo(window.map);
        lastFloor = window.technoActiveFloor;
        renderLoadingCard();

        var floor = window.technoActiveFloor || '1F';

        if (outdoorStart && !(window.startMarker && window.map.hasLayer(window.startMarker))) {
            group.addLayer(L.circleMarker([outdoorStart.lat, outdoorStart.lng], {
                radius: 8, color: '#fff', weight: 3,
                fillColor: '#22c55e', fillOpacity: 1
            }).bindTooltip('출발', { permanent: true, direction: 'top', className: 'techno-route-tip' }));
        }

        if (start && start.floor === floor) {
            group.addLayer(L.circleMarker(engine.pxToLatLng(floor, start.x, start.y), {
                radius: 8, color: '#fff', weight: 3,
                fillColor: '#22c55e', fillOpacity: 1
            }).bindTooltip('출발', { permanent: true, direction: 'top', className: 'techno-route-tip' }));
        }

        if (outdoorLoading && outdoorProgress && outdoorProgress.latlng) {
            group.addLayer(L.circleMarker(outdoorProgress.latlng, {
                radius: 10, color: '#fff', weight: 3,
                fillColor: '#ef4444', fillOpacity: 0.85,
                className: 'techno-route-pending-pin'
            }).bindTooltip('도착 · ' + outdoorProgress.label, {
                permanent: true, direction: 'top', className: 'techno-route-tip'
            }));
        }

        if (!result || result.error) { renderPanel(); return; }

        result.legs.forEach(function (leg) {
            if (leg.mode === 'outdoor') {
                // 건물 밖 구간은 어느 층에서 보든 그린다
                var outdoorLine = leg.latlngs.filter(Boolean);
                if (outdoorLine.length >= 2) {
                    group.addLayer(L.polyline(outdoorLine, STYLE.outdoor));
                }
                return;
            }
            if (leg.mode !== 'walk') return;
            var latlngs = leg.latlngs.filter(Boolean);
            if (latlngs.length < 2) return;
            if (leg.floor === floor) {
                group.addLayer(L.polyline(latlngs, STYLE.halo));
                group.addLayer(L.polyline(latlngs, STYLE.line));
            } else {
                group.addLayer(L.polyline(latlngs, STYLE.ghost));   // 다른 층 구간은 흐리게
            }
        });

        // 들어가는 문. 실외 구간 끝에 찍는다.
        if (result.entrance && result.entrance.latlng) {
            group.addLayer(L.circleMarker(result.entrance.latlng, {
                radius: 9, color: '#fff', weight: 3,
                fillColor: '#16a34a', fillOpacity: 1
            }).bindTooltip('🚪 ' + result.entrance.name,
                { permanent: true, direction: 'right', className: 'techno-route-tip' }));
        }

        result.legs.forEach(function (leg) {
            // outdoor 는 층간 이동이 아니다. 걸러 내지 않으면 to_floor 가 없어
            // "🛗 서쪽 출입구 (1F) → null" 같은 표가 붙는다.
            if (leg.mode === 'walk' || leg.mode === 'outdoor') return;
            var icon = leg.mode === 'stairs' ? '🪜' : '🛗';
            if (leg.floor === floor && leg.latlngs[0]) {
                group.addLayer(L.circleMarker(leg.latlngs[0], {
                    radius: 9, color: '#fff', weight: 3, fillColor: '#f59e0b', fillOpacity: 1
                }).bindTooltip(icon + ' ' + leg.name + ' → ' + leg.to_floor,
                    { permanent: true, direction: 'right', className: 'techno-route-tip' }));
            }
            if (leg.to_floor === floor && leg.latlngs[1]) {
                group.addLayer(L.circleMarker(leg.latlngs[1], {
                    radius: 9, color: '#fff', weight: 3, fillColor: '#f59e0b', fillOpacity: 1
                }).bindTooltip(icon + ' ' + leg.name + ' 에서 내림',
                    { permanent: true, direction: 'right', className: 'techno-route-tip' }));
            }
        });

        if (result.destination.floor === floor && result.destination.latlng) {
            group.addLayer(L.circleMarker(result.destination.latlng, {
                radius: 9, color: '#fff', weight: 3, fillColor: '#ef4444', fillOpacity: 1
            }).bindTooltip('🎯 ' + result.destination.room_id +
                (result.destination.kind === 'estimated' ? ' (추정 진입점)' : ' 문'),
                { permanent: true, direction: 'top', className: 'techno-route-tip' }));
        }

        renderPanel();
    }

    /* ───────────────────── 경로 재생 ───────────────────── */
    //
    // 실제 소요시간대로 틀면 2분짜리 경로를 2분 동안 봐야 한다. 대신 지도상
    // 이동 속도를 보행의 약 10배로 고정해서, 거리에 비례하되 볼 만한 길이가
    // 되게 한다 (100m ≈ 8초). 계단·엘리베이터 대기는 실제로는 20~30초지만
    // 재생에서는 짧게 끊는다 - 기다리는 시간을 그대로 보여줄 이유가 없다.

    var PLAY_METERS_PER_SECOND = 12.0;
    var PLAY_VERTICAL_SECONDS = 1.4;
    var PLAY_SPEEDS = [1, 2, 4];

    var play = {
        timeline: null,
        total: 0,
        elapsed: 0,
        running: false,
        speed: 1,
        frame: null,
        lastTick: 0,
        group: null,
        marker: null,
        floor: null
    };

    /** 경로를 재생용 구간 목록으로 편다. */
    function buildTimeline(route) {
        var steps = [];
        var total = 0;
        route.legs.forEach(function (leg) {
            if (leg.mode === 'outdoor') {
                // 실외 구간은 도면 픽셀이 없다. 길이 비율을 위경도로 잡는다.
                // 여기서 걸러 내지 않으면 아래 else 로 떨어져 계단 취급을 받는다.
                var walked = (leg.latlngs || []).filter(Boolean);
                if (walked.length < 2) return;
                var outSpans = [];
                var outSum = 0;
                for (var k = 1; k < walked.length; k++) {
                    var span = Math.hypot(walked[k][0] - walked[k - 1][0],
                                          walked[k][1] - walked[k - 1][1]);
                    outSpans.push(span);
                    outSum += span;
                }
                if (outSum <= 0) return;
                var outDuration = Math.max(0.4, leg.distance_m / PLAY_METERS_PER_SECOND);
                steps.push({
                    kind: 'walk', floor: leg.floor, points: walked, spans: outSpans,
                    spanTotal: outSum, start: total, duration: outDuration,
                    label: '건물 밖 이동 ' + leg.distance_m.toFixed(0) + 'm' +
                           (leg.name ? ' → ' + leg.name : '')
                });
                total += outDuration;
                return;
            }
            if (leg.mode === 'walk') {
                var points = (leg.latlngs || []).filter(Boolean);
                if (points.length < 2) return;
                // 구간별 길이 비율은 픽셀 좌표로 잡는다 (같은 층 안에서는 미터와 비례)
                var spans = [];
                var sum = 0;
                for (var i = 1; i < leg.points.length; i++) {
                    var dx = leg.points[i][0] - leg.points[i - 1][0];
                    var dy = leg.points[i][1] - leg.points[i - 1][1];
                    var d = Math.hypot(dx, dy);
                    spans.push(d);
                    sum += d;
                }
                if (sum <= 0) return;
                var duration = Math.max(0.4, leg.distance_m / PLAY_METERS_PER_SECOND);
                steps.push({
                    kind: 'walk', floor: leg.floor, points: points, spans: spans,
                    spanTotal: sum, start: total, duration: duration,
                    label: leg.floor + ' 복도 이동 ' + leg.distance_m.toFixed(0) + 'm'
                });
                total += duration;
            } else {
                var at = (leg.latlngs && leg.latlngs[0]) || null;
                var to = (leg.latlngs && leg.latlngs[1]) || at;
                steps.push({
                    kind: 'vertical', floor: leg.floor, toFloor: leg.to_floor,
                    at: at, to: to, start: total, duration: PLAY_VERTICAL_SECONDS,
                    label: leg.name + (leg.mode === 'stairs' ? ' 계단' : ' 엘리베이터') +
                           ' · ' + leg.floor + ' → ' + leg.to_floor
                });
                total += PLAY_VERTICAL_SECONDS;
            }
        });
        return { steps: steps, total: total };
    }

    /** 재생 시각 → 위치·층·설명. */
    function positionAt(seconds) {
        var steps = play.timeline.steps;
        for (var i = 0; i < steps.length; i++) {
            var step = steps[i];
            if (seconds > step.start + step.duration && i < steps.length - 1) continue;
            var ratio = step.duration > 0
                ? Math.min(1, Math.max(0, (seconds - step.start) / step.duration)) : 1;
            if (step.kind === 'vertical') {
                // 절반을 넘기면 도착 층에 있는 것으로 본다
                return {
                    latlng: ratio < 0.5 ? step.at : step.to,
                    floor: ratio < 0.5 ? step.floor : step.toFloor,
                    label: step.label, index: i
                };
            }
            var want = ratio * step.spanTotal;
            var run = 0;
            for (var s = 0; s < step.spans.length; s++) {
                if (run + step.spans[s] >= want || s === step.spans.length - 1) {
                    var inner = step.spans[s] > 0 ? (want - run) / step.spans[s] : 0;
                    inner = Math.min(1, Math.max(0, inner));
                    var a = step.points[s], b = step.points[s + 1] || step.points[s];
                    return {
                        latlng: [a[0] + (b[0] - a[0]) * inner, a[1] + (b[1] - a[1]) * inner],
                        floor: step.floor, label: step.label, index: i,
                        trail: step.points.slice(0, s + 1).concat([
                            [a[0] + (b[0] - a[0]) * inner, a[1] + (b[1] - a[1]) * inner]
                        ])
                    };
                }
                run += step.spans[s];
            }
        }
        return null;
    }

    /** 패널의 층 버튼을 눌러 층을 바꾼다 (실내지도 모듈의 로직을 그대로 쓴다). */
    function switchFloor(floor) {
        if (!floor || floor === window.technoActiveFloor) return;
        var button = document.querySelector('.ti-fbtn[data-floor="' + floor + '"]');
        if (button) {
            button.click();
        } else {
            window.technoActiveFloor = floor;
            if (window.renderTechnoFloor) window.renderTechnoFloor();
        }
    }

    function ensurePlayGroup() {
        if (!play.group) {
            play.group = L.layerGroup();
            window.technoRoutePlayGroup = play.group;
        }
        if (window.map && !window.map.hasLayer(play.group)) play.group.addTo(window.map);
        return play.group;
    }

    /** 걷는 사람이 화면 밖으로 나가려 할 때만 지도를 옮긴다. */
    function keepInView(latlng) {
        if (!window.map) return;
        var bounds = window.map.getBounds().pad(-0.25);
        if (!bounds.contains(L.latLng(latlng[0], latlng[1]))) {
            window.map.panTo(latlng, { animate: true, duration: 0.4 });
        }
    }

    function drawPlayback() {
        if (!play.timeline) return;
        var spot = positionAt(play.elapsed);
        if (!spot) return;

        if (spot.floor && spot.floor !== play.floor) {
            play.floor = spot.floor;
            switchFloor(spot.floor);
        }

        var group = ensurePlayGroup();
        group.clearLayers();

        if (spot.trail && spot.trail.length > 1) {
            group.addLayer(L.polyline(spot.trail,
                { color: '#22c55e', weight: 6, opacity: 0.95, lineCap: 'round' }));
        }
        if (!play.marker) {
            play.marker = L.marker(spot.latlng, {
                icon: L.divIcon({
                    className: 'techno-route-walker',
                    html: '<div style="font-size:20px;line-height:1;filter:drop-shadow(0 1px 3px rgba(0,0,0,.5));">🚶</div>',
                    iconSize: [22, 22], iconAnchor: [11, 11]
                }),
                interactive: false, zIndexOffset: 1000
            });
        } else {
            play.marker.setLatLng(spot.latlng);
        }
        group.addLayer(play.marker);
        keepInView(spot.latlng);
        renderPlayBar(spot);
    }

    function renderPlayBar(spot) {
        var bar = document.getElementById('tr-play-progress');
        if (bar) {
            bar.style.width = (play.total > 0 ? (play.elapsed / play.total) * 100 : 0) + '%';
        }
        var label = document.getElementById('tr-play-label');
        if (label && spot) label.textContent = spot.label;
        var button = document.getElementById('tr-play');
        if (button) button.textContent = play.running ? '⏸ 일시정지' : '▶ 재생';
    }

    function tick(now) {
        if (!play.running) return;
        var delta = (now - play.lastTick) / 1000;
        play.lastTick = now;
        play.elapsed += delta * play.speed;
        if (play.elapsed >= play.total) {
            play.elapsed = play.total;
            play.running = false;
            drawPlayback();
            renderPlayBar(positionAt(play.elapsed));
            return;
        }
        drawPlayback();
        play.frame = requestAnimationFrame(tick);
    }

    window.playTechnoRoute = function () {
        if (!result || result.error) return;
        if (!play.timeline) {
            play.timeline = buildTimeline(result);
            play.total = play.timeline.total;
        }
        if (play.total <= 0) return;
        if (play.elapsed >= play.total) play.elapsed = 0;
        play.running = true;
        play.lastTick = performance.now();
        play.frame = requestAnimationFrame(tick);
        drawPlayback();
    };

    window.pauseTechnoRoute = function () {
        play.running = false;
        if (play.frame) cancelAnimationFrame(play.frame);
        renderPlayBar(play.timeline ? positionAt(play.elapsed) : null);
    };

    window.toggleTechnoRoutePlay = function () {
        if (play.running) window.pauseTechnoRoute();
        else window.playTechnoRoute();
    };

    window.restartTechnoRoute = function () {
        play.elapsed = 0;
        if (result && !result.error) {
            play.timeline = buildTimeline(result);
            play.total = play.timeline.total;
            if (result.legs.length) switchFloor(result.legs[0].floor);
            play.floor = result.legs.length ? result.legs[0].floor : null;
        }
        window.playTechnoRoute();
    };

    window.setTechnoRouteSpeed = function (speed) {
        play.speed = speed;
        var host = document.getElementById('tr-play-speeds');
        if (!host) return;
        Array.prototype.forEach.call(host.querySelectorAll('button'), function (button) {
            var on = Number(button.dataset.speed) === speed;
            button.style.background = on ? '#0891b2' : 'rgba(127,127,127,.12)';
            button.style.color = on ? '#fff' : 'var(--text-main)';
        });
    };

    function resetPlayback() {
        window.pauseTechnoRoute();
        play.timeline = null;
        play.total = 0;
        play.elapsed = 0;
        play.floor = null;
        play.marker = null;
        if (play.group) play.group.clearLayers();
    }

    /* ───────────────────── 패널 ───────────────────── */

    function panelElement() {
        var host = document.getElementById('techno-indoor-panel');
        if (!host) return null;
        ensureControls(host);
        var box = document.getElementById('techno-route-box');
        if (!box) {
            box = document.createElement('div');
            box.id = 'techno-route-box';
            box.style.cssText = 'margin-top:4px;font-size:11px;color:var(--text-main);';
            host.appendChild(box);
        }
        return box;
    }

    /** 실내지도 패널 안에 길찾기 조작부를 한 번만 만든다. */
    function ensureControls(host) {
        // 패널은 높이 제한이 없어서, 경로 안내가 길어지면 화면 아래로 잘려
        // 나갔다 (예: "출발 · 2F 지정 위치" 아래가 통째로 안 보임).
        // 뷰포트를 넘지 않게 잡고 넘치면 스크롤시킨다.
        host.style.maxHeight = 'calc(100vh - 95px)';
        host.style.overflowY = 'auto';
        host.style.overscrollBehavior = 'contain';
        // 패널 위에서 굴린 휠이 지도 줌으로 새지 않게 한다
        if (!host.__gumapWheelGuard && window.L && L.DomEvent) {
            L.DomEvent.disableScrollPropagation(host);
            host.__gumapWheelGuard = true;
        }

        if (document.getElementById('techno-route-controls')) return;

        var block = document.createElement('div');
        block.id = 'techno-route-controls';
        block.style.cssText =
            'border-top:1px solid rgba(255,255,255,.08);padding-top:8px;font-size:11px;';
        block.innerHTML =
            '<div style="font-size:10px;color:var(--text-muted);font-weight:700;margin-bottom:6px;">' +
              '실내 길찾기 (ROUTE)</div>' +
            '<button id="tr-pick" style="width:100%;padding:6px;margin-bottom:5px;border-radius:8px;' +
              'border:1.5px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);' +
              'color:var(--text-main);font-size:11px;font-weight:700;cursor:pointer;">' +
              '📍 출발 위치 지정</button>' +
            '<input id="tr-filter" type="text" placeholder="목적지 호실 검색…" ' +
              'style="width:100%;padding:6px 8px;margin-bottom:5px;background:rgba(255,255,255,.06);' +
              'border:1px solid rgba(255,255,255,.12);border-radius:8px;color:var(--text-main);' +
              'font-size:11px;outline:none;box-sizing:border-box;">' +
            '<select id="tr-dest" size="1" style="width:100%;padding:6px;margin-bottom:5px;' +
              'background:var(--bg-input,#0f172a);border:1px solid var(--border-panel,rgba(255,255,255,.12));border-radius:8px;' +
              'color:var(--text-main);font-size:11px;box-sizing:border-box;"></select>' +
            '<label style="display:flex;align-items:center;gap:5px;color:var(--text-muted);margin-bottom:6px;">' +
              '<input type="checkbox" id="tr-avoid"> 계단 회피 (배리어프리)</label>' +
            '<button id="tr-go" style="width:100%;padding:7px;border-radius:8px;border:none;' +
              'background:linear-gradient(135deg,#0891b2,#22d3ee);color:#062a33;font-size:12px;' +
              'font-weight:800;cursor:pointer;">길찾기</button>';

        // 결과 상자보다 위에 오게 넣는다
        var box = document.getElementById('techno-route-box');
        if (box) host.insertBefore(block, box);
        else host.appendChild(block);

        fillDestinations();

        var pick = document.getElementById('tr-pick');
        pick.addEventListener('click', function () {
            pickingStart = !pickingStart;
            paintPickButton();
            if (pickingStart && window.showToast) {
                window.showToast('🧭 지도에서 출발 위치를 눌러 주세요 (' +
                    (window.technoActiveFloor || '1F') + ' 기준)');
            }
        });
        document.getElementById('tr-go').addEventListener('click', runFromControls);
        document.getElementById('tr-dest').addEventListener('change', function () {
            if (start || outdoorStart) runFromControls();
        });
        document.getElementById('tr-avoid').addEventListener('change', function () {
            if ((start || outdoorStart) && (outdoorLoading || (result && !result.error))) runFromControls();
        });
        document.getElementById('tr-filter').addEventListener('input', function () {
            fillDestinations(this.value.trim());
        });
        paintPickButton();
    }

    function paintPickButton() {
        var pick = document.getElementById('tr-pick');
        if (!pick) return;
        if (pickingStart) {
            pick.textContent = '📍 지도를 클릭하세요…';
            pick.style.background = '#0891b2';
            pick.style.color = '#fff';
            pick.style.borderColor = '#22d3ee';
        } else {
            pick.textContent = start
                ? '📍 출발: ' + start.floor + ' (다시 지정)'
                : '📍 출발 위치 지정';
            pick.style.background = 'rgba(255,255,255,.05)';
            pick.style.color = 'var(--text-main)';
            pick.style.borderColor = 'rgba(255,255,255,.12)';
        }
    }

    /** 목적지 목록. 검색어가 있으면 걸러서 채운다. */
    function fillDestinations(filter) {
        var select = document.getElementById('tr-dest');
        if (!select || !engine) return;
        var keep = select.value;
        var rooms = engine.rooms();
        if (filter) {
            var needle = filter.toLowerCase();
            rooms = rooms.filter(function (row) {
                return (row.floor + ' ' + row.room_id).toLowerCase().indexOf(needle) >= 0;
            });
        }
        var byFloor = {};
        rooms.forEach(function (row) {
            (byFloor[row.floor] || (byFloor[row.floor] = [])).push(row);
        });
        // 맨 앞에 빈 선택지를 둔다. 없으면 첫 방(B1F B101)이 기본값이 되어, 실외에서
        // 출발지를 찍을 때마다(지도 클릭·내 위치) B101 까지 가는 길찾기가 저절로 돌았다.
        select.innerHTML = rooms.length
            ? '<option value="">도착 호실 선택</option>' + engine.floors().filter(function (floor) { return byFloor[floor]; })
                .map(function (floor) {
                    return '<optgroup label="' + floor + '">' +
                        byFloor[floor].map(function (row) {
                            return '<option value="' + floor + '|' + row.room_id + '">' +
                                row.room_id +
                                (row.corridor_doors === 0 ? ' (문 미등록·추정)' : '') +
                                '</option>';
                        }).join('') + '</optgroup>';
                }).join('')
            : '<option value="">일치하는 호실 없음</option>';
        if (keep) {
            select.value = keep;
            if (!select.value && select.options.length) select.selectedIndex = filter && rooms.length ? 1 : 0;
        } else if (filter && rooms.length) {
            select.selectedIndex = 1;   // 검색했으면 첫 결과를 바로 고른다
        }
    }

    function runFromControls() {
        var select = document.getElementById('tr-dest');
        if (!select || !select.value) {
            if (window.showToast) window.showToast('목적지 호실을 골라 주세요');
            return;
        }
        var parts = select.value.split('|');
        var avoid = document.getElementById('tr-avoid');

        // 밖에서 출발했으면 실외 구간부터 이어 준다. 방 박스의 "여기까지
        // 길찾기" 만 이 일을 하고 있어서, 패널에서 목적지를 고르면 실외
        // 구간이 빠졌다. 어느 쪽으로 오든 판단은 여기 한 곳에서 한다.
        if (!start && outdoorStart && engine && engine.hasEntrances()) {
            runOutdoorRoute({ room_id: parts[1], floor: parts[0] });
            return;
        }
        window.routeInsideTechno(parts[1], parts[0], { avoidStairs: avoid && avoid.checked });
    }

    function renderPanel() {
        var box = panelElement();
        if (!box) return;

        if (outdoorLoading) {
            box.innerHTML = '<div role="status" aria-live="polite" ' +
                'style="padding:8px;border-top:1px solid rgba(255,255,255,.1);">' +
                '보행 경로를 불러오는 중입니다…</div>';
            return;
        }

        if (!result || result.error) {
            var idle;
            if (result && result.error) {
                idle = '<span style="color:#b91c1c;">경로 없음 · ' +
                       escapeHtml(result.error) + '</span>';
            } else if (pickingStart) {
                idle = '<span style="color:#b45309;">🧭 출발 위치를 지도에서 눌러 주세요</span>';
            } else if (outdoorStart && engine && engine.hasEntrances()) {
                idle = '<span style="color:var(--text-muted);">🚶 출발지가 건물 밖입니다 (' +
                       escapeHtml(outdoorStart.name) + ')<br>' +
                       '방을 고르면 가장 빨리 닿는 출입구로 들어가는 경로를 만듭니다.</span>';
            } else if (outdoorStart) {
                // 출입구가 아직 하나도 없으면 실내로 이을 방법이 없다.
                // 이 상태를 숨기지 말고 무엇을 하면 되는지까지 알린다.
                idle = '<span style="color:#b45309;">🚧 출발지가 건물 밖입니다 (' +
                       escapeHtml(outdoorStart.name) + ')<br>' +
                       '아직 등록된 건물 출입구가 없습니다. 에디터에서 문을 그리고 ' +
                       '연결을 <b>복도, 외부</b> 로 지정하면 여기까지 이어집니다.</span>';
            } else {
                idle = '<span style="color:var(--text-muted);">' +
                       '실내 길찾기: 출발 지점을 찍고 방을 고르세요</span>';
            }
            box.innerHTML =
                '<div style="padding:8px;border-top:1px solid rgba(255,255,255,.1);">' +
                idle + '</div>';
            return;
        }

        var minutes = Math.max(1, Math.round(result.duration_s / 60));
        box.innerHTML =
            '<div style="padding:8px;border-top:1px solid rgba(255,255,255,.1);">' +
              '<div style="font-size:16px;font-weight:800;color:#0891b2;">' +
                result.distance_m.toFixed(0) + 'm · 약 ' + minutes + '분</div>' +
              '<div style="color:var(--text-muted);margin:2px 0 6px;">도착 · ' +
                escapeHtml(result.destination.floor) + ' ' +
                escapeHtml(result.destination.room_id) +
                (result.destination.kind === 'estimated' ? ' (추정 진입점)' : ' 문 앞') + '</div>' +
              '<ol style="margin:0;padding-left:16px;line-height:1.6;">' +
                result.steps.map(function (step) {
                    var vertical = step.indexOf('계단 이용') >= 0 ||
                                   step.indexOf('엘리베이터 이용') >= 0;
                    if (step.indexOf('건물 밖에서') === 0) {
                        return '<li style="color:#15803d;font-weight:700;">' +
                               escapeHtml(step) + '</li>';
                    }
                    return '<li style="' + (vertical ? 'color:#b45309;font-weight:700;' : '') +
                           '">' + escapeHtml(step) + '</li>';
                }).join('') +
              '</ol>' +
              (result.warnings.length
                ? '<div style="color:#b91c1c;margin-top:6px;">⚠ ' +
                  result.warnings.map(escapeHtml).join('<br>⚠ ') + '</div>' : '') +
              // 경로 재생
              '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.1);">' +
                '<div style="display:flex;gap:4px;margin-bottom:5px;">' +
                  '<button id="tr-play" onclick="window.toggleTechnoRoutePlay()" ' +
                    'style="flex:2;padding:6px;border-radius:6px;border:none;' +
                    'background:linear-gradient(135deg,#0891b2,#22d3ee);color:#062a33;' +
                    'font-weight:800;cursor:pointer;">▶ 재생</button>' +
                  '<button onclick="window.restartTechnoRoute()" title="처음부터" ' +
                    'style="flex:1;padding:6px;border-radius:6px;border:1px solid rgba(127,127,127,.3);' +
                    'background:rgba(127,127,127,.12);color:var(--text-main);cursor:pointer;">↺</button>' +
                '</div>' +
                '<div style="height:5px;background:rgba(127,127,127,.25);border-radius:3px;overflow:hidden;">' +
                  '<div id="tr-play-progress" style="height:100%;width:0%;background:#22c55e;' +
                    'transition:width .1s linear;"></div>' +
                '</div>' +
                '<div id="tr-play-label" style="font-size:10px;color:var(--text-muted);margin-top:4px;' +
                  'min-height:13px;">재생하면 출발지부터 따라갑니다</div>' +
                '<div id="tr-play-speeds" style="display:flex;gap:4px;margin-top:5px;">' +
                  PLAY_SPEEDS.map(function (speed) {
                    return '<button data-speed="' + speed + '" ' +
                      'onclick="window.setTechnoRouteSpeed(' + speed + ')" ' +
                      'style="flex:1;padding:3px;font-size:10px;border-radius:5px;' +
                      'border:1px solid rgba(127,127,127,.3);cursor:pointer;' +
                      (speed === play.speed
                        ? 'background:#0891b2;color:#fff;'
                        : 'background:rgba(127,127,127,.12);color:var(--text-main);') +
                      '">' + speed + '×</button>';
                  }).join('') +
                '</div>' +
              '</div>' +
              '<button onclick="window.clearTechnoRoute()" style="margin-top:8px;width:100%;' +
                'padding:5px;border-radius:6px;border:1px solid rgba(255,255,255,.15);' +
                'background:rgba(127,127,127,.12);color:var(--text-main);cursor:pointer;">경로 지우기</button>' +
            '</div>';
    }

    function escapeHtml(text) {
        return String(text).replace(/[&<>"']/g, function (character) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;',
                      '"': '&quot;', "'": '&#39;' })[character];
        });
    }

    /* ───────────────────── 지도 연결 ───────────────────── */

    /** 방 팝업의 "🧭 여기까지 길찾기" 를 실내 길찾기로 연결한다.
     *
     * map-techno-indoor.js 의 원래 구현은 실외 검색창을 채우고 실외 경로
     * 패널을 여는 게 전부라, 실내에서 누르면 아무 일도 일어나지 않는 것처럼
     * 보였다. 그 모듈을 고치는 대신 여기서 감싼다 (로드 순서상 indoor.js 가
     * 먼저 뜨므로 안전하다). 테크노관 방이 아니면 원래 동작으로 넘긴다.
     */
    function hookRoomButton() {
        var fallback = window.routeToTechnoRoom;
        window.routeToTechnoRoom = function (roomName, unitId) {
            var floor = floorOfUnit(unitId) || window.technoActiveFloor;
            var room = findRoom(roomName, floor);

            if (engine && !room) {
                // 복도·계단·엘리베이터처럼 방이 아닌 공간을 누른 경우.
                // 목적지로 삼을 수 없다고 말해 주고 끝낸다.
                if (window.showToast) {
                    window.showToast('🚧 ' + roomName + ' 은(는) 목적지로 지정할 수 없습니다 ' +
                        '(방만 가능)');
                }
                return null;
            }
            if (!room) {
                // 테크노관 방이 아니면 원래 동작으로. 실외 경로 패널은 경로가
                // 없을 때 터지는 일이 있어 여기서 막는다.
                if (typeof fallback !== 'function') return null;
                try {
                    return fallback.apply(this, arguments);
                } catch (error) {
                    console.warn('[실내길찾기] 실외 길찾기 폴백 실패:', error);
                    return null;
                }
            }

            var host = document.getElementById('techno-indoor-panel');
            if (host) ensureControls(host);
            var select = document.getElementById('tr-dest');
            if (select) {
                var filter = document.getElementById('tr-filter');
                if (filter) { filter.value = ''; fillDestinations(); }
                select.value = room.floor + '|' + room.room_id;
            }
            if (window.map) window.map.closePopup();

            // 건물 밖에서 출발했고 출입구가 등록돼 있으면, 실외 구간부터
            // 방 문 앞까지 한 번에 잇는다.
            if (!start && outdoorStart && engine.hasEntrances()) {
                return runOutdoorRoute(room);
            }

            if (!start && outdoorStart) {
                if (typeof nativeSetRoutingPoint === 'function') {
                    var doorway = roomLatLng(room);
                    if (doorway) {
                        syncing = true;
                        try {
                            nativeSetRoutingPoint('END', doorway[0], doorway[1],
                                '테크노관 ' + room.floor + ' ' + room.room_id);
                        } finally {
                            syncing = false;
                        }
                    }
                }
                if (window.showToast) {
                    window.showToast('🚧 건물 밖에서 출발했습니다. 도착지를 테크노관 ' +
                        room.floor + ' ' + room.room_id + ' 로 잡았지만, 외부 출입문이 ' +
                        '아직 등록되지 않아 실내 구간은 잇지 못합니다');
                }
                renderPanel();
                return null;
            }

            if (!start) {
                pickingStart = true;
                paintPickButton();
                renderPanel();
                if (window.showToast) {
                    window.showToast('🧭 목적지 ' + room.floor + ' ' + room.room_id +
                        ' · 이제 출발 위치를 지도에서 눌러 주세요');
                }
                return null;
            }
            return window.routeInsideTechno(room.room_id, room.floor, {
                avoidStairs: !!(document.getElementById('tr-avoid') || {}).checked
            });
        };
    }


    /* ─────────────── 실외 구간: 지도의 보행자 길찾기 ─────────────── */

    // 건물만 피해 도는 어림 경로는 도로도 다른 건물도 모른다. 잔디밭과
    // 옆 건물을 가로질러 거의 직선으로 간다. 지도가 이미 쓰는 보행자
    // 보행 전용 도로망(OSRM foot, 실패 시 TMAP)으로 실외 구간을 재 온다.
    var WALK_CANDIDATES = 3;      // 보행 서버에서 요청 간격과 캐시를 관리한다
    var walkCache = {};

    function walkCacheKey(from, to) {
        return from[0].toFixed(5) + ',' + from[1].toFixed(5) + '>' +
               to[0].toFixed(5) + ',' + to[1].toFixed(5);
    }

    /** 두 점 사이 보행자 경로. 실패하면 null 을 주고 재시도할 수 있게 한다. */
    function fetchWalk(from, to) {
        var key = walkCacheKey(from, to);
        if (walkCache[key]) return walkCache[key];

        var fetcher = window.fetchTmapWithOSRMFallback;
        // PROXY_URL 은 3000번 포트에서 일부러 빈 문자열이다(같은 출처 상대경로).
        // 빈 문자열을 "없음" 으로 보면 정작 본서버에서만 안 돈다.
        if (typeof fetcher !== 'function' || typeof window.PROXY_URL !== 'string') {
            return Promise.resolve(null);
        }
        var payload = {
            startX: from[1], startY: from[0],
            endX: to[1], endY: to[0],
            reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO',
            startName: encodeURIComponent('출발'), endName: encodeURIComponent('출입구')
        };
        var pending = fetcher(window.PROXY_URL + '/tmap-routes?endpoint=pedestrian&version=1',
                              payload, 'walk')
            .then(function (data) {
                if (!data || !data.features) return null;
                var latlngs = [];
                var meters = 0;
                data.features.forEach(function (feature) {
                    if (feature.properties && feature.properties.totalDistance) {
                        meters = feature.properties.totalDistance;
                    }
                    if (feature.geometry && feature.geometry.type === 'LineString') {
                        feature.geometry.coordinates.forEach(function (point) {
                            latlngs.push([point[1], point[0]]);
                        });
                    }
                });
                if (latlngs.length < 2) return null;
                if (!meters) meters = polylineMeters(latlngs);
                // API는 입력 좌표를 가까운 길 위로 옮긴다. 실제 출발점과 문까지
                // 남은 연결 구간도 그려야 출발 핀에서 떨어진 곳부터 시작하지 않는다.
                var first = latlngs[0];
                var last = latlngs[latlngs.length - 1];
                meters += engine.metersBetween(from[0], from[1], first[0], first[1]);
                meters += engine.metersBetween(last[0], last[1], to[0], to[1]);
                latlngs.unshift(from.slice());
                latlngs.push(to.slice());
                return { meters: meters, path: latlngs };
            })
            .catch(function (error) {
                console.warn('[실내길찾기] 실외 보행자 경로 조회 실패:', error);
                return null;
            })
            .then(function (walk) {
                if (!walk) delete walkCache[key];
                return walk;
            });
        walkCache[key] = pending;
        return pending;
    }

    function polylineMeters(latlngs) {
        var total = 0;
        for (var i = 1; i < latlngs.length; i++) {
            total += engine.metersBetween(latlngs[i - 1][0], latlngs[i - 1][1],
                                          latlngs[i][0], latlngs[i][1]);
        }
        return total;
    }

    /**
     * 후보 출입구 몇 개만 실제로 재 와서 {노드: {meters, path}} 로 돌려준다.
     * 하나도 못 재면 null - 실제 경로를 표시하지 않고 재시도를 안내한다.
     */
    function measureApproaches(from, destination, options, token) {
        var candidates = [];
        try {
            candidates = engine.entranceCandidates(from[0], from[1], destination,
                                                   options, WALK_CANDIDATES);
        } catch (error) {
            return Promise.resolve(null);
        }
        if (!candidates.length) return Promise.resolve(null);
        if (token === outdoorToken && outdoorProgress) {
            outdoorProgress.total = candidates.length;
            renderLoadingCard();
        }

        return Promise.all(candidates.map(function (row) {
            return fetchWalk(from, [row.entrance.lat, row.entrance.lon])
                .then(function (walk) {
                    if (token === outdoorToken && outdoorLoading && outdoorProgress) {
                        outdoorProgress.completed++;
                        renderLoadingCard();
                    }
                    return walk ? { node: row.entrance.node, walk: walk } : null;
                });
        })).then(function (rows) {
            var measured = {};
            var any = false;
            rows.forEach(function (row) {
                if (!row) return;
                measured[row.node] = row.walk;
                any = true;
            });
            if (!any) return null;
            // 재 보지 않은 문은 후보에서 뺀다. 어림값과 실측값을 섞어 비교하면
            // 안 잰 문이 부당하게 짧아 보여서 그리로 가 버린다.
            (engine.entrances() || []).forEach(function (entrance) {
                if (!measured[entrance.node]) {
                    measured[entrance.node] = { meters: 1e7, path: null };
                }
            });
            return measured;
        });
    }

    /** 건물 밖 출발지 → 가장 빨리 닿는 출입구 → 방. 문 선택은 엔진이 한다. */
    function runOutdoorRoute(room, routeOptions) {
        var from = [outdoorStart.lat, outdoorStart.lng];
        var destination = { room_id: room.room_id, floor: room.floor };
        var options = { avoidStairs: routeOptions
            ? !!routeOptions.avoidStairs
            : !!(document.getElementById('tr-avoid') || {}).checked };

        // API가 반환하기 전에는 출발 핀과 로딩 안내만 표시한다.
        // 건물만 피하는 임시 경로가 먼저 보였다가 바뀌는 일을 막는다.
        var token = ++outdoorToken;
        outdoorLoading = true;
        var targetRoom = engine.rooms().find(function (item) {
            return item.room_id === room.room_id && item.floor === room.floor;
        }) || room;
        outdoorProgress = {
            label: room.floor + ' ' + room.room_id,
            latlng: roomLatLng(targetRoom), completed: 0, total: 0
        };
        result = null;
        resetPlayback();
        render();


        Promise.resolve().then(function () {
            if (token !== outdoorToken) return null;
            return measureApproaches(from, destination, options, token);
        }).then(function (measured) {
            if (token !== outdoorToken) return;
            if (!measured) {
                throw new Error('보행 경로를 불러오지 못했습니다. 잠시 후 다시 길찾기를 눌러 주세요.');
            }
            var completed = engine.route({ outdoor: true, lat: from[0], lng: from[1] },
                                         destination,
                                         Object.assign({}, options, { approaches: measured }));
            settle(completed);
            fitOutdoorRoute();
        }).catch(function (error) {
            if (token !== outdoorToken) return;
            settle({ error: error.message });
            if (window.showToast) window.showToast(error.message);
        });
        return null;
    }

    // 실내 방을 고를 때 확대된 화면에서도 건물 밖 출발점부터 보이게 한다.
    // 경로가 완성될 때 한 번만 조정하고 층 전환 때는 다시 옮기지 않는다.
    function fitOutdoorRoute() {
        if (!window.map || !result || result.error) return;
        var points = [];
        result.legs.forEach(function (leg) {
            (leg.latlngs || []).forEach(function (point) {
                if (point) points.push(point);
            });
        });
        if (points.length < 2) return;
        window.map.fitBounds(L.latLngBounds(points), {
            padding: [60, 60], maxZoom: 19
        });
    }

    function settle(next) {
        outdoorLoading = false;
        result = next;
        resetPlayback();
        // 들어간 출입구가 있는 층을 먼저 보여 준다
        if (result && !result.error && result.entrance) {
            switchFloor(result.entrance.floor);
        }
        render();
    }

    /** 방의 대표 위경도. 복도 문이 있으면 그 문, 없으면 방 중심. */
    function roomLatLng(room) {
        if (!engine) return null;
        var doors = engine.corridorDoors(room.floor, room.room_id);
        if (doors.length) {
            var node = engine.nodes[doors[0]];
            return engine.pxToLatLng(room.floor, node.x, node.y);
        }
        var centre = room.centroid;
        return centre ? engine.pxToLatLng(room.floor, centre[0], centre[1]) : null;
    }

    /** IMDF 유닛 id → 층 짧은 이름 (예: "3F"). */
    function floorOfUnit(unitId) {
        var bundle = window.IMDF_TECHNO_DATA;
        if (!bundle || !unitId) return null;
        var unit = (bundle.units.features || []).find(function (u) { return u.id === unitId; });
        if (!unit) return null;
        var level = (bundle.levels.features || []).find(function (l) {
            return l.id === unit.properties.level_id;
        });
        if (!level) return null;
        var name = level.properties.short_name;
        return name ? (name['ko-KR'] || name.en || null) : null;
    }

    /** 팝업이 넘겨준 이름으로 그래프의 방을 찾는다. 방 번호가 우선이다. */
    function findRoom(roomName, floor) {
        if (!engine || !roomName) return null;
        var label = String(roomName).trim();
        var rooms = engine.rooms();
        var exact = rooms.filter(function (row) { return row.room_id === label; });
        if (exact.length === 1) return exact[0];
        if (exact.length > 1 && floor) {
            var onFloor = exact.filter(function (row) { return row.floor === floor; });
            if (onFloor.length) return onFloor[0];
        }
        if (exact.length) return exact[0];
        // 이름이 방 번호가 아니면(예: "전자공학실") 층 안에서 번호가 섞여 있는지 본다
        if (floor) {
            var guess = rooms.filter(function (row) {
                return row.floor === floor && label.indexOf(row.room_id) >= 0;
            });
            if (guess.length === 1) return guess[0];
        }
        return null;
    }

    function attach() {
        if (!window.map || !engine) return;

        hookRoomButton();
        wrapRoutingPoint();

        window.map.on('click', function (event) {
            if (!pickingStart) return;
            window.setTechnoRouteStart(event.latlng.lat, event.latlng.lng,
                                       window.technoActiveFloor);
        });

        // 실내지도 패널은 건물에 충분히 가까워졌을 때 비로소 만들어진다.
        // 그때 조작부를 끼워 넣고, 층 전환도 함께 지켜본다.
        setInterval(function () {
            wrapRoutingPoint();
            var host = document.getElementById('techno-indoor-panel');
            if (host && !document.getElementById('techno-route-controls')) {
                ensureControls(host);
                renderPanel();
            }
            if (window.technoActiveFloor !== lastFloor && (start || result)) render();
        }, 400);
    }

    function style() {
        if (document.getElementById('techno-route-style')) return;
        var tag = document.createElement('style');
        tag.id = 'techno-route-style';
        tag.textContent =
            '.leaflet-tooltip.techno-route-tip{background:#0ea5e9;color:#fff;border:none;' +
            'font-weight:700;font-size:11px;padding:2px 7px;border-radius:5px;box-shadow:none;}' +
            '.leaflet-tooltip.techno-route-tip::before{display:none;}';
        tag.textContent +=
            '.techno-route-loading{position:absolute;left:50%;bottom:32px;transform:translateX(-50%);' +
            'z-index:1100;display:flex;align-items:center;gap:12px;width:360px;max-width:calc(100% - 32px);' +
            'box-sizing:border-box;padding:15px 16px;border-radius:16px;' +
            'background:var(--bg-panel,#fff);color:var(--text-main,#0f172a);' +
            'border:1px solid var(--border-panel,#e2e8f0);box-shadow:0 8px 30px rgba(15,23,42,.2);}' +
            '.tr-loading-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;}' +
            '.tr-loading-copy strong{font-size:13px;}.tr-loading-destination{font-size:12px;}' +
            '.tr-loading-caption{font-size:11px;color:var(--text-muted,#64748b);}' +
            '.tr-loading-spinner{flex-shrink:0;width:22px;height:22px;border:3px solid #a5f3fc;' +
            'border-top-color:#0891b2;border-radius:50%;animation:tr-loading-spin .9s linear infinite;}' +
            '.tr-loading-track{height:4px;border-radius:4px;overflow:hidden;background:rgba(8,145,178,.15);margin-top:3px;}' +
            '.tr-loading-track i{display:block;height:100%;width:0;background:#0891b2;transition:width .25s ease;}' +
            '.tr-loading-cancel{min-width:44px;min-height:44px;border:0;border-radius:9px;cursor:pointer;' +
            'background:rgba(8,145,178,.1);color:inherit;font-size:12px;}' +
            '.techno-route-pending-pin{animation:tr-loading-pulse 1.5s ease-in-out infinite;}' +
            '@keyframes tr-loading-spin{to{transform:rotate(360deg);}}' +
            '@keyframes tr-loading-pulse{50%{opacity:.4;}}' +
            '@media(max-width:600px){.techno-route-loading{bottom:84px;padding:12px;}}' +
            '@media(prefers-reduced-motion:reduce){.tr-loading-spinner,.techno-route-pending-pin{animation:none;}' +
            '.tr-loading-track i{transition:none;}}';
        document.head.appendChild(tag);
    }

    function boot() {
        if (!init()) return;
        style();
        if (window.map) attach();
        else {
            var timer = setInterval(function () {
                if (!window.map) return;
                clearInterval(timer);
                attach();
            }, 300);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
