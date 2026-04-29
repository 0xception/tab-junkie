/**
 * b107-live-x-aria.test.js — Sprint 36 / B-107 R5 (AC4)
 *
 * B-107 closes the WCAG 2.1 SC 4.1.2 name-role-value follow-up filed from
 * S35 B-100 R4 [qa-reviewer] M-4. Since B-100 the X-button on a LIVE row
 * dispatches MSG_CLOSE_TABS (closes the tab, preserves the bookmark) instead
 * of demoting + deleting. The button's aria-label, however, was left at the
 * static `"Delete bookmark"` value set by `buildItemRow` — meaning a screen
 * reader announces "Delete bookmark" while the actual action is "Close tab".
 * This is a name-role-value mismatch and a measurable a11y regression.
 *
 * R1 LOCKED:
 *   - Q1 — live row label = "Close tab"; non-live row label = "Delete bookmark"
 *     (current default, unchanged at the static creation site).
 *   - Q2 — JS-set on live-state change. The reactive flip lives in the
 *     `MSG_LIST_ITEMS` patch loop (around `sidepanel.js:3066`), immediately
 *     after `row.dataset.live` is mutated. The static `buildItemRow` value
 *     stays at "Delete bookmark" (correct default for non-live items).
 *
 * AC4 — three tests:
 *   T1 — live row → `aria-label === "Close tab"` after the patch.
 *   T2 — non-live row → `aria-label === "Delete bookmark"` after the patch
 *        (this is also the default at the static creation site).
 *   T3 — reactive flip: build a non-live row, assert default; patch to live,
 *        assert "Close tab"; patch back to non-live, assert "Delete bookmark".
 *
 * Strategy: like `tests/b100-delete-on-live.test.js` and
 * `tests/b048-visual-states.test.js`, the sidepanel module runs DOM queries
 * at load-time and cannot be imported in Node. The tests reproduce the
 * minimal patch-loop logic for the X-button aria-label flip verbatim against
 * a light DOM shim. The chrome-mock is unused — no SW round-trip is involved
 * in this aria-label-only mutation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/* =========================================================================
   Minimal DOM shim — only what this test exercises (className,
   setAttribute, getAttribute, dataset, appendChild, querySelector for
   `.item-action-delete`). Mirrors the shim style in
   `tests/b048-visual-states.test.js` and `tests/b100-delete-on-live.test.js`.
   ========================================================================= */

class FakeElement {
  constructor(tag) {
    this.tagName = (tag || 'DIV').toUpperCase();
    this.className = '';
    this.children = [];
    this.dataset = {};
    this._attrs = {};
    this._parent = null;
  }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  appendChild(child) {
    child._parent = this;
    this.children.push(child);
    return child;
  }
  querySelector(sel) {
    /* Only `.class` selectors needed for this suite. Walks children
       recursively so a nested actions container resolves correctly. */
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      for (const c of this.children) {
        if (c.className === cls) return c;
        const inner = c.querySelector?.(sel);
        if (inner) return inner;
      }
    }
    return null;
  }
}

/* =========================================================================
   Row builder — mirrors the relevant portion of `sidepanel.js:buildItemRow`
   for the X-button. Initial aria-label is "Delete bookmark" (default
   non-live value, per R1 LOCKED Q2 and `sidepanel.js:2475`).
   ========================================================================= */

function buildRowWithDeleteButton(itemId) {
  const row = new FakeElement('div');
  row.className = 'item-row';
  row.dataset.itemId = itemId;

  const actions = new FakeElement('div');
  actions.className = 'item-actions';

  const deleteBtn = new FakeElement('button');
  deleteBtn.className = 'item-action-delete';
  /* Static initial value per `sidepanel.js:2475`. The reactive patch
     only fires on MSG_LIST_ITEMS responses; before the first patch the
     default non-live label applies. */
  deleteBtn.setAttribute('aria-label', 'Delete bookmark');
  deleteBtn.dataset.action = 'delete';

  actions.appendChild(deleteBtn);
  row.appendChild(actions);

  return row;
}

/* =========================================================================
   Patch helper — reproduces the B-107 reactive flip from
   `sidepanel.js:3066` verbatim. After mutating `row.dataset.live`, the
   helper queries the X-button and updates its aria-label to match the
   action that fires for the new live state.
   ========================================================================= */

function applyLiveStatePatch(row, live) {
  /* Pre-flip dataset write (matches the production patch loop ordering). */
  if (live?.live) row.dataset.live = 'true'; else delete row.dataset.live;

  /* B-107 reactive flip — verbatim from sidepanel.js post-edit. */
  const deleteBtn = row.querySelector('.item-action-delete');
  if (deleteBtn) {
    deleteBtn.setAttribute('aria-label', live?.live ? 'Close tab' : 'Delete bookmark');
  }
}

/* =========================================================================
   T1 — AC1/AC4: live row → aria-label === "Close tab" after the patch.
   ========================================================================= */
test('B-107 T1 (AC1): live row X-button aria-label === "Close tab" after live-state patch', () => {
  const row = buildRowWithDeleteButton('item-live-1');

  applyLiveStatePatch(row, { live: true, tabId: 42, windowId: 1 });

  const btn = row.querySelector('.item-action-delete');
  assert.ok(btn, 'precondition: X-button exists in row');
  assert.equal(
    btn.getAttribute('aria-label'),
    'Close tab',
    'AC1: live row X-button must announce "Close tab" (matches MSG_CLOSE_TABS action from B-100)',
  );
  /* Sanity: the dataset.live attribute was set so the row is in the
     "live" branch of the patch loop. */
  assert.equal(row.dataset.live, 'true', 'precondition: dataset.live mirrored by the patch');
});

/* =========================================================================
   T2 — AC2/AC4: non-live row → aria-label === "Delete bookmark" after patch
   (also matches the default at the static creation site).
   ========================================================================= */
test('B-107 T2 (AC2): non-live row X-button aria-label === "Delete bookmark" after non-live patch', () => {
  const row = buildRowWithDeleteButton('item-saved-2');

  /* Apply a patch with `live: false` (or missing) — the row should land in
     the non-live branch of the patch loop. */
  applyLiveStatePatch(row, { live: false });

  const btn = row.querySelector('.item-action-delete');
  assert.equal(
    btn.getAttribute('aria-label'),
    'Delete bookmark',
    'AC2: non-live row X-button must announce "Delete bookmark" (matches modal-confirm delete path)',
  );
  assert.equal(row.dataset.live, undefined,
    'precondition: dataset.live deleted on non-live branch');

  /* Defensive: also exercise the case where the live object is null
     entirely (no live claim at all). */
  const row2 = buildRowWithDeleteButton('item-saved-2b');
  applyLiveStatePatch(row2, null);
  const btn2 = row2.querySelector('.item-action-delete');
  assert.equal(
    btn2.getAttribute('aria-label'),
    'Delete bookmark',
    'AC2: row with no live claim at all (live=null) also announces "Delete bookmark"',
  );
});

/* =========================================================================
   T3 — AC3/AC4: reactive flip — non-live → live → non-live, label tracks.
   ========================================================================= */
test('B-107 T3 (AC3): aria-label flips reactively across non-live → live → non-live transitions', () => {
  const row = buildRowWithDeleteButton('item-flipper-3');
  const btn = row.querySelector('.item-action-delete');

  /* Step 1 — initial state: row is freshly built, default label is
     "Delete bookmark" per `buildItemRow`'s static creation. No patch
     has run yet. */
  assert.equal(
    btn.getAttribute('aria-label'),
    'Delete bookmark',
    'initial state: static creation site emits "Delete bookmark" (default non-live)',
  );

  /* Step 2 — tab opens: patch with live=true. Label MUST flip to "Close tab". */
  applyLiveStatePatch(row, { live: true, tabId: 100, windowId: 1 });
  assert.equal(
    btn.getAttribute('aria-label'),
    'Close tab',
    'AC3 step 2: after non-live → live patch, label flips to "Close tab"',
  );
  assert.equal(row.dataset.live, 'true', 'dataset.live mirrors the live state');

  /* Step 3 — tab closes (or moves out of scope): patch with live=false.
     Label MUST flip back to "Delete bookmark" in the same synchronous
     patch pass. */
  applyLiveStatePatch(row, { live: false });
  assert.equal(
    btn.getAttribute('aria-label'),
    'Delete bookmark',
    'AC3 step 3: after live → non-live patch, label flips back to "Delete bookmark"',
  );
  assert.equal(row.dataset.live, undefined, 'dataset.live cleared on non-live branch');

  /* Step 4 — flip to live again to confirm the patch is idempotent across
     repeated transitions (no stale state, no missed flip). */
  applyLiveStatePatch(row, { live: true, tabId: 101, windowId: 2 });
  assert.equal(
    btn.getAttribute('aria-label'),
    'Close tab',
    'AC3 step 4: second non-live → live transition still flips correctly (no stale state)',
  );
});

/* =========================================================================
   T4 — Source regression guard: the production patch loop in
   `sidepanel/sidepanel.js` actually contains the B-107 aria-label flip
   immediately after the `row.dataset.live` mutation. Prevents the helper
   in this test from drifting away from production by accident.
   ========================================================================= */
test('B-107 T4 (regression): sidepanel.js patch loop contains the reactive aria-label flip', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sidepanelPath = resolve(here, '..', 'sidepanel', 'sidepanel.js');
  const src = readFileSync(sidepanelPath, 'utf8');

  /* The patch loop must contain the exact ternary the helper above
     reproduces. This anchors the test to production. */
  assert.ok(
    /\.item-action-delete/.test(src),
    'production source references the .item-action-delete selector',
  );
  assert.ok(
    /aria-label['"\s,]+live\?\.live\s*\?\s*['"]Close tab['"]\s*:\s*['"]Delete bookmark['"]/.test(src),
    'production source contains the live?.live ? "Close tab" : "Delete bookmark" reactive flip',
  );
});
