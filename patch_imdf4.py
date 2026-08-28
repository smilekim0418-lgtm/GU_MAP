import codecs
import re

fpath = r'GUMAP-개발\floorplan\04_build_imdf.py'
text = codecs.open(fpath, encoding='utf-8').read()

lines = text.split('\n')
for i, line in enumerate(lines):
    if 'if len(record["points"]) > 0' in line:
        lines[i] = '        if len(record["points"]) > 0 and isinstance(record["points"][0][0], list):'
        lines[i+1] = '            pts = record["points"][0]'
        lines[i+2] = '            points = [(float(x), float(y)) for x, y in pts]'
        lines[i+3] = '        else:'
        lines[i+4] = '            points = [(float(x), float(y)) for x, y in record["points"]]'

codecs.open(fpath, 'w', encoding='utf-8').write('\n'.join(lines))
