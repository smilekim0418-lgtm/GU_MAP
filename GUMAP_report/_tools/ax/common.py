# -*- coding: utf-8 -*-
"""AX 자동화 파이프라인(9~13주차) 공통 경로·입출력.

테크노관 원본 파이프라인(GUMAP-개발/floorplan)의 모듈을 그대로 가져다 쓴다.
여기서 만드는 것은 그 위에 얹는 "자동화 계층"이다.
"""
import io
import json
import os
import sys

# torch 와 OpenCV/NumPy 가 각자 OpenMP 런타임을 들고 와 충돌한다(Windows). 오프라인 도구라 허용한다.
os.environ.setdefault('KMP_DUPLICATE_LIB_OK', 'TRUE')
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
FLOORPLAN = ROOT / 'GUMAP-개발' / 'floorplan'
REPORT = ROOT / 'GUMAP_report'
WORK = REPORT / '_work'          # 중간 산출물 (용량 큼, 재생성 가능)
WORK.mkdir(parents=True, exist_ok=True)

if str(FLOORPLAN) not in sys.path:
    sys.path.insert(0, str(FLOORPLAN))
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

from fp import config  # noqa: E402

FLOORS = config.FLOORS
WEEK_DIR = {
    9: REPORT / '09주차_자동화기준선',
    10: REPORT / '10주차_도면인식모델',
    11: REPORT / '11주차_자동라벨링',
    12: REPORT / '12주차_신규건물',
    13: REPORT / '13주차_캠퍼스경로망',
}


def read_image(path, flags=cv2.IMREAD_COLOR):
    img = cv2.imdecode(np.fromfile(str(path), np.uint8), flags)
    if img is None:
        raise RuntimeError(f'이미지 디코드 실패: {path}')
    return img


def write_image(path, img, quality=88):
    ext = Path(path).suffix.lower()
    params = [cv2.IMWRITE_JPEG_QUALITY, quality] if ext in ('.jpg', '.jpeg') else []
    ok, buf = cv2.imencode(ext, img, params)
    assert ok, path
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    buf.tofile(str(path))


def raster(floor):
    return read_image(FLOORPLAN / 'work' / f'{floor}_raster_400.png')


def labeled(floor):
    return json.load(open(FLOORPLAN / 'work' / f'{floor}_labeled.json', encoding='utf-8'))


def auto_polygons(floor):
    return json.load(open(FLOORPLAN / 'work' / f'{floor}_polygons.json', encoding='utf-8'))


def is_room(poly):
    """최종 라벨에서 '방' 인 것. type 이 비어 있는 옛 항목도 방 번호가 있으면 방이다."""
    t = poly.get('type')
    return bool(poly.get('room_id')) and t in (None, 'room')


def _plain(o):
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    raise TypeError(type(o))


def save_json(path, data):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, indent=1, default=_plain)   # 직렬화가 끝난 뒤에 쓴다
    io.open(path, 'w', encoding='utf-8', newline='\n').write(text)


def load_json(path):
    return json.load(open(path, encoding='utf-8'))
