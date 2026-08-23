import pytest

from fp import labels, ocr, rooms


def square(x0, y0, size, area=None):
    points = [(x0, y0), (x0 + size, y0), (x0 + size, y0 + size), (x0, y0 + size)]
    return rooms.RoomPolygon(
        points=points,
        area_px=float(area if area is not None else size * size),
        centroid=(x0 + size / 2, y0 + size / 2),
    )


def word_at(text, cx, cy):
    return ocr.OcrWord(text=text, x=cx - 10, y=cy - 5, w=20, h=10)


def test_recognizes_a_plain_room_number():
    assert labels.looks_like_room_number("201")


def test_recognizes_a_basement_room_number():
    assert labels.looks_like_room_number("B108")


def test_recognizes_a_suffixed_room_number():
    assert labels.looks_like_room_number("305-1")


def test_rejects_korean_text():
    assert not labels.looks_like_room_number("강의실")


def test_rejects_dimension_numbers():
    assert not labels.looks_like_room_number("7,200")
    assert not labels.looks_like_room_number("90200")


def test_rejects_two_digit_numbers():
    assert not labels.looks_like_room_number("12")


def test_extracts_a_room_number_fused_to_a_name():
    # 실측: OCR 이 대학원연구실 241-1 을 한 토큰으로 붙여 내놓았다
    assert labels.extract_embedded_room_numbers("학원연구닐241-1") == ["241-1"]
    assert labels.extract_embedded_room_numbers("화장실155") == ["155"]


def test_does_not_extract_numbers_out_of_dimension_strings():
    for dimension in ["7,200", "90,200", "88,700", "69,000", "13,300", "75800", "90200"]:
        assert labels.extract_embedded_room_numbers(dimension) == [], dimension


def test_extracts_nothing_from_plain_korean():
    assert labels.extract_embedded_room_numbers("탄소재료연구실") == []
    assert labels.extract_embedded_room_numbers("") == []


def test_fused_room_number_is_assigned_when_it_is_expected():
    polygons = [square(0, 0, 100)]
    words = [word_at("학원연구닐241-1", 50, 50)]
    labeled, report = labels.assign_labels(polygons, words, {"241-1"})
    assert labeled[0].room_id == "241-1"
    assert report.matched == ["241-1"]


def test_fused_number_outside_the_expected_set_is_dropped_silently():
    # 도면의 임의 숫자를 unexpected 로 시끄럽게 보고하지 않는다
    polygons = [square(0, 0, 100)]
    words = [word_at("가나다999", 50, 50)]
    labeled, report = labels.assign_labels(polygons, words, {"201"})
    assert labeled[0].room_id is None
    assert report.unexpected == []


def test_service_name_matches_an_exact_vocabulary_entry():
    assert labels.match_service_name("화장실") == "화장실"
    assert labels.match_service_name("계단") == "계단"


def test_service_name_tolerates_the_ocr_misreading_of_shower_room():
    # 검증에서 Windows OCR 이 샤워실을 사워실로 읽었다
    assert labels.match_service_name("사워실") == "샤워실"


def test_service_name_matches_a_prefixed_variant():
    assert labels.match_service_name("장애인화장실") == "장애인화장실"


def test_service_name_rejects_words_outside_the_vocabulary():
    assert labels.match_service_name("탄소재료연구실") is None
    assert labels.match_service_name("최적실계실험실") is None
    assert labels.match_service_name("") is None


def test_service_name_rejects_a_room_number():
    assert labels.match_service_name("201") is None


def test_point_inside_square():
    pts = [(0, 0), (10, 0), (10, 10), (0, 10)]
    assert labels.point_in_polygon((5, 5), pts)


def test_point_outside_square():
    pts = [(0, 0), (10, 0), (10, 10), (0, 10)]
    assert not labels.point_in_polygon((15, 5), pts)


def test_assigns_a_label_when_the_number_sits_inside():
    polygons = [square(0, 0, 100)]
    words = [word_at("201", 50, 50)]
    labeled, report = labels.assign_labels(polygons, words, {"201", "202"})
    assert labeled[0].room_id == "201"
    assert report.matched == ["201"]


def test_reports_a_polygon_with_no_number_as_unlabeled():
    polygons = [square(0, 0, 100)]
    labeled, report = labels.assign_labels(polygons, [], {"201"})
    assert labeled[0].room_id is None
    assert report.unlabeled == 1


def test_reports_an_expected_room_with_no_polygon_as_missing():
    polygons = [square(0, 0, 100)]
    words = [word_at("201", 50, 50)]
    _, report = labels.assign_labels(polygons, words, {"201", "202"})
    assert report.missing == ["202"]


def test_reports_two_numbers_in_one_polygon_as_ambiguous():
    polygons = [square(0, 0, 100)]
    words = [word_at("201", 30, 50), word_at("202", 70, 50)]
    labeled, report = labels.assign_labels(polygons, words, {"201", "202"})
    assert labeled[0].room_id is None
    assert report.ambiguous == [["201", "202"]]


def test_number_not_in_the_expected_set_is_reported_as_unexpected():
    polygons = [square(0, 0, 100)]
    words = [word_at("999", 50, 50)]
    labeled, report = labels.assign_labels(polygons, words, {"201"})
    assert labeled[0].room_id is None
    assert report.unexpected == ["999"]


def test_a_number_outside_every_polygon_is_ignored_for_assignment():
    polygons = [square(0, 0, 100)]
    words = [word_at("201", 500, 500)]
    labeled, report = labels.assign_labels(polygons, words, {"201"})
    assert labeled[0].room_id is None
    assert report.missing == ["201"]


def test_the_smallest_containing_polygon_wins():
    outer = square(0, 0, 200)
    inner = square(40, 40, 40)
    words = [word_at("201", 60, 60)]
    labeled, _ = labels.assign_labels([outer, inner], words, {"201"})
    by_area = {p.polygon.area_px: p.room_id for p in labeled}
    assert by_area[40 * 40] == "201"
    assert by_area[200 * 200] is None


def test_captures_a_service_room_name_from_the_drawing():
    polygons = [square(0, 0, 100)]
    words = [word_at("155", 50, 40), word_at("화장실", 50, 60)]
    labeled, _ = labels.assign_labels(polygons, words, {"155"})
    assert labeled[0].room_id == "155"
    assert labeled[0].drawing_name == "화장실"


def test_ignores_drawing_words_outside_the_vocabulary():
    polygons = [square(0, 0, 100)]
    words = [word_at("201", 50, 40), word_at("탄소재료연구실", 50, 60)]
    labeled, _ = labels.assign_labels(polygons, words, {"201"})
    assert labeled[0].drawing_name is None


def test_drawing_name_is_none_when_no_korean_word_is_present():
    polygons = [square(0, 0, 100)]
    labeled, _ = labels.assign_labels(polygons, [word_at("201", 50, 50)], {"201"})
    assert labeled[0].drawing_name is None


def test_drawing_name_is_captured_even_when_the_number_is_unreadable():
    # 번호를 못 읽어도 이름은 보정 화면에서 쓸 수 있으므로 버리지 않는다
    polygons = [square(0, 0, 100)]
    labeled, _ = labels.assign_labels(polygons, [word_at("화장실", 50, 50)], {"155"})
    assert labeled[0].room_id is None
    assert labeled[0].drawing_name == "화장실"
