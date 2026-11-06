// ============================================================
// 📁 파일명: config.js
// 📌 역할: 애플리케이션 전역 설정 및 API 키 관리 모듈
// ============================================================
//
// [파일 설명]
//   이 파일은 G-map 애플리케이션의 모든 설정값을 중앙 집중적으로 관리합니다.
//   - 외부 API 키 (T-map, 공공데이터포털 TAGO, VWorld, 행정안전부 주소 등)
//   - 지도 초기 중심 좌표 및 줌 레벨 (구미시 기준)
//   - 택시/버스 요금 체계, 시뮬레이션 파라미터 등 운영 상수
//   - Object.defineProperty 기반 양방향 바인딩으로 GmapConfig ↔ 전역변수 동기화
//   - localStorage를 통한 사용자 설정 영속화 (새로고침 후에도 설정 유지)
//
// [의존 관계]
//   - 의존하는 파일: 없음 (최초 로드되는 설정 파일)
//   - 이 파일을 참조하는 파일: store.js, map-init.js, routing.js, bus_tracker.js 등 전체
//
// [사용된 설계 패턴]
//   - 중앙 집중식 설정 관리 (Centralized Configuration)
//   - Object.defineProperty 기반 반응형 바인딩 (Reactive Binding)
// ============================================================

// API 키 (let 선언으로 변경하여 로컬스토리지에서 덮어쓰기 허용)
let TMAP_API_KEY = "";
let TAGO_KEY = "";
let VWORLD_KEY = "AAF4B8AC-2D2D-32DE-9F35-03889EA6D0BD";
let JUSO_KEY = "";
let JUSO_COORD_KEY = "";
let ODSAY_KEY = "";
let ITS_KEY = "";
let GEMINI_API_KEY = "";
let OPINET_KEY = "";

// window 객체 바인딩 (fetch interceptor 등에서의 일관된 참조를 위해 설정)
window.TMAP_API_KEY = TMAP_API_KEY;
window.TAGO_KEY = TAGO_KEY;
window.VWORLD_KEY = VWORLD_KEY;
window.JUSO_KEY = JUSO_KEY;
window.JUSO_COORD_KEY = JUSO_COORD_KEY;
window.ODSAY_KEY = ODSAY_KEY;
window.ITS_KEY = ITS_KEY;
window.GEMINI_API_KEY = GEMINI_API_KEY;
window.OPINET_KEY = OPINET_KEY;

// Dynamic Proxy URL
window.PROXY_URL = "http://localhost:3000";
if (window.location.port === '3000' || 
    window.location.hostname.includes('trycloudflare.com') || 
    window.location.hostname.includes('cloudflare') || 
    window.location.hostname.includes('ngrok')) {
    window.PROXY_URL = "";
}

// ── Capacitor 모바일 웹뷰 및 로컬 서버 자동연결/스캔 시스템 ──
window.isMobileCapacitor = window.location.protocol.startsWith('capacitor') || 
                           (window.location.hostname === 'localhost' && !window.location.port);

// 백엔드 연결 상태 체크
window.checkServerAlive = function(url) {
    if (!url) return Promise.resolve(true); // relative path는 프록시 불필요(로컬/터널 서버가 직접 파일 서빙)
    var targetPath = url.endsWith('/') ? url : url + '/';
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, 1200);
    
    return fetch(targetPath, { 
        method: 'GET', 
        signal: controller.signal,
        redirect: 'manual', // 리다이렉트 자동 추적을 막아 file:// 또는 크로스오리진 환경에서의 CORS/로드 에러 방지
        headers: {
            'ngrok-skip-browser-warning': '69'
        }
    })
        .then(function(res) {
            clearTimeout(timeoutId);
            // res.status === 0은 redirect: 'manual'일 때의 opaque redirect를 뜻함
            return res.ok || res.status === 307 || res.status === 0 || res.status === 404;
        })
        .catch(function() {
            clearTimeout(timeoutId);
            return false;
        });
};

// 사설 IP 대역 오토 스캔 (배치 방식 및 조기 중단으로 최적화)
async function startLocalServerAutoScan() {
    var defaultUrl = window.PROXY_URL || "http://192.168.0.2:3000";
    var subnetMatch = defaultUrl.match(/https?:\/\/(\d+\.\d+\.\d+\.)\d+/);
    var subnets = [];
    if (subnetMatch) {
        subnets.push(subnetMatch[1]); // e.g. "192.168.0."
    }
    
    // 기본 백업 대역 (오토 스캔용)
    var fallbacks = [
        '192.168.0.',   // 기본 공유기 1 (iptime 등)
        '192.168.1.',   // 기본 공유기 2
        '172.30.1.',    // KT GiGA Wi-Fi
        '192.168.219.', // LGU+ 공유기
        '192.168.25.',  // SK Broadband 1
        '192.168.35.',  // SK Broadband 2
        '192.168.55.',  // SK Broadband 3
        '192.168.123.', // 사설 허브 / 기타 AP
        '10.0.0.'       // 대형 사설망
    ];
    
    // 현재 서브넷을 우선순위에 두고 나머지를 추가
    fallbacks.forEach(function(fb) {
        if (subnets.indexOf(fb) === -1) {
            subnets.push(fb);
        }
    });

    var ipCandidates = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 30, 50, 100, 101, 102, 103, 104, 105];
    
    // 스캔 후보 URL 생성
    var allUrls = [];
    subnets.forEach(function(subnet) {
        ipCandidates.forEach(function(num) {
            allUrls.push("http://" + subnet + num + ":3000");
        });
    });
    
    // 모바일 커넥션 큐 포화를 막기 위해 15개 단위 배치로 나누어 순차 스캔
    var batchSize = 15;
    var foundUrl = null;
    console.log("[MaaS AutoScan] 컴퓨터 서버 스캔 시작 (총 후보지:", allUrls.length, "개)");

    for (var i = 0; i < allUrls.length; i += batchSize) {
        var batch = allUrls.slice(i, i + batchSize);
        var promises = batch.map(function(targetIp) {
            return window.checkServerAlive(targetIp).then(function(alive) {
                if (alive) return targetIp;
                throw new Error("dead");
            });
        });
        
        try {
            foundUrl = await Promise.any(promises);
            if (foundUrl) {
                break; // 서버 발견 시 즉시 스캔 중단 (조기 중단)
            }
        } catch (e) {
            // 배치 실패 시 다음 배치로 이동
        }
    }
    
    if (foundUrl) {
        console.log("[MaaS AutoScan] 컴퓨터 서버 감지 성공:", foundUrl);
        window.PROXY_URL = foundUrl;
        
        // 설정 저장
        var saved = localStorage.getItem('gumap_developer_config');
        var config = {};
        if (saved) {
            try { config = JSON.parse(saved); } catch(e) { console.warn("[Config] Failed to parse developer config:", e); }
        }
        config.PROXY_URL = foundUrl;
        localStorage.setItem('gumap_developer_config', JSON.stringify(config));
        
        var notice = document.getElementById('clicked-info');
        if (notice) {
            notice.innerHTML = `🟢 컴퓨터 서버 연결 완료: <b>${foundUrl}</b>`;
        }
    } else {
        console.warn("[MaaS AutoScan] 와이파이 대역 내 컴퓨터 서버를 자동 감지하지 못했습니다.");
        setTimeout(function() {
            var connModal = document.getElementById('server-connect-modal');
            if (connModal) {
                connModal.style.display = 'flex';
            }
        }, 2500);
    }
}

// 백엔드 통신 초기 가동 검증
function initializeBackendRoute() {
    var storedConfig = localStorage.getItem('gumap_developer_config');
    var storedUrl = "";
    if (storedConfig) {
        try {
            var parsed = JSON.parse(storedConfig);
            storedUrl = parsed.PROXY_URL || "";
        } catch(e) {
            console.warn("[Config] Failed to parse stored developer config:", e);
        }
    }
    
    var activeUrl = storedUrl || window.PROXY_URL;
    if (window.location.hostname.includes('trycloudflare.com') || 
        window.location.hostname.includes('cloudflare') || 
        window.location.hostname.includes('ngrok')) {
        activeUrl = "";
    }
    
    window.checkServerAlive(activeUrl).then(function(alive) {
        if (!alive && window.isMobileCapacitor) {
            console.warn("[MaaS] 백엔드 오프라인 감지. 사설 와이파이 오토스캔 작동...");
            var notice = document.getElementById('clicked-info');
            if (notice) {
                notice.innerHTML = "🔍 컴퓨터 백엔드 서버 자동 탐색 중...";
            }
            startLocalServerAutoScan();
        } else if (!alive) {
            console.warn("[MaaS] 로컬 백엔드 서버(3000)가 기동되지 않았습니다.");
        } else {
            console.log("[MaaS] 백엔드 서버 온라인 상태 확인 완료:", activeUrl);
        }
    });
}

document.addEventListener("DOMContentLoaded", initializeBackendRoute);

// DOMPurify configuration to allow safe inline event handlers used in dynamic templates
window.DOM_PURIFY_CONFIG = {
    ADD_ATTR: ['onclick', 'onmouseover', 'onmouseout', 'oninput']
};

// G-map 통합 전역 구성/설정 객체 (하드코딩 상수 단일화)
window.GmapConfig = {
    DEFAULT_LAT: 36.119485,
    DEFAULT_LNG: 128.344573,
    DEFAULT_ZOOM: 14,
    THEME_PRIMARY_COLOR: "#3b82f6",
    THEME_SIDEBAR_WIDTH: "310px",
    SHARED_BASE_FARE: 1000,
    SHARED_PER_KM: 200,
    SHARED_PER_MIN: 150,
    SHARED_PRESET: 'kickboard'
};

// 기존 전역 변수 하위 호환성 양방향 바인딩 정의 (Object.defineProperty)
(function() {
    var properties = [
        'DEFAULT_LAT', 'DEFAULT_LNG', 'DEFAULT_ZOOM',
        'THEME_PRIMARY_COLOR', 'THEME_SIDEBAR_WIDTH',
        'SHARED_BASE_FARE', 'SHARED_PER_KM', 'SHARED_PER_MIN', 'SHARED_PRESET'
    ];
    properties.forEach(function(prop) {
        Object.defineProperty(window, prop, {
            get: function() { return window.GmapConfig[prop]; },
            set: function(val) { window.GmapConfig[prop] = val; },
            configurable: true
        });
    });
})();

// 로컬스토리지 개발자 설정 로드
const savedDevConfig = localStorage.getItem('gumap_developer_config');
if (savedDevConfig) {
    try {
        const config = JSON.parse(savedDevConfig);
        if (config.PROXY_URL) { window.PROXY_URL = config.PROXY_URL.trim().replace(/\/$/, ""); }
        if (window.location.hostname.includes('trycloudflare.com') || 
            window.location.hostname.includes('cloudflare') || 
            window.location.hostname.includes('ngrok')) {
            window.PROXY_URL = "";
        }
        if (config.TMAP_API_KEY) { TMAP_API_KEY = config.TMAP_API_KEY; window.TMAP_API_KEY = TMAP_API_KEY; }
        if (config.TAGO_KEY) { TAGO_KEY = config.TAGO_KEY; window.TAGO_KEY = TAGO_KEY; }
        if (config.VWORLD_KEY) { VWORLD_KEY = config.VWORLD_KEY; window.VWORLD_KEY = VWORLD_KEY; }
        if (config.JUSO_KEY) { JUSO_KEY = config.JUSO_KEY; window.JUSO_KEY = JUSO_KEY; }
        if (config.JUSO_COORD_KEY) { JUSO_COORD_KEY = config.JUSO_COORD_KEY; window.JUSO_COORD_KEY = JUSO_COORD_KEY; }
        if (config.ODSAY_KEY) { ODSAY_KEY = config.ODSAY_KEY; window.ODSAY_KEY = ODSAY_KEY; }
        if (config.ITS_KEY) { ITS_KEY = config.ITS_KEY; window.ITS_KEY = ITS_KEY; }
        if (config.GEMINI_API_KEY) { GEMINI_API_KEY = config.GEMINI_API_KEY; window.GEMINI_API_KEY = GEMINI_API_KEY; }
        if (config.OPINET_KEY) { OPINET_KEY = config.OPINET_KEY; window.OPINET_KEY = OPINET_KEY; }
        if (config.DEFAULT_LAT) { DEFAULT_LAT = parseFloat(config.DEFAULT_LAT); window.GmapConfig.DEFAULT_LAT = DEFAULT_LAT; }
        if (config.DEFAULT_LNG) { DEFAULT_LNG = parseFloat(config.DEFAULT_LNG); window.GmapConfig.DEFAULT_LNG = DEFAULT_LNG; }
        if (config.DEFAULT_ZOOM) { DEFAULT_ZOOM = parseInt(config.DEFAULT_ZOOM); window.GmapConfig.DEFAULT_ZOOM = DEFAULT_ZOOM; }
        if (config.THEME_PRIMARY_COLOR) { THEME_PRIMARY_COLOR = config.THEME_PRIMARY_COLOR; window.GmapConfig.THEME_PRIMARY_COLOR = THEME_PRIMARY_COLOR; }
        if (config.THEME_SIDEBAR_WIDTH) { THEME_SIDEBAR_WIDTH = config.THEME_SIDEBAR_WIDTH; window.GmapConfig.THEME_SIDEBAR_WIDTH = THEME_SIDEBAR_WIDTH; }
    } catch (e) {
        console.error("저장된 개발자 설정을 로드하지 못했습니다:", e);
    }
}

// 로컬스토리지 공유플랫폼 요금 설정 로드
const savedSharedFare = localStorage.getItem('gumap_shared_fare');
if (savedSharedFare) {
    try {
        const fare = JSON.parse(savedSharedFare);
        if (fare.baseFare !== undefined) { SHARED_BASE_FARE = parseInt(fare.baseFare); window.GmapConfig.SHARED_BASE_FARE = SHARED_BASE_FARE; }
        if (fare.perKm !== undefined) { SHARED_PER_KM = parseInt(fare.perKm); window.GmapConfig.SHARED_PER_KM = SHARED_PER_KM; }
        if (fare.perMin !== undefined) { SHARED_PER_MIN = parseInt(fare.perMin); window.GmapConfig.SHARED_PER_MIN = SHARED_PER_MIN; }
        if (fare.preset) { SHARED_PRESET = fare.preset; window.GmapConfig.SHARED_PRESET = SHARED_PRESET; }
    } catch (e) {
        console.error("저장된 공유플랫폼 요금 설정 로드 실패:", e);
    }
}

// 지도 전역 객체
var map;
var infoWindow = null; // Leaflet Popup 객체로 활용

// 길찾기 전역 상태
var routeState = 'IDLE'; // 'SET_START', 'SET_END'
var startCoord = null; // {lat, lng, addr}
var endCoord = null; // {lat, lng, addr}
var startMarker = null;
var endMarker = null;
var currentRoutingPolylines = []; // 다중 경로를 위한 배열

// 대중교통(버스) 노선 전역 상태
var allRoutesMap = {
    "11": ["GMB1111", "GMB1114", "GMB1115", "GMB1120", "GMB1121"],
    "111": ["GMB11110", "GMB11120"],
    "170": ["GMB17012", "GMB17022"],
    "171": ["GMB17110", "GMB17120"],
    "72": ["GMB7230"],
    "960": ["GMB96010", "GMB96020"],
    "340": ["GMB34030"]
};
var currentSelectedRouteNo = null; 
var currentRenderId = 0; 
var currentRoutePolylines = []; 
var fetchIntervalId = null; 
var stationCoords = {}; 
var routeStops = {}; 
var activeBuses = {}; 
var animationFrameId = null;

// 길찾기 및 카테고리 검색 비동기 제어용 전역 변수
var currentRoutingRenderId = 0;
var currentCategorySearch = null;

// 공통 유틸리티: API 호출 (CORS 및 인증 우회를 위해 로컬 프록시 연동, 캐시 방지)
function fetchAPI(url) {
    let proxiedUrl = url;
    if (url.includes("apis.data.go.kr")) {
        let parts = url.split('?');
        let baseUrl = parts[0];
        let queryStr = parts[1] || '';
        queryStr += (queryStr ? '&' : '') + '_t=' + Date.now();
        proxiedUrl = `${window.PROXY_URL}/tago-api?targetUrl=${encodeURIComponent(baseUrl)}&${queryStr}`;
    }
    return fetch(proxiedUrl, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }).then(res => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text().then(text => {
            if (text.startsWith("Forbidden")) throw new Error("403 Forbidden");
            if (text.trim().startsWith("<")) throw new Error("XML 반환됨 (트래픽 초과 또는 오류)");
            var data = JSON.parse(text);
            if (data.response && data.response.header && data.response.header.resultCode !== "00") {
                throw new Error("API 에러: " + data.response.header.resultMsg);
            }
            return data;
        });
    });
}

// Global fetch interceptor to inject custom user keys if defined in developer settings
const originalFetch = window.fetch;
window.fetch = function(input, init) {
    let url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : (input && input.url));
        if (window.PROXY_URL) {
            if (!url.startsWith(window.PROXY_URL)) {
                if (url.startsWith('/') || !url.includes('://')) {
                    var path = url.split('?')[0];
                    var normPath = path.startsWith('/') ? path : '/' + path;
                    if (normPath.startsWith('/vworld-') ||
                        normPath.startsWith('/juso') ||
                        normPath.startsWith('/odsay') ||
                        normPath.startsWith('/gemini-') ||
                        normPath.startsWith('/its-') ||
                        normPath.startsWith('/tmap-') ||
                        normPath.startsWith('/transit') ||
                        normPath.startsWith('/bus-') ||
                        normPath.startsWith('/shared-') ||
                        normPath.startsWith('/tago-') ||
                        normPath.startsWith('/opinet-')) {
                        
                        url = window.PROXY_URL + (url.startsWith('/') ? '' : '/') + url;
                    }
                }
            }
        }
        let isProxied = window.PROXY_URL && url.startsWith(window.PROXY_URL);
        if (isProxied) {
            let urlObj = new URL(url, window.location.origin);
            let searchParams = urlObj.searchParams;
            
            if (urlObj.pathname.startsWith('/vworld-') && window.VWORLD_KEY) {
                searchParams.set('key', window.VWORLD_KEY);
            } else if (urlObj.pathname === '/juso' && window.JUSO_KEY) {
                searchParams.set('confmKey', window.JUSO_KEY);
            } else if (urlObj.pathname === '/odsay' && window.ODSAY_KEY) {
                searchParams.set('apiKey', window.ODSAY_KEY);
            } else if (urlObj.pathname === '/gemini-api' && window.GEMINI_API_KEY) {
                searchParams.set('key', window.GEMINI_API_KEY);
            } else if (urlObj.pathname.startsWith('/its-') && window.ITS_KEY) {
                searchParams.set('apiKey', window.ITS_KEY);
            } else if (urlObj.pathname.startsWith('/tmap-') && window.TMAP_API_KEY) {
                searchParams.set('appKey', window.TMAP_API_KEY);
                if (init) {
                    if (!init.headers) init.headers = {};
                    if (init.headers instanceof Headers) {
                        init.headers.set('appKey', window.TMAP_API_KEY);
                    } else {
                        init.headers['appKey'] = window.TMAP_API_KEY;
                    }
                }
            } else if (urlObj.pathname === '/transit' && window.TMAP_API_KEY) {
                if (init) {
                    if (!init.headers) init.headers = {};
                    if (init.headers instanceof Headers) {
                        init.headers.set('appKey', window.TMAP_API_KEY);
                    } else {
                        init.headers['appKey'] = window.TMAP_API_KEY;
                    }
                }
            } else if ((urlObj.pathname.startsWith('/bus-') || urlObj.pathname === '/shared-mobility' || urlObj.pathname === '/tago-api') && window.TAGO_KEY) {
                searchParams.set('serviceKey', window.TAGO_KEY);
            } else if ((urlObj.pathname === '/opinet-around' || urlObj.pathname === '/opinet-detail') && window.OPINET_KEY) {
                searchParams.set('code', window.OPINET_KEY);
            }
            
            url = urlObj.pathname + urlObj.search;
            if (window.PROXY_URL) {
                url = window.PROXY_URL + url;
            }
            if (typeof input === 'string') {
                input = url;
            } else if (input instanceof URL) {
                input = new URL(url, window.location.origin);
            } else if (input && typeof input === 'object') {
                input = new Request(url, input);
            }
        } else if (url.includes("://apis.data.go.kr")) {
            let urlObj = new URL(url, window.location.origin);
            let baseUrl = urlObj.origin + urlObj.pathname;
            if (window.TAGO_KEY) {
                urlObj.searchParams.set('serviceKey', window.TAGO_KEY);
            }
            let queryStr = urlObj.searchParams.toString();
            let proxiedUrl = `/tago-api?targetUrl=${encodeURIComponent(baseUrl)}&${queryStr}`;
            if (window.PROXY_URL) {
                proxiedUrl = window.PROXY_URL + proxiedUrl;
            }
            if (typeof input === 'string') {
                input = proxiedUrl;
            } else if (input instanceof URL) {
                input = new URL(proxiedUrl, window.location.origin);
            } else if (input && typeof input === 'object') {
                input = new Request(proxiedUrl, input);
            }
        }
        
        // ngrok 터널 경고 페이지 우회 헤더 추가
        if (url && (url.includes('ngrok-free.dev') || (window.PROXY_URL && url.startsWith(window.PROXY_URL)))) {
            if (!init) init = {};
            if (!init.headers) init.headers = {};
            if (init.headers instanceof Headers) {
                init.headers.set('ngrok-skip-browser-warning', '69');
            } else {
                init.headers['ngrok-skip-browser-warning'] = '69';
            }
        }
    return originalFetch(input, init);
};

// ── 시간 포맷터 헬퍼 (60분 이상 시 H시간 M분 형식으로 변환) ──
window.formatTime = function(minutes) {
    var min = parseInt(minutes) || 0;
    if (min <= 0) return "0분";
    if (min < 60) {
        return min + "분";
    }
    var h = Math.floor(min / 60);
    var m = min % 60;
    if (m === 0) {
        return h + "시간";
    }
    return h + "시간 " + m + "분";
};
