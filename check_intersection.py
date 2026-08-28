import json
from shapely.geometry import Polygon, box

with open(r'GUMAP-개발\floorplan\work\2F_labeled.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

corridors = [p for p in data['polygons'] if p.get('type') == 'corridor']
c_poly = Polygon(corridors[0]['points'])
if not c_poly.is_valid:
    c_poly = c_poly.buffer(0)

stairs_box = box(1759, 1472, 1939, 1587)

print("Intersection area:", c_poly.intersection(stairs_box).area)
print("Stairs box area:", stairs_box.area)
