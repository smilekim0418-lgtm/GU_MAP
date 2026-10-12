# -*- coding: utf-8 -*-
"""12~13주차 — 신규 건물 자동 파이프라인 (피난안내도 사진 → 실내지도 초안).

건물 설정(buildings/<id>.json)과 사진만으로 동작한다. 테크노관 전용 값은 없다.
  1) 투영 보정·잉크 추출·건물 윤곽        photoplan
  2) 공간 분할(방·복도)                  segment
  3) 계단(빽빽한 평행선 덩어리)·비상구(초록 표지) 검출
  4) 방 번호: Windows OCR + CRNN 모델 → 신뢰도 → 자동/검수 분기   decide
  5) 출입문: 벽 틈 검출(doors) → 없으면 복도와 맞닿은 벽에 '추정 문'
  6) 좌표 정합: OSM 건물 외곽선과 모양 맞춤(georef_auto) — IoU 가 낮으면 검수로
  7) 결과: 층별 공간(위경도), 경로망 입력, 검수 목록, 처리 시간

실행: python GUMAP_report/_tools/ax/newbuilding.py digital [global ...]
"""
import json
import math
import re
import sys
import time
from pathlib import Path

import cv2
import numpy as np

import decide
import doors
import georef_auto as ga
import photoplan
import segment
import textprop
from common import ROOT, WORK, read_image, save_json, write_image
import winocr
from fp import labels as fplabels

GEOREF_MIN_IOU = 0.75
OUT_LONG = 3000
EMBED_RE = re.compile(r'(?<![\d,])(B?\d{3}(?:-\d{1,2})?)(?![\d,])')

_model = None


def model():
    global _model
    if _model is None:
        import crnn
        for name in ('crnn_final.pt', 'crnn_r1.pt', 'crnn_r0.pt'):
            p = WORK / 'models' / name
            if p.exists():
                _model = (crnn.load(p), name)
                break
    return _model


def largest_building(bmask):
    n, lab, st, _ = cv2.connectedComponentsWithStats(bmask, 8)
    i = 1 + int(np.argmax(st[1:, 4]))
    return (lab == i).astype(np.uint8) * 255, st[i]


def detect_stairs(ink, building, min_frac=0.0012, max_frac=0.01):
    dens = cv2.blur((ink > 0).astype(np.float32), (17, 17))
    m = ((dens > 0.34) & (building > 0)).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    total = int((building > 0).sum())
    n, lab, st, cents = cv2.connectedComponentsWithStats(m, 8)
    out = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if not (total * min_frac < a < total * max_frac):
            continue
        if max(w, h) / max(min(w, h), 1) > 3.0:
            continue
        # 계단 표시는 선이 한 방향으로 반복된다: 한 축 프로파일의 자기상관 봉우리
        sub = (ink[y:y + h, x:x + w] > 0).astype(np.float32)
        per = 0.0
        for axis in (0, 1):
            prof = sub.mean(axis=axis)
            p = prof - prof.mean()
            ac = np.correlate(p, p, 'full')[len(p) - 1:]
            if len(ac) > 8 and ac[0] > 0:
                per = max(per, float((ac / ac[0])[3:16].max()))
        if per < 0.45:
            continue
        cnts, _ = cv2.findContours((lab == i).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        box = cv2.boxPoints(cv2.minAreaRect(max(cnts, key=cv2.contourArea)))
        out.append({'points': box.astype(int).tolist(), 'centroid': [float(cents[i][0]), float(cents[i][1])],
                    'area': int(a), 'periodicity': round(per, 3)})
    return out


def detect_exits(plan, building):
    """초록 비상구 표지. 건물 외곽 가까이 있는 것만 출입구 후보로 쓴다."""
    hsv = cv2.cvtColor(plan, cv2.COLOR_BGR2HSV)
    green = ((hsv[..., 0] > 45) & (hsv[..., 0] < 90) & (hsv[..., 1] > 80) & (hsv[..., 2] > 60)).astype(np.uint8) * 255
    green = cv2.morphologyEx(green, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, st, cents = cv2.connectedComponentsWithStats(green, 8)
    edge = cv2.morphologyEx(building, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8))
    dist = cv2.distanceTransform(255 - edge, cv2.DIST_L2, 3)
    out = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if a < 60 or max(w, h) > 80:
            continue
        cx, cy = cents[i]
        d = float(dist[int(cy), int(cx)])
        out.append({'centroid': [float(cx), float(cy)], 'edge_dist_px': round(d, 1)})
    return out


def read_numbers(crop, spaces, prefix, floor_tag):
    """Windows OCR(2배 확대) + CRNN 으로 방마다 번호 후보를 만든다."""
    big = cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    tmp = WORK / 'tmp' / f'{floor_tag}.png'
    write_image(tmp, big)
    t0 = time.perf_counter()
    words, angle = winocr.ocr(tmp)       # 상자는 기울기(angle)를 되돌린 원본 좌표
    ocr_s = time.perf_counter() - t0
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    m = model()
    t1 = time.perf_counter()
    for sp in spaces:
        cnt = np.array(sp['points'], np.float32)
        cands = set()
        service = None
        for w in words:
            cx, cy = w.cx / 2, w.cy / 2
            if cv2.pointPolygonTest(cnt, (cx, cy), False) < 0:
                continue
            # 사진 OCR 은 하이픈을 '•'·'·'·'—' 로 읽곤 한다
            t = re.sub(r'[•·—–_~]', '-', w.text.strip())
            if decide.ROOM_RE.match(t):
                cands.add(t)
            else:
                cands.update(EMBED_RE.findall(t))
                service = service or fplabels.match_service_name(t)
        sp['ocr'] = sorted(cands)[0] if len(cands) == 1 else None
        sp['ocr_all'] = sorted(cands)
        sp['service'] = service
        sp['model'], sp['model_conf'] = None, 0.0
        if m and sp['kind'] == 'room':
            import crnn
            boxes = textprop.proposals(gray, sp['points'], erode=3)
            if boxes:
                preds = crnn.predict(m[0], [textprop.crop(gray, b, pad=3) for b in boxes])
                valid = [(t, c) for t, c in preds if decide.ROOM_RE.match(t)]
                if valid:
                    sp['model'], sp['model_conf'] = max(valid, key=lambda v: v[1])
                    sp['model_conf'] = round(float(sp['model_conf']), 4)
    model_s = time.perf_counter() - t1
    return words, ocr_s, model_s


def estimate_door(sp, corridor_dist):
    """복도와 맞닿은 벽 구간의 가운데를 추정 문으로 잡는다.

    방 외곽선을 따라 걸으며 복도까지 거리(거리변환)가 가까운 점들을 모으고,
    가장 긴 연속 구간의 가운데를 고른다. 복도와 안 닿는 방은 None.
    """
    ring = np.array(sp['points'], np.float32)
    H, W = corridor_dist.shape
    pts, near = [], []
    for a, b in zip(ring, np.roll(ring, -1, axis=0)):
        L = float(np.hypot(*(b - a)))
        for s in np.linspace(0, 1, max(2, int(L / 3)), endpoint=False):
            p = a + (b - a) * s
            x, y = int(min(max(p[0], 0), W - 1)), int(min(max(p[1], 0), H - 1))
            pts.append(p)
            near.append(corridor_dist[y, x] <= 14)
    if not any(near):
        return None
    # 가장 긴 연속 True 구간 (고리이므로 두 바퀴 돌려 찾는다)
    n = len(near)
    best_len, best_mid, run = 0, None, 0
    for k in range(2 * n):
        if near[k % n]:
            run += 1
            if run > best_len and run <= n:
                best_len, best_mid = run, (k - run // 2) % n
        else:
            run = 0
    p = pts[best_mid]
    return [float(p[0]), float(p[1])]


def to_lonlat_fn(M_small_to_canvas, meta, scale_small, x0, y0):
    A = np.vstack([M_small_to_canvas, [0, 0, 1]])

    def f(px, py):
        sx, sy = (px + x0) * scale_small, (py + y0) * scale_small
        cx, cy, _ = A @ np.array([sx, sy, 1.0])
        return ga.canvas_to_lonlat(meta, cx, cy)
    # 평면 1px 당 미터
    s_M = math.sqrt(abs(np.linalg.det(M_small_to_canvas[:, :2])))
    m_per_px = scale_small * s_M / ga.PX_PER_M
    return f, m_per_px


def manual_to_lonlat_fn(manual, M_f, x0, y0, scale_small=0.25):
    """검수자 기준점 모드: 이 층 → (마스크 정렬 M_f) → 기준층 도면 → (수동 아핀) → 위경도."""
    Xm = np.array(manual['Xm'])
    A = np.vstack([np.array(M_f, np.float64), [0, 0, 1]])
    rx0, ry0 = manual['ref_offset']
    lon0, lat0 = manual['origin']
    mlon = ga.m_lon(lat0)

    def f(px, py):
        sx, sy = (px + x0) * scale_small, (py + y0) * scale_small
        rx, ry, _ = A @ np.array([sx, sy, 1.0])
        cx, cy = rx / scale_small - rx0, ry / scale_small - ry0
        e, n = np.array([cx, cy, 1.0]) @ Xm
        return lon0 + e / mlon, lat0 + n / ga.M_LAT
    s_f = math.sqrt(abs(np.linalg.det(np.array(M_f)[:, :2])))
    s_m = math.sqrt(abs(np.linalg.det(Xm[:2, :])))
    return f, s_f * s_m


def prepare_floor_mask(cfg, fname):
    img = read_image(ROOT / cfg['source_dir'] / fname)
    plan, _ = photoplan.rectify(img, out_long=OUT_LONG)
    bmask, st = largest_building(photoplan.building(photoplan.ink(plan)))
    x, y, w, h, _ = st
    return bmask, (max(0, x - 30), max(0, y - 30))


def load_manual(cfg):
    """buildings/<id>_manual_georef.json 이 있으면 기준층 수동 아핀을 준비한다."""
    path = Path(__file__).with_name('buildings') / f"{cfg['id']}_manual_georef.json"
    if not path.exists():
        return None
    g = json.load(open(path, encoding='utf-8'))
    ref = g['reference_floor']
    bmask, off = prepare_floor_mask(cfg, cfg['floors'][ref])
    lon0, lat0 = 128.392, 36.1468
    mlon = ga.m_lon(lat0)
    src = np.array([p['plan_px'] for p in g['pairs']], np.float64)
    dst = np.array([((p['lonlat'][0] - lon0) * mlon, (p['lonlat'][1] - lat0) * ga.M_LAT) for p in g['pairs']])
    Xm, *_ = np.linalg.lstsq(np.hstack([src, np.ones((len(src), 1))]), dst, rcond=None)
    small = cv2.resize(bmask, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_NEAREST)
    return {'ref_floor': ref, 'Xm': Xm.tolist(), 'ref_offset': off, 'origin': [lon0, lat0],
            'ref_small': small, 'rmse_m': g['rmse_m'], 'method': g['method'], 'n_points': len(g['pairs'])}


def process_floor(cfg, floor, fname, canvas, meta, manual_ref=None):
    tag = f"{cfg['id']}_{floor}"
    timings = {}
    t = time.perf_counter()
    img = read_image(ROOT / cfg['source_dir'] / fname)
    plan, quad = photoplan.rectify(img, out_long=OUT_LONG)
    ink = photoplan.ink(plan)
    bmask, st = largest_building(photoplan.building(ink))
    x, y, w, h, _ = st
    mg = 30
    x0, y0 = max(0, x - mg), max(0, y - mg)
    crop, ink_c, b_c = plan[y0:y + h + mg, x0:x + w + mg], ink[y0:y + h + mg, x0:x + w + mg], bmask[y0:y + h + mg, x0:x + w + mg]
    timings['rectify_s'] = time.perf_counter() - t

    t = time.perf_counter()
    spaces, lab = segment.spaces(b_c, ink_c)
    stairs = detect_stairs(ink_c, b_c)
    exits = detect_exits(crop, b_c)
    timings['segment_s'] = time.perf_counter() - t

    words, ocr_s, model_s = read_numbers(crop, spaces, cfg['floor_prefix'].get(floor), tag)
    timings['ocr_s'], timings['model_s'] = ocr_s, model_s

    # 좌표 정합
    t = time.perf_counter()
    scale_small = 0.25
    small = cv2.resize(bmask, None, fx=scale_small, fy=scale_small, interpolation=cv2.INTER_NEAREST)
    M, ginfo = ga.match_mask(small, canvas)
    georef_route = 'auto' if ginfo['iou'] >= GEOREF_MIN_IOU else 'review'
    if manual_ref is not None:
        # 자동 정합 IoU 가 기준 미달 → 검수자가 기준층에 찍은 기준점으로 대체
        if floor == manual_ref['ref_floor']:
            M_f, align = np.array([[1, 0, 0], [0, 1, 0]], np.float64), {'iou': 1.0}
        else:
            M_f, align = ga.match_mask(small, manual_ref['ref_small'], angles=range(-10, 11, 1),
                                       scale_hint=1.0)
        to_ll, m_per_px = manual_to_lonlat_fn(manual_ref, M_f, x0, y0, scale_small)
        ginfo = {'osm_iou': ginfo['iou'], 'route': 'manual', 'method': manual_ref['method'],
                 'control_points': manual_ref['n_points'], 'rmse_m': manual_ref['rmse_m'],
                 'floor_align_iou': align['iou'], 'reference_floor': manual_ref['ref_floor']}
        georef_route = 'manual' if align['iou'] >= 0.6 else 'review'   # 층 정렬 실패는 검수
    else:
        to_ll, m_per_px = to_lonlat_fn(M, meta, scale_small, x0, y0)
    timings['georef_s'] = time.perf_counter() - t

    # 번호 결정
    prefix = cfg['floor_prefix'].get(floor)
    rooms = [s for s in spaces if s['kind'] == 'room']
    for s in rooms:
        label, conf, route, reasons = decide.decide(s['ocr'], s['model'], s['model_conf'], prefix)
        if label is None and s.get('service'):
            # 번호 없이 이름만 적힌 공용 공간(화장실·계단실 등)은 이름으로 자동 확정
            label, conf, route, reasons = s['service'], 0.9, 'auto', ['공용 공간 이름 판독']
            s['kind'] = 'service'
        s.update({'label': label, 'conf': conf, 'route': route, 'reasons': reasons})
    decide.flag_duplicates(rooms)

    # 출입문
    t = time.perf_counter()
    px_per_mm = 1.0 / (m_per_px * 1000)
    as_spaces = [{'points': s['points'],
                  'room_id': '복도' if s['kind'] == 'corridor' else (s.get('label') or f'#{i}'),
                  'type': 'corridor' if s['kind'] == 'corridor' else None, 'area_px': s['area']}
                 for i, s in enumerate(spaces)]
    found = doors.detect(crop, as_spaces, px_per_mm, walls=ink_c, band=4)
    corridors = [s for s in spaces if s['kind'] == 'corridor']
    cor_mask = np.isin(lab, [c['cc'] for c in corridors]).astype(np.uint8) if corridors         else np.zeros(lab.shape, np.uint8)
    cor_dist = cv2.distanceTransform((1 - cor_mask).astype(np.uint8), cv2.DIST_L2, 3)
    door_list = []
    for i, s in enumerate(spaces):
        if s['kind'] not in ('room', 'service'):
            continue
        sid = as_spaces[i]['room_id']
        hit = [d for d in found if sid in d['connects'] and '복도' in d['connects']]
        if hit:
            door_list.append({'space': i, 'at': hit[0]['centre'], 'estimated': False})
        else:
            est = estimate_door(s, cor_dist)
            if est:
                door_list.append({'space': i, 'at': est, 'estimated': True})
    timings['doors_s'] = time.perf_counter() - t

    # 위경도로
    def ring_ll(points):
        return [list(to_ll(px, py)) for px, py in points]
    units = []
    for i, s in enumerate(spaces):
        units.append({'i': i, 'kind': s['kind'], 'label': s.get('label'), 'conf': s.get('conf'),
                      'route': s.get('route'), 'reasons': s.get('reasons', []),
                      'ocr': s.get('ocr'), 'model': s.get('model'), 'model_conf': s.get('model_conf'),
                      'ring': ring_ll(s['points']), 'px': s['points'], 'centroid': list(to_ll(*s['centroid']))})
    stairs_out = [{'ring': ring_ll(sx['points']), 'centroid': list(to_ll(*sx['centroid'])),
                   'px': sx['centroid']} for sx in stairs]
    exits_out = [{'at': list(to_ll(*e['centroid'])), 'px': e['centroid'], 'edge_dist_px': e['edge_dist_px']}
                 for e in exits if e['edge_dist_px'] < 45]
    doors_out = [{'space': d['space'], 'at': list(to_ll(*d['at'])), 'px': d['at'], 'estimated': d['estimated']}
                 for d in door_list]
    nav = build_nav(cor_mask, [(units[d['space']]['label'] or f"#{d['space']}", d['px']) for d in doors_out],
                    [sx['px'] for sx in stairs_out], [e['px'] for e in exits_out], to_ll, m_per_px)
    outline = cv2.findContours(b_c, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]
    outline = cv2.approxPolyDP(max(outline, key=cv2.contourArea), 3, True).reshape(-1, 2)

    # 화면용 이미지
    vis = draw_floor(crop, spaces, stairs, exits_out, doors_out)
    write_image(WORK / 'newbuilding' / f'{tag}_draft.jpg', vis, 86)
    write_image(WORK / 'newbuilding' / f'{tag}_rectified.jpg', crop, 86)
    write_image(WORK / 'newbuilding' / f'{tag}_photo.jpg', cv2.resize(img, None, fx=0.4, fy=0.4), 82)

    services = [s for s in rooms if s['kind'] == 'service']
    rooms = [s for s in rooms if s['kind'] == 'room']
    n_rooms = len(rooms)
    auto = sum(1 for s in rooms if s['route'] == 'auto')
    return {
        'floor': floor, 'source': fname, 'georef': dict(ginfo, route=georef_route, m_per_px=round(m_per_px, 4)),
        'rooms': n_rooms, 'rooms_auto': auto, 'rooms_review': n_rooms - auto,
        'unlabeled': sum(1 for s in rooms if not s.get('label')),
        'services': len(services),
        'stairs': len(stairs_out), 'exits': len(exits_out),
        'doors_detected': sum(1 for d in doors_out if not d['estimated']),
        'doors_estimated': sum(1 for d in doors_out if d['estimated']),
        'ocr_words': len(words), 'timings': {k: round(v, 2) for k, v in timings.items()},
        'units': units, 'stairs_list': stairs_out, 'exits_list': exits_out, 'doors_list': doors_out,
        'outline': ring_ll(outline.tolist()), 'crop_size': [int(crop.shape[1]), int(crop.shape[0])],
        'nav': nav,
    }


def build_nav(cor_mask, doors_px, stairs_px, exits_px, to_ll, m_per_px, spacing=16):
    """복도 격자 경로망. 복도 안 격자점을 8방향으로 잇고, 표식에 끊긴 복도 조각은
    가장 가까운 점끼리 다시 잇는다. 방(문)·계단·비상구는 가장 가까운 격자점에 붙인다."""
    inner = cv2.erode(cor_mask, np.ones((3, 3), np.uint8))
    H, W = inner.shape
    pts, index = [], {}
    for gy in range(spacing // 2, H, spacing):
        for gx in range(spacing // 2, W, spacing):
            if inner[gy, gx]:
                index[(gx, gy)] = len(pts)
                pts.append((gx, gy))
    edges = []
    for (gx, gy), i in index.items():
        for dx, dy in ((spacing, 0), (0, spacing), (spacing, spacing), (spacing, -spacing)):
            j = index.get((gx + dx, gy + dy))
            if j is None:
                continue
            mx, my = gx + dx // 2, gy + dy // 2
            if inner[my, mx]:
                edges.append([i, j, math.hypot(dx, dy)])
    # 끊긴 조각 잇기 (union-find)
    parent = list(range(len(pts)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for a, b, _ in edges:
        parent[find(a)] = find(b)
    comps = {}
    for i in range(len(pts)):
        comps.setdefault(find(i), []).append(i)
    groups = [np.array(v) for v in comps.values() if len(v) >= 3]
    P = np.array(pts, np.float64) if pts else np.zeros((0, 2))
    joined = True
    while joined and len(groups) > 1:
        joined = False
        best = None
        for gi in range(len(groups)):
            for gj in range(gi + 1, len(groups)):
                A, B = P[groups[gi]], P[groups[gj]]
                d = np.sqrt(((A[:, None, :] - B[None, :, :]) ** 2).sum(-1))
                k = np.unravel_index(np.argmin(d), d.shape)
                if best is None or d[k] < best[0]:
                    best = (d[k], gi, gj, groups[gi][k[0]], groups[gj][k[1]])
        if best and best[0] <= spacing * 4:
            edges.append([int(best[3]), int(best[4]), float(best[0])])
            groups[best[1]] = np.concatenate([groups[best[1]], groups[best[2]]])
            groups.pop(best[2])
            joined = True

    def attach(xy, limit):
        if not len(P):
            return None
        d = np.sqrt(((P - np.array(xy)) ** 2).sum(1))
        k = int(np.argmin(d))
        if d[k] > limit:
            return None
        pts.append((float(xy[0]), float(xy[1])))
        edges.append([len(pts) - 1, k, float(d[k])])
        return len(pts) - 1
    rooms = {}
    for key, xy in doors_px:
        n = attach(xy, 45)
        if n is not None:
            rooms[key] = n
    stairs = [n for n in (attach(xy, 70) for xy in stairs_px) if n is not None]
    exits = [n for n in (attach(xy, 70) for xy in exits_px) if n is not None]
    return {'nodes': [[round(v, 7) for v in to_ll(x, y)[::-1]] for x, y in pts],   # [lat, lon]
            'edges': [[int(a), int(b), round(d * m_per_px, 2)] for a, b, d in edges],
            'rooms': rooms, 'stairs': stairs, 'exits': exits,
            'components': len(groups)}


def draw_floor(crop, spaces, stairs, exits, doors_out):
    vis = crop.copy()
    over = vis.copy()
    for s in spaces:
        if s['kind'] == 'corridor':
            col = (235, 200, 150)
        elif s['kind'] in ('room', 'service'):
            col = (120, 210, 120) if s.get('route') == 'auto' else (80, 170, 250)
        else:
            col = (200, 200, 200)
        cv2.fillPoly(over, [np.array(s['points'], np.int32)], col)
    vis = cv2.addWeighted(over, 0.45, vis, 0.55, 0)
    for s in spaces:
        cv2.polylines(vis, [np.array(s['points'], np.int32)], True, (90, 90, 90), 1)
        if s['kind'] in ('room', 'service'):
            c = tuple(int(v) for v in s['centroid'])
            txt = s.get('label') or '?'
            color = (20, 110, 20) if s.get('route') == 'auto' else (0, 90, 230)
            cv2.putText(vis, txt, (c[0] - 18, c[1] + 26), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 4)
            cv2.putText(vis, txt, (c[0] - 18, c[1] + 26), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)
    for sx in stairs:
        cv2.polylines(vis, [np.array(sx['points'], np.int32)], True, (200, 60, 200), 3)
    for d in doors_out:
        c = tuple(int(v) for v in d['px'])
        cv2.circle(vis, c, 6, (0, 150, 255) if d['estimated'] else (30, 160, 30), -1)
    for e in exits:
        c = tuple(int(v) for v in e['px'])
        cv2.drawMarker(vis, c, (0, 0, 220), cv2.MARKER_STAR, 22, 3)
    return vis


def run(bid, manual=None):
    cfg = json.load(open(Path(__file__).with_name('buildings') / f'{bid}.json', encoding='utf-8'))
    canvas, meta = ga.footprint_canvas(ga.osm_outline(cfg['osm_way']))
    manual_ref = load_manual(cfg)
    t0 = time.perf_counter()
    floors = []
    for floor, fname in cfg['floors'].items():
        r = process_floor(cfg, floor, fname, canvas, meta, manual_ref)
        floors.append(r)
        print(bid, floor, {k: r[k] for k in ('rooms', 'rooms_auto', 'rooms_review', 'unlabeled', 'stairs',
                                                'exits', 'doors_detected', 'doors_estimated')}, r['georef'], flush=True)
    total_s = time.perf_counter() - t0
    m = model()
    out = {'id': cfg['id'], 'name': cfg['name'], 'osm_way': cfg['osm_way'], 'model': m[1] if m else None,
           'pipeline_seconds': round(total_s, 1), 'floors': floors,
           'osm_outline': ga.osm_outline(cfg['osm_way'])}
    save_json(WORK / 'newbuilding' / f'{bid}.json', out)
    return out


if __name__ == '__main__':
    for b in sys.argv[1:] or ['digital']:
        run(b)
