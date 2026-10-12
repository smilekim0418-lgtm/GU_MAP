# -*- coding: utf-8 -*-
"""주차별 GUMAP 앱 스냅샷 HTML 을 만든다.

_app/template.html (루트 index.html 을 얼린 사본) 을 읽어 주차마다
  - <base href="/"> 를 넣어 데이터·API·아이콘은 루트에서 그대로 쓰고
  - GUMAP-프론트/ 경로는 얼린 사본(_app/GUMAP-프론트/)으로 돌리고
  - window.GUMAP_WEEK 와 주차 게이트(report-stage.*)·데모 장면(report-scenes.js)을 붙인다.

실행:  python GUMAP_report/_tools/build_weeks.py
"""
import io
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
REPORT = os.path.dirname(HERE)
TEMPLATE = os.path.join(REPORT, '_app', 'template.html')

# 주차 → (폴더, 앱 스냅샷 파일 이름). 산출물 페이지가 따로 있는 주차는 앱을
# GUMAP.html 로 두고 index.html 은 산출물 페이지가 차지한다.
WEEKS = {
    1:  ('01주차_개발환경',          'index.html'),
    2:  ('02주차_요구사항_아키텍처',  'GUMAP.html'),
    3:  ('03주차_도면추출',          'GUMAP.html'),
    4:  ('04주차_좌표정합',          'GUMAP.html'),
    5:  ('05주차_IMDF변환',          'index.html'),
    6:  ('06주차_실내길찾기',        'index.html'),
    7:  ('07주차_실내외통합',        'index.html'),
    8:  ('08주차_실내지도완성',      'index.html'),
    9:  ('09주차_자동화기준선',      'GUMAP.html'),
    10: ('10주차_도면인식모델',      'GUMAP.html'),
    11: ('11주차_자동라벨링',        'GUMAP.html'),
    12: ('12주차_신규건물',          'index.html'),
    13: ('13주차_캠퍼스경로망',      'index.html'),
    14: ('14주차_대중교통통합',      'index.html'),
    15: ('15주차_자연어안내',        'index.html'),
}

APP = 'GUMAP_report/_app/'


def build(week, template):
    html = template
    # 1) 문서 기준을 루트로. 데이터·아이콘·API·3d-viewer.html 이 전부 루트 기준이다.
    html = html.replace('<meta charset="utf-8">',
                        '<meta charset="utf-8">\n    <base href="/">', 1)
    # 2) 프론트 코드는 얼린 사본으로
    html = re.sub(r'(src|href)="GUMAP-프론트/', r'\1="' + APP + 'GUMAP-프론트/', html)
    # 3) 주차 게이트는 다른 스크립트보다 먼저
    head = ('    <!-- [REPORT] 활동보고서용 ' + str(week) + '주차 스냅샷 -->\n'
            '    <link rel="stylesheet" href="' + APP + 'report-stage.css">\n'
            '    <script>window.GUMAP_WEEK = ' + str(week) + ';</script>\n'
            '    <script src="' + APP + 'report-stage.js"></script>\n'
            '</head>')
    html = html.replace('</head>', head, 1)
    # 4) 12주차부터는 신규 건물 실내지도, 그 다음 데모 장면
    tail = ''
    if week >= 12:
        tail += '    <script src="' + APP + 'report-campus-data.js" defer></script>\n'
        if week >= 13:
            tail += '    <script src="' + APP + 'report-campus-graph.js" defer></script>\n'
        tail += '    <script src="' + APP + 'report-campus.js" defer></script>\n'
    tail += '    <script src="' + APP + 'report-scenes.js" defer></script>\n</body>'
    idx = html.rfind('</body>')
    html = html[:idx] + tail + html[idx + len('</body>'):]
    return html


def main():
    template = io.open(TEMPLATE, encoding='utf-8').read()
    for week, (folder, name) in sorted(WEEKS.items()):
        out_dir = os.path.join(REPORT, folder)
        os.makedirs(out_dir, exist_ok=True)
        out = os.path.join(out_dir, name)
        io.open(out, 'w', encoding='utf-8', newline='\n').write(build(week, template))
        print('%2d주차 → %s/%s' % (week, folder, name))


if __name__ == '__main__':
    main()
