/**
 * B-171 — Reusable diagnostic-trace helper unit tests.
 *
 * Exercises `shared/diag.js` public API (recordTrace / readTraces /
 * clearTraces) against the in-memory `chrome.storage.local` mock.
 *
 * R1 LOCKED AC6 — six deterministic cases (T1–T6).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './_setup.js';
import { __resetMock, __getRawStore } from './chrome-mock.js';
import {
  recordTrace,
  readTraces,
  clearTraces,
  DIAG_KEY_PREFIX,
} from '../shared/diag.js';

test('B-171 T1: recordTrace initializes array on first call (key was absent)', async () => {
  __resetMock();
  await recordTrace('t1', { hello: 'world' });
  const stored = __getRawStore(DIAG_KEY_PREFIX + 't1');
  assert.ok(Array.isArray(stored), 'stored value is an array');
  assert.equal(stored.length, 1, 'one entry recorded');
  assert.equal(typeof stored[0].ts, 'number', 'entry has numeric ts');
  assert.deepEqual(stored[0].payload, { hello: 'world' }, 'payload preserved');
});

test('B-171 T2: recordTrace appends on subsequent calls (preserves prior entries)', async () => {
  __resetMock();
  await recordTrace('t2', { step: 1 });
  await recordTrace('t2', { step: 2 });
  await recordTrace('t2', { step: 3 });
  const stored = __getRawStore(DIAG_KEY_PREFIX + 't2');
  assert.equal(stored.length, 3, 'three entries appended in order');
  assert.equal(stored[0].payload.step, 1);
  assert.equal(stored[1].payload.step, 2);
  assert.equal(stored[2].payload.step, 3);
});

test('B-171 T3: readTraces() with no prefix returns all _diag_* entries', async () => {
  __resetMock();
  await recordTrace('alpha', { v: 1 });
  await recordTrace('beta', { v: 2 });
  await recordTrace('gamma', { v: 3 });
  const out = await readTraces();
  assert.deepEqual(
    Object.keys(out).sort(),
    ['alpha', 'beta', 'gamma'],
    'all three keys returned (prefix stripped)',
  );
  assert.equal(out.alpha[0].payload.v, 1);
  assert.equal(out.beta[0].payload.v, 2);
  assert.equal(out.gamma[0].payload.v, 3);
});

test('B-171 T4: readTraces("xyz") with prefix filters correctly', async () => {
  __resetMock();
  await recordTrace('xyzOne', { n: 1 });
  await recordTrace('xyzTwo', { n: 2 });
  await recordTrace('abcThree', { n: 3 });
  const out = await readTraces('xyz');
  assert.deepEqual(
    Object.keys(out).sort(),
    ['xyzOne', 'xyzTwo'],
    'only xyz* keys returned, abc* excluded',
  );
  assert.equal(out.abcThree, undefined, 'non-matching key not present');
});

test('B-171 T5: clearTraces("foo") removes only _diag_foo* keys; preserves _diag_bar* and non-_diag_* keys', async () => {
  __resetMock();
  await recordTrace('fooA', { x: 1 });
  await recordTrace('fooB', { x: 2 });
  await recordTrace('barA', { x: 3 });
  // Non-diag key written directly to the mock store via the public API surface.
  await chrome.storage.local.set({ 'some-other-key': { sentinel: true } });

  await clearTraces('foo');

  assert.equal(__getRawStore(DIAG_KEY_PREFIX + 'fooA'), undefined, 'fooA cleared');
  assert.equal(__getRawStore(DIAG_KEY_PREFIX + 'fooB'), undefined, 'fooB cleared');
  assert.ok(Array.isArray(__getRawStore(DIAG_KEY_PREFIX + 'barA')), 'barA preserved');
  assert.deepEqual(
    __getRawStore('some-other-key'),
    { sentinel: true },
    'non-_diag_ key preserved',
  );
});

test('B-171 T6: clearTraces() with no prefix removes all _diag_* keys (and only those)', async () => {
  __resetMock();
  await recordTrace('one', { v: 1 });
  await recordTrace('two', { v: 2 });
  await recordTrace('three', { v: 3 });
  await chrome.storage.local.set({ 'production-key': 'keep-me' });

  await clearTraces();

  assert.equal(__getRawStore(DIAG_KEY_PREFIX + 'one'), undefined);
  assert.equal(__getRawStore(DIAG_KEY_PREFIX + 'two'), undefined);
  assert.equal(__getRawStore(DIAG_KEY_PREFIX + 'three'), undefined);
  assert.equal(
    __getRawStore('production-key'),
    'keep-me',
    'non-_diag_ key untouched by namespace-scoped clear',
  );
  const remaining = await readTraces();
  assert.deepEqual(remaining, {}, 'no _diag_* keys remain');
});
