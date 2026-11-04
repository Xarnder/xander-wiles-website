const { test } = require('node:test');
const assert = require('node:assert/strict');
const merge = require('./index.cjs');

const attack = JSON.parse('{"__proto__":{"isAdmin":true},"constructor":{"prototype":{"isAdmin":true}},"prototype":{"isAdmin":true},"safe":1}');

function assertSafe(value) {
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(value.isAdmin, undefined);
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    assert.equal(Object.hasOwn(value, key), false);
  }
  assert.equal({}.isAdmin, undefined);
}

test('rejects source prototype keys with ordinary, null-prototype and primitive targets', () => {
  for (const target of [{}, Object.create(null), null, undefined, 0, '']) {
    const result = merge(target, attack);
    assertSafe(result);
    assert.equal(result.safe, 1);
  }
});

test('rejects prototype keys copied from the target too', () => {
  const result = merge(attack, { other: 2 });
  assertSafe(result);
  assert.equal(result.other, 2);
});

test('protects nested null placeholders and arrays', () => {
  const result = merge({ session: null }, { session: attack, items: [attack] });
  assertSafe(result.session);
  assertSafe(result.items[0]);
});

test('preserves nested configuration, arrays, symbols and input immutability', () => {
  const symbol = Symbol('config');
  const target = { build: { enabled: true }, plugins: ['a'], [symbol]: { a: 1 } };
  const source = { build: { mode: 'local' }, plugins: ['b'], [symbol]: { b: 2 } };
  assert.deepEqual(merge(target, source), {
    build: { enabled: true, mode: 'local' }, plugins: ['a', 'b'], [symbol]: { a: 1, b: 2 }
  });
  assert.deepEqual(target.plugins, ['a']);
  assert.deepEqual(source.plugins, ['b']);
});

test('preserves custom merge options and merge.all used by build tools', () => {
  assert.deepEqual(merge({ plugins: ['a'] }, { plugins: ['b'] }, {
    arrayMerge: (_target, source) => source
  }), { plugins: ['b'] });
  assert.deepEqual(merge.all([{ a: 1 }, { b: 2 }]), { a: 1, b: 2 });
  assert.deepEqual(merge({ a: 1 }, { a: 2 }, {
    customMerge: (key) => key === 'a' ? (a, b) => a + b : undefined,
    isMergeableObject: () => true
  }), { a: 3 });
});
