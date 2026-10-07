/**
 * 상세 안내: 건물 · 테크노관 호실 · 버스정류장.
 * 학과·시설을 고르면 그 건물 상세를 열고 해당 줄을 강조한다.
 */
import { h, icon, clear, fill, showView } from './dom.js';
import { floorLabel, telHref } from '../core/format.js';
import { roomTitle } from './search-panel.js';

function unverifiedBadge(i18n) {
  return h('span', { class: 'unverified', title: i18n.t('detail.unverifiedHint') }, i18n.t('detail.unverified'));
}

function phoneLink(number, label, i18n) {
  return h('a', { href: telHref(number), 'aria-label': i18n.t('detail.call', { label, number }) }, number);
}

function back(i18n, onBack) {
  return h('div', { class: 'detail-top' },
    h('button', { type: 'button', class: 'back-btn', onclick: onBack }, icon('chevron-left'), i18n.t('detail.back')));
}

function actionButton(name, text, onclick, primary) {
  return h('button', { type: 'button', class: primary ? 'btn btn-primary' : 'btn', onclick }, icon(name), text);
}

function locationText(unit, i18n) {
  const parts = [];
  if (unit.floor) parts.push(floorLabel(unit.floor, i18n.lang));
  if (unit.room) parts.push(i18n.t('detail.room', { room: unit.room }));
  if (unit.note) parts.push(i18n.name(unit.note));
  return parts.join(' · ');
}

function unitItem(unit, i18n, focused) {
  const meta = [];
  const where = locationText(unit, i18n);
  if (where) meta.push(h('span', null, where));
  if (unit.hours) meta.push(h('span', null, h('span', { class: 'sr-only' }, `${i18n.t('detail.hours')} `), unit.hours));
  if (unit.phone) meta.push(h('span', null, phoneLink(unit.phone, i18n.name(unit.name), i18n)));
  const iconName = unit.type || (unit.kind === 'dept' ? 'dept' : 'office');
  return h('li', { id: `unit-${unit.id}`, class: focused ? 'is-focused' : null, tabindex: focused ? '-1' : null },
    icon(iconName),
    h('div', { class: 'info-main' },
      h('p', { class: 'info-title' }, i18n.name(unit.name), unit.verified ? null : unverifiedBadge(i18n)),
      meta.length ? h('p', { class: 'info-meta' }, meta) : null));
}

export function createDetailPanel({ places, i18n, onBack, onRoute, onIndoor, onShare, onPick }) {
  const root = document.getElementById('view-detail');

  function head({ badge, title, subtitle, tag }) {
    return h('div', { class: 'detail-head' }, badge,
      h('div', null,
        h('h3', { class: 'detail-title', id: 'detail-title', tabindex: '-1' }, title),
        subtitle ? h('p', { class: 'detail-subtitle', lang: i18n.lang === 'ko' ? 'en' : 'ko' }, subtitle) : null,
        tag || null));
  }

  function otherName(name) {
    const other = i18n.lang === 'ko' ? name.en : name.ko;
    return other && other !== i18n.name(name) ? other : null;
  }

  function showBuilding(id, focusUnitId) {
    const b = places.buildings.find((x) => x.id === id);
    if (!b) return false;
    const units = places.units.filter((u) => u.building === id);
    const depts = units.filter((u) => u.kind !== 'facility');
    const facilities = units.filter((u) => u.kind === 'facility');
    const tagParts = [h('span', { class: `swatch cat-${b.category}`, 'aria-hidden': 'true',
    }),
    i18n.t(`cat.${b.category}`)];
    if (b.floors && b.floors.verified) {
      tagParts.push(' · ', b.floors.below
        ? i18n.t('detail.floors', { above: b.floors.above, below: b.floors.below })
        : i18n.t('detail.floorsAbove', { above: b.floors.above }));
    }

    fill(root,
      back(i18n, onBack),
      head({
        badge: b.no ? h('span', { class: 'badge', 'aria-hidden': 'true' }, String(b.no))
          : h('span', { class: 'badge none', 'aria-hidden': 'true' }, icon('building')),
        title: b.no ? h('span', null, h('span', { class: 'sr-only' }, `${i18n.t('detail.number', { n: b.no })} `), i18n.name(b.name)) : i18n.name(b.name),
        subtitle: otherName(b.name),
        tag: h('p', { class: 'tag' }, tagParts),
      }),
      h('div', { class: 'actions' },
        actionButton('route', i18n.t('detail.routeHere'), () => onRoute({ type: 'building', id }), true),
        b.indoor ? actionButton('floors', i18n.t('detail.indoor'), () => onIndoor(id)) : null,
        actionButton('link', i18n.t('detail.share'), onShare)),
      b.description ? h('section', { class: 'section' },
        h('h4', { class: 'section-title' }, i18n.t('detail.about')),
        h('p', { class: 'description' }, i18n.name(b.description))) : null,
      depts.length ? h('section', { class: 'section' },
        h('h4', { class: 'section-title' }, i18n.t('detail.units')),
        h('ul', { class: 'info-list' }, depts.map((u) => unitItem(u, i18n, u.id === focusUnitId)))) : null,
      facilities.length ? h('section', { class: 'section' },
        h('h4', { class: 'section-title' }, i18n.t('detail.facilities')),
        h('ul', { class: 'info-list' }, facilities.map((u) => unitItem(u, i18n, u.id === focusUnitId)))) : null,
      b.parts ? h('section', { class: 'section' },
        h('h4', { class: 'section-title' }, i18n.t('detail.parts')),
        h('p', { class: 'description' }, b.parts.map((p) => i18n.name(p.name)).join(', '))) : null,
      b.phones.length ? h('section', { class: 'section' },
        h('h4', { class: 'section-title' }, i18n.t('detail.contact')),
        h('ul', { class: 'phone-list' }, b.phones.map((p) => h('li', null,
          h('span', { class: 'label' }, i18n.name(p.label)),
          phoneLink(p.number, i18n.name(p.label), i18n))))) : null,
    );
    showView('detail');
    const focused = focusUnitId && root.querySelector(`#unit-${CSS.escape(focusUnitId)}`);
    if (focused) focused.scrollIntoView({ block: 'center' });
    return true;
  }

  function showRoom(id) {
    const r = places.rooms.find((x) => x.id === id);
    if (!r) return false;
    const b = places.buildings.find((x) => x.id === r.building);
    fill(root,
      back(i18n, onBack),
      head({
        badge: h('span', { class: 'badge kind', 'aria-hidden': 'true' }, icon('room')),
        title: roomTitle(r, i18n),
        subtitle: `${i18n.name(b.name)} · ${floorLabel(r.floor, i18n.lang)}`,
        tag: h('p', { class: 'tag' }, i18n.t(`room.${r.category}`)),
      }),
      h('div', { class: 'actions' },
        actionButton('route', i18n.t('detail.routeHere'), () => onRoute({ type: 'room', id }), true),
        actionButton('floors', i18n.t('room.viewIndoor'), () => onIndoor(r.building, { floor: r.floor, room: r.id })),
        actionButton('link', i18n.t('detail.share'), onShare)),
      !r.routable ? h('section', { class: 'section' },
        h('p', { class: 'notice' }, icon('info'), h('span', null, i18n.t('room.notRoutable')))) : null,
      h('section', { class: 'section' }, h('ul', { class: 'info-list' },
        h('li', null, icon('building'), h('div', { class: 'info-main' },
          h('button', { type: 'button', class: 'info-link', onclick: () => onPick({ type: 'building', id: b.id }) },
            i18n.name(b.name)),
          h('p', { class: 'info-meta' }, `${i18n.t('detail.location')}: ${floorLabel(r.floor, i18n.lang)}`))),
        r.dept ? h('li', null, icon('dept'), h('div', { class: 'info-main' },
          h('p', { class: 'info-title' }, i18n.name(r.dept)),
          h('p', { class: 'info-meta' }, i18n.t('detail.dept')))) : null)),
    );
    showView('detail');
    return true;
  }

  function showBus(id) {
    const s = places.bus_stops.find((x) => x.id === id);
    if (!s) return false;
    fill(root,
      back(i18n, onBack),
      head({
        badge: h('span', { class: 'badge kind', 'aria-hidden': 'true' }, icon('bus')),
        title: i18n.name(s.name),
        subtitle: otherName(s.name),
        tag: h('p', { class: 'tag' }, s.ref ? i18n.t('detail.busRef', { ref: s.ref }) : i18n.t('detail.busStop')),
      }),
      h('div', { class: 'actions' },
        actionButton('route', i18n.t('detail.routeFromHere'), () => onRoute(null, { type: 'bus', id }), true),
        actionButton('link', i18n.t('detail.share'), onShare)),
    );
    showView('detail');
    return true;
  }

  return {
    /** @returns {boolean} 보여 줄 것을 찾았는가 */
    show(target) {
      if (!target) return false;
      if (target.type === 'building') return showBuilding(target.id);
      if (target.type === 'gate') {
        const gate = places.gates.find((g) => g.id === target.id);
        return gate ? showBuilding(gate.building) : false;
      }
      if (target.type === 'unit') {
        const unit = places.units.find((u) => u.id === target.id);
        return unit ? showBuilding(unit.building, unit.id) : false;
      }
      if (target.type === 'room') return showRoom(target.id);
      if (target.type === 'bus') return showBus(target.id);
      return false;
    },
    focusTitle() {
      const title = root.querySelector('#detail-title');
      if (title) title.focus({ preventScroll: true });
    },
  };
}
