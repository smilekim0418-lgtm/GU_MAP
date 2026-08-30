import codecs
import sys
text = codecs.open(r'GUMAP-프론트\js\map\map-layers.js', encoding='utf-8').read()
lines = text.split('\n')
for i in range(430, 480):
    try: sys.stdout.buffer.write(f'{i}: {lines[i].strip()}\n'.encode('utf-8'))
    except: pass
