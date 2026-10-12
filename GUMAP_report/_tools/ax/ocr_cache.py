# -*- coding: utf-8 -*-
"""Windows 내장 OCR(WinRT)로 층마다 단어·상자를 읽어 캐시한다 — OCR 기준선.

실행: python GUMAP_report/_tools/ax/ocr_cache.py [층 ...]
"""
import sys
import time
from dataclasses import asdict

from common import FLOORPLAN, FLOORS, WORK, save_json
from fp import ocr

OUT = WORK / 'ocr'


def main():
    targets = sys.argv[1:] or FLOORS
    for floor in targets:
        png = FLOORPLAN / 'work' / f'{floor}_raster_400.png'
        t0 = time.perf_counter()
        words = ocr.ocr_image(png)
        dt = time.perf_counter() - t0
        save_json(OUT / f'{floor}.json', {'floor': floor, 'seconds': round(dt, 2),
                                           'words': [asdict(w) for w in words]})
        print(f'{floor}: 단어 {len(words)}개 · {dt:.1f}s')


if __name__ == '__main__':
    main()
