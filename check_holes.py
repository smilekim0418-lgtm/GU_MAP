import json
from shapely.geometry import Polygon
from shapely.ops import unary_union

for floor in ['2F', '3F', '4F', '5F']:
    fpath = fr'GUMAP-개발\floorplan\work\{floor}_labeled.json'
    try:
        with open(fpath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except:
        continue
        
    corridors = [p for p in data['polygons'] if p.get('type') == 'corridor']
    if not corridors:
        continue
        
    shapely_polys = []
    for c in corridors:
        pts = c['points']
        if len(pts) >= 3:
            shapely_polys.append(Polygon(pts))
            
    merged = unary_union(shapely_polys)
    
    if merged.geom_type == 'Polygon':
        print(f'{floor}: 1 Polygon, {len(merged.interiors)} holes')
    elif merged.geom_type == 'MultiPolygon':
        print(f'{floor}: MultiPolygon with {len(merged.geoms)} parts')
        for i, poly in enumerate(merged.geoms):
            print(f'  Part {i}: {len(poly.interiors)} holes')
