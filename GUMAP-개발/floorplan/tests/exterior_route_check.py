"""실제 출입구로 "건물 밖 → 방" 경로를 브라우저 엔진까지 끝단 확인한다.

핵심은 "어느 문으로 들어가는가" 다. 엔진은 출입구 전부를 출발 후보로 깔고
탐색이 고르게 한다. 그게 정말 최적인지 확인하려면 믿지 말고 세어 봐야 한다.
그래서 출입구를 하나만 남긴 엔진으로 전수 비교해 argmin 과 맞는지 본다.

  python tests/exterior_route_check.py
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fp import config  # noqa: E402

TOOL_DIR = Path(__file__).resolve().parents[1]
BUNDLE = config.WORK_DIR / "techno_nav.json"

NODE_SCRIPT = r"""
const fs = require('fs');
const TechnoRoute = require(process.argv[2]);
const data = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const engine = TechnoRoute.load(data);
const all = engine.entrances().slice();

// 건물을 둘러싼 바깥 지점들. 한 문 앞에만 서 보면 차이가 안 드러난다.
const lats = all.map(e => e.lat), lons = all.map(e => e.lon);
const clat = (Math.min(...lats) + Math.max(...lats)) / 2;
const clon = (Math.min(...lons) + Math.max(...lons)) / 2;
const spots = [];
for (let k = 0; k < 12; k++) {
  const a = k / 12 * 2 * Math.PI;
  spots.push([clat + 0.00075 * Math.cos(a), clon + 0.00092 * Math.sin(a)]);
}
// 각 출입구 코앞도 섞는다 (겹쳐 있는 B1F/1F 문이 문제를 일으키는 자리)
all.forEach(e => spots.push([e.lat - 0.00012, e.lon]));

const rooms = engine.rooms().filter(r => r.corridor_doors > 0);
const pick = n => rooms.filter((_, i) => i % Math.ceil(rooms.length / n) === 0).slice(0, n);
const targets = pick(24);

function routeVia(entrance, spot, room) {
  engine.data.entrances = entrance ? [entrance] : all;
  try {
    return engine.route({ outdoor: true, lat: spot[0], lng: spot[1] },
                        { room_id: room.room_id, floor: room.floor }, {});
  } catch (error) {
    return null;
  } finally {
    engine.data.entrances = all;
  }
}

const out = { entrances: all, checked: 0, mismatch: [], accounting: [], spread: [] };

for (const spot of spots) {
  for (const room of targets) {
    const got = routeVia(null, spot, room);
    if (!got) continue;
    out.checked++;

    // 전수 비교: 출입구를 하나만 남긴 엔진으로 각각 재본다
    let best = null;
    for (const entrance of all) {
      const one = routeVia(entrance, spot, room);
      if (one && (!best || one.duration_s < best.duration_s - 1e-6)) {
        best = { name: entrance.name, duration_s: one.duration_s };
      }
    }
    if (!best) continue;
    if (got.duration_s > best.duration_s + 1e-6) {
      out.mismatch.push({
        spot: spot, room: room.floor + ' ' + room.room_id,
        chose: got.entrance.name, chose_s: got.duration_s,
        best: best.name, best_s: best.duration_s
      });
    }

    // 합계 장부: 구간 합 == 총계 (실외 구간을 두 번 세지 않았는가)
    const legSeconds = got.legs.reduce((a, l) => a + l.duration_s, 0);
    const legMeters = got.legs.reduce((a, l) => a + l.distance_m, 0);
    if (Math.abs(legSeconds - got.duration_s) > 0.05 ||
        Math.abs(legMeters - got.distance_m) > 0.05) {
      out.accounting.push({
        room: room.floor + ' ' + room.room_id,
        legs_s: legSeconds, total_s: got.duration_s,
        legs_m: legMeters, total_m: got.distance_m
      });
    }
    if (got.legs[0].mode !== 'outdoor') {
      out.accounting.push({ room: room.room_id, firstLeg: got.legs[0].mode });
    }

    // 가까운 문만 고르는 옛 방식이었다면 얼마나 손해였나
    let nearest = all[0], nearD = Infinity;
    for (const e of all) {
      const d = engine.metersBetween(spot[0], spot[1], e.lat, e.lon);
      if (d < nearD) { nearD = d; nearest = e; }
    }
    const near = routeVia(nearest, spot, room);
    if (near) out.spread.push(near.duration_s - got.duration_s);
  }
}

// 출입구가 없는 번들에서는 친절한 오류가 나야 한다
const bare = TechnoRoute.load(Object.assign({}, data, { entrances: [] }));
try {
  bare.route({ outdoor: true, lat: 36.1465, lng: 128.3942 },
             { room_id: targets[0].room_id, floor: targets[0].floor }, {});
  out.bare = { threw: false };
} catch (error) {
  out.bare = { threw: true, message: error.message };
}

const sample = routeVia(null, spots[0], targets[0]);
out.sample = { steps: sample.steps.slice(0, 3), entrance: sample.entrance,
               outdoor_m: sample.outdoor_distance_m, total_m: sample.distance_m };

console.log(JSON.stringify(out));
"""


def main() -> int:
    if not BUNDLE.exists():
        print("work/techno_nav.json 이 없다. 05_build_nav.py 를 먼저 돌려라")
        return 1

    problems = []
    with tempfile.TemporaryDirectory() as raw:
        script = Path(raw) / "check.js"
        script.write_text(NODE_SCRIPT, encoding="utf-8")
        finished = subprocess.run(
            ["node", str(script), str(TOOL_DIR / "techno-route-core.js"), str(BUNDLE)],
            capture_output=True, text=True, encoding="utf-8")
    if finished.returncode != 0:
        print(finished.stderr[-2000:])
        print("node 실행 실패")
        return 1
    outcome = json.loads(finished.stdout.strip().splitlines()[-1])

    entrances = outcome["entrances"]
    print(f"출입구 {len(entrances)}개: "
          + ", ".join(f"{e['name']}({e['floor']})" for e in entrances))
    if not entrances:
        problems.append("실제 데이터에 출입구가 하나도 없다")

    print(f"\n확인한 조합 {outcome['checked']}건 (바깥 지점 × 목적지)")

    print(f"\n[문 선택] 전수 비교와 어긋난 경우: {len(outcome['mismatch'])}건")
    for row in outcome["mismatch"][:5]:
        print(f"  · {row['room']}: {row['chose']}({row['chose_s']:.0f}초) 대신 "
              f"{row['best']}({row['best_s']:.0f}초) 가 나았다")
    if outcome["mismatch"]:
        problems.append(f"최적이 아닌 문을 고른 경우 {len(outcome['mismatch'])}건")

    print(f"[합계 장부] 구간 합과 총계가 어긋난 경우: {len(outcome['accounting'])}건")
    for row in outcome["accounting"][:5]:
        print(f"  · {row}")
    if outcome["accounting"]:
        problems.append(f"거리·시간 합계가 맞지 않는 경우 {len(outcome['accounting'])}건")

    spread = sorted(outcome["spread"])
    if spread:
        worse = [v for v in spread if v > 5]
        print(f"\n[개선 폭] 옛 방식(가장 가까운 문) 대비: "
              f"중앙값 {spread[len(spread) // 2]:.0f}초 · 최대 {spread[-1]:.0f}초 단축 "
              f"({len(worse)}/{len(spread)} 건에서 5초 이상)")
        if spread[0] < -1e-6:
            problems.append(f"옛 방식이 더 빠른 경우가 있다: {spread[0]:.1f}초")

    print(f"\n[안내문 예시] {outcome['sample']['entrance']['name']} · "
          f"실외 {outcome['sample']['outdoor_m']:.0f}m · 총 {outcome['sample']['total_m']:.0f}m")
    for step in outcome["sample"]["steps"]:
        print(f"  {step}")
    if not outcome["sample"]["steps"][0].startswith("건물 밖에서"):
        problems.append(f"첫 안내가 실외 진입이 아니다: {outcome['sample']['steps'][0]}")

    print(f"\n[출입구 없는 번들] {outcome['bare']}")
    if not outcome["bare"]["threw"]:
        problems.append("출입구가 없는데 오류를 내지 않았다")
    elif "외부" not in outcome["bare"]["message"]:
        problems.append(f"오류 문구가 안내가 되지 않는다: {outcome['bare']['message']}")

    if problems:
        print("\n문제:")
        for problem in problems:
            print(f"  · {problem}")
        return 1
    print("\n출입구 경로 끝단 확인 통과")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
