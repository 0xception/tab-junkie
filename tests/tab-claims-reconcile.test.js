import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs, __setSessionStore, __getSessionStore } from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { reconcileClaims, buildLiveStates, isClaimsReady, __resetTabClaims } from '../background/tabs/tab-claims.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC2: reconcileClaims validates existing claims and drops invalid ones', async () => {
  // Set up 2 tabs
  __setMockTabs([
    { id: 100, url: 'https://valid.com', windowId: 1, active: false, audible: false },
    { id: 200, url: 'https://changed.com', windowId: 1, active: false, audible: false },
  ]);
  await buildLiveTabIndex();

  // Seed session with 3 claims: 1 valid, 2 invalid
  __setSessionStore('tj:tabClaims', {
    'item-valid': 100,    // valid: tab 100 exists and URL matches
    'item-stale-tab': 999, // invalid: tab 999 does not exist
    'item-url-mismatch': 200, // invalid: tab 200 URL changed
  });

  const items = [
    { id: 'item-valid', url: 'https://valid.com', sortOrder: 0 },
    { id: 'item-stale-tab', url: 'https://stale.com', sortOrder: 1 },
    { id: 'item-url-mismatch', url: 'https://original.com', sortOrder: 2 },
  ];

  await reconcileClaims(items);

  const claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-valid'], 100, 'Valid claim should be retained');
  assert.equal(claims['item-stale-tab'], undefined, 'Stale tab claim should be dropped');
  assert.equal(claims['item-url-mismatch'], undefined, 'URL mismatch claim should be dropped');
});

test('AC2: unclaimed items are re-claimed in sortOrder (first-unclaimed-wins)', async () => {
  __setMockTabs([
    { id: 10, url: 'https://alpha.com', windowId: 1, active: false, audible: false },
    { id: 20, url: 'https://beta.com', windowId: 1, active: false, audible: false },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'item-b', url: 'https://beta.com', sortOrder: 5 },
    { id: 'item-a', url: 'https://alpha.com', sortOrder: 1 },
  ];

  await reconcileClaims(items);

  const claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-a'], 10, 'item-a (lower sortOrder) should claim tab 10');
  assert.equal(claims['item-b'], 20, 'item-b should claim tab 20');
});

test('AC2: claimsReady flips to true after reconcileClaims', async () => {
  assert.equal(isClaimsReady(), false, 'Should be false before reconcile');

  __setMockTabs([]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  assert.equal(isClaimsReady(), true, 'Should be true after reconcile');
});

test('H3: buildLiveStates returns all-false before reconcileClaims runs', async () => {
  __setMockTabs([{ id: 1, url: 'https://example.com', windowId: 1, active: true, audible: true }]);
  await buildLiveTabIndex();

  // Do NOT call reconcileClaims — claimsReady is false
  const items = [{ id: 'item-1', url: 'https://example.com', sortOrder: 0 }];
  const states = buildLiveStates(items);

  assert.deepStrictEqual(states['item-1'], { live: false, active: false, audible: false },
    'Before reconcile, all states should be false');
});
