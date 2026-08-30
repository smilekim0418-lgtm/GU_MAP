// ============================================================
// 📁 파일명: js/map/map-init.js
// 📌 역할: Leaflet 지도 엔진 초기화 및 타일 레이어 설정
// ============================================================
//
// [파일 설명]
//   웹 페이지 로드 시 Leaflet.js 기반 인터랙티브 지도를 생성하고
//   초기 타일 레이어(VWorld 일반/위성 지도)를 설정합니다.
//   - window.map: 전역 Leaflet 지도 인스턴스
//   - window.infoWindow: 전역 팝업(정보창) 인스턴스
//   - 정류장 마커 배열(stationMarkers) 초기화
//   - 지도 줌/이동 이벤트에 따른 정류장 마커 동적 표시/숨김
//   - VWorld 일반지도/위성지도 전환 컨트롤 등록
//
// [의존 관계]
//   - config.js → 지도 중심 좌표, 줌 레벨, VWorld API 키 참조
//   - store.js → 지도 상태를 AppState에 동기화
//   - map-click.js → 지도 클릭 이벤트 핸들러 등록 호출
//   - map-layers.js → CCTV, 교통사고, PM 레이어 초기화 호출
//
// [사용된 외부 라이브러리]
//   - Leaflet.js (오픈소스 지도 렌더링 엔진)
//   - Leaflet.markercluster (마커 클러스터링 플러그인)
// ============================================================

window.map = null;
window.infoWindow = null;
window.stationMarkers = [];
window._mapLayers = {};
window.startCoord = null;
window.endCoord = null;
window.startMarker = null;
window.endMarker = null;

window.onload = function() {
    var errorMsgDiv = document.getElementById('error-msg');

    if (typeof L === 'undefined') {
        if (errorMsgDiv) {
            errorMsgDiv.style.color = "red";
            errorMsgDiv.innerHTML = "🚨 지도 라이브러리(Leaflet) 로드 실패. 네트워크 상태를 확인해주세요.";
        }
        return;
    }

    if (errorMsgDiv) {
        errorMsgDiv.style.color = "#2563eb";
        errorMsgDiv.innerHTML = "✅ VWorld 공공 위성지도 접속 완료! 지도를 클릭해 보세요.";
    }

    var vworldKey = window.VWORLD_KEY || (window.AppConfig && window.AppConfig.VWORLD_KEY) || '';

    // 0. 오픈스트리트맵 레이어 정의 (CartoDB Positron No Labels)
    var osmLayer = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/white/{z}/{y}/{x}.png', {
        maxZoom: 22, maxNativeZoom: 19,
        minZoom: 6,
        updateWhenIdle: true,
        keepBuffer: 1,
        attribution: '© CartoDB Positron'
    });

    // 1. 일반지도 레이어 정의 (CartoDB Voyager No Labels)
    var baseLayer = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/white/{z}/{y}/{x}.png', {
        maxZoom: 22, maxNativeZoom: 19,
        minZoom: 6,
        updateWhenIdle: true,
        keepBuffer: 1,
        attribution: '© CartoDB Voyager'
    });

    // 2. 위성지도 레이어 정의 (VWorld)
    var satelliteLayer = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/Satellite/{z}/{y}/{x}.jpeg', {
        maxZoom: 22, maxNativeZoom: 19,
        minZoom: 6,
        detectRetina: true,
        updateWhenIdle: true,
        keepBuffer: 1,
        attribution: '© VWorld Satellite'
    });

    // 고화질 글로벌 위성지도 (Esri World Imagery)
    var esriSatelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 22, maxNativeZoom: 19,
        minZoom: 6,
        detectRetina: true,
        updateWhenIdle: true,
        keepBuffer: 1,
        attribution: '© Esri World Imagery'
    });

    // 3. 하이브리드 레이어 정의 (어노테이션)
    var hybridLayer = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/Hybrid/{z}/{y}/{x}.png', {
        maxZoom: 22, maxNativeZoom: 19,
        minZoom: 6,
        attribution: '© VWorld Hybrid'
    });

    // 4. 다크모드 레이어 정의 (CartoDB DarkMatter No Labels)
    var darkLayer = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/midnight/{z}/{y}/{x}.png', {
        maxZoom: 22, maxNativeZoom: 19,
        minZoom: 6,
        updateWhenIdle: true,
        keepBuffer: 1,
        attribution: '© CartoDB DarkMatter'
    });

    // 5. 연구지도용 그레이스케일 레이어 정의 (CartoDB Positron No Labels)
    var lightGrayLayer = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/white/{z}/{y}/{x}.png', {
        maxZoom: 22, maxNativeZoom: 19,
        minZoom: 6,
        updateWhenIdle: true,
        keepBuffer: 1,
        attribution: '© CartoDB Positron'
    });

    // VWorld 타일 에러 감지 시 오픈스트리트맵(OSM) 자동 폴백 메커니즘
    satelliteLayer.on('tileerror', function() {
        console.warn("VWorld Satellite 타일 로드 실패! CartoDB Positron으로 자동 안전 전환합니다.");
        if (window.map && window.map.hasLayer(satelliteLayer)) {
            window.map.removeLayer(satelliteLayer);
            osmLayer.addTo(window.map);
        }
    });

    baseLayer.on('tileerror', function() {
        console.warn("CartoDB Voyager 타일 로드 실패! CartoDB Positron으로 자동 안전 전환합니다.");
        if (window.map && window.map.hasLayer(baseLayer)) {
            window.map.removeLayer(baseLayer);
            osmLayer.addTo(window.map);
        }
    });

    // 레이어들을 window에 노출
    window._mapLayers = { osmLayer: osmLayer, baseLayer: baseLayer, satelliteLayer: satelliteLayer, hybridLayer: hybridLayer, darkLayer: darkLayer, lightGrayLayer: lightGrayLayer, esriSatelliteLayer: esriSatelliteLayer };

    // 테마 설정 복원 및 첫 화면 맵 레이어 결정
    var isDarkThemeDefault = document.body.classList.contains('dark-theme') || localStorage.getItem('gumap_dark_theme') === 'true';
    var activeBaseLayer = baseLayer;
    var activeOverlays = [hybridLayer];

    if (isDarkThemeDefault) {
        document.body.classList.add('dark-theme');
        var toggle = document.getElementById('dark-mode-toggle');
        if (toggle) { toggle.textContent = '☀️'; toggle.title = '라이트모드 전환'; }
        activeBaseLayer = darkLayer;
    } else {
        document.body.classList.remove('dark-theme');
        var toggle = document.getElementById('dark-mode-toggle');
        if (toggle) { toggle.textContent = '🌙'; toggle.title = '다크모드 전환'; }
        activeBaseLayer = baseLayer;
    }

    window._lastActiveBaseLayer = baseLayer;

    // 지도 객체 생성 및 기본 레이어 적재
    window.map = L.map('map', {
        center: [DEFAULT_LAT, DEFAULT_LNG], 
        zoom: DEFAULT_ZOOM,
        maxZoom: 22,
        layers: [activeBaseLayer].concat(activeOverlays),
        zoomControl: false
    });
    
    // 줌 컨트롤을 우측 하단으로 이동 (좌측 패널 UI와 겹침 방지)
    L.control.zoom({ position: 'bottomright' }).addTo(window.map);
    
    // 대경선 렌더링 호출
    if (typeof window.drawDaegyeongLine === 'function') {
        window.drawDaegyeongLine();
    }

    // 실시간 교통 혼잡도 레이어 (ITS WMTS)
    window.trafficLayer = L.tileLayer('https://its.go.kr:9443/geoserver/gwc/service/wmts/rest/ntic:N_LEVEL_11/ntic:REALTIME/EPSG:3857/EPSG:3857:{z}/{y}/{x}?format=image/png8', {
        maxZoom: 22, maxNativeZoom: 19, minZoom: 6, opacity: 0.8, attribution: '© ITS 실시간 교통정보'
    });

    // 마커 레이어 그룹 사전 정의
    window.cctvLayerGroup = L.layerGroup();
    window.eventLayerGroup = L.layerGroup();
    window.sharedPmLayerGroup = L.layerGroup();

    // WMS 레이어 사전 정의
    window.wmsTrafficAccident = L.tileLayer.wms('https://api.vworld.kr/req/wms', { layers: 'lt_c_lhspotsid', format: 'image/png', transparent: true, key: vworldKey, domain: window.location.hostname || "localhost" });
    window.wmsPedestrianHazard = L.tileLayer.wms('https://api.vworld.kr/req/wms', { layers: 'lt_c_lhspothd', format: 'image/png', transparent: true, key: vworldKey, domain: window.location.hostname || "localhost" });
    window.wmsSafetyInfo = L.tileLayer.wms('https://api.vworld.kr/req/wms', { layers: 'lt_c_aislrminf', format: 'image/png', transparent: true, key: vworldKey, domain: window.location.hostname || "localhost" });

    var baseMaps = {
        "🗺️ 일반지도 (CartoDB Voyager)": baseLayer,
        "🛰️ 위성지도 (VWorld)": satelliteLayer,
        "🌍 고화질 위성 (Esri)": esriSatelliteLayer,
        "📊 연구지도 (MaaS)": lightGrayLayer
    };

    var overlayMaps = {
        "🏷️ 건물/도로명칭": hybridLayer,
        "🚦 실시간 교통망 정보": window.trafficLayer,
        "📹 실시간 CCTV": window.cctvLayerGroup,
        "🚧 실시간 도로 통제/공사": window.eventLayerGroup,
        "🛴 공유 킥보드/자전거": window.sharedPmLayerGroup,
        "⚠️ 교통사고 다발지역 (WMS)": window.wmsTrafficAccident,
        "🚶 보행자사고 다발지역 (WMS)": window.wmsPedestrianHazard,
        "🚨 생활밀착 치안/안전정보 (WMS)": window.wmsSafetyInfo
    };

    L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(window.map);

    // 레이어 컨트롤에서 토글 시 마커 데이터 패치 동기화
    window.map.on('overlayadd', function(e) {
        if (e.name === "🚦 실시간 교통망 정보") { var cb = document.getElementById('layer-traffic'); if (cb) cb.checked = true; }
        if (e.name === "📹 실시간 CCTV") { window.isCctvLayerOn = true; if(window.fetchAndRenderCctv) window.fetchAndRenderCctv(); }
        if (e.name === "🚧 실시간 도로 통제/공사") { window.isEventLayerOn = true; if(window.fetchAndRenderEvent) window.fetchAndRenderEvent(); }
        if (e.name === "🛴 공유 킥보드/자전거") { window.isSharedPmLayerOn = true; if(window.fetchAndRenderSharedPm) window.fetchAndRenderSharedPm(); }
    });
    window.map.on('overlayremove', function(e) {
        if (e.name === "🚦 실시간 교통망 정보") { var cb = document.getElementById('layer-traffic'); if (cb) cb.checked = false; }
        if (e.name === "📹 실시간 CCTV") { window.isCctvLayerOn = false; window.toggleCctvLayer ? window.toggleCctvLayer(false) : window.cctvLayerGroup.clearLayers(); }
        if (e.name === "🚧 실시간 도로 통제/공사") { window.isEventLayerOn = false; window.eventLayerGroup.clearLayers(); }
        if (e.name === "🛴 공유 킥보드/자전거") { window.isSharedPmLayerOn = false; window.sharedPmLayerGroup.clearLayers(); }
    });

    // 지도 드래그/줌 종료 시 실시간 CCTV 및 돌발정보 갱신 단일 리스너 바인딩 (중복 등록 방지)
    window.map.on('moveend', function() {
        var layerCctv = document.getElementById('layer-its-cctv');
        if (layerCctv && layerCctv.checked) {
            if (window.fetchAndRenderCctv) window.fetchAndRenderCctv();
        }
        var layerEvent = document.getElementById('layer-its-event');
        if (layerEvent && layerEvent.checked) {
            if (window.fetchAndRenderEvent) window.fetchAndRenderEvent();
        }
    });

    // 레이어 전환 시 다크모드 및 연구레이어 토글
    window.map.on('baselayerchange', function(e) {
        if (e.name === '📊 연구지도 (MaaS)') {
            if (typeof window.switchMapMode === 'function') {
                window.switchMapMode('research');
            } else if (typeof showResearchMapLayers === 'function') {
                showResearchMapLayers();
            }
        } else {
            if (typeof window.switchMapMode === 'function') {
                window.switchMapMode('general');
            } else if (typeof hideResearchMapLayers === 'function') {
                hideResearchMapLayers();
            }
        }

        if (e.layer !== darkLayer) {
            window._lastActiveBaseLayer = e.layer;
        }
    });

    // Leaflet Popup 객체 초기화
    window.infoWindow = L.popup();

    // 정류장 로드 및 클릭 이벤트 바인딩
    if (typeof bus_stations !== 'undefined') {
        for (let i = 0; i < bus_stations.length; i++) {
            let s = bus_stations[i];
            if (s.lat && s.lng) {
                let content = `<div class="bus-stop-glow-marker" title="${s.name} (클릭 시 도착 정보)"><div class="bus-stop-glow-marker-inner"></div></div>`;
                let icon = L.divIcon({
                    html: content,
                    className: 'station-marker-icon',
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                });
                let marker = L.marker([s.lat, s.lng], { icon: icon });

                marker.on('click', function() {
                    if (typeof openStopInfo === 'function') {
                        openStopInfo(s.name, s.lat, s.lng);
                    }
                });

                window.stationMarkers.push(marker);
            }
        }
    }

    // 정류장 마커는 **보이는 범위만** 지도에 올린다.
    //
    // 예전에는 zoom 16 이상이면 구미시 전역 2,178개를 전부 지도에 올렸다.
    // 건물 하나를 보는 zoom 19 에서도 2,178개가 그대로 DOM 에 남아, 화면에
    // 하나도 안 보이면서 매 프레임 레이아웃·페인트 비용을 만들었다
    // (측정: 지도 이동 중 30fps, 화면 밖 마커를 걷어내면 60fps).
    // zoomend 마다 2,178개를 전부 addTo/remove 하던 것도 같은 이유로 없앴다.
    window.MIN_STATION_ZOOM = 16;

    window.syncStationMarkers = function () {
        if (!window.map || !window.stationMarkers.length) return;

        const visible = window.map.getZoom() >= window.MIN_STATION_ZOOM;
        // 가장자리에서 마커가 늦게 뜨는 느낌을 막으려고 화면보다 조금 넓게 잡는다.
        const bounds = visible ? window.map.getBounds().pad(0.25) : null;

        let shown = 0;
        window.stationMarkers.forEach(marker => {
            const want = visible && bounds.contains(marker.getLatLng());
            if (want === !!marker._gumapOnMap) {
                if (want) shown++;
                return;                    // 상태가 그대로면 DOM 을 건드리지 않는다
            }
            if (want) {
                marker.addTo(window.map);
                shown++;
            } else {
                marker.remove();
            }
            marker._gumapOnMap = want;
        });
        return shown;
    };

    window.map.on('moveend zoomend', window.syncStationMarkers);
    window.syncStationMarkers();

    // 즐겨찾기 초기 렌더링
    if (typeof window.renderFavorites === 'function') {
        window.renderFavorites();
    }

    // 외부 모듈 클릭/컨텍스트메뉴 이벤트 바인딩 호출
    if (typeof window.initMapClickEvents === 'function') {
        window.initMapClickEvents();
    }

    // [신규] 금오공과대학교 테크노관 지하 1층 (B1F) 실내지도 모듈 초기화
    if (typeof window.initTechnoBuildingB1Map === 'function') {
        window.initTechnoBuildingB1Map();
    }

    // [신규] 실외 도보 및 다층 보행로 커스텀 샌드박스 모듈 초기화
    if (typeof window.initOutdoorWalkwayModule === 'function') {
        window.initOutdoorWalkwayModule();
    }
};
