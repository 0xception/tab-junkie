# Current Sprint

**Sprint 43 — Drag/drop + claim-drift reliability investigation (kicked off 2026-05-01)**

Mixed-tier sprint: 1 P1/XL Spike-First anchor (B-150 — Q1 ATTACH exception + Q2 lost-sync investigation) + 3 P3/XS Fast-Track CLAUDE.md edits from S42 retrospective (B-151/B-152/B-153). Bug-investigation focus per product-owner feedback at S42 close: "we keep losing sync."

- **Branch**: `feature/sprint-43-claim-drift-reliability` off `release/v2` (post-S42 close at `24d44fa` · v1.36.0 tagged)
- **Target version**: TBD (likely v1.37.0 if R0 produces fix items; could also bundle as v1.36.1 hotfix if scope is tight)
- **Test baseline at kickoff**: 1,892 / 1,892 PASS
- **Anchor**: B-150 (P1/XL Spike-First — claim/drift/drag investigation; one R0 spike covering both Q1 and Q2)
- **Pipeline**: R0 spike → scope decision (post-spike) → fix items per R0 output
- **Cleanup mode**: lean ceremony per S41-end product-owner direction. Bug-fix loops may bypass full pipeline ceremony if R0 reveals tight, well-bounded fixes.

---

## Active Items

### [B-150] Drag/drop + claim-drift reliability — Q1 ATTACH + Q2 lost-sync (anchor)
- **Tier**: Tier 3 — Spike-First (XL)
- **Status**: R0 spike pending — paused for product-owner Q1 SW console error capture
- **Assigned To**: [scrum-master] orchestrating; R0 spike will dispatch to a focused investigation agent OR run inline depending on scope after error capture
- **Blockers**: Q1 SW console error text (product-owner action — capture from sidepanel devtools `[tab-junkie:b134] tab-drag drop failed` log line)
- **Feature Context**:
  - **Q1 (drag-drop)**: dragging an Open Tab into a group's floating area (op 3 ATTACH) throws an exception, surfacing the generic `"Couldn't move tab — try again."` toast at `sidepanel/sidepanel.js:4784`. NOT the structured ERR_RACE "Cannot attach to an empty group" path — actual exception in one of three call sites (sendMessage rejection / chrome.runtime.lastError / upstream throw).
  - **Q2 (lost-sync)**: saved-bookmark claims dropping across multi-action sequences (extension reload + sync-to-Chrome + drag-and-drop + tab navigation). Continuation of B-149 hypothesis space — mechanism (c) was fixed in S41 (commit `eaff700`), mechanisms (a/b/d) still open.
  - The two symptoms touch the same architectural neighborhood (`claimsMirror` + `inheritedTabs` + `tj:floatingGroups` + drift detector). Single R0 spike umbrella; spike output decides whether to fix as one item or split.
- **R0 spike scope**:
  1. With user-captured Q1 error, identify the throwing call-site and the specific error code/message.
  2. Instrument `claimsMirror` mutations + `releaseClaimByTab` call sites + `reconcileClaims` Phase 1+2 outcomes + `chrome.storage.session.tj:tabClaims` writes/reads.
  3. Walk the multi-action sequence (sync → drag → reload → navigate) with logs on.
  4. Identify which path is dropping claims.
  5. Output: feasibility + 1-3 fix-item candidates + decomposition decision.
- **Likely R0 candidates worth probing first**:
  - Sync-to-Chrome `chrome.tabs.move` array reorder churning B-137 tier-b position-fallback — `isSyncInFlight()` flag suppresses floating re-bind but does NOT touch claim reconcile paths.
  - DETACH (op 4) leaving stale claim entry in `claimsMirror`.
  - Cold-start `reconcileClaims` cumulative state from prior sessions.
  - Multi-URL-change rapid drift-detector races.
- **Files Changed (R0 — instrumentation only, will not ship)**: TBD.
- **Files Changed (post-R0 fix items)**: TBD.
- **Parallel Opportunity**: B-151/152/153 CLAUDE.md piggybacks run alongside; zero code coupling.

### [B-151] CLAUDE.md edit — Fix-scope DOM-structural pins (Fast-Track XS)
- **Tier**: Tier 1 — Fast Track (XS)
- **Status**: requirements → build → code-review → security-review → done
- **Assigned To**: [frontend-engineer] (R3 — bundle dispatch with B-152 + B-153)
- **S42 retro action item**: #1 (third-occurrence pattern: S36 B-113 D-3 + S37 B-117 R3 + S42 B-041 D-1)
- **Feature Context**: extend "Fix-scope test-assertion enumeration" subsection (under ROUND 2: Architecture in CLAUDE.md) to add "DOM-structure assertions on shared surfaces (fieldset counts, section orders, selector-coverage enumerations on settings/sidepanel/newtab/popup pages)" alongside the existing CSS-token-invariant precedent.
- **Files Changed**: `CLAUDE.md` (single edit).

### [B-152] CLAUDE.md edit — C-15 R2 checklist for browser-API rejection-string verification (Fast-Track XS)
- **Tier**: Tier 1 — Fast Track (XS)
- **Status**: requirements → build → code-review → security-review → done
- **Assigned To**: [frontend-engineer] (R3 — bundle dispatch with B-151 + B-153)
- **S42 retro action item**: #2 (caught at R4 fix-round in S42 — `_classifyError` mock-vs-real Chrome string mismatch, security M-1 + code M-4 + qa root-cause converged)
- **Feature Context**: add C-15 to the R2 Correctness Checklist table — "Browser-API rejection-string contract verification" with 30-second SW REPL probe + mock-must-emit-verified-format requirement.
- **Files Changed**: `CLAUDE.md` (single edit).

### [B-153] CLAUDE.md edit — Shared-surface consumer inventory in R2 (Fast-Track XS)
- **Tier**: Tier 1 — Fast Track (XS)
- **Status**: requirements → build → code-review → security-review → done
- **Assigned To**: [frontend-engineer] (R3 — bundle dispatch with B-151 + B-152)
- **S42 retro action item**: #3 (S42 B-041 R4 H-2 ghost-timer race surfaced new shared module need)
- **Feature Context**: extend "Shared File Governance" subsection to require — when an R2 chapter introduces a new consumer of any shared `#settings-*` / `#sidepanel-*` / `#newtab-*` / `#popup-*` element OR shared module-level state (timers, mirrors, maps) — an explicit "shared-surface consumer inventory" subsection.
- **Files Changed**: `CLAUDE.md` (single edit).

---

## Completed This Sprint

_(none yet)_

---

## Gate 6 — Sprint Readiness Verification

- ✅ User stories written by [product-manager] — B-150 / B-151 / B-152 / B-153 rows in BACKLOG.md
- ✅ ACs defined (B-151/152/153 are CLAUDE.md edit scope statements; B-150 R0 spike scope listed in row + this file)
- ✅ Priority + effort assigned — B-150 P1/XL Spike-First · B-151/152/153 P3/XS Fast-Track
- ✅ Dependencies — B-150 depends on B-099 ✅, B-110 ✅, B-125 ✅, B-132 ✅, B-134 ✅, B-137 ✅, B-149 ✅ — all done
- ✅ Total sprint effort fits — ~7-9 effort units (XL anchor: 4 + 3×XS: 3 = 7; + R0 spike split potential)
- ✅ R2 architecture review — B-150 R2 happens AFTER R0 produces concrete fix items; B-151/152/153 skip R2 (Fast-Track)
- ✅ Performance ACs — N/A for CLAUDE.md edits; B-150 instrumentation must not ship in production builds
- ✅ Destructive-action confirmation — N/A (instrumentation + CLAUDE.md edits only)
- ✅ No unresolved blockers from S42 (closed at `24d44fa` · v1.36.0 tagged + pushed)
- ✅ Branch created — `feature/sprint-43-claim-drift-reliability` off `release/v2`
- ✅ Findings file scaffold — `docs/findings/sprint-43.md` to be pre-created if R4 reviewers needed for B-150 fix items

**Gate 6 status**: PASS — sprint ready to launch CLAUDE.md piggybacks immediately. R0 spike on B-150 paused awaiting Q1 SW console error capture from product-owner.

---

## Carried over from S42

_None._

S42 deferred MEDs/LOWs from `docs/findings/sprint-42.md` (zero-result toast copy, code M-1 concurrent-sync guard, qa M-3 raw err.message in catch, etc.) remain in the findings file as future-iteration polish; not in S43 scope unless R0 surfaces them as related to the lost-sync investigation.

---

## Pipeline State

| Item | Round | Agent | Status | Notes |
|------|-------|-------|--------|-------|
| B-150 | R0 spike | [scrum-master] orchestrating | **paused — awaiting Q1 SW console error capture** | Will dispatch focused investigation agent OR run inline based on scope post-error |
| B-151 | R3 | [frontend-engineer] | pending — single-bundle dispatch with B-152/B-153 | CLAUDE.md edit |
| B-152 | R3 | [frontend-engineer] | pending — single-bundle dispatch with B-151/B-153 | CLAUDE.md edit |
| B-153 | R3 | [frontend-engineer] | pending — single-bundle dispatch with B-151/B-152 | CLAUDE.md edit |
| All R4 (B-150 + piggybacks) | code-review + security-review | TBD | pending | Findings → `docs/findings/sprint-43.md` (pre-create at R4 dispatch) |
