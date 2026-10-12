# -*- coding: utf-8 -*-
"""방 번호 인식 모델 — CRNN (CNN + BiLSTM + CTC).

입력: 글자 줄 한 장(회색조), 높이 32 · 폭 128 로 비율 유지 축소 후 오른쪽을 흰색으로 채움
출력: '0123456789B-#' 문자열. '#' 은 "방 번호가 아닌 줄" (한글 실명, 영문, 치수 등).
신뢰도: 탐욕 복호 경로의 문자별 최대확률 곱.
"""
import cv2
import numpy as np
import torch
import torch.nn as nn

CHARS = '0123456789B-#'
BLANK = 0
H, W = 32, 128


def to_tensor_batch(images):
    batch = np.full((len(images), 1, H, W), 1.0, np.float32)
    for i, img in enumerate(images):
        h, w = img.shape[:2]
        nw = max(4, min(W, int(round(w * H / max(h, 1)))))
        r = cv2.resize(img, (nw, H), interpolation=cv2.INTER_AREA if h > H else cv2.INTER_LINEAR)
        batch[i, 0, :, :nw] = r.astype(np.float32) / 255.0
    return torch.from_numpy(1.0 - batch)          # 글자=밝게


def encode(text):
    return [CHARS.index(c) + 1 for c in text]


class CRNN(nn.Module):
    def __init__(self, n_classes=len(CHARS) + 1):
        super().__init__()

        def block(i, o, pool):
            layers = [nn.Conv2d(i, o, 3, padding=1), nn.BatchNorm2d(o), nn.ReLU(inplace=True)]
            if pool:
                layers.append(nn.MaxPool2d(pool))
            return layers
        self.cnn = nn.Sequential(
            *block(1, 32, (2, 2)),      # 16×64
            *block(32, 64, (2, 2)),     # 8×32
            *block(64, 128, None),
            *block(128, 128, (2, 1)),   # 4×32
            *block(128, 192, (2, 1)),   # 2×32
            nn.Dropout2d(0.1),
        )
        self.rnn = nn.LSTM(192 * 2, 128, num_layers=2, bidirectional=True, batch_first=True, dropout=0.1)
        self.fc = nn.Linear(256, n_classes)

    def forward(self, x):
        f = self.cnn(x)                         # B,C,2,32
        b, c, h, w = f.shape
        f = f.permute(0, 3, 1, 2).reshape(b, w, c * h)
        f, _ = self.rnn(f)
        return self.fc(f)                       # B,T,K  (T=32)


def decode(logits):
    """탐욕 복호. (문자열, 신뢰도) 목록."""
    prob = logits.softmax(-1)
    best, idx = prob.max(-1)
    out = []
    for p_row, i_row in zip(best.cpu().numpy(), idx.cpu().numpy()):
        text, conf, prev = [], 1.0, BLANK
        for p, i in zip(p_row, i_row):
            if i != BLANK and i != prev:
                text.append(CHARS[i - 1])
                conf *= float(p)
            prev = i
        # 공백(blank) 프레임의 확신도 반영: 가장 불확실한 프레임
        conf = min(conf, float(p_row.min()) ** 0.5)
        out.append((''.join(text), conf))
    return out


def load(path, device='cpu'):
    model = CRNN()
    model.load_state_dict(torch.load(path, map_location=device))
    model.eval()
    return model


@torch.no_grad()
def predict(model, images, batch=256):
    res = []
    for i in range(0, len(images), batch):
        res.extend(decode(model(to_tensor_batch(images[i:i + batch]))))
    return res
