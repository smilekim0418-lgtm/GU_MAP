# -*- coding: utf-8 -*-
"""10주차 — 출입문 자동 검출 (벽선 틈 분석).

도면에서 문은 "벽선이 끊긴 자리"다. 문짝 호(弧)와 짧은 선은 벽선 마스크
(fp.rooms.extract_wall_mask: 긴 수평·수직선만 남김)에서 이미 빠져 있다.
  1) 공간(방·계단·EV) 폴리곤의 변을 따라 2px 간격으로 걸으며
     변 양쪽 ±BAND px 띠 안에 벽선이 있는지 본다.
  2) 벽선이 없는 구간의 길이가 문 폭(0.35~2.4 m)이면 문 후보다.
  3) 그 자리에서 바깥쪽으로 조금 나가 어느 공간(복도·옆방)에 닿는지 보고
     connects = [이 방, 저 공간] 을 채운다. 어디에도 닿지 않으면 버린다.
사람이 편집기로 그린 문(460개)과 위치(≤ 1 m)·연결이 모두 맞으면 정답으로 센다.

실행: python GUMAP_report/_tools/ax/doors.py
"""
import math
import time

import cv2
import numpy as np

from common import FLOORS, WEEK_DIR, is_room, labeled, raster, save_json, write_image
from fp import config, rooms as fprooms

BAND = 7              # 변에서 벽선을 찾는 띠 반폭(px)
PROBE = 22            # 문 중심에서 바깥으로 나가 보는 거리(px)
MATCH_PX = 25         # 정답 문과 같은 문으로 볼 거리(≈1 m)


def rings_of(points):
    return points if points and isinstance(points[0][0], (list, tuple)) else [points]


def space_id(p):
    return p['room_id'] if p.get('room_id') else None


def build_index(polys, shape):
    """픽셀 → 공간 번호 지도. 작은 공간이 큰 공간(복도)을 덮도록 큰 것부터 칠한다."""
    idx = np.full(shape[:2], -1, np.int32)
    order = sorted(range(len(polys)), key=lambda i: -polys[i]['area_px'])
    for i in order:
        rs = rings_of(polys[i]['points'])
        m = np.zeros(shape[:2], np.uint8)
        cv2.fillPoly(m, [np.array(rs[0], np.int32)], 1)
        for hole in rs[1:]:
            cv2.fillPoly(m, [np.array(hole, np.int32)], 0)
        idx[m > 0] = i
    return idx


def detect(image, spaces, px_per_mm, walls=None, band=None):
    global BAND
    if band:
        BAND = band
    if walls is None:
        walls = fprooms.extract_wall_mask(image)
    walls = cv2.dilate(walls, np.ones((3, 3), np.uint8))
    H, W = walls.shape
    index = build_index(spaces, image.shape)
    min_len = 350 * px_per_mm          # 0.35 m — 문짝 경첩·호가 띠 안에 들어와 틈이 실제 폭보다 좁게 잡힌다
    max_len = 2400 * px_per_mm         # 2.4 m
    found = []
    for si, sp in enumerate(spaces):
        if sp.get('type') == 'corridor':
            continue                   # 방 쪽에서 보면 복도 문은 다 나온다
        ring = np.array(rings_of(sp['points'])[0], np.float64)
        cx, cy = ring[:, 0].mean(), ring[:, 1].mean()
        for a, b in zip(ring, np.roll(ring, -1, axis=0)):
            seg = b - a
            L = float(np.hypot(*seg))
            if L < min_len:
                continue
            t = seg / L
            n = np.array([-t[1], t[0]])
            mid = (a + b) / 2
            if np.dot(mid - [cx, cy], n) < 0:
                n = -n                 # 바깥쪽 법선
            steps = np.arange(0, L, 2.0)
            clear = []
            for s in steps:
                p = a + t * s
                hit = False
                for o in range(-BAND, BAND + 1, 2):
                    q = p + n * o
                    x, y = int(round(q[0])), int(round(q[1]))
                    if 0 <= x < W and 0 <= y < H and walls[y, x]:
                        hit = True
                        break
                clear.append(not hit)
            # 벽이 없는 연속 구간
            run_start = None
            for k, c in enumerate(clear + [False]):
                if c and run_start is None:
                    run_start = k
                elif not c and run_start is not None:
                    length = (k - run_start) * 2.0
                    # 모서리에 붙은 문도 있으니 변 끝에 닿은 틈도 받는다
                    if min_len <= length <= max_len:
                        centre = a + t * ((run_start + k - 1) * 1.0)
                        probe = centre + n * PROBE
                        px, py = int(round(probe[0])), int(round(probe[1]))
                        other = index[py, px] if (0 <= px < W and 0 <= py < H) else -1
                        if other >= 0 and other != si:
                            found.append({'centre': centre.tolist(), 'length_px': length,
                                          'axis': 'h' if abs(t[0]) > abs(t[1]) else 'v',
                                          'connects': sorted([space_id(sp), space_id(spaces[other])])})
                    run_start = None
    # 방-방 문은 양쪽에서 두 번 잡히므로 합친다
    merged = []
    for d in found:
        dup = next((m for m in merged if m['connects'] == d['connects'] and
                    math.dist(m['centre'], d['centre']) < 20), None)
        if dup is None:
            merged.append(d)
    return merged


def evaluate(floor):
    data = labeled(floor)['polygons']
    spaces = [p for p in data if p.get('type') != 'door' and space_id(p)]
    human = [p for p in data if p.get('type') == 'door' and p.get('connects')]
    image = raster(floor)
    t0 = time.perf_counter()
    auto = detect(image, spaces, config_px_per_mm(floor))
    dt = time.perf_counter() - t0
    used = set()
    tp = 0
    pos_only = 0
    for d in auto:
        best, bd = None, 1e9
        for i, h in enumerate(human):
            if i in used:
                continue
            dist = math.dist(d['centre'], h['centroid'])
            if dist < bd:
                best, bd = i, dist
        if best is not None and bd <= MATCH_PX:
            if sorted(human[best]['connects']) == d['connects']:
                used.add(best)
                tp += 1
                d['status'] = 'tp'
            else:
                pos_only += 1
                d['status'] = 'wrong_link'
        else:
            d['status'] = 'fp'
    missed = [h for i, h in enumerate(human) if i not in used]
    return image, spaces, auto, human, missed, {
        'floor': floor, 'human_doors': len(human), 'detected': len(auto), 'correct': tp,
        'right_place_wrong_link': pos_only, 'false_pos': sum(1 for d in auto if d['status'] == 'fp'),
        'missed': len(missed), 'precision': round(tp / max(len(auto), 1), 4),
        'recall': round(tp / max(len(human), 1), 4), 'seconds': round(dt, 2)}


def config_px_per_mm(floor):
    import json
    return json.load(open(config.GEOREF_PATH, encoding='utf-8'))['floor_px_per_mm'][floor]


def draw(image, spaces, auto, missed, floor):
    over = image.copy()
    for p in spaces:
        rs = rings_of(p['points'])
        cv2.polylines(over, [np.array(rs[0], np.int32)], True, (200, 170, 120), 2)
    for d in auto:
        c = tuple(int(v) for v in d['centre'])
        color = {'tp': (40, 170, 40), 'fp': (0, 140, 255), 'wrong_link': (200, 60, 200)}[d['status']]
        cv2.circle(over, c, 14, color, 4)
    for h in missed:
        c = tuple(int(v) for v in h['centroid'])
        cv2.drawMarker(over, c, (30, 30, 230), cv2.MARKER_TILTED_CROSS, 26, 4)
    ys, xs = np.nonzero(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) < 200)
    return over


def main():
    rows = []
    for floor in FLOORS:
        image, spaces, auto, human, missed, row = evaluate(floor)
        rows.append(row)
        print(row, flush=True)
        if floor in ('2F', '4F', '1F'):
            over = draw(image, spaces, auto, missed, floor)
            # 건물 부분만 잘라 저장
            pts = np.concatenate([np.array(rings_of(p['points'])[0]) for p in spaces])
            x0, y0 = pts.min(axis=0) - 40
            x1, y1 = pts.max(axis=0) + 40
            crop = over[max(0, int(y0)):int(y1), max(0, int(x0)):int(x1)]
            s = 1500 / crop.shape[1]
            write_image(WEEK_DIR[10] / 'assets' / f'doors_{floor}.jpg',
                        cv2.resize(crop, (1500, int(crop.shape[0] * s)), interpolation=cv2.INTER_AREA), 84)
    tot = {k: sum(r[k] for r in rows) for k in ('human_doors', 'detected', 'correct', 'false_pos', 'missed',
                                                  'right_place_wrong_link')}
    tot['precision'] = round(tot['correct'] / tot['detected'], 4)
    tot['recall'] = round(tot['correct'] / tot['human_doors'], 4)
    save_json(WEEK_DIR[10] / 'doors.json', {'floors': rows, 'total': tot, 'match_px': MATCH_PX,
                                            'band_px': BAND})
    print(tot)


if __name__ == '__main__':
    main()
