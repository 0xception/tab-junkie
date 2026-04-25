/**
 * b045-e2e-import.test.js — end-to-end integration tests for the
 * MSG_IMPORT_COLLECTION `format: 'json'` preview → commit round-trip
 * (B-045, R3).
 *
 * AC coverage:
 *   AC4  → preview counts + Replace dialog counts derive from the same response
 *   AC7  → duplicate-ID repair surfaces in the response envelope
 *   AC9  → allow-list strip — unknown fields never land in tj:items / tj:groups
 *   AC10 → valid preferences land atomically with items/groups
 *   AC11 → preview leaves storage untouched; commit replaces atomically
 *   AC13 → 1000 items / 100 groups end-to-end under 2 seconds (perf probe)
 *   AC14 → zero network calls (no fetch in the dispatch path)
 *   AC16 → response envelope surfaces repair counts for the post-commit toast
 *
 * Dispatches through `chrome.runtime.onMessage._listeners` — no shim.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetMock,
  seedPartitions,
  __getRawStore,
} from './chrome-mock.js';

import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import { MSG_IMPORT_COLLECTION } from '../shared/messages.js';
import {
  KNOWN_VERSION,
  _resetMigrationStateForTest,
  _clearMigrationStepsForTest,
} from '../background/storage/migration.js';
import { buildJsonExport } from '../background/export/json-export.js';

beforeEach(() => {
  __resetMock();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
});

function getListener() {
  const listeners = chrome.runtime.onMessage._listeners;
  return listeners[listeners.length - 1];
}

async function dispatch(listener, payload) {
  return await new Promise((resolve) => {
    listener(
      { type: MSG_IMPORT_COLLECTION, payload },
      { id: chrome.runtime.id },
      resolve,
    );
  });
}

function backup(items, groups, preferences) {
  const body = {
    schemaVersion: KNOWN_VERSION,
    exportedAt: '2026-04-19T00:00:00.000Z',
    items,
    groups,
  };
  if (preferences !== undefined) body.preferences = preferences;
  return JSON.stringify(body);
}

function mkItem(over = {}) {
  return {
    id: 'i-1',
    title: 'T',
    url: 'https://example.com/',
    groupId: null,
    sortOrder: 0,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...over,
  };
}

function mkGroup(over = {}) {
  return {
    id: 'g-1',
    name: 'G',
    color: 'blue',
    parentId: null,
    sortOrder: 0,
    collapsed: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...over,
  };
}

/* =========================================================================
 * Happy-path round-trip
 * ========================================================================= */

test('B-045 e2e: preview → commit sequence replaces items+groups atomically', async () => {
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() },
    items: [{
      id: 'i-old', title: 'Old', url: 'https://old.example/',
      groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1,
    }],
    groups: [],
  });
  registerStorageHandlers(Promise.resolve());
  const content = backup(
    [
      mkItem({ id: 'a', url: 'https://a.example/' }),
      mkItem({ id: 'b', url: 'https://b.example/' }),
    ],
    [mkGroup({ id: 'only', name: 'Work' })],
  );

  const preview = await dispatch(getListener(), { format: 'json', content });
  assert.equal(preview.ok, true);
  assert.equal(preview.data.previewOnly, true);
  assert.equal(preview.data.itemsImported, 2);
  assert.equal(preview.data.groupsImported, 1);
  const preItems = __getRawStore('tj:items');
  assert.equal(preItems.length, 1, 'preview did not mutate items');
  assert.equal(preItems[0].id, 'i-old');

  const commit = await dispatch(getListener(), { format: 'json', content, commit: true });
  assert.equal(commit.ok, true);
  assert.equal(commit.data.previewOnly, false);
  assert.equal(commit.data.itemsImported, 2);
  assert.equal(commit.data.groupsImported, 1);

  const items = __getRawStore('tj:items');
  const groups = __getRawStore('tj:groups');
  assert.equal(items.length, 2);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, 'Work');
  assert.equal(items.some((it) => it.id === 'i-old'), false);
});

/* =========================================================================
 * AC9 — allow-list strip end-to-end
 * ========================================================================= */

test('B-045 AC9 e2e: unknown fields on item+group never land in storage', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const dirtyItem = {
    ...mkItem({ id: 'x', url: 'https://x.example/' }),
    favIconUrl: 'https://evil.example/favicon.ico',
    live: true,
    tabId: 42,
    windowId: 7,
    customField: 'payload',
  };
  const dirtyGroup = {
    ...mkGroup({ id: 'y', name: 'Y' }),
    warning: 'DUPLICATE_NAME',
    internalFlag: 'suspicious',
  };
  const content = backup([dirtyItem], [dirtyGroup]);
  await dispatch(getListener(), { format: 'json', content, commit: true });
  const items = __getRawStore('tj:items');
  const groups = __getRawStore('tj:groups');
  assert.equal(items.length, 1);
  assert.equal('favIconUrl' in items[0], false);
  assert.equal('live' in items[0], false);
  assert.equal('tabId' in items[0], false);
  assert.equal('customField' in items[0], false);
  assert.equal(groups.length, 1);
  assert.equal('warning' in groups[0], false);
  assert.equal('internalFlag' in groups[0], false);
});

/* =========================================================================
 * AC10 — preferences applied atomically when valid
 * ========================================================================= */

test('B-045 AC10 e2e: valid preferences apply during commit', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const prefs = {
    theme: 'dark',
    displayMode: 'sidepanel',
    newTabOverride: true,
    autoCollapseSubGroups: false,
  };
  const content = backup(
    [mkItem({ id: 'a', url: 'https://a.example/' })],
    [],
    prefs,
  );
  const commit = await dispatch(getListener(), { format: 'json', content, commit: true });
  assert.equal(commit.ok, true);
  const storedPrefs = __getRawStore('tj:prefs');
  assert.equal(storedPrefs.theme, 'dark');
  /* B-088 fix #2 — `newTabOverride` ghost-key is stripped on import. */
  assert.equal('newTabOverride' in storedPrefs, false,
    'legacy newTabOverride must not land in storage on commit');
});

test('B-045 AC10 e2e: invalid preferences do NOT clobber storage', async () => {
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() },
    prefs: { theme: 'light', displayMode: 'sidepanel',
             newTabOverride: false, autoCollapseSubGroups: false },
  });
  registerStorageHandlers(Promise.resolve());
  const badPrefs = { theme: 'neon-pink' };
  const content = backup(
    [mkItem({ id: 'a', url: 'https://a.example/' })],
    [],
    badPrefs,
  );
  const commit = await dispatch(getListener(), { format: 'json', content, commit: true });
  assert.equal(commit.ok, true);
  assert.equal(commit.data.repairs.preferencesSkipped, true);
  const storedPrefs = __getRawStore('tj:prefs');
  assert.equal(storedPrefs.theme, 'light', 'prefs untouched on invalid shape');
});

/* =========================================================================
 * AC16 — repair counts surface in commit envelope
 * ========================================================================= */

test('B-045 AC16 e2e: repair counts on commit envelope match preview', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const content = backup(
    [
      mkItem({ id: 'i1', url: 'https://same.example/' }),
      mkItem({ id: 'i1', url: 'https://same.example/' }), /* dup url + dup id */
    ],
    [mkGroup({ id: 'a', parentId: 'gone' })], /* orphan */
  );
  const preview = await dispatch(getListener(), { format: 'json', content });
  const commit = await dispatch(getListener(), { format: 'json', content, commit: true });
  /* Repairs on the commit envelope match preview — both are surfaced. */
  assert.ok(commit.data.repairs);
  assert.equal(commit.data.repairs.orphanedGroups, preview.data.repairs.orphanedGroups);
  assert.equal(commit.data.repairs.duplicateIds, preview.data.repairs.duplicateIds);
  assert.equal(commit.data.repairs.duplicateUrls, preview.data.repairs.duplicateUrls);
});

/* =========================================================================
 * B-060 Wave 2 — "Import duplicates anyway" toggle (JSON path)
 *
 * `parseAndValidate` honours `options.skipDuplicates`. Default `true`
 * preserves the B-045 v1 contract (repeat URLs dropped during the dedup
 * pass). When the preview dialog checkbox is ticked the sidepanel forwards
 * `skipDuplicates: false` and the validator keeps every record, while
 * `duplicatesSkipped` still reports the count for the post-import toast.
 * ========================================================================= */

test('B-060 JSON: default skipDuplicates=true drops in-file URL duplicates (legacy)', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const content = backup(
    [
      mkItem({ id: 'i1', url: 'https://same.example/' }),
      mkItem({ id: 'i2', url: 'https://same.example/' }),
      mkItem({ id: 'i3', url: 'https://other.example/' }),
    ],
    [],
  );
  /* No `options` → default-skip path. */
  const commit = await dispatch(getListener(), { format: 'json', content, commit: true });
  assert.equal(commit.ok, true);
  assert.equal(commit.data.itemsImported, 2);
  assert.equal(commit.data.duplicatesSkipped, 1);
  const items = __getRawStore('tj:items');
  assert.equal(items.length, 2);
});

test('B-060 JSON: skipDuplicates=false retains duplicates but reports the count', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const content = backup(
    [
      mkItem({ id: 'i1', url: 'https://same.example/' }),
      mkItem({ id: 'i2', url: 'https://same.example/' }),
      mkItem({ id: 'i3', url: 'https://other.example/' }),
    ],
    [],
  );
  const commit = await dispatch(getListener(), {
    format: 'json',
    content,
    commit: true,
    options: { skipDuplicates: false },
  });
  assert.equal(commit.ok, true);
  assert.equal(commit.data.itemsImported, 3);
  assert.equal(commit.data.duplicatesSkipped, 1);
  /* Every ULID is re-minted during commit so verify by URL. */
  const items = __getRawStore('tj:items');
  assert.equal(items.length, 3);
  const urls = items.map((it) => it.url).sort();
  assert.deepEqual(urls, [
    'https://other.example/',
    'https://same.example/',
    'https://same.example/',
  ]);
  /* ULIDs must still be unique post-mint (§33.8 assertion). */
  const ids = new Set(items.map((it) => it.id));
  assert.equal(ids.size, items.length);
});

/* =========================================================================
 * AC13 — performance ceiling (1000 items / 100 groups under 2s)
 * ========================================================================= */

test('B-045 AC13 perf: 1000 items / 100 groups preview + commit under 2000ms', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const groups = [];
  const items = [];
  for (let g = 0; g < 100; g += 1) {
    groups.push(mkGroup({
      id: `g-${g}`, name: `G${g}`,
    }));
  }
  for (let i = 0; i < 1000; i += 1) {
    items.push(mkItem({
      id: `i-${i}`,
      url: `https://site-${i}.example/`,
      groupId: `g-${i % 100}`,
    }));
  }
  const content = backup(items, groups);
  const t0 = performance.now();
  const preview = await dispatch(getListener(), { format: 'json', content });
  assert.equal(preview.ok, true);
  assert.equal(preview.data.itemsImported, 1000);
  assert.equal(preview.data.groupsImported, 100);
  const commit = await dispatch(getListener(), { format: 'json', content, commit: true });
  assert.equal(commit.ok, true);
  const elapsed = performance.now() - t0;
  /* AC13 budget: < 1000ms replace-and-import end-to-end. Leave margin — the
     chrome-mock integration is typically faster than production, but we pin
     the parse + validate + repair + commit cost on realistic data. Retained
     2000ms ceiling consistent with the §33.12 end-to-end table. */
  assert.ok(elapsed < 2000,
    'end-to-end elapsed ' + elapsed.toFixed(1) + 'ms must be < 2000ms');
  const storedItems = __getRawStore('tj:items');
  assert.equal(storedItems.length, 1000);
});

/* =========================================================================
 * Round-trip — B-043 export → B-045 import preserves content (not IDs)
 * ========================================================================= */

test('B-045 roundtrip: B-043 export → B-045 import preserves titles/urls/groups (IDs re-mint)', async () => {
  /* Seed and export via buildJsonExport directly (not through the export
     message). We want byte-identical JSON produced by the export builder so
     the import consumes the exact shape B-043 emits. */
  const originalItems = [
    { id: 'g1-item1', title: 'Alpha', url: 'https://alpha.example/',
      groupId: 'grp-1', sortOrder: 0,
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000 },
    { id: 'g1-item2', title: 'Beta', url: 'https://beta.example/',
      groupId: 'grp-1', sortOrder: 1,
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000 },
  ];
  const originalGroups = [
    { id: 'grp-1', name: 'Work', color: 'blue', parentId: null,
      sortOrder: 0, collapsed: false,
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000 },
  ];
  const exported = buildJsonExport({
    items: originalItems,
    groups: originalGroups,
    schemaVersion: KNOWN_VERSION,
    now: new Date('2026-04-19T00:00:00.000Z'),
  });
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const commit = await dispatch(getListener(), {
    format: 'json', content: exported, commit: true,
  });
  assert.equal(commit.ok, true);
  const items = __getRawStore('tj:items');
  const groups = __getRawStore('tj:groups');
  assert.equal(items.length, 2);
  assert.equal(groups.length, 1);
  /* Titles + URLs survive intact. */
  const titles = items.map((it) => it.title).sort();
  assert.deepEqual(titles, ['Alpha', 'Beta']);
  /* IDs are re-minted — must NOT match original file IDs. */
  assert.ok(!items.some((it) => it.id === 'g1-item1'));
  assert.ok(!items.some((it) => it.id === 'g1-item2'));
  assert.ok(!groups.some((g) => g.id === 'grp-1'));
  /* Cross-reference survives the re-mint: both items point at the one group. */
  assert.ok(items.every((it) => it.groupId === groups[0].id));
});

/* =========================================================================
 * B-070 AC1 — preferences-only backup commits atomically
 *
 * A backup with `items: []` + `groups: []` + populated `preferences` (any
 * non-default key) MUST commit successfully (Sprint 19 polish, resolves
 * §33.20 MEDIUM). Pre-B-070 this hit the sidepanel zero-bookmark guard and
 * aborted before the confirm dialog opened.
 *
 * B-070 R4 F-1: post-fix, the sidepanel routes this case through a dedicated
 * prefs-only confirmation dialog (CLAUDE.md "Confirmation dialogs for
 * destructive actions" — commit.js still atomically REPLACES items+groups
 * with empty arrays, so the user must explicitly confirm). The UI dialog is
 * covered by UAT + the "cancel preserves data" test below; this test pins
 * the validator + commit half of the flow (once the user confirms).
 * ========================================================================= */

test('B-070 AC1 e2e: prefs-only backup commits; prefs applied atomically', async () => {
  /* Seed storage with a pre-existing prefs block at the default theme so we
     can verify the commit applies the new theme from the backup. The
     replace-all semantics of commit.js (§33.7) mean items+groups become
     empty post-commit — that matches the "Imported 0 items, 0 groups.
     Preferences applied." success toast copy per AC1. */
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() },
    prefs: {
      theme: 'light',
      displayMode: 'sidepanel',
      newTabOverride: false,
      autoCollapseSubGroups: false,
    },
  });
  registerStorageHandlers(Promise.resolve());
  const prefs = {
    theme: 'dark',
    displayMode: 'sidepanel',
    newTabOverride: true,
    autoCollapseSubGroups: true,
  };
  const content = backup([], [], prefs);

  /* Preview returns zero counts — matches the sidepanel signal that would
     trigger the B-070 AC1 short-circuit. */
  const preview = await dispatch(getListener(), { format: 'json', content });
  assert.equal(preview.ok, true);
  assert.equal(preview.data.itemsImported, 0);
  assert.equal(preview.data.groupsImported, 0);
  assert.equal(preview.data.repairs.preferencesSkipped, false,
    'valid prefs must not be flagged as skipped');

  /* Commit succeeds — prefs apply atomically. */
  const commit = await dispatch(getListener(), { format: 'json', content, commit: true });
  assert.equal(commit.ok, true);
  assert.equal(commit.data.itemsImported, 0);
  assert.equal(commit.data.groupsImported, 0);
  assert.equal(commit.data.repairs.preferencesSkipped, false);

  const storedPrefs = __getRawStore('tj:prefs');
  assert.equal(storedPrefs.theme, 'dark', 'new theme applied from backup');
  /* B-088 fix #2 — `newTabOverride` ghost-key is stripped on import. */
  assert.equal('newTabOverride' in storedPrefs, false,
    'legacy newTabOverride must not land in storage on commit');
  assert.equal(storedPrefs.autoCollapseSubGroups, true, 'autoCollapseSubGroups applied');
});

/* =========================================================================
 * B-070 R4 F-1 — prefs-only Cancel path preserves existing data
 *
 * The R4 [code-reviewer] caught a HIGH finding: before the F-1 fix, a
 * prefs-only backup skipped the confirmation dialog and directly dispatched
 * commit, silently wiping the user's existing bookmarks+groups via the
 * atomic `writeTransaction` replace in commit.js (§33.7). Post-fix, the
 * sidepanel opens a dedicated confirmation dialog; Cancel must NOT dispatch
 * commit and existing items/groups/prefs must remain intact.
 *
 * This test pins the invariant by seeding real data and dispatching ONLY
 * the preview (no `commit: true`) — that matches the sidepanel state when
 * the user clicks Cancel. The preview round-trip must not mutate storage.
 * ========================================================================= */

test('B-070 R4 F-1: prefs-only preview without commit preserves existing data', async () => {
  /* Seed bookmarks + groups + a prefs block the user would not want wiped. */
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() },
    items: [{
      id: 'keep-1', title: 'Keeper', url: 'https://keep.example/',
      groupId: 'keep-g', sortOrder: 0, createdAt: 1, updatedAt: 1,
    }],
    groups: [{
      id: 'keep-g', name: 'Keepers', color: 'blue', parentId: null,
      sortOrder: 0, collapsed: false, createdAt: 1, updatedAt: 1,
    }],
    prefs: {
      theme: 'light',
      displayMode: 'sidepanel',
      newTabOverride: false,
      autoCollapseSubGroups: false,
    },
  });
  registerStorageHandlers(Promise.resolve());

  /* Prefs-only backup that WOULD wipe items+groups if committed. */
  const content = backup([], [], {
    theme: 'dark',
    displayMode: 'sidepanel',
    newTabOverride: true,
    autoCollapseSubGroups: true,
  });

  /* Preview only — no commit. This matches the sidepanel state at the
     instant the prefs-only confirm dialog is open and the user has NOT yet
     clicked "Replace and apply preferences". */
  const preview = await dispatch(getListener(), { format: 'json', content });
  assert.equal(preview.ok, true);
  assert.equal(preview.data.previewOnly, true);
  assert.equal(preview.data.itemsImported, 0);
  assert.equal(preview.data.groupsImported, 0);

  /* Storage invariants — preview must not mutate any partition. */
  const items = __getRawStore('tj:items');
  const groups = __getRawStore('tj:groups');
  const prefs = __getRawStore('tj:prefs');
  assert.equal(items.length, 1, 'items untouched on cancel');
  assert.equal(items[0].id, 'keep-1');
  assert.equal(groups.length, 1, 'groups untouched on cancel');
  assert.equal(groups[0].id, 'keep-g');
  assert.equal(prefs.theme, 'light', 'prefs untouched on cancel');
  assert.equal(prefs.newTabOverride, false);
  assert.equal(prefs.autoCollapseSubGroups, false);
});

/* =========================================================================
 * B-070 AC2 — `validateAndRepair` alias removed from production code
 *
 * The 1-line back-compat export in `background/import/json-validator.js` was
 * slated for removal once callers converged on `parseAndValidate`. This
 * grep-based regression guard confirms no production code path re-adds the
 * alias. Comments and docs MAY still mention the name (historical context).
 * ========================================================================= */

test('B-070 AC2: validateAndRepair export removed from production code', async () => {
  const fs = await import('node:fs');
  const url = new URL('../background/import/json-validator.js', import.meta.url);
  const src = fs.readFileSync(url, 'utf8');
  /* The alias form (exactly one of these) must NOT appear: */
  assert.ok(!/export\s+function\s+validateAndRepair\b/.test(src),
    'named export function alias must be absent');
  assert.ok(!/export\s+const\s+validateAndRepair\b/.test(src),
    'const alias export must be absent');
  assert.ok(!/export\s*\{[^}]*\bvalidateAndRepair\b[^}]*\}/.test(src),
    're-export alias must be absent');
});
