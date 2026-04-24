# Current Sprint

*Sprint 29 — TBD. Awaiting product-owner scope decision.*

Sprint 28 closed 2026-04-23 with v1.22.0 (PR #34 merged as `8dae2ba`). Full archive at `docs/SPRINT_ARCHIVE.md`.

---

## Sprint 29 Kickoff — Scope Candidates

Per Sprint 28 retrospective + feature-parity roadmap:

### Anchor option (Full tier L)

- **B-036** — New tab page replacement (P3/L). `chrome_url_overrides` manifest wiring. Applies C-11 from day one (new-tab context is popup-adjacent). Optional feature — user-toggleable via B-039.

### XS prefs bundle (Fast Track, can pair with anchor)

- **B-038** — View mode preference (side panel vs. standalone) (P3/XS)
- **B-039** — New tab page toggle preference (P3/XS)
- **B-040** — Sub-group auto-collapse preference (P3/XS)

### Hygiene bundle option

- **B-088** (not yet filed) — P2/S hygiene-pass. Absorbs ~20 deferred items across S25-S28. Decide at kickoff: file now vs. continue opportunistic absorption.

### Other open backlog items (non-feature-parity)

- **B-037** — Theme selection (P2/M, 12+ themes)
- **B-041** — Sync tab order action (Chrome tab group sync) (P2/L)
- **B-076** — JSON import validator migration-steps hook (P2/S, activates when MIGRATION_STEPS ships first non-empty entry)
- **B-086** — Sidepanel UI/UX design pass (P3/M, post-feature-freeze polish)

### P-1 rule reminder

Max one L/XL item active at a time. B-036 alone OR B-036 + 1-3 XS items both feasible.

---

## Carry-forward from Sprint 28

### From retro (Sprint 28 Action Items)

1. **[scrum-master]** S29 scope decision — product-owner call. [HIGH]
2. **[solution-architect]** R2 broadcast-receiver audit note in CLAUDE.md (informal pre-C-entry — second precedent required for formal C-12). [MEDIUM]
3. Patch-consumer same-group reorder extension (`_patchSingleRow` via `insertBefore` instead of bail-to-renderAll). Perf improvement; S29+ hygiene. [LOW]
4. Hygiene debt — B-088 filing decision. [LOW]

### Outstanding UAT plans (deferred since S21)

- 8 comprehensive UAT plans filed in S21 feature-parity pivot — deferred to S27 comprehensive sweep, still pending execution (separate from per-sprint UAT).

---

## Active Items

*(populated at kickoff once scope is confirmed)*

---

## Blockers

*None.*
