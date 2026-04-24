# Sprint 27 — R4 Findings (Deduplicated)

Two-item sprint — B-087 (Fast Track XS, closed) + B-023 (Full L, in R4).

---

## B-087 — C-11 R2 Correctness Checklist Addition

### All severities
_None._ Code-reviewer walked A-1..A-4, B-1..B-3, C-1..C-2 — all PASS. 1-line CLAUDE.md insertion with correct precedent citation. CLOSED.

---

## B-023 — Group Jump Popup

### CRITICAL
_None._

### HIGH (must fix before R5)

| # | File:Line | Finding | Fix | Flagged by |
|---|-----------|---------|-----|------------|
| B-023-H1 | `popup/group-jump-popup.js:36-40, 215-237` | **`applyGroupPickerFilter` not imported — spec-mandated reuse contract violated.** R2 §40.2 table says "reused verbatim" from `shared/group-picker-core.js`. Actual R3 shipped an inline `_applyGroupListFilter` loop re-implementing the match predicate with result-cap early-exit. Functionally equivalent today but drift risk if the shared function evolves. | Import `applyGroupPickerFilter`; call as `applyGroupPickerFilter(_allRows, _query).slice(0, GROUP_RESULT_CAP)`; delete the inline loop body. | code-reviewer H-1 |
| B-023-H2 | `background/service-worker.js:57-74` | **SW `onCommand` listener uses `async` + `await` on `setPopup`/`openPopup` — deviates from R2 spec D-2 skeleton and risks un-restored `default_popup` on SW teardown.** Spec shows sync three-call pattern `setPopup → openPopup → setPopup`. R3 used async pipeline with `try/finally`. If SW is torn down between `openPopup` resolve and `finally` restore (rare but possible), `default_popup` stays pointed at `group-jump-popup.html` → toolbar click / Alt+J opens group-jump instead of B-022. User-visible regression of B-022. | Remove `async`. Use `.then().catch()...finally()` chaining OR keep all three calls synchronous (all three API methods are synchronous-returning; the await wasn't required). Pattern from qa-reviewer H-1: `chrome.action.openPopup().catch(err => console.warn(...)).finally(() => chrome.action.setPopup({popup: 'popup/popup.html'}))`. | qa-reviewer H-1 (code-reviewer M-1 elevated) |
| B-023-H3 | `docs/UAT_B-023.md:75-92` (UAT-3) | **UAT-3 expected behavior is stale — references D-6 "mode-toggle key" which R2 resolved as N/A** (D-1 chose separate popup surfaces, no in-B-022 mode-toggle exists). [test-engineer] would execute the old steps and mark FAIL on correct behavior, or PASS on wrong expectation. Test-plan defect. | Update UAT-3 to match D-6 resolution: "Press Alt+K inside B-022 popup → B-022 closes (browser dismissal on focus leave) → B-023 opens fresh via SW listener dispatch." | qa-reviewer H-2 |
| B-023-H4 | `docs/UAT_B-023.md:229-238` (UAT-10) | **UAT-10 missing sub-case (h): whitespace-only query.** AC19 has 8 sub-states (a)-(h); UAT-10 covers only (a)-(g). AC19(h) has zero UAT coverage → blocks Gate 3 UAT sign-off. | Add `UAT-10 (h)`: "Whitespace-only query → full group list shown; no empty-matches state." | qa-reviewer H-3 |
| B-023-H5 | `popup/group-jump-popup.js:508-517` (`_activateRow`) | **Live-tab navigation variant never used — opens second tab instead of focusing existing.** `MSG_NAVIGATE_TO_ITEM` always sent with `{itemId}` variant. R2 §40.2 specifies dual-variant per B-022 precedent: `{tabId, windowId}` when item has a live claim. `_liveStates` and `_windowMap` are loaded but never consulted. Functional regression vs B-022. | Before dispatch, check `_liveStates[row.item.id]?.live`. If live, send `{tabId: _liveStates[row.item.id].tabId, windowId: _windowMap[...]}` variant (match B-022's `_activateRow` pattern at `popup/popup.js`). | qa-reviewer M-4 (elevated to HIGH — functional regression from spec) |

### MEDIUM (fix if time permits)

| # | File:Line | Finding | Fix | Flagged by |
|---|-----------|---------|-----|------------|
| B-023-M1 | `popup/group-jump-popup.css:167-171` | Back button `#gj-back-btn:focus-visible` uses only `background-color` change as focus indicator. Contrast vs surrounding popup bg ≈ 1.15:1 — below WCAG AA 3:1 minimum for focus indicators. Keyboard users have inadequate indication. | Add `outline: 2px solid var(--color-accent); outline-offset: 1px` to `:focus-visible` rule (matches `#gj-crumb-root:focus-visible` pattern). | qa-reviewer M-1 |
| B-023-M2 | `popup/group-jump-popup.js:225-228` | `_applyGroupListFilter` empty-state mode assignment uses `lq === ''` guard but the correct guard is `_allRows.length === 0`. Today the branch is unreachable (match predicate returns true for empty query), but a future refactor could expose the wrong mode label. | Change to `_allRows.length === 0 ? 'empty-no-groups' : 'empty-matches'`. | qa-reviewer M-2, code-reviewer M-2 |
| B-023-M3 | `popup/group-jump-popup.html:47` + `popup/group-jump-popup.js` | `#gj-list` has static `aria-label="Groups"` in HTML. After drill-in, list shows bookmarks/sub-groups of the drilled group, but accessible name remains "Groups" — misleading to screen readers. | In `_enterDrillIn`/`_enterUngroupedDrillIn`, set `listEl.setAttribute('aria-label', 'Contents of ' + groupName)`. Restore to `'Groups'` on `_exitDrillIn`. | qa-reviewer M-3 |
| B-023-M4 | `popup/group-jump-popup.js:730-750` (`_pickerRowFromGroup`) | `_pickerRowFromGroup` re-iterates all `_items` per sub-group row build in drill-in. O(subgroups × items). Within supported bounds (≤500 items, depth-1) perf is fine, but duplicates work `buildGroupPickerRows` already did at popup open. | Pre-compute `savedByGroup` + `openByGroup` Maps once in `_enterDrillIn`, reuse across rows. OR lookup counts from `_allRows` by sub-group id. | code-reviewer M-3, security-reviewer M-1 |

### LOW (defer)

| # | File:Line | Finding | Flagged by |
|---|-----------|---------|------------|
| B-023-L1 | `popup/group-jump-popup.js:351-359` | `_resetSelection` auto-selects first row on render — `aria-activedescendant` set before user nav. ARIA-pattern guidance suggests empty until user ArrowDown. | qa-reviewer L-1 |
| B-023-L2 | `popup/group-jump-popup.css:495-515` (`.qs-skeleton`) | Skeleton overlay has no visible shimmer — just solid bg. Slow SW cold-start shows blank popup briefly. | qa-reviewer L-2 |
| B-023-L3 | `docs/UAT_B-023.md:236` (UAT-15) | UAT-15 expects "re-fetch on SW cold-start" but popup has no re-fetch logic. Degrades gracefully; UAT text should say "no freeze, stale list OK" instead of "re-render". | qa-reviewer L-3 |
| B-023-L4 | `popup/group-jump-popup.css:458` | `#gj-empty { pointer-events: none }` would block future CTA buttons if added. Document in code comment for future contributors. | qa-reviewer L-4 |
| B-023-L5 | `background/service-worker.js:64,71` | `console.warn` on openPopup failure — intentional per spec but borderline against "no console noise" rule. Flag for policy clarification. | code-reviewer L-2 |
| B-023-L6 | `popup/group-jump-popup.css:448-451` | `#gj-empty` uses four-prop longhand instead of `inset: 0` shorthand from spec §40.5.8. Functionally identical. | code-reviewer L-3 |
| B-023-L7 | `popup/group-jump-popup.js:430-482` | "Tab focus trap cycles input ↔ selected row" — implementation never moves DOM focus off `#gj-input` (aria-activedescendant pattern correct). Clarify in §40.10 what "input ↔ selected row" means. | code-reviewer L-4 |

### Security Review

**Clean overall** — SEC-1 through SEC-10 all PASS. Key verifications:
- Zero manifest changes; zero new permissions
- XSS posture tight: all user text via `textContent` / `buildHighlightedText` DocumentFragment; no `innerHTML` with user content
- SW listener safe: command-name guard, idempotent on rapid re-trigger (modulo H-2 async fix)
- No new message types (R2 D-7 vacuously satisfied)
- DoS: input `maxlength="256"`, result cap 100, O(n) filter

---

## Disposition

- **Fix pre-R5 (HIGH)**: H-1, H-2, H-5 (code); H-3, H-4 (UAT text)
- **Fix in-sprint if time (MEDIUM)**: M-1, M-3 quick a11y wins; defer M-2 (unreachable branch), M-4 (perf hygiene) to S28 hygiene bundle
- **Deferred to S28+**: all LOW

**Recommendation from all 3 reviewers**: PROCEED after HIGH fixes.
