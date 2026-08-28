"""교차검증용 질의와 파이썬 정답을 만든다.

  python tests/make_cross_check_cases.py
  node   tests/cross_check.js

층·출발위치·목적지를 골고루 섞는다. 복도 출발, 방 안 출발, 같은 층, 여러 층,
계단 회피, 문 없는 방까지 포함한다.
"""
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")

from fp import nav, route  # noqa: E402

OUT = Path(__file__).resolve().parent / "cross_check_cases.json"


def corridor_point(graph, floor, rng):
    """해당 층 복도 안의 무작위 점."""
    minx, miny, maxx, maxy = graph.floors[floor].walkable.bounds
    walkable = graph.floors[floor].walkable
    from shapely.geometry import Point
    for _ in range(500):
        candidate = Point(rng.uniform(minx, maxx), rng.uniform(miny, maxy))
        if walkable.contains(candidate):
            return candidate.x, candidate.y
    point = walkable.representative_point()
    return point.x, point.y


def main() -> int:
    rng = random.Random(20260826)
    graph = nav.build()
    rooms = route.room_index(graph)
    by_floor = {}
    for row in rooms:
        by_floor.setdefault(row["floor"], []).append(row)

    cases = []

    def add(label, start, destination, avoid_stairs=False):
        try:
            result = route.find(graph, start, destination, avoid_stairs=avoid_stairs)
        except route.RouteError as error:
            print(f"건너뜀 {label}: {error}")
            return
        cases.append({
            "label": label,
            "start": {"floor": start["floor"], "x": round(start["x"], 2),
                      "y": round(start["y"], 2)},
            "destination": destination,
            "avoid_stairs": avoid_stairs,
            "expected": {
                "kind": result.destination["kind"],
                "point": result.destination["point"],
                "distance_m": round(result.distance_m, 2),
                "duration_s": round(result.duration_s, 2),
                "vertical": [f"{leg.mode}:{leg.name}" for leg in result.legs
                             if leg.mode != "walk"],
            },
        })

    floors = [f for f in graph.floors]

    # ① 각 층 복도에서 그 층의 방 몇 개로
    for floor in floors:
        start_x, start_y = corridor_point(graph, floor, rng)
        for row in rng.sample(by_floor[floor], min(6, len(by_floor[floor]))):
            add(f"{floor} 복도 → {floor} {row['room_id']}",
                {"floor": floor, "x": start_x, "y": start_y},
                {"room_id": row["room_id"], "floor": row["floor"]})

    # ② 1F 복도에서 모든 층으로 (층간 이동 검증)
    start_x, start_y = corridor_point(graph, "1F", rng)
    for floor in floors:
        for row in rng.sample(by_floor[floor], min(4, len(by_floor[floor]))):
            add(f"1F 복도 → {floor} {row['room_id']}",
                {"floor": "1F", "x": start_x, "y": start_y},
                {"room_id": row["room_id"], "floor": row["floor"]})
            add(f"1F 복도 → {floor} {row['room_id']} (계단회피)",
                {"floor": "1F", "x": start_x, "y": start_y},
                {"room_id": row["room_id"], "floor": row["floor"]},
                avoid_stairs=True)

    # ③ 방 안에서 출발
    for floor in floors:
        for row in rng.sample(by_floor[floor], min(3, len(by_floor[floor]))):
            centre = graph.floors[floor].rooms[row["room_id"]]["centroid"]
            target = rng.choice(by_floor[rng.choice(floors)])
            add(f"{floor} {row['room_id']} 안 → {target['floor']} {target['room_id']}",
                {"floor": floor, "x": centre[0], "y": centre[1]},
                {"room_id": target["room_id"], "floor": target["floor"]})

    # ④ 문 없는 방 (추정 진입점 경로)
    doorless = [row for row in rooms if row["corridor_doors"] == 0]
    for row in doorless:
        start_x, start_y = corridor_point(graph, row["floor"], rng)
        add(f"추정진입점 {row['floor']} {row['room_id']}",
            {"floor": row["floor"], "x": start_x, "y": start_y},
            {"room_id": row["room_id"], "floor": row["floor"]})

    OUT.write_text(json.dumps(cases, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(cases)}건 저장: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
