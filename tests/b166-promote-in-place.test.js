/**
 * b166-promote-in-place.test.js — Sprint 45 / B-166 R5
 *
 * B-166 §71 — the `+` Save CTA on a floating tab promotes the tab to a
 * saved bookmark IN-PLACE: the new `item:<id>` ref takes the
 * `floating:<floatingTabId>` slot's index in the parent group's
 * `renderOrder`, instead of bottom-appending. The implementation is a
 * 3-partition atomic writeTransaction inside `createItem` keyed off an
 * optional `replaceFloatingId` field on the MSG_PROMOTE_TAB payload.
 *
 * Tests cover the six R1-LOCKED ACs + the C-7 allow-list validator
 * paths + the §71.3.2 bonus finding (floating-record prune in the same
 * transaction).
 *
 * All tests exercise the SW dispatch boundary via the registered
 * onMessage handler (mirrors the b103-promote-duplicate.test.js
 * pattern) so the validator clause and the createItem extension are
 * exercised end-to-end — no helper that bypasses the dispatch layer.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetMock,
  __setMockTabs,
} from './chrome-mock.js';
import {
  buildLiveTabIndex,
  __resetLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import {
  __resetTabClaims,
} from '../background/tabs/tab-claims.js';
import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import {
  runMigrations,
  _resetMigrationStateForTest,
  _clearMigrationStepsForTest,
} from '../background/storage/migration.js';
import { createGroup, getGroup } from '../background/storage/groups.js';
import { createItem, listItems } from '../background/storage/items.js';
import { readPartition, PARTITION_FLOATING_GROUPS } from '../background/storage/partitions.js';
import { appendFloatingGroup } from '../background/tabs/floating-groups.js';
import { GROUP_COLORS } from '../shared/constants.js';
import { MSG_PROMOTE_TAB } from '../shared/messages.js';
import { ERR_VALIDATION, ERR_NOT_FOUND } from '../background/storage/errors.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
});

/* Dispatch a message through the SW onMessage listener that
   registerStorageHandlers attached. Returns the full envelope. */
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
async function bootstrapHandlers() {
  const ready = runMigrations();
  registerStorageHandlers(ready);
  await ready;
}

/* Build the interleaved [item:A, floating:F1, item:B] precondition that
   AC1 / AC2 / AC6 share. Returns the parent group + the two saved item
   ids + the floating record's floatingTabId so the test can reason
   about the post-promote renderOrder. */
async function seedInterleave() {
  const group = await createGroup({ name: 'Interleave', color: GROUP_COLORS[0], parentId: null });
  const itA = await createItem({ title: 'A', url: 'https://a.example/', groupId: group.id });
  const itB = await createItem({ title: 'B', url: 'https://b.example/', groupId: group.id });

  /* Stand up a live tab + a parent-saved item (the floating record's
     parentItemId must point at a real saved item that owns the tab —
     mirror the appendFloatingGroup contract). itA is reused as the
     parent. The floating tabId (200) is the LIVE tab id; the
     floatingTabId stamped onto the record is a separate ulid. */
  __setMockTabs([
    { id: 200, url: 'https://floating.example/page', title: 'Floating', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  await appendFloatingGroup({
    groupId: group.id,
    parentItemId: itA.id,
    windowId: 1,
    tabIndex: 0,
    url: 'https://floating.example/page',
    savedAt: Date.now(),
    liveTabId: 200,
  });

  /* The appendFloatingGroup writeTransaction APPENDS the floating ref to
     the END of renderOrder (after itB). Reshuffle to the AC1 fixture:
     [item:A, floating:F1, item:B]. We do this directly through the
     same store API to keep the test focused on the swap behavior. */
  const groupNow = await getGroup(group.id);
  const refs = groupNow.renderOrder.slice();
  const floatingRef = refs.find((r) => r.startsWith('floating:'));
  assert.ok(floatingRef, 'pre-condition: appendFloatingGroup must have stamped a floating ref');
  const floatingTabId = floatingRef.slice('floating:'.length);
  /* Manually reshuffle storage to the canonical [item:A, floating:F, item:B]. */
  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  await chrome.storage.local.set({
    'tj:groups': [{ ...groupNow, renderOrder: ['item:' + itA.id, floatingRef, 'item:' + itB.id] }],
    'tj:floatingGroups': records,
  });

  return { group, itA, itB, floatingTabId, liveTabId: 200 };
}

/* =========================================================================
   T1 — AC1 happy path: renderOrder swap at correct index
   ========================================================================= */
test('B-166 T1 (AC1): MSG_PROMOTE_TAB with replaceFloatingId splices item:<NEW> into floating:F1’s slot', async () => {
  await bootstrapHandlers();
  const seed = await seedInterleave();

  const resp = await dispatch(MSG_PROMOTE_TAB, {
    tabId: seed.liveTabId,
    groupId: seed.group.id,
    replaceFloatingId: seed.floatingTabId,
  });
  assert.equal(resp.ok, true, 'promote dispatch must succeed');
  const newItem = resp.data;
  assert.ok(newItem && newItem.id, 'response envelope carries the new item');

  const after = await getGroup(seed.group.id);
  assert.deepEqual(
    after.renderOrder,
    ['item:' + seed.itA.id, 'item:' + newItem.id, 'item:' + seed.itB.id],
    'AC1: floating:F1 slot is replaced 1-for-1 by item:<NEW>; surrounding slots intact',
  );
});

/* =========================================================================
   T2 — AC1: slots before and after the swap target are preserved
   (no shift, no duplication, length invariant).
   ========================================================================= */
test('B-166 T2 (AC1): swap preserves slots before/after target, renderOrder length invariant', async () => {
  await bootstrapHandlers();
  const seed = await seedInterleave();
  const before = await getGroup(seed.group.id);
  const beforeLen = before.renderOrder.length;
  const beforeAt0 = before.renderOrder[0];
  const beforeAt2 = before.renderOrder[2];

  const resp = await dispatch(MSG_PROMOTE_TAB, {
    tabId: seed.liveTabId,
    groupId: seed.group.id,
    replaceFloatingId: seed.floatingTabId,
  });
  assert.equal(resp.ok, true);

  const after = await getGroup(seed.group.id);
  assert.equal(after.renderOrder.length, beforeLen, 'AC6: renderOrder length unchanged');
  assert.equal(after.renderOrder[0], beforeAt0, 'AC1: slot 0 byte-identical to pre-swap');
  assert.equal(after.renderOrder[2], beforeAt2, 'AC1: slot 2 byte-identical to pre-swap');
  /* No duplicate item:<NEW> ref. */
  const newRef = 'item:' + resp.data.id;
  const newRefCount = after.renderOrder.filter((r) => r === newRef).length;
  assert.equal(newRefCount, 1, 'AC6: exactly one item:<NEW> ref present, no duplicate');
  /* The replaced floating ref is gone. */
  const stillHasFloating = after.renderOrder.some((r) => r === 'floating:' + seed.floatingTabId);
  assert.equal(stillHasFloating, false, 'AC6: the swapped floating: ref no longer appears');
});

/* =========================================================================
   T3 — AC6 bonus: the corresponding tj:floatingGroups record is pruned
   atomically in the same writeTransaction (§71.3.2 bonus finding).
   ========================================================================= */
test('B-166 T3 (AC6 bonus): tj:floatingGroups record matching replaceFloatingId is pruned in the same transaction', async () => {
  await bootstrapHandlers();
  const seed = await seedInterleave();
  const beforeRecords = await readPartition(PARTITION_FLOATING_GROUPS);
  assert.ok(
    beforeRecords.some((r) => r.floatingTabId === seed.floatingTabId),
    'pre-condition: floating record exists before promote',
  );

  const resp = await dispatch(MSG_PROMOTE_TAB, {
    tabId: seed.liveTabId,
    groupId: seed.group.id,
    replaceFloatingId: seed.floatingTabId,
  });
  assert.equal(resp.ok, true);

  const afterRecords = await readPartition(PARTITION_FLOATING_GROUPS);
  assert.equal(
    afterRecords.some((r) => r.floatingTabId === seed.floatingTabId),
    false,
    'AC6: floating record is pruned post-promote — no orphan window',
  );
});

/* =========================================================================
   T4 — AC2 pre-S38 legacy: payload omits replaceFloatingId → append fallback
   (no error; new bookmark lands at end; floating ref retained because
    the SW handler had no hint to consume).
   ========================================================================= */
test('B-166 T4 (AC2): legacy payload without replaceFloatingId falls back to append (no swap, no error)', async () => {
  await bootstrapHandlers();
  const seed = await seedInterleave();

  /* Dispatch WITHOUT replaceFloatingId — the pre-B-166 contract. */
  const resp = await dispatch(MSG_PROMOTE_TAB, {
    tabId: seed.liveTabId,
    groupId: seed.group.id,
  });
  assert.equal(resp.ok, true, 'legacy payload still succeeds');
  const newItem = resp.data;

  const after = await getGroup(seed.group.id);
  /* Expected post-state: [item:A, floating:F1, item:B, item:NEW] */
  assert.deepEqual(
    after.renderOrder,
    ['item:' + seed.itA.id, 'floating:' + seed.floatingTabId, 'item:' + seed.itB.id, 'item:' + newItem.id],
    'AC2: append-at-end behavior preserved when replaceFloatingId absent',
  );
});

/* =========================================================================
   T5 — AC3 group-deleted-mid-flight / Ungrouped fallback: groupId === null
   + replaceFloatingId set → no swap (the GROUPS mutator's
   item.groupId === null early-return fires BEFORE the swap fork); the
   floating record is STILL pruned independently (§71.6.3 invariant).
   ========================================================================= */
test('B-166 T5 (AC3): groupId === null + replaceFloatingId set — no swap; floating record still pruned', async () => {
  await bootstrapHandlers();
  const seed = await seedInterleave();
  const beforeGroup = await getGroup(seed.group.id);

  const resp = await dispatch(MSG_PROMOTE_TAB, {
    tabId: seed.liveTabId,
    groupId: null,
    replaceFloatingId: seed.floatingTabId,
  });
  assert.equal(resp.ok, true);
  const newItem = resp.data;
  assert.equal(newItem.groupId, null, 'AC3: new item landed in Ungrouped (groupId === null)');

  /* The seeded group's renderOrder is UNCHANGED — no swap attempted because
     item.groupId === null. */
  const afterGroup = await getGroup(seed.group.id);
  assert.deepEqual(
    afterGroup.renderOrder,
    beforeGroup.renderOrder,
    'AC3: the original group renderOrder is untouched when item.groupId === null',
  );

  /* The floating record IS still pruned (the FLOATING_GROUPS mutator runs
     independently of groupId). */
  const afterRecords = await readPartition(PARTITION_FLOATING_GROUPS);
  assert.equal(
    afterRecords.some((r) => r.floatingTabId === seed.floatingTabId),
    false,
    'AC3 invariant: floating record cleanup independent of groupId — still pruned',
  );
});

/* =========================================================================
   T6 — AC4 tab-closed-mid-flight: chrome.tabs.get rejects → ERR_NOT_FOUND
   surfaces; no partial write (no new item; renderOrder unchanged; floating
   record unchanged).
   ========================================================================= */
test('B-166 T6 (AC4): tab closed mid-flight surfaces ERR_NOT_FOUND with no partial write', async () => {
  await bootstrapHandlers();
  const seed = await seedInterleave();
  const beforeGroup = await getGroup(seed.group.id);
  const beforeItems = await listItems();
  const beforeRecords = await readPartition(PARTITION_FLOATING_GROUPS);

  /* Dispatch with a tabId that does NOT exist in the live tab index —
     chrome.tabs.get will reject. */
  const resp = await dispatch(MSG_PROMOTE_TAB, {
    tabId: 99999, /* nonexistent */
    groupId: seed.group.id,
    replaceFloatingId: seed.floatingTabId,
  });
  assert.equal(resp.ok, false, 'AC4: handler envelope is failure');
  assert.equal(resp.error?.code, ERR_NOT_FOUND, 'AC4: error code is ERR_NOT_FOUND');

  /* Nothing in storage moved. */
  const afterGroup = await getGroup(seed.group.id);
  assert.deepEqual(afterGroup.renderOrder, beforeGroup.renderOrder,
    'AC4: renderOrder unchanged after failed promote');
  const afterItems = await listItems();
  assert.equal(afterItems.length, beforeItems.length, 'AC4: no new item created');
  const afterRecords = await readPartition(PARTITION_FLOATING_GROUPS);
  assert.equal(afterRecords.length, beforeRecords.length,
    'AC4: floating record unchanged (not pruned because handler threw before createItem)');
});

/* =========================================================================
   T7 — AC5 regression guard: pre-B-166 dispatch shape (no
   `replaceFloatingId`) still appends. This is the Open-Tabs Save flow +
   right-click "Save to group" picker path — both continue to bottom-
   append at their target group. Implemented in T4 (the legacy-payload
   path is the same code path the Open-Tabs flow exercises), but
   recorded here as an explicit AC5 regression guard with a different
   precondition (target group is EMPTY of floating refs — typical for the
   right-click picker, which targets a group the floating tab does NOT
   belong to).
   ========================================================================= */
test('B-166 T7 (AC5): Open-Tabs / right-click picker path (no replaceFloatingId) appends at target group end', async () => {
  await bootstrapHandlers();
  const groupTarget = await createGroup({ name: 'Target', color: GROUP_COLORS[1], parentId: null });
  /* Seed a couple of existing items so renderOrder has a clear "end". */
  const itX = await createItem({ title: 'X', url: 'https://x.example/', groupId: groupTarget.id });
  const itY = await createItem({ title: 'Y', url: 'https://y.example/', groupId: groupTarget.id });

  __setMockTabs([
    { id: 300, url: 'https://opentab.example/', title: 'Open', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  const resp = await dispatch(MSG_PROMOTE_TAB, { tabId: 300, groupId: groupTarget.id });
  assert.equal(resp.ok, true);
  const newItem = resp.data;

  const after = await getGroup(groupTarget.id);
  assert.deepEqual(
    after.renderOrder,
    ['item:' + itX.id, 'item:' + itY.id, 'item:' + newItem.id],
    'AC5: pre-B-166 payload shape continues to append at end (no regression)',
  );
});

/* =========================================================================
   T8 — AC6 stale-hint guard: replaceFloatingId set but the ref is NOT in
   the target group's renderOrder (e.g., the user dragged the floating
   tab out between dispatch and handler entry, OR the row's dataset
   carried a stale id). Behavior: fall back to append; no orphan and
   no duplicate.
   ========================================================================= */
test('B-166 T8 (AC6): stale replaceFloatingId — ref not in renderOrder → append fallback, no corruption', async () => {
  await bootstrapHandlers();
  const group = await createGroup({ name: 'G', color: GROUP_COLORS[0], parentId: null });
  const itA = await createItem({ title: 'A', url: 'https://a.example/', groupId: group.id });
  __setMockTabs([
    { id: 400, url: 'https://tabby.example/', title: 'Tab', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  /* No floating record matching the bogus id is seeded — the hint is
     dangling. */
  const beforeRecords = await readPartition(PARTITION_FLOATING_GROUPS);

  const resp = await dispatch(MSG_PROMOTE_TAB, {
    tabId: 400,
    groupId: group.id,
    replaceFloatingId: 'BOGUS_DOES_NOT_EXIST_ULID', /* < 32 chars; passes the validator */
  });
  assert.equal(resp.ok, true, 'AC6 stale hint must not fail the call');
  const newItem = resp.data;

  const after = await getGroup(group.id);
  assert.deepEqual(
    after.renderOrder,
    ['item:' + itA.id, 'item:' + newItem.id],
    'AC6 stale hint: append fallback fires; renderOrder ends with item:<NEW>',
  );
  /* The floating-groups partition is unchanged — the prune mutator
     ran but found no record to remove (content-conditional no-op). */
  const afterRecords = await readPartition(PARTITION_FLOATING_GROUPS);
  assert.deepEqual(afterRecords, beforeRecords,
    'AC6 stale hint: tj:floatingGroups unchanged when the hint matches no record');
});

/* =========================================================================
   T9 — C-7 validator: non-string replaceFloatingId rejected with
   ERR_VALIDATION (allow-list direction).
   ========================================================================= */
test('B-166 T9 (C-7): non-string replaceFloatingId rejected with ERR_VALIDATION', async () => {
  await bootstrapHandlers();
  const group = await createGroup({ name: 'G', color: GROUP_COLORS[0], parentId: null });
  __setMockTabs([
    { id: 500, url: 'https://valid.example/', title: 'V', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  for (const bad of [42, true, {}, []]) {
    const resp = await dispatch(MSG_PROMOTE_TAB, {
      tabId: 500,
      groupId: group.id,
      replaceFloatingId: bad,
    });
    assert.equal(resp.ok, false, `C-7: type ${typeof bad} (${JSON.stringify(bad)}) must reject`);
    assert.equal(resp.error?.code, ERR_VALIDATION,
      `C-7: ${typeof bad} replaceFloatingId surfaces ERR_VALIDATION`);
  }
});

/* =========================================================================
   T10 — C-7 validator: empty string AND over-length replaceFloatingId
   both rejected with ERR_VALIDATION.
   ========================================================================= */
test('B-166 T10 (C-7): empty-string and over-length replaceFloatingId rejected with ERR_VALIDATION', async () => {
  await bootstrapHandlers();
  const group = await createGroup({ name: 'G', color: GROUP_COLORS[0], parentId: null });
  __setMockTabs([
    { id: 600, url: 'https://valid2.example/', title: 'V2', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  /* Empty string. */
  const respEmpty = await dispatch(MSG_PROMOTE_TAB, {
    tabId: 600,
    groupId: group.id,
    replaceFloatingId: '',
  });
  assert.equal(respEmpty.ok, false, 'empty-string replaceFloatingId must reject');
  assert.equal(respEmpty.error?.code, ERR_VALIDATION);

  /* Over-length: > 32 chars. */
  const tooLong = 'A'.repeat(33);
  const respLong = await dispatch(MSG_PROMOTE_TAB, {
    tabId: 600,
    groupId: group.id,
    replaceFloatingId: tooLong,
  });
  assert.equal(respLong.ok, false, 'over-length replaceFloatingId must reject');
  assert.equal(respLong.error?.code, ERR_VALIDATION);
});
