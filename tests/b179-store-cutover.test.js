/**
 * B-179 — Store cutover (durable-only claim store) tests (Sprint 47).
 *
 * Pins the one-cold-start `tj:tabClaims` (session) → durable compat shim
 * (`foldLegacySessionClaims`, called from `hydrateClaimsMirrorFromDurable`)
 * that §75.9.3 #2 specified but was never written, plus the R4 security-MEDIUM
 * FIX-1 data-integrity gate: the legacy session key is removed ONLY after a
 * CONFIRMED durable persist, so a failed durable write can never strand claims
 * in neither store.
 *
 * Cross-reference: docs/design/75-b-179-store-cutover-design.md (R2 chapter,
 * §75.4.3 shim + §75.9.3 #2 test spec).
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetMock,
  __setMockTabs,
  __setSessionStore,
  __getSessionStore,
  __getSessionSetCount,
  __triggerQuotaOnNextSet,
  seedPartitions,
} from './chrome-mock.js';
import {
  buildLiveTabIndex,
  __resetLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import {
  hydrateClaimsMirrorFromDurable,
  getItemIdForTab,
  isClaimsReady,
  __resetTabClaims,
  __getSessionTagForTest,
  __setSessionTagForTest,
} from '../background/tabs/tab-claims.js';
import { readPartition } from '../background/storage/partitions.js';
import {
  PARTITION_ITEM_CLAIMS,
  ITEM_CLAIMS_SCHEMA_VERSION,
} from '../background/storage/shapes.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

// ---- Helpers --------------------------------------------------------------

function tab(id, url, windowId = 1, index = 0, overrides = {}) {
  return {
    id, url, title: '', windowId, active: false, audible: false,
    favIconUrl: '', index, ...overrides,
  };
}

/** Durable tj:itemClaims partition fixture. */
function durable(sessionTag, entries) {
  return { schemaVersion: ITEM_CLAIMS_SCHEMA_VERSION, sessionTag, entries };
}

/** Single durable entry. */
function entry(tabId, sessionTag, claimedAt = 100) {
  return { tabId, claimedAt, sessionTag };
}

/* =========================================================================
   T1 — Compat-shim happy path (§75.9.3 #2).

   The PRIOR (pre-B-179) build persisted claims to tj:tabClaims (session) only.
   On the first cold start after the update, the durable partition is empty/
   untrusted but a legacy session value survives (SW-restart-within-session at
   the upgrade boundary). The shim must: fold the session value into the mirror,
   W-1-stamp durable, then remove the session key for good.
   ========================================================================= */
test('B-179 T1 (§75.9.3 #2): compat shim folds legacy session → mirror + durable, then removes the session key', async () => {
  __setMockTabs([tab(300, 'https://saved.com/S', 1, 0, { active: true })]);
  await buildLiveTabIndex();

  // Legacy session value survives the code swap; durable is empty (default
  // shape ⇒ sessionMatches=false ⇒ the shim runs).
  __setSessionStore('tj:tabClaims', { 'item-S': 300 });
  seedPartitions({ itemClaims: durable('', {}) });

  await hydrateClaimsMirrorFromDurable();

  // (a) mirror bound from the folded session value.
  assert.equal(getItemIdForTab(300), 'item-S', 'mirror bound from the folded legacy session claim');

  // (b) durable stamped from the folded set (W-1 full-replace).
  const stamped = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.equal(stamped.entries['item-S'].tabId, 300, 'durable W-1-stamped the folded claim');
  assert.ok(stamped.sessionTag.length > 0, 'durable carries a settled (non-empty) sessionTag after the fold');

  // (c) legacy session key removed for good — bounds the shim to ONE cold start.
  assert.equal(__getSessionStore('tj:tabClaims'), undefined, 'legacy session key removed after a confirmed durable persist');
});

/* =========================================================================
   T2 — One-cold-start bounding / idempotency (§75.9.3 #2).

   After T1's remove, the session key is absent on every subsequent cold start.
   A second cold start (the post-shim steady state) must bind from durable via
   the sessionMatches FAST PATH — NOT re-run the shim. Proof that the shim did
   not run: the durable sessionTag is ADOPTED (steady-state) rather than the
   shim minting/folding a fresh one, and no session write/remove occurs.
   ========================================================================= */
test('B-179 T2 (§75.9.3 #2): second cold start binds from durable via the fast path — the shim does not re-run', async () => {
  __setMockTabs([tab(300, 'https://saved.com/S', 1, 0, { active: true })]);
  await buildLiveTabIndex();

  // Post-shim steady state: durable holds the claim stamped with a trusted tag;
  // the session key is already absent (removed by the one-cold-start shim).
  seedPartitions({
    itemClaims: durable('restart-tag', { 'item-S': entry(300, 'restart-tag') }),
  });
  // NO __setSessionStore — the session key is gone forever after the first shim.

  await hydrateClaimsMirrorFromDurable();

  assert.equal(getItemIdForTab(300), 'item-S', 'second cold start binds from durable, still on tab 300');
  // Steady-state fast path ADOPTS the durable tag; the shim would have minted a
  // fresh one. Adoption proves foldLegacySessionClaims was skipped.
  assert.equal(__getSessionTagForTest(), 'restart-tag', 'durable tag adopted ⇒ sessionMatches fast path, shim did NOT re-run');
  assert.equal(__getSessionStore('tj:tabClaims'), undefined, 'no session value ever re-appears post-cutover');
  assert.equal(__getSessionSetCount('tj:tabClaims'), 0, 'the steady-state path writes the session store zero times');
});

/* =========================================================================
   T3 — FIX-1 failure gate (R4 security MEDIUM, data integrity).

   If the durable persist fails during the shim (quota / storage rejection, or
   the empty-sessionTag guard), the legacy session key MUST be RETAINED so the
   next cold start retries the fold. A failed persist must never leave claims in
   NEITHER store. This test forces the W-1 durable write to reject and asserts
   the session key survives + the folded claims remain live in the mirror.
   ========================================================================= */
test('B-179 T3 (FIX-1): a failed durable persist RETAINS the legacy session key so claims survive to retry', async () => {
  __setMockTabs([tab(300, 'https://saved.com/S', 1, 0, { active: true })]);
  await buildLiveTabIndex();

  __setSessionStore('tj:tabClaims', { 'item-S': 300 });
  seedPartitions({ itemClaims: durable('', {}) });

  // Pre-settle the sessionTag so ensureSessionTag() short-circuits without a
  // local.set — that way the quota flag deterministically hits the NEXT
  // local.set, which is durableMirrorFullReplace's W-1 writeTransaction.
  __setSessionTagForTest('fail-tag');
  __triggerQuotaOnNextSet();

  await hydrateClaimsMirrorFromDurable();

  // The folded claims still live in the mirror for THIS SW lifetime.
  assert.equal(getItemIdForTab(300), 'item-S', 'folded claims remain live in the mirror this SW lifetime');

  // The durable persist did NOT land (the W-1 write rejected).
  const afterFail = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.equal(afterFail.entries['item-S'], undefined, 'durable persist did not land (W-1 write rejected)');

  // GATE: the legacy session key is RETAINED so the next cold start retries —
  // claims are never stranded in neither store.
  assert.deepEqual(
    __getSessionStore('tj:tabClaims'),
    { 'item-S': 300 },
    'FIX-1: session key retained after a failed durable persist (claims survive to retry)',
  );
});

/* =========================================================================
   T4 — Empty-session steady state (no shim, no claims).

   With no durable claims AND no legacy session value, the shim is a no-op and
   the mirror stays empty (reconcile inference is the backstop). Confirms the
   shim's get/remove pair never fabricates a session write.
   ========================================================================= */
test('B-179 T4: empty durable + absent session ⇒ shim no-op, no session write, mirror empty', async () => {
  __setMockTabs([tab(300, 'https://saved.com/S', 1, 0)]);
  await buildLiveTabIndex();

  seedPartitions({ itemClaims: durable('', {}) });
  // No session value seeded.

  await hydrateClaimsMirrorFromDurable();

  assert.equal(getItemIdForTab(300), null, 'no claim bound (nothing to fold)');
  assert.equal(__getSessionSetCount('tj:tabClaims'), 0, 'cutover never writes the retired session store');
  assert.equal(isClaimsReady(), false, 'hydrate alone does not flip claimsReady (reconcile does)');
});
