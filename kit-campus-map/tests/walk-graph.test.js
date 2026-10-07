import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WalkGraph } from '../site/assets/js/core/walk-graph.js';
import { meters, bearing, projectToSegment, ringCentroid } from '../site/assets/js/core/geo.js';

// 0 —— 1 —— 2      위 경로는 계단(1-2) 포함
// |           |
// 3 ————————— 4    아래 경로는 평지, 더 길다
const lng0 = 128.39;
const lat0 = 36.145;
const d = 0.0001;
const nodes = [[lng0, lat0], [lng0 + d, lat0], [lng0 + 2 * d, lat0],
  [lng0, lat0 - d], [lng0 + 2 * d, lat0 - d]];
const m = (a, b) => meters(nodes[a], nodes[b]);
const edges = [[0, 1, m(0, 1), 0], [1, 2, m(1, 2), 1], [0, 3, m(0, 3), 0],
  [3, 4, m(3, 4), 0], [4, 2, m(4, 2), 0]];
const g = new WalkGraph({ nodes, edges });

test('geo: 거리·방위각·투영', () => {
  const east = meters([lng0, lat0], [lng0 + 0.001, lat0]);
  assert.ok(east > 89 && east < 91, String(east));
  assert.ok(Math.abs(bearing([lng0, lat0], [lng0, lat0 + 0.001])) < 1);
  assert.ok(Math.abs(bearing([lng0, lat0], [lng0 + 0.001, lat0]) - 90) < 1);
  const p = projectToSegment([lng0 + d / 2, lat0 + 0.00001], nodes[0], nodes[1]);
  assert.ok(Math.abs(p.t - 0.5) < 0.01);
  assert.ok(p.meters > 1 && p.meters < 1.2);
});

test('geo: 사각형 무게중심', () => {
  const c = ringCentroid([[lng0, lat0], [lng0 + 2 * d, lat0], [lng0 + 2 * d, lat0 + d], [lng0, lat0 + d]]);
  assert.ok(Math.abs(c[0] - (lng0 + d)) < 1e-9 && Math.abs(c[1] - (lat0 + d / 2)) < 1e-9, String(c));
});

test('최단 경로는 계단을 쓴다', () => {
  const r = g.shortest({ node: 0 }, { node: 2 });
  assert.equal(r.stairs, true);
  assert.equal(r.coords.length, 3);
  assert.ok(Math.abs(r.meters - (m(0, 1) + m(1, 2))) < 0.01);
});

test('계단 회피', () => {
  const r = g.shortest({ node: 0 }, { node: 2 }, { avoidStairs: true });
  assert.equal(r.stairs, false);
  assert.equal(r.coords.length, 4);
});

test('여러 도착 후보 중 가까운 쪽, 고른 후보의 번호를 알려 준다', () => {
  const r = g.shortest({ node: 0 }, [{ node: 4 }, { node: 1 }]);
  assert.deepEqual(r.coords.at(-1), nodes[1]);
  assert.equal(r.target, 1);
});

test('여러 출발 후보', () => {
  const r = g.shortest([{ node: 3 }, { node: 2 }], { node: 1 });
  assert.equal(r.source, 1);
});

test('임의 점을 엣지에 붙인다', () => {
  const r = g.shortest({ point: [lng0 + d / 2, lat0 + 0.00001] }, { node: 2 });
  assert.ok(r.meters > m(0, 2) / 2 && r.meters < m(0, 2) / 2 + m(1, 2) + 3, String(r.meters));
  assert.deepEqual(r.coords[0], [lng0 + d / 2, lat0 + 0.00001]);
});

test('같은 엣지 위의 두 점', () => {
  const a = [lng0 + d * 0.2, lat0];
  const b = [lng0 + d * 0.8, lat0];
  const r = g.shortest({ point: a }, { point: b });
  assert.ok(Math.abs(r.meters - m(0, 1) * 0.6) < 0.5, String(r.meters));
});

test('snap 은 가장 가까운 엣지', () => {
  const s = g.snap([lng0 + 2 * d + 0.00002, lat0 - d / 2]);
  assert.deepEqual([edges[s.edge][0], edges[s.edge][1]].sort(), [2, 4]);
});

test('길이 없으면 null', () => {
  const lone = new WalkGraph({ nodes: [[0, 0], [1, 1]], edges: [] });
  assert.equal(lone.shortest({ node: 0 }, { node: 1 }), null);
});

test('실제 그래프: 정문에서 모든 건물로 갈 수 있다', () => {
  const read = (p) => JSON.parse(readFileSync(new URL('../site/data/' + p, import.meta.url)));
  const places = read('places.json');
  const graph = new WalkGraph(read('walk-graph.json'));
  const gate = { node: places.gates[0].node };
  for (const b of places.buildings) {
    const r = graph.shortest(gate, b.entrances.map((e) => ({ node: e.node })));
    assert.ok(r, b.id);
    assert.ok(r.meters < 2000, `${b.id} ${r.meters}`);
  }
});
