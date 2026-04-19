# Sprint 10 — R4 Findings (Deduplicated)

## B-053 — Circular dep fix (Fast Track S)

All R4 findings resolved before R5:
- **HIGH-1 (code-reviewer)**: Duplicate `import { ALL_PARTITIONS, partitionKey, defaultShape, assertShape } from './shapes.js'` block (lines 61-66) in `partitions.js` — `export { } from` re-export syntax doesn't bind names locally; `initializePartitions` and `readPartition` were reading `undefined`. **Fixed**: added local `import` at line 38 alongside the `export { } from` re-export block. 296/296 tests pass. ✅

---

## B-013 — Opener-chain group inheritance (Full M) — R4 FINDINGS

### CRITICAL (must fix before R5)

| # | File | Finding | Fix |
|---|------|---------|-----|
| C-1 (qa) | `background/tabs/tab-events.js:121–128` + `background/tabs/floating-groups.js:103` | **Missing `itemId` in floating-group record**: `walkOpenerChain` returns `{ groupId, itemId }` but `appendFloatingGroup` call only stores `groupId`. `reassociateFloatingGroups` then calls `claimTabForItem(record.groupId, matchedTabId)` — passing a groupId where an itemId is required, poisoning `claimsMirror` with a phantom entry. | Store `itemId` in the floating-group record. Pass `result.itemId` at the call site in `tab-events.js`. Extend `appendFloatingGroup` validation guard to require `itemId`. Fix `reassociateFloatingGroups` to call `claimTabForItem(record.itemId, matchedTabId)`. |

### HIGH (must fix before R5)

| # | File | Finding | Fix |
|---|------|---------|-----|
| H-1 (code) | `background/tabs/opener-chain.js:54–70` | **No cycle guard in `walkOpenerChain`**: hop budget can be silently consumed by phantom nodes if a cycle exists (however formed), masking valid grouped ancestors. | Add `visited = new Set([tabId])`; before following each hop check `visited.has(currentTabId)` and break; add `visited.add(currentTabId)` each iteration. |
| H-2 (code) | `background/tabs/floating-groups.js:122–136` | **`savedAt` not validated in `appendFloatingGroup` guard**: entry with `savedAt: undefined` passes validation and is written to storage. Future TTL pruning will mis-sort or error on it. | Add `typeof entry.savedAt === 'number' && Number.isFinite(entry.savedAt)` to guard. Same fix needed in `saveFloatingGroups` filter. |
| H-3 (security) | `background/tabs/opener-chain.js:12` | **`openerMap` unbounded**: no size cap. Tab-bomb scenario writes one entry per opened tab until SW memory is exhausted. | Enforce `MAX_OPENER_MAP_ENTRIES` (e.g. 512) in `recordOpener`; reject new entries when cap reached. |
| H-4 (qa) | `background/tabs/tab-events.js:122–128` | **Stale `tab.url`/`tab.index` in floating-group entry**: captured at `onCreated` time (usually `''`/`about:blank`), used after async gap. URL-fallback path in `reassociateFloatingGroups` will always skip entry. | After async gap, read current URL from `getLiveTabIndex().get(tab.id)?.url` and current index from live entry instead of closure-captured `tab.url`/`tab.index`. |
| H-5 (qa) | `background/tabs/tab-events.js:115–134` | **No live-tab existence guard after async gap**: tab may have been removed before IIFE resumes; `appendFloatingGroup` could write a floating-group for a deleted tab. | Add `if (!getLiveTabIndex().has(tab.id)) return;` immediately after `await readyPromise`. |
| H-6 (qa) | `background/tabs/tab-events.js:129` | **`broadcast` with `requireClaimsReady: true` may silently drop**: if `isClaimsReady()` is false when IIFE resumes, broadcast is swallowed; sidepanel stays stale. | Broadcast without `requireClaimsReady` guard, or add a retry/defer path if claims not ready. |

### MEDIUM (fix if time permits)

| # | File | Finding |
|---|------|---------|
| M-1 (security) | `floating-groups.js:103` | `groupId` in floating-group record not validated against live groups before `claimTabForItem` call; dangling groupId if group deleted between write and reassociation. Add existence check in `reassociateFloatingGroups`. |
| M-2 (security) | `tab-events.js:126` | `tab.url` written to storage without scheme validation; disallowed schemes (e.g. `chrome://`, `javascript:`) can enter `tj:floatingGroups`. Add `safeNormalizeForMatch` check in `appendFloatingGroup` guard. |
| M-3 (qa) | `tab-events.js:115` | Concurrent `onCreated` events can produce duplicate floating-group entries for same tab. Deduplicate by `(groupId, windowId, tabIndex)` inside `appendFloatingGroup` mutator. |
| M-4 (code) | `opener-chain.js:58` | O(N) linear scan of `claimsMirror` per hop; O(3N) per `onCreated`. Invert to `Map<tabId, itemId>` before walk for O(1) per hop. |

---

## B-005 — Bulk-create saved items (Full M) — R4 FINDINGS

### CRITICAL (must fix before R5)
_None_

### HIGH (must fix before R5)

| # | File | Finding | Fix |
|---|------|---------|-----|
| H-1 (code+security) | `background/storage/items.js:273–297` | **`writeTransaction` throws not caught**: if tx fails (`ERR_QUOTA_EXCEEDED`/`ERR_TX_CONFLICT`), `created` is empty and `skipped` context is lost. Caller can't distinguish "all inputs bad" from "write failed". | Wrap `writeTransaction` in try/catch inside `bulkCreateItems`; on storage error return `{ created: [], skipped: [...phase1Skipped, ...candidates as skipped], storageError: {code, message} }`. |
| H-2 (code+security) | `background/storage/items.js:232–237` | **No upper-bound on `inputs` array**: no cap allows near-quota-exhaustion in a single call; blocking pre-validation loop on huge arrays. | Add `MAX_BULK_INPUTS` constant (export from `shapes.js`); throw `ERR_VALIDATION` when `inputs.length > MAX_BULK_INPUTS`. |
| H-3 (code) | `background/storage/items.js:285–289` | **Side-effect mutation inside mutator**: `created.push(item)` and `groupSkipped.push(...)` run inside the `writeTransaction` mutator. If tx later fails (e.g. `assertShape` throws), `created` contains phantom items never persisted. | Collect passing candidates into a local variable inside the mutator (return value); populate `created`/`groupSkipped` only after `await writeTransaction(...)` resolves successfully. |
| H-4 (qa) | `background/storage/items.js:232–234` + `storage-handlers.js:124` | **Non-array `inputs` throws instead of partial-success envelope**: caller receives `{ok: false}` instead of `{created: [], skipped: []}`. Breaks B-005 partial-success contract. | Coerce non-array inputs to `[]` at dispatch level, or return `{ created: [], skipped: [] }` from `bulkCreateItems` for non-array (not throw). |

### MEDIUM (fix if time permits)

| # | File | Finding |
|---|------|---------|
| M-1 (security) | `items.js:259–261` | `skipped` entries echo back raw unfiltered input objects; downstream UI `innerHTML` interpolation would be XSS. Project to bounded safe subset `{ title: ..slice(0,MAX_TITLE), url: ..slice(0,MAX_URL) }` before returning. |
| M-2 (qa) | `items.js:281–292` | No URL deduplication — same URL appears twice → two items created, no feedback. Deduplicate by normalized URL within batch; excess copies go to `skipped` with reason `'duplicate URL'`. |
| M-3 (qa) | `storage-handlers.js:403–406` | Broadcast fires even when `created.length === 0`; causes unnecessary sidepanel re-render for fully-failed imports. Guard broadcast with `if (data.created?.length > 0)`. |
| M-4 (code) | `items.js:248–257` | Item construction literals duplicated from `createItem`. Extract private `buildItemPayload(input, normalizedUrl, now)` factory. |

---

