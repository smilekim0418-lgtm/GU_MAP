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
