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
- **Status**: **R2 COMPLETE (2026-06-02)** — chapter §73 authored at `docs/design/73-b-167-durable-claim-identity.md` (721 LOC). R2-time decisions resolved: Q2 sessionMatches threshold = 50% (bias toward "trust durable"; false-positives self-correct via Phase 1 tabEntry+item validation); Q3 MSG_DEMOTE_ITEM = best-effort sequential (preserves existing partial-atomicity contract; crash-between-steps self-heals); Q4 telemetry counter DEFERRED (use B-171 diag helper instead of polluting tj:meta); Q5 tj:tabClaims RETAIN as defense-in-depth (revisit S48 after empirical hit-rate signal; performance argument — session is memory-mapped, local is disk-backed). **R1 AC3 mechanical-incorrectness caught at R2**: original wording "pre-populate claimsMirror before reconcile" is wrong — reconcileClaims reads tj:tabClaims session storage in Phase 1, not claimsMirror in-memory. §73.4.3 corrected to write restored bindings to tj:tabClaims session storage instead; R3 must follow corrected sketch, not R1 AC3 literal. 5 pre-existing test pins enumerated for R3 to update.
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
- **Status**: **R3 BUILD COMPLETE (2026-06-02)** — 9 files modified per §72 spec. Manifest `commands` entry + popup footer button + SW chrome.commands listener extension + sidepanel onMessage branch + showToast empty-state + CSS @keyframes flash with prefers-reduced-motion fallback + MSG_JUMP_TO_ACTIVE_WINDOW constant. Tests **2058 → 2069 PASS** (+11; T1-T7 + 4 supplemental). All 7 ACs match contract verbatim (self-check passed contract-vs-implementation diff gate). Ready for R4 review (code + security + qa parallel per Gate 1).
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
- **Status**: ✅ **DONE through R3 (2026-06-02)** — CLAUDE.md edit landed inline by [scrum-master]: new `## Discussion & Planning Discipline — MANDATORY` section placed after "Agent Bracket Notation — MANDATORY" (between lines 47 and 49 of the pre-edit file). Includes core rule, format spec, ✅/❌ examples, greppable-surfaces exception, all-agents applicability rule, non-retroactive scope note. Fast Track tier: R4 review skipped (doc-only edit), R5 N/A.
- **Assigned To**: [product-manager] (R1) → [scrum-master] (R3 CLAUDE.md edit)
- **Blockers**: none
- **Feature Context**: in conversation/planning/agent-prompts/retros, lead with human-identifiable names (e.g., "Durable claim identity (B-167)"); machine-greppable surfaces (commits, code comments, BACKLOG.md ID column, chapter section markers) keep ticket IDs alone.
- **Handoff Notes**: edit lands under "Non-Negotiable Rules" or near "Agent Bracket Notation — MANDATORY".
- **Parallel Opportunity**: independent.

### [B-170] R4 contract-vs-implementation diff gate

- **Tier**: Fast Track (XS) — CLAUDE.md edit only
- **Priority**: P3
- **Status**: ✅ **DONE through R3 (2026-06-02)** — CLAUDE.md edit landed inline by [scrum-master]: new `#### Contract-vs-implementation diff gate ([code-reviewer] mandatory)` subsection appended to `### Round 4: Review`. Three-step procedure spelled out (locate contract / trace verbatim / flag narrowing as HIGH). All three S45 precedents documented in detail (B-163 Phase 3 narrowing / B-164 R4 M-1 dedup-test final-state-only / B-132 preMark position-only). Required `"Contract-vs-implementation diff: clean"` finding line when no narrowing found. Fast Track tier: R4 review skipped (doc-only edit), R5 N/A.
- **Assigned To**: [product-manager] (R1) → [scrum-master] (R3 CLAUDE.md edit)
- **Blockers**: none
- **Feature Context**: extend the "Round 4: Review" section in CLAUDE.md with a "Contract-vs-implementation diff gate" subsection. R4 [code-reviewer] must trace each implementation predicate against the R1/R2 contract wording verbatim and flag any narrowing as HIGH-severity.
- **Handoff Notes**: cite the three S45 precedents as concrete examples.
- **Parallel Opportunity**: independent.

### [B-171] Reusable diagnostic-trace helper

- **Tier**: Fast Track (XS) — new tiny module
- **Priority**: P3
- **Status**: **R4 REVIEW DONE (2026-06-02)** — 0 CRIT / 0 HIGH / 1 MED / 5 LOW. **Convergent finding (caught by BOTH code-reviewer + security-reviewer independently)**: `recordTrace`/`readTraces`/`clearTraces` catch blocks swallow `console.warn` then return `undefined`, deviating from R1 AC2 contract wording "Returns the Promise from chrome.storage.local.set". This is the FIRST application of the brand-new B-170 contract-vs-implementation diff gate — and it caught the gap on first use. Two paths: (a) propagate rejection per literal contract; (b) amend contract at R6 As-Built (security-reviewer rationale: "diagnostic instrumentation must never break the caller"). Other LOWs: DIAG_KEY_PREFIX export widening (intentional), JSDoc "Filed B-171" line (remove), unbounded payload-size DoS risk (soft cap recommended), implicit key sanitization (allow-list guard recommended), no error-path test. Fast Track tier: R5 skipped per CLAUDE.md.
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
