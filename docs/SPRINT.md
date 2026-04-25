# Current Sprint

*Sprint 30 — TBD. Awaiting product-owner scope decision.*

Sprint 29 closed 2026-04-24 with v1.23.0 (PR #35 merged as `ca61da5`). 4 shipped (B-089, B-036, B-038, B-040) + 1 dropped (B-039 — MV3 constraint precludes true OFF state). Full archive at `docs/SPRINT_ARCHIVE.md`.

**Feature-parity roadmap is closed.** v1.23.0 is the candidate "feature-complete v2".

---

## Sprint 30 Kickoff — Scope Candidates

Per Sprint 29 retrospective + remaining backlog:

### High-priority (S29 retro action items)

- **B-090** (new, P2/XS) — Add **C-12** "Manifest declarations runtime-mutability check" to CLAUDE.md R2 Correctness Checklist. Reference: B-039 drop precedent.
- **R1 AC self-checklist update** — small CLAUDE.md edit requiring R1 PMs to cross-check canonical key names against `DEFAULT_PREFERENCES` before publishing.
- **Sprint Close — Item Drop Checklist** — small CLAUDE.md subsection documenting the docs to update when an item is dropped mid-sprint.

### Big-feature candidates

- **B-037** (P2/M) — Theme selection (≥12 themes). Last major user-facing feature. Could pair with B-086 for one big themes-aware design pass.
- **B-086** (P3/M) — Sidepanel UI/UX design pass (themes-aware; post-feature-freeze polish).
- **B-041** (P2/L) — Sync tab order action (Chrome tab group sync).

### Hygiene + sweep

- **B-088** (not yet filed, P2/S) — Hygiene-pass bundle (~25 deferred items across S25-S29).
- **Comprehensive UAT sweep** — long-deferred (~280+ cases).

### v2 → main merge prep

- v1.23.0 is the candidate "feature-complete v2". S30 + S31 should be polish + final validation before the v2 → main merge PR. Decide at S30 kickoff whether to start the merge prep this sprint or after one more polish sprint.

### Other open backlog

- **B-076** — JSON import MIGRATION_STEPS hook (activates when MIGRATION_STEPS ships first non-empty entry).

### P-1 rule reminder

Max one L/XL item active at a time. P-3 max two M items in parallel. B-037 + B-090 + small CLAUDE.md edits is feasible. B-037 + B-086 in parallel triggers P-3 review.

---

## Carry-forward from Sprint 29

### From retro (Sprint 29 Action Items)

1. **[solution-architect]** File B-090 — C-12 manifest runtime-mutability check. [HIGH]
2. **[product-manager]** R1 AC canonical-key cross-check checklist. [MEDIUM]
3. **[scrum-master]** Sprint Close item-drop checklist in CLAUDE.md. [LOW]
4. **S30 scope decision** — product-owner triage at kickoff. [HIGH]

### Deferred B-039-related cleanup

- **`newTabOverride` key cleanup** — pref key was retained in `DEFAULT_PREFERENCES` after B-039 drop for backward compat. Removing requires schema migration. Defer until next storage schema bump (or absorb into B-088 hygiene if filed).

### Outstanding from prior sprints

- 8 comprehensive UAT plans deferred since S21 (still pending execution)
- ~25 hygiene items deferred across S25-S29 (B-088 candidate bundle)
- B-039's potential hidden bug — user mentioned holding off; will report if it persists
- S28 patch-consumer same-group reorder extension (`_patchSingleRow` via `insertBefore`) — perf hygiene candidate

---

## Active Items

*(populated at kickoff once scope is confirmed)*

---

## Blockers

*None.*
