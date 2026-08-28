import json
import os

WORK_DIR = r"GUMAP-개발\floorplan\work"

fpath = os.path.join(WORK_DIR, "1F_labeled.json")
with open(fpath, "r", encoding="utf-8") as f:
    data = json.load(f)
corridors = [p for p in data["polygons"] if p.get("room_id") == "복도" or p.get("label") == "복도"]
print(f"1F: Found {len(corridors)} corridors.")
