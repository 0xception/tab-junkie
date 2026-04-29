/**
 * floating-position.test.js — AC8 (B-121 §60.4 contract update)
 * Position match (windowId+tabIndex) takes priority over URL fallback.
 * Post-S38: reassociateFloatingGroups DOES NOT call claimTabForItem.
 * Records with a matched-and-already-claimed tab are pruned; matched-and-
 * unclaimed records remain for runtime render.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs, __getRawStore, seedPartitions } from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex, getLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims, getClaimsMirror, reconcileClaims } from '../background/tabs/tab-claims.js';
import { reassociateFloatingGroups } from '../background/tabs/floating-groups.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC8: matched-unclaimed record at correct position is retained', async () => {
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-pos', groupId: 'g-1', parentItemId: 'p-1', windowId: 1, tabIndex: 2, url: 'https://old-url.com', savedAt: 1000 },
    ],
  });

  /* Live tab at exact position; URL has drifted but position still
     uniquely identifies the same logical browser tab. */
  __setMockTabs([
    { id: 100, url: 'https://different-url.com', windowId: 1, active: false, audible: false, index: 2 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  /* No claim written. Record remains in storage (matched-unclaimed). */
  assert.equal(Object.keys(getClaimsMirror()).length, 0);
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1);
});

test('AC8: position match takes priority over URL match (record retained)', async () => {
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-priority', groupId: 'g-1', parentItemId: 'p-1', windowId: 1, tabIndex: 0, url: 'https://match.com', savedAt: 1000 },
    ],
  });

  /* Tab 200 at correct position with wrong URL; tab 300 has correct URL but
     wrong position. The position match wins; record retained because tab
     200 is unclaimed. */
  __setMockTabs([
    { id: 200, url: 'https://wrong.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 300, url: 'https://match.com', windowId: 2, active: false, audible: false, index: 5 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  /* No claim written. Record remains. */
  assert.equal(Object.keys(getClaimsMirror()).length, 0);
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1);
});

test('AC8: position match against an already-claimed tab still triggers prune', async () => {
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-claimed', groupId: 'g-1', parentItemId: 'p-1', windowId: 1, tabIndex: 0, url: 'https://x.com', savedAt: 1000 },
    ],
  });

  __setMockTabs([
    { id: 10, url: 'https://x.com', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  /* Establish a claim on tab 10 via reconcileClaims (URL match). */
  await reconcileClaims([{ id: 'existing-item', url: 'https://x.com', sortOrder: 0 }]);
  assert.equal(getClaimsMirror()['existing-item'], 10);

  await reassociateFloatingGroups(getLiveTabIndex(), getClaimsMirror());

  /* Pre-existing claim preserved; floating record pruned because the
     matched tab is now claimed. */
  assert.equal(getClaimsMirror()['existing-item'], 10);
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 0);
});
