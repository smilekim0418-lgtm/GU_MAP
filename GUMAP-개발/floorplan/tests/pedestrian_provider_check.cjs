const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.resolve(__dirname, '..');
const root = path.resolve(dir, '../..');
const source = fs.readFileSync(path.join(root, 'GUMAP-프론트/js/GUMAP-길찾기.js'), 'utf8');
const routing = source.slice(source.indexOf('window.fetchPedestrianRoute ='), source.indexOf('window.calcRoute ='));
const payload = { startX: 128.39330, startY: 36.14570, endX: 128.394, endY: 36.1465 };
const route = { code: 'Ok', routes: [{ distance: 145.6, duration: 116.7,
    geometry: { type: 'LineString', coordinates: [[128.3933, 36.1457], [128.394, 36.1465]] } }] };
function makeContext(fetcher) {
    const context = { fetch: fetcher, AbortController, setTimeout, clearTimeout,
        console: { warn() {} } };
    context.window = context;
    vm.runInNewContext(routing, context);
    return context;
}
function response(data, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => data };
}
async function regression() {
    const calls = [];
    const context = makeContext(async url => {
        calls.push({ url, time: Date.now() });
        return response(route);
    });
    const results = await Promise.all([
        context.fetchTmapWithOSRMFallback('/tmap', payload, 'walk'),
        context.fetchTmapWithOSRMFallback('/tmap', payload, 'walk'),
        context.fetchTmapWithOSRMFallback('/tmap', { ...payload, endX: 128.3941 }, 'walk')
    ]);
    assert.equal(calls.length, 2, 'Concurrent identical requests must share the cache');
    assert.ok(calls.every(call => call.url.includes('/routed-foot/route/v1/foot/')));
    assert.ok(calls[1].time - calls[0].time >= 1000, 'Public server requests must be spaced');
    assert.ok(results.every(result => result.provider === 'osrm-foot'));
    assert.equal(results[0].features[0].properties.totalDistance, 145.6);

    // A slow response must not hold the next request beyond the rate-limit slot.
    const starts = [];
    const finishes = [];
    let secondStarted;
    const ready = new Promise(resolve => { secondStarted = resolve; });
    const slow = makeContext(url => new Promise(resolve => {
        starts.push(Date.now());
        finishes.push(() => resolve(response(route)));
        if (starts.length === 2) secondStarted();
    }));
    const slowRequests = [
        slow.fetchPedestrianRoute(payload),
        slow.fetchPedestrianRoute({ ...payload, endX: 128.3942 })
    ];
    let deadline;
    try {
        await Promise.race([ready, new Promise((_, reject) => {
            deadline = setTimeout(() => reject(new Error('Second request waited for the first response')), 4000);
        })]);
        assert.equal(finishes.length, 2, 'Both requests must be in flight before either response resolves');
        assert.ok(starts[1] - starts[0] >= 1000, 'Overlapping responses must still respect request spacing');
    } finally {
        clearTimeout(deadline);
        finishes.forEach(finish => finish());
    }
    await Promise.all(slowRequests);

    const failures = [];
    const failed = makeContext(async url => { failures.push(url); return response({}, 503); });
    await assert.rejects(failed.fetchTmapWithOSRMFallback('/tmap?endpoint=pedestrian', payload, 'walk'));
    assert.equal(failures.length, 2);
    assert.equal(failures[1], '/tmap?endpoint=pedestrian');
    assert.ok(!failures.some(url => url.includes('router.project-osrm.org')));

    let tmapCalls = 0;
    const fallback = makeContext(async url => {
        if (url.includes('/routed-foot/')) return response({}, 503);
        tmapCalls++;
        return response({ features: [{ geometry: route.routes[0].geometry }] });
    });
    assert.ok((await fallback.fetchTmapWithOSRMFallback('/tmap', payload, 'walk')).features.length);
    assert.equal(tmapCalls, 1);
    console.log('PASS: foot provider first, cache, spaced starts with overlapping responses, TMAP fallback');
}
async function live() {
    const TechnoRoute = require(path.join(dir, 'techno-route-core.js'));
    const data = JSON.parse(fs.readFileSync(path.join(dir, 'work/techno_nav.json'), 'utf8'));
    const engine = TechnoRoute.load(data);
    const context = makeContext(fetch);
    const destination = { room_id: '105', floor: '1F' };
    const origin = { outdoor: true, lat: payload.startY, lng: payload.startX };
    const candidates = engine.entranceCandidates(origin.lat, origin.lng, destination, {}, 3);
    const approaches = {};
    engine.entrances().forEach(entrance => { approaches[entrance.node] = { meters: 1e7, path: null }; });
    for (const candidate of candidates) {
        const entrance = candidate.entrance;
        const result = await context.fetchTmapWithOSRMFallback(
            'http://localhost:3000/tmap-routes?endpoint=pedestrian&version=1',
            { ...payload, endX: entrance.lon, endY: entrance.lat }, 'walk');
        assert.equal(result.provider, 'osrm-foot');
        const feature = result.features[0];
        approaches[entrance.node] = { meters: feature.properties.totalDistance,
            path: feature.geometry.coordinates.map(point => [point[1], point[0]]) };
    }
    const result = engine.route(origin, destination, { approaches });
    assert.ok(result.outdoor_measured);
    assert.ok(result.outdoor_distance_m < 350, 'Campus route must not take the old 650m detour');
    assert.ok(result.legs[0].latlngs.every(point => point[1] > 128.3925), 'Must not circle the west perimeter');
    assert.equal(result.destination.room_id, '105');
    console.log(JSON.stringify({ room: '1F 105', entrance: result.entrance.name,
        outdoor_m: result.outdoor_distance_m, points: result.legs[0].latlngs.length }));
}
(process.argv.includes('--live') ? live() : regression()).catch(error => {
    console.error(error); process.exitCode = 1;
});
