import pytest

from fp import ortho


def test_tile_index_matches_the_4326_tms_formula():
    # x = (lon+180)/360 * 2^(z+1), y = (lat+90)/180 * 2^z
    tx, ty = ortho.tile_index(128.394348, 36.146643, 16)
    assert tx == 112282
    assert ty == 45928


def test_tile_bounds_contain_their_own_centre():
    tx, ty = ortho.tile_index(128.394348, 36.146643, 16)
    lon0, lat0, lon1, lat1 = ortho.tile_bounds(tx, ty, 16)
    assert lon0 <= 128.394348 <= lon1
    assert lat0 <= 36.146643 <= lat1


def test_tile_bounds_are_one_tile_wide():
    lon0, lat0, lon1, lat1 = ortho.tile_bounds(112282, 45928, 16)
    assert lon1 - lon0 == pytest.approx(360 / 2 ** 17)
    assert lat1 - lat0 == pytest.approx(180 / 2 ** 16)


def test_stitch_produces_an_image_and_bounds():
    path, bounds = ortho.stitch()
    assert path.exists()
    assert bounds["west"] < bounds["east"]
    assert bounds["south"] < bounds["north"]


def test_stitched_bounds_cover_the_building():
    _, bounds = ortho.stitch()
    assert bounds["west"] < 128.394348 < bounds["east"]
    assert bounds["south"] < 36.146643 < bounds["north"]


def test_stitched_image_is_not_blank():
    import cv2
    import numpy as np

    path, _ = ortho.stitch()
    image = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
    assert image is not None
    assert image.std() > 10, "정사영상이 단색이다 - 타일을 못 읽었다"
