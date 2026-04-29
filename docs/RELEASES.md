# Tab Junkie — Release Notes

Local reference copy. Source of truth: GitHub Releases.

---

## v1.31.0 — WCAG AA Matrix Audit + Process Gates (2026-04-28)

**Tagged on `release/v2` — pending v2 merge to main. Tag: `v1.31.0`.**

Sprint 37: 3-item polish + process close-out sprint. 1 M WCAG AA matrix re-verification + 2 XS CLAUDE.md process gates. All items pipeline-complete; product-owner B-117 UAT carried forward per S35/S36 pattern.

### What's new (user-visible)

- **Group-header contrast improved on Atom One Dark, One Dark, Dracula (B-117)** — tint-amount adjusted: `atom-one-dark` + `one-dark` 20% → 7% (both share a palette where canonical colors could not reach 4.5:1 at 20%); `dracula` 20% → 17% (yellow slot was 4.119:1 at 20%; 17% clears all 9 slots). All other 11 themes unchanged. Visual palette identity preserved on all three themes.
- **Solarized Dark theme accessibility limitations documented (B-117)** — all 9 group-color slots in Solarized Dark fall below WCAG AA (inherent property of the canonical `base03`/`base00` pair at 4.111:1 base; no tint can reach 4.5:1 without breaking theme identity). Measured contrast ratios now listed in `docs/user-manual/themes.md` "Theme accessibility limitations" subsection.

### Internal / process

- **126-cell WCAG AA contrast matrix test (B-117)** — `tests/b117-gc-matrix-audit.test.js`: 137 tests, 126 cells (14 themes × 9 slots), 9 accepted-limitation AAL tuples (all Solarized Dark), 3 monotonic-decrease drift guards. 136 ms runtime (AC budget: 200 ms). Failing-but-accepted cells tracked via explicit `ACCEPTED_LIMITATIONS` allow-list — future darkening is caught automatically.
- **R1 source-citation gate (B-118)** — `CLAUDE.md` R1 Definition section gains a mandatory "Source-citation gate" subsection: every R1 structural source-code claim must cite `file:line` or be marked `R2-VERIFY`. Closes Sprint 36 retro HIGH action item #1 (three R1 LOCKED claims were factually wrong that sprint).
- **R2 fix-scope test-assertion enumeration (B-119)** — `CLAUDE.md` R2 Architecture section gains a mandatory "Fix-scope test-assertion enumeration" subsection: R2 chapters declaring a contract change (CSS-token, DOM/ARIA, message, selector) must enumerate pre-existing test-file assertions against the old value. Closes Sprint 36 retro HIGH action item #2 + the B-117 R3 mid-build T1 failure (structural assertion on `--group-header-tint-amount` was not enumerated at R2).

### Quality

- **Tests**: 1,504 → **1,641 passing** (+137 net — 137 new in `tests/b117-gc-matrix-audit.test.js` + T1 redesign in `tests/b114-tint-v2.test.js`). Zero regressions.
- **Build**: `./build.sh` clean (336 K zip, 86 files, exit 0).
- **R4 findings**: 0 CRITICAL / 0 HIGH across all items. B-117: 1 MEDIUM (Solarized Dark doc gap → addressed in UAT plan + user-manual), 4 LOW (deferred or addressed). B-118 + B-119 (bundled): 1 LOW cosmetic (deferred). Zero open HIGH or above at sprint close.
- **Storage schema**: unchanged. **Permissions**: unchanged. **Manifest entries**: unchanged.

### Mid-flight scope adjustments

- **B-120 filed mid-sprint**: §57.9 sentinel-grep gate (R3 entry check) triggered on 4 stale-prose comment files during B-117 R3. 2 files with factual accuracy concerns deferred to **B-120** (P3/XS, depends on B-117 close, future Fast Track sprint). The other 2 hits were non-factual and resolved inline.
- **B-117 R3 scope expansion**: `tests/b114-tint-v2.test.js` T1 was an active structural assertion of `--group-header-tint-amount` (the invariant B-117 was changing). Per AC11(g) operational clarification from [scrum-master], T1 was redesigned in-scope (table-driven `expectedTintByTheme` map) rather than being locked out. This surfaced the B-119 R2 fix-scope miss as a high-value lesson.

### Pending UAT

- **B-117 UAT-1..UAT-10 pending** (`docs/UAT_B-117.md`) — particularly UAT-2/-3/-4 (visual-UX contrast checks for atom-one-dark / one-dark / dracula at new tint values). Product-owner Edge run. Not blocking sprint close per S35/S36 established pattern.

### Rollback

- **B-117**: Single atomic `git revert <R3-commit-hash>` restores `shared/themes.css` to S36 tint values. No storage schema change; no new permissions; no new message types. Documented in `docs/design/57-b-117-gc-matrix-audit.md §57.12.7`.
- **B-118 / B-119**: Single atomic `git revert <R3-commit-hash>` reverts CLAUDE.md edits. No code impact.
- **GitHub Release**: skipped per product-owner direction (tag `v1.31.0` + zip exist for manual publish later).

---

## v1.17.0 — Drag Foundation v2 (2026-04-21)

**Tagged on `release/v2` — pending v2 merge to main. Tag: `v1.17.0`.**

Sprint 23 ships the drag infrastructure that Sprint 22 attempted and reverted. This time the R2 perf + correctness decisions shipped as R3 acceptance criteria (not aspirational design notes), and L-tier UAT ran **before** PR merge. Pre-merge UAT caught two blocker-grade regressions — both fixed before merge.

### What's new (user-visible)

- **Drag-and-drop item reorder (B-030)** — drag any bookmark within its group, across groups, or onto Ungrouped. Horizontal insertion indicator shows the drop position; **Escape** cancels without writing. Order persists across reload.
- **Drag-to-expand collapsed groups (B-009)** — hovering over a collapsed group's header for ~600 ms during a drag auto-expands that group so you can drop into it. Expansion persists.
- **Drag-to-demote saved+live items (B-033)** — drag a saved+live item onto the Open Tabs section to remove its saved state while keeping the tab open. Toast: "Bookmark removed — tab stays open."

### Architecture highlights

- **Perf**: `dragover` handler is 3 statements only — no `getBoundingClientRect`, no DOM mutations. All DOM work runs via `requestAnimationFrame` coalescing. Bounding-rect cache built once at dragstart, scroll-invalidated only. Transform-positioned indicator (no reparenting during drag).
- **Correctness**: logical drop state (`_itemDragState.pendingTargetRowId`) is decoupled from visual indicator position — the S22 bug root cause is eliminated by design. Broadcast-race guard checks `_cachedItemsGen` at drop time; re-fetches if stale.
- **Cross-ownership**: `_computeDropTarget` returns a discriminated union (`'item'` | `'openTabs'`) so B-030 reorder and B-033 demote can never both fire on the same drop event.

### Process wins

- Sprint 22 retro HIGH action items all applied at kickoff:
  - R2 perf decisions became R3 acceptance criteria (ACs 16–24), not design notes.
  - R1 authored UAT plans for all three items (including perf probes for B-030).
  - L items required pre-merge UAT — which caught 2 blocker bugs that R4 smoke-check alone missed.
  - Fake-DOM drag simulation tests added to pin the S22 failure case.

### Quality

- **Tests**: 979 → **1001 passing** (+22 Sprint 23 sort-order + backend + simulation tests).
- **Build**: `./build.sh` clean (636 K zip, 67 files).
- **R4 findings**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW across all 3 items.
- **UAT**: B-030 round 1 → 2 blocker bugs found → fixed → round 2 9/9 PASS. B-009 + B-033 UAT deferred to S28 comprehensive sweep (product-owner option — Fast Track S items don't require pre-merge UAT).
- **Storage schema**: unchanged. **Permissions**: unchanged.

### Deferred / known limitations

- **Full UAT sweep**: S28 per `FEATURE_PARITY_ROADMAP.md`. `UAT_B-030.md` was executed at merge; `UAT_B-009.md` + `UAT_B-033.md` defer to S28.
- **B-052 `hashItem`** omits `sortOrder` — same-group reorder takes an explicit `renderAll` fallback in the drop handler rather than the diffAndPatch path. Documented in §36 as a known follow-up optimisation.
- **Custom drag preview**: v2 uses the browser's default drag ghost. A custom preview with selection count is a follow-up for B-025 multi-item drag in S24.
- **Touch / mobile**: out of scope per CLAUDE.md desktop-first rule.
- **GitHub Release publication**: skipped per product-owner direction (tag + zip exist for manual publish later).

### Rollback

- Clean `git revert` path: no storage schema change; no new permissions; no new message types beyond `MSG_BULK_REORDER_ITEMS` (which is uninvoked if reverted).
- Sprint 22 revert proved the rollback path works.

---

## v1.16.0 — Polish Burndown + UAT Essentials + Feature Parity Roadmap (2026-04-20)

**Tagged on `release/v2` — pending v2 merge to main. Tag: `v1.16.0`.**

Sprint 21 started as the first-class UAT burndown sprint (per Sprint 20 retro HIGH rule) and pivoted mid-sprint to a feature-parity roadmap. Shipped: one UAT-surfaced UX gap (new-group button), four polish items closing 4 lingering R4 LOW findings from Sprints 18–19, and a 7-sprint roadmap targeting comprehensive UAT in S27 + v2→main TBD in S28 (pending product-owner review of S27 results).

### What's new (user-visible)

- **New-group button in the sidepanel header** (B-081). A folder-with-plus icon next to the bookmark-plus button opens the group create dialog directly. Previously, additional groups were only reachable via the Group Picker modal's empty-state CTA, which hid once you had any groups.
- **Import-success toast breakdown** (B-080). Previously: "2 repairs." Now: "2 repairs: 1 group loop fixed, 1 item with no group moved to Ungrouped" — the same plain-language labels the preview dialog uses.

### Internal / defensive

- **Filter input 256-char cap** (B-079) — bounds pathological long-query pastes. DoS-only security hardening; UX unchanged.
- **`breakCycles` adversarial-input hardening** (B-078) — `MAX_CYCLE_WALK_DEPTH = 1000` caps the cycle walk on deep adversarial chains. 1500-node cycle test completes in < 100 ms (budget: 10 s).

### Process

- **R1 AC template gains "DoR Gate 7 check" subsection** (B-077) — every AC block states destructive-action confirmation status (retained / waived / N/A) up front. Prevents edge-case ACs from being the only place retention status is documented. Closes Sprint 20 retro MEDIUM.

### UAT

- **B-042 essentials-only pass**: 6/6 essential cases PASS (happy path, keyboard, Chromium round-trip, orphan rescue, XSS probe, Unicode round-trip). 8 non-essential cases SKIP — all covered either by the automated suite or deferred to the S27 comprehensive UAT sweep.

### Feature parity roadmap

- `docs/FEATURE_PARITY_ROADMAP.md` — 7-sprint plan through S27 comprehensive UAT + S28 TBD v2→main merge decision. Product-owner-approved scope: drag-and-drop trilogy, quick-search + group-jump popups, standalone window + new tab page, keyboard shortcuts + popup "Open side panel" button (new B-082), and the 3 XS preference items. Explicitly deferred: B-037 (themes, P2) + B-041 (sync tab order, P2).

### Quality

- **Tests**: 971 → **979 passing** (+8 Sprint 21 polish tests in `tests/sprint-21-polish.test.js`; +3 B-081 markup tests landed mid-sprint).
- **Build**: `./build.sh` clean (605 K zip, 66 files).
- **R4 findings**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW across all 5 items. Second consecutive zero-findings sprint.
- **Storage schema**: unchanged. **Permissions**: unchanged.

### Deferred / known limitations

- **Comprehensive UAT sweep**: 9 plans + per-feature smoke plans from S22–S26 — all deferred to S27. B-042 is the only plan with an essentials-PASS record this sprint.
- **GitHub Release publication**: skipped per product-owner direction (tag + zip exist for manual publish later).
- **Sprint 20 retro HIGH rule superseded for Sprint 21 only.** S27 is the new first-class UAT sprint.

### Rollback

- All 5 Sprint 21 items are pure-revert-safe (no schema / message / manifest / permission drift).
- Sprint 21 tag `v1.16.0` can be undone without touching on-disk user data.

---

## v1.15.0 — Sub-group Nesting + Polish Burndown + Retro Action Items (2026-04-20)

**Tagged on `release/v2` — pending v2 merge to main. Tag: `v1.15.0`.**

Sprint 20 ships one user-visible feature (sub-group nesting at depth 1) plus five internal/process items that close out the Sprint 19 retro action items and burn down the polish queue. A dedicated UAT burndown window is carried to Sprint 21 as a first-class sprint item after two consecutive sprints of UAT debt growth.

### What's new

**Sub-group nesting at depth 1 (B-007)**
- A new **Parent group** picker in the group dialog lets you nest a group one level deep inside another. Pick it at create time or change it later by editing.
- Child groups render indented under their parent in the side panel (new CSS token `--group-indent: 20px`).
- Depth-1 cap is enforced: trying to nest a group that itself has children, or to form a cycle, surfaces a plain-language inline error ("Can't nest this group — groups can only be one level deep" / "Can't nest a group under itself or one of its own sub-groups") and leaves the dialog open.
- Delete-parent cascade: deleting a parent group promotes its children back to the top level (no data loss). Backend atomic behaviour already shipped in B-001a AC4 + B-006; Sprint 20 wires the UI.
- Drag-to-nest remains future work — tracked as B-031 in the backlog.
- Scope: **UI-only** — zero manifest / message-contract / schema drift. Storage-side nesting validation has been in place since Sprint 1.

### Internal + polish

**Pre-existing TODO cleanup (B-074)**
- The `TODO(sprint-19+)` comment in `background/import/json-validator.js` is gone. The deferred migration-hook work is now tracked as a proper backlog item (**B-076**) and will activate when `MIGRATION_STEPS` ships its first non-empty entry. CLAUDE.md "no TODOs" rule restored.

**Fuzzy search `byId` restructure (B-075)**
- The B-052 search index's `byId` lookup is now a frozen plain object (was a `Map`). Property access is simpler (`byId[id]` vs `byId.get(id)`) and runtime mutation now throws in strict mode — runtime-enforced contract replaces the previous "defensively scoped" Map contract. No user-visible behaviour change.

### Permanent pipeline quality upgrades

**Gate 6 deps-resolved check (B-071 — Sprint 19 retro HIGH)**
- Sprint Readiness Gate 6 now requires every in-scope item's dependencies in BACKLOG.md to be `done` or in the same sprint. Prevents mid-sprint deferrals like Sprint 19's B-046 (which had unresolved B-022 + B-035 deps).

**AC destructive-action clause (B-072 — Sprint 19 retro MEDIUM)**
- Definition of Ready now requires every AC that carves out an edge-case path (prefs-only, zero-match, partial-input, etc.) to explicitly state whether destructive-action confirmation is retained or waived, with rationale. Prevents literal AC readings from silently waiving confirms (nearly happened in Sprint 19 B-070).

**R2 Correctness Checklist C-6 + C-7 backfill (B-073)**
- **C-6 Permission minimization**: any `manifest.json` permission addition must list rationale, alternatives considered, and security-reviewer sign-off.
- **C-7 Allow-list direction**: any sanitizer / validator / export surface filtering structured data defaults to an allow-list; deny-lists require a blast-radius justification (B-067 precedent).
- First exercised by B-007 R2 — both passed (zero new permissions, no new sanitizer surface). The numbering gap between C-5 and C-8 is closed.

### Quality

- **Tests**: 955 → **968 passing** (+13 new B-007 tests in `tests/b007-sub-group-nesting.test.js`)
- **Build**: `./build.sh` produces a clean 599 K zip (66 files — `shared/group-nesting.js` added).
- **R4 findings**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW across all six items. Cleanest R4 sprint since Sprint 18.
- **Storage schema**: unchanged — no migration required.
- **Permissions**: unchanged — zero additions.

### Deferred / known limitations

- **UAT**: 9 plans now deferred (B-042, B-043, B-048, B-029, B-059, B-044, B-045, B-052, B-007). Sprint 21 is committed to a first-class UAT burndown item — no forward feature until at least 4 plans are PASS.
- **Drag-to-nest**: not shipped in B-007. Tracked as B-031 and will be unblocked by the `filterGroupParentCandidates` helper + rendering scaffold that shipped here.
- **GitHub Release publication**: skipped per product-owner direction (tag + zip exist for manual publish later).

### Rollback

- All six items have documented rollbacks (pure `git revert` — zero storage schema changes this sprint).
- Sprint 20 tag `v1.15.0` can be undone without touching on-disk user data. The sub-group nesting UI reverts cleanly (storage already supports `parentId`; pre-B-007 UI always sent `null`).

---

## v1.14.0 — Near-Instant Search + Import Polish + Internal Quality Gates (2026-04-19)

**Tagged on `release/v2` — pending v2 merge to main. Tag: `v1.14.0`.**

Sprint 19 ships three user-visible improvements plus one permanent pipeline quality upgrade. The side-panel filter is now near-instant on 1,000-item collections (measured 0.152 ms P95 — 329× under the product AC). The Sprint 18 import flow gets a dedicated preferences-only restore path, a plain-language repair summary, and a per-format dialog heading. The bookmarks import flow gains a user-controllable duplicate-handling toggle (default: skip duplicates within the file) so you can deliberately keep repeats on the rare occasions that is what you want. Under the hood, the R2 Correctness Checklist gained two new items (SW-context feasibility + empty-state design) exercised for the first time on the very sprint that shipped them.

### What's new

**Near-instant side-panel search (B-052)**
- Typing in the filter bar stays snappy whether you have 50 items or 1,000+. Measured 0.152 ms P95 search latency on a seeded 1,000-item collection (versus the 50 ms product AC) and 1.14 ms first-paint DOM-build on a 500-item collection (versus the 200 ms budget).
- Opening the side panel paints immediately — a skeleton appears right away and your items fill in within a blink, even on large collections.
- Adding, editing, or deleting bookmarks no longer causes a perceptible pause the next time you search. A diff-and-patch index update runs instead of a full rebuild on every single-item change; bulk mutations above the 50-item threshold trigger a single rebuild (faster than N patches).
- No change to the filter UI, keyboard shortcuts, or what it matches — only speed. Index is invalidated and rebuilt only when items or groups are added, edited, deleted, or reordered.
- Targeted DOM patches on single-item updates — no full re-renders, no list-level reflow during mutation.
- Rollback flag: a module-level `SEARCH_INDEX_ENABLED` constant in `sidepanel/sidepanel.js` routes the filter through the Sprint 5 linear-scan path if ever set to `false`. Zero-code-change fallback.

**Import duplicate-handling override (B-060)**
- A new "Skip duplicates in this file" checkbox in the Import preview dialog (both HTML and JSON paths) lets you choose per-import whether to de-duplicate rows with the same URL.
- Default is **skip on** (matches prior behaviour). Unchecking the box imports every row verbatim, including repeats.
- Your last choice is remembered as a preference (`importSkipDuplicates`) and pre-applied to the next import dialog.
- Copy correction: summary wording uses "duplicates in this file" (accurate — the import replaces all existing data, so duplicates-in-collection doesn't apply).
- Fully backward-compatible: the preference is additive. Existing profiles read as if the default is `true`; no migration is required.

**Sprint 18 import polish bundle (B-070)**
- Preferences-only JSON backups now restore successfully. Previously a backup containing only preferences (zero items and zero groups) was rejected with "Backup contains no bookmarks"; now it opens a dedicated prefs-only confirmation dialog that explicitly states "This backup contains no bookmarks — only preferences. Importing will overwrite your current preferences." with Cancel as the default button.
- Repair-summary text on the JSON import preview is rewritten in plain language. Engineering-level strings like "broke 2 parent cycles" became "fixed 2 folders whose parent link formed a loop"; "reparented 3 orphaned items to Ungrouped" became "moved 3 bookmarks whose group was missing to Ungrouped." Every repair category has a plain-language equivalent.
- JSON import preview dialog now shows a format-specific heading ("Replace all bookmarks with JSON backup?") — removes the cross-format heading that was shared with HTML import.
- Removed a deprecated `validateAndRepair` alias in `background/import/json-validator.js`.

**R2 Correctness Checklist: C-8 + C-9 (B-069)**
- Permanent quality-gate addition. Every Full-tier R2 architecture review now explicitly verifies:
  - **C-8 SW-context feasibility** — any module introduced in R2 that runs inside the MV3 service worker must be checked for `DOMParser` / `document` / `window` access; if any is required, the R2 must propose a hand-rolled alternative or escalate.
  - **C-9 Empty-state design enumeration** — every new UI surface must enumerate its empty states (zero data, loading, error, filter-no-match, denied, offline, drifted) and specify the rendering for each.
- First exercise: B-052 R2 listed 7 empty states in §34.9 which R4 [qa-reviewer] used to confirm coverage. Caught implicit-empty-state assumptions before they shipped as bugs.

### Known limitations

- **Deferred UAT**: 8 UAT plans (~180 cases) remain DEFERRED — `docs/UAT_B-042.md`, `UAT_B-043.md`, `UAT_B-048.md`, `UAT_B-029.md`, `UAT_B-059.md`, `UAT_B-044.md`, `UAT_B-045.md`, `UAT_B-052.md`. Not a release blocker; Sprint 20 has a dedicated burndown window.
- **Follow-on polish for Sprint 20 triage**: B-052 `byId` Map → frozen plain object restructure; B-070 `breakCycles` adversarial-input hardening; pre-existing `TODO(sprint-19+)` in `background/import/json-validator.js:531` (violates CLAUDE.md no-TODOs rule); backfill `C-6` + `C-7` slots in the R2 Correctness Checklist (historical numbering gap surfaced during B-069); B-060 query-length cap on filter input; repair-summary jargon → plain-language extended pass.
- **Deferred item**: B-046 Global keyboard shortcuts was removed from Sprint 19 at Wave 3 start. Its ACs depend on B-022 (quick search popup) and B-035 (standalone Tab Junkie window), neither of which has shipped. Returns in the sprint that ships either of those.

### Breaking changes

None. No message-contract removal. No manifest permission change. v1.13.0 export files import cleanly into v1.14.0 and vice versa.

### Storage schema changes

None. `importSkipDuplicates` preference was added to `DEFAULT_PREFERENCES` and its validator made tolerant — rolling back to v1.13.0 leaves the stored partition untouched (the unknown-to-v1.13.0 key is simply not read). No `schemaVersion` bump. No migration step. `tj:items`, `tj:groups`, `tj:prefs`, `tj:meta`, `tj:drift`, `tj:floatingGroups` shapes remain frozen.

### Manifest permission changes

None. Zero additions across all 4 Sprint 19 items.

### Internal

| Item | Files added | Files changed |
|------|-------------|---------------|
| B-069 | — | `CLAUDE.md` (+2 R2 Correctness Checklist rows), `CHANGELOG.md` |
| B-070 | — | `sidepanel/sidepanel.js` (`_hasPopulatedPreferences`, `_buildPrefsOnlyImportBody`, `prefsOnly` flag, plain-language repair-summary labels, JSON-path dialog heading ternary), `background/import/json-validator.js` (alias removal), `tests/b045-e2e-import.test.js` (+3 tests) |
| B-060 | `tests/b060-import-dup-handling.test.js` (7 tests) | `sidepanel/sidepanel.{js,css}` (checkbox UI + pref read/write + toast branching), `background/storage/shapes.js` (DEFAULT_PREFERENCES + tolerant `isPreferences`), `background/storage/preferences.js` (`validatePrefsPatch`), `background/import/{html-parser,json-validator,index}.js` (options threading), `tests/b04{4,5}-e2e-import.test.js`, `tests/b045-json-validator.test.js` |
| B-052 | `sidepanel/search-index.js` (333-line pure module), `tests/b052-fuzzy-search-perf.test.js` (18 tests), `docs/design/34-b-052-fuzzy-search-caching.md` (R2 + R6 close), `docs/UAT_B-052.md` (15 cases, DEFERRED) | `sidepanel/sidepanel.js` (+241/-4 — index integration, `_patchSingleRow`, `_findGroupItemsContainer`, broadcast-branch dispatch, SEARCH_INDEX_ENABLED rollback gate), `CHANGELOG.md`, `STORE_LISTING.md` |

- **+32 new automated tests** (923 → 955 total). All passing.
- **New message contract**: none. B-052 stays sidepanel-only; B-060 threads through existing `MSG_IMPORT_COLLECTION`.
- **New error codes**: none.
- **Perf measurements (deterministic seed=4242)**: AC3 search P95 on 1000 items **0.152 ms** (263× under 40 ms CI budget, 329× under 50 ms product AC); AC4 first-paint DOM-build proxy on 500 items **1.14 ms** (140× under 160 ms budget); index build wall time on 1000 items **0.96 ms**.
- **Schema tolerance**: `background/storage/shapes.js::isPreferences` now accepts unknown keys (pass-through) so new prefs additions (like `importSkipDuplicates`) don't force a migration. Known keys still shape-validate strictly.

### Test results

- Automated: **955 / 955 passing** (0 fail, 0 skipped, 0 todo). Growth: 923 → 955 (+32).
- UAT: DEFERRED per established pattern — `docs/UAT_B-052.md` (15 cases). Fast Track items (B-069, B-070, B-060) covered by zero-regressions against the full suite.
- R4 review rollup: 0 CRITICAL, 1 HIGH (B-070 prefs-only wipe UX — fixed inline with confirmation dialog), 6 MEDIUM (all fixed inline: B-052 `byId` freeze gap + cross-group-move DOM divergence + redundant `applyFilter` in `_patchSingleRow`; B-070 default-key sensitivity + dead guard), 9 LOW (deferred to Sprint 20 polish triage).
- `./build.sh`: clean, 200 K zip, 65 files.

### PRs merged to `release/v2`

| PR | Item | Merge SHA | Wave |
|----|------|-----------|------|
| #18 | B-069 C-8 + C-9 checklist | `11a7d33` | 0 |
| #19 | B-070 polish bundle | `5a3e1e9` | 1 |
| #20 | B-060 duplicate-handling | `81b8a2d` | 2 |
| #21 | B-052 search index + perf | `b727979` | 3 |

**Commit range**: `cb019ba..b727979` on `release/v2` (Sprint 18 close → B-052 merge).

### Rollback

No storage schema change — downgrade is safe. v1.14.0 import/export files are forward-compatible with v1.13.0 (unknown `importSkipDuplicates` pref is ignored by v1.13.0's validator via `getPreferences()` merge).

```
# On release/v2 — revert all 4 Sprint 19 merges in reverse order:
git -C <repo> checkout release/v2
git revert -m 1 b727979 81b8a2d 5a3e1e9 11a7d33

# OR install the prior zip:
# Download tab-junkie-v1.13.0.zip from
# https://github.com/0xception/tab-junkie/releases/tag/v1.13.0
# (Note: the v1.13.0 tag exists on release/v2; no published GitHub Release
#  per product-owner policy — the zip artifact lives under the tag object.)
# 1. Unload the extension in edge://extensions
# 2. Load the unpacked v1.13.0 build

# Storage schema: NO MIGRATION needed. v1.14.0 added importSkipDuplicates
# preference with a tolerant isPreferences validator. Rolling back to v1.13.0
# leaves the stored partition untouched — the unknown-to-v1.13.0 key is
# simply not read.

# Search-index rollback (B-052 only, no revert needed):
# SEARCH_INDEX_ENABLED=false in sidepanel/sidepanel.js routes the filter
# through the B-021 linear scan — no-code-change fallback.
```

**Post-rollback behaviour:**
- B-052: Sidepanel reverts to Sprint 5 linear-scan filter. Filter still functional; just slower on 1000+-item collections. No data loss.
- B-060: Duplicate-handling checkbox disappears from import preview. Default-skip behaviour from v1.13.0 (Sprint 18) returns — matches the v1.14.0 default. `importSkipDuplicates` preference remains in storage but is ignored.
- B-070: Preferences-only JSON backups once again reject with "Backup contains no bookmarks." Repair-summary text reverts to engineering-level phrasing. JSON import dialog heading reverts to the cross-format wording.
- B-069: R2 Correctness Checklist reverts to 7 items (C-1 through C-5, skipping the pre-existing C-6/C-7 numbering gap). Process-only revert; no runtime effect.

---

## v1.13.0 — Imports Round-Trip + A11y + Docs Restructure (2026-04-19)

**Tagged on `release/v2` — pending v2 merge to main. Tag: `v1.13.0`.**

Sprint 18 closes the export/import round-trip started in Sprint 17. Tab Junkie can now import standard Netscape HTML bookmarks (the format Chrome, Edge, Firefox, and Safari produce) and restore its own JSON backups with validation, auto-repair, and atomic commit. Accessibility work finishes the `--text-tertiary` contrast sweep, and the monolithic SOLUTION_DESIGN + SPRINT_FINDINGS documents are split into per-chapter / per-sprint slices to reduce agent context load going forward.

### What's new

**Import HTML (Netscape bookmarks) (B-044)**
- New **Import HTML** button in the sidepanel header reads any standard Netscape bookmarks file (up to 5 MiB via the UI; 10 MiB hard cap in the background service worker for defense in depth).
- A preview dialog shows the filename, group/bookmark counts, skipped-entry summary (malformed/duplicate/unsupported), and a red destructive-action warning: the import **replaces** every existing group and bookmark. **Cancel** is the default button; commit requires explicit **Replace all**.
- Atomic commit via `writeTransaction` — if anything fails, existing data stays intact.
- Top-level folders become top-level groups; one-level-nested folders become sub-groups; deeper nesting is flattened into sub-groups whose names preserve the original path joined with ` / `.
- Loose bookmarks at the HTML root land in **Ungrouped**.
- Group colors assigned deterministically from the Tab Junkie palette by folder-name hash — re-importing produces the same colors.
- Original `ADD_DATE` / `LAST_MODIFIED` timestamps preserved when present.
- Duplicate URLs within the file de-duplicated. `javascript:` and `data:` URLs skipped. All other supported schemes (`http`, `https`, `file`, `chrome`, `edge`, `chrome-extension`, `about`, `view-source`) imported.
- Favicons re-captured at first use — not read from the imported file.
- Parser is a hand-rolled Netscape tokenizer (no DOMParser — unavailable in MV3 service workers). Endorsed by code + security review as structurally safer than DOM-evaluation.

**Import JSON backup (B-045)**
- New **Import JSON** button restores a Tab Junkie-native `.json` backup (produced by **Export JSON**) as a lossless round trip — groups, colors, timestamps, and preferences come back exactly as exported.
- Schema-version gate: backups from a newer Tab Junkie refused with "update Tab Junkie first"; older backups run through any registered migrations before import.
- Auto-repair for four structural defect classes — missing group parents, circular group references, duplicate internal IDs, items whose group no longer exists. Repairs summarised in the preview dialog before commit.
- Preferences from the backup applied on import; missing/malformed preferences fall back to defaults instead of rejecting the file.
- Prototype-pollution defense: three dedicated regression tests (`sec-proto-1/2/3`) verify `__proto__` / `constructor` / `prototype` keys in JSON are treated as ordinary property names, never reach `Object.prototype`.
- Every imported bookmark/group receives a fresh internal ULID — content preserved exactly; internal identifiers change by design.
- Same URL-scheme policy as HTML import. Files up to 5 MiB via UI; 10 MiB hard cap in SW.

**Remaining `--text-tertiary` a11y sweep (B-066)**
- Five sidepanel surfaces still using `--text-tertiary` (group drag handle + four empty-state body texts) promoted to `--text-secondary`. Closes the contrast sweep started in v1.12.0 (B-064).
- All 16 audit ratios (8 theme × surface combinations × 2 text weights) now pass WCAG AA. Worst post-fix ratio: 4.93:1 on `.group-drag-handle` over light `--bg-hover` (non-text floor 3.0:1 — 64% headroom).
- Approach: Option A (promote offending selectors), zero new tokens, mirrors B-064's pattern. Pure CSS edit.

**Export sanitizers flipped to §32.5 allow-list (B-067)**
- `background/export/json-export.js` now uses a named-field allow-list (true allow-list, not disguised deny-list per Sprint 17 retro C-7) — dead deny-list constants deleted.
- B-042 + B-043 output remains byte-identical on valid §32.5 inputs (AC10). `preferences` pass-through preserved (AC7).
- Locks the §32.5 export schema as the authoritative B-045 import contract.

**Docs restructure — SOLUTION_DESIGN + SPRINT_FINDINGS split (B-068, Wave 0)**
- `docs/SOLUTION_DESIGN.md` (485 KB monolith → ~4 KB index) split into 38 per-chapter `docs/design/NN-slug.md` files.
- `docs/SPRINT_FINDINGS.md` (185 KB monolith → ~1 KB index) split into 8 per-sprint `docs/findings/sprint-NN.md` files.
- Content byte-identical (AC7 verified) — mechanical split only. CLAUDE.md and 6 agent prompts updated to read/write the split files.
- Pre-R2 infrastructure work that reduced agent context load on every subsequent R2/R4/R6 round this sprint.

### Known limitations

- **Preferences-only backups**: a JSON backup containing only preferences (zero items + zero groups) is rejected with "Backup contains no bookmarks." Filed for Sprint 19 polish triage (§33.20). Workaround: include at least one item or group in the backup to restore preferences.
- **No auto-backup before import**: imports do not automatically snapshot existing data before the destructive replace. No undo. Workaround: run **Export HTML** or **Export JSON** before importing anything you did not produce yourself.
- **Deferred UAT**: 6 UAT plans (~165 cases) remain DEFERRED per precedent — `docs/UAT_B-042.md`, `UAT_B-043.md`, `UAT_B-048.md`, `UAT_B-029.md`, `UAT_B-059.md`, `UAT_B-044.md`, `UAT_B-045.md`. Not a release blocker; must be executed before v2 → main merge.
- **Follow-on polish for Sprint 19 triage**: preferences-only backup support; remove `validateAndRepair` alias; repair-summary plain-language rewrite; `breakCycles` adversarial-input hardening; "Replace all bookmarks?" dialog heading scope for JSON.

### Breaking changes

None. Export file format (B-042/B-043) unchanged. No message contract removal. v1.12.0 export files import cleanly into v1.13.0 and vice versa.

### Storage schema changes

None. §32.5 partition shapes (`tj:items`, `tj:groups`, `tj:prefs`, `tj:meta`, `tj:drift`, `tj:floatingGroups`) remain frozen. Import does not bump `schemaVersion`.

### Manifest permission changes

None. Zero additions across all 5 Sprint 18 items. Import uses a plain `<input type="file">` + `FileReader` — no `downloads` permission, no host permissions, no network access.

### Internal

| Item | Files added | Files changed |
|------|-------------|---------------|
| B-068 | 38 × `docs/design/NN-*.md`, 8 × `docs/findings/sprint-NN.md` | `docs/SOLUTION_DESIGN.md` (monolith → index), `docs/SPRINT_FINDINGS.md` (monolith → index), `CLAUDE.md`, 6 × `.claude/agents/*.md` |
| B-067 | — | `background/export/json-export.js`, `tests/b043-json-export.test.js` |
| B-066 | `docs/a11y-audit-B-066.md` | `sidepanel/sidepanel.css` (5-line edit) |
| B-044 | `background/import/html-parser.js`, `background/import/commit.js`, `background/import/index.js`, `background/import/json-validator.js` (stub), `shared/export-schema.js` extensions, 4 test files (50 tests), `docs/design/33-b-044-b-045-import.md`, `docs/UAT_B-044.md`, `docs/user-manual/importing-bookmarks.md` | `shared/messages.js` (+ MSG_IMPORT_COLLECTION), `shared/errors.js` (6 import codes), `background/messages/storage-handlers.js`, `sidepanel/sidepanel.{html,css,js}`, `CHANGELOG.md`, `STORE_LISTING.md` |
| B-045 | 3 test files (64 tests), `docs/UAT_B-045.md` | `background/import/json-validator.js` (stub → full 545-line), `background/import/index.js` (JSON branch), `sidepanel/sidepanel.{html,js}`, `docs/design/33-b-044-b-045-import.md` (§33.6 / §33.11 / §33.12 / §33.19 / §33.20), `docs/user-manual/importing-bookmarks.md`, `docs/user-manual/exporting-data.md`, `CHANGELOG.md`, `STORE_LISTING.md` |

- **+117 new automated tests** (806 → 923 total). All passing.
- **New message contract**: `MSG_IMPORT_COLLECTION` — two-round preview/commit shape with 10 MiB SW cap.
- **New error codes**: 6 additions in `shared/errors.js` covering import parse/schema/size/scheme/replace failures.
- **New CSS token**: `--danger` per theme (used by destructive-action Replace-all button).
- **Contract preservation**: B-067 allow-list flip keeps B-042 + B-043 export output byte-identical on valid §32.5 inputs.

### Test results

- Automated: **923 / 923 passing** (0 fail, 0 skipped, 0 todo). Growth: 806 → 923 (+117).
- UAT: DEFERRED per established pattern — `docs/UAT_B-044.md` (29 cases), `docs/UAT_B-045.md` (30 cases). Fast Track items (B-068, B-067, B-066) covered by zero-regressions against the full suite.
- R4 review rollup: 0 CRITICAL, 1 HIGH (fixed inline pre-R5, QA B-044), 4 MEDIUM (fixed or deferred with rationale), 13 LOW (mostly deferred as nits).
- `./build.sh`: clean, 184 K zip, 64 files.

### PRs merged to `release/v2`

| PR | Item | Merge SHA | Wave |
|----|------|-----------|------|
| #13 | B-068 docs restructure | `e8c2c25` | 0 |
| #14 | B-067 allow-list flip | `2e4e507` | 1 |
| #15 | B-066 a11y sweep | `5bf985f` | 2 |
| #16 | B-044 Import HTML | `1cd3905` | 3 |
| #17 | B-045 Import JSON | `5736c2c` | 4 |

**Commit range**: `e113b41..5736c2c` on `release/v2` (Sprint 17 archive → B-045 merge).

### Rollback

No storage schema change — downgrade is safe. v1.13.0 import/export files are forward-compatible with v1.12.0 (v1.12.0 only sees the export shape it authored; the new import paths are additive).

```
# On release/v2 — revert all 5 Sprint 18 merges in reverse order:
git revert -m 1 5736c2c 1cd3905 5bf985f 2e4e507 e8c2c25

# OR install the prior zip:
# 1. Download tab-junkie-v1.12.0.zip from
#    https://github.com/0xception/tab-junkie/releases/tag/v1.12.0
# 2. Unload the extension in edge://extensions
# 3. Load the unpacked v1.12.0 build
# No storage cleanup required — tj:* partition shapes unchanged.
```

**Post-rollback behaviour:**
- B-044 + B-045: Import buttons disappear. Any imports committed while v1.13.0 was active remain in storage (they were written through the normal atomic pathway; v1.12.0 reads them back via standard list-items). No data loss.
- B-066: Five a11y surfaces revert to `--text-tertiary` (re-introduces sub-AA contrast on those cells only).
- B-067: json-export reverts to deny-list — functionally byte-identical on valid §32.5 inputs, so exports produced pre- and post-revert are interchangeable.
- B-068: docs monolith reconstituted — no runtime effect (docs only).

---

## v1.12.0 — Data Portability Exports + A11y + Tech-Debt (2026-04-18)

**Staged on `release/v2` — pending v2 merge to main. Intended tag: `v1.12.0`.**

**Staging commit**: current HEAD on `release/v2` (Sprint 17 feat commit — see `git log --oneline -1`).

### What's new

**Export to HTML (Netscape bookmark file) (B-042)**
- New "Export HTML" button in the sidepanel header produces a Netscape-format `.html` file importable by Chrome, Firefox, Safari, and Edge.
- Group hierarchy preserved as nested `<DL>`/`<H3>` folders. Ungrouped bookmarks appear in a dedicated folder at the top.
- Every `<A HREF>` entry carries `ADD_DATE` + `LAST_MODIFIED` in unix seconds. Every title + URL is HTML-escaped (XSS-safe; test probes in the suite).
- Orphan rescue: if you deleted a group whose bookmarks still exist, those items now render under "Ungrouped" instead of being silently dropped.
- Performance: median 6.22ms on a 1,000-item / 100-group collection (vs 500ms AC budget — 80× headroom).

**Export to JSON backup (B-043)**
- New "Export JSON" button produces a round-trip-safe JSON backup of every item, group, and (if set) user preferences.
- `schemaVersion: 1` locks the shape as the future import contract. Any future change bumps the version and requires a compatible migration path.
- Deterministic output: two exports of the same data are byte-identical (except `exportedAt`). Verified by permutation tests.
- Privacy: zero telemetry, zero profile IDs, local-only processing. Same as the rest of Tab Junkie.

**Global URL-text contrast fix (B-064)**
- The URL subtitle under every saved bookmark row was failing WCAG AA 4.5:1 in both themes (worst ratios ~2.86-3.48:1). All 8 theme × effective-background cells now pass with a 5.25:1 worst case.
- Zero new tokens — mirrors the approach B-048 took for selected rows. Visual hierarchy preserved (title > URL).

**Internal refactor (B-065)**
- Three helper functions previously reproduced verbatim inside test files (item aria-label builder, group-picker row builder, group-picker filter matcher) now live in `shared/aria-label.js` and `shared/group-picker-core.js`. Eliminates silent test-vs-production drift.

### Known limitations

- **B-066** — Remaining `--text-tertiary` surfaces (group drag handle + four empty-state body-text consumers) still fail WCAG AA. Filed for Sprint 18.
- **B-067** — Export sanitizers use a deny-list instead of the authoritative §32.5 allow-list. Ships before B-045 (JSON import) to lock the import contract. Filed for Sprint 18.

### Internal

| Item | Files added | Files changed |
|------|-------------|---------------|
| B-065 | `shared/aria-label.js`, `shared/group-picker-core.js` | `sidepanel/sidepanel.js`, `tests/b048-visual-states.test.js`, `tests/b029-group-picker.test.js`, `tests/b027-group-header-menu.test.js` |
| B-064 | `docs/a11y-audit-B-064.md` | `sidepanel/sidepanel.css` (3-line edit) |
| B-042 | `shared/export-schema.js`, `background/export/shared.js`, `background/export/html-export.js`, `tests/b042-html-export.test.js`, `docs/UAT_B-042.md` | `shared/messages.js`, `background/messages/storage-handlers.js`, `sidepanel/sidepanel.html`, `sidepanel/sidepanel.js` |
| B-043 | `background/export/json-export.js`, `tests/b043-json-export.test.js`, `docs/UAT_B-043.md` | `background/messages/storage-handlers.js`, `sidepanel/sidepanel.html`, `sidepanel/sidepanel.js` |
| R6 close | — | `docs/SOLUTION_DESIGN.md` §32 + §32.16 |
| R7 docs | `docs/user-manual/exporting-data.md` | `CHANGELOG.md`, `STORE_LISTING.md`, `docs/user-manual/accessibility.md` |

- **+85 new automated tests** (721 → 806 total), all passing.
- **No storage schema change. No manifest permission change.** `<a download>` + Blob URL avoids the `downloads` permission entirely.
- **New message contract**: `MSG_EXPORT_COLLECTION` (shared across HTML + JSON formats with a discriminator payload).
- **New frozen contract**: `shared/export-schema.js :: EXPORT_SCHEMA_VERSION` + §32.5. Locks the JSON shape as the B-045 import target.

### Test results

- Automated: **806 / 806 passing** (0 fail, 0 skipped, 0 todo).
- UAT: `docs/UAT_B-042.md` (14 cases) + `docs/UAT_B-043.md` (15 cases). Fast Track items (B-064, B-065) covered by zero-regressions against the full suite.
- R4 review rollup: 0 CRITICAL, 3 HIGH (all fixed before R5), 25 MEDIUM (all fixed or consciously deferred), 25 LOW.

### Rollback

No storage schema change, no permission change — rollback is a straightforward `git revert`.

```
# On release/v2:
git revert HEAD   # reverts Sprint 17 feat commit

# If extension already loaded by users:
# 1. Unload the extension in edge://extensions
# 2. Load prior-version zip (tab-junkie v1.11.0)
# No storage cleanup needed.
```

**Post-rollback behaviour:**
- B-042 + B-043: Export buttons disappear. Any exported files created during v1.12.0 remain on disk (not Tab Junkie's problem). No user data lost.
- B-064: URL text reverts to `--text-tertiary` (re-introduces the AA gap).
- B-065: Internal only — sidepanel.js re-inlines the helpers via git revert; test files re-inline their reproductions. Runtime behavior unchanged.

---

## v1.11.0 — A11y Polish + Group Picker + Visual States (2026-04-18)

**Staged on `release/v2` — pending v2 merge to main. Intended tag: `v1.11.0`.**

**Staging commit**: current HEAD on `release/v2` (Sprint 16 feat commit — see `git log --oneline -1`).

### What's new

**Group picker modal (B-029)**
- Three ad-hoc native `<select>` pickers (bulk-bar "Move to group", selection context menu, Open Tabs "Save to group") and the B-027 group-header menu all now open a single unified modal picker.
- The picker lists every group with its color chip, name, saved-item count, and open-tab count. A filter box narrows the list in real time; arrow keys move highlight; Enter confirms; Escape cancels.
- NEW action on the B-027 group-header context menu: "Move items out of group" — moves every item in the group to a target group in one operation.
- NEW empty-state on fresh profiles with zero groups: a "Create group" link opens the existing group-create dialog directly from the picker.

**Item visual-state sweep (B-048)**
- All five row states — live, active, drifted, audible, selected — now have non-color distinction (a grayscale user can tell them apart) and WCAG AA text + non-text contrast in both themes.
- The selected checkbox is a real DOM element (not a `::before` pseudo). It appears on hover and is persistent when the row is selected. Layout slot is reserved so hover does not cause a reflow.
- Screen readers announce combined states in a deterministic order: `active → live → drifted → audible → selected` (e.g. "active tab, live tab, tab content has changed, playing audio, selected").
- New `--active-bg-hover` token gives active rows a distinct hover appearance.

**Dark-theme contrast fix (B-062)**
- Primary-action buttons (Save bookmark, Save group, Save anyway confirm) now meet WCAG AA 4.5:1 in dark theme. New `--on-accent` token (light `#ffffff` / dark `#0a0f1a`) replaces the hardcoded white text.
- Also fixed during R4: `.empty-state-cta:hover` and the window filter chip's active/hover states — same class of bug on sibling surfaces.

**Context-menu blur dismiss (B-063)**
- Any open Tab Junkie context menu automatically dismisses when the user clicks off of the extension (webpage, address bar, other Chrome tab, other browser window, other application).
- Hover alone does NOT dismiss — you can mouse over the active webpage while the menu stays open.
- Focus is NOT restored to the trigger row on blur-close (you're interacting with something else — yanking focus back is jarring).

### Known limitations

- **B-064** — `.item-url` tertiary-text contrast on non-selected rows still fails WCAG AA globally (~2.86–3.48:1). B-048 fixed the on-selected-row case; the global sweep is filed as P1/S for Sprint 17.

### Internal

| Item | Files added | Files changed |
|------|-------------|---------------|
| B-062 | `docs/a11y-audit-B-062.md` | `sidepanel/sidepanel.css` |
| B-063 | `tests/b063-blur-close.test.js` (12 cases) | `sidepanel/sidepanel.js` |
| B-029 | `tests/b029-group-picker.test.js` (60 cases), `docs/UAT_B-029.md` | `sidepanel/sidepanel.html`, `sidepanel/sidepanel.css`, `sidepanel/sidepanel.js`, `tests/b027-group-header-menu.test.js` |
| B-048 | `tests/b048-visual-states.test.js` (40+ cases), `docs/a11y-audit-B-048.md`, `docs/UAT_B-048.md` | `sidepanel/sidepanel.css`, `sidepanel/sidepanel.js` |
| R6 close | — | `docs/SOLUTION_DESIGN.md` §30.14 (B-029) + §31.15 (B-048) |
| R7 docs | `docs/user-manual/accessibility.md` | `CHANGELOG.md`, `STORE_LISTING.md`, `docs/user-manual/managing-items.md`, `docs/user-manual/open-tabs.md` |

- **+116 new automated tests** (605 → 721 total), all passing.
- **No storage schema change. No manifest permission change. No migration required.**
- **New message contracts**: none — all 4 items reuse existing handlers.
- **New tokens**: `--on-accent`, `--selected-bg`, `--selected-border`, `--active-bg-hover`. All colocated in the existing 4 theme blocks.

### Test results

- Automated: **721 / 721 passing** (0 fail, 0 skipped, 0 todo).
- UAT: `docs/UAT_B-029.md` (16 cases) + `docs/UAT_B-048.md` (14 cases). Fast Track items (B-062, B-063) covered by zero-regressions against the full suite.
- R4 review rollup: 0 CRITICAL, 4 HIGH (all fixed before R5), 19 MEDIUM (all fixed or consciously deferred), 30 LOW (mostly deferred as nits).

### Rollback

No storage schema change, no permission change, no migration — rollback is a straightforward `git revert`.

```
# On release/v2:
git revert HEAD   # reverts Sprint 16 feat commit

# If extension already loaded by users:
# 1. Unload the extension in edge://extensions
# 2. Load prior-version zip (tab-junkie v1.10.0)
# No storage cleanup needed.
```

**Post-rollback behaviour:**
- B-029: the ad-hoc `<select>` pickers return. No user data lost.
- B-048: row visual states revert to Sprint 13 appearance. `.item-select` element disappears (`::before` pseudo-checkmark pattern returns via the reverted CSS).
- B-062: primary buttons revert to `color: #ffffff`, re-introducing the dark-theme contrast gap.
- B-063: context menus no longer auto-dismiss on blur.

---

## v1.10.0 — URL Policy + Menu Polish (2026-04-18)

**Staged on `release/v2` — pending v2 merge to main. Intended tag: `v1.10.0`.**

**Staging commit**: current HEAD on `release/v2` (Sprint 15 feat commit — see `git log --oneline -1`).

### What's new

**Broader URL-scheme support (B-058)**
- Tab Junkie now accepts `chrome://`, `edge://`, `chrome-extension://`, `about:`, and `view-source:` URLs when saving a bookmark. Power users can track configuration pages, extension settings, and source views alongside regular sites.
- `javascript:` and `data:` schemes remain hard-rejected (XSS / payload vectors) — no change in security stance.
- Fixed a latent asymmetry where `file:` was allowed by the storage allowlist but rejected by a parallel prefix block-list inside `MSG_PROMOTE_TAB`. Scheme validation now flows through a single path (`normalizeUrl` → `ALLOWED_URL_SCHEMES`) so additions in one place never drift from the other.
- Cross-browser portability note: a saved `edge://` URL won't work in Chrome, and vice versa. Tab Junkie stores URLs verbatim; browser compatibility is the user's responsibility.

**Group header context menu (B-027)**
- Right-clicking a group header now opens a dedicated group-level context menu with: Open all bookmarks, Close all open tabs, Select all / Select open / Select bookmarked, Edit group, and Delete group.
- Destructive actions (Close all tabs, Delete group) are gated behind confirmation dialogs and visually styled red.
- Selection actions populate the bulk selection set using prefixed keys (`item:<id>`) so the B-024 bulk action bar activates immediately.
- Right-clicking the Ungrouped header no longer opens a Tab Junkie menu — the browser's native right-click menu is shown instead (it has no group-level actions to offer).

**Duplicate URL saves with soft-warn (B-059)**
- Saving a URL that already exists in your collection is now allowed. Instead of the previous `ERR_DUPLICATE_URL` blocking error, a confirmation dialog appears: "URL already saved as *{title}* in *{group}*. Save another copy?"
- Applies to single-tab save (Open Tabs row context menu → "Save to group") and bulk Save-to-group (aggregate dialog: "N of M tabs already saved"). Cancel aborts; confirm creates an additional copy.
- Service worker no longer performs O(n) duplicate-scan on every promote — detection moved to the client against the already-maintained `_cachedItems` cache. Measurable promote-latency win on large collections.
- Floating-group reassociation after a browser restart is unchanged; B-018's `(windowId, tabIndex)` tie-break handles duplicate-URL ambiguity correctly.

**Dimmed "cannot save" Open Tabs rows (B-061)**
- Rows in the Open Tabs section whose URL has a permanently-unsavable scheme (`javascript:`, `data:`) are now dimmed with a "Cannot be saved — unsupported URL scheme" tooltip.
- Rows that would produce a duplicate-URL soft-warn (B-059) render normally — dimming is strictly about scheme, not about duplicates.

### Known limitations

- **Dark-theme primary-button contrast below WCAG AA** — the "Save anyway" button in the B-059 soft-warn dialog uses the existing `--accent` / white text treatment that has been in place since Sprint 2 (B-003 / B-006 Save buttons). Dark-theme contrast measures ~2.3:1, below the 4.5:1 AA floor. Tracked as **B-062** (P1, S) for Sprint 16 — whole-app primary-button contrast sweep.

### Internal

| Item | Files added | Files changed |
|------|-------------|---------------|
| B-058 | `tests/b058-scheme-allowlist.test.js` | `shared/url.js`, `background/messages/storage-handlers.js`, `tests/promote-tab.test.js`, `tests/legacy-migration.test.js` |
| B-027 | `tests/b027-group-header-menu.test.js` | `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`, `sidepanel/sidepanel.html` |
| B-059 | `tests/b059-duplicate-warn.test.js`, `docs/UAT_B-059.md` | `background/messages/storage-handlers.js`, `shared/errors.js`, `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`, `tests/promote-tab.test.js` |
| B-061 | `tests/b061-unsavable-dim.test.js` | `shared/url.js` (exported `isUnsavableScheme`), `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css` |
| R6 close | — | `docs/SOLUTION_DESIGN.md` §29 added (B-059 R2 design) + §29.14 populated (R6 close) |
| R7 docs | — | `CHANGELOG.md`, `STORE_LISTING.md`, `docs/user-manual/open-tabs.md`, `docs/user-manual/managing-items.md` |

- +30 new automated tests (575 → 605 total), all passing.
- **No storage schema change. No manifest permission change. No migration required.**
- SOLUTION_DESIGN.md §29 is a 500+ line new chapter covering the B-059 R2 design, decision rejections, rollback plan, and §29.14 R6 close deviations.

### Test results

- Automated: **605 / 605 passing** (0 fail, 0 skipped, 0 todo).
- UAT: `docs/UAT_B-059.md` (12 cases covering all B-059 ACs + regression on destructive delete dialog variant leak + keyboard-only flow). Fast Track items (B-058, B-027, B-061) covered by zero-regressions against the full suite; no separate UAT doc per pipeline rules.
- R4 review rollup: 0 CRITICAL, 2 HIGH (both fixed before R5), 15 MEDIUM (all fixed or consciously deferred), 36 LOW (mostly deferred as nits).

### Rollback

No storage schema change, no permission change, no data migration — rollback is a straightforward `git revert`.

```
# On release/v2:
git revert HEAD   # reverts Sprint 15 feat commit

# If extension already loaded by users:
# 1. Unload the extension in edge://extensions
# 2. Load prior-version zip (tab-junkie v1.9.0)
# No storage cleanup needed.
```

**Post-rollback behaviour:**
- B-058: `chrome://` / `edge://` / etc. URLs saved during v1.10.0 remain in storage; they're user-intended and the data layer has always accepted them. Only new saves via `MSG_PROMOTE_TAB` hit the restored reject path.
- B-059: Duplicate items created during v1.10.0 remain saved; they behave normally for navigation, drift, claims, and delete. Only re-promoting one of them hits the restored `ERR_DUPLICATE_URL` reject.
- B-027 + B-061: Pure UI — rollback removes the menu / dimming; no state to clean up.

---

## v1.9.0 — Multi-window Awareness + URL Policy Spike (2026-04-17)

**Staged on `release/v2` — pending v2 merge to main. Intended tag: `v1.9.0`.**

**Staging commit**: current HEAD on `release/v2` (Sprint 14 feat commit — see `git log --oneline -1`).

### What's new

**Multi-window awareness & window badge (B-014)**
- Session-ordinal window numbering assigns stable labels (W1, W2, …) to browser windows in first-seen order. Ordinals are gap-preserving — closing W2 while W3 is open keeps W3 labelled W3. Ordinals are never written to storage; they are rebuilt on every service worker cold start via `chrome.windows.getAll`.
- Saved-item and Open Tabs rows now display a window badge (W1, W2, …) when the associated tab lives in a different browser window than the side panel.
- When two or more windows are open, a filter row appears in the panel header: an "All" chip and one chip per open window. Selecting a chip narrows the panel to that window's tabs. The filter row is keyboard-navigable (Arrow keys, Home/End, Enter/Space) following the ARIA `role="tablist"` pattern. The active filter resets to "All" automatically if the filtered window closes.
- `MSG_LIST_ITEMS` response extended with a `windowMap` field (`{ [windowId]: ordinal }`) so the sidepanel can resolve ordinals without a separate IPC round-trip.
- New `SCOPE.WINDOW_MAP` broadcast fires whenever window-to-ordinal mapping changes (window open, close, or focus change). Sidepanel updates all row badges in response.
- `tabs.onAttached` handler added to detect cross-window tab drags and retrigger ordinal re-assignment.
- New modules: `background/tabs/window-ordinals.js` (154 lines — ordinal registry + `initWindowOrdinals`), `shared/scopes.js` (new SSOT for all broadcast scope constants, eliminating bare-string comparisons).
- Absorbed **B-034** (window label filter row) — no separate sprint item needed.

**URL-scheme allowlist + duplicate-URL policy spike (B-057)**
- Completed a research-only Spike-First (XL) item documenting the current URL allowlist behavior and the cost of the existing `ERR_DUPLICATE_URL` hard-rejection policy in `MSG_PROMOTE_TAB`.
- Decisions accepted: (1) Expand the allowlist to cover `chrome://`, `edge://`, `chrome-extension://`, `about:`, and `view-source:` schemes; keep hard-reject for `javascript:` / `data:`. (2) Replace the hard `ERR_DUPLICATE_URL` rejection with a soft-warn UI.
- Implementation deferred to Sprint 15 (B-058 S, B-059 M, B-060 S, B-061 XS). B-056 retired to icebox.
- Spike output: `docs/spikes/B-057-url-policy-spike.md` (277 lines).
- No user-visible behavior changes this sprint from the spike.

### UAT-discovered in-sprint improvements

| # | Finding | Fix |
|---|---------|-----|
| UAT-D1 | Window filter chip `:focus-visible` outline was invisible in dark mode — `--accent-subtle` (`#1e293b`) too close to the panel background. | Switched to `outline: 2px solid var(--accent)` on the chip element. |
| UAT-D2 | Dragging a tab between windows while a window filter was active left the row visible in the wrong filter view — `refetchAndPatchLiveState` and the `SCOPE.WINDOW_MAP` broadcast handler patched `data-window-id` but never re-ran `applyFilter()`. | Added `if (_filterQuery \|\| _activeWindowFilter !== null) applyFilter();` to both handler paths. |

### Internal

| Item | Files added | Files changed |
|------|-------------|---------------|
| B-014 | `shared/scopes.js`, `background/tabs/window-ordinals.js`, `tests/window-ordinals.test.js` (12 tests), `tests/b014-multi-window.test.js` (25 tests), `docs/user-manual/multi-window.md` | `shared/messages.js`, `background/broadcast.js`, `background/tabs/index.js`, `background/tabs/tab-claims.js`, `background/tabs/tab-events.js`, `background/messages/storage-handlers.js`, `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`, `sidepanel/sidepanel.html`, `tests/b010-live-state.test.js`, `tests/enriched-list-items.test.js`, `tests/chrome-mock.js` |
| B-057 | `docs/spikes/B-057-url-policy-spike.md` | — |

- +51 new automated tests (481 → 532 total), all passing
- No storage schema change. No manifest permission change. No migration required.
- SOLUTION_DESIGN.md updated §28.12 (R6 Close — B-014, B-057).

### Test results
- Automated: 532/532 passing
- UAT: PASS — B-014 (12/14 steps; 2 skipped — 3+ window edge cases not exercisable in single-session UAT, but logic covered by `tests/window-ordinals.test.js`). B-057 spike: no UAT required (research-only item).

### Rollback

No storage schema change — rollback requires no data cleanup.

```
# On release/v2:
git revert HEAD   # reverts Sprint 14 feat commit

# If extension already loaded by users:
# 1. Unload the extension in edge://extensions
# 2. Load prior-version zip (tab-junkie v1.8.0)
# No storage cleanup needed — windowMap is runtime-only (never persisted);
# shared/scopes.js is a pure constant module; window-ordinals state is rebuilt
# on every cold start from chrome.windows.getAll.
```

Reverting the Sprint 14 commit removes the window badge, the window filter row, and `shared/scopes.js`. The `windowMap` field on `MSG_LIST_ITEMS` responses reverts to `undefined`; the sidepanel treats that as "single-window mode" and hides the filter row — benign. The `SCOPE.WINDOW_MAP` broadcast handler is also removed; any stale sidepanel that receives a rogue broadcast will hit an unrecognised scope and no-op safely.

---

## v1.8.0 — Open Tabs Section, Selection Menu, Keyboard Shortcuts (2026-04-17)

**Staged on `release/v2` — pending v2 merge to main. Intended tag: `v1.8.0`.**

### What's new

**Open Tabs section (B-055)**
- New pinned section at the bottom of the side panel surfaces every live browser tab that is not yet saved or grouped. Click any row to focus the tab; right-click for "Save to group" or "Close tab". The section updates in real time as tabs open, close, or navigate and participates in the inline filter, multi-select, and bulk action bar.
- `MSG_LIST_ITEMS` response extended with `openTabs[]` array (no new message constant; existing contract extended additively).
- New module: `background/tabs/open-tabs.js` — assembles the open-tabs payload by diffing `LiveTabIndex` against claimed item IDs.
- UAT surfaced an insufficiently diagnostic error toast for multi-tab save failures; fixed in-sprint with a categorised breakdown: `"…(X already saved, Y restricted URL, Z other error)"`.
- Known limitation: tabs with restricted URL schemes (`edge://`, `chrome://`, `about:`, etc.) and tabs whose URL matches an existing saved bookmark cannot be saved. Rows are not yet visually distinguished. B-056 (visual dimming) and B-057 (URL/scheme policy SPIKE) are scheduled for Sprint 14.

**Selection context menu (B-028)**
- Right-clicking while two or more items are selected opens a selection-aware context menu offering Move to group, Close tabs, and Remove — the same operations as the bulk action bar, now reachable via keyboard-free right-click.
- Reuses B-026 menu infrastructure; dispatch branches by `_selection.size >= 2`. Bulk-bar handlers extracted into shared `_bulkMoveToGroup` / `_bulkClose` / `_bulkRemove` helpers so bar and menu share a single code path.
- New helper: `shared/selection.js` — `pruneSelection(selection, validIds)` removes stale item IDs from a `Set` before bulk actions run.

**Keyboard shortcuts — verify + regression (B-047)**
- Audited B-024's existing keydown handlers: all 3 ACs already met (Ctrl/Cmd+A selects all visible items including Open Tabs rows; Escape clears selection; text-input guard via tagName block-list + filter-input `stopPropagation`). Zero production code changes. Added 17 regression tests covering the open-tab mixed-row path, dialog-open guard, and filter-input suppression.

**Sort-order normalisation + selection pruning (B-051)**
- `normaliseGroupSortOrders` runs after every create, delete, move, bulk-create, and bulk-update operation. Assigns sequential `0..N−1` positions per group bucket; idempotent fast-path skips storage writes when positions are already normalised. Lays the groundwork for reliable drag-reorder.
- `WRITE_MESSAGE_TYPES` constant and `isWriteType()` helper added to `shared/messages.js` for safe-mode write-gate enforcement.

### UAT-discovered in-sprint improvement
- Block 2 step 8 (bulk-save to group from Open Tabs) failed due to the generic "Couldn't save N tabs — check URL scheme or duplicates" toast. Fixed before sprint close: toast now reports `"(X already saved, Y restricted URL, Z other error)"` breakdown, matching the single-tab context-menu path.

### Internal

| Item | Files added | Files changed |
|------|-------------|---------------|
| B-055 | `background/tabs/open-tabs.js`, `docs/user-manual/open-tabs.md` | `shared/messages.js`, `background/tabs/live-tab-index.js`, `background/tabs/tab-events.js`, `background/messages/storage-handlers.js`, `background/storage/items.js`, `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`, 5 test files |
| B-028 | `tests/b028-selection-context-menu.test.js` (12 tests) | `sidepanel/sidepanel.js` |
| B-047 | — | `tests/b024-multi-select.test.js` (+17 tests) |
| B-051 | `shared/selection.js`, `tests/b051-normalisation.test.js` (18 tests) | `background/storage/items.js`, `sidepanel/sidepanel.js`, `tests/b005-bulk-create.test.js` |

- +54 new automated tests (427 → 481 total), all passing
- No storage schema change. No manifest permission change. No migration required.
- SOLUTION_DESIGN.md updated §26 (B-055), §26.9 (B-028), §26.10 (B-047), §26.11 (B-051), §26.12 R6 Close.

### Test results
- Automated: 481/481 passing
- UAT: PASS — B-055 (Block 1: 7/7, Block 2: 3/3 PASS + 2 SKIP, Block 3: 6/6), B-028 (PASS — verified as part of B-055 Block 3 step 16), B-047 (PASS — verified as part of B-055 Block 3 keyboard interactions), B-051 (PASS — verified implicitly by B-055 Block 2 step 9 promote flow)

### Rollback

No storage schema change — rollback requires no data cleanup.

```
# On release/v2:
git revert 0f7e54d   # reverts Sprint 13 commit

# If extension already loaded by users:
# 1. Unload the extension in edge://extensions (or chrome://extensions)
# 2. Load prior-version zip (tab-junkie v1.7.0)
# No storage cleanup needed — Open Tabs section is read-only from storage's perspective;
# selection.js is a pure in-memory helper; sort normalisation writes are non-destructive.
```

Reverting the Sprint 13 commit removes the Open Tabs section (`openTabs[]` field on `MSG_LIST_ITEMS` response), the selection context menu, and `shared/selection.js`. Any cached `openTabs` state in the sidepanel is re-initialised on next `MSG_STATE_CHANGED` broadcast — benign. The `normaliseGroupSortOrders` write-back is also reverted; existing normalised sort values remain as written and cause no corruption.

---

## v1.7.0 — Multi-select, Context Menu, Empty States (2026-04-17)

**Staged on `release/v2` — pending v2 merge to main. Intended tag: `v1.7.0`.**

### What's new

**Multi-select + bulk action bar (B-024)**
- Click to select, Shift+Click for range, Ctrl/Cmd+Click to toggle, Ctrl/Cmd+A for all visible, Escape to clear selection. Selection state lives entirely in sidepanel memory — never persisted.
- Bulk action bar appears when one or more items are selected: shows item count, and offers Move to group (picker), Close tabs (live items only, disabled when none selected are live), Remove (demotes live items; fully deletes saved-only items; confirmation required), and Clear.
- Partial-failure paths: bulk-remove uses `Promise.allSettled` so first-failure does not abort remaining ops; selection is pruned to IDs that succeeded; failure count surfaces as a toast.
- Two new SW message contracts: `MSG_BULK_DELETE_ITEMS` (bulk delete saved items, `MAX_BULK_INPUTS` cap, partial-success envelope `{ deleted, notFound }`) and `MSG_BULK_UPDATE_ITEMS` (bulk patch `groupId`, same cap, `{ updated, notFound }`). Wire contracts documented in SOLUTION_DESIGN.md §25.
- `tabId` now surfaced on every `liveStates[itemId]` entry (one-line addition in `background/tabs/tab-claims.js`), enabling the bulk-close and context-menu close flows to dispatch correct Chrome tab IDs without a second IPC round-trip.

**Right-click item context menu (B-026)**
- Right-click any item row to open a viewport-clamped context menu: Navigate, Edit, Move to group, Close tab (live items only), Delete (visually distinguished in red).
- No new message contracts — dispatches existing `MSG_NAVIGATE_TO_ITEM`, `MSG_UPDATE_ITEM`, `MSG_BULK_UPDATE_ITEMS`, `MSG_CLOSE_TABS`, `MSG_DELETE_ITEM`.
- Uses in-memory `_cachedGroups` for the "Move to group" picker — zero extra IPC on menu open.
- Menu is closed automatically on `MSG_STATE_CHANGED` broadcast (prevents stale row under menu after cross-window data change).

**Empty states + dismissible error toasts (B-049)**
- Empty bookmark list: icon + "You haven't saved any bookmarks yet" + "Add your first bookmark" CTA.
- Empty filter: "No results for '<query>'" + "Clear filter" link.
- Empty group: per-group inline "No items in this group" message.
- Toast system: 4 s auto-dismiss, manually dismissible, single-toast queue, `role="alert"` + `aria-live="assertive"` — surfaces partial-failure counts and other recoverable errors.

### UAT-discovered defects fixed in-pipeline

Both found during interactive UAT (sprint close UAT session) and fixed before the sprint was closed. Full details in `docs/SPRINT_FINDINGS.md` ("UAT-Discovered Defects" section).

| # | Finding | Fix |
|---|---------|-----|
| UAT-D1 | Confirm dialog stayed open after clicking Delete — pre-existing latent bug in the generic `_pendingConfirmCallback` handler; affected single-item delete too. | Capture callback, call `closeDialog()`, then invoke callback. |
| UAT-D2 | Filter-empty "Clear filter" button also triggered the Add Bookmark dialog — both CTAs shared `.empty-state-cta`, and the document handler matched both. | Narrowed selector to `.empty-state-cta:not(#filter-empty-clear-btn)`. |

### Internal

- New test file: `tests/b024-multi-select.test.js` (+53 tests)
- Updated: `tests/b010-live-state.test.js`, `tests/enriched-list-items.test.js`
- +53 new automated tests (374 → 427 total), all passing
- No storage schema change. No manifest permission change. No migration required.
- SOLUTION_DESIGN.md updated to v2.6 (§25 B-024, §25.9 B-026 + B-049, §25.10 UAT defects, §25.11 rollback plan)

### Test results
- Automated: 427/427 passing
- UAT: PASS — B-024 (12/12 gesture + bulk-bar steps), B-026 (11/11), B-049 (3/3 empty-state paths; error-toast trigger deferred — tracked as Task #7)

### Rollback

No storage schema change — rollback requires no data cleanup.

```
# On release/v2:
git revert <commit-sha>   # reverts Sprint 12 commit

# If extension already loaded by users:
# 1. Unload the extension in edge://extensions (or chrome://extensions)
# 2. Load prior-version zip (tab-junkie v1.6.1)
# No storage cleanup needed — bulk ops are additive; reverting the code
# does not corrupt or orphan any existing data.
```

Removing the Sprint 12 commit drops `MSG_BULK_DELETE_ITEMS` and `MSG_BULK_UPDATE_ITEMS` from the dispatcher. Any in-flight request from a stale sidepanel will fall through to `ERR_VALIDATION` in the default dispatch branch — benign. The `tabId` field on live states reverts to `undefined`; the bulk-close UI treats that as "not live" (button disabled), not as an error.

---

## v1.6.1 — Sidepanel Shell Correctness + Floating Tab Persistence Fixes (2026-04-16)

### Fixed

**Sidepanel shell (B-054)**
- SVG icon factories (`_createAudibleIcon`, `_createDriftedIcon`) extracted and corrected — icons were previously inlined incorrectly and would fail to render in strict CSP environments
- `itemMap` lookup converted from O(N²) linear scan to O(1) Map — eliminates render lag with large collections
- Nested-group drag selector fixed — drag operations on items inside nested groups no longer silently no-op
- `replaceChildren` applied consistently across all list renders — prevents residual DOM nodes from stale renders

**Floating tab persistence (B-018)**
- `pruneResolvedFloatingGroups` race fixed — now reads the live current record rather than a stale snapshot captured before concurrent appends; prevents silent record loss under concurrent writes (TOCTOU)
- Claim-failure path corrected — a tab that fails to claim no longer gets marked as resolved; floating-group records are retained for the next reconciliation pass instead of being permanently dropped

### Internal
- 42 new automated tests (374 total: 332 baseline + 33 B-054 + 9 B-018), all passing
- SOLUTION_DESIGN.md v2.5 (§23 B-054, §24 B-018)

### Test results
- Automated: 374/374 passing
- UAT: PASS — B-054 (16/17 ACs; AC12 SKIP — requires browser environment), B-018 (13/13 ACs)

---

## v1.6.0 — Opener-chain Inheritance, Bulk-create, Circular Dep Fix (2026-04-16)

### What's new
- **Opener-chain group inheritance (B-013)** — when a new tab is opened from an existing claimed tab, the new tab is automatically assigned to the same group as the opener. The full opener chain is walked (up to 5 hops) so tabs opened transitively from a group member stay associated. Tab removal is detected asynchronously; stale openerMap entries are pruned with a configurable cap (`MAX_OPENER_MAP_ENTRIES`) to prevent unbounded memory growth.
- **Bulk-create saved items (B-005)** — new `MSG_BULK_CREATE_ITEMS` message accepts up to 500 items in a single atomic write transaction. Input is validated per-item; invalid candidates are collected and returned in `skipped[]` rather than aborting the whole batch. Enables future import UI and batch-promote workflows.

### Internal (B-053)
- Broke the circular dependency between `background/storage/partitions.js` and `background/storage/write-transaction.js` by extracting shared constants and shape helpers into a new `background/storage/shapes.js` module. Both modules now import from `shapes.js`; no behavior change.
- 40 new automated tests (332 total), all passing
- SOLUTION_DESIGN.md v2.3 (§20 B-053, §21 B-013, §22 B-005)

### Test results
- Automated: 332/332 passing
- UAT: PASS — B-013 (10/10 ACs), B-005 (10/10 ACs), B-053 regression PASS

---

## v1.5.0 — Favicons, Live Tab State, Group Reorder, Inline Filter (2026-04-16)

### What's new
- **Favicon auto-capture** — bookmark and live-tab rows show the site favicon; letter-avatar fallback (first char of title, color-hashed) when no favicon is available or when the URL fails the `isSafeFaviconUrl` scheme guard (`https://` and `chrome-extension://` only)
- **Live tab indicators** — sidepanel rows reflect live/active/audible state in real time; active tab highlighted distinctly; audible tabs show a speaker icon; multi-window `onFocusChanged` gap closed
- **Group drag-to-reorder** — groups can be dragged to any position; `sortOrder` persisted to storage via `MSG_UPDATE_GROUP`; collapse/expand state persisted across reloads; drag handle visible on hover; concurrent-render guard prevents drop indicator destruction mid-drag
- **Inline filter** — `#filter-input` with 150ms debounce; matching text highlighted with `<mark>` (XSS-clean DocumentFragment approach); `#filter-empty-state` aria-live region; `_itemById` O(1) Map replaces O(n²) linear scan; filter clears on group navigation

### Internal
- `isSafeFaviconUrl` scheme allowlist guard (security fix, B-010 H-5)
- `_ensureIndicators` for post-render audible icon injection (B-010 H-8)
- `mousedown` flag pattern for drag guard instead of broken `e.target.closest()` on section element (B-008 H-1)
- `_pendingGroupsRender` guard prevents concurrent render during active drag (B-008 H-4)
- `buildHighlightedText` uses `lowerQuery.length` for correct Unicode slicing (B-021 M-3)
- 63 new tests (285 total), all passing
- SOLUTION_DESIGN.md v2.1 (§17 B-010, §18 B-008, §19 B-021)

### Bookmark CRUD (shipped with Sprint 7 / no prior release)
- **Create, edit, delete bookmarks** — inline dialog in sidepanel with form validation, focus trap, and confirmation dialog for destructive actions

### Test results
- Automated: 285/285 passing
- UAT: PASS — B-004 (8/8 ACs), B-010 (12/12 ACs), B-008 (12/12 ACs), B-021 (10/10 ACs)

---

## v1.4.0 — Core Message Contract Complete (2026-04-15)

### What's new
- **State broadcast (MSG_STATE_CHANGED)** — every mutation + tab event notifies all open extension surfaces
- **Navigate-to-item (MSG_NAVIGATE_TO_ITEM)** — switch to existing tab or open new one with immediate claim
- **Close tabs (MSG_CLOSE_TABS)** — individual + bulk close with smart partition (valid vs gone)

### Internal
- `background/broadcast.js` with `SCOPE` enum and fire-and-forget delivery
- Cold-start broadcast suppression via `isClaimsReady` gate
- 18 message types in contract (up from 15)
- `lastAccessedAt` bug fix (was rejected by `validatePatch`)
- 26 new tests (205 total), all passing
- SOLUTION_DESIGN.md v1.5

### Test results
- Automated: 205/205 passing
- UAT: skipped (data-layer only)

---

## v1.3.0 — Phase A Features (2026-04-15)

### What's new
- **Group palette enforcement** — 9 semantic colors validated at create/edit time
- **Duplicate-name warning** — non-blocking soft warning when creating groups with conflicting names at the same level
- **Promote tab → bookmark** — `MSG_PROMOTE_TAB` saves a live tab as a persistent item with immediate claim, duplicate-URL detection, and scheme filtering
- **Demote bookmark → floating tab** — `MSG_DEMOTE_ITEM` removes saved status while preserving the live tab, saving floating-group position for cold-start re-association

### Internal
- `shared/constants.js` with frozen GROUP_COLORS palette
- `ERR_DUPLICATE_URL` error code
- 15 message types in contract (up from 13)
- 60 new tests (179 total), all passing
- SOLUTION_DESIGN.md v1.4

### Test results
- Automated: 179/179 passing
- UAT: skipped (data-layer only)

---

## v1.2.0 — Foundation Complete + URL Normalization (2026-04-15)

### What's new
- **Drift detection** — items flagged when their live tab navigates away from the saved URL; drift persists across restarts; clears automatically when tab navigates back
- **Floating-tab re-association** — group assignments survive browser restarts via exact window+index matching with URL fallback
- **URL normalization** — unified `normalizeUrl()` in `shared/url.js` with protocol defaulting, scheme validation, hostname lowercasing, fragment handling
- **Scheme allowlist update** — `http`/`https`/`file` accepted; `ftp`/`mailto` removed

### Internal
- New: `background/tabs/drift.js` (~120 LoC), `background/tabs/floating-groups.js` (~120 LoC), `shared/url.js`, `shared/errors.js`
- `StorageError` + `ERR_*` constants moved to `shared/errors.js` (canonical home)
- 35 new tests (119 total), all passing
- SOLUTION_DESIGN.md v1.3
- **Entire B-001 family (a/b/c/d) now complete** — full data layer shipped

### Known limitations
- No UI: sidepanel, newtab, popup still stubs
- No floating-group TTL (stale records may accumulate)
- `file:` URLs storable but may not be openable in MV3

### Test results
- Automated: 119/119 passing
- UAT: skipped

---

## v1.1.0 — Data Layer Completion (2026-04-15)

### What's new
- **Schema migration runner** — forward-only migration pipeline with `readyPromise` barrier; schema version tracked in `tj:meta.schemaVersion`; migrations execute atomically within `writeTransaction`
- **Downgrade safe-mode** — when the extension detects a newer schema version than it knows, all writes are blocked (`ERR_SAFE_MODE`); reads continue working; detectable via `MSG_GET_STATUS`
- **Quota monitoring** — 80% storage quota warning surfaced via `MSG_GET_STATUS` response
- **Legacy key migration** — `junkie_*` keys from v1 are shape-mapped to Items (best-effort) and removed on first startup
- **Live tab tracking** — in-memory `LiveTabIndex` rebuilt from `chrome.tabs.query` on every cold start; tracks `live`, `active`, `audible` per tab without any `storage.local` writes
- **Tab-claims disambiguation** — `TabClaims` in `storage.session` maps each saved item to a specific live tab; handles multiple items sharing one URL via first-unclaimed-wins in sort order
- **Enriched MSG_LIST_ITEMS** — response now includes `liveStates` map alongside items, providing real-time live/active/audible state per item at read time

### Internal
- New: `background/storage/migration.js` (~255 LoC)
- New: `background/tabs/` (4 modules, ~433 LoC)
- `ERR_SAFE_MODE` + `MSG_GET_STATUS` added to contracts
- Per-tab debounce on URL-change reevaluation (100ms, prevents claim races)
- `claimsReady` flag prevents stale reads before cold-start reconciliation completes
- Test suite: 81 automated tests, all passing (47 new)
- SOLUTION_DESIGN.md updated to v1.2

### Known limitations
- No UI: sidepanel, newtab, and popup are still empty stubs
- No drift tracking or floating-tab re-association (B-001d)
- Migration runner scaffold limited to single-partition atomicity (refactor needed for first real step)
- UAT skipped for this release (data-layer only)

### Test results
- Automated: 81/81 passing
- UAT: skipped

---

## v1.0.0 — Foundation Storage Layer (2026-04-15)

### What's new
- Partitioned storage schema: six isolated keys (`tj:meta`, `tj:items`, `tj:groups`, `tj:prefs`, `tj:drift`, `tj:floatingGroups`) under `chrome.storage.local`
- Full item and group CRUD with validation and strict group-depth enforcement (max depth 1)
- ULID-based IDs: sortable, stable, collision-free, never derived from URL or title
- Atomic writes via `writeTransaction()`: multi-step ops commit in a single `storage.local.set`, safe against mid-write service worker termination
- Service worker as sole writer: all UI surfaces send messages; the SW serializes all writes
- Message contract in `shared/messages.js` for UI-to-SW communication (12 message types)
- Placeholder UI stubs for sidepanel, newtab, and popup (extension loads cleanly)

### Internal
- Storage module: `background/storage/` (~910 LoC, 8 modules)
- Message handler: `background/messages/storage-handlers.js` (~145 LoC)
- ESLint `no-restricted-imports` enforcing write-boundary at lint time
- Test suite: 34 automated tests, all passing (node:test runner, zero deps)
- UAT: PASS (2026-04-15)

### Known limitations
- No UI: sidepanel, newtab, and popup are empty stubs
- No schema migration runner or downgrade safe-mode (B-001b)
- No live tab tracking or tab-claims disambiguation (B-001c)
- No drift tracking or floating-tab re-association (B-001d)

### Test results
- Automated: 34/34 passing
- UAT: PASS
