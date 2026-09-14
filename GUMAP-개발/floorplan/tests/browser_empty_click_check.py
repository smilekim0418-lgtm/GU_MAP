"""빈 공간을 클릭했을 때 출발지 지정 팝업이 뜨는지 확인한다.

예전에는 건물도 POI 도 안 잡히면 팝업을 그냥 닫아, 허공을 누르면 아무 일도
일어나지 않았다. 이제는 지점 팝업이 뜨고 출발/경유/도착을 바로 찍을 수 있어야
한다. 건물을 눌렀을 때의 기존 동작은 그대로여야 한다.

  python tests/browser_empty_click_check.py
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright  # noqa: E402

URL = "http://localhost:3000/index.html"
SHOTS = Path(__file__).resolve().parent / "shots"

# 어느 좌표가 "빈 곳"인지는 VWorld 데이터가 정한다. 좌표를 못박으면 테스트가
# 데이터에 휘둘리므로(처음 고른 "논밭"은 실제로 공장이었다), 여러 곳을 눌러
# 보고 나온 팝업 종류로 판정한다.
SPOTS = [
    (36.14585, 128.39310),   # 금오공대 캠퍼스 안쪽
    (36.1055, 128.3702),     # 구미 산단
    (36.1402, 128.4155),     # 외곽
    (36.1198, 128.3450),     # 구미 시내
    (36.1301, 128.3820),     # 하천 부근
]

POINT_TITLE = "📍 지정한 위치"


def click_map(page, lat, lng, zoom=17):
    page.evaluate("(c) => { window.map.setView([c[0], c[1]], c[2]); }", [lat, lng, zoom])
    page.wait_for_timeout(900)
    page.evaluate("(c) => { window.map.fire('click', { latlng: L.latLng(c[0], c[1]) }); }",
                  [lat, lng])
    page.wait_for_timeout(3500)


def popup_state(page):
    return page.evaluate("""() => {
        const el = document.querySelector('.leaflet-popup-content');
        if (!el) return { open: false };
        const title = el.querySelector('#popup-title');
        return {
            open: true,
            title: title ? title.textContent.trim() : null,
            addr: ((el.querySelector('#popup-addr') || {}).textContent || '').trim(),
            visibleButtons: Array.from(el.querySelectorAll('button'))
                .filter(b => b.offsetParent !== null).map(b => b.textContent.trim())
        };
    }""")


def main() -> int:
    problems = []
    SHOTS.mkdir(exist_ok=True)
    point_popups = []
    place_popups = []
    nothing = []

    with sync_playwright() as play:
        browser = play.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.on("pageerror", lambda error: problems.append(f"JS 오류: {error}"))
        page.goto(URL, wait_until="load", timeout=60000)
        page.wait_for_function("() => window.map && window.initMapClickEvents", timeout=60000)
        page.wait_for_timeout(1500)

        for lat, lng in SPOTS:
            click_map(page, lat, lng)
            state = popup_state(page)
            if not state["open"]:
                nothing.append((lat, lng))
                print(f"  ({lat}, {lng}) → 팝업 없음")
                continue
            is_point = state.get("title") == POINT_TITLE
            kind = "지점" if is_point else "장소"
            print(f"  ({lat}, {lng}) → {kind} · {state.get('title')} · "
                  f"{state.get('addr')[:38]} · 버튼 {state.get('visibleButtons')}")
            (point_popups if is_point else place_popups).append((lat, lng, state))
            page.evaluate("() => window.map.closePopup()")
            page.wait_for_timeout(200)

        print(f"\n지점 팝업 {len(point_popups)}곳 · 장소 팝업 {len(place_popups)}곳 · "
              f"아무것도 안 뜬 곳 {len(nothing)}곳")

        if nothing:
            problems.append(f"클릭했는데 아무 팝업도 안 뜬 곳: {nothing}")
        if not point_popups:
            problems.append("지점 팝업이 한 번도 안 떴다 - 빈 공간 경로를 못 탔다")
        if not place_popups:
            problems.append("장소 팝업이 한 번도 안 떴다 - 건물 조회가 죽었을 수 있다")

        # 지점 팝업에는 출발/경유/도착이 접히지 않고 바로 보여야 한다
        for lat, lng, state in point_popups:
            visible = state.get("visibleButtons") or []
            for want in ("출발지", "경유지", "도착지"):
                if not any(want in button for button in visible):
                    problems.append(f"({lat}, {lng}) 지점 팝업에 {want} 버튼이 안 보인다: {visible}")

        # 출발지 버튼을 실제로 눌러 본다
        if point_popups:
            lat, lng, _ = point_popups[0]
            page.evaluate("() => { window.startCoord = null; }")
            click_map(page, lat, lng)
            page.evaluate("""() => {
                const button = Array.from(
                    document.querySelectorAll('.leaflet-popup-content button'))
                    .find(x => x.textContent.includes('출발지'));
                if (button) button.click();
            }""")
            page.wait_for_timeout(900)
            routing = page.evaluate("""() => ({
                startCoord: window.startCoord || null,
                startMarker: !!window.startMarker,
                popupClosed: !document.querySelector('.leaflet-popup-content')
            })""")
            print(f"\n출발지 버튼 클릭 → {routing}")
            if not routing["startCoord"]:
                problems.append("출발지 버튼을 눌러도 startCoord 가 설정되지 않는다")
            elif abs(routing["startCoord"]["lat"] - lat) > 1e-6:
                problems.append(f"출발지 좌표가 클릭 지점과 다르다: {routing['startCoord']}")
            if not routing["popupClosed"]:
                problems.append("출발지 지정 후 팝업이 안 닫힌다")

            page.screenshot(path=str(SHOTS / "empty-click-popup.png"))
            print(f"스크린샷: {SHOTS / 'empty-click-popup.png'}")

        browser.close()

    if problems:
        print("\n문제:")
        for problem in problems:
            print(f"  · {problem}")
        return 1
    print("\n빈 공간 클릭 · 출발지 지정 확인 통과")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
