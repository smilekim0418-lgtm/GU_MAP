import math

import pytest

from fp import config, georef


def make_transform(theta=26.6, scale=1.0, t_lon=128.3940, t_lat=36.1460):
    return georef.Transform(theta_deg=theta, scale=scale, t_lon=t_lon, t_lat=t_lat)


def test_origin_maps_to_the_translation():
    t = make_transform()
    lon, lat = georef.apply(t, 0.0, 0.0)
    assert lon == pytest.approx(t.t_lon, abs=1e-12)
    assert lat == pytest.approx(t.t_lat, abs=1e-12)


def test_moving_north_increases_latitude():
    t = make_transform(theta=0.0)
    _, lat = georef.apply(t, 0.0, 110.54)
    assert lat == pytest.approx(36.1460 + 0.001, abs=1e-9)


def test_moving_east_increases_longitude():
    t = make_transform(theta=0.0)
    lon, _ = georef.apply(t, 100.0, 0.0)
    assert lon > t.t_lon


def test_rotation_by_ninety_degrees_turns_east_into_north():
    t = make_transform(theta=90.0, t_lon=128.0, t_lat=36.0)
    lon, lat = georef.apply(t, 100.0, 0.0)
    assert lat > 36.0
    assert lon == pytest.approx(128.0, abs=1e-9)


def test_solve_recovers_a_known_transform():
    truth = make_transform(theta=26.6, scale=1.0)
    src = [(0.0, 0.0), (90.2, 0.0), (90.2, 88.7), (0.0, 88.7)]
    dst = [georef.apply(truth, x, y) for x, y in src]
    solved = georef.solve_similarity(src, dst)
    assert solved.theta_deg == pytest.approx(26.6, abs=0.01)
    assert solved.scale == pytest.approx(1.0, abs=0.001)
    assert solved.t_lon == pytest.approx(truth.t_lon, abs=1e-7)
    assert solved.t_lat == pytest.approx(truth.t_lat, abs=1e-7)


def test_solve_round_trips_points():
    truth = make_transform(theta=-13.0, scale=1.0)
    src = [(0.0, 0.0), (90.2, 0.0), (90.2, 88.7), (0.0, 88.7)]
    dst = [georef.apply(truth, x, y) for x, y in src]
    solved = georef.solve_similarity(src, dst)
    for (x, y), (lon, lat) in zip(src, dst):
        got_lon, got_lat = georef.apply(solved, x, y)
        assert got_lon == pytest.approx(lon, abs=1e-8)
        assert got_lat == pytest.approx(lat, abs=1e-8)


def test_solve_rejects_fewer_than_three_points():
    with pytest.raises(georef.GeoRefError, match="3"):
        georef.solve_similarity([(0.0, 0.0), (1.0, 1.0)], [(128.0, 36.0), (128.1, 36.1)])


def test_solve_rejects_mismatched_lengths():
    with pytest.raises(georef.GeoRefError):
        georef.solve_similarity([(0.0, 0.0), (1.0, 0.0), (0.0, 1.0)], [(128.0, 36.0)])


def test_solve_rejects_an_out_of_tolerance_scale():
    truth = make_transform(theta=0.0, scale=1.0)
    src = [(0.0, 0.0), (90.2, 0.0), (90.2, 88.7), (0.0, 88.7)]
    # 대응점을 20% 키워 축척이 1.2 가 되게 만든다
    dst = [georef.apply(truth, x * 1.2, y * 1.2) for x, y in src]
    with pytest.raises(georef.GeoRefError, match="축척"):
        georef.solve_similarity(src, dst)


def test_pixels_to_meters_uses_the_drawing_extent():
    # 도면이 가로 4510px 로 90200mm 를 표현한다면 1px = 20mm = 0.02m
    px_per_mm = 4510 / 90200
    got = georef.pixels_to_meters([(0, 0), (4510, 0)], origin_px=(0, 0), px_per_mm=px_per_mm)
    assert got[0] == pytest.approx((0.0, 0.0))
    assert got[1][0] == pytest.approx(90.2, abs=0.001)


def test_pixels_to_meters_flips_the_y_axis():
    # 이미지 y 는 아래로 증가하고 지도 y(북)는 위로 증가한다
    px_per_mm = 1.0
    got = georef.pixels_to_meters([(0, 1000)], origin_px=(0, 0), px_per_mm=px_per_mm)
    assert got[0][1] < 0


def test_pixels_to_meters_honours_the_origin():
    px_per_mm = 1.0
    got = georef.pixels_to_meters([(500, 500)], origin_px=(500, 500), px_per_mm=px_per_mm)
    assert got[0] == pytest.approx((0.0, 0.0))


def test_apply_many_matches_apply():
    t = make_transform()
    points = [(0.0, 0.0), (10.0, 20.0)]
    assert georef.apply_many(t, points) == [georef.apply(t, x, y) for x, y in points]


def test_save_and_load_round_trip(tmp_path):
    path = tmp_path / "g.json"
    data = {
        "reference_latitude": config.REFERENCE_LATITUDE,
        "transform": {"theta_deg": 26.6, "scale": 1.0, "t_lon": 128.39, "t_lat": 36.14},
        "control_points": [],
        "floor_origin_px": {},
    }
    georef.save(data, path)
    assert georef.load(path)["transform"]["theta_deg"] == 26.6
