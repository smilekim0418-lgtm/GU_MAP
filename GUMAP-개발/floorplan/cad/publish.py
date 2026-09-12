"""CAD 지도를 메인 GUMAP 지도에 올릴 수 있는 형태로 내보낸다.

  python GUMAP-개발/floorplan/cad/publish.py            # 무엇이 나가는지만 본다
  python GUMAP-개발/floorplan/cad/publish.py --write    # 실제로 파일을 쓴다

내보내는 것
  GUMAP-학교지도/data/cad/{층}.json   층별 CAD 선형 (cm 정수, 지연 로딩용)
  GUMAP-학교지도/data/cad/index.json  층 목록·좌표 변환·출입구
  GUMAP-프론트/js/map/map-techno-cad-data.js   (같은 내용의 프론트 번들)
  GUMAP-일반지도/map/map-techno-cad-data.js

건드리지 않는 것: IMDF 번들, 길찾기 그래프, 기존 방 폴리곤. CAD 는 별도
레이어로만 올라간다.

좌표
  CAD 로컬 미터 -> (기존 지도와 같은) 도면 로컬 미터 -> WGS84.
  가운데 단계는 층마다 구한 평행이동 하나뿐이고, 같은 호실의 방 중심끼리
  맞춘다(registration 참고). CAD 축척도 회전도 건드리지 않으며, 기존 지도의
  좌표 변환도 고치지 않는다. 두 지도가 같은 자리에 겹쳐 보여야 비교가 되기
  때문에 일부러 기존 변환에 맞춘다.
"""
from __future__ import annotations

import json
import math
import statistics
import sys
from pathlib import Path

from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[2]
OUT = BASE / "output"
DATA = ROOT / "GUMAP-학교지도" / "data" / "cad"
FLOORS = ["B1F"] + [f"{i}F" for i in range(1, 7)]

# 프론트 번들. 경로는 프로젝트 루트 기준이고, 레이어 스크립트가 자기 위치에서
# 루트를 되짚어 붙인다. 루트 index.html 과 GUMAP-일반지도/index.html 이 같은
# 스크립트를 쓰기 때문에 페이지 기준 상대경로로는 한쪽이 어긋난다.
DATA_BASE = "GUMAP-학교지도/data/cad/"
TARGETS = [
    ROOT / "GUMAP-프론트/js/map/map-techno-cad-data.js",
    ROOT / "GUMAP-일반지도/map/map-techno-cad-data.js",
]

METERS_PER_DEG_LAT = 110540.0
METERS_PER_DEG_LON_AT_EQUATOR = 111320.0
REFERENCE_LATITUDE = 36.1466

# 선형은 층마다 1만 개가 넘는다. 화면에서 1 cm 도 안 되는 선은 그려도 보이지
# 않으면서 파일만 키운다. 원본은 output/*.linework.local.geojson 에 그대로 있다.
MIN_SEGMENT_M = 0.02


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def registration(floor: str, plan: dict):
    """CAD 로컬 -> 기존 도면 로컬 평행이동. 같은 호실의 **방 중심끼리** 맞춘다.

    `build.py` 도 평행이동을 하나 구해 두지만, 그건 *CAD 번호 글자 위치* 와
    *기존 방 중심* 을 맞춘 값이다. 도면은 번호를 방 한가운데가 아니라 아래쪽에
    적는 일이 많아서, 그 치우침이 통째로 평행이동에 섞여 들어간다. 실제로 그
    값을 쓰면 일곱 층 전부가 똑같이 북쪽으로 0.57 m, 서쪽으로 0.2 m 밀렸다.
    지도에서는 CAD 벽선이 기존 방 색칠에서 한 칸 비켜 보였다.

    그래서 여기서 다시 맞춘다. 번호가 하나만 들어앉은 CAD 구획의 중심과, 같은
    번호를 가진 기존 방 폴리곤의 중심을 짝지어 축마다 중앙값을 쓴다. 평균이
    아니라 중앙값인 이유는 3층처럼 번호가 엉뚱한 방에 붙은 짝이 섞여 있어서다.

    회전은 풀지 않는다. 축마다 중앙값만 써도 잔차 중앙값이 2~11 cm 라 회전을
    넣을 이유가 없고, 넣으면 CAD 축척을 건드릴 위험만 생긴다.
    """
    data = plan["floors"][floor]
    shift = (data["report"].get("alignment") or {}).get("translation_m")
    if not shift:
        raise SystemExit(f"{floor}: build.py 가 기존 도면과의 대응을 만들지 못했다")

    cad = {}
    for space in data["spaces"]:
        ids = space["properties"]["room_ids"]
        if len(ids) == 1 and space["geometry"]["type"] == "Polygon":
            centre = Polygon(space["geometry"]["coordinates"][0]).centroid
            cad[ids[0]] = (centre.x, centre.y)
    pairs = []
    for record in data["legacy"]:
        if record["type"] != "room" or not record["id"] or record["id"] not in cad:
            continue
        if len(record["rings"][0]) < 3:
            continue
        # map.json 의 기존 폴리곤은 build.py 가 이미 CAD 쪽으로 옮겨 둔 것이다.
        centre = Polygon(record["rings"][0]).centroid
        target = (centre.x - shift[0], centre.y - shift[1])
        source = cad[record["id"]]
        pairs.append((target[0] - source[0], target[1] - source[1]))
    if len(pairs) < 6:
        raise SystemExit(f"{floor}: 방 중심 대응이 {len(pairs)}쌍뿐이라 정합을 못 맞춘다")

    move = (statistics.median(p[0] for p in pairs), statistics.median(p[1] for p in pairs))
    residual = sorted(math.dist(p, move) for p in pairs)
    return move, dict(rooms=len(pairs),
                      median_residual_m=round(residual[len(residual) // 2], 3),
                      method="median room-centroid translation, CAD scale and rotation untouched")


def affine_for(floor: str, plan: dict, georef: dict):
    """CAD 로컬 미터 (x, y) -> (lon, lat) 1차 변환 계수.

    회전·축척·이동만 있으므로 세 점을 보내 보면 계수가 그대로 나온다.
    """
    transform = georef["transform"]
    theta = math.radians(transform["theta_deg"])
    scale = transform["scale"]
    mpd_lon = METERS_PER_DEG_LON_AT_EQUATOR * math.cos(math.radians(REFERENCE_LATITUDE))
    move, fit = registration(floor, plan)

    def to_lonlat(x, y):
        px, py = x + move[0], y + move[1]
        east = scale * (px * math.cos(theta) - py * math.sin(theta))
        north = scale * (px * math.sin(theta) + py * math.cos(theta))
        return (transform["t_lon"] + east / mpd_lon,
                transform["t_lat"] + north / METERS_PER_DEG_LAT)

    origin = to_lonlat(0.0, 0.0)
    unit_x = to_lonlat(1.0, 0.0)
    unit_y = to_lonlat(0.0, 1.0)
    return dict(
        lon=[unit_x[0] - origin[0], unit_y[0] - origin[0], origin[0]],
        lat=[unit_x[1] - origin[1], unit_y[1] - origin[1], origin[1]],
        **fit), to_lonlat


def linework(floor: str, plan: dict):
    """층 선형을 cm 정수 좌표로 접는다. 선 하나는 [x0,y0,x1,y1,...] 이다."""
    paths, points = [], 0
    for path in plan["floors"][floor]["paths"]:
        flat, last = [], None
        for x, y in path["points"]:
            current = (round(x * 100), round(y * 100))
            if last is not None and math.dist(current, last) < MIN_SEGMENT_M * 100:
                continue
            flat += [current[0], current[1]]
            last = current
        if len(flat) >= 4:
            paths.append(flat)
            points += len(flat) // 2
    return paths, points


def entrances(floor: str, to_lonlat):
    found = []
    for feature in read(OUT / f"{floor}.entrances.local.geojson")["features"]:
        props = feature["properties"]
        if props["certainty"] == "review":
            continue  # 문짝 없는 개구부 후보는 검토용이다. 지도에는 올리지 않는다.
        x, y = feature["geometry"]["coordinates"]
        lon, lat = to_lonlat(x, y)
        found.append(dict(id=props["id"], floor=floor, kind=props["kind"],
                          certainty=props["certainty"], placement=props["placement"],
                          leaf=props.get("leaf"), width_m=props.get("door_width_m"),
                          outside_run_m=props.get("outside_run_m"),
                          lat=round(lat, 7), lon=round(lon, 7)))
    return found


def envelope(floor: str):
    """이 층 건물 외곽선. exterior_doors.py 가 CAD 벽선에서 만든 것을 읽는다."""
    path = OUT / f"{floor}.envelope.local.geojson"
    if not path.exists():
        raise SystemExit(f"{floor}: 외곽선이 없다. exterior_doors.py 를 먼저 실행하라.")
    return [feature["geometry"]["coordinates"][0] for feature in read(path)["features"]]


def rooms(floor: str, plan: dict, outline):
    """CAD 호실. 번호 글자 위치와, 그 번호가 들어앉은 구획 경계를 함께 낸다.

    경계는 build.py 가 벽선에서 만든 구획 후보다. 실측 방 경계가 아니고, 한
    구획에 번호가 여럿 들어간 것과 방 일부만 잘린 것은 status 로 구분해 둔다.
    번호 글자만 있고 맞는 구획을 못 찾은 호실도 점으로 남긴다. 지도에서 호실이
    통째로 사라지는 것보다는 번호라도 제자리에 있는 편이 낫다.
    """
    data = plan["floors"][floor]
    placed, found = set(), []
    for space in data["spaces"]:
        props = space["properties"]
        if not props["room_ids"] or space["geometry"]["type"] != "Polygon":
            continue
        ring = [[round(x * 100), round(y * 100)] for x, y in space["geometry"]["coordinates"][0]]
        centre = Polygon(space["geometry"]["coordinates"][0]).representative_point()
        placed.update(props["room_ids"])
        found.append(dict(ids=props["room_ids"], status=props["status"],
                          area_m2=props["area_m2"],
                          at=[round(centre.x * 100), round(centre.y * 100)],
                          ring=[value for point in ring for value in point]))
    # 구획을 못 찾은 번호는 글자 자리에 점으로 남긴다. 다만 도면에서 방 밖에
    # 인출선으로 빼 적은 번호가 있어(계단 옆 155 처럼) 그대로 찍으면 건물 밖에
    # 번호가 떠 버린다. 외곽선 밖의 글자는 방 위치가 아니므로 뺀다.
    dropped = []
    for text in data["texts"]:
        if not text.get("room_id") or text["room_id"] in placed:
            continue
        placed.add(text["room_id"])
        if not outline.covers(Point(text["p"])):
            dropped.append(text["room_id"])
            continue
        found.append(dict(ids=[text["room_id"]], status="label_only", area_m2=None,
                          at=[round(text["p"][0] * 100), round(text["p"][1] * 100)],
                          ring=None))
    return found, sorted(dropped)


def main() -> int:
    write = "--write" in sys.argv
    plan = read(OUT / "map.json")
    georef = read(ROOT / "GUMAP-개발/floorplan/techno_georef.json")

    index = dict(
        meta=dict(source=plan["meta"]["source"], sha256=plan["meta"]["sha256"],
                  units="linework is centimetres in CAD local XY, Y up; apply the per-floor "
                        "affine to get WGS84",
                  registration="per-floor median room-centroid translation onto the existing "
                               "image-based map; CAD scale, CAD rotation and the existing "
                               "georeference are all unchanged",
                  routing_verified=False),
        floors=[])
    bundles = {}
    for floor in FLOORS:
        affine, to_lonlat = affine_for(floor, plan, georef)
        paths, points = linework(floor, plan)
        doors = entrances(floor, to_lonlat)
        rings = envelope(floor)
        outline = unary_union([Polygon(ring) for ring in rings])
        spaces, outside_labels = rooms(floor, plan, outline)
        bundles[floor] = dict(floor=floor, affine=affine, paths=paths, rooms=spaces,
                              outline=[[value for point in ring for value in
                                        (round(point[0] * 100), round(point[1] * 100))]
                                       for ring in rings])
        numbers = sorted({rid for space in spaces for rid in space["ids"]})
        index["floors"].append(dict(
            floor=floor, affine=affine, entrances=doors, room_count=len(numbers),
            outlined_rooms=sum(1 for s in spaces if s["ring"]),
            labels_outside_building=outside_labels,
            path_count=len(paths), point_count=points))
        size = len(json.dumps(bundles[floor], separators=(",", ":")))
        print(f"{floor}: 선 {len(paths):6d}개 · {size / 1048576:5.2f} MB · 호실 {len(numbers):3d}개"
              f"(경계 있음 {sum(1 for s in spaces if s['ring']):3d}) · 출입문 {len(doors):2d}개"
              f"(트인 곳 {sum(d['certainty'] == 'high' for d in doors)})", flush=True)

    doors = [d for f in index["floors"] for d in f["entrances"]]
    print(f"\n호실 {sum(f['room_count'] for f in index['floors'])}개"
          f"(경계 있음 {sum(f['outlined_rooms'] for f in index['floors'])}개) · "
          f"출입문 {len(doors)}개(트인 곳 {sum(d['certainty'] == 'high' for d in doors)}개)")
    if not write:
        print("\n미리보기만 했다. 실제로 쓰려면 --write 를 붙여라.")
        return 0

    DATA.mkdir(parents=True, exist_ok=True)
    for floor, bundle in bundles.items():
        (DATA / f"{floor}.json").write_text(
            json.dumps(bundle, separators=(",", ":")), encoding="utf-8")
    (DATA / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"\nCAD 데이터: {DATA}")

    payload = dict(index, base=DATA_BASE)
    for target in TARGETS:
        if not target.parent.exists():
            print(f"건너뜀: {target.parent} 없음")
            continue
        target.write_text(
            "window.TECHNO_CAD = " + json.dumps(payload, ensure_ascii=False,
                                                separators=(",", ":")) + ";\n",
            encoding="utf-8")
        print(f"프론트 번들: {target}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
