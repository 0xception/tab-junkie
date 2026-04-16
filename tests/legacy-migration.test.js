/**
 * B-001b AC7: Legacy migration — junkie_bookmarks with valid + invalid entries.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setRawStore, __getRawStore, seedPartitions } from './chrome-mock.js';
import {
  runMigrations,
  KNOWN_VERSION,
  _resetMigrationStateForTest,
  _clearMigrationStepsForTest,
} from '../background/storage/migration.js';

beforeEach(() => {
  __resetMock();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
});

test('AC7: valid legacy bookmarks migrated to tj:items, invalid discarded', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });

  // Seed legacy keys
  __setRawStore('junkie_bookmarks', [
    { title: 'Valid Site', url: 'https://example.com' },
    { title: 'Also Valid', url: 'http://test.org/page' },
    { title: 'Invalid URL', url: 'not-a-url' },
    { title: 'No URL' },
    null,
    { title: 'FTP OK', url: 'ftp://files.example.com/readme.txt' },
    { title: 'Chrome URL', url: 'chrome://extensions' },
    { title: '', url: 'https://empty-title.com' },
  ]);
  __setRawStore('junkie_groups', [{ name: 'Old Group' }]);
  __setRawStore('junkie_preferences', { theme: 'dark' });

  await runMigrations();

  // Valid items should be in tj:items
  const items = __getRawStore('tj:items');
  assert.ok(Array.isArray(items));
  // Valid: example.com, test.org, ftp, empty-title (URL used as title)
  assert.equal(items.length, 4, `Expected 4 valid items, got ${items.length}`);

  // Check shape of migrated items
  const first = items.find((i) => i.url === 'https://example.com');
  assert.ok(first);
  assert.equal(first.title, 'Valid Site');
  assert.equal(first.groupId, null);
  assert.equal(first.sortOrder, 0);
  assert.ok(first.id, 'should have a ULID');
  assert.ok(first.createdAt > 0);

  // Empty title should fall back to URL
  const emptyTitle = items.find((i) => i.url === 'https://empty-title.com');
  assert.ok(emptyTitle);
  assert.equal(emptyTitle.title, 'https://empty-title.com');

  // All legacy keys should be removed
  assert.equal(__getRawStore('junkie_bookmarks'), undefined);
  assert.equal(__getRawStore('junkie_groups'), undefined);
  assert.equal(__getRawStore('junkie_preferences'), undefined);
});

test('AC7: junkie_bookmarks not an array → keys still removed', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });

  __setRawStore('junkie_bookmarks', 'not-an-array');
  __setRawStore('junkie_pinned_tabs', { some: 'data' });

  await runMigrations();

  // Legacy keys should still be cleaned up
  assert.equal(__getRawStore('junkie_bookmarks'), undefined);
  assert.equal(__getRawStore('junkie_pinned_tabs'), undefined);

  // tj:items should be empty (no valid items to migrate)
  const items = __getRawStore('tj:items');
  assert.ok(Array.isArray(items));
  assert.equal(items.length, 0);
});

test('AC7: no legacy keys present → no error, items untouched', async () => {
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() },
    items: [
      { id: 'E1', title: 'Existing', url: 'https://existing.com', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 },
    ],
  });

  await runMigrations();

  const items = __getRawStore('tj:items');
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'E1');
});
