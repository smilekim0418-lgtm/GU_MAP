/** 층·거리·시간 표기. 화면과 안내문이 같은 규칙을 쓴다. */

/** 'B1F' → '지하 1층' / 'B1',  '3F' → '3층' / '3F' */
export function floorLabel(floor, lang) {
  if (!floor) return '';
  const basement = /^B(\d+)F?$/.exec(floor);
  if (basement) return lang === 'en' ? `B${basement[1]}` : `지하 ${basement[1]}층`;
  const above = /^(\d+)F$/.exec(floor);
  if (above) return lang === 'en' ? `${above[1]}F` : `${above[1]}층`;
  return floor;
}

export function formatDistance(meters, lang) {
  const space = lang === 'en' ? ' ' : '';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}${space}km`;
  return `${Math.max(1, Math.round(meters))}${space}m`;
}

export function formatMinutes(seconds, lang) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return lang === 'en' ? `${minutes} min` : `${minutes}분`;
}

/** '054-478-7358~7360' → 'tel:' 링크에 넣을 첫 번호 '054-478-7358' */
export function telHref(number) {
  const first = String(number).split(/[~,/]/)[0].trim();
  return 'tel:' + first.replace(/[^\d-]/g, '');
}
