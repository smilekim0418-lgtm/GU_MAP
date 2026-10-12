# -*- coding: utf-8 -*-
"""12~13주차 — 신규 건물 파이프라인 결과를 앱(report-campus.js)이 읽는 데이터로 내보낸다.

좌표 정합이 '검수'로 떨어진 층(층 정렬 실패)은 지도에 올리지 않고 목록만 남긴다.
또 12주차 화면용 요약(pipeline.json)과 사진·초안 이미지를 주차 폴더로 복사한다.

실행: python GUMAP_report/_tools/ax/export_campus.py
"""
import io
import json
import shutil

from common import REPORT, WEEK_DIR, WORK, load_json, save_json

BUILDINGS = ['digital', 'global']
R = 7


def rnd(p):
    return [round(p[1], R), round(p[0], R)]       # [lon,lat] → [lat,lon]


def main():
    base = load_json(WEEK_DIR[9] / 'baseline.json')
    per_elem_s = base['total']['estimated_minutes'] * 60 / base['total']['elements']
    out = {'generated': '2026-12', 'buildings': []}
    summary = {'baseline_seconds_per_element': round(per_elem_s, 2), 'buildings': []}
    for bid in BUILDINGS:
        d = load_json(WORK / 'newbuilding' / f'{bid}.json')
        floors, rows = [], []
        for fl in d['floors']:
            shown = fl['georef']['route'] != 'review'
            units = [{'k': u['kind'], 'l': u['label'], 'c': u['conf'], 'r': u['route'],
                      'why': u['reasons'], 'g': [rnd(p) for p in u['ring']]}
                     for u in fl['units'] if u['kind'] in ('room', 'service', 'corridor')]
            if shown:
                floors.append({'floor': fl['floor'], 'units': units,
                               'stairs': [[rnd(p) for p in s['ring']] for s in fl['stairs_list']],
                               'doors': [{'p': rnd(x['at']), 'e': x['estimated']} for x in fl['doors_list']],
                               'exits': [rnd(e['at']) for e in fl['exits_list']],
                               'georef': fl['georef']})
            t = fl['timings']
            doors_est, doors_det = fl['doors_estimated'], fl['doors_detected']
            elements = fl['rooms'] + fl['services'] + doors_est + doors_det + fl['stairs']
            # 검수 시간 (9주차와 같은 표준시간 체계): 검수 방 10초, 추정 문 확인 6초, 검출 문 2초, 계단 층간 15초
            review_s = fl['rooms_review'] * 10 + doors_est * 6 + doors_det * 2 + fl['stairs'] * 15
            if fl['georef']['route'] == 'manual' and fl['floor'] == fl['georef'].get('reference_floor'):
                review_s += fl['georef']['control_points'] * 20
            if fl['georef']['route'] == 'review':
                review_s += 5 * 20          # 기준점 다시 찍기
            rows.append({'floor': fl['floor'], 'source': fl['source'], 'shown': shown, 'rooms': fl['rooms'], 'auto': fl['rooms_auto'],
                         'review': fl['rooms_review'], 'services': fl['services'], 'unlabeled': fl['unlabeled'],
                         'stairs': fl['stairs'], 'exits': fl['exits'], 'doors_detected': doors_det,
                         'doors_estimated': doors_est, 'georef': fl['georef'],
                         'pipeline_s': round(sum(t.values()), 1), 'review_s': review_s,
                         'manual_est_s': round(elements * per_elem_s, 1)})
            # 이미지
            for kind in ('photo', 'rectified', 'draft'):
                src = WORK / 'newbuilding' / f"{bid}_{fl['floor']}_{kind}.jpg"
                if src.exists():
                    dst = WEEK_DIR[12] / 'assets' / src.name
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(src, dst)
        outline = d['osm_outline']
        lat = sum(p[1] for p in outline) / len(outline)
        lon = sum(p[0] for p in outline) / len(outline)
        out['buildings'].append({'id': bid, 'name': d['name'], 'center': [lat, lon],
                                 'osm': [[p[1], p[0]] for p in outline], 'floors': floors,
                                 'hidden_floors': [r['floor'] for r in rows if not r['shown']]})
        tot = {k: sum(r[k] for r in rows) for k in ('rooms', 'auto', 'review', 'doors_detected', 'doors_estimated',
                                                     'pipeline_s', 'review_s', 'manual_est_s')}
        summary['buildings'].append({'id': bid, 'name': d['name'], 'floors': rows, 'total': tot,
                                     'model': d['model'], 'pipeline_seconds': d['pipeline_seconds']})
        print(bid, tot)
    io.open(REPORT / '_app' / 'report-campus-data.js', 'w', encoding='utf-8', newline='\n').write(
        '/* 12~13주차 신규 건물 실내지도 (AI 초안) — _tools/ax/export_campus.py 가 만든다 */\n'
        'window.GUMAP_CAMPUS_DATA = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
    save_json(WEEK_DIR[12] / 'pipeline.json', summary)


if __name__ == '__main__':
    main()
