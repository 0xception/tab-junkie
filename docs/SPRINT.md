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

### [B-068] Split SOLUTION_DESIGN + SPRINT_FINDINGS into per-chapter / per-sprint files
- **Tier**: Fast Track (S) — **Wave 0, blocks all other Sprint 18 R2**
- **Status**: R1 (pending)
- **Assigned To**: [product-manager]
- **Blockers**: None (but blocks Sprint 18 R2 for B-044 / B-045 until R3 of B-068 is merged)
- **Feature Context**: Mechanical split of the two monolith docs into per-chapter (`docs/design/NN-slug.md`) and per-sprint (`docs/findings/sprint-NN.md`) slices. Root files become index-only TOCs. `CLAUDE.md` Key Documents table + any agent guidance that reads the monoliths updated to point at the slices. Zero body-content drift.
- **Handoff Notes**: [product-manager] formalizes R1 ACs already seeded in `BACKLOG.md`. R3 execution split: [solution-architect] does SOLUTION_DESIGN split (they own it); [scrum-master] does SPRINT_FINDINGS split (I own it). Per Fast Track tier, R4 runs [code-reviewer] + [security-reviewer] — [security-reviewer] will be a no-op here (no code / no permissions / no network surface) but runs to protect the gate invariant. No R5 automated tests expected beyond the existing suite passing + `./build.sh` clean.

### [B-067] Flip export sanitizers to §32.5 allow-list
- **Tier**: Fast Track (S)
- **Status**: R1 (pending)
- **Assigned To**: [product-manager]
- **Blockers**: None (gates B-045 but lands in this sprint)
- **Feature Context**: Replace the deny-list strip (`ITEM_RUNTIME_FIELDS` / `GROUP_RUNTIME_FIELDS`) in `background/export/{html,json}-export.js` with an explicit allow-list derived from `docs/SOLUTION_DESIGN.md §32.5`. Locks the B-045 import contract semantically.
- **Handoff Notes**: Wave 1 of R3 — must land BEFORE B-045 so the reciprocal contract is stable. Flip the B-043 `sec-S-1: favIconUrl camelCase pass-through` pinned test to assert exclusion after the flip.

### [B-066] Remaining `--text-tertiary` a11y sweep
- **Tier**: Fast Track (S)
- **Status**: R1 (pending)
- **Assigned To**: [product-manager]
- **Blockers**: None
- **Feature Context**: Fix 5 remaining `--text-tertiary` consumers flagged by `docs/a11y-audit-B-064.md §7`: `.group-drag-handle` (non-text), `#filter-empty-state`, `.group-items-empty`, `.context-menu-label`, `.open-tabs-empty`.
- **Handoff Notes**: Publish `docs/a11y-audit-B-066.md` mirroring B-064's structure.

### [B-044] Import HTML (Netscape bookmarks)
- **Tier**: Full (M)
- **Status**: R1 (pending)
- **Assigned To**: [product-manager]
- **Blockers**: None
- **Feature Context**: File-picker accepts `.html` / `.htm`. Count-preview dialog before commit. "Import replaces all existing data" warning with explicit confirmation. Folder hierarchy deeper than 1 level flattened safely.
- **Handoff Notes**: Paired with B-045. Shared infrastructure (`background/import/`) and shared `MSG_IMPORT_COLLECTION { format }` message contract. Default duplicate-handling: skip (matches B-060 AC — B-060 UX toggle is a separate follow-on item).

### [B-045] Import JSON backup
- **Tier**: Full (M)
- **Status**: R1 (pending)
- **Assigned To**: [product-manager]
- **Blockers**: B-067 (allow-list contract) — lands Wave 1 of R3, so effectively in-sprint
- **Feature Context**: Consumes `schemaVersion: 1` (the frozen §32.5 shape). Validates and automatically repairs: orphaned sub-groups, circular references, duplicate IDs. Count-preview + confirmation mirror B-044. Repair decisions surfaced in post-import summary.
- **Handoff Notes**: Paired with B-044 — shared R2 design (§33 to be authored). The `schemaVersion` gate: if the imported file's version is unknown, reject with a clear error ("backup was created in a newer Tab Junkie version").

---

## Completed This Sprint

*(none yet)*

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
