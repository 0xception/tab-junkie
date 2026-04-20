/**
 * b044-import-dispatch.test.js — payload validation + message-dispatch
 * plumbing for MSG_IMPORT_COLLECTION (B-044, R3).
 *
 * AC coverage:
 *   - AC18 → message contract shape + format discriminator + typed error envelope
 *   - AC12 → safe-mode rejection with ERR_SAFE_MODE, zero mutation
 *   - AC3  → parser-level doctype failure bubbles as ERR_INVALID_FORMAT
 *   - AC19 → JSON format not yet wired at v1 (rejected via ERR_INVALID_FORMAT)
 *
 * Integration uses chrome.runtime.onMessage._listeners directly per Sprint 15
 * retro — no shim dispatcher.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, seedPartitions } from './chrome-mock.js';

import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import { MSG_IMPORT_COLLECTION } from '../shared/messages.js';
import {
  KNOWN_VERSION,
  _resetMigrationStateForTest,
  _clearMigrationStepsForTest,
} from '../background/storage/migration.js';

beforeEach(() => {
  __resetMock();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
});

function wrapDoc(body) {
  return (
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n'
    + '<DL><p>\n' + body + '</DL><p>\n'
  );
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

function getListener() {
  const listeners = chrome.runtime.onMessage._listeners;
  return listeners[listeners.length - 1];
}

/* =========================================================================
 * Payload validation — AC18
 * ========================================================================= */

test('B-044 dispatch: missing format → ERR_VALIDATION', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatch(getListener(), { content: wrapDoc('') });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_VALIDATION');
});

test('B-044 dispatch: unknown format → ERR_VALIDATION', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatch(getListener(), { format: 'xml', content: wrapDoc('') });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_VALIDATION');
});

test('B-044 dispatch: missing content → ERR_VALIDATION', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatch(getListener(), { format: 'html' });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_VALIDATION');
});

test('B-044 dispatch: empty content string → ERR_VALIDATION', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatch(getListener(), { format: 'html', content: '' });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_VALIDATION');
});

test('B-044 dispatch: non-boolean commit → ERR_VALIDATION', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatch(getListener(), {
    format: 'html',
    content: wrapDoc(''),
    commit: 'yes',
  });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_VALIDATION');
});

test('B-044 dispatch: non-object options → ERR_VALIDATION', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatch(getListener(), {
    format: 'html',
    content: wrapDoc(''),
    options: 'skip',
  });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_VALIDATION');
});

/* =========================================================================
 * Parser-surfaced errors (AC3)
 * ========================================================================= */

test('B-044 dispatch: non-Netscape content → ERR_INVALID_FORMAT', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatch(getListener(), {
    format: 'html',
    content: '<html><body>not netscape</body></html>',
  });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_INVALID_FORMAT');
});

/* =========================================================================
 * JSON format wired by B-045 (Sprint 18 Wave 4)
 * =========================================================================
 * Before Wave 4, `format: 'json'` was deliberately rejected with
 * ERR_INVALID_FORMAT by the stub validator. Wave 4 replaced the stub with
 * the full parser; `{}` now passes JSON.parse but fails root-shape
 * validation (schemaVersion / items / groups missing) → ERR_MALFORMED_ROOT.
 * Retained as a dispatch smoke-test: the JSON branch is wired through and
 * the handler envelope surfaces the typed error code verbatim.
 */

test('B-044 dispatch: format=json routes to JSON validator and surfaces typed errors', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatch(getListener(), {
    format: 'json',
    content: '{}',
  });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_MALFORMED_ROOT');
});

/* =========================================================================
 * AC12 — safe-mode rejection
 * ========================================================================= */

test('B-044 AC12: safe-mode blocks import with ERR_SAFE_MODE and preserves data', async () => {
  /* Seed a schema version newer than the built-in KNOWN_VERSION to trigger
     safe-mode on the next migration run. */
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION + 1, createdAt: Date.now() },
    items: [{
      id: 'i-preserved',
      title: 'PreservedTitle',
      url: 'https://preserved.example/',
      groupId: null,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    }],
    groups: [],
  });
  /* Run migrations to populate the safe-mode flag. */
  const { runMigrations } = await import('../background/storage/migration.js');
  await runMigrations();
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatch(getListener(), {
    format: 'html',
    content: wrapDoc('  <DT><A HREF="https://new.example">New</A>\n'),
    commit: true,
  });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_SAFE_MODE');
  /* AC12: pre-import state preserved byte-for-byte. */
  const { __getRawStore } = await import('./chrome-mock.js');
  const items = __getRawStore('tj:items');
  assert.ok(Array.isArray(items));
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'i-preserved');
});

/* =========================================================================
 * Preview round-trip — no mutation
 * ========================================================================= */

test('B-044 dispatch: preview returns previewOnly:true and does not mutate storage', async () => {
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() },
    items: [], groups: [],
  });
  registerStorageHandlers(Promise.resolve());
  const body = '  <DT><A HREF="https://x.example">X</A>\n  <DT><A HREF="https://y.example">Y</A>\n';
  const resp = await dispatch(getListener(), {
    format: 'html',
    content: wrapDoc(body),
  });
  assert.equal(resp.ok, true);
  assert.equal(resp.data.previewOnly, true);
  assert.equal(resp.data.itemsImported, 2);
  assert.equal(resp.data.groupsImported, 0);
  /* AC12: preview must leave items partition empty. */
  const { __getRawStore } = await import('./chrome-mock.js');
  const items = __getRawStore('tj:items');
  assert.ok(Array.isArray(items));
  assert.equal(items.length, 0);
});

/* =========================================================================
 * R4 qa-reviewer #3 — zero-count preview surfaces gracefully.
 * A valid DOCTYPE with an empty <DL></DL> must reach the preview handler
 * with itemsImported = 0 AND groupsImported = 0, so the sidepanel UI can
 * toast "File contains no bookmarks" instead of opening the Replace-all
 * confirmation dialog and wiping storage for nothing.
 * ========================================================================= */

test('B-044 dispatch: valid DOCTYPE + empty <DL> preview returns zero counts and no mutation', async () => {
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() },
    items: [{
      id: 'i-keep', title: 'Keep', url: 'https://keep.example/',
      groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1,
    }],
    groups: [],
  });
  registerStorageHandlers(Promise.resolve());
  /* DOCTYPE present, DL present, but zero DT entries. */
  const resp = await dispatch(getListener(), {
    format: 'html',
    content: wrapDoc(''),
  });
  assert.equal(resp.ok, true);
  assert.equal(resp.data.previewOnly, true);
  assert.equal(resp.data.itemsImported, 0);
  assert.equal(resp.data.groupsImported, 0);
  /* Pre-existing item must still be present — preview never mutates. */
  const { __getRawStore } = await import('./chrome-mock.js');
  const items = __getRawStore('tj:items');
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'i-keep');
});

/* =========================================================================
 * R4 security-reviewer M-1 (defense-in-depth) — SW-side content-length cap.
 * UI already caps at 5 MiB; SW caps at 10 MiB to tolerate UTF-8 expansion
 * on edge-case inputs while still bounding memory + CPU at the trust
 * boundary. Payloads above the cap must fail ERR_VALIDATION without parse.
 * ========================================================================= */

test('B-044 dispatch: content > 10 MiB rejected with ERR_VALIDATION', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  /* 10 MiB + 1 byte — just over the SW-side cap. Use a character that
     cannot appear inside a DT line so the payload is cheap to construct. */
  const oversize = 'x'.repeat(10 * 1024 * 1024 + 1);
  const resp = await dispatch(getListener(), {
    format: 'html',
    content: oversize,
  });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_VALIDATION');
});

/* =========================================================================
 * Sender-id enforcement from the dispatcher still applies
 * ========================================================================= */

test('B-044 dispatch: foreign sender rejected with ERR_DIRECT_WRITE', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const resp = await new Promise((resolve) => {
    const listener = getListener();
    listener(
      { type: MSG_IMPORT_COLLECTION, payload: { format: 'html', content: wrapDoc('') } },
      { id: 'some-other-extension' },
      resolve,
    );
  });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_DIRECT_WRITE');
});
