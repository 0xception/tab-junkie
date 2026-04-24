# Sprint 28 — R4 Findings (Deduplicated)

Three-item sprint — B-035 Full M + B-046 Fast Track XS + B-082 Fast Track XS.

---

## B-082 — Popup "Open Side Panel" Button

### HIGH (fixed in-sprint)

| # | File:Line | Finding | Fix | Flagged by |
|---|-----------|---------|-----|------------|
| B-082-H1 | `popup/popup.js:459-520` (`_onKeyDown` Tab handler) | **AC3 broken — Tab cycle bypassed new button.** Tab trap cycled input↔result-rows only; `#popup-open-sidepanel-btn` never reached. Per S27 retro rubric: "deviates from spec + user-visible" = HIGH. | Include button as third stop in cycle. Forward: input → rows → button → input; Shift+Tab symmetric. Zero-rows edge case: input ↔ button. | code-reviewer H-1 |

### MEDIUM (fixed inline)

| # | File:Line | Finding | Fix | Flagged by |
|---|-----------|---------|-----|------------|
| B-082-M1 | `popup/popup.js:~893` | AC4 said "no explicit `window.close()` needed" but code calls it defensively. Spec/code mismatch. | Added inline comment explaining rationale (browser auto-collapse may not fire on outliers). | code-reviewer M-1 |
| B-082-M2 | `popup/popup.js` (click handler) | No rapid-click guard — multiple concurrent `sidePanel.open()` calls stack. | Added module-scope `_sidepanelOpening` guard with try/finally reset. | code-reviewer M-2 |

### LOW (fixed inline)

| # | File:Line | Finding | Fix | Flagged by |
|---|-----------|---------|-----|------------|
| B-082-L1 | `popup/popup.css:478-485` | Error message used hardcoded hex `#dc2626`/`#f87171` outside token system. | Added `--color-error` to `:root` + dark override; use `var(--color-error)`. | code-reviewer L-1 |

### Security Review
**Clean** — 0 CRITICAL / 0 HIGH / 0 MEDIUM / 2 LOW (informational). SEC-1..SEC-5 all PASS. No XSS (static text + `textContent`), no new permissions, no new message types, `role="alert"` + `aria-live="assertive"` on error element.

**Recommendation**: PROCEED to close.

---

## B-046 — Global Keyboard Shortcuts

### CRITICAL / HIGH
_None._

### MEDIUM (fixed inline)

| # | File:Line | Finding | Fix | Flagged by |
|---|-----------|---------|-----|------------|
| B-046-M1 | `docs/user-manual/keyboard-shortcuts.md:16` | AC8 required forward-compat note for 4-command cap; missing. | Added `> Browser limit` callout noting the 4-slot cap + current Tab Junkie usage. | code-reviewer M-1 |
| B-046-M2 | `docs/user-manual/keyboard-shortcuts.md:16` | "All three defaulted shortcuts" prose ambiguous with 4-row table. | Rephrased to "The three shortcuts with default keys (Alt+J, Alt+K, Alt+Shift+J)..." | code-reviewer M-2 |

### LOW (deferred)

| # | File:Line | Finding | Flagged by |
|---|-----------|---------|------------|
| B-046-L1 | Accessibility section | No cross-link to `accessibility.md`. Cosmetic consistency with sibling pages. | code-reviewer L-1 |
| B-046-L2 | Customization section | Edge listed first (consistent with user's actual browser per memory); sibling pages list Chrome first. Minor style delta. | code-reviewer L-2 |

**Recommendation**: PROCEED to close.

---

## B-035 — Standalone Window

### HIGH (fixed in-sprint)

| # | File:Line | Finding | Fix | Flagged by |
|---|-----------|---------|-----|------------|
| B-035-H1 | `background/service-worker.js:~114` (anchor fallback) | **Anchor fallback dropped `allWins[0]` per spec §41.4.1.** Shipped: `find(focused) || null`. Spec: `find(focused) || allWins[0] || null`. Rare edge case (all windows unfocused) → centering falls to browser default instead of a sensible fallback. S27 retro rubric: "deviates from spec skeleton + user-visible positioning" = HIGH. | Added `|| realWins[0]` fallback. | code-reviewer H-1, qa-reviewer M-1 (elevated to HIGH per rubric) |

### MEDIUM (fixed inline)

| # | File:Line | Finding | Fix | Flagged by |
|---|-----------|---------|-----|------------|
| B-035-M2 | `background/service-worker.js:~113` (anchor computation) | Anchor set didn't exclude popup-type windows — race where newly-created standalone becomes its own future centering anchor. | Added `realWins = allWins.filter((w) => w.type !== 'popup')` before anchor lookup. | qa-reviewer M-2 |

### LOW (fixed inline)

| # | File:Line | Finding | Fix | Flagged by |
|---|-----------|---------|-----|------------|
| B-035-L1 | `background/service-worker.js:~128` | `focused: true` placed AFTER conditional spread in `chrome.windows.create`. Spec skeleton has it before. | Reordered + collapsed conditional spreads to match R2 §41.4.1. | code-reviewer L-1 |
| B-035-L2 | `background/service-worker.js:~76` | Block comment cited D-1/D-2/D-3 but not D-4 (centering contract). | Updated to D-1/D-2/D-3/D-4. | code-reviewer L-2 |

### LOW (deferred)

| # | File:Line | Finding | Flagged by |
|---|-----------|---------|------------|
| B-035-DM-1 | `background/service-worker.js:111-114` | Two `chrome.windows.getAll` calls in sequence — could be collapsed to a single call. Architecturally clean as-is; candidate for S29 polish. | code-reviewer M-1 |
| B-035-L3 | `tests/b035-standalone-window.test.js` | Test file not yet committed — R5 deliverable. | qa-reviewer L-1 |
| B-035-L4 | `docs/UAT_B-035.md:307` (sign-off table) | UAT-6 (secondary monitor) skippable with no explicit SKIP-disposition in table. | qa-reviewer L-3 |

### Security Review
**Clean** — 0 findings at any severity. SEC-1..SEC-7 all PASS.
- **D-7 verified**: B-014 uses same `chrome.windows.*` APIs under same `"tabs"` manifest permission. No new permission needed.
- Static URL construction via `chrome.runtime.getURL` eliminates extension-origin injection vector.
- C-11 vacuously satisfied (no SW writes before focus-shift calls).
- `chrome.commands.onCommand` gated on specific command name — single user-initiated trigger path.

**Recommendation**: PROCEED to R5 after H-1 fix. ✅ Fix applied.

---

## Summary

**Total across 3 items**: 0 CRITICAL / 2 HIGH (both fixed) / 4 MEDIUM (all fixed inline) / 10+ LOW (some fixed inline, rest deferred)

**All ready for close/R5.** B-082 and B-046 ready for done status. B-035 proceeds to R5 test-engineer.

**Rubric effectiveness**: S27 retro rubric ("deviates from spec skeleton + user-visible" = HIGH) caught 2 HIGHs in S28 that would have been LOW/MEDIUM under the previous triage. Pattern holds: when spec skeleton + user-visible boundaries intersect, default to HIGH.
