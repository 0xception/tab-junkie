/**
 * b174-cold-start-reconciliation-e2e.test.js — Sprint 47 / B-174 R5
 *
 * End-to-end cold-start reconciliation integration test — the SAFETY NET for
 * the B-173 single-source-of-truth tab↔item identity consolidation epic
 * (A0 in the §74.8 sub-item split).
 *
 * Unlike every prior reconcile test (b163 / b164 / b167 / b132 — each of which
 * drives a SINGLE cold-start function in isolation: reconcileClaims,
 * prePopulateClaimsFromDurable, preMarkInheritedFromFloatingGroups, …), this
 * file drives the FULL `initializeLiveState(readyPromise)` cold-start pipeline
 * end-to-end (background/tabs/index.js) and asserts the resulting END STATE via
 * the PUBLIC read surface:
 *
 *   - `getItemIdForTab(tabId)`        → reverse claim lookup (tab-claims.js)
 *   - `buildLiveStates(items)`        → per-item {live, active, audible, tabId, windowId}
 *   - `buildFloatingMembers(items)`   → per-group floating-tab descriptors
 *   - `getDriftRecords()`             → tj:drift records
 *
 * Internals are asserted only through sanctioned test hatches
 * (`__getSessionTagForTest`, `isInherited`, `isClaimsReady`, `__getSessionStore`,
 * `readPartition(PARTITION_ITEM_CLAIMS)`, `__getRawStore`). No new production
 * hook is added.
 *
 * Because this test DRIVES the real `initializeLiveState`, the cold-start call
 * ORDER (preMark → prePopulate → reconcile → reassociate → bootstrap) is pinned
 * BEHAVIOURALLY (e.g. T5 only passes if preMark runs before reconcile Phase 2;
 * T4 only passes if reconcile precedes Phase 4) — a strictly stronger guarantee
 * than the b132 §65.12 source-text pin (which was a fallback "no test exercises
 * initializeLiveState end-to-end"). This is now that test.
 *
 * ── chrome-mock boundary (§74.11) ──────────────────────────────────────────
 * The R0 spike (docs/design/74-b-173-r0-spike.md §74.11) flags that chrome-mock
 * CANNOT reproduce the following — they are REAL-BROWSER UAT-only signal classes
 * and are deliberately NOT modelled here:
 *   • session-wipe-on-reload vs SW-restart-within-session (P-1 vs P-3): the mock
 *     has one in-memory `sessionStore` cleared by `__resetMock`; the browser
 *     distinguishes "extension reload wipes chrome.storage.session" from "SW
 *     restart leaves it intact". We MODEL each scenario by setting the session
 *     store to the appropriate state per test (empty = reload, seeded =
 *     SW-restart-in-session) — but the mock cannot itself enforce the wipe
 *     semantics, so the reload/restart DISTINCTION is a UAT-only probe.
 *   • real tabId-rotation timing on browser restart / discard (P-2 / P-3): we
 *     model the END STATE (durable tabIds dead, fresh tabIds at same URLs) but
 *     not the live rotation event stream.
 *   • focus-shift popup teardown (P-7) and in-flight onReplaced-during-wake
 *     races (P-6): not identity-cold-start; out of scope for this safety net.
 * What the mock CAN exercise — the full prePopulate→reconcile→reassociate→
 * floating-resolve state machine over seeded session/durable/floating/drift
 * stores — is covered by T1–T7 below, each mapped to a §74.11 probe.
 *
 * Folds in the WAIVED Sprint-46 UAT: T1 ⇒ B-167 reload UAT (P-1); T2 ⇒ B-167
 * restart UAT (P-2). When the real-browser P-1/P-2 probes pass at B-179 R5,
 * those waived UATs close (§74.11.2).
 *
 * Cross-reference: docs/design/74-b-173-r0-spike.md (R0 spike — pipeline map,
 * six-store drift catalog §74.4, probe plan §74.11).
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetMock,
  __setMockTabs,
  __setSessionStore,
  __getSessionStore,
  __getRawStore,
  seedPartitions,
} from './chrome-mock.js';
import { __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import {
  buildLiveStates,
  getItemIdForTab,
  isClaimsReady,
  isInherited,
  __resetTabClaims,
  __getSessionTagForTest,
} from '../background/tabs/tab-claims.js';
import { buildFloatingMembers } from '../background/tabs/floating-members.js';
import { getDriftRecords } from '../background/tabs/drift.js';
import { initializeLiveState } from '../background/tabs/index.js';
import { __resetWindowOrdinals } from '../background/tabs/window-ordinals.js';
import { readPartition } from '../background/storage/partitions.js';
import {
  PARTITION_ITEM_CLAIMS,
  ITEM_CLAIMS_SCHEMA_VERSION,
} from '../background/storage/shapes.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
  __resetWindowOrdinals();
});

// ---- Helpers --------------------------------------------------------------

/** Live-tab fixture (chrome.tabs.query shape). `index` is the per-window
 *  position used by the floating-group (windowId, tabIndex) resolver tier. */
function tab(id, url, windowId = 1, index = 0, overrides = {}) {
  return {
    id, url, title: '', windowId, active: false, audible: false,
    favIconUrl: '', index, ...overrides,
  };
}

/** Saved-item fixture (tj:items shape). */
function item(id, url, sortOrder = 0, groupId = null) {
  return { id, url, title: id, groupId, sortOrder, createdAt: 1, updatedAt: 1 };
}

/** Durable tj:itemClaims partition fixture. */
function durable(sessionTag, entries) {
  return { schemaVersion: ITEM_CLAIMS_SCHEMA_VERSION, sessionTag, entries };
}

/** Single durable entry. */
function entry(tabId, sessionTag, claimedAt = 100) {
  return { tabId, claimedAt, sessionTag };
}

/** Floating-group record (tj:floatingGroups). `liveTabId` omitted ⇒ legacy v3. */
function floatingRecord(props) {
  return { savedAt: 1000, ...props };
}

/** Drive the real cold-start pipeline. `Promise.resolve()` stands in for the
 *  service-worker readyPromise — the identity pipeline reads its partitions
 *  directly via readPartition and does not depend on runMigrations side effects
 *  (readPartition falls back to defaultShape for unseeded partitions). */
async function coldStart() {
  await initializeLiveState(Promise.resolve());
}

/* =========================================================================
   T1 — Extension-reload happy path. (§74.11 P-1; folds waived B-167 reload UAT)

   SW restart on extension reload: chrome.storage.session is WIPED, the durable
   tj:itemClaims partition SURVIVES, and tabIds PERSIST (same browser session).
   prePopulateClaimsFromDurable sees sessionMatches=true, seeds session from
   durable, reconcile Phase 1 re-binds every item to its ORIGINAL tab.

   ZERO-URL-inference proof (the §73.15 T7 / B-149 contract): item-B's durable
   tab (201) sits at a DRIFTED url that matches NO saved item. Phase-2 URL
   inference could therefore NEVER produce the item-B→201 binding — its survival
   proves the binding came from durable pre-pop + Phase 1 (URL not re-checked),
   not from inference.
   ========================================================================= */
test('B-174 T1 (§74.11 P-1): extension-reload — durable re-binds every item to its original tab with zero URL inference', async () => {
  __setMockTabs([
    tab(200, 'https://saved.com/A', 1, 0, { active: true }),
    tab(201, 'https://saved.com/B-DRIFTED', 1, 1, { audible: true }), // drifted away from item-B.url
  ]);
  // session WIPED (extension reload) — do NOT seed tj:tabClaims.
  seedPartitions({
    items: [
      item('item-A', 'https://saved.com/A', 0),
      item('item-B', 'https://saved.com/B', 1),
    ],
    itemClaims: durable('reload-tag', {
      'item-A': entry(200, 'reload-tag'),
      'item-B': entry(201, 'reload-tag'),
    }),
  });
  assert.equal(__getSessionStore('tj:tabClaims'), undefined, 'pre: session wiped on reload');

  await coldStart();

  // Public reverse-lookup: both items re-bound to their ORIGINAL durable tabs.
  assert.equal(getItemIdForTab(200), 'item-A', 'P-1: item-A re-bound to original tab 200');
  assert.equal(getItemIdForTab(201), 'item-B',
    'P-1 + B-149 zero-inference: item-B re-bound to original tab 201 despite the tab having drifted (no tab at item-B.url ⇒ only durable+Phase1 could produce this)');

  // Public live-state surface reflects the restored bindings + live tab geometry.
  const states = buildLiveStates([
    item('item-A', 'https://saved.com/A', 0),
    item('item-B', 'https://saved.com/B', 1),
  ]);
  assert.equal(states['item-A'].live, true, 'item-A live');
  assert.equal(states['item-A'].active, true, 'item-A active (tab 200 active)');
  assert.equal(states['item-A'].tabId, 200);
  assert.equal(states['item-B'].live, true, 'item-B live');
  assert.equal(states['item-B'].audible, true, 'item-B audible (tab 201 audible)');
  assert.equal(states['item-B'].tabId, 201);

  // The durable sessionTag was ADOPTED (reload), not freshly minted.
  assert.equal(__getSessionTagForTest(), 'reload-tag', 'reload adopts the durable sessionTag');
  assert.equal(isClaimsReady(), true, 'claimsReady flips true after the full pipeline');
});

/* =========================================================================
   T2 — Browser-restart backstop. (§74.11 P-2; folds waived B-167 restart UAT)

   Full browser restart: every tabId ROTATES. The durable entries reference DEAD
   tabIds (sessionMatches→false ⇒ no pre-population); the same URLs reappear at
   NEW tabIds. The one-time recovery resolver (Phase-2 URL recovery) re-binds,
   a FRESH sessionTag is minted, and durable is re-stamped (W-1 full-replace) so
   the NEXT reload hits the trusted fast path (T1 behaviour).
   ========================================================================= */
test('B-174 T2 (§74.11 P-2): browser-restart — dead durable tabIds, URL recovery re-binds and re-stamps durable with a fresh sessionTag', async () => {
  // Rotated tabIds (300/301) at the SAME urls the dead durable entries recorded.
  __setMockTabs([
    tab(300, 'https://saved.com/A', 1, 0),
    tab(301, 'https://saved.com/B', 1, 1),
  ]);
  // session empty (post-restart); durable points at long-dead tabIds 999/998.
  seedPartitions({
    items: [
      item('item-A', 'https://saved.com/A', 0),
      item('item-B', 'https://saved.com/B', 1),
    ],
    itemClaims: durable('old-restart-tag', {
      'item-A': entry(999, 'old-restart-tag', 1),
      'item-B': entry(998, 'old-restart-tag', 1),
    }),
  });

  await coldStart();

  // URL/position recovery re-bound both items to the ROTATED tabIds.
  assert.equal(getItemIdForTab(300), 'item-A', 'P-2: URL recovery re-binds item-A to rotated tab 300');
  assert.equal(getItemIdForTab(301), 'item-B', 'P-2: URL recovery re-binds item-B to rotated tab 301');

  // A FRESH sessionTag was minted (the stale tag is not trusted).
  const freshTag = __getSessionTagForTest();
  assert.ok(freshTag.length > 0, 'fresh sessionTag minted');
  assert.notEqual(freshTag, 'old-restart-tag', 'stale durable tag is NOT adopted on restart');

  // Durable re-stamped (W-1) with the fresh tag + the recovered (rotated) tabIds.
  const dur = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.equal(dur.sessionTag, freshTag, 'durable partition re-stamped with the fresh sessionTag');
  assert.equal(dur.entries['item-A'].tabId, 300, 'durable re-stamped item-A → rotated tab 300');
  assert.equal(dur.entries['item-A'].sessionTag, freshTag, 'per-entry tag matches the partition tag');
  assert.equal(dur.entries['item-B'].tabId, 301, 'durable re-stamped item-B → rotated tab 301');
});

/* =========================================================================
   T3 — No-durable cold start. (§74.11 fresh-install / no-durable path)

   Empty tj:itemClaims + empty session. Phase 2 binds unclaimed items to
   unclaimed tabs by primary item.url, FIRST-UNCLAIMED-WINS in ascending
   sortOrder. Two items share a URL but only ONE live tab exists at it → the
   lower-sortOrder item wins; the higher-sortOrder item stays unbound.
   ========================================================================= */
test('B-174 T3 (§74.11 no-durable): fresh cold start — Phase 2 URL-claim binds by sortOrder precedence', async () => {
  __setMockTabs([
    tab(300, 'https://shared.com/X', 1, 0), // single tab at the shared URL
    tab(302, 'https://unique.com/Z', 1, 1),
  ]);
  // No itemClaims partition, no session — true fresh start.
  seedPartitions({
    items: [
      item('item-A', 'https://shared.com/X', 0), // lower sortOrder — wins the shared tab
      item('item-B', 'https://shared.com/X', 1), // higher sortOrder — loses (one tab only)
      item('item-C', 'https://unique.com/Z', 2),
    ],
  });

  await coldStart();

  assert.equal(getItemIdForTab(300), 'item-A',
    'Phase 2 first-unclaimed-wins: lower-sortOrder item-A claims the single shared-URL tab');
  assert.equal(getItemIdForTab(302), 'item-C', 'item-C binds its own unique-URL tab');

  const states = buildLiveStates([
    item('item-A', 'https://shared.com/X', 0),
    item('item-B', 'https://shared.com/X', 1),
    item('item-C', 'https://unique.com/Z', 2),
  ]);
  assert.equal(states['item-A'].live, true, 'item-A live (won the shared tab)');
  assert.equal(states['item-B'].live, false,
    'item-B unbound — only one tab at the shared URL, sortOrder precedence left it offline');
  assert.equal(states['item-C'].live, true, 'item-C live');

  // Fresh durable stamped (W-1) with a minted tag + the two inferred bindings.
  const dur = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.ok(dur.sessionTag.length > 0, 'fresh sessionTag minted on a no-durable cold start');
  assert.equal(dur.entries['item-A'].tabId, 300);
  assert.equal(dur.entries['item-C'].tabId, 302);
  assert.equal(dur.entries['item-B'], undefined, 'unbound item-B not persisted to durable');
});

/* =========================================================================
   T4 — Drift fallback + conditional drift-drop. (§74.11 P-4 / B-163 + §70)

   SW-restart-within-session: session SURVIVES with two stale claims pointing at
   dead tabIds → Phase 1 evicts both into evictedItemIds. Neither item.url has a
   live tab → Phase 2 misses both.
     • item-X: drift.driftedToUrl matches live tab 700 → Phase 3 RE-BINDS;
       drift RETAINED (§70 AC4-A — record corresponds to a now-claimed item).
     • item-Y: drift.driftedToUrl has NO live tab → stays unbound; being evicted,
       Phase 4 CLEARS its truly-orphaned drift (§70 AC4-B conditional drop).
   ========================================================================= */
test('B-174 T4 (§74.11 P-4 / B-163 + §70): drift-URL fallback re-binds the evicted item; Phase 4 conditionally drops only the orphaned drift', async () => {
  __setMockTabs([tab(700, 'https://drifted-x.example/', 1, 0)]);
  // SW-restart-in-session: session persisted with stale (dead-tab) claims.
  __setSessionStore('tj:tabClaims', { 'item-X': 999, 'item-Y': 998 });
  seedPartitions({
    items: [
      item('item-X', 'https://saved-x.example/', 0),
      item('item-Y', 'https://saved-y.example/', 1),
    ],
    drift: {
      'item-X': { itemId: 'item-X', driftedToUrl: 'https://drifted-x.example/', detectedAt: 1 },
      'item-Y': { itemId: 'item-Y', driftedToUrl: 'https://gone.example/', detectedAt: 1 },
    },
  });

  await coldStart();

  assert.equal(getItemIdForTab(700), 'item-X',
    'B-163 Phase 3: evicted item-X re-binds to the live tab at its driftedToUrl');
  assert.equal(buildLiveStates([item('item-Y', 'https://saved-y.example/', 1)])['item-Y'].live, false,
    'item-Y stays unbound — no live tab at item.url OR driftedToUrl');

  const drift = await getDriftRecords();
  assert.ok(drift['item-X'],
    '§70 AC4-A: item-X drift RETAINED — Phase 3 re-bound it, so the record corresponds to a claimed item');
  assert.equal('item-Y' in drift, false,
    '§70 AC4-B: item-Y drift CLEARED by Phase 4 — evicted AND unrecovered ⇒ truly-orphaned drop');
});

/* =========================================================================
   T5 — preMark inherited tabs. (§74.11 P-4 / B-132)

   A tj:floatingGroups record marks a live tab (whose URL coincidentally
   COLLIDES with a saved bookmark) as opener-chain-inherited BEFORE reconcile.
   reconcileClaims Phase 2 then SKIPS that tab → the colliding saved item is NOT
   auto-claimed (the B-132 claim-jump fix). This passes ONLY because the real
   pipeline runs preMark → reconcile in order.
   ========================================================================= */
test('B-174 T5 (§74.11 P-4 / B-132): preMark-inherited floating tab is NOT auto-claimed by Phase 2 (no claim-jump)', async () => {
  seedPartitions({
    items: [
      item('item-parent', 'https://parent.example/', 0, 'g-parent'),
      item('item-collide', 'https://collide.example/', 1), // URL collides with the floating child
    ],
    floatingGroups: [
      floatingRecord({
        floatingTabId: 'ft-collide',
        groupId: 'g-parent',
        parentItemId: 'item-parent',
        windowId: 1,
        tabIndex: 1,
        url: 'https://collide.example/',
      }),
    ],
  });
  __setMockTabs([
    tab(500, 'https://parent.example/', 1, 0, { active: true }), // parent
    tab(501, 'https://collide.example/', 1, 1),                  // floating child (URL collision)
  ]);

  await coldStart();

  assert.equal(getItemIdForTab(500), 'item-parent', 'parent claim established via Phase 2');
  assert.equal(getItemIdForTab(501), null,
    'B-132 gate: floating child tab 501 was preMarked inherited ⇒ Phase 2 skipped it');
  assert.equal(isInherited(501), true, 'preMark marked the floating child as inherited');

  // The colliding saved item stays offline (it did NOT claim-jump tab 501).
  const states = buildLiveStates([item('item-collide', 'https://collide.example/', 1)]);
  assert.equal(states['item-collide'].live, false,
    'B-132: colliding bookmark remains unclaimed — the inheritance gate prevented the claim-jump');
});

/* =========================================================================
   T6 — Floating re-association (3-tier resolver) + claimed-tab exclusion.
   (§74.11 P-4 / B-137 §66.6)

   buildFloatingMembers resolves each tj:floatingGroups record to a live tab via
   the 3-tier join: (a) direct liveTabId, (b) (windowId, tabIndex) position,
   (c) normalized-URL fallback. A floating record whose resolved tab is CLAIMED
   by a saved item is excluded (and its record pruned by reassociate). The
   claimed tab here is a durable claim from a prior session (the D-4 double-home
   case), kept claimed across the preMark/reconcile interplay.
   ========================================================================= */
test('B-174 T6 (§74.11 P-4 / B-137): floating records resolve via liveTabId/position/URL tiers; claimed tabs are excluded from floating members', async () => {
  __setMockTabs([
    tab(600, 'https://parent6.example/', 1, 0),  // parent — claimed via Phase 2
    tab(601, 'https://floata.example/', 1, 1),   // tier (a) direct liveTabId
    tab(603, 'https://floatb.example/', 1, 3),   // tier (b) position (1, index 3)
    tab(605, 'https://floatc.example/', 1, 5),   // tier (c) URL fallback
    tab(610, 'https://claimed6.example/', 1, 6), // durable-claimed; carries a stale floating record
  ]);
  // session WIPED (reload); durable holds the prior-session item-claimed→610 bind.
  seedPartitions({
    items: [
      item('item-P', 'https://parent6.example/', 0, 'g-P'),
      item('item-claimed', 'https://claimed6.example/', 1),
    ],
    itemClaims: durable('tag6', { 'item-claimed': entry(610, 'tag6') }), // 1/1 resolves ⇒ sessionMatches
    floatingGroups: [
      floatingRecord({ floatingTabId: 'ft-a', groupId: 'g-P', parentItemId: 'item-P', windowId: 1, tabIndex: 1, url: 'https://floata.example/', liveTabId: 601 }),
      floatingRecord({ floatingTabId: 'ft-b', groupId: 'g-P', parentItemId: 'item-P', windowId: 1, tabIndex: 3, url: 'https://floatb.example/' }), // legacy v3 — position tier
      floatingRecord({ floatingTabId: 'ft-c', groupId: 'g-P', parentItemId: 'item-P', windowId: 1, tabIndex: 99, url: 'https://floatc.example/' }), // position miss → URL tier
      floatingRecord({ floatingTabId: 'ft-claimed', groupId: 'g-P', parentItemId: 'item-P', windowId: 1, tabIndex: 6, url: 'https://claimed6.example/', liveTabId: 610 }), // tab claimed → excluded + pruned
    ],
  });

  await coldStart();

  // The durable-claimed tab is a saved-item claim, not a floating member.
  assert.equal(getItemIdForTab(610), 'item-claimed', 'durable claim survives the cold-start pipeline');
  assert.equal(getItemIdForTab(600), 'item-P', 'parent claimed via Phase 2');

  const members = await buildFloatingMembers([
    item('item-P', 'https://parent6.example/', 0, 'g-P'),
    item('item-claimed', 'https://claimed6.example/', 1),
  ]);
  const groupMembers = members['g-P'] || [];
  const memberTabIds = new Set(groupMembers.map((m) => m.tabId));

  assert.equal(groupMembers.length, 3, 'three floating members resolve (tiers a/b/c)');
  assert.ok(memberTabIds.has(601), 'tier (a) direct-liveTabId record resolved tab 601');
  assert.ok(memberTabIds.has(603), 'tier (b) position record resolved tab 603');
  assert.ok(memberTabIds.has(605), 'tier (c) URL-fallback record resolved tab 605');
  assert.equal(memberTabIds.has(610), false,
    'claimed-tab exclusion: the floating record on the claimed tab 610 is NOT a floating member');

  // reassociateFloatingGroups pruned the stale (claimed-tab) record from storage.
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.some((r) => r.floatingTabId === 'ft-claimed'), false,
    'B-121 §60.4.3: the floating record whose tab got claimed was pruned at cold-start');
  assert.equal(raw.length, 3, 'three floating records retained (the three unclaimed members)');
});

/* =========================================================================
   T7 — Zero-state self-heal. (§74.11 W-1 self-heal / no-crash boundary)

   Empty live index (no tabs open) + a NON-EMPTY stale durable partition (carry
   over from a prior session). sessionMatches→false (0 resolve) → no
   pre-population; reconcile binds nothing; the end-of-Phase-4 W-1 full-replace
   OVERWRITES durable with an empty entries map under a freshly-minted tag. The
   pipeline must complete without crashing.
   ========================================================================= */
test('B-174 T7 (§74.11 self-heal): zero live tabs + non-empty stale durable → no crash, durable self-heals to empty under a fresh tag', async () => {
  __setMockTabs([]); // zero tabs open
  seedPartitions({
    items: [
      item('item-A', 'https://saved.com/A', 0),
      item('item-B', 'https://saved.com/B', 1),
    ],
    itemClaims: durable('stale7-tag', {
      'item-A': entry(999, 'stale7-tag', 1),
      'item-B': entry(998, 'stale7-tag', 1),
    }),
  });

  await coldStart(); // must not throw

  assert.equal(isClaimsReady(), true, 'pipeline completed — claimsReady true');
  assert.equal(getItemIdForTab(999), null, 'no live tab ⇒ no binding');

  const states = buildLiveStates([
    item('item-A', 'https://saved.com/A', 0),
    item('item-B', 'https://saved.com/B', 1),
  ]);
  assert.equal(states['item-A'].live, false, 'item-A offline (no live tab)');
  assert.equal(states['item-B'].live, false, 'item-B offline (no live tab)');

  // W-1 self-heal: durable wiped to empty entries under a fresh (non-stale) tag.
  const dur = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.deepEqual(dur.entries, {}, 'durable self-heals to empty entries (stale bindings dropped)');
  assert.ok(dur.sessionTag.length > 0, 'fresh sessionTag minted');
  assert.notEqual(dur.sessionTag, 'stale7-tag', 'stale tag is not retained');
});
