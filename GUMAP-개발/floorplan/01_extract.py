"""도면 PDF 에서 방 폴리곤을 추출한다 (도면 픽셀 좌표).

사용법:
  python 01_extract.py              # 전 층
  python 01_extract.py 2F           # 한 층만
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8")

from fp import config, raster, rooms  # noqa: E402


def extract_floor(floor: str) -> dict:
    image = raster.load_floor_image(floor)
    height, width = image.shape[:2]
    polygons = rooms.extract_room_polygons(image)
    expected = config.EXPECTED_ROOM_COUNTS[floor]
    ratio = len(polygons) / expected if expected else 0
    status = "OK" if ratio >= 0.4 else "LOW"
    print(f"[{status}] {floor}: 폴리곤 {len(polygons)}개 / 엑셀 방 {expected}개 ({ratio:.0%})")
    if status == "LOW":
        print(f"       경고: 추출률이 40% 미만이다. 보정 화면에서 대부분을 직접 그려야 한다.")
    return {
        "floor": floor,
        "size": [width, height],
        "polygons": [
            {
                "points": [[int(x), int(y)] for x, y in p.points],
                "area_px": p.area_px,
                "centroid": [p.centroid[0], p.centroid[1]],
            }
            for p in polygons
        ],
    }


def main() -> int:
    targets = sys.argv[1:] or config.FLOORS
    config.WORK_DIR.mkdir(parents=True, exist_ok=True)
    for floor in targets:
        if floor not in config.FLOORS:
            print(f"알 수 없는 층: {floor}")
            return 1
        data = extract_floor(floor)
        out = config.WORK_DIR / f"{floor}_polygons.json"
        out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
