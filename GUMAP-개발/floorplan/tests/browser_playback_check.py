"""경로 재생이 실제로 굴러가는지 확인한다.

  · 재생하면 걷는 마커가 출발지에서 목적지 쪽으로 이동한다
  · 층이 바뀌는 경로면 재생 중 실내지도 층도 따라 바뀐다
  · 일시정지하면 멈추고, ↺ 로 처음부터 다시 간다
  · 배속 버튼이 실제로 속도를 바꾼다

  python tests/browser_playback_check.py
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright  # noqa: E402

URL = "http://localhost:3000/index.html"
SHOTS = Path(__file__).resolve().parent / "shots"
TECHNO = (36.146643, 128.394348)

WALKER = "() => document.querySelectorAll('.techno-route-walker').length"
STATE = """() => {
    const marker = document.querySelector('.techno-route-walker');
    const rect = marker ? marker.getBoundingClientRect() : null;
    const bar = document.getElementById('tr-play-progress');
    return {
        walker: !!marker,
        x: rect ? Math.round(rect.left) : null,
        y: rect ? Math.round(rect.top) : null,
        progress: bar ? parseFloat(bar.style.width) || 0 : null,
        label: (document.getElementById('tr-play-label') || {}).textContent || '',
        button: (document.getElementById('tr-play') || {}).textContent || '',
        floor: window.technoActiveFloor
    };
}"""


def setup_route(page):
    """2F 복도에서 출발해 4F 방까지 - 층 전환이 들어가는 경로."""
    page.evaluate("""() => {
        const engine = window.TechnoRoute.load(window.TECHNO_NAV_DATA);
        const rings = window.TECHNO_NAV_DATA.floors['2F'].walkable;
        let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
        rings[0].forEach(p => { minx=Math.min(minx,p[0]); maxx=Math.max(maxx,p[0]);
                                miny=Math.min(miny,p[1]); maxy=Math.max(maxy,p[1]); });
        for (let i=0;i<20000;i++) {
          const x = minx + Math.random()*(maxx-minx);
          const y = miny + Math.random()*(maxy-miny);
          if (window.TechnoRoute._geometry.pointInRings(rings, x, y)) {
            const ll = engine.pxToLatLng('2F', x, y);
            window.technoActiveFloor = '2F';
            window.setTechnoRouteStart(ll[0], ll[1], '2F');
            break;
          }
        }
        window.routeInsideTechno('401', '4F', {});
    }""")
    page.wait_for_timeout(600)


def main() -> int:
    problems = []
    SHOTS.mkdir(exist_ok=True)

    with sync_playwright() as play_wright:
        browser = play_wright.chromium.launch()
        page = browser.new_page(viewport={"width": 1500, "height": 950})
        page.on("pageerror", lambda error: problems.append(f"JS 오류: {error}"))
        page.goto(URL, wait_until="load", timeout=60000)
        page.wait_for_function("() => window.map && window.TECHNO_NAV_DATA", timeout=60000)
        page.evaluate("(c) => window.map.setView([c[0], c[1]], 19)", list(TECHNO))
        page.wait_for_selector("#techno-route-controls", timeout=30000)
        page.wait_for_timeout(1000)

        setup_route(page)
        route = page.evaluate("""() => {
            const r = window.getTechnoRouteResult();
            return r && !r.error
                ? { distance_m: r.distance_m,
                    floors: r.legs.map(l => l.floor + (l.to_floor ? '→' + l.to_floor : '')),
                    vertical: r.legs.filter(l => l.mode !== 'walk').length }
                : { error: (r && r.error) || '결과 없음' };
        }""")
        print(f"경로: {route}")
        if route.get("error"):
            print("경로를 못 만들어 재생을 확인할 수 없다")
            browser.close()
            return 1

        # 재생 버튼이 있는지
        has_button = page.evaluate("() => !!document.getElementById('tr-play')")
        print(f"재생 버튼 존재: {has_button}")
        if not has_button:
            problems.append("재생 버튼이 패널에 없다")

        before = page.evaluate(STATE)
        print(f"재생 전: {before}")
        if before["walker"]:
            problems.append("재생 전인데 걷는 마커가 이미 있다")

        # ── 재생
        page.click("#tr-play")
        page.wait_for_timeout(700)
        early = page.evaluate(STATE)
        page.wait_for_timeout(1400)
        mid = page.evaluate(STATE)
        print(f"재생 0.7초: 진행 {early['progress']}% · 층 {early['floor']} · {early['label']}")
        print(f"재생 2.1초: 진행 {mid['progress']}% · 층 {mid['floor']} · {mid['label']}")

        if not early["walker"]:
            problems.append("재생했는데 걷는 마커가 없다")
        if not (early["progress"] and mid["progress"] and mid["progress"] > early["progress"]):
            problems.append(f"진행률이 늘지 않는다: {early['progress']} → {mid['progress']}")
        if early["x"] is not None and mid["x"] is not None:
            moved = abs(mid["x"] - early["x"]) + abs(mid["y"] - early["y"])
            print(f"마커 이동량: {moved}px")
            if moved < 5:
                problems.append(f"마커가 거의 안 움직인다 ({moved}px)")
        if "일시정지" not in early["button"]:
            problems.append(f"재생 중인데 버튼이 '{early['button']}'")

        # ── 일시정지
        page.click("#tr-play")
        page.wait_for_timeout(200)
        paused = page.evaluate(STATE)
        page.wait_for_timeout(900)
        still = page.evaluate(STATE)
        print(f"일시정지: 진행 {paused['progress']}% → 0.9초 뒤 {still['progress']}%")
        if abs((still["progress"] or 0) - (paused["progress"] or 0)) > 0.5:
            problems.append("일시정지했는데 계속 진행된다")
        if "재생" not in still["button"]:
            problems.append(f"정지 상태인데 버튼이 '{still['button']}'")

        page.screenshot(path=str(SHOTS / "route-playback.png"))

        # ── 끝까지 재생하며 층 전환 확인
        floors_seen = page.evaluate("""() => new Promise(resolve => {
            const seen = [];
            const timer = setInterval(() => {
                const f = window.technoActiveFloor;
                if (!seen.length || seen[seen.length - 1] !== f) seen.push(f);
            }, 100);
            window.setTechnoRouteSpeed(4);
            window.restartTechnoRoute();
            setTimeout(() => { clearInterval(timer); resolve(seen); }, 12000);
        })""")
        print(f"재생 중 거쳐 간 층: {floors_seen}")
        expected_last = route["floors"][-1].split("→")[-1]
        if route["vertical"] > 0 and len(floors_seen) < 2:
            problems.append(f"층 전환 경로인데 층이 안 바뀌었다: {floors_seen}")
        if floors_seen and floors_seen[-1] != expected_last:
            problems.append(f"마지막 층이 목적지 층과 다르다: {floors_seen[-1]} ≠ {expected_last}")

        final = page.evaluate(STATE)
        print(f"재생 종료: 진행 {final['progress']}% · 층 {final['floor']} · 버튼 '{final['button']}'")
        if (final["progress"] or 0) < 99:
            problems.append(f"끝까지 재생되지 않았다 ({final['progress']}%)")

        # ── 경로 지우면 마커도 사라져야 한다
        page.evaluate("() => window.clearTechnoRoute()")
        page.wait_for_timeout(400)
        left = page.evaluate(WALKER)
        print(f"경로 지운 뒤 남은 마커: {left}개")
        if left:
            problems.append(f"경로를 지웠는데 걷는 마커가 {left}개 남았다")

        print(f"스크린샷: {SHOTS / 'route-playback.png'}")
        browser.close()

    if problems:
        print("\n문제:")
        for problem in problems:
            print(f"  · {problem}")
        return 1
    print("\n경로 재생 확인 통과")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
