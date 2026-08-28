import json
import shapely
from shapely.geometry import Polygon, MultiPolygon, box
from shapely.ops import unary_union

fpath = r'GUMAP-개발\floorplan\work\2F_labeled_backup_corridor.json'
with open(fpath, 'r', encoding='utf-8') as f:
    data = json.load(f)

corridors = [p for p in data['polygons'] if p.get('type') == 'corridor']
others = [p for p in data['polygons'] if p.get('type') != 'corridor']
print(f"Original corridors: {len(corridors)}")

c_polys = []
for c in corridors:
    pts = c['points']
    if len(pts) >= 3:
        p = Polygon(pts)
        if not p.is_valid: p = p.buffer(0)
        c_polys.append(p)

merged_c = unary_union(c_polys)

# Big cut box from 201 to Stairs A (Y: 700 to 1700)
cut_box = box(1450, 700, 2000, 1700)
diff_c = merged_c.difference(cut_box)
diff_c = diff_c.simplify(2, preserve_topology=True)

merged_recs = []
def process_poly(poly):
    if poly.area < 100: return
    ext = list(poly.exterior.coords)
    if ext[0] == ext[-1]: ext = ext[:-1]
    pts = [[round(x), round(y)] for x, y in ext]
    merged_recs.append({
        'points': pts,
        'area_px': poly.area,
        'centroid': [round(poly.centroid.x), round(poly.centroid.y)],
        'room_id': '복도',
        'type': 'corridor',
        'candidates': []
    })

if diff_c.geom_type == 'Polygon':
    process_poly(diff_c)
elif diff_c.geom_type == 'MultiPolygon':
    for p in diff_c.geoms:
        process_poly(p)
elif diff_c.geom_type == 'GeometryCollection':
    for p in diff_c.geoms:
        if p.geom_type == 'Polygon': process_poly(p)

data['polygons'] = others + merged_recs

with open(r'GUMAP-개발\floorplan\work\2F_labeled.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f'Cut big box applied. Corridors split into {len(merged_recs)} simple parts without crazy points.')
