# Current Sprint

*Sprint 19 — Retro action items + Sprint 18 polish bundle + imports polish + keyboard shortcuts + search perf. Kicked off 2026-04-19.*

---

## Sprint Readiness (Gate 6)

- ✅ Scope approved by product owner: B-069 + B-070 + B-060 + B-046 + B-052
- ✅ Total effort: 1M + 3S + 1XS — matches Sprints 17/18 cadence (2M+2S / 2M+3S ranges)
- ✅ Sprint 18 closed; v1.13.0 tag on `release/v2` (commit `cb019ba`); archive commit `54bd608`
- ⚠️ Carry-over from Sprint 18: **7 deferred UAT plans** (B-042, B-043, B-048, B-029, B-059, B-044, B-045 — ~165 cases total). User-executed burndown scheduled for **start of Sprint 19** (per product-owner instruction). Runs in parallel with the R2/R3 pipeline — does NOT block B-069/B-070/B-060/B-046/B-052 from proceeding.
- ✅ Sprint 18 retro action items C-8 + C-9 are the subject of B-069 (Wave 0) — delivered within the sprint, not carried as meta-items.
- 🆕 **B-069 is Wave 0 — MUST land before B-052 R2** so the new C-8/C-9 checks apply to the only Full-tier R2 pass this sprint.

---

## UAT Burndown Track (Parallel, User-Executed)

Running alongside the pipeline — not on the critical path of any sprint item.

| Plan | Item | Est. cases | Status |
|------|------|-----------|--------|
| `docs/UAT_B-042.md` | Export HTML | ~14 | pending |
| `docs/UAT_B-043.md` | Export JSON | ~15 | pending |
| `docs/UAT_B-048.md` | Item visual states | ~? | pending |
| `docs/UAT_B-029.md` | Group picker modal | ~? | pending |
| `docs/UAT_B-059.md` | Allow duplicate URLs | ~? | pending |
| `docs/UAT_B-044.md` | Import HTML | 29 | pending |
| `docs/UAT_B-045.md` | Import JSON | 30 | pending |

Each UAT plan has PASS/FAIL/WARN/SKIP columns pre-laid for the user. Gate 3 sign-off is satisfied once the full 7-plan sweep is PASS — that's the quality gate for `release/v2` → `main`.

---

## Active Items

### [B-069] Add C-8 + C-9 to R2 Correctness Checklist
- **Tier**: Fast Track (XS) — **Wave 0, blocks B-052 R2**
- **Status**: R1 (pre-approved — ACs comprehensive in BACKLOG.md)
- **Assigned To**: [solution-architect] (CLAUDE.md owner for the checklist)
- **Blockers**: None (but B-052 R2 waits for B-069 merge so C-8 + C-9 apply)
- **Feature Context**: Codify Sprint 18 retro action items as permanent R2 quality gates. C-8 catches SW-context API infeasibility (the B-044 DOMParser case) pre-R3. C-9 forces empty-state enumeration in R2 output (the B-045 preferences-only edge case would have surfaced in R2 if C-9 existed).
- **Handoff Notes**: Pure CLAUDE.md edit. Zero code / test / manifest surface. R4 runs [code-reviewer] as a smoke check (verify no other section drifted). [security-reviewer] is a no-op gate protector. Test suite stays 923/923.

### [B-070] Sprint 18 follow-on polish bundle
- **Tier**: Fast Track (S) — Wave 1
- **Status**: R1 (pre-approved — ACs comprehensive in BACKLOG.md)
- **Assigned To**: [frontend-engineer]
- **Blockers**: None
- **Feature Context**: Four small Sprint 18 follow-on items bundled: (1) preferences-only backup support, (2) `validateAndRepair` alias removal, (3) repair-summary plain-language rewrite, (4) JSON-path dialog heading scope. All in `background/import/` + `sidepanel/`.
- **Handoff Notes**: Touches `sidepanel/sidepanel.js` (zero-guard logic + repair summary + dialog heading format switch) and `background/import/json-validator.js` (alias delete). One new e2e test for prefs-only commit flow. Target suite 923 → 924+. Frontend-engineer must confirm `shared/*` frozen files untouched per AC6.

### [B-060] Import duplicate-handling with skip/allow override
- **Tier**: Fast Track (S) — Wave 2
- **Status**: R1 (pre-approved — ACs comprehensive in BACKLOG.md)
- **Assigned To**: [frontend-engineer]
- **Blockers**: None (B-044 + B-045 shipped; allow-list contract stable)
- **Feature Context**: Import preview dialog already surfaces "new vs duplicate" counts (shipped in B-044/B-045). B-060 adds the user-toggleable "Import duplicates anyway" checkbox, which — when checked — creates additional items even when URLs match existing. Default: skip. Preference persists in `tj:prefs` if user explicitly changes it.
- **Handoff Notes**: Extends `_buildImportPreviewBody` with a checkbox + plumbs the option through `MSG_IMPORT_COLLECTION.options.skipDuplicates` (already a defined payload field — see `shared/messages.js`). Storage side: small `importSkipDuplicates` preference addition if AC specifies persistence. Covers both HTML and JSON import paths. Tests: update `b044-e2e-import.test.js` + `b045-e2e-import.test.js` to cover the allow-duplicates branch.

### [B-046] Global keyboard shortcuts (popup + standalone)
- **Tier**: Fast Track (S) — Wave 3
- **Status**: R1 (pre-approved — ACs comprehensive in BACKLOG.md)
- **Assigned To**: [frontend-engineer]
- **Blockers**: None (but the `commands` entries in manifest warrant R2 checklist review — auto-upgrade if scope expands per CLAUDE.md Auto-upgrade rule, since this touches manifest permissions)
- **Feature Context**: Two default global shortcuts registered in `manifest.json` (quick search popup + standalone window). Both trigger from any active tab (within Chrome/Edge shortcut constraints). Reassignable via `edge://extensions/shortcuts`. Standalone shortcut focuses existing window if open.
- **Handoff Notes**: Touches `manifest.json` (new `commands` section), `background/service-worker.js` (new `chrome.commands.onCommand` listener), possibly a new stub for the standalone window if not yet present. **Auto-upgrade trigger**: new `manifest.json` permission-adjacent section → upgrade to Full tier if the scope expands beyond basic wiring; re-evaluate at R3 start. Note: memory: user runs Edge, not Chrome — verify `commands` works in Edge (it does per MDN — chromium-base).

### [B-052] Fuzzy search index caching & perf targets
- **Tier**: Full (M) — Wave 4
- **Status**: R1 (pre-approved — ACs comprehensive in BACKLOG.md)
- **Assigned To**: [solution-architect] (R2) → [frontend-engineer] (R3)
- **Blockers**: B-069 (Wave 0) — R2 runs the updated Correctness Checklist with C-8 + C-9. Effectively in-sprint since B-069 is XS.
- **Feature Context**: Fuzzy search index built once, cached in memory, invalidated only when items/groups change. Target: < 50 ms P95 on 1,000-item collection. Sidepanel first paint with 500 items: < 200 ms. No full re-render on single-item updates.
- **Handoff Notes**: R2 design must cover: (a) where the index lives (SW memory vs sidepanel vs both), (b) invalidation strategy on CRUD broadcasts, (c) measurement harness for P95 (reuse existing perf-test infrastructure from B-001a/B-001b), (d) fallback when index is stale during rebuild. Paired with the Sprint 18 retro C-9: R2 MUST enumerate empty-state (zero-items, zero-matches, invalidation-in-flight) UX explicitly. Performance AC is concrete: this is a measurable pass/fail gate.

---

## Completed This Sprint

*(none yet — sprint just kicked off)*

---

## Planned Pipeline Parallelization

- **R1 [product-manager]**: PRE-APPROVED for all 5 items (ACs comprehensive in BACKLOG.md — this sprint repeats the Sprint 18 "skip R1 rubber-stamp" pattern that worked well).
- **R2 [solution-architect]**:
  - **B-069** is itself a meta-R2 update (writes C-8 + C-9 into the Correctness Checklist). Treated as R3 (implementation).
  - **B-052** only Full-tier item requiring a standalone R2 pass. Gated on B-069 landing so the updated checklist (C-8 + C-9) is active.
- **R3 sequencing**:
  0. **Wave 0 — B-069** ([solution-architect]): add C-8 + C-9 rows to CLAUDE.md R2 Correctness Checklist. MUST merge before B-052 R2.
  1. **Wave 1 — B-070** ([frontend-engineer]): Sprint 18 polish bundle.
  2. **Wave 2 — B-060** ([frontend-engineer]): import duplicate-handling override.
  3. **Wave 3 — B-046** ([frontend-engineer]): global keyboard shortcuts. **Auto-upgrade watch** — if `commands` entries plus standalone-window stub scope grows, upgrade to Full tier.
  4. **Wave 4 — B-052** ([frontend-engineer]): fuzzy search index caching + perf harness. R2 first, then R3.
- **R4** per item:
  - **B-069**: [code-reviewer] smoke check (1 file, 2 table-row edits). [security-reviewer] no-op gate protector. [qa-reviewer] skipped (Fast Track).
  - **B-070**, **B-060**, **B-046**: code + security (2 parallel — Fast Track).
  - **B-052**: code + security + qa (3 parallel — Full tier).
- **R5** B-052 only (Full tier). B-069/B-070/B-060/B-046 on Fast Track rely on existing suite + `./build.sh` staying green.
- **R6** [solution-architect] covers B-052 — update `docs/design/*` with fuzzy-search architecture (likely a new §34 chapter).
- **R7** [technical-writer] covers any user-visible change — B-060 checkbox, B-046 shortcuts documentation, B-052 if user-observable perf note needed. Batched at sprint close.

### Cross-Item Parallelization (per CLAUDE.md P-1/P-2/P-3)

- P-1 Max one L/XL active: ✅ zero L/XL items in Sprint 19.
- P-2 S/XS pair with anything: ✅ B-069 + B-070 + B-060 + B-046 can interleave.
- P-3 Max two M in parallel: ✅ only B-052 is M; no conflict.
- P-4 Interleave, don't overlap: run waves sequentially per the plan above; do NOT open multiple R1s simultaneously.

---

## Sprint 19 Goals (Definition of Success)

1. v1.14.0 ships with all 5 items merged to `release/v2`.
2. R2 Correctness Checklist gains C-8 + C-9 (permanent quality improvement).
3. Sprint 18 polish backlog consumed (B-070) — no residual prefs-only / jargon / alias cruft.
4. Duplicate import UX closed (B-060) — imports paired with Sprint 18 complete.
5. Global keyboard shortcuts live — foundation for B-022 (Quick search popup) in Sprint 20.
6. Fuzzy search meets < 50 ms P95 perf target on 1,000-item collection (B-052).
7. UAT burndown: ≥ 4 of the 7 deferred UAT plans PASS before sprint close.
