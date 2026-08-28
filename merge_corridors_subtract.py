import json
import shutil
import os
import math
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union

def distance(p1, p2):
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

def add_holes_to_exterior(exterior, holes):
    if exterior[0] == exterior[-1]: exterior = exterior[:-1]
    for hole in holes:
        if hole[0] == hole[-1]: hole = hole[:-1]
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
    if not os.path.exists(fpath): continue
    
    with open(fpath, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    corridors = [p for p in data['polygons'] if p.get('type') == 'corridor']
    others = [p for p in data['polygons'] if p.get('type') != 'corridor']
    if not corridors: continue
    
    c_polys = []
    for c in corridors:
        pts = c['points']
        if len(pts) >= 3:
            p = Polygon(pts)
            if not p.is_valid: p = p.buffer(0)
            c_polys.append(p)
            
    o_polys = []
    for o in others:
        pts = o['points']
        if len(pts) >= 3:
            p = Polygon(pts)
            if not p.is_valid: p = p.buffer(0)
            o_polys.append(p)
            
    if not c_polys: continue
    
    merged_c = unary_union(c_polys)
    if o_polys:
        merged_o = unary_union(o_polys)
        diff_c = merged_c.difference(merged_o)
    else:
        diff_c = merged_c
        
    merged_recs = []
    
    def process_poly(poly):
        if poly.area < 100: return # Skip tiny slivers
        ext = list(poly.exterior.coords)
        holes = [list(interior.coords) for interior in poly.interiors]
        
        if holes:
            ext = add_holes_to_exterior(ext, holes)
        else:
            if ext[0] == ext[-1]: ext = ext[:-1]
                
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
        
    print(f'{floor}: Subtracted rooms, created {len(merged_recs)} corridor parts.')
