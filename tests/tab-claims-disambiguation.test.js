import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs } from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { reconcileClaims, buildLiveStates, __resetTabClaims, getClaimsMirror } from '../background/tabs/tab-claims.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC3: 3 items same URL, 2 tabs — exactly 2 claims with distinct tabIds, 3rd unclaimed', async () => {
  const sharedUrl = 'https://duplicate.com/page';
  __setMockTabs([
    { id: 10, url: sharedUrl, windowId: 1, active: false, audible: false },
    { id: 20, url: sharedUrl, windowId: 1, active: false, audible: false },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'dup-1', url: sharedUrl, sortOrder: 1 },
    { id: 'dup-2', url: sharedUrl, sortOrder: 2 },
    { id: 'dup-3', url: sharedUrl, sortOrder: 3 },
  ];

  await reconcileClaims(items);

  const claims = getClaimsMirror();
  const claimedTabIds = Object.values(claims);

  // Exactly 2 items should have claims
  assert.equal(Object.keys(claims).length, 2, 'Exactly 2 claims should exist');

  // The 2 claimed tabIds must be distinct
  const uniqueTabIds = new Set(claimedTabIds);
  assert.equal(uniqueTabIds.size, 2, 'Claimed tabIds must be distinct');

  // The first two items (by sortOrder) should be claimed
  assert.ok('dup-1' in claims, 'dup-1 (sortOrder 1) should be claimed');
  assert.ok('dup-2' in claims, 'dup-2 (sortOrder 2) should be claimed');
  assert.equal(claims['dup-3'], undefined, 'dup-3 (sortOrder 3) should be unclaimed');

  // buildLiveStates should reflect this
  const states = buildLiveStates(items);
  assert.equal(states['dup-1'].live, true);
  assert.equal(states['dup-2'].live, true);
  assert.equal(states['dup-3'].live, false, 'Third item should not be live');
});

test('AC3: no two TabClaims entries share the same tabId', async () => {
  const url = 'https://shared.com';
  __setMockTabs([
    { id: 1, url, windowId: 1, active: false, audible: false },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'a', url, sortOrder: 0 },
    { id: 'b', url, sortOrder: 1 },
  ];

  await reconcileClaims(items);

  const claims = getClaimsMirror();
  const tabIds = Object.values(claims);
  const uniqueTabIds = new Set(tabIds);
  assert.equal(tabIds.length, uniqueTabIds.size, 'No duplicate tabIds in claims');
  assert.equal(Object.keys(claims).length, 1, 'Only 1 item should claim the single tab');
});
