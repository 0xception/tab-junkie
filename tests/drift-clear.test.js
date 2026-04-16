/**
 * drift-clear.test.js — AC2, AC4
 * Drift cleared on navigate-back; cleared when normalized match despite raw difference.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs } from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { reconcileClaims, __resetTabClaims } from '../background/tabs/tab-claims.js';
import { detectDriftForTab, getDriftRecords } from '../background/tabs/drift.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC2: drift cleared when tab navigates back to saved URL', async () => {
  __setMockTabs([
    { id: 1, url: 'https://saved.com/page', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  const items = [{ id: 'item-1', url: 'https://saved.com/page', sortOrder: 0 }];
  await reconcileClaims(items);

  // Drift away
  await detectDriftForTab(1, 'https://other.com', items);
  let drift = await getDriftRecords();
  assert.ok(drift['item-1'], 'Drift should exist after navigating away');

  // Navigate back
  await detectDriftForTab(1, 'https://saved.com/page', items);
  drift = await getDriftRecords();
  assert.equal(drift['item-1'], undefined, 'Drift should be cleared after navigating back');
});

test('AC4: drift cleared when normalized URLs match despite raw difference', async () => {
  // Saved URL has no trailing slash, tab URL has trailing slash
  __setMockTabs([
    { id: 2, url: 'https://example.com', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  const items = [{ id: 'item-2', url: 'https://example.com', sortOrder: 0 }];
  await reconcileClaims(items);

  // Drift away first
  await detectDriftForTab(2, 'https://different.com', items);
  let drift = await getDriftRecords();
  assert.ok(drift['item-2'], 'Drift should exist');

  // Navigate back with trailing slash — normalization should match
  await detectDriftForTab(2, 'https://example.com/', items);
  drift = await getDriftRecords();
  assert.equal(drift['item-2'], undefined, 'Drift should be cleared — normalized URLs match');
});

test('AC4: drift cleared when case-different hostname matches after normalization', async () => {
  __setMockTabs([
    { id: 3, url: 'https://Example.COM/path', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  const items = [{ id: 'item-3', url: 'https://example.com/path', sortOrder: 0 }];
  await reconcileClaims(items);

  // Drift first
  await detectDriftForTab(3, 'https://unrelated.com', items);
  let drift = await getDriftRecords();
  assert.ok(drift['item-3'], 'Drift should exist');

  // Navigate back with different casing
  await detectDriftForTab(3, 'https://EXAMPLE.COM/path', items);
  drift = await getDriftRecords();
  assert.equal(drift['item-3'], undefined, 'Drift should be cleared — hostnames normalize to lowercase');
});
