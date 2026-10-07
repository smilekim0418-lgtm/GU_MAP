/**
 * 통합 검색: 건물 · 학과/부서/시설 · 테크노관 호실 · 정류장 · 정문.
 *
 * 점수: 정확일치 100 > 앞부분 일치 70 > 부분 일치 40 > 초성 앞부분 30 > 초성 부분 20.
 * 같은 점수면 종류 순서(건물 → 학과·시설 → 호실 → 정류장), 그다음 짧은 이름이 위.
 */
import { chosung, isChosungOnly, normalize } from './hangul.js';

const TYPE_ORDER = { building: 0, gate: 1, unit: 2, room: 3, bus: 4 };

function entry(type, item, names, extra = {}) {
  const terms = [];
  for (const value of names) {
    if (value === null || value === undefined || value === '') continue;
    const term = normalize(value);
    if (term) terms.push(term);
  }
  return {
    type, id: item.id, building: item.building || (type === 'building' ? item.id : null),
    kind: item.kind || null,
    terms,
    chosung: terms.map((term) => chosung(term)),
    length: terms[0] ? terms[0].length : 99,
    ...extra,
  };
}

/**
 * @param places places.json 내용
 * @param options.typeTerms {food: ['식당', 'Dining'], ...} 시설 종류 낱말
 */
export function buildIndex(places, options = {}) {
  const typeTerms = options.typeTerms || {};
  const entries = [];
  for (const b of places.buildings || []) {
    const names = [b.name.ko, b.name.en, ...(b.aliases || [])];
    for (const part of b.parts || []) names.push(part.name.ko, part.name.en);
    if (b.no) names.push(String(b.no));
    entries.push(entry('building', b, names));
  }
  for (const gate of places.gates || []) {
    entries.push(entry('gate', gate, [gate.name.ko, gate.name.en]));
  }
  for (const u of places.units || []) {
    entries.push(entry('unit', u, [u.name.ko, u.name.en, ...(typeTerms[u.type] || [])]));
  }
  for (const r of places.rooms || []) {
    entries.push(entry('room', r, [r.label, r.id, r.name.ko, r.name.en,
      r.dept && r.dept.ko, r.dept && r.dept.en]));
  }
  for (const s of places.bus_stops || []) {
    entries.push(entry('bus', s, [s.name.ko, s.name.en, s.ref]));
  }
  return { entries };
}

function scoreEntry(e, query, chosungQuery) {
  let best = 0;
  for (let i = 0; i < e.terms.length; i++) {
    const term = e.terms[i];
    if (term === query) return 100;
    if (term.startsWith(query)) best = Math.max(best, 70);
    else if (term.includes(query)) best = Math.max(best, 40);
    if (chosungQuery) {
      const initials = e.chosung[i];
      if (initials.startsWith(query)) best = Math.max(best, 30);
      else if (initials.includes(query)) best = Math.max(best, 20);
    }
  }
  return best;
}

export function search(index, rawQuery, options = {}) {
  const query = normalize(rawQuery);
  if (!query) return [];
  const limit = options.limit || 40;
  const chosungQuery = isChosungOnly(query);
  const hits = [];
  for (const e of index.entries) {
    // 한두 자리 숫자는 건물 번호다. 호실 번호 '212' 가 '2' 로 줄줄이 걸리지 않게 막는다.
    if (/^\d{1,2}$/.test(query) && e.type !== 'building' && e.type !== 'room') continue;
    const score = scoreEntry(e, query, chosungQuery);
    if (score > 0) {
      hits.push({ type: e.type, id: e.id, building: e.building, kind: e.kind, score, length: e.length });
    }
  }
  hits.sort((a, b) => b.score - a.score
    || TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
    || a.length - b.length);
  return hits.slice(0, limit).map(({ length, ...rest }) => rest);
}
