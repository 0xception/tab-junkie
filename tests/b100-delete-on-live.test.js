/**
 * b100-delete-on-live.test.js — Sprint 35 / B-100 R5 (AC8)
 *
 * Sprint 35 ships the Delete-on-live UX redesign: the X-button on a LIVE
 * row now closes the tab and preserves the bookmark (AC1) instead of
 * silently demoting + destroying the bookmark. Bookmark deletion becomes a
 * deliberate context-menu action ("Delete bookmark") with toast+Undo guard
 * (AC3-AC5). The non-live X-button retains its modal-confirm path (AC2).
 * The Delete and Backspace keys mirror the X-button on focused rows (AC7).
 *
 * The post-R3-fix code introduces a shared `_dispatchRowDelete(row, itemId,
 * triggerEl)` helper at `sidepanel/sidepanel.js:3456` so the X-button click
 * branch and the keydown Delete branch stay in lockstep on AC1/AC2 (R4 H-1).
 *
 * The 10 tests below cover the AC8 contract + R4 deferred MEDIUMs:
 *
 *   T1 — AC1: live X-button → MSG_CLOSE_TABS, NOT MSG_DEMOTE_ITEM /
 *        MSG_DELETE_ITEM. Bookmark survives.
 *   T2 — AC2: non-live X-button → MSG_GET_ITEM → openConfirmDialog →
 *        MSG_DELETE_ITEM (modal path retained verbatim).
 *   T3 — AC3+AC4: context-menu "Delete bookmark" entry dispatches
 *        MSG_DEMOTE_ITEM (live) / MSG_DELETE_ITEM (non-live), then shows
 *        the toast with the "Undo" affordance.
 *   T4 — AC5: Undo callback dispatches MSG_CREATE_ITEM with EXACTLY
 *        `{ title, url, groupId }` — D-2 storage-contract correction
 *        (id/sortOrder/createdAt are NOT caller-controllable).
 *   T5 — AC7: Delete key on focused row mirrors X-button. Backspace too.
 *        Input-context guard: Delete inside an INPUT/TEXTAREA/SELECT/
 *        contenteditable does NOT dispatch.
 *   T6 — R4 H-2: Undo on a deleted-group ERR_NOT_FOUND falls back to
 *        `{ ...captured, groupId: null }` and shows recovery toast.
 *   T7 — R4 M-2 deferred: delete-then-fail-then-Undo creates a duplicate.
 *        D-6 acknowledges this as a known acceptable cost — the Undo path
 *        is best-effort. This test is a regression GUARD documenting the
 *        current behavior (Undo fires regardless of delete outcome).
 *   T8 — R4 M-3 deferred: keydown Delete uses `e.target.closest('.item-row')`
 *        for row resolution, BUT the input-context guard reads
 *        `document.activeElement?.tagName`. Test the case where they
 *        diverge (programmatic focus on a row while e.target is the
 *        document body) — the resolved row should match what the
 *        X-button would do (B-100 implementation chose `e.target.closest`
 *        per R3-fix M-3 status: documented divergence, not changed).
 *   T9 — AC6 regression: bulk action bar Remove path is untouched —
 *        no change to `removeMany` / multi-select removal flow shape.
 *   T10 — Helper-extraction regression guard: `_dispatchRowDelete` exists
 *         exactly once in the source; only ONE direct MSG_CLOSE_TABS call
 *         site in the row-delete code path (the helper itself).
 *
 * Strategy: like `tests/b101-drift-bar.test.js` and `tests/b048-visual-states.test.js`,
 * the sidepanel module runs DOM queries at load-time and cannot be imported
 * in Node. The tests reproduce the post-R3-fix `_dispatchRowDelete` helper
 * + the keydown Delete branch + the context-menu "Delete bookmark" handler
 * verbatim against a minimal DOM shim. The chrome-mock is reused for the
 * actual SW round-trip on T2's modal path; other tests use a local
 * sendMessage spy because the dispatch shapes are the only contract under
 * test (the SW handlers themselves are tested by other suites — e.g.
 * `tests/b099-drift-fix.test.js` covers MSG_DEMOTE_ITEM + MSG_DELETE_ITEM
 * SW handlers; `tests/b026-context-menu.test.js` covers the context-menu
 * structure).
 *
 * T2 in particular only asserts a fragment of the modal flow (the
 * MSG_GET_ITEM dispatch + openConfirmDialog signature) because the modal
 * UI is not reachable from a Node DOM shim. The corresponding UAT-2 in
 * `docs/UAT_B-100.md` covers the full modal flow against the loaded
 * extension.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  MSG_CLOSE_TABS,
  MSG_DEMOTE_ITEM,
  MSG_DELETE_ITEM,
  MSG_GET_ITEM,
  MSG_CREATE_ITEM,
} from '../shared/messages.js';

/* =========================================================================
   Minimal DOM shim — covers the IDL surfaces touched by the post-R3-fix
   delete handlers. Mirrors the strategy in `tests/b101-drift-bar.test.js`.
   ========================================================================= */

function createElement(tag) {
  const children = [];
  const attrs = {};
  const dataset = {};
  const el = {
    tagName: tag.toUpperCase(),
    className: '',
    isConnected: true,
    parentNode: null,
    hidden: false,
    title: '',
    dataset,
    isContentEditable: false,
    get children() { return children; },
    get firstChild() { return children[0] ?? null; },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return attrs[k] ?? null; },
    removeAttribute(k) { delete attrs[k]; },
    appendChild(child) {
      child.parentNode = el;
      children.push(child);
      return child;
    },
    closest(sel) {
      const cls = sel.startsWith('.') ? sel.slice(1) : null;
      if (!cls) return null;
      let cur = el;
      while (cur) {
        if (cur.className === cls) return cur;
        cur = cur.parentNode;
      }
      return null;
    },
    querySelector() { return null; },
    focus() { /* no-op */ },
  };
  return el;
}

function createRow({ itemId, live }) {
  const row = createElement('div');
  row.className = 'item-row';
  row.dataset.itemId = itemId;
  row.dataset.live = live ? 'true' : 'false';
  return row;
}

/* =========================================================================
   Test harness — a per-test scratch object that captures sendMessage calls,
   showToast invocations, and openConfirmDialog parameters.

   The reproduced helpers below close over the harness via parameter, so the
   helper text matches the post-R3-fix sidepanel.js exactly modulo the
   bound dependencies (sendMessage, showToast, openConfirmDialog,
   _cachedLiveStates).
   ========================================================================= */

function makeHarness({ liveStates = {}, getItemImpl, createItemImpl } = {}) {
  const messages = [];
  const toasts = [];
  const confirmCalls = [];
  let pendingResolve = null;

  /* sendMessage spy — returns a Promise per the production contract.
     getItem and createItem dispatches are dispatched via override impls;
     others resolve immediately. */
  function sendMessage(type, payload) {
    messages.push({ type, payload });
    if (type === MSG_GET_ITEM) {
      if (typeof getItemImpl === 'function') {
        return getItemImpl(payload);
      }
      return Promise.reject(new Error('no getItem impl'));
    }
    if (type === MSG_CREATE_ITEM) {
      if (typeof createItemImpl === 'function') {
        return createItemImpl(payload);
      }
      return Promise.resolve({ id: 'new-ulid' });
    }
    /* MSG_CLOSE_TABS / MSG_DEMOTE_ITEM / MSG_DELETE_ITEM — no payload back. */
    return Promise.resolve(undefined);
  }

  function showToast(message, options) {
    toasts.push({ message, options: options ?? null });
  }

  function openConfirmDialog(item, cb, options) {
    confirmCalls.push({ item, cb, options });
    /* Auto-execute callback on the test's signal — simulates user clicking
       "Delete" in the modal. */
    pendingResolve = cb;
  }

  function executePendingConfirm() {
    if (typeof pendingResolve === 'function') {
      const cb = pendingResolve;
      pendingResolve = null;
      cb();
    }
  }

  return {
    messages,
    toasts,
    confirmCalls,
    liveStates,
    sendMessage,
    showToast,
    openConfirmDialog,
    executePendingConfirm,
  };
}

/* =========================================================================
   Reproduced helpers — match `sidepanel/sidepanel.js` post-R3-fix verbatim.

   `_dispatchRowDelete` mirrors lines 3456-3480.
   The keydown Delete branch mirrors lines 3638-3649.
   The context-menu "Delete bookmark" handler mirrors lines 6224-6281.
   ========================================================================= */

function _dispatchRowDelete(row, itemId, triggerEl, h) {
  /* AC1: live X-button closes the tab and preserves the bookmark. */
  if (row.dataset.live === 'true') {
    const liveState = h.liveStates[itemId];
    if (liveState?.live && liveState.tabId != null) {
      h.sendMessage(MSG_CLOSE_TABS, { tabIds: [liveState.tabId] }).catch(() => {
        h.showToast('Couldn\u2019t close tab \u2014 try again');
      });
    }
    return;
  }
  /* AC2: non-live X-button keeps the existing modal-confirm delete path. */
  h.sendMessage(MSG_GET_ITEM, { id: itemId }).then((item) => {
    h.openConfirmDialog(item, () => {
      h.sendMessage(MSG_DELETE_ITEM, { id: itemId }).catch(() => {
        h.showToast('Couldn\u2019t delete bookmark \u2014 try again');
      });
    }, { triggerEl });
  }).catch(() => {
    h.showToast('Couldn\u2019t load bookmark \u2014 try again');
  });
}

/* keydown handler — reproduces the post-R3-fix branch at sidepanel.js:3638. */
function handleKeydown(e, h) {
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  const tag = h.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (h.activeElement?.isContentEditable) return;
  const row = e.target.closest?.('.item-row');
  if (!row) return;
  const itemId = row.dataset.itemId;
  if (!itemId) return;
  e.preventDefault();
  _dispatchRowDelete(row, itemId, row, h);
}

/* Context-menu "Delete bookmark" click handler — mirrors sidepanel.js:6224. */
function handleContextMenuDelete(itemId, h) {
  const liveNow = !!h.liveStates[itemId]?.live;
  return h.sendMessage(MSG_GET_ITEM, { id: itemId }).then((item) => {
    if (!item) {
      h.showToast('Couldn\u2019t delete bookmark \u2014 try again');
      return;
    }
    const captured = { title: item.title, url: item.url, groupId: item.groupId ?? null };
    const deleteMessage = liveNow ? MSG_DEMOTE_ITEM : MSG_DELETE_ITEM;
    const deletePayload = liveNow ? { itemId } : { id: itemId };
    h.sendMessage(deleteMessage, deletePayload).catch(() => {
      h.showToast('Couldn\u2019t delete bookmark \u2014 try again');
    });
    h.showToast('Bookmark deleted', {
      undoLabel: 'Undo',
      onUndo: () => {
        /* H-2: ERR_NOT_FOUND on captured groupId → fallback to Ungrouped. */
        h.sendMessage(MSG_CREATE_ITEM, captured).catch((err) => {
          if (err?.code === 'ERR_NOT_FOUND' && captured.groupId != null) {
            h.sendMessage(MSG_CREATE_ITEM, { ...captured, groupId: null }).then(() => {
              h.showToast('Bookmark restored to Ungrouped (original group was deleted)');
            }).catch(() => {
              h.showToast('Couldn\u2019t restore bookmark \u2014 try again');
            });
          } else {
            h.showToast('Couldn\u2019t restore bookmark \u2014 try again');
          }
        });
      },
    });
  }).catch(() => {
    h.showToast('Couldn\u2019t delete bookmark \u2014 try again');
  });
}

/* =========================================================================
   T1 — AC1: live X-button closes the tab via MSG_CLOSE_TABS
   ========================================================================= */
test('B-100 T1 (AC1): live X-button → MSG_CLOSE_TABS with correct tabIds; NOT MSG_DEMOTE_ITEM/MSG_DELETE_ITEM', () => {
  const h = makeHarness({
    liveStates: { 'item-1': { live: true, tabId: 42 } },
  });
  const row = createRow({ itemId: 'item-1', live: true });
  const btn = createElement('button');
  btn.parentNode = row; /* X-button is inside the row */

  _dispatchRowDelete(row, 'item-1', btn, h);

  assert.equal(h.messages.length, 1, 'exactly one SW message dispatched on live X-button');
  assert.equal(h.messages[0].type, MSG_CLOSE_TABS, 'message type is MSG_CLOSE_TABS');
  assert.deepEqual(h.messages[0].payload, { tabIds: [42] },
    'tabIds payload matches liveState.tabId');

  /* Negative assertions — neither destructive bookmark message must fire. */
  const types = h.messages.map((m) => m.type);
  assert.ok(!types.includes(MSG_DEMOTE_ITEM),
    'AC1: live X-button must NOT dispatch MSG_DEMOTE_ITEM (the original B-100 bug)');
  assert.ok(!types.includes(MSG_DELETE_ITEM),
    'AC1: live X-button must NOT dispatch MSG_DELETE_ITEM');
  assert.equal(h.toasts.length, 0, 'AC1: no toast on live X-button success path');
});

test('B-100 T1b (AC1): live X-button with broadcast race (liveState.live=false) → silent no-op', () => {
  /* B-026 H-1 re-read pattern — between menu-open/keydown and click, the
     tab may have closed. The helper guards on `liveState?.live` and
     `liveState.tabId != null`. */
  const h = makeHarness({
    liveStates: { 'item-1b': { live: false, tabId: null } },
  });
  const row = createRow({ itemId: 'item-1b', live: true });

  _dispatchRowDelete(row, 'item-1b', row, h);

  assert.equal(h.messages.length, 0, 'broadcast race → silent no-op (no message dispatched)');
  assert.equal(h.toasts.length, 0, 'no toast');
});

/* =========================================================================
   T2 — AC2: non-live X-button retains modal+delete path
   ========================================================================= */
test('B-100 T2 (AC2): non-live X-button → MSG_GET_ITEM → openConfirmDialog → MSG_DELETE_ITEM on confirm', async () => {
  const item = { id: 'item-2', title: 'Saved', url: 'https://example.com/2', groupId: null };
  const h = makeHarness({
    liveStates: {}, /* not live */
    getItemImpl: () => Promise.resolve(item),
  });
  const row = createRow({ itemId: 'item-2', live: false });
  const btn = createElement('button');
  btn.parentNode = row;

  _dispatchRowDelete(row, 'item-2', btn, h);

  /* Drain microtasks so the .then(item => openConfirmDialog) runs. */
  await new Promise((r) => setImmediate(r));

  /* GET fired first. */
  assert.equal(h.messages[0].type, MSG_GET_ITEM,
    'AC2: MSG_GET_ITEM is the first message dispatched on the non-live path');
  assert.deepEqual(h.messages[0].payload, { id: 'item-2' });

  /* openConfirmDialog opened with the fetched item + triggerEl option. */
  assert.equal(h.confirmCalls.length, 1, 'AC2: openConfirmDialog called exactly once');
  assert.deepEqual(h.confirmCalls[0].item, item, 'modal opened with fetched item');
  assert.equal(h.confirmCalls[0].options.triggerEl, btn,
    'triggerEl option carries the X-button for focus restoration');

  /* User confirms → MSG_DELETE_ITEM dispatched. */
  h.executePendingConfirm();
  await new Promise((r) => setImmediate(r));

  const deleteMsg = h.messages.find((m) => m.type === MSG_DELETE_ITEM);
  assert.ok(deleteMsg, 'AC2: MSG_DELETE_ITEM dispatched on confirm');
  assert.deepEqual(deleteMsg.payload, { id: 'item-2' });

  /* AC1 negative — non-live path must NOT use MSG_CLOSE_TABS or MSG_DEMOTE_ITEM. */
  const types = h.messages.map((m) => m.type);
  assert.ok(!types.includes(MSG_CLOSE_TABS),
    'AC2: non-live X-button must NOT dispatch MSG_CLOSE_TABS');
  assert.ok(!types.includes(MSG_DEMOTE_ITEM),
    'AC2: non-live X-button must NOT dispatch MSG_DEMOTE_ITEM');
});

/* =========================================================================
   T3 — AC3+AC4: context-menu "Delete bookmark" toast+Undo path
   ========================================================================= */
test('B-100 T3 (AC3+AC4): context-menu "Delete bookmark" on live row → MSG_DEMOTE_ITEM + toast with Undo', async () => {
  const item = { id: 'item-3', title: 'Live Item', url: 'https://example.com/3', groupId: 'g-1' };
  const h = makeHarness({
    liveStates: { 'item-3': { live: true, tabId: 99 } },
    getItemImpl: () => Promise.resolve(item),
  });

  await handleContextMenuDelete('item-3', h);

  /* GET captured the item, then DEMOTE was dispatched (live branch). */
  const getCall = h.messages.find((m) => m.type === MSG_GET_ITEM);
  assert.ok(getCall, 'D-6: MSG_GET_ITEM fires first to capture the snapshot');

  const demoteCall = h.messages.find((m) => m.type === MSG_DEMOTE_ITEM);
  assert.ok(demoteCall, 'AC3: MSG_DEMOTE_ITEM dispatched for live context-menu delete');
  assert.deepEqual(demoteCall.payload, { itemId: 'item-3' });

  /* Toast appeared with the Undo affordance. */
  const undoToast = h.toasts.find((t) => t.message === 'Bookmark deleted');
  assert.ok(undoToast, 'AC4: "Bookmark deleted" toast shown');
  assert.equal(undoToast.options.undoLabel, 'Undo', 'AC4: Undo label present');
  assert.equal(typeof undoToast.options.onUndo, 'function', 'AC4: onUndo callback wired');
});

test('B-100 T3b (AC3+AC4): context-menu "Delete bookmark" on non-live row → MSG_DELETE_ITEM + toast with Undo', async () => {
  const item = { id: 'item-3b', title: 'Saved', url: 'https://example.com/3b', groupId: null };
  const h = makeHarness({
    liveStates: {}, /* non-live */
    getItemImpl: () => Promise.resolve(item),
  });

  await handleContextMenuDelete('item-3b', h);

  const deleteCall = h.messages.find((m) => m.type === MSG_DELETE_ITEM);
  assert.ok(deleteCall, 'AC3: non-live context-menu → MSG_DELETE_ITEM');
  assert.deepEqual(deleteCall.payload, { id: 'item-3b' });

  /* Negative — must NOT have used the demote path on non-live. */
  const demoteCall = h.messages.find((m) => m.type === MSG_DEMOTE_ITEM);
  assert.equal(demoteCall, undefined, 'non-live row must not use MSG_DEMOTE_ITEM');

  const undoToast = h.toasts.find((t) => t.message === 'Bookmark deleted');
  assert.ok(undoToast, 'AC4: toast also shown on non-live path');
});

/* =========================================================================
   T4 — AC5: Undo callback dispatches MSG_CREATE_ITEM with EXACTLY
   { title, url, groupId } — D-2 storage-contract correction.
   ========================================================================= */
test('B-100 T4 (AC5 / D-2): Undo dispatches MSG_CREATE_ITEM with EXACTLY {title, url, groupId} (no extra fields)', async () => {
  /* Simulate the captured Item including fields validateNewItem would strip
     (id, sortOrder, createdAt, updatedAt). The Undo lambda must NOT smuggle
     any of those into the MSG_CREATE_ITEM payload. */
  const item = {
    id: 'item-4-original-ulid',
    title: 'Restorable',
    url: 'https://example.com/4',
    groupId: 'g-4',
    sortOrder: 5,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };
  const h = makeHarness({
    liveStates: {},
    getItemImpl: () => Promise.resolve(item),
  });

  await handleContextMenuDelete('item-4', h);

  const undoToast = h.toasts.find((t) => t.message === 'Bookmark deleted');
  assert.ok(undoToast?.options?.onUndo, 'precondition: onUndo wired');

  /* Trigger Undo. */
  undoToast.options.onUndo();
  await new Promise((r) => setImmediate(r));

  const createCall = h.messages.find((m) => m.type === MSG_CREATE_ITEM);
  assert.ok(createCall, 'AC5: Undo dispatched MSG_CREATE_ITEM');

  /* The payload must be EXACTLY {title, url, groupId} per D-2. */
  assert.deepEqual(
    createCall.payload,
    { title: 'Restorable', url: 'https://example.com/4', groupId: 'g-4' },
    'AC5/D-2: payload is the three caller-controllable fields only — no id/sortOrder/createdAt smuggling',
  );

  /* Defensive — ensure the captured Item's stripped fields really did NOT
     leak into the payload. */
  const keys = Object.keys(createCall.payload).sort();
  assert.deepEqual(keys, ['groupId', 'title', 'url'],
    'AC5/D-2: payload has exactly three keys');
});

/* =========================================================================
   T5 — AC7: Delete + Backspace mirror X-button; input-context guard works.
   ========================================================================= */
test('B-100 T5 (AC7): Delete keydown on focused live row → MSG_CLOSE_TABS (mirrors X-button)', () => {
  const h = makeHarness({
    liveStates: { 'item-5': { live: true, tabId: 50 } },
    activeElement: null, /* not in input */
  });
  const row = createRow({ itemId: 'item-5', live: true });
  const e = {
    key: 'Delete',
    target: row,
    preventDefault() { this._prevented = true; },
  };

  handleKeydown(e, h);

  assert.equal(e._prevented, true, 'AC7: e.preventDefault() called on the keydown handler');
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].type, MSG_CLOSE_TABS,
    'AC7: keydown Delete on live row → MSG_CLOSE_TABS (same as X-button)');
  assert.deepEqual(h.messages[0].payload, { tabIds: [50] });
});

test('B-100 T5b (AC7): Backspace keydown also fires (macOS Finder/Mail synonym per R2 D-5)', () => {
  const h = makeHarness({
    liveStates: { 'item-5b': { live: true, tabId: 51 } },
  });
  const row = createRow({ itemId: 'item-5b', live: true });
  const e = {
    key: 'Backspace',
    target: row,
    preventDefault() { this._prevented = true; },
  };

  handleKeydown(e, h);

  assert.equal(h.messages[0].type, MSG_CLOSE_TABS,
    'AC7 + R2 D-5: Backspace mirrors Delete on row');
});

test('B-100 T5c (AC7 input-context guard): Delete inside INPUT does NOT dispatch', () => {
  const h = makeHarness({
    liveStates: { 'item-5c': { live: true, tabId: 52 } },
    /* activeElement is an INPUT — typical case is the filter-input. */
  });
  h.activeElement = { tagName: 'INPUT', isContentEditable: false };

  const row = createRow({ itemId: 'item-5c', live: true });
  const e = { key: 'Delete', target: row, preventDefault() { this._prevented = true; } };

  handleKeydown(e, h);

  assert.equal(h.messages.length, 0,
    'AC7: input-context guard must early-return (Delete inside INPUT never deletes the row)');
  assert.notEqual(e._prevented, true, 'preventDefault not called when guard fires');
});

test('B-100 T5d (AC7): TEXTAREA, SELECT, contenteditable are also guarded', () => {
  for (const tag of ['TEXTAREA', 'SELECT']) {
    const h = makeHarness({ liveStates: { 'i': { live: true, tabId: 1 } } });
    h.activeElement = { tagName: tag, isContentEditable: false };
    const row = createRow({ itemId: 'i', live: true });
    handleKeydown({ key: 'Delete', target: row, preventDefault() {} }, h);
    assert.equal(h.messages.length, 0, `AC7: ${tag} guard fires`);
  }
  /* contenteditable */
  const h = makeHarness({ liveStates: { 'i': { live: true, tabId: 1 } } });
  h.activeElement = { tagName: 'DIV', isContentEditable: true };
  const row = createRow({ itemId: 'i', live: true });
  handleKeydown({ key: 'Delete', target: row, preventDefault() {} }, h);
  assert.equal(h.messages.length, 0, 'AC7: contenteditable guard fires');
});

/* =========================================================================
   T6 — R4 H-2: Undo on a deleted-group ERR_NOT_FOUND fallback to Ungrouped.
   ========================================================================= */
test('B-100 T6 (R4 H-2): Undo when original group was deleted → fallback MSG_CREATE_ITEM with groupId:null + recovery toast', async () => {
  const item = { id: 'item-6', title: 'Recoverable', url: 'https://example.com/6', groupId: 'g-deleted' };
  let createCallCount = 0;
  const h = makeHarness({
    liveStates: {},
    getItemImpl: () => Promise.resolve(item),
    createItemImpl: (payload) => {
      createCallCount += 1;
      if (createCallCount === 1) {
        /* First call — group has been deleted, SW returns ERR_NOT_FOUND. */
        const err = new Error('Group not found');
        err.code = 'ERR_NOT_FOUND';
        return Promise.reject(err);
      }
      /* Second call — fallback succeeds. */
      assert.equal(payload.groupId, null,
        'H-2: fallback MSG_CREATE_ITEM uses groupId: null (Ungrouped)');
      return Promise.resolve({ id: 'restored-ulid' });
    },
  });

  await handleContextMenuDelete('item-6', h);
  const undoToast = h.toasts.find((t) => t.message === 'Bookmark deleted');
  assert.ok(undoToast, 'precondition: undo toast');

  undoToast.options.onUndo();
  /* Drain microtasks for both create attempts. */
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  /* Two MSG_CREATE_ITEM dispatches: first failed, second is the fallback. */
  const creates = h.messages.filter((m) => m.type === MSG_CREATE_ITEM);
  assert.equal(creates.length, 2, 'H-2: two MSG_CREATE_ITEM attempts (original + fallback)');
  assert.equal(creates[0].payload.groupId, 'g-deleted', 'first attempt used original groupId');
  assert.equal(creates[1].payload.groupId, null, 'fallback uses groupId: null (Ungrouped)');
  assert.equal(creates[1].payload.title, item.title, 'fallback preserves title');
  assert.equal(creates[1].payload.url, item.url, 'fallback preserves URL');

  /* Recovery toast shown. */
  const recoveryToast = h.toasts.find((t) =>
    t.message === 'Bookmark restored to Ungrouped (original group was deleted)');
  assert.ok(recoveryToast, 'H-2: recovery toast shown after fallback succeeds');
});

test('B-100 T6b (R4 H-2): Undo with non-ERR_NOT_FOUND failure → generic restore-failed toast (no fallback)', async () => {
  const item = { id: 'item-6b', title: 'X', url: 'https://example.com/6b', groupId: 'g-x' };
  const h = makeHarness({
    liveStates: {},
    getItemImpl: () => Promise.resolve(item),
    createItemImpl: () => {
      /* Generic failure — NOT ERR_NOT_FOUND. */
      const err = new Error('Quota exceeded');
      err.code = 'ERR_QUOTA_EXCEEDED';
      return Promise.reject(err);
    },
  });

  await handleContextMenuDelete('item-6b', h);
  h.toasts.find((t) => t.message === 'Bookmark deleted').options.onUndo();
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  /* Only ONE MSG_CREATE_ITEM (the failed attempt) — no fallback. */
  const creates = h.messages.filter((m) => m.type === MSG_CREATE_ITEM);
  assert.equal(creates.length, 1, 'no fallback on non-ERR_NOT_FOUND failures');

  /* Generic restore-failed toast. */
  const failToast = h.toasts.find((t) => t.message === 'Couldn\u2019t restore bookmark \u2014 try again');
  assert.ok(failToast, 'generic restore-failed toast shown on quota errors etc.');
});

/* =========================================================================
   T7 — R4 M-2 deferred: delete-then-fail-then-Undo creates a duplicate.
   This is the documented R2 D-6 known-acceptable-cost. The R3-fix did NOT
   add a deleteOk guard; this test is a regression GUARD.
   ========================================================================= */
test('B-100 T7 (R4 M-2 deferred): delete dispatch fails + Undo clicked → duplicate created (R2 D-6 known cost)', async () => {
  const item = { id: 'item-7', title: 'Dup', url: 'https://example.com/7', groupId: null };
  const h = makeHarness({
    liveStates: {},
    getItemImpl: () => Promise.resolve(item),
  });
  /* Override sendMessage to make MSG_DELETE_ITEM reject. */
  const origSend = h.sendMessage;
  h.sendMessage = function (type, payload) {
    if (type === MSG_DELETE_ITEM) {
      h.messages.push({ type, payload });
      return Promise.reject(new Error('SW delete failed'));
    }
    return origSend(type, payload);
  };

  await handleContextMenuDelete('item-7', h);
  await new Promise((r) => setImmediate(r));

  /* The R3-fix does not guard the Undo against delete failure — by design
     per R2 D-6. The Undo lambda still fires MSG_CREATE_ITEM unconditionally.
     This is a regression guard documenting the current behavior. If a future
     sprint adds a deleteOk gate, this test will need updating + the
     "known acceptable cost" note in §49.3 D-6 will need rewording. */
  const undoToast = h.toasts.find((t) => t.message === 'Bookmark deleted');
  assert.ok(undoToast, 'toast still appears even when delete will fail (fire-and-forget)');

  undoToast.options.onUndo();
  await new Promise((r) => setImmediate(r));

  const creates = h.messages.filter((m) => m.type === MSG_CREATE_ITEM);
  assert.equal(creates.length, 1,
    'M-2 / R2 D-6: Undo creates a bookmark even when delete failed → duplicate. ' +
    'Documented acceptable cost; not a data-loss state. If a deleteOk guard ' +
    'is added in the future, this test must be updated.');
});

/* =========================================================================
   T8 — R4 M-3 deferred: programmatic-focus divergence. The R3-fix opted to
   keep `e.target.closest('.item-row')` for row resolution (NOT switch to
   document.activeElement?.closest). This test documents the chosen behavior
   AND verifies the input-context guard reads activeElement.tagName so the
   two paths can diverge by design.
   ========================================================================= */
test('B-100 T8 (R4 M-3 deferred): keydown row resolution uses e.target.closest while input guard uses activeElement (documented divergence)', () => {
  /* Programmatic focus: e.target is the document body / outer container,
     activeElement is a row that was focused by .focus() programmatically.
     Per the R3-fix, the chosen behavior is to resolve the row via
     `e.target.closest('.item-row')` — so this divergence means the keydown
     branch will NOT delete the programmatically-focused row when e.target
     is outside any row. The input-context guard, by contrast, reads
     activeElement so user-typed Delete in a focused INPUT is still guarded. */

  /* Case A: e.target on a row, activeElement on a DIFFERENT element (e.g. body).
     Row IS resolved → dispatch fires. */
  const h = makeHarness({
    liveStates: { 'item-8': { live: true, tabId: 80 } },
  });
  h.activeElement = { tagName: 'BODY', isContentEditable: false };
  const row = createRow({ itemId: 'item-8', live: true });
  const e1 = { key: 'Delete', target: row, preventDefault() {} };
  handleKeydown(e1, h);
  assert.equal(h.messages.length, 1, 'M-3: e.target.closest resolves the row → dispatch fires');
  assert.equal(h.messages[0].type, MSG_CLOSE_TABS);

  /* Case B: e.target outside any row but activeElement IS a programmatically-
     focused row. Per R3-fix decision: row is NOT resolved (e.target.closest
     returns null). No dispatch. This documents the M-3 deferred behavior. */
  const h2 = makeHarness({
    liveStates: { 'item-8b': { live: true, tabId: 81 } },
  });
  const focusedRow = createRow({ itemId: 'item-8b', live: true });
  h2.activeElement = focusedRow; /* programmatic focus */
  const outerEl = createElement('div'); /* outside any .item-row */
  outerEl.className = 'sidepanel-shell';
  const e2 = { key: 'Delete', target: outerEl, preventDefault() {} };
  handleKeydown(e2, h2);

  /* M-3 documented behavior: e.target.closest('.item-row') returns null when
     e.target is outside any row, even if activeElement is a row. The keydown
     branch early-returns — no dispatch. R6 [solution-architect] As-Built
     should note this as a deliberate R3-fix M-3 deferral (no fix applied;
     test is a regression guard for the chosen behavior). */
  assert.equal(h2.messages.length, 0,
    'M-3 deferred: e.target.closest is the source of truth for row resolution; ' +
    'programmatic focus on a row without e.target inside it does NOT dispatch.');
});

/* =========================================================================
   T9 — AC6 regression: bulk action bar Remove path is untouched.
   ========================================================================= */
test('B-100 T9 (AC6 regression): bulk action bar Remove path is structurally unchanged by B-100', () => {
  /* B-100 must NOT touch the bulk-removal flow at sidepanel.js:5213-5232,
     5409-5460, 5545-5570, 5678-5710. We assert this structurally by
     reading the source file and confirming the AC6 sentinel anchor lines
     still exist. (This is the same regression-guard pattern used by
     T10 below for the helper-extraction guard.) */
  const here = dirname(fileURLToPath(import.meta.url));
  const sidepanelPath = resolve(here, '..', 'sidepanel', 'sidepanel.js');
  const src = readFileSync(sidepanelPath, 'utf8');

  /* The bulk Remove flow uses MSG_BULK_DELETE_ITEMS for non-live items
     and MSG_DEMOTE_ITEM for live items (see _bulkRemove at sidepanel.js:5280).
     B-100 must not have gutted either symbol from the bulk-action surface. */
  assert.ok(
    /MSG_BULK_DELETE_ITEMS/.test(src),
    'AC6: bulk-action MSG_BULK_DELETE_ITEMS still present (bulk Remove flow not gutted)',
  );
  assert.ok(
    /function\s+_bulkRemove\s*\(/.test(src),
    'AC6: _bulkRemove function still present (bulk Remove flow handler intact)',
  );
  /* The renamed context-menu entry uses `textContent = 'Delete bookmark'`.
     This must appear in the source EXACTLY ONCE — guards against the AC3
     rename leaking into other surfaces (bulk action bar, dialog text, etc.).
     Note: the X-button's aria-label "Delete bookmark" at sidepanel.js:2475
     is pre-existing (predates B-100; flagged as R4 M-4 deferred follow-up
     for reactive aria-label flip). The B-100 textContent rename is the only
     new occurrence and must remain unique to the context-menu entry. */
  const textContentMatches = src.match(/textContent\s*=\s*['"]Delete bookmark['"]/g) ?? [];
  assert.equal(textContentMatches.length, 1,
    'AC3: textContent = "Delete bookmark" appears exactly once (the context-menu entry). ' +
    `Found ${textContentMatches.length} occurrences — bulk-action surface or another menu may have been touched.`);
  /* M-4 acknowledgement: the pre-existing aria-label "Delete bookmark" at
     line ~2475 stays put — it predates B-100 and is tracked as a follow-up
     (flip to "Close tab" on live state) per R4 [qa-reviewer] M-4. */
  const ariaLabelMatches = src.match(/aria-label['"\s,]+['"]Delete bookmark['"]/g) ?? [];
  assert.equal(ariaLabelMatches.length, 1,
    'M-4: pre-existing X-button aria-label "Delete bookmark" still present (one occurrence; ' +
    'reactive flip is the deferred follow-up).');
});

/* =========================================================================
   T10 — Helper-extraction regression guard (R4 H-1):
   _dispatchRowDelete exists; MSG_CLOSE_TABS only appears once in the
   row-delete code path (the helper itself).
   ========================================================================= */
test('B-100 T10 (R4 H-1 regression): _dispatchRowDelete helper exists; row-delete MSG_CLOSE_TABS not duplicated', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sidepanelPath = resolve(here, '..', 'sidepanel', 'sidepanel.js');
  const src = readFileSync(sidepanelPath, 'utf8');

  /* The helper definition exists exactly once. */
  const helperDef = src.match(/function\s+_dispatchRowDelete\s*\(/g) ?? [];
  assert.equal(helperDef.length, 1,
    'R4 H-1: _dispatchRowDelete defined exactly once (DRY helper extraction)');

  /* The helper is called from BOTH the X-button branch AND the keydown
     branch (DRY consolidation per R4 H-1). Production callers excluded
     from the source-comment count by requiring an `(` after the name. */
  const callCount = src.match(/_dispatchRowDelete\s*\(/g) ?? [];
  /* 1 definition + 2 call sites = 3 total. */
  assert.equal(callCount.length, 3,
    'R4 H-1: _dispatchRowDelete is referenced exactly 3 times (1 def + 2 callers).');

  /* Within `_dispatchRowDelete`'s body, MSG_CLOSE_TABS appears exactly once
     (the live-row close-tab dispatch). Slice the source to the helper's body
     to verify there's no duplicated row-delete close-tab path. */
  const helperStart = src.indexOf('function _dispatchRowDelete');
  assert.ok(helperStart > -1, 'helper start found');
  /* Find the matching closing brace by walking the next ~40 lines worth
     of source. The helper is small (~25 lines). */
  const helperWindow = src.slice(helperStart, helperStart + 2000);
  /* Stop at the first `\n}\n` after the function header — close enough for
     this body-slice heuristic on a small helper. */
  const bodyEnd = helperWindow.indexOf('\n}\n');
  assert.ok(bodyEnd > 0, 'helper body terminator located');
  const helperBody = helperWindow.slice(0, bodyEnd + 2);

  const closeTabsInHelper = helperBody.match(/MSG_CLOSE_TABS/g) ?? [];
  assert.equal(closeTabsInHelper.length, 1,
    'R4 H-1: MSG_CLOSE_TABS appears exactly ONCE inside _dispatchRowDelete; ' +
    'no duplication of the row-delete close-tab path.');
});
