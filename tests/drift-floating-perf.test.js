/**
 * drift-floating-perf.test.js — AC13
 * Drift write <= 20ms P95; floating re-association (50 records, 50 tabs) <= 100ms.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs, seedPartitions } from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex, getLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { reconcileClaims, __resetTabClaims } from '../background/tabs/tab-claims.js';
import { detectDriftForTab } from '../background/tabs/drift.js';
import { reassociateFloatingGroups } from '../background/tabs/floating-groups.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC13: drift write completes in <= 20ms P95', async () => {
  __setMockTabs([
    { id: 1, url: 'https://origin.com', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  const items = [{ id: 'item-perf', url: 'https://origin.com', sortOrder: 0 }];
  await reconcileClaims(items);

  const timings = [];
  const iterations = 100;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await detectDriftForTab(1, `https://drifted-${i}.com`, items);
    timings.push(performance.now() - start);
  }

  timings.sort((a, b) => a - b);
  const p95Index = Math.ceil(0.95 * timings.length) - 1;
  const p95 = timings[p95Index];

  assert.ok(p95 <= 20, `Drift write P95 should be <= 20ms, got ${p95.toFixed(2)}ms`);
});

test('AC13: floating re-association (50 records, 50 tabs) completes in <= 100ms', async () => {
  // Generate 50 floating group records and 50 matching tabs
  const records = [];
  const tabs = [];
  for (let i = 0; i < 50; i++) {
    records.push({
      groupId: `g-${i}`,
      windowId: 1,
      tabIndex: i,
      url: `https://site-${i}.com`,
      savedAt: Date.now(),
    });
    tabs.push({
      id: i + 1,
      url: `https://site-${i}.com`,
      windowId: 1,
      active: false,
      audible: false,
      index: i,
    });
  }

  seedPartitions({ floatingGroups: records });
  __setMockTabs(tabs);
  await buildLiveTabIndex();

  const timings = [];
  const iterations = 20;

  for (let iter = 0; iter < iterations; iter++) {
    // Reset state for each iteration
    __resetTabClaims();
    // Re-seed since previous iteration pruned records
    seedPartitions({ floatingGroups: records });

    const start = performance.now();
    await reassociateFloatingGroups(getLiveTabIndex(), {});
    timings.push(performance.now() - start);
  }

  timings.sort((a, b) => a - b);
  const p95Index = Math.ceil(0.95 * timings.length) - 1;
  const p95 = timings[p95Index];

  assert.ok(p95 <= 100, `Floating re-association P95 should be <= 100ms, got ${p95.toFixed(2)}ms`);
});
