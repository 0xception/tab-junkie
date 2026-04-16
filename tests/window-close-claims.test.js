import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs, __getSessionStore } from './chrome-mock.js';
import { buildLiveTabIndex, removeTabsByWindow, __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { reconcileClaims, buildLiveStates, releaseClaimByTab, __resetTabClaims } from '../background/tabs/tab-claims.js';

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

  let claims = __getSessionStore('tj:tabClaims');
  assert.equal(Object.keys(claims).length, 3, 'All 3 items should be claimed');

  // Simulate window 5 closing: remove tabs by window, then release claims
  const removedTabIds = removeTabsByWindow(5);
  assert.equal(removedTabIds.length, 2, 'Should remove 2 tabs from window 5');
  for (const tabId of removedTabIds) {
    await releaseClaimByTab(tabId);
  }

  claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['a'], undefined, 'Claim for item a should be removed');
  assert.equal(claims['b'], undefined, 'Claim for item b should be removed');
  assert.equal(claims['c'], 3, 'Claim for item c (window 9) should remain');

  const states = buildLiveStates(items);
  assert.equal(states['a'].live, false);
  assert.equal(states['b'].live, false);
  assert.equal(states['c'].live, true, 'Item c should still be live');
});
