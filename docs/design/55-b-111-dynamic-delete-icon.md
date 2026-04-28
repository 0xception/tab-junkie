# §55 — B-111 Dynamic Delete Icon (X for Live, Trash for Non-Live) (R2 Design)

**Sprint:** 36
**Tier:** Full (S)
**Status:** R6 close complete (2026-04-28) — shipped on `feature/sprint-36-ui-polish`. See §55.12.
**Owner:** [solution-architect]
**Depends on:** §49 (B-100 — Delete-on-Live UX redesign — owns the click-handler contract being preserved verbatim); §31 (B-048 — Item Visual-State Matrix — establishes the `data-live="true"` attribute mirroring on every saved-item row); §17 (B-010 — Live Tab Reflection — defines the `MSG_LIST_ITEMS` patch loop where `data-live` is set/cleared per row); B-107 (S36 — paired in this sprint, complementary; both touch the live-state patch loop's per-row mutator but address different attributes).

**Out-of-scope (explicit):** (a) confirmation-contract changes — R1 LOCKED retains the B-100 v1.29.0 contract verbatim (live X → `MSG_CLOSE_TABS` no modal; non-live X → existing modal → `MSG_DELETE_ITEM`); (b) click-handler changes — the existing `_handleItemActionClick` dispatcher is not touched; (c) aria-label changes — owned by B-107 in this sprint; (d) edit-button or its icon — separate affordance, unchanged; (e) new manifest permissions, message types, storage schema; (f) "close circle" (✕ in circle) or other live-icon variants per R1 Q1 LOCKED; (g) **open-tab rows — see §55.3 D-4 R2 binding correction**: `buildOpenTabRow` has no `.item-action-delete` button, so B-111 has zero footprint on the Open Tabs surface despite R1 Q5's incorrect premise.

---

## §55.1 Overview

B-111 swaps the X-button icon on every saved-item row to reflect the action that fires on click — the simple X icon when the bookmark is currently live (claimed by an open tab; click closes the tab per B-100), the existing trash icon when the bookmark is not live (click opens the modal-confirm to delete). The swap is **purely declarative**: both SVG icons ship inside the `.item-action-delete` button at first-paint, and CSS attribute selectors keyed on `.item-row[data-live="true"]` toggle visibility. Zero JavaScript runs in the icon-swap path on every live-state transition — the `MSG_LIST_ITEMS` patch loop (`sidepanel.js:~3066`) already mutates `row.dataset.live`, and the CSS cascade does the rest.

R3 lands ~6 LOC in `sidepanel/sidepanel.js` (replacing the single trash `<svg>` with two SVGs in `buildItemRow`'s `.item-action-delete` element) plus ~10 LOC of new CSS rules in `sidepanel/sidepanel.css` (display toggling per the `data-live` attribute selector) plus a new test file with ≥ 4 tests per AC6. Zero schema changes, zero new manifest permissions, zero new message types, zero JS runtime branching for the visibility flip.

The fix is structurally identical to the B-107 reactive-aria-label pattern (§S35 → S36 paired) — both items rely on the same B-100 + B-048 attribute mirroring on `data-live`. B-107 reacts via JS (because `aria-label` is a content attribute that requires explicit `setAttribute` calls); B-111 reacts via CSS (because visibility is a presentational concern that the cascade resolves natively).

---

## §55.2 Existing-State Reality Check

**Today (2026-04-28 on `feature/sprint-36-ui-polish`, post-Wave-0):**

- `sidepanel/sidepanel.js:2477-2484` — `buildItemRow` constructs `<button class="item-action-btn item-action-delete">` with a SINGLE `<svg>` child rendered via `deleteBtn.innerHTML = '<svg ...trash...>'`. Static literal markup; no interpolation. The trash SVG is a 14×14 `viewBox` with a multi-segment path drawing the trash-with-lid shape (path-d: `M2 3.5h10M5.5 3.5V2h3v1.5M5 5.5v5M9 5.5v5M3.5 3.5l.5 8h6l.5-8`, stroke-width 1.2, stroke-linecap round, stroke-linejoin round, `currentColor` fill stroke).
- `sidepanel/sidepanel.js:3076-3079` (B-107 R3 patch) — the `MSG_LIST_ITEMS` patch loop already iterates every saved-item row and mutates `row.dataset.live` per the live-state response. B-107's reactive aria-label flip lives at line 3078; B-111 will share the same row-by-row attribute (no new patch site needed for B-111 — the CSS attribute selector reads the existing `data-live`).
- `sidepanel/sidepanel.js:2705-2772` — `buildOpenTabRow` (Open Tabs section per B-055). **Verified by direct inspection: this function builds the row WITHOUT an `.item-action-delete` button** (line 2771 returns the row immediately after appending the indicators column at line 2760; no `.item-actions` container is appended on this path). R1 Q5's claim that open-tab rows have the delete button is factually wrong; see §55.3 D-4.
- `sidepanel/sidepanel.css:1118-1157` — existing `.item-actions`, `.item-action-btn`, `.item-action-delete:hover` rules. Hover reveals the action column (`opacity: 0` → `1`); the delete button hover paints the icon red (`color: #dc2626`). B-111 does NOT touch any of these rules — it only ADDS `.icon-action-close` and `.icon-action-trash` classes for visibility toggling.
- `tests/b100-delete-on-live.test.js`, `tests/b107-live-x-aria.test.js` — both test the click handler / aria-label behavior, NOT the SVG markup. R1 Selector audit verified: zero existing test files reference the SVG inside `.item-action-delete`.

**No pre-existing B-111 code, no scaffolding.** Single source-file edit (`sidepanel.js` build site) + single CSS file edit (`sidepanel.css` rule additions) + one new test file.

---

## §55.3 Design Decisions (D-1 through D-4)

### D-1 — Live-state icon: simple X (R1 Q1 LOCKED, R2 ratified)

**Choice:** Confirm R1 LOCKED simple X (two crossed lines) per Q1's spec. R2 verified the SVG markup is well-formed (14×14 viewBox, path-d with two crossing `M`-`L` segments at stroke-width 1.4), accessible (`aria-hidden="true"` per the B-100 contract that the row aria-label is the AT carrier — see §49 R6 close), and visually balanced against the existing trash SVG (1.4px stroke compensates for the lower pixel coverage of two lines vs. the trash's multi-segment path at 1.2px).

**Suggested R3 markup** (verbatim from R1 Q1):

```html
<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" class="icon-action-close">
  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
</svg>
```

**Why not the close-circle variant (✕ in circle):** R1 Q1 explicitly rejected. R2 ratifies — the circle adds a competing visual element next to the favicon and the existing live-indicator dot; the simple X is the canonical browser-tab-close metaphor and reads cleanly at 14×14 alongside other action-row affordances.

### D-2 — Non-live-state icon: keep the existing trash SVG (R1 Q2 LOCKED, R2 ratified)

**Choice:** Confirm R1 Q2 LOCKED. The current trash-with-lid SVG at `sidepanel.js:2481` is the correct non-live icon; B-111 does NOT replace it. The existing markup gets the new `.icon-action-trash` class added so the CSS selector can target it.

**R2 ratification note:** the existing icon's design intent (delete = move-to-trash semantic) matches the B-100 v1.29.0 contract verbatim — non-live click → modal confirm → `MSG_DELETE_ITEM`. Replacing the icon would risk visual regression on the established UX.

### D-3 — Swap mechanism: pure CSS via `.item-row[data-live="true"]` attribute selector (R1 Q3 LOCKED, R2 ratified)

**Choice:** Confirm R1 Q3 LOCKED. Both SVG icons ship in the DOM at first-paint; CSS rules toggle `display` based on the row's `data-live` attribute. The cascade handles every state transition for free; the `MSG_LIST_ITEMS` patch loop's existing `data-live` mutation is the only state-change driver.

**R3 CSS to add** (next to the existing `.item-action-delete:hover` rule at `sidepanel.css:1155`):

```css
/* B-111 §S36 W1-B: dynamic delete-icon visibility via the `data-live`
   attribute selector. Both SVGs ship in `.item-action-delete` at first
   paint; CSS toggles which one renders based on row state. The
   `MSG_LIST_ITEMS` patch loop (sidepanel.js:~3066) is the sole driver
   of `data-live` mutations; the cascade handles the visibility flip
   without any JS in the icon-swap hot path. */
.item-action-delete .icon-action-close {
  display: none;  /* default: non-live row → trash visible, X hidden */
}
.item-row[data-live="true"] .item-action-delete .icon-action-close {
  display: inline-block;  /* live row → X visible */
}
.item-row[data-live="true"] .item-action-delete .icon-action-trash {
  display: none;  /* live row → trash hidden */
}
```

**Why CSS rather than JS:**
1. **Performance**: the `MSG_LIST_ITEMS` patch loop already runs per-row; adding a `setAttribute` or `classList.toggle` call for icon swap doubles the work without need. CSS attribute selectors resolve at cascade time, which the engine handles with optimized invalidation paths.
2. **Reactivity**: the swap fires synchronously the moment `data-live` mutates; no JS callback ordering concern (B-107's aria-label patch already runs in the same loop, but those two are independent — neither blocks the other).
3. **No drift**: the CSS rule is the single source of truth for visibility. A future engineer cannot introduce a state-flip path that forgets to swap the icon — the `data-live` attribute IS the swap.

**Why not toggle a class on the button (e.g., `.live-state` / `.saved-state`):** doubles the JS work AND introduces a new attribute that must stay in sync with `data-live`. Reading the existing `data-live` directly avoids the mirror-state problem.

### D-4 — Open-tab row coverage: NONE (R1 Q5 BINDING CORRECTION)

**Choice:** R2 binding correction to R1 LOCKED Q5.

**R1 LOCKED Q5 claim:** *"`sidepanel.js` line 2703 builds a separate `row.className = 'item-row'` for open-tab rows (`buildOpenTabRow` or equivalent), and these rows ALSO have the `.item-action-delete` button (per B-022 scope). Open-tab rows are by definition live (the row represents a real open tab) — they MUST get `data-live="true"` set on the row so the CSS selector triggers the X icon."*

**R2 finding: this is FACTUALLY WRONG.** Direct inspection of `sidepanel.js:2705-2772` confirms `buildOpenTabRow` constructs the row WITHOUT any `.item-actions` container or `.item-action-delete` button. The function appends: (i) the select checkbox, (ii) the favicon, (iii) the textBlock (title + url), (iv) the indicators column (window badge + audible icon when applicable). It then returns the row at line 2771 — there is no action-button column. The B-022 reference in R1 Q5 is incorrect; B-022 (Quick Search Popup) does not establish a delete-button contract for open-tab rows. The Open Tabs section ships without inline edit/delete affordances by design (per §41 B-035 + §42 B-036, where Open Tabs are a discovery surface, not a CRUD surface).

`buildOpenTabRow` DOES set `row.dataset.live = 'true'` (line 2713) — this part of R1 Q5 is correct — but since there's no `.item-action-delete` element on the row, the CSS attribute selector matches a node that doesn't exist, and the rule is a no-op. R3 has zero work to do on the open-tab path; the R3 fix scope shrinks accordingly.

**R2 binding correction:** B-111's R3 footprint is **strictly limited to `buildItemRow`** (`sidepanel.js:2477-2484` build site) and the new CSS rules. R3 must NOT add an action-button column to `buildOpenTabRow` — that would be a scope expansion well outside R1's locked S effort estimate AND would conflict with the §41 B-035 / §42 B-036 design intent for the Open Tabs section as a discovery surface.

**Impact on AC6 test plan:** drop any test case that exercises `buildOpenTabRow` for icon visibility. R3 + R5 only test saved-item rows. UAT covers the saved-row paths only.

**Why not expand scope to add action buttons to open-tab rows:** out-of-scope per CLAUDE.md scope-change protocol — R1 effort estimate (S) does not budget for adding an entirely new affordance to an existing surface, and the §41 B-035 design intent (Open Tabs is a discovery surface) is preserved. If the product-owner later requests inline-delete for open-tab rows, that would be a separate B-XXX with its own R0 spike (the B-022 scope reference in R1 Q5 was incorrect).

---

## §55.4 R2 Correctness Checklist (C-1 through C-12)

| # | Check | Verdict | Note |
|---|---|---|---|
| C-1 | Storage schema versioned | **N/A** | Zero schema changes. No `tj:meta.schemaVersion` bump. No persisted-data shape change. |
| C-2 | Message contracts typed | **N/A** | Zero new message types. The X-button click handler dispatches the same `MSG_CLOSE_TABS` / `MSG_DELETE_ITEM` messages on the same condition (`data-live === 'true'`) — verbatim B-100 contract. |
| C-3 | Service worker cold-start safe | **N/A** | Zero SW code touched. Pure render-side change (CSS + DOM markup at build time). |
| C-4 | ID stability | **N/A** | No item, group, or other identity surface affected. The icon swap reads `data-live` only; itemId remains the row's identity. |
| C-5 | Manifest file references resolvable | **N/A** | Zero `manifest.json` changes. |
| C-6 | Permission minimization | **N/A** | Zero new permissions array entries. |
| C-7 | Allow-list direction | **N/A** | No validators/sanitizers/export surface modified. The new CSS rules add no input-shape concerns. |
| C-8 | SW-context feasibility | **N/A** | All affected APIs are CSS + DOM in document context. No SW-restricted API used. |
| C-9 | Empty-state design | **PASS — 6 paths enumerated** | (a) **Default first-paint, item not yet known to live-state system**: no `data-live` attribute on row → CSS default rule applies → trash visible, X hidden. Correct. (b) **First-paint, item live**: `data-live="true"` set inline by `buildItemRow` line 2354 (`if (live?.live) row.dataset.live = 'true';`) → CSS attribute selector matches → X visible, trash hidden. Correct. (c) **Live-state transition (non-live → live)**: `MSG_LIST_ITEMS` patch loop sets `row.dataset.live = 'true'` → CSS cascade re-evaluates → X visible. (d) **Live-state transition (live → non-live)**: patch loop deletes `row.dataset.live` → CSS cascade re-evaluates → X hidden, trash visible. (e) **Hover state on either**: `.item-actions` opacity flips 0 → 1 (existing rule); the trash-vs-X visibility is unaffected (orthogonal cascade). The hover-paint-red rule (`color: #dc2626`) applies to whichever icon is currently visible (both inherit from the button's `currentColor`). (f) **Focus-within state**: identical to hover — `.item-actions` becomes interactive; the visible icon (trash or X) shows. **R2 enumeration completes**: every state transition is covered by either the default rule or the `data-live="true"` attribute-selector rule; no gap between states. |
| C-10 | Off-screen rect feasibility | **N/A** | No off-screen positioning, no `setDragImage`, no canvas snapshot. Both SVGs render in flow inside the action button. |
| C-11 | Popup-lifecycle message ordering | **N/A** | The X-button click handler runs in the sidepanel document context, not a popup. `MSG_CLOSE_TABS` / `MSG_DELETE_ITEM` dispatch is unchanged from B-100; B-111 introduces no new pre-message focus shifts. The B-100 popup-lifecycle ordering verified at §49 close holds. |
| C-12 | Manifest declaration runtime-mutability | **N/A** | Zero `manifest.json` declarations added or modified. |

**Verdict count:** 0 PASS-with-action / 1 PASS / 11 N/A. Zero blocking concerns. The D-4 R2 binding correction is the only material R2 finding; it shrinks R3 scope rather than expands it.

---

## §55.5 R3 Fix Scope

**Files touched in R3:**

| File | Edit type | LOC count | Notes |
|------|-----------|-----------|-------|
| `sidepanel/sidepanel.js` | Replace single trash `<svg>` at line ~2481 with two `<svg>` elements (X icon + trash icon) inside the `.item-action-delete` button | +5, -1 net | Static literal markup via `innerHTML`; same XSS-safe path B-100 used. Both SVGs carry `aria-hidden="true"` + `class="icon-action-close"` / `class="icon-action-trash"`. |
| `sidepanel/sidepanel.css` | Add 3 CSS rules near line ~1155 (`.item-action-delete:hover` neighbor) — default hide X, live-state show X + hide trash | +12 LOC (rules + comment) | No existing rules modified; pure additions. |
| `tests/b111-dynamic-delete-icon.test.js` | NEW; ≥ 4 tests per AC6 | ~120 LOC | T1-T4 per §55.6. |
| `docs/design/55-b-111-dynamic-delete-icon.md` | NEW; this chapter | (this file) | |
| `docs/SOLUTION_DESIGN.md` (TOC) | +1 line — §55 added | +1 LOC | Required by R6 close per CLAUDE.md "new chapter added" rule. |

**Total source LOC delta: ~17 lines.** No HTML changes; no manifest changes; no message contract changes.

**Out-of-scope confirmed**: `buildOpenTabRow` is NOT touched. Existing tests cover the open-tab build path (per the §41 B-035 + §42 B-036 R6 close coverage); no new test coverage required for the un-changed open-tab behavior.

---

## §55.6 R5 Test Plan (≥ 4 tests, AC6)

New file: `tests/b111-dynamic-delete-icon.test.js`. Tests use the inline DOM-shim pattern from `tests/b101-drift-bar.test.js` and `tests/b110-drift-non-live-fix.test.js` (project does not use jsdom). Static-source assertions are paired with inline-stub behavior tests where the stub mirrors the post-fix `buildItemRow` SVG markup.

| # | Name | Setup | Assertion | Maps to AC |
|---|------|-------|-----------|------------|
| **T1** | both SVGs present in `.item-action-delete` after `buildItemRow` (markup contract) | Static-source assertion: read `sidepanel.js`; locate the `buildItemRow` build site; assert the constructed `.item-action-delete` button's `innerHTML` contains BOTH `class="icon-action-close"` AND `class="icon-action-trash"`. | Both class names present in the source markup; trash SVG retains its existing path-d (B-100 contract preserved); X SVG carries the R1 Q1 simple-X path (`M3 3l8 8M11 3l-8 8`). | AC1 |
| **T2** | default visibility (non-live row) — trash visible, X hidden, asserted via CSS rule presence | Static-source assertion: read `sidepanel.css`; locate the new B-111 rule block; assert `.item-action-delete .icon-action-close { display: none; }` exists as the default rule. | Default-state CSS rule present and not overridden elsewhere. | AC2 |
| **T3** | live-state visibility — X visible, trash hidden, asserted via CSS rule presence | Static-source assertion: locate `.item-row[data-live="true"] .item-action-delete .icon-action-close { display: inline-block; }` AND `.item-row[data-live="true"] .item-action-delete .icon-action-trash { display: none; }`. Both rules present. | Live-state CSS rules present and at higher specificity than the default. | AC3 |
| **T4** | reactive flip via attribute mutation (no JS code path required) | Build a synthetic `.item-row` via the inline DOM-shim with a `.item-action-delete` button containing both SVGs. Inject the new CSS rules into a `<style>` tag in jsdom-equivalent. Mutate `row.dataset.live = 'true'` and assert via `getComputedStyle` (or static rule lookup) that the X is now visible per the cascade; mutate back to `'false'` (or `delete row.dataset.live`) and assert the trash returns. | Synchronous flip via CSS only; no JS callback fires in the icon-swap path. | AC4 |
| **T5 (optional)** | B-100 click-handler regression guard | Synthesize a row + `.item-action-delete`; spy on `_handleItemActionClick`; click on a live row → assert `MSG_CLOSE_TABS` dispatched; click on a non-live row → assert modal opens (or pre-modal call dispatched). | Click-handler behavior verbatim B-100. | AC5 |

**Test count:** ≥ 4 required by AC6; R5 may ship 4-5. T5 is optional because `tests/b100-delete-on-live.test.js` already covers the click-handler contract; T5 would be a B-111-specific spot-check that the icon swap does not accidentally break the dispatcher. Recommend ship 4 (T1-T4) at the minimum; add T5 only if R5 [test-engineer] finds gaps in B-100's coverage.

**Strategy:** static-source assertions for T1-T3 (mirror the B-114 + B-115 pattern of regex-asserting CSS rule presence); behavioral inline-DOM-shim test for T4. The DOM shim from `tests/b101-drift-bar.test.js` is sufficient — the gate is purely declarative (CSS attribute selector against an attribute set by `dataset.live`), so T4's assertion can be either `getComputedStyle()` (if the shim supports CSSOM) or a static rule lookup proving the cascade would resolve correctly given the attribute mutation.

**Pre-existing test impact**: zero. `tests/b100-delete-on-live.test.js` does not assert SVG markup; `tests/b107-live-x-aria.test.js` asserts the aria-label string only (different attribute). No re-pinning needed in any existing test file.

---

## §55.7 R5 UAT Plan (≥ 3 cases, AC6)

Manual test cases against the unpacked extension on `feature/sprint-36-ui-polish`. UAT executes after R5 automated suite passes.

| # | Case | Steps | PASS criterion | FAIL criterion |
|---|------|-------|---------------|----------------|
| **UAT-1** | Default state (non-live row) shows trash icon | (1) Open the sidepanel. (2) Hover over a saved bookmark whose tab is NOT currently open. (3) Observe the right-edge action button. | Trash-with-lid icon visible in the action button; X icon NOT visible. | Trash absent OR X visible OR both icons render simultaneously. |
| **UAT-2** | Live state (live row) shows X icon | (1) Click a saved bookmark to open it (becomes live). (2) Return focus to the sidepanel. (3) Hover over the now-live row. (4) Observe the right-edge action button. | Simple X icon (two crossed lines) visible in the action button; trash icon NOT visible. | X absent OR trash visible OR both icons render. |
| **UAT-3** | Reactive flip on live-state transition | (1) Open a saved bookmark (becomes live → row icon flips to X). (2) Close the tab via the browser tab strip. (3) Wait briefly for the SW to wake + sidepanel to refresh. (4) Hover over the row again. | Icon has flipped back to trash within ~1 s of the live-state refresh. | Icon stays as X (live-state didn't update) or fails to refresh. |
| **UAT-4** | B-100 click-handler regression — both paths still work | (1) On a live row, click the X icon → tab closes (`MSG_CLOSE_TABS`); no modal appears. (2) On a non-live row, click the trash icon → modal-confirm dialog appears; confirm → bookmark deleted (`MSG_DELETE_ITEM`). | Live click closes the tab silently; non-live click opens the existing modal. Both paths match the B-100 v1.29.0 contract. | Live click opens a modal (regression) OR non-live click bypasses the modal (regression). |
| **UAT-5** | Open Tabs section unchanged (D-4 R2 binding correction sanity check) | (1) Confirm the Open Tabs section has NO action buttons (no edit, no delete) on any row. | No `.item-actions` column on Open Tab rows. | Action buttons appeared on Open Tab rows (would indicate the R2 D-4 correction was misapplied). |

**UAT count:** ≥ 3 required by AC6; this plan ships 5 mandatory cases. UAT-5 was promoted from "optional" to mandatory per R4 [qa-reviewer] L-3 — given that R1 Q5 was factually wrong about open-tab rows AND §55.12 R6 placeholder explicitly requires verifying D-4 was applied, the 5-second visual check is cheap insurance.

---

## §55.8 Performance Plan

| Path | Budget | Measurement | Rationale |
|------|--------|-------------|-----------|
| `buildItemRow` first-paint per row | ≤ +50 µs vs. baseline | Negligible — micro-bench not required | Two `<svg>` elements via `innerHTML` instead of one. The static literal HTML is ~150 chars longer; parse cost on the order of ~10-50 µs per row. On a 500-item collection: total +5-25 ms at first-paint, well within the §9 200 ms first-paint budget. |
| `MSG_LIST_ITEMS` patch loop per-row | 0 µs additional | N/A — no new JS in the patch loop | The icon swap is CSS-only. The patch loop's existing `row.dataset.live` mutation (B-048 + B-100) is unchanged; CSS cascade resolves the visibility flip with the engine's attribute-invalidation path (sub-microsecond on modern Chromium). |
| Hover state on `.item-actions` | 0 µs additional | N/A | The new rules add only `display: none` / `inline-block` toggles; hover invalidation cost is unchanged because hover affects the column container, not the icon `display`. |

**Net performance effect: imperceptible.** No path adds a full collection re-read, an unbounded loop, or a synchronous storage round-trip in the render hot path.

---

## §55.9 Accessibility Plan

| Surface | Treatment | Rationale |
|---------|-----------|-----------|
| Row aria-label | Unchanged. The B-100 / B-107 contract — `buildItemRowAriaLabel` injects "live tab" / "tab content has changed" / "selected" markers; B-107 reactively flips the X-button's aria-label between "Close tab" and "Delete bookmark" — is not touched by B-111. The icon swap is purely visual; the AT contract continues to derive name + role + state from the row + button aria-label. | The icon is decorative; both SVGs carry `aria-hidden="true"` per the B-100 § "all action-button SVGs are aria-hidden, the button's aria-label is the AT name" precedent. |
| `aria-hidden="true"` on both SVGs | Mandatory per the B-100 contract; R3 must apply it to both SVG children. | Without `aria-hidden`, the SVG paths leak into the AT name, polluting the row aria-label with the literal SVG content. Verified at B-100 R6 close as a binding contract. |
| Keyboard reachability | Unchanged. The X-button itself is a real `<button>` element; it remains a tab-stop in the row's focus order. The icon swap does not affect the button's reachability. | No new interactive elements introduced. |
| Color contrast | Both icons inherit `currentColor` from the parent button. The button's color (`var(--text-tertiary)`) and hover-state color (`#dc2626`) are unchanged. | No new color audit needed. |
| Reduced motion | No transitions or animations introduced. The visibility flip is instantaneous (`display: none` ↔ `display: inline-block`). | `prefers-reduced-motion` neutrality preserved. |

**Net accessibility effect: zero AT-visible behavior change.** The icon swap is sighted-user-only; AT users continue to hear the row aria-label as the canonical name carrier.

---

## §55.10 Rollback Plan

**Single-commit revert restores pre-B-111 behavior** — i.e., the trash icon shows on every row regardless of live state. No storage migration, no manifest change, no message contract change.

```bash
# Identify the commit on release/v2 once Wave 1 is committed:
git log --oneline release/v2 | grep "B-111"

# Single-commit revert (or revert just B-111 if Wave 1 was a multi-item commit):
git revert <merge-sha>
git push origin release/v2

# Sidepanel rebuilds rows on next refresh — no data migration needed.
```

| Aspect | Rollback impact |
|--------|-----------------|
| `tj:items` / `tj:groups` / `tj:tabClaims` / `tj:drift` | No-op. Untouched by B-111. |
| Manifest permissions | No-op. Untouched. |
| Visual behavior | Pre-B-111: every row shows trash icon. Post-rollback: same. |
| AT contract | Identical pre-rollback and post-rollback (the aria-label flip is owned by B-107, not B-111). |

**SEV severity if rollback needed: SEV3 (minor visual refinement).** No data loss; users see the trash icon on live rows again.

---

## §55.11 Open Questions

**Q1 — XSS hardening at the build site.** R1 Q4 LOCKED specifies `innerHTML` is acceptable for the new two-SVG markup since the literal contains no user-controlled interpolation. R2 ratifies; the existing single-SVG `innerHTML` at line 2481 is the precedent and uses the same pattern. No XSS concern. If a future hardening sweep migrates `.item-action-delete` markup to `appendChild` factory calls, B-111 changes naturally come along — no breaking change.

**Q2 — DOM size delta.** Two SVG elements per row instead of one. On a 500-item collection: 500 extra SVG elements in the saved-item rows. Each element is ~12 properties + 2 children + the path attribute — net DOM-tree-size delta ~5%. Browsers' DOM size budgets are typically 10K elements/page; 500 extra elements is well within budget. R5 may add a perf spot-check at first-paint to verify no measurable regression on a 1000-item collection.

**Q3 — Future B-XXX: action-buttons on Open Tabs section.** R2 D-4 binding correction documented that `buildOpenTabRow` has no action buttons; B-111 does not add them. If the product-owner later requests inline-delete for open-tab rows (close-tab-via-row-action), that would be a separate B-XXX with its own R0 spike — the design intent of the Open Tabs section as a discovery surface (per §41 B-035) would need to be revisited. Not blocking B-111.

**None of these questions block R3 or R5 of B-111.**

---

## §55.12 As Built (R6 close — 2026-04-28)

**§55.3 D-4 binding correction verification:** R3 applied D-4 correctly. Verified by `git diff sidepanel/sidepanel.js` — `buildOpenTabRow` (lines 2705-2772) was NOT modified. Zero `.item-action-delete` button added to the open-tab path. R6 status: **COMPLETE — not routed back to R3.**

**Files changed (vs. §55.5 R3 fix scope expectation):**

| File | Edit | Net LOC | Matches §55.5? |
|------|------|--------:|----------------|
| `sidepanel/sidepanel.js` (line ~2481) | `deleteBtn.innerHTML` updated to concatenate two SVGs (X icon `.icon-action-close` + trash icon `.icon-action-trash`); existing trash path-d preserved verbatim; both SVGs `aria-hidden="true"` | +9 / -1 | ✅ within "+5/-1" expectation (slightly over due to expanded comment block) |
| `sidepanel/sidepanel.css` (after `.item-action-delete:hover`) | 4 new rules + comment (default hide X, default show trash, live-state show X, live-state hide trash) — symmetric trash default added in R6 per R4 LOWs | +18 LOC | Within "+12 LOC" expectation; +4 over due to R4-driven symmetric default rule (qa M-2 + code L-1) |
| `tests/b111-dynamic-delete-icon.test.js` (NEW) | T1 + T2 + T3 + T4 (4 tests; T5 click-handler regression intentionally not included — covered by `tests/b100-delete-on-live.test.js`) | 175 LOC | ✅ ≥ 4 mandatory; shipped 4 |
| `docs/SOLUTION_DESIGN.md` (TOC) | +1 line — §55 added to chapter index | +1 LOC | Required by R6 close (new chapter added) |
| `docs/design/55-b-111-dynamic-delete-icon.md` (this file) | NEW (R2) + R6 close fill of §55.12 + UAT-5 promoted to mandatory per R4 [qa] L-3 | (this file) | R6 work product |

**Test counts:** pre-B-111 baseline 1,493 → post-B-111 **1,497 (+4)**. Full suite passes; zero regressions.

**R4 disposition (2026-04-28):**
- **[code-reviewer]**: PASS. 3 LOW findings:
  - L-1 (asymmetric default rules — trash relies on SVG default `display: inline`): fixed in R6 — explicit `.item-action-delete .icon-action-trash { display: inline-block; }` rule added for symmetric belt-and-suspenders defense against future global SVG resets.
  - L-2 (diff includes B-109 work — orchestrator-awareness only): non-finding; B-109 reviewed under W1-A R4.
  - L-3 (T4 hand-rolled cascade model not real DOM): acceptable per project precedent (no jsdom in the project).
- **[security-reviewer]**: PASS. No findings any tier. Confirmed: zero new permissions, zero CSP relaxation, zero new sinks, `innerHTML` is concatenated static literals with no user-controlled interpolation.
- **[qa-reviewer]**: PASS. 3 LOW findings:
  - L-1 (T1 trash path-d regex had a malformed first alternative that could silently match a broken path): fixed in R6 — single verbatim regex retained; broken alternative dropped.
  - L-2 (same as code-reviewer L-1): fixed in R6 (see above).
  - L-3 (UAT-5 D-4 sanity check should be mandatory): promoted to mandatory in R6; UAT plan now ships 5 mandatory cases (was 4 mandatory + 1 optional).

**Deviations from §55.3 R2 plan:** none material. R3 shipped exactly the two-SVG markup + the cascade-driven visibility rules per the locked decisions. R6 added one extra symmetric default CSS rule (qa-L-2 / code-L-1) as defense-in-depth. The R2 §55.3 D-4 binding correction was applied successfully — no `buildOpenTabRow` changes shipped.

**UAT execution:** deferred to product-owner manual run in Edge per Sprint 36 close convention. UAT-1 through UAT-5 (`docs/design/55-b-111-dynamic-delete-icon.md` §55.7) are documented as a checklist; results to be recorded in `SPRINT.md` "Completed This Sprint" → B-111 entry at sprint close. SEV3 rollback procedure documented in §55.10 (single-commit revert; no storage migration).

**Follow-up backlog candidates** (file in BACKLOG.md as separate items if/when prioritized):
- **§55.11 Q3** — If product-owner later requests inline-delete on Open Tabs section, file as a separate B-XXX with R0 spike (the §41 B-035 design intent of Open Tabs as a discovery surface needs to be revisited as part of that scope).

**New precedents established:**
1. **R2 binding-correction pattern, second instance** (D-4): R2 caught R1 Q5's factually wrong claim about `buildOpenTabRow` having an `.item-action-delete` button. Same pattern as §54 B-108 D-2 — R2 may correct R1 LOCKED's technical scope without forcing a re-lock; corrected interpretation is binding for R3, and R6 must verify the correction was applied. This is now a recurring R2 quality gate; treat with the rigor of a CRITICAL/HIGH finding even though it is technically a scope shrink, not a scope expansion.
2. **Symmetric default-rule discipline for cascade-driven visibility toggles** (R4 [qa]/[code] L-1+L-2): when toggling visibility via attribute selectors against multiple sibling elements, the default state of EACH element should have an explicit CSS rule — even if the user-agent default would naturally produce the desired result. This prevents silent regressions from future cross-cutting CSS changes (global resets, opinionated frameworks). The +1 LOC cost is worth the defense-in-depth.
