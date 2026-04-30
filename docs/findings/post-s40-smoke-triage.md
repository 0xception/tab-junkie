# Post-S40 Smoke-Test Triage — R0 Discovery Spike

_Pre-created 2026-04-30 for the post-v1.34.0 ship triage of 3 product-owner-reported issues:_

1. **Issue 1**: drag-reorder of Open Tab items in sidepanel does NOT reorder items in the list (B-134 op 1 broken in user-visible behavior)
2. **Issue 2**: opening a new tab from a bookmark within a group sometimes shows a SIBLING ITEM TITLE in the floating-tab row (e.g., GitLab Merge-Requests row appearing where a YouTube tab was opened) — contradicts B-131 wontfix-not-repro verdict; real cross-record displacement.
3. **Issue 3**: drag-reorder of floating tabs WITHIN a group fails with the toast `"Floating-tab list changed during drag — please retry."` despite Wave 3a H-1 (content-conditional gen bumps via signature setter guards).

User strategic framing: "determine how much of these issues are related to bugs/race conditions, or if they are deeper data model issues and if a updated data model would make tracking these values more stateful".

---

## Issue 1 — Open Tabs drag-reorder no-op

### Failure mechanism (with file:line)

**Top cause (HIGH confidence): `chrome.tabs.onMoved` is never registered.** The drop-handler dispatch is fine; the `LiveTabIndex` does not learn about the reorder, so the next `MSG_LIST_ITEMS` rebuild returns Open Tabs in the OLD order, the cache signature does not change, and no broadcast/patch updates the DOM.

Code trace:

- `sidepanel/sidepanel.js:4714` — drop handler dispatches `await chrome.tabs.move(state.draggedTabId, { index: state.pendingInsertIndex });` for `case 'REORDER_OPEN'`. **This call DOES execute** — Chrome reorders the tab in the browser tab strip. (User report says "browser tab strip is also unchanged" but I believe this is observation noise — see below.)
- `background/tabs/tab-events.js:41-353` — the listener registration block. **There is NO `chrome.tabs.onMoved.addListener(...)` call anywhere in the file.** Confirmed by `grep -rn "onMoved\|tabs\.onMoved" background/` returning zero hits. The handler block registers `onUpdated`, `onCreated`, `onActivated`, `onRemoved`, `onDetached`, `onAttached`, `windows.onCreated`, `windows.onFocusChanged`, `windows.onRemoved` — but never `onMoved`.
- `background/tabs/live-tab-index.js:14-37` — `LiveTabIndex` is built once on cold start from `chrome.tabs.query({})`. Each entry carries `index` (the per-window tab position). After the missing onMoved, this index value goes stale on every move.
- `background/tabs/open-tabs.js:34-63` — `buildOpenTabs` reads `LiveTabIndex` and sorts by `(windowId, tabIndex)`. Because the indices are stale, the sort produces the SAME order as before the move.
- `sidepanel/sidepanel.js:266-282` — `_openTabsSignature` returns `windowId:tabId` per row, joined `|`. With the stale-but-unchanged index sort, the array order is byte-identical to the previous render → `_cachedOpenTabsGen` does NOT bump → no patch path runs.

Note on the "browser tab strip also unchanged" observation: `chrome.tabs.move` is a real Chrome API; if Chrome did NOT actually reorder the tab strip, the unit test mock would diverge from real Chrome and we'd see other failures. The likelier interpretation is that the user observed the SIDEPANEL (which is showing stale order) and inferred the strip was unchanged because the strip's tab-bar visual indicator doesn't draw a strong reorder cue. Confirming this is a UAT step (open the test build, drag a tab in the panel, watch the actual browser tab strip).

### Classification

**(a) Localized bug** — single missing event listener registration. Bounded fix. ~10 LOC.

### Test gap (significant)

`tests/b134-tab-drag-reorder.test.js:132-145` — T1 just asserts `chrome.tabs._moveCalls` records the call. There is **no test that asserts `LiveTabIndex` is updated after a move, nor that subsequent `buildOpenTabs` returns a different order**. This is exactly the contract the missing listener delivers.

The chrome-mock at `tests/chrome-mock.js:215-234` also does not synthesize `onMoved` events when `tabs.move` is called — and `onMoved` is not even in the mock's event-mock object list (line 242-249). This is consistent with the production-code gap; tests using the mock cannot catch the missing listener because the mock has no event to fire and no assertion plumbing to surface its absence.

### Fix sketch (~30 LOC across 2 files)

1. `background/tabs/tab-events.js` — add `chrome.tabs.onMoved.addListener((tabId, moveInfo) => { ... })`. Body must:
   - Update the moved tab's `index` and `windowId` in `LiveTabIndex` via `updateTabEntry`.
   - Reflow sibling indices in the affected window: every other tab in `windowId === moveInfo.windowId` shifts by +1 if it was below the new position and above the old, or -1 if vice versa. Chrome's onMoved fires AFTER the strip already re-numbered, so the simplest implementation re-queries `chrome.tabs.query({ windowId: moveInfo.windowId })` and patches all `LiveTabIndex` entries for that window to match.
   - Broadcast `SCOPE.LIVE_STATE` with reason `tab/moved` + `requireClaimsReady: true`.
2. `tests/chrome-mock.js` — add an `onMoved` event-mock and fire it from `tabs.move` after the index update, and reflow sibling indices for parity with real Chrome.
3. `tests/b134-tab-drag-reorder.test.js` — add T1.5: drag tab from index 2 → index 0, await broadcast, assert `buildOpenTabs` returns `[tab102, tab100, tab101]` not `[tab100, tab101, tab102]`.

Files affected: `background/tabs/tab-events.js`, `tests/chrome-mock.js`, `tests/b134-tab-drag-reorder.test.js`. ~30–40 LOC total.

---

## Issue 2 — Sibling-title displacement (B-131 recurrence)

### Failure mechanism (with file:line)

**The `(windowId, tabIndex)` position-heuristic join in `buildFloatingMembers` mis-resolves to a DIFFERENT live tab than the floating-group record was originally created for.** The metadata of one record bleeds onto the wrong tab via the live-index join.

Code trace:

- `background/tabs/floating-members.js:90-110` — for each record in `tj:floatingGroups`:
  ```js
  // POSITION MATCH first
  let matchedTabId = null;
  for (const [tabId, entry] of liveIndex) {
    if (entry.windowId === record.windowId && entry.index === record.tabIndex) {
      matchedTabId = tabId;
      break;
    }
  }
  // URL FALLBACK
  if (matchedTabId === null) {
    const normalizedStored = safeNormalizeForMatch(record.url);
    if (normalizedStored) {
      for (const [tabId, entry] of liveIndex) {
        if (safeNormalizeForMatch(entry.url) === normalizedStored) { matchedTabId = tabId; break; }
      }
    }
  }
  ```
- `background/tabs/floating-members.js:124-134` — once `matchedTabId` is resolved, the descriptor is built from `liveEntry`'s `title`, `favIconUrl`, `audible`, `active`. So the row's USER-VISIBLE TITLE comes from the LIVE-INDEX entry's title, which is the title of WHATEVER tab won the position match.

Reproduction scenario (concrete):

1. User has saved bookmark inside group "CODE" (parent item id `I-CODE-1`, URL `gitlab.example.com/.../merge_requests`).
2. User middle-clicks a YouTube link from inside that bookmark's tab → opener-chain inheritance fires → `tab-events.js:156-163` calls `appendFloatingGroup({ groupId, parentItemId: 'I-CODE-1', windowId, tabIndex: <new tab's index>, url: <YouTube>, savedAt })`. The record correctly captures `floatingTabId: ulid()` AND captures the YouTube tab's then-current `(windowId, tabIndex)`.
3. The user (or Chrome) closes/reorders/reloads in a way that causes the YouTube tab's index to change OR a different tab to occupy the recorded `(windowId, tabIndex)` cell.
4. On the next `MSG_LIST_ITEMS` dispatch, `buildFloatingMembers` runs. The position match finds a **DIFFERENT** tab at the recorded `(windowId, tabIndex)` — the GitLab tab itself, OR another sibling.
5. The render path emits a row with `parentItemId: 'I-CODE-1'` but `title: <GitLab title>`, `tabId: <GitLab tabId>`, `url: <GitLab URL>`. **Visually**: a row in the CODE group whose title is "Merge requests · ...". User sees a phantom-titled "floating tab" that points to a real, non-floating-related sibling.

The `floatingTabId: ulid()` written by `appendFloatingGroup` (`floating-groups.js:189-197`) is the storage IDENTITY but is NEVER consulted as a join key during rendering. It is only used as a prune key in `pruneResolvedFloatingGroups` (`floating-groups.js:519`) and as a preservation token in `moveFloatingTab` (`floating-groups.js:437-440`). The fragile geometry-based join is the actual run-time identity.

The dedup at `floating-members.js:118-119` (matchedTabIds set) fires only when MULTIPLE records resolve to the same tabId — it does not detect cross-record contamination at all (one record correctly picks tab A, the OTHER record incorrectly picks tab B which happened to occupy the recorded cell).

The B-134 reorder/move helpers (`floating-groups.js:254-266`, `_resolveRecordIndexByTabId`) ALSO use the `(windowId, tabIndex)` geometry join: `if (rec.windowId === live.windowId && rec.tabIndex === live.index) return i;`. This means every storage write from B-134 (reorder, ATTACH, DETACH, MOVE_FLOATING) is keyed on the same fragile geometry — they inherit Issue 2's failure mode.

### Classification

**(c) Data-model gap.** The `floatingTabId` ulid was added in B-121 specifically to be a stable record identity, but the run-time render/match path never adopted it as a join key. Layering more filters/heuristics on top of the position-join is patch-work; the proper fix is to record the actual `tabId` (or the `floatingTabId` paired to a tabId at write time) and join on that.

This is NOT a localized bug. The `(windowId, tabIndex)` position-join is structural across:
- `floating-members.js:90-97` (render path)
- `floating-groups.js:124-130` (cold-start re-association)
- `floating-groups.js:254-266` (B-134 `_resolveRecordIndexByTabId`)
- `floating-groups.js:592-625` (`preMarkInheritedFromFloatingGroups` — B-132)

All four sites would need to migrate together (or a single live `floatingTabId → tabId` mapping built once per dispatch could feed them all).

### B-131 verdict re-evaluation

The Wave-0 wontfix-not-repro verdict was **WRONG** for the following reasons:

1. **Wave-0 scope error**: my static-analysis verdict examined `tabId`-keyed direct lookups (claims, drift, opener) but did not enumerate the `(windowId, tabIndex)`-keyed join in `buildFloatingMembers`. That heuristic is the actual cross-record-contamination surface and was unaudited.
2. **B-131's symptom shape was misread**: I assumed "sibling title shows in floating row" implied a tabId mix-up at the live-index level. It is instead a record-to-tab JOIN mistake at the resolver level. Two records → one wrong tab is reachable; the dedup at line 118-119 prevents two-records-to-one but never inspects whether the resolved tab matches the record's INTENT.
3. **Live evidence**: the user's screenshot shows a YouTube-sourced floating-row resolving to a GitLab title under group CODE — exactly the shape predicted by the position-join failure.

**Recommendation**: re-open B-131 OR — preferred — file a new item that subsumes B-131 and its B-134 inheritance. The new item is a data-model evolution; B-131's original scope was "fix the symptom"; the underlying problem requires a contract change.

### Fix sketch

**Strategy**: store `tabId` AT THE TIME OF WRITE on each `tj:floatingGroups` record in addition to `(windowId, tabIndex, url)`. The `tabId` is ephemeral (not stable across browser restart) but **stable for the live session**. On the runtime path, the join becomes:

```
1. Direct tabId lookup: liveIndex.has(record.liveTabId) → return entry.tabId
2. Cold-start fallback (record.liveTabId no longer in liveIndex):
   a. POSITION match  (existing)
   b. URL fallback    (existing)
3. Stale tabId on a fresh session → record's liveTabId is rewritten to match
   the resolved tab.
```

The cold-start fallback re-uses the existing position+URL match, but the live-session render path becomes O(1) per record AND keeps record-to-tab identity stable across all in-session tab moves. Issue 2's failure mode (mid-session position change) becomes impossible because the join no longer depends on `(windowId, tabIndex)`.

Files affected:
- `background/tabs/floating-members.js` — add tabId direct-lookup path before position match.
- `background/tabs/floating-groups.js` — `appendFloatingGroup` writes `liveTabId`; `_resolveRecordIndexByTabId` becomes a one-liner; `reassociateFloatingGroups` (cold-start) keeps the existing position+URL fallback and rewrites `liveTabId` on resolve.
- `background/storage/shapes.js` — schema bump (PARTITION_FLOATING_GROUPS v3 → v4) with `liveTabId?: number`.
- `background/storage/migration.js` — `KNOWN_VERSION` bump per C-1a; lazy-migration step (existing v3 records have no `liveTabId` until first session-rewrite).
- `tests/` — new tests for the join-priority order, plus a regression test reproducing the YouTube-tab-resolves-to-GitLab-title case using a deliberate position-collision fixture.

LOC estimate: ~120 production + ~60 test. This is structural — could be M tier if the lazy-migration is acceptable; bumps to L if a synchronous backfill is added.

---

## Issue 3 — Floating reorder race despite H-1

### Failure mechanism (with file:line)

**Hypothesis (MEDIUM confidence): the SW-side handler fails — it returns `{ reordered: false, reason: 'ERR_RACE' }` — NOT the sidepanel-side Guard B.** The Wave-3a H-1 fix correctly addressed Guard B (the in-memory generation counters), but the toast text is `"Floating-tab list changed during drag — please retry."` which is the same text the sidepanel uses for `resp.reason === 'ERR_RACE'` from the server-side response (line 4731-4733).

Re-reading the toast trigger:

```js
// sidepanel/sidepanel.js:4727-4737
const resp = await sendMessage(MSG_REORDER_FLOATING_MEMBERS, { ... });
if (resp && resp.reordered === false) {
  if (resp.reason === 'ERR_RACE') {
    showToast('Floating-tab list changed during drag — please retry.');
  } else {
    showToast('Couldn't reorder tabs — please retry.');
  }
}
```

The `reason: 'ERR_RACE'` is set by the SW handler in `storage-handlers.js:710-712` when `reorderFloatingMembers` returns `false`. That helper returns `false` from `floating-groups.js:285-322` for these triggers:

1. `_resolveRecordIndexByTabId(records, id, groupId, liveIndex)` returns -1 — meaning a tab in the client's `orderedTabIds` has no corresponding record at the live `(windowId, tabIndex)`.
2. `storageBucketSize !== supplied.size` — the SW's count of records for `groupId` doesn't equal the client's count.

**The most likely trigger**: `_resolveRecordIndexByTabId` fails because the SW's `LiveTabIndex` carries DIFFERENT `(windowId, tabIndex)` values than the client expects, OR the storage records have not been kept in sync with the live indices.

This dovetails directly into Issue 1's root cause — **the missing `chrome.tabs.onMoved` listener means `LiveTabIndex.entry.index` goes stale every time the user reorders a tab in the strip**. If the user reorders an Open Tab AT ALL between sidepanel mount and the floating-tab drag, the SW's `LiveTabIndex` is now out-of-sync with the records' `(windowId, tabIndex)`. The position-match at `_resolveRecordIndexByTabId:261-263` cannot find the record, returns -1, and the helper returns `false`. The user sees the "list changed" toast even though no list change happened.

Issue 3 may therefore be **a symptom of Issue 1**, not an independent race. Once `onMoved` is registered AND the records carry a stable join key (Issue 2's fix), this entire failure mode collapses.

### Classification

**(b)/(c) Cache-invalidation contract issue chained to data-model gap.** Once Issue 1 is fixed AND Issue 2's data-model evolution is shipped, Issue 3 should disappear because the storage-side join becomes stable and decoupled from `LiveTabIndex.entry.index`.

If we were to fix Issue 3 in isolation: it would require strengthening `_resolveRecordIndexByTabId` to fall back to URL match (mirroring `floating-members.js`), and to retry once after re-reading `LiveTabIndex`. That's a band-aid; the underlying contract is wrong.

### Test gap

`tests/b134-tab-drag-reorder.test.js` — test T6 (around line 290+) for `MSG_REORDER_FLOATING_MEMBERS` exists but the chrome-mock doesn't reproduce real-Chrome's index-reflow on `tabs.move`, so any test that combines an `Open-Tabs reorder` + `floating reorder` would silently pass. Tests cannot reproduce the real-Chrome state where `LiveTabIndex.entry.index` is stale.

Adding a test gap: a regression test that calls `chrome.tabs.move(101, { index: 0 })`, simulates the missing onMoved (or — once fixed — relies on it), then calls `MSG_REORDER_FLOATING_MEMBERS` and asserts `reordered: true`.

### Fix sketch

If pursued AS A STANDALONE band-aid (not recommended):
- `floating-groups.js:_resolveRecordIndexByTabId` — add URL-match fallback.
- `floating-groups.js:reorderFloatingMembers` — if the parity-check fails, refresh records and retry once before returning false.

Recommended: don't fix this in isolation. Roll Issue 1 + Issue 2 together; Issue 3 should resolve as a consequence.

---

## Strategic recommendation

### Recommended option: **B — Mixed: v1.34.1 hotfix for Issue 1 + Sprint 41 anchor for Issues 2/3 (data-model evolution)**

**Justification**: Issue 1 is a clean, contained bug — a single missing event listener — with high user-visible impact. It should ship in a hotfix patch within days, not wait for the data-model refactor. Issues 2 and 3 share root cause (`(windowId, tabIndex)` position-join) and demand a unified fix; bundling them prevents the risk that Issue 2's fix silently breaks Issue 3 or vice-versa.

The cost of NOT bundling Issues 2/3:
- The data model gap surfaces as one symptom today (Issue 2). Future user actions that disturb tab indices (group operations, tab dragging in the strip while floating-tab events are in flight, browser-managed tab pinning, opener-chain spawning) all create new symptom-shapes from the same root. We will keep filing duplicates.
- The `floatingTabId` ulid already exists in storage but is dead weight without joining-by-it. The longer we delay, the more code paths assume the position-join works.

The cost of NOT shipping Issue 1 as hotfix:
- Open-Tabs drag-reorder is a flagship S40 feature. Shipping it broken on user-facing v1.34.0 is reputational risk for the v2 ship.
- Fix is small, low-risk, mechanically obvious. Holding it for S41 has no upside.

### Item filings recommended

| Item | Priority | Tier | Title | Rationale |
|---|---|---|---|---|
| **B-136** | **P0** | **Fast Track (S)** | **Register `chrome.tabs.onMoved` listener — restore B-134 op 1 reorder behaviour** | Hotfix; ~30 LOC including tests + chrome-mock parity. Drives v1.34.1 release. |
| **B-137** | **P1** | **Full (M)** | **`tj:floatingGroups` schema v4 — add `liveTabId` + adopt as primary join key (closes B-131 + Issue 3)** | Sprint 41 anchor. Subsumes original B-131 scope; eliminates `(windowId, tabIndex)` brittleness across `buildFloatingMembers`, `_resolveRecordIndexByTabId`, `reassociateFloatingGroups`, `preMarkInheritedFromFloatingGroups`. Schema bump per C-1a; lazy migration acceptable per C-1b. |
| **B-138** | **P2** | **Fast Track (S)** | **Reposition existing `(windowId, tabIndex)` callers to consume the v4 mapping** | Cleanup item once B-137 ships; can fold into B-137 if scope permits. |

Mark **B-131 as `superseded-by: B-137`** in BACKLOG.md (do not re-open with no scope change). The fresh ticket carries the B-131 user story.

### Risk of not doing data-model review now

If B-137 is deferred past Sprint 41:
- Issue 2 will continue to surface (any opener-chain spawn that lands in a position later occupied by a sibling tab — common in browser-restart scenarios, tab-strip user reorders, group-prune scenarios).
- Issue 3 will continue to surface for the same reason — and we cannot ship a complete fix for Issue 3 without addressing the join key.
- Every subsequent feature that touches `tj:floatingGroups` (e.g., the cross-window B-135 stub on the backlog) inherits the brittle join. The cost compounds.
- We will accumulate band-aid fixes (URL-match fallback in `_resolveRecordIndexByTabId`, retries in handlers, dedup expansion in `buildFloatingMembers`) that obscure the core contract.

### Estimated sprint shape

**Sprint 41 (proposed)** — 2-week sprint, target capacity ≈ 8-10 effort points.

| Slot | Item | Effort | Tier | Status |
|---|---|---|---|---|
| Hotfix (week 0) | **B-136** | S (1-2 days) | Fast Track | Ship v1.34.1 ASAP |
| Anchor | **B-137** | M (5-7 days) | Full pipeline | Sprint 41 main item; data-model evolution |
| Quality-of-life | (existing backlog) | M | Full | Pull from S41 candidate list as capacity allows |
| Carryover risk | Issue 3 confirm + close | XS | post-B-136 + B-137 verification | Sprint-end confirm |

### Anything that should escalate

**Sprint 40 R4 review process gap**: B-134 R3 introduced `_resolveRecordIndexByTabId` using the same brittle `(windowId, tabIndex)` join that already had a known failure mode (B-131). The Wave-0 verify-first verdict on B-131 — "wontfix-not-repro" — closed BEFORE B-134's storage-write helpers were authored. The B-134 R4 reviewers (`docs/findings/sprint-40.md`) raised H-1, H-2, H-3, H-4 around drag-zone hit-test + indicator math but did NOT flag the join-key inheritance from `buildFloatingMembers`. **Recommendation**: add an R2 architecture-review check that any new code touching `tj:floatingGroups` consult the same join-key heuristics already in use — and flag the position-heuristic as a known fragility in the chapter for B-121 (§60).

The `chrome.tabs.onMoved` gap also reveals an R0 spike-coverage gap: B-134's R2 architecture chapter (`docs/design/63-…`) prescribed `chrome.tabs.move` as the dispatch mechanism but did not enumerate "what populates LiveTabIndex.index after the move?" as an architectural concern. **Recommendation**: when an R2 design adopts a Chrome API, the C-3 (cold-start safe) and a new check (call-it C-13: "Chrome event-feedback completeness — every API write call must have a corresponding event listener that updates the in-memory mirror") should be applied.

---

_Spike completed by [solution-architect] on 2026-04-30. No code modified; no test changed; no BACKLOG/SPRINT updates. Output is this findings file only._

---

## [code-reviewer] — B-136 R4 (Fast Track)

**Reviewed:**
- `background/tabs/tab-events.js` (uncommitted diff — +53 LOC, new `chrome.tabs.onMoved` listener at lines 354–405)
- `tests/chrome-mock.js` (uncommitted diff — `tabs.move` mock now renumbers siblings + fires `onMoved`; new `tabs.onMoved` event channel; `__resetMock` clears `onMoved._listeners`)
- `tests/b134-tab-drag-reorder.test.js` (uncommitted diff — T1 extended to assert post-move LiveTabIndex + `buildOpenTabs` ordering; 4 new T1b tests for forward/backward/cross-window-isolation/no-op)

**Test suite:** `node --test tests/b134-tab-drag-reorder.test.js` — 36/36 PASS (T1 extended + T1b×4 added; existing T2–T31 unchanged and green).

---

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM
_None_

### LOW
_None_

### Notes / observations

- **Architecture / patterns:** New `onMoved` listener mirrors the surrounding listeners in `tab-events.js` (`onUpdated:47-118`, `onActivated:192-203`, `onAttached:343-352`) — same shape: payload-shape guards, `getLiveTabIndex()` read, per-entry `updateTabEntry` patches, single `broadcast(SCOPE.LIVE_STATE, 'tab/<verb>', { requireClaimsReady: true })` at the end. The `for (const [id, entry] of index)` iteration with `id !== tabId` skip and `entry.windowId === windowId` filter is structurally identical to the deactivate loop in `onActivated:194-199`. Consistent house style.

- **Local-renumber correctness:**
  - Forward (`fromIndex < toIndex`): condition `entry.index > fromIndex && entry.index <= toIndex` matches the half-open interval `(fromIndex, toIndex]` and shifts each by `-1`. Worked example: from=0, to=2 → indices 1 and 2 shift to 0 and 1; moved tab takes index 2. Asserted by T1b forward test (PASS).
  - Backward (`fromIndex > toIndex`): condition `entry.index >= toIndex && entry.index < fromIndex` matches `[toIndex, fromIndex)` and shifts each by `+1`. Worked example: from=2, to=0 → indices 0 and 1 shift to 1 and 2; moved tab takes index 0. Asserted by T1b backward test (PASS).
  - No off-by-one. The `if (otherTabId === tabId) continue` early-skip prevents double-mutation of the moved tab itself.
  - Cross-window guard `entry.windowId !== windowId continue` correctly scopes the renumber to the same window (since Chrome only fires `onMoved` for same-window moves). T1b cross-window-isolation test confirms.
  - No-op guard `if (fromIndex === toIndex) return` correctly short-circuits before any iteration. T1b no-op test confirms.

- **DRY:** No new helper extraction warranted. The renumber loop is 6 lines × 2 branches; abstracting into a shared `shiftSiblingIndices(windowId, range, delta)` helper would obscure the directionality of the predicate (forward = `>` and `<=`, backward = `>=` and `<`) without saving meaningful LOC. The two branches are intentionally symmetric and easy to audit at a glance.

- **Performance:** O(window-size) per move, single in-memory pass over `LiveTabIndex`. Comment at `tab-events.js:374-375` explicitly justifies "synchronous + O(window-size) — matches the in-memory cost of `onUpdated`. Avoids the extra `chrome.tabs.query` await." Bounded by typical 50–100 tabs per window. No storage I/O, no SW-cold-start path. Confirmed.

- **Dead code / commented-out / TODOs / `console.log`:** None. The listener body is straight-line code; comments at `:354-376` are reference documentation citing Chrome docs URL, the `open-tabs.js:34-63` source citation per B-118, and the spike findings file. No noise left behind.

- **Broadcast scope:** `SCOPE.LIVE_STATE` + `requireClaimsReady: true` matches every other LiveTabIndex-mutating broadcast in the file (`tab/updated:112`, `tab/created:138`, `tab/activated:202`, `tab/removed:220, 303`, `tab/attached:350`, `window/blurred:240`, `window/focused:257, 260`). The `requireClaimsReady` gate is correct because `buildOpenTabs` returns `[]` until claims are reconciled (see `open-tabs.js:35`); broadcasting `tab/moved` before claims-ready would force consumers to no-op anyway.

- **B-118 source-citation hygiene:** Listener docblock cites `background/tabs/open-tabs.js:34-63` for the `buildOpenTabs` failure mode and `docs/findings/post-s40-smoke-triage.md` Issue 1 for the full failure trace. Both citations verified — `buildOpenTabs` is exactly at lines 34-63 and Issue 1 is the spike-origin finding. Gate satisfied.

- **Test quality — T1 extension (b134 line ~135-148):**
  - Now registers the SW-side listener via `registerTabEventListeners(Promise.resolve())` and seeds claims via `await reconcileClaims([])` so `buildOpenTabs` returns non-empty (gated on `isClaimsReady`).
  - Asserts `chrome.tabs._moveCalls` (preserved B-134 contract), then `LiveTabIndex.get(tabId).index` for the moved tab AND each sibling (B-136 AC2), AND `buildOpenTabs().map(t => t.tabId)` order (B-136 AC3). Three-level assertion is the right end-to-end coverage for Issue 1.

- **Test quality — T1b ×4 (lines ~159-244):**
  - Forward (line ~166): tab 100 (idx 0) → idx 2; verifies siblings 101, 102 shift 1→0, 2→1, and moved tab lands at 2.
  - Backward (line ~185): tab 202 (idx 2) → idx 0; verifies siblings 200, 201 shift 0→1, 1→2, and moved tab lands at 0.
  - Cross-window isolation (line ~204): two windows × two tabs each; moves a tab inside window 1 and asserts window 2 indices are untouched. Properly exercises the `entry.windowId !== windowId continue` guard.
  - Same-position no-op (line ~227): `fromIndex: 0, toIndex: 0`; asserts state is unchanged. Properly exercises the `if (fromIndex === toIndex) return` guard.
  - Each T1b test bypasses `chrome.tabs.move` entirely and directly invokes `chrome.tabs.onMoved.__fire(tabId, moveInfo)` — this isolates the listener body as the unit under test (independent of the chrome-mock's `move` implementation). Good test-isolation hygiene.

- **chrome-mock changes — `tabs.move` realism:** The mock now renumbers same-window siblings before firing `onMoved`, matching Chrome's actual reorder semantics. `tabs.onMoved.__fire(tab.id, { windowId: fromWindowId, fromIndex, toIndex })` payload shape matches Chrome's documented `onMoved` event. Cross-window branch retains the prior B-134 behaviour (record index/windowId without firing `onMoved`) — correct, since Chrome dispatches `onDetached`/`onAttached` for cross-window moves. `__resetMock` is updated to clear `tabs.onMoved._listeners` (line 363) — listener accumulation across `beforeEach`-driven test runs is prevented.

- **Listener-registration discipline:** Each B-136 test calls `registerTabEventListeners(Promise.resolve())` after `__resetMock` clears the listener arrays. The `beforeEach` at `b134-tab-drag-reorder.test.js:124-128` calls `__resetMock()` first, so listeners do not double-register across tests. Verified by the 36/36 green run — if listeners had accumulated, the renumber loop would fire multiple times per `onMoved` and the assertions would fail.

- **Net assessment:** Surgical hotfix is clean. ~30 LOC of new SW listener code + symmetric ~35 LOC of mock parity + 5 test cases (1 extended + 4 new). Mirrors existing patterns, satisfies B-118 source-citation gate, satisfies the spike's prescribed local-renumber strategy, and the test extension proves the failure mode (Issue 1) is fixed end-to-end (LiveTabIndex stale → fresh, buildOpenTabs stale-sort → fresh-sort). No CRITICAL/HIGH/MEDIUM/LOW findings. **Recommend PROCEED — no R3 fix-cycle required.**

---

## [security-reviewer] — B-136 R4 (Fast Track)

**Branch**: `hotfix/v1.34.1-b-136`
**Diff scope**: `background/tabs/tab-events.js` (+53), `tests/chrome-mock.js` (+38, -3), `tests/b134-tab-drag-reorder.test.js` (+101, -1)
**Reviewer**: [security-reviewer]
**Date**: 2026-04-29

### Verdict: **CLEAN** — no security findings (CRITICAL / HIGH / MEDIUM / LOW: none)

### Checklist results

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | Manifest / permissions change | **NO** | `git diff HEAD manifest.json` is empty. `tabs` permission already on the allow-list at `manifest.json:6` and covers `chrome.tabs.onMoved`. No new permission required. |
| 2 | CSP / `eval` / `new Function` / `innerHTML` / `outerHTML` | **NO** | Diff is pure listener registration + Map iteration + `updateTabEntry()` calls. Zero string-to-code or DOM-write surfaces introduced. |
| 3 | New storage write surface | **NO** | Listener body writes only to in-memory `LiveTabIndex` via `updateTabEntry()` (`background/tabs/live-tab-index.js:52`). No `chrome.storage` write. No new partition key. `claimsMirror`, `inheritedTabs`, and `tj:drift` are untouched. |
| 4 | Message-passing / new contract | **NO** | Reuses existing pattern: `broadcast(SCOPE.LIVE_STATE, 'tab/moved', { requireClaimsReady: true })`. Event name `'tab/moved'` is new but follows the established `'tab/<verb>'` convention used by `'tab/created'`, `'tab/updated'`, `'tab/removed'`, etc. (`background/tabs/tab-events.js:138, 220, 202`). No new sender/receiver shape; downstream `LIVE_STATE` consumers already handle ack-only broadcasts. |
| 5 | `textContent` vs `innerHTML` for user strings | **N/A** | Listener does not touch DOM; no string interpolation into HTML at all. Tab `url` / `title` strings are not even read by this code path — only `windowId`, `fromIndex`, `toIndex` (all numbers). |
| 6 | Network / telemetry / `console.log` | **NO** | Zero `fetch`, `XMLHttpRequest`, `console.*` calls in the diff. Listener is fully offline / silent. |
| 7 | Listener payload validation | **PASS — defensive guards present** | Lines 380-383: `if (!moveInfo \|\| typeof moveInfo.windowId !== 'number') return;` and `if (typeof moveInfo.fromIndex !== 'number' \|\| typeof moveInfo.toIndex !== 'number') return;` correctly reject malformed payloads. Even though Chrome is the trusted dispatcher, this matches the project's established defensive posture (cf. C-3 cold-start safety). The `if (fromIndex === toIndex) return;` early-out at line 385 also avoids spurious renumber loops on degenerate input. |
| 8 | Race condition: onMoved vs onRemoved | **PASS — no exploitable window** | `chrome.tabs.onRemoved` (`background/tabs/tab-events.js:208-224`) calls `removeTabEntry(tabId)` and Chrome guarantees event ordering (a closed tab cannot subsequently be moved). If `onRemoved` were to race ahead of an already-queued `onMoved`, `updateTabEntry()` (`background/tabs/live-tab-index.js:52-68`) gracefully creates a new partial entry rather than throwing — at worst a transient stale entry is re-created in-memory and is reaped on the next `pruneStaleTabs` pass. No persistent state corruption, no claim leak (claims are released by `releaseClaimByTab` in the `onRemoved` path independently of `LiveTabIndex`). Acceptable. |
| 9 | Drift / claims / floating-groups interaction | **NO** | Listener does not touch `claimsMirror` (`background/tabs/tab-claims.js`), `inheritedTabs` set, `tj:drift` partition, or `tj:floatingGroups` records. It is a pure index-position update for the open-tabs list. Claim reconciliation is gated downstream via `requireClaimsReady: true` on the broadcast — the same gating used by every other `LIVE_STATE` event in this file. The position-join brittleness flagged for B-137 is unchanged by this hotfix (correctly out of scope). |

### Additional observations

- **Mock parity**: `tests/chrome-mock.js` extends `chrome.tabs.move` to dispatch `onMoved` with the same fromIndex/toIndex shift semantics the production listener mirrors. The mock and the listener share the same iteration pattern (`if t.index > fromIndex && t.index <= toIndex`) for forward moves and `if t.index >= toIndex && t.index < fromIndex` for backward moves — these match Chrome's documented shift behaviour. Symmetric mock + production logic minimizes the risk of test-only false-positives.
- **Cross-window safety**: The local-renumber loop guards on `entry.windowId !== windowId` (lines 388, 397). Cross-window drags fire `onDetached`/`onAttached` (lines 329, 343), not `onMoved` — so the windowId scoping correctly prevents the renumber from leaking into other windows. The new test `B-136 T1b (AC2): chrome.tabs.onMoved listener ignores cross-window siblings during local renumber` exercises this path.
- **No log noise**: Listener does not emit any `console.warn`/`console.log`. Consistent with the production-no-PII rule (`url`/`title` are not even referenced).

### Conclusion

B-136 is a textbook listener-registration hotfix with a near-zero security threat surface. No CRITICAL / HIGH / MEDIUM / LOW findings. Approved for [code-reviewer] sign-off and R5 test-suite confirmation.

