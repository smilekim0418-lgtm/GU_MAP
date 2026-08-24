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
# 주의: 엑셀 이름은 361개 중 292개만 채워져 있다. 화장실·샤워실·계단 같은
# 서비스 공간은 엑셀에서 전부 이름이 비어 있고 도면에만 적혀 있다. 그래서
# restroom/utility/breakroom 규칙은 엑셀만 보면 거의 걸리지 않고, 주로
# 이후 태스크에서 도면 OCR 로 얻은 이름에 대해 동작한다.
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
