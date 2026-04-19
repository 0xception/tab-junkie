/**
 * b044-commit.test.js — atomic commit-path tests for MSG_IMPORT_COLLECTION
 * (B-044, R3).
 *
 * AC coverage:
 *   - AC12 → single atomic writeTransaction for items + groups (+ prefs).
 *             Partial failure rolls back pre-import state byte-for-byte.
 *             Transient partitions (drift, floatingGroups) reset in a second
 *             transaction; session tab-claims cleared.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetMock,
  __resetSetCallCount,
  __setCallCount,
  seedPartitions,
  __getRawStore,
  __getSessionStore,
  __setSessionStore,
  __triggerQuotaOnNextSet,
} from './chrome-mock.js';

import { commitImport } from '../background/import/commit.js';
import { ulid } from '../background/storage/ids.js';

beforeEach(() => {
  __resetMock();
});

function makeItem(overrides = {}) {
  return {
    id: ulid(),
    title: 'T',
    url: 'https://example.com/',
    groupId: null,
    sortOrder: 0,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function makeGroup(overrides = {}) {
  return {
    id: ulid(),
    name: 'G',
    color: 'blue',
    parentId: null,
    sortOrder: 0,
    collapsed: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

/* =========================================================================
 * AC12 — atomic write of items + groups
 * ========================================================================= */

test('B-044 AC12: commitImport replaces items+groups in one atomic writeTransaction (1 set call)', async () => {
  /* Seed pre-existing state that must be wiped. */
  seedPartitions({
    items: [{
      id: 'i-old', title: 'Old', url: 'https://old.example/',
      groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1,
    }],
    groups: [{
      id: 'g-old', name: 'Old', color: 'red', parentId: null, sortOrder: 0,
      collapsed: false, createdAt: 1, updatedAt: 1,
    }],
  });
  __resetSetCallCount();
  const result = await commitImport({
    items: [makeItem({ title: 'New' })],
    groups: [makeGroup({ name: 'NewGroup' })],
  });
  assert.equal(result.itemsImported, 1);
  assert.equal(result.groupsImported, 1);
  /* AC12: the primary items+groups swap is a single writeTransaction → 1 set.
     The follow-up transient-partition reset is a SECOND writeTransaction →
     1 additional set. Total 2 set calls is the contract (§33.7). */
  const setCalls = __setCallCount();
  assert.equal(setCalls, 2, 'exactly 2 set calls — primary tx + transient reset tx');
  const items = __getRawStore('tj:items');
  const groups = __getRawStore('tj:groups');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'New');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, 'NewGroup');
});

test('B-044 AC12: commitImport with preferences writes tj:prefs in the same transaction', async () => {
  __resetSetCallCount();
  await commitImport({
    items: [],
    groups: [],
    preferences: {
      theme: 'dark',
      displayMode: 'sidepanel',
      newTabOverride: false,
      autoCollapseSubGroups: true,
    },
  });
  const prefs = __getRawStore('tj:prefs');
  assert.equal(prefs.theme, 'dark');
  assert.equal(prefs.autoCollapseSubGroups, true);
});

test('B-044 AC12: commit failure (quota) rolls back — pre-import state preserved', async () => {
  seedPartitions({
    items: [{
      id: 'i-preserved', title: 'Preserved', url: 'https://preserved.example/',
      groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1,
    }],
    groups: [],
  });
  __triggerQuotaOnNextSet();
  await assert.rejects(
    commitImport({ items: [makeItem({ title: 'New' })], groups: [] }),
    (err) => err.code === 'ERR_QUOTA_EXCEEDED',
  );
  /* AC12: pre-import state intact. */
  const items = __getRawStore('tj:items');
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'i-preserved');
});

/* =========================================================================
 * Transient partitions reset outside main transaction (§33.7)
 * ========================================================================= */

test('B-044 §33.7: drift + floatingGroups partitions reset after commit', async () => {
  seedPartitions({
    drift: { someItem: { itemId: 'someItem', driftedToUrl: 'https://x.example/', detectedAt: 1 } },
    floatingGroups: [{
      groupId: 'g1', itemId: 'i1', windowId: 1, tabIndex: 0,
      url: 'https://x.example/', savedAt: 1,
    }],
  });
  await commitImport({ items: [], groups: [] });
  const drift = __getRawStore('tj:drift');
  const floating = __getRawStore('tj:floatingGroups');
  assert.deepEqual(drift, {}, 'drift fully cleared');
  assert.deepEqual(floating, [], 'floatingGroups fully cleared');
});

test('B-044 §33.7: session tabClaims wiped after commit', async () => {
  __setSessionStore('tj:tabClaims', { i1: 999 });
  await commitImport({ items: [], groups: [] });
  const claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims, undefined, 'session tab-claims removed');
});

/* =========================================================================
 * Allow-list strip on commit — defence-in-depth
 * ========================================================================= */

test('B-044 C-7: stray runtime fields on items are stripped at commit boundary', async () => {
  const item = {
    ...makeItem({ title: 'Clean' }),
    /* Stray runtime enrichments — must not reach storage. */
    live: true,
    active: false,
    audible: false,
    tabId: 42,
    windowId: 7,
    favIconUrl: 'https://tracker.example/f.ico',
  };
  await commitImport({ items: [item], groups: [] });
  const items = __getRawStore('tj:items');
  assert.equal(items.length, 1);
  for (const forbidden of ['live', 'active', 'audible', 'tabId', 'windowId', 'favIconUrl']) {
    assert.equal(forbidden in items[0], false, forbidden + ' must be stripped');
  }
});

test('B-044 C-7: stray runtime fields on groups are stripped at commit boundary', async () => {
  const group = {
    ...makeGroup({ name: 'G' }),
    warning: 'DUPLICATE_NAME',
  };
  await commitImport({ items: [], groups: [group] });
  const groups = __getRawStore('tj:groups');
  assert.equal(groups.length, 1);
  assert.equal('warning' in groups[0], false, 'warning must be stripped');
});
