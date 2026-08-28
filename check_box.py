import json
with open(r'GUMAP-개발\floorplan\work\2F_labeled.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

xs = []
ys = []
for p in data['polygons']:
    rid = p.get('room_id')
    if rid in ['207', '계단-A', '계단-A']:
        print(f"Found {rid}")
        for pt in p['points']:
            xs.append(pt[0])
            ys.append(pt[1])

if xs:
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    print(f"Bounding box for 207 & Stairs-A: X({minx} to {maxx}), Y({miny} to {maxy})")
    
    # Let's expand it by 20 pixels
    minx -= 20
    maxx += 20
    miny -= 20
    maxy += 20
    print(f"Expanded cut box: X({minx} to {maxx}), Y({miny} to {maxy})")
