/**
 * MapLibre 스타일. 배경 타일 없이 site/data 의 GeoJSON 만으로 그린다.
 *
 * 글자 레이어(symbol)는 쓰지 않는다. 자체 호스팅에서 한글 글리프 PBF 를 마련하기
 * 어렵고, 건물 라벨은 HTML 버튼(labels.js)이어야 키보드로 닿기 때문이다.
 */

export const CATEGORY_COLORS = {
  academic: { fill: '#cdd9ec', line: '#8aa2c9' },
  admin: { fill: '#ddd6ea', line: '#a093c2' },
  welfare: { fill: '#f1dcc8', line: '#cc9e75' },
  housing: { fill: '#d5e7d5', line: '#86b088' },
  sports: { fill: '#d0e5e8', line: '#7fb1b8' },
  landmark: { fill: '#e4e4df', line: '#a9a99f' },
  other: { fill: '#e3e5e8', line: '#c4c8ce' },
};

export const ACCENT = '#1569a8';
export const ACCENT_LIGHT = '#1c83d0';
export const BRAND = '#343b58';
const SELECTED_FILL = '#a9cbec';

function byCategory(key) {
  const expression = ['match', ['get', 'category']];
  for (const [category, colors] of Object.entries(CATEGORY_COLORS)) {
    if (category !== 'other') expression.push(category, colors[key]);
  }
  expression.push(CATEGORY_COLORS.other[key]);
  return expression;
}

const zoomWidth = (pairs) => ['interpolate', ['exponential', 1.6], ['zoom'], ...pairs.flat()];
const kind = (...kinds) => ['in', ['get', 'kind'], ['literal', kinds]];

export function buildStyle({ basemap, buildings }) {
  return {
    version: 8,
    sources: {
      basemap: { type: 'geojson', data: basemap },
      buildings: { type: 'geojson', data: buildings, promoteId: 'fid' },
      route: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      indoor: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#eceef1' } },
      { id: 'campus', type: 'fill', source: 'basemap', filter: kind('campus'),
        paint: { 'fill-color': '#f8f8f5' } },
      { id: 'green', type: 'fill', source: 'basemap', filter: kind('green'),
        paint: { 'fill-color': '#e0ebdb' } },
      { id: 'wood', type: 'fill', source: 'basemap', filter: kind('wood'),
        paint: { 'fill-color': '#d2e3cb' } },
      { id: 'water', type: 'fill', source: 'basemap', filter: kind('water'),
        paint: { 'fill-color': '#c3d9ee', 'fill-outline-color': '#9fc3e3' } },
      { id: 'parking', type: 'fill', source: 'basemap', filter: kind('parking'),
        paint: { 'fill-color': '#e6e8ec', 'fill-outline-color': '#d0d4da' } },
      { id: 'pitch', type: 'fill', source: 'basemap', filter: kind('pitch'),
        paint: { 'fill-color': '#d3e7cc', 'fill-outline-color': '#b2d0a8' } },
      { id: 'track', type: 'fill', source: 'basemap', filter: kind('track'),
        paint: { 'fill-color': '#e9d2c6', 'fill-outline-color': '#d6b3a2' } },

      { id: 'road-major-case', type: 'line', source: 'basemap', filter: kind('road-major'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#c6ccd4', 'line-width': zoomWidth([[14, 4], [18, 30], [20, 100]]) } },
      { id: 'road-case', type: 'line', source: 'basemap', filter: kind('road'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#d4d8de', 'line-width': zoomWidth([[14, 2.5], [18, 16], [20, 56]]) } },
      { id: 'path-case', type: 'line', source: 'basemap', filter: kind('path'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#dcdfe4', 'line-width': zoomWidth([[15, 1.5], [18, 6], [20, 20]]) } },
      { id: 'road-major', type: 'line', source: 'basemap', filter: kind('road-major'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': zoomWidth([[14, 3], [18, 27], [20, 94]]) } },
      { id: 'road', type: 'line', source: 'basemap', filter: kind('road'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': zoomWidth([[14, 1.5], [18, 13.5], [20, 50]]) } },
      { id: 'path', type: 'line', source: 'basemap', filter: kind('path'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': zoomWidth([[15, 0.8], [18, 4.5], [20, 16]]) } },
      { id: 'steps', type: 'line', source: 'basemap', filter: kind('steps'),
        paint: { 'line-color': '#9aa2ad', 'line-width': zoomWidth([[16, 1.5], [19, 5]]),
          'line-dasharray': [0.6, 0.4] } },
      { id: 'outside', type: 'fill', source: 'basemap', filter: kind('outside'),
        paint: { 'fill-color': '#d9dde3', 'fill-opacity': 0.35 } },
      { id: 'campus-edge', type: 'line', source: 'basemap', filter: kind('campus'),
        paint: { 'line-color': '#9aa3b5', 'line-width': 1.2, 'line-dasharray': [3, 2] } },

      // 건물: 넓은 운동장·연못(area)은 바탕 지도가 이미 그렸으니 테두리만
      { id: 'building', type: 'fill', source: 'buildings',
        paint: {
          // 선택은 반투명 덧칠 대신 단색으로 바꾼다. 분류색과 섞이면 탁해진다.
          'fill-color': ['case', ['boolean', ['feature-state', 'selected'], false], SELECTED_FILL, byCategory('fill')],
          'fill-opacity': ['case',
            ['boolean', ['feature-state', 'selected'], false], ['case', ['get', 'area'], 0.45, 1],
            ['get', 'area'], 0,
            ['boolean', ['feature-state', 'dim'], false], 0.35,
            1],
        } },
      { id: 'building-line', type: 'line', source: 'buildings',
        paint: {
          'line-color': byCategory('line'),
          // zoom 은 맨 바깥 interpolate 에만 올 수 있다. 조건은 각 단계 안에 둔다.
          'line-width': ['interpolate', ['linear'], ['zoom'],
            15, ['case', ['get', 'area'], 0, 0.6],
            18, ['case', ['get', 'area'], 0, 1.2]],
          'line-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], 0.35, 1],
        } },
      { id: 'building-3d', type: 'fill-extrusion', source: 'buildings',
        filter: ['!', ['get', 'area']],
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-color': byCategory('fill'),
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-opacity': 0.92,
          'fill-extrusion-vertical-gradient': true,
        } },
      { id: 'building-highlight', type: 'line', source: 'buildings',
        paint: {
          'line-color': ACCENT,
          'line-width': ['case', ['boolean', ['feature-state', 'highlight'], false], 2, 0],
          'line-dasharray': [2, 1.2],
        } },
      { id: 'building-selected-line', type: 'line', source: 'buildings',
        paint: {
          'line-color': ACCENT,
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 0],
        } },

      // 실내 (indoor-layer.js 가 데이터를 채운다)
      { id: 'indoor-base', type: 'fill', source: 'indoor', filter: ['==', ['get', 'role'], 'footprint'],
        paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.97 } },
      { id: 'indoor-unit', type: 'fill', source: 'indoor', filter: ['==', ['get', 'role'], 'unit'],
        paint: {
          'fill-color': ['match', ['get', 'category'],
            'walkway', '#fbfbfa',
            'classroom', '#e2ebf6',
            'laboratory', '#e5efe2',
            'office', '#f1ece3',
            'library', '#ece4f3',
            'breakroom', '#f6e9dc',
            'stairs', '#dfe2e7',
            'elevator', '#dfe2e7',
            '#eef0f3'],
          'fill-opacity': ['case', ['boolean', ['feature-state', 'target'], false], 1, 1],
        } },
      { id: 'indoor-target', type: 'fill', source: 'indoor',
        filter: ['all', ['==', ['get', 'role'], 'unit'], ['boolean', ['get', 'target'], false]],
        paint: { 'fill-color': ACCENT_LIGHT, 'fill-opacity': 0.35 } },
      { id: 'indoor-unit-line', type: 'line', source: 'indoor', filter: ['==', ['get', 'role'], 'unit'],
        paint: { 'line-color': '#9aa3ae', 'line-width': zoomWidth([[17, 0.4], [20, 1.4]]) } },
      { id: 'indoor-outline', type: 'line', source: 'indoor', filter: ['==', ['get', 'role'], 'footprint'],
        paint: { 'line-color': '#5d6673', 'line-width': zoomWidth([[17, 1], [20, 3]]) } },
      { id: 'indoor-door', type: 'line', source: 'indoor', filter: ['==', ['get', 'role'], 'opening'],
        paint: {
          'line-color': ['case', ['==', ['get', 'category'], 'pedestrian.principal'], ACCENT, '#ffffff'],
          'line-width': ['interpolate', ['linear'], ['zoom'],
            17, ['case', ['==', ['get', 'category'], 'pedestrian.principal'], 2, 1],
            20, ['case', ['==', ['get', 'category'], 'pedestrian.principal'], 6, 3.5]],
        } },

      // 경로
      { id: 'route-other-floor', type: 'line', source: 'route', filter: ['==', ['get', 'current'], false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ACCENT_LIGHT, 'line-width': 4, 'line-opacity': 0.5, 'line-dasharray': [1, 1.6] } },
      { id: 'route-case', type: 'line', source: 'route', filter: ['!=', ['get', 'current'], false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': zoomWidth([[15, 7], [19, 12]]) } },
      { id: 'route-line', type: 'line', source: 'route', filter: ['!=', ['get', 'current'], false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ACCENT, 'line-width': zoomWidth([[15, 4], [19, 7]]) } },
    ],
  };
}
