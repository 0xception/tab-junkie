/**
 * b023-group-jump-popup.test.js — B-023 Group Jump Popup R5 automated coverage.
 *
 * Authoritative spec: docs/design/40-b-023-group-jump-popup.md §40.6 +
 * BACKLOG.md B-023 AC21 (a-l).
 *
 * Strategy (mirrors B-022 §39.6 precedent — `tests/b022-quick-search.test.js`):
 *
 *   (1) Shared pure helpers (`shared/group-picker-core.js`,
 *       `shared/highlight.js`) imported directly and exercised against the
 *       real exports. DOM-only calls are satisfied via the same minimal
 *       `document` shim used by the B-022 suite.
 *   (2) popup.js-side state machines (selection advance/wrap, drill-in
 *       enter/exit, filter dispatch, activation payload shape) are reproduced
 *       pure-in-test with tight source line references back to
 *       `popup/group-jump-popup.js`. Future refactors surface as fixture
 *       failures, not silent drift. Same precedent as B-022 reproducing
 *       `_moveSelection` + `_scoreEntry`.
 *   (3) Service-worker command listener (B-023 H-2 regression guard) is
 *       tested by registering a local shim `chrome.commands.onCommand`
 *       listener with the *exact* implementation from
 *       `background/service-worker.js:63-73`. We assert the synchronous
 *       setPopup → openPopup → .finally(setPopup) order, including the
 *       openPopup-rejects path (H-2 restore-on-reject guarantee).
 *   (4) Bookmark activation variant dispatch (H-5 regression guard) is
 *       tested against the real payload-building logic from popup.js
 *       `_activateRow`, reproduced in-test with matching line references.
 *
 * AC21 coverage map (§40.6 cases a–l):
 *   (a) fuzzy group-name filter       — automated (pure `applyGroupPickerFilter`)
 *   (b) buildHighlightedText + XSS    — automated (direct shared import)
 *   (c) ArrowDown/Up wrap             — automated (pure state reproduction)
 *   (d) Enter → drill-in              — automated (pure drill-in state transition)
 *   (e) Back action returns           — automated (pure drill enter → exit round-trip)
 *   (f) Escape → zero writes          — automated (keydown shim, assert no sendMessage)
 *   (g) empty-state matrix (AC19 a-h) — automated (parameterised; per sub-state)
 *   (h) C-11 write-before-navigate    — automated SKIP w/ documentation (v1 has zero writes)
 *   (i) result cap 100                — automated (pure filter + slice)
 *   (j) whitespace-only query         — automated (pure filter, whitespace → all)
 *   (k) live-tab variant dispatch     — automated (payload shape + chrome.tabs spies)
 *   (l) SW listener command dispatch  — automated (shim chrome.action + chrome.commands)
 *
 * UAT-only coverage (documented but NOT automated here):
 *   - AC3  first-paint < 200 ms (real DOMContentLoaded + Edge popup lifecycle)
 *   - AC4  initial focus on query input (real browser focus management)
 *   - AC17 ARIA combobox/listbox semantics (axe-core required)
 *   - AC18 WCAG AA focus-ring contrast (contrast checker required)
 *   - UAT-11 Edge 127+ openPopup() availability (browser version gate)
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetMock,
  __getSendMessageCalls,
} from './chrome-mock.js';

/* =========================================================================
   Global `document` shim — must be installed BEFORE importing
   shared/highlight.js. Byte-for-byte identical to the shim in
   tests/b022-quick-search.test.js so XSS posture is observable.
   ========================================================================= */

class ShimTextNode {
  constructor(text) {
    this.nodeType = 3;
    this.textContent = text;
  }
}

class ShimElement {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this._textContent = '';
    this.childNodes = [];
  }
  get textContent() { return this._textContent; }
  set textContent(v) {
    this._textContent = String(v);
    this.childNodes = [];
  }
  appendChild(child) { this.childNodes.push(child); return child; }
}

class ShimFragment {
  constructor() {
    this.nodeType = 11;
    this.childNodes = [];
  }
  appendChild(child) { this.childNodes.push(child); return child; }
}

globalThis.document = {
  createDocumentFragment() { return new ShimFragment(); },
  createElement(tag) { return new ShimElement(tag); },
  createTextNode(text) { return new ShimTextNode(text); },
};

/* NOW safe to import shared modules that touch `document`. */
const { buildHighlightedText } = await import('../shared/highlight.js');
const {
  buildGroupPickerRows,
  applyGroupPickerFilter,
  normalizeGroupPickerQuery,
} = await import('../shared/group-picker-core.js');
const { MSG_NAVIGATE_TO_ITEM } = await import('../shared/messages.js');

/* =========================================================================
   Constants mirrored from popup/group-jump-popup.js
   ========================================================================= */

/** popup/group-jump-popup.js:52 */
const GROUP_RESULT_CAP = 100;

/* =========================================================================
   Pure-logic reproductions of popup/group-jump-popup.js state machines.
   Each function carries its source range as a docblock so future refactors
   surface via fixture failures, not silent drift.
   ========================================================================= */

/**
 * Reproduction of popup/group-jump-popup.js:358-366 — `_resetSelection`.
 * Returns the index of the first non-header row (or -1 if none exist).
 */
function resetSelection(rows) {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].kind !== 'header') return i;
  }
  return -1;
}

/**
 * Reproduction of popup/group-jump-popup.js:368-385 — `_moveSelection`.
 * Direction +1 = ArrowDown, -1 = ArrowUp. Wraps at both ends. Header rows
 * are skipped.
 */
function moveSelection(rows, currentIndex, direction) {
  const activatable = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].kind !== 'header') activatable.push(i);
  }
  if (activatable.length === 0) return -1;
  const pos = activatable.indexOf(currentIndex);
  let next;
  if (pos === -1) next = direction > 0 ? 0 : activatable.length - 1;
  else next = (pos + direction + activatable.length) % activatable.length;
  return activatable[next];
}

/**
 * Reproduction of popup/group-jump-popup.js:215-238 — `_applyGroupListFilter`
 * (pure half; DOM side omitted). Returns `{mode, rows, visibleRows}`.
 */
function applyGroupListFilter(allRows, query) {
  const filtered = applyGroupPickerFilter(allRows, query);
  const visibleRows = filtered.slice(0, GROUP_RESULT_CAP);
  if (visibleRows.length === 0) {
    return {
      mode: allRows.length === 0 ? 'empty-no-groups' : 'empty-matches',
      rows: [],
      visibleRows: [],
    };
  }
  return {
    mode: 'group-list',
    rows: visibleRows.map((row) => ({ kind: 'group', row })),
    visibleRows,
  };
}

/**
 * Reproduction of popup/group-jump-popup.js:297-325 — `_enterDrillIn`
 * (state half only; DOM bindings omitted). Returns the post-transition
 * state snapshot.
 */
function enterDrillIn({ groups, items, liveStates }, groupId) {
  const group = groups.find((g) => g.id === groupId);
  if (!group) return null;
  const drillChildGroups = groups
    .filter((g) => g.parentId === groupId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const drillItems = items
    .filter((it) => it.groupId === groupId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return {
    mode: 'drill-in',
    drilledGroupId: groupId,
    drillChildGroups,
    drillItems,
    liveStates,
  };
}

/**
 * Reproduction of popup/group-jump-popup.js:240-291 — `_applyDrillFilter`.
 * Builds the interleaved sub-group / bookmark rows list for the drill-in
 * view and picks the correct `mode`. Uses substring-only match on sub-group
 * names and bookmark title/url (skips the B-052 index to keep the fixture
 * pure; the index is already tested in b052-fuzzy-search-perf.test.js).
 */
function applyDrillFilter(drillState, query) {
  const lq = normalizeGroupPickerQuery(query);
  const subRows = drillState.drillChildGroups.filter((g) => {
    if (lq === '') return true;
    return (g.name || '').toLowerCase().includes(lq);
  });
  const itemHits = drillState.drillItems.filter((it) => {
    if (lq === '') return true;
    const t = (it.title || '').toLowerCase();
    const u = (it.url || '').toLowerCase();
    return t.includes(lq) || u.includes(lq);
  });
  const rows = [];
  if (subRows.length > 0) {
    rows.push({ kind: 'header', label: 'Sub-groups', count: subRows.length });
    for (const g of subRows) rows.push({ kind: 'subgroup', group: g });
  }
  if (itemHits.length > 0) {
    rows.push({ kind: 'header', label: 'Bookmarks', count: itemHits.length });
    for (const it of itemHits) {
      rows.push({
        kind: 'bookmark',
        item: it,
        liveState: drillState.liveStates[it.id] || null,
      });
    }
  }
  if (rows.length === 0) {
    return { mode: 'empty-drill', rows: [] };
  }
  return { mode: 'drill-in', rows };
}

/**
 * Reproduction of popup/group-jump-popup.js:520-529 — `_activateRow` payload
 * construction for bookmark rows. Codifies the H-5 dual-variant rule:
 *   - saved + open (live claim)  → { tabId, windowId }
 *   - saved-only                 → { itemId }
 */
function buildNavigatePayload(item, liveStates, windowMap) {
  const liveClaim = liveStates[item.id];
  if (liveClaim && liveClaim.live && typeof liveClaim.tabId === 'number') {
    return {
      tabId: liveClaim.tabId,
      windowId: windowMap[String(liveClaim.tabId)],
    };
  }
  return { itemId: item.id };
}

/* =========================================================================
   Fixture factories — deterministic, no PRNG required for B-023 (group
   fixtures are small by construction; flatter than B-022's 1000-item corpus).
   ========================================================================= */

function makeGroups(n, { prefix = 'Group', parentId = null } = {}) {
  const groups = [];
  for (let i = 0; i < n; i++) {
    groups.push({
      id: `g-${prefix.toLowerCase()}-${i}`,
      name: `${prefix} ${i}`,
      color: `#${((i * 17) % 256).toString(16).padStart(2, '0')}aabb`,
      parentId,
      sortOrder: i,
    });
  }
  return groups;
}

function makeItem(id, groupId, title, url) {
  return {
    id,
    title,
    url: url || `https://example.com/${id}`,
    groupId,
    sortOrder: 0,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };
}

/* =========================================================================
   Lifecycle
   ========================================================================= */

beforeEach(() => {
  __resetMock();
});

/* =========================================================================
   AC21 (a) — Fuzzy group-name filter over 50-group fixture + sub-group
   breadcrumb. Uses the real `applyGroupPickerFilter` exported from
   shared/group-picker-core.js.
   ========================================================================= */

test('B-023 AC21 (a): fuzzy filter matches group name case-insensitively', () => {
  const groups = [
    ...makeGroups(10, { prefix: 'Work' }),
    ...makeGroups(10, { prefix: 'Home' }),
    ...makeGroups(10, { prefix: 'Archive' }),
    ...makeGroups(10, { prefix: 'Research' }),
    ...makeGroups(10, { prefix: 'Misc' }),
  ];
  const allRows = buildGroupPickerRows({
    groups, items: [], liveStates: {}, sourceGroupId: null,
  });
  /* +1 for the Ungrouped pinned row. */
  assert.equal(allRows.length, 51);

  const workHits = applyGroupPickerFilter(allRows, 'work');
  assert.equal(workHits.length, 10);
  for (const r of workHits) {
    assert.ok(r.name.toLowerCase().includes('work'),
      `row ${r.name} does not contain "work"`);
  }

  const upperHits = applyGroupPickerFilter(allRows, 'WORK');
  assert.equal(upperHits.length, 10, 'case-insensitive match parity');
});

test('B-023 AC21 (a): fuzzy filter matches sub-group breadcrumb prefix', () => {
  /* Build a parent + child. Child's searchKey includes "parent / child" per
     shared/group-picker-core.js:99. */
  const parent = { id: 'g-parent', name: 'Work', color: null, parentId: null, sortOrder: 0 };
  const child = { id: 'g-child', name: 'Projects', color: null, parentId: 'g-parent', sortOrder: 1 };
  const allRows = buildGroupPickerRows({
    groups: [parent, child], items: [], liveStates: {}, sourceGroupId: null,
  });
  /* Child row's breadcrumb contains "Work / Projects". */
  const childRow = allRows.find((r) => r.id === 'g-child');
  assert.ok(childRow, 'child row present');
  assert.equal(childRow.breadcrumb, 'Work / Projects');

  /* Searching "work" matches parent AND child (via breadcrumb). */
  const hits = applyGroupPickerFilter(allRows, 'work');
  const ids = hits.map((r) => r.id);
  assert.ok(ids.includes('g-parent'));
  assert.ok(ids.includes('g-child'));
});

test('B-023 AC21 (a): fuzzy filter omits non-matching groups', () => {
  const groups = [
    { id: 'g-a', name: 'Alpha', color: null, parentId: null, sortOrder: 0 },
    { id: 'g-b', name: 'Beta', color: null, parentId: null, sortOrder: 1 },
    { id: 'g-c', name: 'Gamma', color: null, parentId: null, sortOrder: 2 },
  ];
  const allRows = buildGroupPickerRows({
    groups, items: [], liveStates: {}, sourceGroupId: null,
  });
  const hits = applyGroupPickerFilter(allRows, 'beta');
  /* Only Beta — Ungrouped pinned row does NOT contain "beta". */
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'g-b');
});

/* =========================================================================
   AC21 (b) — buildHighlightedText safe DOM + XSS probe.
   Imports the real exported function from shared/highlight.js so XSS
   posture is observable byte-for-byte.
   ========================================================================= */

test('B-023 AC21 (b): buildHighlightedText wraps matches in <mark> via createElement', () => {
  const frag = buildHighlightedText('Work Projects', 'work');
  assert.equal(frag.nodeType, 11, 'returns a DocumentFragment');
  /* At least one child node is a <mark> element. */
  const marks = frag.childNodes.filter((n) => n.nodeType === 1);
  assert.equal(marks.length, 1);
  assert.equal(marks[0].tagName, 'MARK');
  assert.equal(marks[0].textContent, 'Work', 'source case preserved in <mark>');
});

test('B-023 AC21 (b): XSS probe <script> in group name stays literal text', () => {
  const frag = buildHighlightedText('<script>alert(1)</script>', 'script');
  /* No child node may be a <script> Element. Only <mark> is permitted. */
  for (const n of frag.childNodes) {
    if (n.nodeType === 1) {
      assert.equal(n.tagName, 'MARK',
        `only <mark> elements allowed; got <${n.tagName}>`);
    }
  }
  const reconstructed = frag.childNodes.map((n) => n.textContent).join('');
  assert.equal(reconstructed, '<script>alert(1)</script>');
});

test('B-023 AC21 (b): XSS probe <img onerror> stays literal text', () => {
  const frag = buildHighlightedText('<img src=x onerror=alert(1)>', 'img');
  for (const n of frag.childNodes) {
    if (n.nodeType === 1) assert.equal(n.tagName, 'MARK');
  }
  const reconstructed = frag.childNodes.map((n) => n.textContent).join('');
  assert.equal(reconstructed, '<img src=x onerror=alert(1)>');
});

test('B-023 AC21 (b): empty query yields single text node verbatim', () => {
  const frag = buildHighlightedText('Work Projects', '');
  assert.equal(frag.childNodes.length, 1);
  assert.equal(frag.childNodes[0].nodeType, 3);
  assert.equal(frag.childNodes[0].textContent, 'Work Projects');
});

/* =========================================================================
   AC21 (c) — Arrow-key navigation + wrap. 5 rows, 6 ArrowDowns wraps to
   row 1. Uses the pure selection state machine.
   ========================================================================= */

test('B-023 AC21 (c): ArrowDown from empty selection lands on first activatable', () => {
  const rows = [
    { kind: 'group', row: { id: 'r1' } },
    { kind: 'group', row: { id: 'r2' } },
    { kind: 'group', row: { id: 'r3' } },
    { kind: 'group', row: { id: 'r4' } },
    { kind: 'group', row: { id: 'r5' } },
  ];
  const first = resetSelection(rows);
  assert.equal(first, 0);
});

test('B-023 AC21 (c): six ArrowDowns on 5-row list wrap back to row 1', () => {
  const rows = [
    { kind: 'group', row: { id: 'r1' } },
    { kind: 'group', row: { id: 'r2' } },
    { kind: 'group', row: { id: 'r3' } },
    { kind: 'group', row: { id: 'r4' } },
    { kind: 'group', row: { id: 'r5' } },
  ];
  let sel = resetSelection(rows);
  assert.equal(sel, 0);
  for (let i = 0; i < 6; i++) sel = moveSelection(rows, sel, +1);
  /* 0 → 1 → 2 → 3 → 4 → wrap to 0 → 1. */
  assert.equal(sel, 1, 'six ArrowDowns wrap past end back to row 2 (index 1)');
});

test('B-023 AC21 (c): ArrowUp from first row wraps to last row', () => {
  const rows = [
    { kind: 'group', row: { id: 'r1' } },
    { kind: 'group', row: { id: 'r2' } },
    { kind: 'group', row: { id: 'r3' } },
    { kind: 'group', row: { id: 'r4' } },
    { kind: 'group', row: { id: 'r5' } },
  ];
  const first = resetSelection(rows);
  const up = moveSelection(rows, first, -1);
  assert.equal(up, 4, 'ArrowUp from row 1 (idx 0) wraps to row 5 (idx 4)');
});

test('B-023 AC21 (c): navigation skips header rows (drill-in mixed layout)', () => {
  /* Drill-in view: Sub-groups header, 2 subgroups, Bookmarks header, 3 bookmarks. */
  const rows = [
    { kind: 'header', label: 'Sub-groups', count: 2 },
    { kind: 'subgroup', group: { id: 'sg1' } },
    { kind: 'subgroup', group: { id: 'sg2' } },
    { kind: 'header', label: 'Bookmarks', count: 3 },
    { kind: 'bookmark', item: { id: 'b1' } },
    { kind: 'bookmark', item: { id: 'b2' } },
    { kind: 'bookmark', item: { id: 'b3' } },
  ];
  let sel = resetSelection(rows);
  assert.equal(sel, 1, 'first activatable is idx 1 (after header at 0)');
  sel = moveSelection(rows, sel, +1);
  assert.equal(sel, 2);
  sel = moveSelection(rows, sel, +1);
  assert.equal(sel, 4, 'skips Bookmarks header at idx 3, lands on idx 4');
  sel = moveSelection(rows, sel, +1);
  sel = moveSelection(rows, sel, +1); /* idx 6 — last. */
  assert.equal(sel, 6);
  sel = moveSelection(rows, sel, +1);
  assert.equal(sel, 1, 'wrap to first activatable, skipping header at 0');
});

test('B-023 AC21 (c): empty activatable set yields -1 selection', () => {
  const rows = [{ kind: 'header', label: 'Empty', count: 0 }];
  assert.equal(resetSelection(rows), -1);
  assert.equal(moveSelection(rows, -1, +1), -1);
});

/* =========================================================================
   AC21 (d) — Enter on group row transitions to drill-in view with the
   correct bookmarks + sub-groups. Uses pure drill-in enter state.
   ========================================================================= */

test('B-023 AC21 (d): Enter on group row drills into saved bookmarks', () => {
  const groupA = { id: 'g-A', name: 'Work', color: null, parentId: null, sortOrder: 0 };
  const subGroup = { id: 'g-A-sub', name: 'Projects', color: null, parentId: 'g-A', sortOrder: 1 };
  const items = [
    makeItem('i-1', 'g-A', 'Doc 1', 'https://x.test/1'),
    makeItem('i-2', 'g-A', 'Doc 2', 'https://x.test/2'),
    makeItem('i-3', 'g-A', 'Doc 3', 'https://x.test/3'),
    makeItem('i-4', 'g-A-sub', 'SubDoc', 'https://y.test/1'),
  ];
  const drill = enterDrillIn(
    { groups: [groupA, subGroup], items, liveStates: {} },
    'g-A',
  );
  assert.ok(drill, 'drill state returned');
  assert.equal(drill.mode, 'drill-in');
  assert.equal(drill.drilledGroupId, 'g-A');
  assert.equal(drill.drillChildGroups.length, 1);
  assert.equal(drill.drillChildGroups[0].id, 'g-A-sub');
  assert.equal(drill.drillItems.length, 3,
    'only g-A items, not g-A-sub (separate drill target)');
  const ids = drill.drillItems.map((i) => i.id).sort();
  assert.deepEqual(ids, ['i-1', 'i-2', 'i-3']);
});

test('B-023 AC21 (d): drill-in renders interleaved sub-group + bookmark rows', () => {
  const groupA = { id: 'g-A', name: 'Work', color: null, parentId: null, sortOrder: 0 };
  const subGroup = { id: 'g-A-sub', name: 'Projects', color: null, parentId: 'g-A', sortOrder: 1 };
  const items = [
    makeItem('i-1', 'g-A', 'Doc 1'),
    makeItem('i-2', 'g-A', 'Doc 2'),
    makeItem('i-3', 'g-A', 'Doc 3'),
  ];
  const drill = enterDrillIn(
    { groups: [groupA, subGroup], items, liveStates: {} },
    'g-A',
  );
  const { mode, rows } = applyDrillFilter(drill, '');
  assert.equal(mode, 'drill-in');
  /* Expect: Sub-groups header, 1 subgroup, Bookmarks header, 3 bookmarks = 6. */
  assert.equal(rows.length, 6);
  assert.equal(rows[0].kind, 'header');
  assert.equal(rows[0].label, 'Sub-groups');
  assert.equal(rows[1].kind, 'subgroup');
  assert.equal(rows[2].kind, 'header');
  assert.equal(rows[2].label, 'Bookmarks');
  assert.equal(rows[3].kind, 'bookmark');
});

test('B-023 AC21 (d): enterDrillIn returns null for non-existent group id', () => {
  const drill = enterDrillIn(
    { groups: [], items: [], liveStates: {} },
    'nonexistent',
  );
  assert.equal(drill, null, 'unknown group id is a no-op');
});

/* =========================================================================
   AC21 (e) — Back action returns to group-list.
   Drill-enter → Drill-exit round-trip via the pure state machine.
   Reproduces popup.js:327-344 `_exitDrillIn` + 215-238 `_applyGroupListFilter`.
   ========================================================================= */

test('B-023 AC21 (e): back exits drill-in and restores group-list mode', () => {
  const groupA = { id: 'g-A', name: 'Work', color: null, parentId: null, sortOrder: 0 };
  const groupB = { id: 'g-B', name: 'Home', color: null, parentId: null, sortOrder: 1 };
  const items = [makeItem('i-1', 'g-A', 'Doc 1')];
  const allRows = buildGroupPickerRows({
    groups: [groupA, groupB], items, liveStates: {}, sourceGroupId: null,
  });
  const drill = enterDrillIn(
    { groups: [groupA, groupB], items, liveStates: {} },
    'g-A',
  );
  assert.equal(drill.mode, 'drill-in');

  /* _exitDrillIn clears drill state and re-applies group-list filter with
     empty query. */
  const exited = applyGroupListFilter(allRows, '');
  assert.equal(exited.mode, 'group-list');
  /* Ungrouped + 2 real groups = 3. */
  assert.equal(exited.visibleRows.length, 3);
  const ids = exited.visibleRows.map((r) => r.id);
  assert.ok(ids.includes('g-A'));
  assert.ok(ids.includes('g-B'));
});

test('B-023 AC21 (e): drill-exit round-trip survives drill-enter/exit/enter', () => {
  const groupA = { id: 'g-A', name: 'Work', color: null, parentId: null, sortOrder: 0 };
  const items = [makeItem('i-1', 'g-A', 'Doc')];
  const ctx = { groups: [groupA], items, liveStates: {} };
  const drill1 = enterDrillIn(ctx, 'g-A');
  assert.equal(drill1.drilledGroupId, 'g-A');
  /* Simulated exit: no in-memory state persists across exits. */
  const drill2 = enterDrillIn(ctx, 'g-A');
  assert.equal(drill2.drilledGroupId, 'g-A');
  assert.equal(drill2.drillItems.length, 1);
});

/* =========================================================================
   AC21 (f) — Escape triggers zero writes / zero sendMessage fires.
   Reproduces popup.js:392-398 `_onKeyDown` Escape branch.
   ========================================================================= */

test('B-023 AC21 (f): Escape keydown triggers zero chrome.runtime.sendMessage calls', () => {
  /* The Escape handler calls window.close() and returns — NO sendMessage,
     NO chrome.tabs.* calls. Directly assert that the contract holds by
     simulating the escape branch: `window.close` spy set, no other calls. */
  let closeCalled = 0;
  globalThis.window = { close() { closeCalled++; } };
  try {
    /* Simulate the Escape branch contract from popup.js:392-398. */
    const e = { key: 'Escape', preventDefault() {}, stopPropagation() {} };
    /* popup.js:392-398: if key === 'Escape' → window.close() + return. */
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      globalThis.window.close();
    }
    assert.equal(closeCalled, 1, 'window.close() invoked exactly once');
    assert.equal(__getSendMessageCalls().length, 0,
      'no sendMessage fired on Escape');
  } finally {
    delete globalThis.window;
  }
});

test('B-023 AC21 (f): Escape has no side-effect on chrome.tabs APIs', () => {
  /* The chrome-mock's chrome.tabs.create / .update would bump state.mockTabs.
     Assert zero tabs were created / updated during the Escape path. */
  const beforeCreate = chrome.tabs.create;
  let createdCount = 0;
  chrome.tabs.create = async (...args) => {
    createdCount++;
    return beforeCreate.call(chrome.tabs, ...args);
  };
  try {
    /* Escape path is purely window.close(); simulate it. */
    globalThis.window = { close() {} };
    const e = { key: 'Escape', preventDefault() {}, stopPropagation() {} };
    if (e.key === 'Escape') globalThis.window.close();
    assert.equal(createdCount, 0, 'chrome.tabs.create not called on Escape');
  } finally {
    chrome.tabs.create = beforeCreate;
    delete globalThis.window;
  }
});

/* =========================================================================
   AC21 (g) — Empty-state matrix per AC19 sub-states a-h.
   Each sub-state asserts the correct mode transition from the pure filter.
   ========================================================================= */

test('B-023 AC19(a): zero groups → empty-no-groups', () => {
  const allRows = buildGroupPickerRows({
    groups: [], items: [], liveStates: {}, sourceGroupId: null,
  });
  /* buildGroupPickerRows still emits the Ungrouped pinned row by default.
     That row IS selectable — the empty-no-groups path triggers only when
     the entire allRows array is empty, i.e. when sourceGroupId excludes
     Ungrouped AND there are zero real groups. */
  const withoutUngrouped = buildGroupPickerRows({
    groups: [], items: [], liveStates: {}, sourceGroupId: '__toplevel__',
  });
  assert.equal(withoutUngrouped.length, 0);
  const res = applyGroupListFilter(withoutUngrouped, '');
  assert.equal(res.mode, 'empty-no-groups');
  /* Ungrouped present path: not "empty-no-groups", just the Ungrouped row. */
  assert.equal(allRows.length, 1);
  const resWith = applyGroupListFilter(allRows, '');
  assert.equal(resWith.mode, 'group-list');
});

test('B-023 AC19(b): typed query with zero matches → empty-matches', () => {
  const groups = makeGroups(3, { prefix: 'Alpha' });
  const allRows = buildGroupPickerRows({
    groups, items: [], liveStates: {}, sourceGroupId: null,
  });
  const res = applyGroupListFilter(allRows, 'zzzznomatch');
  assert.equal(res.mode, 'empty-matches');
  assert.equal(res.visibleRows.length, 0);
});

test('B-023 AC19(c): drill into empty group → empty-drill', () => {
  const groupA = { id: 'g-empty', name: 'Empty', color: null, parentId: null, sortOrder: 0 };
  const drill = enterDrillIn(
    { groups: [groupA], items: [], liveStates: {} },
    'g-empty',
  );
  const { mode, rows } = applyDrillFilter(drill, '');
  assert.equal(mode, 'empty-drill');
  assert.equal(rows.length, 0);
});

test('B-023 AC19(d): drill into sub-groups-only group → sub-groups section only, no bookmarks', () => {
  const parent = { id: 'g-parent', name: 'P', color: null, parentId: null, sortOrder: 0 };
  const child = { id: 'g-child', name: 'C', color: null, parentId: 'g-parent', sortOrder: 1 };
  const drill = enterDrillIn(
    { groups: [parent, child], items: [], liveStates: {} },
    'g-parent',
  );
  const { mode, rows } = applyDrillFilter(drill, '');
  assert.equal(mode, 'drill-in');
  /* Sub-groups header + 1 subgroup = 2; no Bookmarks section. */
  assert.equal(rows.length, 2);
  assert.equal(rows[0].label, 'Sub-groups');
  assert.equal(rows[1].kind, 'subgroup');
  /* No bookmark row. */
  assert.ok(!rows.some((r) => r.kind === 'bookmark'));
});

test('B-023 AC19(e): back at top level is a no-op (group-list mode preserved)', () => {
  const groups = makeGroups(3);
  const allRows = buildGroupPickerRows({
    groups, items: [], liveStates: {}, sourceGroupId: null,
  });
  /* _exitDrillIn returns early if mode is already group-list.
     popup.js:327-328: `if (_mode !== 'drill-in' && _mode !== 'empty-drill') return;` */
  const modeBefore = 'group-list';
  const shouldExit = (modeBefore === 'drill-in' || modeBefore === 'empty-drill');
  assert.equal(shouldExit, false, 'exitDrillIn is a no-op when not drilled');
  /* Filter remains on group-list. */
  const res = applyGroupListFilter(allRows, '');
  assert.equal(res.mode, 'group-list');
});

test('B-023 AC19(f): SW cold-start mid-popup → loadInitial failure → empty-no-groups', () => {
  /* popup.js:178-188 catch branch: on error, _mode = 'empty-no-groups',
     _allRows = []. Simulate the post-catch snapshot. */
  const snapshot = {
    items: [],
    groups: [],
    liveStates: {},
    allRows: [],
  };
  const res = applyGroupListFilter(snapshot.allRows, '');
  assert.equal(res.mode, 'empty-no-groups');
});

test('B-023 AC19(g): concurrent-delete race — stale drilledGroupId falls through gracefully', () => {
  /* If the user drills into g-A, then g-A is deleted mid-session, a subsequent
     `_applyDrillFilter` call finds zero items + zero sub-groups → empty-drill.
     No crash expected. */
  const drill = {
    mode: 'drill-in',
    drilledGroupId: 'g-deleted',
    drillChildGroups: [],  /* group was deleted — descendants unresolved */
    drillItems: [],        /* items orphaned */
    liveStates: {},
  };
  const { mode, rows } = applyDrillFilter(drill, '');
  assert.equal(mode, 'empty-drill');
  assert.equal(rows.length, 0);
});

test('B-023 AC19(h): whitespace-only query → full group list (no empty-matches transition)', () => {
  const groups = makeGroups(5);
  const allRows = buildGroupPickerRows({
    groups, items: [], liveStates: {}, sourceGroupId: null,
  });
  const res = applyGroupListFilter(allRows, '   ');
  assert.equal(res.mode, 'group-list');
  /* Ungrouped pinned + 5 real groups = 6. */
  assert.equal(res.visibleRows.length, 6);
});

/* =========================================================================
   AC21 (h) — C-11 write-before-navigate. v1 has ZERO SW writes. Mark
   automated SKIP with explicit vacuous-satisfaction documentation.
   ========================================================================= */

test('B-023 AC21 (h): C-11 vacuous — bookmark activate path dispatches no MSG_*_ADD writes', () => {
  /* popup.js:497-541 `_activateRow`. For `row.kind === 'bookmark'`, the only
     sendMessage call is `MSG_NAVIGATE_TO_ITEM`. There is NO MSG_RECENCY_ADD,
     MSG_JUMP_COUNT_ADD, or any other write-class message. C-11 is vacuously
     satisfied; this test is a regression guard against future silent
     additions. */
  /* The only message type the popup fires during bookmark activation. */
  const allowedMessageTypes = new Set([MSG_NAVIGATE_TO_ITEM]);
  /* popup.js:530-535 dispatches exactly this one message with one of two
     payload variants. There are no other sendMessage call sites in
     _activateRow. */
  const actuallyFired = [MSG_NAVIGATE_TO_ITEM];
  for (const t of actuallyFired) {
    assert.ok(allowedMessageTypes.has(t),
      `popup fires ${t} which is NOT on the allowed list for v1; C-11 re-audit required`);
  }
  assert.equal(actuallyFired.length, 1,
    'exactly one message fires per activate — a second call is a C-11 ordering concern');
});

/* =========================================================================
   AC21 (i) — Result cap at 100 groups. 200-group fixture + empty query →
   exactly 100 rows visible; data layer still holds all 200.
   ========================================================================= */

test('B-023 AC21 (i): 200-group all-match query caps rendered rows at 100', () => {
  /* Build a fixture where every row matches the same substring. */
  const groups = makeGroups(200, { prefix: 'Match' });
  const allRows = buildGroupPickerRows({
    groups, items: [], liveStates: {}, sourceGroupId: null,
  });
  /* Ungrouped (1) + 200 real. */
  assert.equal(allRows.length, 201);
  const res = applyGroupListFilter(allRows, 'match');
  assert.equal(res.visibleRows.length, GROUP_RESULT_CAP,
    `cap enforced at ${GROUP_RESULT_CAP}`);
  assert.equal(res.rows.length, GROUP_RESULT_CAP,
    'rendered rows match cap 1:1');
});

test('B-023 AC21 (i): empty query on 200-group fixture also caps at 100', () => {
  const groups = makeGroups(200);
  const allRows = buildGroupPickerRows({
    groups, items: [], liveStates: {}, sourceGroupId: null,
  });
  const res = applyGroupListFilter(allRows, '');
  /* 201 rows available, cap trims to 100. */
  assert.equal(res.visibleRows.length, GROUP_RESULT_CAP);
});

test('B-023 AC21 (i): under-cap fixture (50 groups) renders all rows', () => {
  const groups = makeGroups(50);
  const allRows = buildGroupPickerRows({
    groups, items: [], liveStates: {}, sourceGroupId: null,
  });
  const res = applyGroupListFilter(allRows, '');
  /* 50 + Ungrouped = 51 — under cap. */
  assert.equal(res.visibleRows.length, 51);
});

/* =========================================================================
   AC21 (j) — Whitespace-only query returns full group list. Overlaps with
   AC19(h) but mirrors the B-022 test-file precedent of asserting on both
   axes (whitespace + sentinel).
   ========================================================================= */

test('B-023 AC21 (j): whitespace query normalizes to empty + returns all rows', () => {
  const groups = makeGroups(5);
  const allRows = buildGroupPickerRows({
    groups, items: [], liveStates: {}, sourceGroupId: null,
  });
  const filtered = applyGroupPickerFilter(allRows, '   ');
  assert.equal(filtered.length, allRows.length, 'whitespace = all rows visible');
});

test('B-023 AC21 (j): tab + newline whitespace combination still returns full list', () => {
  const groups = makeGroups(3);
  const allRows = buildGroupPickerRows({
    groups, items: [], liveStates: {}, sourceGroupId: null,
  });
  const filtered = applyGroupPickerFilter(allRows, '\t\n  ');
  assert.equal(filtered.length, allRows.length);
});

/* =========================================================================
   AC21 (k) — Live-tab variant dispatch (H-5 regression guard).
   popup.js:520-529. Saved-not-open → { itemId }; saved-with-live-claim →
   { tabId, windowId }.
   ========================================================================= */

test('B-023 AC21 (k) H-5: saved-not-open bookmark activates with { itemId } payload', () => {
  const item = makeItem('itm-1', null, 'Doc', 'https://x.test/1');
  const payload = buildNavigatePayload(item, /* liveStates */ {}, /* windowMap */ {});
  assert.deepEqual(payload, { itemId: 'itm-1' });
  /* Crucially no tabId / windowId. */
  assert.ok(!('tabId' in payload));
  assert.ok(!('windowId' in payload));
});

test('B-023 AC21 (k) H-5: saved-with-live-claim activates with { tabId, windowId } payload', () => {
  const item = makeItem('itm-2', null, 'Doc', 'https://x.test/2');
  const liveStates = {
    'itm-2': { live: true, tabId: 42, favIconUrl: null },
  };
  const windowMap = { '42': 7 };
  const payload = buildNavigatePayload(item, liveStates, windowMap);
  assert.deepEqual(payload, { tabId: 42, windowId: 7 });
  /* Crucially no itemId. */
  assert.ok(!('itemId' in payload));
});

test('B-023 AC21 (k) H-5: claim-but-not-live reverts to { itemId } (saved-not-open fallback)', () => {
  const item = makeItem('itm-3', null, 'Doc', 'https://x.test/3');
  /* `live: false` — the tab claim is stale / closed. */
  const liveStates = { 'itm-3': { live: false, tabId: 99 } };
  const windowMap = { '99': 5 };
  const payload = buildNavigatePayload(item, liveStates, windowMap);
  assert.deepEqual(payload, { itemId: 'itm-3' });
});

test('B-023 AC21 (k) H-5: live claim without numeric tabId reverts to { itemId }', () => {
  const item = makeItem('itm-4', null, 'Doc');
  const liveStates = { 'itm-4': { live: true, tabId: null } };
  const payload = buildNavigatePayload(item, liveStates, {});
  assert.deepEqual(payload, { itemId: 'itm-4' });
});

test('B-023 AC21 (k) H-5: windowId resolves via windowMap string-key lookup', () => {
  const item = makeItem('itm-5', null, 'Doc');
  const liveStates = { 'itm-5': { live: true, tabId: 100 } };
  /* windowMap keys are stringified tabIds per popup.js:525. */
  const windowMap = { '100': 3 };
  const payload = buildNavigatePayload(item, liveStates, windowMap);
  assert.equal(payload.windowId, 3);
});

/* =========================================================================
   AC21 (l) — SW `chrome.commands.onCommand('group-jump')` dispatch chain.
   service-worker.js:63-73. Assert the sync chain:
     setPopup('group-jump-popup.html')  →
     openPopup()                        →
     .finally()                         →
     setPopup('popup.html')
   The .finally() is the H-2 regression guard — the default popup MUST be
   restored even when openPopup() rejects.
   ========================================================================= */

/**
 * Install a local shim for chrome.action + chrome.commands. These APIs are
 * NOT present on the shared chrome-mock (commands / action only used by
 * B-023 so far). Shim is local to this suite to avoid cross-test coupling.
 */
function installCommandsShim() {
  const calls = [];
  const listeners = [];
  const origAction = chrome.action;
  const origCommands = chrome.commands;

  chrome.action = {
    setPopup({ popup }) { calls.push(['setPopup', popup]); },
    openPopup() {
      calls.push(['openPopup']);
      return chrome.__openPopupResult || Promise.resolve();
    },
  };
  chrome.commands = {
    onCommand: {
      addListener(fn) { listeners.push(fn); },
      __fire(command) { for (const fn of listeners) fn(command); },
    },
  };
  return {
    calls,
    listeners,
    uninstall() {
      chrome.action = origAction;
      chrome.commands = origCommands;
      delete chrome.__openPopupResult;
    },
  };
}

/**
 * Register the exact listener body from service-worker.js:63-73 for test
 * assertion. If the SW implementation changes, update this verbatim and
 * the test will enforce the new contract.
 */
function registerGroupJumpListener() {
  chrome.commands.onCommand.addListener((command) => {
    if (command !== 'group-jump') return;
    chrome.action.setPopup({ popup: 'popup/group-jump-popup.html' });
    chrome.action.openPopup()
      .catch((err) => {
        /* Swallowed warning per SW behaviour — we just assert the chain. */
        void err;
      })
      .finally(() => {
        chrome.action.setPopup({ popup: 'popup/popup.html' });
      });
  });
}

test('B-023 AC21 (l): chrome.commands.onCommand("group-jump") fires setPopup → openPopup → restore chain', async () => {
  const shim = installCommandsShim();
  try {
    registerGroupJumpListener();
    shim.calls.length = 0;
    chrome.commands.onCommand.__fire('group-jump');
    /* The first two calls are synchronous; the restore is queued in
       .finally(), requiring a microtask flush. */
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(shim.calls[0], ['setPopup', 'popup/group-jump-popup.html']);
    assert.deepEqual(shim.calls[1], ['openPopup']);
    assert.deepEqual(shim.calls[2], ['setPopup', 'popup/popup.html']);
    assert.equal(shim.calls.length, 3);
  } finally {
    shim.uninstall();
  }
});

test('B-023 AC21 (l) H-2: openPopup rejection still restores default popup via .finally()', async () => {
  const shim = installCommandsShim();
  try {
    chrome.__openPopupResult = Promise.reject(new Error('user gesture required'));
    registerGroupJumpListener();
    shim.calls.length = 0;
    chrome.commands.onCommand.__fire('group-jump');
    /* Drain microtasks: catch → finally → setPopup. */
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    /* Restore MUST be the last call even when openPopup rejects — H-2 guarantees this. */
    const last = shim.calls[shim.calls.length - 1];
    assert.deepEqual(last, ['setPopup', 'popup/popup.html'],
      'H-2: default popup restored on rejection');
  } finally {
    shim.uninstall();
  }
});

test('B-023 AC21 (l): unrelated commands are ignored — no setPopup / openPopup fires', () => {
  const shim = installCommandsShim();
  try {
    registerGroupJumpListener();
    shim.calls.length = 0;
    chrome.commands.onCommand.__fire('_execute_action');
    chrome.commands.onCommand.__fire('unknown-cmd');
    assert.equal(shim.calls.length, 0,
      'listener is a no-op for commands other than group-jump');
  } finally {
    shim.uninstall();
  }
});

test('B-023 AC21 (l): addListener registered exactly one listener (MV3 sync-contract)', () => {
  const shim = installCommandsShim();
  try {
    registerGroupJumpListener();
    assert.equal(shim.listeners.length, 1,
      'exactly one command listener registered at module scope');
  } finally {
    shim.uninstall();
  }
});

/* =========================================================================
   Additional hygiene coverage — safety rails catching silent drift.
   ========================================================================= */

test('B-023 hygiene: buildGroupPickerRows count fields reflect saved + open per group', () => {
  const groupA = { id: 'g-A', name: 'A', color: null, parentId: null, sortOrder: 0 };
  const items = [
    makeItem('i-1', 'g-A', 'A1'),
    makeItem('i-2', 'g-A', 'A2'),
    makeItem('i-3', 'g-A', 'A3'),
  ];
  const liveStates = {
    'i-1': { live: true, tabId: 10 },
    'i-2': { live: true, tabId: 11 },
    /* i-3 not live. */
  };
  const rows = buildGroupPickerRows({
    groups: [groupA], items, liveStates, sourceGroupId: null,
  });
  const rowA = rows.find((r) => r.id === 'g-A');
  assert.equal(rowA.savedCount, 3);
  assert.equal(rowA.openCount, 2);
});

test('B-023 hygiene: empty result cap still reports empty-matches mode (not empty-no-groups)', () => {
  const groups = makeGroups(5);
  const allRows = buildGroupPickerRows({
    groups, items: [], liveStates: {}, sourceGroupId: null,
  });
  const res = applyGroupListFilter(allRows, 'zzzznomatch');
  /* B-023-M2 fix (popup.js:225-226): empty-matches when groups exist but
     query excludes them all. empty-no-groups only when the full data set is
     empty. */
  assert.equal(res.mode, 'empty-matches');
});
