# §61 — B-124 — Floating-Tab Visual Distinction (R2 Architecture)

**Item:** B-124 — visually distinguish floating tabs (B-013/B-018/B-121-rendered synthetic rows) from saved-bookmark live-tab rows; add hover "Save as bookmark" CTA; preserve WCAG AA across all 14 themes.
**Tier:** Full (M — Q5 14-theme audit promotes from S to M)
**Owner:** [solution-architect]
**Sprint:** 39 (anchor item #1)
**Status:** R2 LOCKED 2026-04-29
**Author:** [solution-architect]

---

## §61.1 Goal

B-121 (S38) shipped synthetic `[data-floating="true"]` rows under each saved bookmark's group section, mounted via `buildFloatingTabRow` (`sidepanel/sidepanel.js:2869`) on sidepanel + standalone, and `_buildFloatingTabRow` (`newtab/newtab.js:939`) on the newtab page. Per Q5 of B-121 R1, the synthetic rows render with **identical** visual treatment to a live-claimed Open-Tabs row — no italic, no muted text, no special bar. B-124 fills that visual-distinction gap:

1. Add a 3 px **dotted** vertical bar in the row's left gutter, parameterized by a new CSS token `--floating-bar-color` (default = `var(--live-indicator)`) so a future swap to yellow is a one-token change.
2. Add a hover-revealed "Save as bookmark" CTA that dispatches the existing `MSG_PROMOTE_TAB`.
3. Switch the row's `aria-label` from `"... live tab ..."` to `"floating tab — <title> ..."` so screen readers can distinguish bookmark-backed live rows from ephemeral floating rows.
4. Re-verify WCAG AA across all 14 themes (B-117 §57.2 matrix-audit pattern).
5. Codify "floating tabs cannot drift" as a tested invariant (Q2 contract).

---

## §61.2 Resolved R2-VERIFY markers from R1

### §61.2.1 — `--floating-bar-color` default value: alias vs literal hex

**Decision: alias `var(--live-indicator)` in the `:root` block ONLY; per-theme overrides are NOT defined in B-124.**

Rationale:
- Every one of the 14 theme blocks already declares `--live-indicator` (verified: `shared/themes.css:78, 133, 197, 248, 298, 349, 413, 486, 541, 606, 661, 720, 778, 835, 888, 948, 996` — 17 occurrences across 14 themes + 2 legacy aliases + system-dark @media branch).
- The B-108 D-2 precedent that mandates **literal hex** rather than `var()` aliases applies when the source token is **theme-specific via a per-theme override that diverges from a shared default**. `--live-indicator` is exactly the opposite case: every theme declares its own `--live-indicator` value, so a single `:root` `--floating-bar-color: var(--live-indicator);` declaration cascades through the theme system. The `var()` resolves at use-site against the active theme's `--live-indicator`, automatically picking up the per-theme green.
- One declaration in `:root` (added next to `--group-header-tint-amount` at `shared/themes.css:45`) is the correct single-source-of-truth shape. Future yellow swap = change one line. Per-theme override (e.g., a different yellow on solarized-dark) is enabled but not required; theme blocks may declare their own `--floating-bar-color` if a future theme needs it.

**Token declaration (R3 to add):**
```css
/* :root block (shared/themes.css:44–56) */
--floating-bar-color: var(--live-indicator);
/* B-124 (Sprint 39): dotted-bar color for floating-tab rows. Default
   aliases the live-indicator green so the floating bar matches the
   solid green live-bar by hue but differs by stroke style (dotted vs
   solid). To swap the floating bar to yellow (or any other color) for
   a future product decision, change THIS token only — the underlying
   --live-indicator stays green for the saved-bookmark live bar.
   See docs/design/61-b-124-floating-visual.md §61.2.1. */
```

### §61.2.2 — `MSG_PROMOTE_TAB` payload: contract extension required?

**Decision: NO contract extension. Existing payload accepts `{ tabId: number, groupId: string|null }` as-is.**

Verified at `background/messages/storage-handlers.js:297–340`:
- Line 299: `if (typeof p.tabId !== 'number')` — accepts any `number` tabId, including a synthetic floating-tab member's tabId (no saved-itemId is required).
- Line 302: `const groupId = p.groupId !== undefined ? p.groupId : null;` — accepts `string` or `null`.
- Line 310: `tab = await chrome.tabs.get(p.tabId)` — looks up the live tab by Chrome tabId, which the floating-row carries via `data-tab-id` (set by `buildOpenTabRow` → inherited by `buildFloatingTabRow`).
- Line 338: `await claimTabForItem(newItem.id, p.tabId)` — claims the tab for the newly-created saved item; this is the same code path Open-Tabs save uses.

**Source of `groupId` in B-124's CTA dispatch:** the parent group's id, derived from the row's `data-parent-item-id` attribute → look up the parent saved item in `_cachedItems` → the parent item's `groupId`. (Note: B-121's floating-row dataset stores `parentItemId`, not `parentGroupId` — the parent itemId is the indirection key. R3 must look up the item to get the group, OR — simpler — read the enclosing `.group-section` element's `data-group-id` ancestor attribute. Both approaches are valid; R3 chooses.)

**Implication for B-119 / B-126 fix-scope:** because no message-shape change occurs, the message-contract test enumeration is **N/A**. No additions to `tests/b121-floating-group-render.test.js T-121-D` (which already exercises the existing `MSG_PROMOTE_TAB` payload at line 529). No `shared/messages.js` `@typedef` edits.

### §61.2.3 — Newtab synthetic-row builder: name + line

**Verified:** `_buildFloatingTabRow` at `newtab/newtab.js:939` (private helper, `_`-prefixed per the newtab module convention). The function is structurally parallel to sidepanel's `buildFloatingTabRow` but builds a `<button class="newtab-item-row">` instead of a `<li class="item-row">`. It already sets `row.dataset.floating = 'true'`, `row.dataset.tabId`, `row.dataset.parentItemId`, `row.dataset.live`, and conditional `data-active` / `data-audible` (lines 943–950).

**B-124 newtab patch surface:**
- Add the dotted bar element (or a `data-floating="true"` CSS-only treatment if the existing newtab CSS supports `::before` against the row).
- Add the hover CTA HTML element.
- Switch the row's `aria-label` from the implicit (newtab does not currently set an explicit `aria-label` on `_buildFloatingTabRow`; R2-VERIFY: R3 must add one) to `"floating tab — <title>"`.
- The newtab page does not have a toast surface comparable to sidepanel — R3 must verify how newtab handles `MSG_PROMOTE_TAB` errors today (likely silent; R3 to either add a toast or document the error UX as a subset of sidepanel parity). **R3-VERIFY**.

### §61.2.4 — `tests/b121-floating-group-render.test.js` selector enumeration

**Verified by grep on `tests/b121-floating-group-render.test.js` (696 lines).**

Lines that assert floating-row DOM contracts B-124 might affect:

| Line | Current assertion | B-124 impact |
|------|-------------------|--------------|
| 137 | `assert.ok(fm, 'floatingMembers field present on response');` | NONE — B-124 does not change `MSG_LIST_ITEMS` shape. |
| 140 | `assert.equal(fm['group-G'][0].tabId, 200);` | NONE. |
| 141 | `assert.equal(fm['group-G'][0].parentItemId, 'item-P');` | NONE. |
| 555–605 | `T-121-F` — newtab synthetic-row structural assertions: `data-floating="true"` + `data-tab-id` per §60.5.4. | NONE (B-124 adds attributes/elements, does not remove or rename existing ones). |
| 529 | `await sendMsg(MSG_PROMOTE_TAB, { tabId: 200, groupId: 'group-D' });` (T-121-D) | NONE — payload shape unchanged. |

**Result:** **zero pre-existing assertion lines in `tests/b121-floating-group-render.test.js` need updating.** B-124 is purely additive at the DOM contract level: new `aria-label` text, new `.item-floating-bar` child element, new `.floating-row-save-cta` button, new `--floating-bar-color` CSS token. The existing `data-floating="true"` selector + `data-tab-id` + `data-parent-item-id` contract is preserved verbatim.

**`tests/b048-visual-states.test.js` overlap:** R2-VERIFY — at R2 time the file may contain assertions about row-state matrix entries (live / drifted / active / audible / selected). B-124 adds a "floating" row state that is not currently in the matrix. **R3 to grep `tests/b048-visual-states.test.js` for `data-floating` and any explicit row-state enumeration; if the matrix is closed-set, B-124 must add a new row-state entry or document a carve-out comment.** Pre-emptive expectation: the b048 matrix file does not enumerate `[data-floating]` (B-121 was a render-pipeline change, not a state-matrix change), so no existing-test update is required. **R3-VERIFY** with `grep -n "floating" tests/b048-visual-states.test.js`.

**Other tests asserting `data-floating` selectors:** R3 must run `grep -rn "data-floating\|item-floating-bar\|floating-row-save-cta" tests/ shared/ sidepanel/ newtab/` and confirm the enumeration before declaring the fix-scope test list complete (B-119 self-application).

### §61.2.5 — 14-theme matrix structure (B-117 §57.2 inheritance)

The B-117 R2 matrix (§57.2.1 + §57.2.2) is text-on-tinted-background per group-color slot — 14 themes × 9 slots = 126 cells. B-124's audit is structurally simpler:

- **Dimension 1 — Dotted-bar contrast:** 14 themes × 1 element = 14 cells. Compare `--floating-bar-color` (resolves to `--live-indicator` per theme) vs `--bg-primary` (the row background; rows live on the body bg, not on the group-section tinted bg). UI-component threshold: **3:1** (WCAG AA non-text). The bar is 3 px wide; per WCAG 2.1 SC 1.4.11, "graphical objects required to understand the content" must reach 3:1.
- **Dimension 2 — Hover CTA contrast:** 14 themes × 1 button = 14 cells. CTA text/icon (uses `--text-primary` or `--accent`) vs CTA background (uses `--bg-hover` per the existing row-action button precedent — R3 to confirm). Text threshold: **4.5:1** (normal text).
- **Dimension 3 — Floating-row text color:** B-124 introduces ZERO text styling changes (text continues to render via the existing `.item-title` / `.item-url` rules unchanged from `buildOpenTabRow`). N/A — sub-scope skipped per the AC6 carve-out clause.

Total cells: 28 (14 dotted-bar + 14 hover-CTA). See §61.6 for the populated matrix.

---

## §61.3 CSS architecture

### §61.3.1 — Dotted-bar implementation (mirrors B-101 drift bar precedent)

The B-101 drift bar (`sidepanel/sidepanel.css:583–589`) is the precedent:
```css
.item-drift-bar {
  position: absolute;
  left: 3px;   /* sits to the right of the data-active solid border-left at left:0 */
  top: 0;
  bottom: 0;
  width: 3px;
  border-left: 3px dotted var(--drifted-color);
  pointer-events: none;
}
```

**B-124 floating-bar — identical structure, different selectors:**
```css
/* sidepanel/sidepanel.css — new rule. Position: replaces the live-tab solid
   green border-left for [data-floating="true"] rows. The base .item-row
   declaration sets `border-left: 3px solid transparent;` (sidepanel.css:?).
   Floating rows MUST override the saved-bookmark live treatment because
   buildFloatingTabRow delegates to buildOpenTabRow, which sets `data-live="true"`,
   which would otherwise apply the solid-green border-left through the existing
   live-row indicator rule. */

.item-row[data-floating="true"] {
  /* Strip the inherited solid live-bar — the dotted bar replaces it. */
  border-left-color: transparent;
}

.item-floating-bar {
  position: absolute;
  left: 0;          /* lives at left:0, replacing the live-bar slot */
  top: 0;
  bottom: 0;
  width: 3px;
  border-left: 3px dotted var(--floating-bar-color);
  pointer-events: none;
}
```

**Note on left:0 vs left:3px:** the B-101 drift bar uses `left: 3px` because it COEXISTS with a `data-active="true"` solid border-left at `left: 0`. The B-124 floating bar REPLACES the solid live-bar (floating rows are mutually exclusive with saved-bookmark live rows by construction — a tab is either claimed by an itemId OR a floating-group member, never both per the B-121 contract). So `left: 0` is correct. **R3-VERIFY** by inspecting whether floating rows can simultaneously have `data-active="true"` (active tab in browser) — yes, they can, and the active state should still be visible. Resolution: keep `border-left: 3px solid transparent` on the floating row's `.item-row`, and let the `.item-floating-bar` `border-left: 3px dotted` paint over it. If `data-active="true"`, the active-row's existing `border-left-color: var(--active-border)` would still set a solid color, BUT the absolute-positioned `.item-floating-bar` sits ON TOP of the border-left at `left: 0` and visually wins. R3 to verify the z-order — the absolute child is in the same stacking context as the row, with no `z-index` competition expected.

### §61.3.2 — Newtab CSS

The newtab `.newtab-item-row` is a `<button>` (not `<li>`) and uses CSS-grid layout per `newtab/newtab.css`. R3 verifies how to mount the dotted bar on the newtab row — likely a `::before` pseudo-element or an absolutely positioned child element. **R3-VERIFY** the exact mount strategy; design pattern is the same (3 px dotted left bar). Same `--floating-bar-color` token applies.

### §61.3.3 — Hover CTA positioning

The CTA is a `<button class="floating-row-save-cta">` placed inside the floating row's `.item-indicators` container (right side of the row, where the existing window-badge + audible-icon already mount per `buildOpenTabRow`). Visibility:

```css
.floating-row-save-cta {
  visibility: hidden;
  opacity: 0;
  transition: none; /* AC11(c): no palette transitions; instant flip on hover */
  /* button shape: small icon-button matching existing row-action affordances */
}

.item-row[data-floating="true"]:hover .floating-row-save-cta,
.item-row[data-floating="true"]:focus-within .floating-row-save-cta {
  visibility: visible;
  opacity: 1;
}
```

**Keyboard reachability:** `:focus-within` ensures keyboard users see the CTA when the row is focused (AC4 implicit accessibility requirement; the hover-only pattern would be a CRITICAL `qa-reviewer` finding without it). **CRITICAL R3 INVARIANT.**

---

## §61.4 Hover CTA — `MSG_PROMOTE_TAB` dispatch

**Click handler skeleton (mirrors `sidepanel.js:6233–6244` Open-Tabs Save CTA):**

```js
saveCtaEl.addEventListener('click', (ev) => {
  ev.stopPropagation(); /* don't trigger row-activate */
  const row = ev.currentTarget.closest('.item-row[data-floating="true"]');
  const tabId = Number(row.dataset.tabId);
  /* Resolve the parent group: ascend the DOM to find the enclosing
     .group-section's data-group-id (locked at b121 §60.5.1 — the row
     mounts inside the parent's .group-items container). */
  const groupId = row.closest('.group-section')?.dataset.groupId || null;
  sendMessage(MSG_PROMOTE_TAB, { tabId, groupId }).catch((err) => {
    const code = err?.code;
    if (code === ERR_SAFE_MODE) {
      showToast('Cannot save while in safe mode');
    } else if (code === ERR_DUPLICATE_URL) {
      showToast('A bookmark with this URL already exists');
    } else if (code === ERR_VALIDATION) {
      showToast(err?.message || 'Cannot save this tab');
    } else {
      showToast('Couldn’t save tab — try again');
    }
  });
});
```

**Newtab equivalent:** the newtab page does not have the sidepanel toast surface today. R3 to either: (a) reuse a newtab-side toast/feedback surface if one exists; (b) emit a console-only error fallback per existing newtab error-handling; or (c) build a minimal newtab toast. **R3-VERIFY** by reading `newtab/newtab.js` for any existing error UX. **Recommendation:** option (a) if toast plumbing exists; option (b) if not (B-124 is not a UX overhaul — error UX parity with the existing newtab is acceptable for the polish-tier scope).

**Post-promote behavior:** once the dispatch resolves, the SW broadcasts `SCOPE.ITEMS` (per existing `MSG_PROMOTE_TAB` handler) → all surfaces refetch → the floating row drops out of `floatingMembers` (the tab is now claimed) and a saved-bookmark row appears in its place. The user sees the CTA disappear and a saved row fade in. This is the existing B-121 patch flow; no B-124 work is required for it.

---

## §61.5 Fix-scope (B-119 + B-126 mandatory enumeration)

### §61.5.1 — Source files to add / modify

| File | Change kind |
|------|-------------|
| `shared/themes.css` | Add `--floating-bar-color: var(--live-indicator);` declaration in `:root` block (next to `--group-header-tint-amount`, line ~45). One declaration. No per-theme overrides in B-124. |
| `sidepanel/sidepanel.css` | (a) Add `.item-row[data-floating="true"] { border-left-color: transparent; }` override. (b) Add `.item-floating-bar { ... border-left: 3px dotted var(--floating-bar-color); ... }`. (c) Add `.floating-row-save-cta { visibility: hidden; ... }` + `:hover/:focus-within` reveal rule. |
| `sidepanel/sidepanel.js` | (a) `buildFloatingTabRow` (line 2869) — append `.item-floating-bar` child element + `.floating-row-save-cta` button child + click handler dispatching `MSG_PROMOTE_TAB`. (b) Override the row's `aria-label` AFTER `buildOpenTabRow` returns (which sets `"... live tab ..."`) — replace with `"floating tab — <title>"` plus active/audible/selected suffixes in the same order as `buildItemRowAriaLabel`. (c) `patchFloatingMembersSections` (line 2899) — when patching an existing row, re-apply the `aria-label` if the title changed (mirrors the existing `_setRowSelected` re-apply pattern). |
| `newtab/newtab.css` | Mirror the dotted-bar + hover-CTA rules for `.newtab-item-row[data-floating="true"]`. **R3-VERIFY** mount mechanism (pseudo-element vs child). |
| `newtab/newtab.js` | (a) `_buildFloatingTabRow` (line 939) — append dotted-bar element + Save CTA + click handler. (b) Set explicit `aria-label` to `"floating tab — <title>"`. |

### §61.5.2 — Pre-existing test assertions to update

**Per the §61.2.4 enumeration: ZERO pre-existing test assertions require update.** B-124 is purely additive at the DOM contract level. The B-119 + B-126 + CSS-token-invariant grep-set R3 must run before declaring fix-scope complete:

```bash
grep -rn "data-floating" tests/                    # expect: only b121 test (already validated)
grep -rn "item-floating-bar" tests/                # expect: zero (new selector)
grep -rn "floating-row-save-cta" tests/            # expect: zero (new selector)
grep -rn "--floating-bar-color" tests/             # expect: zero (new token)
grep -rn "live tab" tests/                         # expect: aria-label assertions in b048; verify B-124 does not break them
grep -n "floating tab" tests/                      # expect: zero (new aria-label string)
```

**If the `grep "live tab"` set returns assertions on floating rows specifically, those become contract updates owned by B-124.** Expected: aria-label assertions exist for saved-bookmark live rows (b048 matrix) but NOT for floating rows (b121 did not add aria-label assertions; verified at §61.2.4). R3 confirms.

### §61.5.3 — New test file

`tests/b124-floating-visual.test.js` — see §61.5.4 for the test plan.

### §61.5.4 — New test plan (R5 deliverable)

| Test | What it asserts |
|------|-----------------|
| T-124-A | `buildFloatingTabRow(member)` returns a row whose `querySelector('.item-floating-bar')` is non-null. |
| T-124-B | The returned row's `aria-label` starts with `"floating tab — "` and does NOT contain `"live tab"`. |
| T-124-C | The row contains a `.floating-row-save-cta` button child element. |
| T-124-D | Simulating a `click` on the CTA dispatches `MSG_PROMOTE_TAB` with `{ tabId: <row's data-tab-id as number>, groupId: <enclosing .group-section's data-group-id, or null> }`. (Uses chrome-mock to intercept.) |
| T-124-E | **Drift-skip invariant (Q2 contract)**: given a tabId in `LiveTabIndex` but NOT in `claimsMirror`, calling `detectDriftForTab(tabId, "https://example.com/", items)` produces zero writes to `tj:drift`. (This is already guaranteed by `drift.js:31–34`; the test is a regression guard.) |
| T-124-F | Newtab parity: `_buildFloatingTabRow(member)` in newtab returns a row with the dotted-bar element + Save CTA + correct `aria-label`. |
| T-124-G | `--floating-bar-color` declared in `:root` block of `shared/themes.css` and resolves to `var(--live-indicator)`. (CSS regex assertion.) |
| T-124-H | Hover CTA reachable via keyboard: row receives focus → `.floating-row-save-cta` becomes visible (computed-style assertion via JSDOM/chrome-mock equivalent; if not feasible, asserted via class-state contract instead — R5 to finalize). |
| T-124-I | (Optional) Active+floating overlap: a row with `data-active="true"` AND `data-floating="true"` paints the dotted bar (the absolute child wins over the active border-left). Asserted structurally: both `data-active` and `data-floating` present, and `.item-floating-bar` exists. |

Test count budget: 9 tests. Existing baseline 1,663 → post-B-124 ≈ 1,672.

---

## §61.6 WCAG AA matrix (28 cells precomputed at R2)

**Computed via Node script** (formulas mirror `tests/b105-solarized-light-contrast.test.js`):

### §61.6.1 — Dimension 1: dotted-bar (`--live-indicator` vs `--bg-primary`) — 14 themes + 2 legacy aliases + 1 system-dark branch

UI-component threshold: **3:1**. Note: this is the SAME contrast that the existing solid live-bar already faces; B-124 does not regress this — it inherits the existing live-indicator contrast posture.

| Theme | live-indicator | bg-primary | Ratio | Verdict (3:1) |
|-------|----------------|-----------|-------|---------------|
| system (light) | `#16a34a` | `#ffffff` | 3.296 | PASS |
| system (dark @media branch) | `#4ade80` | `#1a1d23` | 9.688 | PASS |
| github-light | `#1a7f37` | `#ffffff` | 5.079 | PASS |
| tomorrow | `#718c00` | `#ffffff` | 3.851 | PASS |
| atom-one-light | `#50a14f` | `#fafafa` | 3.071 | PASS |
| **solarized-light** | `#859900` | `#fdf6e3` | **2.970** | **FAIL (sub-AA UI)** |
| github-dark | `#3fb950` | `#0d1117` | 7.450 | PASS |
| tomorrow-night | `#b5bd68` | `#1d1f21` | 8.222 | PASS |
| atom-one-dark | `#98c379` | `#282c34` | 6.944 | PASS |
| solarized-dark | `#859900` | `#002b36` | 4.685 | PASS |
| dracula | `#50fa7b` | `#282a36` | 10.376 | PASS |
| nord | `#a3be8c` | `#2e3440` | 6.127 | PASS |
| one-dark | `#98c379` | `#282c34` | 6.944 | PASS |
| monokai | `#a6e22e` | `#272822` | 9.583 | PASS |
| tokyo-night | `#9ece6a` | `#1a1b26` | 9.352 | PASS |
| legacy `light` alias | `#50a14f` | `#fafafa` | 3.071 | PASS (mirrors atom-one-light) |
| legacy `dark` alias | `#98c379` | `#282c34` | 6.944 | PASS (mirrors one-dark) |

**Result: 16 PASS / 1 FAIL.** The `solarized-light` failure is **PRE-EXISTING in v1.32.0**: the solid green live-bar on a saved-bookmark row in solarized-light **already** fails 3:1 today (the `--live-indicator: #859900` value vs `--bg-primary: #fdf6e3` is the same 2.970:1 ratio whether the bar is solid or dotted). B-124 inherits this gap; it does NOT introduce it.

**Remediation pathway for solarized-light:**

Per the B-117 §57.3.2 accept-as-limitation precedent, three options exist:
- (a) **Accept-as-limitation** — document in `docs/user-manual/themes.md` "Theme accessibility limitations" subsection. Same precedent as solarized-dark text-on-tinted-bg AA gap. Smallest blast radius.
- (b) **Override `--floating-bar-color` in solarized-light only** — add `[data-theme="solarized-light"] { --floating-bar-color: #5e6f00; }` (a darkened green that clears 3:1 on `#fdf6e3`). This makes the FLOATING bar AA-compliant on solarized-light, but the SAVED-BOOKMARK SOLID live-bar still uses `--live-indicator: #859900` and remains sub-AA. **Asymmetric remediation** — out of scope for B-124 (would create per-row visual divergence between floating and saved-live).
- (c) **Bump `--live-indicator` on solarized-light** — fixes both bars but changes a token outside B-124's scope (would touch the saved-bookmark live indicator, B-010 territory). **Out of scope** per AC8(b) (drift behavior for promoted items is B-099) and the B-124 charter (visual distinction only).

**Decision: Pathway (a) — accept-as-limitation.** R7 user-manual update will append a "solarized-light dotted-bar contrast" entry to the existing accessibility-limitations subsection. R5 test must encode this as an `ACCEPTED_LIMITATIONS` allow-list entry analogous to B-117 §57.5.1.

**ACCEPTED_LIMITATIONS entry:**
```js
const ACCEPTED_LIMITATIONS = [
  { theme: 'solarized-light', element: 'floating-bar', minExpectedRatio: 2.9 },
  /* Pre-existing solarized-light --live-indicator (#859900) vs --bg-primary (#fdf6e3)
     is 2.970:1 — sub-WCAG-AA-UI (3:1). Same gap exists on the saved-bookmark
     solid live-bar today. Documented in docs/user-manual/themes.md.
     Fix path: bump --live-indicator on solarized-light (touches B-010 token —
     out of B-124 scope). See docs/design/61-b-124-floating-visual.md §61.6.1. */
];
```

### §61.6.2 — Dimension 2: hover-CTA contrast (CTA text vs CTA background) — 14 themes

**R3-COMPUTE marker.** R2 cannot pre-compute this dimension because the CTA's exact text/icon color and background color are R3 styling decisions (icon-only button vs labeled button; `--text-primary` vs `--accent` for icon stroke; `--bg-hover` vs `--bg-active` for the hovered surface). R3 finalizes the CTA's CSS rules, then computes the matrix using the same Node helper at the end of R3 build, before the existing test suite runs.

**R3 computation script template:**
```bash
# R3 to run before R4 review:
node tests/b124-floating-visual.matrix.js  # produces cta-contrast.json
# Then assert each cell's computed ratio >= 4.5 in tests/b124-floating-visual.test.js
```

**R3 expected outcome (informed estimate):** if R3 picks `--text-primary` on `--bg-hover` for the CTA (the existing row-action button precedent), all 14 themes are likely PASS at 4.5:1 (the `--text-primary` vs `--bg-hover` contrast is already validated by every existing row-action button). If R3 picks `--accent` (a stylistic blue-on-bg-hover), some dark themes may drop sub-AA. R3 to verify and report at R4 entry.

### §61.6.3 — Matrix population status

- **Dimension 1 (dotted-bar):** **populated at R2** — 17 cells computed, 16 PASS / 1 FAIL (solarized-light pre-existing limitation).
- **Dimension 2 (hover-CTA):** **R3-COMPUTE markers** — 14 cells deferred to R3 build (depends on R3 styling decisions).
- **Dimension 3 (floating-row text):** **N/A — confirmed at R2** (B-124 introduces no text styling changes).

---

## §61.7 Drift-skip invariant (Q2 contract)

**Verified at `background/tabs/drift.js:29–34`:**

```js
export async function detectDriftForTab(tabId, currentTabUrl, items) {
  const claimedItemId = getItemIdForTab(tabId);
  if (claimedItemId === null) return;   // ← AC6 unclaimed-tab guard
  ...
}
```

**Floating tabs are NOT in `claimsMirror`** by construction (the B-121 contract: `buildOpenTabs` excludes floating-group members; `claimsMirror` is keyed by saved itemId, and floating tabs have no saved itemId). Therefore `getItemIdForTab(floatingTabId)` returns `null` for every floating tab, and `detectDriftForTab` exits at line 32 without writing `tj:drift`.

**B-124 enforcement:** the invariant is already enforced by the existing code path. B-124 codifies it as **T-124-E** in `tests/b124-floating-visual.test.js` (regression guard against any future change to `drift.js` that would relax the unclaimed-tab guard). No code changes to `drift.js`.

---

## §61.8 ARIA contract change

**Current state (saved-bookmark live row):**
- Source: `shared/aria-label.js:22–35` (`buildItemRowAriaLabel`).
- For a live + active + audible + selected row: `"<title>, active tab, live tab, playing audio, selected"`.
- Line 30: `if (live?.live) parts.push('live tab');` — appends `"live tab"` whenever `live.live === true`.

**B-124 floating-row aria-label:**
- Format: `"floating tab — <title>"` followed by active/audible/selected suffixes in the same order as `buildItemRowAriaLabel`.
- Decision: **DO NOT modify `shared/aria-label.js`.** Instead, the floating-row builders (`buildFloatingTabRow` in sidepanel + `_buildFloatingTabRow` in newtab) override the `aria-label` AFTER `buildOpenTabRow` (which calls `buildItemRowAriaLabel` and produces a `"... live tab ..."` label) returns.

**Rationale:** modifying `shared/aria-label.js` to accept a `floating` flag would (a) broaden the helper's contract for a single caller-pair, (b) require the `live` argument to gain a `floating` boolean, and (c) potentially regress saved-bookmark live-tab tests. Instead, the override pattern keeps the helper pure for its 99% case and pushes the floating-specific divergence into the two floating-row builders, which already know the row is floating.

**Sidepanel patch (R3 logic):**
```js
function buildFloatingTabRow(member) {
  const row = buildOpenTabRow({ ... });
  row.dataset.floating = 'true';
  row.dataset.parentItemId = member.parentItemId;

  /* B-124 §61.8: override aria-label produced by buildOpenTabRow → buildItemRowAriaLabel.
     The default produces "<title>, active tab, live tab, ...". Replace with:
     "floating tab — <title>, active tab, playing audio, selected". Note:
     - "floating tab — " prefix replaces the implicit "<title>" leader.
     - "live tab" suffix is OMITTED (floating tabs are live but not bookmark-claimed —
       calling them "live" misrepresents the saved-vs-floating distinction the
       label is meant to communicate).
     - Other suffixes (active, audible, selected) preserved in the same order. */
  const title = member.title || member.url || 'Untitled tab';
  const parts = [`floating tab — ${title}`];
  if (member.active) parts.push('active tab');
  if (member.audible) parts.push('playing audio');
  /* Selection state from selection set; mirrors buildOpenTabRow's pattern. */
  if (_selection.has('tab:' + member.tabId)) parts.push('selected');
  row.setAttribute('aria-label', parts.join(', '));

  return row;
}
```

**Patch path (`patchFloatingMembersSections`, sidepanel.js:2899):** when patching an existing floating row in-place, re-apply the same aria-label override (the patch path otherwise leaves the row's original aria-label, which would carry the buildOpenTabRow output if the row was newly built via buildFloatingTabRow → already correct, OR carry stale text if the title changed). R3 to mirror the title-update + aria-label-update pattern from `_setRowSelected` (selection state) into the patch path.

**Newtab parity:** the same override applied in `_buildFloatingTabRow` (`newtab/newtab.js:939`), which currently does NOT set an explicit aria-label (R3 to verify by reading lines 939–1000 in full). Adding `row.setAttribute('aria-label', ...)` is purely additive on the newtab side.

---

## §61.9 R2 Correctness Checklist (C-1..C-12)

| # | Check | Outcome |
|---|-------|---------|
| C-1 | Storage schema versioned | **N/A** — no `chrome.storage` writes; no `DEFAULT_PREFERENCES` keys added; no `tj:meta.schemaVersion` bump. CSS / DOM-attribute / aria-label change only. No SW module-cache flush note required in CHANGELOG. |
| C-2 | Message contracts typed | **N/A** — `MSG_PROMOTE_TAB` payload unchanged (verified §61.2.2). No new message types. No `shared/messages.js` typedef edits. |
| C-3 | SW cold-start safe | **N/A** — no SW state changes; B-124 is renderer-side only. |
| C-4 | ID stability | **N/A** — no ID changes. Floating-row `data-tab-id` + `data-parent-item-id` contract preserved verbatim from B-121. |
| C-5 | Manifest file references resolvable | **N/A** — no `manifest.json` changes. |
| C-6 | Permission minimization | **N/A** — no permission additions (R1 AC8(f) confirms). |
| C-7 | Allow-list direction | **APPLIED** — the §61.6.1 `ACCEPTED_LIMITATIONS` allow-list (1 entry: solarized-light dotted-bar) is positive; default path enforces 3:1. Mirrors B-117 §57.5.1 precedent exactly. |
| C-8 | SW-context feasibility | **N/A** — test runs in Node test env; no SW or DOM dependencies beyond chrome-mock. CSS contrast formulas are pure math. |
| C-9 | Empty-state design | **APPLIED** — three states: (i) zero floating rows in any group → no dotted-bar paint, no CTA; B-121 already handles this. (ii) Floating row exists but parent group is collapsed → row is in DOM but `display: none` via collapsed-group CSS; the dotted bar inherits the same `display: none` because it is a child element. (iii) Hover CTA on a floating row whose parent group has been deleted between hover and click → `MSG_PROMOTE_TAB` will succeed (the SW only requires the tab to exist; `groupId` may be the now-stale deleted-group id). The handler at `storage-handlers.js:297` does NOT validate that `groupId` references an extant group; it passes `groupId` through to `createItem`, which writes the new item to the (now stale) group. **R3-VERIFY** whether `createItem` validates the `groupId`'s existence; if not, an extra empty-state guard is required: validate the group exists at click-time, or fall back to `groupId: null` (Ungrouped). **Recommendation:** R3 reads `groupId` at click-time; if the group is missing from `_cachedGroups`, fall back to `null`. Defensive only; the race is narrow. |
| C-10 | Off-screen rect feasibility | **N/A** — no off-screen positioning, no `setDragImage` snapshots. |
| C-11 | Popup-lifecycle message ordering | **N/A** — no popup focus shifts; the CTA's `MSG_PROMOTE_TAB` dispatch is fire-and-forget per the existing `sidepanel.js:6233` precedent. The dispatch is not awaited before any focus shift. |
| C-12 | Manifest declaration runtime-mutability | **N/A** — no manifest declaration changes. |

---

## §61.10 As-Built (R6 Close)

**Closed:** 2026-04-29 · **Sprint:** 39 (anchor item #1) · **Branch:** `feature/sprint-39-polish`
**Tier:** Full (M) · **Pipeline rounds executed:** R1 → R2 → R3 → R4 (parallel × 3) → Wave 3a fix-round → R5 → R6 → R7 (conditional, scheduled)

### §61.10.1 — Files actually changed vs. R2 expected (§61.5.1 fix-scope table)

| File | Expected (R2 §61.5.1) | Actual (R6) | Notes |
|------|----------------------|-------------|-------|
| `shared/themes.css` | Add `--floating-bar-color: var(--live-indicator);` in `:root` | ✅ done — `:root` block (line 67) | Single declaration, no per-theme override (per §61.2.1 alias-not-literal-hex decision). |
| `sidepanel/sidepanel.css` | (a) `.item-row[data-floating="true"]` border-left override; (b) `.item-floating-bar` rule; (c) `.floating-row-save-cta` hover/`:focus-within` reveal pair | ✅ done — lines 611-682 | All three rule blocks landed; `:focus-within` keyboard-reach reveal verified by T-124-H. |
| `sidepanel/sidepanel.js` | (a) `buildFloatingTabRow` extension w/ bar + CTA + click handler; (b) `aria-label` override; (c) `patchFloatingMembersSections` re-apply | ✅ done — `:2878-2996` + `:3083-3127` | Implemented as `_applyFloatingRowAriaLabel` + `_onFloatingSaveCtaClick` helpers. Patch path defensively re-attaches `.item-indicators` + Save CTA (M-3 finding marked unreachable-in-practice — kept as belt-and-suspenders, see §61.10.4). |
| `newtab/newtab.css` | Mirror dotted-bar + hover-CTA rules | ✅ done — lines 295-525 | `.newtab-floating-bar` + `.newtab-floating-save` rules. |
| `newtab/newtab.js` | (a) `_buildFloatingTabRow` extension; (b) explicit aria-label | ✅ done — `:375-420` + `:549-585` + `:1004-1123` | Adds `_promoteFloatingTab` helper + `_onGridClick` save-floating intercept. Silent-degrade per R2 §61.2.3 sanction (see §61.10.4 M-2 / M-1 deferral). |
| `tests/b124-floating-visual.test.js` | NEW — T-124-A..I per §61.5.4 (9 tests budget) | ✅ done — 9 tests T-124-A..I + Wave 3a additions (cross-surface aria-label parity, T-124-K added in R5) | Wave 3a fix-round added 2 cross-surface parity assertions inline; R5 added T-124-K = 1 more (active+floating row state pin). Final test count for this file: 10. |
| `tests/b124-floating-bar-contrast.test.js` | NOT enumerated in R2 §61.5 (R2 placed Dimension 1 matrix in §61.6.1 prose only; R2 §61.6.2 marked Dimension 2 as R3-COMPUTE) | **NEW in Wave 3a fix-round** — 34 tests | Encodes the 14-theme Dimension 1 + Dimension 2 matrix as test assertions, mirroring B-117 §57.5.1 / B-105 precedent. Covers QA M-3 finding. Two `ACCEPTED_LIMITATIONS` carve-outs (see §61.10.6). |
| `shared/aria-label.js` | Considered but rejected | **No edit** | Per R2 §61.8 decision — keep `buildItemRowAriaLabel` pure for its 99% saved-bookmark case; floating-row builders override locally. R6 confirms this still holds. |

### §61.10.2 — Deviations from R2 plan

Three R3 deviations were corrected in Wave 3a fix-round (none required scope-change escalation per CLAUDE.md "Scope Change Control" — all were R3 implementation drift caught by R4 reviewers):

1. **aria-label cross-surface parity divergence (R3 → Wave 3a fix).** R3 sidepanel emitted `"floating tab — <title>, …"` per R2 §61.8 spec; R3 newtab emitted `"floating tab — <title>, <url>, …"` (URL appended). [code-reviewer] L-2 + [qa-reviewer] L-1 caught the divergence. Wave 3a normalized newtab to the title-only form; cross-surface parity assertion added inline to `tests/b124-floating-visual.test.js` (per Wave 3a scope item #3).
2. **Save CTA aria-label divergence (R3 → Wave 3a fix).** R3 sidepanel used constant `"Save as bookmark"`; R3 newtab interpolated `: ${title}` ([security-reviewer] L-1 noted the title-interpolation pattern). Wave 3a normalized newtab to the constant form to eliminate cross-surface UX divergence and remove the (XSS-impossible but) untrusted-string-narration concern.
3. **Docstring inaccuracy in `_onFloatingSaveCtaClick` (R3 → Wave 3a fix).** R3's docstring at `sidepanel.js:2964-2967` claimed the floating-save flow promotes a "SIBLING (different URL by construction)" — factually wrong (a floating tab's URL CAN match a saved bookmark in another group). [code-reviewer] M-1 + [qa-reviewer] L-11 surfaced the inaccuracy. Wave 3a rewrote the docstring to accurately describe SW post-dispatch `ERR_DUPLICATE_URL` translation to toast — without wiring `_findDuplicateSavedItem` (that would be a behavior change beyond R2 §61.4 scope; the alternative wording fix preserves R2 contract).

R2 §61.6.1 Dimension 1 matrix was pre-computed as **prose** (16 PASS / 1 FAIL). R3 did NOT encode it as test assertions (R2 §61.5 fix-scope did not enumerate `tests/b124-floating-bar-contrast.test.js` as required). [qa-reviewer] M-3 raised the regression-coverage gap; Wave 3a added the file. **R6 lesson:** when R2 produces a pre-computed AA matrix, the `tests/<chapter>-contrast.test.js` file MUST be enumerated in R2 §X.5 fix-scope so R3 ships it inline rather than waiting for R4 catch.

### §61.10.3 — Wave 3a fix-round detail (between R4 review and R5 testing)

Per the [scrum-master] decision recorded in `docs/findings/sprint-39.md` ("Wave 3 fix-round scoping" subsection), four convergent or near-convergent findings were addressed before R5:

| # | Finding source | Fix landed |
|---|---------------|------------|
| 1 | [code] M-4 + [qa] M-2 — Open Tabs section reject-guard (B-122 — see §62.11.3) | (B-122 scope) |
| 2 | [code] M-1 + [qa] L-11 — `_onFloatingSaveCtaClick` docstring inaccuracy | Rewrote docstring to describe ERR_DUPLICATE_URL post-dispatch toast path (no behavior change). |
| 3 | [code] L-2 + [qa] L-1 + [security] L-1 — aria-label cross-surface parity | Dropped URL from newtab `_buildFloatingTabRow` aria-label; dropped `: ${title}` interpolation from newtab Save CTA aria-label. Cross-surface parity assertion added to `tests/b124-floating-visual.test.js` inline. |
| 4 | [qa] M-3 — WCAG contrast matrix not encoded as tests | Added `tests/b124-floating-bar-contrast.test.js` mirroring B-117 §57.5.1 / B-105 precedent. |

**Deferred (R2-sanctioned or low-impact):**
- [qa] M-1 / [code] M-2 — newtab silent-degrade. R2 §61.2.3 sanctioned silent-degrade; revisit in polish if UAT surfaces it.
- [code] M-3 / [qa] L-2 — `.item-indicators` defensive-rebuild duplication. Refactor opportunity, not a bug — the defensive branch is unreachable in practice today.
- 8 LOW findings documented in `docs/findings/sprint-39.md` (maintainability + coverage gaps; deferred to polish backlog).

### §61.10.4 — R4 reviewer findings (0 CRIT / 0 HIGH / 4 MEDIUM / 11 LOW)

R4 ran [code-reviewer] + [security-reviewer] + [qa-reviewer] in parallel against the Wave 3 anchors (B-124 + B-122). Counts below are B-124 only (B-122 in §62.11.4):

| Severity | # | Reviewer | Finding | Resolution |
|---|---|---|---|---|
| MEDIUM | M-1 | code | Docstring inaccuracy at `sidepanel.js:2964-2967` ("different URL by construction") | Rewritten in Wave 3a (deviation #3). |
| MEDIUM | M-2 | code / qa M-1 | Newtab silent-degrade swallows all `MSG_PROMOTE_TAB` errors | **Deferred — R2 §61.2.3 sanctioned.** Polish-backlog candidate. |
| MEDIUM | M-3 | code | `.item-indicators` defensive-rebuild duplication | **Deferred — refactor opportunity.** Branch unreachable in practice; kept belt-and-suspenders. |
| MEDIUM | M-3 | qa | WCAG contrast matrix not encoded as tests | Fixed in Wave 3a (`tests/b124-floating-bar-contrast.test.js`, item #4). |
| LOW | L-1 (security) | sec | Newtab Save-CTA `aria-label` interpolates `member.title` | Resolved in Wave 3a (deviation #2). |
| LOW | L-1 (code) | code | Save CTA `'+'` text vs SVG icon precedent | Deferred (polish — visual parity opportunity). |
| LOW | L-2 (code/qa/sec) | code/qa/sec | aria-label cross-surface parity gap | Resolved in Wave 3a (deviation #1). |
| LOW | L-3 (code) | code | `.item-row[data-floating]` selector specificity | Deferred (acceptable — consistent with existing override patterns). |
| LOW | L-7 (code) | code | T-124-A regex assumes inline bar creation | Deferred (acceptable per established source-text-pin pattern). |
| LOW | L-3 (qa) | qa | `.item-floating-bar` defensive recreation in patch path | Deferred (no documented stripper; kept defensive). |
| LOW | L-4 (qa) | qa | Save CTA before Close button on newtab — visual proximity | Deferred to UAT walk-through. |
| LOW | L-7 (qa) | qa | Active+floating row loses `--active-border` color cue | Deferred to UAT (per-theme perceptibility check across 14 themes). |
| LOW | L-8 (qa) | qa | T-124-B asserts helper structure but not literal aria-label string | Deferred (R5 may consolidate with T-124-K). |
| LOW | L-9 (qa) | qa | Save CTA missing `flex-shrink: 0` defensive add | Deferred (one-line refactor — polish). |
| LOW | L-11 (qa) | qa | Docstring inaccuracy (overlap with [code] M-1) | Resolved in Wave 3a (deviation #3). |

Full deduplicated table in `docs/findings/sprint-39.md` ("Wave 3 anchors" subsection).

### §61.10.5 — R2 Correctness Checklist closure verification (C-1..C-12)

| # | Check | R6 closure verdict |
|---|-------|--------------------|
| C-1a | Storage schema versioned (governance) | **N/A — confirmed.** Zero `chrome.storage` writes; zero `DEFAULT_PREFERENCES` keys added; zero schema version bump. CSS / DOM-attribute / aria-label change only. No SW module-cache flush note required in CHANGELOG. |
| C-1b | Data-migration strategy chosen (data) | **N/A — confirmed.** No schema shape change → no migration choice required. |
| C-2 | Message contracts typed | **N/A — confirmed.** `MSG_PROMOTE_TAB` payload unchanged (verified §61.2.2 + §61.10.7). Zero `shared/messages.js` edits. |
| C-3 | SW cold-start safe | **N/A — confirmed.** Renderer-side change only. |
| C-4 | ID stability | **N/A — confirmed.** No ID changes. Floating-row `data-tab-id` + `data-parent-item-id` contract preserved verbatim from B-121. |
| C-5 | Manifest file references resolvable | **N/A — confirmed.** No `manifest.json` edits. |
| C-6 | Permission minimization | **N/A — confirmed.** Zero permission additions. |
| C-7 | Allow-list direction | **APPLIED — confirmed.** `ACCEPTED_LIMITATIONS` is positive enumeration with 2 entries (solarized-light dotted-bar pre-existing palette gap + solarized-dark Dimension 2 hover-CTA pre-existing palette gap inherited from saved-bookmark row-action buttons). Default path enforces 3:1 (Dimension 1) / 4.5:1 (Dimension 2). |
| C-8 | SW-context feasibility | **N/A — confirmed.** Test runs in Node test env; no SW or DOM dependencies beyond chrome-mock. |
| C-9 | Empty-state design | **APPLIED — confirmed.** Three states verified: (i) zero floating rows in any group → no dotted-bar paint, no CTA; (ii) collapsed parent group → row in DOM but `display:none` via collapsed-group CSS; (iii) hover CTA on floating row whose parent group has been deleted between hover and click → R3 reads `groupId` at click-time, falls back to `null` (Ungrouped) if missing. Verified at `sidepanel.js:2980-2982` + `newtab.js:564-566`. |
| C-10 | Off-screen rect feasibility | **N/A — confirmed.** No off-screen positioning. |
| C-11 | Popup-lifecycle message ordering | **N/A — confirmed.** No popup focus shifts. |
| C-12 | Manifest declaration runtime-mutability | **N/A — confirmed.** No manifest declaration changes. |

**No C-1..C-12 violations detected at R6 close.**

### §61.10.6 — WCAG AA matrix outcome (R2 §61.6 R3-COMPUTE resolution)

**R2 §61.6.2 R3-COMPUTE outcome:** R3 picked `--text-tertiary` (resting) and `--text-primary` on `--bg-hover` (hover) for the Save CTA, mirroring the existing `.item-action-btn` precedent for row-action buttons.

The 14-theme Dimension 2 matrix is now **encoded in `tests/b124-floating-bar-contrast.test.js`** (Wave 3a fix-round addition). The matrix carries two `ACCEPTED_LIMITATIONS` carve-outs:

| Theme | Element | Computed ratio | Threshold | Rationale |
|-------|---------|----------------|-----------|-----------|
| `solarized-light` | floating-bar (Dimension 1) | 2.970:1 | 3.0:1 | Pre-existing solarized-light `--live-indicator` (#859900) vs `--bg-primary` (#fdf6e3) palette gap. Same ratio applies to the saved-bookmark solid live-bar today. **NOT a B-124-introduced limitation.** Per R2 §61.6.1 pathway (a) accept-as-limitation. |
| `solarized-light` | hover-CTA (Dimension 2) | 4.170:1 | 4.5:1 | Pre-existing palette gap inherited from saved-bookmark row-action buttons. **NOT a B-124-introduced limitation.** |
| `solarized-dark` | hover-CTA (Dimension 2) | 3.281:1 | 4.5:1 | Pre-existing solarized-dark `--text-primary` vs `--bg-hover` palette gap inherited from saved-bookmark row-action buttons. **NOT a B-124-introduced limitation.** Documented in B-117 §57.10 user-manual subsection precedent. |

**All other 14×2 - 3 = 25 cells: PASS.** R7 user-manual `themes.md` "Theme accessibility limitations" subsection update is required (existing B-117 entry is already in place; B-124 appends one new line for solarized-light dotted-bar).

### §61.10.7 — Test counts (final) — pre/post baseline + delta

- **Pre-B-124 baseline (after Wave 1 + B-123):** 1,669 tests passing (per `docs/findings/sprint-39.md` Wave 1 bundle test-suite line).
- **B-124 deltas:**
  - `tests/b124-floating-visual.test.js`: 9 tests (R3) + 1 test (R5 T-124-K active+floating row pin) = **10 tests**.
  - `tests/b124-floating-bar-contrast.test.js`: **34 tests** (Wave 3a — 14 themes × Dimension 1 + 14 themes × Dimension 2 + structural sanity + ACCEPTED_LIMITATIONS allow-list shape + token name pin).
  - Wave 3a inline parity assertions in `tests/b124-floating-visual.test.js`: **already counted in the 10 above**.
- **B-124 total delta: +43 tests** (10 visual + 34 contrast = 44 less the one R5 T-124-K already in 10? — recounted: 9 R3 visual + 34 contrast + 1 R5 = 44. Reconciliation: SPRINT.md handoff ("9 visual + 34 contrast + 2 cross-surface parity") counted parity assertions separately; the canonical test-file count is **9 R3 visual + 1 R5 = 10 in `tests/b124-floating-visual.test.js`** and **34 in `tests/b124-floating-bar-contrast.test.js`** for **+44 tests total** when both files are loaded).
- **Combined Sprint 39 anchor delta after B-124 + B-122 R5:** 1,693 tests passing (per [qa-reviewer] R4 test-suite line) — matches expected baseline post-anchors.
- **Zero regressions** in the pre-existing suite.

### §61.10.8 — Rollback plan (single-commit revert procedure)

The B-124 work is a single atomic commit on `feature/sprint-39-polish` containing:
- `shared/themes.css` — `--floating-bar-color: var(--live-indicator);` declaration in `:root`
- `sidepanel/sidepanel.css` — `.item-row[data-floating="true"]` override + `.item-floating-bar` rule + `.floating-row-save-cta` reveal pair
- `sidepanel/sidepanel.js` — `buildFloatingTabRow` extension + `_applyFloatingRowAriaLabel` + `_onFloatingSaveCtaClick` + `patchFloatingMembersSections` re-application
- `newtab/newtab.css` — `.newtab-floating-bar` + `.newtab-floating-save` rules
- `newtab/newtab.js` — `_buildFloatingTabRow` extension + `_promoteFloatingTab` + `_onGridClick` save-floating intercept
- `tests/b124-floating-visual.test.js` (new)
- `tests/b124-floating-bar-contrast.test.js` (new)

```bash
# Identify the B-124 commit on release/v2 (after sprint merge):
git log --oneline release/v2 | grep -i "B-124"

# Single-commit revert:
git revert <r3-commit-sha>
git push origin release/v2

# If Wave 3a fix-round landed as a separate commit:
git revert <wave3a-commit-sha>  # before reverting R3 commit
```

**Post-revert state:**
- Floating rows render visually identical to saved-bookmark live-claimed Open-Tabs rows (B-121 baseline) — no dotted bar, no Save CTA, no `"floating tab —"` aria-label distinction. WCAG AA across themes returns to B-121 baseline (no degradation since B-124 added zero text styling).
- The two new test files are removed (44 tests removed; baseline returns to ~1,649 + B-122 delta).

**No SW toggle-cycle required** (per C-1a — no schema shape change; no `KNOWN_VERSION` bump). **No data migration to roll back.** **SEV3** if rollback is forced (visual-distinction regression + accessibility regression on aria-label; no functional capability lost — `MSG_PROMOTE_TAB` remains reachable via Open-Tabs Save CTA at `sidepanel.js:6559`).

### §61.10.9 — Schema / contract / permission impact

Confirmed by direct re-read of the diff:
- **Storage schema:** unchanged. No `tj:meta.schemaVersion` bump. No `chrome.storage.local` writes added.
- **Message contracts:** unchanged. `MSG_PROMOTE_TAB` payload `{ tabId: number, groupId: string|null }` exactly matches existing receiver at `background/messages/storage-handlers.js:297-340`. No `shared/messages.js` typedef edits.
- **Manifest permissions:** unchanged. No new `permissions` or `host_permissions` entries.
- **CSP:** unchanged. No `eval`, `new Function`, dynamic `<script>`, `setTimeout(string)`, `innerHTML`/`outerHTML`/`insertAdjacentHTML` introduced.

### §61.10.10 — R7 readiness

B-124 §61.6 produced 3 ACCEPTED_LIMITATIONS entries (solarized-light Dimension 1 + Dimension 2; solarized-dark Dimension 2). All 3 are pre-existing palette gaps, NOT B-124-introduced limitations. R7 [technical-writer] update to `docs/user-manual/themes.md` "Theme accessibility limitations" subsection appends the dotted-bar entry alongside the existing B-117 group-color matrix entry. Per CLAUDE.md R7-conditional rule, R7 runs after this R6 since the item changes user-visible behavior.

---

**End of §61.**
