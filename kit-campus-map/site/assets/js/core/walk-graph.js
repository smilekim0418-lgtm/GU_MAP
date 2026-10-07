/**
 * 실외 보행 그래프 최단경로.
 *
 * 그래프는 build_data.py 가 OSM 보행로로 구워 둔 walk-graph.json 이다.
 *   nodes: [[경도, 위도], ...]
 *   edges: [[a, b, 미터, flags], ...]   flags 1 = 계단, 2 = 출입구 연결선
 *
 * 출발·도착은 {node: i} 또는 {point: [경도, 위도]} 이고, 배열로 주면 그중 가장
 * 가까운 쪽을 고른다 (건물 출입구 여러 개 → 가장 빨리 닿는 문).
 * 임의의 점은 가장 가까운 길에 수선을 내려 임시 노드로 잇는다. 원본 그래프는
 * 건드리지 않는다.
 */
import { meters, projectToSegment } from './geo.js';

export const FLAG_STEPS = 1;
export const FLAG_CONNECTOR = 2;

class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(cost, node) {
    const items = this.items;
    items.push([cost, node]);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent][0] <= items[i][0]) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }
  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let smallest = i;
        if (l < items.length && items[l][0] < items[smallest][0]) smallest = l;
        if (r < items.length && items[r][0] < items[smallest][0]) smallest = r;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

export class WalkGraph {
  constructor({ nodes, edges }) {
    this.nodes = nodes;
    this.edges = edges;
    this.adjacency = nodes.map(() => []);
    edges.forEach(([a, b, length, flags], index) => {
      this.adjacency[a].push([b, length, flags, index]);
      this.adjacency[b].push([a, length, flags, index]);
    });
  }

  /** 점에서 가장 가까운 길(출입구 연결선 제외) 위의 점 */
  snap(point) {
    let best = null;
    this.edges.forEach(([a, b, , flags], index) => {
      if (flags & FLAG_CONNECTOR) return;
      const hit = projectToSegment(point, this.nodes[a], this.nodes[b]);
      if (!best || hit.meters < best.meters) best = { edge: index, ...hit };
    });
    return best;
  }

  /**
   * @returns {meters, coords, stairs, source, target} | null
   *   source/target: 배열로 준 후보 중 고른 것의 번호
   */
  shortest(from, to, options = {}) {
    const avoidStairs = !!options.avoidStairs;
    const sources = Array.isArray(from) ? from : [from];
    const targets = Array.isArray(to) ? to : [to];
    const n = this.nodes.length;

    // 임시 노드는 n, n+1, … 번호를 받는다. 좌표·인접은 여기에만 둔다.
    const extraCoords = [];
    const extraAdj = new Map();
    const link = (u, v, length, flags) => {
      if (!extraAdj.has(u)) extraAdj.set(u, []);
      extraAdj.get(u).push([v, length, flags]);
    };
    const coordOf = (i) => (i < n ? this.nodes[i] : extraCoords[i - n]);
    const virtual = (point) => { extraCoords.push(point); return n + extraCoords.length - 1; };

    // 출발 후보
    const start = new Map();      // 노드 → 시작 비용
    const startOf = new Map();    // 노드 → 후보 번호
    const leadIn = new Map();     // 노드 → 길 밖 출발점 (경로 맨 앞에 붙인다)
    const snapped = [];           // 같은 엣지 위 출발·도착 처리를 위해
    sources.forEach((spec, k) => {
      if (spec.node !== undefined) {
        if (!start.has(spec.node) || start.get(spec.node) > 0) {
          start.set(spec.node, 0);
          startOf.set(spec.node, k);
        }
        return;
      }
      const hit = this.snap(spec.point);
      if (!hit) return;
      const v = virtual(hit.point);
      const [a, b, length, flags] = this.edges[hit.edge];
      link(v, a, length * hit.t, flags);
      link(v, b, length * (1 - hit.t), flags);
      start.set(v, hit.meters);
      startOf.set(v, k);
      if (hit.meters > 0.5) leadIn.set(v, spec.point);
      snapped.push({ v, edge: hit.edge, t: hit.t, length, flags });
    });

    // 도착 후보
    const goal = new Map();       // 노드 → 후보 번호
    const leadOut = new Map();    // 노드 → 길 밖 도착점
    const goalExtra = new Map();  // 노드 → 마지막에 더할 거리
    targets.forEach((spec, k) => {
      if (spec.node !== undefined) {
        if (!goal.has(spec.node)) goal.set(spec.node, k);
        return;
      }
      const hit = this.snap(spec.point);
      if (!hit) return;
      const v = virtual(hit.point);
      const [a, b, length, flags] = this.edges[hit.edge];
      link(a, v, length * hit.t, flags);
      link(b, v, length * (1 - hit.t), flags);
      for (const s of snapped) {
        if (s.edge === hit.edge) link(s.v, v, Math.abs(s.t - hit.t) * length, flags);
      }
      goal.set(v, k);
      goalExtra.set(v, hit.meters);
      if (hit.meters > 0.5) leadOut.set(v, spec.point);
    });
    if (!start.size || !goal.size) return null;

    const dist = new Map();
    const previous = new Map();
    const previousFlags = new Map();
    const heap = new MinHeap();
    for (const [node, cost] of start) {
      dist.set(node, cost);
      heap.push(cost, node);
    }

    let reached = -1;
    while (heap.size) {
      const [cost, u] = heap.pop();
      if (cost > (dist.get(u) ?? Infinity)) continue;
      if (goal.has(u)) { reached = u; break; }
      const neighbours = u < n ? this.adjacency[u] : [];
      const extra = extraAdj.get(u) || [];
      for (const list of [neighbours, extra]) {
        for (const [v, length, flags] of list) {
          if (avoidStairs && (flags & FLAG_STEPS)) continue;
          const next = cost + length;
          if (next < (dist.get(v) ?? Infinity)) {
            dist.set(v, next);
            previous.set(v, u);
            previousFlags.set(v, flags);
            heap.push(next, v);
          }
        }
      }
    }
    if (reached < 0) return null;

    const chain = [];
    let stairs = false;
    for (let at = reached; at !== undefined; at = previous.get(at)) {
      chain.push(at);
      if ((previousFlags.get(at) || 0) & FLAG_STEPS) stairs = true;
    }
    chain.reverse();
    const first = chain[0];
    const coords = [];
    if (leadIn.has(first)) coords.push(leadIn.get(first));
    for (const node of chain) {
      const c = coordOf(node);
      const last = coords[coords.length - 1];
      if (!last || meters(last, c) > 0.05) coords.push(c);
    }
    if (leadOut.has(reached)) coords.push(leadOut.get(reached));

    return {
      meters: dist.get(reached) + (goalExtra.get(reached) || 0),
      coords,
      stairs,
      source: startOf.get(first),
      target: goal.get(reached),
    };
  }
}
