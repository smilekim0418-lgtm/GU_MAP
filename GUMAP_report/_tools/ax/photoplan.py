# -*- coding: utf-8 -*-
"""12~13주차 — 피난안내도 사진 → 평면도 전처리.

  rectify(img)   도면 판(연한 바탕의 큰 사각형)을 찾아 투영 보정해 정면 평면도로 편다
  ink(plan)      검은·회색 선만 남긴다 (빨간 피난동선·초록 비상구·아이콘 제거)
  building(ink)  외벽으로 닫힌 건물 영역
"""
import cv2
import numpy as np


def order_quad(pts):
    pts = np.array(pts, np.float32).reshape(4, 2)
    s = pts.sum(1)
    d = np.diff(pts, axis=1).ravel()
    return np.array([pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]], np.float32)


def find_panel(img):
    """피난안내도의 오른쪽 도면 판: 채도 낮고 밝은 가장 큰 사각 영역."""
    h, w = img.shape[:2]
    scale = 1200 / max(h, w)
    small = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    light = ((hsv[..., 1] < 70) & (hsv[..., 2] > 150)).astype(np.uint8) * 255
    # 도면 선·글자가 판을 쪼개지 않게 크게 닫는다
    light = cv2.morphologyEx(light, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(light, 8)
    best, best_area = None, 0
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if area > best_area and bw > small.shape[1] * 0.3:
            best, best_area = i, area
    comp = (lab == best).astype(np.uint8) * 255
    cnts, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cnt = max(cnts, key=cv2.contourArea)
    hull = cv2.convexHull(cnt)
    quad = None
    for eps in np.linspace(0.01, 0.08, 15):
        approx = cv2.approxPolyDP(hull, eps * cv2.arcLength(hull, True), True)
        if len(approx) == 4:
            quad = approx
            break
    if quad is None:
        rect = cv2.minAreaRect(cnt)
        quad = cv2.boxPoints(rect)
    return order_quad(np.array(quad, np.float32).reshape(-1, 2) / scale)


def rectify(img, out_long=2400):
    q = find_panel(img)
    wt = np.linalg.norm(q[1] - q[0])
    wb = np.linalg.norm(q[2] - q[3])
    hl = np.linalg.norm(q[3] - q[0])
    hr = np.linalg.norm(q[2] - q[1])
    W, H = (wt + wb) / 2, (hl + hr) / 2
    s = out_long / max(W, H)
    W, H = int(W * s), int(H * s)
    M = cv2.getPerspectiveTransform(q, np.array([[0, 0], [W, 0], [W, H], [0, H]], np.float32))
    return cv2.warpPerspective(img, M, (W, H), flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255)), q


def ink(plan):
    """평면도의 검은·회색 선. 색이 있는 표식(빨강·초록·파랑·주황)은 뺀다."""
    hsv = cv2.cvtColor(plan, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(plan, cv2.COLOR_BGR2GRAY)
    bg = cv2.medianBlur(gray, 51)                    # 조명 얼룩 보정
    norm = cv2.divide(gray, bg, scale=255)
    dark = norm < 150
    unsat = hsv[..., 1] < 90
    return ((dark & unsat).astype(np.uint8)) * 255


def building(inkmask, close=15):
    """외벽으로 둘러싸인 영역. 테두리에서 채우기로 바깥을 구한 뒤 뒤집는다."""
    closed = cv2.morphologyEx(inkmask, cv2.MORPH_CLOSE, np.ones((close, close), np.uint8))
    closed = cv2.dilate(closed, np.ones((5, 5), np.uint8))
    h, w = closed.shape
    flood = closed.copy()
    mask = np.zeros((h + 2, w + 2), np.uint8)
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if flood[seed[1], seed[0]] == 0:
            cv2.floodFill(flood, mask, seed, 128)
    inside = (flood != 128).astype(np.uint8) * 255
    n, lab, stats, _ = cv2.connectedComponentsWithStats(inside, 8)
    keep = np.zeros_like(inside)
    total = h * w
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] > total * 0.01:
            keep[lab == i] = 255
    return keep
