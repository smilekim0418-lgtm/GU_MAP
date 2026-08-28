"""건물 출입구의 판정과 이름.

길찾기 번들(05_build_nav.py)과 실내지도 번들(04_build_imdf.py)이 같은 문을
각각 이름 붙이면 지도에는 "서쪽 출입구", 안내문에는 "남쪽 출입구" 가 뜬다.
같은 문에 두 이름이 붙는 건 그냥 버그다. 그래서 여기 한 군데서만 정한다.

규칙: 문 박스의 connects 에 "외부" 가 있으면 건물 출입구다.
      room_id 를 적으면 그게 이름이고, 비우면 방위로 자동 명명한다.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from . import config

COMPASS = ("북", "북동", "동", "남동", "남", "남서", "서", "북서")

OUTSIDE_LABELS = frozenset({"외부", "밖", "EXT", "EXTERIOR", "OUTSIDE", "외부출입구"})


def is_outside_label(value) -> bool:
    """'외부' 표기인가. 대소문자와 앞뒤 공백은 무시한다."""
    if value is None:
        return False
    text = str(value).strip()
    return text in OUTSIDE_LABELS or text.upper() in OUTSIDE_LABELS


def bearing_of(lat: float, lon: float, center: tuple[float, float]) -> float:
    """건물 중심에서 본 방위각(도). 북이 0, 시계방향."""
    center_lat, center_lon = center
    north = (lat - center_lat) * config.METERS_PER_DEG_LAT
    east = ((lon - center_lon) * config.METERS_PER_DEG_LON_AT_EQUATOR
            * math.cos(math.radians(center_lat)))
    return (math.degrees(math.atan2(east, north)) + 360.0) % 360.0


def name_entrances(entrances: list[dict], center: tuple[float, float]) -> None:
    """이름 없는 출입구에 방위로 이름을 붙인다. 제자리에서 고친다.

    entrances 의 각 항목은 name / floor / lat / lon 을 갖는다. name 이 이미
    차 있으면(도면에 room_id 를 적었으면) 건드리지 않는다.

    "출입구 7" 은 밖에 서 있는 사람에게 아무 정보도 주지 않는다. 최소한
    건물 어느 쪽인지는 알려줘야 한다.
    """
    sectors: dict[str, list[dict]] = {}
    for entrance in entrances:
        if entrance.get("name"):
            continue
        bearing = bearing_of(entrance["lat"], entrance["lon"], center)
        index = int(((bearing + 22.5) % 360.0) // 45)
        entrance["_offset"] = ((bearing - index * 45.0 + 180.0) % 360.0) - 180.0
        sectors.setdefault(f"{COMPASS[index]}|{entrance['floor']}", []).append(entrance)

    for key, group in sectors.items():
        sector, floor = key.split("|")
        # 같은 방위·같은 층에 여럿이면 번호로 가른다. 구역 한가운데를 기준으로
        # 시계방향. 북쪽 구역에서 355° 와 5° 가 뒤집히지 않게 각도차로 센다.
        group.sort(key=lambda entrance: entrance["_offset"])
        for position, entrance in enumerate(group, start=1):
            suffix = f" {position}" if len(group) > 1 else ""
            entrance["name"] = f"{sector}쪽 출입구{suffix} ({floor})"

    for entrance in entrances:
        entrance.pop("_offset", None)


def center_of(points: list[tuple[float, float]]) -> tuple[float, float]:
    """(lat, lon) 목록의 외접 상자 중심.

    평균이 아니라 외접 상자다. 평균을 쓰면 점이 한쪽에 몰렸을 때 기준점이
    그쪽으로 끌려가서, 나란히 붙은 두 문이 "북쪽" 과 "남쪽" 으로 갈린다.
    """
    if not points:
        return (config.REFERENCE_LATITUDE, 0.0)
    lats = [lat for lat, _ in points]
    lons = [lon for _, lon in points]
    return ((min(lats) + max(lats)) / 2.0, (min(lons) + max(lons)) / 2.0)


def center_from_labeled(work_dir, floors, to_lonlat) -> tuple[float, float]:
    """도면 폴리곤 꼭짓점 전체의 외접 상자 중심 (lat, lon).

    길찾기 번들과 실내지도 번들이 기준점을 각자 계산하면, 구역 경계에 가까운
    문 하나가 한쪽에서는 "북쪽", 다른 쪽에서는 "북동쪽" 이 된다. 같은 문에
    두 이름이 붙는 걸 막으려고 둘 다 도면 원본에서 같은 방식으로 센다.

    to_lonlat(floor, x_px, y_px) -> (lon, lat) | None
    """
    points = []
    for floor in floors:
        path = Path(work_dir) / f"{floor}_labeled.json"
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for record in data.get("polygons", []):
            rings = record.get("points") or []
            loops = rings if (rings and isinstance(rings[0][0], list)) else [rings]
            for loop in loops:
                for x, y in loop:
                    placed = to_lonlat(floor, float(x), float(y))
                    if placed is not None:
                        points.append((placed[1], placed[0]))
    return center_of(points)
