import numpy as np
import pytest

from fp import raster, rooms


@pytest.fixture(scope="module")
def image_2f():
    return raster.load_floor_image("2F")


@pytest.fixture(scope="module")
def polygons_2f(image_2f):
    return rooms.extract_room_polygons(image_2f)


def test_wall_mask_is_binary(image_2f):
    mask = rooms.extract_wall_mask(image_2f)
    assert set(np.unique(mask)).issubset({0, 255})


def test_wall_mask_keeps_only_a_small_fraction_of_ink(image_2f):
    mask = rooms.extract_wall_mask(image_2f)
    ratio = mask.mean() / 255
    assert 0.005 < ratio < 0.08, f"벽선 비율이 이상함: {ratio}"


def test_wall_mask_matches_input_size(image_2f):
    mask = rooms.extract_wall_mask(image_2f)
    assert mask.shape == image_2f.shape[:2]


def test_extracts_a_useful_number_of_rooms(polygons_2f):
    # 2F 도면상 방은 61개. 무보정 검증에서 52개를 얻었다.
    assert 40 <= len(polygons_2f) <= 90


def test_polygons_are_not_all_rectangles(polygons_2f):
    # 기존 가짜 데이터는 전부 4점 사각형이었다. 진짜 도면은 그렇지 않다.
    non_rect = [p for p in polygons_2f if len(p.points) > 4]
    assert non_rect, "모든 폴리곤이 사각형이면 실제 벽 형상을 못 딴 것이다"


def test_polygons_have_at_least_three_points(polygons_2f):
    assert all(len(p.points) >= 3 for p in polygons_2f)


def test_polygon_areas_are_positive(polygons_2f):
    assert all(p.area_px > 0 for p in polygons_2f)


def test_centroid_is_inside_the_image(polygons_2f, image_2f):
    height, width = image_2f.shape[:2]
    for polygon in polygons_2f:
        cx, cy = polygon.centroid
        assert 0 <= cx < width
        assert 0 <= cy < height


def test_every_floor_yields_polygons():
    for floor in ["B1F", "1F", "2F", "3F", "4F", "5F", "6F"]:
        image = raster.load_floor_image(floor)
        found = rooms.extract_room_polygons(image)
        assert found, f"{floor} 에서 방을 하나도 못 찾음"
