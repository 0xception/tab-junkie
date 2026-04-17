# Current Sprint

*Sprint 10 — Opener-chain Inheritance, Bulk Create, Circular Dep Fix. Closed 2026-04-16.*

---

## Active Items

*(none — sprint closed)*

---

## Completed This Sprint

### [B-013] Opener-chain group inheritance for new tabs ✅
- **Tier**: Full (M)
- **Closed**: 2026-04-16
- **Pipeline**: R1 ✅ → R2 ✅ → R3 ✅ → R4 ✅ (1C + 6H fixed) → R5 ✅ (22 tests, 10/10 UAT PASS) → R6 ✅ (SOLUTION_DESIGN.md v2.3 §21)
- **Files Changed**: `background/tabs/opener-chain.js` (new), `background/tabs/floating-groups.js` (appendFloatingGroup + itemId fix + reassociation fix), `background/tabs/tab-events.js` (onCreated listener, pruning), `background/storage/shapes.js` (MAX_OPENER_MAP_ENTRIES), `tests/b013-opener-chain.test.js` (new, 22 tests), floating-group test fixtures updated

### [B-005] Bulk-create saved items (import primitive) ✅
- **Tier**: Full (M)
- **Closed**: 2026-04-16
- **Pipeline**: R1 ✅ → R2 ✅ → R3 ✅ → R4 ✅ (4H fixed) → R5 ✅ (18 tests, 10/10 UAT PASS) → R6 ✅ (SOLUTION_DESIGN.md v2.3 §22)
- **Files Changed**: `background/storage/items.js` (bulkCreateItems), `background/storage/shapes.js` (MAX_BULK_INPUTS=500), `background/messages/storage-handlers.js` (MSG_BULK_CREATE_ITEMS dispatch), `shared/messages.js` (MSG_BULK_CREATE_ITEMS constant), `tests/b005-bulk-create.test.js` (new, 18 tests)

### [B-053] Break circular dep partitions.js ↔ write-transaction.js ✅
- **Tier**: Fast Track (S)
- **Closed**: 2026-04-16
- **Pipeline**: R1 ✅ → R3 ✅ → R4 ✅ (1H fixed: duplicate import block) → regression 296/296 ✅
- **Files Changed**: `background/storage/shapes.js` (new), `background/storage/partitions.js` (re-export + local import), `background/storage/write-transaction.js` (import source → shapes.js)

---

## Gate 4 — Release Checklist ✅

- ✅ All R4 review findings resolved (no open CRITICAL/HIGH issues)
- ✅ All R5 automated tests passing — 332/332 (296 baseline + 22 B-013 + 18 B-005 + 4 floating-group fixture updates = net +40 new tests)
- ✅ UAT sign-off: B-013 PASS (10/10 ACs), B-005 PASS (10/10 ACs), B-053 regression PASS
- ✅ No open blockers
- ✅ `docs/SOLUTION_DESIGN.md` updated to v2.3 by [solution-architect] (§20 B-053, §21 B-013, §22 B-005)
- ✅ `manifest.json` permissions — no new permissions added
- ✅ Rollback plan: all changes are additive; no storage schema migration; revert commits to restore prior state
- ✅ README/STORE_LISTING: no user-facing UI changes — [technical-writer] R7 skipped
- ✅ `BACKLOG.md` updated — B-005, B-013, B-053 set to `done`
- ✅ `BACKLOG_BOARD.md` v1.6 — 22/56 done (39%), 1 in progress (B-054), dashboard accurate
- ✅ `SPRINT.md` "Completed This Sprint" section reflects all three finished items

---

## Gate 7 — Sprint Retrospective

### Velocity
- Planned: 3 items / 2M + 1S effort
- Completed: 3 items / 2M + 1S effort
- Carried over: 0

### What Went Well
- Parallelization worked cleanly: all three R4 reviews (6 reviewer passes total: code, security, QA × 2 items) ran simultaneously with no merge conflicts and caught a CRITICAL itemId bug (C-1 in B-013) that would have poisoned the claims mirror in production.
- B-053 Fast Track completed in a single round after the duplicate-import root cause was found; lesson (re-export does not bind locally) documented for the project.
- R5 test coverage was thorough: 40 new tests covering all ACs including the "tab removed before async IIFE resumes" edge case (AC10 B-013) and the "tx failure routes candidates to skipped" scenario (AC8 B-005).

### What to Improve
- B-013 R3 build missed `itemId` in the floating-group record — a core data-flow requirement that should have been caught in R2 spec or R3 self-review. The QA reviewer caught it in R4, but it was a CRITICAL that required a fix pass before R5.
- R4 HIGH-3 for B-013 (openerMap size cap) was a pure security finding from [security-reviewer] — the R2 architecture spec did not call out DoS-resistance requirements for in-memory maps. R2 should explicitly enumerate bounded-size requirements for any new in-memory data structures.
- The `requireClaimsReady: true` broadcast guard was silently swallowing broadcasts during cold-start windows — a subtle correctness gap that [qa-reviewer] caught. [solution-architect] should add "broadcast guard appropriateness" to the R2 review checklist.

### Action Items for Next Sprint
- [ ] [solution-architect] Add to R2 checklist: every new in-memory data structure must have a documented size bound and eviction policy.
- [ ] [product-manager] Ensure floating-group record shape (itemId field) is reflected in B-018 acceptance criteria — B-018 depends on the reassociation path that B-013 corrected.
- [ ] [scrum-master] Verify B-054 (sidepanel shell, in-progress) readiness for Sprint 11 as the next P0 Critical item.
