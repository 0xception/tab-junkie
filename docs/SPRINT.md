# Current Sprint

*Sprint 8 — Favicons, Live State UI, Group Reorder, Inline Search. Kicked off 2026-04-16.*

---

## Active Items

*(all sprint items complete — see Completed This Sprint below)*

---

## Gate 4: ✅ PASSED
- All R4 findings resolved (no open CRITICAL/HIGH)
- 285/285 automated tests passing
- UAT PASS: B-004 (8/8 ACs), B-010 (12/12 ACs), B-008 (12/12 ACs), B-021 (10/10 ACs)
- SOLUTION_DESIGN.md v2.1 — §17, §18, §19 added
- manifest.json unchanged — no new permissions
- build.sh clean (84K, 46 files)

---

## Sprint Retrospective — Sprint 8

### Velocity
- **Planned**: 4 items / S + L + M + M effort
- **Completed**: 4 items / S + L + M + M effort
- **Carried over**: 0 items

### What Went Well
- Parallel R4 reviews (3 reviewers simultaneously) caught 8+ HIGH findings per item without blocking velocity
- B-010 multi-window active-tab tracking (windows.onFocusChanged gap) was a non-obvious bug that R2 architecture caught proactively
- B-021 filter `buildHighlightedText()` via DocumentFragment was the right XSS-safe design from the start — security review approved without changes

### What to Improve
- SPRINT.md had duplicate entries for B-008 and B-021 due to interleaved parallel agent edits — need a cleaner handoff protocol when multiple agents touch the same doc
- B-008 dragstart guard (H-1) was fundamentally broken in R3 build — the `e.target.closest()` approach doesn't work on a `draggable` section element; R2 architecture should have specified the mousedown-flag pattern explicitly
- B-021 R3 omitted the `_itemById` Map despite it being in the R2 spec — R3 agent should verify spec compliance before claiming done

### Action Items for Next Sprint
- [ ] [solution-architect] Specify implementation-level patterns (not just design) in R2 for non-obvious browser APIs (drag events, intersection observer, etc.)
- [ ] [scrum-master] After parallel agent edits, do a single-pass SPRINT.md cleanup before advancing to next round
- [ ] [test-engineer] Add spec-compliance check to R5: verify each R2 design decision is present in the code

---

## Gate 6: ✅ READY

## Completed This Sprint

### [B-008] Group reorder & collapse/expand persistence ✅
- **Tier**: Full (M)
- **UAT**: PASS (all 12 ACs satisfied)
- **R6**: `docs/SOLUTION_DESIGN.md` §18 added (v2.0)
- **R7**: Skipped (per user preference)
- **Files Changed**: `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`, `background/storage/groups.js`, `tests/b008-group-reorder.test.js` (16 new tests)

### [B-021] Inline side-panel filter with debounce & highlight ✅
- **Tier**: Full (M)
- **UAT**: PASS (all 10 ACs satisfied)
- **R6**: `docs/SOLUTION_DESIGN.md` §19 added (v2.1)
- **R7**: Skipped (per user preference)
- **Files Changed**: `sidepanel/sidepanel.html`, `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`, `tests/b021-filter.test.js` (10 new tests)

### [B-004] Favicon auto-capture + letter-avatar fallback ✅
- **Tier**: Fast Track (S)
- **UAT**: PASS (all 8 ACs satisfied)
- **R7**: Skipped (per user preference)
- **Files Changed**: `background/tabs/tab-events.js`, `background/tabs/live-tab-index.js`, `background/tabs/tab-claims.js`, `sidepanel/sidepanel.js`, `tests/b004-favicon.test.js` (19 new tests)

### [B-010] Live tab reflection & active-tab highlight ✅
- **Tier**: Full (L)
- **UAT**: PASS (all 12 ACs satisfied by code analysis; 18 automated tests)
- **R6**: `docs/SOLUTION_DESIGN.md` §17 added (v1.9)
- **R7**: Skipped (per user preference)
- **Files Changed**: `background/tabs/tab-events.js`, `background/tabs/live-tab-index.js`, `background/tabs/tab-claims.js`, `background/broadcast.js`, `sidepanel/sidepanel.js`, `tests/chrome-mock.js`, `tests/b010-live-state.test.js` (18 new tests)
