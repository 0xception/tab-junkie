# Tab Junkie — Solution Design

**Version:** 1.5
**Date:** 2026-04-15
**Owner:** [solution-architect]
**Status:** Active — B-001d + B-002 + B-006 + B-016 + B-017 + B-050 + B-019 + B-020 landed.

> This document is the current source of truth for what has actually shipped.
> For the R2 *plan* (pre-build design) see `docs/design/B-001a.md`; deviations
> between that plan and the build are captured in §11 below.

---

## 1. Project Structure

Current build-relevant layout on `feature/rebuild-from-prd` (paths shipped through B-001d + B-002 + B-006 + B-016 + B-017 + B-050 + B-019 + B-020):

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
│   │   ├── partitions.js                  Partition keys, defaults, shape validators, read helpers, length caps
│   │   ├── ids.js                         Zero-dep ULID generator (strict-monotonic)
│   │   ├── errors.js                      StorageError + ERR_* constants (incl. ERR_SAFE_MODE) + isQuotaError
│   │   ├── write-transaction.js           Serialized atomic batcher — SOLE write path
│   │   ├── migration.js                   Migration runner · KNOWN_VERSION · safe-mode · quota monitor (B-001b)
│   │   ├── items.js                       Item CRUD
│   │   ├── groups.js                      Group CRUD + depth/cycle enforcement + cascade on delete
│   │   └── preferences.js                 Preferences CRUD
│   └── tabs/
│       ├── index.js                       Barrel · exports registerTabEventListeners, initializeLiveState, buildLiveStates (B-001c)
│       ├── live-tab-index.js              SW-memory Map<tabId,{url,windowId,active,audible,index}> — never written to storage.local (B-001c)
│       ├── tab-claims.js                  storage.session TabClaims mirror + reconcile/release/reevaluate + buildLiveStates + claimTabForItem (B-001c/d)
│       ├── tab-events.js                  chrome.tabs/windows event handlers + drift detection hook — zero storage.local writes (B-001c/d)
│       ├── drift.js                       Drift write/clear logic; driftedToUrl normalized via shared/url.js; fragment stripped before storage (B-001d)
│       └── floating-groups.js             Floating-group re-association: position-match → URL-fallback → retain unresolved (B-002)
├── shared/
│   ├── messages.js                        MSG_* constants (18 total, incl. MSG_GET_STATUS, MSG_PROMOTE_TAB, MSG_DEMOTE_ITEM, MSG_STATE_CHANGED, MSG_NAVIGATE_TO_ITEM, MSG_CLOSE_TABS) + envelope typedefs incl. ListItemsResponse (NO storage logic)
│   ├── constants.js                       GROUP_COLORS — 9-color allowlist palette for group color values (B-006)
│   ├── url.js                             URL normalization — normalizeUrl(url, mode) with forStorage/forMatch modes; scheme allowlist; protocol defaulting; hostname lowercasing (B-001d)
│   └── errors.js                          Canonical home for StorageError + ERR_* constants (moved from background/storage/errors.js, which now re-exports from here) (B-001d)
├── sidepanel/
│   └── sidepanel.html                     Placeholder stub — overwritten by B-022
├── newtab/
│   └── newtab.html                        Placeholder stub — overwritten by B-035
├── popup/
│   └── popup.html                         Placeholder stub — overwritten by B-036
└── tests/                                 R5 test suite (unit · integration · perf · UAT notes)
```

The HTML stubs exist only so Chrome's manifest validator can resolve
`default_path` / `chrome_url_overrides.newtab` / `action.default_popup` at
extension load time. They have no script content and will be replaced
wholesale when the corresponding UI backlog items land.

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
| `tj:floatingGroups` | Floating-group re-association records (B-002) | `FloatingGroup[]` — shape: `{ groupId: string, windowId: number, tabIndex: number, url: string, savedAt: number }` | `[]` | `storage.local` |
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

Defined in `shared/messages.js`. **18 constants total** (12 from B-001a + `MSG_GET_STATUS` added in B-001b + `MSG_PROMOTE_TAB` added in B-016 + `MSG_DEMOTE_ITEM` added in B-017 + `MSG_STATE_CHANGED` added in B-050 + `MSG_NAVIGATE_TO_ITEM` added in B-019 + `MSG_CLOSE_TABS` added in B-020). **UI must never import any file under `background/`**; the only contract is this module + `chrome.runtime.sendMessage`.

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

## 10. What B-001a Did NOT Ship (updated through B-001d + B-002 + B-006 + B-016 + B-017 + B-050 + B-019 + B-020)

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
| Sidepanel UI | **B-022** | pending | Currently a stub `sidepanel.html`. |
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
- The claimed tab is closed (`chrome.tabs.onRemoved`).
- The claimed tab's URL returns to a value that matches the item's stored URL (as determined by `normalizeUrl(url, 'forMatch')`).

### Invariants

- `tj:drift` is keyed by `itemId`, not `tabId`. At most one drift record per item exists at any time.
- Drift records do not have a TTL. Stale records (item deleted while drift exists) are cleaned up lazily during the `MSG_LIST_ITEMS` read: items absent from `tj:items` are omitted from the `driftRecords` response field.

---

## 10.8 Floating-Group Re-association Architecture (B-002)

### Overview

`background/tabs/floating-groups.js` resolves entries in `tj:floatingGroups` to currently open tabs, propagating claims for matched items. It runs on SW cold start after `reconcileClaims` completes and is also triggered when a new window opens.

### Resolution strategy

For each `FloatingGroup` record (`{ groupId, windowId, tabIndex, url, savedAt }`):

1. **Position-match:** find a live tab in `liveTabIndex` with matching `windowId` and `tabIndex`. If found and its URL matches `record.url` (via `normalizeUrl` forMatch), claim it.
2. **URL-fallback:** if the position match fails (tab moved), scan all unclaimed tabs in `liveTabIndex` whose normalized URL matches `record.url`. First match wins (first-in-array order).
3. **Retain unresolved:** if neither strategy finds a match, the `FloatingGroup` record is left in `tj:floatingGroups` unchanged. There is no TTL — unresolved records persist until explicitly cleared (documented limitation; a future cleanup sweep is tracked as tech debt).

### Tie-break and claim propagation

- **First-in-array-wins:** when multiple `FloatingGroup` records could claim the same tab, the record that appears first in the `tj:floatingGroups` array wins. Subsequent records fall through to URL-fallback or remain unresolved.
- **Claim propagation:** a successful match calls `claimTabForItem(itemId, tabId)` from `tab-claims.js`, writing the claim to `claimsMirror` and flushing to `storage.session`. The resolved record is then removed from `tj:floatingGroups` via `writeTransaction`.

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

- **Placeholder HTML stubs** in `sidepanel/`, `newtab/`, and `popup/`.
  Chrome's manifest validator resolves `default_path`,
  `chrome_url_overrides.newtab`, and `action.default_popup` at extension
  load time — loading the unpacked extension for UAT failed until the
  stubs existed. These are empty placeholders and will be overwritten by
  B-022 / B-035 / B-036.
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
