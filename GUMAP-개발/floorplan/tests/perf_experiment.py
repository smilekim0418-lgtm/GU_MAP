"""원인 귀속을 위한 통제 실험. 코드는 건드리지 않고 런타임에만 토글한다.

가설
  H1  markerPulse 가 box-shadow(페인트 속성)를 무한 애니메이션해서 느리다
  H2  화면 밖 정류장 마커까지 전부 DOM 에 올라가 있어서 느리다

A 기준 / B 애니메이션만 끔 / C 화면 밖 마커만 제거 / D 둘 다
지도를 실제로 이동시키며 프레임 간격을 잰다.

  python tests/perf_experiment.py
"""
import sys

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright  # noqa: E402

URL = "http://localhost:3000/index.html"
TECHNO = (36.146643, 128.394348)

# 지도를 조금씩 움직이면서 프레임 간격을 잰다 (사용자가 실제로 겪는 상황)
PAN_PROBE = """
() => new Promise(resolve => {
  const frames = [];
  let last = performance.now();
  let count = 0;
  const center = window.map.getCenter();
  function tick(now) {
    frames.push(now - last);
    last = now;
    count++;
    window.map.panTo([center.lat + Math.sin(count / 6) * 0.00035,
                      center.lng + Math.cos(count / 6) * 0.00035],
                     { animate: false });
    if (count < 100) requestAnimationFrame(tick);
    else {
      const sorted = frames.slice(2).sort((a, b) => a - b);
      resolve({
        median: sorted[Math.floor(sorted.length / 2)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        max: sorted[sorted.length - 1],
        fps: Math.round(1000 / sorted[Math.floor(sorted.length / 2)]),
        domMarkers: document.querySelectorAll('.leaflet-marker-icon').length
      });
    }
  }
  requestAnimationFrame(tick);
})
"""

DISABLE_ANIMATION = """() => {
  const style = document.createElement('style');
  style.id = '__noanim';
  style.textContent = '.bus-stop-glow-marker { animation: none !important; box-shadow: none !important; }';
  document.head.appendChild(style);
}"""

ENABLE_ANIMATION = """() => { const s = document.getElementById('__noanim'); if (s) s.remove(); }"""

CULL = """() => {
  const bounds = window.map.getBounds().pad(0.2);
  window.__culled = [];
  window.stationMarkers.forEach(m => {
    if (window.map.hasLayer(m) && !bounds.contains(m.getLatLng())) {
      m.remove();
      window.__culled.push(m);
    }
  });
  return window.__culled.length;
}"""

UNCULL = """() => {
  (window.__culled || []).forEach(m => m.addTo(window.map));
  const n = (window.__culled || []).length;
  window.__culled = [];
  return n;
}"""


def main() -> int:
    with sync_playwright() as play:
        browser = play.chromium.launch()
        page = browser.new_page(viewport={"width": 1500, "height": 900})
        page.goto(URL, wait_until="load", timeout=60000)
        page.wait_for_function("() => window.map", timeout=60000)
        page.wait_for_timeout(2000)
        page.evaluate("(c) => window.map.setView([c[0], c[1]], 19)", list(TECHNO))
        page.wait_for_timeout(3000)

        total = page.evaluate("() => window.stationMarkers.length")
        print(f"정류장 마커 총 {total}개 · 테크노관 zoom 19 에서 지도 이동 중 프레임 측정\n")

        def run(label):
            page.wait_for_timeout(600)
            row = page.evaluate(PAN_PROBE)
            print(f"  {label:26s} 중앙값 {row['median']:6.1f}ms ({row['fps']:3d}fps) · "
                  f"p95 {row['p95']:6.1f}ms · 최대 {row['max']:6.1f}ms · DOM마커 {row['domMarkers']}")
            return row

        base = run("A 기준(현재 상태)")

        page.evaluate(DISABLE_ANIMATION)
        anim_off = run("B 애니메이션만 끔")
        page.evaluate(ENABLE_ANIMATION)

        culled = page.evaluate(CULL)
        cull_only = run(f"C 화면밖 {culled}개 제거")

        page.evaluate(DISABLE_ANIMATION)
        both = run("D 둘 다")
        page.evaluate(ENABLE_ANIMATION)
        page.evaluate(UNCULL)

        print(f"\n═══ 귀속 ═══")
        print(f"  애니메이션 제거만    : {base['median']:.1f} → {anim_off['median']:.1f}ms "
              f"({(1 - anim_off['median'] / base['median']) * 100:.0f}% 개선)")
        print(f"  화면밖 마커 제거만   : {base['median']:.1f} → {cull_only['median']:.1f}ms "
              f"({(1 - cull_only['median'] / base['median']) * 100:.0f}% 개선)")
        print(f"  둘 다                : {base['median']:.1f} → {both['median']:.1f}ms "
              f"({(1 - both['median'] / base['median']) * 100:.0f}% 개선)")

        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
