/** 한글 검색 보조: 초성 추출과 검색어 정규화. */

const CHOSUNG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ',
  'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const SYLLABLE_FIRST = 0xac00;
const SYLLABLE_LAST = 0xd7a3;
const PER_CHOSUNG = 21 * 28;

/** '테크노관' → 'ㅌㅋㄴㄱ'. 한글 음절이 아닌 글자는 그대로 둔다. */
export function chosung(text) {
  let out = '';
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    out += (code >= SYLLABLE_FIRST && code <= SYLLABLE_LAST)
      ? CHOSUNG[Math.floor((code - SYLLABLE_FIRST) / PER_CHOSUNG)]
      : ch;
  }
  return out;
}

/** 검색어 비교용: 소문자, 공백·구두점 제거. */
export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s\-·•.,()[\]{}'"’‘“”/]+/g, '');
}

/** 검색어가 초성만으로 되어 있는가 ('ㅌㅋ'). */
export function isChosungOnly(text) {
  return text.length > 0 && [...text].every((ch) => CHOSUNG.includes(ch));
}
