# Post-S41 v1.35.0 Pre-Merge Smoke-Test Triage — R0 Discovery Spike

_Pre-created 2026-04-30 for the post-v1.35.0-pre-merge triage of 2 product-owner-reported drag-reorder bugs:_

1. **Issue A**: drag-reorder floating tab WITHIN a group fires the toast `Floating-tab list changed during drag — please retry.` on EVERY legitimate reorder attempt — including drops within the same group's existing floating tabs. **Critical**: this toast is the S40 Wave 3a H-2 ERR_RACE toast which B-137 (S41 anchor) was supposed to STRUCTURALLY ELIMINATE (Issue 3 from post-S40 spike). If it is regressing, B-137 broke something OR didn't actually fix what it claimed.

2. **Issue B**: drag-reorder Open Tab in Open Tabs section drops the row 3 positions ABOVE where the user dropped. Deterministic off-by-3 offset — suggests hit-test is counting non-row elements (group headers, section headers, drift-bar zones) into the index OR `chrome.tabs.move` is being passed a wrong `index` argument.

User strategic framing: "lets approve R0 spike and hold off on the PR". v1.35.0 PR command is staged but NOT executed; commits are on `feature/sprint-41-floating-tab-id` at HEAD `73355f1`.

---

## Issue A — Floating reorder ERR_RACE toast (REGRESSION post-B-137 — partial-fix gap)

### Failure mechanism (with file:line)

The toast text the user sees — `Floating-tab list changed during drag — please retry.` — is dispatched by the sidepanel ONLY on the SW-response branch `resp.reason === 'ERR_RACE'` (`sidepanel/sidepanel.js:4732`). The sidepanel's own broadcast-race guard B (`sidepanel.js:6401-6406`) emits a different toast (`Tabs changed during drag — please retry.`) — so the user-visible string proves the failure originates server-side from `MSG_REORDER_FLOATING_MEMBERS`.

Server-side, `MSG_REORDER_FLOATING_MEMBERS` returns `{ reordered: false, reason: 'ERR_RACE' }` whenever `reorderFloatingMembers()` returns `false` (`background/messages/storage-handlers.js:710-711`). The helper at `background/tabs/floating-groups.js:364-422` returns `false` from one of three early-return triggers:

1. `_resolveRecordIndexByTabId(records, id, groupId, liveIndex)` returns -1 inside the per-tabId pre-flight loop (`floating-groups.js:388-389`) — ONE OR MORE supplied tabIds cannot be resolved to a stored record.
2. `storageBucketSize !== supplied.size` — the count of records in storage for `groupId` does not match the count of tabIds supplied by the client (`floating-groups.js:397-401`).
3. The orderedTabIds dup-check fails (`floating-groups.js:368-369`).

Trigger 1 is what B-137 subsumed. The 3-tier join in `_resolveRecordIndexByTabId` (`floating-groups.js:322-345`) now resolves a v4 record's tabId via tier (a) `liveTabId` direct-match in O(N_records). Trigger 1 is closed for v4 records and effectively closed for v3 records too (B-136 fixed the `chrome.tabs.onMoved` listener so tier (b) `(windowId, tabIndex)` geometry stays accurate).

**Trigger 2 is the live failure mode.** The `storageBucketSize` parity check counts every record in storage with `groupId === <target>`. The client-supplied set comes from `_cachedFloatingMembers[groupId]` (sidepanel.js:6374), populated by `buildFloatingMembers()` (background/tabs/floating-members.js). Critically, `buildFloatingMembers` SKIPS records whose match resolves to null OR to an already-claimed tab OR to a tabId already emitted (`floating-members.js:128-138`). Those skipped records remain in storage but never appear in `_cachedFloatingMembers`. The result: `storageBucketSize > supplied.size`, parity-check fails, ERR_RACE returns to the sidepanel, toast fires.

**Source of orphan records (the structural gap):** `chrome.tabs.onRemoved` (`background/tabs/tab-events.js:213-229`) does NOT call `pruneFloatingGroupsByParentItemId` or any floating-group cleanup helper. It only releases the claim, drops the inheritance marker, prunes the opener relationship, and removes the LiveTabIndex entry. **Floating-group records are NOT pruned when their tab closes.** They live until either (a) the parent saved-item is deleted (`pruneFloatingGroupsByParentItemId`) or (b) the next cold-start re-bind in `reassociateFloatingGroups` matches them to an already-claimed tab (`floating-groups.js:172-179`). Records that fail to match anything live on cold-start are LEFT IN PLACE per AC9 (`floating-groups.js:189-191`) — the design assumes the tab "may reopen on a future restart", which is true for the URL but not for `tabId`.

**Concrete reproduction**:
1. User has 1 saved item in group G with 2 floating tabs A and B. Storage has 2 records.
2. User closes floating tab A. `chrome.tabs.onRemoved` runs but does NOT prune the record. Storage still has 2 records.
3. User does NOT reload the SW (a cold start would have pruned A's record if its `(windowId, tabIndex)` slot is now occupied by an unrelated unclaimed tab — but more often the slot has shifted away thanks to B-136's reflow).
4. Sidepanel re-fetches `MSG_LIST_ITEMS`. `buildFloatingMembers` for group G now returns ONE descriptor (B's). `_cachedFloatingMembers[G].length === 1`.
5. User drags tab B within group G. Drop. `_computeReorderFloatingPayload` returns `[B.tabId]` (length 1). SW handler validates: `storageBucketSize === 2`, `supplied.size === 1`. Mismatch → `false` → ERR_RACE → toast.
6. User reports: every drag fires the toast.

The user's specific report — "fires on EVERY drag" — is consistent with at least one orphan record sitting in the parent group's bucket. Once present, every subsequent reorder against that group fails.

### Why B-137 did not actually eliminate it (or did, but a different race kicked in)

B-137 R0 spike (post-s40-smoke-triage.md Issue 3 §148-179) identified TWO `reorderFloatingMembers` failure triggers — and explicitly named both. It then prescribed a fix (the `liveTabId` join key) that addressed Trigger 1 but NOT Trigger 2:

- Trigger 1 — `_resolveRecordIndexByTabId` returns -1 → tier (a) direct-match fixes this.
- Trigger 2 — `storageBucketSize !== supplied.size` → **NOT addressed.**

B-137 §66.1 R2 chapter states: *"closes a structural correctness defect documented in `docs/findings/post-s40-smoke-triage.md` Issue 2 (sibling-title displacement) and Issue 3 (race-toast on rapid floating reorder)"*. The chapter then locks 8 ACs. AC7 is the race-toast acceptance criterion (verified by T32 `tests/b134-tab-drag-reorder.test.js:1041-1085`). T32 only exercises Trigger 1 — it stamps `liveTabId`, corrupts `LiveTabIndex.entry.index`, asserts `reorderFloatingMembers` succeeds. **It never seeds an orphan record to exercise Trigger 2.**

So B-137 **did fix what it tested** (Trigger 1 — the `_resolveRecordIndexByTabId` half). It did not fix what it claimed (Issue 3 in its entirety). The R0 spike's analysis was correct on Trigger 2's existence; the R2 design under-scoped the fix; the R5 test never exercised Trigger 2; the toast STILL fires for the orphan-record case. **Per CLAUDE.md B-141 self-application: this is a R3-spec-incorrect-finding scenario where R3 implemented exactly what R2 prescribed, but R2 prescribed an incomplete fix relative to the R0 finding the chapter claimed to subsume.**

### Classification: (b) v1.35.1 hotfix

The orphan-prune work is small (~30-50 LOC + tests) but introduces a code path that should be reviewed independently. It is NOT a v1.35.0 amend candidate because:
- It expands B-137's scope (cleanup-on-close) outside the chapter's locked AC8 ("out of scope: removing the `(windowId, tabIndex)` fallback").
- It introduces a write-on-tab-close path that touches `tj:floatingGroups` — a storage write surface that should pass `[security-reviewer]` on its own merits.
- It is a clean candidate for a v1.35.1 hotfix on its own.

Tier: **Fast Track (S)** for the hotfix path. Could fold into a Sprint 42 anchor if more comprehensive cleanup is wanted.

### Test gap

| Gap | Detail |
|-----|--------|
| `tests/b134-tab-drag-reorder.test.js:1041-1085` (T32) | Only exercises `_resolveRecordIndexByTabId` failure mode (stale-index). Never seeds an orphan record (`storageBucketSize > supplied.size`). |
| `tests/b134-tab-drag-reorder.test.js:966-1026` (T31) | Has under-supply / over-supply / dup branches. **Branch (a) under-supply IS the orphan-record case.** It tests `reorderFloatingMembers([200])` against a 2-record bucket — and asserts `false`. So the test IS aware of this failure mode, but treats it as DESIRED behavior (a race the SW correctly detects). The test never explores the user-experience gap: in production this is a permanent ERR_RACE, not a transient race. |
| No test exists | for `chrome.tabs.onRemoved` cascade-prune of floating-group records. There is no such handler today. |
| `tests/chrome-mock.js` | Does not test the missing onRemoved-cascade either. |

### Fix sketch (~30-50 LOC, files affected)

**Production**:
1. `background/tabs/tab-events.js` — extend `chrome.tabs.onRemoved` listener (around line 213-229) to also call a new `pruneFloatingGroupsByLiveTabId(tabId)` helper. Awaitable; non-blocking on the broadcast.
2. `background/tabs/floating-groups.js` — new exported helper `pruneFloatingGroupsByLiveTabId(tabId)`. Single `writeTransaction` over `PARTITION_FLOATING_GROUPS` filtering out records where `record.liveTabId === tabId`. Mirrors `pruneFloatingGroupsByParentItemId` (line 660). For legacy v3 records lacking `liveTabId`, fallback to `(windowId, tabIndex)` match against the record at the moment of `onRemoved` firing — but live entry is already gone by then, so prune-by-liveTabId only.
3. (Optional, defense-in-depth) `background/tabs/floating-groups.js` — extend `reorderFloatingMembers` to filter `storageBucketSize` to records that can resolve to a live tab — bringing it in line with `buildFloatingMembers` semantics. This is a softer fix that doesn't require the onRemoved cascade but masks the underlying orphan-record accumulation.

Recommendation: **option 1+2 (cascade-prune on close) PLUS option 3 (softer parity check)** as belt-and-braces. The cascade-prune is structurally correct; the softer parity check defends against legacy-shape records that B-136/B-137 cannot retroactively fix.

**Tests**:
4. `tests/b134-tab-drag-reorder.test.js` — new T35: seed 2 floating-group records for group G with `liveTabId: [200, 201]`. Live-mock has both tabs. Fire `chrome.tabs.onRemoved.__fire(200, ...)`. Assert: storage now has 1 record (the one with `liveTabId: 201`). New T36: same fixture, fire onRemoved for 200, then call `reorderFloatingMembers(g, [201])`. Assert: returns `true`, record's sortOrder updated.
5. `tests/chrome-mock.js` — verify `chrome.tabs.onRemoved.__fire` is plumbed (it should be — already used by other tests). Confirm.

LOC: ~30 production + ~30 test = ~60 total. Files: 2 production + 1 test.

---

## Issue B — Open Tabs drag off-by-3

### Failure mechanism (with file:line)

The drop-handler dispatches `await chrome.tabs.move(state.draggedTabId, { index: state.pendingInsertIndex })` (sidepanel.js:4714) for `REORDER_OPEN`. The comment at lines 4710-4713 cites §63.14.4: *"chrome.tabs.move uses the literal user-target index; Chrome adjusts source-removal automatically when source and destination are in the same window. No client-side -1 adjustment needed."*

That citation is correct about source-removal index-shift but incomplete about the **reference frame**. `pendingInsertIndex` is computed by `_computeTabDropTarget` (sidepanel.js:6293-6363) from `cluster.rowMidlines`, where the cluster is built from `'.open-tabs-list > .item-row[data-tab-id]'` (`_buildTabDragRectCache`, sidepanel.js:6041-6055). **`cluster.rowMidlines` indexes the section's RENDERED rows, NOT the browser tab strip's tabs.**

The Open Tabs section is built from `buildOpenTabs` (`background/tabs/open-tabs.js:34-63`), which excludes:
- Tabs whose `tabId ∈ Object.values(claimsMirror)` (claimed by saved items).
- Tabs whose `tabId ∈ floatingTabIds` (floating-members under groups).

So if the user has 3 saved-item-claimed tabs + 0 floating tabs at strip positions 0-2, AND 5 open tabs at strip positions 3-7, the section displays 5 rows indexed 0-4. The user drops on section-row 5 (after the last) → `pendingInsertIndex: 5` (= section-end). `chrome.tabs.move(tabId, { index: 5 })` lands the tab at **strip-position 5**, which is in the middle of the open tabs (where the user wanted strip-position 8). User observes a **3-position-too-high** drop.

The off-by-N is exactly `(strip-index of section's row 0) - (section's row 0 index, which is 0)` = `strip-index of section's first row`. The user reports off-by-3, consistent with 3 claimed-or-floating tabs sitting at strip positions 0-2.

### Classification: (a) localized bug fixable in v1.35.0 amend OR (b) v1.35.1 hotfix

This is a **B-134 latent bug** that ships in v1.34.x today. The user only NOW reports it because v1.34.0 had Issue 1 (no `chrome.tabs.onMoved`) which masked the section-vs-strip-index gap (the strip never even reordered, so the user never saw the wrong-position-after-reorder symptom). v1.34.1 (B-136) wired up onMoved → strip reorder visibly happens → user sees the off-by-N. **Pre-existing latent bug surfaced by B-136.**

Tier: **Fast Track (XS)**. The fix is one line plus a translation helper.

Whether to amend v1.35.0 vs ship as v1.35.1: see Strategic Recommendation below.

### Fix sketch

**Production** (sidepanel.js, around line 4714):

Replace:
```js
await chrome.tabs.move(state.draggedTabId, { index: state.pendingInsertIndex });
```

With (sketch):
```js
// Translate section-relative insertIndex to strip-absolute index.
// Each open-tab cluster's rowTabIds[k] tabId has a strip-index recoverable
// from _cachedOpenTabs[].tabIndex (or LiveTabIndex via the SW). The
// simplest in-sidepanel fix: read the target row's strip tabIndex and
// adjust for the dragged-source-removal that Chrome will do automatically.
const cluster = _tabDragRectCache.openTabsByWindow.get(state.pendingTargetWindowId);
const sectionTabIds = cluster ? cluster.rowTabIds : [];
let stripInsertIndex;
if (state.pendingInsertIndex >= sectionTabIds.length) {
  // After last section row → strip-index = lastSectionTab.tabIndex + 1
  const lastTabId = sectionTabIds[sectionTabIds.length - 1];
  const last = _cachedOpenTabsById.get(lastTabId);
  stripInsertIndex = last ? last.tabIndex + 1 : state.pendingInsertIndex;
} else {
  // At section-row N → strip-index = sectionTab[N].tabIndex
  const targetTabId = sectionTabIds[state.pendingInsertIndex];
  const target = _cachedOpenTabsById.get(targetTabId);
  stripInsertIndex = target ? target.tabIndex : state.pendingInsertIndex;
}
await chrome.tabs.move(state.draggedTabId, { index: stripInsertIndex });
```

LOC: ~15 production. The helper could be extracted as `_computeStripInsertIndex(state)` for testability.

**Tests** (`tests/b134-tab-drag-reorder.test.js`):

Extend T1 fixture or add T1c: 6 tabs in window 1, 3 of them claimed by saved items at indices 0-2, 3 open-tabs at indices 3-5. Drag tabId 5 (section row 2 = strip row 5) to section-row 0. Assert `chrome.tabs._moveCalls[0].props.index === 3` (strip-relative), NOT 0 (section-relative).

LOC: ~30 test.

---

## Strategic recommendation

### Recommended option: **B — Ship v1.35.0 as-is + plan v1.35.1 hotfix immediately**

**Rationale**:

1. **B-137 IS shippable on its own merits.** The `liveTabId` join-key adoption delivers the structural correctness fix for the `_resolveRecordIndexByTabId` join brittleness AND for the sibling-title displacement (Issue 2 from post-S40 spike). Issue 2 was the primary user-reported failure that drove B-137. Shipping v1.35.0 closes Issue 2 today.

2. **The B-137 partial-fix gap IS a regression-from-claim, not a regression-from-prior-build.** Pre-v1.35.0, Issue A's exact failure mode also fired (orphan records → ERR_RACE). The S40 Wave 3a R4 H-2 fix that ADDED the toast was specifically scoped to the `_resolveRecordIndexByTabId` failure. The orphan-record path was always there; the toast text was always identical for both triggers because they share the SW response code. So shipping v1.35.0 is **status-quo neutral** for Issue A — neither better nor worse than v1.34.1.

3. **Issue B is a B-134 latent bug surfaced by B-136 (v1.34.1).** It is NOT a B-137 regression. Whether to fold it into v1.35.0 (amend) or ship as v1.35.1 hotfix is a release-cadence call. Recommendation: **v1.35.1 hotfix**, paired with Issue A's fix in a single 2-item release, kept Fast Track for both.

4. **Amending v1.35.0 introduces release-process risk.** The PR command is staged; the commit chain is post-Gate-7 + post-release-manager. Amending requires reverting the release-manager commit, adding 2 fix commits, re-running Gate 4 + Gate 7 + release-manager. That's a ~half-day re-do for a release that's otherwise PR-ready. The hotfix path keeps v1.35.0 surgical (the title fix that drove the sprint).

5. **Option C (defer to S42) is the wrong answer.** Issue A makes floating-tab reorder unusable for ANY user with even one orphan record — and the orphan accumulation is unbounded over time. Issue B makes Open Tabs drag visibly broken for any user with claimed/floating tabs ahead of the section (i.e., almost every real user). Both warrant a hotfix sooner rather than later.

### B-137 partial-revert assessment: **NOT recommended**

B-137 delivered correctness wins (Issue 2 sibling-title displacement is gone). The Issue A regression-from-claim is a coverage gap, not a behavioral regression. Reverting B-137 would re-introduce Issue 2 and gain nothing for Issue A (the orphan-record problem pre-dates B-137 — it's a B-013 / B-018 design carve-out per AC9, layered onto B-134's parity check). **Keep B-137 in v1.35.0.** File the cascade-prune-on-close work as a follow-up.

### Item filings recommended

| Item | Priority | Tier | Title | Sprint |
|---|---|---|---|---|
| **B-144** | **P0** | **Fast Track (S)** | **Cascade-prune `tj:floatingGroups` records on `chrome.tabs.onRemoved`** | v1.35.1 hotfix (immediate) |
| **B-145** | **P0** | **Fast Track (XS)** | **Translate Open Tabs section-insertIndex to strip-absolute index in `chrome.tabs.move` dispatch** | v1.35.1 hotfix (immediate) |
| **B-146** | **P2** | **Fast Track (S)** | **Defense-in-depth: filter `reorderFloatingMembers` `storageBucketSize` parity to records resolvable to live tabs** | S42 (or fold into B-144) |

**Process action item for Sprint 42 retrospective**: B-137 R5 (`tests/b134-tab-drag-reorder.test.js` T32) covered ONE of two named race triggers from the R0 spike. R5 [test-engineer] and R6 [solution-architect] should have caught the gap. **Add a check to the R5 charter**: when an item explicitly subsumes a multi-trigger R0 finding, R5 MUST enumerate every named trigger and confirm test coverage of each before marking AC-met.

### Estimated release shape

| Release | Window | Contents |
|---------|--------|----------|
| **v1.35.0** | Today (per staged PR) | B-137 + B-139..B-143 + B-138-deferred. Ships as-is. |
| **v1.35.1** | Within ~2-3 days of v1.35.0 merge | B-144 (cascade-prune-on-close) + B-145 (strip-index translation). Both Fast Track. ~60 production LOC + ~60 test LOC + R4 reviewers. No schema bump. No new permissions. Likely a single same-day branch-PR-tag-release cycle. |
| **S42** | Per regular cadence | B-146 + retrospective action item + further drag-UX hardening (cross-window drag B-135, etc.) |

### Risk of NOT amending v1.35.0

**Low to medium.** Issues A and B are real user-visible defects but neither is SEV1 (no data loss, no crash, no security impact). Floating reorder no-ops with a clear toast (frustrating but recoverable). Open Tabs drag lands in the wrong position (recoverable by re-dragging). Both are close-able by a fast follow-up release. The B-137 title-fix value (closing Issue 2 sibling-title displacement) is shipped today and is more disruptive than these two regressions in user-visible importance.

### Risk of amending vs. delaying

**Amending introduces process risk** — the v1.35.0 release artifacts (release-manager commit, CHANGELOG, RELEASES.md, sprint archive) are already authored. Amending requires unwinding that work, adding 2 net-new sprint items mid-flight (Scope Change Control), re-running Gate 4 + Gate 7 + release-manager. Estimated ~half-day rework with non-trivial chance of introducing a new defect via the rework itself.

**Delaying via v1.35.1 has near-zero process risk** — the hotfix branch pattern is established (`hotfix/v1.34.1-b-136` precedent in commit `10a882f`). Same pattern for v1.35.1: branch off `release/v2`, two Fast Track items, R4 reviewers, R5 tests, release-manager, tag.

**Recommendation: Option B. Ship v1.35.0 today; cut v1.35.1 within 2-3 days with B-144 + B-145.**

---

_Spike completed by [solution-architect] on 2026-04-30. No code modified; no test changed; no BACKLOG/SPRINT/CHANGELOG updates. Output is this findings file only._

---

## [security-reviewer] — Fix A + Fix B R4

_R4 security review of the pre-v1.35.0 hotfix bundle. Branch: `feature/sprint-41-floating-tab-id` (uncommitted). Diff scope: `background/tabs/floating-groups.js` (+83), `background/tabs/tab-events.js` (+30), `sidepanel/sidepanel.js` (+78), `tests/b134-tab-drag-reorder.test.js` (+519). `manifest.json` is untouched._

### Verdict — **CLEAN. No CRITICAL / HIGH / MEDIUM / LOW findings. Approved for merge from a security perspective.**

The hotfix bundle expands the storage-write surface by exactly one mutator (`pruneFloatingGroupsByLiveTabId`) and adds one pure computation in the sidepanel (`_computeStripInsertIndex`). Both are tightly scoped, defensively coded, follow established project patterns, and introduce no new threat surface.

### Generic threat surface — pass

| # | Check | Result |
|---|-------|--------|
| 1 | Manifest / permissions delta | **Pass.** `git diff manifest.json` is empty. No new permissions requested, no `host_permissions` change, no `content_scripts` change, no `web_accessible_resources` change. |
| 2 | CSP / `eval` / `new Function` / `innerHTML` / `outerHTML` introductions | **Pass.** Grep of the diff finds zero new occurrences. Fix A is pure storage-mutator JS; Fix B is pure-computation index translation. No DOM HTML injection paths added. |
| 3 | Network egress / telemetry / `console.log` | **Pass.** Two new `console.warn` calls added in `background/tabs/tab-events.js:244` and `:318` for `pruneFloatingGroupsByLiveTabId` rejection paths. Both mirror the established sibling-pattern at `tab-events.js:237` (`releaseClaimByTab failed`) and `:281` (`tabs.query failed`). No PII (no tabId-of-bookmark URLs / titles) is logged — only the error object surfaced from the storage layer, consistent with project precedent. No `console.log` debug noise. No `fetch`, `XMLHttpRequest`, `WebSocket`, or remote-code surface added. |
| 4 | Trust-boundary inputs | **Pass.** Detailed analysis in Fix A and Fix B sections below. |

### Fix A — `pruneFloatingGroupsByLiveTabId` storage-write surface

**Storage-write atomicity (check 3) — pass.** The mutator at `background/tabs/floating-groups.js:733-750` runs inside `writeTransaction` (`background/storage/write-transaction.js:82-141`), which provides:
- AC10 serialization via the module-level `txQueue` (write-transaction.js:37, :138-140) — concurrent callers are chained, so back-to-back `chrome.tabs.onRemoved` events for two different tabIds will not race the get/mutate/set.
- Single atomic `chrome.storage.local.get` (line 93) → mutator (line 104) → single atomic `chrome.storage.local.set` (line 116). Chrome's storage API guarantees the set commits as a whole.
- `assertShape` (line 112) post-mutation validation prevents a corrupt array reaching disk.
- SW-context guard (`assertServiceWorkerContext`, lines 64-76) — runtime enforcement that the helper only fires inside the SW.

**Pre-flight read-then-write race (check 3) — pass, benign.** The helper reads `tj:floatingGroups` outside the transaction (`floating-groups.js:718`) to early-return when there is nothing to prune. If a record races in between the pre-flight read and the transaction (e.g., another `appendFloatingGroup` adds a record with the closing tab's `liveTabId` between the two awaits — extremely unlikely given the sidepanel UI dispatches `appendFloatingGroup` only via `MSG_ADD_FLOATING_GROUP` which is itself queued through `writeTransaction`), the consequence is benign because:
1. The pre-flight saw "no matching record" → early return → `pruneFloatingGroupsByLiveTabId` is a no-op.
2. The new record (now seeded with the closed tabId as `liveTabId`) is itself an orphan — but `appendFloatingGroup` is initiated from the sidepanel against a SUPPOSEDLY-LIVE tabId. The only way a record gets seeded with a tabId that is already in `chrome.tabs.onRemoved` flight is if the user opens a new tab that gets recycled to the same numeric `tabId` as a freshly-closed tab AND the sidepanel issues an APPEND for it before the SW sees the onRemoved. This is observationally impossible on Chromium today (tabId recycling is delayed by browser session length, not millisecond-window overlap).
3. The mutator inside `writeTransaction` re-reads via the transaction's own `current` snapshot (line 93 of write-transaction.js), so even if the read-then-write race somehow seeded the record post-pre-flight, the next call to `pruneFloatingGroupsByLiveTabId` (e.g., from the symmetric `windows.onRemoved` cascade at `tab-events.js:317`) will catch it. Filter is idempotent: applying it to a record-set that no longer contains the target is a no-op.

**Input validation (check 4) — pass.** `tabId` is validated as a finite number at `floating-groups.js:709` BEFORE any I/O; non-numeric or non-finite values short-circuit return 0. Inside the mutator, every entry is re-validated as an object with a finite-numeric `liveTabId` (`floating-groups.js:740-741`) before the equality check. Defensive against corrupt storage shapes.

**Cascade-prune correctness (check 6) — pass.** The filter predicate at `floating-groups.js:738-748` is allow-list direction (C-7 compliant): retains records UNLESS they match `record.liveTabId === tabId`. Records lacking a numeric `liveTabId` (legacy v3) are explicitly retained — consistent with the JSDoc carve-out at lines 689-696 and proven by test T39 (`tests/b134-tab-drag-reorder.test.js:1319-1356`). v3 records self-evict via cold-start re-bind per the existing migration design.

**Listener ordering (check 7) — pass.** The new prune call at `tab-events.js:243` fires AFTER `pruneOpener` (line 224), `pruneInherited` (line 227), `removeTabEntry` (line 232), and `releaseClaimByTab(...)` initiation (line 233). Critically:
- `releaseClaimByTab` is fire-and-forget (`.then(...).catch(...)` chain, line 233-238) so the cascade-prune does not block it.
- The cascade-prune is itself fire-and-forget (`.catch(...)` chain, line 243-245). A storage failure here cannot throw past the listener boundary.
- Both async chains race independently; ordering between them is unobservable to users (both touch different partitions: `tj:items` vs `tj:floatingGroups`).
- The release-claim-first-then-prune ordering is correct because the claim-release writes to `tj:items` (clearing `claimedTabId`) and the prune writes to `tj:floatingGroups`. Different partitions; no cross-contamination.

**`onRemoved` double-fire on window close (check 8) — pass.** Verified in `background/tabs/tab-events.js:317` — the `windows.onRemoved` loop fires the same prune helper for every tab that was in the closing window. Per Chrome's contract, `tabs.onRemoved` fires for each closing tab BEFORE `windows.onRemoved`, so both code paths will fire `pruneFloatingGroupsByLiveTabId(tabId)` for the same tabId. Idempotency check:
- First call: pre-flight reads N records, finds match → mutator filters out the record → storage now has N-1.
- Second call: pre-flight reads N-1 records, finds NO match → early-return at line 731 → no `writeTransaction` invocation.

The double-fire produces exactly one storage write — benign and matches the comment-stated belt-and-braces design intent at `tab-events.js:309-316`.

**No-storage-write invariant preservation (`tests/tab-events-no-storage-write.test.js`) — pass.** That test exercises `chrome.tabs.onRemoved.__fire(2)` on a tab with no floating-group records (no `appendFloatingGroup` was called for tabId 2). The pre-flight `readPartition` returns the seeded `tj:floatingGroups` of `undefined` (no key in `seedPartitions`) → branch at `floating-groups.js:719` returns 0 → `writeTransaction` is NEVER invoked → `chrome.storage.local.set` is NEVER called from the prune path. The existing AC4 invariant test will continue to pass without modification.

### Fix B — `_computeStripInsertIndex` pure-computation translation

**Trust boundary (check 9) — pass.** The function consumes only sidepanel-internal state (`state.pendingTargetWindowId`, `state.draggedTabId`, `state.pendingInsertIndex`) and the sidepanel-internal cache `_cachedOpenTabsById` / `_tabDragRectCache`. Trace of inputs:
- `state.draggedTabId` — set in the sidepanel's own `dragstart` handler from the sidepanel's own row's `data-tab-id` attribute, which is itself rendered from `_cachedOpenTabs` (an MSG_LIST_ITEMS response, all integers from `chrome.tabs.query`).
- `state.pendingInsertIndex` / `state.pendingTargetWindowId` — set at `sidepanel.js:6132-6135` by `_computeTabDropTarget`, an internal hit-test from `cluster.rowMidlines`.
- `_cachedOpenTabsById` — populated at `sidepanel.js:280` from `_cachedOpenTabs`, populated by `MSG_LIST_ITEMS` server-side from `chrome.tabs.query` (Chrome-API-derived tabIds).
- `_tabDragRectCache.openTabsByWindow.get(...).rowTabIds` — same provenance (`_buildTabDragRectCache` at `sidepanel.js:6041-6055` builds from `.open-tabs-list > .item-row[data-tab-id]` queries against the rendered DOM, which itself was rendered from `_cachedOpenTabs`).

No user-supplied URL / title / tabId / windowId reaches the function. No payload validation needed.

**`chrome.tabs.move` argument injection (check 10) — pass.** The integer dispatched to `chrome.tabs.move` at `sidepanel.js:4733` is one of:
- `target.tabIndex` from `_cachedOpenTabsById` (a Chrome-API-derived integer, line 6457).
- `state.pendingInsertIndex` fallback (a hit-test integer derived from `Math.round(...)` at sidepanel.js:6293-6363, which is a numeric `clientY` math result; can never be non-finite or string-coercible to an injection).

No string concatenation, no user-supplied input, no URL building. Chrome's `chrome.tabs.move` interprets `index` strictly as an integer offset. Safe.

**Cross-window REJECT preservation (check 11) — pass.** Verified at `sidepanel/sidepanel.js:4706-4709`:
```
if (state.pendingTargetWindowId !== state.sourceWindowId) {
  showToast('Cross-window drag is not supported yet.');
  return;
}
```
This guard returns BEFORE the new `_computeStripInsertIndex(state)` call at line 4732. The hit-test also issues a parallel REJECT at the dispatch-site precondition (`_validateTabDropPreflight` at lines 4685-4695). Both layers are intact. The new code path is reached only for same-window REORDER_OPEN, which is the same trust scope as the pre-fix code.

**Defensive input handling (check 4) — pass.** All four edge cases enumerated in the JSDoc (`sidepanel.js:6432-6437`) are handled:
1. Missing `_tabDragRectCache` → fallback to `state.pendingInsertIndex` (line 6445).
2. Missing cluster for the target window → fallback (line 6445).
3. `dPos === -1` (dragged tab not in cluster — defensive, shouldn't happen for REORDER_OPEN) → fallback (line 6448).
4. Missing `_cachedOpenTabsById` entry or non-numeric `tabIndex` → fallback (line 6456).

`effectiveS` is clamped to `[0, sectionTabIds.length - 1]` at lines 6452-6453 — array-index out-of-bounds is structurally impossible.

### Tests — pass

The new tests (`tests/b134-tab-drag-reorder.test.js:1147-1664`) cover the security-relevant paths:
- T34 (line 1170) — direct helper call asserts pruneCount + storage state.
- T35 (line 1196) — end-to-end orphan-record + reorder-after-cascade.
- T36 (line 1259) — `chrome.tabs.onRemoved` listener integration.
- T37 (line 1287) — unknown tabId no-op (input-validation belt-and-braces).
- T38 (line 1310) — empty partition no-op (no-storage-write invariant preservation).
- T39 (line 1319) — legacy v3 records explicitly NOT pruned (allow-list discipline).
- FixB-T1..T5 (line 1438-1664) — section→strip translation; cross-window REJECT source-text pin (T4).

T39 is particularly notable: it exercises the C-7 allow-list direction by seeding a v3-shape record with no `liveTabId` and confirming the helper retains it. Future regression of the predicate to a deny-list (e.g., "delete all records that don't match the keep-set") would be caught.

### Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 0 |

No findings. Both Fix A and Fix B are tightly scoped, defensively coded, follow established project patterns (`writeTransaction` atomicity, pre-flight `readPartition` for the no-write fast path, `console.warn` graceful-degradation in catch handlers, allow-list filter direction), and introduce no new threat surface. Approved for merge from `[security-reviewer]`.

_Review completed by [security-reviewer] on 2026-04-29 against `feature/sprint-41-floating-tab-id` working-tree diff._

---

## [code-reviewer] — Fix A + Fix B R4

_R4 code review of the pre-v1.35.0 hotfix bundle. Branch: `feature/sprint-41-floating-tab-id` (uncommitted). Diff scope: `background/tabs/floating-groups.js` (+83), `background/tabs/tab-events.js` (+29/-1), `sidepanel/sidepanel.js` (+78/-2), `tests/b134-tab-drag-reorder.test.js` (+519). `manifest.json` is untouched. Full test suite: 1812 / 1812 passing._

### Verdict — **CLEAN. No CRITICAL / HIGH / MEDIUM findings. Two LOW-priority observations recorded for transparency.** Approved for merge.

Both fixes are surgical, structurally correct, defensively coded, and tightly scoped to their respective failure modes. The hand-traced algorithm in Fix B is correct across every checklist edge case (forward / backward / drop-at-end / drop-at-start / single-row / N=1/3/10). The cascade-prune helper in Fix A correctly preserves the AC4 no-storage-write invariant via a read-only fast path. B-129 sibling-grep verified — `onDetached`/`onAttached`/`onMoved` are correctly NOT extended (tab + `liveTabId` survive across those events). No TODOs, no commented-out blocks, no stray `console.log` debug noise.

### CRITICAL (must fix before merge)

_None_

### HIGH (must fix before merge)

_None_

### MEDIUM (fix if time permits)

_None_

### LOW (defer or note)

| # | File | Finding | Suggestion |
|---|------|---------|-----------|
| L-1 | `background/tabs/floating-groups.js:660-669` vs `:708-752` | DRY observation: `pruneFloatingGroupsByParentItemId` and the new `pruneFloatingGroupsByLiveTabId` share an identical writeTransaction-with-filter-predicate scaffold. The two predicates differ (`getParentItemId(entry) !== parentItemId` vs `entry.liveTabId === tabId`) but the surrounding shell is identical. The new helper additionally has the pre-flight read-only fast-path that the existing helper lacks. | **Defer.** Extracting a `_pruneFloatingGroupsBy(predicate, options)` helper would either lose the fast-path (regression vs. the AC4 contract that the new helper carefully preserves) or push the fast-path into the existing helper (out-of-scope for a surgical hotfix). File as a Sprint 42 cleanup ticket if cross-helper churn warrants it; not blocking. |
| L-2 | `tests/b134-tab-drag-reorder.test.js:1238` and `:1281` | Timing-based flush via `await new Promise((r) => setTimeout(r, 30))` to await the fire-and-forget `pruneFloatingGroupsByLiveTabId` chain inside the listener. On a slow / loaded CI machine, 30ms could be insufficient if `writeTransaction` queues behind unrelated transactions. | **Accept.** Pattern is established precedent (`tests/b010-live-state.test.js:296,319` and `tests/b091-settings-page.test.js:905` use the same 30-50ms flush). Tests are deterministic on the local mock. If T35/T36 ever flake under CI load, switch to a write-completion deferred via the chrome-mock's set hook rather than time-based. Not blocking for this hotfix. |

### Notes / observations

**Fix A — helper correctness (checklist 1).** Pre-flight read at `floating-groups.js:718` returns `defaultShape(PARTITION_FLOATING_GROUPS) === []` for the never-seeded case (`partitions.js:79`); the helper short-circuits at line 719 (`Array.isArray && length === 0`) and the `willPrune` scan at lines 721-730 short-circuits at line 731 when no record matches. Both no-op paths skip `writeTransaction` entirely → `chrome.storage.local.set` is never invoked → AC4 no-storage-write invariant from `tests/tab-events-no-storage-write.test.js:71` is preserved by construction (verified empirically: full suite passes 1812/1812 including the AC4 test).

**Fix A — closure-captured `prunedCount` is single-shot.** The mutator at `floating-groups.js:736-749` captures `prunedCount` from the enclosing scope and increments it in the filter predicate. `writeTransaction` (`background/storage/write-transaction.js:82-141`) runs the mutator exactly once — there is no retry-on-conflict scheme — so the closure increment is safe. Verified by reading `write-transaction.js:100-109`.

**Fix A — listener integration (checklist 2).** Both `chrome.tabs.onRemoved` (line 243) and `chrome.windows.onRemoved` (line 317) fire the helper with fire-and-forget `.catch(...)` graceful degradation. Storage failure cannot throw past either listener boundary. The `[tab-junkie]` console.warn tag matches the sibling pattern at `tab-events.js:237` (`releaseClaimByTab failed`). The `console.warn` calls are sanctioned by the spec and consistent with existing precedent — not noise.

**Fix A — B-129 sibling-grep verified (checklist 3).** `chrome.tabs.onDetached` (`tab-events.js:362`), `chrome.tabs.onAttached` (`:376`), and `chrome.tabs.onMoved` (`:410`) preserve tab identity (and `liveTabId`) across the event. Floating-group records keyed by `liveTabId` remain valid; extending these listeners would be incorrect. Agent's report is accurate. Sibling grep complete.

**Fix A — race analysis (checklist 4).** Pre-flight read snapshot is taken outside the transaction; the mutator inside `writeTransaction` filters a fresh `current` snapshot (`write-transaction.js:93,100-104`). If the pre-flight saw "no match" but a concurrent `appendFloatingGroup` adds a record between the read and the early-return, the helper no-ops once but the next event for the same tabId will catch it. Filter is idempotent (applying it twice on a record-set already without the target is a no-op). Race analysis holds.

**Fix A — test mappings (checklist 5).** T34-T39 collectively cover happy-path (T34) / orphan-repro end-to-end (T35) / listener integration (T36) / unknown-tabId no-op (T37) / empty-partition no-op (T38) / v3-carve-out preservation (T39). Each test maps cleanly to a JSDoc claim in the helper. T35 is the strongest test — it reproduces the exact user-reported failure path (orphan record → reorder returns ERR_RACE) AND verifies the post-fix path succeeds.

**Fix B — algorithm correctness (checklist 6).** Hand-traced six cases against the production helper at `sidepanel/sidepanel.js:6439-6459`:

| Case | sectionTabIds | dPos | S | effectiveS | target.tabIndex | Verdict |
|------|---------------|------|---|------------|-----------------|---------|
| User-bug N=3 (drag tab 5 → section pos 0) | [3, 4, 5] (tabIndices 3, 4, 5) | 2 | 0 | 0 | 3 | **3** ✓ (matches T2b) |
| Drop-at-end after-last (drag tab 300 → S=3, length 3) | [300, 301, 302] (tabIndices 3, 4, 5) | 0 | 3 | 2 | 5 | **5** ✓ (matches T3) |
| Backward N=10 (drag 1014 → S=1) | [1010..1014] (tabIndices 10-14) | 4 | 1 | 1 | 11 | **11** ✓ (matches T2c) |
| Forward N=10 (drag 1010 → S=4) | [1010..1014] | 0 | 4 | 3 | 13 | **13** ✓ (matches T2c) |
| Drop-at-start (drag 102 → S=0, no claims) | [100, 101, 102] (tabIndices 0, 1, 2) | 2 | 0 | 0 | 0 | **0** ✓ (matches T1) |
| Past-end S=length (drag 1010 → S=5) | [1010..1014] | 0 | 5 | 4 | 14 | **14** ✓ (clamp at line 6452) |

The `effectiveS = (dPos < S) ? S - 1 : S` formula correctly mirrors the same-window source-removal index-shift adjustment that `_computeReorderFloatingPayload` applies for the analogous floating reorder path (`sidepanel.js:6400`). The clamp at lines 6451-6452 is structurally sound; array-index out-of-bounds is impossible.

**Fix B — `_cachedOpenTabsById` cache contract (checklist 7).** Verified at `sidepanel.js:280` — every assignment to `_cachedOpenTabs` flows through `_setCachedOpenTabs` (line 275), which rebuilds `_cachedOpenTabsById` in lockstep. The cache is populated with `{ tabId, tabIndex, windowId, ... }` descriptors from the `MSG_LIST_ITEMS` enriched response, so `_cachedOpenTabsById.get(targetTabId).tabIndex` correctly resolves the strip-absolute index. ✓

**Fix B — cross-window REJECT preservation (checklist 8).** Verified at `sidepanel.js:4706-4709`. The guard returns BEFORE `_computeStripInsertIndex` is invoked at line 4732. T4 (`tests/b134-tab-drag-reorder.test.js:1626-1638`) source-text-pins the ordering with a regex that anchors `case 'REORDER_OPEN'` → `pendingTargetWindowId !== state.sourceWindowId` → `showToast` → `return;` BEFORE `_computeStripInsertIndex`. A future edit reordering the guard would fail T4. ✓

**Fix B — test mappings (checklist 9).** T1 (zero claims) / T2a (N=1) / T2b (N=3, exact user-bug repro) / T2c (N=10, forward + backward) / T3 (drop-at-end) / T4 (cross-window source-text pin) / T5 (helper exists + invocation pin). End-to-end via `chrome.tabs.move` + `chrome.tabs.onMoved` listener at T1, T2b, T3 — proving the translated index round-trips through the live-mock correctly. The local `computeStripInsertIndexAlgorithm` replica at lines 1402-1420 is byte-equivalent to the production helper at `sidepanel.js:6439-6459`; future divergence is caught by the FixB-T5 source-text pin (lines 1640-1664) which asserts the production helper's body still contains `dPos < S`, `openTabsByWindow.get`, `_cachedOpenTabsById.get`. ✓

**Cross-cutting checklist 10 (no TODOs / commented-out / console.log debug noise).** Pass. Two `console.warn` calls at `tab-events.js:244` and `:318` are sanctioned per spec and match sibling-handler precedent at `:237` and `:281`. Zero `console.log`, zero TODOs, zero commented-out code blocks introduced by either fix.

**Cross-cutting checklist 11 (`manifest.json` unchanged).** Pass. `git diff HEAD -- manifest.json` is empty.

**Cross-cutting checklist 12 (B-118 source-citation hygiene).** Pass. Both fixes carry comments citing the spike findings file (`docs/findings/post-s41-pre-merge-triage.md`) and the relevant precedents (B-141 self-application in Fix A, B-134 latent-bug-surfaced-by-B-136 attribution in Fix B). The `floating-groups.js:680-696` JSDoc explains the failure mode with file:line references; the `sidepanel.js:4715-4731` block comment in Fix B's dispatch site is similarly thorough. Comments are explanatory rather than commented-out code.

**Cross-cutting checklist 13 (DRY).** Pass with the L-1 LOW-priority note above. The two helpers (`pruneFloatingGroupsByParentItemId` and `pruneFloatingGroupsByLiveTabId`) share the writeTransaction-filter scaffold but differ in fast-path strategy. Fix A and Fix B touch independent surfaces (SW-side storage cascade vs. sidepanel-side index translation) — no consolidation opportunity between them.

**Test suite regression check.** `npm test` reports 1812 pass / 0 fail / 0 skip. Zero regressions. The 13 new tests (T34-T39 + FixB-T1-T2a-T2b-T2c-T3-T4-T5) all pass. The pre-existing AC4 storage-write invariant test (`tests/tab-events-no-storage-write.test.js`) continues to pass — proving Fix A's read-only fast-path correctly preserves the AC4 contract.

### Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 2 (both deferrable / informational) |

Both Fix A and Fix B are surgically scoped, structurally correct, defensively coded, and follow established project patterns. The two LOW-priority observations are informational only and not blocking. Approved for merge from `[code-reviewer]`.

_Review completed by [code-reviewer] on 2026-04-29 against `feature/sprint-41-floating-tab-id` working-tree diff._
