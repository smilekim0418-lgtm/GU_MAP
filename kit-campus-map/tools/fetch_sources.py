"""외부 원천 데이터를 받아 tools/sources/snapshots/ 에 저장한다.

빌드(build_data.py)는 이 스냅샷만 읽는다. 그래서 네트워크 없이도 같은 결과가
나오고, 원천이 바뀌면 git diff 로 무엇이 바뀌었는지 보인다.

    python tools/fetch_sources.py            # 둘 다
    python tools/fetch_sources.py kumoh      # 학교 건물목록만
    python tools/fetch_sources.py osm        # OSM 만

- kumoh: 학교 홈페이지 캠퍼스맵(campusMap.do?mode=buildList). SSO 리다이렉트를
  한 번 거치므로 쿠키를 들고 따라가야 JSON 이 나온다.
- osm: Overpass API. 미러 두 곳을 차례로 시도한다.
"""
from __future__ import annotations

import http.cookiejar
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
SNAPSHOTS = TOOLS / "sources" / "snapshots"
CONFIG = json.loads((TOOLS / "sources" / "config.json").read_text(encoding="utf-8"))

USER_AGENT = "kit-campus-map/1.0 (+https://www.kumoh.ac.kr)"
KUMOH_URL = "https://www.kumoh.ac.kr/ko/campusMap.do?mode=buildList"
OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


def fetch_kumoh() -> dict:
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.addheaders = [("User-Agent", "Mozilla/5.0"), ("Accept", "application/json")]
    # 첫 요청은 SSO 를 돌고 와서 세션 쿠키만 남긴다. 두 번째에 JSON 이 온다.
    for _ in range(2):
        with opener.open(KUMOH_URL, timeout=30) as response:
            body = response.read().decode("utf-8", errors="replace")
        try:
            data = json.loads(body)
            break
        except json.JSONDecodeError:
            continue
    else:
        raise RuntimeError("학교 건물목록 API 가 JSON 을 주지 않았다")
    items = data.get("items") or []
    if len(items) < 20:
        raise RuntimeError(f"학교 건물목록이 너무 짧다: {len(items)}개")
    items.sort(key=lambda item: int(item["id"]))
    return {"source": KUMOH_URL, "fetched_at": _now(), "items": items}


def overpass_query() -> str:
    west, south, east, north = CONFIG["context_bbox"]
    bbox = f"{south},{west},{north},{east}"
    return f"""
[out:json][timeout:90];
(
  way["building"]({bbox});
  relation["building"]({bbox});
  way["highway"]({bbox});
  way["landuse"]({bbox});
  way["leisure"]({bbox});
  way["natural"]({bbox});
  way["amenity"]({bbox});
  relation["amenity"="university"]({bbox});
  way["waterway"]({bbox});
  way["railway"]({bbox});
  node["entrance"]({bbox});
  node["highway"="bus_stop"]({bbox});
  node["barrier"="gate"]({bbox});
  node["amenity"]({bbox});
);
out body;
>;
out skel qt;
"""


def fetch_osm() -> dict:
    payload = urllib.parse.urlencode({"data": overpass_query()}).encode()
    last_error = None
    for mirror in OVERPASS_MIRRORS:
        for attempt in range(3):
            try:
                request = urllib.request.Request(
                    mirror, data=payload, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(request, timeout=120) as response:
                    data = json.loads(response.read().decode("utf-8"))
                elements = data.get("elements") or []
                if len(elements) < 100:
                    raise RuntimeError(f"OSM 응답이 너무 작다: {len(elements)}")
                # 순서를 고정해야 다시 받아도 diff 가 실제 변경만 보여 준다
                elements.sort(key=lambda e: (e["type"], e["id"]))
                return {
                    "source": mirror,
                    "license": "© OpenStreetMap contributors, ODbL 1.0",
                    "fetched_at": _now(),
                    "bbox": CONFIG["context_bbox"],
                    "elements": elements,
                }
            except Exception as error:  # 미러가 바쁘면 잠깐 쉬고 다음으로
                last_error = error
                print(f"  {mirror} 실패 ({attempt + 1}/3): {error}")
                time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"Overpass 미러 전부 실패: {last_error}")


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def save(name: str, data: dict) -> None:
    SNAPSHOTS.mkdir(parents=True, exist_ok=True)
    path = SNAPSHOTS / name
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"저장: {path.relative_to(TOOLS.parent)} ({path.stat().st_size:,} bytes)")


def main(argv: list[str]) -> None:
    targets = argv or ["kumoh", "osm"]
    if "kumoh" in targets:
        data = fetch_kumoh()
        print(f"학교 건물목록: {len(data['items'])}개")
        save("kumoh_buildlist.json", data)
    if "osm" in targets:
        data = fetch_osm()
        print(f"OSM 요소: {len(data['elements'])}개")
        save("osm.json", data)


if __name__ == "__main__":
    main(sys.argv[1:])
