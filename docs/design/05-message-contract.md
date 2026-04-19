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

