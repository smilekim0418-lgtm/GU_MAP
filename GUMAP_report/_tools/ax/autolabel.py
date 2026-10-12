# -*- coding: utf-8 -*-
"""11주차 — 신뢰도 기반 자동/수동 분기 + 강의실 대장 자동 대조 (테크노관으로 검증).

테크노관은 사람이 확정한 정답이 있으므로 자동 분기의 품질을 잴 수 있다.
  - 방마다 Windows OCR 과 CRNN(r1: 4F~6F 는 학습에 안 쓴 층)으로 번호를 읽고
  - decide.decide() 로 신뢰도·자동/검수를 정한다 (강의실 대장 대조 포함)
  - 자동 반영된 것의 정답률(정밀도)과 검수로 간 양을 층별로 잰다
  - 기준값(τ)을 바꿔 가며 자동 비율 ↔ 정밀도 곡선을 그린다
  - 대장 대조: 대장에만 있는 번호(누락) · 도면에만 있는 번호 · 같은 번호 중복
마지막으로 9주차 기준선과 같은 표준 작업시간으로 "자동화 후 수작업 추정"을 낸다.

실행: python GUMAP_report/_tools/ax/autolabel.py
"""
import json
import re
from collections import Counter

import cv2
import numpy as np

import crnn
import decide
import textprop
import train as T
from common import FLOORS, WEEK_DIR, WORK, is_room, labeled, load_json, raster, save_json, write_image
from fp import excel

TEST = T.TEST_FLOORS


def floor_rows(model, floor, register):
    gray = cv2.cvtColor(raster(floor), cv2.COLOR_BGR2GRAY)
    rooms = [p for p in labeled(floor)['polygons'] if is_room(p)]
    words = load_json(WORK / 'ocr' / f'{floor}.json')['words']
    prefix = floor.replace('F', '') if floor != 'B1F' else 'B1'
    rows = []
    for p in rooms:
        pts = p['points'][0] if isinstance(p['points'][0][0], list) else p['points']
        cnt = np.array(pts, np.float32)
        cands = set()
        for w in words:
            cx, cy = w['x'] + w['w'] / 2, w['y'] + w['h'] / 2
            if cv2.pointPolygonTest(cnt, (cx, cy), False) >= 0:
                t = w['text'].strip()
                cands.update([t] if decide.ROOM_RE.match(t) else T.EMBED_RE.findall(t))
        ocr = sorted(cands)[0] if len(cands) == 1 else None
        boxes = textprop.proposals(gray, p['points'])
        mtext, mconf, mbox = None, 0.0, None
        if boxes:
            preds = crnn.predict(model, [textprop.crop(gray, b) for b in boxes])
            valid = [(t, c, b) for (t, c), b in zip(preds, boxes) if decide.ROOM_RE.match(t)]
            if valid:
                mtext, mconf, mbox = max(valid, key=lambda v: v[1])
        label, conf, route, reasons = decide.decide(ocr, mtext, float(mconf), prefix, register)
        rows.append({'gt': p['room_id'], 'ocr': ocr, 'model': mtext, 'model_conf': round(float(mconf), 4),
                     'label': label, 'conf': conf, 'route': route, 'reasons': reasons,
                     'box': mbox, 'centroid': p['centroid']})
    decide.flag_duplicates(rows)
    return rows, gray


def sweep(rows):
    out = []
    for tau in [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.97]:
        auto = [r for r in rows if r['label'] and r['conf'] >= tau]
        ok = sum(1 for r in auto if r['label'] == r['gt'])
        out.append({'tau': tau, 'auto_rate': round(len(auto) / len(rows), 4),
                    'precision': round(ok / max(len(auto), 1), 4), 'auto': len(auto), 'wrong_auto': len(auto) - ok})
    return out


def main():
    model = crnn.load(WORK / 'models' / 'crnn_r1.pt')
    reg_all = excel.load_rooms()
    result = {'threshold': decide.THRESHOLD, 'floors': [], 'review_samples': []}
    all_rows, test_rows = [], []
    base = load_json(WEEK_DIR[9] / 'baseline.json')
    doors = load_json(WEEK_DIR[10] / 'doors.json')
    unit = base['unit_seconds']
    samples = []
    for floor in FLOORS:
        register = {r.room_id for r in reg_all[floor]}
        rows, gray = floor_rows(model, floor, register)
        all_rows += rows
        if floor in TEST:
            test_rows += rows
        auto = [r for r in rows if r['route'] == 'auto']
        ok_auto = sum(1 for r in auto if r['label'] == r['gt'])
        review = [r for r in rows if r['route'] != 'auto']
        found = [r['label'] for r in rows if r['label']]
        dup = sorted(k for k, v in Counter(found).items() if v > 1)
        # 대장 대조 (최종 도면 번호 기준)
        gt_ids = {r['gt'] for r in rows}
        result['floors'].append({
            'floor': floor, 'split': 'test' if floor in TEST else 'train', 'rooms': len(rows),
            'auto': len(auto), 'auto_correct': ok_auto, 'auto_wrong': len(auto) - ok_auto,
            'review': len(review), 'review_reasons': Counter(x for r in review for x in r['reasons']).most_common(),
            'register_rooms': len(register),
            'register_missing': sorted(register - gt_ids), 'not_in_register': sorted(gt_ids - register),
            'duplicates': dup,
        })
        print(result['floors'][-1]['floor'], len(rows), 'auto', len(auto), 'ok', ok_auto, 'review', len(review), flush=True)
        # 검수 화면용 표본 (시험층의 검수 항목)
        if floor in TEST:
            for r in review:
                if len(samples) >= 12 or not r['box']:
                    continue
                crop = textprop.crop(gray, r['box'], pad=14)
                name = f'review_{floor}_{r["gt"]}.png'
                write_image(WEEK_DIR[11] / 'assets' / name, cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC))
                samples.append({'floor': floor, 'img': name, 'gt': r['gt'], 'ocr': r['ocr'], 'model': r['model'],
                                'model_conf': r['model_conf'], 'label': r['label'], 'conf': r['conf'],
                                'reasons': r['reasons']})
    result['review_samples'] = samples
    result['sweep_test'] = sweep(test_rows)
    result['sweep_all'] = sweep(all_rows)

    # 자동화 후 수작업 추정 (9주차 기준선과 같은 표준 작업시간)
    tot = base['total']['counts']
    auto_all = [r for r in all_rows if r['route'] == 'auto']
    wrong_auto = sum(1 for r in auto_all if r['label'] != r['gt'])
    review_n = len(all_rows) - len(auto_all)
    d = doors['total']
    before = {k: tot.get(k, 0) for k in ('relabel', 'reshape', 'redraw', 'delete', 'typed_space', 'door', 'vertical')}
    # 번호: 검수 항목은 확인·입력(relabel), 자동 반영 오류도 나중에 고쳐야 하므로 relabel 로 센다
    # 도형: 추출 단계는 그대로이므로 새로 그림·도형 수정·삭제는 그대로 둔다
    # 문: 검출이 맞힌 문은 확인만(2초), 놓친 문은 새로 그림(12초), 오검출은 삭제(3초)
    after_seconds = ((review_n + wrong_auto) * unit['relabel'] + before['reshape'] * unit['reshape'] +
                     before['redraw'] * unit['redraw'] + before['delete'] * unit['delete'] +
                     before['typed_space'] * unit['typed_space'] + before['vertical'] * unit['vertical'] +
                     d['correct'] * 2 + d['missed'] * unit['door'] + (d['false_pos'] + d['right_place_wrong_link']) * unit['delete'])
    before_seconds = base['total']['estimated_minutes'] * 60
    result['effect'] = {
        'before_minutes': round(before_seconds / 60, 1),
        'after_minutes': round(after_seconds / 60, 1),
        'reduction': round(1 - after_seconds / before_seconds, 4),
        'labels_before': sum(1 for r in all_rows) - tot.get('auto', 0),
        'labels_review_after': review_n, 'labels_wrong_auto': wrong_auto,
        'doors_before': tot.get('door', 0), 'doors_manual_after': d['missed'],
        'doors_delete_after': d['false_pos'] + d['right_place_wrong_link'],
        'assumption': '문 확인 2초 · 나머지는 9주차 표준 작업시간과 동일. 도형 추출 단계는 바꾸지 않았으므로 도형 수작업은 그대로 둔다.',
    }
    save_json(WEEK_DIR[11] / 'autolabel.json', result)
    print(json.dumps(result['effect'], ensure_ascii=False))
    print(result['sweep_test'])


if __name__ == '__main__':
    main()
