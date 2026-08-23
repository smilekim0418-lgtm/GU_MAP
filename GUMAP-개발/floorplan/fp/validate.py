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

    # 7. 같은 층에서 방번호 중복 — unit id 가 room_id 만으로 정해지므로
    #    두 폴리곤이 같은 방번호를 가지면 뒤에 만든 unit 이 앞의 것과 id 가
    #    겹친다. map-techno-indoor.js 는 unitMap[u.id] = u; 로 마지막 값만
    #    남기므로, 겹치는 폴리곤이 지오메트리로 겹치지 않아도(overlap 검사가
    #    안 걸려도) 한 방이 지도에서 조용히 사라진다.
    room_counts: dict[tuple[str, str], int] = {}
    for unit in units:
        floor = level_short.get(unit["properties"]["level_id"], "?")
        room_id = unit["properties"]["label"]["ko-KR"]
        room_counts[(floor, room_id)] = room_counts.get((floor, room_id), 0) + 1
    for (floor, room_id), count in sorted(room_counts.items()):
        if count > 1:
            issues.append(
                ValidationIssue(
                    "error", "duplicate_room_id",
                    f"{floor} {room_id}: 같은 방번호를 가진 유닛이 {count}개 있다 "
                    "(id 가 겹쳐 지도에서 하나만 남고 나머지는 조용히 사라진다)",
                )
            )

    # 8. 층간 정합 — 계단·엘리베이터가 층마다 같은 자리에 있는지
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
