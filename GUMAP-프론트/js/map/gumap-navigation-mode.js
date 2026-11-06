// ============================================================
// 📁 파일명: js/map/gumap-navigation-mode.js
// 📌 역할: 모바일 실시간 GPS 위치 추적 및 3D 주행 네비게이션 모드
// ============================================================
(function() {
    "use strict";

    window.gpsWatchId = null;
    window.isGpsNavActive = false;
    window.gpsNavMode = 'OFF'; // 'OFF' | 'TRACK' | 'DRIVE_3D'
    window.userGpsPosition = null;
    var userLocationMarker = null;

    // GPS 펄스 마커 DOM 생성
    function createUserMarkerElement() {
        var el = document.createElement('div');
        el.className = 'gumap-user-gps-pin';
        el.style.cssText = 'position:relative; width:26px; height:26px;';
        el.innerHTML = `
            <div style="position:absolute; width:100%; height:100%; border-radius:50%; background:rgba(37,99,235,0.25); animation:gumapGpsPulse 2s infinite ease-out;"></div>
            <div style="position:absolute; top:4px; left:4px; width:18px; height:18px; border-radius:50%; background:#2563eb; border:3px solid #ffffff; box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>
            <div id="gps-heading-pointer" style="position:absolute; top:-6px; left:9px; width:0; height:0; border-left:4px solid transparent; border-right:4px solid transparent; border-bottom:8px solid #1d4ed8; display:none;"></div>
        `;
        return el;
    }

    // 주행 HUD 배너 생성
    function getOrCreateNavHud() {
        var hud = document.getElementById('gumap-nav-hud');
        if (!hud) {
            hud = document.createElement('div');
            hud.id = 'gumap-nav-hud';
            hud.style.cssText = 'position:absolute; top:20px; left:50%; transform:translateX(-50%); z-index:1150; display:none; min-width:280px; max-width:90%; padding:12px 20px; border-radius:16px; background:rgba(15,23,42,0.92); backdrop-filter:blur(16px); color:#ffffff; font-family:-apple-system,BlinkMacSystemFont,sans-serif; box-shadow:0 8px 32px rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.15); transition:all 0.3s ease;';
            document.body.appendChild(hud);
        }
        return hud;
    }

    // GPS 모드 토글 (OFF -> TRACK -> DRIVE_3D -> OFF)
    window.toggleGpsNavigation = function() {
        var btn = document.getElementById('gps-nav-toggle-btn');
        if (!navigator.geolocation) {
            alert('이 브라우저는 실시간 GPS 위치 서비스를 지원하지 않습니다.');
            return;
        }

        if (window.gpsNavMode === 'OFF') {
            window.gpsNavMode = 'TRACK';
            if (btn) {
                btn.classList.add('active');
                btn.innerHTML = '<svg class="dock-icon-svg icon-pin" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>';
                btn.title = 'GPS 내 위치 추적 중 (클릭 시 3D 주행)';
            }
            startGpsTracking();
        } else if (window.gpsNavMode === 'TRACK') {
            window.gpsNavMode = 'DRIVE_3D';
            if (btn) {
                btn.classList.add('active');
                btn.innerHTML = '<svg class="dock-icon-svg icon-compass" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor"></polygon></svg>';
                btn.title = '3D 주행 내비게이션 모드 (클릭 시 종료)';
            }
            applyDrive3DView();
        } else {
            window.gpsNavMode = 'OFF';
            if (btn) {
                btn.classList.remove('active');
                btn.innerHTML = '<svg class="dock-icon-svg icon-crosshair" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="22" y1="12" x2="18" y2="12"></line><line x1="6" y1="12" x2="2" y2="12"></line><line x1="12" y1="6" x2="12" y2="2"></line><line x1="12" y1="22" x2="12" y2="18"></line><circle cx="12" cy="12" r="2.5" fill="currentColor"></circle></svg>';
                btn.title = '내 위치 및 3D 네비게이션';
            }
            stopGpsTracking();
        }
    };

    function startGpsTracking() {
        if (window.gpsWatchId) return;

        window.gpsWatchId = navigator.geolocation.watchPosition(
            function(pos) {
                var lat = pos.coords.latitude;
                var lng = pos.coords.longitude;
                var heading = pos.coords.heading || 0;
                var speed = pos.coords.speed ? (pos.coords.speed * 3.6).toFixed(0) : 0;

                window.userGpsPosition = { lat: lat, lng: lng, heading: heading, speed: speed };
                window.userLocation = { lat: lat, lng: lng };

                updateUserMarker(lat, lng, heading);

                if (window.gumapWebGLMap) {
                    if (window.gpsNavMode === 'DRIVE_3D') {
                        window.gumapWebGLMap.easeTo({
                            center: [lng, lat],
                            zoom: 17.5,
                            pitch: 55,
                            bearing: heading,
                            duration: 800
                        });
                    } else if (window.gpsNavMode === 'TRACK') {
                        window.gumapWebGLMap.easeTo({
                            center: [lng, lat],
                            zoom: 16.5,
                            duration: 600
                        });
                    }
                }

                updateNavHudContent(speed);
            },
            function(err) {
                console.warn('[GuMap GPS] 위치 조회 대기 또는 권한 확인:', err.message);
            },
            { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
        );
    }

    function applyDrive3DView() {
        var hud = getOrCreateNavHud();
        hud.style.display = 'flex';
        if (window.gumapWebGLMap && window.userGpsPosition) {
            window.gumapWebGLMap.flyTo({
                center: [window.userGpsPosition.lng, window.userGpsPosition.lat],
                zoom: 17.5,
                pitch: 55,
                bearing: window.userGpsPosition.heading || 0,
                duration: 1200
            });
        }
    }

    function stopGpsTracking() {
        if (window.gpsWatchId) {
            navigator.geolocation.clearWatch(window.gpsWatchId);
            window.gpsWatchId = null;
        }
        if (userLocationMarker) {
            userLocationMarker.remove();
            userLocationMarker = null;
        }
        var hud = document.getElementById('gumap-nav-hud');
        if (hud) hud.style.display = 'none';

        if (window.gumapWebGLMap) {
            window.gumapWebGLMap.easeTo({ pitch: 0, bearing: 0, duration: 800 });
        }
    }

    function updateUserMarker(lat, lng, heading) {
        if (!window.gumapWebGLMap) return;

        if (!userLocationMarker) {
            var el = createUserMarkerElement();
            userLocationMarker = new maplibregl.Marker({ element: el })
                .setLngLat([lng, lat])
                .addTo(window.gumapWebGLMap);
        } else {
            userLocationMarker.setLngLat([lng, lat]);
        }

        var pointer = document.getElementById('gps-heading-pointer');
        if (pointer) {
            if (heading) {
                pointer.style.display = 'block';
                pointer.style.transform = `rotate(${heading}deg)`;
            } else {
                pointer.style.display = 'none';
            }
        }
    }

    function updateNavHudContent(speed) {
        var hud = getOrCreateNavHud();
        if (window.gpsNavMode === 'OFF') {
            hud.style.display = 'none';
            return;
        }
        hud.style.display = 'flex';
        hud.innerHTML = `
            <div style="display:flex; align-items:center; gap:14px; width:100%;">
                <div style="font-size:24px;">🚗</div>
                <div style="flex:1;">
                    <div style="font-size:11px; color:#94a3b8; font-weight:600;">실시간 모바일 주행 안내</div>
                    <div style="font-size:15px; font-weight:800; color:#38bdf8;">경로 주행 중</div>
                </div>
                <div style="text-align:right;">
                    <span style="font-size:20px; font-weight:900; font-family:'Outfit',sans-serif; color:#22c55e;">${speed}</span>
                    <span style="font-size:10px; color:#94a3b8;">km/h</span>
                </div>
            </div>
        `;
    }

    // 스타일 주입
    var style = document.createElement('style');
    style.innerHTML = `
        @keyframes gumapGpsPulse {
            0% { transform: scale(0.95); opacity: 0.8; }
            70% { transform: scale(2.4); opacity: 0; }
            100% { transform: scale(2.4); opacity: 0; }
        }
    `;
    document.head.appendChild(style);

})();
