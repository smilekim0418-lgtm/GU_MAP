import json
with open(r'GUMAP-개발\floorplan\work\2F_labeled_backup_holes.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

corridors = [p for p in data['polygons'] if p.get('type') == 'corridor']
print(f'Original Corridors in 2F: {len(corridors)}')
