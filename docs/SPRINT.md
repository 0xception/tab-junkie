# Current Sprint

**No active sprint.** Sprint 45 closed 2026-06-02 (v1.40.0 tagged on `release/v2` · merge commit `3286227` · PR #55).

The previous sprint's full content is archived to `docs/SPRINT_ARCHIVE.md` under "## Sprint 45 — Claim-desync correctness".

---

## Next sprint candidates (filed at S45 close)

Three S45 retrospective action items + one anchor candidate + carryover backlog:

1. **B-167** — Durable `tj:itemClaims` architectural rework (P2 / XL / Spike-First). Anchor candidate for S46 if product-owner triages high. S45 surfaced three URL-inference bugs in four days; the inference-recovery layer is structurally fragile. R0 spike candidates: (a) durable `tj:itemClaims` partition (handles extension reload — tab IDs persist), (b) `chrome.sessions` API for browser-restart tab-ID mapping, (c) URL-history-per-claim for richer inference signal, (d) combination — likely (a)+(b) with Phase 2/3 inference as backstop for crash recovery.
2. **[code-reviewer] charter addendum** — Add "contract-vs-implementation diff" gate to the R4 review checklist. For every implementation predicate, read the R1/R2 contract wording, then trace the predicate to its implementation; flag any narrowing. The three S45 occurrences (B-163 Phase 3 scope, M-1 dedup test, preMark position-only) are the canonical precedents. Land as a CLAUDE.md "Round 4: Review" subsection update. Fast Track XS.
3. **[test-engineer] reusable diagnostic helper** — Build `shared/diag.js#recordTrace(key, data)` writing to `chrome.storage.local._diag_*` keys for SW-console-readable diagnostics that survive SW restart. Replaces ad-hoc `globalThis._sNN_*` and `chrome.storage.local._bNNN_debug` patterns. Fast Track XS.

## Carryover backlog candidates (lower priority than the S46 candidates above)

These remain in the backlog and are NOT being actively scheduled for S46 unless explicitly added by the product owner at sprint kickoff:

- **B-150 Q2** — lost-sync continuation; awaits real-world repro signal.
- **B-155** — Multi-drag count-badge ghost (Edge regression).
- **B-162** — Ctrl+Shift+T reopen (P3 / M); deferable per the "Ctrl+Shift+T was never integrated with TJ pre-B-148" rationale.
- **B-165** — drop scroll preservation (P2 / M); can ride alongside any sidepanel polish wave.
- **B-076** — `MIGRATION_STEPS` hook (P2 / S, pre-S33).
- **B-086** — Sidepanel UI/UX umbrella (P3 / M, pre-S33).
- **B-135** — Cross-window Open Tabs drag (P3, deferred stub from B-134 v1).
- **chrome-mock fixture: non-zero strip offset for Open Tabs section** — S43 retro action item.
- **Edge pre-merge smoke test protocol** — S43 retro action item.

## S45 R4 close-out polish (deferred to P3 backlog — informal, not yet formally filed)

- **idle-reconciler drain-on-throw** (MEDIUM) — `_pendingReplacements` queue dropped if `reconcileClaims` throws inside the wake handler. Cold-start `reassociateFloatingGroups` is the recovery path. Move drain into `finally` or document the trade-off.
- **5 LOWs** from B-164 / B-166 R4 code-review: comment polish (C-7 framing on `'idle'`/`'locked'` no-op gate), test-number ordering (T10 inserted after T11/T12), defense-in-depth narrative tweaks. All cosmetic; defer to opportunistic future cleanup or file as a sprint-zero P3 polish item at S46 kickoff if desired.

---

## How to start Sprint 46

When ready to plan Sprint 46, [scrum-master] runs the Session Start Protocol:
1. Read `docs/BACKLOG.md` to confirm Sprint 46 candidates (B-167 + the two CLAUDE.md edit follow-ups + product-owner additions).
2. Confirm scope with the product-owner (anchor item + any piggyback candidates).
3. Author Sprint 46 active-item content in this file (replace this stub).
4. Verify Gate 6 (Sprint Readiness) — including the deps-resolved check for each in-scope item.
5. Branch off `release/v2` as `feature/sprint-46-<topic>`.
