import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createI18n } from '../site/assets/js/core/i18n.js';
import { floorLabel, formatDistance, formatMinutes } from '../site/assets/js/core/format.js';

const read = (lang) => JSON.parse(readFileSync(new URL(`../site/i18n/${lang}.json`, import.meta.url)));
const ko = read('ko');
const en = read('en');

test('ko 와 en 의 키 집합이 같다', () => {
  assert.deepEqual(Object.keys(ko).sort(), Object.keys(en).sort());
});

test('같은 키는 같은 치환 변수를 쓴다', () => {
  const vars = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of Object.keys(ko)) {
    assert.deepEqual(vars(ko[key]), vars(en[key]), key);
  }
});

test('이모지가 없다', () => {
  // ©·® 는 유니코드상 그림문자로 분류되지만 저작권 표기에 필요하다
  const emoji = /(?![©®])\p{Extended_Pictographic}/u;
  for (const [key, text] of Object.entries({ ...ko, ...en })) {
    assert.ok(!emoji.test(text), key);
  }
});

test('치환과 언어 전환', () => {
  const i = createI18n({ ko: { min: '{n}분' }, en: { min: '{n} min' } }, 'ko');
  assert.equal(i.t('min', { n: 3 }), '3분');
  i.setLang('en');
  assert.equal(i.lang, 'en');
  assert.equal(i.t('min', { n: 3 }), '3 min');
  assert.equal(i.t('missing'), 'missing');
});

test('모르는 언어는 한국어', () => {
  const i = createI18n({ ko: { a: '가' }, en: { a: 'A' } }, 'fr');
  assert.equal(i.lang, 'ko');
});

test('name 은 현재 언어, 없으면 한국어', () => {
  const i = createI18n({ ko: {}, en: {} }, 'en');
  assert.equal(i.name({ ko: '도서관', en: 'Library' }), 'Library');
  assert.equal(i.name({ ko: '청운대' }), '청운대');
  assert.equal(i.name(null), '');
});

test('층 표기', () => {
  assert.equal(floorLabel('B1F', 'ko'), '지하 1층');
  assert.equal(floorLabel('3F', 'ko'), '3층');
  assert.equal(floorLabel('B1F', 'en'), 'B1');
  assert.equal(floorLabel('3F', 'en'), '3F');
});

test('거리·시간 표기', () => {
  assert.equal(formatDistance(42.4, 'ko'), '42m');
  assert.equal(formatDistance(1234, 'ko'), '1.2km');
  assert.equal(formatDistance(1234, 'en'), '1.2 km');
  assert.equal(formatMinutes(30, 'ko'), '1분');
  assert.equal(formatMinutes(400, 'en'), '7 min');
});
