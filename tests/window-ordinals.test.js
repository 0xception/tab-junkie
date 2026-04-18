/**
 * B-014 — window-ordinals.js unit tests.
 *
 * Covers:
 *  - Cold-start enumeration with 1, 2, 3 windows (ascending-raw-id ordering)
 *  - `registerWindow(id)` assigns next ordinal (maxOrdinal + 1)
 *  - `unregisterWindow(id)` removes entry, preserves gap
 *  - `getWindowMap()` returns a defensive copy
 *  - SW restart scenario: cold-start after "all unregistered" assigns W1
 *  - Idempotent `registerWindow` for ids already in the map
 *  - Defensive input: WINDOW_ID_NONE / negative / non-finite ids are ignored
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockWindows } from './chrome-mock.js';
import {
  initWindowOrdinals,
  registerWindow,
  unregisterWindow,
  getWindowOrdinal,
  getWindowMap,
  getWindowOrdinalsSize,
  __resetWindowOrdinals,
} from '../background/tabs/window-ordinals.js';

beforeEach(() => {
  __resetMock();
  __resetWindowOrdinals();
});

test('B-014 AC2: cold-start enumeration with one window → W1', async () => {
  __setMockWindows([{ id: 12345 }]);
  await initWindowOrdinals();

  assert.equal(getWindowOrdinalsSize(), 1);
  assert.equal(getWindowOrdinal(12345), 1);
  assert.deepStrictEqual(getWindowMap(), { '12345': 1 });
});

test('B-014 AC2: cold-start with two windows → ascending raw id becomes W1, W2', async () => {
  __setMockWindows([{ id: 888 }, { id: 777 }]);
  await initWindowOrdinals();

  // Lower raw id → W1, higher raw id → W2, regardless of getAll() return order.
  assert.equal(getWindowOrdinal(777), 1);
  assert.equal(getWindowOrdinal(888), 2);
  assert.deepStrictEqual(getWindowMap(), { '777': 1, '888': 2 });
});

test('B-014 AC2: cold-start with three windows assigns W1,W2,W3 by ascending id', async () => {
  __setMockWindows([{ id: 300 }, { id: 100 }, { id: 200 }]);
  await initWindowOrdinals();
  assert.equal(getWindowOrdinal(100), 1);
  assert.equal(getWindowOrdinal(200), 2);
  assert.equal(getWindowOrdinal(300), 3);
});

test('B-014 AC1: registerWindow assigns max+1 ordinal for new ids', async () => {
  __setMockWindows([{ id: 50 }, { id: 60 }]);
  await initWindowOrdinals();
  assert.equal(getWindowOrdinal(50), 1);
  assert.equal(getWindowOrdinal(60), 2);

  const ord = registerWindow(70);
  assert.equal(ord, 3, 'new window → next ordinal (max + 1)');
  assert.equal(getWindowOrdinal(70), 3);
});

test('B-014 AC1: registerWindow is idempotent — same id returns existing ordinal, no duplicate', async () => {
  registerWindow(100);
  registerWindow(200);
  assert.equal(getWindowOrdinal(100), 1);
  assert.equal(getWindowOrdinal(200), 2);

  const replay = registerWindow(100);
  assert.equal(replay, 1, 'replay returns the same ordinal');
  assert.equal(getWindowOrdinalsSize(), 2, 'map size unchanged');

  // A third, brand-new id still gets the next ordinal (max + 1 = 3).
  const fresh = registerWindow(300);
  assert.equal(fresh, 3);
});

test('B-014 AC3: unregisterWindow removes the entry and preserves the gap', () => {
  registerWindow(10);
  registerWindow(20);
  registerWindow(30);
  assert.deepStrictEqual(getWindowMap(), { '10': 1, '20': 2, '30': 3 });

  // Close W2 — surviving map keeps W1 and W3.
  const removed = unregisterWindow(20);
  assert.equal(removed, true);
  assert.deepStrictEqual(getWindowMap(), { '10': 1, '30': 3 });

  // A new window gets W4, NOT the reclaimed W2 slot.
  const nextOrd = registerWindow(40);
  assert.equal(nextOrd, 4);
  assert.deepStrictEqual(getWindowMap(), { '10': 1, '30': 3, '40': 4 });
});

test('B-014: unregisterWindow returns false when id was never tracked', () => {
  registerWindow(99);
  assert.equal(unregisterWindow(1000), false);
  assert.equal(unregisterWindow(99), true);
});

test('B-014: getWindowMap returns a defensive copy', () => {
  registerWindow(1);
  registerWindow(2);

  const copy = getWindowMap();
  copy['1'] = 999;
  delete copy['2'];

  // Internal state is unaffected.
  assert.equal(getWindowOrdinal(1), 1);
  assert.equal(getWindowOrdinal(2), 2);
  assert.deepStrictEqual(getWindowMap(), { '1': 1, '2': 2 });
});

test('B-014 §28.2.5: SW restart — cold-start after "all unregistered" re-assigns W1', async () => {
  // Simulate a prior SW session that had W1 (id=5).
  registerWindow(5);
  assert.equal(getWindowOrdinal(5), 1);

  // Simulate SW suspend: module state reset (§28.2.5 invariant).
  __resetWindowOrdinals();

  // Cold-start with the same (only remaining) window — assigned W1 fresh.
  __setMockWindows([{ id: 5 }]);
  await initWindowOrdinals();
  assert.equal(getWindowOrdinal(5), 1, 'reopened window gets W1 on fresh enumeration');
  assert.deepStrictEqual(getWindowMap(), { '5': 1 });
});

test('B-014 §28.2.6: WINDOW_ID_NONE and negative / non-finite ids are defensively ignored', () => {
  assert.equal(registerWindow(-1), null, 'WINDOW_ID_NONE rejected');
  assert.equal(registerWindow(Number.NaN), null, 'NaN rejected');
  assert.equal(registerWindow(Number.POSITIVE_INFINITY), null, 'Infinity rejected');
  assert.equal(registerWindow('42'), null, 'string id rejected');
  assert.equal(getWindowOrdinalsSize(), 0);

  assert.equal(unregisterWindow(-1), false);
  assert.equal(unregisterWindow(Number.NaN), false);
});

test('B-014 §28.3.7: initWindowOrdinals is idempotent — second call does not renumber', async () => {
  __setMockWindows([{ id: 10 }, { id: 20 }]);
  await initWindowOrdinals();
  assert.equal(getWindowOrdinal(10), 1);
  assert.equal(getWindowOrdinal(20), 2);

  // A second call with the same fixture must not reassign existing ordinals.
  await initWindowOrdinals();
  assert.equal(getWindowOrdinal(10), 1, 'W1 unchanged');
  assert.equal(getWindowOrdinal(20), 2, 'W2 unchanged');
});

test('B-014: initWindowOrdinals gracefully handles chrome.windows.getAll failure', async () => {
  // Swap in a rejecting implementation. Silence console.warn for this test
  // so the expected one-shot warning does not pollute the test output.
  const orig = chrome.windows.getAll;
  const origWarn = console.warn;
  chrome.windows.getAll = async () => { throw new Error('simulated failure'); };
  console.warn = () => {};
  try {
    await initWindowOrdinals();
    assert.equal(getWindowOrdinalsSize(), 0, 'empty map on failure — no throw propagated');
  } finally {
    chrome.windows.getAll = orig;
    console.warn = origWarn;
  }
});
