# Current Sprint

**No active sprint.** Sprint 42 closed 2026-05-01 (v1.36.0 tagged on `release/v2` · merge commit `54f2852` · PR #47).

The previous sprint's full content is archived to `docs/SPRINT_ARCHIVE.md` under "## Sprint 42 — Chrome tab group sync (2026-05-01)".

---

## Next sprint candidates (filed at S42 close)

Three CLAUDE.md-edit action items from the Sprint 42 Gate 7 retrospective are awaiting Sprint 43 kickoff:

1. Extend "Fix-scope test-assertion enumeration" to explicitly include DOM-structural pins on shared surfaces (third-occurrence pattern: S36 B-113 D-3 + S37 B-117 R3 + S42 B-041 D-1). Fast-Track XS.
2. Add C-15 to R2 Correctness Checklist — "Browser-API rejection-string contract verification" (verify actual Chrome message format via SW REPL probe; mocks must emit verified format if error classification depends on substring matches). Fast-Track XS.
3. Extend "Shared File Governance" subsection to require explicit "shared-surface consumer inventory" in R2 chapters that touch any element with `#settings-*` / `#sidepanel-*` / `#newtab-*` / etc. Fast-Track XS.

The most natural Sprint 43 anchor candidate is **auto-sync (continuous mirror)** — the spec §10 explicit deferred follow-on. The snapshot architecture from B-041 generalizes cleanly: every TJ mutation hooks the same `syncToChrome` orchestrator with debounce; the new `_isSyncing` flag, persisted `chromeTabGroupId` mapping, toast surface, and color map are all reusable.

Other backlog candidates:
- **B-148** — Interleave floating tabs with saved bookmarks within a group (deferred from S40 pre-merge user feedback)
- **B-076** — `MIGRATION_STEPS` hook (P2/S, pre-S33)
- **B-086** — Sidepanel UI/UX umbrella (P3/M, pre-S33)
- **B-135** — Cross-window Open Tabs drag (P3, deferred stub from B-134 v1)

---

## How to start a new sprint

When ready to plan Sprint 43, [scrum-master] runs the Session Start Protocol:
1. Read `docs/BACKLOG.md` to identify Sprint 43 candidates (per CLAUDE.md Sprint Workflow)
2. Confirm scope with the product-owner (anchor item + any piggyback candidates)
3. Author Sprint 43 active-item content in this file (replace this stub)
4. Verify Gate 6 (Sprint Readiness) before launching R1
5. Branch off `release/v2` as `feature/sprint-43-<topic>`
