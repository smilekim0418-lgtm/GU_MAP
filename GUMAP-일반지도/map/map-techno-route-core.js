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
    var floor = start.floor;
    var info = this.data.floors[floor];
    if (!info) throw new Error('모르는 층: ' + floor);

    var goalFloor = destination.floor || this.floorOfRoom(destination.room_id);
    if (!goalFloor) throw new Error(destination.room_id + ' 방을 찾을 수 없다');
    if (!this.data.floors[goalFloor].rooms[destination.room_id]) {
      throw new Error(goalFloor + ' 에 ' + destination.room_id + ' 방이 없다');
    }

    var origin = this.attachStart(floor, start.x, start.y, warnings);
    var goal = this.goalTargets(goalFloor, destination.room_id, warnings);

    var search = this.dijkstra(origin.edges, goal.targets, !!options.avoidStairs);
    if (search.best === Infinity) {
      throw new Error(goalFloor + ' ' + destination.room_id + ' 까지 가는 길이 없다' +
        (options.avoidStairs ? ' (계단 회피 옵션 때문일 수 있다)' : ''));
    }

    return this.assemble(search, origin, goal, goalFloor, destination.room_id, warnings);
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

  Engine.prototype.goalTargets = function (floor, roomId, warnings) {
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
      var meters = position === 0
        ? self.startMeters(origin, index)
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
      duration_s: search.best,
      legs: legs,
      steps: buildSteps(legs, destination, origin),
      destination: destination,
      origin: origin,
      warnings: warnings
    };
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
    var steps = ['출발 · ' + origin.floor + ' ' +
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
