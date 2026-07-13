/**
 * b196-toplevel-region.test.js — B-196 R4 fix-round regression coverage.
 *
 * Guards the fix-round changes to the merged top-level catch-all region:
 *
 *   F-1  — the runtime `__toplevel__` renderOrder owner is derived by the
 *          SHARED `deriveTopLevelRenderOrder` (shared/render-order.js), consumed
 *          by both the sidepanel and newtab head render + the sidepanel
 *          incremental floating patch. Direct unit tests of the pure builder +
 *          its integration with `resolveRenderOrder` (interleave contract).
 *   H-1  — the incremental floating patch derives the sentinel owner's
 *          renderOrder (source pin — the patch path is DOM-bound).
 *   H-2  — collapsing the merged region hides BOTH the head container AND the
 *          loose tail sub-list; expanding shows both. Behavioural reproduction
 *          of the shipped toggle slice + the buildTopLevelSection initial-hidden
 *          seed, pinned to the shipped source so the reproduction cannot drift.
 *   F-2  — the single count badge folds in the loose-tail count on the floating
 *          patch path (source pin — DOM-bound).
 *   F-3  — one-time migration of the pre-merge `tj-ungrouped-collapsed`
 *          sessionStorage preference to `tj-toplevel-collapsed`. Behavioural
 *          reproduction of the shipped migration slice + source pin.
 *   F-4  — the retired `'__ungrouped__'` group-picker source-exclusion sentinel
 *          is aligned to `'__toplevel__'` while the DESTINATION row stays
 *          keyed by `null` (semantics preserved).
 *
 * Strategy mirrors b040 / b102: `sidepanel/sidepanel.js` runs DOM queries at
 * module-load time and has no exports, so DOM-bound slices are covered by a
 * faithful local reproduction PLUS a source-invariant grep that pins the
 * shipped lines — the grep is the anti-false-green guard. Pure shared logic
 * (deriveTopLevelRenderOrder, group-picker-core) is imported and tested
 * directly. All chrome interactions (none needed here) would go through
 * chrome-mock.
 */

import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  deriveTopLevelRenderOrder,
  resolveRenderOrder,
} from '../shared/render-order.js';
import { buildGroupPickerRows } from '../shared/group-picker-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SIDEPANEL_SRC = readFileSync(join(REPO_ROOT, 'sidepanel', 'sidepanel.js'), 'utf8');
const NEWTAB_SRC = readFileSync(join(REPO_ROOT, 'newtab', 'newtab.js'), 'utf8');

/* =========================================================================
   Minimal shims (no jsdom; same spirit as b027 / b040 FakeElement)
   ========================================================================= */

class FakeElement {
  constructor(tag) {
    this.tag = tag;
    this.hidden = false;
    this._attrs = {};
  }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; }
}

function makeSessionStore(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _has: (k) => m.has(k),
    _get: (k) => (m.has(k) ? m.get(k) : null),
  };
}

/* =========================================================================
   F-1 — shared deriveTopLevelRenderOrder (pure)
   ========================================================================= */

test('B-196 F-1: empty floating → head items ordered by sortOrder (bootstrap parity)', () => {
  const items = [{ id: 'b', sortOrder: 20 }, { id: 'a', sortOrder: 10 }];
  assert.deepEqual(deriveTopLevelRenderOrder(items, []), ['item:a', 'item:b']);
});

test('B-196 F-1: floating children splice immediately after their parent (interleave)', () => {
  const items = [{ id: 'a', sortOrder: 10 }, { id: 'b', sortOrder: 20 }];
  const floating = [
    { floatingTabId: 'f1', parentItemId: 'a', sortOrder: 5 },
    { floatingTabId: 'f2', parentItemId: 'b', sortOrder: 5 },
  ];
  assert.deepEqual(
    deriveTopLevelRenderOrder(items, floating),
    ['item:a', 'floating:f1', 'item:b', 'floating:f2'],
  );
});

test('B-196 F-1: multiple floating under one parent ordered by their own sortOrder', () => {
  const items = [{ id: 'a', sortOrder: 10 }];
  const floating = [
    { floatingTabId: 'f2', parentItemId: 'a', sortOrder: 20 },
    { floatingTabId: 'f1', parentItemId: 'a', sortOrder: 10 },
  ];
  assert.deepEqual(
    deriveTopLevelRenderOrder(items, floating),
    ['item:a', 'floating:f1', 'floating:f2'],
  );
});

test('B-196 F-1: floating with no matching top-level parent is dropped (stale-ref discipline)', () => {
  const items = [{ id: 'a', sortOrder: 10 }];
  const floating = [{ floatingTabId: 'orphan', parentItemId: 'zzz', sortOrder: 5 }];
  assert.deepEqual(deriveTopLevelRenderOrder(items, floating), ['item:a']);
});

test('B-196 F-1: derived owner + resolveRenderOrder yields the interleaved rows (B-197 AC13 contract)', () => {
  const items = [{ id: 'a', sortOrder: 10 }, { id: 'b', sortOrder: 20 }];
  const floating = [{ floatingTabId: 'f1', parentItemId: 'a', sortOrder: 5 }];
  const owner = { id: '__toplevel__', renderOrder: deriveTopLevelRenderOrder(items, floating) };
  const refs = resolveRenderOrder(owner, items, floating).map((r) => r.ref);
  assert.deepEqual(refs, ['item:a', 'floating:f1', 'item:b']);
});

test('B-196 F-1: sidepanel + newtab both consume the shared builder (DRY, single source)', () => {
  assert.ok(
    SIDEPANEL_SRC.includes('deriveTopLevelRenderOrder') &&
      SIDEPANEL_SRC.includes("from '../shared/render-order.js'"),
    'sidepanel imports + uses the shared deriveTopLevelRenderOrder',
  );
  assert.ok(
    !SIDEPANEL_SRC.includes('function _deriveTopLevelRenderOrder'),
    'the local sidepanel copy was removed (no duplication)',
  );
  assert.ok(
    NEWTAB_SRC.includes('deriveTopLevelRenderOrder(items, floatingForGroup)'),
    'newtab head builds the same synthetic renderOrder owner',
  );
});

/* =========================================================================
   H-1 — incremental floating patch derives the sentinel owner (source pin)
   ========================================================================= */

test('B-196 H-1: incremental floating patch derives the __toplevel__ renderOrder owner', () => {
  assert.ok(
    SIDEPANEL_SRC.includes('deriveTopLevelRenderOrder(headItems, members)'),
    'patchFloatingMembersSections derives the sentinel owner from the shared builder',
  );
  /* The anchor computation must consume the derived `renderOrder`, not a
     `_cachedGroups` record (which is undefined for the sentinel). */
  assert.ok(
    SIDEPANEL_SRC.includes('_resolveFloatingRowAnchor(itemsContainer, renderOrder, member, staticAnchor)'),
    'the anchor uses the derived renderOrder variable, not groupRecord.renderOrder',
  );
});

/* =========================================================================
   H-2 — collapse hides BOTH the head container AND the loose tail
   ========================================================================= */

/* Faithful reproduction of the shipped toggleGroup() TOP_LEVEL_ID slice. */
function reproToggleTopLevel(header, headContainer, tailList) {
  const expanded = header.getAttribute('aria-expanded') === 'true';
  if (expanded) {
    header.setAttribute('aria-expanded', 'false');
    if (headContainer) headContainer.hidden = true;
  } else {
    header.setAttribute('aria-expanded', 'true');
    if (headContainer) headContainer.hidden = false;
  }
  /* B-196 fix-round H-2 shipped line: tail mirrors head's new state. */
  if (tailList) tailList.hidden = expanded;
}

test('B-196 H-2: collapse hides both head container and tail; expand shows both', () => {
  const header = new FakeElement('div');
  header.setAttribute('aria-expanded', 'true'); // start expanded
  const head = new FakeElement('div');
  const tail = new FakeElement('ul');
  head.hidden = false;
  tail.hidden = false;

  /* Collapse */
  reproToggleTopLevel(header, head, tail);
  assert.equal(header.getAttribute('aria-expanded'), 'false');
  assert.equal(head.hidden, true, 'head container hidden on collapse');
  assert.equal(tail.hidden, true, 'loose tail hidden on collapse (H-2 regression)');

  /* Expand */
  reproToggleTopLevel(header, head, tail);
  assert.equal(header.getAttribute('aria-expanded'), 'true');
  assert.equal(head.hidden, false, 'head container visible on expand');
  assert.equal(tail.hidden, false, 'loose tail visible on expand');
});

test('B-196 H-2: buildTopLevelSection seeds the tail hidden to match a collapsed region', () => {
  /* Reproduces `tailList.hidden = syntheticGroup.collapsed;`. */
  const seedTail = (collapsed) => {
    const tail = new FakeElement('ul');
    tail.hidden = collapsed;
    return tail;
  };
  assert.equal(seedTail(true).hidden, true, 'collapsed region → tail starts hidden');
  assert.equal(seedTail(false).hidden, false, 'expanded region → tail starts visible');
});

test('B-196 H-2: shipped source pins the tail collapse touch-points', () => {
  assert.ok(
    SIDEPANEL_SRC.includes('tailList.hidden = syntheticGroup.collapsed;'),
    'buildTopLevelSection seeds tail.hidden from the collapsed state',
  );
  assert.ok(
    SIDEPANEL_SRC.includes('if (tailList) tailList.hidden = expanded;'),
    "toggleGroup's TOP_LEVEL_ID branch toggles the tail hidden to match the head",
  );
});

/* =========================================================================
   F-2 — count badge folds in the loose tail on the floating patch path
   ========================================================================= */

test('B-196 F-2: floating-patch count badge includes the loose-tail count for the sentinel', () => {
  assert.ok(
    SIDEPANEL_SRC.includes('function _topLevelTailCount()'),
    'the tail-count helper exists',
  );
  assert.ok(
    SIDEPANEL_SRC.includes('groupId === TOP_LEVEL_ID ? _topLevelTailCount() : 0'),
    'the per-group floating-patch count folds in the tail for the sentinel',
  );
  assert.ok(
    SIDEPANEL_SRC.includes('gid === TOP_LEVEL_ID ? _topLevelTailCount() : 0'),
    'the no-longer-floating count loop also folds in the tail for the sentinel',
  );
});

/* =========================================================================
   F-3 — one-time collapse-state migration (tj-ungrouped-collapsed → new key)
   ========================================================================= */

/* Faithful reproduction of the shipped DOMContentLoaded migration slice. */
function reproMigrateCollapse(store) {
  if (store.getItem('tj-toplevel-collapsed') === null
      && store.getItem('tj-ungrouped-collapsed') === 'true') {
    store.setItem('tj-toplevel-collapsed', 'true');
  }
  store.removeItem('tj-ungrouped-collapsed');
}

test('B-196 F-3: old collapsed pref migrates to the new key when the new key is absent', () => {
  const store = makeSessionStore({ 'tj-ungrouped-collapsed': 'true' });
  reproMigrateCollapse(store);
  assert.equal(store._get('tj-toplevel-collapsed'), 'true', 'new key seeded true');
  assert.equal(store._has('tj-ungrouped-collapsed'), false, 'stale key evicted');
});

test('B-196 F-3: a fresh choice on the merged region is NOT clobbered by the old key', () => {
  const store = makeSessionStore({
    'tj-toplevel-collapsed': 'false', // user expanded the merged region
    'tj-ungrouped-collapsed': 'true', // lingering pre-merge value
  });
  reproMigrateCollapse(store);
  assert.equal(store._get('tj-toplevel-collapsed'), 'false', 'user choice preserved');
  assert.equal(store._has('tj-ungrouped-collapsed'), false, 'stale key still evicted');
});

test('B-196 F-3: old key absent / not "true" leaves the new key untouched', () => {
  const store = makeSessionStore({ 'tj-ungrouped-collapsed': 'false' });
  reproMigrateCollapse(store);
  assert.equal(store._get('tj-toplevel-collapsed'), null, 'no spurious collapse seeded');
  assert.equal(store._has('tj-ungrouped-collapsed'), false, 'stale key evicted regardless');
});

test('B-196 F-3: shipped source pins the migration slice', () => {
  assert.ok(
    SIDEPANEL_SRC.includes("sessionStorage.getItem('tj-ungrouped-collapsed') === 'true'"),
    'the migration reads the retired key',
  );
  assert.ok(
    SIDEPANEL_SRC.includes("sessionStorage.removeItem('tj-ungrouped-collapsed');"),
    'the migration evicts the retired key',
  );
});

/* =========================================================================
   F-4 — group-picker sentinel alignment (null destination preserved)
   ========================================================================= */

test('B-196 F-4: __toplevel__ source-exclusion drops the Ungrouped pinned row', () => {
  const rows = buildGroupPickerRows({
    groups: [], items: [], liveStates: {}, sourceGroupId: '__toplevel__',
  });
  assert.equal(rows.length, 0, 'the null-keyed Ungrouped row is excluded by the aligned sentinel');
});

test('B-196 F-4: the Ungrouped DESTINATION row is still keyed by null, with correct counts', () => {
  const rows = buildGroupPickerRows({
    groups: [],
    items: [{ id: 'i1', groupId: null }, { id: 'i2', groupId: null }],
    liveStates: { i1: { live: true } },
    sourceGroupId: null,
  });
  const ungrouped = rows.find((r) => r.id === null);
  assert.ok(ungrouped, 'Ungrouped destination row present when not excluded');
  assert.equal(ungrouped.savedCount, 2, 'null-group items counted under the sentinel bucket');
  assert.equal(ungrouped.openCount, 1, 'live null-group item counted under the sentinel bucket');
});

test('B-196 F-4: the retired __ungrouped__ sentinel is gone from the picker/popup sources', () => {
  const pickerSrc = readFileSync(join(REPO_ROOT, 'shared', 'group-picker-core.js'), 'utf8');
  const popupSrc = readFileSync(join(REPO_ROOT, 'popup', 'group-jump-popup.js'), 'utf8');
  assert.ok(!pickerSrc.includes("'__ungrouped__'"), 'group-picker-core aligned to __toplevel__');
  assert.ok(!popupSrc.includes("'__ungrouped__'"), 'group-jump-popup aligned to __toplevel__');
});
