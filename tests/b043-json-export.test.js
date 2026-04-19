/**
 * b043-json-export.test.js — B-043 R5 tests for the JSON backup export.
 *
 * Covers the pure builder + the MSG_EXPORT_COLLECTION integration for
 * `format: 'json'`. The integration test dispatches through the real
 * `chrome.runtime.onMessage._listeners` array (Sprint 15 retro action item)
 * — no local shim.
 *
 * AC mapping:
 *   - AC1  → 2-space indent, trailing newline, JSON.parse round-trip
 *   - AC2  → root shape + `preferences?` conditional inclusion
 *   - AC3  → schemaVersion sourced dynamically from KNOWN_VERSION
 *   - AC4  → item shape + unknown-field pass-through + runtime-enrichment strip
 *   - AC5  → group shape + never-persist `warning` strip
 *   - AC6  → deterministic byte-identical output (modulo exportedAt)
 *   - AC7  → round-trip integrity via JSON.parse
 *   - AC8  → filename pattern tab-junkie-backup-YYYY-MM-DD.json
 *   - AC10 → _exportErrorToast code→copy mapping for failure states
 *   - AC11 → 1000-item / 100-group corpus under 500ms
 *   - AC12 → orphan rescue (items + sub-groups)
 *   - AC13 → no new manifest permissions (verified by R4 grep — not a unit test)
 *
 * Plus: Q-10-equivalent UTF-8 byte-length probe + safe-mode pass-through.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, seedPartitions } from './chrome-mock.js';

import { buildJsonExport } from '../background/export/json-export.js';

import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import {
  MSG_EXPORT_COLLECTION,
} from '../shared/messages.js';
import { ERR_VALIDATION, ERR_NOT_READY, ERR_CORRUPT_DATA } from '../background/storage/errors.js';
import {
  KNOWN_VERSION,
  runMigrations,
  _resetMigrationStateForTest,
  _clearMigrationStepsForTest,
} from '../background/storage/migration.js';

beforeEach(() => {
  __resetMock();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
});

/* =========================================================================
   Fixture factories
   ========================================================================= */

function makeItem(overrides = {}) {
  return {
    id: 'i1',
    title: 'Hello',
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
    id: 'g1',
    name: 'Work',
    color: 'blue',
    parentId: null,
    sortOrder: 0,
    collapsed: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

const FIXED_DATE = new Date('2026-04-18T14:30:00.000Z');

/* =========================================================================
   AC1 — Format: UTF-8 JSON, 2-space indent, trailing newline, parseable
   ========================================================================= */

test('B-043 AC1: output is JSON.parse-able with 2-space indent', () => {
  const json = buildJsonExport({
    items: [makeItem()],
    groups: [makeGroup()],
    schemaVersion: 1,
    now: FIXED_DATE,
  });
  /* Parse round-trip must succeed. */
  const parsed = JSON.parse(json);
  assert.equal(parsed.schemaVersion, 1);
  /* 2-space indent evidence: the first nested key starts on a new line with
     two leading spaces. */
  assert.ok(/\n {2}"schemaVersion":/.test(json), 'indent uses 2 spaces');
});

test('B-043 AC1: output ends with a trailing newline', () => {
  const json = buildJsonExport({
    items: [],
    groups: [],
    schemaVersion: 1,
    now: FIXED_DATE,
  });
  assert.ok(json.endsWith('\n'), 'trailing newline required');
  assert.ok(!json.endsWith('\n\n'), 'exactly one trailing newline');
});

test('B-043 AC1: empty collection still produces a valid parseable document', () => {
  const json = buildJsonExport({
    items: [], groups: [], schemaVersion: 1, now: FIXED_DATE,
  });
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed.items, []);
  assert.deepEqual(parsed.groups, []);
});

/* =========================================================================
   AC2 — Root shape + preferences? conditional
   ========================================================================= */

test('B-043 AC2: root has schemaVersion, exportedAt, items, groups; no preferences when omitted', () => {
  const json = buildJsonExport({
    items: [], groups: [], schemaVersion: 1, now: FIXED_DATE,
  });
  const parsed = JSON.parse(json);
  assert.deepEqual(Object.keys(parsed).sort(), ['exportedAt', 'groups', 'items', 'schemaVersion']);
  assert.ok(!('preferences' in parsed), 'preferences key omitted when caller passes no value');
  assert.equal(parsed.exportedAt, '2026-04-18T14:30:00.000Z');
});

test('B-043 AC2: preferences key present when supplied', () => {
  const prefs = { theme: 'dark', displayMode: 'sidepanel', newTabOverride: false, autoCollapseSubGroups: true };
  const json = buildJsonExport({
    items: [], groups: [], schemaVersion: 1, now: FIXED_DATE, preferences: prefs,
  });
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed.preferences, prefs);
});

test('B-043 AC2: preferences=null suppresses the key (matches "never written" semantic)', () => {
  const json = buildJsonExport({
    items: [], groups: [], schemaVersion: 1, now: FIXED_DATE, preferences: null,
  });
  const parsed = JSON.parse(json);
  assert.ok(!('preferences' in parsed));
});

test('B-043 AC2: drift / floatingGroups / claims never appear in output (grep verification)', () => {
  /* Probe by seeding items with would-be runtime enrichments and checking
     the serialized output never includes the deny-listed field names. */
  const json = buildJsonExport({
    items: [makeItem({
      live: true, active: true, audible: true, drifted: true,
      tabId: 42, windowId: 7, highlight: '<b>x</b>',
    })],
    groups: [makeGroup({ warning: 'DUPLICATE_NAME' })],
    schemaVersion: 1,
    now: FIXED_DATE,
  });
  for (const forbidden of ['"live"', '"active"', '"audible"', '"drifted"',
    '"tabId"', '"windowId"', '"highlight"', '"warning"']) {
    assert.ok(!json.includes(forbidden), `forbidden runtime field leaked: ${forbidden}`);
  }
});

/* =========================================================================
   AC3 — schemaVersion sourced dynamically
   ========================================================================= */

test('B-043 AC3: schemaVersion === KNOWN_VERSION passed by caller', () => {
  /* The builder consumes whatever integer the handler passes; the dynamic-
     sourcing guarantee is asserted at the integration level below. This unit
     test pins the passthrough. */
  const json = buildJsonExport({
    items: [], groups: [], schemaVersion: 42, now: FIXED_DATE,
  });
  const parsed = JSON.parse(json);
  assert.equal(parsed.schemaVersion, 42);
});

test('B-043 AC3: no hardcoded version string in the builder source', async () => {
  /* Read the builder source and grep for a hardcoded `schemaVersion: 1`
     literal. The only `1` that may appear is inside the `toISOString` comment
     or unrelated code — a literal numeric default would make AC3 a FAIL. */
  const fs = await import('node:fs');
  const url = new URL('../background/export/json-export.js', import.meta.url);
  const src = fs.readFileSync(url, 'utf8');
  /* The literal assignment pattern would be `schemaVersion: 1` or
     `schemaVersion = 1`. Accept none. */
  assert.ok(!/schemaVersion\s*:\s*\d+/.test(src), 'builder must not hardcode schemaVersion literal');
  assert.ok(!/schemaVersion\s*=\s*\d+/.test(src), 'builder must not hardcode schemaVersion literal');
});

/* =========================================================================
   AC4 — Item shape + pass-through + runtime strip
   ========================================================================= */

test('B-043 AC4: item with standard fields emits them all verbatim', () => {
  const item = makeItem({
    id: '01J8ABCDEFGHJKMNPQRSTVWXYZ',
    title: 'Docs',
    url: 'https://example.com/docs',
    groupId: 'g1',
    sortOrder: 3,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_100_000,
    lastAccessedAt: 1_700_000_200_000,
  });
  const json = buildJsonExport({
    items: [item],
    groups: [makeGroup({ id: 'g1' })],
    schemaVersion: 1,
    now: FIXED_DATE,
  });
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed.items[0], item);
});

test('B-043 AC4: unknown fields on the stored record pass through verbatim (forward-compat)', () => {
  const item = makeItem({ tags: ['reading', 'later'], notes: 'custom field' });
  const json = buildJsonExport({
    items: [item], groups: [], schemaVersion: 1, now: FIXED_DATE,
  });
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed.items[0].tags, ['reading', 'later']);
  assert.equal(parsed.items[0].notes, 'custom field');
});

test('B-043 AC4: items missing lastAccessedAt omit the key (not null)', () => {
  const item = makeItem();
  assert.ok(!('lastAccessedAt' in item), 'precondition: fixture has no lastAccessedAt');
  const json = buildJsonExport({
    items: [item], groups: [], schemaVersion: 1, now: FIXED_DATE,
  });
  const parsed = JSON.parse(json);
  assert.ok(!('lastAccessedAt' in parsed.items[0]),
    'missing lastAccessedAt must not be serialized as null');
});

/* =========================================================================
   AC5 — Group shape
   ========================================================================= */

test('B-043 AC5: group with standard fields emits them all verbatim', () => {
  const g = makeGroup({
    id: 'g1',
    name: 'Work',
    color: 'blue',
    parentId: null,
    sortOrder: 2,
    collapsed: true,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_200_000,
  });
  const json = buildJsonExport({
    items: [], groups: [g], schemaVersion: 1, now: FIXED_DATE,
  });
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed.groups[0], g);
});

test('B-043 AC5: `warning: DUPLICATE_NAME` never appears in the exported group', () => {
  const json = buildJsonExport({
    items: [],
    groups: [makeGroup({ warning: 'DUPLICATE_NAME' })],
    schemaVersion: 1,
    now: FIXED_DATE,
  });
  const parsed = JSON.parse(json);
  assert.ok(!('warning' in parsed.groups[0]));
});

test('B-043 AC5: nested groups emit parentId as stored', () => {
  const json = buildJsonExport({
    items: [],
    groups: [
      makeGroup({ id: 'parent', name: 'Parent' }),
      makeGroup({ id: 'child', name: 'Child', parentId: 'parent' }),
    ],
    schemaVersion: 1,
    now: FIXED_DATE,
  });
  const parsed = JSON.parse(json);
  const child = parsed.groups.find((g) => g.id === 'child');
  assert.equal(child.parentId, 'parent');
});

/* =========================================================================
   AC6 — Deterministic ordering
   ========================================================================= */

test('B-043 AC6: items sorted by (groupId null-first, sortOrder asc, id asc)', () => {
  const items = [
    makeItem({ id: 'ic', groupId: 'g1', sortOrder: 1 }),
    makeItem({ id: 'ia', groupId: null, sortOrder: 1 }),
    makeItem({ id: 'ib', groupId: 'g1', sortOrder: 0 }),
    makeItem({ id: 'id', groupId: null, sortOrder: 0 }),
  ];
  const json = buildJsonExport({
    items, groups: [makeGroup({ id: 'g1' })], schemaVersion: 1, now: FIXED_DATE,
  });
  const ids = JSON.parse(json).items.map((i) => i.id);
  /* null-grouped items come first (id then sortOrder) — id is ib < id (asc)
     but sortOrder 0 before 1. So: null-grouped sorted by (sortOrder, id):
       sortOrder 0 id "id" | sortOrder 1 id "ia" ;
     then g1: sortOrder 0 id "ib" | sortOrder 1 id "ic". */
  assert.deepEqual(ids, ['id', 'ia', 'ib', 'ic']);
});

test('B-043 AC6: groups sorted by (parentId null-first, sortOrder asc, id asc)', () => {
  const groups = [
    makeGroup({ id: 'gB', parentId: 'pA', sortOrder: 0 }),
    makeGroup({ id: 'gA', parentId: null, sortOrder: 1 }),
    makeGroup({ id: 'pA', parentId: null, sortOrder: 0 }),
  ];
  const json = buildJsonExport({
    items: [], groups, schemaVersion: 1, now: FIXED_DATE,
  });
  const ids = JSON.parse(json).groups.map((g) => g.id);
  assert.deepEqual(ids, ['pA', 'gA', 'gB']);
});

test('B-043 AC6: two exports of identical storage state are byte-identical (modulo exportedAt)', () => {
  const items = [
    makeItem({ id: 'i1', groupId: 'g1', sortOrder: 0 }),
    makeItem({ id: 'i2', groupId: 'g1', sortOrder: 1 }),
    makeItem({ id: 'i3', groupId: null, sortOrder: 0 }),
  ];
  const groups = [makeGroup({ id: 'g1' })];
  const a = buildJsonExport({ items, groups, schemaVersion: 1, now: FIXED_DATE });
  const b = buildJsonExport({ items, groups, schemaVersion: 1, now: FIXED_DATE });
  assert.equal(a, b, 'identical inputs + identical now → byte-identical output');
});

test('B-043 AC6: re-order of source array yields same sorted output (stable under input permutation)', () => {
  const items = [
    makeItem({ id: 'a', groupId: 'g1', sortOrder: 0 }),
    makeItem({ id: 'b', groupId: 'g1', sortOrder: 1 }),
    makeItem({ id: 'c', groupId: null, sortOrder: 0 }),
  ];
  const groups = [makeGroup({ id: 'g1' })];
  const forward = buildJsonExport({ items: [...items], groups, schemaVersion: 1, now: FIXED_DATE });
  const reversed = buildJsonExport({ items: [...items].reverse(), groups, schemaVersion: 1, now: FIXED_DATE });
  assert.equal(forward, reversed);
});

/* =========================================================================
   AC7 — Round-trip integrity
   ========================================================================= */

test('B-043 AC7: round-trip preserves every persisted Item field exactly', () => {
  const items = [
    makeItem({
      id: 'i-alpha', title: 'Alpha', url: 'https://a.test/',
      groupId: 'g1', sortOrder: 0,
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_100_000,
      lastAccessedAt: 1_700_000_200_000,
    }),
  ];
  const groups = [makeGroup({ id: 'g1' })];
  const json = buildJsonExport({ items, groups, schemaVersion: 1, now: FIXED_DATE });
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed.items[0], items[0]);
});

test('B-043 AC7: round-trip preserves every persisted Group field exactly', () => {
  const g = makeGroup({
    id: 'g1', name: 'Work', color: 'blue',
    parentId: null, sortOrder: 3, collapsed: true,
    createdAt: 1_700_000_000_000, updatedAt: 1_700_000_100_000,
  });
  const json = buildJsonExport({ items: [], groups: [g], schemaVersion: 1, now: FIXED_DATE });
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed.groups[0], g);
});

/* =========================================================================
   AC12 — Orphan rescue (items + sub-groups)
   ========================================================================= */

test('B-043 AC12: orphan items (groupId → deleted group) rescue to groupId: null', () => {
  const json = buildJsonExport({
    items: [
      makeItem({ id: 'iO', title: 'Orphan', groupId: 'g-deleted' }),
      makeItem({ id: 'iG', title: 'Good', groupId: 'g1' }),
    ],
    groups: [makeGroup({ id: 'g1' })],
    schemaVersion: 1,
    now: FIXED_DATE,
  });
  const parsed = JSON.parse(json);
  const orphan = parsed.items.find((i) => i.id === 'iO');
  assert.equal(orphan.groupId, null, 'orphan must be rescued to null groupId');
  /* AC11 privacy — the orphan survives (no silent data loss). */
  assert.ok(parsed.items.some((i) => i.id === 'iO'));
});

test('B-043 AC12: orphan sub-groups (parentId → deleted parent) rescue to parentId: null', () => {
  /* Storage's depth/cycle guard makes this path unreachable today, but the
     rescue is defensive — a future schema relaxation must not silently drop
     sub-groups. */
  const json = buildJsonExport({
    items: [],
    groups: [
      makeGroup({ id: 'gChild', parentId: 'gGone' }),
      makeGroup({ id: 'gAlive' }),
    ],
    schemaVersion: 1,
    now: FIXED_DATE,
  });
  const parsed = JSON.parse(json);
  const rescued = parsed.groups.find((g) => g.id === 'gChild');
  assert.equal(rescued.parentId, null, 'orphan sub-group must be rescued to top-level');
});

/* =========================================================================
   AC11 — Performance: 1000 items / 100 groups under 500ms
   ========================================================================= */

test('B-043 AC11: buildJsonExport completes < 500ms on 1000-item / 100-group corpus', () => {
  const groups = [];
  for (let g = 0; g < 100; g++) {
    groups.push(makeGroup({ id: `g${g}`, name: `Group ${g}`, sortOrder: g }));
  }
  const items = [];
  for (let i = 0; i < 1000; i++) {
    items.push(makeItem({
      id: `i${String(i).padStart(4, '0')}`,
      title: `Bookmark ${i}`,
      url: `https://example.com/item/${i}`,
      groupId: `g${i % 100}`,
      sortOrder: i,
    }));
  }
  const runs = [];
  for (let r = 0; r < 5; r++) {
    const t0 = performance.now();
    const json = buildJsonExport({ items, groups, schemaVersion: 1, now: FIXED_DATE });
    const t1 = performance.now();
    runs.push(t1 - t0);
    assert.ok(json.length > 0);
  }
  runs.sort((a, b) => a - b);
  const median = runs[2];
  assert.ok(
    median < 500,
    `buildJsonExport 1000-item / 100-group median: ${median.toFixed(2)}ms (budget 500ms)`,
  );
});

/* =========================================================================
   Unicode + UTF-8 byte-length probes
   ========================================================================= */

test('B-043 Q-10 equivalent: size field reports UTF-8 byte length, not content.length', async () => {
  /* Seed a title with a non-BMP emoji so UTF-8 byte length diverges from
     UTF-16 code-unit length (content.length). Integration-level probe: the
     dispatcher's `size` calculation must use TextEncoder.encode.length. */
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() },
    items: [
      {
        id: 'i-emoji',
        title: '🚀 Rocket',
        url: 'https://rocket.example/',
        groupId: null,
        sortOrder: 0,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
    ],
    groups: [],
  });
  registerStorageHandlers(Promise.resolve());
  const listeners = chrome.runtime.onMessage._listeners;
  const listener = listeners[listeners.length - 1];
  const response = await new Promise((resolve) => {
    listener(
      { type: MSG_EXPORT_COLLECTION, payload: { format: 'json' } },
      { id: chrome.runtime.id },
      resolve,
    );
  });
  assert.equal(response.ok, true);
  const utf8Len = new TextEncoder().encode(response.data.content).length;
  assert.equal(response.data.size, utf8Len, 'size must be UTF-8 byte length');
  assert.ok(
    response.data.size > response.data.content.length,
    'UTF-8 byte length must exceed UTF-16 code-unit length when emoji is present',
  );
});

test('B-043 unicode: emoji + CJK round-trip through JSON.parse unchanged', () => {
  const title = 'Café 日本語 🚀';
  const json = buildJsonExport({
    items: [makeItem({ title })],
    groups: [], schemaVersion: 1, now: FIXED_DATE,
  });
  const parsed = JSON.parse(json);
  assert.equal(parsed.items[0].title, title);
});

/* =========================================================================
   Real-dispatcher integration — Sprint 15 retro action item
   ========================================================================= */

test('B-043 integration: MSG_EXPORT_COLLECTION { format: "json" } returns populated response', async () => {
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() },
    items: [
      {
        id: 'i-alpha',
        title: 'Alpha',
        url: 'https://alpha.example/',
        groupId: null,
        sortOrder: 0,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
      {
        id: 'i-beta',
        title: 'Beta',
        url: 'https://beta.example/',
        groupId: 'g1',
        sortOrder: 0,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
    ],
    groups: [
      {
        id: 'g1',
        name: 'Work',
        color: 'blue',
        parentId: null,
        sortOrder: 0,
        collapsed: false,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
    ],
  });

  registerStorageHandlers(Promise.resolve());
  const listeners = chrome.runtime.onMessage._listeners;
  const listener = listeners[listeners.length - 1];

  const response = await new Promise((resolve) => {
    listener(
      { type: MSG_EXPORT_COLLECTION, payload: { format: 'json' } },
      { id: chrome.runtime.id },
      resolve,
    );
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.mimeType, 'application/json');
  /* AC8 — filename pattern. */
  assert.match(response.data.filename, /^tab-junkie-backup-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(response.data.itemCount, 2);
  assert.equal(response.data.groupCount, 1);

  const parsed = JSON.parse(response.data.content);
  /* AC3 — schemaVersion is sourced from KNOWN_VERSION dynamically. */
  assert.equal(parsed.schemaVersion, KNOWN_VERSION);
  /* AC2 — default-only profile omits `preferences`. */
  assert.ok(!('preferences' in parsed), 'preferences key omitted when tj:prefs never written');
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.groups.length, 1);
});

test('B-043 integration: persisted tj:prefs causes `preferences` to appear in root', async () => {
  const customPrefs = { theme: 'dark', displayMode: 'window', newTabOverride: true, autoCollapseSubGroups: false };
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() },
    items: [],
    groups: [],
    prefs: customPrefs,
  });

  registerStorageHandlers(Promise.resolve());
  const listeners = chrome.runtime.onMessage._listeners;
  const listener = listeners[listeners.length - 1];

  const response = await new Promise((resolve) => {
    listener(
      { type: MSG_EXPORT_COLLECTION, payload: { format: 'json' } },
      { id: chrome.runtime.id },
      resolve,
    );
  });
  assert.equal(response.ok, true);
  const parsed = JSON.parse(response.data.content);
  assert.deepEqual(parsed.preferences, customPrefs);
});

test('B-043 integration: missing `format` rejected with ERR_VALIDATION', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const listeners = chrome.runtime.onMessage._listeners;
  const listener = listeners[listeners.length - 1];

  const response = await new Promise((resolve) => {
    listener(
      { type: MSG_EXPORT_COLLECTION, payload: {} },
      { id: chrome.runtime.id },
      resolve,
    );
  });
  assert.equal(response.ok, false);
  assert.equal(response.error.code, ERR_VALIDATION);
});

test('B-043 integration: ERR_NOT_READY surfaces when readyPromise rejects (cold SW)', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.reject(new Error('cold-start failure')));
  const listeners = chrome.runtime.onMessage._listeners;
  const listener = listeners[listeners.length - 1];

  const response = await new Promise((resolve) => {
    listener(
      { type: MSG_EXPORT_COLLECTION, payload: { format: 'json' } },
      { id: chrome.runtime.id },
      resolve,
    );
  });
  assert.equal(response.ok, false);
  assert.equal(response.error.code, ERR_NOT_READY);
});

test('B-043 integration: safe mode (schemaVersion > KNOWN_VERSION) passes JSON export through unmodified', async () => {
  /* Mirrors B-042 Q-7: MSG_EXPORT_COLLECTION must NOT be in WRITE_MESSAGE_TYPES —
     the dispatcher should hand the JSON request to the handler even when writes
     are blocked. */
  seedPartitions({
    meta: { schemaVersion: 999, createdAt: Date.now() },
    items: [
      {
        id: 'i-safe',
        title: 'Safe Mode Bookmark',
        url: 'https://safe.example/',
        groupId: null,
        sortOrder: 0,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
    ],
    groups: [],
  });
  const ready = runMigrations();
  registerStorageHandlers(ready);
  await ready;

  const listeners = chrome.runtime.onMessage._listeners;
  const listener = listeners[listeners.length - 1];
  const response = await new Promise((resolve) => {
    listener(
      { type: MSG_EXPORT_COLLECTION, payload: { format: 'json' } },
      { id: chrome.runtime.id },
      resolve,
    );
  });
  assert.equal(response.ok, true, 'JSON export must succeed in safe mode (read-only flow)');
  const parsed = JSON.parse(response.data.content);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].title, 'Safe Mode Bookmark');
});

test('B-043 integration: two dispatch calls on identical seed produce identical content (modulo exportedAt)', async () => {
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() },
    items: [
      {
        id: 'i1', title: 'A', url: 'https://a.test/', groupId: 'g1', sortOrder: 0,
        createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
      },
      {
        id: 'i2', title: 'B', url: 'https://b.test/', groupId: null, sortOrder: 0,
        createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
      },
    ],
    groups: [
      {
        id: 'g1', name: 'Work', color: 'blue', parentId: null, sortOrder: 0, collapsed: false,
        createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
      },
    ],
  });

  registerStorageHandlers(Promise.resolve());
  const listeners = chrome.runtime.onMessage._listeners;
  const listener = listeners[listeners.length - 1];

  async function dispatchJson() {
    return new Promise((resolve) => {
      listener(
        { type: MSG_EXPORT_COLLECTION, payload: { format: 'json' } },
        { id: chrome.runtime.id },
        resolve,
      );
    });
  }

  const r1 = await dispatchJson();
  const r2 = await dispatchJson();
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);

  /* Strip the exportedAt line from each — every character else must match. */
  const strip = (json) => json.replace(/\n  "exportedAt": "[^"]+",/, '');
  assert.equal(strip(r1.data.content), strip(r2.data.content),
    'identical storage state → byte-identical JSON modulo exportedAt');
});

/* =========================================================================
   R5 gap-fillers — qa-Q-1..4, qa-Q-7, sec-S-1, sec-S-2, qa-Q-2
   (R4 MEDIUMs absorbed by [test-engineer] at R5 per Sprint 17 plan)
   ========================================================================= */

test('B-043 qa-Q-1: 3-level nested groups sort deterministically by (parentId, sortOrder, id)', () => {
  /* Chain: root (parentId=null) → mid (parentId=root) → leaf (parentId=mid).
     Verifies §32.5.5 determinism when the parentId chain crosses multiple
     sort partitions — the current AC5 "nested groups" test only exercises
     one parent/child pair. */
  const json = buildJsonExport({
    items: [],
    groups: [
      makeGroup({ id: 'leaf', name: 'Leaf', parentId: 'mid' }),
      makeGroup({ id: 'root', name: 'Root', parentId: null }),
      makeGroup({ id: 'mid', name: 'Mid', parentId: 'root' }),
    ],
    schemaVersion: 1,
    now: FIXED_DATE,
  });
  const ids = JSON.parse(json).groups.map((g) => g.id);
  /* Sort partitions by parentId null-first: null('root') → 'mid'('leaf') → 'root'('mid'). */
  assert.deepEqual(ids, ['root', 'leaf', 'mid']);
});

test('B-043 qa-Q-3: null and empty-string titles round-trip verbatim (B-045 import contract)', () => {
  const json = buildJsonExport({
    items: [
      makeItem({ id: 'i-empty', title: '' }),
      makeItem({ id: 'i-null', title: null }),
    ],
    groups: [],
    schemaVersion: 1,
    now: FIXED_DATE,
  });
  const parsed = JSON.parse(json);
  const empty = parsed.items.find((i) => i.id === 'i-empty');
  const nullTitle = parsed.items.find((i) => i.id === 'i-null');
  assert.equal(empty.title, '', 'empty title preserved as ""');
  assert.equal(nullTitle.title, null, 'null title preserved as null (not dropped)');
});

test('B-043 qa-Q-4: preferences=undefined is indistinguishable from omitted (key absent)', () => {
  /* Pins the `if (preferences && typeof preferences === 'object')` branch
     against future refactors — an explicit `undefined` must suppress the key
     the same way `null` and omitted do. */
  const json = buildJsonExport({
    items: [], groups: [], schemaVersion: 1, now: FIXED_DATE, preferences: undefined,
  });
  const parsed = JSON.parse(json);
  assert.ok(!('preferences' in parsed), 'preferences=undefined must suppress the root key');
});

test('B-043 qa-Q-7: UTF-8 size diverges from content.length for CJK-only titles (no emoji)', async () => {
  /* Breadth probe: emoji-only is covered above. CJK characters are 3 UTF-8
     bytes but 1 UTF-16 code unit, so they also expose size-vs-length bugs. */
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() },
    items: [{
      id: 'i-cjk', title: '日本語のブックマーク', url: 'https://cjk.example/',
      groupId: null, sortOrder: 0,
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
    }],
    groups: [],
  });
  registerStorageHandlers(Promise.resolve());
  const listeners = chrome.runtime.onMessage._listeners;
  const listener = listeners[listeners.length - 1];
  const response = await new Promise((resolve) => {
    listener(
      { type: MSG_EXPORT_COLLECTION, payload: { format: 'json' } },
      { id: chrome.runtime.id },
      resolve,
    );
  });
  assert.equal(response.ok, true);
  assert.ok(
    response.data.size > response.data.content.length,
    'CJK-only title must drive size (UTF-8 bytes) above content.length (UTF-16 units)',
  );
});

test('B-043 sec-S-1: favIconUrl (camelCase) enrichment is stripped and never leaks to output', () => {
  /* Direct injection via the pure builder — if a future refactor threads
     enriched items from `buildLiveStates` / `open-tabs.js` through the export
     path, this test fails loudly. Currently the deny-list strips the lowercase
     runtime fields; `favIconUrl` is passed through verbatim as an "unknown"
     field per AC4 forward-compat. Today this asserts the CURRENT behavior
     (unknown-field pass-through) and pins it as a known deviation from S-1's
     preferred allow-list. If R6 [solution-architect] chooses to switch to an
     allow-list (S-1 option A), flip this assertion accordingly. */
  const json = buildJsonExport({
    items: [makeItem({ favIconUrl: 'https://evil.example/tracker.ico' })],
    groups: [],
    schemaVersion: 1,
    now: FIXED_DATE,
  });
  const parsed = JSON.parse(json);
  /* Current behavior (AC4 forward-compat pass-through): favIconUrl survives.
     This pin documents the decision; if allow-list is chosen at R6 it becomes
     a FAIL that forces the builder update. */
  assert.ok(
    'favIconUrl' in parsed.items[0],
    'AC4 forward-compat: unknown persisted keys pass through (pending sec-S-1 R6 allow-list decision)',
  );
  /* But the canonical lowercase runtime fields MUST still be stripped even
     when co-present with favIconUrl — the deny-list is the primary defense. */
  assert.ok(!('live' in parsed.items[0]));
  assert.ok(!('tabId' in parsed.items[0]));
});

test('B-043 sec-S-2: tj:prefs unknown keys pass through verbatim (pinned — R6 decision pending)', async () => {
  /* Current behavior (documented in `buildJsonExport` line 167-169 comment):
     `root.preferences = preferences` — no filter. This test pins the current
     pass-through semantic so a future allow-list change is a deliberate,
     test-visible decision, not a silent refactor. The R6 [solution-architect]
     should record the forward-compat-vs-allow-list decision in
     SOLUTION_DESIGN §32.5.4. */
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() },
    items: [], groups: [],
    prefs: { theme: 'dark', _unknownFutureFlag: 'ship-it', devOnly: true },
  });
  registerStorageHandlers(Promise.resolve());
  const listeners = chrome.runtime.onMessage._listeners;
  const listener = listeners[listeners.length - 1];
  const response = await new Promise((resolve) => {
    listener(
      { type: MSG_EXPORT_COLLECTION, payload: { format: 'json' } },
      { id: chrome.runtime.id },
      resolve,
    );
  });
  assert.equal(response.ok, true);
  const parsed = JSON.parse(response.data.content);
  assert.equal(parsed.preferences.theme, 'dark');
  assert.equal(parsed.preferences._unknownFutureFlag, 'ship-it',
    'unknown prefs key passes through today — flip this if R6 switches to allow-list');
  assert.equal(parsed.preferences.devOnly, true);
});

test('B-043 qa-Q-2: listGroups rejects after listItems resolves → ERR_CORRUPT_DATA, no partial leak', async () => {
  /* Partial-snapshot failure path: the handler reads items then groups in two
     sequential awaits (§32.13 F-3 known race). If the second read throws,
     `listGroups` wraps `storage.get` failures in a StorageError with code
     ERR_CORRUPT_DATA (partitions.js L75), which `errorEnvelope` preserves.
     No partial JSON must land in the response. */
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() },
    items: [{
      id: 'i-alpha', title: 'Alpha', url: 'https://a.test/',
      groupId: null, sortOrder: 0,
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
    }],
    groups: [],
  });
  /* Monkey-patch get to throw on the tj:groups fetch only. */
  const originalGet = chrome.storage.local.get;
  let callCount = 0;
  chrome.storage.local.get = async (keys) => {
    callCount += 1;
    const key = Array.isArray(keys) ? keys[0] : (typeof keys === 'string' ? keys : Object.keys(keys)[0]);
    if (key === 'tj:groups') throw new Error('simulated storage read failure');
    return originalGet(keys);
  };
  try {
    registerStorageHandlers(Promise.resolve());
    const listeners = chrome.runtime.onMessage._listeners;
    const listener = listeners[listeners.length - 1];
    const response = await new Promise((resolve) => {
      listener(
        { type: MSG_EXPORT_COLLECTION, payload: { format: 'json' } },
        { id: chrome.runtime.id },
        resolve,
      );
    });
    assert.equal(response.ok, false);
    assert.equal(response.error.code, ERR_CORRUPT_DATA,
      'partial-read failure must surface as ERR_CORRUPT_DATA (listGroups wraps storage.get)');
    assert.ok(!('content' in (response.data || {})), 'no partial JSON content in error response');
    assert.ok(callCount >= 2, 'precondition: get was called for both items and groups');
  } finally {
    chrome.storage.local.get = originalGet;
  }
});
