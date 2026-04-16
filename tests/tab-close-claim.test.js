import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs, __getSessionStore, __getRawStore, seedPartitions } from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { reconcileClaims, buildLiveStates, releaseClaimByTab, __resetTabClaims } from '../background/tabs/tab-claims.js';
import { removeTabEntry } from '../background/tabs/live-tab-index.js';
import { detectDriftForTab, getDriftRecords, clearDrift } from '../background/tabs/drift.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC5: tab close removes claim, buildLiveStates returns live:false, item remains in tj:items', async () => {
  const items = [
    { id: 'item-1', url: 'https://example.com', sortOrder: 0, title: 'Example', groupId: null, createdAt: 1, updatedAt: 1 },
  ];

  // Seed the item into storage
  seedPartitions({ items });

  __setMockTabs([
    { id: 42, url: 'https://example.com', windowId: 1, active: true, audible: false },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims(items);

  // Verify claim exists
  let claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-1'], 42, 'item-1 should be claimed by tab 42');
  let states = buildLiveStates(items);
  assert.equal(states['item-1'].live, true);

  // Simulate tab close: remove from index and release claim
  removeTabEntry(42);
  await releaseClaimByTab(42);

  // Verify claim removed
  claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-1'], undefined, 'Claim should be removed after tab close');

  // buildLiveStates should show live:false
  states = buildLiveStates(items);
  assert.equal(states['item-1'].live, false, 'Item should no longer be live');

  // Item should still exist in tj:items storage
  const storedItems = await chrome.storage.local.get('tj:items');
  assert.equal(storedItems['tj:items'].length, 1, 'Item should still exist in storage');
  assert.equal(storedItems['tj:items'][0].id, 'item-1');
});

test('B-015: tab close clears drift record for the released item', async () => {
  const items = [
    { id: 'item-d1', url: 'https://saved.com/page', sortOrder: 0, title: 'Saved Page', groupId: null, createdAt: 1, updatedAt: 1 },
  ];

  seedPartitions({ items });

  __setMockTabs([
    { id: 77, url: 'https://saved.com/page', windowId: 1, active: true, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims(items);

  // Tab navigates away — drift record created
  await detectDriftForTab(77, 'https://drifted.com/other', items);
  let drift = await getDriftRecords();
  assert.ok(drift['item-d1'], 'Drift record should exist after tab drifts');

  // Simulate tab close: release claim, then clearDrift (mirrors tab-events.js onRemoved)
  removeTabEntry(77);
  const releasedItemId = await releaseClaimByTab(77);
  assert.equal(releasedItemId, 'item-d1', 'releaseClaimByTab should return the released itemId');
  if (releasedItemId) await clearDrift(releasedItemId);

  // Drift record should be cleared
  drift = await getDriftRecords();
  assert.equal(drift['item-d1'], undefined, 'Drift record should be cleared after tab close');
});
