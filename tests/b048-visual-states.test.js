/**
 * b048-visual-states.test.js — B-048 R5 regression tests for the item visual-state
 * matrix (live / active / drifted / audible / selected).
 *
 * `sidepanel.js` is browser-only with no exports and DOM side-effects on load.
 * Following the pattern established by `b027-group-header-menu.test.js` and
 * `b061-unsavable-dim.test.js`, the pure visual-state decision logic
 * (`buildItemRowAriaLabel`, `_createItemSelect`, and the relevant
 * `buildItemRow` / `_setRowSelected` / `refetchAndPatchLiveState` branches)
 * is reproduced here with a light DOM shim so the contract can be exercised
 * deterministically without a real browser.
 *
 * Each reproduction cites its source location in `sidepanel/sidepanel.js`.
 *
 * Coverage targets (B-048 acceptance criteria):
 *   AC1 — grayscale distinction: every state has a non-color cue (attribute / icon / DOM)
 *   AC2 — coexistence: all five flags can co-apply to one row; cues don't occlude each other
 *   AC6 — hover-reveal: `.item-select` CSS visibility depends on :hover / :focus-visible /
 *         [data-selected="true"] — we assert on the CSS selector set that governs visibility
 *   AC7 — screen-reader label concat: deterministic order `active → live → drifted → audible → selected`
 *   AC8 — patch-path preserves aria-label rebuild (spy before/after state change)
 *   §31.5 — `.item-select` role="checkbox" / aria-checked / tabindex="-1" invariants
 *   Regression — `::before` pseudo has been removed; `.item-select` is the new affordance
 */

import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

/* B-065: the ARIA-label builder now lives in `shared/aria-label.js`.
   Production (sidepanel/sidepanel.js) and this regression suite exercise
   the exact same source of truth — no more test-side reproduction drift. */
import { buildItemRowAriaLabel } from '../shared/aria-label.js';

/* =========================================================================
   Minimal DOM shim — only what this test exercises (setAttribute,
   getAttribute, dataset, appendChild, querySelector).
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
    /* LIMITATION: only `.class` selectors are supported. Attribute selectors
       (e.g. `[data-x]`) and compound selectors silently return null — extend
       the shim before testing those paths, otherwise the assertion will
       false-pass on a missing match. */
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

function mkElem(tag) { return new FakeElement(tag); }

/* =========================================================================
   Reproduction of `_createItemSelect` + the relevant buildItemRow /
   _setRowSelected branches.
   ========================================================================= */

function _createItemSelect(selected) {
  const span = mkElem('SPAN');
  span.className = 'item-select';
  span.setAttribute('role', 'checkbox');
  span.setAttribute('aria-checked', selected ? 'true' : 'false');
  span.setAttribute('tabindex', '-1');
  /* B-048 M-1: mirror the production switch from "false" to "true" — the
     row-level aria-label already announces selection state, so hiding the
     child prevents double-announcement in browse-mode screen readers. */
  span.setAttribute('aria-hidden', 'true');
  return span;
}

function buildItemRow(item, liveStates, driftRecords) {
  const row = mkElem('DIV');
  row.className = 'item-row';
  row.setAttribute('role', 'listitem');
  row.setAttribute('tabindex', '0');
  row.dataset.itemId = item.id;

  const live = liveStates?.[item.id];
  const drifted = driftRecords?.[item.id];

  if (live?.live) row.dataset.live = 'true';
  if (live?.active) row.dataset.active = 'true';
  if (live?.audible) row.dataset.audible = 'true';
  if (drifted) row.dataset.drifted = 'true';

  row.appendChild(_createItemSelect(false));

  row.setAttribute('aria-label', buildItemRowAriaLabel(item, live, drifted, false));
  return row;
}

/* `_setRowSelected` — mirrors sidepanel.js B-048 branch. Here the caches are
   passed in explicitly because the shim is module-agnostic. */
function _setRowSelected(row, selected, item, live, drifted) {
  if (!row) return;
  if (selected) {
    row.dataset.selected = 'true';
    row.setAttribute('aria-selected', 'true');
  } else {
    delete row.dataset.selected;
    row.removeAttribute('aria-selected');
  }
  const checkbox = row.querySelector('.item-select');
  if (checkbox) checkbox.setAttribute('aria-checked', selected ? 'true' : 'false');
  if (item) {
    row.setAttribute('aria-label', buildItemRowAriaLabel(item, live, drifted, selected));
  }
}

/* `refetchAndPatchLiveState` row-loop reproduction — just the visual-state
   writes that feed AC8. */
function patchLiveState(row, item, nextLive, nextDrifted, selected) {
  if (nextLive?.live) row.dataset.live = 'true'; else delete row.dataset.live;
  if (nextLive?.active) row.dataset.active = 'true'; else delete row.dataset.active;
  if (nextLive?.audible) row.dataset.audible = 'true'; else delete row.dataset.audible;
  if (nextDrifted) row.dataset.drifted = 'true'; else delete row.dataset.drifted;
  row.setAttribute('aria-label', buildItemRowAriaLabel(item, nextLive, nextDrifted, selected));
}

/* =========================================================================
   AC1 — Grayscale distinction: every state has a non-color cue
   ========================================================================= */

test('AC1: live row exposes `data-live` (non-color cue — left rail driven by attribute selector)', () => {
  const row = buildItemRow(
    { id: 'a', title: 'Hello' },
    { a: { live: true } },
    {},
  );
  assert.equal(row.dataset.live, 'true');
});

test('AC1: active row exposes `data-active` (non-color cue — left rail + background)', () => {
  const row = buildItemRow(
    { id: 'a', title: 'Hello' },
    { a: { live: true, active: true } },
    {},
  );
  assert.equal(row.dataset.active, 'true');
});

test('AC1: drifted row exposes `data-drifted` (non-color cue — triangle icon)', () => {
  const row = buildItemRow(
    { id: 'a', title: 'Hello' },
    { a: { live: true } },
    { a: { at: 1 } },
  );
  assert.equal(row.dataset.drifted, 'true');
});

test('AC1: audible row exposes `data-audible` (non-color cue — speaker icon)', () => {
  const row = buildItemRow(
    { id: 'a', title: 'Hello' },
    { a: { live: true, audible: true } },
    {},
  );
  assert.equal(row.dataset.audible, 'true');
});

test('AC1: selected row exposes `data-selected` + `.item-select[aria-checked="true"]` (non-color cue — persistent checkbox)', () => {
  const row = buildItemRow({ id: 'a', title: 'Hello' }, {}, {});
  _setRowSelected(row, true, { id: 'a', title: 'Hello' }, undefined, undefined);
  assert.equal(row.dataset.selected, 'true');
  const checkbox = row.querySelector('.item-select');
  assert.ok(checkbox, '.item-select child must exist');
  assert.equal(checkbox.getAttribute('aria-checked'), 'true');
});

/* =========================================================================
   AC2 — Coexistence: all five flags can co-apply to one row
   ========================================================================= */

test('AC2: a single row can carry live + active + drifted + audible + selected without any cue occluding another', () => {
  const item = { id: 'a', title: 'Multi' };
  const live = { live: true, active: true, audible: true };
  const drifted = { at: 1 };
  const row = buildItemRow(item, { a: live }, { a: drifted });
  _setRowSelected(row, true, item, live, drifted);

  assert.equal(row.dataset.live, 'true');
  assert.equal(row.dataset.active, 'true');
  assert.equal(row.dataset.drifted, 'true');
  assert.equal(row.dataset.audible, 'true');
  assert.equal(row.dataset.selected, 'true');

  /* Checkbox is a flex child, not a ::before pseudo — verifies R2 decision
     that `.item-select` supersedes the pseudo-element. */
  const checkbox = row.querySelector('.item-select');
  assert.ok(checkbox, '.item-select must be a real DOM child, not a ::before pseudo');
  assert.equal(checkbox.getAttribute('aria-checked'), 'true');
  assert.equal(checkbox.getAttribute('role'), 'checkbox');
});

/* =========================================================================
   AC6 — Hover-reveal: layout slot reserved; checkbox visible on hover / focus / selected
   ========================================================================= */

test('AC6: .item-select exists on every row (layout slot always reserved — prevents reflow on hover)', () => {
  const rowLive = buildItemRow({ id: 'a', title: 'Live' }, { a: { live: true } }, {});
  const rowEmpty = buildItemRow({ id: 'b', title: 'Saved' }, {}, {});

  assert.ok(rowLive.querySelector('.item-select'), 'live row must carry .item-select slot');
  assert.ok(rowEmpty.querySelector('.item-select'), 'non-live row must also carry .item-select slot');
});

test('AC6: .item-select role / tabindex / aria-hidden invariants are stable (§31.5 contract)', () => {
  const row = buildItemRow({ id: 'a', title: 'Hello' }, {}, {});
  const checkbox = row.querySelector('.item-select');
  assert.equal(checkbox.getAttribute('role'), 'checkbox');
  assert.equal(checkbox.getAttribute('tabindex'), '-1', 'non-tab-stop per Gmail pattern');
  /* B-048 M-1: aria-hidden="true" so browse-mode AT does not double-announce
     the checkbox alongside the row-level aria-label. */
  assert.equal(checkbox.getAttribute('aria-hidden'), 'true');
  assert.equal(checkbox.getAttribute('aria-checked'), 'false', 'default unchecked');
});

test('AC6: toggling selection flips aria-checked on .item-select (hover-reveal-when-true becomes persistent)', () => {
  const item = { id: 'a', title: 'Hello' };
  const row = buildItemRow(item, {}, {});
  const checkbox = row.querySelector('.item-select');
  assert.equal(checkbox.getAttribute('aria-checked'), 'false');

  _setRowSelected(row, true, item, undefined, undefined);
  assert.equal(checkbox.getAttribute('aria-checked'), 'true');

  _setRowSelected(row, false, item, undefined, undefined);
  assert.equal(checkbox.getAttribute('aria-checked'), 'false');
});

/* =========================================================================
   AC7 — Screen-reader label: `buildItemRowAriaLabel` concat contract
   (active → live → drifted → audible → selected, lowercase, comma-space separated)
   ========================================================================= */

const TITLE_ITEM = { id: 'x', title: 'Docs' };

test('AC7: no flags → just the title', () => {
  assert.equal(
    buildItemRowAriaLabel(TITLE_ITEM, undefined, undefined, false),
    'Docs',
  );
});

test('AC7: live only → "<title>, live tab"', () => {
  assert.equal(
    buildItemRowAriaLabel(TITLE_ITEM, { live: true }, undefined, false),
    'Docs, live tab',
  );
});

test('AC7: active + live → active comes first (strongest identity)', () => {
  assert.equal(
    buildItemRowAriaLabel(TITLE_ITEM, { live: true, active: true }, undefined, false),
    'Docs, active tab, live tab',
  );
});

test('AC7: live + drifted → "<title>, live tab, tab content has changed"', () => {
  assert.equal(
    buildItemRowAriaLabel(TITLE_ITEM, { live: true }, { at: 1 }, false),
    'Docs, live tab, tab content has changed',
  );
});

test('AC7: live + audible → "<title>, live tab, playing audio" (lowercase — AC7 normalization)', () => {
  assert.equal(
    buildItemRowAriaLabel(TITLE_ITEM, { live: true, audible: true }, undefined, false),
    'Docs, live tab, playing audio',
  );
});

test('AC7: selected only → "<title>, selected" (selection is the last concat position)', () => {
  assert.equal(
    buildItemRowAriaLabel(TITLE_ITEM, undefined, undefined, true),
    'Docs, selected',
  );
});

test('AC7: all five flags → full concat in fixed order', () => {
  assert.equal(
    buildItemRowAriaLabel(
      TITLE_ITEM,
      { live: true, active: true, audible: true },
      { at: 1 },
      true,
    ),
    'Docs, active tab, live tab, tab content has changed, playing audio, selected',
  );
});

test('AC7: active-without-live is still first (selection mode where active is claimed but live flipped off transiently)', () => {
  /* Edge case: `active: true` but `live: false` should still honor the
     concat order (active first). This guards against a naive "if live then
     include active" bug. */
  assert.equal(
    buildItemRowAriaLabel(TITLE_ITEM, { active: true }, undefined, false),
    'Docs, active tab',
  );
});

/* =========================================================================
   AC8 — Patch-path preserves aria-label rebuild
   (spy on label attribute before/after state change)
   ========================================================================= */

test('AC8: patch path — live: false → live: true triggers aria-label rebuild', () => {
  const item = { id: 'a', title: 'Hello' };
  const row = buildItemRow(item, {}, {});
  const labelBefore = row.getAttribute('aria-label');
  assert.equal(labelBefore, 'Hello');

  patchLiveState(row, item, { live: true }, undefined, false);
  const labelAfter = row.getAttribute('aria-label');
  assert.equal(labelAfter, 'Hello, live tab');
  assert.notEqual(labelBefore, labelAfter, 'aria-label must change on patch');
});

test('AC8: patch path — live + active → drift arrives → aria-label grows', () => {
  const item = { id: 'a', title: 'Hello' };
  const row = buildItemRow(item, { a: { live: true, active: true } }, {});
  assert.equal(row.getAttribute('aria-label'), 'Hello, active tab, live tab');

  patchLiveState(row, item, { live: true, active: true }, { at: 1 }, false);
  assert.equal(
    row.getAttribute('aria-label'),
    'Hello, active tab, live tab, tab content has changed',
  );
});

test('AC8: patch path — audible toggles off → label shrinks', () => {
  const item = { id: 'a', title: 'Hello' };
  const row = buildItemRow(item, { a: { live: true, audible: true } }, {});
  assert.equal(row.getAttribute('aria-label'), 'Hello, live tab, playing audio');

  patchLiveState(row, item, { live: true }, undefined, false);
  assert.equal(row.getAttribute('aria-label'), 'Hello, live tab');
});

test('AC8: patch path — selection survives a live-state broadcast (AC7 "selected" stays when selected=true)', () => {
  const item = { id: 'a', title: 'Hello' };
  const row = buildItemRow(item, {}, {});
  _setRowSelected(row, true, item, undefined, undefined);
  assert.equal(row.getAttribute('aria-label'), 'Hello, selected');

  /* Simulate refetchAndPatchLiveState receiving a live-state + caller
     computing `isSelected` from _selection. */
  patchLiveState(row, item, { live: true, active: true }, undefined, true);
  assert.equal(row.getAttribute('aria-label'), 'Hello, active tab, live tab, selected');
});

/* =========================================================================
   Regression — `::before` pseudo-element has been removed
   `.item-select` is the new affordance
   ========================================================================= */

test('regression: the checkbox is a real DOM node, not a ::before pseudo (B-048 §31.5 decision)', () => {
  const row = buildItemRow({ id: 'a', title: 'Hello' }, {}, {});
  const checkbox = row.querySelector('.item-select');
  assert.ok(checkbox, 'must exist as a descendant — not a CSS pseudo-element');
  assert.equal(checkbox.tagName, 'SPAN');
  assert.equal(checkbox.getAttribute('role'), 'checkbox');
});

test('regression: .item-select is the FIRST child of the row (stacking order §31.4)', () => {
  const row = buildItemRow({ id: 'a', title: 'Hello' }, {}, {});
  assert.ok(row.children.length > 0, 'row has children');
  assert.equal(row.children[0].className, 'item-select', 'first child is the checkbox slot');
});

/* =========================================================================
   Icon aria-hidden audit (AC7 deduplication)
   ========================================================================= */

test('AC7: audible + drifted icons do NOT duplicate the row-level label when row aria-label carries the state', () => {
  /* The real _createAudibleIcon / _createDriftedIcon set `aria-hidden="true"`
     so AT reads the state from the row-level aria-label only. This test
     reproduces the factories to guard the contract. */
  function createAudibleIcon() {
    const span = mkElem('SPAN');
    span.className = 'item-audible-icon';
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
  function createDriftedIcon() {
    const span = mkElem('SPAN');
    span.className = 'item-drifted-icon';
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
  const audible = createAudibleIcon();
  const drifted = createDriftedIcon();
  assert.equal(audible.getAttribute('aria-hidden'), 'true');
  assert.equal(drifted.getAttribute('aria-hidden'), 'true');
  assert.equal(audible.getAttribute('aria-label'), null, 'no per-icon label — avoid duplicate AT announcement');
  assert.equal(drifted.getAttribute('aria-label'), null, 'no per-icon label — avoid duplicate AT announcement');
});

/* =========================================================================
   Q-M1 — AC2 regression guard: drifted-without-live at first paint.
   The `buildItemRow` indicators branch only renders `.item-indicators` when
   `needsAudible || needsDrifted || needsWindowBadge` is true; drift-only
   rows (tab closed but drift record persists) must continue to expose the
   `data-drifted` cue and carry "tab content has changed" in the aria-label.
   ========================================================================= */

test('Q-M1 (AC2): drifted && !live row still exposes the drift cue at first paint', () => {
  const row = buildItemRow(
    { id: 'a', title: 'Stale' },
    /* liveStates empty — tab has been closed, no live claim. */
    {},
    { a: { at: 1 } },
  );
  assert.equal(row.dataset.drifted, 'true', 'drift attribute must land even without a live claim');
  assert.equal(row.dataset.live, undefined, 'no data-live when the tab is no longer live');
  assert.equal(
    row.getAttribute('aria-label'),
    'Stale, tab content has changed',
    'AT must hear the drift token even with live flipped off',
  );
});

/* =========================================================================
   L-3 — null-item contract for `buildItemRowAriaLabel` (M-3 companion).
   Locks the explicit null guard so a future refactor does not silently
   delegate the fallback back to each call site.
   ========================================================================= */

test('L-3 / M-3: buildItemRowAriaLabel(null, ...) returns "Untitled" without throwing', () => {
  assert.equal(
    buildItemRowAriaLabel(null, undefined, undefined, false),
    'Untitled',
  );
  assert.equal(
    buildItemRowAriaLabel(undefined, { live: true }, { at: 1 }, true),
    'Untitled',
  );
});

/* =========================================================================
   Exhaustive 32-combination sweep (2^5 flag combos) — AC7 guarantee
   ========================================================================= */

test('AC7: all 32 flag combinations produce a strictly ordered label', () => {
  const TOKEN = {
    active: 'active tab',
    live: 'live tab',
    drifted: 'tab content has changed',
    audible: 'playing audio',
    selected: 'selected',
  };
  const ORDER = ['active', 'live', 'drifted', 'audible', 'selected'];

  for (let mask = 0; mask < 32; mask++) {
    const flags = {
      active: !!(mask & 0b00001),
      live: !!(mask & 0b00010),
      drifted: !!(mask & 0b00100),
      audible: !!(mask & 0b01000),
      selected: !!(mask & 0b10000),
    };
    const label = buildItemRowAriaLabel(
      { title: 'T' },
      { live: flags.live, active: flags.active, audible: flags.audible },
      flags.drifted ? { at: 1 } : undefined,
      flags.selected,
    );
    const parts = label.split(', ');
    assert.equal(parts[0], 'T', `mask=${mask}: title must be first`);
    const expected = ['T'];
    for (const key of ORDER) if (flags[key]) expected.push(TOKEN[key]);
    assert.equal(label, expected.join(', '), `mask=${mask}: concat order must be ${ORDER.join('→')}`);
  }
});

/* =========================================================================
   AC4 — Hover distinction on active rows.
   The `.item-row[data-active="true"]:hover` rule must exist and resolve
   `background: var(--active-bg-hover)`. Source-order matters: the rule must
   follow the plain `[data-active="true"]` rule so specificity + source order
   land on the hover background when both apply.
   ========================================================================= */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CSS_PATH = resolve(__dirname, '..', 'sidepanel', 'sidepanel.css');
const CSS_SRC = readFileSync(CSS_PATH, 'utf8');
/* B-037 §45.3 D-3 — palette tokens moved to shared/themes.css. The
   sidepanel.css file no longer carries `[data-theme="…"]` palette blocks.
   Token-presence assertions read this superset stylesheet. */
const SHARED_THEMES_PATH = resolve(__dirname, '..', 'shared', 'themes.css');
const SHARED_THEMES_SRC = readFileSync(SHARED_THEMES_PATH, 'utf8');

test('AC4: `.item-row[data-active="true"]:hover` rule exists and targets `var(--active-bg-hover)`', () => {
  /* Extract the selector block and confirm it references the hover token.
     Regex is deliberately permissive (allows whitespace variations) but locks
     the selector pair + token reference. */
  const re = /\.item-row\[data-active="true"\]:hover\s*\{[^}]*background:\s*var\(--active-bg-hover\)/;
  assert.ok(
    re.test(CSS_SRC),
    '`.item-row[data-active="true"]:hover { background: var(--active-bg-hover); }` must exist in sidepanel.css',
  );
});

test('AC4: `--active-bg-hover` token is defined across the consolidated theme blocks', () => {
  /* B-037 §45.3 D-3: palette blocks moved to shared/themes.css. The token
     must be defined per-theme there. Count occurrences across the 13 named
     themes + system + 2 legacy aliases + dark-system override = ≥ 13
     definitions (one per resolvable `[data-theme="…"]` block). */
  const matches = SHARED_THEMES_SRC.match(/--active-bg-hover:\s*#[0-9a-fA-F]{3,8}/g) || [];
  assert.ok(
    matches.length >= 13,
    `--active-bg-hover must be defined per theme in shared/themes.css; found ${matches.length}`,
  );
});

test('AC4: hover rule is source-ordered AFTER `.item-row[data-active="true"]` (specificity + source-order)', () => {
  const baseIdx = CSS_SRC.indexOf('.item-row[data-active="true"] {');
  const hoverIdx = CSS_SRC.indexOf('.item-row[data-active="true"]:hover');
  assert.ok(baseIdx > 0, 'base active rule must exist');
  assert.ok(hoverIdx > 0, 'hover active rule must exist');
  assert.ok(
    hoverIdx > baseIdx,
    'hover rule must appear after the base rule so source order lands the hover background when both selectors match',
  );
});

/* =========================================================================
   AC5 — Focus-visible composition over selection border.
   `.item-row[data-selected="true"]` must use `box-shadow: inset` (not
   `outline`) so the `:focus-visible` outline layers on top rather than
   competing for the single outline slot.
   ========================================================================= */

test('AC5: `.item-row[data-selected="true"]` uses `box-shadow: inset` (not `outline`) so :focus-visible composes on top', () => {
  const re = /\.item-row\[data-selected="true"\]\s*\{[^}]*box-shadow:\s*inset[^}]*var\(--selected-border\)/;
  assert.ok(
    re.test(CSS_SRC),
    'selected row must declare `box-shadow: inset 0 0 0 1px var(--selected-border)` so the focus outline composes on top',
  );
});

/* =========================================================================
   AC6 — Hover-reveal selector triad.
   The `.item-select` visibility must flip to `visible` on ANY of:
     `.item-row:hover`, `.item-row:focus-visible`, `.item-row[data-selected="true"]`.
   The layout slot must always be reserved (`flex: 0 0 18px`).
   ========================================================================= */

test('AC6: `.item-select` reveal selector triad exists (:hover, :focus-visible, [data-selected="true"])', () => {
  assert.ok(
    CSS_SRC.includes('.item-row:hover .item-select'),
    'hover branch of the reveal triad must exist',
  );
  assert.ok(
    CSS_SRC.includes('.item-row:focus-visible .item-select'),
    'focus-visible branch of the reveal triad must exist',
  );
  assert.ok(
    CSS_SRC.includes('.item-row[data-selected="true"] .item-select'),
    'persistent (selected) branch of the reveal triad must exist',
  );
  /* The three selectors must all land on the same declaration block — grep for
     the full selector list followed by `visibility: visible`. */
  const re = /\.item-row:hover \.item-select,\s*\n\s*\.item-row:focus-visible \.item-select,\s*\n\s*\.item-row\[data-selected="true"\] \.item-select\s*\{\s*\n\s*visibility:\s*visible/;
  assert.ok(re.test(CSS_SRC), 'the three reveal selectors must share one `visibility: visible` declaration');
});

test('AC6: `.item-select` layout slot is always reserved (flex: 0 0 18px — no-reflow guarantee)', () => {
  const re = /\.item-select\s*\{[^}]*flex:\s*0\s+0\s+18px/;
  assert.ok(re.test(CSS_SRC), '.item-select must declare `flex: 0 0 18px` so the layout slot is always reserved');
});

test('AC6: default `.item-select` visibility is hidden (revealed only by the triad)', () => {
  const re = /\.item-select\s*\{[^}]*visibility:\s*hidden/;
  assert.ok(re.test(CSS_SRC), '.item-select must default to visibility: hidden');
});

/* =========================================================================
   H-1 regression — dark-theme checkmark stroke color.
   The checkmark SVG stroke in dark theme must be `%230a0f1a` (dark
   `--on-accent` token value, URL-encoded) — NOT `white`. Protects the
   WCAG AA 3:1 non-text threshold for the checked checkmark on
   `--selected-border` (#60a5fa).
   ========================================================================= */

test('H-1: dark themes resolve `--item-select-checked-bg` to the dark `--on-accent` (#0a0f1a or palette equivalent) for AA contrast on `--selected-border`', () => {
  /* B-037 §45.3 D-3: per-theme stroke colour is encoded into the
     `--item-select-checked-bg` custom property declared in shared/themes.css.
     The legacy `[data-theme="dark"]` alias retains the original `%230a0f1a`
     (one-dark `--on-accent`) value. The dark-system @media block must also
     define the dark-stroke variant. */
  const legacyDarkAliasRe = /\[data-theme="dark"\][\s\S]*?--item-select-checked-bg:\s*url\("data:image\/svg\+xml,[^"]*stroke='%23[0-9a-fA-F]{6}'/;
  assert.ok(
    legacyDarkAliasRe.test(SHARED_THEMES_SRC),
    'legacy `[data-theme="dark"]` alias must define `--item-select-checked-bg` with a non-white stroke for AA contrast',
  );
  /* System dark: `[data-theme="system"]` inside `@media (prefers-color-scheme: dark)`
     must override `--item-select-checked-bg` with the dark `--on-accent` (#0a0f1a). */
  const systemDarkRe = /@media \(prefers-color-scheme: dark\)\s*\{[\s\S]*?\[data-theme="system"\][\s\S]*?--item-select-checked-bg:\s*url\("data:image\/svg\+xml,[^"]*stroke='%230a0f1a'/;
  assert.ok(
    systemDarkRe.test(SHARED_THEMES_SRC),
    'system-dark override must re-encode the checkmark SVG with `stroke=\'%230a0f1a\'` — parity with the forced-dark override',
  );
});

test('H-1: light-theme base `.item-select[aria-checked="true"]` consumes `var(--item-select-checked-bg)`; light themes resolve to a white-stroke SVG for AA contrast on light `--selected-border`', () => {
  /* B-037 §45.3 D-3: the rule itself in sidepanel.css references the
     `--item-select-checked-bg` custom property; the per-theme value lives in
     shared/themes.css. R4 HIGH-2 added a fallback URL — the regex tolerates
     both the bare `var(--item-select-checked-bg)` and the fallback form
     `var(--item-select-checked-bg, url(...))`. */
  const ruleRe = /\.item-select\[aria-checked="true"\]\s*\{[\s\S]*?background-image:\s*var\(--item-select-checked-bg[,)]/;
  assert.ok(
    ruleRe.test(CSS_SRC),
    'sidepanel.css `.item-select[aria-checked="true"]` rule must consume `var(--item-select-checked-bg)`',
  );
  /* The default (`[data-theme="system"]` light) palette must define
     `--item-select-checked-bg` with `stroke='white'`. */
  const lightSystemRe = /\[data-theme="system"\]\s*\{[\s\S]*?--item-select-checked-bg:\s*url\("data:image\/svg\+xml,[^"]*stroke='white'/;
  assert.ok(
    lightSystemRe.test(SHARED_THEMES_SRC),
    'default light-system palette must define `--item-select-checked-bg` with `stroke=\'white\'`',
  );
});

/* =========================================================================
   AC9 — Zero full-re-render on live-state patches.
   `refetchAndPatchLiveState` must NEVER call `replaceChildren`, `innerHTML =`,
   or `replaceWith` on the item list root or on a row node. The patch path
   updates dataset attributes and aria-label in place so existing DOM nodes
   (and user focus) survive across state toggles.
   ========================================================================= */

test('AC9: `refetchAndPatchLiveState` body contains no full-re-render DOM ops (no innerHTML / replaceChildren / row.replaceWith)', () => {
  const SIDEPANEL_JS = resolve(__dirname, '..', 'sidepanel', 'sidepanel.js');
  const src = readFileSync(SIDEPANEL_JS, 'utf8');
  const startIdx = src.indexOf('async function refetchAndPatchLiveState');
  assert.ok(startIdx > 0, 'refetchAndPatchLiveState function must exist');

  /* Walk forward brace-counting to isolate the function body. */
  const openIdx = src.indexOf('{', startIdx);
  let depth = 0;
  let endIdx = openIdx;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { endIdx = i; break; }
    }
  }
  const body = src.slice(openIdx, endIdx + 1);

  /* There is one legitimate escape hatch: when the panel was showing the
     empty state, the patch path falls through to a full `renderAll` call
     (see source at L2573). `renderAll` itself uses `replaceChildren` — that
     is out of scope of the AC9 "zero full-re-render" guarantee, which is
     scoped to the steady-state patch path. We assert the patch path itself
     does not rebuild rows in-place. */
  assert.ok(
    !/itemListEl\.replaceChildren/.test(body),
    'patch path must not call itemListEl.replaceChildren — that is a full re-render',
  );
  assert.ok(
    !/itemListEl\.innerHTML\s*=/.test(body),
    'patch path must not assign itemListEl.innerHTML — full re-render',
  );
  assert.ok(
    !/row\.(replaceWith|outerHTML\s*=)/.test(body),
    'patch path must not replace row nodes — AC9 "zero full re-render" contract',
  );
  /* Positive assertion: the patch path must update dataset + aria-label in
     place. If these attribute writes vanish in a refactor, the test catches
     the regression. */
  assert.ok(
    /row\.dataset\.live\s*=\s*'true'/.test(body),
    'patch path must update row.dataset.live in place',
  );
  assert.ok(
    /row\.setAttribute\(\s*'aria-label'/.test(body),
    'patch path must rebuild row aria-label in place',
  );
});

/* =========================================================================
   AC8 — Patch-path latency sanity.
   The aria-label rebuild for N rows must complete in well under 500ms even
   on a 1000-row collection. This is a lower bound — the real cost includes
   dataset writes, favicon patching, and indicator DOM shuffles, which are
   not reproducible in the shim. We bound the work of the aria-label rebuild
   path (the per-row critical-path call from refetchAndPatchLiveState) and
   assert it completes inside the AC8 budget with headroom.
   ========================================================================= */

test('AC8: aria-label rebuild for 1000 rows completes well under the 500ms AC8 budget', () => {
  const item = { id: 'x', title: 'Hello world' };
  const live = { live: true, active: true, audible: true };
  const drifted = { at: 1 };

  /* Warmup — avoid first-call JIT noise. */
  for (let i = 0; i < 50; i++) buildItemRowAriaLabel(item, live, drifted, true);

  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    buildItemRowAriaLabel(item, live, drifted, i % 2 === 0);
  }
  const elapsedMs = performance.now() - start;

  /* Generous ceiling: the real patch path does much more per row than this
     shim measures. We assert a comfortable headroom so the test does not
     flake on slow CI but does catch an O(N^2) regression or an accidental
     JSON.stringify on every call. */
  assert.ok(
    elapsedMs < 100,
    `aria-label rebuild for 1000 rows must complete in < 100ms (measured: ${elapsedMs.toFixed(2)}ms) — comfortable headroom under the 500ms AC8 budget`,
  );
});

/* =========================================================================
   B-055 regression — Open Tabs rows participate in the same multi-select
   contract as saved-item rows. Both row types must prepend `.item-select`
   as the first flex child and their aria-labels must flow through
   `buildItemRowAriaLabel` so the concat order is identical.
   ========================================================================= */

function buildOpenTabRow(tab, isSelected) {
  /* Repro of the B-055 Open Tabs row build (sidepanel.js:2220-2297, B-048-relevant
     portion). */
  const row = mkElem('DIV');
  row.className = 'item-row';
  row.dataset.tabId = String(tab.tabId);
  row.dataset.liveOnly = 'true';
  if (tab.active) row.dataset.active = 'true';
  if (tab.audible) row.dataset.audible = 'true';
  row.appendChild(_createItemSelect(isSelected));
  if (isSelected) {
    row.dataset.selected = 'true';
    row.setAttribute('aria-selected', 'true');
  }
  const openTabItem = { title: tab.title || tab.url || 'Untitled tab' };
  const openTabLive = { live: true, active: !!tab.active, audible: !!tab.audible };
  row.setAttribute('aria-label', buildItemRowAriaLabel(openTabItem, openTabLive, false, isSelected));
  return row;
}

test('B-055 regression: Open Tabs row prepends `.item-select` as first child (parity with saved-item rows)', () => {
  const row = buildOpenTabRow({ tabId: 42, title: 'Example', url: 'https://e.com' }, false);
  assert.equal(row.children[0].className, 'item-select', 'first child must be .item-select');
  assert.equal(row.children[0].getAttribute('role'), 'checkbox');
});

test('B-055 regression: Open Tabs row aria-label uses `buildItemRowAriaLabel` (same concat order as saved rows)', () => {
  const row = buildOpenTabRow(
    { tabId: 42, title: 'Music', url: 'https://music.example', active: true, audible: true },
    true,
  );
  /* Open Tabs rows are always `live: true` and never `drifted`. Selected = true. */
  assert.equal(
    row.getAttribute('aria-label'),
    'Music, active tab, live tab, playing audio, selected',
  );
});

test('B-055 regression: Open Tabs row Q-M4 — isSelected at build time sets aria-checked AND aria-label before insertion', () => {
  const selected = buildOpenTabRow({ tabId: 7, title: 'Pre-selected', url: 'https://x' }, true);
  const unselected = buildOpenTabRow({ tabId: 8, title: 'Not-selected', url: 'https://y' }, false);

  assert.equal(selected.children[0].getAttribute('aria-checked'), 'true');
  assert.equal(selected.dataset.selected, 'true');
  assert.ok(selected.getAttribute('aria-label').endsWith(', selected'));

  assert.equal(unselected.children[0].getAttribute('aria-checked'), 'false');
  assert.equal(unselected.dataset.selected, undefined);
  /* Use a suffix check so a title that literally contains "selected" (as this
     test's title does) cannot false-positive the negation. */
  assert.ok(
    !unselected.getAttribute('aria-label').endsWith(', selected'),
    'unselected row aria-label must not end with the ", selected" token',
  );
});
