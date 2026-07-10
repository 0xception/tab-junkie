/**
 * b025-multi-item-drag.test.js — B-025 R5 tests for Multi-item drag as a
 * single unit.
 *
 * sidepanel.js is a browser-only module with no exports and DOM side-effects
 * on load, so drag-related pure-logic helpers are reproduced verbatim here
 * with a light DOM/chrome shim — same pattern as
 * tests/b024-multi-select.test.js and tests/b054-sidepanel.test.js. Each
 * reproduction cites its source location in `sidepanel/sidepanel.js`.
 *
 * Coverage vs §37.6 / AC17:
 *   T-1 (integration) — multi-drag same-group stable-ordering (A, C, E → end)
 *   T-2 (integration) — cross-group multi-drop (groupId + both bucket
 *                       normalisations)
 *   T-3 (integration) — non-contiguous stable-order via bulkReorderItems
 *   T-4 (integration) — sortOrder normalisation both buckets post multi-drop
 *   T-5 (UAT-only)    — Escape cancel → zero storage writes. The escape
 *                       handler is bound on the live sidepanel module; it is
 *                       indirectly exercised by the UAT plan in
 *                       docs/UAT_B-025.md (case "Escape cancel"). Documented
 *                       here rather than stubbed so the test file does not
 *                       lie about what it exercises.
 *   T-6 (UAT-only)    — broadcast-race guard in the drop handler. The drop
 *                       handler reaches into module-scope `_cachedItems` +
 *                       `_cachedItemsGen`; reproducing the full async path
 *                       without the live module exports is lower-value than
 *                       the Edge UAT walk-through. Documented, not stubbed.
 *   T-7 (reproduced)  — AC2 solo-drag fallback: dragstart selection filter.
 *                       The payload-derivation logic is pure (no DOM, just
 *                       _selection Set + _cachedItems lookup) and is
 *                       reproduced verbatim below.
 *   T-8 (reproduced)  — B-025-H3 regression: `_computeDropTarget` returns
 *                       null when `isMulti` is true and the hit-target is
 *                       the Open Tabs section. Guards against multi-drag
 *                       partial-demote. Reproduced with a DOM shim.
 *
 * Full suite must remain green (1040+ baseline).
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { __resetMock } from './chrome-mock.js';
import { __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims } from '../background/tabs/tab-claims.js';
import {
  bulkCreateItems,
  bulkReorderItems,
  listItems,
  createGroup,
} from '../background/storage/index.js';
import { GROUP_COLORS } from '../shared/constants.js';
import { computeMultiItemReorder } from '../shared/sort-order.js';

const COLOR = GROUP_COLORS[0];

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

/* =========================================================================
   Integration seed — two groups (5 items in g1, 2 items in g2). Items have
   been pre-normalised to consecutive integers by listItems, so we capture
   their storage ids + groupIds for compute/bulkReorderItems round-trips.
   ========================================================================= */

async function seedTwoGroups() {
  const g1 = await createGroup({ name: 'G1', color: COLOR, parentId: null });
  const g2 = await createGroup({ name: 'G2', color: COLOR, parentId: null });
  const { created } = await bulkCreateItems([
    { title: 'A', url: 'https://a.example/', groupId: g1.id },
    { title: 'B', url: 'https://b.example/', groupId: g1.id },
    { title: 'C', url: 'https://c.example/', groupId: g1.id },
    { title: 'D', url: 'https://d.example/', groupId: g1.id },
    { title: 'E', url: 'https://e.example/', groupId: g1.id },
    { title: 'D2', url: 'https://d2.example/', groupId: g2.id },
    { title: 'E2', url: 'https://e2.example/', groupId: g2.id },
  ]);
  const [a, b, c, d, e, d2, e2] = created;
  return { g1, g2, a, b, c, d, e, d2, e2 };
}

/* =========================================================================
   T-1 — multi-drag same-group stable-ordering (A, C, E dropped at end)
   ========================================================================= */

test('B-025 T-1: same-group multi-drag with stable relative order (A, C, E → end → [B, D, F…] prefix then A, C, E)', async () => {
  const { g1, a, b, c, d, e } = await seedTwoGroups();

  /* Pre-drop bucket order in g1 (by sortOrder): [A, B, C, D, E]. Dragging
     [A, C, E] (non-contiguous) to end — destIndex = 2 in destItems = [B, D]
     (g1 with dragged removed) — produces post-drop [B, D, A, C, E]. */
  const itemsSnapshot = await listItems();
  const updates = computeMultiItemReorder(
    itemsSnapshot,
    [a.id, c.id, e.id],
    g1.id,
    2, // end of destItems = [B, D]
  );
  assert.ok(updates.length > 0, 'multi-drop produces dispatch spec');

  await bulkReorderItems(updates);

  const post = await listItems();
  const bucket = post
    .filter((it) => it.groupId === g1.id)
    .sort((x, y) => x.sortOrder - y.sortOrder);
  assert.deepEqual(bucket.map((it) => it.id), [b.id, d.id, a.id, c.id, e.id],
    'Bucket order post-drop: [B, D, A, C, E] — dragged trio A,C,E at tail in stable order');
  /* AC10 — post-write bucket normalised to consecutive integers. */
  assert.deepEqual(bucket.map((it) => it.sortOrder), [0, 1, 2, 3, 4],
    'Post-write bucket normalised to consecutive integers');
});

/* =========================================================================
   T-2 — cross-group multi-drop: groupId updated + both buckets normalised
   ========================================================================= */

test('B-025 T-2: cross-group multi-drop updates groupId on all dragged items and normalises both buckets', async () => {
  const { g1, g2, a, b, c, d, e, d2, e2 } = await seedTwoGroups();

  /* Drag [B, C, D] from g1 → drop at idx=1 in g2 (between D2 and E2).
     Pre-drop: g1=[A,B,C,D,E], g2=[D2,E2].
     Expected post-drop: g1=[A,E], g2=[D2, B, C, D, E2]. */
  const itemsSnapshot = await listItems();
  const updates = computeMultiItemReorder(
    itemsSnapshot,
    [b.id, c.id, d.id],
    g2.id,
    1, // between D2 (idx 0) and E2 (idx 1 in destItems)
  );
  await bulkReorderItems(updates);

  const post = await listItems();
  const g1Bucket = post.filter((it) => it.groupId === g1.id).sort((x, y) => x.sortOrder - y.sortOrder);
  const g2Bucket = post.filter((it) => it.groupId === g2.id).sort((x, y) => x.sortOrder - y.sortOrder);

  /* g1 post-drop: [A, E] (B, C, D migrated). */
  assert.deepEqual(g1Bucket.map((it) => it.id), [a.id, e.id],
    'g1 retains only A and E (B, C, D migrated)');
  assert.deepEqual(g1Bucket.map((it) => it.sortOrder), [0, 1],
    'AC10 — g1 bucket normalised to 0, 1 after gap closed');

  /* g2 post-drop: [D2, B, C, D, E2] — 0, 1, 2, 3, 4. */
  assert.deepEqual(g2Bucket.map((it) => it.id), [d2.id, b.id, c.id, d.id, e2.id],
    'g2 post-drop order: D2, B, C, D, E2 — dragged trio inserted stably');
  assert.deepEqual(g2Bucket.map((it) => it.sortOrder), [0, 1, 2, 3, 4],
    'AC10 — g2 bucket normalised to consecutive integers');

  /* All dragged items now have groupId === g2.id. */
  for (const id of [b.id, c.id, d.id]) {
    const item = post.find((it) => it.id === id);
    assert.equal(item.groupId, g2.id, `${id} groupId updated to g2`);
  }
});

/* =========================================================================
   T-3 — non-contiguous selection stable-ordering via bulkReorderItems
   ========================================================================= */

test('B-025 T-3: non-contiguous selection [A, C, E] preserves A → C → E order at drop point', async () => {
  const { g1, a, b, c, d, e } = await seedTwoGroups();

  /* Drag [A, C, E] (positions 0, 2, 4) and drop at start of g1 (idx=0 in
     destItems = [B, D]) — expected post-drop: [A, C, E, B, D]. Stable order
     of the dragged trio must be preserved regardless of how _selection
     (Set) iterates. Here caller pre-sorts by sortOrder (§37.9 F-7). */
  const itemsSnapshot = await listItems();
  const updates = computeMultiItemReorder(
    itemsSnapshot,
    [a.id, c.id, e.id], // pre-sorted by sortOrder
    g1.id,
    0,
  );
  await bulkReorderItems(updates);

  const post = await listItems();
  const bucket = post
    .filter((it) => it.groupId === g1.id)
    .sort((x, y) => x.sortOrder - y.sortOrder);
  assert.deepEqual(bucket.map((it) => it.id), [a.id, c.id, e.id, b.id, d.id],
    'Stable order of dragged A, C, E preserved at head; non-dragged B, D retain relative order');
});

test('B-025 T-3 follow-up: stable order is caller-provided, not lexicographic', async () => {
  /* The helper preserves the order of draggedIds as caller supplied. If a
     buggy caller passed [E, C, A] (reversed), the helper would place E-C-A
     at the drop point. This confirms the contract: the stable-order promise
     is conditional on the caller's pre-sort (F-7). Tests T-1, T-2, T-3 above
     all pass draggedIds pre-sorted by sortOrder (mirroring the sidepanel
     dragstart F-7 pre-condition). */
  const { g1, a, b, c, d, e } = await seedTwoGroups();
  const itemsSnapshot = await listItems();

  /* Pass REVERSED order deliberately. */
  const updates = computeMultiItemReorder(
    itemsSnapshot,
    [e.id, c.id, a.id], // reversed (buggy caller) — helper must respect input order
    g1.id,
    0,
  );
  await bulkReorderItems(updates);

  const post = await listItems();
  const bucket = post.filter((it) => it.groupId === g1.id).sort((x, y) => x.sortOrder - y.sortOrder);
  assert.deepEqual(bucket.map((it) => it.id), [e.id, c.id, a.id, b.id, d.id],
    'Helper respects caller-provided order — input-sort contract is on the caller (F-7)');
});

/* =========================================================================
   T-4 — sortOrder normalisation for source + destination groups
   ========================================================================= */

test('B-025 T-4: post multi-drop, source and destination buckets both have consecutive-integer sortOrders', async () => {
  const { g1, g2, a, b, c, d, e, d2, e2 } = await seedTwoGroups();

  /* Drag [A, B] → drop at end of g2 (idx=2 in destItems = [D2, E2]).
     Pre: g1=[A,B,C,D,E] (5 items), g2=[D2,E2] (2 items).
     Post: g1=[C,D,E], g2=[D2, E2, A, B]. */
  const itemsSnapshot = await listItems();
  const updates = computeMultiItemReorder(
    itemsSnapshot,
    [a.id, b.id],
    g2.id,
    2,
  );
  await bulkReorderItems(updates);

  const post = await listItems();
  const g1Bucket = post.filter((it) => it.groupId === g1.id).sort((x, y) => x.sortOrder - y.sortOrder);
  const g2Bucket = post.filter((it) => it.groupId === g2.id).sort((x, y) => x.sortOrder - y.sortOrder);

  /* Source g1: 3 items remaining → sortOrders [0, 1, 2], no gaps / floats / dupes. */
  assert.equal(g1Bucket.length, 3);
  assert.deepEqual(g1Bucket.map((it) => it.sortOrder), [0, 1, 2],
    'Source g1 normalised to consecutive integers');
  assert.deepEqual(g1Bucket.map((it) => it.id), [c.id, d.id, e.id],
    'Source g1 retains C, D, E in their pre-drop relative order');

  /* Destination g2: 4 items → [0, 1, 2, 3], no gaps / floats / dupes. */
  assert.equal(g2Bucket.length, 4);
  assert.deepEqual(g2Bucket.map((it) => it.sortOrder), [0, 1, 2, 3],
    'Destination g2 normalised to consecutive integers');
  assert.deepEqual(g2Bucket.map((it) => it.id), [d2.id, e2.id, a.id, b.id],
    'Destination g2 post-drop: D2, E2, A, B in stable order');

  /* Defensive: NO item has a non-integer or duplicate sortOrder anywhere. */
  const allSortOrders = post.map((it) => it.sortOrder);
  for (const s of allSortOrders) {
    assert.ok(Number.isInteger(s), `sortOrder ${s} must be integer`);
    assert.ok(s >= 0, `sortOrder ${s} must be non-negative`);
  }
});

/* =========================================================================
   T-7 — AC2 solo-drag fallback.
   ========================================================================= */

/* Reproduced from sidepanel/sidepanel.js:4427-4455 (dragstart payload
   derivation). Pure: no DOM, no chrome — operates on `_selection` Set +
   `_cachedItems` array + the initiator's itemId. Returns the payload shape
   used downstream. */
function derivePayload(selectionSet, cachedItems, initiatorItemId) {
  const sourceItem = cachedItems.find((it) => it.id === initiatorItemId);
  const sourceGroupId = sourceItem ? (sourceItem.groupId ?? null) : null;
  const initiatorKey = 'item:' + initiatorItemId;

  let payloadItemIds;
  let isMulti;
  let selectionCleared = false;

  if (!selectionSet.has(initiatorKey)) {
    if (selectionSet.size > 0) {
      selectionSet.clear();
      selectionCleared = true;
    }
    payloadItemIds = [initiatorItemId];
    isMulti = false;
  } else {
    const candidates = [];
    for (const key of selectionSet) {
      if (!key.startsWith('item:')) continue;
      const id = key.slice(5);
      const it = cachedItems.find((x) => x.id === id);
      if (!it) continue;
      if ((it.groupId ?? null) !== sourceGroupId) continue;
      candidates.push(id);
    }
    payloadItemIds = candidates.length > 0 ? candidates : [initiatorItemId];
    isMulti = payloadItemIds.length >= 2;
  }

  /* §37.9 F-7 — caller sorts by current sortOrder. */
  if (isMulti) {
    payloadItemIds.sort((a, b) => {
      const ia = cachedItems.find((x) => x.id === a);
      const ib = cachedItems.find((x) => x.id === b);
      return (ia?.sortOrder ?? 0) - (ib?.sortOrder ?? 0);
    });
  }

  return { payloadItemIds, isMulti, selectionCleared, sourceGroupId };
}

test('B-025 T-7 (AC2): drag initiator NOT in selection → selection cleared + solo-drag fallback', () => {
  const cachedItems = [
    { id: 'a', groupId: 'g1', sortOrder: 0 },
    { id: 'b', groupId: 'g1', sortOrder: 1000 },
    { id: 'c', groupId: 'g1', sortOrder: 2000 },
  ];
  /* User selected B and C, but initiates drag from A (NOT in selection). */
  const selection = new Set(['item:b', 'item:c']);

  const result = derivePayload(selection, cachedItems, 'a');

  assert.equal(result.isMulti, false, 'Solo-drag fallback: isMulti must be false');
  assert.deepEqual(result.payloadItemIds, ['a'], 'Payload is only the initiator');
  assert.equal(result.selectionCleared, true, 'Selection cleared per AC2');
  assert.equal(selection.size, 0, 'Selection Set is empty post-clear');
});

test('B-025 T-7 (AC1): drag initiator IS in selection → multi-drag payload includes all selected item:* in same group', () => {
  const cachedItems = [
    { id: 'a', groupId: 'g1', sortOrder: 0 },
    { id: 'b', groupId: 'g1', sortOrder: 1000 },
    { id: 'c', groupId: 'g1', sortOrder: 2000 },
  ];
  const selection = new Set(['item:a', 'item:b', 'item:c']);

  const result = derivePayload(selection, cachedItems, 'b');

  assert.equal(result.isMulti, true, 'Multi-drag: isMulti true for N >= 2');
  assert.equal(result.selectionCleared, false, 'Selection NOT cleared when initiator IS in selection');
  /* Payload sorted by sortOrder (F-7 pre-condition). */
  assert.deepEqual(result.payloadItemIds, ['a', 'b', 'c'],
    'Payload is all selected items in initiator source group, sorted by sortOrder');
  assert.equal(selection.size, 3, 'Selection preserved');
});

test('B-025 T-7 (D-4): selection spans two source groups → only initiator source-group members in payload', () => {
  const cachedItems = [
    { id: 'a', groupId: 'g1', sortOrder: 0 },
    { id: 'b', groupId: 'g1', sortOrder: 1000 },
    { id: 'c', groupId: 'g2', sortOrder: 0 },
    { id: 'd', groupId: 'g2', sortOrder: 1000 },
  ];
  /* All four selected; drag initiated from A (g1). D-4 silent restriction:
     payload = only g1 members, g2 members remain selected but not dragged. */
  const selection = new Set(['item:a', 'item:b', 'item:c', 'item:d']);

  const result = derivePayload(selection, cachedItems, 'a');

  assert.equal(result.isMulti, true);
  assert.deepEqual(result.payloadItemIds, ['a', 'b'],
    'Only g1 members (initiator source group) in payload — g2 silently excluded per D-4');
  assert.equal(selection.size, 4, 'Selection Set untouched — g2 keys remain selected');
});

test('B-025 T-7 (D-5): live-only tab:* keys silently skipped from multi-drag payload', () => {
  const cachedItems = [
    { id: 'a', groupId: 'g1', sortOrder: 0 },
    { id: 'b', groupId: 'g1', sortOrder: 1000 },
  ];
  /* Mixed selection: two saved items + two live tabs. Drag from A (saved). */
  const selection = new Set(['item:a', 'item:b', 'tab:123', 'tab:456']);

  const result = derivePayload(selection, cachedItems, 'a');

  assert.equal(result.isMulti, true);
  assert.deepEqual(result.payloadItemIds, ['a', 'b'],
    'Live `tab:*` keys skipped; only `item:*` saved bookmarks in payload');
});

test('B-025 T-7 (AC1 safety): initiator in selection but only initiator matches source-group filter → isMulti=false', () => {
  const cachedItems = [
    { id: 'a', groupId: 'g1', sortOrder: 0 },
    { id: 'b', groupId: 'g2', sortOrder: 0 },
  ];
  /* Initiator (A, g1) in selection; sibling (B) is in a different group →
     filtered out. Payload collapses to 1 item → solo drag (isMulti=false),
     but selection NOT cleared (AC2 clear-path only fires when initiator is
     NOT in selection). */
  const selection = new Set(['item:a', 'item:b']);

  const result = derivePayload(selection, cachedItems, 'a');

  assert.equal(result.isMulti, false, 'payloadItemIds collapsed to 1 → isMulti false');
  assert.deepEqual(result.payloadItemIds, ['a']);
  assert.equal(result.selectionCleared, false, 'selection preserved since initiator was in selection');
});

/* =========================================================================
   T-8 — `_computeDropTarget` multi-drag onto Open Tabs → null
   (B-025-H3 regression: prevents silent partial-demote of initiator only)
   ========================================================================= */

/* Reproduced from sidepanel/sidepanel.js:5044-5081 (_computeDropTarget).
   DOM shim is the bare minimum — `elementFromPoint` returns a fake element
   whose `.closest(selector)` walks an injected ancestor chain. The shim
   does NOT mirror the full live DOM; it replicates only what
   `_computeDropTarget` touches. */

class ShimEl {
  constructor(className = '', dataset = {}, parent = null) {
    this.className = className;
    this.dataset = { ...dataset };
    this._parent = parent;
    this._children = [];
    if (parent && Array.isArray(parent._children)) {
      parent._children.push(this);
    }
  }
  /* Class-list match for one node against `.cls`, `[attr]`, `[attr="v"]`,
     or combined forms like `.cls[attr]`. Returns true if the node matches. */
  _matches(sel) {
    /* Split combined selectors into atomic parts. We only support the
       handful of forms `_computeDropTarget` exercises: `.cls`, `[attr]`,
       `[attr="v"]`, and combinations (`.cls[attr]`, `.cls1.cls2`, etc.). */
    const parts = sel.match(/(\.[a-zA-Z0-9_\-]+|\[[^\]]+\])/g);
    if (!parts || parts.length === 0) return false;
    for (const part of parts) {
      if (part.startsWith('.')) {
        const cls = part.slice(1);
        if (!(this.className || '').split(/\s+/).includes(cls)) return false;
      } else if (part.startsWith('[')) {
        const m = part.match(/^\[([^=\]]+)(?:="([^"]+)")?\]$/);
        if (!m) return false;
        let attr = m[1];
        const wanted = m[2];
        /* Convert `data-foo-bar` to the DOMStringMap key `fooBar` per HTML
           spec — tests use camelCased `dataset` keys (e.g., `groupId`),
           production code uses the bracket form `[data-group-id]`. */
        if (attr.startsWith('data-')) {
          attr = attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        }
        const have = this.dataset?.[attr];
        if (have === undefined) return false;
        if (wanted !== undefined && have !== wanted) return false;
      } else {
        return false;
      }
    }
    return true;
  }
  closest(sel) {
    let node = this;
    while (node) {
      if (node._matches(sel)) return node;
      node = node._parent;
    }
    return null;
  }
  /* B-025 UAT-3 fix test coverage — `_computeDropTarget` uses
     `groupItemsEl.querySelector('.item-row')` to test emptiness. Minimal
     shim: DFS through `_children` returning the first descendant that
     matches the selector. */
  querySelector(sel) {
    for (const child of this._children) {
      if (child._matches(sel)) return child;
      const deep = child.querySelector(sel);
      if (deep) return deep;
    }
    return null;
  }
}

/* Minimal _computeDropTarget reproduction matching sidepanel.js:5044-5108
   (post B-025 UAT-3 fix: adds the {type:'emptyGroup', destGroupId} branch).
   Uses injected `deps` so tests can swap fixtures for `elementFromPoint`,
   `itemDragState`, `cachedLiveStates`, and `dragRectCache`. */
function computeDropTarget(deps, x, y) {
  const { itemDragState, elementFromPoint, cachedLiveStates, dragRectCache } = deps;
  if (!itemDragState) return null;
  const hit = elementFromPoint(x, y);
  if (!hit) return null;

  /* B-033 — Open Tabs demote target. */
  if (hit.closest('.top-level-section')) {
    /* B-025 AC9 / B-025-H3 — multi-drag onto Open Tabs is a no-op. */
    if (itemDragState.isMulti) return null;
    const liveState = cachedLiveStates[itemDragState.itemId];
    if (liveState && liveState.live) return { type: 'openTabs' };
    return null;
  }

  /* B-030 — normal item-reorder target. */
  const row = hit.closest('.item-row');
  if (row) {
    const id = row.dataset.itemId;
    if (!id || (itemDragState.payloadSet && itemDragState.payloadSet.has(id))) return null;

    const rect = dragRectCache.rects.get(id);
    if (!rect) return null;
    const mid = rect.top + rect.height / 2;
    return { type: 'item', rowId: id, insertPosition: y < mid ? 'before' : 'after' };
  }

  /* B-025 UAT-3 fix — empty-group drop target. */
  const groupItemsEl = hit.closest('.group-items');
  if (groupItemsEl && groupItemsEl.querySelector('.item-row') === null) {
    const section = groupItemsEl.closest('.group-section[data-group-id]');
    if (section && section.dataset && section.dataset.groupId) {
      if (section.closest('.top-level-section')) return null;
      return { type: 'emptyGroup', destGroupId: section.dataset.groupId };
    }
  }

  return null;
}

test('B-025 T-8 (B-025-H3): multi-drag hit-test on Open Tabs section returns null (no partial demote)', () => {
  /* Build a shim DOM ancestry: hit element is `div.open-tab-row` inside
     `section.top-level-section`. `.closest('.top-level-section')` matches. */
  const openTabsSection = new ShimEl('top-level-section');
  const tabRow = new ShimEl('open-tab-row', { tabId: '123' }, openTabsSection);

  /* Multi-drag in flight: payloadSet has 3 ids; initiator itemId is in it.
     cachedLiveStates says the initiator IS live → would otherwise pass the
     demote gate. The `isMulti` guard MUST short-circuit before that check. */
  const itemDragState = {
    itemId: 'initiator-id',
    isMulti: true,
    payloadSet: new Set(['initiator-id', 'second-id', 'third-id']),
  };
  const cachedLiveStates = { 'initiator-id': { live: true, tabId: 123 } };
  const dragRectCache = { rects: new Map() };

  const target = computeDropTarget(
    { itemDragState, elementFromPoint: () => tabRow, cachedLiveStates, dragRectCache },
    10, 10,
  );

  assert.equal(target, null,
    'Multi-drag onto Open Tabs must return null — no partial demote of initiator (AC9 / B-025-H3)');
});

test('B-025 T-8 (B-030 AC7): solo-drag onto Open Tabs with saved+live initiator returns {type:openTabs}', () => {
  /* Control case: same hit-test but single-item drag — solo demote flow
     (B-033) must still activate so B-025-H3 fix does not over-reach. */
  const openTabsSection = new ShimEl('top-level-section');
  const tabRow = new ShimEl('open-tab-row', { tabId: '123' }, openTabsSection);
  const itemDragState = {
    itemId: 'initiator-id',
    isMulti: false,
    payloadSet: new Set(['initiator-id']),
  };
  const cachedLiveStates = { 'initiator-id': { live: true, tabId: 123 } };
  const dragRectCache = { rects: new Map() };

  const target = computeDropTarget(
    { itemDragState, elementFromPoint: () => tabRow, cachedLiveStates, dragRectCache },
    10, 10,
  );

  assert.deepEqual(target, { type: 'openTabs' },
    'Solo-drag with live initiator MUST still produce openTabs target — B-025-H3 fix is multi-drag-specific');
});

test('B-025 T-8 (regression): multi-drag onto item-row within Open Tabs section → still null', () => {
  /* Even if the hit-test lands on an item-row (the open-tab-row class is
     different) but the ancestor chain still reaches .top-level-section,
     the handler must short-circuit on the section match BEFORE falling
     through to the item-row path. */
  const openTabsSection = new ShimEl('top-level-section');
  const tabRow = new ShimEl('item-row', { itemId: 'other-item' }, openTabsSection);
  const itemDragState = {
    itemId: 'initiator-id',
    isMulti: true,
    payloadSet: new Set(['initiator-id', 'second-id']),
  };
  const cachedLiveStates = {};
  const dragRectCache = { rects: new Map() };

  const target = computeDropTarget(
    { itemDragState, elementFromPoint: () => tabRow, cachedLiveStates, dragRectCache },
    10, 10,
  );
  assert.equal(target, null, 'top-level-section match short-circuits multi-drag regardless of inner row class');
});

test('B-025 T-8 (self-exclusion): multi-drag hit on payload member returns null', () => {
  /* If the cursor hovers over a row that is part of the dragged payload,
     _computeDropTarget rejects it via the `payloadSet.has(id)` check. */
  const itemRow = new ShimEl('item-row', { itemId: 'payload-member' });
  const itemDragState = {
    itemId: 'initiator-id',
    isMulti: true,
    payloadSet: new Set(['initiator-id', 'payload-member']),
  };
  const cachedLiveStates = {};
  const dragRectCache = { rects: new Map([['payload-member', { top: 0, height: 40 }]]) };

  const target = computeDropTarget(
    { itemDragState, elementFromPoint: () => itemRow, cachedLiveStates, dragRectCache },
    10, 10,
  );
  assert.equal(target, null, 'Hit on a payload member is self-exclusion → null');
});

test('B-025 T-8 (valid multi-drag target): hit on non-payload item-row returns {type:item,...}', () => {
  /* Sanity: the guard ONLY rejects Open Tabs + payload members; a non-payload
     item-row is a valid drop target for multi-drag. */
  const itemRow = new ShimEl('item-row', { itemId: 'non-payload-item' });
  const itemDragState = {
    itemId: 'initiator-id',
    isMulti: true,
    payloadSet: new Set(['initiator-id', 'second-id']),
  };
  const cachedLiveStates = {};
  const dragRectCache = { rects: new Map([['non-payload-item', { top: 100, height: 40 }]]) };

  /* y=110 is below the midpoint (top=100 + height/2=20 = 120), so y<mid →
     insertPosition='before'. */
  const target = computeDropTarget(
    { itemDragState, elementFromPoint: () => itemRow, cachedLiveStates, dragRectCache },
    50, 110,
  );
  assert.equal(target.type, 'item');
  assert.equal(target.rowId, 'non-payload-item');
  assert.equal(target.insertPosition, 'before',
    'y (110) < midpoint (120) → insert BEFORE the hovered row');
});

/* =========================================================================
   T-9 — B-025 UAT-3 fix: empty-group drop target (AC13e)
   Regression guard for the bug reported during pre-merge UAT in Edge:
   dragging items (single or multi) into a group with zero items silently
   no-op'd because `_computeDropTarget` bailed when `elementFromPoint`
   didn't hit an `.item-row`. The fix extends the hit-test to recognise a
   `.group-items` container with no item-row children as a valid empty-
   group drop target, returning {type:'emptyGroup', destGroupId}.
   ========================================================================= */

test('B-025 T-9 (UAT-3): multi-drag hit on empty `.group-items` → {type:emptyGroup, destGroupId}', () => {
  /* Build: section.group-section[data-group-id=empty-g] > div.group-items
     (no item-row children, just a .group-items-empty affordance). */
  const section = new ShimEl('group-section', { groupId: 'empty-g' });
  const groupItems = new ShimEl('group-items', {}, section);
  /* Only the empty-state affordance lives inside — NO item-rows. */
  new ShimEl('group-items-empty', {}, groupItems);

  const itemDragState = {
    itemId: 'initiator-id',
    isMulti: true,
    payloadSet: new Set(['initiator-id', 'second-id', 'third-id']),
  };
  const cachedLiveStates = {};
  const dragRectCache = { rects: new Map() };

  const target = computeDropTarget(
    { itemDragState, elementFromPoint: () => groupItems, cachedLiveStates, dragRectCache },
    50, 50,
  );
  assert.deepEqual(target, { type: 'emptyGroup', destGroupId: 'empty-g' },
    'Hit on empty .group-items must produce emptyGroup target with destGroupId');
});

test('B-025 T-9 (UAT-3 single-item path): solo-drag into empty group ALSO resolves to emptyGroup', () => {
  /* Pre-fix, this bug existed on the B-030 single-item path too — same
     hit-test logic. Fix covers both paths; this test pins that behaviour. */
  const section = new ShimEl('group-section', { groupId: 'empty-solo-g' });
  const groupItems = new ShimEl('group-items', {}, section);
  new ShimEl('group-items-empty', {}, groupItems);

  const itemDragState = {
    itemId: 'solo-initiator',
    isMulti: false,
    payloadSet: new Set(['solo-initiator']),
  };
  const target = computeDropTarget(
    { itemDragState, elementFromPoint: () => groupItems, cachedLiveStates: {}, dragRectCache: { rects: new Map() } },
    50, 50,
  );
  assert.deepEqual(target, { type: 'emptyGroup', destGroupId: 'empty-solo-g' });
});

test('B-025 T-9 (UAT-3 negative): `.group-items` WITH an item-row child is NOT an empty-group target', () => {
  /* If the group has any item-row (even one), the empty-group branch MUST
     NOT match — the hit-test should fall through to the normal item-row
     path on future pointer moves that land on an actual row. */
  const section = new ShimEl('group-section', { groupId: 'non-empty-g' });
  const groupItems = new ShimEl('group-items', {}, section);
  new ShimEl('item-row', { itemId: 'existing-row' }, groupItems);

  const itemDragState = {
    itemId: 'initiator-id',
    isMulti: true,
    payloadSet: new Set(['initiator-id']),
  };
  const target = computeDropTarget(
    { itemDragState, elementFromPoint: () => groupItems, cachedLiveStates: {}, dragRectCache: { rects: new Map() } },
    50, 50,
  );
  assert.equal(target, null,
    'Group with an item-row child is not empty — empty-group branch must not match');
});

test('B-025 T-9 (UAT-3 edge): `.group-items` nested inside `.top-level-section` is rejected (defensive)', () => {
  /* Open Tabs must NEVER become an emptyGroup drop target — it has its own
     drop semantics (B-033 demote). If a future DOM layout nests a
     `.group-items` inside `.top-level-section`, the defensive guard keeps
     AC9 intact (multi-drag onto Open Tabs → null). */
  const openTabs = new ShimEl('top-level-section');
  const section = new ShimEl('group-section', { groupId: 'defensive' }, openTabs);
  const groupItems = new ShimEl('group-items', {}, section);
  new ShimEl('group-items-empty', {}, groupItems);

  const itemDragState = {
    itemId: 'initiator-id',
    isMulti: true,
    payloadSet: new Set(['initiator-id', 'second-id']),
  };
  const target = computeDropTarget(
    { itemDragState, elementFromPoint: () => groupItems, cachedLiveStates: {}, dragRectCache: { rects: new Map() } },
    50, 50,
  );
  /* The Open Tabs short-circuit at the top of _computeDropTarget fires
     FIRST (since hit.closest('.top-level-section') matches via the
     ancestor chain); the multi-drag guard then returns null. Either path
     yields null — the point is: never emptyGroup. */
  assert.equal(target, null,
    'emptyGroup target must never reach through a .top-level-section ancestor');
});

/* =========================================================================
   T-10 — B-025 UAT-3 fix: computeMultiItemReorder into empty destination
   End-to-end sort-order path: given a multi-drag payload from g1 into an
   empty g2, the pure helper must emit the correct bulkReorderItems spec
   (destination renumbered 0..N-1 with groupId change, source renumbered
   after payload removal).
   ========================================================================= */

test('B-025 T-10 (UAT-3 integration): multi-drag of 3 items into empty group produces correct sort-order spec', () => {
  /* Seed: 5 items in g1, 0 items in g2 (empty). Drag items A, C, E into
     g2. Expected post-drop: g2 has [A, C, E] at 0/1000/2000; g1 has
     [B, D] renumbered to 0/1000. */
  const items = [
    { id: 'a', groupId: 'g1', sortOrder: 0 },
    { id: 'b', groupId: 'g1', sortOrder: 1000 },
    { id: 'c', groupId: 'g1', sortOrder: 2000 },
    { id: 'd', groupId: 'g1', sortOrder: 3000 },
    { id: 'e', groupId: 'g1', sortOrder: 4000 },
  ];
  /* destIndex = 0 because g2 is empty (destSiblings.length === 0 in the
     drop handler). Payload pre-sorted by sortOrder: [a, c, e]. */
  const updates = computeMultiItemReorder(items, ['a', 'c', 'e'], 'g2', 0);

  /* Expected updates (unordered assertion): a,c,e gain groupId:g2 + new
     sortOrders; b,d stay in g1 but get renumbered. */
  const byId = Object.fromEntries(updates.map((u) => [u.id, u]));

  assert.equal(byId.a.groupId, 'g2');
  assert.equal(byId.a.sortOrder, 0);
  assert.equal(byId.c.groupId, 'g2');
  assert.equal(byId.c.sortOrder, 1000);
  assert.equal(byId.e.groupId, 'g2');
  assert.equal(byId.e.sortOrder, 2000);

  /* Source bucket (g1) renumbered — b gets 0 (was 1000), d gets 1000
     (was 3000). */
  assert.equal(byId.b.sortOrder, 0);
  assert.equal(byId.b.groupId, undefined, 'b stays in g1 — no groupId change');
  assert.equal(byId.d.sortOrder, 1000);
  assert.equal(byId.d.groupId, undefined, 'd stays in g1 — no groupId change');
});
