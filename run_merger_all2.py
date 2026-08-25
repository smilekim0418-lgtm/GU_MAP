import json
import os
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
import copy

WORK_DIR = r"GUMAP-개발\floorplan\work"

def process_floor(floor):
    fpath = os.path.join(WORK_DIR, f"{floor}_labeled.json")
    if not os.path.exists(fpath): return

    with open(fpath, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    corridors = [p for p in data["polygons"] if p.get("room_id") == "복도"]
    if len(corridors) <= 1:
        return # Already merged or no corridors
    
    print(f"{floor}: Found {len(corridors)} corridors. Merging...")
    
    # 1. Convert all corridors to Shapely polygons
    polys = []
    for c in corridors:
        pts = c.get("points", [])
        if len(pts) == 0: continue
        # Handle native holes (array of arrays)
        if isinstance(pts[0][0], list):
            ext = pts[0]
            holes = pts[1:] if len(pts) > 1 else []
            polys.append(Polygon(ext, holes))
        else:
            polys.append(Polygon(pts))
            
    if not polys: return
    
    # 2. Union them all
    merged = unary_union(polys)
    
    if isinstance(merged, MultiPolygon):
        print(f"Warning: {floor} resulted in MultiPolygon. Keeping largest.")
        merged = max(merged.geoms, key=lambda p: p.area)
        
    # 3. Convert back to array
    new_pts = []
    new_pts.append(list(merged.exterior.coords)[:-1]) # exterior without duplicated last point
    for interior in merged.interiors:
        new_pts.append(list(interior.coords)[:-1])
        
    # 4. Remove old corridors
    data["polygons"] = [p for p in data["polygons"] if p.get("room_id") != "복도"]
    
    # 5. Add new merged corridor
    new_corridor = copy.deepcopy(corridors[0])
    new_corridor["points"] = new_pts
    
    # Insert it at the top
    data["polygons"].insert(0, new_corridor)
    
    # Save
    with open(fpath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        
    print(f"  -> Saved {floor}")

for floor in ["B1F","1F","2F","3F","4F","5F","6F","7F","8F","9F","10F","11F"]:
    process_floor(floor)
