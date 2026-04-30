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
import { buildFloatingMembers } from '../background/tabs/floating-members.js';

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

/* =========================================================================
   B-137 §66.6 / R1 AC7 T1 — sibling-title displacement (post-S40 Issue 2).
   With v4 records carrying liveTabId, the resolver's tier (a) direct-match
   takes priority over tier (b) (windowId, tabIndex) match. A position-
   collision fixture — where tab 100's record is at (windowId 1, tabIndex 0)
   but tab 100 has been moved to a different position so a different tab
   (101) now occupies that cell — MUST resolve via liveTabId direct-match
   to tab 100, NOT to tab 101. Pre-B-137 this would misroute and the
   descriptor would carry tab 101's metadata.
   ========================================================================= */

test('B-137 §66.6 AC7 T1: tier (a) liveTabId direct-match wins over tier (b) position-match for v4 records (sibling-title-displacement regression pin)', async () => {
  /* Stored fixture: record A carries liveTabId 100 + (windowId 1, tabIndex 0).
     Live state: tab 100 has been moved to (windowId 1, tabIndex 5); tab 101
     now occupies (windowId 1, tabIndex 0) — the position cell that the
     stored record points at via tier (b). */
  seedPartitions({
    items: [
      { id: 'p-a', title: 'Parent A', url: 'https://parent-a.example', groupId: 'g-A',
        sortOrder: 0, createdAt: 1000, updatedAt: 1000 },
    ],
    groups: [
      { id: 'g-A', name: 'A', color: 'red', parentId: null, sortOrder: 0,
        collapsed: false, createdAt: 1000, updatedAt: 1000 },
    ],
    floatingGroups: [
      {
        floatingTabId: 'ft-A',
        groupId: 'g-A',
        parentItemId: 'p-a',
        windowId: 1,
        tabIndex: 0,        // STALE — tab 100 has since moved
        url: 'https://child-a.example',
        savedAt: 1000,
        liveTabId: 100,     // v4 — tier (a) direct-match key
      },
    ],
  });

  __setMockTabs([
    /* Tab 100 (the bound floating tab) is now at index 5. */
    { id: 100, url: 'https://child-a.example', title: 'CHILD-A', windowId: 1, active: false, audible: false, index: 5 },
    /* Tab 101 (a different tab) now occupies (windowId 1, tabIndex 0). */
    { id: 101, url: 'https://unrelated.example', title: 'UNRELATED', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  const items = [{ id: 'p-a', groupId: 'g-A' }];
  const members = await buildFloatingMembers(items);

  /* Tier (a) wins: descriptor MUST resolve to tab 100, NOT tab 101. */
  assert.ok(members['g-A'], 'g-A bucket must be populated');
  assert.equal(members['g-A'].length, 1, 'exactly one floating member');
  assert.equal(members['g-A'][0].tabId, 100,
    'B-137 tier (a) direct-tabId join wins — NOT the stale-position fallback');
  assert.equal(members['g-A'][0].title, 'CHILD-A',
    'descriptor carries the correct tab title (no sibling displacement)');
  assert.equal(members['g-A'][0].tabIndex, 5,
    'descriptor reflects the live tab\'s current index (not the stored stale tabIndex)');
});

test('B-137 §66.6: tier (a) skipped when record.liveTabId is not in liveIndex (cross-restart stale id) → falls back to position match', async () => {
  /* Stored fixture: record carries liveTabId 999 (a stale id from a
     previous SW session). The live index has no tab 999 but does have
     tab 50 at (windowId 1, tabIndex 0) — the stored position cell.
     The tier (a) liveIndex.has(999) guard returns false → tier (b)
     position match resolves to tab 50. */
  seedPartitions({
    items: [
      { id: 'p-stale', title: 'Parent', url: 'https://parent.example', groupId: 'g-stale',
        sortOrder: 0, createdAt: 1000, updatedAt: 1000 },
    ],
    groups: [
      { id: 'g-stale', name: 'Stale', color: 'red', parentId: null, sortOrder: 0,
        collapsed: false, createdAt: 1000, updatedAt: 1000 },
    ],
    floatingGroups: [
      {
        floatingTabId: 'ft-stale',
        groupId: 'g-stale',
        parentItemId: 'p-stale',
        windowId: 1,
        tabIndex: 0,
        url: 'https://child.example',
        savedAt: 1000,
        liveTabId: 999,     // STALE — no tab 999 in this session
      },
    ],
  });

  __setMockTabs([
    { id: 50, url: 'https://child.example', title: 'CHILD', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  const items = [{ id: 'p-stale', groupId: 'g-stale' }];
  const members = await buildFloatingMembers(items);

  /* Tier (a) misses (liveIndex.has(999) === false); tier (b) resolves
     via (windowId 1, tabIndex 0) → tab 50. */
  assert.ok(members['g-stale'], 'bucket populated via legacy fallback');
  assert.equal(members['g-stale'].length, 1);
  assert.equal(members['g-stale'][0].tabId, 50,
    'tier (b) position fallback resolves when tier (a) liveTabId is stale');
});

test('B-137 §66.6: legacy v3 record (no liveTabId) resolves via tier (b) position match — backward compat', async () => {
  /* Pure v3 fixture — no liveTabId field. The 3-tier join must skip tier
     (a) entirely and resolve via tier (b). This verifies legacy data
     continues to render correctly (lazy migration tolerance). */
  seedPartitions({
    items: [
      { id: 'p-v3', title: 'Parent v3', url: 'https://parent-v3.example', groupId: 'g-v3',
        sortOrder: 0, createdAt: 1000, updatedAt: 1000 },
    ],
    groups: [
      { id: 'g-v3', name: 'V3', color: 'red', parentId: null, sortOrder: 0,
        collapsed: false, createdAt: 1000, updatedAt: 1000 },
    ],
    floatingGroups: [
      {
        floatingTabId: 'ft-v3',
        groupId: 'g-v3',
        parentItemId: 'p-v3',
        windowId: 1,
        tabIndex: 2,
        url: 'https://child-v3.example',
        savedAt: 1000,
        /* deliberately no liveTabId — legacy v3 record */
      },
    ],
  });

  __setMockTabs([
    { id: 70, url: 'https://child-v3.example', title: 'CHILD-V3', windowId: 1, active: false, audible: false, index: 2 },
  ]);
  await buildLiveTabIndex();

  const items = [{ id: 'p-v3', groupId: 'g-v3' }];
  const members = await buildFloatingMembers(items);

  assert.ok(members['g-v3'], 'legacy v3 bucket populated via tier (b)');
  assert.equal(members['g-v3'].length, 1);
  assert.equal(members['g-v3'][0].tabId, 70,
    'legacy v3 record resolves via tier (b) position match');
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
