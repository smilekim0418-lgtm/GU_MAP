# 금오공대 공식 캠퍼스맵 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학교 홈페이지에 올릴 양호동 캠퍼스 전용 정적 캠퍼스맵(`kit-campus-map/site/`)을 만든다.

**Architecture:** 원천 데이터(OSM · 학교 건물목록 API 스냅샷 · 수기 JSON · 테크노관 IMDF/nav)를
`tools/build_data.py` 가 `site/data/*.json` 으로 굽는다. 브라우저는 바닐라 ES 모듈로
`core/`(순수 로직, Node 테스트) · `map/`(MapLibre 렌더) · `ui/`(패널) 를 나눠 쓴다.
라벨은 HTML 요소, 길찾기는 브라우저 다익스트라 + 기존 `techno-route-core`.

**Tech Stack:** MapLibre GL JS 4.x(동봉), Pretendard(동봉), 바닐라 JS ES2020 모듈, CSS 변수,
Python 3(shapely 없이 표준 라이브러리) + pytest, Node 24 `node --test`.

## Global Constraints

- 배포 단위는 `kit-campus-map/site/` 하나. 외부 CDN·API 키·서버 기능 없음.
- 폴더 이름 `lib/` `build/` `dist/` 금지 (루트 `.gitignore` 가 무시한다).
- 이모지 금지. 아이콘은 SVG 선 아이콘. 강조색은 네이비 `#343b58` · 블루 `#1c83d0` 만.
- 모든 UI 문구는 `site/i18n/ko.json` · `en.json` 에 있고 두 파일의 키 집합이 같다.
- 텍스트 명도대비 4.5:1 이상, 모든 기능 키보드 조작 가능, 초점 표시 분명.
- 건물 번호·이름의 기준은 학교 캠퍼스맵 API(번호 1~25). 출처 없는 사실을 만들지 않는다.
- 수기 데이터 항목은 `source` · `verified` 를 가진다. 미확인 항목은 `kit-campus-map/확인필요목록.md` 에 오른다.
- 교수 개인 이름은 기본 비공개(`tools/sources/config.json` 의 `show_person_names: false`).
- 지도 하단 "© OpenStreetMap contributors" 표기.
- `main` 에서 직접 커밋한다 (브랜치 만들지 않음). 푸시는 사용자가 요청할 때만.

---

## File Structure

```
kit-campus-map/
├── package.json                 {"type":"module"} — node --test 용
├── README.md                    배포·데이터 갱신·딥링크·라이선스
├── 확인필요목록.md               build_data.py 산출 (학교 담당자 확인용)
├── site/
│   ├── index.html               문서 골격·랜드마크·건너뛰기 링크
│   ├── assets/css/tokens.css    색·글꼴·간격 토큰 (학교가 바꾸는 곳)
│   ├── assets/css/app.css       레이아웃·컴포넌트
│   ├── assets/icons/sprite.svg  SVG 심볼 모음
│   ├── assets/js/main.js        부트스트랩: 데이터 로드 → 지도 → UI → URL 상태
│   ├── assets/js/core/
│   │   ├── i18n.js              t(key, vars), setLang, name(obj)
│   │   ├── hangul.js            초성 추출·정규화
│   │   ├── search.js            buildIndex(places, lang) / search(index, q)
│   │   ├── geo.js               거리·방위각·투영 (미터)
│   │   ├── walk-graph.js        WalkGraph: snap, shortest(avoidStairs)
│   │   ├── steps.js             좌표열 → 안내 토큰 (언어 무관)
│   │   ├── campus-route.js      planRoute(from, to) — 실외 + 테크노관 실내 결합
│   │   └── url-state.js         parse(search) / serialize(state)
│   ├── assets/js/map/
│   │   ├── map-view.js          MapLibre 생성·스타일·카메라·3D 토글
│   │   ├── labels.js            HTML 라벨(건물 버튼) 배치·겹침 처리
│   │   ├── route-layer.js       경로 선·출발/도착 표시
│   │   └── indoor-layer.js      테크노관 층 렌더·방 라벨
│   ├── assets/js/ui/
│   │   ├── shell.js             머리글·언어 전환·embed 모드·바텀시트
│   │   ├── search-panel.js      검색창·결과·분류 칩·건물목록
│   │   ├── detail-panel.js      건물/호실 상세
│   │   ├── route-panel.js       출발·도착 선택, 결과·단계 안내
│   │   └── floor-switcher.js    실내 층 전환
│   ├── data/                    build_data.py 산출물
│   ├── i18n/ko.json, en.json
│   └── vendor/maplibre-gl/ · vendor/pretendard/ · vendor/techno-route-core.js
├── tools/
│   ├── sources/config.json      show_person_names, 캠퍼스 bbox, bearing
│   ├── sources/buildings.json   수기: 건물 상세·학과·시설·출입구
│   ├── sources/paths_manual.geojson  OSM 에 없는 보행로 보완
│   ├── sources/snapshots/       osm.json · kumoh_buildlist.json (커밋)
│   ├── fetch_sources.py
│   ├── build_data.py
│   ├── serve.py
│   └── tests/test_build.py
└── tests/                       *.test.js (node --test)
```

---

### Task 1: 뼈대 · 라이브러리 동봉 · 미리보기 서버

**Files:**
- Create: `kit-campus-map/package.json`, `kit-campus-map/tools/serve.py`, `kit-campus-map/site/vendor/maplibre-gl/{maplibre-gl.js,maplibre-gl.css,LICENSE.txt}`, `kit-campus-map/site/vendor/pretendard/*`

**Interfaces:**
- Produces: `python tools/serve.py [port=8800]` 가 `site/` 를 `http://127.0.0.1:8800/` 로 서빙. `npm test` = `node --test tests/`.

- [ ] **Step 1:** `package.json` 작성

```json
{
  "name": "kit-campus-map",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test tests/" }
}
```

- [ ] **Step 2:** MapLibre GL JS 4.x 를 npm 에서 받아 `dist/maplibre-gl.js`, `dist/maplibre-gl.css`, `LICENSE.txt` 만 `site/vendor/maplibre-gl/` 로 복사 (`npm pack maplibre-gl@4` → 압축 해제).
- [ ] **Step 3:** Pretendard 를 npm(`pretendard`)에서 받아 `dist/web/variable/pretendardvariable-dynamic-subset.css` 와 해당 woff2 묶음, `LICENSE.txt` 를 `site/vendor/pretendard/` 로 복사. CSS 안의 상대경로가 유지되는지 확인.
- [ ] **Step 4:** `tools/serve.py` — `http.server` 로 `site/` 서빙, `.js` 를 `text/javascript` 로, 캐시 끔.

```python
"""site/ 를 로컬에서 미리 본다. ES 모듈은 file:// 로 안 열린다."""
import functools, http.server, sys
from pathlib import Path

SITE = Path(__file__).resolve().parents[1] / "site"

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".json": "application/json",
                      ".geojson": "application/json", ".woff2": "font/woff2"}
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8800
    handler = functools.partial(Handler, directory=str(SITE))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"http://127.0.0.1:{port}/")
        httpd.serve_forever()

if __name__ == "__main__":
    main()
```

- [ ] **Step 5:** Commit `캠퍼스맵 뼈대: MapLibre·Pretendard 동봉, 미리보기 서버`

### Task 2: 외부 데이터 스냅샷 (`fetch_sources.py`)

**Files:**
- Create: `kit-campus-map/tools/fetch_sources.py`, `kit-campus-map/tools/sources/config.json`, `kit-campus-map/tools/sources/snapshots/{osm.json,kumoh_buildlist.json}`

**Interfaces:**
- Produces: `snapshots/osm.json` = Overpass `out body; >; out skel qt;` 원본(JSON, ways+nodes+relations). `snapshots/kumoh_buildlist.json` = 학교 API `{"items":[...]}` 원본.

- [ ] **Step 1:** `config.json`

```json
{
  "campus_name": {"ko": "국립금오공과대학교 양호동캠퍼스", "en": "Kumoh National Institute of Technology"},
  "bbox": [128.3840, 36.1395, 128.3985, 36.1505],
  "context_bbox": [128.3800, 36.1370, 128.4030, 36.1530],
  "bearing": 0,
  "walk_speed_mpm": 75,
  "show_person_names": false
}
```

- [ ] **Step 2:** `fetch_sources.py` — 학교 API 는 SSO 리다이렉트를 쿠키로 따라가야 한다(`urllib` + `http.cookiejar`). Overpass 쿼리는 `context_bbox` 안의 `building`, `highway`, `landuse`, `leisure`, `natural`, `amenity=parking|university`, `entrance`, `highway=bus_stop`, `barrier=gate`, `railway`, `waterway` 를 받는다. 미러 2곳(overpass-api.de, overpass.kumi.systems)을 순서대로 시도. 결과를 정렬된 JSON 으로 저장해 diff 가 안정되게.
- [ ] **Step 3:** 실행하고 스냅샷 확인: 학교 API 항목 25개, OSM 에 `name` 있는 건물 30개 이상, `highway` way 100개 이상.
- [ ] **Step 4:** Commit `캠퍼스맵 원천 데이터 스냅샷 (OSM · 학교 건물목록)`

### Task 3: 수기 원천 `buildings.json` + 데이터 빌드 + 검증

**Files:**
- Create: `kit-campus-map/tools/sources/buildings.json`, `kit-campus-map/tools/sources/paths_manual.geojson`, `kit-campus-map/tools/build_data.py`, `kit-campus-map/tools/tests/test_build.py`
- Output: `site/data/{basemap.geojson,buildings.geojson,places.json,walk-graph.json}`, `site/data/techno/{imdf.json,nav.json}`, `site/vendor/techno-route-core.js`, `kit-campus-map/확인필요목록.md`

**Interfaces:**
- `buildings.json` 항목:
  `{"id":"b2","no":2,"official_id":"2","osm":[441414720],"category":"academic|admin|housing|sports|facility|landmark","name":{"ko":"테크노관","en":"Techno Building"},"floors":{"above":6,"below":1,"source":"..."},"phone":[{"label":{"ko":"행정실","en":"Admin Office"},"number":"054-478-7358"}],"units":[{"kind":"dept|office|facility","name":{"ko":"","en":""},"floor":"3F","room":"312","source":"URL","verified":true}],"entrances":[[lng,lat]],"indoor":"techno"|null,"source":"URL","verified":true}`
- `places.json`: `{"buildings":[...building 상세(라벨점 center:[lng,lat], entrances, polygon 없음)], "units":[{"id","kind","name","building","floor","room","verified"}], "rooms":[{"id":"T312","building":"b2","floor":"3F","label":"312","name":{ko,en},"category"}], "gates":[{"id","name","point"}], "bus_stops":[{"id","name","point"}], "meta":{"built_at","sources"}}`
- `walk-graph.json`: `{"nodes":[[lng,lat],...],"edges":[[a,b,meters,flags],...]}` flags bit0=steps. 좌표 소수 7자리.
- `buildings.geojson` Feature 속성: `{id,no,category,name_ko,name_en,height_m}` (height = above × 3.6, 없으면 10).

- [ ] **Step 1:** 실패하는 검증 테스트 작성 (`tools/tests/test_build.py`)

```python
import json
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "site" / "data"

def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))

def test_official_numbers_complete():
    places = load("places.json")
    numbers = sorted(b["no"] for b in places["buildings"] if b.get("no"))
    assert numbers == list(range(1, 26))

def test_every_building_has_names_and_center():
    for b in load("places.json")["buildings"]:
        assert b["name"]["ko"], b["id"]
        assert b["name"]["en"], b["id"]
        lng, lat = b["center"]
        assert 128.38 < lng < 128.40 and 36.13 < lat < 36.16, b["id"]

def test_buildings_geojson_matches_places():
    ids = {f["properties"]["id"] for f in load("buildings.geojson")["features"]}
    with_shape = {b["id"] for b in load("places.json")["buildings"] if b.get("has_shape")}
    assert with_shape <= ids

def test_all_entrances_in_one_component():
    graph = load("walk-graph.json")
    n = len(graph["nodes"])
    parent = list(range(n))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for a, b, *_ in graph["edges"]:
        parent[find(a)] = find(b)
    roots = set()
    for b in load("places.json")["buildings"]:
        for e in b["entrances"]:
            roots.add(find(e["node"]))
    assert len(roots) == 1

def test_person_names_hidden_by_default():
    rooms = load("places.json")["rooms"]
    assert not any(r.get("person") for r in rooms)

def test_techno_bundle_present():
    nav = load("techno/nav.json")
    assert nav["meta"]["counts"]["entrances"] >= 1
    assert (ROOT / "site" / "vendor" / "techno-route-core.js").exists()

def test_sizes_reasonable():
    total = sum(p.stat().st_size for p in DATA.rglob("*") if p.is_file())
    assert total < 3_000_000
```

- [ ] **Step 2:** `cd kit-campus-map && python -m pytest tools/tests -q` → FAIL (파일 없음).
- [ ] **Step 3:** `buildings.json` 작성 — 학교 API 25개 전부(번호·한/영 이름·전화), API 에 없는 에디슨관·푸름관 1~4동·오름관 1~3동·관리동은 번호 없이 추가. OSM way 매칭은 이름·중심점 거리로 하고 매칭 근거를 적는다. 학과·시설은 학교 페이지에서 확인되는 것만 `verified:true`, 테크노관 room 데이터의 `dept` 는 `source:"GUMAP 테크노관 방 정보(엑셀)"`, `verified:false`. 영문명 비어 있는 것(산학협력관·국제교육관 등)은 번역해 넣고 `verified:false`.
- [ ] **Step 4:** `build_data.py` 구현:
  1. 스냅샷 로드 → OSM 노드/웨이 인덱스.
  2. basemap: 캠퍼스 경계(`amenity=university` 웨이) · 녹지(`landuse=grass|forest`, `leisure=park|garden`, `natural=wood|scrub`) · 운동장(`leisure=pitch|track|sports_centre`) · 수면 · 주차장 · 주변 도로(`highway` 중 차도) 를 `kind` 속성으로 한 FeatureCollection.
  3. buildings.geojson: `buildings.json` 의 `osm` 웨이 → 폴리곤. 매칭 안 된 OSM 건물(캠퍼스 경계 안)은 `category:"other"`, 이름 없이 회색으로 넣는다.
  4. walk-graph: 보행 가능 highway(footway, path, pedestrian, steps, service, residential, unclassified, living_street, tertiary, secondary, track, corridor) + `paths_manual.geojson` → 노드 공유 그래프, 차수 2 노드는 압축하지 않는다(경로 그리기에 필요). 캠퍼스 `context_bbox` 밖 제거. 가장 큰 연결 요소만 남긴다.
  5. 출입구: 수기 `entrances` → OSM `entrance` 노드(건물 외곽선 위) → 외곽선 꼭짓점 중 그래프에 가장 가까운 점(추정). 각 출입구를 그래프 최근접 엣지에 투영해 노드로 끼워 넣고 `node` 인덱스 기록. 테크노관은 nav.json `entrances` 를 쓴다.
  6. 정문·버스정류장: 학교 API 21번(정문), OSM `barrier=gate`/`bus_stop`.
  7. rooms: `GUMAP-데이터/data/kumoh_techno_rooms.json` + IMDF unit. 개인 이름 판정 = `^[가-힣]{2,4}$` 이고 시설 접미어(실·관·센터·실험실·강의실·사무실·휴게실·화장실·창고·준비실·연구실·교육실·라운지·홀) 로 끝나지 않음 → `show_person_names` false 면 이름을 `{"ko":"교수연구실","en":"Faculty Office"}` 로 바꾸고 `person` 키를 넣지 않는다.
  8. techno: `GUMAP-개발/floorplan/work/techno_nav.json` → `techno/nav.json` 그대로, IMDF 번들(`GUMAP-프론트/js/map/map-techno-imdf-data.js` 의 JSON) → levels·units·openings 만, 좌표 7자리로 줄여 `techno/imdf.json`. `GUMAP-개발/floorplan/techno-route-core.js` → `site/vendor/techno-route-core.js` 복사.
  9. `확인필요목록.md`: `verified:false` 항목, 추정 출입구, 영문명 보완 항목을 건물별 표로.
- [ ] **Step 5:** `python tools/build_data.py && python -m pytest tools/tests -q` → PASS. 연결 요소 테스트가 실패하면 `paths_manual.geojson` 에 끊긴 구간을 그려 넣는다.
- [ ] **Step 6:** Commit `캠퍼스맵 데이터 빌드: 건물·보행 그래프·테크노관 번들 + 검증`

### Task 4: `core/i18n.js` + 문구 파일

**Files:**
- Create: `site/assets/js/core/i18n.js`, `site/i18n/ko.json`, `site/i18n/en.json`, `tests/i18n.test.js`

**Interfaces:**
- Produces: `createI18n(messages: {ko:{}, en:{}}, lang) → {lang, t(key, vars?), name(obj), setLang(lang)}`. `name({ko,en})` → 현재 언어, 없으면 ko. `t` 의 `{n}` 치환. 없는 키는 키 그대로 반환.

- [ ] **Step 1:** 테스트

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createI18n } from '../site/assets/js/core/i18n.js';

const ko = JSON.parse(readFileSync(new URL('../site/i18n/ko.json', import.meta.url)));
const en = JSON.parse(readFileSync(new URL('../site/i18n/en.json', import.meta.url)));

test('ko 와 en 의 키 집합이 같다', () => {
  assert.deepEqual(Object.keys(ko).sort(), Object.keys(en).sort());
});

test('치환과 언어 전환', () => {
  const i = createI18n({ ko: { min: '{n}분' }, en: { min: '{n} min' } }, 'ko');
  assert.equal(i.t('min', { n: 3 }), '3분');
  i.setLang('en');
  assert.equal(i.t('min', { n: 3 }), '3 min');
  assert.equal(i.t('missing'), 'missing');
});

test('name 은 현재 언어, 없으면 한국어', () => {
  const i = createI18n({ ko: {}, en: {} }, 'en');
  assert.equal(i.name({ ko: '도서관', en: 'Library' }), 'Library');
  assert.equal(i.name({ ko: '청운대' }), '청운대');
});
```

- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** 구현 + ko/en 문구(머리글, 검색, 분류, 상세, 길찾기, 단계 안내 토큰, 실내, 오류, 접근성 라벨) 작성.
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** Commit

### Task 5: `core/hangul.js` + `core/search.js`

**Files:**
- Create: `site/assets/js/core/hangul.js`, `site/assets/js/core/search.js`, `tests/search.test.js`

**Interfaces:**
- `chosung(str) → string` (한글 음절 → 초성, 나머지 그대로), `normalize(str)` (소문자, 공백·`-`·`·` 제거).
- `buildIndex(places) → Index` — 항목 `{type:'building'|'unit'|'room', id, building, terms:[...정규화된 ko/en 이름, 번호 'b2'/'2', 방번호]}`.
- `search(index, query, {limit=30}) → [{type,id,building,score}]` 점수: 정확 100, 접두 70, 부분 40, 초성 접두 30. 같은 점수면 type 순서 building<unit<room, 다음 이름 길이.

- [ ] **Step 1:** 테스트

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, search } from '../site/assets/js/core/search.js';
import { chosung } from '../site/assets/js/core/hangul.js';

const places = {
  buildings: [
    { id: 'b2', no: 2, name: { ko: '테크노관', en: 'Techno Building' } },
    { id: 'b5', no: 5, name: { ko: '도서관', en: 'Library Building' } },
  ],
  units: [{ id: 'u1', kind: 'facility', building: 'b6', name: { ko: '도서관 열람실 안내', en: 'Reading room' } }],
  rooms: [{ id: 'T312', building: 'b2', label: '312', name: { ko: '컴퓨터실습실', en: 'Computer Lab' } }],
};

test('초성', () => { assert.equal(chosung('테크노관'), 'ㅌㅋㄴㄱ'); });

test('정확일치가 부분일치보다 위', () => {
  const r = search(buildIndex(places), '도서관');
  assert.equal(r[0].id, 'b5');
  assert.equal(r[1].id, 'u1');
});

test('번호·영문·초성·방번호', () => {
  const idx = buildIndex(places);
  assert.equal(search(idx, '2')[0].id, 'b2');
  assert.equal(search(idx, 'libr')[0].id, 'b5');
  assert.equal(search(idx, 'ㅌㅋ')[0].id, 'b2');
  assert.equal(search(idx, '312')[0].id, 'T312');
});

test('빈 검색어는 빈 결과', () => { assert.deepEqual(search(buildIndex(places), '  '), []); });
```

- [ ] **Step 2:** FAIL 확인 → **Step 3:** 구현 → **Step 4:** PASS → **Step 5:** Commit

### Task 6: `core/geo.js` + `core/walk-graph.js`

**Files:**
- Create: `site/assets/js/core/geo.js`, `site/assets/js/core/walk-graph.js`, `tests/walk-graph.test.js`

**Interfaces:**
- `geo.meters([lng,lat],[lng,lat])`, `geo.bearing(a,b)` (0~360, 북=0), `geo.projectToSegment(p,a,b) → {point,t,meters}`.
- `new WalkGraph({nodes, edges})`
  - `.snap([lng,lat]) → {edge:i, point, t, meters}` 가장 가까운 엣지 투영.
  - `.shortest(from, to, {avoidStairs}) → {meters, coords:[[lng,lat]...], stairs:bool} | null`
    `from`/`to` 는 `{node:i}` 또는 `{point:[lng,lat]}`(snap 해서 임시 노드 2개로 잇는다) 또는 그 배열(여러 출입구 → 전체 최단).

- [ ] **Step 1:** 테스트 (작은 격자 그래프로 정답 확인)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WalkGraph } from '../site/assets/js/core/walk-graph.js';

// 0 —— 1 —— 2      위 경로는 계단(1-2) 포함
// |           |
// 3 ————————— 4    아래 경로는 평지, 더 길다
const d = 0.0001;
const nodes = [[0,0],[d,0],[2*d,0],[0,-d],[2*d,-d]];
const m = (a,b) => Math.hypot((nodes[a][0]-nodes[b][0])*90000,(nodes[a][1]-nodes[b][1])*111000);
const edges = [[0,1,m(0,1),0],[1,2,m(1,2),1],[0,3,m(0,3),0],[3,4,m(3,4),0],[4,2,m(4,2),0]];
const g = new WalkGraph({ nodes, edges });

test('최단 경로는 계단을 쓴다', () => {
  const r = g.shortest({ node: 0 }, { node: 2 });
  assert.equal(r.stairs, true);
  assert.equal(r.coords.length, 3);
});

test('계단 회피', () => {
  const r = g.shortest({ node: 0 }, { node: 2 }, { avoidStairs: true });
  assert.equal(r.stairs, false);
  assert.equal(r.coords.length, 4);
});

test('여러 도착 후보 중 가까운 쪽', () => {
  const r = g.shortest({ node: 0 }, [{ node: 4 }, { node: 1 }]);
  assert.deepEqual(r.coords.at(-1), nodes[1]);
});

test('임의 점을 엣지에 붙인다', () => {
  const r = g.shortest({ point: [d/2, 0.00001] }, { node: 2 });
  assert.ok(r.meters > 0 && r.meters < m(0,2) + 5);
});

test('길이 없으면 null', () => {
  const lone = new WalkGraph({ nodes: [[0,0],[1,1]], edges: [] });
  assert.equal(lone.shortest({ node: 0 }, { node: 1 }), null);
});
```

- [ ] **Step 2:** FAIL → **Step 3:** 구현 (이진 힙 다익스트라, 임시 노드는 원본 배열을 건드리지 않게 오버레이) → **Step 4:** PASS → **Step 5:** Commit

### Task 7: `core/steps.js` + `core/campus-route.js`

**Files:**
- Create: `site/assets/js/core/steps.js`, `site/assets/js/core/campus-route.js`, `tests/campus-route.test.js`

**Interfaces:**
- `outdoorSteps(coords) → [{kind:'straight', meters} | {kind:'turn', dir:'left'|'right'|'slight-left'|'slight-right'|'uturn', meters}]` — 방향 전환 30° 이상만 turn, 15m 미만 꼬임은 합친다.
- `indoorSteps(legs) → [...]` — techno 엔진 legs 를 `{kind:'stairs'|'elevator', name, from, to}`, `{kind:'enter', name}`, walk 는 outdoorSteps 와 같은 규칙(엔진의 legs[].latlngs → [lng,lat]).
- `planRoute({graph, places, techno?}, from, to, {avoidStairs}) → {meters, minutes, outdoor:{coords}, indoor:{legs}|null, steps:[...], arrive:{...}}` 
  - from/to 형식: `{type:'gate'|'building'|'room'|'point'|'bus', id?, point?}`.
  - 건물 목적지: 그 건물 출입구 전부를 도착 후보로.
  - 방 목적지: techno 엔진의 entrances 각각까지 실외 최단을 재서 `approaches` 로 넘기고 `engine.route({outdoor:true,lat,lng}, {room_id}, {avoidStairs, approaches})`.
  - 같은 건물 안 출발→도착이면 실외 구간 0.
  - 실패 시 `{error:'no-route'|'no-route-stairs'|'unknown-place'}`.

- [ ] **Step 1:** 테스트 — 실제 빌드 산출물로 통합 확인

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { WalkGraph } from '../site/assets/js/core/walk-graph.js';
import { planRoute } from '../site/assets/js/core/campus-route.js';
import { outdoorSteps } from '../site/assets/js/core/steps.js';

const read = (p) => JSON.parse(readFileSync(new URL('../site/data/' + p, import.meta.url)));
const require = createRequire(import.meta.url);
const TechnoRoute = require('../site/vendor/techno-route-core.js');
const places = read('places.json');
const graph = new WalkGraph(read('walk-graph.json'));
const techno = TechnoRoute.load(read('techno/nav.json'));
const ctx = { graph, places, techno };

test('ㄱ자 경로는 직진-회전-직진', () => {
  const s = outdoorSteps([[0,0],[0,0.0005],[0.0005,0.0005]]);
  assert.deepEqual(s.map(x => x.kind), ['straight','turn','straight']);
  assert.equal(s[1].dir, 'right');
});

test('정문 → 도서관', () => {
  const r = planRoute(ctx, { type: 'gate', id: 'main' }, { type: 'building', id: 'b5' });
  assert.ok(!r.error, r.error);
  assert.ok(r.meters > 100 && r.meters < 1200, String(r.meters));
  assert.equal(r.indoor, null);
});

test('정문 → 테크노관 방: 실외+실내', () => {
  const room = places.rooms.find(x => x.building === 'b2' && x.floor === '3F');
  const r = planRoute(ctx, { type: 'gate', id: 'main' }, { type: 'room', id: room.id });
  assert.ok(!r.error, r.error);
  assert.ok(r.indoor && r.indoor.legs.length > 0);
  assert.ok(r.steps.some(s => s.kind === 'enter'));
});

test('모르는 장소', () => {
  const r = planRoute(ctx, { type: 'building', id: 'nope' }, { type: 'building', id: 'b5' });
  assert.equal(r.error, 'unknown-place');
});
```

- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** PASS → **Step 5:** Commit

### Task 8: `core/url-state.js`

**Files:**
- Create: `site/assets/js/core/url-state.js`, `tests/url-state.test.js`

**Interfaces:**
- `parse(search: string) → {b?, room?, q?, from?, to?, lang?, embed:boolean, floor?}`; 값 검증(b 는 `^\d{1,3}$|^b[\w-]+$`, room 은 `^[A-Z]?\w{1,8}$`).
- `serialize(state) → string` ('?' 포함, 비어 있으면 ''). 키 순서 고정: b, room, floor, q, from, to, lang, embed.
- `endpointToString({type,id})` / `endpointFromString(s)`: `gate:main` · `b5` · `room:T312` · `here` · `bus:<id>`.

- [ ] **Step 1:** 테스트

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, serialize, endpointFromString, endpointToString } from '../site/assets/js/core/url-state.js';

test('왕복', () => {
  const s = { b: '2', lang: 'en', embed: true };
  assert.deepEqual(parse(serialize(s)), { ...s });
});
test('잘못된 값은 버린다', () => {
  assert.deepEqual(parse('?b=<script>&room=../../x'), { embed: false });
});
test('끝점 문자열', () => {
  assert.deepEqual(endpointFromString('room:T312'), { type: 'room', id: 'T312' });
  assert.deepEqual(endpointFromString('b5'), { type: 'building', id: 'b5' });
  assert.deepEqual(endpointFromString('gate'), { type: 'gate', id: 'main' });
  assert.equal(endpointToString({ type: 'building', id: 'b5' }), 'b5');
  assert.equal(endpointFromString('???'), null);
});
```

- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** PASS → **Step 5:** Commit

### Task 9: 화면 골격 · 디자인 토큰 · 아이콘

**Files:**
- Create: `site/index.html`, `site/assets/css/tokens.css`, `site/assets/css/app.css`, `site/assets/icons/sprite.svg`, `site/assets/js/ui/shell.js`, `site/assets/js/main.js`

**Interfaces:**
- `index.html` 구조: `a.skip-link[href=#panel]` → `header.site-header`(학교명·"캠퍼스맵"·언어 버튼) → `main` 안에 `aside#panel[aria-label]`(검색·목록·상세·길찾기 영역 `section` 들) 과 `div#map[role=region][aria-label]`. `div#live[aria-live=polite].sr-only`.
- `shell.js`: `initShell({i18n, embed, onLang})`, `setSheet('peek'|'half'|'full')`(모바일), `announce(text)`.
- 토큰: `--c-navy:#343b58; --c-blue:#1c83d0; --c-ink:#1d2129; --c-ink-2:#4b5361; --c-line:#dfe3e8; --c-bg:#ffffff; --c-bg-2:#f4f5f7; --c-focus:#1c83d0;` 분류색 5개(대비 확인), `--space-1..8` (4px 배수), `--radius:6px`, 글꼴 `Pretendard Variable, Pretendard, 'Noto Sans KR', system-ui`.
- 반응형: ≥960px 왼쪽 패널 400px, 미만은 바텀시트(peek 88px / half 50vh / full calc(100vh-56px)).

- [ ] **Step 1:** 골격·토큰·CSS 작성, `main.js` 는 i18n 로드 후 shell 만 그린다.
- [ ] **Step 2:** `python tools/serve.py` → 브라우저 1280×800, 390×844 에서 머리글·패널·지도 영역 배치 확인, 키보드 Tab 순서(건너뛰기 → 언어 → 검색) 확인.
- [ ] **Step 3:** Commit

### Task 10: 지도 렌더링 (`map-view.js`, `labels.js`)

**Files:**
- Create: `site/assets/js/map/map-view.js`, `site/assets/js/map/labels.js`; Modify: `main.js`

**Interfaces:**
- `createMapView(container, {basemap, buildings, places, config, i18n}) → view`
  - `view.focusBuilding(id, {padding})`, `view.highlight(id|null)`, `view.setCategoryFilter(cat|null)`, `view.toggle3D()`, `view.resetNorth()`, `view.map` (MapLibre 인스턴스), 이벤트 `view.on('select', ({type,id}) => …)`.
  - WebGL 불가 시 `null` 반환 → main 이 목록 모드로.
- 스타일: 배경 `--c-bg-2` 계열, 녹지 연녹, 운동장, 주차장(P 표시 없이 회색 면), 주변 도로 흰 선 + 회색 테두리, 캠퍼스 경계 바깥은 약간 어둡게(마스크), 건물 fill 분류색 + 진한 외곽선, 선택 건물 강조. `fill-extrusion` 레이어는 3D 토글 시에만 보인다.
- `labels.js`: 건물마다 `<button class="bldg-label" data-id>` (번호 배지 + 이름). 줌 < 16.3 이면 번호만, 이상이면 번호+이름. 겹치면 번호 있는 쪽 우선. 키보드 포커스 시 지도 이동 없음, Enter 로 선택.
- 컨트롤: 확대/축소, 나침반(북쪽 정렬), 3D, 내 위치. 모두 `<button aria-label>`.
- 하단 저작권 "© OpenStreetMap contributors".

- [ ] **Step 1:** 구현 → **Step 2:** 브라우저 확인(전체 캠퍼스가 첫 화면에 들어온다, 라벨 겹침 없음, 3D 전환, 콘솔 오류 0) → **Step 3:** Commit

### Task 11: 검색·목록·상세 패널

**Files:**
- Create: `site/assets/js/ui/search-panel.js`, `site/assets/js/ui/detail-panel.js`; Modify: `main.js`

**Interfaces:**
- `initSearchPanel(root, {index, places, i18n, onPick({type,id}), onCategory(cat)})` — 입력 디바운스 120ms, 결과를 종류별 그룹 `role=listbox` + 화살표 키 이동, 결과 수 `announce`. 검색어 없을 때는 분류 칩(전체·교육연구·행정지원·생활관·체육·편의) + 번호순 건물목록(텍스트 대체 수단).
- `showDetail(root, {type,id}, {places, i18n, onRoute(to), onIndoor(id), onShare()})` — 건물: 번호 배지, 이름 ko/en, 분류, 층수, 전화(`tel:` 링크), 입주 학과·부서(층/호실), 건물 내 편의시설, 미확인 항목은 "확인 중" 작은 표시. 버튼: 길찾기 · 실내지도(indoor 있을 때) · 링크 복사. 방: 건물·층·호실·이름, 버튼: 길찾기 · 실내에서 보기.
- 뒤로 버튼은 목록으로, `Esc` 동일.

- [ ] **Step 1:** 구현 → **Step 2:** 브라우저: "도서관" 검색 → 상세 → 지도 강조, "ㅌㅋ" → 테크노관, "312" → 방, 키보드만으로 같은 흐름 → **Step 3:** Commit

### Task 12: 길찾기 패널 · 경로 레이어

**Files:**
- Create: `site/assets/js/ui/route-panel.js`, `site/assets/js/map/route-layer.js`; Modify: `main.js`

**Interfaces:**
- `openRoutePanel(root, {to, from?, ctx, i18n, onResult(result)})` — 출발 선택: 정문 · 버스정류장 · 건물 · 내 위치(위치 권한, 캠퍼스 bbox 밖이면 비활성 안내). 도착: 검색으로 건물/호실. "계단 회피" 체크박스. 결과: 거리 m, 시간 분, 단계 목록(`ol`), `announce`.
- `route-layer.js`: `showRoute(map, result)` — 실외 선(블루 실선, 흰 테두리), 실내 구간은 층별(현재 층만 진하게), 출발·도착 표식, 경로 bbox 로 카메라. `clearRoute(map)`.
- 단계 문구는 i18n 토큰으로 조립: `step.straight`("{m}m 직진") 등.

- [ ] **Step 1:** 구현 → **Step 2:** 브라우저: 정문→도서관, 정문→테크노관 3층 방, 계단 회피 차이 확인 → **Step 3:** Commit

### Task 13: 테크노관 실내지도

**Files:**
- Create: `site/assets/js/map/indoor-layer.js`, `site/assets/js/ui/floor-switcher.js`; Modify: `main.js`, `detail-panel.js`

**Interfaces:**
- `enterIndoor(view, {imdf, places, floor='1F', i18n, onRoom(id)})` / `exitIndoor(view)` / `setFloor(floor)`.
- 렌더: 해당 층 unit 을 분류별(강의실·연구실·사무실·계단·엘리베이터·화장실·복도) 색으로, 외곽 footprint, 문(opening) 짧은 선. 방 라벨은 줌 ≥ 18 에서 호실 번호, ≥ 19.3 에서 이름. 계단·엘리베이터·화장실은 SVG 아이콘 라벨.
- 층 전환기: 세로 `radiogroup`(6F…B1F), 경로가 지나는 층에 점 표시.
- 실내 모드에서 다른 건물 라벨은 흐리게.

- [ ] **Step 1:** 구현 → **Step 2:** 브라우저: 테크노관 상세 → 실내지도 → 층 전환 → 방 클릭 → 상세, 방 길찾기 시 층 전환 연동 → **Step 3:** Commit

### Task 14: URL 상태 · 언어 · embed · 예외 처리

**Files:**
- Modify: `main.js`, `shell.js`, 각 패널

**Interfaces:**
- 상태 변화마다 `history.pushState(serialize(state))`, `popstate` 로 복원. 첫 로드 시 `parse(location.search)` 적용, 잘못된 값은 버리고 짧은 안내.
- 언어 전환: `<html lang>`·문구·지도 라벨·패널 다시 그림, `?lang=` 반영.
- `embed=1`: 머리글 숨김, 외부 링크 `target=_blank rel=noopener`.
- 데이터 로드 실패: 패널에 오류 + 다시 시도. WebGL 불가: 지도 영역에 안내 + 패널 목록 모드.

- [ ] **Step 1:** 구현 → **Step 2:** 브라우저: `?b=5`, `?room=<id>`, `?from=gate&to=b5&lang=en`, `?embed=1`, 뒤로가기 → **Step 3:** Commit

### Task 15: 마감 — 접근성 점검 · README · 확인필요목록

**Files:**
- Create/Modify: `kit-campus-map/README.md`, `kit-campus-map/확인필요목록.md`

- [ ] **Step 1:** 브라우저에서 axe-core(일회용, 저장소에 넣지 않음)로 위반 0 목표, 명도대비·라벨·랜드마크 확인. 200% 확대, `prefers-reduced-motion`.
- [ ] **Step 2:** README: 무엇인가 / 배포(“site 폴더를 올린다”, iframe 예시) / 딥링크 표 / 데이터 갱신 절차(fetch → 수기 수정 → build → pytest) / 색·로고 바꾸는 곳 / 개인 이름 공개 옵션 / 라이선스.
- [ ] **Step 3:** 전체 테스트 `npm test && python -m pytest tools/tests -q` PASS, 데스크톱·모바일 스크린샷 최종 확인.
- [ ] **Step 4:** Commit
