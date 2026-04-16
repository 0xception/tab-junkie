# Tab Junkie — Solution Design

**Version:** 2.1
**Date:** 2026-04-16
**Owner:** [solution-architect]
**Status:** Active — B-001d + B-002 + B-006 + B-016 + B-017 + B-050 + B-019 + B-020 + B-003 + B-010 + B-008 + B-021 landed.

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

## 10. What B-001a Did NOT Ship (updated through B-001d + B-002 + B-006 + B-016 + B-017 + B-050 + B-019 + B-020 + B-021)

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

### 16.7 `refetchAndPatchLiveState` Indicator DOM Gap

Current `refetchAndPatchLiveState()` (sidepanel.js lines 556-575) only toggles `dataset.*` attributes on existing `.item-row` elements. For `live` and `active`, this works because the CSS selectors (`.item-row[data-live="true"]`, `.item-row[data-active="true"]`) operate on the row element itself.

However, for `audible` and `drifted`, the CSS selectors target *child elements* (`.item-row[data-audible="true"] .item-audible-icon`, `.item-row[data-drifted="true"] .item-drifted-icon`) that are only created during `buildItemRow()` when the state is truthy at render time. If a tab becomes audible after the initial render, setting `data-audible="true"` on the row has no effect because the `.item-audible-icon` span doesn't exist in the DOM.

**Fix**: In `refetchAndPatchLiveState`, after updating data attributes, check whether indicator elements need to be created or removed:
- If `audible` became true and no `.item-audible-icon` exists in the row: create and append the icon span inside `.item-indicators` (creating the container if needed).
- If `audible` became false and `.item-audible-icon` exists: remove it.
- Same pattern for `drifted` / `.item-drifted-icon`.

This keeps the "no full re-render" contract while ensuring indicator icons match the data attributes.

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
| `tabs.onUpdated` | Updates LiveTabIndex synchronously with url/audible/favIconUrl/windowId/active/index. Guards `tab/favicon-changed` broadcast to fire only when favIconUrl changes WITHOUT a simultaneous URL change (prevents double-patch on navigation). Debounces URL-change re-evaluation at 100ms per tab via `reevalTimers` Map. Cancels pending timers on tab removal. |
| `tabs.onActivated` | Deactivates previous active tab in the same window via `updateTabEntry(id, { active: false })` (never direct Map mutation). Activates new tab. Broadcasts `tab/activated`. |
| `tabs.onRemoved` | Cancels reevalTimers for the tab, then `removeTabEntry` + `releaseClaimByTab`. Broadcasts `tab/removed` after claim release. |
| `windows.onFocusChanged` | **NEW in B-010.** Fills the gap where `tabs.onActivated` does not fire on window focus switch. On `WINDOW_ID_NONE`: deactivates ALL tabs (user left the browser), broadcasts `window/blurred`. On a real windowId: deactivates tabs in non-focused windows, queries the active tab in the focused window via `chrome.tabs.query({ windowId, active: true })`, activates it AFTER the query resolves, broadcasts `window/focused`. |
| `windows.onRemoved` | Bulk timer cleanup + `removeTabsByWindow` + batch `releaseClaimByTab`. Early-returns if `!isClaimsReady()` (reconcileClaims will handle on next run). Broadcasts `tab/removed`. |

**`background/tabs/tab-claims.js`** — `buildLiveStates(items)` now includes `favIconUrl: tabEntry.favIconUrl || null` in each live-state entry (integrated from B-004). Shape: `Record<string, { live: boolean, active: boolean, audible: boolean, favIconUrl: string|null }>`.

**`background/broadcast.js`** — OQ-2 fix: removed the `console.warn('[tab-junkie:broadcast] firing:', scope, trigger)` debug line. Only the error-path `console.warn` on `sendMessage` failure remains.

#### Sidepanel layer

**`sidepanel/sidepanel.js`** — four key functions:

| Function | Purpose |
|----------|---------|
| `isSafeFaviconUrl(url)` | Allowlist helper accepting only `https://`, `http://`, `data:image/` scheme prefixes. Guards all favicon `<img>` creation against unsafe protocols (e.g., `chrome://`, `javascript:`, `file://`). |
| `buildItemRow(item, liveStates, driftRecords)` | Sets `data-item-id`, `data-live`, `data-active`, `data-audible`, `data-drifted` on the row element. Renders `<img class="item-favicon">` (with `isSafeFaviconUrl` guard + `onerror` fallback) or `<div class="item-avatar">` (first-letter + djb2 hash color). Static `aria-label` on edit/delete buttons. Indicator icons (audible, drifted) created only when state is truthy at render time. |
| `refetchAndPatchLiveState()` | Called on `MSG_STATE_CHANGED { scope: 'liveState' }`. Patches existing rows in-place (no full re-render). Error-safe: clears all stale indicators on `MSG_LIST_ITEMS` failure. Guards against detached-node race with `itemListEl.contains(row)`. Patches favicon/avatar transitions (img to avatar, avatar to img, src update) using `getAttribute('src')` comparison to avoid IDL-resolved URL false positives (H-2 fix). Calls `_ensureIndicators()` for audible DOM transitions. |
| `_ensureIndicators(row, live)` | Creates `.item-audible-icon` span when audible state transitions false-to-true post-render; removes it when audible becomes false. Creates/removes the `.item-indicators` container as needed. Inserts before `.item-actions` to maintain correct DOM order. SVG markup is hardcoded (no user data — XSS-safe). |

### 17.3 Deviations from R2 Plan (section 16)

| # | R2 Plan | What Shipped | Reason |
|---|---------|-------------|--------|
| D-1 | `WINDOW_ID_NONE` guard was "do NOT deactivate everything" (keep last-focused window highlighted) | Shipped: deactivates ALL tabs on `WINDOW_ID_NONE` and broadcasts `window/blurred` | More accurate representation — when the browser loses focus, no tab is truly "active" from the user's perspective. The next `onFocusChanged` with a real windowId re-activates correctly. |
| D-2 | R2 pseudocode used direct `entry.active = false` mutation in the onFocusChanged loop | Shipped: all mutations go through `updateTabEntry(id, { active: false })` | Consistent with the mutation contract established in B-001c; avoids bypassing any future instrumentation on `updateTabEntry`. |
| D-3 | R2 did not mention `_ensureIndicators` handling drifted icons | Shipped: `_ensureIndicators` handles audible only; drifted icon creation/removal is deferred | Drifted state transitions are rare enough that full re-render handles them. Audible transitions happen frequently (media play/pause) and required the targeted DOM approach. |
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
