# -*- coding: utf-8 -*-
"""방 폴리곤 안에서 글자 줄(텍스트 라인) 후보를 찾는다.

도면 글자는 벽·문 선과 섞여 있으므로
  1) 폴리곤을 조금 안쪽으로 줄인 마스크 안만 보고
  2) 이진화한 뒤 긴 직선(가구·문짝 선)을 형태소 열림으로 걷어내고
  3) 글자 크기의 연결요소만 남겨
  4) 같은 줄에 있고 가까운 것끼리 묶는다.
결과는 (x, y, w, h) 상자 목록이다. 인식은 crnn 모듈이 한다.
"""
import cv2
import numpy as np

MIN_H, MAX_H = 9, 70          # 400dpi 도면의 글자 높이 범위(px)
PAD = 5


def polygon_mask(shape, rings, erode=6):
    mask = np.zeros(shape[:2], np.uint8)
    if rings and isinstance(rings[0][0], (list, tuple)):
        cv2.fillPoly(mask, [np.array(rings[0], np.int32)], 255)
        for hole in rings[1:]:
            cv2.fillPoly(mask, [np.array(hole, np.int32)], 0)
    else:
        cv2.fillPoly(mask, [np.array(rings, np.int32)], 255)
    if erode:
        mask = cv2.erode(mask, np.ones((erode * 2 + 1, erode * 2 + 1), np.uint8))
    return mask


def ink(gray):
    """글자로 볼 만한 어두운 픽셀. 5층처럼 회색으로 스캔된 도면도 잡히게 문턱을 높게 둔다."""
    local = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 31, 12)
    dark = (gray < 205).astype(np.uint8) * 255
    return cv2.bitwise_and(local, dark)


def remove_lines(binary, length=41):
    h = cv2.morphologyEx(binary, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (length, 1)))
    v = cv2.morphologyEx(binary, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, length)))
    return cv2.subtract(binary, cv2.bitwise_or(h, v))


def components(binary):
    n, lab, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    boxes = []
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        if h < MIN_H * 0.45 or h > MAX_H or w > MAX_H * 1.6 or a < 12:
            continue
        boxes.append([int(x), int(y), int(w), int(h)])
    return boxes


def group_lines(boxes):
    """세로로 겹치고 가로 간격이 좁은 연결요소를 한 줄로 묶는다."""
    boxes = sorted(boxes, key=lambda b: b[0])
    lines = []
    for b in boxes:
        x, y, w, h = b
        cy = y + h / 2
        placed = False
        for ln in lines:
            lx, ly, lw, lh = ln['box']
            ref_h = max(ln['hmax'], 1)
            overlap = min(y + h, ly + lh) - max(y, ly)
            gap = x - (lx + lw)
            if overlap > 0.45 * min(h, lh) and gap < 0.9 * ref_h and abs(cy - (ly + lh / 2)) < 0.45 * ref_h:
                nx, ny = min(lx, x), min(ly, y)
                ln['box'] = [nx, ny, max(lx + lw, x + w) - nx, max(ly + lh, y + h) - ny]
                ln['hmax'] = max(ln['hmax'], h)
                ln['n'] += 1
                placed = True
                break
        if not placed:
            lines.append({'box': [x, y, w, h], 'hmax': h, 'n': 1})
    out = []
    for ln in lines:
        x, y, w, h = ln['box']
        if h < MIN_H or h > MAX_H:
            continue
        if w < h * 0.9 and ln['n'] < 2:   # 외톨이 기호(점·원)는 버린다
            continue
        out.append((x, y, w, h))
    return out


def proposals(gray, rings, erode=6):
    """폴리곤 안 글자 줄 상자들 (이미지 전체 좌표)."""
    mask = polygon_mask(gray.shape, rings, erode)
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return []
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    sub = gray[y0:y1, x0:x1]
    b = ink(sub)
    b[mask[y0:y1, x0:x1] == 0] = 0
    b = remove_lines(b)
    boxes = components(b)
    return [(x + x0, y + y0, w, h) for x, y, w, h in group_lines(boxes)]


def crop(gray, box, pad=PAD):
    x, y, w, h = box
    H, W = gray.shape[:2]
    return gray[max(0, y - pad):min(H, y + h + pad), max(0, x - pad):min(W, x + w + pad)]
