import json
import shapely
from shapely.geometry import Polygon
from shapely.ops import unary_union
import os

floors = ['2F', '3F', '4F', '5F']
work_dir = r'GUMAP-개발\floorplan\work'

for floor in floors:
    if floor == '2F':
        fpath = os.path.join(work_dir, f'{floor}_labeled.json')
    else:
        fpath = os.path.join(work_dir, f'{floor}_labeled_backup_corridor.json')
        
    if not os.path.exists(fpath): continue
    
    with open(fpath, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    corridors = [p for p in data['polygons'] if p.get('type') == 'corridor']
    others = [p for p in data['polygons'] if p.get('type') != 'corridor']
    if not corridors: continue
    
    c_polys = []
    for c in corridors:
        pts = c['points']
        # If it was a keyhole or native hole, we just take it as Polygon
        if len(pts) > 0 and isinstance(pts[0][0], list):
            p = Polygon(pts[0], pts[1:])
        else:
            if len(pts) >= 3:
                p = Polygon(pts)
        if not p.is_valid: p = p.buffer(0)
        c_polys.append(p)
        
    merged_c = unary_union(c_polys)
    merged_c = merged_c.simplify(0.5, preserve_topology=True)
    
    merged_recs = []
    def process_poly(poly):
        if poly.area < 100: return
        ext = list(poly.exterior.coords)
        if ext[0] == ext[-1]: ext = ext[:-1]
        ext_pts = [[round(x), round(y)] for x, y in ext]
        
        holes = [list(interior.coords) for interior in poly.interiors]
        if holes:
            pts = [ext_pts]
            for hole in holes:
                if hole[0] == hole[-1]: hole = hole[:-1]
                pts.append([[round(x), round(y)] for x, y in hole])
        else:
            pts = ext_pts
            
        merged_recs.append({
            'points': pts,
            'area_px': poly.area,
            'centroid': [round(poly.centroid.x), round(poly.centroid.y)],
            'room_id': '복도',
            'type': 'corridor',
            'candidates': []
        })

    if merged_c.geom_type == 'Polygon':
        process_poly(merged_c)
    elif merged_c.geom_type == 'MultiPolygon':
        for p in merged_c.geoms:
            process_poly(p)
    elif merged_c.geom_type == 'GeometryCollection':
        for p in merged_c.geoms:
            if p.geom_type == 'Polygon': process_poly(p)
            
    data['polygons'] = others + merged_recs
    
    out_path = os.path.join(work_dir, f'{floor}_labeled.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        
    print(f'{floor}: Native holes merge complete. {len(merged_recs)} polygons.')
