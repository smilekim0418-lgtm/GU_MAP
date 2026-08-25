import codecs
text = codecs.open(r'GUMAP-개발\floorplan\floorplan-editor.html', encoding='utf-8').read()
import re
for m in re.finditer(r'setStat\(.*?\)', text):
    print(m.group(0))
