import json
with open(r'GUMAP-개발\floorplan\floorplan-editor.html', 'r', encoding='utf-8') as f:
    text = f.read()

import re
scripts = re.findall(r'<script.*?>.*?</script>', text, flags=re.DOTALL)
print(f"Found {len(scripts)} scripts")
for s in scripts:
    if len(s) > 100:
        print("Script head:", s[:50])
    else:
        print("Script:", s)
