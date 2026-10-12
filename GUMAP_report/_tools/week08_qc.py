# -*- coding: utf-8 -*-
"""8주차 산출물 — 테크노관 실내지도 완성본 품질 검수 지표.

실제 산출물에서 숫자를 모은다.
  - IMDF 번들 피처 수, IMDF 검증기(work/validation.json) 경고 분류
  - 공식 CAD(DWG) 대조 보고서(cad/output/quality_report.json)
  - 경로망 메타(노드·엣지·출입구), 360 로드뷰 지점 수
  - floorplan 자동 테스트(pytest) 결과

실행: python GUMAP_report/_tools/week08_qc.py
"""
import io
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FP = ROOT / 'GUMAP-개발' / 'floorplan'
MAP = ROOT / 'GUMAP-프론트' / 'js' / 'map'
OUT = ROOT / 'GUMAP_report' / '08주차_실내지도완성' / 'qc.json'
sys.stdout.reconfigure(encoding='utf-8')


def js_json(path):
    s = io.open(path, encoding='utf-8').read()
    return json.loads(s[s.index('{'):s.rindex('}') + 1])


def main():
    imdf = js_json(MAP / 'map-techno-imdf-data.js')
    nav = js_json(MAP / 'map-techno-nav-data.js')
    pano = js_json(MAP / 'map-techno-pano-data.js')
    validation = json.load(open(FP / 'work' / 'validation.json', encoding='utf-8'))
    cad = json.load(open(FP / 'cad' / 'output' / 'quality_report.json', encoding='utf-8'))
    cad_verify = json.load(open(FP / 'cad' / 'output' / 'verification.json', encoding='utf-8'))

    level = {l['id']: l['properties']['short_name']['ko-KR'] for l in imdf['levels']['features']}
    units_by_floor = Counter(level[u['properties']['level_id']] for u in imdf['units']['features'])

    run = subprocess.run([sys.executable, '-m', 'pytest', 'tests', '-q', '-p', 'no:cacheprovider',
                          '--ignore-glob=tests/browser_*'], cwd=FP, capture_output=True, text=True,
                         encoding='utf-8', errors='replace')
    m = re.search(r'(\d+) passed', run.stdout)
    f = re.search(r'(\d+) failed', run.stdout)

    labels = {'outside_extent': '도면 범위 밖 꼭짓점', 'area_out_of_range': '면적 이상치',
              'overlap': '공간 겹침', 'missing_geometry': '대장에만 있는 방(도형 없음)',
              'vertical_misalignment': '층간 수직동선 불일치'}
    by_code = Counter(v['code'] for v in validation)
    out = {
        'imdf': {k: len(v['features']) for k, v in imdf.items() if isinstance(v, dict) and 'features' in v},
        'units_by_floor': units_by_floor,
        'nav': nav['meta']['counts'],
        'cost': nav['meta']['cost'],
        'pano': {f['floor']: len(f['nodes']) for f in pano['floors']},
        'validation': {
            'errors': sum(1 for v in validation if v['severity'] == 'error'),
            'warnings': sum(1 for v in validation if v['severity'] == 'warning'),
            'by_code': [{'code': c, 'label': labels.get(c, c), 'n': n} for c, n in by_code.most_common()],
            'vertical': [v['message'] for v in validation if v['code'] == 'vertical_misalignment'],
        },
        'cad': [{'floor': fl, 'room_labels': v['room_labels'], 'door_arcs': v['door_arc_candidates'],
                 'matched': v['alignment']['matched_labels'],
                 'median_residual_m': v['alignment']['median_label_residual_m'],
                 'cad_only': v['cad_only_ids'], 'legacy_only': v['legacy_only_ids'],
                 'objects': v['paths']} for fl, v in cad['floors'].items()],
        'cad_checks': cad_verify['checks'],
        'access_via': [{'floor': '2F', 'room': '212-1', 'via': '212'},
                       {'floor': '2F', 'room': '212-2', 'via': '212'},
                       {'floor': '2F', 'room': '262', 'via': '263'}],
        'tests': {'passed': int(m.group(1)) if m else 0, 'failed': int(f.group(1)) if f else 0},
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print(json.dumps({k: out[k] for k in ('imdf', 'nav', 'tests')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
