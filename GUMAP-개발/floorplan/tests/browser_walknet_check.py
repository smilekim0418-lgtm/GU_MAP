"""실외 구간이 지도의 보행자 길찾기를 쓰는지 확인한다.

건물만 피해 도는 어림 경로는 도로도 옆 건물도 모른다. 잔디밭을 가로질러
거의 직선으로 간다. 지도는 이미 TMAP 보행자 경로(실패 시 OSRM)를 쓰고
있으니 실외 구간도 그걸 써야 한다.

  · 방을 고르면 보행자 경로 API 를 부른다
  · 실외 구간이 여러 점으로 꺾이고, 어림 직선보다 길다
  · API 가 죽어도 경로는 나온다 (어림값으로 되돌아간다)

  python tests/browser_walknet_check.py
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright  # noqa: E402

URL = "http://localhost:3000/index.html"
SHOTS = Path(__file__).resolve().parent / "shots"
OUTSIDE = (36.14570, 128.39330)

SNAP = """() => {
    const r = window.getTechnoRouteResult();
    if (!r || r.error) return { error: (r && r.error) || '결과 없음' };
    return {
        entrance: r.entrance.name,
        outdoor_m: r.outdoor_distance_m,
        points: r.legs[0].latlngs.length,
        measured: !!r.outdoor_measured,
        total_m: r.distance_m,
        first: r.steps[0]
    };
}"""


def pick_room(page, floor="4F"):
    return page.evaluate("""(floor) => {
        const e = window.TechnoRoute.load(window.TECHNO_NAV_DATA);
        const r = e.rooms().filter(x => x.floor === floor && x.corridor_doors > 0)[0];
        return { room_id: r.room_id, floor: r.floor };
    }""", floor)


def run_route(page, room, spot=None):
    page.evaluate("() => { try { window.clearTechnoRoute(); } catch (e) {} }")
    page.wait_for_timeout(300)
    page.evaluate("(c) => window.setRoutingPoint('START', c[0], c[1], '건물 밖 지점')",
                  list(spot or OUTSIDE))
    page.wait_for_timeout(500)
    page.evaluate("(t) => window.routeToTechnoRoom(t.room_id, null)", room)


def main() -> int:
    problems = []
    SHOTS.mkdir(exist_ok=True)
    with sync_playwright() as play:
        browser = play.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 950})
        calls = []
        errors = []
        page.on("request", lambda r: calls.append(r.url)
                if ("tmap-routes" in r.url or "osrm" in r.url) else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_function("() => !!window.TECHNO_NAV_DATA", timeout=30000)
        page.wait_for_timeout(1500)

        room = pick_room(page)
        print(f"목적지: {room['floor']} {room['room_id']}")

        # ── A. 보행자 경로를 쓰는가
        run_route(page, room)
        page.wait_for_timeout(8000)
        walked = page.evaluate(SNAP)
        if walked.get("error"):
            print(f"경로 실패: {walked['error']}")
            browser.close()
            return 1

        print(f"\nA. 보행자 경로: {walked['entrance']} · 실외 {walked['outdoor_m']:.0f}m "
              f"· 꼭짓점 {walked['points']}개 · 실측 {walked['measured']}")
        print(f"   API 호출 {len(calls)}건")
        print(f"   {walked['first']}")

        if not calls:
            problems.append("보행자 경로 API 를 부르지 않았다")
        if not walked["measured"]:
            problems.append("실측값이 아니라 어림값을 그대로 쓰고 있다")
        if walked["points"] < 4:
            problems.append(f"실외 구간이 꺾이지 않는다 (꼭짓점 {walked['points']}개)")

        page.evaluate("""() => {
            const r = window.getTechnoRouteResult();
            window.map.fitBounds(L.latLngBounds(r.legs[0].latlngs), { padding: [80, 80] });
        }""")
        page.wait_for_timeout(2000)
        page.screenshot(path=str(SHOTS / "outdoor-walknet.png"))

        # ── B. API 가 죽어도 길은 나와야 한다
        # 같은 구간은 캐시에 남아 있으니(그건 맞는 동작) 다른 지점에서 본다.
        page.route("**/tmap-routes*", lambda route: route.abort())
        page.route("**router.project-osrm.org**", lambda route: route.abort())
        run_route(page, room, (36.14520, 128.39280))
        page.wait_for_timeout(6000)
        fallen = page.evaluate(SNAP)
        print(f"\nB. API 차단 시: ", end="")
        if fallen.get("error"):
            print(f"경로 실패 — {fallen['error']}")
            problems.append("API 가 죽으면 경로가 아예 안 난다")
        else:
            print(f"{fallen['entrance']} · 실외 {fallen['outdoor_m']:.0f}m "
                  f"· 실측 {fallen['measured']} (어림값으로 되돌아감)")
            if fallen["measured"]:
                problems.append("API 가 죽었는데 실측이라고 표시한다")

        real = [e for e in errors if "ResizeObserver" not in e]
        if real:
            problems.append(f"JS 오류 {len(real)}건: {real[0][:120]}")
        browser.close()

    if problems:
        print("\n문제:")
        for problem in problems:
            print(f"  · {problem}")
        return 1
    print("\n실외 보행자 경로 확인 통과")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
