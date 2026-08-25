import json
import shapely
from shapely.geometry import Polygon
from shapely.ops import unary_union

with open(r'GUMAP-개발\floorplan\work\2F_labeled_backup_holes.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

corridors = []
others = []

for p in data['polygons']:
    if p.get('type') == 'corridor':
        corridors.append(p)
    else:
        others.append(p)

c_polys = []
for c in corridors:
    pts = c['points']
    if len(pts) >= 3:
        p = Polygon(pts)
        if not p.is_valid: p = p.buffer(0)
        c_polys.append(p)

merged_c = unary_union(c_polys)

o_polys = []
for o in others:
    pts = o['points']
    if len(pts) >= 3:
        p = Polygon(pts)
        if not p.is_valid: p = p.buffer(0)
        o_polys.append(p)

merged_o = unary_union(o_polys)

diff = merged_c.difference(merged_o)

print(f"Original corridor type: {merged_c.geom_type}, area: {merged_c.area}")
print(f"After difference type: {diff.geom_type}, area: {diff.area}")

if diff.geom_type == 'Polygon':
    print(f"1 Polygon with {len(diff.interiors)} holes")
elif diff.geom_type == 'MultiPolygon':
    print(f"MultiPolygon with {len(diff.geoms)} parts")
    for i, g in enumerate(diff.geoms):
        if g.area > 10:
            print(f"  Part {i}: area {g.area}, {len(g.interiors)} holes")
