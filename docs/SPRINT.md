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

### [B-044] Import HTML (Netscape bookmarks)
- **Tier**: Full (M)
- **Status**: R2 (in progress)
- **Assigned To**: [solution-architect]
- **Blockers**: None (B-067 merged, allow-list contract locked)
- **Feature Context**: File-picker accepts `.html` / `.htm`. Count-preview dialog before commit. "Import replaces all existing data" warning with explicit confirmation. Folder hierarchy deeper than 1 level flattened safely.
- **Handoff Notes**: R1 pre-approved (skipped — comprehensive ACs in BACKLOG.md). R2 authors unified §33 design covering both B-044 + B-045 on `feature/B-044-import-html`. R2 writes a new chapter slice `docs/design/33-b-044-b-045-import.md` and extends root index. Post-R2, R3 implements B-044 only on this branch; B-045 branches off separately after B-044 merges (shared `background/import/` + `MSG_IMPORT_COLLECTION` contract stable by then).
- **R2 Correctness Checklist focus**: C-1 (no new storage partitions, imports use `writeTransaction` to replace atomically per Sprint 17 D-3 retro), C-2 (new `MSG_IMPORT_COLLECTION { format: 'html' | 'json' }` message), C-4 (imports MUST mint new ULIDs, not reuse any file-provided IDs), C-7 (B-045 consumes B-067 allow-list — direction verified). Performance AC: 1,000-bookmark HTML import completes < 3s in chrome-mock.

### [B-045] Import JSON backup
- **Tier**: Full (M)
- **Status**: R2 (in progress — covered by unified B-044 R2 pass)
- **Assigned To**: [solution-architect] (shared with B-044)
- **Blockers**: B-044 R3 (shared `background/import/` infrastructure must merge first)
- **Feature Context**: Consumes `schemaVersion: 1` (the frozen §32.5 shape). Validates and automatically repairs: orphaned sub-groups, circular references, duplicate IDs. Count-preview + confirmation mirror B-044. Repair decisions surfaced in post-import summary.
- **Handoff Notes**: R1 pre-approved. R2 covered by B-044's unified pass (single §33 chapter). After B-044 merges, B-045 branches as `feature/B-045-import-json` for R3–R7 on its own. The `schemaVersion` gate: if the imported file's version is unknown, reject with a clear error ("backup was created in a newer Tab Junkie version"). Consumes the §32.5 allow-list locked by B-067 (merged `2e4e507`).

---

## Completed This Sprint

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
