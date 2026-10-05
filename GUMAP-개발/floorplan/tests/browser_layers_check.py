"""복구한 map-layers.js 가 실제로 살아났는지 본서버(3000)에서 확인한다.

CCTV · 정사영상 · DEM · 실시간 교통 레이어를 실제로 켜 보고,
타일 요청이 나가는지까지 본다.

  python tests/browser_layers_check.py
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright  # noqa: E402

URL = "http://localhost:3000/index.html"
SHOTS = Path(__file__).resolve().parent / "shots"
GUMI = (36.1195, 128.3446)


def main() -> int:
    SHOTS.mkdir(exist_ok=True)
    problems: list[str] = []
    errors: list[str] = []
    tiles = {"8765": 0, "8767": 0}

    with sync_playwright() as play:
        browser = play.chromium.launch()
        page = browser.new_page(viewport={"width": 1500, "height": 900})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: _count(request.url, tiles))

        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_function("() => window.map", timeout=30000)
        page.wait_for_timeout(1500)

        syntax = [e for e in errors if "SyntaxError" in e or "Function statements" in e]
        print(f"페이지 JS 오류 {len(errors)}건 (문법 오류 {len(syntax)}건)")
        for error in errors[:5]:
            print(f"   · {error}")
        if syntax:
            problems.append(f"문법 오류가 아직 있다: {syntax[0]}")

        exported = page.evaluate("""() => {
            const names = ['cctvMarkers','eventMarkers','sharedPmMarkers','orthophotoLayer',
                           'Ortho4326TmsLayer','demLayer','isDemOn','_wmTile2geo4326Tms',
                           'initOrthophotoLayer','toggleOrthophotoLayer','initDemLayer',
                           'getElevationAt','filterPoisForOverlap','getMarkerOpacityByRoute',
                           'toggleCctvLayer','fetchAndRenderCctv','fetchAndRenderEvent',
                           'toggleTrafficLayer','searchOpinetGasStations'];
            const missing = names.filter(n => !(n in window));
            return { total: names.length, missing: missing };
        }""")
        print(f"map-layers.js 전역 {exported['total'] - len(exported['missing'])}/"
              f"{exported['total']}개 복원")
        if exported["missing"]:
            problems.append(f"아직 없는 전역: {exported['missing']}")

        # 한글이 깨지지 않았는지 (문자열 리터럴 안의 한글)
        korean = page.evaluate("""() => {
            const brands = window.getOpinetBrandName
                ? [window.getOpinetBrandName('SKE'), window.getOpinetBrandName('GSC'),
                   window.getOpinetBrandName('ZZZ')]
                : null;
            return brands;
        }""")
        print(f"문자열 한글 확인: {korean}")
        if korean and korean[0] != "SK에너지":
            problems.append(f"문자열 한글이 깨져 있다: {korean}")

        # 정사영상 레이어 켜기 → 8765 타일 요청 확인
        page.evaluate("(c) => { window.map.setView([c[0], c[1]], 16); }", list(GUMI))
        page.evaluate("() => window.toggleOrthophotoLayer(true)")
        page.wait_for_timeout(2500)
        on = page.evaluate("() => window.isOrthophotoOn")
        print(f"정사영상 레이어 ON={on} · :8765 타일 요청 {tiles['8765']}건")
        if not on:
            problems.append("정사영상 레이어가 켜지지 않는다")
        if tiles["8765"] == 0:
            problems.append("정사영상 타일 요청이 나가지 않았다")

        # DEM 레이어
        page.evaluate("() => { window.initDemLayer(); if (window.demLayer) window.demLayer.addTo(window.map); }")
        page.wait_for_timeout(2500)
        print(f":8767 DEM 타일 요청 {tiles['8767']}건")
        if tiles["8767"] == 0:
            problems.append("DEM 타일 요청이 나가지 않았다")

        # 타일 주소가 접속 호스트를 따르는지 (4fdee1f 의 의도된 변경)
        sample = page.evaluate("""() => {
            const layer = new window.Ortho4326TmsLayer(null, {});
            return layer.getTileUrl({ z: 16, x: 55950, y: 25520 });
        }""")
        print(f"타일 URL 샘플: {sample}")
        if "localhost" not in sample and window_host_ok(sample):
            pass
        if ":8765/" not in sample:
            problems.append(f"타일 URL 형식이 이상하다: {sample}")

        # 실시간 교통 레이어
        traffic = page.evaluate("""() => {
            window.toggleTrafficLayer(true);
            return !!(window.trafficLayer && window.map.hasLayer(window.trafficLayer));
        }""")
        print(f"실시간 교통 레이어 ON={traffic}")
        if not traffic:
            problems.append("실시간 교통 레이어가 켜지지 않는다")

        # CCTV 레이어 (외부 API 라 데이터는 없을 수 있다 - 호출만 확인)
        cctv = page.evaluate("""() => {
            try { window.toggleCctvLayer(true); return { ok: true, on: window.isCctvLayerOn }; }
            catch (e) { return { ok: false, error: e.message }; }
        }""")
        page.wait_for_timeout(1500)
        print(f"CCTV 레이어 호출: {cctv}")
        if not cctv.get("ok"):
            problems.append(f"CCTV 레이어 호출 실패: {cctv.get('error')}")

        page.screenshot(path=str(SHOTS / "layers-restored.png"))
        print(f"스크린샷: {SHOTS / 'layers-restored.png'}")
        browser.close()

    if problems:
        print("\n문제:")
        for problem in problems:
            print(f"  · {problem}")
        return 1
    print("\n레이어 복구 검증 통과")
    return 0


def window_host_ok(url: str) -> bool:
    return "localhost" in url or "127.0.0.1" in url


def _count(url: str, tiles: dict) -> None:
    for port in tiles:
        if f":{port}/" in url:
            tiles[port] += 1


if __name__ == "__main__":
    raise SystemExit(main())
