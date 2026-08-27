"""실외 출발지와 실내 길찾기가 하나로 이어지는지 확인한다.

신고 내용: 허공을 눌러 출발지를 잡고 방 박스에서 "여기까지 길찾기" 를 눌러도
따로 놀아서 아무 일이 없었다.

  A. 건물 **안** 을 눌러 출발지 지정 → 여기까지 길찾기 → 실내 경로가 나온다
  B. 건물 **밖** 을 눌러 출발지 지정 → 여기까지 길찾기 → 실내 경로는 못 만들되
     조용히 실패하지 말고 이유를 말하고 실외 도착지를 잡는다
  C. 실내 패널에서 출발점을 찍으면 실외 출발지 칸도 같은 곳을 가리킨다

  python tests/browser_unified_start_check.py
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
    """그래프에 실제로 있는 방을 고른다. 층의 첫 라벨 유닛은 '복도' 일 수 있다."""
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


def indoor_point(page, floor="2F"):
    """해당 층 복도 안의 실제 위경도."""
    return page.evaluate("""(floor) => {
        const engine = window.TechnoRoute.load(window.TECHNO_NAV_DATA);
        const rings = window.TECHNO_NAV_DATA.floors[floor].walkable;
        let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
        rings[0].forEach(p => { minx=Math.min(minx,p[0]); maxx=Math.max(maxx,p[0]);
                                miny=Math.min(miny,p[1]); maxy=Math.max(maxy,p[1]); });
        for (let i=0;i<20000;i++) {
          const x = minx + Math.random()*(maxx-minx);
          const y = miny + Math.random()*(maxy-miny);
          if (window.TechnoRoute._geometry.pointInRings(rings, x, y)) {
            return engine.pxToLatLng(floor, x, y);
          }
        }
        return null;
    }""", floor)


def main() -> int:
    problems = []
    SHOTS.mkdir(exist_ok=True)

    with sync_playwright() as play:
        browser = play.chromium.launch()
        page = browser.new_page(viewport={"width": 1500, "height": 950})
        page.on("pageerror", lambda error: problems.append(f"JS 오류: {error}"))
        page.goto(URL, wait_until="load", timeout=60000)
        page.wait_for_function("() => window.map && window.TECHNO_NAV_DATA", timeout=60000)
        page.evaluate("(c) => window.map.setView([c[0], c[1]], 19)", list(TECHNO))
        page.wait_for_selector("#techno-route-controls", timeout=30000)
        page.wait_for_timeout(1200)

        wrapped = page.evaluate("() => !!(window.setRoutingPoint || {}).__gumapWrapped")
        print(f"setRoutingPoint 연결됨: {wrapped}")
        if not wrapped:
            problems.append("setRoutingPoint 가 실내 모듈과 연결되지 않았다")

        room = target_room(page, "4F")
        print(f"목적지: 4F {room['label']}")

        # ── A. 건물 안에서 출발지 지정 → 여기까지 길찾기
        page.evaluate("() => window.clearTechnoRoute()")
        page.evaluate("() => { window.technoActiveFloor = '2F'; }")
        inside = indoor_point(page, "2F")
        page.evaluate("(c) => window.setRoutingPoint('START', c[0], c[1], '지정한 위치')",
                      inside)
        page.wait_for_timeout(700)
        adopted = page.evaluate("() => window.getTechnoRouteStart()")
        print(f"\nA. 건물 안 출발지 → 실내 출발점: {adopted}")
        if not adopted or adopted.get("where") != "indoor":
            problems.append(f"건물 안을 찍었는데 실내 출발점이 안 잡혔다: {adopted}")

        page.evaluate("(t) => window.routeToTechnoRoom(t.label, t.id)", room)
        page.wait_for_timeout(900)
        routed = page.evaluate("""() => {
            const r = window.getTechnoRouteResult();
            return r && !r.error
                ? { distance_m: Math.round(r.distance_m), room: r.destination.room_id,
                    floor: r.destination.floor, steps: r.steps.length }
                : { error: (r && r.error) || '결과 없음' };
        }""")
        print(f"   여기까지 길찾기 → {routed}")
        if routed.get("error"):
            problems.append(f"건물 안 출발지인데 경로가 안 나온다: {routed['error']}")
        elif routed["room"] != room["label"]:
            problems.append(f"목적지가 다르다: {routed['room']} ≠ {room['label']}")

        # 실외 출발지 칸도 같이 갱신됐는지 (C)
        outdoor = page.evaluate("""() => ({
            startCoord: window.startCoord || null,
            startText: (document.getElementById('start-addr') || {}).textContent || null
        })""")
        print(f"   실외 출발지 칸: {outdoor['startText']} · {outdoor['startCoord'] is not None}")
        if not outdoor["startCoord"]:
            problems.append("실내 출발점이 실외 출발지 칸에 반영되지 않았다")

        page.screenshot(path=str(SHOTS / "unified-start.png"))

        # ── B. 건물 밖에서 출발지 지정 → 여기까지 길찾기
        page.evaluate("() => window.clearTechnoRoute()")
        page.wait_for_timeout(300)
        page.evaluate("() => { window.endCoord = null; }")
        page.evaluate("(c) => window.setRoutingPoint('START', c[0], c[1], '건물 밖 지점')",
                      list(OUTSIDE))
        page.wait_for_timeout(700)
        outside_start = page.evaluate("() => window.getTechnoRouteStart()")
        print(f"\nB. 건물 밖 출발지 → {outside_start}")
        if not outside_start or outside_start.get("where") != "outdoor":
            problems.append(f"건물 밖인데 실외 출발지로 분류되지 않았다: {outside_start}")

        panel = page.inner_text("#techno-route-box")
        print(f"   패널 안내: {panel.strip()[:70]}")
        if "건물 밖" not in panel:
            problems.append("건물 밖 출발지인데 패널이 그 사실을 알리지 않는다")

        page.evaluate("(t) => window.routeToTechnoRoom(t.label, t.id)", room)
        page.wait_for_timeout(900)
        after = page.evaluate("""() => ({
            endCoord: window.endCoord || null,
            endText: (document.getElementById('end-addr') || {}).textContent || null,
            result: window.getTechnoRouteResult()
        })""")
        print(f"   여기까지 길찾기 → 실외 도착지 {after['endText']}")
        if not after["endCoord"]:
            problems.append("건물 밖 출발지에서 방을 골랐는데 실외 도착지가 안 잡힌다")
        elif room["label"] not in (after["endText"] or ""):
            problems.append(f"실외 도착지가 그 방이 아니다: {after['endText']}")

        # ── C. 실내 패널에서 찍은 출발점도 실외와 동기화
        page.evaluate("() => window.clearTechnoRoute()")
        page.wait_for_timeout(300)
        inside2 = indoor_point(page, "2F")
        page.evaluate("(c) => window.setTechnoRouteStart(c[0], c[1], '2F')", inside2)
        page.wait_for_timeout(600)
        synced = page.evaluate("""() => ({
            indoor: window.getTechnoRouteStart(),
            outdoorText: (document.getElementById('start-addr') || {}).textContent || null,
            marker: !!window.startMarker
        })""")
        print(f"\nC. 실내에서 찍은 출발점 → 실외 칸 '{synced['outdoorText']}' · "
              f"핀 {synced['marker']}")
        if not synced["indoor"] or synced["indoor"].get("where") != "indoor":
            problems.append("실내 출발점이 안 잡혔다")
        if not synced["marker"]:
            problems.append("실내 출발점인데 실외 핀이 안 생겼다")

        browser.close()

    if problems:
        print("\n문제:")
        for problem in problems:
            print(f"  · {problem}")
        return 1
    print("\n출발지 통합 확인 통과")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
