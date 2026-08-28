import codecs

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

# We need to replace the entire showHandles function again.
import re
match = re.search(r'function showHandles\(rec\) \{.*?\n\}', text, re.DOTALL)
if not match:
    print("Could not find showHandles")
    exit(1)

replacement = """function showHandles(rec) {
  clearHandles();
  
  // Create Vertex Handles
  rec.points.forEach((pt, i) => {
    const sz = 14;
    const marker = L.marker(pxToLatLng(pt[0], pt[1]), {
      draggable: true,
      icon: L.divIcon({ className: 'handle-corner handle-nwse', iconSize:[sz,sz], iconAnchor:[sz/2,sz/2] })
    }).addTo(map);
    
    let origPt, origPrev, origNext, prevSharedX, nextSharedX;
    const prevI = (i - 1 + rec.points.length) % rec.points.length;
    const nextI = (i + 1) % rec.points.length;
    
    marker.on('dragstart', () => { 
      snapshot(`${rec.room_id||typeOf(rec)} 꼭짓점 변경`); 
      origPt = [...rec.points[i]];
      origPrev = [...rec.points[prevI]];
      origNext = [...rec.points[nextI]];
      prevSharedX = Math.abs(origPt[0] - origPrev[0]) < Math.abs(origPt[1] - origPrev[1]);
      nextSharedX = Math.abs(origPt[0] - origNext[0]) < Math.abs(origPt[1] - origNext[1]);
    });
    
    marker.on('drag', e => {
      const [nx, ny] = latLngToPx(e.target.getLatLng());
      const rnx = Math.round(nx), rny = Math.round(ny);
      
      rec.points[i] = [rnx, rny];
      if (prevSharedX) rec.points[prevI][0] = rnx; else rec.points[prevI][1] = rny;
      if (nextSharedX) rec.points[nextI][0] = rnx; else rec.points[nextI][1] = rny;
      
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
    const isHoriz = Math.abs(pt1[0] - pt2[0]) > Math.abs(pt1[1] - pt2[1]);
    const cls = isHoriz ? 'handle-edge handle-ns' : 'handle-edge handle-ew';
    
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
      
      if (isHoriz) {
        rec.points[i][1] = startP1[1] + dy;
        rec.points[nextI][1] = startP2[1] + dy;
      } else {
        rec.points[i][0] = startP1[0] + dx;
        rec.points[nextI][0] = startP2[0] + dx;
      }
      
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

text = text[:match.start()] + replacement + text[match.end():]
codecs.open(fpath, 'w', encoding='utf-8').write(text)
print('Patched showHandles for ortho constraints!')
