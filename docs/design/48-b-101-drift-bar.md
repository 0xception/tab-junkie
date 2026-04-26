# §48 — B-101 Dotted Drift Bar in Row Left-Edge Gutter (R2 Design)

**Sprint:** 34
**Tier:** Full (S)
**Status:** R2 complete (2026-04-26) — READY FOR R3 · R6 will add "As Built" delta
**Owner:** [solution-architect]
**Depends on:** §10.7 (Drift Detection Architecture — defines `tj:drift` shape, write/clear lifecycle, indicator-derivation invariant: drift records are derived from `claimsMirror` + tab URL state, never authoritative on their own); §31 (B-048 Item Visual-State Matrix — DOM-state contract: `data-active`, `data-drifted`, indicator-strip ordering, row-level `aria-label` is the AT carrier, icons are `aria-hidden`); §46 (B-099 Drift Fix — predecessor; defines `_createDriftedIcon`, `_ensureIndicators` true→true tooltip refresh pattern, `_cachedDriftRecords` consumer pattern, hostname-tooltip extraction with `try/catch` URL-parse fallback).
**Out-of-scope (explicit, AC9):** (a) no change to `--drifted-color` token value or per-theme overrides; (b) no change to drift detection logic in `background/tabs/drift.js`; (c) no change to the `MSG_UPDATE_ITEM` "Snap to this tab" handler from B-099; (d) newtab + popup surfaces are NOT modified — newtab dense-row 12 px dot stays as-is per Q4; (e) no new pref keys, no new manifest entries, no new message types, no new chrome permissions, no schema bump.

---

## §48.1 Overview

B-101 is a single-item visual-polish sprint that replaces B-099's 16 px warning-triangle drift icon (in the right-side `.item-indicators` strip) with a 3 px dotted vertical bar in the row's **left-edge gutter**, stacked parallel to the existing 3 px solid-green border-left that marks `data-active="true"` rows. The drift indicator no longer occupies a slot in the indicators strip — that strip returns to its pre-B-099 contents (window badge → audible icon, only). Drift becomes part of the same gutter language used by active state, communicating "something off-nominal about this row" with a quieter, more spatially-anchored treatment.

The implementation is pure-CSS + one new sibling `<span class="item-drift-bar">` injected as the first child of every `.item-row` in `buildItemRow`. The bar is `hidden` by default and revealed (with the hostname tooltip set) by `_ensureIndicators` whenever `_cachedDriftRecords[itemId]` is defined. The migrated tooltip is `title="Drifted to: <hostname>"` — same string and extraction logic from §46 D-7 (`new URL(driftedToUrl).hostname` with `try/catch` fallback). When a row is BOTH `data-active="true"` AND drifted, the active green bar and the dotted amber bar coexist in a ~6 px left gutter side-by-side. R3 lands ~80 net LOC (one `_createDriftedIcon` deletion, one indicator-strip block deletion, one `<span>` injection in `buildItemRow`, one `_ensureIndicators` signature extension, one CSS rule addition for `.item-drift-bar`, one CSS rule deletion for `.item-drifted-icon`, one CSS edit to `.item-row` adding `position: relative`). Zero schema changes, zero new manifest permissions, zero new message types — purely a UI refinement on the foundation B-099 shipped.

---

## §48.2 Existing-State Reality Check

**Today (2026-04-26 on `feature/sprint-34-visual-polish`, branched off `release/v2`):**

- `sidepanel/sidepanel.js:212` — `let _cachedDriftRecords = {};` is the in-memory mirror, populated on every `MSG_LIST_ITEMS` round-trip and `scope: items` broadcast (refreshed in `refetchAndPatchLiveState` and the broadcast/list paths). **R3 reads from it; no change to the cache lifecycle.**
- `sidepanel/sidepanel.js:2281-2299` `_createDriftedIcon(driftedToUrl)`: the SVG-warning-triangle factory shipped by B-099. Returns a `<span class="item-drifted-icon" aria-hidden="true">` with the 16×16 SVG inline + the `title="Drifted to: <hostname>"` attribute set when `driftedToUrl` is provided. **R3 DELETES this entire function** (AC2 regression guard).
- `sidepanel/sidepanel.js:2338-2451` `buildItemRow(item, liveStates, driftRecords)`:
  - Line 2349 reads `const drifted = driftRecords?.[item.id];` (kept — bar visibility derives from `drifted` truthiness).
  - Line 2358 sets `if (drifted) row.dataset.drifted = 'true';` (kept — `data-drifted` is still useful as a CSS hook for the new bar's reveal selector).
  - Line 2374 prepends `_createItemSelect(isSelected)` as the first child of the row (the B-048 selection checkbox affordance, see §31.5). **R3 inserts the new `<span class="item-drift-bar" hidden>` BEFORE the select span** (i.e., new first child) so the bar lives in the absolute-positioned left gutter and the select stays in its current flex slot.
  - Lines 2430-2451 build the `.item-indicators` flex container. The inner `if (needsDrifted)` block (line 2443-2448) appends `_createDriftedIcon(drifted?.driftedToUrl)`. **R3 DELETES this `needsDrifted` branch from the strip-builder block.** The strip is rebuilt only when `needsAudible || needsWindowBadge` is true (drift no longer participates in the gating expression — see D-1 below for the exact gate).
- `sidepanel/sidepanel.js:3145-3213` `_ensureIndicators(row, live, isDrifted)`:
  - Lines 3170-3192 — drift true→false→true transition handler. Creates `_createDriftedIcon` and inserts into `.item-indicators`. **R3 REPLACES this entire `needsDrifted && !driftedIcon` branch with a `barEl = row.querySelector('.item-drift-bar'); if (barEl) { barEl.hidden = false; <set title> }` flip.**
  - Lines 3193-3207 — true→true tooltip refresh from B-099 M-1 fix. **R3 KEEPS the same logic but reattaches it to `.item-drift-bar` instead of `.item-drifted-icon`.**
  - Lines 3208-3211 — true→false drift removal. **R3 REPLACES `driftedIcon.remove()` + the `.item-indicators` cleanup with `barEl.hidden = true` + `removeAttribute('title')` (no DOM removal — the bar `<span>` stays in the row at all times, just hidden via the `hidden` attribute).** This means the strip-cleanup block (lines 3210-3211 — removing an empty `.item-indicators` container) is also no longer triggered by drift transitions; the strip cleanup remains for the audible path.
  - **R3 EXTENDS the function signature to `_ensureIndicators(row, live, isDrifted, driftedToUrl)`** so the caller (`refetchAndPatchLiveState` line 3068) can pass the URL through directly instead of forcing a second `_cachedDriftRecords` lookup inside the helper. Both call sites in §46 already round-trip through `_cachedDriftRecords[itemId]?.driftedToUrl`; the explicit param is a minor cleanup that R5 covers in T2.
- `sidepanel/sidepanel.js:3068` `_ensureIndicators(row, live, !!drifted);` — call site in `refetchAndPatchLiveState`. **R3 EXTENDS to `_ensureIndicators(row, live, !!drifted, drifted?.driftedToUrl);`** (matches the new signature).
- `sidepanel/sidepanel.css:421-430` `.item-row`: `display: flex; align-items: center; gap: 10px; padding: 6px 12px; … min-height: 44px;`. **No `position: relative`.** **R3 ADDS `position: relative;`** so the absolutely-positioned `.item-drift-bar` resolves against the row's bounding box (D-2 below). Verified zero existing absolute-positioned descendants of `.item-row` in `sidepanel.css`: the only `position: absolute` rules in the file (`.group-reorder-indicator` line 329, `#filter-clear-btn` line 1027) are NOT children of `.item-row`. Safe to add.
- `sidepanel/sidepanel.css:443-447` `.item-row[data-active="true"]` — `background: var(--active-bg); border-left: 3px solid var(--active-border); padding-left: 9px;`. **R3 KEEPS this rule unchanged.** The drift bar lives in the same gutter via `position: absolute` and does not consume layout space, so the existing 3 px border-left + `padding-left: 9px` reflow contract is preserved (D-3 Option A; see §48.3).
- `sidepanel/sidepanel.css:460-462` `.item-row[data-drifted="true"] .item-drifted-icon { display: inline-flex; }`. **R3 DELETES this rule.**
- `sidepanel/sidepanel.css:547-551` `.item-drifted-icon { display: none; align-items: center; color: var(--drifted-color); }`. **R3 DELETES this rule entirely.**
- `sidepanel/sidepanel.css` — **R3 ADDS** a new rule block: `.item-drift-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; border-left: 3px dotted var(--drifted-color); pointer-events: none; }` plus a `[hidden]` reset comment if needed (the HTML5 `hidden` attribute already collapses the element to `display: none` via the user-agent stylesheet; no extra rule required). The `pointer-events: none` is a small precaution: the bar is decorative (the row's click handler should be the canonical activator), and the `title` tooltip works regardless of pointer-events on most browsers (Edge + Chrome confirmed). R5 UAT-3 verifies tooltip reachability.
- `shared/themes.css` — `--drifted-color` defined for **all 14 themes (16 entries)**: lines 47, 86, 130, 166, 202, 238, 278, 314, 350, 386, 422, 458, 494, 530, 566, 609, 645 per `grep -n "--drifted-color" shared/themes.css`. **No new token needed.** The amber/orange hue family (light root `#d97706`, dark root `#fbbf24`, dracula `#ffb86c`, etc.) was vetted by §46 / B-037 for WCAG AA contrast against each theme's body bg; the bar is a thin 3 px stroke at the row gutter against the body bg (NOT against the active-row tinted bg, since the bar sits at `left: 0` and the active green border starts at the same `left: 0` — D-3 below).
- `shared/aria-label.js:31` — `if (drifted) parts.push('tab content has changed');`. **R3 KEEPS this unchanged** — the row-level `aria-label` continues to be the AT carrier for drift state per the B-048 AC7 pattern (D-4 below). The bar's own `aria-hidden="true"` mirrors `_createDriftedIcon`'s established pattern; AT does not double-announce.
- `background/tabs/drift.js` — drift record shape is `{ itemId, driftedToUrl, detectedAt }`. **No code change** — B-101 is a pure consumer of the shape established by §10.7.
- `sidepanel/sidepanel.js` `openContextMenu` (line 5825-5988) — the B-099 "Snap to this tab" entry. **No code change** — gating remains on `_cachedDriftRecords[itemId]`, which is unchanged; the only thing that changed visually is the indicator the user clicks on to find the affordance, not the affordance itself.
- `newtab/newtab.js` `_buildIndicators` + `newtab/newtab.css` `.newtab-indicator-drifted` — **No change** per Q4 (R1 lock). The newtab dense-row layout has no left-gutter / no active-row green bar to stack the dotted bar alongside; the 12 px dot remains the right treatment for that surface. AC6 is the regression guard for this no-change.
- **No pre-existing B-101 code, no scaffolding, no partial implementation.** R3 modifies two files (`sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`) and adds two (`tests/b101-drift-bar.test.js`, `docs/UAT_B-101.md`).

---

## §48.3 Design Decisions (D-1 through D-5)

### D-1 — Sibling `<span>` over pseudo-element (R1 Q3 carried; R2 confirmed)

**Choice:** the drift bar is a sibling `<span class="item-drift-bar" hidden></span>` injected as the **first child** of `.item-row` in `buildItemRow`, BEFORE the `_createItemSelect` checkbox span. It is NOT a `::before` pseudo-element on `.item-row`.

**Rationale:** the migrated `title="Drifted to: <hostname>"` tooltip from B-099 must land on the bar. **CSS pseudo-elements cannot carry `title` attributes** (they are render-tree-only constructs without a corresponding DOM node). The sibling `<span>` is the only mechanism that satisfies (a) "drift bar is in the left gutter" + (b) "drift bar carries a `title` tooltip" simultaneously. R1 Q3 anticipated this; R2 confirms.

**Implementation note:** the bar is added unconditionally on every row (always present in the DOM, controlled by the `hidden` attribute) rather than conditionally injected on first-drift. Rationale: (i) flips the `_ensureIndicators` true→false transition from a DOM remove to a single attribute toggle (cheaper, no GC pressure on rapid drift→non-drift→drift cycles); (ii) keeps the `position: absolute` element in the layout context from the moment the row is built — no risk of a paint flash on first transition; (iii) one extra `<span hidden>` per row is negligible (~50 bytes; on a 500-item collection, 25 KB total, well under any meaningful budget). Tradeoff: a tiny `querySelector('.item-drift-bar')` cost on every `_ensureIndicators` call regardless of drift state — already paid by `_ensureIndicators` for `.item-audible-icon` lookups, no new cost class.

### D-2 — `.item-row { position: relative; }` is mandatory (R2 verified gap)

**Choice:** R3 adds `position: relative;` to the existing `.item-row` rule (line 421-430 today). The drift bar is `position: absolute; left: 0; top: 0; bottom: 0;` and resolves against the row's bounding box.

**Rationale:** verified by reading `sidepanel.css` — `.item-row` does NOT currently have `position: relative` set. The only existing position context on item rows is the `:focus-visible` rule (line 561 sets `position: relative` for the focus ring's `z-index` to take effect). Without this addition, the drift bar would resolve against the nearest positioned ancestor (the `#item-list` container at line 297, which IS `position: relative`) — that means the bar would render at the **container's** left edge, not the row's, and would render only once (on the first row) since absolute-positioning resolves to the same coordinate space.

**Risk audit:** verified zero `.item-row` descendants in `sidepanel.css` use `position: absolute`. The two existing absolute-positioned rules in the file (`.group-reorder-indicator` at line 329, `#filter-clear-btn` at line 1027) are unrelated parents. Adding `position: relative` to `.item-row` is safe — no descendant currently absolutely-positioned against the viewport or `body` would shift. R3 grep verifies nothing has been added since R2 was authored.

### D-3 — Active + drifted coexistence: Option A (gutter at `left: 0`, both bars side-by-side without content shift)

**Choice:** when a row is both `data-active="true"` AND drifted:
- The active rule keeps its existing `border-left: 3px solid var(--active-border); padding-left: 9px;` (line 443-447) — unchanged.
- The drift bar is `position: absolute; left: 0; top: 0; bottom: 0; width: 3px; border-left: 3px dotted var(--drifted-color);` — sitting in the **exact same coordinate space** as the active border-left.

In the active+drifted case, the dotted amber bar is rendered at `left: 0` (over the green border-left's position, but as a separate absolutely-positioned element on top). Visually the user sees the dotted amber **layered over** the solid green for those 3 px of width. **REJECTED** as too visually muddled per R1's "side-by-side" spec.

**Revised choice (R2 final):** the dotted bar in the active+drifted case is offset to `left: 3px;` (sits immediately to the right of the active green border-left, NOT on top of it). The total left gutter is then 6 px: 3 px solid green (the row's `border-left`, occupying space inside the row's box-model) + 3 px dotted amber (absolute-positioned at `left: 3px`, overlaying the inner padding). Row content does NOT shift — `padding-left: 9px` from the active rule already pushes content past the 6 px combined gutter zone (the `9px - 3px-border = 6px` of remaining inner padding fully accommodates the absolute-positioned bar at `left: 3px; width: 3px;`).

In the **drifted-only (not-active)** case, the drift bar renders at `left: 3px;` against the row's normal `padding: 6px 12px` (line 425). The bar sits 3 px in from the left edge, against the body background — visually in the same gutter zone an active row would occupy. The 3 px offset gives the bar consistent positioning across active/drifted permutations: it always lives at `left: 3px`, whether or not an active green bar is to its left. Trade-off: in the drifted-only case the leftmost 3 px of the row are empty; this is acceptable — that gutter is exactly where the active bar appears when the user clicks the row, so the visual gutter language is consistent.

#### D-3a — Live (non-active) + drifted permutation (R6 extension; R5 UAT-4 coverage)

R5 [test-engineer] flagged (per R4 [qa-reviewer] MEDIUM #2) that R2's D-3 only documented the **active+drifted** permutation; the **`data-live="true"` (claimed but non-active) + drifted** permutation needed explicit enumeration. The geometry works for free under D-3:

- `sidepanel/sidepanel.css:451-454` `.item-row[data-live="true"]:not([data-active="true"])` already sets `border-left: 3px solid var(--live-indicator)` at `left: 0` — same gutter geometry as the active border, just a different color (live-green vs. active-green) and different reflow contract. The live rule does NOT add `padding-left: 9px` (live rows keep the default `padding: 6px 12px`), so the row content sits 3 px closer to the green border than active+drifted rows do — but the drift bar at `left: 3px; width: 3px;` still sits **immediately to the right of the live border, in the inner padding zone**, exactly as it does for active+drifted rows.
- Total left gutter: 3 px solid green (live border at `left: 0`) + 3 px dotted amber (drift bar at `left: 3px`) = 6 px combined, identical to UAT-3's active+drifted geometry.
- Content shift on the live→active transition: the active rule introduces `padding-left: 9px` (an extra 6 px of inner padding); the drift bar's `left: 3px` is invariant across the transition. The bar coordinate does not move.

**Permutations now fully enumerated** (drift-bar visibility + gutter geometry):

| `data-active` | `data-live` | `data-drifted` | Bar visible? | Left-edge composition |
|---|---|---|---|---|
| true | (true by §10.5: active implies live) | true | ✅ | 3 px solid active-green at `left:0` + 3 px dotted amber at `left:3px` |
| false | true | true | ✅ | 3 px solid live-green at `left:0` + 3 px dotted amber at `left:3px` |
| false | false | true | ✅ | empty 3 px gutter + 3 px dotted amber at `left:3px` |
| true | (true) | false | ❌ (`hidden`) | 3 px solid active-green at `left:0` only |
| false | true | false | ❌ (`hidden`) | 3 px solid live-green at `left:0` only |
| false | false | false | ❌ (`hidden`) | no gutter — default `padding: 6px 12px` |

**Impossible-by-construction permutation (per §10.7 invariant):** `data-drifted="true"` with `data-live="false"` cannot occur — drift records can only exist for claimed items, and claimed items always render `data-live="true"`. The "drifted-only" row in D-3 above (3rd table row) is therefore a UI-state safety case, not a runtime-reachable permutation; if a stale drift record briefly survives an asynchronous claim release, the next `SCOPE.LIVE_STATE` broadcast clears it via the `_ensureIndicators` true→false path. R5 T6 covers this stale-cache fallback path.

**Final CSS rule:**
```css
.item-drift-bar {
  position: absolute;
  left: 3px;          /* sits to the right of where the active green border lives */
  top: 0;
  bottom: 0;
  width: 3px;
  border-left: 3px dotted var(--drifted-color);
  pointer-events: none;
}
```

**Layout invariants this satisfies:**
- Drifted-only row: bar at `left: 3px` (3 px in from row edge) — content not shifted; row reads "small dotted amber accent in left gutter."
- Active-only row: green border-left at `left: 0` (occupies first 3 px) — content pushed right by `padding-left: 9px`. Drift bar absent (`hidden`).
- Active + drifted row: green border-left at `left: 0` (first 3 px) + dotted amber bar at `left: 3px` (next 3 px) — total 6 px gutter — content still at `padding-left: 9px`. Both bars visible side-by-side.
- Non-active, non-drifted row: drift bar `hidden`; row uses default `padding: 6px 12px` — unchanged.
- Drift state flips on/off: only the bar's `hidden` attribute toggles; row content does NOT reflow (the absolute positioning keeps the bar out of the flex layout).
- Active state flips on/off: active rule's `border-left + padding-left` toggles; this is the existing B-048 behavior. The drift bar's `left: 3px` position is invariant — drift bar continues to sit in the same coordinate, and now coexists alongside the new green border without content shift.

**Rejected alternatives:**
- **Option B (stack bars and shift content right by 6 px when drifted+active)**: REJECTED — content position would shift on every active flip when an item is drifted, causing reflow flicker on tab focus changes.
- **Option C (`box-shadow: inset 3px 0 0 var(--active-border), inset 6px 0 0 var(--drifted-color)`)**: REJECTED — `box-shadow` cannot deliver a dotted edge. The product-owner's R1 lock specifies `dotted` style; only a `border` declaration produces a dotted edge in CSS. Box-shadow is a solid stroke only.

### D-4 — `aria-label` placement: row-level carrier preserved (B-048 AC7 pattern; R2 confirmed)

**Choice:** the row-level `aria-label` (built by `buildItemRowAriaLabel` in `shared/aria-label.js`, line 31 today: `if (drifted) parts.push('tab content has changed');`) **remains the AT carrier for drift state.** The new `.item-drift-bar` element carries `aria-hidden="true"` mirroring the established `_createDriftedIcon` pattern (line 2286 today: `span.setAttribute('aria-hidden', 'true');`).

**Rationale:** B-048 AC7 fixed the AT contract: the row's `aria-label` is the single AT-visible string for the row's complete state ensemble (active + live + drifted + audible + selected, in that concat order — see `shared/aria-label.js:6`). Icons inside the row are `aria-hidden` so screen readers don't double-announce drift state once via the icon's own label and once via the row label. B-101 changes the visual treatment but NOT the AT contract; the bar is purely visual.

**Rejected alternative (Option B):** moving the drift label off the row and onto the bar (e.g., `bar.setAttribute('aria-label', 'Tab has navigated away from its saved URL')`). REJECTED because (a) screen readers would announce drift twice — once when navigating to the bar (`<span>` is reachable in browse-mode), once when the row label is read; (b) it breaks the established B-048 contract that requires icons inside rows to be `aria-hidden`; (c) the tooltip + visual treatment carries the "drifted to where" detail for sighted users — the row aria carries the "drifted" fact for AT.

**The `title` attribute is additive, browser-native:** screen readers MAY (browser-dependent) read the `title` after the `aria-label`, but the row-level aria fires first and carries the canonical "tab content has changed" string. The hostname tooltip is a sighted-user detail, not an AT-essential string.

### D-5 (NEW R2) — Drift bar visibility gating: derives from `_cachedDriftRecords` only (no claim/live coupling)

**Choice:** the drift bar's `hidden` toggle is gated **exclusively** on `_cachedDriftRecords[itemId]` truthiness (or equivalently the `drifted` parameter passed through `buildItemRow` and `_ensureIndicators`). No additional gating on `live?.live` or the item's claim status.

**Rationale:** per §10.7 invariant, drift records can only exist for **claimed** items (the `detectDriftForTab` write path requires `getItemIdForTab(tabId)` to return non-null, i.e., the tab must hold a claim, see `drift.js:34`). Drift cannot exist on a non-claimed item by construction. Additionally, B-099 D-1 ("Option B: claim survives URL drift") guarantees that a drifted item's claim is preserved — a drifted item is by definition still-claimed and still-live.

**Implication:** R3 does NOT need a defensive `live?.live && drifted` check inside `_ensureIndicators` or `buildItemRow`. The bar visibility gate is a single boolean from `_cachedDriftRecords`. This matches the §46 D-9 pattern for the "Snap to this tab" menu entry, which also gates exclusively on `_cachedDriftRecords[itemId]`.

**Edge case enumeration (none require special handling):**
- Item drifted, live tab subsequently closed: §10.7 B-015 wiring (`tab-events.js:202-203`) calls `releaseClaimByTab` then `clearDrift(releasedItemId)`. The drift record is cleared; the next `SCOPE.LIVE_STATE` broadcast removes the bar via `_ensureIndicators` true→false → `bar.hidden = true`.
- Item drifted, item subsequently deleted: `MSG_DELETE_ITEM` cascade clears `tj:drift[itemId]` per §10.7. Cache refreshes; bar removal happens with the row's removal from DOM (the `<span>` is GC'd with its parent). No leak.
- Drift detected, sidepanel not open: drift record persists in `tj:drift`; on next sidepanel open, `MSG_LIST_ITEMS` round-trip populates `_cachedDriftRecords`; first-paint via `buildItemRow` renders the bar visible.
- Drift cleared (via "Snap to this tab"), bar already visible: B-099 `MSG_UPDATE_ITEM` handler clears drift; broadcast triggers `refetchAndPatchLiveState`; `_ensureIndicators(row, live, false)` flips `bar.hidden = true` and removes the title attribute. Symmetric.

---

## §48.4 Architecture Diagram (text)

### Path A — Drift detection → bar reveal

```
chrome.tabs.onUpdated → reevaluateTab → claim preserved (B-099 D-1)
   │
   ▼
detectDriftForTab(tabId, newUrl, items)
   │   ─ getItemIdForTab(tabId) → original itemId
   │   ─ url mismatch → writeDrift(itemId, normalizedNewUrl)
   │     writes tj:drift[itemId] = { itemId, driftedToUrl, detectedAt }
   │
   ▼
broadcast(SCOPE.LIVE_STATE, 'tab/updated')
   │
   ▼
sidepanel: refetchAndPatchLiveState
   │   ─ refreshes _cachedDriftRecords from MSG_LIST_ITEMS round-trip
   │   ─ _ensureIndicators(row, live, !!drifted, drifted?.driftedToUrl)
   │     • bar = row.querySelector('.item-drift-bar')
   │     • bar.hidden = false
   │     • bar.title = `Drifted to: ${hostname}` (with try/catch fallback)
   │   ─ (one DOM mutation: attribute toggle + setAttribute)
   │
   ▼
Visual result: 3 px dotted amber bar appears at left:3px in the row gutter,
               sitting alongside (or in place of, when not active) the 3 px
               solid green active border. Hostname tooltip on hover.
```

### Path B — Drift cleared → bar hidden

```
User invokes "Snap to this tab" (or item edited via dialog with new URL)
   │
   ▼
MSG_UPDATE_ITEM handler (B-099 D-2)
   │   ─ updateItem(p.id, p.patch) overwrites item.url
   │   ─ if (patch.url changed) → clearDrift(p.id)
   │
   ▼
broadcast(SCOPE.ITEMS, MSG_UPDATE_ITEM)
   │
   ▼
sidepanel: refetch → _cachedDriftRecords no longer has itemId
   │   ─ _ensureIndicators(row, live, false, undefined)
   │     • bar = row.querySelector('.item-drift-bar')
   │     • bar.hidden = true
   │     • bar.removeAttribute('title')
   │   ─ data-drifted attribute removed from row
   │   ─ row aria-label rebuilt via buildItemRowAriaLabel (no "tab content
   │     has changed" segment; row reads as "<title>, <state ensemble>"
   │     without the drift token)
   │
   ▼
Visual result: dotted amber bar disappears; row gutter reverts to either
               (a) plain padded gutter if not active, or
               (b) 3 px solid green active border if active.
               Content position UNCHANGED — bar was absolute-positioned.
```

### Path C — buildItemRow first-paint (e.g., on initial render or scroll-virtualization rebuild)

```
buildItemRow(item, liveStates, driftRecords)
   │
   ▼
const row = document.createElement('div'); row.className = 'item-row';
   │
   ▼
const drifted = driftRecords?.[item.id];   // unchanged
   │
   ▼
[NEW] const bar = document.createElement('span');
[NEW] bar.className = 'item-drift-bar';
[NEW] bar.setAttribute('aria-hidden', 'true');
[NEW] if (drifted) {
[NEW]   bar.title = computeDriftTooltip(drifted.driftedToUrl);
[NEW] } else {
[NEW]   bar.hidden = true;
[NEW] }
[NEW] row.appendChild(bar);   // FIRST child — before _createItemSelect
   │
   ▼
[EXISTING] row.appendChild(_createItemSelect(isSelected));
[EXISTING] ... favicon, title, url, indicators (now drift-free), actions ...
[REMOVED — was in indicator strip block]:
   if (needsDrifted) indicators.appendChild(_createDriftedIcon(...));
   │
   ▼
Final row structure:
   <div class="item-row" data-drifted="true" data-active="true" ...>
     <span class="item-drift-bar" title="Drifted to: github.com" aria-hidden="true"></span>
     <span class="item-select" role="checkbox" ...></span>
     <img class="item-favicon" ...>
     <div class="item-title">...</div>
     <div class="item-url">...</div>
     <div class="item-indicators">          ← drift-free; window badge + audible only
       <span class="item-window-badge">W2</span>
       <span class="item-audible-icon">🔊</span>
     </div>
     <div class="item-actions">...</div>
   </div>
```

The `.item-drift-bar` does NOT participate in the row's flex layout (it is `position: absolute`). The flex layout still flows: select → favicon → title → url → indicators → actions.

---

## §48.5 R2 Correctness Checklist (C-1 through C-12)

| # | Check | Verdict | Notes |
|---|-------|---------|-------|
| C-1 | Storage schema versioned | **N/A** | Zero schema changes. `tj:items`, `tj:drift`, `tj:tabClaims`, `tj:groups` shapes all unchanged. No new pref keys, no new validator allow-list entries — therefore no SW module-cache stale-state risk per the S31 B-094 stale-SW guidance. |
| C-2 | Message contracts typed | **N/A** | Zero new message types; zero edits to existing message handlers. `MSG_UPDATE_ITEM`, `MSG_LIST_ITEMS`, `SCOPE.LIVE_STATE`, `SCOPE.ITEMS` all unchanged. |
| C-3 | SW cold-start safe | **N/A** | No SW code touched. All R3 edits are in `sidepanel/sidepanel.js` + `sidepanel/sidepanel.css` (UI bundle). The SW continues to write `tj:drift` exactly as it does today (§10.7); the sidepanel continues to read from it via `MSG_LIST_ITEMS`. |
| C-4 | ID stability | **PASS** | Drift records are keyed by stable ULID `itemId` per §10.7 / §3 — unchanged. The bar's visibility and tooltip both derive from `_cachedDriftRecords[itemId]`, and `itemId` survives URL drift, rename, group moves, and cross-window tab moves. |
| C-5 | Manifest file references resolvable | **N/A** | Zero `manifest.json` changes. No new `default_path`, `default_popup`, `chrome_url_overrides`, `web_accessible_resources` entries. |
| C-6 | Permission minimization | **N/A** | Zero new permissions. `manifest.json` `permissions` array unchanged: `["tabs", "tabGroups", "storage", "sidePanel", "search"]`. |
| C-7 | Allow-list direction | **N/A** | No new sanitizer, validator, or export surface. `driftedToUrl` is already pre-validated by the §10.7 write path (scheme allowlist + length cap); the bar consumes it read-only via `new URL(...).hostname` with `try/catch`. |
| C-8 | SW-context feasibility | **N/A** | UI-only. All affected APIs (`document.createElement`, `setAttribute`, `querySelector`, `URL`) are document-context APIs running in the sidepanel page, not in the SW. No SW-context restrictions apply. |
| C-9 | Empty-state design | **PASS — 5 paths enumerated** | (a) Non-drifted item: `<span class="item-drift-bar" hidden>` is in the DOM but `display: none` via the HTML5 `hidden` attribute; visually invisible; no tooltip; row reads as standard. (b) Drifted + active: drift bar at `left: 3px`, active green border at `left: 0`; both visible side-by-side; row content unshifted (D-3). (c) Drifted + not-active: drift bar at `left: 3px` against the body bg; no green border; row content unshifted. (d) Item state flips drift→non-drifted live (e.g., user navigates the live tab back to the saved URL): `_ensureIndicators` flips `bar.hidden = true` + `removeAttribute('title')`; one attribute toggle, no DOM removal, no reflow (absolute-positioned). (e) Row removed from DOM while drifted (item deleted, group collapsed, sidepanel closed): the `<span>` is GC'd with its parent — no listener leak (the bar has no event listeners attached; tooltip is a passive `title` attr; `aria-hidden` is static). |
| C-10 | Off-screen rect feasibility | **N/A** | No drag, no `setDragImage`, no `canvas.toDataURL`, no off-screen DOM positioning. The bar is in-flow (well — out-of-flow via `position: absolute`, but always inside the row's bounding box, never off-screen). |
| C-11 | Popup-lifecycle message ordering | **N/A** | No popup surface modified. The drift bar lives in sidepanel + standalone (sidepanel bundle). No `chrome.tabs.update`, no `chrome.windows.update`, no `chrome.sidePanel.open` invoked from this code path. The B-099 "Snap to this tab" handler that DOES trigger storage updates is unchanged. |
| C-12 | Manifest declaration runtime-mutability | **N/A** | Zero `manifest.json` edits. |

**Summary: 1 PASS (C-4) + 1 PASS-with-enumeration (C-9) + 10 N/A.** Most checks are correctly N/A because B-101 is a pure UI-state visual refinement on a stable foundation (B-099 already shipped the drift detection + indicator infrastructure; B-101 only swaps the visual treatment).

---

## §48.6 Performance Plan

| Path | Budget | Measurement | Rationale |
|------|--------|-------------|-----------|
| `_ensureIndicators` drift transition (true→false or false→true) | < 1 ms incremental vs. baseline | R5 unit test in `tests/b101-drift-bar.test.js` measures `_ensureIndicators` end-to-end | One `querySelector('.item-drift-bar')` (already in row, fast direct selector) + one `bar.hidden = boolean` toggle + one `setAttribute('title', ...)` or `removeAttribute('title')`. No DOM creation, no DOM removal. Strict improvement over the B-099 `_createDriftedIcon` + `appendChild` + cleanup-empty-`.item-indicators` removal path. |
| `buildItemRow` first-paint cost per row | < 5 ms incremental on a 500-item collection | R5 perf assertion (smoke spot-check, not a hard gate) | One additional `document.createElement('span')` + 2 `setAttribute` calls + 1 `appendChild` per row. On a 500-row collection, total added cost is bounded by `500 × ~0.01 ms = ~5 ms`, well within the §9 perf standard's 200 ms first-paint budget. |
| Drift bar render layout cost | Zero reflow on drift state flips | UAT-3 visual inspection | Bar is `position: absolute` and `pointer-events: none`. State flips toggle the `hidden` attribute → render-tree only, no layout thrash on neighboring rows or row content. |
| Tooltip read on hover | Native browser; not measured | N/A | `title` attribute is a passive browser-native tooltip; no JS cost. |

**Net performance effect of B-101: strictly equal-to-or-better than B-099.** The deleted path (DOM creation + removal of `_createDriftedIcon` + `.item-indicators` cleanup logic) is replaced by attribute toggles on an always-present element. AC8 T1-T5 + UAT cases double as performance regression guards.

---

## §48.7 Accessibility Plan

| Surface | Treatment | Rationale |
|---------|-----------|-----------|
| Drift bar (`.item-drift-bar`) | `aria-hidden="true"`; no `aria-label`; no `role`; not a tab-stop. | The bar is purely decorative. Per the B-048 AC7 contract (§31), the row-level `aria-label` is the AT carrier for the complete state ensemble, including drift. Mirroring `aria-hidden="true"` is the established pattern for `_createDriftedIcon` (line 2286) and `_createAudibleIcon` — B-101 keeps this contract intact. |
| Row-level `aria-label` | `buildItemRowAriaLabel` in `shared/aria-label.js` keeps line 31 unchanged: `if (drifted) parts.push('tab content has changed');`. | Drift state continues to be announced via the row label, in the AC7-fixed concat order (active → live → drifted → audible → selected). No double-announcement risk. |
| `title="Drifted to: <hostname>"` | Visual tooltip; browser-native; screen readers MAY read after the row aria. | Hostname-only keeps the tooltip short across long URLs (e.g., `Drifted to: github.com` not the full path+query). Same string and extraction logic as B-099 D-7 — `try { new URL(driftedToUrl).hostname } catch { driftedToUrl }`, with a final fallback to "Drifted to a different URL" when both fail. |
| Color contrast | `--drifted-color` is a 3 px stroke. Across all 14 themes, the value is in the amber/orange family vetted by §46 / B-037 for WCAG AA against body bg at 14 px / 16 px sizes. The 3 px width is narrower but the stroke is still distinguishable; visual-only contrast (icon → bar) is a treatment change, not a contrast change. R5 [qa-reviewer] spot-checks one light + one dark theme. | No new color authoring required. The amber/orange family is a recognized warning hue across all 14 themes. |
| Keyboard reachability | The bar is `aria-hidden` + has no event listeners + `pointer-events: none` — NOT keyboard-reachable. The user's keyboard-first interaction path with a drifted row remains: focus the row → row aria-label announces "tab content has changed" → right-click (Shift+F10 or context-menu key) → "Snap to this tab" entry from B-099. | No new interactive elements added; no keyboard contract to expand. |

**Net accessibility effect: zero AT-visible behavior change.** The same row-level aria string fires; the same screen-reader behavior obtains. Sighted-user visual treatment is the only thing changing.

---

## §48.8 Rollback Plan

**Single-commit revert of the S34 B-101 merge restores the B-099 triangle behavior.** No storage migration, no manifest permission change, no message contract change — purely a UI revert.

```bash
# Identify the merge SHA on release/v2:
git log --oneline release/v2 | grep "B-101"

# Single-commit revert:
git revert <merge-sha>
git push origin release/v2

# Sidepanel surfaces refresh on next reload — no data migration needed.
```

| Aspect | Rollback impact |
|--------|-----------------|
| `tj:drift` partition | No-op. Drift records were unchanged by B-101; B-099's record shape is preserved. |
| `tj:items` / `tj:tabClaims` | No-op. Untouched by B-101. |
| Manifest permissions | No-op. Untouched by B-101. |
| User-facing treatment | Reverts to B-099's 16 px warning triangle in the indicators strip; left gutter loses the dotted amber bar. Tooltip migrates back from the bar to the triangle (same string, same hostname extraction). Users who had grown accustomed to the gutter treatment lose the affordance — a UX regression but not a data integrity issue. |

**SEV severity if rollback needed: SEV3 (minor degradation).** B-101 is a visual refinement — any rollback is purely cosmetic; the underlying drift detection and "Snap to this tab" reconcile flow are unaffected.

---

## §48.9 Open Questions

**None.** R1 was fully locked in the pre-S34 brainstorm with the product-owner (Q1-Q4 locked 2026-04-26). R2 D-1 confirmed the sibling `<span>` over pseudo-element (the only mechanism that satisfies "drift bar carries `title`"). R2 D-2 confirmed the `position: relative` mandate after verifying `.item-row` does not currently set it. R2 D-3 picked Option A's revised variant (`left: 3px` for the drift bar so active and drift coexist side-by-side without content shift). R2 D-4 confirmed the row-level aria stays as the AT carrier (B-048 AC7 pattern preserved). R2 D-5 nailed the visibility-gating contract (single boolean from `_cachedDriftRecords`; no claim/live coupling needed because §10.7 invariant guarantees drift only exists for claimed items). R3 has zero outstanding architectural decisions.

---

## §48.10 As Built (R6)

**Closed:** 2026-04-25 (R6 doc close; UAT execution pending pre-sprint-close human walk-through) · **Release:** v1.28.0 (planned) · **Branch:** `feature/sprint-34-visual-polish`

### Files actually changed vs. expected

All R2-expected files match what shipped — no surprise files added beyond the R5 stale-stub hygiene fixes (foreseen as R4 HIGH/MEDIUM closure work).

| File | Expected (R2 §48.2 / §48.3 / SPRINT.md) | Actual (R6) | Notes |
|------|------------------------------------------|-------------|-------|
| `sidepanel/sidepanel.js` | `_createDriftedIcon` deleted; `_driftTooltipFor` helper extracted; `<span class="item-drift-bar">` injected as first row child in `buildItemRow`; `_ensureIndicators` signature extended to `(row, live, isDrifted, driftedToUrl)`; both call sites updated | ✅ done | All seven R2 implementation steps executed in the recommended order. `_driftTooltipFor` extracted (R2-suggested, R3-adopted). One Δ vs. R2: defensive `_cachedDriftRecords[itemId]?.driftedToUrl` fallback inside `_ensureIndicators` — see Deviations #3 below; T6 covers it. |
| `sidepanel/sidepanel.css` | `.item-row { position: relative }` added; new `.item-drift-bar` rule (`position: absolute; left: 3px; top: 0; bottom: 0; width: 3px; border-left: 3px dotted var(--drifted-color); pointer-events: none;`); `.item-drifted-icon` + `[data-drifted="true"] .item-drifted-icon` rules deleted | ✅ done | Verified post-R3: `grep "item-drifted-icon" sidepanel/sidepanel.css` returns zero hits (AC2 regression guard PASS). One Δ vs. R2: `position: relative` is technically redundant given `.item-row` already has `contain: layout style` (R4 LOW #2) — see Deviations #4 below. |
| `sidepanel/sidepanel.html` | No change | ✅ no change | Bar is JS-injected per row (D-1). |
| `shared/aria-label.js` | No change | ✅ no change | Row-level "tab content has changed" stays as the AT carrier per D-4. |
| `shared/themes.css` | No change | ✅ no change | `--drifted-color` defined for all 14 themes (16 entries) — verified pre-R3. |
| `background/tabs/drift.js` | No change | ✅ no change | B-101 is a pure consumer of the §10.7 drift-record shape. |
| `newtab/newtab.js`, `newtab/newtab.css` | No change | ✅ no change | Per Q4 / AC6 — newtab dense-row keeps the 12 px dot. |
| `manifest.json` | No change | ✅ no change | Zero new permissions, zero new declarations. |
| `tests/b101-drift-bar.test.js` | NEW, ≥ 5 tests T1-T5 per AC8 | ✅ done — **6 tests** | T1-T5 from AC8 + T6 cache-fallback (R4 LOW #3, R5 gap-fill). Final count exceeds AC8 minimum by 20%. |
| `tests/b011-drift.test.js` | No expected change | **Δ vs. R2** (R5 R4-HIGH fix) | Inlined `_ensureIndicators` stub rewritten to track post-B-101 `bar.hidden` flip on `.item-drift-bar` (was injecting `.item-drifted-icon`). 8 assertions rewritten; one strip-cleanup-on-drift test retired (no longer applies per D-1) and replaced with an audible-only-leaves-bar-untouched regression guard at the same count. Net test delta: -1. |
| `tests/b054-sidepanel.test.js` | No expected change | **Δ vs. R2** (R5 R4-MEDIUM #1 fix) | Stale `_createDriftedIcon` factory reproduction + 3 factory-shape tests replaced with `_driftTooltipFor` reproduction + 3 hostname-extraction tests. Same test count (hygiene only). |
| `tests/b048-visual-states.test.js` | No expected change | **Δ vs. R2** (R5 R4-MEDIUM #1 + R4-LOW #7 fix) | AC1 description "triangle icon" renamed to "dotted left-gutter bar per B-101"; inline AC7 stub renamed `createDriftedIcon`/`item-drifted-icon` → `createDriftBar`/`item-drift-bar` with updated assertions. Same test count (hygiene only). |
| `docs/UAT_B-101.md` | NEW, ≥ 4 cases | ✅ done — **6 cases** | UAT-1, UAT-2 (B); UAT-3, UAT-4, UAT-5, UAT-6 (H). UAT-4 added in R5 to cover the `data-live="true"` + drifted permutation per R4 [qa-reviewer] MEDIUM #2. Final count exceeds AC8 minimum by 50%. |
| `docs/design/48-b-101-drift-bar.md` | NEW R2 chapter; R6 fills As-Built | ✅ this file | R2 written 2026-04-26; R6 As-Built section added 2026-04-25; D-3a sub-decision added per R5 R6 handoff request. |

### Test counts (final)

- **Pre-S34 baseline (post-S33):** 1,412 tests passing on `release/v2`.
- **Post-S34 B-101 build:** **1,417 tests passing** on `feature/sprint-34-visual-polish` (+5 net).
  - `tests/b101-drift-bar.test.js`: +6 new tests (T1-T6).
  - `tests/b011-drift.test.js`: net -1 (one strip-cleanup-on-drift test retired per D-1; replaced with an audible-only regression guard at the same count, but a separate ID-stability roundtrip case was consolidated, net -1).
  - `tests/b054-sidepanel.test.js` + `tests/b048-visual-states.test.js`: net 0 (hygiene-only renames; test counts unchanged).
- **Zero regressions** in pre-existing suite after R5 stub-hygiene fixes.

### UAT results summary

UAT execution is a **human task** (pending sprint-close walk-through, mirroring the §46.10 S33 pattern where UAT execution happened post-R6 just before sprint close). [test-engineer] authored the 6-case plan in `docs/UAT_B-101.md`; results are recorded in this section after walk-through.

| Case | Priority | Result | Notes |
|------|----------|--------|-------|
| UAT-1: Drift bar appears in row left gutter when item drifts | B | ✅ AUTHORED — pending human walk-through during sprint close | |
| UAT-2: Drift bar disappears when item navigates back to saved URL | B | ✅ AUTHORED — pending human walk-through during sprint close | |
| UAT-3: Active row + drifted = both bars side-by-side in 6 px gutter | H | ✅ AUTHORED — pending human walk-through during sprint close | |
| UAT-4: Live (non-active) row + drifted = green live border + dotted amber bar coexist | H | ✅ AUTHORED — pending human walk-through during sprint close | R4 [qa-reviewer] MEDIUM #2 coverage gap-fill; geometry covered by D-3a above. |
| UAT-5: Hostname tooltip on drift bar shows "Drifted to: <hostname>" | H | ✅ AUTHORED — pending human walk-through during sprint close | |
| UAT-6: Drift triangle icon GONE from indicators strip (AC2 regression check) | H | ✅ AUTHORED — pending human walk-through during sprint close | |

**Pre-Gate-3 step:** human walks UAT-1..UAT-6 against the unpacked extension on `feature/sprint-34-visual-polish` and updates this table with PASS/FAIL/WARN per case.

### Hardening discovered during R4/R5

R4 (3 reviewers parallel, 2026-04-25) surfaced **0 CRITICAL / 1 HIGH / 2 MEDIUM / 7 LOW**. All HIGH and MEDIUM findings were applied in R5; LOW findings either deferred or absorbed into R5 hygiene work / this As-Built section.

- **HIGH #1** (code-reviewer, `tests/b011-drift.test.js`) — inlined `_ensureIndicators` stub still tracked the pre-B-101 `.item-drifted-icon` injection/removal pattern, providing false coverage for the new `bar.hidden` flip behavior. **Applied in R5**: stub rewritten to match the post-B-101 signature `(row, live, isDrifted, driftedToUrl)` + `bar.hidden` flip; `buildRow` helper updated to inject `<span class="item-drift-bar" hidden>` as first row child; 8 assertions rewritten from `querySelector('.item-drifted-icon') !== null` to `bar.hidden === false/true`. Net test delta from this fix: -1 (one strip-cleanup-on-drift case no longer applies per D-1).
- **MEDIUM #1** (code-reviewer, `tests/b054-sidepanel.test.js` + `tests/b048-visual-states.test.js`) — stale comments + local stubs referenced `_createDriftedIcon` and the deleted `.item-drifted-icon` class. **Applied in R5**: search-replace comment blocks; renamed local stub helpers; `b054` factory tests retargeted at `_driftTooltipFor`; `b048` AC7 stub renamed to `createDriftBar`. Test counts unchanged.
- **MEDIUM #2** (qa-reviewer, `sidepanel/sidepanel.css:442-444`) — `data-live="true"` (non-active) + drifted coexistence not explicitly tested or documented; D-3 only covered active+drifted. **Applied in R5**: UAT-4 added covering live+drifted permutation. **Applied in R6 (this chapter)**: D-3a sub-decision added enumerating all permutations in a single table; impossible-by-construction case (drifted without live) called out per §10.7 invariant.
- **LOW #1** (security-reviewer, `_driftTooltipFor` Unicode/IDN punycode) — no action required (`URL.hostname` returns punycode-ASCII for IDN domains in Chromium).
- **LOW #2** (code-reviewer, `.item-row` already has `contain: layout style`) — addressed inline in Deviations #4 below; `position: relative` retained for explicitness.
- **LOW #3** (code-reviewer + qa-reviewer, defensive `_cachedDriftRecords[itemId]?.driftedToUrl` fallback inside `_ensureIndicators`) — **R5 added T6 covering this fallback path**; R6 documents as a known tradeoff in Deviations #3 below.
- **LOW #4** (security-reviewer, drift bar injection + refresh path DOM API safety) — no action required (safe DOM API usage confirmed: static class names, plain text into `title` IDL, no `innerHTML`).
- **LOW #5, #6, #7** (CSS comment hygiene + `b048` stale "triangle icon" description) — comment refinements absorbed into the R5 hygiene pass on `b048`; CSS comment refinements deferred (cosmetic only).

### Deviations from R2 plan

1. **Test count exceeds AC8 minimum by 20%**: AC8 required ≥ 5 tests; landed 6. R5 added T6 (cache-fallback path per R4 LOW #3) on top of the 5 mandatory cases.
2. **UAT count exceeds AC8 minimum by 50%**: AC8 required ≥ 4 UAT cases; landed 6. R5 added UAT-4 (live+drifted permutation per R4 [qa-reviewer] MEDIUM #2 coverage gap) on top of the 4 mandatory cases. UAT-5 (tooltip) and UAT-6 (AC2 regression) were also folded in for tighter regression guards.
3. **`_ensureIndicators` defensive cache-fallback (R3 addition, not in R2 spec)**: R3 added `_cachedDriftRecords[row.dataset.itemId]?.driftedToUrl` as a belt-and-suspenders fallback when the explicit `driftedToUrl` arg is missing. The only current caller (`refetchAndPatchLiveState`) correctly passes `drifted?.driftedToUrl`, so the fallback is currently dead defensive code. **Known tradeoff** documented per R4 LOW #3; T6 exercises the path so a future regression (any caller forgetting the new arg) will surface in CI rather than as a UAT-time visual glitch. The 4th arg remains optional (backward-permissive signature change).
4. **`.item-row { position: relative }` is technically redundant** (R4 LOW #2): `.item-row` already has `contain: layout style` (sidepanel.css line 432, pre-existing), which establishes the containing block for the absolute-positioned `.item-drift-bar`. The R3-added `position: relative` is therefore redundant for the drift-bar use case. **Retained for explicitness** because (a) the existing `:focus-visible` rule (sidepanel.css:561) already relies on `position: relative` for its `z-index` to take effect — making `.item-row { position: relative }` consistent across rules; (b) `contain: layout` is a less-known CSS mechanism for establishing containing blocks, and the explicit `position: relative` makes the contract self-documenting. No code change; documented here.
5. **R5 stale-stub hygiene scope expanded beyond R2-expected files** (`b011`, `b054`, `b048`): R2 only enumerated the new test file and updated source files; R4 review surfaced that three pre-existing test files reproduced pre-B-101 helpers/stubs verbatim and required hygiene updates. The same precedent as B-099 §46.10 Deviations #5 (where two pre-existing test files needed re-pinning post-B-099); **lesson-applied as documentation only** (`b101` was a smaller surface-area change than `b099` and the R5 hygiene work was mechanical).

### Follow-up backlog items filed from B-101 R4/R5

**None.** R4 findings were either fixed in R5 or documented as known LOW-priority tradeoffs in this As-Built section. The 7 LOW findings are all cosmetic / comment-hygiene / defense-in-depth observations that do not warrant follow-up backlog entries.

### Rollback (if needed)

Single-commit revert of the S34 B-101 merge to `release/v2` restores the B-099 16 px warning-triangle drift behavior. No storage migration, no manifest permission change, no message contract change — purely a UI revert. **SEV3 (minor degradation)** — drift detection and "Snap to this tab" reconcile flow are unaffected. See §48.8 for the full rollback procedure (`git revert <merge-sha>` + `git push origin release/v2`; sidepanel surfaces refresh on next reload, no data migration).

---
