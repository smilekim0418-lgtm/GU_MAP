import pytest

from fp import config, excel


def test_normalize_strips_basement_prefix():
    assert excel.normalize_room_id("T_B101") == "B101"


def test_normalize_strips_plain_prefix():
    assert excel.normalize_room_id("T201") == "201"


def test_normalize_keeps_suffix():
    assert excel.normalize_room_id("T305-1") == "305-1"


def test_normalize_trims_whitespace():
    assert excel.normalize_room_id("  T601  ") == "601"


def test_category_classroom():
    assert excel.guess_category("대강의실") == "classroom"
    assert excel.guess_category("세미나실") == "classroom"
    assert excel.guess_category("시청각실") == "classroom"


def test_category_laboratory():
    assert excel.guess_category("창의재료실험실") == "laboratory"
    assert excel.guess_category("탄소재료연구실") == "laboratory"


def test_category_restroom():
    assert excel.guess_category("화장실") == "restroom"
    assert excel.guess_category("샤워실") == "restroom"


def test_category_utility():
    assert excel.guess_category("전기실") == "utility"
    assert excel.guess_category("기계실") == "utility"
    assert excel.guess_category("배기실") == "utility"


def test_category_library():
    assert excel.guess_category("독서실") == "library"


def test_category_falls_back_to_office():
    assert excel.guess_category("관리실") == "office"
    assert excel.guess_category("") == "office"


def test_every_guessed_category_is_valid():
    for name in ["강의실", "실험실", "화장실", "전기실", "독서실", "휴게실", "", "관리실"]:
        assert excel.guess_category(name) in config.CATEGORIES


def test_load_rooms_returns_every_floor():
    rooms = excel.load_rooms()
    assert set(rooms) == set(config.FLOORS)


def test_load_rooms_counts_match_expected():
    rooms = excel.load_rooms()
    actual = {floor: len(items) for floor, items in rooms.items()}
    assert actual == config.EXPECTED_ROOM_COUNTS


def test_load_rooms_total_is_361():
    rooms = excel.load_rooms()
    assert sum(len(v) for v in rooms.values()) == 361


def test_room_ids_are_normalized():
    rooms = excel.load_rooms()
    ids = {r.room_id for r in rooms["B1F"]}
    assert "B101" in ids
    assert "T_B101" not in ids


def test_known_room_name_is_read_correctly():
    rooms = excel.load_rooms()
    by_id = {r.room_id: r for r in rooms["B1F"]}
    assert by_id["B106"].name == "창의재료실험실"
    assert by_id["B106"].category == "laboratory"


def test_tags_are_collected_from_flag_columns():
    rooms = excel.load_rooms()
    by_id = {r.room_id: r for r in rooms["2F"]}
    assert "지방대학특성화사업" in by_id["201"].tags
    assert by_id["203"].tags == ["CK-1"]


def test_rooms_without_a_name_still_load():
    rooms = excel.load_rooms()
    by_id = {r.room_id: r for r in rooms["B1F"]}
    assert by_id["B101"].name == ""
    assert by_id["B101"].category == "office"


def test_room_ids_are_unique_within_a_floor():
    rooms = excel.load_rooms()
    for floor, items in rooms.items():
        ids = [r.room_id for r in items]
        assert len(ids) == len(set(ids)), f"{floor}에 중복 방번호가 있음"
