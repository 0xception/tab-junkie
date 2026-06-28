import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs } from './chrome-mock.js';
import { buildLiveTabIndex, removeTabsByWindow, __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { reconcileClaims, buildLiveStates, releaseClaimByTab, __resetTabClaims, getClaimsMirror } from '../background/tabs/tab-claims.js';
import { detectDriftForTab, getDriftRecords, clearDrift } from '../background/tabs/drift.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC7: window close removes all claims for tabs in that window', async () => {
  __setMockTabs([
    { id: 1, url: 'https://alpha.com', windowId: 5, active: true, audible: false },
    { id: 2, url: 'https://beta.com', windowId: 5, active: false, audible: false },
    { id: 3, url: 'https://gamma.com', windowId: 9, active: true, audible: false },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'a', url: 'https://alpha.com', sortOrder: 0 },
    { id: 'b', url: 'https://beta.com', sortOrder: 1 },
    { id: 'c', url: 'https://gamma.com', sortOrder: 2 },
  ];

  await reconcileClaims(items);

  let claims = getClaimsMirror();
  assert.equal(Object.keys(claims).length, 3, 'All 3 items should be claimed');

  // Simulate window 5 closing: remove tabs by window, then release claims
  const removedTabIds = removeTabsByWindow(5);
  assert.equal(removedTabIds.length, 2, 'Should remove 2 tabs from window 5');
  for (const tabId of removedTabIds) {
    await releaseClaimByTab(tabId);
  }

  claims = getClaimsMirror();
  assert.equal(claims['a'], undefined, 'Claim for item a should be removed');
  assert.equal(claims['b'], undefined, 'Claim for item b should be removed');
  assert.equal(claims['c'], 3, 'Claim for item c (window 9) should remain');

  const states = buildLiveStates(items);
  assert.equal(states['a'].live, false);
  assert.equal(states['b'].live, false);
  assert.equal(states['c'].live, true, 'Item c should still be live');
});

test('B-015: window close clears drift records for all tabs in the closed window', async () => {
  __setMockTabs([
    { id: 10, url: 'https://alpha.com', windowId: 7, active: true, audible: false, index: 0 },
    { id: 11, url: 'https://beta.com', windowId: 7, active: false, audible: false, index: 1 },
    { id: 12, url: 'https://gamma.com', windowId: 8, active: true, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'ia', url: 'https://alpha.com', sortOrder: 0 },
    { id: 'ib', url: 'https://beta.com', sortOrder: 1 },
    { id: 'ic', url: 'https://gamma.com', sortOrder: 2 },
  ];

  await reconcileClaims(items);

  // Create drift records for all three items
  await detectDriftForTab(10, 'https://drifted-a.com', items);
  await detectDriftForTab(11, 'https://drifted-b.com', items);
  await detectDriftForTab(12, 'https://drifted-c.com', items);

  let drift = await getDriftRecords();
  assert.ok(drift['ia'], 'Drift for ia should exist');
  assert.ok(drift['ib'], 'Drift for ib should exist');
  assert.ok(drift['ic'], 'Drift for ic should exist');

  // Simulate window 7 closing: remove tabs, release claims, clear drift
  // (mirrors tab-events.js windows.onRemoved with Promise.allSettled)
  const removedTabIds = removeTabsByWindow(7);
  assert.equal(removedTabIds.length, 2, 'Should remove 2 tabs from window 7');
  await Promise.allSettled(removedTabIds.map(async (tabId) => {
    const releasedItemId = await releaseClaimByTab(tabId);
    if (releasedItemId) await clearDrift(releasedItemId);
  }));

  drift = await getDriftRecords();
  assert.equal(drift['ia'], undefined, 'Drift for ia should be cleared after window close');
  assert.equal(drift['ib'], undefined, 'Drift for ib should be cleared after window close');
  assert.ok(drift['ic'], 'Drift for ic (window 8) should remain');
});
