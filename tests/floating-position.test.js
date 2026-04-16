/**
 * floating-position.test.js — AC8
 * Position match (windowId+tabIndex) takes priority.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs, __getSessionStore, seedPartitions } from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims, getClaimsMirror } from '../background/tabs/tab-claims.js';
import { reassociateFloatingGroups } from '../background/tabs/floating-groups.js';
import { getLiveTabIndex } from '../background/tabs/live-tab-index.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC8: position match (windowId+tabIndex) succeeds on cold start', async () => {
  // Seed floating groups with a record at window 1, index 2
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-1', windowId: 1, tabIndex: 2, url: 'https://old-url.com', savedAt: 1000 },
    ],
  });

  // Live tab at exact same position, but different URL
  __setMockTabs([
    { id: 100, url: 'https://different-url.com', windowId: 1, active: false, audible: false, index: 2 },
  ]);
  await buildLiveTabIndex();

  const liveIndex = getLiveTabIndex();
  await reassociateFloatingGroups(liveIndex, {});

  const claims = getClaimsMirror();
  assert.equal(claims['g-1'], 100, 'Should claim tab by position match despite URL difference');
});

test('AC8: position match takes priority over URL match', async () => {
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-pos', windowId: 1, tabIndex: 0, url: 'https://match.com', savedAt: 1000 },
    ],
  });

  // Tab 200 is at correct position but wrong URL; Tab 300 has correct URL but wrong position
  __setMockTabs([
    { id: 200, url: 'https://wrong.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 300, url: 'https://match.com', windowId: 2, active: false, audible: false, index: 5 },
  ]);
  await buildLiveTabIndex();

  const liveIndex = getLiveTabIndex();
  await reassociateFloatingGroups(liveIndex, {});

  const claims = getClaimsMirror();
  assert.equal(claims['g-pos'], 200, 'Position match (tab 200) should win over URL match (tab 300)');
});

test('AC8: already-claimed tab is excluded from position match', async () => {
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-new', windowId: 1, tabIndex: 0, url: 'https://x.com', savedAt: 1000 },
    ],
  });

  __setMockTabs([
    { id: 10, url: 'https://claimed.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 20, url: 'https://x.com', windowId: 2, active: false, audible: false, index: 3 },
  ]);
  await buildLiveTabIndex();

  const liveIndex = getLiveTabIndex();
  // Tab 10 is already claimed
  await reassociateFloatingGroups(liveIndex, { 'existing-item': 10 });

  const claims = getClaimsMirror();
  // Tab 10 is excluded; should fall back to URL match on tab 20
  assert.equal(claims['g-new'], 20, 'Should skip already-claimed tab and fall back to URL match');
});
