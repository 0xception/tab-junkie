# R4 Findings Log

Deduplicated R4 review findings, persisted here to survive context window compaction.
Updated by [scrum-master] after each R4 review round.

---

## Sprint 1 — B-001a R4 Findings (Deduplicated)

**Reviewed by:** [code-reviewer] · [security-reviewer] · [qa-reviewer]
**Date:** 2026-04-15
**Totals:** C=2 · H=7 · M=9 · L=9

---

### CRITICAL (must fix before R5)

| # | File:line | Source | Finding | Fix |
|---|---|---|---|---|
| C1 | `background/storage/partitions.js:202` | code-reviewer | `initializePartitions()` does a bare `chrome.storage.local.set` outside `writeTransaction` → violates AC6 ("writeTransaction is the only write path"). Quota/partial-write failures here are unguarded. | Route init through `writeTransaction` with one multi-partition op. |
| C2 | `background/storage/items.js:29-31` | qa-reviewer | `createItem({groupId: 'non-existent-id'})` is silently accepted — `validateNewItem` only type-checks. Creates dangling FK / silent data corruption. | Validate `groupId` against the groups partition inside the mutator (within the same `writeTransaction`). Throw `ERR_NOT_FOUND` if unknown. Same fix applies to `updateItem` patching `groupId`. |

### HIGH (must fix before R5)

| # | File:line | Source | Finding | Fix |
|---|---|---|---|---|
| H1 | `background/storage/items.js:23-31`, `groups.js:73-84` | security-reviewer | No length caps on `title`, `url`, `name`, `color`. A multi-MB title bricks storage via quota exhaustion (DoS). | Add `MAX_TITLE=2048`, `MAX_URL=4096`, `MAX_NAME=256`, `MAX_COLOR=32` enforced in validators; throw `ERR_VALIDATION`. |
| H2 | `background/storage/items.js:23-31` | security-reviewer | `url` validation accepts `javascript:`, `data:`, `file:`, `chrome://` — stored XSS risk the moment any downstream UI binds to `<a href>`. Storage is the chokepoint. | Parse with `new URL(url)`; reject scheme not in `{http, https, ftp, mailto}`. |
| H3 | `background/storage/partitions.js:65` | code-reviewer | `newTabOverride` default is `true` but B-039 AC says default off. Silently enables new-tab override on every fresh install. | Change default to `false`. |
| H4 | `shared/messages.js` | code-reviewer | `MSG_GET_GROUP` missing from the messages table even though R2 §4 exposes `getGroup(id)` as public. UI can't call it. | Add `MSG_GET_GROUP = 'tj/getGroup'` and wire dispatch in `storage-handlers.js`. |
| H5 | `background/storage/write-transaction.js:52-63` | code-reviewer | `assertServiceWorkerContext` always throws in the chrome-mock (Node/jsdom) environment — every R5 test exercising writes will fail before reaching the storage op, including AC9's perf benchmark. | Make the guard test-injectable (module-level flag) or skip when `globalThis.chrome` is the chrome-mock. |
| H6 | `background/storage/items.js:129` | qa-reviewer | `deleteItem('unknown-id')` throws `ERR_NOT_FOUND` — contract undecided vs idempotent. Optimistic-delete callers get unexpected rejections. `listItems({groupId: 'unknown-id'})` returns `[]` (silent) — inconsistency with delete. Needs ruling before R5 so [test-engineer] knows which contract to test. | **SCRUM-MASTER RULING (proposed):** `deleteItem` and `deleteGroup` become **idempotent silent no-ops** on unknown id. Matches `get`→`null` pattern. See Rulings section below. |
| H7 | `background/storage/partitions.js:200-203` | qa-reviewer | `initializePartitions` wraps `chrome.storage.local.set` failure as `ERR_CORRUPT_DATA` — quota exhaustion on fresh install surfaces misleading code. `isQuotaError` helper already exists and should be used. | Replace with `isQuotaError(e) ? ERR_QUOTA_EXCEEDED : ERR_CORRUPT_DATA`. |

### MEDIUM (fix before R5 if possible — tighten before Sprint close otherwise)

| # | File:line | Source | Finding |
|---|---|---|---|
| M1 | `.eslintrc.json:14-39` | security-reviewer | ESLint uses a **UI-folder denylist** (`sidepanel/newtab/popup/components`); `shared/**`, `lib/**`, `tests/**` uncovered. A future shared util could bypass AC5's static guard. Flip to allowlist semantics: only `background/messages/**` and `background/**` may import `background/storage/**`. |
| M2 | `background/storage/items.js:41`, `groups.js:94` | code-reviewer | `updatedAt` is in the `allowed` patch list but always overwritten by the mutator. Misleading — remove from `allowed`. |
| M3 | `background/storage/index.js:29` | code-reviewer | `writeTransaction` re-exported from barrel unnecessarily. No caller outside `background/storage/` needs it. Remove re-export to tighten surface. |
| M4 | `background/storage/groups.js:43-44` | qa-reviewer | `createGroup` with unknown `parentId` throws `ERR_VALIDATION` — should be `ERR_NOT_FOUND` per R2 §7 semantics. |
| M5 | `background/storage/items.js:23` | qa-reviewer | Whitespace-only `title` (e.g. `'   '`) passes validation. Add `title.trim().length === 0` check. Same for group `name`. |
| M6 | `background/storage/errors.js:43-47` | security-reviewer | `isQuotaError` string-matches `/quota/i` on `err.message` — fragile against Chrome wording changes. Add `bytesInUse`-comparison as secondary signal. |
| M7 | `background/storage/groups.js:43,47,56,59,97`, `items.js` | security-reviewer | `StorageError` messages interpolate raw user input (`parentId "${id}"`) — footgun if errors ever logged. Drop interpolation; use structured `cause` metadata. |
| M8 | `background/storage/groups.js:204` | code-reviewer | `deleteGroup` captures `Date.now()` twice (groups mutator + items mutator) — inconsistent `updatedAt` across the same logical delete. Capture `now` once. |
| M9 | `background/messages/storage-handlers.js:104-137` | security-reviewer | `sender.id` check sufficient today (no `externally_connectable` in manifest), but document the invariant so future work doesn't regress. |

### LOW (defer)

9 items — naming consistency, redundant comments, micro-style nits, ULID bias comment, `storage-handlers` error normalization, etc. Not blocking.

---

## Error Taxonomy Coverage (from qa-reviewer)

| Code | Reachable? | Notes |
|---|---|---|
| `ERR_NOT_READY` | ✅ | `storage-handlers.js:124` |
| `ERR_NOT_FOUND` | ✅ | items/groups update/delete paths |
| `ERR_DEPTH_EXCEEDED` | ✅ | `groups.js:47,165` |
| `ERR_CIRCULAR_REF` | ✅ | `groups.js:57,62` |
| `ERR_DIRECT_WRITE` | ✅ | dual: runtime + ESLint |
| `ERR_CORRUPT_DATA` | ✅ | `partitions.js` shape validators |
| `ERR_ID_COLLISION` | ❌ | **Defined but never thrown.** Per R2 §1 this is defensive — acceptable, but needs either an assertive path or removal. |
| `ERR_QUOTA_EXCEEDED` | ✅ | `write-transaction.js:106` (see H7 for init-path gap) |
| `ERR_VALIDATION` | ✅ | widespread |
| `ERR_TX_CONFLICT` | ✅ | `write-transaction.js` |

---

## Scrum-Master Design Rulings (proposed, needs user approval)

The [code-reviewer] surfaced 2 open questions from R3, and the [qa-reviewer] flagged 1 contract gap (H6). Rulings:

1. **`updateGroup` blocks nesting groups-that-have-children** → **CONFIRM** keep strict.
   *Rationale:* the hard depth=1 constraint is a locked architectural decision. Nesting a parent would push descendants to depth=2. The extra guard is correct.

2. **`createItem` default `sortOrder`** → **change to `0`** (not `Date.now()`).
   *Rationale:* `Date.now()` makes sort order non-deterministic (breaks test determinism), semantically meaningless, and conflicts with AC "stable within groupId scope." `0` gives new items equal weight until drag-reorder (B-030) assigns explicit values.

3. **`deleteItem` / `deleteGroup` on unknown id** → **idempotent silent no-op**.
   *Rationale:* matches `getItem`→`null` pattern; avoids footguns for optimistic-delete UX (B-003 AC says deleting a saved item whose tab is open retains the tab — implies caller may call delete speculatively). CRUD delete-unknown being idempotent is the conventional choice. [test-engineer] tests a `deleteItem('unknown')` call returns `void` and does not mutate state.

4. **`createGroup` unknown parentId** → **change error code to `ERR_NOT_FOUND`** (was `ERR_VALIDATION`).
   *Rationale:* taxonomy hygiene. Missing-id situations should always surface as `ERR_NOT_FOUND`.

5. **`ERR_ID_COLLISION`** → **keep in taxonomy, not thrown**.
   *Rationale:* defensive reserved code. [test-engineer] does not test for it. Document "intentionally unreachable" inline.

---

## Handoff for fix round

[frontend-engineer] fixes all CRITICAL + HIGH findings, plus as many MEDIUM as fit in the fix round. Then R5 [test-engineer] takes over.

---

## Sprint 8 — B-004 R4 Findings (Deduplicated)

**Reviewed by:** [code-reviewer] · [security-reviewer]
**Date:** 2026-04-16
**Totals:** C=0 · H=2 · M=0 · L=0 · **VERDICT: REQUEST CHANGES → FIXED**

### HIGH (fixed before R5)

| # | File:Line | Source | Finding | Fix Applied |
|---|-----------|--------|---------|-------------|
| H-1 | `background/tabs/tab-events.js:62` | code-reviewer | `tab/favicon-changed` broadcast fired on every navigation alongside `tab/updated`, causing double patch cycles | Guard: `'favIconUrl' in changeInfo && !('url' in changeInfo)` |
| H-2 | `sidepanel/sidepanel.js:597` | code-reviewer | `existingImg.src` (IDL property, always absolute URL) used for no-op comparison — always triggered unnecessary src update | Changed to `existingImg.getAttribute('src')` |

---

## Sprint 8 — B-010 R4 Findings (Deduplicated)

**Reviewed by:** [code-reviewer] · [security-reviewer] · [qa-reviewer]
**Date:** 2026-04-16
**Totals:** C=0 · H=8 · M=7 · L=8 · **VERDICT: REQUEST CHANGES → FIXED (H-1 through H-8)**

### HIGH (all fixed before R5)

| # | File:Line | Source | Finding | Fix Applied |
|---|-----------|--------|---------|-------------|
| H-1 | `tab-events.js:99,131,140` | code-reviewer | `entry.active = false` mutated LiveTabIndex directly, bypassing `updateTabEntry()` API contract | Replaced with `updateTabEntry(id, { active: false })` throughout |
| H-2 | `tab-events.js:110` | code-reviewer | `reevalTimers` not cancelled on `tabs.onRemoved` or `windows.onRemoved` → phantom claim window | Cancel + delete timer before `removeTabEntry` in both handlers |
| H-3 | `tab-events.js:154` | code-reviewer + qa | `broadcast(window/focused)` fired after try/catch regardless of query state → wrong-highlight flash | Moved broadcast inside try block after `updateTabEntry`; retained fallback in catch |
| H-4 | `sidepanel.js:552,558` | code-reviewer | `aria-label` concatenated user-controlled `item.title` → untrusted data in attribute | Changed to static `'Edit bookmark'` / `'Delete bookmark'` |
| H-5 | `sidepanel.js:479` | security-reviewer | `favIconUrl` assigned to `img.src` without scheme validation → `javascript:` / arbitrary `data:` risk | Added `isSafeFaviconUrl()` allowlist helper; all 4 `img.src` assignments guarded |
| H-6 | `sidepanel.js:573` | qa-reviewer | `refetchAndPatchLiveState` left stale indicators when `MSG_LIST_ITEMS` failed | Wrapped in try/catch; on failure clears all `data-live/active/audible/drifted` |
| H-7 | `sidepanel.js:578` | qa-reviewer | DOM patch applied to detached nodes on concurrent re-render race | Added `itemListEl.contains(row)` guard inside patch loop |
| H-8 | `sidepanel.js:522` | qa-reviewer | Audible/drifted icon DOM nodes never injected when state transitions false→true post-render | Added `_ensureIndicators(row, live)` helper called in patch loop |

### MEDIUM (deferred — addressed in future sprint if time permits)

- code-reviewer M-5: `requireClaimsReady` broadcast option undocumented
- code-reviewer M-6: Batch `releaseClaimByTab` for window-close (N writes)
- code-reviewer M-7: `refetchAndPatchLiveState` fetches full items list on every live-state change (expose MSG_GET_LIVE_STATES)
- security-reviewer M-1: TOCTOU in `onFocusChanged` rapid window-switch race
- security-reviewer M-2: Broadcast amplification to all extension contexts
- qa-reviewer M-1: ARIA live/active state not communicated to screen readers
- qa-reviewer M-5: 500ms budget not integration-tested under load

---

## Sprint 8 — B-008 R4 Findings (Deduplicated)

**Reviewed by:** [code-reviewer] · [security-reviewer] · [qa-reviewer]
**Date:** 2026-04-16
**Totals:** C=0 · H=4 · M=4 · L=5 · **VERDICT: REQUEST CHANGES → IN PROGRESS**

### HIGH (must fix before R5)

| # | File:Line | Source | Finding | Fix |
|---|-----------|--------|---------|-----|
| H-1 | `sidepanel.js:867` | code-reviewer | `dragstart` guard `e.target.closest('.group-drag-handle')` broken — `e.target` is the section element (dragstart fires on `draggable`), not the handle child; guard always returns null → feature non-functional | Use `mousedown` on handle to set a flag; in `dragstart` check the flag, not `e.target.closest()` |
| H-2 | `sidepanel.js:924` | code-reviewer + qa | Persistence failure on `Promise.all(updates)` is silent — DOM shows new order but storage retains old; no rollback, no user signal | On catch: call `renderAll()` to revert to stored order |
| H-3 | `sidepanel.js:931` | qa-reviewer | `dragend` cleanup conditional — `dragging-src` class removal guarded by `if (_dragSrcGroupId)` + DOM query that can fail if `renderAll` fired mid-drag → class permanently stranded at 0.5 opacity | Make cleanup unconditional; remove class without conditional guard |
| H-4 | `sidepanel.js:959` | qa-reviewer | Concurrent `renderAll()` on `groups`-scope broadcast mid-drag destroys `dropIndicatorEl` position and `dragging-src` class | Guard `renderAll()` for `groups` scope: `if (_dragSrcGroupId) return;`; re-render on `dragend` if skipped |

### MEDIUM (fix before R5)

| # | File:Line | Source | Finding |
|---|-----------|--------|---------|
| M-1 | `background/storage/groups.js:115` | security-reviewer | `validateGroupPatch` missing `sortOrder` finiteness check — `validateNewGroup` has it but `validateGroupPatch` does not; NaN/Infinity could be persisted |
| M-2 | `sidepanel.js:444` | qa + code | Drag handle missing `tabindex="0"` — WCAG AA violation; `:focus-visible` CSS is dead code without it |
| M-3 | `sidepanel.js:870` | security-reviewer | `e.dataTransfer.setData('text/plain', _dragSrcGroupId)` dead code — `drop` reads `_dragSrcGroupId` directly, `getData` never called |
| M-4 | `sidepanel.js:924` | qa-reviewer | No-op drag may still dispatch MSG_UPDATE_GROUP if stored sortOrders aren't normalised to `idx*1000` scheme |

---

## Sprint 8 — B-021 R4 Findings (Deduplicated)

**Reviewed by:** [code-reviewer] · [security-reviewer] · [qa-reviewer]
**Date:** 2026-04-16
**Totals:** C=0 · H=2 · M=5 · L=4 · **VERDICT: REQUEST CHANGES → IN PROGRESS**

### HIGH (must fix before R5)

| # | File:Line | Source | Finding | Fix |
|---|-----------|--------|---------|-----|
| H-1 | `sidepanel.js:411,419` | code-reviewer | O(n²) `_cachedItems.find()` per DOM row in `applyFilter` — up to 500,000 comparisons on 1,000-item collection, violates <50ms P95 budget | Populate `_itemById = new Map(items.map(it => [it.id, it]))` in `renderAll`; replace all `find()` calls with `_itemById.get(itemId)` |
| H-2 | `sidepanel.js:1147` | qa-reviewer | Missing `e.preventDefault()` on filter Escape handler — browser's native `type="search"` Escape fires `input` event before `keydown`, re-arming debounce timer | Add `e.preventDefault()` before `e.stopPropagation()` in the Escape keydown handler |

### MEDIUM (fix before R5)

| # | File:Line | Source | Finding |
|---|-----------|--------|---------|
| M-1 | `sidepanel.css:798` | code + qa | `--mark-bg` undefined in dark/system themes — yellow `#fef08a` fallback jarring on dark bg |
| M-2 | `sidepanel.html:78` | code + qa | `#filter-empty-state` missing `aria-live="polite"` + `role="status"` + `aria-atomic="true"` |
| M-3 | `sidepanel.js:385` | qa-reviewer | `buildHighlightedText` uses `query.length` not `lowerQuery.length` for mark extent — Unicode `toLowerCase` can change char count |
| M-4 | `sidepanel.js:457` | qa-reviewer | Scroll reset only fires when `query` is truthy — not applied on filter clear |
| M-5 | `sidepanel.js:450` | qa-reviewer | Group count badge shows total items, not filtered match count during active filter |
