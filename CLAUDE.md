# Tab Junkie — CLAUDE.md

## Project Overview

Tab Junkie is a Chromium browser extension that unifies bookmark management and live tab management into a single persistent interface. Tech stack: vanilla JavaScript (ES modules), HTML, CSS, Chrome Extension Manifest V3, browser APIs (`chrome.bookmarks`, `chrome.tabs`, `chrome.windows`, `chrome.storage`, `chrome.sidePanel`, `chrome.runtime`). No backend, no network calls, no analytics — all state lives in the user's local browser profile.

## Build & Load

There is no compile step and no `dist/` folder. The extension loads unpacked directly from the repo root in `chrome://extensions` (Developer Mode on). `./build.sh` produces a `tab-junkie.zip` only for Chrome Web Store submission — it is not needed for local development or testing.

## Branching Strategy

- **`main`** — working v1 of the extension. Do NOT push rewrite work here.
- **`release/v2`** — long-lived integration branch for the v2 rewrite. This is the target for all sprint PRs.
- **Feature branches** — branch off `release/v2`, PR back into `release/v2`. Named per sprint item (e.g., `feature/B-001b`).
- **Final merge** — when v2 is fully baked and tested, one PR from `release/v2` → `main` replaces v1.

## Debugging

When debugging, investigate all potential causes before applying a fix. Don't assume the first issue found is the only one — check for cascading problems (stale `chrome.storage` entries, missing manifest permissions, service worker lifetime, message passing races, tab/bookmark ID drift, event ordering). List ALL potential causes, then propose a fix plan.

## Sprint Workflow

Never start sprint execution or launch agents until the user explicitly says to proceed. Planning and execution are separate phases — wait for approval between them.

## General Rules

Always confirm you are reading files from the correct project directory before reporting status or making changes. Check the current working directory first.

## Agent Bracket Notation — MANDATORY

**Every message, reply, and status update MUST start with the relevant agent name in brackets.** This is the first thing the user sees — it tells them which agent is working.

**Format**: `[agent-name] <message>`

**Examples**:
- `[scrum-master] Sprint 1 has 3 active items. Next action: launch [frontend-engineer] for B-007.`
- `[frontend-engineer] Implementing sidepanel group drag-and-drop. Files changed: ...`
- `[code-reviewer] Reviewing B-007. Found 2 HIGH issues: ...`
- `[test-engineer] UAT results for B-007: PASS (5/5 test cases passed)`

**Rules**:
- Start EVERY response with `[agent-name]` — no exceptions
- When multiple agents are referenced, lead with the primary agent doing the current work
- When reporting on another agent's output, use their bracket: `[security-reviewer] found 3 issues`
- When orchestrating, lead with `[scrum-master]`
- Never write a response without an agent bracket at the beginning

## 10-Agent Roster

This project uses a pruned subset of the full SDLC agent framework. Dropped agents (backend-engineer, ai-ml-engineer, data-analyst, marketing-manager, content-creator, seo-reviewer, tester) do not apply to a local-only browser extension with no backend, no AI, no commercial launch, and no public web surface. The [test-engineer] absorbs UAT duties that would otherwise go to [tester].

| # | Agent | Round | Writes Code? | Files Owned |
|---|-------|-------|-------------|-------------|
| 1 | [scrum-master] | All | No | `docs/SPRINT.md` |
| 2 | [product-manager] | R1 | No | `docs/PRD.md`, `docs/BACKLOG.md`, `docs/BACKLOG_BOARD.md` |
| 3 | [solution-architect] | R2 + R6 | No | `docs/SOLUTION_DESIGN.md` (index) + `docs/design/NN-*.md` (per-chapter slices) |
| 4 | [frontend-engineer] | R3 | Yes | `sidepanel/`, `newtab/`, `popup/`, `components/`, `shared/`, `background/`, `manifest.json` |
| 5 | [code-reviewer] | R4 | No | (reports findings) |
| 6 | [security-reviewer] | R4 | No | (reports findings) |
| 7 | [qa-reviewer] | R4 | No | (reports findings) |
| 8 | [test-engineer] | R5 | Yes | `tests/` + performs UAT |
| 9 | [technical-writer] | R7 | No | `README.md`, `STORE_LISTING.md`, `docs/user-manual/`, `CHANGELOG.md` |
| 10 | [release-manager] | Sprint Close | No | GitHub Releases (via `gh` CLI), `docs/RELEASES.md`, `build.sh` artifacts |

## Agent Model Assignments

**[scrum-master] MUST use these model assignments when launching agents via the Agent tool.** Keep Opus for high-stakes reasoning where errors cascade; use Sonnet for pattern-following, checklist-driven, and structured-output agents.

### Opus (5 agents) — Architecture, security, orchestration, engineering

| Agent | Model | Why Opus |
|-------|-------|----------|
| [scrum-master] | `model: "opus"` | Pipeline orchestration errors cascade. Enforces gates, tiers, parallelization. |
| [solution-architect] | `model: "opus"` | Foundational decisions (storage schema, message contracts, drift detection) are expensive to reverse. Bookends pipeline at R2 + R6. |
| [security-reviewer] | `model: "opus"` | Chrome extension permissions, CSP, and message-passing are high-asymmetric-risk. Missed vulnerability >> saved tokens. |
| [frontend-engineer] | `model: "opus"` | Essentially the entire product. Complex state management across sidepanel/newtab/popup/service worker. |
| [test-engineer] | `model: "opus"` | Test quality determines what bugs ship. Absorbs UAT responsibility for this project. |

### Sonnet (5 agents) — Structured analysis, checklists, documentation, releases

| Agent | Model | Why Sonnet is sufficient |
|-------|-------|------------------------|
| [code-reviewer] | `model: "sonnet"` | Checklist-driven pattern recognition. Opus [security-reviewer] provides overlapping coverage. |
| [qa-reviewer] | `model: "sonnet"` | Checklist-driven (error handling, accessibility, edge cases). Overlapping reviewers in R4. |
| [product-manager] | `model: "sonnet"` | Structured output (user stories, ACs, backlog tables). [solution-architect] validates in R2. |
| [technical-writer] | `model: "sonnet"` | Structured documentation following templates. User reviews all output. |
| [release-manager] | `model: "sonnet"` | Checklist-driven release process. User approves every destructive action. |

### Quality safety net ("Opus Trident")

Every piece of Sonnet-generated code or documentation passes through at least one Opus agent before it can be marked done:
- **[scrum-master]** — Process quality (every gate, every handoff)
- **[solution-architect]** — Architecture quality (R2 design + R6 close verification)
- **[security-reviewer]** — Security quality (R4 validation of all code)

## Sprint Execution Pipeline (7 Rounds)

Execute this pipeline automatically for every sprint item. The [scrum-master] orchestrates between rounds. **The pipeline is tiered by effort size — see Pipeline Tiers below.**

```
ROUND 1 — DEFINITION    ➡️ [product-manager]
ROUND 2 — ARCHITECTURE  ➡️ [solution-architect]
ROUND 3 — BUILD          ➡️ [frontend-engineer]
ROUND 4 — REVIEW         🔀 [code-reviewer] + [security-reviewer] + [qa-reviewer] (PARALLEL)
ROUND 5 — TESTING        ➡️ [test-engineer] writes tests + performs UAT
ROUND 6 — CLOSE          ➡️ [solution-architect] updates the relevant docs/design/NN-*.md chapter (or adds a new chapter if the item merits one)
ROUND 7 — POST-CLOSE     ➡️ [technical-writer] (optional, for user-visible changes)
```

**Sprint-level step (after all per-item rounds complete):**
```
SPRINT CLOSE — Gate 4 → Gate 7 retrospective → [release-manager] release → archive
```

**Pipeline rules:**
- [scrum-master] runs between every round: updates SPRINT.md, routes context to the next agent, identifies parallel opportunities.
- Parallel agents (🔀) MUST be launched simultaneously using multiple Agent tool calls in a single message.
- Sequential agents (➡️) wait for the previous round to complete before starting.
- Review agents (R4) report findings only — they do NOT write code. The [frontend-engineer] fixes findings before proceeding to R5.
- All automated tests (R5) must pass before the item can be marked done. [test-engineer] also performs UAT in the same round.
- [release-manager] runs once per sprint (not per item) — after Gate 7 retrospective passes, before `SPRINT_ARCHIVE.md` archiving. See "Sprint Close Sequence" below.

## Pipeline Tiers

**The pipeline is sized to the item.** Before starting R1, the [scrum-master] reads the effort tag from `BACKLOG.md` and declares the tier in the `SPRINT.md` item.

### Tier 1: Fast Track (Effort: XS or S)
Small items — bug fixes, copy tweaks, minor UI changes.

```
R1  — DEFINITION  ➡️ [product-manager]
R3  — BUILD       ➡️ [frontend-engineer]
R4  — REVIEW      🔀 [code-reviewer] + [security-reviewer]
→ DONE
```

**Skipped:** R2 Architecture · [qa-reviewer] · R5 Testing · R6 Close · R7 Post-Close

**Non-negotiable even on Fast Track:**
- [code-reviewer] and [security-reviewer] always run.
- Existing test suite MUST pass — zero regressions before marking done.
- All code standards apply: no TODOs, no console noise, no broken builds.

**Auto-upgrade rule:** If an XS/S item introduces a new storage schema, new message types, new extension permissions, or cross-cutting changes to drift/matching logic → upgrade to Full (M) tier before build.

### Tier 2: Full Pipeline (Effort: M or L)
Standard items — new features, refactors, multi-component changes. Run all 7 rounds. All mandatory gates apply.

### Tier 3: Spike-First (Effort: XL)
High-complexity items — major architectural changes, storage schema migrations, new subsystems.

```
R0 — SPIKE    ➡️ [solution-architect] discovery spike (before R1)
               Output: feasibility, risk flags, major decisions, sub-item candidates
               Scrum-master reviews — may split item into smaller M/L items before R1
R1–R7 — Full pipeline (all rounds, all mandatory gates)
```

**Enforcement:**
- [scrum-master] MUST record `**Tier**` in the SPRINT.md item at creation.
- Tier is determined by effort tag: XS/S → Fast Track · M/L → Full · XL → Spike-First.
- If scope expands mid-sprint: [scrum-master] reassesses tier and updates SPRINT.md.

## MANDATORY PIPELINE GATES — NEVER SKIP

**These gates are NON-NEGOTIABLE. No sprint item can be marked "done" without passing ALL applicable gates.**

### Gate 1: Review Gate (R4)
After R3 build completes, you MUST launch ALL THREE reviewers before proceeding:
- [code-reviewer] — for ALL items that involve code changes
- [security-reviewer] — for ALL items that involve code changes
- [qa-reviewer] — for ALL items that involve code changes (skipped on Fast Track)

**Enforcement**: After the build round completes, the IMMEDIATE next step is ALWAYS to launch the R4 reviewers. Do NOT ask "should we run reviews?" — just do it. The [frontend-engineer] MUST fix all CRITICAL and HIGH findings before R5.

### Gate 2: Testing Gate (R5)
After R4 review findings are resolved, you MUST run testing:
- [test-engineer] writes automated tests (unit + integration via the chrome API mock)
- [test-engineer] performs manual UAT against the loaded unpacked extension — PASS/FAIL/WARN/SKIP per test case

**Enforcement**: Do NOT skip testing. Do NOT mark items as done without test results. UAT is the final quality gate.

### Gate 3: UAT Acceptance Gate
Before the [scrum-master] can close ANY sprint:
- Every sprint item must have UAT results recorded in `SPRINT.md`
- Every item must have UAT status: PASS
- If any item has UAT FAIL on core flows: it goes back to the [frontend-engineer], NOT to done

### Gate 4: Release Checklist (R6 Close)
The [scrum-master] verifies before closing:
- ✅ All R4 review findings resolved (no open CRITICAL/HIGH issues)
- ✅ All R5 automated tests passing
- ✅ UAT sign-off recorded by [test-engineer] for every item
- ✅ No open blockers in `SPRINT.md`
- ✅ Relevant `docs/design/NN-*.md` chapter updated (or new chapter added) by [solution-architect]. Root `docs/SOLUTION_DESIGN.md` index TOC extended if a new chapter was added.
- ✅ `manifest.json` permissions reviewed — no unnecessary additions
- ✅ `./build.sh` produces a clean package with no errors
- ✅ Rollback plan documented for any storage schema changes
- ✅ README/STORE_LISTING updated for user-facing features ([technical-writer])
- ✅ `BACKLOG.md` updated — all completed items set to `done`
- ✅ `BACKLOG_BOARD.md` updated — progress dashboard, item statuses, and status summary accurate
- ✅ `SPRINT.md` "Completed This Sprint" section reflects all finished items
- ✅ `SPRINT_ARCHIVE.md` updated — this sprint's completed items appended
- → If ANY check fails: route back to the responsible agent. Do NOT close the sprint.

### Gate 5: Backlog Accuracy (Every Item + Every Sprint Close)

**`BACKLOG.md`, `BACKLOG_BOARD.md`, and `SPRINT.md` must be 100% accurate at all times.**

**When work starts on an item:**
- [scrum-master] updates BACKLOG.md: item status `backlog` → `in-progress`
- [scrum-master] updates BACKLOG_BOARD.md: item ⬜ → 🔄
- [scrum-master] updates SPRINT.md: item status to current pipeline step

**Per-item rule (after every item is marked "done"):**
- [scrum-master] updates SPRINT.md (move item to "Completed This Sprint" with files changed)
- [scrum-master] updates BACKLOG.md (set item status from `in-progress` → `done`)
- [scrum-master] updates BACKLOG_BOARD.md (set item from 🔄 → ✅)

**Per-sprint rule (before closing any sprint):**
- [scrum-master] verifies ALL three documents are in sync
- Progress dashboard numbers in BACKLOG_BOARD.md match actual completed counts
- Status summary counts (Done / To Do / Icebox) are recalculated and accurate

### Gate 6: Sprint Readiness (Before Starting Any Sprint)

Before [scrum-master] kicks off R1 for the first item:
- ✅ All sprint items have passed Definition of Ready
- ✅ Total sprint effort is confirmed to fit within the sprint duration
- ✅ Any unresolved blockers from the previous sprint are acknowledged
- ✅ `SPRINT.md` "Active Items" section populated with all planned items
- ✅ `BACKLOG.md` items updated to `in-progress` as work begins
- ✅ **Deps-resolved check**: For every in-scope item, verify each dependency in BACKLOG.md `Dependencies` column is either `done` OR also in this sprint. If any dep is `backlog`, flag for product-owner triage before kickoff. Prevents mid-sprint dependency-gap deferrals.

### Gate 7: Sprint Retrospective (After Every Sprint Close)

After all items are marked done and Gate 4 is verified:

```markdown
## Sprint Retrospective — Sprint [N]
### Velocity
- Planned: [N] items / [total effort]
- Completed: [N] items / [actual effort]
- Carried over: [N] items (with reason)

### What Went Well
- [Up to 3 bullets]

### What to Improve
- [Up to 3 bullets]

### Action Items for Next Sprint
- [ ] [Concrete improvement, assigned to specific agent or process change]
- [ ] [Max 3 items]
```

**Enforcement**: A sprint is NOT closed until the retrospective is written.

### Sprint Close Sequence

After all sprint items are marked "done":

```
1. Gate 4 — [scrum-master] verifies the release checklist
2. Gate 7 — [scrum-master] writes the sprint retrospective
3. RELEASE — [release-manager] executes the release process:
   a. Pre-flight verification (confirms Gate 4 + Gate 7 passed)
   b. Determines semantic version (reflected in manifest.json)
   c. Runs ./build.sh to produce the release zip
   d. Compiles structured release notes from SPRINT.md into docs/RELEASES.md + CHANGELOG.md
   e. Creates PR to main (user approval required before merge)
   f. Tags the release, creates GitHub Release with the built zip attached
   g. Documents rollback commands (git revert + prior version download)
4. ARCHIVE — [scrum-master] archives completed items to SPRINT_ARCHIVE.md
```

**Skip condition**: If a sprint contains zero code changes (documentation/process only), [scrum-master] may skip the release step with an explicit note.

### Definition of Done (MANDATORY for every sprint item)

A sprint item is "done" ONLY when ALL of these are true:
1. ☐ Code complete — no TODOs, no placeholder logic, no `console.log` debug noise
2. ☐ [code-reviewer] reviewed — CRITICAL/HIGH findings fixed
3. ☐ [security-reviewer] reviewed — CRITICAL/HIGH findings fixed
4. ☐ [qa-reviewer] reviewed — CRITICAL/HIGH findings fixed
5. ☐ [test-engineer] automated tests written and passing
6. ☐ [test-engineer] UAT completed with PASS status
7. ☐ `SPRINT.md` updated with files changed and handoff notes
8. ☐ `BACKLOG.md` item status set to `done`
9. ☐ `BACKLOG_BOARD.md` item marked ✅ and progress dashboard updated
10. ☐ [solution-architect] updated the relevant `docs/design/NN-*.md` chapter (or added a new chapter) (R6); root index TOC extended if a new chapter was added
11. ☐ Any new `manifest.json` permissions explicitly justified
12. ☐ Rollback plan documented for any storage schema migration
13. ☐ README/user manual updated by [technical-writer] (if user-facing feature)

**Tier-specific DoD exceptions:**
- **Fast Track (XS/S)**: Items 1, 2, 3, 7, 8, 9 are mandatory. Items 4-6, 10-13 are skipped. Run existing test suite and confirm zero regressions.
- **Full (M/L) and Spike-First (XL)**: All items apply — no exceptions.

### Definition of Ready (MANDATORY before build round R3)

A sprint item is "ready for build" ONLY when ALL of these are true:
1. ☐ User story written by [product-manager]
2. ☐ Acceptance criteria defined — clear, testable, no ambiguity
3. ☐ Priority (P0-P3) and effort (XS-XL) assigned
4. ☐ Dependencies identified and resolved
5. ☐ [solution-architect] architecture review complete (R2)
6. ☐ Performance acceptance criteria defined (if the change affects search, render, or startup paths)
7. ☐ **Destructive-action confirmation explicit on carved-out paths**: when an AC carves out an edge-case path (prefs-only, zero-match, partial-input, etc.), it MUST explicitly state whether destructive-action confirmation is retained or waived on that path, with rationale. Do not rely on readers to infer retention from CLAUDE.md precedence.

**Tier-specific DoR exceptions:**
- **Fast Track (XS/S)**: Items 1-4 are mandatory. Items 5-6 are skipped. Exception: if the item touches storage schema, message passing, or extension permissions, item 5 is mandatory.
- **Full (M/L) and Spike-First (XL)**: All items apply.

## Round-by-Round Execution Details

### Round 1: Definition
- [product-manager]: Write/refine user story + acceptance criteria + priority + effort + dependencies.
- Integrate any user-facing copy decisions into the story.

**DoR Gate 7 check — destructive-action confirmation status (mandatory subsection in every R1 AC block)**

Every R1 AC block MUST include — up front, not buried in an edge-case AC — an explicit statement of whether destructive-action confirmation is retained, waived, or not applicable for the item being authored:

```
**Destructive-action confirmation (DoR item 7)**: retained | waived | N/A — rationale
```

- `retained` — the flow includes (or keeps) a confirmation dialog before any destructive write. State which flow.
- `waived` — confirmation is explicitly omitted. State why the item is safe to bypass confirmation (e.g., undo is trivial, the path is reversible, the user already confirmed upstream).
- `N/A` — the item does not involve destructive actions (read-only UI, non-destructive dialog opens, metadata-only reads, etc.). State the reasoning.

This subsection prevents literal AC readings from silently waiving confirmation dialogs (B-070 Sprint 19 near-miss) and prevents edge-case ACs from being the only place where retention status is documented (B-007 Sprint 20 AC15 reactive placement).

### Round 2: Architecture
- [solution-architect]: Evaluate feature against the existing architecture — read the chapter(s) relevant to the item under `docs/design/NN-*.md` (full chapter list is in the root index `docs/SOLUTION_DESIGN.md`). Do NOT read the root index as a substitute for the chapter content.
- Produce: storage schema changes, message contracts, event flow, component structure, drift-detection impact.
- **R2 Correctness Checklist:**

| # | Check | What to verify |
|---|-------|---------------|
| C-1 | Storage schema versioned | Any change to persisted data shapes must bump a schema version and define a migration path |
| C-2 | Message contracts typed | Every message type has a documented shape with sender/receiver contracts |
| C-3 | Service worker cold-start safe | No assumption that the SW is already running; all entry points must re-hydrate state |
| C-4 | ID stability | Item identity must survive URL drift, rename, and cross-window moves |
| C-5 | Manifest file references resolvable | Every `default_path`, `default_popup`, and `chrome_url_overrides` entry in `manifest.json` must point to a file that exists at extension load time — stub HTML is acceptable |
| C-6 | Permission minimization | Any proposed `manifest.json` permission addition MUST list: (a) why the capability is required, (b) whether any lower-scoped alternative exists (e.g., `activeTab` vs `tabs`), (c) explicit confirmation from [security-reviewer] that the addition is justified. |
| C-7 | Allow-list direction | Any sanitizer, validator, or export surface that filters structured data MUST default to an allow-list (permit known-good fields) rather than a deny-list (strip known-bad fields), per B-067 precedent. Deny-lists are only acceptable when explicitly justified with a blast-radius note in R2 output. |
| C-8 | SW-context feasibility | If the design prescribes a browser API (`DOMParser`, `document`, `window`, `CSS.paintWorklet`, `IntersectionObserver`, etc.) that must run inside a service worker, R2 MUST verify the API is accessible in SW context before R3 begins. 30-second check: open `chrome://extensions` → SW inspect → `typeof <API>` REPL probe OR a written MDN citation showing SW reachability. |
| C-9 | Empty-state design | Every user-facing product path must explicitly enumerate its empty-state UX in R2 output: zero-items, zero-groups, zero-matches, zero-network, partial-inputs (e.g., preferences-only, no-title, no-URL). Each enumerated state has expected UI behavior (reject / accept-with-degraded-display / accept-fully) documented. R4 [qa-reviewer] checks against this enumeration. |
| C-10 | Off-screen rect feasibility | If the design uses off-screen positioning + a browser snapshot/measurement API (e.g., `setDragImage`, `canvas.toDataURL` of an off-screen element), verify the element has a real computed rect at snapshot time before proceeding. Document the reflow / positioning strategy explicitly (e.g., `position: fixed` + `translate(-100%, -100%)` instead of `top: -9999px`; force reflow via `void el.offsetHeight` before the snapshot if required). The Sprint 24 B-025 UAT-8 failure mode — `-9999px` positioning caused zero-dim `getBoundingClientRect` → `setDragImage` snapshot produced a broken/blank ghost in Edge — is the blocking precedent. |

### Round 3: Build (Frontend)
- [frontend-engineer]: UI code, service worker code, storage layer, message handlers, components.
- Must handle all states: loading, error, empty, success, drifted, audible, offline.
- No dead code, no commented-out blocks, no `console.log` left behind.

### Round 4: Review (3 Reviewers in Parallel)
- [code-reviewer]: Architecture, patterns, scalability, performance, DRY — dead code and duplication are always findings.
- [security-reviewer]: Extension permissions, CSP, message passing, storage safety, XSS in rendered bookmark titles, URL handling — severity: CRITICAL/HIGH/MEDIUM/LOW.
- [qa-reviewer]: Error handling, edge cases, accessibility (keyboard-first UI), empty/loading/error states.
- All report findings with file/line references — none write code.
- [frontend-engineer] fixes CRITICAL and HIGH findings before R5.

### Round 5: Testing
- [test-engineer]: Write/update unit and integration tests. Exercise storage operations, tab matching, drift detection, message handlers.
- Then UAT: Load the unpacked extension in Chrome, manually walk acceptance criteria — PASS/FAIL/WARN/SKIP per test case.
- All automated tests must pass AND UAT must be PASS before marking the sprint item as done.

### Round 6: Close
- [solution-architect]: Update the relevant chapter under `docs/design/NN-*.md` with what was actually built (or add a new `NN-slug.md` chapter if the item merits one and extend the root `docs/SOLUTION_DESIGN.md` index TOC).
- Document: deviations from R2 plan, new storage schemas, new message types, new manifest permissions, rollback plans.

### Round 7: Post-Close (Optional)
- [technical-writer]: Update `README.md`, `STORE_LISTING.md`, `docs/user-manual/`, and `CHANGELOG.md` for any user-visible changes.
- Only runs when the item changes user-facing behavior.

## Key Documents (Sources of Truth)

| Document | Owner | Purpose |
|----------|-------|---------|
| `docs/SPRINT.md` | [scrum-master] | Living sprint board — active items, current sprint only |
| `docs/SPRINT_ARCHIVE.md` | [scrum-master] | Historical completed items — all closed sprints |
| `docs/SPRINT_FINDINGS.md` | [scrum-master] | **Sprint index (~1 KB)** — deduplicated R4 findings live in per-sprint slices under `docs/findings/sprint-NN.md`. Agents read the slice(s) relevant to their sprint, not the index. |
| `docs/BACKLOG.md` | [product-manager] | All user stories, priorities, sprint assignments |
| `docs/BACKLOG_BOARD.md` | [product-manager] | Progress dashboard and status summary |
| `docs/PRD.md` | [product-manager] | Product requirements, personas, features |
| `docs/SOLUTION_DESIGN.md` | [solution-architect] | **Chapter index (~5 KB)** — architecture chapters live as per-chapter slices under `docs/design/NN-slug.md` (§1–§32, §10.5–§10.10). Agents read the chapter(s) relevant to their item, not the index. For R6 close updates, edit the specific chapter file or add a new `NN-*.md` chapter. |
| `docs/user-manual/` | [technical-writer] | User manual — how-to guides for all features |
| `docs/RELEASES.md` | [release-manager] | Local reference copy of release notes |
| `README.md` | [technical-writer] | Public-facing project overview |
| `STORE_LISTING.md` | [technical-writer] | Chrome Web Store listing copy |
| `CHANGELOG.md` | [technical-writer] | Human-readable release history |

Agents MUST read relevant documents before producing output. Every agent's work builds on the context from prior rounds.

## Non-Negotiable Rules

### Security (Extension-Specific)
- Request the minimum set of `manifest.json` permissions needed. Every new permission must be justified in the R2 architecture review.
- No remote code execution. No `eval`, no `new Function`, no dynamically loaded scripts from URLs.
- Content Security Policy must remain strict — no relaxation without [security-reviewer] sign-off.
- All rendered bookmark titles and URLs must be treated as untrusted — use `textContent`, not `innerHTML`, for user-provided strings.
- Validate all `chrome.runtime.onMessage` payloads — never trust message shape or sender identity without checking.
- No network requests from the extension. If one is ever added it requires explicit [security-reviewer] sign-off and a user-facing privacy disclosure.

### Privacy & Compliance
- Tab Junkie is **local-only**. No telemetry, no analytics, no crash reporting, no remote sync.
- No user data leaves the browser. Ever.
- Bookmark titles and URLs may contain PII — never log them to the console in production builds.

### Code Quality
- No TODOs in committed code — complete working code or don't commit.
- No commented-out code blocks — git history is the archive.
- Strict error handling around all `chrome.*` API calls — treat missing/denied permissions as first-class states.
- Defensive checks for service-worker cold starts — never assume in-memory state persists.

### Frontend Standards
- Skeleton loaders for content areas (not spinners).
- Empty states: icon + message + prominent CTA.
- Confirmation dialogs for destructive actions (deleting groups, bulk removal).
- Desktop-first: the extension targets a desktop Chromium browser — no mobile layout work required.
- Keyboard-first navigation: every primary action must be reachable via keyboard; focus management must be explicit.
- Accessibility: ARIA roles for the tree/list structure, visible focus indicators, color contrast at or above WCAG AA.

### Performance Standards
- Sidepanel first paint: < 200ms after open on a 500-item collection.
- Fuzzy search latency: < 50ms P95 on a 1,000-item collection.
- Storage read/write: avoid unnecessary full-collection reads; scope to affected groups when possible.
- No full re-render on single-item updates — always use targeted DOM patches or reactive primitives.
- Service worker startup time: must not block UI rendering; UI must hydrate incrementally from storage.

### Testing Standards
- Deterministic tests (no flakiness).
- Test data factories with realistic data (including drifted, audible, and grouped states).
- Regression tests for every confirmed bug — test-first approach.
- [test-engineer] must run the full existing test suite after writing new tests.
- All chrome API interactions go through the existing `chrome-mock.js` in tests — never stub ad-hoc.

### Shared File Governance
- Files in `shared/` are touched by multiple entry points (sidepanel, newtab, popup, service worker).
- Cross-boundary edits must be called out by [code-reviewer] in R4.
- Message contracts in `shared/messages.js` are an API — every change requires [solution-architect] review.

### Rollback & Incident Management
- Every storage schema change must ship with a documented rollback procedure.
- Every breaking message-contract change must ship with a compatibility shim or a clear upgrade path.
- **Incident severity levels:**
  - **SEV1** — Data loss (bookmarks lost or corrupted): halt all sprint work
  - **SEV2** — Major feature broken (search, drift detection, persistence): fix before resuming sprint work
  - **SEV3** — Minor degradation: log and schedule for next sprint
- After SEV1/SEV2: [solution-architect] writes a post-mortem as a new entry in `docs/design/13-incident-log.md`.

## Sprint Item Status Flow

**Full / Spike-First (M/L/XL):**
```
requirements → architecture → build →
code-review → security-review → qa-review →
test-engineer → done
```

**Fast Track (XS/S):**
```
requirements → build → code-review → security-review → done
```

Format per active item in `SPRINT.md`:
```markdown
### [B-XXX] Feature Name
- **Tier**: [Fast Track / Full / Spike-First]
- **Status**: [current step] (✅ for completed steps)
- **Assigned To**: [active agent(s)]
- **Blockers**: [any blockers, who resolves]
- **Feature Context**: [2-3 bullet summary]
- **Handoff Notes**: [context from last agent for next agent]
- **Files Changed**: [accumulated list]
- **Parallel Opportunity**: [which agents can run simultaneously]
```

## Session Start Protocol

At the start of every session:
1. [scrum-master] reads `docs/SPRINT.md` and `docs/BACKLOG.md`
2. Identifies current sprint items and their pipeline stage
3. Determines which agent(s) should run next
4. Launches appropriate agent(s) — parallel when possible
5. Updates `SPRINT.md` after each round completes

## Pipeline Continuation Protocol

**CRITICAL**: After ANY agent completes work, you MUST check `SPRINT.md` and continue the pipeline to the next round. Do NOT stop after the build round and wait for the user. The pipeline is automatic:

**Full / Spike-First continuation:**
- After R3 → IMMEDIATELY launch R4 reviewers (all 3 in parallel)
- After R4 findings fixed → IMMEDIATELY launch R5 [test-engineer]
- After [test-engineer] UAT passes → IMMEDIATELY launch R6 [solution-architect] close
- After R6 → Launch R7 if user-facing

**Fast Track continuation:**
- After R3 → IMMEDIATELY launch [code-reviewer] + [security-reviewer] in parallel
- After R4 findings fixed → run existing test suite, confirm zero regressions → mark done

**Sprint close continuation:**
- After all items done → Gate 4 → Gate 7 → [release-manager] → archive

**Context discipline:** When routing to any next round, [scrum-master] MUST summarize — not quote — the prior round's output. The next agent reads `SPRINT.md` as its context contract.

### Cross-Item Parallelization Rules

| # | Rule | Limit |
|---|------|-------|
| P-1 | Max one L/XL item active at a time | L/XL items generate 6+ rounds |
| P-2 | S/XS items can run alongside any active item | Fast Track items have minimal context footprint |
| P-3 | Max two M items in parallel | Two is safe, three risks context pressure |
| P-4 | Interleave, don't overlap full pipelines | Complete R1-R4 of first before starting R1 of second |

## R4 Findings Persistence

After R4 reviewers complete, save deduplicated findings to `docs/findings/sprint-NN.md` (zero-pad single-digit N). If the slice doesn't exist yet, create it AND add a new TOC entry to the root index `docs/SPRINT_FINDINGS.md`:

```markdown
# Sprint N — R4 Findings (Deduplicated)
## CRITICAL (must fix before R5)
_None_
## HIGH (must fix before R5)
| # | File | Finding | Fix |
|---|------|---------|-----|
| 1 | `path/to/file:line` | Description | Proposed fix |
## MEDIUM (fix if time permits)
...
## LOW (defer to future sprint)
...
```

## Pre-Existing Code Review Gate

Any code found in the repository that has NOT been through the R4 review pipeline MUST be flagged as "unreviewed" in `SPRINT.md`.

## Scope Change Control

Items may NOT be silently added to or removed from an active sprint. All mid-sprint scope changes require explicit [scrum-master] handling:

**Adding an item:** assess impact → identify what gets deprioritized → update `SPRINT.md` with rationale
**Removing an item:** return to `BACKLOG.md` with status `backlog` and deferral reason

## Blocker Escalation Protocol

Every blocker in `SPRINT.md` must include:
- **Description**: What is blocked and why
- **Owner**: Which agent or external party resolves it
- **Target resolution**: When it should be resolved

If unresolved when the responsible agent's round completes, present the user with three options:
1. **Resolve**: Provide the information needed
2. **Defer**: Move to next sprint with blocker documented
3. **Workaround**: Propose an alternative approach
