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
