import numpy as np
import pytest

from fp import config, raster


@pytest.fixture(scope="module")
def png_2f():
    return raster.render_floor("2F")


def test_render_creates_a_png(png_2f):
    assert png_2f.exists()
    assert png_2f.suffix == ".png"


def test_render_writes_into_the_work_directory(png_2f):
    assert png_2f.parent == config.WORK_DIR


def test_rendered_size_is_within_the_ocr_limit(png_2f):
    img = raster.load_floor_image("2F")
    height, width = img.shape[:2]
    assert max(width, height) <= 10000, "WinRT OCR 은 10000px 를 넘기면 거부한다"


def test_rendered_image_is_landscape_a4_ish(png_2f):
    img = raster.load_floor_image("2F")
    height, width = img.shape[:2]
    assert width > height
    assert 1.3 < width / height < 1.5


def test_rendered_image_is_mostly_white_paper(png_2f):
    img = raster.load_floor_image("2F")
    assert img.mean() > 200, "도면은 흰 바탕이어야 한다"


def test_render_is_cached_on_second_call(png_2f):
    before = png_2f.stat().st_mtime_ns
    again = raster.render_floor("2F")
    assert again.stat().st_mtime_ns == before


def test_every_floor_renders():
    for floor in config.FLOORS:
        path = raster.render_floor(floor)
        assert path.exists(), f"{floor} 렌더링 실패"


def test_b1f_and_1f_render_to_different_images():
    a = raster.load_floor_image("B1F")
    b = raster.load_floor_image("1F")
    assert a.shape == b.shape
    assert not np.array_equal(a, b), "B1F 와 1F 가 같은 페이지를 가리키고 있다"


def test_unknown_floor_raises():
    with pytest.raises(KeyError):
        raster.render_floor("9F")
