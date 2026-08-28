"""건물 밖을 걸어서 출입구까지 가는 그래프.

실외 구간을 직선으로 재면 선이 건물을 뚫고 지나간다. 실측에서 표본의 55%가
그랬고, 최악은 98m 중 60m 가 건물 내부였다. "건물 밖에서 155m" 라고
안내하면서 정작 건물을 관통하는 선을 그리면 그건 거짓말이다.

그래서 건물을 장애물로 두고 그 둘레를 돌아가는 최단거리를 쓴다. 실내
길찾기와 같은 원리(가시성 그래프)인데, 폴리곤 안이 아니라 밖을 돈다.
꺾이는 곳은 장애물의 볼록한 모서리뿐이다.

여기서 만드는 것은 좌표가 위경도인 정적 그래프다. 사용자가 어디를 찍을지는
모르니, 그 점에서 뻗는 변만 브라우저가 실행 시간에 잇는다.

모델링하는 장애물은 테크노관 하나다. 다른 건물·옹벽·화단은 아직 모른다.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from shapely.geometry import LineString, Point, Polygon
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

from . import config

# 보행자를 막는 것은 지면에 닿는 층이다. 위층은 처마처럼 튀어나와도 그 밑을
# 걸어서 지나간다. 전 층을 합쳤더니 B1F 출입구가 위층 외곽 안쪽 13.5m 에
# 파묻혀서, 진입 자리가 건물 반대편에 잡혔다.
GROUND_FLOORS = ("B1F", "1F")

# 방 박스들이 서로 딱 붙어 있지 않다. 그대로 합치면 46조각으로 흩어지고
# 그 틈으로 길이 난다. 이만큼 부풀렸다 되돌려(닫힘) 틈을 메우면 한 덩어리다.
CLOSE_M = 0.3

# 벽에 딱 붙어 걷지는 않는다. 건물 둘레를 이만큼 띄운 선을 따라 돈다.
# 크게 잡으면 안 된다. 문이 벽에서 최대 1.7m 안쪽에 있어서, 여유폭이 너무
# 두꺼우면 출입구가 통째로 막혀 버린다.
CLEARANCE_M = 0.5

# 도면 꼭짓점을 이만큼 단순화한다. 425개 -> 56개가 되고 면적은 0.4% 변한다.
# 모서리 하나하나가 그래프 노드라서, 줄이지 않으면 실행 시간에 손해만 본다.
SIMPLIFY_M = 1.0

# 노드는 판정 영역보다 한 겹 더 바깥에 둔다. 판정면 위에 노드를 얹으면
# 그 점에서 뻗는 모든 선분이 경계와 겹쳐 가시선이 거의 안 난다.
NODE_OFFSET_M = 0.5

DEG_PER_M_LAT = 1.0 / config.METERS_PER_DEG_LAT


def _deg_per_m_lon(lat: float) -> float:
    return 1.0 / (config.METERS_PER_DEG_LON_AT_EQUATOR * math.cos(math.radians(lat)))


def meters_between(lat1, lon1, lat2, lon2) -> float:
    """위경도 두 점 사이 거리(m). 엔진의 metersBetween 과 같은 식이다."""
    mid = math.radians((lat1 + lat2) / 2.0)
    north = (lat2 - lat1) * config.METERS_PER_DEG_LAT
    east = (lon2 - lon1) * config.METERS_PER_DEG_LON_AT_EQUATOR * math.cos(mid)
    return math.hypot(north, east)


def building_outline(floors, work_dir, to_lonlat) -> Polygon:
    """지면에 닿는 층을 합쳐 건물 실루엣 하나를 만든다 (위경도).

    floors 를 넘겨도 GROUND_FLOORS 로 걸러서 쓴다. 밖을 걷는 사람을 막는
    것은 1층·지하1층 벽이지 4층 외벽이 아니다.
    """
    parts = []
    for floor in [f for f in floors if f in GROUND_FLOORS]:
        path = Path(work_dir) / f"{floor}_labeled.json"
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for record in data.get("polygons", []):
            rings = record.get("points") or []
            loops = rings if (rings and isinstance(rings[0][0], list)) else [rings]
            for loop in loops:
                if len(loop) < 3:
                    continue
                points = []
                for x, y in loop:
                    placed = to_lonlat(floor, float(x), float(y))
                    if placed is not None:
                        points.append(placed)
                if len(points) >= 3:
                    parts.append(Polygon(points).buffer(0))
    if not parts:
        raise ValueError("도형이 하나도 없다")

    close = CLOSE_M * DEG_PER_M_LAT
    merged = unary_union(parts).buffer(0)
    merged = (merged.buffer(close, join_style="mitre", mitre_limit=2.0)
                    .buffer(-close, join_style="mitre", mitre_limit=2.0)
                    .buffer(0))
    if merged.geom_type == "MultiPolygon":
        biggest = max(merged.geoms, key=lambda part: part.area)
        if biggest.area < merged.area * 0.95:
            raise ValueError(
                f"건물이 {len(merged.geoms)}조각으로 흩어졌다 "
                f"(최대 조각 {biggest.area / merged.area:.0%}). CLOSE_M 을 올려라")
        merged = biggest
    return merged


def _offset(outline: Polygon, meters: float, reference_lat: float) -> Polygon:
    """건물에서 meters 만큼 띄운 영역 (위경도).

    위경도는 남북·동서 축척이 다르다. 위도 쪽으로 정규화해 원형 buffer 를
    준 뒤 되돌린다. 안 그러면 동서로 25% 더 부푼다.
    """
    ratio = _deg_per_m_lon(reference_lat) / DEG_PER_M_LAT
    squished = _scale_lon(outline, 1.0 / ratio)
    padded = squished.buffer(meters * DEG_PER_M_LAT,
                             join_style="mitre", mitre_limit=2.0)
    padded = padded.simplify(SIMPLIFY_M * DEG_PER_M_LAT)
    if padded.geom_type == "MultiPolygon":
        padded = max(padded.geoms, key=lambda part: part.area)
    return _scale_lon(padded, ratio)


def _scale_lon(geometry, factor: float):
    from shapely.affinity import scale
    return scale(geometry, xfact=factor, yfact=1.0, origin=(0.0, 0.0))


def convex_corners(walk: Polygon, blocked: Polygon) -> list[tuple[float, float]]:
    """바깥에서 볼 때 볼록한 모서리만. 최단거리는 거기서만 꺾인다.

    오목한 모서리(건물 쪽으로 파인 곳)에서는 길이 꺾일 이유가 없다. 빼 두면
    노드가 절반 이하로 줄고 결과는 같다.

    처음엔 둘레선 위의 모서리를 이등분선 방향으로 0.15m 씩 밀어서 썼다.
    여유가 너무 얄팍해서 모서리끼리 가시선이 105쌍 중 5개밖에 안 났다.
    지금은 아예 한 겹 더 바깥(NODE_OFFSET_M)에 노드를 두고, 판정은 안쪽
    영역으로 한다. 노드가 판정면에서 확실히 떨어져 있으니 흔들리지 않는다.
    """
    corners = []
    for ring in _rings(walk):
        if len(ring) < 3:
            continue
        count = len(ring)
        for index in range(count):
            before = ring[index - 1]
            here = ring[index]
            after = ring[(index + 1) % count]
            # 방향을 따지지 않는다. 이웃 둘을 잇는 현이 건물 살을 파고들면
            # 이 꼭짓점은 바깥으로 튀어나온 것이고, 길은 거기서만 꺾인다.
            # 부호로 판정하다 한 번 뒤집혀서 홈만 노드로 잡은 적이 있다.
            chord = Point((before[0] + after[0]) / 2.0, (before[1] + after[1]) / 2.0)
            if blocked.contains(chord) and not blocked.contains(Point(here)):
                corners.append(here)
    return corners


def _rings(polygon: Polygon):
    """외곽 링과 구멍 링 전부. 중정 안쪽 모서리에서도 길은 꺾인다."""
    yield list(polygon.exterior.coords)[:-1]
    for hole in polygon.interiors:
        yield list(hole.coords)[:-1]


def approach_point(walk: Polygon, blocked: Polygon, lon: float, lat: float):
    """출입구 문에서 가장 가까운 '밖에 서는 자리'.

    문 자체는 건물 안(장애물 안)이라 밖에서는 보이지 않는다. 그대로 두면
    어떤 길도 안 난다. 둘레선 위의 최근접점까지 간 뒤 문으로 들어간다.
    """
    from shapely.ops import nearest_points
    door = Point(lon, lat)
    if not blocked.contains(door):
        return (lon, lat)
    # boundary 는 외곽 링과 구멍 링을 모두 포함한다. exterior 만 보면 중정을
    # 향한 문이 건물 반대편 외곽으로 끌려간다.
    _, edge = nearest_points(door, walk.boundary)
    return (edge.x, edge.y)


def visible(blocked: Polygon, a, b) -> bool:
    """두 점을 잇는 선분이 건물(과 여유폭)을 통과하지 않는가."""
    return not LineString([a, b]).intersects(blocked)


def build(floors, work_dir, to_lonlat, entrances) -> dict:
    """실외 그래프. entrances 는 [{lat, lon, ...}] 이고 순서를 그대로 쓴다."""
    outline = building_outline(floors, work_dir, to_lonlat)
    reference_lat = outline.centroid.y

    blocked = _offset(outline, CLEARANCE_M, reference_lat)          # 못 지나가는 영역
    walk = _offset(outline, CLEARANCE_M + NODE_OFFSET_M, reference_lat)  # 노드가 사는 선

    nodes = convex_corners(walk, blocked)
    approaches = [approach_point(walk, blocked, e["lon"], e["lat"]) for e in entrances]

    def span(a, b):
        return round(meters_between(a[1], a[0], b[1], b[0]), 3)

    edges = [[i, j, span(nodes[i], nodes[j])]
             for i in range(len(nodes)) for j in range(i + 1, len(nodes))
             if visible(blocked, nodes[i], nodes[j])]

    entrance_edges = [[i, index, span(nodes[i], spot)]
                      for index, spot in enumerate(approaches)
                      for i in range(len(nodes))
                      if visible(blocked, nodes[i], spot)]

    approach_edges = [[a, b, span(approaches[a], approaches[b])]
                      for a in range(len(approaches))
                      for b in range(a + 1, len(approaches))
                      if visible(blocked, approaches[a], approaches[b])]

    return {
        "rings": [[[round(x, 8), round(y, 8)] for x, y in ring]
                  for ring in _rings(blocked)],
        "nodes": [[round(x, 8), round(y, 8)] for x, y in nodes],
        "edges": edges,
        "approaches": [[round(x, 8), round(y, 8)] for x, y in approaches],
        "entrance_edges": entrance_edges,
        "approach_edges": approach_edges,
        "clearance_m": CLEARANCE_M,
    }
