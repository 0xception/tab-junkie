# Tab Junkie — Solution Design

**Version:** 1.1
**Date:** 2026-04-15
**Owner:** [solution-architect]
**Status:** Active — B-001a landed (R6 close). Downstream items (B-001b/c/d, B-053) will amend.

> This document is the current source of truth for what has actually shipped.
> For the R2 *plan* (pre-build design) see `docs/design/B-001a.md`; deviations
> between that plan and the build are captured in §11 below.

---

## 1. Project Structure

Current build-relevant layout on `feature/rebuild-from-prd` (paths shipped by B-001a):

```
junkie/
├── manifest.json                          Chrome MV3 manifest
├── jsconfig.json                          TS checker shim (suppresses circular-import false positives, see B-053)
├── .eslintrc.json                         Write-boundary denylist (see §6)
├── background/
│   ├── service-worker.js                  Entry point · exports `readyPromise` · wires onMessage
│   ├── messages/
│   │   └── storage-handlers.js            runtime.onMessage dispatcher + sender guard
│   └── storage/
│       ├── index.js                       Public barrel (no writeTransaction export — M3)
│       ├── partitions.js                  Partition keys, defaults, shape validators, read helpers, length caps
│       ├── ids.js                         Zero-dep ULID generator (strict-monotonic)
│       ├── errors.js                      StorageError + ERR_* constants + isQuotaError
│       ├── write-transaction.js           Serialized atomic batcher — SOLE write path
│       ├── items.js                       Item CRUD
│       ├── groups.js                      Group CRUD + depth/cycle enforcement + cascade on delete
│       └── preferences.js                 Preferences CRUD
├── shared/
│   └── messages.js                        MSG_* constants + envelope typedefs (NO storage logic)
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

All state lives under six partitioned keys in `chrome.storage.local`. Each
key is read, validated, and mutated independently so a single corrupt
partition isolates blast radius (AC8).

| Key | Purpose | Shape | Default | Persistence tier |
|---|---|---|---|---|
| `tj:meta` | Schema metadata / bookkeeping | `{ schemaVersion: number, createdAt: number }` | `{ schemaVersion: 1, createdAt: Date.now() }` | `storage.local` |
| `tj:items` | All user-saved items (flat list) | `Item[]` | `[]` | `storage.local` |
| `tj:groups` | All groups (flat list, adjacency list via `parentId`) | `Group[]` | `[]` | `storage.local` |
| `tj:prefs` | User preferences | `Preferences` | see DEFAULT_PREFERENCES below | `storage.local` |
| `tj:drift` | Drift records keyed by item id (B-001d will populate) | `Record<string, DriftRecord>` | `{}` | `storage.local` |
| `tj:floatingGroups` | Floating-group re-association hints (B-001d) | `FloatingGroup[]` | `[]` | `storage.local` |

Per R0 spike decision #2, **only `drifted` is persisted**. `live`, `active`,
and `audible` are ephemeral and computed from a SW-memory `LiveTabIndex`
(not yet built — B-001c). Per decision #3, `TabClaims` pairing records live
in `chrome.storage.session` (not yet built — B-001c). Neither surface exists
in B-001a.

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
 * @property {string}      color      1..MAX_COLOR (theme token string)
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

Defined in `shared/messages.js`. 12 constants total. **UI must never import
any file under `background/`**; the only contract is this module + `chrome.runtime.sendMessage`.

| Constant | Value | Request payload | Success `data` | Allowed senders |
|---|---|---|---|---|
| `MSG_CREATE_ITEM` | `tj/createItem` | `{title, url, groupId?}` | `Item` | sidepanel, newtab, popup |
| `MSG_UPDATE_ITEM` | `tj/updateItem` | `{id, patch}` | `Item` | sidepanel, newtab, popup |
| `MSG_DELETE_ITEM` | `tj/deleteItem` | `{id}` | `null` | sidepanel, newtab, popup |
| `MSG_LIST_ITEMS`  | `tj/listItems`  | `{groupId?}` | `Item[]` | all |
| `MSG_GET_ITEM`    | `tj/getItem`    | `{id}` | `Item \| null` | all |
| `MSG_CREATE_GROUP`| `tj/createGroup`| `{name, color, parentId, sortOrder?}` | `Group` | sidepanel, newtab |
| `MSG_UPDATE_GROUP`| `tj/updateGroup`| `{id, patch}` | `Group` | sidepanel, newtab |
| `MSG_DELETE_GROUP`| `tj/deleteGroup`| `{id}` | `null` | sidepanel, newtab |
| `MSG_LIST_GROUPS` | `tj/listGroups` | `{}` | `Group[]` | all |
| `MSG_GET_GROUP`   | `tj/getGroup`   | `{id}` | `Group \| null` | all *(added post-R2 — H4 fix)* |
| `MSG_GET_PREFERENCES` | `tj/getPreferences` | `{}` | `Preferences` | all |
| `MSG_SET_PREFERENCES` | `tj/setPreferences` | `{patch}` | `Preferences` | sidepanel |

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
leak). See `background/storage/errors.js`.

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

**Reachability audit** (from R4 / SPRINT_FINDINGS): every code above is
either thrown by at least one path in the shipped code, or deliberately
unreachable (`ERR_ID_COLLISION`).

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
| `group.color` | Non-empty; `length <= MAX_COLOR (32)` |
| `group.parentId` | `string \| null`; depth must stay `<= 1`; no cycles; target must exist |
| `prefs.theme` | `'light' \| 'dark' \| 'system'` |
| `prefs.displayMode` | `'sidepanel' \| 'window'` |
| `prefs.newTabOverride` | `boolean`, default `false` (H3 fix) |
| `prefs.autoCollapseSubGroups` | `boolean`, default `false` |

**Disallowed URL schemes** (rejected at storage boundary as XSS prophylactic,
H2 fix): `javascript:`, `data:`, `file:`, `chrome:`, `chrome-extension:`,
`blob:`, and anything else not explicitly allowlisted. Storage is the
chokepoint — downstream UI cannot be trusted to sanitize href attributes.

**Immutable fields.** `id` and `createdAt` are rejected as patch fields in
both `updateItem` and `updateGroup`. `updatedAt` is stripped from the allowed
patch list (M2 fix) and always recomputed by the mutator.

---

## 9. Performance Standards (B-001a portion)

| Metric | Target | Current status |
|---|---|---|
| Single-item read round-trip (`getItem`) | P95 < 20ms on 1k-item collection | Verified in `tests/perf.test.js` via chrome-mock (AC9) |
| Single-item write round-trip (`updateItem`) | P95 < 20ms on 1k-item collection | Verified in `tests/perf.test.js` via chrome-mock (AC9) |
| `writeTransaction` serialization under concurrent callers | No lost updates | Verified in integration tests (AC10) |
| Real-browser perf (`chrome.storage.local`, not mock) | not measured | UAT validated correctness only — real-browser latency is unverified |
| Sidepanel first paint | < 200ms (500-item) | Deferred — UI not in B-001a scope |
| Fuzzy search P95 | < 50ms (1k-item) | Deferred — search not in B-001a scope |

---

## 10. What B-001a Did NOT Ship

Explicit handoff list to downstream items.

| Handoff | Owner | Detail |
|---|---|---|
| Schema version field consumption + migration runner + `ready` barrier | **B-001b** | `readyPromise` is currently a stub that only awaits `initializePartitions()`. B-001b replaces it with a migration-gated promise that can legitimately reject with `ERR_NOT_READY`. `tj:meta.schemaVersion = 1` is written but never compared. |
| Read-only safe-mode banner (downgrade path, R0 decision #9) | **B-001b** | When `stored.schemaVersion > known`, all writes blocked, reads still work. |
| Quota warning UX (80% threshold per R0 decision #8) | **B-001b** | `writeTransaction` already stashes `lastQuotaSample = {bytesInUse, at}`; B-001b owns the user-facing prompt. |
| Legacy `junkie_*` storage key migration | **B-001b** | UAT found pre-existing `junkie_*` keys coexisting harmlessly with `tj:*`. Clean-up / migration is B-001b's call. |
| `LiveTabIndex` (ephemeral SW-memory index of live tabs) | **B-001c** | R0 decision #2 — computed at cold start from `chrome.tabs.query`. |
| `TabClaims` disambiguation table | **B-001c** | Per R0 decision #3, lives in `chrome.storage.session`, re-claimed on cold start in item-sort-order. |
| Drift record persistence + floating-tab exact-position re-association | **B-001d** | `tj:drift` and `tj:floatingGroups` partitions are initialized but unused in B-001a. |
| Sidepanel UI | **B-022** | Currently a stub `sidepanel.html`. |
| Newtab UI | **B-035** | Currently a stub `newtab.html`. |
| Popup UI | **B-036** | Currently a stub `popup.html`. |
| ESLint allowlist refactor + circular-dep extraction | **B-053** | Flip denylist → allowlist (only `background/**` may reach `background/storage/**`); resolve the circular `partitions.js` ↔ `write-transaction.js` import that `jsconfig.json` currently papers over. |

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

## 12. Rollback Plan

### What can go wrong and how to recover

Storage schema version field is written (`tj:meta.schemaVersion = 1`) but
not yet read. Until B-001b lands a migration runner, there is no **versioned**
rollback path. The current options are:

1. **Revert B-001a as a code change.** `git revert` the R3 build commits on
   `feature/rebuild-from-prd`. Any `tj:*` partitions already written to
   `chrome.storage.local` in the field remain on-disk but become unreachable
   (no reader). They will be cleaned up when the next schema version of the
   extension either migrates them (B-001b) or ignores them. Pre-existing
   `junkie_*` keys from legacy code coexist harmlessly under either outcome.
2. **Regression in a specific write path.** Disable the extension and debug
   via unpacked-mode reload. No remote kill-switch exists (by design — per
   R0 the extension is local-only; no telemetry or remote config).
3. **Corrupt partition in the field.** `ERR_CORRUPT_DATA` is scoped per
   partition (AC8); the other five remain usable. B-001b will add an
   export-and-reset UX; until then, recovery is manual via DevTools.
4. **Quota exhaustion in the field.** `ERR_QUOTA_EXCEEDED` bubbles from
   `writeTransaction`. B-001b owns the warning UX; short-term mitigation
   is to delete items from a working installation.

### What B-001a does NOT protect against

- Cross-version downgrade (reader sees a `schemaVersion` it doesn't
  recognize). **B-001b's read-only safe-mode** will cover this.
- Partial writes across multiple storage APIs — not applicable; every
  write is a single `chrome.storage.local.set`.
- Loss of ephemeral state (`LiveTabIndex`, `TabClaims`) — not applicable;
  those surfaces don't ship until B-001c.

---

## 13. Incident Log

*(empty — no SEV1/SEV2 incidents since B-001a landed.)*

---

## 14. Runbooks

*(empty — B-001a introduces no background async jobs or recovery procedures
beyond what the code itself handles. Add as B-001b's migration runner and
B-001c's live-tab indexer come online.)*
