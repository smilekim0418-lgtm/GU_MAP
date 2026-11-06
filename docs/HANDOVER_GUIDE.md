# 📘 GUMAP 후임 개발자 인수인계 가이드

## 1. 新지도 vs 舊지도 핵심 아키텍처
- 🌟 新지도 (자체 지도): `GUMAP-프론트/js/map/gumap-custom-map.js`
  - 엔진: Leaflet L.canvas 자체 카토그래피 렌더러
  - 특징: 외부 API 키 전혀 필요 없음 (ZERO API KEY), 오프라인 자체 구동
  - 데이터: GUMAP-데이터/vector_layers/ (구미시_하천_강.geojson, 구미시_도로망.geojson, 구미시_산_등고선.geojson)
  - 스타일:
    - 0층: 무라벨 베이스
    - 1층: 에메랄드 수계 (낙동강/금오천)
    - 2층: 소프트 파스텔 등고선 (금오산)
    - 3층: 네이버 스타일 2단 스트로크 도로망 (아스팔트 입체감)
    - 4층: 최상단 스마트 라벨 배지
- 🏛️ 舊지도 (기존 표준/위성 지도): `map-init.js`, `map-layers.js`
  - 국토부 VWorld API 키(.env)를 사용하는 WMTS 타일 지도 및 항공사진 위성지도

## 2. 모드 전환 메커니즘
- index.html 우측 상단 모드 탭:
  - ✨ GuMap (자체지도): `window.enableGuMapCustomMap()` 호출
  - 🗺️ 일반 표준지도: `window.setMapMode('standard')`
  - 🛰️ 위성 항공지도: `window.setMapMode('satellite')`

## 3. 디렉터리 맵 & 단일 진입점 원칙
- 실제 구동 소스: 루트의 `index.html` 및 `GUMAP-프론트/` (Single Source of Truth)
- 주의: `GUMAP-일반지도/`는 과거 복사본이므로 수정하지 말 것.

## 4. 실행 방법
- `GuMap-실행.bat` 더블클릭 (FastAPI 포트 3000 자동 구동 및 브라우저 오픈)
- 또는 `python server.py`