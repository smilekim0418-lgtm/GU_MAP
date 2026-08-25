import json
with open(r'GUMAP-개발\floorplan\work\2F_labeled.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
c = [p for p in data['polygons'] if p.get('type') == 'corridor'][1]
for pt in c['points']:
    print(pt)
