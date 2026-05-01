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

/* B-132 §65.10: this test invokes reconcileClaims DIRECTLY without
   preMarkInheritedFromFloatingGroups (the cold-start helper added for
   B-132 in background/tabs/floating-groups.js). In production,
   initializeLiveState always pre-marks inherited tabs before reconcile,
   so this exact "URL collision + unclaimed → claim-jump" sequence does
   not arise. The test pins the unit-level reconcileClaims+reassociate
   contract for the no-inheritance case, which is still load-bearing for
   non-floating tabs (the gate's empty-set behavior is what's pinned —
   still TRUE post-fix). T-132-F in tests/b132-cold-start-inheritance.test.js
   pins the integrated cold-start behavior with the helper applied. */
/* =========================================================================
   B-137 §66.7 — reassociateFloatingGroups lazy-rewrites liveTabId onto
   matched-unclaimed legacy v3 records. Subsequent reads use tier (a) direct-
   match. The rewrite piggybacks on the existing pruneResolvedFloatingGroups
   writeTransaction (single atomic write).
   ========================================================================= */

test('B-137 §66.7 AC5: reassociateFloatingGroups lazy-rewrites liveTabId onto matched-unclaimed v3 records', async () => {
  /* Seed a legacy v3 record (no liveTabId) that resolves via tier (b)
     (windowId, tabIndex). After reassociate runs, the record's liveTabId
     should equal the resolved tabId. */
  seedPartitions({
    floatingGroups: [
      {
        floatingTabId: 'ft-lazy-rewrite',
        groupId: 'g-1',
        parentItemId: 'p-1',
        windowId: 1,
        tabIndex: 0,
        url: 'https://lazy.example',
        savedAt: 1000,
        /* deliberately no liveTabId — v3 legacy record */
      },
    ],
  });

  __setMockTabs([
    { id: 555, url: 'https://lazy.example', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  /* Record retained (matched + unclaimed) AND lazy-rewritten with liveTabId. */
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1, 'matched-unclaimed legacy record retained');
  assert.equal(raw[0].floatingTabId, 'ft-lazy-rewrite', 'storage identity preserved');
  assert.equal(raw[0].liveTabId, 555,
    'B-137 §66.7 — legacy v3 record lazy-rewritten with resolved tabId');
});

test('B-137 §66.7: reassociateFloatingGroups rewrites stale liveTabId on v4 records when tier (b) resolves to a different tab', async () => {
  /* Seed a v4 record with a stale liveTabId (999 — not in liveIndex).
     Position match via tier (b) resolves to tab 42. The lazy-rewrite
     must replace the stale liveTabId with the resolved one. */
  seedPartitions({
    floatingGroups: [
      {
        floatingTabId: 'ft-stale-v4',
        groupId: 'g-1',
        parentItemId: 'p-1',
        windowId: 1,
        tabIndex: 0,
        url: 'https://stale.example',
        savedAt: 1000,
        liveTabId: 999,    // STALE — no tab 999 in this session
      },
    ],
  });

  __setMockTabs([
    { id: 42, url: 'https://stale.example', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1);
  assert.equal(raw[0].liveTabId, 42, 'stale liveTabId rewritten to the resolved id');
});

test('B-137 §66.7: reassociateFloatingGroups leaves v4 records untouched when liveTabId already matches the resolved tab', async () => {
  /* v4 record with a correct liveTabId. Tier (a) matches; no rewrite
     needed; storage byte-equivalent. */
  seedPartitions({
    floatingGroups: [
      {
        floatingTabId: 'ft-v4-ok',
        groupId: 'g-1',
        parentItemId: 'p-1',
        windowId: 1,
        tabIndex: 0,
        url: 'https://ok.example',
        savedAt: 1000,
        liveTabId: 88,    // matches tab 88 below
      },
    ],
  });

  __setMockTabs([
    { id: 88, url: 'https://ok.example', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  const before = JSON.stringify(__getRawStore('tj:floatingGroups'));
  await reassociateFloatingGroups(getLiveTabIndex(), {});
  const after = JSON.stringify(__getRawStore('tj:floatingGroups'));

  assert.equal(after, before, 'no rewrite when liveTabId already correct');
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
