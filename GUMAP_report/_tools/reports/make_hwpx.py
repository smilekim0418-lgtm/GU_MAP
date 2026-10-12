"""월별 활동보고서 .hwpx — 9월 제출본(한글 서식)을 틀로 삼아 content.js 내용으로 바꿔 쓴다.

실행: python GUMAP_report/_tools/reports/make_hwpx.py 2026-10 [틀.hwpx]
  틀 기본값: AX프로그램/2026년 9월 활동보고서/…별지1_2.hwpx (사용자가 채워 제출한 9월본)
출력: GUMAP_report/보고서/2026-MM_활동보고서_GUMAP.hwpx

틀의 표·문단 모양(paraPr/charPr)은 그대로 두고 글자만 바꾼다.
- 팀 활동 내용 칸: 문단을 content.js 항목(h/b/p)대로 다시 만든다. 【】 는 틀의 빨간 글자 모양(charPr 33).
- 활동 내용 스크린샷(image1): 보고서/images/<month>.jpg 로 교체
- 활동 사진(image2): 달마다 다르므로 "사진 첨부" 자리 그림으로 교체 → 한글에서 그림 바꾸기
- 바꾼 문단의 줄 배치 캐시(linesegarray)는 지워 한글이 열 때 다시 계산하게 한다.
"""
import json
import os
import re
import subprocess
import sys
import zipfile
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPORT = os.path.normpath(os.path.join(HERE, '..', '..', '보고서'))
DEFAULT_TEMPLATE = os.path.join(os.path.expanduser('~'), 'Desktop', 'Univ', 'labs', '슈퍼컴퓨팅센터', 'AX프로그램',
                                '2026년 9월 활동보고서', '2026학년도 AX 기반 역량 강화 팀 프로젝트 관련 서식 - 별지1_2.hwpx')

# 틀(9월본)의 문단·글자 모양 번호
P_HEAD, P_BULLET, P_PARA = 32, 33, 34
C_HEAD, C_TAB, C_TEXT, C_RED = 30, 31, 32, 33
TAB_RUN = f'<hp:run charPrIDRef="{C_TAB}"><hp:t><hp:tab width="2868" leader="0" type="1"/></hp:t></hp:run>'


def load_content():
    out = subprocess.run(['node', '-e', "process.stdout.write(JSON.stringify(require(process.argv[1])))",
                          os.path.join(HERE, 'content.js')], capture_output=True, check=True)
    return json.loads(out.stdout.decode('utf-8'))


def runs(text, base=C_TEXT):
    """【…】 조각은 빨간 글자로"""
    parts = [p for p in re.split(r'(【[^】]*】)', text) if p]
    return ''.join(f'<hp:run charPrIDRef="{C_RED if p.startswith("【") else base}"><hp:t>{escape(p)}</hp:t></hp:run>'
                   for p in parts)


def para(ppr, inner, style=24):
    return (f'<hp:p id="2147483648" paraPrIDRef="{ppr}" styleIDRef="{style}" pageBreak="0" columnBreak="0" merged="0">'
            f'{inner}</hp:p>')


def team_paragraphs(items):
    out = []
    for it in items:
        if 'h' in it:
            out.append(para(P_HEAD, runs(it['h'], C_HEAD)))
        elif 'b' in it:
            out.append(para(P_BULLET, TAB_RUN + runs(it['b']), 25))
        else:
            out.append(para(P_PARA, runs(it['p'])))
    return ''.join(out)


def para_span(x, key, start=0):
    """key 가 들어 있는 <hp:p> 의 [시작, 끝) 위치"""
    i = x.index(key, start)
    s = x.rindex('<hp:p ', 0, i)
    return s, x.index('</hp:p>', i) + len('</hp:p>')


def set_para_text(x, key, text, start=0):
    """key 가 든 문단의 글자를 text 로 (첫 글자 모양 유지, 줄 배치 캐시 제거)"""
    s, e = para_span(x, key, start)
    p = x[s:e]
    head = p[:p.index('>') + 1]
    cpr = re.search(r'<hp:run charPrIDRef="(\d+)"', p).group(1)
    return x[:s] + head + runs(text, int(cpr)) + '</hp:p>' + x[e:], s


def placeholder(path, size):
    im = Image.new('RGB', size, (242, 244, 247))
    d = ImageDraw.Draw(im)
    d.rectangle([8, 8, size[0] - 9, size[1] - 9], outline=(180, 186, 196), width=6)
    font = ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf', size[0] // 18)
    small = ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', size[0] // 32)
    for txt, f, y in (('활동 사진 첨부', font, 0.42), ('그림 선택 → 오른쪽 클릭 → 그림 바꾸기', small, 0.56)):
        w = d.textlength(txt, font=f)
        d.text(((size[0] - w) / 2, size[1] * y), txt, fill=(120, 128, 140), font=f)
    im.save(path, format='BMP')


def build(month_key, template):
    content = load_content()
    m = next(mm for mm in content['MONTHS'] if mm['key'] == month_key)
    team = content['TEAM']
    mm = f"{int(m['month']):02d}"

    zin = zipfile.ZipFile(template)
    x = zin.read('Contents/section0.xml').decode('utf-8')
    old_mm = re.search(r'활동보고서 \((\d\d)월\)', x).group(1)
    x = x.replace(f'활동보고서 ({old_mm}월)', f'활동보고서 ({mm}월)')

    # 프로젝트 진행률
    x, _ = set_para_text(x, '(전체', f"{m['progress']}  ({m['progressNote']})")

    # 팀 활동 내용: '■ 활동 내용 및 결과' ~ 스크린샷 문단 직전까지 다시 만든다
    s, _ = para_span(x, '■ 활동 내용 및 결과')
    pic_s, _ = para_span(x, 'binaryItemIDRef="image1"')
    x = x[:s] + team_paragraphs(m['team']) + x[pic_s:]
    x, _ = set_para_text(x, '▲ ', '▲ ' + m['imageCaption'])

    # 활동 사진 일자
    x = re.sub(r'일자: \d{4}년 \d\d월 [^<]*', 'DATE_SLOT', x)
    x = x.replace('<hp:t>DATE_SLOT</hp:t>', '<hp:t>' + escape('일자: ' + m['photoDate']) + '</hp:t>')

    # 개인 활동 내용: '담당:' 문단 + 뒤이은 글머리 문단들 (칸 끝까지)
    pos = 0
    for member in team['members']:
        i = x.index(f'>{member["name"]}<', pos)
        s, e = para_span(x, '담당:', i)
        cell_end = x.index('</hp:subList>', e)
        bullets = re.findall(r'<hp:p [^>]*>', x[e:cell_end])
        # 글머리 모양: 칸 안 첫 글머리 문단의 것 (9월본 김승현 셋째 줄처럼 모양이 풀린 줄도 맞춘다)
        head = bullets[0] if bullets else f'<hp:p id="2147483648" paraPrIDRef="{P_BULLET}" styleIDRef="25" pageBreak="0" columnBreak="0" merged="0">'
        ptxt = f"담당: {member['role']} · 기간: {m['weeks']}"
        new = para(P_PARA, runs(ptxt, 35)) + ''.join(
            head + runs(' ' + it.get('b', it.get('p', ''))) + '</hp:p>' for it in m['personal'][member['name']])
        x = x[:s] + new + x[cell_end:]
        pos = s + len(new)

    out = os.path.join(REPORT, f'{month_key}_활동보고서_GUMAP.hwpx')
    shot = os.path.join(REPORT, 'images', m['image'])
    tmp_photo = os.path.join(REPORT, '_photo_slot.bmp')
    placeholder(tmp_photo, (1400, 1050))
    prv = f"AX 기반 역량 강화 프로젝트 팀 활동보고서 ({mm}월)\r\n<팀명><{team['name']}>\r\n"

    with zipfile.ZipFile(out, 'w') as zout:
        for info in zin.infolist():
            name = info.filename
            if name == 'Contents/section0.xml':
                data = x.encode('utf-8')
            elif name == 'BinData/image1.jpg':
                data = open(shot, 'rb').read()
            elif name == 'BinData/image2.bmp':
                data = open(tmp_photo, 'rb').read()
            elif name == 'Preview/PrvText.txt':
                data = prv.encode('utf-8')
            else:
                data = zin.read(name)
            # mimetype 은 압축하지 않고 맨 앞에 (hwpx/odf 규칙)
            ct = zipfile.ZIP_STORED if name == 'mimetype' else zipfile.ZIP_DEFLATED
            zout.writestr(zipfile.ZipInfo(name, date_time=info.date_time), data, compress_type=ct)
    os.remove(tmp_photo)
    return out


if __name__ == '__main__':
    key = sys.argv[1] if len(sys.argv) > 1 else '2026-10'
    print('saved', build(key, sys.argv[2] if len(sys.argv) > 2 else DEFAULT_TEMPLATE))
