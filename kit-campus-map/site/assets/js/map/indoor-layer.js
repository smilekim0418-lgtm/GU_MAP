/**
 * 테크노관 실내지도: 층별 방·복도·문, 호실 번호 라벨(HTML), 계단·엘리베이터 아이콘.
 * 방을 누르면 onRoom('T312') 로 알린다.
 */
import { h, icon } from '../ui/dom.js';
import { ringCentroid, bounds } from '../core/geo.js';

const LABEL_ZOOM = 18;
const NAME_ZOOM = 19.3;
const ROOM_CATEGORIES = new Set(['classroom', 'laboratory', 'office', 'library', 'breakroom', 'utility']);

export function createIndoorLayer(view, { imdf, i18n, onRoom }) {
  const { map } = view;
  const container = map.getContainer();
  const floorOfLevel = new Map(imdf.levels.features.map((f) => [f.id, f.properties.short_name['ko-KR']]));
  const levelOfFloor = new Map([...floorOfLevel].map(([id, floor]) => [floor, id]));
  const floors = imdf.levels.features
    .slice().sort((a, b) => a.properties.ordinal - b.properties.ordinal)
    .map((f) => f.properties.short_name['ko-KR']);
  const allCoords = imdf.footprint.features.flatMap((f) => f.geometry.coordinates[0]);

  let active = false;
  let floor = '1F';
  let target = null;
  let markers = [];

  function unitFeatures(levelId) {
    return imdf.units.features
      .filter((f) => f.properties.level_id === levelId && f.geometry)
      .map((f) => {
        const label = (f.properties.label || {})['ko-KR'] || '';
        return {
          type: 'Feature',
          properties: { role: 'unit', category: f.properties.category, label, target: !!target && `T${label}` === target },
          geometry: f.geometry,
        };
      });
  }

  function render() {
    const levelId = levelOfFloor.get(floor);
    const features = [
      ...imdf.footprint.features
        .filter((f) => (f.properties.level_ids || []).includes(levelId))
        .map((f) => ({ type: 'Feature', properties: { role: 'footprint' }, geometry: f.geometry })),
      ...unitFeatures(levelId),
      ...imdf.openings.features
        .filter((f) => f.properties.level_id === levelId && f.geometry)
        .map((f) => ({ type: 'Feature', properties: { role: 'opening', category: f.properties.category }, geometry: f.geometry })),
    ];
    map.getSource('indoor').setData({ type: 'FeatureCollection', features });

    for (const marker of markers) marker.remove();
    markers = [];
    for (const f of imdf.units.features) {
      if (f.properties.level_id !== levelId || !f.geometry) continue;
      const category = f.properties.category;
      const label = (f.properties.label || {})['ko-KR'] || '';
      const name = (f.properties.name || {})['ko-KR'] || '';
      const center = ringCentroid(f.geometry.coordinates[0]);
      let element = null;
      if (category === 'stairs' || category === 'elevator') {
        element = h('span', { class: 'room-icon', title: `${i18n.t(`room.${category}`)} ${label}` },
          icon(category === 'stairs' ? 'stairs' : 'elevator'));
      } else if (ROOM_CATEGORIES.has(category) && label) {
        element = h('span', { class: `room-label${`T${label}` === target ? ' is-target' : ''}` },
          label, h('span', { class: 'room-name' }, name === `${label}호` ? '' : name));
      }
      if (!element) continue;
      element.setAttribute('aria-hidden', 'true');
      const marker = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat(center).addTo(map);
      marker.getElement().removeAttribute('aria-label');
      markers.push(marker);
    }
    zoomClass();
  }

  function zoomClass() {
    const zoom = map.getZoom();
    for (const marker of markers) marker.getElement().style.visibility = zoom >= LABEL_ZOOM ? 'visible' : 'hidden';
    container.dataset.rooms = zoom >= NAME_ZOOM ? 'full' : 'num';
  }

  map.on('zoom', () => { if (active) zoomClass(); });
  map.on('click', 'indoor-unit', (event) => {
    if (!active) return;
    const feature = event.features && event.features[0];
    const label = feature && feature.properties.label;
    if (label && ROOM_CATEGORIES.has(feature.properties.category)) onRoom(`T${label}`);
  });

  return {
    floors,
    get active() { return active; },
    get floor() { return floor; },
    enter({ floor: next, room } = {}) {
      active = true;
      if (next && floors.includes(next)) floor = next;
      target = room || null;
      view.ready.then(() => {
        render();
        view.setIndoorMode(true);
        view.fitCoords(allCoords, 19.2);
      });
    },
    setFloor(next) {
      if (!floors.includes(next)) return;
      floor = next;
      if (active) render();
    },
    setTarget(room) {
      target = room;
      if (active) render();
    },
    exit() {
      active = false;
      target = null;
      for (const marker of markers) marker.remove();
      markers = [];
      view.ready.then(() => {
        map.getSource('indoor').setData({ type: 'FeatureCollection', features: [] });
        view.setIndoorMode(false);
      });
    },
    bounds() { return bounds(allCoords); },
  };
}
