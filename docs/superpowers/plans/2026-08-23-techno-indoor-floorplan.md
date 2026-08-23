# 테크노관 층별 실내지도 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 테크노관 B1F~6F 도면 PDF에서 실제 방 폴리곤을 추출하고 정사영상 기준으로 좌표를 잡아, 기존 IMDF 실내지도의 가짜 사각형 도형을 진짜 도면 형상으로 교체한다.

**Architecture:** 도면 픽셀 좌표계에서 폴리곤 추출과 방번호 매칭을 완결한 뒤(좌표 무관), 유사변환 1개로 전 층을 WGS84로 옮긴다. 속성은 엑셀에서 오고 도형만 교체하므로 `map-techno-indoor.js`는 수정하지 않는다. Python CLI 4개 + 브라우저 보정 화면 1개로 구성한다.

**Tech Stack:** Python 3.13, PyMuPDF(래스터화), OpenCV(벽선/폴리곤), shapely(검증), openpyxl(엑셀), Windows WinRT OCR(PowerShell 경유), Leaflet(보정 화면), pytest(테스트)

## Global Constraints

- **`GUMAP-프론트/js/map/map-techno-indoor.js`는 수정하지 않는다.** 이 파일이 바뀌어야 한다면 설계가 틀린 것이다.
- IMDF `unit` 스키마를 유지한다: `properties.level_id`, `category`, `label.ko-KR`, `name.ko-KR`, `department`, `research_tags`.
- `category`는 다음 11종만 쓴다: `laboratory` `classroom` `office` `restroom` `stairs` `elevator` `walkway` `utility` `breakroom` `library` `atrium`.
- 좌표 변환은 **전 층 공유 1개**. 층별 변환을 만들지 않는다.
- 유사변환 축척은 `1.0 ± 0.02`를 벗어나면 오류로 중단한다.
- 도면 실측 전체 치수는 `90200 x 88700` (mm).
- 기준 위도는 `36.1466`.
- 엑셀 방 수는 361개(B1F 32, 1F 76, 2F 70, 3F 69, 4F 82, 5F 24, 6F 8).
- 층 목록과 순서: `["B1F","1F","2F","3F","4F","5F","6F"]`.
- 모든 Python 파일은 UTF-8로 저장한다. 콘솔 출력 시 `sys.stdout.reconfigure(encoding="utf-8")`를 호출한다(Windows 기본 콘솔 인코딩이 한글을 깨뜨린다).
- 테스트 실행: `python -m pytest "GUMAP-개발/floorplan/tests" -v`

---

## File Structure

```
GUMAP-개발/floorplan/
  .gitignore                  work/ 산출물 제외
  requirements.txt            shapely
  README.md                   실행 순서
  fp/
    __init__.py
    config.py                 층↔PDF 매핑, 상수, 경로
    excel.py                  엑셀 로딩 + 방번호 정규화
    raster.py                 PDF → 400dpi PNG
    rooms.py                  벽선 추출 + 방 폴리곤 추출
    ocr.py                    Windows OCR 래퍼
    ocr_win.ps1               WinRT OCR 스크립트
    labels.py                 OCR ↔ 폴리곤 매칭, 미매칭 분류
    georef.py                 유사변환 산출/적용, 도면틀 기준점 검출
    ortho.py                  정사영상 타일 스티칭 (정확한 경계 계산)
    imdf.py                   IMDF geojson 생성
    validate.py               검증
    qc.py                     QC 이미지 생성
  01_extract.py               CLI
  02_label.py                 CLI
  03_georef.py                CLI
  04_build_imdf.py            CLI
  floorplan-editor.html       방 보정 화면 (도면 픽셀 좌표)
  georef-picker.html          좌표 대응점 지정 화면 (도면 ↔ 정사영상)
  serve_editor.py             두 화면용 로컬 저장 서버
  techno_georef.json          좌표 변환 파라미터
  work/                       중간 산출물 (gitignore)
  tests/
    conftest.py
    test_config.py
    test_excel.py
    test_raster.py
    test_rooms.py
    test_ocr.py
    test_labels.py
    test_georef.py
    test_ortho.py
    test_qc.py
    test_imdf.py
    test_validate.py
```

**책임 분리:** `fp/` 안의 각 모듈은 순수 함수 위주로 하나의 일만 한다. CLI 4개는 모듈을 조립만 한다. 좌표 관련 코드는 `georef.py`에만 있고, 그 앞 단계(`rooms`, `labels`)는 도면 픽셀 좌표만 다룬다. 이 경계 덕분에 좌표를 다시 잡아도 폴리곤을 재추출하지 않는다.

**인간 개입 지점:** Task 8까지는 전부 자동이다. Task 9 실행 전에 **사용자가 보정 화면에서 정사영상 위 대응점을 찍어야 한다.** 이 값 없이는 Task 9가 실행을 거부한다.

---

## Task 1: 프로젝트 뼈대와 설정

**Files:**
- Create: `GUMAP-개발/floorplan/requirements.txt`
- Create: `GUMAP-개발/floorplan/.gitignore`
- Create: `GUMAP-개발/floorplan/fp/__init__.py`
- Create: `GUMAP-개발/floorplan/fp/config.py`
- Test: `GUMAP-개발/floorplan/tests/conftest.py`, `GUMAP-개발/floorplan/tests/test_config.py`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `fp.config.FLOORS: list[str]`
  - `fp.config.SOURCES: dict[str, tuple[str, int]]` — 층 → (PDF 파일명, 0-based 페이지)
  - `fp.config.SHEET_BY_FLOOR: dict[str, str]` — 층 → 엑셀 시트명
  - `fp.config.EXPECTED_ROOM_COUNTS: dict[str, int]`
  - `fp.config.DRAWING_EXTENT_MM: tuple[int, int]`
  - `fp.config.REFERENCE_LATITUDE: float`
  - `fp.config.RENDER_DPI: int`
  - `fp.config.SCALE_TOLERANCE: tuple[float, float]`
  - `fp.config.CATEGORIES: frozenset[str]`
  - `fp.config.PROJECT_ROOT: Path`, `PLAN_DIR: Path`, `EXCEL_PATH: Path`, `IMDF_DIR: Path`, `WORK_DIR: Path`
  - `fp.config.plan_source(floor) -> tuple[Path, int]`

- [ ] **Step 1: 의존성 파일과 gitignore 작성**

`GUMAP-개발/floorplan/requirements.txt`:

```
shapely>=2.0
```

`GUMAP-개발/floorplan/.gitignore`:

```
work/
__pycache__/
```

- [ ] **Step 2: shapely 설치**

Run: `python -m pip install shapely`
Expected: `Successfully installed shapely-2.x.x` (또는 already satisfied)

확인: `python -c "import shapely; print(shapely.__version__)"` → `2.1.2` 등 버전 출력

- [ ] **Step 3: 실패하는 테스트 작성**

`GUMAP-개발/floorplan/tests/conftest.py`:

```python
import sys
from pathlib import Path

# fp 패키지를 import 가능하게 한다
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
```

`GUMAP-개발/floorplan/tests/test_config.py`:

```python
from fp import config


def test_floor_list_is_ordered_basement_first():
    assert config.FLOORS == ["B1F", "1F", "2F", "3F", "4F", "5F", "6F"]


def test_every_floor_has_a_plan_source():
    assert set(config.SOURCES) == set(config.FLOORS)


def test_b1f_and_1f_and_2f_come_from_the_same_shared_frame_pdf():
    assert config.SOURCES["B1F"] == ("테크노관B1F~2F.pdf", 0)
    assert config.SOURCES["1F"] == ("테크노관B1F~2F.pdf", 1)
    assert config.SOURCES["2F"] == ("테크노관2층.pdf", 0)


def test_6f_is_the_second_page_of_the_5_6_pdf():
    assert config.SOURCES["6F"] == ("테크노관5.6층.pdf", 1)


def test_expected_room_counts_total_361():
    assert sum(config.EXPECTED_ROOM_COUNTS.values()) == 361


def test_drawing_extent_matches_dimension_chain():
    assert config.DRAWING_EXTENT_MM == (90200, 88700)


def test_scale_tolerance_is_two_percent():
    assert config.SCALE_TOLERANCE == (0.98, 1.02)


def test_categories_match_the_indoor_module_style_table():
    assert config.CATEGORIES == frozenset({
        "laboratory", "classroom", "office", "restroom", "stairs",
        "elevator", "walkway", "utility", "breakroom", "library", "atrium",
    })


def test_plan_source_returns_an_existing_pdf():
    path, page = config.plan_source("2F")
    assert path.exists(), f"도면 PDF를 찾을 수 없음: {path}"
    assert page == 0


def test_excel_path_exists():
    assert config.EXCEL_PATH.exists(), f"엑셀을 찾을 수 없음: {config.EXCEL_PATH}"
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_config.py" -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'fp'`

- [ ] **Step 5: config 구현**

`GUMAP-개발/floorplan/fp/__init__.py`:

```python
"""테크노관 도면 → IMDF 변환 도구."""
```

`GUMAP-개발/floorplan/fp/config.py`:

```python
"""층별 도면 소스와 프로젝트 전역 상수."""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]

PLAN_DIR = (
    PROJECT_ROOT
    / "GIS_DATA"
    / "금오공과대학교_학교_설계도"
    / "양호동캠퍼스"
    / "테크노관"
    / "도면만_있는_파일"
)
EXCEL_PATH = (
    PROJECT_ROOT / "GUMAP-학교지도" / "엑셀정보(방 상세정보)" / "테크노관_방_정보.xlsx"
)
IMDF_DIR = PROJECT_ROOT / "GUMAP-학교지도" / "data" / "imdf" / "techno"
ORTHO_DIR = PROJECT_ROOT / "GIS_DATA" / "금오공대_최종산출물" / "2. 정사영상"

TOOL_DIR = Path(__file__).resolve().parents[1]
WORK_DIR = TOOL_DIR / "work"
GEOREF_PATH = TOOL_DIR / "techno_georef.json"

FLOORS = ["B1F", "1F", "2F", "3F", "4F", "5F", "6F"]

# 층 → (PDF 파일명, 0-based 페이지 번호)
# 페이지 하단 표제(지하1층/1층/2층 평면도)로 확인한 값이다.
# 같은 층이 여러 PDF 에 중복 수록되어 있어, 19개 페이지를 전부 OCR 해서
# 방번호 회수율이 가장 높은 원본을 층마다 골랐다. 측정 회수율:
#   B1F 41% · 1F 67% · 2F 94% · 3F 88% · 4F 77% · 5F 79% · 6F 12%
# 고르기 전 기본값이었다면 1F 46% · 4F 60% · 5F 17% 였다.
# 5F 의 5.6층.pdf 는 얇은 아웃라인 CAD 폰트라 OCR 이 숫자를 거의 못 읽는다
# (같은 영역을 잘라 비교했을 때 2F 는 읽고 5F 는 0개).
# 고른 원본이 전부 표준 90,200 치수 체인을 그대로 갖고 있음을 육안 확인했다.
SOURCES = {
    "B1F": ("테크노관B1F~2F.pdf", 0),
    "1F": ("테크노관1,2층.pdf", 0),
    "2F": ("테크노관2층.pdf", 0),
    "3F": ("테크노관3층.pdf", 0),
    "4F": ("테크노관2,4층.pdf", 1),
    "5F": ("테크노관4,5층.pdf", 1),
    "6F": ("테크노관5.6층.pdf", 1),
}

SHEET_BY_FLOOR = {
    "B1F": "TB1F",
    "1F": "T1F",
    "2F": "T2F",
    "3F": "T3F",
    "4F": "T4F",
    "5F": "T5F",
    "6F": "T6F",
}

EXPECTED_ROOM_COUNTS = {
    "B1F": 32, "1F": 76, "2F": 70, "3F": 69, "4F": 82, "5F": 24, "6F": 8,
}

DRAWING_EXTENT_MM = (90200, 88700)
REFERENCE_LATITUDE = 36.1466
RENDER_DPI = 400
SCALE_TOLERANCE = (0.98, 1.02)

METERS_PER_DEG_LAT = 110540.0
METERS_PER_DEG_LON_AT_EQUATOR = 111320.0

CATEGORIES = frozenset({
    "laboratory", "classroom", "office", "restroom", "stairs",
    "elevator", "walkway", "utility", "breakroom", "library", "atrium",
})


def plan_source(floor: str) -> tuple[Path, int]:
    """층 이름 → (PDF 절대경로, 0-based 페이지)."""
    if floor not in SOURCES:
        raise KeyError(f"알 수 없는 층: {floor}")
    name, page = SOURCES[floor]
    return PLAN_DIR / name, page
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_config.py" -v`
Expected: PASS (11 passed)

- [ ] **Step 7: 커밋**

```bash
git add "GUMAP-개발/floorplan/requirements.txt" "GUMAP-개발/floorplan/.gitignore" "GUMAP-개발/floorplan/fp/__init__.py" "GUMAP-개발/floorplan/fp/config.py" "GUMAP-개발/floorplan/tests/conftest.py" "GUMAP-개발/floorplan/tests/test_config.py"
git commit -m "feat(floorplan): add config with per-floor drawing sources"
```

---

## Task 2: 엑셀 방 속성 로더

**Files:**
- Create: `GUMAP-개발/floorplan/fp/excel.py`
- Test: `GUMAP-개발/floorplan/tests/test_excel.py`

**Interfaces:**
- Consumes: `fp.config.EXCEL_PATH`, `fp.config.SHEET_BY_FLOOR`, `fp.config.EXPECTED_ROOM_COUNTS`, `fp.config.CATEGORIES`
- Produces:
  - `fp.excel.Room` — dataclass: `room_id: str`, `floor: str`, `name: str`, `dept: str`, `tags: list[str]`, `category: str`
  - `fp.excel.normalize_room_id(raw: str) -> str`
  - `fp.excel.guess_category(name: str) -> str`
  - `fp.excel.load_rooms(path: Path | None = None) -> dict[str, list[Room]]` — 층 → Room 리스트

- [ ] **Step 1: 실패하는 테스트 작성**

`GUMAP-개발/floorplan/tests/test_excel.py`:

```python
import pytest

from fp import config, excel


def test_normalize_strips_basement_prefix():
    assert excel.normalize_room_id("T_B101") == "B101"


def test_normalize_strips_plain_prefix():
    assert excel.normalize_room_id("T201") == "201"


def test_normalize_keeps_suffix():
    assert excel.normalize_room_id("T305-1") == "305-1"


def test_normalize_trims_whitespace():
    assert excel.normalize_room_id("  T601  ") == "601"


def test_category_classroom():
    assert excel.guess_category("대강의실") == "classroom"
    assert excel.guess_category("세미나실") == "classroom"
    assert excel.guess_category("시청각실") == "classroom"


def test_category_laboratory():
    assert excel.guess_category("창의재료실험실") == "laboratory"
    assert excel.guess_category("탄소재료연구실") == "laboratory"


def test_category_restroom():
    assert excel.guess_category("화장실") == "restroom"
    assert excel.guess_category("샤워실") == "restroom"


def test_category_utility():
    assert excel.guess_category("전기실") == "utility"
    assert excel.guess_category("기계실") == "utility"
    assert excel.guess_category("배기실") == "utility"


def test_category_library():
    assert excel.guess_category("독서실") == "library"


def test_category_breakroom_handles_the_spelling_used_in_the_spreadsheet():
    # 실제 엑셀은 "휴게실" 이 아니라 "휴계실" 로 적혀 있다 (1F 108/110/160)
    assert excel.guess_category("학생휴계실") == "breakroom"
    assert excel.guess_category("교수휴계실 및 보관함실") == "breakroom"
    assert excel.guess_category("휴게실") == "breakroom"


def test_category_falls_back_to_office():
    assert excel.guess_category("관리실") == "office"
    assert excel.guess_category("") == "office"


def test_real_breakrooms_in_the_spreadsheet_are_classified():
    """죽은 규칙 방지: 실제 데이터에 대해 규칙이 실제로 걸리는지 확인한다."""
    rooms = excel.load_rooms()
    by_id = {r.room_id: r for r in rooms["1F"]}
    assert by_id["160"].category == "breakroom"
    assert by_id["108"].category == "breakroom"


def test_every_guessed_category_is_valid():
    for name in ["강의실", "실험실", "화장실", "전기실", "독서실", "휴게실", "", "관리실"]:
        assert excel.guess_category(name) in config.CATEGORIES


def test_load_rooms_returns_every_floor():
    rooms = excel.load_rooms()
    assert set(rooms) == set(config.FLOORS)


def test_load_rooms_counts_match_expected():
    rooms = excel.load_rooms()
    actual = {floor: len(items) for floor, items in rooms.items()}
    assert actual == config.EXPECTED_ROOM_COUNTS


def test_load_rooms_total_is_361():
    rooms = excel.load_rooms()
    assert sum(len(v) for v in rooms.values()) == 361


def test_room_ids_are_normalized():
    rooms = excel.load_rooms()
    ids = {r.room_id for r in rooms["B1F"]}
    assert "B101" in ids
    assert "T_B101" not in ids


def test_known_room_name_is_read_correctly():
    rooms = excel.load_rooms()
    by_id = {r.room_id: r for r in rooms["B1F"]}
    assert by_id["B106"].name == "창의재료실험실"
    assert by_id["B106"].category == "laboratory"


def test_tags_are_collected_from_flag_columns():
    rooms = excel.load_rooms()
    by_id = {r.room_id: r for r in rooms["2F"]}
    assert "지방대학특성화사업" in by_id["201"].tags
    assert by_id["203"].tags == ["CK-1"]


def test_rooms_without_a_name_still_load():
    rooms = excel.load_rooms()
    by_id = {r.room_id: r for r in rooms["B1F"]}
    assert by_id["B101"].name == ""
    assert by_id["B101"].category == "office"


def test_room_ids_are_unique_within_a_floor():
    rooms = excel.load_rooms()
    for floor, items in rooms.items():
        ids = [r.room_id for r in items]
        assert len(ids) == len(set(ids)), f"{floor}에 중복 방번호가 있음"
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_excel.py" -v`
Expected: FAIL — `ImportError: cannot import name 'excel'`

- [ ] **Step 3: excel 모듈 구현**

`GUMAP-개발/floorplan/fp/excel.py`:

```python
"""테크노관_방_정보.xlsx 에서 방 속성을 읽는다.

엑셀이 방 이름·학과·사업태그의 단일 원본이다. 도면에서는 방 번호만 읽고
이름은 여기서 가져온다.
"""
from dataclasses import dataclass, field
from pathlib import Path

import openpyxl

from . import config

# 사업 플래그 컬럼 (헤더 순서 고정). 값이 'O'면 태그로 넣는다.
FLAG_COLUMNS = ["CK-1", "지방대학특성화사업", "산학융합연구실", "BK21", "LAB30"]

# 이름 → category 규칙. 위에서부터 먼저 걸리는 것을 쓴다.
#
# 주의: 엑솔 이름은 361개 중 292개만 채워져 있다. 화장실·샤워실·계단 같은
# 서비스 공간은 엑셀에서 전부 이름이 비어 있고 도면에만 적혀 있다. 그래서
# restroom/utility/breakroom 규칙은 엑셀만 보면 거의 걸리지 않고, 주로
# Task 6 에서 도면 OCR 로 얻은 이름에 대해 동작한다.
# 표기 변형에 주의: 실제 엑셀은 "휴게실" 이 아니라 "휴계실" 로 적혀 있고,
# OCR 은 "샤워실" 을 "사워실" 로 읽는다. 두 표기를 모두 넣는다.
CATEGORY_RULES = [
    (("화장실", "샤워실", "사워실"), "restroom"),
    (("강의실", "세미나실", "시청각실", "강의룸"), "classroom"),
    (("실험실", "연구실", "실습실"), "laboratory"),
    (("전기실", "기계실", "발전실", "배기실", "펌프실", "기관실"), "utility"),
    (("독서실", "자료실", "도서실"), "library"),
    (("휴게실", "휴계실"), "breakroom"),
]


@dataclass
class Room:
    room_id: str
    floor: str
    name: str = ""
    dept: str = ""
    tags: list[str] = field(default_factory=list)
    category: str = "office"


def normalize_room_id(raw: str) -> str:
    """엑셀 방번호를 도면 표기와 같은 형태로 바꾼다.

    T_B101 -> B101, T201 -> 201, T305-1 -> 305-1
    """
    s = str(raw).strip()
    if s.startswith("T_"):
        return s[2:]
    if s.startswith("T"):
        return s[1:]
    return s


def guess_category(name: str) -> str:
    """방 이름으로 IMDF category 를 정한다. 판단이 안 되면 office."""
    text = (name or "").strip()
    if not text:
        return "office"
    for keywords, category in CATEGORY_RULES:
        if any(k in text for k in keywords):
            return category
    return "office"


def load_rooms(path: Path | None = None) -> dict[str, list[Room]]:
    """층 → Room 리스트."""
    xlsx = path or config.EXCEL_PATH
    workbook = openpyxl.load_workbook(xlsx, data_only=True)
    sheet_to_floor = {v: k for k, v in config.SHEET_BY_FLOOR.items()}

    result: dict[str, list[Room]] = {floor: [] for floor in config.FLOORS}
    for sheet in workbook.worksheets:
        floor = sheet_to_floor.get(sheet.title)
        if floor is None:
            continue
        header = [str(c or "").strip() for c in next(sheet.iter_rows(max_row=1, values_only=True))]
        flag_index = {name: header.index(name) for name in FLAG_COLUMNS if name in header}

        for row in sheet.iter_rows(min_row=2, values_only=True):
            if not row or not row[0]:
                continue
            name = str(row[1]).strip() if len(row) > 1 and row[1] else ""
            dept = str(row[2]).strip() if len(row) > 2 and row[2] else ""
            tags = [
                flag
                for flag, idx in flag_index.items()
                if idx < len(row) and str(row[idx] or "").strip().upper() == "O"
            ]
            result[floor].append(
                Room(
                    room_id=normalize_room_id(row[0]),
                    floor=floor,
                    name=name,
                    dept=dept,
                    tags=tags,
                    category=guess_category(name),
                )
            )
    return result
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_excel.py" -v`
Expected: PASS (18 passed)

`test_tags_are_collected_from_flag_columns` 가 실패하면 실제 엑셀 값을 먼저 확인한다:

```bash
python -X utf8 -c "import sys; sys.path.insert(0,'GUMAP-개발/floorplan'); sys.stdout.reconfigure(encoding='utf-8'); from fp import excel; r=excel.load_rooms(); print([(x.room_id,x.name,x.tags) for x in r['2F'][:4]])"
```

- [ ] **Step 5: 커밋**

```bash
git add "GUMAP-개발/floorplan/fp/excel.py" "GUMAP-개발/floorplan/tests/test_excel.py"
git commit -m "feat(floorplan): load room attributes from the source spreadsheet"
```

---

## Task 3: 도면 PDF 래스터화

**Files:**
- Create: `GUMAP-개발/floorplan/fp/raster.py`
- Test: `GUMAP-개발/floorplan/tests/test_raster.py`

**Interfaces:**
- Consumes: `fp.config.plan_source`, `fp.config.RENDER_DPI`, `fp.config.WORK_DIR`
- Produces:
  - `fp.raster.render_floor(floor: str, dpi: int | None = None, force: bool = False) -> Path` — PNG 경로 반환, 이미 있으면 재사용
  - `fp.raster.load_floor_image(floor: str) -> numpy.ndarray` — BGR 이미지

- [ ] **Step 1: 실패하는 테스트 작성**

`GUMAP-개발/floorplan/tests/test_raster.py`:

```python
import numpy as np
import pytest

from fp import config, raster


@pytest.fixture(scope="module")
def png_2f():
    return raster.render_floor("2F")


def test_render_creates_a_png(png_2f):
    assert png_2f.exists()
    assert png_2f.suffix == ".png"


def test_render_writes_into_the_work_directory(png_2f):
    assert png_2f.parent == config.WORK_DIR


def test_rendered_size_is_within_the_ocr_limit(png_2f):
    img = raster.load_floor_image("2F")
    height, width = img.shape[:2]
    assert max(width, height) <= 10000, "WinRT OCR 은 10000px 를 넘기면 거부한다"


def test_rendered_image_is_landscape_a4_ish(png_2f):
    img = raster.load_floor_image("2F")
    height, width = img.shape[:2]
    assert width > height
    assert 1.3 < width / height < 1.5


def test_rendered_image_is_mostly_white_paper(png_2f):
    img = raster.load_floor_image("2F")
    assert img.mean() > 200, "도면은 흰 바탕이어야 한다"


def test_render_is_cached_on_second_call(png_2f):
    before = png_2f.stat().st_mtime_ns
    again = raster.render_floor("2F")
    assert again.stat().st_mtime_ns == before


def test_every_floor_renders():
    for floor in config.FLOORS:
        path = raster.render_floor(floor)
        assert path.exists(), f"{floor} 렌더링 실패"


def test_b1f_and_1f_render_to_different_images():
    a = raster.load_floor_image("B1F")
    b = raster.load_floor_image("1F")
    assert a.shape == b.shape
    assert not np.array_equal(a, b), "B1F 와 1F 가 같은 페이지를 가리키고 있다"


def test_unknown_floor_raises():
    with pytest.raises(KeyError):
        raster.render_floor("9F")
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_raster.py" -v`
Expected: FAIL — `ImportError: cannot import name 'raster'`

- [ ] **Step 3: raster 모듈 구현**

`GUMAP-개발/floorplan/fp/raster.py`:

```python
"""도면 PDF 를 고해상도 래스터로 변환한다.

원본은 200dpi 스캔이므로 400dpi 로 렌더링해도 원본 이상의 정보는 없다.
벽선 형태소 연산과 OCR 이 안정적으로 동작할 해상도를 확보하는 것이 목적이다.
"""
from pathlib import Path

import cv2
import numpy as np
import pymupdf

from . import config


def _output_path(floor: str, dpi: int) -> Path:
    return config.WORK_DIR / f"{floor}_raster_{dpi}.png"


def render_floor(floor: str, dpi: int | None = None, force: bool = False) -> Path:
    """층 도면을 PNG 로 렌더링하고 경로를 반환한다. 이미 있으면 재사용한다."""
    resolution = dpi or config.RENDER_DPI
    out = _output_path(floor, resolution)
    if out.exists() and not force:
        return out

    pdf_path, page_index = config.plan_source(floor)
    if not pdf_path.exists():
        raise FileNotFoundError(f"도면 PDF 없음: {pdf_path}")

    config.WORK_DIR.mkdir(parents=True, exist_ok=True)
    document = pymupdf.open(pdf_path)
    try:
        page = document[page_index]
        pixmap = page.get_pixmap(dpi=resolution)
        pixmap.save(out)
    finally:
        document.close()
    return out


def load_floor_image(floor: str, dpi: int | None = None) -> np.ndarray:
    """층 도면을 BGR numpy 배열로 읽는다."""
    path = render_floor(floor, dpi)
    # 경로에 한글이 있어 cv2.imread 가 Windows 에서 실패한다. 바이트로 읽어 디코드한다.
    buffer = np.fromfile(path, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError(f"이미지 디코드 실패: {path}")
    return image
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_raster.py" -v`
Expected: PASS (9 passed). 첫 실행은 7개 층 렌더링으로 20~40초 걸린다.

- [ ] **Step 5: 커밋**

```bash
git add "GUMAP-개발/floorplan/fp/raster.py" "GUMAP-개발/floorplan/tests/test_raster.py"
git commit -m "feat(floorplan): render floor plan PDFs to high-resolution rasters"
```

---

## Task 4: 벽선 추출과 방 폴리곤 검출

**Files:**
- Create: `GUMAP-개발/floorplan/fp/rooms.py`
- Test: `GUMAP-개발/floorplan/tests/test_rooms.py`

**Interfaces:**
- Consumes: `fp.raster.load_floor_image`
- Produces:
  - `fp.rooms.RoomPolygon` — dataclass: `points: list[tuple[int, int]]`, `area_px: float`, `centroid: tuple[float, float]`
  - `fp.rooms.extract_wall_mask(image: np.ndarray) -> np.ndarray` — 0/255 이진 마스크
  - `fp.rooms.extract_room_polygons(image: np.ndarray, close_kernel: int = 25) -> list[RoomPolygon]`

**설계 근거:** 사전 검증에서 adaptive threshold 후 가로/세로 방향 morphological open 으로
벽선만 남기면 글자가 완전히 제거됨을 확인했다. 문 틈은 dilate 로 닫고
connected component 로 방을 분리한다. 무보정 회수율 78~102%.

- [ ] **Step 1: 실패하는 테스트 작성**

`GUMAP-개발/floorplan/tests/test_rooms.py`:

```python
import numpy as np
import pytest

from fp import raster, rooms


@pytest.fixture(scope="module")
def image_2f():
    return raster.load_floor_image("2F")


@pytest.fixture(scope="module")
def polygons_2f(image_2f):
    return rooms.extract_room_polygons(image_2f)


def test_wall_mask_is_binary(image_2f):
    mask = rooms.extract_wall_mask(image_2f)
    assert set(np.unique(mask)).issubset({0, 255})


def test_wall_mask_keeps_only_a_small_fraction_of_ink(image_2f):
    mask = rooms.extract_wall_mask(image_2f)
    ratio = mask.mean() / 255
    assert 0.005 < ratio < 0.08, f"벽선 비율이 이상함: {ratio}"


def test_wall_mask_matches_input_size(image_2f):
    mask = rooms.extract_wall_mask(image_2f)
    assert mask.shape == image_2f.shape[:2]


def test_extracts_a_useful_number_of_rooms(polygons_2f):
    # 2F 도면상 방은 61개. 무보정 검증에서 52개를 얻었다.
    assert 40 <= len(polygons_2f) <= 90


def test_polygons_are_not_all_rectangles(polygons_2f):
    # 기존 가짜 데이터는 전부 4점 사각형이었다. 진짜 도면은 그렇지 않다.
    non_rect = [p for p in polygons_2f if len(p.points) > 4]
    assert non_rect, "모든 폴리곤이 사각형이면 실제 벽 형상을 못 딴 것이다"


def test_polygons_have_at_least_three_points(polygons_2f):
    assert all(len(p.points) >= 3 for p in polygons_2f)


def test_polygon_areas_are_positive(polygons_2f):
    assert all(p.area_px > 0 for p in polygons_2f)


def test_centroid_is_inside_the_image(polygons_2f, image_2f):
    height, width = image_2f.shape[:2]
    for polygon in polygons_2f:
        cx, cy = polygon.centroid
        assert 0 <= cx < width
        assert 0 <= cy < height


def test_every_floor_yields_polygons():
    for floor in ["B1F", "1F", "2F", "3F", "4F", "5F", "6F"]:
        image = raster.load_floor_image(floor)
        found = rooms.extract_room_polygons(image)
        assert found, f"{floor} 에서 방을 하나도 못 찾음"
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_rooms.py" -v`
Expected: FAIL — `ImportError: cannot import name 'rooms'`

- [ ] **Step 3: rooms 모듈 구현**

`GUMAP-개발/floorplan/fp/rooms.py`:

```python
"""도면 래스터에서 벽선을 뽑고 방 폴리곤을 검출한다.

모든 좌표는 도면 픽셀 좌표계다. 지리 좌표는 georef 모듈에서만 다룬다.
"""
from dataclasses import dataclass

import cv2
import numpy as np

# 방으로 인정할 면적 범위. 전체 이미지 면적 대비 비율로 잡아 해상도 변화에 견디게 한다.
MIN_AREA_RATIO = 1.5e-4
MAX_AREA_RATIO = 4.0e-2

# 벽선 검출용 형태소 커널 길이 = 이미지 변 길이 / 이 값
LINE_KERNEL_DIVISOR = 150


@dataclass
class RoomPolygon:
    points: list[tuple[int, int]]
    area_px: float
    centroid: tuple[float, float]


def extract_wall_mask(image: np.ndarray) -> np.ndarray:
    """벽선만 남긴 0/255 마스크. 글자와 해칭은 제거된다."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 25, 15
    )
    height, width = binary.shape
    horizontal = cv2.morphologyEx(
        binary,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (max(2, width // LINE_KERNEL_DIVISOR), 1)),
    )
    vertical = cv2.morphologyEx(
        binary,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(2, height // LINE_KERNEL_DIVISOR))),
    )
    return cv2.bitwise_or(horizontal, vertical)


def extract_room_polygons(image: np.ndarray, close_kernel: int = 25) -> list[RoomPolygon]:
    """벽으로 둘러싸인 영역을 방 폴리곤으로 반환한다.

    close_kernel 은 문 틈을 메우는 dilate 커널 크기다. 크면 방이 붙고
    작으면 방이 새어나간다. 25 가 검증에서 가장 좋았다.
    """
    mask = extract_wall_mask(image)
    closed = cv2.dilate(mask, np.ones((close_kernel, close_kernel), np.uint8), iterations=1)
    enclosed = cv2.bitwise_not(closed)

    count, labels, stats, _ = cv2.connectedComponentsWithStats(enclosed, 8)
    total_area = image.shape[0] * image.shape[1]
    min_area = total_area * MIN_AREA_RATIO
    max_area = total_area * MAX_AREA_RATIO

    result: list[RoomPolygon] = []
    for index in range(1, count):
        area = float(stats[index, cv2.CC_STAT_AREA])
        if not (min_area < area < max_area):
            continue
        component = (labels == index).astype(np.uint8)
        contours, _ = cv2.findContours(component, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue
        contour = max(contours, key=cv2.contourArea)
        approx = cv2.approxPolyDP(contour, 0.006 * cv2.arcLength(contour, True), True)
        points = [(int(p[0][0]), int(p[0][1])) for p in approx]
        if len(points) < 3:
            continue
        moments = cv2.moments(contour)
        if moments["m00"] == 0:
            continue
        centroid = (moments["m10"] / moments["m00"], moments["m01"] / moments["m00"])
        result.append(
            RoomPolygon(points=points, area_px=float(cv2.contourArea(contour)), centroid=centroid)
        )
    return result
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_rooms.py" -v`
Expected: PASS (9 passed)

`test_extracts_a_useful_number_of_rooms` 가 실패하면 실제 개수를 확인한다:

```bash
python -c "import sys; sys.path.insert(0,'GUMAP-개발/floorplan'); from fp import raster, rooms; print(len(rooms.extract_room_polygons(raster.load_floor_image('2F'))))"
```

- [ ] **Step 5: 커밋**

```bash
git add "GUMAP-개발/floorplan/fp/rooms.py" "GUMAP-개발/floorplan/tests/test_rooms.py"
git commit -m "feat(floorplan): extract wall lines and room polygons from rasters"
```

---

## Task 5: Windows 내장 OCR 래퍼

**Files:**
- Create: `GUMAP-개발/floorplan/fp/ocr_win.ps1`
- Create: `GUMAP-개발/floorplan/fp/ocr.py`
- Test: `GUMAP-개발/floorplan/tests/test_ocr.py`

**Interfaces:**
- Consumes: 없음 (독립 모듈)
- Produces:
  - `fp.ocr.OcrWord` — dataclass: `text: str`, `x: float`, `y: float`, `w: float`, `h: float`
  - `fp.ocr.center(word: OcrWord) -> tuple[float, float]`
  - `fp.ocr.ocr_image(png_path: Path, lang: str = "ko") -> list[OcrWord]`
  - `fp.ocr.OcrError` — 예외

**설계 근거:** tesseract 미설치, pytesseract/easyocr 없음. Windows 11 내장
WinRT OCR(`Windows.Media.Ocr`)이 ko/en-US 를 지원하고 설치가 필요 없다.
사전 검증에서 방 번호 `237 238 238-1 239 240 241 241-1 242 243 260~263`을 전량 정확히 읽었다.
한글 이름은 일부 오인식되지만 이름은 엑셀에서 오므로 무관하다.

- [ ] **Step 1: PowerShell OCR 스크립트 작성**

`GUMAP-개발/floorplan/fp/ocr_win.ps1`:

```powershell
# WinRT OCR 로 이미지의 단어와 바운딩 박스를 JSON 으로 출력한다.
# 사용법: powershell -ExecutionPolicy Bypass -File ocr_win.ps1 -ImagePath <png> -Lang ko
param(
  [Parameter(Mandatory = $true)][string]$ImagePath,
  [string]$Lang = "ko"
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($operation, $type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  $task.Wait(-1) | Out-Null
  $task.Result
}

$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime]

$language = [Windows.Globalization.Language]::new($Lang)
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
if ($null -eq $engine) { throw "OCR 엔진을 만들 수 없음: $Lang" }

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
try {
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

  $words = New-Object System.Collections.ArrayList
  foreach ($line in $result.Lines) {
    foreach ($word in $line.Words) {
      $null = $words.Add([pscustomobject]@{
        text = $word.Text
        x    = [math]::Round($word.BoundingRect.X, 2)
        y    = [math]::Round($word.BoundingRect.Y, 2)
        w    = [math]::Round($word.BoundingRect.Width, 2)
        h    = [math]::Round($word.BoundingRect.Height, 2)
      })
    }
  }
  ConvertTo-Json -InputObject @($words) -Depth 3 -Compress
}
finally {
  $stream.Dispose()
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`GUMAP-개발/floorplan/tests/test_ocr.py`:

```python
import cv2
import numpy as np
import pytest

from fp import ocr, raster


@pytest.fixture(scope="module")
def number_band(tmp_path_factory):
    """2F 도면에서 방번호 237~243 이 있는 띠를 잘라 저장한다."""
    image = raster.load_floor_image("2F")
    height, width = image.shape[:2]
    crop = image[int(height * 0.49):int(height * 0.58), int(width * 0.47):int(width * 0.75)]
    path = tmp_path_factory.mktemp("ocr") / "band.png"
    ok, buffer = cv2.imencode(".png", crop)
    assert ok
    buffer.tofile(str(path))
    return path


@pytest.fixture(scope="module")
def words(number_band):
    return ocr.ocr_image(number_band)


def test_returns_words(words):
    assert words, "OCR 이 아무것도 못 읽었다"


def test_reads_the_expected_room_numbers(words):
    texts = {w.text for w in words}
    for expected in ["237", "239", "240", "243"]:
        assert expected in texts, f"{expected} 를 못 읽음. 읽은 것: {sorted(texts)}"


def test_reads_a_suffixed_room_number(words):
    texts = {w.text for w in words}
    assert "238-1" in texts or "238" in texts


def test_bounding_boxes_are_positive(words):
    assert all(w.w > 0 and w.h > 0 for w in words)


def test_center_is_inside_the_bounding_box():
    word = ocr.OcrWord(text="201", x=10.0, y=20.0, w=30.0, h=10.0)
    assert ocr.center(word) == (25.0, 25.0)


def test_english_engine_also_works(number_band):
    result = ocr.ocr_image(number_band, lang="en-US")
    texts = {w.text for w in result}
    assert "237" in texts


def test_missing_file_raises(tmp_path):
    with pytest.raises(ocr.OcrError):
        ocr.ocr_image(tmp_path / "nope.png")


def test_undecodable_file_raises(tmp_path):
    path = tmp_path / "garbage.png"
    path.write_bytes(b"this is not an image")
    with pytest.raises(ocr.OcrError):
        ocr.ocr_image(path)


def test_timeout_surfaces_as_ocr_error(tmp_path, monkeypatch):
    """배치 실행 중 한 장이 멎어도 OcrError 로 나와야 그 층만 건너뛸 수 있다."""
    import subprocess

    image = np.full((50, 50, 3), 255, dtype=np.uint8)
    path = tmp_path / "ok.png"
    ok, buffer = cv2.imencode(".png", image)
    assert ok
    buffer.tofile(str(path))

    def fake_run(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd="powershell", timeout=180)

    monkeypatch.setattr(subprocess, "run", fake_run)
    with pytest.raises(ocr.OcrError, match="시간 초과"):
        ocr.ocr_image(path)


def test_oversized_image_raises(tmp_path):
    big = np.full((11000, 100, 3), 255, dtype=np.uint8)
    path = tmp_path / "big.png"
    ok, buffer = cv2.imencode(".png", big)
    assert ok
    buffer.tofile(str(path))
    with pytest.raises(ocr.OcrError, match="10000"):
        ocr.ocr_image(path)
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_ocr.py" -v`
Expected: FAIL — `ImportError: cannot import name 'ocr'`

- [ ] **Step 4: ocr 모듈 구현**

`GUMAP-개발/floorplan/fp/ocr.py`:

```python
"""Windows 내장 WinRT OCR 래퍼.

tesseract 설치 없이 Windows 10/11 이 제공하는 Windows.Media.Ocr 를 쓴다.
PowerShell 스크립트를 호출해 JSON 을 받는다.
"""
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

MAX_IMAGE_DIMENSION = 10000
_SCRIPT = Path(__file__).with_name("ocr_win.ps1")


class OcrError(RuntimeError):
    """OCR 호출 실패."""


@dataclass
class OcrWord:
    text: str
    x: float
    y: float
    w: float
    h: float


def center(word: OcrWord) -> tuple[float, float]:
    """단어 바운딩 박스의 중심점."""
    return (word.x + word.w / 2, word.y + word.h / 2)


def ocr_image(png_path: Path, lang: str = "ko") -> list[OcrWord]:
    """이미지에서 단어와 바운딩 박스를 읽는다. 좌표는 이미지 픽셀 기준이다."""
    path = Path(png_path)
    if not path.exists():
        raise OcrError(f"이미지 없음: {path}")

    buffer = np.fromfile(path, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise OcrError(f"이미지 디코드 실패: {path}")
    if max(image.shape[:2]) > MAX_IMAGE_DIMENSION:
        raise OcrError(
            f"이미지가 너무 큼 ({max(image.shape[:2])}px). WinRT OCR 한계는 {MAX_IMAGE_DIMENSION}px 이다."
        )

    try:
        completed = subprocess.run(
            [
                "powershell", "-NoProfile", "-NonInteractive",
                "-ExecutionPolicy", "Bypass",
                "-File", str(_SCRIPT),
                "-ImagePath", str(path.resolve()),
                "-Lang", lang,
            ],
            capture_output=True,
            timeout=180,
        )
    except subprocess.TimeoutExpired as exc:
        # 배치로 7개 층을 돌리므로 한 장이 멎어도 OcrError 로 나와야
        # 호출부가 그 층만 건너뛸 수 있다.
        raise OcrError(f"OCR 시간 초과 (180초): {path}") from exc
    if completed.returncode != 0:
        raise OcrError(f"OCR 실패: {completed.stderr.decode('utf-8', 'replace')}")

    payload = completed.stdout.decode("utf-8", "replace").strip()
    if not payload:
        return []
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise OcrError(f"OCR 결과 파싱 실패: {payload[:200]}") from exc
    if isinstance(data, dict):
        data = [data]
    return [
        OcrWord(text=str(d["text"]), x=float(d["x"]), y=float(d["y"]), w=float(d["w"]), h=float(d["h"]))
        for d in data
    ]
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_ocr.py" -v`
Expected: PASS (8 passed)

- [ ] **Step 6: 커밋**

```bash
git add "GUMAP-개발/floorplan/fp/ocr.py" "GUMAP-개발/floorplan/fp/ocr_win.ps1" "GUMAP-개발/floorplan/tests/test_ocr.py"
git commit -m "feat(floorplan): read text via built-in Windows OCR, no install needed"
```

---

## Task 6: 방번호 매칭과 미매칭 분류

**Files:**
- Create: `GUMAP-개발/floorplan/fp/labels.py`
- Test: `GUMAP-개발/floorplan/tests/test_labels.py`

**Interfaces:**
- Consumes: `fp.rooms.RoomPolygon`, `fp.ocr.OcrWord`, `fp.ocr.center`
- Produces:
  - `fp.labels.LabeledPolygon` — dataclass: `polygon: RoomPolygon`, `room_id: str | None`, `candidates: list[str]`, `drawing_name: str | None`
  - `fp.labels.MatchReport` — dataclass: `matched: list[str]`, `unlabeled: int`, `missing: list[str]`, `ambiguous: list[list[str]]`, `unexpected: list[str]`
  - `fp.labels.looks_like_room_number(text: str) -> bool`
  - `fp.labels.extract_embedded_room_numbers(text: str) -> list[str]`
  - `fp.labels.match_service_name(text: str) -> str | None`
  - `fp.labels.point_in_polygon(point, points) -> bool`
  - `fp.labels.assign_labels(polygons, words, expected_ids) -> tuple[list[LabeledPolygon], MatchReport]`

**엑셀에 이름이 없는 방 처리 (설계 변경, 사용자 승인):**
엑셀 361개 방 중 69개는 이름 칸이 비어 있고, 그 대부분이 화장실·샤워실·계단
같은 서비스 공간이다 (`화장실` 0건, `샤워실` 0건). 도면에는 이름이 적혀 있으므로,
번호와 함께 **닫힌 어휘 목록에 대해서만** 한글 이름을 읽어 채운다. OCR 이 한글을
정확히 읽지 못해도(검증에서 `샤워실`→`사워실`, `대학원연구실`→`학원연구닐`)
목록 밖으로는 떨어지지 않으므로 안전하다. 목록에 없는 한글은 전부 버린다.

- [ ] **Step 1: 실패하는 테스트 작성**

`GUMAP-개발/floorplan/tests/test_labels.py`:

```python
import pytest

from fp import labels, ocr, rooms


def square(x0, y0, size, area=None):
    points = [(x0, y0), (x0 + size, y0), (x0 + size, y0 + size), (x0, y0 + size)]
    return rooms.RoomPolygon(
        points=points,
        area_px=float(area if area is not None else size * size),
        centroid=(x0 + size / 2, y0 + size / 2),
    )


def word_at(text, cx, cy):
    return ocr.OcrWord(text=text, x=cx - 10, y=cy - 5, w=20, h=10)


def test_recognizes_a_plain_room_number():
    assert labels.looks_like_room_number("201")


def test_recognizes_a_basement_room_number():
    assert labels.looks_like_room_number("B108")


def test_recognizes_a_suffixed_room_number():
    assert labels.looks_like_room_number("305-1")


def test_rejects_korean_text():
    assert not labels.looks_like_room_number("강의실")


def test_rejects_dimension_numbers():
    assert not labels.looks_like_room_number("7,200")
    assert not labels.looks_like_room_number("90200")


def test_rejects_two_digit_numbers():
    assert not labels.looks_like_room_number("12")


def test_extracts_a_room_number_fused_to_a_name():
    # 실측: OCR 이 대학원연구실 241-1 을 한 토큰으로 붙여 내놓았다
    assert labels.extract_embedded_room_numbers("학원연구닐241-1") == ["241-1"]
    assert labels.extract_embedded_room_numbers("화장실155") == ["155"]


def test_does_not_extract_numbers_out_of_dimension_strings():
    for dimension in ["7,200", "90,200", "88,700", "69,000", "13,300", "75800", "90200"]:
        assert labels.extract_embedded_room_numbers(dimension) == [], dimension


def test_extracts_nothing_from_plain_korean():
    assert labels.extract_embedded_room_numbers("탄소재료연구실") == []
    assert labels.extract_embedded_room_numbers("") == []


def test_fused_room_number_is_assigned_when_it_is_expected():
    polygons = [square(0, 0, 100)]
    words = [word_at("학원연구닐241-1", 50, 50)]
    labeled, report = labels.assign_labels(polygons, words, {"241-1"})
    assert labeled[0].room_id == "241-1"
    assert report.matched == ["241-1"]


def test_fused_number_outside_the_expected_set_is_dropped_silently():
    # 도면의 임의 숫자를 unexpected 로 시끄럽게 보고하지 않는다
    polygons = [square(0, 0, 100)]
    words = [word_at("가나다999", 50, 50)]
    labeled, report = labels.assign_labels(polygons, words, {"201"})
    assert labeled[0].room_id is None
    assert report.unexpected == []


def test_service_name_matches_an_exact_vocabulary_entry():
    assert labels.match_service_name("화장실") == "화장실"
    assert labels.match_service_name("계단") == "계단"


def test_service_name_tolerates_the_ocr_misreading_of_shower_room():
    # 검증에서 Windows OCR 이 샤워실을 사워실로 읽었다
    assert labels.match_service_name("사워실") == "샤워실"


def test_service_name_matches_a_prefixed_variant():
    assert labels.match_service_name("장애인화장실") == "장애인화장실"


def test_service_name_rejects_words_outside_the_vocabulary():
    assert labels.match_service_name("탄소재료연구실") is None
    assert labels.match_service_name("최적실계실험실") is None
    assert labels.match_service_name("") is None


def test_service_name_rejects_a_room_number():
    assert labels.match_service_name("201") is None


def test_point_inside_square():
    pts = [(0, 0), (10, 0), (10, 10), (0, 10)]
    assert labels.point_in_polygon((5, 5), pts)


def test_point_outside_square():
    pts = [(0, 0), (10, 0), (10, 10), (0, 10)]
    assert not labels.point_in_polygon((15, 5), pts)


def test_assigns_a_label_when_the_number_sits_inside():
    polygons = [square(0, 0, 100)]
    words = [word_at("201", 50, 50)]
    labeled, report = labels.assign_labels(polygons, words, {"201", "202"})
    assert labeled[0].room_id == "201"
    assert report.matched == ["201"]


def test_reports_a_polygon_with_no_number_as_unlabeled():
    polygons = [square(0, 0, 100)]
    labeled, report = labels.assign_labels(polygons, [], {"201"})
    assert labeled[0].room_id is None
    assert report.unlabeled == 1


def test_reports_an_expected_room_with_no_polygon_as_missing():
    polygons = [square(0, 0, 100)]
    words = [word_at("201", 50, 50)]
    _, report = labels.assign_labels(polygons, words, {"201", "202"})
    assert report.missing == ["202"]


def test_reports_two_numbers_in_one_polygon_as_ambiguous():
    polygons = [square(0, 0, 100)]
    words = [word_at("201", 30, 50), word_at("202", 70, 50)]
    labeled, report = labels.assign_labels(polygons, words, {"201", "202"})
    assert labeled[0].room_id is None
    assert report.ambiguous == [["201", "202"]]


def test_number_not_in_the_expected_set_is_reported_as_unexpected():
    polygons = [square(0, 0, 100)]
    words = [word_at("999", 50, 50)]
    labeled, report = labels.assign_labels(polygons, words, {"201"})
    assert labeled[0].room_id is None
    assert report.unexpected == ["999"]


def test_a_number_outside_every_polygon_is_ignored_for_assignment():
    polygons = [square(0, 0, 100)]
    words = [word_at("201", 500, 500)]
    labeled, report = labels.assign_labels(polygons, words, {"201"})
    assert labeled[0].room_id is None
    assert report.missing == ["201"]


def test_the_smallest_containing_polygon_wins():
    outer = square(0, 0, 200)
    inner = square(40, 40, 40)
    words = [word_at("201", 60, 60)]
    labeled, _ = labels.assign_labels([outer, inner], words, {"201"})
    by_area = {p.polygon.area_px: p.room_id for p in labeled}
    assert by_area[40 * 40] == "201"
    assert by_area[200 * 200] is None


def test_captures_a_service_room_name_from_the_drawing():
    polygons = [square(0, 0, 100)]
    words = [word_at("155", 50, 40), word_at("화장실", 50, 60)]
    labeled, _ = labels.assign_labels(polygons, words, {"155"})
    assert labeled[0].room_id == "155"
    assert labeled[0].drawing_name == "화장실"


def test_ignores_drawing_words_outside_the_vocabulary():
    polygons = [square(0, 0, 100)]
    words = [word_at("201", 50, 40), word_at("탄소재료연구실", 50, 60)]
    labeled, _ = labels.assign_labels(polygons, words, {"201"})
    assert labeled[0].drawing_name is None


def test_drawing_name_is_none_when_no_korean_word_is_present():
    polygons = [square(0, 0, 100)]
    labeled, _ = labels.assign_labels(polygons, [word_at("201", 50, 50)], {"201"})
    assert labeled[0].drawing_name is None


def test_drawing_name_is_captured_even_when_the_number_is_unreadable():
    # 번호를 못 읽어도 이름은 보정 화면에서 쓸 수 있으므로 버리지 않는다
    polygons = [square(0, 0, 100)]
    labeled, _ = labels.assign_labels(polygons, [word_at("화장실", 50, 50)], {"155"})
    assert labeled[0].room_id is None
    assert labeled[0].drawing_name == "화장실"
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_labels.py" -v`
Expected: FAIL — `ImportError: cannot import name 'labels'`

- [ ] **Step 3: labels 모듈 구현**

`GUMAP-개발/floorplan/fp/labels.py`:

```python
"""OCR 로 읽은 방번호를 추출된 폴리곤에 붙이고, 못 붙인 것을 분류한다.

미매칭은 세 종류로 나뉜다. 이 분류가 보정 화면의 작업 목록이 된다.
  unlabeled : 폴리곤은 있는데 번호를 못 읽음
  missing   : 엑셀에는 있는데 폴리곤이 없음
  ambiguous : 한 폴리곤 안에 번호가 둘 이상 (벽 틈으로 방이 붙음)
"""
import difflib
import re
from dataclasses import dataclass, field

from .ocr import OcrWord, center
from .rooms import RoomPolygon

# 방번호는 세 자리 숫자이고 앞에 B, 뒤에 -N 이 붙을 수 있다.
# 치수선 숫자(7,200 / 90200)를 걸러내기 위해 쉼표와 네 자리 이상을 배제한다.
ROOM_NUMBER_RE = re.compile(r"^[Bb]?\d{3}(?:-\d{1,2})?$")

# OCR 이 방번호를 옆 글자와 붙여 한 토큰으로 내놓는 경우가 있다.
# 실측 예: "학원연구닐241-1" (대학원연구실 + 241-1 이 붙어 나옴)
# 앞뒤가 숫자나 쉼표면 매칭하지 않는다 → 치수선 7,200 / 90,200 / 75800 배제.
EMBEDDED_ROOM_NUMBER_RE = re.compile(r"(?<![\d,])([Bb]?\d{3}(?:-\d{1,2})?)(?![\d,])")

# 엑셀에 이름이 없는 서비스 공간만 도면에서 읽는다. 닫힌 목록이라
# OCR 이 한글을 틀리게 읽어도 목록 밖으로 떨어지지 않는다.
# 긴 이름을 먼저 두어 "장애인화장실" 이 "화장실" 로 뭉개지지 않게 한다.
SERVICE_VOCABULARY = [
    "장애인화장실", "여자화장실", "남자화장실", "화장실", "샤워실",
    "계단실", "계단", "엘리베이터", "승강기",
    "준비실", "배기실", "기계실", "전기실", "발전실", "창고",
    "휴게실", "휴계실", "탕비실", "청소용구실",
]
# 근사매칭 조건. 길이가 비슷할 때만 비교한다.
# "사워실"(OCR 오인식) vs "샤워실" 의 SequenceMatcher 비율이 0.667 이므로
# 임계값은 그보다 낮아야 하고, 길이 제한이 오탐을 막는다.
SERVICE_MATCH_THRESHOLD = 0.6
SERVICE_LENGTH_SLACK = 1


@dataclass
class LabeledPolygon:
    polygon: RoomPolygon
    room_id: str | None = None
    candidates: list[str] = field(default_factory=list)
    drawing_name: str | None = None


@dataclass
class MatchReport:
    matched: list[str] = field(default_factory=list)
    unlabeled: int = 0
    missing: list[str] = field(default_factory=list)
    ambiguous: list[list[str]] = field(default_factory=list)
    unexpected: list[str] = field(default_factory=list)


def looks_like_room_number(text: str) -> bool:
    """OCR 단어 전체가 방번호 형태인지."""
    return bool(ROOM_NUMBER_RE.match((text or "").strip()))


def extract_embedded_room_numbers(text: str) -> list[str]:
    """옆 글자와 붙어 나온 방번호를 뽑는다.

    OCR 이 "학원연구닐241-1" 처럼 이름과 번호를 한 토큰으로 내놓는 일이 있다.
    호출부는 여기서 나온 값을 반드시 기대 목록과 대조해야 한다. 이 함수만으로는
    도면의 임의 숫자와 방번호를 구분하지 못한다.
    """
    return [m.group(1) for m in EMBEDDED_ROOM_NUMBER_RE.finditer((text or "").strip())]


def match_service_name(text: str) -> str | None:
    """OCR 단어를 서비스 공간 어휘에 근사매칭한다. 목록 밖이면 None.

    엑셀에 이름이 없는 방(화장실·샤워실·계단 등)만 도면에서 이름을 얻기 위한
    것이다. 닫힌 목록이라 오인식이 엉뚱한 이름을 만들어내지 못한다.
    """
    candidate = (text or "").strip()
    if not candidate or looks_like_room_number(candidate):
        return None

    # 1순위: 정확히 포함. 목록이 긴 이름부터라 "장애인화장실" 이 "화장실" 로 뭉개지지 않는다.
    for entry in SERVICE_VOCABULARY:
        if entry in candidate:
            return entry

    # 2순위: 길이가 비슷한 항목에만 근사매칭. 길이 제한이 오탐을 막는다.
    best, best_score = None, 0.0
    for entry in SERVICE_VOCABULARY:
        if abs(len(candidate) - len(entry)) > SERVICE_LENGTH_SLACK:
            continue
        score = difflib.SequenceMatcher(None, candidate, entry).ratio()
        if score > best_score:
            best, best_score = entry, score
    return best if best_score >= SERVICE_MATCH_THRESHOLD else None


def point_in_polygon(point: tuple[float, float], points: list[tuple[int, int]]) -> bool:
    """ray casting. 경계는 포함하지 않아도 무방하다."""
    x, y = point
    inside = False
    count = len(points)
    for i in range(count):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % count]
        if (y1 > y) != (y2 > y):
            x_cross = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < x_cross:
                inside = not inside
    return inside


def assign_labels(
    polygons: list[RoomPolygon],
    words: list[OcrWord],
    expected_ids: set[str],
) -> tuple[list[LabeledPolygon], MatchReport]:
    """폴리곤에 방번호를 붙이고 리포트를 만든다."""
    labeled = [LabeledPolygon(polygon=p) for p in polygons]
    report = MatchReport()

    def smallest_containing(word: OcrWord) -> LabeledPolygon | None:
        """단어를 품는 폴리곤 중 가장 작은 것. 큰 복도가 방을 삼키는 것을 막는다."""
        point = center(word)
        containing = [item for item in labeled if point_in_polygon(point, item.polygon.points)]
        return min(containing, key=lambda item: item.polygon.area_px) if containing else None

    for word in words:
        text = word.text.strip()

        # 1) 토큰 전체가 방번호인 경우 — 기대 목록에 없으면 unexpected 로 보고한다
        if looks_like_room_number(text):
            target = smallest_containing(word)
            if target is not None:
                target.candidates.append(text)
            continue

        # 2) 옆 글자와 붙어 나온 방번호 — 기대 목록에 있는 것만 받는다.
        #    도면의 임의 숫자를 걸러낼 방법이 이것뿐이라 unexpected 로는 보고하지 않는다.
        embedded = [n for n in extract_embedded_room_numbers(text) if n in expected_ids]
        if embedded:
            target = smallest_containing(word)
            if target is not None:
                target.candidates.extend(embedded)

        # 3) 엑셀에 이름이 없는 서비스 공간만 도면에서 이름을 얻는다
        service = match_service_name(text)
        if service is not None:
            target = smallest_containing(word)
            if target is not None and target.drawing_name is None:
                target.drawing_name = service

    for item in labeled:
        unique = sorted(set(item.candidates))
        if len(unique) == 1:
            candidate = unique[0]
            if candidate in expected_ids:
                item.room_id = candidate
            else:
                report.unexpected.append(candidate)
        elif len(unique) > 1:
            report.ambiguous.append(unique)

    for item in labeled:
        if item.room_id is None:
            report.unlabeled += 1

    report.matched = sorted({item.room_id for item in labeled if item.room_id})
    report.missing = sorted(expected_ids - set(report.matched))
    report.unexpected = sorted(set(report.unexpected))
    return labeled, report
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_labels.py" -v`
Expected: PASS (15 passed)

- [ ] **Step 5: 커밋**

```bash
git add "GUMAP-개발/floorplan/fp/labels.py" "GUMAP-개발/floorplan/tests/test_labels.py"
git commit -m "feat(floorplan): match OCR room numbers to polygons and classify misses"
```

---

## Task 7: 좌표 변환 (유사변환)

**Files:**
- Create: `GUMAP-개발/floorplan/fp/georef.py`
- Test: `GUMAP-개발/floorplan/tests/test_georef.py`

**Interfaces:**
- Consumes: `fp.config.DRAWING_EXTENT_MM`, `REFERENCE_LATITUDE`, `SCALE_TOLERANCE`, `METERS_PER_DEG_LAT`, `METERS_PER_DEG_LON_AT_EQUATOR`, `GEOREF_PATH`
- Produces:
  - `fp.georef.Transform` — dataclass: `theta_deg: float`, `scale: float`, `t_lon: float`, `t_lat: float`
    - `t_lon`/`t_lat` 는 **도면 원점(0,0)의 WGS84 좌표**다.
  - `fp.georef.GeoRefError` — 예외
  - `fp.georef.pixels_to_meters(points, origin_px, px_per_mm) -> list[tuple[float,float]]`
  - `fp.georef.solve_similarity(src_m, dst_lonlat) -> Transform`
  - `fp.georef.apply(transform, x_m, y_m) -> tuple[float, float]`
  - `fp.georef.apply_many(transform, points_m) -> list[tuple[float, float]]`
  - `fp.georef.load(path=None) -> dict`, `fp.georef.save(data, path=None) -> None`

**수학:** 도면 로컬 미터 (x 동쪽, y 북쪽) → WGS84.
```
E = scale * (x*cosθ - y*sinθ)
N = scale * (x*sinθ + y*cosθ)
lon = t_lon + E / (111320 * cos(ref_lat))
lat = t_lat + N / 110540
```
`solve_similarity` 는 Umeyama 방식으로 반사 없는 2D 유사변환을 최소자승으로 푼다.

- [ ] **Step 1: 실패하는 테스트 작성**

`GUMAP-개발/floorplan/tests/test_georef.py`:

```python
import math

import pytest

from fp import config, georef


def make_transform(theta=26.6, scale=1.0, t_lon=128.3940, t_lat=36.1460):
    return georef.Transform(theta_deg=theta, scale=scale, t_lon=t_lon, t_lat=t_lat)


def test_origin_maps_to_the_translation():
    t = make_transform()
    lon, lat = georef.apply(t, 0.0, 0.0)
    assert lon == pytest.approx(t.t_lon, abs=1e-12)
    assert lat == pytest.approx(t.t_lat, abs=1e-12)


def test_moving_north_increases_latitude():
    t = make_transform(theta=0.0)
    _, lat = georef.apply(t, 0.0, 110.54)
    assert lat == pytest.approx(36.1460 + 0.001, abs=1e-9)


def test_moving_east_increases_longitude():
    t = make_transform(theta=0.0)
    lon, _ = georef.apply(t, 100.0, 0.0)
    assert lon > t.t_lon


def test_rotation_by_ninety_degrees_turns_east_into_north():
    t = make_transform(theta=90.0, t_lon=128.0, t_lat=36.0)
    lon, lat = georef.apply(t, 100.0, 0.0)
    assert lat > 36.0
    assert lon == pytest.approx(128.0, abs=1e-9)


def test_solve_recovers_a_known_transform():
    truth = make_transform(theta=26.6, scale=1.0)
    src = [(0.0, 0.0), (90.2, 0.0), (90.2, 88.7), (0.0, 88.7)]
    dst = [georef.apply(truth, x, y) for x, y in src]
    solved = georef.solve_similarity(src, dst)
    assert solved.theta_deg == pytest.approx(26.6, abs=0.01)
    assert solved.scale == pytest.approx(1.0, abs=0.001)
    assert solved.t_lon == pytest.approx(truth.t_lon, abs=1e-7)
    assert solved.t_lat == pytest.approx(truth.t_lat, abs=1e-7)


def test_solve_round_trips_points():
    truth = make_transform(theta=-13.0, scale=1.0)
    src = [(0.0, 0.0), (90.2, 0.0), (90.2, 88.7), (0.0, 88.7)]
    dst = [georef.apply(truth, x, y) for x, y in src]
    solved = georef.solve_similarity(src, dst)
    for (x, y), (lon, lat) in zip(src, dst):
        got_lon, got_lat = georef.apply(solved, x, y)
        assert got_lon == pytest.approx(lon, abs=1e-8)
        assert got_lat == pytest.approx(lat, abs=1e-8)


def test_one_hundred_metres_east_lands_at_an_independently_computed_longitude():
    """왕복 테스트만으로는 apply 와 solve 가 같은 방향으로 틀려도 통과한다.

    그래서 코드를 쓰지 않고 손으로 계산한 절대값에 못을 박는다.
    위도 36.1466 에서 경도 1도 = 111320 * cos(36.1466°) = 89892.06 m 이므로
    동쪽 100m 는 0.001112445도다. cos 보정을 빼먹으면 0.000898311도가 되어
    이 테스트가 잡아낸다.
    """
    t = georef.Transform(theta_deg=0.0, scale=1.0, t_lon=128.0, t_lat=36.0)
    lon, lat = georef.apply(t, 100.0, 0.0)
    assert lon - 128.0 == pytest.approx(0.001112445, abs=1e-8)
    assert lat == pytest.approx(36.0, abs=1e-12)


def test_one_hundred_metres_north_lands_at_an_independently_computed_latitude():
    # 위도 1도 = 110540 m 이므로 북쪽 100m 는 0.00090465도
    t = georef.Transform(theta_deg=0.0, scale=1.0, t_lon=128.0, t_lat=36.0)
    lon, lat = georef.apply(t, 0.0, 100.0)
    assert lat - 36.0 == pytest.approx(0.00090465, abs=1e-8)
    assert lon == pytest.approx(128.0, abs=1e-12)


def test_a_degree_of_longitude_is_shorter_than_a_degree_of_latitude_here():
    """같은 거리를 가도 경도 변화가 더 커야 한다. 뒤집히면 건물이 찌그러진다."""
    t = georef.Transform(theta_deg=0.0, scale=1.0, t_lon=128.0, t_lat=36.0)
    lon_east, _ = georef.apply(t, 100.0, 0.0)
    _, lat_north = georef.apply(t, 0.0, 100.0)
    assert (lon_east - 128.0) > (lat_north - 36.0)


def test_transform_from_rejects_an_unsolved_transform():
    """좌표가 확정되기 전에 지도를 만들지 못하게 막는 안전장치."""
    for broken in [
        {},
        {"transform": None},
        {"transform": {}},
        {"transform": {"theta_deg": 1.0, "scale": 1.0, "t_lon": 128.0, "t_lat": None}},
        {"transform": {"theta_deg": None, "scale": None, "t_lon": None, "t_lat": None}},
        {"transform": {"theta_deg": 1.0, "scale": 1.0, "t_lon": 128.0}},
    ]:
        with pytest.raises(georef.GeoRefError):
            georef.transform_from(broken)


def test_transform_from_accepts_a_complete_transform():
    got = georef.transform_from(
        {"transform": {"theta_deg": 26.6, "scale": 1.0, "t_lon": 128.39, "t_lat": 36.14}}
    )
    assert got.theta_deg == 26.6
    assert got.scale == 1.0


def test_to_dict_round_trips_through_transform_from():
    original = georef.Transform(theta_deg=26.6, scale=1.0, t_lon=128.39, t_lat=36.14)
    assert georef.transform_from({"transform": georef.to_dict(original)}) == original


def test_solve_rejects_fewer_than_three_points():
    with pytest.raises(georef.GeoRefError, match="3"):
        georef.solve_similarity([(0.0, 0.0), (1.0, 1.0)], [(128.0, 36.0), (128.1, 36.1)])


def test_solve_rejects_mismatched_lengths():
    with pytest.raises(georef.GeoRefError):
        georef.solve_similarity([(0.0, 0.0), (1.0, 0.0), (0.0, 1.0)], [(128.0, 36.0)])


def test_solve_rejects_an_out_of_tolerance_scale():
    truth = make_transform(theta=0.0, scale=1.0)
    src = [(0.0, 0.0), (90.2, 0.0), (90.2, 88.7), (0.0, 88.7)]
    # 대응점을 20% 키워 축척이 1.2 가 되게 만든다
    dst = [georef.apply(truth, x * 1.2, y * 1.2) for x, y in src]
    with pytest.raises(georef.GeoRefError, match="축척"):
        georef.solve_similarity(src, dst)


def test_pixels_to_meters_uses_the_drawing_extent():
    # 도면이 가로 4510px 로 90200mm 를 표현한다면 1px = 20mm = 0.02m
    px_per_mm = 4510 / 90200
    got = georef.pixels_to_meters([(0, 0), (4510, 0)], origin_px=(0, 0), px_per_mm=px_per_mm)
    assert got[0] == pytest.approx((0.0, 0.0))
    assert got[1][0] == pytest.approx(90.2, abs=0.001)


def test_pixels_to_meters_flips_the_y_axis():
    # 이미지 y 는 아래로 증가하고 지도 y(북)는 위로 증가한다
    px_per_mm = 1.0
    got = georef.pixels_to_meters([(0, 1000)], origin_px=(0, 0), px_per_mm=px_per_mm)
    assert got[0][1] < 0


def test_pixels_to_meters_honours_the_origin():
    px_per_mm = 1.0
    got = georef.pixels_to_meters([(500, 500)], origin_px=(500, 500), px_per_mm=px_per_mm)
    assert got[0] == pytest.approx((0.0, 0.0))


def test_apply_many_matches_apply():
    t = make_transform()
    points = [(0.0, 0.0), (10.0, 20.0)]
    assert georef.apply_many(t, points) == [georef.apply(t, x, y) for x, y in points]


def test_save_and_load_round_trip(tmp_path):
    path = tmp_path / "g.json"
    data = {
        "reference_latitude": config.REFERENCE_LATITUDE,
        "transform": {"theta_deg": 26.6, "scale": 1.0, "t_lon": 128.39, "t_lat": 36.14},
        "control_points": [],
        "floor_origin_px": {},
    }
    georef.save(data, path)
    assert georef.load(path)["transform"]["theta_deg"] == 26.6
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_georef.py" -v`
Expected: FAIL — `ImportError: cannot import name 'georef'`

- [ ] **Step 3: georef 모듈 구현**

`GUMAP-개발/floorplan/fp/georef.py`:

```python
"""도면 로컬 미터 좌표 ↔ WGS84 유사변환.

지리 좌표를 다루는 곳은 이 모듈뿐이다. 앞 단계(rooms, labels)는 전부
도면 픽셀 좌표만 쓴다. 그래서 좌표를 다시 잡아도 폴리곤을 재추출하지 않는다.
"""
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from . import config


class GeoRefError(RuntimeError):
    """좌표 변환 산출 실패."""


@dataclass
class Transform:
    theta_deg: float
    scale: float
    t_lon: float  # 도면 원점 (0,0) 의 경도
    t_lat: float  # 도면 원점 (0,0) 의 위도


def _meters_per_deg_lon(ref_lat: float | None = None) -> float:
    latitude = config.REFERENCE_LATITUDE if ref_lat is None else ref_lat
    return config.METERS_PER_DEG_LON_AT_EQUATOR * math.cos(math.radians(latitude))


def pixels_to_meters(
    points: list[tuple[float, float]],
    origin_px: tuple[float, float],
    px_per_mm: float,
) -> list[tuple[float, float]]:
    """도면 픽셀 좌표를 건물 로컬 미터로 바꾼다.

    이미지 y 는 아래로 증가하므로 부호를 뒤집어 북쪽이 +y 가 되게 한다.
    """
    if px_per_mm <= 0:
        raise GeoRefError(f"px_per_mm 이 잘못됨: {px_per_mm}")
    ox, oy = origin_px
    mm_per_px = 1.0 / px_per_mm
    return [
        ((x - ox) * mm_per_px / 1000.0, -(y - oy) * mm_per_px / 1000.0)
        for x, y in points
    ]


def apply(transform: Transform, x_m: float, y_m: float) -> tuple[float, float]:
    """로컬 미터 → (lon, lat)."""
    theta = math.radians(transform.theta_deg)
    east = transform.scale * (x_m * math.cos(theta) - y_m * math.sin(theta))
    north = transform.scale * (x_m * math.sin(theta) + y_m * math.cos(theta))
    lon = transform.t_lon + east / _meters_per_deg_lon()
    lat = transform.t_lat + north / config.METERS_PER_DEG_LAT
    return lon, lat


def apply_many(
    transform: Transform, points_m: list[tuple[float, float]]
) -> list[tuple[float, float]]:
    return [apply(transform, x, y) for x, y in points_m]


def solve_similarity(
    src_m: list[tuple[float, float]],
    dst_lonlat: list[tuple[float, float]],
) -> Transform:
    """대응점에서 회전·축척·이동을 최소자승으로 푼다 (Umeyama, 반사 없음)."""
    if len(src_m) != len(dst_lonlat):
        raise GeoRefError(
            f"대응점 개수가 다름: src {len(src_m)} vs dst {len(dst_lonlat)}"
        )
    if len(src_m) < 3:
        raise GeoRefError(f"대응점이 3개 이상 필요하다. 현재 {len(src_m)}개.")

    source = np.asarray(src_m, dtype=float)

    # dst 를 임시 원점 기준 미터로 옮긴다
    lon0 = float(np.mean([p[0] for p in dst_lonlat]))
    lat0 = float(np.mean([p[1] for p in dst_lonlat]))
    mpd_lon = _meters_per_deg_lon()
    target = np.asarray(
        [
            [(lon - lon0) * mpd_lon, (lat - lat0) * config.METERS_PER_DEG_LAT]
            for lon, lat in dst_lonlat
        ],
        dtype=float,
    )

    src_mean = source.mean(axis=0)
    dst_mean = target.mean(axis=0)
    src_centered = source - src_mean
    dst_centered = target - dst_mean

    covariance = dst_centered.T @ src_centered / len(source)
    u, singular, vt = np.linalg.svd(covariance)
    correction = np.eye(2)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        correction[1, 1] = -1.0
    rotation = u @ correction @ vt

    src_variance = (src_centered ** 2).sum() / len(source)
    if src_variance <= 0:
        raise GeoRefError("대응점이 한 점에 몰려 있어 변환을 풀 수 없다.")
    scale = float((singular @ np.diag(correction)).sum() / src_variance)

    low, high = config.SCALE_TOLERANCE
    if not (low <= scale <= high):
        raise GeoRefError(
            f"축척이 허용 범위를 벗어남: {scale:.4f} (허용 {low}~{high}). "
            "정사영상 위 대응점을 잘못 찍었을 가능성이 높다."
        )

    theta = math.degrees(math.atan2(rotation[1, 0], rotation[0, 0]))

    # 원점 (0,0) 이 가는 곳을 t_lon/t_lat 으로 되돌린다
    translation = dst_mean - scale * (rotation @ src_mean)
    t_lon = lon0 + float(translation[0]) / mpd_lon
    t_lat = lat0 + float(translation[1]) / config.METERS_PER_DEG_LAT

    return Transform(theta_deg=theta, scale=scale, t_lon=t_lon, t_lat=t_lat)


def load(path: Path | None = None) -> dict:
    target = Path(path) if path else config.GEOREF_PATH
    if not target.exists():
        raise GeoRefError(f"좌표 파일 없음: {target}")
    return json.loads(target.read_text(encoding="utf-8"))


def save(data: dict, path: Path | None = None) -> None:
    target = Path(path) if path else config.GEOREF_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def transform_from(data: dict) -> Transform:
    """techno_georef.json 딕셔너리에서 Transform 을 꺼낸다."""
    raw = (data or {}).get("transform") or {}
    missing = [k for k in ("theta_deg", "scale", "t_lon", "t_lat") if raw.get(k) is None]
    if missing:
        raise GeoRefError(
            f"좌표 변환이 아직 확정되지 않았다 (비어 있는 값: {', '.join(missing)}). "
            "보정 화면에서 정사영상 위 대응점을 먼저 찍어야 한다."
        )
    return Transform(
        theta_deg=float(raw["theta_deg"]),
        scale=float(raw["scale"]),
        t_lon=float(raw["t_lon"]),
        t_lat=float(raw["t_lat"]),
    )


def to_dict(transform: Transform) -> dict:
    return asdict(transform)
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_georef.py" -v`
Expected: PASS (14 passed)

- [ ] **Step 5: 커밋**

```bash
git add "GUMAP-개발/floorplan/fp/georef.py" "GUMAP-개발/floorplan/tests/test_georef.py"
git commit -m "feat(floorplan): solve and apply the drawing-to-WGS84 similarity transform"
```

---

## Task 8: 추출·라벨 CLI 와 QC 이미지

**Files:**
- Create: `GUMAP-개발/floorplan/fp/qc.py`
- Create: `GUMAP-개발/floorplan/01_extract.py`
- Create: `GUMAP-개발/floorplan/02_label.py`
- Test: `GUMAP-개발/floorplan/tests/test_qc.py`

**Interfaces:**
- Consumes: `fp.raster`, `fp.rooms`, `fp.labels`, `fp.excel`, `fp.ocr`
- Produces:
  - `fp.qc.draw_overlay(image, labeled) -> np.ndarray`
  - `fp.qc.save_image(image, path) -> None`
  - `work/{floor}_polygons.json` — `{"floor":..., "size":[w,h], "polygons":[{"points":[[x,y]...],"area_px":...,"centroid":[cx,cy]}]}`
    (이미지 경로 필드는 두지 않는다. 보정 화면은 `work/{floor}_raster_400.png`
    라는 파일명 규칙으로 찾으므로 JSON 에 중복 기록하면 어긋날 여지만 생긴다.)
  - `work/{floor}_labeled.json` — `{"floor":..., "size":[w,h], "polygons":[{"points":..., "room_id":...|null, "candidates":[...]}], "report":{...}}`
  - `work/{floor}_qc.png`
  - `work/report.json`

- [ ] **Step 1: 실패하는 테스트 작성**

`GUMAP-개발/floorplan/tests/test_qc.py`:

```python
import numpy as np

from fp import labels, qc, rooms


def square(x0, y0, size):
    return rooms.RoomPolygon(
        points=[(x0, y0), (x0 + size, y0), (x0 + size, y0 + size), (x0, y0 + size)],
        area_px=float(size * size),
        centroid=(x0 + size / 2, y0 + size / 2),
    )


def test_overlay_does_not_modify_the_input():
    image = np.full((200, 200, 3), 255, dtype=np.uint8)
    original = image.copy()
    qc.draw_overlay(image, [labels.LabeledPolygon(polygon=square(10, 10, 50), room_id="201")])
    assert np.array_equal(image, original)


def test_overlay_draws_something():
    image = np.full((200, 200, 3), 255, dtype=np.uint8)
    out = qc.draw_overlay(image, [labels.LabeledPolygon(polygon=square(10, 10, 50), room_id="201")])
    assert not np.array_equal(out, image)


def test_matched_and_unlabeled_get_different_colours():
    image = np.full((200, 200, 3), 255, dtype=np.uint8)
    matched = qc.draw_overlay(image, [labels.LabeledPolygon(polygon=square(10, 10, 50), room_id="201")])
    unlabeled = qc.draw_overlay(image, [labels.LabeledPolygon(polygon=square(10, 10, 50), room_id=None)])
    assert not np.array_equal(matched, unlabeled)


def test_save_image_writes_a_file(tmp_path):
    image = np.full((50, 50, 3), 255, dtype=np.uint8)
    path = tmp_path / "out.png"
    qc.save_image(image, path)
    assert path.exists() and path.stat().st_size > 0
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_qc.py" -v`
Expected: FAIL — `ImportError: cannot import name 'qc'`

- [ ] **Step 3: qc 모듈 구현**

`GUMAP-개발/floorplan/fp/qc.py`:

```python
"""검수용 이미지 생성. 도면 위에 추출 결과를 겹쳐 그린다."""
from pathlib import Path

import cv2
import numpy as np

COLOR_MATCHED = (0, 160, 0)      # BGR 초록: 번호까지 붙은 방
COLOR_UNLABELED = (0, 0, 230)    # BGR 빨강: 번호를 못 붙인 방


def draw_overlay(image: np.ndarray, labeled: list) -> np.ndarray:
    """원본을 건드리지 않고 폴리곤을 겹쳐 그린 새 이미지를 반환한다."""
    canvas = image.copy()
    for item in labeled:
        color = COLOR_MATCHED if item.room_id else COLOR_UNLABELED
        pts = np.array(item.polygon.points, dtype=np.int32).reshape(-1, 1, 2)
        cv2.polylines(canvas, [pts], isClosed=True, color=color, thickness=4)
        if item.room_id:
            cx, cy = item.polygon.centroid
            cv2.putText(
                canvas, item.room_id, (int(cx) - 30, int(cy)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2, cv2.LINE_AA,
            )
    return canvas


def save_image(image: np.ndarray, path: Path) -> None:
    """경로에 한글이 있어도 안전하게 저장한다."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    ok, buffer = cv2.imencode(".png", image)
    if not ok:
        raise RuntimeError(f"PNG 인코드 실패: {path}")
    buffer.tofile(str(path))
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_qc.py" -v`
Expected: PASS (4 passed)

- [ ] **Step 5: 01_extract.py 작성**

`GUMAP-개발/floorplan/01_extract.py`:

```python
"""도면 PDF 에서 방 폴리곤을 추출한다 (도면 픽셀 좌표).

사용법:
  python 01_extract.py              # 전 층
  python 01_extract.py 2F           # 한 층만
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8")

from fp import config, raster, rooms  # noqa: E402


def extract_floor(floor: str) -> dict:
    image = raster.load_floor_image(floor)
    height, width = image.shape[:2]
    polygons = rooms.extract_room_polygons(image)
    expected = config.EXPECTED_ROOM_COUNTS[floor]
    ratio = len(polygons) / expected if expected else 0
    status = "OK" if ratio >= 0.4 else "LOW"
    print(f"[{status}] {floor}: 폴리곤 {len(polygons)}개 / 엑셀 방 {expected}개 ({ratio:.0%})")
    if status == "LOW":
        print(f"       경고: 추출률이 40% 미만이다. 보정 화면에서 대부분을 직접 그려야 한다.")
    return {
        "floor": floor,
        "size": [width, height],
        "polygons": [
            {
                "points": [[int(x), int(y)] for x, y in p.points],
                "area_px": p.area_px,
                "centroid": [p.centroid[0], p.centroid[1]],
            }
            for p in polygons
        ],
    }


def main() -> int:
    targets = sys.argv[1:] or config.FLOORS
    config.WORK_DIR.mkdir(parents=True, exist_ok=True)
    for floor in targets:
        if floor not in config.FLOORS:
            print(f"알 수 없는 층: {floor}")
            return 1
        data = extract_floor(floor)
        out = config.WORK_DIR / f"{floor}_polygons.json"
        out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 6: 01_extract 실행**

Run: `python "GUMAP-개발/floorplan/01_extract.py"`
Expected: 7개 층 각각 `[OK] 2F: 폴리곤 52개 / 엑셀 방 70개 (74%)` 형태로 출력.
`work/{floor}_polygons.json` 7개 생성.

`[LOW]` 가 나오는 층이 있으면 그 층의 `close_kernel` 값을 조정해본다:

```bash
python -c "import sys; sys.path.insert(0,'GUMAP-개발/floorplan'); from fp import raster,rooms; img=raster.load_floor_image('5F'); print([(k,len(rooms.extract_room_polygons(img,close_kernel=k))) for k in (13,17,21,25,29)])"
```

- [ ] **Step 7: 02_label.py 작성**

`GUMAP-개발/floorplan/02_label.py`:

```python
"""OCR 로 방 번호를 읽어 폴리곤에 붙이고 미매칭을 리포트한다.

사용법:
  python 02_label.py              # 전 층
  python 02_label.py 2F           # 한 층만
"""
import json
import sys
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8")

from fp import config, excel, labels, ocr, qc, raster, rooms  # noqa: E402


def label_floor(floor: str, all_rooms: dict) -> dict:
    polygon_path = config.WORK_DIR / f"{floor}_polygons.json"
    if not polygon_path.exists():
        raise SystemExit(f"{polygon_path} 가 없다. 먼저 01_extract.py 를 실행하라.")
    raw = json.loads(polygon_path.read_text(encoding="utf-8"))

    polygons = [
        rooms.RoomPolygon(
            points=[(int(x), int(y)) for x, y in p["points"]],
            area_px=float(p["area_px"]),
            centroid=(float(p["centroid"][0]), float(p["centroid"][1])),
        )
        for p in raw["polygons"]
    ]

    png = raster.render_floor(floor)
    words = ocr.ocr_image(png)
    expected = {r.room_id for r in all_rooms[floor]}

    labeled, report = labels.assign_labels(polygons, words, expected)

    print(
        f"{floor}: 매칭 {len(report.matched)} / 엑셀 {len(expected)} "
        f"· 번호없음 {report.unlabeled} · 폴리곤없음 {len(report.missing)} "
        f"· 모호 {len(report.ambiguous)} · 예상밖 {len(report.unexpected)}"
    )

    overlay = qc.draw_overlay(raster.load_floor_image(floor), labeled)
    qc.save_image(overlay, config.WORK_DIR / f"{floor}_qc.png")

    return {
        "floor": floor,
        "size": raw["size"],
        "polygons": [
            {
                "points": [[int(x), int(y)] for x, y in item.polygon.points],
                "area_px": item.polygon.area_px,
                "centroid": list(item.polygon.centroid),
                "room_id": item.room_id,
                "candidates": item.candidates,
                "drawing_name": item.drawing_name,
            }
            for item in labeled
        ],
        "report": asdict(report),
    }


def main() -> int:
    targets = sys.argv[1:] or config.FLOORS
    all_rooms = excel.load_rooms()
    summary = {}
    for floor in targets:
        if floor not in config.FLOORS:
            print(f"알 수 없는 층: {floor}")
            return 1
        data = label_floor(floor, all_rooms)
        (config.WORK_DIR / f"{floor}_labeled.json").write_text(
            json.dumps(data, ensure_ascii=False), encoding="utf-8"
        )
        summary[floor] = data["report"]
    (config.WORK_DIR / "report.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\n리포트: {config.WORK_DIR / 'report.json'}")
    print(f"검수 이미지: {config.WORK_DIR}/*_qc.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 8: 02_label 실행하고 QC 이미지 확인**

Run: `python "GUMAP-개발/floorplan/02_label.py"`
Expected: 층별 매칭 통계 출력, `work/{floor}_labeled.json` 7개와 `work/{floor}_qc.png` 7개 생성.

**`work/2F_qc.png` 를 직접 열어본다.** 초록 폴리곤이 실제 방 벽선에 붙어 있고 방 번호가
맞게 찍혀 있는지 눈으로 확인한다. 빨간 폴리곤은 보정 대상이다.

- [ ] **Step 9: 커밋**

```bash
git add "GUMAP-개발/floorplan/fp/qc.py" "GUMAP-개발/floorplan/01_extract.py" "GUMAP-개발/floorplan/02_label.py" "GUMAP-개발/floorplan/tests/test_qc.py"
git commit -m "feat(floorplan): add extract and label CLIs with QC overlays"
```

---

## Task 9: 보정 화면

**Files:**
- Create: `GUMAP-개발/floorplan/floorplan-editor.html`
- Create: `GUMAP-개발/floorplan/serve_editor.py`

**Interfaces:**
- Consumes: `work/{floor}_labeled.json`, `work/{floor}_raster_400.png`, `techno_georef.json`
- Produces: 갱신된 `work/{floor}_labeled.json`, 채워진 `techno_georef.json`

**두 가지 모드:**
1. **방 보정** — 도면 배경 위에서 폴리곤을 그리고 고치고 번호를 붙인다 (도면 픽셀 좌표)
2. **좌표 대응점** — 정사영상 배경 위에서 건물 모서리 대응점을 찍는다 (WGS84)

브라우저에서 파일을 직접 쓸 수 없으므로 작은 로컬 저장 서버를 함께 둔다.

- [ ] **Step 1: 저장 서버 작성**

`GUMAP-개발/floorplan/serve_editor.py`:

```python
"""보정 화면용 로컬 서버.

정적 파일과 work/ 산출물을 서빙하고, POST 로 저장을 받는다.
정사영상 타일은 기존 8765 포트 서버를 그대로 쓴다.

실행: python serve_editor.py   →  http://localhost:8790/floorplan-editor.html
"""
import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8")

from fp import config  # noqa: E402

TOOL_DIR = Path(__file__).resolve().parent
PORT = 8790
ALLOWED_SAVE = {"labeled", "georef"}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(TOOL_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        try:
            kind = self.path.strip("/").split("/")[-1]
            if kind not in ALLOWED_SAVE:
                self.send_error(404, "unknown save target")
                return
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))

            if kind == "labeled":
                floor = payload.get("floor")
                if floor not in config.FLOORS:
                    self.send_error(400, "bad floor")
                    return
                target = config.WORK_DIR / f"{floor}_labeled.json"
            else:
                target = config.GEOREF_PATH

            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

            body = json.dumps({"ok": True, "path": str(target)}, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            print(f"저장: {target}")
        except Exception as exc:  # noqa: BLE001
            self.send_error(500, str(exc))


if __name__ == "__main__":
    print(f"보정 화면: http://localhost:{PORT}/floorplan-editor.html")
    print("정사영상 타일이 필요하면 기존 8765 포트 서버도 함께 켜 둘 것.")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
```

- [ ] **Step 2: 보정 화면 작성**

`GUMAP-개발/floorplan/floorplan-editor.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>테크노관 도면 보정 도구</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#0a0f28; color:#e2e8f0; font-family:system-ui,-apple-system,sans-serif;
         height:100vh; display:flex; flex-direction:column; overflow:hidden; }
  #top { display:flex; align-items:center; gap:10px; padding:8px 12px;
         background:rgba(10,15,40,.95); border-bottom:1px solid rgba(129,140,248,.3); }
  #top select, #top button { background:#1e293b; color:#e2e8f0; border:1px solid #475569;
         border-radius:6px; padding:6px 10px; font-size:12px; cursor:pointer; }
  #top button.primary { background:linear-gradient(135deg,#6366f1,#4f46e5); border:none; font-weight:700; }
  #stat { font-size:12px; color:#94a3b8; margin-left:auto; }
  #main { flex:1; display:flex; min-height:0; }
  #map { flex:1; background:#111827; }
  #side { width:260px; background:rgba(10,15,40,.95); border-left:1px solid rgba(129,140,248,.3);
          display:flex; flex-direction:column; }
  #side h3 { font-size:11px; color:#818cf8; padding:8px 10px; border-bottom:1px solid rgba(255,255,255,.08); }
  #todo { flex:1; overflow-y:auto; }
  .item { padding:6px 10px; font-size:12px; cursor:pointer; border-bottom:1px solid rgba(255,255,255,.04); }
  .item:hover { background:rgba(99,102,241,.2); }
  .item.sel { background:#6366f1; color:#fff; }
  #help { padding:8px 10px; font-size:11px; color:#64748b; line-height:1.6;
          border-top:1px solid rgba(255,255,255,.08); }
</style>
</head>
<body>

<div id="top">
  <select id="floor"></select>
  <button id="draw">그리기 (D)</button>
  <button id="del">삭제 (Del)</button>
  <button id="purge">도면틀 잡음 제거</button>
  <button id="undo">되돌리기 (Ctrl+Z)</button>
  <button id="save" class="primary">저장</button>
  <span id="stat">로딩 중…</span>
</div>

<div id="main">
  <div id="map"></div>
  <div id="side">
    <h3 id="side-title">미배치 방</h3>
    <div id="todo"></div>
    <div id="help">
      · 목록에서 방 선택 → <b>그리기</b> → 도면 위 클릭으로 꼭짓점 → 더블클릭 종료<br>
      · 폴리곤 클릭 → 선택, <b>삭제</b>로 제거<br>
      · 저장하면 work/{층}_labeled.json 이 갱신된다<br><br>
      좌표 대응점은 <b>georef-picker.html</b> 에서 따로 찍는다.
    </div>
  </div>
</div>

<script>
const API = '';
const FLOORS = ["B1F","1F","2F","3F","4F","5F","6F"];

let state = {
  floor: '2F',
  data: null,          // {floor,size,polygons,report}
  layers: [],          // {poly, rec}
  selected: null,
  drawing: null,       // {points:[], markers:[]}
  selectedRoomId: null,
  dirty: false,        // 저장 안 된 변경이 있는가
  undo: []             // 변경 직전 스냅샷 스택
};

// 이 화면에서 172개 방을 몇 시간에 걸쳐 고친다. 실수 한 번이나 층 전환 한 번에
// 그 작업이 날아가면 안 되므로, 모든 변경 전에 스냅샷을 남기고 저장 여부를 추적한다.
const UNDO_LIMIT = 50;

function snapshot(label) {
  state.undo.push({
    label,
    polygons: JSON.parse(JSON.stringify(state.data.polygons)),
    missing: (state.data.report && state.data.report.missing || []).slice()
  });
  if (state.undo.length > UNDO_LIMIT) state.undo.shift();
  state.dirty = true;
}

function undo() {
  const prev = state.undo.pop();
  if (!prev) { setStat('되돌릴 작업이 없습니다'); return; }
  state.data.polygons = prev.polygons;
  if (state.data.report) state.data.report.missing = prev.missing;
  state.selected = null;
  renderPolygons(); renderTodo();
  setStat(`되돌림: ${prev.label} (남은 되돌리기 ${state.undo.length})`);
}

// 도면 픽셀 좌표를 그대로 Leaflet 의 CRS.Simple 좌표로 쓴다.
const map = L.map('map', { crs: L.CRS.Simple, minZoom: -5, maxZoom: 4, zoomControl: true });
let imageLayer = null;

function pxToLatLng(x, y) { return map.unproject([x, y], 0); }
function latLngToPx(ll) { const p = map.project(ll, 0); return [p.x, p.y]; }

async function loadFloor(floor) {
  state.floor = floor;
  state.dirty = false;
  state.undo = [];
  state.selected = null;
  state.selectedRoomId = null;
  const res = await fetch(`${API}/work/${floor}_labeled.json?t=${Date.now()}`);
  if (!res.ok) { setStat(`work/${floor}_labeled.json 없음 — 02_label.py 를 먼저 실행하세요`); return; }
  state.data = await res.json();

  const [w, h] = state.data.size;
  if (imageLayer) map.removeLayer(imageLayer);
  const bounds = [pxToLatLng(0, 0), pxToLatLng(w, h)];
  imageLayer = L.imageOverlay(`${API}/work/${floor}_raster_400.png`, bounds, { opacity: 0.85 }).addTo(map);
  map.fitBounds(bounds);

  renderPolygons();
  renderTodo();
}

// 추출기가 도면틀·치수선을 방으로 오인한 것이 층마다 11~41% 나온다 (실측).
// 특징이 뚜렷하다: 종횡비가 6:1 을 넘고 방 번호가 붙지 않는다.
// 지도에는 어차피 안 들어가지만 화면이 빨갛게 뒤덮여 진짜 미매칭이 안 보이므로
// 흐리게 깔고, 한 번에 지울 수 있게 한다.
function isLikelyFrameNoise(rec) {
  if (rec.room_id) return false;
  const xs = rec.points.map(p => p[0]), ys = rec.points.map(p => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  if (w === 0 || h === 0) return true;
  return Math.max(w, h) / Math.min(w, h) > 6;
}

function styleFor(rec) {
  if (rec.room_id) return { color:'#22c55e', weight:2, fillColor:'#22c55e', fillOpacity:0.18 };
  if (isLikelyFrameNoise(rec)) return { color:'#64748b', weight:1, fillColor:'#64748b', fillOpacity:0.06 };
  return { color:'#ef4444', weight:2, fillColor:'#ef4444', fillOpacity:0.22 };
}

function purgeFrameNoise() {
  const doomed = state.data.polygons.filter(isLikelyFrameNoise);
  if (!doomed.length) { setStat('제거할 도면틀 잡음이 없습니다'); return; }
  if (!confirm(`도면틀 잡음 ${doomed.length}개를 제거합니다. (되돌리기 가능)`)) return;
  snapshot(`잡음 ${doomed.length}개 제거`);
  state.data.polygons = state.data.polygons.filter(r => !isLikelyFrameNoise(r));
  state.selected = null;
  renderPolygons();
  setStat(`도면틀 잡음 ${doomed.length}개 제거 — 저장해야 반영됩니다`);
}

function renderPolygons() {
  state.layers.forEach(l => map.removeLayer(l.poly));
  state.layers = [];
  state.data.polygons.forEach(rec => {
    const latlngs = rec.points.map(p => pxToLatLng(p[0], p[1]));
    const poly = L.polygon(latlngs, styleFor(rec)).addTo(map);
    poly.on('click', e => { L.DomEvent.stop(e); select(rec); });
    if (rec.room_id) poly.bindTooltip(rec.room_id, { permanent:true, direction:'center', className:'lbl' });
    state.layers.push({ poly, rec });
  });
  updateStat();
}

function select(rec) {
  state.selected = rec;
  state.layers.forEach(l => l.poly.setStyle(
    l.rec === rec ? { color:'#facc15', weight:4, fillOpacity:0.35 } : styleFor(l.rec)
  ));
}

function renderTodo() {
  const box = document.getElementById('todo');
  const missing = (state.data.report && state.data.report.missing) || [];
  box.innerHTML = missing.map(id =>
    `<div class="item" data-id="${id}">${id}</div>`).join('') ||
    '<div class="item" style="color:#64748b">미배치 방 없음</div>';
  box.querySelectorAll('.item[data-id]').forEach(el => {
    el.onclick = () => {
      box.querySelectorAll('.item').forEach(x => x.classList.remove('sel'));
      el.classList.add('sel');
      state.selectedRoomId = el.dataset.id;
      setStat(`선택: ${state.selectedRoomId} — 그리기(D) 후 도면 위를 클릭하세요`);
    };
  });
}

function updateStat() {
  const total = state.data.polygons.length;
  const named = state.data.polygons.filter(p => p.room_id).length;
  const missing = (state.data.report && state.data.report.missing || []).length;
  setStat(`${state.floor} · 폴리곤 ${total} · 번호부여 ${named} · 미배치 ${missing}`);
}
function setStat(t) { document.getElementById('stat').textContent = t; }

// ── 그리기 ───────────────────────────────────────────────
function startDraw() {
  if (!state.selectedRoomId) {
    setStat('먼저 오른쪽 목록에서 방을 선택하세요'); return;
  }
  state.drawing = { points: [], markers: [] };
  setStat('클릭으로 꼭짓점 추가, 더블클릭으로 종료');
}

map.on('click', e => {
  if (!state.drawing) return;
  const [x, y] = latLngToPx(e.latlng);
  state.drawing.points.push([Math.round(x), Math.round(y)]);
  state.drawing.markers.push(L.circleMarker(e.latlng, { radius:4, color:'#facc15' }).addTo(map));
});

map.on('dblclick', e => {
  L.DomEvent.stop(e);
  if (!state.drawing || state.drawing.points.length < 3) return;
  const rec = {
    points: state.drawing.points,
    area_px: 0,
    centroid: centroidOf(state.drawing.points),
    room_id: state.selectedRoomId,
    candidates: []
  };
  snapshot(`${state.selectedRoomId} 그리기`);
  state.data.polygons.push(rec);
  const missing = (state.data.report && state.data.report.missing) || [];
  const idx = missing.indexOf(state.selectedRoomId);
  if (idx >= 0) missing.splice(idx, 1);
  state.drawing.markers.forEach(m => map.removeLayer(m));
  state.drawing = null;
  state.selectedRoomId = null;
  renderPolygons(); renderTodo();
});

function centroidOf(pts) {
  const n = pts.length;
  return [pts.reduce((s,p)=>s+p[0],0)/n, pts.reduce((s,p)=>s+p[1],0)/n];
}

function deleteSelected() {
  if (!state.selected) { setStat('삭제할 폴리곤을 먼저 클릭하세요'); return; }
  const label = state.selected.room_id || '무번호 폴리곤';
  // 번호가 붙은 방은 이미 확보한 작업이므로 지울 때 한 번 더 묻는다
  if (state.selected.room_id && !confirm(`${label} 을(를) 삭제합니다. (되돌리기 가능)`)) return;
  snapshot(`${label} 삭제`);
  const i = state.data.polygons.indexOf(state.selected);
  if (i >= 0) state.data.polygons.splice(i, 1);
  if (state.selected.room_id && state.data.report && state.data.report.missing)
    state.data.report.missing.push(state.selected.room_id);
  state.selected = null;
  renderPolygons(); renderTodo();
  setStat(`${label} 삭제 — Ctrl+Z 로 되돌릴 수 있습니다`);
}

// ── 저장 ─────────────────────────────────────────────────
async function save() {
  const res = await fetch(`${API}/save/labeled`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(state.data)
  });
  if (res.ok) { state.dirty = false; state.undo = []; }
  setStat(res.ok ? '저장 완료' : '저장 실패');
}

// ── 초기화 ───────────────────────────────────────────────
const sel = document.getElementById('floor');
FLOORS.forEach(f => { const o=document.createElement('option'); o.value=f; o.textContent=f; sel.appendChild(o); });
sel.value = '2F';
sel.onchange = () => {
  if (state.dirty && !confirm('저장하지 않은 변경이 있습니다. 버리고 층을 바꿀까요?')) {
    sel.value = state.floor;   // 선택을 되돌린다
    return;
  }
  loadFloor(sel.value);
};
document.getElementById('draw').onclick = startDraw;
document.getElementById('del').onclick = deleteSelected;
document.getElementById('purge').onclick = purgeFrameNoise;
document.getElementById('undo').onclick = undo;
document.getElementById('save').onclick = save;
document.addEventListener('keydown', ev => {
  if (ev.ctrlKey && (ev.key === 'z' || ev.key === 'Z')) { ev.preventDefault(); undo(); return; }
  if (ev.key === 'Delete') deleteSelected();
  if (!ev.ctrlKey && (ev.key === 'd' || ev.key === 'D')) startDraw();
});
// 저장 안 한 채로 창을 닫으면 몇 시간치 보정이 날아간다
window.addEventListener('beforeunload', ev => {
  if (!state.dirty) return;
  ev.preventDefault();
  ev.returnValue = '';
});
map.doubleClickZoom.disable();
loadFloor('2F');
</script>
</body>
</html>
```

- [ ] **Step 3: 보정 화면 실행 확인**

Run: `python "GUMAP-개발/floorplan/serve_editor.py"`
브라우저에서 `http://localhost:8790/floorplan-editor.html` 을 연다.

Expected:
- 2F 도면이 배경으로 뜬다
- 초록(번호 있음)/빨강(번호 없음) 폴리곤이 도면 위에 겹쳐 보인다
- 오른쪽에 미배치 방 목록이 뜬다
- 층 선택으로 7개 층을 오갈 수 있다

- [ ] **Step 4: 커밋**

```bash
git add "GUMAP-개발/floorplan/floorplan-editor.html" "GUMAP-개발/floorplan/serve_editor.py"
git commit -m "feat(floorplan): add browser correction editor with a local save server"
```

---

## Task 10: 좌표 확정 CLI (사람 개입 지점)

**Files:**
- Create: `GUMAP-개발/floorplan/03_georef.py`
- Modify: `GUMAP-개발/floorplan/fp/georef.py` (도면틀 기준점 검출 추가)
- Test: `GUMAP-개발/floorplan/tests/test_georef.py` (기준점 검출 테스트 추가)

**Interfaces:**
- Consumes: `fp.georef.solve_similarity`, `fp.georef.pixels_to_meters`, `fp.raster.load_floor_image`
- Produces:
  - `fp.georef.detect_frame_origin(image) -> tuple[int, int]` — 도면틀 좌하단 기준점 픽셀
  - `fp.georef.px_per_mm_for(image) -> float`
  - `fp.ortho.tile_index(lon, lat, zoom) -> tuple[int, int]`
  - `fp.ortho.tile_bounds(tx, ty, zoom) -> tuple[float, float, float, float]` — (west, south, east, north)
  - `fp.ortho.stitch(zoom=16, force=False) -> tuple[Path, dict]` — PNG 경로와 정확한 경계
  - `work/ortho_z16.png`, `work/ortho_z16.json`
  - `techno_georef.json` 완성본 (`transform`, `control_points`, `floor_origin_px`, `floor_px_per_mm`)

**이 태스크에는 사람이 해야 하는 단계가 있다.** 정사영상 위 대응점 지정은
자동화할 수 없다. Step 9 에서 사용자가 직접 찍어야 하고, 그 전까지 Task 11 은 진행할 수 없다.

- [ ] **Step 1: 기준점 검출 테스트 추가**

`GUMAP-개발/floorplan/tests/test_georef.py` 끝에 덧붙인다:

```python
def test_frame_origin_is_inside_the_image():
    from fp import raster
    image = raster.load_floor_image("2F")
    ox, oy = georef.detect_frame_origin(image)
    height, width = image.shape[:2]
    assert 0 < ox < width
    assert 0 < oy < height


def test_frame_origin_is_consistent_within_one_source_pdf():
    """같은 PDF 에서 나온 층끼리는 기준점이 일치해야 한다.

    서로 다른 PDF 사이에서는 표제란·여백 크기가 달라 일치하지 않는다.
    그 편차는 사람이 보정 화면에서 치수 체인 양 끝점을 찍어 없앤다.
    """
    from fp import raster

    # 2F 와 3F 는 각각 다른 PDF 지만 같은 작도 시리즈라 여백이 거의 같다
    origins = {f: georef.detect_frame_origin(raster.load_floor_image(f)) for f in ["2F", "3F"]}
    xs = [o[0] for o in origins.values()]
    assert max(xs) - min(xs) < 60, f"도면틀 x 기준점이 크게 다름: {origins}"


def test_px_per_mm_estimates_vary_between_source_pdfs():
    """잉크 bbox 추정치는 원본 PDF 마다 흔들린다 — 이 사실을 못박아 둔다.

    이게 사람이 치수 체인을 직접 찍어야 하는 이유다. 이 테스트가 실패한다면
    편차가 사라졌다는 뜻이므로, 자동 추정만으로 충분한지 다시 판단해야 한다.
    """
    from fp import config, raster

    values = {f: georef.px_per_mm_for(raster.load_floor_image(f)) for f in config.FLOORS}
    spread = max(values.values()) - min(values.values())
    assert spread > 0.001, f"편차가 예상보다 작다. 자동 추정 재검토 필요: {values}"


def test_px_per_mm_is_plausible_for_400dpi():
    from fp import raster
    image = raster.load_floor_image("2F")
    value = georef.px_per_mm_for(image)
    # 90200mm 를 약 2400~3600px 로 표현 → 0.026~0.040 px/mm
    assert 0.02 < value < 0.06, f"px_per_mm 이 이상함: {value}"
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_georef.py" -k frame_origin -v`
Expected: FAIL — `AttributeError: module 'fp.georef' has no attribute 'detect_frame_origin'`

- [ ] **Step 3: 기준점 검출 구현**

`GUMAP-개발/floorplan/fp/georef.py` 상단 import 에 다음을 추가한다:

```python
import cv2
```

그리고 파일 끝에 다음을 덧붙인다:

```python
# ── 도면틀 기준점 ────────────────────────────────────────────
# 잉크 바운딩 박스로 잡은 값은 어디까지나 초기 추정치다.
#
# 실측 경고: 층별 원본 PDF 가 표제란·여백 크기가 서로 달라서, 같은 도면틀을
# 쓰는데도 잉크 bbox 로 계산한 px/mm 가 0.0465~0.0518 로 10% 흔들린다.
# 원본을 육안 확인한 결과 전 층이 동일한 90,200 치수 체인을 갖고 있으므로
# 이 편차는 도면이 아니라 스캔 여백에서 온다.
#
# 따라서 이 값은 보정 화면에서 사람이 치수 체인 양 끝점을 찍어 확정한다.
# 여기서 나온 값은 그 화면의 초기값일 뿐이며, 최종 값은
# techno_georef.json 의 floor_origin_px / floor_px_per_mm 에 저장된다.


def _content_bbox(image) -> tuple[int, int, int, int]:
    """도면 내용(잉크)의 바운딩 박스 (x, y, w, h)."""
    from .rooms import extract_wall_mask

    mask = extract_wall_mask(image)
    points = cv2.findNonZero(mask)
    if points is None:
        raise GeoRefError("도면에서 벽선을 찾지 못했다.")
    return cv2.boundingRect(points)


def detect_frame_origin(image) -> tuple[int, int]:
    """도면 내용 바운딩 박스의 좌하단 픽셀 좌표."""
    x, y, w, h = _content_bbox(image)
    return (x, y + h)


def px_per_mm_for(image) -> float:
    """도면 가로 폭을 실측 치수로 나눈 px/mm."""
    _, _, w, _ = _content_bbox(image)
    return w / config.DRAWING_EXTENT_MM[0]
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_georef.py" -v`
Expected: PASS (17 passed)

`test_frame_origin_is_consistent_across_shared_frame_floors` 가 실패하면 층마다
도면틀이 다르다는 뜻이므로, 그 층은 개별 `floor_origin_px` 를 쓰도록 해야 한다.
실패 시 실제 값을 출력해 확인한다:

```bash
python -c "import sys; sys.path.insert(0,'GUMAP-개발/floorplan'); from fp import raster,georef; print({f: georef.detect_frame_origin(raster.load_floor_image(f)) for f in ['B1F','1F','2F','3F','4F','5F','6F']})"
```

- [ ] **Step 5: 03_georef.py 작성**

`GUMAP-개발/floorplan/03_georef.py`:

```python
"""좌표 변환을 확정한다.

  python 03_georef.py init     # techno_georef.json 뼈대 생성 (기준점 자동 검출)
  python 03_georef.py solve    # control_points 로 transform 산출
  python 03_georef.py show     # 현재 상태 확인

control_points 는 사람이 채워야 한다. 형식:
  [{"px": [x, y], "floor": "2F", "lon": 128.3945, "lat": 36.1471}, ...]
정사영상 위에서 건물 모서리를 3점 이상 찍어 넣는다.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8")

from fp import config, georef, ortho, raster  # noqa: E402


def cmd_init() -> int:
    png, bounds = ortho.stitch()
    print(f"정사영상 스티칭: {png} (타일 {bounds['tiles']}장)")
    print(f"  경계 W {bounds['west']:.6f} E {bounds['east']:.6f} "
          f"S {bounds['south']:.6f} N {bounds['north']:.6f}")

    origins, scales = {}, {}
    for floor in config.FLOORS:
        image = raster.load_floor_image(floor)
        origins[floor] = list(georef.detect_frame_origin(image))
        scales[floor] = georef.px_per_mm_for(image)
        print(f"{floor}: 기준점 {origins[floor]}, px/mm {scales[floor]:.6f}")

    data = {
        "reference_latitude": config.REFERENCE_LATITUDE,
        "drawing_extent_mm": {"x": config.DRAWING_EXTENT_MM[0], "y": config.DRAWING_EXTENT_MM[1]},
        "transform": {"theta_deg": None, "scale": None, "t_lon": None, "t_lat": None},
        "control_points": [],
        "floor_origin_px": origins,
        "floor_px_per_mm": scales,
    }
    georef.save(data)
    print(f"\n생성: {config.GEOREF_PATH}")
    print("이제 control_points 를 채워야 한다. 보정 화면의 '좌표 대응점' 모드를 쓰거나")
    print("정사영상에서 읽은 건물 모서리 좌표를 직접 넣는다 (3점 이상).")
    return 0


def cmd_solve() -> int:
    data = georef.load()
    points = data.get("control_points") or []
    if len(points) < 3:
        print(f"대응점이 {len(points)}개다. 3개 이상 필요하다.")
        return 1

    src, dst = [], []
    for cp in points:
        floor = cp["floor"]
        origin = data["floor_origin_px"][floor]
        px_per_mm = data["floor_px_per_mm"][floor]
        meters = georef.pixels_to_meters([tuple(cp["px"])], tuple(origin), px_per_mm)[0]
        src.append(meters)
        dst.append((float(cp["lon"]), float(cp["lat"])))

    try:
        transform = georef.solve_similarity(src, dst)
    except georef.GeoRefError as exc:
        print(f"실패: {exc}")
        return 1

    data["transform"] = georef.to_dict(transform)
    georef.save(data)
    print(f"회전 {transform.theta_deg:.3f}° · 축척 {transform.scale:.5f}")
    print(f"원점 {transform.t_lon:.7f}, {transform.t_lat:.7f}")
    print(f"저장: {config.GEOREF_PATH}")
    return 0


def cmd_show() -> int:
    data = georef.load()
    print(f"대응점 {len(data.get('control_points') or [])}개")
    print(f"transform: {data.get('transform')}")
    return 0


COMMANDS = {"init": cmd_init, "solve": cmd_solve, "show": cmd_show}

if __name__ == "__main__":
    name = sys.argv[1] if len(sys.argv) > 1 else "show"
    if name not in COMMANDS:
        print(f"사용법: python 03_georef.py [{'|'.join(COMMANDS)}]")
        raise SystemExit(1)
    raise SystemExit(COMMANDS[name]())
```

- [ ] **Step 6: 기준점 자동 검출 실행**

Run: `python "GUMAP-개발/floorplan/03_georef.py" init`
Expected: 7개 층의 기준점과 px/mm 출력, `techno_georef.json` 생성.
`px/mm` 값이 층마다 소수점 셋째 자리까지 비슷해야 한다.

- [ ] **Step 7: 정사영상 스티칭 모듈 작성**

**왜 필요한가:** 기존 프론트(`map-layers.js` 의 `Ortho4326TmsLayer`)는 WebMercator 타일
요청을 가장 가까운 4326 TMS 타일로 갈아끼우는 근사 방식이다. 화면에 대충 보이기에는
충분하지만 타일 한 칸(z16 에서 약 247m) 단위의 어긋남이 생길 수 있다. **그 위에서 찍은
대응점은 그대로 오염된다.** 그래서 픽커에서는 이 방식을 쓰지 않고, 4326 타일의 정확한
지리 경계를 계산해 미리 이어붙인 이미지를 `L.imageOverlay` 로 정확한 위치에 깐다.

`GUMAP-개발/floorplan/tests/test_ortho.py`:

```python
import pytest

from fp import ortho


def test_tile_index_matches_the_4326_tms_formula():
    # x = (lon+180)/360 * 2^(z+1), y = (lat+90)/180 * 2^z
    tx, ty = ortho.tile_index(128.394348, 36.146643, 16)
    assert tx == 112282
    assert ty == 45928


def test_tile_bounds_contain_their_own_centre():
    tx, ty = ortho.tile_index(128.394348, 36.146643, 16)
    lon0, lat0, lon1, lat1 = ortho.tile_bounds(tx, ty, 16)
    assert lon0 <= 128.394348 <= lon1
    assert lat0 <= 36.146643 <= lat1


def test_tile_bounds_are_one_tile_wide():
    lon0, lat0, lon1, lat1 = ortho.tile_bounds(112282, 45928, 16)
    assert lon1 - lon0 == pytest.approx(360 / 2 ** 17)
    assert lat1 - lat0 == pytest.approx(180 / 2 ** 16)


def test_stitch_produces_an_image_and_bounds():
    path, bounds = ortho.stitch()
    assert path.exists()
    assert bounds["west"] < bounds["east"]
    assert bounds["south"] < bounds["north"]


def test_stitched_bounds_cover_the_building():
    _, bounds = ortho.stitch()
    assert bounds["west"] < 128.394348 < bounds["east"]
    assert bounds["south"] < 36.146643 < bounds["north"]


def test_stitched_image_puts_north_at_the_top():
    """상하가 뒤집히면 정사영상 위에서 찍은 대응점이 전부 어긋난다.

    지리 경계만 보는 테스트로는 반전을 못 잡는다. 타일 파일을 직접 읽어
    캔버스의 어느 행에 놓였는지 픽셀 단위로 대조한다.
    """
    import math

    import cv2
    import numpy as np

    from fp import config

    path, _ = ortho.stitch()
    canvas = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)

    lon_c, lat_c = ortho.BUILDING_CENTRE
    d_lat = ortho.HALF_EXTENT_M / config.METERS_PER_DEG_LAT
    d_lon = ortho.HALF_EXTENT_M / (
        config.METERS_PER_DEG_LON_AT_EQUATOR * math.cos(math.radians(lat_c))
    )
    x0, y0 = ortho.tile_index(lon_c - d_lon, lat_c - d_lat)
    _, y1 = ortho.tile_index(lon_c + d_lon, lat_c + d_lat)

    def tile(ty):
        return cv2.imdecode(
            np.fromfile(str(config.ORTHO_DIR / str(ortho.ZOOM) / str(x0) / f"{ty}.jpg"),
                        dtype=np.uint8),
            cv2.IMREAD_COLOR,
        )

    size = ortho.TILE_PX
    assert np.array_equal(canvas[0:size, 0:size], tile(y1)), "북쪽 타일이 맨 위가 아니다 - 상하 반전"
    bottom = (y1 - y0) * size
    assert np.array_equal(canvas[bottom:bottom + size, 0:size], tile(y0)), "남쪽 타일이 맨 아래가 아니다"


def test_stitched_image_is_not_blank():
    import cv2
    import numpy as np

    path, _ = ortho.stitch()
    image = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
    assert image is not None
    assert image.std() > 10, "정사영상이 단색이다 - 타일을 못 읽었다"
```

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_ortho.py" -v`
Expected: FAIL — `ImportError: cannot import name 'ortho'`

`GUMAP-개발/floorplan/fp/ortho.py`:

```python
"""드론 정사영상 타일을 정확한 지리 경계와 함께 한 장으로 이어붙인다.

프론트의 Ortho4326TmsLayer 는 WebMercator 요청을 가까운 4326 타일로 바꾸는
근사 방식이라 대응점 지정에는 쓸 수 없다. 여기서는 4326 TMS 타일의 실제
경계를 그대로 계산해 오차 없이 배치한다.

타일 스킴: x = (lon+180)/360 * 2^(z+1),  y = (lat+90)/180 * 2^z  (TMS, y 는 남쪽이 0)
테크노관을 덮는 최고 해상도는 z16 (약 0.96 m/px). z17 은 캠퍼스 일부만 있다.
"""
import json
import math
from pathlib import Path

import cv2
import numpy as np

from . import config

ZOOM = 16
TILE_PX = 256
HALF_EXTENT_M = 150.0
BUILDING_CENTRE = (128.394348, 36.146643)  # lon, lat


def tile_index(lon: float, lat: float, zoom: int = ZOOM) -> tuple[int, int]:
    x = int((lon + 180.0) / 360.0 * (2 ** (zoom + 1)))
    y = int((lat + 90.0) / 180.0 * (2 ** zoom))
    return x, y


def tile_bounds(tx: int, ty: int, zoom: int = ZOOM) -> tuple[float, float, float, float]:
    """(west, south, east, north)."""
    span_lon = 360.0 / (2 ** (zoom + 1))
    span_lat = 180.0 / (2 ** zoom)
    west = tx * span_lon - 180.0
    south = ty * span_lat - 90.0
    return west, south, west + span_lon, south + span_lat


def stitch(zoom: int = ZOOM, force: bool = False) -> tuple[Path, dict]:
    """건물 주변 타일을 이어붙여 PNG 와 정확한 경계를 반환한다."""
    out_png = config.WORK_DIR / f"ortho_z{zoom}.png"
    out_json = config.WORK_DIR / f"ortho_z{zoom}.json"
    if out_png.exists() and out_json.exists() and not force:
        return out_png, json.loads(out_json.read_text(encoding="utf-8"))

    lon_c, lat_c = BUILDING_CENTRE
    d_lat = HALF_EXTENT_M / config.METERS_PER_DEG_LAT
    d_lon = HALF_EXTENT_M / (
        config.METERS_PER_DEG_LON_AT_EQUATOR * math.cos(math.radians(lat_c))
    )
    x0, y0 = tile_index(lon_c - d_lon, lat_c - d_lat, zoom)
    x1, y1 = tile_index(lon_c + d_lon, lat_c + d_lat, zoom)

    width = (x1 - x0 + 1) * TILE_PX
    height = (y1 - y0 + 1) * TILE_PX
    canvas = np.zeros((height, width, 3), dtype=np.uint8)

    found = 0
    for tx in range(x0, x1 + 1):
        for ty in range(y0, y1 + 1):
            path = config.ORTHO_DIR / str(zoom) / str(tx) / f"{ty}.jpg"
            if not path.exists():
                continue
            tile = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
            if tile is None:
                continue
            # TMS 는 y 가 남쪽부터 증가하고 이미지는 위에서부터 채운다
            top = (y1 - ty) * TILE_PX
            left = (tx - x0) * TILE_PX
            canvas[top:top + TILE_PX, left:left + TILE_PX] = tile
            found += 1
    if found == 0:
        raise FileNotFoundError(f"정사영상 타일을 찾지 못했다: {config.ORTHO_DIR / str(zoom)}")

    west, south, _, _ = tile_bounds(x0, y0, zoom)
    _, _, east, north = tile_bounds(x1, y1, zoom)
    bounds = {"west": west, "south": south, "east": east, "north": north,
              "zoom": zoom, "tiles": found}

    config.WORK_DIR.mkdir(parents=True, exist_ok=True)
    ok, buffer = cv2.imencode(".png", canvas)
    if not ok:
        raise RuntimeError("정사영상 PNG 인코드 실패")
    buffer.tofile(str(out_png))
    out_json.write_text(json.dumps(bounds, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_png, bounds
```

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_ortho.py" -v`
Expected: PASS (6 passed)

- [ ] **Step 8: 대응점 지정 페이지 작성**

`GUMAP-개발/floorplan/georef-picker.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>테크노관 좌표 대응점 지정</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#0a0f28; color:#e2e8f0; font-family:system-ui,sans-serif;
         height:100vh; display:flex; flex-direction:column; overflow:hidden; }
  #top { padding:8px 12px; background:rgba(10,15,40,.95); display:flex; gap:10px; align-items:center;
         border-bottom:1px solid rgba(129,140,248,.3); }
  button { background:#1e293b; color:#e2e8f0; border:1px solid #475569; border-radius:6px;
           padding:6px 12px; font-size:12px; cursor:pointer; }
  button.primary { background:linear-gradient(135deg,#6366f1,#4f46e5); border:none; font-weight:700; }
  #stat { margin-left:auto; font-size:12px; color:#94a3b8; }
  #panes { flex:1; display:flex; min-height:0; }
  .pane { flex:1; position:relative; }
  .pane + .pane { border-left:2px solid #6366f1; }
  .tag { position:absolute; top:8px; left:8px; z-index:500; background:rgba(10,15,40,.9);
         padding:4px 10px; border-radius:6px; font-size:11px; font-weight:700; }
  .lmap { width:100%; height:100%; background:#111827; }
  #list { height:120px; overflow-y:auto; background:rgba(10,15,40,.95); font-size:12px;
          border-top:1px solid rgba(129,140,248,.3); padding:6px 12px; }
  .cp { padding:2px 0; color:#94a3b8; }
  .cp.done { color:#22c55e; }
</style>
</head>
<body>

<div id="top">
  <select id="floor"></select>
  <button id="mode-cp" class="primary">① 대응점</button>
  <button id="mode-scale">② 층별 축척</button>
  <button id="undo">마지막 취소</button>
  <button id="clear">전체 지우기</button>
  <button id="save" class="primary">저장</button>
  <span id="stat">도면에서 건물 모서리를 클릭하세요</span>
</div>

<div id="panes">
  <div class="pane"><div class="tag">① 도면</div><div id="plan" class="lmap"></div></div>
  <div class="pane"><div class="tag">② 정사영상 — 같은 지점</div><div id="ortho" class="lmap"></div></div>
</div>
<div id="list"></div>

<script>
const FLOORS = ["B1F","1F","2F","3F","4F","5F","6F"];
const TECHNO = [36.146643, 128.394348];

let georef = null;
let floor = '2F';
let mode = 'cp';        // 'cp' = 대응점, 'scale' = 층별 축척
let points = [];        // {px:[x,y], lon:null, lat:null}
let planMarkers = [], orthoMarkers = [];

// 층별 축척: 도면마다 표제란·여백이 달라 잉크 bbox 추정치가 10% 흔들린다.
// 모든 도면이 가로 전체 치수 90,200mm 체인을 갖고 있으므로, 그 양 끝을 찍으면
// 그 층의 원점과 px/mm 가 한 번에 정해진다. 층당 클릭 두 번이면 끝난다.
const CHAIN_MM = 90200;
let scaleCal = {};      // floor -> {left:[x,y], right:[x,y]}
let scaleMarkers = [];

function recordScaleClick(px) {
  const cur = scaleCal[floor] || {};
  if (!cur.left || (cur.left && cur.right)) {
    scaleCal[floor] = { left: px, right: null };
    setStat(`${floor}: 치수선 왼쪽 끝 지정 — 이제 오른쪽 끝(90,200 반대편)을 찍으세요`);
  } else {
    cur.right = px;
    scaleCal[floor] = cur;
    const dx = Math.hypot(cur.right[0] - cur.left[0], cur.right[1] - cur.left[1]);
    setStat(`${floor}: 축척 확정 ${(dx / CHAIN_MM).toFixed(6)} px/mm (${Math.round(dx)}px = 90,200mm)`);
  }
  drawScaleMarkers();
  renderScaleList();
}

function drawScaleMarkers() {
  scaleMarkers.forEach(m => planMap.removeLayer(m));
  scaleMarkers = [];
  const c = scaleCal[floor];
  if (!c) return;
  for (const [key, color] of [['left', '#22c55e'], ['right', '#ef4444']]) {
    if (!c[key]) continue;
    scaleMarkers.push(L.circleMarker(pxToLL(c[key][0], c[key][1]),
      { radius: 7, color, fillOpacity: 1 }).bindTooltip(key, { permanent: true }).addTo(planMap));
  }
}

function renderScaleList() {
  document.getElementById('list').innerHTML = FLOORS.map(f => {
    const c = scaleCal[f];
    if (c && c.left && c.right) {
      const dx = Math.hypot(c.right[0] - c.left[0], c.right[1] - c.left[1]);
      return `<div class="cp done">${f}: ${(dx / CHAIN_MM).toFixed(6)} px/mm</div>`;
    }
    if (c && c.left) return `<div class="cp">${f}: 왼쪽만 지정됨</div>`;
    return `<div class="cp">${f}: 미지정</div>`;
  }).join('');
  const done = FLOORS.filter(f => scaleCal[f] && scaleCal[f].right).length;
  setStat(`층별 축척 ${done}/${FLOORS.length} 지정됨`);
}

// ① 도면: 픽셀 좌표계
const planMap = L.map('plan', { crs: L.CRS.Simple, minZoom:-5, maxZoom:4 });
let planImage = null;
const pxToLL = (x,y) => planMap.unproject([x,y], 0);
const llToPx = ll => { const p = planMap.project(ll, 0); return [Math.round(p.x), Math.round(p.y)]; };

// ② 정사영상: fp/ortho.py 가 이어붙인 이미지를 정확한 경계에 깐다.
//    프론트의 4326 TMS 근사 타일 레이어를 쓰면 타일 한 칸만큼 어긋날 수 있어
//    대응점이 오염된다. 그래서 여기서는 쓰지 않는다.
const orthoMap = L.map('ortho').setView(TECHNO, 18);

async function loadOrtho() {
  const res = await fetch('/work/ortho_z16.json?t=' + Date.now());
  if (!res.ok) { setStat('work/ortho_z16.json 없음 — 03_georef.py init 를 먼저 실행하세요'); return; }
  const b = await res.json();
  L.imageOverlay('/work/ortho_z16.png', [[b.south, b.west], [b.north, b.east]]).addTo(orthoMap);
  orthoMap.setView(TECHNO, 19);
}
loadOrtho();

async function loadFloor(f) {
  floor = f;
  const res = await fetch(`/work/${f}_labeled.json?t=${Date.now()}`);
  if (!res.ok) { setStat(`work/${f}_labeled.json 없음`); return; }
  const data = await res.json();
  const [w, h] = data.size;
  if (planImage) planMap.removeLayer(planImage);
  const bounds = [pxToLL(0,0), pxToLL(w,h)];
  planImage = L.imageOverlay(`/work/${f}_raster_400.png`, bounds).addTo(planMap);
  planMap.fitBounds(bounds);
}

planMap.on('click', e => {
  if (mode === 'scale') { recordScaleClick(llToPx(e.latlng)); return; }
  const pending = points.find(p => p.lon === null);
  if (pending) { setStat('먼저 오른쪽 정사영상에서 같은 지점을 찍으세요'); return; }
  const px = llToPx(e.latlng);
  points.push({ floor, px, lon:null, lat:null });
  planMarkers.push(L.circleMarker(e.latlng, { radius:6, color:'#facc15', fillOpacity:1 })
    .bindTooltip(String(points.length), {permanent:true}).addTo(planMap));
  render();
});

orthoMap.on('click', e => {
  const pending = points.find(p => p.lon === null);
  if (!pending) { setStat('먼저 왼쪽 도면에서 점을 찍으세요'); return; }
  pending.lon = +e.latlng.lng.toFixed(7);
  pending.lat = +e.latlng.lat.toFixed(7);
  orthoMarkers.push(L.circleMarker(e.latlng, { radius:6, color:'#22c55e', fillOpacity:1 })
    .bindTooltip(String(points.indexOf(pending)+1), {permanent:true}).addTo(orthoMap));
  render();
});

function render() {
  const done = points.filter(p => p.lon !== null).length;
  document.getElementById('list').innerHTML = points.map((p,i) =>
    `<div class="cp ${p.lon!==null?'done':''}">${i+1}. [${p.floor}] 도면 (${p.px[0]}, ${p.px[1]})` +
    (p.lon !== null ? ` → ${p.lat}, ${p.lon}` : ' → 정사영상에서 클릭 대기') + `</div>`).join('');
  setStat(`완성된 대응점 ${done}쌍 (3쌍 이상 필요)`);
}
function setStat(t) { document.getElementById('stat').textContent = t; }

function undo() {
  if (!points.length) return;
  points.pop();
  const pm = planMarkers.pop(); if (pm) planMap.removeLayer(pm);
  const om = orthoMarkers.pop(); if (om) orthoMap.removeLayer(om);
  render();
}
function clearAll() {
  points = [];
  planMarkers.forEach(m => planMap.removeLayer(m)); planMarkers = [];
  orthoMarkers.forEach(m => orthoMap.removeLayer(m)); orthoMarkers = [];
  render();
}

async function save() {
  const done = points.filter(p => p.lon !== null);
  if (done.length < 3) { setStat('3쌍 이상 필요합니다'); return; }
  const g = await (await fetch('/techno_georef.json?t=' + Date.now())).json();
  g.control_points = done;
  // 층별 축척을 사람이 찍었으면 자동 추정치를 덮어쓴다
  g.floor_origin_px = g.floor_origin_px || {};
  g.floor_px_per_mm = g.floor_px_per_mm || {};
  for (const f of FLOORS) {
    const c = scaleCal[f];
    if (!c || !c.left || !c.right) continue;
    const dx = Math.hypot(c.right[0] - c.left[0], c.right[1] - c.left[1]);
    g.floor_px_per_mm[f] = dx / CHAIN_MM;
    g.floor_origin_px[f] = c.left;
  }
  const res = await fetch('/save/georef', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(g)
  });
  setStat(res.ok ? `저장 완료 (${done.length}쌍). 이제 03_georef.py solve 를 실행하세요` : '저장 실패');
}

const sel = document.getElementById('floor');
FLOORS.forEach(f => { const o=document.createElement('option'); o.value=f; o.textContent=f; sel.appendChild(o); });
sel.value = '2F';
sel.onchange = () => { loadFloor(sel.value); if (mode === 'scale') { drawScaleMarkers(); renderScaleList(); } };
function setMode(m) {
  mode = m;
  document.getElementById('mode-cp').className = m === 'cp' ? 'primary' : '';
  document.getElementById('mode-scale').className = m === 'scale' ? 'primary' : '';
  if (m === 'scale') {
    drawScaleMarkers(); renderScaleList();
    setStat('도면에서 90,200 치수선의 양 끝을 차례로 찍으세요 (층마다 2번)');
  } else {
    scaleMarkers.forEach(x => planMap.removeLayer(x)); scaleMarkers = [];
    render();
  }
}
document.getElementById('mode-cp').onclick = () => setMode('cp');
document.getElementById('mode-scale').onclick = () => setMode('scale');
document.getElementById('undo').onclick = undo;
document.getElementById('clear').onclick = clearAll;
document.getElementById('save').onclick = save;
loadFloor('2F');
</script>
</body>
</html>
```

- [ ] **Step 9: 【사람 개입】 정사영상 대응점 지정**

**이 단계는 자동화할 수 없다.** 정사영상 위에서 건물 모서리를 사람이 식별해야 한다.

1. 정사영상 타일 서버(8765)를 켠다 — `G-map-시작.bat` 이 함께 띄운다
2. `python serve_editor.py` 로 8790 서버를 켠다
3. `http://localhost:8790/georef-picker.html` 을 연다
4. **왼쪽 도면에서 건물 모서리 클릭 → 오른쪽 정사영상에서 같은 모서리 클릭.** 3쌍 이상 반복한다
   - 건물의 바깥 모서리처럼 도면과 항공사진 양쪽에서 명확히 짚이는 지점을 고른다
   - 서로 멀리 떨어진 점을 고를수록 변환이 안정적이다
5. `저장` 을 누른다 → `techno_georef.json` 의 `control_points` 가 채워진다

직접 JSON 을 채워도 된다:

```json
"control_points": [
  {"floor": "2F", "px": [1234, 2345], "lon": 128.39412, "lat": 36.14705},
  {"floor": "2F", "px": [3456, 1234], "lon": 128.39478, "lat": 36.14688},
  {"floor": "2F", "px": [2345, 3456], "lon": 128.39430, "lat": 36.14640}
]
```

- [ ] **Step 10: 변환 산출**

Run: `python "GUMAP-개발/floorplan/03_georef.py" solve`
Expected: `회전 26.xxx° · 축척 0.99xxx` 형태 출력.

**축척이 `1.0 ± 0.02` 를 벗어나면 오류로 중단된다.** 그 경우 대응점을 잘못 찍은 것이므로
Step 9 로 돌아간다. 이 검증이 좌표 오류를 잡는 1차 방어선이다.

- [ ] **Step 11: 커밋**

```bash
git add "GUMAP-개발/floorplan/03_georef.py" "GUMAP-개발/floorplan/georef-picker.html" "GUMAP-개발/floorplan/fp/georef.py" "GUMAP-개발/floorplan/fp/ortho.py" "GUMAP-개발/floorplan/tests/test_georef.py" "GUMAP-개발/floorplan/tests/test_ortho.py" "GUMAP-개발/floorplan/techno_georef.json"
git commit -m "feat(floorplan): detect drawing frame origin and solve the georeference"
```

---

## Task 11: IMDF 생성과 검증

**Files:**
- Create: `GUMAP-개발/floorplan/fp/imdf.py`
- Create: `GUMAP-개발/floorplan/fp/validate.py`
- Create: `GUMAP-개발/floorplan/04_build_imdf.py`
- Test: `GUMAP-개발/floorplan/tests/test_imdf.py`, `GUMAP-개발/floorplan/tests/test_validate.py`

**Interfaces:**
- Consumes: `fp.georef.Transform`, `fp.excel.Room`, `work/{floor}_labeled.json`
- Produces:
  - `fp.imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform, existing_levels) -> dict`
  - `fp.validate.ValidationIssue` — dataclass: `severity: str`, `code: str`, `message: str`
  - `fp.validate.run_all(bundle, rooms_by_floor) -> list[ValidationIssue]`

- [ ] **Step 1: 실패하는 테스트 작성**

`GUMAP-개발/floorplan/tests/test_imdf.py`:

```python
import pytest

from fp import excel, georef, imdf


@pytest.fixture
def transform():
    return georef.Transform(theta_deg=26.6, scale=1.0, t_lon=128.3940, t_lat=36.1460)


@pytest.fixture
def labeled_by_floor():
    return {
        "2F": [
            {"points_m": [(0.0, 0.0), (7.0, 0.0), (7.0, 7.0), (0.0, 7.0)], "room_id": "201"},
            {"points_m": [(8.0, 0.0), (14.0, 0.0), (14.0, 7.0), (8.0, 7.0)], "room_id": "202"},
            {"points_m": [(20.0, 0.0), (24.0, 0.0), (24.0, 4.0), (20.0, 4.0)], "room_id": None},
        ]
    }


@pytest.fixture
def rooms_by_floor():
    return {
        "2F": [
            excel.Room(room_id="201", floor="2F", name="대강의실", category="classroom",
                       tags=["지방대학특성화사업"]),
            excel.Room(room_id="202", floor="2F", name="탄소재료연구실", category="laboratory"),
            excel.Room(room_id="203", floor="2F", name="나노재료 공정 실험실", category="laboratory"),
        ]
    }


def test_bundle_has_the_imdf_collections(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    for key in ["venue", "building", "levels", "units", "footprint", "occupants"]:
        assert key in bundle


def test_units_are_geojson_feature_collections(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    assert bundle["units"]["type"] == "FeatureCollection"
    assert isinstance(bundle["units"]["features"], list)


def test_only_labeled_polygons_become_units(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    assert len(bundle["units"]["features"]) == 2


def test_unit_keeps_the_schema_the_indoor_module_reads(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    props = bundle["units"]["features"][0]["properties"]
    for key in ["level_id", "category", "label", "name", "department", "research_tags"]:
        assert key in props
    assert "ko-KR" in props["label"]
    assert "ko-KR" in props["name"]


def test_unit_name_comes_from_the_spreadsheet(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    by_label = {f["properties"]["label"]["ko-KR"]: f for f in bundle["units"]["features"]}
    assert by_label["201"]["properties"]["name"]["ko-KR"] == "대강의실"
    assert by_label["201"]["properties"]["category"] == "classroom"


def test_drawing_name_fills_in_when_the_spreadsheet_name_is_blank(transform):
    """엑셀 361개 중 69개는 이름이 비어 있고 도면에만 적혀 있다."""
    labeled = {"2F": [{"points_m": [(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)],
                       "room_id": "228", "drawing_name": "화장실"}]}
    rooms = {"2F": [excel.Room(room_id="228", floor="2F", name="", category="office")]}
    bundle = imdf.build_bundle(labeled, rooms, transform)
    props = bundle["units"]["features"][0]["properties"]
    assert props["name"]["ko-KR"] == "화장실"
    assert props["category"] == "restroom"


def test_spreadsheet_name_wins_over_the_drawing_name(transform):
    labeled = {"2F": [{"points_m": [(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)],
                       "room_id": "202", "drawing_name": "준비실"}]}
    rooms = {"2F": [excel.Room(room_id="202", floor="2F", name="탄소재료연구실",
                               category="laboratory")]}
    bundle = imdf.build_bundle(labeled, rooms, transform)
    props = bundle["units"]["features"][0]["properties"]
    assert props["name"]["ko-KR"] == "탄소재료연구실"
    assert props["category"] == "laboratory"


def test_room_number_is_the_last_resort_name(transform):
    labeled = {"2F": [{"points_m": [(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)],
                       "room_id": "211", "drawing_name": None}]}
    rooms = {"2F": [excel.Room(room_id="211", floor="2F", name="", category="office")]}
    bundle = imdf.build_bundle(labeled, rooms, transform)
    assert bundle["units"]["features"][0]["properties"]["name"]["ko-KR"] == "211"
    assert bundle["occupants"]["features"] == []


def test_unit_geometry_is_a_closed_polygon(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    ring = bundle["units"]["features"][0]["geometry"]["coordinates"][0]
    assert ring[0] == ring[-1], "폴리곤 링이 닫혀 있어야 한다"


def test_ring_vertex_count_follows_the_input_shape(rooms_by_floor, transform):
    """도형을 사각형으로 뭉개지 않는다. 입력 꼭짓점 수가 그대로 나와야 한다."""
    l_shape = [(0.0, 0.0), (10.0, 0.0), (10.0, 4.0), (4.0, 4.0), (4.0, 9.0), (0.0, 9.0)]
    bundle = imdf.build_bundle(
        {"2F": [{"points_m": l_shape, "room_id": "201"}]}, rooms_by_floor, transform
    )
    ring = bundle["units"]["features"][0]["geometry"]["coordinates"][0]
    assert len(ring) == len(l_shape) + 1, "L 자 방이 사각형으로 뭉개졌다"


def test_coordinates_land_near_the_campus(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    lon, lat = bundle["units"]["features"][0]["geometry"]["coordinates"][0][0]
    assert 128.39 < lon < 128.40
    assert 36.14 < lat < 36.15


def test_levels_cover_every_floor_present(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    shorts = {f["properties"]["short_name"]["ko-KR"] for f in bundle["levels"]["features"]}
    assert "2F" in shorts


def test_every_unit_level_id_exists_in_levels(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    level_ids = {f["id"] for f in bundle["levels"]["features"]}
    for feature in bundle["units"]["features"]:
        assert feature["properties"]["level_id"] in level_ids


def test_occupants_reference_existing_units(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    unit_ids = {f["id"] for f in bundle["units"]["features"]}
    for occupant in bundle["occupants"]["features"]:
        for unit_id in occupant["properties"]["unit_ids"]:
            assert unit_id in unit_ids


def test_footprint_is_the_hull_of_the_units(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    assert bundle["footprint"]["features"]
    ring = bundle["footprint"]["features"][0]["geometry"]["coordinates"][0]
    assert len(ring) >= 4
```

`GUMAP-개발/floorplan/tests/test_validate.py`:

```python
import pytest

from fp import excel, georef, imdf, validate


@pytest.fixture
def transform():
    return georef.Transform(theta_deg=0.0, scale=1.0, t_lon=128.3940, t_lat=36.1460)


def make_bundle(polys, rooms, transform):
    return imdf.build_bundle({"2F": polys}, {"2F": rooms}, transform)


def room(room_id, name="강의실", category="classroom"):
    return excel.Room(room_id=room_id, floor="2F", name=name, category=category)


def square_m(x0, y0, size):
    return [(x0, y0), (x0 + size, y0), (x0 + size, y0 + size), (x0, y0 + size)]


def test_clean_data_produces_no_errors(transform):
    polys = [{"points_m": square_m(0, 0, 7), "room_id": "201"}]
    bundle = make_bundle(polys, [room("201")], transform)
    issues = validate.run_all(bundle, {"2F": [room("201")]})
    assert [i for i in issues if i.severity == "error"] == []


def test_flags_a_room_with_no_geometry(transform):
    polys = [{"points_m": square_m(0, 0, 7), "room_id": "201"}]
    rooms = [room("201"), room("202")]
    bundle = make_bundle(polys, rooms, transform)
    issues = validate.run_all(bundle, {"2F": rooms})
    assert any(i.code == "missing_geometry" and "202" in i.message for i in issues)


def test_flags_an_implausibly_small_area(transform):
    polys = [{"points_m": square_m(0, 0, 1), "room_id": "201"}]  # 1㎡
    bundle = make_bundle(polys, [room("201")], transform)
    issues = validate.run_all(bundle, {"2F": [room("201")]})
    assert any(i.code == "area_out_of_range" for i in issues)


def test_flags_an_implausibly_large_area(transform):
    polys = [{"points_m": square_m(0, 0, 30), "room_id": "201"}]  # 900㎡
    bundle = make_bundle(polys, [room("201")], transform)
    issues = validate.run_all(bundle, {"2F": [room("201")]})
    assert any(i.code == "area_out_of_range" for i in issues)


def test_flags_overlapping_polygons(transform):
    polys = [
        {"points_m": square_m(0, 0, 7), "room_id": "201"},
        {"points_m": square_m(1, 1, 7), "room_id": "202"},
    ]
    rooms = [room("201"), room("202")]
    bundle = make_bundle(polys, rooms, transform)
    issues = validate.run_all(bundle, {"2F": rooms})
    assert any(i.code == "overlap" for i in issues)


def test_flags_an_invalid_category(transform):
    polys = [{"points_m": square_m(0, 0, 7), "room_id": "201"}]
    bad = excel.Room(room_id="201", floor="2F", name="x", category="nonsense")
    bundle = make_bundle(polys, [bad], transform)
    issues = validate.run_all(bundle, {"2F": [bad]})
    assert any(i.code == "bad_category" for i in issues)


def test_flags_a_dangling_level_reference(transform):
    polys = [{"points_m": square_m(0, 0, 7), "room_id": "201"}]
    bundle = make_bundle(polys, [room("201")], transform)
    bundle["units"]["features"][0]["properties"]["level_id"] = "does-not-exist"
    issues = validate.run_all(bundle, {"2F": [room("201")]})
    assert any(i.code == "dangling_level" and i.severity == "error" for i in issues)


def test_extent_check_passes_for_points_inside_the_building():
    inside = {"2F": [{"points_m": square_m(10, 10, 7), "room_id": "201"}]}
    assert validate.check_within_extent(inside) == []


def test_extent_check_flags_a_polygon_outside_the_drawing():
    # 도면 실측은 90.2m x 88.7m 다. 300m 는 명백히 밖이다.
    outside = {"2F": [{"points_m": square_m(300, 300, 7), "room_id": "201"}]}
    issues = validate.check_within_extent(outside)
    assert any(i.code == "outside_extent" for i in issues)


def test_extent_check_allows_a_small_margin():
    # 벽 두께 정도의 삐져나감은 허용한다
    edge = {"2F": [{"points_m": [(-1.0, -1.0), (5.0, -1.0), (5.0, 5.0), (-1.0, 5.0)], "room_id": "201"}]}
    assert validate.check_within_extent(edge) == []


def test_flags_stairs_that_do_not_line_up_between_floors(transform):
    stair = excel.Room(room_id="290", floor="2F", name="계단", category="stairs")
    stair3 = excel.Room(room_id="390", floor="3F", name="계단", category="stairs")
    bundle = imdf.build_bundle(
        {
            "2F": [{"points_m": square_m(0, 0, 4), "room_id": "290"}],
            "3F": [{"points_m": square_m(40, 40, 4), "room_id": "390"}],
        },
        {"2F": [stair], "3F": [stair3]},
        transform,
    )
    issues = validate.run_all(bundle, {"2F": [stair], "3F": [stair3]})
    assert any(i.code == "vertical_misalignment" for i in issues)
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_imdf.py" "GUMAP-개발/floorplan/tests/test_validate.py" -v`
Expected: FAIL — `ImportError: cannot import name 'imdf'`

- [ ] **Step 3: imdf 모듈 구현**

`GUMAP-개발/floorplan/fp/imdf.py`:

```python
"""IMDF geojson 번들을 만든다.

map-techno-indoor.js 가 읽는 스키마를 그대로 유지하는 것이 이 모듈의 계약이다.
unit.properties 는 level_id / category / label.ko-KR / name.ko-KR /
department / research_tags 를 반드시 가진다.
"""
import uuid

from . import config
from . import excel as excel_module
from . import georef

VENUE_ID = "749d0866-d61f-4d19-8b95-bb16f405e713"
BUILDING_ID = "5cab240c-dc21-4546-aec7-4d3516404094"

LEVEL_ORDINALS = {"B1F": -1, "1F": 1, "2F": 2, "3F": 3, "4F": 4, "5F": 5, "6F": 6}


def _stable_id(namespace: str, key: str) -> str:
    """같은 입력이면 항상 같은 UUID. 재생성해도 id 가 흔들리지 않게 한다."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"gumap:techno:{namespace}:{key}"))


def _ring(points_m, transform):
    ring = [list(georef.apply(transform, x, y)) for x, y in points_m]
    if ring[0] != ring[-1]:
        ring.append(list(ring[0]))
    return ring


def _feature(feature_id, feature_type, geometry, properties):
    return {
        "id": feature_id,
        "type": "Feature",
        "feature_type": feature_type,
        "geometry": geometry,
        "properties": properties,
    }


def build_bundle(labeled_by_floor, rooms_by_floor, transform, language="ko-KR") -> dict:
    """층별 폴리곤(로컬 미터) + 엑셀 속성 → IMDF 번들.

    labeled_by_floor: {floor: [{"points_m": [(x,y)...], "room_id": str|None,
                                "drawing_name": str|None}]}
    rooms_by_floor:   {floor: [excel.Room]}

    이름은 엑셀이 우선이다. 엑셀 이름이 비어 있으면(361개 중 69개, 대부분
    화장실·샤워실·계단) 도면에서 읽은 drawing_name 을 쓰고, category 도
    그 이름으로 다시 판정한다. 둘 다 없으면 방 번호를 이름으로 쓴다.
    """
    levels, units, occupants, footprints = [], [], [], []
    all_rings = []

    for floor in config.FLOORS:
        polygons = labeled_by_floor.get(floor)
        if not polygons:
            continue

        level_id = _stable_id("level", floor)
        by_room = {r.room_id: r for r in rooms_by_floor.get(floor, [])}

        floor_rings = []
        for item in polygons:
            room_id = item.get("room_id")
            if not room_id:
                continue  # 번호를 못 붙인 폴리곤은 유닛으로 만들지 않는다
            room = by_room.get(room_id)
            ring = _ring(item["points_m"], transform)
            floor_rings.append(ring)
            all_rings.append(ring)

            # 이름: 엑셀 우선 → 도면 OCR → 방 번호
            excel_name = room.name if room and room.name else ""
            drawing_name = item.get("drawing_name") or ""
            display_name = excel_name or drawing_name or room_id
            if excel_name:
                category = room.category
            elif drawing_name:
                category = excel_module.guess_category(drawing_name)
            else:
                category = room.category if room else "office"

            unit_id = _stable_id("unit", f"{floor}:{room_id}")
            units.append(
                _feature(
                    unit_id,
                    "unit",
                    {"type": "Polygon", "coordinates": [ring]},
                    {
                        "level_id": level_id,
                        "category": category,
                        "label": {language: room_id},
                        "name": {language: display_name},
                        "department": (room.dept if room and room.dept else None),
                        "research_tags": list(room.tags) if room else [],
                    },
                )
            )
            if excel_name or drawing_name:
                occupants.append(
                    _feature(
                        _stable_id("occupant", f"{floor}:{room_id}"),
                        "occupant",
                        None,
                        {
                            "name": {language: display_name},
                            "unit_ids": [unit_id],
                            "research_tags": list(room.tags) if room else [],
                        },
                    )
                )

        level_ring = _bounds_ring(floor_rings)
        levels.append(
            _feature(
                level_id,
                "level",
                {"type": "Polygon", "coordinates": [level_ring]},
                {
                    "ordinal": LEVEL_ORDINALS[floor],
                    "short_name": {language: floor},
                    "name": {language: f"{floor[:-1]}층"},  # "2F" -> "2층", "B1F" -> "B1층"
                    "category": "basement" if floor == "B1F" else "above_ground",
                    "building_ids": [BUILDING_ID],
                },
            )
        )
        footprints.append(
            _feature(
                _stable_id("footprint", floor),
                "footprint",
                {"type": "Polygon", "coordinates": [level_ring]},
                {"category": "perimeter", "building_ids": [BUILDING_ID], "level_ids": [level_id]},
            )
        )

    building_ring = _bounds_ring(all_rings)
    building = _feature(
        BUILDING_ID,
        "building",
        {"type": "Polygon", "coordinates": [building_ring]},
        {"category": "education", "name": {language: "테크노관 (61번 건물)"}, "venue_id": VENUE_ID},
    )
    venue = _feature(
        VENUE_ID,
        "venue",
        {"type": "Polygon", "coordinates": [building_ring]},
        {"category": "university", "name": {language: "금오공과대학교"}},
    )

    return {
        "venue": {"type": "FeatureCollection", "features": [venue]},
        "building": {"type": "FeatureCollection", "features": [building]},
        "levels": {"type": "FeatureCollection", "features": levels},
        "units": {"type": "FeatureCollection", "features": units},
        "footprint": {"type": "FeatureCollection", "features": footprints},
        "occupants": {"type": "FeatureCollection", "features": occupants},
        "openings": {"type": "FeatureCollection", "features": []},
        "anchors": {"type": "FeatureCollection", "features": []},
    }


def _bounds_ring(rings):
    """여러 링을 감싸는 경계 사각형. 링이 없으면 빈 사각형."""
    if not rings:
        return [[0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0]]
    xs = [p[0] for ring in rings for p in ring]
    ys = [p[1] for ring in rings for p in ring]
    return [
        [min(xs), min(ys)], [max(xs), min(ys)],
        [max(xs), max(ys)], [min(xs), max(ys)], [min(xs), min(ys)],
    ]
```

- [ ] **Step 4: validate 모듈 구현**

`GUMAP-개발/floorplan/fp/validate.py`:

```python
"""IMDF 번들 검증. 조용히 틀린 결과를 내보내지 않는 것이 목적이다."""
import math
from dataclasses import dataclass

from shapely.geometry import Polygon

from . import config

MIN_AREA_M2 = 5.0
MAX_AREA_M2 = 200.0
OVERLAP_RATIO = 0.10
VERTICAL_TOLERANCE_M = 2.0
VERTICAL_CATEGORIES = {"stairs", "elevator"}
# 도면 실측 범위 밖으로 나간 폴리곤을 잡는다. 벽 두께와 반올림을 감안해 여유를 둔다.
EXTENT_MARGIN_M = 5.0


@dataclass
class ValidationIssue:
    severity: str  # "error" | "warning"
    code: str
    message: str


def _to_metric_polygon(ring) -> Polygon:
    """경위도 링을 미터 근사 평면으로 옮겨 면적·교차를 계산한다."""
    mpd_lon = config.METERS_PER_DEG_LON_AT_EQUATOR * math.cos(
        math.radians(config.REFERENCE_LATITUDE)
    )
    return Polygon(
        [(lon * mpd_lon, lat * config.METERS_PER_DEG_LAT) for lon, lat in ring]
    )


def check_within_extent(labeled_by_floor: dict) -> list[ValidationIssue]:
    """폴리곤이 도면 실측 범위 안에 있는지 (로컬 미터 좌표에서 검사).

    footprint 는 유닛들의 경계로 계산되므로 유닛이 footprint 밖으로 나갈 수 없다.
    그래서 외곽 이탈은 지리 좌표가 아니라 도면 로컬 좌표에서 봐야 의미가 있다.
    좌표 변환이 통째로 틀렸을 때가 아니라, 폴리곤 추출이 도면틀 바깥의
    치수선이나 표제란을 방으로 오인했을 때 걸린다.
    """
    width_m = config.DRAWING_EXTENT_MM[0] / 1000.0
    height_m = config.DRAWING_EXTENT_MM[1] / 1000.0
    issues: list[ValidationIssue] = []
    for floor, records in (labeled_by_floor or {}).items():
        for record in records:
            for x, y in record["points_m"]:
                # 기준점이 도면 좌하단이므로 로컬 좌표는 x:[0,width], y:[0,height] 이고
                # y 는 위로 갈수록 커진다 (pixels_to_meters 가 부호를 뒤집는다).
                if (
                    x < -EXTENT_MARGIN_M
                    or x > width_m + EXTENT_MARGIN_M
                    or y < -EXTENT_MARGIN_M
                    or y > height_m + EXTENT_MARGIN_M
                ):
                    issues.append(
                        ValidationIssue(
                            "warning", "outside_extent",
                            f"{floor} {record.get('room_id') or '무번호'}: 꼭짓점 "
                            f"({x:.1f}, {y:.1f})m 가 도면 범위 "
                            f"({width_m}x{height_m}m) 밖이다",
                        )
                    )
                    break
    return issues


def run_all(bundle: dict, rooms_by_floor: dict) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    levels = {f["id"]: f for f in bundle["levels"]["features"]}
    level_short = {
        f["id"]: f["properties"]["short_name"]["ko-KR"] for f in bundle["levels"]["features"]
    }
    units = bundle["units"]["features"]

    # 1. level 참조 무결성
    for unit in units:
        if unit["properties"]["level_id"] not in levels:
            issues.append(
                ValidationIssue("error", "dangling_level",
                                f"unit {unit['id']} 의 level_id 가 levels 에 없다")
            )

    # 2. category 유효성
    for unit in units:
        category = unit["properties"]["category"]
        if category not in config.CATEGORIES:
            issues.append(
                ValidationIssue("error", "bad_category",
                                f"{unit['properties']['label']['ko-KR']}: 알 수 없는 category '{category}'")
            )

    # 3. occupant 참조 무결성
    unit_ids = {u["id"] for u in units}
    for occupant in bundle["occupants"]["features"]:
        for unit_id in occupant["properties"]["unit_ids"]:
            if unit_id not in unit_ids:
                issues.append(
                    ValidationIssue("error", "dangling_unit",
                                    f"occupant {occupant['id']} 가 없는 unit 을 가리킨다")
                )

    # 4. 면적 sanity
    by_level: dict[str, list] = {}
    for unit in units:
        polygon = _to_metric_polygon(unit["geometry"]["coordinates"][0])
        area = polygon.area
        label = unit["properties"]["label"]["ko-KR"]
        if not (MIN_AREA_M2 <= area <= MAX_AREA_M2):
            issues.append(
                ValidationIssue("warning", "area_out_of_range",
                                f"{label}: 면적 {area:.1f}㎡ 가 {MIN_AREA_M2}~{MAX_AREA_M2}㎡ 범위 밖")
            )
        by_level.setdefault(unit["properties"]["level_id"], []).append((label, polygon, unit))

    # 5. 같은 층 폴리곤 겹침
    for level_id, entries in by_level.items():
        for i in range(len(entries)):
            for j in range(i + 1, len(entries)):
                label_a, poly_a, _ = entries[i]
                label_b, poly_b, _ = entries[j]
                if not poly_a.is_valid or not poly_b.is_valid:
                    continue
                intersection = poly_a.intersection(poly_b).area
                smaller = min(poly_a.area, poly_b.area)
                if smaller > 0 and intersection / smaller > OVERLAP_RATIO:
                    issues.append(
                        ValidationIssue(
                            "warning", "overlap",
                            f"{level_short.get(level_id,'?')} {label_a} 와 {label_b} 가 "
                            f"{intersection / smaller:.0%} 겹친다",
                        )
                    )

    # 6. 엑셀 방 중 도형 없는 것
    placed = {
        (level_short.get(u["properties"]["level_id"]), u["properties"]["label"]["ko-KR"])
        for u in units
    }
    for floor, rooms in rooms_by_floor.items():
        for room in rooms:
            if (floor, room.room_id) not in placed:
                issues.append(
                    ValidationIssue("warning", "missing_geometry",
                                    f"{floor} {room.room_id} ({room.name or '이름없음'}) 에 도형이 없다")
                )

    # 7. 층간 정합 — 계단·엘리베이터가 층마다 같은 자리에 있는지
    verticals: dict[str, list] = {}
    for unit in units:
        if unit["properties"]["category"] in VERTICAL_CATEGORIES:
            polygon = _to_metric_polygon(unit["geometry"]["coordinates"][0])
            verticals.setdefault(level_short.get(unit["properties"]["level_id"], "?"), []).append(
                (unit["properties"]["label"]["ko-KR"], polygon.centroid)
            )
    floors_with_verticals = [f for f in config.FLOORS if f in verticals]
    for a, b in zip(floors_with_verticals, floors_with_verticals[1:]):
        for label, centroid in verticals[a]:
            nearest = min(
                (centroid.distance(other) for _, other in verticals[b]), default=None
            )
            if nearest is not None and nearest > VERTICAL_TOLERANCE_M:
                issues.append(
                    ValidationIssue(
                        "warning", "vertical_misalignment",
                        f"{a} {label} 에서 가장 가까운 {b} 수직동선까지 {nearest:.1f}m "
                        f"(허용 {VERTICAL_TOLERANCE_M}m). 좌표 변환을 의심하라.",
                    )
                )
    return issues
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `python -m pytest "GUMAP-개발/floorplan/tests/test_imdf.py" "GUMAP-개발/floorplan/tests/test_validate.py" -v`
Expected: PASS (21 passed)

- [ ] **Step 6: 04_build_imdf.py 작성**

`GUMAP-개발/floorplan/04_build_imdf.py`:

```python
"""보정된 폴리곤 + 엑셀 + 좌표변환 → IMDF geojson 과 프론트 번들.

  python 04_build_imdf.py            # 검증만 하고 결과 출력
  python 04_build_imdf.py --write    # 실제로 파일을 교체
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8")

from fp import config, excel, georef, imdf, validate  # noqa: E402

BUNDLE_KEY_TO_FILE = {
    "venue": "venue.geojson",
    "building": "building.geojson",
    "levels": "level.geojson",
    "units": "unit.geojson",
    "footprint": "footprint.geojson",
    "occupants": "occupant.geojson",
    "openings": "opening.geojson",
    "anchors": "anchor.geojson",
}

FRONTEND_BUNDLES = [
    config.PROJECT_ROOT / "GUMAP-프론트" / "js" / "map" / "map-techno-imdf-data.js",
    config.PROJECT_ROOT / "GUMAP-일반지도" / "map" / "map-techno-imdf-data.js",
]


def load_labeled_in_meters(data: dict, transform_data: dict) -> list[dict]:
    floor = data["floor"]
    origin = tuple(transform_data["floor_origin_px"][floor])
    px_per_mm = transform_data["floor_px_per_mm"][floor]
    result = []
    for record in data["polygons"]:
        points = [(float(x), float(y)) for x, y in record["points"]]
        result.append(
            {
                "points_m": georef.pixels_to_meters(points, origin, px_per_mm),
                "room_id": record.get("room_id"),
                "drawing_name": record.get("drawing_name"),
            }
        )
    return result


def main() -> int:
    write = "--write" in sys.argv

    transform_data = georef.load()
    transform = georef.transform_from(transform_data)  # 미확정이면 여기서 중단된다
    print(f"변환: 회전 {transform.theta_deg:.3f}° · 축척 {transform.scale:.5f}")

    rooms_by_floor = excel.load_rooms()
    labeled_by_floor = {}
    for floor in config.FLOORS:
        path = config.WORK_DIR / f"{floor}_labeled.json"
        if not path.exists():
            print(f"건너뜀: {floor} ({path.name} 없음)")
            continue
        labeled_by_floor[floor] = load_labeled_in_meters(
            json.loads(path.read_text(encoding="utf-8")), transform_data
        )

    if not labeled_by_floor:
        print("처리할 층이 없다. 01_extract.py 와 02_label.py 를 먼저 실행하라.")
        return 1

    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    units = len(bundle["units"]["features"])
    expected = sum(len(v) for v in rooms_by_floor.values())
    print(f"유닛 {units}개 / 엑셀 방 {expected}개")

    issues = validate.check_within_extent(labeled_by_floor)
    issues += validate.run_all(bundle, rooms_by_floor)
    errors = [i for i in issues if i.severity == "error"]
    warnings = [i for i in issues if i.severity == "warning"]

    print(f"\n오류 {len(errors)}건 · 경고 {len(warnings)}건")
    for issue in errors:
        print(f"  [오류] {issue.code}: {issue.message}")
    shown = {}
    for issue in warnings:
        shown.setdefault(issue.code, []).append(issue.message)
    for code, messages in shown.items():
        print(f"  [경고] {code}: {len(messages)}건")
        for message in messages[:5]:
            print(f"         {message}")
        if len(messages) > 5:
            print(f"         … 외 {len(messages) - 5}건")

    (config.WORK_DIR / "validation.json").write_text(
        json.dumps(
            [{"severity": i.severity, "code": i.code, "message": i.message} for i in issues],
            ensure_ascii=False, indent=2,
        ),
        encoding="utf-8",
    )

    if errors:
        print("\n오류가 있어 파일을 쓰지 않는다.")
        return 1
    if not write:
        print("\n검증만 수행했다. 실제로 교체하려면 --write 를 붙여라.")
        return 0

    config.IMDF_DIR.mkdir(parents=True, exist_ok=True)
    for key, filename in BUNDLE_KEY_TO_FILE.items():
        (config.IMDF_DIR / filename).write_text(
            json.dumps(bundle[key], ensure_ascii=False, indent=2), encoding="utf-8"
        )
    print(f"\nIMDF 교체: {config.IMDF_DIR}")

    payload = "window.IMDF_TECHNO_DATA = " + json.dumps(bundle, ensure_ascii=False) + ";\n"
    for target in FRONTEND_BUNDLES:
        if target.parent.exists():
            target.write_text(payload, encoding="utf-8")
            print(f"프론트 번들 갱신: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 7: 검증 모드로 실행**

Run: `python "GUMAP-개발/floorplan/04_build_imdf.py"`
Expected: 좌표 변환이 확정되어 있으면 유닛 수와 검증 결과 출력.
확정 전이면 `좌표 변환이 아직 확정되지 않았다` 로 중단 — 이것이 정상 동작이다.

**`vertical_misalignment` 경고가 많이 나오면 좌표 변환이 틀린 것이다.** Task 10 Step 7 로 돌아간다.

- [ ] **Step 8: 커밋**

```bash
git add "GUMAP-개발/floorplan/fp/imdf.py" "GUMAP-개발/floorplan/fp/validate.py" "GUMAP-개발/floorplan/04_build_imdf.py" "GUMAP-개발/floorplan/tests/test_imdf.py" "GUMAP-개발/floorplan/tests/test_validate.py"
git commit -m "feat(floorplan): build and validate the IMDF bundle from corrected polygons"
```

---

## Task 12: 실제 교체와 통합 확인

**Files:**
- Modify: `GUMAP-학교지도/data/imdf/techno/*.geojson`
- Modify: `GUMAP-프론트/js/map/map-techno-imdf-data.js`
- Modify: `GUMAP-일반지도/map/map-techno-imdf-data.js`
- Create: `GUMAP-개발/floorplan/README.md`

**전제:** Task 10 의 좌표 확정과 Task 9 보정 화면에서의 층별 보정이 끝나 있어야 한다.

- [ ] **Step 1: 교체 전 백업**

```bash
cd "GUMAP-학교지도/data/imdf"
cp -r techno techno_backup_before_real_geometry
ls techno_backup_before_real_geometry
```

Expected: 기존 geojson 9개가 백업된다.

- [ ] **Step 2: 실제 교체 실행**

Run: `python "GUMAP-개발/floorplan/04_build_imdf.py" --write`
Expected: `IMDF 교체:` 와 `프론트 번들 갱신:` 2줄 출력.

- [ ] **Step 3: 도형이 진짜로 바뀌었는지 확인**

```bash
python -X utf8 -c "
import json, collections, sys
sys.stdout.reconfigure(encoding='utf-8')
u = json.load(open('GUMAP-학교지도/data/imdf/techno/unit.geojson', encoding='utf-8'))
counts = collections.Counter(len(f['geometry']['coordinates'][0]) for f in u['features'])
print('유닛 수:', len(u['features']))
print('꼭짓점 수 분포:', dict(sorted(counts.items())))
assert len(counts) > 1, '모든 폴리곤이 같은 꼭짓점 수다 - 가짜 데이터가 그대로다'
print('OK: 실제 도면 형상이 반영되었다')
"
```

Expected: 꼭짓점 수가 5 하나가 아니라 여러 값으로 분포하고 `OK` 출력.
**5 하나만 나오면 교체가 안 된 것이다.**

- [ ] **Step 4: 두 프론트 사본이 같은지 확인**

```bash
python -c "
from pathlib import Path
a = Path('GUMAP-프론트/js/map/map-techno-imdf-data.js').read_bytes()
b = Path('GUMAP-일반지도/map/map-techno-imdf-data.js').read_bytes()
print('동일' if a == b else '불일치!')
print('크기:', len(a), len(b))
"
```

Expected: `동일`

- [ ] **Step 5: map-techno-indoor.js 가 수정되지 않았는지 확인**

```bash
git status --short "GUMAP-프론트/js/map/map-techno-indoor.js"
```

Expected: **출력 없음.** 이 파일이 변경 목록에 뜨면 설계 위반이다.

- [ ] **Step 6: 실제 지도에서 눈으로 확인**

1. `G-map-시작.bat` 으로 서버를 띄운다
2. 브라우저에서 지도를 열고 테크노관으로 이동한다
3. 줌 17 이상으로 확대한다

확인 항목:
- 층 선택 패널(B1F~6F)이 뜬다
- 각 층을 눌렀을 때 방 모양이 **도면과 같은 형태**로 보인다 (사각형 격자가 아니다)
- 방을 클릭하면 팝업에 엑셀의 방 이름이 뜬다
- 방 검색이 동작한다
- 정사영상 레이어를 켰을 때 건물 외벽과 실내 폴리곤이 맞아떨어진다

- [ ] **Step 7: README 작성**

`GUMAP-개발/floorplan/README.md`:

```markdown
# 테크노관 도면 → IMDF 변환 도구

설계 문서: `docs/superpowers/specs/2026-08-23-techno-indoor-floorplan-design.md`

## 실행 순서

```bash
pip install -r requirements.txt

python 01_extract.py            # 도면 → 방 폴리곤 (도면 픽셀 좌표)
python 02_label.py              # OCR 로 방번호 매칭, QC 이미지 생성
python 03_georef.py init        # 도면틀 기준점 자동 검출

# 여기서 사람이 개입한다 (자동화 불가)
python serve_editor.py
#   http://localhost:8790/georef-picker.html      좌표 대응점 3쌍 이상
#   http://localhost:8790/floorplan-editor.html   방 폴리곤 보정
python 03_georef.py solve       # 변환 산출 (축척 1.0±0.02 검증)

python 04_build_imdf.py         # 검증만
python 04_build_imdf.py --write # 실제 교체
```

## 원칙

- `map-techno-indoor.js` 는 수정하지 않는다. IMDF 스키마만 맞추면 그대로 동작한다.
- 방 이름·학과·사업태그는 엑셀이 원본이다. 도면에서는 방 번호만 읽는다.
- 좌표 변환은 전 층 공유 1개다. 축척이 `1.0 ± 0.02` 를 벗어나면 대응점이 틀린 것이다.
- `vertical_misalignment` 경고가 쏟아지면 좌표 변환을 의심하라.

## 산출물

- `work/{floor}_polygons.json` — 도면 픽셀 좌표 폴리곤
- `work/{floor}_labeled.json` — 방번호가 붙은 폴리곤 (보정 화면이 읽고 쓴다)
- `work/{floor}_qc.png` — 도면 위 추출 결과 겹침 (눈으로 검수)
- `work/report.json` — 층별 미매칭 통계
- `work/validation.json` — 검증 결과 전체
- `techno_georef.json` — 좌표 변환 파라미터

## 되돌리기

```bash
rm -rf "../../GUMAP-학교지도/data/imdf/techno"
mv "../../GUMAP-학교지도/data/imdf/techno_backup_before_real_geometry" "../../GUMAP-학교지도/data/imdf/techno"
```
```

- [ ] **Step 8: 전체 테스트 실행**

Run: `python -m pytest "GUMAP-개발/floorplan/tests" -v`
Expected: 전부 PASS

- [ ] **Step 9: 커밋**

```bash
git add "GUMAP-학교지도/data/imdf/techno" "GUMAP-프론트/js/map/map-techno-imdf-data.js" "GUMAP-일반지도/map/map-techno-imdf-data.js" "GUMAP-개발/floorplan/README.md"
git commit -m "feat(floorplan): replace synthetic room geometry with traced floor plans"
```

---

## 완료 기준 확인

Task 12 를 마친 뒤 다음을 모두 만족해야 한다.

- [ ] `unit.geojson` 의 꼭짓점 수 분포가 5 하나가 아니다 (Task 12 Step 3)
- [ ] `footprint` / `level` 도형이 실제 건물 범위를 덮는다
- [ ] `git status` 에 `map-techno-indoor.js` 가 없다 (Task 12 Step 5)
- [ ] `work/validation.json` 에 `severity: "error"` 가 없다
- [ ] `vertical_misalignment` 경고가 없거나, 있다면 사유가 기록되어 있다
- [ ] 지도에서 층 전환·검색·팝업·길찾기가 동작한다 (Task 12 Step 6)
- [ ] `python -m pytest "GUMAP-개발/floorplan/tests"` 전부 통과
- [ ] 도면에 없어 제외한 방 목록이 `work/validation.json` 의 `missing_geometry` 로 남아 있다
