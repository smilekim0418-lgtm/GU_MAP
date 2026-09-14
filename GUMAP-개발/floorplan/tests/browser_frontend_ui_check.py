"""본서버(3000) 실내지도 패널의 길찾기 UI 를 사람이 누르듯 조작해 본다.

패널은 건물에 충분히 가까이·충분히 확대했을 때만 뜬다. 지도를 테크노관으로
옮긴 뒤 버튼을 실제로 클릭한다.

  python tests/browser_frontend_ui_check.py
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright  # noqa: E402

URL = "http://localhost:3000/index.html"
SHOTS = Path(__file__).resolve().parent / "shots"
TECHNO = (36.146643, 128.394348)


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
        page.wait_for_function("() => window.map && window.TECHNO_NAV_DATA", timeout=30000)

        # 테크노관으로 이동해 실내지도 패널이 뜨게 한다
        page.evaluate("(c) => { window.map.setView([c[0], c[1]], 19); }", list(TECHNO))
        page.wait_for_selector("#techno-indoor-panel", state="visible", timeout=20000)
        page.wait_for_selector("#techno-route-controls", timeout=20000)
        print("패널 · 길찾기 조작부 표시 확인")

        options = page.eval_on_selector_all("#tr-dest option", "els => els.length")
        print(f"목적지 옵션 {options}개")
        if options < 300:
            problems.append(f"목적지 목록이 비정상: {options}")

        # ① 검색 필터
        page.fill("#tr-filter", "401")
        page.wait_for_timeout(250)
        filtered = page.eval_on_selector_all(
            "#tr-dest option", "els => els.map(e => e.value)")
        print(f"'401' 검색 결과: {filtered[:5]}")
        if not any("401" in value for value in filtered):
            problems.append("검색 필터가 동작하지 않는다")

        # ② 출발 위치 지정 버튼 → 지도 클릭
        page.click("#tr-pick")
        page.wait_for_timeout(200)
        label = page.inner_text("#tr-pick")
        print(f"출발 지정 모드 버튼: {label}")
        if "클릭" not in label:
            problems.append("출발 지정 모드로 안 바뀐다")

        # 2F 복도의 실제 지점을 위경도로 바꿔 지도 클릭을 흉내낸다
        clicked = page.evaluate("""() => {
            window.technoActiveFloor = '2F';
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
                window.map.fire('click', { latlng: L.latLng(ll[0], ll[1]) });
                return ll;
              }
            }
            return null;
        }""")
        page.wait_for_timeout(300)
        label = page.inner_text("#tr-pick")
        print(f"클릭 후 버튼: {label} (좌표 {clicked})")
        if "출발:" not in label:
            problems.append("지도 클릭이 출발 위치로 잡히지 않았다")

        # ③ 길찾기 실행
        page.select_option("#tr-dest", value="4F|401")
        page.click("#tr-go")
        page.wait_for_timeout(500)

        summary = page.evaluate("""() => {
            const r = window.getTechnoRouteResult();
            if (!r) return { error: '결과 없음' };
            if (r.error) return { error: r.error };
            return { distance_m: r.distance_m, duration_s: r.duration_s,
                     steps: r.steps.length,
                     layers: window.technoRouteLayerGroup.getLayers().length };
        }""")
        if summary.get("error"):
            problems.append(f"길찾기 버튼 실패: {summary['error']}")
        else:
            print(f"길찾기 결과: {summary['distance_m']:.0f}m · "
                  f"{summary['duration_s']:.0f}초 · 안내 {summary['steps']}단계 · "
                  f"지도 레이어 {summary['layers']}개")
            if summary["layers"] == 0:
                problems.append("경로가 지도에 안 그려졌다")

        panel_text = page.inner_text("#techno-route-box")
        print("패널 내용 첫 줄: " + panel_text.strip().splitlines()[0])
        if "m ·" not in panel_text:
            problems.append("패널에 요약이 안 나온다")

        # ④ 계단 회피
        page.check("#tr-avoid")
        page.wait_for_timeout(500)
        avoid = page.evaluate("""() => {
            const r = window.getTechnoRouteResult();
            return r && !r.error
              ? { stairs: r.legs.filter(l => l.mode === 'stairs').length,
                  duration_s: r.duration_s }
              : { error: (r && r.error) || '결과 없음' };
        }""")
        print(f"계단 회피: {avoid}")
        if avoid.get("stairs"):
            problems.append("계단 회피가 반영되지 않았다")

        page.screenshot(path=str(SHOTS / "route-frontend-ui.png"))
        print(f"스크린샷: {SHOTS / 'route-frontend-ui.png'}")
        browser.close()

    if problems:
        print("\n문제:")
        for problem in problems:
            print(f"  · {problem}")
        return 1
    print("\n본서버 UI 검증 통과")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
