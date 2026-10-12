# -*- coding: utf-8 -*-
"""13주차 — 캠퍼스 전역 경로망 병합.

  테크노관 실내 경로망(사람이 검수한 1단계 산출물, 도면 픽셀 → 위경도 변환)
+ 신규 건물 실내 경로망(12주차 자동 파이프라인: 복도 격자 + 계단 층간 연결)
+ 건물 간 실외 보행 연결(비상구·출입구 사이를 OSM 보행 도로망(OSRM foot)으로 실측)
= 하나의 그래프. 가중치는 초(보행 1.2 m/s · 계단 층당 20 s · EV 대기 25 s + 층당 6 s).

산출물
  13주차_캠퍼스경로망/campus_graph.json   통계 + 화면용 선형
  _app/report-campus-graph.js           앱(13주차~)이 브라우저에서 길을 찾는 압축 그래프
  13주차_캠퍼스경로망/demo_route.json      예시 경로 (디지털관 → 테크노관)

실행: python GUMAP_report/_tools/ax/campus_graph.py
"""
import heapq
import io
import json
import math
import time
import urllib.request

from common import REPORT, ROOT, WEEK_DIR, WORK, load_json, save_json
from fp import georef

WALK = 1.2
STAIR_S = 20.0
EV_WAIT, EV_PER = 25.0, 6.0
FLOOR_ORDER = ['B1F', '1F', '2F', '3F', '4F', '5F', '6F']
M_LAT = 110540.0


def m_lon(lat):
    return 111320.0 * math.cos(math.radians(lat))


def dist_m(a, b):
    lat = (a[0] + b[0]) / 2
    return math.hypot((a[0] - b[0]) * M_LAT, (a[1] - b[1]) * m_lon(lat))


def js_json(path):
    s = io.open(path, encoding='utf-8').read()
    return json.loads(s[s.index('{'):s.rindex('}') + 1])


class Graph:
    def __init__(self):
        self.nodes = []      # {lat, lon, b, f, k}
        self.adj = []
        self.edges = []
        self.geom = {}       # 실외 간선의 실제 보행 선형

    def add(self, lat, lon, b, f, k='walk'):
        self.nodes.append({'lat': lat, 'lon': lon, 'b': b, 'f': f, 'k': k})
        self.adj.append([])
        return len(self.nodes) - 1

    def link(self, a, b, seconds, meters, mode):
        self.adj[a].append((b, seconds, meters, mode))
        self.adj[b].append((a, seconds, meters, mode))
        self.edges.append((a, b, round(seconds, 2), round(meters, 2), mode))

    def dijkstra(self, sources, targets):
        best = {s: 0.0 for s in sources}
        prev = {}
        heap = [(0.0, s) for s in sources]
        heapq.heapify(heap)
        tset = set(targets)
        while heap:
            c, u = heapq.heappop(heap)
            if c > best.get(u, 1e18):
                continue
            if u in tset:
                path = [u]
                while path[-1] in prev:
                    path.append(prev[path[-1]][0])
                return c, path[::-1], prev
            for v, s, m, mode in self.adj[u]:
                nc = c + s
                if nc < best.get(v, 1e18):
                    best[v] = nc
                    prev[v] = (u, mode, m)
                    heapq.heappush(heap, (nc, v))
        return None, None, None


def add_techno(g):
    nav = js_json(ROOT / 'GUMAP-프론트' / 'js' / 'map' / 'map-techno-nav-data.js')
    geo = nav['geo']
    tf = georef.Transform(**geo['transform'])
    base = len(g.nodes)
    for n in nav['nodes']:
        (xm, ym), = georef.pixels_to_meters([(n['x'], n['y'])], tuple(geo['floor_origin_px'][n['f']]),
                                            geo['floor_px_per_mm'][n['f']])
        lon, lat = georef.apply(tf, xm, ym)
        g.add(lat, lon, 'techno', n['f'], n['k'])
    fi = {f: i for i, f in enumerate(FLOOR_ORDER)}
    for a, b, meters, mode in nav['edges']:
        na, nb = nav['nodes'][a], nav['nodes'][b]
        gap = abs(fi[na['f']] - fi[nb['f']])
        if mode == 'stair':
            sec = STAIR_S * gap
        elif mode == 'elevator':
            sec = EV_WAIT + EV_PER * gap
        else:
            sec = meters / WALK
        g.link(base + a, base + b, sec, meters, mode)
    rooms = {}
    for key, doors in nav['doors_by_room'].items():
        corridor = [d for d in doors if '복도' in (nav['nodes'][d].get('c') or [])]
        if corridor:
            rooms[key] = [base + d for d in corridor]
    for key, e in nav['entries_by_room'].items():
        rooms.setdefault(key, [base + e])
    entrances = [{'node': base + e['node'], 'name': e['name'], 'floor': e['floor'], 'lat': e['lat'], 'lon': e['lon']}
                 for e in nav['entrances']]
    return {'rooms': rooms, 'entrances': entrances, 'nodes': len(nav['nodes']), 'edges': len(nav['edges'])}


def add_newbuilding(g, bid):
    data = load_json(WORK / 'newbuilding' / f'{bid}.json')
    rooms, stairs_by_floor, exits = {}, {}, []
    corridor_nodes, stair_points = {}, []
    n_nodes = n_edges = 0
    floors_used = []
    for fl in data['floors']:
        if fl['georef']['route'] == 'review':
            continue          # 층 정렬 실패 층은 경로망에 넣지 않는다 (검수 대상)
        floors_used.append(fl['floor'])
        nav = fl['nav']
        base = len(g.nodes)
        for lat, lon in nav['nodes']:
            g.add(lat, lon, bid, fl['floor'])
        for a, b, m in nav['edges']:
            g.link(base + a, base + b, m / WALK, m, 'walk')
        n_nodes += len(nav['nodes'])
        n_edges += len(nav['edges'])
        for label, n in nav['rooms'].items():
            if label and not label.startswith('#'):
                rooms.setdefault(f"{fl['floor']}|{label}", []).append(base + n)
        attached = set(nav['rooms'].values()) | set(nav['stairs']) | set(nav['exits'])
        corridor_nodes[fl['floor']] = [base + i for i in range(len(nav['nodes'])) if i not in attached]
        for st in fl['stairs_list']:
            stair_points.append((st['centroid'][1], st['centroid'][0], fl['floor']))
        for ex in fl['exits_list']:        # 피난안내도의 비상구 표지는 계단실 앞에 있다 → 계단실 증거로 함께 쓴다
            stair_points.append((ex['at'][1], ex['at'][0], fl['floor']))
        if fl['floor'] in ('1F', 'B1F'):
            exits += [base + n for n in nav['exits']]
    # 층간: 계단은 모든 층에서 같은 자리에 있다. 사진마다 검출이 들쭉날쭉하므로
    # 전 층 검출을 10 m 안끼리 묶어 '계단실'로 보고, 층마다 그 자리의 가장 가까운 복도 점에 붙여 잇는다.
    shafts = []
    for lat, lon, f in stair_points:
        for sh in shafts:
            if dist_m((lat, lon), sh['c']) < 12:
                sh['pts'].append((lat, lon)); sh['floors'].add(f)
                sh['c'] = (sum(p[0] for p in sh['pts']) / len(sh['pts']), sum(p[1] for p in sh['pts']) / len(sh['pts']))
                break
        else:
            shafts.append({'c': (lat, lon), 'pts': [(lat, lon)], 'floors': {f}})
    shafts = [sh for sh in shafts if len(sh['floors']) >= 2]     # 두 층 이상에서 보인 것만 계단실로 인정
    vertical = 0
    for sh in shafts:
        at = {}
        for f, nodes in corridor_nodes.items():
            if not nodes:
                continue
            k = min(nodes, key=lambda n: dist_m(sh['c'], (g.nodes[n]['lat'], g.nodes[n]['lon'])))
            if dist_m(sh['c'], (g.nodes[k]['lat'], g.nodes[k]['lon'])) < 20:
                at[f] = k
        # 붙은 층끼리 아래에서 위로 잇는다. 사이 층이 빠져 있으면 층 수만큼 시간을 준다.
        present = [f for f in FLOOR_ORDER if f in at]
        for lo, hi in zip(present, present[1:]):
            gap = FLOOR_ORDER.index(hi) - FLOOR_ORDER.index(lo)
            g.link(at[lo], at[hi], STAIR_S * gap, 4.0 * gap, 'stair')
            vertical += 1
    return {'rooms': rooms, 'exits': exits, 'nodes': n_nodes, 'edges': n_edges, 'vertical_links': vertical,
            'floors': floors_used, 'name': data['name'], 'stair_shafts': len(shafts)}


def osrm(a, b, cache):
    key = f'{a[0]:.6f},{a[1]:.6f}>{b[0]:.6f},{b[1]:.6f}'
    if key in cache:
        return cache[key]
    url = ('https://routing.openstreetmap.de/routed-foot/route/v1/foot/'
           f'{a[1]},{a[0]};{b[1]},{b[0]}?overview=full&geometries=geojson')
    req = urllib.request.Request(url, headers={'User-Agent': 'GUMAP-student-project/1.0'})
    for attempt in range(3):
        try:
            d = json.loads(urllib.request.urlopen(req, timeout=30).read())
            r = d['routes'][0]
            cache[key] = {'distance': r['distance'], 'coords': [[c[1], c[0]] for c in r['geometry']['coordinates']]}
            time.sleep(1.0)
            return cache[key]
        except Exception as e:  # noqa: BLE001
            time.sleep(2 + attempt * 2)
    cache[key] = None
    return None


def link_outdoor(g, from_nodes, to_nodes, cache, per_from=2, max_from=4, tag=''):
    """from 쪽 출구 몇 개를 to 쪽 가장 가까운 출입구 몇 개와 실제 보행 경로로 잇는다."""
    links = []
    target_c = [(g.nodes[t]['lat'], g.nodes[t]['lon']) for t in to_nodes]
    # to 에 가까운 순으로 from 출구를 고른다
    cen = (sum(c[0] for c in target_c) / len(target_c), sum(c[1] for c in target_c) / len(target_c))
    ordered = sorted(from_nodes, key=lambda n: dist_m((g.nodes[n]['lat'], g.nodes[n]['lon']), cen))
    # 같은 자리 출구는 하나만
    picked = []
    for n in ordered:
        p = (g.nodes[n]['lat'], g.nodes[n]['lon'])
        if all(dist_m(p, (g.nodes[q]['lat'], g.nodes[q]['lon'])) > 8 for q in picked):
            picked.append(n)
        if len(picked) >= max_from:
            break
    for n in picked:
        p = (g.nodes[n]['lat'], g.nodes[n]['lon'])
        near = sorted(to_nodes, key=lambda t: dist_m(p, (g.nodes[t]['lat'], g.nodes[t]['lon'])))[:per_from]
        for t in near:
            q = (g.nodes[t]['lat'], g.nodes[t]['lon'])
            r = osrm(p, q, cache)
            if not r:
                continue
            coords = r['coords']
            prev = n
            total = 0.0
            chain = [p] + coords + [q]
            for c0, c1 in zip(chain, chain[1:]):
                seg = dist_m(c0, c1)
                total += seg
            # 선형은 화면용으로 따로 두고, 그래프에는 출구↔출입구 한 간선(실측 거리)으로 넣는다
            g.link(n, t, total / WALK, total, 'outdoor')
            g.geom[(n, t)] = chain
            g.geom[(t, n)] = chain[::-1]
            links.append({'from': n, 'to': t, 'meters': round(total, 1), 'coords': [[round(a, 7), round(b, 7)] for a, b in chain], 'tag': tag})
    return links


def describe(g, path, prev):
    """경로를 구간(건물·층·수단) 단위로 묶는다."""
    segs = []
    for i, n in enumerate(path):
        node = g.nodes[n]
        mode = prev[n][1] if i else 'start'
        meters = prev[n][2] if i else 0
        key = ('outdoor' if mode == 'outdoor' else node['b'], node['f'] if mode != 'outdoor' else '', mode if mode in ('stair', 'elevator', 'outdoor') else 'walk')
        if mode == 'outdoor':
            segs.append({'key': key, 'building': 'outdoor', 'floor': '', 'mode': 'outdoor',
                         'coords': [list(p) for p in g.geom.get((path[i - 1], n), [])], 'meters': meters})
            continue
        if segs and segs[-1]['key'] == key:
            segs[-1]['coords'].append([node['lat'], node['lon']])
            segs[-1]['meters'] += meters
        else:
            start = [g.nodes[path[i - 1]]['lat'], g.nodes[path[i - 1]]['lon']] if i else None
            segs.append({'key': key, 'building': key[0], 'floor': key[1], 'mode': key[2],
                         'coords': ([start] if start else []) + [[node['lat'], node['lon']]], 'meters': meters})
    for s in segs:
        s.pop('key')
        s['meters'] = round(s['meters'], 1)
    return segs


def main():
    g = Graph()
    techno = add_techno(g)
    builds = {bid: add_newbuilding(g, bid) for bid in ('digital', 'global')}
    cache_path = WORK / 'osm' / 'osrm_cache.json'
    cache = json.load(open(cache_path, encoding='utf-8')) if cache_path.exists() else {}
    t_entr = [e['node'] for e in techno['entrances']]
    links = []
    for bid, b in builds.items():
        if b['exits']:
            links += link_outdoor(g, b['exits'], t_entr, cache, tag=f'{bid}→techno')
    if builds['digital']['exits'] and builds['global']['exits']:
        links += link_outdoor(g, builds['digital']['exits'], builds['global']['exits'], cache, per_from=1, max_from=2,
                              tag='digital→global')
    json.dump(cache, open(cache_path, 'w', encoding='utf-8'))

    # 예시 경로: 디지털관 1F 방 → 테크노관 3F 302
    demo = None
    src_key = next((k for k in ('1F|101', '1F|102', '1F|110') if k in builds['digital']['rooms']), None)
    if src_key and '3F|302' in techno['rooms']:
        cost, path, prev = g.dijkstra(builds['digital']['rooms'][src_key], techno['rooms']['3F|302'])
        if path:
            segs = describe(g, path, prev)
            demo = {'from': {'building': '디지털관', 'room': src_key}, 'to': {'building': '테크노관', 'room': '3F|302'},
                    'seconds': round(cost, 1), 'meters': round(sum(s['meters'] for s in segs), 1), 'segments': segs}
            print('demo', demo['meters'], 'm', demo['seconds'], 's', [(s['building'], s['floor'], s['mode'], s['meters']) for s in segs])

    # 연결성: 테크노관 출입구 하나에서 닿는 신규 건물 방의 비율
    reach = {}
    if t_entr:
        best = {t_entr[0]: 0.0}
        heap = [(0.0, t_entr[0])]
        while heap:
            c, u = heapq.heappop(heap)
            if c > best[u]:
                continue
            for v, s, m, mode in g.adj[u]:
                if c + s < best.get(v, 1e18):
                    best[v] = c + s
                    heapq.heappush(heap, (c + s, v))
        for bid, b in list(builds.items()) + [('techno', techno)]:
            keys = b['rooms']
            ok = sum(1 for k, ns in keys.items() if any(n in best for n in ns))
            reach[bid] = {'rooms': len(keys), 'reachable': ok}
    stats = {
        'nodes': len(g.nodes), 'edges': len(g.edges),
        'by_building': {'techno': {'name': '테크노관', 'nodes': techno['nodes'], 'edges': techno['edges'],
                                   'rooms': len(techno['rooms']), 'entrances': len(techno['entrances'])},
                        **{bid: {'name': b['name'], 'nodes': b['nodes'], 'edges': b['edges'], 'rooms': len(b['rooms']),
                                 'exits': len(b['exits']), 'vertical_links': b['vertical_links'], 'floors': b['floors'],
                                 'stair_shafts': b['stair_shafts']}
                           for bid, b in builds.items()}},
        'outdoor_links': len(links), 'outdoor_meters': round(sum(l['meters'] for l in links), 1),
        'reachability': reach,
    }
    print(json.dumps(stats, ensure_ascii=False))
    # 화면용: 건물·층별 간선 선형(가볍게: 실내는 층별 선분 목록)
    lines = {}
    for a, b, s, m, mode in g.edges:
        na, nb = g.nodes[a], g.nodes[b]
        if mode == 'outdoor':
            continue
        key = f"{na['b']}|{na['f']}" if mode not in ('stair', 'elevator') else f"{na['b']}|vertical"
        lines.setdefault(key, []).append([[round(na['lat'], 7), round(na['lon'], 7)], [round(nb['lat'], 7), round(nb['lon'], 7)]])
    save_json(WEEK_DIR[13] / 'campus_graph.json', {'stats': stats, 'lines': lines,
                                                    'outdoor': [{'coords': l['coords'], 'meters': l['meters'], 'tag': l['tag']} for l in links],
                                                    'techno_entrances': techno['entrances']})
    if demo:
        save_json(WEEK_DIR[13] / 'demo_route.json', demo)
    # 앱용 압축 그래프
    packed = {
        'nodes': [[round(n['lat'], 7), round(n['lon'], 7), n['b'][0], n['f']] for n in g.nodes],
        'edges': [[a, b, s, m, mode[0]] for a, b, s, m, mode in g.edges],
        'rooms': {'techno': techno['rooms'], **{bid: b['rooms'] for bid, b in builds.items()}},
        'outdoor': [{'from': l['from'], 'to': l['to'], 'coords': l['coords']} for l in links],
        'names': {'techno': '테크노관', 'digital': '디지털관', 'global': '글로벌관'},
    }
    io.open(REPORT / '_app' / 'report-campus-graph.js', 'w', encoding='utf-8', newline='\n').write(
        '/* 13주차 캠퍼스 통합 경로망 — _tools/ax/campus_graph.py 가 만든다 */\nwindow.GUMAP_CAMPUS_GRAPH = ' +
        json.dumps(packed, ensure_ascii=False, separators=(',', ':')) + ';\n')


if __name__ == '__main__':
    main()
