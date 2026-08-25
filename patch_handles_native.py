import codecs
import re

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

# Replace showHandles with a version that handles nested arrays
show_handles_repl = """function showHandles(rec) {
  clearHandles();

  const isNested = rec.points.length > 0 && Array.isArray(rec.points[0][0]);
  const rings = isNested ? rec.points : [rec.points];

  rings.forEach((ring, ringIdx) => {
    // Create Vertex Handles
    ring.forEach((pt, i) => {
      const sz = 14;
      const marker = L.marker(pxToLatLng(pt[0], pt[1]), {
        draggable: true,
        icon: L.divIcon({ className: 'handle-corner handle-nwse', iconSize:[sz,sz], iconAnchor:[sz/2,sz/2] })
      }).addTo(map);

      let origPt, origPrev, origNext, prevSharedX, nextSharedX;
      const prevI = (i - 1 + ring.length) % ring.length;
      const nextI = (i + 1) % ring.length;

      marker.on('dragstart', () => {
        snapshot(`${rec.room_id||typeOf(rec)} 꼭짓점 변경`);
        origPt = [...ring[i]];
        origPrev = [...ring[prevI]];
        origNext = [...ring[nextI]];
        prevSharedX = Math.abs(origPt[0] - origPrev[0]) < Math.abs(origPt[1] - origPrev[1]);
        nextSharedX = Math.abs(origPt[0] - origNext[0]) < Math.abs(origPt[1] - origNext[1]);
      });

      marker.on('drag', e => {
        const [nx, ny] = latLngToPx(e.target.getLatLng());
        const rnx = Math.round(nx), rny = Math.round(ny);

        ring[i] = [rnx, rny];
        if (prevSharedX) ring[prevI][0] = rnx; else ring[prevI][1] = rny;
        if (nextSharedX) ring[nextI][0] = rnx; else ring[nextI][1] = rny;

        if (!isNested) {
          rec.centroid = centroidOf(ring);
          let area = 0;
          for (let k = 0; k < ring.length; k++) {
            const j = (k + 1) % ring.length;
            area += ring[k][0] * ring[j][1];
            area -= ring[j][0] * ring[k][1];
          }
          rec.area_px = Math.abs(area) / 2.0;
        }

        const layer = state.layers.find(l=>l.rec===rec);
        if(layer) {
          let latlngs;
          if (isNested) latlngs = rec.points.map(r => r.map(p => pxToLatLng(p[0], p[1])));
          else latlngs = rec.points.map(p => pxToLatLng(p[0], p[1]));
          layer.poly.setLatLngs(latlngs);
        }
      });
      marker.on('dragend', () => { showHandles(rec); });
      state.handles.push(marker);
    });

    // Create Edge Handles
    ring.forEach((pt1, i) => {
      const nextI = (i + 1) % ring.length;
      const pt2 = ring[nextI];
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
        startP1 = [...ring[i]];
        startP2 = [...ring[nextI]];
        startMouse = latLngToPx(e.target.getLatLng());
      });

      marker.on('drag', e => {
        const currentMouse = latLngToPx(e.target.getLatLng());
        const dx = Math.round(currentMouse[0] - startMouse[0]);
        const dy = Math.round(currentMouse[1] - startMouse[1]);

        if (isHoriz) {
          ring[i][1] = startP1[1] + dy;
          ring[nextI][1] = startP2[1] + dy;
        } else {
          ring[i][0] = startP1[0] + dx;
          ring[nextI][0] = startP2[0] + dx;
        }

        if (!isNested) {
          rec.centroid = centroidOf(ring);
          let area = 0;
          for (let k = 0; k < ring.length; k++) {
            const j = (k + 1) % ring.length;
            area += ring[k][0] * ring[j][1];
            area -= ring[j][0] * ring[k][1];
          }
          rec.area_px = Math.abs(area) / 2.0;
        }

        const layer = state.layers.find(l=>l.rec===rec);
        if(layer) {
          let latlngs;
          if (isNested) latlngs = rec.points.map(r => r.map(p => pxToLatLng(p[0], p[1])));
          else latlngs = rec.points.map(p => pxToLatLng(p[0], p[1]));
          layer.poly.setLatLngs(latlngs);
        }
      });
      marker.on('dragend', () => { showHandles(rec); });
      state.handles.push(marker);
    });
  });
}"""

match = re.search(r'function showHandles\(rec\) \{.*?\n\}\n\n// ── 그리기', text, flags=re.DOTALL)
if match:
    text = text[:match.start()] + show_handles_repl + "\n\n// ── 그리기" + text[match.end():]
    codecs.open(fpath, 'w', encoding='utf-8').write(text)
    print("Patched showHandles successfully!")
else:
    print("Regex failed!")
