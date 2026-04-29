# §56 — B-113 Item-Row Drag Handle on Hover + Checkbox in Multi-Select (R2 Design)

**Sprint:** 36
**Tier:** Full (S) — tier-upgraded from Fast Track at planning because drag interaction + multi-select state are tested behavior surfaces with regression risk.
**Status:** R6 close complete (2026-04-28) — shipped on `feature/sprint-36-ui-polish`. See §56.12.
**Owner:** [solution-architect]
**Depends on:** §31 (B-048 — Item Visual-State Matrix — establishes `.item-select` checkbox affordance with the AC6 hover-reveal contract that B-113 INTENTIONALLY modifies); §25 (B-024 — Multi-select + bulk action bar — owns `_updateBulkBar` + `#item-list.has-bulk-bar` class lifecycle); §36 (B-030 v2 — item drag-reorder — establishes `row.draggable = true` + drag handlers that B-113 must NOT disturb); §41 (B-035 — Standalone Window — Open Tabs section is a discovery surface, not a CRUD/drag surface).

**Out-of-scope (explicit):** (a) `_updateBulkBar` and selection state ownership — B-113 reads the existing `#item-list.has-bulk-bar` class but does not mutate it; (b) B-030 drag-reorder JS handlers — drag continues to work from anywhere on the row, the new handle is `pointer-events: none`; (c) B-024 multi-select toggle behavior or keyboard shortcuts; (d) keyboard accessibility for drag-reorder — keyboard reorder is still "not yet available" per the existing row title attribute; (e) new manifest permissions, message types, storage schema; (f) favicon, indicators strip, item-actions row positioning; (g) renaming `has-bulk-bar` → `multi-select-active` (Q3 trade-off — semantically accurate name is a future follow-up); (h) the `.group-drag-handle` element (only the SVG markup pattern is reused); (i) **open-tab rows — see §56.3 D-5 R2 binding correction**: open-tab rows are NOT draggable (verified at `sidepanel.js:2705-2772` — no `row.draggable = true` is set on the open-tab build path), so the new `.item-drag-handle` is OMITTED on open-tab rows for honest UX (avoid showing a non-functional affordance).

---

## §56.1 Overview

B-113 adds a small visual drag-handle (`⋮⋮`-style 6-dot SVG) to every saved-item row's first flex slot — appearing on hover when the user is NOT in multi-select mode. The pattern is reciprocal: the existing `.item-select` checkbox flips its hover-reveal contract to be visible ONLY when multi-select is active (any row selected). The handle is decorative — `pointer-events: none` ensures clicks pass through to the underlying `.item-row`, preserving B-030's "drag from anywhere on the row" contract verbatim.

The change is **purely declarative** — one new DOM element appended to every saved-item row at first paint, plus a small CSS rule reshuffle that scopes the existing `.item-row:hover .item-select` rule under `#item-list.has-bulk-bar`. Zero JavaScript runs in the hover/swap paths on every state transition; the CSS cascade does the rest.

R3 lands ~5 LOC in `sidepanel/sidepanel.js` (the new `<span class="item-drag-handle">` + SVG injected in `buildItemRow` after the existing `.item-select` append at line 2394) plus ~25 LOC of new CSS rules in `sidepanel/sidepanel.css` (positioning + hover/multi-select cascade) plus a new test file with ≥ 5 tests per AC7. Zero schema changes, zero new manifest permissions, zero new message types, zero JS runtime branching for the hover swap.

The visual cohesion with `.group-drag-handle` (which uses the same 6-circle SVG pattern at `sidepanel.js:2173`) reinforces "drag handle = grab affordance" semantics across both group and item surfaces — a cross-surface consistency win.

---

## §56.2 Existing-State Reality Check

**Today (2026-04-28 on `feature/sprint-36-ui-polish`, post-Wave-0 + post-W1-A + post-W1-B.2):**

- `sidepanel/sidepanel.js:2321` — `_createItemSelect(selected)` factory builds the existing checkbox span (`<span class="item-select" role="checkbox" tabindex="-1">`).
- `sidepanel/sidepanel.js:2394` — `buildItemRow` saved-row site appends `.item-select` as the FIRST flex child (per B-048 §31.5 D-1). Insertion point for the new `.item-drag-handle` is immediately after this line.
- `sidepanel/sidepanel.js:2738` — `buildOpenTabRow` open-tab site also appends `.item-select` (per B-055 multi-select participation). **Verified: this row does NOT set `row.draggable = true`** (the function at lines 2705-2772 builds the row without any drag handlers; `grep -n "draggable" sidepanel/sidepanel.js` returns only `2176` (group section) and `2344` (saved-item row)). Open-tab rows are not draggable; see §56.3 D-5.
- `sidepanel/sidepanel.js:2344` — `buildItemRow` sets `row.draggable = true` and `row.title = 'Drag to reorder (keyboard reorder not yet available)'`. The drag handler chain (B-030) attaches via the parent `#item-list` listener, dispatching from any descendant of `.item-row`.
- `sidepanel/sidepanel.js:2173` — `.group-drag-handle` SVG markup (6-circle 2×3 grid in 16×16 viewBox). B-113 reuses this pattern at `width="14" height="14"` for visual cohesion with the smaller item-row context.
- `sidepanel/sidepanel.js:1851-1864` — `_updateBulkBar` lifecycle: line 1857 removes `has-bulk-bar` class from `#item-list` when `_selection.size === 0`; line 1863 adds it when ≥ 1 row is selected. Single class, single owner — B-113 has no need to introduce new state plumbing.
- `sidepanel/sidepanel.css:1397-1432` — existing `.item-select` rules:
  - `flex: 0 0 18px` reserved slot (no-reflow guarantee preserved)
  - `width: 14px; height: 14px; visibility: hidden; pointer-events: none` (default invisible)
  - hover-reveal at line 1428-1432: `.item-row:hover .item-select, .item-row:focus-visible .item-select, .item-row[data-selected="true"] .item-select { visibility: visible; }` — **the rule B-113 splits**: the `:hover` clause moves under `#item-list.has-bulk-bar`; `:focus-visible` and `[data-selected="true"]` clauses remain unchanged.
- `sidepanel/sidepanel.css:461` — `.item-row:hover` rule (background tint on hover); not touched by B-113.
- `sidepanel/sidepanel.css:1462` — `#item-list.has-bulk-bar { padding-bottom: 56px; }` (existing space-for-bar rule); not touched.
- `tests/b048-visual-states.test.js` — heavy `.item-select` test surface. R1 Selector audit confirmed: all assertions are STRUCTURAL (`role="checkbox"`, `aria-checked`, `tabindex`, `aria-hidden` invariants + slot-existence guarantee), NOT behavioral about hover-reveal visibility. The existing AC6 hover-reveal contract is INTENTIONALLY modified by B-113; the b048 tests do not directly assert visibility-on-hover, so no existing test selectors break. R3 updates the b048 file's header comment (lines 18-19) to note B-113's modification of the AC6 contract.
- `tests/b024-multi-select.test.js` — selection toggle + bulk-bar integration tests. None directly assert hover-reveal visibility on `.item-select`. Should remain passing without modification.
- `tests/b030-item-drag-reorder.test.js` — drag-reorder behavior tests. None reference `.item-drag-handle` (which doesn't yet exist). The new handle's `pointer-events: none` ensures B-030 tests continue to pass — the row's existing drag handlers see clicks pass through.

**No pre-existing B-113 code, no scaffolding.** Two source-file edits + one new test file + one new design chapter (this file).

---

## §56.3 Design Decisions (D-1 through D-5)

### D-1 — Drag handle icon: 6-circle SVG matching `.group-drag-handle` (R1 Q1 LOCKED, R2 ratified)

**Choice:** Confirm R1 LOCKED. Reuse the existing `.group-drag-handle` SVG markup pattern (`sidepanel.js:2173`) at the smaller `14×14` rendering size (the SVG viewBox stays `0 0 16 16` for visual proportion; the rendered size shrinks via `width="14" height="14"`). Six filled circles in a 2×3 grid (`cx=5/11`, `cy=4/8/12`, `r=1.5`).

**Suggested R3 markup** (verbatim for the new `.item-drag-handle` element in `buildItemRow`):

```html
<span class="item-drag-handle" aria-hidden="true">
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="4" r="1.5"/>
    <circle cx="5" cy="8" r="1.5"/>
    <circle cx="5" cy="12" r="1.5"/>
    <circle cx="11" cy="4" r="1.5"/>
    <circle cx="11" cy="8" r="1.5"/>
    <circle cx="11" cy="12" r="1.5"/>
  </svg>
</span>
```

**Why not Unicode glyphs (`⋮⋮`, `⋮`, `≡`):** R1 Q1 explicitly rejected. R2 ratifies — Unicode rendering varies dramatically across font stacks (especially `⋮⋮` which is two combined punctuation glyphs) and can produce inconsistent visual weight against the SVG-rendered `.group-drag-handle`. The SVG markup is deterministic across all platforms.

**Why visual cohesion with group handle matters:** users who learn the dot-grid means "grab to drag" on group headers transfer that intuition to item rows for free. The cross-surface affordance reuse is a discoverability win.

### D-2 — Reveal mechanism: pure CSS `:hover` opacity transition with absolute positioning (R1 Q2 LOCKED, R2 ratified)

**Choice:** Confirm R1 LOCKED. The new `.item-drag-handle` is absolutely-positioned over the existing `.item-select` slot. Both elements coexist in the DOM at first paint; CSS opacity / visibility rules toggle which one renders based on hover + multi-select state.

The B-048 §31.5 AC6 no-reflow guarantee is PRESERVED: the `.item-select` slot keeps its `flex: 0 0 18px` reservation, and the new `.item-drag-handle` is `position: absolute` (anchors to the parent `.item-row` which already has `position: relative` per B-101's drift-bar comment at `sidepanel.css:~445`). The drag handle does NOT consume flex space — the layout is identical pre- and post-B-113.

**R3 CSS to add** (next to the existing `.item-select` block, ~`sidepanel.css:1432`):

```css
/* B-113 §56 (S36 W1-C): item-row drag-handle affordance. Absolutely-
   positioned over the .item-select slot so it occupies the same visual
   real estate without consuming flex space (B-048 §31.5 AC6 no-reflow
   guarantee preserved). pointer-events: none keeps clicks passing
   through to the underlying .item-row so B-030's "drag from anywhere"
   contract is unchanged. */
.item-drag-handle {
  position: absolute;
  left: 12px;            /* matches .item-row padding-left + .item-select leading edge */
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}

/* Hover-reveal — saved-item rows ONLY (open-tab rows are not draggable;
   see §56.3 D-5). The selector includes the row-not-in-multi-select-mode
   guard implicitly via D-3's reciprocal rule. */
.item-row:hover .item-drag-handle {
  opacity: 1;
}

/* Multi-select active: hide the drag handle even on hover. Reciprocal of
   D-3's checkbox reveal. */
#item-list.has-bulk-bar .item-row:hover .item-drag-handle {
  opacity: 0;
}
```

**`left: 12px` rationale:** the `.item-row` has horizontal padding of 12px (per inspection of the existing `.item-row` rule); the `.item-select` slot starts at the inside-padding edge. The `.item-drag-handle` anchors to the same x-coordinate so visually it occupies the same horizontal slot as the checkbox. R3 may need to nudge this value if the rendered layout shows misalignment (e.g., slot center at `left: 16px` if there's an internal margin) — empirical tuning at R3, locked at R6 close.

**Why opacity (not visibility) on the handle:** the CSS `transition: opacity 0.15s` provides a smooth fade-in/out on hover that matches the existing `.item-actions` transition pattern (`sidepanel.css:1125`). `visibility` doesn't transition; using opacity gives perceptual continuity. Note the `visibility: hidden` ↔ `visible` pattern is retained on the *checkbox* (matches B-048's existing pattern; preserves AT semantics — `visibility: hidden` removes the element from the AT tree, `opacity: 0` does not — but the checkbox is already `aria-hidden="false"` per B-048 §31.5 D-2, and the `.item-drag-handle` is `aria-hidden="true"` so no AT pollution from either element).

### D-3 — Multi-select reveal contract: scope existing hover rule (R1 Q2 LOCKED, R2 ratified, b048 contract intentionally modified)

**Choice:** Confirm R1 LOCKED. The existing rule at `sidepanel.css:1428-1432`:

```css
.item-row:hover .item-select,
.item-row:focus-visible .item-select,
.item-row[data-selected="true"] .item-select {
  visibility: visible;
}
```

is split: the `:focus-visible` and `[data-selected="true"]` clauses remain at the same selector (always reveal); the `:hover` clause moves under `#item-list.has-bulk-bar` (multi-select-only reveal):

```css
/* B-113 §56 (S36 W1-C): hover-reveal of .item-select is now scoped to
   multi-select mode. Outside multi-select, hover reveals the drag-
   handle (D-2); the checkbox stays hidden until the user enters multi-
   select via direct checkbox click or keyboard shortcut.
   Persistent reveal for focus + selected rows is preserved. */
#item-list.has-bulk-bar .item-row:hover .item-select {
  visibility: visible;
}

/* Always-on: focus-visible + already-selected. Unchanged from pre-B-113. */
.item-row:focus-visible .item-select,
.item-row[data-selected="true"] .item-select {
  visibility: visible;
}

/* Once multi-select is active, ALL row checkboxes show persistently
   (Gmail pattern preserved — no flicker as user moves between rows). */
#item-list.has-bulk-bar .item-row .item-select {
  visibility: visible;
}
```

**Why this scoping pattern works:** the user's intent is signaled by the existence of any selection — once `_selection.size > 0`, `_updateBulkBar` adds `has-bulk-bar` to `#item-list`. The cascade reads this attribute at descendant `.item-select` consumers, no JS plumbing required. When the user clears the last selection, `has-bulk-bar` is removed and the cascade reverts to the new default (hover reveals drag handle, checkbox hidden until next multi-select cycle).

**Note on the b048 §31.5 AC6 contract:** B-113 INTENTIONALLY modifies that contract. Pre-B-113: "checkbox is visible on `:hover` of any row." Post-B-113: "checkbox is visible on `:hover` ONLY when multi-select is active (`#item-list.has-bulk-bar`); otherwise, hover reveals the drag handle." R3 updates `tests/b048-visual-states.test.js` header comment (lines 18-19) to document this contract change. The `:focus-visible` and `[data-selected="true"]` clauses of the original AC6 are PRESERVED.

### D-4 — Drag origin: unchanged from B-030 (R1 Q4 LOCKED, R2 ratified)

**Choice:** Confirm R1 LOCKED. The new `.item-drag-handle` is `pointer-events: none` so clicks/drags pass through to the underlying `.item-row` (which retains `draggable=true` from B-030 + the existing drag handler chain). B-030 contract: drag works from row text, favicon, indicators column, action buttons (with the existing event-bubbling carve-outs B-030 uses to disambiguate handle/section drags from item drags), AND now visually from over the handle area too.

R3 verifies the B-030 drag-reorder behavior is preserved: drag from row text, drag from favicon area, drag from over the drag-handle area — all initiate the same drag operation. The handle is purely a visual signal that the row IS draggable, not a separate drag origin.

**Why `pointer-events: none` on the handle:** if the handle were `pointer-events: auto`, clicks on it would be captured by the handle (not the row). Even if we wired the same drag handler to the handle, the dual-source drag origin would muddy B-030's existing event-bubbling carve-outs (e.g., the `.group-drag-handle` carve-out at `sidepanel.js:3568` would then need a parallel `.item-drag-handle` carve-out, with similar handler attachment plumbing). `pointer-events: none` is the simpler architecture: one drag origin (the row), one set of handlers (B-030's), one carve-out scheme.

### D-5 — Open-tab row coverage: NONE (R1 Q8 BINDING CORRECTION)

**Choice:** R2 binding correction to R1 LOCKED Q8.

**R1 LOCKED Q8 claim:** *"Open-tab rows are also draggable per B-030 v2 (verify against current code; if open-tab rows are NOT draggable, the handle should still appear on hover for visual consistency, OR we omit the handle on open-tab rows and document the asymmetry — R3 picks based on observed B-030 contract for open-tab rows)."*

**R2 finding: open-tab rows are NOT draggable.** Direct inspection of `sidepanel.js:2705-2772` (the entire `buildOpenTabRow` body) confirms the function never sets `row.draggable = true`. The repo-wide `grep -n "draggable" sidepanel/sidepanel.js` returns matches only at line 2176 (`section.draggable = true` for groups) and line 2344 (`row.draggable = true` for saved-item rows). Open-tab rows have no drag affordance and no drag handler. This is consistent with the §41 B-035 + §42 B-036 design intent of the Open Tabs section as a **discovery surface, not a CRUD/reorder surface** — users discover open tabs and either save them, jump to them, or close them via the X button (B-022). Reordering open tabs would conflict with the browser's own tab strip ownership.

**R2 binding decision: omit `.item-drag-handle` from `buildOpenTabRow`.**

**Why omit (not include for visual consistency):** showing a drag handle on a non-draggable row is dishonest UX. The user hovers, sees the affordance, attempts to drag — and nothing happens. CLAUDE.md's "Empty states: icon + message + prominent CTA" principle rests on honest affordances; the same principle applies here. Visual consistency between saved-item and open-tab rows is a smaller win than affordance honesty; B-113 picks honesty.

**R2 binding correction to R1 LOCKED ACs:**
- **AC1 (R2-corrected):** `.item-drag-handle` element appended to every saved-item row (NOT to open-tab rows). Reword the original AC1 from "saved + open-tab" to "saved-item rows only."
- **AC4 (R2-corrected):** when `#item-list.has-bulk-bar` is set, every `.item-select` shows persistently — including open-tab rows (B-024 multi-select participation is unchanged). The drag-handle clause of AC4 ("drag handle hidden everywhere") applies only to saved-item rows because open-tab rows have no drag handle to hide.
- **AC6 (R2 verification):** B-030 drag-reorder works from saved-item rows; open-tab rows are NOT draggable (pre-existing constraint, not a B-113 regression). UAT-7 sanity-checks this.

**Future B-XXX:** if product-owner later requests draggable open-tab rows (e.g., to reorder open tabs from within the sidepanel mirroring the browser tab strip), that would be a separate item with R0 spike scope (interaction with the browser's own tab-order API, multi-window coordination, undo-on-drag-cancel semantics). Not in B-113.

---

## §56.4 R2 Correctness Checklist (C-1 through C-12)

| # | Check | Verdict | Note |
|---|---|---|---|
| C-1 | Storage schema versioned | **N/A** | Zero schema changes. |
| C-2 | Message contracts typed | **N/A** | Zero new message types. |
| C-3 | SW cold-start safe | **N/A** | Zero SW code touched. Pure render-side change. |
| C-4 | ID stability | **N/A** | No item/group/tab identity affected. |
| C-5 | Manifest file references resolvable | **N/A** | Zero `manifest.json` changes. |
| C-6 | Permission minimization | **N/A** | Zero new permissions. |
| C-7 | Allow-list direction | **N/A** | No validators/sanitizers/export surface modified. |
| C-8 | SW-context feasibility | **N/A** | All affected APIs are CSS + DOM in document context. |
| C-9 | Empty-state design | **PASS — 7 paths enumerated** | (a) **Default first-paint, idle row, no selection**: `.item-select` `visibility: hidden` (existing default); `.item-drag-handle` `opacity: 0` (new default). Empty slot, no reflow. (b) **Hover, no multi-select**: `.item-drag-handle` `opacity: 1` via `.item-row:hover` rule; `.item-select` stays `visibility: hidden` (the existing hover rule is now scoped under `has-bulk-bar`). (c) **Hover, multi-select active**: `.item-select` `visibility: visible` via the `#item-list.has-bulk-bar .item-row` always-on rule (new); `.item-drag-handle` `opacity: 0` via the `#item-list.has-bulk-bar .item-row:hover .item-drag-handle` reciprocal rule. (d) **Multi-select active, no hover**: `.item-select` `visibility: visible` (Gmail pattern); `.item-drag-handle` `opacity: 0` (no hover trigger). (e) **Selected row** (`[data-selected="true"]`): `.item-select` `visibility: visible` always (existing rule preserved); `.item-drag-handle` `opacity: 0` regardless of hover (the persistent-checkbox state implies multi-select context). (f) **Focus-visible** (keyboard arrow lands on row): `.item-select` `visibility: visible` (existing rule preserved); `.item-drag-handle` `opacity: 0` (focus is not hover; the keyboard user already sees the focus ring on the row). (g) **Open-tab row** (any state): `.item-drag-handle` ABSENT from DOM (D-5); `.item-select` follows B-024 contract unchanged. **R2 enumeration completes.** |
| C-10 | Off-screen rect feasibility | **N/A** | No off-screen positioning, no canvas snapshot. The drag handle is in-flow via `position: absolute` against the `position: relative` row. |
| C-11 | Popup-lifecycle message ordering | **N/A** | No message-passing surface introduced. |
| C-12 | Manifest declaration runtime-mutability | **N/A** | Zero `manifest.json` declarations. |

**Verdict count:** 0 PASS-with-action / 1 PASS / 11 N/A. Zero blocking concerns. The D-5 R2 binding correction is the only material R2 finding; it shrinks R3 scope (one less build-site to touch) rather than expands it.

---

## §56.5 R3 Fix Scope

**Files touched in R3:**

| File | Edit type | LOC count | Notes |
|------|-----------|-----------|-------|
| `sidepanel/sidepanel.js` | After `row.appendChild(_createItemSelect(isSelected));` at line ~2394 in `buildItemRow`, append a new `<span class="item-drag-handle" aria-hidden="true">` containing the 6-circle SVG | +5 LOC | Static literal markup; no interpolation. ONLY in `buildItemRow` — `buildOpenTabRow` is NOT modified per D-5. |
| `sidepanel/sidepanel.css` | (a) Add 3 new rules near `.item-select` block (~`sidepanel.css:1432`): `.item-drag-handle` (default), `.item-row:hover .item-drag-handle` (reveal), `#item-list.has-bulk-bar .item-row:hover .item-drag-handle` (suppress in multi-select). (b) Restructure existing `.item-row:hover .item-select` rule: split the `:hover` clause from `:focus-visible` + `[data-selected="true"]` clauses; scope `:hover` under `#item-list.has-bulk-bar`. (c) Add `#item-list.has-bulk-bar .item-row .item-select { visibility: visible; }` (Gmail pattern persistent reveal). | +25 LOC, -1 / +1 net on the existing rule split | All edits cluster around the existing `.item-select` block; minimal cross-file impact. |
| `tests/b113-drag-handle-multi-select.test.js` | NEW; ≥ 5 tests per AC7 | ~150 LOC | T1-T5 per §56.6. |
| `tests/b048-visual-states.test.js` | Update header comment (lines 18-19) to note B-113's intentional modification of the AC6 hover-reveal contract for `.item-select` | +2 LOC | Comment-only update; no test logic change (the b048 tests don't directly assert hover-reveal visibility). |
| `docs/design/56-b-113-drag-handle-multi-select.md` | NEW; this chapter | (this file) | |
| `docs/SOLUTION_DESIGN.md` (TOC) | +1 line — §56 added | +1 LOC | Required by R6 close. |

**Total source LOC delta: ~30 lines.** No HTML changes; no manifest changes; no message contract changes; no JS event-handler changes.

**Out-of-scope confirmed**: `buildOpenTabRow` is NOT touched (D-5). `_updateBulkBar` is NOT touched (Q3 reuses existing class).

---

## §56.6 R5 Test Plan (≥ 5 tests, AC7)

New file: `tests/b113-drag-handle-multi-select.test.js`. Tests use a mix of static-source CSS-rule assertions (T2-T4 patterns from B-114/B-115) and inline DOM-shim behavior tests (T1, T5 patterns from B-101/B-110/B-111).

| # | Name | Setup | Assertion | Maps to AC |
|---|------|-------|-----------|------------|
| **T1** | `.item-drag-handle` element appended to every saved-item row built by `buildItemRow` | Static-source assertion: read `sidepanel.js`; locate the `buildItemRow` body; assert it appends a `<span class="item-drag-handle">` immediately after the `.item-select` append line. Assert the SVG markup contains the 6 expected `<circle>` elements with the correct `cx`/`cy`/`r` attributes per D-1. | Markup contract present in `buildItemRow` source. The static assertion guards against future refactors that accidentally drop the handle. | AC1 |
| **T2** | `.item-drag-handle` ABSENT from `buildOpenTabRow` (D-5 binding correction sanity guard) | Static-source assertion: read `sidepanel.js`; locate the `buildOpenTabRow` body (lines 2705-2772); assert it does NOT contain the string `'item-drag-handle'`. | Open-tab rows never carry the handle (D-5). Future refactor that accidentally adds the handle to open-tab rows fails this test. | AC1 + D-5 |
| **T3** | Default-state CSS rules: `.item-drag-handle { opacity: 0 }` and `.item-row:hover .item-drag-handle { opacity: 1 }` and the multi-select suppression rule | Static-source assertion: read `sidepanel.css`; assert all three rules present with their expected property values. | Default + hover + multi-select-suppress rules present and correct. | AC2, AC3, AC4 |
| **T4** | Hover-reveal of `.item-select` is scoped to multi-select mode (b048 AC6 contract change) | Static-source assertion: read `sidepanel.css`; assert the rule `#item-list.has-bulk-bar .item-row:hover .item-select { visibility: visible; }` is present AND assert the OLD pre-B-113 rule `.item-row:hover .item-select { visibility: visible; }` is NOT present (must be scoped under `#item-list.has-bulk-bar` or removed). The `:focus-visible` and `[data-selected="true"]` rules MUST still match `visibility: visible`. | b048 §31.5 AC6 contract intentionally modified per D-3. T4 pins both the new rule presence and the old rule's absence. | AC2, AC3, AC4 |
| **T5** | Reactive flip via `#item-list.has-bulk-bar` class toggle (no JS in the visibility cascade) | Behavioral test using inline DOM-shim that mirrors the production CSS. Synthesize a `#item-list` parent, a `.item-row` child, both `.item-drag-handle` and `.item-select` grandchildren. Initially: no `has-bulk-bar` class → handle visible on hover, checkbox hidden. Add `has-bulk-bar` class → checkbox visible always, handle hidden on hover. Remove `has-bulk-bar` class → revert. | Class-toggle drives the visibility flip synchronously via the cascade (no JS in the swap). | AC4 |
| **T6 (optional)** | `.item-drag-handle` is `pointer-events: none` (B-030 drag-passthrough contract — D-4) | Static-source assertion: read `sidepanel.css`; assert the `.item-drag-handle` rule contains `pointer-events: none`. | B-030 drag-from-anywhere preserved because clicks pass through the handle. | AC6 |
| **T7 (optional)** | Selected row regression — `[data-selected="true"]` row shows `.item-select` persistently with `aria-checked="true"` | Behavioral test reusing the b048 stub pattern. Build a row with `data-selected="true"`; assert checkbox is visible regardless of `has-bulk-bar` class state. | B-024 + b048 contract preserved. | AC5 |

**Test count:** ≥ 5 required by AC7; this plan ships 5 mandatory + 2 optional. T6 and T7 are recommended add-ons for stronger guard coverage but not blocking. R5 [test-engineer] may ship 5 minimum; recommend 7 for max coverage.

**Pre-existing test impact**: `tests/b048-visual-states.test.js` header comment (lines 18-19) gets a B-113-aware note. No b048 test logic changes. `tests/b024-multi-select.test.js` and `tests/b030-item-drag-reorder.test.js` are NOT modified — neither asserts the modified hover-reveal behavior nor the new handle.

---

## §56.7 R5 UAT Plan (≥ 3 cases, AC7)

Manual test cases against the unpacked extension on `feature/sprint-36-ui-polish`. UAT executes after R5 automated suite passes.

| # | Case | Steps | PASS criterion | FAIL criterion |
|---|------|-------|---------------|----------------|
| **UAT-1** | Default state — idle row shows nothing in checkbox slot | (1) Open the sidepanel. (2) Observe a saved bookmark row at rest (no hover, no selection). | Empty 18 px slot visible (no checkbox border, no drag handle). Layout stable; no reflow visible. | Checkbox border visible at rest, OR drag handle visible at rest, OR row layout shifts when hovering. |
| **UAT-2** | Hover reveals drag handle — saved-item row only | (1) Hover over a saved bookmark row. (2) Observe the first column slot. (3) Stop hovering. | On hover: 6-dot drag handle fades in within ~150 ms; checkbox stays hidden. On hover-out: handle fades out. | Checkbox shows on hover (regression to pre-B-113 behavior), OR handle never appears, OR transition is jarring. |
| **UAT-3** | Multi-select reveals checkbox on every row, hides drag handle | (1) Click directly on the (currently invisible) checkbox slot of a row to enter multi-select (or use the keyboard shortcut to toggle a row's selection). (2) Observe ALL rows. | Every row's checkbox is now visible (Gmail pattern); drag handles are hidden everywhere even on hover. The selected row's checkbox is filled (`aria-checked="true"`). | Drag handles still appear on hover during multi-select, OR checkboxes don't persist across all rows, OR selected row's checkbox is unfilled. |
| **UAT-4** | Exit multi-select restores hover-reveal of drag handle | (1) From UAT-3 state, deselect the last selected row (clear all selections). (2) Hover over a row. | Checkboxes hide on all rows; hover reveals the drag handle again (back to UAT-2 state). | Checkbox stays visible after clearing selection (`has-bulk-bar` class not removed) OR drag handle does not return on hover. |
| **UAT-5** | B-030 drag-reorder still works from anywhere on the row | (1) Pick a saved bookmark row in a multi-item group. (2) Drag from the row text → reorder. (3) Drag from over the favicon → reorder. (4) Drag from over the drag-handle area (hovering the handle) → reorder. | All three drag origins initiate the same B-030 reorder operation; drop indicator appears in the right position; reorder commits on drop. | Drag breaks from any of the three origins (especially regression from over-the-handle area where `pointer-events: none` should let clicks pass through to the row). |
| **UAT-6** | Open Tabs section — drag handle ABSENT (D-5 binding correction sanity check) | (1) Switch to a window that has the Open Tabs section visible in the sidepanel. (2) Hover over an open-tab row. | NO drag handle appears. The 18 px slot stays empty on hover (or shows the checkbox if multi-select is active). | A drag handle appears on open-tab rows (D-5 was misapplied in R3). |
| **UAT-7** | Selected row checkbox stays visible across hover state changes | (1) Enter multi-select; select one row. (2) Hover over OTHER rows. (3) Hover back over the selected row. (4) Hover over an empty area. | The selected row's checkbox stays filled and visible regardless of hover state on it or other rows. | Selected row's checkbox flickers OR clears on hover-out. |

**UAT count:** ≥ 3 required by AC7; this plan ships 7 mandatory cases. UAT-6 is the D-5 sanity case (promoted from optional given B-111's lesson — the R6 close placeholder explicitly requires verifying the binding correction was applied).

---

## §56.8 Performance Plan

| Path | Budget | Measurement | Rationale |
|------|--------|-------------|-----------|
| `buildItemRow` first-paint per row | ≤ +30 µs vs. baseline | Negligible — micro-bench not required | One additional `<span>` + 6 `<circle>` SVG elements via static `innerHTML`. Parse cost ~5-25 µs per row. On a 500-item collection: total +2-12 ms at first-paint, well within the §9 200 ms first-paint budget. |
| Hover state on `.item-row` | 0 µs additional in steady-state | N/A | The new opacity transition fires once per hover-in / hover-out, GPU-composited. No layout pass. |
| Multi-select toggle (entering / exiting `has-bulk-bar`) | < 1 ms per row layout reflow | Browser DevTools timeline | The `#item-list.has-bulk-bar` class change cascades to every `.item-select` (visibility flip) and every `.item-drag-handle` (opacity transition). On a 500-item list: ~500 paint invalidations, ~5 ms total — well within the §9 50 ms message-handler budget. |

**Net performance effect: imperceptible.** No path adds a full collection re-read or unbounded loop.

**DOM size delta:** one new `<span>` + one `<svg>` + 6 `<circle>` = 8 extra elements per saved-item row. On 500 saved items: +4,000 elements. Browser DOM budgets are typically 10K-30K elements/page; well within budget. Only saved-item rows pay the cost (open-tab rows do not get the handle per D-5).

---

## §56.9 Accessibility Plan

| Surface | Treatment | Rationale |
|---------|-----------|-----------|
| `.item-drag-handle` `aria-hidden="true"` | Mandatory. Both the outer `<span>` and the inner `<svg>` carry `aria-hidden`. | The handle is a visual signal only — the row's existing `title` attribute (`'Drag to reorder (keyboard reorder not yet available)'`) is the AT carrier of the drag affordance. Adding the handle to the AT tree would duplicate the message and pollute the row's accessible name. |
| Keyboard reachability | Unchanged. The handle has no `tabindex` (default = not focusable). The row remains the focusable surface; the `.item-select` is `tabindex="-1"` per B-048. | No new keyboard affordance is introduced. The R1 Q5 LOCKED decision: keyboard reorder remains "not yet available" (pre-B-113 constraint preserved). |
| `prefers-reduced-motion` | The new `transition: opacity 0.15s` SHOULD be wrapped in a `@media (prefers-reduced-motion: reduce)` no-transition block per project policy if such a block already exists for the row's other transitions. R3 verifies the existing `.item-row` and `.item-actions` transitions are also gated; if they are, B-113 follows the same pattern. If not, B-113 introduces its own gate (~+3 LOC). | Quick fade-in/out at 150 ms is below the WCAG threshold for animation triggers, but the policy is to honor `prefers-reduced-motion: reduce` regardless. |
| Multi-select state announcement | Unchanged. `_setRowSelected` continues to mirror `aria-checked` on the checkbox per B-024. The cascade-driven visibility flip does not affect the `aria-checked` value or the `aria-selected` row attribute. | B-024 contract preserved. |
| Color contrast | The drag handle's `color: var(--text-secondary)` resolves to the theme's secondary text color. Existing per-theme `--text-secondary` values clear ≥ 3:1 against the row's background per the §47.7 spot-check matrix (UI-component contrast floor per WCAG 1.4.11 — `.item-drag-handle` is non-text). On solarized-light specifically, `--text-secondary` is `#546a72` post-B-108 — clears 4.66:1 against `--bg-secondary`, AAA for non-text. | No new color audit needed. |
| Focus ring on the row | Unchanged. The `.item-row:focus-visible` rule retains the same outline; the new `.item-drag-handle` does not interfere. | B-048 D-2 focus-ring contract preserved. |

**Net accessibility effect: zero AT-visible behavior change.** The handle is sighted-user-only; AT users continue to hear the row's existing `title` and `aria-label` as the canonical drag-affordance carriers.

---

## §56.10 Rollback Plan

**Single-commit revert restores pre-B-113 behavior** — i.e., the checkbox shows on hover for any row regardless of multi-select mode (b048 §31.5 AC6 original contract). No storage migration, no manifest change, no message contract change.

```bash
# Identify the commit on release/v2 once Wave 1 is committed:
git log --oneline release/v2 | grep "B-113"

# Single-commit revert (or revert just B-113 if Wave 1 was a multi-item commit):
git revert <merge-sha>
git push origin release/v2

# Sidepanel rebuilds rows on next refresh — no data migration needed.
```

| Aspect | Rollback impact |
|--------|-----------------|
| `tj:items` / `tj:groups` / `tj:tabClaims` / `tj:drift` | No-op. Untouched by B-113. |
| Manifest permissions | No-op. Untouched. |
| Visual behavior | Pre-B-113: checkbox shows on hover. Post-rollback: same (b048 original AC6 contract). |
| AT contract | Identical pre-rollback and post-rollback (the b048 §31.5 D-2 `aria-hidden` + `aria-checked` mirror invariants are preserved across both states). |
| B-024 multi-select | No-op. Selection state ownership and `_updateBulkBar` lifecycle unchanged. |
| B-030 drag-reorder | No-op. Drag handlers and `draggable=true` flags unchanged. |

**SEV severity if rollback needed: SEV3 (minor visual refinement).** No data loss; users see the original hover-checkbox UX.

---

## §56.11 Open Questions

**Q1 — `left: 12px` positioning empirical tune.** R2 D-2 specified `left: 12px` based on inspection of the `.item-row` padding-left. R3 must verify this aligns the drag handle's center with the checkbox's center; if the empirical layout shows misalignment, R3 nudges the value (likely range: 10-16 px) and notes the final value in §56.12. Not blocking R3.

**Q2 — `prefers-reduced-motion` gate on the opacity transition.** §56.9 notes R3 verifies whether the existing `.item-row` / `.item-actions` transitions are gated; if not, B-113 introduces its own gate. Whichever path applies, R3 documents in §56.12. Not blocking R3.

**Q3 — Future B-XXX: keyboard reorder.** R1 Q5 LOCKED scoped this OUT — keyboard reorder is "not yet available" per the row's `title` attribute. If product-owner wants keyboard reorder, file as a separate item with R0 spike scope (focus management + announcement strategy + drag-cancel semantics + AT integration). Not in B-113.

**Q4 — Future B-XXX: rename `has-bulk-bar` to `multi-select-active`.** R1 Q3 LOCKED noted this is a future follow-up; the existing class name is technically named after the bar visibility, not the mode. Renaming would touch many test files; not a B-113 expansion but worth tracking.

**Q5 — Future B-XXX: draggable open-tab rows.** R2 D-5 documented the omission; if product-owner wants draggable open tabs (mirror browser tab strip reorder from sidepanel), file as a separate item with full R0 spike (browser API interaction, multi-window coordination, undo semantics). Not in B-113.

**None of these questions block R3 or R5 of B-113.**

---

## §56.12 As Built (R6 close — 2026-04-28)

**§56.3 D-5 binding correction verification:** R3 applied D-5 correctly. Verified by `git diff sidepanel/sidepanel.js` — `buildOpenTabRow` (lines 2705-2772) was NOT modified. T2 in `tests/b113-drag-handle-multi-select.test.js` is the static-source guard against future regression. R6 status: **COMPLETE — not routed back to R3.**

**Files changed (vs. §56.5 R3 fix scope expectation):**

| File | Edit | Net LOC | Matches §56.5? |
|------|------|--------:|----------------|
| `sidepanel/sidepanel.js` (after `_createItemSelect` append at line ~2394) | New `<span class="item-drag-handle" aria-hidden="true">` with the 6-circle SVG via static `innerHTML` | +9 / -0 | ✅ within "+5 LOC" expectation (slightly over due to expanded comment block) |
| `sidepanel/sidepanel.css` (after `.item-select` block ~line 1432) | (a) Restructure existing `.item-row:hover .item-select` rule (split clauses); (b) Gmail-pattern persistent reveal rule; (c) `.item-drag-handle` block; (d) hover + multi-select-suppress rules; (e) `prefers-reduced-motion` gate. **R6 iteration:** flex-overlap approach replaces original `position: absolute` per R4 [qa] M-1 finding. | +44 / -2 | Within "+25 LOC" expectation; +19 over due to (i) R4 M-1 fix added comment block explaining the flex-overlap rationale; (ii) R6 added the prefers-reduced-motion media query |
| `tests/b113-drag-handle-multi-select.test.js` (NEW) | T1-T7 (7 tests) | 240 LOC | ✅ ≥ 5 mandatory; shipped 7 |
| `tests/b048-visual-states.test.js` | (a) Header comment update (lines 18-29) noting B-113's AC6 contract change; (b) AC6 assertion test (lines 587-616) updated to pin the post-B-113 split structure (R3 caught this gap that R2 §56.5 missed; R2 only mentioned the header, but the AC6 test itself asserted the triad-shared-block structure that B-113 changes) | +20 / -2 | R3 deviation from §56.5 R3 fix scope (which only listed "header comment update"); R3 correctly expanded scope to include the AC6 test rewrite. Documented as a precedent below. |
| `docs/SOLUTION_DESIGN.md` (TOC) | +1 line — §56 added to chapter index | +1 LOC | Required by R6 close (new chapter added) |
| `docs/design/56-b-113-drag-handle-multi-select.md` (this file) | NEW (R2) + R6 close fill of §56.12 | (this file) | R6 work product |

**Test counts:** pre-B-113 baseline 1,497 → post-B-113 **1,504 (+7)**. Full suite passes; zero regressions.

**R4 disposition (2026-04-28):**
- **[code-reviewer]**: PASS. 2 LOW findings (specificity comment for the multi-select suppression rule; T5 cascade resolver does not model focus-visible). Both deferred — non-blocking.
- **[security-reviewer]**: PASS. No findings any tier. Confirmed: zero new permissions, zero CSP relaxation, zero new sinks; SVG `innerHTML` is a static literal with hard-coded numeric attributes (no interpolation, no untrusted-data flow).
- **[qa-reviewer]**: PASS-WITH-FIXES. **M-1 was a real layout bug** — `position: absolute; left: 12px` measures from the row's padding-edge, which shifts +3px on `data-live="true"` / `data-active="true"` rows (3px border-left + 9px padding-left) compared to default rows (0 border + 12px padding-left). Plus a baseline 2px misalignment between handle center and checkbox center even on idle rows. **R3 iteration applied in R6**: switched the handle from `position: absolute` to `flex: 0 0 18px; margin-left: -18px;` — this overlays the checkbox flex slot (no additional flex consumption preserves AC6 no-reflow guarantee) AND aligns invariantly across all row states because flex content positioning is border-edge-independent. T3 assertion updated to pin the new approach.
  - M-2 (T5 cascade resolver redundancy): noted as documentation refinement, not a defect. Resolver is consistent with B-111 T4 precedent.
  - L-1 through L-5 (focus-visible coverage gap, T2 substring guard, prefers-reduced-motion scope, b048 line 589 substring assertion, selected-row + drag-handle interaction): all advisory, none blocking.

**Deviations from §56.3 R2 plan:**
1. **R3 iteration on D-2 positioning approach (R4 M-1 fix)**: R2 §56.3 D-2 specified `position: absolute; left: 12px; top: 50%; transform: translateY(-50%);` with the empirical `left: 12px` value flagged in §56.11 Q1 as needing R3 verification. The qa-reviewer's R4 review identified that the absolute-positioning approach itself was structurally wrong (not just empirically off): on rows with a left border (the live/active visual states), the absolute anchor shifts but the flex content doesn't. R3 iterated to a flex-overlap approach that is invariant across border-edge changes. The flex-overlap approach is the new locked design; §56.3 D-2 has been superseded by this R6 As-Built note. (The R2 chapter's prose is preserved as historical record.)
2. **R3 expanded scope to update b048 AC6 assertion test**: R2 §56.5 R3 fix scope listed only "Update header comment (lines 18-19)" for `tests/b048-visual-states.test.js`. R3 also had to update the AC6 assertion test itself (lines 587-616) because the assertion regex literally pinned the pre-B-113 triad-shared-block structure. R3 caught this and updated; this becomes a precedent (see below).

**UAT execution:** deferred to product-owner manual run in Edge per Sprint 36 close convention. UAT-1 through UAT-7 (`docs/design/56-b-113-drag-handle-multi-select.md` §56.7) are documented as a checklist; results to be recorded in `SPRINT.md` "Completed This Sprint" → B-113 entry at sprint close. **UAT-2, UAT-3, UAT-6 must explicitly verify alignment on (a) idle non-live row, (b) `data-live="true"` row, (c) `data-active="true"` row, and (d) drifted row** to confirm the handle is centered in the same visual slot as the checkbox across all four states (validates the M-1 fix). SEV3 rollback procedure documented in §56.10.

**Follow-up backlog candidates** (file in BACKLOG.md as separate items if/when prioritized):
- **R4 [code-reviewer] L-1** (specificity-driven order comment): add 1-line comment near the `#item-list.has-bulk-bar .item-row:hover .item-drag-handle` rule pinning that specificity (0,3,1) beats the `.item-row:hover .item-drag-handle` rule (0,2,1) regardless of source order. Defer.
- **R4 [code-reviewer] L-2** + **R4 [qa] M-2** (T5 cascade resolver scope): T5 mirrors production rules in JS rather than testing real DOM cascade. Acceptable per project precedent (B-111 T4); could be tightened to also cover the focus-visible path. Defer.
- **R4 [qa] L-1** (UAT keyboard-focus path): UAT-1..UAT-7 omit a pure keyboard-focus reveal of `.item-select` outside multi-select. Could be added as UAT-8 in a follow-up sprint.
- **R4 [qa] L-3** (`.item-actions` not gated by prefers-reduced-motion): pre-existing gap that B-113 doesn't worsen. Worth filing as "gate `.item-actions` and other row transitions under prefers-reduced-motion" in a future polish sprint.
- **R4 [qa] L-4** (b048 line 589 substring assertion is misleading post-B-113): the assertion still passes via substring-of-larger-rule match, but the message is misleading. Tighten in a future test-hygiene sweep.
- **§56.11 Q4** (rename `has-bulk-bar` → `multi-select-active`): semantic naming improvement; touches many test files. Defer.
- **§56.11 Q5** (draggable open-tab rows): if product-owner later requests Open Tabs section drag-reorder, file as a B-XXX with R0 spike scope (browser API interaction, multi-window coordination, undo semantics).

**New precedents established:**
1. **R2 binding-correction pattern, third instance** (D-5 omitting `.item-drag-handle` from open-tab rows). The pattern is now firmly established as a recurring R2 quality gate (§54 B-108 D-2, §55 B-111 D-4, §56 B-113 D-5). Treat all three with the same rigor as a CRITICAL/HIGH finding even though they are typically scope shrinks rather than expansions.
2. **R3 must check pre-existing test assertions when R2 declares a contract change** (b048 AC6 assertion update): when an R2 chapter declares an "intentional contract modification" (B-113 §56.3 D-3 vs. B-048 §31.5 AC6), R3 must NOT just update the documenting comment — R3 must also grep for any test that ASSERTS the pre-change contract and update the assertion to pin the post-change shape. Otherwise the test silently false-fails (or false-passes if the assertion is loose enough). R2 §56.5 R3 fix scope should explicitly enumerate any pre-existing test assertions that need to be updated, not just the documenting comment. Future R2 chapters that declare contract changes should add this to their fix-scope table.
3. **Flex-overlap pattern for sibling-affordance overlay** (R4 M-1 iteration): when two affordances share the same visual slot but only one renders at a time (e.g., `.item-select` ↔ `.item-drag-handle`), use `flex: 0 0 <slot-width>; margin-left: -<slot-width>;` on the second affordance so it overlays the first via flex flow rather than `position: absolute`. The flex approach is invariant to border-edge changes (which `position: absolute` is not). Avoids per-row-state empirical tuning of `left:` values. Documented as a project pattern for future affordance-swap features.
