# Current Sprint

*Sprint 16 — a11y polish + group picker + state indicators. Kicked off 2026-04-18. Closed 2026-04-18.*

---

## Active Items

*(none — all Sprint 16 items are done)*

---

## Completed This Sprint

### [B-062] Dark-theme primary-button contrast audit (WCAG AA) — ✅ done (Fast Track S)
- **Completed**: 2026-04-18
- **Files Changed**: `sidepanel/sidepanel.css`, `docs/a11y-audit-B-062.md` (new)
- **Pipeline**: R1 ✅ → R3 ✅ (Option B `--on-accent` token) → R4 ([code-reviewer] 0C/0H/2M/2L, [security-reviewer] 0C/0H/0M/0L) → M-1 (`.empty-state-cta:hover`) + M-2 (window filter chip) absorbed inline → DONE
- **Notes**: New `--on-accent` token (light `#ffffff` / dark `#0a0f1a`) covers `.dialog-btn--primary`, `.dialog-btn--danger[data-variant="primary"]`, `.empty-state-cta:hover`, and window filter chip. Scope-creep: B-062 also pre-seeded `--selected-bg` / `--selected-border` for B-048 consumption; documented in audit §8.

### [B-063] Close context menu on side-panel blur — ✅ done (Fast Track S)
- **Completed**: 2026-04-18
- **Files Changed**: `sidepanel/sidepanel.js`, `tests/b063-blur-close.test.js` (new, 12 tests)
- **Pipeline**: R1 ✅ → R3 ✅ → R4 ([code-reviewer] 0C/0H/0M/3L, [security-reviewer] 0C/0H/0M/2L — both clean PASS) → DONE
- **Notes**: `window.blur` listener with `_contextMenuTriggerRow = null` guard before `closeContextMenu()`. `<select>` mitigation: none needed on Edge (option a accepted). B-035 forward-checklist filed for standalone-window coverage when that ships.

### [B-029] Group picker modal for move-to-group — ✅ done (Full M)
- **Completed**: 2026-04-18
- **Files Changed**: `sidepanel/sidepanel.js` (+343 net), `sidepanel/sidepanel.html` (+14), `sidepanel/sidepanel.css` (+72 net), `tests/b027-group-header-menu.test.js` (+138), `tests/b029-group-picker.test.js` (new, 720 lines + R4 + R5 additions = 60 cases), `docs/UAT_B-029.md` (new, 16 cases)
- **Pipeline**: R1 ✅ → R2 ✅ (§30 added, 13 subsections) → R3 ✅ → R4 ([code-reviewer] 0C/0H/2M/3L, [security-reviewer] 0C/0H/3M/5L, [qa-reviewer] 0C/**3H**/4M/5L) → R4 fix pass: H-1 real create dialog via `openGroupEditDialog(null)` + `openGroupCreateDialog` wrapper; H-2 `_refreshGroupPickerIfOpen` on `scope:'groups'` broadcast; H-3 `_translateMoveError` helper at 3 sites; plus 6 MEDIUMs fixed (+21 new tests) → R5 ✅ (11 more tests, 60 total dedicated B-029) → R6 ✅ (§30.14 appended) → R7 ✅ (tech-writer covered) → DONE
- **Notes**: New `openGroupPickerDialog` primitive replaces 3 ad-hoc `<select>` pickers (B-024, B-028, B-059) and adds "Move items out of group" to B-027's group-header menu.

### [B-048] Item visual states (live / active / drifted / audible / selected) — ✅ done (Full M)
- **Completed**: 2026-04-18
- **Files Changed**: `sidepanel/sidepanel.css` (+~56 net), `sidepanel/sidepanel.js` (+~90 net), `tests/b048-visual-states.test.js` (new, 25 → 40+ cases), `docs/a11y-audit-B-048.md` (new, 236 lines)
- **Pipeline**: R1 ✅ → R2 ✅ (§31 added, 14 subsections) → R3 ✅ → R4 ([code-reviewer] 0C/**1H**/4M/5L, [security-reviewer] 0C/0H/0M/0L, [qa-reviewer] 0C/0H/4M/5L) → R4 fix pass: H-1 dark-theme checkmark stroke (`%230a0f1a` on `--selected-border`, ≈10.7:1 AAA); M-1 `aria-hidden="true"` on `.item-select`; M-3 null guard; Q-M1 regression test; Q-M3 defensive `:focus-visible`; Q-M4 build-time `isSelected` (+2 tests) → R5 ✅ (+14 more tests) → R6 ✅ (§31.15 appended) → R7 ✅ → DONE
- **Notes**: `.item-select` child element replaces `::before` pseudo-checkmark. Single `aria-label` on row with concat order `active → live → drifted → audible → selected`. New `--active-bg-hover` token for active+hover distinction. Pre-existing `.item-url` tertiary contrast gap surfaced; **B-064** filed for Sprint 17.

---

## Gate 4 — Release Checklist

- ✅ All R4 review findings resolved (0 CRITICAL / 4 HIGH all fixed / 15 MEDIUM fixed or consciously deferred)
- ✅ All R5 automated tests passing — **721 / 0 fail** (baseline 605 → +116 new tests)
- ✅ UAT sign-off plans written by [test-engineer]: `docs/UAT_B-029.md` (16 cases), `docs/UAT_B-048.md` (14 cases)
- ✅ No open blockers in SPRINT.md
- ✅ `docs/SOLUTION_DESIGN.md` §30.14 + §31.15 populated by [solution-architect]
- ✅ `manifest.json` permissions reviewed — zero additions this sprint
- ✅ Rollback plan documented — §30.11 (B-029), §31.12 (B-048); all 4 items git-revert safe
- ✅ `CHANGELOG.md` + `STORE_LISTING.md` + `docs/user-manual/managing-items.md`, `open-tabs.md`, new `accessibility.md` updated by [technical-writer]
- ✅ `BACKLOG.md` updated — all 4 items `done`; B-064 filed as backlog follow-on
- ✅ `BACKLOG_BOARD.md` updated — progress 37 → 41 done (62%); in-progress 4 → 0
- ✅ `SPRINT.md` reflects all 4 items in "Completed This Sprint"
- ⏳ `SPRINT_ARCHIVE.md` appended — performed during archive step (final sequence entry)

---

## Gate 7 — Sprint Retrospective

### Velocity
- **Planned**: 4 items — B-062 (S) + B-063 (S) + B-029 (M) + B-048 (M)
- **Completed**: 4/4 items · total effort 2M + 2S ≈ 10 story points
- **Carried over**: 0

### What Went Well
- **Four-wave R3 sequencing worked**: B-063 → B-062 → B-029 → B-048 avoided sidepanel.js/css merge conflicts. Reviewers always saw a clean git-diff per item.
- **B-062 scope-creep for `--selected-*` + `--on-accent` tokens paid off**: pre-seeding B-048's tokens inside B-062's diff meant zero refactor churn when B-048 R3 landed.
- **R4 → R4-fix pattern from Sprint 15 repeated cleanly**: consolidated-fix passes (one per item) closed 4 HIGH + 15 MEDIUM findings in two focused agent runs.

### What to Improve
- **`aria-hidden` defaults bit us**: §31.5 prescribed `aria-hidden="false"` on the nested checkbox child, which R4 correctly flagged as a double-announcement bug. Default for nested state indicators inside a labelled row MUST be `true`.
- **Test-shim reproduction pattern is piling up false-green risk**: B-027, B-029, and B-048 all reproduce core helper logic inside test files. Three items now carry "extract to `shared/` core" tech-debt. Batch into a Sprint 17+ "shared-helpers sweep" item.
- **Cross-item token pre-seeding needs a handoff protocol**: B-062 pre-seeded `--selected-*`/`--on-accent` for B-048 without an explicit handshake. R4 [code-reviewer] flagged mid-sprint as scope-creep. Future R2 designs that consume sibling-item tokens should cite the sibling in §.7 and the sibling's R6 close cites the downstream consumer.

### Action Items for Next Sprint
- [ ] **B-064** filed — global `.item-url` tertiary contrast audit (P1, S) is now in the backlog for Sprint 17.
- [ ] **Process — R2 Correctness Checklist C-6**: "no double-announcement paths — nested state indicators inside a labelled row MUST default to `aria-hidden='true'`".
- [ ] **Tech-debt consolidation**: file one "shared-helpers sweep" item (XS or S) to extract `_buildItemRowAriaLabel`, `_buildGroupPickerRows`, `_applyGroupPickerFilter`, `_isUnsavableScheme` (already extracted), etc. into `shared/*` modules. Eliminates test-copy false-green risk.
- [ ] **Process — cross-item token pre-seeding handoff protocol**: document as part of [solution-architect] R2 checklist.

---

## R4 Findings Log

See `docs/SPRINT_FINDINGS.md` → Sprint 16 sections. Final rollup:

| Item | Tier | Reviewers | C | H | M | L | Status |
|------|------|-----------|---|---|---|---|--------|
| B-062 | S | code + sec | 0 | 0 | 2 | 2 | ✅ MEDIUMs absorbed inline |
| B-063 | S | code + sec | 0 | 0 | 0 | 5 | ✅ clean PASS |
| B-029 | M | code + sec + qa | 0 | **3** | 9 | 13 | ✅ all HIGH + most MEDIUM fixed in R4 pass |
| B-048 | M | code + sec + qa | 0 | **1** | 8 | 10 | ✅ HIGH + most MEDIUM fixed in R4 pass |
| **TOTAL** | | | **0** | **4** | **19** | **30** | All HIGH resolved; 19/19 MEDIUM fixed or consciously deferred |

Zero CRITICAL findings across all items. All HIGH findings resolved before R5.

---

## Sprint Close Sequence Status

1. ✅ Gate 4 — release checklist verified
2. ✅ Gate 7 — retrospective written
3. ⏳ **RELEASE** — [release-manager] to execute v1.11.0 pipeline next (pending user approval on destructive steps)
4. ⏳ **ARCHIVE** — appended to `SPRINT_ARCHIVE.md` after release is tagged
