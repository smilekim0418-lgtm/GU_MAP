"""에디터 길찾기 모드를 실제 브라우저에서 눌러 본다.

serve_editor.py 가 8790 에 떠 있어야 한다.

  python tests/browser_route_check.py
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from playwright.sync_api import sync_playwright  # noqa: E402

URL = "http://localhost:8790/floorplan-editor.html"
SHOTS = Path(__file__).resolve().parent / "shots"


def main() -> int:
    SHOTS.mkdir(exist_ok=True)
    problems: list[str] = []

    with sync_playwright() as play:
        browser = play.chromium.launch()
        page = browser.new_page(viewport={"width": 1600, "height": 950})
        page.on("pageerror", lambda error: problems.append(f"JS 오류: {error}"))
        page.on("console", lambda message: problems.append(f"콘솔 {message.type}: {message.text}")
                if message.type == "error" else None)

        page.goto(URL)
        page.wait_for_function("() => typeof TechnoRoute !== 'undefined' "
                               "&& typeof routeState !== 'undefined' && routeState.engine",
                               timeout=20000)
        page.wait_for_timeout(800)

        counts = page.evaluate("""() => ({
            floors: routeState.engine.floors(),
            rooms: routeState.engine.rooms().length,
            nodes: routeState.engine.nodes.length,
            options: document.getElementById('routeDest').options.length
        })""")
        print(f"엔진 로드: 층 {len(counts['floors'])} · 방 {counts['rooms']} · "
              f"노드 {counts['nodes']} · 목적지 옵션 {counts['options']}")
        if counts["rooms"] < 300:
            problems.append(f"방 목록이 너무 적다: {counts['rooms']}")

        # 길찾기 모드 켜기
        page.click("#routeMode")
        page.wait_for_timeout(200)
        if "on" not in (page.get_attribute("#routeMode", "class") or ""):
            problems.append("길찾기 버튼이 켜지지 않았다")

        scenarios = [
            ("2F 복도 → 2F 228", "2F", "2F|228"),
            ("2F 복도 → 4F 401", "2F", "4F|401"),
            ("2F 복도 → B1F 방", "2F", None),
            ("2F 복도 → 6F 방", "2F", None),
        ]
        results = []
        for label, floor, dest in scenarios:
            if dest is None:
                target = "B1F" if "B1F" in label else "6F"
                dest = page.evaluate(
                    "(f) => { const r = routeState.engine.rooms()"
                    ".filter(x => x.floor === f && x.corridor_doors > 0)[0];"
                    " return r ? f + '|' + r.room_id : null; }", target)
                if not dest:
                    continue
                label = f"2F 복도 → {dest.replace('|', ' ')}"

            # 그 층 복도 안의 한 점을 골라 출발점으로 찍는다
            page.evaluate("""(floor) => {
                document.getElementById('floor').value = floor;
                return loadFloor(floor);
            }""", floor)
            page.wait_for_timeout(600)
            picked = page.evaluate("""(floor) => {
                const rings = routeState.engine.data.floors[floor].walkable;
                const ext = rings[0];
                let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
                ext.forEach(p => { minx=Math.min(minx,p[0]); maxx=Math.max(maxx,p[0]);
                                   miny=Math.min(miny,p[1]); maxy=Math.max(maxy,p[1]); });
                for (let i=0;i<8000;i++) {
                  const x = minx + Math.random()*(maxx-minx);
                  const y = miny + Math.random()*(maxy-miny);
                  if (TechnoRoute._geometry.pointInRings(rings, x, y)) return [x, y];
                }
                return null;
            }""", floor)
            if not picked:
                problems.append(f"{label}: 복도 점을 못 찾았다")
                continue

            page.select_option("#routeDest", dest)
            page.evaluate("(pt) => setRouteStart(pt[0], pt[1])", picked)
            page.wait_for_timeout(400)

            summary = page.evaluate("""() => {
                const r = routeState.result;
                if (!r) return {error: '결과 없음'};
                if (r.error) return {error: r.error};
                return {
                    distance_m: r.distance_m, duration_s: r.duration_s,
                    elapsed_ms: r.elapsed_ms, legs: r.legs.length,
                    vertical: r.legs.filter(l => l.mode !== 'walk')
                                    .map(l => l.mode + ':' + l.name),
                    steps: r.steps, kind: r.destination.kind,
                    warnings: r.warnings,
                    drawn: routeState.layers.length
                };
            }""")
            if summary.get("error"):
                problems.append(f"{label}: {summary['error']}")
                continue
            results.append((label, summary))
            print(f"\n▸ {label}")
            print(f"   {summary['distance_m']:.0f}m · {summary['duration_s']:.0f}초 · "
                  f"{summary['elapsed_ms']:.1f}ms · 구간 {summary['legs']}개 · "
                  f"지도 레이어 {summary['drawn']}개")
            print(f"   층간: {summary['vertical'] or '없음'}")
            for step in summary["steps"]:
                print(f"     - {step}")
            if summary["warnings"]:
                print(f"   ⚠ {summary['warnings']}")
            if summary["drawn"] == 0:
                problems.append(f"{label}: 지도에 아무것도 안 그려졌다")
            if summary["distance_m"] <= 0:
                problems.append(f"{label}: 거리가 0 이다")

        # 계단 회피 비교
        page.check("#routeAvoid")
        page.wait_for_timeout(400)
        avoid = page.evaluate("""() => {
            const r = routeState.result;
            return r && !r.error
              ? { duration_s: r.duration_s,
                  stairs: r.legs.filter(l => l.mode === 'stairs').length }
              : { error: (r && r.error) || '결과 없음' };
        }""")
        print(f"\n▸ 계단 회피: {json.dumps(avoid, ensure_ascii=False)}")
        if avoid.get("stairs"):
            problems.append("계단 회피를 켰는데 계단 구간이 남아 있다")

        page.screenshot(path=str(SHOTS / "route-editor.png"), full_page=False)
        print(f"\n스크린샷: {SHOTS / 'route-editor.png'}")
        browser.close()

    if problems:
        print("\n문제:")
        for problem in problems:
            print(f"  · {problem}")
        return 1
    print("\n브라우저 검증 통과")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
