# Current Sprint

**No active sprint.** Sprint 44 closed 2026-05-21 (v1.39.0 tagged on `release/v2` · merge commit `4ddc58a` · PR #54).

The previous sprint's full content is archived to `docs/SPRINT_ARCHIVE.md` under "## Sprint 44 — B-148 interleave floating tabs with saved bookmarks".

---

## Next sprint candidates (filed at S44 close)

Product-owner direction at S44 close: prioritize the highest-impact correctness gaps surfaced during interleave UAT before returning to long-tail polish.

1. **B-164** — Sleep/wake saved-bookmark→tab claim desync (P1 / M). Single-session OS-sleep failure; distinct from B-149 (SW idle) and B-163 (browser restart). R0 spike candidate: confirm Chrome event sequence on sleep/wake (`onReplaced` vs `onDiscarded` vs nothing) before R1 lock.
2. **B-163** — Drift URL fallback on cold-start re-association (P2 / M, sibling of B-164). Today `reconcileClaims` Phase 2 uses ONLY `item.url`; a drifted tab does not re-bind after cold-start because B-110 §53 paired-clear has already dropped the drift record. R0 spike: pick (a) defer paired-clear / (b) Phase-2 `driftedToUrl` fallback / (c) persist `lastClaimedUrl` rolling field.
3. **B-166** — Floating + promote in-place (P2 / S). Smallest of the three S45 candidates. Post-B-148 the group `renderOrder` already encodes the floating tab's interleaved position; `MSG_PROMOTE_TAB` ignores it and unconditionally appends. R0 spike: pick (a) UI-side `replaceFloatingId` hint / (b) SW-side detection / (c) general-purpose `createItem({insertAt})` parameter. (a) is the cheapest.

Plus S44 retrospective action items (rolled into Sprint 45 charter):
- **[scrum-master]** Enforce R6 chapter authoring BEFORE the version-bump commit (CLAUDE.md edit).
- **[solution-architect]** Extend CLAUDE.md "Fix-scope test-assertion enumeration" to cover code write-site enumeration.
- **[code-reviewer]** Add "blind-replace mutator" anti-pattern to the R4 review checklist.

## Carryover backlog candidates (lower priority than S45 anchors above)

These remain in the backlog and are NOT being actively scheduled for S45 unless explicitly added by the product owner at sprint kickoff:

- **B-150 Q2** — lost-sync continuation; awaits real-world repro signal.
- **B-155** — Multi-drag count-badge ghost (Edge regression).
- **B-162** — Ctrl+Shift+T reopen (P3 / M); deferable per the "Ctrl+Shift+T was never integrated with TJ pre-B-148" rationale.
- **B-165** — drop scroll preservation (P2 / M); can ride alongside any sidepanel polish wave.
- **B-076** — `MIGRATION_STEPS` hook (P2 / S, pre-S33).
- **B-086** — Sidepanel UI/UX umbrella (P3 / M, pre-S33).
- **B-135** — Cross-window Open Tabs drag (P3, deferred stub from B-134 v1).
- **chrome-mock fixture: non-zero strip offset for Open Tabs section** — S43 retro action item.
- **Edge pre-merge smoke test protocol** — S43 retro action item.

---

## How to start Sprint 45

When ready to plan Sprint 45, [scrum-master] runs the Session Start Protocol:
1. Read `docs/BACKLOG.md` to confirm Sprint 45 candidates (defaults to B-164 + B-163 + B-166 from above).
2. Confirm scope with the product-owner (anchor item + any piggyback candidates).
3. Author Sprint 45 active-item content in this file (replace this stub).
4. Verify Gate 6 (Sprint Readiness) — including the deps-resolved check for each in-scope item.
5. Branch off `release/v2` as `feature/sprint-45-<topic>`.
