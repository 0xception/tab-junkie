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

