# Sprint 24 — R4 Findings (Deduplicated)

Drag stack sprint. Findings from parallel R4 reviewers:
- B-031 Wave 2a: [code-reviewer], [security-reviewer], [qa-reviewer]
- B-032 Wave 2b: [code-reviewer], [security-reviewer] (Fast Track, qa-reviewer skipped)
- B-025 Wave 2c: [code-reviewer], [security-reviewer], [qa-reviewer]

---

## B-031 — Group drag-reorder + nesting via drag

### CRITICAL (must fix before R5)

_None._

### HIGH (must fix before R5)

| # | File | Finding | Fix | Flagged by |
|---|------|---------|-----|------------|
| B-031-H1 | `sidepanel/sidepanel.js:4773–4775` (dragend cancel branch) | **Cleanup-order inversion.** `_groupDragState = null` is set **before** `_cleanupGroupDragDom()` is called; inside cleanup, the `if (_groupDragState)` guard skips rAF cancel + scroll listener removal → leaked scroll listeners + stale rAF on Escape-cancel / out-of-bounds release. Drop handler (line 4636) has the correct order; comment at 4762–4764 already describes the fix. Same class of bug as B-030 UAT surfaced. | Swap: `_cleanupGroupDragDom(); _groupDragState = null;` — match drop handler pattern. | code-reviewer, security-reviewer, qa-reviewer |
| B-031-H2 | `background/storage/groups.js:293–307` (`bulkReorderGroups`) | **Missing `MAX_BULK_INPUTS` cap.** Every sibling bulk handler (`bulkCreateItems`, `bulkDeleteItems`, `bulkUpdateItems`, `bulkReorderItems`) imports `MAX_BULK_INPUTS` and throws `ERR_VALIDATION` on oversize payloads. `bulkReorderGroups` accepts unbounded array — DoS surface (10k+ element validation + normalisation loops). | Import `MAX_BULK_INPUTS` from `./shapes.js`; add `if (updates.length > MAX_BULK_INPUTS) throw new StorageError(ERR_VALIDATION, ...)` after `Array.isArray` check. Mirrors `items.js:565–567`. | security-reviewer |
| B-031-H3 | `sidepanel/sidepanel.js:5150–5158` (`_groupDragTick` REORDER_BELOW) | **Live `getBoundingClientRect` call inside rAF tick, outside rect cache.** Violates R2 §38.6 perf assertion — all `getBoundingClientRect` in group-drag path must be inside `_buildGroupDragRectCache` or tick's cache-rebuild branch. AC13 mandates ≤ 16 ms P95 dragover; forced layout on every REORDER_BELOW frame could violate it. | Extend `_buildGroupDragRectCache` to snapshot `.group-section` bottom edges alongside `.group-header` rects; consume cached value in `_groupDragTick` instead of live call. | qa-reviewer, code-reviewer (as M-1) |
| B-031-H4 | `sidepanel/sidepanel.js:5185` (`_computeGroupDropTarget`) | **Ungrouped NEST hover returns `null`, no REJECT indicator.** UAT-10 + QA-2d spec mandates rejection feedback on the Ungrouped header. Current code silently ignores the hover → UAT-10 will fail. | Return `{ targetGroupId, mode: 'REJECT' }` for `__ungrouped__` instead of `null`, so `_groupDragTick` applies the `.group-header--nest-reject` class. | qa-reviewer |

### MEDIUM (fix if time permits)

| # | File | Finding | Fix | Flagged by |
|---|------|---------|-----|------------|
| B-031-M1 | `sidepanel/sidepanel.js:2946` | **`.group-drag-handle` title attribute missing "or nest".** AC16 spec: `"Drag to reorder or nest (keyboard reorder not yet available)"`. Shipped: `"Drag to reorder (keyboard reorder not yet available)"`. | Update to `"Drag to reorder or nest (keyboard reorder not yet available)"`. | qa-reviewer |
| B-031-M2 | `background/storage/groups.js:309, 322–328` | **Duplicate-id handling silently tolerant.** Two `updates` with same `id` → `updated` array pushes twice, `updateById` Map silently coalesces. Leaks misleading response shape; combined with H-2 makes duplicated-id payload shape confusing. | Dedupe `updates` at entry (preferred; matches `bulkUpdateItems`), OR reject duplicates with `ERR_VALIDATION`. | security-reviewer |
| B-031-M3 | `background/storage/groups.js:338` (`assertDepthAndCycle` loop) | **Cross-update cycle validation gap.** Pre-mutation validation uses pre-snapshot for every update; cross-update cycles can slip through (A→B's parent, B→A's parent in one payload). Current UX only ever mutates one group's `parentId` per drag, so this is theoretical in practice. | Reject any payload that attempts to change >1 group's `parentId` in a single call (simpler + matches drag UX). | security-reviewer |
| B-031-M4 | `sidepanel/sidepanel.js:4655–4679` (broadcast-race guard refresh) | **`_groupDragState.draggedGroup` reference not updated after `_cachedGroups` refresh.** `state.draggedGroupId` (string) is safe; `state.draggedGroup` object ref stays stale. Only used during drag-tick phase (already complete by drop time), so not a data-correctness bug but a latent trap. | After `_cachedGroups = freshGroups`, also update `state.draggedGroup = freshDragged`. | code-reviewer |
| B-031-M5 | `background/messages/storage-handlers.js:211–212` | **No payload shape validation at dispatcher.** `p.updates` passed straight without `if (!('updates' in p)) throw` gate. Implicit validation relies on storage-layer's `Array.isArray` check — works but inconsistent with other handlers that validate explicitly. | Optional — add explicit dispatcher guard for symmetry with `MSG_PROMOTE_TAB` / `MSG_DEMOTE_ITEM`. | security-reviewer |
| B-031-M6 | `sidepanel/sidepanel.js:4665–4738` (drop handler error paths) | **Toast copy inconsistency.** Broadcast-race guard shows "try again"; primary error path shows "reverting". Intentional (race guard aborted before write; primary path wrote-and-reverted) but no code comment documents the distinction. | Document the distinction with an inline comment, or align copy. | qa-reviewer |

### LOW (defer)

| # | File | Finding | Flagged by |
|---|------|---------|------------|
| B-031-L1 | `sidepanel/sidepanel.js:5154` | `querySelector` on group section runs inside `_groupDragTick` (guarded by skip-no-op). Paired with H-3 rect-cache extension; will disappear with the H-3 fix. | code-reviewer |
| B-031-L2 | `sidepanel/sidepanel.js:4770` | Comment says "Same null-after-cleanup pattern" but code does the opposite. Fix alongside H-1 by updating the comment to match actual behavior. | code-reviewer |
| B-031-L3 | `sidepanel/sidepanel.js:4462–4470` | `validReorderTargetIds` excludes `__ungrouped__` automatically because it's not in `_cachedGroups`. No comment explains why this is safe — future maintenance trap. | qa-reviewer |
| B-031-L4 | `sidepanel/sidepanel.js` drop NEST path | D-4 optimistic `collapsedGroups.delete()` before commit; revert on failure. Documented §38.9 F-9 cosmetic-only. UAT-2 validates round-trip. No code change needed. | qa-reviewer |
| B-031-L5 | `sidepanel/sidepanel.js` | `elementFromPoint` called once per rAF tick (60/sec) — within budget. No action. | qa-reviewer |
| B-031-L6 | `background/storage/groups.js:309` | `new Map(updates.map(u => [u.id, u]))` silently shadows dup ids — see M-2. | security-reviewer |
| B-031-L7 | `sidepanel/sidepanel.js:5037–5040` | `elementFromPoint` race on broadcast during drag — mitigated by `_pendingGroupsRender` defer + broadcast-race guard. | security-reviewer |

---

## B-032 — Auto-scroll during drag

### CRITICAL / HIGH

_None._

### MEDIUM

| # | File | Finding | Fix | Flagged by |
|---|------|---------|-----|------------|
| B-032-M1 | `sidepanel/sidepanel.js:4868` (`_maybeAutoScroll`) | **`scrollHeight` / `clientHeight` read per frame.** Layout geometry reads inside rAF callback. Correct read-before-write ordering avoids thrashing, but `maxScroll` only changes when container content-height changes; could be hoisted to `_buildDragRectCache` alongside `containerRect` to eliminate per-frame geometry queries. Minor optimisation, not a correctness defect. | Hoist to `_dragRectCache`. | code-reviewer |
| B-032-M2 | (governance) | Working tree contains co-mingled B-031 + B-032 + B-025 uncommitted changes. Reviewer flagged concern that B-031 qa-review coverage might have been missed — but it was not: B-031 qa-review ran earlier in parallel and is captured in this sprint-24 findings file. No action needed; noted for future sprints to consider committing between items. | N/A — noted. | code-reviewer |

### LOW

| # | File | Finding | Flagged by |
|---|------|---------|------------|
| B-032-L1 | `sidepanel/sidepanel.js:4856–4860` | Top-edge branch cites AC3 formula in comment; bottom-edge branch structurally identical but no comment. Trivial readability fix. | code-reviewer |
| B-032-L2 | `sidepanel/sidepanel.js:301–307` | `AUTO_SCROLL_EDGE_ZONE_PX` + `AUTO_SCROLL_MAX_SPEED` declared between unrelated state sections; co-location comment would improve discoverability. | code-reviewer |

[security-reviewer] clean: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW. All SEC-1 through SEC-10 PASS.

**Tier rule**: Fast Track skips qa-reviewer. No qa-reviewer findings to dedupe.

---

## B-025 — Multi-item drag as single unit

### CRITICAL

_None._

### HIGH (must fix before R5)

| # | File | Finding | Fix | Flagged by |
|---|------|---------|-----|------------|
| B-025-H1 | (missing tests) | **`tests/b025-multi-item-drag.test.js` does not exist + `computeMultiItemReorder` not imported/tested in `tests/sort-order.test.js`.** §37.6 specifies 7 AC17 cases + 4 pure-helper cases. This is an R5 deliverable by [test-engineer] per pipeline role split — R3 [frontend-engineer] correctly did not author tests. Flagging here as a process tracker: R5 must author before B-025 can be marked done. | Launch R5 [test-engineer] for B-025 to author the missing tests. | code-reviewer |
| B-025-H2 | `sidepanel/sidepanel.js:5165` (`_commitReorderAndRender` catch block) | **Stale `[tab-junkie:b030]` label in console.warn.** Shared helper is called from both B-030 single-item and B-025 multi-item drop paths; B-025 failures are misattributed to B-030. | Change label to `[tab-junkie:item-drag]` (neutral) or `[tab-junkie:b030/b025]`. | code-reviewer |
| B-025-H3 | `sidepanel/sidepanel.js:4639, 5056–5062` (`_computeDropTarget` + drop handler) | **AC9 violation — multi-drag onto Open Tabs executes partial demote instead of no-op.** `_computeDropTarget` checks only `_cachedLiveStates[_itemDragState.itemId]` (the initiator); if initiator is saved+live, returns `{type:'openTabs'}` regardless of `isMulti`. Drop handler then dispatches `MSG_DEMOTE_ITEM` for the initiator only — demoting 1 of N items silently. AC9 mandates no-op (no write, no dispatch) for multi-drag onto Open Tabs. | In `_computeDropTarget`: if `_itemDragState.isMulti`, return `null` when hit intersects Open Tabs section. | qa-reviewer |

### MEDIUM (fix if time permits)

| # | File | Finding | Fix | Flagged by |
|---|------|---------|-----|------------|
| B-025-M1 | `sidepanel/sidepanel.js:5153–5175` (`_commitReorderAndRender`) | **Selection not cleared after successful multi-drop.** UAT-8 explicitly expects selection to clear post-drop. `renderAll` calls `_updateBulkBar()` but `_selection` is never cleared → moved items remain highlighted and bulk bar shows stale count. | After `renderAll` in success path, add `_selection.clear(); _updateBulkBar();`. | qa-reviewer |
| B-025-M2 | `shared/sort-order.js:179` (`computeMultiItemReorder`) | **Aborts entire reorder on first missing id.** Concurrent delete of any payload member → returns `[]` → drop handler silently no-ops. No user feedback. | Skip missing ids and proceed with remainder, OR pre-validate in drop handler with toast if any missing. | qa-reviewer |
| B-025-M3 | `sidepanel/sidepanel.js:4494–4503` (ghost getBoundingClientRect) | **Ghost rect may return zero-width before first layout.** `halfWidth = 0` → drag image offset at x=0 (left edge, not center). Typically works due to sync layout reflow but fragile with large titles / custom fonts. | `const w = ghostEl.offsetWidth || ghostEl.getBoundingClientRect().width || 80;`. | code-reviewer, qa-reviewer |
| B-025-M4 | `sidepanel/sidepanel.js:5071` (`_computeDropTarget` payloadSet guard) | **Defensive `_itemDragState.payloadSet &&` guard masks invariant.** `_computeDropTarget` is only callable when `_itemDragState !== null`, and state is always constructed with `payloadSet: new Set(...)`. The `&&` guard silently passes if payloadSet is missing, hiding refactor failures. | Remove the `&&` guard; rely on invariant. | code-reviewer |

### LOW

| # | File | Finding | Flagged by |
|---|------|---------|------------|
| B-025-L1 | `shared/sort-order.js:177–181` | O(N·M) `items.find()` inside dragged-ids loop. Within MAX_BULK_INPUTS=500 cap — sub-100ms worst case. Mitigate with `Map<id, item>` if cap is raised. | security-reviewer |
| B-025-L2 | `sidepanel/sidepanel.js:4494–4508` | Ghost element appendChild → queueMicrotask detach. No throw paths between them in the happy path. Leak only possible under pathological runtime failure. | security-reviewer |
| B-025-L3 | (CSS token deviation) | R2 §37.3 D-3 spec lists `--surface-2` / `--accent-bg` / `--accent-fg` but implementation correctly mapped to `--bg-secondary` / `--accent` / `--on-accent` (actual tokens). R6 must update chapter D-3 table to reflect shipped tokens. | code-reviewer, qa-reviewer |
| B-025-L4 | `sidepanel/sidepanel.js:4689–4694` | Drop-handler re-sort of `payloadItemIds` is redundant when no broadcast-race occurred (cheap insurance, O(N log N) bounded). | code-reviewer |
| B-025-L5 | `sidepanel/sidepanel.js:5192–5196` | `_clearMultiDragRowClasses` + `querySelectorAll('.item-row--dragging')` sweep — intentional belt-and-braces; noted for future maintainers. | code-reviewer |
| B-025-L6 | `shared/sort-order.js:172` | `computeMultiItemReorder` doctring says "caller must pre-validate" but drop handler does not. Doc/code mismatch. | qa-reviewer |
| B-025-L7 | `sidepanel/sidepanel.js:5143` | `document.body.appendChild` has no defensive guard for missing body. Negligible in sidepanel context. | code-reviewer |
