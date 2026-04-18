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
  // Valid: example.com (https:), test.org (http:), not-a-url (protocol-defaulted → https:),
  //        empty-title (https:), chrome://extensions (chrome: allowed since B-058)
  // Discarded: ftp: scheme not in ALLOWED_URL_SCHEMES,
  //            no-url entry (no url field), null entry
  assert.equal(items.length, 5, `Expected 5 valid items, got ${items.length}`);

  // --- Assert survivors by scheme / URL ---

  // https: item survives
  const httpsItem = items.find((i) => i.url === 'https://example.com/');
  assert.ok(httpsItem, 'https:// item should survive');
  assert.equal(httpsItem.title, 'Valid Site');
  assert.equal(httpsItem.groupId, null);
  assert.equal(httpsItem.sortOrder, 0);
  assert.ok(httpsItem.id, 'should have a ULID');
  assert.ok(httpsItem.createdAt > 0);

  // http: item survives
  const httpItem = items.find((i) => i.url === 'http://test.org/page');
  assert.ok(httpItem, 'http:// item should survive');
  assert.equal(httpItem.title, 'Also Valid');

  // Protocol-defaulted item (bare hostname → https:) survives
  const defaultedItem = items.find((i) => i.url && i.url.startsWith('https://not-a-url'));
  assert.ok(defaultedItem, 'bare-hostname item should be protocol-defaulted to https: and survive');

  // ftp: item is discarded (not in ALLOWED_URL_SCHEMES)
  const ftpItem = items.find((i) => i.url && i.url.startsWith('ftp:'));
  assert.equal(ftpItem, undefined, 'ftp: item must be discarded');

  // chrome: item is now ACCEPTED (B-058: chrome: added to ALLOWED_URL_SCHEMES)
  const chromeItem = items.find((i) => i.url && i.url.startsWith('chrome:'));
  assert.ok(chromeItem, 'chrome: item should survive (B-058)');
  assert.equal(chromeItem.title, 'Chrome URL');

  // Empty title should fall back to URL
  const emptyTitle = items.find((i) => i.url === 'https://empty-title.com/');
  assert.ok(emptyTitle, 'empty-title item should survive');
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
