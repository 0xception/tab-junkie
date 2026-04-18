# Tab Junkie — Solution Design

**Version:** 2.5
**Date:** 2026-04-16
**Owner:** [solution-architect]
**Status:** Active — B-001d + B-002 + B-006 + B-016 + B-017 + B-050 + B-019 + B-020 + B-003 + B-010 + B-008 + B-021 + B-011 + B-012 + B-015 + B-053 + B-013 + B-005 + B-054 landed.

> This document is the current source of truth for what has actually shipped.
> For the R2 *plan* (pre-build design) see `docs/design/B-001a.md`; deviations
> between that plan and the build are captured in §11 below.

---

## 1. Project Structure

Current build-relevant layout on `feature/rebuild-from-prd` (paths shipped through B-001d + B-002 + B-006 + B-016 + B-017 + B-050 + B-019 + B-020 + B-053 + B-013 + B-005 + B-054):

```
junkie/
├── manifest.json                          Chrome MV3 manifest
├── jsconfig.json                          TS checker shim (suppresses circular-import false positives, see B-053)
├── .eslintrc.json                         Write-boundary denylist (see §6)
├── background/
│   ├── service-worker.js                  Entry point · exports `readyPromise` (gates on runMigrations) · wires onMessage + tab events
│   ├── broadcast.js                       State broadcaster · SCOPE enum · fire-and-forget runtime.sendMessage to all open surfaces · cold-start suppression via isClaimsReady gate (B-050)
│   ├── messages/
│   │   └── storage-handlers.js            runtime.onMessage dispatcher + sender guard + safe-mode write gate
│   ├── storage/
│   │   ├── index.js                       Public barrel (no writeTransaction export — M3)
│   │   ├── shapes.js                      Partition key constants, defaults, shape validators, length caps (extracted from partitions.js; B-053)
│   │   ├── partitions.js                  Re-exports shapes.js + readPartition + initializePartitions (B-053 refactor)
│   │   ├── ids.js                         Zero-dep ULID generator (strict-monotonic)
│   │   ├── errors.js                      StorageError + ERR_* constants (incl. ERR_SAFE_MODE) + isQuotaError
│   │   ├── write-transaction.js           Serialized atomic batcher — SOLE write path
│   │   ├── migration.js                   Migration runner · KNOWN_VERSION · safe-mode · quota monitor (B-001b)
│   │   ├── items.js                       Item CRUD + bulkCreateItems (B-005)
│   │   ├── groups.js                      Group CRUD + depth/cycle enforcement + cascade on delete
│   │   └── preferences.js                 Preferences CRUD
│   └── tabs/
│       ├── index.js                       Barrel · exports registerTabEventListeners, initializeLiveState, buildLiveStates (B-001c)
│       ├── live-tab-index.js              SW-memory Map<tabId,{url,windowId,active,audible,index}> — never written to storage.local (B-001c)
│       ├── tab-claims.js                  storage.session TabClaims mirror + reconcile/release/reevaluate + buildLiveStates + claimTabForItem (B-001c/d)
│       ├── tab-events.js                  chrome.tabs/windows event handlers + drift detection hook + opener-chain inheritance in onCreated (B-001c/d + B-013)
│       ├── drift.js                       Drift write/clear logic; driftedToUrl normalized via shared/url.js; fragment stripped before storage (B-001d)
│       ├── opener-chain.js                Ephemeral openerMap + walkOpenerChain with cycle guard and size cap (B-013)
│       └── floating-groups.js             Floating-group re-association + appendFloatingGroup atomic append (B-002 + B-013)
├── shared/
│   ├── messages.js                        MSG_* constants (19 total, incl. MSG_GET_STATUS, MSG_PROMOTE_TAB, MSG_DEMOTE_ITEM, MSG_STATE_CHANGED, MSG_NAVIGATE_TO_ITEM, MSG_CLOSE_TABS, MSG_BULK_CREATE_ITEMS) + envelope typedefs incl. ListItemsResponse (NO storage logic)
│   ├── constants.js                       GROUP_COLORS — 9-color allowlist palette for group color values (B-006)
│   ├── url.js                             URL normalization — normalizeUrl(url, mode) with forStorage/forMatch modes; scheme allowlist; protocol defaulting; hostname lowercasing (B-001d)
│   └── errors.js                          Canonical home for StorageError + ERR_* constants (moved from background/storage/errors.js, which now re-exports from here) (B-001d)
├── sidepanel/
│   ├── sidepanel.html                     Shell HTML: header, filter, group list, dialogs, skeleton, empty state (B-054)
│   ├── sidepanel.js                       Main module: renderAll, refetchAndPatchLiveState, drag/drop, keyboard nav, CRUD dialogs (B-054, 1249 lines)
│   ├── sidepanel.css                      Full stylesheet: layout, indicators, themes, skeletons, dialogs, drag states (B-054)
│   └── theme-init.js                      Synchronous theme class application before first paint (B-054)
├── newtab/
│   └── newtab.html                        Placeholder stub — overwritten by B-035
├── popup/
│   └── popup.html                         Placeholder stub — overwritten by B-036
└── tests/                                 R5 test suite (unit · integration · perf · UAT notes)
```

The sidepanel is fully implemented (B-054). The HTML stubs in `newtab/` and
`popup/` exist only so Chrome's manifest validator can resolve
`chrome_url_overrides.newtab` / `action.default_popup` at extension load
time. They have no script content and will be replaced when the
corresponding UI backlog items land.

---

## 2. Storage Schema

All state lives under six partitioned keys in `chrome.storage.local`, plus one key in `chrome.storage.session`. Each `storage.local` key is read, validated, and mutated independently so a single corrupt partition isolates blast radius (AC8).

| Key | Purpose | Shape | Default | Persistence tier |
|---|---|---|---|---|
| `tj:meta` | Schema metadata / bookkeeping | `{ schemaVersion: number, createdAt: number }` | `{ schemaVersion: 1, createdAt: Date.now() }` | `storage.local` |
| `tj:items` | All user-saved items (flat list) | `Item[]` | `[]` | `storage.local` |
| `tj:groups` | All groups (flat list, adjacency list via `parentId`) | `Group[]` | `[]` | `storage.local` |
| `tj:prefs` | User preferences | `Preferences` | see DEFAULT_PREFERENCES below | `storage.local` |
| `tj:drift` | Drift records keyed by item id (B-001d) | `Record<string, DriftRecord>` — shape: `{ itemId: string, driftedToUrl: string (scheme-validated + MAX_URL, normalized via shared/url.js), detectedAt: number }` | `{}` | `storage.local` |
| `tj:floatingGroups` | Floating-group re-association records (B-002 + B-013) | `FloatingGroup[]` — shape: `{ groupId: string, itemId: string, windowId: number, tabIndex: number, url: string, savedAt: number }` *(B-013 added `itemId`; `assertShape` treats `itemId` as optional for backward compatibility with pre-B-013 records)* | `[]` | `storage.local` |
| `tj:tabClaims` | Item-to-tab disambiguation table (B-001c) | `Record<string, number>` (itemId → tabId) | `{}` | `storage.session` — cleared on browser restart |

Per R0 spike decision #2, **only `drifted` is persisted**. `live`, `active`,
and `audible` are ephemeral and computed at read time from the SW-memory
`LiveTabIndex` and the session-persisted `TabClaims` table (both shipped in
B-001c). See §10.5 for the full architecture.

### Schema version field — B-001b closed the gap

`tj:meta.schemaVersion` is now consumed by `runMigrations()` in
`background/storage/migration.js`. On every SW cold start, `runMigrations()`
reads the stored version and compares it to `KNOWN_VERSION` (currently `1`):

- **Equal:** no steps to run; resolves immediately.
- **Less than:** applies migration steps atomically inside a single
  `writeTransaction`; bumps `tj:meta.schemaVersion` to `KNOWN_VERSION` on success.
- **Greater than:** enters safe-mode (read-only); `readyPromise` resolves (not rejects) so reads still work.
- **Corrupt/NaN/missing:** `readyPromise` rejects with `ERR_CORRUPT_DATA`.

The B-001a stub that only awaited `initializePartitions()` is replaced. See §4 and §10.6.

### Item shape

```js
/**
 * @typedef {Object} Item
 * @property {string}      id         ULID (26-char Crockford Base32)
 * @property {string}      title      user-editable text, validated; 1..MAX_TITLE
 * @property {string}      url        http|https|ftp|mailto only; 1..MAX_URL
 * @property {string|null} groupId    ULID of containing group, null = Ungrouped
 * @property {number}      sortOrder  finite; default 0 (see ruling #2)
 * @property {number}      createdAt  epoch ms
 * @property {number}      updatedAt  epoch ms
 */
```

### Group shape

```js
/**
 * @typedef {Object} Group
 * @property {string}      id         ULID
 * @property {string}      name       1..MAX_NAME, whitespace-only rejected
 * @property {string}      color      must be a value in GROUP_COLORS (9-color allowlist from shared/constants.js; B-006)
 * @property {string|null} parentId   null = top-level; max depth = 1
 * @property {number}      sortOrder  finite
 * @property {boolean}     collapsed  UI flag
 * @property {number}      createdAt
 * @property {number}      updatedAt
 */
```

### Preferences shape

```js
/**
 * @typedef {Object} Preferences
 * @property {'light'|'dark'|'system'} theme
 * @property {'sidepanel'|'window'}    displayMode
 * @property {boolean}                 newTabOverride        default FALSE (H3 fix)
 * @property {boolean}                 autoCollapseSubGroups default FALSE
 */
```

`DEFAULT_PREFERENCES` is frozen and merged into every `getPreferences()` read
so callers always see a fully populated object even if the stored value is
from an older schema.

### Schema version field — gap

`tj:meta` carries a `schemaVersion` field set to `1`, but **B-001a does not
read it**. The migration runner + `ready` barrier that consumes this field
is owned by **B-001b**. Until B-001b lands, there is no forward-compat gate
and no read-only safe-mode; `readyPromise` in `service-worker.js` is a stub
that only awaits `initializePartitions()`. See §10 for the handoff.

---

## 3. ID Strategy

- **Format:** ULID — 26-char Crockford Base32, 10-char 48-bit timestamp
  prefix + 16-char 80-bit random suffix (`background/storage/ids.js`).
- **Monotonicity:** strict-monotonic within a single service-worker process.
  Within the same millisecond, the random portion of the later ULID is
  `previous + 1`. On random-portion overflow (1-in-2^80), the logical clock
  advances 1 ms.
- **Entropy source:** `crypto.getRandomValues(Uint8Array(16))`. Never seeded
  from user input.
- **Identity invariants (AC3 + R2 §1):**
  - IDs are never reused after delete (fresh ULID every create).
  - IDs are never derived from or contain any substring of item URL/title.
  - Every `create*` call emits exactly one ULID.
- `ERR_ID_COLLISION` is declared in the taxonomy but **intentionally
  unreachable** — defensive reserved code per ruling #5. No caller tests for
  it; no path throws it.

---

## 4. Write Boundary

### The invariant

The service worker is the **sole writer** (R0 decision #6). All writes pass
through exactly one function: `writeTransaction(ops)` in
`background/storage/write-transaction.js`. There is no other code path in
`background/` that calls `chrome.storage.local.set`. UI surfaces cannot
import the storage module at all (see §6).

### Transaction algorithm

```
writeTransaction(ops):
  1. assertServiceWorkerContext()        // runtime guard, test-hatch below
  2. keys  = unique namespaced keys touched by ops
  3. current = chrome.storage.local.get(keys)           // single get
  4. next = { ...current }
     for each op in declared order:
       input = next[k] ?? defaultShape(op.partition)    // seed missing
       next[k] = op.mutator(input)                      // may throw
  5. for each k: assertShape(k, next[k])                // post-mutation
  6. chrome.storage.local.set(next)                     // single set
  7. opportunistic getBytesInUse() → lastQuotaSample    // telemetry for B-001b
```

### Guarantees

- **Atomicity:** the commit is a single `chrome.storage.local.set({k1,k2,...})`
  which Chrome guarantees applies all-or-nothing. Multi-partition writes
  (e.g., `deleteGroup` cascading to items) land together or not at all.
- **Serialization (AC10):** a module-level `txQueue` promise chain makes
  transaction N's `get` strictly follow transaction N-1's `set` resolution.
  The chain is attached on both fulfill and reject branches so a failing
  transaction does not stall the queue. The returned promise still carries
  the true outcome to the caller.
- **Crash safety:**
  - SW terminated before step 6 → nothing written, pre-tx state intact.
  - SW terminated during step 6 → Chrome's atomic `set` contract guarantees
    fully-applied or not-applied, never partial.
  - Cold start re-initializes `txQueue` to `Promise.resolve()` — safe because
    the only thing the queue serializes is in-flight callers within one SW
    lifetime, and that window is the only one where serialization matters.
- **Failure isolation:**
  - Mutator throws a `StorageError` → rethrown as-is (preserves typed code).
  - Mutator throws anything else → wrapped as `ERR_TX_CONFLICT`.
  - `storage.set` quota reject → `ERR_QUOTA_EXCEEDED`.
  - `storage.set` other reject → `ERR_TX_CONFLICT`.
  - Shape validator failure post-mutation → `ERR_CORRUPT_DATA`, no commit.
- **Telemetry hook:** after a successful `set`, a non-exported
  `lastQuotaSample = { bytesInUse, at }` is recorded. Exposed only via the
  non-barrel `_peekQuotaSample()` for future B-001b consumption.

### readyPromise — now gates on runMigrations()

`service-worker.js` exports:

```js
export const readyPromise = runMigrations().catch((err) => { … throw err; });
```

`runMigrations()` replaces the B-001a stub (`initializePartitions()` only).
It performs the full migration sequence (init → version check → migrate/safe-mode/corrupt → legacy cleanup → quota eval) before the gate opens. Any pending `onMessage` handler that `await`s `readyPromise` is held until the gate settles.

### Safe-mode write gate

When `isSafeMode()` returns `true` (stored schemaVersion > KNOWN_VERSION),
`storage-handlers.js` blocks the following message types with `ERR_SAFE_MODE`
before dispatching them: `MSG_CREATE_ITEM`, `MSG_UPDATE_ITEM`,
`MSG_DELETE_ITEM`, `MSG_CREATE_GROUP`, `MSG_UPDATE_GROUP`,
`MSG_DELETE_GROUP`, `MSG_SET_PREFERENCES`, `MSG_PROMOTE_TAB`, `MSG_DEMOTE_ITEM`. All read messages and
`MSG_GET_STATUS` pass through unaffected.

### Single write path — cross-partition enforcement

`initializePartitions()` writes through `writeTransaction` too (see C1 fix
in §11). Items' FK-to-groups check is done as a read-only `PARTITION_GROUPS`
mutator op alongside the `PARTITION_ITEMS` mutation so both observe the same
serialized snapshot (see C2 fix).

---

## 5. Message Contract

### Envelopes

```js
// Request (from UI → SW)
{ type: 'tj/<op>', payload: {...}, requestId?: string }

// Success response
{ ok: true, data: <typed> }

// Error response
{ ok: false, error: { code: 'ERR_*', message: string } }
```

All responses returned from `storage-handlers.js` are normalized to this
envelope. Any thrown non-`StorageError` is coerced to an envelope with code
`ERR_TX_CONFLICT` so UI code never sees a raw exception shape.

### Message types — full registry

Defined in `shared/messages.js`. **19 constants total** (12 from B-001a + `MSG_GET_STATUS` added in B-001b + `MSG_PROMOTE_TAB` added in B-016 + `MSG_DEMOTE_ITEM` added in B-017 + `MSG_STATE_CHANGED` added in B-050 + `MSG_NAVIGATE_TO_ITEM` added in B-019 + `MSG_CLOSE_TABS` added in B-020 + `MSG_BULK_CREATE_ITEMS` added in B-005). **UI must never import any file under `background/`**; the only contract is this module + `chrome.runtime.sendMessage`.

| Constant | Value | Request payload | Success `data` | Allowed senders |
|---|---|---|---|---|
| `MSG_CREATE_ITEM` | `tj/createItem` | `{title, url, groupId?}` | `Item` | sidepanel, newtab, popup |
| `MSG_UPDATE_ITEM` | `tj/updateItem` | `{id, patch}` | `Item` | sidepanel, newtab, popup |
| `MSG_DELETE_ITEM` | `tj/deleteItem` | `{id}` | `null` | sidepanel, newtab, popup |
| `MSG_LIST_ITEMS`  | `tj/listItems`  | `{groupId?}` | `{ items: Item[], liveStates: Record<itemId, {live, active, audible}>, driftRecords: Record<itemId, DriftRecord> }` *(B-001c shape change; B-001d adds `driftRecords`)* | all |
| `MSG_GET_ITEM`    | `tj/getItem`    | `{id}` | `Item \| null` | all |
| `MSG_CREATE_GROUP`| `tj/createGroup`| `{name, color, parentId, sortOrder?}` | `Group` *(success `data` includes `warning?: string` when duplicate name detected within same `parentId` scope — non-blocking, not persisted; B-006)* | sidepanel, newtab |
| `MSG_UPDATE_GROUP`| `tj/updateGroup`| `{id, patch}` | `Group` *(same duplicate-name `warning` field applies; B-006)* | sidepanel, newtab |
| `MSG_DELETE_GROUP`| `tj/deleteGroup`| `{id}` | `null` | sidepanel, newtab |
| `MSG_LIST_GROUPS` | `tj/listGroups` | `{}` | `Group[]` | all |
| `MSG_GET_GROUP`   | `tj/getGroup`   | `{id}` | `Group \| null` | all *(added post-R2 — H4 fix)* |
| `MSG_GET_PREFERENCES` | `tj/getPreferences` | `{}` | `Preferences` | all |
| `MSG_SET_PREFERENCES` | `tj/setPreferences` | `{patch}` | `Preferences` | sidepanel |
| `MSG_GET_STATUS`  | `tj/getStatus`  | `{}` | `{ safeMode, schemaVersion, knownVersion, quotaWarning, quotaBytesInUse, quotaBytesTotal }` *(B-001b)* | all |
| `MSG_PROMOTE_TAB` | `tj/promoteTab` | `{tabId, groupId?, title?}` | `Item` | sidepanel, popup *(B-016; `file:` scheme blocked with `ERR_VALIDATION`; `ERR_DUPLICATE_URL` if item with same URL already exists)* |
| `MSG_DEMOTE_ITEM` | `tj/demoteItem` | `{id}` | `null` | sidepanel, popup *(B-017; operation order: delete item → clearDrift → saveFloating → releaseClaim; partial atomicity — see §5 note below)* |
| `MSG_STATE_CHANGED` | `tj/stateChanged` | `{mutation: string, payload: any}` | — *(SW → UI push; fire-and-forget; no response expected)* | SW only *(B-050)* |
| `MSG_NAVIGATE_TO_ITEM` | `tj/navigateToItem` | `{id}` | `null` | sidepanel, newtab, popup *(B-019; switches to claimed tab or opens new tab; immediate claim on new-tab path)* |
| `MSG_BULK_CREATE_ITEMS` | `tj/bulkCreateItems` | `{inputs: Array<{title, url, groupId?}>}` | `{created: Item[], skipped: {input, reason}[]}` | sidepanel, newtab, popup *(B-005; partial-success semantics; MAX_BULK_INPUTS=500 cap; subject to safe-mode write gate)* |
| `MSG_CLOSE_TABS` | `tj/closeTabs` | `{ids: string[]}` | `null` | sidepanel, newtab, popup *(B-020; partitions ids into valid vs gone; closes valid tabs; onRemoved handles claim cleanup)* |

**Note on `MSG_LIST_ITEMS` response shape change (B-001c + B-001d):** The success `data` is now a `ListItemsResponse` object `{ items, liveStates, driftRecords }` rather than a bare `Item[]`. The `liveStates` map is built at read time from `LiveTabIndex` + `TabClaims`; items with no claim receive `{ live: false, active: false, audible: false }`. The `driftRecords` map is read from `tj:drift`; items with no drift record are absent from the map. No live-state or drift field is stored on `Item` objects in `tj:items`.

**Note on `MSG_GET_STATUS` dispatch order (B-001b):** `MSG_GET_STATUS` is handled **before** the `readyPromise` gate — it returns the current migration/safe-mode/quota state even while migrations are running or have failed.

**Note on `MSG_PROMOTE_TAB` (B-016):** Promotes a currently open tab into a saved `Item`. Handler reads the tab URL from `LiveTabIndex`, applies the same URL scheme validation as `createItem`, and rejects `file:` URLs with `ERR_VALIDATION`. If an existing item with an identical normalized URL already exists in `tj:items`, the handler rejects with `ERR_DUPLICATE_URL` (non-blocking duplicate-URL guard — no item is created). On success, the handler calls `claimTabForItem` to immediately associate the new item with the tab without waiting for the next reconcile pass. Subject to the safe-mode write gate.

**Note on `MSG_DEMOTE_ITEM` (B-017):** Demotes a saved item back to an unclaimed floating tab. The operation executes four steps in order: (1) delete the item from `tj:items` via `writeTransaction`; (2) clear any drift record for the item from `tj:drift`; (3) write a `FloatingGroup` record to `tj:floatingGroups` so the tab can be re-associated if the window is closed and reopened; (4) release the tab claim from `claimsMirror` and `storage.session`. **Partial atomicity documented limitation:** steps 1–4 are not wrapped in a single `writeTransaction`. Steps 2–4 each write to their respective partitions independently. A SW termination between steps leaves the data in an intermediate state (item deleted but drift/floating/claims records not yet cleared). These orphan records are inert and cleaned up lazily (drift at `MSG_LIST_ITEMS` read time; unresolved floating records on next reconcile). Subject to the safe-mode write gate.

**Note on duplicate-name warning (B-006):** `createGroup` and `updateGroup` perform a non-blocking name-uniqueness check scoped to groups sharing the same `parentId`. If a group with an identical `.trim()`-normalized name already exists in that scope, the operation succeeds but the success `data` object includes a `warning: string` field describing the collision. The `warning` field is set on the return value only — it is never written to `tj:groups` or any storage partition. The check is enforced in `background/storage/groups.js`.

### Dispatch flow

1. `onMessage` listener rejects senders where `sender.id !== chrome.runtime.id`
   with `ERR_DIRECT_WRITE`.
2. Messages whose `type` does not start with `tj/` are ignored (return
   `false`) so other listeners can claim them.
3. `await readyPromise`; on reject, respond with `ERR_NOT_READY`.
4. Route via switch on `type`; success wraps result in `{ok: true, data}`,
   failure wraps in `errorEnvelope(err)`.
5. Handler returns `true` synchronously to keep the channel open for the
   async `sendResponse`.

### Manifest permissions (reference)

Per R0 decision #11, **B-001a adds zero new manifest permissions**. The
manifest currently declares: `tabs`, `tabGroups`, `storage`, `sidePanel`,
`search`. `externally_connectable` is deliberately absent — the sender-id
runtime check in `storage-handlers.js` assumes it (see M9).

---

## 6. Write-Boundary Enforcement

Dual-layer defense so a single bypass cannot reach `chrome.storage.local.set`.

### Static layer — ESLint

`.eslintrc.json` applies `no-restricted-imports` via an `overrides` block
scoped to `sidepanel/**`, `newtab/**`, `popup/**`, and `components/**`. The
denylist forbids any import from `**/background/storage/**` or
`**/background/messages/**`. UI code can only reach the storage layer via
`shared/messages.js` + `chrome.runtime.sendMessage`.

### Runtime layer — sender + SW-context checks

- **Sender guard** (`storage-handlers.js:108`): every `onMessage` call that
  does not carry `sender.id === chrome.runtime.id` is rejected with
  `ERR_DIRECT_WRITE`. Sufficient today because `externally_connectable` is
  not declared in the manifest (M9 documented invariant).
- **SW-context guard** (`write-transaction.js:64`): `writeTransaction` calls
  `assertServiceWorkerContext()` on every invocation. It verifies
  `self instanceof ServiceWorkerGlobalScope` **and** `chrome.runtime.id` is
  defined. Failing either check throws `ERR_DIRECT_WRITE` before any storage
  op executes.

### Test hatch (H5)

The SW-context guard would always fail under jsdom/Node during the R5 test
suite. The hatch: the chrome-mock sets `chrome.__tabJunkieTestMock = true`
at setup, and `isTestEnvironment()` short-circuits the guard when it sees
that sentinel. Production code never sets the sentinel; real extensions run
through the full guard path.

### Known gap — M1 (deferred)

The ESLint rule uses a **UI-folder denylist** (`sidepanel/`, `newtab/`,
`popup/`, `components/`). Folders outside that list — especially `shared/**`
and `lib/**` — are not covered. A hypothetical future `shared/util.js` that
imported from `background/storage/` would pass the static check. Tracked as
**M1 in `docs/SPRINT_FINDINGS.md`** and handed off to **B-053**, which will
flip to allowlist semantics (only `background/**` may reach
`background/storage/**`). The runtime layer still blocks this bypass today,
so the gap is static-only.

---

## 7. Error Taxonomy

All storage rejections are `StorageError` instances with `{ code, message, cause? }`.
Serialized over the message boundary as `{ code, message }` only (no cause
leak). **Canonical home: `shared/errors.js`** (moved from `background/storage/errors.js` in B-001d; `background/storage/errors.js` now re-exports from `shared/errors.js` for backward compatibility).

| Code | When it fires (post-R4 fixes) | Caller recovery |
|---|---|---|
| `ERR_NOT_READY` | `readyPromise` rejected during message dispatch | Show skeleton / safe-mode banner (B-001b), retry |
| `ERR_NOT_FOUND` | `update*`/`get*` cannot find id; `createItem`/`updateItem` referencing a nonexistent `groupId`; `createGroup` with unknown `parentId` (ruling #4 reclassified from `ERR_VALIDATION`) | Refresh view / inline form error |
| `ERR_DEPTH_EXCEEDED` | `parentId` would produce depth > 1; or nesting a group that already has children | Inline form error |
| `ERR_CIRCULAR_REF` | `updateGroup` sets `parentId` to self or a descendant | Inline form error |
| `ERR_DIRECT_WRITE` | Foreign `sender.id` on message; or `writeTransaction` invoked outside a SW context (not via test hatch) | Non-recoverable bug — log + throw |
| `ERR_CORRUPT_DATA` | Shape validator fails on read, after mutation, or when `initializePartitions` cannot reach storage | Other partitions still usable; banner (B-001b); offer export-and-reset |
| `ERR_ID_COLLISION` | **Intentionally unreachable** — ULID generator cannot collide under its strict-monotonic contract. Reserved code (ruling #5) | n/a |
| `ERR_QUOTA_EXCEEDED` | `chrome.storage.local.set` rejects with a quota-class error (detected via `isQuotaError`) | Prompt user to delete items (B-001b UI) |
| `ERR_VALIDATION` | Missing/wrong-type payload field; whitespace-only title/name; disallowed URL scheme; length caps; unknown patch field; attempted mutation of `id`/`createdAt`/`updatedAt` (via patch) | Inline form error |
| `ERR_TX_CONFLICT` | Non-`StorageError` thrown from mutator; `storage.get`/`set` failure other than quota; unhandled error surfaced through `errorEnvelope` | Retry; fall back to safe mode on repeat |
| `ERR_SAFE_MODE` | Write operation attempted while stored `schemaVersion > KNOWN_VERSION`; emitted by the write gate in `storage-handlers.js` before dispatch (B-001b) | Show "update required" banner; reads still work |
| `ERR_DUPLICATE_URL` | `MSG_PROMOTE_TAB` handler finds an existing item in `tj:items` whose normalized URL matches the tab URL being promoted (B-016) | Inline error — surface to user; no item created |

**Reachability audit** (updated through B-006 + B-016 + B-017): every code above is either
thrown by at least one path in the shipped code, or deliberately unreachable
(`ERR_ID_COLLISION`). `ERR_SAFE_MODE` is reachable via the safe-mode write
gate in `storage-handlers.js`. `ERR_DUPLICATE_URL` is reachable via the `MSG_PROMOTE_TAB` handler.

---

## 8. Field Validation

Caps are enforced at the storage boundary and exported from `partitions.js`
so UI code can mirror them without redeclaring numbers.

| Field | Constraint |
|---|---|
| `item.title` | Non-empty after `.trim()`; `length <= MAX_TITLE (2048)` |
| `item.url` | Non-empty; `length <= MAX_URL (4096)`; parseable via `new URL(url)`; protocol in `{http:, https:, ftp:, mailto:}` |
| `item.groupId` | `string \| null`; if non-null, must reference an existing group in the same serialized snapshot (FK check via cross-partition tx op) |
| `item.sortOrder` | Finite number; default `0` on create (ruling #2) |
| `group.name` | Non-empty after `.trim()`; `length <= MAX_NAME (256)` |
| `group.color` | Must be a member of `GROUP_COLORS` — the 9-color allowlist defined in `shared/constants.js` (B-006); enforced in `groups.js` at create and update time; `ERR_VALIDATION` if not in palette |
| `group.parentId` | `string \| null`; depth must stay `<= 1`; no cycles; target must exist |
| `prefs.theme` | `'light' \| 'dark' \| 'system'` |
| `prefs.displayMode` | `'sidepanel' \| 'window'` |
| `prefs.newTabOverride` | `boolean`, default `false` (H3 fix) |
| `prefs.autoCollapseSubGroups` | `boolean`, default `false` |

**Disallowed URL schemes** (rejected at storage boundary as XSS prophylactic,
H2 fix): `javascript:`, `data:`, `chrome:`, `chrome-extension:`,
`blob:`, and anything else not explicitly allowlisted. The scheme allowlist (B-001d) is: `http`, `https`, `file`. Storage is the
chokepoint — downstream UI cannot be trusted to sanitize href attributes.

**URL normalization via `shared/url.js` (B-001d).** `normalizeUrl(url, mode)` is the canonical normalization entry point:
- **`forStorage` mode:** strips fragment (`#…`), applies protocol defaulting (bare hostnames without scheme get `https://` prepended), lowercases hostname. Used when writing drift records to `tj:drift`.
- **`forMatch` mode:** all `forStorage` transforms plus trailing-slash removal on path-only URLs without a query string. Used for claim matching and drift comparison in `tab-claims.js` and `drift.js`.
- Both modes reject URLs whose scheme is not in the allowlist (`http`, `https`, `file`) with `ERR_VALIDATION`.
- `shared/url.js` replaces the inline `normalizeForMatch` helper that was previously local to `tab-claims.js`.

**Immutable fields.** `id` and `createdAt` are rejected as patch fields in
both `updateItem` and `updateGroup`. `updatedAt` is stripped from the allowed
patch list (M2 fix) and always recomputed by the mutator.

---

## 9. Performance Standards

| Metric | Target | Owner | Current status |
|---|---|---|---|
| Single-item read round-trip (`getItem`) | P95 < 20ms on 1k-item collection | B-001a | Verified in `tests/perf.test.js` via chrome-mock |
| Single-item write round-trip (`updateItem`) | P95 < 20ms on 1k-item collection | B-001a | Verified in `tests/perf.test.js` via chrome-mock |
| `writeTransaction` serialization under concurrent callers | No lost updates | B-001a | Verified in integration tests |
| Migration run over max realistic dataset (1k items, 100 groups) | < 500ms in chrome-mock | B-001b (AC9) | Verified in migration perf test |
| `LiveTabIndex` cold-start rebuild (50 open tabs) | < 100ms in chrome-mock | B-001c (AC1) | Verified in live-tab perf test |
| `TabClaims` reconciliation (500 items, 50-tab index) | < 50ms in chrome-mock | B-001c (AC10) | Verified in claims perf test |
| Drift write round-trip (`writeDrift`) | P95 ≤ 20ms in chrome-mock | B-001d | Verified in drift perf test |
| Floating-group re-association (50 records) | ≤ 100ms in chrome-mock | B-002 | Verified in floating-groups perf test |
| Real-browser perf (`chrome.storage.local`, not mock) | not measured | — | UAT validated correctness only — real-browser latency is unverified |
| Sidepanel first paint | < 200ms (500-item) | B-022 | Deferred — UI not yet built |
| Fuzzy search P95 | < 50ms (1k-item) | — | Deferred — search not yet in scope |

---

## 10. What B-001a Did NOT Ship (updated through B-001d + B-002 + B-006 + B-016 + B-017 + B-050 + B-019 + B-020 + B-021 + B-011 + B-012 + B-015 + B-053 + B-013 + B-005 + B-054 + B-018)

Items fully resolved by B-001b, B-001c, B-001d, B-002, B-006, B-016, B-017, B-050, B-019, or B-020 are marked **DONE**. The entire B-001 family (a/b/c/d) is now complete. Remaining items are open.

| Handoff | Owner | Status | Detail |
|---|---|---|---|
| Schema version field consumption + migration runner + `ready` barrier | **B-001b** | **DONE** | `runMigrations()` replaces the stub `readyPromise`. `tj:meta.schemaVersion` is now read, compared to `KNOWN_VERSION`, and acted upon on every cold start. See §10.6. |
| Read-only safe-mode (downgrade path, R0 decision #9) | **B-001b** | **DONE** | `isSafeMode()` in `migration.js`; write gate in `storage-handlers.js`; `ERR_SAFE_MODE` returned to callers. |
| Quota warning flag (80% threshold per R0 decision #8) | **B-001b** | **DONE** | `evaluateQuota()` runs after migrations; `quotaWarning` flag exposed via `MSG_GET_STATUS`. UI banner deferred to the sidepanel item (B-022). |
| Legacy `junkie_*` storage key migration | **B-001b** | **DONE** | `migrateLegacyKeys()` runs best-effort post-migration; known legacy keys are shape-mapped to Items and removed. |
| `LiveTabIndex` (ephemeral SW-memory index of live tabs) | **B-001c** | **DONE** | `background/tabs/live-tab-index.js` — `Map<tabId, {url,windowId,active,audible,index}>`, built on cold start, kept current by event handlers. |
| `TabClaims` disambiguation table | **B-001c** | **DONE** | `background/tabs/tab-claims.js` — `storage.session` under `tj:tabClaims`; in-memory mirror; reconciled on cold start; released on tab close/URL change. |
| `MSG_LIST_ITEMS` enriched with `liveStates` | **B-001c** | **DONE** | Response shape is now `{ items, liveStates, driftRecords }`. |
| Drift record persistence | **B-001d** | **DONE** | `background/tabs/drift.js` writes/clears `tj:drift`; `driftedToUrl` normalized via `shared/url.js` (forStorage mode); fragments stripped before storage; unclaimed-tab events are no-ops. `MSG_LIST_ITEMS` response now includes `driftRecords`. See §10.7. |
| Floating-group re-association | **B-002** | **DONE** | `background/tabs/floating-groups.js` implements position-match → URL-fallback → retain-unresolved strategy. First-in-array-wins on ties. Claims propagated to `claimsMirror`. No TTL on unresolved records (documented limitation). See §10.8. |
| Group color palette enforcement + `shared/constants.js` | **B-006** | **DONE** | `GROUP_COLORS` (9-color allowlist) defined in `shared/constants.js`; enforced in `groups.js` at create/update time via `ERR_VALIDATION`. Duplicate-name warning (non-blocking, same-parentId scope, `warning` field on return only). See §10.9. |
| Promote tab to saved item | **B-016** | **DONE** | `MSG_PROMOTE_TAB` handler in `storage-handlers.js`; `file:` scheme blocked; `ERR_DUPLICATE_URL` on URL collision; `claimTabForItem` called on success. See §5 notes. |
| Demote saved item to floating tab | **B-017** | **DONE** | `MSG_DEMOTE_ITEM` handler; operation order: delete → clearDrift → saveFloating → releaseClaim; partial atomicity is a documented limitation. See §5 notes and §10.9. |
| State broadcast to all surfaces | **B-050** | **DONE** | `background/broadcast.js` with `SCOPE` enum; `MSG_STATE_CHANGED` push on every mutation + tab event; fire-and-forget delivery; cold-start suppression via `isClaimsReady` gate; `MUTATION_BROADCASTS` table maps handler names to broadcast payloads. `lastAccessedAt` added to `updateItem` allowed fields (latent bug fix). See §10.10. |
| Navigate to item | **B-019** | **DONE** | `MSG_NAVIGATE_TO_ITEM` handler; switches to claimed tab or opens new tab with immediate `claimTabForItem` call on new-tab path. |
| Close tabs | **B-020** | **DONE** | `MSG_CLOSE_TABS` handler; partitions `ids` array into valid vs already-gone; closes valid tabs via `chrome.tabs.remove`; `onRemoved` handles claim cleanup. |
| Sidepanel UI | **B-022 / B-054** | **DONE** | Full sidepanel implementation: group tree rendering, live-state patching, drag reorder, keyboard navigation, CRUD dialogs, filter, theme support, skeleton loader, empty state. See §23. |
| Newtab UI | **B-035** | pending | Currently a stub `newtab.html`. |
| Popup UI | **B-036** | pending | Currently a stub `popup.html`. |
| ESLint allowlist refactor + circular-dep extraction | **B-053** | pending | Flip denylist → allowlist (only `background/**` may reach `background/storage/**`); resolve the circular `partitions.js` ↔ `write-transaction.js` import that `jsconfig.json` currently papers over. |

---

## 10.5 LiveTabIndex & TabClaims Architecture (B-001c)

### LiveTabIndex

- **Location:** `background/tabs/live-tab-index.js`, SW-memory only.
- **Shape:** `Map<number, {url: string, windowId: number, active: boolean, audible: boolean, index: number}>`. The `index` field (tab position within its window) was added in B-001d to support floating-group position-match re-association.
- **Population:** `buildLiveTabIndex()` calls `chrome.tabs.query({})` once on cold start and clears + repopulates the map. The call is made at module scope via `initializeLiveState()` which runs `buildLiveTabIndex()` and `readyPromise.then(listItems)` concurrently (M2 optimization — migration and index build overlap).
- **Mutation:** `updateTabEntry(tabId, patch)` merges a partial patch; `removeTabEntry(tabId)` deletes; `removeTabsByWindow(windowId)` batch-deletes and returns removed tabIds.
- **Invariant:** never written to `chrome.storage.local` (AC4). Tab event handlers are the sole mutators after cold start.

### TabClaims

- **Location:** `background/tabs/tab-claims.js`.
- **Persistence:** `chrome.storage.session` under key `tj:tabClaims`, cleared by Chrome on browser restart (AC8). An in-memory `claimsMirror` record is maintained for synchronous reads by `buildLiveStates`.
- **Shape:** `Record<string, number>` — itemId → tabId.
- **Invariant:** no two claims share the same tabId (AC3).
- **`claimTabForItem(itemId, tabId)`** (added B-001d/B-002): writes a new claim directly to `claimsMirror` and flushes to `storage.session`. Used by floating-group re-association after a successful match to register the resolved tab without waiting for the next full `reconcileClaims` pass.

### Claim lifecycle

1. **Cold start — reconcile:** `reconcileClaims(items)` loads existing session claims, validates each against LiveTabIndex (tabId still live, URL still matches after normalization), discards stale claims, then assigns unclaimed items to unclaimed tabs in ascending `sortOrder` (first-unclaimed-wins). Final state is written back to `storage.session` atomically.
2. **Tab closed — release:** `chrome.tabs.onRemoved` → `releaseClaimByTab(tabId)` → removes the entry from `claimsMirror` and writes back to `storage.session`.
3. **URL change — reevaluate:** `chrome.tabs.onUpdated` (URL change) → per-tab 100ms debounce → `reevaluateTab(tabId, newUrl, items)` — releases stale claim if URL no longer matches, re-assigns to a matching unclaimed item if the new URL matches one.
4. **Window closed — batch release:** `chrome.windows.onRemoved` → `removeTabsByWindow(windowId)` → `releaseClaimByTab` for each removed tabId. Early return if `isClaimsReady()` is false (M4 — reconcile handles it).

### Event handlers registered in tab-events.js

| Event | LiveTabIndex mutation | Claims mutation | Drift hook | storage.local writes |
|---|---|---|---|---|
| `chrome.tabs.onUpdated` | `updateTabEntry` | `reevaluateTab` (debounced 100ms) via `storage.session` | drift detection (URL change on claimed tab triggers `drift.js` write to `tj:drift`) | `tj:drift` only (via drift.js) |
| `chrome.tabs.onActivated` | deactivate prev tab in window; `updateTabEntry` active=true | none | none | **none** |
| `chrome.tabs.onRemoved` | `removeTabEntry` | `releaseClaimByTab` via `storage.session` | drift cleared on tab close if claimed | `tj:drift` only (via drift.js) |
| `chrome.windows.onRemoved` | `removeTabsByWindow` | batch `releaseClaimByTab` via `storage.session` | none | **none** |

**MV3 registration requirement:** `registerTabEventListeners(readyPromise)` must be called synchronously at module scope in `service-worker.js` before the first `await`. It only calls `chrome.*.addListener` synchronously; async work (claims reevaluation) is deferred inside the handlers via promises.

### Read-time merge — buildLiveStates

`buildLiveStates(items)` in `tab-claims.js` is a pure synchronous function. It walks `claimsMirror` and `liveTabIndex` to produce `Record<itemId, {live, active, audible}>`. If `isClaimsReady()` is false (before the first reconcile completes), it returns all-false defaults. Called by the `MSG_LIST_ITEMS` handler in `storage-handlers.js` to enrich the response without any storage read.

### URL normalization

`normalizeForMatch(url)` strips fragment (`#…`), lowercases hostname, and removes trailing slash (path-only URLs without a query string) before comparison. This prevents fragment-only variations and case differences from preventing claim matches.

---

## 10.6 Migration Runner Architecture (B-001b)

### Core constants and registry

- **`KNOWN_VERSION`** (`migration.js`): the schema version the current codebase understands. Currently `1`. Bump alongside each new entry in `MIGRATION_STEPS`.
- **`MIGRATION_STEPS`**: ordered array of `{ fromVersion, toVersion, migrate(snapshot) }` objects. Currently empty (no migration from v1 to v2 has been written). A static assertion at module load time verifies the array forms a contiguous chain (`step[i].toVersion === step[i+1].fromVersion`); broken chains throw immediately (F2).
- **`migrate(snapshot)`**: receives a deep-cloned JSON snapshot (F6 — prevents prototype pollution), returns the mutated snapshot.

### runMigrations() flow

```
runMigrations():
  1. initializePartitions()               // idempotent, writes defaults via writeTransaction
  2. readPartition(PARTITION_META)        // read tj:meta
  3. Validate stored.schemaVersion (type, finite, >= 1) → reject ERR_CORRUPT_DATA if bad
  4. stored > KNOWN_VERSION  → set safeMode = true, continue (resolve, not reject)
  5. stored < KNOWN_VERSION  → collect steps, run in single writeTransaction
                                (scaffold: wraps only PARTITION_META — F3)
                                → reject ERR_TX_CONFLICT if step throws
  6. migrateLegacyKeys()                  // best-effort, non-blocking on failure
  7. evaluateQuota()                      // set quotaWarning, quotaBytesInUse, quotaBytesTotal
```

### Safe-mode behaviour

- `isSafeMode()` returns `true` when `stored.schemaVersion > KNOWN_VERSION`.
- `readyPromise` **resolves** (not rejects) in safe mode so reads remain available.
- All write message types return `ERR_SAFE_MODE` from the gate in `storage-handlers.js`.
- Safe-mode is reset on SW restart (module-level state); if the extension is updated, the new `KNOWN_VERSION` will match or exceed the stored version, lifting safe mode.

### Quota monitor

`evaluateQuota()` runs after every migration (and is also called indirectly after writes via `writeTransaction`'s `lastQuotaSample`):

1. Read `chrome.storage.local.QUOTA_BYTES` (default 5 MiB if unavailable).
2. Call `_peekQuotaSample()` from `write-transaction.js` for the cached post-write byte count.
3. On first cold start (no writes yet), fall back to `chrome.storage.local.getBytesInUse(null)` (M2).
4. Set `quotaWarning = (bytesInUse / total) >= 0.80`.
5. All quota fields are exposed via `MSG_GET_STATUS` / `getSystemStatus()`.

### Legacy key cleanup (migrateLegacyKeys)

- Only fetches the four known keys: `junkie_bookmarks`, `junkie_groups`, `junkie_pinned_tabs`, `junkie_preferences` (M4 — no wildcard scan).
- Shape-maps `junkie_bookmarks` entries to `Item` objects: fresh ULIDs, null groupId, sortOrder 0, URL validated through the same scheme-allowlist + length check as `createItem` (F5 — invalid entries silently discarded per AC7).
- Appended to `tj:items` via `writeTransaction`.
- All legacy keys removed via `chrome.storage.local.remove(legacyKeys)` — acceptable because these are foreign keys, not `tj:*` partitions (the single-writer invariant applies only to `tj:*` keys).
- Best-effort: failure logs a warning but does not reject `readyPromise`.

### Known scaffold limitation

The current migration runner wraps steps in a `writeTransaction` that only touches `PARTITION_META` (F3). This is adequate for v1 (no steps defined yet). When a real migration step needs to atomically mutate multiple partitions, the `ops` array passed to `writeTransaction` must be extended to include all touched partitions within the same call. This is documented inline in `migration.js` and must be addressed before any multi-partition migration step is added.

---

## 10.7 Drift Detection Architecture (B-001d)

### Overview

`background/tabs/drift.js` is the sole path for writing and clearing drift records in `tj:drift`. It is called from `tab-events.js` when a URL-change event fires on a tab that holds a claim for a saved item.

### Write path

1. **Trigger:** `chrome.tabs.onUpdated` fires with a URL change on a tab whose `tabId` is present in `claimsMirror`.
2. **Unclaimed-tab no-op:** if the tab has no claim, `drift.js` exits immediately — no storage write.
3. **Fragment stripping:** the new URL is passed through `normalizeUrl(url, 'forStorage')` from `shared/url.js`. This strips the fragment (`#…`), lowercases the hostname, and applies protocol defaulting before the drift record is written. Fragments are not stored.
4. **Scheme validation:** if the normalized URL's scheme is not in the allowlist (`http`, `https`, `file`), the drift write is silently skipped and an error is logged (not thrown — drift is best-effort).
5. **Length cap:** `driftedToUrl` is capped at `MAX_URL` (4096). URLs exceeding this limit cause the drift write to be skipped.
6. **Storage write:** a `writeTransaction` op mutates `tj:drift`, setting `drift[itemId] = { itemId, driftedToUrl: normalizedUrl, detectedAt: Date.now() }`.

### Clear path

Drift is cleared (the record deleted from `tj:drift`) when:
- The claimed tab is closed (`chrome.tabs.onRemoved`). **B-015 resolved this:** `clearDrift(releasedItemId)` is now `await`ed after `releaseClaimByTab` in the `tabs.onRemoved` handler (async `.then` callback) and in the `windows.onRemoved` bulk path (via `Promise.allSettled` over all removed tabs). Previously the clear-on-close was implicit; it is now explicit in `tab-events.js`.
- The claimed tab's URL returns to a value that matches the item's stored URL (as determined by `normalizeUrl(url, 'forMatch')`).

### Sidepanel drift icon lifecycle (B-011)

The drift icon DOM is managed by `_ensureIndicators(row, live, isDrifted)` in `sidepanel/sidepanel.js`. This function was extended in Sprint 9 from its original audible-only signature `_ensureIndicators(row, live)` to handle drift icon creation and removal.

**Signature:** `_ensureIndicators(row, live, isDrifted)`

**Behavior:**
- **`isConnected` guard:** Early-returns if `row.isConnected` is false, preventing DOM manipulation on detached nodes during rapid re-renders or race conditions.
- **Drift false-to-true:** When `isDrifted` is truthy and no `.item-drifted-icon` exists, creates the icon span via `_createDriftedIcon()` factory (B-054 R4 fix — extracted from inline SVG to shared factory) inside `.item-indicators` (creating the container div if needed, inserted before `.item-actions`). Sets `aria-label="Tab has navigated away from its saved URL"`. SVG markup is hardcoded (no user data).
- **Drift true-to-false:** When `isDrifted` is falsy and `.item-drifted-icon` exists, removes the icon. If the `.item-indicators` container is now empty, removes it too.
- **Call site:** Invoked from `refetchAndPatchLiveState` as `_ensureIndicators(row, live, !!drifted)` where `drifted = driftRecords[id]`.

**Catch-path cleanup:** When `MSG_LIST_ITEMS` fails in `refetchAndPatchLiveState`, the catch block performs atomic indicator cleanup: `indicators.replaceChildren()` followed by `indicators.remove()`. This removes all child icons and the container in one pass rather than querying each icon type individually.

### Invariants

- `tj:drift` is keyed by `itemId`, not `tabId`. At most one drift record per item exists at any time.
- Drift records do not have a TTL. Stale records (item deleted while drift exists) are cleaned up lazily during the `MSG_LIST_ITEMS` read: items absent from `tj:items` are omitted from the `driftRecords` response field.

---

## 10.8 Floating-Group Re-association Architecture (B-002)

### Overview

`background/tabs/floating-groups.js` resolves entries in `tj:floatingGroups` to currently open tabs, propagating claims for matched items. It runs on SW cold start after `reconcileClaims` completes and is also triggered when a new window opens.

### Resolution strategy

For each `FloatingGroup` record (`{ groupId, itemId, windowId, tabIndex, url, savedAt }` — `itemId` added in B-013):

1. **Position-match:** find a live tab in `liveTabIndex` with matching `windowId` and `tabIndex`. If found and its URL matches `record.url` (via `normalizeUrl` forMatch), claim it.
2. **URL-fallback:** if the position match fails (tab moved), scan all unclaimed tabs in `liveTabIndex` whose normalized URL matches `record.url`. First match wins (first-in-array order).
3. **Retain unresolved:** if neither strategy finds a match, the `FloatingGroup` record is left in `tj:floatingGroups` unchanged. There is no TTL — unresolved records persist until explicitly cleared (documented limitation; a future cleanup sweep is tracked as tech debt).

### Tie-break and claim propagation

- **First-in-array-wins:** when multiple `FloatingGroup` records could claim the same tab, the record that appears first in the `tj:floatingGroups` array wins. Subsequent records fall through to URL-fallback or remain unresolved.
- **Claim propagation:** a successful match calls `claimTabForItem(record.itemId, tabId)` from `tab-claims.js`, writing the claim to `claimsMirror` and flushing to `storage.session`. Records lacking a valid `itemId` (pre-B-013 orphans) are silently pruned without claim propagation. The resolved record is then removed from `tj:floatingGroups` via `writeTransaction`.

### B-018 correctness fixes

B-018 (verification item) confirmed the persistence-across-restart flow and fixed two race conditions found in R4:

1. **TOCTOU in `pruneResolvedFloatingGroups`:** the prune function was filtering against a stale `records` snapshot captured before the `writeTransaction` callback. Fixed: the mutator now reads the live `current` value from `writeTransaction` and filters by a `resolvedItemIds` Set (stable keys, not positional indices).
2. **Premature resolution marking:** `resolvedItemIds.add(record.itemId)` executed before `await claimTabForItem()` returned. If the claim failed, the record was already marked resolved and would be pruned. Fixed: the `add` call was moved to after successful claim; on failure the tab is released and a warning is logged.

These fixes do not change the resolution strategy, tie-break rules, or storage schema.

### Known limitation

Unresolved `FloatingGroup` records have no expiry. A group whose window was permanently closed will accumulate stale records indefinitely. A future cleanup job (triggered by `MSG_DELETE_GROUP` or a periodic SW alarm) is not yet implemented.

---

## 10.9 Sprint 4 Additions — B-006 + B-016 + B-017

### B-006 — Group Color Palette Enforcement

`shared/constants.js` is the canonical home for `GROUP_COLORS`, an ordered 9-color allowlist of theme token strings. `background/storage/groups.js` imports this constant and validates the `color` field on every `createGroup` and `updateGroup` call. A color value not present in `GROUP_COLORS` throws `ERR_VALIDATION` before the `writeTransaction` executes.

**Duplicate-name warning.** `createGroup` and `updateGroup` check whether a group with the same `.trim()`-normalized `name` already exists among groups sharing the same `parentId`. The check is read-only (no separate write). If a collision is found, the operation completes successfully but the returned `Group` object carries an additional `warning: string` property. The `warning` field is never written to `tj:groups` or any storage partition — it is a transient annotation on the return value only.

### B-016 — MSG_PROMOTE_TAB Handler

The `MSG_PROMOTE_TAB` handler:

1. Looks up the tab's current URL in `LiveTabIndex` by `tabId`; returns `ERR_NOT_FOUND` if the tab is not in the index.
2. Rejects `file:` scheme URLs with `ERR_VALIDATION` (in addition to the standard scheme allowlist check that rejects all non-`http`/`https`/`file` schemes — `file:` is an extra block specific to promote).
3. Normalizes the URL via `normalizeUrl(url, 'forStorage')` and scans `tj:items` for any existing item whose stored URL matches. If found, returns `ERR_DUPLICATE_URL` — no item is created.
4. Calls `createItem` via the standard path (ULID generation, FK check, `writeTransaction`).
5. Calls `claimTabForItem(itemId, tabId)` to immediately register the claim in `claimsMirror` and `storage.session`.

Subject to the safe-mode write gate.

### B-017 — MSG_DEMOTE_ITEM Handler

The `MSG_DEMOTE_ITEM` handler demotes a saved item to an unclaimed floating tab. Steps execute in this order:

1. **Delete item** — `deleteItem(id)` via `writeTransaction` on `tj:items`. If the item does not exist, the operation is a silent no-op (idempotent delete per ruling #3) and subsequent steps still run.
2. **Clear drift** — if a drift record exists for the item in `tj:drift`, it is cleared via `writeTransaction`.
3. **Save floating record** — if the item has a claim in `claimsMirror`, a `FloatingGroup` record is written to `tj:floatingGroups` via `writeTransaction` so the tab can be re-associated on the next window open.
4. **Release claim** — `releaseClaimByTab(tabId)` removes the entry from `claimsMirror` and flushes to `storage.session`.

**Documented limitation — partial atomicity.** Steps 1–4 each issue a separate `writeTransaction` (or `storage.session` write). They are not wrapped in a single atomic transaction. A SW termination between steps leaves orphan records. These are inert: the drift record is filtered at `MSG_LIST_ITEMS` read time (item absent from `tj:items`); the floating record is ignored on next reconcile if no live tab matches; the stale claim is released on the next tab close or reconcile pass. This partial atomicity is an accepted trade-off and is not expected to cause data loss or user-visible corruption.

---

## 10.10 Broadcast Architecture (B-050)

### Overview

`background/broadcast.js` is a single-responsibility module that pushes `MSG_STATE_CHANGED` notifications to every open extension surface (sidepanel, newtab, popup) after each mutation or tab event. Surfaces treat these as cache-invalidation signals and re-fetch state via `MSG_LIST_ITEMS` / `MSG_LIST_GROUPS` as needed.

### SCOPE enum

```js
SCOPE.ITEMS      // tj:items mutation
SCOPE.GROUPS     // tj:groups mutation
SCOPE.PREFS      // tj:prefs mutation
SCOPE.LIVE       // live-state change (tab event)
SCOPE.ALL        // full refresh hint
```

### Fire-and-forget delivery

`broadcastState(scope, payload)` calls `chrome.runtime.sendMessage` to each registered view URL without awaiting a response. Errors (no listeners, view not open) are silently swallowed — delivery is best-effort by design. The SW does not retry and does not track acknowledgement.

### Cold-start suppression

Broadcasts triggered by tab events during cold-start reconciliation are suppressed via the `isClaimsReady()` gate. Events fired before `reconcileClaims()` completes would push stale live-state to surfaces; suppressing them ensures the first broadcast a surface receives reflects a fully reconciled state.

### Ordering guarantee

`broadcastState` is called synchronously at the end of each handler, after the `writeTransaction` resolves. This ensures any surface that immediately re-fetches on receiving `MSG_STATE_CHANGED` observes the committed state.

### MUTATION_BROADCASTS table

A static table in `broadcast.js` maps message handler names to the `SCOPE` value used for their broadcast. This keeps handler code free of broadcast logic: each handler calls `broadcastState(MUTATION_BROADCASTS[type], ...)` without knowing the scope details.

### lastAccessedAt bug fix

`lastAccessedAt` was inadvertently excluded from `updateItem`'s `validatePatch` allowlist, causing tab-navigation updates to be silently rejected. The field is now explicitly allowed, correcting drift in last-access timestamps.

---

## 11. Build Deviations from R2 Plan

Per CLAUDE.md R6, every deviation between `docs/design/B-001a.md` and the
shipped code is captured here.

### C-level (CRITICAL fixes, from R4)

- **C1 — `initializePartitions` routes through `writeTransaction`.**
  R2 §8 said "all single-partition writes in `items.js`/`groups.js`/
  `preferences.js` internally route through `writeTransaction`" but did
  **not** mention init. R3 originally used a bare `chrome.storage.local.set`
  there. R4 code-reviewer caught that as an AC6 violation. Now init builds
  an array of read-only mutator ops and passes them through the
  transaction; quota errors surface as `ERR_QUOTA_EXCEEDED` through the
  normal tx layer (which also subsumed H7).

- **C2 — FK validation for `groupId` is a cross-partition read inside
  `writeTransaction`.** R2 §4 did not specify that `createItem`/`updateItem`
  must verify that a non-null `groupId` points at an existing group. R4
  qa-reviewer caught the silent-corruption risk. The fix adds a `PARTITION_GROUPS`
  read-only mutator op immediately before the `PARTITION_ITEMS` mutator op;
  the groups snapshot is captured in a closure and consumed by
  `assertGroupExists()` inside the items mutator. Both ops execute inside
  the same single get → mutate → set cycle, so the check and the mutation
  observe the same serialized state.

### H-level (HIGH fixes)

- **H2 — URL scheme allowlist.** R2 said "canonical saved URL"; not
  scheme-gated. Now parsed with `new URL` and restricted to `http:`, `https:`,
  `ftp:`, `mailto:`.
- **H1 — Field length caps.** `MAX_TITLE=2048`, `MAX_URL=4096`, `MAX_NAME=256`,
  `MAX_COLOR=32`, exported from `partitions.js`. Not in R2.
- **H3 — `newTabOverride` default flipped to `false`.** R2 had it `true`
  (and so did R3's first draft); contradicted B-039 AC. Fixed.
- **H4 — `MSG_GET_GROUP` added to the message registry.** R2 §4 exposed
  `getGroup(id)` as a public API but R2 §5 omitted the message. Now present
  in `shared/messages.js` and wired through `storage-handlers.js`.
- **H5 — Test hatch `chrome.__tabJunkieTestMock` sentinel.** R2's
  `assertServiceWorkerContext` left no escape for the Node/jsdom test
  environment. The sentinel + `isTestEnvironment()` short-circuit were not
  in R2; they are now a documented, inert-in-production hatch.
- **H6 — `deleteItem` / `deleteGroup` idempotent silent no-op** (ruling #3).
  R2 §7 implied `ERR_NOT_FOUND`; the shipped contract is `void` with no
  mutation. Matches `getItem()→null` semantics.
- **H7 — Quota-error classification on init path.** Superseded by C1; the
  init write now shares `writeTransaction`'s `isQuotaError` handling.

### Rulings (design decisions made during R4)

- **Ruling #1 — `updateGroup` blocks nesting a group that already has
  children.** Stricter than R2 §4 but correct under the locked depth-1
  invariant (R0 decision #4). Kept.
- **Ruling #2 — `createItem.sortOrder` defaults to `0`.** R2 left it
  unspecified; R3's first cut used `Date.now()` (non-deterministic, broke
  perf test determinism). Now `0`. Explicit `sortOrder` will arrive with
  drag-reorder (B-030).
- **Ruling #4 — `createGroup` / `updateGroup` with unknown `parentId` →
  `ERR_NOT_FOUND`** (reclassified from `ERR_VALIDATION`). Taxonomy hygiene
  — every missing-id situation uses `ERR_NOT_FOUND` consistently.
- **Ruling #5 — `ERR_ID_COLLISION` kept as a reserved unreachable code.**
  Documented inline in `errors.js`.

### M-level tightenings (also landed before R5)

- **M2** — `updatedAt` removed from the `allowed` patch list in both
  `items.js` and `groups.js`; always recomputed by the mutator.
- **M3** — `writeTransaction` is no longer re-exported from
  `background/storage/index.js`. It is a storage-internal concern.
- **M5** — Whitespace-only titles/names rejected (`title.trim().length === 0`).
- **M7** — `StorageError` messages no longer interpolate raw user input;
  offending identifiers go into the structured `cause` metadata to avoid
  log-injection footguns.
- **M8** — `deleteGroup` captures `Date.now()` once and reuses it across
  both mutators so cascaded `updatedAt` stamps are consistent.

### Deferred (tracked as debt)

- **M1** — ESLint denylist → allowlist refactor (deferred to B-053).
- **M6** — `isQuotaError` string-match hardening (secondary `bytesInUse`
  signal) deferred — low risk under current Chrome wording.
- **M9** — Documented the `sender.id` sufficiency invariant (no
  `externally_connectable`). See §6.

### B-006 / B-016 / B-017 Deviations and Rulings (Sprint 4)

- **S4-D1 — `shared/constants.js` introduced for GROUP_COLORS.** Not in any prior design doc. Required to share the palette between `groups.js` (enforcement) and future UI components without crossing the write-boundary denylist.

- **S4-D2 — Duplicate-name check is non-blocking (warning only).** Earlier drafts considered rejecting duplicate names outright. Ruled non-blocking: groups are identified by ULID, not name; duplicate names are user intent (e.g., "Work" under different parent groups). Warning field keeps the caller informed without breaking the flow.

- **S4-D3 — `file:` scheme is specifically blocked for MSG_PROMOTE_TAB.** The general URL allowlist permits `file:` for stored items (§8). However, promoting a `file:` tab is blocked because file URLs are local to the machine and are not meaningful to share or restore across devices. This is stricter than the stored-item allowlist and is enforced only in the promote handler.

- **S4-D4 — MSG_DEMOTE_ITEM partial atomicity accepted as documented limitation.** Multi-partition atomicity would require restructuring the demote operation into a single `writeTransaction` op array. The current split is intentional for code clarity; the orphan-record failure modes are all inert and self-healing. Tracked in §10.9.

### Unanticipated additions (not in R2 at all)

- **Placeholder HTML stubs** in `newtab/` and `popup/` (sidepanel stub replaced by full implementation in B-054).
  Chrome's manifest validator resolves `chrome_url_overrides.newtab` and
  `action.default_popup` at extension load time — loading the unpacked
  extension for UAT failed until the stubs existed. Remaining stubs will
  be overwritten by B-035 / B-036.
- **`jsconfig.json`** — added to suppress TypeScript-checker false-positive
  warnings arising from a circular import (`partitions.js` imports
  `writeTransaction` for the init path, and `write-transaction.js` imports
  `partitionKey`/`defaultShape`/`assertShape` from `partitions.js`). The
  circular is benign at runtime (both are ESM modules with lazy resolution),
  but the checker complained. **B-053** will extract the shared primitives
  into a separate module and drop the shim.

---

### B-001b Deviations and Rulings

#### R4 fixes landed during B-001b build

- **F2 — Static migration chain assertion.** The R2 design doc implied the runner would detect a broken step registry at runtime during migration execution. Shipped code validates the chain at module load time (static assertion in `migration.js` module scope) so a misconfigured registry fails immediately and loudly on SW cold start rather than during a user-triggered migration path.

- **F3 — Multi-partition atomicity scaffold documented, not implemented.** The R2 design spec called for "atomic multi-partition migration steps". The shipped runner wraps steps in a `writeTransaction` that currently covers only `PARTITION_META`. This is correct for v1 (no steps exist yet). The limitation is documented inline (see §10.6). Multi-partition step support must be added before any step that mutates data partitions.

- **F5 — Legacy import URL validation mirrors createItem.** R2 AC7 said "copy recoverable data or discard if shape is unrecognisable." Shipped code applies the same URL scheme-allowlist + length check used by `createItem` to each legacy bookmark before import. Invalid URLs are silently discarded. This is stricter than R2's unspecified "shape check" but correct per the storage boundary's XSS prophylaxis invariant (§8).

- **F6 — Deep-clone before passing snapshot to step.migrate().** Not specified in R2. Added as a defensive measure against prototype pollution from a malformed migration step modifying the live snapshot object while the runner is iterating.

#### B-001b Rulings

- **Ruling B1b-1 — `MSG_GET_STATUS` bypasses `readyPromise` gate.** The R2 plan did not specify the ordering between the gate and the status query. Ruled: `MSG_GET_STATUS` is handled before the gate so callers can observe migration progress/failure without being blocked by `ERR_NOT_READY`. Consistent with the purpose of the status endpoint.

- **Ruling B1b-2 — `evaluateQuota` falls back to `getBytesInUse` on first cold start.** `_peekQuotaSample()` returns null on first cold start because no write has run yet. Rather than skipping the quota check entirely, the runner does a one-time direct `chrome.storage.local.getBytesInUse(null)` call. This is best-effort; failure leaves `quotaBytesInUse` at 0 (no warning).

- **Ruling B1b-3 — `migrateLegacyKeys` uses known-key allowlist, not wildcard.** R2 said "remove all `junkie_*` keys". Shipped code only fetches and removes the four specific known keys (`KNOWN_LEGACY_KEYS`). This avoids unintended removal of user data stored under unexpected `junkie_*` keys by a third-party or future code.

---

### B-001d Deviations and Rulings

#### Fixes and deviations landed during B-001d build

- **D1 — `shared/errors.js` as canonical error home.** R2 placed `StorageError` + `ERR_*` constants in `background/storage/errors.js`. B-001d moved the canonical definition to `shared/errors.js` so `drift.js` and `url.js` (both under `shared/` or `background/tabs/`) can import error types without crossing the write-boundary denylist. `background/storage/errors.js` now re-exports everything from `shared/errors.js`; no call sites were changed.

- **D2 — `shared/url.js` replaces local `normalizeForMatch`.** The inline `normalizeForMatch` helper in `tab-claims.js` was promoted to `shared/url.js` as `normalizeUrl(url, mode)`. The `forStorage` mode is new (adds protocol defaulting; used by drift writes). The `forMatch` mode is functionally equivalent to the old helper. `tab-claims.js` now imports from `shared/url.js`.

- **D3 — `index` field added to `LiveTabIndex` entry shape.** Not in the original B-001c spec. Required by B-002's position-match strategy. Added to `updateTabEntry` and `buildLiveTabIndex` in B-001d rather than waiting for B-002, so both land atomically.

- **D4 — Drift write is best-effort (no throw on scheme/length violation).** R2's drift spec did not specify the failure mode for invalid URLs. Ruled: drift is a non-critical annotation; scheme or length violations log a warning and silently skip the write rather than throwing `ERR_VALIDATION` (which would surface to the caller as a UI error for a background event they did not initiate).

#### B-001d Rulings

- **Ruling B1d-1 — Fragment stripped before storage, not before comparison.** Fragment stripping happens in `normalizeUrl` forStorage mode, which runs before the drift record is written. The item's stored URL is also fragment-free (enforced by the `createItem` path). Comparison therefore uses fragment-free URLs on both sides consistently.

- **Ruling B1d-2 — Unclaimed-tab URL changes are no-ops in drift.js.** R2 did not specify this edge case. If a tab changes URL but holds no claim, there is no item to associate drift to, so `drift.js` exits immediately without reading `tj:drift`. This avoids a spurious storage read on every unclaimed tab navigation.

---

### B-002 Deviations and Rulings

#### Fixes and deviations landed during B-002 build

- **B2-D1 — No TTL on unresolved FloatingGroup records.** R2 implied a cleanup pass on window close. Shipped code retains unresolved records indefinitely. Cleanup on `MSG_DELETE_GROUP` or a periodic alarm is tracked as tech debt (see §10.8).

- **B2-D2 — `claimTabForItem` added to `tab-claims.js` rather than inline in `floating-groups.js`.** Keeping the write path in `tab-claims.js` ensures the single-mirror invariant is not duplicated. `floating-groups.js` is a pure orchestrator that calls into `tab-claims.js` for all claim mutations.

#### B-002 Rulings

- **Ruling B2-1 — First-in-array-wins for tie-break.** R2 did not specify tie-break order when multiple floating groups match the same tab. Ruled: the record appearing first in the `tj:floatingGroups` array wins. This is deterministic, cheap (no scoring), and consistent with the existing `reconcileClaims` first-unclaimed-wins approach.

- **Ruling B2-2 — Position-match requires both `windowId` and `tabIndex` match.** URL match alone is insufficient for position-match because the same URL may be open in multiple windows. The position-match phase requires an exact (`windowId`, `tabIndex`) pair; URL is then verified as a confirmation. If position matches but URL diverged, the record falls through to URL-fallback.

---

### B-001c Deviations and Rulings

#### R4 fixes landed during B-001c build

- **H1 — `onUpdated` guard: only reevaluate on non-empty URL string.** R2 did not specify the filter. Chrome fires `onUpdated` with `changeInfo.url` set to empty string in some loading states. Shipped code checks `typeof changeInfo.url === 'string' && changeInfo.url !== ''` before scheduling a reevaluate debounce.

- **H2 — Per-tab 100ms debounce on `reevaluateTab`.** R2 implied immediate reevaluation on each `onUpdated` URL change. Rapid redirects (HTTP → HTTPS, SPA client-side routing) can fire multiple `onUpdated` events in quick succession. The debounce collapses these into a single evaluation, reducing spurious claim churn.

- **H3 — `isClaimsReady()` guard in `buildLiveStates`.** R2 did not specify behavior when `buildLiveStates` is called before `reconcileClaims` has completed. Shipped code returns explicit `{ live: false, active: false, audible: false }` defaults for all items when `claimsReady === false`, rather than returning stale or partial state.

- **M2 — `buildLiveTabIndex` and `readyPromise.then(listItems)` run concurrently in `initializeLiveState`.** R2 implied sequential init (index first, then claims). Shipped code uses `Promise.all` to overlap the `tabs.query` call with the storage migration so cold-start latency is minimized.

- **M3 — Explicit `hostname.toLowerCase()` in `normalizeForMatch`.** The `URL` constructor normalizes hostnames to lowercase per spec, but the explicit assignment was added defensively in case a non-standard environment or future spec change affects this.

- **M4 — `windows.onRemoved` early return when claims not yet ready.** R2 did not specify this guard. If `onRemoved` fires before `reconcileClaims` completes (edge case on very fast window close during startup), the handler short-circuits — `reconcileClaims` will handle all cleanup when it runs.

- **M5 — Warning when `reconcileClaims` is called with 0 items but stored claims exist.** Defensive log added to catch misconfigured call sites. Does not block or alter behavior.

#### B-001c Rulings

- **Ruling B1c-1 — `windowId` captured in LiveTabIndex entry.** R0 design spec shape was `Map<tabId, {url, active, audible}>`. Shipped shape is `Map<tabId, {url, windowId, active, audible}>`. `windowId` is required for `windows.onRemoved` batch cleanup and for `onActivated` deactivation of the previous tab in the same window. Backward-compatible addition.

- **Ruling B1c-2 — `buildLiveTabIndex` + `listItems` run concurrently rather than sequentially.** Correct because `buildLiveTabIndex` reads from `chrome.tabs` (independent of storage) and `readyPromise.then(listItems)` reads from storage. The two can safely overlap.

- **Ruling B1c-3 — `chrome.storage.local.remove` is the allowed exception for legacy keys; `chrome.storage.session.set` is the allowed exception for TabClaims.** The single-writer invariant (`writeTransaction` is the sole path to `chrome.storage.local.set`) is not violated by either: legacy key removal operates on foreign `junkie_*` keys (not `tj:*` partitions), and TabClaims live in `storage.session`, a separate storage area not governed by the `writeTransaction` serializer.

---

## 12. Rollback Plan

### What can go wrong and how to recover

1. **Revert B-001b or B-001c as a code change.** `git revert` the relevant commits on `feature/rebuild-from-prd`. Any `tj:*` partitions already written remain on-disk and are re-read normally by the earlier code (B-001a storage layer is unchanged). `tj:tabClaims` in `storage.session` is ephemeral and is cleared on browser restart; no residue risk.

2. **Regression in a specific write path.** Disable the extension and debug via unpacked-mode reload. No remote kill-switch exists (by design — the extension is local-only).

3. **Corrupt partition in the field.** `ERR_CORRUPT_DATA` is scoped per partition (AC8); the other five remain usable. Export-and-reset UX is deferred to the sidepanel item (B-022); until then, recovery is manual via DevTools.

4. **Quota exhaustion in the field.** `ERR_QUOTA_EXCEEDED` bubbles from `writeTransaction`. The `quotaWarning` flag is now surfaced via `MSG_GET_STATUS`; quota warning UX banner is deferred to B-022. Short-term mitigation: delete items from a working installation.

5. **Migration failure (`ERR_TX_CONFLICT` from a migration step).** `readyPromise` rejects; all write messages return `ERR_NOT_READY`. The on-disk `tj:meta.schemaVersion` is left at its pre-migration value (the failing `writeTransaction` aborts atomically). The correct fix is to patch the migration step and reload the extension.

6. **Corrupt `tj:meta.schemaVersion`.** `readyPromise` rejects with `ERR_CORRUPT_DATA`. Recovery requires manual DevTools correction of `tj:meta` in `chrome.storage.local`.

### B-001b-specific: safe-mode protects against schema downgrades

If a user is running a newer extension version that bumped `KNOWN_VERSION` to N, then downgrades to the current codebase (KNOWN_VERSION = 1):

- `stored.schemaVersion = N > 1` → `isSafeMode()` returns `true`.
- `readyPromise` resolves (not rejects) — reads still work.
- All write operations return `ERR_SAFE_MODE` until the user upgrades again.
- No data is written under a schema the current code does not understand. On-disk data from the newer version is preserved intact for when the user re-upgrades.

### B-001d-specific: drift records survive SW restart but not item deletion

`tj:drift` records are in `storage.local` and survive SW restarts. Stale records for deleted items are filtered out lazily at `MSG_LIST_ITEMS` read time. There is no proactive cleanup on item delete; a missed delete (e.g. crash mid-delete) leaves an orphan drift record that is harmlessly ignored at read time.

### B-002-specific: unresolved floating-group records have no TTL

Unresolved `tj:floatingGroups` records persist indefinitely. Revert of B-002 code leaves these records inert on disk (they are never read by non-B-002 code paths). Manual cleanup via DevTools `chrome.storage.local.set({'tj:floatingGroups': []})` is the recovery path if accumulation becomes a problem.

### What B-001a/b/c/d + B-002 do NOT protect against

- Partial writes across multiple storage APIs — not applicable; every `tj:*` write is a single `chrome.storage.local.set`.
- Loss of `LiveTabIndex` on SW restart — by design (ephemeral, rebuilt on next cold start from `chrome.tabs.query`).
- Loss of `TabClaims` on browser restart — by design (`storage.session` is cleared by Chrome; cold-start reconcile re-establishes claims).
- Stale `tj:drift` records for deleted items — filtered lazily at read time, not proactively deleted.
- Unresolved `tj:floatingGroups` records accumulating indefinitely — no TTL or cleanup job exists yet.

---

## 13. Incident Log

*(empty — no SEV1/SEV2 incidents since B-001a landed.)*

---

## 14. Runbooks

*(empty — B-001a introduces no background async jobs or recovery procedures
beyond what the code itself handles. Add as B-001b's migration runner and
B-001c's live-tab indexer come online.)*

---

## 15. B-003 — Bookmark CRUD Dialog Architecture

**Date:** 2026-04-16
**Status:** SHIPPED — UAT PASS 2026-04-16. R6 close complete.

### 15.1 Open Question Resolutions (binding for R3 and R5)

**OQ-1 — Canonical "Ungrouped" groupId value in the group picker `<select>`**

**Decision: Use the JavaScript value `""` (empty string) as the `<option value>` for the Ungrouped entry. When reading the select's `.value`, convert `""` → `null` before dispatching any message.**

Rationale: The storage schema defines `item.groupId` as `string | null` where `null` = Ungrouped (`SOLUTION_DESIGN.md §2`). The sidepanel rendering already uses the `__ungrouped__` synthetic id internally for group-section DOM wiring, but that id is never sent to the SW. The select element must map option values to what the SW expects. Empty string is the natural HTML falsy sentinel (`<option value="">Ungrouped</option>`), maps cleanly to `null` on submit (`groupId: selectEl.value || null`), and requires no special constants visible to template code. Using `__ungrouped__` as the option value would require importing or duplicating a constant that has no meaning outside the DOM grouping scaffold. Using `null` directly as an option value is not representable in HTML. Decision: `""` in HTML, `null` on the wire.

**OQ-2 — HTML element and id for the secondary "Add Bookmark" header trigger**

**Decision: A `<div id="panel-header">` wrapper is added as the first child of `<body>` (before `#skeleton`). Inside it, a `<button id="add-bookmark-btn" class="header-add-btn" aria-label="Add bookmark" hidden>` is the trigger. It is hidden by default and revealed by `renderAll` once items exist (i.e., when `#item-list` is shown).**

Rationale: The existing HTML has no panel header. Adding one now is the minimal change that gives B-003 a stable mount point for the add button without restructuring existing state elements. `hidden` matches the pattern already used for `#item-list`, `#empty-state`, and `#error-state`. The button is keyboard-reachable, has an explicit `aria-label`, and uses `<button>` (not `<div role="button">`) to get native focus and Enter/Space handling for free.

**OQ-3 — HTML element and id for per-item Edit and Delete triggers**

**Decision: Two `<button>` elements are appended inside each `.item-row` by `buildItemRow`, after the existing indicators container. They are NOT in the DOM during normal display — they are always present but visually hidden via CSS (`opacity: 0; pointer-events: none`) and revealed on `.item-row:hover` and `.item-row:focus-within` via CSS. They use `data-action="edit"` and `data-action="delete"` attributes for event delegation. No ids are needed on these (they are repeated per row); the parent row's `data-item-id` provides item identity.**

Specific element structure appended to each `.item-row`:
```html
<div class="item-actions" aria-hidden="true">
  <button class="item-action-btn item-action-edit"
          data-action="edit"
          tabindex="-1"
          aria-label="Edit bookmark">
    <!-- inline SVG pencil icon -->
  </button>
  <button class="item-action-btn item-action-delete"
          data-action="delete"
          tabindex="-1"
          aria-label="Delete bookmark">
    <!-- inline SVG trash icon -->
  </button>
</div>
```

`tabindex="-1"` keeps action buttons out of the main Tab order (the row itself is the focus target). They become keyboard-reachable via `Tab` only when the focus trap is active inside a row-action context — standard pattern for compound widgets. The `aria-hidden="true"` on the container means the buttons are announced only when they receive programmatic focus (which the focus trap manages). `data-action` values are consumed by the existing `document.addEventListener('click', ...)` delegation in `sidepanel.js`.

> **R6 as-built note (D-4):** `tabindex="-1"` was removed during build. Action buttons are now keyboard-focusable in normal Tab order, since they are revealed on `:focus-within` and must be reachable to complete the interaction. See §15.9 D-4.

**OQ-4 — Whether ERR_DUPLICATE_URL is in scope for B-003**

**Decision: OUT OF SCOPE for B-003. No special handling beyond the generic SW error path.**

Rationale: `ERR_DUPLICATE_URL` is currently thrown only by `MSG_PROMOTE_TAB` (B-016), not by `MSG_CREATE_ITEM` or `MSG_UPDATE_ITEM`. The ACs for B-003 do not mention duplicate URL detection. If a future sprint adds duplicate-URL checking to `createItem`, the dialog error-rendering path (which already handles `ERR_VALIDATION` from the SW) will surface the error generically. No B-003 code change would be required. Adding proactive duplicate-URL detection in B-003 would require a full-collection read before every submit — a performance and scope violation. Explicitly deferred.

**OQ-5 — Dialog mount point: inline in sidepanel.html vs dynamically created in JS**

**Decision: The overlay and both dialogs (CRUD dialog + confirmation dialog) are declared as static HTML in `sidepanel.html` with `hidden` attribute, then shown/hidden by JS. They are NOT dynamically created via `document.createElement`.**

Rationale: Static HTML in `sidepanel.html` keeps DOM structure reviewable, makes ARIA relationships (`aria-labelledby`, `aria-describedby`) stable, avoids the overhead of re-parsing template strings on every dialog open, and integrates cleanly with the existing CSS file. The sidepanel is not a component tree — it is a single document. Dynamic creation would add complexity without benefit in this context. The dialogs are hidden at paint time (`[hidden]` → `display: none !important`), so they incur zero layout cost while closed.

---

### 15.2 HTML Additions (to sidepanel.html)

All additions are static markup. No new files are created. Changes are additive only.

#### A. Panel header (`#panel-header`)

Inserted as the **first child of `<body>`**, before `#skeleton`.

```html
<div id="panel-header" class="panel-header" hidden>
  <span class="panel-header-title">Tab Junkie</span>
  <button
    id="add-bookmark-btn"
    class="header-add-btn"
    aria-label="Add bookmark"
    type="button"
  >
    <!-- inline SVG: 16×16 plus icon -->
  </button>
</div>
```

- `hidden` attribute: removed by JS when `renderAll` transitions to the populated state (same lifecycle as `#item-list`).
- `.panel-header`: flex row, space-between, `position: sticky; top: 0; z-index: 10` so it stays visible when the list scrolls.
- The `#item-list` height rule (`height: 100vh`) will need to change to `height: calc(100vh - <header-height>)` — the [frontend-engineer] is responsible for this adjustment.

#### B. Empty-state CTA fix

The existing `button.empty-state-cta` currently has `disabled` attribute and `cursor: default`. **B-003 removes `disabled` and enables it as the primary create trigger.** The existing element requires no structural change, only CSS and a JS handler.

#### C. CRUD dialog (create + edit)

Inserted as the **last child of `<body>`**, after all state containers.

```html
<!-- Dialog overlay (backdrop + modal) -->
<div id="dialog-overlay" class="dialog-overlay" hidden aria-hidden="true">

  <div
    id="bookmark-dialog"
    class="dialog-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="dialog-title"
  >
    <h2 id="dialog-title" class="dialog-title">Add Bookmark</h2>

    <form id="bookmark-form" class="dialog-form" novalidate>

      <div class="dialog-field">
        <label for="field-title" class="dialog-label">Title</label>
        <input
          id="field-title"
          name="title"
          type="text"
          class="dialog-input"
          autocomplete="off"
          maxlength="512"
          required
        />
        <span id="error-title" class="dialog-field-error" aria-live="polite" hidden></span>
      </div>

      <div class="dialog-field">
        <label for="field-url" class="dialog-label">URL</label>
        <input
          id="field-url"
          name="url"
          type="url"
          class="dialog-input"
          autocomplete="off"
          required
        />
        <span id="error-url" class="dialog-field-error" aria-live="polite" hidden></span>
      </div>

      <div class="dialog-field">
        <label for="field-group" class="dialog-label">Group</label>
        <select id="field-group" name="groupId" class="dialog-select">
          <!-- Options populated dynamically on every open via MSG_LIST_GROUPS -->
          <!-- First option is always: <option value="">Ungrouped</option> -->
        </select>
      </div>

      <span id="error-dialog" class="dialog-error" aria-live="assertive" hidden></span>

      <div class="dialog-actions">
        <button type="button" id="dialog-cancel-btn" class="dialog-btn dialog-btn--secondary">Cancel</button>
        <button type="submit" id="dialog-submit-btn" class="dialog-btn dialog-btn--primary">Save</button>
      </div>

    </form>
  </div>

</div>
```

Key attributes:
- `#dialog-overlay`: full-panel backdrop. `hidden` when closed. `aria-hidden="true"` when closed (toggled by JS alongside `hidden`).
- `#bookmark-dialog`: the focusable modal card. `aria-modal="true"` confines virtual cursor to dialog.
- `aria-labelledby="dialog-title"`: title text announced as dialog name. JS updates `#dialog-title` text for create ("Add Bookmark") vs edit ("Edit Bookmark").
- `#error-title`, `#error-url`: inline field errors. `aria-live="polite"` so screen readers announce them after submission attempt. Set `hidden` when empty, remove `hidden` when content is set.
- `#error-dialog`: dialog-level error (e.g., `ERR_NOT_FOUND` on edit submit). `aria-live="assertive"`.
- `maxlength="512"` on `#field-title`: client-side cap per AC13. The SW enforces `MAX_TITLE=2048`; B-003 applies the tighter AC13 cap of 512 chars at the form level.
- `type="url"` on `#field-url`: browser's native URL parsing is used as the first-pass format check (AC12 client-side validation), before dispatching to the SW.
- `novalidate` on `<form>`: disables browser's default validation UI in favor of B-003's custom inline error rendering.

#### D. Confirmation dialog (delete non-live-tab item)

Separate modal, also inside `#dialog-overlay`. The overlay is shared; only one dialog is visible at a time.

```html
<div
  id="confirm-dialog"
  class="dialog-modal"
  role="alertdialog"
  aria-modal="true"
  aria-labelledby="confirm-title"
  aria-describedby="confirm-body"
  hidden
>
  <h2 id="confirm-title" class="dialog-title">Delete Bookmark?</h2>
  <p id="confirm-body" class="dialog-body">
    <!-- JS sets: "Delete «title»? This cannot be undone." -->
  </p>
  <div class="dialog-actions">
    <button type="button" id="confirm-cancel-btn" class="dialog-btn dialog-btn--secondary">Cancel</button>
    <button type="button" id="confirm-delete-btn" class="dialog-btn dialog-btn--danger">Delete</button>
  </div>
</div>
```

- `role="alertdialog"`: for destructive confirmations (ARIA spec distinction from `role="dialog"`).
- `aria-describedby="confirm-body"`: body text announces automatically on open.
- The title and body text are set by JS before showing.
- `#confirm-dialog` is inside `#dialog-overlay` but a sibling of `#bookmark-dialog`. Overlay `hidden` controls both.

---

### 15.3 CSS Additions (class inventory for sidepanel.css)

No new CSS files. All additions go into `sidepanel.css`.

| Class | Visual role |
|---|---|
| `.panel-header` | Sticky top bar: `display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--bg-secondary); border-bottom: 1px solid var(--border-primary); position: sticky; top: 0; z-index: 10` |
| `.panel-header-title` | Extension name label: `font-size: 13px; font-weight: 600; color: var(--text-secondary)` |
| `.header-add-btn` | Compact icon button in header: `24×24px; border-radius: 6px; border: 1px solid var(--border-primary); background: var(--bg-primary)`. Focus ring via existing `:focus-visible` rule (no new rule needed if selector is added). |
| `.dialog-overlay` | Full-panel semi-transparent backdrop: `position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100` |
| `.dialog-modal` | Centered card: `background: var(--bg-primary); border: 1px solid var(--border-primary); border-radius: 10px; padding: 20px; width: calc(100% - 32px); max-width: 360px; box-shadow: 0 4px 24px rgba(0,0,0,0.18)` |
| `.dialog-title` | Modal heading: `font-size: 15px; font-weight: 600; margin-bottom: 16px; color: var(--text-primary)` |
| `.dialog-body` | Confirmation body text: `font-size: 13px; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5` |
| `.dialog-form` | Stack layout: `display: flex; flex-direction: column; gap: 12px` |
| `.dialog-field` | Per-field wrapper: `display: flex; flex-direction: column; gap: 4px` |
| `.dialog-label` | Field label: `font-size: 12px; font-weight: 500; color: var(--text-secondary)` |
| `.dialog-input` | Text/URL input: `padding: 7px 10px; border: 1px solid var(--border-primary); border-radius: 6px; font-size: 13px; background: var(--bg-primary); color: var(--text-primary)`. Error state: `.dialog-input--error { border-color: #dc2626 }` |
| `.dialog-select` | Group dropdown: same sizing as `.dialog-input`; inherits OS styles with minimal override |
| `.dialog-field-error` | Inline error below field: `font-size: 11px; color: #dc2626; line-height: 1.4` |
| `.dialog-error` | Dialog-level error: `font-size: 12px; color: #dc2626; padding: 8px; background: #fef2f2; border-radius: 6px; border: 1px solid #fecaca` |
| `.dialog-actions` | Button row: `display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px` |
| `.dialog-btn` | Base button: `padding: 7px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer` |
| `.dialog-btn--primary` | Accent fill: `background: var(--accent); color: #fff; border: 1px solid var(--accent)` |
| `.dialog-btn--secondary` | Ghost: `background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-primary)` |
| `.dialog-btn--danger` | Red fill: `background: #dc2626; color: #fff; border: 1px solid #dc2626` |
| `.item-actions` | Per-row action button container: `display: flex; gap: 4px; flex-shrink: 0; opacity: 0; pointer-events: none; transition: opacity 0.1s` |
| `.item-row:hover .item-actions`, `.item-row:focus-within .item-actions` | Reveal on hover/focus: `opacity: 1; pointer-events: auto` |
| `.item-action-btn` | Small icon button: `width: 24px; height: 24px; border-radius: 4px; border: none; background: transparent; display: flex; align-items: center; justify-content: center; color: var(--text-tertiary)` |
| `.item-action-btn:hover` | `background: var(--bg-hover); color: var(--text-primary)` |
| `.item-action-edit` | Edit-specific color on hover: `color: var(--accent)` |
| `.item-action-delete:hover` | Delete-specific color: `color: #dc2626` |

**Dark mode:** All colors above reference existing `--` custom properties, which already have dark/system variants. Only `#dc2626` (error red) and the hardcoded danger-button colors need explicit dark overrides if they fail contrast. The [frontend-engineer] must validate contrast in dark mode during build.

---

### 15.4 JavaScript Architecture

All code lives in `sidepanel/sidepanel.js` (no new files for B-003). The dialog logic is added as new functions in the existing module. The existing event delegation handler is extended — not replaced.

#### Module-level state additions

```js
// Tracks which item is being edited (null when creating)
let _editingItemId = null;

// Tracks which element triggered the current dialog open
// (used by closeDialog to restore focus)
let _dialogTriggerEl = null;

// Cached group list for the picker — refreshed on every dialog open
// No persistent cache; always fetch fresh to avoid stale group names.
let _groupCache = [];
```

#### `openCreateDialog(opts = {})`

**Signature:** `openCreateDialog({ triggerEl })`
- `triggerEl`: the DOM element that triggered the open (for focus restoration on close).
- Sets `_editingItemId = null`.
- Updates `#dialog-title` text to `"Add Bookmark"`.
- Clears all form fields and all inline errors.
- Calls `_populateGroupPicker()` (awaits MSG_LIST_GROUPS; shows "Loading…" option while in-flight).
- Shows `#dialog-overlay` and `#bookmark-dialog`; hides `#confirm-dialog`.
- Sets `aria-hidden="false"` on `#dialog-overlay`.
- Moves focus to `#field-title`.
- Activates focus trap (see Focus Trap section).

#### `openEditDialog(item)`

**Signature:** `openEditDialog(item, { triggerEl })`
- `item`: the full Item object (title, url, groupId).
- `triggerEl`: the edit button element.
- Sets `_editingItemId = item.id`.
- Updates `#dialog-title` text to `"Edit Bookmark"`.
- Pre-populates `#field-title.value = item.title`, `#field-url.value = item.url`.
- Calls `_populateGroupPicker()`, then after it resolves, sets `#field-group.value = item.groupId ?? ""`.
- Clears all inline errors.
- Shows `#dialog-overlay` and `#bookmark-dialog`.
- Moves focus to `#field-title`.
- Activates focus trap.

#### `closeDialog()`

- Adds `hidden` to `#dialog-overlay`; sets `aria-hidden="true"`.
- Removes focus trap.
- Restores focus to `_dialogTriggerEl` (if it is still in the DOM; fallback to `document.body`).
- Resets `_editingItemId = null`, `_dialogTriggerEl = null`.
- Does NOT clear form fields — they are cleared on open, not on close, so there is no flash of stale content.

#### `openConfirmDialog(item, onConfirm, { triggerEl })`

- Sets confirm dialog body text to `"Delete "${item.title}"? This cannot be undone."`.
- Shows `#dialog-overlay` and `#confirm-dialog`; hides `#bookmark-dialog`.
- Moves focus to `#confirm-cancel-btn` (safe default for destructive action — user must actively move to Delete).
- Activates focus trap scoped to `#confirm-dialog`.
- `onConfirm` is called when `#confirm-delete-btn` is clicked. `closeDialog()` is called in both confirm and cancel paths.

#### `_populateGroupPicker(selectedGroupId = null)`

**Always called on dialog open — no persistent cache.**

```
1. Set <select> to single "Loading groups…" disabled option
2. sendMessage(MSG_LIST_GROUPS, {})
3. On resolve: clear select; insert <option value="">Ungrouped</option> first
4. For each group (sorted by sortOrder): insert <option value="{group.id}">{group.name}</option>
5. Set select.value = selectedGroupId ?? "" (defaults to Ungrouped)
6. On reject: insert <option value="">Ungrouped</option> only (graceful degradation)
```

Rationale for always fetching: the dialog may be opened while the group list is being mutated by another message. Fetching on open ensures the list is always current. The fetch is fast (single storage.local.get on the SW side) and this is a user-triggered action, so latency is not a concern.

#### Client-side validation — `_validateForm()`

Returns `{ valid: boolean }`. Called on form submit. Runs synchronously before any message dispatch.

Validation rules (in order):
1. `title = #field-title.value.trim()`. If empty → set `#error-title` to "Title is required." → `valid: false`.
2. ~~If `title.length > 512` → set `#error-title` to "Title must be 512 characters or fewer."~~ **Removed (D-5):** `maxlength="512"` on the input enforces this at the browser level; the JS guard was unreachable dead code. See §15.9 D-5.
3. `url = #field-url.value.trim()`. If empty → set `#error-url` to "URL is required." → `valid: false`.
4. Try `new URL(url)`. If it throws, or if the resulting protocol is not in `['http:', 'https:']` → set `#error-url` to "Enter a valid URL (must start with http:// or https://)." → `valid: false`. Note: `ftp:` and `mailto:` are valid at the storage layer but are not surfaced in the create/edit dialog to avoid user confusion; they can be added in a future sprint if needed.
5. If all pass → clear all inline errors → `valid: true`.

Error attach/detach:
- `_setFieldError(errorEl, inputEl, message)`: sets `errorEl.textContent = message`, removes `hidden` from `errorEl`, adds class `dialog-input--error` to `inputEl`.
- `_clearFieldError(errorEl, inputEl)`: clears text, adds `hidden`, removes `dialog-input--error`.
- Called at the start of each submit attempt to clear stale errors before re-running validation.

#### Form submit handler

Attached to `#bookmark-form` via `addEventListener('submit', ...)`.

```
1. e.preventDefault()
2. _validateForm() → if not valid, return
3. Disable #dialog-submit-btn, set textContent "Saving…"
4. Build payload: { title, url, groupId: #field-group.value || null }
5. If _editingItemId is null: sendMessage(MSG_CREATE_ITEM, payload)
   Else: sendMessage(MSG_UPDATE_ITEM, { id: _editingItemId, title, url, groupId })
6. On success: closeDialog() — re-render triggered by MSG_STATE_CHANGED broadcast from SW
7. On error (resp.error.code):
   - ERR_VALIDATION → parse message; show in #error-url or #error-title heuristically
     (if message contains "url" → url field; otherwise → title field; fallback → #error-dialog)
   - ERR_NOT_FOUND (edit path) → show in #error-dialog: "This bookmark was deleted by another window."
   - Other → show in #error-dialog: "Something went wrong. Please try again."
8. Re-enable #dialog-submit-btn, restore label "Save"
```

#### Event delegation extensions (in existing `document.addEventListener('click', ...)`)

New branches added to the existing click handler:

```js
// Empty-state CTA
if (e.target.closest('.empty-state-cta')) {
  openCreateDialog({ triggerEl: e.target.closest('.empty-state-cta') });
  return;
}

// Header add button
if (e.target.closest('#add-bookmark-btn')) {
  openCreateDialog({ triggerEl: e.target.closest('#add-bookmark-btn') });
  return;
}

// Per-item edit/delete action buttons
const actionBtn = e.target.closest('[data-action]');
if (actionBtn) {
  e.stopPropagation(); // prevent row click (navigate) from firing
  const row = actionBtn.closest('.item-row');
  const itemId = row?.dataset.itemId;
  if (!itemId) return;
  if (actionBtn.dataset.action === 'edit') {
    // Fetch item data, then open edit dialog
    sendMessage(MSG_GET_ITEM, { id: itemId }).then(item => {
      if (item) openEditDialog(item, { triggerEl: actionBtn });
    }).catch(() => {}); // silent fail — item may have been deleted
    return;
  }
  if (actionBtn.dataset.action === 'delete') {
    const isLive = row.dataset.live === 'true';
    if (isLive) {
      sendMessage(MSG_DEMOTE_ITEM, { id: itemId }).catch(() => {});
    } else {
      const title = row.querySelector('.item-title')?.textContent ?? 'this bookmark';
      const syntheticItem = { id: itemId, title };
      openConfirmDialog(syntheticItem, () => {
        sendMessage(MSG_DELETE_ITEM, { id: itemId }).catch(() => {});
      }, { triggerEl: actionBtn });
    }
    return;
  }
}

// Dialog cancel buttons
if (e.target.closest('#dialog-cancel-btn') || e.target.closest('#confirm-cancel-btn')) {
  closeDialog();
  return;
}

// Confirm delete button
if (e.target.closest('#confirm-delete-btn')) {
  // onConfirm callback is called here (stored in module-level ref set by openConfirmDialog)
  _pendingConfirmCallback?.();
  closeDialog();
  return;
}

// Overlay backdrop click (click on overlay but not on modal)
if (e.target === document.getElementById('dialog-overlay')) {
  closeDialog();
  return;
}
```

A module-level `_pendingConfirmCallback` holds the `onConfirm` closure set by `openConfirmDialog`.

#### Keyboard handling extensions (in existing `document.addEventListener('keydown', ...)`)

```js
// Escape closes any open dialog
if (e.key === 'Escape') {
  const overlay = document.getElementById('dialog-overlay');
  if (!overlay.hidden) {
    e.preventDefault();
    closeDialog();
    return;
  }
}

// Enter on form inputs submits (browser default on <form> handles this;
// no extra handler needed because the form has a type="submit" button)
```

#### Focus trap implementation

**Pattern: `inert` attribute on all siblings of the dialog, not a manual Tab-cycle interceptor.**

When a dialog opens:
1. All direct children of `<body>` that are NOT `#dialog-overlay` receive `inert` attribute (`#skeleton`, `#empty-state`, `#error-state`, `#item-list`, `#panel-header`).
2. `inert` makes those elements non-focusable and hides them from the accessibility tree without removing them from the DOM.
3. Focus is placed on the first interactive element inside the active dialog modal (`#field-title` for CRUD, `#confirm-cancel-btn` for confirm).

When a dialog closes:
1. `inert` is removed from all sibling elements.
2. Focus returns to `_dialogTriggerEl`.

Rationale for `inert` over manual Tab trapping: `inert` is supported in all Chromium versions that support MV3 extensions (Chrome 102+, Edge 102+). It correctly handles nested focusable elements, shadow DOM, and iframes without any manual `Tab`/`Shift+Tab` interception logic. It is the WCAG-recommended modern approach. No polyfill needed.

---

### 15.5 Message Flow Diagrams

#### Create happy path
```
User → clicks "Add Bookmark" (empty-state CTA or header button)
  → openCreateDialog()
    → MSG_LIST_GROUPS → SW → Group[] (populates picker)
  → User fills form, clicks Save / presses Enter
    → _validateForm() → valid: true
    → MSG_CREATE_ITEM { title, url, groupId } → SW
      → SW: createItem() → writeTransaction(PARTITION_ITEMS)
        → broadcastState(SCOPE.ITEMS)
          → MSG_STATE_CHANGED { scope: 'items' } → sidepanel
            → renderAll() triggered
    → ok: true, data: Item
  → closeDialog() (focus returns to trigger)
```

#### Edit happy path
```
User → hovers item row → clicks edit button
  → MSG_GET_ITEM { id } → SW → Item
  → openEditDialog(item)
    → MSG_LIST_GROUPS → SW → Group[] (populates picker, pre-selects item.groupId)
  → User edits fields, clicks Save
    → _validateForm() → valid: true
    → MSG_UPDATE_ITEM { id, title, url, groupId } → SW
      → SW: updateItem() → writeTransaction(PARTITION_ITEMS)
        → broadcastState(SCOPE.ITEMS)
          → MSG_STATE_CHANGED { scope: 'items' } → sidepanel
            → renderAll() triggered
    → ok: true, data: Item
  → closeDialog()
```

#### Delete → live tab path
```
User → hovers item row (data-live="true") → clicks delete button
  → row.dataset.live === 'true'
  → MSG_DEMOTE_ITEM { id } → SW → null
    (No confirmation dialog. SW: delete → clearDrift → saveFloating → releaseClaim)
    → broadcastState(SCOPE.ITEMS)
      → MSG_STATE_CHANGED → sidepanel → renderAll()
```

#### Delete → non-live-tab path
```
User → hovers item row (no data-live) → clicks delete button
  → openConfirmDialog(item, onConfirm)
    → focus: #confirm-cancel-btn
  → User clicks "Delete"
    → _pendingConfirmCallback()
      → MSG_DELETE_ITEM { id } → SW → null
        → broadcastState(SCOPE.ITEMS)
          → MSG_STATE_CHANGED → sidepanel → renderAll()
    → closeDialog()
  → User clicks "Cancel"
    → closeDialog() (no message dispatched)
```

#### Validation error path (client-side)
```
User → submits form with empty title
  → _validateForm()
    → title.trim().length === 0
    → _setFieldError(#error-title, #field-title, "Title is required.")
    → returns { valid: false }
  → no message dispatched
  → focus stays in dialog
```

#### Validation error path (ERR_VALIDATION from SW)
```
User → submits form (passes client-side validation)
  → MSG_CREATE_ITEM { title, url, groupId } → SW
    → SW rejects with { ok: false, error: { code: 'ERR_VALIDATION', message: '...' } }
  → error handling branch:
    → if message contains 'url' → _setFieldError(#error-url, ...)
    → else → _setFieldError(#error-title, ...) or #error-dialog
  → #dialog-submit-btn re-enabled
  → focus stays in dialog (user corrects and resubmits)
```

---

### 15.6 What is NOT in scope for B-003

The following are explicitly excluded and must not be implemented as part of B-003:

- **Drag-to-reorder** items within a dialog or list (B-030).
- **Create/Edit/Delete Groups** — B-003 covers items only. Group management is a separate backlog item.
- **Favicon fetching** for the item avatar in the list (B-004).
- **Duplicate URL detection in createItem/updateItem** — `ERR_DUPLICATE_URL` is currently only on `MSG_PROMOTE_TAB`. B-003 renders the error generically if the SW ever emits it, but does not proactively check for duplicates.
- **Fuzzy search** of the item list (separate backlog item).
- **Sorting or reordering items in the group picker** beyond what the SW returns.
- **Rich text or markdown in titles/URLs**.
- **Batch delete** (selecting multiple items).
- **`ftp:` and `mailto:` URL schemes** in the create/edit URL field (client-side validation restricts to `http:`/`https:` only for now; storage layer accepts them).
- **Mobile/touch layout** — desktop-first per CLAUDE.md non-negotiables.
- **The `newtab/` or `popup/` surfaces** — B-003 scopes exclusively to `sidepanel/`.
- **Any changes to `manifest.json`** — no new permissions are required. `MSG_GET_ITEM`, `MSG_CREATE_ITEM`, `MSG_UPDATE_ITEM`, `MSG_DELETE_ITEM`, `MSG_DEMOTE_ITEM`, and `MSG_LIST_GROUPS` are all already in the message registry with the correct sender allowance for sidepanel.

---

### 15.7 Manifest Permission Impact

Zero new permissions. All message types used by B-003 (`MSG_GET_ITEM`, `MSG_CREATE_ITEM`, `MSG_UPDATE_ITEM`, `MSG_DELETE_ITEM`, `MSG_DEMOTE_ITEM`, `MSG_LIST_GROUPS`) are already declared in `shared/messages.js` and wired in `storage-handlers.js` with `sidepanel` as an allowed sender (per §5 message registry). No `manifest.json` changes are required for B-003.

---

### 15.8 Shared File Governance Notes

- `shared/messages.js` — **read only**. All required message types are already present. No additions.
- `shared/errors.js` — **read only**. `ERR_VALIDATION`, `ERR_NOT_FOUND` are the only SW error codes B-003 handles specially; both already exist.
- `shared/constants.js` — **read only**. `GROUP_COLORS` is not used by B-003 dialogs (group color selection is out of scope).
- `sidepanel/sidepanel.js` — **primary file**. All new JS logic is added here.
- `sidepanel/sidepanel.html` — **structural additions only**. New static HTML for header, dialogs. No removals.
- `sidepanel/sidepanel.css` — **additions only**. New classes for dialog and header. No changes to existing rules.

---

### 15.9 R6 Close — As-Built Deviations from R2 Plan

The following deviations were discovered during R3 build and R4 review. All are improvements over the R2 spec.

| # | R2 Plan | As-Built | Reason |
|---|---------|----------|--------|
| D-1 | Event delegation used `e.target === addBookmarkBtnEl` for the header add button | Changed to `e.target.closest('#add-bookmark-btn')` | SVG child elements (the `<path>` inside the `<svg>` icon) intercepted click events, so `e.target` was the SVG path, not the button. `closest()` walks up to the button regardless of which child was clicked. |
| D-2 | `_activateFocusTrap` sets `inert` on all `<body>` direct children except `#dialog-overlay` | `_activateFocusTrap(activeDialogEl)` now also inerts sibling dialogs *within* `#dialog-overlay` | R2 only considered body-level siblings. When the confirm dialog opens inside the overlay, `#bookmark-dialog` is a sibling that must also be inerted to prevent focus leaking between dialogs. Discovered in R4 review. |
| D-3 | Re-render relies solely on `MSG_STATE_CHANGED` broadcast from SW after create/update | Added fallback fire-and-forget `Promise.all([MSG_LIST_ITEMS, MSG_LIST_GROUPS])` re-render after successful create/update | Belt-and-suspenders against broadcast loss (e.g., if the SW shuts down between write and broadcast). The broadcast path is still primary; the fallback is a safety net. |
| D-4 | Per-item action buttons had `tabindex="-1"` to keep them out of Tab order | `tabindex="-1"` removed; buttons are now keyboard-focusable in normal Tab order | R4 accessibility finding: `tabindex="-1"` made action buttons unreachable by keyboard-only users. Since the buttons are visually revealed on `:focus-within`, they must be focusable to complete the interaction. |
| D-5 | `_validateForm()` included a JS guard `if (title.length > 512)` | Guard removed as dead code | The `<input maxlength="512">` attribute enforces the cap at the browser level, making the JS guard unreachable. Removing it eliminates dead code per CLAUDE.md non-negotiables. |

---

### 15.10 R6 Close — OQ Resolution Confirmation

All five Open Question resolutions from §15.1 were confirmed accurate as-built:

- **OQ-1** (Ungrouped = `""` in HTML, `null` on wire): Implemented as designed. `_populateGroupPicker` inserts `<option value="">Ungrouped</option>` first; submit handler converts via `selectEl.value || null`.
- **OQ-2** (Panel header with `#add-bookmark-btn`): Implemented as designed. `#panel-header` is first child of `<body>`, button revealed by `renderAll`.
- **OQ-3** (Per-item edit/delete action buttons via `data-action`): Implemented as designed, with D-4 deviation (tabindex removed).
- **OQ-4** (ERR_DUPLICATE_URL out of scope): Confirmed out of scope. No duplicate-URL logic was added.
- **OQ-5** (Static HTML dialogs, not dynamic creation): Implemented as designed. Both dialogs are static in `sidepanel.html`.

---

### 15.11 Lesson Learned — SVG-Icon Buttons and Event Delegation

**Pattern**: When using inline SVG icons inside `<button>` elements, event delegation via `e.target === buttonEl` will fail because the click target is often the `<svg>`, `<path>`, or `<circle>` child element, not the button itself.

**Rule**: Always use `e.target.closest('#button-id')` or `e.target.closest('.button-class')` for event delegation on any button that contains child elements (SVG icons, `<span>` labels, etc.). This applies to all future icon buttons across the extension.

**Applies to**: `#add-bookmark-btn`, `.item-action-btn`, and any future buttons with SVG icons in sidepanel, newtab, or popup surfaces.

---

## 16. B-010 — Live Tab Reflection & Active-Tab Highlight (R2 Design)

### 16.1 Overview

B-010 verifies and closes gaps in the end-to-end live-tab and active-tab indicator pipeline. The data infrastructure shipped in B-001c (LiveTabIndex, TabClaims, `buildLiveStates`, `refetchAndPatchLiveState`). B-010 is NOT a rebuild; it is a verification + gap-close sprint item.

### 16.2 R1 Open Question Resolutions

**OQ-1: `windows.onFocusChanged` gap — CONFIRMED GAP, FIX REQUIRED.**

`chrome.tabs.onActivated` fires only when the active tab *within a window* changes. Switching focus between two windows (e.g., Alt-Tab) does NOT fire `tabs.onActivated` if the active tab in the target window was already its active tab before the switch. This means:

- Window A has tab 1 active. Window B has tab 5 active.
- User clicks on Window B. `tabs.onActivated` does NOT fire because tab 5 was already the active tab in Window B.
- Result: LiveTabIndex still shows tab 1 as `active: true` in Window A AND tab 5 as `active: true` in Window B. Neither is wrong per-window, but AC6 requires that only the *focused* window's active tab shows the active highlight.

**Fix**: Add a `chrome.windows.onFocusChanged` listener in `tab-events.js`. When a window gains focus (ignoring `chrome.windows.WINDOW_ID_NONE`), query the active tab in the focused window via `chrome.tabs.query({ active: true, windowId })`, then update the LiveTabIndex to set `active: false` for all tabs NOT in the focused window and `active: true` for the focused window's active tab. Broadcast `SCOPE.LIVE_STATE` with trigger `window/focused`.

**OQ-2: `console.warn` leakage in `broadcast.js` — CONFIRMED, FIX REQUIRED.**

Line 13 of `background/broadcast.js` has `console.warn('[tab-junkie:broadcast] firing:', scope, trigger)`. This fires on every tab event (activated, updated, removed) and violates CLAUDE.md's "No `console.log` debug noise" rule. Must be removed. The existing `console.warn` on line 15 (sendMessage failure) is legitimate error handling and stays.

**OQ-3: `tabs.onUpdated` debounce latency — CONFIRMED WITHIN BUDGET.**

The 100ms per-tab debounce in `tab-events.js` (line 65) only gates *claim re-evaluation* (which triggers `broadcast(SCOPE.LIVE_STATE)`). The LiveTabIndex itself is updated synchronously before the debounce (lines 44-57). Since `refetchAndPatchLiveState` in the sidepanel calls `MSG_LIST_ITEMS` which reads from the in-memory index synchronously, the actual live-state read is always current. The debounce only delays the *notification* to the UI, not the data. Worst case: 100ms debounce + ~50ms message round-trip + ~10ms DOM patch = ~160ms, well within the 500ms budget. No change needed.

**OQ-4: `requireClaimsReady` guard on cold open — CONFIRMED SAFE, NO GAP.**

Flow analysis:
1. SW cold start: `registerTabEventListeners(readyPromise)` registers listeners synchronously.
2. `initializeLiveState(readyPromise)` runs concurrently: builds LiveTabIndex, awaits `readyPromise`, then calls `reconcileClaims(items)` which sets `claimsReady = true`.
3. Any tab events firing before `reconcileClaims` completes are gated by `{ requireClaimsReady: true }` — broadcasts are suppressed.
4. Sidepanel's `DOMContentLoaded` handler calls `sendMessage(MSG_LIST_ITEMS)`, which in `storage-handlers.js` awaits `readyPromise`. By the time `readyPromise` resolves AND the dispatch runs `buildLiveStates(items)`, `initializeLiveState` has already run `reconcileClaims` (both await the same `readyPromise` and `initializeLiveState` starts its work at the same time). Edge case: if `buildLiveTabIndex()` takes longer than `readyPromise`, `reconcileClaims` could still be pending when `MSG_LIST_ITEMS` reads. However, `buildLiveStates` checks `if (!claimsReady)` and returns all-false defaults (line 208 of `tab-claims.js`). The first broadcast after `claimsReady` flips to true will trigger `refetchAndPatchLiveState` which corrects the UI. Net effect: at most one frame of "no live indicators" on cold open, then correct state within ~200ms. This is acceptable.

**OQ-5: `tabs.onUpdated` with empty URL in transit — CONFIRMED SAFE, NO GAP.**

The guard on line 60 of `tab-events.js`: `typeof changeInfo.url === 'string' && changeInfo.url !== ''` correctly filters out:
- `changeInfo.url === undefined` (non-URL updates like `audible` changes)
- `changeInfo.url === ''` (blank URL during navigation initiation)

During redirect chains, each intermediate URL that is non-empty triggers a debounced re-evaluation. The 100ms debounce collapses rapid redirect hops. If an intermediate URL briefly unsets a claim (URL doesn't match any item), the final URL re-evaluation corrects it. The temporary "un-claimed" state lasts at most one debounce cycle (~100ms) and is not user-visible because the broadcast is also debounced.

### 16.3 Code Changes Required

| # | File | Change | Reason |
|---|------|--------|--------|
| C-1 | `background/tabs/tab-events.js` | Add `chrome.windows.onFocusChanged` listener inside `registerTabEventListeners()` | OQ-1: multi-window active-tab tracking requires window focus events |
| C-2 | `background/broadcast.js` | Remove `console.warn` on line 13 | OQ-2: debug noise in production code |
| C-3 | `sidepanel/sidepanel.js` | Patch `refetchAndPatchLiveState()` to reconcile audible/drifted indicator DOM elements, not just data attributes | Currently only updates `dataset.*` attributes but audible/drifted indicator `<span>` elements are only created at full-render time; if a tab becomes audible after initial render, the icon element doesn't exist to become visible. Active/live work because they use CSS attribute selectors on the row itself. |
| C-4 | `sidepanel/sidepanel.css` | No changes needed | CSS already has `[data-live]`, `[data-active]`, `[data-audible]`, `[data-drifted]` selectors with correct theme variables for light/dark |

**No changes needed:**
- `manifest.json` — no new permissions required (see 16.5)
- `background/messages/storage-handlers.js` — `MSG_LIST_ITEMS` response shape (`{ items, liveStates, driftRecords }`) is already correct; `buildLiveStates` already returns `{ live, active, audible }` per item
- `shared/messages.js` — no new message types needed; `MSG_STATE_CHANGED` with `scope: 'liveState'` is sufficient

### 16.4 `windows.onFocusChanged` Listener Design

```js
// Inside registerTabEventListeners(readyPromise):
chrome.windows.onFocusChanged.addListener((windowId) => {
  // Ignore WINDOW_ID_NONE (all windows lost focus, e.g. user switched to another app)
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;

  // Deactivate all tabs in other windows, activate the focused window's active tab
  const index = getLiveTabIndex();
  for (const [id, entry] of index) {
    if (entry.windowId !== windowId) {
      entry.active = false;
    }
  }

  // Query the active tab in the focused window to ensure correctness
  chrome.tabs.query({ active: true, windowId }).then((tabs) => {
    if (tabs.length > 0) {
      updateTabEntry(tabs[0].id, { active: true, windowId });
    }
    broadcast(SCOPE.LIVE_STATE, 'window/focused', { requireClaimsReady: true });
  }).catch((err) => {
    console.warn('[tab-junkie] window focus query failed', err);
  });
});
```

**Key design decisions:**
- **Deactivate-then-query pattern**: First deactivate all tabs in non-focused windows (synchronous, in-memory), then query the actual active tab in the focused window (async) to set it. This avoids a race where two tabs are momentarily both active.
- **`WINDOW_ID_NONE` guard**: When the user switches to a non-browser app, all windows lose focus. We do NOT deactivate everything — the last-focused window's active tab remains highlighted. This is correct UX: when the user returns to the browser, the highlight is already there.
- **No `readyPromise` await**: This listener only touches the in-memory LiveTabIndex and issues a broadcast. No storage read needed. The `requireClaimsReady` gate on broadcast is sufficient.

### 16.5 Permissions Review

Current `manifest.json` permissions: `["tabs", "tabGroups", "storage", "sidePanel", "search"]`

| Permission | Required for B-010? | Present? | Notes |
|-----------|-------------------|----------|-------|
| `tabs` | Yes — `tab.url`, `tab.active`, `chrome.tabs.query`, `tabs.onActivated`, `tabs.onUpdated`, `tabs.onRemoved` | Yes | Already present |
| (none for windows) | `chrome.windows.onFocusChanged` and `chrome.windows.onRemoved` do NOT require any permission | N/A | These are available to all extensions by default; only `windows.getAll`, `windows.get`, `windows.create`, `windows.update` need the implicit access that `tabs` provides |
| `storage` | Yes — `chrome.storage.session` for TabClaims | Yes | Already present |

**No new permissions needed for B-010.**

### 16.6 Message Flow — End-to-End per AC

**AC1: Tab opens at saved URL -> live indicator appears**
```
chrome.tabs.onUpdated(tabId, {url: "..."}, tab)
  -> updateTabEntry(tabId, {url, windowId, active, index})     [sync, in-memory]
  -> debounce 100ms -> reevaluateTab(tabId, url, items)         [async, writes session storage]
  -> broadcast(SCOPE.LIVE_STATE, 'tab/updated')                 [fire-and-forget]
  -> sidepanel receives MSG_STATE_CHANGED {scope: 'liveState'}
  -> refetchAndPatchLiveState() -> MSG_LIST_ITEMS
  -> buildLiveStates(items) returns {itemId: {live: true, active: ?, audible: ?}}
  -> patches data-live="true" on matching .item-row
  -> CSS rule .item-row[data-live="true"] applies green left border
```

**AC2: Tab closes -> live indicator clears**
```
chrome.tabs.onRemoved(tabId)
  -> removeTabEntry(tabId)                                      [sync, in-memory]
  -> releaseClaimByTab(tabId)                                   [async, writes session storage]
  -> broadcast(SCOPE.LIVE_STATE, 'tab/removed')
  -> sidepanel patches data-live removed -> CSS reverts to no border
```

**AC3: Tab focused -> active highlight appears**
```
chrome.tabs.onActivated({tabId, windowId})
  -> deactivate previous active tab in same window              [sync, in-memory]
  -> updateTabEntry(tabId, {active: true, windowId})            [sync, in-memory]
  -> broadcast(SCOPE.LIVE_STATE, 'tab/activated')
  -> sidepanel patches data-active="true" on row
  -> CSS rule .item-row[data-active="true"] applies blue bg + blue left border
```

**AC6: Window focus switches -> active transfers (NEW with B-010 fix)**
```
chrome.windows.onFocusChanged(windowId)
  -> [guard: skip WINDOW_ID_NONE]
  -> deactivate all tabs in other windows                       [sync, in-memory]
  -> chrome.tabs.query({active: true, windowId})                [async]
  -> updateTabEntry(activeTab.id, {active: true})               [sync, in-memory]
  -> broadcast(SCOPE.LIVE_STATE, 'window/focused')
  -> sidepanel patches: old window's tab loses data-active, new window's tab gains data-active
  -> Only one item-row has data-active="true" at any time
```

### 16.7 `refetchAndPatchLiveState` Indicator DOM Gap — RESOLVED

~~Current `refetchAndPatchLiveState()` only toggles `dataset.*` attributes on existing `.item-row` elements. For `audible` and `drifted`, the CSS selectors target *child elements* that are only created during `buildItemRow()` when the state is truthy at render time.~~

**RESOLVED (B-010 for audible, B-011 for drifted):** `_ensureIndicators(row, live, isDrifted)` now handles both audible and drifted icon DOM lifecycle. Called from `refetchAndPatchLiveState` after updating data attributes. Creates indicator icons on false-to-true transitions and removes them on true-to-false transitions, including cleanup of the empty `.item-indicators` container. See section 10.7 "Sidepanel drift icon lifecycle" for full specification.

### 16.8 R2 Correctness Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C-1 | Storage schema versioned | PASS — No change | B-010 does not modify any persisted data shapes. LiveTabIndex is in-memory only. TabClaims shape (`Record<string, number>`) is unchanged. |
| C-2 | Message contracts typed | PASS — No change | `MSG_STATE_CHANGED { scope: 'liveState', trigger: string }` is unchanged. `liveStates` shape in `MSG_LIST_ITEMS` response (`Record<string, {live, active, audible}>`) is unchanged. New trigger value `'window/focused'` is a string — no contract change. |
| C-3 | Service worker cold-start safe | PASS | `windows.onFocusChanged` listener is registered synchronously in `registerTabEventListeners()`. It only reads/writes in-memory LiveTabIndex and broadcasts with `requireClaimsReady` gate. `initializeLiveState` builds the index and reconciles claims before the gate opens. |
| C-4 | ID stability | N/A | B-010 does not change item identity or matching logic. |
| C-5 | Manifest file references resolvable | N/A | No new files or manifest entries. |

### 16.9 Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `windows.onFocusChanged` fires rapidly during window drag/resize | LOW | The listener only does in-memory map mutations (O(n) over open tabs) + one async `tabs.query`. No debounce needed — the operation is cheap and idempotent. |
| `tabs.query` fails in the `onFocusChanged` handler | LOW | Wrapped in `.catch()` with `console.warn`. LiveTabIndex may have stale active flags until next `tabs.onActivated` corrects it. |
| Indicator DOM manipulation in `refetchAndPatchLiveState` introduces XSS | MEDIUM | All indicator elements use `innerHTML` with hardcoded SVG literals (no user data). Same pattern as `buildItemRow`. [security-reviewer] should verify. |

### 16.10 Rollback Plan

No storage schema changes. No new permissions. Rollback = revert the commit. No data migration needed.

---

## 17. B-010 — Live Tab Reflection & Active-Tab Highlight (R6 Close — What Shipped)

### 17.1 Summary

B-010 closed all gaps in the live-tab and active-tab indicator pipeline. The data infrastructure shipped in B-001c (LiveTabIndex, TabClaims, `buildLiveStates`) was verified correct and extended with: (1) a `windows.onFocusChanged` handler for multi-window active-tab tracking, (2) broadcast noise cleanup, (3) dynamic audible-indicator DOM creation/removal in the sidepanel, and (4) favicon rendering integrated from B-004.

### 17.2 What Was Built

#### Background layer

**`background/tabs/live-tab-index.js`** — In-memory `Map<tabId, LiveTabEntry>` unchanged in shape from B-001c. `LiveTabEntry = { url: string, windowId: number, active: boolean, audible: boolean, index: number, favIconUrl: string }`. Populated at SW cold start via `buildLiveTabIndex()` calling `chrome.tabs.query({})`. Mutated only through `updateTabEntry(tabId, patch)`, `removeTabEntry(tabId)`, and `removeTabsByWindow(windowId)`. `getLiveTabIndex()` returns the live Map reference (read-only contract).

**`background/tabs/tab-events.js`** — Registers 5 event listeners inside `registerTabEventListeners(readyPromise)`:

| Listener | Behavior |
|----------|----------|
| `tabs.onUpdated` | Updates LiveTabIndex synchronously with url/audible/favIconUrl/windowId/active/index. Guards `tab/favicon-changed` broadcast to fire only when favIconUrl changes WITHOUT a simultaneous URL change (prevents double-patch on navigation). **B-012:** Guards `tab/audible-changed` broadcast to fire only when `'audible' in changeInfo && !('url' in changeInfo)` — same pattern as favicon, prevents double-broadcast on navigation. Debounces URL-change re-evaluation at 100ms per tab via `reevalTimers` Map. Cancels pending timers on tab removal. |
| `tabs.onActivated` | Deactivates previous active tab in the same window via `updateTabEntry(id, { active: false })` (never direct Map mutation). Activates new tab. Broadcasts `tab/activated`. |
| `tabs.onRemoved` | Cancels reevalTimers for the tab, then `removeTabEntry` + `releaseClaimByTab`. **B-015:** `clearDrift(releasedItemId)` is now `await`ed after `releaseClaimByTab` resolves (in the async `.then` callback), ensuring drift records are cleaned up on tab close. Broadcasts `tab/removed` after claim release + drift clear. |
| `windows.onFocusChanged` | **NEW in B-010.** Fills the gap where `tabs.onActivated` does not fire on window focus switch. On `WINDOW_ID_NONE`: deactivates ALL tabs (user left the browser), broadcasts `window/blurred`. On a real windowId: deactivates tabs in non-focused windows, queries the active tab in the focused window via `chrome.tabs.query({ windowId, active: true })`, activates it AFTER the query resolves, broadcasts `window/focused`. |
| `windows.onRemoved` | Bulk timer cleanup + `removeTabsByWindow` + batch `releaseClaimByTab`. **B-015:** Each released claim now also `await`s `clearDrift(releasedItemId)` inside a `Promise.allSettled` over all removed tabs, ensuring bulk drift cleanup on window close. Early-returns if `!isClaimsReady()` (reconcileClaims will handle on next run). Broadcasts `tab/removed`. |

**`background/tabs/tab-claims.js`** — `buildLiveStates(items)` now includes `favIconUrl: tabEntry.favIconUrl || null` in each live-state entry (integrated from B-004). Shape: `Record<string, { live: boolean, active: boolean, audible: boolean, favIconUrl: string|null }>`.

**`background/broadcast.js`** — OQ-2 fix: removed the `console.warn('[tab-junkie:broadcast] firing:', scope, trigger)` debug line. Only the error-path `console.warn` on `sendMessage` failure remains.

#### Sidepanel layer

**`sidepanel/sidepanel.js`** — four key functions:

| Function | Purpose |
|----------|---------|
| `isSafeFaviconUrl(url)` | Allowlist helper accepting only `https://`, `http://`, `data:image/` scheme prefixes. Guards all favicon `<img>` creation against unsafe protocols (e.g., `chrome://`, `javascript:`, `file://`). |
| `buildItemRow(item, liveStates, driftRecords)` | Sets `data-item-id`, `data-live`, `data-active`, `data-audible`, `data-drifted` on the row element. Renders `<img class="item-favicon">` (with `isSafeFaviconUrl` guard + `onerror` fallback) or `<div class="item-avatar">` (first-letter + djb2 hash color). Static `aria-label` on edit/delete buttons. Indicator icons (audible, drifted) created only when state is truthy at render time. |
| `refetchAndPatchLiveState()` | Called on `MSG_STATE_CHANGED { scope: 'liveState' }`. Patches existing rows in-place (no full re-render). Error-safe: clears all stale indicators on `MSG_LIST_ITEMS` failure via atomic `indicators.replaceChildren()` + `indicators.remove()` (B-011). Guards against detached-node race with `itemListEl.contains(row)`. Patches favicon/avatar transitions (img to avatar, avatar to img, src update) using `getAttribute('src')` comparison to avoid IDL-resolved URL false positives (H-2 fix). Calls `_ensureIndicators()` for audible and drifted DOM transitions. |
| `_ensureIndicators(row, live, isDrifted)` | **(B-011 extended from audible-only.)** Creates/removes `.item-audible-icon` and `.item-drifted-icon` spans when state transitions occur post-render. `isConnected` guard prevents DOM ops on detached nodes. Creates/removes the `.item-indicators` container as needed. Inserts before `.item-actions` to maintain correct DOM order. SVG markup is hardcoded (no user data — XSS-safe). See section 10.7 for full specification. |

### 17.3 Deviations from R2 Plan (section 16)

| # | R2 Plan | What Shipped | Reason |
|---|---------|-------------|--------|
| D-1 | `WINDOW_ID_NONE` guard was "do NOT deactivate everything" (keep last-focused window highlighted) | Shipped: deactivates ALL tabs on `WINDOW_ID_NONE` and broadcasts `window/blurred` | More accurate representation — when the browser loses focus, no tab is truly "active" from the user's perspective. The next `onFocusChanged` with a real windowId re-activates correctly. |
| D-2 | R2 pseudocode used direct `entry.active = false` mutation in the onFocusChanged loop | Shipped: all mutations go through `updateTabEntry(id, { active: false })` | Consistent with the mutation contract established in B-001c; avoids bypassing any future instrumentation on `updateTabEntry`. |
| D-3 | R2 did not mention `_ensureIndicators` handling drifted icons | **RESOLVED in B-011 (Sprint 9):** `_ensureIndicators(row, live, isDrifted)` now handles both audible and drifted icon lifecycle. Originally deferred because drifted transitions were rare; resolved to close the indicator DOM gap completely. See section 10.7 "Sidepanel drift icon lifecycle". |
| D-4 | `buildLiveStates` return shape was `{ live, active, audible }` | Shipped: `{ live, active, audible, favIconUrl }` | B-004 integration added `favIconUrl` to the live-state contract. This was approved during B-004 R2; not a deviation from B-010's scope but worth documenting since it changed the shape referenced in section 16.2. |

### 17.4 Message Types

No new message types introduced. B-010 reuses the existing contract:

- **Broadcast**: `MSG_STATE_CHANGED { scope: 'liveState', trigger: '<event>' }` — triggers include `tab/updated`, `tab/activated`, `tab/removed`, `tab/favicon-changed`, `window/focused`, `window/blurred`.
- **Request/response**: `MSG_LIST_ITEMS` response includes `{ items, liveStates, driftRecords }` where `liveStates` shape is now `Record<string, { live: boolean, active: boolean, audible: boolean, favIconUrl: string|null }>`.

New trigger values added by B-010: `window/focused`, `window/blurred`. These are string values in the existing `trigger` field — no contract change.

### 17.5 Manifest Permissions

`tabs` and `windows` events were already available. `chrome.windows.onFocusChanged` and `chrome.windows.onRemoved` do not require any additional permission. No changes to `manifest.json`.

### 17.6 Storage Schema

No changes. LiveTabIndex is purely in-memory (lost on SW termination, rebuilt on cold start). TabClaims remain in `chrome.storage.session` under `tj:tabClaims` with unchanged shape `Record<string, number>`. The only addition to `buildLiveStates` output (`favIconUrl`) is an in-flight response field, not persisted.

### 17.7 Rollback Plan

No storage schema changes. No new permissions. No durable state changes. LiveTabIndex is ephemeral (in-memory). Rollback = `git revert` the B-010 commits. No data migration needed.

### 17.8 Known Deferred Items (from R4 MEDIUM findings)

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | Broadcast amplification — `broadcast()` sends to ALL open contexts (sidepanel, newtab, popup) via `chrome.runtime.sendMessage`; each context refetches `MSG_LIST_ITEMS` independently | MEDIUM | Deferred | Acceptable at current scale (<5 open surfaces). If Tab Junkie adds many open contexts, consider targeted messaging or a shared observable. |
| 2 | TOCTOU in rapid `onFocusChanged` — two rapid window-focus events could interleave: event 1 deactivates synchronously, then event 2 deactivates synchronously, then event 1's async `tabs.query` resolves and activates a tab in the wrong window | MEDIUM | Deferred | Extremely rare in practice (requires sub-millisecond focus switching). The next legitimate focus event self-corrects. No user-visible impact observed in UAT. |
| 3 | No `MSG_GET_LIVE_STATES` optimization — sidepanel refetches the full item list via `MSG_LIST_ITEMS` on every live-state broadcast, even though only `liveStates` changed | MEDIUM | Deferred | Performance is within budget (items list is typically <500 items, serialization is fast). A dedicated lightweight message could reduce payload but adds contract surface area. Tracked for future optimization. |

### 17.9 Test Coverage

| Suite | File | Tests | Coverage |
|-------|------|-------|----------|
| B-004 favicon | `tests/b004-favicon.test.js` | 19 | favIconUrl in liveStates, isSafeFaviconUrl allowlist (https/http/data:image allowed; chrome://javascript://file:// blocked), broadcast guard for favicon-only vs URL+favicon changes |
| B-010 live state | `tests/b010-live-state.test.js` | 18 | LiveTabIndex CRUD (build/update/remove/removeByWindow), all 5 event handlers (onUpdated, onActivated, onRemoved, onFocusChanged, windows.onRemoved), buildLiveStates output shape, claimsReady gate |
| Chrome mock additions | `tests/chrome-mock.js` | — | Added `windows.WINDOW_ID_NONE` constant, `windows.onFocusChanged` mock, `tabs.query` filter support for `{ windowId, active }` |

### 17.10 R2 Correctness Checklist (Post-Build Verification)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C-1 | Storage schema versioned | PASS — No change | No persisted data shapes modified. |
| C-2 | Message contracts typed | PASS — No change | New trigger values (`window/focused`, `window/blurred`) are strings in existing `trigger` field. `favIconUrl` added to `buildLiveStates` output (B-004 integration, not a B-010 contract change). |
| C-3 | Service worker cold-start safe | PASS | All 5 listeners registered synchronously in `registerTabEventListeners()`. `onFocusChanged` handler uses only in-memory LiveTabIndex + async `tabs.query` + `requireClaimsReady` broadcast gate. No `readyPromise` await needed. |
| C-4 | ID stability | N/A | No changes to item identity or matching logic. |
| C-5 | Manifest file references resolvable | N/A | No new files or manifest entries. |

---

## 18. B-008 — Group Reorder & Collapse/Expand Persistence (R6 Close)

This section documents what actually shipped for B-008: drag-to-reorder groups and persisted collapse/expand state.

### 18.1 Storage Schema — No Changes

Both fields used by B-008 already existed in the Group shape (defined in section 2):

| Field | Type | Default | Origin |
|-------|------|---------|--------|
| `sortOrder` | `number` (finite) | `Date.now()` at creation | B-001a schema |
| `collapsed` | `boolean` | `false` | B-001a schema |

No migration is required. No schema version bump. The `KNOWN_VERSION` in `background/storage/migration.js` is unchanged.

### 18.2 Storage Validation — sortOrder Finiteness (R4 Fix M-1)

`validateGroupPatch` in `background/storage/groups.js` was missing the `Number.isFinite()` guard on `sortOrder` that `validateNewGroup` already had. This was flagged as security finding M-1 during R4 and fixed:

```js
// groups.js line 133-134
if ('sortOrder' in patch && (typeof patch.sortOrder !== 'number' || !Number.isFinite(patch.sortOrder))) {
  throw new StorageError(ERR_VALIDATION, 'updateGroup: sortOrder must be a finite number');
}
```

This closes the gap where `Infinity`, `-Infinity`, or `NaN` could be persisted via the update path.

### 18.3 Sidepanel State Model

Module-level drag state in `sidepanel/sidepanel.js`:

| Variable | Type | Purpose |
|----------|------|---------|
| `_dragSrcGroupId` | `string \| null` | Group ID of the section being dragged; `null` when idle |
| `_dragInitiatedFromHandle` | `boolean` | `true` only when `mousedown` fired on `.group-drag-handle`; gates `dragstart` |
| `_pendingGroupsRender` | `boolean` | Set when a `scope === 'groups'` broadcast arrives mid-drag; deferred `renderAll()` fires in `dragend` |
| `dropIndicatorEl` | `HTMLDivElement` | Singleton `<div class="drop-indicator">` appended to `itemListEl`; toggled via `.hidden` |
| `collapsedGroups` | `Set<string>` | Panel-lifetime set tracking collapsed group IDs; hydrated from `group.collapsed` on `DOMContentLoaded` |

### 18.4 Drag Implementation

**Mechanism:** Native HTML5 Drag and Drop on `.group-section[data-group-id]` elements. Only real groups (not `__ungrouped__`) are draggable.

**Handle gating:** A `mousedown` listener on `itemListEl` sets `_dragInitiatedFromHandle` based on whether the event target is inside `.group-drag-handle`. The `dragstart` listener checks this flag and calls `e.preventDefault()` if false. This prevents accidental drags when clicking group headers to collapse/expand.

**Visual feedback:**
- `.dragging-src` class on the source section (reduces opacity).
- `.is-dragging` class on `itemListEl` (enables cursor and visual cues).
- `dropIndicatorEl` positioned before the nearest section whose vertical midpoint is below the cursor; if no section qualifies, positioned before `__ungrouped__` or appended to the list.

**DOM-first reorder:** On `drop`, the source section is moved in the DOM immediately via `itemListEl.insertBefore(srcSection, dropIndicatorEl)`. Then all `[data-group-id]` sections are enumerated and assigned `sortOrder = index * 1000`. Only groups whose `sortOrder` actually changed get a `MSG_UPDATE_GROUP` message.

**sortOrder scheme:** Multiplier of 1000 per position leaves room for future insertion without recalculating all positions (e.g., inserting between positions 0 and 1000 could use 500). Current implementation always recalculates all positions on reorder.

**Error recovery:** If any `MSG_UPDATE_GROUP` call in the `Promise.all` batch fails, the catch handler refetches all items and groups from storage and calls `renderAll()` to revert the DOM to the persisted state.

**Broadcast guard:** When a `scope === 'groups'` broadcast arrives from the service worker while `_dragSrcGroupId` is non-null (mid-drag), the handler sets `_pendingGroupsRender = true` instead of triggering an immediate `renderAll()`. The deferred render fires unconditionally in the `dragend` listener, ensuring the UI is never torn mid-drag.

### 18.5 Collapse/Expand Persistence

**Real groups:** `toggleGroup()` calls `sendMessage(MSG_UPDATE_GROUP, { id, patch: { collapsed: !expanded } })` after updating the DOM. The send is fire-and-forget (`.catch(() => {})`) since the UI is already toggled.

**Ungrouped section:** Collapse state is stored in `sessionStorage` under key `tj-ungrouped-collapsed` (panel-lifetime, not cross-session). This avoids a storage write for a synthetic group that has no storage record.

**Hydration on load:** `DOMContentLoaded` handler reads `sessionStorage` for ungrouped state, then iterates the fetched groups array and adds any group with `collapsed: true` to the `collapsedGroups` set before calling `renderAll()`.

**Click delegation guard:** The group-header click handler checks `e.target.closest('.group-drag-handle')` and returns early if true, preventing a collapse toggle when the user grabs the drag handle.

### 18.6 Message Contracts — No New Types

B-008 uses only existing message types:

| Message | Direction | Payload change |
|---------|-----------|----------------|
| `MSG_UPDATE_GROUP` | sidepanel -> SW | `{ id, patch: { sortOrder: number } }` or `{ id, patch: { collapsed: boolean } }` — both fields were already in the allowed patch schema |
| `MSG_LIST_GROUPS` | sidepanel -> SW | No change — used for error recovery refetch |
| `MSG_LIST_ITEMS` | sidepanel -> SW | No change — used for error recovery refetch |

No new `MSG_*` constants were added. The total remains at 18.

### 18.7 Accessibility

- Drag handle has `tabindex="0"`, `aria-label="Reorder group"`, and `title="Drag to reorder (keyboard reorder not yet available)"`.
- Drag handle uses a 6-dot grip SVG icon with `aria-hidden="true"`.
- Group headers retain existing `role="button"`, `tabindex="0"`, `aria-expanded`, and `aria-controls` attributes.
- Keyboard reorder is not yet implemented (deferred — see 18.9).

### 18.8 Rollback Plan

**No migration required.** Both `sortOrder` and `collapsed` pre-existed in the Group schema. A `git revert` of the B-008 commits removes the drag UI and collapse persistence logic. Groups will render with whatever `sortOrder` values are stored (the field is still read/sorted even without the drag UI). Collapsed groups will render expanded (the default) since the `collapsedGroups` set hydration code would be removed.

No data corruption risk. No storage format change. No compatibility shim needed.

### 18.9 Deferred Items

| Item | Rationale |
|------|-----------|
| Keyboard reorder (arrow keys on drag handle) | Accessibility enhancement; current title attribute discloses the gap; drag handle is focusable but only mouse drag works |
| Batch `MSG_UPDATE_GROUP` | Currently sends one message per changed group in `Promise.all`; a dedicated batch message type would reduce round-trips for large group counts |
| Reorder animation | CSS transition on `.group-section` position changes during drag; currently snaps instantly |
| Touch/pointer event support | HTML5 DnD has inconsistent touch support; a future pass could add pointer event fallback |

### 18.10 R2 Correctness Checklist (Post-Build Verification)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C-1 | Storage schema versioned | PASS — No change | `sortOrder` and `collapsed` fields pre-existed. No schema version bump needed. |
| C-2 | Message contracts typed | PASS — No change | No new message types. `MSG_UPDATE_GROUP` payload shape unchanged; `sortOrder` and `collapsed` were already in the allowed patch fields. |
| C-3 | Service worker cold-start safe | PASS | No new SW code. All persistence goes through existing `MSG_UPDATE_GROUP` handler in `storage-handlers.js`. Drag state is panel-local (module-level variables), not SW-dependent. |
| C-4 | ID stability | N/A | No changes to item identity or matching logic. Group IDs are stable ULIDs. |
| C-5 | Manifest file references resolvable | N/A | No new files or manifest entries. |

## 19. B-021 — Inline Side-Panel Filter with Debounce & Highlight (R6 Close)

### 19.1 Summary

B-021 adds an inline filter input to the sidepanel header that provides instant, client-side substring matching across all bookmark titles and URLs. The filter operates entirely on cached data held in module-level variables — no service worker messages are sent, no storage reads occur during filtering, and no new manifest permissions are required.

### 19.2 State Model

Six module-level variables support the filter subsystem:

| Variable | Type | Populated in | Purpose |
|----------|------|-------------|---------|
| `_filterQuery` | `string` | `input` event listener | Raw filter input value; drives show/hide logic |
| `_filterTimer` | `number \| null` | `input` event listener | `setTimeout` handle for 150ms debounce; cleared on each keystroke |
| `_cachedItems` | `Item[]` | `renderAll()` | Full item list; never re-fetched during filter |
| `_cachedGroups` | `Group[]` | `renderAll()` | Full group list; cached alongside items |
| `_cachedLiveStates` | `object` | `renderAll()` | Live tab states; cached alongside items |
| `_cachedDriftRecords` | `object` | `renderAll()` | Drift records; cached alongside items |
| `_itemById` | `Map<id, Item>` | `renderAll()` | O(1) lookup by item ID; built as `new Map(items.map(it => [it.id, it]))` |

**Cache strategy:** All six variables are populated at the top of `renderAll()`, which runs on initial load and on every `MSG_BROADCAST_MUTATION` re-render. The filter never triggers its own data fetch — it reads `_itemById` to resolve `data-item-id` attributes on DOM rows. This ensures filter latency is pure DOM + Map lookup, well under the 50ms P95 target.

### 19.3 `buildHighlightedText` — XSS-Safe Highlight Rendering

```
buildHighlightedText(text: string, query: string) → DocumentFragment
```

**Algorithm:** Linear scan using `String.prototype.indexOf` on lowercased copies. For each match, slices the original (case-preserved) text into a `<mark>` element via `.textContent` assignment. Non-matching segments use `document.createTextNode()`. Returns a `DocumentFragment`.

**Security properties:**
- Zero `innerHTML` usage — all user-provided strings (bookmark titles, URLs) flow through `createTextNode` or `.textContent`
- XSS-safe by construction: no HTML parsing of untrusted data
- Uses `lowerQuery.length` for slice extent, which is Unicode-safe for BMP characters (sufficient for URL/title content)

**Complexity:** O(n) per text string where n = `text.length`. Each character is visited at most twice (once in `indexOf`, once in `slice`).

### 19.4 `applyFilter` — Visibility Algorithm

**Algorithm:**
1. Iterate all `.group-section` elements in the item list
2. Within each section, iterate all `[data-item-id]` rows
3. For each row, perform O(1) lookup via `_itemById.get(row.dataset.itemId)`
4. Test `item.title.toLowerCase().includes(query)` and `item.url.toLowerCase().includes(query)`
5. Set `row.hidden = true/false` based on match
6. For matching rows, replace title/URL text nodes with highlighted fragments via `buildHighlightedText`
7. Update group count badge to show filtered count (or restore original count when filter cleared)
8. Hide group sections with zero visible items
9. Show `#filter-empty-state` when total visible count is zero and query is non-empty
10. Reset `itemListEl.scrollTop = 0` unconditionally

**Complexity:** O(n) where n = total item rows. Each row involves one Map lookup (O(1)) and two `String.includes` calls. No DOM creation — only show/hide toggling and text node replacement.

**Clear path:** When `query` is empty, all rows are unhidden, highlights are replaced with plain `textContent` from the cached item, group sections are shown, and the original `data-item-count` badge value is restored.

### 19.5 Event Flow

```
User types in #filter-input
  → input event fires
  → _filterQuery = filterInputEl.value
  → clearTimeout(_filterTimer)         // cancel pending debounce
  → _filterTimer = setTimeout(applyFilter, 150)  // 150ms debounce
  → ... 150ms elapses ...
  → applyFilter() runs (O(n) DOM visibility pass)
```

**Escape key:** `keydown` listener on `#filter-input` intercepts Escape, calls `e.preventDefault()` + `e.stopPropagation()` (prevents panel close), clears query, and calls `applyFilter()` synchronously (no debounce).

**Clear button:** `click` on `#filter-clear-btn` clears query, calls `applyFilter()` synchronously, returns focus to the input via `filterInputEl.focus()`.

**Re-render resilience:** At the end of `renderAll()`, if `_filterQuery` is non-empty, `applyFilter()` is called to re-apply the active filter to the freshly rebuilt DOM. This handles broadcast-driven re-renders without losing filter state.

### 19.6 HTML Additions

Added to `sidepanel.html` inside `#panel-header`:

- `#filter-container` — flex wrapper containing the input and clear button
- `#filter-input` — `type="search"`, `aria-label="Filter bookmarks"`, `autocomplete="off"`, `spellcheck="false"`
- `#filter-clear-btn` — `aria-label="Clear filter"`, initially `hidden`
- `#filter-empty-state` — `role="status"`, `aria-live="polite"`, `aria-atomic="true"`, initially `hidden`

### 19.7 CSS Additions

- `#filter-container`, `#filter-input`, `#filter-clear-btn`, `#filter-empty-state` layout and theming styles
- `mark` element highlight color via `--mark-bg` CSS custom property:
  - Light theme: `#fef08a` (yellow-200)
  - Dark theme: `#713f12` (yellow-900)

### 19.8 Service Worker & Message Contracts — No Changes

The filter operates entirely within the sidepanel JavaScript context. No new message types were introduced. No messages are sent to or received from the service worker during filter operations. The existing `MSG_BROADCAST_MUTATION` flow triggers `renderAll()`, which re-populates the cache and re-applies the active filter — no filter-specific SW coordination is needed.

### 19.9 Manifest Permissions — No Changes

No new permissions required. The filter reads only from in-memory cached data populated by the existing storage fetch in `renderAll()`.

### 19.10 Rollback Plan

**Risk:** None — no storage schema changes, no new message types, no manifest changes.

**Rollback procedure:** `git revert <commit-sha>` removes all filter UI and logic. No data migration needed. The cached variables (`_cachedItems`, `_itemById`, etc.) are inert when the filter code is absent — they are populated in `renderAll()` but never read outside of `applyFilter`/`buildHighlightedText`.

### 19.11 Deferred Items

| Item | Description | Candidate backlog ID |
|------|-------------|---------------------|
| Fuzzy search | Replace substring matching with Fuse.js or similar for typo tolerance | B-052 |
| Filter persistence | Preserve filter query across panel close/reopen via `sessionStorage` | Future backlog item |
| Filter by group/live-state | Scoped filter modes (e.g., "only live tabs", "only group X") | Future backlog item |
| Filter keyboard shortcut | Global `Ctrl+F` or `/` to focus the filter input | Future backlog item |

### 19.12 R2 Correctness Checklist (Post-Build Verification)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C-1 | Storage schema versioned | N/A | No storage schema changes. Filter state is ephemeral (module-level variables only). |
| C-2 | Message contracts typed | N/A | No new message types. Filter is entirely client-side. |
| C-3 | Service worker cold-start safe | PASS | No SW dependency. If SW restarts, `renderAll()` re-populates the cache from a fresh storage fetch, and `applyFilter()` re-runs. |
| C-4 | ID stability | PASS | Uses existing `item.id` via `data-item-id` attributes and `_itemById` Map. No new identity concerns. |
| C-5 | Manifest file references resolvable | N/A | No new files or manifest entries. |

---

## 20. B-053 — Break Circular Dependency partitions.js / write-transaction.js (R6 Close)

### Problem

`partitions.js` imported `writeTransaction` from `write-transaction.js`, and `write-transaction.js` imported `partitionKey`, `defaultShape`, and `assertShape` from `partitions.js`. This created a circular ES module dependency. While Chrome's V8 engine can resolve static circular imports via live bindings, the cycle made the module graph fragile and triggered false-positive warnings in `jsconfig.json`-based tooling.

### Solution: Extract `shapes.js`

A new module `background/storage/shapes.js` was extracted from `partitions.js`. It contains all partition constants, defaults, and validators that were previously co-located with the `readPartition` and `initializePartitions` functions.

**Exports from `shapes.js`:**

| Export | Kind | Description |
|--------|------|-------------|
| `PARTITION_ITEMS`, `PARTITION_GROUPS`, `PARTITION_PREFS`, `PARTITION_META`, `PARTITION_DRIFT`, `PARTITION_FLOATING_GROUPS` | `const string` | Partition name constants |
| `ALL_PARTITIONS` | `const string[]` | Ordered tuple of all six partition names |
| `MAX_TITLE`, `MAX_URL`, `MAX_NAME`, `MAX_COLOR` | `const number` | Field length caps (2048, 4096, 256, 32) |
| `MAX_BULK_INPUTS` | `const number` | Upper bound on `bulkCreateItems` inputs (500; added for B-005) |
| `DEFAULT_PREFERENCES` | `const object` | Frozen default preferences shape |
| `partitionKey(partition)` | `function` | Returns `tj:${partition}` |
| `defaultShape(partition)` | `function` | Returns the default empty value for a partition |
| `assertShape(partitionOrKey, value)` | `function` | Validates a partition value; throws `ERR_CORRUPT_DATA` on failure |

**Dependency graph (now acyclic):**

```
shapes.js ──→ errors.js
          └──→ shared/url.js (for normalizeUrl in drift validator)

write-transaction.js ──→ shapes.js (partitionKey, defaultShape, assertShape)
                     └──→ errors.js

partitions.js ──→ shapes.js (re-exports ALL shape exports)
              └──→ write-transaction.js (imports writeTransaction)
```

### Re-export pattern in `partitions.js`

`partitions.js` uses `export { ... } from './shapes.js'` to re-export every public name from `shapes.js`. This ensures existing consumers of `partitions.js` require zero import-path changes. The re-export syntax does **not** bind names into the local module scope, so `partitions.js` also has a separate `import { ALL_PARTITIONS, partitionKey, defaultShape, assertShape } from './shapes.js'` for its own `readPartition` and `initializePartitions` functions. This dual-import/re-export pattern is an intentional design decision — not duplication.

### Files changed

| File | Change |
|------|--------|
| `background/storage/shapes.js` | **New.** Extracted constants, defaults, validators from `partitions.js`. Added `MAX_BULK_INPUTS = 500` for B-005. |
| `background/storage/partitions.js` | Removed all constant/validator definitions. Re-exports from `shapes.js`. Local import for internal use. |
| `background/storage/write-transaction.js` | Changed import source from `partitions.js` to `shapes.js` for `partitionKey`, `defaultShape`, `assertShape`. |

### Manifest permissions — No changes

### Rollback plan

**Risk:** Low — pure refactor, no behavioral change. `git revert <commit-sha>` restores the original single-file layout. No storage schema changes, no migration needed.

### R2 Correctness Checklist (Post-Build Verification)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C-1 | Storage schema versioned | N/A | No schema change. Pure module extraction. |
| C-2 | Message contracts typed | N/A | No new message types. |
| C-3 | Service worker cold-start safe | PASS | Import graph is acyclic; all modules resolve before SW `install` event. |
| C-4 | ID stability | N/A | No identity changes. |
| C-5 | Manifest file references resolvable | N/A | No new manifest entries. |

---

## 21. B-013 — Opener-Chain Group Inheritance (R6 Close)

### Overview

When a user opens a new tab from an existing tab (e.g., Ctrl+click, middle-click, "Open in new tab"), the new tab inherits the group membership of its opener's saved item. This enables automatic group propagation without manual user intervention.

### Architecture

#### New module: `background/tabs/opener-chain.js`

Maintains an ephemeral in-memory `Map<tabId, openerTabId>` and provides a pure walk function to find the nearest grouped ancestor.

**Exports:**

| Export | Kind | Description |
|--------|------|-------------|
| `recordOpener(tabId, openerTabId)` | `function` | Records opener relationship; no-op when map is at capacity |
| `pruneOpener(tabId)` | `function` | Removes the child's entry; does NOT remove entries where tabId appears as a value (children maintain their opener references even after parent closes) |
| `pruneOpenersByWindow(tabIds[])` | `function` | Bulk prune for window close |
| `walkOpenerChain(tabId, claimsMirror, items, maxHops?)` | `function` | Pure function; walks up opener chain looking for nearest grouped ancestor; returns `{ groupId, itemId }` or `null` |
| `__resetOpenerMap()` | `function` | Test hatch — clears the map between tests |

**Design constraints:**

- **`MAX_OPENER_MAP_ENTRIES = 512`**: Hard cap prevents unbounded memory growth over long browser sessions. When the cap is reached, new opener relationships are silently dropped — the tab opens normally without group inheritance.
- **Cycle guard**: `walkOpenerChain` uses a `visited` Set initialized with the starting tabId. If a cycle is detected (openerMap points back to an already-visited tabId), the walk terminates immediately.
- **Max hops = 3** (default): Limits the walk depth. O(N * hops) linear scan of `claimsMirror` per hop, where N = number of claimed items. Acceptable for expected claim counts (< 1000 items).
- **Ephemeral**: The openerMap is lost on service worker restart. This is intentional and consistent with Chrome's own behavior — opener relationships (`tab.openerTabId`) are not persisted by Chrome across restarts. Consequence: tabs whose `onCreated` fired before a SW restart and whose `onRemoved` fires after will not have their opener relationships available. This is an accepted limitation.

#### Changes to `background/tabs/tab-events.js`

The `tabs.onCreated` listener now:

1. **Synchronous phase** (before any `await`): calls `updateTabEntry(tab.id, ...)` to register the tab in LiveTabIndex, then calls `recordOpener(tab.id, tab.openerTabId)` if the tab has an opener.
2. **Async IIFE**: awaits `readyPromise`, reads items, gets `claimsMirror`, calls `walkOpenerChain`. If a grouped ancestor is found:
   - Re-reads live state from `getLiveTabIndex().get(tab.id)` after the async gap (the tab's URL and index may have settled from the creation-time `about:blank` to the actual navigation target).
   - Bails out if the tab was removed during the async gap.
   - Calls `appendFloatingGroup` with the live URL, windowId, and tabIndex — not the stale creation-time values.
   - Broadcasts `tab/opener-inherited` without the `requireClaimsReady` guard (so the UI is notified even if claims haven't fully reconciled yet).

The `tabs.onRemoved` listener calls `pruneOpener(tabId)`.
The `windows.onRemoved` listener calls `pruneOpenersByWindow(removedTabIds)`.

#### Changes to `background/tabs/floating-groups.js`

- **`appendFloatingGroup(entry)`** (new): Atomic append via `writeTransaction` mutator. Unlike `saveFloatingGroups` which replaces the entire `tj:floatingGroups` partition, `appendFloatingGroup` reads-then-appends inside a single mutator, avoiding race conditions with concurrent appends.
- **Floating-group record shape**: Now includes `itemId: string` (required on write) and `savedAt: number` (required). The `assertShape` validator in `shapes.js` treats `itemId` as optional for backward compatibility with records written before B-013.
- **`reassociateFloatingGroups`**: Now calls `claimTabForItem(record.itemId, matchedTabId)` instead of using `record.groupId`. Records lacking a valid `itemId` (pre-B-013 orphans) are silently pruned without claim propagation to prevent poisoning the claims mirror with `undefined`.

### Data flow

```
tabs.onCreated(tab)
  |-- [sync] updateTabEntry(tab.id, {...})
  |-- [sync] recordOpener(tab.id, tab.openerTabId)
  +-- [async IIFE]
       |-- await readyPromise
       |-- items = await listItems()
       |-- claimsMirror = getClaimsMirror()
       |-- result = walkOpenerChain(tab.id, claimsMirror, items)
       |-- if result:
       |    |-- liveEntry = getLiveTabIndex().get(tab.id)  // re-read after async gap
       |    |-- if !liveEntry -> return (tab was removed)
       |    |-- await appendFloatingGroup({groupId, itemId, windowId, tabIndex, url, savedAt})
       |    +-- broadcast(SCOPE.LIVE_STATE, 'tab/opener-inherited')
       +-- catch -> console.warn (non-fatal)
```

### Files changed

| File | Change |
|------|--------|
| `background/tabs/opener-chain.js` | **New.** openerMap, recordOpener, pruneOpener, pruneOpenersByWindow, walkOpenerChain, __resetOpenerMap. |
| `background/tabs/tab-events.js` | `onCreated` listener: synchronous recordOpener + async inheritance IIFE. `onRemoved`: pruneOpener. `windows.onRemoved`: pruneOpenersByWindow. |
| `background/tabs/floating-groups.js` | `appendFloatingGroup` added. `saveFloatingGroups` and `reassociateFloatingGroups` updated for `itemId` field. Orphan guard for records lacking `itemId`. |
| `background/storage/shapes.js` | `assertShape` for `floatingGroups` partition: `itemId` validated on write but treated as optional in the shape validator for backward compatibility. |

### Manifest permissions — No changes

No new permissions required. `tabs` permission (already declared) provides `tab.openerTabId`.

### Rollback plan

**Risk:** Low — openerMap is ephemeral; floating-group records with `itemId` are backward-compatible (assertShape treats `itemId` as optional). `git revert <commit-sha>` removes opener-chain logic. Existing floating-group records with `itemId` are harmless — the extra field is ignored by pre-B-013 code. No storage migration needed.

### R2 Correctness Checklist (Post-Build Verification)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C-1 | Storage schema versioned | PASS | `tj:floatingGroups` shape extended with optional `itemId`. No schema version bump needed — `assertShape` treats `itemId` as optional for backward compatibility. |
| C-2 | Message contracts typed | N/A | No new message types. `tab/opener-inherited` is a broadcast event, not a request/response message. |
| C-3 | Service worker cold-start safe | PASS | openerMap starts empty on every cold start — no stale state. `readyPromise` gate ensures items and claims are loaded before walking the chain. |
| C-4 | ID stability | PASS | `itemId` in floating-group records is the ULID of the opener's item — stable across URL drift and window moves. |
| C-5 | Manifest file references resolvable | N/A | No new manifest entries. |

---

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

## 23. B-054 — Sidepanel Shell Verification (R6 Close)

B-054 is a verification item confirming the full sidepanel implementation built across Sprints 6-10. The sidepanel replaced the original `sidepanel.html` stub and delivers 17 acceptance criteria covering the complete bookmark management UI surface.

### 23.1 Architecture Overview

The sidepanel follows a **message-based architecture** with no direct storage access. All reads and writes go through `chrome.runtime.sendMessage` to the service worker, enforced by the ESLint write-boundary denylist (§6). The render lifecycle has two distinct paths:

**Initial load (skeleton to render):**
1. `sidepanel.html` loads `theme-init.js` synchronously (sets theme class before first paint, preventing flash).
2. `DOMContentLoaded` fires. The skeleton loader (CSS-animated placeholder rows) is visible immediately.
3. `sidepanel.js` sends `MSG_LIST_ITEMS` and `MSG_LIST_GROUPS` in parallel via `Promise.all`.
4. On response, `renderAll()` builds the full group tree using a `DocumentFragment`, appends it in a single DOM write, then hides the skeleton.

**Broadcast-driven updates (two paths):**
- **Full re-render** (`MSG_STATE_CHANGED { scope: 'items' | 'groups' }`): calls `renderAll()` which rebuilds the entire tree. Used when the item or group collection changes (CRUD, bulk operations, group reorder).
- **Targeted live-state patch** (`MSG_STATE_CHANGED { scope: 'liveState' }`): calls `refetchAndPatchLiveState()` which fetches fresh data and patches existing DOM rows in-place without rebuilding the tree. Used for tab events (active, audible, drift, favicon changes).

### 23.2 Key Patterns

#### DocumentFragment single-append rendering

`renderAll()` constructs the entire group tree (groups, sub-groups, item rows) inside a `DocumentFragment`, then appends it to the live DOM in one operation. This avoids incremental layout thrashing during large renders. Each group section is built by `buildGroupSection()`, which recursively handles sub-group indentation via CSS class `.group-section--child`.

#### `_ensureIndicators` patch lifecycle

`_ensureIndicators(row, live, isDrifted)` is the sole function responsible for creating and removing audible and drifted indicator icons on item rows after initial render. It guards against detached-node DOM operations via `row.isConnected`. It creates or removes the `.item-indicators` container as needed, and inserts it before `.item-actions` to maintain correct DOM order. SVG markup is hardcoded (no user data interpolation — XSS-safe).

**R4 fix (Sprint 11):** SVG icon factory functions `_createAudibleIcon()` and `_createDriftedIcon()` were extracted to eliminate duplication between `buildItemRow()` (initial render) and `_ensureIndicators()` (patch path). Both call sites now use the same factories.

#### `_pendingGroupsRender` drag guard

During drag-and-drop reorder operations, a `MSG_STATE_CHANGED` broadcast can arrive mid-drag (because the `MSG_UPDATE_GROUP` that persists the new `sortOrder` triggers a broadcast). The `_pendingGroupsRender` flag suppresses `renderAll()` during active drag operations and queues a single re-render for when the drag completes. This prevents the DOM from being rebuilt under the user's cursor.

#### `refetchAndPatchLiveState` with O(1) `itemMap` lookup

This function handles high-frequency live-state broadcasts (tab activated, audible changed, drift detected) without full re-renders. It fetches `MSG_LIST_ITEMS` and iterates the response to patch `data-live`, `data-active`, `data-audible`, `data-drifted` attributes and favicon/avatar transitions on existing rows.

**R4 fix (Sprint 11):** The original implementation used `items.find(i => i.id === id)` inside the row-patching loop, resulting in O(N x M) complexity where N = rows and M = items. This was replaced with a pre-built `Map<id, item>` (`itemMap`) for O(1) lookups per row, reducing complexity to O(N + M).

#### Nested group drag reorder

Group sections are reorderable via drag-and-drop with `sortOrder` persistence. The drag handler uses `querySelectorAll('.group-section')` to enumerate draggable sections.

**R4 fix (Sprint 11):** The original selector included child (sub-group) sections, causing nested groups to be independently draggable and producing incorrect `sortOrder` values. The fix changed the selector to exclude `.group-section--child`, ensuring only top-level groups participate in reorder operations.

### 23.3 File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `sidepanel/sidepanel.html` | ~180 | Shell HTML: header with filter input, group list container, CRUD dialog (static, `hidden`), confirmation dialog (static, `hidden`), skeleton loader, empty-state placeholder |
| `sidepanel/sidepanel.js` | 1249 | Main module: `renderAll`, `buildGroupSection`, `buildItemRow`, `refetchAndPatchLiveState`, `_ensureIndicators`, drag/drop handlers, keyboard navigation, CRUD dialog logic, filter with debounce, broadcast listener |
| `sidepanel/sidepanel.css` | ~500 | Layout, group/item styling, indicator icons, theme variables (light/dark), skeleton animation, dialog overlay, drag ghost states, focus indicators |
| `sidepanel/theme-init.js` | ~10 | Synchronous theme class application from `chrome.storage.local` before first paint |

### 23.4 Acceptance Criteria Delivered

| # | AC | Status |
|---|-----|--------|
| AC1 | HTML shell with header, group list, skeleton, empty state | PASS |
| AC2 | Parallel `MSG_LIST_ITEMS` + `MSG_LIST_GROUPS` fetch on load | PASS |
| AC3 | Group sections rendered with name + color bar | PASS |
| AC4 | Sub-group indentation via `.group-section--child` | PASS |
| AC5 | Item rows with favicon (safe-URL guard) or letter avatar | PASS |
| AC6 | Live indicator (green border via `[data-live]` CSS) | PASS |
| AC7 | Active indicator (`[data-active]` styling) | PASS |
| AC8 | Audible indicator (speaker icon via `_ensureIndicators`) | PASS |
| AC9 | Drifted indicator (drift icon via `_ensureIndicators`) | PASS |
| AC10 | Collapse/expand groups with persisted state | PASS |
| AC11 | Click-to-navigate via `MSG_NAVIGATE_TO_ITEM` | PASS |
| AC12 | Broadcast-driven re-render (full + targeted patch) | PASS |
| AC13 | Empty state: icon + message + CTA | PASS |
| AC14 | Loading skeleton (CSS-animated, not spinner) | PASS |
| AC15 | Theme support (light/dark, flash-free via `theme-init.js`) | PASS |
| AC16 | Keyboard navigation (arrow keys, Enter to activate, Tab for actions) | PASS |
| AC17 | ARIA roles (`role="tree"`, `role="treeitem"`, `aria-expanded`, focus indicators) | PASS |

### 23.5 Message Types Used

No new message types introduced. The sidepanel consumes the existing contract:

| Message | Direction | Purpose |
|---------|-----------|---------|
| `MSG_LIST_ITEMS` | sidepanel -> SW | Fetch items + liveStates + driftRecords |
| `MSG_LIST_GROUPS` | sidepanel -> SW | Fetch group tree |
| `MSG_CREATE_ITEM` | sidepanel -> SW | Bookmark CRUD |
| `MSG_UPDATE_ITEM` | sidepanel -> SW | Bookmark CRUD |
| `MSG_DELETE_ITEM` | sidepanel -> SW | Bookmark CRUD |
| `MSG_GET_ITEM` | sidepanel -> SW | Pre-fill edit dialog |
| `MSG_CREATE_GROUP` | sidepanel -> SW | Group CRUD |
| `MSG_UPDATE_GROUP` | sidepanel -> SW | Group CRUD (incl. sortOrder, collapsed) |
| `MSG_DELETE_GROUP` | sidepanel -> SW | Group CRUD |
| `MSG_PROMOTE_TAB` | sidepanel -> SW | Save live tab as bookmark |
| `MSG_DEMOTE_ITEM` | sidepanel -> SW | Demote bookmark to floating tab |
| `MSG_NAVIGATE_TO_ITEM` | sidepanel -> SW | Open/switch to tab |
| `MSG_CLOSE_TABS` | sidepanel -> SW | Close live tabs |
| `MSG_BULK_CREATE_ITEMS` | sidepanel -> SW | Bulk import |
| `MSG_SET_PREFERENCES` | sidepanel -> SW | Theme preference |
| `MSG_STATE_CHANGED` | SW -> sidepanel | Broadcast trigger for re-render/patch |

### 23.6 Storage Schema — No Changes

No new partitions, no schema version bump, no migration. The sidepanel is a pure consumer of existing message contracts.

### 23.7 Manifest Permissions — No Changes

No new permissions. `sidePanel` permission and `side_panel.default_path` were already declared in `manifest.json`.

### 23.8 Known Limitations

| # | Limitation | Severity | Notes |
|---|-----------|----------|-------|
| 1 | AC12 performance not formally measured | LOW | The performance standard (< 200ms first paint on 500 items, < 50ms search P95 on 1000 items) has not been benchmarked with instrumentation. UAT showed no perceptible lag but formal measurement is deferred. |
| 2 | `sidepanel.js` is 1249 lines | MEDIUM | The file handles rendering, patching, drag/drop, keyboard nav, CRUD dialogs, and filter logic in a single module. Recommended for future modularity improvement: extract dialog logic, drag handlers, and keyboard navigation into separate modules under `sidepanel/`. |
| 3 | Full re-render on item/group mutations | LOW | `renderAll()` rebuilds the entire group tree on any item or group change. Targeted DOM patching for single-item CRUD would reduce work but adds complexity. Acceptable at current collection sizes (< 1000 items). |
| 4 | Broadcast amplification on live-state events | MEDIUM | Inherited from B-010 (§17.8 finding #1). Each live-state broadcast triggers `MSG_LIST_ITEMS` refetch even though only indicator attributes changed. A dedicated lightweight `MSG_GET_LIVE_STATES` message could reduce payload. |

### 23.9 R4 Fixes Applied (Sprint 11)

| # | Finding | File | Fix |
|---|---------|------|-----|
| H-1 | Duplicate SVG markup for audible/drifted icons between `buildItemRow` and `_ensureIndicators` | `sidepanel/sidepanel.js` | Extracted `_createAudibleIcon()` and `_createDriftedIcon()` factory functions; both render paths now call the same factories |
| H-2 | O(N x M) complexity in `refetchAndPatchLiveState` from `items.find()` inside row loop | `sidepanel/sidepanel.js` | Pre-built `Map<id, item>` (`itemMap`) before the loop; lookups are now O(1) |
| H-3 | Nested group sections included in drag reorder `querySelectorAll` | `sidepanel/sidepanel.js` | Changed selector to exclude `.group-section--child`; only top-level groups participate in reorder |

### 23.10 Rollback Plan

No storage schema changes. No new permissions. No durable state changes beyond what the existing CRUD message handlers already persist. Rollback = `git revert` the B-054 commits; the sidepanel reverts to its stub state. No data migration needed.

### 23.11 R2 Correctness Checklist (Post-Build Verification)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C-1 | Storage schema versioned | N/A | No schema change. Sidepanel is a pure consumer of existing message contracts. |
| C-2 | Message contracts typed | PASS | No new message types. All 16 consumed messages pre-existed in `shared/messages.js` with sidepanel listed as allowed sender. |
| C-3 | Service worker cold-start safe | PASS | Sidepanel sends `MSG_LIST_ITEMS` + `MSG_LIST_GROUPS` on every load; these handlers `await readyPromise` in the SW, so a cold-start SW correctly gates the response until migrations complete. |
| C-4 | ID stability | N/A | No changes to item identity or matching logic. |
| C-5 | Manifest file references resolvable | PASS | `side_panel.default_path: "sidepanel/sidepanel.html"` resolves to the implemented HTML file (no longer a stub). |

---

## 24. B-018 — Floating Tab Group Persistence Across Restart (R6 Close)

### 24.1 Summary

B-018 is a verification item confirming that floating-group records in `tj:floatingGroups` survive service-worker restarts and browser restarts, and that `reassociateFloatingGroups` correctly re-claims tabs on cold start. The core persistence logic was pre-built in B-001d (drift/claim infrastructure) and B-002 (floating-group re-association). B-018 verified the end-to-end flow and fixed two race conditions found during R4 review.

### 24.2 Architecture Confirmed

The cold-start sequence for floating-group persistence:

1. Service worker wakes (cold start or browser restart).
2. `readyPromise` gates on `runMigrations()` completing.
3. `reconcileClaims()` rebuilds `claimsMirror` from `storage.session` and `liveTabIndex`.
4. `reassociateFloatingGroups(liveTabIndex, existingClaims)` runs post-`reconcileClaims`.
5. For each `tj:floatingGroups` record: position match (`windowId` + `tabIndex`) first, URL fallback second.
6. Disambiguation: first-record-wins via `claimedTabIds` Set prevents multiple records from claiming the same tab.
7. Resolved records are pruned from `tj:floatingGroups`; unresolved records are retained.

No post-restart broadcast is needed. The sidepanel uses a pull-on-open pattern (`MSG_LIST_ITEMS` on every `DOMContentLoaded`), so it always fetches current state including any claims established during re-association.

### 24.3 R4 Fixes

| # | Severity | Finding | File | Fix |
|---|----------|---------|------|-----|
| H-1 | HIGH | TOCTOU in `pruneResolvedFloatingGroups`: stale `records` snapshot used inside `writeTransaction` callback | `background/tabs/floating-groups.js` | Mutator reads live `current` from `writeTransaction`; filters by `resolvedItemIds` Set (stable keys) instead of positional indices |
| H-2 | HIGH | Premature resolution marking: `resolvedItemIds.add()` called before `await claimTabForItem()` succeeded | `background/tabs/floating-groups.js` | Moved `add` to after successful claim; on failure, releases the tab and logs warning |

### 24.4 Storage Schema — No Changes

No new partitions. No schema version bump. `tj:floatingGroups` shape (`FloatingGroup[]`) is unchanged from B-002/B-013. `KNOWN_VERSION` remains at `1`.

### 24.5 Message Contracts — No New Types

No new message types. The re-association flow is internal to the service worker cold-start sequence and does not use `chrome.runtime.onMessage`.

### 24.6 Manifest Permissions — No Changes

No new permissions required.

### 24.7 Test Coverage

9 new tests added (374 total), covering:
- Position-match resolution on cold start
- URL-fallback resolution when tab position has changed
- Disambiguation (first-record-wins via `claimedTabIds`)
- TOCTOU fix: prune uses live `current` not stale snapshot
- Premature-resolution fix: failed claim does not mark record as resolved
- Unresolved records retained across restart cycles

### 24.8 Known Deferred Items

| # | Item | Severity | Notes |
|---|------|----------|-------|
| 1 | No TTL on unresolved `FloatingGroup` records | LOW | Inherited from B-002 (§10.8). Records for permanently closed windows accumulate indefinitely. Cleanup job tracked as tech debt. |

### 24.9 Rollback Plan

No storage schema changes. No new permissions. Reverting B-018 code changes reverts the two race-condition fixes (H-1 and H-2); the pre-B-018 code still functions but has the TOCTOU and premature-resolution bugs under concurrent-write and claim-failure edge cases. No data migration needed.

### 24.10 R2 Correctness Checklist (Post-Build Verification)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C-1 | Storage schema versioned | N/A | No schema change. Verification item only. |
| C-2 | Message contracts typed | N/A | No new message types. |
| C-3 | Service worker cold-start safe | PASS | `reassociateFloatingGroups` runs after `reconcileClaims` completes; `readyPromise` gates all message handlers. The two race-condition fixes (H-1, H-2) improve cold-start correctness. |
| C-4 | ID stability | PASS | `resolvedItemIds` Set uses `record.itemId` (stable bookmark ID). No positional-index dependency. |
| C-5 | Manifest file references resolvable | N/A | No manifest changes. |

---

## 25. B-024 — Multi-select + Bulk Action Bar (R6 Close)

### 25.1 Summary

B-024 adds sidepanel multi-selection (single-click, Shift+Click range, Ctrl/Cmd+Click toggle, Ctrl/Cmd+A all-visible, Escape to clear), a contextual bulk action bar, and three bulk server-side operations: close tabs (via the pre-existing `MSG_CLOSE_TABS`), bulk-delete saved items (new `MSG_BULK_DELETE_ITEMS`), and bulk-update item `groupId` for move-to-group (new `MSG_BULK_UPDATE_ITEMS`). Selection state is entirely in-memory in the sidepanel and is never persisted.

B-026 (item right-click context menu) and B-049 (empty states + error-toast) shipped in the same diff — they are briefly documented at §25.9 below. Neither added new message contracts; B-026 consumes the new `liveStates[itemId].tabId` field introduced here, and B-049 is pure UI.

### 25.2 New Message Contracts

Two new constants added to `shared/messages.js`:

```js
export const MSG_BULK_DELETE_ITEMS = 'tj/bulkDeleteItems';
export const MSG_BULK_UPDATE_ITEMS = 'tj/bulkUpdateItems';
```

Both are registered in `storage-handlers.js` `dispatch()`, added to `MUTATION_BROADCASTS` under `SCOPE.ITEMS`, and included in the safe-mode `writeTypes` Set. Both are subject to the `sender.id === chrome.runtime.id` runtime guard that fronts every handler.

#### `MSG_BULK_DELETE_ITEMS`

| Aspect | Value |
|---|---|
| Constant | `MSG_BULK_DELETE_ITEMS` |
| String | `tj/bulkDeleteItems` |
| Request payload | `{ ids: string[] }` — non-empty array of item ids |
| Success `data` | `{ deleted: string[], notFound: string[] }` |
| Error codes | `ERR_VALIDATION` (empty / non-array / non-string ids / `length > MAX_BULK_INPUTS`), `ERR_SAFE_MODE`, `ERR_NOT_READY`, `ERR_TX_CONFLICT` |
| Allowed senders | sidepanel, newtab, popup (same-extension-origin only) |
| Partial-success | Yes — unknown ids are reported in `notFound`; found ids are deleted in a single `writeTransaction` write to `PARTITION_ITEMS`. Never returns `{ ok: false }` for the "some ids missing" case. |
| Broadcast | `SCOPE.ITEMS` on success |

#### `MSG_BULK_UPDATE_ITEMS`

| Aspect | Value |
|---|---|
| Constant | `MSG_BULK_UPDATE_ITEMS` |
| String | `tj/bulkUpdateItems` |
| Request payload | `{ ids: string[], patch: { groupId: string \| null } }` |
| Success `data` | `{ updated: string[], notFound: string[] }` |
| Error codes | `ERR_VALIDATION` (empty / non-array / non-string ids / `length > MAX_BULK_INPUTS` / patch missing / disallowed patch keys / `groupId` not string \| null / empty-string `groupId`), `ERR_NOT_FOUND` (when `patch.groupId` references a non-existent group — thrown by `assertGroupExists`), `ERR_SAFE_MODE`, `ERR_NOT_READY`, `ERR_TX_CONFLICT` |
| Allowed senders | sidepanel, newtab, popup (same-extension-origin only) |
| Allowed patch keys | **`groupId` only.** Any other key fails `ERR_VALIDATION`. This is deliberately narrow — bulk title/url edits are out of scope and would reopen per-item URL-normalization and duplicate-URL checks. |
| Partial-success | Yes — unknown ids reported in `notFound`; found ids updated in a single `writeTransaction` over `PARTITION_GROUPS` + `PARTITION_ITEMS`. `updatedAt` is bumped for every updated item; `id` and `createdAt` are preserved. |
| Broadcast | `SCOPE.ITEMS` on success |

#### `MSG_CLOSE_TABS` — extended usage (no contract change)

`MSG_CLOSE_TABS` itself was introduced in B-020 (see §5) and its wire contract is unchanged. B-024 is simply the first real UI caller. The handler partitions `tabIds` into `closed` vs `notFound`, closes valid tabs via a single `chrome.tabs.remove(validTabIds[])` call, and relies on `tabs.onRemoved` for claim cleanup (intentionally absent from `MUTATION_BROADCASTS` for this reason — see inline comment at `storage-handlers.js:340`).

### 25.3 Envelope & Partial-Success Semantics

All three bulk operations (including existing `MSG_BULK_CREATE_ITEMS` from B-005) follow a consistent **partial-success envelope** pattern:

- **The request is either fully rejected (`{ ok: false, error: { code: 'ERR_VALIDATION', ... } }`) before any storage work** when the payload shape itself is invalid (non-array `ids`, oversized `ids`, non-string ids, disallowed patch keys, etc.).
- **Or it succeeds with `{ ok: true, data: { <done>: string[], <missing>: string[] } }`** where unknown ids appear in `notFound` / failed inputs in `skipped`. Callers must treat `data.notFound.length > 0` as a soft partial-failure signal, not as an error.
- **Field names are per-operation**: `bulkCreateItems → {created, skipped}`, `bulkDeleteItems → {deleted, notFound}`, `bulkUpdateItems → {updated, notFound}`, `closeTabs → {closed, notFound}`. Each keeps its historical shape; no unified envelope field name.

The sidepanel uses `notFound` as the signal to silently prune stale selection ids (see §25.5 "Silent pruning") and to surface partial-failure toasts where user-visible (bulk Remove — see `sidepanel.js` bulk-remove handler).

### 25.4 `MAX_BULK_INPUTS` Cap

`background/storage/items.js` exports `MAX_BULK_INPUTS` (introduced in B-005 for `bulkCreateItems`). B-024 extends this cap to the two new bulk handlers:

| Handler | Capped by `MAX_BULK_INPUTS`? |
|---|---|
| `bulkCreateItems` | Yes (since B-005) |
| `bulkDeleteItems` | **Yes (B-024)** — `ids.length > MAX_BULK_INPUTS` → `ERR_VALIDATION` |
| `bulkUpdateItems` | **Yes (B-024)** — `ids.length > MAX_BULK_INPUTS` → `ERR_VALIDATION` |
| `closeTabs` handler (`MSG_CLOSE_TABS`) | **No** — deferred hardening, see §25.10 |

The cap defends against payload-size abuse and runaway sidepanel-side bugs that could forward an unbounded selection to the SW. It is expressed as a hard `ERR_VALIDATION` throw at the storage-function boundary — before any `writeTransaction` work.

### 25.5 `liveStates` Response Shape Change

`buildLiveStates()` in `background/tabs/tab-claims.js` now surfaces the claimed `tabId` as a new field on every **live** `liveStates` entry. The extended shape:

```js
// Live item (claimed tab present in LiveTabIndex)
liveStates[itemId] = {
  live: true,
  active: boolean,
  audible: boolean,
  favIconUrl: string | null,
  tabId: number,          // NEW — B-024/B-026
}

// Non-live item — unchanged
liveStates[itemId] = {
  live: false,
  active: false,
  audible: false,
  favIconUrl: null,
  // no tabId field
}
```

**Why:** the bulk-close and single-item close-tab flows need the claimed `tabId` to pass into `MSG_CLOSE_TABS`; without surfacing it on the enriched response the sidepanel would have to issue per-item lookups or re-derive claims client-side. The sidepanel now caches `liveStates` in `_cachedLiveStates` and reads `_cachedLiveStates[itemId]?.tabId` directly. `refetchAndPatchLiveState` reassigns `_cachedLiveStates = liveStates` on every refresh so the bulk bar's "Close tabs" disabled state never lags reality (R4 C-1 fix).

**Security note — same-origin gate:** `tabId` is a privileged field. It is only returned through `MSG_LIST_ITEMS` responses, and `registerStorageHandlers` in `storage-handlers.js` rejects every incoming message where `sender.id !== chrome.runtime.id` with `ERR_DIRECT_WRITE` before any handler runs. Externally-connectable callers are not reachable (no `externally_connectable` key in the manifest — see §5 "Manifest permissions (reference)"), so `tabId` cannot escape the extension origin through the message boundary.

**Unchanged:** The `MSG_LIST_ITEMS` response envelope `{ items, liveStates, driftRecords }` is otherwise unchanged. No new message type, no schema bump.

### 25.6 Selection Semantics (UI-only — not persisted)

Selection state lives entirely in the sidepanel in three mutable fields: `_selection: Set<itemId>`, `_lastSelectedId: string | null` (most-recently toggled, used for UI feedback), and `_rangeAnchorId: string | null` (stable anchor for Shift+Click — see below). None of these are persisted to `chrome.storage`; closing the sidepanel clears them.

| Gesture | Behavior |
|---|---|
| Plain click | If selection active, toggles; otherwise navigates (via `MSG_NAVIGATE_TO_ITEM`). Double-click always navigates and cancels any deferred single-click toggle. |
| Shift+Click | Range-selects from `_rangeAnchorId` to clicked id in current DOM order, across visible rows. `_rangeSelect` **never mutates** `_rangeAnchorId` — the anchor is stable across repeated range operations. |
| Ctrl/Cmd+Click | Toggles one id. Updates `_rangeAnchorId` to the toggled id (new anchor for subsequent Shift+Click). |
| Ctrl/Cmd+A | Selects all **currently visible** (non-filter-hidden) rows. Hidden-by-filter rows are excluded by design so the visible "N selected" count matches what the user sees (AC #2 interpretation; R4 M-8). Updates `_rangeAnchorId` to the last visible id. |
| Escape | `_clearSelection()` — empties `_selection`, resets anchors, AND closes the bulk-move picker if open (H-1 fix). Never navigates, never closes tabs, never mutates storage. |

**Range anchor separation (R4 H-3 fix):** Prior to R4 the single field `_lastSelectedId` served both "UI highlight" and "Shift+Click anchor" duties. Because `_toggleSelection` updated it but `_rangeSelect` did not, the anchor drifted with every toggle — making repeated Shift+Click ranges produce wrong selections. The fix splits the concerns: `_rangeAnchorId` is set only by `_toggleSelection` / `_selectAll`, and `_rangeSelect` reads but never writes it.

**Silent pruning of stale ids:** When the user dispatches a bulk action, the sidepanel snapshots `ids = [..._selection]` and sends it to the SW. The SW returns `notFound` for any ids that no longer exist (e.g., deleted by another surface between click and dispatch — `MSG_STATE_CHANGED` arrives async). The sidepanel silently removes `notFound` ids from `_selection` — no toast, no error. This satisfies AC #5 ("Selection IDs that no longer exist are silently pruned when the selection is used"). Partial failures on the remaining valid ids (e.g., rejected demote calls in bulk Remove) are surfaced via toast with a failure count (R4 H-5 fix).

**Click vs. double-click disambiguation:** In selection mode, plain click defers its toggle by ~200ms via `setTimeout` so a follow-up `dblclick` can cancel the toggle and navigate instead (R4 H-6 fix). Shift+Click never navigates (always starts/extends a selection), even on double-click.

### 25.7 Storage Schema — No Changes

| Aspect | Status |
|---|---|
| New partitions | None |
| New fields on persisted shapes | None |
| Schema version bump | None — `KNOWN_VERSION` remains at `1` |
| Migration | N/A |

`bulkDeleteItems` and `bulkUpdateItems` read from and write to the **existing** `PARTITION_ITEMS` (and in the update case, read from `PARTITION_GROUPS` for `assertGroupExists`). Both are wrapped in a single `writeTransaction` — atomic and safe under the existing write-boundary guarantees. Selection state is never written to storage.

### 25.8 Manifest Permissions — No Changes

No new `manifest.json` permissions. The bulk handlers reuse existing `storage` for persistence and existing `tabs` for the `chrome.tabs.remove` path in `MSG_CLOSE_TABS` (unchanged from B-020).

### 25.9 Sibling Items — B-026 & B-049 (Sprint 12)

#### B-026 — Item context menu (Fast Track S)

Right-click on an item row opens a contextual menu with: Navigate, Edit, Move to group, Close tab (visible only for live items), Delete. The menu is pure sidepanel UI.

- **No new message contracts.** Actions dispatch existing messages: `MSG_NAVIGATE_TO_ITEM`, `MSG_UPDATE_ITEM` (via the edit dialog), `MSG_BULK_UPDATE_ITEMS` (for the move picker — even for a single item), `MSG_CLOSE_TABS` (for close tab), `MSG_DELETE_ITEM`.
- **Consumes the new `liveStates[itemId].tabId` field** introduced in §25.5 — the "Close tab" action reads `tabId` from `_cachedLiveStates` after the async work completes (R4 H-1 fix: re-derive liveness **after** the await so a mid-flight broadcast cannot invalidate it).
- **`_cachedGroups` fast-path:** All three "move-to-group" sites (context menu, bulk-move picker, edit dialog) read from the already-maintained in-memory `_cachedGroups` instead of firing a redundant `MSG_LIST_GROUPS` per open (R4 H-2 fix).
- **Viewport clamping + cross-window close:** Menu position is clamped to the viewport; `closeContextMenu()` is called inside the `MSG_STATE_CHANGED` broadcast branch so a concurrent data refresh cannot leave a menu hovering over a replaced row (R4 M-1).

#### B-049 — Empty states & error feedback (Fast Track S)

Pure-UI sidepanel additions:

- Three empty-state variants: empty list (icon + message + "Add your first bookmark" CTA), empty filter ("No results for '<query>'" + "Clear filter" CTA), empty group (per-group inline message).
- Toast system: 4s auto-dismiss, dismissible, single-toast queue, `role="alert"` + `aria-live="assertive"`. Triggered from caller sites (e.g., bulk-remove partial failure in §25.6).

**No contract changes**, no storage changes, no manifest changes.

### 25.10 UAT-Discovered Defects (Fixed In-Pipeline)

Two latent bugs surfaced during interactive UAT and were fixed before sprint close. Full details in `docs/SPRINT_FINDINGS.md` ("UAT-Discovered Defects" section). Briefly:

| # | File | Summary |
|---|------|---------|
| UAT-D1 | `sidepanel/sidepanel.js:1162–1166` | Confirm dialog stayed open after Delete click — pre-existing latent bug in the generic `_pendingConfirmCallback` handler (affected single-item delete too). Fixed by closing the dialog **before** invoking the captured callback. |
| UAT-D2 | `sidepanel/sidepanel.js:1169` + `sidepanel/sidepanel.html:85` | Filter-empty "Clear filter" button also opened the Add Bookmark dialog because both CTAs shared the `.empty-state-cta` class and the generic document handler matched both. Fixed by narrowing the selector to `.empty-state-cta:not(#filter-empty-clear-btn)`. |

Both fixes verified against the full test suite (427/427 passing) and re-tested manually.

### 25.11 Rollback Plan

**No data migration. No storage schema bump. No new manifest permissions.** Rollback is a straightforward git revert of the Sprint 12 commits:

- Reverting the `background/storage/items.js` additions (`bulkDeleteItems`, `bulkUpdateItems`) removes the two handlers from the dispatcher. Any in-flight `MSG_BULK_DELETE_ITEMS` / `MSG_BULK_UPDATE_ITEMS` request from a stale sidepanel would then fall through to `ERR_VALIDATION` in the `default` branch of `dispatch()` — benign.
- Reverting the `background/tabs/tab-claims.js` one-line addition (`tabId` on live states) simply returns to the pre-B-024 shape; the sidepanel's fallback `_cachedLiveStates[itemId]?.tabId` reads become `undefined`, which the bulk-close UI already treats as "not a live item" (disabled button, not an error).
- No storage cleanup needed. Bulk ops are additive; removing them does not corrupt or leave orphaned data behind. Any items already bulk-deleted or bulk-moved remain in their post-operation state, which is indistinguishable from the equivalent sequence of single-item `MSG_DELETE_ITEM` / `MSG_UPDATE_ITEM` calls.

### 25.12 Flagged for Future Hardening

Deferred from R4 (see `docs/SPRINT_FINDINGS.md` Sprint 12 B-024 MEDIUM entries):

| # | Finding | File | Disposition |
|---|---------|------|------|
| M-1 | `MSG_CLOSE_TABS` accepts `NaN`, `Infinity`, `0`, floats — `typeof === 'number'` is too loose. | `background/messages/storage-handlers.js:310–314` | Deferred — tighten to `Number.isInteger(id) && id > 0`. |
| M-2 | `MSG_CLOSE_TABS` has no `MAX_BULK_INPUTS` cap (unlike the three bulk storage handlers). | `background/messages/storage-handlers.js:305–342` | Deferred — import `MAX_BULK_INPUTS` and reject oversized `tabIds`. |
| B-026 M-2 | `MSG_CLOSE_TABS` validates `tabId` against `getLiveTabIndex()` (all browser tabs) rather than `getClaimsMirror()` (junkie-claimed tabs). Stale `tabId` after Chrome reassignment could theoretically close an unrelated tab. | `background/messages/storage-handlers.js:317–326`, `tab-claims.js:227` | Deferred — require `tabId` to be present in the claims mirror before `chrome.tabs.remove`. |

These are all low-impact hardening items on the existing `MSG_CLOSE_TABS` handler (not on the newly-added bulk handlers). Tracking in BACKLOG for a future sprint.

### 25.13 R2 Correctness Checklist (Post-Build Verification)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C-1 | Storage schema versioned | N/A | No schema change. Bulk ops read/write the existing `PARTITION_ITEMS` (and read `PARTITION_GROUPS` for `assertGroupExists`). No migration. |
| C-2 | Message contracts typed | PASS | `MSG_BULK_DELETE_ITEMS`, `MSG_BULK_UPDATE_ITEMS` each have documented request payload, success `data`, error codes, and partial-success envelope (see §25.2). Both enforce payload validation before any storage write and throw `StorageError(ERR_VALIDATION)` on shape failures. |
| C-3 | Service worker cold-start safe | PASS | Bulk handlers re-hydrate state via existing partition reads inside `writeTransaction`; no in-memory caching of items/groups at handler level. Handlers are gated on `readyPromise` by `registerStorageHandlers`. Safe-mode write gate covers both new message types (added to the `writeTypes` Set). |
| C-4 | ID stability | PASS | Both bulk ops operate on stable item ids (`string`); ids are compared via `Set` membership in-tx. No positional-index dependency. `MSG_CLOSE_TABS` continues to use numeric `tabId` keyed against `LiveTabIndex` — stability expectations inherited from B-020. |
| C-5 | Manifest file references resolvable | N/A | No manifest changes. |

---

## 26. B-055 — Open Tabs Section (R2 Design)

### 26.1 Overview

B-055 introduces a pinned "Open Tabs" section at the bottom of the sidepanel scroll area that surfaces every live browser tab NOT already represented as a saved item or a floating-group member. The section is ephemeral: it carries no persisted state and introduces no new storage partitions, no new message constants, and no new manifest permissions. The enriched `MSG_LIST_ITEMS` response is extended with one new array field (`openTabs`); everything else reuses infrastructure shipped in B-050 (broadcast), B-024 (multi-select + bulk bar), B-010 (`LiveTabIndex`), and B-018 (floating-group re-association).

The goal of this section is to bind every architectural decision before R3 so the [frontend-engineer] can build without replaying shape debates. Out-of-scope exclusions (user reordering, cross-window drag, bulk "Save all open tabs", "Open in new window" context action, group-picker modal full implementation) are enumerated in AC17 and repeated in §26.9.

### 26.2 Message Contract — Extend `MSG_LIST_ITEMS`

#### Decision: extend, do not introduce a new message

AC2 locks this in: `MSG_LIST_ITEMS` already does a single-round-trip fetch of `{items, liveStates, driftRecords}` at sidepanel open. Adding a fourth field `openTabs` keeps first-paint latency flat (no second IPC, no second `await`), matches the existing "fetch once, render once" pattern in `renderAll()`, and avoids adding a new message constant that every future surface would have to know about.

A separate `MSG_LIST_OPEN_TABS` was considered and rejected: it would force the sidepanel to sequence two messages (or parallelise them and then join), introduce a second cold-start race window, and add a constant to `shared/messages.js` that only one surface consumes.

#### Before/after shape

**Before (current, post-B-024):**
```js
// MSG_LIST_ITEMS response data
{
  items: Item[],
  liveStates: Record<itemId, {
    live: boolean,
    active: boolean,
    audible: boolean,
    favIconUrl: string | null,
    tabId?: number,     // present only when live (B-024)
  }>,
  driftRecords: Record<itemId, DriftRecord>,
}
```

**After (B-055):**
```js
// MSG_LIST_ITEMS response data
{
  items: Item[],
  liveStates: Record<itemId, { ... }>,   // unchanged
  driftRecords: Record<itemId, DriftRecord>,  // unchanged
  openTabs: OpenTab[],   // NEW — empty array [] when none qualify, never null/undefined
}

// New shape
/**
 * @typedef {Object} OpenTab
 * @property {number} tabId         Browser-assigned tab id (ephemeral, NOT stable across browser restart)
 * @property {number} windowId      Browser-assigned window id (ephemeral)
 * @property {string} title         Tab title, untrusted — must be rendered with textContent
 * @property {string} url           Tab URL, untrusted — see §26.4 for scheme policy
 * @property {string | null} favIconUrl  Tab favicon URL or null if none (letter-avatar fallback in UI)
 * @property {boolean} audible      Audio indicator
 * @property {boolean} active       True if this is the focused tab in its window
 * @property {number} tabIndex      Position in the window's tab strip (used for sort — AC9)
 */
```

#### `lastAccessedAt` decision — EXCLUDED

`chrome.tabs.Tab.lastAccessed` exists in recent Chromium versions and would support a future "Recently Active" sort mode. It is deliberately **excluded** from the `OpenTab` shape for B-055 because:

1. AC9 defines sort order as `(windowId asc, tabIndex asc)` — no field in `OpenTab` is needed for any other sort today.
2. AC17 explicitly marks user-defined reordering and alternative sorts as out of scope.
3. Adding a field "just in case" violates YAGNI and widens the surface area the [security-reviewer] has to audit.

If a future item introduces a recency sort, it will add the field then (additive, non-breaking change to the response shape — no schema bump because `OpenTab` is not persisted).

#### `shared/messages.js` typedef changes

Update the existing `ListItemsResponse` typedef and add an `OpenTab` typedef. The string constant `MSG_LIST_ITEMS = 'tj/listItems'` is **unchanged**. No new `MSG_*` constant is introduced (AC3).

```js
/**
 * @typedef {Object} OpenTab
 * @property {number} tabId
 * @property {number} windowId
 * @property {string} title
 * @property {string} url
 * @property {string | null} favIconUrl
 * @property {boolean} audible
 * @property {boolean} active
 * @property {number} tabIndex
 */

/**
 * @typedef {Object} ListItemsResponse
 * @property {Array<Object>} items
 * @property {Record<string, {live: boolean, active: boolean, audible: boolean, favIconUrl: string|null, tabId?: number}>} liveStates
 * @property {Record<string, Object>} driftRecords
 * @property {OpenTab[]} openTabs
 *   Live browser tabs NOT claimed by any saved item AND NOT claimed by any
 *   resolved floating-group record. Empty array `[]` when none qualify (never null/undefined).
 *   The array is recomputed on every `MSG_LIST_ITEMS` call; receivers must treat
 *   `tabId` and `windowId` as ephemeral (not stable across browser restart).
 */
```

### 26.3 Derivation Logic — Service Worker Side

#### Location: `MSG_LIST_ITEMS` handler in `background/messages/storage-handlers.js`

The `openTabs` array is built inside the existing `case MSG_LIST_ITEMS` branch of `dispatch()`, AFTER `items`, `liveStates`, and `driftRecords` are assembled. It is a pure synchronous computation over three existing in-memory structures:

1. `getLiveTabIndex()` — the authoritative map of all currently open tabs (populated by B-010, kept current by `tab-events.js`).
2. `getClaimsMirror()` — the item→tab mapping (populated by B-001c, updated on every claim/release).
3. `readPartition(PARTITION_FLOATING_GROUPS)` — unresolved floating-group records on disk (B-018 / B-002). Only records with a resolved `claimedTabId` exclude tabs; unresolved records do not — they have no live tab to exclude.

#### Exclusion predicate (AC1)

A live tab `t` qualifies as "open tab" iff **all three** conditions hold:

```
(a) t.tabId ∈ liveTabIndex                           — trivially true by iteration source
(b) t.tabId ∉ Object.values(claimsMirror)            — not claimed by any saved item
(c) t.tabId ∉ resolvedFloatingGroupTabIds             — not already rendered inside a group section as a live floating member
```

#### Pseudocode

```js
// Inside case MSG_LIST_ITEMS, after existing items/liveStates/driftRecords assembly:
const openTabs = buildOpenTabs();

return { items, liveStates, driftRecords, openTabs };

// ---- helper (can live in a new background/tabs/open-tabs.js or inline) ----
function buildOpenTabs() {
  // H3 cold-start: if claims have not been reconciled yet, return [] rather
  // than throw or return a misleading snapshot. See §26.7 C-3.
  if (!isClaimsReady()) return [];

  const index = getLiveTabIndex();
  const claimedTabIds = new Set(Object.values(getClaimsMirror()));

  // Floating-group exclusion: a floating-group record with a resolved tab
  // would have already been upgraded into a real claim by reassociateFloatingGroups
  // during cold start (see §10.8 / §24). At this point, every floating-group
  // tab IS in claimsMirror. Therefore claimsMirror alone is a sufficient
  // exclusion set; we do NOT need a second pass over tj:floatingGroups at read time.
  //
  // Rationale: reassociateFloatingGroups -> claimTabForItem writes the tabId into
  // the mirror BEFORE pruneResolvedFloatingGroups removes the record. Unresolved
  // floating-group records (no live tab matched) exclude nothing because there
  // is no tab to exclude.

  const tabs = [];
  for (const [tabId, entry] of index) {
    if (claimedTabIds.has(tabId)) continue;
    tabs.push({
      tabId,
      windowId: entry.windowId,
      title: entry.title || '',        // see §26.3 LiveTabIndex shape note below
      url: entry.url || '',
      favIconUrl: entry.favIconUrl || null,
      audible: !!entry.audible,
      active: !!entry.active,
      tabIndex: typeof entry.index === 'number' ? entry.index : 0,
    });
  }

  // AC9 sort: windowId asc, tabIndex asc (deterministic, stable)
  tabs.sort((a, b) => {
    if (a.windowId !== b.windowId) return a.windowId - b.windowId;
    return a.tabIndex - b.tabIndex;
  });

  return tabs;
}
```

#### LiveTabIndex shape note — `title` field

The current `LiveTabIndex` entry shape (see `background/tabs/live-tab-index.js`) is:
```
{ url, windowId, active, audible, index, favIconUrl }
```
It does **not** include `title`. B-055 requires `title` for row rendering (AC5). Architectural choice:

- **Add `title` to the `LiveTabIndex` entry shape** — populated in `buildLiveTabIndex()` from `tab.title`, updated in `tab-events.js onUpdated` when `changeInfo.title` changes.
- Emit a `liveState` scope broadcast on `changeInfo.title` mutations (the B-050 broadcast path already handles `tab.onUpdated`; adding `title` to the dispatch is a widening, not a new contract).

This is a one-field widening, not a contract change. It keeps `buildOpenTabs()` fully synchronous and avoids `await chrome.tabs.get(tabId)` per-tab lookups (which would blow the 200ms first-paint budget on 50 open tabs — AC16).

**Fallback:** if an entry's `title` is empty string, the UI uses the first character of the URL's hostname for the letter-avatar (AC5 row rendering), matching how saved items fall back today.

#### Purity and memoization

`buildOpenTabs()` is pure over its three inputs and cheap (O(n) over `LiveTabIndex` where n is the total live-tab count, typically ≤ 200 in realistic sessions). No memoization is needed at the SW layer — it runs at most once per `MSG_LIST_ITEMS` call, and sidepanel calls this on cold-open + on broadcast-driven refetch (§26.5). Memoizing would be premature; the 50-row AC16 benchmark budget is the guard.

#### Cold-start / pre-`isClaimsReady()` behaviour

Before `reconcileClaims()` completes on SW cold start, `claimsMirror` is empty. If `MSG_LIST_ITEMS` runs in that window it would currently return *every* live tab in `openTabs` because no tab appears claimed. That is wrong — the sidepanel would momentarily show every saved bookmark ALSO in the Open Tabs section.

**Decision: short-circuit `openTabs = []` when `!isClaimsReady()`.** This matches the existing `buildLiveStates()` behaviour which returns `{live: false, ...}` defaults in the same window (see `tab-claims.js:207-214`). A follow-up `MSG_STATE_CHANGED` broadcast fires after `reconcileClaims()` completes (via the `liveState` scope in B-050), at which point the sidepanel refetches and gets the real `openTabs` array. The brief empty state is acceptable — far better than leaking saved items into the section.

#### Non-http(s) schemes — INCLUDE

Tabs with URLs like `chrome://`, `edge://`, `about:`, `file://`, `chrome-extension://` are included in `openTabs`. Rationale:

- They are real live tabs in the user's browser. Hiding them would make the section's row count disagree with what the user sees in their tab strip — confusing.
- They already exist in `LiveTabIndex` (no filter has ever been applied there).
- The "Save to group…" context action (AC7) maps to `MSG_PROMOTE_TAB`, which **already** rejects restricted schemes via `ERR_VALIDATION` (see `storage-handlers.js:175-183`). So a user can see a `chrome://` tab in the list and click Close, but "Save to group" will surface an inline error — acceptable UX, already modelled by the existing handler.
- AC1 exclusion predicate does not mention URL scheme.

### 26.4 Rendering Architecture — Sidepanel Side

#### Section placement and lifecycle (AC4, AC10)

A new `<section id="open-tabs-section">` is appended to `itemListEl` as the **last child** — after all named root groups AND after the Ungrouped section. The section header reads "Open Tabs" with a live count badge (`Open Tabs · N`). The section is **always mounted**, even when `openTabs.length === 0` — in that case it renders an inline empty-state block matching B-049's pattern ("No untracked tabs — all open tabs are saved or grouped").

```
itemListEl
  ├─ group-section (named group A)
  ├─ group-section (named group B)
  ├─ group-section (Ungrouped — when any ungrouped saved items exist)
  └─ open-tabs-section       ← new, always present
       ├─ header ("Open Tabs · 3" or "Open Tabs")
       ├─ <ul role="list">
       │    ├─ li[data-live-only="true"][data-tab-id="..."] × N  (when N > 0)
       │    └─ ...
       └─ empty-state block (shown only when N === 0)
```

The section is inserted inside `renderAll()` after the existing Ungrouped append. `buildGroupSection()` is NOT reused — Open Tabs rows have different data attributes, different click behaviour, and different context-menu actions, so a parallel `buildOpenTabsSection(openTabs)` helper is cleaner than overloading the saved-item path with conditionals.

#### Row attribute strategy — `data-tab-id` vs `data-item-id`

Saved-item rows use `data-item-id="<uuid>"` and are addressed by that attribute throughout the sidepanel (selection, filter, drag, context menu, live-state patching). Open-tab rows have **no saved item** — they cannot reuse `data-item-id`.

**Decision:** open-tab rows use `data-tab-id="<number>"` AND `data-live-only="true"`. Saved-item rows never carry `data-live-only`. Every row-addressing selector that is Open-Tabs-aware uses:

```js
// Query saved items only
itemListEl.querySelectorAll('[data-item-id]:not([data-live-only])')
// Query open tabs only
itemListEl.querySelectorAll('[data-tab-id][data-live-only]')
// Query ALL rows (filter, multi-select traversal)
itemListEl.querySelectorAll('[data-item-id], [data-tab-id]')
```

This keeps existing saved-item queries unchanged (they already use `[data-item-id]`) and introduces a single parallel selector family for Open Tabs.

#### Cache strategy — parallel `_cachedOpenTabs` array

`_cachedLiveStates` is keyed by `itemId` — Open Tabs have no `itemId`, so they cannot fit. Two options considered:

1. **Store open tabs inside `_cachedLiveStates` under synthetic keys** (e.g., `tab:42`) — rejected. Every consumer of `_cachedLiveStates` (`_updateBulkBar`, `refetchAndPatchLiveState`, context menu gating in `sidepanel.js:1611` / `:1749` / `:1832`) would have to learn to split synthetic vs real keys. High blast radius for ugly prefix checks.
2. **Parallel cache: `let _cachedOpenTabs = [];`** — accepted. Open Tabs are a self-contained feature; a dedicated cache isolates their state from the saved-item path. `refetchAndPatchLiveState` assigns both caches in the same pass (`_cachedLiveStates = resp.liveStates; _cachedOpenTabs = resp.openTabs;`). `renderAll()` calls `buildOpenTabsSection(_cachedOpenTabs)` after the Ungrouped append.

**Decision: use a parallel `_cachedOpenTabs: OpenTab[]` module-level variable.** Lower blast radius; no churn in existing live-state consumers.

#### Selection set — canonical string keys

`_selection` today is `Set<string>` holding item ids. AC12 requires it to hold a mix of item ids (strings) and tab ids (numbers). Two options:

1. **Parallel selection sets** (`_itemSelection: Set<string>`, `_openTabSelection: Set<number>`) — rejected. Every existing selection call site (`_toggleSelection`, `_rangeSelect`, `_selectAll`, `_clearSelection`, `_reapplySelection`, `_updateBulkBar`) would fork. Too much duplication.
2. **Canonical prefixed string keys: `item:<id>` or `tab:<number>`** — accepted. `_selection` remains `Set<string>` with a single type invariant. Call sites that need to dispatch actions parse the prefix:

```js
// Entry point: _toggleSelection now accepts a row element, derives the key.
function _selectionKeyForRow(row) {
  if (row.dataset.liveOnly === 'true') return 'tab:' + row.dataset.tabId;
  return 'item:' + row.dataset.itemId;
}

// Bulk actions partition the set:
function _partitionSelection() {
  const itemIds = [];
  const tabIds = [];
  for (const key of _selection) {
    if (key.startsWith('item:')) itemIds.push(key.slice(5));
    else if (key.startsWith('tab:')) tabIds.push(Number(key.slice(4)));
  }
  return { itemIds, tabIds };
}
```

**Decision: canonical `item:<id>` / `tab:<number>` prefixed keys in the single `_selection: Set<string>`.** The prefix parser `_selectionKeyForRow` / `_partitionSelection` is the only new primitive; every other call site stays sorted by string Set semantics.

Migration note: existing call sites that read `row.dataset.itemId` to write into `_selection` must be refactored to call `_selectionKeyForRow(row)`. This is a mechanical edit across ~10 sites (`_toggleSelection`, `_rangeSelect`, `_selectAll`, `_reapplySelection`, the click handler path) — documented in the handoff (§26.10).

#### Click-to-focus (AC6) — reuse `MSG_NAVIGATE_TO_ITEM` with a `tabId` variant

Two options:

1. **Introduce new `MSG_FOCUS_TAB`** — rejected. One more constant, one more handler, one more safe-mode entry, one more broadcast-scope decision, for an operation that is semantically identical to "navigate to an item that happens to already have a live tab."
2. **Extend `MSG_NAVIGATE_TO_ITEM` to accept a `{ tabId, windowId }` variant** — accepted. The handler already does `chrome.tabs.update(tabId, {active: true}) + chrome.windows.update(windowId, {focused: true})` when the item has a live claim (see `storage-handlers.js:281-287`). Factoring that path so it can be invoked without an `itemId` is a tight refactor:

```js
// storage-handlers.js :: MSG_NAVIGATE_TO_ITEM handler
case MSG_NAVIGATE_TO_ITEM: {
  // NEW: tabId-only variant (open-tab row click — no saved item involved)
  if (p.itemId === undefined && typeof p.tabId === 'number') {
    if (typeof p.windowId !== 'number') {
      throw new StorageError(ERR_VALIDATION, 'navigateToItem: windowId required with tabId');
    }
    const index = getLiveTabIndex();
    const entry = index.get(p.tabId);
    if (!entry) {
      throw new StorageError(ERR_NOT_FOUND, 'navigateToItem: tab not in live index');
    }
    await chrome.tabs.update(p.tabId, { active: true });
    await chrome.windows.update(p.windowId, { focused: true });
    // No updateItem, no lastAccessedAt bump — there is no saved item.
    return { tabId: p.tabId, opened: false };
  }

  // ... existing itemId-only branch unchanged ...
}
```

**Broadcast implication:** `MSG_NAVIGATE_TO_ITEM` is currently in `MUTATION_BROADCASTS` under `SCOPE.ITEMS` (`storage-handlers.js:96`) because the itemId path bumps `lastAccessedAt` via `updateItem`, which is a real storage mutation. The new tabId-only variant does NOT bump `lastAccessedAt` (no saved item), so it must NOT broadcast. Implementation: the dispatcher broadcasts based on `message.type` alone today; we add a conditional skip for the tabId-only variant.

```js
// In registerStorageHandlers, after dispatch returns:
const broadcastScope = MUTATION_BROADCASTS[message.type];
if (broadcastScope !== undefined) {
  // B-055: MSG_NAVIGATE_TO_ITEM tabId-only variant is a no-op on storage —
  // suppress the broadcast to avoid a spurious ITEMS scope invalidation.
  const isNavigateTabIdOnly = message.type === MSG_NAVIGATE_TO_ITEM
    && message.payload?.itemId === undefined
    && typeof message.payload?.tabId === 'number';
  if (!isNavigateTabIdOnly) {
    broadcast(broadcastScope, message.type);
  }
}
```

Typedef update in `shared/messages.js` documents both variants:
```js
/**
 * MSG_NAVIGATE_TO_ITEM request payload is one of:
 *   (a) { itemId: string }            — navigate to saved item (may open a new tab)
 *   (b) { tabId: number, windowId: number }  — focus an existing live tab (B-055)
 */
```

**Decision: extend `MSG_NAVIGATE_TO_ITEM` with a `{tabId, windowId}` variant, suppress its broadcast, update the typedef. No new constant.**

### 26.5 Broadcast Handling & Real-Time Updates

#### Broadcast sources that affect `openTabs`

Per B-050, `MSG_STATE_CHANGED` fires with:
- `scope: 'liveState'` on `tabs.onCreated`, `tabs.onUpdated`, `tabs.onActivated`, `tabs.onRemoved`, `windows.onRemoved` (source: `tab-events.js`).
- `scope: 'items'` on every item CRUD + `MSG_PROMOTE_TAB` / `MSG_DEMOTE_ITEM` (source: `storage-handlers.js` mutation broadcasts).

`openTabs` membership can change when:

| Event | Scope | Why Open Tabs changes |
|-------|-------|----------------------|
| New external tab opens | `liveState` | New row appears in section |
| Tab closes | `liveState` | Row leaves section |
| Tab URL changes | `liveState` | If a claim attaches, row leaves section; if a claim detaches, row appears |
| Tab focus changes | `liveState` | `active: true` moves to a different row |
| Saved item created from tab (promote) | `items` | Tab is now claimed → row leaves section |
| Saved item deleted (demote) | `items` | Tab is released → row appears (or stays floating-pending) |

Therefore the sidepanel's broadcast listener treats both `liveState` and `items` scopes as triggers to refresh `openTabs` (AC8).

#### Refresh path — reuse `refetchAndPatchLiveState` path, widened

Today `refetchAndPatchLiveState()` re-fetches `MSG_LIST_ITEMS` and patches live-state attributes on saved-item rows (see `sidepanel.js:1002`). For B-055 we widen its responsibility:

```js
async function refetchAndPatchLiveState() {
  const resp = await sendMessage(MSG_LIST_ITEMS);
  _cachedLiveStates = resp.liveStates || {};
  _cachedDriftRecords = resp.driftRecords || {};
  _cachedOpenTabs = resp.openTabs || [];

  // Existing saved-item patch loop — unchanged ...
  // NEW: targeted open-tabs patch
  patchOpenTabsSection(_cachedOpenTabs);
  _updateBulkBar();
}
```

The existing broadcast listener (`sidepanel.js:1451`) already dispatches `refetchAndPatchLiveState()` on `scope === 'liveState'`. For `scope === 'items'` it currently falls through to a full `renderAll()`. That is correct for our case too: a `items` broadcast means a saved item changed, which can cause **both** a `liveStates` keyset shuffle AND an `openTabs` membership change — a full `renderAll()` is the simplest response, and AC16's performance guardrail targets the `liveState` path specifically (where most churn happens).

#### `patchOpenTabsSection` — targeted DOM diff (AC8, AC16)

Full re-renders of the Open Tabs section on every `liveState` broadcast would be expensive at 50 rows. Instead, `patchOpenTabsSection(nextOpenTabs)` does a keyed diff against the existing `<li>` elements (`<li data-tab-id="...">`). Algorithm:

```
1. Build Map<tabId, <li>> from existing DOM children.
2. Build Map<tabId, OpenTab> from nextOpenTabs.
3. For each existing tabId NOT in next map: remove the <li>.
4. For each next tabId NOT in existing map: build and insert a new <li>
   at the correct (windowId, tabIndex) sort position.
5. For each tabId in both: compare fields; patch only what changed
   (title, url, favIconUrl, audible, active attributes).
6. Update the section header count badge and aria-live region.
```

No full section re-render on any single-tab event. Matches the saved-item `refetchAndPatchLiveState` pattern byte-for-byte in spirit.

#### Section empty-state transitions

When `nextOpenTabs.length === 0` after a patch, hide the `<ul>` and show the empty-state block; reverse when the first tab arrives. The section header (`open-tabs-section`) never unmounts — AC4.

### 26.6 Multi-Select Integration (AC12)

#### Row participation

Open-tab rows participate in selection gestures identically to saved-item rows once the `_selectionKeyForRow` primitive (§26.4) is in place:

| Gesture | Open-tab behaviour |
|---------|-------------------|
| Plain click (no selection mode) | Fire click-to-focus (AC6) — no selection toggle. |
| Plain click (selection mode) | Toggle `tab:<id>` in `_selection`; defer via `_pendingClickTimer` so a follow-up dblclick can cancel and focus. |
| Shift+Click | Range-select between `_rangeAnchorId` and target in DOM order. Range can span saved-item and open-tab rows (AC12 "mixed selection"). |
| Ctrl/Cmd+Click | Toggle `tab:<id>` in `_selection`; set `_rangeAnchorId` to new key. |
| Ctrl/Cmd+A | Select all visible rows (saved + open-tab) — `_selectAll` traverses `[data-item-id], [data-tab-id]` both. |
| Escape | `_clearSelection` — unchanged. |

#### Bulk action bar — valid-action intersection

When `_selection` contains any open-tab keys, the bulk bar's visible actions are the intersection of what is valid for every selected row type:

| Selection composition | Close tabs | Move to group | Remove / Delete | Demote |
|----------------------|:----------:|:-------------:|:---------------:|:------:|
| All saved items, all live | ✓ (via tabId lookup) | ✓ (`MSG_BULK_UPDATE_ITEMS`) | ✓ (`MSG_BULK_DELETE_ITEMS`) | ✓ (loop `MSG_DEMOTE_ITEM`) |
| All saved items, some non-live | ✓ (disabled unless ≥1 live) | ✓ | ✓ | ✓ |
| All open tabs | ✓ (always) | ✓ (promote-all path, see below) | — hidden — | — hidden — |
| Mixed (saved + open tabs) | ✓ (closes live saved tabs + open tabs) | ✗ — hidden — (mixed promote+update not in scope) | ✗ — hidden — | ✗ — hidden — |

**Rationale for the mixed "Move to group" hide:** a single bulk action that simultaneously promotes N open tabs (via `MSG_PROMOTE_TAB` per tab — `MSG_BULK_PROMOTE_TABS` does not exist) and updates K saved items (via `MSG_BULK_UPDATE_ITEMS`) is compound. It requires a new bulk-promote handler or sequential dispatch with partial-failure aggregation. Both are new contracts. AC12 says "the intersection of valid actions"; for the mixed case the intersection over the current message set is empty for move-to-group. Deferred to a future backlog item if user demand emerges.

#### "Move to group" for all-open-tabs selection

When every selected row is an open tab, the bulk bar shows "Move to group" (same picker UI as saved-item bulk move). On confirm the sidepanel dispatches `MSG_PROMOTE_TAB` once per selected tabId (sequentially or Promise.all), aggregates partial failures into a toast (matching the existing partial-failure pattern from B-024 §25.6). No new bulk message — `MSG_PROMOTE_TAB` already exists and is the correct primitive.

**Performance note:** at ≤ 50 selected tabs (realistic worst case) this is 50 sequential IPC calls to the SW. Each is O(1) relative to storage. Total ≤ 500ms budget at 10ms/call. Acceptable without introducing a new bulk message for this first version. If demand appears, `MSG_BULK_PROMOTE_TABS` can be added later as a pure optimisation.

#### Close tabs for mixed selection

"Close tabs" with a mixed selection closes:
- Every open-tab in the selection (directly via their `tabId`).
- Every saved-item in the selection whose `_cachedLiveStates[itemId].tabId` is defined (via the same `MSG_CLOSE_TABS` call).

`MSG_CLOSE_TABS` already accepts `{tabIds: number[]}`. The sidepanel collects both lists into one array and dispatches once. `MSG_CLOSE_TABS` does not broadcast `scope: items` (tabs.onRemoved broadcasts `scope: liveState` asynchronously — see `storage-handlers.js:340`), which correctly triggers the open-tabs section to re-fetch and the closed tabs to disappear.

### 26.7 R2 Correctness Checklist

| # | Check | Status | Reasoning |
|---|-------|--------|-----------|
| C-1 | Storage schema versioned | **N/A (PASS)** | No new partition. No new field on any persisted shape. `OpenTab` is an in-memory/wire-only shape derived at read time from `LiveTabIndex` + `claimsMirror`. `KNOWN_VERSION` unchanged. No migration. The `title` field added to `LiveTabIndex` entries is in-memory only (B-010's `LiveTabIndex` is never persisted — see §10.5 / AC4 of B-001c). |
| C-2 | Message contracts typed | **PASS** | `shared/messages.js` typedef is updated to document the new `openTabs: OpenTab[]` field and the `OpenTab` shape. The `MSG_LIST_ITEMS` string constant is unchanged (same wire identity). `MSG_NAVIGATE_TO_ITEM` typedef is widened to document both `{itemId}` and `{tabId, windowId}` variants; payload validation is explicit in the handler (throws `ERR_VALIDATION` on malformed variants). No new `MSG_*` constant introduced. |
| C-3 | Service worker cold-start safe | **PASS** | `buildOpenTabs()` short-circuits to `[]` when `!isClaimsReady()`, so cold-open cannot leak saved items into the section. A `MSG_STATE_CHANGED {scope: liveState}` broadcast fires after `reconcileClaims()` completes (existing B-050 path), prompting the sidepanel to refetch. No assumption of in-memory SW state beyond what's already guaranteed by `readyPromise` gating at the dispatcher. Handler never throws on empty index / empty mirror. |
| C-4 | ID stability | **PASS** | `tabId` and `windowId` are explicitly documented (in both the `OpenTab` typedef and §26.2) as ephemeral — not stable across browser restart. The feature never persists either value. Saved-item identity (stable uuid) flows through the saved-items path unchanged. The prefixed selection keys (`tab:<number>`) are UI-only, lifetime-bounded by the sidepanel session, and pruned by `_reapplySelection` + the partial-success silent prune in bulk actions. No durable reference to an ephemeral id leaks into storage, messages beyond the `MSG_LIST_ITEMS` response, or the broadcast payload. |
| C-5 | Manifest file references resolvable | **N/A (PASS)** | No `manifest.json` changes. No new `default_path`, no new `chrome_url_overrides` entry, no new `commands`. Existing `sidepanel.html` / `sidepanel.js` references are unaffected. |

### 26.8 Rollback Plan

No schema change, no permission change, no data migration — rollback is a straightforward `git revert` of the B-055 commits. Specifically:

- Reverting the `shared/messages.js` typedef addition has no runtime effect (typedefs are JSDoc comments).
- Reverting the `storage-handlers.js` changes (`openTabs` assembly in `MSG_LIST_ITEMS`, tabId-only branch of `MSG_NAVIGATE_TO_ITEM`, broadcast suppression for the tabId-only variant) returns the dispatcher to its Sprint 12 shape. Any in-flight `MSG_NAVIGATE_TO_ITEM` call from a stale sidepanel with `{tabId, windowId}` would fall through to the `!p.itemId` validation and return `ERR_VALIDATION` — benign.
- Reverting `background/tabs/live-tab-index.js` drops `title` from entries. Saved-item rendering is unaffected (titles come from `Item.title`).
- Reverting the `sidepanel/sidepanel.js` changes removes the Open Tabs section, `_cachedOpenTabs`, `_selectionKeyForRow` / `_partitionSelection`, and the bulk-bar action intersection logic. The sidepanel returns to its pre-B-055 shape with identical saved-items UX.
- No cleanup of `chrome.storage.local` / `chrome.storage.session` needed — nothing was written.

### 26.9 Out-of-Scope — Reconfirmed from AC17

The following are explicitly **not** in scope for B-055. Implementing any of them would be scope creep:

- User-defined reordering of rows within the section (would require persistence — deferred).
- Cross-window drag of open-tab rows.
- Bulk "Save all open tabs" single-click action.
- "Open in new window" context-menu action (deferred to B-035).
- Full group-picker modal (use simplified inline picker if B-029 has not shipped).
- `MSG_BULK_PROMOTE_TABS` bulk message (the per-tab loop via existing `MSG_PROMOTE_TAB` is acceptable at the 50-row target — see §26.6).
- Alternative sort modes (recency, alphabetical) — AC9 locks in `(windowId asc, tabIndex asc)`.

### 26.10 Flagged Risks

**None warrant a tier upgrade to Spike-First (XL).** All architectural decisions above are local refinements of existing infrastructure; no foundational primitive is being introduced or reversed. Specifically:

- No new storage partition, no new message constant, no new manifest permission — the three most common XL-escalation triggers are all absent.
- `LiveTabIndex` widening (`title` field) is a one-field additive change to an in-memory, ephemeral, never-persisted structure.
- The `_selection` prefixed-key migration is mechanical and testable in isolation.
- The `MSG_NAVIGATE_TO_ITEM` variant is a narrow refactor of an existing handler, with explicit broadcast suppression and explicit typedef documentation.

**Medium-severity risks tracked (not blockers):**

1. **Open-tab row churn during heavy browsing sessions.** A user with 200+ open tabs plus rapid navigation could generate a high rate of `MSG_STATE_CHANGED {scope: liveState}` broadcasts. The `patchOpenTabsSection` keyed diff bounds DOM work per broadcast to O(Δ) where Δ is the changed-row count; the AC16 50-row performance budget should hold. If UAT reveals jank, a debounce wrapper in `refetchAndPatchLiveState` is a simple follow-up (out of scope for B-055).
2. **Tab title updates without a `tab.onUpdated changeInfo.title` field.** In some Chromium versions, title changes may not set `changeInfo.title` (the change is inferred from `chrome.tabs.query`). The [frontend-engineer] should verify `tab-events.js onUpdated` triggers on title mutations, else add a `chrome.tabs.onUpdated` listener that polls `tab.title` on any update. Falls back gracefully: a stale title is cosmetic, not a correctness issue.
3. **Mixed-selection "Move to group" hidden** may confuse users who expect the action to be available. Empty-intersection rule is explicit in §26.6; acceptable tradeoff vs. introducing a new bulk-promote message this sprint. Documented for the [technical-writer] to call out in R7 user manual.

No SEV1/SEV2 risks identified. Proceed to R3 build.

### 26.11 Handoff Notes for [frontend-engineer]

**File touchpoints:**

- `shared/messages.js` — add `OpenTab` typedef; widen `ListItemsResponse` typedef; document `MSG_NAVIGATE_TO_ITEM` variants.
- `background/tabs/live-tab-index.js` — add `title` field to entry shape; populate from `tab.title` in `buildLiveTabIndex()` and `updateTabEntry()`.
- `background/tabs/tab-events.js` — ensure `onUpdated` propagates `changeInfo.title` into `updateTabEntry` and fires `liveState` broadcast.
- `background/messages/storage-handlers.js` — add `openTabs` to `MSG_LIST_ITEMS` response; add tabId-only branch to `MSG_NAVIGATE_TO_ITEM`; suppress its broadcast.
- (optional) `background/tabs/open-tabs.js` — new helper module hosting `buildOpenTabs()` if inline clutter argues for extraction.
- `sidepanel/sidepanel.js` — add `_cachedOpenTabs`; refactor selection to prefixed keys (`_selectionKeyForRow`, `_partitionSelection`); add `buildOpenTabsSection` and `patchOpenTabsSection`; call them from `renderAll` and `refetchAndPatchLiveState`; widen `_updateBulkBar` to compute the valid-action intersection; wire context-menu actions (Close tab → `MSG_CLOSE_TABS`, Save to group → `MSG_PROMOTE_TAB`).
- `sidepanel/sidepanel.html` — minor: ensure the list container is structured so the Open Tabs section can be appended as a sibling (the existing `itemListEl` is already compatible).
- `sidepanel/sidepanel.css` — style the `data-live-only` row, section header/count badge, empty-state block matching B-049 pattern.
- `tests/enriched-list-items.test.js` — already-modified file in working tree; extend to cover the `openTabs` field on the enriched response.

**Order of implementation suggestion (smaller first):**

1. `shared/messages.js` typedef updates (no runtime effect — cheap to commit, clear intent for reviewers).
2. `LiveTabIndex` widening with `title` — isolated; covered by existing `tabs/` tests.
3. `storage-handlers.js` — `openTabs` assembly + `MSG_NAVIGATE_TO_ITEM` variant + broadcast suppression. Unit tests first (TDD-friendly).
4. `sidepanel.js` — selection key refactor (before the section render, so the section drops cleanly into an already-generalised selection model).
5. `sidepanel.js` — `buildOpenTabsSection` + `patchOpenTabsSection` + broadcast wiring.
6. `sidepanel.js` — bulk-bar valid-action intersection + context menu.
7. CSS + empty-state polish.
8. Test coverage (unit + integration via chrome-mock) and UAT.

**Non-obvious gotchas:**

- Broadcast suppression for the `MSG_NAVIGATE_TO_ITEM` tabId-only variant is load-bearing — without it, every open-tab click fires a spurious `scope: items` broadcast, which triggers a full `renderAll()` in every open surface, defeating the AC16 performance guardrail.
- `_selection` prefixed keys must be migrated **atomically** — a partial refactor where half the call sites write bare `itemId` and the other half write `item:<id>` will produce very confusing bugs. Use a single commit for the prefix rename.
- The `_cachedOpenTabs` order is display order (sorted by `(windowId, tabIndex)`). `patchOpenTabsSection` must respect that order when inserting new rows — use the sorted array's index to find the correct insertion point rather than appending.
- `chrome.tabs.get(tabId)` is NOT called from the UI click path — `chrome.tabs.update(tabId, {active: true})` goes through `MSG_NAVIGATE_TO_ITEM`, which does the SW-side lookup in `LiveTabIndex` before the chrome API call. This keeps sender validation (`sender.id === chrome.runtime.id`) on the tab-focus path.

### 26.12 Build Outcome (R6 Close)

Sprint 13 closed 2026-04-17. B-055 shipped alongside three Fast-Track siblings (B-028, B-047, B-051). UAT PASS across all three blocks (16/16 tested, 2 AC14 safe-mode cases SKIPPED and verified by code review per §26.12.5). This subsection captures what was actually built, where the implementation deviated from §26.1–26.11, and the invariants future work must preserve. It is additive — it does NOT supersede the R2 design above; the R2 text is the contract, this text is the delivery record.

#### 26.12.1 Deviations from R2

The implementation matched the R2 design almost byte-for-byte. Two planned refactors were promoted from "noted in handoff" to "committed as load-bearing primitives," and one implementation detail was tightened during R4 remediation.

1. **Open Tabs helper extracted to a dedicated module.** §26.3 marked `background/tabs/open-tabs.js` as "optional … if inline clutter argues for extraction." The [frontend-engineer] extracted it. Rationale: `buildOpenTabs()` has three distinct inputs (`LiveTabIndex`, `claimsMirror`, `isClaimsReady`), is test-target-worthy in isolation, and is the natural counterpart to `live-tab-index.js` / `tab-claims.js`. The dispatcher in `storage-handlers.js` imports `buildOpenTabs` and calls it inside the `MSG_LIST_ITEMS` branch. The module performs no storage writes (confirmed by R4 M-7 test coverage).
2. **Safe-mode classification refactored into a `Set` + predicate.** §26.4 implied per-case decisions inside the dispatcher's safe-mode branch. R4 surfaced a correctness bug (AC14 violation — `MSG_CLOSE_TABS` and tabId-only `MSG_NAVIGATE_TO_ITEM` were blocked despite performing no storage write) and the remediation collapsed the classification into `WRITE_MESSAGE_TYPES: Set<string>` plus `isWriteType(message)` predicate (`background/messages/storage-handlers.js:109–124`). `MSG_CLOSE_TABS` is now unconditionally allowed in safe mode (pure tab operation, no storage mutation). `MSG_NAVIGATE_TO_ITEM` is write-classified **only when `message.payload?.itemId !== undefined`** (the itemId branch bumps `lastAccessedAt`). The tabId-only variant is a pure tab focus and passes through safe mode. This is the canonical mechanism — future write/read message additions edit the `Set` or extend `isWriteType`.
3. **Parallel cache mirrors added for O(1) lookups.** §26.4 settled on `_cachedOpenTabs: OpenTab[]`. The build added `_cachedOpenTabsById: Map<number, OpenTab>` beside it (`sidepanel/sidepanel.js:118–128`) to eliminate the O(n²) filter pass flagged as R4 M-1. Both caches are always assigned together via the new `_setCachedOpenTabs(next)` helper — callers MUST use the helper, direct writes to `_cachedOpenTabs` would desync the mirror. Same invariant applied to the `_setRowSelected(row, selected)` helper (`sidepanel/sidepanel.js:670–679`) which keeps `data-selected` (CSS) and `aria-selected` (assistive tech) in lock-step per AC15 / R4 M-4.

None of the above changes contract shapes. Every deviation is a refinement internal to its subsystem.

#### 26.12.2 New contracts finalized

**Wire contracts (shared/):**

- `MSG_LIST_ITEMS` response extended with `openTabs: OpenTab[]` (§26.2). Empty array `[]` — never null/undefined. The `OpenTab` typedef in `shared/messages.js` is the source of truth: `{tabId, windowId, title, url, favIconUrl|null, audible, active, tabIndex}`. `tabId` / `windowId` explicitly documented as ephemeral.
- `MSG_NAVIGATE_TO_ITEM` accepts two payload variants documented in `shared/messages.js` typedef:
  - `{itemId: string}` — navigates to a saved item, may open a new tab, bumps `lastAccessedAt`, broadcasts `SCOPE.ITEMS`, write-classified in safe mode.
  - `{tabId: number, windowId: number}` — focuses an existing live tab, zero storage writes, suppresses its broadcast, passes through safe mode. Requires both fields; missing `windowId` throws `ERR_VALIDATION`.
- `MSG_CLOSE_TABS` is now unconditionally allowed in safe mode. This was implicitly broken in v1.7.0 (AC14 regression B-055 H-1 fixed in this sprint). Callers should treat safe-mode + close-tabs as a supported path.

**Shared modules (per "Shared File Governance" in CLAUDE.md):**

- `shared/errors.js` — **canonical** home for `StorageError`, `ERR_*` constants. `background/storage/errors.js` is now a re-export shim. This flags cross-boundary (SW ⇄ sidepanel) ownership: any new `ERR_*` code must be added here, not in the background shim. R4 H-4 consolidated the last string-literal error-code comparisons in `sidepanel.js` against these constants.
- `shared/selection.js` — **new** cross-boundary module. Exports `pruneSelection(selection: Set<string>, items: Array<{id}>): Set<string>`. Pure, zero storage deps. Imported by `sidepanel/sidepanel.js` and wired into `_pruneStaleSelection()` which runs at the top of every bulk-action entry point (`_bulkRemove`, `_bulkMoveToGroup`, `_bulkClose` — `sidepanel/sidepanel.js:2078, 2175, 2204`). Only `item:*` keys are pruned; `tab:*` keys are self-cleaning via `tabs.onRemoved` → `MSG_STATE_CHANGED` re-render.
- `shared/messages.js` — `MUTATION_BROADCASTS[MSG_NAVIGATE_TO_ITEM] = SCOPE.ITEMS` unchanged; the dispatcher's post-dispatch broadcast is gated by the tabId-only suppression block (`storage-handlers.js:459–472`). The contract is: the broadcast map declares the upper bound of what a type MAY broadcast; runtime suppression narrows it on a per-payload basis.

**UI primitives (sidepanel only — flagged so future items don't re-invent):**

- `_selectionKeyForRow(row)` → `'item:<uuid>' | 'tab:<number>' | null` — every write into `_selection` goes through this.
- `_rowForSelectionKey(key)` → `HTMLElement | null` — companion for focus-restore and post-broadcast re-application.
- `_partitionSelection()` → `{itemIds: string[], tabIds: number[]}` — every bulk-action read of `_selection` goes through this.
- `_setRowSelected(row, boolean)` — every toggle of `data-selected` goes through this; pairs with `aria-selected`.
- `_setCachedOpenTabs(next)` — single writer for both `_cachedOpenTabs` and `_cachedOpenTabsById`.
- `_pruneStaleSelection()` — front door for `shared/selection.js` usage on the sidepanel side.

#### 26.12.3 Sibling integration notes

- **B-028 (Selection context menu, Fast Track S).** Right-click while multi-selection active opens a selection-aware menu with Move-to-group / Close tabs / Remove actions. Reuses B-026 menu infrastructure. The build extracted bulk-bar handlers into `_bulkMoveToGroup`, `_bulkClose`, `_bulkRemove` helpers so the bar and the context menu share a single code path. These helpers are the ones `_pruneStaleSelection` now guards. Tests in `tests/b028-selection-context-menu.test.js` (12 tests).
- **B-047 (In-panel keyboard shortcuts, Fast Track XS).** **Zero production code changes.** R3 was a verify-only audit confirming Ctrl/Cmd+A, Escape, and text-input guards already met all 3 ACs via B-024's handlers. 17 regression tests added to `tests/b024-multi-select.test.js`; 5 of those added during R4 remediation to cover the open-tab mixed-row path and dialog-open Escape guard. No architectural impact — the item is a pure test-coverage hardening.
- **B-051 (Sort-order normalisation & selection pruning, Fast Track S).** Added `normaliseGroupSortOrders(groupId, items)` in `background/storage/items.js` with an idempotent fast-path (already-sequential buckets short-circuit with zero writes). Wired into every create / bulk-create / bulk-update / delete path (`items.js:201, 277, 389, 534, 536`). Also introduced `shared/selection.js :: pruneSelection` and the sidepanel wiring described in §26.12.2. The B-055 M-4 wiring satisfies AC3.

#### 26.12.4 Safe-mode classification contract (post-R4)

The R4 remediation produced a crisp, testable invariant: **a message type is write-classified iff it performs a `chrome.storage.*` mutation.** Pure tab operations (`MSG_CLOSE_TABS`, tabId-only `MSG_NAVIGATE_TO_ITEM`) are NOT write-classified. Read operations (`MSG_LIST_*`, `MSG_GET_*`, `MSG_GET_PREFERENCES`) are not write-classified.

The mechanism:

```js
// background/messages/storage-handlers.js:109–124
const WRITE_MESSAGE_TYPES = new Set([
  MSG_CREATE_ITEM, MSG_UPDATE_ITEM, MSG_DELETE_ITEM,
  MSG_BULK_CREATE_ITEMS, MSG_BULK_DELETE_ITEMS, MSG_BULK_UPDATE_ITEMS,
  MSG_CREATE_GROUP, MSG_UPDATE_GROUP, MSG_DELETE_GROUP,
  MSG_SET_PREFERENCES, MSG_PROMOTE_TAB, MSG_DEMOTE_ITEM,
]);

function isWriteType(message) {
  if (WRITE_MESSAGE_TYPES.has(message.type)) return true;
  if (message.type === MSG_NAVIGATE_TO_ITEM) {
    return message.payload?.itemId !== undefined;
  }
  return false;
}
```

Rules for future additions:

1. A new pure-storage-write message type → add the constant to `WRITE_MESSAGE_TYPES`.
2. A new pure-tab-op or read message type → do NOT add it. No change.
3. A new dual-variant message (payload-shape-dependent classification) → add a branch to `isWriteType()` mirroring the `MSG_NAVIGATE_TO_ITEM` pattern. The predicate must be payload-aware but side-effect-free.

This pairs with the broadcast-suppression clause at `storage-handlers.js:459–472`: the dispatcher broadcasts `MUTATION_BROADCASTS[message.type]` unless the payload shape marks the call as a no-op on storage. The two mechanisms (safe-mode gate, broadcast suppression) share the same "which variant is this?" logic.

#### 26.12.5 R2 Correctness Checklist revisited (post-build verification)

Same grid as §26.7, re-verified after R3/R4/R5:

| # | Check | Post-build status | Evidence |
|---|-------|------------------|----------|
| C-1 | Storage schema versioned | **PASS (N/A)** — no persistence. | `buildOpenTabs()` is derived in-memory from `LiveTabIndex` + `claimsMirror`. No new partition, no `KNOWN_VERSION` bump, no migration. The R4 M-7 test in `tests/enriched-list-items.test.js` spies on `chrome.storage.local.set` during open-tabs rendering and asserts zero writes. |
| C-2 | Message contracts typed | **PASS** | `shared/messages.js` `ListItemsResponse` typedef includes `openTabs: OpenTab[]`. `MSG_NAVIGATE_TO_ITEM` typedef documents both variants. Payload validation is explicit at the handler boundary (`ERR_VALIDATION` on malformed variants). No new `MSG_*` string constants introduced. |
| C-3 | Service worker cold-start safe | **PASS** | `buildOpenTabs()` short-circuits to `[]` when `!isClaimsReady()` (`background/tabs/open-tabs.js:34`). `MSG_LIST_ITEMS` dispatch awaits `readyPromise` before calling. The existing `liveState` broadcast path re-triggers sidepanel refetch after `reconcileClaims()` completes. Tests for the cold-start branch in `tests/enriched-list-items.test.js`. |
| C-4 | ID stability | **PASS** | `tabId` / `windowId` documented as ephemeral in both the `OpenTab` typedef and §26.2. Nothing persists them. `tab:*` selection keys are UI-lifetime-bounded and never written to storage. `_pruneStaleSelection` keeps `item:*` keys in sync with live saved-item ids on every bulk-action entry. No durable reference to an ephemeral id leaks into storage, message payloads beyond the wire `MSG_LIST_ITEMS` response, or broadcast metadata. |
| C-5 | Manifest file references resolvable | **PASS (N/A)** — no `manifest.json` changes. | No new `default_path`, no new `chrome_url_overrides`, no new `commands`, no new permissions. Existing `sidepanel.html` / `sidepanel.js` entries unaffected. |

All five checks pass. No regressions against R2.

#### 26.12.6 UAT outcomes and follow-ups

UAT executed by [test-engineer] in R5. Results recorded in `docs/SPRINT.md` Sprint 13 "Completed This Sprint" section:

- **B-055**: PASS (16/16 tested, 2 AC14 safe-mode cases SKIPPED — require manual storage corruption to reproduce, code path verified by review).
- **B-028, B-047, B-051**: all implicit-verified inside B-055 UAT blocks (Block 3 step 16 for B-028, Block 3 keyboard interactions for B-047, Block 2 step 9 promote flow for B-051).

Interactive UAT surfaced two product-design questions that were promoted to new backlog items (both scheduled for Sprint 14):

- **B-056 — Visually distinguish unsavable tabs.** Tabs with restricted URL schemes (`chrome://`, `about:`, `chrome-extension://`, `file:`) and tabs with URLs that duplicate an existing saved item are currently indistinguishable from savable tabs in the Open Tabs section. The "Save to group" action fails at dispatch time with `ERR_VALIDATION` / `ERR_DUPLICATE_URL` — fine, but UX-discoverability is poor. B-056 adds inline visual affordances (dim, badge, or disabled "Save" affordance).
- **B-057 — SPIKE: URL-scheme allowlist + duplicate-URL policy review.** Current allowlist is implicit (`promoteTab` rejects a hard-coded scheme list). The spike will audit every promote/save path, define the canonical allowlist in one place, and evaluate whether duplicate-URL detection should prompt "switch to existing saved copy" instead of rejecting.

Mid-UAT defect fix (in-sprint, not deferred): the `_bulkMoveToGroup` toast for all-open-tabs selection was too vague ("Couldn't save N tabs — check URL scheme or duplicates"). Replaced with a categorised toast that counts `ERR_DUPLICATE_URL` vs `ERR_VALIDATION` vs other failures — matching the single-tab context-menu path's per-error messaging (`sidepanel/sidepanel.js:2220–2235`). This pattern should be the template for any future bulk action that fans out via `Promise.allSettled`.

#### 26.12.7 Rollback plan

**No schema change, no new permissions, no persisted state — rollback is a clean `git revert` of the Sprint 13 commit(s).**

Specifically:

- Reverting `shared/messages.js` typedef additions has no runtime effect.
- Reverting `background/messages/storage-handlers.js` drops `openTabs` assembly, the tabId-only `MSG_NAVIGATE_TO_ITEM` branch, the broadcast-suppression clause, and the `WRITE_MESSAGE_TYPES` Set / `isWriteType` predicate. Safe-mode gate reverts to its prior per-case logic. Any in-flight stale sidepanel call with the new payload shape falls through to `ERR_VALIDATION` — benign.
- Reverting `background/tabs/live-tab-index.js` removes the `title` field. Saved-item rendering unaffected (titles come from `Item.title`). Open Tabs rows disappear with the sidepanel revert.
- Reverting `background/tabs/open-tabs.js` deletes the module. Reverting the two new `tab/created` and `tab/title-changed` broadcasts in `tab-events.js` returns live-state broadcast to its Sprint 12 shape.
- Reverting `sidepanel/sidepanel.js` removes the Open Tabs section, `_cachedOpenTabs*`, prefixed selection keys, bulk-bar action intersection logic, `_pruneStaleSelection` wiring, and the `shared/errors.js` / `shared/selection.js` imports. Sidepanel returns to Sprint 12 saved-items-only UX.
- Deleting `shared/selection.js` is safe — it is imported only by the sidepanel, which reverts in lockstep.
- `shared/errors.js` cannot be deleted (existing SW imports depend on the re-export shim in `background/storage/errors.js`). Roll it back to its Sprint 12 content; the sidepanel imports vanish with the sidepanel revert.

**No `chrome.storage.local` / `chrome.storage.session` cleanup required** — nothing was ever written. No migration is needed and no user-visible data loss can occur on rollback.

#### 26.12.8 Files changed (reference)

Complete list (also recorded in `docs/SPRINT.md`):

- `shared/messages.js` — `OpenTab` typedef, `ListItemsResponse` widened, `MSG_NAVIGATE_TO_ITEM` variant documentation.
- `shared/errors.js` — now canonical; exports `ERR_SAFE_MODE`, `ERR_DUPLICATE_URL` consumed by sidepanel.
- `shared/selection.js` *(new)* — `pruneSelection` helper.
- `background/tabs/open-tabs.js` *(new)* — `buildOpenTabs` helper.
- `background/tabs/live-tab-index.js` — `title` field added to entry shape, `buildLiveTabIndex` / `updateTabEntry` populate it.
- `background/tabs/tab-events.js` — `changeInfo.title` propagation, `tab/created` + `tab/title-changed` live-state broadcasts with co-event suppression to prevent double-patch.
- `background/messages/storage-handlers.js` — `openTabs` in `MSG_LIST_ITEMS` response, tabId-only `MSG_NAVIGATE_TO_ITEM` branch (with try/catch per R4 M-3), `WRITE_MESSAGE_TYPES` Set + `isWriteType`, broadcast suppression for tabId-only navigate.
- `background/storage/items.js` — `normaliseGroupSortOrders` helper and wiring (B-051).
- `sidepanel/sidepanel.js` — all B-055 / B-028 / B-051 sidepanel changes (see §26.12.2 primitive list).
- `sidepanel/sidepanel.css` — Open Tabs section styles, `data-live-only` row styling.
- `tests/` — `enriched-list-items.test.js`, `live-tab-index.test.js`, `b010-live-state.test.js`, `b024-multi-select.test.js`, `navigate-to-item.test.js` (extended); `b028-selection-context-menu.test.js`, `b051-normalisation.test.js`, `b005-bulk-create.test.js` (new/updated).

## 27. B-057 — URL-scheme and Duplicate-URL Policy (R0 Spike Pointer)

Sprint 14 R0 discovery spike B-057 reviewed Tab Junkie's URL-scheme allowlist (`shared/url.js` `ALLOWED_URL_SCHEMES`) and its `ERR_DUPLICATE_URL` reject in `MSG_PROMOTE_TAB`, and produced two decision memos recommending (a) relaxing the scheme allowlist to admit `chrome://`, `edge://`, `chrome-extension://`, `about:`, and `view-source:` while keeping the hard rejects for `javascript:` and `data:`, and (b) removing the storage-layer duplicate-URL reject in favour of a soft UI warning (PRD §3.3 already contemplates duplicate-URL items, and B-018 disambiguation already handles the case). Full memos, impact map across B-016/B-017/B-018/B-022/B-042/B-043/B-044/B-045/B-055/B-056, and four follow-on item recommendations (B-058, B-059, B-060, B-061) live in `docs/spikes/B-057-url-policy-spike.md`. Implementation is deferred — this spike produced no code changes. When the follow-ons land, their R6 close sections will update this §27 pointer with as-built deltas.

## 28. B-014 — Multi-Window Awareness & Window Badge (R2 Design)

### 28.1 Overview

B-014 introduces session-scoped human-readable window ordinals (W1, W2, W3…) for the ephemeral `chrome.windows.Window.id` integers, a cross-window badge on every saved-item and open-tab row whose live tab is in a different window than the sidepanel's own window, and a window filter row that only appears when two or more browser windows are currently open. B-014 **absorbs** B-034 (window filter row — previously an icebox item). The ordinal map is purely in-memory; **no storage schema changes, no new `manifest.json` permissions, no migrations**. One new broadcast scope (`SCOPE.WINDOW_MAP`) is added. One `MSG_LIST_ITEMS` response field is added (`windowMap`). One `liveStates[itemId]` field is widened (`windowId`).

The feature rests on four existing primitives shipped in prior sprints:
- `LiveTabIndex` (B-010, B-055) — every tab entry already carries `windowId`.
- `getClaimsMirror()` (B-001c) — maps `itemId → tabId`, joined with `LiveTabIndex` to resolve a saved item's live `windowId`.
- Broadcast fan-out (B-050) — `SCOPE.LIVE_STATE`, `SCOPE.ITEMS`, `SCOPE.GROUPS`, `SCOPE.PREFERENCES`. B-014 adds `SCOPE.WINDOW_MAP`.
- Open Tabs section (B-055) — `buildOpenTabRow` already sets `row.dataset.windowId` and renders a raw `W${windowId}` badge via `_createWindowBadge`; B-014 replaces the raw integer with the ordinal lookup and extends the same badge to saved-item rows.

R2 locks every architectural decision before R3 so the [frontend-engineer] can build without re-opening shape debates. Out-of-scope exclusions (AC18) are reconfirmed in §28.11.

### 28.2 Window Ordinal Map — Module & Lifecycle

#### 28.2.1 New module: `background/tabs/window-ordinals.js`

**Decision: extract into a dedicated module rather than fold into `live-tab-index.js`.**

Rationale:
1. `live-tab-index.js` is keyed by `tabId` (per-tab entries). The ordinal map is keyed by `windowId` (per-window entries). Mixing two distinct key spaces in one module muddies the single-responsibility boundary that `live-tab-index.js` / `tab-claims.js` / `open-tabs.js` / `floating-groups.js` have maintained since B-001c.
2. The ordinal map has its own event surface (`chrome.windows.onCreated`, `chrome.windows.onRemoved`) that `live-tab-index.js` does not currently subscribe to. `tab-events.js` already owns `windows.onRemoved`; adding the ordinal bookkeeping as a thin set of exports keeps `tab-events.js` as the event-router and `window-ordinals.js` as the state-owner.
3. Testability: the ordinal allocator is a pure function of the event sequence, ideal for unit tests against the chrome-mock. Extracting it makes the tests single-purpose and short.
4. Symmetry with the §26.12.1 precedent (`background/tabs/open-tabs.js` was promoted from "optional" to a committed module for the same reasons).

Public API (proposed):
```js
// background/tabs/window-ordinals.js
export async function initWindowOrdinals();      // cold-start enumeration (§28.2.2)
export function registerWindow(windowId);         // onCreated path (§28.2.3)
export function deregisterWindow(windowId);       // onRemoved path (§28.2.4)
export function getWindowOrdinal(windowId);       // number | undefined
export function getWindowMap();                   // Record<string, number>  ({ "12345": 1, "12346": 2 })
export function getWindowOrdinalsSize();          // number (count of known windows)
export function __resetWindowOrdinals();          // test hatch
```

Internal state is a single `Map<number, number>` (rawWindowId → ordinal). Never persisted. Never written to `chrome.storage.*`.

#### 28.2.2 Cold-start enumeration (AC2)

On service-worker cold start, `initWindowOrdinals()` calls `chrome.windows.getAll({ populate: false })`, sorts the returned windows by `id` ascending, and assigns ordinals `1..N` in that order. This is called from the SW bootstrap sequence (alongside `buildLiveTabIndex()` and `reconcileClaims()`) **before** the `readyPromise` resolves.

**Monotonicity assumption:** Chromium assigns `windows.Window.id` as monotonically increasing per browser session. Older windows have smaller ids. The first-seen-order invariant (AC1) is therefore satisfied by sorting the cold-start enumeration by raw id. This is documented behaviour of Chromium's window management, consistent across Chrome, Edge, and Chromium derivatives. **Alternative considered and rejected:** sorting by the `chrome.windows.getAll()` return order alone — Chromium does not guarantee any particular order in the array, so relying on it is a latent bug.

**Fallback if the assumption ever breaks:** the function can be switched to use `chrome.windows.getLastFocused()` repeatedly in a fresh-enumeration pattern. This is called out as an architectural escape hatch only; we do not implement it in the first build.

#### 28.2.3 New window opens (AC1)

`chrome.windows.onCreated(callback)` in `tab-events.js` (new handler) calls `registerWindow(window.id)`, which sets `ordinalMap.set(windowId, maxExistingOrdinal + 1)`. `maxExistingOrdinal` is tracked in a module-scoped variable updated on every set/delete, so registration is O(1).

After the map is updated, `tab-events.js` fires `broadcast(SCOPE.WINDOW_MAP, 'window/created', { requireClaimsReady: true })` (§28.3).

#### 28.2.4 Window closes (AC3 — gap-preserving)

`chrome.windows.onRemoved(callback)` already exists in `tab-events.js` (handles tab cleanup). The handler is widened with one line: `deregisterWindow(windowId)` after `removeTabsByWindow(windowId)` runs, **before** the claim-release block. `deregisterWindow` calls `ordinalMap.delete(windowId)` and **does not renumber** any surviving ordinals. Gaps are preserved: if the map was `{12345:1, 12346:2, 12347:3}` and window `12346` closes, the result is `{12345:1, 12347:3}` — W2 is now a hole. Future windows get `maxExistingOrdinal + 1` (W4 in this example), not the reclaimed W2.

Per AC3, the hole is the documented, correct behaviour. Renumbering on close would be confusing: any sidepanel badge referencing "W3" would suddenly point at a different window without the user doing anything.

After `deregisterWindow`, `tab-events.js` fires `broadcast(SCOPE.WINDOW_MAP, 'window/removed')`. This broadcast is **not** gated on `requireClaimsReady` — window close during cold start is rare but legitimate; the sidepanel is already responsible for handling an empty or sparse map gracefully (§28.4).

#### 28.2.5 SW restart recovery

Ordinals are **session-only** and **not persisted**. On SW cold start after a suspend/resume cycle, `initWindowOrdinals()` re-enumerates from `chrome.windows.getAll()` and assigns fresh ordinals. Because the SW suspends only when no extension-triggered activity has occurred recently — not when windows close — the common case is that the same set of windows is still open, and the re-enumeration produces the same ordinal assignment (monotonic id ordering). The ordinals users see across a suspend/resume cycle are therefore stable in practice, though the architecture does not guarantee it across arbitrary scenarios.

**Edge case documented (AC1 implication):** if the user closes every browser window and then opens a new one, the SW suspends (no pages or tabs), and on the next cold start the reopened window is assigned W1 from a fresh enumeration. It is **not** assigned the "next" ordinal that would have been allocated had the SW stayed alive. This is consistent with AC2's "first-seen order" semantics and matches user expectation ("I closed everything, reopened a single window — it should be W1"). Architectural choice: session-local ordinals are the contract; cross-suspend continuity is not promised.

#### 28.2.6 Integration with `chrome.windows.WINDOW_ID_NONE`

`chrome.windows.onFocusChanged` can fire with `WINDOW_ID_NONE` when the user alt-tabs away. `window-ordinals.js` **never** registers or deregisters on focus events — only on `onCreated` / `onRemoved`. `WINDOW_ID_NONE` is filtered out defensively in `registerWindow`/`deregisterWindow` (early return if `windowId < 0`) as a belt-and-braces check.

### 28.3 Message Contract & Broadcast Architecture

#### 28.3.1 Decision: extend `MSG_LIST_ITEMS` response + new `SCOPE.WINDOW_MAP` broadcast

**Extend** the existing `MSG_LIST_ITEMS` response with a `windowMap` field, **and** introduce a new `SCOPE.WINDOW_MAP` broadcast scope. Both are needed; neither is sufficient alone.

- The `MSG_LIST_ITEMS` field satisfies AC14's "every list response carries the current map" requirement and delivers the map on sidepanel cold-open in a single round trip, matching the precedent set by `openTabs` (§26.2).
- The broadcast scope satisfies AC13/AC17: the sidepanel updates the filter row and badges on `onCreated`/`onRemoved` **without** triggering a full `renderAll()`. Without a dedicated scope, the sidepanel would have to debounce on `SCOPE.LIVE_STATE` or re-fetch the full items list on every window event, both of which violate AC17's performance guardrail.

**Rejected alternative: a dedicated `MSG_GET_WINDOW_MAP` request.** This would force the sidepanel to issue a second IPC on cold-open and after every broadcast, doubling round-trips. The `MSG_LIST_ITEMS`-extension pattern is already the established idiom for attaching derived views of in-memory SW state.

**Rejected alternative: reuse `SCOPE.LIVE_STATE` for window events.** `SCOPE.LIVE_STATE` currently fires on every tab URL / title / focus change — many times per second during heavy browsing. Window events are rare (minutes apart). Folding them into the same scope would force the sidepanel to do the window-map work on every tab event and lose the per-event specificity AC17 requires.

#### 28.3.2 Wire shape

**Before (post-B-055):**
```js
// MSG_LIST_ITEMS response data
{
  items: Item[],
  liveStates: Record<itemId, { live, active, audible, favIconUrl, tabId? }>,
  driftRecords: Record<itemId, DriftRecord>,
  openTabs: OpenTab[],
}
```

**After (B-014):**
```js
// MSG_LIST_ITEMS response data
{
  items: Item[],
  liveStates: Record<itemId, { live, active, audible, favIconUrl, tabId?, windowId? }>,  // widened
  driftRecords: Record<itemId, DriftRecord>,
  openTabs: OpenTab[],
  windowMap: Record<string, number>,   // NEW — stringified windowId → ordinal. Empty object {} when no windows open (only possible during SW suspend/resume window). Never null/undefined.
}
```

Keys are stringified windowIds because JSON object keys are strings. The sidepanel converts back via `Number(key)` or stores as strings and compares against `String(windowId)` — implementation choice, documented in handoff.

**`liveStates[itemId].windowId` widening:** for saved-item rows to render a window badge (AC7), the sidepanel needs to know each live item's windowId. Two options were considered:

| Option | Path | Cost |
|--------|------|------|
| A. Widen `buildLiveStates` to attach `windowId` to each live entry. | Read `tabEntry.windowId` from the already-joined `LiveTabIndex` entry in `tab-claims.js:buildLiveStates`. | 1 line in `tab-claims.js`; typedef update in `shared/messages.js`. |
| B. Sidepanel joins on its own via `_cachedOpenTabs`-like structure. | Client-side join, requires a claim-mirror payload extension. | Introduces an additional wire field and duplicates SW-side data. |

**Decision: Option A.** `tab-claims.js:222-228` already reads `tabEntry.{active,audible,favIconUrl}` in the same join; adding `windowId: tabEntry.windowId` to that object literal is a one-line change with no contract break. The `ListItemsResponse` typedef in `shared/messages.js` documents `windowId?: number` as present when `live === true`.

#### 28.3.3 `shared/messages.js` typedef update

```js
/**
 * @typedef {Object} ListItemsResponse
 * @property {Array<Object>} items
 * @property {Record<string, {live: boolean, active: boolean, audible: boolean, favIconUrl: string|null, tabId?: number, windowId?: number}>} liveStates
 *   Per-item live state. `tabId` and `windowId` present iff `live === true`.
 *   `windowId` is ephemeral — not stable across browser restart. Used by the
 *   sidepanel window badge (B-014 AC7). Saved-item rows with no live claim
 *   have `windowId` absent (badge suppression is the default).
 * @property {Record<string, Object>} driftRecords
 * @property {OpenTab[]} openTabs
 * @property {Record<string, number>} windowMap
 *   Session-scoped human-readable window ordinals (B-014). Key = stringified
 *   rawWindowId; value = ordinal (1, 2, 3, …). Gaps are preserved on window
 *   close. Empty object `{}` when no windows are open (rare — only observable
 *   during the brief window of SW suspend/resume). Never null/undefined.
 *   Callers MUST treat rawWindowIds as ephemeral — not stable across browser
 *   restart — and never persist either key or value. Ordinals are UI-only.
 */
```

No new `MSG_*` string constant is introduced. `MSG_LIST_ITEMS = 'tj/listItems'` is unchanged (identical wire identity as in B-055).

#### 28.3.4 New broadcast scope

```js
// background/broadcast.js (addition to existing SCOPE Object.freeze)
export const SCOPE = Object.freeze({
  ITEMS: 'items',
  GROUPS: 'groups',
  PREFERENCES: 'preferences',
  LIVE_STATE: 'liveState',
  WINDOW_MAP: 'windowMap',   // NEW — fires on windows.onCreated / windows.onRemoved only
});
```

No `MUTATION_BROADCASTS` table entry is needed — `SCOPE.WINDOW_MAP` is fired by `tab-events.js` directly (event-driven, not mutation-driven). This mirrors how `SCOPE.LIVE_STATE` is fired from `tab-events.js` today without a dispatcher entry.

#### 28.3.5 Broadcast payload

The broadcast payload intentionally carries **only** the scope and trigger string — not the map itself:
```js
{ type: MSG_STATE_CHANGED, payload: { scope: 'windowMap', trigger: 'window/created' } }
```

The sidepanel refetches the full map via `MSG_LIST_ITEMS` on receipt (§28.4.3). This matches the `SCOPE.LIVE_STATE` pattern and avoids having to serialize / deserialize / version the map payload across two different wire sites. The cost (one extra IPC per window event) is negligible — window events are rare (minutes apart), not high-frequency.

#### 28.3.6 Event-to-scope mapping

| Event | Scope fired | Why |
|-------|-------------|-----|
| `chrome.windows.onCreated` | `WINDOW_MAP` | New ordinal assigned. Filter row may need to appear (≥ 2 windows). |
| `chrome.windows.onRemoved` | `WINDOW_MAP` + existing `LIVE_STATE` (for tab cleanup) | Ordinal removed; existing `LIVE_STATE` broadcast continues for the per-tab teardown path. **Two broadcasts, not merged** — different receivers care about different scopes. |
| `tabs.onDetached` / `tabs.onAttached` | `LIVE_STATE` (existing behaviour; **not** `WINDOW_MAP`) | A tab moving between windows does not change the window *set*; the map is unchanged. Only the tab's `windowId` field in `LiveTabIndex` changes, which is already covered by the existing `tab/updated` broadcast. |
| `tabs.onUpdated` with `tab.windowId` change | `LIVE_STATE` | Same as above — windowId field on the tab moves; map itself is untouched. |
| `chrome.windows.onFocusChanged` | **none new** (existing `LIVE_STATE` via focus-change path) | Focus change does not create or destroy windows; no WINDOW_MAP broadcast. |

#### 28.3.7 Cold-start suppression

`registerWindow` may be called by `chrome.windows.onCreated` during SW cold start **before** `initWindowOrdinals()` has completed. Defence:
1. `initWindowOrdinals()` acquires the "bootstrapping" state at call start and clears it on return. If `registerWindow` is called during bootstrap, it is a no-op (the window is already being captured by `getAll()`).
2. The `broadcast(SCOPE.WINDOW_MAP, ...)` in the `onCreated` handler is gated on `requireClaimsReady: true`, using the existing cold-start suppression pattern (§10.10). This matches the behaviour of every `LIVE_STATE` broadcast: first post-bootstrap broadcast arrives after `reconcileClaims()` resolves.
3. `onRemoved` is **not** gated (no `requireClaimsReady`) — if a window closes during cold start, the surfaces that already loaded their initial state need to hear about it immediately.

### 28.4 Sidepanel Rendering

#### 28.4.1 State cache additions (`sidepanel.js`)

Three new module-scoped state slots:
```js
let _windowOrdinalMap = {};      // Record<string, number>  — cached from MSG_LIST_ITEMS response
let _panelWindowId = null;       // number | null — the sidepanel's own rawWindowId (§28.4.2)
let _activeWindowFilter = null;  // number | null — rawWindowId currently filtered, null = All (§28.5)
```

A `_setWindowOrdinalMap(nextMap)` helper is the single writer (mirrors `_setCachedOpenTabs` precedent from §26.12.3). Callers must not assign directly.

#### 28.4.2 Panel window detection (AC5)

The sidepanel knows its own rawWindowId via:
```js
// On module load, before renderAll runs:
try {
  const self = await chrome.windows.getCurrent();
  _panelWindowId = self?.id ?? null;
} catch {
  _panelWindowId = null;  // badge suppression falls back to "always show if windowMap.size >= 2"
}
```

This is re-fetched on every `MSG_LIST_ITEMS` response (§28.4.3) to handle the rare case of the sidepanel being moved to a different window mid-session (Edge allows this).

**Open question (not blocking — documented for B-035):** in B-035's future "standalone window" mode, the standalone window has its own `windows.Window.id` and is itself a browser window. `chrome.windows.getCurrent()` from inside the standalone window returns the standalone window's id. Badge logic is identical: "hide badge when the item's windowId === my own windowId." What changes is that **two** surfaces are open simultaneously (docked sidepanel + standalone), each showing its own set of badges. B-014 makes no special accommodation for this — each surface renders independently based on its own `_panelWindowId`. When B-035 ships, this behaviour is already correct; no B-014 architectural change is needed.

**Rejected alternative: use `chrome.windows.getLastFocused()` instead of `getCurrent()`.** Last-focused is user-intent semantics (which window did the user most recently interact with); current is panel-identity semantics (which window does this script run in). For badge suppression we need panel-identity — `getCurrent` is correct.

#### 28.4.3 Broadcast handler wiring

The existing `msg.type === MSG_STATE_CHANGED` branch in `sidepanel.js` (around line 1994) gets a new `scope === 'windowMap'` arm:
```js
if (scope === 'windowMap') {
  // Refetch only the map via MSG_LIST_ITEMS. We intentionally reuse the existing
  // message (not a new MSG_GET_WINDOW_MAP) so the sidepanel always reads a
  // consistent snapshot (map + liveStates + openTabs from the same SW call).
  sendMessage(MSG_LIST_ITEMS).then((itemsResp) => {
    _setWindowOrdinalMap(itemsResp.windowMap || {});
    _applyWindowMapToUI(itemsResp);  // patch filter row + badges only (§28.4.4)
  }).catch(() => {});
  return;
}
```

The handler **does not** call `renderAll()`. It only patches (a) the filter row and (b) existing badges. This satisfies AC17.

The existing `liveState` arm (`refetchAndPatchLiveState`) is widened to also reassign `_windowOrdinalMap` from the response (defensive — the SW emits both scopes on most transitions; two broadcasts can arrive out of order). This is a safe no-op when the map is unchanged.

#### 28.4.4 `_applyWindowMapToUI(itemsResp)` — targeted DOM patch

Two tasks, both targeted (no full re-render):
1. **Filter row visibility/contents** (§28.5.1) — rebuild the chip set from the new map size.
2. **Badges on every live row** — iterate DOM rows with `[data-window-id]`, re-resolve the ordinal from `_windowOrdinalMap`, re-render the badge text. For rows whose tab just left `_panelWindowId` (or arrived in it), create/destroy the badge element.

Pseudo-algorithm:
```js
function _applyWindowMapToUI(itemsResp) {
  _rebuildWindowFilterRow(_windowOrdinalMap);    // §28.5.1
  _patchAllWindowBadges(itemsResp);              // §28.4.5
  // AC12: if the currently-filtered window no longer exists, reset.
  if (_activeWindowFilter !== null
      && !Object.prototype.hasOwnProperty.call(_windowOrdinalMap, String(_activeWindowFilter))) {
    _activeWindowFilter = null;
    applyFilter();  // re-apply the B-021 filter pipeline without the window constraint
  }
}
```

#### 28.4.5 Badge rendering helper

A single helper replaces the existing raw-integer `_createWindowBadge`:
```js
/**
 * Render or patch the window badge for a row.
 * - If the item is not live in another window: remove any existing badge.
 * - Otherwise: compute ordinal from _windowOrdinalMap and render "W<ordinal>".
 * - Defensive fallback: if ordinal is missing (race — broadcast arrived before
 *   MSG_LIST_ITEMS completed), render "W<rawWindowId>" so the user sees
 *   *something*; a follow-up broadcast will correct it. This fallback matches
 *   B-055's behaviour and is intentional — a missing badge would be harder to
 *   debug than a raw-id badge for the <500ms window before correction.
 */
function _renderWindowBadge(row, rawWindowId, indicatorsEl) {
  if (rawWindowId == null || rawWindowId === _panelWindowId) {
    const existing = indicatorsEl?.querySelector('.open-tab-window-badge');
    if (existing) existing.remove();
    return;
  }
  const ordinal = _windowOrdinalMap[String(rawWindowId)];
  const label = ordinal != null ? `W${ordinal}` : `W${rawWindowId}`; // defensive fallback
  const ariaLabel = ordinal != null ? `Window ${ordinal}` : `Window ${rawWindowId}`;

  let badge = indicatorsEl.querySelector('.open-tab-window-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'open-tab-window-badge';
    indicatorsEl.prepend(badge);
  }
  if (badge.textContent !== label) badge.textContent = label;
  badge.setAttribute('aria-label', ariaLabel);
}
```

**Deprecation of `_createWindowBadge`:** the current raw-integer helper (§sidepanel.js:1237) is removed in favour of `_renderWindowBadge`. All three of its callers (`buildOpenTabRow`, `_patchOpenTabRow`, the new saved-item paths in §28.4.6) are migrated to the new helper. This is a mechanical edit documented in the handoff.

#### 28.4.6 Saved-item row badge (AC7 — new code path)

`buildItemRow` (`sidepanel.js:1107`) is widened to render a window badge when `live?.live && live.windowId != null && live.windowId !== _panelWindowId`:
- Set `row.dataset.windowId = String(live.windowId)` so `applyFilter` can target the row (§28.5.2).
- Ensure the `.item-indicators` container is created (today it is only created when audible or drifted is truthy — widen the predicate to include the cross-window case).
- Call `_renderWindowBadge(row, live.windowId, indicators)`.

`refetchAndPatchLiveState()` is widened to call `_renderWindowBadge` on every saved-item row whose `live.windowId` may have changed (tab moved between windows). The existing patch loop iterates `[data-item-id]:not([data-live-only])`; no new loop is needed — one call per row inside the existing loop is sufficient.

### 28.5 Window Filter Row (absorbed from B-034)

#### 28.5.1 Component placement & lifecycle (AC8, AC9)

**Placement: inside `#panel-header`, below the filter input row (new row / new flex line).** The HTML addition is a sibling of `#filter-container`:
```html
<!-- sidepanel.html -->
<div id="panel-header" class="panel-header" hidden>
  <span class="panel-header-title">Tab Junkie</span>
  <div id="filter-container"> ... existing filter input + clear btn ... </div>
  <button id="add-bookmark-btn">...</button>
  <!-- NEW: window filter row -->
  <div id="window-filter-row"
       class="window-filter-row"
       role="tablist"
       aria-label="Filter by window"
       hidden>
    <!-- Chips injected by _rebuildWindowFilterRow at runtime -->
  </div>
</div>
```

The row is a sibling of the filter input (not nested inside `#filter-container`) so CSS flex wrapping flows naturally — chips appear on the row **below** the filter/add-button row when ≥ 2 windows are open, and the container collapses to zero height when hidden.

**Visibility rule (AC8):** `_rebuildWindowFilterRow` sets `row.hidden = Object.keys(_windowOrdinalMap).length < 2`. When down to one window, it hides and resets `_activeWindowFilter = null`. When the first second window opens, it appears populated with the current map.

**Contents (AC9):**
- First chip: "All windows" (selected by default; `role="tab"`, `aria-selected="true"`, `data-filter-window="all"`, `tabindex="0"`).
- One chip per ordinal, in ordinal order (W1, W2, W3, …): `role="tab"`, `aria-selected="false"`, `data-filter-window="<rawWindowId>"`, `tabindex="-1"`. Text content `W<ordinal>`.

The ARIA pattern matches the W3C ARIA Authoring Practices **Tabs with Automatic Activation** pattern (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/). Automatic activation (not manual) is chosen because the filter is cheap (a targeted DOM `hidden` toggle per row — see §28.5.2) and instant feedback is the expected UX for filter chips.

#### 28.5.2 Filter state & application (AC11)

`_activeWindowFilter: number | null` — `null` means "All windows," a number is a rawWindowId.

Activation flow:
1. User clicks chip (or presses Enter/Space on focused chip).
2. Handler: `_activeWindowFilter = Number(chip.dataset.filterWindow) || null` (the "all" chip yields `NaN → null`).
3. Update `aria-selected` on all chips.
4. Call `applyFilter()` — existing B-021 pipeline.

Filter application (inside existing `applyFilter`, new branch):
```js
// After the text-filter matching loop, but before the "hide groups with zero
// matching items" loop:
if (_activeWindowFilter !== null) {
  const wanted = String(_activeWindowFilter);
  for (const row of itemListEl.querySelectorAll('[data-window-id]')) {
    if (row.hidden) continue;  // already hidden by text filter — don't un-hide
    if (row.dataset.windowId !== wanted) row.hidden = true;
  }
  // Saved items with NO live tab (no data-window-id) are hidden under a
  // specific-window filter, per AC11. The text-filter loop above handled the
  // live rows; this loop handles the remaining saved-item rows:
  for (const row of itemListEl.querySelectorAll('.item-row[data-item-id]:not([data-window-id]):not([hidden])')) {
    row.hidden = true;
  }
}
```

Collapse-state and text-filter semantics from B-021 are preserved byte-for-byte — the window filter is an additional constraint layered on top of the existing pipeline, not a replacement.

#### 28.5.3 Auto-reset on window close (AC12)

Handled in `_applyWindowMapToUI` (§28.4.4): if `_activeWindowFilter` is a rawWindowId no longer present in the new `_windowOrdinalMap`, set it back to `null` and re-apply the filter. The user sees the filter chip disappear and the view return to "All windows" smoothly. Aria-live announcement is **not** emitted (rare event, low-value; documented as a potential R5 enhancement if UAT reveals disorientation).

#### 28.5.4 Keyboard interaction (AC10)

The tablist keyboard pattern requires:
| Key | Action |
|-----|--------|
| `Tab` | Moves focus **into** the tablist (to the selected chip) or **out** of it (to the next focusable element). |
| `ArrowLeft` / `ArrowRight` | Move focus to the previous/next chip, wrapping at the ends. With automatic activation, the focused chip becomes the filter. |
| `Home` / `End` | Move focus to the first / last chip (and activate). |
| `Enter` / `Space` | Activate the focused chip (redundant with automatic activation but required by the pattern). |

Implementation: a single `keydown` listener on `#window-filter-row` delegated to `role="tab"` children. Roving tabindex (`tabindex="0"` on the selected chip, `-1` on the rest) is maintained on every activation.

#### 28.5.5 Integration with existing bulk actions

A window-filter selection **hides** rows — it does not remove them from `_cachedItems` or `_cachedOpenTabs`. Existing bulk-action code paths (Ctrl/Cmd+A, the bulk bar, context menus) already use DOM `:not([hidden])` selectors (B-024 / B-055). No changes required to bulk logic — selections under a window filter naturally exclude hidden rows.

### 28.6 Real-Time Badge Updates (AC13)

When a tab is dragged between windows (`tabs.onDetached`/`tabs.onAttached` or `tabs.onUpdated` with a changed `windowId`), the existing `tab-events.js` `onUpdated` handler captures the new `windowId` into `LiveTabIndex` (`updateTabEntry(tabId, { windowId: tab.windowId })`, lines 54-57). The broadcast path (`SCOPE.LIVE_STATE`) already fires.

B-014 adds one behaviour: `refetchAndPatchLiveState` (§28.4.6) now calls `_renderWindowBadge` for each saved-item row and `patchOpenTabsSection` already reads the latest `tab.windowId` per row. Both update only the badge element — no row rebuild, no full re-render. AC13 is satisfied by these two existing patch paths + the new helper.

**No `SCOPE.WINDOW_MAP` broadcast fires** for tab-move-between-windows events. The window *set* did not change — only which tabs are in which windows. This is a deliberate split: the sidepanel's live-state patch loop handles per-row badge re-resolution; the WINDOW_MAP broadcast handles filter row + badge refresh when the map structure itself changes.

### 28.7 R2 Correctness Checklist

| # | Check | Status | Reasoning |
|---|-------|--------|-----------|
| C-1 | Storage schema versioned | **N/A (PASS)** | Per AC15, the window ordinal map is purely in-memory and session-scoped — never written to `chrome.storage.local` or `chrome.storage.session`. No new partition, no field on any persisted shape, no migration. `KNOWN_VERSION` unchanged. The `windowId` field added to `liveStates[itemId]` is computed at read time from the (also in-memory) `LiveTabIndex` entry — zero storage impact. |
| C-2 | Message contracts typed | **PASS** | `shared/messages.js` typedef updated to document the new `windowMap: Record<string, number>` field on `ListItemsResponse` and the widened `liveStates[itemId]` shape (`windowId?: number` present iff `live === true`). New `SCOPE.WINDOW_MAP` value documented in this section and added to the `SCOPE` frozen object in `background/broadcast.js`. No new `MSG_*` string constant — `MSG_LIST_ITEMS` wire identity is unchanged. Handler payload validation is unchanged. |
| C-3 | Service worker cold-start safe | **PASS** | `initWindowOrdinals()` is part of the cold-start bootstrap sequence (alongside `buildLiveTabIndex` and `reconcileClaims`); `MSG_LIST_ITEMS` callers await the existing `readyPromise`, so the dispatcher never responds with a partially-built map. `getWindowMap()` returns `{}` if called before bootstrap (defensive no-throw contract). Window events during cold start are handled: `onCreated` during bootstrap is a no-op (the window is already in the enumeration); the `SCOPE.WINDOW_MAP` broadcast is gated on `requireClaimsReady: true` to avoid flooding surfaces before the first coherent state. `onRemoved` is **not** gated — windows closing during cold start must be immediately reflected. |
| C-4 | ID stability | **PASS** | Raw `chrome.windows.Window.id` values are ephemeral (not stable across browser restart) — explicitly documented in the `windowMap` and `liveStates[].windowId` typedefs. Ordinals are session-only, cleared on SW suspend, and re-enumerated on cold start. Nothing persists either key or value (AC15). Saved-item identity (stable uuid) is unchanged. The sidepanel's cached `_windowOrdinalMap` is a UI-lifetime structure invalidated on every reload. No durable reference to an ephemeral id leaks into storage, messages beyond the `MSG_LIST_ITEMS` response, or broadcast payload metadata. |
| C-5 | Manifest file references resolvable | **N/A (PASS)** | No `manifest.json` changes. No new permissions (`windows` permission already required and granted by B-010). No new `default_path`, no new `chrome_url_overrides`, no new `commands`. Existing `sidepanel.html` / `sidepanel.js` references are unaffected. |

### 28.8 Rollback Plan

No schema change, no permission change, no data migration — rollback is a straightforward `git revert` of the B-014 commits. Specifically:

- Reverting the `shared/messages.js` typedef additions (`windowMap`, widened `liveStates`) has no runtime effect (typedefs are JSDoc comments).
- Reverting `background/broadcast.js` removes `SCOPE.WINDOW_MAP`. Any in-flight broadcast with the reverted scope string is silently ignored by the sidepanel's `scope` switch (falls through without action).
- Reverting `background/tabs/window-ordinals.js` (new file — deleted on revert) and the `onCreated`/`onRemoved` wiring in `background/tabs/tab-events.js` stops ordinal bookkeeping. `MSG_LIST_ITEMS` no longer includes `windowMap`; the sidepanel treats the absent field as `{}` (defensive `resp.windowMap || {}` pattern) and renders no badges, hides the filter row.
- Reverting `background/tabs/tab-claims.js` drops the one-line `windowId: tabEntry.windowId` addition to `buildLiveStates`. Saved-item rendering falls back to no cross-window badge (pre-B-014 behaviour).
- Reverting the `sidepanel/sidepanel.js` changes removes `_windowOrdinalMap`, `_panelWindowId`, `_activeWindowFilter`, `_renderWindowBadge`, `_rebuildWindowFilterRow`, `_applyWindowMapToUI`, and the filter-row keyboard handler. The Open Tabs section returns to rendering `W${rawWindowId}` (B-055 pre-B-014 behaviour) and saved-item rows have no window badge.
- Reverting `sidepanel/sidepanel.html` removes the `#window-filter-row` element. No other HTML structure changes.
- Reverting `sidepanel/sidepanel.css` removes the `.window-filter-row` styling.
- No cleanup of `chrome.storage.local` / `chrome.storage.session` needed — nothing was written.

**Expected SHA at rollback target:** `bd7634a` (Sprint 13 close) or the most recent commit prior to the B-014 merge, whichever is later.

### 28.9 Risks & Flags

**Tier decision: Full (M) — NOT escalated to Spike-First (XL).** Three foundational triggers are checked and all absent:
- No new storage partition (AC15 locks this).
- No new `manifest.json` permission (the `windows` permission is already granted and used — `chrome.windows.getCurrent`, `chrome.windows.update`, `chrome.windows.onRemoved`, `chrome.windows.onFocusChanged` are all in active use today).
- No new cross-cutting change to drift / matching / reconciliation logic.

The feature is a targeted refinement of existing primitives — the ordinal map is a small in-memory allocator, the filter row is an additional overlay on the existing B-021 filter pipeline, the badge is a one-element patch on existing row renderers. No tier upgrade warranted.

**Medium-severity risks tracked (not blockers):**

1. **Windows `id` monotonicity assumption.** §28.2.2 depends on `chrome.windows.Window.id` being monotonically increasing within a session. This is consistent Chromium behaviour but not formally contracted by the MV3 extension API spec. If a future Chromium release changes the allocation strategy, the cold-start ordering could produce unstable ordinals. Mitigation: the fallback to `chrome.windows.getLastFocused()` reconstruction is documented as an escape hatch. R5 can add a regression test that opens N windows sequentially and asserts ordinal == open-order — if Chromium ever breaks the assumption, the test catches it.
2. **Badge text-width overflow in narrow sidepanels.** Double-digit ordinals (W10+) are wider than the single-digit W1–W9 pattern. If the user runs a narrow side panel with many windows, the badge could wrap or truncate. Mitigation: CSS `.open-tab-window-badge { min-width: 2ch; white-space: nowrap; }` is an existing property in `sidepanel.css` for the B-055 badge; B-014 inherits it. UAT should confirm the 2-digit case.
3. **`chrome.windows.getCurrent()` race at sidepanel open.** The `_panelWindowId` fetch is asynchronous; a very-fast cold open could render one round of badges before `_panelWindowId` is set (default `null`). Mitigation: when `_panelWindowId === null`, `_renderWindowBadge` renders the badge (no suppression) — a brief "wrong" badge is preferable to no badge on first paint, and the first `refetchAndPatchLiveState` cycle will correct it.
4. **Standalone window (B-035) interaction — open question documented, not blocking.** When B-035 ships, two surfaces open simultaneously each independently fetch their own `_panelWindowId` via `chrome.windows.getCurrent()`. Each surface correctly suppresses badges for its own window. No B-014 change required; this is called out so B-035's R2 author does not re-open the question.
5. **Filter row visual stacking in narrow panel.** With many open windows (e.g., 10+), chips may wrap to two or more rows. `.window-filter-row { flex-wrap: wrap; }` is the expected CSS. UAT should confirm the visual is still clean at 10+ windows — if not, a horizontal-scroll fallback is a simple follow-up (out of scope for B-014).

No SEV1 / SEV2 risks identified. Proceed to R3 build.

### 28.10 Handoff Notes for [frontend-engineer]

**File touchpoints:**

- `shared/messages.js` — add `windowMap` to `ListItemsResponse` typedef; widen `liveStates[]` entry typedef with `windowId?: number`.
- `background/broadcast.js` — add `SCOPE.WINDOW_MAP: 'windowMap'` to the frozen `SCOPE` object.
- `background/tabs/window-ordinals.js` — **new module**. Implements the ordinal allocator, cold-start enumeration, `getWindowMap()`, and test hatches.
- `background/tabs/tab-claims.js` — one-line change in `buildLiveStates` (line ~227) adding `windowId: tabEntry.windowId` to the live-entry object literal.
- `background/tabs/tab-events.js` — register `chrome.windows.onCreated` (new handler) that calls `registerWindow()` and broadcasts `SCOPE.WINDOW_MAP`; widen the existing `windows.onRemoved` handler to call `deregisterWindow()` and broadcast `SCOPE.WINDOW_MAP`.
- `background/messages/storage-handlers.js` — extend the `MSG_LIST_ITEMS` case (line ~151-158) to include `windowMap: getWindowMap()` in the returned object. Import `getWindowMap` from `../tabs/window-ordinals.js`.
- `background/service-worker.js` (or wherever the bootstrap sequence is) — add `initWindowOrdinals()` to the cold-start sequence; await it as part of `readyPromise`.
- `sidepanel/sidepanel.html` — add `<div id="window-filter-row" class="window-filter-row" role="tablist" aria-label="Filter by window" hidden></div>` inside `#panel-header` after `#filter-container` / `#add-bookmark-btn`.
- `sidepanel/sidepanel.css` — style `.window-filter-row` (flex row, wrap, spacing) and `.window-filter-chip` (chip pill, `[aria-selected="true"]` variant, focus ring for keyboard). Inherit color tokens from the filter-input family to stay theme-safe.
- `sidepanel/sidepanel.js` — add `_windowOrdinalMap`, `_panelWindowId`, `_activeWindowFilter`, `_setWindowOrdinalMap` helper; replace `_createWindowBadge` with `_renderWindowBadge`; add `_rebuildWindowFilterRow`, `_applyWindowMapToUI`, keyboard handler for the tablist; wire the new `scope === 'windowMap'` broadcast arm; widen `applyFilter` with the window-constraint branch (§28.5.2); call `_renderWindowBadge` from `buildItemRow`, `buildOpenTabRow`, `_patchOpenTabRow`, and the saved-item loop in `refetchAndPatchLiveState`.
- `tests/` — add unit coverage for `background/tabs/window-ordinals.js` (cold start, register, deregister, gap preservation, re-enumeration); extend `tests/enriched-list-items.test.js` to assert the new `windowMap` field is present, well-formed, and consistent with `liveStates[].windowId` for a multi-window fixture. UAT cases per every AC.

**Order of implementation (smaller → bigger, TDD-friendly):**

1. `shared/messages.js` typedef + `background/broadcast.js` `SCOPE.WINDOW_MAP`. Pure doc/enum — no runtime behaviour yet.
2. `background/tabs/window-ordinals.js` with unit tests (pure module, no chrome API calls outside `initWindowOrdinals`).
3. `background/tabs/tab-claims.js` one-line `windowId` widening + update the one `buildLiveStates` unit test.
4. `background/tabs/tab-events.js` — add `onCreated` handler; extend `onRemoved`. Integration tests via chrome-mock.
5. `background/messages/storage-handlers.js` — splice `windowMap` into `MSG_LIST_ITEMS` response. Update `tests/enriched-list-items.test.js`.
6. `sidepanel/sidepanel.js` — deprecate `_createWindowBadge`, add `_renderWindowBadge`, wire into both `buildItemRow` and `buildOpenTabRow` / `_patchOpenTabRow`. First pass: badges render with no filter row, no broadcast handler.
7. `sidepanel/sidepanel.js` — add the `scope === 'windowMap'` broadcast arm; wire `_applyWindowMapToUI`. Badges now update live.
8. `sidepanel/sidepanel.html` + `sidepanel.css` — add the filter row markup and styles.
9. `sidepanel/sidepanel.js` — wire `_rebuildWindowFilterRow`, chip click handler, keyboard handler; widen `applyFilter` with the window-constraint branch.
10. `sidepanel/sidepanel.js` — AC12 auto-reset + AC5 re-fetch of `_panelWindowId` on every `MSG_LIST_ITEMS` response.
11. UAT per every AC1–AC18.

**Non-obvious gotchas:**

- `chrome.windows.WINDOW_ID_NONE === -1` — always filter this out in `registerWindow`/`deregisterWindow`. The `onFocusChanged` listener already handles it.
- The `_panelWindowId` fetch is async; do **not** block `renderAll()` on it. The first paint renders with `_panelWindowId === null` (all badges shown); the follow-up patch corrects it. The UI flash is <100ms in practice.
- `applyFilter` runs on every text-filter keystroke (debounced) AND on every broadcast patch AND on every chip click. Confirm the window-constraint branch does not re-cost the no-filter case (short-circuit on `_activeWindowFilter === null`).
- Ordinal map keys are **stringified** windowIds because JSON object keys are strings. Always compare via `String(rawWindowId)` in the sidepanel; never trust identity-equality on a freshly-parsed map.
- The `_renderWindowBadge` helper must be called every time a row is rebuilt (after `patchOpenTabsSection` inserts a fresh `<li>`, after `buildItemRow` creates a saved-item row) AND every time a broadcast patches existing rows. The common failure mode is "badge renders correctly on first paint but doesn't update" — usually caused by forgetting to call the helper from `refetchAndPatchLiveState`'s saved-item loop.
- The tablist keyboard handler must NOT preventDefault on `Tab` — `Tab` should exit the tablist to the next focusable element per the ARIA pattern. Arrow keys **do** preventDefault (they would otherwise scroll the page).

### 28.11 Out-of-Scope — Reconfirmed from AC18

The following are explicitly **not** in scope for B-014. Implementing any of them would be scope creep:

- Cross-device synchronization of window ordinals (requires storage + sync — not a valid extension of an in-memory session-scoped map).
- Named or user-labeled windows ("Work", "Research", etc.) — would require a persistence layer and a naming UI.
- Window-pane reordering of ordinals (letting the user drag W3 to be W1) — breaks the "first-seen order" invariant; not requested by any persona.
- Assigning ordinals to windows with no Tab Junkie presence (e.g., an incognito window or a window opened before the SW booted with no tabs tracked) — the current enumeration covers every window the `windows` API returns, which includes all windows in the main profile; incognito windows are out of scope entirely.
- Multi-profile handling (users with simultaneous Chrome profiles) — each profile runs an independent SW; ordinals are per-profile by construction. No cross-profile reconciliation.

### 28.12 B-014 Build Outcome (R6 Close)

Sprint 14 closed 2026-04-17. B-014 shipped as part of Sprint 14 alongside the B-057 URL-policy spike (research-only — no code). This subsection records what was actually built, deviating from or extending the §28.1–§28.11 R2 plan. §28.1–§28.11 remain the R2 design of record and are not modified here.

#### 28.12.1 Deviations from R2

**D-1 — `shared/scopes.js` created as SSOT for broadcast scopes (NEW module, not in R2 plan).**
The R2 plan (§28.3) added `SCOPE.WINDOW_MAP` to the frozen `SCOPE` object already living in `background/broadcast.js` and expected the sidepanel to import from there. R4 M-1 surfaced that the sidepanel was still comparing against bare-string literals (`scope === 'windowMap'`). Importing from `background/` into `sidepanel/` crosses the background/UI boundary we otherwise keep clean. The [frontend-engineer] lifted `SCOPE` into a new file `shared/scopes.js` (21 lines) and made `background/broadcast.js` re-export it. Both surfaces now consume the same frozen constant. Flagged below under Shared File Governance.

**D-2 — `tabs.onDetached` + `tabs.onAttached` handlers added (R4 H-3 fix).**
R2 §28.3 wired `chrome.windows.onCreated` and `chrome.windows.onRemoved` only, on the assumption that drag-between-windows would flow through existing `tabs.onUpdated` infrastructure. R4 H-3 proved otherwise — Chrome fires `onDetached`/`onAttached` (NOT `onUpdated`) for cross-window drag. Handlers added at `background/tabs/tab-events.js:309` (onDetached — transitional marker only) and `:323` (onAttached — authoritative `updateTabEntry({windowId, index})` + dual broadcast `SCOPE.LIVE_STATE` then `SCOPE.WINDOW_MAP`). Without this, AC13 (badge updates on cross-window drag) would have silently failed.

**D-3 — `_activateWindowFilterChip` windowId coercion hardened (R4 H-1 fix).**
R2 §28.5.2 sketched `_activeWindowFilter = Number(raw) || null`. R4 H-1 flagged that `Number("0") === 0` is falsy, so a real windowId of 0 would silently behave as if the "All" chip were active. Final code at `sidepanel/sidepanel.js:1998` uses `raw === 'all' ? null : (Number.isFinite(Number(raw)) ? Number(raw) : null)`. Semantically safe even if Chromium ever hands out `windowId === 0`.

**D-4 — `renderAll` re-applies filter on window-filter state too (R4 H-2 fix).**
R2 §28.5 assumed `renderAll`'s existing post-render `if (_filterQuery) applyFilter()` guard covered the window filter. R4 H-2 proved it didn't — a window chip active with no text query caused any `scope: items | groups` broadcast to rebuild the DOM with all rows visible while the chip kept its selected state. Fix at `sidepanel.js:1050` (and the three other `renderAll` call sites at 406/1684/2406): `if (_filterQuery || _activeWindowFilter !== null) applyFilter();`.

**D-5 — `refetchAndPatchLiveState` and `SCOPE.WINDOW_MAP` handler both re-apply filter on exit (UAT-D2 fix).**
UAT-D2 revealed that even after D-4 fixed `renderAll`, two other paths rebuilt DOM state without re-running `applyFilter`:
- `refetchAndPatchLiveState()` (sidepanel.js:1780) — triggered by every `SCOPE.LIVE_STATE` broadcast.
- `SCOPE.WINDOW_MAP` handler (sidepanel.js:2412) — triggered when a window opens/closes.

Both patched `data-window-id` attributes but left the filter un-reapplied. Dragging a tab between windows while a window filter was active left the moved row visible in the wrong filter view. Same one-line guard (`if (_filterQuery || _activeWindowFilter !== null) applyFilter();`) added at the tail of both paths. The pattern "after any DOM-patching broadcast, re-apply the active filter" is now established across all three exit points.

**D-6 — Window-filter chip `:focus-visible` uses explicit outline (UAT-D1 fix).**
R2 §28.5.3 specified a `box-shadow: 0 0 0 3px var(--accent-subtle)` halo for focus. In dark mode, `--accent-subtle` resolves to `#1e293b` — too close to the panel background for the halo to be visible. Replaced at `sidepanel.css:1252–1256` with `outline: 2px solid var(--accent); outline-offset: 2px; border-color: var(--accent);`. Visible in both light and dark modes. Flagged in the Sprint 14 retrospective: other elements across the stylesheet use the same anti-pattern and warrant a cross-sprint audit.

**D-7 — `M-3` ordering tweak in `SCOPE.WINDOW_MAP` handler.**
R2 §28.6 described the handler as `_setWindowOrdinalMap → _applyWindowMapToUI`. R4 M-3 showed this could flash stale badge ordinals when a tab moved between windows and the `windowMap` broadcast arrived before the `liveState` broadcast. Final order at `sidepanel.js:2394–2412`: `_setWindowOrdinalMap → _refreshPanelWindowId → refresh caches → patchOpenTabsSection(_cachedOpenTabs) → _applyWindowMapToUI → re-apply filter`. The additional `patchOpenTabsSection` call guarantees that `data-window-id` attributes are fresh before the badge pass reads them.

#### 28.12.2 New Contracts Finalized

| Contract | Location | Shape | Notes |
|----------|----------|-------|-------|
| `MSG_LIST_ITEMS.windowMap` | `shared/messages.js` typedef | `Record<string, number>` (string rawWindowId → positive-integer ordinal) | Always present, may be `{}` if SW booted pre-enumeration. Sidepanel uses `resp.windowMap \|\| {}` defensive. |
| `liveStates[itemId].windowId?` | `shared/messages.js` + `background/tabs/tab-claims.js:204` (buildLiveStates JSDoc widened per M-4) | `number` present iff `live === true` and a claim is held | Raw Chromium windowId, session-ephemeral. |
| `SCOPE.WINDOW_MAP` | `shared/scopes.js` (SSOT), re-exported by `background/broadcast.js` | `'windowMap'` | Fires on `windows.onCreated` / `windows.onRemoved` (bootstrap-gated to avoid cold-start flood) and on `tabs.onAttached` (AC13). Sidepanel handler refetches `MSG_LIST_ITEMS` and patches ordinal caches + DOM attrs + badges + filter. |
| `shared/scopes.js` | NEW cross-boundary shared module | `export const SCOPE = Object.freeze({...})` | **Shared File Governance flag**: cross-boundary module touched by `background/broadcast.js` and `sidepanel/sidepanel.js`; future contracts that add scopes must edit here first. |

No new `MSG_*` type string was added. No new storage keys. No new manifest permissions. Wire identity of `MSG_LIST_ITEMS` is unchanged (response payload additive only).

#### 28.12.3 Lifecycle

**Cold-start bootstrap fan-out** (`background/tabs/index.js:37–42`):
```
Promise.all([
  reconcileClaims(),
  buildLiveTabIndex(),
  initWindowOrdinals(),   // B-014 — joins the existing fan-out
]);
```
`initWindowOrdinals()` calls `chrome.windows.getAll()` and registers each window in monotonically-increasing raw-id order (§28.2.2). `MSG_LIST_ITEMS` callers await the existing `readyPromise`, so the dispatcher never returns a partially-built ordinal map.

**Runtime event flow**:
- `chrome.windows.onCreated` → `registerWindow(windowId)` → broadcast `SCOPE.WINDOW_MAP` (gated on `requireClaimsReady`).
- `chrome.windows.onRemoved` → `deregisterWindow(windowId)` → broadcast `SCOPE.WINDOW_MAP` (NOT gated — closure events during cold start must be reflected immediately).
- `chrome.tabs.onAttached` → `updateTabEntry(tabId, {windowId, index})` → broadcast `SCOPE.LIVE_STATE`, then broadcast `SCOPE.WINDOW_MAP` (latter second so the sidepanel re-patches badges with fresh windowIds already resolved).
- `chrome.tabs.onDetached` → transitional marker only; `onAttached` is authoritative.

**SW restart**: `window-ordinals.js` module state is cleared (module lives in the SW). Fresh enumeration via `chrome.windows.getAll()` on the next bootstrap. No persistence; session-scoped by design (AC15).

#### 28.12.4 UAT-Discovered Defects (Fixed In-Pipeline)

| ID | Severity | Description | Fix |
|----|----------|-------------|-----|
| UAT-D1 | Defect (accessibility) | Window-filter chip `:focus-visible` invisible in dark mode — `--accent-subtle` (`#1e293b`) too close to panel background for the box-shadow halo to register visually. Keyboard users lost focus on the filter row. | `sidepanel.css:1252–1256` — replaced box-shadow halo with explicit `outline: 2px solid var(--accent); outline-offset: 2px;`. Visible in both themes. |
| UAT-D2 | Defect (state consistency) | Dragging a tab between windows while a window filter was active left the row visible in the wrong filter view. Root cause: even after R4 H-2 fixed the `renderAll` path, the `refetchAndPatchLiveState` and `SCOPE.WINDOW_MAP` handler paths both patched DOM attributes without re-running `applyFilter`. | Added `if (_filterQuery \|\| _activeWindowFilter !== null) applyFilter();` guard at the tail of both paths (`sidepanel.js:1780` and `sidepanel.js:2412`). Pattern now consistent across all three DOM-patching exit points. |

Both defects were caught by interactive UAT against the loaded unpacked extension. Neither surfaced in automated tests nor in R4 static review. Sprint retrospective Action Item: add "where does filter state need to be re-applied" as an explicit R4 checklist item for any future feature that patches DOM on broadcast.

#### 28.12.5 R2 Correctness Checklist — Post-Build

| # | Check | Status | Reasoning |
|---|-------|--------|-----------|
| C-1 | Storage schema versioned | **N/A (PASS)** | No write to `chrome.storage.*`. Ordinal map is module-scoped in-memory only (verified by grep: `window-ordinals.js` contains no `chrome.storage` reference). `liveStates[].windowId` is computed at read time from in-memory `LiveTabIndex`. `KNOWN_VERSION` unchanged. |
| C-2 | Message contracts typed | **PASS** | `shared/messages.js` typedef documents `windowMap: Record<string, number>` and widened `liveStates[]` shape. `shared/scopes.js` (new) exports frozen `SCOPE` with `WINDOW_MAP: 'windowMap'` as SSOT. `background/broadcast.js` re-exports. Sidepanel imports and compares against `SCOPE.WINDOW_MAP` constant. `MSG_LIST_ITEMS` wire identity unchanged (additive field). |
| C-3 | Service worker cold-start safe | **PASS** | `initWindowOrdinals()` runs in the `Promise.all` bootstrap fan-out alongside `buildLiveTabIndex` and `reconcileClaims` in `background/tabs/index.js:37–42`. `MSG_LIST_ITEMS` handler awaits `readyPromise` so dispatcher never returns a partial map. `onCreated` broadcasts are bootstrap-gated; `onRemoved` is not (closure during cold start must be immediately reflected). `getWindowMap()` returns `{}` defensively if called pre-bootstrap. |
| C-4 | ID stability | **PASS** | Raw `chrome.windows.Window.id` is ephemeral — documented in typedefs for `windowMap` and `liveStates[].windowId`. Ordinals are session-only, cleared on SW suspend, re-enumerated on cold start. Nothing persists either key or value. Saved-item stable uuid identity unchanged. `_windowOrdinalMap` in sidepanel is UI-lifetime only. |
| C-5 | Manifest file references resolvable | **N/A (PASS)** | No `manifest.json` changes. No new permissions — `windows` permission was already granted and in active use pre-B-014. No new `default_path` / `chrome_url_overrides` / `commands`. |

#### 28.12.6 Rollback Plan

**No storage schema change. No permission change. No data migration.** Rollback is a straightforward `git revert` of the B-014 commits. Specifically:

- Reverting `shared/messages.js` typedef additions has no runtime effect (JSDoc comments only).
- Reverting `shared/scopes.js` (NEW file — deleted on revert) removes the `SCOPE` frozen object. `background/broadcast.js` must be reverted alongside to drop its re-export. Any in-flight broadcast with scope string `'windowMap'` is silently ignored by the sidepanel `scope` switch (falls through with no action).
- Reverting `background/tabs/window-ordinals.js` (NEW file — deleted on revert) and the wiring in `background/tabs/tab-events.js` (onCreated, onRemoved, onDetached, onAttached) stops ordinal bookkeeping entirely. `MSG_LIST_ITEMS` no longer includes `windowMap`; sidepanel falls back to `resp.windowMap || {}` (empty map) → no badges rendered, filter row hidden.
- Reverting `background/tabs/tab-claims.js` drops the one-line `windowId: tabEntry.windowId` addition to `buildLiveStates` return shape.
- Reverting the `sidepanel/sidepanel.{js,html,css}` changes removes `_windowOrdinalMap`, `_panelWindowId`, `_activeWindowFilter`, `_renderWindowBadge`, `_rebuildWindowFilterRow`, `_applyWindowMapToUI`, the tablist keyboard handler, and the `#window-filter-row` HTML element. Open Tabs section returns to B-055 pre-B-014 behaviour (renders `W${rawWindowId}` directly).
- No cleanup of `chrome.storage.local` or `chrome.storage.session` needed — nothing was written.

**Rollback target SHA**: `bd7634a` (Sprint 13 close) or whatever commit was last green prior to the B-014 merge, whichever is later.

#### 28.12.7 Sibling Context — B-057 Spike Outcome

B-057 (URL-scheme allowlist + duplicate-URL policy review) shipped as Sprint 14's Spike-First research item. Output document: `docs/spikes/B-057-url-policy-spike.md` (277 lines). Two user-accepted decisions:

1. **Expand URL allowlist** to include `chrome://`, `edge://`, `chrome-extension://`, `about:`, `view-source:`; keep hard-reject for `javascript:` and `data:` (XSS / exfil vectors).
2. **Remove `ERR_DUPLICATE_URL` reject** from `MSG_PROMOTE_TAB`; replace with a soft-warn UI ("This page is already saved — promote anyway?").

Four follow-on items queued for Sprint 15 (B-058 S, B-059 M, B-060 S, B-061 XS — latter replaces retired B-056). No implementation landed in Sprint 14; the spike correctly recommended deferral. See the spike document for full decision rationale and follow-up scope.

#### 28.12.8 Flagged for Future Hardening

Items deferred from B-014 R4 LOW findings (not fixed this sprint) plus cross-sprint concerns surfaced during UAT. None are blockers.

| Source | Item | Notes |
|--------|------|-------|
| R4 L-2 | `.item-window-badge` / `.open-tab-window-badge` CSS duplication (100% identical today) | Intentional — retained so the two surfaces can diverge without a cascade edit. Revisit on next CSS pass. |
| R4 L-1 | `registerWindow` idempotent-replay still broadcasts | Returns existing ordinal on duplicate `onCreated` but fires a `SCOPE.WINDOW_MAP` broadcast anyway. Wastes one IPC round-trip per duplicate. Benign; no correctness impact. |
| R4 L-5 | `clearFilter()` does not reset `_activeWindowFilter` | Arguably correct (orthogonal filter axes) but UX-ambiguous. Needs [product-manager] review before a code change. |
| Retrospective | Bare-string `scope === 'items' \| 'groups' \| 'liveState'` comparisons still exist in sidepanel | Only the `WINDOW_MAP` branch uses `SCOPE.*`. Full sweep to `SCOPE.ITEMS` / `SCOPE.GROUPS` / `SCOPE.LIVE_STATE` / `SCOPE.PREFERENCES` added as Sprint 14 retro Action Item. |
| Retrospective | Dark-mode `:focus-visible` using `--accent-subtle` anti-pattern | UAT-D1 surfaced one instance. Other elements may have the same issue — cross-sprint CSS audit queued as retro Action Item. |
| R4 H-3 context | `shared/scopes.js` as cross-boundary shared module was not flagged under Shared File Governance in R4 | Noted in Sprint 14 retrospective — R4 prompt update to require any new `shared/` module to be explicitly flagged by [code-reviewer]. |

None of these are SEV1 or SEV2. All are schedule-negotiable for future sprints.

## 29. B-059 — Allow Duplicate URLs with Soft-Warn UI (R2 Design)

### 29.1 Overview

B-059 is the UI-and-contract half of the B-057 duplicate-URL policy reversal. B-058 relaxes the scheme allowlist at the data layer; B-059 removes the last remaining storage-boundary gate that contradicts PRD §3.3 — the `ERR_DUPLICATE_URL` hard-reject in `MSG_PROMOTE_TAB` — and replaces it with a pre-dispatch **soft-warn** confirmation surfaced by whichever sidepanel path initiated the save.

The data-layer change is deliberately minimal: a ~7-line deletion from `background/messages/storage-handlers.js:217-230`. The UX change is the substantive surface: two entry points (single-tab save via the Open-Tabs context menu; bulk Save-to-group via `_bulkMoveToGroup`) gain a confirmation step, and `ERR_DUPLICATE_URL` is repositioned from "blocking error" to "informational signal" — kept exported from `shared/errors.js` so the sidepanel's existing rejection-pattern code (see `sidepanel/sidepanel.js:2645,2960`) continues to compile even if a stale SW ever throws it during a deploy window.

This section binds every architectural decision before R3 so the [frontend-engineer] can build without replaying shape debates. Out-of-scope exclusions (search-result de-duplication per B-022, import duplicate handling per B-060, automatic "open existing" redirect) are enumerated in §29.9.

### 29.2 Data-Layer Changes

#### 29.2.1 `MSG_PROMOTE_TAB` handler — remove the reject

The current gate at `background/messages/storage-handlers.js:217-230`:

```js
// AC4: duplicate detection — check ALL stored items for a matching URL,
// regardless of whether the tab is currently claimed.
const normalizedTabUrl = safeNormalizeForMatch(url);
const allItems = await listItems();
const duplicate = allItems.find(
  (it) => safeNormalizeForMatch(it.url) === normalizedTabUrl,
);
if (duplicate) {
  throw new StorageError(ERR_DUPLICATE_URL, 'promoteTab: an item with this URL already exists');
}
```

is **deleted in its entirety**. The promote path becomes:

```js
// post-B-058 / B-059: scheme validation happens inside createItem → normalizeUrl;
// duplicate-URL detection is a UI concern, handled client-side BEFORE dispatch
// (§29.3). The SW unconditionally accepts a promote request for any valid URL.
const newItem = await createItem({ title: tab.title || url, url, groupId });
await claimTabForItem(newItem.id, p.tabId);
return newItem;
```

The per-item `safeNormalizeForMatch` loop over `listItems()` is eliminated — a nontrivial perf win on large collections (was O(n) per promote).

#### 29.2.2 `createItem` — verified, no change needed

`background/storage/items.js :: createItem` (entrypoint around line 25, `validateCreate` at :30, the write-transaction body below) performs **no URL-uniqueness check**. Confirmed by reading the full function and by the symmetry observation in the B-057 spike (§Memo 2 Q2): `bulkCreateItems` and `updateItem` are also duplicate-tolerant today. Post-B-059 the only ingress path that blocked duplicates (promote) joins the others. No migration, no schema bump.

#### 29.2.3 `ERR_DUPLICATE_URL` constant — retained, repurposed

`shared/errors.js:28` — `export const ERR_DUPLICATE_URL = 'ERR_DUPLICATE_URL';` — **stays**. Rationale:

1. **Compilation / import stability.** `sidepanel/sidepanel.js` imports `ERR_DUPLICATE_URL` (`sidepanel/sidepanel.js` header, plus pattern-match sites at `:2645` inside `_bulkMoveToGroup` and `:2960` inside `_openOpenTabContextMenu`). Removing the constant now forces a rename cascade in the UI layer.
2. **Deploy-window safety.** A sidepanel updated in-place against a still-stale service worker (which in turn throws the old error) must not crash. The sidepanel's existing `if (code === ERR_DUPLICATE_URL)` branches are now unreachable in steady state but remain valid fall-throughs during a deploy lag.
3. **Future re-use.** B-060 (import duplicate handling) surfaces duplicate-count reporting via the import summary; `ERR_DUPLICATE_URL` is the natural vocabulary for that path if it ever needs to emit an error-like entry.

The constant becomes **informational-only**. We document this repositioning in `shared/errors.js` itself via a JSDoc comment (see §29.5) rather than deleting-and-re-adding.

#### 29.2.4 Message contract — no new constants, no wire-shape widening

`MSG_PROMOTE_TAB`'s wire contract after B-059:

| Aspect | Status |
|---|---|
| Request shape | Unchanged: `{ tabId: number, groupId?: string \| null }` |
| Success `data` | Unchanged: the created `Item` |
| Removed error code | `ERR_DUPLICATE_URL` is no longer thrown by the SW |
| Retained error codes | `ERR_VALIDATION` (bad tabId, bad groupId, scheme-denylist hit — B-058 behaviour), `ERR_NOT_FOUND` (tab or groupId missing), `ERR_SAFE_MODE`, `ERR_NOT_READY` |
| Broadcast | Unchanged: `SCOPE.ITEMS` via `MUTATION_BROADCASTS[MSG_PROMOTE_TAB]` |
| Safe-mode classification | Unchanged: `MSG_PROMOTE_TAB` remains in `WRITE_MESSAGE_TYPES` (§26.12.4) |

**No new `MSG_*` constant is introduced.** The option of a `MSG_CHECK_DUPLICATE_URL` probe was considered and explicitly rejected (§29.3.3 — "server-side probe rejected"). The client has all the state it needs in the existing `_cachedItems` snapshot.

### 29.3 Duplicate Detection — Client-Side Pre-Check (Decision)

Three placements were evaluated:

| Placement | Pro | Con | Verdict |
|---|---|---|---|
| **A. Client-side pre-check** against `_cachedItems` + `safeNormalizeForMatch` | No IPC; instant; uses an already-maintained cache; SW stays simple | Client must import `safeNormalizeForMatch` (already shared via `shared/url.js` — no new primitive); pre-check is advisory, not authoritative | **Accepted** |
| B. Server-side response field (`{ ok: true, data: { item, isDuplicate: true } }`) | Authoritative; SW has the real item list | Promote has already committed by the time the UI sees the flag — semantically weird ("duplicate saved, undo?") | Rejected |
| C. Hybrid: client probe via new `MSG_CHECK_DUPLICATE_URL` | Authoritative AND pre-confirmation | Adds a message constant, a handler, a safe-mode classification, and an extra IPC round-trip per save; re-introduces the O(n) scan we just removed from the server side | Rejected |

#### 29.3.1 Why client-side is sufficient

The saved-items list is already broadcast-driven — `_cachedItems` (`sidepanel/sidepanel.js:115`) is refreshed on every `MSG_STATE_CHANGED` scope=ITEMS broadcast (see `renderAll` consumer at `sidepanel.js:954`). Staleness is bounded by broadcast latency; in steady state it is immediate.

The soft-warn is a UX affordance, not a correctness gate. A false negative (pre-check misses an existing duplicate because the cache is mid-refresh) results in a duplicate being created without warning — which is now the **allowed** behaviour. A false positive (pre-check flags a duplicate that was just deleted in another surface) results in the user seeing a stale dialog that they can dismiss with Cancel, at which point the duplicate-that-isn't-a-duplicate flows through normally on their next attempt. Neither mode is user-hostile.

#### 29.3.2 The detection primitive

A new pure helper in `sidepanel/sidepanel.js`:

```js
/**
 * B-059: pre-dispatch duplicate-URL detection for save flows.
 * Returns the first existing saved item whose normalized URL matches `url`,
 * or null. Uses the already-maintained `_cachedItems` snapshot and the shared
 * `safeNormalizeForMatch` helper — zero IPC, O(n) over cached items (≤ 1000
 * in realistic collections, < 1ms per call).
 *
 * @param {string} url — raw URL from the tab or form
 * @returns {Item | null}
 */
function _findDuplicateSavedItem(url) {
  const normalized = safeNormalizeForMatch(url);
  if (!normalized) return null;           // unparseable URL — no match possible
  for (const it of _cachedItems) {
    if (safeNormalizeForMatch(it.url) === normalized) return it;
  }
  return null;
}
```

Import `safeNormalizeForMatch` from `shared/url.js` at the top of `sidepanel.js`. This is a **new sidepanel import** — flag under Shared File Governance (CLAUDE.md) for R4 cross-boundary review; however no shape of `shared/url.js` is changed (pure read of an existing exported function).

#### 29.3.3 Why NOT introduce `MSG_CHECK_DUPLICATE_URL`

Evaluated and rejected:

- **Extra IPC round-trip per save.** Every save would incur SW wake-up if cold. Breaks the "single IPC per user action" pattern the sidepanel optimises for elsewhere.
- **Re-introduces the O(n) scan we just removed from the SW.** A probe handler would need to `await listItems()` and scan — exactly what B-059's data-layer change eliminates.
- **New constant, new safe-mode entry, new test surface.** All for an advisory UX hint that the client can compute locally against state it already has.
- **Staleness is worse, not better.** A "fresh" probe still races `MSG_STATE_CHANGED` broadcasts. There is no IPC-level way to serialize "read latest items + show dialog + dispatch promote" atomically.

### 29.4 Soft-Warn UI — Dialog Pattern (Decision)

Three presentations were evaluated:

| Option | Pro | Con | Verdict |
|---|---|---|---|
| **A. Modal confirm dialog** (reuse `openConfirmDialog`, B-024 C-2 pattern) | Consistent with existing destructive-action confirmations; focus-trapped; keyboard-first; a11y-ready; handles Shift+Tab/Escape correctly | Interrupts flow | **Accepted** |
| B. Inline toast with Save/Cancel buttons | Less interruption | New toast variant, no existing pattern with action buttons; accessibility requires role=alertdialog-like treatment — roughly equivalent work to A with weaker affordances | Rejected |
| C. Silent save + post-hoc "duplicate saved — open existing?" toast | Simplest | Contradicts PRD "user-initiates-intentionally" model; no way to Cancel; fails B-059 AC ("Save anyway?" confirmation required) | Rejected |

#### 29.4.1 Why Option A

`openConfirmDialog(item, onConfirm, { triggerEl, heading, body })` at `sidepanel/sidepanel.js:371` already supports:

- Custom heading + body via the options bag (B-024 C-2).
- Focus trap (via `_activateFocusTrap`).
- Keyboard navigation (Tab / Shift+Tab / Escape) with explicit focus to Cancel on open (`confirmCancelBtnEl.focus()`).
- Trigger-element focus restoration on close.
- Dialog-open guard interplay with Escape-to-clear-selection (B-024 H-1).

All of these are load-bearing invariants we would otherwise re-implement for a toast-with-action-buttons. The only affordance we give up is "feels less modal" — and for a save operation that creates persistent state, a modal is the correct weight.

#### 29.4.2 Copy and variants

Two variants of the soft-warn dialog, both routed through `openConfirmDialog`:

**Variant 1 — single-tab save (Open-Tabs row context menu "Save to group"):**

| Field | Copy |
|---|---|
| Heading | `URL already saved` |
| Body | `This URL is already saved as "${existing.title}" in ${groupLabel}. Save another copy?` |
| Cancel button | "Cancel" (the existing default) |
| Confirm button | "Save anyway" |

`groupLabel` is derived via a small helper:
```js
function _groupLabelForItem(item) {
  if (!item.groupId) return 'Ungrouped';
  const g = _cachedGroups.find((gr) => gr.id === item.groupId);
  return g ? g.name : 'Ungrouped';
}
```

The confirm button label change ("Save anyway" instead of the default "Delete") requires a third option on `openConfirmDialog`. See §29.4.4 for the minimal signature extension.

**Variant 2 — bulk Save-to-group with mixed selection (some tabs duplicate, some not):**

| Field | Copy |
|---|---|
| Heading | `${dupCount} of ${totalCount} tabs already saved` |
| Body | `${dupCount} of the ${totalCount} selected tabs have URLs that already exist in your saved items. What would you like to do?` |
| Button 1 | "Save all (${totalCount})" |
| Button 2 | "Skip duplicates (${totalCount - dupCount})" |
| Button 3 | "Cancel" |

This is **three-button**, not two. The existing `openConfirmDialog` is hard-wired to two buttons (confirmCancelBtnEl, confirmDeleteBtnEl — see `sidepanel.html`). See §29.6 for the bulk-flow decision that avoids needing a three-button dialog.

#### 29.4.3 A11y

- `heading` → `role="alertdialog"`-compatible via the existing confirm dialog structure (inherits from B-024 C-2).
- "Save anyway" is NOT a destructive action — it MUST NOT use the destructive-red treatment reserved for Delete. Use the primary-button affordance instead. Implementation: add a `variant: 'primary' | 'destructive'` option to `openConfirmDialog` (default `'destructive'` preserves backward compat for the delete path; B-059 passes `'primary'`).
- Focus: Cancel on open (existing behaviour — preserves the "safer default" convention). User must explicitly Tab or arrow-key to Save.
- Dismissal: Escape = Cancel (existing behaviour).

#### 29.4.4 Minimal `openConfirmDialog` signature extension

```js
function openConfirmDialog(item, onConfirm, {
  triggerEl = null,
  heading,
  body,
  confirmLabel,    // NEW (B-059): override default "Delete" button text
  variant = 'destructive', // NEW (B-059): 'primary' | 'destructive' — styles the confirm button
} = {}) {
  // ... existing body unchanged ...
  confirmDeleteBtnEl.textContent = confirmLabel || 'Delete';
  confirmDeleteBtnEl.dataset.variant = variant;
  // ... CSS reads [data-variant="primary"] to swap the button colour ...
}
```

Two tiny additions to the options bag. Defaults preserve existing callers. CSS: `.confirm-btn[data-variant="primary"] { background: var(--accent); color: var(--on-accent); }` mirroring the existing primary button style.

### 29.5 Error Code Semantics — `ERR_DUPLICATE_URL` Repositioned

Decision: **reposition, do not remove.** Documented via JSDoc in `shared/errors.js`:

```js
/**
 * B-059: Retained for deploy-window compatibility (stale SW may still throw this
 * during a rolling update). Post-B-059 the storage layer NEVER throws this code
 * — duplicate URLs are allowed at the data layer; the soft-warn confirmation UI
 * in the sidepanel handles user-facing disambiguation (see SOLUTION_DESIGN §29).
 * Surface any incoming ERR_DUPLICATE_URL as an informational toast, not a
 * blocking error.
 */
export const ERR_DUPLICATE_URL = 'ERR_DUPLICATE_URL';
```

The sidepanel's existing `if (code === ERR_DUPLICATE_URL) showToast('A bookmark with this URL already exists')` branches (`sidepanel.js:2645,2960`) are unreachable in steady state post-B-059 but remain valid and correct. They will be exercised only if a stale SW and new sidepanel run against each other during a deploy — benign, no user-visible regression.

#### 29.5.1 Why not a `{ isDuplicate: true }` field on the response?

Considered: having the SW return `{ ok: true, data: { item, isDuplicate: true } }` so the UI can show a post-hoc toast. Rejected because:

- The promote has already committed; there is no meaningful "undo" flow that isn't hostile.
- The soft-warn needs to come BEFORE the save so Cancel actually cancels.
- Client-side pre-check (§29.3) already achieves the correct timing.

No response-shape widening.

### 29.6 Bulk-Promote Integration

#### 29.6.1 Current state

`_bulkMoveToGroup(groupId)` at `sidepanel/sidepanel.js:2620` today:

1. Partitions `_selection` into `{ itemIds, tabIds }`.
2. Early-returns on mixed selection (AC12 intersection rule).
3. For all-tabs path: `Promise.allSettled` of `MSG_PROMOTE_TAB` calls per tab.
4. Aggregates rejection codes into a categorised toast (`duplicates`, `restrictedSchemes`, `safeModeHit`, `otherFailures`).

Post-B-059 the `duplicates` count will always be zero (the SW never rejects for duplicate). The categorised toast still handles `restrictedSchemes` (B-058 denylist — `javascript:`, `data:`) and real errors.

#### 29.6.2 Pre-filter flow (Decision)

Two flow options:

| Flow | Pro | Con | Verdict |
|---|---|---|---|
| **Pre-filter** — client scans selected tabs against `_cachedItems`; if duplicates found, show aggregate confirm; dispatch only the allowed subset | Fewer IPCs; user sees the decision BEFORE commit; matches single-tab soft-warn semantics | Requires aggregate dialog UX | **Accepted** |
| Post-result — dispatch everything, categorise rejections (pre-B-059 behaviour) | Zero new UX | Dialog-less save of duplicates contradicts the B-059 soft-warn requirement | Rejected |

#### 29.6.3 Aggregate dialog — two-button, not three

§29.4.2 Variant 2 sketched a three-button dialog. Rather than extend `openConfirmDialog` to handle three buttons, we decompose the flow into two sequential confirms using the existing two-button primitive, short-circuited on Cancel:

**Step 1 — summary + choice:**

| Field | Copy |
|---|---|
| Heading | `Save ${totalCount} tabs?` |
| Body | `${dupCount} of these ${totalCount} tabs are already saved as bookmarks. Saving will create additional copies.` |
| Cancel | "Cancel" (aborts everything — no saves) |
| Confirm | `Skip duplicates, save ${totalCount - dupCount}` (primary action) |

If the user wants to save all (duplicates included), they hold a modifier key — **rejected** as too-hidden. Instead, the dialog wires a small secondary link below the body: `Save all ${totalCount} including duplicates`. Clicking it dispatches the full selection without a second confirm.

Wait — adding a third action via a link below the body re-introduces the three-choice problem through a side door. Re-evaluating:

**Simpler decomposition (accepted):**

- If `dupCount === 0` (no duplicates): no dialog. Proceed as today (current `_bulkMoveToGroup` path).
- If `dupCount > 0`:
  1. Show a single-dialog confirm with Cancel + `Save all ${totalCount} anyway`.
  2. User chooses Cancel → abort; or `Save all` → dispatch all.

This matches the **single-tab soft-warn model** (one confirm per initiated save action). "Skip duplicates" as an opt-in variant is **deferred** (§29.9 — out of scope for B-059; can revisit if UAT or user feedback surfaces demand). The copy:

| Field | Copy |
|---|---|
| Heading | `${dupCount} of ${totalCount} tabs already saved` |
| Body | `${dupCount} of the ${totalCount} selected tabs have URLs that are already saved. Saving will create additional copies alongside the existing ones.` |
| Cancel | "Cancel" |
| Confirm | `Save all ${totalCount}` — variant: primary |

This keeps the dialog signature two-button and reuses the existing `openConfirmDialog` (with the §29.4.4 `confirmLabel` + `variant` additions). One dialog, one decision, consistent with the single-tab flow. Bulk "skip duplicates" falls out of scope; if demanded later it becomes a preference or a second button, added then.

#### 29.6.4 Implementation sketch for `_bulkMoveToGroup`

```js
async function _bulkMoveToGroup(groupId) {
  _pruneStaleSelection();
  const { itemIds, tabIds } = _partitionSelection();
  if (itemIds.length > 0 && tabIds.length > 0) return;  // mixed — hidden by UI

  if (tabIds.length > 0) {
    // B-059: client-side duplicate pre-scan.
    // Build a URL→existing-item lookup from _cachedItems, normalized.
    const duplicates = [];
    for (const tabId of tabIds) {
      const tab = _cachedOpenTabsById.get(tabId);
      if (!tab) continue;
      const existing = _findDuplicateSavedItem(tab.url);
      if (existing) duplicates.push({ tabId, existing });
    }

    const proceed = async () => {
      // ... existing Promise.allSettled dispatch unchanged ...
    };

    if (duplicates.length === 0) {
      proceed();
      return;
    }

    openConfirmDialog(
      { title: tabIds.length + ' tabs' },
      proceed,
      {
        heading: duplicates.length + ' of ' + tabIds.length + ' tabs already saved',
        body:
          duplicates.length + ' of the ' + tabIds.length + ' selected tabs have URLs that are already saved. ' +
          'Saving will create additional copies alongside the existing ones.',
        confirmLabel: 'Save all ' + tabIds.length,
        variant: 'primary',
      },
    );
    return;
  }

  // ... existing itemIds-only bulk move path unchanged ...
}
```

Changes confined to the tabIds branch. The existing `Promise.allSettled` + categorised-toast code is wrapped in `proceed` and invoked either directly (no duplicates) or as the confirm callback (duplicates present).

#### 29.6.5 Single-tab flow in `_openOpenTabContextMenu`

`saveSelect.addEventListener('change', () => ...)` at `sidepanel/sidepanel.js:2952` currently dispatches `MSG_PROMOTE_TAB` directly. Post-B-059:

```js
saveSelect.addEventListener('change', () => {
  const groupId = saveSelect.value || null;
  const tab = _cachedOpenTabsById.get(tabId);
  const existing = tab ? _findDuplicateSavedItem(tab.url) : null;
  closeContextMenu(); // close synchronously — matches B-055 H-5

  const dispatchSave = () => {
    sendMessage(MSG_PROMOTE_TAB, { tabId, groupId }).catch((err) => {
      // ... existing error handling unchanged ...
    });
  };

  if (!existing) {
    dispatchSave();
    return;
  }

  openConfirmDialog(
    { title: tab?.title || tab?.url || 'this tab' },
    dispatchSave,
    {
      heading: 'URL already saved',
      body:
        'This URL is already saved as "' + existing.title + '" in ' +
        _groupLabelForItem(existing) + '. Save another copy?',
      confirmLabel: 'Save anyway',
      variant: 'primary',
    },
  );
});
```

#### 29.6.6 Cache availability

`_cachedOpenTabsById` (`sidepanel/sidepanel.js:130`) and `_cachedItems` (`:115`) are both populated on every `MSG_LIST_ITEMS` response via `renderAll` / `_setCachedOpenTabs` / `refetchAndPatchLiveState`. Both are guaranteed non-empty at the time the context menu opens (the context menu requires rendered rows, which requires a completed `MSG_LIST_ITEMS` response). No cold-start race surface for the pre-check.

### 29.7 Floating-Group Reassociation — Verified No-Change

`background/tabs/floating-groups.js:91-96`:

```js
const normalizedStored = safeNormalizeForMatch(record.url);
for (const [tabId, entry] of liveTabIndex) {
  if (claimedTabIds.has(tabId)) continue;
  if (safeNormalizeForMatch(entry.url) === normalizedStored) {
    // ... tie-break on (windowId, tabIndex) ...
  }
}
```

Already handles the duplicate-URL case via the B-018 H-2 fix: when multiple live tabs match a single floating-group record's URL, the `(windowId, tabIndex)` tuple tie-break selects the most-likely-correct one and the `claimedTabIds` guard prevents any tabId from being claimed twice. Conversely, when a single live tab matches multiple floating-group records, the first record wins and subsequent records remain unresolved on disk until a fresh matching tab appears.

B-059's data-layer change (allowing duplicate URLs in `PARTITION_ITEMS`) widens the saved-items input to this logic but introduces no new ambiguity the existing disambiguation doesn't already handle. **No code change required** — covered by the §29.8 regression test.

### 29.8 Test Strategy for R5

| # | Path | Cases |
|---|------|-------|
| T-1 | **Single-tab save — no duplicate** (happy path regression) | Context-menu "Save to group" on a tab whose URL doesn't match any saved item → no dialog shown; `MSG_PROMOTE_TAB` dispatched directly; item appears in target group. |
| T-2 | **Single-tab save — duplicate, user confirms** | Context-menu save on a tab whose URL matches an existing item → dialog appears with correct heading/body/groupLabel; user clicks "Save anyway" → `MSG_PROMOTE_TAB` dispatched; second item created; both items now in `_cachedItems`. |
| T-3 | **Single-tab save — duplicate, user cancels** | Same setup as T-2 → user clicks Cancel → no message dispatched; no new item in storage; dialog closes; focus restored to trigger row. |
| T-4 | **Bulk save — no duplicates** | Select 3 open tabs, none matching saved items → bulk bar "Move to group" → no dialog; existing per-tab Promise.allSettled path runs; toast on failures only. |
| T-5 | **Bulk save — mixed duplicates + unique** | Select 5 open tabs where 2 URLs match existing items → aggregate dialog appears ("2 of 5 tabs already saved"); user confirms "Save all 5" → 5 `MSG_PROMOTE_TAB` calls fire; 5 new items created (the 2 duplicates produce duplicate saved items). |
| T-6 | **Bulk save — all duplicates, user cancels** | Select 3 tabs all matching saved items → dialog "3 of 3 tabs already saved" → Cancel → no messages dispatched. |
| T-7 | **Data-layer regression — SW no longer throws `ERR_DUPLICATE_URL`** | Unit test: call the `MSG_PROMOTE_TAB` handler directly with a tab URL that matches an existing item → handler returns `{ ok: true, data: <Item> }`; asserts no throw, no `ERR_DUPLICATE_URL`. |
| T-8 | **URL normalization boundary** | Two URLs differing only by fragment (`https://example.com#a` vs `https://example.com#b`) considered duplicates (per `safeNormalizeForMatch`'s `forMatch: true` stripping hashes). Document in test assertion; if PM later decides fragments should matter, change `safeNormalizeForMatch` (out of B-059 scope). |
| T-9 | **Floating-group reassociation — duplicate URLs + multiple live tabs** | Two saved items with identical URL, one floating record pointing at one of them; two live tabs matching that URL. On reconcile, the floating record resolves to the tab with matching `(windowId, tabIndex)` and the other tab remains in Open Tabs. Confirms B-018 H-2 still holds. |
| T-10 | **Client cache staleness edge case** | Create item A via the dialog; immediately (before broadcast settles) dispatch a context-menu save of a tab with A's URL. Assert: worst case no warn shown (false negative — duplicate created silently, which is the allowed behaviour); best case dialog shown. No crash, no uncaught rejection. |

Test locations:
- T-1..T-6: `tests/b059-duplicate-warn.test.js` (new, sidepanel UI tests via the chrome-mock + DOM).
- T-7: extend `tests/promote-tab.test.js` (existing file — adapt the line-57-58 duplicate check which currently asserts a reject).
- T-8: extend `tests/url-normalize.test.js` if not already covered.
- T-9: extend `tests/b010-live-state.test.js` OR a new `tests/b018-disambiguation.test.js` with a duplicate-URL scenario (grep shows B-018 coverage is currently implicit).
- T-10: unit-level in `tests/b059-duplicate-warn.test.js`.

All tests must pass `MAX_BULK_INPUTS` / safe-mode / same-origin sender gates inherited from B-024 and B-055 (no new contracts to cover there).

### 29.9 Out-of-Scope — Explicitly Excluded

The following are **not** in scope for B-059. Implementing any of them is scope creep:

- **Search-result URL de-duplication (B-022).** Quick-search and inline-filter results show all items with distinct ids, including duplicates; aggregation-by-URL with group badges is a separate product decision deferred to B-022's implementation.
- **Import duplicate handling (B-060).** B-060 owns the HTML/JSON import flow's skip-vs-allow policy, progress summary, and preference persistence. B-059 does NOT touch `MSG_BULK_CREATE_ITEMS` or the import UI.
- **"Open existing" redirect** — when the user clicks Save and a duplicate exists, offering a "Open the existing saved item instead" action is a plausible future UX but requires extra affordances (button copy, focus management) and is not required by the B-059 AC.
- **Bulk "Skip duplicates" as a distinct action.** Explored and deferred (§29.6.3). The two-button dialog handles Cancel + Save-all; a three-button variant (Skip-duplicates) would either require a primitive extension or a second dialog. Ship without it; revisit if UAT demand emerges.
- **Preference-driven global "warn on duplicate" toggle.** Not requested in the B-059 AC; user behaviour is already initiated-per-save, so always-warn-on-duplicate is the simple correct default.
- **Pre-flight duplicate check on manual `MSG_CREATE_ITEM` (B-003 bookmark dialog).** The B-003 form-submit path does NOT pre-check for duplicates today (matches the "duplicates allowed" stance retroactively). B-059 confines the soft-warn to the promote-from-tab paths. If the PM decides manual create should also warn, add a parallel call site — trivial extension — but not required by the current AC.

### 29.10 R2 Correctness Checklist

| # | Check | Status | Reasoning |
|---|-------|--------|-----------|
| C-1 | Storage schema versioned | **N/A (PASS)** | No new partition, no new field on persisted shapes, no `KNOWN_VERSION` bump, no migration. `PARTITION_ITEMS` continues to tolerate duplicate URLs as it already does today — B-059 just removes the one reject-at-ingress gate that contradicted that tolerance. `ERR_DUPLICATE_URL` string constant retained but reclassified (§29.2.3, §29.5). |
| C-2 | Message contracts typed | **PASS** | `MSG_PROMOTE_TAB` wire shape unchanged (§29.2.4). `ERR_DUPLICATE_URL` is no longer in the handler's error-throw set — documented in-line in `shared/errors.js` (§29.5). No new `MSG_*` constants introduced; `MSG_CHECK_DUPLICATE_URL` explicitly rejected (§29.3.3). No widening of any response shape. `shared/messages.js` typedef requires no edit — the contract is strictly narrower (fewer error codes), not wider. |
| C-3 | Service worker cold-start safe | **PASS** | SW changes are deletions only — the handler becomes simpler, not more cold-start-dependent. Client-side pre-check consumes `_cachedItems`, which is populated by the existing `MSG_LIST_ITEMS` cold-fetch; before that first response, no context menu or bulk action is reachable (rows not yet rendered). `_findDuplicateSavedItem` guards against empty/unparseable URL inputs (`safeNormalizeForMatch` returns `''` on failure — `if (!normalized) return null`). No assumption of SW in-memory state beyond what the existing handler already required. |
| C-4 | ID stability | **PASS** | No impact. Duplicate saved items are new `Item` records with distinct ULIDs (`background/storage/ids.js`). Item identity (`id`) is independent of URL — B-059 exercises the intended separation. No opportunity for ephemeral ids (tabId, windowId) to leak into storage via this path. Claims mirror is `itemId`-keyed, not URL-keyed (see §10.5). |
| C-5 | Manifest file references resolvable | **N/A (PASS)** | No `manifest.json` changes. No new `default_path`, no new permissions, no new `commands`. Existing sidepanel/SW entries unaffected. |

### 29.11 Rollback Plan

**No storage schema change. No permission change. No data migration. No wire-contract widening.** Rollback is a straightforward `git revert` of the B-059 commit(s).

Specifically:

- Reverting `background/messages/storage-handlers.js` restores the `ERR_DUPLICATE_URL` reject at `:217-230`. Any duplicate URLs created during B-059's lifetime remain in storage — they are not corrupt, they are user-intended duplicates (`createItem` has always tolerated them; B-059 just removed the one path that didn't). Post-rollback, a user trying to promote one of those duplicate tabs will hit `ERR_DUPLICATE_URL` as before — benign regression.
- Reverting `sidepanel/sidepanel.js` removes `_findDuplicateSavedItem`, `_groupLabelForItem`, the `openConfirmDialog` signature extension, the soft-warn dialog wiring in `_openOpenTabContextMenu` and `_bulkMoveToGroup`. Single-tab and bulk saves return to their pre-B-059 error-toast-on-reject behaviour. The unchanged `if (code === ERR_DUPLICATE_URL) showToast(...)` branches at `:2645,2960` once again do useful work.
- Reverting `shared/errors.js` JSDoc change is no-op at runtime.
- Reverting `sidepanel/sidepanel.css` removes the `[data-variant="primary"]` confirm button style. Existing destructive-variant styling unaffected.
- No `chrome.storage.local` / `chrome.storage.session` cleanup needed.

**User-visible consequence of rollback:** Any items-with-duplicate-URL created during the B-059 window remain saved; they behave normally in navigation, drift detection, claims, reassociation, delete, edit. Only re-promoting one of them (i.e., opening the same tab again post-rollback) hits the restored reject. This is acceptable — no data loss, no corruption, a minor UX regression.

### 29.12 Flagged Risks

**None warrant tier upgrade.** All architectural decisions above are local refinements of existing infrastructure; no new storage partition, no new message constant, no new manifest permission. The three most common XL-escalation triggers are absent.

**Medium-severity risks tracked (not blockers):**

1. **Overwhelming dialog on large bulk-save selections.** A selection of 50 open tabs with 40 duplicates shows a dialog "40 of 50 tabs already saved" — arguably user-hostile at that scale. Mitigation: the selection is already UI-capped by `MAX_BULK_INPUTS` at the SW boundary; realistic duplicate-heavy selections are small. If UAT surfaces pain, a second-sprint enhancement can paginate the dialog body or switch to per-duplicate toast. Out of scope for B-059.
2. **Pre-check stale against a mid-refresh `_cachedItems`.** If the user creates an item in one surface (newtab) and immediately saves the same URL from the sidepanel context menu before the `MSG_STATE_CHANGED` broadcast settles, the soft-warn will be missed. The duplicate is still created (the desired post-B-059 behaviour), just without warning. Acceptable — documented in §29.3.1 and covered by test T-10.
3. **`safeNormalizeForMatch` fragment-stripping policy.** Two URLs differing only by fragment are treated as duplicates (the warn fires). This is consistent with every other match path in the codebase (drift, claims, floating-groups) but may surprise users who intentionally bookmark `https://example.com#section-a` and `https://example.com#section-b` as distinct entries. PRD does not define fragment-sensitivity at this granularity; current unified-normalization policy wins. Document in §29.9 and the user manual as an explicit known behaviour. If PM revisits: a `forMatch` vs `forStorage` split already exists in `normalizeUrl` (`shared/url.js`) — the fix would be a new `forDuplicateCheck: true` mode that preserves fragments. Out of scope for B-059.
4. **Soft-warn vs `_openOpenTabContextMenu` close timing.** The menu is closed synchronously (matches B-055 H-5) before `openConfirmDialog` opens. This is correct — the dialog is a separate modal — but the `_dialogTriggerEl` focus-restore target should be the original row, not the (now-removed) menu item. Implementation: capture `row` (the trigger row from `_contextMenuTriggerRow` or the function parameter) and pass it as `triggerEl` to `openConfirmDialog`. Cheap; called out so the [frontend-engineer] doesn't miss it.

No SEV1/SEV2 risks identified. Proceed to R3 build.

### 29.13 Handoff Notes for [frontend-engineer] R3

**File touchpoints (exhaustive):**

| File | Nature |
|---|---|
| `background/messages/storage-handlers.js` | Delete the 7-line `ERR_DUPLICATE_URL` reject block (:217-230); `safeNormalizeForMatch` import may become unused in this file — if so, remove the import to keep the file clean (grep confirms it's used only in that block). |
| `shared/errors.js` | Add JSDoc comment above `export const ERR_DUPLICATE_URL` explaining the repositioning (see §29.5 snippet). Constant value unchanged. |
| `sidepanel/sidepanel.js` | Add `import { safeNormalizeForMatch } from '../shared/url.js'` at top. Add `_findDuplicateSavedItem(url)` + `_groupLabelForItem(item)` helpers. Extend `openConfirmDialog` signature with `confirmLabel` and `variant` options (update the one existing confirm-button render line). Wire soft-warn in `_openOpenTabContextMenu` save-select handler (:2952). Wire pre-filter + confirm in `_bulkMoveToGroup` tabIds branch (:2628). |
| `sidepanel/sidepanel.css` | Add `.confirm-btn[data-variant="primary"]` style mirroring existing primary-button colours. |
| `tests/promote-tab.test.js` | Update the existing "rejects duplicate" test to assert the new behaviour (success, not reject). Rename the test if the old name no longer describes it. |
| `tests/b059-duplicate-warn.test.js` (new) | T-1..T-6 and T-10 from §29.8. |
| `tests/b010-live-state.test.js` | Extend with T-9 floating-group duplicate-URL regression (if no better home). |

**Suggested implementation order (small → big):**

1. **Data-layer change first.** Delete the SW reject and update `tests/promote-tab.test.js`. Zero-risk; test suite must stay green. (XS)
2. **JSDoc comment on `shared/errors.js`.** No-op runtime. (XS)
3. **`openConfirmDialog` signature extension + CSS primary-button variant.** Tested in isolation by re-running the existing delete-confirm tests — should still pass. Adds new affordance for B-059. (S)
4. **`_findDuplicateSavedItem` + `_groupLabelForItem` helpers.** Pure, unit-testable. Write T-1..T-3 test cases alongside. (S)
5. **Single-tab wiring in `_openOpenTabContextMenu`.** Smaller, more contained than bulk. Exercises the helper end-to-end. Finish T-1..T-3. (S-M)
6. **Bulk wiring in `_bulkMoveToGroup`.** Builds on the helper. Finish T-4..T-6. (M)
7. **T-9 floating-group regression test** — sanity check. (XS)
8. **T-10 staleness edge case test.** (XS)
9. **R4 review prep: verify no CSP issue (no inline JS introduced), no new permissions, no new `innerHTML` writes (dialog copy goes through `textContent` via existing `confirmBodyEl.textContent` path).**

**Non-obvious gotchas:**

- **`_cachedItems` freshness in sidepanel.** Only items from `MSG_LIST_ITEMS` responses — confirmed via `renderAll` at `:954`. This cache IS kept fresh via the broadcast listener; no extra hydration needed. But if the sidepanel is opened for the first time, the context menu and bulk bar are only reachable after first render, so the cache is guaranteed populated before any save attempt.
- **`_findDuplicateSavedItem` must handle unparseable URLs.** `safeNormalizeForMatch('')` returns `''`; the function's early `if (!normalized) return null` keeps that case from falsely matching other unparseable URLs. Don't optimise this check out.
- **Dialog focus-restore on Cancel.** Existing `openConfirmDialog` restores focus to `_dialogTriggerEl` on close. Pass the invoking row element as `triggerEl` so cancelling the B-059 dialog returns focus to the Open Tabs row, not to the now-closed context menu's phantom target.
- **`confirmDeleteBtnEl`'s dataset attribute** must be cleared between calls (stale `data-variant="primary"` leaking to a subsequent delete confirm would paint the delete button blue). Cleanest: always assign `dataset.variant = variant` (where `variant` defaults to `'destructive'`) at open time — no reset-on-close needed.
- **Ordering of `closeContextMenu()` vs `openConfirmDialog()`.** Close the menu synchronously first (matches B-055 H-5); the dialog is a separate modal and does not interact with the menu's focus trap.
- **Error-toast branches at `:2645,2960`.** Leave them — they remain correct fall-throughs during deploy-window staleness (§29.5).

### 29.14 Deviations From R2 (R6 Close — As-Built Record)

All R2 decisions in §29.1–§29.13 shipped as designed. Deviations and post-build clarifications are recorded below.

#### 29.14.1 CSS selector corrected to match live markup

§29.4.4 and §29.13 proposed the primary-variant CSS rule as `.confirm-btn[data-variant="primary"]`. The confirm-button class in `sidepanel.html` is actually `.dialog-btn--danger`, so the shipped rule is `.dialog-btn--danger[data-variant="primary"]` at `sidepanel/sidepanel.css:749` (with a matching `:hover` at `:755`). Visual outcome is identical to the R2 intent; only the selector was adjusted to match the existing DOM class. The `data-variant` dataset contract on `confirmDeleteBtnEl` is unchanged from §29.4.4.

#### 29.14.2 Dark-theme primary-button contrast — deferred to B-062

R4 [qa-reviewer] UAT-9 measured `--accent: #60a5fa` on `#ffffff` at ~2.3:1 in dark theme, below WCAG AA (4.5:1). Root cause is the `--accent` token itself (set in Sprint 2 via B-003/B-006 on `.dialog-btn--primary`), not new code introduced by B-059. B-059 inherits the gap; it does not introduce it. A new backlog item **B-062** (P1, S) was filed for Sprint 16 to perform a whole-app primary-button contrast audit (light + dark) and either darken the dark-theme accent or introduce a dedicated `--accent-on-surface` token. B-059 shipped with the inherited gap; UAT-9 recorded as WARN, not FAIL, per the UAT plan at `docs/UAT_B-059.md:192-205`.

#### 29.14.3 T-7 tightened to exercise the real SW dispatcher

R4 [qa-reviewer] M-4 flagged that the original T-7 in `tests/promote-tab.test.js` wrapped `promoteTab` in a local harness rather than going through `chrome.runtime.onMessage`. A second T-7 case was added at `tests/promote-tab.test.js:212` ("B-059 T-7: MSG_PROMOTE_TAB real dispatcher does NOT throw ERR_DUPLICATE_URL on duplicate URL") that imports `registerStorageHandlers` and dispatches via `chrome.runtime.onMessage._listeners`, asserting `ok: true` on a duplicate URL. Any re-introduction of the `ERR_DUPLICATE_URL` reject inside the real dispatch path now breaks the build.

#### 29.14.4 T-9 coverage — no new test file created

§29.8 suggested extending `tests/b010-live-state.test.js` or creating `tests/b018-disambiguation.test.js` for T-9 (floating-group reassociation + duplicate URLs). [test-engineer] confirmed existing coverage is sufficient:

- `tests/tab-claims-disambiguation.test.js` — 3 items / 2 tabs same URL.
- `tests/b018-persistence.test.js:258-290` — B-018 H-2 disambiguation path with duplicate URLs.

No new test file was created. The `_reconcileFloatingRecords` / claims-mirror paths are unchanged by B-059 (§29.7), so re-asserting them would duplicate existing coverage.

#### 29.14.5 `_isUnsavableScheme` extracted to `shared/url.js` (cross-reference from B-061)

Originally inlined in `sidepanel.js`, R4 [code-reviewer] M-1 on B-061 flagged policy drift risk between the sidepanel's `UNSAVABLE_SCHEME_PATTERN` and the storage layer's `ALLOWED_URL_SCHEMES`. The helper was relocated to `shared/url.js:54` as `isUnsavableScheme(url)` — colocated with the allowlist so drift is visible at review time. This is a B-061 detail; it is documented here because B-059 and B-061 ship together in Sprint 15 and both touch the promote-tab UX entry surface.

#### 29.14.6 Storage-handler comment documents the reposition

`background/messages/storage-handlers.js:216-219` carries an in-file comment describing the B-059 reposition (soft-warn handled client-side; `ERR_DUPLICATE_URL` retained in `shared/errors.js` for deploy-window stability). This is a minor addition beyond the "delete 7 lines" footprint in §29.13 but matches §29.5's repositioning intent.

#### 29.14.7 Final test counts

Sprint 15 baseline was 575 tests. At close: **605 pass / 0 fail** (+30). Per-item breakdown is recorded in `SPRINT.md` "Completed This Sprint" (B-058 + B-027 + B-059 + B-061). B-059 contributes T-1..T-6 + T-10 in `tests/b059-duplicate-warn.test.js`, two updated cases in `tests/promote-tab.test.js` (AC4 + the tightened T-7 real-dispatcher case), and the existing `tests/tab-claims-disambiguation.test.js` + `tests/b018-persistence.test.js` cover T-9.

#### 29.14.8 Design decisions that held without deviation

For future readers auditing the R2→R3 delta, the following landed verbatim as specified:

- SW reject deletion at `background/messages/storage-handlers.js:~217` (§29.2.3).
- `ERR_DUPLICATE_URL` constant retained in `shared/errors.js` with JSDoc reposition note (§29.2.3, §29.5).
- `_findDuplicateSavedItem(url)` + `_groupLabelForItem(item)` helpers in `sidepanel.js` (§29.3.2, §29.4.2).
- `openConfirmDialog` signature extension (`confirmLabel`, `variant`) preserving backward compat for the delete path (§29.4.4).
- Single-tab dialog copy "URL already saved" / "Save anyway" (§29.4.2 Variant 1).
- Bulk-promote two-button dialog "Save all N" / "Cancel" with "Skip duplicates" explicitly deferred (§29.4.2 Variant 2, §29.6.3, §29.9).
- No storage schema change; no manifest change; no message-contract change (§29.10, §29.11).
