import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, search } from '../site/assets/js/core/search.js';
import { chosung, normalize } from '../site/assets/js/core/hangul.js';

const places = {
  buildings: [
    { id: 'b2', no: 2, name: { ko: '테크노관', en: 'Techno Building' } },
    { id: 'b5', no: 5, name: { ko: '도서관', en: 'Library Building' } },
    { id: 'b7', no: 7, name: { ko: '생활관', en: 'Dormitory' }, aliases: ['기숙사'],
      parts: [{ name: { ko: '푸름관 1동', en: 'Pureum Hall 1' } }] },
  ],
  units: [
    { id: 'u1', kind: 'facility', type: 'print', building: 'b5', name: { ko: '도서관 복사실', en: 'Copy Center' } },
    { id: 'u2', kind: 'dept', building: 'b2', name: { ko: '기계공학전공', en: 'Mechanical Engineering' } },
  ],
  rooms: [
    { id: 'T312', building: 'b2', label: '312', name: { ko: '컴퓨터실습실' } },
    { id: 'T212', building: 'b2', label: '212', name: { ko: '세미나실' } },
  ],
  bus_stops: [{ id: 'bus1', name: { ko: '금오공과대학교종점', en: 'KIT Terminus' } }],
  gates: [{ id: 'main', name: { ko: '정문', en: 'Main Gate' } }],
};

test('초성과 정규화', () => {
  assert.equal(chosung('테크노관'), 'ㅌㅋㄴㄱ');
  assert.equal(chosung('A동'), 'Aㄷ');
  assert.equal(normalize(' Techno-Building · 1 '), 'technobuilding1');
});

test('정확일치가 부분일치보다 위', () => {
  const r = search(buildIndex(places), '도서관');
  assert.equal(r[0].id, 'b5');
  assert.equal(r[1].id, 'u1');
});

test('번호·영문·초성·방번호', () => {
  const idx = buildIndex(places);
  assert.equal(search(idx, '2')[0].id, 'b2');
  assert.equal(search(idx, 'libr')[0].id, 'b5');
  assert.equal(search(idx, 'ㅌㅋ')[0].id, 'b2');
  assert.equal(search(idx, '312')[0].id, 'T312');
  assert.equal(search(idx, '312')[0].type, 'room');
});

test('별칭과 동 이름으로 건물을 찾는다', () => {
  const idx = buildIndex(places);
  assert.equal(search(idx, '기숙사')[0].id, 'b7');
  assert.equal(search(idx, '푸름관')[0].id, 'b7');
});

test('시설 종류 낱말로 찾는다', () => {
  const idx = buildIndex(places, { typeTerms: { print: ['복사·인쇄', 'Printing'] } });
  assert.equal(search(idx, '인쇄')[0].id, 'u1');
  assert.equal(search(idx, 'printing')[0].id, 'u1');
});

test('정류장과 정문', () => {
  const idx = buildIndex(places);
  assert.equal(search(idx, '종점')[0].type, 'bus');
  assert.equal(search(idx, 'main gate')[0].type, 'gate');
});

test('결과에 kind 가 붙는다', () => {
  const r = search(buildIndex(places), '기계');
  assert.equal(r[0].type, 'unit');
  assert.equal(r[0].kind, 'dept');
});

test('빈 검색어는 빈 결과', () => {
  assert.deepEqual(search(buildIndex(places), '  '), []);
});

test('실제 데이터: 학과 이름으로 건물을 찾는다', () => {
  const real = JSON.parse(readFileSync(new URL('../site/data/places.json', import.meta.url)));
  const idx = buildIndex(real);
  const r = search(idx, '컴퓨터공학');
  assert.equal(r[0].type, 'unit');
  assert.equal(r[0].building, 'b3');
  assert.equal(search(idx, '1')[0].id, 'b1');
  assert.equal(search(idx, '25')[0].id, 'b25');
});
