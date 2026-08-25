import codecs

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

target = """function showHandles(rec) {
  clearHandles();
  const xs = rec.points.map(p => p[0]), ys = rec.points.map(p => p[1]);
  const x1 = Math.min(...xs), y1 = Math.min(...ys);
  const x2 = Math.max(...xs), y2 = Math.max(...ys);
  const mx = (x1+x2)/2, my = (y1+y2)/2;
  const defs = [
    { px:[x1,y1], adjX:'x1', adjY:'y1', cls:'handle-corner handle-nwse', sz:14 },
    { px:[x2,y1], adjX:'x2', adjY:'y1', cls:'handle-corner handle-nesw', sz:14 },
    { px:[x2,y2], adjX:'x2', adjY:'y2', cls:'handle-corner handle-nwse', sz:14 },
    { px:[x1,y2], adjX:'x1', adjY:'y2', cls:'handle-corner handle-nesw', sz:14 },
    { px:[mx,y1], adjX:null, adjY:'y1', cls:'handle-edge handle-ns', sz:12 },
    { px:[x2,my], adjX:'x2', adjY:null, cls:'handle-edge handle-ew', sz:12 },
    { px:[mx,y2], adjX:null, adjY:'y2', cls:'handle-edge handle-ns', sz:12 },
    { px:[x1,my], adjX:'x1', adjY:null, cls:'handle-edge handle-ew', sz:12 },
  ];
  defs.forEach(def => {
    const half = def.sz/2;
    const marker = L.marker(pxToLatLng(def.px[0], def.px[1]), {
      draggable: true,
      icon: L.divIcon({ className: def.cls, iconSize:[def.sz,def.sz], iconAnchor:[half,half] })
    }).addTo(map);
    marker.on('dragstart', () => { snapshot(`${rec.room_id||typeOf(rec)} 크기 변경`); });
    marker.on('drag', e => {
      const [nx,ny] = latLngToPx(e.target.getLatLng());
      const cxs = rec.points.map(p=>p[0]), cys = rec.points.map(p=>p[1]);
      let cx1=Math.min(...cxs), cy1=Math.min(...cys), cx2=Math.max(...cxs), cy2=Math.max(...cys);
      if (def.adjX==='x1') cx1=Math.round(nx); if (def.adjX==='x2') cx2=Math.round(nx);
      if (def.adjY==='y1') cy1=Math.round(ny); if (def.adjY==='y2') cy2=Math.round(ny);
      if (Math.abs(cx2-cx1)<5||Math.abs(cy2-cy1)<5) return;
      rec.points=[[cx1,cy1],[cx2,cy1],[cx2,cy2],[cx1,cy2]];
      rec.centroid=centroidOf(rec.points);
      rec.area_px=Math.abs((cx2-cx1)*(cy2-cy1));
      const layer=state.layers.find(l=>l.rec===rec);
      if(layer) layer.poly.setLatLngs(rec.points.map(p=>pxToLatLng(p[0],p[1])));
    });
    marker.on('dragend', () => { showHandles(rec); });
    state.handles.push(marker);
  });
}"""

replacement = """function showHandles(rec) {
  clearHandles();
  
  // Create Vertex Handles
  rec.points.forEach((pt, i) => {
    const sz = 14;
    const marker = L.marker(pxToLatLng(pt[0], pt[1]), {
      draggable: true,
      icon: L.divIcon({ className: 'handle-corner handle-nwse', iconSize:[sz,sz], iconAnchor:[sz/2,sz/2] })
    }).addTo(map);
    
    marker.on('dragstart', () => { snapshot(`${rec.room_id||typeOf(rec)} 모서리 변경`); });
    marker.on('drag', e => {
      const [nx, ny] = latLngToPx(e.target.getLatLng());
      rec.points[i] = [Math.round(nx), Math.round(ny)];
      rec.centroid = centroidOf(rec.points);
      
      let area = 0;
      for (let k = 0; k < rec.points.length; k++) {
        const j = (k + 1) % rec.points.length;
        area += rec.points[k][0] * rec.points[j][1];
        area -= rec.points[j][0] * rec.points[k][1];
      }
      rec.area_px = Math.abs(area) / 2.0;
      
      const layer = state.layers.find(l=>l.rec===rec);
      if(layer) layer.poly.setLatLngs(rec.points.map(p=>pxToLatLng(p[0],p[1])));
    });
    marker.on('dragend', () => { showHandles(rec); });
    state.handles.push(marker);
  });
  
  // Create Edge Handles
  rec.points.forEach((pt1, i) => {
    const nextI = (i + 1) % rec.points.length;
    const pt2 = rec.points[nextI];
    const mx = (pt1[0] + pt2[0]) / 2;
    const my = (pt1[1] + pt2[1]) / 2;
    
    const sz = 12;
    const cls = Math.abs(pt1[0] - pt2[0]) > Math.abs(pt1[1] - pt2[1]) ? 'handle-edge handle-ns' : 'handle-edge handle-ew';
    
    const marker = L.marker(pxToLatLng(mx, my), {
      draggable: true,
      icon: L.divIcon({ className: cls, iconSize:[sz,sz], iconAnchor:[sz/2,sz/2] })
    }).addTo(map);
    
    let startP1, startP2, startMouse;
    
    marker.on('dragstart', e => {
      snapshot(`${rec.room_id||typeOf(rec)} 벽면 이동`);
      startP1 = [...rec.points[i]];
      startP2 = [...rec.points[nextI]];
      startMouse = latLngToPx(e.target.getLatLng());
    });
    
    marker.on('drag', e => {
      const currentMouse = latLngToPx(e.target.getLatLng());
      const dx = Math.round(currentMouse[0] - startMouse[0]);
      const dy = Math.round(currentMouse[1] - startMouse[1]);
      
      rec.points[i] = [startP1[0] + dx, startP1[1] + dy];
      rec.points[nextI] = [startP2[0] + dx, startP2[1] + dy];
      
      rec.centroid = centroidOf(rec.points);
      
      let area = 0;
      for (let k = 0; k < rec.points.length; k++) {
        const j = (k + 1) % rec.points.length;
        area += rec.points[k][0] * rec.points[j][1];
        area -= rec.points[j][0] * rec.points[k][1];
      }
      rec.area_px = Math.abs(area) / 2.0;
      
      const layer = state.layers.find(l=>l.rec===rec);
      if(layer) layer.poly.setLatLngs(rec.points.map(p=>pxToLatLng(p[0],p[1])));
    });
    marker.on('dragend', () => { showHandles(rec); });
    state.handles.push(marker);
  });
}"""

# Fallback regex approach if literal replace fails due to whitespace
if target not in text:
    import re
    # use a basic regex matching function showHandles(rec) { ... }
    match = re.search(r'function showHandles\(rec\) \{.*?\n\}', text, re.DOTALL)
    if match:
        text = text[:match.start()] + replacement + text[match.end():]
    else:
        print("COULD NOT FIND showHandles!")
else:
    text = text.replace(target, replacement)

codecs.open(fpath, 'w', encoding='utf-8').write(text)
print('Updated showHandles!')
