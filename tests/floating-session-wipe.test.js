/**
 * floating-session-wipe.test.js — AC12 (B-121 §60.4 contract update)
 * storage.session wipe must not lose tj:floatingGroups records.
 * Post-S38: reassociateFloatingGroups does NOT write claims; records
 * remain in storage for runtime render.
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
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-survive', groupId: 'g-survive', parentItemId: 'p-survive', windowId: 1, tabIndex: 0, url: 'https://survive.com', savedAt: 1000 },
    ],
  });

  await chrome.storage.session.clear();

  const raw = __getRawStore('tj:floatingGroups');
  assert.ok(Array.isArray(raw));
  assert.equal(raw.length, 1);
  assert.equal(raw[0].groupId, 'g-survive');
});

test('AC12: cold-start replay preserves matched-unclaimed records', async () => {
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-cold', groupId: 'g-cold', parentItemId: 'p-cold', windowId: 1, tabIndex: 0, url: 'https://cold.com', savedAt: 1000 },
    ],
  });

  await chrome.storage.session.clear();
  __resetLiveTabIndex();
  __resetTabClaims();

  __setMockTabs([
    { id: 5, url: 'https://cold.com', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  /* Post-S38: no claim written. Record retained for runtime render. */
  assert.equal(Object.keys(getClaimsMirror()).length, 0);
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1);
});

test('AC12: session wipe clears tab claims; floating-group records survive in local', async () => {
  await chrome.storage.session.set({ 'tj:tabClaims': { 'item-1': 10 } });
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-persist', groupId: 'g-persist', parentItemId: 'p-persist', windowId: 1, tabIndex: 0, url: 'https://persist.com', savedAt: 1000 },
    ],
  });

  await chrome.storage.session.clear();

  const sessionResult = await chrome.storage.session.get('tj:tabClaims');
  assert.equal(sessionResult['tj:tabClaims'], undefined);

  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1);
});
