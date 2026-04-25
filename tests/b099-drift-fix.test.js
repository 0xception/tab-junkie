/**
 * b099-drift-fix.test.js — Sprint 33 / B-099 R5 (AC11)
 *
 * Sprint 33 ships Option B + the "Snap to this tab" reconcile action. The
 * eleven tests below cover the AC11 contract:
 *
 *   T1 — claim preserved + drift record written when a claimed tab navigates
 *        to a mismatched URL (the central B-099 fix).
 *   T2 — drift record cleared when the live tab navigates back to the saved
 *        URL (existing detectDriftForTab path; regression guard under D-1).
 *   T3 — tab close releases the claim AND clears the drift record (existing
 *        wiring at tab-events.js:202-203 per §10.7 B-015).
 *   T4 — MSG_UPDATE_ITEM with patch.url === driftedToUrl clears the drift
 *        record inline in the SW handler (D-2 / AC7).
 *   T5 — MSG_UPDATE_ITEM with a title-only patch does NOT clear the drift
 *        record (AC7 regression guard; the conditional clearDrift must only
 *        fire when patch.url is defined AND actually changed).
 *   T6 — buildOpenTabs() excludes a drifted-but-claimed tab (AC4 regression
 *        guard for the B-055 contract).
 *   T7 — Re-claim contention: a second saved item matching the new URL does
 *        NOT auto-claim a tab that is still claimed by the original item
 *        (D-3 / AC2).
 *   T8 — MSG_DEMOTE_ITEM on a drifted item clears the drift record AND
 *        releases the claim (existing path; regression guard).
 *
 * R5 gap-fills (identified by [test-engineer] AC-coverage audit):
 *
 *   T10 — MSG_UPDATE_ITEM with patch.url set to a THIRD URL (neither the
 *         original saved URL nor the driftedToUrl) clears the drift record.
 *         AC7 / D-2 are not limited to the "snap exactly to driftedToUrl"
 *         path — any URL change on a drifted item must clear the drift record
 *         (covers the Edit-dialog URL change scenario).
 *
 *   T11 — MSG_UPDATE_ITEM with patch.url equal to the current item URL (a
 *         no-change URL patch) does NOT trigger clearDrift. Guards the
 *         `p.patch.url !== preItem.url` conditional introduced in D-2.
 *
 * All tests use the existing chrome-mock — no ad-hoc stubs.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetMock,
  __setMockTabs,
  __getSessionStore,
  seedPartitions,
} from './chrome-mock.js';
import {
  buildLiveTabIndex,
  updateTabEntry,
  removeTabEntry,
  __resetLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import {
  reconcileClaims,
  reevaluateTab,
  releaseClaimByTab,
  __resetTabClaims,
} from '../background/tabs/tab-claims.js';
import {
  detectDriftForTab,
  getDriftRecords,
  clearDrift,
} from '../background/tabs/drift.js';
import { buildOpenTabs } from '../background/tabs/open-tabs.js';
import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import {
  _resetMigrationStateForTest,
  _clearMigrationStepsForTest,
} from '../background/storage/migration.js';
import {
  MSG_UPDATE_ITEM,
  MSG_DEMOTE_ITEM,
} from '../shared/messages.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
});

/* Local helper — dispatches a message through the SW onMessage listener
   that registerStorageHandlers attaches. Mirrors the pattern used by
   `tests/b044-import-dispatch.test.js`. */
function getListener() {
  const listeners = chrome.runtime.onMessage._listeners;
  return listeners[listeners.length - 1];
}
async function dispatch(type, payload) {
  return await new Promise((resolve) => {
    getListener()(
      { type, payload },
      { id: chrome.runtime.id },
      resolve,
    );
  });
}

/* =========================================================================
   T1 — Claim preserved + drift record written on URL mismatch
   ========================================================================= */
test('B-099 T1: claimed tab navigates to mismatched URL → claim preserved + drift record written', async () => {
  __setMockTabs([
    { id: 10, url: 'https://saved.example/page', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'item-1', url: 'https://saved.example/page', sortOrder: 0 },
  ];
  await reconcileClaims(items);

  // Sanity: claim established by reconcileClaims
  let claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-1'], 10, 'item-1 should be claimed by tab 10');

  // Tab navigates to a different URL — the exact path tab-events.js fires:
  // updateTabEntry → reevaluateTab → detectDriftForTab.
  updateTabEntry(10, { url: 'https://other.example/foo' });
  await reevaluateTab(10, 'https://other.example/foo', items);
  await detectDriftForTab(10, 'https://other.example/foo', items);

  // Claim is PRESERVED (D-1) — this is the central B-099 fix.
  claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-1'], 10, 'Claim must survive URL mismatch (D-1)');

  // Drift record was WRITTEN — previously suppressed by claim release race.
  const drift = await getDriftRecords();
  assert.ok(drift['item-1'], 'Drift record should exist for item-1 after URL change');
  assert.equal(drift['item-1'].itemId, 'item-1');
  assert.equal(drift['item-1'].driftedToUrl, 'https://other.example/foo');
});

/* =========================================================================
   T2 — Drift cleared when tab returns to the saved URL
   ========================================================================= */
test('B-099 T2: drifted tab navigates back to saved URL → drift cleared, claim still present', async () => {
  __setMockTabs([
    { id: 11, url: 'https://saved.example/p', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  const items = [{ id: 'item-2', url: 'https://saved.example/p', sortOrder: 0 }];
  await reconcileClaims(items);

  // Drift away
  await detectDriftForTab(11, 'https://elsewhere.example/x', items);
  let drift = await getDriftRecords();
  assert.ok(drift['item-2'], 'Drift should be present after navigating away');

  // Navigate back — claim was preserved through the drift, so detectDriftForTab
  // sees a match and clears the record.
  await detectDriftForTab(11, 'https://saved.example/p', items);
  drift = await getDriftRecords();
  assert.equal(drift['item-2'], undefined, 'Drift should be cleared after navigating back');

  const claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-2'], 11, 'Claim should persist throughout drift + clear');
});

/* =========================================================================
   T3 — Tab close releases the claim AND clears drift
   ========================================================================= */
test('B-099 T3: tab close on claimed+drifted tab → claim released + drift cleared', async () => {
  __setMockTabs([
    { id: 12, url: 'https://saved.example/q', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  const items = [{ id: 'item-3', url: 'https://saved.example/q', sortOrder: 0 }];
  await reconcileClaims(items);

  // Drift away first
  await detectDriftForTab(12, 'https://drifted.example/y', items);
  let drift = await getDriftRecords();
  assert.ok(drift['item-3'], 'Drift should exist before tab close');
  let claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-3'], 12, 'Claim should exist before tab close');

  // Mirror the tab-events.js onRemoved handler: removeTabEntry, then
  // releaseClaimByTab, then clearDrift on the released itemId (B-015 wiring).
  removeTabEntry(12);
  const releasedItemId = await releaseClaimByTab(12);
  assert.equal(releasedItemId, 'item-3', 'releaseClaimByTab returns the released itemId');
  await clearDrift(releasedItemId);

  drift = await getDriftRecords();
  assert.equal(drift['item-3'], undefined, 'Drift cleared after tab close');
  claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-3'], undefined, 'Claim released after tab close');
});

/* =========================================================================
   T4 — MSG_UPDATE_ITEM with patch.url clears drift inline in SW handler
   ========================================================================= */
test('B-099 T4: MSG_UPDATE_ITEM { patch: { url } } clears drift record inline (AC7)', async () => {
  // Seed an item, register the dispatcher.
  const item = {
    id: 'item-4',
    url: 'https://saved.example/r',
    title: 'Test',
    groupId: null,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  seedPartitions({ items: [item], meta: { schemaVersion: 1 } });
  registerStorageHandlers(Promise.resolve());

  __setMockTabs([
    { id: 13, url: 'https://saved.example/r', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([{ id: 'item-4', url: 'https://saved.example/r', sortOrder: 0 }]);

  // Establish drift first.
  await detectDriftForTab(13, 'https://drifted.example/now', [item]);
  let drift = await getDriftRecords();
  assert.ok(drift['item-4'], 'Drift should exist before snap');

  // Dispatch the snap — patch.url equals the drifted URL.
  const resp = await dispatch(MSG_UPDATE_ITEM, {
    id: 'item-4',
    patch: { url: 'https://drifted.example/now' },
  });
  assert.equal(resp.ok, true, 'MSG_UPDATE_ITEM should succeed');
  assert.equal(resp.data.url, 'https://drifted.example/now', 'item.url should be updated');

  // Drift cleared inline — the central D-2 / AC7 contract.
  drift = await getDriftRecords();
  assert.equal(drift['item-4'], undefined, 'Drift record cleared inline by MSG_UPDATE_ITEM handler');
});

/* =========================================================================
   T5 — MSG_UPDATE_ITEM with a title-only patch does NOT clear drift
   ========================================================================= */
test('B-099 T5: MSG_UPDATE_ITEM { patch: { title } } does NOT clear drift (AC7 regression)', async () => {
  const item = {
    id: 'item-5',
    url: 'https://saved.example/s',
    title: 'Original',
    groupId: null,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  seedPartitions({ items: [item], meta: { schemaVersion: 1 } });
  registerStorageHandlers(Promise.resolve());

  __setMockTabs([
    { id: 14, url: 'https://saved.example/s', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([{ id: 'item-5', url: 'https://saved.example/s', sortOrder: 0 }]);

  // Establish drift first.
  await detectDriftForTab(14, 'https://drifted.example/zzz', [item]);
  let drift = await getDriftRecords();
  assert.ok(drift['item-5'], 'Drift should exist before title patch');

  // Dispatch a title-only patch.
  const resp = await dispatch(MSG_UPDATE_ITEM, {
    id: 'item-5',
    patch: { title: 'Renamed' },
  });
  assert.equal(resp.ok, true, 'MSG_UPDATE_ITEM should succeed for title patch');
  assert.equal(resp.data.title, 'Renamed', 'item.title should be updated');
  assert.equal(resp.data.url, 'https://saved.example/s', 'item.url unchanged');

  // Drift record MUST survive — no spurious clear on non-URL patches.
  drift = await getDriftRecords();
  assert.ok(drift['item-5'], 'Drift record must survive a title-only patch (regression guard)');
  assert.equal(drift['item-5'].driftedToUrl, 'https://drifted.example/zzz');
});

/* =========================================================================
   T6 — buildOpenTabs() excludes a drifted-but-claimed tab (AC4 regression)
   ========================================================================= */
test('B-099 T6: buildOpenTabs() excludes a tab claimed by a drifted item (AC4)', async () => {
  __setMockTabs([
    { id: 15, url: 'https://saved.example/t', windowId: 1, active: false, audible: false, index: 0, title: 'Saved' },
    { id: 16, url: 'https://untracked.example/u', windowId: 1, active: false, audible: false, index: 1, title: 'Untracked' },
  ]);
  await buildLiveTabIndex();

  const items = [{ id: 'item-6', url: 'https://saved.example/t', sortOrder: 0 }];
  await reconcileClaims(items);

  // Drift the claimed tab — under B-099 the claim is preserved.
  updateTabEntry(15, { url: 'https://drifted.example/q' });
  await reevaluateTab(15, 'https://drifted.example/q', items);
  await detectDriftForTab(15, 'https://drifted.example/q', items);

  const claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-6'], 15, 'Claim preserved under drift');

  const openTabs = buildOpenTabs();
  // The drifted tab must NOT appear in Open Tabs (B-055 filter still works).
  const tabIds = openTabs.map((t) => t.tabId);
  assert.ok(!tabIds.includes(15), 'Drifted-but-claimed tab must not appear in Open Tabs');
  // The genuinely untracked tab MUST appear.
  assert.ok(tabIds.includes(16), 'Untracked tab still appears in Open Tabs');
});

/* =========================================================================
   T7 — Re-claim contention: original wins
   ========================================================================= */
test('B-099 T7: claimed tab navigates to another item URL → original keeps claim, new item unclaimed (D-3)', async () => {
  __setMockTabs([
    { id: 17, url: 'https://itemA.example/p', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'itemA', url: 'https://itemA.example/p', sortOrder: 0 },
    { id: 'itemB', url: 'https://itemB.example/q', sortOrder: 1 },
  ];
  await reconcileClaims(items);

  // Sanity: itemA claims tab 17; itemB is unclaimed.
  let claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['itemA'], 17);
  assert.equal(claims['itemB'], undefined);

  // Tab navigates to itemB's URL.
  updateTabEntry(17, { url: 'https://itemB.example/q' });
  await reevaluateTab(17, 'https://itemB.example/q', items);

  // Original-wins (D-3): itemA still owns tab 17, itemB does NOT auto-claim.
  claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['itemA'], 17, 'itemA must keep its claim even though tab now matches itemB');
  assert.equal(claims['itemB'], undefined, 'itemB must not auto-claim a tab another item already holds');
});

/* =========================================================================
   T8 — MSG_DEMOTE_ITEM on a drifted item clears drift + releases claim
   ========================================================================= */
test('B-099 T8: MSG_DEMOTE_ITEM on a drifted item clears drift record + releases claim', async () => {
  const item = {
    id: 'item-8',
    url: 'https://saved.example/v',
    title: 'Demote-me',
    groupId: null,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  seedPartitions({ items: [item], meta: { schemaVersion: 1 } });
  registerStorageHandlers(Promise.resolve());

  __setMockTabs([
    { id: 18, url: 'https://saved.example/v', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([{ id: 'item-8', url: 'https://saved.example/v', sortOrder: 0 }]);

  // Establish drift.
  await detectDriftForTab(18, 'https://drifted.example/w', [item]);
  let drift = await getDriftRecords();
  assert.ok(drift['item-8'], 'Drift should exist before demote');
  let claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-8'], 18, 'Claim should exist before demote');

  // Dispatch MSG_DEMOTE_ITEM — handler runs deleteItem → clearDrift →
  // saveFloatingGroups → releaseClaimByTab (per AC9 ordering in §10.7).
  const resp = await dispatch(MSG_DEMOTE_ITEM, { itemId: 'item-8' });
  assert.equal(resp.ok, true, 'MSG_DEMOTE_ITEM should succeed');

  // Both the drift record and the claim must be gone.
  drift = await getDriftRecords();
  assert.equal(drift['item-8'], undefined, 'Drift record cleared by demote handler');
  claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-8'], undefined, 'Claim released by demote handler');
});

/* =========================================================================
   T9 — Double-drift: driftedToUrl in cache updates when tab drifts again
   (SW-side regression guard for M-1 tooltip-refresh fix — the sidepanel
    tooltip reads from _cachedDriftRecords which mirrors getDriftRecords)
   ========================================================================= */
test('B-099 T9 (M-1): driftedToUrl updates in drift record when a claimed tab drifts a second time (tooltip source)', async () => {
  __setMockTabs([
    { id: 19, url: 'https://saved.example/x', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  const items = [{ id: 'item-9', url: 'https://saved.example/x', sortOrder: 0 }];
  await reconcileClaims(items);

  // First drift — tab navigates to a.com.
  updateTabEntry(19, { url: 'https://a.example/first' });
  await reevaluateTab(19, 'https://a.example/first', items);
  await detectDriftForTab(19, 'https://a.example/first', items);

  let drift = await getDriftRecords();
  assert.equal(drift['item-9'].driftedToUrl, 'https://a.example/first',
    'First drift record should reflect first drifted URL');

  // Second drift — tab navigates again WITHOUT the drift being cleared first.
  // The existing detectDriftForTab writeDrift call must overwrite the record.
  updateTabEntry(19, { url: 'https://b.example/second' });
  await reevaluateTab(19, 'https://b.example/second', items);
  await detectDriftForTab(19, 'https://b.example/second', items);

  drift = await getDriftRecords();
  assert.equal(drift['item-9'].driftedToUrl, 'https://b.example/second',
    'Drift record driftedToUrl must update on second drift — tooltip source for _ensureIndicators M-1 fix');
  // Claim is still intact.
  const claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['item-9'], 19, 'Claim preserved across double-drift');
});

/* =========================================================================
   T10 — Edit-dialog URL change (third URL) also clears drift
   AC7 / D-2 gap-fill: drift clear is triggered by ANY patch.url change,
   not only when patch.url === driftedToUrl (the "snap" path). This test
   covers the scenario where a user opens the Edit dialog on a drifted item
   and types a completely different URL.
   ========================================================================= */
test('B-099 T10: MSG_UPDATE_ITEM with patch.url set to a third URL (not driftedToUrl) also clears drift (AC7 / D-2)', async () => {
  const item = {
    id: 'item-10',
    url: 'https://saved.example/ten',
    title: 'Ten',
    groupId: null,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  seedPartitions({ items: [item], meta: { schemaVersion: 1 } });
  registerStorageHandlers(Promise.resolve());

  __setMockTabs([
    { id: 20, url: 'https://saved.example/ten', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([{ id: 'item-10', url: 'https://saved.example/ten', sortOrder: 0 }]);

  // Establish drift to a "middle" URL (the one the tab navigated to).
  await detectDriftForTab(20, 'https://drifted.example/mid', [item]);
  let drift = await getDriftRecords();
  assert.ok(drift['item-10'], 'Drift should exist before the edit-dialog URL change');
  assert.equal(drift['item-10'].driftedToUrl, 'https://drifted.example/mid');

  // User opens Edit dialog and types a third URL — neither the original saved
  // URL nor the drifted URL. This dispatches MSG_UPDATE_ITEM with the new value.
  const thirdUrl = 'https://completely-different.example/new';
  const resp = await dispatch(MSG_UPDATE_ITEM, {
    id: 'item-10',
    patch: { url: thirdUrl },
  });
  assert.equal(resp.ok, true, 'MSG_UPDATE_ITEM should succeed for third-URL edit');
  assert.equal(resp.data.url, thirdUrl, 'item.url should be updated to third URL');

  // AC7 / D-2: ANY patch.url change on a drifted item must clear the drift
  // record — regardless of whether the new URL equals driftedToUrl.
  drift = await getDriftRecords();
  assert.equal(
    drift['item-10'],
    undefined,
    'Drift record must be cleared by MSG_UPDATE_ITEM even when patch.url is a third URL unrelated to driftedToUrl',
  );
});

/* =========================================================================
   T11 — No-change URL patch does NOT clear drift (D-2 conditional guard)
   Guards the `p.patch.url !== preItem.url` conditional in storage-handlers.js.
   If patch.url equals the stored item.url (a degenerate same-value write),
   the drift record must survive — clearDrift must not fire.
   ========================================================================= */
test('B-099 T11: MSG_UPDATE_ITEM with patch.url equal to current item.url does NOT clear drift (D-2 guard)', async () => {
  const item = {
    id: 'item-11',
    url: 'https://saved.example/eleven',
    title: 'Eleven',
    groupId: null,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  seedPartitions({ items: [item], meta: { schemaVersion: 1 } });
  registerStorageHandlers(Promise.resolve());

  __setMockTabs([
    { id: 21, url: 'https://saved.example/eleven', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([{ id: 'item-11', url: 'https://saved.example/eleven', sortOrder: 0 }]);

  // Establish drift.
  await detectDriftForTab(21, 'https://drifted.example/eleven', [item]);
  let drift = await getDriftRecords();
  assert.ok(drift['item-11'], 'Drift should exist before the no-change URL patch');

  // Dispatch with patch.url === preItem.url — a degenerate same-value write.
  // This should NOT trigger clearDrift (no real URL change occurred).
  const resp = await dispatch(MSG_UPDATE_ITEM, {
    id: 'item-11',
    patch: { url: 'https://saved.example/eleven' },
  });
  assert.equal(resp.ok, true, 'MSG_UPDATE_ITEM should succeed for no-change URL patch');
  assert.equal(resp.data.url, 'https://saved.example/eleven', 'item.url unchanged');

  // Drift record MUST survive — no clearDrift on a same-value URL patch.
  drift = await getDriftRecords();
  assert.ok(
    drift['item-11'],
    'Drift record must survive a no-change URL patch (p.patch.url !== preItem.url guard in D-2)',
  );
  assert.equal(drift['item-11'].driftedToUrl, 'https://drifted.example/eleven',
    'driftedToUrl unchanged');
});
