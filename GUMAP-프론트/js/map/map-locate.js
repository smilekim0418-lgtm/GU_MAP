// ============================================================
// 📁 파일명: map-locate.js
// 📌 역할: 내 위치(GPS) 표시와 공유
// ============================================================
//
// 지도 오른쪽 아래(확대 버튼 위)에 ◎ 버튼을 둔다. 누르면 브라우저 위치 권한을
// 받아 파란 점과 오차 원을 그리고, 위치가 바뀔 때마다 따라 움직인다.
//
// 다른 모듈은 window.userLocation({lat, lng, accuracy, time})을 읽거나,
// 위치가 꼭 필요할 때 window.getUserLocation()(Promise)을 부른다.
// 예전에는 userLocation 을 읽는 곳만 있고 채우는 곳이 없어서 "내 위치에서 ○○
// 가는 길"은 늘 실패했고, "가장 가까운 ○○"은 지도 중심을 기준으로 찾았다.
//
// 위치 API 는 HTTPS 주소(터널)나 localhost, 설치한 앱에서만 동작한다.
// 같은 와이파이에서 http://192.168.x.x:3000 으로 열면 브라우저가 막는다.
// ============================================================

(function () {
    var FRESH_MS = 60000;            // 이 시간 안의 위치는 다시 묻지 않고 쓴다
    var watchId = null;
    var waiters = [];
    var marker = null;
    var accuracyCircle = null;
    var centerOnNextFix = false;

    window.userLocation = window.userLocation || null;

    function errorMessage(error) {
        if (!error) return '위치를 가져오지 못했습니다.';
        if (error.code === 1) return '위치 권한이 거부되었습니다. 브라우저 주소창의 자물쇠 아이콘에서 위치를 허용해 주세요.';
        if (error.code === 2) return '현재 위치를 확인할 수 없습니다. 실외나 창가에서 다시 시도해 주세요.';
        if (error.code === 3) return '위치 확인이 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요.';
        return error.message || '위치를 가져오지 못했습니다.';
    }

    function settleWaiters(error, location) {
        var pending = waiters;
        waiters = [];
        pending.forEach(function (waiter) {
            clearTimeout(waiter.timer);
            if (error) waiter.reject(error); else waiter.resolve(location);
        });
    }

    function popupHtml(location) {
        return '<div style="font-size:12px; line-height:1.6; min-width:150px;">' +
            '<b>📍 내 위치</b><br>' +
            '<span style="font-size:11px; color:var(--text-muted);">오차 약 ' + Math.round(location.accuracy) + 'm</span><br>' +
            '<button onclick="window.useMyLocationAsStart()" style="margin-top:6px; width:100%; padding:6px; font-size:11px; ' +
            'background:#3b82f6; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:700;">🛫 여기를 출발지로</button>' +
            '</div>';
    }

    function draw(location) {
        if (!window.map) return;
        var latlng = [location.lat, location.lng];
        if (!marker) {
            marker = L.marker(latlng, {
                icon: L.divIcon({ className: 'my-location-dot', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] }),
                zIndexOffset: 1500,
                keyboard: false
            }).addTo(window.map);
            accuracyCircle = L.circle(latlng, {
                radius: location.accuracy, color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.12,
                interactive: false
            }).addTo(window.map);
        } else {
            marker.setLatLng(latlng);
            accuracyCircle.setLatLng(latlng).setRadius(location.accuracy);
        }
        marker.bindPopup(popupHtml(location));
    }

    function onPosition(position) {
        var location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy || 0,
            time: Date.now()
        };
        window.userLocation = location;
        draw(location);
        if (centerOnNextFix && window.map) {
            centerOnNextFix = false;
            window.map.setView([location.lat, location.lng], Math.max(window.map.getZoom(), 17));
        }
        paintButton(true);
        settleWaiters(null, location);
    }

    function onError(error) {
        var message = errorMessage(error);
        if (error && error.code === 1) stopTracking();
        paintButton(false);
        settleWaiters(new Error(message));
    }

    function startTracking() {
        if (!navigator.geolocation) throw new Error('이 브라우저는 위치 기능을 지원하지 않습니다.');
        if (window.isSecureContext === false) {
            throw new Error('위치는 HTTPS 주소(외부 공유 주소)나 서버를 켠 PC에서만 쓸 수 있습니다.');
        }
        if (watchId === null) {
            watchId = navigator.geolocation.watchPosition(onPosition, onError,
                { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
        }
    }

    function stopTracking() {
        if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }

    /** 현재 위치를 돌려준다. 1분 안에 받은 위치가 있으면 그것을, 없으면 새로 받는다. */
    window.getUserLocation = function (timeoutMs) {
        var known = window.userLocation;
        if (known && Date.now() - known.time < FRESH_MS) return Promise.resolve(known);
        return new Promise(function (resolve, reject) {
            try {
                startTracking();
            } catch (error) {
                reject(error);
                return;
            }
            var waiter = { resolve: resolve, reject: reject };
            waiter.timer = setTimeout(function () {
                waiters = waiters.filter(function (w) { return w !== waiter; });
                reject(new Error(errorMessage({ code: 3 })));
            }, timeoutMs || 15000);
            waiters.push(waiter);
        });
    };

    /** 내 위치를 길찾기 출발지로 정한다. */
    window.useMyLocationAsStart = function () {
        return window.getUserLocation().then(function (location) {
            if (window.setRoutingPoint) window.setRoutingPoint('START', location.lat, location.lng, '내 위치');
            if (window.map) window.map.closePopup();
            return location;
        }).catch(function (error) {
            if (window.showToast) window.showToast('📍 ' + error.message);
            throw error;
        });
    };

    var button = null;

    function paintButton(active) {
        if (!button) return;
        button.classList.toggle('is-active', !!active);
        button.title = active ? '내 위치로 이동' : '내 위치 보기';
    }

    function onButtonClick(event) {
        L.DomEvent.stop(event);
        var known = window.userLocation;
        if (watchId !== null && known) {
            window.map.setView([known.lat, known.lng], Math.max(window.map.getZoom(), 17));
            return;
        }
        centerOnNextFix = true;
        button.classList.add('is-loading');
        window.getUserLocation(20000).catch(function (error) {
            centerOnNextFix = false;
            if (window.showToast) window.showToast('📍 ' + error.message);
        }).then(function () {
            button.classList.remove('is-loading');
        });
    }

    function addControl() {
        if (!window.map || !window.L) {
            setTimeout(addControl, 300);
            return;
        }
        var Control = L.Control.extend({
            options: { position: 'bottomright' },
            onAdd: function () {
                var bar = L.DomUtil.create('div', 'leaflet-bar my-location-control');
                button = L.DomUtil.create('a', '', bar);
                button.href = '#';
                button.setAttribute('role', 'button');
                button.setAttribute('aria-label', '내 위치 보기');
                button.title = '내 위치 보기';
                button.innerHTML = '◎';
                L.DomEvent.on(button, 'click', onButtonClick);
                L.DomEvent.disableClickPropagation(bar);
                return bar;
            }
        });
        new Control().addTo(window.map);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addControl);
    } else {
        addControl();
    }
})();
