"""테크노관 실내 경로 탐색.

nav.NavGraph 위에서 다익스트라를 돌린다. 비용은 **초**다. 거리만 쓰면 계단이
항상 이기지만(수직 4m 는 복도 40m 돌아가는 것보다 짧다) 실제로는 계단 한 층이
평지 24m 를 걷는 시간과 비슷하다. 시간으로 재야 "복도 좀 더 걸어서 엘리베이터"
같은 사람이 실제로 하는 선택이 나온다.

거리는 층별 도면 축척(floor_px_per_mm)으로 환산한 실제 미터다.
"""
from __future__ import annotations

import heapq
import math
from dataclasses import dataclass, field

from shapely.geometry import Point

from . import nav

WALK_SPEED_MPS = 1.2          # 실내 평균 보행 속도
STAIR_SECONDS_PER_FLOOR = 20.0
ELEVATOR_WAIT_SECONDS = 25.0
ELEVATOR_SECONDS_PER_FLOOR = 6.0
FLOOR_HEIGHT_M = 4.0

START_ID = "__start__"
GOAL_ID = "__goal__"

# 안내문에서 "직진" 으로 묶는 각도.
TURN_DEGREES = 25.0
UTURN_DEGREES = 140.0


class RouteError(RuntimeError):
    """경로를 만들 수 없다."""


@dataclass
class Leg:
    floor: str
    mode: str                       # walk | stairs | elevator
    points: list[tuple[float, float]] = field(default_factory=list)   # 픽셀
    distance_m: float = 0.0
    duration_s: float = 0.0
    to_floor: str | None = None
    name: str | None = None


@dataclass
class Route:
    ok: bool
    distance_m: float
    walk_distance_m: float
    vertical_m: float
    duration_s: float
    legs: list[Leg]
    steps: list[str]
    destination: dict
    origin: dict
    node_ids: list[str]
    warnings: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "ok": self.ok,
            "distance_m": round(self.distance_m, 1),
            "walk_distance_m": round(self.walk_distance_m, 1),
            "vertical_m": round(self.vertical_m, 1),
            "duration_s": round(self.duration_s, 1),
            "legs": [
                {
                    "floor": leg.floor,
                    "mode": leg.mode,
                    "points": [[round(x, 1), round(y, 1)] for x, y in leg.points],
                    "distance_m": round(leg.distance_m, 1),
                    "duration_s": round(leg.duration_s, 1),
                    "to_floor": leg.to_floor,
                    "name": leg.name,
                }
                for leg in self.legs
            ],
            "steps": self.steps,
            "destination": self.destination,
            "origin": self.origin,
            "warnings": self.warnings,
        }


# ────────────────────────────── 비용 ──────────────────────────────

def floor_gap(graph: nav.NavGraph, a: str, b: str) -> int:
    from . import config
    order = list(config.FLOORS)
    return abs(order.index(a) - order.index(b))


def edge_seconds(graph: nav.NavGraph, source: str, target: str,
                 meters: float, mode: str) -> float:
    if mode == "walk":
        return meters / WALK_SPEED_MPS
    gap = floor_gap(graph, graph.nodes[source].floor, graph.nodes[target].floor)
    if mode == "stair":
        return STAIR_SECONDS_PER_FLOOR * gap
    return ELEVATOR_WAIT_SECONDS + ELEVATOR_SECONDS_PER_FLOOR * gap


# ────────────────────────────── 출발·도착 붙이기 ──────────────────────────────

def _floor_walk_nodes(graph: nav.NavGraph, floor: str) -> list[nav.Node]:
    info = graph.floors[floor]
    # entry(문 없는 방의 추정 진입점)도 복도 위의 점이다. 여기서 빼면 출발점에서
    # 그 진입점이 빤히 보여도 코너를 빙 돌아가는 경로가 나온다.
    return [graph.nodes[node_id] for node_id in info.node_ids
            if graph.nodes[node_id].kind in ("corridor", "access", "entry")]


def locate(graph: nav.NavGraph, floor: str, x: float, y: float) -> dict:
    """점이 어디에 있는지 판정한다. 복도 / 방 / 바깥."""
    if floor not in graph.floors:
        raise RouteError(f"모르는 층: {floor}")
    info = graph.floors[floor]
    point = Point(x, y)
    if info.walkable.contains(point):
        return {"where": "corridor", "x": x, "y": y}
    if info.corridor.contains(point):
        pushed = nav.push_inside(info.walkable, x, y)
        if pushed:
            return {"where": "corridor", "x": pushed[0], "y": pushed[1]}
    for room_id, room in info.rooms.items():
        if room["polygon"].contains(point):
            return {"where": "room", "room_id": room_id, "x": x, "y": y}
    return {"where": "outside", "x": x, "y": y}


def _attach_corridor_point(graph: nav.NavGraph, floor: str, x: float, y: float,
                           node_id: str, extra: dict) -> list[str]:
    """복도 위의 한 점을 가시성으로 그래프에 붙인다. 붙인 노드 id 목록을 준다."""
    info = graph.floors[floor]
    targets = _floor_walk_nodes(graph, floor)
    points = [(node.x, node.y) for node in targets]
    area = nav.visibility_area(info.walkable)
    seen = nav.visible_from((x, y), points, area)
    if not seen:
        # 가시선이 하나도 없으면 그냥 가장 가까운 복도 노드에 붙인다
        if not targets:
            raise RouteError(f"{floor}: 복도 노드가 없다")
        best = min(range(len(targets)), key=lambda k: math.dist((x, y), points[k]))
        seen = [best]
    extra[node_id] = []
    for index in seen:
        meters = info.to_meters(math.dist((x, y), points[index]))
        extra[node_id].append((targets[index].id, meters, "walk"))
    return [targets[index].id for index in seen]


def _attach_start(graph: nav.NavGraph, floor: str, x: float, y: float,
                  extra: dict, warnings: list[str], force_snap: bool = False) -> dict:
    info = graph.floors[floor]
    spot = locate(graph, floor, x, y)

    if spot["where"] == "corridor":
        _attach_corridor_point(graph, floor, spot["x"], spot["y"], START_ID, extra)
        return spot

    if spot["where"] == "room" and not force_snap:
        room_id = spot["room_id"]
        exits = graph.corridor_doors(floor, room_id)
        if not exits:
            entry = graph.entry_of(floor, room_id)
            if entry:
                warnings.append(f"{floor} {room_id} 에 복도 문이 없어 추정 진입점에서 출발한다")
                exits = [entry]
        if exits:
            extra[START_ID] = [
                (node_id,
                 info.to_meters(math.dist((x, y), (graph.nodes[node_id].x,
                                                   graph.nodes[node_id].y))),
                 "walk")
                for node_id in exits
            ]
            return spot
        warnings.append(f"{floor} {room_id} 에서 복도로 나가는 길을 못 찾아 최근접점으로 붙였다")
    elif spot["where"] == "room":
        warnings.append(f"{floor} {spot['room_id']} 의 문으로 못 나가 최근접 복도점으로 붙였다")
    else:
        warnings.append("출발점이 복도·방 어느 쪽도 아니라 가장 가까운 복도로 붙였다")

    landing = _nearest_walkable(info, x, y)
    _attach_corridor_point(graph, floor, landing[0], landing[1], START_ID, extra)
    return {**spot, "snapped_to": [landing[0], landing[1]]}


def _nearest_walkable(info: nav.FloorData, x: float, y: float) -> tuple[float, float]:
    pushed = nav.push_inside(info.walkable, x, y)
    if pushed is None:
        raise RouteError(f"{info.floor}: 복도에 붙일 수 없는 점 ({x}, {y})")
    return pushed


def _goal_doors(graph: nav.NavGraph, floor: str, room_id: str,
                extra: dict, warnings: list[str]) -> dict:
    """목적지 방 → 도착 후보.

    복도에서 바로 들어가는 문이 있으면 그 문들이 후보다 (다익스트라가 그중
    가장 싼 문을 고른다). 없으면 nav 가 미리 구워 둔 추정 진입점을 쓴다.
    """
    info = graph.floors[floor]
    if room_id not in info.rooms:
        raise RouteError(f"{floor} 에 {room_id} 방이 없다")

    doors = graph.corridor_doors(floor, room_id)
    if doors:
        extra[GOAL_ID] = [(door_id, 0.0, "walk") for door_id in doors]
        return {"kind": "door", "candidates": doors}

    entry = graph.entry_of(floor, room_id)
    if entry is None:
        raise RouteError(f"{floor} {room_id} 은 복도와 이어진 진입점이 없다")
    if graph.doors_by_room.get((floor, room_id)):
        warnings.append(f"{floor} {room_id} 의 문은 복도와 닿지 않아 최근접 진입점을 썼다")
    else:
        warnings.append(f"{floor} {room_id} 에 문 박스가 없어 복도 최근접점을 진입점으로 잡았다")
    extra[GOAL_ID] = [(entry, 0.0, "walk")]
    return {"kind": "estimated", "candidates": [entry]}


# ────────────────────────────── 탐색 ──────────────────────────────

def _dijkstra(graph: nav.NavGraph, extra: dict, avoid_stairs: bool) -> tuple[dict, dict]:
    """START_ID 에서 모든 노드까지의 최소 시간과 이전 노드."""
    best = {START_ID: 0.0}
    previous: dict[str, tuple[str, float, str]] = {}
    queue = [(0.0, START_ID)]
    while queue:
        cost, current = heapq.heappop(queue)
        if cost > best.get(current, math.inf) + 1e-9:
            continue
        neighbours = list(graph.adjacency.get(current, ()))
        neighbours += extra.get(current, [])
        for target, meters, mode in neighbours:
            if avoid_stairs and mode == "stair":
                continue
            if target not in graph.nodes and target not in (GOAL_ID, START_ID):
                continue
            seconds = (meters / WALK_SPEED_MPS if mode == "walk"
                       else edge_seconds(graph, current, target, meters, mode))
            candidate = cost + seconds
            if candidate < best.get(target, math.inf) - 1e-9:
                best[target] = candidate
                previous[target] = (current, meters, mode)
                heapq.heappush(queue, (candidate, target))
    return best, previous


def _reverse_extra(extra: dict) -> dict:
    """extra 는 단방향이라 목적지 쪽 엣지를 역방향으로도 넣어 준다."""
    reversed_map: dict[str, list[tuple[str, float, str]]] = {}
    for source, edges in extra.items():
        for target, meters, mode in edges:
            reversed_map.setdefault(target, []).append((source, meters, mode))
    return reversed_map


# ────────────────────────────── 결과 조립 ──────────────────────────────

def _point_of(graph: nav.NavGraph, node_id: str, origin: dict) -> tuple[float, float]:
    if node_id == START_ID:
        return (origin["x"], origin["y"])
    node = graph.nodes[node_id]
    return (node.x, node.y)


def _dedupe(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """겹치는 점만 뺀다. 각도로 중간점을 지우면 안 된다.

    처음엔 "거의 일직선이면 중간점 제거" 를 했는데, 마지막으로 남긴 점 기준으로
    각도를 재다 보니 오차가 누적돼 긴 구간에서 선이 복도를 벗어나 옆방을 최대
    2m 까지 가로질렀다 (무작위 600회 중 4회). 가시성 그래프의 경로는 이미
    반사각 꼭짓점에서만 꺾이므로 중간점이 전부 진짜 꺾임점이다. 지울 것이 없다.

    안내문에서 완만한 굽이를 "직진" 으로 묶는 일은 _build_steps 가 각도 기준
    (TURN_DEGREES) 으로 따로 한다. 그건 글자만 바꿀 뿐 선을 건드리지 않는다.
    """
    if len(points) < 2:
        return points
    out = [points[0]]
    for point in points[1:]:
        if math.dist(out[-1], point) > 0.5:
            out.append(point)
    if len(out) == 1:
        out.append(points[-1])
    return out


def _turn_word(previous: tuple[float, float], current: tuple[float, float],
               following: tuple[float, float]) -> str | None:
    first = (current[0] - previous[0], current[1] - previous[1])
    second = (following[0] - current[0], following[1] - current[1])
    if math.hypot(*first) < 1e-6 or math.hypot(*second) < 1e-6:
        return None
    angle = math.degrees(math.atan2(
        first[0] * second[1] - first[1] * second[0],
        first[0] * second[0] + first[1] * second[1],
    ))
    size = abs(angle)
    if size < TURN_DEGREES:
        return None
    if size >= UTURN_DEGREES:
        return "뒤로 돌아"
    # 도면 픽셀은 y 가 아래로 증가한다. 진행방향 기준 +y 쪽이 걷는 사람의 오른쪽.
    side = "오른쪽" if angle > 0 else "왼쪽"
    shape = "크게 " if size >= 100 else ""
    return f"{shape}{side}으로 꺾어"


def _build_legs(graph: nav.NavGraph, node_ids: list[str], origin: dict,
                previous: dict) -> tuple[list[Leg], float, float]:
    legs: list[Leg] = []
    walk_total = 0.0
    vertical_total = 0.0
    current: Leg | None = None

    for index in range(1, len(node_ids)):
        source, target = node_ids[index - 1], node_ids[index]
        _, meters, mode = previous[target]
        source_point = _point_of(graph, source, origin)
        target_point = _point_of(graph, target, origin)
        floor = graph.nodes[source].floor if source != START_ID else origin["floor"]

        if mode == "walk":
            if current is None or current.mode != "walk" or current.floor != floor:
                current = Leg(floor=floor, mode="walk", points=[source_point])
                legs.append(current)
            current.points.append(target_point)
            current.distance_m += meters
            current.duration_s += meters / WALK_SPEED_MPS
            walk_total += meters
        else:
            to_floor = graph.nodes[target].floor
            gap = floor_gap(graph, floor, to_floor)
            seconds = edge_seconds(graph, source, target, meters, mode)
            kind = "stairs" if mode == "stair" else "elevator"
            name = graph.nodes[source].ref
            # 1F→2F→3F 처럼 같은 계단을 연달아 타면 한 구간으로 합친다.
            if legs and legs[-1].mode == kind and legs[-1].name == name \
                    and legs[-1].to_floor == floor:
                legs[-1].to_floor = to_floor
                legs[-1].distance_m += FLOOR_HEIGHT_M * gap
                legs[-1].duration_s += seconds
                legs[-1].points[-1] = target_point
            else:
                legs.append(Leg(
                    floor=floor, mode=kind,
                    points=[source_point, target_point],
                    distance_m=FLOOR_HEIGHT_M * gap,
                    duration_s=seconds,
                    to_floor=to_floor, name=name,
                ))
            vertical_total += FLOOR_HEIGHT_M * gap
            current = None

    for leg in legs:
        if leg.mode == "walk":
            leg.points = _dedupe(leg.points)
    return legs, walk_total, vertical_total


def _build_steps(legs: list[Leg], destination: dict, origin: dict) -> list[str]:
    steps = [f"출발 · {origin['floor']} " +
             ("복도" if origin.get("where") == "corridor"
              else f"{origin.get('room_id', '지정 위치')}")]
    for leg in legs:
        if leg.mode == "walk":
            points = leg.points
            if len(points) < 2:
                continue
            scale = leg.distance_m / max(_polyline_length(points), 1e-9)
            run = 0.0
            for index in range(1, len(points)):
                run += math.dist(points[index - 1], points[index]) * scale
                if index == len(points) - 1:
                    break
                word = _turn_word(points[index - 1], points[index], points[index + 1])
                if word:
                    steps.append(f"{run:.0f}m 직진 후 {word}")
                    run = 0.0
            if run > 0.5:
                steps.append(f"{run:.0f}m 직진")
        elif leg.mode == "stairs":
            # 이름이 '계단-B' 도 되고 'EV-1' 도 되므로 조사(로/으로)가 붙는 표현은
            # 피한다. 받침 유무를 따지느니 · 로 끊는 편이 안전하고 읽기도 낫다.
            steps.append(f"{leg.name} 계단 이용 · {leg.floor} → {leg.to_floor}")
        else:
            steps.append(f"{leg.name} 엘리베이터 이용 · {leg.floor} → {leg.to_floor}")
    steps.append(f"도착 · {destination['floor']} {destination['room_id']} 문 앞")
    return steps


def _polyline_length(points: list[tuple[float, float]]) -> float:
    return sum(math.dist(points[i - 1], points[i]) for i in range(1, len(points)))


# ────────────────────────────── 공개 API ──────────────────────────────

def find(graph: nav.NavGraph, start: dict, destination: dict,
         avoid_stairs: bool = False) -> Route:
    """경로를 찾는다.

    start:       {"floor": "1F", "x": 1200, "y": 2400}
    destination: {"room_id": "301", "floor": "3F"}   floor 는 생략 가능
    """
    warnings: list[str] = []
    start_floor = start.get("floor")
    if start_floor not in graph.floors:
        raise RouteError(f"모르는 출발 층: {start_floor}")

    room_id = destination.get("room_id")
    if not room_id:
        raise RouteError("목적지 room_id 가 없다")
    goal_floor = destination.get("floor") or _floor_of_room(graph, room_id)

    # 출발점 붙이기가 실패할 수 있는 유일한 경우는 "방 안인데 그 방에서 복도로
    # 나가는 길이 그래프에 없다" 다. 그때는 복도 최근접점으로 스냅해 한 번 더 본다.
    for force_start_snap in (False, True):
        extra: dict[str, list[tuple[str, float, str]]] = {}
        origin = _attach_start(graph, start_floor, float(start["x"]), float(start["y"]),
                               extra, warnings, force_snap=force_start_snap)
        origin["floor"] = start_floor
        target = _goal_doors(graph, goal_floor, room_id, extra, warnings)

        search_extra = {key: list(value) for key, value in extra.items()}
        for node_id, edges in _reverse_extra(extra).items():
            search_extra.setdefault(node_id, []).extend(edges)

        best, previous = _dijkstra(graph, search_extra, avoid_stairs)
        if GOAL_ID in best:
            break
    else:
        hint = " (계단 회피 옵션 때문일 수 있다)" if avoid_stairs else ""
        raise RouteError(f"{goal_floor} {room_id} 까지 가는 길이 없다{hint}")

    chain: list[str] = [GOAL_ID]
    while chain[-1] != START_ID:
        chain.append(previous[chain[-1]][0])
    chain.reverse()
    node_ids = [node_id for node_id in chain if node_id != GOAL_ID]

    legs, walk_total, vertical_total = _build_legs(graph, node_ids, origin, previous)
    arrival = graph.nodes[node_ids[-1]]
    destination_info = {
        "room_id": room_id,
        "floor": goal_floor,
        "kind": target["kind"],
        "door_node": arrival.id,
        "point": [round(arrival.x, 1), round(arrival.y, 1)],
    }
    steps = _build_steps(legs, destination_info, origin)

    return Route(
        ok=True,
        distance_m=walk_total + vertical_total,
        walk_distance_m=walk_total,
        vertical_m=vertical_total,
        duration_s=best[GOAL_ID],
        legs=legs,
        steps=steps,
        destination=destination_info,
        origin=origin,
        node_ids=node_ids,
        warnings=list(dict.fromkeys(warnings + graph.warnings)),
    )


def _floor_of_room(graph: nav.NavGraph, room_id: str) -> str:
    found = [floor for floor, info in graph.floors.items() if room_id in info.rooms]
    if not found:
        raise RouteError(f"{room_id} 방을 찾을 수 없다")
    if len(found) > 1:
        raise RouteError(f"{room_id} 이 여러 층에 있다 ({', '.join(found)}). floor 를 지정하라")
    return found[0]


def room_index(graph: nav.NavGraph) -> list[dict]:
    """목적지 선택용 방 목록."""
    rows = []
    for floor, info in graph.floors.items():
        for room_id, room in sorted(info.rooms.items()):
            doors = graph.doors_by_room.get((floor, room_id), [])
            # 복도와 닿는 문이 하나도 없는 방은 옆방을 통해서만 들어간다.
            # 그런 방은 도착점이 문 중앙이 아니라 추정 진입점이 된다.
            corridor_doors = [
                door_id for door_id in doors
                if nav.CORRIDOR_LABEL in graph.nodes[door_id].connects
            ]
            rows.append({
                "floor": floor,
                "room_id": room_id,
                "centroid": [round(room["centroid"][0], 1), round(room["centroid"][1], 1)],
                "doors": len(doors),
                "corridor_doors": len(corridor_doors),
            })
    return rows
