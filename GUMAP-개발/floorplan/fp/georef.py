"""도면 로컬 미터 좌표 ↔ WGS84 유사변환.

지리 좌표를 다루는 곳은 이 모듈뿐이다. 앞 단계(rooms, labels)는 전부
도면 픽셀 좌표만 쓴다. 그래서 좌표를 다시 잡아도 폴리곤을 재추출하지 않는다.
"""
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path

import cv2
import numpy as np

from . import config


class GeoRefError(RuntimeError):
    """좌표 변환 산출 실패."""


@dataclass
class Transform:
    theta_deg: float
    scale: float
    t_lon: float  # 도면 원점 (0,0) 의 경도
    t_lat: float  # 도면 원점 (0,0) 의 위도


def _meters_per_deg_lon(ref_lat: float | None = None) -> float:
    latitude = config.REFERENCE_LATITUDE if ref_lat is None else ref_lat
    return config.METERS_PER_DEG_LON_AT_EQUATOR * math.cos(math.radians(latitude))


def pixels_to_meters(
    points: list[tuple[float, float]],
    origin_px: tuple[float, float],
    px_per_mm: float,
) -> list[tuple[float, float]]:
    """도면 픽셀 좌표를 건물 로컬 미터로 바꾼다.

    이미지 y 는 아래로 증가하므로 부호를 뒤집어 북쪽이 +y 가 되게 한다.
    """
    if px_per_mm <= 0:
        raise GeoRefError(f"px_per_mm 이 잘못됨: {px_per_mm}")
    ox, oy = origin_px
    mm_per_px = 1.0 / px_per_mm
    return [
        ((x - ox) * mm_per_px / 1000.0, -(y - oy) * mm_per_px / 1000.0)
        for x, y in points
    ]


def apply(transform: Transform, x_m: float, y_m: float) -> tuple[float, float]:
    """로컬 미터 → (lon, lat)."""
    theta = math.radians(transform.theta_deg)
    east = transform.scale * (x_m * math.cos(theta) - y_m * math.sin(theta))
    north = transform.scale * (x_m * math.sin(theta) + y_m * math.cos(theta))
    lon = transform.t_lon + east / _meters_per_deg_lon()
    lat = transform.t_lat + north / config.METERS_PER_DEG_LAT
    return lon, lat


def apply_many(
    transform: Transform, points_m: list[tuple[float, float]]
) -> list[tuple[float, float]]:
    return [apply(transform, x, y) for x, y in points_m]


def solve_similarity(
    src_m: list[tuple[float, float]],
    dst_lonlat: list[tuple[float, float]],
) -> Transform:
    """대응점에서 회전·축척·이동을 최소자승으로 푼다 (Umeyama, 반사 없음)."""
    if len(src_m) != len(dst_lonlat):
        raise GeoRefError(
            f"대응점 개수가 다름: src {len(src_m)} vs dst {len(dst_lonlat)}"
        )
    if len(src_m) < 3:
        raise GeoRefError(f"대응점이 3개 이상 필요하다. 현재 {len(src_m)}개.")

    source = np.asarray(src_m, dtype=float)

    # dst 를 임시 원점 기준 미터로 옮긴다
    lon0 = float(np.mean([p[0] for p in dst_lonlat]))
    lat0 = float(np.mean([p[1] for p in dst_lonlat]))
    mpd_lon = _meters_per_deg_lon()
    target = np.asarray(
        [
            [(lon - lon0) * mpd_lon, (lat - lat0) * config.METERS_PER_DEG_LAT]
            for lon, lat in dst_lonlat
        ],
        dtype=float,
    )

    src_mean = source.mean(axis=0)
    dst_mean = target.mean(axis=0)
    src_centered = source - src_mean
    dst_centered = target - dst_mean

    covariance = dst_centered.T @ src_centered / len(source)
    u, singular, vt = np.linalg.svd(covariance)
    correction = np.eye(2)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        correction[1, 1] = -1.0
    rotation = u @ correction @ vt

    src_variance = (src_centered ** 2).sum() / len(source)
    if src_variance <= 0:
        raise GeoRefError("대응점이 한 점에 몰려 있어 변환을 풀 수 없다.")
    scale = float((singular @ np.diag(correction)).sum() / src_variance)

    low, high = config.SCALE_TOLERANCE
    if not (low <= scale <= high):
        raise GeoRefError(
            f"축척이 허용 범위를 벗어남: {scale:.4f} (허용 {low}~{high}). "
            "정사영상 위 대응점을 잘못 찍었을 가능성이 높다."
        )

    theta = math.degrees(math.atan2(rotation[1, 0], rotation[0, 0]))

    # 원점 (0,0) 이 가는 곳을 t_lon/t_lat 으로 되돌린다
    translation = dst_mean - scale * (rotation @ src_mean)
    t_lon = lon0 + float(translation[0]) / mpd_lon
    t_lat = lat0 + float(translation[1]) / config.METERS_PER_DEG_LAT

    return Transform(theta_deg=theta, scale=scale, t_lon=t_lon, t_lat=t_lat)


def load(path: Path | None = None) -> dict:
    target = Path(path) if path else config.GEOREF_PATH
    if not target.exists():
        raise GeoRefError(f"좌표 파일 없음: {target}")
    return json.loads(target.read_text(encoding="utf-8"))


def save(data: dict, path: Path | None = None) -> None:
    target = Path(path) if path else config.GEOREF_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def transform_from(data: dict) -> Transform:
    """techno_georef.json 딕셔너리에서 Transform 을 꺼낸다."""
    raw = (data or {}).get("transform") or {}
    missing = [k for k in ("theta_deg", "scale", "t_lon", "t_lat") if raw.get(k) is None]
    if missing:
        raise GeoRefError(
            f"좌표 변환이 아직 확정되지 않았다 (비어 있는 값: {', '.join(missing)}). "
            "보정 화면에서 정사영상 위 대응점을 먼저 찍어야 한다."
        )
    return Transform(
        theta_deg=float(raw["theta_deg"]),
        scale=float(raw["scale"]),
        t_lon=float(raw["t_lon"]),
        t_lat=float(raw["t_lat"]),
    )


def to_dict(transform: Transform) -> dict:
    return asdict(transform)


# ── 도면틀 기준점 ────────────────────────────────────────────
# 잉크 바운딩 박스로 잡은 값은 어디까지나 초기 추정치다.
#
# 실측 경고: 층별 원본 PDF 가 표제란·여백 크기가 서로 달라서, 같은 도면틀을
# 쓰는데도 잉크 bbox 로 계산한 px/mm 가 0.0465~0.0518 로 10% 흔들린다.
# 원본을 육안 확인한 결과 전 층이 동일한 90,200 치수 체인을 갖고 있으므로
# 이 편차는 도면이 아니라 스캔 여백에서 온다.
#
# 따라서 이 값은 보정 화면에서 사람이 치수 체인 양 끝점을 찍어 확정한다.
# 여기서 나온 값은 그 화면의 초기값일 뿐이며, 최종 값은
# techno_georef.json 의 floor_origin_px / floor_px_per_mm 에 저장된다.


def _content_bbox(image) -> tuple[int, int, int, int]:
    """도면 내용(잉크)의 바운딩 박스 (x, y, w, h)."""
    from .rooms import extract_wall_mask

    mask = extract_wall_mask(image)
    points = cv2.findNonZero(mask)
    if points is None:
        raise GeoRefError("도면에서 벽선을 찾지 못했다.")
    return cv2.boundingRect(points)


def detect_frame_origin(image) -> tuple[int, int]:
    """도면 내용 바운딩 박스의 좌하단 픽셀 좌표."""
    x, y, w, h = _content_bbox(image)
    return (x, y + h)


def px_per_mm_for(image) -> float:
    """도면 가로 폭을 실측 치수로 나눈 px/mm."""
    _, _, w, _ = _content_bbox(image)
    return w / config.DRAWING_EXTENT_MM[0]
