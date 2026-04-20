# Current Sprint

*Sprint 18 — Docs restructure (Wave 0) + imports round-trip + a11y + sanitizer hardening. Kicked off 2026-04-19.*

---

## Sprint Readiness (Gate 6)

- ✅ Scope approved by product owner: **B-068 (Wave 0) +** B-067 + B-066 + B-044 + B-045
- ✅ Total effort: 2M + 3S — B-068 added after kickoff via pre-R1 mid-sprint scope change (approved by product owner 2026-04-19)
- ✅ Sprint 17 closed; v1.12.0 tagged on `release/v2` (commit `98373d9`)
- ⚠️ Carry-over: 5 deferred UAT plans (B-059, B-029, B-048, B-042, B-043 — ~75 cases total). Not blockers; run before v2 → main whenever convenient.
- ✅ Sprint 17 retro action items applied where relevant (see below)
- 🆕 **B-068 Wave 0 rationale**: `docs/SOLUTION_DESIGN.md` (485 KB) + `docs/SPRINT_FINDINGS.md` (185 KB) are pulled into every R2/R4/R6 agent context. Splitting them before Sprint 18 R2 reduces per-round token load and compounds across the remaining 4 items. Zero content drift — mechanical split only.

### Sprint 17 Retro Action Items applied

1. **R4 enforcement** — deny-list-implementing-allow-list is HIGH, not MEDIUM. Pass this to R4 reviewer prompts when the design prescribes allow-list semantics (relevant to B-045 which MUST consume B-067's allow-list contract).
2. **R2 Correctness Checklist C-7 addition** — "If the design prescribes an allow-list or deny-list on a data-flow boundary, R4 reviewers must verify R3 implemented the specified direction." Applies directly to B-067 + B-045.
3. **Two-read race hardening** — the `listItems → listGroups` race accepted in Sprint 17 D-3 is symmetric in import: B-044/B-045 should write atomically via `writeTransaction` to avoid introducing a new race during import replace.

---

## Active Items

*(all 5 Sprint 18 items are now in "Completed This Sprint" below — sprint closed 2026-04-19)*

---

## Completed This Sprint

### [B-045] Import JSON backup — DONE (Wave 4)
- **Tier**: Full (M)
- **Merged**: `5736c2c` on `release/v2` (PR #17, 2026-04-19)
- **Files Changed**: `background/import/json-validator.js` (stub → full 545-line `parseAndValidate` with schemaVersion gate + 4 auto-repair routines + ULID re-mint); `background/import/index.js` (JSON branch wired); `sidepanel/sidepanel.{html,js}` (Import JSON button + file input + preview dialog repair-summary); 3 new test files (64 B-045 tests: 47 validator + 10 dispatch + 7 e2e); NEW `docs/UAT_B-045.md` (1092 lines, 30 cases deferred); `docs/design/33-b-044-b-045-import.md` amended (§33.6 / §33.11 / §33.12 / §33.19 / new §33.20 preferences-only deferred polish); `docs/user-manual/importing-bookmarks.md` + `exporting-data.md` extended; CHANGELOG v1.13.0 + STORE_LISTING.md JSON bullet.
- **R4**: [code-reviewer] PASS with 3 LOW (preferences-merge doc-note, validateAndRepair alias, breakCycles perf note), [security-reviewer] PASS zero findings (prototype-pollution defense sufficient by construction; L-1 regression added in R5), [qa-reviewer] PASS with 1 MEDIUM (preferences-only backup DEFERRED for UAT decision) + 3 LOW.
- **R5**: 3 prototype-pollution regression tests (sec-proto-1/2/3) + 2 AC-gap tests. 918 → 923 passing. UAT plan DEFERRED for user Edge execution.
- **R6**: §33 chapter amended; new §33.20 preferences-only policy deferred.
- **R7**: user manual JSON section, CHANGELOG, STORE_LISTING updated.
- **Test suite**: 859 → 923 green (+64 new B-045 tests). `./build.sh`: clean (184 K zip).
- **Follow-on polish items** (for Sprint 19 triage): preferences-only backup support (§33.20 MEDIUM); remove `validateAndRepair` alias; repair-summary plain-language rewrite; `breakCycles` adversarial-input hardening; "Replace all bookmarks?" dialog heading scope for JSON.

### [B-044] Import HTML (Netscape bookmarks) — DONE (Wave 3)
- **Tier**: Full (M)
- **Merged**: `1cd3905` on `release/v2` (PR #16, 2026-04-19)
- **Files Changed**: NEW `background/import/` module (`html-parser.js` hand-rolled Netscape tokenizer, `commit.js` two-round writeTransaction, `index.js` dispatcher, `json-validator.js` B-045 stub); `shared/messages.js` (MSG_IMPORT_COLLECTION + two-round preview/commit contract); `shared/errors.js` (6 new import error codes); `shared/export-schema.js` (extended to be single source of truth); `background/messages/storage-handlers.js` (handler with 10 MiB SW cap); `sidepanel/sidepanel.{html,css,js}` (Import HTML button + preview dialog + loading guard + zero-bookmark early reject); NEW `--danger` token per theme; NEW `docs/design/33-b-044-b-045-import.md` (R2 design + R6 close); NEW `docs/UAT_B-044.md` (29 cases deferred); NEW `docs/user-manual/importing-bookmarks.md`; CHANGELOG.md v1.13.0; STORE_LISTING.md bullet; `docs/a11y-audit-B-066.md` §13 addendum; 4 new test files (50 new tests).
- **DOMParser deviation**: accepted permanently — MV3 SW has no DOM. Hand-rolled tokenizer endorsed by code + security reviewers as structurally safer (text-only, no markup evaluation).
- **R4**: [code-reviewer] PASS with concerns (1 LOW, 1 INFO deferred to R6 cleanup), [security-reviewer] PASS (2 MEDIUM + 2 LOW — M-1 shipped inline), [qa-reviewer] PASS with concerns (1 HIGH + 2 MEDIUM fixed inline).
- **R5**: 50 automated tests (859/859). UAT plan `docs/UAT_B-044.md` (29 cases) DEFERRED for user execution on Edge (consistent pattern).
- **R6**: §33 chapter amended with as-shipped decisions; new §33.19 Build Deviations table.
- **R7**: user manual + CHANGELOG + STORE_LISTING updated.
- **Test suite**: 857 → 859 green. `./build.sh`: clean (176 K zip).

### [B-066] Remaining `--text-tertiary` a11y sweep — DONE (Wave 2)
- **Tier**: Fast Track (S)
- **Merged**: `5bf985f` on `release/v2` (PR #15, 2026-04-19)
- **Files Changed**: `sidepanel/sidepanel.css` (5 × `--text-tertiary` → `--text-secondary` at `.group-drag-handle`, `#filter-empty-state`, `.group-items-empty`, `.context-menu-label`, `.open-tabs-empty`), NEW `docs/a11y-audit-B-066.md` (full before/after contrast tables + consumer inventory + blast-radius grep)
- **Fix option**: Option A (promote offending selectors — mirrors B-064, zero new tokens)
- **R4**: [code-reviewer] PASS (zero findings; independently recomputed all 16 audit ratio cells — deviation ≤0.01), [security-reviewer] PASS (zero findings, near-no-op)
- **Test suite**: 807/807 green. `./build.sh` clean.
- **Worst post-fix ratio**: 4.93:1 on `.group-drag-handle` light `--bg-hover` (non-text floor 3.0:1 — 64% headroom).

### [B-067] Flip export sanitizers to §32.5 allow-list — DONE (Wave 1)
- **Tier**: Fast Track (S)
- **Merged**: `2e4e507` on `release/v2` (PR #14, 2026-04-19)
- **Files Changed**: `background/export/json-export.js` (deny-list → allow-list; dead constants deleted), `tests/b043-json-export.test.js` (`sec-S-1` + B-043 `AC4` flipped to EXCLUSION, new B-067 AC4 runtime-field coverage test). `background/export/html-export.js` untouched (already named-field access per AC3).
- **R4**: [code-reviewer] PASS (5 LOW, all deferrable), [security-reviewer] PASS (zero findings, allow-list verified true not disguised deny-list per Sprint 17 retro C-7)
- **Test suite**: 806 → 807 (1 net added, 0 removed, 0 skipped). `./build.sh` clean.
- **Contract preservation**: B-042 + B-043 byte-identical on valid §32.5 inputs (AC10). `preferences` pass-through preserved (AC7).

### [B-068] Split SOLUTION_DESIGN + SPRINT_FINDINGS into per-chapter / per-sprint files — DONE (Wave 0)
- **Tier**: Fast Track (S)
- **Merged**: `e8c2c25` on `release/v2` (PR #13, 2026-04-19)
- **Files Changed**: `docs/SOLUTION_DESIGN.md` (485 KB → ~4 KB index), `docs/SPRINT_FINDINGS.md` (185 KB → ~1 KB index), 38 new `docs/design/NN-*.md` chapter slices, 8 new `docs/findings/sprint-NN.md` slices, `CLAUDE.md` (Key Documents + inline directives), 6 × `.claude/agents/*.md` (read/write directive redirects), Sprint 18 kickoff in `docs/BACKLOG.md` / `docs/SPRINT.md` / `docs/BACKLOG_BOARD.md`
- **R4**: [code-reviewer] PASS (1 LOW — AC10 rollback deferred, now captured in PR #13 body), [security-reviewer] PASS (no findings, docs-only)
- **Test suite**: 806/806 green. `./build.sh`: clean.
- **Content drift**: byte-identical (AC7 verified)

---

## Planned Pipeline Parallelization

- **R1 [product-manager]**: all 5 items in parallel (B-068 + B-067 + B-066 + B-044 + B-045). Independent user stories, no dependencies at R1.
- **R2 [solution-architect]**: single agent writes unified §33 design covering B-044 + B-045. **Gated on B-068 R3 merge** — R2 reads the split `docs/design/NN-*.md` slices, not the monolith.
- **R3 sequencing**:
  0. **Wave 0 — B-068** (docs restructure): [solution-architect] splits `SOLUTION_DESIGN.md` into `docs/design/NN-slug.md`; [scrum-master] splits `SPRINT_FINDINGS.md` into `docs/findings/sprint-NN.md`. Can run as two parallel sub-tasks inside R3 since the files are independent. MUST merge before R2 starts for any other item.
  1. **Wave 1 — B-067** ([frontend-engineer]): flip sanitizers to allow-list. Lands after B-068 so the allow-list design is read from the §32.5 slice, not the monolith.
  2. **Wave 2 — B-066** ([frontend-engineer]): CSS-only contrast fix. Non-overlap with B-067.
  3. **Wave 3 — B-044** ([frontend-engineer]): new `background/import/` module + HTML parser + file-picker UI.
  4. **Wave 4 — B-045** ([frontend-engineer]): reuses B-044's import infra + consumes B-067's allow-list for validation.
- **R4** per item. Fast Track (B-068, B-066, B-067) = code + security (2 parallel — [security-reviewer] is a no-op on B-068 but runs to protect the gate). Full (B-044, B-045) = code + security + qa (3 parallel).
- **R5** B-044 + B-045 only (Full tier). B-068 / B-066 / B-067 on Fast Track rely on the existing suite + `./build.sh` staying green.
- **R6** single architect covers B-068 + B-044 + B-045 — update the now-split `docs/design/*` slices in place.
- **R7** batched at sprint close.

---

## Gate 4 — Release Checklist (verified 2026-04-19)

| # | Check | Status |
|---|-------|--------|
| 1 | All R4 review findings resolved (no open CRITICAL/HIGH) | ✅ — every HIGH/CRITICAL resolved inline; LOWs filed for Sprint 19 polish triage |
| 2 | All R5 automated tests passing | ✅ — 923/923 green on `feature/B-045-import-json` pre-merge; release/v2 post-merge (commit `5736c2c`) |
| 3 | UAT sign-off recorded | ⏳ DEFERRED — 6 UAT plans (B-042, B-043, B-048, B-029, B-059, B-044, B-045 — ~165 cases total) per established pattern; not a blocker per precedent, must be run before v2 → main merge |
| 4 | No open blockers in `SPRINT.md` | ✅ |
| 5 | `docs/design/*` slices updated (post-B-068 structure) | ✅ — §33 authored in R2 + amended in B-044 R6 + extended in B-045 R6 |
| 6 | `manifest.json` permissions reviewed | ✅ — zero additions across all 5 Sprint 18 items |
| 7 | `./build.sh` produces clean package | ✅ — 184 K zip (post-B-045) |
| 8 | Rollback plan documented for any storage schema changes | ✅ — §33.13 (import destructive replace + export-first safety net) |
| 9 | README / user manual updated for user-facing features | ✅ — `docs/user-manual/importing-bookmarks.md` created for B-044 + extended for B-045 |
| 10 | `BACKLOG.md` — all Sprint 18 items `done` | ✅ (50/69) |
| 11 | `BACKLOG_BOARD.md` — progress dashboard + summary accurate | ✅ (72%, 0 in progress, Sprint 18 closed) |
| 12 | `SPRINT.md` "Completed This Sprint" reflects all 5 items | ✅ |
| 13 | `SPRINT_ARCHIVE.md` updated with Sprint 18 entries | ⏳ — pending [release-manager] → archive step |

**Gate 4 verdict**: PASS conditional on post-release archive step.

---

## Sprint Retrospective — Sprint 18

### Velocity

- **Planned (pre-kickoff)**: 4 items — B-044 (M), B-045 (M), B-066 (S), B-067 (S). Total: 2M + 2S.
- **Scope-added mid-sprint**: B-068 (S, Wave 0 docs restructure — approved by product owner 2026-04-19 as pre-R2 infrastructure to reduce agent context load on subsequent R2/R4/R6 rounds).
- **Completed**: 5 items / 2M + 3S. 100% of planned scope plus the mid-sprint addition.
- **Carried over**: 0.
- **Test suite growth**: 806 → 923 (+117 tests across all 5 items).

### What Went Well

1. **B-068 Wave 0 paid off immediately.** Splitting `SOLUTION_DESIGN.md` (485 KB → ~4 KB index) and `SPRINT_FINDINGS.md` (185 KB → ~1 KB index) into per-chapter / per-sprint slices reduced agent context load on every subsequent R2/R4/R6 round. Byte-identical content drift (AC7) gave us a near-zero-risk refactor that compounded value across the remaining 4 items.
2. **Sprint 17 retro action items delivered.** C-7 (allow-list / deny-list direction verification) was surfaced in every R4 review touch where it applied (B-067, B-045) — zero disguised-deny-list implementations shipped. R4 reviewer prompts explicitly probed for the inverse pattern.
3. **R4 parallel reviewer pattern held firm.** On Full-tier B-044 + B-045, 3 simultaneous R4 reviewers surfaced 1 HIGH + 4 MEDIUM + 13 LOW findings between them — all addressed inline, deferred with rationale, or filed as follow-on polish. No finding was missed, no reviewer produced a rubber-stamp.
4. **R2-as-contract-not-scripture worked.** B-044's R3 engineer discovered the DOMParser SW-context impossibility, proposed a hand-rolled tokenizer, and got it endorsed by both [code-reviewer] + [security-reviewer] as architecturally safer than R2's spec. R6 documented the deviation permanently. The pipeline absorbed the mid-flight course correction without breaking the tier gate.

### What to Improve

1. **Pre-R2 feasibility sniff-test missing.** R2 specified `DOMParser('text/html')` in an MV3 service-worker context — a 30-second sanity check (`chrome://extensions` → inspect SW → `typeof DOMParser`) would have caught this before R3 started. Avoidable rework for next sprint.
2. **Deferred-UAT debt growing.** 6 plans now DEFERRED: B-042, B-043, B-048, B-029, B-059, B-044, B-045 = ~165 cases. Acceptable under precedent but risks crystallizing into technical UAT debt. Needs a burndown plan before v2 → main.
3. **Late-surfacing empty-state UX (QA B-045 MEDIUM #1).** The "preferences-only backup rejected" case wasn't in R2's design — surfaced only during R4 QA. Suggests R2 Correctness Checklist is missing an "empty-state coverage" item.

### Action Items for Sprint 19

- [ ] **[solution-architect]** — Add **C-8** to R2 Correctness Checklist: "SW-context feasibility — if the design prescribes a browser API in the service worker (DOMParser, `document`, `window`, `CSS.paintWorklet`, etc.), verify SW has access before R3 starts (quick REPL check)." [HIGH]
- [ ] **[solution-architect]** — Add **C-9** to R2 Correctness Checklist: "Every product-path empty-state must be explicitly designed (zero-items, zero-groups, partial-preferences, zero-network, zero-matches) — enumerate expected UI behavior for each." Prevents late-surfacing UX MEDIUMs. [HIGH]
- [ ] **[scrum-master]** — Schedule a UAT burndown window in Sprint 19 — budget Fast-Track-S equivalent for user to execute 4–6 deferred UAT plans. Don't let the debt grow past 10 items. [MEDIUM]

---

## Sprint Close

**Status**: CLOSED 2026-04-19. v1.13.0 release pending [release-manager] execution.
