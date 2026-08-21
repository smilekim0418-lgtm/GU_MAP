// ============================================================
// 📁 파일명: station_info.js
// 📌 역할: 버스 정류장 클릭 시 실시간 도착 정보 팝업 표시
// ============================================================
//
// [파일 설명]
//   지도 위의 버스 정류장 마커를 클릭하면 해당 정류장에
//   도착 예정인 버스 목록과 예상 도착 시간을 실시간으로 표시합니다.
//   - 정류장 ID 탐색: stationCoords → fallback → 공공API 순차 탐색
//   - 경유 노선 조회: 해당 정류장을 경유하는 모든 노선 목록 표시
//   - 실시간 도착 정보: 10초 주기 자동 갱신 (setInterval)
//   - 혼잡도 배지: 각 노선별 예상 혼잡도를 색상 배지로 표시
//   - 즐겨찾기 추가 버튼: 정류장 팝업에서 바로 즐겨찾기 등록
//
// [의존 관계]
//   - config.js → TAGO API 키, 프록시 URL
//   - fallback_stops.js → API 실패 시 로컬 데이터에서 정류장 ID 탐색
//   - bus_tracker.js → 혼잡도 캐시(busCongestionCache) 참조
//   - favorites.js → addFavorite() 즐겨찾기 추가
//
// [사용된 외부 API]
//   - 공공데이터포털 정류소별 경유노선 API
//   - 공공데이터포털 정류소별 도착예정정보 API
// ============================================================

let infoWindowTimerId = null;

// 정류장 클릭 시 도착 정보 띄우기 함수
window.openStopInfo = function(stopName, lat, lng) {
    window.currentOpenStopName = stopName;
    if (infoWindowTimerId) {
        clearInterval(infoWindowTimerId);
        infoWindowTimerId = null;
    }

    // 최초 로딩 표시
    window.infoWindow.setContent(`<div style="padding:15px; font-size:14px; min-width:200px;"><b>🚏 ${stopName}</b><br><br>⏳ 실시간 버스 정보 검색 중...</div>`);
    window.infoWindow.setLatLng([lat, lng]);
    window.infoWindow.openOn(window.map);

    // [업그레이드 Task 3] 10초마다 자동 갱신
    fetchStopInfo(stopName, lat, lng);
    infoWindowTimerId = setInterval(() => {
        // 인포윈도우가 닫혀있으면 타이머 종료
        if (!window.map.hasLayer(window.infoWindow)) {
            clearInterval(infoWindowTimerId);
            return;
        }
        fetchStopInfo(stopName, lat, lng, true); // true: 백그라운드 갱신
    }, 10000);
};

function findStationIdLocally(stopName, lat, lng) {
    var bestId = null;
    var bestDiff = 999;
    
    if (typeof fallbackRouteStops !== 'undefined' && fallbackRouteStops) {
        Object.keys(fallbackRouteStops).forEach(function(routeId) {
            var stops = fallbackRouteStops[routeId];
            stops.forEach(function(st) {
                var nameMatch = (st.nodenm === stopName);
                var diff = Math.abs(st.gpslati - lat) + Math.abs(st.gpslong - lng);
                
                // 이름이 같거나 좌표 오차가 150미터(약 0.0015도) 이내인 경우 매칭 후보로 판단
                if (nameMatch || diff < 0.0015) {
                    if (diff < bestDiff) {
                        bestDiff = diff;
                        bestId = st.nodeid;
                    }
                }
            });
        });
    }
    return bestId;
}

function fetchStopInfo(stopName, lat, lng, isSilentUpdate = false) {
    // 1. stationCoords에서 근접한 정류장 ID 먼저 찾기 (API 트래픽 절약 및 500 오류 방지)
    var closestNodeId = null;
    var minDiff = 0.001; // 약 100m 이내
    if (typeof stationCoords !== 'undefined' && stationCoords) {
        Object.keys(stationCoords).forEach(function(nodeid) {
            var st = stationCoords[nodeid];
            var diff = Math.abs(st.lat - lat) + Math.abs(st.lng - lng);
            if (diff < minDiff) {
                minDiff = diff;
                closestNodeId = nodeid;
            }
        });
    }

    var getSttnIdPromise;
    if (closestNodeId) {
        getSttnIdPromise = Promise.resolve(closestNodeId);
    } else {
        // 2. 로컬 fallback 데이터베이스에서 먼저 노드 ID 찾기 (완전한 500 에러 방지)
        var localId = findStationIdLocally(stopName, lat, lng);
        if (localId) {
            getSttnIdPromise = Promise.resolve(localId);
        } else {
            getSttnIdPromise = fetchAPI(`https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNoList?pageNo=1&numOfRows=10&_type=json&cityCode=37050&nodeNm=${encodeURIComponent(stopName)}`)
            .then(data => {
                var items = data.response?.body?.items?.item;
                if (!items) throw new Error("정류장 ID를 찾을 수 없습니다.");
                if (!Array.isArray(items)) items = [items];

                var bestId = items[0].nodeid;
                var bestDiff = 999;
                items.forEach(item => {
                    var diff = Math.abs(item.gpslati - lat) + Math.abs(item.gpslong - lng);
                    if (diff < bestDiff) {
                        bestDiff = diff;
                        bestId = item.nodeid;
                    }
                });
                return bestId;
            });
        }
    }

    getSttnIdPromise.then(nodeId => {
        var p1 = fetchAPI(`https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnThrghRouteList?pageNo=1&numOfRows=100&_type=json&cityCode=37050&nodeid=${nodeId}`).catch(() => null);
        var p2 = fetchAPI(`https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList?pageNo=1&numOfRows=30&_type=json&cityCode=37050&nodeId=${nodeId}`).catch(() => null);

        return Promise.all([p1, p2]);
    })
    .then(([thrghData, arvlData]) => {
        if (!window.map.hasLayer(window.infoWindow)) return; // 그새 창 닫았으면 렌더링 안함
        if (window.currentOpenStopName !== stopName) return; // 다른 정류장이 선택되었으면 폐기

        var thrghItems = thrghData?.response?.body?.items?.item || [];
        if (!Array.isArray(thrghItems)) thrghItems = [thrghItems];

        var arvlItems = arvlData?.response?.body?.items?.item || [];
        if (!Array.isArray(arvlItems)) arvlItems = [arvlItems];

        var safeStopName = stopName.replace(/'/g, "\\'");
        var html = `<div style="padding:4px; font-size:14px; min-width:280px; max-height:400px; overflow-y:auto; color:var(--text-main);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <b style="font-size:16px; color:var(--text-main);">🚏 ${stopName}</b>
                <button onclick="window.addFavorite('🚏 ${safeStopName}', ${lat}, ${lng}, '버스 정류장'); window.map.closePopup();" class="glass-btn" style="padding:4px 8px; font-size:11px; background:var(--primary-grad) !important; color:white !important; border:none !important;">⭐ 즐겨찾기</button>
            </div>
            <div style="text-align:right; font-size:11px; color:var(--text-muted); margin-top:5px;">${new Date().toLocaleTimeString()} 갱신</div>
            <hr style="margin:8px 0; border:0; border-top:1px solid var(--border-panel);">`;

        var arvlMap = {};
        arvlItems.forEach(bus => {
            if (!arvlMap[bus.routeno]) arvlMap[bus.routeno] = [];
            arvlMap[bus.routeno].push(bus);
        });

        var uniqueRoutes = [];
        var seenRoutes = new Set();
        thrghItems.forEach(route => {
            if (!seenRoutes.has(route.routeno)) {
                seenRoutes.add(route.routeno);
                uniqueRoutes.push(route);
            }
        });

        var activeBuses = [];
        var inactiveBuses = [];

        uniqueRoutes.forEach(route => {
            if (arvlMap[route.routeno]) {
                arvlMap[route.routeno].sort((a, b) => a.arrtime - b.arrtime);
                activeBuses.push({
                    routeno: route.routeno,
                    routeid: route.routeid,
                    buses: arvlMap[route.routeno]
                });
            } else {
                inactiveBuses.push(route);
            }
        });

        activeBuses.sort((a, b) => a.buses[0].arrtime - b.buses[0].arrtime);
        inactiveBuses.sort((a, b) => {
            let numA = parseInt(String(a.routeno).replace(/[^0-9]/g, '')) || 0;
            let numB = parseInt(String(b.routeno).replace(/[^0-9]/g, '')) || 0;
            return numA - numB;
        });

        if (activeBuses.length === 0 && inactiveBuses.length === 0) {
            html += `<span style="color:var(--text-muted);">경유하는 노선이 없습니다.</span>`;
        } else {
            activeBuses.forEach(routeInfo => {
                var typeInfo = (typeof getBusTypeInfo === 'function') ? getBusTypeInfo(routeInfo.routeno) : { color: '#1E90FF', bgColor: '#eef8ff' };
                
                var routeid = routeInfo.routeid;
                var cachedCong = window.busCongestionCache && window.busCongestionCache[routeid];
                var congHtml = "";
                if (cachedCong) {
                    var level = cachedCong.data[0].congestionLevel || 1;
                    var isSim = cachedCong.source === 'simulated';
                    congHtml = window.getCongestionBadgeHtml(level, isSim);
                } else {
                    if (typeof fetchBusCongestion === 'function') {
                        fetchBusCongestion(routeid);
                    }
                }

                let routeHtml = `<div style="margin-bottom:8px; background:var(--bg-input); padding:8px; border-radius:8px; border:1px solid var(--border-panel); border-left:4px solid ${typeInfo.color}; display:flex; flex-direction:column; gap:6px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span onclick="selectRoute('${routeInfo.routeno}')" class="glass-btn" style="cursor:pointer; padding:3px 8px; font-size:11px;" title="클릭하여 노선도 보기"><span class="bus-badge-glow" style="background:${typeInfo.color};">BUS</span> ${routeInfo.routeno}번</span>
                        ${congHtml}
                    </div>`;
                
                routeInfo.buses.forEach(bus => {
                    var min = Math.floor(bus.arrtime / 60);
                    
                    // 현재 시각에 남은 초를 더해 정확한 도착 예정 시각(HH:MM) 산출
                    var arrDate = new Date(Date.now() + bus.arrtime * 1000);
                    var arrHour = arrDate.getHours();
                    var arrMin = arrDate.getMinutes();
                    var arrMinStr = arrMin < 10 ? '0' + arrMin : arrMin;
                    var arrivalClock = arrHour + ":" + arrMinStr;
                    
                    var state = "";
                    if (bus.arrprevstationcnt <= 1 || min <= 1) {
                        state = `<b style="color:#ef4444; animation: blink 1.2s infinite; font-weight:700;">곧 도착 예정 [${arrivalClock}]</b>`;
                    } else {
                        state = `<b style="color:var(--text-main); font-weight:700;">${min}분 후 [${arrivalClock} 도착]</b> <span style="color:var(--text-muted); font-size:12px;">(${bus.arrprevstationcnt}번째 전)</span>`;
                    }
                    routeHtml += `<div style="padding-left: 10px; font-size:14px; border-left: 2px solid ${typeInfo.color}60; margin-left: 5px; color:var(--text-main);">${state}</div>`;
                });
                routeHtml += `</div>`;
                html += routeHtml;
            });

            inactiveBuses.forEach(route => {
                var typeInfo = (typeof getBusTypeInfo === 'function') ? getBusTypeInfo(route.routeno) : { color: '#94a3b8', bgColor: '#f9f9f9' };
                
                var routeid = route.routeid;
                var cachedCong = window.busCongestionCache && window.busCongestionCache[routeid];
                var congHtml = "";
                if (cachedCong) {
                    var level = cachedCong.data[0].congestionLevel || 1;
                    var isSim = cachedCong.source === 'simulated';
                    congHtml = window.getCongestionBadgeHtml(level, isSim);
                } else {
                    // For inactive buses, use local simulation directly instead of making an API request
                    var level = 1;
                    if (typeof window.estimateCongestionFallback === 'function') {
                        var fallbackData = window.estimateCongestionFallback();
                        level = fallbackData[0].congestionLevel || 1;
                    }
                    congHtml = window.getCongestionBadgeHtml(level, true);
                }

                html += `<div style="margin-bottom:6px; background:var(--bg-input); padding:6px 8px; border-radius:8px; border:1px solid var(--border-panel); border-left:4px solid var(--border-panel); display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span onclick="selectRoute('${route.routeno}')" class="glass-btn" style="cursor:pointer; padding:3px 8px; font-size:11px;" title="클릭하여 노선도 보기"><span class="bus-badge-glow" style="background:#64748b;">BUS</span> ${route.routeno}번</span>
                        <span style="font-size:12px; color:var(--text-muted);">운행 대기 중</span>
                    </div>
                    ${congHtml}
                 </div>`;
            });
        }
        html += `</div>`;
        window.infoWindow.setContent(html);
    })
    .catch(err => {
        if (isSilentUpdate) return;
        let errMsg = err.message;
        window.infoWindow.setContent(`<div style="padding:15px; font-size:14px; color:red;"><b>🚏 ${stopName}</b><br><br>🚨 에러 발생: ${errMsg}</div>`);
    });
}
