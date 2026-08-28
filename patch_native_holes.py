import codecs

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

target1 = "const latlngs = rec.points.map(p => pxToLatLng(p[0], p[1]));"
repl1 = """let latlngs;
    if (rec.points.length > 0 && Array.isArray(rec.points[0][0])) {
      latlngs = rec.points.map(ring => ring.map(p => pxToLatLng(p[0], p[1])));
    } else {
      latlngs = rec.points.map(p => pxToLatLng(p[0], p[1]));
    }"""
text = text.replace(target1, repl1)

target2 = "function showHandles(rec) {\n  clearHandles();"
repl2 = """function showHandles(rec) {
  clearHandles();
  if (rec.points.length > 0 && Array.isArray(rec.points[0][0])) {
    // 다중 링(구멍이 있는 폴리곤)은 현재 핸들 편집을 지원하지 않음
    return;
  }"""
text = text.replace(target2, repl2)

target3 = "rec.points = toBoundingRect(rec.points);"
repl3 = "if (rec.points.length > 0 && Array.isArray(rec.points[0][0])) return; // Skip holes\n        rec.points = toBoundingRect(rec.points);"
text = text.replace(target3, repl3)

target4 = "rec.centroid = centroidOf(rec.points);"
repl4 = "if (rec.points.length > 0 && Array.isArray(rec.points[0][0])) return; // Skip holes\n        rec.centroid = centroidOf(rec.points);"
text = text.replace(target4, repl4)

codecs.open(fpath, 'w', encoding='utf-8').write(text)
print("Patched editor for native holes!")
