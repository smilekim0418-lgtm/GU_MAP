/**
 * 캠퍼스맵 시작점.
 *
 * 데이터를 읽고, 지도·패널을 만들고, 주소창(딥링크)과 화면 상태를 맞춘다.
 * 테크노관 실내 자료(약 640 KB)는 실내지도나 호실 길찾기를 처음 쓸 때 읽는다.
 */
import { createI18n } from './core/i18n.js';
import { buildIndex } from './core/search.js';
import { WalkGraph } from './core/walk-graph.js';
import { planRoute } from './core/campus-route.js';
import { parse, serialize, endpointFromString, endpointToString } from './core/url-state.js';
import { telHref } from './core/format.js';
import { h, icon, clear, fill, showView } from './ui/dom.js';
import { applyStaticText, createShell } from './ui/shell.js';
import { createSearchPanel, FACILITY_TYPES } from './ui/search-panel.js';
import { createDetailPanel } from './ui/detail-panel.js';
import { createRoutePanel } from './ui/route-panel.js';
import { renderFloorSwitcher, renderIndoorBar } from './ui/floor-switcher.js';
import { createMapView, renderControls, renderLegend } from './map/map-view.js';
import { createRouteLayer } from './map/route-layer.js';
import { createIndoorLayer } from './map/indoor-layer.js';

const DATA = 'data/';

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

function showLoadError(error, retry) {
  console.error(error);
  const home = document.getElementById('view-home');
  fill(home,h('div', { class: 'section' },
    h('p', { class: 'notice error', role: 'alert' }, icon('alert'),
      h('span', null, document.documentElement.lang === 'en' ? 'Couldn’t load campus information.' : '캠퍼스 정보를 불러오지 못했습니다.')),
    h('p', { class: 'gap-top' }, h('button', { type: 'button', class: 'btn', onclick: retry },
      document.documentElement.lang === 'en' ? 'Try again' : '다시 시도'))));
}

async function start() {
  const initial = parse(location.search);
  let messages, brand, places, basemap, buildings, graphData;
  try {
    [messages, brand, places, basemap, buildings, graphData] = await Promise.all([
      Promise.all([fetchJson('i18n/ko.json'), fetchJson('i18n/en.json')]).then(([ko, en]) => ({ ko, en })),
      fetchJson('assets/brand/brand.json').catch(() => ({})),
      fetchJson(DATA + 'places.json'),
      fetchJson(DATA + 'basemap.geojson'),
      fetchJson(DATA + 'buildings.geojson'),
      fetchJson(DATA + 'walk-graph.json'),
    ]);
  } catch (error) {
    showLoadError(error, () => location.reload());
    return;
  }

  // 데이터에서 오는 머리글 문구 (학교 이름·캠퍼스 이름)
  for (const lang of ['ko', 'en']) {
    messages[lang]['brand.school'] = places.meta.campus[lang];
    messages[lang]['brand.campus'] = places.meta.campus_label[lang];
    messages[lang]['panel.title'] = messages[lang]['app.title'];
  }

  const i18n = createI18n(messages, initial.lang || 'ko');
  applyStaticText(i18n);
  if (brand.logo) {
    const logo = document.getElementById('brand-logo');
    logo.src = `assets/brand/${brand.logo}`;
    logo.hidden = false;
  }

  const graph = new WalkGraph(graphData);
  const typeTerms = Object.fromEntries(FACILITY_TYPES.map((t) => [t, [messages.ko[`fac.${t}`], messages.en[`fac.${t}`]]]));
  const index = buildIndex(places, { typeTerms });
  const getIndex = () => index;

  // ── 상태
  const app = {
    target: null,        // 상세에 보이는 것 {type, id}
    route: null,         // {from, to, avoidStairs}
    indoorFloor: null,   // 실내지도 층 (켜져 있을 때)
    lang: i18n.lang,
    embed: initial.embed,
  };

  // ── 테크노관 실내 자료 (처음 쓸 때 읽는다)
  let techno = null;
  let indoor = null;
  async function loadTechno() {
    if (techno) return techno;
    const [nav, imdf] = await Promise.all([fetchJson(DATA + 'techno/nav.json'), fetchJson(DATA + 'techno/imdf.json')]);
    techno = { engine: window.TechnoRoute.load(nav), imdf };
    if (view) {
      indoor = createIndoorLayer(view, {
        imdf, i18n,
        onRoom: (id) => select({ type: 'room', id }, { fromMap: true }),
      });
    }
    return techno;
  }

  const shell = createShell({
    i18n, embed: app.embed,
    onLang: (lang) => setLang(lang),
    onSheetChange: () => view && view.resize(),
  });

  // ── 지도
  const mapRoot = document.getElementById('map');
  const view = createMapView(mapRoot, {
    data: { places, basemap, buildings },
    i18n,
    onSelect: (target) => select(target, { fromMap: true }),
  });
  if (!view) {
    document.getElementById('map-fallback').hidden = false;
    document.getElementById('map-legend').hidden = true;
  }
  const routeLayer = view ? createRouteLayer(view) : null;
  let meMarker = null;

  async function locate() {
    if (!navigator.geolocation) return { error: 'route.locationDenied' };
    const position = await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
    });
    if (!position) return { error: 'route.locationDenied' };
    const point = [position.coords.longitude, position.coords.latitude];
    const [west, south, east, north] = places.meta.bbox;
    const margin = 0.004;
    if (point[0] < west - margin || point[0] > east + margin || point[1] < south - margin || point[1] > north + margin) {
      return { error: 'route.locationOutside' };
    }
    if (view) {
      if (!meMarker) meMarker = new maplibregl.Marker({ element: h('div', { class: 'me-dot', 'aria-hidden': 'true' }) });
      meMarker.setLngLat(point).addTo(view.map);
      meMarker.getElement().removeAttribute('aria-label');
    }
    return { point };
  }

  function renderMapChrome() {
    if (!view) return;
    renderControls(document.getElementById('map-controls'), {
      view, i18n,
      onLocate: async () => {
        const result = await locate();
        if (result.error) shell.toast(i18n.t(result.error));
        else view.focusPoint(result.point, 18);
      },
    });
    renderLegend(document.getElementById('map-legend'), i18n);
  }

  function renderFooter() {
    const footer = document.getElementById('panel-footer');
    fill(footer,
      h('p', null, i18n.t('footer.address')),
      h('p', null, h('a', { href: telHref(places.meta.main_phone) }, i18n.t('footer.phone', { phone: places.meta.main_phone })),
        ' · ', h('a', { href: brand.home || 'https://www.kumoh.ac.kr/', target: app.embed ? '_blank' : null, rel: 'noopener' },
          'kumoh.ac.kr')),
      h('p', null, `${i18n.t('footer.updated', { date: places.meta.built_at })} · ${i18n.t('footer.note')}`),
    );
  }

  // ── URL
  function currentUrlState() {
    const state = { lang: i18n.lang === 'ko' ? undefined : i18n.lang, embed: app.embed };
    if (app.route && app.route.from && app.route.to) {
      state.from = endpointToString(app.route.from);
      state.to = endpointToString(app.route.to);
      if (app.route.avoidStairs) state.nostairs = true;
    } else if (app.target) {
      if (app.target.type === 'room') state.room = app.target.id;
      else if (app.target.type === 'building' || app.target.type === 'unit') {
        // 공식 번호가 있으면 번호로 (?b=6). 학과 홈페이지에 걸기 좋다.
        const id = app.target.type === 'building' ? app.target.id
          : (places.units.find((u) => u.id === app.target.id) || {}).building;
        const building = places.buildings.find((b) => b.id === id);
        if (building) state.b = building.no ? String(building.no) : building.id;
      }
    }
    if (app.indoorFloor) state.floor = app.indoorFloor;
    if (!state.from && !app.target && search.query) state.q = search.query;
    return state;
  }

  let applying = false;
  function writeUrl(push = true) {
    if (applying) return;
    const next = serialize(currentUrlState());
    if (next === location.search) return;
    const url = location.pathname + next + location.hash;
    if (push) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
  }

  // ── 패널
  const search = createSearchPanel({
    places, getIndex, i18n, shell,
    onPick: (target) => select(target),
    onCategory: (cat) => {
      if (!view) return;
      view.filter(cat ? new Set(places.buildings.filter((b) => b.category === cat).map((b) => b.id)) : null);
    },
    onFacility: (type, buildingIds) => {
      if (!view) return;
      view.highlight(buildingIds);
      if (buildingIds.length) {
        const coords = places.buildings.filter((b) => buildingIds.includes(b.id)).map((b) => b.center);
        view.fitCoords(coords, 17.4);
      }
    },
  });

  const detail = createDetailPanel({
    places, i18n,
    onBack: () => goHome(),
    onRoute: (to, from) => openRoute({ to, from }),
    onIndoor: (buildingId, options = {}) => openIndoor(options),
    onShare: share,
    onPick: (target) => select(target),
  });

  const routePanel = createRoutePanel({
    places, getIndex, i18n, shell,
    locate,
    plan: async (from, to, options) => {
      const needTechno = from.type === 'room' || to.type === 'room';
      if (needTechno) await loadTechno();
      return planRoute({ graph, places, techno: techno ? techno.engine : null }, from, to, options);
    },
    onResult: (result, state) => {
      app.route = { from: state.from, to: state.to, avoidStairs: state.avoidStairs };
      showRouteOnMap(result);
      writeUrl();
    },
    onClose: () => closeRoute(),
    onStepFloor: (floor) => { if (indoor && indoor.active) setFloor(floor); },
  });

  function showRouteOnMap(result) {
    if (!routeLayer) return;
    if (!result) {
      routeLayer.clear();
      return;
    }
    if (result.indoor && indoor) {
      const arrival = result.steps.at(-1).kind === 'arriveRoom' ? result.indoor.legs.at(-1).floor : result.indoor.legs[0].floor;
      const room = result.steps.at(-1).kind === 'arriveRoom' && app.route.to.type === 'room' ? app.route.to.id : null;
      enterIndoor({ floor: arrival, room, keepCamera: true, routeFloors: result.indoor.floors });
      routeLayer.show(result, arrival);
    } else {
      if (indoor && indoor.active) exitIndoor({ silent: true });
      routeLayer.show(result, null);
    }
    view.select(null);
    view.fitCoords(routeLayer.allCoords(), 18.6);
  }

  // ── 동작
  function select(target, { fromMap = false, push = true } = {}) {
    if (!detail.show(target)) return false;
    app.target = target;
    app.route = null;
    if (routeLayer) routeLayer.clear();
    shell.ensureSheet('half');
    const buildingId = target.type === 'building' ? target.id
      : target.type === 'unit' ? (places.units.find((u) => u.id === target.id) || {}).building
        : target.type === 'room' ? (places.rooms.find((r) => r.id === target.id) || {}).building
          : target.type === 'gate' ? (places.gates.find((g) => g.id === target.id) || {}).building : null;
    if (view) {
      view.select(buildingId || null);
      if (target.type === 'room') {
        const room = places.rooms.find((r) => r.id === target.id);
        openIndoor({ floor: room.floor, room: room.id, push: false });
      } else {
        if (indoor && indoor.active && buildingId !== 'b2') exitIndoor({ silent: true });
        if (target.type === 'bus') {
          const stop = places.bus_stops.find((s) => s.id === target.id);
          view.focusPoint(stop.point, 17.6);
        } else if (buildingId && !(indoor && indoor.active)) {
          view.focusBuilding(buildingId);
        }
      }
    }
    if (!fromMap) detail.focusTitle();
    writeUrl(push);
    return true;
  }

  function goHome({ push = true } = {}) {
    app.target = null;
    app.route = null;
    if (view) view.select(null);
    if (routeLayer) routeLayer.clear();
    search.showHome();
    writeUrl(push);
    const input = document.getElementById('search-input');
    input.focus({ preventScroll: true });
  }

  async function openRoute({ from = null, to = null, avoidStairs, push = true } = {}) {
    app.route = { from, to, avoidStairs: !!avoidStairs };
    await routePanel.open({ from, to, avoidStairs });
    writeUrl(push);
  }

  function closeRoute() {
    app.route = null;
    if (routeLayer) routeLayer.clear();
    if (indoor && indoor.active) exitIndoor({ silent: true });
    if (app.target) {
      detail.show(app.target);
      detail.focusTitle();
    } else {
      search.showHome();
    }
    writeUrl();
  }

  function setFloor(floor) {
    if (!indoor) return;
    app.indoorFloor = floor;
    indoor.setFloor(floor);
    if (routeLayer) routeLayer.setFloor(floor);
    renderIndoorChrome();
    writeUrl(false);
  }

  let routeFloors = null;
  function renderIndoorChrome() {
    if (!indoor || !indoor.active) return;
    const b2 = places.buildings.find((b) => b.indoor === 'techno');
    renderFloorSwitcher(document.getElementById('floor-switcher'), {
      floors: indoor.floors, current: indoor.floor, routeFloors, i18n,
      onChange: (floor) => setFloor(floor),
    });
    renderIndoorBar(document.getElementById('indoor-bar'), {
      buildingName: i18n.name(b2.name), i18n, onExit: () => exitIndoor(),
    });
  }

  function enterIndoor({ floor, room, keepCamera, routeFloors: floorsOnRoute } = {}) {
    routeFloors = floorsOnRoute || null;
    indoor.enter({ floor: floor || indoor.floor, room });
    app.indoorFloor = indoor.floor;
    if (keepCamera) view.select(null);
    renderIndoorChrome();
  }

  async function openIndoor({ floor, room, push = true } = {}) {
    if (!view) return;
    await loadTechno();
    enterIndoor({ floor: floor || '1F', room });
    view.select('b2');
    writeUrl(push);
  }

  function exitIndoor({ silent } = {}) {
    if (!indoor) return;
    indoor.exit();
    routeFloors = null;
    app.indoorFloor = null;
    document.getElementById('floor-switcher').hidden = true;
    document.getElementById('indoor-bar').hidden = true;
    if (routeLayer) routeLayer.setFloor(null);
    if (!silent) {
      if (app.target) view.focusBuilding('b2');
      writeUrl();
    }
  }

  async function share() {
    writeUrl(false);
    try {
      await navigator.clipboard.writeText(location.href);
      shell.toast(i18n.t('detail.copied'));
    } catch (error) {
      shell.toast(i18n.t('detail.copyFailed'));
    }
  }

  function setLang(lang) {
    i18n.setLang(lang);
    applyStaticText(i18n);
    renderMapChrome();
    renderFooter();
    if (view) view.refreshText();
    search.refresh();
    if (app.route) routePanel.refresh();
    else if (app.target) detail.show(app.target);
    renderIndoorChrome();
    writeUrl(false);
  }

  // ── 주소창 → 화면
  async function applyUrl(state, { first = false } = {}) {
    applying = true;
    try {
      if ((state.lang || 'ko') !== i18n.lang) setLang(state.lang || 'ko');
      if (state.q) search.setQuery(state.q, { silent: true });
      let ok = true;
      if (state.from || state.to) {
        const from = state.from ? endpointFromString(state.from) : null;
        const to = state.to ? endpointFromString(state.to) : null;
        await openRoute({ from, to, avoidStairs: state.nostairs, push: false });
      } else if (state.room) {
        ok = select({ type: 'room', id: state.room }, { push: false, fromMap: first });
      } else if (state.b) {
        const id = /^\d+$/.test(state.b)
          ? (places.buildings.find((b) => b.no === Number(state.b)) || {}).id
          : state.b;
        ok = !!id && select({ type: 'building', id }, { push: false, fromMap: first });
      } else if (!first) {
        app.target = null;
        app.route = null;
        if (routeLayer) routeLayer.clear();
        if (view) view.select(null);
        search.showHome();
      }
      if (state.floor && !state.room && !state.from) {
        await openIndoor({ floor: state.floor, push: false });
      } else if (!state.floor && !state.room && indoor && indoor.active && !(app.route && app.route.to)) {
        exitIndoor({ silent: true });
      }
      if (!ok) {
        shell.toast(i18n.t('error.badLink'));
        search.showHome();
      }
    } finally {
      applying = false;
    }
    if (first) writeUrl(false);
  }

  window.addEventListener('popstate', () => applyUrl(parse(location.search)));

  renderMapChrome();
  renderFooter();
  showView('home');
  // 좁은 화면은 지도를 먼저 보여 준다. 시트는 검색창만 보이게 접어 둔다.
  if (window.matchMedia('(max-width: 959px)').matches && !initial.b && !initial.room && !initial.from && !initial.to) {
    shell.setSheet('peek');
  }
  if (view) {
    view.map.once('load', () => {
      document.body.classList.add('map-ready');
      // 처음 화면은 패널·시트를 뺀 영역에 캠퍼스 전체가 들어오게
      if (!app.target && !app.route && !app.indoorFloor) view.fitCampus({ instant: true });
    });
  }
  await applyUrl(initial, { first: true });
}

start();
