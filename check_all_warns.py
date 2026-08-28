import codecs
import sys
import re
text = codecs.open(r'GUMAP-프론트\js\map\map-techno-route-core.js', encoding='utf-8').read()
sys.stdout.buffer.write(text.encode('utf-8'))
