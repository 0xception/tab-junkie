# Current Sprint

**Sprint 38 — Bug-fix anchor sprint (planned 2026-04-28)**

Four-item sprint: 2 P0/P1 regressions (shared R0 spike) + 1 retro process polish + 1 unblocked S37 follow-up cleanup.

- **Branch**: `feature/sprint-38-bugfix` (off `release/v2` — pending PR #41 merge)
- **Target version**: v1.32.0 (release/v2 only — no main merge per established pattern)
- **Test baseline at kickoff**: 1,641/1,641
- **Anchors**: B-125 (P0/M Spike-First) + B-121 (P1/M Spike-First) — **merged R0 spike** investigates the shared tab-claims/opener-chain/drift subsystem
- **Wave 1 (parallel with anchors)**: B-120 + B-126 (both Fast Track XS, independent)

---

## Active Items

### [B-125] Tab claim ownership jump on URL navigation (P0 — anchor #1)
- **Tier**: Spike-First (R0 + Full M)
- **Status**: R0 ✅ → R1 ✅ → R2 ✅ → R3 ✅ → R4 ✅ → R5 ✅ (UAT plan at `docs/UAT_B-125.md` — 8 cases) → R6 ✅ (§59.10 As-Built appended; zero schema/contract/manifest impact confirmed) → **DONE per Full tier** (R7 skipped — internal SW-memory change, no user-visible UI)
- **Assigned To**: closed
- **R0 finding**: NOT a B-099 release-path regression. Root cause: `tab-claims.js:193-219` `reevaluateTab` auto-claim branch fires for opener-chain-spawned new tabs, stealing them from their intended floating-group inheritance. Confidence: 75%.
- **R1 lock**: Q1 mechanism = `inheritedTabs: Set<number>` ephemeral SW-memory marker, populated after `appendFloatingGroup` resolves; `reevaluateTab` checks `inheritedTabs.has(tabId)` and skips if present; pruned on `tab.onRemoved`. Q2 B-099 release-path guard — call-site count must remain at exactly 4 post-fix. Q3 user-initiated tabs still auto-claim. Q4 OOS — no storage/message/manifest/UI changes.
- **R2-VERIFY for [solution-architect]**: (1) `opener-chain.js` exact line offsets for `openerMap` + `walkOpenerChain`; (2) `releaseClaimByTab` 4 call sites confirmed (`tab-events.js:202` + `tab-events.js:280` + `storage-handlers.js:331` + `storage-handlers.js:396`); (3) which module owns `inheritedTabs` (tab-claims.js vs tab-events.js); (4) `__resetTabClaims` (or equivalent) must also reset `inheritedTabs`.
- **R3 estimate**: ~50 LOC across 2-3 files. No storage schema or message contract change.
- **Sequencing**: B-125 R3 lands BEFORE B-121 R3 to satisfy B-121 AC8(iv) cleanly.
- **Repro context**: open `https://xcelenergy.sharepoint.com/` (claimed by bookmark "The Source") → click in-page link to a Workday URL → observe two duplicate "Home - Workday" rows in sidepanel + a new tab opens each time
- **Initial hypothesis surface (R0 to validate or refute)**:
  - (a) B-099 Option B regression — `chrome.tabs.onUpdated` URL-change handler releasing original claim instead of marking drifted
  - (b) Opener-chain race — `tab-events.js:140-171` `recordOpener` + `appendFloatingGroup` firing on the SAME tab as the URL change → double-handling
  - (c) Erroneous `releaseClaimByTab` call on URL-change instead of tab-removal
  - (d) URL normalization mismatch causing claim re-assignment
  - (e) Multi-window or duplicate-URL disambiguation regression (B-102/B-103 territory)
  - (f) `target="_blank"` link spawning new tab independently — original tab's claim breaking simultaneously due to a separate code path
  - (g) `MSG_LIST_ITEMS` post-broadcast filter regression causing duplicate row rendering
- **Handoff Notes for R0 [solution-architect]**: investigate the entire `background/tabs/` subsystem holistically (this spike serves both B-125 and B-121); produce a feasibility doc enumerating ALL causes for both bugs + per-cause smoke-repro + which cause is actually firing in production. R0 output decides whether B-125 and B-121 share a fix (one R3) or need separate fixes (two R3 parallel runs).
- **Files Changed**: TBD by R3
- **Parallel Opportunity**: R0 merged with B-121

### [B-121] Floating tab opener-chain inheritance regression (P1 — anchor #2)
- **Tier**: Spike-First (R0 + Full M)
- **Status**: R0 ✅ → R1 ✅ → R2 ✅ → R3 ✅ → R4 ✅ (FIX-AND-REPROCEED resolved — see SPRINT.md history) → R5 ✅ (UAT plan at `docs/UAT_B-121.md` — 15 cases) → R6 ✅ (§60.14 As-Built appended; schema v1→v2 + `MSG_LIST_ITEMS.floatingMembers` field + 0 manifest changes confirmed; rollback plan documented) → **DONE per Full tier**
- **Assigned To**: closed
- **R3 fix-scope size**: ~1,050 LOC across 18 files (11 source + 7 test). NEW files: `background/tabs/floating-members.js`, `tests/b121-floating-group-render.test.js`. Complexity: MEDIUM-HIGH.
- **C-correctness flags from R2**: C-1 (schema v1→v2 bump — CHANGELOG must include SW module-cache flush note), C-2 (`floatingMembers` typedef + `FloatingMember` typedef in `shared/messages.js`, OPTIONAL on response), C-3 (cold-start safe — `reassociateFloatingGroups` no longer overwrites `claimsMirror`), C-4 (parentItemId stability), C-9 (4 empty states documented).
- **B-119+B-126 enumeration**: 7 test files require updates (b099 line 284, b013 lines 60-77, b018 lines 65-70/96-97/195-199 + new ~372, floating-shape lines 20-90 field rename, floating-multi seeds, floating-position seeds, demote-item lines 161/186; b036-newtab 10 sites are optional padding only).
- **R0 finding**: NOT a broadcast-scope regression. Root cause: NO runtime render path for `tj:floatingGroups`. The "appears under parent group" UX was never fully wired in original B-013 — latent feature gap. Confidence: 90%.
- **R1 lock**: Q1 — `floatingMembers: Record<groupId, Array<{tabId, url, windowId, tabIndex}>>` added to `MSG_LIST_ITEMS`. Q2 — synthetic `.item-row` rows directly under parent group. Q3 — all 3 surfaces (sidepanel + newtab + standalone). Q4 — R2 redesigns `appendFloatingGroup` schema to prevent parent-claim overwrite (3 options for R2 to pick from). Q5 — B-124 visual distinction OUT of scope. Q6 — OOS list locked.
- **R2-VERIFY for [solution-architect]** (9 markers): floatingMembers array-item shape; sidepanel.js + newtab.js + standalone exact line numbers; whether other test files pin old MSG_LIST_ITEMS shape; b018 lines for claim-state assertions; `tj:floatingGroups` schema version bump (depends on Q4 choice); B-021/B-052 perf budgets exact numbers; (one stray marker about tokyo-night/system tints carried from a B-117 template — disregard).
- **R3 fix-scope at R2 must include B-119 enumeration**:
  - `tests/b099-drift-fix.test.js:284` (T6) — `buildOpenTabs()` exclusion update
  - `tests/b013-opener-chain.test.js` AC1/AC9 — assert runtime visibility (floatingMembers + openTabs exclusion)
  - `tests/b018-persistence.test.js` — assert parent's claim NOT overwritten post-reassociation (Q4/AC7 fix)
- **Sequencing**: B-121 R3 starts AFTER B-125 R3 lands (cleanest for AC8(iv)). R2 can run in parallel (design only).
- **Files Changed**: TBD by R3.
- **Repro context**: any new-tab gesture from a bookmarked page (Ctrl+click, middle-click, shift+click, "open in new tab", "open in new window") fails to inherit the bookmark's group; new tab appears in Open Tabs section instead of under the bookmark. All surfaces affected (sidepanel, standalone, newtab page).
- **Top suspect (R0 to validate)**: `background/tabs/tab-events.js:165` broadcasts `SCOPE.LIVE_STATE` after `appendFloatingGroup`, but per B-010 AC8, `liveState` only patches `data-live`/`data-active`/`data-audible` attrs on existing rows — does NOT trigger structural re-render. The new tab needs to MOVE from Open Tabs into its parent group, which requires `items` or `openTabs` scope.
- **Other R0 candidates**: see backlog row B-121 (a)–(f) — sidepanel render code ignoring floating-group resolution, newtab/standalone never wired floating-groups, opener-chain hop-limit, double-claim race
- **Handoff Notes**: same merged R0 spike as B-125; both items investigated together
- **Files Changed**: TBD by R3
- **Parallel Opportunity**: R0 merged with B-125

### [B-120] Stale-test-docblock prose corrections (Wave 1)
- **Tier**: Fast Track (XS)
- **Status**: R1 ✅ → R3 ✅ → R4 ✅ (PROCEED — 0 findings any tier; numerical accuracy + cross-references verified) → **DONE per Fast Track tier**
- **Files Changed**: `tests/b114-tint-v2.test.js` lines 4-13, `tests/b104-group-colors.test.js` lines 382-396 (docblock prose only — zero assertion changes)
- **Feature Context**: stale prose in `tests/b114-tint-v2.test.js:8-13` and `tests/b104-group-colors.test.js:382-391` — both reference now-incorrect pre-B-117 contrast values ("4.55:1 PASS" / "4.78:1 worst-case"). Update to post-B-117 values from §57.2 matrix.
- **Handoff Notes**: ACs already drafted in BACKLOG.md row; R1 [product-manager] should validate/lock per the B-118 source-citation gate
- **Files Changed**: 2 test files (docblock comments only — zero assertion changes)
- **Parallel Opportunity**: R3 build can run parallel with B-121/B-125 anchors (different files) and with B-126

### [B-126] Expand B-119 contract definition for CSS-token invariants (retro action — Wave 1)
- **Tier**: Fast Track (XS)
- **Status**: R1 ✅ → R3 ✅ → R4 ✅ (PROCEED — 0 findings; bundled review with B-120) → **DONE per Fast Track tier**
- **Files Changed**: `CLAUDE.md` lines 378-388 (Fix-scope test-assertion enumeration subsection expanded)
- **Feature Context**: S37 retrospective HIGH action item #1 — the B-119 contract just shipped this sprint had a definition gap (DOM/ARIA/message/selector only) that missed `tests/b114-tint-v2.test.js` T1's CSS-token invariant assertion, forcing mid-R3 scope expansion. Amend CLAUDE.md to expand the contract-change definition.
- **Handoff Notes**: ACs already drafted in BACKLOG.md row; matches B-118/B-119 precedent. R1 [product-manager] validates and locks.
- **Files Changed**: `CLAUDE.md` (R2 Architecture section only)
- **Parallel Opportunity**: R3 build can run parallel with B-120 + B-121/B-125 anchors

---

## Completed This Sprint

| Item | Tier | LOC | Tests | Notes |
|------|------|-----|-------|-------|
| **B-125** Tab claim ownership jump | Spike-First (R0 + Full M) | 63 src | +5 (T1–T5) | `inheritedTabs: Set<number>` ephemeral SW marker; `markInherited`/`isInherited`/`pruneInherited`; reevaluateTab gate inside `!alreadyClaimed` branch; symmetric prune in `tabs.onRemoved` + `windows.onRemoved` cascade. Zero schema/contract/manifest impact. Files: `background/tabs/tab-claims.js`, `background/tabs/tab-events.js`, `tests/b125-claim-jump-fix.test.js`. R6 As-Built at `docs/design/59-b-125-claim-jump-fix.md` §59.10. UAT plan at `docs/UAT_B-125.md` (8 cases). |
| **B-121** Floating tab opener-chain render | Spike-First (R0 + Full M) | ~1,800 src+test | +13 (T-121-A..O minus deferred letters) | `floatingMembers` field on `MSG_LIST_ITEMS`; synthetic `[data-floating="true"]` rows under parent group sections in sidepanel + newtab; schema v1→v2 lazy migration (`KNOWN_VERSION` 1→2 + no-op step + `defaultShape` seed); cascade prune for `MSG_DELETE_ITEM` + `MSG_BULK_DELETE_ITEMS` + `MSG_DELETE_GROUP`; `buildOpenTabs(floatingTabIds)` exclusion; newtab close button + ENTER/SPACE keyboard activation; ARIA fallback for floating-row selection. R4 outcome: 1 CRIT + 4 HIGH + 3 MEDIUM all resolved in fix-and-reproceed. R6 As-Built at `docs/design/60-b-121-floating-tab-render.md` §60.14. UAT plan at `docs/UAT_B-121.md` (15 cases). |
| **B-120** Stale test docblock prose | Fast Track XS | 0 src | 0 (docblock-only) | `tests/b114-tint-v2.test.js` + `tests/b104-group-colors.test.js` docblock prose corrected to post-B-117 contrast values. Zero assertion changes. R4 PROCEED clean. |
| **B-126** Expand B-119 for CSS-token invariants | Fast Track XS | 0 src (CLAUDE.md only) | 0 | `CLAUDE.md` Fix-scope test-assertion enumeration subsection extended to include CSS-token invariants. Sprint 37 R3 b114 T1 escalation added as 2nd blocking precedent. R4 PROCEED clean. |

**Sprint totals**: 4/4 items shipped · **1,663/1,663 tests passing** (1,641 baseline + 22 net adds: 5 B-125 + 13 B-121 + 1 floating-shape + 3 fix-round adds) · `./build.sh` exit 0 · `tab-junkie.zip` 348 KB / 87 files.

---

## Sprint Retrospective — Sprint 38

### Velocity
- **Planned**: 4 items / 2×M (Spike-First) + 2×XS (Fast Track) = ~6 effort units
- **Completed**: 4 items / same scope
- **Carried over**: 0

### What Went Well
- **Merged R0 spike** (B-125 + B-121) was the right call — one solution-architect investigation produced two refuted hypotheses + two correct root causes in a single pass. Saved an estimated 1.5× agent-hours vs two separate spikes. The pattern is reusable for any future "two related bugs in the same subsystem" trio.
- **B-118 source-citation gate** (shipped S37) had its first real-world test this sprint and worked. R1 across all 4 items cited `file:line` against verified sources; zero R2 binding-correction surprises (vs S36's three-correction trio that motivated the gate).
- **B-126 enumeration expansion** caught and prevented at least one mid-R3 scope-explosion: the B-121 R3 fix-scope subsection covered the CSS-token-invariant test-file impact at R2-time, allowing R3 to update all 7 enumerated test files atomically with no mid-build expansion.

### What to Improve
- **R3 under-scoped the newtab close-button affordance** (B-121 H-1 from code-reviewer + qa). R2 §60.6.2(c) AC6 was clear; R3 deferred with a "future enhancement" comment. The R4 fix-and-reproceed cycle caught it but cost ~30 min of additional review + fix loop. Lesson: when R3 sees a "future enhancement" temptation, the right action is to STOP and escalate to scrum-master, not silently defer past R4.
- **`KNOWN_VERSION` bump was missed at R3** (B-121 CRIT C-1). R2 §60.4.7 was unambiguous; R3 chose lazy migration (correct for data) but skipped the version bump (incorrect — governance, not data). Lesson: schema-version increments are independent of data-rewrite strategy. R2 designs should split these into two checkbox items so R3 can't conflate them.
- **Cascade-prune asymmetry** between single-delete and bulk/group-delete (security M-1 + M-2) was a pure oversight in R3. The lazy fallback in `buildFloatingMembers` masked the gap until [security-reviewer] flagged it. Lesson: when adding a cascade for one entry-point of a multi-entry-point write surface, R2 fix-scope should enumerate ALL entry-points; R3 should grep for siblings before claiming the cascade is complete.

### Action Items for Next Sprint
- [ ] **HIGH (process)**: When R3 considers a "future enhancement" deferral on an AC-locked behavior, require an explicit STOP-and-escalate to scrum-master (not a silent in-code comment). File as a CLAUDE.md edit P3/XS for S39.
- [ ] **MEDIUM (process)**: R2 design template — split schema-version-bump and data-migration-strategy into two separate checkbox items so R3 cannot conflate them. File as a CLAUDE.md edit P3/XS for S39.
- [ ] **MEDIUM (process)**: When R2 fix-scope adds a cascade-prune to one delete entry-point, R3 must grep for sibling delete entry-points (`MSG_DELETE_*`, `bulkDelete*`, etc.) and verify cascade parity before claiming complete. File as a CLAUDE.md edit P3/XS for S39.

### Lessons captured for future reference
- **Pattern proven**: Merged R0 spike for two related-subsystem bugs (B-125 + B-121).
- **Pattern proven**: B-118 source-citation gate prevents R2 binding-correction class of failures.
- **Pattern proven**: B-119 + B-126 fix-scope enumeration extends to CSS-token + storage-schema contracts.
- **New pattern (S38)**: Cascade-prune sibling-grep gate (action item above).
- **New pattern (S38)**: Schema-version-bump-vs-data-migration split (action item above).

---

## Blockers

*None.*

---

## Pipeline Plan

**Wave 0 (parallel R0 + R1)**:
- [solution-architect] R0 merged spike for B-125 + B-121 (single agent investigates `background/tabs/` subsystem holistically)
- [product-manager] R1 for B-120 (parallel — independent)
- [product-manager] R1 for B-126 (parallel — independent)

**Anchor path (B-125 + B-121)**:
- R0 ([solution-architect] merged spike) → R1 ([product-manager] per item, possibly merged if R0 finds shared root cause) → R2 ([solution-architect]) → R3 ([frontend-engineer], possibly bundled if shared fix) → R4 (3 reviewers parallel) → fix CRIT/HIGH → R5 ([test-engineer] tests + UAT plans) → R6 → R7 (conditional)

**Wave 1 path (B-120 + B-126, both Fast Track XS)**:
- R1 → R3 → R4 (code + security parallel — qa skipped per Fast Track) → run existing test suite → done
- B-120 + B-126 R3 can be bundled (single agent edits both surfaces — `tests/*.test.js` docblocks + `CLAUDE.md` R2) for atomicity, or run as separate agents

**Sprint close**:
- Gate 4 release checklist → Gate 7 retrospective → [release-manager] for v1.32.0 (cut tag on `release/v2`, skip `gh release create` per pattern)

---

## Pending UAT (Sprint 36 + Sprint 37 — carry-forward tracking)

Product-owner manual UAT in Edge for v1.30.0 + v1.31.0. Not blocking S38 close per established pattern, but should be cleared before any v2 → main merge.

**Sprint 36 (v1.30.0)**: B-107, B-108, B-109, B-110, B-111, B-112, B-113, B-114, B-115 — all UAT pending
**Sprint 37 (v1.31.0)**: B-117 UAT-1..UAT-10 pending (`docs/UAT_B-117.md`)
**Sprint 38 anchors will add**: B-125 + B-121 will need UAT plans authored at R5

---

## Backlog (S39+ candidates)

After S38 close — pending product-owner triage:

- **B-122** (sub-group drag-to-root, P2/S · S37 follow-up · feature gap)
- **B-041** (sync tab order, P2/L · pre-S33) — last big v2 feature
- **B-076** (MIGRATION_STEPS hook, P2/S · pre-S33) — passive placeholder
- **B-086** (sidepanel UI/UX umbrella, P3/M · pre-S33)
- **B-123** (item-row alignment, P3/XS · S37 follow-up)
- **B-124** (floating-tab visual distinction, P3/S · S37 follow-up · design Q&A required at R1; depends on B-121 close)
- **R-2 / R-3** (S37 retro action items 2 & 3 — to be filed as B-127/B-128 if/when sprint capacity exists)

---

## Pre-flight reminders for S38 kickoff

When the product-owner says "proceed":
- [scrum-master] launches the merged R0 [solution-architect] spike for B-125 + B-121 + B-120 R1 + B-126 R1 — **3 agents in parallel** (single message)
- [product-manager] applies the **B-118 source-citation gate** (shipped S37): every R1 source-code claim must cite `file:line` or be marked `R2-VERIFY`
- [solution-architect] R2 chapter for B-125 / B-121 MUST include the **B-119 fix-scope test-assertion enumeration** subsection — and per **B-126 (in this sprint)**, that enumeration covers CSS-token invariants too once B-126 ships

---

## Gate 6 — Sprint Readiness Verification

- ✅ Total sprint effort fits — 2×M + 2×XS = manageable; merged R0 spike reduces total agent-hours vs two separate spikes
- ✅ No unresolved blockers from S37 (closed; PR #41 open against `release/v2`)
- ✅ Deps-resolved check:
  - **B-125** deps: B-001c ✅, B-001d ✅, B-010 ✅, B-099 ✅, B-100 ✅, B-102 ✅, B-103 ✅ (all done)
  - **B-121** deps: B-013 ✅, B-018 ✅, B-055 ✅, B-099 ✅ (all done)
  - **B-120** deps: B-117 ✅ (closed in S37, now unblocked)
  - **B-126** deps: B-119 ✅ (shipped S37)
- ✅ All sprint items in BACKLOG.md as `in-progress` / `Sprint 38`
- ✅ SPRINT.md "Active Items" populated (this section)
- ⚠️ B-125 + B-121 R1 ACs need refinement post-R0 spike — current backlog entries are R0-spike-scope outlines (this is BY DESIGN for Spike-First tier)
- ⚠️ B-120 + B-126 R1 ACs are drafted in BACKLOG.md but R1 [product-manager] should still validate per the source-citation gate they're applying

**Gate 6 status: PASS** (with R0/R1 refinement notes; no blocking gaps).
