/**
 * b125-claim-jump-fix.test.js — Sprint 38 / B-125 R5
 *
 * Five tests mirroring the seven R1 ACs (per §59.8 design):
 *
 *   T1 — AC1: An opener-chain-spawned tab does NOT auto-claim a URL-matching
 *        saved bookmark. The new `inheritedTabs` gate inside reevaluateTab
 *        short-circuits the auto-claim branch. (B-125 central fix.)
 *
 *   T2 — AC2 regression guard: A user-initiated tab (no opener / not marked
 *        inherited) DOES auto-claim a URL-matching saved bookmark. The gate
 *        narrows behavior — it must not break the pre-existing auto-claim
 *        path for tabs that were never inherited.
 *
 *   T3 — AC3: The `inheritedTabs` set is pruned on tab close. After
 *        pruneInherited(tabId), isInherited(tabId) returns false and a
 *        subsequent reevaluateTab is auto-claim eligible again. (Guards
 *        against tabId recycle leaking a stale gate.)
 *
 *   T4 — AC4 + Q2 invariant: B-099's release-path call-site count remains
 *        exactly 4 (§59.2.2 grep result). Static-analysis assertion against
 *        the production source — guards that R3 did not introduce a 5th
 *        unsanctioned `releaseClaimByTab` call site that could re-introduce
 *        the B-099 D-1 violation.
 *
 *   T5 — AC4 / AC5 / user's exact repro: xcelenergy.sharepoint.com claimed
 *        by "The Source"; user clicks an in-page link that opens a Workday
 *        URL also matching a saved bookmark "Home - Workday". Original
 *        claim survives + spawned tab does NOT steal the Workday claim.
 *
 * All five tests use the existing chrome-mock; no ad-hoc stubs.
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
  __getSessionStore,
} from './chrome-mock.js';
import {
  buildLiveTabIndex,
  __resetLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import {
  reconcileClaims,
  reevaluateTab,
  markInherited,
  isInherited,
  pruneInherited,
  __resetTabClaims,
} from '../background/tabs/tab-claims.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

/* =========================================================================
   T1 — AC1: opener-chain-spawned tab does NOT auto-claim a matching bookmark
   ========================================================================= */
test('B-125 T1: inherited tab does NOT auto-claim a URL-matching saved bookmark', async () => {
  // Seed: tab 100 at https://a.example, claimed by item-A.
  __setMockTabs([
    { id: 100, url: 'https://a.example', windowId: 1, active: true, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'item-A', url: 'https://a.example', sortOrder: 0 },
    { id: 'item-B', url: 'https://b.example', sortOrder: 1 },
  ];
  await reconcileClaims(items);

  // Sanity: item-A is claimed by tab 100; item-B is unclaimed.
  let claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-A'], 100, 'item-A must be claimed by tab 100 after reconcile');
  assert.equal(claims['item-B'], undefined, 'item-B must be unclaimed before the test action');

  // Action: simulate an opener-chain inherited tab (101) navigating to a URL
  // that matches an unclaimed saved bookmark. This is the B-125 bug scenario.
  markInherited(101);
  await reevaluateTab(101, 'https://b.example', items);

  // Assert (B-125 fix): item-B must remain unclaimed — the inherited tab
  // does not steal the matching bookmark. item-A's claim is also untouched.
  claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-A'], 100, 'B-099 D-1: original claim must survive');
  assert.equal(claims['item-B'], undefined, 'B-125 fix: inherited tab must NOT auto-claim item-B');
});

/* =========================================================================
   T2 — AC2 regression guard: non-inherited tab DOES still auto-claim
   ========================================================================= */
test('B-125 T2 (regression guard): a non-inherited tab DOES auto-claim a URL-matching bookmark', async () => {
  // Seed: tab 102 already exists at https://b.example with no claim and no
  // inheritance marker. This is the user-initiated-tab path.
  __setMockTabs([
    { id: 102, url: 'about:blank', windowId: 1, active: true, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'item-B', url: 'https://b.example', sortOrder: 0 },
  ];
  await reconcileClaims(items);

  // Sanity: claimsMirror is empty (no live tab matched any item URL at
  // reconcile time) and tab 102 is NOT marked inherited.
  let claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-B'], undefined, 'item-B starts unclaimed');
  assert.equal(isInherited(102), false, 'tab 102 must NOT be marked inherited');

  // Action: tab 102 navigates to https://b.example — matches item-B.
  await reevaluateTab(102, 'https://b.example', items);

  // Assert: pre-B-125 auto-claim path is intact for non-inherited tabs.
  claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-B'], 102, 'auto-claim must still fire for non-inherited tabs (regression guard)');
});

/* =========================================================================
   T3 — AC3: inheritedTabs set pruned on tab close
   ========================================================================= */
test('B-125 T3: pruneInherited drops the marker; subsequent reevaluateTab is auto-claim eligible', async () => {
  // Phase 1: mark + verify.
  markInherited(101);
  assert.equal(isInherited(101), true, 'markInherited must add tab 101 to the set');

  // Phase 2: prune + verify the marker is gone.
  pruneInherited(101);
  assert.equal(isInherited(101), false, 'pruneInherited must remove tab 101 from the set');

  // Phase 3: prove the gate releases — same scenario as T1, but after prune,
  // the auto-claim path is now reachable. Tab 101 navigating to item-B's URL
  // will claim item-B.
  __setMockTabs([
    { id: 101, url: 'https://b.example', windowId: 1, active: true, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'item-B', url: 'https://b.example', sortOrder: 0 },
  ];
  await reconcileClaims(items);
  // After reconcileClaims, item-B is already claimed by tab 101 because the
  // tab matched at reconcile time. Reset and re-seed to test reevaluateTab
  // explicitly on a freshly-empty mirror.
  __resetTabClaims();
  await reevaluateTab(101, 'https://b.example', items);

  const claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-B'], 101, 'after pruneInherited, auto-claim is eligible again');
});

/* =========================================================================
   T4 — AC4 + Q2: releaseClaimByTab call-site count invariant
   ========================================================================= */
test('B-125 T4 (AC4 invariant): releaseClaimByTab has exactly 4 production call sites', () => {
  // §59.2.2 documents the four sanctioned call sites. Reading the production
  // source files and counting actual function-call occurrences (not imports,
  // not docstrings, not comments) keeps R3 honest: any future PR that adds
  // an unsanctioned 5th call site will break this test and force an explicit
  // §10.7 / B-099 D-1 review.
  //
  // B-177 (§74 A3) relocated the onRemoved / windows.onRemoved cascades out of
  // tab-events.js into the named primitives in tab-event-cascades.js
  // (`releaseTabCascade` + `releaseTabsCascade`). The two sanctioned call sites
  // moved with them — tab-events.js now holds ZERO. The total is unchanged at 4.
  const tabEventsPath = resolve(__dirname, '../background/tabs/tab-events.js');
  const tabEventCascadesPath = resolve(__dirname, '../background/tabs/tab-event-cascades.js');
  const storageHandlersPath = resolve(__dirname, '../background/messages/storage-handlers.js');

  const tabEventsSrc = readFileSync(tabEventsPath, 'utf8');
  const tabEventCascadesSrc = readFileSync(tabEventCascadesPath, 'utf8');
  const storageHandlersSrc = readFileSync(storageHandlersPath, 'utf8');

  // Match `releaseClaimByTab(` — the function-call form. Excludes the
  // `import { releaseClaimByTab }` line (no `(` after the name) and the
  // function definition in tab-claims.js (different file, not searched).
  // Excludes plain mentions in comments / strings (those have no `(`).
  const callPattern = /releaseClaimByTab\(/g;

  const tabEventsCalls = (tabEventsSrc.match(callPattern) || []).length;
  const tabEventCascadesCalls = (tabEventCascadesSrc.match(callPattern) || []).length;
  const storageHandlersCalls = (storageHandlersSrc.match(callPattern) || []).length;
  const totalCalls = tabEventsCalls + tabEventCascadesCalls + storageHandlersCalls;

  // Expected per §59.2.2 (as relocated by B-177 §74 A3):
  //   tab-events.js:         0 calls (cascades delegated to tab-event-cascades.js)
  //   tab-event-cascades.js: 2 calls (releaseTabCascade + releaseTabsCascade)
  //   storage-handlers.js:   2 calls (MSG_DEMOTE_ITEM + MSG_NAVIGATE_TO_ITEM)
  //   ────────────────────────
  //   Total: 4
  assert.equal(tabEventsCalls, 0, 'tab-events.js must hold ZERO releaseClaimByTab call sites (delegated to tab-event-cascades.js after B-177)');
  assert.equal(tabEventCascadesCalls, 2, 'tab-event-cascades.js must hold exactly 2 releaseClaimByTab call sites (releaseTabCascade + releaseTabsCascade)');
  assert.equal(storageHandlersCalls, 2, 'storage-handlers.js must hold exactly 2 releaseClaimByTab call sites');
  assert.equal(totalCalls, 4, 'B-099 D-1 invariant: exactly 4 sanctioned releaseClaimByTab call sites');
});

/* =========================================================================
   T5 — AC5: user's exact repro — xcelenergy.sharepoint.com → Workday
   ========================================================================= */
test('B-125 T5 (user repro): xcelenergy claim survives, Workday tab does NOT steal Home-Workday claim', async () => {
  // Seed: the user's exact starting state — tab 200 open at the SharePoint URL
  // claimed by "The Source"; "Home - Workday" exists as another saved item.
  const xcelUrl = 'https://xcelenergy.sharepoint.com/';
  const workdayUrl = 'https://wd5.myworkday.com/xcel/d/home.htmld';
  __setMockTabs([
    { id: 200, url: xcelUrl, windowId: 1, active: true, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'the-source', url: xcelUrl, sortOrder: 0 },
    { id: 'home-workday', url: workdayUrl, sortOrder: 1 },
  ];
  await reconcileClaims(items);

  // Sanity: "The Source" is claimed by tab 200; "Home - Workday" is unclaimed.
  let claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['the-source'], 200, 'the-source must be claimed by tab 200');
  assert.equal(claims['home-workday'], undefined, 'home-workday must start unclaimed');

  // Action: user clicks the in-page Workday link in tab 200. A new tab 201
  // is created with openerTabId=200; opener-chain inheritance walks back to
  // "the-source" → "g-source" group; appendFloatingGroup writes the floating
  // record; THEN markInherited(201) fires. Finally, the tab navigates to the
  // Workday URL — onUpdated → debounced reevaluateTab.
  markInherited(201);

  // Update LiveTabIndex so reevaluateTab sees the spawned tab.
  __setMockTabs([
    { id: 200, url: xcelUrl, windowId: 1, active: false, audible: false, index: 0 },
    { id: 201, url: workdayUrl, windowId: 1, active: true, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();

  await reevaluateTab(201, workdayUrl, items);

  // Assert: B-099 D-1 — original SharePoint claim survives. B-125 fix —
  // the spawned Workday tab did NOT auto-claim "home-workday".
  claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['the-source'], 200, 'B-099 D-1: original xcelenergy claim survives');
  assert.equal(claims['home-workday'], undefined, 'B-125 fix: inherited Workday tab must NOT steal home-workday claim');
});
