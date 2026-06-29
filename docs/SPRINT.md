# Current Sprint — between sprints (Sprint 47 CLOSED 2026-06-29)

**Sprint 47 is closed.** Full item detail, velocity, Gate 7 retrospective, and final state are in
`docs/SPRINT_ARCHIVE.md` (## Sprint 47 — Single-source-of-truth tab↔item identity consolidation).

**Release:** v1.42.0 tagged on `release/v2` (`gh release create` skipped per established pattern).
**Tests:** 2127 / 2127 PASS · zero regressions (2099 → 2127, +28). **Schema:** v8 → v9.

---

## Completed This Sprint (Sprint 47) — B-173 EPIC

| Item | Name | Tier | Status |
|------|------|------|--------|
| B-173 | Single-source-of-truth identity consolidation (EPIC anchor) | XL Spike-First | ✅ DONE |
| B-174 | Cold-start reconciliation E2E test net (A0) | M | ✅ DONE |
| B-175 | Extract one shared tab↔item resolver (A1) | L | ✅ DONE |
| B-176 | Split `floating-groups.js` → 5 modules (A2) | M | ✅ DONE |
| B-177 | Name `onReplaced`/`onRemoved` event fan-out (A3) | M | ✅ DONE |
| B-178 | Decompose `reconcileClaims` → 4 phases (A4) | M | ✅ DONE |
| B-179 | Store cutover — retire session `tj:tabClaims` (B1) | L | ✅ DONE · UAT PASS |
| B-180 | Eager `floatingGroups` v4 + schema v8→v9 (B2) | L | ✅ DONE · UAT PASS |

**Outcome:** six-store bookmark↔tab identity collapsed to one durable authority (`tj:itemClaims`) +
one live oracle (`LiveTabIndex`) + two derived caches; 10 match sites → 1 resolver. Design:
`docs/design/74` (R0 spike) · `/75` (cutover) · `/76` (As-Built).

**Carried to Sprint 48:**
- **B-181** — open tab in its own window not in the window filter (pre-existing, P3).
- **B-182** — jump-to-active-window doesn't reach open-tab rows (pre-existing B-168 gap, P2).
- **B-183** — delete floating-groups fallback tiers + tighten validator (gate on clean signal post-v1.42.0).
- Deferred UAT: B-179 U-7 (import) + U-9 (rollback).
