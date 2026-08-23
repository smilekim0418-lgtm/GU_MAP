"""좌표 변환을 확정한다.

  python 03_georef.py init     # techno_georef.json 뼈대 생성 (기준점 자동 검출)
  python 03_georef.py solve    # control_points 로 transform 산출
  python 03_georef.py show     # 현재 상태 확인

control_points 는 사람이 채워야 한다. 형식:
  [{"px": [x, y], "floor": "2F", "lon": 128.3945, "lat": 36.1471}, ...]
정사영상 위에서 건물 모서리를 3점 이상 찍어 넣는다.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8")

from fp import config, georef, ortho, raster  # noqa: E402


def cmd_init() -> int:
    png, bounds = ortho.stitch()
    print(f"정사영상 스티칭: {png} (타일 {bounds['tiles']}장)")
    print(f"  경계 W {bounds['west']:.6f} E {bounds['east']:.6f} "
          f"S {bounds['south']:.6f} N {bounds['north']:.6f}")

    origins, scales = {}, {}
    for floor in config.FLOORS:
        image = raster.load_floor_image(floor)
        origins[floor] = list(georef.detect_frame_origin(image))
        scales[floor] = georef.px_per_mm_for(image)
        print(f"{floor}: 기준점 {origins[floor]}, px/mm {scales[floor]:.6f}")

    data = {
        "reference_latitude": config.REFERENCE_LATITUDE,
        "drawing_extent_mm": {"x": config.DRAWING_EXTENT_MM[0], "y": config.DRAWING_EXTENT_MM[1]},
        "transform": {"theta_deg": None, "scale": None, "t_lon": None, "t_lat": None},
        "control_points": [],
        "floor_origin_px": origins,
        "floor_px_per_mm": scales,
    }
    georef.save(data)
    print(f"\n생성: {config.GEOREF_PATH}")
    print("이제 control_points 를 채워야 한다. 보정 화면의 '좌표 대응점' 모드를 쓰거나")
    print("정사영상에서 읽은 건물 모서리 좌표를 직접 넣는다 (3점 이상).")
    return 0


def cmd_solve() -> int:
    data = georef.load()
    points = data.get("control_points") or []
    if len(points) < 3:
        print(f"대응점이 {len(points)}개다. 3개 이상 필요하다.")
        return 1

    src, dst = [], []
    for cp in points:
        floor = cp["floor"]
        origin = data["floor_origin_px"][floor]
        px_per_mm = data["floor_px_per_mm"][floor]
        meters = georef.pixels_to_meters([tuple(cp["px"])], tuple(origin), px_per_mm)[0]
        src.append(meters)
        dst.append((float(cp["lon"]), float(cp["lat"])))

    try:
        transform = georef.solve_similarity(src, dst)
    except georef.GeoRefError as exc:
        print(f"실패: {exc}")
        return 1

    data["transform"] = georef.to_dict(transform)
    georef.save(data)
    print(f"회전 {transform.theta_deg:.3f}° · 축척 {transform.scale:.5f}")
    print(f"원점 {transform.t_lon:.7f}, {transform.t_lat:.7f}")
    print(f"저장: {config.GEOREF_PATH}")
    return 0


def cmd_show() -> int:
    data = georef.load()
    print(f"대응점 {len(data.get('control_points') or [])}개")
    print(f"transform: {data.get('transform')}")
    return 0


COMMANDS = {"init": cmd_init, "solve": cmd_solve, "show": cmd_show}

if __name__ == "__main__":
    name = sys.argv[1] if len(sys.argv) > 1 else "show"
    if name not in COMMANDS:
        print(f"사용법: python 03_georef.py [{'|'.join(COMMANDS)}]")
        raise SystemExit(1)
    raise SystemExit(COMMANDS[name]())
