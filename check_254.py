import codecs
import sys
text = codecs.open(r'GUMAP-프론트\js\map\map-techno-indoor.js', encoding='utf-8').read()
lines = text.split('\n')
sys.stdout.buffer.write('\n'.join(lines[254:260]).encode('utf-8'))
