/**
 * drift-persist.test.js — AC5
 * Drift records survive cold-start (storage.local, not session).
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs, __getRawStore, seedPartitions } from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { reconcileClaims, __resetTabClaims } from '../background/tabs/tab-claims.js';
import { detectDriftForTab, getDriftRecords } from '../background/tabs/drift.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC5: drift records persist in storage.local and survive simulated cold-start', async () => {
  // Set up claimed tab and produce drift
  __setMockTabs([
    { id: 1, url: 'https://original.com', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  const items = [{ id: 'item-1', url: 'https://original.com', sortOrder: 0 }];
  await reconcileClaims(items);
  await detectDriftForTab(1, 'https://drifted.com', items);

  // Verify drift is in storage.local
  const rawDrift = __getRawStore('tj:drift');
  assert.ok(rawDrift['item-1'], 'Drift should be in storage.local');

  // Simulate cold-start: reset in-memory state but NOT storage.local
  __resetLiveTabIndex();
  __resetTabClaims();

  // Drift records should still be readable from storage.local
  const drift = await getDriftRecords();
  assert.ok(drift['item-1'], 'Drift record should survive cold-start');
  assert.equal(drift['item-1'].driftedToUrl, 'https://drifted.com/');
  assert.equal(drift['item-1'].itemId, 'item-1');
});

test('AC5: drift is NOT stored in storage.session', async () => {
  __setMockTabs([
    { id: 2, url: 'https://example.com', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  const items = [{ id: 'item-2', url: 'https://example.com', sortOrder: 0 }];
  await reconcileClaims(items);
  await detectDriftForTab(2, 'https://other.com', items);

  // Verify it is in storage.local, not session
  const rawLocal = __getRawStore('tj:drift');
  assert.ok(rawLocal['item-2'], 'Drift should be in storage.local');

  // Session store should not have drift
  const sessionResult = await chrome.storage.session.get('tj:drift');
  assert.equal(sessionResult['tj:drift'], undefined, 'Drift should NOT be in storage.session');
});

test('AC5: pre-seeded drift records are readable after cold-start', async () => {
  // Seed drift directly (simulating data from a previous session)
  seedPartitions({
    drift: {
      'item-old': {
        itemId: 'item-old',
        driftedToUrl: 'https://old-drift.com/',
        detectedAt: Date.now() - 86400000,
      },
    },
  });

  const drift = await getDriftRecords();
  assert.ok(drift['item-old'], 'Pre-seeded drift record should be readable');
  assert.equal(drift['item-old'].driftedToUrl, 'https://old-drift.com/');
});
