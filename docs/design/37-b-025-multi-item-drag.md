# §37 — B-025 Multi-Item Drag as Single Unit (R6 Close)

**Sprint**: 24 · **Tier**: Full (M) · **Status**: Shipped — UAT 9/9 PASS (after two fix cycles on UAT-3 empty-group drop + UAT-8 ghost positioning)
**Dependencies (all done)**: B-024 multi-select, B-030 v2 drag foundation

---

## §37.1 Overview

B-025 layers a multi-item drag payload on top of the B-030 v2 single-item drag pipeline (Sprint 23, v1.17.0). When the user initiates a drag from a row that is part of the active B-024 multi-selection, every selected saved item is carried as one logical unit; a count badge on the drag ghost communicates the N. Drop behavior mirrors B-030 exactly (reorder within group, cross-group move, drop onto Ungrouped, Escape/outside-release cancel), but the dispatched `MSG_BULK_REORDER_ITEMS` spec contains N per-item updates computed by a new pure helper `computeMultiItemReorder`. All drag infrastructure primitives — rect cache, rAF coalescing, drop-target computation, indicator positioning, broadcast-race guard — are reused verbatim; the only additions in the sidepanel are (a) a selection snapshot in `_itemDragState`, (b) custom drag-ghost construction via `setDragImage`, (c) a multi-item insertion helper, and (d) guardrails for the AC2 solo-drag fallback + AC13c live-only initiator + AC13f cross-source-group restriction.

Because `bulkReorderItems` already accepts a per-item array of `{id, sortOrder, groupId?}` updates and the handler already normalises every affected bucket in the same `writeTransaction`, the backend surface area for B-025 is **zero new code** — only an array-length bump is observable at the handler level.

## §37.2 Reuse surface (verbatim from B-030)

The following primitives are reused without modification. R4 code-reviewer verifies no shadow/parallel implementation appears in the B-025 diff.

| Primitive | File · location | Reuse mode |
|---|---|---|
| `_itemDragState` | `sidepanel/sidepanel.js:284` | Extended — add `payloadItemIds: string[]`, `payloadSet: Set<string>`, `isMulti: boolean` |
| `_dragRectCache` | `sidepanel/sidepanel.js:289` + `_buildDragRectCache` at ~4604 | Verbatim |
| `_scheduleDragTick` / `_dragTick` | `sidepanel/sidepanel.js:4621 / 4626` | Verbatim |
| `_computeDropTarget` | `sidepanel/sidepanel.js:4719` | Extended: self-exclusion check uses `_itemDragState.payloadSet.has(id)` |
| `itemDragIndicatorEl` + CSS | `sidepanel/sidepanel.js:334–344` | Verbatim — single-bar indicator for multi-drops |
| `MSG_BULK_REORDER_ITEMS` | `shared/messages.js:58` | Verbatim — payload shape supports multi-item; JSDoc extended |
| `bulkReorderItems(updates)` | `background/storage/items.js:561` | Verbatim — already handles N-item payloads + multi-bucket normalisation |
| Storage-handler routing | `background/messages/storage-handlers.js:193` | Verbatim |
| `_cachedItemsGen` broadcast-race guard | `sidepanel/sidepanel.js:199, 4475–4486` | Verbatim |
| `_cleanupItemDragDom` | `sidepanel/sidepanel.js:4776` | Verbatim + iterates `payloadItemIds` for class cleanup |
| `computeItemReorder` | `shared/sort-order.js:62` | Sibling helper `computeMultiItemReorder` added next to it |

## §37.3 Decision resolutions

### D-1 Message contract — RESOLVED: **extend existing `MSG_BULK_REORDER_ITEMS`** (no new type)

**Rationale**:
1. Payload shape `{ updates: Array<{id, sortOrder, groupId?}> }` is already per-item. Handler applies each update independently inside a single `writeTransaction` and normalises every touched bucket. Single-item drop already emits N+M updates (destination siblings renumbered + source siblings renumbered). Multi-item is structurally the same.
2. New message type would duplicate handler registration, write-type set, broadcast scope, and validation — all ceremonial.
3. `MAX_BULK_INPUTS = 500` cap already covers realistic multi-drag sizes.

**Typed shape** (JSDoc extension in `shared/messages.js`):

```
/**
 * @typedef {Object} BulkReorderItemsRequest
 * @property {Array<BulkReorderUpdate>} updates
 *   Per-item reorder spec. 1 ≤ updates.length ≤ MAX_BULK_INPUTS.
 *   Supports both single-item (B-030) and multi-item (B-025) drops.
 *
 * @typedef {Object} BulkReorderUpdate
 * @property {string}       id
 * @property {number}       sortOrder
 * @property {string|null} [groupId]  Present only for cross-group moves.
 *
 * @typedef {Object} BulkReorderItemsResponse
 * @property {string[]} updated
 * @property {string[]} notFound
 */
```

**Change plan**:
- `shared/messages.js` — JSDoc extension only (no new constant).
- `background/storage/items.js` — no change.
- `background/messages/storage-handlers.js` — no change.

### D-2 Render-path strategy — RESOLVED: **explicit `renderAll` after multi-drop commit** (not hashItem extension)

Alternative (i) — adding `sortOrder` to `hashItem` — rejected because:
1. `hashItem` is hot-path for search index; adding `sortOrder` forces per-item entry rebuild on every reorder broadcast including non-drag triggers.
2. Blast radius is sprint-wide (affects B-030 + B-031).
3. B-030-shipped explicit `renderAll` pattern is known-good (9/9 UAT PASS).
4. Post-drop renderAll is single full-render (~5–10 ms @ 1000 items). Cost is post-commit, not in dragover window.

**Mechanism**: sidepanel drop handler extracts a shared tail helper `_commitReorderAndRender(updates)`; both single-item (B-030) and multi-item (B-025) paths share it. Tail = `await sendMessage(MSG_BULK_REORDER_ITEMS, { updates }); await Promise.all([MSG_LIST_ITEMS, MSG_LIST_GROUPS]); renderAll(...)`.

B-052 hashItem extension deferred as future perf optimisation (§37.9 F-1).

### D-3 CSS enumeration — RESOLVED: **custom drag ghost via `setDragImage` at dragstart**

Not a positioned overlay that tracks pointer — `setDragImage` snapshots an off-screen DOM element. Ghost lives in `document.body` briefly between dragstart and the next microtask, then detaches.

**Ghost element CSS** (`.multi-drag-ghost`):

| Property | Value | Reason |
|---|---|---|
| `position` | `absolute` | Off-flow |
| `top` | `-9999px` | Off-screen vertically |
| `left` | `-9999px` | Off-screen horizontally |
| `transform` | `none` | Explicit; prevents inherited transform altering snapshot |
| `opacity` | `1` | Snapshot must be opaque |
| `pointer-events` | `none` | Prevents `elementFromPoint` self-hit |
| `z-index` | `9999` | Defensive during 1-microtask lifetime |
| `background-color` | `var(--surface-2)` | Match item-row hover |
| `border-radius` | `6px` | Match `.item-row` |
| `padding` | `4px 8px` | Compact |
| `white-space` | `nowrap` | Prevent wrap |
| `box-shadow` | `0 2px 8px rgba(0, 0, 0, 0.2)` | Visual lift |
| `display` | `inline-flex` | Row layout for title + badge |
| `align-items` | `center` | Vertical center |
| `gap` | `6px` | Spacing |

**Count badge CSS** (`.multi-drag-ghost__badge`):

| Property | Value |
|---|---|
| `position` | `static` |
| `display` | `inline-block` |
| `margin-left` | `8px` |
| `padding` | `2px 6px` |
| `background-color` | `var(--accent-bg)` |
| `color` | `var(--accent-fg)` |
| `border-radius` | `10px` |
| `font-size` | `12px` |
| `font-weight` | `600` |

**Lifecycle**: dragstart constructs ghost → append to `document.body` → `setDragImage(ghostEl, Math.round(rect.width / 2), 16)` → `queueMicrotask(() => ghostEl.remove())`. Count badge rendered only for N ≥ 2; N = 1 uses default browser drag image (zero-cost path).

Content written via `textContent` (never `innerHTML`) per project XSS policy.

### D-4 Cross-source-group drag scope — RESOLVED: **restrict to single source group via silent payload restriction at dragstart**

Multi-drag payload = items in `_selection` whose `groupId` matches the initiator's `groupId`. Other source-group items remain selected but are excluded from the drag payload. If the initiator is not in `_selection`, AC2 fallback fires (clear selection, solo-drag initiator).

Rejected: blocking drag entirely (confusing); disabling drag handle on mixed-source selection (high blast radius).

### D-5 Live-only initiator — RESOLVED: **live-only keys skipped from payload**

`_selection` holds both `item:*` and `tab:*` keys. Live-only (`tab:*`) keys are structurally skipped by the same dragstart filter that enforces D-4 (same source group). If the drag initiator is a live-only row, B-025 is not activated — the drag is either B-033 scope (shipped) or rejected. If initiator is a saved item and selection mixes saved + live, the live keys are silently excluded and multi-drag proceeds with only the saved subset.

## §37.4 Component structure

### 4.1 `shared/messages.js`
JSDoc typedef extension per D-1. No runtime change.

### 4.2 `background/storage/items.js` — no change
`bulkReorderItems` already handles N-item payloads, multi-bucket normalisation, partial-success envelope, `MAX_BULK_INPUTS` cap.

### 4.3 `background/messages/storage-handlers.js` — no change

### 4.4 `shared/sort-order.js` — NEW `computeMultiItemReorder`

Pure, DOM-free, chrome-free. Sibling to `computeItemReorder`.

```
/**
 * @param {Item[]} items
 * @param {string[]} draggedIds           All same sourceGroupId (enforced upstream per D-4)
 * @param {string|null} destGroupId
 * @param {number} destIndex
 * @returns {ReorderUpdate[]}
 */
export function computeMultiItemReorder(items, draggedIds, destGroupId, destIndex) { ... }
```

**Stable ordering** (AC5): caller sorts `draggedIds` by current `sortOrder` before call. Function preserves that relative order at drop point.

**No-op detection**: `sourceGroupId === destGroupId` AND `draggedIds` positions `destIndex..destIndex+N-1` match current positions → return `[]`.

### 4.5 `sidepanel/sidepanel.js` hook points

1. **`_itemDragState` shape extension** (decl ~284, construction ~4362): add `payloadItemIds: string[]`, `payloadSet: Set<string>`, `isMulti: boolean`.

2. **`dragstart` branch** (~4348–4393): after `sourceGroupId` computed, insert D-4/D-5 resolution:
   ```
   const initiatorItemId = itemRow.dataset.itemId;
   const initiatorKey = 'item:' + initiatorItemId;
   const initiator = _cachedItems.find(it => it.id === initiatorItemId);
   const initiatorGroupId = initiator ? (initiator.groupId ?? null) : null;

   let payloadItemIds, isMulti;
   if (!_selection.has(initiatorKey)) {
     _selection.clear();
     _updateBulkBar();
     payloadItemIds = [initiatorItemId];
     isMulti = false;
   } else {
     const candidates = [];
     for (const key of _selection) {
       if (!key.startsWith('item:')) continue;
       const id = key.slice(5);
       const item = _cachedItems.find(it => it.id === id);
       if (!item) continue;
       if ((item.groupId ?? null) !== initiatorGroupId) continue;
       candidates.push(id);
     }
     payloadItemIds = candidates.length > 0 ? candidates : [initiatorItemId];
     isMulti = payloadItemIds.length >= 2;
   }
   _itemDragState.payloadItemIds = payloadItemIds;
   _itemDragState.payloadSet = new Set(payloadItemIds);
   _itemDragState.isMulti = isMulti;
   ```
   If `isMulti === true`, build ghost via `_buildMultiDragGhost(payloadItemIds.length, initiator.title)` + `setDragImage(ghostEl, halfWidth, 16)` + `queueMicrotask(() => ghostEl.remove())`.

3. **`_computeDropTarget`** (~4719): change self-exclusion check from `id === _itemDragState.itemId` to `_itemDragState.payloadSet.has(id)` — O(1) with the pre-built Set.

4. **`drop` handler** (~4442–4531): after broadcast-race guard (~4475–4486), branch on `state.isMulti`:
   - `isMulti === false`: existing `computeItemReorder` path verbatim
   - `isMulti === true`: sort `state.payloadItemIds` by current sortOrder → `computeMultiItemReorder(_cachedItems, sortedIds, destGroupId, destIndex)` → dispatch + renderAll
   - Both branches converge on `_commitReorderAndRender(updates)` helper

5. **`dragend` cleanup** (~4568–4594) + **`_cleanupItemDragDom`** (~4776): iterate `state.payloadItemIds` to remove `item-row--dragging` class from all payload members. New helper `_clearMultiDragRowClasses(ids)` for clarity.

### 4.6 `sidepanel/sidepanel.css` — new rules per D-3

```css
.multi-drag-ghost {
  position: absolute;
  top: -9999px;
  left: -9999px;
  transform: none;
  opacity: 1;
  pointer-events: none;
  z-index: 9999;
  background-color: var(--surface-2);
  border-radius: 6px;
  padding: 4px 8px;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.multi-drag-ghost__badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 6px;
  background-color: var(--accent-bg);
  color: var(--accent-fg);
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}
```

## §37.5 CSS enumeration summary

See §37.3 D-3 tables. **R4 gate**: every listed property must appear in shipped CSS or REJECT (S23 `top: 0` precedent).

## §37.6 Test plan delta

New `tests/b025-multi-item-drag.test.js` covering AC17's 7 cases:

| # | Case |
|---|---|
| 1 | Multi-drag same-group stable-ordering (A, C, E → drop at end) |
| 2 | Multi-drag cross-group (groupId updated + both buckets renormalised) |
| 3 | Non-contiguous selection stable-ordering |
| 4 | `sortOrder` normalisation for source + destination |
| 5 | Escape cancel — zero storage writes |
| 6 | Broadcast-race guard: stale `_cachedItemsGen` triggers re-fetch |
| 7 | AC2 solo-drag fallback (initiator not in selection) |

Plus `computeMultiItemReorder` pure-helper tests in `tests/sort-order.test.js`:
- Same-group multi-drop to start / middle / end (3 assertions).
- Cross-group multi-drop: destination + source renumbered, dragged items carry `groupId`.
- Empty destination group + multi-drop.
- Same-position multi-drop no-op returns `[]`.

**Target**: 1001 → 1012+ green.

## §37.7 R2 Correctness Checklist

| # | Check | Verdict |
|---|---|---|
| C-1 | Storage schema versioned | N/A — no schema change |
| C-2 | Message contracts typed | PASS — JSDoc typedef extension per D-1 |
| C-3 | SW cold-start safe | PASS — all drag state is sidepanel-local |
| C-4 | ID stability | PASS — only `sortOrder` + `groupId` change |
| C-5 | Manifest file references | N/A |
| C-6 | Permission minimization | N/A |
| C-7 | Allow-list direction | N/A |
| C-8 | SW-context feasibility | N/A — all APIs are sidepanel-side |
| C-9 | Empty-state design | PASS — R1 AC13 + R2 D-4/D-5 cover all enumerated states |

## §37.8 Rollback plan

Symmetric with B-030's rollback (§36.7). `git revert <B-025-commit-sha>` on `release/v2` is data-clean: no schema change, no new partition, no new message type. All writes go through `bulkReorderItems` → `writeTransaction`, same atomic commit path. After revert: B-030 single-item path continues to work as shipped in v1.17.0.

**SEV tier**: SEV3 (minor degradation — multi-drag feature removed; single-drag continues).

## §37.9 Known risks / follow-ups

| # | Risk / Follow-up | Disposition |
|---|---|---|
| F-1 | B-052 hashItem extension (S23 retro MEDIUM-2 deferred) | Future perf optimisation; backlog item tagged "perf" |
| F-2 | Cross-source-group multi-drag (D-4 deferred) | Future UX design for merged-group ordering; S26+ candidate |
| F-3 | Keyboard alternative (inherited B-030 AC12 limitation) | Future: Shift+Arrow bulk-move against selection |
| F-4 | Touch / pointer-events multi-drag | Out of scope (desktop-first) |
| F-5 | `_computeDropTarget` self-exclusion scan cost | Mitigated via `payloadSet` (Set cache) on `_itemDragState` |
| F-6 | Ghost-snapshot timing sensitivity | `queueMicrotask` (not `Promise.resolve().then`) for reliable detach |
| F-7 | Stable-sort pre-condition for `computeMultiItemReorder` | Caller sorts; enforced by tests AC17#1 + #3 |

---

**R2 verdict**: READY FOR R3. All five R1 decision points resolved. All applicable correctness checks PASS.

## §37.10 As Built (R6 Close)

This section documents deltas between the R2 plan (§37.1–§37.9) and the code that actually shipped in Sprint 24. Backend + pure-helper contracts landed as designed; three sidepanel/CSS deviations required during R3 + UAT are recorded below. UAT: 9/9 PASS in Edge after two fix cycles.

### Deviations from R2

#### D-1 — CSS token mapping

R2 §37.3 D-3 enumerated `var(--surface-2)`, `var(--accent-bg)`, and `var(--accent-fg)` as the ghost + badge color tokens. These tokens do not exist in the shipped theme. Implementation correctly mapped to the actual Tab Junkie tokens:

| R2 token | Shipped token | Where |
|---|---|---|
| `var(--surface-2)` | `var(--bg-secondary)` | `.multi-drag-ghost` background |
| `var(--accent-bg)` | `var(--accent)` | `.multi-drag-ghost__badge` background |
| `var(--accent-fg)` | `var(--on-accent)` | `.multi-drag-ghost__badge` color |

The shape, padding, border-radius, box-shadow, and flex/gap values from the R2 tables all shipped as written. This is purely a token-name reconciliation — no behavioral deviation.

#### D-2 — Ghost positioning (UAT-8 fix)

R2 §37.3 D-3 specified `position: absolute; top: -9999px; left: -9999px` so the ghost sits off-screen before `setDragImage` snapshots it. UAT-8 FAILED on the first round: in Edge, the element's `getBoundingClientRect()` returned zero dimensions because the ghost had never laid out at a rendered location, so `setDragImage` snapshotted an empty rect — users saw no drag preview at all.

Shipped CSS after the UAT-8 fix cycle:

| Property | R2 spec | As shipped | Reason |
|---|---|---|---|
| `position` | `absolute` | `fixed` | Isolates from scroll context |
| `top` | `-9999px` | `0` | Real layout position (still off-screen via transform) |
| `left` | `-9999px` | `0` | Real layout position |
| `transform` | `none` | `translate(-100%, -100%)` | Off-screen but rect is real |
| `min-width` | — | `80px` | Floor for skinny titles |
| `color` | — | `var(--text-primary)` | Explicit contrast against `--bg-secondary` |

Additional runtime fix in `sidepanel.js` at ghost-mount time:
- **Forced reflow**: `void ghostEl.offsetHeight` before `setDragImage` to flush layout.
- **Width fallback**: `ghostEl.offsetWidth || ghostEl.getBoundingClientRect().width || 80` — three-tier degrade if any measurement returns 0.

All other R2 CSS properties (opacity, pointer-events, z-index, border-radius, padding, white-space, box-shadow, display, align-items, gap) shipped verbatim.

#### D-3 — Empty-destination-group drop path (UAT-3 fix)

R2 §37.3 AC13e mentioned "all dragged items land at sortOrder 0..N-1" for the empty-group case, but §37.3 did not specify how `_computeDropTarget` identifies an empty target group. The shipped R3 implementation inherited B-030's `hit.closest('.item-row')` hit-test — which returns null when the destination group has zero items, silently no-op'ing the entire drop.

UAT-3 FAILED on the first round for B-025, and investigation revealed the bug existed in the B-030 v2 single-item path as well (§36 chapter amendment §36.11 documents the cross-sprint fix). The fix applied to both paths in the same commit.

**Fix — shared `{type:'emptyGroup'}` branch in `_computeDropTarget`**:
- When `hit.closest('.item-row')` misses, the handler now falls through to `hit.closest('.group-items')`.
- If the `.group-items` container has zero `.item-row` descendants (the `.open-tabs-section` live region is excluded from the count), returns `{type:'emptyGroup', destGroupId}` with `destIndex = 0`.
- Drop handler routes through the same `computeItemReorder` (B-030) or `computeMultiItemReorder` (B-025) helper with `destIndex = 0`.
- Drop indicator renders at the top edge of the empty `.group-items` container (existing translateY path, zero offset).

Tests for both single-item (B-030) and multi-item (B-025) empty-group drops added in `tests/b025-multi-item-drag.test.js`.

### R4 findings applied

| # | Finding | Disposition |
|---|---|---|
| B-025-H1 | R5 test file missing | `tests/b025-multi-item-drag.test.js` created — 15 tests. `tests/sort-order.test.js` extended with 14 `computeMultiItemReorder` cases. |
| B-025-H2 | `_commitReorderAndRender` warn label mis-scoped | Neutralised to `[tab-junkie:item-drag]` |
| B-025-H3 | AC9 violation — multi-drag onto Open Tabs ambiguously handled | Fixed — drop onto `.open-tabs-section` now a true no-op |
| B-025-M1 | Selection not cleared after successful multi-drop | Fixed — `_selection.clear()` + `_updateBulkBar()` after successful `_commitReorderAndRender` |

### Deferred to Sprint 25

- **B-025-M2**
- **B-025-M3** — original `getBoundingClientRect` before reflow; superseded by D-2 above
- **B-025-M4**
- **B-083** (filed) — `filterGroupParentCandidates` over-restrictive filter blocks multiple sibling sub-groups under one parent; affects both B-007 dialog and B-031 drag-nest

### Sprint total test count

- Entering Sprint 24: 1069 green
- Exiting Sprint 24: 1074 green (+5 net across B-031, B-025, B-032 combined; B-025-specific contribution is the 15-case file plus the 14 pure-helper cases; total sprint delta includes revisions and displacements in existing suites)

### Final file manifest (B-025 specific)

```
shared/messages.js                        JSDoc typedef extension (no new constant)
shared/sort-order.js                      + computeMultiItemReorder
sidepanel/sidepanel.css                   + .multi-drag-ghost, .multi-drag-ghost__badge,
                                            empty-group indicator positioning
sidepanel/sidepanel.js                    + _itemDragState multi fields, dragstart payload
                                            filter, ghost mount+reflow+setDragImage,
                                            multi-drop branch in drop handler, emptyGroup
                                            branch in _computeDropTarget (shared w/ B-030),
                                            selection clear on success
tests/sort-order.test.js                  + 14 computeMultiItemReorder cases
tests/b025-multi-item-drag.test.js        NEW (15 cases inc. empty-group drop)
```
