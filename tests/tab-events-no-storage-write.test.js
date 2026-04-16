import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs, __resetSetCallCount, __setCallCount, seedPartitions } from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims, reconcileClaims } from '../background/tabs/tab-claims.js';
import { registerTabEventListeners } from '../background/tabs/tab-events.js';

// NOTE: We do NOT call __resetMock in beforeEach because that clears
// event listeners. Instead we register once and test in a single test
// that exercises all three event types.

test('AC4: tab events never call chrome.storage.local.set', async () => {
  // Fresh state
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();

  // Set up tabs and items
  __setMockTabs([
    { id: 1, url: 'https://example.com', windowId: 1, active: true, audible: false },
    { id: 2, url: 'https://other.com', windowId: 1, active: false, audible: false },
  ]);

  // Seed items partition so listItems() works inside the debounced handler
  seedPartitions({
    items: [{ id: 'item-1', url: 'https://example.com', title: 'Test', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 }],
    meta: { schemaVersion: 1 },
  });

  await buildLiveTabIndex();
  await reconcileClaims([{ id: 'item-1', url: 'https://example.com', sortOrder: 0 }]);

  // Register event listeners with a resolved readyPromise
  registerTabEventListeners(Promise.resolve());

  // Reset the set call counter AFTER all setup writes
  __resetSetCallCount();

  // Fire onUpdated (URL change)
  chrome.tabs.onUpdated.__fire(1, { url: 'https://new-url.com' }, { id: 1, windowId: 1, active: true });

  // Fire onActivated
  chrome.tabs.onActivated.__fire({ tabId: 2, windowId: 1 });

  // Fire onRemoved
  chrome.tabs.onRemoved.__fire(2);

  // Wait past the 100ms debounce + async handlers
  await new Promise((r) => setTimeout(r, 250));

  // chrome.storage.local.set should never have been called by any tab event
  const count = __setCallCount();
  assert.equal(count, 0, `chrome.storage.local.set was called ${count} times, expected 0`);
});
