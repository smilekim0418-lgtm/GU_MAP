/**
 * 경로 좌표열 → 걷기 안내 토큰. 문장은 화면이 i18n 으로 만든다.
 *
 *   [{kind: 'walk', meters: 54, turn: 'right'}, {kind: 'walk', meters: 40, turn: null}]
 *
 * 방향 판단은 짧은 마디(MIN_SEGMENT m 미만)를 건너뛴다. OSM 보행로는 모퉁이를
 * 잘게 깎아 그려서, 마디마다 각도를 재면 2~3 m 짜리 "왼쪽·오른쪽" 이 줄줄이 생긴다.
 */
import { bearing, meters } from './geo.js';

const MIN_SEGMENT = 6;
const TURN = 30;
const SHARP = 60;
const UTURN = 150;

export function turnOf(delta) {
  const size = Math.abs(delta);
  if (size < TURN) return null;
  if (size >= UTURN) return 'uturn';
  const side = delta > 0 ? 'right' : 'left';
  return size < SHARP ? `slight-${side}` : side;
}

function angleBetween(from, to) {
  let delta = to - from;
  while (delta > 180) delta -= 360;
  while (delta <= -180) delta += 360;
  return delta;
}

export function walkSteps(coords) {
  const steps = [];
  let run = 0;
  let heading = null;
  for (let i = 1; i < coords.length; i++) {
    const length = meters(coords[i - 1], coords[i]);
    if (length < 0.01) continue;
    if (length < MIN_SEGMENT || heading === null) {
      run += length;
      if (length >= MIN_SEGMENT) heading = bearing(coords[i - 1], coords[i]);
      continue;
    }
    const next = bearing(coords[i - 1], coords[i]);
    const turn = turnOf(angleBetween(heading, next));
    if (turn) {
      steps.push({ kind: 'walk', meters: run, turn });
      run = 0;
    }
    run += length;
    heading = next;
  }
  if (run >= 1 || !steps.length) steps.push({ kind: 'walk', meters: run, turn: null });
  else steps[steps.length - 1].turn = null;
  return steps;
}
