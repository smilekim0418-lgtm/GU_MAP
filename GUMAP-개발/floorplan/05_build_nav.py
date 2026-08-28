"""내비게이션 그래프를 만들어 에디터와 프론트에서 쓸 수 있게 내보낸다.

  python 05_build_nav.py            # 빌드 · 점검만
  python 05_build_nav.py --write    # work/techno_nav.json + 프론트 번들 교체

프론트에 그래프를 통째로 실어 보내는 이유: 노드 1,100개 · 엣지 6,900개면
JSON 300KB 남짓이고, 브라우저 다익스트라가 5ms 안에 끝난다. 길찾기 한 번에
서버를 왕복할 이유가 없다. 이미 IMDF 번들을 같은 방식으로 싣고 있다.

알고리즘 본체(techno-route-core.js)도 여기서 함께 복사한다. 에디터와 본서버가
같은 파일을 쓰게 만들어, 에디터에서 확인한 경로가 곧 서비스 경로가 되게 한다.
"""
import json
import math
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8")

from fp import config, georef, nav, route  # noqa: E402

TOOL_DIR = Path(__file__).resolve().parent
CORE_JS = TOOL_DIR / "techno-route-core.js"
MAP_JS = TOOL_DIR / "map-techno-route.js"
NAV_JSON = config.WORK_DIR / "techno_nav.json"

FRONTEND_DIRS = [
    config.PROJECT_ROOT / "GUMAP-프론트" / "js" / "map",
    config.PROJECT_ROOT / "GUMAP-일반지도" / "map",
]


def _ring(points) -> list[list[float]]:
    return [[round(float(x), 1), round(float(y), 1)] for x, y in points]


def _polygon_rings(polygon) -> list[list[list[float]]]:
    return [_ring(polygon.exterior.coords)] + [
        _ring(interior.coords) for interior in polygon.interiors
    ]


def build_payload(graph: nav.NavGraph, transform_data: dict) -> dict:
    order = {node_id: index for index, node_id in enumerate(graph.nodes)}

    nodes = []
    for node_id, node in graph.nodes.items():
        row = {
            "f": node.floor,
            "k": node.kind,
            "x": round(node.x, 1),
            "y": round(node.y, 1),
        }
        if node.ref:
            row["r"] = node.ref
        if node.connects:
            row["c"] = node.connects
        nodes.append(row)

    seen = set()
    edges = []
    for source, links in graph.adjacency.items():
        for target, meters, mode in links:
            key = (min(order[source], order[target]), max(order[source], order[target]), mode)
            if key in seen:
                continue
            seen.add(key)
            edges.append([key[0], key[1], round(meters, 3), mode])

    floors = {}
    for floor, info in graph.floors.items():
        floors[floor] = {
            "px_per_mm": info.px_per_mm,
            "inset_px": round(info.inset_px, 2),
            "corridor": _polygon_rings(info.corridor),
            "walkable": _polygon_rings(info.walkable),
            "rooms": {
                room_id: {
                    "points": _ring(room["polygon"].exterior.coords),
                    "centroid": [round(room["centroid"][0], 1), round(room["centroid"][1], 1)],
                }
                for room_id, room in info.rooms.items()
            },
        }

    doors_by_room = {
        f"{floor}|{room_id}": [order[door_id] for door_id in door_ids]
        for (floor, room_id), door_ids in graph.doors_by_room.items()
    }
    # 복도 문이 없는 방의 추정 진입점. 브라우저가 기하 폴백을 다시 구현하지
    # 않아도 되도록 인덱스를 그대로 실어 보낸다.
    entries_by_room = {
        f"{node.floor}|{node.ref}": index
        for index, node in enumerate(graph.nodes.values())
        if node.kind == "entry"
    }

    # 건물 밖에서 들어오는 출입구. 실외 출발지를 여기에 붙인다.
    # 위경도까지 실어 보내야 브라우저가 좌표 변환 없이 가장 가까운 곳을 고른다.
    transform = georef.transform_from(transform_data)
    origins = transform_data.get("floor_origin_px") or {}
    per_mm = transform_data.get("floor_px_per_mm") or {}

    def to_lonlat(floor: str, x: float, y: float):
        origin = origins.get(floor)
        scale = per_mm.get(floor)
        if not origin or not scale:
            return None
        x_m = (x - origin[0]) / scale / 1000.0
        y_m = -(y - origin[1]) / scale / 1000.0
        return georef.apply(transform, x_m, y_m)

    entrances = []
    for node_id in graph.entrances:
        node = graph.nodes[node_id]
        placed = to_lonlat(node.floor, node.x, node.y)
        if placed is None:
            continue
        entrances.append({
            "node": order[node_id],
            "floor": node.floor,
            "name": node.name,
            "lat": round(placed[1], 8),
            "lon": round(placed[0], 8),
        })
    name_entrances(entrances, building_center(graph, to_lonlat))

    return {
        "meta": {
            "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "building": "테크노관",
            "floors": [floor for floor in config.FLOORS if floor in graph.floors],
            "counts": {"nodes": len(nodes), "edges": len(edges),
                       "entrances": len(entrances)},
            "cost": {
                "walk_speed_mps": route.WALK_SPEED_MPS,
                "stair_seconds_per_floor": route.STAIR_SECONDS_PER_FLOOR,
                "elevator_wait_seconds": route.ELEVATOR_WAIT_SECONDS,
                "elevator_seconds_per_floor": route.ELEVATOR_SECONDS_PER_FLOOR,
                "floor_height_m": route.FLOOR_HEIGHT_M,
            },
            "warnings": graph.warnings,
        },
        "geo": {
            "transform": transform_data.get("transform"),
            "floor_origin_px": transform_data.get("floor_origin_px"),
            "floor_px_per_mm": transform_data.get("floor_px_per_mm"),
            "reference_latitude": config.REFERENCE_LATITUDE,
            "meters_per_deg_lat": config.METERS_PER_DEG_LAT,
            "meters_per_deg_lon_at_equator": config.METERS_PER_DEG_LON_AT_EQUATOR,
        },
        "floors": floors,
        "nodes": nodes,
        "edges": edges,
        "doors_by_room": doors_by_room,
        "entries_by_room": entries_by_room,
        "entrances": entrances,
        "rooms": route.room_index(graph),
    }


COMPASS = ("북", "북동", "동", "남동", "남", "남서", "서", "북서")


def building_center(graph: nav.NavGraph, to_lonlat) -> tuple[float, float]:
    """건물 한가운데 (lat, lon).

    출입구들의 평균을 쓰면 안 된다. 문이 한쪽 면에 몰려 있으면 기준점이
    그 면으로 끌려가서, 나란히 붙은 두 문이 "북쪽" 과 "남쪽" 으로 갈린다.
    복도 노드는 건물 전체에 깔려 있으니 그 외접 상자의 한가운데를 쓴다.
    """
    lats, lons = [], []
    for node in graph.nodes.values():
        placed = to_lonlat(node.floor, node.x, node.y)
        if placed is None:
            continue
        lons.append(placed[0])
        lats.append(placed[1])
    if not lats:
        return (config.REFERENCE_LATITUDE, 0.0)
    return ((min(lats) + max(lats)) / 2.0, (min(lons) + max(lons)) / 2.0)


def name_entrances(entrances: list[dict], center: tuple[float, float]) -> None:
    """이름 없는 출입구에 방위로 이름을 붙인다.

    "출입구 7" 은 밖에 서 있는 사람에게 아무 정보도 주지 않는다. 최소한
    건물 어느 쪽인지는 알려줘야 한다. 도면에 room_id 를 적어 두면 그게 이긴다.
    """
    center_lat, center_lon = center
    cos_lat = math.cos(math.radians(center_lat))

    sectors: dict[str, list[dict]] = {}
    for entrance in entrances:
        if entrance["name"]:
            continue
        north = (entrance["lat"] - center_lat) * config.METERS_PER_DEG_LAT
        east = (entrance["lon"] - center_lon) * config.METERS_PER_DEG_LON_AT_EQUATOR * cos_lat
        bearing = (math.degrees(math.atan2(east, north)) + 360.0) % 360.0
        index = int(((bearing + 22.5) % 360.0) // 45)
        entrance["_bearing"] = bearing
        entrance["_offset"] = ((bearing - index * 45.0 + 180.0) % 360.0) - 180.0
        sectors.setdefault(f"{COMPASS[index]}|{entrance['floor']}", []).append(entrance)

    for key, group in sectors.items():
        sector, floor = key.split("|")
        # 같은 방위·같은 층에 여럿이면 번호로 가른다. 구역 한가운데를 기준으로
        # 시계방향. 북쪽 구역에서 355° 와 5° 가 뒤집히지 않게 각도차로 센다.
        group.sort(key=lambda e: e["_offset"])
        for position, entrance in enumerate(group, start=1):
            suffix = f" {position}" if len(group) > 1 else ""
            entrance["name"] = f"{sector}쪽 출입구{suffix} ({floor})"

    for entrance in entrances:
        entrance.pop("_bearing", None)
        entrance.pop("_offset", None)


def self_check(graph: nav.NavGraph) -> list[str]:
    """모든 방에 경로가 나는지 실제로 한 번씩 돌려 본다."""
    problems = []
    start_floor = "1F" if "1F" in graph.floors else next(iter(graph.floors))
    point = graph.floors[start_floor].walkable.representative_point()
    start = {"floor": start_floor, "x": point.x, "y": point.y}
    estimated = 0
    for row in route.room_index(graph):
        try:
            result = route.find(graph, start, {"room_id": row["room_id"], "floor": row["floor"]})
        except route.RouteError as error:
            problems.append(f"{row['floor']} {row['room_id']}: {error}")
            continue
        if result.destination["kind"] != "door":
            estimated += 1
    print(f"경로 점검: 방 {len(route.room_index(graph))}개 중 실패 {len(problems)}개 "
          f"· 추정 진입점 {estimated}개")
    return problems


def main() -> int:
    write = "--write" in sys.argv

    transform_data = georef.load()
    graph = nav.build(georef_data=transform_data)
    print(f"그래프: 노드 {len(graph.nodes)}개 · "
          f"엣지 {sum(len(v) for v in graph.adjacency.values()) // 2}개 · "
          f"층 {len(graph.floors)}개")
    for warning in graph.warnings:
        print(f"  [경고] {warning}")

    problems = self_check(graph)
    for problem in problems[:10]:
        print(f"  [오류] {problem}")
    if problems:
        print(f"\n도달 불가 방이 {len(problems)}개 있어 파일을 쓰지 않는다.")
        return 1

    payload = build_payload(graph, transform_data)
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    print(f"번들 크기: {len(text.encode('utf-8')) / 1024:.0f}KB")

    if not write:
        print("\n점검만 수행했다. 실제로 교체하려면 --write 를 붙여라.")
        return 0

    NAV_JSON.parent.mkdir(parents=True, exist_ok=True)
    NAV_JSON.write_text(text, encoding="utf-8")
    print(f"저장: {NAV_JSON}")

    bundle = "window.TECHNO_NAV_DATA = " + text + ";\n"
    for directory in FRONTEND_DIRS:
        if not directory.exists():
            print(f"건너뜀: {directory} 없음")
            continue
        (directory / "map-techno-nav-data.js").write_text(bundle, encoding="utf-8")
        if CORE_JS.exists():
            shutil.copyfile(CORE_JS, directory / "map-techno-route-core.js")
        if MAP_JS.exists():
            shutil.copyfile(MAP_JS, directory / "map-techno-route.js")
        print(f"프론트 번들 갱신: {directory}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
