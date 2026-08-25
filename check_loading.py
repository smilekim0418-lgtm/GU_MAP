import re
text = open(r'GUMAP-개발\floorplan\floorplan-editor.html', encoding='utf-8').read()
if "loading" in text.lower():
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if "loading" in line.lower():
            print(f"{i}: {line.strip()}")
else:
    print("No loading string found.")
