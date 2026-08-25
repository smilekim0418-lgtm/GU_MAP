import json
import shutil
import os
import math
from shapely.geometry import Polygon
from shapely.ops import unary_union

def distance(p1, p2):
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

def add_holes_to_exterior(exterior, holes):
    if exterior[0] == exterior[-1]:
        exterior = exterior[:-1]
    for hole in holes:
        if hole[0] == hole[-1]:
            hole = hole[:-1]
        min_dist = float("inf")
        best_e = 0
        best_h = 0
        for i, ep in enumerate(exterior):
            for j, hp in enumerate(hole):
                d = distance(ep, hp)
                if d < min_dist:
                    min_dist = d
                    best_e = i
                    best_h = j
        hole = hole[best_h:] + hole[:best_h]
        exterior = exterior[:best_e+1] + hole + [hole[0]] + exterior[best_e:]
    return exterior

floors = ['2F', '3F', '4F', '5F']
work_dir = r'GUMAP-개발\floorplan\work'

for floor in floors:
    fpath = os.path.join(work_dir, f'{floor}_labeled.json')
    if not os.path.exists(fpath):
        continue
    
    backup_path = os.path.join(work_dir, f'{floor}_labeled_backup_holes.json')
    shutil.copy2(fpath, backup_path)
    
    with open(fpath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    corridors = [p for p in data['polygons'] if p.get('type') == 'corridor']
    others = [p for p in data['polygons'] if p.get('type') != 'corridor']
    
    if not corridors:
        continue
    
    shapely_polys = []
    for c in corridors:
        pts = c['points']
        if len(pts) >= 3:
            poly = Polygon(pts)
            if not poly.is_valid:
                poly = poly.buffer(0)
            shapely_polys.append(poly)
            
    if not shapely_polys:
        continue
        
    try:
        merged = unary_union(shapely_polys)
    except Exception as e:
        print(f'{floor} union error: {e}')
        continue
        
    merged_recs = []
    
    def process_poly(poly):
        ext = list(poly.exterior.coords)
        holes = [list(interior.coords) for interior in poly.interiors]
        
        if holes:
            ext = add_holes_to_exterior(ext, holes)
        else:
            if ext[0] == ext[-1]:
                ext = ext[:-1]
                
        pts = [[round(x), round(y)] for x, y in ext]
        cx, cy = poly.centroid.x, poly.centroid.y
        area = poly.area
        
        merged_recs.append({
            'points': pts,
            'area_px': area,
            'centroid': [round(cx), round(cy)],
            'room_id': '복도',
            'type': 'corridor',
            'candidates': []
        })

    if merged.geom_type == 'Polygon':
        process_poly(merged)
    elif merged.geom_type == 'MultiPolygon':
        for poly in merged.geoms:
            process_poly(poly)
    
    data['polygons'] = others + merged_recs
    
    with open(fpath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        
    print(f'{floor}: Merged {len(corridors)} into {len(merged_recs)} polygon(s) with holes preserved!')
