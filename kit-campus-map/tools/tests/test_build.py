"""build_data.py 산출물 검증.

    python tools/build_data.py && python -m pytest tools/tests -q

공식 서비스에 올라가는 데이터라, 빠진 번호·끊긴 보행로·개인정보 노출을
빌드 단계에서 막는다.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "site" / "data"


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def test_official_numbers_complete():
    numbers = sorted(b["no"] for b in load("places.json")["buildings"] if b.get("no"))
    assert numbers == list(range(1, 26))


def test_every_building_has_names_and_center():
    for b in load("places.json")["buildings"]:
        assert b["name"]["ko"], b["id"]
        assert b["name"]["en"], b["id"]
        assert b["name"]["en"] != b["name"]["ko"], b["id"]
        lng, lat = b["center"]
        assert 128.38 < lng < 128.40 and 36.13 < lat < 36.16, b["id"]


def test_every_building_has_shape():
    ids = {f["properties"]["id"] for f in load("buildings.geojson")["features"]}
    for b in load("places.json")["buildings"]:
        assert b["id"] in ids, b["id"]


def test_all_entrances_in_one_component():
    graph = load("walk-graph.json")
    parent = list(range(len(graph["nodes"])))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b, *_ in graph["edges"]:
        parent[find(a)] = find(b)
    places = load("places.json")
    roots = {}
    for b in places["buildings"]:
        assert b["entrances"], b["id"]
        for e in b["entrances"]:
            roots.setdefault(find(e["node"]), []).append(b["id"])
    for gate in places["gates"] + places["bus_stops"]:
        roots.setdefault(find(gate["node"]), []).append(gate["id"])
    assert len(roots) == 1, roots


def test_edges_reference_real_nodes_and_lengths_are_sane():
    graph = load("walk-graph.json")
    n = len(graph["nodes"])
    for a, b, meters, flags in graph["edges"]:
        assert 0 <= a < n and 0 <= b < n and a != b
        assert 0 < meters < 1000
        assert flags in (0, 1, 2, 3)


def test_person_names_hidden_by_default():
    rooms = load("places.json")["rooms"]
    assert rooms, "테크노관 방 목록이 비었다"
    assert not any("person" in r for r in rooms)
    # 개인 이름처럼 보이는 2~4 글자 이름이 남아 있으면 안 된다
    import re
    suspicious = [r for r in rooms
                  if re.fullmatch(r"[가-힣]{2,4}", r["name"]["ko"])
                  and not r["name"]["ko"].endswith(("실", "센터", "홀", "라운지", "카페", "창고", "로비"))]
    assert not suspicious, suspicious[:5]


def test_no_person_names_anywhere():
    """방 정보 원본의 사람 이름이 어느 배포 파일에도 남지 않는다."""
    import re
    source = ROOT.parent / "GUMAP-데이터" / "data" / "kumoh_techno_rooms.json"
    people = {r["name"].strip() for r in json.loads(source.read_text(encoding="utf-8"))
              if re.fullmatch(r"[가-힣]{2,4}", (r["name"] or "").strip())
              and not r["name"].strip().endswith(("실", "센터", "홀", "라운지", "카페", "창고", "로비"))}
    assert len(people) > 50
    for path in DATA.rglob("*"):
        if path.is_file():
            text = path.read_text(encoding="utf-8")
            leaked = [p for p in people if p in text]
            assert not leaked, (path.name, leaked[:5])


def test_rooms_point_to_techno():
    places = load("places.json")
    ids = {b["id"] for b in places["buildings"]}
    for r in places["rooms"]:
        assert r["building"] in ids
        assert r["floor"] in {"B1F", "1F", "2F", "3F", "4F", "5F", "6F"}


def test_units_belong_to_buildings():
    places = load("places.json")
    ids = {b["id"] for b in places["buildings"]}
    for u in places["units"]:
        assert u["building"] in ids, u
        assert u["kind"] in {"dept", "office", "facility"}


def test_techno_bundle_present():
    nav = load("techno/nav.json")
    assert nav["meta"]["counts"]["entrances"] >= 1
    imdf = load("techno/imdf.json")
    assert {"levels", "units", "openings"} <= set(imdf)
    assert (ROOT / "site" / "vendor" / "techno-route-core.js").exists()


def test_sizes_reasonable():
    total = sum(p.stat().st_size for p in DATA.rglob("*") if p.is_file())
    assert total < 3_000_000, total


def test_review_list_written():
    text = (ROOT / "확인필요목록.md").read_text(encoding="utf-8")
    assert "대외협력관" in text
