import codecs
import sys
import re
text = codecs.open(r'GUMAP-프론트\js\map\map-techno-route-core.js', encoding='utf-8').read()
lines = text.split('\n')
for i, line in enumerate(lines):
    if 'warnings disabled' in line:
        sys.stdout.buffer.write(f'{i}: {line.strip()}\n'.encode('utf-8'))
