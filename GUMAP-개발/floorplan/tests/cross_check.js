/**
 * 브라우저 엔진(techno-route-core.js)이 파이썬(fp/route.py)과 같은 답을 내는지 본다.
 *
 * 파이썬이 tests/cross_check_cases.json 에 질의와 자기 답을 써 두면,
 * 이 스크립트가 같은 질의를 JS 로 풀어 비교한다. 두 구현이 갈라지는 순간
 * "에디터에서 본 경로"와 "본서버 경로"가 달라지므로 반드시 잡아야 한다.
 *
 *   node tests/cross_check.js
 */
const fs = require('fs');
const path = require('path');

const here = __dirname;
const TechnoRoute = require(path.join(here, '..', 'techno-route-core.js'));
const data = JSON.parse(fs.readFileSync(path.join(here, '..', 'work', 'techno_nav.json'), 'utf8'));
const cases = JSON.parse(fs.readFileSync(path.join(here, 'cross_check_cases.json'), 'utf8'));

const engine = TechnoRoute.load(data);

let failures = 0;
let checked = 0;
const distanceGaps = [];
const durationGaps = [];

for (const item of cases) {
  let result;
  try {
    result = engine.route(item.start, item.destination, { avoidStairs: item.avoid_stairs });
  } catch (error) {
    console.log(`  [실패] ${item.label}: ${error.message}`);
    failures++;
    continue;
  }
  checked++;

  const problems = [];
  if (result.destination.kind !== item.expected.kind) {
    problems.push(`도착 종류 ${result.destination.kind} ≠ ${item.expected.kind}`);
  }
  const pointGap = Math.hypot(
    result.destination.point[0] - item.expected.point[0],
    result.destination.point[1] - item.expected.point[1]
  );
  if (pointGap > 1.0) {
    problems.push(`도착 좌표 ${pointGap.toFixed(1)}px 차이 ` +
      `(JS ${result.destination.point} vs PY ${item.expected.point})`);
  }

  // 출발점 붙이기는 양쪽이 독립적으로 가시선을 푼다. 경계 판정이 조금 달라도
  // 되지만, 총 거리·시간이 크게 벌어지면 알고리즘이 갈라진 것이다.
  const distanceGap = Math.abs(result.distance_m - item.expected.distance_m);
  const durationGap = Math.abs(result.duration_s - item.expected.duration_s);
  distanceGaps.push(distanceGap);
  durationGaps.push(durationGap);
  if (distanceGap > Math.max(0.5, item.expected.distance_m * 0.02)) {
    problems.push(`거리 ${result.distance_m.toFixed(1)}m ≠ ${item.expected.distance_m}m`);
  }
  if (durationGap > Math.max(1.0, item.expected.duration_s * 0.02)) {
    problems.push(`시간 ${result.duration_s.toFixed(1)}s ≠ ${item.expected.duration_s}s`);
  }

  const jsModes = result.legs.filter(l => l.mode !== 'walk').map(l => `${l.mode}:${l.name}`);
  if (jsModes.join(',') !== item.expected.vertical.join(',')) {
    problems.push(`층간수단 [${jsModes}] ≠ [${item.expected.vertical}]`);
  }

  for (const leg of result.legs) {
    for (const latlng of leg.latlngs) {
      if (!latlng || !isFinite(latlng[0]) || !isFinite(latlng[1])) {
        problems.push('위경도 변환이 깨졌다');
        break;
      }
      if (latlng[0] < 36.140 || latlng[0] > 36.155 || latlng[1] < 128.385 || latlng[1] > 128.400) {
        problems.push(`위경도가 캠퍼스 밖이다 ${latlng}`);
        break;
      }
    }
  }

  if (problems.length) {
    failures++;
    console.log(`  [불일치] ${item.label}`);
    problems.forEach(p => console.log(`      ${p}`));
  }
}

const average = arr => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
console.log(`검사 ${checked}/${cases.length}건 · 불일치 ${failures}건`);
console.log(`평균 거리차 ${average(distanceGaps).toFixed(3)}m · ` +
  `최대 ${Math.max(...distanceGaps, 0).toFixed(3)}m`);
console.log(`평균 시간차 ${average(durationGaps).toFixed(3)}s · ` +
  `최대 ${Math.max(...durationGaps, 0).toFixed(3)}s`);

process.exit(failures ? 1 : 0);
