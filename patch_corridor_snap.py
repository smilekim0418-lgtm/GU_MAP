import codecs
import re

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

text = re.sub(r'function snapPoint\(x, y, edges\) \{\s*const sx=snapValue\(x,edges\.xs\), sy=snapValue\(y,edges\.ys\);\s*return \{x:sx\.val, y:sy\.val, snappedX:sx\.snapped, snappedY:sy\.snapped\};\s*\}', r"function snapPoint(x, y, edges) {\n  if (state.drawing && state.drawing.type === 'corridor') return {x, y, snappedX: false, snappedY: false};\n  const sx=snapValue(x,edges.xs), sy=snapValue(y,edges.ys);\n  return {x:sx.val, y:sy.val, snappedX:sx.snapped, snappedY:sy.snapped};\n}", text)

codecs.open(fpath, 'w', encoding='utf-8').write(text)
print("Patched snapPoint regex!")
