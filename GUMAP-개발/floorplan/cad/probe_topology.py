import json
from pathlib import Path
from shapely.geometry import LineString,Polygon,Point
from shapely.ops import unary_union
BASE=Path(__file__).resolve().parent
data=json.loads((BASE/'output/map.json').read_text(encoding='utf-8'))['floors']['2F']
lines=[LineString(p['points']) for p in data['paths'] if p['kind'] in ('LINE','LWPOLYLINE','POLYLINE')]
lines += [LineString([d['center'],e]) for d in data['doors'] for e in d['ends']]
network=unary_union(lines)
for tolerance in [.005,.02,.05,.08,.12]:
    walls=network.buffer(tolerance,cap_style=3,join_style=2)
    polygons=[Polygon(r) for p in getattr(walls,'geoms',[walls]) for r in p.interiors if 2<Polygon(r).area<1600]
    labels=[t for t in data['texts'] if t['room_id']]
    hits=[[t['room_id'] for t in labels if p.covers(Point(t['p']))] for p in polygons]
    print(tolerance,len(polygons),sum(len(h)==1 for h in hits),[h for h in hits if len(h)>1],flush=True)
