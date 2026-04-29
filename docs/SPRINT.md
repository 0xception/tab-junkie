# Current Sprint

**Sprint 37 closed 2026-04-28 — v1.31.0 prepared on `release/v2` (release-manager run pending). All 3 items pipeline-complete; product-owner UAT for B-117 carried forward.**

The Sprint 37 retrospective and per-item close notes will be archived to `docs/SPRINT_ARCHIVE.md` once `[release-manager]` completes the version bump + build + tag.

---

## Active Items

*None — sprint closed.*

---

## Completed This Sprint

### [B-117] §47.7 group-color WCAG AA matrix re-verification — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-28
- **Pipeline**: R1 ✅ · R2 ✅ (§57) · R3 ✅ · R4 ✅ (3 reviewers — 0 CRIT / 0 HIGH / 1 MEDIUM / 4 LOW) · R5 ✅ (1,641 tests, +3 gap-fill, UAT plan) · R6 ✅ (§47.7 + §57.12) · R7 ✅ (user-manual + CHANGELOG)
- **Files changed**:
  - `shared/themes.css` — 4 tint-amount edits (atom-one-dark/one-dark/legacy `dark` 20%→7%, dracula 20%→17%) + comment-block corrections at B-114 inline (lines 438–448) + `:root` block
  - `tests/b117-gc-matrix-audit.test.js` (NEW) — 137 tests covering 126 cells + 9 AAL tuples + 3 drift guards; 136 ms runtime
  - `tests/b114-tint-v2.test.js` — T1 redesigned to table-driven `expectedTintByTheme` map
  - `docs/design/57-b-117-gc-matrix-audit.md` (NEW chapter at R2; §57.12 As-Built appended at R6)
  - `docs/design/47-b-104-themed-group-colors.md` §47.7 — replaced with post-B-117 verified matrix
  - `docs/SOLUTION_DESIGN.md` — TOC entry for §57
  - `docs/user-manual/themes.md` — new "Theme accessibility limitations" subsection (9 solarized-dark cells)
  - `CHANGELOG.md` — v1.31.0 entry
  - `docs/UAT_B-117.md` (NEW) — 10 UAT cases for product-owner Edge run
- **Mid-flight scope adjustments**: §57.9 sentinel-grep gate triggered → 2 stale-prose deferred to **B-120** (filed); b114 T1 active assertion pulled into B-117 scope per [scrum-master] AC11(g) operational clarification
- **R6 precedents established**: (1) AC11(g) "test-file lock" must distinguish stale prose vs active assertions of changed invariants; (2) B-119 contract-change definition needs to include CSS-token invariants asserted in test files (next-sprint retro action)

### [B-118] R1 source-citation gate (CLAUDE.md edit) — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-28
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (0/0/0/1 LOW cosmetic — backtick vs fenced block, deferred)
- **Files changed**: `CLAUDE.md` lines 347-357 (new "Source-citation gate" mandatory subsection in Round 1: Definition)

### [B-119] R2 fix-scope test-assertion subsection (CLAUDE.md edit) — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-28
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (bundled with B-118)
- **Files changed**: `CLAUDE.md` lines 378-386 (new "Fix-scope test-assertion enumeration" mandatory subsection in Round 2: Architecture)

---

## Pending UAT (Sprint 37 + carried from Sprint 36)

Product-owner manual UAT in Edge. Not blocking sprint close per established pattern (S35/S36 carried UAT forward).

**Sprint 37:**
- **B-117** UAT-1..UAT-10 pending (`docs/UAT_B-117.md`) — particularly UAT-2/-3/-4 visual-UX checks for atom-one-dark/one-dark/dracula at the new tint values

**Sprint 36 carry-forward:**
- B-107, B-108, B-109, B-110, B-111, B-112, B-113, B-114, B-115 — all UAT pending in v1.30.0; should be cleared before any future v2 → main merge

---

## Blockers

*None.*

---

## Gate 4 — Release Checklist (verification)

- ✅ All R4 review findings resolved — 0 CRITICAL / 0 HIGH across all items; 1 MEDIUM addressed in UAT plan; 5 LOW deferred (B-120 + cosmetic + retro notes)
- ✅ All R5 automated tests passing — 1,641/1,641; 136 ms perf for new B-117 file (under 200 ms AC)
- ⚠️ UAT sign-off carried forward to product-owner Edge run — non-blocking per S35/S36 pattern
- ✅ No open blockers in `SPRINT.md`
- ✅ Relevant chapter updated — `docs/design/47-b-104-themed-group-colors.md` §47.7 + new `docs/design/57-b-117-gc-matrix-audit.md` (R2 + R6 As-Built); root `docs/SOLUTION_DESIGN.md` TOC extended (verified at R6)
- ✅ `manifest.json` permissions reviewed — zero new permissions; `git diff manifest.json` empty
- ✅ `./build.sh` produces clean package — 336K zip, 86 files, exit 0
- ✅ Rollback plan documented — single-line `git revert <r3-commit>` (atomic) per §57.12.7
- ✅ README/STORE_LISTING reviewed by [technical-writer] — no changes needed (B-117 is internal a11y polish; B-118/119 are dev-process)
- ⚠️ `BACKLOG.md` updated — pending [scrum-master] post-close edit (B-117/B-118/B-119 → `done`)
- ⚠️ `BACKLOG_BOARD.md` updated — pending [scrum-master] post-close edit (✅ marks + status summary refresh)
- ✅ `SPRINT.md` "Completed This Sprint" section reflects all finished items (this section)
- ⚠️ `SPRINT_ARCHIVE.md` updated — pending [scrum-master] post-release-manager archive

**Gate 4 status: PASS-WITH-PENDING** (the ⚠️ items are mechanical post-close edits that complete during the close-out sequence, not blockers).

---

## Gate 7 — Sprint Retrospective

### Velocity
- **Planned**: 3 items / M + XS + XS effort
- **Completed**: 3 items / M + XS + XS — fully on plan
- **Carried over**: 0 items
- **Test delta**: 1,504 → 1,641 (+137 net) · Zero regressions
- **Items filed mid-sprint**: 1 (B-120 — stale-test-docblock prose, P3/XS, depends on B-117 close, deferred to future Fast Track sprint)

### What Went Well
- **Pipeline parallelization scaled cleanly**: 3 R1 agents in parallel · B-117 R2 in parallel with B-118+B-119 R3 bundle · 3 R4 reviewers in parallel · sprint completed in a single session.
- **§57.9 sentinel-grep gate caught a real issue at R3 entry**: 2 stale-prose comment files identified for follow-up (B-120 filed inline). The gate's STOP-and-escalate semantics worked as designed — better to halt for triage than to silently ship inaccurate documentation.
- **Self-applied source-citation gate (B-118) was operationally usable from the moment it was R1-LOCKED**: B-117 R1, B-118 R1, B-119 R1 all cited `file:line` against `CLAUDE.md` and `tests/b105-...` / `shared/themes.css`. Zero R2 binding-correction surprises this sprint (a meaningful improvement over S36's three R2 binding corrections).
- **B-117 R2 quantitative work (126-cell computation in Node) replaced opinion with evidence**: pre-B-117 §47.7 PASS verdicts at 4.78:1 / 4.55:1 turned out to be inaccurate (atom-one-dark/yellow actually 2.806:1 at 20% tint). The new `tests/b117-gc-matrix-audit.test.js` makes this drift-impossible going forward.

### What to Improve
- **B-119 R2 contract-change definition was too narrow** (DOM/ARIA/message/selector only) — missed the `tests/b114-tint-v2.test.js` T1 active structural assertion of the `--group-header-tint-amount` invariant. R3 hit a mid-build test failure that should have been caught at R2. The CLAUDE.md fix-scope-test-assertion subsection should be expanded next sprint to explicitly include "structural assertions on CSS token values, regex pins on `shared/themes.css` declarations, and any test file that pins a const-value invariant the item is changing." — **B-119 self-application miss; high-value lesson.**
- **R1 AC11(g) "test-file lock" was too coarse**: locking out "B-104, B-106, B-114 test files" prevented R3 from updating active assertions of B-117's changed invariant. Mid-R3 operational clarification was issued, but R1 templates should distinguish stale prose (lock-out, defer to follow-up) vs active assertions of the invariant being changed (always in-scope).
- **§57.9 sentinel-grep gate trigger was over-eager for prose-only matches**: stopped R3 for 4 hits, only 2 of which had any factual concern (the other 2 were coincidental or still-correct). Future gates of this kind should triage by "is this an active assertion or stale comment prose" before STOP-and-escalate, ideally inside the agent without pinging [scrum-master].

### Action Items for Next Sprint (S38)
1. **[product-manager] / [solution-architect]**: amend CLAUDE.md `### Round 2: Architecture` "Fix-scope test-assertion enumeration" subsection (the B-119 contract just shipped this sprint!) to explicitly include CSS-token invariants asserted in test files (regex-pin tests on `shared/themes.css`, `expect-token-eq` patterns, etc.). File as a P2/XS CLAUDE.md edit follow-up. **HIGH** priority — this was the load-bearing miss this sprint.
2. **[product-manager]**: amend CLAUDE.md R1 AC template to distinguish "active assertions of the invariant being changed" (always in-scope) vs "stale prose comments mentioning prior values" (out-of-scope, file as follow-up item). File as P3/XS CLAUDE.md edit follow-up. **MEDIUM** priority.
3. **[scrum-master]**: when an R3 sentinel-grep gate triggers, the agent should triage in-loop (active vs prose) before halting and escalating. Update agent-prompt templates accordingly. **LOW** priority — process polish.

---

## Backlog (next sprint candidates)

User to triage usability/features/bugs before tab-syncing path. Pending list:

- **B-041** (sync tab order, P2/L · pre-S33) — last big v2 feature; deserves its own sprint
- **B-076** (MIGRATION_STEPS hook, P2/S · pre-S33) — passive future-work placeholder
- **B-086** (sidepanel UI/UX umbrella, P3/M · pre-S33)
- **B-120** (NEW — stale-test-docblock prose, P3/XS · S37 follow-up · depends on B-117 close)
- **NEW from S37 retro**: 2-3 CLAUDE.md edit follow-ups (B-119 contract expansion, AC11(g) refinement, gate-triage prompts) — TO BE FILED before next sprint kickoff
- **User-flagged**: "a few other usability/features/bugs to address before tab syncing" — TO BE FILED by user

---

## Pre-flight reminders for next sprint kickoff

When the product-owner approves Sprint 38:
- [scrum-master] performs Gate 6 (Sprint Readiness) verification including the **deps-resolved check** (Gate 6 item 6) for any items depending on B-117 close (e.g., B-120)
- [product-manager] writes/refines R1 — **with the now-shipped source-citation gate (B-118): every R1 source-code claim must cite `file:line` or be marked `R2-VERIFY`**
- [solution-architect] R2 chapters MUST include the now-shipped "Fix-scope test-assertion enumeration" subsection (B-119) — and apply the S37 retrospective action item #1 expanding the definition to include CSS-token invariants asserted in test files

Test count baseline post-S37: **1,641** (post-v1.31.0 release — pending release-manager run).
