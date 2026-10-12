# -*- coding: utf-8 -*-
"""9주차 — 자동화 기준선: 기존 파이프라인이 자동으로 해 준 몫과 사람이 고친 몫.

자동 결과 = 01_extract 폴리곤(work/*_polygons.json) + Windows OCR 방번호 배정(fp.labels)
최종 결과 = 사람이 편집기로 고친 work/*_labeled.json

최종 방마다 가장 많이 겹치는 자동 폴리곤을 찾아(IoU) 네 가지로 나눈다.
  자동 완료   IoU ≥ 0.7 이고 방번호까지 맞음 → 사람 손이 안 감
  라벨 수정   도형은 맞는데(IoU ≥ 0.7) 번호가 없거나 틀림
  도형 수정   0.3 ≤ IoU < 0.7
  새로 그림   IoU < 0.3
그 밖에 어느 최종 요소와도 안 겹친 자동 폴리곤은 '오검출 삭제', 문·복도·계단·EV 는
기존 파이프라인이 만들지 못하므로 전부 수작업이다.

소요시간은 행동별 표준 작업시간(아래 UNIT_SECONDS, 가정값)을 곱한 추정치다.
실제 조작 수(counts)가 1차 지표이고, 시간은 비교를 위한 환산값이다.

실행: python GUMAP_report/_tools/ax/baseline.py
"""
import time
from collections import Counter

from shapely.geometry import Polygon
from shapely.strtree import STRtree

from common import FLOORS, WEEK_DIR, WORK, auto_polygons, is_room, labeled, load_json, save_json
from fp import excel, labels, rooms
from fp.ocr import OcrWord

# 행동별 표준 작업시간(초) — 편집기 조작 기준 가정값. 화면에 그대로 표시한다.
UNIT_SECONDS = {
    'redraw': 45,        # 방 폴리곤 새로 그리기 + 번호 입력
    'reshape': 25,       # 꼭짓점 고치기 + 번호 확인
    'relabel': 10,       # 번호 입력·수정
    'delete': 3,         # 오검출 삭제
    'typed_space': 30,   # 복도·계단·EV 그리기/유형 지정
    'door': 12,          # 문 그리기 + 연결(connects) 지정
    'vertical': 15,      # 계단·EV 층간 연결 입력
}
ACTION_NAME = {
    'auto': '자동 완료', 'relabel': '라벨 수정', 'reshape': '도형 수정', 'redraw': '새로 그림',
    'delete': '오검출 삭제', 'typed_space': '복도·계단·EV', 'door': '출입문', 'vertical': '층간 연결',
}


INSET_PX = 12


def poly(points):
    # 복도처럼 구멍(중정)이 있는 도형은 [[외곽], [구멍], ...] 링 목록으로 저장돼 있다
    if points and isinstance(points[0][0], (list, tuple)):
        p = Polygon(points[0], holes=points[1:])
    else:
        p = Polygon(points)
    return p if p.is_valid else p.buffer(0)


def main():
    register = excel.load_rooms()
    result = {'unit_seconds': UNIT_SECONDS, 'action_name': ACTION_NAME, 'floors': []}
    t_all = time.perf_counter()
    for floor in FLOORS:
        final = labeled(floor)['polygons']
        auto_raw = auto_polygons(floor)['polygons']
        words = [OcrWord(**w) for w in load_json(WORK / 'ocr' / f'{floor}.json')['words']]
        expected = {r.room_id for r in register[floor]}
        auto_labeled, report = labels.assign_labels(
            [rooms.RoomPolygon(points=[tuple(p) for p in a['points']], area_px=a['area_px'],
                               centroid=tuple(a['centroid'])) for a in auto_raw],
            words, expected)

        # 01_extract 는 문 틈을 메우려고 벽을 25px 팽창시키므로 자동 폴리곤은 사방으로
        # 약 12px 작다. 편집기의 '전체 직사각형화' 한 번으로 풀리는 체계적 차이라
        # 방마다의 수작업으로 세지 않도록 먼저 되돌려 비교한다.
        auto_geoms = [poly(a.polygon.points).buffer(INSET_PX, join_style='mitre') for a in auto_labeled]
        tree = STRtree(auto_geoms)
        used_auto = set()
        counts = Counter()
        rooms_detail = []

        final_rooms = [p for p in final if is_room(p)]
        for fr in final_rooms:
            g = poly(fr['points'])
            best, best_iou = None, 0.0
            for idx in tree.query(g):
                a = auto_geoms[idx]
                inter = g.intersection(a).area
                if inter <= 0:
                    continue
                iou = inter / g.union(a).area
                if iou > best_iou:
                    best, best_iou = idx, iou
            label = auto_labeled[best].room_id if best is not None else None
            if best is not None and best_iou >= 0.3:
                used_auto.add(best)
            if best_iou >= 0.7:
                action = 'auto' if label == fr['room_id'] else 'relabel'
            elif best_iou >= 0.3:
                action = 'reshape'
            else:
                action = 'redraw'
            counts[action] += 1
            rooms_detail.append({'room_id': fr['room_id'], 'iou': round(best_iou, 3),
                                 'auto_label': label, 'action': action})

        # 다른 최종 요소(복도·계단 등)와 겹치는 자동 폴리곤은 삭제로 치지 않는다
        others = [poly(p['points']) for p in final if not is_room(p) and p.get('type') != 'door']
        for i, a in enumerate(auto_geoms):
            if i in used_auto:
                continue
            if any(a.intersection(o).area / max(a.area, 1) > 0.5 for o in others):
                continue
            counts['delete'] += 1

        typed = [p for p in final if p.get('type') in ('corridor', 'stairs', 'elevator')]
        counts['typed_space'] = len(typed)
        counts['door'] = sum(1 for p in final if p.get('type') == 'door')
        counts['vertical'] = sum(1 for p in final if p.get('connects_floors'))

        manual = {k: v for k, v in counts.items() if k != 'auto'}
        seconds = sum(UNIT_SECONDS[k] * v for k, v in manual.items())
        total_elements = len(final_rooms) + len(typed) + counts['door']
        found_ids = {p['room_id'] for p in final_rooms}
        result['floors'].append({
            'floor': floor,
            'final_rooms': len(final_rooms),
            'register_rooms': len(expected),
            'register_missing_in_map': sorted(expected - found_ids),
            'auto_polygons': len(auto_raw),
            'ocr_words': len(words),
            'ocr_matched': len(report.matched),
            'counts': dict(counts),
            'manual_actions': sum(manual.values()),
            'total_elements': total_elements,
            'auto_share': round(counts['auto'] / total_elements, 4) if total_elements else 0,
            'estimated_minutes': round(seconds / 60, 1),
            'rooms': rooms_detail,
        })
        print(f"{floor}: 방 {len(final_rooms)} · 자동완료 {counts['auto']} · 라벨 {counts['relabel']} · "
              f"도형 {counts['reshape']} · 새로 {counts['redraw']} · 삭제 {counts['delete']} · 문 {counts['door']} · "
              f"약 {seconds/60:.0f}분")

    tot = Counter()
    for f in result['floors']:
        tot.update(f['counts'])
    manual_total = sum(v for k, v in tot.items() if k != 'auto')
    elements = sum(f['total_elements'] for f in result['floors'])
    result['total'] = {
        'counts': dict(tot),
        'manual_actions': manual_total,
        'elements': elements,
        'auto_share': round(tot['auto'] / elements, 4),
        'manual_share': round(1 - tot['auto'] / elements, 4),
        'estimated_minutes': round(sum(f['estimated_minutes'] for f in result['floors']), 1),
        'rooms': sum(f['final_rooms'] for f in result['floors']),
        'room_auto_share': round(tot['auto'] / sum(f['final_rooms'] for f in result['floors']), 4),
        'pipeline_seconds': round(time.perf_counter() - t_all, 1),
    }
    save_json(WEEK_DIR[9] / 'baseline.json', result)
    print('합계', result['total'])


if __name__ == '__main__':
    main()
