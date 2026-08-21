# G-map (구미 대중교통 & MaaS 통합 모빌리티 지도)

구미시 대중교통 및 실시간 모빌리티 정보를 통합하여 제공하는 지능형 AI 버스 및 모빌리티 웹/모바일 앱 플랫폼입니다.

---

## 1. 사전 요구사항 (Prerequisites)
G-map 서비스를 빌드하고 로컬에서 검증하기 위해서는 다음 환경이 준비되어야 합니다.
- **Node.js**: v18.0.0 이상
- **Python**: v3.11.0 이상 (FastAPI 백엔드 구동용)
- **Android Studio** (모바일 안드로이드 APK 빌드 필요 시)

---

## 2. 개발 환경 설정 (Installation & Setup)

### 2-1. 의존성 패키지 설치
프로젝트 루트 디렉토리에서 아래 명령들을 실행해 필요한 패키지들을 설치합니다.
```bash
# Node.js 개발 의존성 (Vitest, Capacitor 등) 설치
npm install
```

### 2-2. 환경 변수 설정
프로젝트 루트에 `.env` 파일을 생성하고 외부 서비스 연동을 위한 API 키 목록을 입력합니다. (안전을 위해 `.env` 파일은 절대 Git 커밋 대상에 포함하지 마십시오.)
```env
TMAP_API_KEY=YOUR_TMAP_API_KEY
TAGO_KEY=YOUR_PUBLIC_DATA_PORTAL_KEY
VWORLD_KEY=YOUR_VWORLD_API_KEY
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
OPINET_KEY=F260528610
```

---

## 3. 서비스 실행 및 테스트 (Local Development)

### 3-1. FastAPI 로컬 백엔드 서버 구동
백엔드는 대중교통 Open API 프록시 및 OSRM 경로 탐색 대체 처리를 담당합니다.
```bash
# FastAPI 서버 실행 (기본 포트: 3000)
python backend_fastapi.py
```
서버가 정상적으로 켜지면 브라우저를 통해 `http://localhost:3000/` 에 접속하여 지도와 모빌리티 대시보드를 직접 확인할 수 있습니다.

### 3-2. 단위 테스트 실행 (Vitest)
리팩토링된 코드가 견고하게 동작하는지 단위 테스트를 실행해 검증합니다.
```bash
# Vitest 단위 테스트 1회 구동
npm run test
```

---

## 4. 모바일 배포 및 동기화 (Mobile Sync & Build)
Capacitor 인프라를 활용하여 하이브리드 앱으로 빌드하거나 갱신된 HTML/CSS/JS 자산을 모바일 프로젝트 디렉토리에 전파합니다.

```bash
# 1. 갱신된 자산 동기화 (www/ 디렉토리로 자산 이관 및 Capacitor 싱크)
node sync_assets.js

# 2. Capacitor 안드로이드 프로젝트 싱크
npx cap sync android

# 3. 안드로이드 스튜디오를 통한 빌드 및 실행
npx cap open android
```

---

## 5. 아키텍처 및 주요 디렉토리 구조
```text
g-map/
├── backend_fastapi.py     # FastAPI 프록시 백엔드 서버 (보안 필터링 & API 캐싱 담당)
├── test_map.html          # 메인 프런트엔드 애플리케이션 진입점 (지도의 웹 UI 및 AI 어시스턴트 채널)
├── sync_assets.js         # 프런트엔드 자산을 모바일용 www/ 폴더로 복사/동기화하는 빌드 스크립트
├── www/                   # [중요] 모바일 하이브리드 앱 구동을 위해 sync_assets.js가 자동 빌드/동기화하는 배포용 정적 자산 디렉토리
├── css/                   # Vanilla CSS 스타일시트 (디자인 시스템 모듈화)
├── js/                    # 모듈별 핵심 비즈니스 로직
│   ├── config.js          # 통합 전역 설정 매니저 (GmapConfig 양방향 바인딩 및 API 키 관리)
│   ├── store.js           # AppState 중앙 상태 매니저 (반응형 상태 바인딩 및 호환성 브릿지)
│   ├── constants.js       # 폴링 주기, 임계값, 경계 정보 등 상숫값 정의
│   ├── bus_tracker.js     # 실시간 버스 갱신 및 노선 렌더링, 프레임 애니메이션 가드 보간 로직
│   ├── routing.js         # 대중교통/공유모빌리티/택시 복합 경로 검색 및 다중 모달리티 길찾기 시뮬레이터
│   ├── ai_assistant.js    # Gemini LLM 연동 실시간 자연어 대화형 교통 비서 및 UI 트리거 액션 파서
│   ├── map/               # 지도 레이어(CCTV/교통망/PM), POI 검색 및 클릭 인터랙션 핸들러
│   └── utils/
│       ├── api-client.js  # 지수 백오프(Exponential Backoff) 기반 fetchWithRetry 기능
│       └── error-handler.js# 전역 에러 토스트 피드백 표시 제어
├── android/               # Capacitor 기반의 안드로이드 네이티브 앱 프로젝트 빌드 환경
└── tests/                 # Vitest 기반 핵심 모듈 단위 테스트 모음
```
