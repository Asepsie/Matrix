import { strict as assert } from 'assert';
import { test } from 'node:test';
import { _allocNum, _allocCost, escH } from '../src/core/helpers.js';

test('_allocNum(0.5) === 0.5', () => {
  assert.equal(_allocNum(0.5), 0.5);
});
test('_allocNum("m") === 0', () => {
  assert.equal(_allocNum('m'), 0);
});
test('_allocNum("p") === 1.0', () => {
  assert.equal(_allocNum('p'), 1.0);
});
test('_allocNum("r") === 0', () => {
  assert.equal(_allocNum('r'), 0);
});

test('_allocCost(0.5, 8000) === 4000', () => {
  assert.equal(_allocCost(0.5, 8000), 4000);
});
test('_allocCost("m", 8000) === 0', () => {
  assert.equal(_allocCost('m', 8000), 0);
});
test('_allocCost("p", 8000) === 8000', () => {
  assert.equal(_allocCost('p', 8000), 8000);
});
test('_allocCost("r", 8000) === 0', () => {
  assert.equal(_allocCost('r', 8000), 0);
});

test('escH("<b>") === "&lt;b&gt;"', () => {
  assert.equal(escH('<b>'), '&lt;b&gt;');
});
