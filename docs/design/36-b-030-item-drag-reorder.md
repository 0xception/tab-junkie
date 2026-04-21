# § 36. B-030 — Item Drag-Reorder within / between Groups

**Sprint**: 22 · **Tier**: Full (L) · **Status**: R6 close (pending merge)

## 36.1 Scope

B-030 ships the drag infrastructure foundation for the sidepanel: click-and-drag an item row to reorder it within its current group, or to another group (including Ungrouped). Every downstream drag feature (B-025 multi-item drag, B-031 group drag-nest, B-032 auto-scroll, B-009 drag-to-expand, B-033 drag-to-demote) sits on this foundation.

Storage-layer sortOrder + groupId fields are pre-existing (B-001a AC4); B-030 adds the drag UX, a new purpose-built bulk-reorder storage function, and a pure helper for computing the update spec.

## 36.2 R2 Correctness Checklist — as-shipped

| # | Check | Result |
|---|-------|--------|
| C-1 | Storage schema versioned | N/A — no schema change |
| C-2 | Message contracts typed | ✅ — new `MSG_BULK_REORDER_ITEMS` with per-item `{id, sortOrder, groupId?}` payload |
| C-3 | SW cold-start safe | ✅ — all drag state in sidepanel module; nothing SW-memory-persisted |
| C-4 | ID stability | ✅ — items keep their ids; only sortOrder / groupId change |
| C-5 | Manifest file refs | ✅ — no change |
| C-6 | Permission minimization | ✅ — zero new permissions |
| C-7 | Allow-list direction | N/A — no new sanitizer |
| C-8 | SW-context feasibility | ✅ — all drag APIs sidepanel-side |
| C-9 | Empty-state design | ✅ — 7 states enumerated in AC13 + test coverage |

## 36.3 Architecture

### 36.3.1 New storage function

`bulkReorderItems(updates: Array<{id, sortOrder, groupId?}>)` — `background/storage/items.js`. Takes per-item updates (unlike `bulkUpdateItems` which is uniform-patch-only). Single `writeTransaction` applies every update; every affected bucket then runs through the existing `normaliseGroupSortOrders` to produce consecutive integer sortOrders.

Validation: rejects empty arrays, non-finite sortOrders, non-string ids, unknown destination groupIds (`ERR_NOT_FOUND`). Partial-success semantics: unknown ids land in `notFound`.

### 36.3.2 New message

`MSG_BULK_REORDER_ITEMS = 'tj/bulkReorderItems'` in `shared/messages.js`. Registered in:
- `background/messages/storage-handlers.js` — `SCOPE.ITEMS` broadcast; classified as a write (blocked in safe mode).
- Sidepanel consumer dispatches via the existing `sendMessage(MSG_BULK_REORDER_ITEMS, { updates })` wrapper.

### 36.3.3 Pure helper

`computeItemReorder(items, draggedId, destGroupId, destIndex)` → `ReorderUpdate[]` in `shared/sort-order.js`. Pure, DOM-free, chrome-free (matches B-065 + B-007 extraction precedent). Produces the MINIMAL update set — items whose post-drop (sortOrder, groupId) differ. Returns `[]` for same-position no-ops and for unknown dragged ids (defensive).

Algorithm:
1. Snapshot source-group items (excluding dragged), sorted by sortOrder.
2. Snapshot destination-group items if cross-group; else reuse source snapshot.
3. Clamp `destIndex` to `[0, destItems.length]`.
4. Build the new destination order by inserting dragged at `clampedIdx`.
5. For same-group, same-position drop → return `[]` (no-op).
6. Emit destination updates using `idx * 1000` pattern (matches B-008).
7. If cross-group, emit source-group renumbering updates for the remaining items.

### 36.3.4 Sidepanel drag mechanics

Event delegation at `#item-list` — single handler set for both B-008 group drags (pre-existing) and B-030 item drags (new). Handlers branch on which state is active:
- `_dragSrcGroupId` (string or null) — set during group drags.
- `_itemDragState` (`{itemId, sourceGroupId}` or null) — set during item drags.

Drag-state setup:
- **dragstart**: if `e.target.closest('.item-row')` AND the drag was NOT initiated from a group drag handle → item drag path. Sets `_itemDragState`, sets `effectAllowed='move'`, sets drag data (`text/plain` with the item id for Firefox compat), adds `.item-row--dragging` class to the dragged row.
- **dragover** (item drag): finds nearest `.group-items` container, positions `dropIndicatorEl` at the item-row boundary nearest the pointer Y.
- **drop** (item drag): computes `destGroupId` + `destIndex` from the indicator's position → calls `computeItemReorder` → dispatches `MSG_BULK_REORDER_ITEMS` in a single round-trip.
- **dragend** (item drag): cleanup — hide indicator, remove dragging class, clear state.

Indicator: reuses the existing `dropIndicatorEl` (`sidepanel.js:258`, imperatively created for B-008 group reorder). Moves between group-level (B-008) and item-level (B-030) scopes depending on the active drag type. No separate element or CSS modifier was needed at the CSS level — the indicator styles apply in both scopes.

### 36.3.5 A11y — native DnD is not keyboard-operable

Per AC12. Every `.item-row` carries a `title="Drag to reorder (keyboard reorder not yet available)"` attribute. Matches B-008 AC12's disclosure pattern. A keyboard-reorder alternative is not in scope; file a follow-up item if prioritised later.

### 36.3.6 Cross-ownership with B-033 (next wave)

Per AC7 and R2 D-6. B-030's drop handler classifies drop targets via `target.closest('.group-items')`. If the drop is on the Open Tabs section instead (different DOM scope), B-030 no-ops and B-033 (S22 Wave 1) owns the demote path. B-033 R3 wires its drop handler on the Open Tabs container; both can coexist because the target classification is disjoint.

## 36.4 Empty-state enumeration (C-9)

| State | Handling |
|-------|----------|
| Drop onto empty group (zero items) | Dragged item lands at sortOrder 0 |
| Drop at start of populated group | Existing items shift right; dragged gets sortOrder 0 |
| Drop at end of populated group | Dragged appends with sortOrder = max + 1 × 1000 |
| Drop between two items | Dragged interpolates; all affected items renumber |
| Drag from Open Tabs (live-only row) | Promote path (out of scope — B-017 handles click-to-promote today) |
| Same source + destination AND same position | No-op — `computeItemReorder` returns `[]`; zero messages dispatched |
| Drop on group header (not inside items container) | Invalid drop target — cancel path (indicator hides; no write) |

## 36.5 Rollback plan

Pure `git revert` safe. No storage schema change, no new permissions, no new settings. Reverting the commit restores the pre-B-030 UI (drag disabled on `.item-row`). The new `bulkReorderItems` + `MSG_BULK_REORDER_ITEMS` would be uninvoked — no stale storage state.

## 36.6 Decisions / deviations from R2 plan

| # | Decision | Rationale |
|---|----------|-----------|
| D-1 | Extract `computeItemReorder` to `shared/sort-order.js` | B-065 / B-007 precedent. Testable in isolation. |
| D-2 | New `bulkReorderItems` function (not extend `bulkUpdateItems`) | Existing `bulkUpdateItems` is uniform-patch, groupId-only. Per-item sortOrder is a different semantic. Extending would break B-024 / B-028 caller safety. |
| D-3 | Reuse existing `dropIndicatorEl` across B-008 + B-030 scopes (no dedicated item-drop modifier) | Turned out to be unnecessary at CSS level — the shared element works in both parent scopes. Kept the markup + CSS simpler. |
| D-4 | Single-element `dataTransfer.setData('text/plain', itemId)` | Firefox compat belt + braces; Chromium-only users would not need it, but the cost is zero and cross-browser consistency is cheap. |
| D-5 | `computeItemReorder` returns MINIMAL update set (not the full affected-group snapshot) | Reduces dispatch payload. Backend bucket normaliser handles any residual gaps. R1 tests confirm consecutive integers post-commit. |

## 36.7 Test coverage

- `tests/sort-order.test.js` — 10 pure-helper tests covering within-group reorder (first-to-last, last-to-first), same-position no-op, cross-group move, drop-onto-Ungrouped, empty destination, destIndex clamping, defensive non-array input, integer-sortOrder invariant.
- `tests/b030-item-drag-reorder.test.js` — 8 backend tests covering AC4 within-group, AC5 cross-group, AC6 Ungrouped, atomic writeTransaction, empty-updates rejection, unknown-id partial success, unknown-group `ERR_NOT_FOUND`, non-finite sortOrder rejection.
- **Total suite**: 979 → **997 passing** (+18 new tests).

## 36.8 Deferred to post-merge

- **UAT** (smoke plan `docs/UAT_B-030.md`) — 8 cases, to be executed in S27 comprehensive UAT sweep per FEATURE_PARITY_ROADMAP.md.
- **B-009 Wave 1** — drag-to-expand collapsed group while dragging (hover-hold 600ms). Depends on B-030 dragover pipeline — ships in same sprint.
- **B-033 Wave 1** — drag saved+live item to Open Tabs → demote. Depends on B-030 drop-target classification — ships in same sprint.

## 36.9 Files changed

```
shared/messages.js                           +9
shared/sort-order.js                         NEW (pure helpers)
background/storage/items.js                  +~100 (bulkReorderItems)
background/storage/index.js                  +1 (re-export)
background/messages/storage-handlers.js      +4 (imports, dispatch, broadcast)
sidepanel/sidepanel.js                       +~180 (drag handlers + import + state)
tests/sort-order.test.js                     NEW
tests/b030-item-drag-reorder.test.js         NEW
docs/design/36-b-030-item-drag-reorder.md    NEW (this file)
```
