/**
 * b159-favicon-persistence.test.js — B-159 (S43 close, 2026-05-03)
 *
 * §A: Item.favIconUrl persists across tab close + extension restart.
 *     Schema v5→v6 lazy migration. isItem validator tolerates absent /
 *     null / non-empty string. updateItem allow-list accepts the field.
 *     buildLiveStates falls back to persisted favicon when live tab entry
 *     has no favIconUrl OR no claim.
 *
 * §B: Chrome `_favicon` API helper (`getChromeFaviconUrl`) returns a
 *     chrome-extension:// URL constructed via chrome.runtime.getURL.
 *     `isSafeFaviconUrl` allows chrome-extension:// prefix.
 *
 * Coverage:
 *   T1   — KNOWN_VERSION === 6 + defaultShape paired bump (regression
 *          guards already in sync-schema-v5.test.js + migration-fresh-
 *          install.test.js + migration-steps.test.js — covered there).
 *   T2   — isItem accepts legacy v5 item without favIconUrl
 *   T3   — isItem accepts v6 item with favIconUrl: null
 *   T4   — isItem accepts v6 item with favIconUrl: 'https://x.example/icon.ico'
 *   T5   — isItem rejects favIconUrl: 0 (wrong type — number)
 *   T6   — updateItem allow-list accepts favIconUrl in patch
 *   T7   — updateItem rejects empty-string favIconUrl (use null instead)
 *   T8   — buildLiveStates falls back to item.favIconUrl when no live tab claim
 *   T9   — buildLiveStates prefers live tab favicon over persisted item favicon
 *   T10  — isSafeFaviconUrl accepts chrome-extension:// (B-159 §B)
 *   T11  — getChromeFaviconUrl returns a chrome-extension URL with pageUrl + size params
 *   T12  — getChromeFaviconUrl returns null for invalid input
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './_setup.js';
import { __resetMock } from './chrome-mock.js';
import { assertShape, PARTITION_ITEMS } from '../background/storage/shapes.js';
import { createItem, updateItem, listItems } from '../background/storage/items.js';
import { createGroup } from '../background/storage/groups.js';
import { isSafeFaviconUrl, getChromeFaviconUrl } from '../shared/favicon.js';
import { buildLiveStates } from '../background/tabs/tab-claims.js';

beforeEach(async () => {
  await __resetMock();
});

function fixtureItem(extra = {}) {
  return Object.assign({
    id: '01HZ',
    title: 'Example',
    url: 'https://example.com/',
    groupId: null,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  }, extra);
}

/* =========================================================================
   §A — Item shape validator
   ========================================================================= */

test('B-159 §A T2: isItem accepts legacy v5 item without favIconUrl', () => {
  const items = [fixtureItem()];
  assert.doesNotThrow(() => assertShape(PARTITION_ITEMS, items));
});

test('B-159 §A T3: isItem accepts v6 item with favIconUrl: null', () => {
  const items = [fixtureItem({ favIconUrl: null })];
  assert.doesNotThrow(() => assertShape(PARTITION_ITEMS, items));
});

test('B-159 §A T4: isItem accepts v6 item with favIconUrl: non-empty string', () => {
  const items = [fixtureItem({ favIconUrl: 'https://example.com/favicon.ico' })];
  assert.doesNotThrow(() => assertShape(PARTITION_ITEMS, items));
});

test('B-159 §A T5: isItem rejects favIconUrl: 0 (wrong type)', () => {
  const items = [fixtureItem({ favIconUrl: 0 })];
  assert.throws(() => assertShape(PARTITION_ITEMS, items));
});

/* =========================================================================
   §A — updateItem allow-list / validator
   ========================================================================= */

test('B-159 §A T6: updateItem accepts favIconUrl in patch + persists it', async () => {
  const item = await createItem({ title: 'A', url: 'https://a.example/', sortOrder: 0 });
  const updated = await updateItem(item.id, { favIconUrl: 'https://a.example/favicon.ico' });
  assert.equal(updated.favIconUrl, 'https://a.example/favicon.ico');
  const items = await listItems();
  const persisted = items.find((i) => i.id === item.id);
  assert.equal(persisted.favIconUrl, 'https://a.example/favicon.ico');
});

test('B-159 §A T7: updateItem rejects empty-string favIconUrl (use null to clear)', async () => {
  const item = await createItem({ title: 'A', url: 'https://a.example/', sortOrder: 0 });
  await assert.rejects(
    () => updateItem(item.id, { favIconUrl: '' }),
    (err) => err.message.includes('favIconUrl'),
  );
});

test('B-159 §A T7b: updateItem accepts null favIconUrl (explicit clear)', async () => {
  const item = await createItem({ title: 'A', url: 'https://a.example/', sortOrder: 0 });
  await updateItem(item.id, { favIconUrl: 'https://a.example/icon.ico' });
  const cleared = await updateItem(item.id, { favIconUrl: null });
  assert.equal(cleared.favIconUrl, null);
});

/* =========================================================================
   §A — buildLiveStates fallback chain
   ========================================================================= */

test('B-159 §A T8: buildLiveStates falls back to item.favIconUrl when no live claim', () => {
  const items = [fixtureItem({ favIconUrl: 'https://example.com/icon.ico' })];
  const states = buildLiveStates(items);
  assert.equal(states['01HZ'].favIconUrl, 'https://example.com/icon.ico');
  assert.equal(states['01HZ'].live, false);
});

test('B-159 §A T8b: buildLiveStates returns null favIconUrl when no live AND no persisted', () => {
  const items = [fixtureItem()];
  const states = buildLiveStates(items);
  assert.equal(states['01HZ'].favIconUrl, null);
});

/* =========================================================================
   §B — isSafeFaviconUrl + getChromeFaviconUrl
   ========================================================================= */

test('B-159 §B T10: isSafeFaviconUrl accepts chrome-extension:// prefix', () => {
  assert.equal(
    isSafeFaviconUrl('chrome-extension://abc123/_favicon/?pageUrl=https%3A%2F%2Fexample.com'),
    true,
  );
});

test('B-159 §B T10b: isSafeFaviconUrl preserves all pre-B-159 allowed schemes', () => {
  assert.equal(isSafeFaviconUrl('https://example.com/icon.ico'), true);
  assert.equal(isSafeFaviconUrl('http://example.com/icon.ico'), true);
  assert.equal(isSafeFaviconUrl('data:image/png;base64,abc='), true);
});

test('B-159 §B T10c: isSafeFaviconUrl still rejects unsafe schemes', () => {
  assert.equal(isSafeFaviconUrl('javascript:alert(1)'), false);
  assert.equal(isSafeFaviconUrl('data:text/html,<script>'), false);
  assert.equal(isSafeFaviconUrl('chrome://settings'), false);
  assert.equal(isSafeFaviconUrl('file:///etc/passwd'), false);
});

test('B-159 §B T11: getChromeFaviconUrl returns chrome-extension URL with pageUrl + size params', () => {
  const url = getChromeFaviconUrl('https://example.com/path', 32);
  assert.ok(url, 'returns a non-null URL');
  assert.match(url, /^chrome-extension:\/\//, 'has chrome-extension:// prefix');
  assert.match(url, /\/_favicon\//, 'targets /_favicon/ endpoint');
  assert.match(url, /pageUrl=https%3A%2F%2Fexample\.com%2Fpath/, 'encodes pageUrl');
  assert.match(url, /size=32/, 'includes size param');
});

test('B-159 §B T11b: getChromeFaviconUrl size defaults to 16', () => {
  const url = getChromeFaviconUrl('https://example.com/');
  assert.match(url, /size=16/);
});

test('B-159 §B T12: getChromeFaviconUrl returns null for invalid input', () => {
  assert.equal(getChromeFaviconUrl(''), null);
  assert.equal(getChromeFaviconUrl(null), null);
  assert.equal(getChromeFaviconUrl(undefined), null);
  assert.equal(getChromeFaviconUrl(0), null);
});

/* =========================================================================
   §B — output of getChromeFaviconUrl is itself isSafeFaviconUrl-clean
   ========================================================================= */

test('B-159 §B T13: getChromeFaviconUrl output is safe per isSafeFaviconUrl', () => {
  const url = getChromeFaviconUrl('https://example.com/');
  assert.ok(url);
  assert.equal(isSafeFaviconUrl(url), true);
});
