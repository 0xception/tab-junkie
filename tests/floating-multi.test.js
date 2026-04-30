/**
 * floating-multi.test.js — AC11 (B-121 §60.4 contract update)
 * Multiple floating-group records: each evaluated independently by
 * reassociateFloatingGroups. Post-S38 the function does NOT write
 * claims — instead, matched-and-claimed records are pruned and
 * matched-and-unclaimed records remain in storage for runtime render.
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

test('AC11: multiple matched-unclaimed records are all retained', async () => {
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-a', groupId: 'g-shared', parentItemId: 'p-a', windowId: 1, tabIndex: 0, url: 'https://a.com', savedAt: 1000 },
      { floatingTabId: 'ft-b', groupId: 'g-shared', parentItemId: 'p-b', windowId: 1, tabIndex: 1, url: 'https://b.com', savedAt: 1000 },
    ],
  });

  __setMockTabs([
    { id: 10, url: 'https://a.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 20, url: 'https://b.com', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  /* Post-S38: reassociate writes NO claims. Both records remain in
     storage; runtime path (buildFloatingMembers) surfaces them. */
  assert.equal(Object.keys(getClaimsMirror()).length, 0);
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 2, 'Both matched-unclaimed records retained');
});

/* B-132 §65.10 + R1 R3-DECISION: this test (and 'AC11: three records …'
   below at line ~76) seeds a tj:floatingGroups record AND a saved item
   with the same URL — the URL-collision shape that R2 §65.10 explicitly
   addressed for floating-position.test.js:68-91. The test stays
   mechanically green because it bypasses initializeLiveState and calls
   reconcileClaims directly without preMarkInheritedFromFloatingGroups,
   so the gate's empty-set behavior is what's pinned (still TRUE
   post-fix, load-bearing for the no-inheritance code path). T-132-F in
   tests/b132-cold-start-inheritance.test.js pins the integrated
   cold-start behavior with the helper applied. */
test('AC11: matched-and-claimed records pruned independently from matched-unclaimed', async () => {
  // Two records — one parent (item-X) is already claimed by
  // reconcileClaims via URL match; the other (item-Y) is unclaimed.
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-x', groupId: 'g-1', parentItemId: 'item-X', windowId: 1, tabIndex: 0, url: 'https://x.com', savedAt: 1000 },
      { floatingTabId: 'ft-y', groupId: 'g-1', parentItemId: 'item-Y', windowId: 1, tabIndex: 1, url: 'https://y.com', savedAt: 2000 },
    ],
  });

  __setMockTabs([
    { id: 100, url: 'https://x.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 200, url: 'https://y.com', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();

  /* Establish a claim on tab 100 (the X record's matched tab) — simulates
     a parent that was reconciled by URL match before reassociate ran. */
  await reconcileClaims([{ id: 'someClaimedItem', url: 'https://x.com', sortOrder: 0 }]);
  const claimsBefore = getClaimsMirror();
  assert.equal(claimsBefore['someClaimedItem'], 100);

  await reassociateFloatingGroups(getLiveTabIndex(), getClaimsMirror());

  const raw = __getRawStore('tj:floatingGroups');
  /* The X record's matched tab is claimed → pruned.
     The Y record's matched tab is unclaimed → retained. */
  assert.equal(raw.length, 1);
  assert.equal(raw[0].floatingTabId, 'ft-y');
});

test('AC11: three records with distinct windows + URLs all retained', async () => {
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-1', groupId: 'g-1', parentItemId: 'p-1', windowId: 1, tabIndex: 0, url: 'https://one.com', savedAt: 1000 },
      { floatingTabId: 'ft-2', groupId: 'g-2', parentItemId: 'p-2', windowId: 1, tabIndex: 1, url: 'https://two.com', savedAt: 1000 },
      { floatingTabId: 'ft-3', groupId: 'g-3', parentItemId: 'p-3', windowId: 1, tabIndex: 2, url: 'https://three.com', savedAt: 1000 },
    ],
  });

  __setMockTabs([
    { id: 10, url: 'https://one.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 20, url: 'https://two.com', windowId: 1, active: false, audible: false, index: 1 },
    { id: 30, url: 'https://three.com', windowId: 1, active: false, audible: false, index: 2 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  /* No claims written. All three records retained for runtime render. */
  assert.equal(Object.keys(getClaimsMirror()).length, 0);
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 3);
});
