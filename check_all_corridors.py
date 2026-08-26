import json
import os

WORK_DIR = r"GUMAP-개발\floorplan\work"

for floor in ["B1F","1F","2F","3F","4F","5F","6F","7F","8F","9F","10F","11F"]:
    fpath = os.path.join(WORK_DIR, f"{floor}_labeled.json")
    if not os.path.exists(fpath): continue
    
    with open(fpath, "r", encoding="utf-8") as f:
        data = json.load(f)
    corridors = [p for p in data["polygons"] if p.get("room_id") == "복도" or p.get("label") == "복도"]
    if len(corridors) > 1:
        print(f"{floor}: Found {len(corridors)} corridors. Needs merging.")
