import codecs

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

buggy_snapping = """
    let tx = Math.round(rx), ty = Math.round(ry);
    const prev = state.drawing.points[state.drawing.points.length - 1];
    const isHoriz = Math.abs(tx - prev[0]) > Math.abs(ty - prev[1]);
    if (isHoriz) ty = prev[1]; else tx = prev[0];

    const snapped = snapPoint(tx, ty, state.drawing.edges);
    if (isHoriz) snapped.y = prev[1]; else snapped.x = prev[0];
"""

fixed_snapping = """
    let tx = Math.round(rx), ty = Math.round(ry);
    let snapped = snapPoint(tx, ty, state.drawing.edges);
    
    if (state.drawing.points.length > 0) {
      const prev = state.drawing.points[state.drawing.points.length - 1];
      const isHoriz = Math.abs(tx - prev[0]) > Math.abs(ty - prev[1]);
      if (isHoriz) ty = prev[1]; else tx = prev[0];
      snapped = snapPoint(tx, ty, state.drawing.edges);
      if (isHoriz) snapped.y = prev[1]; else snapped.x = prev[0];
    }
"""
text = text.replace(buggy_snapping, fixed_snapping)

buggy_tooltip = """
    latlngs.push(pxToLatLng(snapped.x, snapped.y));
    const dist = isHoriz ? Math.abs(snapped.x - prev[0]) : Math.abs(snapped.y - prev[1]);
    setStat(`[${TYPES[state.drawing.type].label}] 길이: ${dist}px (클릭하여 확정, 시작점 클릭 시 완료)`);
"""

fixed_tooltip = """
    latlngs.push(pxToLatLng(snapped.x, snapped.y));
    if (state.drawing.points.length > 0) {
      const prev = state.drawing.points[state.drawing.points.length - 1];
      const isHoriz = Math.abs(snapped.x - prev[0]) > Math.abs(snapped.y - prev[1]);
      const dist = isHoriz ? Math.abs(snapped.x - prev[0]) : Math.abs(snapped.y - prev[1]);
      setStat(`[${TYPES[state.drawing.type].label}] 길이: ${dist}px (클릭 확정 / 시작점 클릭 시 완료)`);
    }
"""
text = text.replace(buggy_tooltip, fixed_tooltip)

codecs.open(fpath, 'w', encoding='utf-8').write(text)
print('Fixed prev undefined bug!')
