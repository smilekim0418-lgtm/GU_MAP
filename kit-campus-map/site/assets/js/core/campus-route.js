/**
 * 캠퍼스 길찾기: 실외 보행 그래프 + 테크노관 실내 엔진을 잇는다.
 *
 * 끝점 형식
 *   {type: 'gate', id: 'main'}         정문
 *   {type: 'building', id: 'b5'}       건물 (출입구 중 가장 빨리 닿는 곳)
 *   {type: 'unit', id: 'b3-u2'}        학과·시설 → 그 건물
 *   {type: 'room', id: 'T312'}         테크노관 호실 (실내까지)
 *   {type: 'bus', id: 'bus123'}        버스정류장
 *   {type: 'point', point: [경도, 위도], name?: {ko, en}}   내 위치
 *
 * 결과
 *   {meters, seconds, outdoor: {coords, meters, stairs} | null,
 *    indoor: {building, legs, floors, entrance} | null,
 *    steps: [...], notes: [...], from, to}
 *   실패하면 {error: 'unknown-place' | 'same-place' | 'no-route' | 'no-route-stairs'}
 *
 * 실내 엔진(techno-route-core)은 건물 밖에서 들어오는 구간을 직접 재지 않고
 * approaches 로 받는다. 출입구 11개 각각까지 실외 그래프 거리를 재서 넘기면
 * 엔진이 "실외 + 실내" 합이 가장 작은 문을 고른다.
 */
import { walkSteps } from './steps.js';

const DIRECTIONS = [
  ['남동쪽', 'Southeast'], ['남서쪽', 'Southwest'], ['북동쪽', 'Northeast'], ['북서쪽', 'Northwest'],
  ['남쪽', 'South'], ['북쪽', 'North'], ['동쪽', 'East'], ['서쪽', 'West'],
];
const MY_LOCATION = { ko: '내 위치', en: 'My location' };
const FAR = 1e7;

/** '남동쪽 출입구 (1F)' → {ko: '남동쪽 출입구 (1층)', en: 'Southeast entrance (1F)'} */
export function entranceName(raw) {
  const floor = /\((B?)(\d+)F\)/.exec(raw);
  const koFloor = floor ? (floor[1] ? `지하 ${floor[2]}층` : `${floor[2]}층`) : '';
  const enFloor = floor ? (floor[1] ? `B${floor[2]}` : `${floor[2]}F`) : '';
  const ko = floor ? raw.replace(floor[0], `(${koFloor})`) : raw;
  let en = raw.replace(/\s*\(B?\d+F\)/, '');
  for (const [k, e] of DIRECTIONS) en = en.replace(k, e);
  en = en.replace('출입구', 'entrance').replace(/\s+/g, ' ').trim();
  if (floor) en += ` (${enFloor})`;
  return { ko, en };
}

/** '계단-A' → 'A', 'EV-2' → '2' */
function shortName(raw) {
  return String(raw || '').replace(/^계단-/, '').replace(/^EV-/, '');
}

function roomPlace(room, building) {
  const bName = building ? building.name : { ko: '', en: '' };
  return {
    ko: `${bName.ko} ${room.label}호`.trim(),
    en: `${bName.en} Room ${room.label}`.trim(),
  };
}

function resolve(ctx, spec) {
  const { places } = ctx;
  if (!spec) return null;
  const buildingById = (id) => places.buildings.find((b) => b.id === id);
  const outdoorBuilding = (b, place, notes = []) => ({
    kind: 'outdoor', buildingId: b.id, place: place || b.name, notes,
    specs: b.entrances.map((e) => ({ node: e.node })),
    estimated: b.entrances.map((e) => !!e.estimated),
  });

  switch (spec.type) {
    case 'gate': {
      const gate = places.gates.find((g) => g.id === spec.id);
      return gate && { kind: 'outdoor', buildingId: gate.building, place: gate.name,
        specs: [{ node: gate.node }], estimated: [false], notes: [] };
    }
    case 'bus': {
      const stop = places.bus_stops.find((s) => s.id === spec.id);
      return stop && { kind: 'outdoor', buildingId: null, place: stop.name,
        specs: [{ node: stop.node }], estimated: [false], notes: [] };
    }
    case 'point':
      return Array.isArray(spec.point) && {
        kind: 'outdoor', buildingId: null, place: spec.name || MY_LOCATION,
        specs: [{ point: spec.point }], estimated: [false], notes: [] };
    case 'building': {
      const b = buildingById(spec.id);
      return b && outdoorBuilding(b);
    }
    case 'unit': {
      const unit = places.units.find((u) => u.id === spec.id);
      const b = unit && buildingById(unit.building);
      return b && outdoorBuilding(b, unit.name);
    }
    case 'room': {
      const room = places.rooms.find((r) => r.id === spec.id);
      if (!room) return null;
      const b = buildingById(room.building);
      if (room.routable && ctx.techno && b && b.indoor === 'techno') {
        return { kind: 'room', buildingId: b.id, room, building: b, place: roomPlace(room, b) };
      }
      return b && outdoorBuilding(b, roomPlace(room, b), ['room.notRoutable']);
    }
    default:
      return null;
  }
}

function noRoute(options) {
  return { error: options.avoidStairs ? 'no-route-stairs' : 'no-route' };
}

function indoorLegs(built) {
  return built.legs
    .filter((leg) => leg.mode !== 'outdoor')
    .map((leg) => ({
      floor: leg.floor,
      mode: leg.mode,
      to: leg.to_floor || null,
      name: shortName(leg.name),
      coords: leg.latlngs.map(([lat, lng]) => [lng, lat]),
      meters: leg.distance_m,
      seconds: leg.duration_s,
    }));
}

function floorsOf(legs) {
  const floors = [];
  for (const leg of legs) {
    for (const f of [leg.floor, leg.to]) if (f && !floors.includes(f)) floors.push(f);
  }
  return floors;
}

/** 실외(specs) → 테크노관 호실 */
function outdoorToRoom(ctx, specs, target, options) {
  const { graph, techno } = ctx;
  const entrances = target.building.entrances.filter((e) => e.techno_node !== undefined);
  const approaches = {};
  const reached = new Map();
  let origin = null;
  for (const e of entrances) {
    const walk = graph.shortest(specs, { node: e.node }, options);
    if (walk) {
      reached.set(e.techno_node, { walk, entrance: e });
      if (!origin) origin = walk.coords[0];
      // 같은 문에 여러 번 붙어 있으면 짧은 쪽
      const prior = approaches[e.techno_node];
      if (!prior || prior.meters > walk.meters) {
        approaches[e.techno_node] = { meters: walk.meters, path: walk.coords.map(([x, y]) => [y, x]) };
      }
    } else if (!approaches[e.techno_node]) {
      approaches[e.techno_node] = { meters: FAR, path: null };
    }
  }
  if (!reached.size) return null;

  let built;
  try {
    built = techno.route({ outdoor: true, lat: origin[1], lng: origin[0] },
      { room_id: target.room.label, floor: target.room.floor },
      { avoidStairs: !!options.avoidStairs, approaches });
  } catch (error) {
    return null;
  }
  const door = techno.data.entrances.find((e) => e.name === built.entrance.name);
  const used = door && reached.get(door.node);
  if (!used) return null;
  return {
    outdoor: { coords: used.walk.coords, meters: used.walk.meters, stairs: used.walk.stairs },
    legs: indoorLegs(built),
    entranceName: entranceName(built.entrance.name),
    outdoorEstimated: false,
  };
}

function seconds(ctx, outdoorMeters, legs) {
  const speed = ((ctx.places.meta && ctx.places.meta.walk_speed_mpm) || 75) / 60;
  return outdoorMeters / speed + legs.reduce((sum, leg) => sum + leg.seconds, 0);
}

function indoorSteps(legs) {
  const steps = [];
  for (const leg of legs) {
    if (leg.mode === 'walk') steps.push(...walkSteps(leg.coords));
    else steps.push({ kind: leg.mode === 'stairs' ? 'stairs' : 'elevator', name: leg.name, from: leg.floor, to: leg.to });
  }
  return steps.filter((s) => s.kind !== 'walk' || s.meters >= 1);
}

function reverseLegs(legs) {
  return legs.slice().reverse().map((leg) => ({
    ...leg,
    floor: leg.mode === 'walk' ? leg.floor : leg.to,
    to: leg.mode === 'walk' ? null : leg.floor,
    coords: leg.coords.slice().reverse(),
  }));
}

export function planRoute(ctx, from, to, options = {}) {
  const a = resolve(ctx, from);
  const b = resolve(ctx, to);
  if (!a || !b) return { error: 'unknown-place' };
  if (a.kind === 'room' && b.kind === 'room' && a.room.id === b.room.id) return { error: 'same-place' };
  if (a.kind !== 'room' && b.kind !== 'room' && a.buildingId && a.buildingId === b.buildingId) {
    return { error: 'same-place' };
  }
  const notes = [...(a.notes || []), ...(b.notes || [])];
  const finish = (result) => {
    if (result.outdoor && result.outdoor.stairs) notes.push('route.hasStairs');
    if (result.indoor && result.indoor.legs.some((l) => l.mode === 'stairs')) notes.push('route.hasStairs');
    return { ...result, notes: [...new Set(notes)], from: a.place, to: b.place };
  };
  const arrive = b.kind === 'room'
    ? { kind: 'arriveRoom', room: b.room.label, place: b.place }
    : { kind: 'arrive', place: b.place };

  // 1) 실외 ↔ 실외
  if (a.kind === 'outdoor' && b.kind === 'outdoor') {
    const walk = ctx.graph.shortest(a.specs, b.specs, options);
    if (!walk) return noRoute(options);
    if ((b.estimated[walk.target]) || (a.estimated[walk.source])) notes.push('route.estimated');
    return finish({
      meters: walk.meters, seconds: seconds(ctx, walk.meters, []),
      outdoor: { coords: walk.coords, meters: walk.meters, stairs: walk.stairs },
      indoor: null,
      steps: [{ kind: 'depart', place: a.place }, ...walkSteps(walk.coords), arrive],
    });
  }

  // 2) 실외 → 호실
  if (a.kind === 'outdoor' && b.kind === 'room') {
    const plan = outdoorToRoom(ctx, a.specs, b, options);
    if (!plan) return noRoute(options);
    if (a.estimated.some(Boolean) && a.specs.length > 1) notes.push('route.estimated');
    const indoorMeters = plan.legs.reduce((s, l) => s + l.meters, 0);
    return finish({
      meters: plan.outdoor.meters + indoorMeters,
      seconds: seconds(ctx, plan.outdoor.meters, plan.legs),
      outdoor: plan.outdoor,
      indoor: { building: b.buildingId, legs: plan.legs, floors: floorsOf(plan.legs), entrance: plan.entranceName },
      steps: [
        { kind: 'depart', place: a.place },
        ...walkSteps(plan.outdoor.coords).filter((s) => s.meters >= 1),
        { kind: 'enter', place: plan.entranceName },
        ...indoorSteps(plan.legs),
        arrive,
      ],
    });
  }

  // 3) 호실 → 실외: 거꾸로 재고 뒤집는다 (실내·실외 그래프 모두 양방향이다)
  if (a.kind === 'room' && b.kind === 'outdoor') {
    const plan = outdoorToRoom(ctx, b.specs, a, options);
    if (!plan) return noRoute(options);
    if (b.estimated.some(Boolean) && b.specs.length > 1) notes.push('route.estimated');
    const legs = reverseLegs(plan.legs);
    const coords = plan.outdoor.coords.slice().reverse();
    const indoorMeters = legs.reduce((s, l) => s + l.meters, 0);
    return finish({
      meters: plan.outdoor.meters + indoorMeters,
      seconds: seconds(ctx, plan.outdoor.meters, legs),
      outdoor: { ...plan.outdoor, coords },
      indoor: { building: a.buildingId, legs, floors: floorsOf(legs), entrance: plan.entranceName },
      steps: [
        { kind: 'depart', place: a.place },
        ...indoorSteps(legs),
        { kind: 'exit', place: plan.entranceName },
        ...walkSteps(coords).filter((s) => s.meters >= 1),
        arrive,
      ],
    });
  }

  // 4) 호실 → 호실 (같은 테크노관)
  const startRoom = ctx.techno.data.rooms.find((r) => r.room_id === a.room.label && r.floor === a.room.floor);
  if (!startRoom) return { error: 'unknown-place' };
  let built;
  try {
    built = ctx.techno.route(
      { floor: a.room.floor, x: startRoom.centroid[0], y: startRoom.centroid[1] },
      { room_id: b.room.label, floor: b.room.floor },
      { avoidStairs: !!options.avoidStairs });
  } catch (error) {
    return noRoute(options);
  }
  const legs = indoorLegs(built);
  const indoorMeters = legs.reduce((s, l) => s + l.meters, 0);
  return finish({
    meters: indoorMeters,
    seconds: seconds(ctx, 0, legs),
    outdoor: null,
    indoor: { building: a.buildingId, legs, floors: floorsOf(legs), entrance: null },
    steps: [{ kind: 'depart', place: a.place }, ...indoorSteps(legs), arrive],
  });
}
