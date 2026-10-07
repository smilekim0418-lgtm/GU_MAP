/**
 * 캠퍼스 규모(1 km 안팎)의 평면 근사. 좌표는 [경도, 위도].
 * 이 범위에서 등장방형 근사의 오차는 수 cm 이다.
 */
const M_PER_LAT = 110574;
const M_PER_LON_EQ = 111320;

function scale(lat) {
  return M_PER_LON_EQ * Math.cos(lat * Math.PI / 180);
}

/** 두 점 사이 거리 (m) */
export function meters(a, b) {
  const lat = (a[1] + b[1]) / 2;
  const dx = (b[0] - a[0]) * scale(lat);
  const dy = (b[1] - a[1]) * M_PER_LAT;
  return Math.hypot(dx, dy);
}

/** a 에서 b 를 보는 방위각 (도, 북 0 · 동 90) */
export function bearing(a, b) {
  const lat = (a[1] + b[1]) / 2;
  const dx = (b[0] - a[0]) * scale(lat);
  const dy = (b[1] - a[1]) * M_PER_LAT;
  return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
}

/** 점 p 를 선분 ab 에 투영: {point, t (0~1), meters (p 와 투영점 거리)} */
export function projectToSegment(p, a, b) {
  const k = scale((a[1] + b[1]) / 2);
  const ax = a[0] * k, ay = a[1] * M_PER_LAT;
  const bx = b[0] * k, by = b[1] * M_PER_LAT;
  const px = p[0] * k, py = p[1] * M_PER_LAT;
  const dx = bx - ax, dy = by - ay;
  const length2 = dx * dx + dy * dy;
  let t = length2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / length2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  return {
    point: [qx / k, qy / M_PER_LAT],
    t,
    meters: Math.hypot(px - qx, py - qy),
  };
}

/** 좌표 목록을 감싸는 [[서, 남], [동, 북]] */
export function bounds(coords) {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const [x, y] of coords) {
    if (x < west) west = x;
    if (x > east) east = x;
    if (y < south) south = y;
    if (y > north) north = y;
  }
  return [[west, south], [east, north]];
}
