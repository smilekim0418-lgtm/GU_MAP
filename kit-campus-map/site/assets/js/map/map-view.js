/**
 * MapLibre 지도: 만들기, 카메라, 건물 선택·강조, 3D 전환, 조작 버튼.
 * WebGL 을 못 쓰면 null 을 돌려준다 (main.js 가 목록만으로 동작한다).
 */
import { buildStyle, CATEGORY_COLORS } from './style.js';
import { createLabels } from './labels.js';
import { bounds } from '../core/geo.js';
import { h, icon, clear } from '../ui/dom.js';

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch (error) {
    return false;
  }
}

export function createMapView(container, { data, i18n, onSelect, onBackground }) {
  if (typeof maplibregl === 'undefined' || !webglAvailable()) return null;

  const { places } = data;
  const [west, south, east, north] = places.meta.bbox;
  const campusBounds = [[west, south], [east, north]];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // feature-state 를 쓰려면 도형마다 고유 번호가 필요하다. 한 건물이 여러 동이면 번호도 여럿.
  const fidsByBuilding = new Map();
  data.buildings.features.forEach((feature, index) => {
    feature.properties.fid = index;
    const id = feature.properties.id;
    if (!id) return;
    if (!fidsByBuilding.has(id)) fidsByBuilding.set(id, []);
    fidsByBuilding.get(id).push(index);
  });

  const map = new maplibregl.Map({
    container,
    style: buildStyle(data),
    bounds: campusBounds,
    fitBoundsOptions: { padding: 24 },
    minZoom: 14.6,
    maxZoom: 20.5,
    maxBounds: [[west - 0.012, south - 0.009], [east + 0.012, north + 0.009]],
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: false,
    fadeDuration: 0,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.enable();
  container.querySelector('canvas').setAttribute('aria-label', i18n.t('map.label'));

  const ready = new Promise((resolve) => map.once('load', resolve));
  let labels = null;
  ready.then(() => {
    labels = createLabels(map, { places, i18n, onSelect });
  });

  // 건물 도형을 눌러도 선택된다 (라벨이 숨어 있을 때를 위해)
  map.on('click', 'building', (event) => {
    const feature = event.features && event.features[0];
    if (feature && feature.properties.id) onSelect({ type: 'building', id: feature.properties.id });
  });
  map.on('click', (event) => {
    const hits = map.queryRenderedFeatures(event.point, { layers: ['building'] });
    if (!hits.some((f) => f.properties.id) && onBackground) onBackground(event.lngLat);
  });
  map.on('mouseenter', 'building', (event) => {
    if (event.features.some((f) => f.properties.id)) map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'building', () => { map.getCanvas().style.cursor = ''; });

  let selected = null;
  let highlighted = [];
  let is3D = false;

  function setState(id, key, value) {
    for (const fid of fidsByBuilding.get(id) || []) {
      map.setFeatureState({ source: 'buildings', id: fid }, { [key]: value });
    }
  }

  function camera(options) {
    return reducedMotion ? { ...options, duration: 0 } : { duration: 700, ...options };
  }

  function padding() {
    // 좁은 화면에서는 바텀시트가 지도 아래를 가린다
    // 시트가 열리는 중일 수 있으니 지금 높이가 아니라 목표 단계로 계산한다
    const panel = document.getElementById('panel');
    if (window.matchMedia('(max-width: 959px)').matches && panel) {
      const total = panel.parentElement.clientHeight;
      const sheet = panel.dataset.sheet === 'peek' ? 148 : Math.round(total * 0.52);
      return { top: 64, bottom: Math.min(sheet + 16, total - 120), left: 24, right: 64 };
    }
    return { top: 72, bottom: 72, left: 72, right: 96 };
  }

  const view = {
    map,
    ready,

    select(id) {
      ready.then(() => {
        if (selected) setState(selected, 'selected', false);
        selected = id;
        if (id) setState(id, 'selected', true);
        if (labels) labels.setActive(id);
      });
    },

    highlight(ids) {
      ready.then(() => {
        for (const id of highlighted) setState(id, 'highlight', false);
        highlighted = ids || [];
        for (const id of highlighted) setState(id, 'highlight', true);
      });
    },

    /** 분류 필터: ids 밖 건물을 흐리게 */
    filter(ids) {
      ready.then(() => {
        for (const id of fidsByBuilding.keys()) setState(id, 'dim', !!ids && !ids.has(id));
        if (labels) labels.setVisible(ids);
      });
    },

    focusBuilding(id) {
      const building = places.buildings.find((b) => b.id === id);
      if (!building) return;
      const coords = [];
      for (const fid of fidsByBuilding.get(id) || []) {
        coords.push(...data.buildings.features[fid].geometry.coordinates[0]);
      }
      if (coords.length) {
        map.fitBounds(bounds(coords), camera({ padding: padding(), maxZoom: building.area ? 17.3 : 17.6 }));
      } else {
        map.easeTo(camera({ center: building.center, zoom: 17.5, padding: padding() }));
      }
    },

    focusPoint(point, zoom = 18) {
      map.easeTo(camera({ center: point, zoom, padding: padding() }));
    },

    fitCoords(coords, maxZoom = 18.5) {
      if (!coords.length) return;
      map.fitBounds(bounds(coords), camera({ padding: padding(), maxZoom }));
    },

    fitCampus({ instant } = {}) {
      const options = { padding: padding(), bearing: 0, pitch: is3D ? 50 : 0 };
      map.fitBounds(campusBounds, instant ? { ...options, duration: 0 } : camera(options));
    },

    toggle3D(force) {
      is3D = force === undefined ? !is3D : force;
      ready.then(() => {
        map.setLayoutProperty('building-3d', 'visibility', is3D ? 'visible' : 'none');
        map.easeTo(camera({ pitch: is3D ? 50 : 0, bearing: is3D ? -18 : 0 }));
      });
      return is3D;
    },

    get is3D() { return is3D; },

    setIndoorMode(on, buildingId = 'b2') {
      container.classList.toggle('is-indoor', on);
      // 실내 도면 위에 그 건물 라벨이 겹치지 않게
      const label = container.querySelector(`.label[data-id="${buildingId}"]`);
      if (label) label.classList.toggle('is-indoor-building', on);
      if (on && is3D) view.toggle3D(false);
    },

    refreshText() {
      container.querySelector('canvas').setAttribute('aria-label', i18n.t('map.label'));
      if (labels) labels.refresh();
    },

    resize() { map.resize(); },
  };

  return view;
}

/** 지도 오른쪽 아래 조작 버튼. MapLibre 기본 컨트롤 대신 접근성 이름을 갖춘 버튼을 쓴다. */
export function renderControls(root, { view, i18n, onLocate }) {
  clear(root);
  const button = (name, label, onclick, extra = {}) =>
    h('button', { type: 'button', 'aria-label': label, title: label, onclick, ...extra }, icon(name));

  const toggle3d = button('cube', i18n.t(view.is3D ? 'map.view2d' : 'map.view3d'), () => {
    const on = view.toggle3D();
    toggle3d.setAttribute('aria-pressed', String(on));
    const label = i18n.t(on ? 'map.view2d' : 'map.view3d');
    toggle3d.setAttribute('aria-label', label);
    toggle3d.title = label;
  }, { 'aria-pressed': String(view.is3D) });

  root.append(
    h('div', { class: 'control-group' },
      button('plus', i18n.t('map.zoomIn'), () => view.map.zoomIn()),
      button('minus', i18n.t('map.zoomOut'), () => view.map.zoomOut())),
    h('div', { class: 'control-group' },
      toggle3d,
      button('expand', i18n.t('map.reset'), () => view.fitCampus()),
      button('locate', i18n.t('map.locate'), onLocate)),
  );
}

export function renderLegend(root, i18n) {
  clear(root);
  const rows = ['academic', 'admin', 'welfare', 'housing', 'sports', 'landmark'];
  root.append(
    h('h3', { class: 'sr-only' }, i18n.t('map.legend')),
    h('ul', null, rows.map((cat) => h('li', null,
      h('span', { class: 'fill', style: `background:${CATEGORY_COLORS[cat].fill};border-color:${CATEGORY_COLORS[cat].line}` }),
      i18n.t(`cat.${cat}`)))),
  );
}
