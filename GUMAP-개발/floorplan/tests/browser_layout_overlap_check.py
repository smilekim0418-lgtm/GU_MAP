"""지도 위에 떠 있는 UI 끼리 겹치지 않는지 실제 브라우저에서 잰다.

  python GUMAP-개발/floorplan/tests/browser_layout_overlap_check.py

테크노관으로 들어가면 실내지도 패널이 왼쪽 메인 사이드바를 통째로 덮었다.
패널마다 다른 모듈이 인라인 스타일로 자리를 잡아서, 한 곳을 고쳐도 다른
화면 크기에서 또 겹쳤다. 눈으로 몇 장 보는 걸로는 못 막으니, 화면 크기별로
떠 있는 요소의 사각형을 모두 구해 서로 겹치는지 센다.

상태
  home     : 처음 연 화면
  techno   : 테크노관으로 확대 (실내지도 패널이 뜬다)
  pano     : 로드뷰 작은 창까지 연 화면
  open     : (모바일) 실내지도 카드를 펼친 화면

통과하면 tests/shots/layout-*.png 에 화면을 남긴다.
"""
from __future__ import annotations

import socket
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
SHOTS = Path(__file__).resolve().parent / "shots"
CENTRE = (36.146643, 128.394348)

VIEWPORTS = [
    ("desktop", dict(viewport={"width": 1440, "height": 900})),
    ("laptop", dict(viewport={"width": 1280, "height": 720})),
    ("tablet", dict(viewport={"width": 1024, "height": 768})),
    ("phone", dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)),
    ("small-phone", dict(viewport={"width": 360, "height": 740}, is_mobile=True, has_touch=True)),
]

# 서로 겹치면 안 되는 것들. 지도 컨트롤은 오른쪽 위 묶음 하나로 본다.
WATCHED = [
    "#routing-panel", "#techno-indoor-panel", "#techno-pano-panel", "#weather-panel",
    "#dark-mode-toggle", "#cplace-add-btn", "#cplace-list-btn", "#open-3d-btn",
    ".leaflet-top.leaflet-right", "#clicked-info", ".leaflet-bottom.leaflet-right .leaflet-control-zoom",
]

MEASURE = """(selectors) => {
    const out = [];
    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (!el) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
        if (cs.pointerEvents === 'none' && Number(cs.opacity) < 0.5) continue;
        const r = el.getBoundingClientRect();
        // 화면 밖으로 밀어낸 것(접힌 시트)은 보이는 부분만 센다
        const top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
        const left = Math.max(0, r.left), right = Math.min(innerWidth, r.right);
        if (right - left < 4 || bottom - top < 4) continue;
        out.push({ selector, left, top, right, bottom });
    }
    return out;
}"""


def serve():
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, port


def overlaps(boxes, allow=()):
    found = []
    for i, a in enumerate(boxes):
        for b in boxes[i + 1:]:
            pair = {a["selector"], b["selector"]}
            if any(pair == set(x) for x in allow):
                continue
            w = min(a["right"], b["right"]) - max(a["left"], b["left"])
            h = min(a["bottom"], b["bottom"]) - max(a["top"], b["top"])
            if w > 2 and h > 2:
                found.append(f'{a["selector"]} ↔ {b["selector"]} ({w:.0f}×{h:.0f}px)')
    return found


def main() -> int:
    failures = []
    SHOTS.mkdir(exist_ok=True)

    def check(name, ok, detail=""):
        print(("  OK   " if ok else "  FAIL ") + name + (f"  {detail}" if detail else ""), flush=True)
        if not ok:
            failures.append(name)

    server, port = serve()
    try:
        with sync_playwright() as driver:
            browser = driver.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
            for name, options in VIEWPORTS:
                page = browser.new_page(**options)
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.goto(f"http://127.0.0.1:{port}/index.html", wait_until="domcontentloaded")
                page.wait_for_function("() => window.map", timeout=30000)
                page.wait_for_timeout(2000)
                mobile = options["viewport"]["width"] <= 768

                if mobile:
                    collapsed = page.evaluate(
                        "() => document.getElementById('routing-panel').classList.contains('panel-collapsed')")
                    check(f"{name}: 첫 화면은 바텀시트를 접어 지도가 보인다", collapsed)

                found = overlaps(page.evaluate(MEASURE, WATCHED))
                check(f"{name}/home 겹침 없음", not found, "; ".join(found))

                page.evaluate(f"() => {{ window.map.setView([{CENTRE[0]}, {CENTRE[1]}], 19); }}")
                page.wait_for_selector("#techno-indoor-panel", state="visible", timeout=20000)
                page.wait_for_timeout(1500)
                boxes = page.evaluate(MEASURE, WATCHED)
                found = overlaps(boxes)
                check(f"{name}/techno 겹침 없음", not found, "; ".join(found))
                page.screenshot(path=str(SHOTS / f"layout-{name}-techno.png"))

                panel = next((b for b in boxes if b["selector"] == "#techno-indoor-panel"), None)
                check(f"{name}: 실내지도 패널이 화면 안에 다 들어온다",
                      panel is not None and panel["right"] <= options["viewport"]["width"]
                      and panel["bottom"] <= options["viewport"]["height"])

                if mobile:
                    page.click("#ti-expand")
                    page.wait_for_timeout(400)
                    found = overlaps(page.evaluate(MEASURE, WATCHED),
                                     # 펼친 카드는 지도 위를 덮는 게 목적이다. 오른쪽 버튼 열만 피하면 된다.
                                     allow=[("#techno-indoor-panel", ".leaflet-bottom.leaflet-right .leaflet-control-zoom")])
                    check(f"{name}/open 겹침 없음", not found, "; ".join(found))
                    scrolls = page.evaluate("""() => {
                        const body = document.querySelector('#techno-indoor-panel .ti-body');
                        return body.scrollHeight <= body.clientHeight + 1 || getComputedStyle(body).overflowY === 'auto';
                    }""")
                    check(f"{name}: 펼친 카드는 넘치면 스크롤된다", scrolls)
                    page.screenshot(path=str(SHOTS / f"layout-{name}-open.png"))
                    page.click("#ti-expand")
                    page.wait_for_timeout(300)

                    # 바텀시트를 끝까지 올리면 실내지도 카드가 비켜 준다
                    page.evaluate("""() => { const p = document.getElementById('routing-panel');
                        p.classList.remove('panel-collapsed'); p.classList.add('panel-expanded'); }""")
                    page.wait_for_timeout(600)
                    hidden = page.evaluate("""() => {
                        const cs = getComputedStyle(document.getElementById('techno-indoor-panel'));
                        return Number(cs.opacity) < 0.05 && cs.pointerEvents === 'none'; }""")
                    check(f"{name}: 시트를 올리면 실내지도 카드가 비켜 준다", hidden)
                    page.evaluate("""() => { const p = document.getElementById('routing-panel');
                        p.classList.remove('panel-expanded'); p.classList.add('panel-collapsed'); }""")
                    page.wait_for_timeout(600)

                # 촬영 지점은 처음에 꺼져 있다. 켜야 점이 생기고 창을 띄울 수 있다.
                page.evaluate("""() => {
                    const check = document.getElementById('ti-pano-points');
                    if (check && !check.checked) check.click();
                }""")
                page.wait_for_timeout(600)
                shown = page.evaluate("() => window.technoPanoLayer.getLayers().length > 0")
                check(f"{name}: 스위치를 켜면 촬영 지점이 나온다", shown)
                page.evaluate("() => { const l = window.technoPanoLayer.getLayers(); if (l.length) l[0].fire('click'); }")
                page.wait_for_timeout(1500)
                found = overlaps(page.evaluate(MEASURE, WATCHED),
                                 # 모바일 로드뷰 창은 확대 버튼 위에 뜬다. 창을 닫으면 다시 보인다.
                                 allow=[("#techno-pano-panel", ".leaflet-bottom.leaflet-right .leaflet-control-zoom")] if mobile else [])
                check(f"{name}/pano 겹침 없음", not found, "; ".join(found))
                page.screenshot(path=str(SHOTS / f"layout-{name}-pano.png"))
                check(f"{name}: 페이지 오류 없음", not errors, "; ".join(errors[:2]))
                page.close()
            browser.close()
    finally:
        server.shutdown()

    print()
    if failures:
        print("실패: " + " / ".join(failures))
        return 1
    print("겹침 검사 통과. 화면은 tests/shots/layout-*.png 에 있다.")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
