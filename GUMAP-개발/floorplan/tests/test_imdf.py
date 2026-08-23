import pytest

from fp import excel, georef, imdf


@pytest.fixture
def transform():
    return georef.Transform(theta_deg=26.6, scale=1.0, t_lon=128.3940, t_lat=36.1460)


@pytest.fixture
def labeled_by_floor():
    return {
        "2F": [
            {"points_m": [(0.0, 0.0), (7.0, 0.0), (7.0, 7.0), (0.0, 7.0)], "room_id": "201"},
            {"points_m": [(8.0, 0.0), (14.0, 0.0), (14.0, 7.0), (8.0, 7.0)], "room_id": "202"},
            {"points_m": [(20.0, 0.0), (24.0, 0.0), (24.0, 4.0), (20.0, 4.0)], "room_id": None},
        ]
    }


@pytest.fixture
def rooms_by_floor():
    return {
        "2F": [
            excel.Room(room_id="201", floor="2F", name="대강의실", category="classroom",
                       tags=["지방대학특성화사업"]),
            excel.Room(room_id="202", floor="2F", name="탄소재료연구실", category="laboratory"),
            excel.Room(room_id="203", floor="2F", name="나노재료 공정 실험실", category="laboratory"),
        ]
    }


def test_bundle_has_the_imdf_collections(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    for key in ["venue", "building", "levels", "units", "footprint", "occupants"]:
        assert key in bundle


def test_units_are_geojson_feature_collections(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    assert bundle["units"]["type"] == "FeatureCollection"
    assert isinstance(bundle["units"]["features"], list)


def test_only_labeled_polygons_become_units(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    assert len(bundle["units"]["features"]) == 2


def test_unit_keeps_the_schema_the_indoor_module_reads(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    props = bundle["units"]["features"][0]["properties"]
    for key in ["level_id", "category", "label", "name", "department", "research_tags"]:
        assert key in props
    assert "ko-KR" in props["label"]
    assert "ko-KR" in props["name"]


def test_unit_name_comes_from_the_spreadsheet(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    by_label = {f["properties"]["label"]["ko-KR"]: f for f in bundle["units"]["features"]}
    assert by_label["201"]["properties"]["name"]["ko-KR"] == "대강의실"
    assert by_label["201"]["properties"]["category"] == "classroom"


def test_drawing_name_fills_in_when_the_spreadsheet_name_is_blank(transform):
    """엑셀 361개 중 69개는 이름이 비어 있고 도면에만 적혀 있다."""
    labeled = {"2F": [{"points_m": [(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)],
                       "room_id": "228", "drawing_name": "화장실"}]}
    rooms = {"2F": [excel.Room(room_id="228", floor="2F", name="", category="office")]}
    bundle = imdf.build_bundle(labeled, rooms, transform)
    props = bundle["units"]["features"][0]["properties"]
    assert props["name"]["ko-KR"] == "화장실"
    assert props["category"] == "restroom"


def test_spreadsheet_name_wins_over_the_drawing_name(transform):
    labeled = {"2F": [{"points_m": [(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)],
                       "room_id": "202", "drawing_name": "준비실"}]}
    rooms = {"2F": [excel.Room(room_id="202", floor="2F", name="탄소재료연구실",
                               category="laboratory")]}
    bundle = imdf.build_bundle(labeled, rooms, transform)
    props = bundle["units"]["features"][0]["properties"]
    assert props["name"]["ko-KR"] == "탄소재료연구실"
    assert props["category"] == "laboratory"


def test_room_number_is_the_last_resort_name(transform):
    labeled = {"2F": [{"points_m": [(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)],
                       "room_id": "211", "drawing_name": None}]}
    rooms = {"2F": [excel.Room(room_id="211", floor="2F", name="", category="office")]}
    bundle = imdf.build_bundle(labeled, rooms, transform)
    assert bundle["units"]["features"][0]["properties"]["name"]["ko-KR"] == "211"
    assert bundle["occupants"]["features"] == []


def test_unit_geometry_is_a_closed_polygon(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    ring = bundle["units"]["features"][0]["geometry"]["coordinates"][0]
    assert ring[0] == ring[-1], "폴리곤 링이 닫혀 있어야 한다"


def test_ring_vertex_count_follows_the_input_shape(rooms_by_floor, transform):
    """도형을 사각형으로 뭉개지 않는다. 입력 꼭짓점 수가 그대로 나와야 한다."""
    l_shape = [(0.0, 0.0), (10.0, 0.0), (10.0, 4.0), (4.0, 4.0), (4.0, 9.0), (0.0, 9.0)]
    bundle = imdf.build_bundle(
        {"2F": [{"points_m": l_shape, "room_id": "201"}]}, rooms_by_floor, transform
    )
    ring = bundle["units"]["features"][0]["geometry"]["coordinates"][0]
    assert len(ring) == len(l_shape) + 1, "L 자 방이 사각형으로 뭉개졌다"


def test_coordinates_land_near_the_campus(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    lon, lat = bundle["units"]["features"][0]["geometry"]["coordinates"][0][0]
    assert 128.39 < lon < 128.40
    assert 36.14 < lat < 36.15


def test_levels_cover_every_floor_present(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    shorts = {f["properties"]["short_name"]["ko-KR"] for f in bundle["levels"]["features"]}
    assert "2F" in shorts


def test_every_unit_level_id_exists_in_levels(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    level_ids = {f["id"] for f in bundle["levels"]["features"]}
    for feature in bundle["units"]["features"]:
        assert feature["properties"]["level_id"] in level_ids


def test_occupants_reference_existing_units(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    unit_ids = {f["id"] for f in bundle["units"]["features"]}
    for occupant in bundle["occupants"]["features"]:
        for unit_id in occupant["properties"]["unit_ids"]:
            assert unit_id in unit_ids


def test_footprint_is_the_hull_of_the_units(labeled_by_floor, rooms_by_floor, transform):
    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    assert bundle["footprint"]["features"]
    ring = bundle["footprint"]["features"][0]["geometry"]["coordinates"][0]
    assert len(ring) >= 4
