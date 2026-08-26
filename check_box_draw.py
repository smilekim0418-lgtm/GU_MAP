import codecs
text = codecs.open(r'GUMAP-개발\floorplan\floorplan-editor.html', encoding='utf-8').read()
lines = text.split('\n')
for i in range(743, 765):
    print(f'{i}: {lines[i].strip()}')
