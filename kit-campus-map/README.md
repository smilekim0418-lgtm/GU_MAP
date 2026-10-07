# 국립금오공과대학교 캠퍼스맵

양호동캠퍼스 건물·학과·편의시설 안내와 교내 도보 길찾기를 제공하는 웹 지도입니다.
테크노관은 층별 실내지도와 호실까지의 실내 길찾기를 지원합니다. 한국어·영어를 지원합니다.

- 서버 프로그램, 데이터베이스, 외부 지도 API 키가 필요 없는 **정적 웹페이지**입니다.
- 외부 CDN을 쓰지 않습니다. 지도 엔진(MapLibre)과 글꼴(Pretendard)이 폴더 안에 들어 있습니다.
- 웹 접근성(KWCAG 2.2) 기준으로 만들었습니다. 키보드만으로 모든 기능을 쓸 수 있습니다.
  지도를 볼 수 없는 경우를 위해 같은 정보를 담은 건물 목록을 함께 제공합니다.

## 배포

`site/` 폴더 **하나만** 웹서버에 올리면 됩니다. 폴더 안의 경로가 모두 상대 경로라
어느 주소 아래에 두어도 동작합니다. 예: `https://www.kumoh.ac.kr/campusmap/`

웹서버 확인 사항

| 항목 | 내용 |
|---|---|
| HTTPS | 필요합니다. 브라우저는 HTTPS 에서만 "내 위치" 기능을 허용합니다. |
| MIME | `.js` → `text/javascript`, `.json`·`.geojson` → `application/json`, `.woff2` → `font/woff2`, `.svg` → `image/svg+xml` |
| 용량 | 약 5 MB (지도 엔진 0.8 MB, 글꼴 3.1 MB 중 화면에 필요한 조각만 받음, 지도 자료 1 MB) |
| 캐시 | `data/` 폴더는 갱신할 때 바뀌므로 캐시를 짧게 두는 것을 권장합니다. |

로컬에서 `index.html` 을 더블클릭하면 열리지 않습니다(브라우저가 `file://` 의 모듈을 막음).
올리기 전 확인은 아래처럼 합니다.

```bash
python tools/serve.py        # http://127.0.0.1:8800/
```

### 학교 홈페이지에 삽입 (iframe)

```html
<iframe src="https://www.kumoh.ac.kr/campusmap/?embed=1"
        title="국립금오공과대학교 캠퍼스맵"
        style="width:100%; height:720px; border:0"
        allow="geolocation"></iframe>
```

`embed=1` 이면 머리글을 숨기고, 바깥 링크는 새 창으로 엽니다.

## 링크 (딥링크)

주소가 화면 상태를 그대로 담습니다. 학과 홈페이지의 "오시는 길"에서 바로 걸 수 있습니다.

| 주소 | 화면 |
|---|---|
| `?b=2` | 2번 건물(테크노관) 상세 |
| `?b=edison` | 번호 없는 건물(에디슨관) 상세 |
| `?room=T312` | 테크노관 312호 (실내지도 3층) |
| `?q=도서관` | 검색 결과 |
| `?from=gate&to=b5` | 정문 → 도서관 길찾기 |
| `?from=gate&to=room:T312` | 정문 → 테크노관 312호 (실외 + 실내) |
| `?from=here&to=b3` | 내 위치 → 디지털관 |
| `&nostairs=1` | 계단 피하기 |
| `&lang=en` | 영어 |
| `&embed=1` | iframe 삽입용 |

건물 번호는 학교 캠퍼스맵(1~25번)을 따릅니다.

## 바꾸는 곳

| 바꿀 것 | 파일 |
|---|---|
| 학교 색·글꼴·간격 | `site/assets/css/tokens.css` |
| 머리글 로고 | 로고 파일을 `site/assets/brand/` 에 넣고 `brand.json` 의 `logo` 에 파일 이름 |
| 파비콘 | `site/assets/brand/favicon.svg` |
| 화면 문구 | `site/i18n/ko.json`, `site/i18n/en.json` (두 파일의 키가 같아야 함) |
| 건물·학과·시설 정보 | `tools/sources/buildings.json` → 아래 "자료 갱신" |
| 교수 이름 공개 여부 | `tools/sources/config.json` 의 `show_person_names` |

`site/data/` 는 빌드 결과물입니다. 손으로 고치지 말고 원천을 고친 뒤 다시 빌드합니다.

## 자료 갱신

```bash
python tools/fetch_sources.py     # 1) OSM·학교 건물목록을 다시 받는다 (필요할 때만)
#   tools/sources/buildings.json   2) 학과·시설·출입구를 고친다
python tools/build_data.py         # 3) site/data/ 를 다시 만든다
python -m pytest tools/tests -q    # 4) 자료 검사
npm test                           # 5) 검색·길찾기 검사 (Node 22 이상)
```

`build_data.py` 는 확인이 필요한 항목을 `확인필요목록.md` 로 뽑습니다. 담당 부서가 확인해 준
항목은 `buildings.json` 에서 `verified` 를 `true` 로 바꿉니다. 확인 전 정보는 화면에 "확인 중"
표시가 붙습니다.

### 원천 자료

| 자료 | 쓰임 |
|---|---|
| 학교 캠퍼스맵 건물목록 (`kumoh.ac.kr/ko/campusMap.do`) | 건물 번호·이름·행정실 전화의 기준 |
| 학교 홈페이지 시설안내·복지시설·학과 홈페이지 | 학과 사무실, 편의시설 위치·운영시간 |
| OpenStreetMap | 건물 외곽선, 길, 녹지, 주차장, 정류장 |
| 테크노관 도면 (GUMAP 실내지도 작업) | 테크노관 층별 실내지도·실내 길찾기 |

테크노관 실내 자료는 저장소의 `GUMAP-개발/floorplan/` 작업 결과를 `build_data.py` 가 복사해 옵니다.

## 알려진 한계

- **출입구 위치**: 테크노관 외 건물은 출입구를 건물 외곽선에서 길과 가장 가까운 곳으로
  추정했습니다. 실제 출입구 좌표를 `buildings.json` 의 `entrances` 에 넣으면 정확해집니다.
- **실내지도**: 현재 테크노관만 있습니다. 다른 건물은 도면 작업이 필요합니다.
- **계단 피하기**: OpenStreetMap 에 계단으로 표시된 길만 피합니다.
- **학과 위치**: 학과 홈페이지에서 확인한 곳만 넣었습니다. 나머지는 `확인필요목록.md` 참고.
- 운영시간 등은 학교 홈페이지 기준이며 바뀔 수 있습니다.

## 구조

```
kit-campus-map/
├── site/                 배포 폴더
│   ├── index.html
│   ├── assets/css/       tokens.css(디자인 토큰) · app.css
│   ├── assets/js/core/   검색·길찾기·주소 상태 등 화면과 무관한 로직 (Node 로 검사)
│   ├── assets/js/map/    지도 그리기 (MapLibre)
│   ├── assets/js/ui/     패널·검색·상세·길찾기 화면
│   ├── data/             빌드 결과물
│   ├── i18n/             한국어·영어 문구
│   └── vendor/           MapLibre GL JS · Pretendard · 테크노관 실내 길찾기 엔진
├── tools/                자료 수집·빌드·검사
├── tests/                Node 검사
└── 확인필요목록.md        학교 확인이 필요한 항목
```

## 라이선스

- 지도 자료: © OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/) — 지도 아래에 표기합니다.
- MapLibre GL JS: BSD-3-Clause (`site/vendor/maplibre-gl/LICENSE.txt`)
- Pretendard: SIL Open Font License 1.1 (`site/vendor/pretendard/LICENSE.txt`)
