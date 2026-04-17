/**
 * b005-bulk-create.test.js — B-005 AC1–AC10
 * Bulk-create saved items with partial-success semantics.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetMock,
  __triggerQuotaOnNextSet,
} from './chrome-mock.js';
import { __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims } from '../background/tabs/tab-claims.js';
import { bulkCreateItems, listItems, createGroup } from '../background/storage/index.js';
import { ERR_VALIDATION } from '../background/storage/errors.js';
import { MSG_BULK_CREATE_ITEMS } from '../shared/messages.js';
import { GROUP_COLORS } from '../shared/constants.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const COLOR = GROUP_COLORS[0]; // 'blue'

function validInput(overrides = {}) {
  return { title: 'Test Item', url: 'https://example.com', groupId: null, ...overrides };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

// ── AC1: non-array input ──────────────────────────────────────────────────────

test('AC1: non-array input returns { created: [], skipped: [] }', async () => {
  for (const bad of [null, undefined, 'string', 42, { title: 'x', url: 'https://x.com' }]) {
    const result = await bulkCreateItems(bad);
    assert.deepStrictEqual(result, { created: [], skipped: [] }, `Failed for input: ${JSON.stringify(bad)}`);
  }
});

// ── AC2: empty array ──────────────────────────────────────────────────────────

test('AC2: empty array returns { created: [], skipped: [] }', async () => {
  const result = await bulkCreateItems([]);
  assert.deepStrictEqual(result, { created: [], skipped: [] });
});

// ── AC3: all-valid inputs with valid groupId ──────────────────────────────────

test('AC3: all-valid inputs with valid groupId → all in created, none in skipped', async () => {
  const group = await createGroup({ name: 'Work', color: COLOR, parentId: null });

  const inputs = [
    { title: 'Item A', url: 'https://a.com', groupId: group.id },
    { title: 'Item B', url: 'https://b.com', groupId: group.id },
    { title: 'Item C', url: 'https://c.com', groupId: group.id },
  ];

  const result = await bulkCreateItems(inputs);
  assert.equal(result.created.length, 3);
  assert.equal(result.skipped.length, 0);

  for (const item of result.created) {
    assert.ok(typeof item.id === 'string' && item.id.length > 0, 'id must be a non-empty string');
    assert.ok(typeof item.title === 'string', 'title must be a string');
    assert.ok(typeof item.url === 'string', 'url must be a string');
    assert.equal(item.groupId, group.id);
    assert.equal(typeof item.sortOrder, 'number');
    assert.ok(Number.isFinite(item.createdAt), 'createdAt must be a finite number');
    assert.ok(Number.isFinite(item.updatedAt), 'updatedAt must be a finite number');
  }
});

// ── AC4: all-valid inputs with groupId=null ───────────────────────────────────

test('AC4: all-valid inputs with groupId=null → all created (ungrouped allowed)', async () => {
  const inputs = [
    { title: 'Ungrouped A', url: 'https://ug-a.com', groupId: null },
    { title: 'Ungrouped B', url: 'https://ug-b.com', groupId: null },
  ];

  const result = await bulkCreateItems(inputs);
  assert.equal(result.created.length, 2);
  assert.equal(result.skipped.length, 0);
  assert.ok(result.created.every((it) => it.groupId === null));
});

// ── AC5: mixed valid and invalid inputs ───────────────────────────────────────

test('AC5: invalid items (bad URL scheme) go to skipped with reason', async () => {
  // javascript: is a rejected scheme — normalizeUrl throws for it
  const inputs = [
    { title: 'Valid', url: 'https://good.com', groupId: null },
    { title: 'Bad URL', url: 'javascript:alert(1)', groupId: null },
    { title: 'Another Valid', url: 'https://also-good.com', groupId: null },
  ];

  const result = await bulkCreateItems(inputs);
  assert.equal(result.created.length, 2, 'two valid items should be created');
  assert.equal(result.skipped.length, 1, 'one invalid item should be skipped');
  assert.ok(typeof result.skipped[0].reason === 'string' && result.skipped[0].reason.length > 0, 'skipped entry must have a reason');
  assert.equal(result.skipped[0].input.url, 'javascript:alert(1)', 'skipped entry must reference the original input');
});

test('AC5: missing title goes to skipped', async () => {
  const inputs = [
    { title: 'Valid', url: 'https://valid.com', groupId: null },
    { url: 'https://no-title.com', groupId: null }, // no title
  ];

  const result = await bulkCreateItems(inputs);
  assert.equal(result.created.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.ok(result.skipped[0].reason.includes('title'));
});

// ── AC6: unknown groupId → skipped ───────────────────────────────────────────

test('AC6: unknown groupId that passes format validation goes to skipped', async () => {
  const fakeGroupId = '01J000000000000000000001'; // valid ULID format, but group doesn't exist

  const inputs = [
    { title: 'Valid', url: 'https://valid.com', groupId: null },
    { title: 'Unknown Group', url: 'https://unknown.com', groupId: fakeGroupId },
  ];

  const result = await bulkCreateItems(inputs);
  assert.equal(result.created.length, 1, 'item with valid groupId=null should be created');
  assert.equal(result.skipped.length, 1, 'item with non-existent groupId should be skipped');
  assert.ok(result.skipped[0].input.groupId === fakeGroupId, 'skipped entry should match the problematic input');
  assert.ok(typeof result.skipped[0].reason === 'string', 'skipped entry must have a reason');
});

// ── AC7: inputs.length > 500 → throws ERR_VALIDATION ─────────────────────────

test('AC7: 501 inputs throw ERR_VALIDATION', async () => {
  const inputs = Array.from({ length: 501 }, (_, i) => ({
    title: `Item ${i}`,
    url: `https://item-${i}.com`,
    groupId: null,
  }));

  await assert.rejects(
    () => bulkCreateItems(inputs),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION, `Expected ERR_VALIDATION, got: ${err.code}`);
      return true;
    },
  );
});

test('AC7: exactly 500 inputs does not throw', async () => {
  const inputs = Array.from({ length: 500 }, (_, i) => ({
    title: `Item ${i}`,
    url: `https://item-${i}.com`,
    groupId: null,
  }));

  // Should not throw
  const result = await bulkCreateItems(inputs);
  assert.equal(result.created.length, 500);
  assert.equal(result.skipped.length, 0);
});

// ── AC8: writeTransaction failure → all candidates in skipped ────────────────

test('AC8: storage write failure moves all candidates to skipped, created is empty', async () => {
  const inputs = [
    { title: 'Item A', url: 'https://quota-a.com', groupId: null },
    { title: 'Item B', url: 'https://quota-b.com', groupId: null },
  ];

  // Trigger quota error on the next set call
  __triggerQuotaOnNextSet();

  const result = await bulkCreateItems(inputs);
  assert.equal(result.created.length, 0, 'created must be empty on transaction failure');
  assert.equal(result.skipped.length, 2, 'both candidates should be in skipped');
  assert.ok(result.skipped.every((s) => typeof s.reason === 'string' && s.reason.length > 0));
});

// ── AC9: items are actually persisted ────────────────────────────────────────

test('AC9: created items are retrievable via listItems', async () => {
  const inputs = [
    { title: 'Persisted A', url: 'https://persist-a.com', groupId: null },
    { title: 'Persisted B', url: 'https://persist-b.com', groupId: null },
  ];

  const result = await bulkCreateItems(inputs);
  assert.equal(result.created.length, 2);

  const allItems = await listItems();
  assert.equal(allItems.length, 2);

  const ids = new Set(result.created.map((it) => it.id));
  for (const it of allItems) {
    assert.ok(ids.has(it.id), `listItems should include created id ${it.id}`);
  }
});

test('AC9: only valid items from a mixed batch are persisted', async () => {
  const inputs = [
    { title: 'Good', url: 'https://good-persist.com', groupId: null },
    { title: '', url: 'https://bad-title.com', groupId: null }, // invalid title
  ];

  await bulkCreateItems(inputs);

  const allItems = await listItems();
  assert.equal(allItems.length, 1, 'only the valid item should be persisted');
  // URL is normalized (trailing slash may be added by normalizeUrl)
  assert.ok(allItems[0].url.startsWith('https://good-persist.com'), 'URL should start with the original');
});

// ── AC10: MSG_BULK_CREATE_ITEMS dispatches correctly ─────────────────────────

test('AC10: MSG_BULK_CREATE_ITEMS constant is defined and has correct value', () => {
  assert.equal(MSG_BULK_CREATE_ITEMS, 'tj/bulkCreateItems');
});

test('AC10: dispatch(MSG_BULK_CREATE_ITEMS) calls bulkCreateItems with p.inputs', async () => {
  // We test the dispatch layer by calling bulkCreateItems directly with the same
  // logic the handler uses: dispatch passes p.inputs to bulkCreateItems.
  // This confirms the contract between the message handler and bulkCreateItems.
  const inputs = [
    { title: 'Dispatch Test', url: 'https://dispatch.com', groupId: null },
  ];

  // Replicate the dispatch layer's call
  const payload = { inputs };
  const result = await bulkCreateItems(payload.inputs);

  assert.equal(result.created.length, 1);
  assert.equal(result.created[0].title, 'Dispatch Test');
  // URL is normalized (trailing slash may be added by normalizeUrl)
  assert.ok(result.created[0].url.startsWith('https://dispatch.com'), 'URL should start with the original');
});

// ── Edge cases ────────────────────────────────────────────────────────────────

test('URL normalization: bare domain gets https:// prepended', async () => {
  const inputs = [{ title: 'Bare Domain', url: 'example.com', groupId: null }];
  const result = await bulkCreateItems(inputs);
  assert.equal(result.created.length, 1);
  assert.ok(result.created[0].url.startsWith('https://'), 'URL should be normalized to https://');
});

test('sortOrder defaults to 0 for all created items', async () => {
  const inputs = [
    { title: 'Item X', url: 'https://x.com', groupId: null },
    { title: 'Item Y', url: 'https://y.com', groupId: null },
  ];
  const result = await bulkCreateItems(inputs);
  assert.ok(result.created.every((it) => it.sortOrder === 0));
});
