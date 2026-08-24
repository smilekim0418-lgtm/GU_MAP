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

    # 원점은 치수선이 아니라 층마다 찍은 같은 건물 모서리에서 가져온다.
    #
    # 치수선을 원점으로 쓰면 안 되는 이유: 90,200 체인이 B1F·1F 도면에서는
    # 위쪽에, 나머지 층에서는 아래쪽에 있다. 그러면 층마다 건물 북쪽 끝과
    # 남쪽 끝을 섞어 가리키게 되어(약 88m 차이) 하나의 변환으로 못 맞춘다.
    # 실측에서 통합 축척이 0.55 로 나왔다.
    reference = min(points, key=lambda c: c["lat"] + c["lon"])  # 남서쪽 모서리
    by_floor: dict[str, list] = {}
    for cp in points:
        by_floor.setdefault(cp["floor"], []).append(cp)

    origins = {}
    for floor, floor_points in by_floor.items():
        nearest = min(
            floor_points,
            key=lambda c: (c["lat"] - reference["lat"]) ** 2 + (c["lon"] - reference["lon"]) ** 2,
        )
        origins[floor] = [int(nearest["px"][0]), int(nearest["px"][1])]

    src, dst = [], []
    for cp in points:
        floor = cp["floor"]
        px_per_mm = data["floor_px_per_mm"][floor]
        meters = georef.pixels_to_meters([tuple(cp["px"])], tuple(origins[floor]), px_per_mm)[0]
        src.append(meters)
        dst.append((float(cp["lon"]), float(cp["lat"])))

    try:
        transform = georef.solve_similarity(src, dst)
    except georef.GeoRefError as exc:
        print(f"실패: {exc}")
        return 1

    data["transform"] = georef.to_dict(transform)
    data["floor_origin_px"] = {**(data.get("floor_origin_px") or {}), **origins}
    georef.save(data)

    # 잔차를 보고한다. 이 숫자가 좌표 품질의 유일한 실측 근거다.
    residuals = []
    for (x, y), (lon, lat) in zip(src, dst):
        got_lon, got_lat = georef.apply(transform, x, y)
        east = (got_lon - lon) * georef._meters_per_deg_lon()
        north = (got_lat - lat) * config.METERS_PER_DEG_LAT
        residuals.append((east ** 2 + north ** 2) ** 0.5)
    rms = (sum(r ** 2 for r in residuals) / len(residuals)) ** 0.5
    print(f"회전 {transform.theta_deg:.3f}° · 축척 {transform.scale:.5f}")
    print(f"잔차 RMS {rms:.2f}m · 최대 {max(residuals):.2f}m · 대응점 {len(src)}개")
    if max(residuals) > 3.0:
        print("경고: 최대 잔차가 3m 를 넘는다. 대응점 하나가 어긋났을 수 있다.")
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
