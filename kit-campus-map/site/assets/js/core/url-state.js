/**
 * 주소창 ↔ 화면 상태.
 *
 * 학과 홈페이지의 "오시는 길" 같은 곳에서 바로 걸 수 있게 짧게 둔다.
 *   ?b=2                 건물 2번 상세
 *   ?room=T312           테크노관 312호
 *   ?q=도서관            검색
 *   ?from=gate&to=b5     길찾기
 *   ?lang=en  ?embed=1   언어, iframe 삽입
 *
 * 들어오는 값은 사람이 손으로 고친 주소일 수 있으니 형식이 틀리면 조용히 버린다.
 */

const ORDER = ['b', 'room', 'floor', 'q', 'from', 'to', 'nostairs', 'lang', 'embed'];
const PATTERNS = {
  b: /^(\d{1,3}|[a-z][a-z0-9-]{0,15})$/,
  room: /^[A-Za-z0-9-]{1,10}$/,
  floor: /^B?\d{1,2}F$/,
  lang: /^(ko|en)$/,
};
const Q_MAX = 60;

export function endpointFromString(text) {
  if (!text) return null;
  if (text === 'gate') return { type: 'gate', id: 'main' };
  if (text === 'here') return { type: 'here' };
  if (/^\d{1,3}$/.test(text)) return { type: 'building', id: `b${Number(text)}` };
  const prefixed = /^(gate|room|bus|unit):([A-Za-z0-9-]{1,24})$/.exec(text);
  if (prefixed) return { type: prefixed[1], id: prefixed[2] };
  if (/^[a-z][a-z0-9]{0,15}$/.test(text)) return { type: 'building', id: text };
  return null;
}

export function endpointToString(endpoint) {
  if (!endpoint) return '';
  switch (endpoint.type) {
    case 'gate': return endpoint.id === 'main' ? 'gate' : `gate:${endpoint.id}`;
    case 'building': return endpoint.id;
    case 'point':
    case 'here': return 'here';
    default: return `${endpoint.type}:${endpoint.id}`;
  }
}

export function parse(search) {
  const params = new URLSearchParams(search || '');
  const state = { embed: false };
  for (const key of ['b', 'room', 'floor', 'lang']) {
    const value = params.get(key);
    if (value && PATTERNS[key].test(value)) state[key] = value;
  }
  const q = (params.get('q') || '').replace(/\s+/g, ' ').trim().slice(0, Q_MAX);
  if (q) state.q = q;
  for (const key of ['from', 'to']) {
    const value = params.get(key);
    if (value && endpointFromString(value)) state[key] = value;
  }
  if (params.get('nostairs') === '1') state.nostairs = true;
  const embed = params.get('embed');
  state.embed = embed === '1' || embed === 'true';
  return state;
}

export function serialize(state) {
  const params = new URLSearchParams();
  for (const key of ORDER) {
    const value = state[key];
    if (value === undefined || value === null || value === '' || value === false) continue;
    params.set(key, value === true ? '1' : String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}
