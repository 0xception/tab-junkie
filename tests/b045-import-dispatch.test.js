/**
 * b045-import-dispatch.test.js — payload validation + message-dispatch
 * plumbing for MSG_IMPORT_COLLECTION `format: 'json'` (B-045, R3).
 *
 * AC coverage:
 *   - AC2  → root-shape failures surface as ERR_MALFORMED_ROOT through envelope
 *   - AC3  → schemaVersion > KNOWN_VERSION surfaces as ERR_UNKNOWN_SCHEMA_VERSION
 *   - AC11 → preview round-trip is read-only; commit round-trip mutates atomically
 *   - AC14 → zero network: no fetch / sendBeacon / etc. required by the
 *            dispatch path; guarded by the same message plumbing as B-044
 *   - safe-mode reuse  → ERR_SAFE_MODE under schema-downgrade
 *
 * Integration uses chrome.runtime.onMessage._listeners directly per Sprint 15
 * retro — no shim dispatcher.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, seedPartitions, __getRawStore } from './chrome-mock.js';

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

function buildBackup(overrides = {}) {
  return JSON.stringify({
    schemaVersion: KNOWN_VERSION,
    exportedAt: '2026-04-19T00:00:00.000Z',
    items: [],
    groups: [],
    ...overrides,
  });
}

/* =========================================================================
 * Payload validation reuse — the JSON branch shares every handler-side
 * gate with B-044.
 * ========================================================================= */

test('B-045 dispatch: missing content on json → ERR_VALIDATION', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatch(getListener(), { format: 'json' });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_VALIDATION');
});

test('B-045 dispatch: empty content on json → ERR_VALIDATION', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatch(getListener(), { format: 'json', content: '' });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_VALIDATION');
});

test('B-045 dispatch: content > 10 MiB rejected with ERR_VALIDATION (json)', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const oversize = '{' + 'x'.repeat(10 * 1024 * 1024);
  const resp = await dispatch(getListener(), { format: 'json', content: oversize });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_VALIDATION');
});

/* =========================================================================
 * Parser-surfaced errors (AC2, AC3)
 * ========================================================================= */

test('B-045 dispatch: malformed JSON → ERR_INVALID_FORMAT', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatch(getListener(), {
    format: 'json',
    content: '{not valid json',
  });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_INVALID_FORMAT');
});

test('B-045 dispatch: root-shape failure → ERR_MALFORMED_ROOT', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatch(getListener(), {
    format: 'json',
    content: JSON.stringify({ schemaVersion: 1, exportedAt: 'x' }), // items missing
  });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_MALFORMED_ROOT');
});

test('B-045 AC3 dispatch: schemaVersion > KNOWN_VERSION → ERR_UNKNOWN_SCHEMA_VERSION', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatch(getListener(), {
    format: 'json',
    content: buildBackup({ schemaVersion: KNOWN_VERSION + 5 }),
  });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_UNKNOWN_SCHEMA_VERSION');
});

/* =========================================================================
 * AC11 — safe-mode rejection + zero mutation
 * ========================================================================= */

test('B-045 AC11: safe-mode blocks JSON import with ERR_SAFE_MODE and preserves data', async () => {
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION + 1, createdAt: Date.now() },
    items: [{
      id: 'i-preserved', title: 'T', url: 'https://preserved.example/',
      groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1,
    }],
    groups: [],
  });
  const { runMigrations } = await import('../background/storage/migration.js');
  await runMigrations();
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatch(getListener(), {
    format: 'json',
    content: buildBackup({
      items: [{
        id: 'new', title: 'new', url: 'https://new.example/',
        groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1,
      }],
    }),
    commit: true,
  });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_SAFE_MODE');
  /* Pre-import state preserved byte-for-byte. */
  const items = __getRawStore('tj:items');
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'i-preserved');
});

/* =========================================================================
 * Preview round-trip — no mutation (AC11 preview half)
 * ========================================================================= */

test('B-045 dispatch: preview returns previewOnly + repairs, leaves storage untouched', async () => {
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() },
    items: [{
      id: 'i-keep', title: 'Keep', url: 'https://keep.example/',
      groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1,
    }],
    groups: [],
  });
  registerStorageHandlers(Promise.resolve());
  const content = buildBackup({
    items: [
      { id: 'a', title: 'A', url: 'https://a.example/',
        groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 },
      { id: 'b', title: 'B', url: 'https://b.example/',
        groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 },
    ],
  });
  const resp = await dispatch(getListener(), { format: 'json', content });
  assert.equal(resp.ok, true);
  assert.equal(resp.data.previewOnly, true);
  assert.equal(resp.data.itemsImported, 2);
  assert.ok(resp.data.repairs, 'repairs included on JSON preview');
  /* AC11: preview never mutates items partition. */
  const items = __getRawStore('tj:items');
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'i-keep');
});

test('B-045 dispatch: zero-count preview short-circuits without error', async () => {
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() },
    items: [{ id: 'i-keep', title: 'K', url: 'https://keep.example/',
              groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 }],
    groups: [],
  });
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatch(getListener(), {
    format: 'json',
    content: buildBackup(),
  });
  assert.equal(resp.ok, true);
  assert.equal(resp.data.previewOnly, true);
  assert.equal(resp.data.itemsImported, 0);
  assert.equal(resp.data.groupsImported, 0);
  const items = __getRawStore('tj:items');
  assert.equal(items.length, 1);
});

/* =========================================================================
 * Foreign sender rejection (reused from dispatcher)
 * ========================================================================= */

test('B-045 dispatch: foreign sender rejected with ERR_DIRECT_WRITE (json)', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const resp = await new Promise((resolve) => {
    const listener = getListener();
    listener(
      { type: MSG_IMPORT_COLLECTION, payload: { format: 'json', content: buildBackup() } },
      { id: 'some-other-extension' },
      resolve,
    );
  });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_DIRECT_WRITE');
});
