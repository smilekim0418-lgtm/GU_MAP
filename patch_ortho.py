import codecs

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

click_target = "if (state.drawing.points.length >= 3 && px[0] === state.drawing.points[0][0] && px[1] === state.drawing.points[0][1]) {"
click_replacement = """
    const prev = state.drawing.points[state.drawing.points.length - 1];
    let tx = px[0], ty = px[1];
    if (state.drawing.points.length > 0) {
      if (Math.abs(tx - prev[0]) > Math.abs(ty - prev[1])) ty = prev[1]; else tx = prev[0];
    }
    px[0] = tx; px[1] = ty;

    if (state.drawing.points.length >= 3 && Math.abs(px[0] - state.drawing.points[0][0]) <= 5 && Math.abs(px[1] - state.drawing.points[0][1]) <= 5) {
"""
text = text.replace(click_target, click_replacement)


mousemove_target = "const snapped = snapPoint(Math.round(rx), Math.round(ry), state.drawing.edges);"
mousemove_replacement = """
    let tx = Math.round(rx), ty = Math.round(ry);
    const prev = state.drawing.points[state.drawing.points.length - 1];
    const isHoriz = Math.abs(tx - prev[0]) > Math.abs(ty - prev[1]);
    if (isHoriz) ty = prev[1]; else tx = prev[0];

    const snapped = snapPoint(tx, ty, state.drawing.edges);
    if (isHoriz) snapped.y = prev[1]; else snapped.x = prev[0];
"""
text = text.replace(mousemove_target, mousemove_replacement)


tooltip_target = "latlngs.push(pxToLatLng(snapped.x, snapped.y));"
tooltip_replacement = """
    latlngs.push(pxToLatLng(snapped.x, snapped.y));
    const dist = isHoriz ? Math.abs(snapped.x - prev[0]) : Math.abs(snapped.y - prev[1]);
    setStat(`[${TYPES[state.drawing.type].label}] 길이: ${dist}px (클릭하여 확정, 시작점 클릭 시 완료)`);
"""
text = text.replace(tooltip_target, tooltip_replacement)

codecs.open(fpath, 'w', encoding='utf-8').write(text)
print('Added ortho mode and length stat!')
