

const API = '';
const FLOORS = ["B1F","1F","2F","3F","4F","5F","6F"];

// ── 타입 정의 ────────────────────────────────────────────
const TYPES = {
  room:     { label:'방',         color:'#22c55e', fill:0.18 },
  corridor: { label:'복도',       color:'#a78bfa', fill:0.22 },
  door:     { label:'문',         color:'#fb923c', fill:0.30 },
  stairs:   { label:'계단',       color:'#38bdf8', fill:0.25 },
  elevator: { label:'엘리베이터', color:'#f472b6', fill:0.25 },
};
const TYPE_KEYS = Object.keys(TYPES);

function typeOf(rec) { return rec.type || 'room'; }

let state = {
  floor: '2F',
  data: null,
  layers: [],
  selected: null,
  drawing: null,
  selectedRoomId: null,
  drawType: 'room',
  dirty: false,
  undo: [],
  handles: []
};

const UNDO_LIMIT = 50;

function snapshot(label) {
  state.undo.push({
    label,
    polygons: JSON.parse(JSON.stringify(state.data.polygons)),
    missing: (state.data.report && state.data.report.missing || []).slice()
  });
  if (state.undo.length > UNDO_LIMIT) state.undo.shift();
  state.dirty = true;
}

function undo() {
  const prev = state.undo.pop();
  if (!prev) { setStat('되돌릴 작업이 없습니다'); return; }
  state.data.polygons = prev.polygons;
  if (state.data.report) state.data.report.missing = prev.missing;
  state.selected = null;
  clearHandles();
  renderPolygons(); renderTodo();
  setStat(`되돌림: ${prev.label} (남은 되돌리기 ${state.undo.length})`);
}

const map = L.map('map', { crs: L.CRS.Simple, minZoom: -5, maxZoom: 4, zoomControl: true });
let imageLayer = null;

function pxToLatLng(x, y) { return map.unproject([x, y], 0); }
function latLngToPx(ll) { const p = map.project(ll, 0); return [p.x, p.y]; }

async function loadFloor(floor) {
  state.floor = floor;
  state.dirty = false;
  state.undo = [];
  state.selected = null;
  state.selectedRoomId = null;
  clearHandles();
  const res = await fetch(`${API}/work/${floor}_labeled.json?t=${Date.now()}`);
  if (!res.ok) { setStat(`work/${floor}_labeled.json 없음`); return; }
  state.data = await res.json();

  let normalized = 0; // Removed auto-normalization

  const [w, h] = state.data.size;
  if (imageLayer) map.removeLayer(imageLayer);
  const bounds = [pxToLatLng(0, 0), pxToLatLng(w, h)];
  imageLayer = L.imageOverlay(`${API}/work/${floor}_raster_400.png`, bounds, { opacity: 0.85 }).addTo(map);
  map.fitBounds(bounds);

  renderPolygons(); renderTodo();
  if (normalized > 0) {
    state.dirty = true;
    setStat(`${state.floor} 로드 — ${normalized}개 직사각형 정규화됨 (저장 필요)`);
  }
}

// ── 바운딩 직사각형 ──────────────────────────────────────
function toBoundingRect(points) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  return [[Math.min(...xs),Math.min(...ys)],[Math.max(...xs),Math.min(...ys)],
          [Math.max(...xs),Math.max(...ys)],[Math.min(...xs),Math.max(...ys)]];
}
function isAlreadyRect(points) {
  if (points.length !== 4) return false;
  return [...new Set(points.map(p=>p[0]))].length === 2 &&
         [...new Set(points.map(p=>p[1]))].length === 2;
}
function normalizeAllToRects() {
  const nonRect = state.data.polygons.filter(r => !isAlreadyRect(r.points));
  if (!nonRect.length) { setStat('이미 모두 직사각형'); return; }
  if (!confirm(`${nonRect.length}개를 직사각형으로 변환? (되돌리기 가능)`)) return;
  snapshot(`직사각형 정규화 ${nonRect.length}개`);
  nonRect.forEach(rec => {
    if (rec.points.length > 0 && Array.isArray(rec.points[0][0])) return; // Skip holes
        rec.points = toBoundingRect(rec.points);
    if (rec.points.length > 0 && Array.isArray(rec.points[0][0])) return; // Skip holes
        rec.centroid = centroidOf(rec.points);
    const xs = rec.points.map(p=>p[0]), ys = rec.points.map(p=>p[1]);
    rec.area_px = Math.abs((Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys)));
  });
  state.selected = null; clearHandles(); renderPolygons();
  setStat(`${nonRect.length}개 정규화 — 저장 필요`);
}

// ── 잡음 / 스타일 ────────────────────────────────────────
function isLikelyFrameNoise(rec) {
  if (rec.room_id || (rec.type && rec.type !== 'room')) return false;
  const xs = rec.points.map(p => p[0]), ys = rec.points.map(p => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  if (w === 0 || h === 0) return true;
  return Math.max(w, h) / Math.min(w, h) > 6;
}

function styleFor(rec) {
  const t = typeOf(rec);
  const def = TYPES[t];
  if (t === 'room' && !rec.room_id) {
    if (isLikelyFrameNoise(rec)) return { color:'#64748b', weight:1, fillColor:'#64748b', fillOpacity:0.06 };
    return { color:'#ef4444', weight:2, fillColor:'#ef4444', fillOpacity:0.22 };
  }
  if (def) return { color:def.color, weight:2, fillColor:def.color, fillOpacity:def.fill };
  return { color:'#ef4444', weight:2, fillColor:'#ef4444', fillOpacity:0.22 };
}

// ── 라벨 생성 ────────────────────────────────────────────
function labelFor(rec) {
  const t = typeOf(rec);
  switch (t) {
    case 'room':
      return rec.room_id || null;
    case 'corridor':
      return rec.room_id ? `복도:${rec.room_id}` : '복도';
    case 'door':
      if (rec.connects && rec.connects.length === 2)
        return `🚪${rec.connects[0]}↔${rec.connects[1]}`;
      return rec.room_id ? `🚪${rec.room_id}` : '🚪';
    case 'stairs':
      return rec.room_id
        ? `계단:${rec.room_id}` + (rec.connects_floors ? `(${rec.connects_floors.join('↔')})` : '')
        : '계단';
    case 'elevator':
      return rec.room_id
        ? `EV:${rec.room_id}` + (rec.connects_floors ? `(${rec.connects_floors.join('↔')})` : '')
        : 'EV';
  }
  return null;
}

function purgeFrameNoise() {
  const doomed = state.data.polygons.filter(isLikelyFrameNoise);
  if (!doomed.length) { setStat('잡음 없음'); return; }
  if (!confirm(`잡음 ${doomed.length}개 제거? (되돌리기 가능)`)) return;
  snapshot(`잡음 ${doomed.length}개 제거`);
  state.data.polygons = state.data.polygons.filter(r => !isLikelyFrameNoise(r));
  state.selected = null; clearHandles(); renderPolygons();
  setStat(`잡음 ${doomed.length}개 제거 — 저장 필요`);
}

// ── 렌더링 ───────────────────────────────────────────────
function renderPolygons() {
  state.layers.forEach(l => map.removeLayer(l.poly));
  state.layers = [];
  state.data.polygons.forEach(rec => {
    let latlngs;
    if (rec.points.length > 0 && Array.isArray(rec.points[0][0])) {
      latlngs = rec.points.map(ring => ring.map(p => pxToLatLng(p[0], p[1])));
    } else {
      latlngs = rec.points.map(p => pxToLatLng(p[0], p[1]));
    }
    const poly = L.polygon(latlngs, styleFor(rec)).addTo(map);
    poly.on('click', e => { L.DomEvent.stop(e); select(rec, e); });
    const lbl = labelFor(rec);
    if (lbl) poly.bindTooltip(lbl, { permanent:true, direction:'center', className:'lbl' });
    state.layers.push({ poly, rec });
  });
  updateStat();
}

// ── 선택 & 핸들 ─────────────────────────────────────────
function clearHandles() {
  state.handles.forEach(m => map.removeLayer(m));
  state.handles = [];
}

function select(rec, e) {
  if (state.drawing) return;
  if (!state.multiSelected) state.multiSelected = [];
  
  const isShift = e && e.originalEvent && e.originalEvent.shiftKey;
  if (isShift) {
    if (state.multiSelected.includes(rec)) state.multiSelected = state.multiSelected.filter(r => r !== rec);
    else state.multiSelected.push(rec);
  } else {
    state.multiSelected = [rec];
  }
  
  state.selected = state.multiSelected.length > 0 ? state.multiSelected[state.multiSelected.length - 1] : null;

  state.layers.forEach(l => l.poly.setStyle(
    state.multiSelected.includes(l.rec) ? { color:'#facc15', weight:4, fillOpacity:0.35 } : styleFor(l.rec)
  ));
  
  if (state.multiSelected.length === 1) {
    const t = typeOf(state.selected);
    const parts = [`[${TYPES[t]?.label}]`];
    if (state.selected.room_id) parts.push(state.selected.room_id);
    if (state.selected.connects) parts.push(`연결: ${state.selected.connects.join('↔')}`);
    if (state.selected.connects_floors) parts.push(`층: ${state.selected.connects_floors.join('↔')}`);
    setStat(`선택: ${parts.join(' · ')}`);
    showHandles(state.selected);
  } else if (state.multiSelected.length > 1) {
    setStat(`다중 선택: ${state.multiSelected.length}개 (Delete 키로 일괄 삭제)`);
    clearHandles();
  } else {
    setStat('선택 해제됨');
    clearHandles();
  }
}

function deselect() {
  state.selected = null;
  state.multiSelected = [];
  clearHandles();
  if (state.data) state.layers.forEach(l => l.poly.setStyle(styleFor(l.rec)));
}

function showHandles(rec) {
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


// ── 그리기 (2점 직사각형 + 스냅) ─────────────────────────
let previewRect = null;
const mapEl = document.getElementById('map');
const SNAP_THRESHOLD = 12;
let snapGuides = [];

function setDrawingCursor(on) {
  if (on) mapEl.classList.add('drawing-mode');
  else mapEl.classList.remove('drawing-mode');
}
function collectEdges() {
  const xSet = new Set(), ySet = new Set();
  state.data.polygons.forEach(rec => {
    const xs = rec.points.map(p=>p[0]), ys = rec.points.map(p=>p[1]);
    xSet.add(Math.min(...xs)); xSet.add(Math.max(...xs));
    ySet.add(Math.min(...ys)); ySet.add(Math.max(...ys));
  });
  return { xs:[...xSet], ys:[...ySet] };
}
function snapValue(val, edges) {
  let best=null, bestDist=SNAP_THRESHOLD+1;
  for (const e of edges) { const d=Math.abs(val-e); if(d<bestDist){bestDist=d;best=e;} }
  return best!==null ? {val:best,snapped:true} : {val,snapped:false};
}
function snapPoint(x, y, edges) {
  if (state.drawing && state.drawing.type === 'corridor') return {x, y, snappedX: false, snappedY: false};
  const sx=snapValue(x,edges.xs), sy=snapValue(y,edges.ys);
  return {x:sx.val, y:sy.val, snappedX:sx.snapped, snappedY:sy.snapped};
}
function clearSnapGuides() { snapGuides.forEach(l=>map.removeLayer(l)); snapGuides=[]; }
function showSnapGuides(snapped) {
  clearSnapGuides();
  const [w,h] = state.data.size;
  if (snapped.snappedX) {
    snapGuides.push(L.polyline([pxToLatLng(snapped.x,0),pxToLatLng(snapped.x,h)],
      {color:'#22d3ee',weight:1,dashArray:'4 4',opacity:0.7}).addTo(map));
  }
  if (snapped.snappedY) {
    snapGuides.push(L.polyline([pxToLatLng(0,snapped.y),pxToLatLng(w,snapped.y)],
      {color:'#22d3ee',weight:1,dashArray:'4 4',opacity:0.7}).addTo(map));
  }
}

function startDraw() {
  const dt = state.drawType;
  if (dt === 'room' && !state.selectedRoomId) {
    setStat('방 타입은 먼저 오른쪽 목록에서 방을 선택하세요'); return;
  }
  deselect();
  state.drawing = { points:[], markers:[], edges:collectEdges(), type:dt };
  setDrawingCursor(true);
  setStat(`[${TYPES[dt].label}] 첫 번째 꼭짓점 클릭 (스냅 활성)`);
}

function clearPreview() {
  if (previewRect) { map.removeLayer(previewRect); previewRect=null; }
  if (state.drawing && state.drawing.previewLine) { map.removeLayer(state.drawing.previewLine); state.drawing.previewLine=null; }
  clearSnapGuides();
}
