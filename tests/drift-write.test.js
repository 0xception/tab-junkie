/**
 * drift-write.test.js — AC1, AC6
 * Drift written on URL divergence; no-op on unclaimed tab; timing check.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs, __getRawStore } from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { reconcileClaims, __resetTabClaims } from '../background/tabs/tab-claims.js';
import { detectDriftForTab, getDriftRecords } from '../background/tabs/drift.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC1: drift record written when claimed tab URL diverges', async () => {
  __setMockTabs([
    { id: 1, url: 'https://saved.com/page', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  const items = [{ id: 'item-1', url: 'https://saved.com/page', sortOrder: 0 }];
  await reconcileClaims(items);

  // Tab navigates to a different URL
  await detectDriftForTab(1, 'https://other.com/different', items);

  const drift = await getDriftRecords();
  assert.ok(drift['item-1'], 'Drift record should exist for item-1');
  assert.equal(drift['item-1'].itemId, 'item-1');
  assert.equal(drift['item-1'].driftedToUrl, 'https://other.com/different');
  assert.equal(typeof drift['item-1'].detectedAt, 'number');
});

test('AC1: drift record stored in storage.local under tj:drift', async () => {
  __setMockTabs([
    { id: 1, url: 'https://example.com', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  const items = [{ id: 'item-x', url: 'https://example.com', sortOrder: 0 }];
  await reconcileClaims(items);

  await detectDriftForTab(1, 'https://drifted.com', items);

  const raw = __getRawStore('tj:drift');
  assert.ok(raw, 'tj:drift should be written to storage.local');
  assert.ok(raw['item-x'], 'Should contain item-x entry');
});

test('AC6: unclaimed tab — no drift record written', async () => {
  __setMockTabs([
    { id: 50, url: 'https://unclaimed.com', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  // No items → no claims
  await reconcileClaims([]);

  await detectDriftForTab(50, 'https://navigated.com', []);

  const drift = await getDriftRecords();
  assert.deepStrictEqual(drift, {}, 'No drift should be written for unclaimed tab');
});

test('AC6: unclaimed tab does not trigger storage write', async () => {
  __setMockTabs([]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  // Tab 999 is not in any claim
  await detectDriftForTab(999, 'https://nowhere.com', []);

  const raw = __getRawStore('tj:drift');
  assert.equal(raw, undefined, 'tj:drift key should not exist — no write occurred');
});

test('AC1: drift detectedAt is a recent timestamp', async () => {
  __setMockTabs([
    { id: 1, url: 'https://a.com', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  const items = [{ id: 'item-ts', url: 'https://a.com', sortOrder: 0 }];
  await reconcileClaims(items);

  const before = Date.now();
  await detectDriftForTab(1, 'https://b.com', items);
  const after = Date.now();

  const drift = await getDriftRecords();
  assert.ok(drift['item-ts'].detectedAt >= before, 'detectedAt should be >= test start');
  assert.ok(drift['item-ts'].detectedAt <= after, 'detectedAt should be <= test end');
});
