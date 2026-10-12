// ============================================================
// 📁 파일명: routing.js
// 📌 역할: 멀티모달 길찾기 엔진 (자동차/대중교통/도보/자전거)
// ============================================================
//
// [파일 설명]
//   출발지와 도착지를 설정하면 최적 경로를 탐색하여 지도 위에
//   시각화하는 길찾기 핵심 모듈입니다. (약 1,250줄)
//   - T-map 경로 탐색 API 우선 사용, 실패 시 OSRM 무료 엔진 폴백
//   - 대중교통: 공공데이터포털 환승경로 API (버스+도시철도 혼합)
//   - 자동차: 실시간 교통상황 반영 최적/최단/무료 경로 비교
//   - 도보/자전거: OSRM foot/bicycle 프로파일 활용
//   - 택시 요금 산정: 거리+시간 기반 미터기 시뮬레이션
//   - 경로 결과를 단계별 턴바이턴 네비게이션 형태로 표시
//
// [의존 관계]
//   - config.js → T-map API 키, 택시 기본요금 파라미터 참조
//   - map-init.js → 경로 폴리라인 렌더링에 window.map 사용
//   - store.js → 출발지/도착지 상태 관리
//
// [사용된 외부 API]
//   - SK T-map 경로탐색 API
//   - OSRM 오픈소스 경로 엔진
//   - 공공데이터포털 대중교통환승경로 API
// ============================================================

var currentRoutingRenderId = window.currentRoutingRenderId || 0;
var currentRoutingPolylines = window.currentRoutingPolylines || [];

// ── G-Route 결과 요약 ──
// 서버(/groute-api)가 경로 거리(m)·예상 소요시간(초)과 그 계산 근거를 함께 준다.
// 예전에는 화면이 좌표 길이에 시속 40km 같은 고정 계수를 곱해 시간을 지어냈다.
window.summarizeGRouteResult = function(data, minutesPerKm) {
    var km = 0;
    if (typeof data.distance_m === 'number') {
        km = data.distance_m / 1000;
    } else {
        var route = data.route || [];
        for (var i = 0; i < route.length - 1; i++) {
            km += L.latLng(route[i]).distanceTo(L.latLng(route[i + 1])) / 1000;
        }
    }
    var minutes = (typeof data.duration_sec === 'number')
        ? Math.max(1, Math.round(data.duration_sec / 60))
        : Math.max(1, Math.ceil(km * minutesPerKm));
    return { distKm: km.toFixed(1), timeMin: minutes, basis: data.time_basis || '' };
};

// 그래프가 끊겨 목적지 노드까지 못 간 경로. 성공처럼 보이면 사용자가 엉뚱한 곳에서 멈춘다.
window.renderPartialRouteNotice = function(data) {
    if (!data || !data.partial) return '';
    var gap = data.gap_m ? ` 목적지까지 직선으로 약 ${Math.round(data.gap_m)}m 남습니다.` : '';
    return `<div style="margin-bottom:10px; padding:8px; border-radius:8px; font-size:11px; line-height:1.5;
        background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.4); color:#ef4444; font-weight:700;">
        ⚠️ 이 경로는 목적지까지 이어지지 않았습니다.${gap} 다른 길찾기(일반 경로)를 함께 확인하세요.</div>`;
};

// 두 지점 사이 보행 경로. 보행 API 가 실패하면 직선으로 둔다.
async function fetchWalkLeg(from, to) {
    var line = [[from.lat, from.lng], [to.lat, to.lng]];
    var meters = Math.round(L.latLng(line[0]).distanceTo(L.latLng(line[1])));
    var seconds = null;
    try {
        var data = await window.fetchTmapWithOSRMFallback(`${window.PROXY_URL}/tmap-routes?endpoint=pedestrian&version=1`, {
            startX: from.lng, startY: from.lat, endX: to.lng, endY: to.lat,
            reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO",
            startName: encodeURIComponent("출발"), endName: encodeURIComponent("도착")
        }, 'walk');
        var walked = [];
        (data.features || []).forEach(function(feature) {
            if (feature.geometry && feature.geometry.type === "LineString") {
                feature.geometry.coordinates.forEach(function(coord) { walked.push([coord[1], coord[0]]); });
            }
        });
        // 보행 도로망에 붙은 점과 실제 정류장·도착지 사이 틈도 잇는다
        if (walked.length > 1) line = [line[0]].concat(walked, [line[1]]);
        var props = data.features && data.features[0] && data.features[0].properties;
        if (props && props.totalDistance > 0) {
            // 보행 API 는 도로에 붙인 뒤 거리만 세어 직선보다 짧게 줄 때가 있다
            meters = Math.max(meters, Math.round(props.totalDistance));
            seconds = props.totalTime > 0 ? props.totalTime : null;
        }
    } catch (e) {
        console.warn('보행 구간 조회 실패, 직선으로 표시합니다:', e);
    }
    // 보행 API 가 시간을 안 주면 G-Route 도보와 같은 시속 4km 로 잡는다
    var minutes = Math.max(1, Math.round((seconds || meters / (4000 / 3600)) / 60));
    return { line: line, meters: meters, minutes: minutes };
}

// G-Route 도로망(OSM 차도)에 없는 곳은 가장 가까운 도로 지점에 붙어서 경로가 거기서 끝난다.
// 금오공대 교내가 그렇다 - 자가용·자전거로 테크노관을 찾으면 선이 출입구 575m 앞에서
// 끊기고 실내 경로와 이어지지 않았다. 끊긴 앞뒤를 보행 경로 점선으로 잇고 결과 카드에 적는다.
// 도로에 붙이는 보통의 오차(수십 m)는 잇지 않는다. 그것까지 그리면 출발지마다 군더더기가 붙는다.
var GROUTE_GAP_MIN_M = 80;

window.connectGRouteEnds = function(route, renderId, noteId) {
    if (!Array.isArray(route) || route.length < 2) return;
    var first = route[0], last = route[route.length - 1];
    var legs = [];
    if (window.startCoord) legs.push({ where: 'start', from: window.startCoord, to: { lat: first[0], lng: first[1] } });
    if (window.endCoord) legs.push({ where: 'end', from: { lat: last[0], lng: last[1] }, to: window.endCoord });
    legs = legs.filter(function(leg) {
        return L.latLng(leg.from.lat, leg.from.lng).distanceTo(L.latLng(leg.to.lat, leg.to.lng)) >= GROUTE_GAP_MIN_M;
    });
    if (!legs.length) return;
    Promise.all(legs.map(function(leg) { return fetchWalkLeg(leg.from, leg.to); })).then(function(walks) {
        if (renderId !== currentRoutingRenderId) return;
        var parts = walks.map(function(walk, i) {
            drawPolyline(walk.line, '#475569', 'shortdash', 5);
            return (legs[i].where === 'start' ? '출발지에서 도로까지 ' : '도로가 끝나는 곳에서 도착지까지 ') +
                walk.meters.toLocaleString() + 'm(걸어서 약 ' + walk.minutes + '분)';
        });
        var box = document.getElementById(noteId);
        if (!box) return;
        box.textContent = '🚶 G-Route 도로망 밖 구간: ' + parts.join(', ') +
            '. 점선 도보 경로로 이었고, 위 소요시간에는 들어 있지 않습니다.';
        box.style.display = 'block';
    });
};

function gapNoteHtml(id) {
    return `<div id="${id}" style="display:none; margin-bottom:10px; padding:8px; border-radius:8px; font-size:11px; line-height:1.5;
        background:rgba(71,85,105,0.08); border:1px solid rgba(71,85,105,0.35); color:var(--text-main);"></div>`;
}

function formatBenchMinutes(seconds) {
    return window.formatTime(Math.max(1, Math.round(seconds / 60)));
}

// ── G-Route vs 외부 길찾기 비교 카드 ──
// 서버가 같은 출발·도착지로 두 경로를 실제로 계산해 준 값만 보여 준다.
// 두 시간은 계산 근거가 다를 수 있어(예: G-Route 자동차는 제한속도 추정, TMAP 은 실시간 교통)
// "절감" 같은 판정 대신 근거를 나란히 적는다.
window.renderBenchmarkCard = function(containerId, benchmarkData) {
    var b = benchmarkData;
    var container = document.getElementById(containerId);
    if (!container) return;
    var esc = function(s) { return DOMPurify.sanitize(String(s == null ? '' : s)); };

    var ref = b.reference;
    var refColumn = ref ? `
            <div style="flex:1; text-align:center; padding:10px 6px; border-radius:10px; background:var(--bg-input); border:1px solid var(--border-panel);">
                <div style="font-size:10px; color:var(--text-muted);">${esc(ref.provider)}</div>
                <div style="font-size:20px; font-weight:800; color:var(--text-main);">${formatBenchMinutes(ref.duration_sec)}</div>
                <div style="font-size:10px; color:var(--text-muted);">${(ref.distance_m / 1000).toFixed(1)} km</div>
            </div>` : `
            <div style="flex:1; display:flex; align-items:center; justify-content:center; text-align:center; padding:10px 6px; border-radius:10px; background:var(--bg-input); border:1px dashed var(--border-panel); font-size:10px; color:var(--text-muted);">
                ${esc(b.reference_error || '비교할 외부 경로가 없습니다')}
            </div>`;

    var diffRows = '';
    if (ref) {
        var dMin = Math.round((b.groute.duration_sec - ref.duration_sec) / 60);
        var dKm = (b.groute.distance_m - ref.distance_m) / 1000;
        diffRows = `
            <div style="display:flex; justify-content:space-between; padding:4px 0;">
                <span>거리 차이 (G-Route − 비교)</span><b>${dKm >= 0 ? '+' : ''}${dKm.toFixed(1)} km</b>
            </div>
            <div style="display:flex; justify-content:space-between; padding:4px 0;">
                <span>시간 차이 (G-Route − 비교)</span><b>${dMin >= 0 ? '+' : ''}${dMin}분</b>
            </div>`;
    }

    container.innerHTML = `
    <div style="margin-top:12px; padding:12px; border-radius:12px; background:rgba(99,102,241,0.06); border:1px solid rgba(99,102,241,0.25);">
        <div style="font-size:12px; font-weight:800; color:var(--primary-color); margin-bottom:8px;">📊 같은 출발·도착지 경로 비교</div>
        <div style="display:flex; gap:8px; margin-bottom:8px;">
            <div style="flex:1; text-align:center; padding:10px 6px; border-radius:10px; background:var(--primary-grad); color:white;">
                <div style="font-size:10px; opacity:0.9;">G-Route (자체 경로)</div>
                <div style="font-size:20px; font-weight:800;">${formatBenchMinutes(b.groute.duration_sec)}</div>
                <div style="font-size:10px; opacity:0.9;">${(b.groute.distance_m / 1000).toFixed(1)} km</div>
            </div>
            ${refColumn}
        </div>
        <div style="font-size:11px; color:var(--text-main);">${diffRows}</div>
        <div style="margin-top:6px; font-size:10px; color:var(--text-muted); line-height:1.5;">
            G-Route 시간: ${esc(b.groute.basis)}${ref ? `<br>비교 시간: ${esc(ref.basis)}` : ''}
            ${ref && b.mode === 'car' ? '<br>※ 두 시간은 계산 근거가 달라 직접 우열을 가리는 값이 아닙니다.' : ''}
        </div>
    </div>`;

    // 자동차 결과 카드의 택시 요금 칸은 TMAP 예상 요금으로 채운다.
    var fareEl = document.getElementById('groute-taxi-fare');
    if (fareEl) {
        fareEl.textContent = (ref && ref.taxi_fare) ? ref.taxi_fare.toLocaleString() + '원' : '요금 정보 없음';
    }
};

// ── G-Route 비교 결과 백그라운드 호출 ──
window.fetchBenchmark = function(mode) {
    if (!window.startCoord || !window.endCoord) return;
    var profileEl = document.querySelector('input[name="route-profile"]:checked');
    var payload = {
        start_lat: window.startCoord.lat, start_lng: window.startCoord.lng,
        end_lat: window.endCoord.lat, end_lng: window.endCoord.lng,
        mode: mode,
        profile: (mode === 'car' && profileEl) ? profileEl.value : 'fast',
        hour: new Date().getHours()
    };
    if (window.wayCoord) {
        payload.way_lat = window.wayCoord.lat;
        payload.way_lng = window.wayCoord.lng;
    }
    var renderId = currentRoutingRenderId;
    fetch(`${window.PROXY_URL}/groute-benchmark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(data => {
        if (renderId !== currentRoutingRenderId) return;
        if (data.status === 'success' && data.benchmark) {
            window.renderBenchmarkCard('groute-benchmark-card', data.benchmark);
        }
    })
    .catch(err => console.warn('[Benchmark] 비교 경로 호출 실패:', err));
};

// OSRM의 /foot 문자열만으로는 자동차 서버가 보행 서버로 바뀌지 않는다.
// 보행 전용 도로망을 먼저 사용하고 요청 시작을 최대 초당 1회로 제한한다.
window.fetchPedestrianRoute = (function () {
    const cache = new Map();
    let queue = Promise.resolve();
    let lastRequest = 0;
    return function (payload) {
        const points = [[Number(payload.startX), Number(payload.startY)]];
        if (payload.passList) {
            payload.passList.split('_').forEach(value => points.push(value.split(',').map(Number)));
        }
        points.push([Number(payload.endX), Number(payload.endY)]);
        if (points.some(point => point.length !== 2 || !point.every(Number.isFinite))) {
            return Promise.reject(new Error('보행 경로 좌표가 올바르지 않습니다.'));
        }
        const coords = points.map(point => point.join(',')).join(';');
        const cached = cache.get(coords);
        if (cached && Date.now() - cached.time < 300000) return cached.promise;
        const turn = queue.then(async function () {
            const delay = Math.max(0, 1100 - (Date.now() - lastRequest));
            if (delay) await new Promise(resolve => setTimeout(resolve, delay));
            lastRequest = Date.now();
        });
        // 응답이 느려도 다음 요청의 시작까지 막지는 않는다.
        queue = turn.catch(() => {});
        const pending = turn.then(async function () {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 10000);
            try {
                const response = await fetch('https://routing.openstreetmap.de/routed-foot/route/v1/foot/' +
                    coords + '?overview=full&geometries=geojson', { signal: controller.signal });
                if (!response.ok) throw new Error('보행 전용 경로 조회 실패: ' + response.status);
                const data = await response.json();
                const route = data.routes && data.routes[0];
                if (data.code !== 'Ok' || !route || !route.geometry ||
                    !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length < 2) {
                    throw new Error('보행 경로를 찾을 수 없습니다.');
                }
                if (window.map && window.map.attributionControl) {
                    window.map.attributionControl.addAttribution(
                        '보행 경로 © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · ' +
                        '<a href="https://www.openstreetmap.org/fixthemap">지도 수정</a>');
                }
                return {
                    provider: 'osrm-foot',
                    features: [{
                        properties: { totalDistance: route.distance, totalTime: route.duration,
                            taxiFare: 0, tollFare: 0 },
                        geometry: route.geometry
                    }]
                };
            } finally {
                clearTimeout(timer);
            }
        });
        cache.set(coords, { time: Date.now(), promise: pending });
        if (cache.size > 128) cache.delete(cache.keys().next().value);
        pending.catch(() => {
            if (cache.get(coords)?.promise === pending) cache.delete(coords);
        });
        return pending;
    };
}());

window.fetchTmapWithOSRMFallback = async function(url, payload, mode) {
    if (mode === 'walk') {
        try {
            return await window.fetchPedestrianRoute(payload);
        } catch (error) {
            console.warn('보행 전용 서버 실패, TMAP 보행 경로를 조회합니다:', error);
        }
    }
    try {
        let res = await fetch(url, {
            method: "POST",
            headers: { "Accept": "application/json", "Content-Type": "application/json", },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('TMAP 경로 조회 실패: ' + res.status);
        let data = await res.json();
        if (data.error) throw new Error(data.error.message);
        if (!Array.isArray(data.features) || !data.features.some(feature =>
            feature.geometry && feature.geometry.type === 'LineString')) {
            throw new Error('TMAP 경로 좌표가 없습니다.');
        }
        return data;
    } catch (e) {
        // 보행 API가 모두 실패해도 자동차 경로를 도보로 표시하지 않는다.
        if (mode === 'walk') throw e;
        console.warn("TMAP API 실패, OSRM으로 우회합니다:", e);
        
        let profile = 'driving';
        if (mode === 'walk') profile = 'foot';
        if (mode === 'bike' || mode === 'shared') profile = 'bike';
        
        let coords = `${payload.startX},${payload.startY}`;
        if (payload.passList) {
            let passArr = payload.passList.split('_');
            coords += ';' + passArr.join(';');
        }
        coords += `;${payload.endX},${payload.endY}`;
        
        let osrmUrl = `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=geojson`;
        
        let osrmRes = await fetch(osrmUrl);
        if (!osrmRes.ok) throw new Error("OSRM 우회 API도 실패했습니다.");
        let osrmData = await osrmRes.json();
        
        if (osrmData.code !== "Ok" || !osrmData.routes || osrmData.routes.length === 0) {
            throw new Error("OSRM 우회 경로를 찾을 수 없습니다.");
        }
        
        let route = osrmData.routes[0];
        // TMAP 응답 형태(Features 배열)로 Mocking하여 기존 로직 100% 호환
        return {
            features: [
                {
                    properties: {
                        totalDistance: route.distance, // meter
                        totalTime: route.duration,     // sec
                        taxiFare: 0, tollFare: 0
                    },
                    geometry: {
                        type: "LineString",
                        coordinates: route.geometry.coordinates
                    }
                }
            ]
        };
    }
};

window.calcRoute = function(mode, option) {
    if (!window.startCoord || !window.endCoord) {
        alert("출발지와 도착지를 모두 설정해주세요!");
        return;
    }
    if (window.startCoord.lat === window.endCoord.lat && window.startCoord.lng === window.endCoord.lng) {
        alert("출발지와 도착지가 동일합니다.");
        return;
    }

    var myRoutingRenderId = ++currentRoutingRenderId;
    var optionTabsHtml = '';

    // [신규] 빠른길/안전한길/대로중심 프로파일 탭 보이기/숨기기
    var profilesPanel = document.getElementById('routing-profiles');
    if (profilesPanel) {
        profilesPanel.style.display = (mode === 'car') ? 'flex' : 'none';
    }

    // 모바일에서 검색 결과가 바로 보일 수 있도록 메인 패널 자동 확장
    var routingPanel = document.getElementById('routing-panel');
    if (routingPanel && window.innerWidth <= 768) {
        routingPanel.classList.remove('panel-collapsed', 'panel-hidden');
        routingPanel.classList.add('panel-expanded');
    }

    // 이전 경로 선 지우기
    currentRoutingPolylines.forEach(p => p.remove());
    currentRoutingPolylines = [];
    if (window.clearBusRoute) window.clearBusRoute();

    // [버그 해결] 대중교통 및 상세 안내 패널 리셋 및 완전 닫기
    if (window.closeTransitDetailPanel) window.closeTransitDetailPanel();
    if (window.closeRouteDetailPanel) window.closeRouteDetailPanel();
    if (window.closeBusRoutePanel) window.closeBusRoutePanel();
    
    // 대중교통 리스트 및 관련 상태 초기화 (동일 좌표/모드 정렬 시 캐시 유지)
    var wayKey = window.wayCoord ? (window.wayCoord.lat + ',' + window.wayCoord.lng) : '';
    var isSameCoords = window.lastStartCoord && window.lastEndCoord &&
                       window.lastStartCoord.lat === window.startCoord.lat &&
                       window.lastStartCoord.lng === window.startCoord.lng &&
                       window.lastEndCoord.lat === window.endCoord.lat &&
                       window.lastEndCoord.lng === window.endCoord.lng &&
                       window.lastWayKey === wayKey;

    if (!isSameCoords || mode !== 'transit') {
        window.transitPaths = null;
        window.lastWayKey = '';
        
        var transitDetailPanel = document.getElementById('transit-detail-panel');
        if (transitDetailPanel) {
            transitDetailPanel.style.opacity = '0';
            transitDetailPanel.style.display = 'none';
            transitDetailPanel.innerHTML = '';
        }
    }

    var resultDiv = document.getElementById('route-result');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = "⏳ 경로 탐색 중...";

    // 디폴트 라우팅 옵션을 'ai'로 강제 설정
    if (!option && (mode === 'car' || mode === 'walk' || mode === 'bike' || mode === 'shared')) {
        option = 'ai';
    }

    if (mode === 'car') {
        if (option === 'ai') {
            // G-Route AI 오프라인/GNN 혼잡도 최적 우회 경로 탐색 기동
            var profileEl = document.querySelector('input[name="route-profile"]:checked');
            var profile = profileEl ? profileEl.value : 'fast';
            
            var aiPayload = {
                start_lat: window.startCoord.lat, start_lng: window.startCoord.lng,
                end_lat: window.endCoord.lat, end_lng: window.endCoord.lng,
                hour: new Date().getHours(),
                profile: profile
            };
            if (window.wayCoord) {
                aiPayload.way_lat = window.wayCoord.lat;
                aiPayload.way_lng = window.wayCoord.lng;
            }
            
            fetch(`${window.PROXY_URL}/groute-api`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(aiPayload)
            })
            .then(res => res.json())
            .then(data => {
                if (myRoutingRenderId !== currentRoutingRenderId) return;
                if (data.error) throw new Error(data.error || "G-Route AI 길찾기 실패");
                
                var routeCoords = data.route;
                if (!routeCoords || routeCoords.length === 0) throw new Error("AI 경로 좌표를 수신하지 못했습니다.");

                var summary = window.summarizeGRouteResult(data, 1.5);
                var dist = summary.distKm;
                var time = summary.timeMin;

                // G-Route AI 전용 매치 색상 적용 드로잉 기동
                drawGRouteAiPath(routeCoords, 'car', profile);

                // 자동차 모드 전용 블루 테마 색상 적용
                var themeColor = '#3b82f6';
                if (profile === 'safe') themeColor = '#10b981';
                else if (profile === 'main_road') themeColor = '#1d4ed8';

                var taxiCardHtml = `
                <div style="margin-top:10px; background:linear-gradient(135deg, #eff6ff, #f8fafc); border:1px solid #93c5fd; border-radius:10px; padding:10px;">
                    <div style="font-size:13px; font-weight:700; color:#1e40af; margin-bottom:6px;">🚕 택시 이용 시 (TMAP 예상 요금)</div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div id="groute-taxi-fare" style="font-size:18px; font-weight:800; color:#2563eb;">계산 중…</div>
                            <div style="font-size:11px; color:#1e40af;">📏 G-Route 경로 ${dist}km</div>
                        </div>
                        <button onclick="simulateTaxiCall()" title="실제 택시를 부르지 않는 화면 체험입니다" style="padding:8px 14px; background:#3b82f6; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:700; font-size:12px; box-shadow:0 2px 4px rgba(59,130,246,0.3); transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">🚕 가상 호출</button>
                    </div>
                </div>`;

                var profileName = profile === 'fast' ? '⚡ 빠른길' : profile === 'safe' ? '🛡️ 안전한길' : '🛣️ 대로중심';
                var guidanceHtml = '';
                if (data.guidance && data.guidance.length > 0) {
                    guidanceHtml = `
                    <div style="margin-top:12px; border-top:1px solid rgba(59,130,246,0.15); padding-top:10px; margin-bottom:10px;">
                        <div style="font-size:12px; font-weight:700; color:var(--text-main); margin-bottom:6px; display:flex; align-items:center; gap:4px;">🧭 턴바이턴 경로 안내</div>
                        <div style="max-height:150px; overflow-y:auto; display:flex; flex-direction:column; gap:4px; padding-right:4px;">
                            ${data.guidance.map((g, idx) => `
                                <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); padding:5px 8px; background:var(--bg-input); border:1px solid var(--border-panel); border-radius:6px;">
                                    <span>${idx + 1}. ${g.instruction}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>`;
                }

                resultDiv.innerHTML = `
                <div style="padding:15px; border-radius:12px; background:var(--bg-card); box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                    <div style="font-size:13px; font-weight:700; color:var(--text-muted); margin-bottom:8px;">🚗 G-Route 자체 경로</div>
                    ${window.renderPartialRouteNotice(data)}
                    ${gapNoteHtml('groute-gap-note')}
                    <div style="margin-bottom:12px; font-size:14px; color:var(--text-main);">
                        <span style="font-size:26px; font-weight:800; color:${themeColor}; letter-spacing:-0.5px;">${window.formatTime(time)}</span>
                        <span style="margin-left:8px; font-weight:600; color:var(--text-muted);">${dist} km</span>
                    </div>
                    <div style="font-size:11px; color:#1e3a8a; margin-bottom:10px; line-height:1.5; background:#eff6ff; border:1px dashed #bfdbfe; padding:8px; border-radius:8px;">
                        🧠 <b>G-Route 경로 탐색</b> [프로파일: ${profileName}]<br>
                        - 구미시 도로망(OpenStreetMap)에서 A*로 찾은 경로입니다. 학습한 교차로 선호도(연결 수·고도·인도 유무)를 가중치에 더합니다.<br>
                        - 시간: ${summary.basis || '도로 제한속도 기준 추정'}. 실시간 정체는 아래 TMAP 비교를 참고하세요.
                    </div>
                    ${guidanceHtml}
                    ${taxiCardHtml}
                    <div id="groute-benchmark-card"></div>
                </div>`;
                window.connectGRouteEnds(routeCoords, myRoutingRenderId, 'groute-gap-note');
                // 벤치마크 비교 카드 백그라운드 호출
                window.fetchBenchmark('car');
            })
            .catch(err => {
                if (myRoutingRenderId !== currentRoutingRenderId) return;
                resultDiv.innerHTML = `<div style="padding:10px; color:#ef4444; font-size:11px;">⚠️ G-Route AI 호출 오류: ${err.message}. 티맵 실시간 빠른길로 자동 우회합니다...</div>`;
                setTimeout(() => calcRoute('car', '0'), 2500);
            });
        } else {
            var payload = {
                startX: window.startCoord.lng, startY: window.startCoord.lat,
                endX: window.endCoord.lng, endY: window.endCoord.lat,
                reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO",
                trafficInfo: "Y", 
                searchOption: option || "0" 
            };
            if (window.wayCoord) {
                payload.passList = window.wayCoord.lng + ',' + window.wayCoord.lat;
            }
            
            window.fetchTmapWithOSRMFallback(`${window.PROXY_URL}/tmap-routes?version=1`, payload, 'car')
            .then(data => {
                if (myRoutingRenderId !== currentRoutingRenderId) return;
                if (data.error) throw new Error(data.error.message || "자동차 길찾기 에러 발생");
                if (!data.features || data.features.length === 0) throw new Error("자동차 길찾기 결과를 찾을 수 없습니다.");
                var props = data.features[0].properties;
                var dist = (props.totalDistance / 1000).toFixed(1); 
                var time = Math.ceil(props.totalTime / 60); 
                var taxiFare = props.taxiFare || 0;
                var tollFare = props.tollFare || 0;

                drawTmapFeatures(data.features, '#3b82f6', 'solid');

                var taxiCardHtml = `
                <div style="margin-top:10px; background:linear-gradient(135deg, #fef3c7, #fffbeb); border:1px solid #f59e0b; border-radius:10px; padding:10px;">
                    <div style="font-size:13px; font-weight:700; color:#92400e; margin-bottom:6px;">🚕 택시 이용 시</div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-size:18px; font-weight:800; color:#d97706;">${taxiFare.toLocaleString()}원</div>
                            <div style="font-size:11px; color:#92400e;">⏱ ${window.formatTime(time)} | 📏 ${dist}km${tollFare > 0 ? ' | 🛣️ 통행료 ' + tollFare.toLocaleString() + '원' : ''}</div>
                        </div>
                        <button onclick="simulateTaxiCall()" style="padding:8px 14px; background:#f59e0b; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:700; font-size:12px; box-shadow:0 2px 4px rgba(245,158,11,0.3); transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">🚕 가상 호출</button>
                    </div>
                </div>`;

                resultDiv.innerHTML = `
                <div style="padding:15px; border-radius:12px; background:var(--bg-card); box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                    🏁 <b>자가용 길찾기 (티맵 실시간 우회)</b><br>
                    <div style="margin-bottom:12px; font-size:14px; color:var(--text-main); margin-top:8px;">
                        ⏱ 소요시간: <b style="color:#3b82f6; font-size:24px;">${window.formatTime(time)}</b><br>
                        📏 이동거리: ${dist}km
                    </div>
                    ${taxiCardHtml}
                </div>`;

                openRouteDetailPanel('🚗 자가용 경로 상세', time, dist, data.features);
            })
            .catch(e => {
                if (myRoutingRenderId !== currentRoutingRenderId) return;
                resultDiv.innerHTML = "🚨 길찾기 에러: " + e.message;
            });
        }

    } else if (mode === 'transit') {
        // 경유지 유무에 따라 캐시 키 달라짐
        var wayKey = window.wayCoord ? (window.wayCoord.lat + ',' + window.wayCoord.lng) : '';
        var hasStoredPaths = (window.transitPaths && window.transitPaths.length > 0);
        var isSameCoords = window.lastStartCoord && window.lastEndCoord &&
                           window.lastStartCoord.lat === window.startCoord.lat &&
                           window.lastStartCoord.lng === window.startCoord.lng &&
                           window.lastEndCoord.lat === window.endCoord.lat &&
                           window.lastEndCoord.lng === window.endCoord.lng &&
                           window.lastWayKey === wayKey;

        if (hasStoredPaths && isSameCoords) {
            renderTransitRouteList(window.transitPaths, option || 'best', false);
            return;
        }

        window.lastStartCoord = Object.assign({}, window.startCoord);
        window.lastEndCoord = Object.assign({}, window.endCoord);
        window.lastWayKey = wayKey;
        window.currentSelectedPathIndex = 0; // 기본적으로 첫 번째 경로 선택

        // ── 경유지가 있는 경우: 출발→경유, 경유→도착 두 구간으로 분할 조회 ──
        if (window.wayCoord) {
            var odsayUrl1 = `${window.PROXY_URL}/odsay?SX=${window.startCoord.lng}&SY=${window.startCoord.lat}&EX=${window.wayCoord.lng}&EY=${window.wayCoord.lat}`;
            var odsayUrl2 = `${window.PROXY_URL}/odsay?SX=${window.wayCoord.lng}&SY=${window.wayCoord.lat}&EX=${window.endCoord.lng}&EY=${window.endCoord.lat}`;

            Promise.all([
                fetch(odsayUrl1).then(r => r.json()),
                fetch(odsayUrl2).then(r => r.json())
            ])
            .then(([data1, data2]) => {
                if (myRoutingRenderId !== currentRoutingRenderId) return;
                if (!data1.result || !data1.result.path || data1.result.path.length === 0) {
                    var msg1 = (data1.error && data1.error.length > 0) ? data1.error[0].message : "출발→경유지 대중교통 경로를 찾을 수 없습니다.";
                    throw new Error(msg1);
                }
                if (!data2.result || !data2.result.path || data2.result.path.length === 0) {
                    var msg2 = (data2.error && data2.error.length > 0) ? data2.error[0].message : "경유지→도착 대중교통 경로를 찾을 수 없습니다.";
                    throw new Error(msg2);
                }

                var best1 = data1.result.path[0];
                var best2 = data2.result.path[0];

                // 두 구간의 정보를 합산
                var totalTime = best1.info.totalTime + best2.info.totalTime;
                var payment   = best1.info.payment + best2.info.payment;
                var totalWalk = best1.info.totalWalk + best2.info.totalWalk;
                var totalDist = best1.info.totalDistance + best2.info.totalDistance;

                // 두 구간의 polyline 그리기
                [best1, best2].forEach(function(seg) {
                    seg.subPath.forEach(function(sub) {
                        if (sub.trafficType === 1 || sub.trafficType === 2) {
                            var color = (sub.trafficType === 2) ? '#10b981' : '#f97316';
                            var points = [];
                            if (sub.passStopList && sub.passStopList.stations) {
                                sub.passStopList.stations.forEach(function(st) {
                                    points.push([parseFloat(st.y), parseFloat(st.x)]);
                                });
                            }
                            if (points.length > 0) drawPolyline(points, color, 'solid', 7);
                        }
                    });
                });

                var wayLabel = window.wayCoord.addr || '경유지';
                resultDiv.innerHTML = `🏁 <b>대중교통 경유지 경로</b><br>
                    📍 경유: <b style="color:#8b5cf6;">${wayLabel}</b><br>
                    ⏱ 소요시간: <b style="color:#ef4444; font-size:16px;">${window.formatTime(totalTime)}</b><br>
                    📏 이동거리: ${(totalDist / 1000).toFixed(1)}km<br>
                    💵 요금: <b>${payment.toLocaleString()}원</b><br>
                    🚶 도보: ${totalWalk}m`;
            })
            .catch(function(e) {
                if (myRoutingRenderId !== currentRoutingRenderId) return;
                console.error("ODsay 경유지 대중교통 에러:", e);
                resultDiv.innerHTML = `<span style="color:#ef4444; font-size:12px; display:block; line-height:1.4;">
                    🚨 <b>대중교통 경유지 API 에러:</b> ${e.message}<br>
                    <span style="color:var(--text-muted); font-size:11px; display:block; margin-top:4px;">※ ODSAY_KEY 설정 및 네트워크 상태를 확인해주세요.</span>
                </span>`;
            });
            return;
        }


        // ── 경유지 없는 경우: ODsay, 실패하면 서버의 대체 경로(TMAP → 자체 버스 그래프) ──
        window.transitPathsNote = '';
        var odsayUrl = `${window.PROXY_URL}/odsay?SX=${window.startCoord.lng}&SY=${window.startCoord.lat}&EX=${window.endCoord.lng}&EY=${window.endCoord.lat}`;

        fetch(odsayUrl)
        .then(res => res.json())
        .then(data => {
            if (myRoutingRenderId !== currentRoutingRenderId) return;
            if (!data.result || !data.result.path || data.result.path.length === 0) {
                var msg = (data.error && data.error.length > 0) ? data.error[0].message : "대중교통 경로를 찾을 수 없습니다.";
                throw new Error(msg);
            }
            window.transitPaths = data.result.path;
            renderTransitRouteList(window.transitPaths, option || 'best', false);
        })
        .catch(odsayError => {
            if (myRoutingRenderId !== currentRoutingRenderId) return;
            console.warn("ODsay 대중교통 실패, 대체 경로 시도:", odsayError);
            resultDiv.innerHTML = "⏳ 대중교통 경로를 다른 방법으로 찾는 중...";
            return fetch(`${window.PROXY_URL}/transit`, {
                method: "POST",
                headers: { "accept": "application/json", "content-type": "application/json" },
                body: JSON.stringify({
                    startX: String(window.startCoord.lng), startY: String(window.startCoord.lat),
                    endX: String(window.endCoord.lng), endY: String(window.endCoord.lat)
                })
            })
            .then(res => res.json())
            .then(data => {
                if (myRoutingRenderId !== currentRoutingRenderId) return;
                if (!data.result || !data.result.path || data.result.path.length === 0) {
                    throw new Error(data.error || odsayError.message);
                }
                window.transitPathsNote = data.source === 'tmap'
                    ? 'ODsay 응답이 없어 TMAP 대중교통 결과를 보여 드립니다.'
                    : (data.note || '대체 경로입니다.') + ' 실제 배차 시각은 정류장 도착 정보를 확인하세요.';
                window.transitPaths = data.result.path;
                renderTransitRouteList(window.transitPaths, option || 'best', false);
            });
        })
        .catch(e => {
            if (myRoutingRenderId !== currentRoutingRenderId) return;
            console.error("대중교통 경로 에러:", e);
            resultDiv.innerHTML = `<span style="color:#ef4444; font-size:12px; display:block; line-height:1.4;">
                🚨 <b>대중교통 경로를 찾지 못했습니다:</b> ${DOMPurify.sanitize(e.message)}<br>
                <span style="color:var(--text-muted); font-size:11px; display:block; margin-top:4px;">※ ODSAY_KEY 설정 및 네트워크 상태를 확인해주세요.</span>
            </span>`;
        });

    } else {
        // 보행(walk), 자전거(bike), 공유플랫폼(shared)
        var pedUrl = `${window.PROXY_URL}/tmap-routes?endpoint=pedestrian&version=1`;
        var pedHeaders = { "Accept": "application/json", "Content-Type": "application/json", };

        // G-Route AI 탭 버튼 UI 생성을 위한 헬퍼
        var modeName = "";
        var aiTargetMode = "walk";
        if (mode === 'walk') { modeName = "도보"; aiTargetMode = "walk"; }
        else if (mode === 'bike') { modeName = "자전거"; aiTargetMode = "bicycle"; }
        else if (mode === 'shared') { modeName = "공유플랫폼"; aiTargetMode = "pm"; }

        if (option === 'ai') {
            // G-Route AI 멀티모달 우회/안전 탐색 기동
            var aiPayload = {
                start_lat: window.startCoord.lat, start_lng: window.startCoord.lng,
                end_lat: window.endCoord.lat, end_lng: window.endCoord.lng,
                hour: new Date().getHours(),
                mode: aiTargetMode
            };
            if (window.wayCoord) {
                aiPayload.way_lat = window.wayCoord.lat;
                aiPayload.way_lng = window.wayCoord.lng;
            }

            fetch(`${window.PROXY_URL}/groute-api`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(aiPayload)
            })
            .then(res => res.json())
            .then(data => {
                if (myRoutingRenderId !== currentRoutingRenderId) return;
                if (data.error) throw new Error(data.error || "G-Route AI 멀티모달 길찾기 실패");
                
                var routeCoords = data.route;
                if (!routeCoords || routeCoords.length === 0) throw new Error("AI 경로 좌표를 수신하지 못했습니다.");
                
                var minutesPerKm = (mode === 'walk') ? 15.0 : (mode === 'bike') ? 4.0 : 3.0;
                var summary = window.summarizeGRouteResult(data, minutesPerKm);
                var dist = summary.distKm;
                var time = summary.timeMin;

                // 모드 맞춤형 색상으로 턴그리기
                drawGRouteAiPath(routeCoords, mode, 'fast');

                var viaHtml = "";
                if (window.wayCoord) {
                    var wayLabel = window.wayCoord.addr || '경유지';
                    var viaColor = (mode === 'walk') ? '#f97316' : '#8b5cf6';
                    viaHtml = `📍 경유: <b style="color:${viaColor};">${wayLabel}</b><br>`;
                }

                var guidanceHtml = '';
                var themeColor = (mode === 'walk') ? '#f97316' : '#8b5cf6';
                if (window.currentMapMode === 'research' && data.guidance && data.guidance.length > 0) {
                    guidanceHtml = `
                    <div style="margin-top:12px; border-top:1px solid rgba(59,130,246,0.15); padding-top:10px; margin-bottom:10px;">
                        <div style="font-size:12px; font-weight:700; color:var(--text-main); margin-bottom:6px; display:flex; align-items:center; gap:4px;">🧭 턴바이턴 경로 안내</div>
                        <div style="max-height:150px; overflow-y:auto; display:flex; flex-direction:column; gap:4px; padding-right:4px;">
                            ${data.guidance.map((g, idx) => `
                                <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); padding:5px 8px; background:var(--bg-input); border:1px solid var(--border-panel); border-radius:6px;">
                                    <span>${idx + 1}. ${g.instruction}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>`;
                }

                if (mode === 'shared') {
                    window._lastSharedDist = parseFloat(dist);
                    window._lastSharedTime = time;
                    window._lastSharedFeatures = null;
                    renderSharedResult(parseFloat(dist), time, null,
                                       window.renderPartialRouteNotice(data) + gapNoteHtml('groute-gap-note') + viaHtml,
                                       "", data.guidance);
                    window.connectGRouteEnds(routeCoords, myRoutingRenderId, 'groute-gap-note');
                } else {
                    var badgeStyle = (mode === 'walk') 
                        ? 'background:#fff7ed; border:1px dashed #fed7aa; color:#7c2d12;'
                        : 'background:#faf5ff; border:1px dashed #d8b4fe; color:#581c87;';
                        
                    var brainBadge = (window.currentMapMode === 'research') ? `
                    <div style="font-size:11px; line-height:1.5; padding:8px; border-radius:8px; margin-bottom:10px; ${badgeStyle}">
                        🧠 <b>G-Route 경로 탐색</b><br>
                        - ${mode === 'walk' ? '큰길에서 인도가 없는 구간과 급경사를 피하도록 가중치를 준 경로입니다.' : '오르막 경사를 피하고 자전거 도로를 선호하도록 가중치를 준 경로입니다.'}<br>
                        - 시간: ${summary.basis}
                    </div>` : '';

                    var modeIcon = (mode === 'walk') ? '🚶' : '🚲';
                    var modeLabel = (mode === 'walk') ? '도보' : '자전거';

                    resultDiv.innerHTML = `
                    <div style="padding:15px; border-radius:12px; background:var(--bg-card); box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                        <div style="font-size:13px; font-weight:700; color:var(--text-muted); margin-bottom:8px;">${modeIcon} G-Route 길찾기 안내</div>
                        ${window.renderPartialRouteNotice(data)}
                        ${gapNoteHtml('groute-gap-note')}
                        ${viaHtml}
                        <div style="margin-bottom:12px; font-size:14px; color:var(--text-main); margin-top:8px;">
                            <span style="font-size:26px; font-weight:800; color:${themeColor}; letter-spacing:-0.5px;">${window.formatTime(time)}</span>
                            <span style="margin-left:8px; font-weight:600; color:var(--text-muted);">${dist} km</span>
                        </div>
                        ${brainBadge}
                        ${guidanceHtml}
                        <div id="groute-benchmark-card"></div>
                    </div>`;
                    window.connectGRouteEnds(routeCoords, myRoutingRenderId, 'groute-gap-note');
                    // 벤치마크 비교 카드 백그라운드 호출
                    window.fetchBenchmark(mode);
                    openRouteDetailPanel(`${modeLabel} AI 경로 상세`, time, dist, data.guidance || []);
                }
            })
            .catch(err => {
                if (myRoutingRenderId !== currentRoutingRenderId) return;
                resultDiv.innerHTML = `<div style="padding:10px; color:#ef4444; font-size:11px;">⚠️ G-Route AI 오류: ${err.message}. 일반 길찾기로 우회합니다...</div>`;
                setTimeout(() => calcRoute(mode, '0'), 2500);
            });
            return;
        }

        // ── 경유지가 있는 경우: 두 구간으로 분할 ──
        if (window.wayCoord) {
            var payload1 = {
                startX: window.startCoord.lng, startY: window.startCoord.lat,
                endX: window.wayCoord.lng, endY: window.wayCoord.lat,
                reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO",
                startName: "출발", endName: "경유지"
            };
            var payload2 = {
                startX: window.wayCoord.lng, startY: window.wayCoord.lat,
                endX: window.endCoord.lng, endY: window.endCoord.lat,
                reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO",
                startName: "경유지", endName: "도착"
            };
            Promise.all([
                window.fetchTmapWithOSRMFallback(pedUrl, payload1, mode),
                window.fetchTmapWithOSRMFallback(pedUrl, payload2, mode)
            ])
            .then(([data1, data2]) => {
                if (myRoutingRenderId !== currentRoutingRenderId) return;
                if (data1.error) throw new Error(data1.error.message || "출발→경유지 도보 길찾기 에러");
                if (data2.error) throw new Error(data2.error.message || "경유지→도착 도보 길찾기 에러");
                if (!data1.features || data1.features.length === 0) throw new Error("출발→경유지 도보 경로를 찾을 수 없습니다.");
                if (!data2.features || data2.features.length === 0) throw new Error("경유지→도착 도보 경로를 찾을 수 없습니다.");

                var dist = data1.features[0].properties.totalDistance + data2.features[0].properties.totalDistance;
                var totalTimeSec = data1.features[0].properties.totalTime + data2.features[0].properties.totalTime;

                drawTmapFeatures(data1.features, '#ef4444', 'shortdash');
                drawTmapFeatures(data2.features, '#8b5cf6', 'shortdash');


                var wayLabel = window.wayCoord.addr || '경유지';
                var viaHtml = `📍 경유: <b style="color:#8b5cf6;">${wayLabel}</b><br>`;

                if (mode === 'walk') {
                    var time = Math.ceil(totalTimeSec / 60);
                    resultDiv.innerHTML = `
                    <div style="padding:15px; border-radius:12px; background:var(--bg-card); box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                        ${optionTabsHtml}
                        🏁 <b>도보 (경유)</b><br>${viaHtml}
                        ⏱ 소요시간: <b style="color:#ef4444; font-size:16px;">${window.formatTime(time)}</b><br>
                        📏 이동거리: ${(dist / 1000).toFixed(1)}km
                    </div>`;
                } else if (mode === 'bike') {
                    var time = Math.ceil(dist / 250);
                    resultDiv.innerHTML = `
                    <div style="padding:15px; border-radius:12px; background:var(--bg-card); box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                        ${optionTabsHtml}
                        🏁 <b>일반자전거 (경유)</b><br>${viaHtml}
                        ⏱ 소요시간: <b style="color:#ef4444; font-size:16px;">${window.formatTime(time)}</b><br>
                        📏 이동거리: ${(dist / 1000).toFixed(1)}km
                    </div>`;
                } else if (mode === 'shared') {
                    var distKm = dist / 1000;
                    var time = Math.ceil(dist / 333);
                    window._lastSharedDist = distKm;
                    window._lastSharedTime = time;
                    window._lastSharedFeatures = null;
                    renderSharedResult(distKm, time, null, viaHtml, optionTabsHtml);
                }
            }).catch(e => {
                if (myRoutingRenderId !== currentRoutingRenderId) return;
                resultDiv.innerHTML = "🚨 경유지 길찾기 에러: " + e.message;
            });

        } else {
            // ── 경유지 없는 기존 로직 ──
            var payload = {
                startX: window.startCoord.lng, startY: window.startCoord.lat,
                endX: window.endCoord.lng, endY: window.endCoord.lat,
                reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO",
                startName: "출발", endName: "도착"
            };
            window.fetchTmapWithOSRMFallback(pedUrl, payload, mode)
            .then(data => {
                if (myRoutingRenderId !== currentRoutingRenderId) return;
                if (data.error) throw new Error(data.error.message || "도보 길찾기 에러 발생");
                if (!data.features || data.features.length === 0) throw new Error("도보 경로를 찾을 수 없습니다.");
                var props = data.features[0].properties;
                var dist = props.totalDistance; // 미터

                drawTmapFeatures(data.features, '#ef4444', 'shortdash');

                if (mode === 'walk') {
                    var time = Math.ceil(props.totalTime / 60);
                    resultDiv.innerHTML = `
                    <div style="padding:15px; border-radius:12px; background:var(--bg-card); box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                        ${optionTabsHtml}
                        🏁 <b>도보</b><br>
                        ⏱ 소요시간: <b style="color:#ef4444; font-size:16px;">${window.formatTime(time)}</b><br>
                        📏 이동거리: ${(dist / 1000).toFixed(1)}km
                    </div>`;
                    openRouteDetailPanel('🚶 도보 경로 상세', time, (dist / 1000).toFixed(1), data.features);
                } else if (mode === 'bike') {
                    var time = Math.ceil(dist / 250); 
                    resultDiv.innerHTML = `
                    <div style="padding:15px; border-radius:12px; background:var(--bg-card); box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                        ${optionTabsHtml}
                        🏁 <b>일반자전거</b><br>
                        ⏱ 소요시간: <b style="color:#ef4444; font-size:16px;">${window.formatTime(time)}</b><br>
                        📏 이동거리: ${(dist / 1000).toFixed(1)}km
                    </div>`;
                    openRouteDetailPanel('🚲 자전거 경로 상세', time, (dist / 1000).toFixed(1), data.features);
                } else if (mode === 'shared') {
                    var distKm = dist / 1000;
                    var time = Math.ceil(dist / 333);
                    window._lastSharedDist = distKm;
                    window._lastSharedTime = time;
                    window._lastSharedFeatures = data.features;
                    renderSharedResult(distKm, time, data.features, null, optionTabsHtml);
                }
            }).catch(e => {
                if (myRoutingRenderId !== currentRoutingRenderId) return;
                resultDiv.innerHTML = "🚨 길찾기 에러: " + e.message;
            });
        }
    }
};

window.simulateTaxiCall = function() {
    if (!startCoord) return;
    
    // Create taxi marker near start
    var offsetLat = (Math.random() - 0.5) * 0.006;
    var offsetLng = (Math.random() - 0.5) * 0.006;
    var taxiLat = startCoord.lat + offsetLat;
    var taxiLng = startCoord.lng + offsetLng;
    
    var taxiIcon = L.divIcon({
        html: '<div style="font-size:28px; filter:drop-shadow(0 2px 3px rgba(0,0,0,0.3)); animation: taxiBounce 0.5s ease;">🚕</div>',
        className: 'taxi-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
    var taxiMarker = L.marker([taxiLat, taxiLng], { icon: taxiIcon, zIndexOffset: 2000 }).addTo(window.map);
    
    // Animate taxi to start position
    var steps = 60;
    var step = 0;
    var dLat = (startCoord.lat - taxiLat) / steps;
    var dLng = (startCoord.lng - taxiLng) / steps;
    
    var animation = setInterval(function() {
        step++;
        taxiLat += dLat;
        taxiLng += dLng;
        taxiMarker.setLatLng([taxiLat, taxiLng]);
        
        if (step >= steps) {
            clearInterval(animation);
            taxiMarker.bindPopup('<div style="text-align:center; font-weight:700; color:var(--text-main);">🚕 택시가 도착했습니다!<br><span style="font-size:11px; color:var(--text-muted);">탑승해 주세요</span></div>').openPopup();
            setTimeout(function() {
                taxiMarker.remove();
            }, 5000);
        }
    }, 30);
};

// ============================================
// 공유플랫폼 요금 계산기
// ============================================
function renderSharedResult(distKm, timeMin, features, viaHtml, optionTabsHtml, guidance) {
    var resultDiv = document.getElementById('route-result');
    var baseFare = SHARED_BASE_FARE;
    var perKm = SHARED_PER_KM;
    var perMin = SHARED_PER_MIN;
    var totalFare = baseFare + Math.round(distKm * perKm) + (timeMin * perMin);
    
    var presetBtns = `
    <div style="display:flex; gap:4px; margin-bottom:10px; flex-wrap:wrap;">
        <button onclick="applySharedPreset('kickboard')" id="preset-kickboard" style="flex:1; padding:6px 4px; font-size:10px; border-radius:6px; cursor:pointer; font-weight:700; border:1px solid ${SHARED_PRESET==='kickboard'?'transparent':'var(--border-panel)'}; transition:all 0.2s; ${SHARED_PRESET==='kickboard'?'background:var(--primary-grad);color:white;':'background:var(--bg-input);color:var(--text-main);'}">🛴 킥보드</button>
        <button onclick="applySharedPreset('bike')" id="preset-bike" style="flex:1; padding:6px 4px; font-size:10px; border-radius:6px; cursor:pointer; font-weight:700; border:1px solid ${SHARED_PRESET==='bike'?'transparent':'var(--border-panel)'}; transition:all 0.2s; ${SHARED_PRESET==='bike'?'background:var(--primary-grad);color:white;':'background:var(--bg-input);color:var(--text-main);'}">🚲 자전거</button>
        <button onclick="applySharedPreset('ebike')" id="preset-ebike" style="flex:1; padding:6px 4px; font-size:10px; border-radius:6px; cursor:pointer; font-weight:700; border:1px solid ${SHARED_PRESET==='ebike'?'transparent':'var(--border-panel)'}; transition:all 0.2s; ${SHARED_PRESET==='ebike'?'background:var(--primary-grad);color:white;':'background:var(--bg-input);color:var(--text-main);'}">🏍️ 바이크</button>
        <button onclick="applySharedPreset('custom')" id="preset-custom" style="flex:1; padding:6px 4px; font-size:10px; border-radius:6px; cursor:pointer; font-weight:700; border:1px solid ${SHARED_PRESET==='custom'?'transparent':'var(--border-panel)'}; transition:all 0.2s; ${SHARED_PRESET==='custom'?'background:var(--primary-grad);color:white;':'background:var(--bg-input);color:var(--text-main);'}">⚙️ 직접설정</button>
    </div>`;
    
    var fareInputs = `
    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; margin-bottom:10px; background:var(--bg-input); padding:8px; border-radius:8px; border:1px solid var(--border-panel);">
        <div style="text-align:center;"><div style="font-size:10px; color:var(--text-muted); margin-bottom:2px;">기본요금</div>
            <input type="number" id="shared-base" class="glass-input" value="${baseFare}" oninput="recalcSharedFare()" style="padding:4px; font-size:12px; text-align:center; font-weight:700;" />
            <div style="font-size:9px; color:var(--text-muted); margin-top:2px;">원</div></div>
        <div style="text-align:center;"><div style="font-size:10px; color:var(--text-muted); margin-bottom:2px;">km당</div>
            <input type="number" id="shared-perkm" class="glass-input" value="${perKm}" oninput="recalcSharedFare()" style="padding:4px; font-size:12px; text-align:center; font-weight:700;" />
            <div style="font-size:9px; color:var(--text-muted); margin-top:2px;">원/km</div></div>
        <div style="text-align:center;"><div style="font-size:10px; color:var(--text-muted); margin-bottom:2px;">분당</div>
            <input type="number" id="shared-permin" class="glass-input" value="${perMin}" oninput="recalcSharedFare()" style="padding:4px; font-size:12px; text-align:center; font-weight:700;" />
            <div style="font-size:9px; color:var(--text-muted); margin-top:2px;">원/분</div></div>
    </div>`;
    
    var calcBreakdown = `
    <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.2); border-radius:8px; padding:10px; color:var(--text-main);">
        <div style="font-size:13px; font-weight:700; color:#10b981; margin-bottom:6px;">💰 예상 요금: <span id="shared-total-fare" style="font-size:18px;">${totalFare.toLocaleString()}</span>원</div>
        <div id="shared-fare-breakdown" style="font-size:11px; color:var(--text-muted); line-height:1.6;">
            = 기본 ${baseFare.toLocaleString()} + 거리 ${Math.round(distKm * perKm).toLocaleString()} (${distKm.toFixed(1)}km × ${perKm}) + 시간 ${(timeMin * perMin).toLocaleString()} (${timeMin}분 × ${perMin})
        </div>
    </div>`;

    var brainBadge = (window.currentMapMode === 'research') ? `
    <div style="font-size:11px; line-height:1.5; padding:8px; border-radius:8px; margin-bottom:10px; background:#faf5ff; border:1px dashed #d8b4fe; color:#581c87;">
        🧠 <b>G-Route AI 멀티모달 엔진</b><br>
        - 배터리 소모를 최적화하고 자전거 도로를 위주로 우회 매핑하였습니다.
    </div>` : '';

    var guidanceHtml = '';
    if (window.currentMapMode === 'research' && guidance && guidance.length > 0) {
        guidanceHtml = `
        <div style="margin-top:12px; border-top:1px solid var(--border-panel); padding-top:10px; margin-bottom:10px;">
            <div style="font-size:12px; font-weight:700; color:var(--text-main); margin-bottom:6px; display:flex; align-items:center; gap:4px;">🧭 턴바이턴 경로 안내</div>
            <div style="max-height:150px; overflow-y:auto; display:flex; flex-direction:column; gap:4px; padding-right:4px;">
                ${guidance.map((g, idx) => `
                    <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); padding:5px 8px; background:var(--bg-input); border:1px solid var(--border-panel); border-radius:6px;">
                        <span>${idx + 1}. ${g.instruction}</span>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }
    
    resultDiv.innerHTML = `
        ${optionTabsHtml || ''}
        ${viaHtml ? viaHtml : ''}
        <div style="padding:15px; border-radius:12px; background:var(--bg-card); box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
            <div style="font-size:13px; font-weight:700; color:var(--text-muted); margin-bottom:8px;">🛴 G-Route 길찾기 안내</div>
            <div style="margin-bottom:12px; font-size:14px; color:var(--text-main); margin-top:8px;">
                <span style="font-size:26px; font-weight:800; color:#8b5cf6; letter-spacing:-0.5px;">${window.formatTime(timeMin)}</span>
                <span style="margin-left:8px; font-weight:600; color:var(--text-muted);">${distKm.toFixed(1)} km</span>
            </div>
            ${brainBadge}
            ${presetBtns}
            ${fareInputs}
            ${calcBreakdown}
            ${guidanceHtml}
            <div id="groute-benchmark-card"></div>
        </div>`;
    
    if (features) {
        drawTmapFeatures(features, '#8b5cf6', 'shortdash');
        openRouteDetailPanel('🛴 공유플랫폼 경로 상세', timeMin, distKm.toFixed(1), features);
    } else if (guidance) {
        openRouteDetailPanel('🛴 공유플랫폼 경로 상세', timeMin, distKm.toFixed(1), guidance);
    }
    window.fetchBenchmark('shared');
}

window.applySharedPreset = function(preset) {
    var presets = {
        kickboard: { base: 1000, km: 200, min: 150 },
        bike: { base: 1000, km: 0, min: 100 },
        ebike: { base: 1500, km: 300, min: 200 },
        custom: null
    };
    SHARED_PRESET = preset;
    if (presets[preset]) {
        SHARED_BASE_FARE = presets[preset].base;
        SHARED_PER_KM = presets[preset].km;
        SHARED_PER_MIN = presets[preset].min;
        var el1 = document.getElementById('shared-base'); if(el1) el1.value = SHARED_BASE_FARE;
        var el2 = document.getElementById('shared-perkm'); if(el2) el2.value = SHARED_PER_KM;
        var el3 = document.getElementById('shared-permin'); if(el3) el3.value = SHARED_PER_MIN;
    }
    ['kickboard','bike','ebike','custom'].forEach(function(p) {
        var btn = document.getElementById('preset-' + p);
        if (btn) {
            if (p === preset) { 
                btn.style.background = 'var(--primary-grad)'; 
                btn.style.color = 'white'; 
                btn.style.borderColor = 'transparent'; 
            } else { 
                btn.style.background = 'var(--bg-input)'; 
                btn.style.color = 'var(--text-main)'; 
                btn.style.borderColor = 'var(--border-panel)'; 
            }
        }
    });
    recalcSharedFare();
};

window.recalcSharedFare = function() {
    var baseEl = document.getElementById('shared-base');
    var kmEl = document.getElementById('shared-perkm');
    var minEl = document.getElementById('shared-permin');
    
    var baseFare = baseEl ? (parseInt(baseEl.value) || 0) : (window.SHARED_BASE_FARE || 0);
    var perKm = kmEl ? (parseInt(kmEl.value) || 0) : (window.SHARED_PER_KM || 0);
    var perMin = minEl ? (parseInt(minEl.value) || 0) : (window.SHARED_PER_MIN || 0);
    
    var distKm = window._lastSharedDist || 0;
    var timeMin = window._lastSharedTime || 0;
    window.SHARED_BASE_FARE = baseFare; window.SHARED_PER_KM = perKm; window.SHARED_PER_MIN = perMin;
    
    var totalFare = baseFare + Math.round(distKm * perKm) + (timeMin * perMin);
    var fareEl = document.getElementById('shared-total-fare');
    if (fareEl) fareEl.textContent = totalFare.toLocaleString();
    var breakdownEl = document.getElementById('shared-fare-breakdown');
    if (breakdownEl) breakdownEl.textContent = '= 기본 ' + baseFare.toLocaleString() + ' + 거리 ' + Math.round(distKm * perKm).toLocaleString() + ' (' + distKm.toFixed(1) + 'km × ' + perKm + ') + 시간 ' + (timeMin * perMin).toLocaleString() + ' (' + timeMin + '분 × ' + perMin + ')';
    
    localStorage.setItem('gumap_shared_fare', JSON.stringify({ baseFare: baseFare, perKm: perKm, perMin: perMin, preset: window.SHARED_PRESET }));
};

// ============================================
// 자동차/도보/자전거/공유 경로 상세 패널 (턴바이턴 안내)
// ============================================
window.openRouteDetailPanel = function(title, time, dist, features) {
    var panel = document.getElementById('route-detail-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'route-detail-panel';
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
    
    if (window._closeRoutePanelTimeout) {
        clearTimeout(window._closeRoutePanelTimeout);
        window._closeRoutePanelTimeout = null;
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

    // G-Route AI 턴바이턴 안내 리스트인 경우와 기존 TMAP API features 형태 구분 처리
    var turns = [];
    var currentSegmentColor = 'var(--primary-color)';
    var currentCongestionLabel = '';
    var totalDist = 0;
    var distMap = { 1: 0, 2: 0, 3: 0, 4: 0 };
    
    if (features.length > 0 && features[0].instruction !== undefined) {
        features.forEach(function(item) {
            var desc = item.instruction;
            var icon = '➡️';
            if (desc.includes('좌회전')) icon = '⬅️';
            else if (desc.includes('우회전')) icon = '➡️';
            else if (desc.includes('직진')) icon = '⬆️';
            else if (desc.includes('유턴')) icon = '↩️';
            else if (desc.includes('출발')) icon = '🟢';
            else if (desc.includes('도착')) icon = '🔴';
            else if (desc.includes('횡단보도')) icon = '🚶';
            
            turns.push({
                icon: icon,
                desc: desc,
                dist: item.distance || 0,
                color: 'var(--primary-color)'
            });
        });
    } else {
        // TMAP features에서 혼잡도 거리 연산 및 턴 지시 추출
        var accumTime = 0;
        var accumDist = 0;
        
        features.forEach(function(f) {
            if (f.geometry.type === 'LineString') {
                var cong = (f.properties && f.properties.congestion !== undefined) ? f.properties.congestion : 0;
                var d = f.properties.distance || 0;
                if (cong >= 1 && cong <= 4) {
                    distMap[cong] += d;
                    totalDist += d;
                }
                accumTime += f.properties.time || 0;
                accumDist += d;
                
                switch(cong) {
                    case 1: currentSegmentColor = '#22c55e'; currentCongestionLabel = '원활'; break;
                    case 2: currentSegmentColor = '#eab308'; currentCongestionLabel = '서행'; break;
                    case 3: currentSegmentColor = '#f97316'; currentCongestionLabel = '지체'; break;
                    case 4: currentSegmentColor = '#ef4444'; currentCongestionLabel = '정체'; break;
                    default: currentSegmentColor = 'var(--primary-color)'; currentCongestionLabel = '';
                }
            }
            if (f.geometry.type === 'Point' && f.properties.description) {
                var desc = f.properties.description;
                var turnType = f.properties.turnType || 0;
                var icon = '➡️';
                if (turnType === 12 || desc.includes('좌회전')) icon = '⬅️';
                else if (turnType === 13 || desc.includes('우회전')) icon = '➡️';
                else if (turnType === 11 || desc.includes('직진')) icon = '⬆️';
                else if (turnType === 14 || desc.includes('유턴')) icon = '↩️';
                else if (turnType === 200 || desc.includes('출발')) icon = '🟢';
                else if (turnType === 201 || desc.includes('도착')) icon = '🔴';
                else if (desc.includes('횡단보도')) icon = '🚶';
                else if (desc.includes('계단')) icon = '🪜';
                
                turns.push({ 
                    icon: icon, 
                    desc: desc, 
                    dist: accumDist, 
                    time: accumTime,
                    color: currentSegmentColor,
                    congestionLabel: currentCongestionLabel 
                });
            }
        });
    }

    // 혼잡도 요약 바 HTML 생성
    var congestionBarHtml = '';
    if (totalDist > 0) {
        var pGreen = Math.round((distMap[1] / totalDist) * 100);
        var pYellow = Math.round((distMap[2] / totalDist) * 100);
        var pOrange = Math.round((distMap[3] / totalDist) * 100);
        var pRed = Math.round((distMap[4] / totalDist) * 100);
        
        congestionBarHtml = `
        <div style="margin-top: 10px; font-family:'Noto Sans KR',sans-serif;">
            <div style="font-size: 11px; font-weight:700; color:var(--text-muted); margin-bottom:5px; display:flex; justify-content:space-between;">
                <span>🚦 교통 혼잡도 요약</span>
                <span>원활 ${pGreen}% | 서행 ${pYellow}% | 정체 ${pOrange + pRed}%</span>
            </div>
            <div style="display:flex; height:8px; border-radius:4px; overflow:hidden; background:#e2e8f0; border: 1px solid var(--border-panel);">
                ${pGreen > 0 ? `<div style="width:${pGreen}%; background:#22c55e;" title="원활: ${pGreen}%"></div>` : ''}
                ${pYellow > 0 ? `<div style="width:${pYellow}%; background:#eab308;" title="서행: ${pYellow}%"></div>` : ''}
                ${pOrange > 0 ? `<div style="width:${pOrange}%; background:#f97316;" title="지체: ${pOrange}%"></div>` : ''}
                ${pRed > 0 ? `<div style="width:${pRed}%; background:#ef4444;" title="정체: ${pRed}%"></div>` : ''}
            </div>
        </div>`;
    }

    var headerHtml = `
    <div class="detail-sheet-handle" data-panel-id="route-detail-panel" onclick="window.toggleDetailPanel('route-detail-panel')">
        <div class="detail-sheet-bar"></div>
    </div>
    <div style="position:relative; font-family:'Noto Sans KR',sans-serif; margin-bottom:15px;">
        <button onclick="window.closeRouteDetailPanel()" style="position:absolute; top:-5px; right:-5px; background:none; border:none; font-size:22px; cursor:pointer; color:#94a3b8; font-weight:700;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#94a3b8'">&times;</button>
        <h3 style="margin:0 0 10px 0; font-size:16px; color:var(--text-main); font-weight:700;">${title}</h3>
        <div style="display:flex; gap:10px; font-size:12px; background:var(--primary-grad); color:white; padding:12px; border-radius:10px; font-weight:600;">
            <div>⏱ <b>${window.formatTime(time)}</b></div>
            <div>📏 <b>${dist}km</b></div>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:8px; background:var(--bg-input); border:1px solid var(--border-panel); padding:8px; border-radius:8px;">
            🟢 ${startCoord.addr || '출발지'} → 🔴 ${endCoord.addr || '도착지'}
        </div>
        ${congestionBarHtml}
    </div>`;

    var turnsHtml = '';
    if (turns.length > 0) {
        turnsHtml = '<div style="margin-left:6px; font-family:Noto Sans KR,sans-serif;">';
        turns.forEach(function(t) {
            var badgeHtml = '';
            if (t.congestionLabel) {
                var congBg = '#dcfce7';
                var congFg = '#16a34a';
                if (t.congestionLabel === '서행') { congBg = '#fef9c3'; congFg = '#ca8a04'; }
                else if (t.congestionLabel === '지체') { congBg = '#ffedd5'; congFg = '#ea580c'; }
                else if (t.congestionLabel === '정체') { congBg = '#fee2e2'; congFg = '#dc2626'; }
                badgeHtml = `<span style="font-size:10px; padding:2px 6px; border-radius:4px; margin-left:8px; font-weight:700; background:${congBg}; color:${congFg};">${t.congestionLabel}</span>`;
            }
            
            var timeHtml = '';
            if (t.time !== undefined && t.time > 0) {
                timeHtml = `<div style="font-size:10px; color:var(--text-muted); margin-top:2px;">⏱ 여기까지 약 ${Math.ceil(t.time / 60)}분 (${(t.dist / 1000).toFixed(1)}km)</div>`;
            }
            
            turnsHtml += `
            <div style="position:relative; padding:8px 0 14px 0; border-left:3px solid ${t.color}; padding-left:14px; margin-left:10px;">
                <div style="position:absolute; left:-7.5px; top:12px; width:12px; height:12px; background:${t.color}; border-radius:50%; border:2px solid var(--bg-panel); box-shadow:0 0 0 1px ${t.color};"></div>
                <div style="font-size:12px; color:var(--text-main); font-weight:500;">${t.icon} ${t.desc} ${badgeHtml}</div>
                ${timeHtml}
            </div>`;
        });
        turnsHtml += '</div>';
    } else {
        turnsHtml = '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:12px;">경로 상세 안내가 제공되지 않는 구간입니다.</div>';
    }

    panel.innerHTML = DOMPurify.sanitize(headerHtml + turnsHtml, window.DOM_PURIFY_CONFIG);
};

window.closeRouteDetailPanel = function() {
    var panel = document.getElementById('route-detail-panel');
    if (panel) {
        panel.classList.remove('panel-expanded', 'panel-collapsed');
        panel.classList.add('panel-hidden');
        panel.style.opacity = '0';
        if (window.innerWidth > 768) {
            panel.style.transform = 'translateX(-10px)';
        } else {
            panel.style.transform = 'translateY(110%)';
        }
        if (window._closeRoutePanelTimeout) clearTimeout(window._closeRoutePanelTimeout);
        window._closeRoutePanelTimeout = setTimeout(function() { 
            panel.style.display = 'none'; 
            window._closeRoutePanelTimeout = null;
        }, 300);
    }
};

// 최초 버스 탑승 구간 정류장의 실시간 ETA 정보 가져오기
/**
 * 시간표로 본 다음 차. 실시간 정보는 이미 운행 중인 차만 알려 주므로, 도착 예정
 * 차가 없을 때 "가장 가까운 시간"을 여기서 구한다.
 *
 * 구미시 BIS 시간표는 기점 출발 시각이다. 승차 정류장이 기점이 아니면 노선
 * 경유 정류장(TAGO) 좌표로 기점~승차 정류장 거리를 재고, 이 구간 버스 속도
 * (ODsay sectionTime)로 걸리는 시간을 어림해 더한다.
 *
 * @param sub ODsay 버스 구간 (lane[0].busLocalBlID, startLocalStationID, startY/X, distance, sectionTime)
 * @return Promise<{atStop: Date, originTime, originName, estimated, tomorrow} | null>
 */
window.fetchNextScheduledBus = function(sub) {
    var lane = sub && sub.lane && sub.lane[0];
    var blId = lane && lane.busLocalBlID;        // 예: GMB19010 (방향별 노선 ID)
    if (!blId || !/^GMB/.test(blId)) return Promise.resolve(null);   // 구미 시내버스만
    var bisId = blId.replace(/^GMB/, '');
    var dayType = d => (d.getDay() === 0 || d.getDay() === 6) ? '2' : '0';   // 평일 / 주말
    var toMin = t => { var p = String(t).split(':'); return (+p[0]) * 60 + (+p[1]); };
    var timetable = type => fetch(`${window.PROXY_URL}/bus-timetable?routeId=${encodeURIComponent(bisId)}&bType=${type}`)
        .then(res => res.ok ? res.json() : { rows: [] })
        .then(data => (data.rows || []).map(r => r.starttime).filter(t => /^\d{1,2}:\d{2}$/.test(t)));

    // 기점 → 승차 정류장 소요 시간(분). 모르면 0 으로 두고 '기점 출발' 로 안내한다.
    var offsetPromise = fetchAPI(`https://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteAcctoThrghSttnList?pageNo=1&numOfRows=300&_type=json&cityCode=37050&routeId=${encodeURIComponent(blId)}`)
        .then(data => {
            var list = data.response && data.response.body && data.response.body.items && data.response.body.items.item;
            var stops = (Array.isArray(list) ? list : (list ? [list] : [])).sort((a, b) => a.nodeord - b.nodeord);
            if (!stops.length) return { minutes: 0, origin: null, known: false };
            var at = stops.findIndex(s => s.nodeid === sub.startLocalStationID);
            if (at < 0) {
                var lat = parseFloat(sub.startY), lng = parseFloat(sub.startX);
                at = stops.reduce((best, s, i) => {
                    var d = Math.abs(s.gpslati - lat) + Math.abs(s.gpslong - lng);
                    return d < best.d ? { i: i, d: d } : best;
                }, { i: 0, d: Infinity }).i;
            }
            var meters = 0;
            for (var i = 1; i <= at; i++) {
                meters += L.latLng(stops[i - 1].gpslati, stops[i - 1].gpslong)
                    .distanceTo(L.latLng(stops[i].gpslati, stops[i].gpslong));
            }
            // 이 구간 평균 속도, 시속 12~40km 사이로 묶는다
            var mpm = (sub.distance && sub.sectionTime) ? sub.distance / sub.sectionTime : 350;
            mpm = Math.min(Math.max(mpm, 200), 670);
            return { minutes: Math.round(meters / mpm), origin: stops[0].nodenm, known: true };
        })
        .catch(() => ({ minutes: 0, origin: null, known: false }));

    var now = new Date();
    var tomorrow = new Date(now.getTime() + 86400000);
    return Promise.all([timetable(dayType(now)), offsetPromise]).then(([times, offset]) => {
        var nowMin = now.getHours() * 60 + now.getMinutes();
        var next = times.find(t => toMin(t) + offset.minutes >= nowMin);
        var pick = next ? Promise.resolve({ t: next, tomorrow: false })
            : (dayType(tomorrow) === dayType(now) ? Promise.resolve(times) : timetable(dayType(tomorrow)))
                .then(list => list.length ? { t: list[0], tomorrow: true } : null);
        return pick.then(found => {
            if (!found) return null;
            var atStop = new Date(found.tomorrow ? tomorrow : now);
            atStop.setHours(0, toMin(found.t) + offset.minutes, 0, 0);
            return { atStop: atStop, originTime: found.t, originName: offset.origin,
                     estimated: offset.known && offset.minutes > 0, offsetKnown: offset.known,
                     tomorrow: found.tomorrow };
        });
    });
};

/**
 * 승차 정류장의 실시간 도착 정보를 조회해 버스 배지(elementId)에 적는다.
 * briefing 을 주면(첫 번째로 타는 버스) 상단 브리핑 카드도 결과로 바꾼다.
 * briefing.walkMinutes: 출발지에서 그 정류장까지 걷는 시간(분).
 *
 * 공공데이터포털은 serviceKey 가 필요해 브라우저에서 바로 부르면 401 이 난다.
 * 반드시 fetchAPI(서버 /tago-api 프록시)로 부른다.
 */
window.fetchETAForStop = function(stopName, lat, lng, busNo, elementId, briefing, sub) {
    var targetEl = document.getElementById(elementId);
    if (!targetEl) return;
    var TAGO = 'https://apis.data.go.kr/1613000/BusSttnInfoInqireService/';
    // 브리핑 카드는 innerHTML 로 바로 쓰므로 API 가 준 이름을 이스케이프한다
    var safeStop = String(stopName).replace(/[&<>"']/g, '');
    // ODsay 는 "5200(김천.김천(구미)역...)" 처럼 경유지를 붙여 준다. TAGO routeno 는 번호만 있다.
    var routeNo = String(busNo).replace(/\(.*$/, '').trim();
    var safeBus = routeNo.replace(/[&<>"']/g, '');

    function items(data) {
        var list = data && data.response && data.response.body && data.response.body.items &&
                   data.response.body.items.item;
        return !list ? [] : (Array.isArray(list) ? list : [list]);
    }
    function badge(color, text) {
        targetEl.innerHTML = `<span style="color:${color}; font-size:11px; font-weight:bold; margin-left:6px;">[${text}]</span>`;
    }
    function brief(html) {
        var el = briefing && document.getElementById('main-eta-briefing');
        if (el) el.innerHTML = `<div style="display:flex; align-items:center; gap:8px;"><span style="font-size:20px;">⏱️</span>
            <div style="font-size:12px; line-height:1.5; color:var(--text-main);">${html}</div></div>`;
    }
    function clock(date) {
        return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
    }

    // 실시간으로 오는 차가 없거나 조회에 실패하면 시간표에서 가장 가까운 차를 찾는다
    function showSchedule(reason) {
        var fallback = () => {
            badge('#64748b', reason === 'error' ? '정보없음' : '운행대기');
            brief(`<b>${safeBus}번</b> · ${safeStop}<br>` + (reason === 'error'
                ? '실시간 도착 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
                : '지금은 도착 예정인 차가 없고, 시간표 정보도 찾지 못했습니다.'));
        };
        window.fetchNextScheduledBus(sub).then(next => {
            if (!next) return fallback();
            var when = (next.tomorrow ? '내일 ' : '') + clock(next.atStop);
            var mins = Math.round((next.atStop - Date.now()) / 60000);
            var origin = next.originName ? next.originName.replace(/[&<>"']/g, '') : '기점';
            var how = next.estimated ? `${when}경 도착 예정` : (next.offsetKnown ? `${when} 출발` : `${origin} ${when} 출발`);
            badge('#2563eb', `시간표 · 다음 차 ${when}${next.estimated ? '경' : ''}`);
            var walkMin = briefing && Number(briefing.walkMinutes) || 0;
            var leave = (!next.tomorrow && walkMin && mins - walkMin >= 0)
                ? `<br>🚶 정류장까지 도보 ${walkMin}분 → <b style="color:#16a34a;">${clock(new Date(next.atStop - walkMin * 60000))}까지 출발</b>하세요` : '';
            brief(`<b>${safeBus}번</b> · ${safeStop} 승차<br>
                ${reason === 'error' ? '실시간 정보를 불러오지 못해 시간표로 안내합니다.' : '지금 운행 중인 차는 없습니다.'}<br>
                <b>가장 가까운 차:</b> <span style="color:#2563eb; font-weight:700;">${how}</span>` +
                (!next.tomorrow && mins >= 0 ? ` (${mins >= 60 ? Math.floor(mins / 60) + '시간 ' : ''}${mins % 60}분 후)` : '') +
                (next.estimated ? `<br><span style="font-size:11px; color:var(--text-muted);">${origin} ${next.originTime} 출발 시간표 기준 어림값</span>` : '') +
                leave);
        }).catch(fallback);
    }

    // 1) 정류장 ID: 이름으로 찾고 좌표가 가장 가까운 것을 고른다. ODsay 와 TAGO 의
    //    정류장 이름이 다르면 좌표 반경 검색으로 다시 찾는다.
    fetchAPI(`${TAGO}getSttnNoList?pageNo=1&numOfRows=20&_type=json&cityCode=37050&nodeNm=${encodeURIComponent(stopName)}`)
        .then(data => {
            var found = items(data);
            if (found.length) return found;
            return fetchAPI(`${TAGO}getCrdntPrxmtSttnList?pageNo=1&numOfRows=10&_type=json&gpsLati=${lat}&gpsLong=${lng}`).then(items);
        })
        .then(found => {
            if (!found.length) throw new Error("정류소 ID 없음: " + stopName);
            // ODsay 는 길 양쪽·인접 승강장을 한 정류장으로 합쳐 준다("구미역"). TAGO 에선
            // 노선마다 서는 승강장이 달라, 가장 가까운 한 곳만 보면 그 버스가 안 선다.
            // 반경 약 250m 안의 가까운 승강장 몇 곳을 같이 본다.
            var near = found
                .map(item => ({ id: item.nodeid, diff: Math.abs(item.gpslati - lat) + Math.abs(item.gpslong - lng) }))
                .sort((a, b) => a.diff - b.diff)
                .filter((item, i) => i === 0 || item.diff < 0.003)
                .slice(0, 4);
            // ODsay 가 알려 준 승차 정류장 ID 도 꼭 본다
            if (sub && sub.startLocalStationID && !near.some(item => item.id === sub.startLocalStationID)) {
                near.unshift({ id: sub.startLocalStationID });
            }
            // 2) 그 승강장들의 실시간 도착 예정 목록
            return Promise.all(near.map(item =>
                fetchAPI(`${window.PROXY_URL}/bus-arrival?pageNo=1&numOfRows=50&_type=json&cityCode=37050&nodeId=${item.id}`)
                    .then(items).catch(() => [])));
        })
        .then(lists => {
            var matchedBus = [].concat.apply([], lists)
                .filter(item => String(item.routeno).trim() === routeNo)
                .sort((a, b) => a.arrtime - b.arrtime)[0];
            if (!matchedBus) {
                showSchedule('none');
                return;
            }
            var arrSec = Number(matchedBus.arrtime) || 0;
            var min = Math.floor(arrSec / 60);
            var prevCnt = matchedBus.arrprevstationcnt;
            var isSoon = (prevCnt <= 1 || min <= 1);
            var arriveAt = clock(new Date(Date.now() + arrSec * 1000));
            if (isSoon) {
                targetEl.innerHTML = `<span style="color:#ef4444; font-size:11px; font-weight:bold; margin-left:6px; animation: blink 1s infinite;">[곧 도착/${prevCnt}전역]</span>`;
            } else {
                badge('#10b981', `${min}분 후 · ${arriveAt} 도착/${prevCnt}전역`);
            }

            // 정류장까지 걷는 시간과 비교해 언제 나서야 하는지 알려 준다
            var walkMin = briefing && Number(briefing.walkMinutes) || 0;
            var spare = min - walkMin;
            var advice = !walkMin ? ''
                : spare >= 1 ? `<br>🚶 정류장까지 도보 ${walkMin}분 → <b style="color:#16a34a;">${clock(new Date(Date.now() + spare * 60000))}까지 출발</b>하면 탈 수 있어요`
                : `<br>🚶 정류장까지 도보 ${walkMin}분 → <b style="color:#dc2626;">이번 차는 놓칠 수 있어요</b> (다음 차 이용)`;
            brief(`<b>${safeBus}번</b> · ${safeStop} 승차<br>
                <b>실시간 도착:</b> <span style="color:${isSoon ? '#dc2626' : '#16a34a'}; font-weight:700;">${isSoon ? '곧 도착' : min + '분 후'} (${arriveAt}, ${prevCnt}전역)</span>${advice}`);
        })
        .catch(err => {
            console.warn("ETA 조회 실패:", err);
            showSchedule('error');
        });
};

// 경류장 상세 보기 토글
window.toggleStopsList = function(id) {
    var el = document.getElementById(id);
    if (el) {
        if (el.style.display === 'none') {
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    }
};

// 대중교통 상세 경로 닫기
window.closeTransitDetailPanel = function() {
    var detailPanel = document.getElementById('transit-detail-panel');
    if (detailPanel) {
        detailPanel.classList.remove('panel-expanded', 'panel-collapsed');
        detailPanel.classList.add('panel-hidden');
        detailPanel.style.opacity = '0';
        if (window.innerWidth > 768) {
            detailPanel.style.transform = 'translateX(-10px)';
        } else {
            detailPanel.style.transform = 'translateY(110%)';
        }
        if (window._closeTransitPanelTimeout) clearTimeout(window._closeTransitPanelTimeout);
        window._closeTransitPanelTimeout = setTimeout(() => {
            detailPanel.style.display = 'none';
            window._closeTransitPanelTimeout = null;
        }, 300);
    }
};

// 대중교통 경로 리스트 그리기
window.renderTransitRouteList = function(paths, sortType, showDetailPanel) {
    window.currentTransitSortType = sortType || 'best';
    
    // 경로 복제 및 정렬
    var sortedPaths = paths.map((path, idx) => {
        var transferCount = Math.max(0, path.info.busTransitCount + path.info.subwayTransitCount - 1);
        return { path: path, originalIndex: idx, transferCount: transferCount };
    });
    
    if (sortType === 'time') {
        sortedPaths.sort((a, b) => a.path.info.totalTime - b.path.info.totalTime);
    } else if (sortType === 'transfer') {
        sortedPaths.sort((a, b) => {
            if (a.transferCount !== b.transferCount) {
                return a.transferCount - b.transferCount;
            }
            return a.path.info.totalTime - b.path.info.totalTime;
        });
    }

    var resultDiv = document.getElementById('route-result');
    
    // 정렬 토글 탭 생성
    var tabsHtml = `
    <div style="display:flex; gap:5px; margin-bottom:12px;">
        <button onclick="calcRoute('transit', 'best')" style="flex:1; padding:8px 6px; font-size:11px; background:${window.currentTransitSortType==='best' ? '#10b981' : 'var(--bg-input)'}; color:${window.currentTransitSortType==='best' ? 'white' : 'var(--text-muted)'}; border:1px solid ${window.currentTransitSortType==='best' ? '#10b981' : 'var(--border-panel)'}; border-radius:6px; font-weight:700; cursor:pointer; transition:all 0.2s;">⭐ 추천순</button>
        <button onclick="calcRoute('transit', 'time')" style="flex:1; padding:8px 6px; font-size:11px; background:${window.currentTransitSortType==='time' ? '#10b981' : 'var(--bg-input)'}; color:${window.currentTransitSortType==='time' ? 'white' : 'var(--text-muted)'}; border:1px solid ${window.currentTransitSortType==='time' ? '#10b981' : 'var(--border-panel)'}; border-radius:6px; font-weight:700; cursor:pointer; transition:all 0.2s;">⏱️ 최단시간</button>
        <button onclick="calcRoute('transit', 'transfer')" style="flex:1; padding:8px 6px; font-size:11px; background:${window.currentTransitSortType==='transfer' ? '#10b981' : 'var(--bg-input)'}; color:${window.currentTransitSortType==='transfer' ? 'white' : 'var(--text-muted)'}; border:1px solid ${window.currentTransitSortType==='transfer' ? '#10b981' : 'var(--border-panel)'}; border-radius:6px; font-weight:700; cursor:pointer; transition:all 0.2s;">🔄 최소환승</button>
    </div>`;

    var listHtml = '<div style="display:flex; flex-direction:column; gap:8px; max-height:220px; overflow-y:auto; padding-right:4px; margin-bottom:15px; border-bottom:1px solid var(--border-panel); padding-bottom:10px;">';
    
    sortedPaths.forEach((item) => {
        var p = item.path;
        var isSelected = (item.originalIndex === window.currentSelectedPathIndex);
        var busList = [];
        p.subPath.forEach(sub => {
            if (sub.trafficType === 2) {
                busList.push(sub.lane[0].busNo);
            }
        });
        var busNamesStr = busList.join(' → ') || '도보';
        
        var selectedBg = isSelected ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-panel)';
        var selectedBorder = isSelected ? '#10b981' : 'var(--border-panel)';
        
        listHtml += `
        <div onclick="selectTransitPath(${item.originalIndex})" style="padding:10px; border:2px solid ${selectedBorder}; background:${selectedBg}; border-radius:8px; cursor:pointer; transition:all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:between; align-items:center;">
                <span style="font-size:15px; font-weight:700; color:var(--text-main);"><span style="color:#10b981; font-size:18px;">${window.formatTime(p.info.totalTime)}</span></span>
                <span style="font-size:11px; color:var(--text-muted); margin-left:auto;">환승 ${item.transferCount}회 | 도보 ${p.info.totalWalk}m</span>
            </div>
            <div style="font-size:12px; color:var(--primary-color); font-weight:600; margin-top:4px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; display:flex; align-items:center;"><span class="bus-badge-glow">BUS</span> <span style="margin-left:4px;">${busNamesStr}</span></div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">요금: ${p.info.payment.toLocaleString()}원 | 거리: ${(p.info.totalDistance/1000).toFixed(1)}km</div>
        </div>`;
    });
    listHtml += '</div>';

    var detailHtml = '<div id="transit-detail-container" style="font-size:12px; color:var(--text-muted); padding:8px; text-align:center; background:var(--bg-input); border-radius:8px; border:1px solid var(--border-panel);">👉 옆의 <b>상세 경로 우측 패널</b>에서 정류장 목록 및 실시간 버스 시간을 체계적으로 확인할 수 있습니다!</div>';

    // ODsay 대신 대체 경로를 보여 줄 때는 그 사실을 맨 위에 적는다.
    var noteHtml = window.transitPathsNote
        ? '<div style="margin-bottom:8px; padding:6px 8px; border-radius:6px; font-size:11px; line-height:1.4; background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.4); color:var(--text-main);">ℹ️ ' + window.transitPathsNote + '</div>'
        : '';

    resultDiv.innerHTML = DOMPurify.sanitize(noteHtml + tabsHtml + listHtml + detailHtml, window.DOM_PURIFY_CONFIG);

    renderTransitDetail(window.currentSelectedPathIndex, showDetailPanel);
};

window.renderTransitDetail = function(index, showPanel) {
    window.currentSelectedPathIndex = index;
    var path = window.transitPaths[index];
    if (!path) return;

    var myRoutingRenderId = currentRoutingRenderId;

    currentRoutingPolylines.forEach(p => p.remove());
    currentRoutingPolylines = [];
    if (window.clearBusRoute) window.clearBusRoute();

    path.subPath.forEach(sub => {
        if (sub.trafficType === 1 || sub.trafficType === 2) {
            var color = (sub.trafficType === 2) ? '#10b981' : '#f97316';
            var stops = [];
            if (sub.passStopList && sub.passStopList.stations) {
                sub.passStopList.stations.forEach(st => {
                    stops.push({ lat: parseFloat(st.y), lng: parseFloat(st.x) });
                });
            }
            if (stops.length >= 2) {
                // TMAP 보행자 API로 실제 도로를 따라가는 경로 그리기 (청크 분할)
                drawTransitRoadSnap(stops, color, myRoutingRenderId);
            }
        }
    });

    // 도보 구간(trafficType 3)은 좌표가 없다. 앞뒤 구간의 정류장(처음·끝이면
    // 출발지·도착지) 사이를 보행 경로로 이어 점선으로 그린다. 그리지 않으면
    // 버스에서 내린 뒤 목적지까지 가는 길이 지도에 보이지 않는다.
    path.subPath.forEach((sub, subIdx) => {
        if (sub.trafficType !== 3 || !(sub.distance > 0)) return;
        var prev = path.subPath[subIdx - 1];
        var next = path.subPath[subIdx + 1];
        var from = prev ? { lat: parseFloat(prev.endY), lng: parseFloat(prev.endX) } : window.startCoord;
        var to = next ? { lat: parseFloat(next.startY), lng: parseFloat(next.startX) } : window.endCoord;
        if (!from || !to || ![from.lat, from.lng, to.lat, to.lng].every(Number.isFinite)) return;
        drawTransitWalk(from, to, myRoutingRenderId);
    });

    async function drawTransitWalk(from, to, renderId) {
        var walk = await fetchWalkLeg(from, to);
        if (renderId !== currentRoutingRenderId) return;
        drawPolyline(walk.line, '#475569', 'shortdash', 5);
    }

    // 대중교통 정류장 간 도로 스냅 함수
    async function drawTransitRoadSnap(stops, color, renderId) {
        for (var i = 0; i < stops.length - 1; i += 5) {
            if (renderId !== currentRoutingRenderId) break;
            var chunk = stops.slice(i, Math.min(i + 6, stops.length));
            if (chunk.length < 2) break;
            var start = chunk[0];
            var end = chunk[chunk.length - 1];
            var passList = chunk.slice(1, chunk.length - 1).map(s => s.lng + ',' + s.lat).join('_');
            
            try {
                var payload = {
                    startX: start.lng, startY: start.lat,
                    endX: end.lng, endY: end.lat,
                    reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO",
                    startName: encodeURIComponent("출발"), endName: encodeURIComponent("도착")
                };
                if (passList) payload.passList = passList;
                
                var data = await window.fetchTmapWithOSRMFallback(`${window.PROXY_URL}/tmap-routes?endpoint=pedestrian&version=1`, payload, 'walk');
                if (renderId !== currentRoutingRenderId) break;
                if (renderId !== currentRoutingRenderId) break;
                if (data.features) {
                    var linePath = [];
                    data.features.forEach(function(feature) {
                        if (feature.geometry.type === "LineString") {
                            feature.geometry.coordinates.forEach(function(coord) {
                                linePath.push([coord[1], coord[0]]);
                            });
                        }
                    });
                    if (linePath.length > 0) {
                        drawPolyline(linePath, color, 'solid', 7);
                    }
                }
            } catch (e) {
                if (renderId !== currentRoutingRenderId) break;
                // API 실패 시 직선 fallback
                var fallbackPath = chunk.map(s => [s.lat, s.lng]);
                drawPolyline(fallbackPath, color, 'solid', 7);
            }
            await new Promise(r => setTimeout(r, 200));
        }
    }

    // 1. 우측 옆의 상세 정보 팝업 패널 생성 및 노출 제어
    var detailPanel = document.getElementById('transit-detail-panel');
    if (!detailPanel) {
        detailPanel = document.createElement('div');
        detailPanel.id = 'transit-detail-panel';
        detailPanel.className = 'glass-panel panel-hidden';
        detailPanel.style.opacity = '0';
        if (window.innerWidth > 768) {
            detailPanel.style.transform = 'translateX(-10px)';
        } else {
            detailPanel.style.transform = 'translateY(110%)';
        }
        document.body.appendChild(detailPanel);
    }

    // 슬라이드 인 애니메이션 효과 적용
    if (window._closeTransitPanelTimeout) {
        clearTimeout(window._closeTransitPanelTimeout);
        window._closeTransitPanelTimeout = null;
    }
    
    if (showPanel) {
        detailPanel.style.display = 'block';
        detailPanel.classList.remove('panel-hidden');
        detailPanel.classList.add('panel-expanded');
        setTimeout(() => {
            detailPanel.style.opacity = '1';
            if (window.innerWidth > 768) {
                detailPanel.style.transform = 'translateX(0)';
            } else {
                detailPanel.style.transform = 'translateY(0)';
            }
        }, 10);
    } else {
        // 닫혀있는 상태 유지 및 숨김 처리 (조기 종료하여 백그라운드 리렌더링 및 ETA 중복 실행 방지)
        detailPanel.classList.remove('panel-expanded', 'panel-collapsed');
        detailPanel.classList.add('panel-hidden');
        detailPanel.style.opacity = '0';
        if (window.innerWidth > 768) {
            detailPanel.style.transform = 'translateX(-10px)';
        } else {
            detailPanel.style.transform = 'translateY(110%)';
        }
        window._closeTransitPanelTimeout = setTimeout(() => {
            detailPanel.style.display = 'none';
            window._closeTransitPanelTimeout = null;
        }, 300);
        return;
    }

    // 경로 상세 요약 데이터 계산
    var totalTime = path.info.totalTime;
    var totalWalk = path.info.totalWalk;
    var walkTime = path.subPath
        .filter(s => s.trafficType === 3)
        .reduce((sum, s) => sum + s.sectionTime, 0);
    
    if (walkTime === 0 && totalWalk > 0) {
        walkTime = Math.ceil(totalWalk / 70);
    }

    var payment = path.info.payment;
    var distance = (path.info.totalDistance / 1000).toFixed(1);
    var transferCount = Math.max(0, path.info.busTransitCount + path.info.subwayTransitCount - 1);

    // 다비(Daum)/네이버 지도 느낌의 구조적인 헤더
    var headerHtml = `
    <div class="detail-sheet-handle" data-panel-id="transit-detail-panel" onclick="window.toggleDetailPanel('transit-detail-panel')">
        <div class="detail-sheet-bar"></div>
    </div>
    <div style="position:relative; margin-bottom:15px; font-family:'Noto Sans KR',sans-serif;">
        <button onclick="window.closeTransitDetailPanel()" style="position:absolute; top:-5px; right:-5px; background:none; border:none; font-size:22px; cursor:pointer; color:#94a3b8; font-weight:700; transition:color 0.2s;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#94a3b8'">&times;</button>
        <h3 style="margin:0 0 10px 0; font-size:16px; color:var(--text-main); font-weight:700;">🗺️ 대중교통 상세 안내</h3>
        <div style="display:flex; flex-direction:column; gap:6px; font-size:12px; background:var(--bg-input); border:1px solid var(--border-panel); padding:10px; border-radius:8px; color:var(--text-main); font-weight:500;">
            <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">🟢 <b>출발:</b> ${startCoord.addr}</div>
            <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">🔴 <b>도착:</b> ${endCoord.addr}</div>
        </div>
    </div>`;

    var summaryHtml = `
    <div style="background: linear-gradient(135deg, #10b981, #059669); color:white; border-radius:10px; padding:14px; margin-bottom:15px; font-family:'Noto Sans KR',sans-serif; box-shadow:0 4px 6px rgba(0,0,0,0.05); line-height:1.4;">
        <div style="display:flex; justify-content:space-between; align-items:flex-end;">
            <span style="font-size:28px; font-weight:800;">${window.formatTime(totalTime)}<span style="font-size:15px; font-weight:600;"> 소요</span></span>
            <span style="font-size:12px; background:rgba(255,255,255,0.2); padding:2px 8px; border-radius:12px;">환승 ${transferCount}회</span>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:11px; margin-top:10px; border-top:1px solid rgba(255,255,255,0.2); padding-top:8px; opacity:0.9;">
            <div>🚶 도보: <b>${window.formatTime(walkTime)} (${totalWalk}m)</b></div>
            <div>📏 거리: <b>${distance}km</b></div>
            <div>💵 요금: <b>${payment.toLocaleString()}원</b></div>
        </div>
    </div>`;

    // 실시간 대중교통 ETA 브리핑 카드
    var briefingCardHtml = `
    <div id="main-eta-briefing" style="background:rgba(249, 115, 22, 0.1); border:1px solid rgba(249, 115, 22, 0.2); border-radius:10px; padding:12px; margin-bottom:15px; font-family:'Noto Sans KR',sans-serif; box-shadow: 0 2px 4px rgba(0,0,0,0.02); color:var(--text-main);">
        <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:16px;">⏱️</span>
            <div style="font-size:12px; color:var(--text-muted);">
                실시간 버스 도착 정보를 수집하고 있습니다...
            </div>
        </div>
    </div>`;

    var timelineHtml = '<div style="border-left:3px solid var(--border-panel); padding-left:18px; display:flex; flex-direction:column; gap:16px; margin-left:8px; font-family:\'Noto Sans KR\',sans-serif;">';
    
    var busEtaCounter = 0;

    path.subPath.forEach((sub, subIdx) => {
        if (sub.trafficType === 3) {
            // 도보
            timelineHtml += `
            <div style="position:relative; background:var(--bg-input); padding:10px; border-radius:8px; border:1px solid var(--border-panel); margin-top:2px;">
                <div style="position:absolute; left:-25px; top:12px; width:10px; height:10px; background:#94a3b8; border-radius:50%; border:2px solid var(--bg-panel); box-shadow:0 0 0 2px var(--border-panel);"></div>
                <div style="font-size:12px; font-weight:700; color:var(--text-main);">🚶 도보 이동 ${window.formatTime(sub.sectionTime)}</div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">도보 약 <b>${sub.distance}m</b> 이동</div>
            </div>`;
        } else if (sub.trafficType === 2) {
            // 버스
            var busNo = sub.lane && sub.lane.length > 0 ? sub.lane[0].busNo : "버스";
            var etaSpanId = `eta-span-${index}-${subIdx}`;
            busEtaCounter++;
            var etaBadgeHtml = `<span id="${etaSpanId}" style="color:#f97316; font-size:11px; font-weight:700; margin-left:6px;">[실시간 조회 중...]</span>`;
            
            // 처음 타는 버스만 상단 브리핑 카드를 채운다 (출발지에서 걸어가는 시간 포함)
            var briefing = null;
            if (busEtaCounter === 1) {
                var firstWalk = path.subPath.slice(0, subIdx).filter(s => s.trafficType === 3)
                    .reduce((sum, s) => sum + (s.sectionTime || 0), 0);
                briefing = { walkMinutes: firstWalk };
            }
            setTimeout(function() {
                window.fetchETAForStop(sub.startName, parseFloat(sub.startY), parseFloat(sub.startX),
                                       busNo, etaSpanId, briefing, sub);
            }, 150 * busEtaCounter);

            // 정류장 목록 HTML 구성 (클릭 없이 항상 펼침)
            var stationListHtml = "";
            if (sub.passStopList && sub.passStopList.stations) {
                var stationsArr = sub.passStopList.stations;
                var stationsInline = stationsArr.map(function(s, si) {
                    return `<div style="padding:2px 0; color:var(--text-muted); font-size:11px;">${si === 0 ? '🔵' : si === stationsArr.length - 1 ? '🟢' : ' ∘'} ${s.stationName}</div>`;
                }).join('');
                stationListHtml = `
                <div style="margin-top:6px; margin-bottom:6px; font-size:11px; color:var(--text-main); background:var(--bg-input); border:1px solid var(--border-panel); border-radius:6px; padding:8px; line-height:1.5;">
                    ${stationsInline}
                </div>`;
            }

            timelineHtml += `
            <div style="position:relative;">
                <div style="position:absolute; left:-26px; top:2px; width:12px; height:12px; background:#10b981; border-radius:50%; border:2px solid var(--bg-panel); box-shadow:0 0 0 2px #10b981;"></div>
                <div style="font-size:13px; font-weight:700; color:#059669; display:flex; align-items:center;">
                    <span class="bus-badge-glow">BUS</span> <span style="margin-left:4px;">${busNo}번 버스 탑승</span>${etaBadgeHtml}
                </div>
                <div style="font-size:12px; color:var(--text-main); margin-top:4px; font-weight:600;">🔵 ${sub.startName} <span style="font-weight:400; color:var(--text-muted); font-size:11px;">승차</span></div>
                
                ${stationListHtml}
                
                <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">이동 시간: <b>${window.formatTime(sub.sectionTime)}</b> (${sub.stationCount}개 정류소)</div>
                <div style="font-size:12px; color:var(--text-main); margin-top:4px; font-weight:600;">🟢 ${sub.endName} <span style="font-weight:400; color:var(--text-muted); font-size:11px;">하차</span></div>
            </div>`;
        } else if (sub.trafficType === 1) {
            // 지하철 / 열차
            var lineName = sub.lane && sub.lane.length > 0 ? sub.lane[0].name : "지하철";
            
            var stationListHtml = "";
            if (sub.passStopList && sub.passStopList.stations) {
                var stationsArr = sub.passStopList.stations;
                var stationsInline = stationsArr.map(function(s, si) {
                    return `<div style="padding:2px 0; color:var(--text-muted); font-size:11px;">${si === 0 ? '🔵' : si === stationsArr.length - 1 ? '🟢' : ' ∘'} ${s.stationName}</div>`;
                }).join('');
                stationListHtml = `
                <div style="margin-top:6px; margin-bottom:6px; font-size:11px; color:var(--text-main); background:var(--bg-input); border:1px solid var(--border-panel); border-radius:6px; padding:8px; line-height:1.5;">
                    ${stationsInline}
                </div>`;
            }

            timelineHtml += `
            <div style="position:relative;">
                <div style="position:absolute; left:-26px; top:2px; width:12px; height:12px; background:#f97316; border-radius:50%; border:2px solid var(--bg-panel); box-shadow:0 0 0 2px #f97316;"></div>
                <div style="font-size:13px; font-weight:700; color:#ea580c; display:flex; align-items:center;">
                    <span style="display:inline-flex; align-items:center; justify-content:center; background:#ea580c; color:white; font-size:10px; font-weight:800; padding:2px 6px; border-radius:6px; margin-right:4px; box-shadow:0 2px 5px rgba(234,88,12,0.3); border:1px solid rgba(255,255,255,0.2); line-height:1;">SUB</span> <span style="margin-left:4px;">${lineName} 탑승</span>
                </div>
                <div style="font-size:12px; color:var(--text-main); margin-top:4px; font-weight:600;">🔵 ${sub.startName} <span style="font-weight:400; color:var(--text-muted); font-size:11px;">승차</span></div>
                
                ${stationListHtml}
                
                <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">이동 시간: <b>${window.formatTime(sub.sectionTime)}</b> (${sub.stationCount}개 역)</div>
                <div style="font-size:12px; color:var(--text-main); margin-top:4px; font-weight:600;">🟢 ${sub.endName} <span style="font-weight:400; color:var(--text-muted); font-size:11px;">하차</span></div>
            </div>`;
        }
    });
    
    timelineHtml += `
        <div style="position:relative; margin-top:4px;">
            <div style="position:absolute; left:-26px; top:2px; width:12px; height:12px; background:#ef4444; border-radius:50%; border:2px solid var(--bg-panel); box-shadow:0 0 0 2px #ef4444;"></div>
            <b style="font-size:13px; color:#ef4444;">🏁 목적지 도착</b>
        </div>
    </div>`;

    detailPanel.innerHTML = DOMPurify.sanitize(headerHtml + summaryHtml + briefingCardHtml + timelineHtml, window.DOM_PURIFY_CONFIG);
};

window.selectTransitPath = function(index) {
    window.currentSelectedPathIndex = index;
    currentRoutingRenderId++; // Increment to invalidate previous drawing loops
    renderTransitRouteList(window.transitPaths, window.currentTransitSortType, true);
};

// 유틸리티
function drawGRouteAiPath(coords, mode, profile) {
    if (!Array.isArray(coords) || coords.length === 0) return;
    
    var validPath = coords.filter(p => Array.isArray(p) && p.length >= 2 && p[0] != null && !isNaN(p[0]) && p[1] != null && !isNaN(p[1]));
    if (validPath.length === 0) return;
    
    // 모드/프로파일별 네온 아우라 및 주 경로선 색상 동적 결정
    var mainColor = '#3b82f6';
    var glowColor = '#93c5fd';
    
    if (mode === 'walk') {
        mainColor = '#f97316'; // 주황색
        glowColor = '#fed7aa';
    } else if (mode === 'bike' || mode === 'shared') {
        mainColor = '#8b5cf6'; // 보라색
        glowColor = '#d8b4fe';
    } else if (mode === 'car') {
        if (profile === 'safe') {
            mainColor = '#10b981'; // 초록색 (안전)
            glowColor = '#a7f3d0';
        } else if (profile === 'main_road') {
            mainColor = '#1d4ed8'; // 남색 (대로중심)
            glowColor = '#93c5fd';
        } else {
            mainColor = '#3b82f6'; // 파란색 (빠른길)
            glowColor = '#93c5fd';
        }
    }

    // 1. 넓은 네온 아우라 글로우 라인 (12px)
    var glowPoly = L.polyline(validPath, {
        color: glowColor,
        weight: 12,
        opacity: 0.4,
        interactive: false
    }).addTo(window.map);
    currentRoutingPolylines.push(glowPoly);

    // 2. 메인 네온 라인 (7px)
    var mainPoly = L.polyline(validPath, {
        color: mainColor,
        weight: 7,
        opacity: 0.95,
        dashArray: '10, 10'
    }).addTo(window.map);
    currentRoutingPolylines.push(mainPoly);
    
    // 3. 선 내부를 관통하는 밝은 화이트 광선 핵심 라인 (3px, 대쉬 애니메이션)
    var corePoly = L.polyline(validPath, {
        color: '#ffffff',
        weight: 3,
        opacity: 1,
        dashArray: '6, 12'
    }).addTo(window.map);
    currentRoutingPolylines.push(corePoly);
    
    // SVG Path DOM 획득 후 CSS 클래스 바인딩 (흐르는 애니메이션 가동)
    if (corePoly._path) {
        corePoly._path.classList.add('groute-glow-path');
    }
    if (mainPoly._path) {
        mainPoly._path.classList.add('groute-glow-main');
    }
    
    // 최적 줌 카메라 바운드 이동
    var bounds = L.latLngBounds(validPath);
    window.map.fitBounds(bounds, { padding: [50, 50] });
}

function drawTmapFeatures(features, color, style) {
    features.forEach(function(feature) {
        if (feature.geometry.type === "LineString") {
            var linePath = [];
            feature.geometry.coordinates.forEach(function(coord) {
                linePath.push([coord[1], coord[0]]);
            });
            var segColor = color;
            // TMAP 교통 혼잡도 데이터 처리 (0:정보없음, 1:원활, 2:서행, 3:지체, 4:정체)
            if (feature.properties && feature.properties.congestion !== undefined) {
                switch(feature.properties.congestion) {
                    case 1: segColor = '#22c55e'; break; // 원활 (녹색)
                    case 2: segColor = '#eab308'; break; // 서행 (노란색)
                    case 3: segColor = '#f97316'; break; // 지체 (주황색)
                    case 4: segColor = '#ef4444'; break; // 정체 (빨간색)
                }
            }
            drawPolyline(linePath, segColor, style, 6);
        }
    });
}

function drawPolyline(path, color, style, weight) {
    if (!Array.isArray(path) || path.length === 0) return;
    
    // 유효한 좌표만 필터링 (NaN, undefined, null 등 제외)
    var validPath = path.filter(p => Array.isArray(p) && p.length >= 2 && p[0] != null && !isNaN(p[0]) && p[1] != null && !isNaN(p[1]));
    if (validPath.length === 0) return;
    
    var dashArray = (style === 'shortdash') ? '6, 6' : null;
    var w = weight || 6;
    
    // 1. 은은한 백그라운드 글로우/섀도우 라인 그리기 (더 굵고 투명도 낮게)
    var glowPoly = L.polyline(validPath, {
        color: color,
        weight: w + 5,
        opacity: 0.25,
        dashArray: dashArray,
        interactive: false // 마우스 이벤트는 메인 폴리라인에서 전담 처리
    }).addTo(window.map);
    currentRoutingPolylines.push(glowPoly);

    // 2. 선명한 메인 라인 그리기
    var mainPoly = L.polyline(validPath, {
        color: color,
        weight: w,
        opacity: 0.9,
        dashArray: dashArray
    }).addTo(window.map);
    currentRoutingPolylines.push(mainPoly);
    
    // 3. 프리미엄 마이크로 인터랙션 (마우스 호버 시 쫀득하게 확장되고 빛나는 모션)
    mainPoly.on('mouseover', function(e) {
        mainPoly.setStyle({ weight: w + 3, opacity: 1.0 });
        glowPoly.setStyle({ weight: w + 9, opacity: 0.4 });
    });
    mainPoly.on('mouseout', function(e) {
        mainPoly.setStyle({ weight: w, opacity: 0.9 });
        glowPoly.setStyle({ weight: w + 5, opacity: 0.25 });
    });
}

function parseLinestring(linestring) {
    var path = [];
    var pts = linestring.split(" ");
    pts.forEach(p => {
        var coords = p.split(",");
        if (coords.length === 2) {
            path.push([parseFloat(coords[1]), parseFloat(coords[0])]);
        }
    });
    return path;
}

// [신규 기능] 길찾기 경로 및 출발/도착 설정 완전히 지우기
window.clearRouting = function() {
    startCoord = null;
    endCoord = null;
    currentRoutingRenderId++; // Increment to cancel any active routing loops!
    if (startMarker) {
        startMarker.remove();
        startMarker = null;
    }
    if (endMarker) {
        endMarker.remove();
        endMarker = null;
    }
    // 경유지 초기화
    if (window.clearWaypoint) window.clearWaypoint();
    window.transitPaths = null;
    window.lastWayKey = '';
    
    currentRoutingPolylines.forEach(p => p.remove());
    currentRoutingPolylines = [];
    
    document.getElementById('start-addr').textContent = "출발지를 선택하세요";
    document.getElementById('end-addr').textContent = "도착지를 선택하세요";
    document.getElementById('mode-selectors').style.display = 'none';
    
    var resultDiv = document.getElementById('route-result');
    if (resultDiv) {
        resultDiv.style.display = 'none';
        resultDiv.innerHTML = '';
    }
    
    var detailPanel = document.getElementById('transit-detail-panel');
    if (detailPanel) {
        detailPanel.style.opacity = '0';
        if (window.innerWidth > 768) {
            detailPanel.style.transform = 'translateX(-10px)';
        } else {
            detailPanel.style.transform = 'translateY(110%)';
        }
        setTimeout(() => {
            detailPanel.style.display = 'none';
            detailPanel.innerHTML = '';
        }, 300);
    }
    
    // 자동차/도보/자전거 경로 상세 패널 닫기
    if (window.closeRouteDetailPanel) window.closeRouteDetailPanel();
    // 버스 노선 상세 패널 닫기
    if (window.closeBusRoutePanel) window.closeBusRoutePanel();
    
    routeState = 'IDLE';
};
