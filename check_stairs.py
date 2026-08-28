import json

with open(r'GUMAP-개발\floorplan\work\2F_labeled.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for p in data['polygons']:
    if p.get('room_id') == '계단-A' or p.get('room_id') == '계단-A':
        print('Stairs-A found!')
        pts = p['points']
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        print(f'X range: {min(xs)} to {max(xs)}')
        print(f'Y range: {min(ys)} to {max(ys)}')
