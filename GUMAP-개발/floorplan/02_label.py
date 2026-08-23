"""OCR 로 방 번호를 읽어 폴리곤에 붙이고 미매칭을 리포트한다.

사용법:
  python 02_label.py              # 전 층
  python 02_label.py 2F           # 한 층만
"""
import json
import sys
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8")

from fp import config, excel, labels, ocr, qc, raster, rooms  # noqa: E402


def label_floor(floor: str, all_rooms: dict) -> dict:
    polygon_path = config.WORK_DIR / f"{floor}_polygons.json"
    if not polygon_path.exists():
        raise SystemExit(f"{polygon_path} 가 없다. 먼저 01_extract.py 를 실행하라.")
    raw = json.loads(polygon_path.read_text(encoding="utf-8"))

    polygons = [
        rooms.RoomPolygon(
            points=[(int(x), int(y)) for x, y in p["points"]],
            area_px=float(p["area_px"]),
            centroid=(float(p["centroid"][0]), float(p["centroid"][1])),
        )
        for p in raw["polygons"]
    ]

    png = raster.render_floor(floor)
    words = ocr.ocr_image(png)
    expected = {r.room_id for r in all_rooms[floor]}

    labeled, report = labels.assign_labels(polygons, words, expected)

    print(
        f"{floor}: 매칭 {len(report.matched)} / 엑셀 {len(expected)} "
        f"· 번호없음 {report.unlabeled} · 폴리곤없음 {len(report.missing)} "
        f"· 모호 {len(report.ambiguous)} · 예상밖 {len(report.unexpected)}"
    )

    overlay = qc.draw_overlay(raster.load_floor_image(floor), labeled)
    qc.save_image(overlay, config.WORK_DIR / f"{floor}_qc.png")

    return {
        "floor": floor,
        "size": raw["size"],
        "polygons": [
            {
                "points": [[int(x), int(y)] for x, y in item.polygon.points],
                "area_px": item.polygon.area_px,
                "centroid": list(item.polygon.centroid),
                "room_id": item.room_id,
                "candidates": item.candidates,
                "drawing_name": item.drawing_name,
            }
            for item in labeled
        ],
        "report": asdict(report),
    }


def main() -> int:
    targets = sys.argv[1:] or config.FLOORS
    all_rooms = excel.load_rooms()
    summary = {}
    for floor in targets:
        if floor not in config.FLOORS:
            print(f"알 수 없는 층: {floor}")
            return 1
        data = label_floor(floor, all_rooms)
        (config.WORK_DIR / f"{floor}_labeled.json").write_text(
            json.dumps(data, ensure_ascii=False), encoding="utf-8"
        )
        summary[floor] = data["report"]
    (config.WORK_DIR / "report.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\n리포트: {config.WORK_DIR / 'report.json'}")
    print(f"검수 이미지: {config.WORK_DIR}/*_qc.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
