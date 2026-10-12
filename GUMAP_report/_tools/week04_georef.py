# -*- coding: utf-8 -*-
"""4주차 산출물 — 층별 도면 좌표 정합(축척·기준점·회전) 검증 데이터.

GUMAP-개발/floorplan/techno_georef.json 의 대응점(도면 픽셀 ↔ 정사영상 위경도)을
실제 변환식(fp.georef)으로 다시 투영해 대응점마다 잔차(m)를 구하고,
IMDF 번들에서 층별 외곽선과 엘리베이터 샤프트 위치를 뽑아 층간 정렬을 검증한다.

실행: python GUMAP_report/_tools/week04_georef.py
"""
import io
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

from shapely.geometry import Polygon, mapping
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
FLOORPLAN = ROOT / 'GUMAP-개발' / 'floorplan'
OUT = ROOT / 'GUMAP_report' / '04주차_좌표정합' / 'georef.json'
sys.path.insert(0, str(FLOORPLAN))
sys.stdout.reconfigure(encoding='utf-8')

from fp import config, georef  # noqa: E402

M_LAT = config.METERS_PER_DEG_LAT
M_LON = config.METERS_PER_DEG_LON_AT_EQUATOR * math.cos(math.radians(config.REFERENCE_LATITUDE))


def load_imdf():
    s = io.open(ROOT / 'GUMAP-프론트' / 'js' / 'map' / 'map-techno-imdf-data.js', encoding='utf-8').read()
    return json.loads(s[s.index('{'):s.rindex('}') + 1])


def main():
    data = georef.load()
    tf = georef.transform_from(data)
    origins = data['floor_origin_px']
    scales = data['floor_px_per_mm']

    points = []
    per_floor = defaultdict(list)
    for cp in data['control_points']:
        floor = cp['floor']
        (xm, ym), = georef.pixels_to_meters([tuple(cp['px'])], tuple(origins[floor]), scales[floor])
        lon, lat = georef.apply(tf, xm, ym)
        de = (lon - cp['lon']) * M_LON
        dn = (lat - cp['lat']) * M_LAT
        r = math.hypot(de, dn)
        per_floor[floor].append(r)
        points.append({'floor': floor, 'px': cp['px'], 'lon': cp['lon'], 'lat': cp['lat'],
                       'pred_lon': lon, 'pred_lat': lat, 'de': round(de, 3), 'dn': round(dn, 3),
                       'residual_m': round(r, 3)})

    def rmse(values):
        return math.sqrt(sum(v * v for v in values) / len(values)) if values else None

    floors = []
    for floor in config.FLOORS:
        rs = per_floor.get(floor, [])
        floors.append({'floor': floor, 'px_per_mm': scales[floor], 'origin_px': origins[floor],
                       'n': len(rs), 'rmse_m': round(rmse(rs), 3) if rs else None,
                       'max_m': round(max(rs), 3) if rs else None})
    all_r = [p['residual_m'] for p in points]

    # IMDF: 층별 외곽선 · 엘리베이터 샤프트
    imdf = load_imdf()
    level_name = {l['id']: l['properties']['short_name']['ko-KR'] for l in imdf['levels']['features']}
    polys = defaultdict(list)
    shafts = defaultdict(dict)
    for u in imdf['units']['features']:
        p = u['properties']
        floor = level_name[p['level_id']]
        ring = u['geometry']['coordinates'][0]
        local = [((x - tf.t_lon) * M_LON, (y - tf.t_lat) * M_LAT) for x, y in ring]
        poly = Polygon(local)
        if poly.is_valid and poly.area > 0:
            polys[floor].append(poly)
        if p['category'] == 'elevator':
            c = poly.centroid
            shafts[(p.get('label') or {}).get('ko-KR', '?')][floor] = (c.x, c.y)

    outlines = {}
    for floor, ps in polys.items():
        merged = unary_union([q.buffer(0.6) for q in ps]).buffer(-0.6)
        geoms = getattr(merged, 'geoms', [merged])
        rings = []
        for g in geoms:
            if g.area < 20:
                continue
            ext = g.exterior.simplify(0.15)
            rings.append([[round(tf.t_lon + x / M_LON, 8), round(tf.t_lat + y / M_LAT, 8)] for x, y in ext.coords])
        outlines[floor] = rings

    alignment = []
    for name in sorted(shafts):
        spots = shafts[name]
        mx = sum(v[0] for v in spots.values()) / len(spots)
        my = sum(v[1] for v in spots.values()) / len(spots)
        devs = {f: round(math.hypot(v[0] - mx, v[1] - my), 3) for f, v in spots.items()}
        alignment.append({'shaft': name, 'floors': len(spots), 'deviation_m': devs,
                          'max_m': max(devs.values()),
                          'center': [round(tf.t_lon + mx / M_LON, 8), round(tf.t_lat + my / M_LAT, 8)]})

    out = {
        'transform': {'theta_deg': tf.theta_deg, 'scale': tf.scale, 't_lon': tf.t_lon, 't_lat': tf.t_lat},
        'drawing_extent_mm': data['drawing_extent_mm'],
        'control_points': points,
        'floors': floors,
        'overall': {'n': len(all_r), 'rmse_m': round(rmse(all_r), 3), 'max_m': round(max(all_r), 3)},
        'outlines': outlines,
        'elevator_alignment': alignment,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
    print('control points', len(points), 'RMSE', out['overall'])
    for f in floors:
        print(f)
    for a in alignment:
        print(a['shaft'], a['max_m'], a['deviation_m'])


if __name__ == '__main__':
    main()
