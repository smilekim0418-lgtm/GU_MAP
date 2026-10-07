/**
 * 처음 화면(분류·편의시설·건물 목록)과 검색 결과.
 */
import { h, icon, clear, fill, showView } from './dom.js';
import { search } from '../core/search.js';
import { floorLabel } from '../core/format.js';

export const CATEGORIES = ['academic', 'admin', 'welfare', 'housing', 'sports', 'landmark'];
export const FACILITY_TYPES = ['food', 'cafe', 'store', 'bank', 'atm', 'health', 'print', 'laundry',
  'post', 'beauty', 'gym', 'hall'];
const KIND_ICON = { dept: 'dept', office: 'office', facility: 'info' };

function buildingNo(b, i18n) {
  return b.no ? h('span', { class: 'badge', 'aria-hidden': 'true' }, String(b.no))
    : h('span', { class: 'badge none', 'aria-hidden': 'true' }, icon('building'));
}

/** 행 버튼 하나. 스크린리더는 제목+부제를 그대로 읽는다. */
function row({ lead, title, sub, onclick, selected }) {
  return h('li', null, h('button', {
    type: 'button', class: 'row', onclick, 'aria-current': selected ? 'true' : undefined,
  }, lead, h('span', { class: 'row-main' },
    h('span', { class: 'row-title' }, title),
    sub ? h('span', { class: 'row-sub' }, sub) : null),
  icon('chevron-right', 'icon chev')));
}

/** '312호 컴퓨터실습실' — 이름 없는 방은 '312호' 만 */
export function roomTitle(room, i18n) {
  return `${i18n.t('detail.room', { room: room.label })} ${i18n.name(room.name)}`.trim();
}

export function describeLocation(item, places, i18n) {
  const b = places.buildings.find((x) => x.id === item.building);
  const parts = [];
  if (b) parts.push(i18n.name(b.name));
  if (item.floor) parts.push(floorLabel(item.floor, i18n.lang));
  if (item.room) parts.push(i18n.t('detail.room', { room: item.room }));
  return parts.join(' · ');
}

export function createSearchPanel({ places, getIndex, i18n, shell, onPick, onCategory, onFacility }) {
  const home = document.getElementById('view-home');
  const results = document.getElementById('view-results');
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');
  const form = document.getElementById('search-form');

  let category = 'all';
  let facility = null;
  let query = '';
  let timer = 0;

  function renderHome() {
    clear(home);
    const chips = h('div', { class: 'chips', role: 'group', 'aria-labelledby': 'cat-title' },
      ['all', ...CATEGORIES].map((cat) => h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(category === cat),
        onclick: () => { category = cat; onCategory(cat === 'all' ? null : cat); renderHome(); },
      }, cat !== 'all' ? h('span', { class: `swatch cat-${cat}`, 'aria-hidden': 'true' }) : null,
      i18n.t(`cat.${cat}`))));

    const present = new Set(places.units.filter((u) => u.type).map((u) => u.type));
    const tiles = h('div', { class: 'facility-grid', role: 'group', 'aria-labelledby': 'fac-title' },
      FACILITY_TYPES.filter((t) => present.has(t)).map((type) => h('button', {
        type: 'button', class: 'facility-tile', 'aria-pressed': String(facility === type),
        onclick: () => showFacility(type),
      }, icon(type), i18n.t(`fac.${type}`))));

    const list = places.buildings
      .filter((b) => category === 'all' || b.category === category)
      .sort((a, b) => (a.no || 99) - (b.no || 99));

    home.append(
      h('section', { class: 'section' },
        h('h3', { class: 'section-title', id: 'cat-title' }, i18n.t('list.categories')), chips),
      h('section', { class: 'section' },
        h('h3', { class: 'section-title', id: 'fac-title' }, i18n.t('list.facilities')), tiles),
      h('section', { class: 'section', 'aria-labelledby': 'list-title' },
        h('h3', { class: 'section-title' },
          h('span', { id: 'list-title' }, i18n.t('list.title')),
          h('span', { class: 'count' }, i18n.t('list.count', { n: list.length }))),
        h('ul', { class: 'rows', id: 'building-list', tabindex: '-1' }, list.map((b) => row({
          lead: buildingNo(b, i18n),
          title: i18n.name(b.name),
          sub: i18n.t(`cat.${b.category}`),
          onclick: () => onPick({ type: 'building', id: b.id }),
        })))),
    );
  }

  function showFacility(type) {
    facility = type;
    const units = places.units.filter((u) => u.type === type);
    onFacility(type, [...new Set(units.map((u) => u.building))]);
    fill(results,
      h('div', { class: 'detail-top' }, h('button', {
        type: 'button', class: 'back-btn', onclick: () => { closeFacility(); },
      }, icon('chevron-left'), i18n.t('detail.back'))),
      h('h3', { class: 'detail-title list-heading' }, i18n.t(`fac.${type}`)),
      h('ul', { class: 'rows' }, units.map((u) => row({
        lead: h('span', { class: 'badge kind', 'aria-hidden': 'true' }, icon(type)),
        title: i18n.name(u.name),
        sub: [describeLocation(u, places, i18n), u.hours].filter(Boolean).join(' · '),
        onclick: () => onPick({ type: 'unit', id: u.id }),
      }))),
    );
    show('results');
    shell.announce(`${i18n.t(`fac.${type}`)} ${i18n.t('search.results', { n: units.length })}`);
    shell.ensureSheet('half');
  }

  function closeFacility() {
    facility = null;
    onFacility(null, []);
    renderHome();
    show('home');
  }

  const show = showView;

  function label(hit) {
    if (hit.type === 'building') {
      const b = places.buildings.find((x) => x.id === hit.id);
      return { lead: buildingNo(b, i18n), title: i18n.name(b.name), sub: i18n.t(`cat.${b.category}`) };
    }
    if (hit.type === 'gate') {
      const g = places.gates.find((x) => x.id === hit.id);
      return { lead: h('span', { class: 'badge kind' }, icon('gate')), title: i18n.name(g.name), sub: i18n.t('detail.gate') };
    }
    if (hit.type === 'unit') {
      const u = places.units.find((x) => x.id === hit.id);
      return {
        lead: h('span', { class: 'badge kind', 'aria-hidden': 'true' }, icon(u.type || KIND_ICON[u.kind])),
        title: i18n.name(u.name), sub: describeLocation(u, places, i18n),
      };
    }
    if (hit.type === 'room') {
      const r = places.rooms.find((x) => x.id === hit.id);
      return {
        lead: h('span', { class: 'badge kind', 'aria-hidden': 'true' }, icon('room')),
        title: roomTitle(r, i18n),
        sub: [describeLocation({ building: r.building, floor: r.floor }, places, i18n),
          r.dept ? i18n.name(r.dept) : null].filter(Boolean).join(' · '),
      };
    }
    const s = places.bus_stops.find((x) => x.id === hit.id);
    return {
      lead: h('span', { class: 'badge kind', 'aria-hidden': 'true' }, icon('bus')),
      title: i18n.name(s.name),
      sub: s.ref ? i18n.t('detail.busRef', { ref: s.ref }) : i18n.t('detail.busStop'),
    };
  }

  function groupOf(hit) {
    if (hit.type === 'building' || hit.type === 'gate' || hit.type === 'bus') return 'building';
    if (hit.type === 'room') return 'room';
    return hit.kind === 'facility' ? 'facility' : 'unit';
  }

  function renderResults() {
    const hits = search(getIndex(), query);
    clear(results);
    if (!hits.length) {
      results.append(h('div', { class: 'empty' },
        h('p', null, i18n.t('search.none', { q: query })),
        h('p', null, i18n.t('search.noneHint'))));
    } else {
      results.append(h('p', { class: 'sr-only' }, i18n.t('search.results', { n: hits.length })));
      for (const group of ['building', 'unit', 'facility', 'room']) {
        const inGroup = hits.filter((hit) => groupOf(hit) === group);
        if (!inGroup.length) continue;
        results.append(
          h('h3', { class: 'group-title' }, i18n.t(`search.group.${group}`)),
          h('ul', { class: 'rows' }, inGroup.map((hit) => row({
            ...label(hit),
            onclick: () => onPick({ type: hit.type, id: hit.id }),
          }))),
        );
      }
    }
    show('results');
    shell.announce(hits.length ? i18n.t('search.results', { n: hits.length }) : i18n.t('search.none', { q: query }));
  }

  function setQuery(text, { silent } = {}) {
    query = text.trim();
    input.value = text;
    clearBtn.hidden = !text;
    if (query) renderResults();
    else if (!silent) { renderHome(); show('home'); }
  }

  input.addEventListener('input', () => {
    clearBtn.hidden = !input.value;
    clearTimeout(timer);
    timer = setTimeout(() => setQuery(input.value), 120);
  });
  input.addEventListener('focus', () => shell.ensureSheet('half'));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      const first = results.querySelector('.row');
      if (first && !results.hidden) { event.preventDefault(); first.focus(); }
    } else if (event.key === 'Escape' && input.value) {
      setQuery('');
    }
  });
  results.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const rows = [...results.querySelectorAll('.row')];
    const at = rows.indexOf(document.activeElement);
    if (at < 0) return;
    event.preventDefault();
    if (event.key === 'ArrowUp' && at === 0) { input.focus(); return; }
    const next = rows[at + (event.key === 'ArrowDown' ? 1 : -1)];
    if (next) next.focus();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(timer);
    setQuery(input.value);
    const first = results.querySelector('.row');
    if (first) first.focus();
  });
  clearBtn.addEventListener('click', () => { setQuery(''); input.focus(); });

  renderHome();

  return {
    get query() { return query; },
    setQuery,
    showHome() {
      if (facility) { showFacility(facility); return; }
      if (query) renderResults();
      else { renderHome(); show('home'); }
    },
    refresh() {
      if (facility) showFacility(facility);
      else if (query) renderResults();
      else renderHome();
    },
    get category() { return category; },
  };
}
