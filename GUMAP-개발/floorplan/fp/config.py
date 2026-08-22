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
SOURCES = {
    "B1F": ("테크노관B1F~2F.pdf", 0),
    "1F": ("테크노관B1F~2F.pdf", 1),
    "2F": ("테크노관2층.pdf", 0),
    "3F": ("테크노관3층.pdf", 0),
    "4F": ("테크노관4,5층.pdf", 0),
    "5F": ("테크노관5.6층.pdf", 0),
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
