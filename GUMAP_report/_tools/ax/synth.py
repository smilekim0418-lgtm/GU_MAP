# -*- coding: utf-8 -*-
"""방 번호 인식 모델용 합성 데이터.

도면마다 글꼴이 다르다(2F 굵은 고딕, 5F 회색 스캔, 6F 자간 좁은 장체, B1F 가는 글꼴).
여러 글꼴·굵기·장평·회색도·흐림·잡음으로 방 번호를 그려 학습 데이터의 폭을 넓히고,
한글 실명·영문·치수 숫자 같은 "방 번호가 아닌 줄"은 '#' 로 그려 거부하는 법을 배운다.
"""
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_DIR = 'C:/Windows/Fonts/'
DIGIT_FONTS = [
    'arial.ttf', 'arialbd.ttf', 'ARIALN.TTF', 'ARIALNB.TTF', 'malgun.ttf', 'malgunbd.ttf', 'malgunsl.ttf',
    'gulim.ttc', 'batang.ttc', 'HANDotum.ttf', 'HANDotumB.ttf', 'H2GTRM.TTF', 'H2GTRE.TTF', 'H2HDRM.TTF',
    'tahoma.ttf', 'tahomabd.ttf', 'segoeui.ttf', 'segoeuil.ttf', 'segoeuib.ttf', 'calibri.ttf',
    'calibril.ttf', 'bahnschrift.ttf', 'consola.ttf', 'GOTHIC.TTF', 'micross.ttf', 'NGULIM.TTF',
    'Hancom Gothic Regular.ttf', 'Hancom Gothic Bold.ttf', 'HanSantteutDotum-Regular.ttf',
]
HANGUL_FONTS = [
    'malgun.ttf', 'malgunbd.ttf', 'malgunsl.ttf', 'gulim.ttc', 'batang.ttc', 'HANDotum.ttf', 'HANDotumB.ttf',
    'H2GTRM.TTF', 'H2HDRM.TTF', 'H2GTRE.TTF', 'NGULIM.TTF', 'Hancom Gothic Regular.ttf',
    'HanSantteutDotum-Regular.ttf',
]
ROOM_WORDS = [
    '강의실', '실험실', '연구실', '교수연구실', '대학원연구실', '세미나실', '화장실', '여자화장실', '남자화장실',
    '장애인화장실', '샤워실', '계단실', '준비실', '기계실', '전기실', '창고', '휴게실', '휴계실', '탕비실',
    '컴퓨터실', '실습실', '시청각실', '학과사무실', '회의실', '자료실', '독서실', '계단식강의실',
    '재료혁신실험실', '비파괴검사실험실', '지능구조설계실험실', '최적설계실험실', '응용레이저기술실험실',
    '창의재료실험실', '열유체실험실', '제어실험실', '로봇실험실', '공작실', '분석실', '측정실', '청소용구실',
]
LATIN_WORDS = ['A 타입', 'B 타입', 'C 타입', 'XRD실험실', 'EV', 'EV-1', 'UP', 'DN', 'PS', 'EPS', 'AD', 'CAD실',
               'CNC', 'SEM', 'TEM', 'UTM', 'kit', 'NONE', 'A-01', 'SCALE', 'TYPE']
FONT_CACHE = {}
CHARS = '0123456789B-#'


def font(name, size):
    key = (name, size)
    if key not in FONT_CACHE:
        FONT_CACHE[key] = ImageFont.truetype(FONT_DIR + name, size)
    return FONT_CACHE[key]


def room_number(rng):
    r = rng.random()
    floor = rng.choice('1234567')
    base = floor + f'{rng.randint(0, 79):02d}'
    if r < 0.12:
        base = 'B1' + f'{rng.randint(0, 45):02d}'
    elif r < 0.16:
        base = 'B' + f'{rng.randint(100, 299)}'
    if rng.random() < 0.18:
        base += '-' + str(rng.randint(1, 3 if rng.random() < .8 else 12))
    return base


def negative_text(rng):
    r = rng.random()
    if r < 0.62:
        return rng.choice(ROOM_WORDS), rng.choice(HANGUL_FONTS)
    if r < 0.8:
        return rng.choice(LATIN_WORDS), rng.choice(HANGUL_FONTS)
    if r < 0.93:  # 치수 숫자·표제란 숫자는 방 번호가 아니다
        return rng.choice(['7,200', '9,000', '90,200', '2,700', '4,800', '88,700', '1,800', '6,500',
                           '2025. 07.', '478-7144', '119', '1/100']), rng.choice(DIGIT_FONTS)
    # 방 번호 옆에 붙은 교수 이름 등
    return rng.choice(['허장욱', '위정', '이현권', '김승현', '박일룡', '조금원', '최우진']), rng.choice(HANGUL_FONTS)


def render(text, font_name, rng):
    size = rng.randint(22, 44)
    f = font(font_name, size)
    stroke = rng.choice([0, 0, 0, 1]) if size > 28 else 0
    ink = rng.randint(0, 150) if rng.random() < 0.8 else rng.randint(150, 185)
    bbox = f.getbbox(text, stroke_width=stroke)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad = rng.randint(3, 9)
    img = Image.new('L', (w + pad * 2 + 4, h + pad * 2 + 4), 255)
    d = ImageDraw.Draw(img)
    d.text((pad - bbox[0] + 2, pad - bbox[1] + 2), text, font=f, fill=ink, stroke_width=stroke, stroke_fill=ink)
    # 장평: 6F 처럼 자간이 붙은 장체를 흉내낸다
    sx = rng.uniform(0.55, 1.15)
    img = img.resize((max(8, int(img.width * sx)), img.height), Image.BILINEAR)
    if rng.random() < 0.5:
        img = img.rotate(rng.uniform(-2, 2), resample=Image.BILINEAR, fillcolor=255, expand=False)
    arr = np.array(img, np.float32)
    # 벽선·문짝 선 조각이 가장자리에 걸리는 경우
    if rng.random() < 0.25:
        hh, ww = arr.shape
        if rng.random() < 0.5:
            x = rng.choice([rng.randint(0, 2), ww - rng.randint(1, 3)])
            arr[:, max(0, x - 1):x + 1] = rng.randint(0, 80)
        else:
            y = rng.choice([rng.randint(0, 2), hh - rng.randint(1, 3)])
            arr[max(0, y - 1):y + 1, :] = rng.randint(0, 80)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    # 저해상도 스캔을 흉내: 줄였다가 키우기 + 흐림 + 잡음
    if rng.random() < 0.6:
        s = rng.uniform(0.35, 0.8)
        small = img.resize((max(6, int(img.width * s)), max(6, int(img.height * s))), Image.BILINEAR)
        img = small.resize(img.size, Image.BILINEAR)
    if rng.random() < 0.4:
        img = img.filter(ImageFilter.GaussianBlur(rng.uniform(0.2, 1.1)))
    arr = np.array(img, np.float32)
    if rng.random() < 0.5:
        arr += np.random.default_rng(rng.randint(0, 1 << 30)).normal(0, rng.uniform(2, 12), arr.shape)
    return np.clip(arr, 0, 255).astype(np.uint8)


def sample(rng, neg_rate=0.3):
    if rng.random() < neg_rate:
        text, fname = negative_text(rng)
        return render(text, fname, rng), '#'
    text = room_number(rng)
    return render(text, rng.choice(DIGIT_FONTS), rng), text
