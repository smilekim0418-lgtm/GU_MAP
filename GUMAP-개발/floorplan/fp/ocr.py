"""Windows 내장 WinRT OCR 래퍼.

tesseract 설치 없이 Windows 10/11 이 제공하는 Windows.Media.Ocr 를 쓴다.
PowerShell 스크립트를 호출해 JSON 을 받는다.
"""
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

MAX_IMAGE_DIMENSION = 10000
_SCRIPT = Path(__file__).with_name("ocr_win.ps1")


class OcrError(RuntimeError):
    """OCR 호출 실패."""


@dataclass
class OcrWord:
    text: str
    x: float
    y: float
    w: float
    h: float


def center(word: OcrWord) -> tuple[float, float]:
    """단어 바운딩 박스의 중심점."""
    return (word.x + word.w / 2, word.y + word.h / 2)


def ocr_image(png_path: Path, lang: str = "ko") -> list[OcrWord]:
    """이미지에서 단어와 바운딩 박스를 읽는다. 좌표는 이미지 픽셀 기준이다."""
    path = Path(png_path)
    if not path.exists():
        raise OcrError(f"이미지 없음: {path}")

    buffer = np.fromfile(path, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise OcrError(f"이미지 디코드 실패: {path}")
    if max(image.shape[:2]) > MAX_IMAGE_DIMENSION:
        raise OcrError(
            f"이미지가 너무 큼 ({max(image.shape[:2])}px). WinRT OCR 한계는 {MAX_IMAGE_DIMENSION}px 이다."
        )

    try:
        completed = subprocess.run(
            [
                "powershell", "-NoProfile", "-NonInteractive",
                "-ExecutionPolicy", "Bypass",
                "-File", str(_SCRIPT),
                "-ImagePath", str(path.resolve()),
                "-Lang", lang,
            ],
            capture_output=True,
            timeout=180,
        )
    except subprocess.TimeoutExpired as exc:
        # 배치로 7개 층을 돌리므로 한 장이 멎어도 OcrError 로 나와야
        # 호출부가 그 층만 건너뛸 수 있다.
        raise OcrError(f"OCR 시간 초과 (180초): {path}") from exc
    if completed.returncode != 0:
        raise OcrError(f"OCR 실패: {completed.stderr.decode('utf-8', 'replace')}")

    payload = completed.stdout.decode("utf-8", "replace").strip()
    if not payload:
        return []
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise OcrError(f"OCR 결과 파싱 실패: {payload[:200]}") from exc
    if isinstance(data, dict):
        data = [data]
    return [
        OcrWord(text=str(d["text"]), x=float(d["x"]), y=float(d["y"]), w=float(d["w"]), h=float(d["h"]))
        for d in data
    ]
