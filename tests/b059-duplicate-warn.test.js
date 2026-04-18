/**
 * b059-duplicate-warn.test.js — B-059 R5 coverage for the soft-warn
 * duplicate-URL confirmation UI.
 *
 * sidepanel.js is a browser-only module with no exports and DOM side effects
 * on load. Following the pattern established by b027-group-header-menu.test.js
 * and b028-selection-context-menu.test.js, the decision logic added by B-059
 * is reproduced here verbatim with a light shim so the test harness can
 * exercise each code path deterministically without a real browser.
 *
 * Every reproduction cites its source location in `sidepanel/sidepanel.js`.
 *
 * Coverage targets (from SOLUTION_DESIGN §29.8):
 *   T-1  — Single-tab save, NO duplicate → no dialog; MSG_PROMOTE_TAB dispatched
 *   T-2  — Single-tab save, duplicate present, user confirms → dispatched
 *   T-3  — Single-tab save, duplicate present, user cancels → no dispatch
 *   T-4  — Bulk save, no duplicates → no dialog; N promote calls
 *   T-5  — Bulk save, mixed duplicates, user confirms → N promote calls fire
 *   T-6  — Bulk save, all duplicates, user cancels → zero dispatches
 *   T-10 — _findDuplicateSavedItem early-returns null for unparseable URL
 *          (avoids false match on empty/broken URLs).
 *
 * T-7 (data-layer regression — SW no longer throws ERR_DUPLICATE_URL) is
 * covered by tests/promote-tab.test.js AC4 updates.
 * T-9 (floating-group disambiguation) is a regression check against
 * background/tabs/floating-groups.js; no new test added here — the existing
 * B-018 H-2 guards are covered elsewhere.
 */

import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { safeNormalizeForMatch } from '../shared/url.js';

/* =========================================================================
   Reproduced helpers from sidepanel/sidepanel.js
   ========================================================================= */

/* Mirrors sidepanel.js `_findDuplicateSavedItem`. */
function findDuplicateSavedItem(cachedItems, url) {
  const normalized = safeNormalizeForMatch(url);
  if (!normalized) return null;
  for (const it of cachedItems) {
    if (safeNormalizeForMatch(it.url) === normalized) return it;
  }
  return null;
}

/* Mirrors sidepanel.js `_groupLabelForItem`. */
function groupLabelForItem(cachedGroups, item) {
  if (!item || !item.groupId) return 'Ungrouped';
  const g = cachedGroups.find((gr) => gr.id === item.groupId);
  return g ? g.name : 'Ungrouped';
}

/* =========================================================================
   Test harness — mirrors the in-sidepanel dispatch wiring for the save flow.
   `openConfirmDialog` is stubbed to capture the options bag so tests can
   assert copy + variant and manually trigger confirm/cancel callbacks.
   ========================================================================= */

function makeCtx({ items = [], groups = [], openTabs = [] } = {}) {
  const openTabsById = new Map();
  for (const t of openTabs) openTabsById.set(t.tabId, t);
  return {
    _cachedItems: items,
    _cachedGroups: groups,
    _cachedOpenTabsById: openTabsById,
    _dispatched: [],      // MSG_PROMOTE_TAB calls
    _pendingDialog: null, // captured { item, onConfirm, opts }
    _toasts: [],
    _closed: 0,           // closeContextMenu invocations
  };
}

function openConfirmDialogStub(ctx, item, onConfirm, opts = {}) {
  ctx._pendingDialog = { item, onConfirm, opts };
}

/* Reproduces the saveSelect.addEventListener('change', ...) block added by
   B-059 in sidepanel.js :: _openOpenTabContextMenu. */
function singleTabSaveHandler(ctx, tabId, groupId, row) {
  const tab = ctx._cachedOpenTabsById.get(tabId);
  const existing = tab ? findDuplicateSavedItem(ctx._cachedItems, tab.url || '') : null;

  /* Close menu synchronously — matches B-055 H-5. */
  ctx._closed++;

  const dispatchSave = () => {
    ctx._dispatched.push({ type: 'tj/promoteTab', payload: { tabId, groupId } });
  };

  if (!existing) {
    dispatchSave();
    return;
  }

  openConfirmDialogStub(
    ctx,
    { title: tab?.title || tab?.url || 'this tab' },
    dispatchSave,
    {
      heading: 'URL already saved',
      body:
        'This URL is already saved as "' + existing.title + '" in ' +
        groupLabelForItem(ctx._cachedGroups, existing) + '. Save another copy?',
      confirmLabel: 'Save anyway',
      variant: 'primary',
      triggerEl: row,
    },
  );
}

/* Reproduces the tabIds branch of `_bulkMoveToGroup` added by B-059. */
function bulkSaveHandler(ctx, tabIds, groupId) {
  const duplicates = [];
  for (const tabId of tabIds) {
    const tab = ctx._cachedOpenTabsById.get(tabId);
    if (!tab) continue;
    const existing = findDuplicateSavedItem(ctx._cachedItems, tab.url || '');
    if (existing) duplicates.push({ tabId, existing });
  }

  const proceed = () => {
    for (const tabId of tabIds) {
      ctx._dispatched.push({ type: 'tj/promoteTab', payload: { tabId, groupId } });
    }
  };

  if (duplicates.length === 0) {
    proceed();
    return;
  }

  openConfirmDialogStub(
    ctx,
    { title: tabIds.length + ' tabs' },
    proceed,
    {
      heading: duplicates.length + ' of ' + tabIds.length + ' tabs already saved',
      body:
        duplicates.length + ' of the ' + tabIds.length +
        ' selected tabs have URLs that are already saved. ' +
        'Saving will create additional copies alongside the existing ones.',
      confirmLabel: 'Save all ' + tabIds.length,
      variant: 'primary',
    },
  );
}

/* =========================================================================
   T-1 — Single-tab save, no duplicate
   ========================================================================= */

test('B-059 T-1: single-tab save with no matching saved item dispatches directly (no dialog)', () => {
  const ctx = makeCtx({
    items: [{ id: 'i1', title: 'Existing', url: 'https://already-saved.com', groupId: null }],
    openTabs: [{ tabId: 42, url: 'https://brand-new.com', title: 'Brand New' }],
  });

  singleTabSaveHandler(ctx, 42, null, { /* row */ });

  assert.equal(ctx._pendingDialog, null, 'no dialog must be shown for a unique URL');
  assert.equal(ctx._dispatched.length, 1, 'MSG_PROMOTE_TAB must be dispatched directly');
  assert.equal(ctx._dispatched[0].payload.tabId, 42);
  assert.equal(ctx._closed, 1, 'context menu closes synchronously');
});

/* =========================================================================
   T-2 — Single-tab save, duplicate present, user confirms
   ========================================================================= */

test('B-059 T-2: single-tab save with duplicate shows dialog; confirming dispatches promote', () => {
  const ctx = makeCtx({
    groups: [{ id: 'g1', name: 'Work' }],
    items: [{ id: 'i1', title: 'My Saved Page', url: 'https://example.com', groupId: 'g1' }],
    openTabs: [{ tabId: 7, url: 'https://example.com', title: 'Example' }],
  });
  const row = {};

  singleTabSaveHandler(ctx, 7, 'g1', row);

  /* Dialog shown with correct copy + variant. */
  assert.ok(ctx._pendingDialog, 'duplicate URL must surface a confirm dialog');
  assert.equal(ctx._pendingDialog.opts.heading, 'URL already saved');
  assert.ok(
    ctx._pendingDialog.opts.body.includes('My Saved Page'),
    'body must cite the existing item title',
  );
  assert.ok(
    ctx._pendingDialog.opts.body.includes('Work'),
    'body must cite the existing group label',
  );
  assert.equal(ctx._pendingDialog.opts.confirmLabel, 'Save anyway');
  assert.equal(ctx._pendingDialog.opts.variant, 'primary');
  assert.equal(ctx._pendingDialog.opts.triggerEl, row, 'triggerEl must be the Open-Tabs row');
  assert.equal(ctx._dispatched.length, 0, 'no promote until user confirms');

  /* User confirms. */
  ctx._pendingDialog.onConfirm();
  assert.equal(ctx._dispatched.length, 1);
  assert.equal(ctx._dispatched[0].payload.tabId, 7);
  assert.equal(ctx._dispatched[0].payload.groupId, 'g1');
});

test('B-059 T-2: duplicate without a groupId reports "Ungrouped"', () => {
  const ctx = makeCtx({
    items: [{ id: 'i1', title: 'Loose', url: 'https://example.com', groupId: null }],
    openTabs: [{ tabId: 7, url: 'https://example.com', title: 'Example' }],
  });

  singleTabSaveHandler(ctx, 7, null, {});

  assert.ok(ctx._pendingDialog);
  assert.ok(
    ctx._pendingDialog.opts.body.includes('Ungrouped'),
    'body must say "Ungrouped" when the existing item has no group',
  );
});

test('B-059 T-2: duplicate with a groupId that no longer exists in cache falls back to "Ungrouped"', () => {
  const ctx = makeCtx({
    groups: [], /* group deleted between list and action */
    items: [{ id: 'i1', title: 'Orphan', url: 'https://example.com', groupId: 'deleted-group' }],
    openTabs: [{ tabId: 7, url: 'https://example.com', title: 'Example' }],
  });

  singleTabSaveHandler(ctx, 7, null, {});

  assert.ok(ctx._pendingDialog);
  assert.ok(ctx._pendingDialog.opts.body.includes('Ungrouped'));
});

/* =========================================================================
   T-8 — URL fragment-stripping boundary (SOLUTION_DESIGN §29.8)

   `safeNormalizeForMatch` strips fragments when comparing URLs, so two tabs
   differing only by fragment are treated as duplicates. This mirrors every
   other match path in the codebase (drift, claims, floating-groups). If PM
   ever revisits, the fix lives in `shared/url.js` (new `forDuplicateCheck`
   normalizer mode) — out of scope for B-059.
   ========================================================================= */

test('B-059 T-8: URLs differing only by fragment are considered duplicates', () => {
  const ctx = makeCtx({
    groups: [{ id: 'g1', name: 'Docs' }],
    items: [
      { id: 'i1', title: 'Doc §A', url: 'https://example.com/page#section-a', groupId: 'g1' },
    ],
    openTabs: [
      { tabId: 9, url: 'https://example.com/page#section-b', title: 'Doc §B' },
    ],
  });

  singleTabSaveHandler(ctx, 9, 'g1', {});

  assert.ok(
    ctx._pendingDialog,
    'tab URL differing only by fragment must be flagged as a duplicate ' +
      '(safeNormalizeForMatch strips fragments — consistent with drift/claims)',
  );
  assert.equal(ctx._pendingDialog.opts.heading, 'URL already saved');
  assert.ok(ctx._pendingDialog.opts.body.includes('Doc §A'));
});

test('B-059 T-8: URLs differing only by trailing slash are considered duplicates', () => {
  /* Covers the other axis of `safeNormalizeForMatch` canonicalization. */
  const ctx = makeCtx({
    items: [
      { id: 'i1', title: 'Saved', url: 'https://example.com/path/', groupId: null },
    ],
    openTabs: [
      { tabId: 10, url: 'https://example.com/path', title: 'Open' },
    ],
  });

  singleTabSaveHandler(ctx, 10, null, {});

  assert.ok(ctx._pendingDialog, 'trailing-slash variant must be flagged as duplicate');
});

test('B-059 T-8: URLs differing by path are NOT considered duplicates', () => {
  /* Negative case — make sure fragment-stripping does not over-match. */
  const ctx = makeCtx({
    items: [
      { id: 'i1', title: 'Saved', url: 'https://example.com/foo', groupId: null },
    ],
    openTabs: [
      { tabId: 11, url: 'https://example.com/bar', title: 'Open' },
    ],
  });

  singleTabSaveHandler(ctx, 11, null, {});

  assert.equal(
    ctx._pendingDialog,
    null,
    'different paths must NOT be flagged as duplicates (regression guard)',
  );
});

/* =========================================================================
   T-3 — Single-tab save, duplicate present, user cancels
   ========================================================================= */

test('B-059 T-3: single-tab save with duplicate and user cancel dispatches nothing', () => {
  const ctx = makeCtx({
    items: [{ id: 'i1', title: 'Existing', url: 'https://example.com', groupId: null }],
    openTabs: [{ tabId: 7, url: 'https://example.com', title: 'Example' }],
  });

  singleTabSaveHandler(ctx, 7, null, {});

  assert.ok(ctx._pendingDialog);
  /* Cancel simulated by NOT calling onConfirm and clearing the pending dialog. */
  ctx._pendingDialog = null;
  assert.equal(ctx._dispatched.length, 0, 'no promote after cancel');
});

/* =========================================================================
   T-4 — Bulk save, no duplicates
   ========================================================================= */

test('B-059 T-4: bulk save with no duplicates proceeds without a dialog', () => {
  const ctx = makeCtx({
    items: [],
    openTabs: [
      { tabId: 1, url: 'https://a.com', title: 'A' },
      { tabId: 2, url: 'https://b.com', title: 'B' },
      { tabId: 3, url: 'https://c.com', title: 'C' },
    ],
  });

  bulkSaveHandler(ctx, [1, 2, 3], 'g1');

  assert.equal(ctx._pendingDialog, null, 'no dialog when all URLs are unique');
  assert.equal(ctx._dispatched.length, 3);
  assert.deepEqual(
    ctx._dispatched.map((d) => d.payload.tabId).sort(),
    [1, 2, 3],
  );
});

/* =========================================================================
   T-5 — Bulk save, mixed duplicates + unique
   ========================================================================= */

test('B-059 T-5: bulk save with mixed duplicates shows aggregate dialog; confirm dispatches ALL tabs', () => {
  const ctx = makeCtx({
    items: [
      { id: 'i1', title: 'Dup A', url: 'https://a.com', groupId: null },
      { id: 'i2', title: 'Dup B', url: 'https://b.com', groupId: null },
    ],
    openTabs: [
      { tabId: 1, url: 'https://a.com', title: 'A' },          /* duplicate */
      { tabId: 2, url: 'https://b.com', title: 'B' },          /* duplicate */
      { tabId: 3, url: 'https://c.com', title: 'C' },          /* new */
      { tabId: 4, url: 'https://d.com', title: 'D' },          /* new */
      { tabId: 5, url: 'https://e.com', title: 'E' },          /* new */
    ],
  });

  bulkSaveHandler(ctx, [1, 2, 3, 4, 5], null);

  assert.ok(ctx._pendingDialog, 'aggregate dialog must be shown when any duplicate is present');
  assert.equal(ctx._pendingDialog.opts.heading, '2 of 5 tabs already saved');
  assert.equal(ctx._pendingDialog.opts.confirmLabel, 'Save all 5');
  assert.equal(ctx._pendingDialog.opts.variant, 'primary');
  assert.equal(ctx._dispatched.length, 0, 'nothing fires until the user confirms');

  ctx._pendingDialog.onConfirm();
  assert.equal(ctx._dispatched.length, 5, 'Save-all dispatches every tab, duplicates included');
  assert.deepEqual(
    ctx._dispatched.map((d) => d.payload.tabId).sort((a, b) => a - b),
    [1, 2, 3, 4, 5],
  );
});

/* =========================================================================
   T-6 — Bulk save, all duplicates, user cancels
   ========================================================================= */

test('B-059 T-6: bulk save with all duplicates and user cancel dispatches nothing', () => {
  const ctx = makeCtx({
    items: [
      { id: 'i1', title: 'A', url: 'https://a.com', groupId: null },
      { id: 'i2', title: 'B', url: 'https://b.com', groupId: null },
      { id: 'i3', title: 'C', url: 'https://c.com', groupId: null },
    ],
    openTabs: [
      { tabId: 1, url: 'https://a.com', title: 'A' },
      { tabId: 2, url: 'https://b.com', title: 'B' },
      { tabId: 3, url: 'https://c.com', title: 'C' },
    ],
  });

  bulkSaveHandler(ctx, [1, 2, 3], 'g1');

  assert.ok(ctx._pendingDialog);
  assert.equal(ctx._pendingDialog.opts.heading, '3 of 3 tabs already saved');
  assert.equal(ctx._pendingDialog.opts.confirmLabel, 'Save all 3');

  /* Cancel = never call onConfirm. */
  ctx._pendingDialog = null;
  assert.equal(ctx._dispatched.length, 0);
});

/* =========================================================================
   T-10 — _findDuplicateSavedItem guards against unparseable URLs
   ========================================================================= */

test('B-059 T-10: _findDuplicateSavedItem returns null for an empty URL even if cache has a broken entry', () => {
  /* safeNormalizeForMatch('') returns ''. Two empty-string normalizations are
     equal, so WITHOUT the early-return guard an empty URL would match another
     unparseable cached URL. The guard is what keeps this case safe. */
  const cachedItems = [{ id: 'i1', title: 'Broken', url: '', groupId: null }];
  assert.equal(findDuplicateSavedItem(cachedItems, ''), null);
  assert.equal(findDuplicateSavedItem(cachedItems, 'not a url'), null);
});

test('B-059 T-10: _findDuplicateSavedItem returns null when url is falsy', () => {
  assert.equal(findDuplicateSavedItem([], null), null);
  assert.equal(findDuplicateSavedItem([], undefined), null);
});

test('B-059 T-10: cache-staleness tolerance — no dialog when tab is missing from openTabs cache', () => {
  /* Single-tab save path pre-reads _cachedOpenTabsById. If the tab is missing
     (e.g., closed mid-refresh) the handler must not crash and must dispatch
     directly — the SW will then return ERR_NOT_FOUND which the catch branch
     surfaces as a toast. This mirrors the "no tab" defensive path. */
  const ctx = makeCtx({
    items: [{ id: 'i1', title: 'Existing', url: 'https://example.com', groupId: null }],
    openTabs: [], /* tabId 99 is not in the cache */
  });

  singleTabSaveHandler(ctx, 99, null, {});

  assert.equal(ctx._pendingDialog, null, 'no dialog when tab is missing from cache');
  assert.equal(ctx._dispatched.length, 1, 'dispatch must still happen — SW handles the miss');
  assert.equal(ctx._closed, 1);
});
