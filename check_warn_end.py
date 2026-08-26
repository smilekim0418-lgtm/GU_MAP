import codecs
import sys
text = codecs.open(r'GUMAP-프론트\js\map\map-techno-route-core.js', encoding='utf-8').read()
lines = text.split('\n')
sys.stdout.buffer.write('\n'.join(lines[315:350]).encode('utf-8'))
