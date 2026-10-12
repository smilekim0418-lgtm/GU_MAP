/* hls.js 지연 로드. 한 번만 받고, 동시에 여러 번 불려도 같은 약속을 돌려준다. */
window.loadHlsLibrary = window.loadHlsLibrary || (function () {
    var pending = null;
    return function () {
        if (typeof Hls !== 'undefined') return Promise.resolve();
        if (pending) return pending;
        pending = new Promise(function (resolve, reject) {
            var tag = document.createElement('script');
            // @latest 는 배포마다 바뀌어 캐시도 안 되고 동작도 흔들린다. 버전을 고정한다.
            tag.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js';
            tag.crossOrigin = 'anonymous';
            tag.onload = function () { resolve(); };
            tag.onerror = function () { pending = null; reject(new Error('hls.js load failed')); };
            document.head.appendChild(tag);
        });
        return pending;
    };
})();

// ============================================================
// 📁 파일명: js/map/map-layers.js
// 📌 역할: 지도 위 실시간 데이터 오버레이 레이어 관리
// ============================================================
//
// [파일 설명]
//   지도 위에 토글 방식으로 켜고 끌 수 있는 실시간 데이터 레이어들을 관리합니다.
//   - 🎥 CCTV 레이어: 경찰청/ITS 실시간 교통 CCTV 위치 및 영상 스트림
//   - 🚨 교통사고 레이어: 도로교통공단 실시간 돌발교통정보 API 연동
//   - 🛴 공유 PM 레이어: 공유 킥보드/전동휠 위치 (시뮬레이션 기반)
//   - ⛽ 주유소 레이어: 한국석유공사 오피넷 실시간 유가 API 연동
//   - 각 레이어는 MarkerCluster 플러그인으로 밀집 지역 자동 클러스터링
//
// [의존 관계]
//   - config.js → API 키, 프록시 URL 참조
//   - map-init.js → window.map 전역 지도 객체 참조
//
// [사용된 외부 API]
//   - 국가교통정보센터(ITS) CCTV API
//   - 도로교통공단 실시간 돌발교통정보 API
//   - 한국석유공사 오피넷 유가 API
// ============================================================

window.cctvMarkers = [];
window.eventMarkers = [];
window.sharedPmMarkers = [];
window.isCctvLayerOn = false;
window.isEventLayerOn = false;
window.isSharedPmLayerOn = false;
window.trafficLayer = null;

window.cctvRenderToken = 0;
window.eventRenderToken = 0;

// ═══════════════════════════════════════════════════════
// 🛰️ 금오공대 정사영상 레이어 (드론 고해상도 항공사진)
//   - 데이터 경로: 학교지도/GUMI-KUMHO/2. 정사영상/
//   - 포트 8765 로컬 서버 필요 (start-gis-servers.bat 실행)
//   - 타일 구조: EPSG:4326 TMS (GDAL2Tiles 지리좌표계 출력)
//   - 줌별 타일 수: x = 2^(z+1), y = 2^z, TMS방식(y=0이 남쪽)
//   - 데이터 범위: lat=35.99~36.32, lon=128.21~128.58
//   - 전체 중심: lat=36.156, lon=128.397 (금오공대)
// ═══════════════════════════════════════════════════════
window.orthophotoLayer = null;
window.isOrthophotoOn = false;

// WebMercator 타일좌표(z,x,y) → EPSG:4326 TMS 타일좌표 변환
// Leaflet은 WebMercator XYZ로 요청하므로 위경도를 거쳐 4326 TMS 타일로 역산
window._wmTile2geo4326Tms = function(z, wx, wy) {
    // WebMercator XYZ → 위경도 (타일 중심점)
    var n = Math.pow(2, z);
    var lon = (wx + 0.5) / n * 360.0 - 180.0;
    var latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (wy + 0.5) / n)));
    var lat = latRad * 180.0 / Math.PI;

    // EPSG:4326 TMS 타일 인덱스 계산
    var xTiles = Math.pow(2, z + 1);  // 4326: 줌당 x타일 수 = 2^(z+1)
    var yTiles = Math.pow(2, z);       // 4326: 줌당 y타일 수 = 2^z
    var tx = Math.floor((lon + 180.0) / 360.0 * xTiles);
    var ty = Math.floor((lat + 90.0) / 180.0 * yTiles);  // TMS: y=0이 남쪽
    return { z: z, x: tx, y: ty };
};

// 커스텀 TileLayer: WebMercator 요청을 4326 TMS로 변환
window.Ortho4326TmsLayer = L.TileLayer.extend({
    getTileUrl: function(coords) {
        var t = window._wmTile2geo4326Tms(coords.z, coords.x, coords.y);
        return '/gis/8765/' + t.z + '/' + t.x + '/' + t.y + '.jpg';
    }
});

window.initOrthophotoLayer = function() {
    if (window.orthophotoLayer) return;
    window.orthophotoLayer = new window.Ortho4326TmsLayer(null, {
        maxZoom: 17,
        maxNativeZoom: 16,   // Z=17 타일이 불완전 → Z=16으로 스케일업
        minZoom: 13,
        opacity: 0.92,
        attribution: '© 금오공과대학교 드론 정사영상 (EPSG:4326 TMS, 2024)',
        errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        crossOrigin: true
    });
};

window.toggleOrthophotoLayer = function(forceOn) {
    window.initOrthophotoLayer();
    var shouldOn = (forceOn !== undefined) ? forceOn : !window.isOrthophotoOn;
    if (shouldOn) {
        window.orthophotoLayer.addTo(window.map);
        window.orthophotoLayer.bringToFront();
        window.isOrthophotoOn = true;
        var cb = document.getElementById('layer-orthophoto');
        if (cb) cb.checked = true;
        if (window.showToast) window.showToast('📸 드론 정사영상 레이어 활성화 (EPSG:4326 TMS)');
    } else {
        if (window.orthophotoLayer && window.map.hasLayer(window.orthophotoLayer)) {
            window.map.removeLayer(window.orthophotoLayer);
        }
        window.isOrthophotoOn = false;
        var cb = document.getElementById('layer-orthophoto');
        if (cb) cb.checked = false;
    }
};

// ═══════════════════════════════════════════════════════
// 📐 DEM 고도 레이어 (수치표고모델, 경사도 분석용)
//   - 포트 8767 로컬 서버 필요
// ═══════════════════════════════════════════════════════
window.demLayer = null;
window.isDemOn = false;
window.slopeHeatLayer = null;

window.initDemLayer = function() {
    if (window.demLayer) return;
    window.demLayer = L.tileLayer('/gis/8767/{z}/{x}/{y}.png', {
        maxZoom: 17,
        minZoom: 13,
        tms: false,
        opacity: 0.5,
        crossOrigin: true,
        errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    });
};

// DEM 타일 픽셀에서 고도값 추출 (Mapbox Terrain RGB 방식 우선 시도)
window.getElevationAt = async function(lat, lon, zoom) {
    zoom = zoom || 15;
    var n = Math.pow(2, zoom);
    var x = Math.floor((lon + 180) / 360 * n);
    var y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
    var url = '/gis/8767/' + zoom + '/' + x + '/' + y + '.png';

    return new Promise(function(resolve) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
            try {
                var canvas = document.createElement('canvas');
                canvas.width = img.width; canvas.height = img.height;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                var px = ctx.getImageData(Math.floor(img.width / 2), Math.floor(img.height / 2), 1, 1).data;
                // Mapbox Terrain RGB: elevation = -10000 + (R*256*256 + G*256 + B) * 0.1
                var ele = -10000 + ((px[0] * 65536 + px[1] * 256 + px[2]) * 0.1);
                resolve(Math.round(ele * 10) / 10);
            } catch(e) { resolve(null); }
        };
        img.onerror = function() { resolve(null); };
        img.src = url;
    });
};

// 거리 기반 겹침 방지 필터링 함수 (약 40m 내에 겹치는 장소는 하나로 묶고 누적 갯수 뱃지 표기)
window.filterPoisForOverlap = function(items, latKey, lngKey) {
    var filtered = [];
    var threshold = 0.00035; // 약 35~40m 간격의 임계치
    
    items.forEach(function(item) {
        var lat = parseFloat(item[latKey]);
        var lng = parseFloat(item[lngKey]);
        if (isNaN(lat) || isNaN(lng)) return;
        
        var matched = filtered.find(function(rep) {
            var dLat = Math.abs(rep.lat - lat);
            var dLng = Math.abs(rep.lng - lng);
            return dLat < threshold && dLng < threshold;
        });
        
        if (matched) {
            matched.children.push(item);
        } else {
            filtered.push({
                lat: lat,
                lng: lng,
                main: item,
                children: [] // 겹치는 하위 항목들
            });
        }
    });
    return filtered;
};

// 길찾기 동선 기준 400m 이내 인접 마커 여부 계산 및 투명도 획득 함수
window.getMarkerOpacityByRoute = function(lat, lng) {
    if (typeof window.currentRoutingPolylines === 'undefined' || !window.currentRoutingPolylines || window.currentRoutingPolylines.length === 0) {
        return 1.0;
    }
    
    var minDistance = Infinity;
    
    window.currentRoutingPolylines.forEach(function(polyline) {
        var latlngs = polyline.getLatLngs();
        var flatLatLngs = [];
        
        function flatten(arr) {
            if (Array.isArray(arr)) {
                if (arr.length > 0 && (arr[0] instanceof L.LatLng || (typeof arr[0] === 'object' && arr[0].lat !== undefined))) {
                    flatLatLngs = flatLatLngs.concat(arr);
                } else {
                    arr.forEach(flatten);
                }
            }
        }
        flatten(latlngs);
        
        flatLatLngs.forEach(function(pt) {
            var dist = (typeof window.getLatLngDistance === 'function') ? window.getLatLngDistance(lat, lng, pt.lat, pt.lng) : 9999;
            if (dist < minDistance) {
                minDistance = dist;
            }
        });
    });
    
    return minDistance <= 400 ? 1.0 : 0.4;
};

// CCTV 레이어 토글
window.toggleCctvLayer = function(show) {
    window.isCctvLayerOn = show;
    if (show) {
        window.fetchAndRenderCctv();
    } else {
        window.cctvMarkers.forEach(m => {
            if (m._hls) {
                m._hls.destroy();
                m._hls = null;
            }
            m.remove();
        });
        window.cctvMarkers = [];
    }
};

// 돌발상황 레이어 토글
window.toggleEventLayer = function(show) {
    window.isEventLayerOn = show;
    if (show) {
        window.fetchAndRenderEvent();
    } else {
        window.eventMarkers.forEach(m => m.remove());
        window.eventMarkers = [];
    }
};

// 실시간 CCTV 렌더링
window.fetchAndRenderCctv = function() {
    window.cctvRenderToken++;
    var myCctvToken = window.cctvRenderToken;

    window.cctvMarkers.forEach(m => m.remove());
    window.cctvMarkers = [];

    if (!window.map) return;
    var bounds = window.map.getBounds();
    var minX = bounds.getWest();
    var minY = bounds.getSouth();
    var maxX = bounds.getEast();
    var maxY = bounds.getNorth();

    var urls = [
        `${window.PROXY_URL}/its-cctv?reqType=2&minX=${minX}&minY=${minY}&maxX=${maxX}&maxY=${maxY}&cctvType=1&type=its`,
        `${window.PROXY_URL}/its-cctv?reqType=2&minX=${minX}&minY=${minY}&maxX=${maxX}&maxY=${maxY}&cctvType=1&type=ex`
    ];

    urls.forEach(url => {
        var type = url.indexOf('type=its') !== -1 ? 'ITS 국도' : 'EX 고속도로';
        fetchWithRetry(url, {}, window.GUMAP_CONSTANTS.API.MAX_RETRIES)
        .then(data => {
            if (!window.isCctvLayerOn) return;
            if (myCctvToken !== window.cctvRenderToken) return;
            if (data.response && data.response.data) {
                var items = data.response.data;
                if (!Array.isArray(items)) items = [items];
                
                items.forEach(item => {
                    var latVal = item.cctvlatitude || item.coordy;
                    var lngVal = item.cctvlongitude || item.coordx;
                    if (latVal && lngVal) {
                        var lat = parseFloat(latVal);
                        var lng = parseFloat(lngVal);
                        
                        var icon = L.divIcon({
                            html: `<div style="font-size:18px; text-shadow:0 0 3px white; cursor:pointer;" title="${item.cctvname}">📹</div>`,
                            className: 'its-cctv-icon',
                            iconSize: [22, 22],
                            iconAnchor: [11, 11]
                        });
                        
                        var marker = L.marker([lat, lng], { icon: icon }).addTo(window.cctvLayerGroup);
                        
                        var secureCctvUrl = item.cctvurl2 || item.cctvurl || '';
                        if (window.location.protocol === 'https:' && secureCctvUrl.indexOf('http://') === 0) {
                            if (secureCctvUrl.indexOf('cctvsec.ktict.co.kr:8090') !== -1) {
                                secureCctvUrl = secureCctvUrl.replace('http://cctvsec.ktict.co.kr:8090', 'https://cctvsec.ktict.co.kr:8091');
                            } else {
                                secureCctvUrl = secureCctvUrl.replace('http://', 'https://');
                            }
                        }

                        var proxyCctvUrl = `${window.PROXY_URL}/cctv-proxy?url=${encodeURIComponent(secureCctvUrl)}`;

                        var videoId = `cctv-video-${item.cctvname.replace(/[^a-zA-Z0-9]/g, '')}`;
                        var popupContent = `
                        <div style="font-family:'Noto Sans KR',sans-serif; padding:5px; width:280px; line-height:1.4;">
                            <b style="font-size:14px; color:#1e293b; display:block; margin-bottom:4px;">📹 실시간 CCTV [${item.cctvname}]</b>
                            <div style="margin-top:8px; background:#000; border-radius:8px; overflow:hidden; position:relative; padding-top:56.25%;">
                                <video id="${videoId}" data-src="${proxyCctvUrl}" controls autoplay muted playsinline style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:contain;"></video>
                            </div>
                            <div style="margin-top:6px; text-align:right;">
                                <a href="${secureCctvUrl}" target="_blank" style="font-size:11px; color:#2563eb; text-decoration:underline; font-weight:700;">외부 플레이어로 보기 ↗</a>
                            </div>
                        </div>`;
                        
                        marker.bindPopup(popupContent, { maxWidth: 300 });
                        
                        marker.on('popupopen', function() {
                            var videoEl = document.getElementById(videoId);
                            if (videoEl) {
                                var streamUrl = videoEl.getAttribute('data-src');
                                var wantsHls = streamUrl.indexOf('.m3u8') !== -1 || streamUrl.indexOf('cctv') !== -1;
                                // hls.js 는 무거워서(620 KB) 페이지 로드 때 받지 않는다. 사파리처럼
                                // HLS 를 직접 재생하는 브라우저는 아예 받을 필요가 없다.
                                if (wantsHls && typeof Hls === 'undefined' && !videoEl.canPlayType('application/vnd.apple.mpegurl')) {
                                    window.loadHlsLibrary().then(function () {
                                        if (marker.isPopupOpen()) marker.fire('popupopen');
                                    }).catch(function () { videoEl.src = streamUrl; });
                                    return;
                                }
                                if (typeof Hls !== 'undefined' && Hls.isSupported() && wantsHls) {
                                    var hls = new Hls();
                                    hls.loadSource(streamUrl);
                                    hls.attachMedia(videoEl);
                                    hls.on(Hls.Events.MANIFEST_PARSED, function() {
                                        videoEl.play();
                                    });
                                    marker._hls = hls; // Store hls on marker for destruction
                                } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
                                    videoEl.src = streamUrl;
                                    videoEl.addEventListener('loadedmetadata', function() {
                                        videoEl.play();
                                    });
                                } else {
                                    videoEl.src = streamUrl;
                                }
                            }
                        });

                        marker.on('popupclose', function() {
                            if (marker._hls) {
                                marker._hls.destroy();
                                marker._hls = null;
                            }
                        });

                        window.cctvMarkers.push(marker);
                    }
                });
            }
        })
        .catch(err => {
            if (window.ErrorHandler) {
                window.ErrorHandler.handle(err, `${type} CCTV 로드`, window.ErrorHandler.LEVEL.TOAST);
            } else {
                console.warn("CCTV API 로드 실패:", err);
            }
        });
    });
};

// 실시간 도로 돌발상황 렌더링
window.fetchAndRenderEvent = function() {
    window.eventRenderToken++;
    var myEventToken = window.eventRenderToken;

    window.eventMarkers.forEach(m => m.remove());
    window.eventMarkers = [];

    if (!window.map) return;
    var bounds = window.map.getBounds();
    var minX = bounds.getWest();
    var minY = bounds.getSouth();
    var maxX = bounds.getEast();
    var maxY = bounds.getNorth();

    var url = `${window.PROXY_URL}/its-event?reqType=2&minX=${minX}&minY=${minY}&maxX=${maxX}&maxY=${maxY}&type=all&eventType=all`;

    fetchWithRetry(url, {}, window.GUMAP_CONSTANTS.API.MAX_RETRIES)
    .then(data => {
        if (!window.isEventLayerOn) return;
        if (myEventToken !== window.eventRenderToken) return;
        if (data.response && data.response.data) {
            var items = data.response.data;
            if (!Array.isArray(items)) items = [items];
            
            items.forEach(item => {
                if (item.coordy && item.coordx) {
                    var lat = parseFloat(item.coordy);
                    var lng = parseFloat(item.coordx);
                    
                    var emoji = "⚠️";
                    var type = item.eventtype || "";
                    if (type.indexOf("공사") !== -1 || type.indexOf("🚧") !== -1) emoji = "🚧";
                    else if (type.indexOf("사고") !== -1) emoji = "💥";
                    else if (type.indexOf("통제") !== -1 || type.indexOf("폐쇄") !== -1) emoji = "🚫";
                    else if (type.indexOf("행사") !== -1 || type.indexOf("축제") !== -1) emoji = "🎉";
                    
                    var icon = L.divIcon({
                        html: `<div style="font-size:20px; text-shadow:0 0 3px white; cursor:pointer;" title="${item.eventdescription}">${emoji}</div>`,
                        className: 'its-event-icon',
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    });
                    
                    var marker = L.marker([lat, lng], { icon: icon }).addTo(window.eventLayerGroup);
                    
                    var popupContent = `
                    <div style="font-family:'Noto Sans KR',sans-serif; padding:5px; width:240px; line-height:1.4;">
                        <b style="font-size:14px; color:#dc2626; display:block; margin-bottom:4px;">🚨 도로 돌발상황 [${item.eventtype || "기타"}]</b>
                        <span style="font-size:11px; color:#64748b; display:block; margin-bottom:4px;"><b>상세구분:</b> ${item.eventdetailtype || "정보 없음"}</span>
                        <div style="margin-top:6px; font-size:11px; color:#1e293b; background:#f8fafc; padding:8px; border-radius:6px; border:1px solid #e2e8f0; word-break:break-all;">
                            ${item.eventdescription}
                        </div>
                    </div>`;
                    
                    marker.bindPopup(popupContent, { maxWidth: 260 });
                    window.eventMarkers.push(marker);
                }
            });
        }
    })
    .catch(err => {
        if (window.ErrorHandler) {
            window.ErrorHandler.handle(err, 'ITS 돌발상황 조회', window.ErrorHandler.LEVEL.TOAST);
        } else {
            console.warn("돌발상황 API 로드 실패:", err);
        }
    });
};

// 다크모드 토글
window.toggleDarkMode = function() {
    var layers = window._mapLayers;
    if (!layers) return;
    var isDark = document.body.classList.contains('dark-theme');
    if (isDark) {
        document.body.classList.remove('dark-theme');
        localStorage.setItem('gumap_dark_theme', 'false');
        var toggle = document.getElementById('dark-mode-toggle');
        if (toggle) { toggle.textContent = '🌙'; toggle.title = '다크모드 전환'; }
        if (window.map) {
            window.map.removeLayer(layers.darkLayer);
            window.map.addLayer(window._lastActiveBaseLayer || layers.baseLayer);
        }
    } else {
        document.body.classList.add('dark-theme');
        localStorage.setItem('gumap_dark_theme', 'true');
        var toggle = document.getElementById('dark-mode-toggle');
        if (toggle) { toggle.textContent = '☀️'; toggle.title = '라이트모드 전환'; }
        if (window.map) {
            var baseLayers = [layers.osmLayer, layers.baseLayer, layers.satelliteLayer, layers.esriSatelliteLayer, layers.lightGrayLayer];
            baseLayers.forEach(function(l) {
                if (l && window.map.hasLayer(l)) {
                    window.map.removeLayer(l);
                }
            });
            window.map.addLayer(layers.darkLayer);
        }
    }
};

// 실시간 교통 혼잡도 레이어 토글
window.toggleTrafficLayer = function(show) {
    if (show) {
        if (!window.trafficLayer) {
            window.trafficLayer = L.tileLayer('https://its.go.kr:9443/geoserver/gwc/service/wmts/rest/ntic:N_LEVEL_11/ntic:REALTIME/EPSG:3857/EPSG:3857:{z}/{y}/{x}?format=image/png8', {
                maxZoom: 19, minZoom: 6, opacity: 0.7, attribution: 'ITS 실시간 교통정보'
            });
        }
        window.trafficLayer.addTo(window.map);
    } else {
        if (window.trafficLayer) window.map.removeLayer(window.trafficLayer);
    }
};

window.sharedPmRenderToken = window.sharedPmRenderToken || 0;

// 공유 퍼스널모빌리티 레이어 토글
window.toggleSharedPmLayer = function(show) {
    window.isSharedPmLayerOn = show;
    window.sharedPmRenderToken++;
    var currentToken = window.sharedPmRenderToken;

    if (show) {
        fetchWithRetry(`${window.PROXY_URL}/shared-mobility?pageNo=1&numOfRows=50&_type=json&cityCode=37050`, {}, window.GUMAP_CONSTANTS.API.MAX_RETRIES)
        .then(function(data) {
            if (currentToken !== window.sharedPmRenderToken) return;
            if (!window.isSharedPmLayerOn) return;
            if (data.response && data.response.body && data.response.body.items && data.response.body.totalCount > 0) {
                var items = data.response.body.items.item;
                if (!Array.isArray(items)) items = [items];
                items.forEach(function(pm) {
                    var lat = parseFloat(pm.gpslati || pm.lat);
                    var lng = parseFloat(pm.gpslong || pm.lng);
                    if (!lat || !lng) return;
                    var type = pm.pmType || '킥보드';
                    var emoji = type.indexOf('자전거') >= 0 ? '🚲' : '🛴';
                    var battery = pm.battery ? pm.battery + '%' : '?';
                    var company = pm.companyNm || pm.company || '';
                    var icon = L.divIcon({
                        html: '<div style="font-size:22px; text-shadow:0 0 4px white; cursor:pointer;" title="' + company + ' ' + type + '">' + emoji + '</div>',
                        className: 'shared-pm-icon', iconSize: [24, 24], iconAnchor: [12, 12]
                    });
                    var marker = L.marker([lat, lng], { icon: icon }).addTo(window.sharedPmLayerGroup);
                    marker.bindPopup('<div style="font-family:Noto Sans KR,sans-serif; min-width:120px;"><b>' + emoji + ' ' + type + '</b><br><span style="font-size:11px; color:#64748b;">' + company + '</span><br>🔋 배터리: <b>' + battery + '</b><div style="display:flex; justify-content:flex-end; gap:6px; margin-top:5px;"><a href="javascript:void(0)" onclick="window.addFavorite(\'' + company.replace(/'/g, "\\'") + ' ' + type + '\', ' + lat + ', ' + lng + ', \'\')" style="font-size:11px; color:#92400e; text-decoration:underline; font-weight:600; cursor:pointer;">⭐ 즐겨찾기</a></div></div>');
                    window.sharedPmMarkers.push(marker);
                });
                var infoBar = document.getElementById('clicked-info');
                if (infoBar) infoBar.innerHTML = '🛴 공유 모빌리티 ' + items.length + '대 발견!';
            } else {
                var infoBar = document.getElementById('clicked-info');
                if (infoBar) infoBar.innerHTML = '🛴 현재 구미시 공유 모빌리티 API 데이터가 0건입니다. (테스트용 가상 데이터 표시)';
                var center = window.map.getCenter();
                for (var i=0; i<15; i++) {
                    var lat = center.lat + (Math.random() - 0.5) * 0.04;
                    var lng = center.lng + (Math.random() - 0.5) * 0.04;
                    var type = Math.random() > 0.5 ? '자전거' : '킥보드';
                    var emoji = type === '자전거' ? '🚲' : '🛴';
                    var company = type === '자전거' ? '지바이크' : '씽씽';
                    var battery = Math.floor(Math.random() * 100) + '%';
                    var icon = L.divIcon({
                        html: '<div style="font-size:22px; text-shadow:0 0 4px white; cursor:pointer;" title="' + company + ' ' + type + '">' + emoji + '</div>',
                        className: 'shared-pm-icon', iconSize: [24, 24], iconAnchor: [12, 12]
                    });
                    var marker = L.marker([lat, lng], { icon: icon }).addTo(window.sharedPmLayerGroup);
                    marker.bindPopup('<div style="font-family:Noto Sans KR,sans-serif; min-width:120px;"><b>' + emoji + ' ' + type + ' (가상)</b><br><span style="font-size:11px; color:#64748b;">' + company + '</span><br>🔋 배터리: <b>' + battery + '</b><div style="display:flex; justify-content:flex-end; gap:6px; margin-top:5px;"><a href="javascript:void(0)" onclick="window.addFavorite(\'' + company.replace(/'/g, "\\'") + ' ' + type + '\', ' + lat + ', ' + lng + ', \'\')" style="font-size:11px; color:#92400e; text-decoration:underline; font-weight:600; cursor:pointer;">⭐ 즐겨찾기</a></div></div>');
                    window.sharedPmMarkers.push(marker);
                }
            }
        })
        .catch(function(err) {
            if (window.ErrorHandler) {
                window.ErrorHandler.handle(err, '공유모빌리티 조회', window.ErrorHandler.LEVEL.TOAST);
            } else {
                console.error('공유PM 조회 실패:', err);
            }
        });
    } else {
        window.sharedPmMarkers.forEach(function(m) { m.remove(); });
        window.sharedPmMarkers = [];
    }
};

// 오피넷(Opinet) 주유소 검색 및 유가 표시
window.searchOpinetGasStations = function(center, options = {}) {
    if (typeof proj4 === 'undefined') {
        console.error("Proj4js library not loaded.");
        var infoBar = document.getElementById('clicked-info');
        if (infoBar) infoBar.innerHTML = `🚨 Proj4js 라이브러리가 로드되지 않아 주유소 검색을 수행할 수 없습니다.`;
        return;
    }

    try {
        proj4.defs("KATEC", "+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 +ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43");
    } catch (e) {
        console.warn("[MapLayers] KATEC projection definition already defined or failed:", e);
    }

    var katecCoords = proj4("EPSG:4326", "KATEC", [center.lng, center.lat]);
    var x = Math.round(katecCoords[0]);
    var y = Math.round(katecCoords[1]);

    var url = `${window.PROXY_URL}/opinet-around?out=json&x=${x}&y=${y}&radius=3000&prodcd=B027&sort=1`;
    
    var infoBar = document.getElementById('clicked-info');
    if (infoBar) infoBar.innerHTML = `⏳ 주변 3km 내 주유소를 검색 중입니다...`;

    fetchWithRetry(url, {}, window.GUMAP_CONSTANTS.API.MAX_RETRIES)
    .then(data => {
        if (window.currentCategorySearch !== '주유소') return;
        
        if (data.RESULT && data.RESULT.OIL) {
            var stations = data.RESULT.OIL;
            if (!Array.isArray(stations)) stations = [stations];
            
            if (stations.length === 0) {
                if (infoBar) infoBar.innerHTML = `❌ 반경 3km 내에 <b>주유소</b> 검색 결과가 없습니다. (오피넷 인증 제한 또는 데이터 없음)`;
                return;
            }
            
            var wgsStations = stations.map(st => {
                var stX = parseFloat(st.GIS_X_COOR);
                var stY = parseFloat(st.GIS_Y_COOR);
                var wgs = proj4('KATEC', 'EPSG:4326', [stX, stY]);
                st.stLng = wgs[0];
                st.stLat = wgs[1];
                return st;
            });

            var uniqueGroups = window.filterPoisForOverlap(wgsStations, 'stLat', 'stLng');

            var createdGasMarkers = [];
            var cheapestStation = wgsStations[0];
            var cheapestGroup = null;

            uniqueGroups.forEach(group => {
                var lat = group.lat;
                var lng = group.lng;
                var st = group.main;
                
                if (st === cheapestStation || group.children.includes(cheapestStation)) {
                    cheapestGroup = group;
                }
                
                var brandCode = st.POLL_DIV_CD || st.POLL_DIV_CO;
                var brandName = getOpinetBrandName(brandCode);
                var brandColor = getOpinetBrandColor(brandCode);
                
                var rawPrice = parseInt(st.PRICE) || 0;
                var displayPrice = rawPrice > 0 ? (rawPrice.toLocaleString() + '원') : '가격정보없음';
                var stGlowColor = brandColor + '4d';

                var opacity = window.getMarkerOpacityByRoute(lat, lng);

                var badgeHtml = "";
                if (group.children.length > 0) {
                    badgeHtml = `<span style="background:#ef4444; color:white; font-size:9px; border-radius:4px; padding:1px 3px; margin-left:3px; font-weight:900; vertical-align:middle;">+${group.children.length}</span>`;
                }

                var iconHtml = `<div class="glass-capsule-marker" style="--marker-border-color:${brandColor}; --marker-glow-color:${stGlowColor}; opacity:${opacity};" title="${st.OS_NM}">⛽ <span style="color:${brandColor}; font-weight:800;">${brandName}</span> <span style="margin:0 2px; opacity:0.3;">|</span> <span style="color:#ef4444; font-weight:800;">${displayPrice}</span>${badgeHtml}</div>`;
                var icon = L.divIcon({
                    html: iconHtml,
                    className: 'category-marker-icon', 
                    iconSize: [0, 0], 
                    iconAnchor: [0, 0]
                });
                
                var marker = L.marker([lat, lng], { icon: icon, opacity: opacity });
                window.categoryMarkers.push(marker);
                
                var popupContent = document.createElement('div');
                popupContent.style.fontFamily = "'Outfit', 'Noto Sans KR', sans-serif";
                popupContent.style.padding = "6px";
                popupContent.style.minWidth = "220px";
                popupContent.style.maxHeight = "250px";
                popupContent.style.overflowY = "auto";
                
                function createStationHtml(item, isFirst) {
                    var bCode = item.POLL_DIV_CD || item.POLL_DIV_CO;
                    var bName = getOpinetBrandName(bCode);
                    var bColor = getOpinetBrandColor(bCode);
                    var rPrice = parseInt(item.PRICE) || 0;
                    
                    var section = document.createElement('div');
                    if (!isFirst) {
                        section.style.borderTop = "1px dashed #cbd5e1";
                        section.style.paddingTop = "8px";
                        section.style.marginTop = "8px";
                    }
                    
                    var brandBadge = `<span style="display:inline-block; font-size:10px; background:${bColor}; color:white; padding:1px 5px; border-radius:4px; margin-right:5px; font-weight:bold; vertical-align:middle;">${bName}</span>`;
                    
                    var safeName = item.OS_NM.replace(/'/g, "\\'");
                    var safeBrand = bName.replace(/'/g, "\\'");
                    var itemLat = item.stLat;
                    var itemLng = item.stLng;
                    
                    section.innerHTML = `
                        <div style="margin-bottom:4px;">
                            <b style="font-size:13px; color:#1e293b; vertical-align:middle;">⛽ ${DOMPurify.sanitize(item.OS_NM)}</b>
                            <div style="margin-top:2px;">${brandBadge}</div>
                        </div>
                        <div id="opinet-addr-${item.UNI_ID}" style="font-size:10px; color:#64748b; margin-bottom:6px;">⏳ 주소 로딩 중...</div>
                        <div style="font-size:12px; font-weight:bold; color:#1e293b; margin-bottom:8px;">
                            기본 휘발유: <span style="font-size:14px; color:#ef4444;">${rPrice.toLocaleString()}원</span>
                            <span style="font-size:9px; color:#64748b; font-weight:normal;">(${parseInt(item.DISTANCE).toLocaleString()}m)</span>
                        </div>
                        <div id="opinet-detail-${item.UNI_ID}" style="font-size:11px; color:#475569; margin-bottom:4px;">⏳ 유가 상세 정보 로딩 중...</div>
                        <div style="display:flex; gap:4px; margin-top:8px; justify-content:flex-end;">
                            <button onclick="window.addFavorite('${safeName}', ${itemLat}, ${itemLng}, '${safeBrand} 주유소'); window.map.closePopup();" style="padding:3px 6px; font-size:10px; background:#ca8a04; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">⭐ 즐겨찾기</button>
                            <button onclick="setRoutingPoint('START', ${itemLat}, ${itemLng}, '${safeName}'); window.map.closePopup();" style="padding:3px 6px; font-size:10px; background:#3b82f6; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">출발</button>
                            <button onclick="setRoutingPoint('END', ${itemLat}, ${itemLng}, '${safeName}'); window.map.closePopup();" style="padding:3px 6px; font-size:10px; background:#ef4444; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">도착</button>
                        </div>
                    `;
                    
                    return section;
                }
                
                popupContent.appendChild(createStationHtml(st, true));
                
                group.children.forEach(child => {
                    popupContent.appendChild(createStationHtml(child, false));
                });
                
                marker.bindPopup(popupContent);
                
                marker.on('popupopen', function() {
                    window.loadOpinetStationDetail(st.UNI_ID);
                    group.children.forEach(child => {
                        window.loadOpinetStationDetail(child.UNI_ID);
                    });
                });
                
                window.categoryClusterGroup.addLayer(marker);
                createdGasMarkers.push({ group: group, marker: marker });
            });
            window.map.addLayer(window.categoryClusterGroup);
            
            if (options.priceCompare && cheapestGroup && createdGasMarkers.length > 0) {
                var cheapestItem = createdGasMarkers.find(m => m.group === cheapestGroup);
                if (cheapestItem) {
                    setTimeout(function() {
                        cheapestItem.marker.openPopup();
                    }, 500);

                    var bCode = cheapestStation.POLL_DIV_CD || cheapestStation.POLL_DIV_CO;
                    var bName = getOpinetBrandName(bCode);
                    var displayPrice = parseInt(cheapestStation.PRICE).toLocaleString() + '원';
                    var refPoint = (window.userLocation && window.userLocation.lat) ? window.userLocation : window.map.getCenter();
                    var dist = (typeof window.getLatLngDistance === 'function') ? window.getLatLngDistance(refPoint.lat, refPoint.lng, cheapestStation.stLat, cheapestStation.stLng) : 9999;

                    if (window.appendChatMessage) {
                        window.appendChatMessage("ai", `🤖 구미시 실시간 유가 비교 결과, 가장 저렴한 주유소는 **${bName} ${cheapestStation.OS_NM}** (휘발유 최저가: **${displayPrice}**) 입니다. (현 위치 기준 약 ${Math.round(dist)}m)`);
                    }
                }
            }
            
            if (infoBar) infoBar.innerHTML = `✅ 내 주변 3km 반경 내 <b>주유소 (${stations.length}곳)</b>을(를) 찾았습니다!`;
        } else {
            if (infoBar) infoBar.innerHTML = `❌ 반경 3km 내에 <b>주유소</b> 검색 결과가 없습니다.`;
        }
    })
    .catch(err => {
        if (window.ErrorHandler) {
            window.ErrorHandler.handle(err, '오피넷 주유소 검색', window.ErrorHandler.LEVEL.TOAST);
        } else {
            console.error("Opinet 주유소 검색 실패:", err);
            if (infoBar) infoBar.innerHTML = `🚨 오피넷 API 호출에 실패했습니다. (API 키/IP 등록 상태 확인 필요)`;
        }
    });
};

window.loadOpinetStationDetail = function(uniId) {
    var container = document.getElementById(`opinet-detail-${uniId}`);
    var addrEl = document.getElementById(`opinet-addr-${uniId}`);
    if (!container) return;
    
    if (container.dataset.loaded === 'true') return;
    
    var url = `${window.PROXY_URL}/opinet-detail?out=json&id=${uniId}`;
    fetchWithRetry(url, {}, window.GUMAP_CONSTANTS.API.MAX_RETRIES)
    .then(data => {
        if (data.RESULT && data.RESULT.OIL && data.RESULT.OIL.length > 0) {
            var stInfo = data.RESULT.OIL[0];
            
            if (addrEl) {
                var addressText = stInfo.NEW_ADR || stInfo.VAN_ADR || "주소 정보 없음";
                addrEl.textContent = addressText;
            }
            
            var priceList = stInfo.OIL_PRICE;
            if (!Array.isArray(priceList)) priceList = [priceList];
            
            var tableHtml = `<table style="width:100%; border-collapse:collapse; text-align:center; font-size:11px; margin-top:4px;">
                <thead>
                    <tr style="background:#f1f5f9; border-bottom:1px solid #cbd5e1;">
                        <th style="padding:4px; font-weight:700;">유종</th>
                        <th style="padding:4px; font-weight:700;">가격</th>
                    </tr>
                </thead>
                <tbody>`;
            
            var productNames = {
                'B027': '휘발유',
                'D047': '경유',
                'B034': '고급휘발유',
                'K015': 'LPG'
            };
            
            var rowsAdded = 0;
            priceList.forEach(p => {
                var name = productNames[p.PRODCD] || p.PRODCD;
                var price = parseInt(p.PRICE);
                if (price > 0) {
                    tableHtml += `<tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:4px; color:#475569;">${name}</td>
                        <td style="padding:4px; font-weight:700; color:#1e293b;">${price.toLocaleString()}원</td>
                    </tr>`;
                    rowsAdded++;
                }
            });
            
            tableHtml += `</tbody></table>`;
            
            if (rowsAdded === 0) {
                container.innerHTML = `<span style="color:#ef4444;">❌ 등록된 유가 가격 정보 없음</span>`;
            } else {
                container.innerHTML = DOMPurify.sanitize(tableHtml, window.DOM_PURIFY_CONFIG);
            }
            container.dataset.loaded = 'true';
        } else {
            container.innerHTML = `<span style="color:#ef4444;">❌ 세부 유가를 조회할 수 없습니다.</span>`;
        }
    })
    .catch(err => {
        if (window.ErrorHandler) {
            window.ErrorHandler.handle(err, '오피넷 주유소 상세 가격 조회', window.ErrorHandler.LEVEL.TOAST);
        } else {
            console.error("오피넷 주유소 상세 가격 로드 에러:", err);
            container.innerHTML = `<span style="color:#ef4444;">🚨 유가 정보 상세 로드 실패</span>`;
        }
    });
};

function getOpinetBrandName(code) {
    var brands = {
        'SKE': 'SK에너지',
        'GSC': 'GS칼텍스',
        'HDO': '현대오일뱅크',
        'SOL': 'S-OIL',
        'RTE': '알뜰주유소',
        'RTX': '고속도로알뜰',
        'NHO': '농협알뜰',
        'E1G': 'E1',
        'SKG': 'SK가스'
    };
    return brands[code] || '주유소';
}

function getOpinetBrandColor(code) {
    var colors = {
        'SKE': '#ef4444',
        'GSC': '#0d9488',
        'HDO': '#1e3a8a',
        'SOL': '#ca8a04',
        'RTE': '#2563eb',
        'RTX': '#1e40af',
        'NHO': '#16a34a',
        'E1G': '#ea580c',
        'SKG': '#f97316'
    };
    return colors[code] || '#475569';
}
