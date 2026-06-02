# Current Sprint — Sprint 46

**Theme:** Durable claim identity (the architectural follow-up to S45's three URL-inference cascade bugs) + small UX feature + S45-retro housekeeping.
**Branch:** `feature/sprint-46-claim-identity` (off `release/v2` at v1.40.0 / `56a4a7c`)
**Opened:** 2026-06-02
**Estimated effort:** 1 × XL (Spike-First anchor) + 1 × S + 3 × XS = ~6 effort units. The XL is the dominant scope; the others ride alongside per CLAUDE.md P-2 (S/XS rides any active item).

---

## Sprint 46 Charter — three S45 retrospective action items rolled into S46 scope

Sprint 45 closed with three explicit action items for S46. Two of them ARE in-scope as their own backlog rows (B-170 + B-171); the third (B-167 triage) IS the sprint anchor.

- ✅ **[scrum-master] B-167 triage** → adopted as sprint anchor (Durable claim identity).
- ✅ **[code-reviewer] charter addendum** → filed as B-170, in-scope.
- ✅ **[test-engineer] reusable diag-trace helper** → filed as B-171, in-scope.

---

## Gate 6 — Sprint Readiness (verified 2026-06-02)

- ✅ All five items have passed Definition of Ready (all R1 PENDING per BACKLOG with R0 spike options pre-enumerated where applicable).
- ✅ Total sprint effort (XL + S + 3 × XS = ~6 units) fits the sprint duration. The XL anchor will dominate; S/XS items ride alongside.
- ✅ No unresolved blockers from S45 (close-out clean; v1.40.0 shipped; 22 sprints without rollback).
- ✅ "Active Items" section below populated with all five.
- ✅ BACKLOG.md updated — Durable claim identity / Jump to active window / Ways-of-working / Contract-diff gate / Diag-trace helper all set to `in-progress` / sprint 46.
- ✅ BACKLOG_BOARD.md updated — In-Progress count 0 → 5; Total items 155 → 159 (B-168/169/170/171 filed); Sprint 46 active section added above Sprint 45.
- ✅ **Deps-resolved check** — all dependencies are either `done` OR not load-bearing:
  - Durable claim identity (B-167): deps B-148 ✅ / B-149 ✅ / B-163 ✅ / B-164 ✅ / B-132 ✅ (all S45-and-earlier closures).
  - Jump to active window (B-168): deps B-014 ✅ / B-022 ✅ / B-097 ✅.
  - Ways-of-working (B-169): no code deps; CLAUDE.md edit only.
  - Contract-diff gate (B-170): no code deps; CLAUDE.md edit only.
  - Diag-trace helper (B-171): no code deps; new `shared/diag.js` module.

---

## Cross-item parallelization plan (per CLAUDE.md P-1..P-4)

| Rule | Application |
|---|---|
| P-1 (max 1 L/XL) | Durable claim identity (B-167, XL) — at the limit |
| P-2 (S/XS rides alongside) | Jump to active window (B-168, S) + 3 XS housekeeping items ride alongside the XL anchor |
| P-3 (max 2 M parallel) | N/A — no M items |
| P-4 (interleave full pipelines, don't overlap) | XL anchor R0/R1/R2 runs first to lock scope; S + XS items can run R1-R5 in parallel against the XL's R3+ build phases |

**Suggested execution order:**

1. **Durable claim identity R0 spike** ([solution-architect] Opus) — survey extension-reload / browser-restart / crash recovery scenarios; pick durability strategy from (a) durable `tj:itemClaims` partition / (b) `chrome.sessions` API integration / (c) URL-history-per-claim / (d) combination; document the migration path from `tj:tabClaims` to the new partition; define rollback.
2. **R1 for all five items in parallel** — [product-manager] × 3 for the larger items (Durable claim identity / Jump to active window / 1 XS), other 2 XS as Fast Track skip-R1-to-R3.
3. **R2 architecture** for Durable claim identity ([solution-architect] Opus, chapter §72) and Jump to active window ([solution-architect] Sonnet — small scope).
4. **R3 build** — Durable claim identity is the long pole; the 3 XS housekeeping items can ship in standalone commits whenever ready.
5. **R4 review × 3 (parallel)** per CLAUDE.md Gate 1, for the items that have code changes (B-167 + B-168 + B-171). B-169 + B-170 are doc-only; review skipped per Fast Track tier.
6. **R5 testing + UAT** per item.
7. **R6 close** — chapters FIRST per S44 retro action item (still enforced).
8. **Sprint close** — Gate 4 + Gate 7 + release.

---

## Active Items

### [B-167] Durable claim identity (anchor)

- **Tier**: Full Spike-First (XL)
- **Priority**: P2
- **Status**: R0 SPIKE PENDING — ready to launch
- **Assigned To**: [solution-architect] Opus (R0 spike) → [product-manager] (R1) → [solution-architect] Opus (R2 chapter §72)
- **Blockers**: none
- **Feature Context**:
  - S45 surfaced three URL-inference bugs in four days (B-163 R3 Phase 3 scope narrowing; B-132 preMark position-only false-positive; M-1 dedup test verifying final-state). All fixed point-wise, but the underlying pattern is that `tj:tabClaims` lives in `chrome.storage.session` — wiped on every reload/restart/crash — forcing URL re-inference on every cold start.
  - Goal: replace session-storage-based inference with a durable claim identity that survives extension reload (tab IDs persist), browser restart (tab IDs change; needs `chrome.sessions` API or URL-history backstop), and crash (URL inference as last resort).
  - R0 picks the durability strategy from four enumerated candidates.
- **Handoff Notes**: R0 spike must produce: (i) survey of every storage-wipe scenario the current inference layer handles correctly vs incorrectly, (ii) pick durability strategy (a/b/c/d), (iii) migration path from `tj:tabClaims` to the new partition (eager rewrite vs. lazy), (iv) rollback plan, (v) schema bump implications (C-1a/b).
- **Files Changed**: (none yet)
- **Parallel Opportunity**: anchor item; other items ride alongside during R3+ build phases.

### [B-168] Jump to active window

- **Tier**: Full (S — close to Fast Track; may auto-upgrade if R0 surfaces a `commands` manifest-permission interaction)
- **Priority**: P2
- **Status**: R1 PENDING — both triggers (toolbar icon + keyboard shortcut) confirmed at filing by product-owner
- **Assigned To**: [product-manager] (R1) → [solution-architect] Sonnet (R2)
- **Blockers**: none
- **Feature Context**:
  - User-observed pain: sidepanel renders tabs from all browser windows; finding the section for the currently-focused window requires manual scrolling.
  - Two triggers: a toolbar (popup) button + a keyboard shortcut (default TBD; avoid Alt+J/K/, collisions documented in `manifest.json:25-51`).
  - Scroll mechanism: locate first DOM row with `data-window-id === <activeWindowId>` in `itemListEl`, `scrollIntoView({block: 'start', behavior: 'smooth'})`. Brief visual flash for feedback.
  - Empty-state: if no tabs in active window are in the sidepanel (Open Tabs section empty), toast a short message or scroll to top (R0 decision).
- **Handoff Notes**: R0 spike should pick: toolbar surface (popup-button vs `chrome.action.onClicked`); keyboard binding default; visual-flash style.
- **Files Changed**: (none yet)
- **Parallel Opportunity**: independent of B-167; can ship in parallel start-to-end.

### [B-169] Ways-of-working: human names in discussion

- **Tier**: Fast Track (XS) — CLAUDE.md edit only
- **Priority**: P3
- **Status**: R1 PENDING — acceptance criteria stated in BACKLOG row; product-owner direction crisp
- **Assigned To**: [product-manager] (R1) → [scrum-master] (R3 CLAUDE.md edit)
- **Blockers**: none
- **Feature Context**: in conversation/planning/agent-prompts/retros, lead with human-identifiable names (e.g., "Durable claim identity (B-167)"); machine-greppable surfaces (commits, code comments, BACKLOG.md ID column, chapter section markers) keep ticket IDs alone.
- **Handoff Notes**: edit lands under "Non-Negotiable Rules" or near "Agent Bracket Notation — MANDATORY".
- **Parallel Opportunity**: independent.

### [B-170] R4 contract-vs-implementation diff gate

- **Tier**: Fast Track (XS) — CLAUDE.md edit only
- **Priority**: P3
- **Status**: R1 PENDING — three S45 precedents documented in BACKLOG row
- **Assigned To**: [product-manager] (R1) → [scrum-master] (R3 CLAUDE.md edit)
- **Blockers**: none
- **Feature Context**: extend the "Round 4: Review" section in CLAUDE.md with a "Contract-vs-implementation diff gate" subsection. R4 [code-reviewer] must trace each implementation predicate against the R1/R2 contract wording verbatim and flag any narrowing as HIGH-severity.
- **Handoff Notes**: cite the three S45 precedents as concrete examples.
- **Parallel Opportunity**: independent.

### [B-171] Reusable diagnostic-trace helper

- **Tier**: Fast Track (XS) — new tiny module
- **Priority**: P3
- **Status**: R1 PENDING — API shape stated in BACKLOG row
- **Assigned To**: [product-manager] (R1) → [frontend-engineer] (R3 build)
- **Blockers**: none
- **Feature Context**: new `shared/diag.js` exporting `recordTrace(key, payload)` (writes to `chrome.storage.local._diag_<key>` with append semantics + timestamp), `readTraces(prefix?)` reader, `clearTraces(prefix?)` cleanup. Document in CLAUDE.md "Diagnostic patterns" subsection. Replaces ad-hoc per-bug instrumentation (S45's `_b163_debug` + `_s45_*_trace` patterns).
- **Handoff Notes**: ~50 LOC for the helper + small CLAUDE.md edit; could be combined with B-170 edit if convenient at R6.
- **Parallel Opportunity**: independent.

---

## Completed This Sprint

_None yet — sprint just opened._

---

## Carryover backlog candidates (not in S46 scope)

These remain in the backlog; the product owner may add at S47 kickoff:

- **B-150 Q2** — lost-sync continuation; awaits real-world repro signal.
- **B-155** — Multi-drag count-badge ghost (Edge regression).
- **B-162** — Ctrl+Shift+T reopen.
- **B-165** — drop scroll preservation.
- **B-076** — `MIGRATION_STEPS` hook.
- **B-086** — Sidepanel UI/UX umbrella.
- **B-135** — Cross-window Open Tabs drag.
- **chrome-mock fixture: non-zero strip offset for Open Tabs section** — S43 retro action item.
- **Edge pre-merge smoke test protocol** — S43 retro action item.
- **S45 R4 close-out polish** (1 MED idle-reconciler drain-on-throw + 5 LOWs) — informal P3 polish; file as a sprint-zero item at S47 kickoff if desired.
