/**
 * 지도 위 라벨을 HTML 버튼으로 둔다.
 *
 * - 건물 번호 배지 + 이름. 줌이 낮으면 번호만 (map[data-labels]).
 * - 겹치면 우선순위가 낮은 쪽을 숨긴다. 선택된 건물은 항상 보인다.
 * - 버튼이라 Tab 으로 닿고 Enter 로 고른다. 스크린리더용 이름은 aria-label 에 전부 넣는다.
 */
import { h, icon } from '../ui/dom.js';

const FULL_LABEL_ZOOM = 16.4;
const PART_ZOOM = 17.7;
const STOP_ZOOM = 16.6;
const GAP = 4;

export function createLabels(map, { places, i18n, onSelect }) {
  const container = map.getContainer();
  const items = [];

  function add(element, lngLat, meta) {
    const marker = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat(lngLat).addTo(map);
    // MapLibre 가 마커에 붙이는 기본 aria-label('Map marker')을 지운다. 버튼이 이름을 갖는다.
    element.removeAttribute('aria-label');
    items.push({ element, marker, ...meta });
  }

  const ordered = places.buildings.slice().sort((a, b) => (a.no || 99) - (b.no || 99));
  for (const b of ordered) {
    const element = h('button', {
      type: 'button', class: 'label', dataset: { id: b.id },
      onclick: (event) => { event.stopPropagation(); onSelect({ type: 'building', id: b.id }); },
    },
    h('span', { class: b.no ? 'num' : 'num none', 'aria-hidden': 'true' }, b.no ? String(b.no) : ''),
    h('span', { class: 'text' }));
    add(element, b.center, { kind: 'building', id: b.id, priority: b.no ? 3 : 2, building: b });
    for (const part of b.parts || []) {
      const partEl = h('span', { class: 'label small', 'aria-hidden': 'true' }, h('span', { class: 'text part' }));
      add(partEl, part.center, { kind: 'part', id: b.id, priority: 1, part });
    }
  }
  for (const stop of places.bus_stops) {
    const element = h('button', {
      type: 'button', class: 'label stop', dataset: { id: stop.id },
      onclick: (event) => { event.stopPropagation(); onSelect({ type: 'bus', id: stop.id }); },
    }, h('span', { class: 'num', 'aria-hidden': 'true' }, icon('bus')), h('span', { class: 'text' }));
    add(element, stop.point, { kind: 'stop', id: stop.id, priority: 1, stop });
  }

  let activeId = null;
  let hiddenIds = new Set();

  function setTexts() {
    for (const item of items) {
      const text = item.element.querySelector('.text');
      if (item.kind === 'building') {
        const name = i18n.name(item.building.name);
        text.textContent = name;
        item.element.setAttribute('aria-label',
          item.building.no ? `${i18n.t('detail.number', { n: item.building.no })} ${name}` : name);
      } else if (item.kind === 'part') {
        text.textContent = i18n.name(item.part.name);
      } else {
        const name = i18n.name(item.stop.name);
        text.textContent = name;
        item.element.setAttribute('aria-label', `${i18n.t('detail.busStop')} ${name}`);
      }
    }
  }

  function layout() {
    const zoom = map.getZoom();
    container.dataset.labels = zoom >= FULL_LABEL_ZOOM ? 'full' : 'num';
    const placed = [];
    const ranked = items.slice().sort((a, b) =>
      (b.id === activeId) - (a.id === activeId) || b.priority - a.priority);
    for (const item of ranked) {
      const el = item.element;
      let visible = true;
      if (item.kind === 'part') visible = zoom >= PART_ZOOM;
      if (item.kind === 'stop') visible = zoom >= STOP_ZOOM;
      if (hiddenIds.has(item.id) && item.id !== activeId) visible = false;
      el.classList.toggle('is-active', item.id === activeId && item.kind !== 'part');
      if (visible) {
        const point = map.project(item.marker.getLngLat());
        const w = el.offsetWidth || 24;
        const hgt = el.offsetHeight || 22;
        const box = [point.x - w / 2 - GAP, point.y - hgt / 2 - GAP, point.x + w / 2 + GAP, point.y + hgt / 2 + GAP];
        const overlaps = placed.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1]);
        if (overlaps && item.id !== activeId) visible = false;
        else placed.push(box);
      }
      el.classList.toggle('is-hidden', !visible);
      if (el.tagName === 'BUTTON') el.tabIndex = visible ? 0 : -1;
    }
  }

  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; layout(); });
  };
  map.on('move', schedule);
  map.on('resize', schedule);

  setTexts();
  layout();

  return {
    setActive(id) { activeId = id; schedule(); },
    /** 분류 필터: 보일 건물 id 집합 (null 이면 전부) */
    setVisible(ids) {
      hiddenIds = new Set(ids ? items.filter((i) => i.kind !== 'stop' && !ids.has(i.id)).map((i) => i.id) : []);
      schedule();
    },
    refresh() { setTexts(); schedule(); },
    setDimmed(dim) { container.classList.toggle('is-indoor', dim); },
  };
}
