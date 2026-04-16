import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs, seedPartitions } from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { reconcileClaims, buildLiveStates, __resetTabClaims } from '../background/tabs/tab-claims.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC9: buildLiveStates returns {items, liveStates} shape with correct values', async () => {
  __setMockTabs([
    { id: 1, url: 'https://claimed.com', windowId: 1, active: true, audible: false },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'claimed-item', url: 'https://claimed.com', sortOrder: 0 },
    { id: 'unclaimed-item', url: 'https://noclaim.com', sortOrder: 1 },
  ];

  await reconcileClaims(items);

  const liveStates = buildLiveStates(items);

  // Claimed item should be live
  assert.deepStrictEqual(liveStates['claimed-item'], {
    live: true,
    active: true,
    audible: false,
  });

  // Unclaimed item should have all false
  assert.deepStrictEqual(liveStates['unclaimed-item'], {
    live: false,
    active: false,
    audible: false,
  });
});

test('AC9: no live-state fields stored on Item objects in tj:items', async () => {
  const storedItems = [
    { id: 'item-1', url: 'https://example.com', title: 'Test', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 },
  ];
  seedPartitions({ items: storedItems });

  __setMockTabs([
    { id: 1, url: 'https://example.com', windowId: 1, active: true, audible: true },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims(storedItems);

  // Read items back from storage — they should NOT have live/active/audible fields
  const stored = await chrome.storage.local.get('tj:items');
  const item = stored['tj:items'][0];
  assert.equal(item.live, undefined, 'Item should not have a live field');
  assert.equal(item.active, undefined, 'Item should not have an active field');
  assert.equal(item.audible, undefined, 'Item should not have an audible field');
});

test('AC9: MSG_LIST_ITEMS dispatch returns enriched response', async () => {
  // This tests the contract at the buildLiveStates level.
  // The actual MSG_LIST_ITEMS handler in storage-handlers.js calls
  // buildLiveStates(items) and returns { items, liveStates }.
  __setMockTabs([
    { id: 10, url: 'https://a.com', windowId: 1, active: false, audible: true },
    { id: 20, url: 'https://b.com', windowId: 1, active: true, audible: false },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'a', url: 'https://a.com', sortOrder: 0 },
    { id: 'b', url: 'https://b.com', sortOrder: 1 },
    { id: 'c', url: 'https://c.com', sortOrder: 2 },
  ];

  await reconcileClaims(items);
  const liveStates = buildLiveStates(items);

  // Simulate the MSG_LIST_ITEMS response shape
  const response = { items, liveStates };

  assert.ok(Array.isArray(response.items), 'items should be an array');
  assert.equal(typeof response.liveStates, 'object', 'liveStates should be an object');
  assert.equal(response.liveStates['a'].live, true);
  assert.equal(response.liveStates['a'].audible, true);
  assert.equal(response.liveStates['b'].live, true);
  assert.equal(response.liveStates['b'].active, true);
  assert.equal(response.liveStates['c'].live, false);
});
