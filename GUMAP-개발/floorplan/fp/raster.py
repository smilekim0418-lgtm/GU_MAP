"""도면 PDF 를 고해상도 래스터로 변환한다.

원본은 200dpi 스캔이므로 400dpi 로 렌더링해도 원본 이상의 정보는 없다.
벽선 형태소 연산과 OCR 이 안정적으로 동작할 해상도를 확보하는 것이 목적이다.
"""
from pathlib import Path

import cv2
import numpy as np
import pymupdf

from . import config


def _output_path(floor: str, dpi: int) -> Path:
    return config.WORK_DIR / f"{floor}_raster_{dpi}.png"


def render_floor(floor: str, dpi: int | None = None, force: bool = False) -> Path:
    """층 도면을 PNG 로 렌더링하고 경로를 반환한다. 이미 있으면 재사용한다."""
    resolution = dpi or config.RENDER_DPI
    out = _output_path(floor, resolution)
    if out.exists() and not force:
        return out

    pdf_path, page_index = config.plan_source(floor)
    if not pdf_path.exists():
        raise FileNotFoundError(f"도면 PDF 없음: {pdf_path}")

    config.WORK_DIR.mkdir(parents=True, exist_ok=True)
    document = pymupdf.open(pdf_path)
    try:
        page = document[page_index]
        pixmap = page.get_pixmap(dpi=resolution)
        pixmap.save(out)
    finally:
        document.close()
    return out


def load_floor_image(floor: str, dpi: int | None = None) -> np.ndarray:
    """층 도면을 BGR numpy 배열로 읽는다."""
    path = render_floor(floor, dpi)
    # 경로에 한글이 있어 cv2.imread 가 Windows 에서 실패한다. 바이트로 읽어 디코드한다.
    buffer = np.fromfile(path, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError(f"이미지 디코드 실패: {path}")
    return image
