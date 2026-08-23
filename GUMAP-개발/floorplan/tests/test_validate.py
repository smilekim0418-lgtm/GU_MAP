import pytest

from fp import excel, georef, imdf, validate


@pytest.fixture
def transform():
    return georef.Transform(theta_deg=0.0, scale=1.0, t_lon=128.3940, t_lat=36.1460)


def make_bundle(polys, rooms, transform):
    return imdf.build_bundle({"2F": polys}, {"2F": rooms}, transform)


def room(room_id, name="강의실", category="classroom"):
    return excel.Room(room_id=room_id, floor="2F", name=name, category=category)


def square_m(x0, y0, size):
    return [(x0, y0), (x0 + size, y0), (x0 + size, y0 + size), (x0, y0 + size)]


def test_clean_data_produces_no_errors(transform):
    polys = [{"points_m": square_m(0, 0, 7), "room_id": "201"}]
    bundle = make_bundle(polys, [room("201")], transform)
    issues = validate.run_all(bundle, {"2F": [room("201")]})
    assert [i for i in issues if i.severity == "error"] == []


def test_flags_a_room_with_no_geometry(transform):
    polys = [{"points_m": square_m(0, 0, 7), "room_id": "201"}]
    rooms = [room("201"), room("202")]
    bundle = make_bundle(polys, rooms, transform)
    issues = validate.run_all(bundle, {"2F": rooms})
    assert any(i.code == "missing_geometry" and "202" in i.message for i in issues)


def test_flags_an_implausibly_small_area(transform):
    polys = [{"points_m": square_m(0, 0, 1), "room_id": "201"}]  # 1㎡
    bundle = make_bundle(polys, [room("201")], transform)
    issues = validate.run_all(bundle, {"2F": [room("201")]})
    assert any(i.code == "area_out_of_range" for i in issues)


def test_flags_an_implausibly_large_area(transform):
    polys = [{"points_m": square_m(0, 0, 30), "room_id": "201"}]  # 900㎡
    bundle = make_bundle(polys, [room("201")], transform)
    issues = validate.run_all(bundle, {"2F": [room("201")]})
    assert any(i.code == "area_out_of_range" for i in issues)


def test_flags_overlapping_polygons(transform):
    polys = [
        {"points_m": square_m(0, 0, 7), "room_id": "201"},
        {"points_m": square_m(1, 1, 7), "room_id": "202"},
    ]
    rooms = [room("201"), room("202")]
    bundle = make_bundle(polys, rooms, transform)
    issues = validate.run_all(bundle, {"2F": rooms})
    assert any(i.code == "overlap" for i in issues)


def test_flags_an_invalid_category(transform):
    polys = [{"points_m": square_m(0, 0, 7), "room_id": "201"}]
    bad = excel.Room(room_id="201", floor="2F", name="x", category="nonsense")
    bundle = make_bundle(polys, [bad], transform)
    issues = validate.run_all(bundle, {"2F": [bad]})
    assert any(i.code == "bad_category" for i in issues)


def test_flags_a_dangling_level_reference(transform):
    polys = [{"points_m": square_m(0, 0, 7), "room_id": "201"}]
    bundle = make_bundle(polys, [room("201")], transform)
    bundle["units"]["features"][0]["properties"]["level_id"] = "does-not-exist"
    issues = validate.run_all(bundle, {"2F": [room("201")]})
    assert any(i.code == "dangling_level" and i.severity == "error" for i in issues)


def test_extent_check_passes_for_points_inside_the_building():
    inside = {"2F": [{"points_m": square_m(10, 10, 7), "room_id": "201"}]}
    assert validate.check_within_extent(inside) == []


def test_extent_check_flags_a_polygon_outside_the_drawing():
    # 도면 실측은 90.2m x 88.7m 다. 300m 는 명백히 밖이다.
    outside = {"2F": [{"points_m": square_m(300, 300, 7), "room_id": "201"}]}
    issues = validate.check_within_extent(outside)
    assert any(i.code == "outside_extent" for i in issues)


def test_extent_check_allows_a_small_margin():
    # 벽 두께 정도의 삐져나감은 허용한다
    edge = {"2F": [{"points_m": [(-1.0, -1.0), (5.0, -1.0), (5.0, 5.0), (-1.0, 5.0)], "room_id": "201"}]}
    assert validate.check_within_extent(edge) == []


def test_flags_stairs_that_do_not_line_up_between_floors(transform):
    stair = excel.Room(room_id="290", floor="2F", name="계단", category="stairs")
    stair3 = excel.Room(room_id="390", floor="3F", name="계단", category="stairs")
    bundle = imdf.build_bundle(
        {
            "2F": [{"points_m": square_m(0, 0, 4), "room_id": "290"}],
            "3F": [{"points_m": square_m(40, 40, 4), "room_id": "390"}],
        },
        {"2F": [stair], "3F": [stair3]},
        transform,
    )
    issues = validate.run_all(bundle, {"2F": [stair], "3F": [stair3]})
    assert any(i.code == "vertical_misalignment" for i in issues)
