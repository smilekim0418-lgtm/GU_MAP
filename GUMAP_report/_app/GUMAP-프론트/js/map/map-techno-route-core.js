/**
 * 테크노관 실내 길찾기 엔진 (브라우저용)
 * techno-route-core.js
 * ──────────────────────────────────────────────────────────
 * fp/route.py 와 같은 알고리즘·같은 비용 모델을 쓴다. 그래프는 05_build_nav.py 가
 * 미리 구워 둔 것을 그대로 받는다 (노드 1,170 · 엣지 7,300 · 약 330KB).
 *
 * 브라우저가 직접 계산하는 것은 "임의의 출발점을 그래프에 붙이는 가시선"뿐이다.
 * 나머지 기하 계산은 전부 빌드 때 끝나 있어, 길찾기 한 번이 5ms 안에 끝난다.
 *
 * 이 파일은 DOM 도 Leaflet 도 모른다. 렌더링은 부르는 쪽이 한다.
 */
(function (global) {
  'use strict';

  var TURN_DEGREES = 25.0;       // 안내문: 이 각도 넘어야 "방향 전환"
  var UTURN_DEGREES = 140.0;
  var EPS = 1e-9;

  /* ───────────────────────── 기하 ───────────────────────── */

  function pointInRings(rings, x, y) {
    // 짝-홀 규칙. 외곽 링과 구멍 링을 한꺼번에 세면 구멍이 자동으로 빠진다.
    var inside = false;
    for (var r = 0; r < rings.length; r++) {
      var ring = rings[r];
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        var xi = ring[i][0], yi = ring[i][1];
        var xj = ring[j][0], yj = ring[j][1];
        if (((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi + EPS) + xi)) {
          inside = !inside;
        }
      }
    }
    return inside;
  }

  function orientation(ax, ay, bx, by, cx, cy) {
    var value = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(value) < 1e-7) return 0;
    return value > 0 ? 1 : -1;
  }

  function crosses(ax, ay, bx, by, cx, cy, dx, dy) {
    // 꼭짓점을 스치는 접촉은 통과로 본다. 벽을 실제로 뚫고 지나갈 때만 막는다.
    var d1 = orientation(ax, ay, bx, by, cx, cy);
    var d2 = orientation(ax, ay, bx, by, dx, dy);
    var d3 = orientation(cx, cy, dx, dy, ax, ay);
    var d4 = orientation(cx, cy, dx, dy, bx, by);
    return d1 * d2 < 0 && d3 * d4 < 0;
  }

  function segmentInside(rings, ax, ay, bx, by) {
    for (var r = 0; r < rings.length; r++) {
      var ring = rings[r];
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        if (crosses(ax, ay, bx, by, ring[j][0], ring[j][1], ring[i][0], ring[i][1])) {
          return false;
        }
      }
    }
    // 경계를 하나도 안 넘었다면 선분 전체가 같은 쪽에 있다. 몇 점만 확인하면 된다.
    for (var t = 1; t <= 7; t++) {
      var k = t / 8;
      if (!pointInRings(rings, ax + (bx - ax) * k, ay + (by - ay) * k)) return false;
    }
    return true;
  }

  function distance(ax, ay, bx, by) {
    return Math.hypot(bx - ax, by - ay);
  }

  function nearestOnRings(rings, x, y) {
    var best = null, bestDistance = Infinity;
    for (var r = 0; r < rings.length; r++) {
      var ring = rings[r];
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        var ax = ring[j][0], ay = ring[j][1], bx = ring[i][0], by = ring[i][1];
        var dx = bx - ax, dy = by - ay;
        var length2 = dx * dx + dy * dy;
        var t = length2 < EPS ? 0 : ((x - ax) * dx + (y - ay) * dy) / length2;
        t = Math.max(0, Math.min(1, t));
        var px = ax + dx * t, py = ay + dy * t;
        var d = distance(x, y, px, py);
        if (d < bestDistance) { bestDistance = d; best = [px, py]; }
      }
    }
    return best;
  }

  /* ───────────────────────── 우선순위 큐 ───────────────────────── */

  function Heap() { this.items = []; }
  Heap.prototype.push = function (cost, key) {
    var items = this.items;
    items.push([cost, key]);
    var i = items.length - 1;
    while (i > 0) {
      var parent = (i - 1) >> 1;
      if (items[parent][0] <= items[i][0]) break;
      var swap = items[parent]; items[parent] = items[i]; items[i] = swap;
      i = parent;
    }
  };
  Heap.prototype.pop = function () {
    var items = this.items;
    var top = items[0];
    var last = items.pop();
    if (items.length) {
      items[0] = last;
      var i = 0;
      for (;;) {
        var left = 2 * i + 1, right = left + 1, smallest = i;
        if (left < items.length && items[left][0] < items[smallest][0]) smallest = left;
        if (right < items.length && items[right][0] < items[smallest][0]) smallest = right;
        if (smallest === i) break;
        var swap = items[smallest]; items[smallest] = items[i]; items[i] = swap;
        i = smallest;
      }
    }
    return top;
  };
  Heap.prototype.size = function () { return this.items.length; };

  /* ───────────────────────── 엔진 ───────────────────────── */

  function Engine(data) {
    this.data = data;
    this.cost = data.meta.cost;
    this.floorOrder = data.meta.floors;
    this.nodes = data.nodes;

    // 인접 리스트: [이웃, 미터, mode]
    var adjacency = new Array(data.nodes.length);
    for (var i = 0; i < adjacency.length; i++) adjacency[i] = [];
    data.edges.forEach(function (edge) {
      adjacency[edge[0]].push([edge[1], edge[2], edge[3]]);
      adjacency[edge[1]].push([edge[0], edge[2], edge[3]]);
    });
    this.adjacency = adjacency;

    // 층별 보행 노드 (출발점을 붙일 후보)
    var walkable = {};
    data.nodes.forEach(function (node, index) {
      if (node.k === 'corridor' || node.k === 'access' || node.k === 'entry') {
        (walkable[node.f] || (walkable[node.f] = [])).push(index);
      }
    });
    this.walkNodes = walkable;
  }

  Engine.prototype.floors = function () { return this.floorOrder.slice(); };
  Engine.prototype.rooms = function () { return this.data.rooms; };

  Engine.prototype.roomsOnFloor = function (floor) {
    return this.data.rooms.filter(function (row) { return row.floor === floor; });
  };

  Engine.prototype.toMeters = function (floor, pixels) {
    return pixels / (this.data.floors[floor].px_per_mm * 1000);
  };

  Engine.prototype.floorGap = function (a, b) {
    return Math.abs(this.floorOrder.indexOf(a) - this.floorOrder.indexOf(b));
  };

  Engine.prototype.edgeSeconds = function (fromIndex, toIndex, meters, mode) {
    if (mode === 'walk') return meters / this.cost.walk_speed_mps;
    var gap = this.floorGap(this.nodes[fromIndex].f, this.nodes[toIndex].f);
    if (mode === 'stair') return this.cost.stair_seconds_per_floor * gap;
    return this.cost.elevator_wait_seconds + this.cost.elevator_seconds_per_floor * gap;
  };

  /** 픽셀 좌표 → [위도, 경도]. Leaflet 에 그대로 넣을 수 있다. */
  Engine.prototype.pxToLatLng = function (floor, x, y) {
    var geo = this.data.geo;
    var origin = geo.floor_origin_px[floor];
    var perMm = geo.floor_px_per_mm[floor];
    if (!origin || !perMm || !geo.transform) return null;
    var xm = (x - origin[0]) / perMm / 1000;
    var ym = -(y - origin[1]) / perMm / 1000;
    var theta = geo.transform.theta_deg * Math.PI / 180;
    var scale = geo.transform.scale;
    var east = scale * (xm * Math.cos(theta) - ym * Math.sin(theta));
    var north = scale * (xm * Math.sin(theta) + ym * Math.cos(theta));
    var metersPerDegLon = geo.meters_per_deg_lon_at_equator *
      Math.cos(geo.reference_latitude * Math.PI / 180);
    return [
      geo.transform.t_lat + north / geo.meters_per_deg_lat,
      geo.transform.t_lon + east / metersPerDegLon
    ];
  };

  /** [위도, 경도] → 도면 픽셀 좌표. pxToLatLng 의 역변환. */
  Engine.prototype.latLngToPx = function (floor, lat, lng) {
    var geo = this.data.geo;
    var origin = geo.floor_origin_px[floor];
    var perMm = geo.floor_px_per_mm[floor];
    if (!origin || !perMm || !geo.transform) return null;
    var metersPerDegLon = geo.meters_per_deg_lon_at_equator *
      Math.cos(geo.reference_latitude * Math.PI / 180);
    var east = (lng - geo.transform.t_lon) * metersPerDegLon;
    var north = (lat - geo.transform.t_lat) * geo.meters_per_deg_lat;
    var theta = geo.transform.theta_deg * Math.PI / 180;
    var scale = geo.transform.scale;
    var xm = (east * Math.cos(theta) + north * Math.sin(theta)) / scale;
    var ym = (-east * Math.sin(theta) + north * Math.cos(theta)) / scale;
    return [origin[0] + xm * 1000 * perMm, origin[1] - ym * 1000 * perMm];
  };

  /** 점이 복도 안인지, 어느 방 안인지, 아니면 바깥인지. */
  Engine.prototype.locate = function (floor, x, y) {
    var info = this.data.floors[floor];
    if (!info) return { where: 'unknown' };
    if (pointInRings(info.walkable, x, y)) return { where: 'corridor', x: x, y: y };
    if (pointInRings(info.corridor, x, y)) {
      var pushed = this.pushInside(floor, x, y);
      if (pushed) return { where: 'corridor', x: pushed[0], y: pushed[1] };
    }
    for (var roomId in info.rooms) {
      if (pointInRings([info.rooms[roomId].points], x, y)) {
        return { where: 'room', room_id: roomId, x: x, y: y };
      }
    }
    return { where: 'outside', x: x, y: y };
  };

  /** 복도 밖 점을 보행영역 안으로 끌어들인다. */
  Engine.prototype.pushInside = function (floor, x, y) {
    var rings = this.data.floors[floor].walkable;
    if (pointInRings(rings, x, y)) return [x, y];
    var landing = nearestOnRings(rings, x, y);
    if (!landing) return null;
    var dx = landing[0] - x, dy = landing[1] - y;
    var length = Math.hypot(dx, dy) || 1;
    dx /= length; dy /= length;
    var steps = [1, 2, 3, 5, 8, 12];
    for (var i = 0; i < steps.length; i++) {
      var candidate = [landing[0] + dx * steps[i], landing[1] + dy * steps[i]];
      if (pointInRings(rings, candidate[0], candidate[1])) return candidate;
    }
    return null;
  };

  /* ───────────────── 건물 밖에서 들어오기 ─────────────────
   *
   * connects 에 "외부" 가 들어 있는 문이 출입구다. 빌드 때 위경도까지 실어
   * 두었으므로, 실외 출발지는 가장 가까운 출입구에 직선으로 붙인다.
   * 실외 구간은 아직 직선거리다 - 보행로 네트워크를 쓰려면 여기만 바꾸면 된다.
   */

  Engine.prototype.entrances = function () {
    return this.data.entrances || [];
  };

  Engine.prototype.hasEntrances = function () {
    return (this.data.entrances || []).length > 0;
  };

  /** 위경도 두 점 사이 거리(m). 실내 축척이 아니라 지구 위 거리다. */
  Engine.prototype.metersBetween = function (lat1, lon1, lat2, lon2) {
    var geo = this.data.geo;
    var perLat = geo.meters_per_deg_lat;
    var perLon = geo.meters_per_deg_lon_at_equator *
      Math.cos(geo.reference_latitude * Math.PI / 180);
    var dy = (lat2 - lat1) * perLat;
    var dx = (lon2 - lon1) * perLon;
    return Math.hypot(dx, dy);
  };

  /** 실외 지점에서 가장 가까운 출입구. */
  Engine.prototype.nearestEntrance = function (lat, lng) {
    var self = this;
    var best = null;
    (this.data.entrances || []).forEach(function (entrance) {
      var meters = self.metersBetween(lat, lng, entrance.lat, entrance.lon);
      if (!best || meters < best.meters) best = { entrance: entrance, meters: meters };
    });
    return best;
  };

  /**
   * 실외 그래프를 미터 좌표로 펴서 캐시한다.
   *
   * 위경도 그대로 기하 판정을 하면 안 된다. orientation() 의 여유가 1e-7 인데
   * 위경도에서 50m 선분 두 개의 외적은 2e-7 언저리라, 진짜 교차를 0으로
   * 삼켜 버린다. 미터로 펴 두면 같은 값이 1e4 여서 여유가 안전해진다.
   */
  Engine.prototype.outdoorSpace = function () {
    if (this._outdoorSpace !== undefined) return this._outdoorSpace;
    var raw = this.data.outdoor;
    if (!raw || !raw.nodes || !raw.nodes.length) {
      this._outdoorSpace = null;
      return null;
    }
    var geo = this.data.geo;
    var perLat = geo.meters_per_deg_lat;
    var perLon = geo.meters_per_deg_lon_at_equator *
      Math.cos(geo.reference_latitude * Math.PI / 180);
    // 구멍(중정)이 있을 수 있어 링이 여럿이다. 옛 번들은 ring 단수였다.
    var outerRings = raw.rings || (raw.ring ? [raw.ring] : []);
    if (!outerRings.length) { this._outdoorSpace = null; return null; }
    var base = outerRings[0][0];

    function project(point) {
      return [(point[0] - base[0]) * perLon, (point[1] - base[1]) * perLat];
    }

    var nodeCount = raw.nodes.length;
    var points = raw.nodes.concat(raw.approaches);       // 위경도
    var flat = points.map(project);                      // 미터
    var adjacency = points.map(function () { return []; });

    function link(a, b, meters) {
      adjacency[a].push([b, meters]);
      adjacency[b].push([a, meters]);
    }
    (raw.edges || []).forEach(function (e) { link(e[0], e[1], e[2]); });
    (raw.entrance_edges || []).forEach(function (e) {
      link(e[0], nodeCount + e[1], e[2]);
    });
    (raw.approach_edges || []).forEach(function (e) {
      link(nodeCount + e[0], nodeCount + e[1], e[2]);
    });

    this._outdoorSpace = {
      rings: outerRings.map(function (ring) { return ring.map(project); }),
      points: points, flat: flat, adjacency: adjacency,
      nodeCount: nodeCount, project: project
    };
    return this._outdoorSpace;
  };

  /** 선분이 건물(과 여유폭)을 뚫고 지나가는가. 좌표는 미터. */
  function blocksOutdoor(rings, ax, ay, bx, by) {
    for (var r = 0; r < rings.length; r++) {
      var ring = rings[r];
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        if (crosses(ax, ay, bx, by, ring[j][0], ring[j][1], ring[i][0], ring[i][1])) {
          return true;
        }
      }
    }
    // 어느 변도 안 넘었는데 가운데가 안이면, 선분이 통째로 건물 안이다.
    return pointInRings(rings, (ax + bx) / 2, (ay + by) / 2);
  }

  /**
   * 건물 밖 한 점에서 각 출입구까지, 건물을 돌아가는 최단 도보.
   * 반환: 출입구 순서대로 {meters, path(위경도)} 또는 null.
   */
  Engine.prototype.outdoorWalk = function (lat, lng) {
    var space = this.outdoorSpace();
    if (!space) return null;
    var entrances = this.data.entrances || [];
    var self = this;

    var here = space.project([lng, lat]);
    var count = space.points.length;
    var start = count;

    var best = new Float64Array(count + 1).fill(Infinity);
    var previous = new Int32Array(count + 1).fill(-1);
    best[start] = 0;

    var seeds = [];
    for (var i = 0; i < count; i++) {
      if (!blocksOutdoor(space.rings, here[0], here[1],
                         space.flat[i][0], space.flat[i][1])) {
        seeds.push([i, Math.hypot(space.flat[i][0] - here[0],
                                  space.flat[i][1] - here[1])]);
      }
    }
    if (!seeds.length) {
      // 건물 바로 옆이거나 안쪽을 찍은 경우. 길을 못 내느니 최근접에 붙인다.
      var nearest = 0, nearestSpan = Infinity;
      for (var k = 0; k < count; k++) {
        var span = Math.hypot(space.flat[k][0] - here[0], space.flat[k][1] - here[1]);
        if (span < nearestSpan) { nearestSpan = span; nearest = k; }
      }
      seeds.push([nearest, nearestSpan]);
    }

    var heap = new Heap();
    seeds.forEach(function (seed) {
      if (seed[1] < best[seed[0]]) {
        best[seed[0]] = seed[1];
        previous[seed[0]] = start;
        heap.push(seed[1], seed[0]);
      }
    });

    while (heap.size()) {
      var top = heap.pop();
      var cost = top[0], at = top[1];
      if (cost > best[at] + 1e-9) continue;
      var links = space.adjacency[at];
      for (var e = 0; e < links.length; e++) {
        var next = cost + links[e][1];
        if (next < best[links[e][0]] - 1e-9) {
          best[links[e][0]] = next;
          previous[links[e][0]] = at;
          heap.push(next, links[e][0]);
        }
      }
    }

    return entrances.map(function (entrance, index) {
      // 배열 순번이 아니라 출입구가 들고 있는 번호를 쓴다. 목록을 거른
      // 상태로 불러도 제 진입 자리를 찾아가야 한다.
      var slot = entrance.approach === undefined ? index : entrance.approach;
      var target = space.nodeCount + slot;
      if (!isFinite(best[target])) return null;
      var chain = [];
      for (var at = target; at !== -1 && at !== start; at = previous[at]) {
        chain.push(space.points[at]);
      }
      chain.reverse();
      // 진입 자리에서 문까지 남은 몇 미터도 세어 준다
      var approach = space.points[target];
      var lastHop = self.metersBetween(approach[1], approach[0],
                                       entrance.lat, entrance.lon);
      var path = [[lat, lng]];
      chain.forEach(function (point) { path.push([point[1], point[0]]); });
      path.push([entrance.lat, entrance.lon]);
      return { meters: best[target] + lastHop, path: path };
    });
  };

  /**
   * 실외 출발지는 문을 하나 고르지 않는다. 출입구 전부를 출발 후보로 깔고
   * 각자의 실외 도보시간을 초기비용으로 준다. 그러면 탐색이 "가장 빨리
   * 도착하는 문" 을 스스로 고른다.
   *
   * 가까운 문을 고르면 안 된다. 실측(출입구 11개)에서 가까운 문 선택이
   * 표본의 67% 에서 손해였고 최악은 130초였다. 코앞의 문이 지하 복도로만
   * 이어져 있으면, 12m 더 걸어 다른 문으로 들어가는 편이 2분 빠르다.
   */
  /**
   * @param overrides {nodeIndex: {meters, path}} 밖에서 실제로 재 온 실외 구간.
   *        지도의 보행자 길찾기(TMAP/OSRM)가 준 값을 여기로 넣는다. 엔진은
   *        비동기 호출을 하지 않는다 - 재 온 결과만 받는다.
   */
  Engine.prototype.attachOutdoorStart = function (lat, lng, overrides) {
    var self = this;
    var byNode = {};
    var edges = [];
    // 건물을 돌아가는 거리. 실외 그래프가 없는 옛 번들이면 직선.
    // 보행자 길찾기 결과가 들어오면 그게 이긴다.
    var walks = this.outdoorWalk(lat, lng);

    (this.data.entrances || []).forEach(function (entrance, index) {
      var measured = overrides && overrides[entrance.node];
      var walk = measured || (walks && walks[index]);
      var meters = walk ? walk.meters
        : self.metersBetween(lat, lng, entrance.lat, entrance.lon);
      var path = walk ? walk.path : [[lat, lng], [entrance.lat, entrance.lon]];
      var seen = byNode[entrance.node];
      if (seen && seen.meters <= meters) return;
      byNode[entrance.node] = {
        entrance: entrance, meters: meters, path: path,
        measured: !!measured
      };
      edges.push([entrance.node, meters, 'walk']);
    });
    return {
      point: null, floor: null, where: 'outdoor', outdoor: true,
      from: [lat, lng], entranceByNode: byNode, edges: edges,
      detoured: !!walks
    };
  };

  /** 탐색이 실제로 들어간 문. 경로 사슬을 거슬러 올라간 뿌리가 그 문이다. */
  Engine.prototype.resolveEntrance = function (search, origin, from) {
    var at = search.goal;
    while (search.previous[at] !== -1) at = search.previous[at];
    var picked = origin.entranceByNode[at];
    // 있을 수 없는 경우지만, 조용히 틀린 문을 말하느니 가까운 문으로 되돌린다
    if (!picked) picked = this.nearestEntrance(from[0], from[1]);
    var doorNode = this.nodes[picked.entrance.node];
    return {
      entrance: picked.entrance, meters: picked.meters,
      path: picked.path, measured: !!picked.measured,
      from: from, point: [doorNode.x, doorNode.y]
    };
  };

  /**
   * 실외 구간을 실제로 재 보기 전에, 재 볼 만한 출입구를 추린다.
   *
   * 보행자 길찾기는 API 호출이라 11개를 다 재면 느리고 호출 한도에 걸린다.
   * 건물만 피한 어림 거리로 총 소요를 계산해 상위 몇 개만 고른다. 어림이
   * 크게 틀리지 않으니 상위권 안에 진짜 최적이 들어온다.
   */
  Engine.prototype.entranceCandidates = function (lat, lng, destination, options, limit) {
    var self = this;
    var entrances = this.data.entrances || [];
    if (!entrances.length) return [];
    var walks = this.outdoorWalk(lat, lng);

    var scored = entrances.map(function (entrance, index) {
      var walk = walks && walks[index];
      var meters = walk ? walk.meters
        : self.metersBetween(lat, lng, entrance.lat, entrance.lon);
      var seconds = Infinity;
      try {
        var one = self.route(
          { outdoor: true, lat: lat, lng: lng }, destination,
          Object.assign({}, options || {}, {
            approaches: buildOverride(entrance.node, meters, walk)
          }));
        seconds = one.duration_s;
      } catch (error) { /* 이 문으로는 길이 없다 */ }
      return { entrance: entrance, estimate_m: meters, estimate_s: seconds };
    }).filter(function (row) { return isFinite(row.estimate_s); });

    scored.sort(function (a, b) { return a.estimate_s - b.estimate_s; });
    return scored.slice(0, limit || 3);

    function buildOverride(node, meters, walk) {
      // 이 문 하나만 후보로 두려면 나머지를 아주 멀게 만든다
      var override = {};
      entrances.forEach(function (other) {
        override[other.node] = other.node === node
          ? { meters: meters, path: walk ? walk.path : null }
          : { meters: 1e7, path: null };
      });
      return override;
    }
  };

  Engine.prototype.corridorDoors = function (floor, roomId) {
    var self = this;
    var doors = this.data.doors_by_room[floor + '|' + roomId] || [];
    return doors.filter(function (index) {
      var connects = self.nodes[index].c || [];
      return connects.indexOf('복도') >= 0;
    });
  };

  /* ───────────────────────── 경로 ───────────────────────── */

  /**
   * @param start {floor, x, y}     도면 픽셀 좌표
   * @param destination {room_id, floor}
   * @param options {avoidStairs}
   */
  Engine.prototype.route = function (start, destination, options) {
    options = options || {};
    var warnings = [];

    // 실외 출발지: {outdoor:true, lat, lng} 로 들어온다.
    // 어느 문으로 들어갈지는 여기서 정하지 않는다. 탐색이 고른다.
    var outdoorFrom = null;
    if (start && start.outdoor) {
      if (!this.hasEntrances()) {
        throw new Error('건물 밖에서 들어오는 출입구가 아직 등록되지 않았습니다 ' +
                        '(문 박스의 connects 에 "외부" 를 넣어 주세요)');
      }
      outdoorFrom = [start.lat, start.lng];
    } else if (!this.data.floors[start.floor]) {
      throw new Error('모르는 층: ' + start.floor);
    }

    var goalFloor = destination.floor || this.floorOfRoom(destination.room_id);
    if (!goalFloor) throw new Error(destination.room_id + ' 방을 찾을 수 없다');
    if (!this.data.floors[goalFloor].rooms[destination.room_id]) {
      throw new Error(goalFloor + ' 에 ' + destination.room_id + ' 방이 없다');
    }

    var origin = outdoorFrom
      ? this.attachOutdoorStart(outdoorFrom[0], outdoorFrom[1], options.approaches)
      : this.attachStart(start.floor, start.x, start.y, warnings);
    var goal = this.goalTargets(goalFloor, destination.room_id, warnings);

    var search = this.dijkstra(origin.edges, goal.targets, !!options.avoidStairs);
    if (search.best === Infinity) {
      throw new Error(goalFloor + ' ' + destination.room_id + ' 까지 가는 길이 없다' +
        (options.avoidStairs ? ' (계단 회피 옵션 때문일 수 있다)' : ''));
    }

    var approach = null;
    if (outdoorFrom) {
      approach = this.resolveEntrance(search, origin, outdoorFrom);
      origin.floor = approach.entrance.floor;
      origin.point = approach.point;
      // 실외 구간 시간은 이미 search.best 안에 들어 있다. assemble 이 실내분만
      // 내놓도록 빼 주고, prependOutdoorLeg 가 다시 얹는다.
      origin.seedSeconds = approach.meters / this.cost.walk_speed_mps;
    }

    var built = this.assemble(search, origin, goal, goalFloor, destination.room_id, warnings);
    if (goal.kind === 'via') this.appendViaLeg(built, goal.via, goalFloor, destination.room_id);  /* [REPORT] */
    if (approach) this.prependOutdoorLeg(built, approach);
    return built;
  };

  Engine.prototype.floorOfRoom = function (roomId) {
    var found = this.data.rooms.filter(function (row) { return row.room_id === roomId; });
    return found.length === 1 ? found[0].floor : (found[0] ? found[0].floor : null);
  };

  Engine.prototype.attachStart = function (floor, x, y, warnings) {
    var spot = this.locate(floor, x, y);

    if (spot.where === 'room') {
      var exits = this.corridorDoors(floor, spot.room_id);
      if (!exits.length) {
        var entry = this.data.entries_by_room[floor + '|' + spot.room_id];
        if (entry !== undefined) {
          warnings.push(floor + ' ' + spot.room_id + ' 에 복도 문이 없어 추정 진입점에서 출발한다');
          exits = [entry];
        }
      }
      if (exits.length) {
        var self = this;
        return {
          point: [x, y], floor: floor, where: 'room', room_id: spot.room_id,
          edges: exits.map(function (index) {
            var node = self.nodes[index];
            return [index, self.toMeters(floor, distance(x, y, node.x, node.y)), 'walk'];
          })
        };
      }
    }

    var at = [x, y];
    if (spot.where === 'corridor') {
      at = [spot.x, spot.y];
    } else {
      /* warnings disabled */
      var pushed = this.pushInside(floor, x, y);
      if (!pushed) throw new Error('복도에 붙일 수 없는 출발점이다');
      at = pushed;
    }

    return {
      point: [x, y], snapped: at, floor: floor, where: spot.where, room_id: spot.room_id,
      edges: this.visibleEdges(floor, at[0], at[1])
    };
  };

  /** 임의의 복도 점에서 보이는 그래프 노드들. 브라우저가 하는 유일한 기하 계산. */
  Engine.prototype.visibleEdges = function (floor, x, y) {
    var rings = this.data.floors[floor].walkable;
    var candidates = this.walkNodes[floor] || [];
    var edges = [];
    var self = this;
    candidates.forEach(function (index) {
      var node = self.nodes[index];
      if (segmentInside(rings, x, y, node.x, node.y)) {
        edges.push([index, self.toMeters(floor, distance(x, y, node.x, node.y)), 'walk']);
      }
    });
    if (!edges.length && candidates.length) {
      // 가시선이 하나도 없으면 가장 가까운 노드에 붙인다 (경계 오차 방어)
      var best = candidates[0], bestDistance = Infinity;
      candidates.forEach(function (index) {
        var node = self.nodes[index];
        var d = distance(x, y, node.x, node.y);
        if (d < bestDistance) { bestDistance = d; best = index; }
      });
      edges.push([best, self.toMeters(floor, bestDistance), 'walk']);
    }
    return edges;
  };

  /* [REPORT] 8주차 — 통행 제약.
   * 도면에는 복도 문이 없고 옆방을 거쳐야만 들어가는 방이 있다 (현장 확인, 메모.txt).
   * 이런 방은 "거쳐 가는 방"의 복도 문을 목표로 삼고, 거기서 방 안을 지나 들어간다. */
  var ACCESS_VIA = { '2F|212-1': '212', '2F|212-2': '212', '2F|262': '263' };
  function accessViaEnabled() {
    return typeof window === 'undefined' || (window.GUMAP_WEEK || 99) >= 8;
  }

  Engine.prototype.accessVia = function (floor, roomId) {
    if (!accessViaEnabled()) return null;
    return ACCESS_VIA[floor + '|' + roomId] || null;
  };

  /** 거쳐 가는 방의 문 → 그 방 안 → 목적 방. 방 중심을 잇는 짧은 실내 구간을 붙인다. */
  Engine.prototype.appendViaLeg = function (built, via, floor, roomId) {
    var rows = this.data.rooms;
    function centroidOf(id) {
      var row = rows.filter(function (r) { return r.floor === floor && r.room_id === id; })[0];
      return row && row.centroid;
    }
    var viaCentre = centroidOf(via), roomCentre = centroidOf(roomId);
    if (!viaCentre || !roomCentre) return built;
    var points = [built.destination.point, viaCentre, roomCentre];
    var meters = this.toMeters(floor, polylineLength(points));
    var seconds = meters / this.cost.walk_speed_mps;
    var self = this;
    built.legs.push({
      floor: floor, mode: 'walk', points: points, via: via,
      latlngs: points.map(function (p) { return self.pxToLatLng(floor, p[0], p[1]); }),
      distance_m: meters, duration_s: seconds
    });
    built.distance_m += meters;
    built.walk_distance_m += meters;
    built.duration_s += seconds;
    built.steps.pop();
    built.steps.push(floor + ' ' + via + ' 출입문 도착');
    built.steps.push(via + ' 안을 지나 ' + roomId + '(으)로 진입 · 통행 제약');
    built.steps.push('도착 · ' + floor + ' ' + roomId);
    built.destination.kind = 'via';
    built.destination.via = via;
    built.destination.point = roomCentre;
    built.destination.latlng = this.pxToLatLng(floor, roomCentre[0], roomCentre[1]);
    return built;
  };

  Engine.prototype.goalTargets = function (floor, roomId, warnings) {
    var via = this.accessVia(floor, roomId);
    if (via) {
      var viaDoors = this.corridorDoors(floor, via);
      if (viaDoors.length) return { kind: 'via', via: via, targets: viaDoors };
    }
    var doors = this.corridorDoors(floor, roomId);
    if (doors.length) return { kind: 'door', targets: doors };
    var entry = this.data.entries_by_room[floor + '|' + roomId];
    if (entry === undefined) throw new Error(floor + ' ' + roomId + ' 은 진입점이 없다');
    warnings.push((this.data.doors_by_room[floor + '|' + roomId] || []).length
      ? floor + ' ' + roomId + ' 의 문은 복도와 닿지 않아 최근접 진입점을 썼다'
      : floor + ' ' + roomId + ' 에 문 박스가 없어 복도 최근접점을 진입점으로 잡았다');
    return { kind: 'estimated', targets: [entry] };
  };

  Engine.prototype.dijkstra = function (startEdges, targets, avoidStairs) {
    var count = this.nodes.length;
    var best = new Float64Array(count).fill(Infinity);
    var previous = new Int32Array(count).fill(-1);
    var previousMode = new Array(count);
    var previousMeters = new Float64Array(count);
    var heap = new Heap();

    var self = this;
    startEdges.forEach(function (edge) {
      var seconds = edge[1] / self.cost.walk_speed_mps;
      if (seconds < best[edge[0]]) {
        best[edge[0]] = seconds;
        previousMeters[edge[0]] = edge[1];
        previousMode[edge[0]] = 'walk';
        heap.push(seconds, edge[0]);
      }
    });

    var goalSet = {};
    targets.forEach(function (index) { goalSet[index] = true; });

    while (heap.size()) {
      var top = heap.pop();
      var cost = top[0], current = top[1];
      if (cost > best[current] + 1e-9) continue;
      if (goalSet[current]) break;
      var links = this.adjacency[current];
      for (var i = 0; i < links.length; i++) {
        var target = links[i][0], meters = links[i][1], mode = links[i][2];
        if (avoidStairs && mode === 'stair') continue;
        var next = cost + this.edgeSeconds(current, target, meters, mode);
        if (next < best[target] - 1e-9) {
          best[target] = next;
          previous[target] = current;
          previousMode[target] = mode;
          previousMeters[target] = meters;
          heap.push(next, target);
        }
      }
    }

    var chosen = -1, chosenCost = Infinity;
    targets.forEach(function (index) {
      if (best[index] < chosenCost) { chosenCost = best[index]; chosen = index; }
    });
    return {
      best: chosenCost, goal: chosen,
      previous: previous, previousMode: previousMode, previousMeters: previousMeters
    };
  };

  /* ───────────────────────── 결과 조립 ───────────────────────── */

  Engine.prototype.assemble = function (search, origin, goal, goalFloor, roomId, warnings) {
    var chain = [];
    for (var at = search.goal; at !== -1; at = search.previous[at]) chain.push(at);
    chain.reverse();

    var self = this;
    var legs = [];
    var walkTotal = 0, verticalTotal = 0;
    var startPoint = origin.snapped || origin.point;
    var previousPoint = startPoint;
    var previousFloor = origin.floor;
    var current = null;

    chain.forEach(function (index, position) {
      var node = self.nodes[index];
      var point = [node.x, node.y];
      // 출발점에서 첫 노드까지는 항상 걷는다
      var mode = position === 0 ? 'walk' : search.previousMode[index];
      // 실외 출발이면 첫 노드가 출입구 자신이다. 실외 구간은
      // prependOutdoorLeg 가 따로 붙이므로 여기서 세면 두 번 센다.
      var meters = position === 0
        ? (origin.outdoor ? 0 : self.startMeters(origin, index))
        : search.previousMeters[index];

      if (mode === 'walk') {
        if (!current || current.mode !== 'walk' || current.floor !== previousFloor) {
          current = { floor: previousFloor, mode: 'walk', points: [previousPoint],
                      distance_m: 0, duration_s: 0 };
          legs.push(current);
        }
        current.points.push(point);
        current.distance_m += meters;
        current.duration_s += meters / self.cost.walk_speed_mps;
        walkTotal += meters;
      } else {
        var gap = self.floorGap(previousFloor, node.f);
        var seconds = mode === 'stair'
          ? self.cost.stair_seconds_per_floor * gap
          : self.cost.elevator_wait_seconds + self.cost.elevator_seconds_per_floor * gap;
        var kind = mode === 'stair' ? 'stairs' : 'elevator';
        var name = self.nodes[chain[position - 1]].r;
        var last = legs[legs.length - 1];
        if (last && last.mode === kind && last.name === name && last.to_floor === previousFloor) {
          last.to_floor = node.f;
          last.distance_m += self.cost.floor_height_m * gap;
          last.duration_s += seconds;
          last.points[last.points.length - 1] = point;
        } else {
          legs.push({ floor: previousFloor, mode: kind, points: [previousPoint, point],
                      distance_m: self.cost.floor_height_m * gap, duration_s: seconds,
                      to_floor: node.f, name: name });
        }
        verticalTotal += self.cost.floor_height_m * gap;
        current = null;
      }
      previousPoint = point;
      previousFloor = node.f;
    });

    legs.forEach(function (leg) {
      if (leg.mode === 'walk') leg.points = dedupe(leg.points);
      leg.latlngs = leg.points.map(function (point) {
        return self.pxToLatLng(leg.floor, point[0], point[1]);
      });
    });

    var arrival = this.nodes[search.goal];
    var destination = {
      room_id: roomId, floor: goalFloor, kind: goal.kind,
      point: [arrival.x, arrival.y],
      latlng: this.pxToLatLng(goalFloor, arrival.x, arrival.y)
    };

    return {
      ok: true,
      distance_m: walkTotal + verticalTotal,
      walk_distance_m: walkTotal,
      vertical_m: verticalTotal,
      duration_s: search.best - (origin.seedSeconds || 0),
      legs: legs,
      steps: buildSteps(legs, destination, origin),
      destination: destination,
      origin: origin,
      warnings: warnings
    };
  };

  /** 건물 밖 출발지 → 출입구 구간을 결과 맨 앞에 붙인다. */
  Engine.prototype.prependOutdoorLeg = function (built, approach) {
    var entrance = approach.entrance;
    var doorNode = this.nodes[entrance.node];
    var doorLatLng = this.pxToLatLng(entrance.floor, doorNode.x, doorNode.y);
    var seconds = approach.meters / this.cost.walk_speed_mps;

    built.legs.unshift({
      floor: entrance.floor,
      mode: 'outdoor',
      points: [],                       // 실외 구간은 도면 픽셀이 없다
      latlngs: approach.path || [approach.from, doorLatLng],
      distance_m: approach.meters,
      duration_s: seconds,
      to_floor: null,
      name: entrance.name
    });

    built.distance_m += approach.meters;
    built.walk_distance_m += approach.meters;
    built.duration_s += seconds;
    built.outdoor_distance_m = approach.meters;
    // 지도의 보행자 길찾기로 실제로 잰 값인지, 건물만 피한 어림값인지.
    built.outdoor_measured = !!approach.measured;
    built.entrance = {
      name: entrance.name, floor: entrance.floor, latlng: doorLatLng
    };
    built.steps.unshift(
      '건물 밖에서 ' + approach.meters.toFixed(0) + 'm · ' +
      entrance.name + '(으)로 진입');
    built.origin = {
      floor: entrance.floor, where: 'outdoor',
      point: approach.from, name: '건물 밖'
    };
    return built;
  };

  Engine.prototype.startMeters = function (origin, index) {
    for (var i = 0; i < origin.edges.length; i++) {
      if (origin.edges[i][0] === index) return origin.edges[i][1];
    }
    var node = this.nodes[index];
    var from = origin.snapped || origin.point;
    return this.toMeters(origin.floor, distance(from[0], from[1], node.x, node.y));
  };

  /**
   * 겹치는 점만 뺀다. 각도로 중간점을 지우면 안 된다.
   *
   * 처음엔 "거의 일직선이면 중간점 제거" 를 했는데, 마지막으로 남긴 점 기준으로
   * 각도를 재다 보니 오차가 누적돼 긴 구간에서 선이 복도를 벗어나 옆방을 최대
   * 2m 까지 가로질렀다. 가시성 그래프의 경로는 이미 반사각 꼭짓점에서만
   * 꺾이므로 중간점이 전부 진짜 꺾임점이다. 지울 것이 없다.
   *
   * 안내문에서 완만한 굽이를 "직진" 으로 묶는 일은 buildSteps 가 각도 기준으로
   * 따로 한다. 그건 글자만 바꿀 뿐 선을 건드리지 않는다.
   */
  function dedupe(points) {
    if (points.length < 2) return points;
    var out = [points[0]];
    for (var i = 1; i < points.length; i++) {
      var last = out[out.length - 1];
      if (distance(last[0], last[1], points[i][0], points[i][1]) > 0.5) out.push(points[i]);
    }
    if (out.length === 1) out.push(points[points.length - 1]);
    return out;
  }

  function turnWord(previous, current, following) {
    var ax = current[0] - previous[0], ay = current[1] - previous[1];
    var bx = following[0] - current[0], by = following[1] - current[1];
    if (Math.hypot(ax, ay) < 1e-6 || Math.hypot(bx, by) < 1e-6) return null;
    var angle = Math.atan2(ax * by - ay * bx, ax * bx + ay * by) * 180 / Math.PI;
    var size = Math.abs(angle);
    if (size < TURN_DEGREES) return null;
    if (size >= UTURN_DEGREES) return '뒤로 방향 전환';
    // 도면 픽셀은 y 가 아래로 증가한다. 진행방향 기준 +y 쪽이 걷는 사람의 오른쪽.
    return (size >= 100 ? '크게 ' : '') + (angle > 0 ? '오른쪽' : '왼쪽') + '으로 방향 전환';
  }

  function polylineLength(points) {
    var total = 0;
    for (var i = 1; i < points.length; i++) {
      total += distance(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
    }
    return total;
  }

  function buildSteps(legs, destination, origin) {
    // 실외 출발은 prependOutdoorLeg 가 "건물 밖에서 …" 로 첫 줄을 붙인다
    var steps = origin.outdoor ? [] : ['출발 · ' + origin.floor + ' ' +
      (origin.where === 'corridor' ? '복도' : (origin.room_id || '지정 위치'))];
    legs.forEach(function (leg) {
      if (leg.mode === 'walk') {
        var points = leg.points;
        if (points.length < 2) return;
        var scale = leg.distance_m / Math.max(polylineLength(points), 1e-9);
        var run = 0;
        for (var i = 1; i < points.length; i++) {
          run += distance(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]) * scale;
          if (i === points.length - 1) break;
          var word = turnWord(points[i - 1], points[i], points[i + 1]);
          if (word) { steps.push(run.toFixed(0) + 'm 직진 후 ' + word); run = 0; }
        }
        if (run > 0.5) steps.push(run.toFixed(0) + 'm 직진');
      } else if (leg.mode === 'stairs') {
        steps.push(leg.name + ' 계단 이용 · ' + leg.floor + ' → ' + leg.to_floor);
      } else {
        steps.push(leg.name + ' 엘리베이터 이용 · ' + leg.floor + ' → ' + leg.to_floor);
      }
    });
    steps.push('도착 · ' + destination.floor + ' ' + destination.room_id + ' 문 앞');
    return steps;
  }

  /* ───────────────────────── 공개 ───────────────────────── */

  var TechnoRoute = {
    load: function (data) { return new Engine(data); },
    Engine: Engine,
    _geometry: { pointInRings: pointInRings, segmentInside: segmentInside }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TechnoRoute;
  global.TechnoRoute = TechnoRoute;
})(typeof window !== 'undefined' ? window : globalThis);
