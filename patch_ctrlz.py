import codecs

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

target = "if (ev.ctrlKey && (ev.key==='z'||ev.key==='Z')) { ev.preventDefault(); undo(); return; }"
replacement = """if (ev.ctrlKey && (ev.key==='z'||ev.key==='Z')) { 
      ev.preventDefault();
      if (state.drawing && state.drawing.mode === 'poly') {
        if (state.drawing.points.length > 0) {
          state.drawing.points.pop();
          const m = state.drawing.markers.pop();
          if (m) map.removeLayer(m);
          
          if (state.drawing.polyline) map.removeLayer(state.drawing.polyline);
          if (state.drawing.points.length > 0) {
            const latlngs = state.drawing.points.map(p => pxToLatLng(p[0], p[1]));
            const previewColor = TYPES[state.drawing.type].color;
            state.drawing.polyline = L.polyline(latlngs, {color:previewColor, weight:2, dashArray:'4'}).addTo(map);
          } else {
            state.drawing.polyline = null;
          }
          
          if (state.drawing.previewLine) {
            map.removeLayer(state.drawing.previewLine);
            state.drawing.previewLine = null;
          }
          
          setStat(`[${TYPES[state.drawing.type].label}] 점 취소됨 (현재 ${state.drawing.points.length}개)`);
        }
      } else {
        undo();
      }
      return; 
    }"""

if target in text:
    text = text.replace(target, replacement)
    codecs.open(fpath, 'w', encoding='utf-8').write(text)
    print("Patched ctrl+z for poly draw!")
else:
    print("Target not found")
