// ============================================================
// 📁 파일명: GUMAP-정류장정보.js
// 📌 역할: 버스 정류장 클릭 시 정확한 정류소 ID 및 실제 경유 노선 기반 실시간 도착 정보 팝업
// ============================================================

let infoWindowTimerId = null;
window.currentStopMeta = null;
window.currentStopTab = 'arrival'; // 'arrival' | 'timetable'

// ── 구미시 정류장별 경유 노선 및 공식 노선 DB 사전 로드 ──
window.gumiStopToRoutes = null;
window.gumiOfficialRoutesLookup = {};

fetch('GUMAP-프론트/js/data/gumi_stop_to_routes.json')
    .then(r => r.json())
    .then(data => {
        window.gumiStopToRoutes = data;
        console.log('[GuMap] Preloaded stop-to-routes index:', Object.keys(data.byNodeId || {}).length, 'stops');
    })
    .catch(e => console.warn('[GuMap] Failed to load stop-to-routes index:', e));

fetch('GUMAP-프론트/js/data/gumi_official_routes.json')
    .then(r => r.json())
    .then(routes => {
        if (Array.isArray(routes)) {
            routes.forEach(r => {
                if (r && r.routeNo) {
                    if (!window.gumiOfficialRoutesLookup[r.routeNo]) {
                        window.gumiOfficialRoutesLookup[r.routeNo] = r;
                    }
                }
            });
            console.log('[GuMap] Preloaded official routes lookup:', Object.keys(window.gumiOfficialRoutesLookup).length, 'routes');
        }
    })
    .catch(e => console.warn('[GuMap] Failed to load official routes for timetable:', e));

// 구미시 대표 노선 기본 시간표 (공식 노선 미로드 시 폴백용)
window.gumiRouteTimetables = {
    "11": { name: "11번 (구미역 ↔ 왜관남부)", firstBus: "06:05", lastBus: "22:30", interval: 15, type: "일반", color: "#2563eb", desc: "구미역 및 왜관 방면 간선 노선" },
    "111": { name: "111번 (구미역 ↔ 왜관남부)", firstBus: "06:30", lastBus: "22:10", interval: 20, type: "좌석", color: "#e11d48", desc: "구미-왜관 직결 급행 좌석 노선" },
    "170": { name: "170번 (선산터미널 ↔ 구미역)", firstBus: "06:00", lastBus: "22:00", interval: 20, type: "좌석", color: "#e11d48", desc: "선산-구미역 직통 좌석 노선" },
    "171": { name: "171번 (구미역 ↔ 선산터미널)", firstBus: "06:15", lastBus: "22:10", interval: 25, type: "좌석", color: "#e11d48", desc: "선산-도심 연계 좌석 노선" },
    "10": { name: "10번 (구미역 ↔ 왜관남부)", firstBus: "06:30", lastBus: "21:45", interval: 25, type: "일반", color: "#2563eb", desc: "인동-왜관 방면 일반 노선" },
    "72": { name: "72번 (구미종합터미널 ↔ 해평터미널)", firstBus: "08:00", lastBus: "18:30", interval: 35, type: "일반", color: "#2563eb", desc: "해평 및 선산 방면 일반 노선" },
    "190": { name: "190번 (구미역 ↔ 옥계이편한세상)", firstBus: "06:00", lastBus: "22:00", interval: 20, type: "일반", color: "#2563eb", desc: "금오공대 및 옥계 방면 주력 간선" },
    "193": { name: "193번 (구미역 ↔ 장천버스터미널)", firstBus: "06:30", lastBus: "21:20", interval: 30, type: "일반", color: "#2563eb", desc: "금오공대 및 장천 방면 노선" },
    "960": { name: "960번 (구미역 ↔ 경운대학교)", firstBus: "07:55", lastBus: "22:10", interval: 25, type: "좌석", color: "#e11d48", desc: "경운대 직결 좌석 노선" },
    "340": { name: "340번 (구미역 순환)", firstBus: "06:30", lastBus: "21:30", interval: 30, type: "순환", color: "#059669", desc: "구미 도심 순환 노선" }
};

// 노선별 실시간 시간표 슬롯 생성 유틸리티
window.generateRouteTimetableSlots = function(routeNo) {
    let tt = window.gumiRouteTimetables[routeNo];
    if (!tt && window.gumiOfficialRoutesLookup && window.gumiOfficialRoutesLookup[routeNo]) {
        let off = window.gumiOfficialRoutesLookup[routeNo];
        let intVal = parseInt(off.interval) || 25;
        tt = {
            name: `${off.routeNo}번 (${off.startNode} ↔ ${off.endNode})`,
            firstBus: (off.firstBus && off.firstBus !== "정보없음") ? off.firstBus : "06:30",
            lastBus: (off.lastBus && off.lastBus !== "정보없음") ? off.lastBus : "22:00",
            interval: intVal,
            type: off.type || "일반",
            color: off.color || "#2563eb",
            desc: `${off.startNode}에서 ${off.endNode} 방면 ${off.type || '시내'}버스`
        };
    }
    if (!tt) {
        tt = {
            name: `${routeNo}번 시내버스`,
            firstBus: "06:30",
            lastBus: "22:00",
            interval: 25,
            type: "일반",
            color: "#2563eb",
            desc: "구미시 관내 시내버스"
        };
    }
    let [fH, fM] = (tt.firstBus || "06:30").split(':').map(Number);
    let [lH, lM] = (tt.lastBus || "22:00").split(':').map(Number);
    let fTotal = (isNaN(fH) ? 6 : fH) * 60 + (isNaN(fM) ? 0 : fM);
    let lTotal = (isNaN(lH) ? 22 : lH) * 60 + (isNaN(lM) ? 0 : lM);
    if (lTotal <= fTotal) lTotal = fTotal + 15 * 60;
    
    let now = new Date();
    let currentTotal = now.getHours() * 60 + now.getMinutes();

    let allSlots = [];
    let nextFound = false;
    let step = Math.max(10, tt.interval || 25);
    for (let t = fTotal; t <= lTotal; t += step) {
        let h = Math.floor(t / 60) % 24;
        let m = t % 60;
        let timeStr = (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
        let isNext = false;
        if (!nextFound && t >= currentTotal) {
            isNext = true;
            nextFound = true;
        }
        allSlots.push({ time: timeStr, total: t, isNext: isNext });
    }

    let displaySlots = allSlots;
    if (allSlots.length > 8) {
        let nextIdx = allSlots.findIndex(s => s.isNext);
        if (nextIdx === -1) nextIdx = allSlots.length - 1;
        let start = Math.max(0, nextIdx - 2);
        let end = Math.min(allSlots.length, start + 7);
        displaySlots = allSlots.slice(start, end);
    }

    return { info: tt, slots: displaySlots, allCount: allSlots.length };
};

// 정류소 명칭 및 위치 기반 경유 노선 정확한 탐색 엔진 (가짜 하드코딩 제거)
function findRoutesForStopNameLocally(stopName, lat, lng, nodeId) {
    let found = [];
    let seen = new Set();

    function add(r) {
        let rNo = String((typeof r === 'object' && r) ? (r.routeNo || r.routeno || '') : r).trim();
        if (rNo && !seen.has(rNo)) {
            seen.add(rNo);
            found.push(rNo);
        }
    }

    if (window.gumiStopToRoutes) {
        // 1. NodeId 정확 일치
        if (nodeId && window.gumiStopToRoutes.byNodeId && window.gumiStopToRoutes.byNodeId[nodeId]) {
            let list = window.gumiStopToRoutes.byNodeId[nodeId].routes || [];
            list.forEach(add);
            if (found.length > 0) return found;
        }

        // 2. 정류장 명칭 일치
        if (stopName && window.gumiStopToRoutes.byName && window.gumiStopToRoutes.byName[stopName]) {
            let list = window.gumiStopToRoutes.byName[stopName] || [];
            list.forEach(add);
            if (found.length > 0) return found;
        }

        // 3. 근접 좌표 매칭 (약 60m 이내)
        if (lat && lng && window.gumiStopToRoutes.byNodeId) {
            let closest = null;
            let minDist = 0.0006;
            for (let nid in window.gumiStopToRoutes.byNodeId) {
                let s = window.gumiStopToRoutes.byNodeId[nid];
                if (s && s.lat && s.lng) {
                    let d = Math.abs(s.lat - lat) + Math.abs(s.lng - lng);
                    if (d < minDist) {
                        minDist = d;
                        closest = s;
                    }
                }
            }
            if (closest && closest.routes) {
                closest.routes.forEach(add);
                if (found.length > 0) return found;
            }
        }
    }

    // 4. fallbackRouteStops 전역 검색
    if (typeof window.fallbackRouteStops !== 'undefined' && window.fallbackRouteStops) {
        Object.keys(window.fallbackRouteStops).forEach(rId => {
            let stList = window.fallbackRouteStops[rId];
            if (Array.isArray(stList) && stList.some(s => (s.nodeid && s.nodeid === nodeId) || (s.nodenm && s.nodenm === stopName) || (lat && lng && Math.abs(s.gpslati - lat) + Math.abs(s.gpslong - lng) < 0.0006))) {
                let rNo = rId.replace(/[^0-9]/g, '');
                if (rNo) add(rNo);
            }
        });
    }

    return found;
}

// 탭 전환 핸들러
window.switchStopTab = function(tab) {
    window.currentStopTab = tab;
    if (window.currentStopMeta) {
        renderStopPopupContent();
    }
};

// 정류장 ID 정확 매핑 함수
function findStationIdLocally(stopName, lat, lng) {
    // 1. stop_to_routes 인덱스에서 검색
    if (window.gumiStopToRoutes) {
        if (stopName && window.gumiStopToRoutes.byName && window.gumiStopToRoutes.byName[stopName]) {
            let routes = window.gumiStopToRoutes.byName[stopName];
            if (routes && routes.length > 0) {
                for (let nid in window.gumiStopToRoutes.byNodeId) {
                    if (window.gumiStopToRoutes.byNodeId[nid].name === stopName) {
                        return nid;
                    }
                }
            }
        }
        if (lat && lng && window.gumiStopToRoutes.byNodeId) {
            let bestId = null;
            let bestDiff = 0.0008;
            for (let nid in window.gumiStopToRoutes.byNodeId) {
                let st = window.gumiStopToRoutes.byNodeId[nid];
                if (st && st.lat && st.lng) {
                    let diff = Math.abs(st.lat - lat) + Math.abs(st.lng - lng);
                    if (diff < bestDiff) {
                        bestDiff = diff;
                        bestId = nid;
                    }
                }
            }
            if (bestId) return bestId;
        }
    }

    // 2. bus_stations 배열에서 검색
    if (typeof bus_stations !== 'undefined' && Array.isArray(bus_stations)) {
        let bestId = null;
        let bestDiff = 0.001;
        bus_stations.forEach(st => {
            if (st.id) {
                let d = Math.abs(parseFloat(st.lat) - lat) + Math.abs(parseFloat(st.lng) - lng);
                if (d < bestDiff) {
                    bestDiff = d;
                    bestId = st.id;
                }
            }
        });
        if (bestId) return bestId;
    }

    return null;
}

// 정류장 클릭 시 도착 정보 & 시간표 띄우기 함수
window.openStopInfo = function(stopName, lat, lng, preNodeId, preRouteNos, preRouteIds) {
    window.currentOpenStopName = stopName;
    window.currentStopTab = 'arrival';

    var resolvedNodeId = preNodeId || findStationIdLocally(stopName, lat, lng);

    // 경유 노선 자동 보강
    if (!preRouteNos || preRouteNos.length === 0) {
        preRouteNos = findRoutesForStopNameLocally(stopName, lat, lng, resolvedNodeId);
    }

    // 사전 노선 정보 바탕으로 대기 노선 카드 구성
    var initialInactive = (preRouteNos || []).map(function(r) {
        var rNo = String(r);
        var off = window.gumiOfficialRoutesLookup ? window.gumiOfficialRoutesLookup[rNo] : null;
        return {
            routeno: rNo,
            routeid: (off && off.routeId) ? off.routeId : `GMB${rNo}`,
            startNode: off ? off.startNode : '',
            endNode: off ? off.endNode : '',
            type: off ? off.type : '일반',
            color: off ? off.color : '#2563eb'
        };
    });

    window.currentStopMeta = {
        stopName: stopName,
        lat: lat,
        lng: lng,
        nodeId: resolvedNodeId || null,
        routeNos: preRouteNos || [],
        routeIds: preRouteIds || [],
        activeBuses: [],
        inactiveBuses: initialInactive,
        lastUpdate: new Date()
    };

    if (infoWindowTimerId) {
        clearInterval(infoWindowTimerId);
        infoWindowTimerId = null;
    }

    // WebGL 벡터지도 팝업 생성
    if (window.gumapWebGLMap) {
        if (window.gumapStopPopup) {
            try { window.gumapStopPopup.remove(); } catch(e) {}
        }
        window.gumapStopPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 12, maxWidth: '380px' })
            .setLngLat([lng, lat])
            .addTo(window.gumapWebGLMap);
    }

    // Leaflet 지도 지원
    if (window.infoWindow && window.map) {
        window.infoWindow.setLatLng([lat, lng]);
        if (!window.isGuMapWebGLActive) {
            window.infoWindow.openOn(window.map);
        }
    }

    // 초기 시간표 및 도착 정보 즉시 렌더링
    renderStopPopupContent();

    // 정류장 실시간 API 로드 및 10초 자동 갱신
    fetchStopInfo(stopName, lat, lng, resolvedNodeId, preRouteNos, preRouteIds);
    infoWindowTimerId = setInterval(function() {
        var isPopupOpen = (window.gumapStopPopup && window.gumapStopPopup._map) || 
                          (window.map && window.map.hasLayer && window.map.hasLayer(window.infoWindow));
        if (!isPopupOpen) {
            clearInterval(infoWindowTimerId);
            infoWindowTimerId = null;
            return;
        }
        fetchStopInfo(stopName, lat, lng, resolvedNodeId, preRouteNos, preRouteIds, true);
    }, 10000);
};

// 팝업 내용 동적 렌더링 함수
function renderStopPopupContent() {
    var isPopupOpen = (window.gumapStopPopup && (window.gumapStopPopup.isOpen() || window.gumapStopPopup._map)) || 
                      (window.map && window.map.hasLayer && window.map.hasLayer(window.infoWindow));
    if (!window.currentStopMeta || !isPopupOpen) return;

    let meta = window.currentStopMeta;
    let safeStopName = (meta.stopName || '버스 정류장').replace(/'/g, "\\'");
    let idBadge = meta.nodeId ? `<span style="font-size:10.5px; padding:2px 6px; background:#eff6ff; color:#2563eb; border-radius:4px; font-weight:700; border:1px solid #bfdbfe;">ID: ${meta.nodeId}</span>` : '';

    let html = `
    <div style="padding:4px; font-size:13px; min-width:300px; max-width:350px; max-height:450px; overflow-y:auto; color:var(--text-main); font-family:-apple-system,BlinkMacSystemFont,'Pretendard',sans-serif;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <b style="font-size:15px; color:#0f172a; letter-spacing:-0.3px;">🚏 ${meta.stopName}</b>
                ${idBadge}
            </div>
            <button onclick="if(typeof window.addFavorite==='function') window.addFavorite('🚏 ${safeStopName}', ${meta.lat}, ${meta.lng}, '버스 정류장');" class="glass-btn" style="padding:3px 7px; font-size:11px; background:#f8fafc !important; color:#64748b !important; border:1px solid #cbd5e1 !important; border-radius:6px; cursor:pointer;">⭐ 즐겨찾기</button>
        </div>

        <!-- 실시간 도착 / 시간표 전환 탭 -->
        <div style="display:flex; gap:6px; margin:10px 0 8px 0; border-bottom:1px solid var(--border-panel); padding-bottom:6px;">
            <button onclick="window.switchStopTab('arrival')" class="stop-info-tab-btn ${window.currentStopTab === 'arrival' ? 'active' : ''}" style="flex:1; padding:6px 0; border:none; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; background:${window.currentStopTab === 'arrival' ? '#2563eb' : '#f1f5f9'}; color:${window.currentStopTab === 'arrival' ? '#ffffff' : '#64748b'};">⏱️ 실시간 도착 (AI)</button>
            <button onclick="window.switchStopTab('timetable')" class="stop-info-tab-btn ${window.currentStopTab === 'timetable' ? 'active' : ''}" style="flex:1; padding:6px 0; border:none; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; background:${window.currentStopTab === 'timetable' ? '#2563eb' : '#f1f5f9'}; color:${window.currentStopTab === 'timetable' ? '#ffffff' : '#64748b'};">📅 노선 시간표</button>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; color:#64748b; margin-bottom:6px;">
            <span>경유 노선 ${meta.activeBuses.length + meta.inactiveBuses.length}개</span>
            <span>${meta.lastUpdate ? meta.lastUpdate.toLocaleTimeString() : ''} 갱신</span>
        </div>
    `;

    if (window.currentStopTab === 'arrival') {
        // [1. 실시간 도착 정보 탭]
        if (meta.activeBuses.length === 0 && meta.inactiveBuses.length === 0) {
            html += `<div style="text-align:center; padding:20px 0; color:#94a3b8; font-size:12px;">현재 경유하는 운행 버스가 없습니다.</div>`;
        } else {
            // 도착 예정 버스 (activeBuses)
            if (meta.activeBuses.length > 0) {
                html += `<div style="font-size:11px; font-weight:800; color:#16a34a; margin-bottom:6px;">🟢 곧 도착하는 버스 (${meta.activeBuses.length}대)</div>`;
            }
            meta.activeBuses.forEach(routeInfo => {
                let rNo = routeInfo.routeno;
                let off = window.gumiOfficialRoutesLookup ? window.gumiOfficialRoutesLookup[rNo] : null;
                let color = (off && off.color) ? off.color : (rNo.startsWith('111') || rNo.startsWith('170') || rNo.startsWith('960') ? '#e11d48' : '#2563eb');
                let routeid = routeInfo.routeid;

                let congHtml = "";
                if (window.busCongestionCache && window.busCongestionCache[routeid]) {
                    let level = window.busCongestionCache[routeid].data[0].congestionLevel || 1;
                    if (typeof window.getCongestionBadgeHtml === 'function') {
                        congHtml = window.getCongestionBadgeHtml(level, window.busCongestionCache[routeid].source === 'simulated');
                    }
                } else if (typeof fetchBusCongestion === 'function') {
                    fetchBusCongestion(routeid);
                }

                html += `
                <div style="margin-bottom:8px; background:#f8fafc; padding:8px 10px; border-radius:8px; border:1px solid #e2e8f0; border-left:4px solid ${color}; display:flex; flex-direction:column; gap:5px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span onclick="window.navigateToBusRoute('${rNo}')" class="glass-btn" style="cursor:pointer; padding:3px 7px; font-size:11px; font-weight:700; background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; white-space:nowrap; display:inline-flex; align-items:center; gap:4px; flex-shrink:0;" title="클릭 시 버스 노선 및 실시간 위치 보기">
                                <span style="background:${color}; font-size:9px; padding:1px 4px; border-radius:3px; color:white; font-weight:800;">BUS</span> <b>${rNo}번</b>
                            </span>
                            ${off ? `<span style="font-size:11px; color:#475569; font-weight:600;">${off.startNode}→${off.endNode}</span>` : ''}
                        </div>
                        ${congHtml}
                    </div>`;

                routeInfo.buses.forEach(bus => {
                    let min = Math.floor(bus.arrtime / 60);
                    let arrDate = new Date(Date.now() + bus.arrtime * 1000);
                    let arrHour = arrDate.getHours();
                    let arrMin = arrDate.getMinutes();
                    let arrivalClock = `${arrHour}:${arrMin < 10 ? '0' + arrMin : arrMin}`;

                    let state = (bus.arrprevstationcnt <= 1 || min <= 1)
                        ? `<b style="color:#ef4444; font-weight:800;">곧 도착 예정 [${arrivalClock}]</b> <span style="color:#64748b; font-size:11px;">(1정거장 전)</span>`
                        : `<b style="color:#0f172a; font-weight:800;">${min}분 후 [${arrivalClock} 도착]</b> <span style="color:#64748b; font-size:11px;">(${bus.arrprevstationcnt}번째 전)</span>`;

                    let aiTag = bus.groute_corrected ? '<span style="font-size:9.5px; padding:1px 4px; background:#dcfce7; color:#15803d; border-radius:3px; font-weight:700; margin-left:4px;">AI 보정</span>' : '';

                    html += `<div style="padding-left:8px; font-size:12.5px; border-left:2px solid ${color}60; color:#1e293b; display:flex; align-items:center;">${state} ${aiTag}</div>`;
                });
                html += `</div>`;
            });

            // 운행 대기 노선 (inactiveBuses)
            if (meta.inactiveBuses.length > 0) {
                html += `<div style="font-size:11px; font-weight:800; color:#64748b; margin:10px 0 6px 0;">⚪ 운행 대기 노선 (${meta.inactiveBuses.length}개)</div>`;
            }
            meta.inactiveBuses.forEach(route => {
                let rNo = route.routeno;
                let off = window.gumiOfficialRoutesLookup ? window.gumiOfficialRoutesLookup[rNo] : null;
                let color = (off && off.color) ? off.color : '#64748b';
                let dest = off ? `${off.startNode}→${off.endNode}` : (route.startNode ? `${route.startNode}→${route.endNode}` : '');

                html += `
                <div style="margin-bottom:6px; background:#f8fafc; padding:6px 10px; border-radius:8px; border:1px solid #e2e8f0; border-left:3px solid #cbd5e1; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span onclick="window.navigateToBusRoute('${rNo}')" class="glass-btn" style="cursor:pointer; padding:3px 7px; font-size:11px; font-weight:700; background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; white-space:nowrap; display:inline-flex; align-items:center; gap:4px; flex-shrink:0;" title="클릭 시 버스 노선 상세 보기">
                            <span style="background:${color}; font-size:9px; padding:1px 4px; border-radius:3px; color:white; font-weight:800;">BUS</span> <b>${rNo}번</b>
                        </span>
                        ${dest ? `<span style="font-size:11px; color:#475569; font-weight:600;">${dest}</span>` : ''}
                    </div>
                    <span onclick="window.switchStopTab('timetable')" style="font-size:10.5px; color:#2563eb; cursor:pointer; font-weight:700; text-decoration:underline;">시간표</span>
                </div>`;
            });
        }
    } else {
        // [2. 버스 시간표 탭]
        let allRoutes = [];
        meta.activeBuses.forEach(b => { if (!allRoutes.includes(b.routeno)) allRoutes.push(b.routeno); });
        meta.inactiveBuses.forEach(b => { if (!allRoutes.includes(b.routeno)) allRoutes.push(b.routeno); });
        if (meta.routeNos && meta.routeNos.length > 0) {
            meta.routeNos.forEach(r => { if (!allRoutes.includes(r)) allRoutes.push(r); });
        }

        if (allRoutes.length === 0) {
            html += `<div style="text-align:center; padding:20px 0; color:#94a3b8; font-size:12px;">연계된 노선 시간표가 없습니다.</div>`;
        } else {
            allRoutes.sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0)).forEach(rNo => {
                let { info, slots } = window.generateRouteTimetableSlots(rNo);
                let color = info.color || '#2563eb';

                let slotChips = slots.map(s => {
                    let style = s.isNext 
                        ? 'background:#ef4444; color:white; font-weight:800; border:1px solid #ef4444; box-shadow:0 0 6px rgba(239,68,68,0.4);' 
                        : 'background:#ffffff; color:#334155; border:1px solid #cbd5e1;';
                    return `<span style="padding:2px 6px; border-radius:4px; font-size:10.5px; ${style}">${s.time}${s.isNext ? ' ★' : ''}</span>`;
                }).join(' ');

                html += `
                <div style="margin-bottom:10px; background:#f8fafc; padding:8px 10px; border-radius:8px; border:1px solid #e2e8f0; border-left:4px solid ${color};">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <b style="font-size:12.5px; color:#0f172a;">${info.name}</b>
                        <span onclick="window.navigateToBusRoute('${rNo}')" style="font-size:10px; color:#2563eb; cursor:pointer; font-weight:700;">노선보기 →</span>
                    </div>
                    <div style="font-size:10.5px; color:#64748b; margin-top:2px;">배차 약 ${info.interval}분 | 첫차 ${info.firstBus} ~ 막차 ${info.lastBus}</div>
                    <div style="margin-top:6px; font-size:10px; color:#475569; font-weight:700;">현재 시간대 통과 시각 (★: 다음 버스)</div>
                    <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">${slotChips}</div>
                </div>`;
            });
        }
    }

    // 하단 출발지 / 도착지 길찾기 핀 설정 버튼
    html += `
        <div style="display:flex; gap:6px; margin-top:10px; padding-top:8px; border-top:1px solid #e2e8f0;">
            <button onclick="if(typeof window.setGuMapRoutePoint==='function') window.setGuMapRoutePoint('START', ${meta.lat}, ${meta.lng}, '${safeStopName}')" style="flex:1; padding:7px 0; font-size:11.5px; font-weight:700; background:#2563eb; color:white; border:none; border-radius:6px; cursor:pointer;">출발지</button>
            <button onclick="if(typeof window.setGuMapRoutePoint==='function') window.setGuMapRoutePoint('END', ${meta.lat}, ${meta.lng}, '${safeStopName}')" style="flex:1; padding:7px 0; font-size:11.5px; font-weight:700; background:#ef4444; color:white; border:none; border-radius:6px; cursor:pointer;">도착지</button>
        </div>
    </div>`;

    if (window.gumapStopPopup) {
        window.gumapStopPopup.setHTML(html);
    }
    if (window.infoWindow) {
        window.infoWindow.setContent(html);
    }
}

function fetchStopInfo(stopName, lat, lng, preNodeId, preRouteNos, preRouteIds, isSilentUpdate) {
    let nodeId = preNodeId || findStationIdLocally(stopName, lat, lng);
    if (!nodeId) return;

    if (window.currentStopMeta) window.currentStopMeta.nodeId = nodeId;

    // 1. 공공데이터포털 정류소 경유 노선 API
    let p1 = (typeof fetchAPI === 'function')
        ? fetchAPI(`https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnThrghRouteList?pageNo=1&numOfRows=100&_type=json&cityCode=37050&nodeid=${nodeId}`).catch(() => null)
        : Promise.resolve(null);

    // 2. 실시간 버스 도착 정보 API (/bus-arrival)
    let p2 = fetch(`${window.PROXY_URL || ''}/bus-arrival?pageNo=1&numOfRows=30&_type=json&cityCode=37050&nodeId=${nodeId}`)
        .then(res => res.json())
        .catch(() => null);

    Promise.all([p1, p2]).then(([thrghData, arvlData]) => {
        var isPopupOpen = (window.gumapStopPopup && (window.gumapStopPopup.isOpen() || window.gumapStopPopup._map)) || 
                          (window.map && window.map.hasLayer && window.map.hasLayer(window.infoWindow));
        if (!isPopupOpen) return;
        if (window.currentOpenStopName !== stopName) return;

        let thrghItems = thrghData?.response?.body?.items?.item || [];
        if (!Array.isArray(thrghItems)) thrghItems = [thrghItems];

        let arvlItems = arvlData?.response?.body?.items?.item || [];
        if (!Array.isArray(arvlItems)) arvlItems = [arvlItems];

        let seenRoutes = new Set();
        let uniqueRoutes = [];

        // API 반환 경유 노선
        thrghItems.forEach(route => {
            if (!route) return;
            let rNo = String(route.routeno || '').trim();
            if (rNo && !seenRoutes.has(rNo)) {
                seenRoutes.add(rNo);
                uniqueRoutes.push(route);
            }
        });

        // 로컬 stop_to_routes 인덱스에서 보강
        if (window.gumiStopToRoutes && window.gumiStopToRoutes.byNodeId && window.gumiStopToRoutes.byNodeId[nodeId]) {
            let localList = window.gumiStopToRoutes.byNodeId[nodeId].routes || [];
            localList.forEach(r => {
                let rNo = String(r.routeNo || '').trim();
                if (rNo && !seenRoutes.has(rNo)) {
                    seenRoutes.add(rNo);
                    uniqueRoutes.push({
                        routeno: rNo,
                        routeid: r.routeId,
                        startNode: r.startNode,
                        endNode: r.endNode
                    });
                }
            });
        }

        // 사전 연결된 노선 코드(preRouteNos) 병합
        if (preRouteNos && preRouteNos.length > 0) {
            preRouteNos.forEach(rNo => {
                let sNo = String(rNo).trim();
                if (sNo && !seenRoutes.has(sNo)) {
                    seenRoutes.add(sNo);
                    uniqueRoutes.push({
                        routeno: sNo,
                        routeid: (preRouteIds && preRouteIds[0]) ? preRouteIds[0] : `GMB${sNo}`
                    });
                }
            });
        }

        let arvlMap = {};
        arvlItems.forEach(bus => {
            if (!bus) return;
            let rNo = String(bus.routeno || '').trim();
            if (rNo) {
                if (!arvlMap[rNo]) arvlMap[rNo] = [];
                arvlMap[rNo].push(bus);
            }
        });

        let activeBuses = [];
        let inactiveBuses = [];

        uniqueRoutes.forEach(route => {
            let rNo = String(route.routeno || '').trim();
            if (arvlMap[rNo]) {
                arvlMap[rNo].sort((a, b) => (a.arrtime || 0) - (b.arrtime || 0));
                activeBuses.push({
                    routeno: rNo,
                    routeid: route.routeid,
                    buses: arvlMap[rNo]
                });
            } else {
                inactiveBuses.push(route);
            }
        });

        activeBuses.sort((a, b) => (a.buses[0]?.arrtime || 0) - (b.buses[0]?.arrtime || 0));
        inactiveBuses.sort((a, b) => {
            let numA = parseInt(String(a.routeno).replace(/[^0-9]/g, '')) || 0;
            let numB = parseInt(String(b.routeno).replace(/[^0-9]/g, '')) || 0;
            return numA - numB;
        });

        if (window.currentStopMeta) {
            window.currentStopMeta.activeBuses = activeBuses;
            window.currentStopMeta.inactiveBuses = inactiveBuses;
            window.currentStopMeta.lastUpdate = new Date();
        }

        renderStopPopupContent();
    }).catch(err => {
        if (isSilentUpdate) return;
        console.warn('[GuMap] fetchStopInfo error:', err);
        renderStopPopupContent();
    });
}
