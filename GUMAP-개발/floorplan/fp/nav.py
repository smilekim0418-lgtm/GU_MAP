"""테크노관 실내 내비게이션 그래프.

이 모듈은 도면 **픽셀 좌표**만 다룬다. lon/lat 은 모른다 (georef.py 가 유일한 창구).

모델은 가시성 그래프(visibility graph)다. 복도 폴리곤 안에서 서로 보이는 노드를
직선으로 잇는다. 폴리곤 안의 최단경로는 반사각(reflex) 꼭짓점에서만 꺾이므로,
볼록 꼭짓점을 버려도 최단경로는 그대로다 - 노드 수만 절반 가까이 준다.

격자 A* 를 쓰지 않은 이유: 층당 24만 셀이 필요하고(0.3m 격자), 경로가 벽에 붙고
계단현상이 남아 후처리가 또 필요하다. 복도 폴리곤이 이미 직사각형 위주로
단순화돼 있어(꼭짓점 44~82개) 가시성 그래프가 더 작고 결과가 정확하다.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import Point, Polygon
from shapely.geometry.polygon import orient
from shapely.ops import nearest_points

from . import config
from . import entrances as entrances_module

CORRIDOR_LABEL = "복도"

# 건물 밖과 이어지는 문. connects 에 이 이름 중 하나가 들어 있으면 출입구로 본다.
# 실내지도 번들(04_build_imdf.py)도 똑같이 판정해야 하므로 정의는
# fp/entrances.py 한 곳에 두고 여기서는 가져다 쓴다.
OUTSIDE_LABELS = entrances_module.OUTSIDE_LABELS
is_outside_label = entrances_module.is_outside_label

# 경로가 벽에 딱 붙지 않게 복도를 안쪽으로 민다. 너무 크게 밀면 좁은 목이
# 끊어지므로 층마다 끊기지 않는 최대값을 자동으로 고른다.
INSET_CANDIDATES_M = (0.40, 0.30, 0.20, 0.12, 0.06, 0.0)

# 가시성 판정용 여유. 노드가 inset 폴리곤 경계 위에 놓이면 그 둘을 잇는 선분이
# 경계와 겹쳐 contains() 가 False 가 된다. 판정 폴리곤만 이만큼 부풀려 피한다.
VISIBILITY_EPS_PX = 0.5

# 꼭짓점이 반사각인지 볼록인지 볼 때 이등분선 방향으로 찍어보는 거리.
CORNER_PROBE_PX = 1.5


@dataclass
class Node:
    id: str
    floor: str
    kind: str            # corridor | door | access | stair | elevator
    x: float
    y: float
    ref: str | None = None      # 문이면 붙은 진입점의 주인, 계단·EV 면 그 이름
    connects: list[str] = field(default_factory=list)
    exterior: bool = False      # 건물 밖과 이어지는 출입구인가
    name: str | None = None     # 출입구 이름 (예: 정문)


@dataclass
class FloorData:
    floor: str
    px_per_mm: float
    corridor: Polygon        # 원본 복도 폴리곤
    walkable: Polygon        # inset 된 보행 영역
    inset_px: float
    rooms: dict[str, dict]   # room_id -> {"polygon": Polygon, "centroid": (x, y)}
    node_ids: list[str]

    def to_meters(self, pixels: float) -> float:
        return pixels / (self.px_per_mm * 1000.0)


@dataclass
class NavGraph:
    nodes: dict[str, Node]
    adjacency: dict[str, list[tuple[str, float, str]]]   # id -> [(id, 미터, mode)]
    floors: dict[str, FloorData]
    doors_by_room: dict[tuple[str, str], list[str]]      # (floor, room_id) -> [door node id]
    entrances: list[str] = field(default_factory=list)   # 건물 밖과 이어지는 문 노드 id
    warnings: list[str] = field(default_factory=list)

    def meters(self, a: str, b: str) -> float:
        for node_id, distance, _mode in self.adjacency.get(a, []):
            if node_id == b:
                return distance
        raise KeyError(f"엣지 없음: {a} -> {b}")

    def corridor_doors(self, floor: str, room_id: str) -> list[str]:
        """복도에서 바로 들어갈 수 있는 문만. 방↔방 문은 뺀다."""
        return [door_id for door_id in self.doors_by_room.get((floor, room_id), [])
                if CORRIDOR_LABEL in self.nodes[door_id].connects]

    def entry_of(self, floor: str, room_id: str) -> str | None:
        """복도 문이 없는 방의 추정 진입점 노드."""
        node_id = f"{floor}|R:{room_id}"
        return node_id if node_id in self.nodes else None


# ────────────────────────────── 입력 읽기 ──────────────────────────────

def _rings(record: dict) -> list[list[tuple[float, float]]]:
    """폴리곤 레코드 → 링 목록. 구멍이 있으면 points 가 링의 배열이다."""
    points = record.get("points") or []
    if not points:
        return []
    if isinstance(points[0][0], (list, tuple)):
        return [[(float(x), float(y)) for x, y in ring] for ring in points]
    return [[(float(x), float(y)) for x, y in points]]


def polygon_of(record: dict) -> Polygon | None:
    rings = [ring for ring in _rings(record) if len(ring) >= 3]
    if not rings:
        return None
    poly = Polygon(rings[0], [ring for ring in rings[1:] if len(ring) >= 4])
    if not poly.is_valid:
        poly = poly.buffer(0)
    if poly.is_empty:
        return None
    if poly.geom_type == "MultiPolygon":
        poly = max(poly.geoms, key=lambda part: part.area)
    return poly


def type_of(record: dict) -> str:
    return record.get("type") or "room"


def normalize_tokens(values) -> list[str]:
    """connects / connects_floors 정규화.

    '2F. 4F' 나 '복도. 계단-C' 처럼 구분자가 마침표로 잘못 찍힌 값이 실제로
    데이터에 있었다. 그대로 두면 그 문이 그래프에서 통째로 떨어져 나가고,
    계단 하나가 그 층 복도와 영영 안 닿는다. 읽는 쪽에서 갈라 준다.
    """
    result: list[str] = []
    for value in values or []:
        for part in str(value).replace(".", ",").replace("/", ",").split(","):
            part = part.strip()
            if part and part not in result:
                result.append(part)
    return result


# 예전 이름 (04_build_imdf 등 기존 호출부 호환)
normalize_floor_list = normalize_tokens


# ────────────────────────────── 기하 도우미 ──────────────────────────────

def inset_corridor(poly: Polygon, px_per_mm: float) -> tuple[Polygon, float]:
    """복도를 안쪽으로 민다. 끊기지 않는 가장 큰 값을 고른다."""
    for meters in INSET_CANDIDATES_M:
        pixels = meters * 1000.0 * px_per_mm
        if pixels <= 0:
            return poly, 0.0
        shrunk = poly.buffer(-pixels, join_style="mitre")
        if shrunk.is_empty or shrunk.geom_type == "MultiPolygon":
            continue          # 좁은 목이 끊겼다 - 더 작은 값으로
        if shrunk.area < poly.area * 0.35:
            continue
        return shrunk, pixels
    return poly, 0.0


def reflex_vertices(poly: Polygon) -> list[tuple[float, float]]:
    """최단경로가 꺾일 수 있는 꼭짓점만 고른다.

    꼭짓점의 두 변이 이루는 좁은 쐐기 방향으로 조금 나간 점이 폴리곤 안이면
    볼록, 밖이면 반사각이다. 링 방향(CW/CCW)에 기대지 않으므로 구멍이 섞여도
    그대로 통한다.
    """
    poly = orient(poly, sign=1.0)
    result: list[tuple[float, float]] = []
    for ring in [poly.exterior, *poly.interiors]:
        coords = list(ring.coords)[:-1]        # 닫는 점 제거
        count = len(coords)
        if count < 3:
            continue
        for index in range(count):
            previous = np.array(coords[index - 1], dtype=float)
            current = np.array(coords[index], dtype=float)
            following = np.array(coords[(index + 1) % count], dtype=float)
            back = previous - current
            ahead = following - current
            back_len, ahead_len = np.linalg.norm(back), np.linalg.norm(ahead)
            if back_len < 1e-9 or ahead_len < 1e-9:
                continue
            bisector = back / back_len + ahead / ahead_len
            length = np.linalg.norm(bisector)
            if length < 1e-9:
                continue                        # 일직선 - 꼭짓점이 아니다
            probe = current + bisector / length * CORNER_PROBE_PX
            if not poly.contains(Point(probe)):
                result.append((float(current[0]), float(current[1])))
    return result


def push_inside(poly: Polygon, x: float, y: float) -> tuple[float, float] | None:
    """점을 폴리곤 안으로 끌어들인다. 이미 안이면 그대로."""
    point = Point(x, y)
    if poly.contains(point):
        return (x, y)
    landing = nearest_points(poly, point)[0]
    direction = np.array([landing.x - x, landing.y - y], dtype=float)
    length = np.linalg.norm(direction)
    direction = direction / length if length > 1e-9 else np.zeros(2)
    for step in (1.0, 2.0, 3.0, 5.0, 8.0, 12.0):
        candidate = (landing.x + direction[0] * step, landing.y + direction[1] * step)
        if poly.contains(Point(candidate)):
            return candidate
    # 이등분선이 안 통하면 폴리곤 대표점 쪽으로 당겨본다
    inner = poly.representative_point()
    for ratio in (0.02, 0.05, 0.1, 0.2):
        candidate = (landing.x + (inner.x - landing.x) * ratio,
                     landing.y + (inner.y - landing.y) * ratio)
        if poly.contains(Point(candidate)):
            return candidate
    return None


def visibility_area(walkable: Polygon) -> Polygon:
    """가시성 판정에 쓰는 폴리곤. 노드가 경계 위에 놓여도 통과시키려고 살짝 부풀린다."""
    return walkable.buffer(VISIBILITY_EPS_PX, join_style="mitre")


def visible_pairs(points: list[tuple[float, float]], area: Polygon) -> list[tuple[int, int]]:
    """서로 보이는 점의 인덱스 쌍. shapely 벡터 연산으로 한 번에 판정한다."""
    count = len(points)
    if count < 2:
        return []
    left, right = np.triu_indices(count, k=1)
    coords = np.asarray(points, dtype=float)
    segments = shapely.linestrings(
        np.stack([coords[left], coords[right]], axis=1).reshape(-1, 2),
        indices=np.repeat(np.arange(len(left)), 2),
    )
    mask = shapely.contains(area, segments)
    return [(int(left[k]), int(right[k])) for k in np.nonzero(mask)[0]]


def visible_from(origin: tuple[float, float], points: list[tuple[float, float]],
                 area: Polygon) -> list[int]:
    """한 점에서 보이는 점들의 인덱스. 임의 출발점을 그래프에 붙일 때 쓴다."""
    if not points:
        return []
    coords = np.asarray(points, dtype=float)
    start = np.repeat(np.asarray([origin], dtype=float), len(points), axis=0)
    segments = shapely.linestrings(
        np.stack([start, coords], axis=1).reshape(-1, 2),
        indices=np.repeat(np.arange(len(points)), 2),
    )
    return [int(k) for k in np.nonzero(shapely.contains(area, segments))[0]]


# ────────────────────────────── 그래프 빌드 ──────────────────────────────

def _floor_nodes(floor: str, data: dict, px_per_mm: float):
    warnings: list[str] = []
    records = data["polygons"]

    corridors = [p for p in (polygon_of(r) for r in records if type_of(r) == "corridor")
                 if p is not None]
    if not corridors:
        raise ValueError(f"{floor}: 복도 폴리곤이 없다")
    corridor = max(corridors, key=lambda part: part.area)
    walkable, inset_px = inset_corridor(corridor, px_per_mm)
    if inset_px == 0.0:
        warnings.append(f"{floor}: 복도를 안쪽으로 밀 수 없어 원본을 그대로 쓴다")

    rooms: dict[str, dict] = {}
    for record in records:
        if type_of(record) != "room" or not record.get("room_id"):
            continue
        poly = polygon_of(record)
        if poly is None:
            continue
        centroid = record.get("centroid") or [poly.centroid.x, poly.centroid.y]
        rooms.setdefault(record["room_id"], {
            "polygon": poly,
            "centroid": (float(centroid[0]), float(centroid[1])),
        })

    nodes: list[Node] = []

    # ① 복도 코너
    for index, (x, y) in enumerate(reflex_vertices(walkable)):
        nodes.append(Node(id=f"{floor}|C{index}", floor=floor, kind="corridor", x=x, y=y))

    # ② 계단 · 엘리베이터
    for record in records:
        kind = type_of(record)
        if kind not in ("stairs", "elevator") or not record.get("room_id"):
            continue
        name = record["room_id"]
        x, y = record.get("centroid") or (0, 0)
        nodes.append(Node(
            id=vertical_node_id(floor, kind, name),
            floor=floor,
            kind="stair" if kind == "stairs" else "elevator",
            x=float(x), y=float(y),
            ref=name,
            connects=normalize_tokens(record.get("connects_floors")),
        ))

    # ③ 문 + 복도쪽 진입점
    for index, record in enumerate(records):
        if type_of(record) != "door":
            continue
        x, y = record.get("centroid") or (0, 0)
        raw = record.get("connects") or []
        connects = normalize_tokens(raw)
        if connects != [str(value) for value in raw]:
            warnings.append(f"{floor}: 문 connects 를 {raw} → {connects} 로 고쳐 읽었다")
        exterior = any(is_outside_label(value) for value in connects)
        door = Node(id=f"{floor}|D{index}", floor=floor, kind="door",
                    x=float(x), y=float(y), connects=connects,
                    exterior=exterior,
                    name=(record.get("room_id") or None) if exterior else None)
        nodes.append(door)
        if exterior and CORRIDOR_LABEL not in connects:
            warnings.append(
                f"{floor}: 출입구 {connects} 가 복도와 이어지지 않아 그래프에 못 붙였다")
        if CORRIDOR_LABEL not in connects:
            continue
        pushed = push_inside(walkable, door.x, door.y)
        if pushed is None:
            warnings.append(f"{floor}: 문 {connects} 을 복도에 붙이지 못했다")
            continue
        nodes.append(Node(id=f"{door.id}a", floor=floor, kind="access",
                          x=pushed[0], y=pushed[1], ref=door.id))

    # ④ 복도와 닿는 문이 하나도 없는 방의 추정 진입점.
    # 문 박스가 아예 없거나(26개) 옆방을 통해서만 들어가는 방(5개)이 실제로 있다.
    # 그런 방을 조회 시점에 즉석 처리하면 파이썬과 브라우저가 서로 다른 폴백을
    # 구현해야 한다. 진입점을 그래프에 미리 구워 두면 양쪽이 같은 답을 낸다.
    with_corridor_door: set[str] = set()
    for node in nodes:
        if node.kind != "door" or CORRIDOR_LABEL not in node.connects:
            continue
        with_corridor_door.update(t for t in node.connects if t != CORRIDOR_LABEL)
    for room_id, room in rooms.items():
        if room_id in with_corridor_door:
            continue
        landing = push_inside(walkable, room["centroid"][0], room["centroid"][1])
        if landing is None:
            warnings.append(f"{floor}: {room_id} 의 진입점을 복도에 붙이지 못했다")
            continue
        nodes.append(Node(id=f"{floor}|R:{room_id}", floor=floor, kind="entry",
                          x=landing[0], y=landing[1], ref=room_id))

    info = FloorData(floor=floor, px_per_mm=px_per_mm, corridor=corridor,
                     walkable=walkable, inset_px=inset_px, rooms=rooms,
                     node_ids=[node.id for node in nodes])
    return info, nodes, warnings


def vertical_node_id(floor: str, kind: str, name: str) -> str:
    prefix = "S" if kind in ("stairs", "stair") else "E"
    return f"{floor}|{prefix}:{name}"


def build(floors: list[str] | None = None, work_dir: Path | None = None,
          georef_data: dict | None = None) -> NavGraph:
    """층별 labeled.json → 내비게이션 그래프."""
    from . import georef as georef_module

    floors = list(floors or config.FLOORS)
    georef_data = georef_data or georef_module.load()
    px_per_mm_by_floor = georef_data.get("floor_px_per_mm") or {}
    base_dir = Path(work_dir) if work_dir else config.WORK_DIR

    nodes: dict[str, Node] = {}
    adjacency: dict[str, list[tuple[str, float, str]]] = {}
    floor_data: dict[str, FloorData] = {}
    doors_by_room: dict[tuple[str, str], list[str]] = {}
    warnings: list[str] = []

    def link(a: str, b: str, meters: float, mode: str) -> None:
        adjacency.setdefault(a, []).append((b, meters, mode))
        adjacency.setdefault(b, []).append((a, meters, mode))

    for floor in floors:
        path = base_dir / f"{floor}_labeled.json"
        if not path.exists():
            warnings.append(f"{floor}: {path.name} 없음 - 건너뜀")
            continue
        px_per_mm = px_per_mm_by_floor.get(floor)
        if not px_per_mm:
            warnings.append(f"{floor}: 축척이 없어 건너뜀")
            continue

        data = json.loads(path.read_text(encoding="utf-8"))
        info, floor_nodes, floor_warnings = _floor_nodes(floor, data, float(px_per_mm))
        warnings.extend(floor_warnings)
        floor_data[floor] = info
        nodes.update({node.id: node for node in floor_nodes})

        # 같은 층 가시성 엣지: 복도 코너 + 문 진입점 + 방 추정 진입점끼리
        walk_nodes = [node for node in floor_nodes
                      if node.kind in ("corridor", "access", "entry")]
        points = [(node.x, node.y) for node in walk_nodes]
        area = visibility_area(info.walkable)
        for i, j in visible_pairs(points, area):
            link(walk_nodes[i].id, walk_nodes[j].id,
                 info.to_meters(math.dist(points[i], points[j])), "walk")

        # 문 ↔ 진입점, 문 ↔ 계단/EV, 문 ↔ 방
        by_id = {node.id: node for node in floor_nodes}
        vertical_by_name = {node.ref: node for node in floor_nodes
                            if node.kind in ("stair", "elevator")}
        for node in floor_nodes:
            if node.kind == "access":
                door = by_id[node.ref]
                link(door.id, node.id,
                     info.to_meters(math.dist((door.x, door.y), (node.x, node.y))), "walk")
            elif node.kind == "door":
                for target in node.connects:
                    if target == CORRIDOR_LABEL:
                        continue
                    if is_outside_label(target):
                        continue          # 건물 밖은 방이 아니다
                    peer = vertical_by_name.get(target)
                    if peer is not None:
                        link(node.id, peer.id,
                             info.to_meters(math.dist((node.x, node.y), (peer.x, peer.y))),
                             "walk")
                    else:
                        doors_by_room.setdefault((floor, target), []).append(node.id)

    # 층간 엣지: 이름이 같고 양쪽이 서로를 선언한 계단 · EV 만
    for node in list(nodes.values()):
        if node.kind not in ("stair", "elevator"):
            continue
        for other_floor in node.connects:
            if other_floor == node.floor:
                continue
            peer = nodes.get(vertical_node_id(other_floor, node.kind, node.ref))
            if peer is None:
                continue
            if node.floor not in peer.connects:
                warnings.append(
                    f"{node.ref}: {node.floor}→{other_floor} 은 한쪽만 선언해 뺐다"
                )
                continue
            if node.id < peer.id:                     # 한 번만 잇는다
                link(node.id, peer.id, 0.0, node.kind)

    # 건물 밖과 이어지는 문. 복도까지 실제로 붙은 것만 쓸모가 있다.
    entrances = [
        node.id for node in nodes.values()
        if node.exterior and f"{node.id}a" in nodes
    ]
    entrances.sort(key=lambda node_id: (config.FLOORS.index(nodes[node_id].floor), node_id))

    return NavGraph(nodes=nodes, adjacency=adjacency, floors=floor_data,
                    doors_by_room=doors_by_room, entrances=entrances,
                    warnings=warnings)
