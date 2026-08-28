"""본서버(3000) 실내지도에 길찾기가 실제로 붙었는지 브라우저로 확인한다.

  python tests/browser_frontend_check.py
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright  # noqa: E402

URL = "http://localhost:3000/index.html"
SHOTS = Path(__file__).resolve().parent / "shots"



def main() -> int:
    SHOTS.mkdir(exist_ok=True)
    problems: list[str] = []

    def on_error(error):
        problems.append(f"JS 오류: {error}")

    with sync_playwright() as play:
        browser = play.chromium.launch()
        page = browser.new_page(viewport={"width": 1600, "height": 950})
        page.on("pageerror", on_error)

        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_function(
            "() => window.TechnoRoute && window.TECHNO_NAV_DATA && window.routeInsideTechno",
            timeout=30000)
        print("스크립트 로드 확인: TechnoRoute · TECHNO_NAV_DATA · routeInsideTechno")

        meta = page.evaluate("() => window.TECHNO_NAV_DATA.meta")
        print(f"그래프: 노드 {meta['counts']['nodes']} · 엣지 {meta['counts']['edges']} · "
              f"층 {len(meta['floors'])} · 빌드 {meta['built_at']}")

        page.wait_for_function("() => window.map", timeout=20000)

        # 층을 2F 로 두고, 2F 복도의 한 점을 위경도로 바꿔 출발점으로 넣는다
        outcome = page.evaluate("""() => {
            window.technoActiveFloor = '2F';
            const engine = window.TechnoRoute.load(window.TECHNO_NAV_DATA);
            const rings = window.TECHNO_NAV_DATA.floors['2F'].walkable;
            const ext = rings[0];
            let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
            ext.forEach(p => { minx=Math.min(minx,p[0]); maxx=Math.max(maxx,p[0]);
                               miny=Math.min(miny,p[1]); maxy=Math.max(maxy,p[1]); });
            let px = null;
            for (let i=0;i<20000;i++) {
              const x = minx + Math.random()*(maxx-minx);
              const y = miny + Math.random()*(maxy-miny);
              if (window.TechnoRoute._geometry.pointInRings(rings, x, y)) { px = [x,y]; break; }
            }
            if (!px) return { error: '복도 점 실패' };
            const ll = engine.pxToLatLng('2F', px[0], px[1]);
            const located = window.setTechnoRouteStart(ll[0], ll[1], '2F');
            const route = window.routeInsideTechno('401', '4F', {});
            return {
                latlng: ll,
                located: located,
                route: route && !route.error ? {
                    distance_m: route.distance_m,
                    duration_s: route.duration_s,
                    steps: route.steps,
                    vertical: route.legs.filter(l => l.mode !== 'walk')
                                        .map(l => l.mode + ':' + l.name),
                    firstLatLng: route.legs[0].latlngs[0]
                } : { error: (route && route.error) || '결과 없음' },
                layers: window.technoRouteLayerGroup
                    ? window.technoRouteLayerGroup.getLayers().length : 0
            };
        }""")

        if outcome.get("error"):
            problems.append(outcome["error"])
        else:
            print(f"출발 위경도: {outcome['latlng']} · 판정 {outcome['located']}")
            route = outcome["route"]
            if route.get("error"):
                problems.append(f"경로 실패: {route['error']}")
            else:
                print(f"경로: {route['distance_m']:.0f}m · {route['duration_s']:.0f}초 · "
                      f"층간 {route['vertical']}")
                for step in route["steps"]:
                    print(f"   - {step}")
                latlng = route["firstLatLng"]
                if not (36.140 < latlng[0] < 36.155 and 128.385 < latlng[1] < 128.400):
                    problems.append(f"경로 좌표가 캠퍼스 밖: {latlng}")
                print(f"지도 레이어 {outcome['layers']}개")
                if outcome["layers"] == 0:
                    problems.append("지도에 경로가 그려지지 않았다")

        page.screenshot(path=str(SHOTS / "route-frontend.png"))
        print(f"스크린샷: {SHOTS / 'route-frontend.png'}")
        browser.close()

    if problems:
        print("\n문제:")
        for problem in problems:
            print(f"  · {problem}")
        return 1
    print("\n본서버 연동 확인 통과")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
