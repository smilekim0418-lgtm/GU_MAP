"""건물 출입구(외부와 이어지는 문) 규칙.

규칙: type="door" 인 박스의 connects 에 "외부" 를 넣으면 건물 출입구가 된다.
      room_id 는 선택이며 출입구 이름으로 쓰인다.

아직 실제 도면에는 출입구 박스가 없다. 규칙이 실제로 통하는지 확인하려면
합성 출입구를 넣은 임시 작업본으로 그래프를 만들어 봐야 한다. 그래야 나중에
박스를 그렸을 때 바로 동작한다는 것을 지금 보장할 수 있다.
"""
import json
import shutil

import pytest

from fp import config, nav, route

pytestmark = pytest.mark.skipif(
    not (config.WORK_DIR / "1F_labeled.json").exists(),
    reason="work/*_labeled.json 이 없다",
)


def _corridor_edge_point(data):
    """1F 복도 외곽선 위의 한 점과 그 근처 안쪽 점."""
    corridor = next(r for r in data["polygons"] if nav.type_of(r) == "corridor")
    poly = nav.polygon_of(corridor)
    boundary = poly.exterior
    point = boundary.interpolate(boundary.length * 0.25)
    return point.x, point.y


def _make_work(tmp_path, connects, room_id=None, floors=("1F",)):
    """지정한 층만 복사하고 1F 에 합성 출입구를 하나 넣은 작업본을 만든다."""
    work = tmp_path / "work"
    work.mkdir()
    for floor in floors:
        shutil.copy(config.WORK_DIR / f"{floor}_labeled.json", work / f"{floor}_labeled.json")

    path = work / "1F_labeled.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    x, y = _corridor_edge_point(data)
    door = {
        "type": "door",
        "connects": list(connects),
        "points": [[x - 6, y - 6], [x + 6, y - 6], [x + 6, y + 6], [x - 6, y + 6]],
        "centroid": [x, y],
    }
    if room_id:
        door["room_id"] = room_id
    data["polygons"].append(door)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return work


@pytest.fixture
def georef_data():
    from fp import georef
    return georef.load()


@pytest.fixture
def baseline_1f(georef_data, tmp_path_factory):
    """실제 1F 에 이미 있는 출입구 수. 합성 문의 효과만 떼어 보려고 쓴다."""
    work = tmp_path_factory.mktemp("baseline") / "work"
    work.mkdir()
    shutil.copy(config.WORK_DIR / "1F_labeled.json", work / "1F_labeled.json")
    return nav.build(floors=["1F"], work_dir=work, georef_data=georef_data)


def _added(graph, baseline):
    """합성 문 때문에 새로 생긴 출입구."""
    return [node_id for node_id in graph.entrances if node_id not in baseline.entrances]


def test_외부_표기를_알아본다():
    for value in ("외부", "밖", "EXT", "outside", " 외부 "):
        assert nav.is_outside_label(value), value
    for value in ("복도", "201", "계단-A", ""):
        assert not nav.is_outside_label(value), value


def test_외부_문은_출입구로_등록된다(tmp_path, georef_data, baseline_1f):
    work = _make_work(tmp_path, ["복도", "외부"], room_id="정문")
    graph = nav.build(floors=["1F"], work_dir=work, georef_data=georef_data)

    added = _added(graph, baseline_1f)
    assert len(added) == 1, added
    node = graph.nodes[added[0]]
    assert node.exterior is True
    assert node.name == "정문"
    assert node.floor == "1F"


def test_출입구_이름은_없어도_된다(tmp_path, georef_data, baseline_1f):
    work = _make_work(tmp_path, ["복도", "외부"])
    graph = nav.build(floors=["1F"], work_dir=work, georef_data=georef_data)
    added = _added(graph, baseline_1f)
    assert len(added) == 1
    assert graph.nodes[added[0]].name is None


def test_출입구도_복도_그래프에_붙는다(tmp_path, georef_data, baseline_1f):
    """출입구가 복도와 안 이어지면 아무 쓸모가 없다."""
    work = _make_work(tmp_path, ["복도", "외부"], room_id="정문")
    graph = nav.build(floors=["1F"], work_dir=work, georef_data=georef_data)
    door_id = _added(graph, baseline_1f)[0]
    assert f"{door_id}a" in graph.nodes, "복도쪽 진입점이 없다"
    assert graph.adjacency.get(door_id), "출입구가 그래프에 연결되지 않았다"


def test_외부는_방으로_취급되지_않는다(tmp_path, georef_data):
    """'외부' 가 방 목록에 섞이면 목적지 드롭다운에 '외부' 가 뜬다."""
    work = _make_work(tmp_path, ["복도", "외부"], room_id="정문")
    graph = nav.build(floors=["1F"], work_dir=work, georef_data=georef_data)
    assert ("1F", "외부") not in graph.doors_by_room
    assert all(row["room_id"] != "외부" for row in route.room_index(graph))


def test_출입구에서_방까지_경로가_난다(tmp_path, georef_data):
    """출입구를 출발점으로 삼아 실제로 길이 나는지."""
    work = _make_work(tmp_path, ["복도", "외부"], room_id="정문")
    graph = nav.build(floors=["1F"], work_dir=work, georef_data=georef_data)
    door = graph.nodes[graph.entrances[0]]

    rooms = [row for row in route.room_index(graph)
             if row["floor"] == "1F" and row["corridor_doors"] > 0]
    assert rooms, "1F 에 문 있는 방이 없다"

    result = route.find(graph, {"floor": "1F", "x": door.x, "y": door.y},
                        {"room_id": rooms[0]["room_id"], "floor": "1F"})
    assert result.ok
    assert result.distance_m > 0


def test_복도와_안_닿는_출입구는_경고를_남긴다(tmp_path, georef_data, baseline_1f):
    work = _make_work(tmp_path, ["외부"], room_id="쓸모없는문")
    graph = nav.build(floors=["1F"], work_dir=work, georef_data=georef_data)
    assert not _added(graph, baseline_1f), "복도와 안 이어진 문이 출입구로 등록됐다"
    assert any("출입구" in warning for warning in graph.warnings), graph.warnings


# ── 실제 도면에 그려진 출입구 ────────────────────────────────────────────

@pytest.fixture(scope="module")
def real_graph():
    from fp import georef
    return nav.build(georef_data=georef.load())


def test_실제_도면에_출입구가_있다(real_graph):
    """출입구가 사라지면 건물 밖에서 길찾기가 통째로 죽는다."""
    assert real_graph.entrances, "출입구가 하나도 없다"


def test_모든_출입구가_그래프에_붙어_있다(real_graph):
    """복도와 안 이어진 출입구는 지도에만 보이고 길은 안 난다."""
    dangling = [node_id for node_id in real_graph.entrances
                if f"{node_id}a" not in real_graph.nodes
                or not real_graph.adjacency.get(node_id)]
    assert not dangling, f"복도에 안 붙은 출입구: {dangling}"
    assert not [w for w in real_graph.warnings if "출입구" in w], real_graph.warnings


def test_모든_출입구에서_아무_방이나_갈_수_있다(real_graph):
    """문 하나가 막다른 골목이면 그 문으로 들어온 사람이 갇힌다."""
    rooms = [row for row in route.room_index(real_graph) if row["corridor_doors"] > 0]
    target = rooms[len(rooms) // 2]
    for node_id in real_graph.entrances:
        door = real_graph.nodes[node_id]
        result = route.find(real_graph, {"floor": door.floor, "x": door.x, "y": door.y},
                            {"room_id": target["room_id"], "floor": target["floor"]})
        assert result.ok, f"{node_id} 에서 {target['room_id']} 까지 길이 없다"


# ── 출입구 이름 ─────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def name_entrances():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "build_nav", config.TOOL_DIR / "05_build_nav.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.name_entrances


CENTER = (36.1465, 128.3942)


def _ring(names_and_offsets):
    """건물 중심 CENTER 둘레에 놓은 가짜 출입구들."""
    rows = []
    for name, dlat, dlon, floor in names_and_offsets:
        rows.append({"name": name, "floor": floor,
                     "lat": CENTER[0] + dlat, "lon": CENTER[1] + dlon})
    return rows


def test_이름이_없으면_방위로_붙는다(name_entrances):
    rows = _ring([(None, 0.0005, 0.0, "1F"), (None, -0.0005, 0.0, "1F"),
                  (None, 0.0, 0.0006, "1F"), (None, 0.0, -0.0006, "1F")])
    name_entrances(rows, CENTER)
    assert [r["name"] for r in rows] == [
        "북쪽 출입구 (1F)", "남쪽 출입구 (1F)", "동쪽 출입구 (1F)", "서쪽 출입구 (1F)"]


def test_도면에_적은_이름이_이긴다(name_entrances):
    rows = _ring([("정문", 0.0005, 0.0, "1F"), (None, -0.0005, 0.0, "1F")])
    name_entrances(rows, CENTER)
    assert rows[0]["name"] == "정문"
    assert rows[1]["name"] == "남쪽 출입구 (1F)"


def test_같은_방위_같은_층이면_번호로_가른다(name_entrances):
    """번호는 구역 한가운데 기준 시계방향. 북쪽에서 355°/5° 가 뒤집히면 안 된다."""
    rows = _ring([(None, 0.0005, -0.00002, "1F"), (None, 0.0005, 0.00002, "1F"),
                  (None, -0.0005, 0.0, "1F")])
    name_entrances(rows, CENTER)
    assert rows[0]["name"] == "북쪽 출입구 1 (1F)", "서쪽에 가까운 쪽이 1번"
    assert rows[1]["name"] == "북쪽 출입구 2 (1F)"
    assert rows[2]["name"] == "남쪽 출입구 (1F)", "안 겹치면 번호를 붙이지 않는다"


def test_층이_다르면_번호_없이도_구분된다(name_entrances):
    """경사지라 같은 자리에 B1F 문과 1F 문이 겹쳐 있다."""
    rows = _ring([(None, 0.0005, 0.0, "B1F"), (None, 0.00051, 0.0, "1F")])
    name_entrances(rows, CENTER)
    assert rows[0]["name"] == "북쪽 출입구 (B1F)"
    assert rows[1]["name"] == "북쪽 출입구 (1F)"


def test_출입구가_한쪽에_몰려도_방위가_안_뒤집힌다(name_entrances):
    """기준점이 출입구 평균이면 나란한 두 문이 북/남으로 갈렸다."""
    rows = _ring([(None, 0.0005, -0.00002, "1F"), (None, 0.00051, 0.00002, "1F")])
    name_entrances(rows, CENTER)
    assert all(row["name"].startswith("북쪽") for row in rows), rows


def test_실제_출입구_이름은_서로_다르다(name_entrances):
    """같은 이름이 둘이면 안내문이 어느 문인지 못 알려준다."""
    import importlib.util, json
    bundle = json.loads((config.WORK_DIR / "techno_nav.json").read_text(encoding="utf-8"))
    names = [e["name"] for e in bundle["entrances"]]
    assert len(names) == len(set(names)), f"중복된 출입구 이름: {names}"
    assert all(name for name in names), "이름이 빈 출입구가 있다"
