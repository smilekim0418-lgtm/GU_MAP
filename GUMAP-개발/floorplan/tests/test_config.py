from fp import config


def test_floor_list_is_ordered_basement_first():
    assert config.FLOORS == ["B1F", "1F", "2F", "3F", "4F", "5F", "6F"]


def test_every_floor_has_a_plan_source():
    assert set(config.SOURCES) == set(config.FLOORS)


def test_each_floor_maps_to_its_measured_best_source():
    assert config.SOURCES["B1F"] == ("테크노관B1F~2F.pdf", 0)
    assert config.SOURCES["1F"] == ("테크노관1,2층.pdf", 0)
    assert config.SOURCES["5F"] == ("테크노관4,5층.pdf", 1)


def test_6f_is_the_second_page_of_the_5_6_pdf():
    assert config.SOURCES["6F"] == ("테크노관5.6층.pdf", 1)


def test_expected_room_counts_total_361():
    assert sum(config.EXPECTED_ROOM_COUNTS.values()) == 361


def test_drawing_extent_matches_dimension_chain():
    assert config.DRAWING_EXTENT_MM == (90200, 88700)


def test_scale_tolerance_is_two_percent():
    assert config.SCALE_TOLERANCE == (0.98, 1.02)


def test_categories_match_the_indoor_module_style_table():
    assert config.CATEGORIES == frozenset({
        "laboratory", "classroom", "office", "restroom", "stairs",
        "elevator", "walkway", "utility", "breakroom", "library", "atrium",
    })


def test_plan_source_returns_an_existing_pdf():
    path, page = config.plan_source("2F")
    assert path.exists(), f"도면 PDF를 찾을 수 없음: {path}"
    assert page == 0


def test_excel_path_exists():
    assert config.EXCEL_PATH.exists(), f"엑셀을 찾을 수 없음: {config.EXCEL_PATH}"
