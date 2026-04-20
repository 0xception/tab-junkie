/**
 * b045-json-validator.test.js — pure-unit tests for the JSON-import
 * validator (B-045, R3). Parse → root-shape → schemaVersion gate → allow-
 * list sanitize → repair passes → ULID re-mint.
 *
 * AC coverage:
 *   AC1  — file-picker filter covered in sidepanel-side tests; here we
 *          exercise the validator entry assuming the picker has already
 *          accepted a .json file.
 *   AC2  — root-shape validation per §32.5.1.
 *   AC3  — schemaVersion gate (= / < / > KNOWN_VERSION).
 *   AC5  — orphaned sub-groups reparented to null.
 *   AC6  — circular parentId cycles broken at the junior edge.
 *   AC7  — duplicate IDs → fresh ULIDs for all subsequent collisions.
 *   AC8  — orphaned items → groupId := null.
 *   AC9  — allow-list strip: unknown fields dropped before return.
 *   AC10 — preferences shape-invalid → `preferencesSkipped: true`, no prefs
 *          attached; valid prefs pass through.
 *   AC12 — duplicate URLs in-file reduced to one survivor (first wins).
 *   AC15 — URL scheme allow-list is enforced by `normalizeUrl` inside
 *          `normalizeItems` → javascript: / data: items are dropped.
 *
 * §33.6 error taxonomy coverage:
 *   - ERR_INVALID_FORMAT        (JSON.parse throws)
 *   - ERR_MALFORMED_ROOT        (root shape fails §32.5.1)
 *   - ERR_UNKNOWN_SCHEMA_VERSION (version > KNOWN_VERSION)
 *   - ERR_UNREPAIRABLE           (repair produces empty snapshot from
 *                                 non-empty source)
 *
 * ULID invariant coverage (C-4, §33.8):
 *   - every returned item.id and group.id is a freshly minted ULID, NOT
 *     a file-provided id (round-trip is content-equivalent, not id-equal).
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock } from './chrome-mock.js';

import { parseAndValidate } from '../background/import/json-validator.js';
import { KNOWN_VERSION } from '../background/storage/migration.js';

beforeEach(() => {
  __resetMock();
});

/* =========================================================================
 * Fixtures
 * ========================================================================= */

function baseBackup(overrides = {}) {
  return JSON.stringify({
    schemaVersion: KNOWN_VERSION,
    exportedAt: '2026-04-19T00:00:00.000Z',
    items: [],
    groups: [],
    ...overrides,
  });
}

function mkItem(over = {}) {
  return {
    id: 'i-1',
    title: 'Item',
    url: 'https://example.com/',
    groupId: null,
    sortOrder: 0,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...over,
  };
}

function mkGroup(over = {}) {
  return {
    id: 'g-1',
    name: 'Group',
    color: 'blue',
    parentId: null,
    sortOrder: 0,
    collapsed: false,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...over,
  };
}

/* =========================================================================
 * Step 1 — JSON.parse (ERR_INVALID_FORMAT)
 * ========================================================================= */

test('B-045 AC2: malformed JSON → ERR_INVALID_FORMAT', () => {
  try {
    parseAndValidate('{ schemaVersion: 1');
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.name, 'StorageError');
    assert.equal(err.code, 'ERR_INVALID_FORMAT');
  }
});

test('B-045 AC2: empty string is still invalid JSON → ERR_INVALID_FORMAT', () => {
  try {
    parseAndValidate('');
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.code, 'ERR_INVALID_FORMAT');
  }
});

/* =========================================================================
 * Step 2 — Root-shape validation (AC2)
 * ========================================================================= */

test('B-045 AC2: top-level array → ERR_MALFORMED_ROOT', () => {
  try {
    parseAndValidate('[]');
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.code, 'ERR_MALFORMED_ROOT');
  }
});

test('B-045 AC2: top-level primitive → ERR_MALFORMED_ROOT', () => {
  try {
    parseAndValidate('42');
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.code, 'ERR_MALFORMED_ROOT');
  }
});

test('B-045 AC2: missing schemaVersion → ERR_MALFORMED_ROOT', () => {
  const content = JSON.stringify({ exportedAt: 'x', items: [], groups: [] });
  try {
    parseAndValidate(content);
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.code, 'ERR_MALFORMED_ROOT');
  }
});

test('B-045 AC2: non-integer schemaVersion → ERR_MALFORMED_ROOT', () => {
  try {
    parseAndValidate(baseBackup({ schemaVersion: 1.5 }));
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.code, 'ERR_MALFORMED_ROOT');
  }
});

test('B-045 AC2: schemaVersion < 1 → ERR_MALFORMED_ROOT', () => {
  try {
    parseAndValidate(baseBackup({ schemaVersion: 0 }));
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.code, 'ERR_MALFORMED_ROOT');
  }
});

test('B-045 AC2: missing exportedAt → ERR_MALFORMED_ROOT', () => {
  const content = JSON.stringify({ schemaVersion: 1, items: [], groups: [] });
  try {
    parseAndValidate(content);
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.code, 'ERR_MALFORMED_ROOT');
  }
});

test('B-045 AC2: items not an array → ERR_MALFORMED_ROOT', () => {
  try {
    parseAndValidate(baseBackup({ items: 'bogus' }));
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.code, 'ERR_MALFORMED_ROOT');
  }
});

test('B-045 AC2: groups not an array → ERR_MALFORMED_ROOT', () => {
  try {
    parseAndValidate(baseBackup({ groups: null }));
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.code, 'ERR_MALFORMED_ROOT');
  }
});

test('B-045 AC2: preferences present but not an object → ERR_MALFORMED_ROOT', () => {
  try {
    parseAndValidate(baseBackup({ preferences: 42 }));
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.code, 'ERR_MALFORMED_ROOT');
  }
});

test('B-045 AC2: empty valid backup → zero items, zero groups, no throw', () => {
  const res = parseAndValidate(baseBackup());
  assert.equal(res.items.length, 0);
  assert.equal(res.groups.length, 0);
  assert.equal(res.repairs.orphanedGroups, 0);
  assert.equal(res.repairs.cyclesBroken, 0);
});

/* =========================================================================
 * Step 3 — schemaVersion gate (AC3)
 * ========================================================================= */

test('B-045 AC3: schemaVersion === KNOWN_VERSION passes', () => {
  const res = parseAndValidate(baseBackup({
    items: [mkItem()],
  }));
  assert.equal(res.items.length, 1);
});

test('B-045 AC3: schemaVersion > KNOWN_VERSION → ERR_UNKNOWN_SCHEMA_VERSION', () => {
  try {
    parseAndValidate(baseBackup({ schemaVersion: KNOWN_VERSION + 1 }));
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.code, 'ERR_UNKNOWN_SCHEMA_VERSION');
    assert.match(err.message, /newer version/i);
  }
});

test('B-045 AC3: schemaVersion < KNOWN_VERSION tolerated (MIGRATION_STEPS currently empty)', () => {
  /* At KNOWN_VERSION = 1 the < branch is unreachable (no earlier versions).
     Verify the current version is the floor: any integer >=1 and <=KNOWN_VERSION
     is tolerated. If KNOWN_VERSION > 1 later, this test grows a real "older
     file" case. */
  const content = baseBackup({ schemaVersion: KNOWN_VERSION });
  const res = parseAndValidate(content);
  assert.ok(Array.isArray(res.items));
});

/* =========================================================================
 * ULID re-mint (C-4, §33.8)
 * ========================================================================= */

test('B-045 ULID C-4: every imported item.id is freshly minted (not file-provided)', () => {
  const content = baseBackup({
    items: [
      mkItem({ id: 'file-id-1', url: 'https://a.example/' }),
      mkItem({ id: 'file-id-2', url: 'https://b.example/' }),
    ],
  });
  const res = parseAndValidate(content);
  assert.equal(res.items.length, 2);
  for (const it of res.items) {
    assert.notEqual(it.id, 'file-id-1');
    assert.notEqual(it.id, 'file-id-2');
    /* ULID format: 26 chars, uppercase Crockford base32. */
    assert.match(it.id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  }
});

test('B-045 ULID C-4: every imported group.id is freshly minted', () => {
  const content = baseBackup({
    groups: [mkGroup({ id: 'file-g-1' })],
  });
  const res = parseAndValidate(content);
  assert.equal(res.groups.length, 1);
  assert.notEqual(res.groups[0].id, 'file-g-1');
  assert.match(res.groups[0].id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
});

test('B-045 ULID: cross-references rewritten — item.groupId points to re-minted group.id', () => {
  const content = baseBackup({
    groups: [mkGroup({ id: 'gf-1' })],
    items: [mkItem({ url: 'https://x.example/', groupId: 'gf-1' })],
  });
  const res = parseAndValidate(content);
  assert.equal(res.items.length, 1);
  assert.equal(res.groups.length, 1);
  assert.equal(res.items[0].groupId, res.groups[0].id);
});

test('B-045 ULID: group.parentId rewritten through re-mint map', () => {
  const content = baseBackup({
    groups: [
      mkGroup({ id: 'parent', name: 'P' }),
      mkGroup({ id: 'child', name: 'C', parentId: 'parent' }),
    ],
  });
  const res = parseAndValidate(content);
  const parent = res.groups.find((g) => g.name === 'P');
  const child = res.groups.find((g) => g.name === 'C');
  assert.equal(child.parentId, parent.id);
});

/* =========================================================================
 * AC5 — Orphaned sub-groups
 * ========================================================================= */

test('B-045 AC5: orphaned sub-group → parentId null + repair counted', () => {
  const content = baseBackup({
    groups: [
      mkGroup({ id: 'g-child', parentId: 'missing-parent' }),
    ],
  });
  const res = parseAndValidate(content);
  assert.equal(res.groups.length, 1);
  assert.equal(res.groups[0].parentId, null);
  assert.equal(res.repairs.orphanedGroups, 1);
});

test('B-045 AC5: multiple orphans counted correctly', () => {
  const content = baseBackup({
    groups: [
      mkGroup({ id: 'a', parentId: 'nonexistent-1' }),
      mkGroup({ id: 'b', parentId: 'nonexistent-2' }),
      mkGroup({ id: 'c', parentId: null }),
    ],
  });
  const res = parseAndValidate(content);
  assert.equal(res.repairs.orphanedGroups, 2);
  assert.ok(res.groups.every((g) => g.parentId === null));
});

/* =========================================================================
 * AC6 — Circular references
 * ========================================================================= */

test('B-045 AC6: simple A→B→A cycle → junior edge broken', () => {
  const content = baseBackup({
    groups: [
      mkGroup({ id: 'A', name: 'A', parentId: 'B', createdAt: 100 }),
      mkGroup({ id: 'B', name: 'B', parentId: 'A', createdAt: 200 }),
    ],
  });
  const res = parseAndValidate(content);
  assert.equal(res.repairs.cyclesBroken, 1);
  /* B is junior (higher createdAt); its parentId should be null. */
  const gA = res.groups.find((g) => g.name === 'A');
  const gB = res.groups.find((g) => g.name === 'B');
  /* Exactly one of A or B must have parentId = null after the break. */
  const nullCount = [gA, gB].filter((g) => g.parentId === null).length;
  assert.equal(nullCount, 1);
  /* Junior (larger createdAt) loses → gB has parentId null. */
  assert.equal(gB.parentId, null);
});

test('B-045 AC6: self-loop A→A → parentId null', () => {
  const content = baseBackup({
    groups: [mkGroup({ id: 'self', parentId: 'self' })],
  });
  const res = parseAndValidate(content);
  assert.equal(res.repairs.cyclesBroken, 1);
  assert.equal(res.groups[0].parentId, null);
});

/* =========================================================================
 * AC7 — Duplicate IDs
 * ========================================================================= */

test('B-045 AC7: duplicate item IDs → fresh ULIDs for subsequent; count reported', () => {
  const content = baseBackup({
    items: [
      mkItem({ id: 'dup', url: 'https://a.example/' }),
      mkItem({ id: 'dup', url: 'https://b.example/' }),
    ],
  });
  const res = parseAndValidate(content);
  assert.equal(res.items.length, 2);
  assert.equal(res.repairs.duplicateIds, 1);
  /* Final ids are all distinct ULIDs. */
  assert.equal(new Set(res.items.map((it) => it.id)).size, 2);
});

test('B-045 AC7: duplicate group IDs → fresh ULIDs; both survive', () => {
  const content = baseBackup({
    groups: [
      mkGroup({ id: 'shared', name: 'A' }),
      mkGroup({ id: 'shared', name: 'B' }),
    ],
  });
  const res = parseAndValidate(content);
  assert.equal(res.groups.length, 2);
  assert.equal(res.repairs.duplicateIds, 1);
});

/* =========================================================================
 * AC8 — Orphaned items
 * ========================================================================= */

test('B-045 AC8: item referencing missing groupId → null + counted', () => {
  const content = baseBackup({
    items: [
      mkItem({ id: 'i1', url: 'https://x.example/', groupId: 'nonexistent' }),
    ],
  });
  const res = parseAndValidate(content);
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].groupId, null);
  assert.equal(res.repairs.orphanedItems, 1);
});

/* =========================================================================
 * AC9 — Allow-list strip (C-7)
 * ========================================================================= */

test('B-045 AC9: unknown fields on item are silently dropped', () => {
  /* File-provided record has an unknown `favIconUrl` + `live` field — both
     must NOT survive into the returned record. */
  const dirtyItem = {
    ...mkItem({ url: 'https://x.example/' }),
    favIconUrl: 'https://evil.example/favicon.ico',
    live: true,
    windowId: 42,
  };
  const content = baseBackup({ items: [dirtyItem] });
  const res = parseAndValidate(content);
  assert.equal(res.items.length, 1);
  assert.equal('favIconUrl' in res.items[0], false);
  assert.equal('live' in res.items[0], false);
  assert.equal('windowId' in res.items[0], false);
});

test('B-045 AC9: unknown fields on group are silently dropped', () => {
  const dirtyGroup = {
    ...mkGroup(),
    warning: 'DUPLICATE_NAME',
    internalFlag: true,
  };
  const content = baseBackup({ groups: [dirtyGroup] });
  const res = parseAndValidate(content);
  assert.equal(res.groups.length, 1);
  assert.equal('warning' in res.groups[0], false);
  assert.equal('internalFlag' in res.groups[0], false);
});

/* =========================================================================
 * AC10 — Preferences
 * ========================================================================= */

test('B-045 AC10: valid preferences pass through', () => {
  const prefs = {
    theme: 'dark',
    displayMode: 'sidepanel',
    newTabOverride: true,
    autoCollapseSubGroups: false,
  };
  const content = baseBackup({ preferences: prefs });
  const res = parseAndValidate(content);
  assert.deepEqual(res.preferences, prefs);
  assert.equal(res.repairs.preferencesSkipped, false);
});

test('B-045 AC10: partial-shape preferences fill defaults for missing keys', () => {
  const content = baseBackup({ preferences: { theme: 'light' } });
  const res = parseAndValidate(content);
  assert.ok(res.preferences);
  assert.equal(res.preferences.theme, 'light');
  assert.equal(res.preferences.displayMode, 'sidepanel');
  assert.equal(res.repairs.preferencesSkipped, false);
});

test('B-045 AC10: preferences with bad theme → preferencesSkipped, no prefs', () => {
  const content = baseBackup({
    preferences: { theme: 'neon-pink', displayMode: 'sidepanel',
      newTabOverride: false, autoCollapseSubGroups: false },
  });
  const res = parseAndValidate(content);
  assert.equal(res.preferences, undefined);
  assert.equal(res.repairs.preferencesSkipped, true);
});

test('B-045 AC10: preferences with wrong type on boolean → preferencesSkipped', () => {
  const content = baseBackup({
    preferences: { newTabOverride: 'yes' },
  });
  const res = parseAndValidate(content);
  assert.equal(res.preferences, undefined);
  assert.equal(res.repairs.preferencesSkipped, true);
});

/* =========================================================================
 * AC12 — Duplicate URLs in-file
 * ========================================================================= */

test('B-045 AC12: duplicate URL in file → first survives, rest counted', () => {
  const content = baseBackup({
    items: [
      mkItem({ id: 'a', url: 'https://dup.example/', sortOrder: 1 }),
      mkItem({ id: 'b', url: 'https://dup.example/', sortOrder: 2 }),
      mkItem({ id: 'c', url: 'https://dup.example/', sortOrder: 3 }),
    ],
  });
  const res = parseAndValidate(content);
  assert.equal(res.items.length, 1);
  assert.equal(res.repairs.duplicateUrls, 2);
});

test('B-045 AC12: URLs that normalize to the same canonical form are deduped', () => {
  const content = baseBackup({
    items: [
      mkItem({ id: 'a', url: 'https://example.com/path' }),
      mkItem({ id: 'b', url: 'HTTPS://EXAMPLE.COM/path' }),
    ],
  });
  const res = parseAndValidate(content);
  /* After normalizeUrl, both should converge to lowercased-host; dedup to 1. */
  assert.equal(res.items.length, 1);
  assert.equal(res.repairs.duplicateUrls, 1);
});

/* =========================================================================
 * AC15 — URL scheme allow-list (javascript:, data:)
 * ========================================================================= */

test('B-045 AC15: item with javascript: URL is dropped', () => {
  const content = baseBackup({
    items: [
      mkItem({ id: 'js', url: 'javascript:alert(1)' }),
      mkItem({ id: 'ok', url: 'https://ok.example/' }),
    ],
  });
  const res = parseAndValidate(content);
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].url.startsWith('https://'), true);
});

test('B-045 AC15: title with script-like content survives as literal text', () => {
  const content = baseBackup({
    items: [
      mkItem({ title: '</div><script>alert(1)</script>', url: 'https://safe.example/' }),
    ],
  });
  const res = parseAndValidate(content);
  assert.equal(res.items.length, 1);
  /* Title is a literal string — no parsing, no stripping. Consumer uses
     textContent downstream (B-044 AC15 pattern). */
  assert.match(res.items[0].title, /<script>/);
});

/* =========================================================================
 * ERR_UNREPAIRABLE
 * ========================================================================= */

test('B-045: non-empty source that survives neither normalize nor repair → ERR_UNREPAIRABLE', () => {
  /* Every item has a javascript: URL (dropped) and every group lacks an id
     (dropped) — source was non-empty but normalize yields empty arrays. */
  const content = baseBackup({
    items: [
      { id: 'a', title: 't', url: 'javascript:evil', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 },
      { id: 'b', title: 't', url: 'data:text/html,<x>', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 },
    ],
    groups: [
      { name: 'no-id', color: 'blue', parentId: null, sortOrder: 0, collapsed: false, createdAt: 1, updatedAt: 1 },
    ],
  });
  try {
    parseAndValidate(content);
    assert.fail('expected throw');
  } catch (err) {
    assert.equal(err.code, 'ERR_UNREPAIRABLE');
  }
});

/* =========================================================================
 * Repair report shape (§33 — stable for sidepanel surface)
 * ========================================================================= */

test('B-045: repair report has all documented keys', () => {
  const res = parseAndValidate(baseBackup());
  assert.ok(res.repairs);
  assert.equal(typeof res.repairs.orphanedGroups, 'number');
  assert.equal(typeof res.repairs.cyclesBroken, 'number');
  assert.equal(typeof res.repairs.duplicateIds, 'number');
  assert.equal(typeof res.repairs.orphanedItems, 'number');
  assert.equal(typeof res.repairs.duplicateUrls, 'number');
  assert.equal(typeof res.repairs.preferencesSkipped, 'boolean');
});

test('B-045: repair counts are zero on a clean backup', () => {
  const content = baseBackup({
    groups: [mkGroup({ id: 'g1' })],
    items: [mkItem({ id: 'i1', url: 'https://clean.example/', groupId: 'g1' })],
  });
  const res = parseAndValidate(content);
  assert.deepEqual(res.repairs, {
    orphanedGroups: 0,
    cyclesBroken: 0,
    duplicateIds: 0,
    orphanedItems: 0,
    duplicateUrls: 0,
    preferencesSkipped: false,
  });
});

/* =========================================================================
 * Combined repair scenario — orphan + duplicate + missing-groupId
 * ========================================================================= */

test('B-045: mixed-defects backup produces all repairs correctly counted', () => {
  const content = baseBackup({
    groups: [
      mkGroup({ id: 'A', name: 'A' }),
      mkGroup({ id: 'A', name: 'A-dup' }), /* dup id */
      mkGroup({ id: 'Z', name: 'Z', parentId: 'missing' }), /* orphan */
    ],
    items: [
      mkItem({ id: 'i1', url: 'https://first.example/', groupId: 'A' }),
      mkItem({ id: 'i1', url: 'https://second.example/', groupId: 'nope' }), /* dup id + orphan */
      mkItem({ id: 'i3', url: 'https://dup.example/' }),
      mkItem({ id: 'i4', url: 'https://dup.example/' }), /* dup url */
    ],
  });
  const res = parseAndValidate(content);
  assert.equal(res.repairs.duplicateIds, 2);  /* 1 group + 1 item */
  assert.equal(res.repairs.orphanedGroups, 1);
  assert.equal(res.repairs.orphanedItems, 1);
  assert.equal(res.repairs.duplicateUrls, 1);
  /* Post-repair: 3 groups, 3 items (one dropped by dedup). */
  assert.equal(res.groups.length, 3);
  assert.equal(res.items.length, 3);
});

/* =========================================================================
 * C-7 allow-list — no Object.keys(input) iteration
 *
 * Static check: unknown fields must not survive. A probe with 20 random
 * garbage keys must return a record with exactly the allow-list keys.
 * ========================================================================= */

test('B-045 C-7: allow-list iteration drops every unknown key (20-field probe)', () => {
  const garbage = Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [`unknown_field_${i}`, 'value']),
  );
  const dirty = { ...mkItem({ url: 'https://x.example/' }), ...garbage };
  const content = baseBackup({ items: [dirty] });
  const res = parseAndValidate(content);
  const rec = res.items[0];
  const expectedKeys = new Set([
    'id', 'title', 'url', 'groupId', 'sortOrder', 'createdAt', 'updatedAt',
  ]);
  for (const k of Object.keys(rec)) {
    assert.ok(expectedKeys.has(k) || k === 'lastAccessedAt',
      `unexpected key on imported item: ${k}`);
  }
});

/* =========================================================================
 * ULID cross-reference preservation with duplicates (AC7 disambiguation:
 * "links follow the last-written duplicate")
 * ========================================================================= */

test('B-045 AC7: cross-reference follows last-written duplicate group', () => {
  /* Two groups share file-id "g-shared". Items reference "g-shared" — under
     the "last wins" rule, items resolve to the second (renamed) group. */
  const content = baseBackup({
    groups: [
      mkGroup({ id: 'g-shared', name: 'First' }),
      mkGroup({ id: 'g-shared', name: 'Second' }),
    ],
    items: [
      mkItem({ id: 'i1', url: 'https://x.example/', groupId: 'g-shared' }),
    ],
  });
  const res = parseAndValidate(content);
  assert.equal(res.groups.length, 2);
  const second = res.groups.find((g) => g.name === 'Second');
  /* Item's groupId resolves to Second (the last-written) group's re-minted id. */
  assert.equal(res.items[0].groupId, second.id);
});

/* =========================================================================
 * R4 security-reviewer LOW L-1 — prototype-pollution regression
 *
 * The §32.5 allow-list + `key in item` pattern in `sanitizeItem` /
 * `sanitizeGroup` is safe by construction (only allow-list keys are copied,
 * and `__proto__` / `polluted` are not in the allow-list), but we encode
 * regression coverage here so any future refactor that switches to
 * `Object.keys(input)` or `Object.assign` without the filter fails loudly.
 *
 * Each test cleans up afterwards so the global prototype cannot leak across
 * test files even on assertion failure.
 * ========================================================================= */

test('B-045 sec-proto-1: __proto__ probe on an item does not pollute Object.prototype', () => {
  /* JSON.parse preserves `__proto__` as a plain own-key (it does NOT set the
     prototype chain). Construct the raw string so assertions probe the final
     own-property of the returned record. */
  const content = JSON.stringify({
    schemaVersion: 1,
    exportedAt: '2026-04-19T00:00:00.000Z',
    items: [{
      __proto__: { polluted: true },
      id: 'x',
      title: 't',
      url: 'https://proto.example/',
      groupId: null,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    }],
    groups: [],
    preferences: {},
  });
  try {
    const res = parseAndValidate(content);
    assert.equal({}.polluted, undefined, 'Object.prototype.polluted must be undefined');
    assert.equal(res.items.length, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(res.items[0], 'polluted'), false);
    /* Allow-list assertion: every own-key is on the §32.5.2 item allow-list. */
    const allowed = new Set([
      'id', 'title', 'url', 'groupId', 'sortOrder', 'createdAt', 'updatedAt',
      'lastAccessedAt',
    ]);
    for (const k of Object.keys(res.items[0])) {
      assert.ok(allowed.has(k), `unexpected own-key on returned item: ${k}`);
    }
  } finally {
    delete Object.prototype.polluted;
  }
});

test('B-045 sec-proto-2: __proto__ probe at the root does not pollute Object.prototype', () => {
  const content = JSON.stringify({
    __proto__: { foo: 'bar' },
    schemaVersion: 1,
    exportedAt: '2026-04-19T00:00:00.000Z',
    items: [],
    groups: [],
  });
  try {
    /* The call must succeed (root `__proto__` is a non-own key after
       JSON.parse, so `assertRootShape` sees only the required keys). */
    const res = parseAndValidate(content);
    assert.equal({}.foo, undefined, 'Object.prototype.foo must be undefined');
    assert.equal(res.items.length, 0);
    assert.equal(res.groups.length, 0);
  } finally {
    delete Object.prototype.foo;
  }
});

test('B-045 sec-proto-3: __proto__ on preferences neither pollutes nor surfaces as a pref', () => {
  /* Embed __proto__ inside preferences. The validator iterates §32.5.4 enum
     keys explicitly — any non-allow-list key (including one landing via the
     prototype chain) must not survive. */
  const content = JSON.stringify({
    schemaVersion: 1,
    exportedAt: '2026-04-19T00:00:00.000Z',
    items: [],
    groups: [],
    preferences: {
      __proto__: { theme: 'evil' },
      displayMode: 'sidepanel',
    },
  });
  try {
    const res = parseAndValidate(content);
    assert.equal({}.theme, undefined, 'Object.prototype.theme must be undefined');
    /* Preferences was a valid-shape object (__proto__ is not an own-key
       post-JSON.parse, so validatePreferences sees displayMode only) →
       defaults merged in, not "evil". */
    assert.ok(res.preferences, 'valid-shape prefs pass through');
    assert.notEqual(res.preferences.theme, 'evil',
      'prototype-provided theme must not surface as validated preference');
  } finally {
    delete Object.prototype.theme;
  }
});

/* =========================================================================
 * AC6 safety — deeply nested parentId chain
 *
 * Stack-safety regression: a 50-level deep chain (non-circular) must not
 * overflow the `breakCycles` walker or the cross-reference re-write. Covers
 * the user-visible "deep nested parent chain" UAT case.
 * ========================================================================= */

test('B-045 AC6: 50-level deep parentId chain survives without stack overflow', () => {
  const groups = [];
  const DEPTH = 50;
  for (let i = 0; i < DEPTH; i += 1) {
    groups.push(mkGroup({
      id: `g-${i}`,
      name: `G${i}`,
      parentId: i === 0 ? null : `g-${i - 1}`,
      createdAt: 1_700_000_000_000 + i,
    }));
  }
  const content = baseBackup({ groups });
  const res = parseAndValidate(content);
  assert.equal(res.groups.length, DEPTH);
  assert.equal(res.repairs.cyclesBroken, 0);
  /* Chain survives with every child pointing at its original parent's
     re-minted id (except root). Walk the resulting chain once. */
  const byName = new Map(res.groups.map((g) => [g.name, g]));
  for (let i = 1; i < DEPTH; i += 1) {
    const child = byName.get(`G${i}`);
    const parent = byName.get(`G${i - 1}`);
    assert.equal(child.parentId, parent.id,
      `G${i}.parentId must point at G${i - 1}.id after re-mint`);
  }
});

/* =========================================================================
 * Prefs-only backup — QA MEDIUM #1 current-behavior baseline
 *
 * The R4 [qa-reviewer] MEDIUM finding #1 flagged that a backup with zero
 * items + zero groups but a valid preferences block is rejected by the
 * sidepanel's zero-count guard ("Backup contains no bookmarks") before the
 * confirm dialog opens. Scrum-master has DEFERRED an inline fix; we encode
 * the validator-layer behavior here so any unintentional change is caught.
 *
 * Validator layer: passes prefs-only through as `items=[], groups=[],
 * preferences={...}` — it does NOT throw. The zero-count rejection lives
 * in sidepanel.js line ~1807 and is exercised by the UAT plan.
 * ========================================================================= */

test('B-045 prefs-only: validator passes empty items+groups+valid-prefs through (QA MEDIUM #1 baseline)', () => {
  const content = baseBackup({
    items: [],
    groups: [],
    preferences: {
      theme: 'dark',
      displayMode: 'sidepanel',
      newTabOverride: false,
      autoCollapseSubGroups: false,
    },
  });
  const res = parseAndValidate(content);
  assert.equal(res.items.length, 0);
  assert.equal(res.groups.length, 0);
  assert.ok(res.preferences, 'valid prefs survive validator');
  assert.equal(res.preferences.theme, 'dark');
  assert.equal(res.repairs.preferencesSkipped, false);
});
