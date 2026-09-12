"""CAD 외부 출입문 산출물과 메인 지도에 실린 CAD 레이어 데이터.

여기서 검사하는 건 '값이 맞는가' 가 아니라 '약속을 지키는가' 다. 실제 문이
거기 있는지는 도면과 현장을 봐야 알고, 그 대조는 output/entrance-review-*.png
와 README 에 남긴다. 코드가 보장할 수 있는 건 이 정도다.

  - 판정이 CAD 에서만 나온다 (기존 지도의 '외부' 표기를 섞지 않는다)
  - 검토 등급(review)은 지도에 나가지 않는다
  - 호실 번호와 좌표 변환이 건물 위에 떨어진다
  - 도면 이미지 기반 실내지도 백업이 원본과 같다
"""
import hashlib
import json
import math
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
CAD_OUT = ROOT / "GUMAP-개발/floorplan/cad/output"
PUBLISHED = ROOT / "GUMAP-학교지도/data/cad"
FLOORS = ["B1F"] + [f"{i}F" for i in range(1, 7)]

# 테크노관을 여유 있게 감싸는 상자. 좌표 변환이 통째로 어긋나면 여기서 걸린다.
BUILDING_BOX = dict(lat=(36.1455, 36.1478), lon=(128.3930, 128.3958))

pytestmark = pytest.mark.skipif(
    not (CAD_OUT / "entrances_report.json").exists(),
    reason="cad/exterior_doors.py 산출물이 없다",
)


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def entrances():
    return {floor: read(CAD_OUT / f"{floor}.entrances.local.geojson") for floor in FLOORS}


def test_every_floor_has_an_entrance_file(entrances):
    assert set(entrances) == set(FLOORS)


def test_findings_come_from_cad_only(entrances):
    """판정에 기존 지도를 섞지 않는다.

    출입문마다 근거가 되는 CAD 원호 handle 이 있어야 한다. handle 없이 좌표만
    있는 항목이 생겼다면 그건 기존 지도에서 흘러든 것이다.
    """
    for floor in FLOORS:
        for feature in entrances[floor]["features"]:
            props = feature["properties"]
            assert props["certainty"] in ("high", "low", "review")
            assert props["placement"] in ("exterior", "courtyard")
            assert props["routing_verified"] is False
            assert feature["geometry"]["type"] == "Point"
            if props["kind"] == "exterior_door":
                assert props["source_handle"], props["id"]
                assert props["certainty"] in ("high", "low")
            else:
                assert props["kind"] == "open_gap"
                assert props["certainty"] == "review"


def test_open_run_decides_certainty(entrances):
    """'트인 곳' 은 나가서 실제로 트여 있어야 한다."""
    for floor in FLOORS:
        for feature in entrances[floor]["features"]:
            props = feature["properties"]
            if props["kind"] != "exterior_door":
                continue
            run = props["outside_run_m"]
            assert run is not None, props["id"]
            assert (props["certainty"] == "high") == (run >= 4.0), (props["id"], run)


def test_cad_reproduces_most_of_the_old_map(entrances):
    """기존 지도의 '외부' 표기를 CAD 판정이 얼마나 되짚는지 지켜본다.

    판정에 쓰지는 않지만, 이 수치가 갑자기 떨어지면 외피 만드는 쪽이 깨진 것이다.
    """
    report = read(CAD_OUT / "entrances_report.json")["floors"]
    total = sum(report[floor]["legacy_exterior"] for floor in FLOORS)
    hit = sum(report[floor]["legacy_reproduced"] for floor in FLOORS)
    assert total == 11, total
    assert hit >= 9, f"{hit}/{total}"


@pytest.mark.skipif(not (PUBLISHED / "index.json").exists(), reason="publish.py 를 아직 안 돌렸다")
class TestPublished:
    @pytest.fixture(scope="class")
    def index(self):
        return read(PUBLISHED / "index.json")

    def test_review_findings_stay_off_the_map(self, index, entrances):
        published = {d["id"] for floor in index["floors"] for d in floor["entrances"]}
        for floor in FLOORS:
            for feature in entrances[floor]["features"]:
                props = feature["properties"]
                assert (props["id"] in published) == (props["certainty"] != "review"), props["id"]

    def test_every_room_number_is_accounted_for(self, index):
        """DWG 의 호실 번호는 지도에 오르거나, 못 올린 이유가 적히거나 둘 중 하나다."""
        placed = sum(f["room_count"] for f in index["floors"])
        outside = sum(len(f["labels_outside_building"]) for f in index["floors"])
        assert placed + outside == 353, (placed, outside)
        assert placed >= 300

    def test_rooms_sit_inside_the_building(self, index):
        for floor in index["floors"]:
            bundle = read(PUBLISHED / f'{floor["floor"]}.json')
            assert len(bundle["rooms"]) >= 8, floor["floor"]
            assert bundle["outline"], floor["floor"]
            for room in bundle["rooms"]:
                assert room["ids"], floor["floor"]
                assert len(room["at"]) == 2
                if room["ring"]:
                    assert len(room["ring"]) >= 8 and len(room["ring"]) % 2 == 0

    def test_entrances_land_on_the_building(self, index):
        for floor in index["floors"]:
            for door in floor["entrances"]:
                assert BUILDING_BOX["lat"][0] < door["lat"] < BUILDING_BOX["lat"][1], door["id"]
                assert BUILDING_BOX["lon"][0] < door["lon"] < BUILDING_BOX["lon"][1], door["id"]

    def test_registration_has_no_systematic_shift(self, index):
        """CAD 가 기존 지도 위에 그대로 얹혀야 한다.

        전에는 층마다 북쪽으로 0.57 m 씩 밀려 있었다. CAD 번호 글자 위치를 방
        중심으로 착각하고 맞춘 평행이동을 그대로 썼기 때문이다. 지도에서 벽선이
        한 칸 비켜 보였고, 수치로는 잔차 중앙값이 아니라 편의로만 드러났다.
        """
        for floor in index["floors"]:
            affine = floor["affine"]
            assert affine["rooms"] >= 7, floor["floor"]
            assert affine["median_residual_m"] <= 0.25, (floor["floor"], affine)

    def test_affine_keeps_cad_scale(self, index):
        """변환은 회전·이동뿐이어야 한다. 축척이 흔들리면 CAD 치수가 거짓이 된다."""
        for floor in index["floors"]:
            affine = floor["affine"]
            mpd_lat = 110540.0
            mpd_lon = 111320.0 * math.cos(math.radians(36.1466))
            x_len = math.hypot(affine["lon"][0] * mpd_lon, affine["lat"][0] * mpd_lat)
            y_len = math.hypot(affine["lon"][1] * mpd_lon, affine["lat"][1] * mpd_lat)
            assert abs(x_len - 1.0) < 0.01, (floor["floor"], x_len)
            assert abs(y_len - 1.0) < 0.01, (floor["floor"], y_len)
            # 직교성: 회전만 걸렸으면 두 축은 수직이다
            dot = (affine["lon"][0] * mpd_lon * affine["lon"][1] * mpd_lon
                   + affine["lat"][0] * mpd_lat * affine["lat"][1] * mpd_lat)
            assert abs(dot) < 0.01, floor["floor"]

    def test_each_floor_ships_its_linework(self, index):
        for floor in index["floors"]:
            bundle = read(PUBLISHED / f'{floor["floor"]}.json')
            assert bundle["floor"] == floor["floor"]
            assert len(bundle["paths"]) == floor["path_count"] > 1000
            assert all(len(path) >= 4 and len(path) % 2 == 0 for path in bundle["paths"])

    def test_frontend_bundle_matches_the_data(self, index):
        text = (ROOT / "GUMAP-프론트/js/map/map-techno-cad-data.js").read_text(encoding="utf-8")
        assert text.startswith("window.TECHNO_CAD = ")
        bundle = json.loads(text[len("window.TECHNO_CAD = "):].rstrip().rstrip(";"))
        assert bundle["meta"]["sha256"] == index["meta"]["sha256"]
        assert [f["floor"] for f in bundle["floors"]] == [f["floor"] for f in index["floors"]]


def test_legacy_indoor_backup_matches_the_project():
    """백업이 지금 프로젝트와 같은지 본다. 다르면 어느 쪽이 옛것인지 알려 준다."""
    backups = sorted(p for p in (ROOT / "backup").glob("실내지도-도면기반-*")
                     if (p / "manifest.json").exists())
    assert backups, "도면 기반 실내지도 백업이 없다"
    manifest = read(backups[-1] / "manifest.json")
    assert manifest["files"], "백업이 비어 있다"
    for record in manifest["files"]:
        copy = backups[-1] / record["path"]
        assert copy.exists(), record["path"]
        assert hashlib.sha256(copy.read_bytes()).hexdigest() == record["sha256"], record["path"]
