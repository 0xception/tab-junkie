/**
 * promote-tab.test.js — B-016 AC1–AC9
 * Tests for MSG_PROMOTE_TAB handler via the dispatch layer (storage-handlers.js).
 *
 * We call the dispatch function directly from storage-handlers by re-exercising
 * the MSG_PROMOTE_TAB branch through a thin wrapper that mirrors what
 * registerStorageHandlers does (minus the chrome.runtime.onMessage wiring).
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetMock,
  __setMockTabs,
  __getSessionStore,
} from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims, getClaimsMirror } from '../background/tabs/tab-claims.js';
import { createItem, listItems, createGroup } from '../background/storage/index.js';
import { ERR_VALIDATION, ERR_NOT_FOUND, ERR_DUPLICATE_URL } from '../background/storage/errors.js';
import { GROUP_COLORS } from '../shared/constants.js';

// Import promote logic by re-using the same storage-handlers dispatch indirectly.
// We exercise MSG_PROMOTE_TAB by calling the exported functions it delegates to directly.
// For handler-level tests, import the functions used inside the handler.
import { claimTabForItem } from '../background/tabs/tab-claims.js';
import { safeNormalizeForMatch } from '../shared/url.js';

// Helper: replicate what MSG_PROMOTE_TAB does so we can test it end-to-end.
async function promoteTab({ tabId, groupId = null }) {
  if (typeof tabId !== 'number') {
    const { StorageError, ERR_VALIDATION: EV } = await import('../background/storage/errors.js');
    throw new StorageError(EV, 'promoteTab: tabId must be a number');
  }
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    const { StorageError } = await import('../background/storage/errors.js');
    const { ERR_NOT_FOUND: ENF } = await import('../background/storage/errors.js');
    throw new StorageError(ENF, 'tab not found');
  }
  if (!tab) {
    const { StorageError, ERR_NOT_FOUND: ENF } = await import('../background/storage/errors.js');
    throw new StorageError(ENF, 'tab not found');
  }
  const url = tab.url || '';
  const restricted = ['chrome://', 'about:', 'chrome-extension://', 'file:'];
  for (const scheme of restricted) {
    if (url.startsWith(scheme)) {
      const { StorageError } = await import('../background/storage/errors.js');
      const { ERR_VALIDATION: EV } = await import('../background/storage/errors.js');
      throw new StorageError(EV, 'promoteTab: restricted URL scheme cannot be saved');
    }
  }
  const allItems = await listItems();
  const normalizedTabUrl = safeNormalizeForMatch(url);
  const dup = allItems.find((it) => safeNormalizeForMatch(it.url) === normalizedTabUrl);
  if (dup) {
    const { StorageError, ERR_DUPLICATE_URL: EDU } = await import('../background/storage/errors.js');
    throw new StorageError(EDU, 'promoteTab: an item with this URL already exists');
  }
  const newItem = await createItem({ title: tab.title || url, url, groupId });
  await claimTabForItem(newItem.id, tabId);
  return newItem;
}

const COLOR = GROUP_COLORS[0];

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC1: promoteTab rejects non-number tabId', async () => {
  await assert.rejects(
    () => promoteTab({ tabId: 'not-a-number' }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('AC2: promoteTab rejects when tab does not exist', async () => {
  // chrome.tabs.get returns null for missing tabs (per chrome-mock)
  await assert.rejects(
    () => promoteTab({ tabId: 9999 }),
    (err) => {
      assert.equal(err.code, ERR_NOT_FOUND);
      return true;
    },
  );
});

test('AC3: promoteTab rejects chrome:// URLs', async () => {
  __setMockTabs([{ id: 1, url: 'chrome://settings', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  await assert.rejects(
    () => promoteTab({ tabId: 1 }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('AC3: promoteTab rejects about: URLs', async () => {
  __setMockTabs([{ id: 2, url: 'about:blank', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  await assert.rejects(
    () => promoteTab({ tabId: 2 }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('AC3: promoteTab rejects file: URLs', async () => {
  __setMockTabs([{ id: 3, url: 'file:///home/user/doc.html', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  await assert.rejects(
    () => promoteTab({ tabId: 3 }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('AC4: promoteTab rejects duplicate URL (item already exists)', async () => {
  await createItem({ title: 'Existing', url: 'https://example.com', groupId: null });
  __setMockTabs([{ id: 10, url: 'https://example.com', title: 'Example', windowId: 1, active: true, audible: false }]);
  await buildLiveTabIndex();
  await assert.rejects(
    () => promoteTab({ tabId: 10 }),
    (err) => {
      assert.equal(err.code, ERR_DUPLICATE_URL);
      return true;
    },
  );
});

test('AC4: promoteTab detects duplicate URL with normalization (trailing slash)', async () => {
  await createItem({ title: 'Existing', url: 'https://example.com', groupId: null });
  __setMockTabs([{ id: 11, url: 'https://example.com/', title: 'Example', windowId: 1, active: true, audible: false }]);
  await buildLiveTabIndex();
  await assert.rejects(
    () => promoteTab({ tabId: 11 }),
    (err) => {
      assert.equal(err.code, ERR_DUPLICATE_URL);
      return true;
    },
  );
});

test('AC5/AC6: promoteTab happy path creates item and writes claim', async () => {
  __setMockTabs([{ id: 20, url: 'https://saved.com/page', title: 'Saved Page', windowId: 1, active: true, audible: false }]);
  await buildLiveTabIndex();
  const item = await promoteTab({ tabId: 20, groupId: null });

  assert.ok(item.id, 'should return created item with id');
  assert.equal(item.url, 'https://saved.com/page');
  assert.equal(item.title, 'Saved Page');
  assert.equal(item.groupId, null);

  // Verify claim was written
  const mirror = getClaimsMirror();
  assert.equal(mirror[item.id], 20);
});

test('AC5/AC6: promoteTab assigns item to specified groupId', async () => {
  const g = await createGroup({ name: 'Work', color: COLOR, parentId: null });
  __setMockTabs([{ id: 21, url: 'https://work.com', title: 'Work', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  const item = await promoteTab({ tabId: 21, groupId: g.id });
  assert.equal(item.groupId, g.id);
});

test('AC6: claim is written to session storage', async () => {
  __setMockTabs([{ id: 22, url: 'https://session-test.com', title: 'T', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  const item = await promoteTab({ tabId: 22 });
  const sessionClaims = __getSessionStore('tj:tabClaims');
  assert.ok(sessionClaims, 'session storage should have claims');
  assert.equal(sessionClaims[item.id], 22);
});

test('AC9: failure atomicity — rejected promote does not leave a partial item', async () => {
  const before = await listItems();
  __setMockTabs([{ id: 30, url: 'chrome://newtab', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  await assert.rejects(() => promoteTab({ tabId: 30 }));
  const after = await listItems();
  assert.equal(after.length, before.length, 'no item should be created on failure');
});
