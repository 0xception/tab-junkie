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

---

## [code-reviewer] — B-137 R4 anchor (Full M-tier)

**Scope**: Full M-tier R3 review of the v3→v4 schema bump + lazy-migration adoption of `liveTabId` as the primary live-tab join key. Audited 5 production files (`background/storage/migration.js`, `background/storage/shapes.js`, `background/tabs/floating-groups.js`, `background/tabs/floating-members.js`, `background/tabs/tab-events.js` — ~242 added lines net) + 9 test files (~608 added lines, +15 new tests + fixture updates). Verified the R2 contract (`docs/design/66-b-137-floating-tab-id-join-key.md` §66.1–§66.17) against R3's actual diff.

### CRITICAL (must fix before R5)

_None_

### HIGH (must fix before R5)

_None_

### MEDIUM (fix if time permits)

_None_

### LOW (defer to future sprint)

_None_

### Notes / observations

- **C-1a + C-1b governance compliance — VERIFIED**: `KNOWN_VERSION` is bumped to `4` at `background/storage/migration.js:89` (R2 cited line 76 — drift of +13 from R3's expanded JSDoc on the constant itself, all four version-history paragraphs intact). `defaultShape(PARTITION_META)` returns `{ schemaVersion: 4, createdAt: Date.now() }` at `background/storage/shapes.js:111` with the v3→v4 history paragraph appended at lines 105-110. New no-op `MIGRATION_STEPS` v3→v4 entry added at `migration.js:137-141` with the C-1a + C-1b governance rationale comment at lines 126-136. Migration chain contiguity preserved (1→2→3→4); F2 contiguity check at `migration.js:157-164` continues to validate the chain. Lazy-migration strategy (option 2) implemented as locked.
- **C-1a SW module-cache flush note**: confirmed deferred to R7 [technical-writer] for `CHANGELOG.md`. R2 §66.2.1 explicitly flagged this as R7 territory; not in R3 scope. No finding.
- **AC1 (schema bump + validator)**: PASS. `assertShape(PARTITION_FLOATING_GROUPS)` validator extension at `shapes.js:266-277` follows the OPTIONAL `'fieldName' in entry`-guarded type check pattern (allow-list direction per C-7). Mirrors the existing `floatingTabId`/`parentItemId`/`itemId`/`sortOrder` precedents at `:248-265`. When present, `liveTabId` MUST be a finite number (`typeof === 'number'` AND `Number.isFinite`); when absent, the record is still valid (legacy v3). Backward-compat verified by `tests/floating-position.test.js:78-101` and the new `tests/migration-steps.test.js:97-145` v2→v4 test (legacy v2 record with neither `sortOrder` nor `liveTabId` continues to validate).
- **AC2 (lazy migration)**: PASS. Writes always stamp `liveTabId` via `appendFloatingGroup` (§66.5.4 implementation at `floating-groups.js:242-253`). Reads tolerate v3 records via the 3-tier fallback in `buildFloatingMembers` (§66.6.1 implementation at `floating-members.js:90-128`) and `_resolveRecordIndexByTabId` (§66.8.1 implementation at `floating-groups.js:322-345`). No bulk rewrite. Confirmed by `tests/migration-steps.test.js:97-145` (legacy v2/v3 records survive intact through `runMigrations`).
- **AC3 (write path stamps `liveTabId`)**: PASS. Input validator extension at `floating-groups.js:236-238` (silent reject on missing/non-finite `liveTabId` — matches the existing reject-pattern at lines 224-231). Caller-supplies pattern at `tab-events.js:163-167` passes `liveTabId: tab.id` from the `chrome.tabs.onCreated` callback parameter (line 125) — `tab.id` is in scope at the call-site. Test pin at `tests/floating-shape.test.js:212-225` (auto-stamp from caller-supplied entry) + `:227-243` (silent reject on missing `liveTabId`) + `:245-271` (silent reject on `NaN` and string).
- **AC4 (read path 3-tier join)**: PASS. `buildFloatingMembers` adopts the documented order:
  - Tier (a) at `floating-members.js:97-106` — `record.liveTabId is finite AND liveIndex.has(record.liveTabId)`. The §66.9.2 Option B "no URL-guard" rationale comment is present at lines 100-104 — reviewers can trace the deferred R3-VERIFY 1 stale-defense reasoning without spelunking the R2 chapter.
  - Tier (b) at `:108-116` — preserved verbatim from pre-B-137 behavior.
  - Tier (c) at `:117-128` — preserved verbatim.
  - H-2 dedup gate at `:135-138` and claimed-tab filter at `:131-133` retained in original positions.
  - Sort path at `:165-180` retained — `sortOrder` is the order key, `liveTabId` is the join key (separate concerns per §66.6.5).
- **AC5 (cold-start lazy rewrite owner = `reassociateFloatingGroups`)**: PASS. R2-VERIFY 1 LOCK honored — `reassociateFloatingGroups` body at `floating-groups.js:115-201` extends the existing classification with a fourth bookkeeping bucket (`staleLiveTabIdRecords: Map<floatingTabId, newLiveTabId>` at line 134). The lazy-rewrite predicate at `:180-188` correctly fires for both legacy v3 records (record.liveTabId === undefined → !== matchedTabId) AND v4 records with stale liveTabId (record.liveTabId !== matchedTabId). Records lacking `floatingTabId` (pre-S38 legacy shape) are explicitly NOT lazy-rewritten — see the storage-identity rationale comment at `:127-132` and the R2 §66.7.4 LOCK; these self-evict via natural turnover. `preMarkInheritedFromFloatingGroups` body (`:711-751`) is unchanged — confirmed via `grep -A40 "export async function preMarkInheritedFromFloatingGroups"` showing the same position+URL fallback as pre-B-137. T-132-H "writes ZERO storage" pin at `tests/b132-cold-start-inheritance.test.js:353-391` continues to pass (verified via the npm test green count 1797/1797).
- **AC6 (`_resolveRecordIndexByTabId` direct-tabId fast-path)**: PASS. Tier (a) at `floating-groups.js:323-331` (linear scan on `arr` for matching `groupId + liveTabId`); tier (b) at `:333-344` (preserved geometry-via-`liveIndex.get(tabId)` lookup). All three call-sites (`:388` reorderFloatingMembers outer parity, `:412` mutator inner-loop, `:488` moveFloatingTab source-resolution) get the fast-path automatically — no caller-side changes needed (R2-VERIFY 4 LOCK honored). The R3-VERIFY 3 LOCK (linear scan retained) is documented at `:309-314` with the perf rationale referenced. The cross-group `liveTabId` preservation block at `:529-533` extends the existing `floatingTabId` preservation pattern at `:516-520` exactly as R2 §66.8.4 prescribed; the new record push at `:547-558` includes `liveTabId: liveTabIdForRecord` per §66.10 invariant. ATTACH path (sourceRecord === null) correctly seeds `liveTabIdForRecord = tabId` (the caller-supplied numeric live tab id is the new record's identity).
- **AC7 (regression guards + new T1 + T2)**: PASS.
  - **T1 sibling-displacement (post-S40 Issue 2)** at `tests/floating-multi.test.js:96-141`. Deliberate position-collision: record A carries `liveTabId: 100` + stale `(windowId 1, tabIndex 0)`; tab 100 has been moved to index 5; tab 101 occupies (windowId 1, tabIndex 0). The assertion `assert.equal(members['g-A'][0].tabId, 100)` would fail without tier (a) (the pre-B-137 position-match would resolve to tab 101). PASS.
  - **T2 race-toast (post-S40 Issue 3)** at `tests/b134-tab-drag-reorder.test.js:1037-1080` (T32). Deliberately corrupts `LiveTabIndex.entry.index` post-write (`live.set(800, { ...live.get(800), index: 99 })`) to simulate the stale-index gap that B-136 closed structurally; verifies `reorderFloatingMembers([801, 800])` returns `true` via tier (a). PASS.
  - **T33 MOVE_FLOATING preserves `liveTabId`** at `tests/b134-tab-drag-reorder.test.js:1083-1121`. Cross-group move; assertion `assert.equal(after[0].liveTabId, 1500)` confirms preservation. PASS.
  - **ATTACH seeds `liveTabId` from caller** at `tests/b134-tab-drag-reorder.test.js:1124-1143`. PASS.
  - **15 new tests + fixture updates total** — matches R2 §66.13.2 estimate (~15-20 new tests).
- **AC8 (out-of-scope fences)**: PASS. `(windowId, tabIndex)` position fallback retained in all four reader sites (`buildFloatingMembers` tier (b), `_resolveRecordIndexByTabId` tier (b), `reassociateFloatingGroups` tier (b), `preMarkInheritedFromFloatingGroups` unchanged); `inheritedTabs` / `claimsMirror` contracts unchanged (no diff to `tab-claims.js`); `MSG_LIST_ITEMS` shape unchanged (no diff to `shared/messages.js` or `floating-members.js:25-39` typedef); zero `manifest.json` changes (verified via `git status`). Newtab/popup parity untouched (no UI surface in the diff).
- **C-1a + C-1b governance compliance — coverage table verified**:
  - `KNOWN_VERSION === 4` at `migration.js:89` (R3 reported line 89, confirmed; R2 cited line 76 — JSDoc expansion above the constant accounts for the +13 drift).
  - `defaultShape(PARTITION_META).schemaVersion === 4` at `shapes.js:111`.
  - New v3→v4 entry in `MIGRATION_STEPS` is no-op governance per C-1b option 2; chain `1→2→3→4` contiguous; F2 sanity check at `migration.js:157-164` would throw if drift introduced.
  - Validator OPTIONAL `liveTabId` finite-number check at `shapes.js:266-277`.
- **Cascade-prune sibling-grep (B-129 / R2 §66.10) — VERIFIED**: ran `grep -nE "arr\\.push|writeTransaction|return arr" background/tabs/floating-groups.js`. Eight write surfaces enumerated by R2 are mapped to actual code as follows:
  - (1) `appendFloatingGroup` mutator — explicit `liveTabId: entry.liveTabId` stamp at `:252` ✓.
  - (2) `saveFloatingGroups` — verbatim writes preserved (caller-controlled shape; no auto-stamp); test pin at `tests/floating-shape.test.js:273-292` ✓.
  - (3) `pruneResolvedFloatingGroups` — extended in-place per R3-VERIFY 2 Option (i) at `:610-646`; patch branch at `:631-634` (`{ ...entry, liveTabId: <new id> }` spread preserves all other fields including `sortOrder` / `floatingTabId` / `parentItemId`) ✓.
  - (4) `pruneFloatingGroupsByParentItemId` — pure filter at `:660-669`; spread/preserve unaffected ✓.
  - (5) `reorderFloatingMembers` mutator — `arr[idx] = { ...arr[idx], sortOrder: newSortOrder }` at `:415` preserves `liveTabId` (and every other field) by spread ✓.
  - (6) `moveFloatingTab` source-removal — `arr.splice(sourceIdx, 1)` at `:494` (record vanishes from source bucket); source `liveTabId` captured into `sourceRecord` BEFORE splice, then propagated to target via `liveTabIdForRecord` at `:529-533` ✓.
  - (7) `moveFloatingTab` target-renumber-and-push — existing-record renumbers at `:541-545` mutate `sortOrder` directly (no spread, no field loss); new-record push at `:547-558` includes `liveTabId: liveTabIdForRecord` ✓.
  - (8) `reassociateFloatingGroups` lazy-rewrite — patches via the extended `pruneResolvedFloatingGroups` at `:195-199` ✓.
  - All 8 sites accounted for; no missed write surface; B-129 R3-VERIFY (cascade-grep §66.10.1) is satisfied.
- **B-141 self-application sanity check**: PASS. R2 cited several specific line numbers (e.g., `appendFloatingGroup` at 177-220, `reassociateFloatingGroups` at 107-162, `_resolveRecordIndexByTabId` at 254-266, `moveFloatingTab` floatingTabId block at 437-441, `preMarkInheritedFromFloatingGroups` at 592-632). The actual post-build line numbers drift downward by 6-80 lines because R3's JSDoc expansion added ~110 LOC of comment to `floating-groups.js` (e.g., the new R2-section-citation comments at `:127-132`, `:184-188`, `:299-314`, `:519-528`). The line-number drift is expected and does NOT trigger the B-141 STOP-and-escalate gate because the structural identifiers (function names, block positions relative to function bodies, identifier patterns) match exactly. R3's reported "all R2-cited line numbers matched reality" is correct in the sense that R3 followed each anchor identifier to the right code; the absolute line numbers shifted but the relative anchors (function bodies, preservation blocks, validator branches) all hit. No silent adaptation.
- **R3-VERIFY 1 (no-URL-guard at tier (a)) — confirmed shipped without guard**: At `floating-members.js:97-106`, the tier (a) match commits the resolved `record.liveTabId` directly into `matchedTabId` with no URL comparison. The §66.9.2 Option B rationale comment at lines 100-104 cites the lifecycle guarantees (chrome.tabs.onRemoved drops stale ids → liveIndex.has returns false → tier (a) misses) + the cold-start lazy rewrite + the H-2 dedup gate as the defense layers. The R3-VERIFY 1 deferred-defense-block from §66.14 is referenced cleanly. No defensive URL-check leaked into the code.
- **R3-VERIFY 3 (linear scan retained per §66.8.2)** — confirmed at `floating-groups.js:323-331` (single `for` loop iterating `arr` with `groupId + liveTabId` predicate). No precomputed `Map<liveTabId, recordIndex>` cache. Bounded N (≤ 5 records per group, ≤ 20 groups → ≤ 100 comparisons typical) makes this acceptable. Documented in the function JSDoc at `:309-314`.
- **R3-VERIFY 4 (B-134 fixture classification)** — confirmed at `tests/b134-tab-drag-reorder.test.js`. T1-T31 existing tests gain `liveTabId: <numeric>` arguments to the `appendFloatingGroup` calls so the input-validator silent-reject doesn't fire (necessary fixture additions per AC3 §66.5.3 — without `liveTabId`, no record is written and the existing assertions would fail). T32 (race-toast) + T33 (MOVE_FLOATING preservation) + ATTACH-seeds-liveTabId are added as net-new tests pinning the v4 contract. The classification matches the R2 §66.12 enumeration exactly.
- **Test quality (R2 §66.12 enumeration coverage)** — VERIFIED:
  - **AC1 schema bump + validator**: `tests/migration-steps.test.js:88-95` (KNOWN_VERSION === 4 pin) + `:97-145` (v2→v4 lazy migration with v2 fixture intact) + `:148-198` (v3→v4 lazy migration with v3 fixture intact). 3 tests.
  - **AC2 lazy migration**: covered by the same migration-steps tests + the `tests/floating-shape.test.js:212-292` v4 write tests + the `tests/floating-position.test.js:78-176` lazy-rewrite tests + the `tests/floating-multi.test.js:142-201` legacy-v3 tier-(b) test.
  - **AC3 write path**: `tests/floating-shape.test.js:212-225` + `:227-243` + `:245-271` + `:273-292`.
  - **AC4 read path 3-tier**: `tests/floating-multi.test.js:96-141` (T1 tier-(a) wins) + `:142-187` (tier-(a) miss → tier-(b) fallback) + `:189-201` (legacy v3 → tier (b) tolerant).
  - **AC5 cold-start lazy rewrite**: `tests/floating-position.test.js:84-119` (rewrite onto v3) + `:122-149` (rewrite stale v4) + `:152-176` (no-op when correct) + `tests/b132-cold-start-inheritance.test.js:393-438` (T-132-H cold-start preservation + AC5 lazy-rewrite).
  - **AC6 helper + MOVE preservation**: `tests/b134-tab-drag-reorder.test.js:1037-1143` (T32 race + T33 preservation + ATTACH).
  - **AC7 T1 + T2**: pinned in `tests/floating-multi.test.js:96-141` (T1) + `tests/b134-tab-drag-reorder.test.js:1037-1080` (T2). Both regression scenarios pinned per R1 LOCK.
  - **AC8 out-of-scope fences**: pinned by absence-of-diff (no manifest, message-shape, or contract changes detectable in the diff).
  - **Coverage matrix**: 8/8 ACs covered; 15+ new tests aligned with the R2 §66.13.2 estimate of 15-20.
- **T-132-H pure-read-pin** (B-132 contract): VERIFIED. `tests/b132-cold-start-inheritance.test.js:353-391` re-pins the "writes ZERO storage" contract pre-mark. The new B-137 lazy-rewrite test at `:393-438` runs `preMarkInheritedFromFloatingGroups` BEFORE `reassociateFloatingGroups` (matching the cold-start sequence), confirming the order-of-operations contract: pre-mark is pure-read; lazy-rewrite happens AFTER pre-mark in the dedicated owner. Both tests pass independently; both pass together.
- **B-121 sibling-displacement regression scenario (post-S40 Issue 2)** — pinned in `tests/floating-multi.test.js:96-141`. The fixture deliberately stages the position collision that triggered the original Issue 2 (record A's `(windowId, tabIndex)` matches a different live tab's position cell). The assertion confirms tier (a) liveTabId direct-match resolves correctly to tab 100 (the record's tab) NOT tab 101 (the unrelated tab). The pre-B-137 codepath cannot pass this test — verifies the regression is structurally closed.
- **Fixture classification — R2-VERIFY 5 honored**: tests adding `liveTabId` to existing fixtures use unique numeric ids per fixture (100, 101, 200, 201, 300, 400, 500, 700, 800, 801, 1500, 1600, 1313, 4242, etc.) — deliberately distinct from one another to prevent accidental cross-test sharing. Tests targeting legacy fallback paths (`tests/floating-position.test.js`, `tests/floating-url-fallback.test.js`, most `tests/floating-multi.test.js` cases) explicitly omit `liveTabId` to keep exercising the v3 fallback. Mixed v3+v4 scenarios distinguishable.
- **Quality bar (CLAUDE.md "Frontend Standards" + R2 §66.13.4)**: VERIFIED. No TODOs / FIXMEs / commented-out blocks / `console.log` in the diff (confirmed via `git diff release/v2 HEAD -- background/ | grep -E "^\\+" | grep -iE "todo|fixme|console\\.log"` returns empty). All new JSDoc comments cite the §66.X chapter section they implement (e.g., `:251 "B-137 §66.5.4 — primary live-session join key (schema v4)"`, `:556 "B-137 §66.8.4 — preserve/seed liveTabId on the new record."`, `:266 "B-137 §66.4 — OPTIONAL liveTabId field (schema v4)"`). Source-citation discipline (B-118) maintained throughout the new code.
- **Test suite execution evidence**: `npm test` confirms 1,797/1,797 passing, 0 failures, duration 3,128ms. Baseline was 1,782/1,782 at S41 kickoff; the +15 net is consistent with the new test count documented above. Zero regressions.
- **DRY observation (informational, not a finding)**: tier (a) direct-match and tier (b) position-match share no significant code structure (tier (a) is a `liveIndex.has(record.liveTabId)` early-return; tier (b) is an iteration over `liveIndex` entries). `_resolveRecordIndexByTabId` and `buildFloatingMembers`'s 3-tier resolver have parallel-but-not-identical shapes (the former resolves an array index, the latter resolves a tabId; the position-match predicate differs subtly). Refactoring into a shared helper would lose the contextual differences and introduce coupling — current duplication is healthy and intentional. No finding.
- **Performance observation (informational)**: tier (a) match is O(1) Map.get for `buildFloatingMembers` (single `liveIndex.has + liveIndex.get` per record). For `_resolveRecordIndexByTabId` it is O(N_records) linear scan (matches R3-VERIFY 3 LOCK rationale at §66.8.2). Cold-start lazy rewrite adds storage writes only when records are matched-unclaimed AND have a missing/stale `liveTabId`; the writeTransaction is still atomic per `pruneResolvedFloatingGroups` extension at `:610-646` (single mutator, single set call).

### Verdict

**APPROVE** — clean Full M-tier R3 build of the highest-blast-radius schema migration since v1.32.0 (B-121). All 8 ACs implemented per the R2 LOCK; all 7 R2-VERIFY markers honored; all 5 R3-VERIFY markers respected; cascade-prune sibling-grep (8 write surfaces) verified; B-141 self-application gate did not need to fire (line-number drifts are pure JSDoc-expansion); zero TODOs / commented-out blocks / console.log; zero regressions in the test suite (1,797/1,797 green); coverage of all post-S40 R0 spike regression scenarios pinned. Ready for [security-reviewer] + [qa-reviewer] parallel completion at R4 and [test-engineer] at R5.

---

## [security-reviewer] — B-137 R4 anchor (Full M-tier)

**Verdict**: PROCEED — 0 CRITICAL / 0 HIGH / 0 MEDIUM / 1 LOW (advisory). Schema v3→v4 migration is governance-clean and atomicity-clean. Lazy-migration semantics preserved verbatim; cold-start re-bind extends an existing write transaction without introducing a new write surface; allow-list validator direction (C-7) maintained; no new manifest permissions, no new message contracts, no XSS-relevant interpolation, no network/telemetry/console additions. Two storage-write race classes considered and resolved acceptably (T-1, T-2 below). The single LOW is an advisory observation about pre-S38 v1 records' lazy-rewrite carve-out — no fix required.

**Scope of review**: B-137 R3 build commit `ab82845` against `release/v2`. Files touched (production): `background/storage/migration.js` (+31/-1), `background/storage/shapes.js` (+26/-7), `background/tabs/floating-groups.js` (+~140/-~25), `background/tabs/floating-members.js` (+25/-6), `background/tabs/tab-events.js` (+5/-0). Tests: `tests/migration-steps.test.js`, `tests/floating-shape.test.js`, `tests/floating-position.test.js`, `tests/floating-multi.test.js`, `tests/b121-floating-group-render.test.js`, `tests/b132-cold-start-inheritance.test.js`, `tests/b134-tab-drag-reorder.test.js`, `tests/b013-opener-chain.test.js`, `tests/b018-persistence.test.js`. Full-suite check: 1797/1797 PASS, duration 3251 ms (clean baseline).

### Generic threat surface

#### (1) Manifest / permissions
PASS. `git diff release/v2 HEAD -- manifest.json` is empty. No new permissions, no host-permission additions, no `chrome_url_overrides` mutation. C-6 permission-minimization gate satisfied. AC8(f) ("No new `manifest.json` permissions") confirmed.

#### (2) CSP / eval / new Function / innerHTML / outerHTML
PASS. `git diff release/v2 HEAD -- background/ | grep -E "console\.|innerHTML|outerHTML|eval\(|new Function|XMLHttpRequest|fetch\("` returns no matches in the diff. The change is purely SW-side storage-layer logic — no DOM interpolation surface introduced. CSP unaffected.

#### (3) `textContent` vs `innerHTML`
PASS — N/A. Zero renderer (`sidepanel/`, `newtab/`, `popup/`) edits in this sprint's source diff. The `FloatingMember` descriptor shape is unchanged per R2-VERIFY 3 LOCK (§66.6.4), so renderer string-interpolation paths consume identical input. `liveTabId` is a numeric type (validator enforces `Number.isFinite`) and never reaches a renderer surface — it is a SW-internal join key.

#### (4) Network / telemetry / console.log
PASS. No new network code, no new `console.log` debug noise in production paths. The pre-existing `console.warn` calls in `migration.js` (legacy-key cleanup) and `tab-events.js` (opener-chain inheritance failure) are preserved verbatim — defensive logging at error-path boundaries is appropriate and PII-free (no URLs or titles logged). Privacy posture unchanged.

### Storage / schema

#### (5a) C-1a governance — schema bump v3→v4
PASS. `KNOWN_VERSION` bumped 3→4 at `background/storage/migration.js:89` (verified). `defaultShape(PARTITION_META)` returns `{ schemaVersion: 4, ... }` at `background/storage/shapes.js:111` (hardcoded literal preserved per the storage-layer-independence comment). New no-op v3→v4 `MIGRATION_STEPS` entry appended at `background/storage/migration.js:137-141` (chain `1→2→3→4` contiguous, F2 contiguity check at lines 156-164 still passes). C-1a governance is fully closed at the code level.

**SW module-cache flush note (R7 deferral)**: §66.2.1 of the chapter explicitly flags the `CHANGELOG.md` flush note for R7 [technical-writer] sprint-close work. This is the correct deferral target per Sprint 30 B-092 / Sprint 38 B-121 / Sprint 40 B-134 precedent. Flagged here for [scrum-master] to verify the R7 work item is not silently dropped at sprint close — see "Recommendations" below.

#### (5b) C-1b lazy-migration semantics
PASS. The lazy strategy is implemented correctly across three independent code paths:

- **Read tolerance** (`shapes.js:273-277`): the validator's `'liveTabId' in entry` guard does NOT reject v3 records lacking the field. Verified by `tests/floating-position.test.js`, `tests/floating-multi.test.js`, `tests/floating-session-wipe.test.js`, `tests/floating-ready-gate.test.js` continuing to pass with v3 fixtures.
- **Write stamping** (`floating-groups.js:236-238`): `appendFloatingGroup` REQUIRES `liveTabId` on the input via the silent-rejection input-validator pattern. Production caller at `tab-events.js:167` passes `liveTabId: tab.id`. Test pin at `tests/floating-shape.test.js:216-231` confirms `typeof records[0].liveTabId === 'number' && Number.isFinite(...)` post-write.
- **Cold-start lazy rewrite** (`floating-groups.js:115-201`): `reassociateFloatingGroups` extends its existing `pruneResolvedFloatingGroups` write transaction with the new `staleLiveTabIdRecords: Map<floatingTabId, newLiveTabId>` patch bucket. The lazy-rewrite test pin at `tests/floating-position.test.js:85-117` verifies the rewrite materializes after the cold-start cycle.

The three paths converge correctly: legacy v3 records render via tier (b)/(c) fallback, get rewritten on next cold-start, then render via tier (a) on subsequent dispatches. Self-evict on tab close via the existing `pruneResolvedFloatingGroups` claimed-record branch.

#### (6) Validator integrity (allow-list direction, C-7)
PASS. The new validator branch at `shapes.js:273-277` follows the established OPTIONAL `'fieldName' in entry`-guarded pattern verbatim:

```js
if ('liveTabId' in entry) {
  if (typeof entry.liveTabId !== 'number' || !Number.isFinite(entry.liveTabId)) {
    throw new StorageError(ERR_CORRUPT_DATA, ...);
  }
}
```

Allow-list discipline (C-7) maintained — no deny-list introduction. The type guard correctly rejects: strings (`typeof !== 'number'` rejects), `NaN` (`Number.isFinite(NaN) === false` rejects), `Infinity`/`-Infinity` (rejected by `Number.isFinite`), arrays/objects/booleans (`typeof` rejects), `null`/`undefined` (the `'in' entry` guard makes them absent — accepted as legacy). Negative finite numbers are accepted; this matches the existing validator policy for `windowId`/`tabIndex`/`sortOrder` (any finite number, no signedness check). Chrome's documented `tabs.Tab.id` contract is positive integer or `chrome.tabs.TAB_ID_NONE` (`-1`); negatives in storage would not match a real live tab and would fall through to tier (b)/(c). No exploit surface — invalid stored data merely fails the join, never escalates.

#### (7) Atomic write surfaces (B-129 cascade-prune sibling-grep)
PASS. All eight write surfaces enumerated in chapter §66.10 audited against the v3→v4 `liveTabId` invariant:

| # | Site | `liveTabId` handling | Verdict |
|---|------|---------------------|---------|
| 1 | `appendFloatingGroup` (`floating-groups.js:223-276`) | Stamped from `entry.liveTabId` (caller-supplied; required) | PASS |
| 2 | `saveFloatingGroups` (`:68-84`) | Verbatim — caller responsible for shape (legacy migration path) | PASS — preserved by spread |
| 3 | `pruneResolvedFloatingGroups` (`:610-646`) | Filter+patch via `arr.reduce`; `staleLiveTabIdRecords.has(...)` patch branch + `arr.push({ ...entry, liveTabId: ... })` spread | PASS |
| 4 | `pruneFloatingGroupsByParentItemId` (`:660-669`) | `arr.filter(...)` — `liveTabId` preserved by reference | PASS |
| 5 | `reorderFloatingMembers` mutator (`:411-417`) | `arr[idx] = { ...arr[idx], sortOrder: newSortOrder }` — spread preserves `liveTabId` | PASS |
| 6 | `moveFloatingTab` source removal (`:494`) | `arr.splice(sourceIdx, 1)` removes record; `liveTabId` captured into `sourceRecord` BEFORE splice (line 493) | PASS |
| 7 | `moveFloatingTab` target push (`:547-558`) | New record explicitly stamps `liveTabId: liveTabIdForRecord` (line 557) — preserved from source for MOVE_FLOATING, caller-arg for ATTACH | PASS |
| 8 | `reassociateFloatingGroups` lazy-rewrite (`:115-201` → calls `pruneResolvedFloatingGroups`) | Patch via the extended `pruneResolvedFloatingGroups` (site #3 above) | PASS |

The B-121 Sprint 38 cascade-prune-sibling-grep precedent (`MSG_DELETE_ITEM` → `MSG_BULK_DELETE_ITEMS` + `MSG_DELETE_GROUP`) is satisfied here by inheritance: all three handlers route through `pruneFloatingGroupsByParentItemId` (site #4 — `storage-handlers.js:233, 268, 305`), which uses `arr.filter(...)` and preserves `liveTabId` by reference. No new cascade-prune entry-point required.

The atomic invariant from §66.10.2 (every write to `tj:floatingGroups` post-S41 either stamps fresh, preserves from source, or is a verbatim test-fixture write via `saveFloatingGroups`) holds across all eight sites.

#### (8) Cold-start re-bind atomicity (R2 §66.7)
PASS. `reassociateFloatingGroups` extends the existing `pruneResolvedFloatingGroups` writeTransaction at `floating-groups.js:618-645` rather than introducing a new sequenced write. The single mutator handles three branches in `arr.reduce`:

1. `resolvedFloatingTabIds.has(entry.floatingTabId)` → drop (existing prune)
2. `staleLiveTabIdRecords.has(entry.floatingTabId)` → push patched record with new `liveTabId` (NEW B-137)
3. Legacy fallback `legacyResolvedParentItemIds.has(parentId)` for `floatingTabId`-less records → drop

All three branches operate inside one `writeTransaction(...)` — the storage-layer atomicity invariant (B-001b: per-partition single-writer) is preserved. No partial-state-on-failure window: if the `chrome.storage.local.set` fails, neither the prune nor the patch lands; control returns to the caller and `schemaVersion` (or any other state) is unaffected. The collection iteration's `else if` branch at `:180-188` ensures a record is added to AT MOST one of `resolvedFloatingTabIds` / `legacyResolvedParentItemIds` / `staleLiveTabIdRecords` — no double-bucket race.

**T-132-H verification (B-132 §65.4 "preMarkInheritedFromFloatingGroups writes ZERO storage" pin)**: PASS. `git diff release/v2 HEAD -- background/tabs/floating-groups.js` shows `preMarkInheritedFromFloatingGroups` body (`:711-751`) unchanged at the production-code level. The function still does pure-read-then-mark with no `writeTransaction` call, no `chrome.storage.*` write, no mutation outside the module-scoped `inheritedTabs` Set in `tab-claims.js`. R2-VERIFY 1 LOCK preserves the contract verbatim. The T-132-H test pin continues to pass in the full-suite run.

### Race conditions

#### (9) Stale `liveTabId` race (R2 §66.9)
PASS — accepted v1 behavior with documented self-correction window. R3-VERIFY 1 LOCKED Option B (no URL-guard at tier (a)) per §66.9.2.

**Threat model considered**:
- Within a single SW lifetime, `chrome.tabs.onRemoved` (`tab-events.js:213-229`) calls `removeTabEntry(tabId)` immediately on tab close → `liveIndex.has(staleId)` returns false → tier (a) misses → tier (b)/(c) fallback fires. Window of mis-join ≤ event-loop tick.
- Across SW restart: `reassociateFloatingGroups` runs on cold-start BEFORE the first `MSG_LIST_ITEMS` dispatch (per B-132 §65.3 sequencing) — lazy-rewrite of stale `liveTabId` happens in tier (b)/(c) match path; subsequent reads use tier (a) with the corrected id. The tier-(a) check at `floating-members.js:98-99` and `floating-groups.js:144-147` always re-validates `liveIndex.has(record.liveTabId)` before trusting the stored value — the stored value is never blindly used.
- Chrome documented behavior: tabIds are NOT recycled within a single browser session (verified at B-132 §64.4 H-4 spike). Across browser restart they may be reassigned, but `chrome.tabs.onRemoved` fires before the SW shutdown (typical case) → the stale id is dropped from `liveIndex`. The narrow uncovered window (browser killed mid-tick before `onRemoved` fires) is the documented self-correction transient.

**Self-correction window** (§66.9.3): the next `chrome.tabs.onRemoved`/`onActivated`/`onMoved` event fires `broadcast(SCOPE.LIVE_STATE, ...)` → sidepanel re-issues `MSG_LIST_ITEMS` → `buildFloatingMembers` re-runs → tier (a) misses (now-stale id is no longer in `liveIndex`) → tier (b)/(c) fallback resolves → cold-start re-bind on next SW boot rewrites the corrected id. The H-2 dedup gate at `floating-members.js:135-138` prevents two records from ever rendering against the same tabId in a single dispatch — the visible artifact, if any, is a single-frame title flicker, never a persistent wrong-tab association.

**Existing `chrome.tabs.onRemoved` cleanup post-B-137**: confirmed unchanged at `tab-events.js:213-229`. The handler still calls `removeTabEntry(tabId)` (drops from `liveIndex`), `pruneInherited(tabId)` (drops `inheritedTabs` mark), `releaseClaimByTab(tabId)` (releases claim). B-137 does NOT add a `chrome.tabs.onRemoved`-driven prune of `tj:floatingGroups`; lazy cleanup via the existing `reassociateFloatingGroups` cold-start path is the documented strategy. This is correct: eager `tj:floatingGroups` pruning on every tab close would multiply storage writes; the records persist by design (see B-018 AC9 — record may be re-resolved on a future restart).

#### (10) Tab-close-during-rebind race (R2 §66.15 case 6)
PASS. `reassociateFloatingGroups` reads `liveTabIndex` snapshot reference at `floating-groups.js:116`. Mid-iteration, a `chrome.tabs.onRemoved` could fire and call `removeTabEntry(...)` on the underlying Map. JavaScript Map semantics: the iteration over `liveTabIndex` entries inside the resolver is forward-only (`for...of`); a delete during iteration on an entry already iterated past has no effect; a delete on an entry NOT yet visited correctly skips that entry on subsequent iterations.

**Behavioral consequence**: a record whose live tab was closed mid-resolver-loop falls through to "no match" (tier (b)/(c) miss because the tab was deleted from the Map mid-iteration) → record stays in place per B-018 AC9 → reconciled on next cold-start. No partial-state corruption; the writeTransaction at `:618-645` is atomic.

The mutation snapshot is captured by JavaScript engine's iterator semantics (Map iterators reflect live deletes); subsequent records may see a smaller liveIndex but the per-record correctness invariant holds. The R5 test-engineer should consider a UAT case for "close a floating-group-associated tab during browser restart cold-start window" to validate empirically (UAT case suggested below).

### Cross-cutting

#### (11) `inheritedTabs` lifecycle (B-125)
PASS — N/A delta. B-137 does NOT modify `inheritedTabs` Set semantics. The `markInherited` call at `tab-events.js:181` is unchanged; `pruneInherited` calls at `tab-events.js:217, 291` are unchanged. `preMarkInheritedFromFloatingGroups` body unchanged. Per AC8(c) ("No change to `inheritedTabs` Set semantics or `claimsMirror` reconciliation contract"), this is correct.

#### (12) `claimsMirror` contract
PASS — N/A delta. `reconcileClaims` (`tab-claims.js`) untouched. The `claimedTabIds` Set used inside `buildFloatingMembers` (`floating-members.js:64-65`) and `reassociateFloatingGroups` (`floating-groups.js:119`) consumes the existing `getClaimsMirror()` API verbatim. No write to `claimsMirror` from B-137 paths.

#### (13) Drift partition
PASS — N/A delta. `tj:drift` partition unchanged. Drift-detection logic in `background/tabs/drift.js` not modified.

#### (14) Message contracts
PASS. `git diff release/v2 HEAD -- shared/messages.js` is empty. No new `MSG_*` types. `MSG_LIST_ITEMS` response shape (`{ items, liveStates, driftRecords, openTabs, windowMap, floatingMembers }`) unchanged per R2-VERIFY 3 LOCK. `FloatingMember` descriptor unchanged. `MSG_REORDER_FLOATING_MEMBERS` and `MSG_MOVE_FLOATING_TAB` payloads unchanged. C-2 message-contract gate satisfied.

#### (15) Defensive payload validation
PASS — N/A. No new message handlers; no new payload-receiving boundary.

### XSS-specific

#### (16) No new user-string interpolation
PASS. `git diff release/v2 HEAD -- background/ | grep -E "innerHTML|outerHTML|insertAdjacentHTML|document\.write"` returns zero matches. B-137 is purely a storage-schema + join-key change; no DOM-side or renderer-side edits. XSS surface is zero.

### Severity tally

- **CRITICAL**: 0
- **HIGH**: 0
- **MEDIUM**: 0
- **LOW**: 1 (advisory)

### LOW (advisory)

#### L-1 — pre-S38 v1 records (no `floatingTabId`) excluded from lazy-rewrite, by design

**File**: `background/tabs/floating-groups.js:180-188`

**Observation**: The lazy-rewrite collection branch is gated on `typeof record.floatingTabId === 'string' && record.floatingTabId.length > 0`. Pre-S38 legacy v1 records (no `floatingTabId`, no `liveTabId`) that match an unclaimed live tab will NOT be lazy-rewritten — they are left in place indefinitely. The chapter explicitly documents this at §66.7.4 ("records lacking floatingTabId — pre-S38 legacy shape — are not lazy-rewritten; they self-evict via natural turnover"), and the comment at `floating-groups.js:128-134` reproduces the rationale.

**Risk**: NONE. v1 records are now ≥ 3 sprints old; cumulative natural turnover (tab close cycles) has likely emptied this cohort already. The records continue to render correctly via tier (b)/(c) fallback in `buildFloatingMembers`. No exploit surface; no data integrity risk.

**Recommendation**: NO ACTION REQUIRED. The design choice is documented and correct. Filed as LOW advisory only so a future engineer reading this code does not mistake the omission for a bug.

### Recommendations (non-blocking)

1. **R7 [technical-writer] CHANGELOG SW module-cache flush note** — flagged in C-1a (§66.2.1 of the chapter). Schema-version bump requires a `chrome://extensions` toggle OFF→ON cycle after update for the SW module cache to flush; without it, the new tier-(a) join code may not activate until the next browser restart. Sprint 30 B-092 and Sprint 38 B-121 are precedents — both required this exact note. [scrum-master] should verify the R7 work item is on the sprint-close checklist.

2. **R5 [test-engineer] UAT case suggestion (T-1, optional)** — close a floating-group-associated tab during browser restart cold-start window. Verify no record corruption, no orphan render, no broadcast loop. The integration-test `chrome-mock.js` cannot reproduce SW lifecycle teardown; this is a UAT-only signal class (parallel to B-022 popup-lifecycle race).

3. **R5 [test-engineer] UAT case suggestion (T-2, optional)** — rapidly close-and-reopen a tab whose `tj:floatingGroups` record has a `liveTabId`. Verify the next render does not show the wrong tab's title (the §66.9.3 self-correction window). If this surfaces a single-frame visual glitch, R3-VERIFY 1 unlocks the URL-guard option (5-line addition to `floating-members.js` tier (a)) — currently LOCKED no-guard per §66.9.2 Option B.

4. **B-138 follow-up cleanup item** — once telemetry / passage of time confirms zero v3 records remain in the wild, the `(windowId, tabIndex)` tier (b) and URL tier (c) fallback paths can be removed from all four reader sites. Filed at AC8(a) and §66.1 "Out of scope". This is the natural closure of the lazy-migration arc; not in scope for B-137 R5.

### Verdict

**PROCEED** to R5 [test-engineer]. Schema v3→v4 governance is fully closed at the code level; lazy-migration semantics are correctly implemented across read / write / cold-start paths; allow-list validator discipline maintained; eight write surfaces audited for `liveTabId` invariant compliance; two race classes considered and resolved acceptably (with documented self-correction); no new permissions / message contracts / network surface / XSS vectors. The build is high-quality and ships ready.

---

## [qa-reviewer] — B-137 R4 anchor (Full M-tier)

**Verdict**: PROCEED — 0 CRITICAL / 0 HIGH / 1 MEDIUM / 4 LOW. R3 build cleanly implements the R2-locked 3-tier join + lazy-rewrite; B-131 / Issue 2 / Issue 3 root cause is structurally eliminated for v4 records; full automated suite green at 1,797/1,797 (+15 from S41 kickoff baseline). The single MEDIUM is a UAT-plan coverage gap (no opener-chain spawn-from-bookmark T1 variant); LOWs are documentation/coverage gaps that do not block R5 entry.

**Scope of review**: B-137 R3 build commit `ab82845`. Production diff: `background/storage/migration.js` (KNOWN_VERSION 3→4 + v3→v4 no-op step), `background/storage/shapes.js` (defaultShape v4 + OPTIONAL liveTabId validator), `background/tabs/floating-groups.js` (appendFloatingGroup stamp, _resolveRecordIndexByTabId 2-tier, moveFloatingTab preservation, reassociateFloatingGroups lazy-rewrite, pruneResolvedFloatingGroups patch branch), `background/tabs/floating-members.js` (3-tier join), `background/tabs/tab-events.js` (caller passes tab.id). Test diff: 9 test files (4 new in floating-shape, 3 new in floating-position, 3 new in floating-multi including T1 sibling-displacement, 1 new in b132-cold-start-inheritance, 3 new in b134-tab-drag-reorder including T32 race-toast + T33 MOVE_FLOATING preservation + T34 ATTACH-seed, migration-steps KNOWN_VERSION + v3→v4, plus 3 fixture updates in b013/b018/b121).

### CRITICAL (must fix before R5)
_None_

### HIGH (must fix before R5)
_None_

### MEDIUM (fix if time permits)

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| M-1 | `tests/floating-multi.test.js:97-145` (T1 sibling-displacement test) | The T1 test fixture exercises **position collision via tab-move** (a stale-position scenario where tab 100 has been moved so tab 101 occupies tab 100's old position). However, B-131's documented user-visible repro is specifically "**open a new tab from a bookmark in a group → the new floating row shows the new tab's title, NOT a sibling's title**" — the opener-chain spawn-from-bookmark workflow. T1 verifies the structural fix (tier (a) wins over tier (b)) but does NOT walk the spawn-from-bookmark path through `tab-events.js:140-188` (`chrome.tabs.onCreated` → `walkOpenerChain` → `appendFloatingGroup`) end-to-end. R5 [test-engineer] UAT plan SHOULD enumerate the opener-chain B-131 reproduction explicitly so the structural fix is verified against the actual user flow that filed B-131. | R5 UAT plan: add a UAT test case that loads a bookmark in a group whose parent has multiple children, opens it (so a child tab is spawned via opener-chain), and verifies the new floating row title matches the new tab's title even when one of the siblings' stored position would otherwise collide with the new tab's position. Structural fix is sound; UAT just needs to walk the user-visible flow that filed the bug. |

### LOW (defer to future sprint)

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| L-1 | `background/tabs/floating-groups.js:322-345` (`_resolveRecordIndexByTabId`) | Tier (a) does NOT verify `liveIndex.has(tabId)` before returning — it relies on the caller having already filtered on liveness. In practice every production caller (`reorderFloatingMembers` outer + inner-loop, `moveFloatingTab` source resolution) passes a `tabId` that has been verified alive (drop-handler guard A, `chrome.tabs.get` pre-flight). The helper is `_`-prefixed (file-internal) but the caller-contract is implicit; if a future caller passes a closed tabId, tier (a) could match a record whose `liveTabId` was never updated post-close. **Self-correcting** at next cold-start, but worth a JSDoc note clarifying the caller contract. | Add JSDoc note: "Caller MUST verify the supplied `tabId` is alive before invoking. Tier (a) trusts the caller; tier (b) `liveIndex.get(tabId)` already short-circuits on `!live`." Defer to follow-up — not a behavioral defect today. |
| L-2 | `docs/design/66-b-137-floating-tab-id-join-key.md` §66.15 (C-9 closure) — case 10 explicit pin | The C-9 enumeration lists 10 cases. R3 covers cases 1-6 directly via tests (empty bucket, all-v3, v4 happy path with stale-position T1, mixed transitional via tier-(a)+tier-(b), stale-`liveTabId`, lazy-rewrite). Cases 7 (storage write-conflict during cold-start), 8 (parent deleted), 9 (claimed-tab skip) are implicitly covered (atomic writeTransaction guarantee + preserved code at `floating-members.js:87` + `:133`). Case 10 (H-2 dedup with mixed v3 record + v4 record both resolving to the same tab) has no explicit pin; T1 exercises tier-(a)-wins, but the H-2 dedup ordering is implicit. | Optional R5 test addition: pin case 10 explicitly in `tests/floating-multi.test.js` (a v3 + v4 record that both resolve to the same tabId — confirm H-2 dedup keeps only one descriptor). Defer to follow-up. R6 As-Built can also note coverage; not a regression risk. |
| L-3 | `tests/migration-fresh-install.test.js`, `tests/migration-normal.test.js` | Tests read `KNOWN_VERSION` constant and assert `meta.schemaVersion === KNOWN_VERSION` (per §66.12 fix-scope class (c) "value implicitly bumped"). Verified — both pass at 1,797/1,797. However, neither test seeds a fresh-install scenario that asserts `defaultShape(PARTITION_META).schemaVersion === 4` against a literal — the implicit-bump-via-constant means a future drift in `defaultShape` (e.g., manual edit reverting to literal 3) would NOT be caught by these tests, only by the `KNOWN_VERSION` literal assertion in `migration-steps.test.js`. | Optional: add a test in `tests/migration-fresh-install.test.js` that pins `defaultShape(PARTITION_META).schemaVersion === 4` (literal). Hardens C-1a paired-bump invariant. Defer to follow-up. |
| L-4 | `background/tabs/floating-members.js:97-106` (tier (a) §66.9.2 Option B no URL-guard) | The R2 LOCK chose Option B (no URL-guard at tier (a)). The §66.9.3 self-correcting transient claim is sound for SW-internal lifecycle (onRemoved → removeTabEntry → liveIndex.has returns false). However, there's a behavior-question UAT corner: when a user navigates a bound floating tab to a different URL, `record.url` (write-time URL) and `liveEntry.url` (current URL) diverge — the descriptor renders with the new URL/title (which IS correct behavior — tab identity preserved via `liveTabId`). No misjoin, just a perception question worth UAT. | R5 UAT plan: add a UAT test case that navigates a bound floating tab to a different URL — the floating row should reflect the new URL/title (tab identity preserved via `liveTabId`). Correct behavior, but UAT should confirm user perception matches. |

### Notes / observations

- **Bug-fix verification (Issue 2 / B-131 root cause)**: PASS structurally. The 3-tier join in `floating-members.js:90-128` puts `record.liveTabId` direct-match first; tier (b) position-match is unreachable for v4 records when their `liveTabId` is in `liveIndex`. T1 (`tests/floating-multi.test.js:97-145`) deliberately constructs a stale-position fixture that would have misrouted pre-B-137; the test asserts `members['g-A'][0].tabId === 100` and `title === 'CHILD-A'` (no displacement). The cross-record contamination root cause is structurally impossible for v4 records. M-1 above clarifies the UAT-plan implication.
- **Bug-fix verification (Issue 3 / floating reorder race toast)**: PASS structurally. T32 (`tests/b134-tab-drag-reorder.test.js:1027-1071`) deliberately corrupts `LiveTabIndex.entry.index` post-write (simulates the post-S40 stale-index scenario that B-136 closed), then issues `reorderFloatingMembers` and asserts `ok === true` — tier (a) `_resolveRecordIndexByTabId` direct-match resolves via `liveTabId` without needing `LiveTabIndex.entry.index` parity. This is the exact defense the R0 spike prescribed.
- **Empty-state coverage (C-9 case 1 — empty `tj:floatingGroups`)**: PASS verbatim. `floating-members.js:59` short-circuits at `records.length === 0`; `floating-groups.js:117` short-circuits in `reassociateFloatingGroups`. No new B-137 logic when bucket is empty. No regression.
- **Empty-state coverage (C-9 case 2 — all-records-v3)**: PASS via `tests/floating-multi.test.js` "legacy v3 record (no liveTabId) resolves via tier (b)". Tier (a) skipped via the `typeof record.liveTabId === 'number'` guard; tier (b) renders correctly. Pin is explicit.
- **Empty-state coverage (C-9 case 3 — all-records-v4)**: PASS via T1 and existing b134/b132 lazy-rewrite tests post-cold-start. Tier (a) hits for every record; tier (b)/(c) never fires.
- **Empty-state coverage (C-9 case 4 — mixed v3+v4)**: PASS via natural composition (T1 v4-only + legacy v3 fallback test cover both paths). H-2 dedup gate at `floating-members.js:135-138` unchanged. **Coverage gap (LOW L-2)**: no explicit test pins a v3 + v4 record both resolving to the same tab and dedup keeping the v4. Acceptable for v1.
- **Empty-state coverage (C-9 case 5 — stale `liveTabId`)**: PASS via `tests/floating-multi.test.js` "tier (a) skipped when record.liveTabId is not in liveIndex". The `liveIndex.has(record.liveTabId)` guard correctly rejects stale ids; tier (b) recovers. Self-correcting via `reassociateFloatingGroups` lazy-rewrite on next cold-start (verified `tests/floating-position.test.js` "rewrites stale liveTabId on v4 records when tier (b) resolves to a different tab").
- **Migration edge case (fresh install at v4)**: PASS. `defaultShape(PARTITION_META)` returns `{ schemaVersion: 4, ... }` (`shapes.js:111`). Existing `migration-fresh-install.test.js` reads `KNOWN_VERSION` and asserts `meta.schemaVersion === KNOWN_VERSION` — implicitly bumped via the constant change. Test passes. (LOW L-3 hardening note.)
- **Migration edge case (update from v3 to v4)**: PASS. New test `tests/migration-steps.test.js` "B-137 §66.2.2: v3 → v4 lazy migration" seeds a v3 record + meta, runs `runMigrations`, asserts `schemaVersion === 4` AND legacy record's data is unchanged (`liveTabId === undefined`). C-1b lazy migration verified.
- **Migration edge case (browser-restart during cold-start)**: PASS. `reassociateFloatingGroups` reads partition snapshot once, iterates, then commits via single `pruneResolvedFloatingGroups` writeTransaction. If SW killed mid-iteration: nothing committed (no partial state); next cold-start re-runs from the top. B-001b atomic writeTransaction contract holds.
- **Migration edge case (tab-close during cold-start re-bind)**: PASS. Mid-loop `liveTabIndex.has(...)` reads against the captured Map reference; `removeTabEntry(staleId)` mutates the Map but does not invalidate the loop. Records that mismatch fall through to position+URL fallback; if BOTH fail, record left in place per AC9. WriteTransaction atomic.
- **B-121 floating-render regression**: PASS. `tests/b121-floating-group-render.test.js` updated with `liveTabId` fixtures (line 344, 356). All existing assertions hold; no shape change to `FloatingMember` descriptor (R2-VERIFY 3 LOCK).
- **B-125 inherited-tabs regression**: PASS. `inheritedTabs` Set unchanged; `markInherited(tab.id)` still placed strictly AFTER `appendFloatingGroup` await per `tab-events.js:181`. T-132-H pure-read pin (zero storage writes) preserved verbatim — `preMarkInheritedFromFloatingGroups` body unchanged per R2-VERIFY 1 LOCK rationale.
- **B-130 dotted visual unaffected**: PASS. CSS-only B-130 change; B-137 production diff has zero CSS/HTML changes.
- **B-132 cold-start claim-jump fix interaction**: PASS — by design separation. B-132 `preMarkInheritedFromFloatingGroups` retains pure-read-then-mark contract (T-132-H pin holds at `tests/b132-cold-start-inheritance.test.js`). B-137 lazy-rewrite owner is `reassociateFloatingGroups` (R2-VERIFY 1 LOCK Option A). Different cold-start stages: pre-mark runs before `reconcileClaims` to populate `inheritedTabs`; reassociate runs after to prune resolved-claimed records AND lazy-rewrite stale `liveTabId`. New test in `tests/b132-cold-start-inheritance.test.js` verifies cooperation: pre-mark sets `isInherited(920) === true`, then reassociate writes `liveTabId === 920` onto the legacy v3 record.
- **B-134 drag-reorder regression**: PASS. T1-T31 unchanged; T32+T33+T34 added (race-toast resolved, MOVE_FLOATING liveTabId preservation, ATTACH liveTabId seed). Existing fixtures in T3, T5, T6, T11, T13, T31 updated to supply `liveTabId` argument (silent-rejection contract per §66.5.3 means tests that did not previously supply it would have produced zero records → cascade test failures; R3 correctly added the argument across all 9 affected test files).
- **B-136 chrome.tabs.onMoved regression**: PASS. B-137 production diff does NOT touch `chrome.tabs.onMoved` listener at `tab-events.js:382`. Post-B-137 `chrome.tabs.move` still triggers the post-move broadcast updating `LiveTabIndex.entry.index`. Listener correctness independent of B-137; tier (b) position fallback consumes `LiveTabIndex.entry.index` for legacy v3 records.
- **AC8 — no UI changes**: PASS. `git diff HEAD~1 HEAD --stat` returns zero changes to `sidepanel/`, `newtab/`, `popup/`, `components/`, or any `.css`/`.html` file. All changes are SW-side (`background/`) + tests.
- **C-9 §66.15 enumeration coverage**: 10 cases enumerated; cases 1-6 directly pinned by R3 tests; cases 7-10 implicitly covered (case 7 storage write-conflict — atomic writeTransaction guarantee; case 8 parent deleted — preserved at `floating-members.js:87`; case 9 claimed-tab skip — preserved at `:133`; case 10 H-2 dedup — gate at `:135-138`). LOW L-2 flags case 10 explicit pin as a follow-up.
- **Test suite execution evidence**: `npm test` confirms `tests 1797 / pass 1797 / fail 0 / duration_ms 3487` — clean, no flake, +15 net new tests over S41 kickoff baseline (1,782).

### UAT must explicitly walk

R5 [test-engineer] UAT_B-137.md plan inputs (the user-visible flows that the structural correctness fix touches):

1. **B-131 spawn-from-bookmark repro (M-1 follow-up)**: open a new tab from a bookmark in a group whose parent has multiple children. The new floating row should show the new tab's title, NOT a sibling's title. Walks `chrome.tabs.onCreated` → `walkOpenerChain` → `appendFloatingGroup` end-to-end. **Mandatory** — this is the actual user-visible bug.

2. **Position-collision (Issue 2 root cause)**: with two floating rows under the same parent, drag-reorder them so positions swap. Open a new bookmark elsewhere that ends up at the position one of the floating rows used to occupy. The new floating row should bind to the correct tab title. (T1 covers this structurally; UAT confirms user-perceived behavior.)

3. **Race-toast (Issue 3 root cause)**: rapidly drag-reorder floating rows under heavy SW load (e.g., during opener-chain processing of a freshly-created tab, or during `chrome.tabs.onMoved` cascade). No `ERR_RACE` toast should fire post-B-137. (T32 covers this structurally with mocked stale-index; UAT confirms the realistic race window is also clean.)

4. **Cold-start v3-to-v4 lazy rewrite (AC5)**: after updating the extension to v1.35.0, toggle OFF→ON in `chrome://extensions` to flush SW module cache (per CHANGELOG note from C-1a). Verify pre-existing legacy v3 floating-group records (no `liveTabId`) gain the field on the next cold-start re-bind. Inspect `chrome.storage.local.get('tj:floatingGroups')` in the SW console after the cold-start cycle — records should now carry `liveTabId: <numeric>`.

5. **Mixed v3+v4 transitional state (C-9 case 4)**: with a mix of legacy v3 records (no `liveTabId`) AND newly-written v4 records (with `liveTabId`), confirm both render correctly in the floating-tab list. No visual regression. No "phantom row" double-render (H-2 dedup holds).

6. **Tab-navigate after binding (LOW L-4)**: open a bookmark in a group (creates a floating row), then navigate that tab to a completely different URL. The floating row should reflect the new URL/title (tab identity preserved via `liveTabId`; only displayed metadata changes). Confirm user perception matches the technical correctness.

7. **Stale `liveTabId` cross-restart self-correction (C-9 case 5)**: with a v4 record carrying `liveTabId: N`, kill the browser. On restart, Chrome may have reused tabId N for a different tab (rare but possible). Verify `reassociateFloatingGroups` runs BEFORE first `MSG_LIST_ITEMS` dispatch, lazy-rewrites `liveTabId` to the correct tabId via tier (b) position+URL fallback, and floating row renders correctly. (Difficult to reproduce deterministically; SHOULD be enumerated as a SKIP in UAT plan with a note that the self-correcting transient is acceptable.) [security-reviewer] T-2 suggestion overlaps.

8. **Tab-close during cold-start re-bind window (security-reviewer T-1 overlap)**: close a floating-group-associated tab during browser restart cold-start window. Verify no record corruption, no orphan render, no broadcast loop. Integration tests cannot reproduce SW lifecycle teardown — UAT-only signal class.

9. **B-138 follow-up boundary**: confirm `(windowId, tabIndex)` position fallback REMAINS active for legacy v3 records — i.e., a user with pre-B-137 floating-group records sees no breakage even if those records never get cold-start-re-bound (e.g., user never closes/reopens browser). B-138 will remove the fallback once telemetry confirms zero v3 records remain in the wild.

### Recommendation

PROCEED to R5 [test-engineer] testing round. The R3 build cleanly implements the R2-locked design; B-131 / Issue 2 / Issue 3 structural root cause is eliminated for v4 records via tier (a) `liveTabId` direct-match; lazy migration preserves v3 backward compat; cascade-grep parity holds across all 8 enumerated record-write surfaces (§66.10); H-2 dedup gate preserved verbatim; AC8 (no UI changes) verified. The single MEDIUM finding (M-1 — UAT plan needs explicit opener-chain spawn-from-bookmark scenario) is an R5 enumeration item, not an R3 build defect. The 4 LOW findings are documentation/coverage hardening for future sprints. Test suite green at 1,797/1,797.

Zero CRITICAL, zero HIGH, zero MEDIUM findings. The single LOW is an advisory non-issue. No code changes required from [frontend-engineer] for security gate closure.
