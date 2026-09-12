"""CAD 도면에서 건물 밖으로 통하는 문과 개방 출입구를 찾는다.

  python GUMAP-개발/floorplan/cad/exterior_doors.py

판정 기준은 하나다: **그 개구부가 건물 외피(envelope)를 가로지르는가.**
외피는 이 도면의 벽선만으로 만든다. 층마다 따로 만든다 - 5·6층은 아래층보다
훨씬 작아서 한 건물 외곽선을 전 층에 쓰면 옥상 쪽 문이 전부 실내로 둔갑한다.

이 결과는 실제 통행 가능 여부가 아니다. 잠긴 문, 관리자 전용문, 비상구도
똑같이 '외부로 통함' 으로 나온다. 문 종류(자동문·미닫이)도 구분하지 않는다.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from shapely.geometry import LineString, Point, Polygon, mapping
from shapely.strtree import STRtree

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[2]
OUT = BASE / "output"
FLOORS = ["B1F"] + [f"{i}F" for i in range(1, 7)]

PX = 0.05                  # 래스터 한 칸 5 cm
WALL_PX = 3                # 벽선 굵기. 도면의 40 mm 이하 제도 틈을 메운다
DILATE_M = 1.2             # 벽선을 이만큼 굵혀 한 덩어리로 붙였다가 되깎는다
ROOF_CLIP_M = 3.0          # 이 층 방·복도에서 이만큼 벗어난 곳은 이 층이 아니다
CORRIDOR_THIN_M = 1.5      # 면적/둘레. 복도는 가늘고 지붕 덩어리는 굵다
CORRIDOR_MIN_M2 = 15.0     # 지붕 타일 해치로 생긴 잔 구획을 걸러 낸다
COURTYARD_MIN_M2 = 40.0    # 이보다 큰 구멍만 중정·옥외공간으로 남긴다
DOOR_RADIUS_M = (0.55, 1.6)
# 외피는 되깎기 탓에 실제 벽면보다 최대 DILATE_M 만큼 부풀 수 있다. 그래서
# 실내 쪽은 문턱 가까이, 바깥 쪽은 그 부풀음 너머에서 찔러 본다.
PROBE_IN_M = (0.6, 1.0)
PROBE_OUT_M = (1.6, 2.4)
OPENING_MIN_M = 0.9        # 문짝 없는 개구부로 인정할 최소 폭
OPEN_RUN_M = 4.0           # 나가서 이만큼 트여 있으면 바깥마당으로 본다
OPEN_RUN_LIMIT_M = 14.0    # 그 이상은 재지 않는다
LEGACY_MATCH_M = 3.0       # 기존 지도 표기와 같은 문으로 볼 거리

# 도면 영역보다 넓게 잡는다. build.py 는 평면도 창을 벗어나는 폴리라인을 통째로
# 버리는데, 남쪽 외벽이 딱 그 경계에 걸려 있어 그대로 쓰면 외피 아래가 뚫린다.
WIDE = dict(x=(-72.0, 78.0), y=(-2.0, 143.0))
PLAN = dict(x=(-55.0, 59.0), y=(12.0, 124.0))
SKIP_LAYERS = frozenset({"DIM", "CEN", "1CEN", "1W", "_CHAIR"})


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def in_box(point, box) -> bool:
    return box["x"][0] < point[0] < box["x"][1] and box["y"][0] < point[1] < box["y"][1]


class Raster:
    """도면 로컬 미터 <-> 래스터 픽셀. y 는 위가 북쪽이라 뒤집는다."""

    def __init__(self, box, px=PX, pad=4):
        self.px, self.pad = px, pad
        self.x0, self.y0 = box["x"][0], box["y"][0]
        self.w = int((box["x"][1] - self.x0) / px) + 2 * pad
        self.h = int((box["y"][1] - self.y0) / px) + 2 * pad

    def to_px(self, point):
        return (int(round((point[0] - self.x0) / self.px)) + self.pad,
                self.h - 1 - (int(round((point[1] - self.y0) / self.px)) + self.pad))

    def to_m(self, x, y):
        return (self.x0 + (x - self.pad) * self.px,
                self.y0 + ((self.h - 1 - y) - self.pad) * self.px)

    def at(self, mask, point) -> bool:
        x, y = self.to_px(point)
        if not (0 <= x < self.w and 0 <= y < self.h):
            return False
        return bool(mask[y, x])

    def blank(self):
        return np.zeros((self.h, self.w), np.uint8)


def disk(radius_m: float):
    size = int(round(radius_m / PX)) * 2 + 1
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))


def floor_segments(vectors, origin):
    """층 평면도 주변의 벽선 조각. 원본 vectors 에서 넓은 창으로 다시 자른다."""
    ox, oy = origin
    segments = []
    for path in vectors["paths"]:
        if path["kind"] == "ARC" or path["layer"] in SKIP_LAYERS:
            continue
        points = [((q[0] - ox) / 1000.0, (q[1] - oy) / 1000.0) for q in path["points"]]
        if not any(in_box(q, WIDE) for q in points):
            continue
        for a, b in zip(points, points[1:]):
            if math.dist(a, b) > 0.03:
                segments.append((a, b))
    return segments


def floor_doors(vectors, origin):
    """문짝 원호. 여닫이(90도)와 양방향 자재문(180도) 둘 다 받는다."""
    ox, oy = origin
    found = []
    for path in vectors["paths"]:
        if path["kind"] != "ARC" or path["layer"] in SKIP_LAYERS:
            continue
        arc = path["arc"]
        centre = ((arc["center"][0] - ox) / 1000.0, (arc["center"][1] - oy) / 1000.0)
        if not in_box(centre, PLAN):
            continue
        radius = arc["radius"] / 1000.0
        if not DOOR_RADIUS_M[0] <= radius <= DOOR_RADIUS_M[1]:
            continue
        sweep = (arc["end"] - arc["start"]) % 360.0

        def unit(deg):
            return (math.cos(math.radians(deg)), math.sin(math.radians(deg)))

        if 70 <= sweep <= 110:
            kind, candidates = "single", [unit(arc["start"]), unit(arc["end"])]
        elif 160 <= sweep <= 200:
            middle = unit(arc["start"] + sweep / 2)
            kind, candidates = "double_acting", [middle, (-middle[0], -middle[1])]
        else:
            continue
        found.append(dict(handle=path["handle"], layer=path["layer"], centre=centre,
                          radius_m=round(radius, 3), leaf=kind,
                          sweep_deg=round(sweep, 1), candidates=candidates))
    return found


def opening_axis(door, index, lines):
    """경첩에서 어느 쪽으로 문틀이 열려 있는가.

    여닫이 원호의 두 끝점 중 하나는 닫힌 문짝 자리, 곧 반대편 문틀에 닿는다.
    다른 하나는 방 안쪽 허공이다. 그래서 '벽에 닿는 끝점' 을 고르면 된다.
    '주변에서 가장 평행한 벽' 으로 고르면 문 옆 직각 칸막이에 끌려가 엉뚱한
    방향을 잡고, 그러면 문을 막지 못해 실내가 통째로 바깥과 이어져 버린다.
    """
    best = None
    for unit in door["candidates"]:
        far = Point(door["centre"][0] + unit[0] * door["radius_m"],
                    door["centre"][1] + unit[1] * door["radius_m"])
        gap = min((lines[i].distance(far) for i in index.query(far.buffer(0.6))), default=9.9)
        if best is None or gap < best[0]:
            best = (gap, unit)
    return best[1], round(float(best[0]), 3)


def build_envelope(raster, segments, occupied_rings):
    """이 층 건물이 차지하는 덩어리. 벽선만으로 만든다.

    벽선을 굵혀 한 덩어리로 붙이고, 구멍을 메운 뒤, 굵힌 만큼 되깎는다. 이렇게
    하면 문이 열려 있든 닫혀 있든, 도면에 문짝이 아예 없는 개방 통로가 있든
    외피가 흔들리지 않는다. 처음에는 '문을 닫고 바깥에서 채워 들어가는' 방법을
    썼는데, 1층 서쪽에 문짝 없는 폭 2 m 개방 통로가 있어서 바깥이 복도를 타고
    건물 전체로 흘러 들어갔고 실내 문 수십 개가 외부 출입문으로 둔갑했다.

    되깎기 때문에 외피는 폭 DILATE_M 미만의 오목한 파임을 메운다. 문이 외피를
    넘는지만 보는 용도이고, 실측 외벽선이 아니다.

    5·6층 도면에는 아래층 지붕 윤곽이 같이 그려져 있어 벽선만으로는 그 지붕까지
    건물로 잡는다. 그래서 마지막에 '이 층에 실제로 방이 있는 범위'로 한 번 자른다.
    """
    walls = raster.blank()
    for a, b in segments:
        if in_box(a, PLAN) or in_box(b, PLAN):
            cv2.line(walls, raster.to_px(a), raster.to_px(b), 255, WALL_PX)
    kernel = disk(DILATE_M)
    grown = cv2.dilate((walls > 0).astype(np.uint8), kernel)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(grown, connectivity=8)
    if count < 2:
        raise RuntimeError("벽선이 없어 외피를 만들 수 없다")
    blob = (labels == max(range(1, count), key=lambda i: stats[i, cv2.CC_STAT_AREA]))
    blob = blob.astype(np.uint8)

    # 바깥에서 채워 들어가 남는 곳이 구멍이다. 중정은 건물 밖으로 열려 있어
    # 덩어리를 가르므로 여기서 메워지지 않는다.
    flooded = blob.copy()
    cv2.floodFill(flooded, np.zeros((raster.h + 2, raster.w + 2), np.uint8), (0, 0), 1)
    envelope = cv2.erode(blob | (1 - flooded), kernel)

    occupied = raster.blank()
    for ring in occupied_rings:
        cv2.fillPoly(occupied, [np.array([raster.to_px(q) for q in ring], np.int32)], 1)
    envelope &= cv2.dilate(occupied, disk(ROOF_CLIP_M))

    outdoors = 1 - envelope
    count, labels, stats, _ = cv2.connectedComponentsWithStats(outdoors, connectivity=4)
    border_label = labels[0, 0]
    open_air = [i for i in range(1, count)
                if i != border_label and stats[i, cv2.CC_STAT_AREA] * PX * PX >= COURTYARD_MIN_M2]
    courtyard = np.isin(labels, open_air).astype(np.uint8) if open_air else np.zeros_like(outdoors)
    outside = (labels == border_label).astype(np.uint8)
    return envelope, outside, courtyard, walls


def envelope_rings(raster, envelope):
    """외피를 도면 로컬 미터 폴리곤으로 꺼낸다. 지도에 건물 외곽선을 그리고,
    도면 밖에 적힌 인출선 라벨을 걸러 내는 데 쓴다."""
    contours, _ = cv2.findContours(envelope, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    rings = []
    for contour in contours:
        if cv2.contourArea(contour) * PX * PX < 30.0:
            continue
        smooth = cv2.approxPolyDP(contour, 0.15 / PX, True)
        ring = [list(raster.to_m(float(p[0][0]), float(p[0][1]))) for p in smooth]
        if len(ring) >= 4:
            ring.append(ring[0])
            rings.append([[round(x, 3), round(y, 3)] for x, y in ring])
    return rings


def free_run(raster, walls, start, direction, limit=OPEN_RUN_LIMIT_M):
    """문을 나서서 그 방향으로 벽에 막히기까지 몇 m 를 걷는가."""
    distance = 0.35
    while distance < limit:
        point = (start[0] + direction[0] * distance, start[1] + direction[1] * distance)
        if raster.at(walls, point):
            return round(distance, 2)
        distance += PX
    return limit


def classify(raster, door, envelope, outdoors, courtyard, walls):
    """문 앞뒤를 찔러 한쪽이 실내, 한쪽이 건물 밖인지 본다.

    바깥이라고 나온 쪽으로 얼마나 트여 있는지도 함께 잰다. 건물 외벽의 문은
    바로 앞이 마당이라 멀리까지 트여 있고, 계단실로 나가는 문은 몇 m 앞에서
    막힌다. 외피 판정만으로는 이 둘을 못 가르는데, 계단실을 이 층 범위에
    넣으면 이번에는 진짜 외벽 문을 놓친다. 그래서 가르지 않고 등급으로 남긴다.
    """
    axis = door["axis"]
    normal = (-axis[1], axis[0])
    middle = (door["centre"][0] + axis[0] * door["radius_m"] / 2,
              door["centre"][1] + axis[1] * door["radius_m"] / 2)
    door["threshold"] = [round(middle[0], 3), round(middle[1], 3)]
    sides = []
    for sign in (1, -1):
        heading = (normal[0] * sign, normal[1] * sign)
        step = lambda d: (middle[0] + heading[0] * d, middle[1] + heading[1] * d)
        far = [step(d) for d in PROBE_OUT_M]
        sides.append(dict(point=[round(far[0][0], 3), round(far[0][1], 3)],
                          run_m=free_run(raster, walls, middle, heading),
                          indoor=all(raster.at(envelope, step(d)) for d in PROBE_IN_M),
                          outdoor=all(raster.at(outdoors, p) for p in far),
                          open_air=all(raster.at(courtyard, p) for p in far)))
    for indoor, outer in ((0, 1), (1, 0)):
        if not sides[indoor]["indoor"]:
            continue
        side = sides[outer]
        placement = "exterior" if side["outdoor"] else "courtyard" if side["open_air"] else None
        if placement:
            door["outside_run_m"] = side["run_m"]
            door["certainty"] = "high" if side["run_m"] >= OPEN_RUN_M else "low"
            return placement, side["point"]
    door["outside_run_m"] = None
    door["certainty"] = None
    return "interior", None


def find_open_gaps(raster, envelope, walls, doors):
    """문짝이 아예 없는 개방 출입구. 외피 경계에서 벽이 끊긴 자리다."""
    boundary = cv2.morphologyEx(envelope, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8))
    walled = cv2.dilate((walls > 0).astype(np.uint8), disk(0.35))
    gaps = ((boundary == 1) & (walled == 0)).astype(np.uint8)
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(gaps, connectivity=8)
    doorways = [Point(d["threshold"]) for d in doors if d.get("threshold")]
    found = []
    for i in range(1, count):
        width = max(stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]) * PX
        if width < OPENING_MIN_M:
            continue
        point = raster.to_m(*centroids[i])
        # 이미 문으로 잡은 개구부는 다시 세지 않는다.
        if any(p.distance(Point(point)) < 2.0 for p in doorways):
            continue
        if not in_box(point, PLAN):
            continue
        found.append(dict(point=[round(point[0], 3), round(point[1], 3)],
                          width_m=round(float(width), 2)))
    return found


def legacy_exterior(floor, alignment):
    """기존 이미지 기반 지도가 '외부' 라고 적어 둔 문. 대조용이다."""
    georef = read(ROOT / "GUMAP-개발/floorplan/techno_georef.json")
    origin = georef["floor_origin_px"][floor]
    scale = georef["floor_px_per_mm"][floor] * 1000
    shift = alignment["translation_m"] if alignment else [0.0, 0.0]
    found = []
    for record in read(ROOT / "GUMAP-개발/floorplan/work" / f"{floor}_labeled.json")["polygons"]:
        if record.get("type") != "door":
            continue
        if not any("외부" in str(c) for c in (record.get("connects") or [])):
            continue
        x, y = record["centroid"]
        found.append([(x - origin[0]) / scale + shift[0], -(y - origin[1]) / scale + shift[1]])
    return found


def occupied_rings(data):
    # 이 층에 실제로 사람이 쓰는 범위. 호실 번호가 찍힌 구획과, 그 사이를 잇는
    # 가늘고 긴 구획(복도)을 함께 본다. 지붕 타일 해치처럼 잘게 쪼개진 면은
    # 면적으로 걸러 낸다. 전부 DWG 에서 나온 값이고 기존 지도를 쓰지 않는다.
    occupied = []
    for space in data["spaces"]:
        if space["geometry"]["type"] != "Polygon":
            continue
        ring = space["geometry"]["coordinates"][0]
        if space["properties"]["room_ids"]:
            occupied.append(ring)
            continue
        shape_ = Polygon(ring)
        if shape_.area >= CORRIDOR_MIN_M2 and shape_.area / shape_.length < CORRIDOR_THIN_M:
            occupied.append(ring)
    return occupied


def build_floor(vectors, plan, floor):
    data = plan["floors"][floor]
    origin = data["origin_dwg_mm"]
    segments = floor_segments(vectors, origin)
    lines = [LineString([a, b]) for a, b in segments]
    index = STRtree(lines)
    doors = floor_doors(vectors, origin)
    for door in doors:
        door["axis"], door["jamb_gap_m"] = opening_axis(door, index, lines)

    raster = Raster(WIDE)
    envelope, outdoors, courtyard, walls = build_envelope(
        raster, segments, occupied_rings(data))
    for door in doors:
        door["placement"], door["outside_point"] = classify(
            raster, door, envelope, outdoors, courtyard, walls)
    gaps = find_open_gaps(raster, envelope, walls, doors)

    exterior = [d for d in doors if d["placement"] in ("exterior", "courtyard")]
    features = []
    for door in exterior:
        features.append(dict(type="Feature", geometry=mapping(Point(door["threshold"])),
            properties=dict(
                id=f'{floor}:door:{door["handle"]}', floor=floor, kind="exterior_door",
                placement=door["placement"], certainty=door["certainty"],
                leaf=door["leaf"], door_width_m=door["radius_m"],
                sweep_deg=door["sweep_deg"], outside_run_m=door["outside_run_m"],
                outside_point=door["outside_point"], source_handle=door["handle"],
                source_layer=door["layer"], jamb_gap_m=door["jamb_gap_m"],
                routing_verified=False)))
    for i, gap in enumerate(gaps, start=1):
        features.append(dict(type="Feature", geometry=mapping(Point(gap["point"])),
            properties=dict(id=f"{floor}:opening:{i}", floor=floor, kind="open_gap",
                            placement="exterior", certainty="review", leaf="none",
                            door_width_m=gap["width_m"],
                            note="외피 경계에서 벽선이 끊긴 자리다. 진짜 개방 출입구일 수도, "
                                 "중정을 면한 외피 경계일 수도 있어 지도에는 올리지 않는다.",
                            routing_verified=False)))

    # 기존 이미지 기반 지도의 '외부' 표기는 판정에 쓰지 않는다. 다만 이번 결과가
    # 그것을 얼마나 재현하는지는 남겨 둔다. 어긋난 자리가 곧 검토 목록이다.
    legacy = legacy_exterior(floor, data["report"].get("alignment"))
    matched = [p for p in legacy
               if any(math.dist(p, d["threshold"]) < LEGACY_MATCH_M for d in exterior)]
    report = dict(door_arcs=len(doors),
                  exterior=sum(d["placement"] == "exterior" for d in doors),
                  courtyard=sum(d["placement"] == "courtyard" for d in doors),
                  certainty={level: sum(d["certainty"] == level for d in exterior)
                             for level in ("high", "low")},
                  open_gaps=len(gaps),
                  envelope_m2=round(float(envelope.sum()) * PX * PX, 1),
                  legacy_exterior=len(legacy),
                  legacy_reproduced=len(matched),
                  legacy_missed=[[round(p[0], 1), round(p[1], 1)]
                                 for p in legacy if p not in matched])
    rings = envelope_rings(raster, envelope)
    report["envelope_rings"] = len(rings)
    return dict(features=features, report=report, doors=doors, raster=raster, rings=rings,
                envelope=envelope, outdoors=outdoors, courtyard=courtyard, legacy=legacy)


def main() -> int:
    vectors = read(BASE / "source/vectors.json")
    plan = read(OUT / "map.json")
    if vectors["source_sha256"] != plan["meta"]["sha256"]:
        raise SystemExit("vectors.json 과 map.json 의 DWG 해시가 다르다. build.py 를 먼저 실행하라.")

    summary = {}
    for floor in FLOORS:
        result = build_floor(vectors, plan, floor)
        (OUT / f"{floor}.entrances.local.geojson").write_text(json.dumps(
            dict(type="FeatureCollection", features=result["features"]), ensure_ascii=False),
            encoding="utf-8")
        (OUT / f"{floor}.envelope.local.geojson").write_text(json.dumps(dict(
            type="FeatureCollection", features=[dict(
                type="Feature", geometry=dict(type="Polygon", coordinates=[ring]),
                properties=dict(floor=floor, kind="floor_envelope",
                                method="CAD walls dilated/filled/eroded, clipped to this floor's "
                                       "numbered rooms and corridors",
                                status="cad_geometry_candidate"))
                for ring in result["rings"]]), ensure_ascii=False), encoding="utf-8")
        summary[floor] = result["report"]
        print(floor, json.dumps(result["report"], ensure_ascii=False), flush=True)

    (OUT / "entrances_report.json").write_text(json.dumps(dict(
        meta=dict(source=plan["meta"]["source"], sha256=plan["meta"]["sha256"], units="m",
                  coordinate_system="local CAD XY, Y up; NOT WGS84",
                  method=f"per-floor CAD envelope: walls dilated {DILATE_M} m, holes filled, "
                         f"eroded back, then clipped to the existing map's rooms + {ROOF_CLIP_M} m "
                         "so the lower roof drawn on 5F/6F is not counted; a door crossing that "
                         "envelope is exterior. Merged with the existing map's 외부 door labels.",
                  caveat="통행 가능 여부·잠금·문 종류는 확정하지 않았다. candidate 등급은 한쪽 근거뿐이다."),
        floors=summary), ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
