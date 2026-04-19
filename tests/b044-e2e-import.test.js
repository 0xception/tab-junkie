/**
 * b044-e2e-import.test.js — end-to-end integration tests for the
 * MSG_IMPORT_COLLECTION preview → commit round-trip (B-044, R3).
 *
 * AC coverage:
 *   - AC3  → Netscape recognition under realistic content
 *   - AC12 → preview leaves storage untouched; commit replaces atomically
 *   - AC13 → response shape surfaces counts for toast copy
 *   - AC14 → 1000-item / 50-folder corpus completes under 2000ms
 *   - AC18 → full message contract round-trip
 *
 * Dispatches through `chrome.runtime.onMessage._listeners` — no shim.
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

function wrapDoc(body) {
  return (
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n'
    + '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n'
    + '<TITLE>Bookmarks</TITLE>\n'
    + '<H1>Bookmarks Menu</H1>\n'
    + '<DL><p>\n' + body + '</DL><p>\n'
  );
}

/* =========================================================================
 * Happy-path round-trip
 * ========================================================================= */

test('B-044 e2e: preview → commit sequence replaces items+groups atomically', async () => {
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() },
    items: [{
      id: 'i-old', title: 'Old', url: 'https://old.example/',
      groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1,
    }],
    groups: [],
  });
  registerStorageHandlers(Promise.resolve());
  const content = wrapDoc(
    '  <DT><H3>Work</H3>\n'
    + '  <DL><p>\n'
    + '    <DT><A HREF="https://a.example">Alpha</A>\n'
    + '    <DT><A HREF="https://b.example">Beta</A>\n'
    + '  </DL><p>\n',
  );

  /* Preview round-trip — no mutation. */
  const preview = await dispatch(getListener(), { format: 'html', content });
  assert.equal(preview.ok, true);
  assert.equal(preview.data.previewOnly, true);
  assert.equal(preview.data.itemsImported, 2);
  assert.equal(preview.data.groupsImported, 1);
  const preItems = __getRawStore('tj:items');
  assert.equal(preItems.length, 1, 'preview did not mutate items');
  assert.equal(preItems[0].id, 'i-old');

  /* Commit round-trip — same content. */
  const commit = await dispatch(getListener(), { format: 'html', content, commit: true });
  assert.equal(commit.ok, true);
  assert.equal(commit.data.previewOnly, false);
  assert.equal(commit.data.itemsImported, 2);
  assert.equal(commit.data.groupsImported, 1);

  const items = __getRawStore('tj:items');
  const groups = __getRawStore('tj:groups');
  assert.equal(items.length, 2);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, 'Work');
  /* All items were in the Work folder; no orphans. */
  assert.ok(items.every((it) => it.groupId === groups[0].id));
  /* Pre-import item is gone. */
  assert.equal(items.some((it) => it.id === 'i-old'), false);
});

test('B-044 e2e AC13: preview response carries skipped + duplicatesSkipped counts', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const content = wrapDoc(
    '  <DT><A HREF="https://a.example">A</A>\n'
    + '  <DT><A HREF="https://a.example">A-dup</A>\n'
    + '  <DT><A HREF="javascript:alert(1)">JS</A>\n'
    + '  <DT><A>NoHref</A>\n',
  );
  const resp = await dispatch(getListener(), { format: 'html', content });
  assert.equal(resp.ok, true);
  assert.equal(resp.data.itemsImported, 1);
  assert.equal(resp.data.duplicatesSkipped, 1);
  assert.equal(resp.data.skipped, 2);
});

/* =========================================================================
 * AC14 — performance ceiling
 * ========================================================================= */

test('B-044 AC14: 1000-item / 50-folder preview + commit under 2000ms', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  /* Build a 50-folder / 1000-item Netscape file. Each folder holds 20 items. */
  const folderParts = [];
  for (let f = 0; f < 50; f += 1) {
    folderParts.push(`  <DT><H3>Folder${f}</H3>\n  <DL><p>\n`);
    for (let i = 0; i < 20; i += 1) {
      const idx = f * 20 + i;
      folderParts.push(
        `    <DT><A HREF="https://site-${idx}.example/">Item ${idx}</A>\n`,
      );
    }
    folderParts.push('  </DL><p>\n');
  }
  const content = wrapDoc(folderParts.join(''));
  const t0 = performance.now();
  const preview = await dispatch(getListener(), { format: 'html', content });
  assert.equal(preview.ok, true);
  assert.equal(preview.data.itemsImported, 1000);
  assert.equal(preview.data.groupsImported, 50);
  const commit = await dispatch(getListener(), { format: 'html', content, commit: true });
  assert.equal(commit.ok, true);
  const elapsed = performance.now() - t0;
  /* AC14 budget: < 2000ms end-to-end. Leave a healthy margin (the SW
     integration through chrome-mock is faster than production, but we're
     pinning the parse+commit cost on realistic data). */
  assert.ok(elapsed < 2000, 'end-to-end elapsed ' + elapsed.toFixed(1) + 'ms must be < 2000ms');
  const items = __getRawStore('tj:items');
  assert.equal(items.length, 1000);
});
