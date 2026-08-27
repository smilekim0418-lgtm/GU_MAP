"""성능 회귀 방지선.

측정으로 확인한 두 가지를 계약으로 못박는다.
  1) 건물 하나를 보고 있을 때 화면 밖 정류장 마커가 DOM 에 남아 있으면 안 된다
  2) 지도를 움직이는 동안 60fps 예산(16.7ms)을 크게 벗어나면 안 된다

수정 전에는 실패해야 정상이다.

  python tests/perf_regression.py
"""
import sys

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright  # noqa: E402

URL = "http://localhost:3000/index.html"
TECHNO = (36.146643, 128.394348)

MAX_FRAME_MS = 20.0        # 60fps 예산 16.7ms + 여유
MAX_DOM_MARKERS = 300      # 건물 하나 화면에서 이 이상이면 컬링이 안 되는 것
MAX_PAINT_ANIMATIONS = 300  # 페인트 유발 무한 애니메이션 요소 수

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
      resolve({ median: sorted[Math.floor(sorted.length / 2)],
                p95: sorted[Math.floor(sorted.length * 0.95)] });
    }
  }
  requestAnimationFrame(tick);
})
"""

# box-shadow 처럼 페인트를 요구하는 속성을 무한 애니메이션하는 요소를 센다.
# transform/opacity 만 쓰면 GPU 합성으로 끝나 프레임 비용이 거의 없다.
COUNT_PAINT_ANIMATIONS = """() => {
  let count = 0;
  for (const anim of document.getAnimations()) {
    const effect = anim.effect;
    if (!effect || !effect.getKeyframes) continue;
    const timing = effect.getTiming();
    if (timing.iterations !== Infinity) continue;
    const props = new Set();
    for (const frame of effect.getKeyframes()) {
      for (const key of Object.keys(frame)) props.add(key);
    }
    const paintProps = [...props].filter(p =>
      !['offset', 'computedOffset', 'easing', 'composite',
        'transform', 'opacity'].includes(p));
    if (paintProps.length) count++;
  }
  return count;
}"""


def main() -> int:
    failures = []
    with sync_playwright() as play:
        browser = play.chromium.launch()
        page = browser.new_page(viewport={"width": 1500, "height": 900})
        page.goto(URL, wait_until="load", timeout=60000)
        page.wait_for_function("() => window.map", timeout=60000)
        page.wait_for_timeout(2000)
        page.evaluate("(c) => window.map.setView([c[0], c[1]], 19)", list(TECHNO))
        page.wait_for_timeout(3000)

        markers = page.evaluate("() => document.querySelectorAll('.leaflet-marker-icon').length")
        stations = page.evaluate("() => window.stationMarkers.length")
        on_map = page.evaluate(
            "() => window.stationMarkers.filter(m => window.map.hasLayer(m)).length")
        print(f"정류장 마커 {stations}개 중 지도에 올라간 것 {on_map}개 · DOM 마커 총 {markers}개")
        if markers > MAX_DOM_MARKERS:
            failures.append(f"건물 화면인데 DOM 마커가 {markers}개 (기준 {MAX_DOM_MARKERS} 이하)")

        painted = page.evaluate(COUNT_PAINT_ANIMATIONS)
        print(f"페인트 유발 무한 애니메이션 요소 {painted}개")
        if painted > MAX_PAINT_ANIMATIONS:
            failures.append(f"페인트 애니메이션 요소 {painted}개 (기준 {MAX_PAINT_ANIMATIONS} 이하)")

        frames = page.evaluate(PAN_PROBE)
        print(f"지도 이동 중 프레임 중앙값 {frames['median']:.1f}ms "
              f"({round(1000 / frames['median'])}fps) · p95 {frames['p95']:.1f}ms")
        if frames["median"] > MAX_FRAME_MS:
            failures.append(f"프레임 중앙값 {frames['median']:.1f}ms (기준 {MAX_FRAME_MS}ms 이하)")

        # 시야에 정류장이 실제로 많은 축척에서도 예산을 지키는지
        page.evaluate("() => window.map.setView([36.1195, 128.3446], 16)")
        page.wait_for_timeout(2500)
        wide_markers = page.evaluate(
            "() => document.querySelectorAll('.leaflet-marker-icon').length")
        wide = page.evaluate(PAN_PROBE)
        print(f"구미 시내 zoom 16: DOM 마커 {wide_markers}개 · "
              f"프레임 중앙값 {wide['median']:.1f}ms ({round(1000 / wide['median'])}fps)")
        if wide["median"] > MAX_FRAME_MS:
            failures.append(f"zoom 16 프레임 중앙값 {wide['median']:.1f}ms "
                            f"(기준 {MAX_FRAME_MS}ms 이하)")

        browser.close()

    if failures:
        print("\n실패:")
        for failure in failures:
            print(f"  · {failure}")
        return 1
    print("\n성능 회귀 테스트 통과")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
