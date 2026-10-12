# -*- coding: utf-8 -*-
"""3주차 산출물 — 도면 이미지 전처리 및 실 영역·벽선 추출 결과.

GUMAP-개발/floorplan 파이프라인(fp.raster · fp.rooms)을 층마다 다시 돌려
  원본 래스터 / 벽선 마스크 / 실 영역 폴리곤
세 장을 웹용 JPEG 으로 저장하고, 처리 시간·폴리곤 수를 stats.json 에 남긴다.

실행: python GUMAP_report/_tools/week03_extract.py
"""
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
FLOORPLAN = ROOT / 'GUMAP-개발' / 'floorplan'
OUT = ROOT / 'GUMAP_report' / '03주차_도면추출' / 'assets'
sys.path.insert(0, str(FLOORPLAN))
sys.stdout.reconfigure(encoding='utf-8')

from fp import config, raster, rooms  # noqa: E402

WEB_WIDTH = 1500


def save_jpg(image, path, width=WEB_WIDTH):
    h, w = image.shape[:2]
    scale = width / w
    small = cv2.resize(image, (width, int(h * scale)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode('.jpg', small, [cv2.IMWRITE_JPEG_QUALITY, 86])
    assert ok
    buf.tofile(str(path))


def palette(i):
    # 인접 방이 구분되게 황금각으로 색을 돌린다
    hue = int((i * 137.508) % 180)
    hsv = np.uint8([[[hue, 150, 235]]])
    b, g, r = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)[0, 0]
    return int(b), int(g), int(r)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    stats = []
    for floor in config.FLOORS:
        image = raster.load_floor_image(floor)
        h, w = image.shape[:2]

        t0 = time.perf_counter()
        mask = rooms.extract_wall_mask(image)
        t1 = time.perf_counter()
        polys = rooms.extract_room_polygons(image)
        t2 = time.perf_counter()

        # 1) 원본
        save_jpg(image, OUT / f'{floor}_1_raster.jpg')
        # 2) 벽선: 흰 바탕에 남색 벽, 원본은 옅게
        faint = cv2.addWeighted(image, 0.18, np.full_like(image, 255), 0.82, 0)
        walls = faint.copy()
        walls[mask > 0] = (120, 40, 30)
        save_jpg(walls, OUT / f'{floor}_2_walls.jpg')
        # 3) 실 영역 폴리곤
        # 외곽선 면적이 페이지의 4%를 넘는 것은 도면 테두리·표제란 틀이다
        # (연결요소 자체는 가는 띠라 면적 필터를 통과한다). 채우지 않고 점선 윤곽만 그린다.
        page = w * h
        frames = [p for p in polys if cv2.contourArea(np.array(p.points, np.int32)) > page * rooms.MAX_AREA_RATIO]
        roomlike = [p for p in polys if p not in frames]
        fill = image.copy()
        for i, p in enumerate(roomlike):
            pts = np.array(p.points, np.int32)
            cv2.fillPoly(fill, [pts], palette(i))
        overlay = cv2.addWeighted(fill, 0.5, image, 0.5, 0)
        for p in roomlike:
            cv2.polylines(overlay, [np.array(p.points, np.int32)], True, (40, 40, 200), 3)
        for p in frames:
            pts = np.array(p.points, np.int32)
            for a, b in zip(pts, np.roll(pts, -1, axis=0)):
                n = max(1, int(np.hypot(*(b - a)) // 40))
                for k in range(0, n, 2):
                    p0 = a + (b - a) * k / n
                    p1 = a + (b - a) * min(k + 1, n) / n
                    cv2.line(overlay, tuple(map(int, p0)), tuple(map(int, p1)), (0, 140, 255), 6)
        save_jpg(overlay, OUT / f'{floor}_3_rooms.jpg')

        expected = config.EXPECTED_ROOM_COUNTS[floor]
        wall_px = int((mask > 0).sum())
        row = {
            'floor': floor,
            'source': config.SOURCES[floor][0],
            'dpi': config.RENDER_DPI,
            'size': [w, h],
            'wall_ratio': round(wall_px / (w * h), 4),
            'polygons': len(polys),
            'frames': len(frames),
            'expected_rooms': expected,
            'extract_rate': round(len(polys) / expected, 3) if expected else None,
            'wall_ms': round((t1 - t0) * 1000),
            'room_ms': round((t2 - t1) * 1000),
        }
        stats.append(row)
        print(row)
    (OUT / 'stats.json').write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
