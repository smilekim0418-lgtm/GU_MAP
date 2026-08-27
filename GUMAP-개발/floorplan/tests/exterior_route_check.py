"""합성 출입구로 "건물 밖 → 방" 경로를 브라우저 엔진까지 끝단 확인한다.

실제 도면에는 아직 출입구 박스가 없다. 규칙만 정해 두고 나중에 안 되면 늦으니,
합성 출입구를 넣은 번들을 만들어 techno-route-core.js 가 실외 출발지를 받아
가장 가까운 출입구로 들어가는지 지금 확인한다.

  python tests/exterior_route_check.py
"""
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fp import config, georef, nav  # noqa: E402

TOOL_DIR = Path(__file__).resolve().parents[1]


def load_builder():
    spec = importlib.util.spec_from_file_location(
        "build_nav", TOOL_DIR / "05_build_nav.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_work(tmp: Path, floors=("1F", "2F", "3F", "4F")):
    """1F 복도 외곽에 합성 출입구 두 개를 심은 작업본."""
    work = tmp / "work"
    work.mkdir()
    for floor in floors:
        shutil.copy(config.WORK_DIR / f"{floor}_labeled.json",
                    work / f"{floor}_labeled.json")

    path = work / "1F_labeled.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    corridor = next(r for r in data["polygons"] if nav.type_of(r) == "corridor")
    boundary = nav.polygon_of(corridor).exterior

    for name, ratio in (("정문", 0.20), ("후문", 0.65)):
        point = boundary.interpolate(boundary.length * ratio)
        x, y = point.x, point.y
        data["polygons"].append({
            "type": "door",
            "room_id": name,
            "connects": ["복도", "외부"],
            "points": [[x - 6, y - 6], [x + 6, y - 6], [x + 6, y + 6], [x - 6, y + 6]],
            "centroid": [x, y],
        })
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return work


NODE_SCRIPT = r"""
const fs = require('fs');
const TechnoRoute = require(process.argv[2]);
const data = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const engine = TechnoRoute.load(data);

const out = { entrances: engine.entrances(), cases: [] };

// 각 출입구에서 조금 떨어진 바깥 지점을 만들어 출발시킨다
const room = engine.rooms().filter(r => r.floor === '4F' && r.corridor_doors > 0)[0];
out.room = room;

for (const entrance of engine.entrances()) {
  // 출입구에서 남쪽으로 약 40m 떨어진 점
  const lat = entrance.lat - 0.00036;
  const lng = entrance.lon;
  let record;
  try {
    const r = engine.route({ outdoor: true, lat: lat, lng: lng },
                           { room_id: room.room_id, floor: room.floor }, {});
    record = {
      from: entrance.name,
      chosen: r.entrance ? r.entrance.name : null,
      outdoor_m: r.outdoor_distance_m,
      total_m: r.distance_m,
      firstLegMode: r.legs[0].mode,
      firstStep: r.steps[0],
      legs: r.legs.length,
      ok: true
    };
  } catch (error) {
    record = { from: entrance.name, ok: false, error: error.message };
  }
  out.cases.push(record);
}

// 출입구가 없는 번들에서는 친절한 오류가 나야 한다
const bare = JSON.parse(JSON.stringify(data));
bare.entrances = [];
const bareEngine = TechnoRoute.load(bare);
try {
  bareEngine.route({ outdoor: true, lat: 36.145, lng: 128.3925 },
                   { room_id: room.room_id, floor: room.floor }, {});
  out.bare = { threw: false };
} catch (error) {
  out.bare = { threw: true, message: error.message };
}

console.log(JSON.stringify(out));
"""


def main() -> int:
    problems = []
    with tempfile.TemporaryDirectory() as raw:
        tmp = Path(raw)
        work = make_work(tmp)
        transform_data = georef.load()
        graph = nav.build(floors=["1F", "2F", "3F", "4F"], work_dir=work,
                          georef_data=transform_data)
        print(f"합성 그래프: 노드 {len(graph.nodes)} · 출입구 {len(graph.entrances)}")
        if len(graph.entrances) != 2:
            problems.append(f"출입구 2개를 기대했는데 {len(graph.entrances)}개")

        builder = load_builder()
        payload = builder.build_payload(graph, transform_data)
        bundle = tmp / "nav.json"
        bundle.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        print(f"번들 출입구: {[e['name'] for e in payload['entrances']]}")

        script = tmp / "check.js"
        script.write_text(NODE_SCRIPT, encoding="utf-8")
        finished = subprocess.run(
            ["node", str(script), str(TOOL_DIR / "techno-route-core.js"), str(bundle)],
            capture_output=True, text=True, encoding="utf-8")
        if finished.returncode != 0:
            print(finished.stderr[-1500:])
            print("node 실행 실패")
            return 1
        outcome = json.loads(finished.stdout.strip().splitlines()[-1])

    print(f"\n목적지: {outcome['room']['floor']} {outcome['room']['room_id']}")
    for case in outcome["cases"]:
        if not case["ok"]:
            print(f"  {case['from']} 근처 출발 → 실패: {case['error']}")
            problems.append(f"{case['from']} 에서 경로 실패: {case['error']}")
            continue
        print(f"  {case['from']} 근처 출발 → 선택 출입구 {case['chosen']} · "
              f"실외 {case['outdoor_m']:.0f}m · 총 {case['total_m']:.0f}m · "
              f"구간 {case['legs']}개")
        print(f"      첫 안내: {case['firstStep']}")
        if case["chosen"] != case["from"]:
            problems.append(f"{case['from']} 근처인데 {case['chosen']} 을 골랐다")
        if case["firstLegMode"] != "outdoor":
            problems.append(f"첫 구간이 outdoor 가 아니다: {case['firstLegMode']}")
        if not (20 <= case["outdoor_m"] <= 80):
            problems.append(f"실외 거리가 이상하다: {case['outdoor_m']}m")

    print(f"\n출입구 없는 번들: {outcome['bare']}")
    if not outcome["bare"]["threw"]:
        problems.append("출입구가 없는데 오류를 내지 않았다")
    elif "외부" not in outcome["bare"]["message"]:
        problems.append(f"오류 문구가 안내가 되지 않는다: {outcome['bare']['message']}")

    if problems:
        print("\n문제:")
        for problem in problems:
            print(f"  · {problem}")
        return 1
    print("\n출입구 규칙 끝단 확인 통과")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
