# Current Sprint

*Sprint 21 — UAT burndown (first-class) + process polish + safety-net polish. Kicked off 2026-04-20.*

*Sprint 20 retro HIGH action item mandated UAT burndown as a first-class sprint item. Sprint 21 honours that: UAT burndown is the primary track, not a side track. No forward feature.*

---

## Sprint Readiness (Gate 6)

- ✅ Scope approved by product owner: UAT burndown (≥ 4 of 9 plans PASS) + B-077 + B-078 + B-079 + B-080
- ✅ Total effort: 4 XS engineering items + UAT burndown — deliberately lean to honour the retro's "no forward feature" rule
- ✅ **Deps-resolved check (new Gate 6 bullet from Sprint 20 B-071)**:
  - **B-077** (DoR Gate 7 check subsection in R1 AC template): no code deps ✅
  - **B-078** (`breakCycles` adversarial-input hardening): `background/import/json-validator.js` exists, no blocking deps ✅
  - **B-079** (query-length cap on filter input): B-021 sidepanel filter + B-052 search index both shipped ✅
  - **B-080** (repair-summary plain-language extended pass): B-060 + B-070 both shipped ✅
  - **UAT burndown**: all 9 target plans exist on `release/v2` ✅
- ✅ Sprint 20 closed 2026-04-20; v1.15.0 tag on `release/v2`; archive commit `d48136f`
- ✅ No forward feature — Sprint 20 retro HIGH rule satisfied

---

## UAT Burndown Track (PRIMARY — user-executed, walkthrough mode)

**Target: ≥ 4 of 9 plans PASS** before close. Running sessions: user walks through each case with the assistant recording results.

| Plan | Theme | Cases | Status |
|------|-------|-------|--------|
| `docs/UAT_B-042.md` | Export HTML (Netscape bookmarks format) | 14 | pending |
| `docs/UAT_B-043.md` | Export JSON (schema-versioned backup) | 15 | pending |
| `docs/UAT_B-044.md` | Import HTML (with preview + flattening) | 29 | pending |
| `docs/UAT_B-045.md` | Import JSON (with validation + repair) | 30 | pending |
| `docs/UAT_B-029.md` | Group picker modal | 16 | pending |
| `docs/UAT_B-007.md` | Sub-group nesting (depth = 1) | 18 | pending |
| `docs/UAT_B-048.md` | Item visual states (live/active/drifted/audible/selected) | 14 | pending |
| `docs/UAT_B-059.md` | Allow duplicate URLs with soft-warn | 12 | pending |
| `docs/UAT_B-052.md` | Fuzzy search perf targets | 15 | pending |

**Total**: 163 cases across 9 plans. Proposed batch walkthrough (6 batches by feature-common-test):

| Batch | Plans | Cases | Theme |
|-------|-------|-------|-------|
| **B1 — Export** | B-042 + B-043 | 29 | Data leaves the extension |
| **B2 — Import HTML** | B-044 | 29 | HTML import (standalone) |
| **B3 — Import JSON** | B-045 | 30 | JSON import (round-trip with B2/B-043 output) |
| **B4 — Groups** | B-029 + B-007 | 34 | Group picker + sub-group nesting |
| **B5 — Items** | B-048 + B-059 | 26 | Item visual states + duplicate-URL soft-warn |
| **B6 — Search perf** | B-052 | 15 | Fuzzy search performance (distinct instrument) |

Any 2 of the paired batches (B1/B4/B5) hits ≥ 4 plans PASS. Any one standalone (B2/B3/B6) plus a paired batch also hits it.

---

## Active Items (engineering — can run in parallel with UAT)

### [B-077] Add "DoR Gate 7 check" subsection to R1 AC template
- **Tier**: Fast Track (XS)
- **Status**: backlog → in-progress (Wave 0)
- **Assigned To**: [product-manager] (R3 build — CLAUDE.md edit)
- **Blockers**: None
- **Feature Context**: Sprint 20 retro MEDIUM. B-007 AC15 surfaced DoR item 7 (destructive-action confirmation clause from Sprint 20 B-072) reactively — buried in the out-of-scope AC rather than leading the AC block. Adds a "DoR Gate 7 check" subsection to the R1 AC authoring template so every AC block explicitly states destructive-action confirmation status (retained / waived / N/A) up front.
- **Handoff Notes**: Batch with B-078 + B-079 + B-080 in a single Wave 0 commit + single R4 smoke-check (matches Sprint 20 Wave 0 pattern).

### [B-078] `breakCycles` adversarial-input hardening
- **Tier**: Fast Track (XS defensive)
- **Status**: backlog → in-progress (Wave 1)
- **Assigned To**: [frontend-engineer]
- **Blockers**: None
- **Feature Context**: B-045 Sprint 18 R4 LOW — `breakCycles` in `background/import/json-validator.js` assumes well-formed input. Adversarial inputs (deep chains, fabricated ancestors) should be rejected/bounded, not silently parsed. Tighten the cycle-walk to cap depth + reject unknown-ancestor references.

### [B-079] Query-length cap on filter input
- **Tier**: Fast Track (XS security)
- **Status**: backlog → in-progress (Wave 1)
- **Assigned To**: [frontend-engineer]
- **Blockers**: None
- **Feature Context**: B-052 Sprint 19 R4 security LOW — filter input is currently unbounded; pathological query length (e.g. 1 MiB paste) would cause O(N) comparison per entry in the search index. DoS-only (local, not remote), but cheap to cap at a sensible threshold (e.g. 256 chars).

### [B-080] Repair-summary plain-language extended pass
- **Tier**: Fast Track (XS UX)
- **Status**: backlog → in-progress (Wave 1)
- **Assigned To**: [frontend-engineer]
- **Blockers**: None
- **Feature Context**: B-060 Sprint 19 R4 QA LOW — the 4 repair-type labels rewritten in B-070 landed but a follow-up pass on the TOAST version (separate from the preview dialog body text handled in B-070 AC3) kept the engineer-ese. Rewrite the toast strings to match the preview dialog wording, and verify no residual jargon in `_buildImportPreviewBody` / import completion toasts.

---

## Completed This Sprint

*(none yet — sprint just kicked off)*

---

## Planned Pipeline Parallelization

- **R1 [product-manager]**: PRE-APPROVED for all 4 items (ACs concrete from SPRINT.md; matches Sprint 20 Wave 0 meta-item pattern).
- **R2 [solution-architect]**: skipped (all 4 items are Fast Track XS; no storage / messages / permissions impact).
- **R3 sequencing**:
  1. **Wave 0 — B-077** ([product-manager] / [scrum-master]): CLAUDE.md edit. Can batch with Wave 1 below.
  2. **Wave 1 — B-078 + B-079 + B-080** ([frontend-engineer], parallel Fast Track): independent file touches.
  3. **UAT burndown**: runs in parallel throughout. User walks batches with the assistant recording PASS/FAIL/WARN/SKIP + triaging bugs surfaced.
- **R4** per item: [code-reviewer] + [security-reviewer] parallel (Fast Track). [qa-reviewer] skipped.
- **R5** skipped (Fast Track — existing test suite must stay green).

### Cross-Item Parallelization

- P-1 Max one L/XL active: ✅ zero L/XL items in Sprint 21.
- P-2 S/XS pair with anything: ✅ all 4 items are XS.
- P-3 Max two M in parallel: ✅ zero M items.

---

## Sprint 21 Goals (Definition of Success)

1. **UAT burndown hits ≥ 4 of 9 plans PASS** (Sprint 20 retro HIGH rule). If not: retro flags as a regression; Sprint 22 reinforces the rule.
2. B-077 adds DoR Gate 7 check subsection to the R1 AC template (Sprint 20 retro MEDIUM).
3. B-078 hardens `breakCycles` against adversarial input (Sprint 18 LOW closed).
4. B-079 caps filter input length (Sprint 19 LOW closed — no DoS vector).
5. B-080 aligns toast repair-summary strings with preview-dialog plain-language (Sprint 19 LOW closed).
6. v1.16.0 ships a clean polish-debt burndown — no user-visible new feature (deliberately).
7. Any bugs surfaced by UAT walkthrough get filed to backlog (or fixed in-sprint if trivial).

---

## Scope Change Log

*(none yet)*

---

## Status: ACTIVE — UAT burndown walkthrough starting (user-executed, session-based)
