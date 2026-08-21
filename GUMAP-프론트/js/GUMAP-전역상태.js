// ============================================================
// 📁 파일명: store.js
// 📌 역할: 애플리케이션 중앙 상태(State) 관리 매니저
// ============================================================
//
// [파일 설명]
//   프론트엔드 전체의 상태(State)를 하나의 객체(AppState)로 통합 관리합니다.
//   React의 Redux, Vue의 Vuex와 유사한 역할을 바닐라 JS로 구현한 것입니다.
//   - 지도 줌/중심 좌표, 현재 모드(일반/연구/길찾기), 사이드바 열림 여부
//   - 선택된 노선 번호, 검색 기록, 즐겨찾기 목록 등을 통합 관리
//   - subscribe(listener) 패턴으로 상태 변경 시 UI 자동 갱신
//
// [의존 관계]
//   - config.js → 초기 좌표/줌 레벨을 GmapConfig에서 읽어옴
//   - 이 파일을 참조하는 파일: map-init.js, events.js 등
//
// [사용된 설계 패턴]
//   - 옵저버 패턴 (Observer Pattern) 기반 상태 구독
//   - 싱글턴 상태 저장소 (Singleton Store)
// ============================================================

(function() {
    const AppState = {
        state: {
            map: {
                zoom: (window.GmapConfig && window.GmapConfig.DEFAULT_ZOOM) || 15,
                center: { 
                    lat: (window.GmapConfig && window.GmapConfig.DEFAULT_LAT) || 36.1284, 
                    lng: (window.GmapConfig && window.GmapConfig.DEFAULT_LNG) || 128.3284 
                },
                isDarkMode: false
            },
            layers: {
                cctv: false,
                event: false,
                sharedPm: false,
                traffic: false
            },
            routing: {
                start: null,
                end: null,
                waypoint: null,
                mode: 'transit'
            },
            bus: {
                selectedRouteNo: null,
                activeBuses: {}
            }
        },
        listeners: {},
        
        /**
         * 특정 상태 키의 변경 이벤트를 감지할 리스너 콜백을 등록합니다.
         * @param {string} path - 상태 경로 (예: 'layers.cctv')
         * @param {function} callback - 변경 시 호출될 콜백 함수
         */
        on(path, callback) {
            if (!this.listeners[path]) {
                this.listeners[path] = [];
            }
            this.listeners[path].push(callback);
        },
        
        /**
         * 지정된 상태 경로의 값을 갱신하고, 값이 변경되었을 경우 등록된 모든 리스너를 실행합니다.
         * @param {string} path - 상태 경로 (예: 'layers.cctv')
         * @param {any} value - 새로 주입할 상태 값
         */
        set(path, value) {
            const keys = path.split('.');
            let current = this.state;
            for (let i = 0; i < keys.length - 1; i++) {
                if (!current[keys[i]]) {
                    current[keys[i]] = {};
                }
                current = current[keys[i]];
            }
            const lastKey = keys[keys.length - 1];
            if (current[lastKey] !== value) {
                current[lastKey] = value;
                if (this.listeners[path]) {
                    this.listeners[path].forEach(cb => {
                        try { cb(value); } catch(e) { console.error("Error in AppState listener for " + path, e); }
                    });
                }
            }
        },
        
        /**
         * 지정된 상태 경로의 현재 값을 조회하여 반환합니다.
         * @param {string} path - 상태 경로 (예: 'layers.cctv')
         * @returns {any} 조회된 상태 값
         */
        get(path) {
            return path.split('.').reduce((obj, key) => obj && obj[key], this.state);
        }
    };

    window.AppState = AppState;

    // 하위 호환성 연결 레이어: 기존 전역 변수를 AppState의 Getter/Setter로 매핑
    Object.defineProperty(window, 'isCctvLayerOn', {
        get() { return AppState.get('layers.cctv'); },
        set(val) { AppState.set('layers.cctv', val); },
        configurable: true
    });

    Object.defineProperty(window, 'isEventLayerOn', {
        get() { return AppState.get('layers.event'); },
        set(val) { AppState.set('layers.event', val); },
        configurable: true
    });

    Object.defineProperty(window, 'isSharedPmLayerOn', {
        get() { return AppState.get('layers.sharedPm'); },
        set(val) { AppState.set('layers.sharedPm', val); },
        configurable: true
    });

    // AppState 변경 시 실제 레이어 토글 함수 호출 동기화 (무한 루프는 set()의 값 비교로 안전하게 단절됨)
    AppState.on('layers.cctv', function(show) {
        if (typeof window.toggleCctvLayer === 'function') {
            window.toggleCctvLayer(show);
        }
    });

    AppState.on('layers.event', function(show) {
        if (typeof window.toggleEventLayer === 'function') {
            window.toggleEventLayer(show);
        }
    });

    AppState.on('layers.sharedPm', function(show) {
        if (typeof window.toggleSharedPmLayer === 'function') {
            window.toggleSharedPmLayer(show);
        }
    });

    AppState.on('layers.traffic', function(show) {
        if (typeof window.toggleTrafficLayer === 'function') {
            window.toggleTrafficLayer(show);
        }
    });
})();
