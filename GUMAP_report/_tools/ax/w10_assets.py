# -*- coding: utf-8 -*-
"""10주차 화면용 — 시험층(4F~6F) 판독 예시 이미지.

OCR 이 놓쳤는데 모델이 맞힌 방, 둘 다 맞힌 방, 모델이 틀린 방을 골고루 뽑아
글자 줄 상자 이미지와 판독 결과를 samples.json 으로 남긴다.
"""
import random

import cv2

import textprop
from common import WEEK_DIR, load_json, raster, save_json, write_image


def main():
    m = load_json(WEEK_DIR[10] / 'model.json')
    rows = [s for s in m['test_samples'] if s['box']]
    groups = {
        'model_only': [s for s in rows if s['pred'] == s['gt'] and s['ocr'] != s['gt']],
        'both': [s for s in rows if s['pred'] == s['gt'] and s['ocr'] == s['gt']],
        'model_wrong': [s for s in rows if s['pred'] and s['pred'] != s['gt']],
    }
    rng = random.Random(4)
    pick = []
    for key, n in (('model_only', 6), ('both', 4), ('model_wrong', 2)):
        g = groups[key][:]
        rng.shuffle(g)
        pick += [dict(s, kind=key) for s in g[:n]]
    grays = {}
    out = []
    for i, s in enumerate(pick):
        if s['floor'] not in grays:
            grays[s['floor']] = cv2.cvtColor(raster(s['floor']), cv2.COLOR_BGR2GRAY)
        crop = textprop.crop(grays[s['floor']], s['box'], pad=10)
        name = f'sample_{i:02d}.png'
        write_image(WEEK_DIR[10] / 'assets' / name, cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC))
        out.append(dict(s, img=name))
    save_json(WEEK_DIR[10] / 'samples.json', {'counts': {k: len(v) for k, v in groups.items()}, 'samples': out})
    print({k: len(v) for k, v in groups.items()})


if __name__ == '__main__':
    main()
