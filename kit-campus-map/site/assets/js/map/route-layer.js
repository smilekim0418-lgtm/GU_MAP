/**
 * 경로 그리기. 실외는 실선, 실내는 지금 보는 층만 실선이고 나머지 층은 점선.
 */
import { h } from '../ui/dom.js';

export function createRouteLayer(view) {
  const { map } = view;
  let result = null;
  let floor = null;
  let markers = [];

  function features() {
    const out = [];
    if (!result) return out;
    if (result.outdoor && result.outdoor.coords.length > 1) {
      out.push({ type: 'Feature', properties: { current: true },
        geometry: { type: 'LineString', coordinates: result.outdoor.coords } });
    }
    if (result.indoor) {
      for (const leg of result.indoor.legs) {
        if (leg.mode !== 'walk' || leg.coords.length < 2) continue;
        out.push({ type: 'Feature', properties: { current: floor === leg.floor },
          geometry: { type: 'LineString', coordinates: leg.coords } });
      }
    }
    return out;
  }

  /** 이동 순서상 처음과 끝. 호실에서 출발하면 실내가 먼저, 호실로 가면 실내가 나중이다. */
  function endpoints() {
    const legs = result.indoor ? result.indoor.legs : [];
    const outdoor = result.outdoor ? result.outdoor.coords : [];
    const startsInside = legs.length && (!outdoor.length || result.steps.some((s) => s.kind === 'exit'));
    const endsInside = legs.length && result.steps.at(-1).kind === 'arriveRoom';
    const start = startsInside ? legs[0].coords[0] : outdoor[0];
    const end = endsInside ? legs.at(-1).coords.at(-1) : outdoor.at(-1);
    return [start, end];
  }

  function draw() {
    view.ready.then(() => {
      map.getSource('route').setData({ type: 'FeatureCollection', features: features() });
    });
  }

  return {
    show(next, currentFloor = null) {
      this.clear();
      result = next;
      floor = currentFloor;
      draw();
      const [start, end] = endpoints();
      markers = [
        new maplibregl.Marker({ element: h('div', { class: 'pin-start', 'aria-hidden': 'true' }) }).setLngLat(start).addTo(map),
        new maplibregl.Marker({ element: h('div', { class: 'pin', 'aria-hidden': 'true' }), anchor: 'bottom', offset: [0, -2] })
          .setLngLat(end).addTo(map),
      ];
      for (const marker of markers) marker.getElement().removeAttribute('aria-label');
    },
    setFloor(next) {
      floor = next;
      if (result) draw();
    },
    clear() {
      result = null;
      for (const marker of markers) marker.remove();
      markers = [];
      draw();
    },
    allCoords() {
      if (!result) return [];
      const coords = result.outdoor ? [...result.outdoor.coords] : [];
      if (result.indoor) for (const leg of result.indoor.legs) coords.push(...leg.coords);
      return coords;
    },
    get result() { return result; },
  };
}
