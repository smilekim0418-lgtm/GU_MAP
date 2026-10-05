"""신고된 두 가지를 재현하고 확인한다.

  ① 방 박스를 눌러 나온 팝업의 "🧭 여기까지 길찾기" 가 실제로 길찾기를 한다
  ② 경로 안내가 길어져도 패널이 화면 아래로 잘리지 않는다

  python tests/browser_popup_route_check.py
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright  # noqa: E402

URL = "http://localhost:3000/index.html"
SHOTS = Path(__file__).resolve().parent / "shots"
TECHNO = (36.146643, 128.394348)


def main() -> int:
    problems = []
    SHOTS.mkdir(exist_ok=True)

    with sync_playwright() as play:
        browser = play.chromium.launch()
        page = browser.new_page(viewport={"width": 1500, "height": 900})
        page.on("pageerror", lambda e: problems.append(f"JS 오류: {e}"))

        page.goto(URL, wait_until="load", timeout=60000)
        page.wait_for_function("() => window.map && window.TECHNO_NAV_DATA", timeout=60000)
        page.evaluate("(c) => { window.map.setView([c[0], c[1]], 19); }", list(TECHNO))
        page.wait_for_selector("#techno-route-controls", timeout=30000)
        page.wait_for_timeout(1200)

        # ── ① 출발 위치를 먼저 찍고, 방 팝업 버튼을 누른다
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
                return;
              }
            }
        }""")
        page.wait_for_timeout(400)

        before = page.evaluate("() => !!window.getTechnoRouteResult()")
        print(f"버튼 누르기 전 경로 있음? {before}")

        # 팝업 버튼과 같은 방식으로 호출한다 (실제 onclick 과 동일한 인자)
        target = page.evaluate("""() => {
            const bundle = window.IMDF_TECHNO_DATA;
            const levels = bundle.levels.features;
            const level6 = levels.find(l => (l.properties.short_name['ko-KR']) === '6F');
            const unit = bundle.units.features.find(u =>
                u.properties.level_id === level6.id && u.properties.label &&
                u.properties.label['ko-KR']);
            return { id: unit.id, label: unit.properties.label['ko-KR'] };
        }""")
        print(f"대상 유닛: {target}")

        page.evaluate("(t) => window.routeToTechnoRoom(t.label, t.id)", target)
        page.wait_for_timeout(900)

        outcome = page.evaluate("""() => {
            const r = window.getTechnoRouteResult();
            if (!r) return { error: '결과 없음' };
            if (r.error) return { error: r.error };
            return { room: r.destination.room_id, floor: r.destination.floor,
                     distance_m: r.distance_m, steps: r.steps.length,
                     select: (document.getElementById('tr-dest') || {}).value };
        }""")
        print(f"버튼 클릭 결과: {outcome}")
        if outcome.get("error"):
            problems.append(f"여기까지 길찾기가 동작하지 않는다: {outcome['error']}")
        else:
            if outcome["room"] != target["label"]:
                problems.append(f"목적지가 다르다: {outcome['room']} ≠ {target['label']}")
            if outcome["select"] != f"{outcome['floor']}|{outcome['room']}":
                problems.append(f"목적지 선택이 반영되지 않았다: {outcome['select']}")

        # ── ② 패널이 화면 안에 들어오는지
        box = page.evaluate("""() => {
            const p = document.getElementById('techno-indoor-panel');
            const r = p.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, height: r.height,
                     viewport: window.innerHeight,
                     scrollable: p.scrollHeight > p.clientHeight,
                     overflowY: getComputedStyle(p).overflowY,
                     hiddenBelow: Math.max(0, r.bottom - window.innerHeight) };
        }""")
        print(f"패널: 높이 {box['height']:.0f}px · 아래끝 {box['bottom']:.0f}px · "
              f"뷰포트 {box['viewport']}px · overflowY={box['overflowY']} · "
              f"스크롤필요={box['scrollable']} · 화면밖 {box['hiddenBelow']:.0f}px")
        if box["hiddenBelow"] > 1:
            problems.append(f"패널이 화면 아래로 {box['hiddenBelow']:.0f}px 잘린다")
        if box["scrollable"] and box["overflowY"] not in ("auto", "scroll"):
            problems.append(f"넘치는데 스크롤이 없다 (overflowY={box['overflowY']})")

        # 마지막 안내 단계까지 실제로 도달 가능한지
        reachable = page.evaluate("""() => {
            const box = document.getElementById('techno-route-box');
            const items = box ? box.querySelectorAll('ol li') : [];
            if (!items.length) return { steps: 0 };
            const last = items[items.length - 1];
            last.scrollIntoView({ block: 'nearest' });
            const r = last.getBoundingClientRect();
            return { steps: items.length, lastVisible: r.bottom <= window.innerHeight + 1,
                     text: last.textContent.trim() };
        }""")
        print(f"안내 {reachable.get('steps')}단계 · 마지막 '{reachable.get('text')}' "
              f"보임={reachable.get('lastVisible')}")
        if reachable.get("steps", 0) and not reachable.get("lastVisible"):
            problems.append("스크롤해도 마지막 안내 단계가 화면에 안 들어온다")

        page.screenshot(path=str(SHOTS / "popup-route.png"))
        print(f"스크린샷: {SHOTS / 'popup-route.png'}")
        browser.close()

    if problems:
        print("\n문제:")
        for problem in problems:
            print(f"  · {problem}")
        return 1
    print("\n팝업 길찾기 · 패널 표시 확인 통과")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
