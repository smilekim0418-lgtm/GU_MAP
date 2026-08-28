import codecs
import re

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

match = re.search(r"map\.on\('mousemove', e => \{.*?\n\}\);\n", text, re.DOTALL)
if not match:
    print("Could not find map.on('mousemove')")
    exit(1)

replacement = """map.on('mousemove', e => {
  if (!state.drawing) return;
  const [rx,ry] = latLngToPx(e.latlng);
  
  if (state.drawing.mode === 'poly') {
    if (state.drawing.points.length === 0) return;
    let tx = Math.round(rx), ty = Math.round(ry);
    let snapped = snapPoint(tx, ty, state.drawing.edges);
    
    const prev = state.drawing.points[state.drawing.points.length - 1];
    const isHoriz = Math.abs(tx - prev[0]) > Math.abs(ty - prev[1]);
    if (isHoriz) ty = prev[1]; else tx = prev[0];
    
    snapped = snapPoint(tx, ty, state.drawing.edges);
    if (isHoriz) snapped.y = prev[1]; else snapped.x = prev[0];
    
    const previewColor = TYPES[state.drawing.type].color;
    if (previewRect) { map.removeLayer(previewRect); previewRect = null; }
    if (state.drawing && state.drawing.previewLine) { map.removeLayer(state.drawing.previewLine); state.drawing.previewLine = null; }
    
    const latlngs = state.drawing.points.map(p => pxToLatLng(p[0], p[1]));
    latlngs.push(pxToLatLng(snapped.x, snapped.y));
    
    const dist = isHoriz ? Math.abs(snapped.x - prev[0]) : Math.abs(snapped.y - prev[1]);
    setStat(`[${TYPES[state.drawing.type].label}] 길이: ${dist}px (클릭 확정 / 시작점 클릭 시 완료)`);
    
    state.drawing.previewLine = L.polyline(latlngs, {color:previewColor, weight:2, dashArray:'4'}).addTo(map);
    return;
  }
  
  // Rectangle mode
  if (state.drawing.points.length !== 1) return;
  const [x1, y1] = state.drawing.points[0];
  const snapped = snapPoint(Math.round(rx), Math.round(ry), state.drawing.edges);
  
  const previewColor = TYPES[state.drawing.type].color;
  const bounds = [pxToLatLng(x1,y1), pxToLatLng(snapped.x, snapped.y)];
  if (previewRect) {
    previewRect.setBounds(bounds);
  } else {
    previewRect = L.rectangle(bounds, {
      color:previewColor, weight:2, fillColor:previewColor, fillOpacity:0.15, dashArray:'6 4'
    }).addTo(map);
  }
});
"""

text = text[:match.start()] + replacement + text[match.end():]
codecs.open(fpath, 'w', encoding='utf-8').write(text)
print('Patched mousemove cleanly!')
