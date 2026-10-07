import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, serialize, endpointFromString, endpointToString } from '../site/assets/js/core/url-state.js';

test('왕복', () => {
  const s = { b: '2', lang: 'en', embed: true };
  assert.deepEqual(parse(serialize(s)), s);
  const r = { room: 'T312', floor: '3F', from: 'gate', to: 'room:T312', nostairs: true, embed: false };
  assert.deepEqual(parse(serialize(r)), r);
});

test('키 순서가 고정이다', () => {
  assert.equal(serialize({ lang: 'en', b: 'b5' }), '?b=b5&lang=en');
  assert.equal(serialize({ embed: false }), '');
});

test('잘못된 값은 버린다', () => {
  assert.deepEqual(parse('?b=<script>&room=../../x&lang=fr&floor=99X&from=???'), { embed: false });
});

test('검색어는 길이를 자르고 공백을 정리한다', () => {
  assert.equal(parse('?q=' + encodeURIComponent('  도서관  ')).q, '도서관');
  assert.equal(parse('?q=' + 'a'.repeat(200)).q.length, 60);
});

test('끝점 문자열', () => {
  assert.deepEqual(endpointFromString('room:T312'), { type: 'room', id: 'T312' });
  assert.deepEqual(endpointFromString('b5'), { type: 'building', id: 'b5' });
  assert.deepEqual(endpointFromString('5'), { type: 'building', id: 'b5' });
  assert.deepEqual(endpointFromString('edison'), { type: 'building', id: 'edison' });
  assert.deepEqual(endpointFromString('gate'), { type: 'gate', id: 'main' });
  assert.deepEqual(endpointFromString('bus:bus4853580228'), { type: 'bus', id: 'bus4853580228' });
  assert.deepEqual(endpointFromString('unit:b3-u2'), { type: 'unit', id: 'b3-u2' });
  assert.deepEqual(endpointFromString('here'), { type: 'here' });
  assert.equal(endpointFromString('???'), null);
  assert.equal(endpointFromString(''), null);
  assert.equal(endpointToString({ type: 'building', id: 'b5' }), 'b5');
  assert.equal(endpointToString({ type: 'gate', id: 'main' }), 'gate');
  assert.equal(endpointToString({ type: 'room', id: 'T312' }), 'room:T312');
  assert.equal(endpointToString({ type: 'point', point: [1, 2] }), 'here');
});
