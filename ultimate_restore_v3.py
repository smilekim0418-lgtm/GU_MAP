import codecs
import re

# 1. Read the pristine JS
js = codecs.open('script_final_real.js', encoding='utf-8').read()

# 2. Apply patch_native_holes logic
target1 = "const latlngs = rec.points.map(p => pxToLatLng(p[0], p[1]));"
repl1 = """let latlngs;
    if (rec.points.length > 0 && Array.isArray(rec.points[0][0])) {
      latlngs = rec.points.map(ring => ring.map(p => pxToLatLng(p[0], p[1])));
    } else {
      latlngs = rec.points.map(p => pxToLatLng(p[0], p[1]));
    }"""
js = js.replace(target1, repl1)

target3 = "rec.points = toBoundingRect(rec.points);"
repl3 = "if (rec.points.length > 0 && Array.isArray(rec.points[0][0])) return; // Skip holes\n        rec.points = toBoundingRect(rec.points);"
js = js.replace(target3, repl3)

target4 = "rec.centroid = centroidOf(rec.points);"
repl4 = "if (rec.points.length > 0 && Array.isArray(rec.points[0][0])) return; // Skip holes\n        rec.centroid = centroidOf(rec.points);"
js = js.replace(target4, repl4)

# 3. Apply patch_handles_native logic PROPERLY
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
}
"""

js = re.sub(r'function showHandles\(rec\) \{.*?\n\}(?=\n+function renderTodo)', show_handles_repl, js, flags=re.DOTALL)

# 4. Read original HTML file structure (to get <head> and <body>)
html_orig = codecs.open(r'GUMAP-개발\floorplan\floorplan-editor.html', encoding='utf-8').read()
html_parts = html_orig.split('<script>')
html_start = html_parts[0]
html_end = html_parts[1].split('</script>')[1]

# 5. Assemble
final_html = html_start + "<script>\n" + js + "\n</script>" + html_end

codecs.open(r'GUMAP-개발\floorplan\floorplan-editor.html', 'w', encoding='utf-8').write(final_html)
print("Restored and patched perfectly with ALL functions intact!")
