import codecs
text = codecs.open(r'GUMAP-개발\floorplan\floorplan-editor.html', encoding='utf-8').read()
lines = text.split('\n')
for i in range(596, 615):
    print(f'{i}: {lines[i].strip()}')
print("---")
for i in range(1021, 1035):
    print(f'{i}: {lines[i].strip()}')
