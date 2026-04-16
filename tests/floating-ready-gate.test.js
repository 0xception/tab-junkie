/**
 * floating-ready-gate.test.js — AC10
 * Re-association completes before readyPromise consumers see results.
 *
 * Since we cannot directly test readyPromise gating without the full
 * cold-start orchestrator, we verify the observable contract: after
 * reassociateFloatingGroups resolves, buildLiveStates reflects the claims.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs, seedPartitions } from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex, getLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { reconcileClaims, buildLiveStates, __resetTabClaims } from '../background/tabs/tab-claims.js';
import { reassociateFloatingGroups } from '../background/tabs/floating-groups.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC10: buildLiveStates reflects re-associated claims after reassociate resolves', async () => {
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-float', windowId: 1, tabIndex: 0, url: 'https://live.com', savedAt: 1000 },
    ],
  });

  __setMockTabs([
    { id: 42, url: 'https://live.com', windowId: 1, active: true, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  // Must call reconcileClaims first so claimsReady = true
  await reconcileClaims([{ id: 'g-float', url: 'https://live.com', sortOrder: 0 }]);

  // Now reassociate floating groups
  await reassociateFloatingGroups(getLiveTabIndex(), {});

  // buildLiveStates should immediately see the re-associated claim
  const states = buildLiveStates([{ id: 'g-float' }]);
  assert.equal(states['g-float'].live, true, 'Item should be live after re-association');
  assert.equal(states['g-float'].active, true, 'Item should reflect tab active state');
});

test('AC10: re-association is synchronously visible — no race window', async () => {
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-a', windowId: 1, tabIndex: 0, url: 'https://a.com', savedAt: 1000 },
      { groupId: 'g-b', windowId: 1, tabIndex: 1, url: 'https://b.com', savedAt: 1000 },
    ],
  });

  __setMockTabs([
    { id: 10, url: 'https://a.com', windowId: 1, active: false, audible: true, index: 0 },
    { id: 20, url: 'https://b.com', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([
    { id: 'g-a', url: 'https://a.com', sortOrder: 0 },
    { id: 'g-b', url: 'https://b.com', sortOrder: 1 },
  ]);

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const states = buildLiveStates([{ id: 'g-a' }, { id: 'g-b' }]);
  assert.equal(states['g-a'].live, true);
  assert.equal(states['g-a'].audible, true);
  assert.equal(states['g-b'].live, true);
  assert.equal(states['g-b'].audible, false);
});
