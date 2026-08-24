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


def test_stitched_image_puts_north_at_the_top():
    """상하가 뒤집히면 정사영상 위에서 찍은 대응점이 전부 어긋난다.

    지리 경계만 보는 테스트로는 반전을 못 잡는다. 타일 파일을 직접 읽어
    캔버스의 어느 행에 놓였는지 픽셀 단위로 대조한다.
    """
    import math

    import cv2
    import numpy as np

    from fp import config

    path, _ = ortho.stitch()
    canvas = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)

    lon_c, lat_c = ortho.BUILDING_CENTRE
    d_lat = ortho.HALF_EXTENT_M / config.METERS_PER_DEG_LAT
    d_lon = ortho.HALF_EXTENT_M / (
        config.METERS_PER_DEG_LON_AT_EQUATOR * math.cos(math.radians(lat_c))
    )
    x0, y0 = ortho.tile_index(lon_c - d_lon, lat_c - d_lat)
    _, y1 = ortho.tile_index(lon_c + d_lon, lat_c + d_lat)

    def tile(ty):
        return cv2.imdecode(
            np.fromfile(str(config.ORTHO_DIR / str(ortho.ZOOM) / str(x0) / f"{ty}.jpg"),
                        dtype=np.uint8),
            cv2.IMREAD_COLOR,
        )

    size = ortho.TILE_PX
    assert np.array_equal(canvas[0:size, 0:size], tile(y1)), "북쪽 타일이 맨 위가 아니다 - 상하 반전"
    bottom = (y1 - y0) * size
    assert np.array_equal(canvas[bottom:bottom + size, 0:size], tile(y0)), "남쪽 타일이 맨 아래가 아니다"


def test_stitched_image_is_not_blank():
    import cv2
    import numpy as np

    path, _ = ortho.stitch()
    image = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
    assert image is not None
    assert image.std() > 10, "정사영상이 단색이다 - 타일을 못 읽었다"
