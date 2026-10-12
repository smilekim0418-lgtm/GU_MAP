# -*- coding: utf-8 -*-
"""피난안내도 평면(보정된 사진)에서 공간을 나눈다.

  - 벽 = 검은 선(ink) 을 조금 두껍게 + 문 틈 메우기
  - 공간 = 건물 안에서 벽이 아닌 연결요소
  - 복도 = 가장 큰 공간 + 길고 좁은 공간(표식에 끊긴 날개 복도 조각)
  - 계단 = 안에 짧은 평행선(단)이 빽빽한 공간
"""
import cv2
import numpy as np


def walls_from_ink(ink, gap=4):
    barrier = cv2.dilate(ink, np.ones((3, 3), np.uint8))
    if gap:
        barrier = cv2.dilate(barrier, np.ones((gap * 2 + 1, gap * 2 + 1), np.uint8))
    return barrier


def spaces(building, ink, gap=4, min_frac=0.0012, max_frac=0.2, corridor_elong=8.0, corridor_width_px=95):
    barrier = walls_from_ink(ink, gap)
    free = cv2.bitwise_and(building, cv2.bitwise_not(barrier))
    n, lab, stats, cents = cv2.connectedComponentsWithStats(free, 4)
    total = int((building > 0).sum())
    out = []
    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < total * min_frac:
            continue
        comp = (lab == i).astype(np.uint8)
        # 벽 두께만큼 되돌려 경계를 벽 중심선 쪽으로 편다
        grown = cv2.dilate(comp, np.ones((gap * 2 + 3, gap * 2 + 3), np.uint8)) & (building > 0)
        cnts, _ = cv2.findContours(grown.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cnt = max(cnts, key=cv2.contourArea)
        approx = cv2.approxPolyDP(cnt, 2.0, True).reshape(-1, 2)
        if len(approx) < 3:
            continue
        x, y, w, h = cv2.boundingRect(cnt)
        out.append({'cc': i, 'area': area, 'bbox': [int(x), int(y), int(w), int(h)],
                    'points': approx.tolist(), 'centroid': [float(cents[i][0]), float(cents[i][1])],
                    'ink_density': float((ink[y:y + h, x:x + w][comp[y:y + h, x:x + w] > 0] > 0).mean())
                    if area else 0.0})
    if not out:
        return out, lab
    big = max(out, key=lambda s: s['area'])
    for s in out:
        s['kind'] = 'room'
        (_, _), (rw, rh), _ = cv2.minAreaRect(np.array(s['points'], np.float32))
        short, long_ = min(rw, rh), max(rw, rh)
        s['elongation'] = round(long_ / max(short, 1), 2)
        s['width_px'] = round(short, 1)
        if s['area'] > total * 0.08 and s['elongation'] < 2.5:
            # 크고 뭉툭한 빈 공간 = 중정(안뜰)이거나, 반사광에 벽선이 지워져 여러 방이 합쳐진 곳
            s['kind'] = 'void'
        elif s is big:
            s['kind'] = 'corridor'
        elif s['area'] > total * max_frac:
            s['kind'] = 'void'
        elif s['elongation'] >= corridor_elong and short <= corridor_width_px:
            # 비상구 표시·방화문 기호에 끊긴 날개 복도 조각
            s['kind'] = 'corridor'
    return out, lab


def stairs_score(gray, sp, ink):
    """공간 안 짧은 평행선의 밀도. 계단 표시는 같은 간격의 선이 빽빽하다."""
    x, y, w, h = sp['bbox']
    sub = ink[y:y + h, x:x + w]
    if sub.size == 0 or min(w, h) < 12:
        return 0.0
    # 수평·수직 방향 프로파일의 주기성
    best = 0.0
    for axis in (0, 1):
        prof = (sub > 0).mean(axis=axis)
        if len(prof) < 16:
            continue
        p = prof - prof.mean()
        ac = np.correlate(p, p, 'full')[len(p) - 1:]
        if ac[0] <= 0:
            continue
        ac = ac / ac[0]
        peak = ac[3:min(len(ac), 20)].max() if len(ac) > 5 else 0
        best = max(best, float(peak) * float(prof.mean() * 4))
    return best
