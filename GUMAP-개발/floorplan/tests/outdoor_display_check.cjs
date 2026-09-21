// Real routing data with a small map adapter: no browser or network required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.resolve(__dirname, '..');
const TechnoRoute = require(path.join(dir, 'techno-route-core.js'));
const data = JSON.parse(fs.readFileSync(path.join(dir, 'work/techno_nav.json'), 'utf8'));
const engine = TechnoRoute.load(data);
const room = engine.rooms().find(r => r.floor === '4F' && r.corridor_doors > 0);
const origin = [36.1450, 128.3925];
const layers = new Set();
const pending = [];
const intervals = [];
const fits = [];
const cards = [];
function element() {
    return {
        style: {}, attributes: {}, children: {}, listeners: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        querySelector(selector) { return this.children[selector] ||= element(); },
        addEventListener(name, handler) { this.listeners[name] = handler; },
        remove() { cards.splice(cards.indexOf(this), 1); }
    };
}
const box = { innerHTML: '' };
const elements = {
    'techno-indoor-panel': { style: {} },
    'techno-route-controls': {},
    'techno-route-box': box
};
const map = {
    hasLayer: layer => layers.has(layer),
    removeLayer: layer => layers.delete(layer),
    on() {}, closePopup() {},
    getContainer: () => ({ appendChild: card => cards.push(card) }),
    fitBounds: (points, options) => fits.push({ points, options })
};
function shape(kind, points, options) {
    return { kind, points, options, bindTooltip(text) { this.tooltip = text; return this; } };
}
const context = {
    console, TechnoRoute, TECHNO_NAV_DATA: data,
    map, technoActiveFloor: '4F', PROXY_URL: '',
    fetchTmapWithOSRMFallback: () => new Promise(resolve => pending.push(resolve)),
    setInterval: fn => { intervals.push(fn); return intervals.length; },
    clearInterval() {},
    document: {
        readyState: 'complete', getElementById: id => elements[id] || null, querySelector: () => null,
        createElement: element, head: { appendChild() {} }
    },
    L: {
        layerGroup: () => ({
            items: [], clearLayers() { this.items = []; },
            addLayer(layer) { this.items.push(layer); return this; },
            addTo() { layers.add(this); return this; }
        }),
        circleMarker: (points, options) => shape('marker', points, options),
        polyline: (points, options) => shape('line', points, options),
        latLngBounds: points => points
    }
};
context.window = context;
const mapScript = process.argv[2] || path.join(dir, 'map-techno-route.js');
vm.runInNewContext(fs.readFileSync(mapScript, 'utf8'), context);

async function main() {
    context.setTechnoRouteStart(...origin);
    assert.equal(context.routeInsideTechno(room.room_id, room.floor, { avoidStairs: true }), null);
    assert.equal(context.getTechnoRouteResult(), null);
    assert.match(box.innerHTML, /role="status"/);
    assert.match(box.innerHTML, /보행 경로를 불러오는 중/);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].attributes.role, 'status');
    assert.match(cards[0].querySelector('.tr-loading-destination').textContent, new RegExp(room.room_id));
    assert.ok(context.technoRouteLayerGroup.items.some(layer =>
        layer.options.className === 'techno-route-pending-pin'));
    assert.ok(context.technoRouteLayerGroup.items.some(layer => layer.tooltip === '출발'));
    assertNoLines();
    assert.equal(fits.length, 0, 'Do not frame an estimated route');
    await flush();

    assert.ok(pending.length > 0);
    // One completed candidate must not flash a partial route before the others arrive.
    pending.shift()(walkResponse());
    await flush();
    assertNoLines();
    assert.ok(Number(cards[0].querySelector('.tr-loading-track').attributes['aria-valuenow']) > 0);
    pending.splice(0).forEach(resolve => resolve(walkResponse()));
    await flush();
    const refined = context.getTechnoRouteResult();
    assert.ok(refined.outdoor_measured);
    assert.equal(cards.length, 0, 'Loading card must disappear on completion');
    assert.equal(refined.destination.room_id, room.room_id);
    assert.ok(!refined.legs.some(leg => leg.mode === 'stairs'));
    assert.doesNotMatch(box.innerHTML, /보행 경로를 불러오는 중/);
    const outdoor = refined.legs[0];
    assert.deepEqual(Array.from(outdoor.latlngs[0]), origin, 'Measured route must start at the selected pin');
    const last = outdoor.latlngs[outdoor.latlngs.length - 1];
    assert.ok(engine.metersBetween(last[0], last[1], ...refined.entrance.latlng) < 0.02,
        'Measured route must connect to the indoor entrance');
    assert.ok(outdoor.distance_m > 200, 'Include the distances from the pin and to the entrance');
    assert.equal(fits.length, 1, 'Frame the completed route once');
    assert.ok(fits[0].points.some(p => p[0] === origin[0] && p[1] === origin[1]));
    assert.ok(context.technoRouteLayerGroup.items.some(layer => layer.kind === 'line'));
    context.technoActiveFloor = '4F';
    intervals.forEach(fn => fn());
    assert.ok(context.technoRouteLayerGroup.items.some(layer => (layer.tooltip || '').startsWith('🚪')));
    assert.equal(fits.length, 1, 'Changing floors must not reset the viewport');

    context.setTechnoRouteStart(origin[0] - 0.0001, origin[1]);
    context.routeInsideTechno(room.room_id, room.floor);
    assertNoLines();
    await flush();
    assert.ok(pending.length > 0);
    cards[0].querySelector('button').listeners.click();
    assert.equal(cards.length, 0, 'Cancel button must dismiss the loading card');
    pending.splice(0).forEach(resolve => resolve(walkResponse()));
    await flush();
    assert.equal(context.getTechnoRouteResult(), null, 'A late response must not restore a cleared route');
    assert.equal(context.technoRouteLayerGroup.items.length, 0);
    assert.doesNotMatch(box.innerHTML, /보행 경로를 불러오는 중/);

    context.setTechnoRouteStart(origin[0] - 0.0002, origin[1]);
    context.routeInsideTechno(room.room_id, room.floor);
    await flush();
    pending.splice(0).forEach(resolve => resolve(null));
    await flush();
    assert.ok(context.getTechnoRouteResult().error);
    assert.equal(cards.length, 0, 'Errors must dismiss the loading card');
    assert.match(box.innerHTML, /다시 길찾기/);
    assertNoLines();
    context.routeInsideTechno(room.room_id, room.floor);
    await flush();
    assert.ok(pending.length > 0, 'Failed responses must not prevent retry at the same location');
    pending.splice(0).forEach(resolve => resolve(walkResponse()));
    await flush();
    assert.ok(context.getTechnoRouteResult().outdoor_measured);
    assert.equal(fits.length, 2, 'Failures and cancellation must not adjust the viewport');

    context.setTechnoRouteStart(origin[0] - 0.0003, origin[1]);
    context.routeInsideTechno(room.room_id, room.floor);
    await flush();
    const superseded = pending.splice(0);
    context.setTechnoRouteStart(origin[0] - 0.0004, origin[1]);
    context.routeInsideTechno(room.room_id, room.floor);
    await flush();
    superseded.forEach(resolve => resolve(walkResponse()));
    await flush();
    assert.equal(context.getTechnoRouteResult(), null);
    assertNoLines();
    assert.match(box.innerHTML, /보행 경로를 불러오는 중/);
    pending.splice(0).forEach(resolve => resolve(walkResponse()));
    await flush();
    assert.deepEqual(Array.from(context.getTechnoRouteResult().legs[0].latlngs[0]),
        [origin[0] - 0.0004, origin[1]], 'Only the latest origin may publish its route');
    assert.equal(fits.length, 3);
    console.log('PASS: loading without interim lines, completed route only, cancellation, failure and retry');
}
function flush() { return new Promise(resolve => setImmediate(resolve)); }
function assertNoLines() {
    assert.ok(!context.technoRouteLayerGroup.items.some(layer => layer.kind === 'line'),
        'Never draw an estimated, partial or stale route while waiting');
}
function walkResponse() {
    return { features: [{
        geometry: { type: 'LineString', coordinates: [[origin[1] + 0.00002, origin[0]], [128.3943, 36.1466]] },
        properties: { totalDistance: 200 }
    }] };
}
main().catch(error => { console.error(error); process.exitCode = 1; });
