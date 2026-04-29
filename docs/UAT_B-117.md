# UAT — B-117 Group-Color WCAG AA Matrix Re-Verified

**Sprint:** 37
**Branch:** `feature/sprint-36-ui-polish` (continued — anchor item for S37)
**Spec:** `docs/design/57-b-117-gc-matrix-audit.md`
**Tier:** Full (M) — UAT mandatory per CLAUDE.md Gate 2
**R5 baseline:** `npm test` 1,641/1,641 passing; `node --test tests/b117-gc-matrix-audit.test.js` 137 tests in 136 ms.

Manual test cases against the unpacked extension loaded in **Edge** (Developer Mode → Load unpacked → repo root). Run **after** verifying the automated suite passes.

> **Edge gotcha (per user memory):** chrome:// URLs do not work in Edge. Use `edge://extensions` and `edge://serviceworker-internals` equivalents. To force-reload the extension after CSS changes, toggle the extension OFF then ON in `edge://extensions`.

| Symbol | Meaning |
|---|---|
| **PASS** | Observed behavior matches PASS criteria |
| **FAIL** | Observed behavior matches FAIL criteria; route back to [frontend-engineer] |
| **WARN** | Observed but documented R2 tradeoff (not a regression) |
| **SKIP** | Could not be exercised in this run; record reason |

**Setup that applies to every case below:**
1. Open the side panel.
2. Open Edge DevTools on the side panel: right-click inside the panel → Inspect.
3. Locate the theme switcher (Settings or theme dropdown — whatever surface ships in S37).
4. Have at least 3 groups in the active collection so group-header tinting is exercised. If groups don't exist, create three — name them anything (e.g., "Reading", "Work", "Reference") and assign each a distinct color slot.

---

## UAT-1 — WCAG AA spot-check via DevTools (atom-one-dark / yellow)

**Priority:** H — primary acceptance test for AC1 + AC4. Validates the §57.3.1 7%-tint pathway-(b) decision via a live measurement.

**Setup:**
1. Switch the active theme to **atom-one-dark**.
2. Create or pick a group whose color slot is **yellow**.
3. Confirm the group header is rendered with the yellow tint applied.

**Action:**
1. Open Edge DevTools → Elements panel.
2. Inspect the group header element (the row that shows the group name).
3. In the Styles panel, locate the computed `background-color` swatch on the row's background layer (the tinted layer; not the base `--bg-secondary`).
4. Click the color swatch — Edge DevTools opens its color picker with a **Contrast ratio** readout vs the foreground color (`--text-primary`).
5. Record the displayed ratio.

**Expected result:** Contrast ratio ≥ **4.5:1**, ideally near **4.639:1** per §57.3.1 / §57.2 reference matrix.

**PASS criterion:** Ratio ≥ 4.5:1; the AA checkmark appears in DevTools.
**FAIL criterion:** Ratio < 4.5:1 — the §57.3.1 pathway-(b) decision did not ship correctly.
**WARN criterion:** Ratio between 4.5:1 and 4.55:1 — within tolerance but extremely close to the floor; flag for follow-up.

**Validates:** AC1 (matrix-passing assertion against live tokens) + AC4 (atom-one-dark tint correction shipped).

---

## UAT-2 — Group differentiation at 7% tint (atom-one-dark) — addresses [qa-reviewer] MEDIUM

**Priority:** H — addresses [qa-reviewer] MEDIUM finding. Validates that the visual identity contract from B-104/B-114 still holds at the new (lower) tint values.

**Context:** The B-117 R3 build dropped atom-one-dark / one-dark / legacy `dark` from 20% → **7%** tint. [qa-reviewer] flagged this as a 13-percentage-point reduction in group-header saturation, which could collapse the visual distinction between groups OR between groups and ungrouped items if taken too far. This UAT case verifies the user-facing contract holds.

**Setup:**
1. Switch the active theme to **atom-one-dark**.
2. Create exactly three groups, each with a distinct color slot:
   - Group A → **red**
   - Group B → **blue**
   - Group C → **green** (use the closest available slot — `teal` if `green` isn't a slot name).
3. Open the side panel and verify all three group headers are visible alongside at least one ungrouped item.

**Action:**
1. View the side panel at normal viewing distance (no zoom-in).
2. **Glance test:** at-a-glance, can you identify which group is which from header tint alone (cover the group name with a finger / sticky)?
3. **Distinction test:** can you tell the group headers apart from each other AND from the ungrouped item row?
4. Repeat with a 5-second look-away then look-back.

**Expected result:** All three group tints remain visually distinguishable from each other AND from the ungrouped item background. The 7% tint is subtle but the hue identity (red vs blue vs teal) survives.

**PASS criterion:** Tester can correctly identify each group by tint alone in the glance test, AND tints are visibly distinct from the ungrouped row.
**FAIL criterion:** Two or more group tints visually merge into a single muted band, OR the group tint is indistinguishable from the ungrouped row background.
**WARN criterion:** Tints distinguish but feel too subtle for the tester's preference — record as feedback for product, not a regression (the 7% tint is the WCAG AA ceiling per §57.3.1; lifting it would FAIL UAT-1).

**Validates:** [qa-reviewer] MEDIUM finding — visual identity contract from B-104 §47.3 D-1 + B-114 holds at 7% tint.

---

## UAT-3 — Group differentiation at 7% tint (one-dark)

**Priority:** H — same MEDIUM-finding coverage as UAT-2 but for the one-dark theme (which shares atom-one-dark's palette per §57.3.1).

**Setup:**
1. Switch to **one-dark**.
2. Reuse the same three groups (red / blue / teal) from UAT-2.

**Action:** Repeat UAT-2 steps 1–4.

**Expected result:** Same as UAT-2. one-dark and atom-one-dark share `--bg-secondary` (#21252b) and the same `--gc-*` palette (B-104 D-1), so visual behavior should be identical.

**PASS / FAIL / WARN:** Same criteria as UAT-2.

**Validates:** §57.3.1 atom-one-dark/one-dark unified pathway shipped consistently.

---

## UAT-4 — Group differentiation at 17% tint (dracula)

**Priority:** H — validates the §57.3.3 dracula 20% → 17% tint correction. Smaller delta (3 pp) than atom-one-dark, so group tints should still feel "punchy" but yellow is now AA-compliant.

**Setup:**
1. Switch to **dracula**.
2. Reuse the same three groups, but ensure one is **yellow** (the original FAIL slot per §57.2.3 row 26).

**Action:**
1. Glance test (same as UAT-2 step 2).
2. Specifically verify the yellow group header reads as yellow (not faded to off-white).
3. Compare visual tint intensity to UAT-2 (atom-one-dark @ 7%) — dracula @ 17% should feel noticeably more saturated.

**Expected result:** Yellow group header retains yellow identity AND is distinguishable from the ungrouped row. Tint intensity is a clear step above atom-one-dark.

**PASS criterion:** Yellow reads as yellow + groups are distinguishable.
**FAIL criterion:** Yellow merges with `--bg-secondary` OR appears white/grey at 17%.
**WARN criterion:** Yellow distinguishes but tester prefers 20% — record as feedback (20% would FAIL the matrix audit per §57.3.3).

**Validates:** AC4 dracula tint correction shipped.

---

## UAT-5 — Solarized-dark accept-as-limitation visual check

**Priority:** H — validates §57.3.2 pathway-(c) acceptance. The user-manual disclosure (R7 deliverable) must accurately describe what the user sees.

**Setup:**
1. Switch to **solarized-dark**.
2. Create groups exercising as many of the 9 color slots as practical — minimum 4 distinct slots (blue, yellow, red, slate suggested for breadth).
3. Confirm the side panel renders all groups with their tints.

**Action:**
1. Visually inspect each tinted group header.
2. Confirm all 4+ slots produce visible (not invisible / not white-on-white) tints.
3. Open Edge DevTools color contrast picker on one slot (e.g., blue) and confirm the ratio is sub-AA but in the **3.0–4.4** band (per §57.2.3 rows 17–25).
4. If R7 has shipped `docs/user-manual/themes.md` with the "Theme accessibility limitations" subsection: read it and verify it accurately describes what UAT-5's tester is seeing.

**Expected result:** Group colors are visible and distinguishable; DevTools contrast readout confirms sub-AA; user-manual disclosure (if shipped) matches observed behavior.

**PASS criterion:**
- Tints visible and slot-distinct.
- DevTools ratio falls in the 3.0–4.4 range (matches §57.2.3).
- IF user-manual disclosure is shipped: prose matches observed behavior.

**FAIL criterion:**
- Slot tints invisible (visually identical to ungrouped row), OR
- DevTools ratio above 4.5 (allow-list now stale; test should flag this), OR
- IF user-manual disclosure is shipped: prose diverges from observed behavior.

**WARN criterion:** User-manual disclosure not yet shipped — mark as WARN and re-test post-R7.

**Validates:** §57.3.2 pathway-(c) accept-as-limitation; R7 user-manual disclosure accuracy (when shipped).

---

## UAT-6 — Other dark themes still PASS at 20% tint

**Priority:** M — regression check for dark themes that were NOT modified (per §57.4.6). Confirms no collateral damage.

**Setup:** Spot-check at least three of the unmodified dark themes:
- **github-dark** — worst slot yellow, expected ratio 9.749:1
- **monokai** — worst slot yellow, expected ratio 10.445:1
- **tokyo-night** — worst slot yellow, expected ratio 7.370:1

**Action:** For each theme:
1. Switch theme.
2. Create / reuse a group with the **yellow** slot.
3. Use Edge DevTools color contrast picker → record the ratio.

**Expected result:** Each theme's yellow slot shows ratio ≥ 4.5:1 — well above the floor (5.9–10.4 range per §57.2.2).

**PASS criterion:** All three themes' yellow slots ≥ 4.5:1.
**FAIL criterion:** Any theme's yellow slot < 4.5:1 — would indicate the §57.4.6 "no other token changes" promise was violated.

**Validates:** AC4 + §57.4.6 — only the 4 declared themes (atom-one-dark, one-dark, legacy `dark` alias, dracula) were modified.

---

## UAT-7 — Light themes unchanged (visual stability)

**Priority:** M — validates §57.4.6 "All 5 light themes: NO changes" promise. Visual A/B against pre-B-117 expectation.

**Setup:** No special setup beyond the global UAT setup.

**Action:** For each of the following themes, switch and visually inspect group-header tinting:
1. **github-light**
2. **tomorrow**
3. **atom-one-light**

**Expected result:** Group-header tints look identical to the pre-S37 v1.30.0 behavior (the tester's memory / a screenshot if available). Tints feel "moderate" — neither over- nor under-saturated.

**PASS criterion:** No perceptible change vs pre-B-117 light-theme appearance.
**FAIL criterion:** Tints darker, lighter, or hue-shifted from pre-B-117 baseline.
**SKIP criterion:** Tester has no pre-B-117 visual reference (mark SKIP; rely on automated matrix tests for this surface).

**Validates:** §57.4.6 light-theme stability promise.

---

## UAT-8 — Solarized-light unchanged at 3% tint

**Priority:** M — validates that solarized-light (B-105 owner) was preserved untouched. Tied to AC11(d) — solarized-light test files locked.

**Setup:**
1. Switch to **solarized-light**.
2. Create / reuse three groups with distinct slots (red, blue, slate suggested).

**Action:**
1. Visually inspect group-header tinting — should appear **very subtle** (3% per B-105).
2. Open Edge DevTools → inspect the group header → check the computed CSS for `--group-header-tint-amount` is **3%**.
3. Use DevTools color contrast picker on the worst-case slot (red) — expected 4.564:1 per §57.2.1.

**Expected result:** Tint at 3%; red slot at 4.564:1; visual appearance unchanged from v1.30.0.

**PASS criterion:** `--group-header-tint-amount: 3%` in computed styles; ratio ≥ 4.5:1 on red slot.
**FAIL criterion:** Tint != 3%, OR ratio < 4.5:1 on red.

**Validates:** AC11(d) — `tests/b105-solarized-light-contrast.test.js` and the underlying token values were not touched by B-117.

---

## UAT-9 — Theme switching does not flicker

**Priority:** M — guards against a runtime regression introduced by the 4 token-value changes. CSS-only changes should be tear-free.

**Setup:** No special setup.

**Action:**
1. From the theme switcher, rapidly switch through this sequence with ~1 second between each: **atom-one-dark → dracula → one-dark → atom-one-dark → solarized-light → atom-one-dark**.
2. Watch group headers during each transition.
3. Record any flicker, ghosting, stale tint, or layout shift.

**Expected result:** Each theme switch produces an instant, clean repaint. No mid-transition flash of the prior theme's tint, no white-flash, no reflow jitter.

**PASS criterion:** No visible flicker / ghosting / stale tint / layout shift across all transitions.
**FAIL criterion:** Any visible flicker, mid-transition stale tint, or jitter — indicates a render-pipeline regression.

**Validates:** R3 runtime behavior — token-value-only changes should not introduce render thrash.

---

## UAT-10 — Drift detection + bookmark integrity unaffected

**Priority:** H — guards against any unrelated regression. B-117 is CSS-only per §57.7 C-1/C-2/C-3 (all N/A), so storage / SW / message-passing should be untouched.

**Setup:** Pre-existing bookmarks in the active collection (any quantity).

**Action:**
1. Open the side panel — confirm bookmarks load (no skeleton stuck, no error state).
2. Pick a saved bookmark with a known URL. Open it in Edge.
3. Navigate the opened tab to a different URL.
4. Return to the side panel — verify the drift indicator (dotted amber bar in the row's left gutter) appears on the affected item.
5. Switch theme to **atom-one-dark** — verify the drift indicator still renders correctly with the new tint values.
6. Switch theme to **dracula** — same check.
7. Close the live tab via the browser tab strip — verify drift / live state clears (per B-110 / S36 close behavior).

**Expected result:** All non-visual behavior unchanged. Drift indicator renders correctly across all themes (drift bar uses `--drifted-color`, not `--gc-*`, so it should be unaffected — but verify).

**PASS criterion:** Steps 1–7 all behave as documented.
**FAIL criterion:** Any step shows a regression — bookmark load failure, drift indicator missing/miscolored, or storage anomaly.

**Validates:** §57.7 C-1/C-2/C-3 N/A claims (no SW, storage, or message-passing impact).

---

## Reporting

After running UAT, record results in `docs/SPRINT.md` "Completed This Sprint" → B-117 entry, in this format:

```
- UAT-1: PASS / FAIL / WARN / SKIP — <one-line note with the recorded ratio>
- UAT-2: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-3: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-4: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-5: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-6: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-7: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-8: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-9: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-10: PASS / FAIL / WARN / SKIP — <one-line note>
```

**Routing rules:**
- FAIL on UAT-1, UAT-2, UAT-3, UAT-4, UAT-6, UAT-9, or UAT-10 → route back to [frontend-engineer].
- FAIL on UAT-5 or UAT-7 or UAT-8 → route back to [frontend-engineer] for token-value verification.
- WARN on UAT-1 (4.5–4.55:1 band) → record but do not block; flag for [solution-architect] R6 review.
- WARN on UAT-2 / UAT-3 / UAT-4 (subjective tint preference) → record as product feedback; not a regression.
- SKIP on UAT-7 (no pre-B-117 visual baseline) → acceptable; automated matrix tests cover this surface.
- WARN on UAT-5 (user-manual not shipped yet) → re-test post-R7.

**Gate 3 (UAT Acceptance):** All 10 cases must reach PASS or acceptable WARN/SKIP for B-117 to pass Gate 3.
