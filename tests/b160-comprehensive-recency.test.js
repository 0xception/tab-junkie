/**
 * b160-comprehensive-recency.test.js — B-160 (S43, 2026-05-03)
 *
 * Two changes:
 *
 * §1 SW NAVIGATE_TO_ITEM auto-feeds recency. Pre-B-160 only the popup
 *    dispatched MSG_RECENCY_ADD; sidepanel + newtab navigations did not
 *    feed `tj:recency`. The handler at storage-handlers.js
 *    MSG_NAVIGATE_TO_ITEM now calls the shared `appendRecencyEntry` helper
 *    (fire-and-forget) for both itemId and tabId variants, so any-surface
 *    navigation feeds recency.
 *
 * §2 popup _renderRecency sparse-recency fallback. When the resolved
 *    recentRows.length < RECENCY_VIEW_CAP, pad with most-recently-accessed
 *    items by lastAccessedAt desc (createdAt tiebreaker), deduped against
 *    already-rendered. Result: popup default view shows items even when
 *    recency is empty, replacing the "🕑 No recent items yet" empty state.
 *
 * Coverage:
 *   T1 — SW handler MSG_NAVIGATE_TO_ITEM(itemId) appends `item:<id>` to
 *        recency partition (fire-and-forget; verify after a brief delay)
 *   T2 — SW handler MSG_NAVIGATE_TO_ITEM(tabId) appends `url:<url>` to
 *        recency partition
 *   T3 — appendRecencyEntry dedupe: navigating to the same item twice
 *        produces a single recency entry at the head (not a duplicate)
 *   T4 — Static-source pin: SW handler dispatch includes the
 *        `appendRecencyEntry` call
 *   T5 — Static-source pin: popup.js _activateRow no longer dispatches
 *        MSG_RECENCY_ADD (centralization)
 *   T6 — Static-source pin: popup _renderRecency contains the sparse-
 *        recency fallback (lastAccessedAt sort)
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import './_setup.js';
import { __resetMock, __setMockTabs } from './chrome-mock.js';
import { createItem } from '../background/storage/items.js';
import { createGroup } from '../background/storage/groups.js';
import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import { MSG_NAVIGATE_TO_ITEM } from '../shared/messages.js';
import { readPartition, PARTITION_RECENCY } from '../background/storage/partitions.js';
import { claimTabForItem } from '../background/tabs/tab-claims.js';
import { buildLiveTabIndex } from '../background/tabs/live-tab-index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

beforeEach(async () => {
  await __resetMock();
});

function getListener() {
  const listeners = chrome.runtime.onMessage._listeners;
  return listeners[listeners.length - 1];
}

async function dispatchMessage(type, payload) {
  return await new Promise((resolve) => {
    getListener()(
      { type, payload },
      { id: chrome.runtime.id },
      resolve,
    );
  });
}

/* Brief delay so the fire-and-forget appendRecencyEntry resolves before
   we read the partition. */
async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

/* =========================================================================
   §1 — SW MSG_NAVIGATE_TO_ITEM(itemId) feeds recency partition
   ========================================================================= */

test('B-160 T1: MSG_NAVIGATE_TO_ITEM(itemId) appends item:<id> to recency partition', async () => {
  const g = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  const item = await createItem({ title: 'A', url: 'https://a.example/', groupId: g.id, sortOrder: 0 });

  __setMockTabs([
    { id: 11, url: 'https://a.example/', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  await claimTabForItem(item.id, 11);

  registerStorageHandlers(Promise.resolve());
  const resp = await dispatchMessage(MSG_NAVIGATE_TO_ITEM, { itemId: item.id });
  assert.equal(resp.ok, true, 'navigate succeeds');

  await flushMicrotasks();
  const recency = await readPartition(PARTITION_RECENCY);
  assert.ok(Array.isArray(recency.entries), 'recency entries is array');
  assert.equal(recency.entries.length, 1, 'one entry appended');
  assert.equal(recency.entries[0].id, 'item:' + item.id, 'entry id is item:<itemId>');
  assert.equal(typeof recency.entries[0].accessedAt, 'number', 'entry has accessedAt timestamp');
});

/* =========================================================================
   §1 — SW MSG_NAVIGATE_TO_ITEM(tabId) feeds recency partition
   ========================================================================= */

test('B-160 T2: MSG_NAVIGATE_TO_ITEM(tabId) appends url:<url> to recency partition', async () => {
  __setMockTabs([
    { id: 22, url: 'https://b.example/', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  registerStorageHandlers(Promise.resolve());
  const resp = await dispatchMessage(MSG_NAVIGATE_TO_ITEM, { tabId: 22, windowId: 1 });
  assert.equal(resp.ok, true, 'navigate succeeds');

  await flushMicrotasks();
  const recency = await readPartition(PARTITION_RECENCY);
  assert.equal(recency.entries.length, 1, 'one entry appended');
  assert.equal(recency.entries[0].id, 'url:https://b.example/', 'entry id is url:<url>');
});

/* =========================================================================
   §1 — Recency dedupe: same item twice → one entry at head
   ========================================================================= */

test('B-160 T3: dispatch same itemId twice produces one deduped entry at head', async () => {
  const g = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  const itemA = await createItem({ title: 'A', url: 'https://a.example/', groupId: g.id, sortOrder: 0 });
  const itemB = await createItem({ title: 'B', url: 'https://b.example/', groupId: g.id, sortOrder: 1 });

  __setMockTabs([
    { id: 11, url: 'https://a.example/', windowId: 1, active: false, audible: false, index: 0 },
    { id: 12, url: 'https://b.example/', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();
  await claimTabForItem(itemA.id, 11);
  await claimTabForItem(itemB.id, 12);

  registerStorageHandlers(Promise.resolve());

  /* Navigate A → B → A. After dedupe, recency = [item:A, item:B] (A at head
     because it's the most-recent action). */
  await dispatchMessage(MSG_NAVIGATE_TO_ITEM, { itemId: itemA.id });
  await flushMicrotasks();
  await dispatchMessage(MSG_NAVIGATE_TO_ITEM, { itemId: itemB.id });
  await flushMicrotasks();
  await dispatchMessage(MSG_NAVIGATE_TO_ITEM, { itemId: itemA.id });
  await flushMicrotasks();

  const recency = await readPartition(PARTITION_RECENCY);
  assert.equal(recency.entries.length, 2, 'two distinct entries (deduped)');
  assert.equal(recency.entries[0].id, 'item:' + itemA.id, 'most-recent (A) at head');
  assert.equal(recency.entries[1].id, 'item:' + itemB.id, 'previously-recent (B) second');
});

/* =========================================================================
   Static-source pins (T4-T6)
   ========================================================================= */

const STORAGE_HANDLERS_SRC = readFileSync(
  join(REPO_ROOT, 'background/messages/storage-handlers.js'),
  'utf8',
);
const POPUP_SRC = readFileSync(join(REPO_ROOT, 'popup/popup.js'), 'utf8');

test('B-160 T4: SW NAVIGATE_TO_ITEM dispatch calls appendRecencyEntry for both variants', () => {
  /* itemId variant — appendRecencyEntry('item:' + ...). */
  assert.match(
    STORAGE_HANDLERS_SRC,
    /appendRecencyEntry\(\s*'item:'\s*\+\s*p\.itemId\s*\)/,
    'SW NAVIGATE_TO_ITEM(itemId) variant must call appendRecencyEntry with item:<itemId>',
  );
  /* tabId variant — appendRecencyEntry('url:' + ...). */
  assert.match(
    STORAGE_HANDLERS_SRC,
    /appendRecencyEntry\(\s*'url:'\s*\+\s*liveEntry\.url\s*\)/,
    'SW NAVIGATE_TO_ITEM(tabId) variant must call appendRecencyEntry with url:<url>',
  );
});

test('B-160 T5: popup _activateRow no longer dispatches MSG_RECENCY_ADD', () => {
  /* The function _activateRow exists. */
  assert.match(POPUP_SRC, /async function _activateRow\(/);
  /* Inside _activateRow body, MSG_RECENCY_ADD must NOT be dispatched. The
     constant may appear in a comment but not as a dispatch payload type. */
  const fnMatch = POPUP_SRC.match(/async function _activateRow\(row\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, '_activateRow body parseable');
  const body = fnMatch[1];
  assert.doesNotMatch(
    body,
    /sendMessage\(\{\s*type:\s*MSG_RECENCY_ADD/,
    '_activateRow must NOT dispatch MSG_RECENCY_ADD (centralized in SW NAVIGATE_TO_ITEM handler)',
  );
});

test('B-160 T6: popup _renderRecency contains the sparse-recency fallback (lastAccessedAt sort)', () => {
  /* The sparse-recency padding must reference lastAccessedAt sorting. */
  const fnMatch = POPUP_SRC.match(/function _renderRecency\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, '_renderRecency body parseable');
  const body = fnMatch[1];
  assert.match(
    body,
    /recentRows\.length\s*<\s*RECENCY_VIEW_CAP/,
    'sparse-recency fallback gate must check recentRows.length < RECENCY_VIEW_CAP',
  );
  assert.match(
    body,
    /lastAccessedAt/,
    'sparse-recency fallback must sort by lastAccessedAt',
  );
});
