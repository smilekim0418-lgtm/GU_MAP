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
        errorMsgDiv.innerHTML = "✅ VWorld(국토지리) 공공 위성지도 접속 완료! 지도를 클릭해 보세요.";
    }

    var vworldKey = window.VWORLD_KEY || (window.AppConfig && window.AppConfig.VWORLD_KEY) || '';

    // [사용자 요구사항] VWorld 백지도/표준지도, Carto 지도 등 구형 래스터 베이스 타일 완전 제거!
    // 오직 고화질 위성지도 레이어만 유지 (위성 모드 전용)
    var satelliteLayer = L.tileLayer(vworldKey ? 'https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/Satellite/{z}/{y}/{x}.jpeg' : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 22, maxNativeZoom: 19,
        minZoom: 6,
        detectRetina: true,
        updateWhenIdle: true,
        keepBuffer: 1,
        attribution: '© VWorld Satellite'
    });

    var esriSatelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 22, maxNativeZoom: 19,
        minZoom: 6,
        detectRetina: true,
        updateWhenIdle: true,
        keepBuffer: 1,
        attribution: '© Esri World Imagery'
    });

    var hybridLayer = L.tileLayer(vworldKey ? 'https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/Hybrid/{z}/{y}/{x}.png' : '', {
        maxZoom: 22, maxNativeZoom: 19,
        minZoom: 6,
        attribution: '© VWorld Hybrid'
    });

    // 레이어 노출
    window._mapLayers = { satelliteLayer: satelliteLayer, hybridLayer: hybridLayer, esriSatelliteLayer: esriSatelliteLayer };

    // 테마 설정 복원
    var isDarkThemeDefault = document.body.classList.contains('dark-theme') || localStorage.getItem('gumap_dark_theme') === 'true';
    if (isDarkThemeDefault) {
        document.body.classList.add('dark-theme');
        var toggle = document.getElementById('dark-mode-toggle');
        if (toggle) {
            toggle.innerHTML = '<svg class="dock-icon-svg icon-sun" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
            toggle.title = '라이트모드 전환';
        }
    } else {
        document.body.classList.remove('dark-theme');
        var toggle = document.getElementById('dark-mode-toggle');
        if (toggle) {
            toggle.innerHTML = '<svg class="dock-icon-svg icon-moon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
            toggle.title = '다크모드 전환';
        }
    }

    var activeOverlays = [];

    // 지도 객체 생성: 기본 래스터 베이스 타일을 얹지 않고 투명하게 생성 (VWorld/Carto 깜빡임 원천 차단)
    window.map = L.map('map', {
        center: [DEFAULT_LAT, DEFAULT_LNG], 
        zoom: DEFAULT_ZOOM,
        maxZoom: 22,
        layers: activeOverlays,
        zoomControl: false
    });
    
    // 줌 컨트롤을 우측 하단으로 이동 (좌측 패널 UI와 겹침 방지)
    L.control.zoom({ position: 'bottomright' }).addTo(window.map);
    
    // 대경선 렌더링 호출
    if (typeof window.drawDaegyeongLine === 'function') {
        window.drawDaegyeongLine();
    }

    // 경부고속도로 정밀 노선 표출
    if (typeof window.drawGyeongbuHighway === 'function') {
        window.drawGyeongbuHighway();
    }

    // WebGL 지도 기본 사용으로 불필요한 구형 Leaflet 백그라운드 폴리곤/라벨 생성 원천 차단 (메모리 절감)

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
        "🛰️ 위성지도 (국토지리)": satelliteLayer,
        "🌍 고화질 위성 (Esri)": esriSatelliteLayer
    };

    var overlayMaps = {};
    if (window.gumiBuildingLabelsLayerGroup) overlayMaps["🏢 건물 명칭"] = window.gumiBuildingLabelsLayerGroup;
    if (window.gumiRoadLabelsLayerGroup) overlayMaps["🏷️ 도로명칭"] = window.gumiRoadLabelsLayerGroup;
    if (window.gumiRoadsLayerGroup) overlayMaps["🛣️ 구미 도로망 (고속/국도/지방도)"] = window.gumiRoadsLayerGroup;
    if (hybridLayer) overlayMaps["🏷️ 국토지리 행정명/지명 (토글)"] = hybridLayer;
    if (window.trafficLayer) overlayMaps["🚦 실시간 교통망 정보"] = window.trafficLayer;
    if (window.cctvLayerGroup) overlayMaps["📹 실시간 CCTV"] = window.cctvLayerGroup;
    if (window.eventLayerGroup) overlayMaps["🚧 실시간 도로 통제/공사"] = window.eventLayerGroup;
    if (window.sharedPmLayerGroup) overlayMaps["🛴 공유 킥보드/자전거"] = window.sharedPmLayerGroup;
    if (window.wmsTrafficAccident) overlayMaps["⚠️ 교통사고 다발지역 (WMS)"] = window.wmsTrafficAccident;
    if (window.wmsPedestrianHazard) overlayMaps["🚶 보행자사고 다발지역 (WMS)"] = window.wmsPedestrianHazard;
    if (window.wmsSafetyInfo) overlayMaps["🚨 생활밀착 치안/안전정보 (WMS)"] = window.wmsSafetyInfo;

    L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(window.map);

    // ============================================================
    // 🗺️ 상단 모드 탭 제어 함수 (GuMap 자체지도 / 위성 전용)
    // ============================================================
    window.setMapMode = function(mode) {
        var btnGumap = document.getElementById('tab-mode-gumap');
        var btnSatellite = document.getElementById('tab-mode-satellite');

        if (btnGumap) btnGumap.classList.remove('active');
        if (btnSatellite) btnSatellite.classList.remove('active');

        if (mode === 'satellite') {
            if (btnSatellite) btnSatellite.classList.add('active');
            if (window.disableGuMapWebGLMap) {
                window.disableGuMapWebGLMap();
            }
            if (satelliteLayer && !window.map.hasLayer(satelliteLayer)) {
                window.map.addLayer(satelliteLayer);
            }
        } else {
            // 기본 GuMap 모드 (WebGL 자체 벡터 지도 전용)
            if (btnGumap) btnGumap.classList.add('active');
            if (satelliteLayer && window.map.hasLayer(satelliteLayer)) {
                window.map.removeLayer(satelliteLayer);
            }
            if (esriSatelliteLayer && window.map.hasLayer(esriSatelliteLayer)) {
                window.map.removeLayer(esriSatelliteLayer);
            }
            if (window.enableGuMapWebGLMap) {
                window.enableGuMapWebGLMap();
            }
        }
        if (typeof window.updateMapScaleHud === 'function') {
            setTimeout(window.updateMapScaleHud, 100);
        }
    };

    // ============================================================
    // 📏 실시간 지도 축척 및 줌 레벨 HUD 연동
    // ============================================================
    window.updateMapScaleHud = function () {
        var zoomValEl = document.getElementById('hud-zoom-val');
        var scaleValEl = document.getElementById('hud-scale-val');
        if (!zoomValEl || !scaleValEl) return;

        var zoom = 14;
        var lat = 36.119485;

        if (window.isGuMapWebGLActive && window.gumapWebGLMap) {
            zoom = window.gumapWebGLMap.getZoom();
            lat = window.gumapWebGLMap.getCenter().lat;
        } else if (window.map) {
            zoom = window.map.getZoom();
            lat = window.map.getCenter().lat;
        }

        zoomValEl.textContent = zoom.toFixed(1);

        // 80px 기준 실거리 미터 계산
        var metersPerPixel = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
        var distMeters = Math.round(metersPerPixel * 80);

        if (distMeters >= 1000) {
            scaleValEl.textContent = '약 ' + (distMeters / 1000).toFixed(1) + 'km';
        } else if (distMeters >= 10) {
            scaleValEl.textContent = '약 ' + distMeters + 'm';
        } else {
            scaleValEl.textContent = '약 ' + Math.max(1, distMeters) + 'm';
        }
    };

    window.map.on('zoom move zoomend moveend', window.updateMapScaleHud);
    setTimeout(window.updateMapScaleHud, 200);

    // 기본 시작 모드: GuMap 자체 디자인 지도로 최초 자동 활성화
    setTimeout(function() {
        if (window.setMapMode) {
            window.setMapMode('gumap');
        }
    }, 150);




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

    // 레이어 전환 시 활성 베이스 레이어 추적
    window.map.on('baselayerchange', function(e) {
        window._lastActiveBaseLayer = e.layer;
    });

    // Leaflet Popup 객체 초기화
    window.infoWindow = L.popup();

    // 정류장 로드 및 클릭 이벤트 바인딩 (노선 코드 및 버스 시간표 연동)
    if (typeof bus_stations !== 'undefined') {
        // fallbackRouteStops와 allRoutesMap을 기반으로 정류장별 경유 노선코드 매핑 구축
        let fbStationList = [];
        if (typeof fallbackRouteStops !== 'undefined' && fallbackRouteStops) {
            let rIdToNo = {};
            if (typeof allRoutesMap !== 'undefined') {
                for (let rno in allRoutesMap) {
                    allRoutesMap[rno].forEach(rid => rIdToNo[rid] = rno);
                }
            }
            for (let rid in fallbackRouteStops) {
                let stops = fallbackRouteStops[rid];
                let rno = rIdToNo[rid] || rid.replace('GMB', '');
                stops.forEach(st => {
                    fbStationList.push({
                        routeId: rid,
                        routeNo: rno,
                        nodeid: st.nodeid,
                        name: st.nodenm,
                        lat: Number(st.gpslati),
                        lng: Number(st.gpslong)
                    });
                });
            }
        }

        for (let i = 0; i < bus_stations.length; i++) {
            let s = bus_stations[i];
            if (s.lat && s.lng) {
                let sLat = Number(s.lat);
                let sLng = Number(s.lng);

                // 노선 코드 및 정류장 ID 사전 매핑
                if (!s.routeNos) {
                    let best = null;
                    let bestDist = 0.0025; // 약 250m
                    let matchingRoutes = new Set();
                    let matchingRouteIds = new Set();

                    fbStationList.forEach(fb => {
                        let d = Math.abs(fb.lat - sLat) + Math.abs(fb.lng - sLng);
                        let nameMatch = (fb.name === s.name || s.name.startsWith(fb.name) || fb.name.startsWith(s.name));
                        if (d < 0.0025 || (nameMatch && d < 0.008)) {
                            matchingRoutes.add(fb.routeNo);
                            matchingRouteIds.add(fb.routeId);
                            if (!best || d < bestDist) {
                                bestDist = d;
                                best = fb;
                            }
                        }
                    });

                    if (best) {
                        s.nodeid = best.nodeid;
                        s.routeNos = Array.from(matchingRoutes);
                        s.routeIds = Array.from(matchingRouteIds);
                    }
                }

                // 15% 축소된 19px 정사각 크기 적용
                let routeHint = (s.routeNos && s.routeNos.length > 0) ? ` [${s.routeNos.join(', ')}번]` : '';
                let content = `<div class="bus-station-svg-marker" title="${s.name}${routeHint} (클릭 시 시간표 및 도착 정보)"><img src="/GUMAP-프론트/images/bus-icon.svg" class="bus-station-svg-img" alt="정류장" /></div>`;
                let icon = L.divIcon({
                    html: content,
                    className: 'station-marker-icon',
                    iconSize: [19, 19],
                    iconAnchor: [9.5, 9.5]
                });
                let marker = L.marker([s.lat, s.lng], { icon: icon });

                marker.on('click', function() {
                    if (typeof openStopInfo === 'function') {
                        openStopInfo(s.name, s.lat, s.lng, s.nodeid, s.routeNos, s.routeIds);
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

        const isWebGlActive = (window.currentMapMode === 'gumap');
        const visible = !isWebGlActive && (window.map.getZoom() >= window.MIN_STATION_ZOOM);
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

    // 외부 모듈 클릭 이벤트 바인딩 호출
    if (typeof window.initMapClickEvents === 'function') {
        window.initMapClickEvents();
    }

    // 기본 지도를 GuMap 자체 벡터 지도(WebGL)로 확정 활성화
    if (typeof window.setMapMode === 'function') {
        window.setMapMode('gumap');
    }
};
