# GUMAP_report — 활동보고서용 주차별 스냅샷

AX 기반 역량 강화 프로젝트 계획서(2026.09.04 제출)의 추진 일정 **1~15주차**에 맞춰,
그 주차까지의 기능만 켜진 GUMAP 과 주차별 산출물 화면을 모은 폴더다.
월별 활동보고서(9·10·11·12월) 초안도 여기 있다.

## 여는 법

```bash
python server.py            # 또는 G-map-시작.bat
# 브라우저: http://localhost:3000/GUMAP_report/
```

허브 페이지(`index.html`)에서 월 → 주차 → 화면을 누르면 캡처할 장면이 자동으로 펼쳐진다.

- `?badge=0` : 앱 머리글의 "v0.x · N주차" 표시 숨기기
- `?scene=0` : 자동 장면 없이 기본 화면
- 창 크기 1600×900 정도가 한 장에 맞는다

## 폴더

```
GUMAP_report/
├─ index.html              허브 (월별 · 주차별 화면 목록)
├─ 01주차_… ~ 15주차_…     주차별 화면. index.html 이 대표 화면
│                           (산출물 페이지가 있는 주차는 앱 스냅샷이 GUMAP.html)
├─ 보고서/                  월별 활동보고서 .docx + 본문 .md + 첨부 스크린샷
├─ _app/                    스냅샷용 프론트 사본 + 주차 게이트
│   ├─ GUMAP-프론트/        루트 GUMAP-프론트를 얼린 사본 (바꾼 줄마다 [REPORT] 주석)
│   ├─ report-stage.js/css  주차 게이트 (wk-ge-N 클래스, 빌드 표시, 15주차 전 AI 끔)
│   ├─ report-scenes.js     주차별 자동 장면
│   ├─ report-campus*.js    12~13주차 신규 건물 실내지도 · 캠퍼스 통합 경로망
│   └─ template.html        루트 index.html 사본 (주차 HTML 의 원본)
├─ _tools/                  산출물을 만드는 스크립트
│   ├─ build_weeks.py       template.html → 주차별 앱 HTML
│   ├─ week03_extract.py · week04_georef.py · week08_qc.py
│   ├─ ax/                  9~13주차 AI 자동화 파이프라인 (아래)
│   └─ reports/             월별 보고서 본문(content.js)·생성기(make_reports.js)
└─ _work/                   중간 산출물 (OCR 캐시·모델·데이터셋·사진 처리 결과, git 제외)
```

**루트의 원본 앱(index.html · GUMAP-프론트 · server.py)은 건드리지 않았다.**
주차 게이트와 새 기능은 `_app` 사본과 이 폴더 안에만 있다.

## 주차별로 무엇이 기존이고 무엇이 새것인가

| 주차 | 화면 | 출처 |
|---|---|---|
| 1, 5, 6, 7, 14, 15 | GUMAP 앱 | 기존 구현을 주차에 맞게 켜고 끔 (14주차: 실내 패널의 "먼 출발지 → 대중교통 자동 결합"만 사본에 추가) |
| 3, 4 | 도면 추출 · 좌표 정합 | 기존 floorplan 파이프라인·정합 데이터를 다시 돌려 시각화 (4주차 잔차·층간 정렬 검증은 새로 계산) |
| 2 | 요구사항·아키텍처 | 실제 시스템을 바탕으로 새로 작성한 문서 |
| 8 | 완성본 · 품질 검수 | 통행 제약(212-1·212-2 → 212, 262 → 263)을 사본 경로 엔진에 새로 반영, 검수 대시보드 신규 |
| 9~11 | 기준선 · 모델 · 자동 라벨링 | **새로 구현** (`_tools/ax`) — 아래 수치는 실제 실행 결과 |
| 12~13 | 신규 건물 · 캠퍼스 경로망 | **새로 구현** — 디지털관은 양호, 글로벌관은 초안 수준 |

## 9~13주차 AI 파이프라인 (`_tools/ax`)

실행 순서 (프로젝트 루트에서):

```bash
python GUMAP_report/_tools/ax/ocr_cache.py          # Windows OCR 기준선 캐시
python GUMAP_report/_tools/ax/baseline.py           # 9주차 자동화 기준선
python GUMAP_report/_tools/ax/train.py synth data real final   # 9~10주차 데이터·CRNN (CPU 약 40분)
python GUMAP_report/_tools/ax/doors.py              # 10주차 출입문 검출
python GUMAP_report/_tools/ax/w10_assets.py
python GUMAP_report/_tools/ax/autolabel.py          # 11주차 신뢰도 분기·대장 대조
python GUMAP_report/_tools/ax/newbuilding.py digital global    # 12~13주차 사진 → 실내지도 초안
python GUMAP_report/_tools/ax/export_campus.py      # 앱 데이터 내보내기
python GUMAP_report/_tools/ax/campus_graph.py       # 13주차 통합 경로망 (OSRM 보행 경로 요청 포함)
python GUMAP_report/_tools/build_weeks.py           # 주차 HTML 다시 만들기
```

주요 결과 (실측):

- 기준선: 테크노관 방 337개 중 53%만 자동 완성, 수작업 895회(표준 작업시간 가정 시 약 4시간)
- CRNN 방 번호 인식: 학습에 안 쓴 4~6F 에서 84.8% (Windows OCR 75.2%, 6F 11% → 89%)
- 출입문 검출: 사람이 그린 460개 대비 정밀도 82.3% · 재현율 81.7%
- 자동 라벨링: 시험층 82.9% 자동 확정, 오반영 0건
- 디지털관: 사진 7장 → 21초, 자동 확정 59%, OSM 외곽선 자동 정합 IoU 0.85~0.89
- 통합 경로망: 노드 5,052, 디지털관 1F 101 → 테크노관 3F 302 = 442 m

## 한계 (보고서에 그대로 적었다)

- 시간 단축률(9·11·12주차)은 **조작 수 × 표준 작업시간(가정값)** 으로 환산한 추정이다. 실측 시간이 아니다.
- 글로벌관: OSM 외곽선이 실제와 달라 자동 정합이 기준 미달 → 검수자 기준점 5점으로 정합(RMSE 4.1 m).
  B1F~2F 는 사진 반사·부분 평면으로 층 정렬 실패, 출입문 추정도 거의 안 돼 경로망에 방이 연결되지 않았다.
- 디지털관 방 195개 중 113개(58%)만 경로망에 이어져 있다(나머지는 검수 대상).
- 실내 로드뷰는 CAD 로 합성한 시점이다(실사 사진 아님).
- CRNN 을 ONNX 로 내보내는 단계는 `onnx` 패키지가 없어 건너뛰었다(가중치 `.pt` 로 동작).
- 13주차 이후 앱은 `report-campus-graph.js`(약 0.6 MB)를 추가로 읽는다.

## 월별 활동보고서

`보고서/2026-MM_활동보고서_GUMAP.docx` — [별지 1] 팀 활동 보고서 + [별지 2] 개인 활동 보고서 4명.

- **빨간 【…】** 는 지도교수 피드백·자문·교육·베타 테스트·일자·활동 사진처럼 실제로 일어난 뒤 채울 자리다.
- 개인 활동 내용은 계획서 역할 분담을 기준으로 쓴 초안이다. 각자 실제로 한 일에 맞게 고친다.
- 본문만 복사하려면 `보고서/활동보고서_본문.md`.
- 다시 만들기: `npm i docx@9` 후 `NODE_PATH=<그 node_modules> node GUMAP_report/_tools/reports/make_reports.js`
- 한글(.hwpx): `python GUMAP_report/_tools/reports/make_hwpx.py 2026-10` — 9월 제출본 hwpx 를 틀로 써서
  글자·스크린샷만 바꾼다. 활동 사진은 "사진 첨부" 자리 그림이 들어가 있으니 한글에서 그림 바꾸기로 교체.
