
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

  let normalized = 0;
  state.data.polygons.forEach(rec => {
    if (!isAlreadyRect(rec.points)) {
      rec.points = toBoundingRect(rec.points);
      rec.centroid = centroidOf(rec.points);
      const xs = rec.points.map(p=>p[0]), ys = rec.points.map(p=>p[1]);
      rec.area_px = Math.abs((Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys)));
      normalized++;
    }
  });

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
    rec.points = toBoundingRect(rec.points);
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
    const latlngs = rec.points.map(p => pxToLatLng(p[0], p[1]));
    const poly = L.polygon(latlngs, styleFor(rec)).addTo(map);
    poly.on('click', e => { L.DomEvent.stop(e); select(rec); });
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

function select(rec) {
  if (state.drawing) return;
  state.selected = rec;
  state.layers.forEach(l => l.poly.setStyle(
    l.rec === rec ? { color:'#facc15', weight:4, fillOpacity:0.35 } : styleFor(l.rec)
  ));
  // 상태바에 상세 정보 표시
  const t = typeOf(rec);
  const parts = [`[${TYPES[t]?.label}]`];
  if (rec.room_id) parts.push(rec.room_id);
  if (rec.connects) parts.push(`연결: ${rec.connects.join('↔')}`);
  if (rec.connects_floors) parts.push(`층: ${rec.connects_floors.join('↔')}`);
  setStat(`선택: ${parts.join(' · ')}`);
  showHandles(rec);
}

function deselect() {
  state.selected = null;
  clearHandles();
  if (state.data) state.layers.forEach(l => l.poly.setStyle(styleFor(l.rec)));
}

function showHandles(rec) {
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
    marker.on('dragstart', () => { snapshot(`${rec.room_id||typeOf(rec)} 크기 조절`); });
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
}

// ── 사이드바 ─────────────────────────────────────────────
function renderTodo() {
  const box = document.getElementById('todo');
  const missing = (state.data.report && state.data.report.missing) || [];
  const counts = {}; TYPE_KEYS.forEach(k => counts[k]=0);
  state.data.polygons.forEach(rec => { counts[typeOf(rec)]=(counts[typeOf(rec)]||0)+1; });

  let html = '';

  // 미배치 방
  if (missing.length) {
    html += `<div class="section-hdr">미배치 방 (${missing.length})</div>`;
    html += missing.map(id =>
      `<div class="item" data-id="${id}"><div class="type-dot" style="background:#ef4444"></div>${id}</div>`).join('');
  }

  // 타입별 현황
  html += `<div class="section-hdr">배치 현황</div>`;
  TYPE_KEYS.forEach(k => {
    html += `<div class="item" style="cursor:default;opacity:.8"><div class="type-dot" style="background:${TYPES[k].color}"></div>${TYPES[k].label}: ${counts[k]}개</div>`;
  });

  // 문 연결 목록
  const doors = state.data.polygons.filter(r => typeOf(r)==='door');
  if (doors.length) {
    html += `<div class="section-hdr">문 연결 (${doors.length})</div>`;
    doors.forEach((d,i) => {
      const label = d.connects ? `${d.connects[0]} ↔ ${d.connects[1]}` : '(미설정)';
      html += `<div class="item" data-door="${i}"><div class="type-dot" style="background:#fb923c"></div>🚪 ${label}</div>`;
    });
  }

  // 계단/엘베 목록
  const verticals = state.data.polygons.filter(r => typeOf(r)==='stairs'||typeOf(r)==='elevator');
  if (verticals.length) {
    html += `<div class="section-hdr">수직이동 (${verticals.length})</div>`;
    verticals.forEach(v => {
      const icon = typeOf(v)==='stairs' ? '🪜' : '🛗';
      const id = v.room_id || '(미설정)';
      const fl = v.connects_floors ? v.connects_floors.join('↔') : '';
      html += `<div class="item" style="cursor:default"><div class="type-dot" style="background:${TYPES[typeOf(v)].color}"></div>${icon} ${id} ${fl?'('+fl+')':''}</div>`;
    });
  }

  if (!html) html = '<div class="item" style="color:#64748b">데이터 없음</div>';
  box.innerHTML = html;

  // 미배치 방 클릭
  box.querySelectorAll('.item[data-id]').forEach(el => {
    el.onclick = () => {
      box.querySelectorAll('.item').forEach(x => x.classList.remove('sel'));
      el.classList.add('sel');
      state.selectedRoomId = el.dataset.id;
      document.getElementById('drawType').value = 'room';
      state.drawType = 'room';
      setStat(`선택: ${state.selectedRoomId} — 그리기(D)`);
    };
  });

  // 문 클릭 → 해당 폴리곤 선택
  box.querySelectorAll('.item[data-door]').forEach(el => {
    el.onclick = () => {
      const doorRec = doors[parseInt(el.dataset.door)];
      if (doorRec) select(doorRec);
    };
  });
}

function updateStat() {
  const counts = {}; TYPE_KEYS.forEach(k => counts[k]=0);
  state.data.polygons.forEach(rec => { counts[typeOf(rec)]=(counts[typeOf(rec)]||0)+1; });
  const missing = (state.data.report && state.data.report.missing || []).length;
  const parts = TYPE_KEYS.filter(k=>counts[k]>0).map(k=>`${TYPES[k].label} ${counts[k]}`);
  setStat(`${state.floor} · ${parts.join(' · ')} · 미배치 ${missing}`);
}
function setStat(t) { document.getElementById('stat').textContent = t; }

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

// ── 그리기 후 속성 입력 프롬프트 ─────────────────────────

function finishPolyDraw() {
  if (!state.drawing || state.drawing.mode !== 'poly' || state.drawing.points.length < 3) return;
  const dt = state.drawing.type;
  const rectPoints = state.drawing.points.slice(); // Copy points
  
  // Calculate area roughly using Shoelace formula
  let area = 0;
  for (let i = 0; i < rectPoints.length; i++) {
    const j = (i + 1) % rectPoints.length;
    area += rectPoints[i][0] * rectPoints[j][1];
    area -= rectPoints[j][0] * rectPoints[i][1];
  }
  area = Math.abs(area) / 2.0;

  const rec = {
    points: rectPoints,
    area_px: area,
    centroid: centroidOf(rectPoints),
    room_id: dt === 'room' ? state.selectedRoomId : null,
    type: dt,
    candidates: []
  };

  state.drawing.markers.forEach(m => map.removeLayer(m));
  if (state.drawing.polyline) map.removeLayer(state.drawing.polyline);
  clearPreview();
  setDrawingCursor(false);
  state.drawing = null;

  if (dt !== 'room') promptForType(dt, rec);

  const label = rec.room_id || (rec.connects ? rec.connects.join('↔') : '') || TYPES[dt].label;
  snapshot(`${label} 다각형 그리기`);
  state.data.polygons.push(rec);

  if (dt === 'room' && state.selectedRoomId) {
    const missing = (state.data.report && state.data.report.missing) || [];
    const idx = missing.indexOf(state.selectedRoomId);
    if (idx >= 0) missing.splice(idx, 1);
  }

  state.selectedRoomId = null;
  renderPolygons(); renderTodo();
}

function promptForType(dt, rec) {
  switch (dt) {
    case 'corridor': {
      rec.room_id = '복도';
      break;
    }
    case 'door': {
      // 그려진 문의 바운딩 박스를 살짝(5px) 넓혀서 겹치는 방/복도 탐색
      const px = rec.points;
      const x1 = Math.min(...px.map(p=>p[0])) - 5, x2 = Math.max(...px.map(p=>p[0])) + 5;
      const y1 = Math.min(...px.map(p=>p[1])) - 5, y2 = Math.max(...px.map(p=>p[1])) + 5;

      const touching = new Set();
      state.data.polygons.forEach(other => {
        if (other === rec) return;
        const t = typeOf(other);
        if (t !== 'room' && t !== 'corridor') return;
        if (!other.room_id) return;
        
        const oxs = other.points.map(p=>p[0]), oys = other.points.map(p=>p[1]);
        const ox1 = Math.min(...oxs), ox2 = Math.max(...oxs);
        const oy1 = Math.min(...oys), oy2 = Math.max(...oys);

        if (!(x2 < ox1 || x1 > ox2 || y2 < oy1 || y1 > oy2)) {
          touching.add(other.room_id);
        }
      });
      
      const suggested = Array.from(touching).slice(0, 2);
      
      // 정확히 2개 공간과 닿아있으면 프롬프트 없이 자동 연결
      if (suggested.length === 2) {
        rec.connects = [suggested[0], suggested[1]];
        setStat(`자동 연결: ${suggested[0]} ↔ ${suggested[1]}`);
      } else {
        const cur = suggested.join(', ');
        const input = prompt(
          `이 문이 연결하는 2개 공간을 쉼표로 구분하여 입력하세요\n(위치 자동 추론 결과가 불확실하여 직접 입력 필요)\n\n추론된 공간: ${cur || '없음'}`, cur
        );
        if (input) {
          const parts = input.split(',').map(s => s.trim()).filter(Boolean);
          if (parts.length >= 2) rec.connects = [parts[0], parts[1]];
          else if (parts.length === 1) rec.connects = [parts[0], ''];
        }
      }
      break;
    }
    case 'stairs':
    case 'elevator': {
      const typeLabel = TYPES[dt].label;
      const id = prompt(`${typeLabel} ID를 입력하세요\n\n예: 계단-A, EV-1`);
      if (id && id.trim()) rec.room_id = id.trim();

      const floors = prompt(
        `이 ${typeLabel}이 연결하는 층을 쉼표로 구분하여 입력하세요\n\n예: 1F, 2F, 3F\n사용 가능: ${FLOORS.join(', ')}`
      );
      if (floors) {
        rec.connects_floors = floors.split(',').map(s => s.trim()).filter(Boolean);
      }
      break;
    }
  }
}

map.on('click', e => {
  if (!state.drawing) return;
  const [rx,ry] = latLngToPx(e.latlng);
  
    let tx = Math.round(rx), ty = Math.round(ry);
    let snapped = snapPoint(tx, ty, state.drawing.edges);
    
    if (state.drawing.points.length > 0) {
      const prev = state.drawing.points[state.drawing.points.length - 1];
      const isHoriz = Math.abs(tx - prev[0]) > Math.abs(ty - prev[1]);
      if (isHoriz) ty = prev[1]; else tx = prev[0];
      snapped = snapPoint(tx, ty, state.drawing.edges);
      if (isHoriz) snapped.y = prev[1]; else snapped.x = prev[0];
    }

  const px = [snapped.x, snapped.y];
  const dt = state.drawing.type;
  const previewColor = TYPES[dt].color;

  
  if (state.drawing.mode === 'poly') {
    
    const prev = state.drawing.points[state.drawing.points.length - 1];
    let tx = px[0], ty = px[1];
    if (state.drawing.points.length > 0) {
      if (Math.abs(tx - prev[0]) > Math.abs(ty - prev[1])) ty = prev[1]; else tx = prev[0];
    }
    px[0] = tx; px[1] = ty;

    if (state.drawing.points.length >= 3 && Math.abs(px[0] - state.drawing.points[0][0]) <= 5 && Math.abs(px[1] - state.drawing.points[0][1]) <= 5) {

      finishPolyDraw();
      return;
    }
    state.drawing.points.push(px);
    state.drawing.markers.push(
      L.circleMarker(pxToLatLng(px[0],px[1]), {radius:5,color:previewColor,fillColor:previewColor,fillOpacity:1}).addTo(map)
    );
    if (state.drawing.polyline) map.removeLayer(state.drawing.polyline);
    const latlngs = state.drawing.points.map(p => pxToLatLng(p[0], p[1]));
    state.drawing.polyline = L.polyline(latlngs, {color:previewColor, weight:2, dashArray:'4'}).addTo(map);
    return;
  }
  
  if (state.drawing.points.length === 0) {

    state.drawing.points.push(px);
    state.drawing.markers.push(
      L.circleMarker(pxToLatLng(px[0],px[1]), {radius:5,color:previewColor,fillColor:previewColor,fillOpacity:1}).addTo(map)
    );
    setStat(`[${TYPES[dt].label}] 두 번째 꼭짓점 클릭`);
  } else {
    const [x1,y1] = state.drawing.points[0];
    const [x2,y2] = px;
    const rectPoints = [
      [Math.min(x1,x2),Math.min(y1,y2)], [Math.max(x1,x2),Math.min(y1,y2)],
      [Math.max(x1,x2),Math.max(y1,y2)], [Math.min(x1,x2),Math.max(y1,y2)]
    ];

    const rec = {
      points: rectPoints,
      area_px: Math.abs((x2-x1)*(y2-y1)),
      centroid: centroidOf(rectPoints),
      room_id: dt === 'room' ? state.selectedRoomId : null,
      type: dt,
      candidates: []
    };

    // 타입별 추가 속성 입력
    state.drawing.markers.forEach(m => map.removeLayer(m));
    clearPreview();
    setDrawingCursor(false);
    state.drawing = null;

    if (dt !== 'room') promptForType(dt, rec);

    const label = rec.room_id || rec.connects?.join('↔') || TYPES[dt].label;
    snapshot(`${label} 그리기`);
    state.data.polygons.push(rec);

    if (dt === 'room' && state.selectedRoomId) {
      const missing = (state.data.report && state.data.report.missing) || [];
      const idx = missing.indexOf(state.selectedRoomId);
      if (idx >= 0) missing.splice(idx, 1);
    }

    state.selectedRoomId = null;
    renderPolygons(); renderTodo();
  }
});

map.on('mousemove', e => {
  
  if (!state.drawing) return;
  if (state.drawing.mode === 'poly') {
    if (state.drawing.points.length === 0) return;
    
    let tx = Math.round(rx), ty = Math.round(ry);
    let snapped = snapPoint(tx, ty, state.drawing.edges);
    
    if (state.drawing.points.length > 0) {
      const prev = state.drawing.points[state.drawing.points.length - 1];
      const isHoriz = Math.abs(tx - prev[0]) > Math.abs(ty - prev[1]);
      if (isHoriz) ty = prev[1]; else tx = prev[0];
      snapped = snapPoint(tx, ty, state.drawing.edges);
      if (isHoriz) snapped.y = prev[1]; else snapped.x = prev[0];
    }

    const previewColor = TYPES[state.drawing.type].color;
    
    if (previewRect) { map.removeLayer(previewRect); previewRect=null; }
  if (state.drawing && state.drawing.previewLine) { map.removeLayer(state.drawing.previewLine); state.drawing.previewLine=null; }
    
    const latlngs = state.drawing.points.map(p => pxToLatLng(p[0], p[1]));
    
    latlngs.push(pxToLatLng(snapped.x, snapped.y));
    if (state.drawing.points.length > 0) {
      const prev = state.drawing.points[state.drawing.points.length - 1];
      const isHoriz = Math.abs(snapped.x - prev[0]) > Math.abs(snapped.y - prev[1]);
      const dist = isHoriz ? Math.abs(snapped.x - prev[0]) : Math.abs(snapped.y - prev[1]);
      setStat(`[${TYPES[state.drawing.type].label}] 길이: ${dist}px (클릭 확정 / 시작점 클릭 시 완료)`);
    }

    
    if (state.drawing.previewLine) map.removeLayer(state.drawing.previewLine);
    state.drawing.previewLine = L.polyline(latlngs, {color:previewColor, weight:2, dashArray:'4'}).addTo(map);
    return;
  }
  if (state.drawing.points.length !== 1) return;

  const [x1,y1] = state.drawing.points[0];
  const [rx,ry] = latLngToPx(e.latlng);
  
    let tx = Math.round(rx), ty = Math.round(ry);
    let snapped = snapPoint(tx, ty, state.drawing.edges);
    
    if (state.drawing.points.length > 0) {
      const prev = state.drawing.points[state.drawing.points.length - 1];
      const isHoriz = Math.abs(tx - prev[0]) > Math.abs(ty - prev[1]);
      if (isHoriz) ty = prev[1]; else tx = prev[0];
      snapped = snapPoint(tx, ty, state.drawing.edges);
      if (isHoriz) snapped.y = prev[1]; else snapped.x = prev[0];
    }

  const previewColor = TYPES[state.drawing.type].color;
  const bounds = [pxToLatLng(x1,y1), pxToLatLng(snapped.x, snapped.y)];
  if (previewRect) {
    previewRect.setBounds(bounds);
  } else {
    previewRect = L.rectangle(bounds, {
      color:previewColor, weight:2, fillColor:previewColor, fillOpacity:0.15, dashArray:'6 4'
    }).addTo(map);
  }
  showSnapGuides(snapped);
});

function centroidOf(pts) {
  const n=pts.length;
  return [pts.reduce((s,p)=>s+p[0],0)/n, pts.reduce((s,p)=>s+p[1],0)/n];
}

// ── 속성 편집 ────────────────────────────────────────────
function editSelected() {
  if (!state.selected) { setStat('편집할 폴리곤을 먼저 클릭하세요'); return; }
  const rec = state.selected;
  const t = typeOf(rec);

  switch (t) {
    case 'room': {
      const oldId = rec.room_id || '';
      const newId = prompt(`방 번호 수정\n현재: ${oldId || '(없음)'}`, oldId);
      if (newId === null) return;
      const trimmed = newId.trim();
      snapshot(`${oldId||'무번호'} → ${trimmed||'(제거)'}`);
      if (oldId && state.data.report?.missing) {
        if (!state.data.polygons.some(r => r !== rec && r.room_id === oldId))
          state.data.report.missing.push(oldId);
      }
      rec.room_id = trimmed || null;
      if (trimmed && state.data.report?.missing) {
        const idx = state.data.report.missing.indexOf(trimmed);
        if (idx >= 0) state.data.report.missing.splice(idx, 1);
      }
      break;
    }
    case 'corridor': {
      const oldId = rec.room_id || '복도';
      const newId = prompt(`복도 ID 수정 (기본 '복도'로 묶어 쓰는 것을 권장)\n현재: ${oldId}`, oldId);
      if (newId === null) return;
      snapshot(`복도 ID 변경`);
      rec.room_id = newId.trim() || null;
      break;
    }
    case 'door': {
      const spaces = state.data.polygons
        .filter(r => r.room_id && (typeOf(r)==='room'||typeOf(r)==='corridor'))
        .map(r => r.room_id);
      const cur = rec.connects ? rec.connects.join(', ') : '';
      const hint = spaces.length ? `\n사용 가능: ${spaces.join(', ')}` : '';
      const input = prompt(`문 연결 수정 (쉼표로 2개 공간)${hint}\n현재: ${cur||'(미설정)'}`, cur);
      if (input === null) return;
      snapshot(`문 연결 변경`);
      const parts = input.split(',').map(s => s.trim()).filter(Boolean);
      rec.connects = parts.length >= 2 ? [parts[0], parts[1]] : parts.length === 1 ? [parts[0], ''] : null;
      break;
    }
    case 'stairs':
    case 'elevator': {
      const label = TYPES[t].label;
      const oldId = rec.room_id || '';
      const newId = prompt(`${label} ID 수정\n현재: ${oldId || '(없음)'}`, oldId);
      if (newId !== null) {
        snapshot(`${label} 속성 변경`);
        rec.room_id = newId.trim() || null;
      }
      const curFloors = rec.connects_floors ? rec.connects_floors.join(', ') : '';
      const newFloors = prompt(`${label} 연결 층 수정 (쉼표 구분)\n현재: ${curFloors||'(미설정)'}\n사용 가능: ${FLOORS.join(', ')}`, curFloors);
      if (newFloors !== null) {
        if (!newId) snapshot(`${label} 속성 변경`);
        rec.connects_floors = newFloors.split(',').map(s=>s.trim()).filter(Boolean);
        if (!rec.connects_floors.length) rec.connects_floors = null;
      }
      break;
    }
  }
  const selRec = state.selected;
  renderPolygons(); renderTodo();
  select(selRec);
}

// ── 타입 변경 ────────────────────────────────────────────
function changeTypeSelected() {
  if (!state.selected) { setStat('타입 변경할 폴리곤을 먼저 클릭하세요'); return; }
  const cur = typeOf(state.selected);
  const options = TYPE_KEYS.map((k,i) => `${i+1}. ${TYPES[k].label}${k===cur?' (현재)':''}`).join('\n');
  const input = prompt(`타입 변경\n\n${options}\n\n번호 입력:`, TYPE_KEYS.indexOf(cur)+1);
  if (input === null) return;
  const idx = parseInt(input) - 1;
  if (idx < 0 || idx >= TYPE_KEYS.length) { setStat('잘못된 번호'); return; }
  const newType = TYPE_KEYS[idx];
  if (newType === cur) return;

  snapshot(`타입변경 ${TYPES[cur].label}→${TYPES[newType].label}`);
  state.selected.type = newType;

  // 타입 변경 시 불필요한 속성 정리 & 새 속성 입력
  if (newType === 'door' && !state.selected.connects) {
    promptForType('door', state.selected);
  }
  if ((newType === 'stairs' || newType === 'elevator') && !state.selected.connects_floors) {
    promptForType(newType, state.selected);
  }
  if (newType !== 'door') delete state.selected.connects;
  if (newType !== 'stairs' && newType !== 'elevator') delete state.selected.connects_floors;

  const selRec = state.selected;
  renderPolygons(); renderTodo();
  select(selRec);
}

// ── 삭제 ─────────────────────────────────────────────────
function deleteSelected() {
  if (!state.selected) { setStat('삭제할 폴리곤을 먼저 클릭하세요'); return; }
  const t = typeOf(state.selected);
  const label = state.selected.room_id || state.selected.connects?.join('↔') || TYPES[t]?.label || '무번호';
  if (state.selected.room_id && !confirm(`${label} 삭제? (되돌리기 가능)`)) return;
  snapshot(`${label} 삭제`);
  const i = state.data.polygons.indexOf(state.selected);
  if (i >= 0) state.data.polygons.splice(i, 1);
  if (state.selected.room_id && t === 'room' && state.data.report?.missing)
    state.data.report.missing.push(state.selected.room_id);
  state.selected = null; clearHandles();
  renderPolygons(); renderTodo();
  setStat(`${label} 삭제 — Ctrl+Z 되돌리기`);
}

// ── 저장 ─────────────────────────────────────────────────
async function save() {
  const res = await fetch(`${API}/save/labeled`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(state.data)
  });
  if (res.ok) { state.dirty = false; state.undo = []; }
  setStat(res.ok ? '저장 완료' : '저장 실패');
}

// ── 초기화 ───────────────────────────────────────────────
const sel = document.getElementById('floor');
FLOORS.forEach(f => { const o=document.createElement('option'); o.value=f; o.textContent=f; sel.appendChild(o); });
sel.value = '2F';
sel.onchange = () => {
  if (state.dirty && !confirm('저장 안 된 변경이 있습니다. 버리고 층 변경?')) {
    sel.value = state.floor; return;
  }
  loadFloor(sel.value);
};

const drawTypeSel = document.getElementById('drawType');
drawTypeSel.onchange = () => { state.drawType = drawTypeSel.value; };

document.getElementById('draw').onclick = startDraw;

function startDrawPoly() {
  const dt = state.drawType;
  if (dt === 'room' && !state.selectedRoomId) {
    setStat('먼저 할당할 방 번호를 우측에서 선택하세요.'); return;
  }
  deselect();
  state.drawing = { points:[], markers:[], edges:collectEdges(), type:dt, mode:'poly' };
  setDrawingCursor(true);
  setStat(`[${TYPES[dt].label}] 다각형 그리기 (끝낼 땐 시작점 클릭 또는 Enter)`);
}

document.getElementById('drawPoly').onclick = startDrawPoly;

document.getElementById('del').onclick = deleteSelected;
document.getElementById('edit').onclick = editSelected;
document.getElementById('chtype').onclick = changeTypeSelected;
document.getElementById('normalize').onclick = normalizeAllToRects;
document.getElementById('purge').onclick = purgeFrameNoise;
document.getElementById('undo').onclick = undo;
document.getElementById('save').onclick = save;

document.addEventListener('keydown', ev => {
  if (ev.target.tagName==='INPUT'||ev.target.tagName==='TEXTAREA'||ev.target.tagName==='SELECT') return;
  if (ev.ctrlKey && (ev.key==='z'||ev.key==='Z')) { ev.preventDefault(); undo(); return; }
  if (ev.key==='Delete') deleteSelected();
  if (ev.key==='Enter' && state.drawing && state.drawing.mode==='poly') finishPolyDraw();
  if (ev.key==='Escape') {
    if (state.drawing) {
      state.drawing.markers.forEach(m=>map.removeLayer(m));
      clearPreview(); setDrawingCursor(false);
      state.drawing=null; setStat('그리기 취소');
    } else { deselect(); setStat('선택 해제'); }
    return;
  }
  if (!ev.ctrlKey && (ev.key==='d'||ev.key==='D')) startDraw();
  if (!ev.ctrlKey && (ev.key==='p'||ev.key==='P')) startDrawPoly();
  if (!ev.ctrlKey && (ev.key==='e'||ev.key==='E')) editSelected();
  if (!ev.ctrlKey && (ev.key==='t'||ev.key==='T')) changeTypeSelected();
});

window.addEventListener('beforeunload', ev => {
  if (!state.dirty) return; ev.preventDefault(); ev.returnValue='';
});
map.doubleClickZoom.disable();
loadFloor('2F');
