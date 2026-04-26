# Sprint 35 — R4 Findings (Deduplicated)

## B-100 (Delete-on-live UX redesign)

### CRITICAL — None

### HIGH — Must fix before R5

| # | File:line | Finding | Fix | Source |
|---|-----------|---------|-----|--------|
| H-1 | `sidepanel/sidepanel.js:3484-3512` vs `3612-3641` | DRY violation — delete dispatch logic duplicated near-verbatim across X-button click handler and keydown Delete branch. Future AC1/AC2 changes require parallel edits with no compile-time enforcement. | Extract `_dispatchRowDelete(row, itemId, triggerEl)` helper containing live/non-live branching; both call sites delegate to it. | code-reviewer |
| H-2 | `sidepanel/sidepanel.js:6222-6250` (Undo lambda) | Undo on item whose original group was deleted → silent failure, no recovery path. `MSG_CREATE_ITEM { groupId: <gone> }` triggers `assertGroupExists` ERR_NOT_FOUND in SW; `.catch` shows generic toast but bookmark is permanently gone. C-9 enumeration in §49.5 missed this case. | In Undo lambda, on `ERR_NOT_FOUND` for groupId, fall back to `groupId: null` (Ungrouped) and notify: "Bookmark restored to Ungrouped (original group was deleted)." | qa-reviewer |
| H-3 | `sidepanel/sidepanel.css:1295-1302` | `.context-menu-item--destructive` red `#dc2626` hardcoded — fails WCAG AA on dark themes (~3.1:1 on Tokyo Night `#1a1b26`, GitHub Dark `#0d1117`). B-100 is the first sprint to ship NEW usage of this destructive class for the "Delete bookmark" entry, elevating the pre-existing palette gap to a blocking issue. | Replace hardcoded `#dc2626` with `--color-destructive` CSS token defined per-theme in `shared/themes.css`. Dark themes use `#f87171` (~5.4:1). Hover bg `#fef2f2` becomes `--bg-destructive-hover`. | qa-reviewer |

### MEDIUM — Fix if time permits

| # | File:line | Finding | Fix | Source |
|---|-----------|---------|-----|--------|
| M-1 | `sidepanel/sidepanel.js:6222-6226` | `closeContextMenu()` fires unconditionally before null-item guard — deviates from R2 D-6 step ordering. | Move `closeContextMenu()` after the null guard. | code-reviewer |
| M-2 | `sidepanel/sidepanel.js:6222-6250` | Delete-then-fail-then-Undo creates duplicate bookmark (acknowledged R2 D-6 tradeoff but no test). | Track delete success in lambda; guard Undo dispatch behind `deleteOk` flag. OR add T5 regression test for the duplicate-on-failed-delete path. | qa-reviewer |
| M-3 | `sidepanel/sidepanel.js:3602-3645` | Delete keydown handler uses `e.target.closest()` but `document.activeElement` is checked for input-context guard. If they diverge (programmatic focus), guard could pass while target resolves unintended row. | Change `e.target.closest('.item-row')` to `document.activeElement?.closest('.item-row')`. | qa-reviewer |
| M-4 | `sidepanel/sidepanel.js:6212` X-button aria-label | Live items have aria-label "Delete bookmark" but action is now close-tab. WCAG 2.1 SC 4.1.2 name-role-value mismatch. §49.7 acknowledged as out-of-scope but should be a follow-up. | File follow-up backlog item for reactive aria-label flip (`aria-label="Close tab"` when `data-live="true"`, `aria-label="Delete bookmark"` otherwise). UAT marks as WARN. | qa-reviewer |
| M-5 | `sidepanel/sidepanel.js:3614` | Comment block at 3608-3611 says "INPUT/TEXTAREA/SELECT/contenteditable" but R2 D-5 pseudocode said "INPUT/TEXTAREA/contenteditable". Implementation is correctly stricter (`SELECT` included). Mismatch should be noted in R6 As-Built. | R6 documentation only. | code-reviewer |

### LOW — Defer

| # | File:line | Finding | Source |
|---|-----------|---------|--------|
| L-1 | `sidepanel/sidepanel.js:6239` | B-100 toast omits `durationMs` (correct, inherits B-099 6 s default); B-099 toast at line 6112 passes `durationMs: 6000` explicitly. Pre-existing inconsistency. | code-reviewer |
| L-2 | `sidepanel/sidepanel.js:6228` | `groupId: item.groupId ?? null` — `?? null` fallback redundant if `validateNewItem` accepts `undefined`. | code-reviewer |
| L-3 | `sidepanel/sidepanel.js:6223` | Context menu stays open ~10-30 ms before toast appears (waiting for `MSG_GET_ITEM`). Optimistic close pattern could improve perceived latency. | qa-reviewer |
| L-4 | `sidepanel/sidepanel.js:6224-6226` | Inline comment mismatch — `closeContextMenu()` already fired before null check. | qa-reviewer |
| L-5 | repo root `junkie-bookmarks.html` | Untracked user bookmark export (PII per CLAUDE.md). Not gitignored — `git add .` could commit it. | security-reviewer |

### Summary B-100 R4
- **0 CRITICAL / 3 HIGH / 5 MEDIUM / 5 LOW**
- **Verdict**: FIX-BEFORE-R5 (all 3 HIGHs require R3-fix)

---

## B-102 + B-103 (Cross-window demote + promote duplicate — shared diffAndPatch fix)

### CRITICAL — None

### HIGH — Must fix before R5

| # | File:line | Finding | Fix | Source |
|---|-----------|---------|-----|--------|
| H-1 | `sidepanel/sidepanel.js:5175` (`'patch'` branch) | `patchOpenTabsSection(_cachedOpenTabs)` called BEFORE `_itemById = new Map(...)` at line 5176. `patchOpenTabsSection` may read stale item metadata via `_itemById`. The `'noop'` branch call at 5136 has no `_itemById` rebuild and is clean. | Move the `'patch'` branch `patchOpenTabsSection` call to AFTER line 5176. Matches the safe ordering in `refetchAndPatchLiveState` (line 3054). | code-reviewer |

### MEDIUM — Fix if time permits

| # | File:line | Finding | Fix | Source |
|---|-----------|---------|-----|--------|
| M-1 | `sidepanel/sidepanel.js:5175` + `5183-5189` | Partial-patch abort path double-renders Open Tabs. `patchOpenTabsSection` called at 5175, then `renderAll` rebuilds it on the abort path → wasted work + brief flicker on large lists. | Move `patchOpenTabsSection` inside `if (allApplied)` block (alongside `_applyWindowMapToUI`) so it only fires on clean-patch path. **This combines naturally with H-1's fix.** | qa-reviewer |
| M-2 | `sidepanel/sidepanel.js:5128-5135 + 5165-5174` | Comment blocks (7+ lines) longer than R2 D-1 spec example (3 lines). Asymmetric with `WINDOW_MAP` branch. | Optional: condense to 3-line shape. | code-reviewer |

### LOW — Defer

| # | File:line | Finding | Source |
|---|-----------|---------|--------|
| L-1 | `sidepanel/sidepanel.js:5175` | DRY observation — two identical comment blocks at two call sites. R2 D-1 explicitly evaluated and rejected consolidation. | code-reviewer |
| L-2 | `sidepanel/sidepanel.js:5175` | `_itemById` ordering doc note. | qa-reviewer |
| L-3 | B-103 audible promote edge case — pre-existing timing gap unrelated to fix. | qa-reviewer |

### Summary B-102 + B-103 R4
- **0 CRITICAL / 1 HIGH / 2 MEDIUM / 3 LOW**
- **Verdict**: FIX-BEFORE-R5 (combined H-1 + M-1 fix is one ordering change)
- **B-103 inheritance**: same verdict applies

---

## B-105 (Solarized-light WCAG AA fix)

### CRITICAL — None
### HIGH — None
### MEDIUM
| # | File:line | Finding | Fix | Source |
|---|-----------|---------|-----|--------|
| M-1 | `shared/themes.css:308-309` | Silent AA-failure debt: `--group-count-text` aliases `--text-secondary` (`#657b83`) which is 3.636:1 on `--group-count-bg` (`#eee8d5`). No KNOWN comment in the file. | Add a `/* KNOWN: --group-count-text fails AA vs --group-count-bg on solarized-light — 3.636:1. Tracked: B-105 §52.6 Q1. */` comment at lines 308-309. | qa-reviewer |

### LOW
| # | File:line | Finding | Source |
|---|-----------|---------|--------|
| L-1 | `shared/themes.css:288` | Inline comment on `--text-primary` duplicates the multi-line block at lines 326-334. Drift risk. | code-reviewer |
| L-2 | `shared/themes.css:316` | Comment above `--gc-*` slots still references B-104 framing; should mention B-105 + 3% ceiling. | qa-reviewer |
| L-3 | `docs/design/52-b-105-solarized-light-fix.md:97` (R6 work) | §52.3 D-3 defers §45.7 factual error fix to R6. R6 should default to in-place correction. | qa-reviewer |

### Summary B-105 R4
- **0 CRITICAL / 0 HIGH / 1 MEDIUM / 3 LOW**
- **Verdict**: PROCEED (M-1 is pre-existing palette debt; can ship + add comment)

---

## B-106 (Group header tint brightness 12% → 18%)

### CRITICAL — None
### HIGH — None
### MEDIUM
| # | File:line | Finding | Fix | Source |
|---|-----------|---------|-----|--------|
| M-1 | `docs/design/47-b-104-themed-group-colors.md:370` | AC4 not fully satisfied — §47.7 table header still reads "12% color-mix approx" instead of "18%". The §47.5 annotation note disclaims the gap, but does not satisfy AC4. | Update line 370: `Tinted header bg (12% color-mix approx)` → `Tinted header bg (18% color-mix approx)`. | code-reviewer |

### LOW — None

### Summary B-106 R4
- **0 CRITICAL / 0 HIGH / 1 MEDIUM / 0 LOW**
- **Verdict**: PROCEED (M-1 is documentation-only single-word fix)

---

## Cross-item totals (Sprint 35 R4)

- **CRITICAL**: 0
- **HIGH**: 4 (3 in B-100 — DRY + Undo recovery + destructive red contrast; 1 in B-102/103 — patchOpenTabsSection ordering)
- **MEDIUM**: 9 (5 in B-100, 2 in B-102/103, 1 in B-105, 1 in B-106)
- **LOW**: 11

All HIGHs require R3-fix BEFORE R5.

**R3-fix plan**:
- B-100 R3-fix: addresses H-1 (extract helper), H-2 (Undo group-deleted recovery), H-3 (per-theme destructive token)
- B-102/103 R3-fix: addresses H-1 + qa M-1 in one ordering change (move call inside `if (allApplied)` AFTER `_itemById` rebuild)
- B-105: M-1 + L-2 inline (small CSS comment additions)
- B-106: M-1 inline (single-word doc edit)
