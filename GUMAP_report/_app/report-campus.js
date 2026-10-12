/**
 * 12~13주차 — 신규 건물 실내지도(AI 초안) + 캠퍼스 통합 길찾기
 * ──────────────────────────────────────────────────────────
 * 데이터: window.GUMAP_CAMPUS_DATA   (report-campus-data.js, 12주차~)
 *         window.GUMAP_CAMPUS_GRAPH  (report-campus-graph.js, 13주차~)
 * 둘 다 _tools/ax 파이프라인이 만든 것이다. 이 파일은 그리기와 패널만 맡는다.
 *
 * 공개 API (report-scenes.js 가 쓴다)
 *   GUMAP_CAMPUS.open(id, floor)      건물 실내지도 초안 열기
 *   GUMAP_CAMPUS.close()
 *   GUMAP_CAMPUS.route(from, to)      {b:'digital', key:'1F|101'} → {b:'techno', key:'3F|302'}
 *   GUMAP_CAMPUS.demoRoute()
 */
(function () {
    'use strict';

    var DATA = window.GUMAP_CAMPUS_DATA;
    if (!DATA || !DATA.buildings || !DATA.buildings.length) return;
    var W = window.GUMAP_WEEK || 99;

    var byId = {};
    DATA.buildings.forEach(function (b) { byId[b.id] = b; });

    var state = { id: null, floor: null, onlyReview: false };
    var badgeGroup, floorGroup, routeGroup, panel;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /* ───────────── 스타일 ───────────── */
    function style() {
        var css = document.createElement('style');
        css.textContent =
            '#campus-panel{position:absolute;top:20px;right:78px;z-index:1002;width:300px;max-height:calc(100vh - 110px);' +
            'overflow:auto;padding:14px 16px;border-radius:18px;font-size:12px;color:var(--text-main);}' +
            '#campus-panel h3{margin:0;font-size:15px;font-weight:800;display:flex;align-items:center;gap:8px}' +
            '#campus-panel .sub{font-size:11px;color:var(--text-muted);margin:3px 0 10px}' +
            '#campus-panel .chip{display:inline-block;padding:1px 7px;border-radius:7px;font-size:10.5px;font-weight:800}' +
            '#campus-panel .floors{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0}' +
            '#campus-panel .floors button{flex:1 0 34px;padding:6px 0;border-radius:9px;border:1px solid var(--border-panel);' +
            'background:var(--bg-input);color:var(--text-main);font-weight:800;cursor:pointer}' +
            '#campus-panel .floors button.on{background:#7c3aed;color:#fff;border-color:#7c3aed}' +
            '#campus-panel .floors button:disabled{opacity:.35;cursor:not-allowed}' +
            '#campus-panel .stat{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin:8px 0}' +
            '#campus-panel .stat div{background:var(--bg-input);border:1px solid var(--border-panel);border-radius:9px;padding:6px;text-align:center}' +
            '#campus-panel .stat b{display:block;font-size:16px}' +
            '#campus-panel .lg{display:flex;flex-wrap:wrap;gap:8px;font-size:10.5px;color:var(--text-muted);margin:6px 0}' +
            '#campus-panel .lg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:3px;vertical-align:-1px}' +
            '#campus-panel select{width:100%;padding:6px;border-radius:8px;border:1px solid var(--border-panel);background:var(--bg-input);color:var(--text-main);font-size:11.5px;margin-bottom:5px}' +
            '#campus-panel .go{width:100%;padding:8px;border:none;border-radius:9px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-weight:800;cursor:pointer}' +
            '#campus-panel ol{margin:6px 0 0;padding-left:18px;line-height:1.65}' +
            '#campus-panel .close{margin-left:auto;background:none;border:none;font-size:16px;cursor:pointer;color:var(--text-muted)}' +
            '.campus-badge button{background:#7c3aed;border:2px solid #fff;color:#fff;padding:8px 12px;border-radius:20px;' +
            'font-size:11.5px;font-weight:800;white-space:nowrap;box-shadow:0 3px 12px rgba(0,0,0,.25);cursor:pointer}' +
            '.campus-label{background:none;border:none;font-size:10.5px;font-weight:800;color:#14532d;text-shadow:0 0 3px #fff,0 0 3px #fff;white-space:nowrap}' +
            '.campus-label.rev{color:#b45309}' +
            'body.indoor-open #campus-panel{display:none}';
        document.head.appendChild(css);
    }

    /* ───────────── 건물 배지 (실외 확대 16~) ───────────── */
    function badges() {
        badgeGroup = L.layerGroup();
        DATA.buildings.forEach(function (b) {
            if (!b.floors.length) return;
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = '🏢 ' + b.name + ' · 실내지도 (AI 초안)';
            btn.addEventListener('click', function (e) { e.stopPropagation(); api.open(b.id); });
            badgeGroup.addLayer(L.marker(b.center, {
                keyboard: false, bubblingMouseEvents: false,
                icon: L.divIcon({ className: 'campus-badge', html: btn, iconSize: [210, 40], iconAnchor: [105, 20] })
            }));
            badgeGroup.addLayer(L.polygon(b.osm, { color: '#7c3aed', weight: 2, fillOpacity: 0.08, dashArray: '5,4' }));
        });
        function vis() {
            var z = window.map.getZoom();
            var show = z >= 16 && !state.id;
            if (show && !window.map.hasLayer(badgeGroup)) badgeGroup.addTo(window.map);
            if (!show && window.map.hasLayer(badgeGroup)) window.map.removeLayer(badgeGroup);
            if (state.id && floorGroup) {
                var labels = z >= 19;
                floorGroup.eachLayer(function (l) { if (l.options && l.options.isLabel) l.setOpacity(labels ? 1 : 0); });
            }
        }
        window.map.on('zoomend moveend', vis);
        vis();
    }

    /* ───────────── 층 그리기 ───────────── */
    function drawFloor() {
        if (floorGroup) window.map.removeLayer(floorGroup);
        floorGroup = L.layerGroup().addTo(window.map);
        var b = byId[state.id];
        var f = b.floors.find(function (x) { return x.floor === state.floor; });
        if (!f) return;
        f.units.forEach(function (u) {
            if (u.k === 'corridor') {
                floorGroup.addLayer(L.polygon(u.g, { color: '#94a3b8', weight: 1, fillColor: '#cbd5e1', fillOpacity: 0.55 }));
                return;
            }
            var auto = u.r === 'auto';
            if (state.onlyReview && auto) return;
            var poly = L.polygon(u.g, {
                color: auto ? '#15803d' : '#d97706', weight: auto ? 1.2 : 2, dashArray: auto ? null : '5,4',
                fillColor: auto ? '#86efac' : '#fdba74', fillOpacity: auto ? 0.5 : 0.55
            });
            poly.bindPopup('<div style="min-width:190px;font-size:12px">' +
                '<b style="font-size:14px">' + esc(u.l || '번호 미판독') + '</b> <span style="color:#64748b">' + esc(b.name) + ' ' + esc(f.floor) + '</span><br>' +
                (auto ? '<span style="color:#15803d;font-weight:800">자동 확정</span>' : '<span style="color:#b45309;font-weight:800">검수 필요</span>') +
                ' · 신뢰도 ' + Math.round((u.c || 0) * 100) + '%<br><span style="color:#64748b">' + esc((u.why || []).join(' · ')) + '</span></div>');
            floorGroup.addLayer(poly);
            if (u.l) {
                var lat = 0, lon = 0;
                u.g.forEach(function (p) { lat += p[0]; lon += p[1]; });
                floorGroup.addLayer(L.marker([lat / u.g.length, lon / u.g.length], {
                    isLabel: true, interactive: false, keyboard: false,
                    icon: L.divIcon({ className: 'campus-label' + (auto ? '' : ' rev'), html: esc(u.l), iconSize: [44, 14], iconAnchor: [22, 7] })
                }));
            }
        });
        f.stairs.forEach(function (ring) {
            floorGroup.addLayer(L.polygon(ring, { color: '#a21caf', weight: 2, fillColor: '#f0abfc', fillOpacity: 0.5 })
                .bindTooltip('계단 (자동 검출)'));
        });
        f.doors.forEach(function (d) {
            floorGroup.addLayer(L.circleMarker(d.p, { radius: 3, weight: 1, color: '#fff',
                fillColor: d.e ? '#f59e0b' : '#16a34a', fillOpacity: 1 }).bindTooltip(d.e ? '추정 출입문 (검수)' : '검출 출입문'));
        });
        f.exits.forEach(function (p) {
            floorGroup.addLayer(L.circleMarker(p, { radius: 6, weight: 2, color: '#fff', fillColor: '#dc2626', fillOpacity: 1 })
                .bindTooltip('비상구 표지 (출입구 후보)'));
        });
        var z = window.map.getZoom();
        floorGroup.eachLayer(function (l) { if (l.options && l.options.isLabel) l.setOpacity(z >= 19 ? 1 : 0); });
    }

    /* ───────────── 패널 ───────────── */
    function counts(b) {
        var auto = 0, rev = 0;
        b.floors.forEach(function (f) {
            f.units.forEach(function (u) { if (u.k !== 'corridor') { if (u.r === 'auto') auto++; else rev++; } });
        });
        return { auto: auto, rev: rev };
    }

    function renderPanel(extraHtml) {
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'campus-panel';
            panel.className = 'glass-panel';
            document.body.appendChild(panel);
            if (L.DomEvent) { L.DomEvent.disableClickPropagation(panel); L.DomEvent.disableScrollPropagation(panel); }
        }
        var b = byId[state.id];
        var c = counts(b);
        var order = ['B1F', '1F', '2F', '3F', '4F', '5F', '6F'];
        var have = {};
        b.floors.forEach(function (f) { have[f.floor] = true; });
        var f = b.floors.find(function (x) { return x.floor === state.floor; }) || {};
        var g = f.georef || {};
        var gtxt = g.route === 'auto'
            ? 'OSM 외곽선 자동 정합 IoU ' + (g.iou || 0).toFixed(2)
            : (g.route === 'manual' ? '검수자 기준점 ' + g.control_points + '점 · RMSE ' + g.rmse_m + 'm' : '');
        panel.innerHTML =
            '<h3>🏢 ' + esc(b.name) + ' <span class="chip" style="background:#ede9fe;color:#6d28d9">AI 초안</span>' +
            '<button class="close" title="닫기">✕</button></h3>' +
            '<div class="sub">피난안내도 사진 → 자동 실내지도 · ' + esc(gtxt) + '</div>' +
            '<div class="stat"><div><b style="color:#15803d">' + c.auto + '</b>자동 확정</div>' +
            '<div><b style="color:#b45309">' + c.rev + '</b>검수 필요</div><div><b>' + b.floors.length + '</b>층</div></div>' +
            '<div class="floors">' + order.map(function (fl) {
                return '<button data-f="' + fl + '"' + (fl === state.floor ? ' class="on"' : '') + (have[fl] ? '' : ' disabled title="층 정렬 검수 중"') + '>' +
                    (fl === 'B1F' ? 'B1' : fl.replace('F', '')) + '</button>';
            }).join('') + '</div>' +
            '<div class="lg"><span><i style="background:#86efac"></i>자동 확정</span><span><i style="background:#fdba74;outline:1px dashed #d97706"></i>검수 필요</span>' +
            '<span><i style="background:#cbd5e1"></i>복도</span><span><i style="background:#f0abfc"></i>계단</span>' +
            '<span><i style="background:#dc2626;border-radius:50%"></i>비상구</span></div>' +
            '<label style="display:flex;gap:6px;align-items:center;color:var(--text-muted)"><input type="checkbox" id="campus-only-review"' +
            (state.onlyReview ? ' checked' : '') + '> 검수 항목만 보기</label>' +
            (b.hidden_floors && b.hidden_floors.length ? '<div class="sub" style="margin-top:6px">⚠ ' + b.hidden_floors.join('·') + ' 은 층 정렬 실패로 검수 대기 (지도 미표시)</div>' : '') +
            (W >= 13 && window.GUMAP_CAMPUS_GRAPH ? routeForm() : '') +
            (extraHtml || '');
        panel.querySelector('.close').onclick = function () { api.close(); };
        panel.querySelectorAll('.floors button').forEach(function (btn) {
            btn.onclick = function () { state.floor = btn.dataset.f; drawFloor(); renderPanel(extraHtml); };
        });
        panel.querySelector('#campus-only-review').onchange = function () {
            state.onlyReview = this.checked; drawFloor();
        };
        var go = panel.querySelector('#campus-go');
        if (go) go.onclick = function () {
            var a = panel.querySelector('#campus-from').value.split('::');
            var z = panel.querySelector('#campus-to').value.split('::');
            api.route({ b: a[0], key: a[1] }, { b: z[0], key: z[1] });
        };
    }

    function roomOptions(bid, pick) {
        var rooms = (window.GUMAP_CAMPUS_GRAPH.rooms || {})[bid] || {};
        var name = window.GUMAP_CAMPUS_GRAPH.names[bid];
        return Object.keys(rooms).sort().map(function (k) {
            var v = bid + '::' + k;
            return '<option value="' + v + '"' + (v === pick ? ' selected' : '') + '>' + name + ' ' + k.replace('|', ' ') + '</option>';
        }).join('');
    }

    function routeForm() {
        return '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border-panel)">' +
            '<div style="font-weight:800;margin-bottom:6px">🧭 캠퍼스 길찾기 (건물 간 연속 안내)</div>' +
            '<select id="campus-from">' + roomOptions('digital', 'digital::1F|101') + roomOptions('techno') + '</select>' +
            '<select id="campus-to">' + roomOptions('techno', 'techno::3F|302') + roomOptions('digital') + '</select>' +
            '<button class="go" id="campus-go">경로 찾기</button></div>';
    }

    /* ───────────── 캠퍼스 통합 경로망 길찾기 (13주차) ───────────── */
    var adj = null;
    function buildAdj() {
        var G = window.GUMAP_CAMPUS_GRAPH;
        adj = G.nodes.map(function () { return []; });
        G.edges.forEach(function (e) {
            adj[e[0]].push([e[1], e[2], e[3], e[4]]);
            adj[e[1]].push([e[0], e[2], e[3], e[4]]);
        });
        adj.outdoor = {};
        G.outdoor.forEach(function (o) {
            adj.outdoor[o.from + '>' + o.to] = o.coords;
            adj.outdoor[o.to + '>' + o.from] = o.coords.slice().reverse();
        });
    }

    function dijkstra(sources, targets) {
        var n = window.GUMAP_CAMPUS_GRAPH.nodes.length;
        var best = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), pmode = new Array(n), pm = new Float64Array(n);
        var heap = [];
        function push(c, v) { heap.push([c, v]); var i = heap.length - 1; while (i) { var p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; var t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } }
        function pop() { var top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; var i = 0; for (;;) { var l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; var t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } } return top; }
        var tset = {};
        targets.forEach(function (t) { tset[t] = true; });
        sources.forEach(function (s) { best[s] = 0; push(0, s); });
        while (heap.length) {
            var top = pop(), c = top[0], u = top[1];
            if (c > best[u]) continue;
            if (tset[u]) {
                var path = [u];
                while (prev[path[path.length - 1]] >= 0) path.push(prev[path[path.length - 1]]);
                path.reverse();
                return { seconds: c, path: path, mode: pmode, meters: pm };
            }
            adj[u].forEach(function (e) {
                var nc = c + e[1];
                if (nc < best[e[0]]) { best[e[0]] = nc; prev[e[0]] = u; pmode[e[0]] = e[3]; pm[e[0]] = e[2]; push(nc, e[0]); }
            });
        }
        return null;
    }

    var BNAME = { t: '테크노관', d: '디지털관', g: '글로벌관' };
    var COLOR = { t: '#0891b2', d: '#7c3aed', g: '#db2777', o: '#16a34a' };

    function segments(res) {
        var G = window.GUMAP_CAMPUS_GRAPH, segs = [];
        res.path.forEach(function (n, i) {
            var node = G.nodes[n], mode = i ? res.mode[n] : 'w';
            var key = mode === 'o' ? 'o' : node[2] + '|' + node[3] + '|' + (mode === 's' || mode === 'e' ? mode : 'w');
            var coords = [[node[0], node[1]]];
            if (mode === 'o') coords = (adj.outdoor[res.path[i - 1] + '>' + n] || [[G.nodes[res.path[i - 1]][0], G.nodes[res.path[i - 1]][1]], [node[0], node[1]]]);
            var last = segs[segs.length - 1];
            if (last && last.key === key) {
                last.coords = last.coords.concat(coords); last.m += i ? res.meters[n] : 0;
            } else {
                var start = i && mode !== 'o' ? [[G.nodes[res.path[i - 1]][0], G.nodes[res.path[i - 1]][1]]] : [];
                segs.push({ key: key, b: mode === 'o' ? 'o' : node[2], f: node[3], mode: mode, coords: start.concat(coords), m: i ? res.meters[n] : 0 });
            }
        });
        return segs;
    }

    function stepText(segs, from, to) {
        var G = window.GUMAP_CAMPUS_GRAPH, out = [];
        out.push('출발 · ' + G.names[from.b] + ' ' + from.key.replace('|', ' '));
        segs.forEach(function (s) {
            if (s.mode === 'o') out.push('<b style="color:#15803d">건물 밖 도보 ' + Math.round(s.m) + 'm</b> (OSM 보행 도로망 실측)');
            else if (s.mode === 's') out.push('<b style="color:#b45309">계단 · ' + BNAME[s.b] + ' → ' + s.f + '</b>');
            else if (s.mode === 'e') out.push('<b style="color:#b45309">엘리베이터 · ' + BNAME[s.b] + ' → ' + s.f + '</b>');
            else if (s.m > 1) out.push(BNAME[s.b] + ' ' + s.f + ' 복도 ' + Math.round(s.m) + 'm');
        });
        out.push('도착 · ' + G.names[to.b] + ' ' + to.key.replace('|', ' ') + ' 문 앞');
        return out;
    }

    /* ───────────── 공개 API ───────────── */
    var api = {
        open: function (id, floor) {
            var b = byId[id];
            if (!b || !b.floors.length) return;
            if (window.closeTechnoIndoorMap) window.closeTechnoIndoorMap();
            state.id = id;
            state.floor = floor && b.floors.some(function (f) { return f.floor === floor; }) ? floor
                : (b.floors.find(function (f) { return f.floor === '1F'; }) || b.floors[0]).floor;
            if (badgeGroup && window.map.hasLayer(badgeGroup)) window.map.removeLayer(badgeGroup);
            drawFloor();
            renderPanel();
            window.map.setView(b.center, 19);
        },
        close: function () {
            state.id = null;
            if (floorGroup) window.map.removeLayer(floorGroup);
            if (routeGroup) window.map.removeLayer(routeGroup);
            if (panel) panel.remove();
            panel = null;
            window.map.fire('zoomend');
        },
        route: function (from, to) {
            var G = window.GUMAP_CAMPUS_GRAPH;
            if (!G) return null;
            if (!adj) buildAdj();
            var src = (G.rooms[from.b] || {})[from.key], dst = (G.rooms[to.b] || {})[to.key];
            if (!src || !dst) { if (window.showToast) window.showToast('경로망에 없는 호실입니다 (검수 대상)'); return null; }
            var res = dijkstra(src, dst);
            if (!res) { if (window.showToast) window.showToast('이어지는 경로가 없습니다 (검수 대상 구간)'); return null; }
            var segs = segments(res);
            if (routeGroup) window.map.removeLayer(routeGroup);
            routeGroup = L.layerGroup().addTo(window.map);
            var all = [];
            segs.forEach(function (s) {
                if (s.coords.length < 2) return;
                all = all.concat(s.coords);
                routeGroup.addLayer(L.polyline(s.coords, { color: '#0f172a', weight: 9, opacity: 0.25, lineCap: 'round' }));
                routeGroup.addLayer(L.polyline(s.coords, {
                    color: COLOR[s.b] || '#334155', weight: 5, opacity: 0.95, lineCap: 'round',
                    dashArray: s.b === 'o' ? '10,7' : null
                }));
            });
            var first = all[0], last = all[all.length - 1];
            routeGroup.addLayer(L.circleMarker(first, { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 })
                .bindTooltip('출발 · ' + G.names[from.b] + ' ' + from.key.replace('|', ' '), { permanent: true, direction: 'top' }));
            routeGroup.addLayer(L.circleMarker(last, { radius: 8, color: '#fff', weight: 3, fillColor: '#dc2626', fillOpacity: 1 })
                .bindTooltip('도착 · ' + G.names[to.b] + ' ' + to.key.replace('|', ' '), { permanent: true, direction: 'top' }));
            var meters = segs.reduce(function (a, s) { return a + s.m; }, 0);
            var html = '<div style="margin-top:10px;padding:10px;border-radius:10px;background:var(--bg-input);border:1px solid var(--border-panel)">' +
                '<div style="font-size:16px;font-weight:800;color:#6d28d9">' + Math.round(meters) + 'm · 약 ' + Math.max(1, Math.round(res.seconds / 60)) + '분</div>' +
                '<div style="color:var(--text-muted);font-size:11px">캠퍼스 통합 경로망 · 건물 3동 + 실외 보행 연결</div>' +
                '<ol>' + stepText(segs, from, to).map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
                '<div class="lg" style="margin-top:6px"><span><i style="background:#7c3aed"></i>디지털관 실내</span><span><i style="background:#16a34a"></i>실외 도보</span><span><i style="background:#0891b2"></i>테크노관 실내</span></div></div>';
            if (!state.id) { state.id = from.b !== 'techno' ? from.b : 'digital'; state.floor = from.b !== 'techno' ? from.key.split('|')[0] : '1F'; drawFloor(); }
            renderPanel(html);
            window.map.fitBounds(L.latLngBounds(all), { paddingTopLeft: [360, 60], paddingBottomRight: [380, 60], maxZoom: 19 });
            return { seconds: res.seconds, meters: meters, segments: segs };
        },
        demoRoute: function () {
            api.open('digital', '1F');
            return api.route({ b: 'digital', key: '1F|101' }, { b: 'techno', key: '3F|302' });
        }
    };
    window.GUMAP_CAMPUS = api;

    function boot() {
        if (!window.map || !window.L) { setTimeout(boot, 300); return; }
        style();
        badges();
    }
    boot();
})();
