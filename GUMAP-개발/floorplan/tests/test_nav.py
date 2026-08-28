"""실내 길찾기 그래프와 경로 탐색의 계약.

실제 도면 데이터(work/*_labeled.json)를 그대로 쓴다. 합성 데이터로는
"경로가 방을 관통하지 않는다" 같은 성질을 의미 있게 검사할 수 없다.
"""
import math

import pytest
from shapely.geometry import LineString, Point, Polygon

from fp import config, nav, route

pytestmark = pytest.mark.skipif(
    not (config.WORK_DIR / "1F_labeled.json").exists(),
    reason="work/*_labeled.json 이 없다",
)


@pytest.fixture(scope="module")
def graph():
    return nav.build()


@pytest.fixture(scope="module")
def corridor_start(graph):
    """1F 복도 안의 한 점."""
    point = graph.floors["1F"].walkable.representative_point()
    return {"floor": "1F", "x": point.x, "y": point.y}


# ────────────────────────── 축척 ──────────────────────────

def test_축척은_층마다_다른_값을_쓴다(graph):
    per_floor = {floor: info.px_per_mm for floor, info in graph.floors.items()}
    assert len(set(per_floor.values())) > 1, "층마다 다른 축척이 적용돼야 한다"
    for floor, value in per_floor.items():
        assert 0.015 <= value <= 0.040, f"{floor} 축척이 비정상: {value}"


def test_픽셀거리가_미터로_바르게_환산된다(graph):
    info = graph.floors["2F"]
    # 2F 는 0.0254 px/mm → 1000px 는 약 39.4m
    assert info.to_meters(1000.0) == pytest.approx(1000.0 / (info.px_per_mm * 1000.0))
    assert 38.0 < info.to_meters(1000.0) < 41.0


def test_건물_전체_폭이_도면_치수와_맞는다(graph):
    """복도 bbox 가 90.2m 도면 범위 안에 들어와야 한다."""
    for floor, info in graph.floors.items():
        minx, miny, maxx, maxy = info.corridor.bounds
        width = info.to_meters(maxx - minx)
        height = info.to_meters(maxy - miny)
        assert 0 < width <= 95.0, f"{floor} 복도 폭 {width:.1f}m"
        assert 0 < height <= 95.0, f"{floor} 복도 높이 {height:.1f}m"


# ────────────────────────── 그래프 구조 ──────────────────────────

def test_모든_층이_그래프에_올라간다(graph):
    assert set(graph.floors) == set(config.FLOORS)


def test_복도_보행영역은_한_덩어리다(graph):
    for floor, info in graph.floors.items():
        assert info.walkable.geom_type == "Polygon", f"{floor} 보행영역이 쪼개졌다"
        assert info.inset_px > 0, f"{floor} 복도를 안쪽으로 밀지 못했다"


def test_복도와_닿는_문은_모두_진입점을_갖는다(graph):
    for node in graph.nodes.values():
        if node.kind != "door" or nav.CORRIDOR_LABEL not in node.connects:
            continue
        assert f"{node.id}a" in graph.nodes, f"{node.id} 의 복도 진입점이 없다"


def test_진입점은_보행영역_안에_있다(graph):
    for node in graph.nodes.values():
        if node.kind != "access":
            continue
        walkable = graph.floors[node.floor].walkable
        assert walkable.contains(Point(node.x, node.y)), f"{node.id} 가 복도 밖이다"


def test_층간_엣지는_양쪽이_서로_선언한_경우만_생긴다(graph):
    for node_id, edges in graph.adjacency.items():
        node = graph.nodes[node_id]
        for target_id, _distance, mode in edges:
            if mode == "walk":
                continue
            peer = graph.nodes[target_id]
            assert peer.ref == node.ref, "이름이 다른 계단·EV 가 이어졌다"
            assert peer.floor in node.connects, f"{node_id}→{target_id} 선언 없음"
            assert node.floor in peer.connects, f"{target_id}→{node_id} 선언 없음"


def test_5층으로_가는_계단D_는_없다(graph):
    """실제 건물에서 계단-D 는 4층까지만 간다. 인접층이라고 멋대로 잇지 않는다."""
    assert nav.vertical_node_id("5F", "stairs", "계단-D") not in graph.nodes
    node = graph.nodes[nav.vertical_node_id("4F", "stairs", "계단-D")]
    assert node.connects == ["3F"]


def test_복도_그래프는_하나로_연결돼_있다(graph):
    """방↔방 문(복도와 안 닿는 문)을 빼면 전부 한 덩어리여야 한다."""
    seen = set()
    components = []
    for start in graph.nodes:
        if start in seen:
            continue
        stack, component = [start], {start}
        seen.add(start)
        while stack:
            for neighbour, _distance, _mode in graph.adjacency.get(stack.pop(), []):
                if neighbour not in component:
                    component.add(neighbour)
                    seen.add(neighbour)
                    stack.append(neighbour)
        components.append(component)
    components.sort(key=len, reverse=True)
    for component in components[1:]:
        for node_id in component:
            node = graph.nodes[node_id]
            assert node.kind == "door" and nav.CORRIDOR_LABEL not in node.connects, (
                f"{node_id} 가 그래프에서 떨어져 있다"
            )


def test_connects_구분자가_깨져도_읽어낸다():
    assert nav.normalize_tokens(["복도. 계단-C", ""]) == ["복도", "계단-C"]
    assert nav.normalize_tokens(["2F. 4F"]) == ["2F", "4F"]
    assert nav.normalize_tokens(["복도", "228"]) == ["복도", "228"]


# ────────────────────────── 경로 ──────────────────────────

def test_같은_층_경로가_나온다(graph, corridor_start):
    result = route.find(graph, corridor_start, {"room_id": "101", "floor": "1F"})
    assert result.ok
    assert result.distance_m > 0
    assert result.duration_s > 0
    assert len(result.legs) == 1
    assert result.legs[0].mode == "walk"
    assert result.destination["room_id"] == "101"


def test_도착점은_문_박스_중앙이다(graph, corridor_start):
    result = route.find(graph, corridor_start, {"room_id": "201", "floor": "2F"})
    door = graph.nodes[result.destination["door_node"]]
    assert door.kind == "door"
    assert result.destination["point"] == [round(door.x, 1), round(door.y, 1)]
    assert result.destination["kind"] == "door"
    # 그 문은 실제로 201 호에 붙은 문이어야 한다
    assert "201" in door.connects


def test_경로_마지막_점이_도착_문과_일치한다(graph, corridor_start):
    result = route.find(graph, corridor_start, {"room_id": "301", "floor": "3F"})
    last_walk = [leg for leg in result.legs if leg.mode == "walk"][-1]
    assert list(last_walk.points[-1]) == pytest.approx(result.destination["point"], abs=0.2)


def test_층이_다르면_계단이나_EV_를_반드시_거친다(graph, corridor_start):
    result = route.find(graph, corridor_start, {"room_id": "401", "floor": "4F"})
    modes = [leg.mode for leg in result.legs]
    assert "stairs" in modes or "elevator" in modes
    vertical = [leg for leg in result.legs if leg.mode in ("stairs", "elevator")]
    assert vertical[0].floor == "1F"
    assert vertical[-1].to_floor == "4F"


def test_연속된_같은_계단은_한_구간으로_합쳐진다(graph, corridor_start):
    result = route.find(graph, corridor_start, {"room_id": "301", "floor": "3F"},
                        avoid_stairs=False)
    stairs = [leg for leg in result.legs if leg.mode == "stairs"]
    names = [(leg.name, leg.floor, leg.to_floor) for leg in stairs]
    assert len(names) == len(set(names)), f"같은 계단이 쪼개져 있다: {names}"


def test_계단_회피_옵션은_계단을_안_쓴다(graph, corridor_start):
    result = route.find(graph, corridor_start, {"room_id": "401", "floor": "4F"},
                        avoid_stairs=True)
    assert all(leg.mode != "stairs" for leg in result.legs)
    assert any(leg.mode == "elevator" for leg in result.legs)


def test_계단_회피는_같거나_더_느린_경로를_준다(graph, corridor_start):
    free = route.find(graph, corridor_start, {"room_id": "301", "floor": "3F"})
    barrier_free = route.find(graph, corridor_start, {"room_id": "301", "floor": "3F"},
                              avoid_stairs=True)
    assert barrier_free.duration_s >= free.duration_s - 1e-6


def test_방_안에서_출발하면_그_방_문을_먼저_지난다(graph):
    info = graph.floors["2F"]
    centre = info.rooms["201"]["centroid"]
    result = route.find(graph, {"floor": "2F", "x": centre[0], "y": centre[1]},
                        {"room_id": "228", "floor": "2F"})
    assert result.origin["where"] == "room"
    assert result.origin["room_id"] == "201"
    first_door = graph.nodes[result.node_ids[1]]
    assert first_door.kind == "door"
    assert "201" in first_door.connects


def test_삼각부등식_경유하면_더_길거나_같다(graph, corridor_start):
    direct = route.find(graph, corridor_start, {"room_id": "401", "floor": "4F"})
    first = route.find(graph, corridor_start, {"room_id": "301", "floor": "3F"})
    door = graph.nodes[first.destination["door_node"]]
    second = route.find(graph, {"floor": "3F", "x": door.x, "y": door.y},
                        {"room_id": "401", "floor": "4F"})
    assert direct.duration_s <= first.duration_s + second.duration_s + 1e-6


def test_경로가_방_내부를_관통하지_않는다(graph, corridor_start):
    """가장 중요한 검사. 벽을 뚫는 경로는 겉보기에 그럴듯해도 쓸모가 없다.

    복도 폴리곤 이탈로 재지 않는 이유: 복도 문에서 계단실·엘리베이터 홀로
    들어가는 마지막 홉은 복도 밖이 맞다 (계단 박스가 복도에서 1~4.5m 안쪽에
    있다). 실제로 금지해야 하는 것은 "남의 방을 가로지르는 것"이다.
    """
    targets = [("1F", "101"), ("2F", "228"), ("3F", "301"), ("4F", "401"),
               ("5F", "501"), ("6F", "601")]
    checked = 0
    for floor, room_id in targets:
        if room_id not in graph.floors[floor].rooms:
            continue
        result = route.find(graph, corridor_start, {"room_id": room_id, "floor": floor})
        checked += 1
        for leg in result.legs:
            if leg.mode != "walk" or len(leg.points) < 2:
                continue
            line = LineString(leg.points)
            for other_id, other in graph.floors[leg.floor].rooms.items():
                if other_id == room_id:
                    continue          # 목적지 방은 문 앞에서 끝나므로 살짝 닿을 수 있다
                inside = line.intersection(other["polygon"].buffer(-1.0))
                assert inside.length < 2.0, (
                    f"{floor} {room_id} 경로가 {leg.floor} {other_id} 방을 "
                    f"{inside.length:.0f}px 가로지른다"
                )
    assert checked >= 4


def test_경로_거리는_구간_합과_맞는다(graph, corridor_start):
    result = route.find(graph, corridor_start, {"room_id": "401", "floor": "4F"})
    total = sum(leg.distance_m for leg in result.legs)
    assert total == pytest.approx(result.distance_m, rel=0.02)
    assert result.walk_distance_m + result.vertical_m == pytest.approx(
        result.distance_m, rel=1e-6)


def test_소요시간은_보행속도와_층간비용의_합이다(graph, corridor_start):
    result = route.find(graph, corridor_start, {"room_id": "401", "floor": "4F"})
    expected = sum(leg.duration_s for leg in result.legs)
    assert expected == pytest.approx(result.duration_s, rel=0.02)


def test_모든_방에_경로가_난다(graph, corridor_start):
    """도달 불가 방이 새로 생기면 즉시 잡아낸다."""
    failures = []
    for row in route.room_index(graph):
        try:
            route.find(graph, corridor_start,
                       {"room_id": row["room_id"], "floor": row["floor"]})
        except route.RouteError as error:
            failures.append((row["floor"], row["room_id"], str(error)))
    assert not failures, f"경로 실패 {len(failures)}건: {failures[:5]}"


def test_복도에_닿는_문이_있으면_반드시_그_문으로_도착한다(graph, corridor_start):
    """추정 진입점은 복도와 닿는 문이 하나도 없을 때만 나와야 한다."""
    wrong = []
    for row in route.room_index(graph):
        if row["corridor_doors"] == 0:
            continue
        result = route.find(graph, corridor_start,
                            {"room_id": row["room_id"], "floor": row["floor"]})
        if result.destination["kind"] != "door":
            wrong.append((row["floor"], row["room_id"]))
    assert not wrong, f"문이 있는데 추정 진입점을 쓴 방: {wrong[:5]}"


def test_복도_문이_없는_방은_추정_진입점과_경고를_준다(graph, corridor_start):
    rows = [row for row in route.room_index(graph) if row["corridor_doors"] == 0]
    assert rows, "복도 문 없는 방이 하나도 없다면 이 폴백은 죽은 코드다"
    for row in rows:
        result = route.find(graph, corridor_start,
                            {"room_id": row["room_id"], "floor": row["floor"]})
        assert result.destination["kind"] == "estimated"
        assert result.warnings, f"{row['floor']} {row['room_id']} 경고가 없다"


def test_무작위_경로_다수가_복도를_벗어나지_않는다(graph):
    """무작위 질의 회귀 검사.

    각도 기준 경로 단순화를 쓰던 때, 600회 중 4회가 옆방을 최대 2m 가로질렀다.
    대표 경로 몇 개만 보는 검사로는 그걸 못 잡는다.
    """
    import random
    from shapely.geometry import Point

    rng = random.Random(20260827)
    rooms = route.room_index(graph)
    floors = list(graph.floors)

    def corridor_point(floor):
        walkable = graph.floors[floor].walkable
        minx, miny, maxx, maxy = walkable.bounds
        for _ in range(3000):
            point = Point(rng.uniform(minx, maxx), rng.uniform(miny, maxy))
            if walkable.contains(point):
                return point.x, point.y
        point = walkable.representative_point()
        return point.x, point.y

    crossings = []
    for _ in range(120):
        floor = rng.choice(floors)
        x, y = corridor_point(floor)
        target = rng.choice(rooms)
        result = route.find(graph, {"floor": floor, "x": x, "y": y},
                            {"room_id": target["room_id"], "floor": target["floor"]})
        for leg in result.legs:
            if leg.mode != "walk" or len(leg.points) < 2:
                continue
            line = LineString(leg.points)
            for room_id, room in graph.floors[leg.floor].rooms.items():
                if room_id == target["room_id"]:
                    continue
                inside = line.intersection(room["polygon"].buffer(-1.0))
                if inside.length > 2.0:
                    crossings.append(
                        f"{floor}→{target['floor']} {target['room_id']}: "
                        f"{leg.floor} {room_id} 을 {inside.length:.0f}px 가로지름")
    assert not crossings, f"{len(crossings)}건 관통: {crossings[:5]}"


def test_경로점은_각도로_지워지지_않는다(graph, corridor_start):
    """겹치는 점만 빼고, 진짜 꺾임점은 전부 남아야 한다."""
    result = route.find(graph, corridor_start, {"room_id": "401", "floor": "4F"})
    for leg in result.legs:
        if leg.mode != "walk":
            continue
        for index in range(1, len(leg.points)):
            assert math.dist(leg.points[index - 1], leg.points[index]) > 0.5, "중복 점이 남았다"
        line = LineString(leg.points)
        corridor = graph.floors[leg.floor].corridor
        # 문·계단으로 들어가는 마지막 홉을 빼면 경로는 복도 안이다
        body = LineString(leg.points[:-1]) if len(leg.points) > 2 else line
        outside = body.difference(corridor.buffer(1.0))
        assert outside.length < body.length * 0.05, (
            f"{leg.floor} 경로가 복도를 {outside.length:.0f}px 벗어난다")


def test_모르는_방은_친절한_오류를_낸다(graph, corridor_start):
    with pytest.raises(route.RouteError):
        route.find(graph, corridor_start, {"room_id": "없는방", "floor": "1F"})


def test_안내문은_출발과_도착을_모두_담는다(graph, corridor_start):
    result = route.find(graph, corridor_start, {"room_id": "401", "floor": "4F"})
    assert result.steps[0].startswith("출발")
    assert result.steps[-1].startswith("도착")
    assert "401" in result.steps[-1]
    assert any("엘리베이터" in step or "계단" in step for step in result.steps)


def test_결과를_JSON_으로_직렬화할_수_있다(graph, corridor_start):
    import json
    result = route.find(graph, corridor_start, {"room_id": "301", "floor": "3F"})
    text = json.dumps(result.as_dict(), ensure_ascii=False)
    assert "\"legs\"" in text and "301" in text
