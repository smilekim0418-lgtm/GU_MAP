# -*- coding: utf-8 -*-
"""9~10주차 — 방 번호 인식 모델 학습 데이터 구축 · 학습 · 평가.

단계
  synth  : 합성 데이터만으로 1차 모델(r0) 학습
  data   : r0 로 테크노관 전 층의 글자 줄 후보를 읽고, 사람이 확정한 방 번호(정답)와
           편집거리 ≤ 2 로 가장 가까운 후보에 정답을 붙인다(모델 보조 라벨링).
           나머지 후보 중 r0 가 '#'(방 번호 아님)으로 확신한 것은 음성 표본으로 쓴다.
  real   : 합성 + 학습층(B1F~3F) 실데이터로 r1 학습 → 시험층(4F~6F)에서 Windows OCR 과 비교
  final  : 합성 + 전 층 실데이터로 배포용 모델 학습 → ONNX 내보내기

실행: python GUMAP_report/_tools/ax/train.py synth data real final
"""
import json
import random
import re
import sys
import time
from collections import Counter, defaultdict

import cv2
import numpy as np
import torch
import torch.nn as nn

import crnn
import synth
import textprop
from common import FLOORS, WEEK_DIR, WORK, is_room, labeled, load_json, raster, save_json, write_image

TRAIN_FLOORS = ['B1F', '1F', '2F', '3F']
TEST_FLOORS = ['4F', '5F', '6F']
MODELS = WORK / 'models'
DATA = WORK / 'dataset'
ROOM_RE = re.compile(r'^B?\d{3}(-\d{1,2})?$')
EMBED_RE = re.compile(r'(?<![\d,])(B?\d{3}(?:-\d{1,2})?)(?![\d,])')
torch.set_num_threads(max(1, torch.get_num_threads()))


def normalize(img):
    """임의 크기 회색조 → 32×128 uint8 (글자 비율 유지, 오른쪽 흰색 채움)."""
    h, w = img.shape[:2]
    nw = max(4, min(crnn.W, int(round(w * crnn.H / max(h, 1)))))
    r = cv2.resize(img, (nw, crnn.H), interpolation=cv2.INTER_AREA if h > crnn.H else cv2.INTER_LINEAR)
    out = np.full((crnn.H, crnn.W), 255, np.uint8)
    out[:, :nw] = r
    return out


def batch_tensor(arrs):
    x = np.stack(arrs).astype(np.float32)[:, None] / 255.0
    return torch.from_numpy(1.0 - x)


def edit_distance(a, b):
    d = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, d[0] = d[0], i
        for j, cb in enumerate(b, 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (ca != cb))
            prev, d[j] = d[j], cur
    return d[-1]


def make_synth(n, seed):
    rng = random.Random(seed)
    xs, ys = [], []
    for _ in range(n):
        img, text = synth.sample(rng)
        xs.append(normalize(img))
        ys.append(text)
    return xs, ys


def train_model(xs, ys, epochs, init=None, lr=2e-3, log_name='', val=None, ckpt=None):
    model = crnn.CRNN()
    if init:
        model.load_state_dict(torch.load(init))
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    steps = epochs * ((len(xs) + 127) // 128)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=lr, total_steps=steps, pct_start=0.15)
    ctc = nn.CTCLoss(blank=crnn.BLANK, zero_infinity=True)
    order = list(range(len(xs)))
    history = []
    for ep in range(epochs):
        model.train()
        random.shuffle(order)
        t0, total, nb = time.perf_counter(), 0.0, 0
        for i in range(0, len(order), 128):
            idx = order[i:i + 128]
            x = batch_tensor([xs[j] for j in idx])
            targets = [crnn.encode(ys[j]) for j in idx]
            flat = torch.tensor([c for t in targets for c in t], dtype=torch.long)
            tl = torch.tensor([len(t) for t in targets], dtype=torch.long)
            out = model(x).log_softmax(-1).permute(1, 0, 2)        # T,B,K
            il = torch.full((len(idx),), out.shape[0], dtype=torch.long)
            loss = ctc(out, flat, il, tl)
            opt.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            opt.step()
            sched.step()
            total += float(loss.detach())
            nb += 1
        row = {'epoch': ep + 1, 'loss': round(total / nb, 4), 'sec': round(time.perf_counter() - t0, 1)}
        if val is not None:
            row['val_acc'] = round(line_accuracy(model, *val), 4)
        history.append(row)
        print(log_name, row, flush=True)
        if ckpt:   # 세션이 끊겨도 마지막 에폭까지는 남긴다
            MODELS.mkdir(parents=True, exist_ok=True)
            torch.save(model.state_dict(), ckpt)
    model.eval()
    return model, history


@torch.no_grad()
def predict_arrays(model, arrs):
    res = []
    for i in range(0, len(arrs), 256):
        res.extend(crnn.decode(model(batch_tensor(arrs[i:i + 256]))))
    return res


def line_accuracy(model, xs, ys):
    model.eval()
    pred = predict_arrays(model, xs)
    return sum(p[0] == y for p, y in zip(pred, ys)) / max(len(ys), 1)


# ───────────────────────────── 층별 후보 ─────────────────────────────

def floor_candidates(floor):
    """GT 방마다 글자 줄 후보 (정규화 이미지와 상자)."""
    gray = cv2.cvtColor(raster(floor), cv2.COLOR_BGR2GRAY)
    rooms = []
    for p in labeled(floor)['polygons']:
        if not is_room(p):
            continue
        boxes = textprop.proposals(gray, p['points'])
        crops = [normalize(textprop.crop(gray, b)) for b in boxes]
        rooms.append({'room_id': p['room_id'], 'points': p['points'], 'boxes': boxes, 'crops': crops})
    return rooms


def recognize_rooms(model, rooms):
    """방마다 유효 방 번호 후보 중 신뢰도 최고를 고른다."""
    flat = [c for r in rooms for c in r['crops']]
    preds = predict_arrays(model, flat) if flat else []
    k = 0
    for r in rooms:
        r['preds'] = preds[k:k + len(r['crops'])]
        k += len(r['crops'])
        valid = [(t, c, i) for i, (t, c) in enumerate(r['preds']) if ROOM_RE.match(t)]
        if valid:
            t, c, i = max(valid, key=lambda v: v[1])
            r['pred'], r['conf'], r['pred_box'] = t, c, r['boxes'][i]
        else:
            r['pred'], r['conf'], r['pred_box'] = None, 0.0, None
    return rooms


def ocr_room_reads(floor, rooms):
    """Windows OCR: 방 폴리곤 안 단어에서 방 번호 후보 (fp.labels 와 같은 규칙)."""
    words = load_json(WORK / 'ocr' / f'{floor}.json')['words']
    out = []
    for r in rooms:
        pts = r['points'][0] if isinstance(r['points'][0][0], list) else r['points']
        cnt = np.array(pts, np.float32)
        cands = set()
        for w in words:
            cx, cy = w['x'] + w['w'] / 2, w['y'] + w['h'] / 2
            if cv2.pointPolygonTest(cnt, (cx, cy), False) < 0:
                continue
            t = w['text'].strip()
            if ROOM_RE.match(t):
                cands.add(t)
            else:
                cands.update(EMBED_RE.findall(t))
        out.append(sorted(cands)[0] if len(cands) == 1 else (None if not cands else '?'))
    return out


def evaluate(model, floors):
    rows = []
    samples = []
    for floor in floors:
        rooms = recognize_rooms(model, floor_candidates(floor))
        ocr = ocr_room_reads(floor, rooms)
        n = len(rooms)
        model_ok = sum(r['pred'] == r['room_id'] for r in rooms)
        ocr_ok = sum(o == r['room_id'] for o, r in zip(ocr, rooms))
        either = sum((r['pred'] == r['room_id']) or (o == r['room_id']) for o, r in zip(ocr, rooms))
        wrong = sum(1 for r in rooms if r['pred'] and r['pred'] != r['room_id'])
        rows.append({'floor': floor, 'rooms': n, 'model_correct': model_ok, 'ocr_correct': ocr_ok,
                     'either_correct': either, 'model_wrong': wrong,
                     'model_recall': round(model_ok / n, 4), 'ocr_recall': round(ocr_ok / n, 4)})
        for o, r in zip(ocr, rooms):
            samples.append({'floor': floor, 'gt': r['room_id'], 'pred': r['pred'], 'conf': round(r['conf'], 4),
                            'ocr': o, 'box': r['pred_box']})
        print(rows[-1], flush=True)
    return rows, samples


# ───────────────────────────── 단계 ─────────────────────────────

def stage_synth():
    t0 = time.perf_counter()
    xs, ys = make_synth(36000, 7)
    vx, vy = make_synth(2000, 99)
    print('합성 생성', round(time.perf_counter() - t0, 1), 's', flush=True)
    model, hist = train_model(xs, ys, 6, log_name='r0', val=(vx, vy), ckpt=MODELS / 'crnn_r0.pt')
    MODELS.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), MODELS / 'crnn_r0.pt')
    save_json(WORK / 'train_r0.json', {'history': hist, 'n_synth': len(xs),
                                       'synth_val_acc': hist[-1].get('val_acc')})


def stage_data():
    model = crnn.load(MODELS / 'crnn_r0.pt')
    index = []
    stats = []
    montage = defaultdict(list)
    for floor in FLOORS:
        rooms = floor_candidates(floor)
        flat = [c for r in rooms for c in r['crops']]
        preds = predict_arrays(model, flat)
        k = 0
        pos = neg = skipped = 0
        for r in rooms:
            pr = preds[k:k + len(r['crops'])]
            k += len(r['crops'])
            if not pr:
                skipped += 1
                continue
            dists = [edit_distance(t, r['room_id']) if t != '#' else 99 for t, _ in pr]
            best = int(np.argmin(dists))
            if dists[best] <= 2:
                pos += 1
                index.append({'floor': floor, 'label': r['room_id'], 'crop': r['crops'][best],
                              'r0': pr[best][0], 'box': r['boxes'][best]})
                if len(montage[floor]) < 10:
                    montage[floor].append((r['crops'][best], r['room_id'], pr[best][0]))
            else:
                skipped += 1
            for i, (t, c) in enumerate(pr):
                if i != best and t == '#' and c > 0.8:
                    neg += 1
                    index.append({'floor': floor, 'label': '#', 'crop': r['crops'][i], 'r0': t, 'box': r['boxes'][i]})
        auto_right = sum(1 for e in index if e['floor'] == floor and e['label'] != '#' and e['r0'] == e['label'])
        stats.append({'floor': floor, 'rooms': len(rooms), 'proposals': len(flat), 'positives': pos,
                      'negatives': neg, 'unlocated': skipped, 'r0_exact': auto_right,
                      'corrected_by_gt': pos - auto_right})
        print(stats[-1], flush=True)
    DATA.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(DATA / 'real.npz', crops=np.stack([e['crop'] for e in index]),
                        labels=np.array([e['label'] for e in index]), floors=np.array([e['floor'] for e in index]))
    # 9주차 화면용: 층별 정답 표본 몽타주 (원 크기 ×2)
    tiles = []
    for floor in FLOORS:
        row = []
        for crop, gt, r0 in montage[floor][:8]:
            t = cv2.cvtColor(cv2.resize(crop, (256, 64), interpolation=cv2.INTER_NEAREST), cv2.COLOR_GRAY2BGR)
            t = cv2.copyMakeBorder(t, 0, 22, 0, 0, cv2.BORDER_CONSTANT, value=(255, 255, 255))
            cv2.putText(t, f'{gt}', (4, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (30, 120, 30), 2)
            cv2.rectangle(t, (0, 0), (255, 85), (220, 220, 220), 1)
            row.append(t)
        while len(row) < 8:
            row.append(np.full((86, 256, 3), 255, np.uint8))
        label = np.full((86, 70, 3), 255, np.uint8)
        cv2.putText(label, floor, (8, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (80, 60, 200), 2)
        tiles.append(np.hstack([label] + row))
    write_image(WEEK_DIR[9] / 'assets' / 'dataset_montage.png', np.vstack(tiles))
    # 합성 표본 몽타주
    rng = random.Random(3)
    syn = []
    for _ in range(24):
        img, text = synth.sample(rng)
        t = cv2.cvtColor(cv2.resize(normalize(img), (256, 64), interpolation=cv2.INTER_AREA), cv2.COLOR_GRAY2BGR)
        t = cv2.copyMakeBorder(t, 0, 22, 0, 0, cv2.BORDER_CONSTANT, value=(255, 255, 255))
        cv2.putText(t, text if text != '#' else '# (reject)', (4, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                    (30, 120, 30) if text != '#' else (40, 40, 200), 2)
        cv2.rectangle(t, (0, 0), (255, 85), (220, 220, 220), 1)
        syn.append(t)
    write_image(WEEK_DIR[9] / 'assets' / 'synth_montage.png', np.vstack([np.hstack(syn[i:i + 6]) for i in range(0, 24, 6)]))
    labels = Counter(e['label'] if e['label'] == '#' else 'room' for e in index)
    save_json(WEEK_DIR[9] / 'dataset.json', {
        'floors': stats, 'total': {'samples': len(index), 'positives': labels['room'], 'negatives': labels['#']},
        'split': {'train': TRAIN_FLOORS, 'test': TEST_FLOORS},
        'charset': crnn.CHARS, 'input': [crnn.H, crnn.W],
        'synthetic': {'n': 36000, 'fonts': len(synth.DIGIT_FONTS), 'hangul_fonts': len(synth.HANGUL_FONTS),
                      'negative_rate': 0.3},
    })


def load_real(floors):
    d = np.load(DATA / 'real.npz')
    keep = np.isin(d['floors'], floors)
    return list(d['crops'][keep]), list(d['labels'][keep])


def jitter(arrs, labels, times, seed):
    """실데이터 증강: 장평·흐림·밝기만 살짝 바꾼다."""
    rng = random.Random(seed)
    xs, ys = [], []
    for _ in range(times):
        for a, y in zip(arrs, labels):
            img = a.copy()
            nz = np.nonzero(img.min(axis=0) < 250)[0]
            w = int(nz.max()) + 3 if len(nz) else img.shape[1]
            part = img[:, :min(w, img.shape[1])]
            part = cv2.resize(part, (max(8, int(part.shape[1] * rng.uniform(0.8, 1.15))), crnn.H))
            if rng.random() < 0.3:
                part = cv2.GaussianBlur(part, (3, 3), rng.uniform(0.3, 0.9))
            part = np.clip(part.astype(np.float32) * rng.uniform(0.9, 1.05) + rng.uniform(-10, 10), 0, 255).astype(np.uint8)
            xs.append(normalize(part))
            ys.append(y)
    return xs, ys


def stage_real():
    rx, ry = load_real(TRAIN_FLOORS)
    jx, jy = jitter(rx, ry, 6, 5)
    sx, sy = make_synth(24000, 11)
    model, hist = train_model(sx + jx, sy + jy, 5, init=MODELS / 'crnn_r0.pt', lr=1e-3, log_name='r1',
                              ckpt=MODELS / 'crnn_r1.pt')
    torch.save(model.state_dict(), MODELS / 'crnn_r1.pt')
    r0 = crnn.load(MODELS / 'crnn_r0.pt')
    print('— 시험층 평가 (r0: 합성만)')
    r0_rows, _ = evaluate(r0, TEST_FLOORS)
    print('— 시험층 평가 (r1: 합성+실데이터)')
    rows, samples = evaluate(model, TEST_FLOORS)
    print('— 학습층 평가 (r1)')
    train_rows, _ = evaluate(model, TRAIN_FLOORS)
    r0_hist = load_json(WORK / 'train_r0.json')
    save_json(WEEK_DIR[10] / 'model.json', {
        'architecture': 'CRNN: CNN 5블록(32→192ch) + BiLSTM 2층(128) + CTC · 입력 32×128 · 출력 ' + crnn.CHARS,
        'params': sum(p.numel() for p in model.parameters()),
        'r0': {'history': r0_hist['history'], 'synth_val_acc': r0_hist['synth_val_acc'], 'test': r0_rows},
        'r1': {'history': hist, 'train_real': len(rx), 'test': rows, 'train_floors_eval': train_rows},
        'split': {'train': TRAIN_FLOORS, 'test': TEST_FLOORS},
        'test_samples': samples,
    })


def stage_evalreal():
    """real 단계가 저장 직전에 멈췄을 때: 저장된 r1 로 평가만 다시 하고 학습 기록은 로그에서 읽는다."""
    import ast
    hist = [ast.literal_eval(line.split(' ', 1)[1]) for line in open(WORK / 'train_stage1.log', encoding='utf-8')
            if line.startswith('r1 {')]
    rx, _ = load_real(TRAIN_FLOORS)
    model = crnn.load(MODELS / 'crnn_r1.pt')
    r0 = crnn.load(MODELS / 'crnn_r0.pt')
    r0_rows, _ = evaluate(r0, TEST_FLOORS)
    rows, samples = evaluate(model, TEST_FLOORS)
    train_rows, _ = evaluate(model, TRAIN_FLOORS)
    r0_hist = load_json(WORK / 'train_r0.json')
    save_json(WEEK_DIR[10] / 'model.json', {
        'architecture': 'CRNN: CNN 5블록(32→192ch) + BiLSTM 2층(128) + CTC · 입력 32×128 · 출력 ' + crnn.CHARS,
        'params': sum(p.numel() for p in model.parameters()),
        'r0': {'history': r0_hist['history'], 'synth_val_acc': r0_hist['synth_val_acc'], 'test': r0_rows},
        'r1': {'history': hist, 'train_real': len(rx), 'test': rows, 'train_floors_eval': train_rows},
        'split': {'train': TRAIN_FLOORS, 'test': TEST_FLOORS},
        'test_samples': samples,
    })
    print('model.json 저장', flush=True)


def stage_final():
    rx, ry = load_real(FLOORS)
    jx, jy = jitter(rx, ry, 6, 8)
    sx, sy = make_synth(24000, 13)
    model, hist = train_model(sx + jx, sy + jy, 5, init=MODELS / 'crnn_r0.pt', lr=1e-3, log_name='final',
                              ckpt=MODELS / 'crnn_final.pt')
    torch.save(model.state_dict(), MODELS / 'crnn_final.pt')
    dummy = torch.zeros(1, 1, crnn.H, crnn.W)
    torch.onnx.export(model, dummy, str(MODELS / 'room_crnn.onnx'), input_names=['image'],
                      output_names=['logits'], dynamic_axes={'image': {0: 'batch'}, 'logits': {0: 'batch'}},
                      opset_version=17, dynamo=False)
    save_json(WORK / 'train_final.json', {'history': hist, 'train_real': len(rx)})
    print('saved final + onnx')


if __name__ == '__main__':
    for stage in sys.argv[1:]:
        {'synth': stage_synth, 'data': stage_data, 'real': stage_real, 'evalreal': stage_evalreal,
         'final': stage_final}[stage]()
