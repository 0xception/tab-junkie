# Current Sprint

*Sprint 31 — TBD. Awaiting product-owner scope decision.*

Sprint 30 closed 2026-04-24 with v1.24.0 (PR #36 merged as `b113598`). 4/4 shipped: B-091 settings page redesign, B-092 dense layout, B-093 import/export rehome, B-090 C-12 checklist. **8 consecutive sprints shipped without rollback** (S23 → S30). Full archive at `docs/SPRINT_ARCHIVE.md`.

**Settings page is now the configuration surface.** B-091 ships with a Theme placeholder section ready for B-037 to fill.

---

## Sprint 31 Kickoff — Scope Candidates

Per Sprint 30 retrospective + remaining backlog:

### High-priority (S30 retro action items)

- **R2 C-1 checklist addition** — stale-SW release-note guidance for new pref keys (S30 retro MEDIUM). Small CLAUDE.md edit.
- **R1 AC template selector-audit step** — rehome items must enumerate test files with moved-element ID refs (S30 retro MEDIUM). Small CLAUDE.md edit.

### Big-feature candidates

- **B-037** (P2/M) — Theme selection (≥12 themes). Natural S31 anchor — B-091 Settings page ships the Theme placeholder section ready for B-037 to populate.
- **B-086** (P3/M) — Sidepanel UI/UX design pass (themes-aware; could pair with B-037).
- **B-082** (P1/XS, was completed in S28; flagged in S30 retro as a candidate to add Settings entry to toolbar popup) — verify whether this is a new item or revisit of completed work.

### Hygiene + polish

- **B-088** (not yet filed, P2/S) — Hygiene-pass bundle (~25-30 deferred items across S25-S30, including S30 cross-surface helper duplication M-finding).
- **Comprehensive UAT sweep** (~280+ deferred cases).

### v2 → main merge prep

- v1.24.0 ships the Settings redesign — major user-facing work. Combined with the feature-parity closure in S29, the v2 branch is feature-complete + UI-redesigned.
- S31 + S32 candidate: start v2 → main merge PR prep (one-off PR, requires final QA sweep + tag transition plan).

### Other open backlog

- **B-076** — JSON import MIGRATION_STEPS hook (activates when MIGRATION_STEPS ships first non-empty entry).
- **B-041** — Sync tab order action (Chrome tab group sync).
- **`newTabOverride` ghost-key cleanup** — pref retained from B-039 drop; remove during next storage schema bump.

### P-1 rule reminder

Max one L/XL item active at a time. P-3 max two M items in parallel. B-037 + B-090-style XS edits is comfortable. B-037 + B-086 in parallel triggers P-3 review.

---

## Carry-forward from Sprint 30

### From retro (Sprint 30 Action Items)

1. **[solution-architect]** R2 C-1 checklist addition: stale-SW release-note for new pref keys. [MEDIUM]
2. **[product-manager]** R1 AC template: rehome selector-audit step. [MEDIUM]
3. **[scrum-master]** S31 scope decision — B-037 themes likely anchor. [HIGH]
4. Settings keyboard shortcut deferral noted; revisit if friction surfaces. [LOW]

### Tech debt from Sprint 30

- **Cross-surface helper duplication** — `applyDenseLayout` (sidepanel) + `_applyDenseLayout` (newtab) are functionally identical (B-092 M-finding). Factor-out candidate for `shared/`. Module-boundary discussion required.
- **Theme token triplication** — `[data-theme]` palette declarations exist in `sidepanel.css`, `newtab.css`, and `settings.css`. Extract to a shared token file (B-091 LOW; documented as S30+ follow-up).

### Outstanding from prior sprints

- 8 comprehensive UAT plans deferred since S21 (still pending execution)
- ~25-30 hygiene items deferred across S25-S30 (B-088 candidate bundle)
- B-039's potential hidden bug — user mentioned holding off; check if persists in S31 UAT
- S28 patch-consumer same-group reorder extension (`_patchSingleRow` via `insertBefore`) — perf hygiene candidate
- `newTabOverride` ghost-key cleanup — defer until next storage schema bump

---

## Active Items

*(populated at kickoff once scope is confirmed)*

---

## Blockers

*None.*
