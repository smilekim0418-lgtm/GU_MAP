"""본서버(3000) 로딩·유휴 성능 프로파일.

추측하지 않고 재는 것이 목적이다.
  1) 리소스별 전송·소요 시간
  2) 스크립트 파싱/실행으로 인한 롱태스크
  3) 로드 완료 후 **유휴 상태**의 CPU 점유 (타이머·프레임 드롭)
  4) DOM 노드 수와 Leaflet 레이어 수

  python tests/perf_profile.py
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright  # noqa: E402

URL = "http://localhost:3000/index.html"
TECHNO = (36.146643, 128.394348)

LONGTASK_HOOK = """
window.__longTasks = [];
try {
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      window.__longTasks.push({ start: entry.startTime, dur: entry.duration });
    }
  }).observe({ entryTypes: ['longtask'] });
} catch (e) { window.__longTaskError = e.message; }

// 타이머 사용 현황을 가로채 기록한다
window.__timers = { interval: [], timeout: 0 };
const realSetInterval = window.setInterval;
window.setInterval = function (fn, delay) {
  const stack = new Error().stack.split('\\n').slice(1, 4).join(' | ');
  window.__timers.interval.push({ delay: delay, stack: stack });
  return realSetInterval.apply(this, arguments);
};
const realSetTimeout = window.setTimeout;
window.setTimeout = function () { window.__timers.timeout++; return realSetTimeout.apply(this, arguments); };
"""

FRAME_PROBE = """
() => new Promise(resolve => {
  const frames = [];
  let last = performance.now();
  let count = 0;
  function tick(now) {
    frames.push(now - last);
    last = now;
    if (++count < 120) requestAnimationFrame(tick);
    else {
      frames.sort((a, b) => a - b);
      resolve({
        frames: frames.length,
        median_ms: frames[Math.floor(frames.length / 2)],
        p95_ms: frames[Math.floor(frames.length * 0.95)],
        max_ms: frames[frames.length - 1],
        over_32ms: frames.filter(f => f > 32).length
      });
    }
  }
  requestAnimationFrame(tick);
})
"""


def main() -> int:
    with sync_playwright() as play:
        browser = play.chromium.launch()
        page = browser.new_page(viewport={"width": 1500, "height": 900})
        page.add_init_script(LONGTASK_HOOK)

        page.goto(URL, wait_until="load", timeout=60000)
        page.wait_for_function("() => window.map", timeout=60000)
        page.wait_for_timeout(4000)

        nav = page.evaluate("""() => {
            const n = performance.getEntriesByType('navigation')[0];
            return n ? {
                domContentLoaded: n.domContentLoadedEventEnd,
                load: n.loadEventEnd,
                transfer: n.transferSize
            } : null;
        }""")
        print("═══ 로딩 타임라인 ═══")
        print(f"  DOMContentLoaded {nav['domContentLoaded']:.0f}ms · load {nav['load']:.0f}ms")

        resources = page.evaluate("""() => performance.getEntriesByType('resource')
            .map(r => ({ name: r.name, dur: r.duration, size: r.transferSize || r.decodedBodySize,
                         type: r.initiatorType }))""")
        print(f"\n═══ 리소스 {len(resources)}건 · 느린 순 15 ═══")
        for row in sorted(resources, key=lambda r: -r["dur"])[:15]:
            short = row["name"].split("/")[-1][:52]
            print(f"  {row['dur']:7.0f}ms  {row['size'] / 1024:7.1f}KB  {short}")

        by_type: dict[str, list] = {}
        for row in resources:
            by_type.setdefault(row["type"], []).append(row)
        print("\n  종류별 합계:")
        for kind, rows in sorted(by_type.items(), key=lambda kv: -sum(r["size"] for r in kv[1])):
            print(f"    {kind:12s} {len(rows):4d}건 {sum(r['size'] for r in rows) / 1024:9.1f}KB")

        tasks = page.evaluate("() => window.__longTasks || []")
        total_block = sum(t["dur"] - 50 for t in tasks if t["dur"] > 50)
        print(f"\n═══ 롱태스크(50ms↑) {len(tasks)}건 · 총 블로킹 {total_block:.0f}ms ═══")
        for task in sorted(tasks, key=lambda t: -t["dur"])[:8]:
            print(f"  {task['start']:7.0f}ms 시점  {task['dur']:6.0f}ms")

        timers = page.evaluate("() => window.__timers")
        print(f"\n═══ 타이머 ═══")
        print(f"  setTimeout 호출 {timers['timeout']}회")
        print(f"  setInterval 등록 {len(timers['interval'])}개:")
        for row in timers["interval"]:
            print(f"    {row['delay']}ms  {row['stack'][:110]}")

        dom = page.evaluate("""() => ({
            nodes: document.getElementsByTagName('*').length,
            svgPaths: document.querySelectorAll('path').length,
            markers: document.querySelectorAll('.leaflet-marker-icon').length,
            tooltips: document.querySelectorAll('.leaflet-tooltip').length,
            tiles: document.querySelectorAll('.leaflet-tile').length,
            heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null
        })""")
        print(f"\n═══ 초기 화면 DOM ═══")
        print(f"  노드 {dom['nodes']} · SVG path {dom['svgPaths']} · 마커 {dom['markers']} · "
              f"툴팁 {dom['tooltips']} · 타일 {dom['tiles']} · JS힙 {dom['heap']}MB")

        idle = page.evaluate(FRAME_PROBE)
        print(f"\n═══ 유휴 상태 프레임 (초기 화면) ═══")
        print(f"  중앙값 {idle['median_ms']:.1f}ms · p95 {idle['p95_ms']:.1f}ms · "
              f"최대 {idle['max_ms']:.1f}ms · 32ms 초과 {idle['over_32ms']}/{idle['frames']}")

        # 테크노관 실내지도까지 켠 뒤 다시 측정
        page.evaluate("(c) => window.map.setView([c[0], c[1]], 19)", list(TECHNO))
        page.wait_for_timeout(4000)
        dom2 = page.evaluate("""() => ({
            nodes: document.getElementsByTagName('*').length,
            svgPaths: document.querySelectorAll('path').length,
            markers: document.querySelectorAll('.leaflet-marker-icon').length,
            tooltips: document.querySelectorAll('.leaflet-tooltip').length,
            heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null
        })""")
        idle2 = page.evaluate(FRAME_PROBE)
        print(f"\n═══ 테크노관 실내지도 표출 후 ═══")
        print(f"  노드 {dom2['nodes']} · SVG path {dom2['svgPaths']} · 마커 {dom2['markers']} · "
              f"툴팁 {dom2['tooltips']} · JS힙 {dom2['heap']}MB")
        print(f"  프레임 중앙값 {idle2['median_ms']:.1f}ms · p95 {idle2['p95_ms']:.1f}ms · "
              f"최대 {idle2['max_ms']:.1f}ms · 32ms 초과 {idle2['over_32ms']}/{idle2['frames']}")

        tasks2 = page.evaluate("() => window.__longTasks.length")
        print(f"  누적 롱태스크 {tasks2}건")

        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
