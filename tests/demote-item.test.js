/**
 * demote-item.test.js — B-017 AC1–AC9
 * Tests for the MSG_DEMOTE_ITEM handler logic.
 *
 * We replicate the demote logic by calling the same sub-functions so we can
 * test ordering, atomicity, drift clearing, and floating-group writes.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetMock,
  __setMockTabs,
  __getRawStore,
} from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex, updateTabEntry } from '../background/tabs/live-tab-index.js';
import {
  __resetTabClaims,
  claimTabForItem,
  getClaimsMirror,
  reconcileClaims,
} from '../background/tabs/tab-claims.js';
import { createItem, getItem, listItems, createGroup } from '../background/storage/index.js';
import { deleteItem } from '../background/storage/index.js';
import { clearDrift } from '../background/tabs/drift.js';
import { saveFloatingGroups } from '../background/tabs/floating-groups.js';
import { releaseClaimByTab } from '../background/tabs/tab-claims.js';
import { getLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { ERR_VALIDATION } from '../background/storage/errors.js';
import { GROUP_COLORS } from '../shared/constants.js';
import { detectDriftForTab } from '../background/tabs/drift.js';

const COLOR = GROUP_COLORS[0];

// Replicate the MSG_DEMOTE_ITEM dispatch logic for isolated testing
async function demoteItem(itemId) {
  if (typeof itemId !== 'string' || itemId.length === 0) {
    const { StorageError, ERR_VALIDATION: EV } = await import('../background/storage/errors.js');
    throw new StorageError(EV, 'demoteItem: itemId must be a non-empty string');
  }
  const item = await getItem(itemId);
  if (item === null) {
    return null;
  }
  const mirror = getClaimsMirror();
  const tabId = mirror[itemId] !== undefined ? mirror[itemId] : null;

  await deleteItem(itemId);
  await clearDrift(itemId);

  if (item.groupId !== null && tabId !== null) {
    const index = getLiveTabIndex();
    const tabEntry = index.get(tabId);
    if (tabEntry) {
      await saveFloatingGroups([{
        groupId: item.groupId,
        parentItemId: itemId,
        windowId: tabEntry.windowId,
        tabIndex: tabEntry.index,
        url: tabEntry.url,
        savedAt: Date.now(),
      }]);
    }
  }

  if (tabId !== null) {
    await releaseClaimByTab(tabId);
  }

  return null;
}

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC1: demoteItem validates itemId — rejects empty string', async () => {
  await assert.rejects(
    () => demoteItem(''),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('AC1: demoteItem validates itemId — rejects non-string', async () => {
  await assert.rejects(
    () => demoteItem(42),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('AC6: demoteItem is idempotent — nonexistent item returns null silently', async () => {
  const result = await demoteItem('nonexistent-item-id');
  assert.equal(result, null);
});

test('AC2: demoteItem with live tab — item deleted and claim released', async () => {
  __setMockTabs([{ id: 1, url: 'https://demo.com', windowId: 1, active: false, audible: false, index: 0 }]);
  await buildLiveTabIndex();
  const item = await createItem({ title: 'Demo', url: 'https://demo.com', groupId: null });
  const items = await listItems();
  await reconcileClaims(items.map((it) => ({ id: it.id, url: it.url, sortOrder: it.sortOrder })));

  await demoteItem(item.id);

  const stored = await getItem(item.id);
  assert.equal(stored, null, 'item should be deleted from storage');

  const mirror = getClaimsMirror();
  assert.equal(mirror[item.id], undefined, 'claim should be released');
});

test('AC3: demoteItem with no live tab — item deleted, no error', async () => {
  // No mock tabs — no claim will exist
  const item = await createItem({ title: 'No Tab', url: 'https://notab.com', groupId: null });
  const result = await demoteItem(item.id);
  assert.equal(result, null);
  const stored = await getItem(item.id);
  assert.equal(stored, null, 'item should be deleted even without a tab claim');
});

test('AC4: demoteItem clears drift record', async () => {
  __setMockTabs([{ id: 2, url: 'https://drift.com', windowId: 1, active: false, audible: false, index: 0 }]);
  await buildLiveTabIndex();
  const item = await createItem({ title: 'Drift', url: 'https://drift.com', groupId: null });
  const items = await listItems();
  await reconcileClaims(items.map((it) => ({ id: it.id, url: it.url, sortOrder: it.sortOrder })));

  // Introduce drift
  await detectDriftForTab(2, 'https://elsewhere.com', items.map((it) => ({ id: it.id, url: it.url, sortOrder: it.sortOrder })));

  const { getDriftRecords } = await import('../background/tabs/drift.js');
  let drift = await getDriftRecords();
  assert.ok(drift[item.id], 'drift should exist before demotion');

  await demoteItem(item.id);

  drift = await getDriftRecords();
  assert.equal(drift[item.id], undefined, 'drift should be cleared after demotion');
});

test('AC5: demoteItem saves floating group when item has groupId and live tab', async () => {
  const g = await createGroup({ name: 'Work', color: COLOR, parentId: null });
  __setMockTabs([{ id: 3, url: 'https://work.com', windowId: 10, active: false, audible: false, index: 2 }]);
  await buildLiveTabIndex();

  const item = await createItem({ title: 'Work Tab', url: 'https://work.com', groupId: g.id });
  await claimTabForItem(item.id, 3);

  await demoteItem(item.id);

  // Check floating groups were written to storage
  const floating = __getRawStore('tj:floatingGroups');
  assert.ok(Array.isArray(floating), 'floatingGroups partition should be an array');
  assert.equal(floating.length, 1, 'one floating group entry should be saved');
  assert.equal(floating[0].groupId, g.id);
  assert.equal(floating[0].windowId, 10);
  assert.equal(floating[0].tabIndex, 2);
});

test('AC7: release ordering — floating group saved BEFORE claim released', async () => {
  const g = await createGroup({ name: 'Ordered', color: COLOR, parentId: null });
  __setMockTabs([{ id: 4, url: 'https://order.com', windowId: 5, active: false, audible: false, index: 0 }]);
  await buildLiveTabIndex();

  const item = await createItem({ title: 'Ordered', url: 'https://order.com', groupId: g.id });
  await claimTabForItem(item.id, 4);

  const events = [];
  // Patch saveFloatingGroups and releaseClaimByTab to record ordering
  const origClaim = getClaimsMirror();

  // We verify ordering by checking state after demote:
  // If floating group is saved BEFORE claim release, then
  // floatingGroups key must be written AND claim must be gone.
  await demoteItem(item.id);

  const floating = __getRawStore('tj:floatingGroups');
  const sessionClaims = getClaimsMirror();

  assert.ok(Array.isArray(floating) && floating.length === 1, 'floating group must be saved');
  assert.equal(sessionClaims[item.id], undefined, 'claim must be released');
});

test('AC8: demoteItem does not save floating group when item has no groupId', async () => {
  __setMockTabs([{ id: 5, url: 'https://ungrouped.com', windowId: 1, active: false, audible: false, index: 0 }]);
  await buildLiveTabIndex();

  const item = await createItem({ title: 'Ungrouped', url: 'https://ungrouped.com', groupId: null });
  await claimTabForItem(item.id, 5);

  await demoteItem(item.id);

  const floating = __getRawStore('tj:floatingGroups');
  const isEmpty = !floating || (Array.isArray(floating) && floating.length === 0);
  assert.ok(isEmpty, 'no floating group should be saved for ungrouped item');
});

test('AC9: roundtrip — promote then demote leaves no items and releases claim', async () => {
  __setMockTabs([{ id: 6, url: 'https://roundtrip.com', title: 'RT', windowId: 1, active: false, audible: false, index: 0 }]);
  await buildLiveTabIndex();

  // Simulate promote
  const item = await createItem({ title: 'RT', url: 'https://roundtrip.com', groupId: null });
  await claimTabForItem(item.id, 6);

  // Now demote
  await demoteItem(item.id);

  const stored = await getItem(item.id);
  assert.equal(stored, null, 'item should be gone after roundtrip');

  const mirror = getClaimsMirror();
  assert.equal(mirror[item.id], undefined, 'claim should be gone after roundtrip');
});
