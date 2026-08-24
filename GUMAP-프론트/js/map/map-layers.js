// ============================================================
// ?뱚 ?뚯씪紐? js/map/map-layers.js
// ?뱦 ??븷: 吏?????ㅼ떆媛??곗씠???ㅻ쾭?덉씠 ?덉씠??愿由?// ============================================================
//
// [?뚯씪 ?ㅻ챸]
//   吏???꾩뿉 ?좉? 諛⑹떇?쇰줈 耳쒓퀬 ?????덈뒗 ?ㅼ떆媛??곗씠???덉씠?대뱾??愿由ы빀?덈떎.
//   - ?렏 CCTV ?덉씠?? 寃쎌같泥?ITS ?ㅼ떆媛?援먰넻 CCTV ?꾩튂 諛??곸긽 ?ㅽ듃由?//   - ?슚 援먰넻?ш퀬 ?덉씠?? ?꾨줈援먰넻怨듬떒 ?ㅼ떆媛??뚮컻援먰넻?뺣낫 API ?곕룞
//   - ?쎍 怨듭쑀 PM ?덉씠?? 怨듭쑀 ?λ낫???꾨룞???꾩튂 (?쒕??덉씠??湲곕컲)
//   - ??二쇱쑀???덉씠?? ?쒓뎅?앹쑀怨듭궗 ?ㅽ뵾???ㅼ떆媛??좉? API ?곕룞
//   - 媛??덉씠?대뒗 MarkerCluster ?뚮윭洹몄씤?쇰줈 諛吏?吏???먮룞 ?대윭?ㅽ꽣留?//
// [?섏〈 愿怨?
//   - config.js ??API ?? ?꾨줉??URL 李몄“
//   - map-init.js ??window.map ?꾩뿭 吏??媛앹껜 李몄“
//
// [?ъ슜???몃? API]
//   - 援??援먰넻?뺣낫?쇳꽣(ITS) CCTV API
//   - ?꾨줈援먰넻怨듬떒 ?ㅼ떆媛??뚮컻援먰넻?뺣낫 API
//   - ?쒓뎅?앹쑀怨듭궗 ?ㅽ뵾???좉? API
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

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??// ?쎇截?湲덉삤怨듬? ?뺤궗?곸긽 ?덉씠??(?쒕줎 怨좏빐?곷룄 ??났?ъ쭊)
//   - ?곗씠??寃쎈줈: ?숆탳吏??GUMI-KUMHO/2. ?뺤궗?곸긽/
//   - ?ы듃 8765 濡쒖뺄 ?쒕쾭 ?꾩슂 (start-gis-servers.bat ?ㅽ뻾)
//   - ???援ъ“: EPSG:4326 TMS (GDAL2Tiles 吏由ъ쥖?쒓퀎 異쒕젰)
//   - 以뚮퀎 ????? x = 2^(z+1), y = 2^z, TMS諛⑹떇(y=0???⑥そ)
//   - ?곗씠??踰붿쐞: lat=35.99~36.32, lon=128.21~128.58
//   - ?꾩껜 以묒떖: lat=36.156, lon=128.397 (湲덉삤怨듬?)
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??window.orthophotoLayer = null;
window.isOrthophotoOn = false;

// WebMercator ??쇱쥖??z,x,y) ??EPSG:4326 TMS ??쇱쥖??蹂??// Leaflet? WebMercator XYZ濡??붿껌?섎?濡??꾧꼍?꾨? 嫄곗퀜 4326 TMS ??쇰줈 ??궛
window._wmTile2geo4326Tms = function(z, wx, wy) {
    // WebMercator XYZ ???꾧꼍??(???以묒떖??
    var n = Math.pow(2, z);
    var lon = (wx + 0.5) / n * 360.0 - 180.0;
    var latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (wy + 0.5) / n)));
    var lat = latRad * 180.0 / Math.PI;

    // EPSG:4326 TMS ????몃뜳??怨꾩궛
    var xTiles = Math.pow(2, z + 1);  // 4326: 以뚮떦 x?????= 2^(z+1)
    var yTiles = Math.pow(2, z);       // 4326: 以뚮떦 y?????= 2^z
    var tx = Math.floor((lon + 180.0) / 360.0 * xTiles);
    var ty = Math.floor((lat + 90.0) / 180.0 * yTiles);  // TMS: y=0???⑥そ
    return { z: z, x: tx, y: ty };
};

// 而ㅼ뒪? TileLayer: WebMercator ?붿껌??4326 TMS濡?蹂??window.Ortho4326TmsLayer = L.TileLayer.extend({
    getTileUrl: function(coords) {
        var t = window._wmTile2geo4326Tms(coords.z, coords.x, coords.y);
        return window.location.protocol + '//' + window.location.hostname + ':8765/' + t.z + '/' + t.x + '/' + t.y + '.jpg';
    }
});

window.initOrthophotoLayer = function() {
    if (window.orthophotoLayer) return;
    window.orthophotoLayer = new window.Ortho4326TmsLayer(null, {
        maxZoom: 17,
        maxNativeZoom: 16,   // Z=17 ??쇱씠 遺덉셿????Z=16?쇰줈 ?ㅼ??쇱뾽
        minZoom: 13,
        opacity: 0.92,
        attribution: '짤 湲덉삤怨듦낵??숆탳 ?쒕줎 ?뺤궗?곸긽 (EPSG:4326 TMS, 2024)',
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
        if (window.showToast) window.showToast('?벝 ?쒕줎 ?뺤궗?곸긽 ?덉씠???쒖꽦??(EPSG:4326 TMS)');
    } else {
        if (window.orthophotoLayer && window.map.hasLayer(window.orthophotoLayer)) {
            window.map.removeLayer(window.orthophotoLayer);
        }
        window.isOrthophotoOn = false;
        var cb = document.getElementById('layer-orthophoto');
        if (cb) cb.checked = false;
    }
};

// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??// ?뱪 DEM 怨좊룄 ?덉씠??(?섏튂?쒓퀬紐⑤뜽, 寃쎌궗??遺꾩꽍??
//   - ?ы듃 8767 濡쒖뺄 ?쒕쾭 ?꾩슂
// ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??window.demLayer = null;
window.isDemOn = false;
window.slopeHeatLayer = null;

window.initDemLayer = function() {
    if (window.demLayer) return;
    window.demLayer = L.tileLayer(window.location.protocol + '//' + window.location.hostname + ':8767/{z}/{x}/{y}.png', {
        maxZoom: 17,
        minZoom: 13,
        tms: false,
        opacity: 0.5,
        crossOrigin: true,
        errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    });
};

// DEM ????쎌??먯꽌 怨좊룄媛?異붿텧 (Mapbox Terrain RGB 諛⑹떇 ?곗꽑 ?쒕룄)
window.getElevationAt = async function(lat, lon, zoom) {
    zoom = zoom || 15;
    var n = Math.pow(2, zoom);
    var x = Math.floor((lon + 180) / 360 * n);
    var y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
    var url = window.location.protocol + '//' + window.location.hostname + ':8767/' + zoom + '/' + x + '/' + y + '.png';

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

// 嫄곕━ 湲곕컲 寃뱀묠 諛⑹? ?꾪꽣留??⑥닔 (??40m ?댁뿉 寃뱀튂???μ냼???섎굹濡?臾띔퀬 ?꾩쟻 媛?닔 諭껋? ?쒓린)
window.filterPoisForOverlap = function(items, latKey, lngKey) {
    var filtered = [];
    var threshold = 0.00035; // ??35~40m 媛꾧꺽???꾧퀎移?    
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
                children: [] // 寃뱀튂???섏쐞 ??ぉ??            });
        }
    });
    return filtered;
};

// 湲몄갼湲??숈꽑 湲곗? 400m ?대궡 ?몄젒 留덉빱 ?щ? 怨꾩궛 諛??щ챸???띾뱷 ?⑥닔
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

// CCTV ?덉씠???좉?
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

// ?뚮컻?곹솴 ?덉씠???좉?
window.toggleEventLayer = function(show) {
    window.isEventLayerOn = show;
    if (show) {
        window.fetchAndRenderEvent();
    } else {
        window.eventMarkers.forEach(m => m.remove());
        window.eventMarkers = [];
    }
};

// ?ㅼ떆媛?CCTV ?뚮뜑留?window.fetchAndRenderCctv = function() {
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
        var type = url.indexOf('type=its') !== -1 ? 'ITS 援?룄' : 'EX 怨좎냽?꾨줈';
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
                            html: `<div style="font-size:18px; text-shadow:0 0 3px white; cursor:pointer;" title="${item.cctvname}">?벞</div>`,
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
                            <b style="font-size:14px; color:#1e293b; display:block; margin-bottom:4px;">?벞 ?ㅼ떆媛?CCTV [${item.cctvname}]</b>
                            <div style="margin-top:8px; background:#000; border-radius:8px; overflow:hidden; position:relative; padding-top:56.25%;">
                                <video id="${videoId}" data-src="${proxyCctvUrl}" controls autoplay muted playsinline style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:contain;"></video>
                            </div>
                            <div style="margin-top:6px; text-align:right;">
                                <a href="${secureCctvUrl}" target="_blank" style="font-size:11px; color:#2563eb; text-decoration:underline; font-weight:700;">?몃? ?뚮젅?댁뼱濡?蹂닿린 ??/a>
                            </div>
                        </div>`;
                        
                        marker.bindPopup(popupContent, { maxWidth: 300 });
                        
                        marker.on('popupopen', function() {
                            var videoEl = document.getElementById(videoId);
                            if (videoEl) {
                                var streamUrl = videoEl.getAttribute('data-src');
                                if (typeof Hls !== 'undefined' && Hls.isSupported() && (streamUrl.indexOf('.m3u8') !== -1 || streamUrl.indexOf('cctv') !== -1)) {
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
                window.ErrorHandler.handle(err, `${type} CCTV 濡쒕뱶`, window.ErrorHandler.LEVEL.TOAST);
            } else {
                console.warn("CCTV API 濡쒕뱶 ?ㅽ뙣:", err);
            }
        });
    });
};

// ?ㅼ떆媛??꾨줈 ?뚮컻?곹솴 ?뚮뜑留?window.fetchAndRenderEvent = function() {
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
                    
                    var emoji = "?좑툘";
                    var type = item.eventtype || "";
                    if (type.indexOf("怨듭궗") !== -1 || type.indexOf("?슙") !== -1) emoji = "?슙";
                    else if (type.indexOf("?ш퀬") !== -1) emoji = "?뮙";
                    else if (type.indexOf("?듭젣") !== -1 || type.indexOf("?먯뇙") !== -1) emoji = "?슟";
                    else if (type.indexOf("?됱궗") !== -1 || type.indexOf("異뺤젣") !== -1) emoji = "?럦";
                    
                    var icon = L.divIcon({
                        html: `<div style="font-size:20px; text-shadow:0 0 3px white; cursor:pointer;" title="${item.eventdescription}">${emoji}</div>`,
                        className: 'its-event-icon',
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    });
                    
                    var marker = L.marker([lat, lng], { icon: icon }).addTo(window.eventLayerGroup);
                    
                    var popupContent = `
                    <div style="font-family:'Noto Sans KR',sans-serif; padding:5px; width:240px; line-height:1.4;">
                        <b style="font-size:14px; color:#dc2626; display:block; margin-bottom:4px;">?슚 ?꾨줈 ?뚮컻?곹솴 [${item.eventtype || "湲고?"}]</b>
                        <span style="font-size:11px; color:#64748b; display:block; margin-bottom:4px;"><b>?곸꽭援щ텇:</b> ${item.eventdetailtype || "?뺣낫 ?놁쓬"}</span>
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
            window.ErrorHandler.handle(err, 'ITS ?뚮컻?곹솴 議고쉶', window.ErrorHandler.LEVEL.TOAST);
        } else {
            console.warn("?뚮컻?곹솴 API 濡쒕뱶 ?ㅽ뙣:", err);
        }
    });
};

// ?ㅽ겕紐⑤뱶 ?좉?
window.toggleDarkMode = function() {
    var layers = window._mapLayers;
    if (!layers) return;
    var isDark = document.body.classList.contains('dark-theme');
    if (isDark) {
        document.body.classList.remove('dark-theme');
        localStorage.setItem('gumap_dark_theme', 'false');
        var toggle = document.getElementById('dark-mode-toggle');
        if (toggle) { toggle.textContent = '?뙔'; toggle.title = '?ㅽ겕紐⑤뱶 ?꾪솚'; }
        if (window.map) {
            window.map.removeLayer(layers.darkLayer);
            window.map.addLayer(window._lastActiveBaseLayer || layers.baseLayer);
        }
    } else {
        document.body.classList.add('dark-theme');
        localStorage.setItem('gumap_dark_theme', 'true');
        var toggle = document.getElementById('dark-mode-toggle');
        if (toggle) { toggle.textContent = '?截?; toggle.title = '?쇱씠?몃え???꾪솚'; }
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

// ?ㅼ떆媛?援먰넻 ?쇱옟???덉씠???좉?
window.toggleTrafficLayer = function(show) {
    if (show) {
        if (!window.trafficLayer) {
            window.trafficLayer = L.tileLayer('https://its.go.kr:9443/geoserver/gwc/service/wmts/rest/ntic:N_LEVEL_11/ntic:REALTIME/EPSG:3857/EPSG:3857:{z}/{y}/{x}?format=image/png8', {
                maxZoom: 19, minZoom: 6, opacity: 0.7, attribution: 'ITS ?ㅼ떆媛?援먰넻?뺣낫'
            });
        }
        window.trafficLayer.addTo(window.map);
    } else {
        if (window.trafficLayer) window.map.removeLayer(window.trafficLayer);
    }
};

window.sharedPmRenderToken = window.sharedPmRenderToken || 0;

// 怨듭쑀 ?쇱뒪?먮え鍮뚮━???덉씠???좉?
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
                    var type = pm.pmType || '?λ낫??;
                    var emoji = type.indexOf('?먯쟾嫄?) >= 0 ? '?슩' : '?쎍';
                    var battery = pm.battery ? pm.battery + '%' : '?';
                    var company = pm.companyNm || pm.company || '';
                    var icon = L.divIcon({
                        html: '<div style="font-size:22px; text-shadow:0 0 4px white; cursor:pointer;" title="' + company + ' ' + type + '">' + emoji + '</div>',
                        className: 'shared-pm-icon', iconSize: [24, 24], iconAnchor: [12, 12]
                    });
                    var marker = L.marker([lat, lng], { icon: icon }).addTo(window.sharedPmLayerGroup);
                    marker.bindPopup('<div style="font-family:Noto Sans KR,sans-serif; min-width:120px;"><b>' + emoji + ' ' + type + '</b><br><span style="font-size:11px; color:#64748b;">' + company + '</span><br>?뵅 諛고꽣由? <b>' + battery + '</b><div style="display:flex; justify-content:flex-end; gap:6px; margin-top:5px;"><a href="javascript:void(0)" onclick="window.addFavorite(\'' + company.replace(/'/g, "\\'") + ' ' + type + '\', ' + lat + ', ' + lng + ', \'\')" style="font-size:11px; color:#92400e; text-decoration:underline; font-weight:600; cursor:pointer;">狩?利먭꺼李얘린</a></div></div>');
                    window.sharedPmMarkers.push(marker);
                });
                var infoBar = document.getElementById('clicked-info');
                if (infoBar) infoBar.innerHTML = '?쎍 怨듭쑀 紐⑤퉴由ы떚 ' + items.length + '? 諛쒓껄!';
            } else {
                var infoBar = document.getElementById('clicked-info');
                if (infoBar) infoBar.innerHTML = '?쎍 ?꾩옱 援щ???怨듭쑀 紐⑤퉴由ы떚 API ?곗씠?곌? 0嫄댁엯?덈떎. (?뚯뒪?몄슜 媛???곗씠???쒖떆)';
                var center = window.map.getCenter();
                for (var i=0; i<15; i++) {
                    var lat = center.lat + (Math.random() - 0.5) * 0.04;
                    var lng = center.lng + (Math.random() - 0.5) * 0.04;
                    var type = Math.random() > 0.5 ? '?먯쟾嫄? : '?λ낫??;
                    var emoji = type === '?먯쟾嫄? ? '?슩' : '?쎍';
                    var company = type === '?먯쟾嫄? ? '吏諛붿씠?? : '?쎌뵿';
                    var battery = Math.floor(Math.random() * 100) + '%';
                    var icon = L.divIcon({
                        html: '<div style="font-size:22px; text-shadow:0 0 4px white; cursor:pointer;" title="' + company + ' ' + type + '">' + emoji + '</div>',
                        className: 'shared-pm-icon', iconSize: [24, 24], iconAnchor: [12, 12]
                    });
                    var marker = L.marker([lat, lng], { icon: icon }).addTo(window.sharedPmLayerGroup);
                    marker.bindPopup('<div style="font-family:Noto Sans KR,sans-serif; min-width:120px;"><b>' + emoji + ' ' + type + ' (媛??</b><br><span style="font-size:11px; color:#64748b;">' + company + '</span><br>?뵅 諛고꽣由? <b>' + battery + '</b><div style="display:flex; justify-content:flex-end; gap:6px; margin-top:5px;"><a href="javascript:void(0)" onclick="window.addFavorite(\'' + company.replace(/'/g, "\\'") + ' ' + type + '\', ' + lat + ', ' + lng + ', \'\')" style="font-size:11px; color:#92400e; text-decoration:underline; font-weight:600; cursor:pointer;">狩?利먭꺼李얘린</a></div></div>');
                    window.sharedPmMarkers.push(marker);
                }
            }
        })
        .catch(function(err) {
            if (window.ErrorHandler) {
                window.ErrorHandler.handle(err, '怨듭쑀紐⑤퉴由ы떚 議고쉶', window.ErrorHandler.LEVEL.TOAST);
            } else {
                console.error('怨듭쑀PM 議고쉶 ?ㅽ뙣:', err);
            }
        });
    } else {
        window.sharedPmMarkers.forEach(function(m) { m.remove(); });
        window.sharedPmMarkers = [];
    }
};

// ?ㅽ뵾??Opinet) 二쇱쑀??寃??諛??좉? ?쒖떆
window.searchOpinetGasStations = function(center, options = {}) {
    if (typeof proj4 === 'undefined') {
        console.error("Proj4js library not loaded.");
        var infoBar = document.getElementById('clicked-info');
        if (infoBar) infoBar.innerHTML = `?슚 Proj4js ?쇱씠釉뚮윭由ш? 濡쒕뱶?섏? ?딆븘 二쇱쑀??寃?됱쓣 ?섑뻾?????놁뒿?덈떎.`;
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
    if (infoBar) infoBar.innerHTML = `??二쇰? 3km ??二쇱쑀?뚮? 寃??以묒엯?덈떎...`;

    fetchWithRetry(url, {}, window.GUMAP_CONSTANTS.API.MAX_RETRIES)
    .then(data => {
        if (window.currentCategorySearch !== '二쇱쑀??) return;
        
        if (data.RESULT && data.RESULT.OIL) {
            var stations = data.RESULT.OIL;
            if (!Array.isArray(stations)) stations = [stations];
            
            if (stations.length === 0) {
                if (infoBar) infoBar.innerHTML = `??諛섍꼍 3km ?댁뿉 <b>二쇱쑀??/b> 寃??寃곌낵媛 ?놁뒿?덈떎. (?ㅽ뵾???몄쬆 ?쒗븳 ?먮뒗 ?곗씠???놁쓬)`;
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
                var displayPrice = rawPrice > 0 ? (rawPrice.toLocaleString() + '??) : '媛寃⑹젙蹂댁뾾??;
                var stGlowColor = brandColor + '4d';

                var opacity = window.getMarkerOpacityByRoute(lat, lng);

                var badgeHtml = "";
                if (group.children.length > 0) {
                    badgeHtml = `<span style="background:#ef4444; color:white; font-size:9px; border-radius:4px; padding:1px 3px; margin-left:3px; font-weight:900; vertical-align:middle;">+${group.children.length}</span>`;
                }

                var iconHtml = `<div class="glass-capsule-marker" style="--marker-border-color:${brandColor}; --marker-glow-color:${stGlowColor}; opacity:${opacity};" title="${st.OS_NM}">??<span style="color:${brandColor}; font-weight:800;">${brandName}</span> <span style="margin:0 2px; opacity:0.3;">|</span> <span style="color:#ef4444; font-weight:800;">${displayPrice}</span>${badgeHtml}</div>`;
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
                            <b style="font-size:13px; color:#1e293b; vertical-align:middle;">??${DOMPurify.sanitize(item.OS_NM)}</b>
                            <div style="margin-top:2px;">${brandBadge}</div>
                        </div>
                        <div id="opinet-addr-${item.UNI_ID}" style="font-size:10px; color:#64748b; margin-bottom:6px;">??二쇱냼 濡쒕뵫 以?..</div>
                        <div style="font-size:12px; font-weight:bold; color:#1e293b; margin-bottom:8px;">
                            湲곕낯 ?섎컻?? <span style="font-size:14px; color:#ef4444;">${rPrice.toLocaleString()}??/span>
                            <span style="font-size:9px; color:#64748b; font-weight:normal;">(${parseInt(item.DISTANCE).toLocaleString()}m)</span>
                        </div>
                        <div id="opinet-detail-${item.UNI_ID}" style="font-size:11px; color:#475569; margin-bottom:4px;">???좉? ?곸꽭 ?뺣낫 濡쒕뵫 以?..</div>
                        <div style="display:flex; gap:4px; margin-top:8px; justify-content:flex-end;">
                            <button onclick="window.addFavorite('${safeName}', ${itemLat}, ${itemLng}, '${safeBrand} 二쇱쑀??); window.map.closePopup();" style="padding:3px 6px; font-size:10px; background:#ca8a04; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">狩?利먭꺼李얘린</button>
                            <button onclick="setRoutingPoint('START', ${itemLat}, ${itemLng}, '${safeName}'); window.map.closePopup();" style="padding:3px 6px; font-size:10px; background:#3b82f6; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">異쒕컻</button>
                            <button onclick="setRoutingPoint('END', ${itemLat}, ${itemLng}, '${safeName}'); window.map.closePopup();" style="padding:3px 6px; font-size:10px; background:#ef4444; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">?꾩갑</button>
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
                    var displayPrice = parseInt(cheapestStation.PRICE).toLocaleString() + '??;
                    var refPoint = (window.userLocation && window.userLocation.lat) ? window.userLocation : window.map.getCenter();
                    var dist = (typeof window.getLatLngDistance === 'function') ? window.getLatLngDistance(refPoint.lat, refPoint.lng, cheapestStation.stLat, cheapestStation.stLng) : 9999;

                    if (window.appendChatMessage) {
                        window.appendChatMessage("ai", `?쨼 援щ????ㅼ떆媛??좉? 鍮꾧탳 寃곌낵, 媛????댄븳 二쇱쑀?뚮뒗 **${bName} ${cheapestStation.OS_NM}** (?섎컻??理쒖?媛: **${displayPrice}**) ?낅땲?? (???꾩튂 湲곗? ??${Math.round(dist)}m)`);
                    }
                }
            }
            
            if (infoBar) infoBar.innerHTML = `????二쇰? 3km 諛섍꼍 ??<b>二쇱쑀??(${stations.length}怨?</b>??瑜? 李얠븯?듬땲??`;
        } else {
            if (infoBar) infoBar.innerHTML = `??諛섍꼍 3km ?댁뿉 <b>二쇱쑀??/b> 寃??寃곌낵媛 ?놁뒿?덈떎.`;
        }
    })
    .catch(err => {
        if (window.ErrorHandler) {
            window.ErrorHandler.handle(err, '?ㅽ뵾??二쇱쑀??寃??, window.ErrorHandler.LEVEL.TOAST);
        } else {
            console.error("Opinet 二쇱쑀??寃???ㅽ뙣:", err);
            if (infoBar) infoBar.innerHTML = `?슚 ?ㅽ뵾??API ?몄텧???ㅽ뙣?덉뒿?덈떎. (API ??IP ?깅줉 ?곹깭 ?뺤씤 ?꾩슂)`;
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
                var addressText = stInfo.NEW_ADR || stInfo.VAN_ADR || "二쇱냼 ?뺣낫 ?놁쓬";
                addrEl.textContent = addressText;
            }
            
            var priceList = stInfo.OIL_PRICE;
            if (!Array.isArray(priceList)) priceList = [priceList];
            
            var tableHtml = `<table style="width:100%; border-collapse:collapse; text-align:center; font-size:11px; margin-top:4px;">
                <thead>
                    <tr style="background:#f1f5f9; border-bottom:1px solid #cbd5e1;">
                        <th style="padding:4px; font-weight:700;">?좎쥌</th>
                        <th style="padding:4px; font-weight:700;">媛寃?/th>
                    </tr>
                </thead>
                <tbody>`;
            
            var productNames = {
                'B027': '?섎컻??,
                'D047': '寃쎌쑀',
                'B034': '怨좉툒?섎컻??,
                'K015': 'LPG'
            };
            
            var rowsAdded = 0;
            priceList.forEach(p => {
                var name = productNames[p.PRODCD] || p.PRODCD;
                var price = parseInt(p.PRICE);
                if (price > 0) {
                    tableHtml += `<tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:4px; color:#475569;">${name}</td>
                        <td style="padding:4px; font-weight:700; color:#1e293b;">${price.toLocaleString()}??/td>
                    </tr>`;
                    rowsAdded++;
                }
            });
            
            tableHtml += `</tbody></table>`;
            
            if (rowsAdded === 0) {
                container.innerHTML = `<span style="color:#ef4444;">???깅줉???좉? 媛寃??뺣낫 ?놁쓬</span>`;
            } else {
                container.innerHTML = DOMPurify.sanitize(tableHtml, window.DOM_PURIFY_CONFIG);
            }
            container.dataset.loaded = 'true';
        } else {
            container.innerHTML = `<span style="color:#ef4444;">???몃? ?좉?瑜?議고쉶?????놁뒿?덈떎.</span>`;
        }
    })
    .catch(err => {
        if (window.ErrorHandler) {
            window.ErrorHandler.handle(err, '?ㅽ뵾??二쇱쑀???곸꽭 媛寃?議고쉶', window.ErrorHandler.LEVEL.TOAST);
        } else {
            console.error("?ㅽ뵾??二쇱쑀???곸꽭 媛寃?濡쒕뱶 ?먮윭:", err);
            container.innerHTML = `<span style="color:#ef4444;">?슚 ?좉? ?뺣낫 ?곸꽭 濡쒕뱶 ?ㅽ뙣</span>`;
        }
    });
};

function getOpinetBrandName(code) {
    var brands = {
        'SKE': 'SK?먮꼫吏',
        'GSC': 'GS移쇳뀓??,
        'HDO': '?꾨??ㅼ씪諭낇겕',
        'SOL': 'S-OIL',
        'RTE': '?뚮쑑二쇱쑀??,
        'RTX': '怨좎냽?꾨줈?뚮쑑',
        'NHO': '?랁삊?뚮쑑',
        'E1G': 'E1',
        'SKG': 'SK媛??
    };
    return brands[code] || '二쇱쑀??;
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
