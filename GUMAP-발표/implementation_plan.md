# [GUMAP] 금오공과대학교 테크노관 지하 1층(B1F) CAD/JSON 기반 실내 지도 연동 계획서

사용자님의 지시에 따라 바탕화면에 위치한 **`금오공과대학교_테크노관_CAD파일.json`** 및 **`금오공과대학교_테크노관_CAD파일.dxf`** 데이터를 기반으로, **금오공과대학교 테크노관 지하 1층(B1F)**의 상세 실내 평면도, 방/동아리방/연습실(32개실), 엘리베이터(3개), 계단(3개) 및 통로 데이터를 GUMAP 지도 엔진에 완벽하게 탑재하는 구현 계획입니다.

---

## 📌 주요 변경 및 연동 개요

1. **테크노관 B1F 2D/SVG 벡터 레이어 및 투명 PNG 렌더링**:
   - `금오공과대학교_테크노관_CAD파일.json` 내 `outerContour`(외곽선), `rooms`(32개 상세 공간), `corridors`(복도 10개), `decorators`(엘리베이터 3기, 계단 3소, 출입문 등) 데이터를 GeoJSON/SVG 2D 렌더러 모듈로 변환합니다.
   - 금오공과대학교 테크노관 위경도 위치(약 Lat 36.1460, Lon 128.3934)에 정밀 지리 매핑(Georeferencing)하여 지도 상에 얹습니다.

2. **실내 POI 팝업 및 방 검색 연동**:
   - 밴드 연습실(B121), 댄스 연습실(B122), 지하 로봇 작업장(B131), 목공 제작실(B130), 동아리방(B119/B120) 등 32개 개별 방 클릭 시 시설명, 면적, 사용 가능 상태 등의 상세 팝업이 노출되도록 구현합니다.

3. **스마트 층별 스위처(Indoor Floor Controller) UI 탑재**:
   - 지도의 우측 하단/상단에 `[B1F]` `[1F]` `[2F]` `[3F]` `[4F]` 층 선택 조종 패널 신설
   - 테크노관 줌인(Zoom >= 17) 시 층별 조종 패널 자동 활성화 및 층 변경 시 레이어 실시간 스윗칭

4. **실내 길찾기(Indoor Routing) 노드-링크 데이터 사전 연결**:
   - B1F 내 3개의 엘리베이터 shaft 및 3개의 계단 위치를 노드로 지정하여, 층간 수직 이동 경로 연산 체계 수립

---

## 🛠️ Proposed Changes

### [Frontend & Map Engine]

#### [MODIFY] [index.html](file:///C:/Users/dryou/OneDrive/바탕 화면/新GUMAP/index.html)
- 테크노관 및 주요 건물용 실내 층별 컨트롤러 UI 패널(`indoor-floor-controller`) 추가
- 방 검색 및 실내 시설 팝업 템플릿 연동

#### [NEW] [js/map/map-techno-b1.js](file:///C:/Users/dryou/OneDrive/바탕 화면/新GUMAP/js/map/map-techno-b1.js)
- `금오공과대학교_테크노관_CAD파일.json` 데이터를 로드하고 Leaflet GeoJSON/Polygon/SVG 오버레이로 변환하여 렌더링하는 전용 모듈
- 32개 개별 실내 공간 호실별(B101~B132) 스타일링, 클릭 이벤트, 마우스 오버 가시성 효과 부여
- 엘리베이터(🛗) 3기, 계단(🪜) 3소, 출입문 Icon 마커 그룹 구성

#### [MODIFY] [js/map/map-init.js](file:///C:/Users/dryou/OneDrive/바탕 화면/新GUMAP/js/map/map-init.js)
- `map-techno-b1.js` 모듈 자동 초기화 및 금오공대 테크노관 지리 좌표 연동
- Zoom Level >= 17 진입 시 테크노관 B1F 실내 레이어 및 층 전환 컨트롤러 자동 표출

#### [MODIFY] [css/components.css](file:///C:/Users/dryou/OneDrive/바탕 화면/新GUMAP/css/components.css)
- 실내 지도 전용 호실 라벨, 팝업 스타일 및 층 선택 패널 유리모피즘 디자인 적용

### [Data Assets]

#### [NEW] [data/gumi/techno_b1_map.json](file:///C:/Users/dryou/OneDrive/바탕 화면/新GUMAP/data/gumi/techno_b1_map.json)
- 바탕화면의 `금오공과대학교_테크노관_CAD파일.json`을 프로젝트 내 `data/gumi/` 폴더로 서빙할 수 있도록 이관

---

## 🧪 Verification Plan

### Automated Verification
- 파이썬 스크립트를 통한 JSON 데이터 무결성 검증 (32개 호실, 엘리베이터 3기, 계단 3개 요소 파싱 확인)
- 정적 웹 서버 구동 확인 (`groute_ai/venv/Scripts/python.exe -m http.server 3000`)

### Manual Verification
- 브라우저에서 금오공과대학교 테크노관 위치로 이동 시 지하 1층(B1F) 실내 도면이 정확한 구역에 표출되는지 확인
- B121(밴드 연습실), B131(지하 로봇 작업장) 등의 방을 클릭했을 때 면적과 상세 정보 팝업이 노출되는지 확인
- `B1F` ↔ `1F` 층별 선택 버튼 전환 시 레이어가 정상 동작하는지 테스트
