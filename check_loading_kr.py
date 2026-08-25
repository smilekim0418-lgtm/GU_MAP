text = open(r'GUMAP-개발\floorplan\floorplan-editor.html', encoding='utf-8').read()
lines = text.split("\n")
for i, line in enumerate(lines):
    if "로딩" in line:
        print(f"{i}: {line.strip()}")
