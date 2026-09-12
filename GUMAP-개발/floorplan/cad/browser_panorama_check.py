"""실내 로드뷰 프로토타입을 실제 브라우저에서 확인한다.

  python GUMAP-개발/floorplan/cad/browser_panorama_check.py

제일 중요한 건 **방위 정합**이다. 화면을 어느 쪽으로 돌리든, 한가운데 보이는
벽은 그 방향으로 CAD 에서 광선을 쐈을 때 맞는 벽이어야 한다. 눈으로 보면
그럴듯한데 90도 돌아가 있는 일이 흔해서, 화면 중앙 픽셀 밝기와 광선 거리를
24방향에서 맞춰 본다. 실제로 이 검사가 처음 구현의 반사 오류를 잡았다.

그 다음은 **이동**이다. 로드뷰는 바닥에 깔린 길을 눌러서, 또는 방향키로
움직인다. 길이 화면 반대쪽에 깔리면 눌러서 엉뚱한 데로 가므로, 이웃 하나를
정면에 두고 그 길 끝이 화면 한가운데 오는지 재 본다. 방향키로 한 칸 갔다가
돌아오는 것도 본다.
"""
from __future__ import annotations

import json
import socket
import statistics
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[2]
OUT = BASE / "output"
PAGE = "GUMAP-%EA%B0%9C%EB%B0%9C/floorplan/cad/output/panorama.html"


def serve():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, port


def main() -> int:
    plan = json.loads((OUT / "panorama_report.json").read_text(encoding="utf-8"))["floors"]
    failures = []

    def check(name, ok, detail=""):
        print(("  OK   " if ok else "  FAIL ") + name + (f"  {detail}" if detail else ""), flush=True)
        if not ok:
            failures.append(name)

    server, port = serve()
    try:
        with sync_playwright() as driver:
            browser = driver.chromium.launch(
                args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
            page = browser.new_page(viewport={"width": 1200, "height": 800})
            page.on("pageerror", lambda e: failures.append(f"페이지 오류: {e}"))
            page.goto(f"http://127.0.0.1:{port}/{PAGE}", wait_until="load")
            page.wait_for_function("() => window.PANO", timeout=30000)
            page.wait_for_timeout(1200)

            state = page.evaluate("() => window.PANO.state()")
            check("1층에서 시작하고 이웃이 있다", state["floor"] == "1F" and state["links"] >= 2,
                  json.dumps(state["floor"]) + f" · 이웃 {state['links']}")
            check("바닥에 길이 깔린다", state["road"] >= 1 and state["hotspots"] >= 1,
                  f'구간 {state["road"]}개 · 한 칸 앞 {state["hotspots"]}개')

            rows = page.evaluate("""() => {
                const out = [];
                for (let i = 0; i < 24; i++) out.push(window.PANO.probe(i / 24 * Math.PI * 2));
                return out;
            }""")
            gap = [abs(r["measured"] - r["expected"]) for r in rows]
            check("24방향 모두 보는 쪽 벽이 맞는다",
                  statistics.median(gap) <= 2 and max(gap) <= 12,
                  f"밝기 차 중앙값 {statistics.median(gap):.1f} / 최대 {max(gap)}")
            check("방위가 한 바퀴를 돈다",
                  len({round(r["bearing"] / 30) for r in rows}) >= 11,
                  f'{len({round(r["bearing"] / 30) for r in rows})}/12 구간')

            centred = page.evaluate("""() => {
                // 이웃 하나를 정면에 두고, 그 지점으로 가는 길 끝이 화면 한가운데에
                // 찍히는지 본다. 여기가 어긋나면 눌러서 엉뚱한 데로 간다.
                return window.PANO.aimAtFirstNeighbour();
            }""")
            check("정면에 둔 이웃의 길 끝이 화면 가운데에 온다",
                  centred is not None and centred["offset"] <= 0.03,
                  "" if centred is None else f'중심에서 {centred["offset"] * 100:.1f}%')

            clicked = page.evaluate("""() => {
                // 화면 한가운데 아래쪽, 바닥 길이 깔렸을 자리를 눌러 본다.
                window.PANO.aimAtFirstNeighbour();
                const canvas = document.getElementById('overlay');
                const hit = window.PANO.roadAt(canvas.width / 2, canvas.height * 0.72);
                const before = window.PANO.state().node;
                if (hit) window.PANO.goTo(hit.target, true);
                return { hit: !!hit, before: before, after: window.PANO.state().node };
            }""")
            check("바닥 길을 누르면 그리로 간다",
                  clicked["hit"] and clicked["after"] != clicked["before"],
                  f'{clicked["before"]} -> {clicked["after"]}')

            keyed = page.evaluate("""() => {
                // 방향키: 앞으로 한 칸 갔다가 뒤로 한 칸. 제자리로 돌아와야 한다.
                const start = window.PANO.state().node;
                const forward = window.PANO.step(false);
                const middle = window.PANO.state().node;
                const back = window.PANO.step(true);
                return { start: start, middle: middle, end: window.PANO.state().node,
                         forward: forward, back: back };
            }""")
            check("방향키로 앞뒤로 오간다",
                  keyed["forward"] and keyed["back"] and
                  keyed["middle"] != keyed["start"] and keyed["end"] == keyed["start"],
                  f'{keyed["start"]} -> {keyed["middle"]} -> {keyed["end"]}')

            for floor in ("B1F", "6F"):
                page.evaluate(f"() => window.PANO.setFloor('{floor}')")
                page.wait_for_timeout(900)
                state = page.evaluate("() => window.PANO.state()")
                check(f"{floor} 로 바꿔도 그린다",
                      state["floor"] == floor and state["links"] >= 1,
                      f'이웃 {state["links"]}개')
                rows = page.evaluate(
                    "() => [0, 1, 2, 3].map(i => window.PANO.probe(i * Math.PI / 2))")
                worst = max(abs(r["measured"] - r["expected"]) for r in rows)
                check(f"{floor} 방위도 맞는다", worst <= 12, f"밝기 차 최대 {worst}")

            page.evaluate("() => window.PANO.setFloor('1F')")
            page.wait_for_timeout(900)
            OUT.joinpath("panorama-1F.png").write_bytes(page.screenshot())

            # 지도 안 작은 창(embed)으로도 열려야 한다. 설명판을 접고, 주소로 받은
            # 층·지점에서 바로 시작해야 지도에서 누른 자리가 열린다.
            small = browser.new_page(viewport={"width": 420, "height": 272})
            small.on("pageerror", lambda e: failures.append(f"작은 창 오류: {e}"))
            small.goto(f"http://127.0.0.1:{port}/{PAGE}?embed=1&floor=3F&node=17",
                       wait_until="load")
            small.wait_for_function("() => window.PANO", timeout=30000)
            small.wait_for_timeout(900)
            state = small.evaluate("() => window.PANO.state()")
            check("작은 창이 주소로 받은 자리에서 열린다",
                  state["floor"] == "3F" and state["node"] == 17,
                  f'{state["floor"]} · 지점 {state["node"]}')
            check("작은 창에서는 큰 설명판을 접는다",
                  small.evaluate("() => document.body.classList.contains('embed') && "
                                 "getComputedStyle(document.getElementById('head')).display === 'none'"))
            OUT.joinpath("panorama-embed.png").write_bytes(small.screenshot())
            small.close()
            browser.close()
    finally:
        server.shutdown()

    print()
    total = sum(r["nodes"] for r in plan.values())
    print(f"촬영 지점 {total}개 · 연결 {sum(r['links'] for r in plan.values())}개")
    if failures:
        print("실패: " + " / ".join(dict.fromkeys(failures)))
        return 1
    print("브라우저 검사 통과. 화면은 output/panorama-1F.png 에 있다.")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
