# §63 — B-134 Drag-and-Drop Reorder for Open Tabs and Floating Tabs (R2 Architecture)

**Sprint:** 40 · **Tier:** Full (M)
**Status:** R2 LOCKED 2026-04-30 — ready for R3
**Owner:** [solution-architect]
**Dependencies (all done):** §38 B-031 (group drag-reorder + indicator), §60 B-121 (`tj:floatingGroups` + `floatingMembers` resolver), §59 B-125 (`inheritedTabs` + `markInherited` / `pruneInherited`), §61 B-124 (floating-tab visual cue stable), §62 B-122 (drag-state contract + race-guard pattern), §35 B-007 (sub-group nesting)
**Related code:** `sidepanel/sidepanel.js`, `shared/messages.js`, `background/messages/storage-handlers.js`, `background/tabs/floating-groups.js`, `background/tabs/floating-members.js`, `background/tabs/tab-claims.js`, `background/storage/shapes.js`, `background/storage/migration.js`, `shared/sort-order.js` (NEW pure helper sibling)

---

## §63.1 Overview

B-134 makes saved-bookmark **live tab rows** (the synthetic `[data-floating="true"]` rows under saved-bookmark group sections, B-121 §60.5) and **Open Tabs section** rows directly draggable inside the sidepanel. Five mutually-exclusive drag operations:

| # | Op | Source | Drop target | Storage path | Browser API | inheritedTabs |
|---|----|--------|------------|--------------|-------------|----------------|
| 1 | **REORDER_OPEN** | Open Tabs row in window W | Open Tabs row in window W | none | `chrome.tabs.move(tabId, { index })` | unchanged |
| 2 | **REORDER_FLOATING** | floating row in group G | floating row in group G | `MSG_REORDER_FLOATING_MEMBERS { groupId: G, orderedTabIds }` (atomic write to `tj:floatingGroups` `sortOrder` field) | none | unchanged |
| 3 | **ATTACH** | Open Tabs row | floating area of group G | `MSG_MOVE_FLOATING_TAB { tabId, sourceGroupId: null, targetGroupId: G, insertIndex }` (atomic write — append record + `markInherited`) | none | `markInherited(tabId)` |
| 4 | **DETACH** | floating row in group G | Open Tabs section | `MSG_MOVE_FLOATING_TAB { tabId, sourceGroupId: G, targetGroupId: null, insertIndex }` (atomic write — remove record + `pruneInherited`) | none | `pruneInherited(tabId)` |
| 5 | **MOVE_FLOATING** | floating row in group G | floating area of group H | `MSG_MOVE_FLOATING_TAB { tabId, sourceGroupId: G, targetGroupId: H, insertIndex }` (single atomic detach+attach in one `writeTransaction`) | none | unchanged (already in set) |

**Constraints (per R1 LOCK):**

- Op 1 cross-window drops are **rejected silently** (snap-back, no toast, no `chrome.tabs.move` call). B-135 will lift that restriction.
- Ops 2–5 do **NOT** mirror to the browser tab strip. B-041 owns strip-mirroring.
- Saved-bookmark rows remain non-draggable (the existing `_itemDragState` continues to own that path; B-134 layers a NEW `_tabDragState` for tab-row drags). The two states are mutually exclusive.
- Group-drag (`_groupDragState`, B-031/B-122) is also mutually exclusive with `_tabDragState`.
- No new `manifest.json` permissions.

**Visual indicator.** Reuses the existing `.drop-indicator--item` element (`itemDragIndicatorEl`, `sidepanel/sidepanel.js:413-422`) — same `transform: translateY()` pattern used by `_itemDragState`. R3 may CSS-extend the indicator class for tab-row drag (e.g., a slightly different stroke style) but no new DOM element is required. AC1 / AC3 shape parity satisfied by reuse.

**Top R2 risks** (carried into §63.14 R3-VERIFY markers):

1. Schema bump — Case 2 confirmed (records lack `sortOrder`), so v2 → v3 governance bump + lazy migration is mandatory (§63.2). C-1a + C-1b apply.
2. Hit-test composition with B-122 PROMOTE intercept — the new `_computeTabDropTarget` MUST short-circuit BEFORE `_computeGroupPromoteTarget` ever fires for a tab drag (mode-exclusive flag).
3. AC7 race-guard third branch — three guards: tab closed mid-drag, broadcast race, cross-window reject — mirrors B-122 §62.9 F-5.

---

## §63.2 Schema impact (R2-VERIFY 1 outcome — **CASE 2 confirmed**)

### §63.2.1 — Disambiguation evidence

R2 first action read three sources to disambiguate Case 1 vs Case 2:

| Source | Finding |
|--------|---------|
| `background/storage/shapes.js:221-247` | `PARTITION_FLOATING_GROUPS` validator REQUIRES exactly: `groupId, windowId, tabIndex, url, savedAt`. OPTIONAL: `floatingTabId, parentItemId, itemId`. **No `sortOrder` field. No positional field.** |
| `background/tabs/floating-members.js:139-144` | `buildFloatingMembers` sorts each group's array by `(windowId, tabIndex)` — **uses live-tab geometric position from `LiveTabIndex`, NOT storage order, NOT any explicit positional field.** |
| `background/storage/migration.js:55-86, 67` | `KNOWN_VERSION = 2`. v1 → v2 (B-121 §60.4.7) added `floatingTabId` + renamed `itemId → parentItemId`. **No ordering field added.** |

**Verdict: Case 2.** B-134 MUST add an explicit positional field to the record schema.

### §63.2.2 — Field decision

**New field:** `sortOrder: number` on each `tj:floatingGroups` record.

- **Type:** finite number (consecutive integers `0, 1, 2, ...` per group bucket; the SW handler renormalises after every reorder write — same pattern as `bulkReorderItems` / `bulkReorderGroups`).
- **Sort order semantics:** ascending. `sortOrder: 0` is the topmost member of the group's floating area; the last index is the bottom. **Not** monotonically increasing across writes — every reorder normalises the bucket to `[0..N-1]` consecutive integers (matches `shared/sort-order.js#computeReorderUpdates` precedent).
- **Per-group bucket scope:** `sortOrder` is unique within a single `groupId` only. Two records in different groups may share `sortOrder: 0`. The renderer reads each bucket independently.
- **Rationale (vs. alternatives):**
  - `sortOrder: number` matches the existing per-bucket sort vocabulary used by `Item` and `Group` records (verified `background/storage/shapes.js:127, 134`). Reusable mental model.
  - A `Date.now()` ordinal would work but introduces drift / collisions on rapid drops — consecutive integers are safer.
  - Array-index reordering (rebuilding the storage array in-place per write) ALSO works without a new field, but R3 would need every reader to depend on storage iteration order — a fragile contract that ties on-disk shape to runtime sort. Explicit `sortOrder` is more defensive.

### §63.2.3 — C-1a Schema-version governance bump (mandatory)

The `tj:floatingGroups` record shape changes (new mandatory field on writes from B-134 onward; OPTIONAL on the read-side validator to preserve backward compatibility with v2 records that survive the upgrade). Per CLAUDE.md C-1a:

- **`KNOWN_VERSION` v2 → v3** in `background/storage/migration.js:67`. Add a third `MigrationStep` entry `{fromVersion: 2, toVersion: 3, migrate: (snapshot) => snapshot}` (no-op governance bump — actual data convergence is lazy per §63.2.4).
- **`defaultShape(PARTITION_META)` v2 → v3** in `background/storage/shapes.js:101` — the seed for `tj:meta.schemaVersion` on fresh installs. **Hardcoded literal** (per the existing comment: "not imported from migration.js to keep storage layer independent of migration runner").
- **`CHANGELOG.md` SW module-cache flush note** required at sprint close (technical-writer R7 Cycle): "After updating to v1.34.0, toggle the extension OFF then ON in `chrome://extensions` to ensure the SW module cache is flushed; otherwise the new tab-drag-reorder runtime path may not activate until the next browser restart." Same note pattern as B-121 §60.4.7.

### §63.2.4 — C-1b Data-migration strategy (mandatory)

**Chosen strategy:** **lazy migration** (CLAUDE.md C-1b option 2). The v2 → v3 step itself is a no-op (advances `tj:meta.schemaVersion` to 3); the data convergence happens on the read/write paths:

- **Reads (validator at `background/storage/shapes.js:221`):** `sortOrder` is OPTIONAL on the read-side validator. v2 records (no `sortOrder`) survive validation. **`buildFloatingMembers` uses a stable derived sortOrder** when reading legacy records — the derived value is `(windowId, tabIndex)` lexicographic, matching today's behavior; legacy records sort identically to v2 behavior, no visual regression.
- **Writes:** Every new `appendFloatingGroup` write stamps `sortOrder` (computed as `current_max_sortOrder_in_group + 1` or `0` if the bucket is empty — the SW handler computes it; client never supplies it). Every `MSG_REORDER_FLOATING_MEMBERS` write renormalises the bucket to `[0..N-1]`. Every `MSG_MOVE_FLOATING_TAB` write renormalises BOTH source and target buckets atomically.
- **Eviction:** Legacy v2 records self-evict naturally — they live until their tab closes (which calls `pruneResolvedFloatingGroups` via `chrome.tabs.onRemoved` → `chrome.tabs.onClosed` cascade → `tab-events.js`). Once evicted, the record will not be re-created (the next opener-chain spawn writes a v3 record).
- **Why lazy over eager:** matches the precedent set by B-121 §60.4 / §60.14.3 (rationale a-c there). The `floatingGroups` partition is best-effort and reconciles on every SW boot; rewriting every record on cold-start is destructive and unnecessary.

### §63.2.5 — Validator extension (`background/storage/shapes.js:221-247`)

R3 MUST extend the `PARTITION_FLOATING_GROUPS` case to tolerate the new field as OPTIONAL on reads (matches the pattern for `floatingTabId` + `parentItemId` from B-121 §60.4.6):

```js
if ('sortOrder' in entry) {
  if (typeof entry.sortOrder !== 'number' || !Number.isFinite(entry.sortOrder)) {
    throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition} — sortOrder`);
  }
}
```

### §63.2.6 — Rollback plan (storage-schema)

If a v3 record makes it to disk and a forced rollback is required:
- Pre-S40 (v2) validator REJECTS the v3 record on read (it would treat `sortOrder` as an unknown field — actually no, validators today do not reject unknown fields; they only check the documented allow-list. Verified at `shapes.js:225` — the loop checks REQUIRED fields and OPTIONAL-typed fields but does not reject extra keys).
- Therefore, v2 → v3 is **forward-readable**: a downgraded v2 validator silently ignores `sortOrder`. **Acceptable.**
- Reverse data-shape compatibility = trivial. Rollback procedure: `git revert <r3-commit-sha>` + manual `KNOWN_VERSION` reset to 2 in a hotfix. Records carrying `sortOrder` continue to function in v2 mode.

---

## §63.3 Drag-state contract — `_tabDragState`

A NEW module-level state object, **mode-exclusive** with `_itemDragState` (B-030) and `_groupDragState` (B-031/B-122). At any time at most ONE of the three is non-null.

### §63.3.1 — Shape

```js
let _tabDragState = null;

/* Initialised in dragstart handler when the dragstart originates on
 * `.item-row[data-tab-id]` (Open Tabs row OR floating-tab row). */
_tabDragState = {
  /* IDENTITY */
  draggedTabId: number,        // chrome.tabs.Tab.id
  sourceMode: 'OPEN' | 'FLOATING', // where the drag started
  sourceWindowId: number,       // `data-window-id` from the dragged row
  sourceGroupId: string | null, // null when sourceMode === 'OPEN';
                                // groupId when sourceMode === 'FLOATING'
  cachedFloatingMembersGen: number, // snapshot of `_cachedFloatingMembersGen`
                                    // captured at dragstart for race-guard

  /* TICK STATE — updated each rAF */
  pendingMode: null | 'REORDER_OPEN' | 'REORDER_FLOATING' | 'ATTACH' | 'DETACH' | 'MOVE_FLOATING' | 'REJECT',
  pendingTargetWindowId: number | null,    // op 1 cross-window guard input
  pendingTargetGroupId: string | null,     // ops 3–5 (target group's id)
  pendingInsertIndex: number | null,       // 0..N — drop position in target bucket
  pendingTargetTabId: number | null,       // (debug only) tabId of the row above which we'd insert; null = "insert at end"

  /* INFRA */
  rafHandle: number | null,
  scrollListener: (() => void) | null,
};
```

### §63.3.2 — Lifecycle

| Event | Effect |
|-------|--------|
| `dragstart` on `.item-row[data-tab-id]:not([draggable="false"])` | Set `_tabDragState`; build `_tabDragRectCache` (§63.5); register passive scroll listener; set `e.dataTransfer.effectAllowed = 'move'`; defensive `setData('text/plain', String(tabId))` for Firefox-compat |
| `dragover` on `itemListEl` | Capture `(x, y)`; schedule rAF; tick computes `pendingMode` + visual indicator |
| `dragend` (any path) | Clear `_tabDragState`; remove scroll listener; hide indicator; `_tabDragRectCache = null` |
| `drop` on `itemListEl` | Race-guard third branch (§63.10); dispatch by `pendingMode`; cleanup as `dragend` |

### §63.3.3 — Mode-exclusivity guard

R3 MUST add a guard at the top of every dragstart handler that checks the OTHER two states. Pattern (mirrors `_itemDragState` / `_groupDragState` precedent at `sidepanel.js:4424, 4438, 4462`):

```js
if (_itemDragState || _groupDragState) {
  e.preventDefault();
  return;
}
```

`buildOpenTabRow` and `buildFloatingTabRow` **do NOT currently set `row.draggable = true`** (verified at `sidepanel.js:2789-2856` and `:2881-2937`). R3 MUST add `row.draggable = true` to BOTH builders. Item-row drag remains the existing `row.draggable = true` at `sidepanel.js:2409` (saved-bookmark rows) — those rows continue to use `_itemDragState`, B-134 does not touch them.

### §63.3.4 — Saved-bookmark row exclusion

Saved-bookmark rows carry `data-item-id`. The dragstart handler MUST distinguish between three row classes by selector:

```js
const tabRow = e.target.closest('.item-row[data-tab-id]');
const itemRow = e.target.closest('.item-row[data-item-id]:not([data-floating])');
const groupSection = e.target.closest('[data-group-id]:not(.open-tabs-section)');
```

- `tabRow` non-null ⇒ B-134 path (this chapter) — `_tabDragState`.
- `itemRow` non-null ⇒ B-030 / B-025 / B-113 path — `_itemDragState` (unchanged).
- `groupSection` from drag-handle ⇒ B-031 / B-122 path — `_groupDragState` (unchanged).

A row carries either `data-tab-id` (Open Tabs / floating) OR `data-item-id` (saved bookmark). They are mutually exclusive — verified by reading `buildItemRow` (saved-bookmark builder, no `dataset.tabId` set) vs. `buildOpenTabRow` (no `dataset.itemId` set). Floating rows carry `data-tab-id` AND `data-floating="true"` AND `data-parent-item-id` — but they do NOT carry `data-item-id`, so the saved-bookmark selector excludes them.

---

## §63.4 Hit-test logic — `_computeTabDropTarget`

A NEW pure-DOM helper sibling to `_computeGroupDropTarget` (`sidepanel.js:5456`) and `_computeGroupPromoteTarget` (`sidepanel.js:5568`). Owned by `sidepanel/sidepanel.js`. Returns `null` (no valid target) or an object describing the drop.

### §63.4.1 — Signature

```js
/**
 * Hit-test for tab-row drag (B-134). Called from `_tabDragTick` only when
 * `_tabDragState !== null`. Returns null when the pointer is not over a
 * valid drop zone — caller hides indicator and clears pendingMode.
 *
 * @param {number} x  pointer clientX
 * @param {number} y  pointer clientY
 * @returns {null | TabDropTarget}
 *
 * @typedef {Object} TabDropTarget
 * @property {'REORDER_OPEN'|'REORDER_FLOATING'|'ATTACH'|'DETACH'|'MOVE_FLOATING'|'REJECT'} mode
 * @property {number|null} targetWindowId  // op 1 only; null otherwise
 * @property {string|null} targetGroupId   // ops 3 (target) / 4 (null) / 5 (target); null on REORDER_OPEN
 * @property {number}      insertIndex     // 0..N; index in target bucket
 * @property {number|null} pinnedRowTabId  // (debug) tabId of the row the indicator sits above; null = end-of-bucket
 */
```

### §63.4.2 — Hit-test priority order

The order matters — earlier branches short-circuit. R3 implements verbatim:

1. **Outside `#item-list` horizontally** → `null` (defensive — same pattern as `_computeGroupPromoteTarget:5575`).
2. **Pointer over a `.group-section`'s floating-area zone** (synthetic-row insertion zone, see §63.4.3) for some group G:
   - If `_tabDragState.sourceMode === 'OPEN'` → `mode: 'ATTACH'`, `targetGroupId: G`.
   - If `_tabDragState.sourceMode === 'FLOATING'` AND `G === sourceGroupId` → `mode: 'REORDER_FLOATING'`, `targetGroupId: G`.
   - If `_tabDragState.sourceMode === 'FLOATING'` AND `G !== sourceGroupId` → `mode: 'MOVE_FLOATING'`, `targetGroupId: G`.
   - In all sub-cases: compute `insertIndex` from the pointer Y vs. the floating-row stack inside the section's group-items container (see §63.4.4).
3. **Pointer over the `.open-tabs-section` interior** (anywhere inside `section#open-tabs-section`, excluding the header):
   - If `_tabDragState.sourceMode === 'OPEN'` → `mode: 'REORDER_OPEN'`. Compute `targetWindowId` from the row under pointer's `data-window-id` (or, if dropping into empty space, from the cluster nearest the pointer — see §63.4.5).
   - If `_tabDragState.sourceMode === 'FLOATING'` → `mode: 'DETACH'`. `targetGroupId: null`. `insertIndex` = position within the Open Tabs list (§63.4.5).
4. **Pointer over a saved-bookmark row** (`.item-row[data-item-id]:not([data-floating])`) — currently no operation defined for this drop. Return `null` (no-op fallthrough — drop is silently rejected). R3-VERIFY: if UAT surfaces user expectation that "drop onto a saved-bookmark row attaches to that bookmark's group floating area", change branch to `mode: 'ATTACH', targetGroupId: <bookmarkRowGroupId>`. Default disposition: do not auto-resolve; saved-bookmark rows are inert drop targets.
5. **Pointer over a `.group-header`** (without falling through to the section interior) — return `null`. Drop is silently rejected. (Targeting a group header for ATTACH is ambiguous w.r.t. the parent vs. child group — keep it inert; the user must drop on the floating-area zone.)
6. **All other zones** (gaps between sections, indicator gutter, etc.) → `null`.

### §63.4.3 — Floating-area zone definition

A "floating-area zone" for group G is the rectangle inside G's `.group-items` container that contains:
- All existing `.item-row[data-floating="true"]` (the floating rows).
- The space immediately AFTER the last floating row, up to the next saved-bookmark row OR the end of the `.group-items` container.
- If G has zero floating rows: the entire post-saved-rows region within `.group-items` (i.e., the gap between the last `.item-row[data-item-id]` and the inline empty-state fallback or the end of `.group-items`).

R3 uses the cache from §63.5 (`floatingZoneRects`) to test pointer Y inclusion.

### §63.4.4 — `insertIndex` computation for floating-area zones

For a floating-area zone of group G containing N floating rows:
- Pointer Y above the first floating row's vertical midline → `insertIndex: 0`.
- Pointer Y between row[i]'s midline and row[i+1]'s midline → `insertIndex: i + 1`.
- Pointer Y below the last floating row's midline → `insertIndex: N`.

For ATTACH on a group with zero floating rows: `insertIndex: 0`.

For REORDER_FLOATING: same midline math, but with the dragged row excluded (so dropping onto the dragged row's own slot returns the same `insertIndex` it started at — a same-position no-op handled at drop-dispatch time per §63.6).

### §63.4.5 — Open Tabs section drop zone

Open Tabs is a single flat list (`.open-tabs-list`) rendered for ALL windows together (verified `sidepanel.js:3175-3217`). Each row carries `data-window-id`. `insertIndex` math:
- Build the per-window subset by iterating `.open-tabs-list > .item-row[data-window-id="<W>"]` in DOM order (cached at drag start for the source window AND any window encountered).
- For DETACH: the Open Tabs list is the natural drop target. `targetGroupId: null`. The actual `chrome.tabs` strip ordering for DETACH is unchanged; insertIndex semantically locates where in the *cached* Open Tabs section the row will appear (it gets re-derived on the next `MSG_LIST_ITEMS` anyway, so this is mostly a UI hint — but R3 should still compute it to drive the indicator).
- For REORDER_OPEN: `targetWindowId` = the `data-window-id` of the row under pointer (or, if the pointer is in an empty cluster, the windowId of the cluster nearest the pointer). `insertIndex` = the position within the same-window subset.

### §63.4.6 — Composition with `_computeGroupDropTarget` / `_computeGroupPromoteTarget`

`_computeGroupDropTarget` and `_computeGroupPromoteTarget` are gated on `_groupDragState`. Since `_tabDragState` is mode-exclusive with `_groupDragState`, the group-drag helpers are guaranteed to return `null` (their first guard `if (!_groupDragState) return null;`) during a tab drag. **No interference; B-134 does not need to modify either group-drag helper.**

The dragover scheduler (`sidepanel.js:4419`) calls `_scheduleGroupDragTick`. R3 MUST add a parallel path that calls the new `_scheduleTabDragTick` when `_tabDragState !== null`. Simplest pattern:

```js
itemListEl.addEventListener('dragover', (e) => {
  if (_tabDragState) { _scheduleTabDragTick(e); return; }
  // existing _itemDragState / _groupDragState paths unchanged
});
```

---

## §63.5 sectionBottoms cache extension — `_tabDragRectCache`

A NEW per-drag rect cache, sibling to `_dragRectCache` (B-030) and `_groupDragRectCache` (B-031/B-122). Built lazily at dragstart and invalidated on scroll (passive scroll listener pattern, mirrored from `sidepanel.js:5226-5263`).

### §63.5.1 — Shape

```js
let _tabDragRectCache = null;

_tabDragRectCache = {
  containerRect: DOMRect,                // itemListEl.getBoundingClientRect()
  /* Per-group floating-area zone rects (one per group section that has a
     floating-area zone, regardless of whether floating rows are currently
     present). Key = groupId. Value = { top, bottom, rowMidlines: number[] }
     where rowMidlines is the Y midline of each existing floating row in
     DOM order. Used by §63.4.3 / §63.4.4. */
  floatingZoneRects: Map<string, { top: number, bottom: number, rowMidlines: number[], rowTabIds: number[] }>,
  /* Open Tabs section interior rect + per-window row clusters. */
  openTabsRect: DOMRect | null,
  openTabsByWindow: Map<number, { rowMidlines: number[], rowTabIds: number[] }>,
  invalid: boolean,
};
```

### §63.5.2 — Build path

```js
function _buildTabDragRectCache() {
  const containerRect = itemListEl.getBoundingClientRect();
  const floatingZoneRects = new Map();
  const openTabsByWindow = new Map();

  // Per-group floating zones
  for (const section of itemListEl.querySelectorAll('.group-section')) {
    const groupId = section.dataset.groupId;
    if (!groupId || groupId === '__ungrouped__') continue;
    const itemsContainer = section.querySelector(':scope > .group-items');
    if (!itemsContainer) continue;
    const floatingRows = itemsContainer.querySelectorAll(':scope > .item-row[data-floating="true"]');

    // Zone vertical bounds (top: after last saved-bookmark row OR top of items;
    // bottom: end of items container)
    const savedRows = itemsContainer.querySelectorAll(':scope > .item-row[data-item-id]:not([data-floating])');
    const top = savedRows.length > 0
      ? savedRows[savedRows.length - 1].getBoundingClientRect().bottom
      : itemsContainer.getBoundingClientRect().top;
    const bottom = itemsContainer.getBoundingClientRect().bottom;

    const rowMidlines = [];
    const rowTabIds = [];
    for (const row of floatingRows) {
      const r = row.getBoundingClientRect();
      rowMidlines.push((r.top + r.bottom) / 2);
      rowTabIds.push(Number(row.dataset.tabId));
    }
    floatingZoneRects.set(groupId, { top, bottom, rowMidlines, rowTabIds });
  }

  // Open Tabs section per-window clusters
  const openTabsSection = document.getElementById('open-tabs-section');
  const openTabsRect = openTabsSection ? openTabsSection.getBoundingClientRect() : null;
  if (openTabsSection) {
    const list = openTabsSection.querySelector('.open-tabs-list');
    if (list) {
      for (const row of list.querySelectorAll(':scope > .item-row[data-tab-id]')) {
        const wid = Number(row.dataset.windowId);
        if (!Number.isFinite(wid)) continue;
        if (!openTabsByWindow.has(wid)) openTabsByWindow.set(wid, { rowMidlines: [], rowTabIds: [] });
        const cluster = openTabsByWindow.get(wid);
        const r = row.getBoundingClientRect();
        cluster.rowMidlines.push((r.top + r.bottom) / 2);
        cluster.rowTabIds.push(Number(row.dataset.tabId));
      }
    }
  }

  _tabDragRectCache = { containerRect, floatingZoneRects, openTabsRect, openTabsByWindow, invalid: false };
}
```

### §63.5.3 — Cache invalidation

Same passive-scroll-listener pattern as B-122 §62.2.4:

```js
_tabDragState.scrollListener = () => {
  if (_tabDragRectCache) _tabDragRectCache.invalid = true;
};
itemListEl.addEventListener('scroll', _tabDragState.scrollListener, { passive: true });
```

`_tabDragTick` tests `_tabDragRectCache.invalid` at the top and rebuilds via `_buildTabDragRectCache()` if needed. **No tick-time DOM reads outside the cache** — O(1) per pointer move once the cache is warm.

### §63.5.4 — Performance acceptance

Per CLAUDE.md "Performance Standards":
- Drag-tick handler O(1) per pointer move via cache (matches B-122 §62 + B-031 §38 patterns).
- Cache build O(N_groups + N_floatingMembers + N_openTabs) at dragstart only — bounded by typical N (≤ 20 groups, ≤ 30 floating members, ≤ 100 open tabs).
- Single `writeTransaction` per drop dispatch (atomic, all-or-nothing).
- No B-052 search-cache regression (unrelated path).
- No B-021 filter-debounce impact (different code path).

---

## §63.6 Drop handler — five ops

The drop handler lives in the existing `itemListEl.addEventListener('drop', …)` block (`sidepanel.js:4598+`). R3 adds a NEW top-level branch BEFORE the existing `_groupDragState` / `_itemDragState` branches, gated on `_tabDragState`.

### §63.6.1 — Pseudocode

```js
itemListEl.addEventListener('drop', async (e) => {
  // B-134 — tab-row drag drop dispatch
  if (_tabDragState) {
    e.preventDefault();
    const state = _tabDragState;
    _tabDragState = null;
    _hideTabDragVisuals();
    if (state.scrollListener) {
      itemListEl.removeEventListener('scroll', state.scrollListener);
    }

    // No pendingMode → user dropped in dead zone. Silent no-op.
    if (state.pendingMode === null || state.pendingMode === 'REJECT') return;

    // Race-guard third branch (see §63.10)
    const guard = await _validateTabDropPreflight(state);
    if (!guard.ok) {
      _showTabDragRejectToast(guard.reason);
      return;
    }

    // Dispatch by pendingMode
    switch (state.pendingMode) {
      case 'REORDER_OPEN':
        // Op 1 — chrome.tabs.move
        if (state.pendingTargetWindowId !== state.sourceWindowId) {
          _showTabDragRejectToast('Cross-window drag is not supported yet.');
          return;
        }
        try {
          await chrome.tabs.move(state.draggedTabId, { index: state.pendingInsertIndex });
        } catch (err) {
          console.warn('[tab-junkie] chrome.tabs.move failed', err);
        }
        return;

      case 'REORDER_FLOATING': {
        // Op 2 — MSG_REORDER_FLOATING_MEMBERS
        const orderedTabIds = _computeReorderFloatingPayload(
          state.sourceGroupId,
          state.draggedTabId,
          state.pendingInsertIndex,
        );
        if (orderedTabIds.length === 0) return; // no-op (single-member group, etc.)
        await sendMessage(MSG_REORDER_FLOATING_MEMBERS, { groupId: state.sourceGroupId, orderedTabIds });
        return;
      }

      case 'ATTACH':       // Op 3
      case 'DETACH':       // Op 4
      case 'MOVE_FLOATING': // Op 5
        await sendMessage(MSG_MOVE_FLOATING_TAB, {
          tabId: state.draggedTabId,
          sourceGroupId: state.sourceGroupId,            // null for ATTACH
          targetGroupId: state.pendingTargetGroupId,     // null for DETACH
          insertIndex: state.pendingInsertIndex,
        });
        return;
    }
  }

  // Existing paths follow unchanged (group drag, item drag).
});
```

### §63.6.2 — `_computeReorderFloatingPayload` helper

```js
/* Reads the current floating member order from `_cachedFloatingMembers`
   for the given groupId; returns the new orderedTabIds array with the
   dragged tab moved to the requested insertIndex.

   This is a sidepanel-side derivation of the new order; the SW handler
   re-derives from authoritative storage (no trust in client-supplied
   order beyond the message validator's allow-list). */
function _computeReorderFloatingPayload(groupId, draggedTabId, insertIndex) {
  const members = (_cachedFloatingMembers && _cachedFloatingMembers[groupId]) || [];
  const tabIds = members.map((m) => m.tabId);
  const currentIdx = tabIds.indexOf(draggedTabId);
  if (currentIdx === -1) return [];
  // Splice out then splice in. Account for the index-shift when inserting
  // after the source index.
  tabIds.splice(currentIdx, 1);
  const adjusted = currentIdx < insertIndex ? insertIndex - 1 : insertIndex;
  tabIds.splice(adjusted, 0, draggedTabId);
  return tabIds;
}
```

Same-position no-op = `currentIdx === adjusted` ⇒ the resulting `tabIds` equals the input order ⇒ the SW handler still writes (no-op write is acceptable; renormalises to the same `[0..N-1]`). R3 may add an early return for the same-order case as a perf optimisation; not required.

### §63.6.3 — Op 1 cross-window guard

The hit-test in §63.4.5 sets `pendingTargetWindowId` from the row under pointer. The drop handler then checks `pendingTargetWindowId !== sourceWindowId` → silent reject (toast). The hit-test ALSO returns `mode: 'REJECT'` directly when `targetWindowId !== sourceWindowId` so the indicator reflects the rejection visually before the user releases. **Both layers** are required: hit-test drives indicator UX; drop handler is the storage-write guarantor.

`_computeTabDropTarget` returns `mode: 'REJECT'` (not `null`) when the pointer is over an Open Tabs row in a different window during a `sourceMode: 'OPEN'` drag. R3 paints a reject visual via the indicator (e.g., red tint or `:not(.is-allowed)` class).

---

## §63.7 Message contracts

### §63.7.1 — `MSG_REORDER_FLOATING_MEMBERS` (NEW)

```js
/**
 * B-134 — reorder floating-tab members within a single group.
 *
 * Payload validated by the SW handler:
 *  - groupId: string, non-empty, must resolve to an existing group.
 *  - orderedTabIds: number[]; finite, non-NaN. Must equal the set of
 *    tabIds currently associated with the group's floating members
 *    (no additions, no removals — pure reorder).
 *
 * Atomicity: single writeTransaction. The handler reads
 * tj:floatingGroups, filters records to the given groupId, asserts the
 * tabId set matches orderedTabIds (race-guard against a tab that closed
 * mid-drag — handler returns ERR_NOT_FOUND if any tabId in the payload
 * has been pruned), assigns sortOrder by orderedTabIds index, writes
 * back atomically.
 *
 * Response: { reordered: true } | { reordered: false, reason: string }
 *
 * @typedef {Object} ReorderFloatingMembersRequest
 * @property {string}   groupId
 * @property {number[]} orderedTabIds  // sortOrder = index in this array
 *
 * @typedef {Object} ReorderFloatingMembersResponse
 * @property {boolean}  reordered
 * @property {string}  [reason]    // present when reordered=false
 */
export const MSG_REORDER_FLOATING_MEMBERS = 'tj/reorderFloatingMembers';
```

**Allow-list direction (C-7):** the handler reads the storage's authoritative records, then maps `orderedTabIds[i] → sortOrder = i`. The client supplies the desired order; the handler validates the set membership and writes consecutive integers. **No deny-list.** Records not in `orderedTabIds` are not written (they belong to a different group OR are unrelated).

**Scope:** `SCOPE.ITEMS` (mirrors `MSG_BULK_REORDER_ITEMS`). On success the SW broadcasts the standard liveState scope so all open surfaces re-fetch.

### §63.7.2 — `MSG_MOVE_FLOATING_TAB` (NEW)

```js
/**
 * B-134 — atomic detach+attach of a floating tab between groups (or
 * between a group and Open Tabs in either direction).
 *
 * Payload validated by the SW handler:
 *  - tabId: number, finite. The Chrome tabId of the dragged row.
 *  - sourceGroupId: string|null. null → ATTACH (op 3); string → DETACH
 *    (when targetGroupId is null) OR MOVE_FLOATING (when both are non-null).
 *  - targetGroupId: string|null. null → DETACH (op 4); string → ATTACH
 *    (op 3) OR MOVE_FLOATING (op 5).
 *  - insertIndex: number, finite, >= 0. Position in the target bucket
 *    (ignored when targetGroupId is null — DETACH does not need a position;
 *    Open Tabs ordering is derived from chrome.tabs strip).
 *
 * Reject if both sourceGroupId === null AND targetGroupId === null.
 * Reject if sourceGroupId === targetGroupId (same-group move is op 2,
 * dispatch via MSG_REORDER_FLOATING_MEMBERS instead).
 *
 * Atomicity: single writeTransaction over PARTITION_FLOATING_GROUPS.
 *  - ATTACH (op 3): append a v3 record with sortOrder = insertIndex,
 *    renumber the target bucket. Call markInherited(tabId).
 *  - DETACH (op 4): remove the source group's record, renumber the source
 *    bucket. Call pruneInherited(tabId).
 *  - MOVE_FLOATING (op 5): remove from source + append to target, both
 *    bucket renumbers in the same writeTransaction. inheritedTabs unchanged
 *    (was already in set when in source group).
 *
 * Response: { moved: true } | { moved: false, reason: string }
 *
 * @typedef {Object} MoveFloatingTabRequest
 * @property {number}      tabId
 * @property {string|null} sourceGroupId
 * @property {string|null} targetGroupId
 * @property {number}      insertIndex
 *
 * @typedef {Object} MoveFloatingTabResponse
 * @property {boolean}  moved
 * @property {string}  [reason]
 */
export const MSG_MOVE_FLOATING_TAB = 'tj/moveFloatingTab';
```

**Scope:** `SCOPE.ITEMS`. Broadcast is liveState-scoped (the renderer re-fetches `floatingMembers` + Open Tabs).

**`inheritedTabs` invariants:**
- Op 3 (ATTACH, sourceGroupId=null) → `markInherited(tabId)`. Symmetric to opener-chain spawn (B-013 → §59 path).
- Op 4 (DETACH, targetGroupId=null) → `pruneInherited(tabId)`. The tab returns to ordinary auto-claim eligibility.
- Op 5 (MOVE_FLOATING, both non-null) → no-op on `inheritedTabs` (`isInherited(tabId)` was already `true`; remains `true`).

### §63.7.3 — `shared/messages.js` typedef additions

R3 appends both new constants + JSDoc typedefs to `shared/messages.js`. No removals; no breaking changes to existing contracts.

### §63.7.4 — Handler scope routing

`background/messages/storage-handlers.js:108-126` (`SCOPE_BY_MESSAGE` map) gains:

```js
[MSG_REORDER_FLOATING_MEMBERS]: SCOPE.ITEMS,
[MSG_MOVE_FLOATING_TAB]: SCOPE.ITEMS,
```

`MUTATION_MESSAGES` set (`storage-handlers.js:135-138`) gains both constants — both are mutating writes.

---

## §63.8 SW handlers

Both handlers live in `background/messages/storage-handlers.js` and reuse `writeTransaction` + the `getParentItemId` helper from `floating-groups.js`. Two new helpers added to `floating-groups.js`.

### §63.8.1 — `MSG_REORDER_FLOATING_MEMBERS` handler (new case branch)

```js
case MSG_REORDER_FLOATING_MEMBERS: {
  if (!p || typeof p.groupId !== 'string' || p.groupId.length === 0) {
    return { reordered: false, reason: 'ERR_VALIDATION' };
  }
  if (!Array.isArray(p.orderedTabIds) || p.orderedTabIds.length === 0) {
    return { reordered: false, reason: 'ERR_VALIDATION' };
  }
  for (const id of p.orderedTabIds) {
    if (typeof id !== 'number' || !Number.isFinite(id)) {
      return { reordered: false, reason: 'ERR_VALIDATION' };
    }
  }
  const ok = await reorderFloatingMembers(p.groupId, p.orderedTabIds);
  if (!ok) return { reordered: false, reason: 'ERR_RACE' };
  return { reordered: true };
}
```

NEW exported helper in `background/tabs/floating-groups.js`:

```js
/**
 * B-134 — atomic reorder of floating-group records within one group.
 * Reads the current records for `groupId`, validates that the orderedTabIds
 * set matches the live-tab tabIds resolved by buildFloatingMembers (race
 * guard), then renumbers sortOrder = orderedTabIds.indexOf(tabId).
 *
 * @param {string} groupId
 * @param {number[]} orderedTabIds
 * @returns {Promise<boolean>}  true on success; false if the tabId set
 *   does not match the current floating members (race condition; client
 *   should re-fetch and retry).
 */
export async function reorderFloatingMembers(groupId, orderedTabIds) {
  // Build the set the client supplied
  const supplied = new Set(orderedTabIds);
  // Build the set the SW currently knows about (parity with buildFloatingMembers)
  const current = await buildFloatingMembers(/* items */);
  const currentTabIds = new Set((current[groupId] || []).map((m) => m.tabId));
  if (supplied.size !== currentTabIds.size) return false;
  for (const id of supplied) if (!currentTabIds.has(id)) return false;

  // Map orderedTabIds[i] → sortOrder = i; write atomically.
  // Records in PARTITION_FLOATING_GROUPS are NOT keyed by tabId — they're
  // keyed by floatingTabId. We need to resolve tabId → floatingTabId via
  // the current snapshot of `current[groupId]` (each member carries the
  // floatingTabId via the resolution path — R3-VERIFY: the FloatingMember
  // descriptor today does NOT carry floatingTabId; B-134 may need to add
  // it OR re-resolve at write time by matching record.windowId+tabIndex
  // against the live tab's geometry. See §63.14 R3-VERIFY 1.

  await writeTransaction([{
    partition: PARTITION_FLOATING_GROUPS,
    mutator: (records) => {
      const arr = Array.isArray(records) ? [...records] : [];
      // Identify records belonging to this group whose tab is in `supplied`
      // and whose floatingTabId is now known. For each, set sortOrder =
      // orderedTabIds.indexOf(tabId).
      // NOTE: §63.14 R3-VERIFY 1 — the resolution from tabId back to the
      // record's floatingTabId is the load-bearing step. R2 designs two
      // viable strategies; R3 picks one and adds a test pinning the choice.
      return _writeReorderedFloatingRecords(arr, groupId, orderedTabIds);
    },
  }]);

  return true;
}
```

The `_writeReorderedFloatingRecords` mutator is the load-bearing step. See §63.14 R3-VERIFY 1 for the resolution-strategy decision.

### §63.8.2 — `MSG_MOVE_FLOATING_TAB` handler (new case branch)

```js
case MSG_MOVE_FLOATING_TAB: {
  if (!p || typeof p.tabId !== 'number' || !Number.isFinite(p.tabId)) {
    return { moved: false, reason: 'ERR_VALIDATION' };
  }
  if (p.sourceGroupId !== null && (typeof p.sourceGroupId !== 'string' || p.sourceGroupId.length === 0)) {
    return { moved: false, reason: 'ERR_VALIDATION' };
  }
  if (p.targetGroupId !== null && (typeof p.targetGroupId !== 'string' || p.targetGroupId.length === 0)) {
    return { moved: false, reason: 'ERR_VALIDATION' };
  }
  if (p.sourceGroupId === null && p.targetGroupId === null) {
    return { moved: false, reason: 'ERR_VALIDATION' }; // no-op
  }
  if (p.sourceGroupId === p.targetGroupId) {
    return { moved: false, reason: 'ERR_VALIDATION' }; // same-group → use REORDER instead
  }
  if (typeof p.insertIndex !== 'number' || !Number.isFinite(p.insertIndex) || p.insertIndex < 0) {
    return { moved: false, reason: 'ERR_VALIDATION' };
  }

  const ok = await moveFloatingTab(p.tabId, p.sourceGroupId, p.targetGroupId, p.insertIndex);
  if (!ok) return { moved: false, reason: 'ERR_RACE' };

  // inheritedTabs side-effects post-write
  if (p.sourceGroupId === null && p.targetGroupId !== null) {
    markInherited(p.tabId);  // ATTACH
  } else if (p.targetGroupId === null && p.sourceGroupId !== null) {
    pruneInherited(p.tabId); // DETACH
  }
  // MOVE_FLOATING: no inheritedTabs change

  return { moved: true };
}
```

NEW exported helper in `background/tabs/floating-groups.js`:

```js
/**
 * B-134 — atomic move of a floating-group record between groups
 * (or between Open Tabs and a group). All three op variants (ATTACH /
 * DETACH / MOVE_FLOATING) collapse into one writeTransaction.
 *
 * @param {number} tabId
 * @param {string|null} sourceGroupId
 * @param {string|null} targetGroupId
 * @param {number} insertIndex
 * @returns {Promise<boolean>}  true on success; false if the live tab
 *   has been closed mid-call OR if the parent saved item is missing
 *   (target group has no parent bookmark to attach to).
 */
export async function moveFloatingTab(tabId, sourceGroupId, targetGroupId, insertIndex) {
  // Race guard: tab still alive
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return false; // tab closed
  }

  // For ATTACH (sourceGroupId === null): need a parentItemId to seed the
  // record. Look up the *first* saved item in targetGroupId — the new
  // record's parentItemId is that item's id. If no items exist in the
  // group, ATTACH fails (a group with zero saved items has no parent
  // bookmark to anchor a floating record under).
  let newParentItemId = null;
  if (sourceGroupId === null && targetGroupId !== null) {
    const items = await readPartition(PARTITION_ITEMS);
    const candidates = items.filter((it) => it.groupId === targetGroupId);
    if (candidates.length === 0) return false; // ATTACH to empty group rejected
    candidates.sort((a, b) => a.sortOrder - b.sortOrder);
    newParentItemId = candidates[0].id;
  }
  // For MOVE_FLOATING and DETACH: re-use the source record's parentItemId
  // (resolved from the existing record in the writeTransaction body below).

  const ok = await writeTransaction([{
    partition: PARTITION_FLOATING_GROUPS,
    mutator: (records) => {
      const arr = Array.isArray(records) ? [...records] : [];
      return _writeMoveFloatingRecord(arr, {
        tabId,
        sourceGroupId,
        targetGroupId,
        insertIndex,
        newParentItemId,
        liveTab: tab,
      });
    },
  }]);
  return !!ok;
}
```

The `_writeMoveFloatingRecord` mutator handles all three sub-paths. R3 implements per §63.14 R3-VERIFY 1 strategy (tabId → floatingTabId resolution).

### §63.8.3 — Renumber + sortOrder semantics

After every reorder/move write, the affected bucket is renumbered to consecutive integers `[0, 1, 2, ..., N-1]`. The handler does this in the mutator before returning the new array. Same pattern as `bulkReorderItems` / `bulkReorderGroups`. Records with no `sortOrder` (legacy v2) are stamped during renumber — opportunistic upgrade for any record passing through B-134's write paths.

### §63.8.4 — Renderer impact (`buildFloatingMembers` sort change)

R3 MUST update `background/tabs/floating-members.js:139-144` to sort by `sortOrder` (ascending) when present, falling back to `(windowId, tabIndex)` for legacy records:

```js
for (const arr of Object.values(out)) {
  arr.sort((a, b) => {
    // Records carrying explicit sortOrder are authoritative
    const aHasSO = typeof a.sortOrder === 'number';
    const bHasSO = typeof b.sortOrder === 'number';
    if (aHasSO && bHasSO) return a.sortOrder - b.sortOrder;
    if (aHasSO) return -1;
    if (bHasSO) return 1;
    // Legacy fallback (matches today's behavior)
    if (a.windowId !== b.windowId) return a.windowId - b.windowId;
    return a.tabIndex - b.tabIndex;
  });
}
```

The `FloatingMember` descriptor (§60.3.1) must include `sortOrder?: number` (OPTIONAL on the typedef so legacy descriptors continue to work). R3 propagates `sortOrder` through `buildFloatingMembers` (`floating-members.js:121-131` descriptor block) when present on the source record.

---

## §63.9 inheritedTabs integration

Explicit operation → `inheritedTabs` API mapping. R3 must implement this matrix verbatim — the SW handler is the single owner of the side-effect.

| Op | Direction | Side-effect | Where |
|----|-----------|-------------|-------|
| 1 (REORDER_OPEN) | Open Tabs → Open Tabs | none | n/a |
| 2 (REORDER_FLOATING) | floating → floating (same group) | none | n/a |
| 3 (ATTACH) | Open Tabs → floating area | `markInherited(tabId)` | `MSG_MOVE_FLOATING_TAB` handler, AFTER `writeTransaction` resolves successfully |
| 4 (DETACH) | floating → Open Tabs | `pruneInherited(tabId)` | `MSG_MOVE_FLOATING_TAB` handler, AFTER `writeTransaction` resolves successfully |
| 5 (MOVE_FLOATING) | floating → floating (different group) | none (already inherited) | n/a |

### §63.9.1 — Symmetry verification

- **Op 3 ATTACH** mirrors B-013 opener-chain spawn (§21.5 + §59 markInherited contract). Both paths write a floating-group record AND call `markInherited`. B-134 reuses the existing `markInherited` export — no duplication.
- **Op 4 DETACH** mirrors B-100 / B-101 / B-102 / B-103 demote paths in spirit (saved-item → floating). B-134's DETACH is its inverse: floating → Open Tabs. Calling `pruneInherited` is correct because the tab is no longer "owned" by an opener-chain parent — it's a free agent. Future auto-claim is again eligible.
- **Op 5 MOVE_FLOATING** preserves `inheritedTabs` membership (the tab was inherited from one parent; now inherited under a different parent — but the auto-claim gate is the same: skip auto-claim).

### §63.9.2 — Failure modes

If the `writeTransaction` fails (storage quota / corruption), the side-effect MUST NOT fire. R3 places the `markInherited` / `pruneInherited` call AFTER `await writeTransaction(...)` resolves successfully — never before. This matches B-013 §21.5 precedent (`appendFloatingGroup` resolves → `markInherited` fires; the call is gated on the write succeeding).

---

## §63.10 Race-guard third branch

Mirrors B-122 §62.9 F-5 pattern: every drop handler re-validates pre-write that the user-visible state still matches the storage truth. Three guards:

### §63.10.1 — Guard A: tab closed mid-drag

`chrome.tabs.get(state.draggedTabId)` BEFORE dispatching any of the five ops. If the tab no longer exists (`chrome.tabs.get` throws), abort with toast: "Tab closed during drag. Drop cancelled."

For op 1 (`chrome.tabs.move`) the move call itself will throw on a missing tab — but the explicit pre-check produces a cleaner toast and avoids a race where the move silently no-ops on a different `chrome.runtime.lastError` path.

### §63.10.2 — Guard B: broadcast race

If `_cachedFloatingMembersGen !== state.cachedFloatingMembersGen` AT drop time, the floating-members snapshot has advanced (another window or a `chrome.tabs.onCreated`/onRemoved fired mid-drag). Abort with toast: "The floating-tabs list changed during drag. Please retry." Same pattern as B-031 / B-122 broadcast-race guards (`sidepanel.js:4476-4508` is the existing reference).

For op 1: `_cachedOpenTabsGen` is the equivalent snapshot for Open Tabs. R3-VERIFY: confirm both `_cachedOpenTabsGen` and `_cachedFloatingMembersGen` exist as runtime guards — based on the existing precedent (`_cachedItemsGen` at `sidepanel.js:4298, 4391`), R3 likely needs to add `_cachedOpenTabsGen` + `_cachedFloatingMembersGen` if they're not already present.

### §63.10.3 — Guard C: cross-window guard (op 1 only)

`pendingTargetWindowId !== sourceWindowId` → silent reject + toast: "Cross-window drag is not supported yet (planned for B-135)."

This is layered: the hit-test (§63.4.5) ALREADY returns `mode: 'REJECT'` for cross-window drops — so the indicator paints reject visuals during drag. The drop handler re-checks defensively: if the user releases at the moment the pointer crosses a window boundary, the snapshot may carry the cross-window target in `pendingTargetWindowId`. The drop handler's check is the authoritative guarantor.

### §63.10.4 — Toast UX

R3 reuses the existing `_showToast` helper (verify present at `sidepanel.js`; standard toast surface). One distinct message per guard so UAT can distinguish the three reject paths. **Acceptance**: AC7 mandates "each guard fires correct toast in test harness"; R3 writes a test that asserts each guard's toast message string.

### §63.10.5 — Helper: `_validateTabDropPreflight`

```js
/**
 * Race-guard third branch for the tab-drag drop handler.
 * Returns { ok: true } when all three guards pass; { ok: false, reason }
 * otherwise. Caller surfaces `reason` in a toast and aborts the drop.
 */
async function _validateTabDropPreflight(state) {
  // Guard A — tab closed mid-drag
  try {
    await chrome.tabs.get(state.draggedTabId);
  } catch {
    return { ok: false, reason: 'tab-closed' };
  }
  // Guard B — broadcast race (open-tabs OR floating-members)
  if (state.cachedFloatingMembersGen !== _cachedFloatingMembersGen) {
    return { ok: false, reason: 'broadcast-race-floating' };
  }
  if (state.cachedOpenTabsGen !== _cachedOpenTabsGen) {
    return { ok: false, reason: 'broadcast-race-open' };
  }
  // Guard C — cross-window (op 1 only)
  if (state.pendingMode === 'REORDER_OPEN'
      && state.pendingTargetWindowId !== state.sourceWindowId) {
    return { ok: false, reason: 'cross-window' };
  }
  return { ok: true };
}
```

---

## §63.11 R2 Correctness Checklist (C-1..C-12)

| # | Check | Verdict | Note |
|---|-------|---------|------|
| C-1a | Storage schema versioned (governance) | **APPLIES — Case 2.** §63.2.3. `KNOWN_VERSION` v2 → v3 in `migration.js:67`; `defaultShape(PARTITION_META)` literal v3 in `shapes.js:101`; `CHANGELOG.md` SW module-cache flush note REQUIRED at sprint close. New `MIGRATION_STEPS` entry `{fromVersion: 2, toVersion: 3, migrate: (s) => s}` (no-op governance). |
| C-1b | Data-migration strategy chosen | **APPLIES — lazy.** §63.2.4. Read-side validator OPTIONAL on `sortOrder`; `buildFloatingMembers` derives sort from `(windowId, tabIndex)` for legacy records; new writes always stamp `sortOrder`; legacy records self-evict on tab close. **Strategy recorded.** R3 to verify behavioral parity. |
| C-2 | Message contracts typed | **APPLIES.** §63.7. Two new constants + JSDoc typedefs in `shared/messages.js`. `Request`/`Response` shapes documented. Validator shapes documented. No changes to existing contracts. |
| C-3 | SW cold-start safe | **APPLIES.** All B-134 SW state (`inheritedTabs`, `claimsMirror`) is ephemeral; no persistence change beyond the storage schema bump. The `MSG_REORDER_FLOATING_MEMBERS` and `MSG_MOVE_FLOATING_TAB` handlers re-read partitions on every call (do not assume in-memory mirrors are pre-populated). The renderer's drag state (`_tabDragState`) is sidepanel-module-local; SW restart loses it (acceptable — drag is ephemeral). |
| C-4 | ID stability | **APPLIES.** `tabId` is the runtime identity for B-134 (matches existing renderer contract from B-121); `floatingTabId` is the storage identity (B-121 §60.4). New `sortOrder` field is mutable and per-bucket-renormalised; no identity role. Records survive renumber writes. |
| C-5 | Manifest file references resolvable | **N/A.** No `manifest.json` changes. |
| C-6 | Permission minimization | **N/A.** No new permissions. `tabs` already declared (verified `manifest.json` — `tabs`, `bookmarks`, `storage`, `sidePanel`, `windows`-equivalent already present from B-001a + earlier sprints). `chrome.tabs.move` is granted by the existing `tabs` permission. |
| C-7 | Allow-list direction | **APPLIES.** Both new handlers validate payloads via positive checks (typeof, finite numbers, non-empty strings). The `MSG_REORDER_FLOATING_MEMBERS` SW handler re-derives the authoritative tabId set from `buildFloatingMembers` (server-trusted source) and accepts the client-supplied order ONLY if the set matches. **No deny-list.** |
| C-8 | SW-context feasibility | **APPLIES.** `chrome.tabs.move` is sidepanel-context (renderer-side, NOT SW). The other handlers run inside the SW; they use `readPartition`, `writeTransaction`, `chrome.tabs.get` — all SW-reachable APIs. No DOMParser / window / IntersectionObserver dependence. |
| C-9 | Empty-state design | **APPLIES.** Edge cases: (a) zero floating members in target group on ATTACH → `insertIndex: 0` (§63.4.4). (b) Single floating member, REORDER_FLOATING → no-op write returns `{reordered: true}` (drop-position is identical to source). (c) DETACH from a group whose last floating member is the dragged row → after-write the group has zero floating members; the renderer drops the floating-area zone naturally (§63.4.3 — empty floating area is still a valid ATTACH target). (d) Drop on Open Tabs section's empty state (no open tabs at all) → unreachable (the drag could not have started without at least one row). (e) ATTACH to a group with zero saved items → REJECT (§63.8.2 — there's no parent saved item to anchor the floating record under; toast "Cannot attach to empty group"). R4 [qa-reviewer] checks against this enumeration. |
| C-10 | Off-screen rect feasibility | **N/A.** No off-screen positioning; reuses the existing `.drop-indicator--item` element (mounted in-flow, B-030 precedent at `sidepanel.js:413-422`). The `setDragImage` use-case from B-025 §37 / B-122 is N/A here — the default browser drag image (the row itself) is acceptable for tab-row drag. R3-VERIFY: if UAT shows the default ghost is unclear (e.g., the row is too tall and the ghost overflows), R3 may layer a `setDragImage` snapshot — but only after applying the §B-025 UAT-8 fix (`void el.offsetHeight` reflow before snapshot). Default disposition: **no `setDragImage` for B-134 v1**. |
| C-11 | Popup-lifecycle message ordering | **N/A.** Sidepanel context, not popup. The dragstart and drop handlers do not fire any focus-shifting API mid-flow. `chrome.tabs.move` (op 1) does not transfer focus away from the sidepanel. |
| C-12 | Manifest declaration runtime-mutability | **N/A.** No manifest declarations involved. |

---

## §63.12 Fix-scope test-assertion enumeration (mandatory per CLAUDE.md B-119+B-126)

R3 cannot start until this enumeration is verified. The list was assembled from `grep -rn`-style audits of three contract surfaces: drag-state shape, message constants, and floating-record shape. **Total: 13 test files identified.**

### §63.12.1 — Drag-state shape pins

B-134 adds new `pendingMode` enum values. The existing pendingMode pin in `tests/b122-drag-to-root.test.js:231, 245` asserts source-text pattern `state.pendingMode === 'PROMOTE'` — B-134's new modes (`REORDER_OPEN`, `REORDER_FLOATING`, `ATTACH`, `DETACH`, `MOVE_FLOATING`) would not match this regex but would not break it either. Verified: **no test currently enumerates the full pendingMode union** (the b122 regex is targeted at the PROMOTE-specific source-text pin, not the enum closure).

| File:line | Assertion | Update required? |
|-----------|-----------|------------------|
| `tests/b122-drag-to-root.test.js:231` | regex pin on `state.pendingMode === 'PROMOTE'` | **No change.** B-122's pin is targeted; B-134's new branches do not affect it. |
| `tests/b122-drag-to-root.test.js:245` | regex pin on `pendingMode === 'PROMOTE' ? computeGroupPromote` | **No change.** Same reason. |
| `tests/b031-group-drag.test.js:251, 262` | comments referencing `isSubGroupDrag` blanket-NEST contract | **No change.** B-134 does not touch group-drag. |

### §63.12.2 — Message-contract pins

B-134 adds `MSG_REORDER_FLOATING_MEMBERS` + `MSG_MOVE_FLOATING_TAB` constants. The constants registry tests:

| File:line | Assertion | Update required? |
|-----------|-----------|------------------|
| `tests/messages-held.test.js` (full file) | Asserts message constants are defined and unique | **Add 2 entries.** R3 adds the new constants to whichever check lives in this file. |
| `background/messages/storage-handlers.js` `MUTATION_MESSAGES` set + `SCOPE_BY_MESSAGE` map | Source-of-truth for handler scope | **Add 2 entries.** Per §63.7.4. R3 verifies the unit/integration test that asserts these maps still passes after additions (likely no test asserts the FULL closure — additions are typically additive without test churn; R3 confirms). |

### §63.12.3 — Floating-record shape pins (Case 2 schema bump)

B-134 adds `sortOrder?: number` to the record schema. Test files that seed `tj:floatingGroups` records will continue to pass without `sortOrder` (the field is OPTIONAL on the read-side validator) — but tests that assert NEW writes should pin the new shape:

| File:line | Assertion | Update required? |
|-----------|-----------|------------------|
| `tests/floating-shape.test.js:20-90` | Asserts `appendFloatingGroup` write shape (post-S38: `floatingTabId`, `parentItemId`) | **Add `sortOrder` assertion.** Every `appendFloatingGroup` write should now stamp `sortOrder` (computed by SW). New test case asserts presence + numeric. |
| `tests/floating-multi.test.js:21-77` | Seed records via `seedPartitions` with explicit field set | **No change required** — seed records work without `sortOrder` (legacy fallback path covers them). R3 may opt to extend ONE seed test to assert legacy-fallback ordering parity with `(windowId, tabIndex)` — recommended for the lazy-migration regression guard. |
| `tests/floating-position.test.js:25, 47, 71` | Seed records via `seedPartitions` with explicit field set; `floatingTabId`/`parentItemId` stamped | **No change required.** Same reason. R3 may add a regression assertion that `buildFloatingMembers` sort order remains `(windowId, tabIndex)` for records lacking `sortOrder`. |
| `tests/b121-floating-group-render.test.js` (full file, 696+ lines) | T-121-A...J coverage of B-121 contracts | **No change required.** B-134's additions are additive on the response shape (`sortOrder` flows through but is OPTIONAL). R3 adds NEW B-134 tests in a separate file. |
| `tests/b125-claim-jump-fix.test.js:91, 137-141, 162, 229` | `markInherited` / `pruneInherited` / `isInherited` invariants | **No change required.** B-134 reuses these exports verbatim (per §63.9). The B-134 ATTACH/DETACH side-effects fire under the same invariant test framework. R3 adds NEW B-134 tests asserting the side-effect chain. |
| `tests/b018-persistence.test.js` (full file) | Cold-start re-association invariants for `tj:floatingGroups` | **No change required.** B-134 does not modify cold-start re-association; the `sortOrder` field is preserved across cold-start by the existing `reassociateFloatingGroups` write path (it filters records but does not rewrite their content). |
| `tests/b099-drift-fix.test.js` (T6) | `buildOpenTabs(floatingTabIds)` exclusion | **No change required.** B-134 does not change Open Tabs exclusion logic. |
| `tests/floating-ready-gate.test.js`, `tests/floating-session-wipe.test.js`, `tests/floating-url-fallback.test.js` | Misc. floating-record edge tests | **No change required.** None assert `sortOrder` invariants. R3 may add ONE assertion to `floating-session-wipe.test.js` (post-wipe, no records → no `sortOrder` to preserve) as defense-in-depth. |

### §63.12.4 — Schema migration pins

| File:line | Assertion | Update required? |
|-----------|-----------|------------------|
| `tests/migration-steps.test.js` | Asserts `KNOWN_VERSION` value + migration chain integrity | **Update KNOWN_VERSION → 3.** Add a test for the new no-op v2 → v3 step (matches the precedent test for v1 → v2 from B-121). Assert chain contiguity. |
| `background/storage/shapes.js` `defaultShape(PARTITION_META)` | Literal `schemaVersion: 2` | **Update to literal 3.** Pinned only in source comments; R3 verifies no test asserts the literal `2` (likely none — `migration-steps.test.js` reads it indirectly via `runMigrations`). |

### §63.12.5 — NEW B-134 test file

`tests/b134-tab-drag-reorder.test.js` — see §63.13 for the test coverage plan. Estimated: ~20-25 tests (10-12 unit on pure helpers + 8-12 integration via chrome-mock + 3 race-guard pins).

---

## §63.13 R3 build plan

Concrete file modifications expected by R3 [frontend-engineer]:

### §63.13.1 — Source files

| File | Change kind | LOC est. |
|------|-------------|---------|
| `shared/messages.js` | NEW two constants `MSG_REORDER_FLOATING_MEMBERS` + `MSG_MOVE_FLOATING_TAB`; new `@typedef` blocks for both Request/Response shapes | +60 |
| `background/storage/shapes.js` | (a) `defaultShape(PARTITION_META)` literal 2 → 3. (b) `PARTITION_FLOATING_GROUPS` validator extension: OPTIONAL `sortOrder` field with finite-number type check. | +10 |
| `background/storage/migration.js` | (a) `KNOWN_VERSION` 2 → 3. (b) NEW `MIGRATION_STEPS` entry `{fromVersion: 2, toVersion: 3, migrate: (s) => s}` (no-op governance). | +15 |
| `background/tabs/floating-groups.js` | (a) `appendFloatingGroup` stamps `sortOrder` (computed inside the mutator: `current_max_in_group + 1` or `0` if the group bucket is empty). (b) NEW exported `reorderFloatingMembers(groupId, orderedTabIds)`. (c) NEW exported `moveFloatingTab(tabId, sourceGroupId, targetGroupId, insertIndex)`. (d) NEW internal `_writeReorderedFloatingRecords` + `_writeMoveFloatingRecord` mutator helpers. | +180 |
| `background/tabs/floating-members.js` | (a) Sort path extension: prefer `sortOrder` (ascending) when present on records; fall back to `(windowId, tabIndex)` for legacy. (b) `FloatingMember` typedef gains `sortOrder?: number` (optional). (c) Descriptor block (`floating-members.js:121-131`) propagates `sortOrder` from source record. | +25 |
| `background/messages/storage-handlers.js` | (a) Two new case branches in the dispatch (`MSG_REORDER_FLOATING_MEMBERS` + `MSG_MOVE_FLOATING_TAB`). (b) Two new entries in `SCOPE_BY_MESSAGE` + `MUTATION_MESSAGES`. (c) `inheritedTabs` side-effect calls (`markInherited` / `pruneInherited`) wired into the `MSG_MOVE_FLOATING_TAB` post-write block. | +90 |
| `sidepanel/sidepanel.js` | (a) NEW `_tabDragState` module-level + `_tabDragRectCache` module-level + `_buildTabDragRectCache()` helper. (b) `buildOpenTabRow` + `buildFloatingTabRow` add `row.draggable = true`. (c) NEW `_computeTabDropTarget(x, y)` helper. (d) `dragstart` listener mode-exclusivity guard + tab-drag init path. (e) `dragover` listener delegating to `_scheduleTabDragTick`. (f) `drop` listener: NEW top branch dispatching by `_tabDragState.pendingMode`. (g) `dragend` cleanup: clear `_tabDragState` + remove scroll listener + hide indicator. (h) NEW `_validateTabDropPreflight(state)` (race-guard third branch). (i) NEW `_computeReorderFloatingPayload(groupId, draggedTabId, insertIndex)` helper. (j) NEW `_showTabDragRejectToast(reason)` helper (or reuse existing `_showToast`). | +400 |
| `sidepanel/sidepanel.css` | OPTIONAL: tab-drag-specific reject-state class on `.drop-indicator--item.is-tab-reject` (red tint or similar) for the cross-window guard visual. | +10 |
| `manifest.json` | **No changes.** Verified C-6. | — |

**Total estimate**: ~790 LOC changed/added across 8 source files. Test file totals below.

### §63.13.2 — Test files

| File | Change kind | LOC est. |
|------|-------------|---------|
| `tests/b134-tab-drag-reorder.test.js` | **NEW FILE.** Test plan: T1-T5 unit tests on `_computeReorderFloatingPayload` (pure helper); T6-T15 integration tests via chrome-mock — one per AC1-AC6 + ATTACH/DETACH/MOVE_FLOATING coverage; T16-T18 race-guard pins (each guard fires its toast); T19-T21 edge cases (same-position no-op, empty floating area, ATTACH to empty group reject); T22-T25 schema-bump regression (sortOrder stamped on `appendFloatingGroup`; legacy fallback ordering preserved). | +500 |
| `tests/migration-steps.test.js` | (a) Update `KNOWN_VERSION` reference if pinned. (b) Add test for v2 → v3 no-op migration. | +15 |
| `tests/floating-shape.test.js` | Add assertion that `appendFloatingGroup` stamps numeric `sortOrder` on writes. | +10 |
| `tests/messages-held.test.js` | Add the two new message constants to whichever closure check is in place. | +5 |

**Total test estimate**: ~530 LOC across 4 test files. Net total (source + tests): ~1,320 LOC.

### §63.13.3 — Build sequence (recommended for R3)

1. Schema layer first: `shapes.js` validator + `defaultShape` + `migration.js` `KNOWN_VERSION` + new MigrationStep. Run `tests/migration-steps.test.js` and the schema-related floating tests. Verify GREEN.
2. SW layer: `floating-groups.js` (new exports) + `floating-members.js` (sort path) + `storage-handlers.js` (new case branches) + `messages.js` (new constants). Run all SW-side tests. Verify GREEN.
3. Renderer layer: `_tabDragState` + cache + hit-test + dragstart/dragover/drop wiring. Run sidepanel tests. Add `b134-tab-drag-reorder.test.js`. Verify GREEN.
4. Smoke test: full suite `npm test` should be GREEN; expected count delta `+25-30 tests` (from baseline 1,732 → ~1,757-1,762).

---

## §63.14 Open R3-VERIFY markers

Items intentionally deferred to R3 with explicit risk notes:

### §63.14.1 — R3-VERIFY 1 (CRITICAL): tabId → floatingTabId resolution at write time

**Question:** when `MSG_REORDER_FLOATING_MEMBERS` or `MSG_MOVE_FLOATING_TAB` write back to `tj:floatingGroups`, the inputs are tabIds (client-supplied). The records in storage are keyed by `floatingTabId` (B-121 §60.4). How does R3 resolve tabId → floatingTabId inside the writeTransaction mutator?

**Two viable strategies:**

**Strategy A — Re-resolve via `(windowId, tabIndex)` geometry (matches `buildFloatingMembers`):** the mutator iterates records for the target groupId, matches each against the live tabs by `(windowId, tabIndex)`, and finds the floatingTabId. Pros: matches the existing `buildFloatingMembers` contract exactly; no descriptor-shape change. Cons: requires reading `LiveTabIndex` inside the mutator (acceptable — `getLiveTabIndex()` is a synchronous in-memory read).

**Strategy B — Add `floatingTabId` to the `FloatingMember` descriptor (§60.3.1) and pass through:** the SW handler reads `_cachedFloatingMembers` (which now carries `floatingTabId`) to map tabId → floatingTabId before the writeTransaction. Pros: cleaner mutator (no LiveTabIndex dependency). Cons: descriptor-shape change requires updating §60.3.1 typedef + propagating through `floating-members.js:121-131` + propagating into the renderer's cache.

**R2 recommendation:** **Strategy A** is lower-blast-radius and matches the existing pattern. The descriptor-shape change in Strategy B is unnecessary overhead for a single use case. R3 implements Strategy A; the test for B-134 reorder asserts that records are correctly renumbered (proves Strategy A worked) without exposing the resolution mechanism.

**Risk:** if R3 picks Strategy A and a tabId-to-record resolution fails inside the mutator (live tab vanished between the dragstart snapshot and the write), the mutator must skip that record gracefully. The race-guard third branch in §63.10 should catch this BEFORE the writeTransaction; the mutator's defense-in-depth is to skip-and-continue (do not throw — that would abort the writeTransaction and leave the bucket in an inconsistent state).

### §63.14.2 — R3-VERIFY 2: `_cachedOpenTabsGen` + `_cachedFloatingMembersGen` existence

**Question:** the broadcast-race guard (§63.10.2) reads `_cachedOpenTabsGen` and `_cachedFloatingMembersGen`. Do these counters exist today?

**R2 finding:** `_cachedItemsGen` exists at `sidepanel.js:4298, 4391` (used by `_itemDragState` + `_groupDragState`). `_cachedOpenTabsGen` and `_cachedFloatingMembersGen` likely DO NOT exist as named module-level counters today (only `_cachedOpenTabs` and `_cachedFloatingMembers` arrays/maps exist). R3 MUST add both counters in the same pattern as `_cachedItemsGen` (incremented on every `_setCachedOpenTabs` / `_setCachedFloatingMembers`).

**Cost:** ~6 LOC. Already accounted for in the §63.13.1 sidepanel.js LOC estimate.

### §63.14.3 — R3-VERIFY 3: `setDragImage` quality for tab-row drag

**Question:** does the default browser drag image (the row itself, opacity-reduced) produce a clear preview during tab-row drag, or does R3 need to layer a custom `setDragImage` snapshot per B-025 UAT-8 precedent?

**R2 disposition:** **defer to UAT.** Default disposition: do NOT add `setDragImage` for v1. If UAT flags ambiguity (especially on tall floating rows or overlapping multi-row drags), R3 adds the snapshot using the B-025 §37 / B-122 reflow-before-snapshot pattern (`void el.offsetHeight`). Treated as polish-backlog.

### §63.14.4 — R3-VERIFY 4: `chrome.tabs.move` index semantics (same-window)

**Question:** when REORDER_OPEN drags from `index: 5` to `index: 2`, does `chrome.tabs.move(tabId, { index: 2 })` correctly insert above index 2's tab? When dragging from `index: 2` to `index: 5`, does the move correctly target index 5 AFTER the source has been removed (i.e., the user-visible "drop after row 5" semantics)?

**Chrome docs (verified at chrome.dev):** `chrome.tabs.move(tabId, { index })` interprets `index` as the destination position AFTER the move. Chrome adjusts for the source-removal automatically when source-and-destination are in the same window. **No client-side index adjustment needed for same-window REORDER_OPEN.**

**Test pin:** R3 adds a test asserting that REORDER_OPEN from index 5 → 2 results in `chrome.tabs.move(tabId, { index: 2 })` being called with the literal user-target index (no -1 adjustment). Same for 2 → 5: literal `{ index: 5 }`.

### §63.14.5 — R3-VERIFY 5: `floatingMembers` cache invalidation on cross-window broadcast

**Question:** when a `MOVE_FLOATING` write succeeds in window W1, window W2's cached floating-members map is stale. The standard liveState broadcast triggers a re-fetch in W2 — does the existing cache invalidation pattern (B-121 §60.6.1.d) handle the new shape correctly?

**R2 expectation:** YES, the existing `_setCachedFloatingMembers` setter (called in `refetchAndPatchLiveState`, `sidepanel.js:3460`) handles any shape change including `sortOrder` propagation. R3 verifies via the integration test for cross-window MOVE_FLOATING.

### §63.14.6 — R3-VERIFY 6: cross-surface coverage (newtab + popup)

**Question:** does B-134 ship to newtab and popup surfaces in v1?

**R1 LOCK answer:** sidepanel-only for v1; newtab + popup parity deferred. R2 confirms: drag-and-drop in the newtab page (`newtab/newtab.js`) is **NOT** in scope. Newtab synthetic rows remain non-draggable; the existing CTA buttons (B-124 save-as-bookmark) are the keyboard-accessible alternative for newtab. Popup (`popup/popup.js`) does not have a drag surface — no impact.

R3 does NOT modify `newtab/newtab.js` or `popup/popup.js`. Verified scope.

---

## §63.15 Edge cases

| Case | Expected behavior | Source citation |
|------|-------------------|-----------------|
| Drag a row whose tab closes mid-drag | Race-guard A fires → toast "Tab closed during drag" | §63.10.1 |
| Drag a floating row from group G1 to group G2's floating area, but G2 has zero saved items | ATTACH (treating G2 as target) — verify via §63.4.2 step 2; SW handler at §63.8.2 first checks for any saved item under targetGroupId; **if zero items, REJECT with toast "Cannot attach to empty group"** | §63.8.2 |
| Same-position no-op (drag a single floating row in a 1-member group; drop in the same slot) | Drop dispatch fires `MSG_REORDER_FLOATING_MEMBERS` with same orderedTabIds; SW writes the renormalised same array (idempotent); response `{reordered: true}`. UI re-renders, no visible change. **Acceptable.** R3 may opt to early-return at the helper layer — not required. | §63.6.2 |
| Cross-window REORDER_OPEN (op 1 cross-window) | Hit-test returns `mode: 'REJECT'` (visual reject); drop handler guard C re-checks; toast "Cross-window drag is not supported yet" | §63.10.3 |
| Drop target is a saved-bookmark row (non-floating, non-Open-Tabs) | Hit-test returns `null` (step 4 in §63.4.2); drop becomes a silent no-op | §63.4.2 step 4 |
| User triggers Escape during drag | Existing `dragend` listener clears `_tabDragState`; cleanup path identical to successful drop | Standard browser drag contract |
| Multi-select active before drag (selection contains saved-bookmark rows + the dragged tab row) | B-134 v1 does NOT support multi-select for tab rows. R3 single-row-only contract: dragstart on a tab row clears any existing tab-row selection (or ignores it; tab rows are not currently in `_selection.size` per existing pattern). Saved-bookmark multi-drag (B-025) remains unaffected | Out-of-scope per R1 |
| Drop target is the Open Tabs section header (not a row, not the empty state) | Hit-test step 5 returns `null`; silent no-op | §63.4.2 step 5 |
| Drop target is the inline empty-state of a group with zero saved items + zero floating members | Treat as ATTACH if `sourceMode === 'OPEN'`; first-saved-item lookup at SW (§63.8.2) FAILS → REJECT toast. **Caveat:** the user-visible UX is "I dropped on an empty group and got rejected" — not great. R3-VERIFY: if UAT flags this, the alternative is to disable ATTACH on empty groups at hit-test time (return `null` instead of `mode: 'ATTACH'`), so the indicator never shows the "drop is allowed" state. R2 default disposition: REJECT-at-write with toast (allows hit-test to remain stateless about parent-bookmark existence). | §63.8.2 + §63.15 (R3-VERIFY follow-up) |
| Drop into a group while another drop is in flight | Single-flight per `_tabDragState`; the second drag never starts (mode-exclusivity guard at dragstart, §63.3.3) | §63.3.3 |
| Concurrent drags from different sidepanel windows | Each window's `_tabDragState` is module-local. The SW receives writes in arrival order. Broadcast-race guard B catches the second window's stale snapshot post-write — toast + abort. | §63.10.2 |

---

## §63.16 Rollback plan

### §63.16.1 — Code rollback

`git revert <r3-commit-sha>` removes:
- `_tabDragState` + `_tabDragRectCache` + all helpers in `sidepanel/sidepanel.js`.
- `MSG_REORDER_FLOATING_MEMBERS` + `MSG_MOVE_FLOATING_TAB` from `shared/messages.js`.
- New case branches + handler exports in `background/messages/storage-handlers.js` + `background/tabs/floating-groups.js`.
- Sort path extension in `background/tabs/floating-members.js` (reverts to `(windowId, tabIndex)` only).
- `KNOWN_VERSION` 3 → 2 in `migration.js`.
- `defaultShape(PARTITION_META)` literal 3 → 2 in `shapes.js`.
- New `MIGRATION_STEPS` entry.
- New tests in `tests/b134-tab-drag-reorder.test.js`.

`tj:floatingGroups` records that were stamped with v3 `sortOrder` retain the field after rollback — but the v2 validator does NOT reject extra keys (verified at `shapes.js:225` — no `extraKey` rejection clause). Records continue to function; legacy `(windowId, tabIndex)` sort takes over. **Forward-readable.**

### §63.16.2 — Storage rollback

If a SEV2 surfaces and the schema-bump must be reverted:
- The downgrade path is symmetric to v2 → v3 forward. `tj:meta.schemaVersion` reverts to 2 via the rollback commit's `defaultShape` literal.
- Records carrying `sortOrder` continue to be readable by v2 validator (sortOrder field passes the OPTIONAL check in v2 — actually v2 doesn't have any `sortOrder` clause; the field is silently ignored).
- **Acceptable:** zero data loss; sort UX reverts to `(windowId, tabIndex)` ordering for all records.

### §63.16.3 — `inheritedTabs` rollback

`inheritedTabs` is ephemeral (SW-memory only, B-125 §59 contract). Rollback resets it on the next SW cold start; no persistent impact.

### §63.16.4 — User-visible rollback impact

After rollback:
- Drag-and-drop reorder for Open Tabs + floating tabs is removed.
- Users return to the existing affordances: chrome's native tab strip for Open Tabs reorder; B-007 dialog parent-picker for moving items between groups; the B-124 "Save as bookmark" CTA for promoting floating tabs to saved.
- No data loss; no broken flows; **SEV3** rollback at worst.

### §63.16.5 — SW module-cache flush note

Per C-1a, the rollback also requires the user toggle the extension OFF/ON in `chrome://extensions` to flush the SW module cache (the new sort-path code or the old sort-path code may be cached — the toggle ensures the rolled-back code is the one running). `CHANGELOG.md` rollback entry MUST include this note.

---

## §63.17 Cross-references to related chapters

- `docs/design/38-b-031-group-drag-reorder-nest.md` — group-drag indicator + cache pattern (B-031); B-134 mirrors the rect-cache invalidation strategy.
- `docs/design/56-b-113-drag-handle-multi-select.md` — `_dragInitiatedFromHandle` flag + drag-handle gate (B-113); B-134 does NOT use a drag-handle (the row itself is the handle), but the dragstart mode-exclusivity pattern is inherited.
- `docs/design/59-b-125-claim-jump-fix.md` — `inheritedTabs` API (`markInherited` / `pruneInherited`); B-134 calls these for ATTACH (op 3) and DETACH (op 4).
- `docs/design/60-b-121-floating-tab-render.md` — `tj:floatingGroups` schema + `buildFloatingMembers` resolver + cold-start re-association; B-134 extends the schema (Case 2 sortOrder) and the resolver's sort path.
- `docs/design/62-b-122-drag-to-root.md` — drag-state contract extension + race-guard third branch + sectionBottoms cache extension; B-134 mirrors the F-5 race-guard pattern verbatim.

---

## §63.18 As-Built (R6 Close)

**Closed:** 2026-04-29 · **Sprint:** 40 (anchor #2) · **Branch:** `feature/sprint-40-drag-reorder`
**Tier:** Full (M) · **Pipeline rounds executed:** R1 (LOCKED at brainstorm) → R2 → R3 → R4 (parallel × 3) → Wave 3a fix-round → R5 → R6
**Closing version:** v1.34.0 (release/v2 only — no main merge per established branching strategy)

### §63.18.1 — Files actually changed vs. R2 expected (§63.13 build plan)

| File | Expected (R2 §63.13.1) | Actual (R6) | Notes |
|------|------------------------|-------------|-------|
| `shared/messages.js` | NEW two constants `MSG_REORDER_FLOATING_MEMBERS` + `MSG_MOVE_FLOATING_TAB` + JSDoc Request/Response typedefs (~+60 LOC) | ✅ done — +74 LOC | Constants exported as `'tj/reorderFloatingMembers'` + `'tj/moveFloatingTab'` per R2 §63.7. JSDoc typedefs landed on both Request and Response shapes. |
| `background/storage/shapes.js` | `defaultShape(PARTITION_META)` literal 2 → 3; `PARTITION_FLOATING_GROUPS` validator OPTIONAL `sortOrder` finite-number check (~+10 LOC) | ✅ done — +21 LOC at `shapes.js:96-105` (defaultShape v3) + `:251-259` (validator) | Slight overshoot due to JSDoc on the validator branch + an inline `// B-134 §63.2.5` reference comment. |
| `background/storage/migration.js` | `KNOWN_VERSION` 2 → 3 + new `MIGRATION_STEPS` v2→v3 no-op governance step (~+15 LOC) | ✅ done — +22 LOC at `migration.js:76` (KNOWN_VERSION) + `:108-112` (no-op step) | Step factory follows the v1→v2 (B-121) precedent verbatim; F2 contiguity check at `migration.js:127-135` validates the chain at boot. |
| `background/tabs/floating-groups.js` | NEW exports `reorderFloatingMembers` + `moveFloatingTab` + internal mutator helpers + `appendFloatingGroup` `sortOrder` stamping (~+180 LOC) | ✅ done — +289 LOC | Overshoot driven by JSDoc on the three new exports + the `_resolveRecordIndexByTabId` Strategy A helper (R3-VERIFY 1 outcome) + the `_floatingRecordCompare` shared sort comparator. |
| `background/tabs/floating-members.js` | Sort path extension (sortOrder priority + `(windowId, tabIndex)` legacy fallback); descriptor `sortOrder?: number` field propagation (~+25 LOC) | ✅ done — +21 LOC at `floating-members.js:150-160` (sort path) + descriptor propagation | Within budget. |
| `background/messages/storage-handlers.js` | Two new case branches + `SCOPE_BY_MESSAGE` + `MUTATION_MESSAGES` entries + post-write `markInherited`/`pruneInherited` side-effects (~+90 LOC) | ✅ done — +95 LOC | Both messages added to `MUTATION_BROADCASTS` (`storage-handlers.js:141-142`) + `WRITE_MESSAGE_TYPES` (safe-mode block, `:171-172`). Post-write side-effects fire AFTER `await moveFloatingTab(...)` resolves true (`:746-751`) — never before, per R2 §63.9.2 invariant. |
| `sidepanel/sidepanel.js` | `_tabDragState` + `_tabDragRectCache` + helpers + dragstart/dragover/drop wiring + race-guard preflight (~+400 LOC) | ✅ done — +672 LOC | Significant overshoot driven by: (a) Wave 3a fix-round adding `_openTabsSignature` + `_floatingMembersSignature` content-conditional gen-bump guards (H-1 fix) + ERR_RACE toast wiring (H-2) + REJECT skip-no-op exclusion (H-3) + dragged-row exclusion in `_resolveTabDragIndicatorY` and `_computeTabDropTarget` midline math (H-4); (b) defensive cleanup helpers (`_hideTabDragVisuals`, `_resetTabDragState`); (c) JSDoc on internal helpers. |
| `sidepanel/sidepanel.css` | OPTIONAL reject-state class on `.drop-indicator--item.is-tab-reject` (~+10 LOC) | ✅ done — +28 LOC | Includes `.is-tab-dragging` cursor + container-level `user-select: none` + reject-tint. No theme-token regression (verified across 14 themes via R4 [qa-reviewer]). |
| `manifest.json` | No changes (R2 C-6 verified) | ✅ confirmed — no edits | `chrome.tabs.move` covered by existing `tabs` permission. |
| `tests/b134-tab-drag-reorder.test.js` | NEW file ~25 tests (~+500 LOC) | ✅ done — **32 tests** | T1-T26 R3 baseline (26 tests covering AC1-AC8 + race-guards + helpers + schema + sort fallback + reorder payload purity + draggable + gen counters + drop-handler dispatch). Wave 3a regression pins T27/T27b/T28/T29/T30 (5 tests). R5 [test-engineer] T31 (`reorderFloatingMembers` race-paths return false on parity mismatch — closes [code-reviewer] M-2 as additive coverage). |
| `tests/floating-shape.test.js` | Add `appendFloatingGroup` `sortOrder` numeric stamp assertion | ✅ done — +57 LOC | Per §63.13.2. |
| `tests/migration-steps.test.js` | KNOWN_VERSION → 3 + new v2→v3 step test | ✅ done — +59 LOC | Per §63.13.2. |
| `tests/chrome-mock.js` | Not in R2 plan | +21 LOC | Mock additions to support new test scenarios (e.g., `tabs.move` with index argument, defensive null-return on unknown tabId per [code-reviewer] L-2). |
| `tests/messages-held.test.js` | Add 2 entries (per §63.12.2) | ✅ done | Additive constants check; trivial. |

**Totals (B-134 only):** ~14 production+test files; production ~+1,150 LOC (vs. R2 estimate ~+790); tests ~+700 LOC (vs. R2 estimate ~+530); net delta 1,772 → **1,807 tests** at sprint close (B-134 contribution +35 tests after Wave 3a + R5 T31; B-132 contribution +8). Zero pre-existing test regressions.

### §63.18.2 — Deviations from R2 plan

Two material deviations recorded:

1. **R4 [code-reviewer] M-4 — `MOVE_FLOATING` re-anchors `parentItemId` to the destination group's first item; deviates from R2 §63.8.2 pseudocode.**

   R2 §63.8.2 said: *"For MOVE_FLOATING and DETACH: re-use the source record's parentItemId."*
   R3 actual at `background/tabs/floating-groups.js:382-397, 455-464`: when `targetGroupId !== null` (i.e., **both ATTACH and MOVE_FLOATING**), the mutator resolves `newParentItemId` from the destination group's lowest-`sortOrder` saved item. The source record's `parentItemId` is discarded for cross-group MOVE_FLOATING.

   **R6 reconciliation decision: ACCEPT the as-built behavior; treat the R2 pseudocode as the deviation.** Rationale per [code-reviewer] M-4: the floating record now lives under a new group, so its parent should be that group's first item, not the now-unrelated source group's item. The renderer (`buildFloatingMembers`) groups floating descriptors under their `parentItemId`'s row in the destination group; reusing the stale source `parentItemId` would render correctly only by coincidence (the descriptor lookup happens by `groupId`, not `parentItemId`, so storage integrity holds), but a stale `parentItemId` would silently break `pruneFloatingGroupsByParentItemId` cascade-prune (B-129) — deleting the source group's parent item would orphan the now-relocated floating record. **Re-anchoring to the destination's first item is the load-bearing correctness invariant; the R2 pseudocode was a thinko.**

   **Action:** §63.8.2 R2 pseudocode line *"For MOVE_FLOATING and DETACH: re-use the source record's parentItemId"* is hereby ACCEPTED-AS-DEVIATED. Future readers should treat §63.18.2 #1 as the authoritative `parentItemId` resolution contract for the MOVE_FLOATING op. Test T6 (`MOVE_FLOATING moves record between groups in a single writeTransaction; inheritedTabs preserved`) at `tests/b134-tab-drag-reorder.test.js:294` asserts `parentItemId === itemB.id` (the destination group's first item) and would fail under the literal R2 pseudocode. T6 is the regression guard.

   This is NOT a scope-change escalation per CLAUDE.md "Scope Change Control" — it is a documentation correction. The behavior was the engineer's correct interpretation; the chapter caught up at R6.

2. **Wave 3a fix-round upgrades 4 R4 [qa-reviewer] HIGH findings from "deferred to UAT/follow-up" to "fixed in-build" (per CLAUDE.md cross-reviewer convergence + project quality bar):**

   - **H-1: Race-guard B over-trip on every `liveState` broadcast.** R2 §63.10.2 said Guard B fires on broadcast race; R3 implemented unconditional gen-counter bumps in `_setCachedOpenTabs` / `_setCachedFloatingMembers`. UAT would have hit this constantly (any audible-tab toggle, title change, or window blur during a multi-second drag would abort the drop with toast spam).

     **Fix:** content-conditional gen bumps via `_openTabsSignature` + `_floatingMembersSignature` setter guards. The signature is a stable hash of the projection that matters for drop-validity (per-window tabId order for Open Tabs; per-group ordered tabId arrays for floating members). Title/audible/active patches preserve the signature → no gen bump → Guard B no longer over-trips.

     **Tests added:** T27 + T27b regression pins (`tests/b134-tab-drag-reorder.test.js:743-779`).

   - **H-2: `MSG_REORDER_FLOATING_MEMBERS` ERR_RACE silently drops drag with no toast.** R2 §63.10.4 mandated "each guard fires correct toast"; R3 wired toasts for `MSG_MOVE_FLOATING_TAB` but not `MSG_REORDER_FLOATING_MEMBERS`. AC7 violation.

     **Fix:** mirror the MOVE_FLOATING handler pattern — inspect `resp.reordered` after the await; on `false` show a toast specific to the reason. Default to "Tabs changed during drag — please retry." (matches Guard B verbiage for consistent recovery instructions).

     **Test added:** T28 (`tests/b134-tab-drag-reorder.test.js:781`).

   - **H-3: REJECT indicator stuck position when pointer moves inside non-source window.** R3's skip-no-op short-circuit compared `(mode, targetGroupId, insertIndex, targetWindowId)`; for REJECT all four are constant inside the rejected window → tick early-returned → indicator frozen at first-entry Y.

     **Fix:** exclude REJECT mode from the skip-no-op check. Per-tick re-position cost is one transform write; perf budget unaffected.

     **Test added:** T29 (`tests/b134-tab-drag-reorder.test.js:804`).

   - **H-4: REORDER_FLOATING midline math includes the dragged row, violating R2 §63.4.4 mandate.** R2 explicitly required dragged-row exclusion in same-group reorder midline math. R3 built `rowMidlines` from ALL floating rows in the zone.

     **Fix:** filter `tabId === _tabDragState.draggedTabId` from source-group midlines/rowTabIds during REORDER_FLOATING hit-test. Apply only when `groupId === sourceGroupId`. Mirrored in BOTH `_computeTabDropTarget` AND `_resolveTabDragIndicatorY` to keep visual feedback consistent with the storage outcome.

     **Test added:** T30 (`tests/b134-tab-drag-reorder.test.js:822`).

   These four upgrades are recorded in `docs/findings/sprint-40.md` (qa-reviewer B-134 R4 anchor table) and in the Wave 3a checkpoint commit `965cd76`. Convergent [code-reviewer] / [security-reviewer] / [qa-reviewer] signals motivated each upgrade — three reviewers agreeing that a "deferred-to-UAT" risk is actually an in-build defect is the project's standard fix-round trigger.

### §63.18.3 — R3-VERIFY marker outcomes

| Marker | R2 disposition | R6 verification |
|--------|---------------|-----------------|
| **R3-VERIFY 1 (CRITICAL): tabId → floatingTabId resolution at write time (§63.14.1)** | "R3 implements **Strategy A** — re-resolve via `(windowId, tabIndex)` geometry inside the mutator. Strategy B (descriptor extension) rejected as higher blast radius." | **VERIFIED — Strategy A.** `_resolveRecordIndexByTabId` defined at `background/tabs/floating-groups.js:254-266`; consumes `LiveTabIndex` to map tabId → floatingTabId by matching `(windowId, tabIndex)`. Used in BOTH `reorderFloatingMembers` (outer parity check at `:309` + inside mutator at `:333`) AND `moveFloatingTab` (inside mutator at `:409`). The double-call (outer + inner) is intentional belt-and-braces per [code-reviewer] L-1 — outer parity check provides early-exit on stale data without consuming a write transaction slot. |
| **R3-VERIFY 2: `_cachedOpenTabsGen` + `_cachedFloatingMembersGen` existence (§63.14.2)** | "Likely DO NOT exist; R3 adds both counters in `_cachedItemsGen` pattern." | **VERIFIED.** Both counters added at `sidepanel.js` module scope (mirroring `_cachedItemsGen`). Wave 3a additionally added `_openTabsSignature` + `_floatingMembersSignature` content-conditional gates (H-1) so the gen counter only bumps on shape-relevant changes. |
| **R3-VERIFY 3: `setDragImage` quality (§63.14.3)** | "Defer to UAT. Default disposition: do NOT add for v1." | **VERIFIED.** R3 ships without `setDragImage`; uses default browser drag image. R5 UAT (UAT-DRAGGED-ROW-VISUAL, item 17 in [qa-reviewer] UAT plan) walks ghost-quality across 14 themes; if ambiguity surfaces, polish-backlog item per R2 §63.14.3. |
| **R3-VERIFY 4: `chrome.tabs.move` index semantics (§63.14.4)** | "Same-window REORDER_OPEN passes literal user-target index; no -1 adjustment per Chrome docs." | **VERIFIED.** Test T1 at `tests/b134-tab-drag-reorder.test.js:132` asserts `chrome.tabs.move(tabId, { index: 2 })` for a 5→2 reorder (literal target, no adjustment). Drop dispatcher at `sidepanel/sidepanel.js` REORDER_OPEN branch passes `state.pendingInsertIndex` unmodified. |
| **R3-VERIFY 5: `floatingMembers` cache invalidation on cross-window broadcast (§63.14.5)** | "Existing `_setCachedFloatingMembers` setter handles `sortOrder` propagation; R3 verifies via integration test." | **VERIFIED.** `_setCachedFloatingMembers` (`sidepanel.js`) flows the new `sortOrder` field through descriptor propagation at `background/tabs/floating-members.js:150-160`. Wave 3a Hardening: `_floatingMembersSignature` includes per-group ordered tabId arrays — any cross-window MOVE_FLOATING bumps the signature reliably while preserving signature stability under no-op patches. |
| **R3-VERIFY 6: cross-surface coverage (newtab + popup) (§63.14.6)** | "sidepanel-only for v1; newtab + popup deferred." | **VERIFIED.** `git diff release/v2 -- newtab/ popup/` shows zero changes to `newtab/newtab.js`, `newtab/newtab.css`, `newtab/newtab.html`, `popup/popup.js`, `popup/popup.css`, `popup/popup.html`. Newtab synthetic rows remain non-draggable; B-124 save-as-bookmark CTA remains the keyboard-accessible alternative. |

### §63.18.4 — R4 reviewer findings (B-134 anchor — full Wave 3a scope)

R4 launched all three reviewers in parallel against commit `c3e7503` per CLAUDE.md Gate 1.

**[code-reviewer]** — 0 CRIT / 0 HIGH / **4 MEDIUM** / 5 LOW. M-1 / M-2 / M-3 deferred (race-fail no-op write; reorder parity-mismatch test gap; `_validateTabDropPreflight` cross-window/gen-mismatch behavioral test gap). M-4 (MOVE_FLOATING `parentItemId` re-anchor) reconciled per §63.18.2 deviation #1. LOW-1..L-5 deferred (all defensive observations). M-2 was additively closed in R5 by T31 regression test.

**[security-reviewer]** — 0 CRIT / 0 HIGH / **3 MEDIUM** / 3 LOW. All MEDIUMs are payload-bound recommendations (M-1 `orderedTabIds.length` cap; M-2 `insertIndex` upper-bound; M-3 `groupId` length cap) — defense-in-depth at the trust boundary; race-guards downstream of validators already prevent any storage-corruption or DoS outcome in the realistic local-only-extension threat model. **Disposition: deferred as MEDIUM-acceptable** per [security-reviewer]'s own verdict ("none are blockers"). May be addressed as a future hardening pass alongside `MAX_BULK_INPUTS` parity with B-025/B-030. LOW-1..L-3 deferred (cross-window source documentation, errorEnvelope `cause` field pre-existing, CHANGELOG SW module-cache flush note for sprint close).

**[qa-reviewer]** — 0 CRIT / **4 HIGH** / 5 MEDIUM / 6 LOW. **All four HIGH findings closed in Wave 3a fix-round** per §63.18.2 deviation #2. MEDIUM-5..M-9 (cursor affordance; ATTACH-to-empty-group UX; cache-miss silence; ATTACH side-effect race; hit-test geometry test gap) deferred to polish backlog or [test-engineer] R5 UAT walkthrough. LOW-10..L-15 deferred (ARIA drag affordance per AC8 v1 waiver; theme contrast spot-check; copy polish; auto-claim-after-detach by-design; source-row dimming; SCOPE.ITEMS broadcast on soft-rejects).

Full deduplicated R4 tables in `docs/findings/sprint-40.md` (qa-reviewer + security-reviewer + code-reviewer B-134 R4 anchor sections). Convergent MEDIUMs across reviewers concentrate on **payload upper-bound hardening** (security M-1/M-2/M-3) and **UAT-walkthrough deferrals** (qa M-5..M-9) — neither blocks R5.

### §63.18.5 — R2 Correctness Checklist closure verification (C-1..C-12)

| # | Check | R6 closure verdict |
|---|-------|--------------------|
| C-1a | Storage schema versioned (governance) | **PASS — confirmed.** `KNOWN_VERSION = 3` (`migration.js:76`); `defaultShape(PARTITION_META)` returns `{ schemaVersion: 3, ... }` (`shapes.js:105`); v2→v3 no-op step (`migration.js:108-112`) with correct contiguity (validated by F2 chain check at `migration.js:127-135`). **CHANGELOG SW module-cache flush note required at sprint close** — flagged for [release-manager] / [technical-writer] R7. |
| C-1b | Data-migration strategy chosen (data) | **PASS — confirmed lazy.** Validator OPTIONAL on `sortOrder` (`shapes.js:251-259`); `buildFloatingMembers` falls back to `(windowId, tabIndex)` when sortOrder absent (`floating-members.js:150-160`); writes always stamp sortOrder; legacy v2 records self-evict on tab close. T14 + T15 regression-guard the lazy-fallback + sortOrder-priority paths. |
| C-2 | Message contracts typed | **PASS — confirmed.** `MSG_REORDER_FLOATING_MEMBERS` + `MSG_MOVE_FLOATING_TAB` constants exported at `shared/messages.js` with full Request/Response JSDoc typedefs. Validator shapes documented; both messages added to `WRITE_MESSAGE_TYPES` + `MUTATION_BROADCASTS` registries. |
| C-3 | SW cold-start safe | **PASS — confirmed.** All B-134 SW state is ephemeral; both new handlers re-read partitions on every call. Renderer's `_tabDragState` is sidepanel-module-local; SW restart loses it (acceptable — drag is ephemeral). |
| C-4 | ID stability | **PASS — confirmed.** `tabId` runtime identity preserved; `floatingTabId` storage identity preserved (MOVE_FLOATING preserves the original `floatingTabId` per `floating-groups.js:437-441`); `sortOrder` is mutable and per-bucket-renormalised — no identity role. |
| C-5 | Manifest file references resolvable | **N/A — confirmed.** No `manifest.json` edits. |
| C-6 | Permission minimization | **N/A — confirmed.** Zero permission additions. `chrome.tabs.move` covered by existing `tabs` permission. [security-reviewer] independently re-verified clean. |
| C-7 | Allow-list direction | **PASS — confirmed.** Both new handlers validate payloads via positive checks (typeof, finite numbers, non-empty strings); `MSG_REORDER_FLOATING_MEMBERS` re-derives the authoritative tabId set from `buildFloatingMembers` and accepts the client-supplied order ONLY if the set matches. No deny-list. |
| C-8 | SW-context feasibility | **PASS — confirmed.** `chrome.tabs.move` is sidepanel-context (renderer-side); other handlers use SW-reachable APIs only (`readPartition`, `writeTransaction`, `chrome.tabs.get`). |
| C-9 | Empty-state design | **PASS — 7 of 10 cases pinned + 3 deferred.** Single-member same-position no-op (T11 idempotency); ATTACH-to-empty-group ERR_RACE (T10); saved-bookmark row inert; group header inert; sub-group zone separation; cross-window REJECT (T2 + T22); multi-select tab-rows out of scope per AC8 v1. Three remaining cases deferred as [qa-reviewer] M-6/M-7/M-2 (ATTACH-to-empty-group confusing UX, cache-miss silence, ERR_RACE silence — H-2 partially closed in Wave 3a; M-6/M-7 polish backlog). |
| C-10 | Off-screen rect feasibility | **N/A — confirmed.** No off-screen positioning; reuses existing `.drop-indicator--item` element via `transform: translateY(...)`. |
| C-11 | Popup-lifecycle message ordering | **N/A — confirmed.** Sidepanel context, not popup. No focus-shifting API calls mid-flow. |
| C-12 | Manifest declaration runtime-mutability | **N/A — confirmed.** No manifest declaration changes. |

**No C-1..C-12 violations detected at R6 close.**

### §63.18.6 — Atomic write surfaces + cascade-prune sibling-grep (B-129 carry-forward)

B-134 introduces TWO new atomic write surfaces, both writing exclusively to `PARTITION_FLOATING_GROUPS`:

| Write surface | Entry point | Cascade-prune impact | Verified |
|---------------|-------------|----------------------|----------|
| `reorderFloatingMembers(groupId, orderedTabIds)` | `MSG_REORDER_FLOATING_MEMBERS` | None — same-group reorder; no cross-partition implications. | ✓ B-129 sibling-grep N/A; no `MSG_DELETE_*` siblings. |
| `moveFloatingTab(tabId, sourceGroupId, targetGroupId, insertIndex)` | `MSG_MOVE_FLOATING_TAB` | New records carry `parentItemId` resolved from destination group's first item (§63.18.2 deviation #1). Existing `pruneFloatingGroupsByParentItemId` cascade-prune (B-129) at `MSG_DELETE_ITEM` / `MSG_BULK_DELETE_ITEMS` / `MSG_DELETE_GROUP` correctly cleans up records the moment the destination's parent item is deleted. | ✓ [security-reviewer] R4 verified at `storage-handlers.js:226-237, :259-274, :286-310`. |

No B-129 sibling-grep risk introduced. Existing cascade-prune sites cover B-134's new write paths by construction.

### §63.18.7 — Test count delta (final)

- **Pre-S40 baseline** (after Sprint 39 + v1.33.1 hotfix close): **1,732 tests passing**.
- **B-134 contribution after R3:** +26 tests in `b134-tab-drag-reorder.test.js` (T1-T26) + delta in `floating-shape.test.js` + `migration-steps.test.js` + `messages-held.test.js` ≈ **+40 tests** → 1,772.
- **Wave 3a fix-round:** +5 regression pins (T27, T27b, T28, T29, T30) → 1,777.
- **R5 [test-engineer] additions:** +1 (T31 `reorderFloatingMembers` race-paths — closes [code-reviewer] M-2) + B-132 contributions → 1,807 final.

**B-134 total delta: +35 tests** (vs. R2 §63.13.2 estimate of +25-30 — slight overshoot driven by Wave 3a regression pins).
**Zero regressions** in the pre-existing suite at every checkpoint.

### §63.18.8 — Rollback plan (single-revert + schema rollback)

The B-134 work is split across two checkpoint commits on `feature/sprint-40-drag-reorder`:
- `c3e7503` — R3 build + B-134 R2 chapter + B-132 R2 chapter
- `965cd76` — Wave 3a fix-round (4 HIGH closed) + B-132 R3 build

```bash
# Identify the B-134 commits on release/v2 (after sprint merge):
git log --oneline release/v2 | grep -E "B-134|S40 checkpoint"

# Two-commit revert (Wave 3a first to preserve build coherence):
git revert <965cd76-equivalent-on-release-v2>  # Wave 3a fix-round
git revert <c3e7503-equivalent-on-release-v2>  # R3 build
git push origin release/v2
```

**Code rollback removes:**
- `_tabDragState` + `_tabDragRectCache` + all helpers in `sidepanel/sidepanel.js`.
- `MSG_REORDER_FLOATING_MEMBERS` + `MSG_MOVE_FLOATING_TAB` from `shared/messages.js`.
- New case branches + handler exports + `inheritedTabs` side-effect wiring in `background/messages/storage-handlers.js`.
- `reorderFloatingMembers` + `moveFloatingTab` + `_resolveRecordIndexByTabId` + `_floatingRecordCompare` from `background/tabs/floating-groups.js`.
- Sort path extension in `background/tabs/floating-members.js` (reverts to `(windowId, tabIndex)` only).
- `KNOWN_VERSION` 3 → 2 in `migration.js`; v2→v3 step removed.
- `defaultShape(PARTITION_META)` literal 3 → 2 in `shapes.js`; validator `sortOrder` branch removed.
- `tests/b134-tab-drag-reorder.test.js` (NEW file — deleted entirely).
- Test-fixture additions in `tests/floating-shape.test.js`, `tests/migration-steps.test.js`, `tests/messages-held.test.js`, `tests/chrome-mock.js`.
- CSS additions in `sidepanel/sidepanel.css`.

**Storage rollback (forward-readable):**
- v3 records carrying `sortOrder` continue to function under the v2 validator (no `extraKey` rejection clause at `shapes.js:225` per R2 §63.16.2 — verified). Sort UX reverts to `(windowId, tabIndex)` for all records.
- `tj:meta.schemaVersion` reverts to 2 via the rollback commit's `defaultShape` literal.
- Lazy migration self-heals: any post-rollback write skips the sortOrder stamp; any read tolerates the field's presence on legacy-v3 records.
- **Zero data loss; SEV3 rollback at worst.**

**`inheritedTabs` rollback:**
- `inheritedTabs` is ephemeral (SW-memory only). Rollback resets it on the next SW cold start; no persistent impact.

**SW module-cache flush note (mandatory per C-1a):**
- After rollback, the user MUST toggle the extension OFF then ON in `chrome://extensions` to flush the SW module cache. Same note required at the FORWARD upgrade. [release-manager] / [technical-writer] R7 must include this in `CHANGELOG.md` for v1.34.0 release.

**User-visible rollback impact:**
- Drag-and-drop reorder for Open Tabs + floating tabs is removed.
- Users return to: chrome's native tab strip for Open Tabs reorder; B-007 dialog parent-picker for moving items between groups; B-124 "Save as bookmark" CTA for promoting floating tabs to saved.
- No data loss; no broken flows.

### §63.18.9 — Schema / contract / permission impact

Confirmed by direct re-read of the diff:
- **Storage schema:** **CHANGED — v2 → v3.** New OPTIONAL `sortOrder: number` field on `tj:floatingGroups` records. C-1a/C-1b governance fully complied (KNOWN_VERSION + defaultShape + no-op MIGRATION_STEPS entry + lazy validator + CHANGELOG flush note pending sprint close).
- **Message contracts:** **CHANGED — 2 new types** (`MSG_REORDER_FLOATING_MEMBERS`, `MSG_MOVE_FLOATING_TAB`). Both fully typed with Request/Response JSDoc. No existing contracts modified.
- **Manifest permissions:** **UNCHANGED.** `chrome.tabs.move` covered by existing `tabs` permission. C-6 verified clean by [security-reviewer] R4.
- **Validation surfaces:** New positive (allow-list) validators in `MSG_REORDER_FLOATING_MEMBERS` + `MSG_MOVE_FLOATING_TAB` handlers; per-element type/finite-number checks. C-7 compliant.

### §63.18.10 — Open follow-ups (deferred to backlog)

- **[security-reviewer] M-1/M-2/M-3 — payload upper-bound hardening.** Add `MAX_BULK_INPUTS` parity to `orderedTabIds.length`, `insertIndex`, and groupId-string length validators. Defense-in-depth; not blocking. Candidate for a future hardening sprint.
- **[code-reviewer] M-1 — `moveFloatingTab` race-fail no-op write.** Short-circuit before `writeTransaction` when `sourceIdx === -1`. Refactor opportunity; not blocking.
- **[code-reviewer] M-3 — `_validateTabDropPreflight` cross-window/gen-mismatch behavioral test gap.** Source-text pin (T21) covers presence; behavioral coverage relies on UAT-RACE-1/2 + UAT-CROSS-WIN-1. Optional follow-up: extract preflight to a module-level export for synthetic-state testing.
- **[qa-reviewer] M-5 — cursor affordance.** Add `cursor: grab` / `cursor: grabbing` CSS. Polish; UAT-AFFORDANCE-1 will surface.
- **[qa-reviewer] M-6 — ATTACH-to-empty-group hit-test guard.** Filter empty-group floating zones at hit-test time. Polish; UAT-EMPTY-GROUP-1 will surface.
- **[qa-reviewer] M-7 — `_computeReorderFloatingPayload` cache-miss silent no-op.** Add toast on empty-payload branch. Polish.
- **[qa-reviewer] M-8 — ATTACH side-effect race window.** Move `markInherited` inside `moveFloatingTab` (or eagerly call before writeTransaction). LOW frequency / MEDIUM severity per [qa-reviewer]; cleanup pass candidate.
- **[qa-reviewer] M-9 — hit-test geometry behavioral test gap.** Extract `_computeInsertIndex(midlines, y, excludeTabId?)` as testable pure helper. ~30 LOC refactor; defer.
- **[qa-reviewer] L-10 — keyboard-driven drag.** P3 polish item per AC8 v1 waiver; file as a new backlog item if user demand surfaces.
- **B-135 cross-window Open Tabs drag.** Already filed as deferred stub per Sprint 40 SPRINT.md. Out of B-134 v1 scope per Q3 R1 LOCK decision.

---

**End of §63.**
