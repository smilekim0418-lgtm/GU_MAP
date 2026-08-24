"""IMDF geojson 번들을 만든다.

map-techno-indoor.js 가 읽는 스키마를 그대로 유지하는 것이 이 모듈의 계약이다.
unit.properties 는 level_id / category / label.ko-KR / name.ko-KR /
department / research_tags 를 반드시 가진다.
"""
import uuid

from shapely.geometry import MultiPoint
from shapely.geometry.polygon import orient

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

    room_id_counter = {}

    for floor in config.FLOORS:
        polygons = labeled_by_floor.get(floor)
        if not polygons:
            continue

        level_id = _stable_id("level", floor)
        by_room = {r.room_id: r for r in rooms_by_floor.get(floor, [])}

        floor_rings = []
        for item in polygons:
            room_id = item.get("room_id")
            ptype = item.get("type", "room")
            if not room_id and ptype != "room":
                room_id = ptype
            if not room_id:
                continue

            room = by_room.get(room_id)
            ring = _ring(item["points_m"], transform)
            floor_rings.append(ring)
            all_rings.append(ring)

            # 이름: 엑셀 우선 → 도면 OCR → 방 번호
            excel_name = room.name if room and room.name else ""
            drawing_name = item.get("drawing_name") or ""
            display_name = excel_name or drawing_name or room_id

            if ptype == "corridor": category = "walkway"
            elif ptype == "door": category = "walkway"
            elif ptype == "stairs": category = "stairs"
            elif ptype == "elevator": category = "elevator"
            else:
                if excel_name:
                    category = room.category
                elif drawing_name:
                    category = excel_module.guess_category(drawing_name)
                else:
                    category = room.category if room else "office"

            # 겹치는 방 번호 처리 (동일 층 내)
            base_key = f"{floor}:{room_id}"
            room_id_counter[base_key] = room_id_counter.get(base_key, 0) + 1
            suffix = f"_{room_id_counter[base_key]}" if room_id_counter[base_key] > 1 else ""
            unique_id_str = f"{base_key}{suffix}"
            
            unit_id = _stable_id("unit", unique_id_str)
            
            props = {
                "level_id": level_id,
                "category": category,
                "label": {language: room_id},
                "name": {language: display_name},
                "department": (room.dept if room and room.dept else None),
                "research_tags": list(room.tags) if room else [],
            }
            if "connects" in item: props["connects"] = item["connects"]
            if "connects_floors" in item: props["connects_floors"] = item["connects_floors"]

            units.append(
                _feature(
                    unit_id,
                    "unit",
                    {"type": "Polygon", "coordinates": [ring]},
                    props,
                )
            )
            if excel_name or drawing_name:
                occupants.append(
                    _feature(
                        _stable_id("occupant", unique_id_str),
                        "occupant",
                        None,
                        {
                            "name": {language: display_name},
                            "unit_ids": [unit_id],
                            "research_tags": list(room.tags) if room else [],
                        },
                    )
                )

        level_ring = _hull_ring(floor_rings)
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

    building_ring = _hull_ring(all_rings)
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


def _hull_ring(rings):
    """여러 링을 감싸는 convex hull.

    _ring() 은 geo transform 을 먼저 적용하므로 이 링들은 이미 lon/lat 이고,
    실제로 풀린 transform 만큼(테크노관은 theta ≈ 12.58°) 회전돼 있다. 그걸
    축 정렬 bbox 로 감싸면 회전각만큼 면적이 부풀어 오르고(직사각형 기준
    wh + (w²+h²)·sin(2θ)/2), map-techno-indoor.js 가 zoom 14~16 에서 그리는
    건물 외곽선이 실제 건물과 눈에 띄게 어긋난다. 대신 union 의 convex hull
    을 링 모양으로 감는다.

    여러 링의 합집합의 convex hull 은 그 링들의 모든 점의 convex hull 과 같다.
    링마다 Polygon 을 만들지 않고 점을 한꺼번에 감싸는 이유는 그래야 축퇴 링이
    섞여도 안 터지기 때문이다 — 점 하나짜리 링은 _ring() 이 [p, p] 두 좌표로
    닫아 넘기는데 Polygon() 은 좌표 4개 미만을 거부한다. 방 하나가 망가졌다고
    번들 생성 전체가 죽으면 안 된다.

    링이 없거나(빈 리스트) 전부 점·선으로 무너지는 축퇴 입력이면 이전과 같은
    축 정렬 bbox 로 대체한다 — 예외를 던지지 않고 계속 쓸 수 있는 결과를 낸다.
    외곽 링은 GeoJSON RFC 7946 대로 반시계 방향으로 맞춘다.
    """
    if not rings:
        return _bounds_ring(rings)
    points = [(p[0], p[1]) for ring in rings for p in ring]
    merged = MultiPoint(points).convex_hull
    if merged.geom_type != "Polygon":
        return _bounds_ring(rings)
    return [list(point) for point in orient(merged, sign=1.0).exterior.coords]


def _bounds_ring(rings):
    """여러 링을 감싸는 축 정렬 경계 사각형.

    _hull_ring 이 축퇴 입력(점·선으로 무너지는 경우)에서 쓰는 대체용이다.
    링이 없으면 빈 사각형.
    """
    if not rings:
        return [[0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0]]
    xs = [p[0] for ring in rings for p in ring]
    ys = [p[1] for ring in rings for p in ring]
    return [
        [min(xs), min(ys)], [max(xs), min(ys)],
        [max(xs), max(ys)], [min(xs), max(ys)], [min(xs), min(ys)],
    ]
