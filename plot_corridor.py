import json
import matplotlib.pyplot as plt

with open(r'GUMAP-개발\floorplan\work\2F_labeled.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

corridors = [p for p in data['polygons'] if p.get('type') == 'corridor']
if corridors:
    pts = corridors[0]['points']
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    # Invert Y to match screen coords
    ys = [-y for y in ys]
    
    plt.figure(figsize=(10,10))
    plt.plot(xs, ys, marker='o')
    plt.fill(xs, ys, alpha=0.3)
    plt.savefig(r'C:\Users\barah\.gemini\antigravity\brain\34325fe9-497c-495c-a0e4-f701b6384faa\scratch\2F_corridor.png')
