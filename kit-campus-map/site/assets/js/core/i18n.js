/**
 * 화면 문구 사전.
 *
 * 문구는 site/i18n/{ko,en}.json 에 있고, 데이터의 이름은 {ko, en} 쌍으로 들어온다.
 * 영어 이름이 비어 있으면 한국어를 그대로 보여 준다 (없는 말을 지어내지 않는다).
 */

export const LANGS = ['ko', 'en'];

export function createI18n(messages, lang) {
  const state = { lang: LANGS.includes(lang) ? lang : 'ko' };

  return {
    get lang() { return state.lang; },

    setLang(next) {
      state.lang = LANGS.includes(next) ? next : 'ko';
    },

    /** t('route.result', {min: 3}) — 없는 키는 키 이름을 돌려줘 화면에서 바로 눈에 띈다. */
    t(key, vars) {
      const table = messages[state.lang] || {};
      let text = table[key];
      if (text === undefined) text = (messages.ko || {})[key];
      if (text === undefined) return key;
      if (!vars) return text;
      return text.replace(/\{(\w+)\}/g, (whole, name) =>
        (vars[name] === undefined || vars[name] === null) ? whole : String(vars[name]));
    },

    name(value) {
      if (!value) return '';
      return value[state.lang] || value.ko || '';
    },
  };
}
