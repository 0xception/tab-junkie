# Current Sprint

*Sprint 9 — Drift Detection, Audible Indicator, Tab Cleanup. Kicked off 2026-04-16.*

---

## Active Items

*(all sprint items complete — see Completed This Sprint below)*

---

## Gate 4: ✅ PASSED
- All R4 findings resolved (no open CRITICAL/HIGH)
- 296/296 automated tests passing (+11 new tests)
- UAT PASS: B-011 (13/14 ACs pass, AC12 contrast WARN tracked as M-2), B-012 (regression PASS), B-015 (PASS)
- SOLUTION_DESIGN.md v2.2 — drift lifecycle, B-012 broadcast, B-015 clearDrift documented
- manifest.json unchanged — no new permissions
- build.sh clean (84K, 46 files)

---

## Sprint Retrospective — Sprint 9

### Velocity
- **Planned**: 3 items / XS + S + L effort
- **Completed**: 3 items / XS + S + L effort
- **Carried over**: 0 items

### What Went Well
- Pre-built B-001d code covered 13/14 ACs for B-011 — R1 analysis confirmed this upfront, avoiding redundant build work
- All three items had pre-existing tests; R5 added 11 targeted new tests covering new behaviors without duplicating existing coverage
- B-012 and B-015 R4 reviewers caught two non-obvious issues (async drift race in `onRemoved`, `aria-label` jargon) that would have shipped as bugs

### What to Improve
- The "pre-built but not formally sprinted" pattern (B-001d code satisfying B-011/B-015 ACs) creates confusion at sprint start — R1 should explicitly check if code already exists before defining work
- B-015 `clearDrift` on tab close was documented in SOLUTION_DESIGN.md §519 but not implemented — design doc and code drifted silently for 8 sprints. Need a "design→code coverage check" step
- `aria-label="URL drifted"` shipped in the pre-built code (not Sprint 9 build) — security/QA review caught it at R4, but it would have been caught at R1 if accessible label requirements were in the ACs

### Action Items for Next Sprint
- [ ] [scrum-master] At R1, scan codebase for pre-existing implementations before defining build scope — reduces wasted R3 cycles
- [ ] [test-engineer] Add spec-compliance check to R5: cross-reference SOLUTION_DESIGN.md design decisions against actual code (catches design→code gaps early)
- [ ] [product-manager] Add explicit ARIA label requirements to ACs for any new user-visible indicators (not just "accessible")

---

## Gate 6: ✅ READY

## Completed This Sprint

### [B-011] Drift detection & persistence ✅
- **Tier**: Full (L)
- **UAT**: PASS (13/14 ACs; AC12 contrast WARN — tracked M-2)
- **R6**: `docs/SOLUTION_DESIGN.md` v2.2 — §10.7 drift icon lifecycle + D-3 RESOLVED
- **R7**: Skipped (per user preference)
- **Files Changed**: `sidepanel/sidepanel.js` (`_ensureIndicators` drift lifecycle, `refetchAndPatchLiveState` call site + catch cleanup, aria-label fix), `tests/b011-drift.test.js` (9 new tests)

### [B-012] Audible tab indicator ✅
- **Tier**: Fast Track (XS)
- **UAT**: PASS (regression check — zero regressions)
- **R7**: Skipped (per user preference)
- **Files Changed**: `background/tabs/tab-events.js` (added `tab/audible-changed` broadcast for audible-only changes)

### [B-015] Tab-tracking cleanup on close ✅
- **Tier**: Fast Track (S)
- **UAT**: PASS (new drift-cleared assertions pass)
- **R7**: Skipped (per user preference)
- **Files Changed**: `background/tabs/tab-events.js` (`clearDrift` awaited in `onRemoved`, `Promise.allSettled` in `windows.onRemoved`), `tests/tab-close-claim.test.js` (+1 test), `tests/window-close-claims.test.js` (+1 test)
