import codecs

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

target = """  const [rx,ry] = latLngToPx(e.latlng);
  const snapped = snapPoint(Math.round(rx), Math.round(ry), state.drawing.edges);
  const px = [snapped.x, snapped.y];
  const dt = state.drawing.type;
  const previewColor = TYPES[dt].color;


  if (state.drawing.mode === 'poly') {"""

replacement = """  const [rx,ry] = latLngToPx(e.latlng);
  let tx = Math.round(rx), ty = Math.round(ry);
  let snapped = snapPoint(tx, ty, state.drawing.edges);
  
  if (state.drawing && state.drawing.mode === 'poly' && state.drawing.points.length > 0) {
    const prev = state.drawing.points[state.drawing.points.length - 1];
    const isHoriz = Math.abs(tx - prev[0]) > Math.abs(ty - prev[1]);
    if (isHoriz) ty = prev[1]; else tx = prev[0];
    snapped = snapPoint(tx, ty, state.drawing.edges);
    if (isHoriz) snapped.y = prev[1]; else snapped.x = prev[0];
  }
  
  const px = [snapped.x, snapped.y];
  const dt = state.drawing.type;
  const previewColor = TYPES[dt].color;

  if (state.drawing.mode === 'poly') {"""

if target in text:
    text = text.replace(target, replacement)
    codecs.open(fpath, 'w', encoding='utf-8').write(text)
    print("Patched click handler successfully!")
else:
    import re
    # Let's use regex to be safe
    text = re.sub(r'const \[rx,ry\] = latLngToPx\(e\.latlng\);\s*const snapped = snapPoint\(Math\.round\(rx\), Math\.round\(ry\), state\.drawing\.edges\);\s*const px = \[snapped\.x, snapped\.y\];\s*const dt = state\.drawing\.type;\s*const previewColor = TYPES\[dt\]\.color;\s*if \(state\.drawing\.mode === \'poly\'\) \{', replacement, text)
    codecs.open(fpath, 'w', encoding='utf-8').write(text)
    print("Patched click handler using regex!")
