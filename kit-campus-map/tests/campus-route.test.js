import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WalkGraph } from '../site/assets/js/core/walk-graph.js';
import { planRoute, entranceName } from '../site/assets/js/core/campus-route.js';
import { walkSteps } from '../site/assets/js/core/steps.js';

const read = (p) => JSON.parse(readFileSync(new URL('../site/data/' + p, import.meta.url)));
// 브라우저처럼 일반 스크립트로 읽혀 전역 TechnoRoute 를 남긴다
await import('../site/vendor/techno-route-core.js');
const { TechnoRoute } = globalThis;
const places = read('places.json');
const graph = new WalkGraph(read('walk-graph.json'));
const techno = TechnoRoute.load(read('techno/nav.json'));
const ctx = { graph, places, techno };

test('ㄱ자 경로: 이동 후 오른쪽, 그다음 이동', () => {
  const s = walkSteps([[128.39, 36.14], [128.39, 36.1405], [128.3905, 36.1405]]);
  assert.equal(s.length, 2);
  assert.equal(s[0].kind, 'walk');
  assert.equal(s[0].turn, 'right');
  assert.ok(s[0].meters > 50 && s[0].meters < 60, String(s[0].meters));
  assert.equal(s[1].turn, null);
});

test('짧은 꺾임은 직진으로 묶는다', () => {
  const s = walkSteps([[128.39, 36.14], [128.39, 36.1405], [128.39003, 36.14052], [128.39003, 36.141]]);
  assert.equal(s.length, 1);
});

test('출입구 이름 번역', () => {
  assert.deepEqual(entranceName('남동쪽 출입구 (1F)'), { ko: '남동쪽 출입구 (1층)', en: 'Southeast entrance (1F)' });
  assert.deepEqual(entranceName('서쪽 출입구 (B1F)'), { ko: '서쪽 출입구 (지하 1층)', en: 'West entrance (B1)' });
});

test('정문 → 도서관 (실외만)', () => {
  const r = planRoute(ctx, { type: 'gate', id: 'main' }, { type: 'building', id: 'b5' });
  assert.ok(!r.error, r.error);
  assert.ok(r.meters > 150 && r.meters < 1200, String(r.meters));
  assert.equal(r.indoor, null);
  assert.equal(r.steps[0].kind, 'depart');
  assert.equal(r.steps.at(-1).kind, 'arrive');
  assert.ok(r.seconds > 60);
});

test('정문 → 테크노관 3층 방: 실외 + 실내', () => {
  const room = places.rooms.find((x) => x.floor === '3F' && x.routable);
  const r = planRoute(ctx, { type: 'gate', id: 'main' }, { type: 'room', id: room.id });
  assert.ok(!r.error, r.error);
  assert.ok(r.indoor && r.indoor.legs.length > 0);
  assert.ok(r.indoor.floors.includes('3F'));
  assert.ok(r.steps.some((s) => s.kind === 'enter'));
  assert.ok(r.steps.some((s) => s.kind === 'stairs' || s.kind === 'elevator'));
  assert.equal(r.steps.at(-1).kind, 'arriveRoom');
  assert.ok(r.outdoor.coords.length >= 2);
  // 실외 경로는 고른 출입구에서 끝난다
  const door = r.outdoor.coords.at(-1);
  assert.ok(places.buildings.find((b) => b.id === 'b2').entrances
    .some((e) => Math.abs(e.point[0] - door[0]) < 1e-6 && Math.abs(e.point[1] - door[1]) < 1e-6));
});

test('계단 피하기면 엘리베이터를 탄다', () => {
  const room = places.rooms.find((x) => x.floor === '4F' && x.routable);
  const r = planRoute(ctx, { type: 'gate', id: 'main' }, { type: 'room', id: room.id }, { avoidStairs: true });
  assert.ok(!r.error, r.error);
  assert.ok(!r.steps.some((s) => s.kind === 'stairs'));
  assert.ok(r.steps.some((s) => s.kind === 'elevator'));
});

test('방 → 정문 (거꾸로)', () => {
  const room = places.rooms.find((x) => x.floor === '2F' && x.routable);
  const r = planRoute(ctx, { type: 'room', id: room.id }, { type: 'gate', id: 'main' });
  assert.ok(!r.error, r.error);
  assert.equal(r.steps[0].kind, 'depart');
  assert.ok(r.steps.some((s) => s.kind === 'exit'));
  assert.equal(r.steps.at(-1).kind, 'arrive');
});

test('방 → 같은 건물 다른 방 (실내만)', () => {
  const rooms = places.rooms.filter((x) => x.routable);
  const a = rooms.find((x) => x.floor === '1F');
  const b = rooms.find((x) => x.floor === '5F');
  const r = planRoute(ctx, { type: 'room', id: a.id }, { type: 'room', id: b.id });
  assert.ok(!r.error, r.error);
  assert.equal(r.outdoor, null);
  assert.ok(r.indoor.floors.includes('5F'));
});

test('실내 경로가 없는 방은 건물까지 안내하고 알린다', () => {
  const room = places.rooms.find((x) => !x.routable);
  const r = planRoute(ctx, { type: 'gate', id: 'main' }, { type: 'room', id: room.id });
  assert.ok(!r.error, r.error);
  assert.equal(r.indoor, null);
  assert.ok(r.notes.includes('room.notRoutable'));
});

test('임의 지점(내 위치)에서 출발', () => {
  const r = planRoute(ctx, { type: 'point', point: [128.3935, 36.1440] }, { type: 'building', id: 'b3' });
  assert.ok(!r.error, r.error);
  assert.ok(r.meters > 0);
});

test('같은 장소, 모르는 장소', () => {
  assert.equal(planRoute(ctx, { type: 'building', id: 'b5' }, { type: 'building', id: 'b5' }).error, 'same-place');
  assert.equal(planRoute(ctx, { type: 'building', id: 'nope' }, { type: 'building', id: 'b5' }).error, 'unknown-place');
});
