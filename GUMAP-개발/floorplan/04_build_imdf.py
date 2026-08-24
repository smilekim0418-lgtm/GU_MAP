"""보정된 폴리곤 + 엑셀 + 좌표변환 → IMDF geojson 과 프론트 번들.

  python 04_build_imdf.py            # 검증만 하고 결과 출력
  python 04_build_imdf.py --write    # 실제로 파일을 교체
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8")

from fp import config, excel, georef, imdf, validate  # noqa: E402

BUNDLE_KEY_TO_FILE = {
    "venue": "venue.geojson",
    "building": "building.geojson",
    "levels": "level.geojson",
    "units": "unit.geojson",
    "footprint": "footprint.geojson",
    "occupants": "occupant.geojson",
    "openings": "opening.geojson",
    "anchors": "anchor.geojson",
}

FRONTEND_BUNDLES = [
    config.PROJECT_ROOT / "GUMAP-프론트" / "js" / "map" / "map-techno-imdf-data.js",
    config.PROJECT_ROOT / "GUMAP-일반지도" / "map" / "map-techno-imdf-data.js",
]


def load_labeled_in_meters(data: dict, transform_data: dict) -> list[dict]:
    floor = data["floor"]
    origin = tuple(transform_data["floor_origin_px"][floor])
    px_per_mm = transform_data["floor_px_per_mm"][floor]
    result = []
    for record in data["polygons"]:
        points = [(float(x), float(y)) for x, y in record["points"]]
        result.append(
            {
                "points_m": georef.pixels_to_meters(points, origin, px_per_mm),
                "room_id": record.get("room_id"),
                "drawing_name": record.get("drawing_name"),
                "type": record.get("type", "room"),
                "connects": record.get("connects"),
                "connects_floors": record.get("connects_floors"),
            }
        )
    return result


def main() -> int:
    write = "--write" in sys.argv

    transform_data = georef.load()
    transform = georef.transform_from(transform_data)  # 미확정이면 여기서 중단된다
    print(f"변환: 회전 {transform.theta_deg:.3f}° · 축척 {transform.scale:.5f}")

    rooms_by_floor = excel.load_rooms()
    floors_present = []
    for floor in config.FLOORS:
        path = config.WORK_DIR / f"{floor}_labeled.json"
        if not path.exists():
            print(f"건너뜀: {floor} ({path.name} 없음)")
            continue
        floors_present.append(floor)

    if not floors_present:
        print("처리할 층이 없다. 01_extract.py 와 02_label.py 를 먼저 실행하라.")
        return 1

    # 사람이 치수 체인을 찍지 않은 층은 자동 추정치가 약 2배 크다. 그대로
    # 통과시키면 그 층 방들이 두 배 크기로 지도에 올라간다. load_labeled_in_meters
    # 가 층별로 floor_origin_px/floor_px_per_mm 를 찾기 전에 먼저 확인해야,
    # 보정 안 된 층에서 원시 KeyError 대신 친절한 GeoRefError 로 막을 수 있다.
    georef.assert_calibrated(transform_data, floors_present)

    labeled_by_floor = {
        floor: load_labeled_in_meters(
            json.loads((config.WORK_DIR / f"{floor}_labeled.json").read_text(encoding="utf-8")),
            transform_data,
        )
        for floor in floors_present
    }

    bundle = imdf.build_bundle(labeled_by_floor, rooms_by_floor, transform)
    units = len(bundle["units"]["features"])
    expected = sum(len(v) for v in rooms_by_floor.values())
    print(f"유닛 {units}개 / 엑셀 방 {expected}개")

    issues = validate.check_within_extent(labeled_by_floor)
    issues += validate.run_all(bundle, rooms_by_floor)
    errors = [i for i in issues if i.severity == "error"]
    warnings = [i for i in issues if i.severity == "warning"]

    print(f"\n오류 {len(errors)}건 · 경고 {len(warnings)}건")
    for issue in errors:
        print(f"  [오류] {issue.code}: {issue.message}")
    shown = {}
    for issue in warnings:
        shown.setdefault(issue.code, []).append(issue.message)
    for code, messages in shown.items():
        print(f"  [경고] {code}: {len(messages)}건")
        for message in messages[:5]:
            print(f"         {message}")
        if len(messages) > 5:
            print(f"         … 외 {len(messages) - 5}건")

    (config.WORK_DIR / "validation.json").write_text(
        json.dumps(
            [{"severity": i.severity, "code": i.code, "message": i.message} for i in issues],
            ensure_ascii=False, indent=2,
        ),
        encoding="utf-8",
    )

    if errors:
        print("\n오류가 있어 파일을 쓰지 않는다.")
        return 1
    if not write:
        print("\n검증만 수행했다. 실제로 교체하려면 --write 를 붙여라.")
        return 0

    config.IMDF_DIR.mkdir(parents=True, exist_ok=True)
    for key, filename in BUNDLE_KEY_TO_FILE.items():
        (config.IMDF_DIR / filename).write_text(
            json.dumps(bundle[key], ensure_ascii=False, indent=2), encoding="utf-8"
        )
    print(f"\nIMDF 교체: {config.IMDF_DIR}")

    payload = "window.IMDF_TECHNO_DATA = " + json.dumps(bundle, ensure_ascii=False) + ";\n"
    for target in FRONTEND_BUNDLES:
        if target.parent.exists():
            target.write_text(payload, encoding="utf-8")
            print(f"프론트 번들 갱신: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
