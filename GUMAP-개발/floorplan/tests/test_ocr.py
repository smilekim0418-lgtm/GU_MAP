import cv2
import numpy as np
import pytest

from fp import ocr, raster


@pytest.fixture(scope="module")
def number_band(tmp_path_factory):
    """2F 도면에서 방번호 237~243 이 있는 띠를 잘라 저장한다."""
    image = raster.load_floor_image("2F")
    height, width = image.shape[:2]
    crop = image[int(height * 0.49):int(height * 0.58), int(width * 0.47):int(width * 0.75)]
    path = tmp_path_factory.mktemp("ocr") / "band.png"
    ok, buffer = cv2.imencode(".png", crop)
    assert ok
    buffer.tofile(str(path))
    return path


@pytest.fixture(scope="module")
def words(number_band):
    return ocr.ocr_image(number_band)


def test_returns_words(words):
    assert words, "OCR 이 아무것도 못 읽었다"


def test_reads_the_expected_room_numbers(words):
    texts = {w.text for w in words}
    for expected in ["237", "239", "240", "243"]:
        assert expected in texts, f"{expected} 를 못 읽음. 읽은 것: {sorted(texts)}"


def test_reads_a_suffixed_room_number(words):
    texts = {w.text for w in words}
    assert "238-1" in texts or "238" in texts


def test_bounding_boxes_are_positive(words):
    assert all(w.w > 0 and w.h > 0 for w in words)


def test_center_is_inside_the_bounding_box():
    word = ocr.OcrWord(text="201", x=10.0, y=20.0, w=30.0, h=10.0)
    assert ocr.center(word) == (25.0, 25.0)


def test_english_engine_also_works(number_band):
    result = ocr.ocr_image(number_band, lang="en-US")
    texts = {w.text for w in result}
    assert "237" in texts


def test_missing_file_raises(tmp_path):
    with pytest.raises(ocr.OcrError):
        ocr.ocr_image(tmp_path / "nope.png")


def test_undecodable_file_raises(tmp_path):
    path = tmp_path / "garbage.png"
    path.write_bytes(b"this is not an image")
    with pytest.raises(ocr.OcrError):
        ocr.ocr_image(path)


def test_timeout_surfaces_as_ocr_error(tmp_path, monkeypatch):
    """배치 실행 중 한 장이 멎어도 OcrError 로 나와야 그 층만 건너뛸 수 있다."""
    import subprocess

    image = np.full((50, 50, 3), 255, dtype=np.uint8)
    path = tmp_path / "ok.png"
    ok, buffer = cv2.imencode(".png", image)
    assert ok
    buffer.tofile(str(path))

    def fake_run(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd="powershell", timeout=180)

    monkeypatch.setattr(subprocess, "run", fake_run)
    with pytest.raises(ocr.OcrError, match="시간 초과"):
        ocr.ocr_image(path)


def test_oversized_image_raises(tmp_path):
    big = np.full((11000, 100, 3), 255, dtype=np.uint8)
    path = tmp_path / "big.png"
    ok, buffer = cv2.imencode(".png", big)
    assert ok
    buffer.tofile(str(path))
    with pytest.raises(ocr.OcrError, match="10000"):
        ocr.ocr_image(path)
