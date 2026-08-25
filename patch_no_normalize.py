import codecs

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

target = """  let normalized = 0;
  state.data.polygons.forEach(rec => {
    if (!isAlreadyRect(rec.points)) {
      rec.points = toBoundingRect(rec.points);
      rec.centroid = centroidOf(rec.points);
      const xs = rec.points.map(p=>p[0]), ys = rec.points.map(p=>p[1]);
      rec.area_px = Math.abs((Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys)));
      normalized++;
    }
  });"""

replacement = """  // Removed automatic normalization to preserve multi-point polygons like L-shapes
  let normalized = 0;"""

text = text.replace(target, replacement)

target2 = """  if (normalized > 0) {
    state.dirty = true;
    setStat(`${state.floor} 로드 — ${normalized}개 직사각형 정규화됨 (저장 필요)`);
  }"""

replacement2 = """  // if (normalized > 0) ... removed"""
text = text.replace(target2, replacement2)

# Oh wait! In my previous output, the text was:
# 'setStat(`${state.floor} \ub85c\ub4dc \u2014 ${normalized}\uac1c \uc9c1\uc0ac\uac01\ud615 \uc815\uaddc\ud654\ub428 (\uc800\uc7a5 \ud544\uc694)`);'
# The dash is a Unicode em-dash (—)!
# To avoid exact matching failure, let's use regex again.

import re
text = re.sub(r'let normalized = 0;\s*state\.data\.polygons\.forEach\(rec => \{\s*if \(\!isAlreadyRect\(rec\.points\)\) \{.*?\n\s*\}\s*\}\);\n', 'let normalized = 0;\n', text, flags=re.DOTALL)

text = re.sub(r'if \(normalized > 0\) \{.*?\n\s*\}\n', '\n', text, flags=re.DOTALL)

codecs.open(fpath, 'w', encoding='utf-8').write(text)
print('Removed automatic rect normalization using regex!')
