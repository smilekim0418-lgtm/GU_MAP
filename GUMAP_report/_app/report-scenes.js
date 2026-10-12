/**
 * GUMAP 활동보고서용 주차 스냅샷 — 캡처용 데모 장면
 * ──────────────────────────────────────────────────────────
 * 페이지가 뜨면 그 주차의 대표 기능을 한 화면에 펼쳐 둔다.
 * 캡처할 때 손으로 클릭해 맞출 필요가 없게 하려는 것이다.
 *
 *   ?scene=0        장면 없이 기본 화면
 *   ?scene=이름     다른 장면 (아래 SCENES 의 키)
 *
 * 쓰는 공개 함수는 앱이 원래 가진 것뿐이다 (openTechnoIndoorMap,
 * setTechnoRouteStart, routeInsideTechno, setRoutingPoint, calcRoute …).
 */
(function () {
    'use strict';

    var W = window.GUMAP_WEEK || 99;
    var TECHNO = [36.146643, 128.394348];
    var BUS_TERMINUS = { lat: 36.14313118, lng: 128.3944406, name: '금오공대종점 정류장' };
    var GUMI_STATION = { lat: 36.12981186, lng: 128.3289808, name: '구미역' };

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    function waitFor(test, timeout) {
        var until = Date.now() + (timeout || 15000);
        return new Promise(function (resolve, reject) {
            (function poll() {
                var ok = false;
                try { ok = test(); } catch (e) { ok = false; }
                if (ok) return resolve(ok);
                if (Date.now() > until) return reject(new Error('timeout'));
                setTimeout(poll, 200);
            })();
        });
    }

    /** IMDF 방 번호 → 방 중심 위경도. 층은 "3F" 같은 짧은 이름. */
    function unitCenter(label, floor) {
        var bundle = window.IMDF_TECHNO_DATA;
        if (!bundle) return null;
        var level = bundle.levels.features.find(function (l) {
            return (l.properties.short_name || {})['ko-KR'] === floor;
        });
        if (!level) return null;
        var unit = bundle.units.features.find(function (u) {
            return u.properties.level_id === level.id &&
                   ((u.properties.label || {})['ko-KR'] === label);
        });
        if (!unit || !unit.geometry) return null;
        var ring = unit.geometry.coordinates[0];
        var lat = 0, lng = 0;
        ring.forEach(function (p) { lng += p[0]; lat += p[1]; });
        return { lat: lat / ring.length, lng: lng / ring.length, id: unit.id };
    }

    /** 실내지도 레이어에서 그 방의 팝업을 연다 (방 상세 · IMDF 속성). */
    function openUnitPopup(unitId) {
        var group = window.technoIndoorLayerGroup;
        if (!group) return false;
        var opened = false;
        group.eachLayer(function (layer) {
            if (opened || !layer.eachLayer) return;
            layer.eachLayer(function (inner) {
                // 팝업은 바깥 L.geoJSON 에 걸려 있다
                if (!opened && inner.feature && inner.feature.id === unitId && layer.openPopup) {
                    layer.openPopup(inner.getBounds().getCenter());
                    opened = true;
                }
            });
        });
        return opened;
    }

    function setDest(floor, room) {
        var select = document.getElementById('tr-dest');
        if (select) select.value = floor + '|' + room;
    }

    var SCENES = {
        // 1~4주차: 실외 지도 앱. 구미 시가지와 캠퍼스가 함께 보이게.
        city: function () {
            window.map.setView([36.1335, 128.3700], 14);
        },

        // 5주차: IMDF 실내지도 + 방 상세 팝업
        indoor: async function () {
            window.openTechnoIndoorMap('3F');
            await sleep(900);
            var room = unitCenter('335', '3F') || unitCenter('301', '3F');
            window.map.setView(TECHNO, 19);
            await sleep(700);
            if (room && window._focusTechnoImdfUnit) window._focusTechnoImdfUnit(room.id, '3F');
            await sleep(1500);
            if (room) openUnitPopup(room.id);
        },

        // 6주차: 건물 안 출발 → 다른 층 방 (계단/엘리베이터 경유)
        indoorRoute: async function () {
            window.openTechnoIndoorMap('1F');
            await waitFor(function () { return window.setTechnoRouteStart && document.getElementById('tr-dest'); });
            var from = unitCenter('120', '1F') || unitCenter('101', '1F');
            window.setTechnoRouteStart(from.lat, from.lng, '1F');
            await sleep(300);
            setDest('4F', '435');
            window.routeInsideTechno('435', '4F', {});
            await sleep(600);
            window.map.setView(TECHNO, 19);
        },

        // 7주차: 버스 종점(실외) → 출입구 → 방
        indoorOutdoor: async function () {
            window.openTechnoIndoorMap('1F');
            await waitFor(function () { return window.setRoutingPoint && document.getElementById('tr-dest'); });
            window.setRoutingPoint('START', BUS_TERMINUS.lat, BUS_TERMINUS.lng, BUS_TERMINUS.name);
            await sleep(400);
            window.routeToTechnoRoom('301', (unitCenter('301', '3F') || {}).id);
        },

        // 8주차: 완성본 — CAD 도면 선 + 360 로드뷰 지점 + 통행 제약(212-1 은 212 를 거친다)
        complete: async function () {
            window.openTechnoIndoorMap('2F');
            await waitFor(function () { return document.getElementById('ti-cad-lines') && window.setTechnoRouteStart; }, 20000);
            var acc = document.getElementById('ti-acc-layers');
            if (acc) acc.open = true;
            var from = unitCenter('201', '2F') || unitCenter('203', '2F');
            if (from) window.setTechnoRouteStart(from.lat, from.lng, '2F');
            await sleep(300);
            setDest('2F', '212-1');
            window.routeInsideTechno('212-1', '2F', {});
            await sleep(600);
            var pano = document.getElementById('ti-pano-points');
            if (pano && !pano.checked) pano.click();
            window.map.setView([36.14660, 128.39418], 20);
        },

        // 12주차: 신규 건물(디지털관) 자동 생성 실내지도
        newBuilding: async function () {
            await waitFor(function () { return window.GUMAP_CAMPUS; }, 20000);
            window.GUMAP_CAMPUS.open('digital', '2F');
        },

        // 13주차: 건물 간 연속 길찾기 (디지털관 호실 → 테크노관 호실)
        campus: async function () {
            await waitFor(function () { return window.GUMAP_CAMPUS; }, 20000);
            window.GUMAP_CAMPUS.demoRoute();
        },

        // 14주차: 구미역 → 버스 → 출입구 → 실내
        transit: async function () {
            window.openTechnoIndoorMap('3F');
            await waitFor(function () { return window.setRoutingPoint && document.getElementById('tr-dest'); });
            window.setRoutingPoint('START', GUMI_STATION.lat, GUMI_STATION.lng, GUMI_STATION.name);
            await sleep(400);
            window.routeToTechnoRoom('302', (unitCenter('302', '3F') || {}).id);
            await sleep(5000);
            // 버스 구간부터 실내 구간까지 한 화면에 (좌·우 패널만큼 비켜서)
            window.map.fitBounds(L.latLngBounds([[GUMI_STATION.lat, GUMI_STATION.lng], TECHNO]),
                { paddingTopLeft: [360, 40], paddingBottomRight: [380, 40] });
        },

        // 15주차: 자연어 질의 한 줄
        ai: async function () {
            await waitFor(function () { return window.sendAiMessage; });
            var input = document.getElementById('search-input');
            var question = '구미역에서 테크노관 302호 어떻게 가?';
            if (input) input.value = question;
            window.handleSearchInput();
        }
    };

    var DEFAULT_BY_WEEK = {
        1: 'city', 2: 'city', 3: 'city', 4: 'city',
        5: 'indoor', 6: 'indoorRoute', 7: 'indoorOutdoor',
        8: 'complete', 9: 'complete', 10: 'complete', 11: 'complete',
        12: 'newBuilding', 13: 'campus', 14: 'transit', 15: 'ai'
    };

    var wanted = new URLSearchParams(location.search).get('scene');
    var name = wanted === null ? DEFAULT_BY_WEEK[W] : wanted;
    if (!name || name === '0' || !SCENES[name]) return;

    waitFor(function () { return window.map && window.L; }, 20000)
        .then(function () { return sleep(1200); })
        .then(function () { return SCENES[name](); })
        .catch(function (error) { console.warn('[REPORT] 장면 실행 실패:', name, error); });

    window.GUMAP_SCENES = SCENES;
})();
