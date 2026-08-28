"""실내지도 표출 후 DOM/레이어가 시간에 따라 늘어나는지 본다.

"마커가 많다" 와 "마커가 샌다" 는 완전히 다른 문제다. 유휴 상태에서
숫자가 계속 오르면 무언가가 반복해서 다시 그리고 있다는 뜻이다.

  python tests/perf_growth.py
"""
import sys

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright  # noqa: E402

URL = "http://localhost:3000/index.html"
TECHNO = (36.146643, 128.394348)

SNAPSHOT = """() => ({
    nodes: document.getElementsByTagName('*').length,
    markers: document.querySelectorAll('.leaflet-marker-icon').length,
    paths: document.querySelectorAll('path').length,
    indoorLayers: window.technoIndoorLayerGroup ? window.technoIndoorLayerGroup.getLayers().length : -1,
    footprintLayers: window.technoFootprintLayerGroup ? window.technoFootprintLayerGroup.getLayers().length : -1,
    longTasks: (window.__longTasks || []).length,
    heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null
})"""

HOOK = """
window.__longTasks = [];
try {
  new PerformanceObserver(list => {
    for (const e of list.getEntries()) window.__longTasks.push(e.duration);
  }).observe({ entryTypes: ['longtask'] });
} catch (e) {}

// 실내지도 렌더 함수가 몇 번 불리는지 센다
window.__renderCalls = 0;
window.__wrapWhenReady = setInterval(() => {
  if (window.renderTechnoFloor && !window.renderTechnoFloor.__wrapped) {
    const real = window.renderTechnoFloor;
    const wrapper = function () { window.__renderCalls++; return real.apply(this, arguments); };
    wrapper.__wrapped = true;
    window.renderTechnoFloor = wrapper;
    window.renderTechnoB1Floor = wrapper;
    clearInterval(window.__wrapWhenReady);
  }
}, 50);
"""


def main() -> int:
    with sync_playwright() as play:
        browser = play.chromium.launch()
        page = browser.new_page(viewport={"width": 1500, "height": 900})
        page.add_init_script(HOOK)
        page.goto(URL, wait_until="load", timeout=60000)
        page.wait_for_function("() => window.map", timeout=60000)
        page.wait_for_timeout(2000)

        print("── 테크노관으로 이동 전 ──")
        print(f"  {page.evaluate(SNAPSHOT)}")

        page.evaluate("(c) => window.map.setView([c[0], c[1]], 19)", list(TECHNO))
        page.wait_for_timeout(2000)

        print("\n── 실내지도 표출 후, 유휴 상태로 두고 2초 간격 관측 ──")
        previous = None
        for step in range(6):
            snapshot = page.evaluate(SNAPSHOT)
            calls = page.evaluate("() => window.__renderCalls")
            delta = ""
            if previous:
                delta = (f"  (Δ노드 {snapshot['nodes'] - previous['nodes']:+d} · "
                         f"Δ마커 {snapshot['markers'] - previous['markers']:+d} · "
                         f"Δ롱태스크 {snapshot['longTasks'] - previous['longTasks']:+d})")
            print(f"  {step * 2:2d}초: 노드 {snapshot['nodes']:6d} · 마커 {snapshot['markers']:5d} · "
                  f"실내레이어 {snapshot['indoorLayers']:5d} · 롱태스크 {snapshot['longTasks']:4d} · "
                  f"힙 {snapshot['heap']}MB · 렌더호출 {calls}{delta}")
            previous = snapshot
            page.wait_for_timeout(2000)

        detail = page.evaluate("""() => {
            const g = window.technoIndoorLayerGroup;
            if (!g) return null;
            const kinds = {};
            g.eachLayer(l => {
                const k = l instanceof L.Marker ? 'Marker'
                        : l instanceof L.Polygon ? 'Polygon'
                        : l instanceof L.GeoJSON ? 'GeoJSON' : l.constructor.name;
                kinds[k] = (kinds[k] || 0) + 1;
            });
            return kinds;
        }""")
        print(f"\n  실내 레이어 구성: {detail}")

        units = page.evaluate("""() => {
            const d = window.IMDF_TECHNO_DATA;
            return d ? { units: d.units.features.length,
                         occupants: d.occupants.features.length } : null;
        }""")
        print(f"  IMDF 원본: {units}")

        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
