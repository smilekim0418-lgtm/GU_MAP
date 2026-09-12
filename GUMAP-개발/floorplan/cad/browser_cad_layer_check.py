"""메인 GUMAP 지도에 얹은 CAD 레이어를 실제 브라우저에서 확인한다.

  python GUMAP-개발/floorplan/cad/browser_cad_layer_check.py

정적 서버를 띄우고 index.html 을 열어, 테크노관으로 확대했을 때
  - CAD 선형 캔버스가 실제로 픽셀을 그리는가
  - 층을 바꾸면 그 층 데이터를 받아 다시 그리는가
  - 외부 출입문 마커가 확정/후보 규칙대로 나오는가
  - 360 촬영 지점을 누르면 작은 창이 뜨고, 전체화면은 한 번 더 눌러야 열리는가
  - 레이어를 끄면 흔적 없이 사라지는가 (기존 화면 보존)
를 본다. 통과하면 output/cad-layer-*.png 에 화면을 남긴다.
"""
from __future__ import annotations

import json
import socket
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[2]
OUT = BASE / "output"
CENTRE = (36.146643, 128.394348)


def serve():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, port


def drawn_pixels(page):
    return page.evaluate("""() => {
        const canvas = document.querySelector('canvas.techno-cad-canvas');
        if (!canvas || !canvas.width) return -1;
        const ctx = canvas.getContext('2d');
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 8) count++;
        return count;
    }""")


def markers(page):
    return page.evaluate("() => window.technoCadDoorLayer.getLayers().length")


def main() -> int:
    index = json.loads((ROOT / "GUMAP-학교지도/data/cad/index.json").read_text(encoding="utf-8"))
    by_floor = {f["floor"]: f for f in index["floors"]}
    failures = []

    def check(name, condition, detail=""):
        print(("  OK   " if condition else "  FAIL ") + name + (f"  {detail}" if detail else ""),
              flush=True)
        if not condition:
            failures.append(name)

    server, port = serve()
    try:
        with sync_playwright() as driver:
            # 작은 창 안의 로드뷰가 실제로 그려지는지 보려면 WebGL 이 있어야 한다.
            browser = driver.chromium.launch(
                args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
            page = browser.new_page(viewport={"width": 1400, "height": 900})
            page.on("pageerror", lambda e: failures.append(f"페이지 오류: {e}"))
            page.goto(f"http://127.0.0.1:{port}/index.html", wait_until="domcontentloaded")
            page.wait_for_function("() => window.map && window.TECHNO_CAD", timeout=30000)

            check("층 데이터 7개", len(index["floors"]) == 7, str(len(index["floors"])))
            # DWG 의 호실 번호 353개 가운데, 도면에서 방 밖에 인출선으로 빼 적은
            # 35개는 글자 자리가 방 위치가 아니라 지도에 올리지 않는다.
            placed = sum(f["room_count"] for f in index["floors"])
            outside = sum(len(f["labels_outside_building"]) for f in index["floors"])
            check("호실 318개 + 외곽 밖 표기 35개 = 353개", placed == 318 and placed + outside == 353,
                  f"{placed} + {outside}")
            page.evaluate(f"() => {{ window.map.setView([{CENTRE[0]}, {CENTRE[1]}], 19); }}")
            page.wait_for_function(
                "() => document.querySelector('canvas.techno-cad-canvas') !== null", timeout=20000)
            page.wait_for_timeout(2500)

            painted = drawn_pixels(page)
            check("1F CAD 선형이 그려짐", painted > 20000, f"{painted}px")
            wide = sum(d["certainty"] == "high" for d in by_floor["1F"]["entrances"])
            check("1F 트인 출입문 마커", markers(page) == wide, f"{markers(page)} / 기대 {wide}")

            # 호실 번호는 확대해야 나온다. 켠 채로 줌만 올려 글자가 늘어나는지 본다.
            before = drawn_pixels(page)
            page.evaluate("() => { window.map.setZoom(20); }")
            page.wait_for_timeout(1500)
            check("확대하면 호실 번호가 더 그려짐", drawn_pixels(page) > 20000, f"{before}px -> {drawn_pixels(page)}px")
            page.evaluate("() => document.getElementById('ti-cad-rooms').click()")
            page.wait_for_timeout(800)
            without_rooms = drawn_pixels(page)
            page.evaluate("() => document.getElementById('ti-cad-rooms').click()")
            page.wait_for_timeout(800)
            check("호실 표시를 끄면 그림이 줄어듦", without_rooms < drawn_pixels(page),
                  f"{without_rooms}px < {drawn_pixels(page)}px")
            page.evaluate(f"() => {{ window.map.setView([{CENTRE[0]}, {CENTRE[1]}], 19); }}")
            page.wait_for_timeout(1200)

            page.evaluate("() => document.getElementById('ti-cad-cands').click()")
            page.wait_for_timeout(600)
            check("막힌 후보까지 켜면 마커가 늘어남",
                  markers(page) == len(by_floor["1F"]["entrances"]),
                  f'{markers(page)} / 기대 {len(by_floor["1F"]["entrances"])}')
            OUT.joinpath("cad-layer-1F.png").write_bytes(page.screenshot())

            page.evaluate("""() => {
                const button = [...document.querySelectorAll('#ti-floor-btns .ti-fbtn')]
                    .find(b => b.dataset.floor === 'B1F');
                button.click();
            }""")
            page.wait_for_function("() => window.technoActiveFloor === 'B1F'", timeout=10000)
            page.wait_for_timeout(2500)
            painted_b1 = drawn_pixels(page)
            check("B1F 로 바꾸면 그 층을 다시 그림", painted_b1 > 20000, f"{painted_b1}px")
            check("B1F 출입문 마커", markers(page) == len(by_floor["B1F"]["entrances"]),
                  f'{markers(page)} / 기대 {len(by_floor["B1F"]["entrances"])}')
            OUT.joinpath("cad-layer-B1F.png").write_bytes(page.screenshot())

            # ── 실내 로드뷰: 지도에서 누르면 작은 창, 전체화면은 한 번 더 ──
            points = page.evaluate("() => window.technoPanoLayer.getLayers().length")
            check("360 촬영 지점이 지도에 찍힘", points > 0, f"{points}개")
            opened = page.evaluate("""() => {
                // 캔버스로 그린 마커라 좌표를 짚기 어렵다. 마커가 스스로 내는
                // 것과 같은 사건을 쏴서 누른 경로를 그대로 태운다.
                window.technoPanoLayer.getLayers()[0].fire('click');
                const panel = document.getElementById('techno-pano-panel');
                const frame = panel.querySelector('iframe');
                return { shown: getComputedStyle(panel).display,
                         width: panel.getBoundingClientRect().width,
                         full: panel.dataset.full,
                         src: frame.getAttribute('src') || '' };
            }""")
            check("지점을 누르면 작은 창이 뜬다",
                  opened["shown"] == "flex" and 0 < opened["width"] < 700
                  and opened["full"] != "1",
                  f'폭 {opened["width"]:.0f}px')
            check("작은 창은 끼워 넣기 모드로 그 지점을 연다",
                  "embed=1" in opened["src"] and "node=" in opened["src"],
                  opened["src"].split("output/")[-1][:60])

            full = page.evaluate("""() => {
                const panel = document.getElementById('techno-pano-panel');
                [...panel.querySelectorAll('button')].find(b => b.textContent.includes('전체화면')).click();
                const box = panel.getBoundingClientRect();
                return { w: box.width, h: box.height, vw: window.innerWidth,
                         vh: window.innerHeight, flag: panel.dataset.full };
            }""")
            # 작은 창 안에서 로드뷰가 실제로 그려질 때까지 기다린다. 창 크기만
            # 맞고 안이 빈 화면이면 아무 쓸모가 없다.
            frame = page.frame_locator("#techno-pano-panel iframe")
            frame.locator("#where").wait_for(timeout=30000)
            page.wait_for_timeout(2500)
            inside = page.evaluate("""() => {
                const win = document.querySelector('#techno-pano-panel iframe').contentWindow;
                return win.PANO ? win.PANO.state() : null;
            }""")
            check("작은 창 안에서 로드뷰가 실제로 돈다",
                  inside is not None and inside["road"] >= 1,
                  "" if inside is None else f'{inside["floor"]} · 길 {inside["road"]}구간')

            check("전체화면을 누르면 그때 화면을 덮는다",
                  full["flag"] == "1" and full["w"] >= full["vw"] - 1
                  and full["h"] >= full["vh"] - 1,
                  f'{full["w"]:.0f}x{full["h"]:.0f} / 화면 {full["vw"]}x{full["vh"]}')
            OUT.joinpath("pano-fullscreen.png").write_bytes(page.screenshot())

            back = page.evaluate("""() => {
                const panel = document.getElementById('techno-pano-panel');
                [...panel.querySelectorAll('button')].find(b => b.textContent.includes('작은 창')).click();
                const small = panel.getBoundingClientRect().width;
                [...panel.querySelectorAll('button')].find(b => b.textContent === '✕').click();
                return { small: small, shown: getComputedStyle(panel).display };
            }""")
            check("작은 창으로 돌아오고 닫으면 사라진다",
                  back["small"] < 700 and back["shown"] == "none",
                  f'폭 {back["small"]:.0f}px')
            page.wait_for_timeout(300)

            for box in ("ti-cad-lines", "ti-cad-rooms", "ti-cad-doors"):
                page.evaluate(f"() => document.getElementById('{box}').click()")
            page.wait_for_timeout(600)
            gone = page.evaluate(
                "() => document.querySelector('canvas.techno-cad-canvas') === null")
            check("끄면 캔버스가 지도에서 빠짐", gone)
            check("끄면 출입문 마커도 빠짐",
                  page.evaluate("() => !window.map.hasLayer(window.technoCadDoorLayer)"))
            check("기존 실내지도는 그대로 있음",
                  page.evaluate("() => window.map.hasLayer(window.technoIndoorLayerGroup)"))
            browser.close()
    finally:
        server.shutdown()

    print()
    if failures:
        print("실패: " + " / ".join(dict.fromkeys(failures)))
        return 1
    print("브라우저 검사 통과. 화면은 output/cad-layer-*.png 에 있다.")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
