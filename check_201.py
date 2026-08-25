import json
with open(r'GUMAP-개발\floorplan\work\2F_labeled.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for p in data['polygons']:
    rid = p.get('room_id')
    if rid == '201':
        xs = [pt[0] for pt in p['points']]
        ys = [pt[1] for pt in p['points']]
        print(f"201 bounding box: X({min(xs)} to {max(xs)}), Y({min(ys)} to {max(ys)})")
