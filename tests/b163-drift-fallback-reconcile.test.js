/**
 * b163-drift-fallback-reconcile.test.js — Sprint 45 / B-163 R5 (AC1–AC7)
 *
 * B-163 extends `reconcileClaims` (background/tabs/tab-claims.js) with a
 * 4-phase pipeline so that drifted claims whose tabs were torn down during
 * a service-worker idle window can be re-bound at cold-start via the
 * drift partition's `driftedToUrl` field instead of being silently
 * orphaned. See `docs/design/70-b-163-drift-fallback-reconcile.md`.
 *
 * Phase summary (post-B-163):
 *   Phase 1 — validate persisted claims (unchanged by B-163; B-149 contract)
 *   Phase 2 — primary item.url URL→tab fallback (unchanged by B-163)
 *   Phase 3 — (B-163) drift-URL fallback for items still unbound
 *   Phase 4 — (B-163) conditional drift drop on unrecovered items
 *
 * Coverage map (one test per R1 LOCKED AC, plus the AC7 NO-TTL guard and
 * the Phase-4 deferral guard for AC4 Scenario A):
 *
 *   T1 — AC1 happy path: cold-start drift re-association via `driftedToUrl`.
 *   T2 — AC2 primary `item.url` wins when both URLs have a live tab.
 *   T3 — AC3 one-tab-per-drift-record cap (hijack mitigation by sortOrder).
 *   T4 — AC4(A): Phase 3 binds → Phase 4 does NOT clear drift (drift
 *        retained alongside the re-established claim per §10.7).
 *   T5 — AC4(B): both URLs fail → Phase 4 clears the truly-orphaned drift.
 *   T6 — AC5 inherited-tab skip in Phase 3 (parity with Phase 2).
 *   T7 — AC6 B-149 Phase-1 survival contract preserved (regression guard).
 *   T8 — AC7 NO-TTL: a very old `detectedAt` does NOT exclude a record
 *        from Phase-3 eligibility (and a fresh `detectedAt` produces the
 *        identical outcome — proving no date-comparison gate exists).
 *
 * The SW idle-shutdown + tab-teardown sequence is reproduced by seeding
 * the post-sleep storage state directly (`__setSessionStore('tj:tabClaims', …)`
 * + `seedPartitions({drift: …})`) and calling `reconcileClaims` — same
 * pattern used by `tests/b149-drifted-claim-survives-cold-start.test.js`
 * and `tests/b110-drift-non-live-fix.test.js`. End-to-end UAT lives at
 * `docs/UAT_B-163.md` (R5 [test-engineer]).
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetMock,
  __setMockTabs,
  __setSessionStore,
  __getSessionStore,
  seedPartitions,
} from './chrome-mock.js';
import {
  buildLiveTabIndex,
  __resetLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import {
  reconcileClaims,
  markInherited,
  isClaimsReady,
  __resetTabClaims,
} from '../background/tabs/tab-claims.js';
import { getDriftRecords } from '../background/tabs/drift.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

/* Helper — build a live-tab fixture with the standard shape used across
   the existing reconcile tests. Defaults match the chrome-mock contract. */
function tab(id, url, windowId = 1) {
  return { id, url, title: '', windowId, active: false, audible: false, favIconUrl: '', index: 0 };
}

/* Helper — build a saved-item fixture. */
function item(id, url, sortOrder = 0) {
  return { id, url, title: id, groupId: null, sortOrder, createdAt: 1, updatedAt: 1 };
}

/* =========================================================================
   T1 — AC1 happy path. The user-visible repro from §70.1:
     - Item X saved to https://saved.com/A
     - Tab drifted to https://saved.com/B, drift record written
     - SW idled; the original tab was closed; a fresh tab was opened at
       the drifted URL (could be Ctrl+Shift+T undo, opener-chain inherit,
       or manual re-open).
     - SW wakes; reconcileClaims runs.
   Pre-B-163: Phase 1 evicts X (dead tabId), Phase 2 misses (item.url has
   no live tab), §53 paired-clear unconditionally drops the drift record,
   the fresh tab shows up as unclaimed in Open Tabs. Post-B-163: Phase 3
   reads the drift record, finds the fresh tab at driftedToUrl, binds X
   to it.
   ========================================================================= */
test('B-163 T1 (AC1): cold-start drift re-association via driftedToUrl re-binds the evicted claim', async () => {
  /* Seed a fresh live tab at the DRIFTED URL (the original tabId 999 is
     dead — the user closed it while the SW slept; the new tabId is 200). */
  __setMockTabs([tab(200, 'https://saved.com/B')]);
  await buildLiveTabIndex();

  /* Seed the post-sleep persisted state: claim still points at the dead
     tabId 999; drift record holds the drifted URL the user navigated to
     before sleep. */
  __setSessionStore('tj:tabClaims', { 'item-X': 999 });
  seedPartitions({
    items: [item('item-X', 'https://saved.com/A', 0)],
    drift: { 'item-X': { itemId: 'item-X', driftedToUrl: 'https://saved.com/B', detectedAt: 1 } },
  });

  await reconcileClaims([item('item-X', 'https://saved.com/A', 0)]);

  const claims = __getSessionStore('tj:tabClaims');
  assert.equal(
    claims['item-X'],
    200,
    'B-163 AC1: Phase 3 must bind the evicted item to the fresh live tab whose URL matches the drift record',
  );

  /* AC4 Scenario A side-channel: drift record is RETAINED because Phase 3
     re-bound the item; the §10.7 invariant ("drift records only exist for
     claimed items") is preserved — X IS claimed, by tab 200. The runtime
     detectDriftForTab cycle owns the eventual clear when/if the tab
     navigates back to item.url. */
  const drift = await getDriftRecords();
  assert.ok(
    drift['item-X'],
    'B-163 AC4(A): drift record retained when Phase 3 re-binds — Phase 4 must NOT clear because X is now in `reconciled`',
  );
});

/* =========================================================================
   T2 — AC2 primary item.url wins. Both URLs have a live tab; Phase 2 must
   bind to the item.url tab, and Phase 3 must NEVER run for the item.
   ========================================================================= */
test('B-163 T2 (AC2): primary item.url wins over driftedToUrl when both have a live tab', async () => {
  /* Two live tabs — one at item.url (300), one at driftedToUrl (301). */
  __setMockTabs([
    tab(300, 'https://primary.com/A'),
    tab(301, 'https://primary.com/B'),
  ]);
  await buildLiveTabIndex();

  /* Old claim is dead so Phase 1 evicts X into `evictedItemIds`. */
  __setSessionStore('tj:tabClaims', { 'item-X': 999 });
  seedPartitions({
    items: [item('item-X', 'https://primary.com/A', 0)],
    drift: { 'item-X': { itemId: 'item-X', driftedToUrl: 'https://primary.com/B', detectedAt: 1 } },
  });

  await reconcileClaims([item('item-X', 'https://primary.com/A', 0)]);

  const claims = __getSessionStore('tj:tabClaims');
  assert.equal(
    claims['item-X'],
    300,
    'B-163 AC2: Phase 2 (item.url) must win over Phase 3 (driftedToUrl) — primary URL always takes precedence',
  );

  /* The drift-URL tab 301 is NOT in any claim — it remains an unclaimed
     live tab (would surface in Open Tabs). */
  assert.equal(
    Object.values(claims).includes(301),
    false,
    'B-163 AC2: the drift-URL tab must remain unclaimed when the primary URL bound first',
  );
});

/* =========================================================================
   T3 — AC3 one-tab-per-drift-record cap. Two items (X sortOrder 0 + Y
   sortOrder 1) both drifted to the SAME URL; only ONE live tab exists at
   that URL. The lower-sortOrder item must win; the other must be unbound
   AND its drift record cleared by Phase 4.
   ========================================================================= */
test('B-163 T3 (AC3): one-tab-per-drift-record cap — sortOrder-lower item wins, loser`s drift is cleared by Phase 4', async () => {
  __setMockTabs([tab(400, 'https://collision.com/Z')]);
  await buildLiveTabIndex();

  /* Both claims are dead — both X and Y enter evictedItemIds. */
  __setSessionStore('tj:tabClaims', { 'item-X': 998, 'item-Y': 999 });
  seedPartitions({
    items: [
      item('item-X', 'https://saved-x.com', 0),
      item('item-Y', 'https://saved-y.com', 1),
    ],
    drift: {
      'item-X': { itemId: 'item-X', driftedToUrl: 'https://collision.com/Z', detectedAt: 1 },
      'item-Y': { itemId: 'item-Y', driftedToUrl: 'https://collision.com/Z', detectedAt: 2 },
    },
  });

  await reconcileClaims([
    item('item-X', 'https://saved-x.com', 0),
    item('item-Y', 'https://saved-y.com', 1),
  ]);

  const claims = __getSessionStore('tj:tabClaims');
  assert.equal(
    claims['item-X'],
    400,
    'B-163 AC3: sortOrder-lower item (X, sortOrder=0) must bind to the single available drift-URL tab',
  );
  assert.equal(
    claims['item-Y'],
    undefined,
    'B-163 AC3: sortOrder-higher item (Y) must remain unbound — only ONE binding per drift-URL collision',
  );

  /* Each claimedTabId can only appear once in the mirror — uniqueness
     invariant per §10.5. */
  const tabIdsBound = Object.values(claims).filter((v) => v === 400);
  assert.equal(tabIdsBound.length, 1, 'B-163 AC3: tab 400 must appear in the mirror exactly once');

  const drift = await getDriftRecords();
  assert.ok(drift['item-X'], 'B-163 AC4(A): X`s drift retained because Phase 3 bound it');
  assert.equal(
    'item-Y' in drift,
    false,
    'B-163 AC3/AC4(B): Y`s drift cleared by Phase 4 — Y never re-bound, drift is truly orphaned',
  );
});

/* =========================================================================
   T4 — AC4 Scenario A: Phase 3 binds → Phase 4 does NOT clear. This is
   the §10.7 invariant assertion in the recovery path. Distinct from T1's
   side-channel check because T4 isolates the Phase-4 deferral mechanic
   end-to-end (binds AND verifies the unrecovered set excludes the bound
   item).
   ========================================================================= */
test('B-163 T4 (AC4 Scenario A): Phase 3 binds → Phase 4 deferral keeps drift record (§10.7 invariant preserved)', async () => {
  __setMockTabs([tab(500, 'https://drifted.example/page')]);
  await buildLiveTabIndex();

  __setSessionStore('tj:tabClaims', { 'item-A': 499 });
  seedPartitions({
    items: [item('item-A', 'https://saved.example/page', 0)],
    drift: { 'item-A': { itemId: 'item-A', driftedToUrl: 'https://drifted.example/page', detectedAt: 1 } },
  });

  await reconcileClaims([item('item-A', 'https://saved.example/page', 0)]);

  const claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-A'], 500, 'pre: Phase 3 bound item-A to tab 500');

  /* The post-B-163 Phase 4 only clears drift for items in `unrecovered =
     evictedItemIds \ Phase-3-bound`. item-A WAS evicted by Phase 1 but
     bound by Phase 3 → excluded from `unrecovered` → drift preserved. */
  const drift = await getDriftRecords();
  assert.ok(
    drift['item-A'],
    'B-163 AC4(A): Phase 4 must NOT clear drift for items re-bound by Phase 3 — drift record corresponds to a claimed item per §10.7',
  );
  assert.equal(
    drift['item-A'].driftedToUrl,
    'https://drifted.example/page',
    'B-163 AC4(A): drift record content unchanged (Phase 4 deferred, no clear, no rewrite)',
  );
});

/* =========================================================================
   T5 — AC4 Scenario B: both URLs miss → Phase 4 clears. Verifies that the
   B-110 §53 PRIMARY-leak fix continues to apply via the new Phase-4
   mechanism (drift cannot persist for a truly-orphaned item).
   ========================================================================= */
test('B-163 T5 (AC4 Scenario B): both URLs miss → Phase 4 clears the truly-orphaned drift record', async () => {
  /* No live tabs at all — both item.url AND driftedToUrl miss. */
  __setMockTabs([]);
  await buildLiveTabIndex();

  __setSessionStore('tj:tabClaims', { 'item-A': 999 });
  seedPartitions({
    items: [item('item-A', 'https://saved.com', 0)],
    drift: { 'item-A': { itemId: 'item-A', driftedToUrl: 'https://drifted.com', detectedAt: 1 } },
  });

  await reconcileClaims([item('item-A', 'https://saved.com', 0)]);

  const claims = __getSessionStore('tj:tabClaims');
  assert.equal(
    claims['item-A'],
    undefined,
    'B-163 AC4(B): item-A stays unclaimed (Phase 1 evicts; Phase 2 misses; Phase 3 misses)',
  );

  const drift = await getDriftRecords();
  assert.equal(
    'item-A' in drift,
    false,
    'B-163 AC4(B): Phase 4 must clear drift when both URL candidates failed — the §10.7 invariant ("drift records only exist for claimed items") is asserted at end of reconcile',
  );
});

/* =========================================================================
   T6 — AC5 inherited-tab skip in Phase 3. The fresh tab at the drifted
   URL is opener-chain-inherited (marked via `markInherited` per B-125 /
   B-132). Phase 3 must NOT bind to it — the inherited candidate is popped
   from `available` without binding; if no other candidate remains, the
   item stays unbound and Phase 4 clears the drift (AC4 Scenario B path).
   ========================================================================= */
test('B-163 T6 (AC5): inherited-tab skip in Phase 3 — inherited candidate is popped without binding (parity with Phase 2)', async () => {
  __setMockTabs([tab(600, 'https://drifted.example/inherited')]);
  await buildLiveTabIndex();

  /* Mark tab 600 as inherited BEFORE reconcile — mirrors what
     preMarkInheritedFromFloatingGroups (background/tabs/floating-groups.js)
     does at the cold-start path before reconcileClaims runs. */
  markInherited(600);

  __setSessionStore('tj:tabClaims', { 'item-X': 999 });
  seedPartitions({
    items: [item('item-X', 'https://saved.example/page', 0)],
    drift: { 'item-X': { itemId: 'item-X', driftedToUrl: 'https://drifted.example/inherited', detectedAt: 1 } },
  });

  await reconcileClaims([item('item-X', 'https://saved.example/page', 0)]);

  const claims = __getSessionStore('tj:tabClaims');
  assert.equal(
    claims['item-X'],
    undefined,
    'B-163 AC5: item-X must NOT bind to an inherited tab in Phase 3 — the B-125 inheritance gate mirrors Phase 2',
  );

  /* No other candidate remained, so the item entered `unrecovered`; Phase
     4 cleared its drift per AC4 Scenario B. */
  const drift = await getDriftRecords();
  assert.equal(
    'item-X' in drift,
    false,
    'B-163 AC5 + AC4(B): inherited skip caused Phase 3 to not bind → Phase 4 cleared the now-orphaned drift',
  );
});

/* =========================================================================
   T7 — AC6 regression guard: the B-149 Phase-1 survival contract is
   PRESERVED by B-163. A drifted-but-live claim (tab survives the idle
   window) is kept by Phase 1's `tabEntry && item` predicate; the item is
   added to `reconciled` directly, never enters `evictedItemIds`, never
   runs through Phase 3 OR Phase 4. Drift record retained.

   Authoritative regression suite is tests/b149-*; this T7 is defense-in-
   depth against an accidental B-163 over-reach (e.g. if a future refactor
   moves a Phase-1 surviving claim into the eviction set).
   ========================================================================= */
test('B-163 T7 (AC6 regression guard): B-149 Phase-1 survival of drifted-but-live claim is preserved end-to-end through Phase 4', async () => {
  /* Tab 700 is alive at the DRIFTED URL — the runtime drift state from
     before the SW slept. Phase 1's `tabEntry && item` returns true → claim
     survives without URL re-check (the B-149 inversion). */
  __setMockTabs([tab(700, 'https://drifted.example/Z')]);
  await buildLiveTabIndex();

  __setSessionStore('tj:tabClaims', { 'item-A': 700 });
  seedPartitions({
    items: [item('item-A', 'https://saved.example/Z', 0)],
    drift: { 'item-A': { itemId: 'item-A', driftedToUrl: 'https://drifted.example/Z', detectedAt: 1 } },
  });

  await reconcileClaims([item('item-A', 'https://saved.example/Z', 0)]);

  const claims = __getSessionStore('tj:tabClaims');
  assert.equal(
    claims['item-A'],
    700,
    'B-163 AC6: B-149 Phase-1 survival contract preserved — drifted-but-live claim survives without Phase-3/4 involvement',
  );

  const drift = await getDriftRecords();
  assert.ok(
    drift['item-A'],
    'B-163 AC6: drift record retained — Phase 1 placed item-A directly in `reconciled`, so it never entered `evictedItemIds` and Phase 4 never touched it',
  );
});

/* =========================================================================
   T8 — AC7 NO-TTL guard. Two assertions run inside one test (no shared
   state — each subcase resets the mock and re-seeds):

   (a) A drift record with `detectedAt: 1` (epoch 1 ms, ~1970, ancient)
       must STILL be eligible for Phase-3 binding.
   (b) The same scenario with `detectedAt: Date.now()` (fresh) must
       produce the IDENTICAL outcome.

   If either subcase deviates from the other, the NO-TTL contract is
   violated. The test exists specifically to catch a future regression
   where someone re-introduces a `Date.now() - record.detectedAt > TTL_MS`
   gate without first re-opening the AC7 product-owner decision.
   ========================================================================= */
test('B-163 T8 (AC7 NO-TTL): drift record age does NOT gate Phase-3 eligibility (no Date.now comparison)', async () => {
  async function runScenario(detectedAt) {
    __resetMock();
    __resetLiveTabIndex();
    __resetTabClaims();
    __setMockTabs([tab(800, 'https://drifted.example/ttl')]);
    await buildLiveTabIndex();
    __setSessionStore('tj:tabClaims', { 'item-T': 999 });
    seedPartitions({
      items: [item('item-T', 'https://saved.example/ttl', 0)],
      drift: { 'item-T': { itemId: 'item-T', driftedToUrl: 'https://drifted.example/ttl', detectedAt } },
    });
    await reconcileClaims([item('item-T', 'https://saved.example/ttl', 0)]);
    return {
      claims: __getSessionStore('tj:tabClaims'),
      drift: await getDriftRecords(),
    };
  }

  /* Subcase A: ancient drift record (epoch 1 ms). */
  const ancient = await runScenario(1);
  assert.equal(
    ancient.claims['item-T'],
    800,
    'B-163 AC7: ancient drift record (detectedAt=1, ~1970) MUST still bind in Phase 3 — no TTL gate',
  );
  assert.ok(ancient.drift['item-T'], 'AC7: ancient drift retained after Phase 3 bind');

  /* Subcase B: fresh drift record (current time). */
  const fresh = await runScenario(Date.now());
  assert.equal(
    fresh.claims['item-T'],
    800,
    'B-163 AC7: fresh drift record MUST also bind in Phase 3 — outcome identical to ancient subcase',
  );
  assert.ok(fresh.drift['item-T'], 'AC7: fresh drift retained after Phase 3 bind');

  /* The two outcomes must be observationally identical. If a TTL gate is
     re-introduced, one of the two subcases will diverge — most likely the
     ancient one (skipped → unbound → Phase 4 clears) — and the assertions
     above will fail at the bound-tab check. */
  assert.equal(
    ancient.claims['item-T'],
    fresh.claims['item-T'],
    'B-163 AC7: ancient and fresh detectedAt values MUST produce identical Phase-3 outcomes (NO-TTL contract)',
  );
});

/* =========================================================================
   T9 — R4 HIGH-1 (S45) regression guard for graceful-degradation on drift
   partition read failure. Without the try/catch added at tab-claims.js:241
   (B-163 R4 fix-round), a corrupt drift record causes `getDriftRecords()`
   to throw `StorageError(ERR_CORRUPT_DATA)` out of Phase 3, which
   propagates BEFORE `writeClaims()` and `claimsReady = true` run — silent
   DoS where every saved item appears offline until browser restart.

   Seed approach: corrupt-data via `seedPartitions` (bypasses validation
   on write), then `readPartition`'s downstream `assertShape` call in
   `getDriftRecords` throws on the non-string `driftedToUrl: 42`.
   Per-key rejection isn't required because the corrupt-data path
   reproduces the identical exception class. Pattern matches
   `tests/b132-cold-start-inheritance.test.js` (B-132 graceful-degradation
   precedent at `background/tabs/index.js:58-62`).

   PASS assertions: (a) `isClaimsReady() === true` proves the catch path
   continued execution past Phase 3 and reached the assignment at
   tab-claims.js:286; (b) `claimsMirror` reflects Phase 1+2 results proves
   `writeClaims()` ran despite the drift failure; (c) `console.warn` fired
   exactly once with the graceful-degradation breadcrumb.
   ========================================================================= */
test('B-163 T9 (R4 HIGH-1): drift partition read failure → graceful degradation; claimsReady=true and Phase 1+2 claims still written', async () => {
  /* One live tab at item-Y's primary URL (Phase 2 should bind Y). The
     stillUnbound set will contain item-X (drifted; no live tab at item.url
     post-restart) — that's what triggers the Phase 3 entry and the
     getDriftRecords() call that we want to fail. */
  __setMockTabs([tab(900, 'https://primary.example/Y')]);
  await buildLiveTabIndex();

  /* Phase 1: both stored claims (X+Y) point at dead tabIds so both enter
     evictedItemIds. Phase 2: Y rebinds via item.url to tab 900; X stays
     unbound → enters the Phase 3 stillUnbound set. */
  __setSessionStore('tj:tabClaims', { 'item-X': 997, 'item-Y': 998 });

  /* Seed CORRUPT drift data: `driftedToUrl: 42` is non-string, which
     causes assertShape (shapes.js:264) to throw inside readPartition →
     getDriftRecords rejects. seedPartitions bypasses write-side validation
     so the corrupt record actually lands in storage. */
  seedPartitions({
    items: [
      item('item-X', 'https://saved.example/X', 0),
      item('item-Y', 'https://primary.example/Y', 1),
    ],
    drift: { 'item-X': { itemId: 'item-X', driftedToUrl: 42, detectedAt: 1 } },
  });

  /* Capture console.warn — mirrors `tests/b036-newtab.test.js:1289-1296`
     and `tests/b035-standalone-window.test.js:148-150` patterns. */
  const originalWarn = console.warn;
  const warnCalls = [];
  console.warn = (...args) => { warnCalls.push(args); };

  try {
    await reconcileClaims([
      item('item-X', 'https://saved.example/X', 0),
      item('item-Y', 'https://primary.example/Y', 1),
    ]);
  } finally {
    console.warn = originalWarn;
  }

  /* PASS (a): claimsReady flipped to true → catch path continued past
     Phase 3 and reached tab-claims.js:286. Pre-fix this would be false
     (the rejection unwound reconcileClaims before the assignment). */
  assert.equal(
    isClaimsReady(),
    true,
    'B-163 R4 HIGH-1: claimsReady MUST flip to true even when getDriftRecords throws — graceful degradation contract',
  );

  /* PASS (b): claimsMirror reflects Phase 1+2 results → writeClaims ran.
     Y was bound by Phase 2; X stayed unbound (Phase 3 was a no-op because
     driftRecords = {} after the catch). Pre-fix the entire claims write
     would be lost because reconcileClaims rejected before line 285. */
  const claims = __getSessionStore('tj:tabClaims');
  assert.equal(
    claims['item-Y'],
    900,
    'B-163 R4 HIGH-1: Phase 2 binding for item-Y MUST be persisted despite drift partition read failure',
  );
  assert.equal(
    claims['item-X'],
    undefined,
    'B-163 R4 HIGH-1: item-X stays unbound (Phase 3 no-op under graceful degradation); no spurious binding',
  );

  /* PASS (c): graceful-degradation path fired exactly once. */
  const matchingWarns = warnCalls.filter((args) =>
    String(args[0]).includes('drift partition read failed'),
  );
  assert.equal(
    matchingWarns.length,
    1,
    'B-163 R4 HIGH-1: console.warn must fire exactly once with the graceful-degradation breadcrumb',
  );
});

/* =========================================================================
   T10 (R4 round-2 fix — extension-reload regression guard)

   Discovered via product-owner empirical UAT 2026-05-22: reloading the
   extension while a bookmark was open in a drifted state left the
   bookmark unclaimed and the tab as an orphan in Open Tabs — the exact
   user-story symptom B-163 was supposed to fix.

   Root cause: the original R3 implementation restricted Phase 3's
   iteration source to `evictedItemIds.filter(id => !(id in reconciled))`.
   On extension reload `chrome.storage.session` is wiped → `storedClaims
   = {}` → Phase 1 has nothing to evict → `evictedItemIds = []` → Phase 3
   skipped entirely. Drifted items with surviving live tabs at
   `driftedToUrl` had no path to re-association.

   The fix (tab-claims.js:239) broadens stillUnbound to ALL items not
   yet in `reconciled`, matching the R1 LOCKED contract wording verbatim
   ("for each item still unbound after Phase-2"). T1-T9 all seed
   `tj:tabClaims` with prior claims so they hit the evictedItemIds path —
   T10 specifically exercises the empty-evictedItemIds + drift-record
   present + live tab at driftedToUrl scenario.

   PASS predicate: after reconcileClaims with EMPTY session storage and a
   live tab at driftedToUrl, the bookmark is bound to that tab via Phase 3.
   Pre-fix this assertion fails (item.url tab does not exist, drift fallback
   never runs because evictedItemIds is empty); post-fix it passes.
   ========================================================================= */
test('B-163 T10 (R4 round-2): extension-reload — empty session storage + drift record + live tab at driftedToUrl binds via Phase 3', async () => {
  /* Live tab at the DRIFTED URL only. The original item.url has no live
     tab (user navigated away then reloaded the extension). */
  __setMockTabs([tab(700, 'https://music.youtube.com/watch?v=xyz')]);
  await buildLiveTabIndex();

  /* CRITICAL: session storage is EMPTY — simulates extension reload via
     chrome://extensions toggle OFF/ON (which wipes chrome.storage.session
     per Chrome docs). Do NOT call __setSessionStore('tj:tabClaims', ...).
     Phase 1 has zero stored claims to validate; evictedItemIds = []; pre-fix
     Phase 3 skipped entirely. */

  /* Seed durable state: items partition has the YouTube Music bookmark;
     drift partition holds the playlist URL the user navigated to before
     reloading. */
  seedPartitions({
    items: [item('item-ytm', 'https://music.youtube.com/', 0)],
    drift: {
      'item-ytm': {
        itemId: 'item-ytm',
        driftedToUrl: 'https://music.youtube.com/watch?v=xyz',
        detectedAt: Date.now(),
      },
    },
  });

  await reconcileClaims([item('item-ytm', 'https://music.youtube.com/', 0)]);

  /* PASS: Phase 3 broadening reached item-ytm despite evictedItemIds being
     empty; bound it to the drifted-URL tab. The user-visible effect: the
     bookmark remains live/claimed and the tab does NOT appear as an orphan
     in the Open Tabs section. */
  const claims = __getSessionStore('tj:tabClaims');
  assert.equal(
    claims['item-ytm'],
    700,
    'B-163 R4 round-2: Phase 3 must bind item-ytm via driftedToUrl even when evictedItemIds is empty (extension-reload scenario)',
  );

  /* AC4(A) parity: drift record retained because Phase 3 re-bound the
     item. Phase 4 stays scoped to evictedItemIds (empty here) so it does
     not touch the drift record either way; runtime detectDriftForTab owns
     the eventual clear when the tab navigates back to item.url. */
  const drift = await getDriftRecords();
  assert.ok(
    drift['item-ytm'],
    'B-163 R4 round-2: drift record retained after Phase-3-via-broadened-scope re-binding',
  );
});

/* =========================================================================
   T11 (B-178 qa M-1 — cross-phase single-winner regression guard)

   B-178 (A4) decomposed the former `reconcileClaims` monolith into named
   phase helpers (`_phase1ValidateClaims` … `_phase4ConditionalDriftDrop`).
   The highest-risk invariant of that decomposition is that the `urlToTabs`
   candidate map is built ONCE by the orchestrator (tab-claims.js:736) and
   shared-mutated across BOTH Phase 2 and Phase 3: `takeUnclaimedTabForUrl`
   shifts the winning candidate off its bucket, so a tab consumed by Phase 2
   is unavailable to Phase 3's drift fallback (the single-winner-per-tab
   invariant — tab-claims.js:730-735 / :570-572).

   T3 only exercises Phase-3-vs-Phase-3 collision (two drift records, one
   tab). NO existing test pins the Phase-2-exhausts-a-bucket-that-Phase-3-
   would-target boundary. A future refactor that rebuilt the map for Phase 3
   (instead of threading the single mutated map) would silently let the
   Phase-3 item ALSO claim the tab Phase 2 already took — a double-binding of
   one live tab to two items, violating §10.5 uniqueness. This test is that
   guard.

   Scenario:
     - ONE live tab (100) at the shared URL X.
     - Item B: item.url = X, sortOrder 0 (lower) → Phase 2 claims tab 100 by
       primary-URL match and pops it off urlToTabs[X].
     - Item A: item.url has NO live tab, sortOrder 1 (higher), but a drift
       record with driftedToUrl = X. A's prior session claim (dead tabId 999)
       evicts in Phase 1 → A enters evictedItemIds (so Phase 4 is eligible to
       drop its drift).
     - Phase 3 consults the SAME urlToTabs map; bucket X is already empty →
       A stays unbound. Phase 4 drops A's now-orphaned drift.

   The load-bearing assertion is (2): A is NOT bound. Under a rebuilt-map
   regression, Phase 3 would re-see tab 100 in bucket X and bind A to it; the
   `claims['item-A'] === undefined` + tab-100-appears-exactly-once assertions
   fail. Asserting only "B is bound" would NOT catch the regression — B binds
   correctly in both the correct and the broken implementation.
   ========================================================================= */
test('B-163 T11 (B-178 qa M-1): Phase 2 consuming a bucket starves Phase 3 — single-winner across the phase boundary', async () => {
  /* ONE live tab at the shared URL X. */
  __setMockTabs([tab(100, 'https://shared.example/X')]);
  await buildLiveTabIndex();

  /* Item A had a prior session claim at the now-dead tabId 999 → Phase 1
     evicts it into evictedItemIds (the Phase-4 drop precondition). Item B
     has no stored claim → Phase 2 auto-claims it. */
  __setSessionStore('tj:tabClaims', { 'item-A': 999 });
  seedPartitions({
    items: [
      item('item-B', 'https://shared.example/X', 0),
      item('item-A', 'https://saved-a.example/orig', 1),
    ],
    /* A's drift points at the SAME URL X that Phase 2 will hand to B. */
    drift: { 'item-A': { itemId: 'item-A', driftedToUrl: 'https://shared.example/X', detectedAt: 1 } },
  });

  await reconcileClaims([
    item('item-B', 'https://shared.example/X', 0),
    item('item-A', 'https://saved-a.example/orig', 1),
  ]);

  const claims = __getSessionStore('tj:tabClaims');

  /* (1) Phase 2 wins the tab via primary-URL match (lower sortOrder). */
  assert.equal(
    claims['item-B'],
    100,
    'B-178 qa M-1: Phase 2 must claim the live tab for item-B via primary item.url match',
  );

  /* (2) THE GUARD — Phase 3 found urlToTabs[X] already drained by Phase 2,
     so item-A must stay UNBOUND. A rebuilt-map regression would let A also
     claim tab 100 here; this assertion is the only thing that catches it. */
  assert.equal(
    claims['item-A'],
    undefined,
    'B-178 qa M-1: item-A must NOT bind — Phase 2 already consumed the shared urlToTabs[X] bucket (single-winner across the phase boundary; a rebuilt map would wrongly let A re-claim tab 100)',
  );

  /* §10.5 uniqueness corollary: tab 100 may appear in the mirror exactly
     once. A double-binding (B via Phase 2 + A via a rebuilt Phase-3 map)
     would make this 2. */
  const tab100Bindings = Object.values(claims).filter((v) => v === 100);
  assert.equal(
    tab100Bindings.length,
    1,
    'B-178 qa M-1: tab 100 must appear in the mirror exactly once — no double-binding across the Phase 2 / Phase 3 boundary',
  );

  /* (3) Phase 4 drops A's drift: A was evicted in Phase 1 and recovered by
     neither Phase 2 nor Phase 3 → truly orphaned → cleared (§10.7). */
  const drift = await getDriftRecords();
  assert.equal(
    'item-A' in drift,
    false,
    'B-178 qa M-1: Phase 4 must clear item-A`s drift — evicted and unrecovered by both Phase 2 and Phase 3',
  );
});
