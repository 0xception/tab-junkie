# Sprint 41 — R4 Findings (Deduplicated)

_Pre-created at sprint kickoff per S39 retrospective action item (toolchain hygiene to bypass agent file-write permission denials)._

---

## [product-manager] — B-139 R1 LOCKED

**Destructive-action confirmation (DoR item 7)**: N/A — documentation edit only.
**Source-citation gate (B-118 self-applied)**: `CLAUDE.md` "### Round 2: Architecture" → "**R2 Correctness Checklist**" table (verified at `CLAUDE.md:358` for the section header; existing C-12 row at `CLAUDE.md:377`; "Fix-scope test-assertion enumeration" subsection follows at `CLAUDE.md:379` post-S38). New C-13 row inserts between current C-12 (line 377) and the "Fix-scope test-assertion enumeration" subsection (line 379).
**AC1 — Add C-13 row to R2 Correctness Checklist.** The R2 Correctness Checklist table in CLAUDE.md "### Round 2: Architecture" is amended to add a new row after C-12 (`CLAUDE.md:377`) and before the "Fix-scope test-assertion enumeration" subsection (`CLAUDE.md:379`): `| C-13 | Chrome event-feedback completeness | When the design prescribes a Chrome write API (e.g., \`chrome.tabs.move\`, \`chrome.bookmarks.move\`, \`chrome.windows.update\`), R2 MUST enumerate the corresponding event listeners (\`chrome.tabs.onMoved\`, \`chrome.bookmarks.onMoved\`, \`chrome.windows.onFocusChanged\`, etc.) that update the in-memory mirror, AND verify each listener is registered + the broadcast/cache-invalidation path is correctly hooked up. The Sprint 40 B-134 R3 missing-\`chrome.tabs.onMoved\` gap is the blocking precedent — write API shipped, listener missing, in-memory state stale, B-134 Op 1 user-visible behavior broken in v1.34.0 ship; required v1.34.1 hotfix B-136 to restore. |`
**AC2 — Limited scope.** Zero edits outside the R2 Correctness Checklist table block. PASS = `git diff CLAUDE.md` is limited to the new C-13 row insertion in the table; FAIL = any drift to other C-N rows, other CLAUDE.md sections, or other files.
**AC3 — No regressions.** `npm test` stays at the S41 kickoff baseline (1,782/1,782). PASS = full suite green; FAIL = any regression.
**AC4 — Table integrity.** Row inserted at the correct table position (between C-12 and the "Fix-scope test-assertion enumeration" subsection). Checklist enumeration order preserved (C-1a, C-1b, C-2 … C-12, C-13). PASS = `grep -nE "^\| C-[0-9]" CLAUDE.md` shows C-13 immediately after C-12, with the table structure intact; FAIL = ordering drift, missing pipe characters, or table corruption.
**AC5 — Out of scope.** (a) No retroactive amendment to past R2 chapters. (b) B-140/B-141/B-142/B-143 are NOT in scope here. (c) No new test files. (d) No changes to other CLAUDE.md sections.
**R3 ordering note (B-139 + B-140 collision)**: B-139 and B-140 both edit the R2 Correctness Checklist table. R3 MUST bundle these into a single edit pass. Row order: (1) B-139 C-13 row first (immediately after existing C-12); (2) B-140 C-14 row second (immediately after the new C-13 row). This ordering keeps event-feedback (B-139) before gen-counter content predicate (B-140) — the gen-counter rule references in-memory mirroring, which is what B-139's listener-registration check feeds. R3 must verify `git diff CLAUDE.md` shows both rows added in the correct sequence with no merge conflict against B-141/B-142/B-143's R3 Build section edits. **R1 LOCKED.**

---

## [product-manager] — B-140 R1 LOCKED

**Destructive-action confirmation (DoR item 7)**: N/A — documentation edit only.
**Source-citation gate (B-118 self-applied)**: `CLAUDE.md` "### Round 2: Architecture" → "**R2 Correctness Checklist**" table (verified at `CLAUDE.md:358` for the section header; existing C-12 row at `CLAUDE.md:377`). New C-14 row inserts after the new C-13 row (added by B-139 in this same R3 bundle pass) and before the "Fix-scope test-assertion enumeration" subsection (`CLAUDE.md:379` pre-bundle).
**AC1 — Add C-14 row to R2 Correctness Checklist.** The R2 Correctness Checklist table in CLAUDE.md "### Round 2: Architecture" is amended to add a new row after C-13 (the new row being added by B-139 in the same R3 bundle pass) and before the "Fix-scope test-assertion enumeration" subsection: `| C-14 | Generation-counter content predicate | When the design uses generation counters (e.g., \`_cachedItemsGen\`, \`_cachedOpenTabsGen\`, \`_cachedFloatingMembersGen\`) for cache-invalidation OR drag-state race-guard purposes, R2 MUST enumerate explicitly "what changes count as gen-counter-relevant" (i.e., the content predicate that determines a bump). The Sprint 40 B-134 H-1 over-trip class is the blocking precedent — gen counters bumped on every cache write including ambient liveState patches (title/audible/active changes) caused race-guard B to over-trip during legitimate drag operations; UAT-blocker fixed in Wave 3a via content-conditional setter guards. R2 must specify the gen-bump predicate up-front so R3 cannot inherit the over-trip class. |`
**AC2 — Limited scope.** Zero edits outside the R2 Correctness Checklist table block. PASS = `git diff CLAUDE.md` is limited to the new C-14 row insertion in the table (alongside the B-139 C-13 row insertion in the same bundle); FAIL = any drift to other C-N rows, other CLAUDE.md sections, or other files.
**AC3 — No regressions.** `npm test` stays at the S41 kickoff baseline (1,782/1,782). PASS = full suite green; FAIL = any regression.
**AC4 — Table integrity.** Row inserted at the correct table position (between B-139's new C-13 row and the "Fix-scope test-assertion enumeration" subsection). Checklist enumeration order preserved (… C-12, C-13, C-14). PASS = `grep -nE "^\| C-[0-9]" CLAUDE.md` shows C-14 immediately after C-13, with table structure intact; FAIL = ordering drift, missing pipe characters, or table corruption.
**AC5 — Out of scope.** (a) No retroactive amendment to past R2 chapters. (b) B-139 (C-13 row) is bundled with this item — see R3 ordering note below; B-141/B-142/B-143 are NOT in scope here. (c) No new test files. (d) No changes to other CLAUDE.md sections.
**R3 ordering note (B-139 + B-140 collision)**: B-139 and B-140 both edit the R2 Correctness Checklist table. R3 MUST bundle into a single edit pass. This row (C-14) is inserted SECOND, immediately after B-139's C-13 row. R3 must verify both rows are present in the correct order with no merge conflict against B-141/B-142/B-143's R3 Build section edits. **R1 LOCKED.**

---

## [product-manager] — B-141 R1 LOCKED

**Destructive-action confirmation (DoR item 7)**: N/A — documentation edit only.
**Source-citation gate (B-118 self-applied)**: `CLAUDE.md` "### Round 3: Build (Frontend)" section (verified at `CLAUDE.md:390` for the section header; existing **STOP-and-escalate on AC-locked deferrals** bullet at `CLAUDE.md:394`).
**AC1 — Extend the STOP-and-escalate bullet.** The existing **STOP-and-escalate on AC-locked deferrals** bullet at `CLAUDE.md:394` is amended in-place to extend its trigger conditions. The amended bullet text becomes: "**STOP-and-escalate on AC-locked deferrals OR R2-spec-incorrect findings**: if [frontend-engineer] considers deferring any AC-locked behavior to a follow-up item, OR discovers during R3 that the R2 spec is incorrect, contradicted by reality, or fails an empirical check (e.g., `chrome.tabs.move(... index: -1)` doesn't behave as R2 documented; the prescribed selector doesn't exist; the prescribed helper API doesn't accept the documented payload shape), they MUST stop the build and escalate to [scrum-master] for an explicit scope-change decision OR an R2-amendment routing. Silently embedding 'future enhancement' / 'deferred' / 'follow-up' comments inline with the code is forbidden — these are scope changes per CLAUDE.md 'Scope Change Control' and require [scrum-master] handling. Silently deviating from the R2 spec in code is also forbidden — R2-time discrepancies must surface at R3, not at R4 or R6 As-Built. The Sprint 38 B-121 R3 silently-deferred newtab close-button affordance (R2 §60.6.2(c) AC6) is the AC-locked-deferral blocking precedent — R4 [code-reviewer] caught it as HIGH H-1, costing a fix-and-reproceed cycle. The Sprint 40 B-134 R3 §63.8.2 parentItemId re-anchor deviation (R4 [code-reviewer] M-4) is the R2-spec-incorrect blocking precedent — R3 chose the correct as-built behavior but the R2 spec was wrong; the deviation only surfaced at R4 instead of R3, requiring R6 As-Built reconciliation."
**AC2 — Limited scope.** Zero edits outside the existing STOP-and-escalate bullet at `CLAUDE.md:394`. PASS = `git diff CLAUDE.md` is limited to that single bullet's text (alongside B-142/B-143's NEW bullets added separately, per R3 ordering note); FAIL = any drift to other R3 bullets, other CLAUDE.md sections, or other files.
**AC3 — No regressions.** `npm test` stays at the S41 kickoff baseline (1,782/1,782). PASS = full suite green; FAIL = any regression.
**AC4 — Out of scope.** (a) No retroactive amendment to past R3 sessions. (b) B-139/B-140/B-142/B-143 are NOT in scope here. (c) No new test files. (d) No changes to other CLAUDE.md sections. (e) The existing **Cascade-prune sibling-grep** bullet at `CLAUDE.md:395` is NOT modified by this item.
**Self-application note**: B-141 is itself an R3 charter change. R3 [frontend-engineer], when implementing B-139..B-143 in this bundle, MUST apply B-141's amended STOP-and-escalate rule to its own work — i.e., if any of the prescribed wording in this bundle is found at R3 to conflict with reality (e.g., line numbers shifted, section headers renamed, existing bullets restructured), R3 MUST stop and escalate, not silently adapt the wording. This is the first self-applied test of the new gate.
**R3 ordering note (B-141 + B-142 + B-143 collision)**: B-141 (extends an existing bullet at line 394), B-142 (adds a NEW bullet after line 395), and B-143 (adds a NEW bullet after B-142's bullet) all edit `### Round 3: Build (Frontend)`. R3 MUST bundle these three into a single edit pass. Bullet order: (1) **STOP-and-escalate on AC-locked deferrals OR R2-spec-incorrect findings** — extended in place at line 394; (2) **Cascade-prune sibling-grep** — unchanged at line 395; (3) **Cross-surface diff self-check** (B-142) — NEW bullet, inserted immediately after the Cascade-prune sibling-grep bullet; (4) **R2-deferred-to-UAT cheap-fix self-check** (B-143) — NEW bullet, inserted immediately after the cross-surface diff bullet. R3 must verify `git diff CLAUDE.md` shows the four bullets in this exact sequence with no merge conflict against B-139/B-140's R2 Correctness Checklist edits. **R1 LOCKED.**

---

## [product-manager] — B-142 R1 LOCKED

**Destructive-action confirmation (DoR item 7)**: N/A — documentation edit only.
**Source-citation gate (B-118 self-applied)**: `CLAUDE.md` "### Round 3: Build (Frontend)" section (verified at `CLAUDE.md:390` for the section header; existing **STOP-and-escalate on AC-locked deferrals** bullet at `CLAUDE.md:394`; existing **Cascade-prune sibling-grep** bullet at `CLAUDE.md:395`). New bullet inserts after `CLAUDE.md:395`.
**AC1 — Add Cross-surface diff self-check bullet.** The "### Round 3: Build (Frontend)" section in CLAUDE.md is amended to add a new bullet immediately after the **Cascade-prune sibling-grep** bullet (`CLAUDE.md:395`): "**Cross-surface diff self-check**: when the same AC implementation lands on 2+ surfaces (sidepanel + newtab + popup + standalone), R3 MUST explicitly diff the surface implementations against the R2 spec before claiming complete. The Sprint 39 B-124 R3 produced 3 silent newtab/sidepanel divergences (aria-label URL inclusion + Save CTA aria-label interpolation + docstring inaccuracy) — all caught at R4, costing a Wave 3a fix-round; the divergence existed because R3 implemented sidepanel correctly first then duplicated newtab without re-checking against R2 §61.8 spec. R3 charter now requires the explicit cross-surface diff."
**AC2 — Limited scope.** Zero edits outside the new bullet's insertion in `### Round 3: Build (Frontend)`. PASS = `git diff CLAUDE.md` is limited to the new bullet (alongside B-141's in-place amendment of line 394 and B-143's new bullet, per R3 ordering note); FAIL = any drift to other R3 bullets' text, other CLAUDE.md sections, or other files.
**AC3 — No regressions.** `npm test` stays at the S41 kickoff baseline (1,782/1,782). PASS = full suite green; FAIL = any regression.
**AC4 — Out of scope.** (a) No retroactive amendment to past R3 sessions. (b) B-139/B-140/B-141/B-143 are NOT in scope here. (c) No new test files. (d) No changes to other CLAUDE.md sections. (e) Existing R3 bullets' wording (STOP-and-escalate at line 394, Cascade-prune sibling-grep at line 395) is NOT modified by this item — B-141 handles the line-394 amendment separately.
**R3 ordering note (B-141 + B-142 + B-143 collision)**: B-141, B-142, B-143 all edit `### Round 3: Build (Frontend)`. R3 MUST bundle into a single edit pass. This bullet (Cross-surface diff self-check) is inserted THIRD in the section's bullet sequence, immediately after the Cascade-prune sibling-grep bullet (line 395) and before B-143's new bullet. R3 must verify all four bullets are present in the correct order with no merge conflict against B-139/B-140's R2 Correctness Checklist edits. **R1 LOCKED.**

---

## [product-manager] — B-143 R1 LOCKED

**Destructive-action confirmation (DoR item 7)**: N/A — documentation edit only.
**Source-citation gate (B-118 self-applied)**: `CLAUDE.md` "### Round 3: Build (Frontend)" section (verified at `CLAUDE.md:390` for the section header; existing **STOP-and-escalate on AC-locked deferrals** bullet at `CLAUDE.md:394`; existing **Cascade-prune sibling-grep** bullet at `CLAUDE.md:395`). New bullet inserts after B-142's new "Cross-surface diff self-check" bullet (added in the same R3 bundle pass).
**AC1 — Add R2-deferred-to-UAT cheap-fix self-check bullet.** The "### Round 3: Build (Frontend)" section in CLAUDE.md is amended to add a new bullet immediately after B-142's new "Cross-surface diff self-check" bullet: "**R2-deferred-to-UAT cheap-fix self-check**: when R2 explicitly defers a UX-risk to UAT (vs deferring as out-of-scope), R3 MUST explicitly assess whether the fix is cheap (≤10 LOC) and document the keep-deferred-or-pre-empt decision with rationale (typically as a code comment near the relevant code path). The Sprint 39 B-122 R2 §62.9 F-1 (Open-Tabs reject-guard) was correctly deferred at R2 to UAT, but cross-reviewer convergence at R4 said 'cheap-fix now' — Wave 3a applied a 5-line guard. New gate: cheap-fixes-disguised-as-UX-questions get pre-empted at R3, not at R4 / UAT."
**AC2 — Limited scope.** Zero edits outside the new bullet's insertion in `### Round 3: Build (Frontend)`. PASS = `git diff CLAUDE.md` is limited to the new bullet (alongside B-141's in-place amendment of line 394 and B-142's new bullet, per R3 ordering note); FAIL = any drift to other R3 bullets' text, other CLAUDE.md sections, or other files.
**AC3 — No regressions.** `npm test` stays at the S41 kickoff baseline (1,782/1,782). PASS = full suite green; FAIL = any regression.
**AC4 — Out of scope.** (a) No retroactive amendment to past R3 sessions. (b) B-139/B-140/B-141/B-142 are NOT in scope here. (c) No new test files. (d) No changes to other CLAUDE.md sections. (e) Existing R3 bullets' wording is NOT modified by this item.
**R3 ordering note (B-141 + B-142 + B-143 collision)**: B-141, B-142, B-143 all edit `### Round 3: Build (Frontend)`. R3 MUST bundle into a single edit pass. This bullet (R2-deferred-to-UAT cheap-fix self-check) is inserted FOURTH (last) in the section's new bullet sequence, immediately after B-142's "Cross-surface diff self-check" bullet. R3 must verify all four bullets are present in the correct order with no merge conflict against B-139/B-140's R2 Correctness Checklist edits. **R1 LOCKED.**

---

## [product-manager] — B-137 R1 LOCKED

**Title**: `tj:floatingGroups` schema v3→v4 — adopt `liveTabId` numeric tabId as primary live-tab join key (closes B-131; subsumes Issue 2 + Issue 3 from `docs/findings/post-s40-smoke-triage.md`).

**Tier**: Full (M) — schema bump + lazy data migration. Auto-upgrade rule (XS/S touching storage schema) does NOT trigger an upgrade beyond M because the spike already de-risked the design. **No XL Spike-First** — the R0 spike (`docs/findings/post-s40-smoke-triage.md` Issue 2 + B-131 re-eval) is the de-risking artifact and resolves the major architectural questions (lazy migration, fallback retention, cold-start re-bind site).

**Filed from**: post-S40 smoke-test R0 spike — `docs/findings/post-s40-smoke-triage.md` Issue 2 + B-131 re-eval section. The HIGH-confidence finding: `buildFloatingMembers` (`background/tabs/floating-members.js:90-97`) joins `tj:floatingGroups` records to `LiveTabIndex` via `(windowId, tabIndex)` position heuristic. When a new tab's position collides with the cell stored on a different record, that record's metadata flows into the wrong tab — user-visible as "GitLab title in CODE group's floating row sourced from a YouTube spawn". The `floatingTabId` ulid added by B-121 v2 (`background/tabs/floating-groups.js:189-197`) is currently dead-weight as a join key; it is consulted only as a prune-key, never as a live-tab join. Issue 3 (race-toast on rapid floating reorder) chains to the same brittle `(windowId, tabIndex)` join inside `_resolveRecordIndexByTabId` (`background/tabs/floating-groups.js:254-266`).

**Source-citation gate (B-118 self-applied)**:
- `background/storage/migration.js:76` — `KNOWN_VERSION = 3` constant. Bump target: `KNOWN_VERSION = 4`.
- `background/storage/migration.js:90-113` — `MIGRATION_STEPS` array (currently v1→v2 + v2→v3, both no-op governance bumps). New v3→v4 entry appended.
- `background/storage/shapes.js:105` — `defaultShape(PARTITION_META)` returns `{ schemaVersion: 3, … }`. Bump target: `schemaVersion: 4`.
- `background/storage/shapes.js:225-244` — `assertShape` for `PARTITION_FLOATING_GROUPS`: extends to tolerate optional `liveTabId` per the B-121 §60.4.6 / B-134 §63.2.4 OPTIONAL pattern (when present must be a finite number; when absent, legacy v3 record).
- `background/tabs/floating-groups.js:177-220` — `appendFloatingGroup`. Stamps `floatingTabId: ulid()` at line 190 today; B-137 ALSO stamps `liveTabId: <numeric tab id resolved at write time>`.
- `background/tabs/floating-groups.js:254-266` — `_resolveRecordIndexByTabId`. Becomes O(1) direct lookup via `liveTabId === tabId`; falls back to `(windowId, tabIndex)` for legacy v3 records.
- `background/tabs/floating-groups.js:107-162` — `reassociateFloatingGroups`. Cold-start re-association helper. Position+URL fallback retained for legacy v3 records lacking `liveTabId`; on resolution, the matched `tabId` is written back into the record's `liveTabId` field (lazy migration completes per record on first cold-start re-bind).
- `background/tabs/floating-groups.js:592-632` — `preMarkInheritedFromFloatingGroups` (B-132 §65.4). Same position+URL fallback contract; R2-VERIFY-1 picks the lazy-rewrite owner (recommend: NOT here; this helper stays pure-read-then-mark per its B-132 contract).
- `background/tabs/floating-groups.js:437-441` — `moveFloatingTab` `floatingTabId` preservation block (cross-group move). R2-VERIFY-2: extend the same preservation pattern to `liveTabId` (the live tab does not close across the cross-group move; the join survives).
- `background/tabs/floating-members.js:47-164` — `buildFloatingMembers`. New 3-tier join order: (a) `liveTabId` direct lookup → (b) position match → (c) URL match. The position+URL fallback path in lines 90-109 is preserved verbatim for legacy v3 records.
- `background/tabs/tab-events.js:140-171` — `chrome.tabs.onCreated` opener-chain block. Caller of `appendFloatingGroup` at lines 156-163. R2-VERIFY-7: the freshly-created `tab.id` (numeric) is in scope here; recommend caller passes `liveTabId: tab.id` in the `entry` object.
- `tests/floating-shape.test.js:99-114` — existing test asserting `floatingTabId` is auto-stamped + populated. New parallel test for `liveTabId` + a tolerance test for legacy v3 records lacking the field.
- `tests/migration-steps.test.js` — pins the migration registry's contiguity. New v3→v4 step extends the chain.

**R2-VERIFY markers** (resolved by [solution-architect] before R3):
- **R2-VERIFY 1 (cold-start re-bind owner)**: choose between `reassociateFloatingGroups` (`floating-groups.js:107-162`) and `preMarkInheritedFromFloatingGroups` (`floating-groups.js:592-632`) as the helper that rewrites `liveTabId` onto resolved legacy records. Both run on the same cold-start path. Recommendation: `reassociateFloatingGroups` because it already runs `pruneResolvedFloatingGroups` (already writes back to `tj:floatingGroups` storage); piggybacking the lazy `liveTabId` upgrade on that write transaction avoids adding a new write path. `preMarkInheritedFromFloatingGroups` should remain pure read+mark per its B-132 §65.4 contract.
- **R2-VERIFY 2 (`moveFloatingTab` parity)**: `liveTabId` must travel with the floating record across `moveFloatingTab` cross-group moves (the live tab itself does not close; the join must remain intact). Extend the `floatingTabId` preservation block at `floating-groups.js:437-441` to also preserve `liveTabId`.
- **R2-VERIFY 3 (typedef extension)**: `FloatingMember` typedef in `floating-members.js:25-39` does NOT need a new field — the descriptor's existing `tabId` field is the live-session join. The schema change is on the record, not the descriptor.
- **R2-VERIFY 4 (`reorderFloatingMembers` parity)**: `_resolveRecordIndexByTabId` callers at `floating-groups.js:309` (`reorderFloatingMembers`) and `floating-groups.js:333` (mutator inner-loop) and `floating-groups.js:409` (`moveFloatingTab` source resolution) get the same O(1) speed-up automatically. R2 confirms no behavioral change to `reorderFloatingMembers` — it remains atomic; the resolver is just faster and more correct.
- **R2-VERIFY 5 (test fixtures)**: catalog every existing `tj:floatingGroups` test fixture (across `tests/floating-*.test.js`, `tests/b121-*.test.js`, `tests/b125-*.test.js`, `tests/b132-*.test.js`, `tests/b134-*.test.js`) and decide whether each fixture needs a `liveTabId` field added (preferred for v4 tests) OR retains the legacy v3 shape (preferred for migration-tolerance tests). Both shapes exist intentionally; tests must explicitly target one or the other.
- **R2-VERIFY 6 (validator strictness)**: when present on disk, `liveTabId` MUST be a finite number; when absent, it is tolerated (legacy v3 record). R2 confirms the OPTIONAL-with-type-guard pattern in `assertShape` matches the existing `floatingTabId` precedent at `shapes.js:242-244` and the `sortOrder` precedent at the same validator block.
- **R2-VERIFY 7 (write-path tabId source for `appendFloatingGroup`)**: today `appendFloatingGroup` is invoked from `tab-events.js:156-163` inside `chrome.tabs.onCreated`. The fresh tab's `tab.id` (numeric) is in scope at the call-site. R2 confirms the cleanest signature change: (a) caller passes `liveTabId` in the `entry` object [recommended — explicit + avoids redundant index lookup], OR (b) `appendFloatingGroup` looks up `liveTabId` via `getLiveTabIndex()` against `(entry.windowId, entry.tabIndex)` inside the function.

**7 R2-VERIFY markers in total.** Critical ones: R2-VERIFY 1 (cold-start re-bind owner choice), R2-VERIFY 2 (`moveFloatingTab` `liveTabId` preservation parity with `floatingTabId`), R2-VERIFY 7 (`appendFloatingGroup` signature shape).

**Destructive-action confirmation (DoR item 7)**: N/A — schema migration is non-destructive. Lazy fallback (read-tolerates-legacy + writes-stamp-v4) preserves all existing data; legacy v3 records continue to render correctly via the position+URL fallback until natural turnover (tab closes) OR until cold-start re-bind rewrites them. No user-visible destructive write; no confirmation dialog needed.

**Performance acceptance criteria (DoR item 6)**: post-migration, `_resolveRecordIndexByTabId` becomes O(1) (Map.get(liveTabId)) where today it iterates O(N_records). `buildFloatingMembers` similarly drops from O(N_records × N_liveTabs) to O(N_records) total (one Map.get per record). `reassociateFloatingGroups` cold-start budget is unchanged — it still iterates records once with the position+URL fallback for legacy entries. No new microsecond budget needed for B-052 search-latency (50ms P95) or B-021 first-paint (200ms) compliance — all changes are net wins or neutral.

**Selector audit (rehome items)**: N/A — no DOM elements moved between surfaces. Schema-layer + SW-layer change only.

**Fix-scope test-assertion enumeration preview** (B-119/B-126 — final enumeration deferred to the R2 chapter; the ~8 likely-affected files):
- `tests/floating-shape.test.js` — assertion shape on records. New test: `liveTabId` is auto-stamped on `appendFloatingGroup`. New test: legacy records (no `liveTabId`) tolerated by validator.
- `tests/floating-position.test.js` — likely asserts position-match resolution; new tests for `liveTabId` direct-match path and the `(windowId, tabIndex)` legacy-fallback path.
- `tests/floating-multi.test.js` — multi-record scenarios; pin the post-displacement scenario from post-S40 Issue 2 (different record's metadata cannot bleed onto a tab that occupied the other record's stored position cell).
- `tests/floating-url-fallback.test.js` — URL-fallback path; ensure URL fallback still triggers when both `liveTabId` is absent AND position match fails (legacy v3 cold-start scenario).
- `tests/b121-floating-group-render.test.js` — render assertions; tolerate the new `liveTabId` field in the `tj:floatingGroups` shape.
- `tests/b125-claim-jump-fix.test.js` — `inheritedTabs` integration; legacy + v4 records must both inherit correctly.
- `tests/b132-cold-start-inheritance.test.js` — pre-mark behavior; pin that legacy v3 records still mark inherited via position+URL fallback (no `liveTabId` available).
- `tests/b134-tab-drag-reorder.test.js` — `reorderFloatingMembers` + `moveFloatingTab` parity; pin the race-toast scenario from post-S40 Issue 3 — rapid floating reorder using v4 records succeeds without `ERR_RACE` even when `LiveTabIndex.entry.index` is stale.
- `tests/migration-steps.test.js` — migration chain contiguity; v3→v4 step is contiguous and is a no-op (governance bump only).
- `tests/migration-fresh-install.test.js` + `tests/migration-normal.test.js` — `defaultShape(PARTITION_META).schemaVersion` must equal `KNOWN_VERSION` (i.e., 4 post-bump).

**C-1a + C-1b governance compliance plan**:
- **C-1a (governance — schema-version bump)**: APPLIES. `KNOWN_VERSION` bumps 3→4 in `background/storage/migration.js`. `defaultShape(PARTITION_META)` updates `schemaVersion: 3` → `schemaVersion: 4` in `background/storage/shapes.js`. New v3→v4 entry appended to `MIGRATION_STEPS`. `CHANGELOG.md` includes the SW module-cache flush note (extension toggle OFF→ON after update) at sprint close (R7 territory).
- **C-1b (data-migration strategy)**: **lazy migration** (option 2). Writes always stamp `liveTabId` (new code path); reads tolerate legacy v3 records lacking the field (fallback to position+URL match in `buildFloatingMembers` and `_resolveRecordIndexByTabId`). Legacy v3 records self-evict on tab close via natural turnover OR get `liveTabId` rewritten on the next cold-start re-bind via `reassociateFloatingGroups` (R2-VERIFY 1). The choice is recorded in the eventual R2 chapter and verified independently by R3.

**ACCEPTANCE CRITERIA — 8 ACs (R1 LOCKED 2026-04-29)**

**AC1 — Schema v3→v4 governance bump (C-1a)**: `tj:floatingGroups` records gain an optional `liveTabId: number|null` field. `KNOWN_VERSION` bumps to 4 in `background/storage/migration.js:76`. `defaultShape(PARTITION_META)` returns `{ schemaVersion: 4, ... }` in `background/storage/shapes.js:105`. A new no-op `MIGRATION_STEPS` v3→v4 entry is appended (matches v1→v2 and v2→v3 governance-only precedent at `migration.js:90-113`). The `assertShape` validator at `shapes.js:225-244` tolerates `liveTabId` per the OPTIONAL-with-type-guard pattern: when present, MUST be a finite number; when absent, the record is still valid (legacy v3 shape). PASS = `KNOWN_VERSION === 4`, fresh-install meta seeds at v4, validator accepts both shapes, migration chain remains contiguous; FAIL = any of the four governance changes missing.

**AC2 — Data-migration strategy: lazy (C-1b option 2)**: writes always stamp `liveTabId` on new records via `appendFloatingGroup`. Reads tolerate legacy v3 records (no `liveTabId`) via fallback to the existing position+URL match in `buildFloatingMembers` (`floating-members.js:90-109`). Legacy v3 records self-evict on tab close via the `pruneResolvedFloatingGroups` path OR get `liveTabId` populated on the next cold-start re-bind (AC5). No bulk rewrite is performed. No `MIGRATION_STEPS` data mutation. PASS = a legacy v3 fixture (no `liveTabId`) renders correctly via `buildFloatingMembers` AND a freshly written v4 record renders correctly via the new direct-tabId path; FAIL = legacy fixtures break OR new writes omit `liveTabId`.

**AC3 — Write path: `appendFloatingGroup` stamps `liveTabId`**: `appendFloatingGroup` (`background/tabs/floating-groups.js:177-220`) is extended to accept and persist a `liveTabId: number` field on every freshly written record alongside `floatingTabId`. The caller in `tab-events.js:156-163` (the `chrome.tabs.onCreated` opener-chain block) passes `tab.id` (the freshly created tab's numeric id) into the entry. R2-VERIFY 7 picks the call signature (recommend caller-supplies via the `entry` object). Every record written via `appendFloatingGroup` post-deploy has both `floatingTabId` (ulid identity) AND `liveTabId` (numeric live-session id) populated. PASS = a `tests/floating-shape.test.js` assertion confirms `typeof record.liveTabId === 'number' && Number.isFinite(record.liveTabId)` after `appendFloatingGroup`; FAIL = `liveTabId` missing from new records.

**AC4 — Read path: `buildFloatingMembers` uses `liveTabId` first**: the resolver in `background/tabs/floating-members.js:47-164` adopts a 3-tier join order:
  - **(a) Direct tabId** — if `record.liveTabId` is a finite number AND `liveIndex.has(record.liveTabId)` AND the matched live tab is not in `claimedTabIds` AND the matched tabId is not already in `matchedTabIds`, resolve directly via tabId (O(1) Map.get).
  - **(b) Position match** (existing) — if (a) fails (e.g., legacy v3 record has no `liveTabId`, or the recorded `liveTabId` is a stale tabId from a session that has rotated): iterate `liveIndex` to find the entry whose `windowId` AND `index` match the record. Existing behavior preserved verbatim.
  - **(c) URL fallback** (existing) — if (b) fails: normalize and match URLs against `liveIndex` entries.
The H-2 dedup gate (`floating-members.js:118-119`) and the claimed-tab filter (`:114`) remain unchanged. PASS = unit tests pin all three resolution paths against synthetic fixtures (v4 record with valid `liveTabId`; v4 record with stale `liveTabId` not in liveIndex; v3 legacy record with no `liveTabId`); FAIL = any path misroutes.

**AC5 — Cold-start re-bind populates `liveTabId` on legacy records**: per R2-VERIFY 1, exactly one of `reassociateFloatingGroups` (`floating-groups.js:107-162`) or `preMarkInheritedFromFloatingGroups` (`floating-groups.js:592-632`) is extended to write `liveTabId` onto re-bound legacy v3 records. Recommendation: `reassociateFloatingGroups` (already performs storage writes via `pruneResolvedFloatingGroups`). When a legacy v3 record's position+URL fallback matches a live tab, the matched `tabId` is written back into `record.liveTabId` as part of the same write transaction. Subsequent reads use the direct-tabId path (AC4(a)). The other helper retains its existing pure-read-then-mark contract per its B-132 chapter spec. PASS = a fixture seeded with a legacy v3 record (no `liveTabId`) is observed to gain `liveTabId === <matchedTabId>` after the SW cold-start re-association runs; FAIL = legacy records remain v3-shaped indefinitely.

**AC6 — `_resolveRecordIndexByTabId` direct-tabId fast-path**: the helper at `background/tabs/floating-groups.js:254-266` adopts the same 3-tier join order: (a) `record.liveTabId === tabId` AND `record.groupId === groupId` → return record index; (b) `(windowId, tabIndex)` position match → return record index (preserves legacy v3 records); (c) -1 if neither matches. Callers at `floating-groups.js:309` (`reorderFloatingMembers`), `floating-groups.js:333` (mutator inner re-resolve), and `floating-groups.js:409` (`moveFloatingTab` source resolution) consume the same helper unchanged — the resolver is faster and more correct without any caller-side change. The `moveFloatingTab` cross-group `floatingTabId` preservation block at `floating-groups.js:437-441` is extended to also preserve `liveTabId` (the live tab does not close across the move; the join survives) per R2-VERIFY 2. PASS = (a) the post-S40 Issue 3 reproduction fixture (rapid floating reorder with stale `LiveTabIndex.entry.index`) succeeds without `ERR_RACE` because `liveTabId` direct-match bypasses the stale-index fallback; (b) `reorderFloatingMembers` + `moveFloatingTab` continue to pass all existing B-134 tests; FAIL = any call-site regression OR the cross-group move loses `liveTabId`.

**AC7 — Regression guards**: full automated test suite green. Existing tests (B-121 floating render, B-122 group drag-to-root, B-124 group floating visual, B-125 claim-jump-fix, B-130 floating visual cue, B-132 cold-start inheritance, B-134 tab drag-reorder, B-136 chrome.tabs.onMoved listener) stay green unchanged. **New tests pin two regression scenarios from the R0 spike**:
  - **T1 (post-S40 Issue 2 — sibling-title displacement)**: deliberate position-collision fixture — record A is written with `liveTabId: 100, windowId: 1, tabIndex: 0`; live tab 100 is then moved to a different position so that a different tab (101) now occupies `(windowId: 1, tabIndex: 0)`. `buildFloatingMembers` MUST resolve record A to tab 100 (via `liveTabId` direct-match), NOT tab 101 (via position-match). The descriptor's `title` field MUST equal tab 100's title, NOT tab 101's title. PASS = wrong-tab-title bleed is impossible post-v4.
  - **T2 (post-S40 Issue 3 — race-toast on rapid reorder)**: integration scenario — drag-reorder a floating tab whose record carries `liveTabId` while the SW's `LiveTabIndex.entry.index` is artificially stale (mocked to simulate the gap closed by B-136). `MSG_REORDER_FLOATING_MEMBERS` MUST resolve via the direct-tabId path AND succeed (`reordered: true`) despite the stale position. PASS = no `ERR_RACE` toast in the v4 path.

**AC8 — Out of scope (explicit)**:
  (a) `(windowId, tabIndex)` position fallback REMAINS present in all four reader sites (`buildFloatingMembers`, `_resolveRecordIndexByTabId`, `reassociateFloatingGroups`, `preMarkInheritedFromFloatingGroups`) — required for legacy v3 records during the cold-start re-bind window. **B-138 is the cleanup item that removes the fallback** once telemetry confirms zero v3 records remain in the wild (out of scope for B-137).
  (b) No behavioral change to drag-reorder UX — the user does not see any difference in op feel; this is a correctness fix surfaced through the existing AC1-AC8 of B-134.
  (c) No change to `inheritedTabs` Set semantics (B-125 contract) or `claimsMirror` reconciliation contract (B-018 / B-099).
  (d) Cross-window floating-tab drag remains B-135 territory (deferred stub).
  (e) No change to `MSG_LIST_ITEMS` response shape — the `FloatingMember` descriptor produced by `buildFloatingMembers` is unchanged (R2-VERIFY 3).
  (f) No new `manifest.json` permissions.
  (g) No new message contracts (`shared/messages.js` unchanged).
  (h) No newtab/popup parity changes — those surfaces consume `MSG_LIST_ITEMS` unchanged.

**Top R3 risks (preview for [frontend-engineer] build round)**:
1. **Cold-start re-bind site choice (R2-VERIFY 1)**: piggybacking the lazy `liveTabId` rewrite on `reassociateFloatingGroups`'s existing `pruneResolvedFloatingGroups` write transaction is the cleanest path, but it requires extending the writeTransaction's mutator to ALSO patch matched-but-unclaimed records with their `liveTabId`. Today the mutator only PRUNES resolved records. R3 must extend the mutator to handle three cases (matched+claimed → prune; matched+unclaimed → rewrite `liveTabId`; unmatched → leave). Risk: writing into a record we previously left alone introduces a new write surface; needs a B-121 §60.4.5 / §60.4.7-style governance note in the R2 chapter.
2. **Stale `liveTabId` (post-restart) edge case**: a `liveTabId` written in session N becomes meaningless in session N+1 (the same numeric tabId may now belong to a different tab). The 3-tier join handles this (`liveIndex.has(record.liveTabId)` returns false → position+URL fallback fires → cold-start re-bind rewrites `liveTabId`). R3 must verify the `liveIndex.has` guard correctly rejects stale tabIds before the direct-match path commits a wrong tabId. Test fixture: record carries `liveTabId: 100`; cold-start `liveIndex` has tab 100 belonging to a different parent. R2 to confirm whether an explicit URL guard on the direct-match path is also needed (i.e., on cache hit, additionally compare normalized URL — defense-in-depth).
3. **`moveFloatingTab` `liveTabId` preservation cascade-grep**: the cross-group move at `floating-groups.js:437-441` preserves `floatingTabId` today; B-137 must extend the same block to preserve `liveTabId`. Easy edit; risk is forgetting the site (the analog of B-121 R3's `appendFloatingGroup` line-190 ulid stamp). The B-141 STOP-and-escalate-on-cascade-grep precedent (CLAUDE.md ROUND 3 build note) applies — verify all `floatingTabId`-preserving sites are paralleled by `liveTabId`-preserving sites.
4. **Validator strictness (R2-VERIFY 6)**: `assertShape` for `PARTITION_FLOATING_GROUPS` must tolerate three cardinalities of optional fields: legacy v2 record (no `floatingTabId`, no `sortOrder`, no `liveTabId`); v3 record (`floatingTabId` + `sortOrder`, no `liveTabId`); v4 record (all three). Each present field must be type-checked; absence is allowed. Risk: B-134 R3 added `sortOrder` validation; B-137 R3 must follow the identical pattern at the same `shapes.js:225-244` block without breaking the existing checks.
5. **Test-fixture sprawl (R2-VERIFY 5)**: ~8 test files have existing `tj:floatingGroups` fixtures that must EITHER gain `liveTabId` (when targeting v4 behavior) OR remain legacy-shaped (when targeting migration-tolerance behavior). R3 must explicitly classify each test before editing the fixture. Mistakenly adding `liveTabId` to a migration-tolerance test silently weakens the test's coverage.

**Anything that should escalate back to brainstorm**: nothing identified. The R0 spike's recommendation (option B mixed: hotfix B-136 + S41 anchor B-137 lazy migration) is sound; the R1 ACs implement that recommendation directly. R2-VERIFY 1 is the only non-trivial design decision and is well-scoped to [solution-architect]'s R2 round. No architectural ambiguity that R1 cannot lock. **R1 LOCKED.**

---

## [security-reviewer] — B-139..B-143 R4 (Fast Track bundle)

**Verdict**: PROCEED — 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW. Bundle is documentation-only; threat surface is zero. All 5 process gates close real integrity gaps without introducing escape hatches.

**Scope of review**: 5 process-gate additions to `CLAUDE.md` (B-139 C-13 row, B-140 C-14 row, B-141 STOP-and-escalate extension in place at line 396, B-142 cross-surface diff bullet, B-143 R2-deferred-to-UAT cheap-fix bullet). Verified diff: `git diff --stat CLAUDE.md` shows `1 file changed, 5 insertions(+), 1 deletion(-)` — exactly the bundle's declared scope.

### Checklist (1) Manifest / permissions
PASS. `git status` shows zero `manifest.json` changes. No new permissions requested. C-6 permission-minimization gate (CLAUDE.md:371) is unaffected.

### Checklist (2) CSP / eval / new Function / innerHTML / outerHTML
PASS. Doc-only diff; zero code paths touched. The bundle adds gate prose containing example tokens (e.g., `chrome.tabs.move`, `_cachedItemsGen`) but these are illustrative — no executable code introduced.

### Checklist (3) Storage
PASS. Zero new write surfaces. Zero changes to `background/storage/`. The new C-14 gen-counter gate is preventive (forces R2 to enumerate gen-bump predicate up-front) — tightens, not loosens, storage-cache integrity.

### Checklist (4) Message-passing
PASS. Zero changes to `shared/messages.js` or message-handler files. C-2 message-contract gate (CLAUDE.md:362) is unaffected. Cross-Boundary Edits clause (Shared File Governance) is satisfied — no shared/ files in the diff.

### Checklist (5) Network / telemetry / console.log
PASS. Doc-only edit. The privacy posture (no network, no telemetry, no analytics — CLAUDE.md "Privacy & Compliance") is unchanged.

### Checklist (6) Documentation gates wording integrity
All 5 gates close real gaps without introducing escape hatches:

- **B-139 C-13 (Chrome event-feedback completeness)**: PASS. The gate language "MUST enumerate the corresponding event listeners … AND verify each listener is registered + the broadcast/cache-invalidation path is correctly hooked up" directly closes the B-136 class. The cited B-134 R3 missing-`chrome.tabs.onMoved` failure mode (write API ships → in-memory state stale → user-visible behavior broken) is precisely the failure the gate prevents. Verified against `docs/SPRINT_ARCHIVE.md:2489-2495` — the precedent is real and accurately summarized. No escape hatch — "MUST enumerate" + "MUST verify" leave no exemption path.

- **B-140 C-14 (gen-counter content predicate)**: PASS. The gate language "MUST enumerate explicitly 'what changes count as gen-counter-relevant' (i.e., the content predicate that determines a bump)" directly closes the B-134 H-1 over-trip class. Verified against `docs/SPRINT_ARCHIVE.md:2422` — H-1 was "race-guard B over-trip on title/audible/active changes → content-conditional gen bumps via `_openTabsSignature` + `_floatingMembersSignature` setter guards". The precedent matches the gate's stated trigger. Forces R2 to declare the predicate up-front rather than discovering it via R4 over-trip. No escape hatch.

- **B-141 (STOP-and-escalate extension to "R2 spec incorrect")**: PASS. The amended bullet preserves the original B-127 AC-locked-deferral rule verbatim and adds an OR clause for R2-spec-incorrect findings. Both failure modes route to the same handling: stop the build, escalate to [scrum-master], no silent in-code deviation. The added-clause language is symmetrical: "Silently deviating from the R2 spec in code is also forbidden — R2-time discrepancies must surface at R3, not at R4 or R6 As-Built." Verified against `docs/SPRINT_ARCHIVE.md:2423` — the cited B-134 §63.8.2 parentItemId re-anchor M-4 is real and the as-built reconciliation entry confirms the failure mode. No weakening of the original B-127 rule (next bullet, B-141 self-check item 8 below).

- **B-142 (cross-surface diff)**: PASS. The gate language "when the same AC implementation lands on 2+ surfaces … R3 MUST explicitly diff the surface implementations against the R2 spec before claiming complete" closes the B-124 silent-divergence class. Verified against `docs/SPRINT_ARCHIVE.md:2305-2352` — B-124 produced 3 silent newtab/sidepanel divergences caught at R4. Gate closes the surface-duplicate-without-re-spec gap. No escape hatch.

- **B-143 (R2-deferred-to-UAT cheap-fix)**: PASS. The gate language "when R2 explicitly defers a UX-risk to UAT … R3 MUST explicitly assess whether the fix is cheap (≤10 LOC) and document the keep-deferred-or-pre-empt decision with rationale" closes the B-122 §62.9 F-1 deferred-but-cheap-fix class. Verified against `docs/SPRINT_ARCHIVE.md:2316-2353` — B-122 Open-Tabs reject-guard was correctly deferred at R2 but converged at R4 to a 5-line cheap-fix. The 10-LOC threshold is a concrete, falsifiable bar. No escape hatch.

### Checklist (7) MUST language
PASS. Each new gate uses unambiguous MUST language:
- C-13: "R2 MUST enumerate … AND verify"
- C-14: "R2 MUST enumerate explicitly"
- B-141: "they MUST stop the build and escalate"
- B-142: "R3 MUST explicitly diff"
- B-143: "R3 MUST explicitly assess … and document"

No literal-AC reading allows the gates to be silently waived (per DoR Gate 7 / Sprint 19 B-070 / Sprint 20 B-007 precedent). The gates also each cite a blocking precedent, which under the project's existing precedent-citation discipline functions as an irrefutable trigger for the gate.

### Checklist (8) B-141 self-application sanity
PASS. Spot-checked the B-127 original prose preservation:

- **Original B-127 text** ("future enhancement / deferred / follow-up comments inline with the code is forbidden — these are scope changes per CLAUDE.md 'Scope Change Control' and require [scrum-master] handling. The Sprint 38 B-121 R3 silently-deferred newtab close-button affordance (R2 §60.6.2(c) AC6) is the blocking precedent — R4 [code-reviewer] caught it as HIGH H-1, costing a fix-and-reproceed cycle.") is preserved VERBATIM in the amended bullet at `CLAUDE.md:396`. The B-121 precedent now reads "AC-locked-deferral blocking precedent" (qualifier added to disambiguate from the new B-134 R2-spec-incorrect blocking precedent), but the underlying B-121 text is unchanged.

- **Bullet header relabeled** from "STOP-and-escalate on AC-locked deferrals" → "STOP-and-escalate on AC-locked deferrals OR R2-spec-incorrect findings". Both failure modes are now covered by a single bullet, which is correct per the R1 spec's intent.

- The R3 agent's self-application report (B-141 itself was a candidate trigger for the new gate, the R3 agent reported the gate did NOT fire because line numbers matched reality) is consistent with the diff: line 394 → line 396 shift is purely a result of B-139/B-140 inserting two new C-N rows above (which are part of the same bundle, expected, and explicitly noted in the R3 ordering instructions). No silent line-number drift.

### Checklist (9) Pre-existing precedent verification
All cited precedents accurately describe the failure mode the new gate prevents:
- **B-134 H-1** (`docs/SPRINT_ARCHIVE.md:2422`): "race-guard B over-trip on title/audible/active changes" → matches C-14's "content predicate that determines a bump" framing.
- **B-136** (`docs/SPRINT_ARCHIVE.md:2489-2495`): "`chrome.tabs.onMoved` is never registered … `LiveTabIndex.entry.index` never updates" → matches C-13's listener-registration + cache-invalidation gate.
- **B-124** (`docs/SPRINT_ARCHIVE.md:2305-2352` + line 2352 mentions "B-130 candidate: R3 cross-surface diff self-check"): "3 silent newtab/sidepanel divergences" → matches B-142's framing exactly.
- **B-122 §62.9 F-1** (`docs/SPRINT_ARCHIVE.md:2317` and line 2353 — "B-131 candidate: R3 self-check on R2-deferred-to-UAT items (Open-Tabs reject-guard was deferred at R2 but cheap-fix at R3)"): matches B-143's framing exactly.
- **B-134 §63.8.2** (`docs/SPRINT_ARCHIVE.md:2423`): "parentItemId re-anchor deviation from R2 §63.8.2 pseudocode" → matches B-141's R2-spec-incorrect example. The archive even confirms the as-built behavior was correct, which is exactly why the new gate routes to "an explicit scope-change decision OR an R2-amendment routing" rather than treating R2-spec-incorrect as an automatic R3 fault.

### Severity tally
- CRITICAL: 0
- HIGH: 0
- MEDIUM: 0
- LOW: 0

### Recommendation
PROCEED to test-suite regression check (AC3 across all 5 items: `npm test` must remain at the S41 kickoff baseline 1,782/1,782). No security blockers; no policy regressions; no escape hatches. The bundle strengthens R2/R3 process integrity in five distinct ways without weakening any existing rule. Doc-only diff with zero threat surface.

---

## [code-reviewer] — B-139..B-143 R4 (Fast Track bundle)

**Scope**: Fast Track bundled R3 review of 5 XS items, all CLAUDE.md doc edits only. No source code changes. Two regions touched: R2 Correctness Checklist (C-13 + C-14 row insertions) and ROUND 3 Build (B-141 in-place bullet extension + B-142/B-143 new bullets).

### CRITICAL (must fix before R5)

_None_

### HIGH (must fix before R5)

_None_

### MEDIUM (fix if time permits)

_None_

### LOW (defer to future sprint)

_None_

### Notes / observations

- **AC1 — exact-wording fidelity (B-139/B-140/B-141/B-142/B-143)**: PASS. Verbatim match against R1 LOCKED prose for all 5 items. B-139 C-13 row text at `CLAUDE.md:378` matches R1 spec at `sprint-41.md:11`. B-140 C-14 row text at `CLAUDE.md:379` matches `sprint-41.md:24`. B-141 amended bullet at `CLAUDE.md:396` matches `sprint-41.md:37`. B-142 new bullet at `CLAUDE.md:398` matches `sprint-41.md:50`. B-143 new bullet at `CLAUDE.md:399` matches `sprint-41.md:62`. No silent rewording detected.
- **AC2 — limited scope**: PASS. `git diff HEAD CLAUDE.md` shows exactly 2 hunks (`@@ -375,6 +375,8 @@` and `@@ -391,8 +393,10 @@`), bounded to the prescribed regions (R2 Correctness Checklist + ROUND 3 Build). 5 added lines + 1 removed line (the in-place B-141 bullet replacement). Zero drift to other CLAUDE.md sections; no other source files modified.
- **AC3 — no regressions**: PASS. Full test suite green at the S41 kickoff baseline: 1,782/1,782 pass, 0 fail, duration 3,046ms. CLAUDE.md is documentation; no test-suite impact expected and none observed.
- **AC4 — table integrity (B-139/B-140)**: PASS. `grep -nE "^\| C-[0-9]" CLAUDE.md` shows ordering C-1a (365), C-1b (366), C-2 (367), C-3 (368), …, C-12 (377), C-13 (378), C-14 (379) — strictly monotonic, no row drift, table structure (pipe characters, 3-column shape) intact. C-13 immediately follows C-12; C-14 immediately follows C-13; "Fix-scope test-assertion enumeration" subsection follows at line 381 as expected (line shifted from pre-edit 379 → post-edit 381 due to two new rows above).
- **B-141 in-place extension (Bundle check 5)**: PASS. The pre-existing **STOP-and-escalate on AC-locked deferrals** bullet was correctly extended in-place — title renamed to **STOP-and-escalate on AC-locked deferrals OR R2-spec-incorrect findings**, body extended with the new "OR discovers during R3 that the R2 spec is incorrect…" disjunct, both blocking precedents preserved (Sprint 38 B-121 AC-locked-deferral + Sprint 40 B-134 R3 §63.8.2 R2-spec-incorrect). Original semantics retained, new semantics layered correctly. No replacement / no duplication.
- **B-142 + B-143 bullet placement (Bundle check 6)**: PASS. Bullet sequence in ROUND 3 Build verified at lines 396-399: (1) STOP-and-escalate (extended), (2) Cascade-prune sibling-grep (unchanged at line 397), (3) Cross-surface diff self-check (B-142, line 398), (4) R2-deferred-to-UAT cheap-fix self-check (B-143, line 399). Exact prescribed order. Cascade-prune bullet body verbatim unchanged from pre-edit state.
- **B-118 source-citation gate (Bundle check 7)**: PASS. Each new item correctly cites its blocking precedent: C-13 → "Sprint 40 B-134 R3 missing-`chrome.tabs.onMoved` gap" + "v1.34.1 hotfix B-136"; C-14 → "Sprint 40 B-134 H-1 over-trip class"; B-141 dual citation → "Sprint 38 B-121 R3 silently-deferred newtab close-button affordance (R2 §60.6.2(c) AC6)" + "Sprint 40 B-134 R3 §63.8.2 parentItemId re-anchor deviation (R4 [code-reviewer] M-4)"; B-142 → "Sprint 39 B-124 R3" with §61.8 reference; B-143 → "Sprint 39 B-122 R2 §62.9 F-1 (Open-Tabs reject-guard)". All precedents verifiable against archived sprint documentation.
- **B-141 self-application sanity (Bundle check 8)**: PASS. R1 line-anchor predictions matched reality: pre-bundle the STOP-and-escalate bullet sat at `CLAUDE.md:394` and Cascade-prune at `CLAUDE.md:395`, exactly as `sprint-41.md:36-37` cited. Post-bundle they sit at lines 396 and 397 (shifted by +2 from C-13/C-14 row insertions above) — expected shift, no R3 wording adaptation required, the gate did not need to fire. R3 implemented per R1 spec without silent adaptation.
- **Documentation prose quality (Bundle check 9)**: PASS. New rows + bullets follow existing CLAUDE.md style: imperative "MUST" language consistent with C-1a..C-12 prose; em-dash precedent citations consistent with surrounding rows; sentence-length similar to C-10/C-11 (multi-clause precedent paragraphs); paragraph-length within range of existing pre-edit bullets. No tonal/format drift from house style.
- **Test suite execution evidence**: `npm test` tail confirms `tests 1782 / pass 1782 / fail 0 / duration_ms 3046.931583` — clean baseline, no flake, no skipped tests beyond pre-existing baseline.

### Verdict

**APPROVE** — clean Fast Track doc-edit bundle. All 5 items pass AC1-AC5 against their respective R1 LOCKED specs. Zero CRITICAL / HIGH / MEDIUM / LOW findings. Bundle is ready for sprint mark-done.

---

## [solution-architect] — B-137 R2 summary

R2 chapter authored as `docs/design/66-b-137-floating-tab-id-join-key.md` (17 sections, ~1,140 LOC). Root index `docs/SOLUTION_DESIGN.md` TOC extended with §66 entry. R2 LOCKED 2026-04-29.

**R2-VERIFY 1 (cold-start re-bind owner)** — LOCKED to `reassociateFloatingGroups` (`floating-groups.js:107-162`). Rationale: it already runs `pruneResolvedFloatingGroups` (existing write surface) and we extend the writeTransaction's mutator to ALSO patch matched-but-unclaimed records with their resolved `liveTabId`. The other helper `preMarkInheritedFromFloatingGroups` (B-132 §65.4) retains its pure-read-then-mark contract verbatim; T-132-H "writes ZERO storage" pin continues to pass. The third bookkeeping bucket (`staleLiveTabIdRecords: Map<floatingTabId, newLiveTabId>`) is added inside the existing iteration loop — single combined writeTransaction prunes resolved-claimed records AND patches resolved-unclaimed-stale records.

**R2-VERIFY 2 (`moveFloatingTab` parity)** — LOCKED to extend the existing `floatingTabId` preservation block at `floating-groups.js:434-441` to also preserve `liveTabId`. ATTACH path uses caller-supplied `tabId`; MOVE_FLOATING preserves the source record's `liveTabId`. Cascade-grep against all 8 record-write surfaces enumerated in §66.10 — all spread/filter operations preserve `liveTabId` automatically; only the explicit-write sites (appendFloatingGroup, moveFloatingTab target push, pruneResolvedFloatingGroups patch branch) require explicit per-site edits.

**R2-VERIFY 7 (`appendFloatingGroup` signature)** — LOCKED to caller-supplies `liveTabId` via the `entry` object. Rationale: `tab.id` is in scope at the call site `tab-events.js:156-163`, explicit at the call site, avoids redundant lookup. Input validator at `floating-groups.js:178-185` extends to require `liveTabId: number` (silent rejection on missing per existing pattern). Caller update is a single-line addition.

**C-1a + C-1b compliance (full closure)**: KNOWN_VERSION 3→4 (`migration.js:76`); `defaultShape(PARTITION_META).schemaVersion` 3→4 (`shapes.js:105`); new no-op v3→v4 `MIGRATION_STEPS` entry (chain `1→2→3→4`); validator OPTIONAL `liveTabId` finite-number check (mirrors `sortOrder`/`floatingTabId`/`parentItemId` precedent); CHANGELOG SW module-cache flush note flagged for R7 [technical-writer]. Lazy migration strategy (option 2): writes always stamp; reads tolerate v3; cold-start re-bind via `reassociateFloatingGroups` lazy-rewrites legacy records.

**Fix-scope test-assertion enumeration (§66.12)**: 14 test files affected. Class (a) gains-v4-assertion: floating-shape, floating-position, floating-multi, floating-url-fallback, b121-floating-group-render, b132-cold-start-inheritance, b134-tab-drag-reorder, migration-steps. Class (b) updates-v3-pin: floating-shape (arg additions), b134-tab-drag-reorder (mixed), migration-steps (KNOWN_VERSION value bump). Class (c) unaffected: most floating-position/floating-url-fallback tests, floating-session-wipe, floating-ready-gate, b125-claim-jump-fix, most b121/b132/b134 tests, migration-fresh-install, migration-normal.

**R3 build plan**: ~136 production LOC across 5 files (migration.js, shapes.js, floating-groups.js, floating-members.js, tab-events.js); ~280 test LOC + ~15-20 new tests across 8 test files. Build sequence: schema → write → read → cold-start → helper → full suite (§66.13.3).

**Top R3-VERIFY markers** (deferred to R3): URL-guard at tier (a) for stale-`liveTabId` (R2 LOCKS no-guard, R3 may add post-UAT); pruneResolvedFloatingGroups extend-in-place vs. new function (R2 prefers in-place); `_resolveRecordIndexByTabId` linear-scan vs. precomputed cache (R2 LOCKS linear).

**Nothing escalates back to R1.** R1's 7 R2-VERIFY markers all resolved within R2 chapter; the 8 ACs are buildable as locked.
