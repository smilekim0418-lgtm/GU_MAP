# -*- coding: utf-8 -*-
"""11주차 — 신뢰도 기반 자동/수동 분기 규칙.

방 하나에 대해 두 판독기(Windows OCR, CRNN 모델)의 결과와 규칙 검사를 합쳐
신뢰도를 매기고, 기준값(THRESHOLD) 이상이면 자동 반영, 미만이면 검수 목록으로 보낸다.

  두 판독기 일치                  → 0.97 이상
  한쪽만 읽음                     → 그 판독기의 신뢰도 (OCR 은 0.80 고정)
  두 판독기 불일치                → 높은 쪽 × 0.5 (검수)
  층 번호 규칙 위반(3층에 2xx)    → × 0.4
  강의실 대장에 없는 번호         → × 0.6 (대장이 있을 때)
  같은 층에 같은 번호 중복        → 둘 다 × 0.5
"""
import re

THRESHOLD = 0.85
OCR_CONF = 0.80
ROOM_RE = re.compile(r'^B?\d{3}(-\d{1,2})?$')


def floor_ok(number, prefix):
    if not number or not prefix:
        return True
    return number.startswith(prefix)


def decide(ocr_text, model_text, model_conf, prefix=None, register=None):
    reasons = []
    ocr_text = ocr_text if (ocr_text and ROOM_RE.match(ocr_text)) else None
    model_text = model_text if (model_text and ROOM_RE.match(model_text)) else None
    if ocr_text and model_text:
        if ocr_text == model_text:
            label, conf = ocr_text, max(0.97, model_conf)
            reasons.append('OCR·모델 일치')
        else:
            label = model_text if model_conf >= OCR_CONF else ocr_text
            conf = max(model_conf, OCR_CONF) * 0.5
            reasons.append(f'판독 불일치 OCR {ocr_text} / 모델 {model_text}')
    elif model_text:
        label, conf = model_text, model_conf
        reasons.append('모델만 판독')
    elif ocr_text:
        label, conf = ocr_text, OCR_CONF
        reasons.append('OCR만 판독')
    else:
        return None, 0.0, 'review', ['번호 판독 실패']
    if not floor_ok(label, prefix):
        conf *= 0.4
        reasons.append('층 번호 규칙 위반')
    if register is not None and label not in register:
        conf *= 0.6
        reasons.append('대장에 없는 번호')
    route = 'auto' if conf >= THRESHOLD else 'review'
    return label, round(conf, 4), route, reasons


def flag_duplicates(items):
    """items: dict 목록(label, conf, route, reasons). 같은 번호가 둘 이상이면 모두 검수로."""
    seen = {}
    for it in items:
        if it.get('label'):
            seen.setdefault(it['label'], []).append(it)
    for label, group in seen.items():
        if len(group) > 1:
            for it in group:
                it['conf'] = round(it['conf'] * 0.5, 4)
                it['route'] = 'review' if it['conf'] < THRESHOLD else it['route']
                it['reasons'] = it['reasons'] + ['같은 층 번호 중복']
    return items
