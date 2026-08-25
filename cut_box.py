import json
import shapely
from shapely.geometry import Polygon, MultiPolygon, box
from shapely.ops import unary_union

fpath = r'GUMAP-개발\floorplan\work\2F_labeled.json'
with open(fpath, 'r', encoding='utf-8') as f:
    data = json.load(f)
    
corridors = [p for p in data['polygons'] if p.get('type') == 'corridor']
others = [p for p in data['polygons'] if p.get('type') != 'corridor']

# We will combine all corridors and subtract the box
c_polys = []
for c in corridors:
    pts = c['points']
    if len(pts) >= 3:
        p = Polygon(pts)
        if not p.is_valid: p = p.buffer(0)
        c_polys.append(p)

if c_polys:
    merged_c = unary_union(c_polys)
    
    # Big cut box for 207 and Stairs-A
    cut_box = box(1450, 1300, 1980, 1630)
    
    diff_c = merged_c.difference(cut_box)
    
    merged_recs = []
    def process_poly(poly):
        if poly.area < 100: return
        ext = list(poly.exterior.coords)
        
        # NOTE: If there are STILL holes (e.g. from elevators elsewhere), we still need keyholes for them.
        # But this cut box should eliminate the hole at Stairs-A!
        import math
        def distance(p1, p2): return math.hypot(p1[0]-p2[0], p1[1]-p2[1])
        holes = [list(interior.coords) for interior in poly.interiors]
        if holes:
            if ext[0] == ext[-1]: ext = ext[:-1]
            for hole in holes:
                if hole[0] == hole[-1]: hole = hole[:-1]
                min_dist = float("inf"); best_e = 0; best_h = 0
                for i, ep in enumerate(ext):
                    for j, hp in enumerate(hole):
                        d = distance(ep, hp)
                        if d < min_dist:
                            min_dist = d; best_e = i; best_h = j
                hole = hole[best_h:] + hole[:best_h]
                ext = ext[:best_e+1] + hole + [hole[0]] + ext[best_e:]
        else:
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
    
    with open(fpath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        
    print(f'Cut box applied. Corridors split into {len(merged_recs)} parts.')
