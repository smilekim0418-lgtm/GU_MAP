"""드론 정사영상 타일을 정확한 지리 경계와 함께 한 장으로 이어붙인다.

프론트의 Ortho4326TmsLayer 는 WebMercator 요청을 가까운 4326 타일로 바꾸는
근사 방식이라 대응점 지정에는 쓸 수 없다. 여기서는 4326 TMS 타일의 실제
경계를 그대로 계산해 오차 없이 배치한다.

타일 스킴: x = (lon+180)/360 * 2^(z+1),  y = (lat+90)/180 * 2^z  (TMS, y 는 남쪽이 0)
테크노관을 덮는 최고 해상도는 z16 (약 0.96 m/px). z17 은 캠퍼스 일부만 있다.
"""
import json
import math
from pathlib import Path

import cv2
import numpy as np

from . import config

ZOOM = 16
TILE_PX = 256
HALF_EXTENT_M = 150.0
BUILDING_CENTRE = (128.394348, 36.146643)  # lon, lat


def tile_index(lon: float, lat: float, zoom: int = ZOOM) -> tuple[int, int]:
    x = int((lon + 180.0) / 360.0 * (2 ** (zoom + 1)))
    y = int((lat + 90.0) / 180.0 * (2 ** zoom))
    return x, y


def tile_bounds(tx: int, ty: int, zoom: int = ZOOM) -> tuple[float, float, float, float]:
    """(west, south, east, north)."""
    span_lon = 360.0 / (2 ** (zoom + 1))
    span_lat = 180.0 / (2 ** zoom)
    west = tx * span_lon - 180.0
    south = ty * span_lat - 90.0
    return west, south, west + span_lon, south + span_lat


def stitch(zoom: int = ZOOM, force: bool = False) -> tuple[Path, dict]:
    """건물 주변 타일을 이어붙여 PNG 와 정확한 경계를 반환한다."""
    out_png = config.WORK_DIR / f"ortho_z{zoom}.png"
    out_json = config.WORK_DIR / f"ortho_z{zoom}.json"
    if out_png.exists() and out_json.exists() and not force:
        return out_png, json.loads(out_json.read_text(encoding="utf-8"))

    lon_c, lat_c = BUILDING_CENTRE
    d_lat = HALF_EXTENT_M / config.METERS_PER_DEG_LAT
    d_lon = HALF_EXTENT_M / (
        config.METERS_PER_DEG_LON_AT_EQUATOR * math.cos(math.radians(lat_c))
    )
    x0, y0 = tile_index(lon_c - d_lon, lat_c - d_lat, zoom)
    x1, y1 = tile_index(lon_c + d_lon, lat_c + d_lat, zoom)

    width = (x1 - x0 + 1) * TILE_PX
    height = (y1 - y0 + 1) * TILE_PX
    canvas = np.zeros((height, width, 3), dtype=np.uint8)

    found = 0
    for tx in range(x0, x1 + 1):
        for ty in range(y0, y1 + 1):
            path = config.ORTHO_DIR / str(zoom) / str(tx) / f"{ty}.jpg"
            if not path.exists():
                continue
            tile = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
            if tile is None:
                continue
            # TMS 는 y 가 남쪽부터 증가하고 이미지는 위에서부터 채운다
            top = (y1 - ty) * TILE_PX
            left = (tx - x0) * TILE_PX
            canvas[top:top + TILE_PX, left:left + TILE_PX] = tile
            found += 1
    if found == 0:
        raise FileNotFoundError(f"정사영상 타일을 찾지 못했다: {config.ORTHO_DIR / str(zoom)}")

    west, south, _, _ = tile_bounds(x0, y0, zoom)
    _, _, east, north = tile_bounds(x1, y1, zoom)
    bounds = {"west": west, "south": south, "east": east, "north": north,
              "zoom": zoom, "tiles": found}

    config.WORK_DIR.mkdir(parents=True, exist_ok=True)
    ok, buffer = cv2.imencode(".png", canvas)
    if not ok:
        raise RuntimeError("정사영상 PNG 인코드 실패")
    buffer.tofile(str(out_png))
    out_json.write_text(json.dumps(bounds, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_png, bounds
