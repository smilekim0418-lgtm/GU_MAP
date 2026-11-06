// ============================================================
// 📁 파일명: bus_tracker.js
// 📌 역할: 실시간 버스 위치 추적 및 노선도 렌더링 핵심 모듈
// ============================================================
//
// [파일 설명]
//   구미시 시내버스의 실시간 위치를 4초 주기로 폴링하여 지도 위에
//   애니메이션 마커로 표시하고, 노선 경로를 폴리라인으로 그리는
//   본 프로젝트의 가장 핵심적인 모듈입니다. (약 1,440줄)
//   - 노선 선택(selectRoute): 공공데이터포털 API로 정류장 목록 조회
//   - OSRM 도로 스냅핑: 정류장 좌표를 실제 도로 위에 정합
//   - 실시간 버스 위치 폴링: 4초마다 위치 갱신, 부드러운 마커 이동
//   - 노선 유형 분류: 간선/지선/순환/마을/급행 자동 색상 구분
//   - 혼잡도 시뮬레이션: 시간대별 승객 밀도 추정 및 배지 표시
//   - 노선 비교(compareRoutes): 2개 노선 동시 표시 기능
//
// [의존 관계]
//   - config.js → API 키(TAGO_KEY), 프록시 URL 참조
//   - fallback_stops.js → API 실패 시 오프라인 정류장 데이터 폴백
//   - map-init.js → window.map 전역 지도 객체
//   - station_info.js → 정류장 클릭 시 도착 정보 팝업 호출
//
// [사용된 외부 API]
//   - 공공데이터포털 버스노선정보 API (1613000)
//   - 공공데이터포털 실시간버스위치 API
//   - OSRM 도로 매칭 API (오픈소스)
// ============================================================

const btnStyle = "display:inline-block; padding:8px 16px; margin-right:8px; background:#f0f0f0; border:1px solid #ccc; border-radius:20px; cursor:pointer; font-weight:bold; color:#333; transition:all 0.2s ease;";
const btnActiveStyle = "display:inline-block; padding:8px 16px; margin-right:8px; background:#4CAF50; border:1px solid #388E3C; border-radius:20px; cursor:pointer; font-weight:bold; color:#fff; box-shadow:0 2px 4px rgba(0,0,0,0.2);";

// ── 버스 혼잡도 추정 시스템 ──
window.busCongestionCache = {};
window._currentRouteCongestion = 1;
window._currentCongestionSimulated = true;

// ── 모듈 내부 및 전역 상태 변수 (GUMAP-설정.js와 안전하게 동기화) ──
var currentSelectedRouteNo = window.currentSelectedRouteNo || null;
var currentRoutePolylines = window.currentRoutePolylines || [];
var activeBuses = window.activeBuses || {};
var stationCoords = window.stationCoords || {};
var routeStops = window.routeStops || {};
var animationFrameId = window.animationFrameId || null;
var fetchIntervalId = window.fetchIntervalId || null;
var currentRenderId = window.currentRenderId || 0;
var allRoutesMap = window.allRoutesMap || {};

function fetchBusCongestion(routeId) {
    var cached = window.busCongestionCache[routeId];
    if (cached && (Date.now() - cached.time < 300000)) return Promise.resolve(cached.data);
    
    return fetchWithRetry(`${window.PROXY_URL}/bus-congestion?pageNo=1&numOfRows=10&_type=json&cityCode=37050&routeId=${routeId}`)
    .then(function(data) {
        if (data.response && data.response.body && data.response.body.items) {
            var items = data.response.body.items.item;
            if (!Array.isArray(items)) items = [items];
            window.busCongestionCache[routeId] = { time: Date.now(), data: items, source: 'api' };
            return items;
        }
        throw new Error('No data');
    })
    .catch(function() {
        var fallback = estimateCongestionFallback();
        window.busCongestionCache[routeId] = { time: Date.now(), data: fallback, source: 'simulated' };
        return fallback;
    });
}

window.estimateCongestionFallback = function() {
    var hour = new Date().getHours();
    var day = new Date().getDay();
    var isWeekend = (day === 0 || day === 6);
    var level;
    if (isWeekend) {
        level = (hour >= 10 && hour <= 18) ? 2 : 1;
    } else {
        if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) level = 3;
        else if (hour >= 11 && hour <= 14) level = 2;
        else if (hour >= 22 || hour <= 5) level = 1;
        else level = 1;
    }
    return [{ congestionLevel: level }];
};

window.getCongestionInfo = function(level) {
    var n = parseInt(level) || 1;
    if (n <= 1) return { grade: '여유', color: '#22c55e', bgColor: '#dcfce7', icon: '😊', barWidth: '25%' };
    if (n === 2) return { grade: '보통', color: '#eab308', bgColor: '#fef9c3', icon: '😐', barWidth: '50%' };
    if (n === 3) return { grade: '혼잡', color: '#f97316', bgColor: '#fed7aa', icon: '😣', barWidth: '75%' };
    return { grade: '매우혼잡', color: '#ef4444', bgColor: '#fecaca', icon: '😤', barWidth: '100%' };
};

window.getCongestionBadgeHtml = function(level, isSimulated) {
    var info = getCongestionInfo(level);
    var simLabel = isSimulated ? '<span style="font-size:9px; color:#94a3b8;"> (추정)</span>' : '';
    return '<span style="display:inline-flex; align-items:center; gap:3px; padding:2px 6px; background:' + info.bgColor + '; border:1px solid ' + info.color + '; border-radius:10px; font-size:10px; font-weight:700; color:' + info.color + ';">' + info.icon + ' ' + info.grade + simLabel + '</span>';
};

// 두 위경도 간의 실제 거리(미터 단위)를 반환하는 함수
window.getLatLngDistance = function(lat1, lng1, lat2, lng2) {
    var R = 6371000; // 지구 반지름 (m)
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
};

// 버스의 현재 실시간 애니메이션 위치가 특정 정류소에 인접(70m 이내)했는지 또는 정류소 사이에 있는지 판정하는 함수
window.getBusSegment = function(bus, allStations) {
    if (!bus || !allStations || allStations.length === 0) return null;
    
    var routeId = bus.routeId;
    var coords = (routeId && window.routeSnappedCoords) ? window.routeSnappedCoords[routeId] : null;
    
    if (coords && coords.length > 0) {
        // 각 정류장의 snapped index 구하기 (정적 경로이므로 캐싱 처리하여 CPU 부하 경감)
        window._stationSnappedCache = window._stationSnappedCache || {};
        var cacheKey = routeId + "_" + allStations.length;
        var stationSnappedIdxs = window._stationSnappedCache[cacheKey];
        if (!stationSnappedIdxs) {
            stationSnappedIdxs = allStations.map(function(st) {
                return findClosestIndex(st.lat, st.lng, coords);
            });
            window._stationSnappedCache[cacheKey] = stationSnappedIdxs;
        }
        
        // 버스의 snapped index 구하기 (애니메이션 프레임 루프에서 계산된 인덱스 재활용)
        var busSnappedIdx = bus.currentIndex !== undefined ? bus.currentIndex : findClosestIndex(bus.lat, bus.lng, coords);
        
        // 버스가 어느 정류장 근처에 있는지 체크 (70m 이내이면 'at')
        for (var i = 0; i < allStations.length; i++) {
            var d = getLatLngDistance(bus.lat, bus.lng, allStations[i].lat, allStations[i].lng);
            if (d < 70) {
                return { type: 'at', index: i };
            }
        }
        
        // 70m 이내에 정류장이 없으면, snapped index를 기준으로 사이 구간 찾기
        for (var i = 0; i < allStations.length - 1; i++) {
            var idx1 = stationSnappedIdxs[i];
            var idx2 = stationSnappedIdxs[i + 1];
            var minIdx = Math.min(idx1, idx2);
            var maxIdx = Math.max(idx1, idx2);
            if (busSnappedIdx >= minIdx && busSnappedIdx <= maxIdx) {
                return { type: 'between', fromIndex: i, toIndex: i + 1 };
            }
        }
        
        // 만약 범위를 벗어났다면 가장 가까운 정류장 index 기준 처리
        var closestIdx = -1;
        var minD = Infinity;
        for (var i = 0; i < allStations.length; i++) {
            var d = getLatLngDistance(bus.lat, bus.lng, allStations[i].lat, allStations[i].lng);
            if (d < minD) {
                minD = d;
                closestIdx = i;
            }
        }
        if (closestIdx === 0) {
            return { type: 'between', fromIndex: 0, toIndex: 1 };
        } else if (closestIdx === allStations.length - 1) {
            return { type: 'between', fromIndex: allStations.length - 2, toIndex: allStations.length - 1 };
        } else {
            var dPrev = getLatLngDistance(bus.lat, bus.lng, allStations[closestIdx - 1].lat, allStations[closestIdx - 1].lng);
            var dNext = getLatLngDistance(bus.lat, bus.lng, allStations[closestIdx + 1].lat, allStations[closestIdx + 1].lng);
            if (dPrev < dNext) {
                return { type: 'between', fromIndex: closestIdx - 1, toIndex: closestIdx };
            } else {
                return { type: 'between', fromIndex: closestIdx, toIndex: closestIdx + 1 };
            }
        }
    } else {
        // 폴백: snapped coords가 없을 때는 기존처럼 currentNodeId 기반으로 처리
        var targetIdx = -1;
        if (bus.currentNodeId) {
            targetIdx = allStations.findIndex(function(st) {
                return st.nodeId === bus.currentNodeId || (st.mergedNodeIds && st.mergedNodeIds.indexOf(bus.currentNodeId) !== -1);
            });
        }
        if (targetIdx === -1) {
            var minD = Infinity;
            for (var i = 0; i < allStations.length; i++) {
                var d = getLatLngDistance(bus.lat, bus.lng, allStations[i].lat, allStations[i].lng);
                if (d < minD) {
                    minD = d;
                    targetIdx = i;
                }
            }
        }
        if (targetIdx === -1) return null;
        
        var dTarget = getLatLngDistance(bus.lat, bus.lng, allStations[targetIdx].lat, allStations[targetIdx].lng);
        var dPrevStation = (targetIdx > 0) ? getLatLngDistance(bus.lat, bus.lng, allStations[targetIdx - 1].lat, allStations[targetIdx - 1].lng) : Infinity;
        
        if (dTarget < 70) {
            return { type: 'at', index: targetIdx };
        }
        if (dPrevStation < 70 && targetIdx > 0) {
            return { type: 'at', index: targetIdx - 1 };
        }
        
        if (targetIdx > 0) {
            return { type: 'between', fromIndex: targetIdx - 1, toIndex: targetIdx };
        } else {
            return { type: 'between', fromIndex: 0, toIndex: 1 };
        }
    }
};

window._routeStopsCache = window._routeStopsCache || {};

window.getRouteStopsData = function(routeId) {
    if (window.fallbackRouteStops && window.fallbackRouteStops[routeId]) {
        return Promise.resolve({
            response: {
                body: {
                    items: {
                        item: window.fallbackRouteStops[routeId].map(st => ({
                            nodeid: st.nodeid,
                            nodenm: st.nodenm,
                            gpslati: st.gpslati,
                            gpslong: st.gpslong
                        }))
                    }
                }
            }
        });
    }

    if (window._routeStopsCache[routeId]) {
        return window._routeStopsCache[routeId];
    }
    
    window._routeStopsCache[routeId] = fetchAPI(`https://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteAcctoThrghSttnList?pageNo=1&numOfRows=500&_type=json&cityCode=37050&routeId=${routeId}`)
        .catch(err => {
            delete window._routeStopsCache[routeId]; // 실패 시 캐시 삭제
            throw err;
        });
        
    return window._routeStopsCache[routeId];
};

window.allRoutesTypeMap = {};

// 구미시 주요 랜드마크 키워드 목록 (학교 및 도서관 포함)
const GUMI_LANDMARKS = [
    { pat: '구미역', name: '구미역' },
    { pat: '사곡역', name: '사곡역' },
    { pat: '구미시청', name: '구미시청' },
    { pat: '금오공대', name: '금오공대' },
    { pat: '구미종합터미널', name: '구미종합터미널' },
    { pat: '구미터미널', name: '구미종합터미널' },
    { pat: '금오테크노', name: '금오테크노밸리' },
    { pat: '순천향', name: '순천향병원' },
    { pat: '차병원', name: '차병원' },
    { pat: '선산터미널', name: '선산터미널' },
    { pat: '인동', name: '인동' },
    { pat: '옥계', name: '옥계' },
    { pat: '봉곡', name: '봉곡' },
    { pat: '공단', name: '공단' },
    { pat: '형곡', name: '형곡' },
    { pat: '상모', name: '상모' },
    { pat: '도량', name: '도량' }
];

// 실시간 버스 위치 기준 향후 거쳐갈 랜드마크 추출 함수
window.getUpcomingLandmarks = function(stops, currentNodeId) {
    if (!stops || stops.length === 0) return [];
    var currentIdx = -1;
    if (currentNodeId) {
        currentIdx = stops.findIndex(function(s) { return s.nodeid === currentNodeId; });
    }
    
    // 현재 정류장 이후부터 검색
    var startIdx = (currentIdx !== -1) ? currentIdx + 1 : 0;
    var landmarks = [];
    var seen = new Set();
    
    for (var i = startIdx; i < stops.length; i++) {
        var stName = stops[i].nodenm || (stationCoords && stationCoords[stops[i].nodeid]?.name) || '';
        if (!stName) continue;
        
        // 1. 초등학교, 중학교, 고등학교, 도서관 패턴 매칭 (동적 추출)
        var schoolMatch = stName.match(/([가-힣]+초등학교|[가-힣]+중학교|[가-힣]+고등학교|[가-힣]+도서관)/);
        if (schoolMatch) {
            var foundName = schoolMatch[1];
            var display = foundName
                .replace('초등학교', '초')
                .replace('중학교', '중')
                .replace('고등학교', '고');
            if (!seen.has(display)) {
                seen.add(display);
                landmarks.push(display);
                if (landmarks.length === 4) return landmarks;
            }
            continue;
        }
        
        // 2. 기본 정적 랜드마크 매칭
        for (var j = 0; j < GUMI_LANDMARKS.length; j++) {
            var landmark = GUMI_LANDMARKS[j];
            if (stName.indexOf(landmark.pat) !== -1) {
                if (!seen.has(landmark.name)) {
                    seen.add(landmark.name);
                    landmarks.push(landmark.name);
                    if (landmarks.length === 4) return landmarks;
                }
                break;
            }
        }
    }
    
    // 검색 결과가 없는 경우 마지막 정류장명으로 대체
    if (landmarks.length === 0 && stops.length > 0) {
        var lastStop = stops[stops.length - 1];
        var lastStopName = lastStop.nodenm || (stationCoords && stationCoords[lastStop.nodeid]?.name) || '';
        if (lastStopName) {
            return [lastStopName.replace(/(앞|건너|입구|종점)/g, '')];
        }
    }
    
    return landmarks;
};

// 동적 버스 행선지 텍스트 반환 함수
window.getBusDestinationText = function(routeNo, routeId, currentNodeId, direction) {
    var rStr = String(routeNo || '');
    
    // 단방향 노선 및 일반 노선 처리 (순환 노선 포함)
    var stops = routeStops[routeId];
    if (stops && stops.length > 0) {
        var landmarks = window.getUpcomingLandmarks(stops, currentNodeId);
        if (landmarks && landmarks.length > 0) {
            return landmarks.join(',') + ' 방면';
        }
    }
    
    return direction + ' 방면';
};

window.getNormalizedVehicleNo = function(bus) {
    var raw = bus.vehicleno || bus.platNo || bus.vhclNo || bus.vehicleNo || "";
    if (!raw) return "무명";
    
    // 공백 제거
    raw = raw.replace(/\s+/g, "");
    
    var prefix = raw.startsWith("시뮬") ? "시뮬_" : "";
    
    // 끝 4자리 숫자 추출
    var match = raw.match(/\d{4}$/);
    if (match) {
        return prefix + match[0];
    }
    return prefix + raw;
};

window.getBusTypeInfo = function(routeNo) {
    var rStr = String(routeNo || '');
    if (rStr.includes('행복') || rStr.includes('DRT')) {
        return { label: 'DRT', color: '#8b5cf6', bgColor: '#f3e8ff' };
    }
    var type = window.allRoutesTypeMap[rStr] || '';
    if (type.includes('좌석') || type.includes('직행') || rStr === '170' || rStr === '171' || rStr === '111' || rStr === '188' || rStr === '196' || rStr.startsWith('50')) {
        return { label: '좌석', color: 'rgb(4,39,199)', bgColor: '#e0e7ff' }; // 좌석버스: rgb(4,39,199), 연한 인디고 배경
    }
    if (type.includes('농어촌') || type.includes('지선') || type.includes('마을')) {
        return { label: '농어촌', color: 'rgb(23,199,4)', bgColor: '#dcfce7' }; // 농어촌: rgb(23,199,4), 연한 그린 배경
    }
    return { label: '일반', color: 'rgb(23,199,4)', bgColor: '#dcfce7' }; // 일반버스: rgb(23,199,4), 연한 그린 배경
};

// 전체 노선 버튼 생성
setTimeout(() => {
    fetchAPI(`https://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteNoList?pageNo=1&numOfRows=1000&_type=json&cityCode=37050`)
    .then(data => {
        var items = data.response.body.items.item;
        if (items) {
            if (!Array.isArray(items)) items = [items];
            items.forEach(route => {
                let no = String(route.routeno).trim();
                let rid = String(route.routeid).trim();
                if (!allRoutesMap[no]) allRoutesMap[no] = [];
                if (!allRoutesMap[no].includes(rid)) {
                    allRoutesMap[no].push(rid);
                }
                window.allRoutesTypeMap[no] = route.routetpcd || '';
            });

            var selectorDiv = document.getElementById("route-selector");
            if(selectorDiv) selectorDiv.innerHTML = "";

            var routeNumbers = Object.keys(allRoutesMap).sort((a, b) => {
                let numA = parseInt(a.replace(/[^0-9]/g, '')) || 0;
                let numB = parseInt(b.replace(/[^0-9]/g, '')) || 0;
                return numA - numB;
            });

            routeNumbers.forEach(no => {
                var btn = document.createElement("button");
                var typeInfo = window.getBusTypeInfo(no);
                btn.innerHTML = `🚌 <span style="font-size:9px; color:${typeInfo.color}; border:1px solid ${typeInfo.color}; border-radius:3px; padding:1px 2px; margin-right:2px;">${typeInfo.label}</span>${no}번`;
                btn.style.cssText = btnStyle;
                btn.id = "btn-route-" + no;
                btn.onclick = function() { selectRoute(no); };
                if(selectorDiv) selectorDiv.appendChild(btn);
            });
        }
    }).catch(err => {
        let div = document.getElementById("route-selector");
        if(div) div.innerHTML = `<span style="color:red; font-weight:bold;">🚨 노선 목록 로드 실패: ${err.message}</span>`;
    });
}, 500);

// 버스 노선 초기화 함수 (길찾기 시 기존 버스 노선 삭제용)
window.clearBusRoute = function() {
    currentRenderId++; // Increment to invalidate any pending asynchronous fetches!
    if (currentSelectedRouteNo) {
        let prevBtn = document.getElementById("btn-route-" + currentSelectedRouteNo);
        if (prevBtn) prevBtn.style.cssText = btnStyle;
        currentSelectedRouteNo = null;
    }
    currentRoutePolylines.forEach(p => p.remove());
    currentRoutePolylines = [];
    Object.values(activeBuses || {}).forEach(b => { if (b.overlay) b.overlay.remove(); });
    activeBuses = {};
    window.routeSnappedCoords = {};
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    if (fetchIntervalId) {
        clearInterval(fetchIntervalId);
        fetchIntervalId = null;
    }
    // 패널 인터벌도 정리
    if (window._busRoutePanelInterval) {
        clearInterval(window._busRoutePanelInterval);
        window._busRoutePanelInterval = null;
    }
};

// 특정 노선 선택
window.selectRoute = function(routeNo) {
    console.log('[selectRoute] 노선 선택:', routeNo);
    
    // 길찾기 노선 및 출발/도착 정보가 활성화되어 있다면 지우기
    if (window.clearRouting) window.clearRouting();

    // 이전 노선 버튼 스타일 복구
    if (currentSelectedRouteNo) {
        let prevBtn = document.getElementById("btn-route-" + currentSelectedRouteNo);
        if (prevBtn) prevBtn.style.cssText = btnStyle;
    }
    currentSelectedRouteNo = routeNo;
    let activeBtn = document.getElementById("btn-route-" + routeNo);
    if (activeBtn) activeBtn.style.cssText = btnActiveStyle;

    // ── 이전 상태 완전 초기화 ──
    currentRoutePolylines.forEach(p => p.remove());
    currentRoutePolylines = [];
    Object.values(activeBuses || {}).forEach(b => { if (b.overlay) b.overlay.remove(); });
    activeBuses = {};
    window.routeSnappedCoords = {};
    
    // 애니메이션 프레임 완전 정리
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    // 실시간 버스 위치 갱신 인터벌 완전 정리
    if (fetchIntervalId) {
        clearInterval(fetchIntervalId);
        fetchIntervalId = null;
    }
    // 패널 갱신 인터벌 정리
    if (window._busRoutePanelInterval) {
        clearInterval(window._busRoutePanelInterval);
        window._busRoutePanelInterval = null;
    }
    
    stationCoords = {};
    routeStops = {};
    window._currentRouteCongestion = 1;
    window._currentCongestionSimulated = true;
    if(window.infoWindow) window.map.closePopup(window.infoWindow);

    if (window.openBusRoutePanel) window.openBusRoutePanel(routeNo);

    var routeIds = allRoutesMap[routeNo];
    if (!routeIds || routeIds.length === 0) return;

    currentRenderId++;
    let myRenderId = currentRenderId;
    window.currentActiveRouteNo = routeNo;
    window.currentActiveRouteIds = routeIds;
    window.currentActiveRenderId = myRenderId;

    async function fetchAllRoutes(routeIds, routeNo, myRenderId) {
        console.log('[fetchAllRoutes] 시작:', routeNo, 'renderId:', myRenderId, 'current:', currentRenderId);
        if (myRenderId !== currentRenderId) {
            console.log('[fetchAllRoutes] 중단 (renderId 불일치)');
            return;
        }

        let successCount = 0;
        let routeBounds = L.latLngBounds();
        for (let i = 0; i < routeIds.length; i++) {
            let routeId = routeIds[i];
            try {
                let data = await window.getRouteStopsData(routeId);
                if (myRenderId !== currentRenderId) return;

                if (data && data.response && data.response.body && data.response.body.items) {
                    var itemsBody = data.response.body.items;
                    if (itemsBody && typeof itemsBody === 'object' && itemsBody.item) {
                        var items = itemsBody.item;
                        if (!Array.isArray(items)) items = [items];

                        let currentStops = [];
                        let orderedNodes = [];
                        items.forEach(function(sttn) {
                            stationCoords[sttn.nodeid] = { lat: sttn.gpslati, lng: sttn.gpslong, name: sttn.nodenm };
                            currentStops.push({ lat: sttn.gpslati, lng: sttn.gpslong });
                            orderedNodes.push({ nodeid: sttn.nodeid, lat: sttn.gpslati, lng: sttn.gpslong });
                            routeBounds.extend([sttn.gpslati, sttn.gpslong]);
                        });
                        routeStops[routeId] = orderedNodes;

                        var typeInfo = window.getBusTypeInfo(routeNo);
                        var color = typeInfo.color;
                        
                        // [업그레이드 Task 2] 노선도 직선 문제 해결 (실제 도로 스냅 - 청크 분할)
                        drawRoadSnappedRoute(currentStops, color, myRenderId, routeId);
                        successCount++;
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (err) {
                console.warn(`${routeId} 로드 실패:`, err);
            }
        }

        if (successCount === 0) {
            alert("🚨 렌더링 실패: API 트래픽 초과");
        } else {
            // 혼잡도 데이터 가져오기
            routeIds.forEach(function(rid) {
                fetchBusCongestion(rid).then(function(data) {
                    if (data && data.length > 0) {
                        window._currentRouteCongestion = data[0].congestionLevel || 1;
                        window._currentCongestionSimulated = (window.busCongestionCache[rid] && window.busCongestionCache[rid].source === 'simulated');
                    }
                });
            });
            console.log('[fetchAllRoutes] 성공:', successCount, '개 노선 로드. 실시간 버스 추적 시작');
            fetchRealBuses(routeIds, routeNo, myRenderId);
            
            // [연구지도 연동] 굴곡도 및 표정속도 계산 호출
            if (window.currentMapMode === 'research' && typeof window.calculateRouteMetrics === 'function') {
                let stopsFlat = [];
                Object.values(routeStops).forEach(stopsArr => {
                    stopsArr.forEach(s => stopsFlat.push(s));
                });
                setTimeout(function() {
                    window.calculateRouteMetrics(routeNo, stopsFlat);
                }, 1000);
            }
            
            // 노선이 그려지면 해당 노선이 보이도록 지도 자동 줌인
            if (myRenderId === currentRenderId && routeBounds.isValid()) {
                window.map.fitBounds(routeBounds, { padding: [50, 50], maxZoom: 15 });
            }

            // 실시간 버스 움직임 업데이트 주기를 15초 -> 4초로 변경하여 동적 무브먼트 구현 (C4: 중복 타이머 해제 보강)
            if (myRenderId === currentRenderId) {
                if (fetchIntervalId) {
                    clearInterval(fetchIntervalId);
                }
                fetchIntervalId = setInterval(() => {
                    if (myRenderId !== currentRenderId) {
                        clearInterval(fetchIntervalId);
                        fetchIntervalId = null;
                        console.log('[fetchRealBuses interval] 자동 정지 (renderId 불일치)');
                        return;
                    }
                    fetchRealBuses(routeIds, routeNo, myRenderId);
                }, window.GUMAP_CONSTANTS.BUS.FETCH_INTERVAL_MS);
            }
        }
    }

    fetchAllRoutes(routeIds, routeNo, myRenderId);
};

// [업그레이드] 실제 도로 따라가는 버스 노선 그리기 (TMAP 경유지 활용)
window._tmapRoutingQueue = Promise.resolve();
window._tmapRateLimitExceeded = false; // 일일 트래픽 초과 여부 저장 플래그

async function drawRoadSnappedRoute(stops, color, myRenderId, routeId) {
    if (stops.length < 2) return;
    
    // [성능 극대화] 로컬 스토리지 캐시 확인하여 초고속(1ms) 즉시 렌더링 지원
    if (routeId) {
        let cached = localStorage.getItem('snapped_route_' + routeId);
        if (cached) {
            try {
                let linePath = JSON.parse(cached);
                if (Array.isArray(linePath) && linePath.length > 0 && myRenderId === currentRenderId) {
                    console.log(`[drawRoadSnappedRoute] ${routeId} 캐시 로드 성공. (인스턴트 렌더링)`);
                    
                    let polyBg = L.polyline(linePath, {
                        color: color, weight: 11, opacity: 0.3, lineCap: 'round', lineJoin: 'round'
                    }).addTo(window.map);
                    
                    let polyFg = L.polyline(linePath, {
                        color: color, weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round'
                    }).addTo(window.map);

                    // Hover interactions
                    polyFg.on('mouseover', function() {
                        polyFg.setStyle({ weight: 8, opacity: 1.0 });
                        polyBg.setStyle({ weight: 15, opacity: 0.5 });
                    });
                    polyFg.on('mouseout', function() {
                        polyFg.setStyle({ weight: 5, opacity: 0.9 });
                        polyBg.setStyle({ weight: 11, opacity: 0.3 });
                    });

                    currentRoutePolylines.push(polyBg);
                    currentRoutePolylines.push(polyFg);
                    
                    if (!window.routeSnappedCoords) window.routeSnappedCoords = {};
                    window.routeSnappedCoords[routeId] = linePath;

                    // 🌟 WebGL 벡터지도에도 즉시 도로 궤적 렌더링
                    if (typeof window.renderGuMapWebGLRoute === 'function') {
                        window.renderGuMapWebGLRoute(linePath, color);
                    }
                    return; 
                }
            } catch (cacheErr) {
                console.warn("캐시 파싱 에러:", cacheErr);
            }
        }
    }
    
    // TMAP 제약(passList 최대 5개)에 맞춰 6단위로 쪼개기 (시작1 + 경유최대5 + 끝1)
    let chunks = [];
    for (let i = 0; i < stops.length - 1; i += 6) {
        let chunk = stops.slice(i, Math.min(i + 7, stops.length));
        if (chunk.length >= 2) chunks.push(chunk);
    }

    for (let chunk of chunks) {
        if (myRenderId !== currentRenderId) break;
        
        let start = chunk[0];
        let end = chunk[chunk.length - 1];
        let passList = chunk.slice(1, chunk.length - 1).map(s => `${s.lng},${s.lat}`).join("_");

        let payload = {
            startX: start.lng, startY: start.lat,
            endX: end.lng, endY: end.lat,
            reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO",
            searchOption: "0", trafficInfo: "N"
        };
        if (passList) payload.passList = passList;

        // 글로벌 큐를 이용해 API 호출을 직렬화
        await new Promise(resolveChunk => {
            window._tmapRoutingQueue = window._tmapRoutingQueue.then(async () => {
                if (myRenderId !== currentRenderId) {
                    resolveChunk();
                    return;
                }

                let maxRetries = 1;
                let attempt = 0;
                let success = false;

                while (attempt <= maxRetries && !success && myRenderId === currentRenderId) {
                    try {
                        if (window._tmapRateLimitExceeded) {
                            throw new Error("TMAP 한도 초과 - OSRM 우회");
                        }

                        let data = await fetchWithRetry(`${window.PROXY_URL}/tmap-routes?version=1`, {
                            method: "POST",
                            headers: { "Accept": "application/json", "Content-Type": "application/json", },
                            body: JSON.stringify(payload)
                        }, window.GUMAP_CONSTANTS.API.MAX_RETRIES);
                        
                        if (data.features && myRenderId === currentRenderId) {
                            data.features.forEach(feature => {
                                if (feature.geometry.type === "LineString") {
                                    let linePath = [];
                                    feature.geometry.coordinates.forEach(coord => {
                                        linePath.push([coord[1], coord[0]]); // [lat, lng]
                                    });
                                    
                                    let polyBg = L.polyline(linePath, {
                                        color: color, weight: 11, opacity: 0.3, lineCap: 'round', lineJoin: 'round'
                                    }).addTo(window.map);
                                    let polyFg = L.polyline(linePath, {
                                        color: color, weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round'
                                    }).addTo(window.map);

                                    // Hover interactions for line scaling
                                    polyFg.on('mouseover', function() {
                                        polyFg.setStyle({ weight: 8, opacity: 1.0 });
                                        polyBg.setStyle({ weight: 15, opacity: 0.5 });
                                    });
                                    polyFg.on('mouseout', function() {
                                        polyFg.setStyle({ weight: 5, opacity: 0.9 });
                                        polyBg.setStyle({ weight: 11, opacity: 0.3 });
                                    });

                                    currentRoutePolylines.push(polyBg);
                                    currentRoutePolylines.push(polyFg);

                                    // 도로 매칭 좌표 저장
                                    if (routeId) {
                                        if (!window.routeSnappedCoords) window.routeSnappedCoords = {};
                                        if (!window.routeSnappedCoords[routeId]) window.routeSnappedCoords[routeId] = [];
                                        window.routeSnappedCoords[routeId] = window.routeSnappedCoords[routeId].concat(linePath);
                                    }
                                }
                            });
                            success = true;
                        } else if (myRenderId === currentRenderId) {
                            throw new Error("TMAP returned no features");
                        }
                    } catch (e) {
                        // TMAP 실패 시 OSRM(오픈소스 라우팅)으로 무과금/무제한 우회 시도
                        try {
                            if (myRenderId !== currentRenderId) break;
                            
                            let osrmCoords = chunk.map(s => `${s.lng},${s.lat}`).join(';');
                            let osrmUrl = `https://router.project-osrm.org/route/v1/driving/${osrmCoords}?overview=full&geometries=geojson`;
                            let osrmData = await fetchWithRetry(osrmUrl, {}, window.GUMAP_CONSTANTS.API.MAX_RETRIES);
                            if (osrmData.code === "Ok" && osrmData.routes.length > 0) {
                                let linePath = osrmData.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
                                 let polyBg = L.polyline(linePath, {
                                     color: color, weight: 11, opacity: 0.3, lineCap: 'round', lineJoin: 'round'
                                 }).addTo(window.map);
                                 let polyFg = L.polyline(linePath, {
                                     color: color, weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round'
                                 }).addTo(window.map);

                                 // Hover interactions for line scaling
                                 polyFg.on('mouseover', function() {
                                     polyFg.setStyle({ weight: 8, opacity: 1.0 });
                                     polyBg.setStyle({ weight: 15, opacity: 0.5 });
                                 });
                                 polyFg.on('mouseout', function() {
                                     polyFg.setStyle({ weight: 5, opacity: 0.9 });
                                     polyBg.setStyle({ weight: 11, opacity: 0.3 });
                                 });

                                 currentRoutePolylines.push(polyBg);
                                 currentRoutePolylines.push(polyFg);

                                // 도로 매칭 좌표 저장
                                if (routeId) {
                                    if (!window.routeSnappedCoords) window.routeSnappedCoords = {};
                                    if (!window.routeSnappedCoords[routeId]) window.routeSnappedCoords[routeId] = [];
                                    window.routeSnappedCoords[routeId] = window.routeSnappedCoords[routeId].concat(linePath);
                                }
                                success = true;
                            }
                        } catch (err2) {
                            console.warn("OSRM 우회 실패:", err2);
                        }
                    }
                    attempt++;
                }
                await new Promise(resolveDelay => setTimeout(resolveDelay, window._tmapRateLimitExceeded ? 100 : 600));
                resolveChunk();
            });
        });
    }
    
    // [성능 극대화] 전체 지오메트리 수집 완료 후 로컬 스토리지 캐시 저장
    if (routeId && window.routeSnappedCoords && window.routeSnappedCoords[routeId] && window.routeSnappedCoords[routeId].length > 0 && myRenderId === currentRenderId) {
        localStorage.setItem('snapped_route_' + routeId, JSON.stringify(window.routeSnappedCoords[routeId]));
        console.log(`[drawRoadSnappedRoute] ${routeId} 캐시 저장 완료.`);
        if (typeof window.renderGuMapWebGLRoute === 'function') {
            window.renderGuMapWebGLRoute(window.routeSnappedCoords[routeId], color);
        }
    }
}

// [업그레이드 신규 API] 초정밀 버스 및 기존 버스 혼합 렌더링
function fetchRealBuses(routeIds, routeNo, myRenderId) {
    if (myRenderId !== currentRenderId) return;

    // 1. 구미시 초정밀 API 전체 조회 (type=JSON 및 stdgCd=4719000000 명시)
    fetchAPI(`https://apis.data.go.kr/B551982/rte/rtm_loc_info?pageNo=1&numOfRows=1000&_type=json&type=JSON&stdgCd=4719000000`)
    .then(ultraData => {
        window._ultraPrecisePositions = {};
        var items = null;
        if (ultraData) {
            if (ultraData.body && ultraData.body.items) {
                items = ultraData.body.items.item;
            } else if (ultraData.response && ultraData.response.body && ultraData.response.body.items) {
                items = ultraData.response.body.items.item;
            }
        }
        if (items) {
            if (!Array.isArray(items)) items = [items];
            items.forEach(function(item) {
                var vno = window.getNormalizedVehicleNo(item);
                var gthr = item.gthrDt || item.gthr_dt || item.gthrdt;
                var isRecent = true;
                if (gthr) {
                    var str = String(gthr).replace(/[^0-9]/g, '');
                    if (str.length >= 14) {
                        var y = parseInt(str.slice(0, 4));
                        var m = parseInt(str.slice(4, 6)) - 1;
                        var d = parseInt(str.slice(6, 8));
                        var h = parseInt(str.slice(8, 10));
                        var min = parseInt(str.slice(10, 12));
                        var s = parseInt(str.slice(12, 14));
                        var recordTime = new Date(y, m, d, h, min, s).getTime();
                        
                        // 실서버에서는 5분(300,000ms) 이내만 신선함으로 인정, 개발/로컬/클라우드플레어 환경에서는 디버그를 위해 30일(2592000000ms)까지 허용
                        var timeDiff = Math.abs(Date.now() - recordTime);
                        var isDevEnv = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:' || window.location.hostname.includes('trycloudflare.com'));
                        var maxDiff = isDevEnv ? 86400000 * 30 : 300000;
                        if (timeDiff > maxDiff) {
                            isRecent = false;
                        }
                    }
                }
                if (isRecent && item.lat && item.lot) {
                    window._ultraPrecisePositions[vno] = {
                        lat: parseFloat(item.lat),
                        lng: parseFloat(item.lot),
                        time: Date.now()
                    };
                }
            });
        }
    })
    .catch(err => {
        console.warn("Ultra-precise fetch failed:", err);
    })
    .finally(function() {
        // 2. 표준 TAGO API 노선별 위치 조회
        Promise.all(routeIds.map(routeId => {
            return fetchAPI(`https://apis.data.go.kr/1613000/BusLcInfoInqireService/getRouteAcctoBusLcList?pageNo=1&numOfRows=100&_type=json&cityCode=37050&routeId=${routeId}`)
            .catch(err => {
                console.warn(`[fetchRealBuses] routeId ${routeId} fetch failed:`, err);
                return null;
            });
        }))
        .then(results => {
            if (myRenderId !== currentRenderId) return;

            var typeInfo = window.getBusTypeInfo(routeNo);
            var color = typeInfo.color;
            let currentActiveVehicles = new Set();
            
            // 로컬스토리지에서 정차 기록을 불러옵니다.
            var trackingHistory = {};
            try {
                var saved = localStorage.getItem('gumap_bus_tracking_history');
                if (saved) trackingHistory = JSON.parse(saved);
            } catch (e) {
                console.error("Failed to parse tracking history:", e);
            }

            results.forEach((data, index) => {
                var routeId = routeIds[index];
                var direction = (index === 0) ? "상행" : (index === 1) ? "하행" : "지선";
                
                var buses = null;
                if (data && data.response && data.response.body && data.response.body.items) {
                    buses = data.response.body.items.item;
                    if (buses && !Array.isArray(buses)) buses = [buses];
                }

                // TAGO API 장애/한도초과/만료 시 가상 버스 시뮬레이션 가동 (강력한 대비 장치)
                if (!buses || buses.length === 0) {
                    let stops = window.routeStops ? window.routeStops[routeId] : null;
                    if (stops && stops.length > 0) {
                        buses = [];
                        var timeFactor = Math.floor(Date.now() / 20000); // 20초 주기
                        var numSimBuses = Math.min(3, Math.max(1, Math.floor(stops.length / 12)));
                        for (var i = 0; i < numSimBuses; i++) {
                            var step = Math.floor(stops.length / numSimBuses);
                            var stopIdx = (i * step + timeFactor) % stops.length;
                            var currentStop = stops[stopIdx];
                            if (currentStop) {
                                buses.push({
                                    nodeid: currentStop.nodeid || currentStop.nodeId,
                                    nodenm: currentStop.nodenm || currentStop.nodeNm,
                                    vehicleno: `시뮬경북12바${routeId.slice(-4)}${i+1}`,
                                    gpslati: currentStop.lat,
                                    gpslong: currentStop.lng,
                                    velocity: 30 + ((timeFactor + i) % 15),
                                    isSimulated: true
                                });
                            }
                        }
                    }
                }

                if (buses) {
                    buses.forEach(function(bus) {
                            var vno = window.getNormalizedVehicleNo(bus);
                            
                            // 초정밀 API의 매핑 좌표 확인
                            var ultraPos = window._ultraPrecisePositions ? window._ultraPrecisePositions[vno] : null;
                            var isUltra = !!ultraPos;
                            
                            // 표준 API도 gpslati, gpslong이 있으면 스냅 대신 GPS 직접 활용 (0이거나 유효하지 않은 값 방지)
                            var targetLat = isUltra ? ultraPos.lat : ((bus.gpslati && parseFloat(bus.gpslati) > 0) ? parseFloat(bus.gpslati) : (stationCoords[bus.nodeid] ? parseFloat(stationCoords[bus.nodeid].lat) : null));
                            var targetLng = isUltra ? ultraPos.lng : ((bus.gpslong && parseFloat(bus.gpslong) > 0) ? parseFloat(bus.gpslong) : (stationCoords[bus.nodeid] ? parseFloat(stationCoords[bus.nodeid].lng) : null));

                            if (!targetLat || !targetLng) return;

                            // 구미시 경계 범위 외 데이터 필터링 (도시 충돌 방지)
                            if (targetLat < 35.8 || targetLat > 36.5 || targetLng < 127.8 || targetLng > 128.7) {
                                return;
                            }

                            // 대기 중인(동일 정류장 2분 이상) 고스트 버스 정리 로직 (localStorage 연동)
                            if (bus.nodeid) {
                                var historyKey = routeId + '_' + vno;
                                var hist = trackingHistory[historyKey];
                                if (!hist) {
                                    hist = {
                                        lastNodeId: bus.nodeid,
                                        lastNodeChangeTime: Date.now()
                                    };
                                    trackingHistory[historyKey] = hist;
                                } else {
                                    if (hist.lastNodeId !== bus.nodeid) {
                                        hist.lastNodeId = bus.nodeid;
                                        hist.lastNodeChangeTime = Date.now();
                                    } else {
                                        var stationaryDuration = Date.now() - (hist.lastNodeChangeTime || Date.now());
                                        if (stationaryDuration > 43200000) { // 12시간 이상 차이나면 과거 세션으로 간주하고 리셋
                                            hist.lastNodeChangeTime = Date.now();
                                            stationaryDuration = 0;
                                        }
                                        var isTerminal = false;
                                        let stops = window.routeStops ? window.routeStops[routeId] : null;
                                        if (stops && stops.length > 0) {
                                            var idx = stops.findIndex(s => s.nodeid === bus.nodeid);
                                            if (idx === 0 || idx === stops.length - 1) {
                                                isTerminal = true;
                                            }
                                        }
                                        if (!isTerminal && stationaryDuration > 600000) {
                                            return; // 고스트 버스 스킵 (마커 제거용, 10분)
                                        }
                                    }
                                }
                            }

                            currentActiveVehicles.add(vno);

                            var speedStr = bus.velocity ? ` ⚡${bus.velocity}km/h` : "";
                            var congLevel = window._currentRouteCongestion || 1;
                            var congInfo = getCongestionInfo(congLevel);
                            var congDot = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${congInfo.color}; margin-right:3px; border:1px solid white; vertical-align:middle;"></span>`;
                            
                            var destText = window.getBusDestinationText(routeNo, routeId, bus.nodeid, direction);
                            var safeVno = String(vno).replace(/[^a-zA-Z0-9가-힣]/g, '_');
                            
                            if (!activeBuses[vno]) {
                                var neonGlowColor = color + '4d'; // 30% alpha neon color
                                var isSim = bus.isSimulated || vno.startsWith('시뮬');
                                var vnoLabel = isSim ? "시뮬" : vno.slice(-4);
                                var initialHeading = 'right';
                                var busImgSrc = 'GUMAP-아이콘/버스 (우).png';

                                var content = `<div class="bus-3d-marker-container" style="display:flex; flex-direction:column; align-items:center; transform:translate(-50%, -85%); pointer-events:auto; cursor:pointer;">
                                    <img src="${busImgSrc}" class="bus-3d-sprite bus-sprite-${safeVno}" style="width:22px; height:auto; filter:drop-shadow(0 4px 6px rgba(0,0,0,0.35)); margin-bottom:2px; transition:transform 0.15s ease;" alt="버스">
                                    <div class="bus-acrylic-capsule" style="--bus-color:${color}; --bus-color-neon:${neonGlowColor};">${congDot} <span style="color:${color}; font-weight:800;">${routeNo}번</span> <span style="font-weight:normal; margin: 0 4px; opacity:0.5;">|</span> <span style="opacity:0.95;">${destText}${speedStr}</span> <span style="font-size:10px; color:#94a3b8; font-weight:normal; margin-left:3px;">(${vnoLabel})</span></div>
                                </div>`;
                                var busIcon = L.divIcon({
                                    html: content,
                                    className: 'bus-marker-icon',
                                    iconSize: [0, 0],
                                    iconAnchor: [0, 0]
                                });
                                var overlay = L.marker([targetLat, targetLng], { icon: busIcon, zIndexOffset: 1000 }).addTo(window.map);
                                
                                activeBuses[vno] = {
                                    overlay: overlay,
                                    lat: targetLat,
                                    lng: targetLng,
                                    targetLat: targetLat,
                                    targetLng: targetLng,
                                    currentNodeId: bus.nodeid,
                                    routeId: routeId,
                                    isUltraPrecise: isUltra,
                                    vehicleno: vno,
                                    safeVno: safeVno,
                                    heading: initialHeading
                                };
                            } else {
                                let b = activeBuses[vno];
                                
                                // 속도 및 마커 내용 업데이트
                                var newCongInfo = getCongestionInfo(window._currentRouteCongestion || 1);
                                var newCongDot = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${newCongInfo.color}; margin-right:3px; border:1px solid white; vertical-align:middle;"></span>`;
                                var neonGlowColor = color + '4d';
                                var isSim = bus.isSimulated || vno.startsWith('시뮬');
                                var vnoLabel = isSim ? "시뮬" : vno.slice(-4);
                                var curHeading = b.heading || 'right';
                                var busImgSrc = (curHeading === 'left') ? 'GUMAP-아이콘/버스(좌).png' : 'GUMAP-아이콘/버스 (우).png';

                                var newContent = `<div class="bus-3d-marker-container" style="display:flex; flex-direction:column; align-items:center; transform:translate(-50%, -85%); pointer-events:auto; cursor:pointer;">
                                    <img src="${busImgSrc}" class="bus-3d-sprite bus-sprite-${b.safeVno || safeVno}" style="width:22px; height:auto; filter:drop-shadow(0 4px 6px rgba(0,0,0,0.35)); margin-bottom:2px; transition:transform 0.15s ease;" alt="버스">
                                    <div class="bus-acrylic-capsule" style="--bus-color:${color}; --bus-color-neon:${neonGlowColor};">${newCongDot} <span style="color:${color}; font-weight:800;">${routeNo}번</span> <span style="font-weight:normal; margin: 0 4px; opacity:0.5;">|</span> <span style="opacity:0.95;">${destText}${speedStr}</span> <span style="font-size:10px; color:#94a3b8; font-weight:normal; margin-left:3px;">(${vnoLabel})</span></div>
                                </div>`;
                                b.overlay.setIcon(L.divIcon({
                                    html: newContent,
                                    className: 'bus-marker-icon',
                                    iconSize: [0, 0],
                                    iconAnchor: [0, 0]
                                }));

                                b.targetLat = targetLat;
                                b.targetLng = targetLng;
                                b.currentNodeId = bus.nodeid;
                                b.isUltraPrecise = isUltra;
                                b.vehicleno = vno;
                            }
                        });
                    }
            });

            // 정차 기록을 저장합니다.
            try {
                localStorage.setItem('gumap_bus_tracking_history', JSON.stringify(trackingHistory));
            } catch (e) {
                console.error("Failed to save tracking history:", e);
            }

            Object.keys(activeBuses).forEach(vno => {
                if (!currentActiveVehicles.has(vno)) {
                    if (activeBuses[vno].overlay) {
                        activeBuses[vno].overlay.remove();
                    }
                    delete activeBuses[vno];
                }
            });

            if (!animationFrameId) animateBuses(myRenderId);
        });
    });
}

function findClosestIndex(lat, lng, coords) {
    var minD = Infinity;
    var minIdx = -1;
    for (var i = 0; i < coords.length; i++) {
        var dy = coords[i][0] - lat;
        var dx = coords[i][1] - lng;
        var d = dy * dy + dx * dx;
        if (d < minD) {
            minD = d;
            minIdx = i;
        }
    }
    return minIdx;
}

// 움직이는 버스의 진행 방향(좌/우)에 따라 전용 3D 버스 스프라이트(버스(좌).png / 버스 (우).png)를 실시간 전환
function updateBusSpriteDirection(b, dLng) {
    if (!b) return;
    var THRESHOLD = 0.000002;
    if (Math.abs(dLng) < THRESHOLD) return;
    
    var newHeading = (dLng < 0) ? 'left' : 'right';
    if (b.heading !== newHeading) {
        b.heading = newHeading;
        var sId = b.safeVno || String(b.vehicleno).replace(/[^a-zA-Z0-9가-힣]/g, '_');
        var sprite = document.querySelector('.bus-sprite-' + sId);
        if (sprite) {
            sprite.src = (newHeading === 'left') ? 'GUMAP-아이콘/버스(좌).png' : 'GUMAP-아이콘/버스 (우).png';
        }
    }
}

function animateBuses(myRenderId) {
    // 좀비 애니메이션 방지: 현재 렌더 ID와 불일치 시 자동 종료
    if (myRenderId !== undefined && myRenderId !== currentRenderId) {
        console.log('[animateBuses] 좀비 루프 종료 (렌더ID 불일치)');
        animationFrameId = null;
        return;
    }
    
    let speed = 0.003; // Leaflet 프레임 애니메이션 속도 보정 (직선 이동 시)
    let snappedSpeed = 0.02; // 스냅된 도로 위 이동 시 속도 보정
    
    Object.values(activeBuses).forEach(b => {
        var moved = false;
        if (b.routeId && window.routeSnappedCoords && window.routeSnappedCoords[b.routeId]) {
            var coords = window.routeSnappedCoords[b.routeId];
            if (coords && coords.length > 0) {
                // 인덱스 캐싱을 통한 획기적인 CPU 연산 감소 (60FPS 보장)
                if (b.currentIndex === undefined || b.currentIndex === -1) {
                    b.currentIndex = findClosestIndex(b.lat, b.lng, coords);
                }
                if (b.targetIndex === undefined || b.targetIndex === -1 || b.lastTargetLat !== b.targetLat || b.lastTargetLng !== b.targetLng) {
                    b.targetIndex = findClosestIndex(b.targetLat, b.targetLng, coords);
                    b.lastTargetLat = b.targetLat;
                    b.lastTargetLng = b.targetLng;
                }
                
                var currIdx = b.currentIndex;
                var tgtIdx = b.targetIndex;
                
                if (currIdx !== -1 && tgtIdx !== -1 && currIdx !== tgtIdx) {
                    // 만약 현재 인덱스와 대상 인덱스 차이가 너무 크면 (예: 15개 세그먼트 이상),
                    // 도로를 하나씩 기어가지 않고 즉시 대상 위치로 snap 처리하여 지연 현상을 방지합니다.
                    if (Math.abs(currIdx - tgtIdx) > window.GUMAP_CONSTANTS.BUS.JUMP_GUARD_THRESHOLD) {
                        b.lat = b.targetLat;
                        b.lng = b.targetLng;
                        b.currentIndex = tgtIdx;
                    } else {
                        var nextIdx = (currIdx < tgtIdx) ? currIdx + 1 : currIdx - 1;
                        var nextCoord = coords[nextIdx];
                        
                        var dLat = nextCoord[0] - b.lat;
                        var dLng = nextCoord[1] - b.lng;
                        updateBusSpriteDirection(b, dLng);
                        var distSq = dLat * dLat + dLng * dLng;
                        
                        if (distSq < 0.00000001) {
                            b.lat = nextCoord[0];
                            b.lng = nextCoord[1];
                            b.currentIndex = nextIdx; // 도달 후 현재 인덱스 증가
                        } else {
                            b.lat += dLat * snappedSpeed;
                            b.lng += dLng * snappedSpeed;
                        }
                    }
                    b.overlay.setLatLng([b.lat, b.lng]);
                    moved = true;
                }
            }
        }

        if (!moved) {
            let dLat = b.targetLat - b.lat;
            let dLng = b.targetLng - b.lng;
            updateBusSpriteDirection(b, dLng);
            let distSq = dLat * dLat + dLng * dLng;

            if (distSq > 0.0000000001) { 
                b.lat += dLat * speed;
                b.lng += dLng * speed;
                b.overlay.setLatLng([b.lat, b.lng]);
            }
        }
    });
    animationFrameId = requestAnimationFrame(() => animateBuses(myRenderId));
}

// ============================================
// 버스 노선 상세 패널 (검색 시 우측에 표시)
// ============================================
window.getSegmentTrafficColor = function(st, nextSt, routeNo) {
    if (!nextSt) return '#10b981'; // 기본 초록색
    
    // 노드 ID 조합 기반 데시벨 해시 산출 (깜빡임 없는 일관성 유지)
    var hashStr = st.nodeId + '-' + nextSt.nodeId;
    var hash = 0;
    for (var i = 0; i < hashStr.length; i++) {
        hash = hashStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // 5분 단위로 교통 상황 변화 반영
    var timeFactor = Math.floor(new Date().getMinutes() / 5);
    hash = hash + timeFactor;
    
    var level = Math.abs(hash) % 4; // 0, 1, 2, 3
    
    // 출퇴근 시간대(07~09, 17~19시)에는 정체(3) 및 지체(2) 확률 증가
    var hour = new Date().getHours();
    var isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
    if (isRushHour) {
        level = (level + 1) % 4;
    }
    
    // 색상 등급: 붉은색(정체), 주황색(지체), 초록색(서행), 파란색(원활)
    switch(level) {
        case 0: return '#3b82f6'; // 파란색 (원활)
        case 1: return '#10b981'; // 초록색 (서행)
        case 2: return '#f97316'; // 주황색 (지체)
        case 3: return '#ef4444'; // 붉은색 (정체)
        default: return '#10b981';
    }
};

window.openBusRoutePanel = function(routeNo) {
    console.log('[openBusRoutePanel] 패널 열기:', routeNo);
    
    // 닫힘 예약 타이머 취소 (오픈 직전에 닫히는 현상 방지)
    if (window._closeBusPanelTimeout) {
        clearTimeout(window._closeBusPanelTimeout);
        window._closeBusPanelTimeout = null;
    }
    
    // 이전 패널 갱신 인터벌 완전 정리
    if (window._busRoutePanelInterval) {
        clearInterval(window._busRoutePanelInterval);
        window._busRoutePanelInterval = null;
    }
    
    // 고유 패널 렌더 ID로 비동기 경합 방지
    window._panelRenderId = (window._panelRenderId || 0) + 1;
    var myPanelId = window._panelRenderId;
    
    window.currentBusPanelRouteNo = routeNo;
    var routeIds = allRoutesMap[routeNo];
    if (!routeIds || routeIds.length === 0) return;

    // 패널 생성 또는 재사용
    var panel = document.getElementById('bus-route-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'bus-route-panel';
        panel.className = 'glass-panel panel-expanded';
        panel.style.opacity = '0';
        if (window.innerWidth > 768) {
            panel.style.transform = 'translateX(-10px)';
        } else {
            panel.style.transform = 'translateY(110%)';
        }
        document.body.appendChild(panel);
    } else {
        panel.className = 'glass-panel panel-expanded';
    }
    
    if (window._closeBusPanelTimeout) {
        clearTimeout(window._closeBusPanelTimeout);
        window._closeBusPanelTimeout = null;
    }
    
    panel.style.display = 'block';
    setTimeout(function() { 
        panel.style.opacity = '1'; 
        if (window.innerWidth > 768) {
            panel.style.transform = 'translateX(0)';
        } else {
            panel.style.transform = 'translateY(0)';
        }
    }, 10);

    var typeInfo = window.getBusTypeInfo(routeNo);
    panel.innerHTML = `
    <div style="position:relative; font-family:'Noto Sans KR',sans-serif;">
        <button onclick="window.closeBusRoutePanel()" style="position:absolute; top:-5px; right:-5px; background:none; border:none; font-size:22px; cursor:pointer; color:#94a3b8; font-weight:700;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#94a3b8'">&times;</button>
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--border-panel); padding-bottom:10px; margin-bottom:10px;">
            <h3 style="margin:0; font-size:16px; color:var(--text-main); font-weight:700;">
                <span style="font-size:11px; padding:2px 6px; border-radius:4px; background:${typeInfo.bgColor}; color:${typeInfo.color}; margin-right:4px;">${typeInfo.label}</span>
                <span class="bus-badge-glow">BUS</span> <span style="margin-left:2px;">${routeNo}번 실시간 정보</span>
            </h3>
        </div>
        <div style="text-align:center; padding:20px; color:var(--text-muted);">⏳ 정류장 정보를 불러오는 중...</div>
    </div>`;

    // 모든 routeId의 정류장을 수집
    var allStops = [];
    var loadedCount = 0;
    var totalToLoad = routeIds.length;

    routeIds.forEach(function(routeId, rIdx) {
        // 패널 렌더 ID 불일치 시 즉시 중단 (이전 노선의 비동기 콜백이 현재 패널을 덮어쓰는 것 방지)
        if (myPanelId !== window._panelRenderId) return;
        
        var type = window.allRoutesTypeMap[routeNo] || '';
        var direction = '상행';
        if (routeNo === '11' || (type.includes('순환') && rIdx === 0)) {
            direction = '내선순환';
        } else if (routeNo === '111' || (type.includes('순환') && rIdx === 1)) {
            direction = '외선순환';
        } else if (routeIds.length === 1 || routeNo === '340') {
            direction = '단방향';
        } else {
            direction = rIdx === 0 ? '상행' : rIdx === 1 ? '하행' : '지선' + (rIdx - 1);
        }

        window.getRouteStopsData(routeId)
        .then(function(data) {
            // 비동기 완료 시점에도 패널 ID 재검증
            if (myPanelId !== window._panelRenderId) return;
            
            try {
                if (data && data.response && data.response.body && data.response.body.items) {
                    var itemsBody = data.response.body.items;
                    if (itemsBody && typeof itemsBody === 'object' && itemsBody.item) {
                        var items = itemsBody.item;
                        if (!Array.isArray(items)) items = [items];
                        allStops.push({ direction: direction, routeId: routeId, stations: items });
                    }
                }
            } catch (e) { console.error("Bus stops parsing error:", e); }
        })
        .catch(function(e) { console.error("Bus stops fetch error:", e); })
        .finally(function() {
            loadedCount++;
            if (loadedCount === totalToLoad) {
                // 최종 렌더 시점에서도 패널 ID 재검증
                if (myPanelId !== window._panelRenderId) {
                    console.log('[openBusRoutePanel] 패널 렌더 중단 (렌더ID 불일치)');
                    return;
                }
                if (window.currentBusPanelRouteNo !== routeNo) return;
                renderBusRoutePanel(panel, routeNo, allStops);
            }
        });
    });
};

function renderBusRoutePanel(panel, routeNo, allStopsData) {
    if (allStopsData.length === 0) {
        panel.innerHTML = `<div style="font-family:'Noto Sans KR',sans-serif; padding:20px; text-align:center; color:#ef4444;">🚨 정류장 정보를 불러올 수 없습니다.</div>`;
        return;
    }

    // 상행 → 하행 순서대로 정렬
    allStopsData.sort(function(a, b) {
        if (a.direction === '상행' || a.direction === '내선순환' || a.direction === '단방향') return -1;
        if (b.direction === '상행' || b.direction === '내선순환' || b.direction === '단방향') return 1;
        return 0;
    });

    // 중복 제거하여 노선도 하나로 통합 (seenName 및 seenNodeIds 사용)
    var allStations = [];
    var seenNodeIds = new Set();
    var seenNames = new Set();
    
    function getNormalizedName(name) {
        if (!name) return "";
        var clean = name.replace(/\([^)]*\)/g, "").replace(/\s+/g, "");
        if (clean.indexOf("경운대") !== -1) return "경운대학교";
        return clean;
    }

    allStopsData.forEach(function(data) {
        data.stations.forEach(function(st) {
            var normName = getNormalizedName(st.nodenm);
            var nodeIdStr = String(st.nodeid).trim();
            if (!seenNodeIds.has(nodeIdStr) && !seenNames.has(normName)) {
                seenNodeIds.add(nodeIdStr);
                seenNames.add(normName);
                
                var displayName = st.nodenm;
                if (normName === "경운대학교") {
                    displayName = "경운대학교(구미운전면허센터)";
                }
                
                allStations.push({
                    name: displayName,
                    nodeId: nodeIdStr,
                    lat: parseFloat(st.gpslati),
                    lng: parseFloat(st.gpslong),
                    direction: data.direction,
                    routeId: data.routeId,
                    mergedNodeIds: [nodeIdStr]
                });
            } else {
                // 이미 추가된 역의 경우, 노선도에 중복 노출시키지는 않되, 위치 검출(nodeId 매핑)을 위해 mergedNodeIds에 추가
                var existing = allStations.find(function(s) {
                    return s.nodeId === nodeIdStr || getNormalizedName(s.name) === normName;
                });
                if (existing) {
                    if (!existing.mergedNodeIds.includes(nodeIdStr)) {
                        existing.mergedNodeIds.push(nodeIdStr);
                    }
                }
            }
        });
    });

    var routeIds = allRoutesMap[routeNo] || [];
    var activeBusesOnRoute = Object.values(activeBuses || {}).filter(function(b) {
        return routeIds.includes(b.routeId);
    });
    var totalBusesCount = activeBusesOnRoute.length;

    var typeInfo = window.getBusTypeInfo(routeNo);
    
    var headerHtml = `
    <div class="detail-sheet-handle" data-panel-id="bus-route-panel" onclick="window.toggleDetailPanel('bus-route-panel')">
        <div class="detail-sheet-bar"></div>
    </div>
    <div style="position:relative; font-family:'Noto Sans KR',sans-serif; margin-bottom:15px;">
        <button onclick="window.closeBusRoutePanel()" style="position:absolute; top:-5px; right:-5px; background:none; border:none; font-size:22px; cursor:pointer; color:#94a3b8; font-weight:700;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#94a3b8'">&times;</button>
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--border-panel); padding-bottom:10px; margin-bottom:10px;">
            <h3 style="margin:0; font-size:16px; color:var(--text-main); font-weight:700;">
                <span style="font-size:11px; padding:2px 6px; border-radius:4px; background:${typeInfo.bgColor}; color:${typeInfo.color}; margin-right:4px;">${typeInfo.label}</span>
                <span class="bus-badge-glow">BUS</span> <span style="margin-left:2px;">${routeNo}번 통합 노선도</span>
            </h3>
        </div>
        <div style="font-size:11px; color:var(--text-muted); background:var(--bg-input); border:1px solid var(--border-panel); padding:8px; border-radius:8px; margin-top:8px; line-height:1.4;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span>총 <b>${allStations.length}개</b> 정류장 | 🟢 버스 위치</span>
                <span id="panel-total-buses-count" style="font-weight:700; color:${typeInfo.color};">현재 <b>${totalBusesCount}대</b> 운행 중</span>
            </div>
            <div style="border-top:1px solid var(--border-panel); padding-top:4px; display:flex; gap:6px; justify-content:center; align-items:center; font-size:10px;">
                <span>교통상황:</span>
                <span style="display:inline-flex; align-items:center; gap:2px;"><span style="display:inline-block; width:8px; height:3px; background:#3b82f6; border-radius:1px;"></span>원활</span>
                <span style="display:inline-flex; align-items:center; gap:2px;"><span style="display:inline-block; width:8px; height:3px; background:#10b981; border-radius:1px;"></span>서행</span>
                <span style="display:inline-flex; align-items:center; gap:2px;"><span style="display:inline-block; width:8px; height:3px; background:#f97316; border-radius:1px;"></span>지체</span>
                <span style="display:inline-flex; align-items:center; gap:2px;"><span style="display:inline-block; width:8px; height:3px; background:#ef4444; border-radius:1px;"></span>정체</span>
            </div>
        </div>
    </div>`;

    var stopsHtml = '<div style="padding-left:14px; margin-left:12px; font-family:\'Noto Sans KR\',sans-serif; position:relative;">';

    allStations.forEach(function(st, idx) {
        var nextStation = allStations[idx + 1];
        var showLine = !!nextStation;
        var trafficColor = window.getSegmentTrafficColor(st, nextStation, routeNo);
        var lineTop = (idx === 0) ? '14px' : '0px';

        stopsHtml += `
        <div id="bus-stop-${st.nodeId}" style="position:relative; padding:6px 0; background:transparent; border-radius:4px; transition:background 0.3s;">
            ${showLine ? `<div class="bus-stop-line" style="position:absolute; left:-17px; top:${lineTop}; bottom:0; width:3px; background:${trafficColor}; z-index:1;"></div>` : ''}
            <div class="bus-stop-dot" style="position:absolute; left:-20px; top:8px; width:8px; height:8px; background:var(--text-muted); border-radius:50%; border:2px solid var(--bg-panel); box-shadow:0 0 0 1px var(--border-panel); z-index:2;"></div>
            <div class="bus-stop-name" style="font-size:12px; color:var(--text-main); font-weight:400; padding-left:4px;">
                ${st.name}
            </div>
        </div>`;

        if (showLine) {
            stopsHtml += `
            <div id="bus-between-${st.nodeId}-${nextStation.nodeId}" style="position:relative; height:24px; display:none; align-items:center; margin-left:0px;">
                <div class="bus-between-line" style="position:absolute; left:-17px; top:0; bottom:0; width:3px; background:${trafficColor}; z-index:1;"></div>
                <div class="bus-between-dot" style="position:absolute; left:-22px; top:6px; width:12px; height:12px; background:${typeInfo.color}; border-radius:50%; border:2px solid var(--bg-panel); box-shadow:0 0 0 1px var(--border-panel); z-index:2;"></div>
                <div class="bus-between-text" style="font-size:11px; color:var(--text-main); font-weight:700; padding-left:4px; display:flex; align-items:center; gap:4px; background:var(--bg-input); border:1px solid var(--border-panel); border-radius:12px; padding:2px 8px; margin-left:4px;">
                </div>
            </div>`;
        }
    });

    stopsHtml += '</div>';
    panel.innerHTML = DOMPurify.sanitize(headerHtml + stopsHtml, window.DOM_PURIFY_CONFIG);

    // 실시간 버스 위치 갱신 처리
    function updateRoutePanelBuses() {
        // 현재 선택된 노선에 소속된 버스만 필터링 (유령 버스 차단)
        var routeBuses = Object.values(activeBuses || {}).filter(function(b) {
            return routeIds.includes(b.routeId);
        });

        // 실시간 운행 대수 업데이트
        var countEl = document.getElementById('panel-total-buses-count');
        if (countEl) {
            countEl.innerHTML = `현재 <b>${routeBuses.length}대</b> 운행 중`;
        }

        // 모든 정류장 및 사이 이동 표시 초기화
        allStations.forEach(function(st, idx) {
            var el = document.getElementById('bus-stop-' + st.nodeId);
            if (el) {
                el.style.background = 'transparent';
                var dot = el.querySelector('.bus-stop-dot');
                if (dot) {
                    dot.style.background = 'var(--text-muted)';
                    dot.style.boxShadow = "0 0 0 1px var(--border-panel)";
                    dot.style.width = '8px';
                    dot.style.height = '8px';
                    dot.style.left = '-20px';
                    dot.style.top = '8px';
                }
                
                var nameDiv = el.querySelector('.bus-stop-name');
                if (nameDiv) {
                    nameDiv.textContent = st.name;
                    nameDiv.style.fontWeight = '400';
                }
            }

            var nextStation = allStations[idx + 1];
            if (nextStation) {
                var betEl = document.getElementById(`bus-between-${st.nodeId}-${nextStation.nodeId}`);
                if (betEl) {
                    betEl.style.display = 'none';
                    var betText = betEl.querySelector('.bus-between-text');
                    if (betText) betText.innerHTML = '';
                }
            }
        });

        // 버스 위치에 따른 활성화
        routeBuses.forEach(function(bus) {
            var seg = window.getBusSegment(bus, allStations);
            if (!seg) return;

            var congLevel = window._currentRouteCongestion || 1;
            var congBadge = getCongestionBadgeHtml(congLevel, window._currentCongestionSimulated);
            var isUltraPrecise = !!bus.isUltraPrecise;

            var gpsBadgeHtml = isUltraPrecise ? '<span class="bus-badge-glow" style="background:linear-gradient(135deg, #a855f7, #7c3aed); box-shadow:0 2px 8px rgba(168, 85, 247, 0.4); margin-left:4px;">GPS 🌟</span>' : '<span class="bus-badge-glow" style="margin-left:4px;">BUS</span>';

            if (seg.type === 'at') {
                var st = allStations[seg.index];
                var el = document.getElementById('bus-stop-' + st.nodeId);
                if (el) {
                    el.style.background = 'rgba(16, 185, 129, 0.15)'; // Glassy green highlight
                    
                    var dot = el.querySelector('.bus-stop-dot');
                    if (dot) {
                        dot.style.background = typeInfo.color;
                        dot.style.boxShadow = "0 0 0 1px " + typeInfo.color;
                        dot.style.width = '12px';
                        dot.style.height = '12px';
                        dot.style.left = '-22px';
                        dot.style.top = '6px';
                    }
                    
                    var nameDiv = el.querySelector('.bus-stop-name');
                    if (nameDiv) {
                        var speedStr = bus.velocity ? ` ⚡${bus.velocity}km/h` : "";
                        var vnoTail = bus.vehicleno || "무명";
                        nameDiv.innerHTML = st.name + gpsBadgeHtml + `<span style="font-size:10px; color:var(--text-muted); font-weight:bold; margin-left:4px;">(${vnoTail}${speedStr})</span>` + congBadge;
                        nameDiv.style.fontWeight = '700';
                    }
                }
            } else if (seg.type === 'between') {
                var stFrom = allStations[seg.fromIndex];
                var stTo = allStations[seg.toIndex];
                var betEl = document.getElementById(`bus-between-${stFrom.nodeId}-${stTo.nodeId}`);
                if (betEl) {
                    betEl.style.display = 'flex';
                    var betText = betEl.querySelector('.bus-between-text');
                    if (betText) {
                        var speedStr = bus.velocity ? ` ⚡${bus.velocity}km/h` : "";
                        var vnoTail = bus.vehicleno || "무명";
                        betText.innerHTML = `<span>이동 중</span>${gpsBadgeHtml}<span style="font-size:10px; color:var(--text-muted);">(${vnoTail}${speedStr})</span>${congBadge}`;
                    }
                }
            }
        });
    }

    window.updateRoutePanelBuses = updateRoutePanelBuses;

    // 즉시 실행
    updateRoutePanelBuses();

    // 4초마다 버스 위치 업데이트 (패널 내부)
    if (window._busRoutePanelInterval) clearInterval(window._busRoutePanelInterval);
    window._busRoutePanelInterval = setInterval(updateRoutePanelBuses, window.GUMAP_CONSTANTS.BUS.FETCH_INTERVAL_MS);
};

window.closeBusRoutePanel = function() {
    console.log('[closeBusRoutePanel] 패널 닫기');
    var panel = document.getElementById('bus-route-panel');
    if (panel) {
        panel.classList.remove('panel-expanded', 'panel-collapsed');
        panel.classList.add('panel-hidden');
        panel.style.opacity = '0';
        if (window.innerWidth > 768) {
            panel.style.transform = 'translateX(-10px)';
        } else {
            panel.style.transform = 'translateY(110%)';
        }
        if (window._closeBusPanelTimeout) clearTimeout(window._closeBusPanelTimeout);
        window._closeBusPanelTimeout = setTimeout(function() { 
            panel.style.display = 'none'; 
            window._closeBusPanelTimeout = null;
        }, 300);
    }
    if (window._busRoutePanelInterval) {
        clearInterval(window._busRoutePanelInterval);
        window._busRoutePanelInterval = null;
    }
    // [연구지도 연동] 노선 분석 카드 및 점수판 숨김
    var routeAnalysisDiv = document.getElementById('research-route-analysis');
    if (routeAnalysisDiv) routeAnalysisDiv.style.display = 'none';
    var scorecardContainer = document.getElementById('maas-scorecard-container');
    if (scorecardContainer) scorecardContainer.style.display = 'none';

    // 패널 렌더 ID 무효화 (아직 완료되지 않은 비동기 콜백 차단)
    window._panelRenderId = (window._panelRenderId || 0) + 1;
};

// [신규] Page Visibility API 연동 - 탭 숨김 시 백그라운드 폴링 중단 및 메모리 누수 방지
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('[BusTracker] 탭 숨김 감지: 실시간 폴링 일시정지');
        if (typeof fetchIntervalId !== 'undefined' && fetchIntervalId) {
            clearInterval(fetchIntervalId);
            fetchIntervalId = null;
        }
        if (window._busRoutePanelInterval) {
            clearInterval(window._busRoutePanelInterval);
            window._busRoutePanelInterval = null;
        }
    } else {
        console.log('[BusTracker] 탭 활성화 감지: 실시간 폴링 재개');
        if (window.currentActiveRouteIds && window.currentActiveRouteNo) {
            if (typeof fetchIntervalId !== 'undefined' && !fetchIntervalId && typeof fetchRealBuses === 'function') {
                fetchIntervalId = setInterval(() => {
                    fetchRealBuses(window.currentActiveRouteIds, window.currentActiveRouteNo, window.currentActiveRenderId);
                }, window.GUMAP_CONSTANTS.BUS.FETCH_INTERVAL_MS);
            }
            if (!window._busRoutePanelInterval && typeof window.updateRoutePanelBuses === 'function') {
                window._busRoutePanelInterval = setInterval(window.updateRoutePanelBuses, window.GUMAP_CONSTANTS.BUS.FETCH_INTERVAL_MS);
            }
        }
    }
});
