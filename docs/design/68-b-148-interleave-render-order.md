# §68 — B-148 — Interleave Floating Tabs With Saved Bookmarks

**Status:** DONE — Sprint 44 close (v1.39.0, 2026-05-04). 1930 → 2016 PASS (+86 net at close).
**Anchor**: B-148 (P3 / XL Spike-First — Sprint 44 sole anchor)
**Spec**: `docs/superpowers/specs/2026-05-03-interleave-render-order-design.md`
**Plan**: `docs/superpowers/plans/2026-05-03-interleave-render-order.md` (commit `75147ac`)
**Tier**: Spike-First (XL) — R0 spike A+B+C run before R1

> **R6 As-Built chapter** (not an R2-plan transcription). Records what shipped,
> deviations from the spec, and the 10-round polish/hotfix sequence that
> ran under the B-148 umbrella before v1.39.0 was cut.

---

## §68.1 — Problem statement

Pre-B-148 a Tab Junkie group rendered its contents as two fixed strata:

1. Saved bookmarks (`tj:items` records) sorted by `Item.sortOrder`
2. Floating tabs (`tj:floatingGroups` records) sorted by `FloatingGroup.sortOrder`

The sidepanel and newtab render paths stitched these as "all saved, then all
floating." There was no way to interleave the two. A user who opened a link
from page X — landing a floating tab anchored to X — could not place that
floating row directly under X in the visual list; the row always appended to
the bottom of the group's floating zone.

Product-owner request (deferred from S40 B-134 close): allow free-form
interleave of saved + floating rows within a group, with the order
persisted across tab close + extension restart.

The architectural problem is that **two partitions own different slivers
of the same visual ordering**. Any interleave model has to either
(a) merge them into a single partition (huge migration, breaks
`tj:floatingGroups` re-association on cold-start), or (b) elevate ordering
to a partition-independent index. B-148 picked (b): a new optional
`Group.renderOrder: string[]` field of prefix-encoded refs
(`item:<itemId>` | `floating:<floatingTabId>`) on the `tj:groups` record,
owned by the parent group and read by both render paths via a new pure
resolver.

The crux of the work was not the resolver itself (~70 LOC) — it was
maintaining `renderOrder` atomically across the 12 multi-partition write
sites that mutate items / floating-tab records, AND handling the cold-start
bootstrap for the ~1 year of legacy v6 profiles in the wild that have no
`renderOrder` field at all.

---

## §68.2 — R0 spike outcomes

The BACKLOG row for B-148 enumerated three R0 spike branches before R1
acceptance criteria could be locked. The spike output committed in the
implementation plan (`75147ac`, `docs/superpowers/plans/2026-05-03-interleave-render-order.md`)
records the answers:

| Spike | Question | Outcome |
|-------|----------|---------|
| **R0-A** | Does `writeTransaction([{partition: items, ...}, {partition: groups, ...}])` provide multi-partition atomicity? | **Confirmed atomic**. Existing helper (`background/storage/write-transaction.js`) already batches multi-partition mutators into a single `chrome.storage.local.set()` call. Per-partition mutators run sequentially in array order; if any throws, no partition is written. This is the load-bearing primitive for §68.5. |
| **R0-B** | Persistence semantics on tab close — collapse-up (remove slot) or preserve-ghost-slot (keep ref pointing at nothing)? | **Collapse-up** chosen. Ghost slots would require a separate sweep + UI semantics for "this slot is for a tab that no longer exists" — adds storage churn and UX complexity for no user benefit. Implementation: `pruneFloatingGroupsByLiveTabId` and `pruneFloatingGroupsByParentItemId` strip `floating:<id>` refs from the owning group's `renderOrder` in the same writeTransaction that prunes the `tj:floatingGroups` record. Stale refs in `renderOrder` (from race conditions or pre-bootstrap state) are filtered silently by the resolver AND swept by cold-start `bootstrapAndSweepRenderOrder`. |
| **R0-C** | Drag-op vocabulary — extend the existing 5+1 op set or introduce a new MIXED_REORDER op? | **Option A — extend existing ops**. Drag dispatch keeps the existing op vocabulary (REORDER_OPEN, REORDER_FLOATING, ATTACH, DETACH, MOVE_FLOATING, saved-item-reorder). The hit-test enumerates all `.item-row` rows in the group (saved + floating) so the drop index is computed against the interleaved row sequence. The `MSG_REORDER_FLOATING_MEMBERS` payload contract changes from `{groupId, orderedTabIds: number[]}` to `{groupId, renderOrder: string[]}` (prefix-encoded); the SW handler delegates to `updateGroup({renderOrder})`. The legacy payload is retained for backwards compatibility (see §68.7). |

These three answers shaped the per-write-site decomposition that became
the 17 TDD tasks in the implementation plan. Cross-group interleave
(dragging a row between two groups while preserving relative position
across the move) was **explicitly out of scope** for v1.39.0; the
existing MOVE_FLOATING semantic (strip from source, append to target) was
preserved. Cross-group preservation is filed against future-work
candidates in §68.13.

---

## §68.3 — Storage architecture

### §68.3.1 — Schema v6 → v7 lazy migration

Schema bumped from v6 → v7 under C-1a + C-1b. This is the **fourth time**
the project has run this exact pattern (v3→v4 B-137, v4→v5 B-041,
v5→v6 B-159, v6→v7 B-148). Sites touched:

| Site | Pre-B-148 (v6) | Post-B-148 (v7) | Commit |
|------|----------------|------------------|--------|
| `background/storage/migration.js:100` `KNOWN_VERSION` | `6` | `7` | `54bfef2` |
| `background/storage/shapes.js:135` `defaultShape(PARTITION_META).schemaVersion` | `6` | `7` | `54bfef2` |
| `background/storage/migration.js:191-195` `MIGRATION_STEPS[]` | 5 entries (v1→v6) | 6 entries (+ v6→v7 no-op) | `54bfef2` |
| `CHANGELOG.md` v1.39.0 entry | n/a | "toggle OFF→ON in edge://extensions to flush SW module cache after update" | `299e147` |

C-1b strategy: **option 2 — lazy data migration**. The v6→v7 step is a
no-op governance bump (`migrate: (snapshot) => snapshot` at `migration.js:194`);
no eager data rewrite runs at migration time. Legacy v6 group records
that lack `renderOrder` continue to validate (the field is optional —
see §68.3.2). The cold-start `bootstrapAndSweepRenderOrder()` pass
(§68.6) derives the missing array from current `Item.sortOrder` +
`FloatingGroup.sortOrder` on first cold-start post-upgrade.

The paired-bump invariant is documented in the `defaultShape` comment
at `shapes.js:104-134` and pinned by `tests/migration-fresh-install.test.js`.

### §68.3.2 — `renderOrder: string[]` field on Group records

The `isGroup` validator at `background/storage/shapes.js:172-198` was
extended (commit `54bfef2`) to accept an OPTIONAL `renderOrder` field:

```js
/* B-148 §3.2 (S44, v6→v7) — OPTIONAL renderOrder. Each entry must be a
   prefix-encoded ref (`item:<id>` or `floating:<floatingTabId>`) and
   no longer than MAX_REF_LENGTH. Empty array is valid. Anything else
   is corrupt. Legacy v6 groups lack the field; new writes stamp it
   via the per-write-site updates at Tasks 8a-e, 9a-d, 10. */
if ('renderOrder' in v) {
  if (!Array.isArray(v.renderOrder)) return false;
  for (const entry of v.renderOrder) {
    if (typeof entry !== 'string' || entry.length === 0) return false;
    if (!entry.startsWith('item:') && !entry.startsWith('floating:')) return false;
    if (entry.length > MAX_REF_LENGTH) return false;
  }
}
```

`MAX_REF_LENGTH = 64` (`shapes.js:30`) — prefix (5 or 9 chars) + ULID
(26 chars) + buffer. Rejects adversarial oversized refs.

**Why prefix-encoded strings, not parallel fields?** Two design
alternatives were considered and rejected in the brainstorm:

1. Two parallel arrays (`renderOrderItems`, `renderOrderFloating` + an
   integer-interleave index) — would require atomic 3-array writes and
   bidirectional consistency checks. Strictly more state to maintain.
2. `{kind: 'item'|'floating', id: string}[]` — equivalent expressivity
   but heavier on storage (every entry is a 2-key object) and on the
   resolver's hot path (one allocation per ref to read).

Prefix-encoded strings give O(1) lookup (the resolver uses
`startsWith('item:') / startsWith('floating:')` then `slice`) and
serialize to compact JSON (~30 chars per ref).

**Stale-ref tolerance contract** — entries that don't resolve to an
existing item or floating record are **filtered silently** by the
resolver (`shared/render-order.js:48-58`) AND swept from disk by
`bootstrapAndSweepRenderOrder` (§68.6). This makes the field forgiving
in the face of race conditions (e.g., a tab close racing with a drag
dispatch) — the resolver renders only the rows that exist and the next
cold-start cleans the slate.

### §68.3.3 — `validateGroupPatch` allow-list extension

`background/storage/groups.js:119` was extended (commit `9bb4df7`) to
add `'renderOrder'` to the patch allow-list (C-7 allow-list direction
preserved), with a per-element validator at `groups.js:146-163` that
mirrors the shape rules.

---

## §68.4 — The render-order resolver (`shared/render-order.js`)

New shared module (commit `1b7819e`, 74 LOC), a pure function with no
chrome.* calls and no storage reads:

```js
export function resolveRenderOrder(group, groupItems, groupFloatingMembers) {
  // Index by id for O(1) lookup
  const itemById = new Map(...);
  const floatingById = new Map(...);

  // Primary path — renderOrder set: walk it, filter stale refs
  const renderOrder = Array.isArray(group?.renderOrder) ? group.renderOrder : null;
  if (renderOrder && renderOrder.length > 0) {
    const out = [];
    for (const ref of renderOrder) {
      if (ref.startsWith('item:')) {
        const item = itemById.get(ref.slice(5));
        if (item) out.push({ kind: 'item', ref, item });
      } else if (ref.startsWith('floating:')) {
        const floatingMember = floatingById.get(ref.slice(9));
        if (floatingMember) out.push({ kind: 'floating', ref, floatingMember });
      }
    }
    return out;
  }

  // Bootstrap fallback — saved-by-sortOrder, then floating-by-sortOrder
  ...
}
```

Returns `RenderRow[] = { kind: 'item'|'floating', ref: string, item?, floatingMember? }`.

The **bootstrap fallback path** is the resolver's only behavior when
`renderOrder` is missing or empty. It returns saved items sorted by
`Item.sortOrder` asc, then floating members sorted by
`FloatingGroup.sortOrder` asc — i.e., the legacy pre-B-148 visual order.
This makes the resolver safe to drop into the render path BEFORE
cold-start bootstrap has run; rendering still works, just without
interleave.

The caller is responsible for persisting back the bootstrapped value via
`updateGroup({renderOrder: ...})` so subsequent calls see the persisted
form — that persistence is exactly what `bootstrapAndSweepRenderOrder`
provides on cold-start. Other write sites (createItem, moveFloatingTab,
etc.) treat absent `renderOrder` as "start from empty array, then
append" — see §68.5.

Consumed by both render paths:

- `sidepanel/sidepanel.js` — single call site at `~line 2427` inside
  the per-group render loop (commit `fa4aa6b`).
- `newtab/newtab.js:50,976` — imported at top of module, single call
  site at `newtab.js:976` inside the per-group render loop (commit
  `3c64d08`).

The popup quick-search surface (flat search across all items) is
unaffected — search results don't have a group-scoped order.

---

## §68.5 — The 12 atomic multi-partition write sites

Every storage write that adds, removes, or re-positions a record
participates in a multi-partition `writeTransaction` that touches BOTH
`tj:items` (or `tj:floatingGroups`) AND `tj:groups`. The renderOrder
mutation is part of the same transaction as the underlying record
mutation, so a transaction failure leaves both partitions untouched.

| # | Site | Source `file:line` | Partitions touched | Behavior | Commit |
|---|------|--------------------|---------------------|----------|--------|
| 1 | `createItem` | `background/storage/items.js:174-225` (renderOrder lines 199-211) | items + groups | Append `item:<newId>` to target Group's renderOrder | `d62f72e` |
| 2 | `deleteItem` | `background/storage/items.js:~340-360` | items + groups | Strip `item:<id>` from owning Group's renderOrder; no-op if Ungrouped or ref absent | `dfb9bd4` |
| 3 | `updateItem({groupId})` | `background/storage/items.js:~270-310` | items + groups | Strip `item:<id>` from source Group's renderOrder; append to target Group's renderOrder | `394ec14` |
| 4 | `bulkCreateItems` | `background/storage/items.js:~480-510` | items + groups | Per-affected-group: append all new `item:<id>` refs in a single mutator | `f139a0d` |
| 5 | `bulkDeleteItems` | `background/storage/items.js:~575-600` | items + groups | Per-affected-group: filter out N `item:<id>` refs in a single mutator | `4f3814c` |
| 6 | `bulkReorderItems` | `background/storage/items.js:~740-870` | items + groups (2 group mutators) | Reshuffle remaining `item:*` slots to match new sortOrder asc; floating refs preserved in-place; strip refs that moved cross-group; append refs that joined cross-group | **Hotfix `f96662a`** (see §68.9) |
| 7 | `appendFloatingGroup` | `background/tabs/floating-groups.js:298-440` (renderOrder lines 401-430) | floatingGroups + groups | Append `floating:<floatingTabId>` to target Group's renderOrder; supports OPTIONAL `entry.insertAfterRef` for opener-chain anchoring (see §68.9) | `aabfb16` + opener-chain polish `dd2ace2` |
| 8 | `moveFloatingTab` (cross-group) | `background/tabs/floating-groups.js:599-780` (renderOrder lines 743-780) | floatingGroups + groups (2 group mutators) | Strip `floating:<id>` from source Group's renderOrder; append to target Group's renderOrder | `4216d6d` |
| 9 | `pruneFloatingGroupsByLiveTabId` | `background/tabs/floating-groups.js:960-1040` (renderOrder lines 1013-1035) | floatingGroups + groups | Per owning group: strip `floating:<id>` refs for pruned records | `fb742e6` |
| 10 | `pruneFloatingGroupsByParentItemId` | `background/tabs/floating-groups.js:873-920` (renderOrder lines 896-915) | floatingGroups + groups | Per owning group: strip `floating:<id>` refs for pruned records | `fb742e6` |
| 11 | `MSG_REORDER_FLOATING_MEMBERS` handler | `background/messages/storage-handlers.js:722-773` (B-148 path lines 739-760) | groups (via `updateGroup`) | Accept `{groupId, renderOrder: string[]}` payload; validate per-element shape (prefix + length); delegate to `updateGroup` | `a7d76f6` |
| 12 | `commitImport` (replace mode) | `background/import/commit.js:71-103` | items + groups + (prefs) | Per imported group: derive `renderOrder` from imported `Item.sortOrder` (items-only because replace-mode wipes floating-groups in the subsequent transient-partition reset) | `c185e27` |

Plus the **cold-start bootstrap**:

| 13 | `bootstrapAndSweepRenderOrder` | `background/tabs/floating-groups.js:1142-1227` | groups | Bootstrap missing/empty `renderOrder` from current sortOrder; sweep stale refs from present `renderOrder`. Single PARTITION_GROUPS mutator. | `84eee2c` |

All 12 + 1 sites are exercised by `tests/b148-renderorder-write-paths.test.js`
(650 LOC, the largest single test file in the sprint).

---

## §68.6 — Cold-start bootstrap (`bootstrapAndSweepRenderOrder`)

Implementation at `background/tabs/floating-groups.js:1142-1248`. Hooked
into the cold-start orchestrator at `background/tabs/index.js:65-74`:

```js
await reassociateFloatingGroups(getLiveTabIndex(), getClaimsMirror());
/* B-148 §3.6 (S44, v6→v7) — cold-start bootstrap + sweep of
   Group.renderOrder. Runs AFTER reassociateFloatingGroups so the
   floating-group records are reconciled. Idempotent — skips the write
   when no group changed. */
try {
  await bootstrapAndSweepRenderOrder();
} catch (err) {
  console.warn('[tab-junkie] B-148 bootstrapAndSweepRenderOrder failed; renderOrder will lazily heal on next mutation', err);
}
```

**Ordering invariant**: must run AFTER `reassociateFloatingGroups` so
that floating-group records have been reconciled (resolved records
pruned, stale `liveTabId`s rewritten, duplicates merged). Bootstrapping
against a partially-reconciled `tj:floatingGroups` would seed `renderOrder`
with refs that would then be stripped by the prune pass on the next
cold-start — wasted writes.

For each group:

1. **Missing or empty `renderOrder`** → bootstrap path: union of items
   in the group (sorted by `Item.sortOrder` asc) + floating records in
   the group (sorted by `FloatingGroup.sortOrder` asc); persist as
   `[item:..., item:..., floating:..., floating:...]`.
2. **Present `renderOrder`** → sweep path: filter out refs that don't
   resolve to any item or floating record (stale-ref sweep); persist
   the filtered array.

Implementation runs a single `PARTITION_GROUPS` writeTransaction with a
**content-conditional skip** inside the mutator (`if (!anyChanged) return currentGroups`
at `:1243`) so idempotent repeat cold-starts return the snapshot unchanged
and `writeTransaction` can short-circuit the actual `chrome.storage.set` call —
zero storage churn.

**The C-3 / atomicity precedent — original race-condition mistake fixed
at R4 fix-round**.

The first implementation read `groups`, `items`, and `floatingRecords`
via `Promise.all([readPartition(...), ...])` BEFORE entering the
writeTransaction, derived `updatedGroups` from that snapshot, then
called `writeTransaction([{partition: groups, mutator: () => updatedGroups}])`
with a **blind-replace mutator** that ignored the `current` snapshot the
writeTransaction passed in.

This was a textbook cold-start race: another write site could have
modified `tj:groups` between the `readPartition(GROUPS)` and the
writeTransaction's internal read, and the blind-replace would
silently clobber that interleaved write. The shape validator would
still pass (the resulting array is structurally valid), so corruption
would be invisible until the user noticed a write disappearing.

R4 [code-reviewer] flagged this as HIGH. The fix-round (folded into
the close commits) moved the derivation INSIDE the mutator using the
`current` snapshot that `writeTransaction` provides — items and
floating-groups are still pre-read (those partitions are not touched
by the mutator) but the per-group derivation now operates on the
authoritative `current` snapshot of `tj:groups`.

This is the **C-13 / atomicity precedent** for any future bootstrap or
sweep pass: pre-reading the partition you intend to MUTATE and
blind-replacing in the mutator is a race; derive inside the mutator
against `current` instead.

---

## §68.7 — Drag hit-test extensions (sidepanel)

### §68.7.1 — `_buildTabDragRectCache` enumeration

`sidepanel/sidepanel.js:6508-6580` (commit `ce0702d`) was extended to
enumerate ALL `.item-row` rows in the floating zone (both saved-item
rows and floating-tab rows), not just floating-tab rows. The rect cache
now stores a parallel `rowRefs[]` array (`sidepanel.js:6561-6567`) of
`item:<id>` / `floating:<id>` strings keyed to the same index space as
`rowMidlines`. The drop dispatcher reads `rowRefs[insertIndex]` to
construct the new `renderOrder` payload.

`null` sentinels in `rowRefs[]` (rows for which the cache could not
resolve a stable ref) disable the renderOrder dispatch path for that
group — the dispatcher falls back to the legacy `orderedTabIds` payload
for backwards compatibility.

### §68.7.2 — Bidirectional drop targets

Saved bookmarks dropping into the floating zone (commit `500fcc8`)
required parallel extensions to the saved-item drag path:

- `_buildDragRectCache` — parallel `floatingRects` map keyed by
  `floatingTabId`; saved-item drag rect cache enumerates floating rows
  alongside saved rows.
- `_computeDropTarget` — recognizes floating-row hits, returns a target
  with `isFloatingAnchor: true` + `anchorRef: 'floating:<id>'` +
  `destGroupId`. Both saved-row and floating-row drop targets carry
  `anchorRef` (`item:<id>` or `floating:<id>`) for downstream
  consumers.
- `_dragTick` — indicator-Y math reads the appropriate rect map per
  anchor type.
- Drop dispatcher — new branch for the floating-anchor case: computes
  the new `Group.renderOrder` by stripping the dragged refs from the
  destination group's current `renderOrder` and splicing them at
  `anchorRef ± insertPosition`, then dispatches
  `MSG_REORDER_FLOATING_MEMBERS` with the renderOrder payload.

### §68.7.3 — `MSG_REORDER_FLOATING_MEMBERS` payload extension

Per R0 spike C Option A. The handler at
`background/messages/storage-handlers.js:722-773` accepts BOTH:

- **B-148 new path** — `{groupId: string, renderOrder: string[]}` (lines 739-760).
  Validates per-element ref shape (prefix + length); delegates to
  `updateGroup({renderOrder})`. Returns `{reordered: true}` on success.
- **Legacy path** — `{groupId: string, orderedTabIds: number[]}` (lines 761-772).
  Delegates to `reorderFloatingMembers` for the floating-only sortOrder
  renumber. Retained for backwards compatibility until all callers are
  migrated.

### §68.7.4 — Multi-select interleave drag

Multi-select drag of N floating rows moves all N as a **contiguous
block** at the drop position. Implementation lives in the drop
dispatcher at `sidepanel.js:~5185-5276` (commit `ce0702d` + hotfix
`6ab19cf`):

1. Collect ALL selected refs (`state.draggedTabIds` → `cluster.rowRefs`
   via parallel `rowTabIds` map), preserving their visual order.
2. Strip them all from the destination group's `renderOrder`.
3. Re-insert as a contiguous block at the visually-intuitive drop
   position, shifting `insertIndex` backward by `selectedAboveCount`
   (number of selected refs above `pendingInsertIndex`).
4. Single `MSG_REORDER_FLOATING_MEMBERS` dispatch with the full
   computed `renderOrder` array.

Single-select case (N=1) reduces to the prior code path
mathematically — `selectedRefs.length === 1` and `selectedAboveCount`
is 0 (the grabbed row is itself the only "selected" ref). A defensive
fallback to single-tab semantics fires when no selected refs resolve
(cache-gen mismatch between dragstart and drop), preventing the drop
from being silently dropped.

---

## §68.8 — Broadcast fast-path renderOrder awareness

The sidepanel listens for `MSG_STATE_CHANGED` broadcasts (B-050) and
applies a diff-and-patch fast path (B-052) for `SCOPE.ITEMS`-scoped
broadcasts to avoid full `renderAll` thrash. B-148 created two
fast-path bugs that both surfaced at UAT and were fixed as hotfixes.

### §68.8.1 — `renderOrderChanged` predicate (`db8f13e`)

Implementation at `sidepanel/sidepanel.js:7182-7215`. The diff-and-patch
fast path compares `tj:items` shape only — items added/removed/changed.
A renderOrder-only mutation on a group record produces a `noop`
items-diff → `patched=true` → `renderAll` skipped → DOM order stale.

Fix: a `renderOrderChanged` predicate compares the prior `_cachedGroups`
vs the freshly-fetched groups for any per-group `renderOrder` drift. When
the predicate returns `true`, `canPatch` is forced to `false`,
guaranteeing a full `renderAll`.

```js
const canPatch =
  SEARCH_INDEX_ENABLED &&
  !_searchIndexDisabled &&
  _searchIndex !== null &&
  scope === 'items' &&
  _cachedItems.length > 0 &&
  !renderOrderChanged;
```

Pinned by `tests/b148-renderorder-broadcast-fix.test.js` (3 static-source
pins on the predicate's existence + wiring).

### §68.8.2 — `patchFloatingMembersSections` interleave preservation (`51f0db6`)

Implementation at `sidepanel/sidepanel.js:3208-3354`. The
`patchFloatingMembersSections` helper re-positions floating rows to a
`staticAnchor` (the first child that is neither a saved-item row nor an
existing floating row — typically a nested child group section) on every
broadcast. Pre-B-148 this was correct: all floating rows lived in the
post-saved-items zone.

Post-B-148, with `renderOrder` set, a floating row may live
MID-saved-items per the user's interleave drag. The patch path was
yanking those rows back to `staticAnchor` on every unrelated broadcast
(e.g., MSG_NAVIGATE_TO_ITEM → `lastAccessedAt`-only `SCOPE.ITEMS` patch
→ patchFloatingMembersSections → snap-back).

Fix at `sidepanel.js:3250-3354`: when the group's record carries a
non-empty `renderOrder`, leave already-in-container rows at their
current DOM position (renderAll has placed them per
`resolveRenderOrder`). Cross-container moves (row currently in another
group) and newly-built rows still insert at `staticAnchor` as before.
Pre-B-148 / legacy groups (no `renderOrder`) preserve the original
re-positioning behavior.

---

## §68.9 — Hotfix sequence (10 rounds, all under B-148 umbrella)

After the initial 15-task R3 build shipped (`fa4aa6b`/`3c64d08`/`ce0702d`),
a continuous run of polish + hotfix rounds landed under the B-148 umbrella
before v1.39.0 was cut at `299e147`. The sequence in chronological order:

| # | Commit | Title | Root cause | Fix |
|---|--------|-------|------------|-----|
| 1 | `db8f13e` | Broadcast fast-path skips renderAll when only `Group.renderOrder` changed | Diff-and-patch compared items shape only; renderOrder-only mutation hit `noop` → DOM stale | `renderOrderChanged` predicate in fast-path canPatch gate (§68.8.1) |
| 2 | `6ab19cf` | REORDER_FLOATING moves selected siblings as a contiguous block | Multi-select dispatcher only stripped the single grabbed ref; siblings stayed in place | Collect ALL selected refs from `state.draggedTabIds`, strip and re-insert as a contiguous block (§68.7.4) |
| 3 | `51f0db6` | `patchFloatingMembersSections` preserves interleaved order on fast-path | Floating rows in MID-saved-items zone got yanked back to `staticAnchor` on every broadcast | When group has `renderOrder`, leave in-container rows alone; cross-container moves still insert at anchor (§68.8.2) |
| 4 | `0ff4ce3` | sidepanel `window.blur` clears multi-selection | (polish, not a bug) Selecting outside the sidepanel didn't clear selection — only Escape did | Add a `window.addEventListener('blur', ...)` with conservative guards (not in selectionMode, no drag in flight, no dialog open) at `sidepanel.js:4314-4319` |
| 5 | `bf3940d` | Multi-drop visual selection desync (DOM stays selected, Set empty) — **first attempt** | Two bare `_selection.clear() + _updateBulkBar()` call sites bypassed `_setRowSelected(row, false)` per member; DOM kept `data-selected="true"` while Set was emptied | Replace bare `_selection.clear()` with `_clearSelection()` (iterates Set first, then clears) |
| 6 | `619477a` | Off-by-one in floating-tab drag direction (coordinate-frame mismatch) | Multi-select dispatcher math treated `pendingInsertIndex` as a position in the FULL `rowRefs`, but `_computeTabDropTarget` filters out the grabbed row BEFORE computing it → double-counted | Walk `rowRefs` in lock-step with parallel filtered-by-draggedTabId-only index; compute `siblingsAbove` against filtered positions |
| 7 | `500fcc8` | Saved bookmarks drop into floating zone (bidirectional interleave) | (feature gap, not a bug) Initial R3 shipped only floating-into-saved direction; saved-into-floating was missing | Symmetric extension to saved-item drag path: parallel `floatingRects` map, floating-anchor branch in `_computeDropTarget`, drop dispatcher branch (§68.7.2) |
| 8 | `f96662a` | `bulkReorderItems` updates `Group.renderOrder` (saved-bookmark drag was a silent no-op) | bulkReorderItems was never extended for B-148 in the original 15-task plan; with cold-start bootstrap stamping `renderOrder` on every group, the resolver ALWAYS preferred renderOrder → saved-bookmark drag updated `Item.sortOrder` but renderOrder stayed stale → no visual change | Add a SECOND `PARTITION_GROUPS` mutator (multi-mutator-per-partition pattern from task 8d): strip cross-group-moved refs, reshuffle remaining `item:*` slots to new sortOrder asc (floating refs preserved in-place), append cross-group-joined refs |
| 9 | `7acdc46` | Multi-drop visual selection desync (DOM-sweep approach) — **second attempt** | `bf3940d`'s `_clearSelection()` used `querySelector` via Set→key→row indirection; when the same key resolved to multiple rows (e.g., a tab in both Open Tabs AND a group's floating zone), only the first was cleared | Replace Set-keyed loop with `querySelectorAll('.item-row[data-selected="true"]')` DOM-sweep; add defensive sweep at start of `_reapplySelection` so renderAll boundaries always clean stale data-selected |
| 10 | `dd2ace2` | Opener-chain inheritance anchors new tab UNDER the opener page | (polish, not a bug) When a user opens a link from page X (right-click → new tab), the inherited floating tab appended at the BOTTOM of the floating zone, not directly under X | Extend `appendFloatingGroup` with OPTIONAL `entry.insertAfterRef` (`item:<id>` or `floating:<id>`). When set and the ref is found in target group's `renderOrder`, splice the new floating ref directly after; otherwise fall back to append-at-end (`floating-groups.js:401-430`) |

All 10 commits landed AFTER `299e147` (manifest+CHANGELOG+RELEASES) was
cut. Net: every hotfix/polish round is part of v1.39.0 as shipped; the
shipped binary == every commit through `dd2ace2`.

(Five further commits — `ed6dbe0`, `6cd7762`, `a2d75a6`, `5e5084e`,
`079dd48` — are the B-162..B-166 backlog filings that the B-148 UAT
surfaced as follow-on work. They do not affect the v1.39.0 build; they
are documentation-only filings against `docs/BACKLOG.md` for future
sprint consumption. See §68.13.)

---

## §68.10 — Test coverage

### §68.10.1 — New test files

| File | LOC | Cases | Surface |
|------|-----|-------|---------|
| `tests/b148-schema-v7.test.js` | 80 | 9 | Schema bump pin (`KNOWN_VERSION`, defaultShape paired-bump, migration step v6→v7 no-op shape, validator extension) |
| `tests/b148-render-order-resolver.test.js` | 112 | 10 | Pure resolver — renderOrder happy path, bootstrap fallback (missing/empty), stale-ref filtering (item / floating / non-string), prefix-encoding edges |
| `tests/b148-renderorder-write-paths.test.js` | 650 | 22 | All 12 multi-partition write sites — append-on-create, strip-on-delete, swap-on-cross-group-update, bulk variants, bulkReorder reshuffle (3 cases from `f96662a`), appendFloatingGroup insertAfterRef anchor |
| `tests/b148-cold-start-bootstrap.test.js` | 108 | 7 | `bootstrapAndSweepRenderOrder` — legacy v6 bootstrap, empty-array bootstrap, stale item strip, stale floating strip, valid v7 unchanged, items-in-other-groups isolation, empty-partition no-throw |
| `tests/b148-mixed-type-drag.test.js` | 39 | 3 | Sidepanel `_buildTabDragRectCache` enumerates saved + floating rows; rowRefs parallel array; renderOrder payload at drop |
| `tests/b148-saved-into-floating.test.js` | 69 | 4 | Bidirectional interleave — saved drop into floating zone, floating-anchor branch in `_computeDropTarget`, renderOrder splice at floating ref |
| `tests/b148-renderorder-broadcast-fix.test.js` | 49 | 3 | `renderOrderChanged` predicate existence + wiring to `canPatch` gate |
| `tests/b148-blur-clears-selection.test.js` | 59 | 5 | `window.addEventListener('blur', …)` exists; !_selectionMode early-return; drag-state guard; dialog-open guard; `_clearSelection()` call |

### §68.10.2 — Existing-test deltas

| File | Δ LOC | Change |
|------|-------|--------|
| `tests/migration-fresh-install.test.js` | +6/-6 | defaultShape schemaVersion pin: 6 → 7 |
| `tests/migration-steps.test.js` | +12/-12 | KNOWN_VERSION pin + MIGRATION_STEPS array length pin: 5 → 6 |
| `tests/sync-schema-v5.test.js` | +8/-8 | Adjacent schema-pin updates for the v7 bump |
| `tests/b134-tab-drag-reorder.test.js` | +11/-11 | T23 regex window bumped 3000 → 4500 chars to accommodate the multi-select branch + explanatory comment in the dispatcher |
| `tests/b095-popup-settings-btn.test.js` | -349 (deleted) | Unrelated — B-161 close in v1.38.2 (same sprint) removed the popup settings button; this test no longer applies |

### §68.10.3 — Final count

| Baseline | Post-S44 | Net |
|----------|----------|-----|
| 1930 (v1.38.2 close) | **2016 PASS / 0 fail** | **+86** |

(The CHANGELOG/RELEASES/SPRINT documents record an intermediate count of
2006 / +76 — captured at the time `299e147` cut the manifest bump but
before the 10 hotfix/polish commits landed their additional ~10 tests.
The 2016 figure is the actual shipped-binary count at v1.39.0 tag.)

---

## §68.11 — UAT outcome

UAT script lives at `docs/UAT_B-148.md` (commit `086801f`), 11 test
cases plus a "lean-mode smoke" case 11 for the product-owner override
path (same model as S42 / S43 closes).

UAT was run by the product-owner against an unpacked extension loaded
in Microsoft Edge (per the established branching + browser model in
`MEMORY.md`). The lean-mode smoke (case 11) plus the P0/P1 drag-cases
(1, 2, 3, 4, 5, 8, 9) all returned PASS. Case 6 (browser-reload
persistence) PASSED with the expected stale-floating-ref sweep visible
in storage. Cases 7 + 11 (newtab + smoke) PASSED.

The 10 polish/hotfix commits in §68.9 were each driven by a
UAT-discovered failure mode (commits `bf3940d`, `619477a`, `f96662a`,
`7acdc46`, `51f0db6`, `db8f13e`, `6ab19cf`) or a UAT-time product-owner
request (commits `dd2ace2`, `500fcc8`, `0ff4ce3`). Every UAT-discovered
failure was reproduced, root-caused, fixed, and re-tested in the same
session before sprint close. No deferred UAT failures remain in the
v1.39.0 release.

The as-shipped UX contract is best summarized by the CHANGELOG v1.39.0
"New features" stanza (`CHANGELOG.md:9-11`):

> Drop a floating tab anywhere within a group, including between two
> saved bookmarks. The new position persists across browser restart.
> Sidepanel + newtab honor the user-defined order. Quick-search popup
> unchanged. When sidepanel focus is lost (clicking the browser tab
> strip, another window, or the page body), any active multi-selection
> clears. Mirrors the existing Escape-to-clear semantics. Skips during
> in-flight drags + while a dialog is open.

---

## §68.12 — Rollback plan

Per `CHANGELOG.md:24-25` (v1.39.0 Rollback stanza, verbatim):

> Downgrade to v1.38.x is NOT supported — `tj:meta.schemaVersion` will
> be ahead of the older `KNOWN_VERSION` constant; the older build will
> safe-mode lock the partition. To roll back: download v1.38.2, then
> in SW console:
> `await chrome.storage.local.set({'tj:meta': { schemaVersion: 6, createdAt: Date.now() } })`
> to manually reset (data integrity NOT guaranteed; legacy v6 groups
> will continue working but any v7-stamped renderOrder is discarded).

**Forward-fix preferred.** Per the established S38/S40/S41/S42 policy,
any non-data-loss issue is patched forward on `release/v2` rather than
rolled back. A SEV1 storage-corruption discovery would warrant the
manual reset above, scoped to affected users, with an
export-then-import workflow to preserve item content. No SEV1/SEV2
incident occurred during the S44 close.

The validator's optional-field tolerance (`isGroup` at `shapes.js:189-196`)
means any `renderOrder` field that survives a manual-reset rollback
will be silently ignored by a v1.38.x build — the older code simply
doesn't read the field. Storage validation continues to pass because
the field is optional and structurally valid.

---

## §68.13 — Future work / known limitations

### §68.13.1 — Five follow-on items filed (B-162..B-166)

The B-148 UAT and product-owner observation surfaced five distinct
follow-on items, all filed against `docs/BACKLOG.md` for future-sprint
triage:

| # | Item | Priority/Effort | Filed | Summary | Why related to B-148 |
|---|------|-----------------|-------|---------|----------------------|
| 1 | **B-162** — Ctrl+Shift+T reopen lands restored tab back in original group | P3 / M | 2026-05-06 | Chrome's session-restore creates the new tab WITHOUT an `openerTabId`, so the B-148 opener-chain handler never fires; restored tabs fall through to URL-claim or Open-Tabs. Three R0 spike candidates (grace-window prune / recently-closed partition / accept current behavior) | B-148 shipped opener-chain anchoring (`dd2ace2`) which made this regression visible — pre-B-148 a restored tab would have appended to floating zone bottom regardless |
| 2 | **B-163** — Drift URL as fallback match candidate on cold-start re-association | P2 / M | 2026-05-07 | Today `reconcileClaims` Phase 2 uses ONLY `item.url`; drifted-tab claims are lost across SW idle + tab-recreate. Three R0 candidates (defer paired-clear / Phase-2 fallback / persist lastClaimedUrl) | B-148 cold-start sweep stripped some stale `floating:*` refs that exposed the underlying claim-drift weakness in the test profile |
| 3 | **B-164** — Saved-bookmark→tab claims survive sleep/lid-close cycles | P1 / M | 2026-05-21 | Saved-bookmark claims progressively break across OS sleep cycles. Distinct from B-149 (SW cold-start, fixed) and B-163 (browser restart). Four R0 candidates including missing `chrome.tabs.onReplaced/onDiscarded` listeners | Surfaced during long-run B-148 UAT sessions where the user kept the browser open for days |
| 4 | **B-165** — Sidepanel list keeps scroll position after drag-drop into a group | P2 / M | 2026-05-21 | After a drop, `renderAll()`'s `replaceChildren` drops scrollTop. Three R0 candidates (delta-adjusted restore / scrollIntoView on dropped row / route through B-052 targeted patch fast-path) | B-148's increased frequency of post-drop full `renderAll` calls (interleave drops force the slow path) made this pre-existing regression visible |
| 5 | **B-166** — `+` CTA on a floating tab promotes in-place at the interleaved position | P2 / S | 2026-05-21 | `MSG_PROMOTE_TAB` calls `createItem({groupId})` with no positioning hint; new bookmark always appends to group bottom instead of taking over the floating tab's `floating:<id>` slot in renderOrder. Three R0 candidates (UI-side `replaceFloatingId` hint / SW-side detection / generalized `createItem({insertAt})`) | Direct B-148 follow-on — the interleave order is built up correctly, but promote breaks it; the fix is the renderOrder swap that B-148 shipped for every other write site |

### §68.13.2 — Out-of-scope items confirmed for v1.39.0

- **Cross-group interleave preservation** — dragging a floating tab
  from Group A into Group B preserves the existing MOVE_FLOATING
  semantic (strip from source, append-at-end to target). Preserving
  relative position across cross-group moves was explicitly out of
  scope per R0 spike A; would require a generalized `{sourceGroupId,
  targetGroupId, sourceIndex, targetIndex}` MOVE_FLOATING payload and
  is a candidate for a future sprint when product demand surfaces.
- **Sub-group interleave** — Sub-groups remain "first-class but
  separate" — each Group at any depth has its own `renderOrder` for its
  direct contents (saved + floating); sub-group sections render in the
  parent area as separate blocks per the existing B-007 nesting render
  path. Interleaving sub-group sections into the parent's flat row
  sequence was rejected at R0 (would require a third ref kind:
  `subgroup:<id>`).
- **Popup quick-search interleave** — The popup's flat search across
  all items is unaffected (no group-scoped order). Out-of-scope per
  R0 spike Q5-A surface parity confirmation.

### §68.13.3 — Pre-existing documentation gaps noted (not closed by this chapter)

Two pre-existing gaps were observed during R6 close but are NOT
addressed here — they belong to separate maintenance items:

- **Root `docs/SOLUTION_DESIGN.md` front-matter Status line** (`SOLUTION_DESIGN.md:6`)
  stops at B-054 — has been stale since at least Sprint 30. The chapter
  TOC list (rendered via the per-chapter `[§N — Title](design/NN-*.md)`
  links) is comprehensive and is the actually-consulted artifact, but
  the Status front-matter would benefit from a sweep or a "current
  through Sprint NN" formulation. **Recommended follow-up**: a small
  maintenance item to either auto-derive the Status line from the TOC
  or replace it with "current through Sprint NN" — non-urgent.
- **`docs/BACKLOG.md` items marked `in-progress`** — an Agent 2 sweep
  earlier in S44 close noted 8 rows still tagged `in-progress` that
  should be `done`. Per CLAUDE.md Gate 5 these must be reconciled
  before the sprint can formally close — that reconciliation is
  scrum-master / product-manager work, NOT solution-architect work,
  and is being handled in a parallel close round.

---

## §68.14 — Files touched (R6 summary)

**Source code (new):**

- `shared/render-order.js` — pure resolver (commit `1b7819e`)

**Source code (modified):**

- `background/storage/shapes.js` — `MAX_REF_LENGTH` constant, `isGroup` validator extension, `defaultShape` schemaVersion paired-bump (`54bfef2`)
- `background/storage/migration.js` — `KNOWN_VERSION` 6→7, v6→v7 no-op step (`54bfef2`)
- `background/storage/groups.js` — `validateGroupPatch` allow-list + per-element validator (`9bb4df7`)
- `background/storage/items.js` — renderOrder mutations in 6 write sites (`d62f72e`, `dfb9bd4`, `394ec14`, `f139a0d`, `4f3814c`, `f96662a`)
- `background/tabs/floating-groups.js` — renderOrder mutations in 4 write sites + new `bootstrapAndSweepRenderOrder` + `entry.insertAfterRef` opener-chain anchor (`aabfb16`, `4216d6d`, `fb742e6`, `84eee2c`, `dd2ace2`)
- `background/tabs/index.js` — cold-start orchestrator wires `bootstrapAndSweepRenderOrder` after `reassociateFloatingGroups` (`84eee2c`)
- `background/messages/storage-handlers.js` — `MSG_REORDER_FLOATING_MEMBERS` accepts renderOrder payload (`a7d76f6`)
- `background/import/commit.js` — `commitImport` bootstraps `renderOrder` per imported group (`c185e27`)
- `sidepanel/sidepanel.js` — render path consumes `resolveRenderOrder`; `_buildTabDragRectCache` enumerates mixed rows; drop dispatcher branch for renderOrder; `patchFloatingMembersSections` interleave-preservation; broadcast `renderOrderChanged` predicate; `window.blur` selection clear; multi-select contiguous-block dispatcher (`fa4aa6b`, `ce0702d`, `db8f13e`, `51f0db6`, `6ab19cf`, `bf3940d`, `619477a`, `7acdc46`, `500fcc8`, `0ff4ce3`)
- `newtab/newtab.js` — render path consumes `resolveRenderOrder` (`3c64d08`)
- `manifest.json` — version bump to 1.39.0 (`299e147`)

**Tests (new):** 8 files (see §68.10.1)

**Tests (modified):** 5 files (see §68.10.2)

**Docs:**

- `CHANGELOG.md` — v1.39.0 entry (`299e147`)
- `docs/RELEASES.md` — v1.39.0 entry (`299e147`)
- `docs/UAT_B-148.md` — UAT script (`086801f`)
- `docs/superpowers/plans/2026-05-03-interleave-render-order.md` — original 17-task implementation plan (`75147ac`)
- `docs/BACKLOG.md` — B-162..B-166 follow-on filings (`ed6dbe0`, `6cd7762`, `a2d75a6`, `5e5084e`, `079dd48`)
- `docs/design/68-b-148-interleave-render-order.md` — this chapter (R6 close)
