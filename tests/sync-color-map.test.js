import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tjColorToChromeColor, CHROME_TAB_GROUP_COLORS } from '../background/sync/color-map.js';

test('exact-match TJ colors map to same Chrome colors', () => {
  assert.equal(tjColorToChromeColor('blue'), 'blue');
  assert.equal(tjColorToChromeColor('purple'), 'purple');
  assert.equal(tjColorToChromeColor('red'), 'red');
  assert.equal(tjColorToChromeColor('orange'), 'orange');
  assert.equal(tjColorToChromeColor('pink'), 'pink');
  assert.equal(tjColorToChromeColor('yellow'), 'yellow');
});

test('teal maps to cyan', () => {
  assert.equal(tjColorToChromeColor('teal'), 'cyan');
});

test('indigo maps to blue', () => {
  assert.equal(tjColorToChromeColor('indigo'), 'blue');
});

test('slate maps to grey', () => {
  assert.equal(tjColorToChromeColor('slate'), 'grey');
});

test('unknown color falls back to grey (defensive)', () => {
  assert.equal(tjColorToChromeColor('chartreuse'), 'grey');
  assert.equal(tjColorToChromeColor(''), 'grey');
  assert.equal(tjColorToChromeColor(null), 'grey');
  assert.equal(tjColorToChromeColor(undefined), 'grey');
});

test('CHROME_TAB_GROUP_COLORS exports the canonical set', () => {
  assert.deepEqual(
    [...CHROME_TAB_GROUP_COLORS].sort(),
    ['blue', 'cyan', 'green', 'grey', 'orange', 'pink', 'purple', 'red', 'yellow'].sort(),
  );
});
