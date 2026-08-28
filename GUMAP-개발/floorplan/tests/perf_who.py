"""2,247개 마커가 어느 레이어에서 나오는지 특정한다.

  python tests/perf_who.py
"""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright  # noqa: E402

URL = "http://localhost:3000/index.html"
TECHNO = (36.146643, 128.394348)


def main() -> int:
    with sync_playwright() as play:
        browser = play.chromium.launch()
        page = browser.new_page(viewport={"width": 1500, "height": 900})
        page.goto(URL, wait_until="load", timeout=60000)
        page.wait_for_function("() => window.map", timeout=60000)
        page.wait_for_timeout(2000)
        page.evaluate("(c) => window.map.setView([c[0], c[1]], 19)", list(TECHNO))
        page.wait_for_timeout(3500)

        by_class = page.evaluate("""() => {
            const counts = {};
            document.querySelectorAll('.leaflet-marker-icon').forEach(el => {
                const key = el.className.replace('leaflet-marker-icon', '')
                    .replace('leaflet-zoom-animated', '').replace('leaflet-interactive', '')
                    .trim() || '(클래스 없음)';
                counts[key] = (counts[key] || 0) + 1;
            });
            return counts;
        }""")
        print("═══ 마커 CSS 클래스별 개수 ═══")
        for name, count in sorted(by_class.items(), key=lambda kv: -kv[1]):
            print(f"  {count:5d}  {name[:70]}")

        panes = page.evaluate("""() => {
            const counts = {};
            document.querySelectorAll('.leaflet-marker-icon').forEach(el => {
                const pane = el.parentElement ? el.parentElement.className : '?';
                counts[pane] = (counts[pane] || 0) + 1;
            });
            return counts;
        }""")
        print("\n═══ 마커가 담긴 pane ═══")
        for name, count in sorted(panes.items(), key=lambda kv: -kv[1]):
            print(f"  {count:5d}  {name[:70]}")

        # window 에 붙은 Leaflet 레이어 그룹들을 전부 훑어 마커 보유량을 센다
        groups = page.evaluate("""() => {
            const out = [];
            for (const key of Object.keys(window)) {
                let value;
                try { value = window[key]; } catch (e) { continue; }
                if (!value || typeof value !== 'object') continue;
                if (typeof value.eachLayer !== 'function') continue;
                let markers = 0, total = 0, onMap = false;
                try {
                    value.eachLayer(l => {
                        total++;
                        if (l instanceof L.Marker) markers++;
                        else if (l && typeof l.eachLayer === 'function') {
                            l.eachLayer(x => { total++; if (x instanceof L.Marker) markers++; });
                        }
                    });
                    onMap = window.map.hasLayer(value);
                } catch (e) {}
                if (total) out.push({ key: key, total: total, markers: markers, onMap: onMap });
            }
            return out.sort((a, b) => b.markers - a.markers);
        }""")
        print("\n═══ window 의 Leaflet 그룹별 마커 보유량 ═══")
        for row in groups[:15]:
            flag = "지도에 올라감" if row["onMap"] else "지도에 없음"
            print(f"  마커 {row['markers']:5d} / 레이어 {row['total']:5d}  {row['key'][:40]:40s} {flag}")

        arrays = page.evaluate("""() => {
            const out = [];
            for (const key of Object.keys(window)) {
                let value;
                try { value = window[key]; } catch (e) { continue; }
                if (Array.isArray(value) && value.length > 50 && value[0] &&
                    typeof value[0] === 'object' && value[0]._latlng) {
                    out.push({ key: key, length: value.length });
                }
            }
            return out.sort((a, b) => b.length - a.length);
        }""")
        print("\n═══ window 의 마커 배열 ═══")
        for row in arrays[:12]:
            print(f"  {row['length']:5d}  window.{row['key']}")

        sample = page.evaluate("""() => Array.from(
            document.querySelectorAll('.leaflet-marker-icon')).slice(0, 6).map(el => ({
                cls: el.className, title: el.title || null,
                html: (el.innerHTML || '').slice(0, 80)
            }))""")
        print("\n═══ 마커 샘플 ═══")
        for row in sample:
            print(f"  {json.dumps(row, ensure_ascii=False)[:150]}")

        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
