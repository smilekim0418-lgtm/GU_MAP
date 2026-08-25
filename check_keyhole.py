import json
with open(r'GUMAP-개발\floorplan\work\2F_labeled.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
c = [p for p in data['polygons'] if p.get('type') == 'corridor'][1]
pts = c['points']
for i in range(len(pts)-1):
    if pts[i] == pts[i+1]:
        print("Duplicate point at", i)
print("Checking for keyhole seam...")
for i in range(len(pts)):
    for j in range(i+2, len(pts)):
        if pts[i] == pts[j]:
            print(f"Possible keyhole start at {i} and end at {j}: {pts[i]}")
