/**
 * b149-drifted-claim-survives-cold-start.test.js — Sprint 41 polish / B-149
 *
 * B-149 fixes a contract conflict at the SW-cold-start boundary.
 *
 * The B-099 D-1 contract (see `background/tabs/tab-claims.js:233-247`) states
 * that the bookmark↔tab association SURVIVES URL drift — a claimed tab that
 * navigates away from its saved URL keeps the claim. B-099 enforced this on
 * the runtime path (`reevaluateTab`), but the cold-start path
 * (`reconcileClaims` Phase 1) still re-checked URL match against the live tab
 * and EVICTED any claim that no longer URL-matched. Under MV3's ~30 s SW
 * idle-shutdown, this meant every drifted-but-live claim was silently lost
 * the next time `reconcileClaims` ran — exactly the user-reported repro
 * ("idle a few minutes, drifted tab loses its claim association").
 *
 * The fix: drop the URL-match clause from Phase 1's survival predicate.
 * Phase 1 now keeps a claim iff `tabEntry && item` (live tab + saved item
 * both still exist). Drift is owned by `detectDriftForTab` and is independent
 * of claim survival.
 *
 * The historical regression-guard `tests/b110-drift-non-live-fix.test.js:242
 * -261` (T5) inadvertently pinned the buggy URL-match eviction as desired
 * behavior; that test was inverted as part of the B-149 fix. The legitimate
 * eviction case (tab missing from LiveTabIndex) is unchanged and still
 * covered by T4 + the updated T6 in `b110-drift-non-live-fix.test.js`. See
 * `docs/findings/post-s41-pre-merge-triage.md` § "B-149 R0 Spike".
 *
 * Coverage map:
 *
 *   T1 — primary repro: drifted-but-live claim SURVIVES `reconcileClaims`
 *        cold-start. Setup: claim T_orig→item_A; navigate T_orig to a
 *        different URL; mark drifted; clear in-memory mirror via
 *        `__resetTabClaims` to simulate SW idle restart; call
 *        `reconcileClaims(items)`. Assert: claim survives, drift record
 *        survives, `buildLiveStates` reflects live=true.
 *
 *   T2 — regression guard for legitimate non-live eviction: a claim
 *        whose tab is GONE from `LiveTabIndex` IS evicted. The B-110
 *        primary leak fix continues to apply.
 *
 *   T3 — happy-path regression guard: a claim where URL still matches
 *        AND tab still live → survives Phase 1 unchanged.
 *
 *   T4 — durability: a drifted claim survives 2 successive cold-start
 *        cycles (the fix is not a one-shot artifact — re-running reconcile
 *        does not slowly chip away at the surviving claim).
 *
 * SW idle-shutdown is reproduced by directly clearing the in-memory
 * claimsMirror via `__resetTabClaims`, re-seeding it via `__setClaimsMirror`
 * (post-B-179 the mirror is reconcile's Phase-1 input, and on a real cold
 * start `hydrateClaimsMirrorFromDurable` re-seeds it from the durable
 * `tj:itemClaims` partition the prior reconcile's W-1 persisted), then
 * re-running `reconcileClaims` — which now reads the mirror snapshot.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetMock,
  __setMockTabs,
  seedPartitions,
} from './chrome-mock.js';
import {
  buildLiveTabIndex,
  updateTabEntry,
  __resetLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import {
  reconcileClaims,
  reevaluateTab,
  buildLiveStates,
  __resetTabClaims,
  getClaimsMirror,
  __setClaimsMirror,
} from '../background/tabs/tab-claims.js';
import {
  detectDriftForTab,
  getDriftRecords,
} from '../background/tabs/drift.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

/* =========================================================================
   T1 — primary repro: drifted-but-live claim survives a cold-start
   reconcile. Pre-B-149 this assertion would have FAILED at the post-cold-
   start `claims['item-A']` check; post-fix the claim survives both Phase 1
   and the in-memory mirror, and `buildLiveStates` reports live=true.
   ========================================================================= */
test('B-149 T1: drifted-but-live claim SURVIVES reconcileClaims cold-start (B-099 D-1 contract enforced at the cold-start boundary)', async () => {
  /* Establish the initial claim — tab 100 at the saved URL. */
  __setMockTabs([
    { id: 100, url: 'https://saved.example/page', windowId: 1, active: false, audible: false, favIconUrl: '', index: 0 },
  ]);
  await buildLiveTabIndex();

  const items = [{ id: 'item-A', url: 'https://saved.example/page', sortOrder: 0 }];
  await reconcileClaims(items);

  /* Sanity: claim established, no drift. */
  assert.equal(getClaimsMirror()['item-A'], 100, 'pre-condition: item-A claimed by tab 100');
  let drift = await getDriftRecords();
  assert.equal('item-A' in drift, false, 'pre-condition: no drift yet');

  /* Drift the tab — exact runtime path tab-events.js fires. */
  updateTabEntry(100, { url: 'https://drifted.example/foo' });
  await reevaluateTab(100, 'https://drifted.example/foo', items);
  await detectDriftForTab(100, 'https://drifted.example/foo', items);

  /* Sanity: B-099 D-1 holds at runtime — claim preserved, drift recorded. */
  assert.equal(getClaimsMirror()['item-A'], 100, 'B-099 D-1 (runtime): claim preserved across URL drift');
  drift = await getDriftRecords();
  assert.ok(drift['item-A'], 'drift record written by detectDriftForTab');
  assert.equal(drift['item-A'].driftedToUrl, 'https://drifted.example/foo');

  /* Simulate SW idle-shutdown: clear the in-memory claimsMirror so the
     subsequent reconcileClaims call must re-read its Phase-1 input from the
     (re-seeded) mirror. This mirrors what happens in production when MV3
     terminates the SW after ~30 s idle and a tab event respawns it; the
     durable tj:itemClaims and tj:drift partitions are intact in storage but
     the in-memory module state is fresh. The LiveTabIndex is also rebuilt
     from chrome.tabs.query — the tab is still alive, still at the drifted
     URL. */
  __resetLiveTabIndex();
  __resetTabClaims();
  __setMockTabs([
    { id: 100, url: 'https://drifted.example/foo', windowId: 1, active: false, audible: false, favIconUrl: '', index: 0 },
  ]);
  await buildLiveTabIndex();

  /* Re-seed the mirror + tj:drift to mirror the production cold-start state.
     Post-B-179 the SW-restart recovery path is hydrateClaimsMirrorFromDurable,
     which re-seeds claimsMirror from the durable tj:itemClaims partition the
     previous reconcile's W-1 persisted; we stand in for that hydrate by
     seeding the mirror directly. The drift partition (local) survives the
     restart unchanged. */
  seedPartitions({
    drift: { 'item-A': { itemId: 'item-A', driftedToUrl: 'https://drifted.example/foo', detectedAt: 1 } },
  });
  __setClaimsMirror({ 'item-A': 100 });
  assert.equal(getClaimsMirror()['item-A'], 100, 'pre-condition: durable-hydrated mirror still holds item-A → 100 after SW restart');

  /* Run cold-start reconcile. */
  await reconcileClaims(items);

  /* B-149 fix: claim SURVIVES Phase 1 (the URL-match clause has been
     dropped from the survival predicate). */
  assert.equal(
    getClaimsMirror()['item-A'],
    100,
    'B-149: drifted-but-live claim must SURVIVE cold-start reconcile (the runtime B-099 D-1 contract is now enforced at the cold-start boundary too)',
  );

  /* Drift record also survives — drift is owned by detectDriftForTab and
     is independent of claim survival; B-149 stops the paired-clear that
     b110 erroneously coupled to URL-mismatch eviction. */
  drift = await getDriftRecords();
  assert.ok(
    drift['item-A'],
    'B-149: drift record paired with a surviving claim is retained — not paired-cleared at cold-start',
  );

  /* buildLiveStates reflects live=true: the row will continue to render
     as a live, drifted tab in the sidepanel. */
  const states = buildLiveStates(items);
  assert.equal(states['item-A'].live, true, 'B-149: live state reflects the surviving claim');
  assert.equal(states['item-A'].tabId, 100, 'B-149: tabId surfaced for the live, drifted row');
});

/* =========================================================================
   T2 — regression guard: a non-live drifted claim (tab GONE) IS still
   evicted. The B-110 PRIMARY leak fix continues to apply post-B-149 — the
   `tabEntry && item` predicate still rejects the missing-tab case.

   B-163 §70 update (Sprint 45): the §53 paired-clear is now DEFERRED to
   Phase 4 by B-163. For T2's scenario (missing tab, drift URL with no
   live tab in the mock), Phase 3 has no candidate to bind → both URLs
   miss → Phase 4 fires `clearDrift('item-A')`. The Phase-1 survival
   contract (the B-149 inversion) is unchanged by B-163 — Phase 1's
   `tabEntry && item` predicate is the only gate that determines whether
   an item enters `evictedItemIds`; B-163 only changes what happens
   AFTERWARDS for the evicted set. Assertion unchanged.
   ========================================================================= */
test('B-149 T2 (regression guard): non-live drifted claim (tab missing) IS still evicted at cold-start', async () => {
  /* Seed the post-sleep state directly: claim persisted, drift record
     persisted, but the tab is GONE (closed during SW sleep — onRemoved
     never fired). LiveTabIndex will be empty after buildLiveTabIndex. */
  seedPartitions({
    items: [{ id: 'item-A', url: 'https://saved.example/page', title: 'A', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 }],
    drift: { 'item-A': { itemId: 'item-A', driftedToUrl: 'https://drifted.example/foo', detectedAt: 1 } },
  });
  /* Pre-existing claim in the hydrated mirror — but no live tab matches
     tabId 100 (the tab was closed during SW sleep). */
  __setClaimsMirror({ 'item-A': 100 });
  __setMockTabs([]);
  await buildLiveTabIndex();

  await reconcileClaims([{ id: 'item-A', url: 'https://saved.example/page', sortOrder: 0 }]);

  const claims = getClaimsMirror();
  assert.equal(
    claims['item-A'],
    undefined,
    'B-110 PRIMARY (still applies post-B-149): missing-tab eviction continues to drop the claim',
  );

  /* B-163 Phase 4 fires for the legitimately-evicted-AND-unrecovered
     claim (no live tab matches item.url, no live tab matches the drift
     URL either — both URL candidates miss). The pre-B-163 mechanism was
     the §53 paired-clear; the post-B-163 mechanism is Phase 4; the
     outcome (drift record absent) is identical. */
  const drift = await getDriftRecords();
  assert.equal(
    'item-A' in drift,
    false,
    'B-110: drift record paired-cleared on legitimate (missing-tab) eviction',
  );
});

/* =========================================================================
   T3 — happy-path regression guard: a claim where URL still matches AND
   tab still live → survives Phase 1 unchanged. Pre- and post-B-149 both
   accept this case; the test exists so a future refactor that breaks the
   `tabEntry && item` predicate is caught immediately.
   ========================================================================= */
test('B-149 T3 (happy-path regression guard): URL-matching live claim survives Phase 1', async () => {
  __setMockTabs([
    { id: 200, url: 'https://saved.example/q', windowId: 1, active: false, audible: false, favIconUrl: '', index: 0 },
  ]);
  await buildLiveTabIndex();

  const items = [{ id: 'item-B', url: 'https://saved.example/q', sortOrder: 0 }];
  await reconcileClaims(items);

  /* Cold-start: clear in-memory mirror, re-seed it from durable (the
     hydrate stand-in), rebuild index, reconcile again. Tab is still alive at
     the saved URL — Phase 1 must keep the claim. */
  __resetLiveTabIndex();
  __resetTabClaims();
  __setMockTabs([
    { id: 200, url: 'https://saved.example/q', windowId: 1, active: false, audible: false, favIconUrl: '', index: 0 },
  ]);
  await buildLiveTabIndex();
  __setClaimsMirror({ 'item-B': 200 });
  await reconcileClaims(items);

  assert.equal(
    getClaimsMirror()['item-B'],
    200,
    'happy path: URL-matching live claim survives cold-start reconcile',
  );
});

/* =========================================================================
   T4 — durability: a drifted claim survives 2 successive cold-start
   cycles. Verifies the fix is not a one-shot artifact — re-running
   reconcileClaims does not slowly chip away at the surviving claim, and
   the drift record continues to be retained. This is the user repro
   ("idle a few minutes" can produce repeated SW restarts within a
   browsing session).
   ========================================================================= */
test('B-149 T4 (durability): drifted claim survives 2 successive cold-start reconciles', async () => {
  __setMockTabs([
    { id: 300, url: 'https://saved.example/r', windowId: 1, active: false, audible: false, favIconUrl: '', index: 0 },
  ]);
  await buildLiveTabIndex();

  const items = [{ id: 'item-C', url: 'https://saved.example/r', sortOrder: 0 }];
  await reconcileClaims(items);

  /* Drift the tab. */
  updateTabEntry(300, { url: 'https://drifted.example/r' });
  await reevaluateTab(300, 'https://drifted.example/r', items);
  await detectDriftForTab(300, 'https://drifted.example/r', items);
  assert.equal(getClaimsMirror()['item-C'], 300, 'pre: claim preserved at runtime');
  let drift = await getDriftRecords();
  assert.ok(drift['item-C'], 'pre: drift recorded');

  /* Cold-start cycle #1: SW idle-shutdown + respawn. hydrate re-seeds the
     mirror from durable (stand-in: __setClaimsMirror) so Phase 1 sees the
     drifted-but-live claim. */
  __resetLiveTabIndex();
  __resetTabClaims();
  __setMockTabs([
    { id: 300, url: 'https://drifted.example/r', windowId: 1, active: false, audible: false, favIconUrl: '', index: 0 },
  ]);
  await buildLiveTabIndex();
  __setClaimsMirror({ 'item-C': 300 });
  await reconcileClaims(items);

  assert.equal(
    getClaimsMirror()['item-C'],
    300,
    'cycle #1: drifted claim survives first cold-start',
  );
  drift = await getDriftRecords();
  assert.ok(drift['item-C'], 'cycle #1: drift record retained');

  /* Cold-start cycle #2: another SW idle-shutdown + respawn (still no
     navigation back to the saved URL). hydrate re-seeds the mirror again. */
  __resetLiveTabIndex();
  __resetTabClaims();
  __setMockTabs([
    { id: 300, url: 'https://drifted.example/r', windowId: 1, active: false, audible: false, favIconUrl: '', index: 0 },
  ]);
  await buildLiveTabIndex();
  __setClaimsMirror({ 'item-C': 300 });
  await reconcileClaims(items);

  assert.equal(
    getClaimsMirror()['item-C'],
    300,
    'cycle #2: drifted claim survives a second cold-start (fix is durable, not a one-shot artifact)',
  );
  drift = await getDriftRecords();
  assert.ok(drift['item-C'], 'cycle #2: drift record retained across both cycles');
});
