import codecs

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

target = "if (state.drawing.points.length >= 3 && px[0] === state.drawing.points[0][0] && px[1] === state.drawing.points[0][1]) {"
replacement = """    const p0 = state.drawing.points[0];
    if (state.drawing.points.length >= 3 && Math.abs(rx - p0[0]) <= 10 && Math.abs(ry - p0[1]) <= 10) {"""

if target in text:
    text = text.replace(target, replacement)
    codecs.open(fpath, 'w', encoding='utf-8').write(text)
    print("Patched click tolerance!")
else:
    print("Could not find target!")
