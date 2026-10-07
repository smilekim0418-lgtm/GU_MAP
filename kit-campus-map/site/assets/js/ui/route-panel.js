/**
 * 길찾기 패널: 출발·도착 고르기, 계단 피하기, 결과 요약과 단계 안내.
 *
 * 계산은 core/campus-route.js 가 하고, 여기서는 문장을 만들고 보여 준다.
 */
import { h, icon, clear, fill, showView } from './dom.js';
import { search } from '../core/search.js';
import { floorLabel, formatDistance, formatMinutes } from '../core/format.js';
import { describeLocation } from './search-panel.js';

const TURN_ICON = {
  left: 'turn-left', right: 'turn-right', 'slight-left': 'slight-left',
  'slight-right': 'slight-right', uturn: 'uturn',
};

export function endpointName(endpoint, places, i18n) {
  if (!endpoint) return '';
  const find = (list) => list.find((x) => x.id === endpoint.id);
  switch (endpoint.type) {
    case 'building': { const b = find(places.buildings); return b ? i18n.name(b.name) : ''; }
    case 'gate': { const g = find(places.gates); return g ? i18n.name(g.name) : ''; }
    case 'bus': { const s = find(places.bus_stops); return s ? i18n.name(s.name) : ''; }
    case 'unit': { const u = find(places.units); return u ? i18n.name(u.name) : ''; }
    case 'room': {
      const r = find(places.rooms);
      return r ? `${i18n.t('detail.room', { room: r.label })} ${i18n.name(r.name)}` : '';
    }
    case 'point': return endpoint.name ? i18n.name(endpoint.name) : i18n.t('route.myLocation');
    default: return '';
  }
}

function stepText(step, i18n) {
  const distance = step.meters !== undefined ? formatDistance(step.meters, i18n.lang) : '';
  switch (step.kind) {
    case 'depart': return i18n.t('step.depart', { place: i18n.name(step.place) });
    case 'walk': return i18n.t(step.turn ? `step.walk.${step.turn}` : 'step.walk', { distance });
    case 'enter': return i18n.t('step.enter', { place: i18n.name(step.place) });
    case 'exit': return i18n.t('step.exit', { place: i18n.name(step.place) });
    case 'stairs': return i18n.t('step.stairs', { name: step.name, to: floorLabel(step.to, i18n.lang) });
    case 'elevator': return i18n.t('step.elevator', { name: step.name, to: floorLabel(step.to, i18n.lang) });
    case 'arriveRoom': return i18n.t('step.arriveRoom', { room: step.room });
    case 'arrive': return i18n.t('step.arrive', { place: i18n.name(step.place) });
    default: return '';
  }
}

function stepIcon(step) {
  if (step.kind === 'walk') return step.turn ? TURN_ICON[step.turn] : 'arrow-up';
  return { depart: 'pin', enter: 'door', exit: 'exit', stairs: 'stairs', elevator: 'elevator',
    arrive: 'flag', arriveRoom: 'flag' }[step.kind] || 'walk';
}

export function createRoutePanel({ places, getIndex, i18n, shell, plan, locate, onResult, onClose, onStepFloor }) {
  const root = document.getElementById('view-route');
  const state = { from: null, to: null, avoidStairs: false, picking: null, result: null, message: null };
  let pickerQuery = '';

  function pickerRows() {
    const rows = [];
    if (!pickerQuery) {
      for (const b of places.buildings.slice().sort((a, c) => (a.no || 99) - (c.no || 99))) {
        rows.push({ endpoint: { type: 'building', id: b.id }, title: i18n.name(b.name),
          lead: b.no ? String(b.no) : null });
      }
      return rows;
    }
    for (const hit of search(getIndex(), pickerQuery, { limit: 30 })) {
      const endpoint = { type: hit.type, id: hit.id };
      let sub = '';
      if (hit.type === 'unit') sub = describeLocation(places.units.find((u) => u.id === hit.id), places, i18n);
      if (hit.type === 'room') {
        const r = places.rooms.find((x) => x.id === hit.id);
        sub = describeLocation({ building: r.building, floor: r.floor }, places, i18n);
      }
      const b = hit.type === 'building' ? places.buildings.find((x) => x.id === hit.id) : null;
      rows.push({ endpoint, title: endpointName(endpoint, places, i18n), sub, lead: b && b.no ? String(b.no) : null });
    }
    return rows;
  }

  function choose(which, endpoint) {
    state[which] = endpoint;
    state.picking = null;
    pickerQuery = '';
    run();
  }

  async function chooseHere(which) {
    state.message = { type: 'info', text: i18n.t('route.locating') };
    render();
    const result = await locate();
    if (result.error) {
      state.message = { type: 'error', text: i18n.t(result.error) };
      state.picking = null;
      render();
      return;
    }
    state.message = null;
    choose(which, { type: 'point', point: result.point });
  }

  function renderPicker(which) {
    const input = h('input', {
      type: 'search', value: pickerQuery, placeholder: i18n.t('route.pickPlaceholder'),
      'aria-label': `${i18n.t(which === 'from' ? 'route.from' : 'route.to')} — ${i18n.t('route.pick')}`,
    });
    const list = h('ul', { class: 'rows', role: 'list' });
    const fill = () => {
      clear(list);
      for (const r of pickerRows()) {
        list.append(h('li', null, h('button', {
          type: 'button', class: 'row', onclick: () => choose(which, r.endpoint),
        }, r.lead ? h('span', { class: 'badge', 'aria-hidden': 'true' }, r.lead)
          : h('span', { class: 'badge kind', 'aria-hidden': 'true' }, icon(r.endpoint.type === 'room' ? 'room'
            : r.endpoint.type === 'bus' ? 'bus' : r.endpoint.type === 'unit' ? 'dept' : 'building')),
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, r.title),
          r.sub ? h('span', { class: 'row-sub' }, r.sub) : null))));
      }
    };
    let timer = 0;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { pickerQuery = input.value.trim(); fill(); }, 120);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { state.picking = null; render(); }
      if (event.key === 'ArrowDown') { const first = list.querySelector('.row'); if (first) { event.preventDefault(); first.focus(); } }
    });
    fill();
    const quick = h('div', { class: 'quick', role: 'group', 'aria-label': i18n.t('route.quick') },
      h('button', { type: 'button', class: 'chip', onclick: () => choose(which, { type: 'gate', id: 'main' }) },
        icon('gate'), i18n.t('route.gate')),
      which === 'from' ? h('button', { type: 'button', class: 'chip', onclick: () => chooseHere(which) },
        icon('locate'), i18n.t('route.myLocation')) : null,
      places.bus_stops.map((s) => h('button', { type: 'button', class: 'chip', onclick: () => choose(which, { type: 'bus', id: s.id }) },
        icon('bus'), i18n.name(s.name))));
    const box = h('div', { class: 'picker' }, input, quick, list);
    setTimeout(() => input.focus(), 0);
    return box;
  }

  function endField(which) {
    const endpoint = state[which];
    const name = endpointName(endpoint, places, i18n);
    return h('div', { class: 'end-field' },
      h('span', { class: 'end-label', id: `end-${which}` }, i18n.t(which === 'from' ? 'route.from' : 'route.to')),
      h('button', {
        type: 'button', class: name ? 'end-button' : 'end-button placeholder',
        'aria-labelledby': `end-${which} end-${which}-value`, 'aria-expanded': String(state.picking === which),
        onclick: () => { state.picking = state.picking === which ? null : which; pickerQuery = ''; render(); },
      }, h('span', { class: which === 'to' ? 'dot to' : 'dot', 'aria-hidden': 'true' }),
      h('span', { id: `end-${which}-value` }, name || i18n.t('route.pick'))));
  }

  function renderResult() {
    const r = state.result;
    if (!r) return null;
    if (r.error) {
      const key = { 'no-route': 'route.noRoute', 'no-route-stairs': 'route.noRouteStairs',
        'same-place': 'route.samePlace', 'unknown-place': 'route.noRoute' }[r.error];
      return h('p', { class: 'notice error', role: 'alert' }, icon('alert'), h('span', null, i18n.t(key)));
    }
    const time = formatMinutes(r.seconds, i18n.lang);
    const distance = formatDistance(r.meters, i18n.lang);
    const outdoorM = r.outdoor ? r.outdoor.meters : 0;
    const indoorM = r.indoor ? r.indoor.legs.reduce((s, l) => s + l.meters, 0) : 0;
    let floorOfStep = r.indoor && r.steps.some((s) => s.kind === 'exit') ? r.indoor.legs[0].floor : null;
    const steps = [];
    for (const step of r.steps) {
      if (step.kind === 'enter') floorOfStep = r.indoor.legs[0].floor;
      if (step.kind === 'exit') floorOfStep = null;
      if (step.kind === 'stairs' || step.kind === 'elevator') floorOfStep = step.to;
      const isEnd = step.kind === 'depart' || step.kind === 'arrive' || step.kind === 'arriveRoom';
      const floorChip = floorOfStep && step.kind === 'walk'
        ? h('span', { class: 'step-floor' }, floorLabel(floorOfStep, i18n.lang)) : null;
      const stepFloor = step.kind === 'stairs' || step.kind === 'elevator' ? step.to : floorOfStep;
      steps.push(h('li', { class: isEnd ? 'end' : null },
        h('span', { class: 'step-icon', 'aria-hidden': 'true' }, icon(stepIcon(step))),
        h('span', { class: 'step-text' },
          stepFloor && onStepFloor
            ? h('button', { type: 'button', class: 'step-button', onclick: () => onStepFloor(stepFloor) }, stepText(step, i18n))
            : stepText(step, i18n),
          floorChip)));
    }
    return h('div', null,
      h('div', { class: 'route-summary' },
        h('p', { class: 'route-time' }, time, h('small', null, distance)),
        r.indoor && r.outdoor ? h('p', { class: 'route-split' }, i18n.t('route.summaryIndoor', {
          outdoor: formatDistance(outdoorM, i18n.lang), indoor: formatDistance(indoorM, i18n.lang) })) : null,
        r.notes.length ? h('div', { class: 'route-notes' }, r.notes.map((note) =>
          h('p', { class: 'notice' }, icon(note === 'route.hasStairs' ? 'stairs' : 'info'),
            h('span', null, i18n.t(note))))) : null),
      h('h4', { class: 'section-title', style: 'margin-top:20px' }, i18n.t('route.steps')),
      h('ol', { class: 'steps' }, steps));
  }

  function render() {
    fill(root,
      h('div', { class: 'route-head' },
        h('h3', { id: 'route-title', tabindex: '-1' }, i18n.t('route.title')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': i18n.t('route.close'), onclick: onClose }, icon('close'))),
      h('div', { class: 'route-ends' },
        h('div', { class: 'ends' }, endField('from'), endField('to')),
        h('button', {
          type: 'button', class: 'icon-btn', 'aria-label': i18n.t('route.swap'), title: i18n.t('route.swap'),
          onclick: () => { [state.from, state.to] = [state.to, state.from]; run(); },
        }, icon('swap'))),
      state.picking ? renderPicker(state.picking) : null,
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: state.avoidStairs, onchange: (event) => {
          state.avoidStairs = event.target.checked; run();
        } }), i18n.t('route.avoidStairs')),
      state.message ? h('p', { class: state.message.type === 'error' ? 'notice error' : 'notice',
        role: state.message.type === 'error' ? 'alert' : 'status', style: 'margin-top:12px' },
      icon(state.message.type === 'error' ? 'alert' : 'info'), h('span', null, state.message.text)) : null,
      renderResult(),
    );
  }

  async function run() {
    state.result = null;
    if (state.from && state.to) {
      state.result = await plan(state.from, state.to, { avoidStairs: state.avoidStairs });
      onResult(state.result && !state.result.error ? state.result : null, state);
      if (state.result && !state.result.error) {
        shell.announce(i18n.t('route.announce', {
          time: formatMinutes(state.result.seconds, i18n.lang),
          distance: formatDistance(state.result.meters, i18n.lang) }));
      } else if (state.result) {
        shell.announce(i18n.t(state.result.error === 'no-route-stairs' ? 'route.noRouteStairs' : 'route.noRoute'));
      }
    } else {
      onResult(null, state);
      if (!state.picking) state.picking = !state.from ? 'from' : (!state.to ? 'to' : null);
    }
    render();
  }

  return {
    async open({ from, to, avoidStairs } = {}) {
      state.from = from || null;
      state.to = to || null;
      if (avoidStairs !== undefined) state.avoidStairs = avoidStairs;
      state.picking = null;
      state.message = null;
      showView('route');
      shell.ensureSheet('half');
      if (from && from.type === 'here') {
        state.from = null;
        await run();
        await chooseHere('from');
      } else {
        await run();
      }
      const title = root.querySelector('#route-title');
      if (title && !state.picking) title.focus({ preventScroll: true });
    },
    refresh() { if (!root.hidden) render(); },
    get state() { return state; },
  };
}
