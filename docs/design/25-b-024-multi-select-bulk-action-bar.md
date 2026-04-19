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

