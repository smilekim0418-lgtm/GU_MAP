"""건물 밖에서 출발했는데 실외 구간이 통째로 빠지는지 확인한다.

신고 내용: 밖에서 출발지를 잡고 테크노관 안을 목적지로 하면, 실외 구간을
건너뛰고 테크노관 문에서부터 경로가 시작된다.

들어오는 문이 두 갈래인데 한쪽만 실외 구간을 잇고 있었다.

  D. "여기까지 길찾기" → "출발 위치를 눌러 주세요" → 지도의 건물 **밖** 을 클릭
  E. 건물 밖에서 출발지를 잡은 뒤, 실내 패널의 목적지 칸에서 골라 "길찾기"

  python tests/browser_outdoor_pick_check.py
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright  # noqa: E402

URL = "http://localhost:3000/index.html"
SHOTS = Path(__file__).resolve().parent / "shots"
TECHNO = (36.146643, 128.394348)
OUTSIDE = (36.1450, 128.3925)      # 테크노관 남서쪽 바깥


def target_room(page, floor="4F"):
    return page.evaluate("""(floor) => {
        const engine = window.TechnoRoute.load(window.TECHNO_NAV_DATA);
        const rooms = engine.rooms().filter(
            r => r.floor === floor && r.corridor_doors > 0);
        const target = rooms[0];
        const bundle = window.IMDF_TECHNO_DATA;
        const level = bundle.levels.features.find(
            l => l.properties.short_name['ko-KR'] === floor);
        const unit = bundle.units.features.find(u =>
            u.properties.level_id === level.id && u.properties.label &&
            u.properties.label['ko-KR'] === target.room_id);
        return { id: unit ? unit.id : null, label: target.room_id };
    }""", floor)


def summary(page):
    return page.evaluate("""() => {
        const r = window.getTechnoRouteResult();
        if (!r || r.error) return { error: (r && r.error) || '결과 없음' };
        return {
            room: r.destination.room_id,
            firstLeg: r.legs[0].mode,
            firstStep: r.steps[0],
            entrance: r.entrance ? r.entrance.name : null,
            outdoor_m: r.outdoor_distance_m || 0,
            outdoorLatLngs: (r.legs[0].latlngs || []).length
        };
    }""")


def check(label, got, room, problems):
    if got.get("error"):
        problems.append(f"{label}: 경로가 없다 — {got['error']}")
        return
    print(f"   → {got['entrance']} 로 진입 · 실외 {got['outdoor_m']:.0f}m · "
          f"첫 구간 {got['firstLeg']}")
    print(f"   → 첫 안내: {got['firstStep']}")
    if got["room"] != room["label"]:
        problems.append(f"{label}: 목적지가 다르다 — {got['room']}")
    if got["firstLeg"] != "outdoor":
        problems.append(f"{label}: 실외 구간이 빠졌다 (첫 구간 {got['firstLeg']})")
    if not got["entrance"]:
        problems.append(f"{label}: 어느 출입구로 들어갔는지 알려주지 않는다")
    if got["outdoorLatLngs"] < 2:
        problems.append(f"{label}: 실외 구간이 지도에 그릴 좌표를 갖고 있지 않다")


def main() -> int:
    problems = []
    SHOTS.mkdir(exist_ok=True)

    with sync_playwright() as play:
        browser = play.chromium.launch()
        page = browser.new_page(viewport={"width": 1500, "height": 950})
        page.on("pageerror", lambda error: problems.append(f"JS 오류: {error}"))
        page.goto(URL, wait_until="load", timeout=60000)
        page.wait_for_function("() => window.map && window.TECHNO_NAV_DATA", timeout=60000)
        page.evaluate("(c) => { window.map.setView([c[0], c[1]], 19); }", list(TECHNO))
        page.wait_for_selector("#techno-route-controls", timeout=30000)
        page.wait_for_timeout(1200)

        room = target_room(page, "4F")
        print(f"목적지: 4F {room['label']}")

        # ── D. 목적지 먼저 → 지도의 건물 밖을 클릭해 출발지 지정
        page.evaluate("() => window.clearTechnoRoute()")
        page.wait_for_timeout(300)
        page.evaluate("(t) => window.routeToTechnoRoom(t.label, t.id)", room)
        page.wait_for_timeout(400)
        picking = page.evaluate("() => window.isTechnoRoutePicking()")
        print(f"\nD. 출발지 찍기 대기: {picking}")
        if not picking:
            problems.append("D: 출발지를 찍으라고 하지 않는다")
        page.evaluate("(c) => { window.map.fire('click', { latlng: L.latLng(c[0], c[1]) }); }",
                      list(OUTSIDE))
        page.wait_for_timeout(1500)
        where = page.evaluate("() => (window.getTechnoRouteStart() || {}).where")
        print(f"   건물 밖 클릭 → 출발점 분류: {where}")
        if where != "outdoor":
            problems.append(f"D: 건물 밖을 눌렀는데 실외 출발지가 아니다 ({where})")
        check("D", summary(page), room, problems)
        page.screenshot(path=str(SHOTS / "outdoor-pick-D.png"))

        # ── E. 밖에서 출발지 → 실내 패널 목적지 칸에서 골라 "길찾기"
        page.evaluate("() => window.clearTechnoRoute()")
        page.wait_for_timeout(300)
        page.evaluate("(c) => window.setRoutingPoint('START', c[0], c[1], '건물 밖 지점')",
                      list(OUTSIDE))
        page.wait_for_timeout(700)
        picked = page.evaluate("""(label) => {
            const select = document.getElementById('tr-dest');
            const option = Array.from(select.options).find(
                o => o.value.endsWith('|' + label));
            if (!option) return null;
            select.value = option.value;
            return option.value;
        }""", room["label"])
        print(f"\nE. 패널 목적지 선택: {picked}")
        if not picked:
            problems.append("E: 목적지 칸에서 방을 못 고른다")
        page.evaluate("() => document.getElementById('tr-go').click()")
        page.wait_for_timeout(1500)
        check("E", summary(page), room, problems)
        page.screenshot(path=str(SHOTS / "outdoor-pick-E.png"))

        browser.close()

    if problems:
        print("\n문제:")
        for problem in problems:
            print(f"  · {problem}")
        return 1
    print("\n건물 밖 출발 확인 통과")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
