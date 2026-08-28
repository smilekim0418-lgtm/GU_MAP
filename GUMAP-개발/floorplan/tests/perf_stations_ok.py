"""컬링을 넣고도 정류장 기능이 그대로인지 확인한다.

빠르게 만들려다 정류장이 안 보이면 아무 의미가 없다.

  python tests/perf_stations_ok.py
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright  # noqa: E402

URL = "http://localhost:3000/index.html"
SHOTS = Path(__file__).resolve().parent / "shots"


def main() -> int:
    problems = []
    SHOTS.mkdir(exist_ok=True)

    with sync_playwright() as play:
        browser = play.chromium.launch()
        page = browser.new_page(viewport={"width": 1500, "height": 900})
        page.on("pageerror", lambda e: problems.append(f"JS 오류: {e}"))
        page.goto(URL, wait_until="load", timeout=60000)
        page.wait_for_function("() => window.map && window.stationMarkers.length", timeout=60000)
        page.wait_for_timeout(1500)

        total = page.evaluate("() => window.stationMarkers.length")
        print(f"정류장 데이터 {total}개 로드")

        # 실제 정류장 한 곳으로 이동
        stop = page.evaluate("""() => {
            const m = window.stationMarkers[Math.floor(window.stationMarkers.length / 2)];
            const ll = m.getLatLng();
            window.map.setView([ll.lat, ll.lng], 18);
            return [ll.lat, ll.lng];
        }""")
        page.wait_for_timeout(1800)

        near = page.evaluate("""() => ({
            onMap: window.stationMarkers.filter(m => window.map.hasLayer(m)).length,
            dom: document.querySelectorAll('.station-marker-icon').length,
            centerVisible: (() => {
                const b = window.map.getBounds();
                return window.stationMarkers.filter(m => b.contains(m.getLatLng())).length;
            })()
        })""")
        print(f"정류장 근처 zoom 18: 화면 안 정류장 {near['centerVisible']}개 · "
              f"지도에 올라간 것 {near['onMap']}개 · DOM {near['dom']}개")
        if near["onMap"] < near["centerVisible"]:
            problems.append(f"화면 안 정류장 {near['centerVisible']}개 중 "
                            f"{near['onMap']}개만 표시됨")
        if near["dom"] == 0:
            problems.append("정류장 근처인데 마커가 하나도 안 보인다")

        # 줌 아웃하면 사라져야 한다 (기존 동작 유지)
        page.evaluate("() => window.map.setZoom(14)")
        page.wait_for_timeout(1200)
        far = page.evaluate("() => document.querySelectorAll('.station-marker-icon').length")
        print(f"zoom 14 로 축소: DOM 정류장 마커 {far}개 (0이어야 정상)")
        if far != 0:
            problems.append(f"zoom 14 인데 정류장 마커가 {far}개 남아 있다")

        # 다시 확대하면 돌아와야 한다
        page.evaluate("(c) => window.map.setView([c[0], c[1]], 18)", stop)
        page.wait_for_timeout(1500)
        back = page.evaluate("() => document.querySelectorAll('.station-marker-icon').length")
        print(f"다시 zoom 18: DOM 정류장 마커 {back}개")
        if back == 0:
            problems.append("다시 확대했는데 정류장이 안 돌아온다")

        # 클릭이 여전히 동작하는지
        clicked = page.evaluate("""() => {
            const m = window.stationMarkers.find(x => window.map.hasLayer(x));
            if (!m) return { error: '지도에 올라간 마커 없음' };
            const listeners = m.listens && m.listens('click');
            m.fire('click');
            return { listens: !!listeners };
        }""")
        page.wait_for_timeout(600)
        print(f"마커 클릭 핸들러: {clicked}")
        if clicked.get("error") or not clicked.get("listens"):
            problems.append(f"정류장 클릭 핸들러가 없다: {clicked}")

        # 펄스 링이 살아있는지 (겉모습 유지 확인)
        ring = page.evaluate("""() => {
            const el = document.querySelector('.bus-stop-glow-marker');
            if (!el) return null;
            const after = getComputedStyle(el, '::after');
            return { animation: after.animationName, duration: after.animationDuration,
                     border: after.borderTopWidth };
        }""")
        print(f"펄스 링 스타일: {ring}")
        if not ring or ring["animation"] != "markerPulseRing":
            problems.append(f"펄스 링 애니메이션이 적용되지 않았다: {ring}")

        page.screenshot(path=str(SHOTS / "stations-after-fix.png"))
        print(f"스크린샷: {SHOTS / 'stations-after-fix.png'}")
        browser.close()

    if problems:
        print("\n문제:")
        for problem in problems:
            print(f"  · {problem}")
        return 1
    print("\n정류장 기능 유지 확인 통과")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
