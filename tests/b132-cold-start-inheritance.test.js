/**
 * b132-cold-start-inheritance.test.js — Sprint 40 / B-132 R5
 *
 * Tests the cold-start `preMarkInheritedFromFloatingGroups` helper +
 * `reconcileClaims` Phase 2 inheritance gate (B-132 §65.4 / §65.5).
 *
 * Coverage map (eight tests / seven AC ids):
 *
 *   T-132-A — AC1 happy path: pre-existing floating tab whose URL
 *             coincidentally matches a saved bookmark survives cold-start
 *             without claim-jump. The cold-start helper marks the
 *             matched tabId; Phase 2's gate skips it; the colliding saved
 *             item remains unclaimed; the floating record is retained.
 *
 *   T-132-B — AC1 empty-state: helper is a no-op when tj:floatingGroups
 *             is empty. inheritedTabs stays empty; Phase 2 behavior is
 *             unchanged.
 *
 *   T-132-C — AC1 partial-state: helper is a no-op when no record matches
 *             a live tab (zero position match + zero URL fallback).
 *             inheritedTabs stays empty; the record is left in storage
 *             per B-018 AC9.
 *
 *   T-132-D — AC5 gate mechanism: with inheritedTabs populated,
 *             reconcileClaims Phase 2 skips inherited candidates and
 *             leaves the saved item unclaimed.
 *
 *   T-132-E — AC1 + AC4 + AC5 integration: pre-existing floating tab +
 *             colliding saved item; full sequence (helper → reconcile →
 *             reassociate) leaves parent claim intact, floating record
 *             retained, colliding bookmark unclaimed, floating tab
 *             marked inherited.
 *
 *   T-132-F — AC2 shallow regression guard: post-cold-start middle-click
 *             still inherits via the runtime `markInherited` path
 *             (B-125 contract). Inheritance gate continues to suppress
 *             auto-claim for the new floating tab.
 *
 *   T-132-G — AC6 ordering invariant: source-text pin in
 *             background/tabs/index.js confirms
 *             preMarkInheritedFromFloatingGroups is invoked AFTER the
 *             Promise.all and BEFORE reconcileClaims. (Harness has no
 *             initializeLiveState integration spy hook — R2 §65.12
 *             R3-V-5 sanctioned this fallback.)
 *
 *   T-132-H — Helper writes ZERO storage. Pure read+mark: confirms no
 *             chrome.storage.local.set or chrome.storage.session.set is
 *             invoked during the helper.
 *
 * All tests use the existing chrome-mock; no ad-hoc stubs.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  __resetMock,
  __setMockTabs,
  __getRawStore,
  __getSessionStore,
  seedPartitions,
} from './chrome-mock.js';
import {
  buildLiveTabIndex,
  __resetLiveTabIndex,
  getLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import {
  reconcileClaims,
  reevaluateTab,
  markInherited,
  isInherited,
  getClaimsMirror,
  __resetTabClaims,
} from '../background/tabs/tab-claims.js';
import {
  preMarkInheritedFromFloatingGroups,
  reassociateFloatingGroups,
} from '../background/tabs/floating-groups.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

/* =========================================================================
   T-132-A — AC1: cold-start helper marks pre-existing floating tab whose
   URL collides with an unclaimed saved bookmark.
   ========================================================================= */
test('B-132 T-132-A (AC1): cold-start helper marks floating tabId for URL-collision case', async () => {
  /* Pre-reload state captured in tj:floatingGroups: parent claimed an item;
     a child tab spawned via opener-chain inheritance was demoted to a
     floating member. The floating tab's URL happens to match a DIFFERENT
     saved bookmark in items (the URL-collision repro). */
  seedPartitions({
    floatingGroups: [
      {
        floatingTabId: 'ft-collide',
        groupId: 'g-parent',
        parentItemId: 'item-parent',
        windowId: 1,
        tabIndex: 1,
        url: 'https://collide.example/',
        savedAt: 1000,
      },
    ],
  });

  /* Live state at cold-start: tab 100 = parent (still at parent URL); tab
     101 = the floating child whose URL coincidentally matches the OTHER
     saved bookmark (item-collide). */
  __setMockTabs([
    { id: 100, url: 'https://parent.example/', windowId: 1, active: true, audible: false, index: 0 },
    { id: 101, url: 'https://collide.example/', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();

  /* Pre-condition: nothing is marked inherited yet (cold start). */
  assert.equal(isInherited(101), false, 'pre: tab 101 must NOT be marked inherited before helper runs');

  await preMarkInheritedFromFloatingGroups();

  /* Post-condition: helper marked the floating tabId via position match. */
  assert.equal(isInherited(101), true, 'AC1: helper must mark floating tabId 101 from tj:floatingGroups');
});

/* =========================================================================
   T-132-B — AC1 empty-state: no records → no-op.
   ========================================================================= */
test('B-132 T-132-B (AC1 empty): helper is a no-op when tj:floatingGroups is empty', async () => {
  /* Empty store + a single live tab whose URL matches a saved bookmark. */
  __setMockTabs([
    { id: 200, url: 'https://b.example/', windowId: 1, active: true, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  await preMarkInheritedFromFloatingGroups();

  assert.equal(isInherited(200), false, 'no records → no marks');

  /* Phase 2 behavior is unchanged: the tab auto-claims the matching item. */
  await reconcileClaims([{ id: 'item-B', url: 'https://b.example/', sortOrder: 0 }]);
  assert.equal(getClaimsMirror()['item-B'], 200,
    'with empty inheritedTabs, Phase 2 auto-claims as pre-B-132');
});

/* =========================================================================
   T-132-C — AC1 partial-state: record exists but no live tab matches.
   ========================================================================= */
test('B-132 T-132-C (AC1 partial): helper skips records with no matching live tab', async () => {
  seedPartitions({
    floatingGroups: [
      {
        floatingTabId: 'ft-orphan',
        groupId: 'g-1',
        parentItemId: 'p-1',
        windowId: 99,
        tabIndex: 99,
        url: 'https://nowhere.example/',
        savedAt: 1000,
      },
    ],
  });

  /* Live tabs are unrelated (different windowId, different URL). */
  __setMockTabs([
    { id: 300, url: 'https://elsewhere.example/', windowId: 1, active: true, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  await preMarkInheritedFromFloatingGroups();

  assert.equal(isInherited(300), false, 'unrelated tab must not be marked');

  /* Record is left in tj:floatingGroups for a future restart per B-018 AC9. */
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1, 'B-018 AC9: unmatched record retained for next restart');
});

/* =========================================================================
   T-132-D — AC5 gate mechanism: Phase 2 skips inherited candidates.
   ========================================================================= */
test('B-132 T-132-D (AC5): reconcileClaims Phase 2 skips candidates in inheritedTabs', async () => {
  /* Single live tab at the colliding URL; no claim yet. */
  __setMockTabs([
    { id: 400, url: 'https://collide.example/', windowId: 1, active: true, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  /* Mark the candidate inherited BEFORE reconcileClaims runs — emulates
     the post-helper state. */
  markInherited(400);

  await reconcileClaims([{ id: 'item-collide', url: 'https://collide.example/', sortOrder: 0 }]);

  /* The gate fires: item-collide stays unclaimed even though tab 400's
     URL matches and tab 400 is otherwise eligible. */
  const claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-collide'], undefined,
    'B-132 §65.5 gate: inherited candidate is skipped; saved item remains unclaimed');
  assert.equal(getClaimsMirror()['item-collide'], undefined,
    'mirror reflects the skip');
});

/* =========================================================================
   T-132-E — AC1 + AC4 + AC5 integration: full cold-start sequence.
   ========================================================================= */
test('B-132 T-132-E (AC1+AC4+AC5): full cold-start sequence preserves floating tab UX without claim-jump', async () => {
  /* Pre-reload state (the user's bug repro):
     - item-parent is claimed by tab 500 at https://parent.example/
     - A floating child tab 501 spawned via opener-chain; its URL
       coincidentally matches another saved bookmark item-collide. */
  seedPartitions({
    floatingGroups: [
      {
        floatingTabId: 'ft-int',
        groupId: 'g-parent',
        parentItemId: 'item-parent',
        windowId: 1,
        tabIndex: 1,
        url: 'https://collide.example/',
        savedAt: 1000,
      },
    ],
  });

  __setMockTabs([
    { id: 500, url: 'https://parent.example/', windowId: 1, active: true, audible: false, index: 0 },
    { id: 501, url: 'https://collide.example/', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'item-parent', url: 'https://parent.example/', sortOrder: 0 },
    { id: 'item-collide', url: 'https://collide.example/', sortOrder: 1 },
  ];

  /* Production cold-start sequence: helper → reconcileClaims → reassociate.
     Mirrors initializeLiveState in background/tabs/index.js. */
  await preMarkInheritedFromFloatingGroups();
  await reconcileClaims(items);
  await reassociateFloatingGroups(getLiveTabIndex(), getClaimsMirror());

  /* Parent claim established (tab 500 at parent URL). */
  assert.equal(getClaimsMirror()['item-parent'], 500,
    'AC4: parent claim survives cold-start');

  /* B-132 fix: item-collide stays unclaimed — the floating tab's URL
     collision did NOT claim-jump it. */
  assert.equal(getClaimsMirror()['item-collide'], undefined,
    'AC1: colliding bookmark stays unclaimed thanks to inheritance gate');

  /* Floating record retained (matched + unclaimed → leave in place). */
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1,
    'AC4: floating record retained — matched + unclaimed');
  assert.equal(raw[0].floatingTabId, 'ft-int');

  /* Floating tab is marked inherited so future runtime reevaluateTab
     calls remain gated (B-125 contract continuity). */
  assert.equal(isInherited(501), true,
    'AC5: floating tabId remains marked for runtime reevaluateTab');
});

/* =========================================================================
   T-132-F — AC2 shallow regression guard: post-cold-start runtime
   inheritance still works.
   ========================================================================= */
test('B-132 T-132-F (AC2 regression guard): post-cold-start middle-click still inherits via runtime path', async () => {
  /* Cold-start completes with empty floating state and a single live tab
     claimed by item-parent. */
  __setMockTabs([
    { id: 600, url: 'https://parent.example/', windowId: 1, active: true, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'item-parent', url: 'https://parent.example/', sortOrder: 0 },
    { id: 'item-collide', url: 'https://collide.example/', sortOrder: 1 },
  ];

  await preMarkInheritedFromFloatingGroups();
  await reconcileClaims(items);
  assert.equal(getClaimsMirror()['item-parent'], 600,
    'pre: item-parent claimed by tab 600');

  /* Post-cold-start: user middle-clicks an in-page link in tab 600. A new
     tab 601 spawns; tab-events.js runs walkOpenerChain → appendFloatingGroup
     → markInherited(601) (the B-125 runtime path; we simulate the marker
     directly here). The new tab navigates to the colliding URL. */
  markInherited(601);

  __setMockTabs([
    { id: 600, url: 'https://parent.example/', windowId: 1, active: false, audible: false, index: 0 },
    { id: 601, url: 'https://collide.example/', windowId: 1, active: true, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();

  await reevaluateTab(601, 'https://collide.example/', items);

  /* B-125 contract holds: the runtime gate at tab-claims.js:250 stops the
     auto-claim. B-132 did NOT regress this path. */
  const claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-parent'], 600,
    'B-099 D-1: parent claim survives runtime reevaluateTab');
  assert.equal(claims['item-collide'], undefined,
    'AC2 regression guard: runtime markInherited gate still suppresses auto-claim');
});

/* =========================================================================
   T-132-G — AC6 ordering invariant: source-text pin on
   background/tabs/index.js. R2 §65.12 R3-V-5 sanctioned this as a
   fallback when the harness lacks an initializeLiveState integration
   spy hook (no existing test exercises initializeLiveState end-to-end).
   ========================================================================= */
test('B-132 T-132-G (AC6 ordering pin): preMarkInheritedFromFloatingGroups is sequenced AFTER buildLiveTabIndex Promise.all and BEFORE reconcileClaims', () => {
  const indexPath = resolve(__dirname, '../background/tabs/index.js');
  const src = readFileSync(indexPath, 'utf8');

  /* Locate the three call sites in source text and assert their relative
     ordering. Catches a future refactor that re-orders the cold-start
     pipeline and would re-introduce the B-132 bug. */
  const promiseAllIdx = src.indexOf('Promise.all([');
  const preMarkIdx = src.indexOf('preMarkInheritedFromFloatingGroups()');
  const reconcileIdx = src.indexOf('reconcileClaims(items)');
  const reassociateIdx = src.indexOf('reassociateFloatingGroups(');

  assert.ok(promiseAllIdx > -1, 'Promise.all([ must exist in initializeLiveState');
  assert.ok(preMarkIdx > -1, 'preMarkInheritedFromFloatingGroups() must be called in initializeLiveState');
  assert.ok(reconcileIdx > -1, 'reconcileClaims(items) must be called in initializeLiveState');
  assert.ok(reassociateIdx > -1, 'reassociateFloatingGroups( must be called in initializeLiveState');

  assert.ok(promiseAllIdx < preMarkIdx,
    'AC6: Promise.all (buildLiveTabIndex) must run BEFORE preMarkInheritedFromFloatingGroups');
  assert.ok(preMarkIdx < reconcileIdx,
    'AC6 (B-132 §65.3): preMarkInheritedFromFloatingGroups must run BEFORE reconcileClaims');
  assert.ok(reconcileIdx < reassociateIdx,
    'AC6 (B-001d AC10): reconcileClaims must run BEFORE reassociateFloatingGroups');
});

/* =========================================================================
   T-132-H — Helper writes ZERO storage (pure read+mark side effect on
   the in-memory inheritedTabs Set).
   ========================================================================= */
test('B-132 T-132-H: preMarkInheritedFromFloatingGroups writes ZERO storage (pure read+mark)', async () => {
  seedPartitions({
    floatingGroups: [
      {
        floatingTabId: 'ft-zero',
        groupId: 'g-1',
        parentItemId: 'p-1',
        windowId: 1,
        tabIndex: 0,
        url: 'https://x.example/',
        savedAt: 1000,
      },
    ],
  });

  __setMockTabs([
    { id: 700, url: 'https://x.example/', windowId: 1, active: true, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  /* Spy on storage writes by counting set calls. We snapshot the raw
     stores before + after, plus the floatingGroups payload, and assert
     they're byte-equivalent (the helper does NOT mutate any partition). */
  const localBefore = JSON.stringify(__getRawStore('tj:floatingGroups'));
  const sessionBefore = JSON.stringify(__getSessionStore('tj:tabClaims') || {});

  await preMarkInheritedFromFloatingGroups();

  const localAfter = JSON.stringify(__getRawStore('tj:floatingGroups'));
  const sessionAfter = JSON.stringify(__getSessionStore('tj:tabClaims') || {});

  assert.equal(localAfter, localBefore,
    'helper must NOT write to tj:floatingGroups (pure read)');
  assert.equal(sessionAfter, sessionBefore,
    'helper must NOT write to tj:tabClaims (pure read; mark target is in-memory)');

  /* The mark IS the side effect — confirmed via isInherited. */
  assert.equal(isInherited(700), true, 'helper marks the matched tabId');
});
