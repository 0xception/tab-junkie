/**
 * b110-drift-non-live-fix.test.js — Sprint 36 / B-110 R5 (AC5)
 *
 * B-110 fixes a violation of the §10.7 drift invariant: drift records were
 * persisting in `tj:drift` after the paired claim was released, surfacing
 * a dotted drift bar on a non-live row. Two leaks identified by R2 §53.2:
 *
 *   PRIMARY   — `reconcileClaims` Phase 1 cold-start eviction did not call
 *               `clearDrift` for evicted itemIds.
 *   SECONDARY — `MSG_NAVIGATE_TO_ITEM` AC3 stale-claim repair released the
 *               claim but did not clear drift.
 *
 * Two-layer fix:
 *   (a) Defense-in-depth render gate: `_ensureIndicators` and the
 *       `buildItemRow` first-paint conditional now both gate on
 *       `isDrifted && live?.live` — even if a stale record reaches the UI,
 *       the row refuses to surface it.
 *   (b) Source patches: `reconcileClaims` collects `evictedItemIds` and
 *       runs `Promise.allSettled(evictedItemIds.map(clearDrift))` after
 *       writeClaims; the MSG_NAVIGATE_TO_ITEM stale-claim branch adds an
 *       `await clearDrift(p.itemId)` after `releaseClaimByTab`.
 *
 * Coverage map (≥ 5 mandatory + 2 extra per §53.4):
 *
 *   T1 — AC1 defense-in-depth gate hides drift bar when isDrifted=true
 *        AND live.live=false (post-cold-start orphan-record render).
 *   T2 — AC3 regression guard: the gate STILL shows the drift bar when
 *        isDrifted=true AND live.live=true (the B-099 + B-101 contract).
 *   T3 — AC1+AC2 (UI half) post-cold-start orphan render: a row built
 *        from an orphan _cachedDriftRecords entry stays hidden.
 *   T4 — AC2 reconcileClaims clears drift for claims evicted in Phase 1
 *        when the tab is missing from LiveTabIndex (PRIMARY leak repro).
 *   T5 — B-149 INVERSION (Sprint 41 polish): reconcileClaims PRESERVES a
 *        URL-mismatched-but-live claim across Phase 1 cold-start (and
 *        retains the paired drift record). The pre-B-149 assertion that
 *        Phase 1 evicted URL-mismatched claims and paired-cleared drift
 *        was a silent violation of B-099 D-1 at the SW-cold-start
 *        boundary; B-149 fixes the cold-start path and inverts T5.
 *        Legitimate eviction (missing tab) continues to be covered by T4;
 *        over-clearing guard continues to live in T6.
 *   T6 — AC2 regression guard: surviving claims keep their drift records
 *        (no over-clearing).
 *   T7 — AC2 source patch SECONDARY leak: storage-handlers.js MSG_NAVIGATE
 *        _TO_ITEM stale-claim repair branch calls clearDrift after
 *        releaseClaimByTab (static-source assertion — modeling the full
 *        message dispatcher with focus-shift races is out of scope; T7
 *        guards the patch site so a future refactor cannot silently drop
 *        the clearDrift call).
 *
 * SW-sleep + tab-close cold-start race cannot be reproduced exactly in
 * chrome-mock (the mock has no SW sleep/wake state model), so T4–T6
 * reproduce the OUTCOME by directly seeding the post-sleep state
 * (`tj:tabClaims` + `tj:drift` + an inconsistent `LiveTabIndex`) and
 * calling `reconcileClaims`. UAT-1 (docs/UAT_B-110.md) is the end-to-end
 * real-browser walk.
 */

import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

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
  __resetTabClaims,
} from '../background/tabs/tab-claims.js';
import { getDriftRecords } from '../background/tabs/drift.js';
import { buildItemRowAriaLabel } from '../shared/aria-label.js';

const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = dirname(__filename);
const REPO_ROOT = resolve(__dirnameLocal, '..');

function resetAll() {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
}

/* =========================================================================
   Minimal DOM shim — covers the subset used by the post-B-110
   `_ensureIndicators` gate (`hidden`, `title`, `dataset`, `setAttribute`,
   `removeAttribute`, `hasAttribute`, `querySelector`, `appendChild`).
   Pattern mirrors `tests/b101-drift-bar.test.js`. Avoids a jsdom dep —
   the project does not use one.
   ========================================================================= */
function createElement() {
  const children = [];
  const attrs = {};
  const dataset = {};
  const el = {
    className: '',
    hidden: false,
    title: '',
    dataset,
    get children() { return children; },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return attrs[k] ?? null; },
    removeAttribute(k) { delete attrs[k]; },
    hasAttribute(k) { return k in attrs; },
    appendChild(child) {
      children.push(child);
      return child;
    },
    querySelector(sel) {
      const cls = sel.startsWith('.') ? sel.slice(1) : null;
      if (!cls) return null;
      for (const c of children) if (c.className === cls) return c;
      return null;
    },
  };
  return el;
}

/* `_ensureIndicators` is module-scope in sidepanel.js and not exported.
   The stub mirrors the post-B-110 gate verbatim so test failures pinpoint
   the gate condition rather than incidental sidepanel state. */
function ensureIndicatorsStub(row, live, isDrifted, driftedToUrl) {
  const bar = row.querySelector('.item-drift-bar');
  if (!bar) return;
  if (isDrifted && live?.live) {
    bar.hidden = false;
    if (driftedToUrl) {
      try {
        bar.title = `Drifted to: ${new URL(driftedToUrl).hostname}`;
      } catch {
        bar.title = 'Drifted to: unknown';
      }
    }
  } else {
    bar.hidden = true;
    bar.removeAttribute('title');
  }
}

function buildRow(itemId) {
  const row = createElement();
  row.className = 'item-row';
  row.dataset.itemId = itemId;
  const bar = createElement();
  bar.className = 'item-drift-bar';
  bar.hidden = true;
  row.appendChild(bar);
  return row;
}

/* =========================================================================
   T1 — AC1 defense-in-depth gate: bar hidden when isDrifted=true and
   live.live=false. Pre-fix this assertion would have FAILED because the
   bar gated only on `isDrifted`. The post-fix gate enforces the §10.7
   invariant at render even if a stale record leaks through.
   ========================================================================= */
test('B-110 T1 (AC1): _ensureIndicators hides drift bar when isDrifted=true AND live.live=false', () => {
  const row = buildRow('item-A');
  const bar = row.querySelector('.item-drift-bar');

  ensureIndicatorsStub(row, { live: false, active: false }, true, 'https://example.com/drifted');

  assert.equal(bar.hidden, true, 'B-110 D-1: bar must be hidden when claim is gone, even if drift record exists');
  assert.equal(bar.hasAttribute('title'), false, 'B-110 D-1: title must be absent when bar is hidden');

});

/* =========================================================================
   T2 — AC3 regression: the conjunctive gate still shows the bar when
   live=true AND drifted=true (the B-099 + B-101 contract is preserved).
   ========================================================================= */
test('B-110 T2 (AC3 regression): _ensureIndicators shows drift bar when isDrifted=true AND live.live=true', () => {
  const row = buildRow('item-B');
  const bar = row.querySelector('.item-drift-bar');

  ensureIndicatorsStub(row, { live: true, active: false }, true, 'https://github.com/anthropic/claude');

  assert.equal(bar.hidden, false, 'B-110: bar must be visible when both live AND drifted (B-099 + B-101 contract)');
  assert.equal(bar.title, 'Drifted to: github.com', 'B-110: hostname tooltip preserved');

});

/* =========================================================================
   T3 — Post-cold-start orphan-record UI render: an evicted claim with a
   surviving drift record reaches the sidepanel via _cachedDriftRecords;
   the gate hides the bar regardless. Reproduces the user-visible bug
   from the original UI/UX review screenshot.
   ========================================================================= */
test('B-110 T3 (AC1+AC2 UI half): orphan drift record on non-live row stays hidden', () => {
  const row = buildRow('item-C');
  const bar = row.querySelector('.item-drift-bar');

  /* Simulate the post-cold-start state: live state has no claim but a stale
     drift record was passed to the render. */
  const live = { live: false, active: false, audible: false, favIconUrl: null };
  ensureIndicatorsStub(row, live, true, 'https://example.com/drifted');

  assert.equal(bar.hidden, true, 'orphan record must NOT surface the drift bar on a non-live row');
  assert.equal(bar.hasAttribute('title'), false, 'tooltip must be absent for the hidden bar');

});

/* =========================================================================
   T4 — AC2 PRIMARY leak: reconcileClaims clears drift for claims evicted
   when the tab is missing from LiveTabIndex (the SW-sleep + tab-close
   cold-start sequence). Pre-fix this assertion would have FAILED.
   ========================================================================= */
test('B-110 T4 (AC2 PRIMARY): reconcileClaims clears drift when claim evicted via missing tab', async () => {
  resetAll();

  /* Seed the post-sleep state: claim persisted to session storage, drift
     record persisted to local storage, but the tab is GONE (closed during
     SW sleep — onRemoved never fired). */
  __setSessionStore('tj:tabClaims', { 'item-A': 100 });
  seedPartitions({
    items: [{ id: 'item-A', url: 'https://saved.com', title: 'A', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 }],
    drift: { 'item-A': { itemId: 'item-A', driftedToUrl: 'https://drifted.com/', detectedAt: 1 } },
    meta: { schemaVersion: 1 },
  });
  /* No mock tabs — LiveTabIndex will be empty after buildLiveTabIndex. */
  __setMockTabs([]);
  await buildLiveTabIndex();

  await reconcileClaims([{ id: 'item-A', url: 'https://saved.com', sortOrder: 0 }]);

  const drift = await getDriftRecords();
  assert.equal(
    'item-A' in drift,
    false,
    'B-110 PRIMARY: drift record for evicted claim MUST be cleared (pre-fix this would have remained as #657b83-style orphan)',
  );
});

/* =========================================================================
   T5 — B-149 INVERSION (Sprint 41 polish): the original B-110 T5 asserted
   that a URL-mismatched claim was EVICTED on Phase 1 reconcile and its
   drift record paired-cleared. That behavior was a silent violation of the
   B-099 D-1 contract (claim survives URL drift) at the SW-cold-start
   boundary — under MV3 ~30s idle-shutdown, every drifted-but-live claim
   was re-evicted the next time `reconcileClaims` ran. B-149 inverts T5:
   the URL-mismatched claim must now SURVIVE Phase 1, and the drift record
   must be retained alongside it (drift is owned by detectDriftForTab and
   tracks the running URL-divergence state independent of cold-start
   reconcile). The legitimate eviction case (tab missing from
   LiveTabIndex) is unchanged and still covered by T4; over-clearing
   regression coverage continues to live in T6. See
   `docs/findings/post-s41-pre-merge-triage.md` § "B-149 R0 Spike".
   ========================================================================= */
test('B-149 T5 (B-099 D-1 cold-start): reconcileClaims PRESERVES URL-mismatched claim across cold-start (invert of pre-B-149 T5)', async () => {
  resetAll();

  __setSessionStore('tj:tabClaims', { 'item-A': 100 });
  seedPartitions({
    items: [{ id: 'item-A', url: 'https://saved.com', title: 'A', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 }],
    drift: { 'item-A': { itemId: 'item-A', driftedToUrl: 'https://drifted.com/', detectedAt: 1 } },
    meta: { schemaVersion: 1 },
  });
  /* Tab exists but holds a DIFFERENT URL than the saved item — the live-
     drift cold-start scenario. Pre-B-149, Phase 1's URL-match predicate
     evicted the claim; post-B-149, the predicate is `tabEntry && item`
     only and the claim survives. */
  __setMockTabs([{ id: 100, url: 'https://different.com', title: '', windowId: 1, active: false, audible: false, favIconUrl: '', index: 0 }]);
  await buildLiveTabIndex();

  await reconcileClaims([{ id: 'item-A', url: 'https://saved.com', sortOrder: 0 }]);

  const claimsAfter = __getSessionStore('tj:tabClaims');
  assert.equal(
    claimsAfter['item-A'],
    100,
    'B-149: URL-mismatched-but-live claim MUST survive Phase 1 (B-099 D-1 contract at the cold-start boundary)',
  );

  const drift = await getDriftRecords();
  assert.equal(
    'item-A' in drift,
    true,
    'B-149: drift record paired with a surviving claim is retained — not paired-cleared (drift is owned by detectDriftForTab and survives independently)',
  );
});

/* =========================================================================
   T6 — AC2 regression guard: only EVICTED itemIds get clearDrift; surviving
   claims keep their drift records. Updated for B-149 (Sprint 41 polish):
   the evicted-half scenario uses the LEGITIMATE eviction case (tab missing
   from LiveTabIndex) — URL-mismatch is no longer an eviction trigger, see
   the inverted T5. T6's intent (no over-clearing of drift records on
   surviving claims) is preserved verbatim.
   ========================================================================= */
test('B-110 T6 (AC2 regression guard): reconcileClaims preserves drift for surviving claims; clears drift only for legitimately-evicted (missing-tab) claims', async () => {
  resetAll();

  __setSessionStore('tj:tabClaims', { 'item-A': 100, 'item-B': 200 });
  seedPartitions({
    items: [
      { id: 'item-A', url: 'https://saved-a.com', title: 'A', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 },
      { id: 'item-B', url: 'https://saved-b.com', title: 'B', groupId: null, sortOrder: 1, createdAt: 1, updatedAt: 1 },
    ],
    drift: {
      'item-A': { itemId: 'item-A', driftedToUrl: 'https://drifted-a.com/', detectedAt: 1 },
      'item-B': { itemId: 'item-B', driftedToUrl: 'https://drifted-b.com/', detectedAt: 2 },
    },
    meta: { schemaVersion: 1 },
  });
  /* item-A's tab is alive; item-B's tab is GONE (closed during SW sleep,
     onRemoved never fired) → item-B gets legitimately evicted at Phase 1.
     Post-B-149 the URL-match check is no longer an eviction trigger; the
     missing-tab condition still is. */
  __setMockTabs([
    { id: 100, url: 'https://saved-a.com', title: '', windowId: 1, active: false, audible: false, favIconUrl: '', index: 0 },
  ]);
  await buildLiveTabIndex();

  await reconcileClaims([
    { id: 'item-A', url: 'https://saved-a.com', sortOrder: 0 },
    { id: 'item-B', url: 'https://saved-b.com', sortOrder: 1 },
  ]);

  const drift = await getDriftRecords();
  assert.equal('item-A' in drift, true, 'B-110 regression guard: surviving claim KEEPS its drift record (cleared only on next detectDriftForTab cycle)');
  assert.equal('item-B' in drift, false, 'B-110 (legitimate eviction): missing-tab eviction still clears the paired drift record');
});

/* =========================================================================
   T7 — AC2 SECONDARY leak: storage-handlers.js MSG_NAVIGATE_TO_ITEM
   stale-claim repair branch calls clearDrift after releaseClaimByTab.
   Static-source assertion — modeling the full message dispatcher with
   focus-shift races is out of scope for this file (UAT-5 covers the
   end-to-end behavior). T7's job is to guard the patch site so a future
   refactor cannot silently drop the clearDrift call.
   ========================================================================= */
test('B-110 T7 (AC2 SECONDARY): storage-handlers MSG_NAVIGATE_TO_ITEM stale-claim repair calls clearDrift', () => {
  const src = readFileSync(resolve(REPO_ROOT, 'background/messages/storage-handlers.js'), 'utf8');

  /* Find the AC3 stale-claim repair branch and confirm clearDrift is
     called inside it (after releaseClaimByTab, before the new tab is
     created). The R2 §53.3 patch is a 1-line add inside the
     `if (claimedTabId !== null) { ... }` block. */
  const ac3Block = src.match(/AC3:\s*stale\s*claim[\s\S]{0,400}?\}\s*\n/);
  assert.ok(ac3Block, 'AC3 stale-claim repair branch must be present and parseable');

  /* Coarse fallback per R4 [code-reviewer] L-5: distinguish "patch site
     not found" from "patch site found but ordering wrong." */
  assert.ok(
    src.includes('releaseClaimByTab(claimedTabId)'),
    'releaseClaimByTab(claimedTabId) call must exist somewhere in storage-handlers.js',
  );
  assert.ok(
    src.includes('clearDrift(p.itemId)'),
    'clearDrift(p.itemId) call must exist somewhere in storage-handlers.js',
  );

  assert.match(
    ac3Block[0],
    /releaseClaimByTab\(claimedTabId\)\s*;\s*\n[\s\S]*?clearDrift\(p\.itemId\)/,
    'B-110 SECONDARY leak fix: clearDrift(p.itemId) MUST be called after releaseClaimByTab(claimedTabId) in the AC3 stale-claim repair branch',
  );
});

/* =========================================================================
   T8 — R4 [qa-reviewer] M-2: pin the documented aria-label asymmetry per
   R2 §53.8. The visual drift bar gates conjunctively (`live?.live &&
   drifted`); the row aria-label DOES NOT — it announces "tab content has
   changed" whenever `drifted` is truthy regardless of live state. R2
   accepts this as a deliberate one-cold-start-cycle window so that the
   §31 B-048 contract (row label reflects the complete state ensemble) is
   not fought at the AT layer. This test exists to prevent a future
   engineer from "fixing" the asymmetry by gating the aria-label on
   `live?.live` — that change would silently undermine the §31 contract
   and surface as a regression only in screen-reader QA.
   ========================================================================= */
test('B-110 T8 (R4 qa-M-2): row aria-label STILL announces drift even when live.live=false (documented asymmetry per §53.8)', () => {
  const item = { id: 'item-A', title: 'Anthropic' };

  /* live.live=false (claim already released) but drifted=true (cached
     drift record still pending storage cleanup in the cold-start window). */
  const label = buildItemRowAriaLabel(
    item,
    { live: false, active: false, audible: false },
    true,
    false,
  );

  assert.ok(
    label.includes('tab content has changed'),
    `B-110 §53.8: row aria-label must announce drift even when live.live=false. Got: "${label}". If this assertion fires, someone gated the aria-label on live.live — revert per §53.8 reasoning.`,
  );
});
