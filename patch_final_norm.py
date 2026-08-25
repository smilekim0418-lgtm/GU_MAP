import codecs
import re

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

text = re.sub(r'let normalized = 0;\s*state\.data\.polygons\.forEach\(rec => \{\s*if \(!isAlreadyRect\(rec\.points\)\) \{\s*rec\.points = toBoundingRect\(rec\.points\);\s*rec\.centroid = centroidOf\(rec\.points\);\s*const xs = rec\.points\.map\(p=>p\[0\]\), ys = rec\.points\.map\(p=>p\[1\]\);\s*rec\.area_px = Math\.abs\(\(Math\.max\(\.\.\.xs\)-Math\.min\(\.\.\.xs\)\)\*\(Math\.max\(\.\.\.ys\)-Math\.min\(\.\.\.ys\)\)\);\s*normalized\+\+;\s*\}\s*\}\);', 'let normalized = 0; // Removed auto-normalization', text)

codecs.open(fpath, 'w', encoding='utf-8').write(text)
print('Patched regex 1')
