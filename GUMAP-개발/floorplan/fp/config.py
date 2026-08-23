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
