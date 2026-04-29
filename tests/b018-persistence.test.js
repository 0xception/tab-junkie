/**
 * b018-persistence.test.js — B-018 floating-group persistence regression
 *                            (B-121 §60.4 contract update).
 *
 * Post-S38 contract:
 *   - reassociateFloatingGroups does NOT call claimTabForItem.
 *   - Records whose matched tab is unclaimed remain in storage and surface
 *     at runtime via buildFloatingMembers (covered in
 *     b121-floating-group-render.test.js).
 *   - Records whose matched tab is ALREADY claimed (the tab has been
 *     promoted to a saved item since shutdown) are pruned from
 *     tj:floatingGroups.
 *   - Records with no matching live tab are left in place per AC9.
 *   - The legacy `itemId` field is renamed to `parentItemId`; both forms
 *     are tolerated on read for forward-compat with pre-S38 records.
 *
 * Coverage:
 *   GAP-1: orphan guard (record without parentItemId / itemId is invalid
 *          and either fails write or is left untouched on read).
 *   GAP-2: cold-start integration sequence — reassociate prunes records
 *          whose tab is already claimed via reconcileClaims, leaves the
 *          rest in place.
 *   AC7-NEW: parent's existing claim from reconcileClaims is NEVER
 *            overwritten by reassociateFloatingGroups (§58.4(i) latent
 *            defect closed).
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetMock,
  __setMockTabs,
  __getRawStore,
  seedPartitions,
} from './chrome-mock.js';
import {
  buildLiveTabIndex,
  __resetLiveTabIndex,
  getLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import {
  __resetTabClaims,
  getClaimsMirror,
  reconcileClaims,
} from '../background/tabs/tab-claims.js';
import {
  reassociateFloatingGroups,
  appendFloatingGroup,
} from '../background/tabs/floating-groups.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

// ---------------------------------------------------------------------------
// GAP-1: Orphan guard — records without parentItemId / itemId
// ---------------------------------------------------------------------------

test('GAP-1: appendFloatingGroup rejects entries without parentItemId or itemId', async () => {
  await appendFloatingGroup({
    groupId: 'g-orphan',
    // no parentItemId / itemId
    windowId: 1,
    tabIndex: 0,
    url: 'https://orphan.com',
    savedAt: 1000,
  });

  const raw = __getRawStore('tj:floatingGroups');
  // Storage may be undefined or an empty array depending on initialization.
  assert.ok(!raw || raw.length === 0, 'Orphan entry must not be persisted');
});

test('GAP-1: legacy itemId-bearing record on read does NOT crash reassociate', async () => {
  // Pre-S38 record (uses legacy `itemId` instead of `parentItemId`)
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-legacy', itemId: 'item-legacy', windowId: 1, tabIndex: 0, url: 'https://legacy.com', savedAt: 1000 },
    ],
  });

  __setMockTabs([
    { id: 10, url: 'https://legacy.com', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  // Reassociate with empty existing claims — record is matched + unclaimed
  // → should remain in storage (runtime path will surface it as a
  // floating-tab member).
  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const claims = getClaimsMirror();
  assert.equal(Object.keys(claims).length, 0, 'Reassociate must NOT write any claim');

  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1, 'Matched-unclaimed record retained for runtime render');
  assert.equal(raw[0].itemId, 'item-legacy');
});

// ---------------------------------------------------------------------------
// GAP-2: Cold-start integration — matched-claimed records are pruned
// ---------------------------------------------------------------------------

test('GAP-2: reassociateFloatingGroups prunes records whose matched tab is already claimed', async () => {
  // Cold start state: parent saved item P is claimed by reconcileClaims
  // (URL match), and tj:floatingGroups also contains a record pointing at
  // the same parent / same tab (a stale record that should be pruned).
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-stale', groupId: 'g-1', parentItemId: 'item-P', windowId: 1, tabIndex: 0, url: 'https://parent.com', savedAt: 1000 },
    ],
  });
  __setMockTabs([
    { id: 100, url: 'https://parent.com', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  // reconcileClaims establishes P → 100
  await reconcileClaims([{ id: 'item-P', url: 'https://parent.com', sortOrder: 0 }]);

  // Now run reassociate with the populated claims
  await reassociateFloatingGroups(getLiveTabIndex(), getClaimsMirror());

  const claims = getClaimsMirror();
  assert.equal(claims['item-P'], 100, 'Parent claim from reconcileClaims preserved');

  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 0, 'Stale record (matched + already claimed) must be pruned');
});

test('GAP-2: matched-and-unclaimed records remain in storage for runtime render', async () => {
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-1', groupId: 'g-1', parentItemId: 'item-P', windowId: 1, tabIndex: 0, url: 'https://child.com', savedAt: 1000 },
    ],
  });
  __setMockTabs([
    { id: 200, url: 'https://child.com', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  // No reconcileClaims call — claimsMirror is empty, child.com tab is unclaimed.
  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const claims = getClaimsMirror();
  assert.equal(Object.keys(claims).length, 0, 'No claims written by reassociate');

  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1, 'Matched-unclaimed record retained');
  assert.equal(raw[0].floatingTabId, 'ft-1');
});

test('GAP-2: records with no matching live tab are retained per AC9', async () => {
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-pos', groupId: 'g-1', parentItemId: 'item-P', windowId: 1, tabIndex: 0, url: 'https://gone.com', savedAt: 1000 },
    ],
  });
  __setMockTabs([
    { id: 50, url: 'https://other.com', windowId: 9, active: false, audible: false, index: 5 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1, 'Unmatched record must be retained for future restart');
});

// ---------------------------------------------------------------------------
// AC7-NEW: parent's claim is NEVER overwritten by reassociateFloatingGroups
// ---------------------------------------------------------------------------

test('AC7-NEW: parent claim from reconcileClaims is preserved when a child floating record exists', async () => {
  // Seed: parent item P is reconciled to T_parent. A floating-group record
  // points at the same parent (parentItemId = item-P) but its position
  // resolves to a DIFFERENT live tab (T_child) which is unclaimed.
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-child', groupId: 'g-1', parentItemId: 'item-P', windowId: 1, tabIndex: 1, url: 'https://child.example/q', savedAt: 1000 },
    ],
  });
  __setMockTabs([
    { id: 300, url: 'https://parent.example/p', windowId: 1, active: false, audible: false, index: 0 },
    { id: 400, url: 'https://child.example/q', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();

  // Establish the parent claim via reconcileClaims (URL match)
  await reconcileClaims([{ id: 'item-P', url: 'https://parent.example/p', sortOrder: 0 }]);
  assert.equal(getClaimsMirror()['item-P'], 300, 'pre-condition: parent claimed to T_parent');

  // Run reassociation
  await reassociateFloatingGroups(getLiveTabIndex(), getClaimsMirror());

  // POST: parent's claim is unchanged (the §58.4(i) defect would have
  // overwritten it with T_child = 400)
  assert.equal(getClaimsMirror()['item-P'], 300, 'AC7: parent claim preserved');

  // POST: floating-group record retained (T_child is alive and unclaimed)
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1, 'Matched-unclaimed record retained for runtime render');
  assert.equal(raw[0].floatingTabId, 'ft-child');
});

// ---------------------------------------------------------------------------
// Integration: appendFloatingGroup + cold-start replay round-trip
// ---------------------------------------------------------------------------

test('Integration: append + reassociate (matched + unclaimed) keeps record in storage', async () => {
  await appendFloatingGroup({
    groupId: 'g-int',
    parentItemId: 'item-int',
    windowId: 1,
    tabIndex: 0,
    url: 'https://integration.example',
    savedAt: 1000,
  });

  __setMockTabs([
    { id: 5, url: 'https://integration.example', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1, 'Record retained after reassociate (unclaimed match)');
  assert.equal(raw[0].parentItemId, 'item-int');
  assert.equal(typeof raw[0].floatingTabId, 'string', 'append stamps floatingTabId');
});
