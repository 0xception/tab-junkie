# Current Sprint

*Sprint 3 — CLOSED. B-001d + B-002 completed. Released as v1.2.0 on 2026-04-15. Entire B-001 family now complete.*

---

## Completed This Sprint

### [B-001d] Drift + floating-tab re-association — ✅ DONE
- **Tier**: Full (L) · **Closed**: 2026-04-15
- **Pipeline**: R1 ✅ · R2 ✅ · R3 ✅ · R4 ✅ (C=0 H=6 M=7 L=6, all H fixed) · R5 ✅ (119/119) · UAT skipped · R6 ✅
- **Files**: `background/tabs/drift.js`, `background/tabs/floating-groups.js` (new) + mods to live-tab-index, tab-events, tab-claims, index, partitions, storage-handlers
- **Tests**: 11 files, 30 tests

### [B-002] URL normalization — ✅ DONE
- **Tier**: Fast Track (S) · **Closed**: 2026-04-15
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (C=1 H=1 M=4 L=4, all C+H fixed) · 84/84 tests
- **Files**: `shared/url.js`, `shared/errors.js` (new) + mods to items.js, tab-claims.js, migration.js, background/storage/errors.js
- **Tests**: 3 new AC4 tests

---

## Gate 4: ✅ PASS — 119/119 tests, build clean, SOLUTION_DESIGN.md v1.3

## Gate 7 — Sprint 3 Retrospective

### Velocity
- Planned: 2 items (1L + 1S) · Completed: 2 items · Carried over: 0

### What Went Well
- B-001 family (a/b/c/d) fully shipped across 3 sprints — entire data layer complete
- Fast Track pipeline worked smoothly for B-002 (4 rounds vs 7)
- R4 reviews caught a critical import-direction violation (shared→background) that was fixed cleanly

### What to Improve
- Still not launching all R4 reviewers in a single parallel message consistently
- B-002 created an import-direction violation that R3 should have prevented — need lint rule for shared/→background/ imports
