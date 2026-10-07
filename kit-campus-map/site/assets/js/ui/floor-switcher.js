/**
 * 실내 층 전환기 (라디오 묶음, 위층이 위). 경로가 지나는 층에는 점을 찍는다.
 * 그리고 지도 위쪽에 "테크노관 실내지도 · 닫기" 막대.
 */
import { h, icon, clear, fill } from './dom.js';
import { floorLabel } from '../core/format.js';

export function renderFloorSwitcher(root, { floors, current, routeFloors, i18n, onChange }) {
  clear(root);
  const group = h('div', { role: 'radiogroup', 'aria-label': i18n.t('indoor.floors') });
  for (const floor of floors.slice().reverse()) {
    const id = `floor-${floor}`;
    const input = h('input', {
      type: 'radio', name: 'floor', id, value: floor, checked: floor === current,
      onchange: () => onChange(floor),
    });
    const onRoute = routeFloors && routeFloors.includes(floor);
    group.append(h('label', { for: id, class: onRoute ? 'on-route' : null,
      title: onRoute ? i18n.t('indoor.onRoute') : null },
    input, h('span', null, floorLabel(floor, 'en'))));
  }
  root.append(h('div', { class: 'legend-title', 'aria-hidden': 'true' }, i18n.lang === 'ko' ? '층' : 'Floor'), group);
  root.hidden = false;
}

export function renderIndoorBar(root, { buildingName, i18n, onExit }) {
  fill(root,
    h('span', null, i18n.t('indoor.title', { building: buildingName })),
    h('button', { type: 'button', class: 'btn', onclick: onExit }, icon('close'), i18n.t('indoor.exit')),
  );
  root.hidden = false;
}
