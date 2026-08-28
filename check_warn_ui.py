import codecs
import sys
text = codecs.open(r'GUMAP-프론트\js\map\map-search.js', encoding='utf-8').read()
lines = text.split('\n')
for i, line in enumerate(lines):
    if 'warnings' in line.lower():
        sys.stdout.buffer.write(f'{i}: {line.strip()}\n'.encode('utf-8'))
