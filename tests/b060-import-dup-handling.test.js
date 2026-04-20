/**
 * b060-import-dup-handling.test.js — "Import duplicates anyway" toggle
 * end-to-end (B-060 Wave 2, R3).
 *
 * AC coverage:
 *   - Default-skip behavior preserved when `options.skipDuplicates` is absent.
 *   - `options.skipDuplicates=false` retains in-file URL duplicates.
 *   - `options.skipDuplicates` non-boolean surfaces ERR_VALIDATION.
 *   - MSG_SET_PREFERENCES accepts `importSkipDuplicates` and persists it.
 *   - Fresh DEFAULT_PREFERENCES reads carry the `importSkipDuplicates: true`
 *     seed so the sidepanel dialog can read its initial default even on a
 *     first-run profile.
 *   - Shape validator tolerates pre-B-060 stored prefs (missing the key) so
 *     an upgrade path does not throw ERR_CORRUPT_DATA.
 *
 * Integration uses chrome.runtime.onMessage._listeners directly per Sprint 15
 * retro — no shim dispatcher.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, seedPartitions, __getRawStore } from './chrome-mock.js';

import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import {
  MSG_IMPORT_COLLECTION,
  MSG_SET_PREFERENCES,
  MSG_GET_PREFERENCES,
} from '../shared/messages.js';
import {
  KNOWN_VERSION,
  _resetMigrationStateForTest,
  _clearMigrationStepsForTest,
} from '../background/storage/migration.js';
import { DEFAULT_PREFERENCES, assertShape } from '../background/storage/shapes.js';

beforeEach(() => {
  __resetMock();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
});

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

function wrapDoc(body) {
  return (
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n'
    + '<DL><p>\n' + body + '</DL><p>\n'
  );
}

/* =========================================================================
 * Schema: importSkipDuplicates is present on DEFAULT_PREFERENCES
 * ========================================================================= */

test('B-060 schema: DEFAULT_PREFERENCES seeds importSkipDuplicates: true', () => {
  assert.equal(DEFAULT_PREFERENCES.importSkipDuplicates, true);
});

test('B-060 schema: isPreferences tolerates stored prefs without importSkipDuplicates', () => {
  /* A profile that persisted prefs before B-060 shipped will have a stored
     shape that lacks the new key. readPartition runs assertShape on every
     read — if the validator rejected such shapes, upgrades would throw
     ERR_CORRUPT_DATA on first sidepanel open. Verify tolerance here. */
  const legacy = {
    theme: 'light',
    displayMode: 'sidepanel',
    newTabOverride: false,
    autoCollapseSubGroups: false,
  };
  /* Does not throw. */
  assertShape('prefs', legacy);
});

test('B-060 schema: isPreferences rejects bad importSkipDuplicates type', () => {
  const bad = {
    theme: 'light',
    displayMode: 'sidepanel',
    newTabOverride: false,
    autoCollapseSubGroups: false,
    importSkipDuplicates: 'yes',
  };
  assert.throws(
    () => assertShape('prefs', bad),
    /Corrupt partition/,
  );
});

/* =========================================================================
 * MSG_SET_PREFERENCES accepts the new key
 * ========================================================================= */

test('B-060 prefs: MSG_SET_PREFERENCES accepts importSkipDuplicates toggle', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  /* Simulate the sidepanel persisting the user's explicit checkbox toggle
     from the default (true) to the opt-in (false). */
  const setResp = await dispatch(MSG_SET_PREFERENCES, {
    patch: { importSkipDuplicates: false },
  });
  assert.equal(setResp.ok, true);
  assert.equal(setResp.data.importSkipDuplicates, false);

  /* Subsequent MSG_GET_PREFERENCES returns the persisted value. */
  const getResp = await dispatch(MSG_GET_PREFERENCES, {});
  assert.equal(getResp.ok, true);
  assert.equal(getResp.data.importSkipDuplicates, false);
});

test('B-060 prefs: MSG_SET_PREFERENCES rejects non-boolean importSkipDuplicates', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatch(MSG_SET_PREFERENCES, {
    patch: { importSkipDuplicates: 'nope' },
  });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_VALIDATION');
});

/* =========================================================================
 * MSG_IMPORT_COLLECTION payload validation (already existed; re-asserted to
 * anchor the contract from B-060's perspective)
 * ========================================================================= */

test('B-060 dispatch: non-boolean options.skipDuplicates → ERR_VALIDATION', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatch(MSG_IMPORT_COLLECTION, {
    format: 'html',
    content: wrapDoc('  <DT><A HREF="https://x.example">X</A>\n'),
    options: { skipDuplicates: 'yes' },
  });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_VALIDATION');
});

/* =========================================================================
 * End-to-end: options.skipDuplicates=false persists duplicates AND the
 * preference toggle lands in storage.
 * ========================================================================= */

test('B-060 e2e: preference toggle → next import reads new default', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());

  /* Step 1: flip the preference to "import duplicates anyway". */
  await dispatch(MSG_SET_PREFERENCES, {
    patch: { importSkipDuplicates: false },
  });
  const storedPrefs = __getRawStore('tj:prefs');
  assert.equal(storedPrefs.importSkipDuplicates, false);

  /* Step 2: subsequent import dispatched with the SAME option carries the
     flag through; duplicates remain in storage. */
  const content = wrapDoc(
    '  <DT><A HREF="https://dup.example">A</A>\n'
    + '  <DT><A HREF="https://dup.example">B</A>\n',
  );
  const commit = await dispatch(MSG_IMPORT_COLLECTION, {
    format: 'html',
    content,
    commit: true,
    options: { skipDuplicates: false },
  });
  assert.equal(commit.ok, true);
  assert.equal(commit.data.itemsImported, 2);
  assert.equal(commit.data.duplicatesSkipped, 1);
  const items = __getRawStore('tj:items');
  assert.equal(items.length, 2);
});
