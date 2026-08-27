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


def test_외부_표기를_알아본다():
    for value in ("외부", "밖", "EXT", "outside", " 외부 "):
        assert nav.is_outside_label(value), value
    for value in ("복도", "201", "계단-A", ""):
        assert not nav.is_outside_label(value), value


def test_외부_문은_출입구로_등록된다(tmp_path, georef_data):
    work = _make_work(tmp_path, ["복도", "외부"], room_id="정문")
    graph = nav.build(floors=["1F"], work_dir=work, georef_data=georef_data)

    assert len(graph.entrances) == 1, graph.entrances
    node = graph.nodes[graph.entrances[0]]
    assert node.exterior is True
    assert node.name == "정문"
    assert node.floor == "1F"


def test_출입구_이름은_없어도_된다(tmp_path, georef_data):
    work = _make_work(tmp_path, ["복도", "외부"])
    graph = nav.build(floors=["1F"], work_dir=work, georef_data=georef_data)
    assert len(graph.entrances) == 1
    assert graph.nodes[graph.entrances[0]].name is None


def test_출입구도_복도_그래프에_붙는다(tmp_path, georef_data):
    """출입구가 복도와 안 이어지면 아무 쓸모가 없다."""
    work = _make_work(tmp_path, ["복도", "외부"], room_id="정문")
    graph = nav.build(floors=["1F"], work_dir=work, georef_data=georef_data)
    door_id = graph.entrances[0]
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


def test_복도와_안_닿는_출입구는_경고를_남긴다(tmp_path, georef_data):
    work = _make_work(tmp_path, ["외부"], room_id="쓸모없는문")
    graph = nav.build(floors=["1F"], work_dir=work, georef_data=georef_data)
    assert not graph.entrances, "복도와 안 이어진 문이 출입구로 등록됐다"
    assert any("출입구" in warning for warning in graph.warnings), graph.warnings


def test_출입구가_없으면_목록도_비어_있다(georef_data):
    """지금 실제 데이터에는 출입구가 없다. 그 사실이 조용히 바뀌면 알아야 한다."""
    graph = nav.build(georef_data=georef_data)
    assert graph.entrances == [], (
        f"출입구가 생겼다: {graph.entrances}. "
        "실제 도면에 외부 문을 추가했다면 이 테스트를 갱신하라."
    )
