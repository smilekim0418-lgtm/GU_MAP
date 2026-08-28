"""실외 구간이 건물을 뚫고 지나가지 않는지 확인한다.

직선으로 재던 시절, 엔진이 고른 문까지의 선이 표본의 55% 에서 건물을
관통했고 최악은 98m 중 60m 였다. "건물 밖에서 155m" 라고 안내하면서
건물을 가로지르는 선을 그리는 건 그냥 거짓말이다.

여기서는 브라우저 엔진이 실제로 내놓는 실외 구간 좌표를 받아 건물 도형과
겹치는지 센다. 거리도 같이 본다 - 돌아가면 반드시 직선보다 길어야 한다.

  python tests/outdoor_detour_check.py
"""
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shapely.geometry import LineString, Point, Polygon  # noqa: E402

from fp import config  # noqa: E402

TOOL_DIR = Path(__file__).resolve().parents[1]
BUNDLE = config.WORK_DIR / "techno_nav.json"

# 건물 안쪽으로 이만큼 파고들면 "관통" 으로 센다. 벽을 스치는 것은 봐준다.
BITE_M = 0.5

NODE_SCRIPT = r"""
const fs = require('fs');
const TechnoRoute = require(process.argv[2]);
const data = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const engine = TechnoRoute.load(data);
const spots = JSON.parse(process.argv[4]);

const rooms = engine.rooms().filter(r => r.corridor_doors > 0);
const targets = rooms.filter((_, i) => i % Math.ceil(rooms.length / 12) === 0).slice(0, 12);

const out = { rows: [], hasGraph: !!engine.outdoorSpace() };
for (const spot of spots) {
  for (const room of targets) {
    try {
      const r = engine.route({ outdoor: true, lat: spot[0], lng: spot[1] },
                             { room_id: room.room_id, floor: room.floor }, {});
      const leg = r.legs[0];
      out.rows.push({
        spot: spot,
        entrance: r.entrance.name,
        entranceLatLng: r.entrance.latlng,
        outdoor_m: r.outdoor_distance_m,
        path: leg.latlngs,
        mode: leg.mode
      });
    } catch (error) { /* 도달 불가는 아래에서 개수로 잡힌다 */ }
  }
}
console.log(JSON.stringify(out));
"""


def main() -> int:
    bundle = json.loads(BUNDLE.read_text(encoding="utf-8"))
    graph = bundle.get("outdoor")
    if not graph:
        print("번들에 실외 그래프가 없다. 05_build_nav.py 를 다시 돌려라")
        return 1

    rings = graph.get("rings") or [graph.get("ring")]
    building = Polygon(rings[0], rings[1:])
    inner = building.buffer(-BITE_M / config.METERS_PER_DEG_LAT)

    centre = building.centroid
    spots = []
    for index in range(24):
        angle = index / 24 * 2 * math.pi
        spots.append([centre.y + 0.00085 * math.cos(angle),
                      centre.x + 0.00110 * math.sin(angle)])
    spots = [s for s in spots if not building.contains(Point(s[1], s[0]))]

    with tempfile.TemporaryDirectory() as raw:
        script = Path(raw) / "check.js"
        script.write_text(NODE_SCRIPT, encoding="utf-8")
        finished = subprocess.run(
            ["node", str(script), str(TOOL_DIR / "techno-route-core.js"),
             str(BUNDLE), json.dumps(spots)],
            capture_output=True, text=True, encoding="utf-8")
    if finished.returncode != 0:
        print(finished.stderr[-1800:])
        return 1
    outcome = json.loads(finished.stdout.strip().splitlines()[-1])

    problems = []
    if not outcome["hasGraph"]:
        problems.append("엔진이 실외 그래프를 못 읽었다")

    print(f"실외 그래프: 모서리 {len(graph['nodes'])} · 변 {len(graph['edges'])} "
          f"· 여유폭 {graph['clearance_m']}m")
    print(f"검사 {len(outcome['rows'])}건 (바깥 {len(spots)}지점 × 목적지 12개)\n")

    crossing = []
    straightish = 0
    ratios = []
    for row in outcome["rows"]:
        path = row["path"]
        if row["mode"] != "outdoor":
            problems.append(f"첫 구간이 실외가 아니다: {row['mode']}")
            continue
        if len(path) < 2:
            problems.append("실외 구간에 좌표가 없다")
            continue

        # 마지막 구간(진입 자리 -> 문)은 당연히 건물 안으로 들어간다.
        # 그게 문으로 들어가는 동작이다. 그 앞까지만 잰다.
        approach = path[:-1]
        if len(approach) < 2:
            continue
        line = LineString([(lon, lat) for lat, lon in approach])
        bite = line.intersection(inner)
        if not bite.is_empty and bite.length > 0:
            crossing.append((bite.length * config.METERS_PER_DEG_LAT,
                             row["entrance"], row["outdoor_m"]))

        straight = _meters(row["spot"][0], row["spot"][1],
                           row["entranceLatLng"][0], row["entranceLatLng"][1])
        if row["outdoor_m"] < straight - 1.0:
            straightish += 1
        ratios.append(row["outdoor_m"] / max(straight, 1e-9))
        if len(path) == 2:
            pass    # 직선으로 갈 수 있는 자리면 꺾이지 않는 게 맞다

    print(f"[관통] 경로가 건물 안으로 {BITE_M}m 넘게 파고든 경우: {len(crossing)}건")
    for length, name, total in sorted(crossing, reverse=True)[:5]:
        print(f"   {name}: {length:.0f}m 관통 (실외 {total:.0f}m)")
    if crossing:
        problems.append(f"실외 구간이 건물을 통과한다: {len(crossing)}건")

    print(f"[거리] 직선보다 짧아진 경우(있으면 버그): {straightish}건")
    if straightish:
        problems.append(f"돌아가는데 직선보다 짧다: {straightish}건")

    ratios.sort()
    if ratios:
        print(f"[우회] 직선 대비 중앙값 {ratios[len(ratios) // 2]:.2f}배 · "
              f"최대 {ratios[-1]:.2f}배")

    bends = [len(r["path"]) - 2 for r in outcome["rows"]]
    print(f"[꺾임] 실외 구간 평균 {sum(bends) / max(len(bends), 1):.1f}회")

    if problems:
        print("\n문제:")
        for problem in problems:
            print(f"  · {problem}")
        return 1
    print("\n실외 우회 확인 통과")
    return 0


def _meters(lat1, lon1, lat2, lon2):
    mid = math.radians((lat1 + lat2) / 2)
    return math.hypot((lat2 - lat1) * config.METERS_PER_DEG_LAT,
                      (lon2 - lon1) * config.METERS_PER_DEG_LON_AT_EQUATOR * math.cos(mid))


if __name__ == "__main__":
    raise SystemExit(main())
