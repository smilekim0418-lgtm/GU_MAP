# 🗺️ GUMAP — 구미시 통합 지도 서비스

> 구미시 대중교통·실내외 지도·AI 길찾기를 통합한 웹앱 프로젝트  
> 마지막 정리: 2026-08-28

---

## 📁 폴더 구조

루트에는 **진입점과 설정만** 둔다. 나머지는 목적별 `GUMAP-*` 폴더로 나뉜다.

```
통합 GUMAP/
│
├── 📄 index.html              ← 웹앱 진입점 (여기서 시작)
├── 📄 server.py               ← 본서버 (FastAPI, 포트 3000) · 모든 API 프록시
├── 📄 3d-viewer.html          ← 3D 지도 팝업 (index.html 에서 열림)
├── 📄 G-map-시작.bat           ← ★ 더블클릭으로 실행
├── 📄 G-map-종료.bat
├── 📄 .env / .env.example     ← API 키 (.env 는 git 에 안 올라간다)
│
├── 📂 GUMAP-프론트/            ← 웹 프론트엔드 (css/, js/)
│   └── js/map/                - 지도 엔진 · 실내지도 · 실내 길찾기 번들
├── 📂 GUMAP-일반지도/          ← 일반지도 단독 페이지 (프론트 사본)
├── 📂 GUMAP-학교지도/          ← 금오공대 캠퍼스 지도 · IMDF 산출물 · CAD
│
├── 📂 GUMAP-서버/              ← 기능별 서버 모듈 (교통·날씨·AI 길찾기)
├── 📂 GUMAP-중앙처리장치/      ← 변경 이력 · 연동 처리
├── 📂 GUMAP-AI(길찾기)/        ← G-Route AI 경로 탐색
│
├── 📂 GUMAP-실행/              ← 실행 스크립트 (프록시·브라우저·터널·타일서버)
├── 📂 GUMAP-개발/              ← 개발 도구
│   └── floorplan/             - 도면 → IMDF · 실내 길찾기 빌드 파이프라인
│       ├── fp/                - 모듈 (nav · route · imdf · outdoor · entrances)
│       ├── tests/             - 테스트 (pytest + 브라우저 검사)
│       ├── work/              - 층별 라벨 원본 (*.json 만 추적, PNG 는 제외)
│       ├── floorplan-editor.html   - 박스 편집기 (포트 8790)
│       └── indoor-calibrate.html   - 도면 정합 도구
│
├── 📂 GUMAP-데이터/            ← 버스 정류장 · 인구 통계 등 원천 데이터
├── 📂 GUMAP-API키/             ← 공공 API 가이드 문서
├── 📂 GUMAP-아이콘/            ← 앱 아이콘 · 이미지
├── 📂 GUMAP-앱/                ← 안드로이드 (Capacitor) · APK
├── 📂 GUMAP-발표/              ← 기획서 · 보고서
│
├── 📂 docs/                    ← 설계 문서 (specs)
└── 📂 GIS_DATA/                ← 정사영상 · DEM · 3D Tiles (git 제외, 5GB)
```

> 루트에 `check_*.py` · `patch_*.py` 같은 일회용 스크립트를 두지 않는다.
> 필요하면 `GUMAP-개발/` 아래에서 작업한다.

## 🚀 실행 방법

### 방법 1 — 가장 간단 (권장)
```
G-map-시작.bat 더블클릭
```

### 방법 2 — 수동 실행
```bash
GUMAP-실행/1_실행_프록시서버.bat     # 본서버
GUMAP-실행/2_실행_웹브라우저.bat     # 브라우저 열기
GUMAP-실행/3_실행_온라인접속.bat     # 외부 공유 터널 (ngrok → 3000)
```

### 방법 3 — Python 직접 실행
```bash
python server.py                          # 본서버 (3000) · API 전부 여기
python GUMAP-실행/launch_gis_servers.py   # 타일 서버 (8765 정사영상 / 8766 3D / 8767 DEM)
```

> 외부 공유 터널은 **반드시 3000번**을 가리켜야 한다. 타일 서버(8765~8767)는
> 정적 파일만 내주는 `http.server` 라 POST 를 못 받고, 그쪽으로 터널을 열면
> 길찾기·버스·AI 가 전부 `501 Unsupported method ('POST')` 로 죽는다.

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
| UI 스타일 변경 | `GUMAP-프론트/css/` |
| 지도 기능 수정 | `GUMAP-프론트/js/map/` |
| 버스 기능 수정 | `GUMAP-프론트/js/GUMAP-버스추적.js` |
| AI 길찾기 수정 | `GUMAP-프론트/js/GUMAP-길찾기.js`, `GUMAP-AI(길찾기)/groute_ai/` |
| 실내지도·실내 길찾기 | **`GUMAP-개발/floorplan/`** 에서 고치고 `04/05_build_*.py --write` |
| API 키 수정 | `.env`, `GUMAP-프론트/js/GUMAP-설정.js` |
| 서버 수정 | `server.py`, `GUMAP-실행/cors_server.py` |

> ⚠ `GUMAP-프론트/js/map/map-techno-*.js` 는 **빌드 산출물**이다. 직접 고치면
> 다음 빌드에 덮어써진다. 원본은 `GUMAP-개발/floorplan/` 에 있다.
