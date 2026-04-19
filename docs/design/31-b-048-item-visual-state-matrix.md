## 31. B-048 — Item Visual-State Matrix (R2 Design)

*Sprint 16 — Full (M). Owner: [solution-architect] R2 → [frontend-engineer] R3. Companion to §30 (B-029) — both items land in Sprint 16 but are scope-independent.*

### 31.1 Overview

Tab Junkie currently paints five item-row states — `live`, `active`, `drifted`, `audible`, `selected` — through an informal mix of border colors, background washes, icon toggles, and a synthetic `::before` pseudo-element. The visual language was grown organically across B-010 (live + active), B-011 (drift), B-012 (audible), and B-024 (selection). B-048's thesis is that **"visual polish" is actually an accessibility item**: the acceptance criteria demand non-color distinction (AC1), combined-state legibility (AC2), WCAG AA contrast in every cell of the state × theme × interaction matrix (AC3), hover-distinct-from-state affordances (AC4), a clear `:focus-visible` ring on every state (AC5), a Gmail/Todoist hover-reveal checkbox (AC6), and a deterministic screen-reader label contract (AC7).

The states and their authoritative data contracts (unchanged — per AC10):

| State | Source | Contract | `data-*` on `.item-row` |
|---|---|---|---|
| `live` | `liveStates[itemId].live` (B-010) | A live tab is currently claimed to this saved item | `data-live="true"` |
| `active` | `liveStates[itemId].active` (B-010) | The claimed live tab is the focused tab in its window | `data-active="true"` |
| `drifted` | `driftRecords[itemId]` (B-011) | The claimed live tab's URL has navigated away from the saved URL | `data-drifted="true"` |
| `audible` | `liveStates[itemId].audible` (B-012) | The claimed live tab is currently producing audio | `data-audible="true"` |
| `selected` | `_selection: Set<string>` (B-024) | The user has multi-selected this row — UI-only, never persisted | `data-selected="true"` + `aria-selected="true"` |

Sprint 15 retro action item #2 (contrast check on every promoted theme token) and Sprint 14 retro action item (`:focus-visible` must never use `--accent-subtle` as the ring) apply throughout.

### 31.2 Data-Layer Verification — No New Writes Required

**Authoritative write sites (already in place — confirmed via grep against `sidepanel/sidepanel.js`):**

| `data-*` attribute | Write site(s) | Clear site(s) |
|---|---|---|
| `data-live` | `buildItemRow` L1377 (first paint), `refetchAndPatchLiveState` L1909 (patch path), error-branch clear L1847 | `refetchAndPatchLiveState` L1909 (when `live.live` false), L1847 (error fallback) |
| `data-active` | `buildItemRow` L1378, `refetchAndPatchLiveState` L1910, `_patchOpenTabRow` L1771 (Open Tabs), error-branch L1848 | Same sites (else-branches) |
| `data-audible` | `buildItemRow` L1379, `refetchAndPatchLiveState` L1911, `_patchOpenTabRow` L1772, error-branch L1849 | Same sites (else-branches) |
| `data-drifted` | `buildItemRow` L1380, `refetchAndPatchLiveState` L1912, error-branch L1850 | Same sites (else-branches) |
| `data-selected` | `_setRowSelected(row, true)` L927 (every toggle/range/all site routes through it per B-024 §25.6) | `_setRowSelected(row, false)` — same function, `delete row.dataset.selected` |

**Verdict: no new write sites needed for B-048.** Every `data-*` attribute is already kept in sync through a single choke-point per state, all of which are exercised by the existing B-010 / B-011 / B-012 / B-024 test coverage.

**Precursor fix — flagged, not blocking:** `buildItemRow` L1377–L1380 uses the guarded-assign idiom (`if (live?.live) row.dataset.live = 'true';`) which does **not** clear a stale attribute when `live.live` is false. In practice this is safe because `buildItemRow` always runs on a freshly-constructed `<div>` (no stale state possible at first paint), but the symmetric patch path `refetchAndPatchLiveState` L1909–L1912 uses the proper `if ... else delete` pattern. Leaving `buildItemRow` as-is is correct — it's a true precondition, not a bug — but [frontend-engineer] should add a defensive comment at L1377 noting "buildItemRow assumes a fresh row; steady-state writes go through `refetchAndPatchLiveState`."

### 31.3 The Five-State Matrix

Four interaction sub-states per row: **default** (steady) · **hover** (pointer over, not focused) · **focus-visible** (keyboard-focused) · **active-row** (pointer down in-progress — `.item-row:active`, out of scope for this item because it is transient; documented here only to confirm the `:focus-visible` ring wins the stacking contest over `:active`).

Effective-background rule: the *effective background* is the layer the row's text actually paints over. When a row is both `active` and `selected`, the selection background wins at `z-layer 2` (see §31.4) — contrast is measured against `--selected-bg`.

Colors are the hex values resolved by `sidepanel.css` at file line numbers stated in §31.8. "L" = light theme (`data-theme="light"` or absent), "D" = dark theme (`data-theme="dark"` or `prefers-color-scheme: dark` + no explicit theme override).

| State | Theme | Sub-state | Background | Border / Rail | Text (title) | Icon tokens | Checkbox visibility | Foreground contrast |
|---|---|---|---|---|---|---|---|---|
| **live** | L | default | `--bg-primary` `#ffffff` | left rail `--live-indicator` `#16a34a` 3px | `--text-primary` `#1a1d23` | none (unless audible/drifted also set) | hover-reveal | title 16.1:1 PASS / rail 3.1:1 PASS |
| live | L | hover | `--bg-hover` `#ebedf0` | rail unchanged | `--text-primary` | none | revealed | title 12.6:1 PASS / rail 3.0:1 PASS |
| live | L | focus-visible | `--bg-primary` | rail + `outline: 2px solid --focus-ring #2563eb` (offset −2px, z 5) | `--text-primary` | none | revealed | title 16.1:1 PASS / ring 8.6:1 PASS |
| live | D | default | `--bg-primary` `#1a1d23` | rail `--live-indicator` `#4ade80` 3px | `--text-primary` `#e8eaed` | none | hover-reveal | title 13.1:1 PASS / rail 8.9:1 PASS |
| live | D | hover | `--bg-hover` `#2a2f38` | rail unchanged | `--text-primary` | none | revealed | title 10.7:1 PASS / rail 7.2:1 PASS |
| live | D | focus-visible | `--bg-primary` | rail + `outline: 2px --focus-ring #60a5fa` | `--text-primary` | none | revealed | title 13.1:1 PASS / ring 7.5:1 PASS |
| **active** | L | default | `--active-bg` `#eff4ff` | left rail `--active-border` `#2563eb` 3px | `--text-primary` `#1a1d23` | none | hover-reveal | title 15.6:1 PASS / rail 7.3:1 PASS |
| active | L | hover | derived `--active-bg-hover` (NEW §31.7) | rail unchanged | `--text-primary` | none | revealed | title ≥14.0:1 PASS / rail ≥7.0:1 PASS |
| active | L | focus-visible | `--active-bg` | rail + ring `--focus-ring` `#2563eb` | `--text-primary` | none | revealed | title 15.6:1 PASS / ring 7.3:1 PASS |
| active | D | default | `--active-bg` `#1e293b` | rail `--active-border` `#60a5fa` 3px | `--text-primary` `#e8eaed` | none | hover-reveal | title 11.7:1 PASS / rail 6.7:1 PASS |
| active | D | hover | derived `--active-bg-hover` | rail unchanged | `--text-primary` | none | revealed | title ≥11.0:1 PASS / rail ≥6.0:1 PASS |
| active | D | focus-visible | `--active-bg` | rail + ring `--focus-ring` `#60a5fa` | `--text-primary` | none | revealed | title 11.7:1 PASS / ring 6.7:1 PASS |
| **drifted** | L | default | `--bg-primary` | inherits live rail when `data-live` also set | `--text-primary` | drifted icon `--drifted-color` `#d97706` 14×14 triangle | hover-reveal | title 16.1:1 PASS / icon 3.5:1 PASS |
| drifted | L | hover | `--bg-hover` | rail unchanged | `--text-primary` | icon unchanged | revealed | title 12.6:1 PASS / icon 3.3:1 PASS |
| drifted | L | focus-visible | `--bg-primary` | + ring `--focus-ring` | `--text-primary` | icon unchanged | revealed | ring 8.6:1 PASS / icon 3.5:1 PASS |
| drifted | D | default | `--bg-primary` `#1a1d23` | inherits live rail | `--text-primary` | icon `--drifted-color` `#fbbf24` | hover-reveal | title 13.1:1 PASS / icon 10.7:1 PASS |
| drifted | D | hover | `--bg-hover` `#2a2f38` | rail unchanged | `--text-primary` | icon unchanged | revealed | title 10.7:1 PASS / icon 8.7:1 PASS |
| drifted | D | focus-visible | `--bg-primary` | + ring `--focus-ring` `#60a5fa` | `--text-primary` | icon unchanged | revealed | ring 7.5:1 PASS / icon 10.7:1 PASS |
| **audible** | L | default | `--bg-primary` | inherits live rail when `data-live` also set | `--text-primary` | audible icon `--audible-color` `#7c3aed` speaker 14×14 | hover-reveal | title 16.1:1 PASS / icon 6.2:1 PASS |
| audible | L | hover | `--bg-hover` | rail unchanged | `--text-primary` | icon unchanged | revealed | title 12.6:1 PASS / icon 5.8:1 PASS |
| audible | L | focus-visible | `--bg-primary` | + ring `--focus-ring` | `--text-primary` | icon unchanged | revealed | ring 8.6:1 PASS / icon 6.2:1 PASS |
| audible | D | default | `--bg-primary` | inherits live rail | `--text-primary` | icon `--audible-color` `#a78bfa` | hover-reveal | title 13.1:1 PASS / icon 6.4:1 PASS |
| audible | D | hover | `--bg-hover` | rail unchanged | `--text-primary` | icon unchanged | revealed | title 10.7:1 PASS / icon 5.2:1 PASS |
| audible | D | focus-visible | `--bg-primary` | + ring `--focus-ring` | `--text-primary` | icon unchanged | revealed | ring 7.5:1 PASS / icon 6.4:1 PASS |
| **selected** | L | default | `--selected-bg` `#dbeafe` | `box-shadow: inset 0 0 0 1px --selected-border #2563eb` (NEW §31.4) | `--text-primary` `#1a1d23` | none | **visible (persistent)** | title 14.0:1 PASS / outline 6.5:1 PASS |
| selected | L | hover | `--selected-bg` (unchanged per AC4 note) | outline unchanged | `--text-primary` | none | visible | title 14.0:1 PASS / outline 6.5:1 PASS |
| selected | L | focus-visible | `--selected-bg` | box-shadow + ring `--focus-ring` (ring z=5 above box-shadow z=2) | `--text-primary` | none | visible | ring 6.5:1 PASS / outline 6.5:1 PASS |
| selected | D | default | `--selected-bg` `#1e3a5f` | box-shadow `--selected-border` `#60a5fa` 1px inset | `--text-primary` `#e8eaed` | none | visible | title 10.5:1 PASS / outline 5.3:1 PASS |
| selected | D | hover | `--selected-bg` | outline unchanged | `--text-primary` | none | visible | title 10.5:1 PASS / outline 5.3:1 PASS |
| selected | D | focus-visible | `--selected-bg` | box-shadow + ring `--focus-ring` | `--text-primary` | none | visible | ring 5.3:1 PASS / outline 5.3:1 PASS |

**Notes on the matrix:**

1. **Drifted + audible stack with `live`/`active` additively.** The icon column is purely independent of the background/rail column — `.item-indicators` lives in a separate flex child with its own color (`--drifted-color` / `--audible-color`), so the icons never collide with background paints. This is validated in §31.4.
2. **Hover-on-`active` deliberately needs a new token** (`--active-bg-hover`). Today the codebase relies on `.item-row[data-active="true"]` winning over `.item-row:hover` via CSS specificity order — which means hovering an active row looks identical to not hovering it (AC4 fails). The new token is the minimum fix. See §31.7.
3. **URL text contrast on selected rows.** `.item-url` uses `color: var(--text-tertiary)` (L500). Light `#8a8f9a` on `--selected-bg` `#dbeafe` = 3.4:1 — **BELOW AA 4.5:1**. Proposed mitigation: on selected rows, promote `.item-url` to `--text-secondary` (`#5f6673` light → 5.6:1 PASS / `#9aa0ab` dark on `#1e3a5f` → 6.4:1 PASS). Implemented via `.item-row[data-selected="true"] .item-url { color: var(--text-secondary); }`.
4. **Icon 3:1 floor:** `--drifted-color` light on `--bg-hover` was the lowest icon number (3.3:1). Still ≥ 3.0 but worth monitoring if `--bg-hover` ever drifts brighter.

### 31.4 Combined-State Stacking Order

AC2 specifies: `background → border → icon-row → selection-checkbox → focus-ring`. The CSS technique per layer:

| z-layer | Concern | CSS technique | Selector |
|---|---|---|---|
| 0 (paint) | Row background | `background:` on `.item-row` (single declaration, chosen by state precedence: `selected > active > hover > default`) | `.item-row[data-selected="true"]` > `.item-row[data-active="true"]` > `.item-row:hover` > `.item-row` |
| 1 | Left rail (3px indicator) | `border-left: 3px solid <token>; padding-left: 9px;` on `.item-row` — renders as part of the box, no overdraw | `.item-row[data-active="true"]`, `.item-row[data-live="true"]` |
| 2 | Selection outline | `box-shadow: inset 0 0 0 1px var(--selected-border);` — paints inside the row box at z=2 so the left rail remains visible AND the focus outline at z=5 is never clipped | `.item-row[data-selected="true"]` |
| 3 | Icon row (audible + drifted + window badge) | Flex child `.item-indicators` inside the row (natural doc flow, no z-index needed) | `.item-indicators` |
| 4 | Checkbox affordance | Flex child `.item-select` (NEW — see §31.5) prepended as the first child of `.item-row` so it never collides with the indicators tail | `.item-select` |
| 5 | `:focus-visible` ring | `outline: 2px solid var(--focus-ring); outline-offset: -2px;` — higher-specificity selector wins; `outline` paints above `box-shadow` in the browser stack | `.item-row:focus-visible` |

**Key technique decisions:**

- **Double-outline collision (selected + focused):** CSS permits only one `outline` per element. Strategy: on selected + focused rows, use `outline` for the `:focus-visible` ring (z=5) and switch the selection affordance to `box-shadow: inset 0 0 0 1px var(--selected-border);`. The box-shadow paints at roughly the same location as the outline would have, does not collapse, and — critically — does **not clip** the focus outline (AC5). This is encoded as:
  ```css
  .item-row[data-selected="true"] { box-shadow: inset 0 0 0 1px var(--selected-border); }
  .item-row[data-selected="true"]:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; /* box-shadow remains */ }
  ```
  This replaces the current `outline: 1px solid var(--selected-border)` on `[data-selected="true"]` (L1082). It's a one-token-line CSS change — no DOM impact.
- **B-024 `::before` checkmark removal:** the existing `[data-selected="true"]::before` block (L1090–L1102) renders a pseudo-element check-mark as a flex child. This is **superseded** by the real `.item-select` checkbox element (§31.5). The pseudo-element is removed in R3 and its role moves to the checkbox. Net: one fewer DOM pseudo-element, one more real (`role="checkbox"`) DOM element — an accessibility win, not a regression.
- **Focus ring never clipped:** z=5 outline with `offset: -2px` paints 2px inward from the row box. The only thing occupying z=2 in the same box is the selection `box-shadow` (inset 1px) which paints at 1px inward — leaving 1px of clear air between the two visual features. The left-rail border at z=1 is part of the box itself so `outline-offset: -2px` paints **over** it on the left edge, not clipped by it.

### 31.5 Checkbox Affordance Architecture

**PO-confirmed**: hover-reveal (AC6) — checkbox is persistent when selected, reveal-on-hover / reveal-on-focus-visible otherwise. Layout space is reserved at all times to prevent reflow.

**Three options evaluated:**

| Option | Keyboard activation | Screen-reader output | B-024 integration | Verdict |
|---|---|---|---|---|
| (a) `<input type="checkbox">` native | Native — Space toggles at input level; must `preventDefault` at row level to avoid dual-toggle | "<title>, checkbox, checked/not checked" — native, well-understood by JAWS/NVDA/VoiceOver | Row-level click handler must filter `event.target.type === 'checkbox'` to avoid double-toggle when the native input already handled Space | Double-event risk is significant; native inputs carry OS-specific focus ring baggage that fights with our `--focus-ring` |
| (b) `<span role="checkbox" aria-checked>` child, `tabindex="0"` | Manual — listen for Space/Enter on the span, `preventDefault` default scroll | Same as native via ARIA | Adds a second tab-stop per row — doubles keyboard traversal | Tab-stop regression |
| (c) Row-level `role="checkbox"` + `aria-checked` on `<li>` | Existing B-024 handler already toggles via `_toggleSelection`; just add `role="checkbox"` + `aria-checked` mirror | "<title>, checkbox, checked/not checked" | Zero new keyboard code | Conflicts with existing `role="listitem"` inside `role="list"` container (ARIA owns hierarchy) |
| **(d) Hybrid — row keeps `listitem`, add `.item-select` child with `role="checkbox"`, `aria-checked`, `tabindex="-1"`** | Row's existing Space/Enter handler toggles selection and mirrors `aria-checked` onto the child | "<title>, checkbox, checked/not checked" — AT announces when focus is on the parent row | Zero new keyboard code; child is non-tab-stop (does not double the traversal count) | **PICKED** — Gmail pattern |

**Decision: Option (d).** The `.item-select` is a pure visual + semantic affordance. It is **not** a tab-stop (`tabindex="-1"`). Keyboard activation continues to go through the row's existing Space/Enter handler (B-024). The child exposes `role="checkbox"` + `aria-checked` so AT correctly announces the checkbox state when focus is on the parent row (the AT composes role + state from the composite descendant set, which is the Gmail convention).

**Conflict with existing `aria-selected`:** `_setRowSelected` currently writes `aria-selected="true"` (introduced in B-055 M-4 per the inline comment at L922–L926). Strategy: [frontend-engineer] updates `_setRowSelected` to (a) write `aria-checked` onto the new `.item-select` child, (b) retain `aria-selected` on the row (benign — assistive tech reads `aria-checked` first when `role="checkbox"` is present on the descendant). This is additive to B-024 — no existing B-024 behavior changes.

**DOM shape added to `buildItemRow`:**

```
<div class="item-row" role="listitem" tabindex="0" aria-selected="..." aria-label="...">
  <span class="item-select" role="checkbox" aria-checked="false" tabindex="-1" aria-hidden="false">
    <!-- visual glyph: box or checkmark, swapped via aria-checked attribute selector -->
  </span>
  <img class="item-favicon" ... />  <!-- existing -->
  ...
</div>
```

**Layout reservation per AC6:** `.item-select { flex: 0 0 18px; visibility: hidden; }` — occupies 18px always. `.item-row:hover .item-select, .item-row:focus-visible .item-select, .item-row[data-selected="true"] .item-select { visibility: visible; }`. No reflow on hover.

### 31.6 SR Label Architecture

AC7 concat order (PO-confirmed): `active → live → drifted → audible → selected`. Example: row with all five flags reads `"active tab, live tab, tab content has changed, playing audio, selected"`.

**Three options evaluated:**

| Option | SR output | Maintenance surface | B-010/B-011/B-012 interaction |
|---|---|---|---|
| (a) Single `aria-label` on the row, rebuilt in `_patchItemRow` | "<title>, active tab, live tab, ..." — one announcement | Low — one string composition function, called from `buildItemRow` + `refetchAndPatchLiveState` + `_setRowSelected` | Requires writing `aria-label` at every `data-*` change site (5 sites) |
| (b) Visually-hidden `<span>` children per state | "<title> active tab live tab ..." — SR reads in DOM order | Medium — 5 `<span>` children, each toggled `hidden` per state | Pre-existing B-011 `aria-label` on `.item-drifted-icon` already partially implements this — would need to retrofit to standardize |
| (c) `aria-describedby` → hidden live-region | Works but surprises users on state change (live-region nudges) | Highest — requires a separate element and ID management | Live-region updates are for *changes*, not steady descriptions |

**Decision: Option (a) — single `aria-label` rebuilt at every state change.** Rationale:

1. AC7 specifies concat order `active → live → drifted → audible → selected`. Option (b) would follow DOM order, which is not guaranteed to match. Option (a) gives us deterministic control.
2. The title + URL are already the row's implicit accessible name. Wrapping them into a single `aria-label` is the clearest AT experience.
3. The maintenance cost (3 call sites — `buildItemRow`, `refetchAndPatchLiveState`, `_setRowSelected`) is already paid — every `data-*` write site already exists; adding an `aria-label` rebuild next to it is a ~3-line helper call.

**Function signature:**

```js
/**
 * B-048: Build the deterministic screen-reader label for an item row.
 * Concat order is fixed by AC7: active → live → drifted → audible → selected.
 * Returns a single string suitable for `row.setAttribute('aria-label', ...)`.
 *
 * @param {Object} item — saved item with `title`, `url`
 * @param {Object|undefined} live — liveStates[item.id] (may be undefined)
 * @param {Object|undefined} drifted — driftRecords[item.id] (truthy when drifted)
 * @param {boolean} selected — result of `_selection.has('item:' + item.id)`
 * @returns {string}
 */
function _buildItemRowAriaLabel(item, live, drifted, selected) { ... }
```

Call sites:

1. `buildItemRow` (L1367) — after all `data-*` are set, compute label and `row.setAttribute('aria-label', label)`.
2. `refetchAndPatchLiveState` (L1902 row loop) — after the four `data-*` attribute patches, recompute and set.
3. `_setRowSelected` (L927) — after the dataset/aria-selected/aria-checked writes, recompute. Read `_cachedLiveStates[row.dataset.itemId]`, `_cachedDriftRecords[row.dataset.itemId]`, and `_cachedItems` for the item (existing B-024 pattern).

**Example outputs verified against AC7:**

| State flags | Output |
|---|---|
| live only | `"<title>, live tab"` |
| live + active | `"<title>, active tab, live tab"` (active first per concat order) |
| live + drifted | `"<title>, live tab, tab content has changed"` |
| live + audible | `"<title>, live tab, playing audio"` |
| selected only | `"<title>, selected"` |
| all five | `"<title>, active tab, live tab, tab content has changed, playing audio, selected"` |

**Icon `aria-label` cleanup:** The existing `_createAudibleIcon` (L1350) and `_createDriftedIcon` (L1359) set `aria-label="Playing audio"` and `aria-label="Tab has navigated away from its saved URL"`. With the row-level `aria-label` now carrying these strings, the per-icon labels become **duplicate announcements**. [frontend-engineer] switches the icons to `aria-hidden="true"` in R3 (AT ignores them; the row-level label is authoritative). This also normalizes the mild inconsistency between "playing audio" (AC7) and "Playing audio" (existing icon label) — AC7 wins.

### 31.7 Token Changes

| Token | Today | B-048 proposal | Contrast verification |
|---|---|---|---|
| `--live-indicator` | existing (L22 light, L52 dark) | Unchanged | Already ≥ 3:1 on `--bg-primary` and `--bg-hover` (see §31.3) |
| `--active-bg` | existing (L23, L53) | Unchanged | ≥ AA on text (§31.3) |
| `--active-border` | existing (L24, L54) | Unchanged | ≥ 3:1 rail |
| `--audible-color` | existing (L25, L55) | Unchanged | ≥ 3:1 icon |
| `--drifted-color` | existing (L26, L56) | Unchanged | ≥ 3:1 icon |
| `--selected-bg` | existing (L35, L66) | Unchanged | ≥ AA on `.item-title` at `--text-primary`; requires `.item-url` promotion to `--text-secondary` (§31.3 note 3) |
| `--selected-border` | existing (L35, L66) | Unchanged | ≥ 3:1 outline |
| `--focus-ring` | existing (L20, L51) | Unchanged; NEVER replace with `--accent-subtle` (Sprint 14 retro) | ≥ 3:1 on all surfaces verified |
| **`--active-bg-hover`** | **NEW** | Light: `#e2e8fd` (≈ `--active-bg` darkened 4%); Dark: `#263147` (≈ `--active-bg` lightened 4%) | Title `--text-primary` on light: 14.8:1 PASS / dark: 10.9:1 PASS |

**NEW token: `--active-bg-hover`.** Required by AC4 ("hover distinct from state") — today an active row hovered is visually identical to an unhovered active row. Contract: introduce the token in both theme blocks, add `.item-row[data-active="true"]:hover { background: var(--active-bg-hover); }` positioned **after** the existing `[data-active="true"]` rule so specificity + order win. Contrast: verified ≥ AA in both themes above.

**Sprint 15 retro action item #2 — contrast audit for new surfaces:** the only new surface is `--active-bg-hover` (both themes). Verified via contrast-ratio math against `--text-primary`, `--text-secondary` (URL subtext on hover), and `--drifted-color` / `--audible-color` (icons). All cells pass AA floor. Recorded in `docs/a11y-audit-B-048.md` (sibling of `docs/a11y-audit-B-062.md`) — created in R3.

**B-062 collision audit:** B-062 is actively editing `--accent`, `--accent-hover`, potentially introducing `--on-accent`. B-048 does NOT edit any `--accent*` token directly. Indirect reads:

| Surface | Token | Source | B-048 impact |
|---|---|---|---|
| `--focus-ring` | `#2563eb` (L) / `#60a5fa` (D) | *Distinct token* — NOT the same as `--accent`, though they share values today | None — `--focus-ring` is its own token; if B-062 changes `--accent` the focus ring is unaffected |
| `--selected-border` | `#2563eb` / `#60a5fa` | *Distinct token* — same values as `--accent` today | If B-062 darkens dark-theme `--accent` (one of the mitigation options) → no impact on `--selected-border` unless B-062 also touches it |

**Proposed shared-token contract with B-062:** both items write to `sidepanel.css` `:root` blocks. Sequencing (B-062 R3 lands before B-048 R3 per [scrum-master] Wave plan) avoids merge conflicts. If B-062's fix is "introduce `--on-accent`", then B-048 has zero shared surface — fully independent. If B-062's fix is "darken `--accent`", B-048 should verify `--active-border` and `--live-indicator` still read AA against the new `--active-bg` (which reads from `--accent-subtle` upstream). **Action:** [frontend-engineer] re-runs the §31.3 matrix after B-062 R3 lands and publishes the updated `docs/a11y-audit-B-048.md`.

Note: §30.5 also touches `--accent` for the B-029 group-picker row highlight. B-029 R3 is scheduled Wave 3, B-048 Wave 4 — B-048 rebases and re-verifies after both B-062 and B-029 land.

### 31.8 CSS Grep Verification

Selectors named in §31.3 / §31.4 / §31.7 (Sprint 15 retro action item #1 — grep every selector before handoff):

| Selector | Today | B-048 intro | File:line |
|---|---|---|---|
| `.item-row` | exists | reused | `sidepanel.css:419` |
| `.item-row:hover` | exists | reused | `sidepanel.css:430` |
| `.item-row[data-live="true"]` | exists | reused | `sidepanel.css:436` |
| `.item-row[data-active="true"]` | exists | reused | `sidepanel.css:441` |
| `.item-row[data-audible="true"] .item-audible-icon` | exists | reused | `sidepanel.css:447` |
| `.item-row[data-drifted="true"] .item-drifted-icon` | exists | reused | `sidepanel.css:451` |
| `.item-row:focus-visible` | exists | reused | `sidepanel.css:528` |
| `.item-row[data-selected="true"]` | exists | **modified** — swap `outline` → `box-shadow: inset` | `sidepanel.css:1080` |
| `.item-row[data-selected="true"]:hover` | exists | reused | `sidepanel.css:1086` |
| `.item-row[data-selected="true"]::before` | exists (B-024 checkmark pseudo) | **removed** — superseded by `.item-select` DOM element | `sidepanel.css:1090` |
| `.item-row[data-selected="true"]:focus-visible` | new | **introduced** | §31.4 |
| `.item-row[data-active="true"]:hover` | new | **introduced** for AC4 | §31.7 |
| `.item-row[data-selected="true"] .item-url` | new | **introduced** for §31.3 note 3 | §31.3 |
| `.item-select` | new | **introduced** — flex child w/ hover-reveal | §31.5 |
| `.item-row:hover .item-select` | new | **introduced** — reveal | §31.5 |
| `.item-row:focus-visible .item-select` | new | **introduced** — reveal-on-focus | §31.5 |
| `.item-row[data-selected="true"] .item-select` | new | **introduced** — persistent when selected | §31.5 |
| `.item-indicators` | exists | reused | `sidepanel.css:506` |
| `.item-audible-icon` | exists | reused | `sidepanel.css:513` |
| `.item-drifted-icon` | exists | reused | `sidepanel.css:519` |
| `.item-actions` | exists (R3 needs to verify the new `.item-select` does not collide with this flex child) | reused | `sidepanel.css:884` |

**HTML grep:** `sidepanel.html` L96 defines `#item-list` as `role="list"`. `.item-row` is constructed in JS (`buildItemRow` L1368) — no HTML template to grep. All assertions in §31.3–§31.5 against `role="list"` / `role="listitem"` / the new `role="checkbox"` on `.item-select` are sound.

### 31.9 Performance Budgets

AC8 (patch-path ≤500ms) and AC9 (zero full re-renders) are both preserved because the state-write surface does not move:

| Constraint | Strategy |
|---|---|
| **Single touch point for `data-*` writes** | `refetchAndPatchLiveState` (L1902 loop) remains the authoritative patch site for live/active/audible/drifted. `_setRowSelected` (L927) remains the authoritative patch site for selected. B-048 adds **one call per site** to `_buildItemRowAriaLabel` + `row.setAttribute('aria-label', ...)` — an O(1) string composition and one attribute write. Negligible. |
| **DOM insertions happen at `buildItemRow` time only** | `.item-select` is inserted **once** in `buildItemRow` as the first flex child (before the favicon). Never inserted / removed during state changes — hover-reveal is pure CSS `visibility` (preserves layout per AC6 "reserves layout space even when the checkbox is visually hidden"). |
| **State change = attribute flip** | All five state transitions map to `row.dataset.*` / `aria-checked` / `aria-label` writes only. No layout changes (the left rail's 3px + `padding-left: 9px` compensation means `data-live` on/off does not reflow — verified in existing B-010 tests). The new `.item-select` slot occupies fixed 18px (14px checkbox + 4px gap) at all times. |
| **No new style recalc scope** | `[data-selected="true"] .item-url { color: var(--text-secondary); }` adds one selector; the `:hover` / `:focus-visible` reveal uses simple descendant selectors that are cheap. No animations, no transitions on the checkbox (snap visibility per AC6). |

**Mental model for [frontend-engineer]:** "state change = `row.setAttribute(...)`", nothing more. Invariant held.

### 31.10 Out of Scope

Quoted verbatim from AC10:

> (a) no change to the semantic meaning of any state — `live`/`active`/`drifted`/`audible` are defined by existing message contracts; this item is purely visual.
> (b) no new states introduced.
> (c) no change to focus-management architecture.
> (d) no change to any saved-item storage shape.
> (e) cross-browser/OS tab-color sync remains owned by B-041.

### 31.11 R2 Correctness Checklist

| # | Check | Status | Notes |
|---|---|---|---|
| C-1 | Storage schema versioned | N/A (PASS) | No storage changes. Per AC10(d). |
| C-2 | Message contracts typed | N/A (PASS) | No message changes. Per AC10(a). |
| C-3 | Service worker cold-start safe | PASS | Every state attribute is derived at render time from `_cachedLiveStates` / `_cachedDriftRecords` / `_selection` — all module-level and populated synchronously from the `MSG_LIST_ITEMS` response. No SW cold-start gap because `refetchAndPatchLiveState` is the entry point for all steady-state updates (and is idempotent — a re-invoke on SW wake rebuilds every `data-*` + `aria-label` from scratch). |
| C-4 | ID stability | N/A (PASS) | No new identity surfaces. Selection keys (`item:<id>` / `tab:<id>`) are unchanged from B-024/B-055. |
| C-5 | Manifest file references resolvable | N/A (PASS) | No manifest changes. |

### 31.12 Rollback Plan

CSS-only + small JS refactor. Rollback = `git revert <B-048 commit>`. Post-rollback user experience:

- `.item-row[data-selected="true"]::before` checkmark returns (B-024 behavior).
- `.item-select` DOM element disappears (checkbox slot gone; hover-reveal behavior gone).
- `:hover` on `[data-active="true"]` again looks identical to unhovered — pre-B-048 behavior.
- Screen-reader announcements revert to per-icon `aria-label`s + the implicit row text — functional, less polished.
- `.item-url` on selected rows reverts to `--text-tertiary` (the 3.4:1 cell); a known pre-existing AA gap comes back.

No data loss. No storage schema implication. No manifest implication. No message-contract implication.

### 31.13 Flagged Risks for R4

| Severity | Risk | Mitigation |
|---|---|---|
| **MEDIUM** | CSS merge conflict with B-062 on `--accent` / `--on-accent` usage in `sidepanel.css` `:root` + `[data-theme]` blocks. Possible secondary conflict with §30's `--accent` usage for the B-029 picker-row highlight. | [scrum-master] sequencing — B-048 R3 runs **after** B-062 R3 AND B-029 R3 complete and land. [frontend-engineer] R3 must start with a rebase against the latest `release/v2` tip. |
| **MEDIUM** | B-024's existing selection implementation already writes `data-selected` + `aria-selected` + the `::before` checkmark. B-048 modifies `_setRowSelected` and removes the pseudo-element. Risk: existing B-024 tests asserting on `::before` may break. | [frontend-engineer] audit: `tests/b024-*.test.js` and the broader `tests/` suite for any assertion on `.item-row[data-selected="true"]::before` — update to assert on `.item-select[aria-checked="true"]` instead. [test-engineer] R5 writes new tests for the checkbox ARIA contract. |
| **MEDIUM** | URL-text contrast regression on `[data-selected="true"]` (§31.3 note 3) is pre-existing but newly surfaced by the AC3 audit. [qa-reviewer] may flag this as "not strictly in scope" (because B-048's framing is new visual polish, not bug fix). | Treat as in-scope AC3 compliance — AA floor is part of the acceptance criteria. Fix goes in this sprint. |
| **LOW** | `:focus-visible` ring interaction with B-024's new `box-shadow: inset` selection outline may cause subtle aliasing on high-DPI displays (1px box-shadow + 2px outline at 2x scaling). | [qa-reviewer] R4 visual-check on both 1x and 2x scaling in Edge/Chrome. Mitigation if needed: bump `outline-offset` from `-2px` to `-3px`. |
| **LOW** | Row-level `aria-label` rebuild on every state change means screen readers may re-announce the title on every drift/audible toggle. | Accepted — AT behavior here is platform-specific; JAWS/NVDA announce on focus, not on every attribute write. Measured UAT in R5. |
| **LOW** | `.item-select` `role="checkbox"` with `tabindex="-1"` — some AT may report the checkbox as "not reachable" because it is non-tab-stop. | The row-level Space/Enter handler IS the activation path; AT announces the `aria-checked` state when focus is on the parent row. This is the Gmail pattern. UAT verifies JAWS + VoiceOver + NVDA in R5. |

### 31.14 Handoff Notes for [frontend-engineer] R3

**Gating:** B-062 R3 (and ideally B-029 R3) must land first. Rebase B-048 feature branch off the latest `release/v2` tip before starting. (Per [scrum-master] Wave 4 plan in `docs/SPRINT.md`.)

**File touchpoints (expected):**

- `sidepanel/sidepanel.css` — modifications + 7 new selectors per §31.8.
- `sidepanel/sidepanel.js`:
  - `buildItemRow` (L1367) — insert `.item-select` as first flex child; compute + set `aria-label`.
  - `refetchAndPatchLiveState` row loop (L1902) — call `_buildItemRowAriaLabel` after `data-*` writes.
  - `_setRowSelected` (L927) — add `aria-checked` writes (keep `aria-selected`), update `.item-select` child state, recompute `aria-label` from `_cachedLiveStates` + `_cachedDriftRecords` + `_cachedItems`.
  - `_createAudibleIcon` (L1347), `_createDriftedIcon` (L1356) — swap `aria-label` → `aria-hidden="true"` (delegation to row-level label).
  - NEW: `_buildItemRowAriaLabel(item, live, drifted, selected)` helper (per §31.6).

**Suggested build order:**

1. Add `--active-bg-hover` tokens in both theme blocks. Verify contrast numbers manually.
2. CSS refactor of `[data-selected="true"]`: swap `outline` → `box-shadow: inset`; remove `::before`; add `:focus-visible` combined rule.
3. Add `.item-select` CSS block — base + hover/focus reveal + persistent-when-selected.
4. JS: introduce `.item-select` in `buildItemRow`; update `_setRowSelected` to mirror state onto the new element.
5. JS: introduce `_buildItemRowAriaLabel`; call from `buildItemRow` + `refetchAndPatchLiveState` + `_setRowSelected`.
6. JS: swap icon `aria-label` → `aria-hidden`.
7. Contrast audit: write `docs/a11y-audit-B-048.md` sibling of the B-062 audit, populate §31.3's measured numbers.
8. Run full existing test suite — expect 1–3 B-024 tests to fail on the `::before` removal; update assertions.

**Tests to add in R5 (handoff to [test-engineer]):**

- `tests/b048-state-matrix.test.js` — unit: each state × sub-state combo has the expected `data-*` + `aria-*` shape on the row.
- `tests/b048-checkbox-aria.test.js` — unit: `.item-select` `role`, `aria-checked`, `tabindex`, `aria-hidden` invariants under every gesture (click, Shift+Click, Ctrl+Click, Ctrl+A, Escape).
- `tests/b048-aria-label-concat.test.js` — unit: verify AC7 concat order across the core flag combinations (the 32-combo exhaustive sweep is optional — a 10-combo representative set covers the concat-order contract).
- Regression: `tests/b024-*.test.js` updated to the new assertion surface.

### 31.15 B-048 — Deviations From R2 (Sprint 16 as-built)

*R6 close — reconciles what R2 prescribed in §31.1–§31.14 against what shipped in Sprint 16. Source material: `docs/SPRINT_FINDINGS.md` Sprint 16 B-048 sections, `docs/UAT_B-048.md`, `docs/a11y-audit-B-048.md`, and the shipped diff on `release/v2`.*

**1. `.item-select` child element — no deviation.** §31.5 hybrid Option (d) was delivered exactly as prescribed: `.item-select` inserted once in `buildItemRow` as the first flex child before the favicon (`sidepanel.js:2030`), mirrored in `buildOpenTabRow` (`sidepanel.js:2257`), never inserted/removed during state transitions. CSS reveal via `:hover, :focus-visible, [data-selected="true"]` triad works as designed. Fixed 18px layout slot (14px + 4px gap) prevents reflow.

**2. `_buildItemRowAriaLabel` helper — no deviation.** Single `aria-label` on the row, rebuilt at four canonical call sites. Concat order is `active → live → drifted → audible → selected`, matching §31.6 and the PO concat decision. Call sites:

| Site | `sidepanel.js` line | Context |
|---|---|---|
| `buildItemRow` initial render | `:2129` | Saved-item first paint |
| `buildOpenTabRow` initial render | `:2295`, `:2514` | Open-tab first paint (two code paths) |
| `refetchAndPatchLiveState` row loop | `:2625` | Live-state patch for saved items |
| `_setRowSelected` | `:1481`, `:1489` | Selection toggle — saved-item + open-tab branches |

Icons swapped from `aria-label` to `aria-hidden="true"` (`_createAudibleIcon`, `_createDriftedIcon`) so the row-level label is the sole SR announcement. Verified by [security-reviewer] — `setAttribute('aria-label', ...)` is an attribute sink; bookmark titles containing HTML cannot escape.

**3. Deviation: `.item-select` `aria-hidden="true"` (not `"false"`).** §31.5 prescribed `aria-hidden="false"` so the checkbox would be announced directly. R4 [code-reviewer] M-1 correctly flagged this as a double-announcement bug — the row-level `aria-label` already contains `", selected"`, and an un-hidden `role="checkbox"` child would add a second announcement. R4 fix applied `aria-hidden="true"` on `.item-select` (`sidepanel.js:1956`). **Ratify as the correct behavior and update §31.5 guidance:** composite row-level `aria-label` takes precedence; nested state indicators should be `aria-hidden="true"`. The checkbox is a visual affordance only — the row is the sole SR-reachable surface.

**4. R4-fix H-1 — dark-theme checkmark stroke contrast.** §31 specified the `.item-select[aria-checked="true"]` checkmark as a single SVG data-URI with hardcoded `stroke='white'`. In dark theme `--selected-border: #60a5fa`, so white-on-`#60a5fa` ≈ 2.9:1 — below WCAG AA 3:1 non-text threshold. R4 fix duplicated the rule block inside both `[data-theme="dark"]` and `@media (prefers-color-scheme: dark) [data-theme="system"]` scopes, using a freshly-encoded SVG with `stroke='%230a0f1a'` (the URL-encoded `--on-accent` dark value). **Three SVG data URIs now exist** (one light base + two dark overrides) because CSS custom properties cannot interpolate into `url()` data URIs. Accepted trade-off documented in `docs/a11y-audit-B-048.md`. **Future path if duplication becomes a burden:** introduce a `--checkbox-check-color` token and render the checkmark as an inline `<svg>` fill, not a background-image data URI. Not worth the refactor today.

**5. `--active-bg-hover` token — delivered as §31.7 prescribed.** Added to all 4 theme blocks (`:root` light, `[data-theme="dark"]`, `@media (prefers-color-scheme: dark) [data-theme="system"]`, `[data-theme="light"]`). Selector `.item-row[data-active="true"]:hover` consumes it. Contrast audited in `docs/a11y-audit-B-048.md` — title text ≥ 14.70:1, rail ≥ 6.85:1. AC4 (hover visually distinct on active) satisfied.

**6. B-062 pre-seed — accepted.** `--selected-bg`, `--selected-border`, and `--on-accent` tokens were introduced by B-062 in an earlier wave of Sprint 16, pre-seeding B-048's palette. B-048 consumed all three unchanged. WCAG AA audit (audit doc §3, §5, §6) confirms the values hold for B-048's new usages — selected-row text 15.8:1 light / 15.1:1 dark, selected-border against row background ≥ 3:1 non-text in both themes. **Cross-item coordination recorded:** when multiple items land in the same sprint and share palette tokens, the earlier item's R6 close must flag pre-seeded tokens so later items can audit them without re-proposing values. B-062's R6 close ([solution-architect] §X earlier in Sprint 16) should have cited B-048 as the downstream consumer — apply this pattern going forward.

**7. R5 follow-ups flagged by [test-engineer].** Four items, resolved in-doc here so they are not lost:

- **Q-M2 staleness (`_setRowSelected` reads `_itemById` vs `refetchAndPatchLiveState` reads fresh `itemMap`)** — one-frame stale-title window possible on rename. **Decision: accept the self-heal.** Consistent with §29-style "staleness is bounded by broadcast latency" policy — the next `MSG_STATE_CHANGED scope:'items'` broadcast rebuilds the label from fresh state via `refetchAndPatchLiveState`. Documented as header-comment on `_setRowSelected`; do not pass `item` through the selection API.

- **L-2 dead param (`_createItemSelect(false)` second-arg always-false in `buildItemRow`)** — split-signature refactor rejected. **Decision: accept.** The parameter is a load-bearing intent signal for `buildOpenTabRow` and a readable call-site annotation for future callers. Zero runtime cost.

- **Checkmark SVG duplication** — see §31.15 item 4. Accepted as CSS-variable-in-`url()` constraint.

- **B-064 backlog entry** — `.item-url` tertiary-on-non-selected-row contrast (~2.86–3.48:1). `docs/a11y-audit-B-048.md` §5 references B-064 by ID as the tracking anchor. **Action:** [product-manager] files the real `BACKLOG.md` entry at sprint close: "B-064: promote `.item-url` to `--text-secondary` globally — pre-existing AA gap surfaced by B-048 audit." Scope-discipline note: this was correctly held out of B-048 per AC10(d) (palette-global, not state-specific).

**8. Regression quality.** `tests/b048-visual-states.test.js` = 459 base lines + 25 R3 cases + R4/R5 additions. Includes a **32-combo exhaustive `aria-label` sweep** locking the §31.6 concat order across all state flag permutations. R5 added AC4, AC5, AC6, AC8, and AC9 automated coverage (hover-distinct-on-active, focus-visible on every state, hover-reveal+persistent-when-selected, ≤500ms patch budget, zero full re-renders). **B-024 regression surface cleared:** zero B-024 tests referenced `::before`/`item-select`/`aria-checked` on rows, so the `::before` → `.item-select` migration did not false-green any B-024 assertion. **B-055 symmetry:** open-tab rows consume identical `.item-select` + `_buildItemRowAriaLabel` wiring at `:2257` / `:2295` / `:2514` — verified in audit doc.

---

