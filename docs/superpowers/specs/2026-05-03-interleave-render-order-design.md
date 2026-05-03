# Interleave floating tabs with saved bookmarks — design (Sprint 44)

**Status:** Brainstorm complete · awaiting user spec review · pre-R0/R1
**Anchor item:** B-148 (closes the deferred-from-S40 product-owner request to interleave floating + saved within a group)
**Tier:** Tier 3 — Spike-First (XL)
**Author:** [solution-architect] (brainstorm with product owner, 2026-05-03)

## 1 · Goal

Saved bookmarks and floating tabs within a group can be interleaved into one user-defined sequence. The order is owned by the Group record, persists across tab close + extension restart, applies to both sidepanel and newtab surfaces, and treats sub-groups as first-class (each Group at any depth has its own `renderOrder`).

Today the partitions are split:
- `tj:items` records (saved bookmarks) ordered by `Item.sortOrder`
- `tj:floatingGroups` records (live floating tabs) ordered by `record.sortOrder`

The render-path stitches them as **saved-list-first, then floating-list**. There is no way to mix them.

This spec changes ownership of group-content order from the per-record `sortOrder` fields to a single `Group.renderOrder` array, allowing free-form interleave per the product-owner request.

## 2 · Locked design decisions (brainstorm log)

| # | Decision | Choice |
|---|----------|--------|
| Q1 | Storage model | C-2 — `Group.renderOrder: string[]` with prefix-encoded entries (`item:<itemId>` / `floating:<floatingTabId>`). Per-group ordered list owned by the Group record. |
| Q2 | Persistence semantics on tab close | Collapse-up — when a floating tab's tab closes, its slot is removed; subsequent entries shift up. No ghost slots. |
| Q3 | Drag op vocabulary | A — Existing op vocabulary stays (REORDER_OPEN, REORDER_FLOATING, ATTACH, DETACH, MOVE_FLOATING, saved-item-reorder, saved-item-cross-group). Hit-test + index calc + per-op `renderOrder` write expand within those ops. No new wire formats. |
| Q4 | Lifecycle sync | A — Strict; every write site that adds/removes a record updates the affected Group(s)' `renderOrder` atomically inside a multi-partition writeTransaction. Render-path trusts `renderOrder` blindly. |
| Q5 | Surface parity | A — Sidepanel + newtab both consume `renderOrder`. Popup unaffected (flat search). |
| Q6 | Sub-group interaction | A — Sub-groups are first-class; each Group at any depth has its own `renderOrder`. Same shape, same dispatch logic. |
| Q7 | Visual differentiation | A — Existing affordances sufficient (B-130 dotted-green border on floating + standard saved-item styling). No new visual chrome. |

## 3 · Architecture

### 3.1 Storage shape

`Group` records gain an OPTIONAL field:

```js
/**
 * B-148 v7 — canonical render order for the group's contents (saved
 * bookmarks + floating tabs interleaved). Each entry is a prefix-encoded
 * reference: `item:<Item.id>` or `floating:<FloatingGroup.floatingTabId>`.
 *
 * Sub-groups DO NOT appear in this array — sub-groups have their own
 * Group records with their own renderOrder. The parent group's
 * renderOrder lists only the parent's direct contents (saved + floating
 * at parent depth); sub-groups render in the parent area separately.
 *
 * Stale refs (the referenced item/floating record no longer exists) are
 * filtered silently by the render-path AND swept by cold-start
 * reassociateFloatingGroups. New refs (record exists but is not yet in
 * renderOrder — bootstrap path) are appended at the end of the bootstrap
 * write or by the calling write-site directly.
 */
renderOrder?: string[]
```

Schema bump v6 → v7 per CLAUDE.md C-1a + C-1b (4th time we've done this exact pattern):

| Site | Pre-B-148 (v6) | Post-B-148 (v7) |
|------|----------------|------------------|
| `background/storage/migration.js` `KNOWN_VERSION` | `6` | `7` |
| `background/storage/shapes.js` `defaultShape(PARTITION_META).schemaVersion` | `6` | `7` |
| `background/storage/migration.js` `MIGRATION_STEPS[]` | 5 entries (v1→v6) | 6 entries (+ v6→v7 no-op step) |
| `CHANGELOG.md` v1.39.0 entry | n/a | MUST include "toggle OFF→ON to flush SW module cache after update" |

### 3.2 Validator extension (`background/storage/shapes.js#isGroup`)

Pre-B-148 (post-B-041 v6 shape):

```js
function isGroup(v) {
  if (!v || typeof v !== 'object') return false;
  if (!isString(v.id) || !isString(v.name) || !isString(v.color)) return false;
  if (!isNullableString(v.parentId)) return false;
  if (!isNumber(v.sortOrder) || !isBool(v.collapsed)) return false;
  if (!isNumber(v.createdAt) || !isNumber(v.updatedAt)) return false;
  if ('chromeTabGroupId' in v
    && v.chromeTabGroupId !== null
    && !isNumber(v.chromeTabGroupId)) return false;
  return true;
}
```

Post-B-148:

```js
function isGroup(v) {
  if (!v || typeof v !== 'object') return false;
  if (!isString(v.id) || !isString(v.name) || !isString(v.color)) return false;
  if (!isNullableString(v.parentId)) return false;
  if (!isNumber(v.sortOrder) || !isBool(v.collapsed)) return false;
  if (!isNumber(v.createdAt) || !isNumber(v.updatedAt)) return false;
  if ('chromeTabGroupId' in v
    && v.chromeTabGroupId !== null
    && !isNumber(v.chromeTabGroupId)) return false;
  /* B-148 (S44 §3.2) — OPTIONAL renderOrder. Each entry must be a
     prefix-encoded ref. Empty array is valid. Anything else is corrupt. */
  if ('renderOrder' in v) {
    if (!Array.isArray(v.renderOrder)) return false;
    for (const entry of v.renderOrder) {
      if (typeof entry !== 'string' || entry.length === 0) return false;
      if (!entry.startsWith('item:') && !entry.startsWith('floating:')) return false;
      if (entry.length > MAX_REF_LENGTH) return false;
    }
  }
  return true;
}
```

`MAX_REF_LENGTH` is `'item:'.length + ULID.length` (5 + 26 = 31) plus a comfortable buffer; e.g., 64. Documents prefix + ulid bound; rejects adversarial oversized refs.

### 3.3 Allow-list extension (`background/storage/groups.js#validateGroupPatch`)

Append `'renderOrder'` to the patch allow-list. Add a per-element validator that mirrors §3.2.

### 3.4 New shared module: `shared/render-order.js`

Pure resolver, no chrome.* / no storage reads:

```js
/**
 * Resolve a Group's renderOrder against the current items + floating-members
 * snapshot, producing the ordered list of render rows.
 *
 * Bootstrap path: if `group.renderOrder` is undefined or empty, derive from
 * Item.sortOrder + FloatingGroup.sortOrder (saved-then-floating, ascending).
 * The caller is responsible for persisting back the bootstrapped value
 * (so it converges); this resolver only produces the display list.
 *
 * Stale-ref handling: refs that don't resolve to an existing item or
 * floating record are filtered silently. The cold-start sweep at
 * `reassociateFloatingGroups` strips them from disk.
 *
 * @param {Object} group  — the Group record (may be missing renderOrder)
 * @param {Item[]} groupItems  — items where item.groupId === group.id
 * @param {FloatingMember[]} groupFloatingMembers  — pre-resolved floating
 *   members for this group (output of buildFloatingMembers filtered to group.id)
 * @returns {RenderRow[]}  — { kind: 'item'|'floating', ref: string, item?, floatingMember? }
 */
export function resolveRenderOrder(group, groupItems, groupFloatingMembers) { … }
```

### 3.5 Multi-partition writeTransactions

Every write site that adds, removes, or moves a record between groups participates in a multi-partition writeTransaction touching `tj:items` (or `tj:floatingGroups`) AND `tj:groups`. The existing `writeTransaction` helper supports this — multiple partition mutators batch atomically.

Affected write sites (R3 must touch each):

| Site | New behavior |
|------|--------------|
| `createItem` | Append `item:<newId>` to target Group's renderOrder |
| `deleteItem` | Strip `item:<id>` from owning Group's renderOrder |
| `updateItem({groupId: newGroup})` | Strip from old Group's renderOrder; append to new Group's renderOrder |
| `bulkCreateItems` | Append all new ids to target Group's renderOrder (single multi-partition tx) |
| `bulkDeleteItems` | Strip all deleted ids from owning Group's renderOrder (single tx) |
| `bulkReorderItems` (within group) | Update Group's renderOrder to reflect new positions; legacy `Item.sortOrder` writes preserved |
| `appendFloatingGroup` | Append `floating:<floatingTabId>` to target Group's renderOrder |
| `moveFloatingTab` (cross-group) | Strip from source Group's renderOrder; append to target Group's renderOrder |
| `pruneFloatingGroupsByLiveTabId` | Strip refs to pruned records from owning Group(s)' renderOrder |
| `pruneFloatingGroupsByParentItemId` | Strip refs to pruned records from owning Group(s)' renderOrder |
| `importCollection` (replace mode) | Clear all existing renderOrders; bootstrap new ones from imported sortOrders |
| Drag-reorder (REORDER_FLOATING / saved-item-reorder within group) | Splice the renderOrder array at target index; legacy sortOrder writes preserved as fallback |

### 3.6 Cold-start bootstrap

`reassociateFloatingGroups` extends to ALSO sweep + bootstrap renderOrder. Same writeTransaction; one cold-start pass.

For each Group g:
1. If `g.renderOrder` exists: filter entries that don't resolve to an existing item/floating record. Persist filtered.
2. If `g.renderOrder` is missing or empty after filter: derive from union — items in g sorted by Item.sortOrder asc, then floating records in g sorted by FloatingGroup.sortOrder asc. Persist derived.

The pass converges on first cold-start post-upgrade. Subsequent cold-starts only sweep stale refs (no re-derivation).

### 3.7 Render-path consumption

**Sidepanel** (`sidepanel/sidepanel.js`):
- The existing render path iterates groups, builds saved-item rows + floating-tab rows. With B-148, replace the dual-iteration with `resolveRenderOrder(group, items, floatingMembers)` and render in returned order.
- Drag hit-test (`_buildTabDragRectCache`, `_computeTabDropTarget`, `_computeStripInsertIndex`) extends to enumerate ALL rendered rows in a group's interleaved sequence (not just floating-row midlines). Insert position is computed against the mixed-type row midlines.

**Newtab** (`newtab/newtab.js`):
- Same render-path swap; uses `resolveRenderOrder`. No drag UX in newtab today (spec out-of-scope) — read-only consumption.

### 3.8 Drag-flow contract (Q3-A in detail)

Existing `MSG_REORDER_FLOATING_MEMBERS` payload:
```
{ groupId: string, orderedTabIds: number[] }
```

Pre-B-148: `orderedTabIds` is the new floating-tab order (within the floating-only sequence).
Post-B-148: payload contract changes — pass the FULL new mixed-type renderOrder rather than tab-only ids:

```
{ groupId: string, renderOrder: string[] }   // prefix-encoded
```

Or alternatively keep `orderedTabIds` and add a new field `mixedInsertIndex` indicating where in the mixed sequence the dragged tab landed. R0 spike picks the simpler call shape; R1 locks the wire format.

For saved-item-reorder-within-group (pre-existing op), the same renderOrder writeback applies. R0 verifies whether the existing message contract is sufficient or needs a payload update.

Note on Q3-A reading: "op vocabulary stays" means the SET of dispatched message types is unchanged (no new MSG_* constants). The PAYLOAD of an existing op may evolve to carry full renderOrder array as needed by the SW handler. R0/R1 lock the precise wire format.

### 3.9 No new manifest permissions

Confirmed — B-148 needs no permission additions. `tabs`, `tabGroups`, `storage`, `sidePanel`, `search`, `favicon` (all already declared) cover all required APIs.

## 4 · Schema migration plan

### 4.1 Forward (v6 → v7)

Cold start after upgrade:
1. Migration runner sees stored `schemaVersion === 6 < KNOWN_VERSION (7)`.
2. Runs the v6→v7 step (no-op data migration; just bumps version).
3. `reassociateFloatingGroups` runs in cold-start sequence; bootstraps `renderOrder` for every group that lacks it.
4. First render after cold-start: every group has a populated `renderOrder`. Sidepanel + newtab use it.

User-facing: identical to pre-B-148 layout (saved-then-floating) on first post-upgrade render. Reorders take effect from this point.

### 4.2 Rollback (v7 → v6)

Per CLAUDE.md C-1a rollback pattern:
1. Stored `schemaVersion === 7`. Prior code's `KNOWN_VERSION === 6` → safe-mode (read-only).
2. User exports JSON via Settings → Data → Export JSON.
3. User clears `tj:*` keys via DevTools.
4. User reloads extension → fresh seed at v6 → imports JSON. Import path's `json-validator.js` strips unknown fields (renderOrder) before write, per allow-list direction (C-7).

## 5 · Test plan

### 5.1 Unit tests (`tests/b148-render-order-resolver.test.js`)

8-12 cases covering `shared/render-order.js#resolveRenderOrder`:

- T1: Empty group (no items, no floating) → empty result
- T2: Items only, no renderOrder → bootstrap fallback by Item.sortOrder
- T3: Floating only, no renderOrder → bootstrap fallback by FloatingGroup.sortOrder
- T4: Mixed, no renderOrder → bootstrap fallback (saved-then-floating)
- T5: Mixed, renderOrder present, all refs resolve → returns ordered display
- T6: Mixed, renderOrder present, one stale `item:` ref → filtered silently
- T7: Mixed, renderOrder present, one stale `floating:` ref → filtered silently
- T8: Mixed, renderOrder has refs but item/floating exists not in renderOrder → not auto-appended (per Q4-A strict; render-path expects renderOrder canonical)
- T9: Sub-group case — group at depth=1, has its own renderOrder, parent untouched

### 5.2 Integration tests (each multi-partition write site)

- `tests/b148-create-item-renderorder.test.js`: createItem appends to target Group's renderOrder
- `tests/b148-delete-item-renderorder.test.js`: deleteItem strips from owning Group
- `tests/b148-update-item-groupid-renderorder.test.js`: cross-group move strips source + appends target
- `tests/b148-bulk-ops-renderorder.test.js`: bulkCreate appends multiple; bulkDelete strips multiple
- `tests/b148-floating-ops-renderorder.test.js`: appendFloatingGroup, moveFloatingTab, pruneFloatingGroupsByLiveTabId, pruneFloatingGroupsByParentItemId all maintain renderOrder
- `tests/b148-import-collection-renderorder.test.js`: importCollection-replace clears + re-derives
- `tests/b148-cold-start-bootstrap.test.js`: legacy v6 group with no renderOrder → reassociateFloatingGroups produces correct derived value; stale-ref stripping case

Plus schema migration pins:
- `tests/b148-schema-v7.test.js`: KNOWN_VERSION === 7, defaultShape v7, validator accepts/rejects renderOrder shape
- Pre-existing pin tests updated: `tests/sync-schema-v5.test.js` (still pins KNOWN_VERSION; bumped 6→7), `tests/migration-fresh-install.test.js` (paired-bump pin), `tests/migration-steps.test.js` (B-148 governance test)

### 5.3 UAT (`docs/UAT_B-148.md`)

10-15 cases:

| # | Scenario |
|---|----------|
| 1 | Drag saved bookmark between two floating tabs → renders correctly after refetch |
| 2 | Drag floating tab between two saved bookmarks → renders correctly |
| 3 | Drag saved bookmark to top of floating area → renders at top |
| 4 | Drag floating tab to top of saved area → renders at top |
| 5 | Close a floating tab → its slot collapses (no ghost) |
| 6 | Save a new bookmark → appears at end of group's renderOrder |
| 7 | Delete a saved bookmark → its slot disappears |
| 8 | Cross-group drag of a saved item with mixed-position drop → preserves order on arrival |
| 9 | Cross-group drag of a floating tab with mixed-position drop → preserves order on arrival |
| 10 | Sub-group: interleave inside a depth=1 sub-group works the same as top-level |
| 11 | Newtab renders the same order as sidepanel |
| 12 | Cold-start (extension reload) preserves renderOrder for groups touched post-upgrade |
| 13 | Cold-start (extension reload) bootstraps renderOrder for groups untouched post-upgrade (legacy v6 path) |
| 14 | Import HTML / JSON in replace mode rebuilds renderOrders cleanly |
| 15 | Multi-tab drag (B-154 inheritance) honors mixed-type drop targets |

## 6 · Tier rationale (Tier 3 Spike-First XL)

- **New schema field with cross-partition write contract** — every write site involving items or floating-tab records gains a coordinated renderOrder write. Many call sites; coordination risk.
- **New shared resolver module** — pure but central; consumed by 2 surfaces.
- **Cold-start bootstrap** — runs on every cold-start post-upgrade for the first pass; performance not yet measured for large profiles.
- **Drag hit-test contract changes** — sidepanel drag hit-test extends to mixed-type sequences; subtle index math.

R0 spike validates:
- Multi-partition writeTransaction performance for a large group (e.g., 50+ items + 50+ floating tabs).
- Real-Edge cold-start bootstrap converges without user-visible stuttering.
- Drag-state contract (renderOrder full-array vs delta payload) — pick the simpler form.

R0 likely produces:
- 1× M-tier "core storage + writeTransactions" item
- 1× S-to-M-tier "UI render + drag" item
- Possibly 1× XS "lazy-bootstrap" item if R0 finds upfront cold-start too slow

## 7 · Risks · R2 must resolve

1. **Many write sites touched** — risk of missing one (renderOrder drifts). Mitigation: comprehensive integration test suite covering each call site; tests are the regression net.
2. **Cold-start bootstrap performance on large profiles** (200+ items × 20+ groups). Mitigation: R0 spike measures; if slow, fall back to lazy bootstrap-per-group-on-first-render (each group's render-path does the bootstrap on its first read post-upgrade and persists back).
3. **Multi-partition writeTransaction ordering / atomicity** — does `writeTransaction` actually batch multi-partition writes atomically, or are they serialized? Mitigation: R2 verifies via probe + existing pattern review; pin in test if needed.
4. **Bootstrap derivation order ambiguity** — what if a group has 0 saved items but has floating tabs (B-157 case)? Bootstrap order = floating records by FloatingGroup.sortOrder asc. Saved-then-floating is meaningful only when both are present. R2 documents the precise rule.
5. **Drag contract payload — full renderOrder vs delta** — sending the whole array on every drag is verbose; sending only `{tabId, insertIndex}` requires SW-side splicing. R0 picks one and pins.
6. **Saved-item-cross-group via group-picker (B-029) modal** — does the picker dispatch a multi-partition writeTransaction or does it route through `updateItem({groupId})`? R2 confirms route + ensures renderOrder is updated.
7. **Sub-group depth interaction** — when a saved item is the parent of a sub-group, is its position in the parent group's renderOrder vs the sub-group's renderOrder consistent? R2 documents the rule (item.groupId determines which Group's renderOrder it belongs to; items can be in only one Group at a time).

## 8 · Out of scope (deferred)

- Recovery from manually-corrupted `renderOrder` (entries not matching `item:`/`floating:` prefix). Render-path filters; explicit "repair group order" gesture is a future item.
- Cross-window reorder (still B-135 deferred).
- Animation on reorder (visual polish; future).
- Removing `Item.sortOrder` / `FloatingGroup.sortOrder` post-migration. Both fields stay as-is; render-path no longer depends on them but they remain as fallback during transition. Cleanup in a separate sprint when v6 cohort is confirmed empty (mirrors B-138 pattern).
- Newtab drag UX (B-148 limits newtab to read-only consumption of renderOrder).
- Popup integration — popup is a flat search list; no group-render-path; unaffected by B-148.

## 9 · Acceptance criteria preview (formalized at R1)

1. Schema v6→v7 governance bump (KNOWN_VERSION + defaultShape + new MIGRATION_STEPS entry + CHANGELOG flush note).
2. `Group.renderOrder` field added; `isGroup` validator + `validateGroupPatch` allow-list extended; per-element validator rejects non-prefixed / oversized entries.
3. `shared/render-order.js#resolveRenderOrder` implemented with bootstrap fallback + stale-ref filtering.
4. All 12 write sites in §3.5 updated to maintain renderOrder atomically.
5. Cold-start `reassociateFloatingGroups` bootstraps + strips stale refs per §3.6.
6. Sidepanel render-path uses `resolveRenderOrder`; drag hit-test produces mixed-type insert positions.
7. Newtab render-path uses `resolveRenderOrder`.
8. Sub-groups treated as first-class (each Group at any depth has its own renderOrder).
9. Comprehensive test coverage (~30+ new tests; existing 5 schema-pin tests updated).
10. UAT 10-15 cases all PASS.

**Destructive-action confirmation (DoR item 7)**: N/A — drag is reversible; no data destruction. Schema migration is lazy + non-destructive (legacy `sortOrder` fields preserved).

## 10 · References

- `CLAUDE.md` — project pipeline rules, R2 correctness checklist (C-1a, C-1b, C-7, C-8)
- `docs/SOLUTION_DESIGN.md` — chapter index (a §68 chapter will be authored at R6 close)
- `docs/BACKLOG.md` — B-148 row (P3, originally TBD, S44 scope-locked)
- Prior schema migrations precedent: §60 (B-121 v1→v2), §63 (B-134 v2→v3), §66 (B-137 v3→v4), §67 (B-041 v4→v5). B-159 (v5→v6) shipped via lean-mode bug-fix-loop without an R6 chapter; B-148's R6 close should add a §68 chapter that retroactively documents both v5→v6 and v6→v7.
