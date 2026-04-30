# B-124 UAT — Floating-Tab Visual Distinction

**Sprint:** 39 (v1.33.0)
**Branch:** `feature/sprint-39-polish`
**Spec:** `docs/design/61-b-124-floating-visual.md`
**Tier:** Full (M) — UAT mandatory per CLAUDE.md Gate 2
**Build target:** `./build.sh` produces `tab-junkie.zip`; load unpacked from repo root in Edge developer mode
**R3 file changes:**
- `shared/themes.css` (new `--floating-bar-color` token in `:root`, aliasing `var(--live-indicator)`)
- `sidepanel/sidepanel.css` (`.item-row[data-floating="true"]` border-color override + `.item-floating-bar` dotted bar + `.floating-row-save-cta` reveal pair)
- `sidepanel/sidepanel.js` (`buildFloatingTabRow` extension + `_applyFloatingRowAriaLabel` helper + `_onFloatingSaveCtaClick` handler + `patchFloatingMembersSections` re-application)
- `newtab/newtab.css` (`.newtab-floating-bar` + `.newtab-floating-save` rules with the same token)
- `newtab/newtab.js` (`_buildFloatingTabRow` extension + `_promoteFloatingTab` dispatch + `_onGridClick` save-floating intercept)
- `tests/b124-floating-visual.test.js` (new — 12 tests T-124-A..K + cross-surface parity)
- `tests/b124-floating-bar-contrast.test.js` (new — 34 WCAG AA contrast cells)

**Automated test status:** 1,731/1,731 passing (12 B-124 visual tests + 34 contrast tests + 2 cross-surface parity tests).

Manual test cases against the unpacked extension loaded in **Edge** (Developer Mode → Load unpacked → repo root). Run **after** verifying the automated suite passes.

> **Edge gotcha (per user memory):** `chrome://` URLs do not work in Edge. Use `edge://extensions` and `edge://serviceworker-internals` equivalents. To force-reload the extension after changes, toggle the extension OFF then ON in `edge://extensions`.

> **SW inspection:** Open `edge://extensions` → "Tab Junkie" card → "Inspect views: service worker" to view SW console logs. Use this to verify `MSG_PROMOTE_TAB` dispatches and any `ERR_*` codes returned.

| Symbol | Meaning |
|---|---|
| **PASS** | Observed behavior matches PASS criteria |
| **FAIL** | Observed behavior matches FAIL criteria; route back to [frontend-engineer] |
| **WARN** | Observed but documented R2 tradeoff (not a regression) |
| **SKIP** | Could not be exercised in this run; record reason |

**Setup that applies to every case below:**
1. Load unpacked extension from repo root.
2. Open the side panel.
3. Have at least the bookmarks listed per case seeded in the active collection. Add bookmarks via the existing Add-Bookmark flow if missing.
4. Have the SW console open (per "SW inspection" above) so any thrown errors during dispatch are visible.

---

## UAT-1 — Visual distinction (sidepanel): dotted floating bar vs solid saved-bookmark live bar

**Priority:** H — primary acceptance test for AC1 + AC5 on the sidepanel surface.

**Setup:**
1. Add one saved bookmark: **Parent A** → `https://example.com/` (any URL with outbound links).
2. Click **Parent A** in the side panel — a tab opens, auto-claims the bookmark; the sidepanel row shows a **solid** 3 px green left bar (saved-bookmark live indicator).
3. With Parent A's tab focused, **Ctrl+click** any in-page link to spawn a floating tab (B-121 spawn flow). The new floating row appears under Parent A in the same group section.

**Action:**
1. In the side panel, visually compare the two rows:
   - **Parent A** row — saved bookmark, currently live-claimed.
   - The floating row directly under it — synthetic, ephemeral.
2. Optionally Inspect Element to confirm the floating row carries `data-floating="true"`.

**Expected result:**
- Parent A's row shows a **solid** 3 px green vertical bar in the left gutter.
- The floating row shows a **dotted** 3 px green vertical bar in the left gutter (same color hue, different stroke).
- The two are visually distinct at a glance — dotted-vs-solid is the non-color cue (AC5).

**PASS:** Parent A bar is solid, floating row bar is dotted, both green.
**FAIL:** Floating row shows a solid bar (AC1 fail), OR dotted bar missing entirely, OR colors do not differ from the underlying row background by an obvious amount.

**Validates:** AC1 (dotted-bar render on sidepanel) + AC5 (non-color cue).

---

## UAT-2 — Visual distinction (newtab parity)

**Priority:** H — confirms cross-surface parity (AC1 newtab leg).

**Setup:** Continue from UAT-1 (Parent A claimed, one floating tab spawned).

**Action:**
1. Open a fresh **new tab** (Ctrl+T) — the Tab Junkie newtab page loads.
2. Locate Parent A's group section.
3. Visually compare the saved-bookmark row vs the floating row inside Parent A's section.

**Expected result:**
- Saved Parent A row shows a **solid** green bar (matches sidepanel behavior).
- Floating row shows a **dotted** green bar (matches sidepanel — uses the same `--floating-bar-color` token).

**PASS:** Both rows are visible, dotted vs solid distinction is clear on the newtab surface.
**FAIL:** Floating row missing the dotted bar on newtab (would indicate `_buildFloatingTabRow` did not append `.newtab-floating-bar`), OR the bar shape differs from the sidepanel.

**Validates:** AC1 (newtab parity).

---

## UAT-3 — Hover Save CTA appears on sidepanel floating row + click promotes

**Priority:** H — primary acceptance test for AC4 (hover CTA + `MSG_PROMOTE_TAB`).

**Setup:** Continue from UAT-1 (one floating tab spawned).

**Action:**
1. Move the mouse cursor over the floating row in the side panel.
2. Observe the right side of the row — a Save CTA (a `+` button) should appear (was hidden via `visibility: hidden` + `opacity: 0` until hover).
3. Click the Save CTA.

**Expected result:**
- Save CTA appears on hover (instant — no transition per AC11(c)).
- On click:
  - `MSG_PROMOTE_TAB` is dispatched (verifiable in SW console).
  - The floating row converts to a saved-bookmark row in-place.
  - The dotted bar is replaced by a solid live bar (the tab is now claimed by the new saved item).
  - The Save CTA disappears (no longer a floating row).

**PASS:** All four sub-results match.
**FAIL:** CTA does not appear on hover, OR click does not fire `MSG_PROMOTE_TAB`, OR the row does not convert to a saved row.

**Validates:** AC4 (hover CTA + `MSG_PROMOTE_TAB` dispatch + post-promote re-render).

---

## UAT-4 — Hover Save CTA on newtab floating row

**Priority:** H — newtab equivalent of UAT-3.

**Setup:**
1. Repeat UAT-1 setup so a fresh floating tab is spawned (or close + re-spawn if UAT-3 promoted yours away).
2. Open a new tab (Ctrl+T) → newtab page.
3. Locate the floating row under Parent A.

**Action:**
1. Hover over the newtab floating row.
2. Observe the right side — Save CTA (`+` button) should appear adjacent to the existing close (`×`) button.
3. Click the Save CTA.

**Expected result:**
- Save CTA appears on hover.
- On click: floating row converts to saved row in-place; dotted bar becomes solid.
- No SW errors.

**PASS:** Same as UAT-3 but on newtab.
**FAIL:** CTA missing, OR click silently does nothing (with no SW error logged), OR row does not convert.

**Validates:** AC4 (cross-surface CTA parity).

---

## UAT-5 — Save CTA error path (sidepanel): ERR_DUPLICATE_URL toast

**Priority:** H — confirms specific error handling per [code-reviewer] M-1 fix-round (ERR_DUPLICATE_URL is the realistic case since floating tab URLs CAN collide with another saved bookmark).

**Setup:**
1. Add two saved bookmarks in **different** groups:
   - **Parent A** in group "Work" → `https://example.com/`.
   - **Bookmark B** in group "Personal" → `https://example.org/`.
2. Click **Parent A** to open + auto-claim it.
3. From Parent A's tab, **Ctrl+click** an in-page link whose href is **`https://example.org/`** (the URL already saved as Bookmark B). The new floating tab spawns under Parent A in the **Work** group.

**Action:**
1. Confirm the floating row appears under Parent A in the Work group.
2. Hover over the floating row → Save CTA appears.
3. Click the Save CTA.

**Expected result:**
- A toast appears with text "A bookmark with this URL already exists" (per `_onFloatingSaveCtaClick` ERR_DUPLICATE_URL branch at `sidepanel.js:2994-2995`).
- The floating row remains (the SW rejected the promote; no new bookmark was created).

**PASS:** Toast text matches + floating row stays.
**FAIL:** No toast appears, OR a generic "Couldn't save tab" fallback fires (would indicate the error code mapping is broken), OR Bookmark B is duplicated despite the SW reject.

**WARN:** Toast text differs slightly from "A bookmark with this URL already exists" but the user is still informed.

**Validates:** AC4 error path + sidepanel-specific toast UX.

---

## UAT-6 — Save CTA error path (newtab) — silent-degrade verification

**Priority:** M — newtab silent-degrade was R2-sanctioned (§61.2.3 + [qa] M-1 deferred per Wave 3a). UAT confirms whether the silent UX is acceptable.

**Setup:** Same as UAT-5.

**Action:**
1. Open a newtab page (Ctrl+T) so the floating row is visible.
2. Click the Save CTA on the newtab floating row whose URL collides with Bookmark B.
3. Observe the page.

**Expected result (R2-sanctioned silent-degrade):**
- No toast appears (newtab does not have a toast surface today).
- The floating row remains (SW rejected the promote).
- No SW error logged (the rejection is caught silently in `_promoteFloatingTab`).

**PASS:** Silent-degrade observed AND user can readily recover (e.g., open the side panel and use the sidepanel CTA which surfaces the toast).
**FAIL:** Click produces a JavaScript error in the page console.
**WARN:** Silent-degrade is technically acceptable but the user perception is "the button did nothing" — record verbatim feedback for product-owner triage; do NOT fail the case based on UX preference alone (R2 sanctioned this).

**Validates:** AC4 newtab error UX (R2 §61.2.3 silent-degrade).

---

## UAT-7 — Keyboard reach to Save CTA (sidepanel + newtab)

**Priority:** H — confirms the `:focus-within` keyboard accessibility invariant per AC4 + qa-reviewer "UAT must explicitly walk #5".

**Setup:** Continue from UAT-1 (one floating tab spawned in side panel; one open in newtab).

**Action (sidepanel):**
1. In the side panel, click outside any row to clear focus.
2. Press **Tab** repeatedly until the floating row receives focus (visible focus ring on the row).
3. Observe whether the Save CTA becomes visible (via `:focus-within`).
4. Press **Tab** once more — focus should move to the Save CTA itself (visible focus ring on the `+`).
5. Press **Enter** — `MSG_PROMOTE_TAB` should dispatch.

**Action (newtab):**
1. Repeat steps 1–5 on the newtab surface against a fresh floating row.

**Expected result:**
- On row focus, Save CTA becomes visible (CSS `:focus-within` reveal).
- On CTA focus, the `+` is keyboard-focused (visible outline).
- Enter press dispatches `MSG_PROMOTE_TAB` and promotes the tab.

**PASS:** Both surfaces — Tab → Tab → Enter promotes the tab.
**FAIL:** CTA stays hidden when row has focus (would indicate the `:focus-within` rule is missing; CRITICAL accessibility regression).

**WARN:** Tab-key path requires more than 2 presses to reach the CTA from a clean focus state — record verbatim Tab count.

**Validates:** AC4 implicit keyboard accessibility + R2 §61.3.3 `:focus-within` invariant + [qa-reviewer] "UAT walk" #5.

---

## UAT-8 — ARIA label: screen-reader narration

**Priority:** H — primary acceptance test for AC3 (distinct ARIA).

**Setup:** Continue from UAT-1 (one floating tab in sidepanel; saved Parent A also in same group).

**Action:**
1. Enable a screen reader (Edge: Narrator via Win+Ctrl+Enter; or use Inspect Element → Accessibility tab to read the computed `aria-label`).
2. Focus the saved Parent A row.
3. Listen / read the announced label.
4. Focus the floating row.
5. Listen / read the announced label.

**Expected result:**
- Parent A row narration starts with the title and includes `"live tab"` (existing `buildItemRowAriaLabel` output).
- Floating row narration starts with `"floating tab — <title>"` and does NOT include `"live tab"` (per `_applyFloatingRowAriaLabel` per R2 §61.8).

**PASS:** Floating row narrates with `"floating tab — "` prefix; saved row narrates with `"live tab"` suffix.
**FAIL:** Floating row narrates with `"live tab"` (would indicate `buildOpenTabRow`'s default aria-label leaked through), OR `"floating tab"` prefix missing.

**Validates:** AC3 (distinct ARIA) + R2 §61.8.

---

## UAT-9 — Active+floating row state perception (per qa-reviewer L-7)

**Priority:** H — qa LOW L-7 flagged this for explicit UAT walk: when the active tab is a floating tab, the active state must remain perceivable despite the `border-left-color: transparent` override.

**Setup:**
1. Continue from UAT-1 (one floating tab spawned).
2. Click the floating tab in the browser tab strip so it is the **active** tab in its window.

**Action:**
1. Return to the side panel.
2. Locate the floating row — it should be both `data-floating="true"` AND `data-active="true"`.
3. Compare its appearance to (a) a non-active floating row (spawn another floating tab and switch focus to anything else), and (b) the active saved Parent A row (click the Parent A tab in browser).

**Expected result:**
- Active floating row shows the dotted bar AND a perceivable active-state cue (background tint or other non-border indicator), distinct from the non-active floating row.
- Active state is perceivable WITHOUT relying on the `border-left-color` (which is `transparent` for floating rows).

**PASS:** User can tell at a glance that the floating row is the active tab.
**FAIL:** Active floating row looks identical to a non-active floating row.

**Validates:** AC1 + qa-reviewer "UAT walk" #4.

---

## UAT-10 — 14-theme contrast sweep (qa-reviewer "UAT walk" #1 + AC6)

**Priority:** H — confirms the precomputed Dimension 1 + Dimension 2 contrast matrix in real Edge rendering.

**Setup:**
1. Continue from UAT-1 (one floating tab spawned, sidepanel open).
2. Open the toolbar popup → Settings → Theme picker.

**Action:** for each of the 14 themes (`system`, `github-light`, `github-dark`, `tomorrow`, `tomorrow-night`, `atom-one-light`, `atom-one-dark`, `solarized-light`, `solarized-dark`, `dracula`, `nord`, `one-dark`, `monokai`, `tokyo-night`):
1. Switch to the theme.
2. In the side panel, look at the floating row's dotted bar.
3. Verify the bar is visible (perceivable contrast) against the row background.
4. Hover over the floating row → Save CTA appears.
5. Verify the CTA's `+` glyph and background contrast is readable.

**Expected result (Dimension 1 — dotted-bar contrast):**
- 13/14 themes: dotted bar is clearly visible against the row background (≥ 3:1 ratio, AC6 / WCAG AA UI threshold).
- **`solarized-light`**: dotted bar contrast is 2.97:1 — *technically sub-AA*. This is a **pre-existing limitation** matching the saved-bookmark solid live-bar gap (`--live-indicator: #859900` vs `--bg-primary: #fdf6e3`). Per R2 §61.6.1 `ACCEPTED_LIMITATIONS`, this is documented and accepted.

**Expected result (Dimension 2 — Save CTA hover contrast):**
- All 14 themes: `+` glyph is readable on the `--bg-hover` background (≥ 4.5:1).

**PASS:** 13/14 themes visibly clear bars; solarized-light bar is barely-but-still-visible (acceptable per R2). All 14 themes show readable CTA.
**FAIL:** Any non-solarized-light theme has a dotted bar that visually disappears OR a CTA that is illegible.
**WARN:** solarized-light dotted bar is hard to see — **acceptable per R2 §61.6.1** (pre-existing limitation; same gap as the saved live-bar today).

**Validates:** AC1 + AC6 (WCAG AA matrix) + [qa-reviewer] "UAT walk" #1.

---

## UAT-11 — Drift-skip invariant (R2 §61.7 + AC7d)

**Priority:** H — confirms floating tabs cannot enter drifted state (Q2 contract).

**Setup:**
1. Continue from UAT-1 (Parent A claimed; one floating tab spawned at, say, `https://example.com/some-link`).
2. Note the URL of the floating tab.

**Action:**
1. Click the floating tab in the browser tab strip to focus it.
2. Click into the address bar and navigate the floating tab to a **different URL** that does not match any saved bookmark — e.g., `https://example.org/`.
3. Wait ~1 second for `onUpdated` to fire `reevaluateTab`.
4. Return to the side panel.
5. Observe the floating row.

**Expected result:**
- Floating row shows the **dotted floating bar** (still floating).
- Floating row does NOT show a drift bar (no dotted amber/yellow bar on top of the green dotted bar).
- No `tj:drift` storage write fires (verifiable via SW console + `chrome.storage.local.get('tj:drift')`).

**PASS:** Floating row stays floating, no drift indicator appears.
**FAIL:** Drift indicator appears on the floating row (would indicate `detectDriftForTab`'s unclaimed-tab guard at `drift.js:31-34` was bypassed).

**Validates:** AC7d + R2 §61.7 (Q2 drift-skip invariant).

---

## UAT-12 — Newtab Save CTA + Close button adjacency (qa L-4)

**Priority:** M — qa-reviewer L-4 flagged that the Save CTA (`+`) and Close button (`×`) on newtab sit adjacently and look visually similar; keyboard arrow-key users could pick the wrong one.

**Setup:** Continue from UAT-1 + a newtab page open (UAT-2).

**Action:**
1. On the newtab page, hover over the floating row. Observe both the Save (`+`) and Close (`×`) buttons.
2. Tab into the row → press Tab to move to the first action button.
3. Note which button receives focus first (`+` or `×`).
4. Press Tab again → focus moves to the next button.
5. Press right-arrow or other navigation key, if applicable, to walk between the two buttons.

**Expected result:**
- The two buttons are visually distinct enough that the user can tell `+` from `×` at a glance — they should differ in glyph, color, or position spacing.
- Keyboard navigation between them is unambiguous (Tab moves linearly; the order is predictable).

**PASS:** Buttons are visually distinct + keyboard navigation is intuitive.
**FAIL:** User cannot tell `+` from `×` at a glance (buttons look identical), OR keyboard navigation is confusing (arrow keys do something unexpected).
**WARN:** Buttons are distinct visually but the order surprises the user — record the observed order.

**Validates:** [qa-reviewer] L-4 + AC4 newtab keyboard UX.

---

## UAT-13 — Patch path: floating row title change preserves new ARIA label

**Priority:** M — confirms `patchFloatingMembersSections` re-applies the `_applyFloatingRowAriaLabel` override when the underlying tab's title changes (per R2 §61.8).

**Setup:** Continue from UAT-1 (one floating tab spawned).

**Action:**
1. In the floating tab, navigate the page to a different URL that has a different `<title>` (e.g., from `https://example.com/` (title "Example Domain") to `https://example.org/` (title "Example Domain" — or pick a URL with a clearly different title like a Wikipedia article).
2. Wait ~1 second.
3. Inspect the floating row's `aria-label` (devtools → Accessibility tab, or read via `document.querySelector('[data-floating="true"]').getAttribute('aria-label')` in the sidepanel devtools console).

**Expected result:**
- `aria-label` updates to `"floating tab — <new title>"`.
- The label still does NOT contain `"live tab"`.

**PASS:** Label updated correctly with new title; still uses the floating prefix.
**FAIL:** Label retains the old title (patch path did not re-apply), OR label reverts to a `"live tab"` form (patch path bypassed `_applyFloatingRowAriaLabel`).

**Validates:** AC3 + R2 §61.8 patch-path re-application.

---

## Reporting

After running UAT, record results in `docs/SPRINT.md` "Completed This Sprint" → B-124 entry, in this format:

```
- UAT-1: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-2: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-3: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-4: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-5: PASS / FAIL / WARN / SKIP — <one-line note: which collide-URL was used>
- UAT-6: PASS / FAIL / WARN / SKIP — <one-line note: silent-degrade acceptable?>
- UAT-7: PASS / FAIL / WARN / SKIP — <one-line note: tab presses count>
- UAT-8: PASS / FAIL / WARN / SKIP — <one-line note: which screen reader>
- UAT-9: PASS / FAIL / WARN / SKIP — <one-line note: was active perceivable?>
- UAT-10: PASS / FAIL / WARN / SKIP — <one-line note per theme; flag any < 2.9:1>
- UAT-11: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-12: PASS / FAIL / WARN / SKIP — <one-line note: button order>
- UAT-13: PASS / FAIL / WARN / SKIP — <one-line note>
```

**Routing rules:**
- FAIL on UAT-1, UAT-2, UAT-3, UAT-4, UAT-5, UAT-7, or UAT-8 → route back to [frontend-engineer]; these are core acceptance gates for AC1/AC3/AC4/AC5.
- FAIL on UAT-9 (active+floating perception) → route back to [frontend-engineer] for `data-active`+`data-floating` source-order debugging.
- FAIL on UAT-10 for any non-solarized-light theme → route back to [frontend-engineer] for per-theme contrast remediation.
- FAIL on UAT-11 (drift-skip) → route back to [frontend-engineer] for `drift.js` unclaimed-tab guard verification.
- WARN on UAT-6 (newtab silent-degrade) → acceptable per R2 §61.2.3; record verbatim feedback for product-owner triage; not a blocker.
- WARN on UAT-10 solarized-light → acceptable per R2 §61.6.1 ACCEPTED_LIMITATIONS; not a blocker.

**Gate 3 (UAT Acceptance):** All 13 cases must reach PASS or acceptable WARN/SKIP for B-124 to pass Gate 3 and be marked done.
