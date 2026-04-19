## 22. B-005 — Bulk-Create Saved Items (R6 Close)

### Overview

`bulkCreateItems` provides a batch-create API for saved items with partial-success semantics. Individual input failures (validation errors, missing group FK) do not abort the entire batch — valid items are created and invalid ones are reported as skipped.

### API contract

```js
/**
 * @param {Array<{title: string, url: string, groupId?: string|null}>} inputs
 * @returns {Promise<{created: Item[], skipped: {input: Object, reason: string}[]}>}
 */
async function bulkCreateItems(inputs)
```

**Edge cases:**

| Input | Behavior |
|-------|----------|
| Non-array | Returns `{ created: [], skipped: [] }` (no throw) |
| Empty array | Returns `{ created: [], skipped: [] }` (early return) |
| Length > `MAX_BULK_INPUTS` (500) | Throws `ERR_VALIDATION` (hard cap to prevent quota exhaustion) |
| Individual input fails validation | Skipped with reason; other inputs proceed |
| Individual input references nonexistent groupId | Skipped with reason; other inputs proceed |
| Transaction failure (quota exceeded, shape assertion) | All validated candidates moved to `skipped`; `created` stays empty |

### Two-phase architecture

**Phase 1 — Pre-validation (outside transaction):**
Iterates all inputs, calls `validateNewItem` on each. Valid inputs become candidates with pre-generated ULIDs and timestamps. Invalid inputs are immediately added to the `skipped` array with the error message.

**Phase 2 — Single writeTransaction (two ops):**
1. **GROUPS op** (read-only): captures a snapshot of all groups for FK validation.
2. **ITEMS op** (mutating): for each candidate, checks `assertGroupExists(item.groupId, groupsSnapshot)`. Passing candidates are appended to the items array. Failing candidates are added to `txGroupSkipped`.

**Post-transaction merge:** Only after `await writeTransaction(...)` resolves successfully are `txCreated` items merged into the outer `created` array and `txGroupSkipped` into the outer `skipped` array. This prevents phantom entries in `created` if the transaction throws (e.g., quota exceeded after mutator runs but before `storage.local.set` commits).

**Transaction failure path:** If `writeTransaction` throws, all validated candidates are moved to `skipped` with the error message. The `created` array remains empty. No phantom items leak.

### Message handler

| Constant | Value | Request payload | Success `data` |
|----------|-------|-----------------|----------------|
| `MSG_BULK_CREATE_ITEMS` | `tj/bulkCreateItems` | `{ inputs: Array<{title, url, groupId?}> }` | `{ created: Item[], skipped: {input, reason}[] }` |

Registered in `MUTATION_BROADCASTS` with `SCOPE.ITEMS` — a successful bulk create triggers a state broadcast so all UI surfaces refresh. Listed in the `writeTypes` set for the safe-mode write gate.

### Constants

`MAX_BULK_INPUTS = 500` is defined in `background/storage/shapes.js` and imported by `items.js`. The cap prevents a single API call from writing enough data to exhaust the 10 MB `chrome.storage.local` quota.

### Files changed

| File | Change |
|------|--------|
| `background/storage/shapes.js` | Added `MAX_BULK_INPUTS = 500` export. |
| `background/storage/items.js` | Added `bulkCreateItems` function. Imports `MAX_BULK_INPUTS` from `shapes.js`. |
| `shared/messages.js` | Added `MSG_BULK_CREATE_ITEMS = 'tj/bulkCreateItems'` constant. |
| `background/messages/storage-handlers.js` | Added `MSG_BULK_CREATE_ITEMS` import, dispatch case, `MUTATION_BROADCASTS` entry (SCOPE.ITEMS), and `writeTypes` entry. |

### Manifest permissions — No changes

### Rollback plan

**Risk:** Low — no storage schema changes. `bulkCreateItems` writes to `tj:items` using the existing `Item` shape. `git revert <commit-sha>` removes the function and message handler. Any items created via bulk-create are standard `Item` objects indistinguishable from single-create items — no cleanup needed.

### R2 Correctness Checklist (Post-Build Verification)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C-1 | Storage schema versioned | N/A | No schema change. Uses existing `Item` shape. |
| C-2 | Message contracts typed | PASS | `MSG_BULK_CREATE_ITEMS` added to `shared/messages.js` with documented request/response shapes. |
| C-3 | Service worker cold-start safe | PASS | `bulkCreateItems` is stateless — reads items and groups from storage on every call via `writeTransaction`. No in-memory state dependency. |
| C-4 | ID stability | PASS | Each item gets a fresh ULID via the existing `ulid()` generator. |
| C-5 | Manifest file references resolvable | N/A | No new manifest entries. |

---

