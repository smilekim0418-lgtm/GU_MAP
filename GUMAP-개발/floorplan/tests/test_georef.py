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


def test_one_hundred_metres_east_lands_at_an_independently_computed_longitude():
    """왕복 테스트만으로는 apply 와 solve 가 같은 방향으로 틀려도 통과한다.

    그래서 코드를 쓰지 않고 손으로 계산한 절대값에 못을 박는다.
    위도 36.1466 에서 경도 1도 = 111320 * cos(36.1466°) = 89892.06 m 이므로
    동쪽 100m 는 0.001112445도다. cos 보정을 빼먹으면 0.000898311도가 되어
    이 테스트가 잡아낸다.
    """
    t = georef.Transform(theta_deg=0.0, scale=1.0, t_lon=128.0, t_lat=36.0)
    lon, lat = georef.apply(t, 100.0, 0.0)
    assert lon - 128.0 == pytest.approx(0.001112445, abs=1e-8)
    assert lat == pytest.approx(36.0, abs=1e-12)


def test_one_hundred_metres_north_lands_at_an_independently_computed_latitude():
    # 위도 1도 = 110540 m 이므로 북쪽 100m 는 0.00090465도
    t = georef.Transform(theta_deg=0.0, scale=1.0, t_lon=128.0, t_lat=36.0)
    lon, lat = georef.apply(t, 0.0, 100.0)
    assert lat - 36.0 == pytest.approx(0.00090465, abs=1e-8)
    assert lon == pytest.approx(128.0, abs=1e-12)


def test_a_degree_of_longitude_is_shorter_than_a_degree_of_latitude_here():
    """같은 거리를 가도 경도 변화가 더 커야 한다. 뒤집히면 건물이 찌그러진다."""
    t = georef.Transform(theta_deg=0.0, scale=1.0, t_lon=128.0, t_lat=36.0)
    lon_east, _ = georef.apply(t, 100.0, 0.0)
    _, lat_north = georef.apply(t, 0.0, 100.0)
    assert (lon_east - 128.0) > (lat_north - 36.0)


def test_transform_from_rejects_an_unsolved_transform():
    """좌표가 확정되기 전에 지도를 만들지 못하게 막는 안전장치."""
    for broken in [
        {},
        {"transform": None},
        {"transform": {}},
        {"transform": {"theta_deg": 1.0, "scale": 1.0, "t_lon": 128.0, "t_lat": None}},
        {"transform": {"theta_deg": None, "scale": None, "t_lon": None, "t_lat": None}},
        {"transform": {"theta_deg": 1.0, "scale": 1.0, "t_lon": 128.0}},
    ]:
        with pytest.raises(georef.GeoRefError):
            georef.transform_from(broken)


def test_transform_from_accepts_a_complete_transform():
    got = georef.transform_from(
        {"transform": {"theta_deg": 26.6, "scale": 1.0, "t_lon": 128.39, "t_lat": 36.14}}
    )
    assert got.theta_deg == 26.6
    assert got.scale == 1.0


def test_to_dict_round_trips_through_transform_from():
    original = georef.Transform(theta_deg=26.6, scale=1.0, t_lon=128.39, t_lat=36.14)
    assert georef.transform_from({"transform": georef.to_dict(original)}) == original


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


def test_frame_origin_is_inside_the_image():
    from fp import raster
    image = raster.load_floor_image("2F")
    ox, oy = georef.detect_frame_origin(image)
    height, width = image.shape[:2]
    assert 0 < ox < width
    assert 0 < oy < height


def test_frame_origin_is_consistent_within_one_source_pdf():
    """같은 PDF 에서 나온 층끼리는 기준점이 일치해야 한다.

    서로 다른 PDF 사이에서는 표제란·여백 크기가 달라 일치하지 않는다.
    그 편차는 사람이 보정 화면에서 치수 체인 양 끝점을 찍어 없앤다.
    """
    from fp import raster

    # 2F 와 3F 는 각각 다른 PDF 지만 같은 작도 시리즈라 여백이 거의 같다
    origins = {f: georef.detect_frame_origin(raster.load_floor_image(f)) for f in ["2F", "3F"]}
    xs = [o[0] for o in origins.values()]
    assert max(xs) - min(xs) < 60, f"도면틀 x 기준점이 크게 다름: {origins}"


def test_px_per_mm_estimates_vary_between_source_pdfs():
    """잉크 bbox 추정치는 원본 PDF 마다 흔들린다 — 이 사실을 못박아 둔다.

    이게 사람이 치수 체인을 직접 찍어야 하는 이유다. 이 테스트가 실패한다면
    편차가 사라졌다는 뜻이므로, 자동 추정만으로 충분한지 다시 판단해야 한다.
    """
    from fp import config, raster

    values = {f: georef.px_per_mm_for(raster.load_floor_image(f)) for f in config.FLOORS}
    spread = max(values.values()) - min(values.values())
    assert spread > 0.001, f"편차가 예상보다 작다. 자동 추정 재검토 필요: {values}"


def test_px_per_mm_is_plausible_for_400dpi():
    from fp import raster
    image = raster.load_floor_image("2F")
    value = georef.px_per_mm_for(image)
    # 90200mm 를 약 2400~3600px 로 표현 → 0.026~0.040 px/mm
    assert 0.02 < value < 0.06, f"px_per_mm 이 이상함: {value}"
