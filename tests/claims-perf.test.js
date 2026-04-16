import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs } from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { reconcileClaims, __resetTabClaims } from '../background/tabs/tab-claims.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC10: reconcileClaims with 500 items and 50 tabs completes in under 50ms', async () => {
  // Generate 50 tabs with distinct URLs
  const tabs = [];
  for (let i = 0; i < 50; i++) {
    tabs.push({
      id: i + 1,
      url: `https://site-${i}.com/page`,
      windowId: 1,
      active: i === 0,
      audible: false,
    });
  }
  __setMockTabs(tabs);
  await buildLiveTabIndex();

  // Generate 500 items. First 50 match tab URLs, rest are unmatched.
  const items = [];
  for (let i = 0; i < 500; i++) {
    items.push({
      id: `item-${i}`,
      url: i < 50 ? `https://site-${i}.com/page` : `https://unmatched-${i}.com`,
      sortOrder: i,
    });
  }

  const start = performance.now();
  await reconcileClaims(items);
  const elapsed = performance.now() - start;

  assert.ok(elapsed < 50, `reconcileClaims took ${elapsed.toFixed(2)}ms, should be < 50ms`);
});
