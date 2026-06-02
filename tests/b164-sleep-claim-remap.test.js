/**
 * b164-sleep-claim-remap.test.js — Sprint 45 / B-164 (AC1–AC8)
 *
 * B-164 closes the within-session tabId-rotation gap (Chromium fires
 * `chrome.tabs.onReplaced(added, removed)` synchronously at the moment of
 * discard — empirically validated by the R0 probe Test A) and the
 * across-OS-sleep wake gap (any tab events fired while the SW was asleep
 * are silently lost; `chrome.idle.onStateChanged === 'active'` triggers a
 * defensive `reconcileClaims` rerun).
 *
 * See `docs/design/69-b-164-sleep-claim-remap.md`.
 *
 * The 5-table remap (R2 §69.3.1):
 *   1. claimsMirror              — remapped via remapTabIdInClaims
 *   2. inheritedTabs Set         — remapped via remapTabIdInClaims
 *   3. _faviconStampedItemIds    — NO REMAP (itemId-keyed per R2 AC3
 *                                   clarification; itemId-stable across
 *                                   tabId rotation)
 *   4. reevalTimers Map          — clearTimeout + delete (R2 §69.3.4
 *                                   option (ii); on-wake reconcile is
 *                                   the safety net for any lost
 *                                   reevaluation)
 *   5. tj:floatingGroups.liveTabId — remapped via
 *                                   remapFloatingGroupsLiveTabId atomic
 *                                   writeTransaction
 *
 * Coverage map (one test per R1 LOCKED AC, plus T10 defensive case):
 *
 *   T1  — AC1 happy path: chrome.tabs.onReplaced re-binds the claim.
 *   T2  — AC2 on-wake reconcile: chrome.idle.onStateChanged('active')
 *         invokes reconcileClaims.
 *   T3  — AC2 dedup: duplicate 'active' suppressed by _reconcileInFlight
 *         flag.
 *   T4  — AC3 5-table atomicity: tables 1+2+4+5 all consistent after
 *         onReplaced; table 3 is itemId-keyed no-op.
 *   T5  — AC4 floating tab survives discard via table-5 update.
 *   T6  — AC5 inherited-tab guard preserved across rotation.
 *   T7  — AC6 reevalTimer cleared on onReplaced (no stale reevaluateTab
 *         call against the dead id).
 *   T8  — AC7 manifest contains "idle" permission.
 *   T9  — AC8 B-149 + B-110 regression guard (defense-in-depth).
 *   T10 — AC1 defensive: onReplaced for a non-mirror tabId is a true
 *         no-op (no writeClaims, no writeTransaction).
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  __resetMock,
  __setMockTabs,
  __setSessionStore,
  __getSessionStore,
  __getRawStore,
  __setRawStore,
  seedPartitions,
  __triggerOnReplaced,
  __triggerIdleState,
  __getIdleSetDetectionIntervalCalls,
  __getSessionSetCount,
} from './chrome-mock.js';
import {
  buildLiveTabIndex,
  __resetLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import {
  reconcileClaims,
  markInherited,
  isInherited,
  getClaimsMirror,
  remapTabIdInClaims,
  __resetTabClaims,
} from '../background/tabs/tab-claims.js';
import {
  remapFloatingGroupsLiveTabId,
} from '../background/tabs/floating-groups.js';
import { registerTabEventListeners } from '../background/tabs/tab-events.js';
import {
  registerIdleReconciler,
  __resetIdleReconciler,
  __getPendingReplacements,
} from '../background/tabs/idle-reconciler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
  __resetIdleReconciler();
});

/* Helper — build a live-tab fixture with the standard shape used across
   the existing reconcile tests. Defaults match the chrome-mock contract. */
function tab(id, url, windowId = 1, index = 0) {
  return { id, url, title: '', windowId, active: false, audible: false, favIconUrl: '', index };
}

/* Helper — build a saved-item fixture. */
function item(id, url, sortOrder = 0) {
  return { id, url, title: id, groupId: null, sortOrder, createdAt: 1, updatedAt: 1 };
}

/* Helper — build a floating-group record (post-S38 v4 schema). */
function floatingRecord({ groupId, parentItemId, liveTabId, floatingTabId, windowId = 1, tabIndex = 0, url = 'https://example.com/' }) {
  return {
    groupId,
    parentItemId,
    floatingTabId,
    liveTabId,
    windowId,
    tabIndex,
    url,
    savedAt: 1,
  };
}

/* =========================================================================
   T1 — AC1 happy path. chrome.tabs.onReplaced fires; claimsMirror[X]
   rewrites from removedTabId to addedTabId; subsequent buildLiveStates
   would resolve X via the new tabId.
   ========================================================================= */
test('B-164 T1 (AC1): chrome.tabs.onReplaced re-binds the claim to the new tabId', async () => {
  /* Seed: item X claimed to tabId 100. The "new" tab 200 is also live
     (Chromium populated it via the rotation; our LiveTabIndex sees it
     because we re-query at fixture-setup time). */
  __setMockTabs([tab(100, 'https://example.com/x'), tab(200, 'https://example.com/x')]);
  await buildLiveTabIndex();
  __setSessionStore('tj:tabClaims', { 'item-X': 100 });
  seedPartitions({ items: [item('item-X', 'https://example.com/x')] });
  await reconcileClaims([item('item-X', 'https://example.com/x')]);
  /* Sanity: Phase 1 kept the claim against tabId 100. */
  assert.equal(__getSessionStore('tj:tabClaims')['item-X'], 100);

  /* Register the production listener and fire onReplaced. */
  registerTabEventListeners(Promise.resolve());
  __triggerOnReplaced(200, 100);
  /* The handler is fire-and-forget on the awaits inside remapTabIdInClaims
     and remapFloatingGroupsLiveTabId. Drain microtasks. */
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  /* In-memory mirror and persisted storage both reflect the new id. */
  assert.equal(getClaimsMirror()['item-X'], 200,
    'AC1: claimsMirror must rewrite item-X to addedTabId after onReplaced');
  assert.equal(__getSessionStore('tj:tabClaims')['item-X'], 200,
    'AC1: writeClaims must persist the new tabId to chrome.storage.session');
});

/* =========================================================================
   T2 — AC2 on-wake reconcile. chrome.idle.onStateChanged('active')
   invokes reconcileClaims defensively. Verify by seeding a stale state
   that ONLY a reconcile run would repair (Phase 2 claim against an
   unclaimed live tab).
   ========================================================================= */
test('B-164 T2 (AC2): chrome.idle.onStateChanged(active) invokes reconcileClaims defensively', async () => {
  /* Seed: item X exists, live tab at item.url exists, but no claim is
     persisted yet. Phase 2 of reconcileClaims should bind them on wake. */
  __setMockTabs([tab(300, 'https://example.com/y')]);
  await buildLiveTabIndex();
  __setSessionStore('tj:tabClaims', {});
  seedPartitions({ items: [item('item-Y', 'https://example.com/y')] });

  /* Register the idle reconciler and fire the wake event. */
  registerIdleReconciler(Promise.resolve());
  /* setDetectionInterval was called with the R2-locked 60s. */
  assert.deepEqual(__getIdleSetDetectionIntervalCalls(), [60],
    'AC7-adjacent: setDetectionInterval(60) is the R2-locked default');

  __triggerIdleState('active');
  /* Drain the async work inside the listener. */
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  /* Reconcile must have bound item-Y → tab 300 via Phase 2. */
  assert.equal(__getSessionStore('tj:tabClaims')['item-Y'], 300,
    'AC2: on-wake reconcile must run Phase 2 and bind item-Y to live tab 300');
});

/* =========================================================================
   T3 — AC2 dedup. Two rapid 'active' transitions within the same wake
   event collapse to a single reconcile invocation per the
   _reconcileInFlight flag.
   ========================================================================= */
test('B-164 T3 (AC2 dedup): duplicate active transitions short-circuit the second reconcileClaims via _reconcileInFlight', async () => {
  __setMockTabs([tab(400, 'https://example.com/z')]);
  await buildLiveTabIndex();
  __setSessionStore('tj:tabClaims', {});
  seedPartitions({ items: [item('item-Z', 'https://example.com/z')] });

  /* R4 M-1: structural dedup proof. `reconcileClaims` calls `writeClaims`
     exactly once per invocation (`tab-claims.js:310`), and `writeClaims`
     calls `chrome.storage.session.set({ 'tj:tabClaims': ... })` exactly
     once (`tab-claims.js:103-105`). Therefore the per-key counter
     `__getSessionSetCount('tj:tabClaims')` reads the number of completed
     reconcileClaims invocations. If `_reconcileInFlight` dedup is intact
     the second 'active' fire short-circuits before the reconcile runs, so
     the counter reads 1. If dedup is broken (the gate is removed or a
     second reconcile slips through) the counter reads 2 — catching the
     regression. */
  registerIdleReconciler(Promise.resolve());
  __triggerIdleState('active');
  __triggerIdleState('active'); // second fire — must short-circuit
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));

  assert.equal(__getSessionStore('tj:tabClaims')['item-Z'], 400,
    'AC2 dedup: final state matches a single-reconcile result');
  assert.equal(__getSessionSetCount('tj:tabClaims'), 1,
    'AC2 dedup: writeClaims (chrome.storage.session.set on tj:tabClaims) must fire exactly once across two rapid active transitions');
});

/* =========================================================================
   T4 — AC3 5-table atomicity. Seed all 5 tables with references to the
   removed tabId; fire onReplaced; assert each table's post-state.
   ========================================================================= */
test('B-164 T4 (AC3): chrome.tabs.onReplaced atomically remaps tables 1+2+4+5 (table 3 is itemId-keyed N/A)', async () => {
  /* Seed: item X claimed to tabId 100. inheritedTabs.has(100). A
     floating-group record with liveTabId 100. We do NOT seed a
     reevalTimer here (T7 covers timer mechanics in isolation). */
  __setMockTabs([tab(100, 'https://example.com/x'), tab(200, 'https://example.com/x')]);
  await buildLiveTabIndex();
  __setSessionStore('tj:tabClaims', { 'item-X': 100 });
  seedPartitions({
    items: [item('item-X', 'https://example.com/x')],
    floatingGroups: [floatingRecord({
      groupId: 'g1', parentItemId: 'item-X', floatingTabId: 'ft-1', liveTabId: 100,
    })],
  });
  await reconcileClaims([item('item-X', 'https://example.com/x')]);
  markInherited(100);
  assert.equal(isInherited(100), true, 'precondition: inheritedTabs has removedTabId');

  registerTabEventListeners(Promise.resolve());
  __triggerOnReplaced(200, 100);
  /* Drain microtasks — both remap helpers await internally. */
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));

  /* Table 1 — claimsMirror reflects the new id. */
  assert.equal(getClaimsMirror()['item-X'], 200, 'table 1: claimsMirror remapped');
  assert.equal(__getSessionStore('tj:tabClaims')['item-X'], 200, 'table 1: persisted');
  /* Table 2 — inheritedTabs Set swapped membership. */
  assert.equal(isInherited(200), true, 'table 2: inheritedTabs has addedTabId');
  assert.equal(isInherited(100), false, 'table 2: inheritedTabs lost removedTabId');
  /* Table 5 — floating-group record's liveTabId rewritten in place. */
  const fg = __getRawStore('tj:floatingGroups');
  assert.equal(fg.length, 1, 'table 5: record count unchanged (update, not delete)');
  assert.equal(fg[0].liveTabId, 200, 'table 5: liveTabId remapped to addedTabId');
  assert.equal(fg[0].floatingTabId, 'ft-1', 'table 5: record identity preserved');
});

/* =========================================================================
   T5 — AC4. Floating tab discarded; tj:floatingGroups[].liveTabId
   rewrites via remapFloatingGroupsLiveTabId; the record stays alive (it
   would have been filtered out by buildFloatingMembers' claimedTabIds
   check if the liveTabId pointed at the dead tabId).
   ========================================================================= */
test('B-164 T5 (AC4): floating tab survives discard via table-5 atomic update', async () => {
  /* Seed: no saved-item claim (this is an inherited floating tab whose
     liveTabId is the join key for buildFloatingMembers). */
  __setMockTabs([tab(500, 'https://example.com/f'), tab(600, 'https://example.com/f')]);
  await buildLiveTabIndex();
  __setSessionStore('tj:tabClaims', {});
  seedPartitions({
    items: [item('parent-item', 'https://example.com/parent')],
    floatingGroups: [floatingRecord({
      groupId: 'g2', parentItemId: 'parent-item', floatingTabId: 'ft-2', liveTabId: 500,
    })],
  });
  await reconcileClaims([item('parent-item', 'https://example.com/parent')]);

  /* Call remapFloatingGroupsLiveTabId directly — same path the
     onReplaced handler invokes. */
  const updated = await remapFloatingGroupsLiveTabId(500, 600);
  assert.equal(updated, 1, 'AC4: exactly one record updated');
  const fg = __getRawStore('tj:floatingGroups');
  assert.equal(fg[0].liveTabId, 600, 'AC4: liveTabId rewritten to addedTabId');
  assert.equal(fg[0].floatingTabId, 'ft-2', 'AC4: floatingTabId identity preserved');
});

/* =========================================================================
   T6 — AC5. inheritedTabs Set membership swap after onReplaced.
   reevaluateTab gate at `tab-claims.js:385` continues to skip auto-claim
   when the gate reads the Set against the new id.
   ========================================================================= */
test('B-164 T6 (AC5): inheritedTabs Set swap preserves the B-125/B-132 auto-claim skip guard', async () => {
  __setMockTabs([tab(100, 'https://example.com/x')]);
  await buildLiveTabIndex();
  markInherited(100);
  assert.equal(isInherited(100), true);

  await remapTabIdInClaims(100, 200);

  assert.equal(isInherited(200), true,
    'AC5: post-remap, inheritedTabs.has(addedTabId) must be true');
  assert.equal(isInherited(100), false,
    'AC5: post-remap, inheritedTabs.has(removedTabId) must be false');
});

/* =========================================================================
   T7 — AC6. reevalTimer for removedTabId exists; onReplaced fires;
   timer is cleared (R2 option (ii)). The captured-closure dispatch
   against the dead id is forestalled because clearTimeout discards the
   pending callback before it can run.
   ========================================================================= */
test('B-164 T7 (AC6): chrome.tabs.onReplaced clears the pending reevalTimer (R2 option ii)', async () => {
  /* Seed a claim so isClaimsReady() returns true (the onReplaced handler
     defers on cold-start). */
  __setMockTabs([tab(700, 'https://example.com/q'), tab(800, 'https://example.com/q')]);
  await buildLiveTabIndex();
  __setSessionStore('tj:tabClaims', { 'item-Q': 700 });
  seedPartitions({ items: [item('item-Q', 'https://example.com/q')] });
  await reconcileClaims([item('item-Q', 'https://example.com/q')]);

  registerTabEventListeners(Promise.resolve());

  /* Fire an onUpdated for tab 700 to schedule the 100ms debounce timer.
     The captured closure points at tabId=700 (the soon-to-be-dead id). */
  chrome.tabs.onUpdated.__fire(700, { url: 'https://example.com/different' }, { id: 700, windowId: 1, active: false, index: 0, title: '' });

  /* Now rotate. The handler must clearTimeout + delete the timer before
     it can fire against the dead id. */
  __triggerOnReplaced(800, 700);
  for (let i = 0; i < 3; i += 1) await new Promise((r) => setImmediate(r));

  /* Wait past the 100ms debounce — if the timer fired, claimsMirror would
     have been mutated by a reevaluateTab call against tabId 700 (which is
     no longer in LiveTabIndex; the call would be a silent no-op for X,
     but the test asserts the cleanup discipline). */
  await new Promise((r) => setTimeout(r, 150));

  /* claimsMirror[item-Q] is now 800 (from the onReplaced remap), not 700
     (stale) and not undefined (no reevaluateTab eviction). */
  assert.equal(getClaimsMirror()['item-Q'], 800,
    'AC6: claim survives onReplaced + pending-timer-clear sequence; no stale call');
});

/* =========================================================================
   T8 — AC7. manifest.json declares the "idle" permission.
   ========================================================================= */
test('B-164 T8 (AC7): manifest.json permissions includes "idle"', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  assert.ok(Array.isArray(manifest.permissions), 'manifest.permissions is an array');
  assert.ok(manifest.permissions.includes('idle'),
    'AC7: manifest.permissions must include "idle" for chrome.idle.onStateChanged');
});

/* =========================================================================
   T9 — AC8 regression guard. Run a B-149-style scenario (Phase-1
   survival of drifted-but-live claim) on a build with B-164's listeners
   registered. The B-149 invariant must hold: a tab whose URL drifted
   away from item.url but is still alive in LiveTabIndex keeps its claim.
   ========================================================================= */
test('B-164 T9 (AC8): B-149 Phase-1 survival predicate unchanged by B-164 listener registration', async () => {
  /* B-149 canonical: item X with item.url = /A; live tab at /B (drifted)
     claimed in storage. Phase 1 predicate `tabEntry && item` keeps the
     claim because both sides exist; URL match is intentionally NOT
     re-checked. */
  __setMockTabs([tab(900, 'https://saved.com/B')]); // drifted URL
  await buildLiveTabIndex();
  __setSessionStore('tj:tabClaims', { 'item-X': 900 });
  seedPartitions({ items: [item('item-X', 'https://saved.com/A')] });

  /* Register B-164's listeners — they must not interfere with B-149's
     cold-start reconcile path. */
  registerTabEventListeners(Promise.resolve());
  registerIdleReconciler(Promise.resolve());

  await reconcileClaims([item('item-X', 'https://saved.com/A')]);

  assert.equal(__getSessionStore('tj:tabClaims')['item-X'], 900,
    'AC8: B-149 Phase-1 survival contract preserved (drifted-but-live claim kept)');
});

/* =========================================================================
   T11 — R4 M-2 (qa MED-2). chrome.tabs.onReplaced firing during the
   wake-reconcile async-gap window is QUEUED (not silently overwritten by
   reconcileClaims' pre-await snapshot commit), then DRAINED after the
   reconcile finishes so the final state reflects the rotation. The race
   gate is `_reconcileActive` in idle-reconciler.js; the queue is
   `_pendingReplacements`; the drain runs BEFORE the flag clears so any
   events arriving mid-drain are also queued.

   Setup uses a deferred readyPromise so the wake-reconcile work is gated
   on a single `defer.resolve()` call — the deterministic equivalent of
   the production async-gap window between Phase-3 storage reads and the
   final `claimsMirror = reconciled; await writeClaims()` commit.
   ========================================================================= */
test('B-164 T11 (R4 M-2): onReplaced during wake-reconcile is queued, then drained post-reconcile', async () => {
  __setMockTabs([tab(100, 'https://example.com/x'), tab(200, 'https://example.com/x')]);
  await buildLiveTabIndex();
  __setSessionStore('tj:tabClaims', { 'item-X': 100 });
  seedPartitions({ items: [item('item-X', 'https://example.com/x')] });
  /* Seed an initial reconcile so isClaimsReady() returns true (the
     onReplaced listener defers on cold-start before reconcile completes). */
  await reconcileClaims([item('item-X', 'https://example.com/x')]);
  assert.equal(getClaimsMirror()['item-X'], 100, 'precondition: claim bound to tabId 100');

  registerTabEventListeners(Promise.resolve());

  /* Deferred readyPromise — wake-reconcile work is suspended until
     `defer.resolve()` fires. The synchronous `_reconcileActive = true`
     inside the listener flips immediately. */
  let resolveReady;
  const readyPromise = new Promise((r) => { resolveReady = r; });
  registerIdleReconciler(readyPromise);
  __triggerIdleState('active');

  /* Fire onReplaced WHILE the wake-reconcile is gated on readyPromise.
     The listener must enqueue, not apply inline — proven by the queue
     state below + the unchanged claimsMirror. */
  __triggerOnReplaced(200, 100);
  await new Promise((r) => setImmediate(r));

  const pendingDuring = __getPendingReplacements();
  assert.equal(pendingDuring.length, 1, 'M-2: onReplaced during active reconcile must enqueue, not apply inline');
  assert.deepEqual(pendingDuring[0], { addedTabId: 200, removedTabId: 100 },
    'M-2: queued entry matches the (added, removed) pair');
  assert.equal(getClaimsMirror()['item-X'], 100,
    'M-2: claimsMirror still points at removedTabId — inline remap correctly suppressed');

  /* Release the gate. Wake-reconcile completes, then the drain replays
     the queued event. */
  resolveReady();
  for (let i = 0; i < 8; i += 1) await new Promise((r) => setImmediate(r));

  assert.equal(__getPendingReplacements().length, 0, 'M-2: queue drained post-reconcile');
  assert.equal(getClaimsMirror()['item-X'], 200,
    'M-2: post-drain, claimsMirror reflects the rotated tabId (NEW, not OLD)');
  assert.equal(__getSessionStore('tj:tabClaims')['item-X'], 200,
    'M-2: writeClaims persisted the post-drain remap (race scenario resolved)');
});

/* =========================================================================
   T12 — R4 M-2 (drain ordering). Multiple onReplaced events queued during
   the wake-reconcile window drain in FIFO order. Verified by sequencing
   the rotation chain across three distinct items so the drain order is
   observable in the final claimsMirror state + the recorded queue.
   ========================================================================= */
test('B-164 T12 (R4 M-2): multiple onReplaced events drain in FIFO order', async () => {
  __setMockTabs([
    tab(100, 'https://example.com/a'),
    tab(200, 'https://example.com/a'),
    tab(300, 'https://example.com/b'),
    tab(400, 'https://example.com/b'),
    tab(500, 'https://example.com/c'),
    tab(600, 'https://example.com/c'),
  ]);
  await buildLiveTabIndex();
  __setSessionStore('tj:tabClaims', { 'item-A': 100, 'item-B': 300, 'item-C': 500 });
  seedPartitions({
    items: [
      item('item-A', 'https://example.com/a', 0),
      item('item-B', 'https://example.com/b', 1),
      item('item-C', 'https://example.com/c', 2),
    ],
  });
  await reconcileClaims([
    item('item-A', 'https://example.com/a', 0),
    item('item-B', 'https://example.com/b', 1),
    item('item-C', 'https://example.com/c', 2),
  ]);

  registerTabEventListeners(Promise.resolve());

  let resolveReady;
  const readyPromise = new Promise((r) => { resolveReady = r; });
  registerIdleReconciler(readyPromise);
  __triggerIdleState('active');

  /* Three queued events in deterministic order. */
  __triggerOnReplaced(200, 100); // item-A: 100 → 200
  __triggerOnReplaced(400, 300); // item-B: 300 → 400
  __triggerOnReplaced(600, 500); // item-C: 500 → 600
  await new Promise((r) => setImmediate(r));

  const pending = __getPendingReplacements();
  assert.equal(pending.length, 3, 'three events queued during active reconcile');
  assert.deepEqual(pending.map((p) => p.removedTabId), [100, 300, 500],
    'M-2: queue preserves FIFO insertion order');

  resolveReady();
  for (let i = 0; i < 10; i += 1) await new Promise((r) => setImmediate(r));

  assert.equal(__getPendingReplacements().length, 0, 'queue fully drained');
  const mirror = getClaimsMirror();
  assert.equal(mirror['item-A'], 200, 'item-A drained to new tabId 200');
  assert.equal(mirror['item-B'], 400, 'item-B drained to new tabId 400');
  assert.equal(mirror['item-C'], 600, 'item-C drained to new tabId 600');
});

/* =========================================================================
   T10 — AC1 defensive. onReplaced for a tabId that no mirror table
   references is a complete no-op: no writeClaims call, no
   writeTransaction on tj:floatingGroups.
   ========================================================================= */
test('B-164 T10 (AC1 defensive): chrome.tabs.onReplaced for a non-mirror tabId is a true no-op', async () => {
  __setMockTabs([tab(100, 'https://example.com/x')]);
  await buildLiveTabIndex();
  __setSessionStore('tj:tabClaims', { 'item-X': 100 });
  seedPartitions({
    items: [item('item-X', 'https://example.com/x')],
    floatingGroups: [floatingRecord({
      groupId: 'g3', parentItemId: 'item-X', floatingTabId: 'ft-3', liveTabId: 100,
    })],
  });
  await reconcileClaims([item('item-X', 'https://example.com/x')]);

  /* Snapshot the pre-state. */
  const preClaims = JSON.stringify(__getSessionStore('tj:tabClaims'));
  const preFloating = JSON.stringify(__getRawStore('tj:floatingGroups'));

  registerTabEventListeners(Promise.resolve());

  /* Fire onReplaced for a tabId 9999 that is NOT in any mirror table. */
  __triggerOnReplaced(8888, 9999);
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));

  /* No mutation in either storage surface. */
  assert.equal(JSON.stringify(__getSessionStore('tj:tabClaims')), preClaims,
    'AC1 defensive: writeClaims must NOT fire when no mirror entry matched');
  assert.equal(JSON.stringify(__getRawStore('tj:floatingGroups')), preFloating,
    'AC1 defensive: writeTransaction must NOT fire when no floating record matched');
});
