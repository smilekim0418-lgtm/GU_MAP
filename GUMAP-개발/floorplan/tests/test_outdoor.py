"""건물을 돌아 출입구까지 가는 실외 그래프.

직선으로 재면 선이 건물을 뚫는다. 여기서는 그래프가 성립하는지를 본다.
실제 경로가 건물을 통과하지 않는지는 tests/outdoor_detour_check.py 가
브라우저 엔진까지 끝단으로 확인한다.
"""
import heapq
import json

import pytest
from shapely.geometry import LineString, Point, Polygon

from fp import config, georef, outdoor

pytestmark = pytest.mark.skipif(
    not (config.WORK_DIR / "1F_labeled.json").exists(),
    reason="work/*_labeled.json 이 없다",
)


@pytest.fixture(scope="module")
def to_lonlat():
    data = georef.load()
    transform = georef.transform_from(data)
    origins = data["floor_origin_px"]
    per_mm = data["floor_px_per_mm"]

    def convert(floor, x, y):
        origin, scale = origins.get(floor), per_mm.get(floor)
        if not origin or not scale:
            return None
        return georef.apply(transform, (x - origin[0]) / scale / 1000.0,
                            -(y - origin[1]) / scale / 1000.0)
    return convert


@pytest.fixture(scope="module")
def entrances():
    bundle = json.loads((config.WORK_DIR / "techno_nav.json").read_text(encoding="utf-8"))
    return bundle["entrances"]


@pytest.fixture(scope="module")
def outline(to_lonlat):
    return outdoor.building_outline(config.FLOORS, config.WORK_DIR, to_lonlat)


@pytest.fixture(scope="module")
def graph(to_lonlat, entrances):
    return outdoor.build(config.FLOORS, config.WORK_DIR, to_lonlat, entrances)


def test_건물이_한_덩어리다(outline):
    """조각나면 그 틈으로 길이 난다. 방 박스가 서로 안 닿아서 실제로 46조각이었다."""
    assert outline.geom_type == "Polygon"
    assert outline.is_valid


def test_지면에_닿는_층만_쓴다(to_lonlat):
    """위층까지 합치면 B1F 출입구가 처마 안쪽 13.5m 에 파묻힌다."""
    ground = outdoor.building_outline(["B1F", "1F"], config.WORK_DIR, to_lonlat)
    everything = outdoor.building_outline(config.FLOORS, config.WORK_DIR, to_lonlat)
    assert everything.equals(ground), "GROUND_FLOORS 로 걸러지지 않았다"


def test_모든_출입구가_벽_가까이에_있다(outline, entrances):
    """문이 벽에서 멀면 도면이나 실루엣 둘 중 하나가 틀린 것이다."""
    far = []
    for entrance in entrances:
        gap = (outline.boundary.distance(Point(entrance["lon"], entrance["lat"]))
               * config.METERS_PER_DEG_LAT)
        if gap > 3.0:
            far.append(f"{entrance['name']} {gap:.1f}m")
    assert not far, f"벽에서 3m 넘게 떨어진 출입구: {far}"


def test_진입_자리는_건물_밖이다(graph):
    """안쪽에 잡히면 밖에서 아무도 그 자리를 볼 수 없다."""
    blocked = Polygon(graph["rings"][0], graph["rings"][1:])
    inside = [spot for spot in graph["approaches"] if blocked.contains(Point(spot))]
    assert not inside, f"건물 안에 잡힌 진입 자리 {len(inside)}개"


def test_모서리_노드도_건물_밖이다(graph):
    blocked = Polygon(graph["rings"][0], graph["rings"][1:])
    inside = [node for node in graph["nodes"] if blocked.contains(Point(node))]
    assert not inside, f"건물 안에 있는 모서리 노드 {len(inside)}개"


def test_모든_출입구가_그래프에_이어져_있다(graph, entrances):
    """한 문이라도 고립되면 그 문으로는 아무도 못 들어온다."""
    node_count = len(graph["nodes"])
    total = node_count + len(graph["approaches"])
    adjacency = {index: set() for index in range(total)}

    def link(a, b):
        adjacency[a].add(b)
        adjacency[b].add(a)

    for a, b, _ in graph["edges"]:
        link(a, b)
    for node, spot, _ in graph["entrance_edges"]:
        link(node, node_count + spot)
    for a, b, _ in graph["approach_edges"]:
        link(node_count + a, node_count + b)

    seen = {0}
    stack = [0]
    while stack:
        for peer in adjacency[stack.pop()]:
            if peer not in seen:
                seen.add(peer)
                stack.append(peer)

    stranded = [entrances[i]["name"] for i in range(len(graph["approaches"]))
                if node_count + i not in seen]
    assert not stranded, f"그래프에서 끊긴 출입구: {stranded}"


def test_출입구마다_진입_자리_번호를_들고_있다(entrances, graph):
    """배열 순번으로 찾게 두면, 목록을 거른 순간 남의 진입 자리를 쓴다."""
    slots = [entrance.get("approach") for entrance in entrances]
    assert all(slot is not None for slot in slots), "approach 번호가 없는 출입구가 있다"
    assert sorted(slots) == list(range(len(graph["approaches"])))


def test_돌아가는_길이_직선보다_짧을_수는_없다(graph, entrances):
    """장애물을 피해 도는 거리는 반드시 직선 이상이다."""
    blocked = Polygon(graph["rings"][0], graph["rings"][1:])
    node_count = len(graph["nodes"])
    points = [tuple(p) for p in graph["nodes"] + graph["approaches"]]
    adjacency = {index: [] for index in range(len(points))}

    def link(a, b, weight):
        adjacency[a].append((b, weight))
        adjacency[b].append((a, weight))

    for a, b, weight in graph["edges"]:
        link(a, b, weight)
    for node, spot, weight in graph["entrance_edges"]:
        link(node, node_count + spot, weight)
    for a, b, weight in graph["approach_edges"]:
        link(node_count + a, node_count + b, weight)

    centre = blocked.centroid
    start = (centre.x + 0.0011, centre.y + 0.0009)
    assert not blocked.contains(Point(start))

    best = {}
    heap = []
    for index, point in enumerate(points):
        if outdoor.visible(blocked, start, point):
            span = outdoor.meters_between(start[1], start[0], point[1], point[0])
            if span < best.get(index, float("inf")):
                best[index] = span
                heapq.heappush(heap, (span, index))
    while heap:
        cost, at = heapq.heappop(heap)
        if cost > best.get(at, float("inf")) + 1e-9:
            continue
        for peer, weight in adjacency[at]:
            if cost + weight < best.get(peer, float("inf")) - 1e-9:
                best[peer] = cost + weight
                heapq.heappush(heap, (cost + weight, peer))

    for index, entrance in enumerate(entrances):
        walked = best.get(node_count + index)
        assert walked is not None, f"{entrance['name']} 까지 길이 없다"
        straight = outdoor.meters_between(start[1], start[0],
                                          entrance["lat"], entrance["lon"])
        assert walked >= straight - 3.0, (
            f"{entrance['name']}: 돌아간 {walked:.1f}m 가 직선 {straight:.1f}m 보다 짧다")


def test_모서리는_건물이_튀어나온_곳에만_생긴다(graph):
    """오목한 홈에 노드를 잡으면 서로 안 보여서 그래프가 거의 안 이어진다.

    부호로 판정하다 뒤집혀서 실제로 그렇게 됐다(105쌍 중 변 5개).
    """
    assert len(graph["edges"]) > len(graph["nodes"]), "모서리끼리 너무 안 이어진다"
