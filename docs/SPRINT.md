# Current Sprint

*Sprint 17 — data-portability exports + a11y contrast + tech-debt. Kicked off 2026-04-18. Closed 2026-04-18.*

---

## Active Items

*(none — all Sprint 17 items are done)*

---

## Completed This Sprint

### [B-065] Extract test-duplicated helpers to `shared/*` — ✅ done (Fast Track S)
- **Completed**: 2026-04-18
- **Files Changed**: `shared/aria-label.js` (new), `shared/group-picker-core.js` (new), `sidepanel/sidepanel.js`, `tests/b048-visual-states.test.js`, `tests/b029-group-picker.test.js`, `tests/b027-group-header-menu.test.js` (header deferral note only)
- **Pipeline**: R1 ✅ → R3 ✅ → R4 ([code-reviewer] 0C/0H/2M/3L, [security-reviewer] 0C/0H/0M/0L) → M-1 `matchesGroupPickerRow` added so filter predicate is single-sourced + M-2 comment + L-2 underscore aliases dropped → DONE
- **Notes**: Behavior-preserving refactor. B-027 `openGroupContextMenu` extraction deferred (DOM + state bound) with in-file comment.

### [B-064] Global `.item-url` tertiary-text contrast audit (WCAG AA) — ✅ done (Fast Track S)
- **Completed**: 2026-04-18
- **Files Changed**: `sidepanel/sidepanel.css` (3-line edit), `docs/a11y-audit-B-064.md` (new, 11 sections)
- **Pipeline**: R1 ✅ → R3 ✅ (Option A — promote `.item-url` default to `--text-secondary`) → R4 ([code-reviewer] 0C/0H/2M/2L, [security-reviewer] 0C/0H/0M/0L) → M-1/M-2 + L fix (B-066 filed as follow-on for remaining tertiary-text surfaces; audit annotated) → DONE
- **Notes**: Worst post-fix ratio 5.25:1 (AA ✅). Zero new tokens. Mirrors B-048's selected-row treatment.

### [B-042] Export to HTML (Netscape bookmarks) — ✅ done (Full M)
- **Completed**: 2026-04-18
- **Files Changed**: `shared/export-schema.js` (new), `background/export/shared.js` (new), `background/export/html-export.js` (new), `shared/messages.js`, `background/messages/storage-handlers.js`, `sidepanel/sidepanel.html`, `sidepanel/sidepanel.js`, `tests/b042-html-export.test.js` (new, 46 tests), `docs/UAT_B-042.md` (new, 14 cases)
- **Pipeline**: R1 ✅ → R2 ✅ (§32 added, 15 subsections; unified with B-043) → R3 ✅ → R4 ([code-reviewer] 0C/0H/3M/4L, [security-reviewer] 0C/0H/0M/0L, [qa-reviewer] 0C/**3H**/7M/7L) → R4 fix pass: H-1 orphan rescue (data-loss bug), H-2 perf timing test (6.22ms median vs 500ms budget), H-3 toast-copy literal, + 10 MEDIUM/LOW closed → R5 ✅ (+3 regression guards, UAT plan) → R6 ✅ (§32.16 appended) → R7 ✅ → DONE
- **Notes**: Orphan-item rescue (items whose `groupId` points to a deleted group render under "Ungrouped") sets the policy for any future export format. XSS-clean (`htmlEscape` + test probes), `<a download>` fallback means zero new manifest permissions.

### [B-043] Export to JSON backup — ✅ done (Full M)
- **Completed**: 2026-04-18
- **Files Changed**: `background/export/json-export.js` (new), `background/messages/storage-handlers.js`, `sidepanel/sidepanel.html`, `sidepanel/sidepanel.js`, `tests/b043-json-export.test.js` (new, ~39 tests), `docs/UAT_B-043.md` (new, 15 cases)
- **Pipeline**: R1 ✅ → R2 ✅ (covered by §32 alongside B-042) → R3 ✅ → R4 ([code-reviewer] 0C/0H/3M/4L, [security-reviewer] 0C/0H/2M/2L, [qa-reviewer] 0C/0H/6M/3L — all HIGHs from the B-042 QA pass pre-addressed) → R5 ✅ (+7 tests closing qa/sec MEDIUM gaps) → R6 ✅ (§32.16 appended with 4 architect rulings D-1..D-4) → R7 ✅ → DONE
- **Notes**: `schemaVersion: 1` is the frozen B-045 import contract (see `shared/export-schema.js`). Deterministic byte-identical output (verified by permutation test). Round-trip-safe. `preferences` present iff user has persisted a change.

---

## Gate 4 — Release Checklist

- ✅ All R4 review findings resolved (0 CRITICAL / 3 HIGH all fixed at B-042 R4 / 19 MEDIUM fixed or consciously deferred)
- ✅ All R5 automated tests passing — **806 / 0 fail** (baseline 721 → +85 new tests)
- ✅ UAT plans by [test-engineer]: `docs/UAT_B-042.md` (14 cases) + `docs/UAT_B-043.md` (15 cases)
- ✅ No open blockers in SPRINT.md
- ✅ `docs/SOLUTION_DESIGN.md` §32 + §32.16 populated (R2 design and R6 close)
- ✅ `manifest.json` permissions reviewed — zero additions this sprint
- ✅ Rollback plan documented — §32.12; all 4 items git-revert safe
- ✅ `CHANGELOG.md` + `STORE_LISTING.md` + `docs/user-manual/exporting-data.md` (new) + `docs/user-manual/accessibility.md` updated by [technical-writer]
- ✅ `BACKLOG.md` updated — all 4 items `done`; B-066 + B-067 filed as follow-ons
- ✅ `BACKLOG_BOARD.md` updated — progress 41 → 45 done (66%); in-progress 4 → 0
- ✅ `SPRINT.md` reflects all 4 items in "Completed This Sprint"
- ⏳ `SPRINT_ARCHIVE.md` appended — performed during archive step

---

## Gate 7 — Sprint Retrospective

### Velocity
- **Planned**: 4 items — B-042 (M) + B-043 (M) + B-064 (S) + B-065 (S)
- **Completed**: 4/4 items · total effort 2M + 2S ≈ 10 story points
- **Carried over**: 0

### What Went Well
- **Unified §32 design for paired exports (B-042 + B-043)** — sharing the R2 design + module layout + message contract meant R3 Wave 3 landed with infrastructure that Wave 4 could lean on directly. Worth repeating for B-044 + B-045 paired imports.
- **R4 caught a data-loss bug** — B-042 orphan-item drop was a real user-impacting defect found in qa review, not testing. Reinforces R4 reviewer value.
- **+85 tests across the sprint, zero regressions** — including the Sprint 15 retro action (real-dispatcher handler tests via `chrome.runtime.onMessage._listeners`) now embedded in B-042/B-043 suites.

### What to Improve
- **Deny-list runtime stripping is a recurring smell** — §32 specified an allow-list semantic, R3 built deny-list, R4 caught it but it shipped. B-067 filed to flip before B-045. **Action**: when an R2 design specifies allow-list, R4 should block on deny-list implementations instead of flagging MEDIUM.
- **Two-read race in export handler** — `listItems() → listGroups()` is a known benign window accepted at R6 (D-3). Orphan rescue handles the race, but a single-pass atomic read would be cleaner. Noted for a future hardening pass.
- **Test-copy-reproduction pattern** — B-065 resolved three specific instances, but B-042/B-043 tests STILL partially shim the dispatcher. Consider a Sprint 18+ "test-infrastructure" audit to identify remaining drift risk.

### Action Items for Next Sprint
- [ ] **B-066** filed — remaining `--text-tertiary` sweep (drag handle + 4 empty-state body texts). P1/S.
- [ ] **B-067** filed — allow-list flip for export sanitizers. MUST ship before B-045 to lock the import contract. P2/S.
- [ ] **Process — R4 enforcement**: deny-list implementations of allow-list designs are HIGH (blocking), not MEDIUM. Update R4 reviewer prompt template.
- [ ] **Process — R2 Correctness Checklist C-7 addition**: "If the design prescribes an allow-list or deny-list on a data-flow boundary, R4 reviewers must verify R3 implemented the specified direction."

---

## R4 Findings Log

See `docs/SPRINT_FINDINGS.md` → Sprint 17 sections. Final rollup:

| Item | Tier | Reviewers | C | H | M | L | Status |
|------|------|-----------|---|---|---|---|--------|
| B-065 | S | code + sec | 0 | 0 | 2 | 3 | ✅ MEDIUMs fixed (matchesGroupPickerRow wired, alias cleanup) |
| B-064 | S | code + sec | 0 | 0 | 2 | 2 | ✅ MEDIUMs addressed (B-066 filed; audit annotated) |
| B-042 | M | code + sec + qa | 0 | **3** | 10 | 11 | ✅ all HIGH + most MEDIUM fixed in R4 pass (+14 tests) |
| B-043 | M | code + sec + qa | 0 | 0 | 11 | 9 | ✅ HIGHs pre-addressed; MEDIUMs absorbed into R5 (+7 tests) |
| **TOTAL** | | | **0** | **3** | **25** | **25** | All HIGH resolved before R5 |

Zero CRITICAL findings. All HIGH fixes landed before R5 launched.

---

## Sprint Close Sequence Status

1. ✅ Gate 4 — release checklist verified
2. ✅ Gate 7 — retrospective written
3. ⏳ **RELEASE** — [release-manager] v1.12.0 pipeline (pending user approval on destructive steps)
4. ⏳ **ARCHIVE** — appended to `SPRINT_ARCHIVE.md` after release is tagged
