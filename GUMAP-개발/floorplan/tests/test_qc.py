import numpy as np

from fp import labels, qc, rooms


def square(x0, y0, size):
    return rooms.RoomPolygon(
        points=[(x0, y0), (x0 + size, y0), (x0 + size, y0 + size), (x0, y0 + size)],
        area_px=float(size * size),
        centroid=(x0 + size / 2, y0 + size / 2),
    )


def test_overlay_does_not_modify_the_input():
    image = np.full((200, 200, 3), 255, dtype=np.uint8)
    original = image.copy()
    qc.draw_overlay(image, [labels.LabeledPolygon(polygon=square(10, 10, 50), room_id="201")])
    assert np.array_equal(image, original)


def test_overlay_draws_something():
    image = np.full((200, 200, 3), 255, dtype=np.uint8)
    out = qc.draw_overlay(image, [labels.LabeledPolygon(polygon=square(10, 10, 50), room_id="201")])
    assert not np.array_equal(out, image)


def test_matched_and_unlabeled_get_different_colours():
    image = np.full((200, 200, 3), 255, dtype=np.uint8)
    matched = qc.draw_overlay(image, [labels.LabeledPolygon(polygon=square(10, 10, 50), room_id="201")])
    unlabeled = qc.draw_overlay(image, [labels.LabeledPolygon(polygon=square(10, 10, 50), room_id=None)])
    assert not np.array_equal(matched, unlabeled)


def test_save_image_writes_a_file(tmp_path):
    image = np.full((50, 50, 3), 255, dtype=np.uint8)
    path = tmp_path / "out.png"
    qc.save_image(image, path)
    assert path.exists() and path.stat().st_size > 0
