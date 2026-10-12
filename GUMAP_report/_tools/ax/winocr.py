# -*- coding: utf-8 -*-
"""Windows OCR(WinRT) 호출 — 사진처럼 살짝 기운 이미지용.

WinRT OCR 은 글자 줄의 기울기(TextAngle)를 스스로 찾아 편 뒤 상자를 돌려준다.
즉 상자 좌표가 "기울기를 편 이미지" 기준이라, 원본 좌표에서 쓰려면
이미지 중심을 축으로 TextAngle 만큼 되돌려야 한다. 도면 PDF 래스터는 기울기가 0 이라
원래 파이프라인(fp.ocr)에서는 드러나지 않던 문제다.
"""
import json
import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

SCRIPT = Path(__file__).with_name('ocr_win_angle.ps1')


@dataclass
class Word:
    text: str
    x: float
    y: float
    w: float
    h: float
    cx: float      # 원본 좌표계의 중심
    cy: float


def ocr(path, lang='ko'):
    done = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                           '-File', str(SCRIPT), '-ImagePath', str(Path(path).resolve()), '-Lang', lang],
                          capture_output=True, timeout=180)
    if done.returncode != 0:
        raise RuntimeError(done.stderr.decode('utf-8', 'replace'))
    data = json.loads(done.stdout.decode('utf-8', 'replace'))
    angle = float(data.get('angle') or 0.0)
    W, H = float(data['width']), float(data['height'])
    ox, oy = W / 2, H / 2
    a = math.radians(angle)
    words = []
    for d in data.get('words') or []:
        cx, cy = d['x'] + d['w'] / 2, d['y'] + d['h'] / 2
        # 편 좌표 → 원본: 중심 기준으로 +angle 만큼 회전 (TextAngle 은 시계 방향 양수)
        dx, dy = cx - ox, cy - oy
        rx = ox + dx * math.cos(a) - dy * math.sin(a)
        ry = oy + dx * math.sin(a) + dy * math.cos(a)
        words.append(Word(d['text'], d['x'], d['y'], d['w'], d['h'], rx, ry))
    return words, angle
