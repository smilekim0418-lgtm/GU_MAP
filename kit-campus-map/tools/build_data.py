"""원천 데이터 → site/data/*.json

    python tools/build_data.py

읽는 것
  tools/sources/config.json              캠퍼스 범위·옵션
  tools/sources/buildings.json           수기: 건물 상세·학과·시설
  tools/sources/paths_manual.geojson     OSM 에 없는 보행로
  tools/sources/snapshots/*.json         fetch_sources.py 가 받아 둔 OSM·학교 API
  (저장소 루트) GUMAP-개발/floorplan/work/techno_nav.json      테크노관 실내 그래프
  (저장소 루트) GUMAP-학교지도/data/imdf/techno/*.geojson     테크노관 IMDF
  (저장소 루트) GUMAP-데이터/data/kumoh_techno_rooms.json     테크노관 방 정보
  (저장소 루트) GUMAP-개발/floorplan/techno-route-core.js     실내 길찾기 엔진

쓰는 것
  site/data/basemap.geojson     배경 (캠퍼스 경계·녹지·운동장·주차장·도로)
  site/data/buildings.geojson   건물 외곽선
  site/data/places.json         건물·학과/시설·방·정문·정류장 (검색·상세·길찾기)
  site/data/walk-graph.json     실외 보행 그래프
  site/data/techno/nav.json     실내 그래프 (원본 그대로)
  site/data/techno/imdf.json    실내 도면 (층·방·문만, 좌표 축약)
  site/vendor/techno-route-core.js
  확인필요목록.md
"""
from __future__ import annotations

import json
import math
import re
import shutil
import time
from collections import defaultdict
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
APP = TOOLS.parent
REPO = APP.parent
SOURCES = TOOLS / "sources"
SITE = APP / "site"
DATA = SITE / "data"

TECHNO_NAV = REPO / "GUMAP-개발" / "floorplan" / "work" / "techno_nav.json"
TECHNO_IMDF = REPO / "GUMAP-학교지도" / "data" / "imdf" / "techno"
TECHNO_ROOMS = REPO / "GUMAP-데이터" / "data" / "kumoh_techno_rooms.json"
ROUTE_CORE = REPO / "GUMAP-개발" / "floorplan" / "techno-route-core.js"

CONFIG = json.loads((SOURCES / "config.json").read_text(encoding="utf-8"))
LON0 = (CONFIG["bbox"][0] + CONFIG["bbox"][2]) / 2
LAT0 = (CONFIG["bbox"][1] + CONFIG["bbox"][3]) / 2
M_PER_LAT = 110_574.0
M_PER_LON = 111_320.0 * math.cos(math.radians(LAT0))

# 걸어갈 수 있는 길. 학교 안 차도(service)도 보행자가 실제로 걷는다.
WALKABLE = {
    "footway", "path", "pedestrian", "steps", "service", "residential",
    "unclassified", "living_street", "tertiary", "secondary", "track",
    "corridor", "cycleway",
}
ROAD_MAJOR = {"primary", "secondary", "tertiary", "trunk"}
ROAD_MINOR = {"residential", "unclassified", "service", "living_street"}
FLAG_STEPS = 1
FLAG_CONNECTOR = 2

FLOORS = ["B1F", "1F", "2F", "3F", "4F", "5F", "6F"]
FLOOR_HEIGHT_M = 3.8

# 개인 이름(교수 연구실)을 가려낼 때, 이 말로 끝나면 시설 이름이다.
# 테크노관 방 이름에서 2~4 글자인데 이렇게 끝나지 않는 것은 전부 사람 이름이었다.
FACILITY_SUFFIXES = ("실", "센터", "홀", "라운지", "카페", "창고", "로비")
# 2~4 글자이고 '실' 로 끝나지 않지만 사람 이름이 아닌 공간 이름
NOT_PEOPLE = {"복도", "계단", "현관", "로비", "매점", "창고", "통로"}

# 방 정보 엑셀의 학과 칸은 손으로 적어 오타·옛 이름이 섞여 있다. 공식 이름으로 맞춘다.
DEPT_CANON = {
    "재료공학부": ("재료공학부", "School of Materials Science and Engineering"),
    "기계시스템공학부": ("기계시스템공학전공", "Mechanical System Engineering"),
    "기계시스템 공학부": ("기계시스템공학전공", "Mechanical System Engineering"),
    "기계시스템공학전공": ("기계시스템공학전공", "Mechanical System Engineering"),
    "기계시스템공학부전공": ("기계시스템공학전공", "Mechanical System Engineering"),
    "기계시스템광학부": ("기계시스템공학전공", "Mechanical System Engineering"),
    "기계시스템 광학부": ("기계시스템공학전공", "Mechanical System Engineering"),
    "기계시스템공하부": ("기계시스템공학전공", "Mechanical System Engineering"),
    "기계공학과": ("기계공학전공", "Mechanical Engineering"),
    "기계공학부": ("기계공학전공", "Mechanical Engineering"),
    "광시스템 공학과": ("광시스템공학과", "Optical Systems Engineering"),
    "광시스템공학과": ("광시스템공학과", "Optical Systems Engineering"),
    "교향학부": ("교양학부", "School of Liberal Arts"),
    "산학협력단": ("산학협력단", "Industry-Academic Cooperation Foundation"),
    "인공지능과": ("인공지능공학전공", "Artificial Intelligence Engineering"),
    "건축학과": ("건축학전공", "Architecture"),
    "(ICT융합특성화연구센터)": ("ICT융합특성화연구센터", "ICT Convergence Research Center"),
    "바이오메디컬공학과": ("바이오메디컬공학과", "Biomedical Engineering"),
}

PHONE_LABEL_EN = {
    "행정실": "Admin Office", "대표전화": "Main Line", "안내데스크": "Information Desk",
    "수서정리": "Acquisitions", "열람": "Circulation", "총학생회장": "Student Council President",
    "총학생회": "Student Council", "총야간학생회": "Evening Student Council",
    "학생군사교육": "ROTC Office", "골프학습": "Golf Range", "공동실험실습관": "Main Office",
    "사무국 시설안전과": "Facility Safety Team", "사무국 시설팀": "Facilities Team",
    "사무국 관리팀": "Management Team", "창업진흥센터": "Startup Promotion Center",
    "교수학습개발센터": "Center for Teaching and Learning",
    "중소기업산학협력센터": "SME Industry-University Cooperation Center",
    "국제교류교육원": "Office of International Affairs",
    "푸름관 행정실": "Pureum Hall Office", "오름관 행정실": "Oreum Hall Office",
}


# ───────────────────────── 기하 ─────────────────────────

def to_xy(lon: float, lat: float) -> tuple[float, float]:
    return ((lon - LON0) * M_PER_LON, (lat - LAT0) * M_PER_LAT)


def to_lonlat(x: float, y: float) -> tuple[float, float]:
    return (x / M_PER_LON + LON0, y / M_PER_LAT + LAT0)


def meters(a, b) -> float:
    ax, ay = to_xy(*a)
    bx, by = to_xy(*b)
    return math.hypot(ax - bx, ay - by)


def project(p, a, b):
    """점 p 를 선분 ab 에 투영. (투영점 lonlat, t, 거리 m)"""
    px, py = to_xy(*p)
    ax, ay = to_xy(*a)
    bx, by = to_xy(*b)
    dx, dy = bx - ax, by - ay
    length2 = dx * dx + dy * dy
    t = 0.0 if length2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length2))
    qx, qy = ax + t * dx, ay + t * dy
    return to_lonlat(qx, qy), t, math.hypot(px - qx, py - qy)


def ring_area_centroid(ring):
    """(면적 m², 무게중심 lonlat). 링은 닫혀 있다고 본다."""
    pts = [to_xy(*p) for p in ring]
    area = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
        cross = x1 * y2 - x2 * y1
        area += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    area /= 2
    if abs(area) < 1e-9:
        xs, ys = zip(*pts)
        return 0.0, to_lonlat(sum(xs) / len(xs), sum(ys) / len(ys))
    return abs(area), to_lonlat(cx / (6 * area), cy / (6 * area))


def point_in_ring(point, ring) -> bool:
    x, y = point
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-15) + x1:
            inside = not inside
    return inside


def rnd(coord, digits=6):
    return [round(coord[0], digits), round(coord[1], digits)]


def in_bbox(point, bbox) -> bool:
    return bbox[0] <= point[0] <= bbox[2] and bbox[1] <= point[1] <= bbox[3]


# ───────────────────────── 원천 읽기 ─────────────────────────

def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_js_assignment(path: Path):
    text = path.read_text(encoding="utf-8")
    return json.loads(text[text.index("{"):text.rstrip().rstrip(";").rindex("}") + 1])


class Osm:
    def __init__(self, snapshot: dict):
        self.nodes = {}
        self.node_tags = {}
        self.ways = {}
        for element in snapshot["elements"]:
            if element["type"] == "node":
                self.nodes[element["id"]] = (element["lon"], element["lat"])
                if element.get("tags"):
                    self.node_tags[element["id"]] = element["tags"]
            elif element["type"] == "way":
                self.ways[element["id"]] = element
        self.fetched_at = snapshot.get("fetched_at")

    def coords(self, way_id: int):
        way = self.ways[way_id]
        return [self.nodes[n] for n in way["nodes"] if n in self.nodes]

    def ring(self, way_id: int):
        coords = self.coords(way_id)
        if coords and coords[0] == coords[-1]:
            coords = coords[:-1]
        return coords

    def tagged_ways(self):
        for way in self.ways.values():
            if way.get("tags"):
                yield way


# ───────────────────────── 학교 건물목록 ─────────────────────────

def clean_html(text: str) -> str:
    text = text.replace("&nbsp;", " ")
    return re.sub(r"<[^>]+>", "\n", text)


def normalize_phone(raw: str) -> str:
    raw = raw.strip().replace(" ", "")
    raw = re.sub(r"^054\)", "054-", raw)
    if re.match(r"^\d{3,4}-\d{4}", raw):
        raw = "054-" + raw
    return raw


def parse_phones(contents: str, keep_main_line: bool):
    phones = []
    for line in clean_html(contents or "").splitlines():
        line = line.strip().lstrip("-").strip()
        if ":" not in line:
            continue  # 앞 줄에 이어지는 번호 조각. 무엇의 번호인지 알 수 없어 버린다
        label, number = (part.strip() for part in line.split(":", 1))
        if not keep_main_line and label in ("대표전화", "안내데스크"):
            continue
        phones.append({
            "label": {"ko": label, "en": PHONE_LABEL_EN.get(label, label)},
            "number": normalize_phone(number),
        })
    return phones


# ───────────────────────── 보행 그래프 ─────────────────────────

class WalkGraph:
    def __init__(self):
        self.nodes: list[tuple[float, float]] = []
        self.index: dict = {}
        self.edges: list[list] = []  # [a, b, meters, flags, alive]

    def node(self, key, point) -> int:
        if key in self.index:
            return self.index[key]
        self.index[key] = len(self.nodes)
        self.nodes.append(point)
        return self.index[key]

    def add_edge(self, a: int, b: int, flags: int = 0):
        if a == b:
            return
        self.edges.append([a, b, meters(self.nodes[a], self.nodes[b]), flags, True])

    def nearest_edge(self, point):
        best = None
        for i, (a, b, _, flags, alive) in enumerate(self.edges):
            if not alive or flags & FLAG_CONNECTOR:
                continue
            q, t, d = project(point, self.nodes[a], self.nodes[b])
            if best is None or d < best[3]:
                best = (i, q, t, d)
        return best

    def attach(self, point, key) -> tuple[int, float]:
        """점을 가장 가까운 엣지에 붙인다. (점 노드, 그래프까지 거리 m)"""
        i, q, t, d = self.nearest_edge(point)
        a, b, _, flags, _ = self.edges[i]
        if t <= 0.001 or meters(q, self.nodes[a]) < 0.5:
            joint = a
        elif t >= 0.999 or meters(q, self.nodes[b]) < 0.5:
            joint = b
        else:
            joint = self.node(("split", key), q)
            self.edges[i][4] = False
            self.add_edge(a, joint, flags)
            self.add_edge(joint, b, flags)
        if d < 0.5:
            return joint, d
        own = self.node(("attach", key), point)
        self.add_edge(own, joint, FLAG_CONNECTOR)
        return own, d

    def largest_component(self):
        parent = list(range(len(self.nodes)))

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        for a, b, _, _, alive in self.edges:
            if alive:
                parent[find(a)] = find(b)
        sizes = defaultdict(int)
        for i in range(len(self.nodes)):
            sizes[find(i)] += 1
        keep_root = max(sizes, key=sizes.get)
        return {i for i in range(len(self.nodes)) if find(i) == keep_root}

    def prune_to(self, keep: set[int]):
        """keep 밖 노드를 버리고 번호를 다시 매긴다."""
        remap = {}
        nodes = []
        for i, point in enumerate(self.nodes):
            if i in keep:
                remap[i] = len(nodes)
                nodes.append(point)
        edges = []
        for a, b, m, flags, alive in self.edges:
            if alive and a in remap and b in remap:
                edges.append([remap[a], remap[b], m, flags, True])
        self.nodes, self.edges = nodes, edges
        self.index = {key: remap[i] for key, i in self.index.items() if i in remap}

    def export(self):
        used = set()
        for a, b, *_rest in self.edges:
            used.update((a, b))
        return {
            "nodes": [rnd(p, 7) for p in self.nodes],
            "edges": [[a, b, round(m, 1), flags] for a, b, m, flags, alive in self.edges if alive],
        }


def build_walk_graph(osm: Osm) -> WalkGraph:
    graph = WalkGraph()
    bbox = CONFIG["context_bbox"]
    for way in osm.tagged_ways():
        tags = way["tags"]
        highway = tags.get("highway")
        if highway not in WALKABLE or tags.get("foot") == "no" or tags.get("area") == "yes":
            continue
        flags = FLAG_STEPS if highway == "steps" else 0
        ids = [n for n in way["nodes"] if n in osm.nodes]
        for a, b in zip(ids, ids[1:]):
            pa, pb = osm.nodes[a], osm.nodes[b]
            if not (in_bbox(pa, bbox) or in_bbox(pb, bbox)):
                continue
            graph.add_edge(graph.node(("osm", a), pa), graph.node(("osm", b), pb), flags)

    manual = load_json(SOURCES / "paths_manual.geojson")
    for number, feature in enumerate(manual["features"]):
        flags = FLAG_STEPS if feature.get("properties", {}).get("steps") else 0
        previous = None
        for k, coord in enumerate(feature["geometry"]["coordinates"]):
            point = (coord[0], coord[1])
            # 끝점은 기존 길에 잇는다. 3 m 안에 노드가 있으면 그 노드를 쓴다.
            current = None
            if k in (0, len(feature["geometry"]["coordinates"]) - 1):
                for i, existing in enumerate(graph.nodes):
                    if meters(existing, point) < 3:
                        current = i
                        break
            if current is None:
                current = graph.node(("manual", number, k), point)
            if previous is not None:
                graph.add_edge(previous, current, flags)
            previous = current

    graph.prune_to(graph.largest_component())
    return graph


def pick_entrances(graph: WalkGraph, rings, limit=3):
    """외곽선 꼭짓점 중 길에서 가까운 것을 출입구 후보로 고른다 (추정)."""
    candidates = []
    for ring in rings:
        for vertex in ring:
            hit = graph.nearest_edge(vertex)
            candidates.append((hit[3], vertex))
    candidates.sort(key=lambda row: row[0])
    chosen = []
    for distance, vertex in candidates:
        if chosen and distance > 35:
            break
        if all(meters(vertex, other) >= 30 for _, other in chosen):
            chosen.append((distance, vertex))
        if len(chosen) >= limit:
            break
    return [vertex for _, vertex in chosen]


# ───────────────────────── 방 이름 ─────────────────────────

def looks_like_person(name: str) -> bool:
    return (bool(re.fullmatch(r"[가-힣]{2,4}", name)) and name not in NOT_PEOPLE
            and not name.endswith(FACILITY_SUFFIXES))


# ───────────────────────── 본체 ─────────────────────────

def main():
    started = time.time()
    osm = Osm(load_json(SOURCES / "snapshots" / "osm.json"))
    official_snapshot = load_json(SOURCES / "snapshots" / "kumoh_buildlist.json")
    official = {item["id"]: item for item in official_snapshot["items"]}
    manual = load_json(SOURCES / "buildings.json")
    source_urls = manual["sources"]
    review = defaultdict(list)  # 확인필요목록.md

    def source_url(key):
        return source_urls.get(key, key)

    # ── 캠퍼스 경계
    campus_way = next(w for w in osm.tagged_ways() if w["tags"].get("amenity") == "university")
    campus_ring = osm.ring(campus_way["id"])
    # 처음 화면·"캠퍼스 전체 보기"가 맞출 범위. 경계선에 바짝 붙지 않게 30 m 쯤 띄운다.
    margin = 0.0003
    campus_bbox = [round(min(p[0] for p in campus_ring) - margin, 6), round(min(p[1] for p in campus_ring) - margin, 6),
                   round(max(p[0] for p in campus_ring) + margin, 6), round(max(p[1] for p in campus_ring) + margin, 6)]

    # ── 건물
    used_osm = set()
    buildings_out, shapes, units_out = [], [], []
    for entry in manual["buildings"]:
        bid = entry["id"]
        item = official.get(entry.get("official_id", ""), None)
        name = {"ko": "", "en": ""}
        if item:
            name = {"ko": item["koNm"].strip(), "en": (item.get("enNm") or "").strip()}
        if entry.get("name"):
            name.update(entry["name"])
            if not entry.get("name_verified", True):
                review["names"].append((bid, name["ko"], f"이름 출처: {source_url(entry.get('name_source', ''))}"))
        override = entry.get("name_override")
        if override:
            for lang in ("ko", "en"):
                if override.get(lang):
                    name[lang] = override[lang]
            if not override.get("verified", True):
                review["names"].append((bid, name["ko"], f"영문명 '{name['en']}' — {override['reason']}"))
        if not name["en"] or name["en"] == name["ko"]:
            raise SystemExit(f"{bid} {name['ko']}: 영문명이 없다. buildings.json 에 name_override.en 을 넣어라")

        polygons = []  # (ring, part_name)
        for way_id in entry.get("osm", []):
            polygons.append((osm.ring(way_id), None))
            used_osm.add(way_id)
        for part in entry.get("parts", []):
            polygons.append((osm.ring(part["osm"]), part["name"]))
            used_osm.add(part["osm"])
        if not polygons:
            raise SystemExit(f"{bid}: 외곽선(osm)이 없다")
        if entry.get("osm_note"):
            review["osm"].append((bid, name["ko"], entry["osm_note"]))

        total_area = cx = cy = 0.0
        parts_out = []
        for ring, part_name in polygons:
            area, centroid = ring_area_centroid(ring)
            x, y = to_xy(*centroid)
            total_area += area
            cx += x * area
            cy += y * area
            if part_name:
                parts_out.append({"name": part_name, "center": rnd(centroid)})
        center = to_lonlat(cx / total_area, cy / total_area)
        # 여러 동이면 무게중심이 건물 사이 빈 땅에 떨어질 수 있다. 학교가 찍은 점을 쓴다.
        if len(polygons) > 1 and item and entry.get("parts"):
            center = (float(item["longtitude"]), float(item["latitude"]))

        floors = entry.get("floors")
        if floors and not floors.get("verified", True):
            review["floors"].append((bid, name["ko"], f"지상 {floors['above']}층 · 지하 {floors['below']}층 (출처: {source_url(floors['source'])})"))
        height = (floors["above"] * FLOOR_HEIGHT_M) if floors else (0 if entry.get("area") else 9)

        for ring, part_name in polygons:
            shapes.append({
                "type": "Feature",
                "properties": {
                    "id": bid, "no": int(item["id"]) if item else None,
                    "category": entry["category"], "area": bool(entry.get("area")),
                    "height": round(height, 1),
                    "part": part_name["ko"] if part_name else None,
                },
                "geometry": {"type": "Polygon", "coordinates": [[rnd(p) for p in ring + ring[:1]]]},
            })

        phones = parse_phones(item.get("krContents", "") if item else "", keep_main_line=(bid == "b1"))
        building = {
            "id": bid,
            "no": int(item["id"]) if item else None,
            "category": entry["category"],
            "name": name,
            "aliases": entry.get("aliases", []),
            "center": rnd(center),
            "phones": phones,
            "area": bool(entry.get("area")),
            "indoor": entry.get("indoor"),
        }
        if floors:
            building["floors"] = {"above": floors["above"], "below": floors["below"],
                                  "verified": floors.get("verified", True)}
        if entry.get("description"):
            building["description"] = entry["description"]
            building["description_source"] = source_url(entry.get("description_source", ""))
        if parts_out:
            building["parts"] = parts_out
        if entry.get("gate"):
            building["gate"] = entry["gate"]
        building["_rings"] = [ring for ring, _ in polygons]
        buildings_out.append(building)

        for k, unit in enumerate(entry.get("units", [])):
            row = {
                "id": f"{bid}-u{k + 1}", "building": bid, "kind": unit["kind"],
                "name": unit["name"], "verified": unit.get("verified", False),
                "source": source_url(unit.get("source", "")),
            }
            for key in ("type", "floor", "room", "hours", "note", "phone"):
                if unit.get(key):
                    row[key] = unit[key]
            units_out.append(row)
            if not row["verified"]:
                review["units"].append((bid, name["ko"], f"{unit['name']['ko']} — 출처: {row['source']}"))

    # ── 매칭 안 된 캠퍼스 안 건물 (회색, 이름 없음)
    for way in osm.tagged_ways():
        if "building" not in way["tags"] or way["id"] in used_osm:
            continue
        ring = osm.ring(way["id"])
        if len(ring) < 3:
            continue
        _, centroid = ring_area_centroid(ring)
        if not point_in_ring(centroid, campus_ring):
            continue
        shapes.append({
            "type": "Feature",
            "properties": {"id": None, "no": None, "category": "other", "area": False,
                           "height": 6, "part": None},
            "geometry": {"type": "Polygon", "coordinates": [[rnd(p) for p in ring + ring[:1]]]},
        })

    # ── 보행 그래프 + 출입구
    graph = build_walk_graph(osm)
    nav = load_json(TECHNO_NAV)
    for building in buildings_out:
        entrances = []
        if building.get("indoor") == "techno":
            for k, door in enumerate(nav["entrances"]):
                point = (door["lon"], door["lat"])
                node, gap = graph.attach(point, (building["id"], "door", k))
                entrances.append({"node": node, "point": rnd(point, 7), "estimated": False,
                                  "name": {"ko": door["name"]}, "techno_node": door["node"]})
        else:
            for k, vertex in enumerate(pick_entrances(graph, building["_rings"])):
                node, gap = graph.attach(vertex, (building["id"], "entrance", k))
                entrances.append({"node": node, "point": rnd(vertex, 7), "estimated": True})
                if gap > 40:
                    review["entrances_far"].append((building["id"], building["name"]["ko"], f"가장 가까운 길까지 {gap:.0f} m"))
        building["entrances"] = entrances

    gates = []
    gate_item = official["21"]
    gate_point = (float(gate_item["longtitude"]), float(gate_item["latitude"]))
    node, _ = graph.attach(gate_point, ("gate", "main"))
    gates.append({"id": "main", "name": {"ko": "정문", "en": "Main Gate"},
                  "point": rnd(gate_point, 7), "node": node, "building": "b21"})

    bus_stops = []
    bus_names_en = CONFIG.get("bus_stop_names_en", {})
    for node_id, tags in sorted(osm.node_tags.items()):
        if tags.get("highway") != "bus_stop":
            continue
        point = osm.nodes[node_id]
        if not in_bbox(point, CONFIG["context_bbox"]):
            continue
        name_ko = tags.get("name:ko") or tags.get("name")
        node, _ = graph.attach(point, ("bus", node_id))
        bus_stops.append({
            "id": f"bus{node_id}",
            "name": {"ko": name_ko, "en": tags.get("name:en") or bus_names_en.get(name_ko, name_ko)},
            "ref": tags.get("ref"), "point": rnd(point, 7), "node": node,
        })
        if not tags.get("name:en") and name_ko not in bus_names_en:
            review["names"].append((f"bus{node_id}", name_ko, "정류장 영문명이 없다 (config.json bus_stop_names_en)"))

    # ── 테크노관 방
    show_person = CONFIG.get("show_person_names", False)
    nav_rooms = {(r["floor"], r["room_id"]) for r in nav["rooms"]}
    imdf_units = load_json(TECHNO_IMDF / "unit.geojson")["features"]
    imdf_levels = load_json(TECHNO_IMDF / "level.geojson")["features"]
    level_floor = {f["id"]: f["properties"]["short_name"]["ko-KR"] for f in imdf_levels}
    unit_category = {}
    for f in imdf_units:
        label = (f["properties"].get("label") or {}).get("ko-KR")
        if label:
            unit_category[(level_floor.get(f["properties"]["level_id"]), label)] = f["properties"]["category"]

    rooms_out = []
    seen = set()
    hidden_people = 0
    for row in load_json(TECHNO_ROOMS):
        key = (row["floor"], row["id"])
        if key in seen:
            continue
        seen.add(key)
        name_ko = (row.get("name") or "").strip() or f"{row['id']}호"
        person = looks_like_person(name_ko)
        room = {
            "id": "T" + row["id"], "building": "b2", "floor": row["floor"], "label": row["id"],
            "category": unit_category.get(key, "office" if row.get("type") == "office" else "laboratory"),
            "routable": key in nav_rooms,
        }
        if person and not show_person:
            hidden_people += 1
            room["name"] = {"ko": "교수연구실", "en": "Faculty Office"}
        else:
            room["name"] = {"ko": name_ko}
            if person:
                room["person"] = True
        if row.get("dept"):
            dept = row["dept"].strip()
            if dept not in DEPT_CANON:
                raise SystemExit(f"모르는 학과 이름 '{dept}' — build_data.py 의 DEPT_CANON 에 넣어라")
            ko, en = DEPT_CANON[dept]
            room["dept"] = {"ko": ko, "en": en}
        rooms_out.append(room)
    for floor, room_id in sorted(nav_rooms - seen):
        rooms_out.append({
            "id": "T" + room_id, "building": "b2", "floor": floor, "label": room_id,
            "category": unit_category.get((floor, room_id), "office"),
            "routable": True, "name": {"ko": f"{room_id}호"},
        })
    rooms_out.sort(key=lambda r: (FLOORS.index(r["floor"]), r["label"]))

    # ── 배경 지도
    basemap = []
    west, south, east, north = CONFIG["context_bbox"]
    outer = [[west, south], [east, south], [east, north], [west, north], [west, south]]
    basemap.append({"type": "Feature", "properties": {"kind": "outside"},
                    "geometry": {"type": "Polygon",
                                 "coordinates": [outer, [rnd(p) for p in campus_ring[::-1] + campus_ring[-1:]]]}})
    basemap.append({"type": "Feature", "properties": {"kind": "campus"},
                    "geometry": {"type": "Polygon", "coordinates": [[rnd(p) for p in campus_ring + campus_ring[:1]]]}})

    def area_kind(tags):
        if tags.get("natural") == "water" or tags.get("waterway") == "riverbank":
            return "water"
        if tags.get("leisure") == "track":
            return "track"
        if tags.get("leisure") == "pitch":
            return "pitch"
        if tags.get("amenity") == "parking":
            return "parking"
        if tags.get("natural") in ("wood", "scrub") or tags.get("landuse") == "forest":
            return "wood"
        if tags.get("leisure") in ("park", "garden") or tags.get("landuse") in ("grass", "meadow") \
                or tags.get("natural") == "grassland":
            return "green"
        return None

    for way in osm.tagged_ways():
        tags = way["tags"]
        coords = osm.coords(way["id"])
        if len(coords) < 2 or not any(in_bbox(p, CONFIG["context_bbox"]) for p in coords):
            continue
        kind = area_kind(tags)
        if kind and coords[0] == coords[-1] and len(coords) >= 4:
            basemap.append({"type": "Feature", "properties": {"kind": kind},
                            "geometry": {"type": "Polygon", "coordinates": [[rnd(p) for p in coords]]}})
            continue
        highway = tags.get("highway")
        if highway:
            if highway in ROAD_MAJOR:
                line_kind = "road-major"
            elif highway in ROAD_MINOR:
                line_kind = "road"
            elif highway == "steps":
                line_kind = "steps"
            elif highway in ("footway", "path", "pedestrian", "track", "cycleway", "corridor"):
                line_kind = "path"
            else:
                continue
            basemap.append({"type": "Feature", "properties": {"kind": line_kind},
                            "geometry": {"type": "LineString", "coordinates": [rnd(p) for p in coords]}})
    # 그리는 순서: 면 → 선. MapLibre 는 레이어로 나누지만 파일도 읽기 쉽게 둔다.
    order = ["outside", "campus", "green", "wood", "water", "parking", "pitch", "track",
             "road-major", "road", "path", "steps"]
    basemap.sort(key=lambda f: order.index(f["properties"]["kind"]))

    # ── 쓰기
    for building in buildings_out:
        building.pop("_rings")
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "techno").mkdir(exist_ok=True)

    def write(name, data, indent=None):
        path = DATA / name
        text = json.dumps(data, ensure_ascii=False, separators=(",", ":") if indent is None else None,
                          indent=indent)
        path.write_text(text + "\n", encoding="utf-8", newline="\n")
        return path.stat().st_size

    sizes = {}
    sizes["basemap.geojson"] = write("basemap.geojson", {"type": "FeatureCollection", "features": basemap})
    sizes["buildings.geojson"] = write("buildings.geojson", {"type": "FeatureCollection", "features": shapes})
    sizes["walk-graph.json"] = write("walk-graph.json", graph.export())
    sizes["places.json"] = write("places.json", {
        "meta": {
            "built_at": time.strftime("%Y-%m-%d"),
            "campus": CONFIG["campus_name"], "campus_label": CONFIG["campus_label"],
            "address": CONFIG["address"], "main_phone": CONFIG["main_phone"],
            "bbox": campus_bbox, "bearing": CONFIG["bearing"],
            "walk_speed_mpm": CONFIG["walk_speed_mpm"],
            "sources": {
                "kumoh": {"url": official_snapshot["source"], "fetched_at": official_snapshot["fetched_at"]},
                "osm": {"license": "© OpenStreetMap contributors (ODbL)", "fetched_at": osm.fetched_at},
            },
        },
        "buildings": buildings_out, "units": units_out, "rooms": rooms_out,
        "gates": gates, "bus_stops": bus_stops,
    })

    # 테크노관: nav 는 원본 그대로 (엔진이 그 모양을 기대한다)
    shutil.copyfile(TECHNO_NAV, DATA / "techno" / "nav.json")
    sizes["techno/nav.json"] = (DATA / "techno" / "nav.json").stat().st_size

    def slim(features, keep):
        out = []
        for f in features:
            geometry = f["geometry"]
            out.append({"type": "Feature", "id": f.get("id"),
                        "properties": {k: f["properties"].get(k) for k in keep},
                        "geometry": round_geometry(geometry)})
        return {"type": "FeatureCollection", "features": out}

    # 실내 도면에도 방 이름이 들어 있다. places.json 과 같은 규칙으로 개인 이름을 가린다.
    units_slim = slim(imdf_units, ["level_id", "category", "label", "name"])
    for feature in units_slim["features"]:
        name = ((feature["properties"].get("name") or {}).get("ko-KR") or "").strip()
        if looks_like_person(name) and not show_person:
            feature["properties"]["name"] = {"ko-KR": "교수연구실", "en": "Faculty Office"}
    imdf = {
        "levels": slim(imdf_levels, ["ordinal", "short_name", "name", "category"]),
        "units": units_slim,
        "openings": slim(load_json(TECHNO_IMDF / "opening.geojson")["features"], ["level_id", "category", "name"]),
        "footprint": slim(load_json(TECHNO_IMDF / "footprint.geojson")["features"], ["level_ids", "category"]),
    }
    sizes["techno/imdf.json"] = write("techno/imdf.json", imdf)
    shutil.copyfile(ROUTE_CORE, SITE / "vendor" / "techno-route-core.js")

    write_review(review, buildings_out, units_out, manual, hidden_people)

    print(f"건물 {len(buildings_out)} · 외곽선 {len(shapes)} · 학과/시설 {len(units_out)} · 방 {len(rooms_out)}"
          f" (개인 이름 가림 {hidden_people})")
    print(f"보행 그래프: 노드 {len(graph.nodes)} · 엣지 {len(graph.edges)} · 정문 {len(gates)} · 정류장 {len(bus_stops)}")
    for name, size in sizes.items():
        print(f"  {name:22s} {size:>9,} bytes")
    print(f"완료 ({time.time() - started:.1f}s)")


def round_geometry(geometry):
    def walk(value):
        if isinstance(value, list) and value and isinstance(value[0], (int, float)):
            return rnd(value, 7)
        if isinstance(value, list):
            return [walk(v) for v in value]
        return value
    if geometry is None:
        return None
    return {"type": geometry["type"], "coordinates": walk(geometry["coordinates"])}


def write_review(review, buildings, units, manual, hidden_people):
    lines = [
        "# 캠퍼스맵 확인 필요 목록",
        "",
        "`tools/build_data.py` 가 만든다. 손으로 고치지 말고 `tools/sources/buildings.json` 을 고친 뒤 다시 빌드한다.",
        "학교 담당 부서가 확인해 주면 해당 항목의 `verified` 를 `true` 로 바꾼다.",
        "",
    ]

    def table(title, rows, header=("건물", "내용")):
        if not rows:
            return
        lines.extend([f"## {title}", "", f"| {header[0]} | {header[1]} |", "|---|---|"])
        for bid, name, text in rows:
            lines.append(f"| {name} ({bid}) | {text} |")
        lines.append("")

    table("이름·영문명", review["names"])
    table("OSM 과 학교 자료가 다른 곳", review["osm"])
    table("출처 확인이 필요한 학과·시설", review["units"])
    table("층수 (설계도 파일명 기준)", review["floors"])
    table("길에서 먼 출입구", review["entrances_far"])

    estimated = [b for b in buildings if any(e["estimated"] for e in b["entrances"])]
    lines.extend([
        "## 출입구 위치 (추정)",
        "",
        "아래 건물의 출입구는 건물 외곽선에서 길과 가장 가까운 모서리로 추정했다. 실제 출입구 좌표를",
        "`buildings.json` 의 `entrances: [[경도, 위도], ...]` 로 넣으면 길찾기가 정확해진다.",
        "",
        ", ".join(f"{b['name']['ko']}" for b in estimated),
        "",
    ])

    unlocated = manual.get("unlocated_departments", [])
    if unlocated:
        lines.extend(["## 위치를 찾지 못한 학과", "",
                      "학과 홈페이지에 사무실 위치가 없다. 건물·호실을 알려 주면 검색에 넣는다.", ""])
        lines.extend(f"- {name}" for name in unlocated)
        lines.append("")

    lines.extend([
        "## 개인 이름",
        "",
        f"테크노관 방 정보 중 교수 이름으로 보이는 {hidden_people}개는 '교수연구실'로 바꿔 표시한다.",
        "공개해도 된다면 `tools/sources/config.json` 의 `show_person_names` 를 `true` 로 바꾼다.",
        "",
    ])
    (APP / "확인필요목록.md").write_text("\n".join(lines), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
