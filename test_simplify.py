import json
import shapely
from shapely.geometry import Polygon
from shapely.ops import unary_union

fpath = r'GUMAP-개발\floorplan\work\2F_labeled.json'
with open(fpath, 'r', encoding='utf-8') as f:
    data = json.load(f)

corridors = [p for p in data['polygons'] if p.get('type') == 'corridor']
c_polys = []
for c in corridors:
    pts = c['points']
    c_polys.append(Polygon(pts))

for i, p in enumerate(c_polys):
    print(f"Polygon {i} before: {len(p.exterior.coords)} points")
    p_simp = p.simplify(3.0, preserve_topology=True)
    print(f"Polygon {i} after simplify(3.0): {len(p_simp.exterior.coords)} points")
    p_simp5 = p.simplify(5.0, preserve_topology=True)
    print(f"Polygon {i} after simplify(5.0): {len(p_simp5.exterior.coords)} points")
