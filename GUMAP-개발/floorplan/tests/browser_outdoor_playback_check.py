"""건물 밖에서 출발한 경로의 재생.

실외 구간은 도면 픽셀이 없어서 재생 타임라인이 그 구간을 계단으로 오인하기
쉽다. 실제로 그랬다. 밖에서 출발한 경로를 끝까지 재생해서 확인한다.

  · 첫 구간이 "건물 밖 이동" 으로 잡히고 계단·엘리베이터로 둔갑하지 않는다
  · 걷는 마커가 건물 밖에서 출발해 건물 쪽으로 실제로 움직인다
  · 끝까지 재생하면 목적지 층에 도착해 있다

  python tests/browser_outdoor_playback_check.py
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright  # noqa: E402

URL = "http://localhost:3000/index.html"
SHOTS = Path(__file__).resolve().parent / "shots"
TECHNO = (36.146643, 128.394348)
OUTSIDE = (36.14570, 128.39330)      # 테크노관 남서쪽 바깥


def main() -> int:
    problems = []
    SHOTS.mkdir(exist_ok=True)
    with sync_playwright() as play:
        browser = play.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_function("() => !!window.TECHNO_NAV_DATA", timeout=30000)
        page.evaluate("(c) => { window.map.setView(c, 19); }", list(TECHNO))
        page.wait_for_timeout(1200)

        room = page.evaluate("""() => {
            const e = window.TechnoRoute.load(window.TECHNO_NAV_DATA);
            const r = e.rooms().filter(x => x.floor === '4F' && x.corridor_doors > 0)[0];
            return { room_id: r.room_id, floor: r.floor };
        }""")
        print(f"목적지: {room['floor']} {room['room_id']}")

        # 건물 밖을 출발지로 잡고, 방 팝업의 "여기까지 길찾기" 와 같은 경로를 탄다
        page.evaluate("(c) => window.setRoutingPoint('START', c[0], c[1], '건물 밖 지점')",
                      list(OUTSIDE))
        page.wait_for_timeout(600)
        page.evaluate("(t) => window.routeToTechnoRoom(t.room_id, null)", room)
        page.wait_for_timeout(900)

        summary = page.evaluate("""() => {
            const r = window.getTechnoRouteResult();
            if (!r || r.error) return { error: (r && r.error) || '결과 없음' };
            return { entrance: r.entrance.name, outdoor_m: r.outdoor_distance_m,
                     firstLeg: r.legs[0].mode, floors: r.legs.map(l => l.mode) };
        }""")
        if summary.get("error"):
            print(f"경로 실패: {summary['error']}")
            return 1
        print(f"경로: {summary['entrance']} 진입 · 실외 {summary['outdoor_m']:.0f}m · "
              f"구간 {summary['floors']}")

        # 재생 시작
        page.evaluate("() => window.playTechnoRoute()")
        page.wait_for_timeout(500)
        first = page.evaluate("""() => {
            const m = document.querySelector('.techno-route-walker');
            const rect = m ? m.getBoundingClientRect() : null;
            return {
                walker: !!m,
                x: rect ? Math.round(rect.left) : null,
                y: rect ? Math.round(rect.top) : null,
                label: (document.getElementById('tr-play-label') || {}).textContent || '',
                floor: window.technoActiveFloor
            };
        }""")
        print(f"재생 직후: {first['label']!r} · 층 {first['floor']}")
        if not first["walker"]:
            problems.append("재생했는데 걷는 마커가 없다")
        if "건물 밖" not in first["label"]:
            problems.append(f"첫 구간이 실외로 안내되지 않는다: {first['label']!r}")
        for word in ("계단", "엘리베이터"):
            if word in first["label"]:
                problems.append(f"실외 구간이 {word} 로 둔갑했다: {first['label']!r}")

        page.screenshot(path=str(SHOTS / "outdoor-playback-start.png"))

        # 실외 구간을 걷는 동안 마커가 움직이는가
        page.wait_for_timeout(1400)
        moving = page.evaluate("""() => {
            const m = document.querySelector('.techno-route-walker');
            const rect = m ? m.getBoundingClientRect() : null;
            return { x: rect ? Math.round(rect.left) : null,
                     y: rect ? Math.round(rect.top) : null,
                     label: (document.getElementById('tr-play-label') || {}).textContent || '' };
        }""")
        shift = abs((moving["x"] or 0) - (first["x"] or 0)) + \
                abs((moving["y"] or 0) - (first["y"] or 0))
        print(f"1.4초 뒤: {shift}px 이동 · {moving['label']!r}")
        if shift < 5:
            problems.append(f"재생 중인데 마커가 안 움직인다 ({shift}px)")

        # 끝까지. 재생 시간은 경로 길이에 비례한다. 고정으로 기다리면 안 된다
        # (실외에 보행자 경로가 붙으면서 100m 짜리가 650m 가 됐다).
        page.evaluate("() => window.setTechnoRouteSpeed(4)")
        need = page.evaluate(
            "() => Math.ceil(window.getTechnoRouteResult().distance_m / 12 / 4 * 1000)")
        page.wait_for_timeout(min(need + 5000, 90000))
        end = page.evaluate("""() => ({
            progress: parseFloat((document.getElementById('tr-play-progress')
                     || {style:{}}).style.width) || 0,
            floor: window.technoActiveFloor,
            label: (document.getElementById('tr-play-label') || {}).textContent || ''
        })""")
        print(f"끝: 진행 {end['progress']:.0f}% · 층 {end['floor']} · {end['label']!r}")
        if end["progress"] < 95:
            problems.append(f"끝까지 재생되지 않았다 ({end['progress']:.0f}%)")
        if end["floor"] != room["floor"]:
            problems.append(f"도착 층이 아니다: {end['floor']} (기대 {room['floor']})")

        page.screenshot(path=str(SHOTS / "outdoor-playback-end.png"))

        real = [e for e in errors if "ResizeObserver" not in e]
        if real:
            problems.append(f"JS 오류 {len(real)}건: {real[0][:120]}")
        browser.close()

    if problems:
        print("\n문제:")
        for problem in problems:
            print(f"  · {problem}")
        return 1
    print("\n실외 출발 재생 확인 통과")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
