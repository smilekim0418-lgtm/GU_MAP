import codecs

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

text = text.replace('<button id="draw">그리기 (D)</button>', '<button id="draw">그리기 (D)</button>\n        <button id="drawPoly">다각형 (P)</button>')
text = text.replace("if (!ev.ctrlKey && (ev.key==='d'||ev.key==='D')) startDraw();", "if (!ev.ctrlKey && (ev.key==='d'||ev.key==='D')) startDraw();\n  if (!ev.ctrlKey && (ev.key==='p'||ev.key==='P')) startDrawPoly();")

start_draw_poly_html = """
function startDrawPoly() {
  const dt = state.drawType;
  if (dt === 'room' && !state.selectedRoomId) {
    setStat('먼저 할당할 방 번호를 우측에서 선택하세요.'); return;
  }
  deselect();
  state.drawing = { points:[], markers:[], edges:collectEdges(), type:dt, mode:'poly' };
  setDrawingCursor(true);
  setStat(`[${TYPES[dt].label}] 다각형 그리기 (끝낼 땐 시작점 클릭 또는 Enter)`);
}

document.getElementById('drawPoly').onclick = startDrawPoly;
"""

text = text.replace("document.getElementById('draw').onclick = startDraw;", "document.getElementById('draw').onclick = startDraw;\n" + start_draw_poly_html)

text = text.replace("if (ev.key==='Delete') deleteSelected();", "if (ev.key==='Delete') deleteSelected();\n  if (ev.key==='Enter' && state.drawing && state.drawing.mode==='poly') finishPolyDraw();")

finish_poly_draw_html = """
function finishPolyDraw() {
  if (!state.drawing || state.drawing.mode !== 'poly' || state.drawing.points.length < 3) return;
  const dt = state.drawing.type;
  const rectPoints = state.drawing.points.slice(); // Copy points
  
  // Calculate area roughly using Shoelace formula
  let area = 0;
  for (let i = 0; i < rectPoints.length; i++) {
    const j = (i + 1) % rectPoints.length;
    area += rectPoints[i][0] * rectPoints[j][1];
    area -= rectPoints[j][0] * rectPoints[i][1];
  }
  area = Math.abs(area) / 2.0;

  const rec = {
    points: rectPoints,
    area_px: area,
    centroid: centroidOf(rectPoints),
    room_id: dt === 'room' ? state.selectedRoomId : null,
    type: dt,
    candidates: []
  };

  state.drawing.markers.forEach(m => map.removeLayer(m));
  if (state.drawing.polyline) map.removeLayer(state.drawing.polyline);
  clearPreview();
  setDrawingCursor(false);
  state.drawing = null;

  if (dt !== 'room') promptForType(dt, rec);

  const label = rec.room_id || (rec.connects ? rec.connects.join('↔') : '') || TYPES[dt].label;
  snapshot(`${label} 다각형 그리기`);
  state.data.polygons.push(rec);

  if (dt === 'room' && state.selectedRoomId) {
    const missing = (state.data.report && state.data.report.missing) || [];
    const idx = missing.indexOf(state.selectedRoomId);
    if (idx >= 0) missing.splice(idx, 1);
  }

  state.selectedRoomId = null;
  renderPolygons(); renderTodo();
}
"""

text = text.replace("function promptForType", finish_poly_draw_html + "\nfunction promptForType")

click_target = "if (state.drawing.points.length === 0) {"
click_replacement = """
  if (state.drawing.mode === 'poly') {
    if (state.drawing.points.length >= 3 && px[0] === state.drawing.points[0][0] && px[1] === state.drawing.points[0][1]) {
      finishPolyDraw();
      return;
    }
    state.drawing.points.push(px);
    state.drawing.markers.push(
      L.circleMarker(pxToLatLng(px[0],px[1]), {radius:5,color:previewColor,fillColor:previewColor,fillOpacity:1}).addTo(map)
    );
    if (state.drawing.polyline) map.removeLayer(state.drawing.polyline);
    const latlngs = state.drawing.points.map(p => pxToLatLng(p[0], p[1]));
    state.drawing.polyline = L.polyline(latlngs, {color:previewColor, weight:2, dashArray:'4'}).addTo(map);
    return;
  }
  
  if (state.drawing.points.length === 0) {
"""
text = text.replace(click_target, click_replacement)

mousemove_target = "if (!state.drawing || state.drawing.points.length !== 1) return;"
mousemove_replacement = """
  if (!state.drawing) return;
  if (state.drawing.mode === 'poly') {
    if (state.drawing.points.length === 0) return;
    const snapped = snapPoint(Math.round(rx), Math.round(ry), state.drawing.edges);
    const previewColor = TYPES[state.drawing.type].color;
    
    if (previewRect) { map.removeLayer(previewRect); previewRect=null; }
    
    const latlngs = state.drawing.points.map(p => pxToLatLng(p[0], p[1]));
    latlngs.push(pxToLatLng(snapped.x, snapped.y));
    
    if (state.drawing.previewLine) map.removeLayer(state.drawing.previewLine);
    state.drawing.previewLine = L.polyline(latlngs, {color:previewColor, weight:2, dashArray:'4'}).addTo(map);
    return;
  }
  if (state.drawing.points.length !== 1) return;
"""
text = text.replace(mousemove_target, mousemove_replacement)

clear_preview_target = "if (previewRect) { map.removeLayer(previewRect); previewRect=null; }"
clear_preview_replacement = "if (previewRect) { map.removeLayer(previewRect); previewRect=null; }\n  if (state.drawing && state.drawing.previewLine) { map.removeLayer(state.drawing.previewLine); state.drawing.previewLine=null; }"
text = text.replace(clear_preview_target, clear_preview_replacement)


codecs.open(fpath, 'w', encoding='utf-8').write(text)
print('Patched floorplan-editor.html correctly!')
