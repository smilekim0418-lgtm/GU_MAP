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
        ghost: { color: '#64748b', weight: 3, opacity: 0.35, dashArray: '6,8' }
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
        floor = floor || window.technoActiveFloor || '1F';
        var pixels = engine.latLngToPx(floor, lat, lng);
        if (!pixels) return null;
        start = { floor: floor, x: pixels[0], y: pixels[1] };
        var spot = engine.locate(floor, pixels[0], pixels[1]);
        if (spot.where === 'unknown' || spot.where === 'outside') {
            if (window.showToast) window.showToast('⚠ 테크노관 ' + floor + ' 안쪽을 눌러 주세요');
        }
        pickingStart = false;
        paintPickButton();
        render();
        return spot;
    };

    /** 목적지 방으로 경로를 계산한다. roomLabel 은 도면 방 번호(예: "301"). */
    window.routeInsideTechno = function (roomLabel, floor, options) {
        if (!engine) { console.warn('[실내길찾기] 엔진 없음'); return null; }
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
        render();
        return result;
    };

    window.clearTechnoRoute = function () {
        start = null;
        result = null;
        pickingStart = false;
        paintPickButton();
        render();
    };

    window.getTechnoRouteResult = function () { return result; };

    /* ───────────────────── 렌더링 ───────────────────── */

    function render() {
        if (!group || !window.map) return;
        group.clearLayers();
        if (!window.map.hasLayer(group)) group.addTo(window.map);
        lastFloor = window.technoActiveFloor;

        var floor = window.technoActiveFloor || '1F';

        if (start && start.floor === floor) {
            group.addLayer(L.circleMarker(engine.pxToLatLng(floor, start.x, start.y), {
                radius: 8, color: '#fff', weight: 3,
                fillColor: '#22c55e', fillOpacity: 1
            }).bindTooltip('출발', { permanent: true, direction: 'top', className: 'techno-route-tip' }));
        }

        if (!result || result.error) { renderPanel(); return; }

        result.legs.forEach(function (leg) {
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

        result.legs.forEach(function (leg) {
            if (leg.mode === 'walk') return;
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
            if (start) runFromControls();
        });
        document.getElementById('tr-avoid').addEventListener('change', function () {
            if (start && result && !result.error) runFromControls();
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
        select.innerHTML = rooms.length
            ? engine.floors().filter(function (floor) { return byFloor[floor]; })
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
            if (!select.value && select.options.length) select.selectedIndex = 0;
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
        window.routeInsideTechno(parts[1], parts[0], { avoidStairs: avoid && avoid.checked });
    }

    function renderPanel() {
        var box = panelElement();
        if (!box) return;

        if (!result || result.error) {
            box.innerHTML =
                '<div style="padding:8px;border-top:1px solid rgba(255,255,255,.1);">' +
                (result && result.error
                    ? '<span style="color:#b91c1c;">경로 없음 · ' + escapeHtml(result.error) + '</span>'
                    : (pickingStart
                        ? '<span style="color:#b45309;">🧭 출발 위치를 지도에서 눌러 주세요</span>'
                        : '<span style="color:var(--text-muted);">실내 길찾기: 출발 지점을 찍고 방을 고르세요</span>')) +
                '</div>';
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
                    return '<li style="' + (vertical ? 'color:#b45309;font-weight:700;' : '') +
                           '">' + escapeHtml(step) + '</li>';
                }).join('') +
              '</ol>' +
              (result.warnings.length
                ? '<div style="color:#b91c1c;margin-top:6px;">⚠ ' +
                  result.warnings.map(escapeHtml).join('<br>⚠ ') + '</div>' : '') +
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

    function attach() {
        if (!window.map || !engine) return;

        window.map.on('click', function (event) {
            if (!pickingStart) return;
            window.setTechnoRouteStart(event.latlng.lat, event.latlng.lng,
                                       window.technoActiveFloor);
        });

        // 실내지도 패널은 건물에 충분히 가까워졌을 때 비로소 만들어진다.
        // 그때 조작부를 끼워 넣고, 층 전환도 함께 지켜본다.
        setInterval(function () {
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
