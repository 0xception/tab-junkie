/**
 * drift-fragment.test.js — AC3
 * Fragment-only change does not create a drift record.
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

test('AC3: fragment-only change does not create drift record', async () => {
  __setMockTabs([
    { id: 1, url: 'https://docs.example.com/page', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  const items = [{ id: 'item-1', url: 'https://docs.example.com/page', sortOrder: 0 }];
  await reconcileClaims(items);

  // Navigate to same URL with fragment
  await detectDriftForTab(1, 'https://docs.example.com/page#section-2', items);

  const drift = await getDriftRecords();
  assert.deepStrictEqual(drift, {}, 'No drift record should be written for fragment-only change');
});

test('AC3: fragment change on saved URL with existing fragment — no drift', async () => {
  __setMockTabs([
    { id: 2, url: 'https://docs.example.com/page#old', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  const items = [{ id: 'item-2', url: 'https://docs.example.com/page#old', sortOrder: 0 }];
  await reconcileClaims(items);

  // Navigate to same URL with different fragment
  await detectDriftForTab(2, 'https://docs.example.com/page#new', items);

  const drift = await getDriftRecords();
  assert.deepStrictEqual(drift, {}, 'Fragment difference should not produce drift');
});

test('AC3: fragment removal does not create drift', async () => {
  __setMockTabs([
    { id: 3, url: 'https://example.com/page#frag', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  const items = [{ id: 'item-3', url: 'https://example.com/page#frag', sortOrder: 0 }];
  await reconcileClaims(items);

  // Navigate to same URL without fragment
  await detectDriftForTab(3, 'https://example.com/page', items);

  const drift = await getDriftRecords();
  assert.deepStrictEqual(drift, {}, 'Removing fragment should not produce drift');
});
