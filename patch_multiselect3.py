import codecs

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

target_click = "poly.on('click', e => { L.DomEvent.stop(e); select(rec); });"
repl_click = "poly.on('click', e => { L.DomEvent.stop(e); select(rec, e); });"
text = text.replace(target_click, repl_click)

target_select = """function select(rec) {
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
}"""

repl_select = """function select(rec, e) {
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
}"""

if target_select in text: text = text.replace(target_select, repl_select)
else: print("target_select not found")

target_deselect = """function deselect() {
  state.selected = null;
  clearHandles();
  if (state.data) state.layers.forEach(l => l.poly.setStyle(styleFor(l.rec)));
}"""

repl_deselect = """function deselect() {
  state.selected = null;
  state.multiSelected = [];
  clearHandles();
  if (state.data) state.layers.forEach(l => l.poly.setStyle(styleFor(l.rec)));
}"""
if target_deselect in text: text = text.replace(target_deselect, repl_deselect)
else: print("target_deselect not found")

target_del = """function deleteSelected() {
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
}"""

repl_del = """function deleteSelected() {
  const targets = (state.multiSelected && state.multiSelected.length > 0) ? state.multiSelected : (state.selected ? [state.selected] : []);
  if (targets.length === 0) { setStat('삭제할 대상을 먼저 클릭하세요'); return; }
  
  if (targets.length > 1) {
    if (!confirm(`선택한 ${targets.length}개를 삭제하시겠습니까? (되돌리기 가능)`)) return;
    snapshot(`${targets.length}개 일괄 삭제`);
    targets.forEach(rec => {
      const i = state.data.polygons.indexOf(rec);
      if (i >= 0) state.data.polygons.splice(i, 1);
      if (rec.room_id && typeOf(rec) === 'room' && state.data.report?.missing) {
        state.data.report.missing.push(rec.room_id);
      }
    });
    setStat(`${targets.length}개 삭제 완료 — Ctrl+Z 되돌리기`);
  } else {
    const rec = targets[0];
    const t = typeOf(rec);
    const label = rec.room_id || rec.connects?.join('↔') || TYPES[t]?.label || '무번호';
    if (rec.room_id && !confirm(`${label} 삭제? (되돌리기 가능)`)) return;
    snapshot(`${label} 삭제`);
    const i = state.data.polygons.indexOf(rec);
    if (i >= 0) state.data.polygons.splice(i, 1);
    if (rec.room_id && t === 'room' && state.data.report?.missing)
      state.data.report.missing.push(rec.room_id);
    setStat(`${label} 삭제 — Ctrl+Z 되돌리기`);
  }
  
  state.data.report?.missing?.sort((a,b) => String(a).localeCompare(String(b), undefined, {numeric: true}));
  
  state.selected = null; 
  state.multiSelected = [];
  clearHandles();
  renderPolygons(); renderTodo();
}"""
if target_del in text: text = text.replace(target_del, repl_del)
else: print("target_del not found")

codecs.open(fpath, 'w', encoding='utf-8').write(text)
print("Multiselect patched!")
