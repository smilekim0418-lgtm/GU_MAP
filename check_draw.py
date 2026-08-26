import codecs
text = codecs.open(r'GUMAP-개발\floorplan\floorplan-editor.html', encoding='utf-8').read()
lines = text.split('\n')
for i, line in enumerate(lines):
    if 'function ' in line and ('draw' in line.lower() or 'start' in line.lower()):
        print(f'{i}: {line.strip()[:100]}')
