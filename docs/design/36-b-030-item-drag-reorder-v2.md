# § 36. B-030 v2 — Item Drag-Reorder within / between Groups

**Sprint**: 23 · **Tier**: Spike-First (L) · **Status**: Shipped (PR #28, commit `791d50e`)

**v1 (Sprint 22)** shipped then reverted after UAT found correctness + perf regressions. See `docs/SPRINT_ARCHIVE.md` Sprint 22 entry for the v1 revert retrospective. **v2** is the re-architected re-implementation with perf + correctness guardrails baked into ACs (not design notes).

## 36.1 Scope

The drag infrastructure foundation for the feature-parity roadmap. Enables:
- Drag-reorder items within a group (same-group)
- Move items between groups (cross-group)
- Drop onto Ungrouped (groupId → null)
- Escape-to-cancel + release-outside-target = cancel (no write)

Downstream drag features that sit on this foundation: **B-009** (drag-to-expand collapsed, S23 Wave 1), **B-033** (drag-to-Open-Tabs demote, S23 Wave 1), **B-025** (multi-item drag, S24), **B-031** (group drag+nest, S24), **B-032** (auto-scroll, S24).

## 36.2 R2 Correctness Checklist — as-shipped

| # | Check | Result |
|---|-------|--------|
| C-1 | Storage schema versioned | N/A — no schema change |
| C-2 | Message contracts typed | ✅ new `MSG_BULK_REORDER_ITEMS` |
| C-3 | SW cold-start safe | ✅ all state sidepanel-side |
| C-4 | ID stability | ✅ sortOrder / groupId only |
| C-5 | Manifest file refs | ✅ no change |
| C-6 | Permission minimization | ✅ zero new permissions |
| C-7 | Allow-list direction | N/A — no new sanitizer |
| C-8 | SW-context feasibility | ✅ all drag APIs sidepanel-side |
| C-9 | Empty-state design | ✅ enumerated in ACs 13 + 16-24 |

## 36.3 Architecture — as shipped

### 36.3.1 Backend (byte-identical to v1 — known-good)

- **`shared/messages.js`** — `MSG_BULK_REORDER_ITEMS = 'tj/bulkReorderItems'`
- **`background/storage/items.js`** — `bulkReorderItems(updates)`: per-item `{id, sortOrder, groupId?}` updates applied in a single `writeTransaction`; affected buckets normalised to consecutive integer sortOrders via existing `normaliseGroupSortOrders`. Partial-success semantics.
- **`background/storage/index.js`** — re-export
- **`background/messages/storage-handlers.js`** — `MSG_BULK_REORDER_ITEMS` handler + `SCOPE.ITEMS` broadcast + write-type classification

### 36.3.2 Pure helper

- **`shared/sort-order.js#computeItemReorder(items, draggedId, destGroupId, destIndex)`** — returns minimal `ReorderUpdate[]` spec. DOM-free, chrome-free. B-065 extraction precedent.

### 36.3.3 Sidepanel drag handlers (NEW in v2 — v1's handlers were fully discarded)

Event delegation at `#item-list` — shared handlers branch on drag type:
- **`_dragSrcGroupId`** (existing, B-008) — active during group drag
- **`_itemDragState`** (NEW v2) — active during item drag. Shape: `{itemId, sourceGroupId, cachedItemsGen, pendingTargetRowId, pendingInsertPosition, rafHandle, scrollListener}`

Three new helpers per R2 contracts:
- **`_buildDragRectCache()`** (AC18) — snapshots `.item-row` client-rects at dragstart; cached in `_dragRectCache.rects: Map<itemId, DOMRect>`. Scroll-invalidated via passive listener registered at dragstart, removed at dragend. Lazy rebuild in next rAF tick when invalidated.
- **`_scheduleDragTick()`** + **`_dragTick()`** (AC17) — rAF-coalesce all DOM writes. Dragover records `_pendingPointerX/Y` only; rAF tick consumes them. rAF ceiling = 60 Hz (not 60-120 Hz dragover).
- **`_computeDropTarget(x, y)`** — `document.elementFromPoint(x, y).closest('.item-row')` + cached-rect midpoint for before/after. No layout-forcing calls.

### 36.3.4 The three dragover body statements (AC16 + AC17 enforcement)

```
e.preventDefault();
e.dataTransfer.dropEffect = 'move';
_pendingPointerX = e.clientX; _pendingPointerY = e.clientY; _scheduleDragTick();
```

No `getBoundingClientRect`. No DOM mutations. No layout work. R4 grep verified clean at merge.

### 36.3.5 Indicator

Dedicated **`itemDragIndicatorEl`** separate from B-008's `dropIndicatorEl` (preserves B-008 reparent pattern without regression). Inline styles:
- `position: absolute`
- **`top: 0`** (critical — without this the element anchors at its DOM flow position, invisible below all content)
- `pointer-events: none` (AC23 — prevents `elementFromPoint` self-hit)
- `opacity: 0` default; `1` during valid drag-over
- `transform: translateY(Npx)` — compositor-only; zero layout cost
- `z-index: 10` — ensures indicator renders above item rows
- `left: 0; right: 0` — full-width horizontal bar

Indicator is appended once per `renderAll` to `itemListEl` (which is `position: relative`). NEVER reparented during drag.

### 36.3.6 Broadcast-race guard (AC24)

At dragstart: `_itemDragState.cachedItemsGen = _cachedItemsGen`. At drop time: if `_cachedItemsGen` has advanced (broadcast landed mid-drag), `await sendMessage(MSG_LIST_ITEMS)` to refresh `_cachedItems` before computing the reorder spec. Prevents stale-state writes.

`_cachedItemsGen` is a monotonic counter bumped on every `_cachedItems =` assignment (3 call sites: `renderAll`, two patch paths in the broadcast listener).

## 36.4 Build Deviations from R2 plan

| # | Deviation | Reason |
|---|-----------|--------|
| D-1 | Added `top: 0` inline to indicator (not in R2 spec but necessary) | R2 said "position: absolute + transform" but didn't specify `top: 0`. UAT round 1 surfaced the invisible-indicator bug; fix was inline. |
| D-2 | Drop handler explicitly re-fetches + `renderAll` after `bulkReorderItems` (beyond R2) | R2 assumed broadcast → diffAndPatch → re-render. But B-052's `hashItem` omits `sortOrder`, so same-group reorder returns `deltaType: 'noop'` and no patch fires. UAT round 1 caught this; fix was explicit render call after the message resolves. |
| D-3 | `_cleanupItemDragDom` runs BEFORE nulling `_itemDragState` (swapped from R3 initial order) | UAT-surfaced — cleanup checked `if (_itemDragState)` before cancelling rAF + removing scroll listener; if called after nulling, cancellation was skipped. |
| D-4 | `z-index: 10` on indicator (not in R2 spec) | Defensive — ensures indicator renders above item rows regardless of CSS stacking context. |

## 36.5 UAT outcomes (merge gate per Sprint 22 retro HIGH-3)

**Round 1** (commit `fedd24d`): 5 PASS + 4 FAIL/WARN.
- FAIL UAT-1 (same-group reorder): indicator missing + no visible reorder until accordion toggle
- WARN UAT-2/3/6 (various): no visual indicator
- PASS UAT-4/5/7/8 (cancel paths + B-008 regression + a11y)

**Round 2** (commit `a558b41` after D-1/D-2/D-3/D-4 fixes): **9/9 PASS**.
- UAT-1 + UAT-6 (S22 regression guards) both PASS
- UAT-7 (B-008 no-regression) PASS
- All other cases PASS

Merge gate cleared; PR #28 merged as `791d50e`.

**Lesson confirmed**: Sprint 22 retro HIGH-3 (pre-merge UAT in browser, not just R4 smoke-check) was essential. Round 1 bugs would not have been caught by automated tests or R4 code-review alone.

## 36.6 Test coverage

- **`tests/sort-order.test.js`** — 14 tests (10 original from v1 + 4 new: AC21 3-destination same-group × 3 + AC20 drop-resolution simulation)
- **`tests/b030-item-drag-reorder.test.js`** — 8 backend tests (v1-style, byte-identical to S22's, covering `bulkReorderItems` validation + partial-success + AC4/5/6 + atomic tx)
- **Total**: 979 → **1001 passing** (+22)

AC19 (`getBoundingClientRect` call-count assertion) is enforced at R4 via grep guard rather than runtime test — v2's implementation keeps all rect reads inside `_buildDragRectCache` (exactly 2 call sites: once per row + once for containerRect), so runtime counting is redundant with the grep.

AC20 (fake-DOM drag simulation) is exercised logically via the drop-resolution simulation test in `sort-order.test.js` rather than a full DOM shim — test asserts the exact pendingTarget→destIndex→computeItemReorder pipeline that the sidepanel drop handler executes.

## 36.7 Rollback plan

Same as v1 — `git revert 791d50e` on `release/v2`. Clean; no storage schema change means the revert has no data consequences. Backend code (`bulkReorderItems` + `MSG_BULK_REORDER_ITEMS`) would be removed along with the sidepanel drag handlers.

Preserved on revert: BACKLOG.md ACs, UAT plan with PASS record, this chapter, roadmap. Only code + tests + CSS would be removed.

## 36.8 Known follow-ups (intentional, not blockers)

- **B-052 hash semantics**: `hashItem` omits `sortOrder` by design (it's a render-order field, not an item-content field). A future optimisation could add sortOrder to the hash so reorder broadcasts trigger diffAndPatch-style patches instead of the current `renderAll` fallback. Deferred — the current approach (drop handler explicitly calls `renderAll`) is correct and atomic per the UAT evidence.
- **Drag preview customisation**: v2 uses the browser's default drag ghost (the dragged row). A custom preview (e.g., semi-transparent clone with item count) is possible via `e.dataTransfer.setDragImage()`. Deferred to B-025 multi-item drag in S24 where the count is meaningful.
- **Touch / mobile support**: out of scope per CLAUDE.md desktop-first rule. Native HTML5 DnD doesn't fire `drag*` events on touch; a separate Pointer Events API implementation would be a future item if mobile becomes a target.

## 36.9 Files changed

```
shared/messages.js                              +9 (MSG_BULK_REORDER_ITEMS)
shared/sort-order.js                            NEW
background/storage/items.js                     +~100 (bulkReorderItems)
background/storage/index.js                     +1
background/messages/storage-handlers.js         +4 (register handler + write-type + broadcast)
sidepanel/sidepanel.js                          +~260 (v2 drag handlers + helpers + state)
sidepanel/sidepanel.css                         +~20 (#item-list relative + .drop-indicator--item)
tests/sort-order.test.js                        NEW (14 tests)
tests/b030-item-drag-reorder.test.js            NEW (8 tests)
docs/UAT_B-030.md                               NEW (9-case plan with perf probes)
docs/design/36-b-030-item-drag-reorder-v2.md    NEW (this chapter)
```
