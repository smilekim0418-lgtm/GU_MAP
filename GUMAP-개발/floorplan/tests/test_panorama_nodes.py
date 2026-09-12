"""360 촬영 계획(지점·연결)의 약속.

여기서 지키는 건 '이 지점이 좋은 자리인가' 가 아니다. 그건 현장에 가 봐야
안다. 코드가 보장할 수 있는 건 계획이 스스로 모순되지 않는다는 것뿐이다.

  - **호실 안에는 지점이 없다** (복도·계단·로비만 찍기로 했다)
  - 지점이 건물 안에 있고 층마다 있다
  - 연결이 양방향이고 자기 자신을 가리키지 않는다
  - 이어진 지점끼리는 걸어갈 만한 거리 안에 있다
  - 고립된 지점은 남기지 않는다 (들어갔다 못 나오는 자리)
  - 구역 번호가 실제로 이어진 덩어리와 맞는다
  - 뷰어가 데이터 없이 빈 화면을 띄우지 않는다
"""
import json
import math
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
CAD_OUT = ROOT / "GUMAP-개발/floorplan/cad/output"
FLOORS = ["B1F"] + [f"{i}F" for i in range(1, 7)]

pytestmark = pytest.mark.skipif(
    not (CAD_OUT / "panorama_report.json").exists(),
    reason="cad/panorama_nodes.py 산출물이 없다",
)


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def plans():
    return {floor: read(CAD_OUT / f"{floor}.panorama.local.json") for floor in FLOORS}


def test_every_floor_has_a_plan(plans):
    assert set(plans) == set(FLOORS)
    for floor, plan in plans.items():
        assert plan["floor"] == floor
        assert len(plan["nodes"]) >= 30, floor


def test_nodes_sit_inside_the_drawing(plans):
    for floor, plan in plans.items():
        for node in plan["nodes"]:
            x, y = node["at"]
            assert -55 < x < 59 and 12 < y < 124, (floor, node["at"])
            assert node["kind"] in ("door", "corridor"), (floor, node["kind"])


def test_nothing_is_planned_inside_a_room():
    """호실 안에서는 찍지 않기로 했다. 계획이 그걸 지키는지 본다.

    지점 하나가 남의 연구실 한가운데에 찍혀 있으면, 촬영 계획을 들고 간 사람이
    그 자리에 삼각대를 세운다. 규칙은 코드가 지켜야 한다.
    """
    report = read(CAD_OUT / "panorama_report.json")["floors"]
    for floor in FLOORS:
        assert report[floor]["inside_a_room"] == 0, (floor, report[floor])
        assert report[floor]["corridor"] + report[floor]["doors"] == report[floor]["nodes"]


def test_links_are_mutual_and_sane(plans):
    """한쪽에서만 보이는 연결이 있으면 들어갔다 못 나온다."""
    for floor, plan in plans.items():
        nodes = plan["nodes"]
        for i, node in enumerate(nodes):
            assert i not in node["to"], (floor, i)
            assert len(set(node["to"])) == len(node["to"]), (floor, i)
            for j in node["to"]:
                assert 0 <= j < len(nodes), (floor, i, j)
                assert i in nodes[j]["to"], (floor, i, j)


def test_linked_nodes_are_within_walking_distance(plans):
    for floor, plan in plans.items():
        nodes = plan["nodes"]
        for i, node in enumerate(nodes):
            for j in node["to"]:
                gap = math.dist(node["at"], nodes[j]["at"])
                # 12 m 는 끊긴 덩어리를 이어 붙인 연결(bridge_components)이다.
                assert 0.2 < gap <= 12.0 + 1e-6, (floor, i, j, round(gap, 2))


def test_no_isolated_nodes(plans):
    for floor, plan in plans.items():
        assert all(node["to"] for node in plan["nodes"]), floor


def largest_component(nodes):
    best, seen = 0, set()
    for start in range(len(nodes)):
        if start in seen:
            continue
        stack, size = [start], 0
        seen.add(start)
        while stack:
            size += 1
            for j in nodes[stack.pop()]["to"]:
                if j not in seen:
                    seen.add(j)
                    stack.append(j)
        best = max(best, size)
    return best


def test_connectivity_is_recorded_and_not_getting_worse(plans):
    """가장 큰 덩어리가 층 지점의 몇 %인지를 지켜본다.

    한 덩어리로 다 이어지지 않는다. 호실을 빼고 복도로만 다니기로 하면서
    더 그렇게 됐다. 1층 북쪽과 남쪽은 도면상 복도로는 이어지지 않고 사이에
    연구실이 있다. 예전에는 그 방을 가로질러 이어진 것으로 세었는데, 그건
    걸어서 찍을 수 있는 길이 아니었다. 그래서 숫자가 내려간 것이지 계획이
    나빠진 게 아니다.

    끊긴 구역끼리는 지도에서 눌러 건너뛴다. 실제 촬영에서는 밖으로 돌거나
    다른 층을 거쳐 가면서 이어진다. 여기서는 지금 수준이 더 나빠지지 않는지만
    본다.
    """
    report = read(CAD_OUT / "panorama_report.json")["floors"]
    for floor, plan in plans.items():
        measured = largest_component(plan["nodes"])
        assert measured == report[floor]["largest_component"], floor
        assert measured / len(plan["nodes"]) >= 0.30, (floor, report[floor]["connected_pct"])


def test_zones_match_the_actual_components(plans):
    """구역 번호가 실제로 이어진 덩어리와 같아야 한다.

    뷰어는 구역이 같으면 걸어갈 수 있다고 보고 길을 깐다. 번호가 실제 연결과
    어긋나면 갈 수 없는 곳으로 길이 뻗는다.
    """
    for floor, plan in plans.items():
        nodes = plan["nodes"]
        for i, node in enumerate(nodes):
            assert "zone" in node, (floor, i)
            for j in node["to"]:
                assert nodes[j]["zone"] == node["zone"], (floor, i, j)
        zones = {n["zone"] for n in nodes}
        assert zones == set(range(len(zones))), (floor, sorted(zones))
        assert sum(1 for n in nodes if n["zone"] == 0) == largest_component(nodes), floor


def test_places_are_named(plans):
    """지점마다 '여기가 어디' 가 있어야 한다. 복도 사진은 다 비슷하게 생겼다.

    지하는 기계실·주차 쪽 빈 공간이 넓어 번호가 붙는 비율이 낮다(1/3). 거기는
    가까운 호실이 실제로 없는 것이라 억지로 붙일 수 없다.
    """
    total = named_total = 0
    for floor, plan in plans.items():
        named = sum(1 for n in plan["nodes"] if n.get("near"))
        assert named >= len(plan["nodes"]) * 0.3, (floor, named, len(plan["nodes"]))
        total += len(plan["nodes"])
        named_total += named
    assert named_total >= total * 0.5, (named_total, total)


def test_viewer_is_self_contained():
    page = (CAD_OUT / "panorama.html").read_text(encoding="utf-8")
    assert "/*__PANO_DATA__*/ null" not in page, "데이터가 박히지 않았다"
    assert '"floors"' in page and '"nodes"' in page
    # 사진이 없다는 사실이 화면에도 남아 있어야 한다. 합성 화면을 실사진으로
    # 착각하면 촬영 계획을 세울 때 곤란해진다.
    assert "프로토타입" in page
    assert (ROOT / "테크노관-360투어.html").exists()


def test_viewer_moves_like_a_roadview():
    """자유롭게 걸어다니는 VR 이 아니라, 찍어 둔 자리 사이를 건너뛰는 화면이다.

    바닥에 길이 깔리고(buildRoad), 그 길을 눌러서(roadAt) 또는 방향키로(step)
    옮겨 다닌다. 지도 안 작은 창으로도 열려야 한다(embed).
    """
    page = (CAD_OUT / "panorama.html").read_text(encoding="utf-8")
    for needle in ("buildRoad", "roadAt", "function step(", "ArrowUp", "embed"):
        assert needle in page, needle


def test_map_can_open_the_viewer():
    """지도에서 카메라를 누르면 작은 창이 열리고, 거기서 전체화면으로 넓힌다."""
    layer = (ROOT / "GUMAP-프론트/js/map/map-techno-pano-layer.js").read_text(encoding="utf-8")
    for needle in ("openViewer", "전체화면", "embed=1", "pano:go"):
        assert needle in layer, needle
    bundle = (ROOT / "GUMAP-프론트/js/map/map-techno-pano-data.js").read_text(encoding="utf-8")
    assert bundle.startswith("window.TECHNO_PANO = ")
    data = json.loads(bundle[len("window.TECHNO_PANO = "):].rstrip().rstrip(";"))
    # 지도의 지점 번호가 뷰어의 지점 번호와 같아야 누른 자리가 열린다.
    for entry in data["floors"]:
        plan = read(CAD_OUT / f"{entry['floor']}.panorama.local.json")
        assert len(entry["nodes"]) == len(plan["nodes"]), entry["floor"]
    for page in (ROOT / "index.html", ROOT / "GUMAP-일반지도/index.html"):
        assert "map-techno-pano-layer.js" in page.read_text(encoding="utf-8")
