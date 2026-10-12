# -*- coding: utf-8 -*-
"""신규 건물 자동 좌표 정합.

사진 평면의 건물 윤곽을 OpenStreetMap 건물 외곽선과 모양으로 맞춘다.
  1) OSM 외곽선을 로컬 미터 격자(PX_PER_M)로 래스터화
  2) 평면 윤곽을 회전(1° 간격 전 방향)·축척(면적비)·이동(무게중심)시켜 IoU 최대를 찾고
  3) ECC(유클리드+축척 근사: 아핀) 로 미세 조정한다.
결과는 평면 픽셀 → (경도, 위도) 아핀 변환이다. 층끼리는 같은 방법으로 기준층에 맞춘다.
"""
import json
import math

import cv2
import numpy as np

from common import WORK

PX_PER_M = 4.0
M_LAT = 110540.0


def m_lon(lat):
    return 111320.0 * math.cos(math.radians(lat))


def osm_outline(way_id):
    d = json.load(open(WORK / 'osm' / 'campus_buildings.json', encoding='utf-8'))
    for e in d['elements']:
        if e['id'] == way_id:
            return [(p['lon'], p['lat']) for p in e['geometry']]
    raise KeyError(way_id)


def footprint_canvas(lonlat, margin_m=25):
    lon0 = sum(p[0] for p in lonlat) / len(lonlat)
    lat0 = sum(p[1] for p in lonlat) / len(lonlat)
    xy = np.array([((lo - lon0) * m_lon(lat0), (la - lat0) * M_LAT) for lo, la in lonlat])
    span = xy.max(0) - xy.min(0) + 2 * margin_m
    size = int(max(span) * PX_PER_M)
    # 캔버스: 북쪽이 위(y 감소)
    px = np.column_stack([(xy[:, 0] - xy[:, 0].min() + margin_m) * PX_PER_M,
                          (xy[:, 1].max() - xy[:, 1] + margin_m) * PX_PER_M])
    canvas = np.zeros((size, size), np.uint8)
    cv2.fillPoly(canvas, [px.astype(np.int32)], 255)
    meta = {'lon0': lon0, 'lat0': lat0, 'x_min': float(xy[:, 0].min()), 'y_max': float(xy[:, 1].max()),
            'margin': margin_m}
    return canvas, meta


def canvas_to_lonlat(meta, cx, cy):
    x_m = cx / PX_PER_M - meta['margin'] + meta['x_min']
    y_m = meta['y_max'] - (cy / PX_PER_M - meta['margin'])
    return meta['lon0'] + x_m / m_lon(meta['lat0']), meta['lat0'] + y_m / M_LAT


def similarity(angle_deg, scale, src_c, dst_c):
    a = math.radians(angle_deg)
    R = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]]) * scale
    t = np.array(dst_c) - R @ np.array(src_c)
    return np.hstack([R, t[:, None]])


def iou(a, b):
    inter = np.logical_and(a > 0, b > 0).sum()
    union = np.logical_or(a > 0, b > 0).sum()
    return inter / max(union, 1)


def match_mask(src, dst, angles=range(0, 360, 2), scale_hint=None):
    """src 마스크를 dst 마스크에 맞추는 2×3 변환 (거친 탐색 + ECC)."""
    ys, xs = np.nonzero(src)
    yd, xd = np.nonzero(dst)
    src_c, dst_c = (xs.mean(), ys.mean()), (xd.mean(), yd.mean())
    scale = scale_hint or math.sqrt(len(xd) / max(len(xs), 1))
    best = (-1, None, None)
    h, w = dst.shape
    for ang in angles:
        for sc in (scale * 0.94, scale, scale * 1.06):
            M = similarity(ang, sc, src_c, dst_c)
            warped = cv2.warpAffine(src, M, (w, h), flags=cv2.INTER_NEAREST)
            score = iou(warped, dst)
            if score > best[0]:
                best = (score, M, ang)
    coarse_iou, M, ang = best
    # ECC 로 미세 조정 (흐린 마스크끼리)
    srcf = cv2.GaussianBlur(src.astype(np.float32) / 255, (0, 0), 3)
    dstf = cv2.GaussianBlur(dst.astype(np.float32) / 255, (0, 0), 3)
    warp = M.astype(np.float32).copy()
    # ECC(template=dst, input=src) 는 src(W·x) ≈ dst(x) 인 W = M⁻¹ 을 찾는다
    inv = cv2.invertAffineTransform(warp)
    try:
        _, inv = cv2.findTransformECC(dstf, srcf, inv, cv2.MOTION_AFFINE,
                                      (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), None, 5)
        refined = cv2.invertAffineTransform(inv)
        r_iou = iou(cv2.warpAffine(src, refined, (w, h), flags=cv2.INTER_NEAREST), dst)
        if r_iou >= coarse_iou:
            M, final_iou = refined, r_iou
        else:
            final_iou = coarse_iou
    except cv2.error:
        final_iou = coarse_iou
    return M, {'coarse_iou': round(float(coarse_iou), 4), 'iou': round(float(final_iou), 4), 'angle': ang}
