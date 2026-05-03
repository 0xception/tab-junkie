# Current Sprint

**No active sprint.** Sprint 43 closed 2026-05-02 (v1.37.0 tagged on `release/v2` · merge commit `785a602` · PR #48).

The previous sprint's full content is archived to `docs/SPRINT_ARCHIVE.md` under "## Sprint 43 — Drag/drop + claim-drift reliability investigation".

---

## Next sprint candidates (filed at S43 close)

Two retro action items + one open anchor + one deferred follow-on:

1. **B-150 Q2 lost-sync continuation** — B-149 hypothesis mechanisms (a) `chrome.storage.session.tj:tabClaims` write-failure, (b) Edge-aggressive-session-clear, (d) other `releaseClaimByTab` path remain open. Awaits real-world repro signal. R0 spike candidate when symptom resurfaces.
2. **B-155 Multi-drag count-badge ghost (Edge regression)** — current Edge regressed both B-025 UAT-8 strategy and S43 hotfix attempts. Setting `setDragImage` with `.multi-drag-ghost` renders as fallback "document with folded corner" icon. Investigation candidates: canvas image, `Image()` object, alternate stacking context.
3. **chrome-mock fixture: non-zero strip offset for Open Tabs section** — S43 retro action item. Seed fixtures with saved-bookmark claims + floating tabs preceding Open Tabs so strip-vs-section bugs (B-145, B-156 class) are reproducible in tests. Fast-Track XS.
4. **Edge pre-merge smoke test protocol** — S43 retro action item. Documented checklist of drag/drop / setDragImage / sync paths to manually verify in real Edge before PR merge for any tab-class change. Fast-Track XS.

Plus existing backlog candidates:
- **B-148** — Interleave floating tabs with saved bookmarks within a group (P3, deferred from S40 pre-merge feedback)
- **B-076** — `MIGRATION_STEPS` hook (P2/S, pre-S33)
- **B-086** — Sidepanel UI/UX umbrella (P3/M, pre-S33)
- **B-135** — Cross-window Open Tabs drag (P3, deferred stub from B-134 v1)

---

## How to start a new sprint

When ready to plan Sprint 44, [scrum-master] runs the Session Start Protocol:
1. Read `docs/BACKLOG.md` to identify Sprint 44 candidates
2. Confirm scope with the product-owner (anchor item + any piggyback candidates)
3. Author Sprint 44 active-item content in this file (replace this stub)
4. Verify Gate 6 (Sprint Readiness) before launching R1
5. Branch off `release/v2` as `feature/sprint-44-<topic>`
