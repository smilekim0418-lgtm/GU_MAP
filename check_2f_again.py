import json
import os

WORK_DIR = r"GUMAP-개발\floorplan\work"

fpath = os.path.join(WORK_DIR, "2F_labeled.json")
if os.path.exists(fpath):
    with open(fpath, "r", encoding="utf-8") as f:
        data = json.load(f)
    corridors = [p for p in data["polygons"] if p.get("room_id") == "복도" or p.get("label") == "복도"]
    print(f"2F: Found {len(corridors)} corridors.")
