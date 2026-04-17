/**
 * floating-session-wipe.test.js — AC12
 * storage.session wipe doesn't affect tj:floatingGroups.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs, __getRawStore, seedPartitions } from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex, getLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims, getClaimsMirror } from '../background/tabs/tab-claims.js';
import { reassociateFloatingGroups } from '../background/tabs/floating-groups.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC12: storage.session wipe does not lose floating-group records', async () => {
  // Seed floating groups in storage.local
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-survive', itemId: 'g-survive', windowId: 1, tabIndex: 0, url: 'https://survive.com', savedAt: 1000 },
    ],
  });

  // Simulate browser restart: wipe storage.session
  await chrome.storage.session.clear();

  // Verify floating groups still in storage.local
  const raw = __getRawStore('tj:floatingGroups');
  assert.ok(Array.isArray(raw), 'tj:floatingGroups should still exist in storage.local');
  assert.equal(raw.length, 1);
  assert.equal(raw[0].groupId, 'g-survive');
});

test('AC12: re-association works after session wipe + cold start', async () => {
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-cold', itemId: 'g-cold', windowId: 1, tabIndex: 0, url: 'https://cold.com', savedAt: 1000 },
    ],
  });

  // Simulate browser restart: wipe session, reset in-memory state
  await chrome.storage.session.clear();
  __resetLiveTabIndex();
  __resetTabClaims();

  // Rebuild live tab index (cold start)
  __setMockTabs([
    { id: 5, url: 'https://cold.com', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  // Run re-association
  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const claims = getClaimsMirror();
  assert.equal(claims['g-cold'], 5, 'Re-association should work after session wipe');

  // Verify floating groups in storage.local were pruned (resolved)
  const raw = __getRawStore('tj:floatingGroups');
  assert.ok(Array.isArray(raw));
  assert.equal(raw.length, 0, 'Resolved record should be pruned');
});

test('AC12: session wipe clears tab claims but floating groups remain', async () => {
  // Seed both: tab claims in session, floating groups in local
  await chrome.storage.session.set({ 'tj:tabClaims': { 'item-1': 10 } });
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-persist', itemId: 'g-persist', windowId: 1, tabIndex: 0, url: 'https://persist.com', savedAt: 1000 },
    ],
  });

  // Wipe session
  await chrome.storage.session.clear();

  // Session claims should be gone
  const sessionResult = await chrome.storage.session.get('tj:tabClaims');
  assert.equal(sessionResult['tj:tabClaims'], undefined, 'Session claims should be wiped');

  // Floating groups in local should survive
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1, 'Floating groups should survive session wipe');
});
