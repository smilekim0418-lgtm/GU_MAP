# 🗺️ GUMAP — 구미시 통합 지도 서비스

> 구미시 대중교통·실내외 지도·AI 길찾기를 통합한 웹앱 프로젝트  
> 마지막 정리: 2026-08-17

---

## 📁 폴더 구조

```
통합 GUMAP/
│
├── 📄 index.html              ← 웹앱 메인 진입점 (여기서 시작!)
├── 📄 server.py               ← GIS 백엔드 서버 (메인)
├── 📄 cors_server.py          ← CORS 프록시 서버
├── 📄 G-map-start.py          ← 서버 자동 실행 스크립트
├── 📄 G-map-시작.bat           ← ★ 더블클릭으로 앱 실행
├── 📄 bus_stations.js         ← 구미시 버스 정류장 데이터
├── 📄 GUMAP-Beta-Test.apk     ← 안드로이드 앱 설치 파일
├── 📄 VinsideSDK.zip          ← 실내지도 SDK
├── 📄 .env                    ← API 키 환경변수 (수정 필요!)
├── 📄 .env.example            ← .env 작성 예시
│
├── 📂 css/                    ← 스타일시트
│   ├── base.css               - 기본 스타일
│   ├── layout.css             - 레이아웃
│   ├── components.css         - UI 컴포넌트
│   ├── bottom-sheet.css       - 하단 시트 UI
│   └── animations.css         - 애니메이션
│
├── 📂 js/                     ← 자바스크립트 소스
│   ├── config.js              - 설정 (API 키, URL 등)
│   ├── constants.js           - 상수 정의
│   ├── store.js               - 전역 상태 관리
│   ├── bus_tracker.js         - 실시간 버스 추적
│   ├── routing.js             - 경로 탐색 엔진
│   ├── ai_assistant.js        - AI 어시스턴트
│   ├── research_tab.js        - 연구 탭
│   ├── station_info.js        - 정류장 정보
│   ├── railway.js             - 철도 정보
│   ├── outdoor_walkway.js     - 야외 보행로
│   ├── custom_places.js       - 커스텀 장소
│   ├── kumoh_tab.js           - 금오공대 탭
│   ├── kumoh_tab_data.js      - 금오공대 데이터
│   ├── fallback_stops.js      - 정류장 폴백 데이터
│   ├── map/                   - 지도 엔진
│   │   ├── map-init.js        - 지도 초기화
│   │   ├── map-click.js       - 클릭 이벤트
│   │   ├── map-layers.js      - 레이어 관리
│   │   ├── map-search.js      - 검색 기능
│   │   ├── map-utils.js       - 유틸리티
│   │   ├── map-techno-b1.js   - 테크노관 B1
│   │   ├── map-techno-imdf-data.js - 테크노 IMDF 데이터
│   │   └── map-techno-indoor.js    - 테크노 실내지도
│   ├── ui/                    - UI 컴포넌트
│   │   ├── events.js          - 이벤트 핸들러
│   │   ├── favorites.js       - 즐겨찾기
│   │   └── reviews.js         - 리뷰
│   └── utils/                 - 유틸리티
│       ├── api-client.js      - API 클라이언트
│       └── error-handler.js   - 에러 처리
│
├── 📂 groute_ai/              ← AI 길찾기 딥러닝 모듈
│   ├── 01~09_*.py             - 학습 파이프라인
│   ├── groute_collector.py    - 데이터 수집
│   ├── requirements.txt       - Python 패키지 목록
│   └── run_groute_init.bat    - AI 초기화 실행
│
├── 📂 data/                   ← 실내지도 데이터
│   ├── imdf/                  - IMDF 포맷 데이터
│   └── kumoh_techno_rooms.json - 금오공대 테크노관 방 정보
│
├── 📂 data(데이터 파일)/       ← 구미시 GIS 데이터
│   ├── gumi(구미시 관련 데이터)/
│   └── reference(전국 참고 데이터)/
│
├── 📂 docs(보고서 및 기획서)/  ← 프로젝트 문서
│
├── 📂 scripts(실행 스크립트)/  ← 실행 스크립트
│   ├── 1_실행_프록시서버.bat   - CORS 서버 실행
│   ├── 2_실행_웹브라우저.bat   - 브라우저 실행
│   ├── 3_실행_온라인접속.bat   - 온라인 접속
│   └── api_list.csv           - API 목록
│
├── 📂 tests/                  ← 자동화 테스트
│
│── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──
│  [카테고리별 참조 폴더]
│── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──
│
├── 📂 GUMAP-실행/             ← 실행 파일 모음 (빠른 접근)
├── 📂 GUMAP-일반지도/         ← 일반 지도 관련 파일
├── 📂 GUMAP-학교지도/         ← 금오공대 실내지도 관련
├── 📂 GUMAP-AI(길찾기)/       ← AI 길찾기 모듈
├── 📂 GUMAP-데이터/           ← 데이터 파일 모음
├── 📂 GUMAP-API키/            ← API 키 관리
├── 📂 GUMAP-아이콘/           ← 아이콘 리소스
└── 📂 GUMAP-발표/             ← 발표·보고서 자료
```

---

## 🚀 실행 방법

### 방법 1 — 가장 간단 (권장)
```
G-map-시작.bat 더블클릭
```

### 방법 2 — 수동 실행
```bash
# 1. 프록시 서버 실행
scripts(실행 스크립트)/1_실행_프록시서버.bat

# 2. 웹 브라우저 실행
scripts(실행 스크립트)/2_실행_웹브라우저.bat
```

### 방법 3 — Python 직접 실행
```bash
python server.py
python cors_server.py
```

---

## ⚙️ 환경 설정

`.env` 파일을 열어 API 키를 설정하세요:
```
VWORLD_API_KEY=...
GUMI_BUS_API_KEY=...
GEMINI_API_KEY=...
```
→ `.env.example` 파일을 참고해서 작성

---

## 🏗️ 기술 스택

| 항목 | 기술 |
|------|------|
| 프론트엔드 | HTML5 + Vanilla JS + CSS3 |
| 백엔드 | Python (Flask/FastAPI) |
| 지도 | VWorld API (국토부) |
| AI 길찾기 | GNN + RL (PyTorch) |
| 실내지도 | IMDF + Vinside SDK |
| 실시간버스 | 구미시 버스 API |
| 앱 패키징 | Capacitor (Android APK) |

---

## 🗂️ 주요 기능

- 🗺️ **외부 지도** — VWorld 기반 구미시 지도, 실시간 버스 위치
- 🏫 **실내 지도** — 금오공대 테크노관 층별 실내지도 (B1~6층)
- 🤖 **AI 길찾기** — GNN 기반 딥러닝 최적 경로 탐색 (G-Route AI)
- 🚌 **버스 추적** — 실시간 구미시 버스 위치 & 도착 정보
- 📍 **장소 검색** — 구미시 내 장소 검색 및 즐겨찾기
- 📱 **Android 앱** — Capacitor 기반 네이티브 앱 변환

---

## 📝 수정 시 참고

| 수정 목적 | 파일 위치 |
|-----------|-----------|
| UI 스타일 변경 | `css/` 폴더 |
| 지도 기능 수정 | `js/map/` 폴더 |
| 버스 기능 수정 | `js/bus_tracker.js` |
| AI 길찾기 수정 | `js/routing.js`, `groute_ai/` |
| 학교 지도 수정 | `js/kumoh_tab.js`, `js/map/map-techno-*.js` |
| API 키 수정 | `.env`, `js/config.js` |
| 서버 수정 | `server.py`, `cors_server.py` |
