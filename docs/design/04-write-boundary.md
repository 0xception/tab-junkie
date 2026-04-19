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

