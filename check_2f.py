import json
with open(r'GUMAP-개발\floorplan\work\2F_labeled.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for p in data['polygons']:
    if p.get('type') == 'corridor' or (p.get('type') == 'room' and not p.get('room_id')):
        print(f"Type: {p.get('type')}, ID: {p.get('room_id')}")
