# §60 — B-121 Floating-Tab Runtime Render Pipeline (R2 Architecture)

**Owner:** [solution-architect]
**Round:** R2 (Architecture — Spike-First Tier 3, R0 = §58)
**Sprint:** 38
**Date:** 2026-04-28
**Status:** R2 design — pending R3 build (lands AFTER B-125 R3 per [scrum-master] sequencing).

> Companion item: B-125 R2 (`docs/design/59-…`). B-121 R3 assumes B-125's
> `inheritedTabs: Set<number>` is already in place and that opener-chain-spawned
> tabs cannot auto-claim a different bookmark.

---

## §60.1 — Purpose and scope

Wire `tj:floatingGroups` into the **runtime** render pipeline so tabs spawned
via opener-chain inheritance appear as live rows under their parent
bookmark's group section across all three render surfaces (sidepanel, newtab,
standalone window). Resolve the latent §58.4(i) parent-itemId-reuse defect at
the same time.

- BACKLOG row: `docs/BACKLOG.md` B-121 (R1 LOCKED 2026-04-28; 10 ACs; Q1–Q6;
  9 R2-VERIFY markers).
- R0 spike: `docs/design/58-b-125-b-121-r0-spike.md` §58.4 + §58.5 (X1, X2)
  + §58.7 + §58.8 (B-121 sub-section) + §58.9 (T-121-A..F) + §58.10.
- Companion: `docs/design/59-…` (B-125 R2).

---

## §60.2 — R2-VERIFY resolutions (R1 markers 1..9)

### §60.2.1 — `floatingMembers` array-item shape — LOCKED

The per-element shape is

```
{ tabId: number,
  url: string,
  windowId: number,
  tabIndex: number,
  parentItemId: string }
```

`tabId`, `windowId`, `tabIndex`, `url` are exactly the keys already on
`OpenTab` (`shared/messages.js:230-240`) **except** `title`/`favIconUrl`/`audible`/`active`. Rationale: the render path needs
`tabId` (DOM `data-tab-id` for the X-button → `MSG_CLOSE_TABS`),
`url` (`item-url` line + `safeNormalizeForMatch` parity with §58.4(d)), and
`windowId`+`tabIndex` (B-014 window badge + AC9 sort parity with
`buildOpenTabs`). `parentItemId` is required so synthetic rows can carry a
`data-parent-item-id` attribute and the renderer can group/sort them under
the correct bookmark inside the group section. **`title`, `favIconUrl`,
`audible`, `active` are pulled at SW-side enrichment time from the same
`LiveTabIndex` entry that `buildOpenTabs` reads from** so the synthetic row
can be assembled with full DOM parity to an Open-Tabs row. The full shape
is therefore:

```
{ tabId: number,
  url: string,
  windowId: number,
  tabIndex: number,
  parentItemId: string,
  title: string,
  favIconUrl: string|null,
  audible: boolean,
  active: boolean }
```

`savedAt` is **NOT** included — it serves storage ordering (insertion
timestamp) but is not surfaced to renderers; sort uses
`(windowId, tabIndex)` per AC9 parity. If the renderer ever needs
recency-based ordering it can be added later as additive enrichment.

### §60.2.2 — `sidepanel/sidepanel.js` exact line numbers (verified)

| Function | Line | Notes |
|---|---|---|
| `renderAll(items, groups, liveStates, driftRecords, openTabs)` | **2014** | Builds `byGroup` Map; iterates `rootGroups` calling `buildGroupSection`; appends `buildOpenTabsSection(_cachedOpenTabs)` last (line **2106**). |
| `buildGroupSection(group, byGroup, liveStates, driftRecords, isChild)` | **2148** | Builds header + `itemsContainer` (`group-items` class, line 2216–2218); loops `for (const item of groupItems)` calling `buildItemRow` at line **2222**. **Insertion point for synthetic floating-tab rows: immediately after the `for (const item of groupItems)` loop ends at line 2223 (before the inline empty-state fallback at line 2226).** |
| `buildItemRow(item, liveStates, driftRecords)` | **2337** | Saved-bookmark row builder. Reused for parity but NOT used directly for floating rows (synthetic rows have a different identity model — see §60.5). |
| `buildOpenTabRow(tab)` | **2724** | Open-Tabs row builder; used as the **template for floating rows** with the addition of `data-parent-item-id` and `data-floating="true"`. |
| `buildOpenTabsSection(openTabs)` | **2801** | Builds the always-mounted Open Tabs section. |
| `patchOpenTabsSection(nextOpenTabs)` | **2874** | Targeted DOM diff for Open Tabs rows. |
| `refetchAndPatchLiveState()` | **3014** | Calls `MSG_LIST_ITEMS`; updates `_cachedOpenTabs`; falls back to `renderAll` when `needsFullRender` (line 3064–3075); otherwise calls `patchOpenTabsSection(_cachedOpenTabs)` at line **3077**. **Insertion point for floating-section diff/patch: line 3078 — after `patchOpenTabsSection`, before the per-row `[data-item-id]:not([data-live-only])` patch loop at line 3081.** |

### §60.2.3 — `newtab/newtab.js` exact render function names + line numbers (verified)

| Function | Line | Notes |
|---|---|---|
| `boot()` | **119** | Cold-start render entry; calls `Promise.all([MSG_LIST_ITEMS, MSG_LIST_GROUPS])` at line 142. |
| `_renderGrid()` | **566** | Iterates `orderedGroupIds` and calls `_buildGroupSection` per entry (line 596). |
| `_buildGroupSection(group, groupKey, items, isChild)` | **694** | Builds header + `<div class="newtab-group-items" role="list">` (lines 728–730); loops `for (const item of items)` calling `_buildItemRow` at line **737**. **Insertion point for synthetic floating rows: immediately after the `for (const item of items)` loop at line 742 (before `section.appendChild(list)` at line 743).** |
| `_buildItemRow(item, loweredQuery)` | **749** | Saved-row builder. |
| `_refetchAndRender()` | **471** | Full-grid refetch + render cycle (broadcast scope `items`/`groups`). |
| `_refetchAndPatchLiveState()` | **518** | Live-state-only patch (broadcast scope `liveState`). **Floating-section update on broadcast scope `liveState` is consolidated here.** |

### §60.2.4 — Standalone-window file path + functions (verified)

The "standalone window" is **the same `sidepanel/sidepanel.html` document**
hosted in a chrome popup-type window. See
`background/service-worker.js:78-92` (`STANDALONE_URL =
chrome.runtime.getURL('sidepanel/sidepanel.html')`) and `:96-136`
(`openOrFocusStandaloneWindow()`). The standalone surface therefore reuses
**exactly the same** render code as the sidepanel — `sidepanel/sidepanel.js`
runs in the popup window unchanged. **No separate render path; one fix
covers two surfaces.** This collapses Q3's "all three surfaces" requirement
into two render-code surfaces (sidepanel/sidepanel.js + newtab/newtab.js).

### §60.2.5 — Tests pinning the old `MSG_LIST_ITEMS` response shape (grep verified)

`grep -rn "items.*liveStates.*driftRecords\|liveStates.*driftRecords.*openTabs\|openTabs.*windowMap" tests/` returned **one file with multiple sites**:

- `tests/b036-newtab.test.js` lines **659, 701, 744, 769, 785, 807, 838, 866, 897, 925** — every site builds a stub MSG_LIST_ITEMS response with the old 5-key shape `{ items, [groups,] liveStates, driftRecords, openTabs, windowMap }`. Because `floatingMembers` is **additive and optional** (see §60.3), these stubs continue to work without modification — the newtab consumer reads `itemsResp.floatingMembers || {}` and treats `undefined` identically to "no floating members". **No mandatory test updates from this file.** R3 may opt to add a `floatingMembers: {}` key to one or two of these stubs as defensive padding but it is not required for correctness.

Other tests reference `MSG_LIST_ITEMS` only as a message constant (`tests/safe-mode.test.js`, `tests/messages-held.test.js`, `tests/broadcast.test.js`, `tests/b054-sidepanel.test.js`, `tests/b102-cross-window-demote.test.js`, `tests/b107-live-x-aria.test.js`, `tests/enriched-list-items.test.js`) and do not assert the exact key-set of the response. **No additional updates required.**

`tests/enriched-list-items.test.js` does assert the response shape positively — line 244 `const resp = await sendMsg(MSG_LIST_ITEMS, {})` — but only checks specific keys exist (`assert.ok(resp.windowMap)`, etc.) without rejecting unknown keys. **Additive change, no update needed.**

### §60.2.6 — `tests/b018-persistence.test.js` claim-state assertion lines (verified)

The current claim-state assertions live at:
- Line **65–70** (GAP-1) — `claims['g-orphan']` / `claims['g-valid']` checks post-`reassociateFloatingGroups`.
- Line **96–97** (GAP-1 empty-string variant) — `claims['']` / `Object.keys(claims).length`.
- Line **195–199** (R4-H2) — `claims['g-fail']` / `claims['g-ok']` post-failed-claim assertions.
- Line **117** (R4-H1) and following — assertions about pruned vs retained records.

**AC7 new assertion lands as a NEW test** appended at end of file (around line 372+). The new test seeds a parent item `P` with an existing claim in `claimsMirror[P.id] = T_parent` (via `__setMockTabs` for `T_parent` + `reconcileClaims`) AND a `tj:floatingGroups` record produced by the new schema (per §60.4) representing a child floating tab `T_child`. After `reassociateFloatingGroups`: `assert.equal(claimsMirror[P.id], T_parent)` — parent claim preserved.

### §60.2.7 — `tj:floatingGroups` schema version bump — required (depends on §60.4 decision)

§60.4 picks **option (a) synthetic `floatingTabId`**, which adds a new field to the on-disk shape. **Schema version bump required.** Migration plan in §60.4 + §60.13. Pre-S38 records (no `floatingTabId`) survive validation (the new field is OPTIONAL on the read-side validator); the cold-start re-association path treats records-without-`floatingTabId` as legacy and routes them through the existing parent-`itemId`-claim path (the §58.4(i) defect remains for legacy records but they self-evict via `pruneResolvedFloatingGroups` after one cold-start cycle).

### §60.2.8 — Performance budgets (B-021 + B-052) — verified numbers

Per `docs/design/34-b-052-fuzzy-search-caching.md`:
- AC3 (search latency P95): **< 50 ms** on 1 000-item fixture.
- AC4 (first paint P95): **< 200 ms** on 500-item fixture.
- Total `renderAll()` budget: **≤ 200 ms**.
- Per-test margin: search 40 ms, first-paint 160 ms (20% safety margin).

Per `docs/design/19-b-021-inline-side-panel-filter-with-debo.md` (line 14): debounce timer is **150 ms** on filter input.

**B-121 must NOT regress these:** floating-member enrichment in `MSG_LIST_ITEMS` is O(N_floatingRecords × N_liveTabs) but bounded — typical N is ≤ 5 floating records and ≤ 50 live tabs ⇒ ≤ 250 comparisons, negligible vs. the 50 ms budget. Synthetic-row injection in `buildGroupSection` is O(N_floatingMembers) per group — also bounded. **No virtualisation impact.**

### §60.2.9 — "tokyo-night/system tints" R2-VERIFY marker (disregarded)

Stray template carryover from B-117. Not applicable to B-121. Disregarded.

---

## §60.3 — `floatingMembers` contract (Q1)

### §60.3.1 — `MSG_LIST_ITEMS` response gains `floatingMembers`

```
floatingMembers: Record<groupId, Array<{
  tabId: number,
  url: string,
  windowId: number,
  tabIndex: number,
  parentItemId: string,
  title: string,
  favIconUrl: string|null,
  audible: boolean,
  active: boolean
}>>
```

Key = parent bookmark's `groupId` (NOT parent's `itemId` — multiple bookmarks
in the same group with floating children all merge under one key, simplifies
render-side filtering). Value = array of floating-tab descriptors for live
tabs that:
1. Have a `tj:floatingGroups` record.
2. Are present in `LiveTabIndex` (still alive).
3. Are NOT in `Object.values(claimsMirror)` (not promoted to a saved item).
4. The record's `parentItemId` resolves to a known item, AND that item's
   `groupId` is the key.

### §60.3.2 — Build path (SW side)

`background/messages/storage-handlers.js:202-214` — extend the `MSG_LIST_ITEMS`
case body. New helper `background/tabs/floating-members.js` (NEW FILE):

```
export function buildFloatingMembers(items)
```

- Reads `tj:floatingGroups` records via existing `readPartition(PARTITION_FLOATING_GROUPS)`. (Sync-from-mirror is preferable but the partition has no in-memory mirror today — adding one is a micro-refactor R3 may consider; see §60.13.)
- Reads `LiveTabIndex` via `getLiveTabIndex()`.
- Reads `claimsMirror` via `getClaimsMirror()`.
- Builds an `itemId → item` map from the `items` array (already in the handler).
- For each floating-group record:
  - Skip if `record.floatingTabId` is missing AND `record.parentItemId` is missing (legacy / orphan — pruned by re-associate).
  - Resolve `parentItemId` (per §60.4 chosen approach: from `record.parentItemId`, NOT from `record.itemId`).
  - Look up parent in items map. If parent missing → skip (parent deleted; AC8(ii)).
  - Match a live tab via `(record.windowId === liveEntry.windowId && record.tabIndex === liveEntry.index)` first; URL fallback via `safeNormalizeForMatch` second (mirrors `reassociateFloatingGroups`).
  - If matched tab is in `claimsMirror` values → skip (already promoted).
  - Build descriptor and push into `floatingMembers[parent.groupId]`.

### §60.3.3 — `shared/messages.js` typedef extension

Add to `@typedef ListItemsResponse` (lines 243–268):

```
 * @property {Record<string, Array<FloatingMember>>} [floatingMembers]
 *   B-121 — per-group runtime list of opener-chain-spawned tabs that have a
 *   tj:floatingGroups record but are not yet claimed by any saved item.
 *   Key = parent bookmark's groupId. Empty/missing key = no floating members
 *   for that group. The whole field is OPTIONAL on the response: pre-S38
 *   callers see undefined; post-S38 callers see (possibly empty) Record.
 *   Renderers MUST treat undefined identically to {} (no floating members).
 *
 * @typedef {Object} FloatingMember
 * @property {number} tabId
 * @property {string} url
 * @property {number} windowId
 * @property {number} tabIndex
 * @property {string} parentItemId
 * @property {string} title
 * @property {string|null} favIconUrl
 * @property {boolean} audible
 * @property {boolean} active
```

### §60.3.4 — Optionality / forward-compat

- Pre-S38 callers (legacy newtab stubs in `tests/b036-newtab.test.js`) see `undefined` and continue to work — render path uses `itemsResp.floatingMembers || {}`.
- Post-S38 callers see a (possibly empty) `Record<string, Array<…>>`.
- The field appears in **every** post-S38 response (handler always populates, even with `{}`) — no "sometimes-present" ambiguity for the receiving code.

---

## §60.4 — `appendFloatingGroup` schema redesign (Q4 + §58.4(i) latent defect)

### §60.4.1 — Decision: pathway (a) synthetic `floatingTabId`

**Chosen:** option (a) from R0 §58.7 — the `tj:floatingGroups` record gains a synthetic `floatingTabId` field (a fresh `ulid()` per record). The cold-start re-association path uses `floatingTabId` as the **storage identity** for `pruneResolvedFloatingGroups`, NOT `parentItemId`. The `parentItemId` field is stored verbatim and is ONLY used to (i) look up the parent in the items map at runtime enrichment time, and (ii) identify the parent for cold-start re-association — but cold-start re-association no longer calls `claimTabForItem(parentItemId, matchedTabId)` (which is the bug — that overwrites the parent's claim). Instead cold-start re-association either (A) leaves the floating-group record in place and the runtime path renders it as a floating-member row on the next `MSG_LIST_ITEMS` build, OR (B) prunes the record if the matched tab is no longer alive (tab closed during shutdown/restart).

**Why (a) over (b) and (c):**
- (b) tabId-only with opener-map persistence = adds a brand-new persistence partition (more storage migration churn, more SW cold-start logic).
- (c) sentinel value reusing parent itemId = couples B-125's `inheritedTabs` set to a persistent-storage form, conflating ephemeral session state with cold-start storage.
- (a) is the smallest-blast-radius schema change. The synthetic id is already a familiar pattern (ulid is in use for items + groups). The §58.4(i) defect is clean-fixed: parent's claim in `claimsMirror` is **never written by the re-association path** any more (it is owned solely by `reconcileClaims` from URL match against the parent's own URL).

### §60.4.2 — Storage shape — post-S38

Per-record:

```
{ floatingTabId: string,    // NEW (ulid) — storage identity
  parentItemId: string,     // RENAMED from `itemId` (semantic clarity)
  groupId: string,
  windowId: number,
  tabIndex: number,
  url: string,
  savedAt: number }
```

**Rename `itemId` → `parentItemId` is load-bearing**: the existing field is misnamed (it is the parent's itemId, not the floating tab's itemId — a floating tab has no itemId). Rename eliminates the §58.4(i) bug at the type level (`claimTabForItem(record.parentItemId, …)` is obviously wrong on read).

### §60.4.3 — Cold-start re-association (post-S38)

`background/tabs/floating-groups.js:60-132` (`reassociateFloatingGroups`)
loses its `claimTabForItem(record.itemId, matchedTabId)` call entirely. The
new responsibility set is:

1. Read records.
2. For each record:
   - Find a matching live tab via position match (windowId+tabIndex), then URL fallback.
   - If matched **AND** the matched tab is NOT in `claimsMirror` values: **leave the record in place** (resolved at runtime via `MSG_LIST_ITEMS` enrichment).
   - If matched **AND** the matched tab IS in `claimsMirror` values: **prune the record** (the tab has been promoted to a saved item — floating-group association is no longer relevant).
   - If NO match (no live tab): leave the record in place per existing AC9 contract (B-018).
3. Optionally: prune records whose `parentItemId` no longer resolves to any item (parent deleted — AC8(ii)).

The function still returns `void` and still writes via `writeTransaction`. Its public signature is unchanged. Its internal logic is simplified — no more `claimTabForItem` call from the floating-groups module.

### §60.4.4 — `appendFloatingGroup` updated

`background/tabs/floating-groups.js:142-159` — the validator + write logic
adds `floatingTabId` generation:

```
import { ulid } from '../../shared/ulid.js';  // existing helper
...
export async function appendFloatingGroup(entry) {
  if (!entry || typeof entry !== 'object'
    || typeof entry.groupId !== 'string'
    || typeof entry.parentItemId !== 'string' || entry.parentItemId.length === 0
    || typeof entry.windowId !== 'number' || !Number.isFinite(entry.windowId)
    || typeof entry.tabIndex !== 'number' || !Number.isFinite(entry.tabIndex)
    || typeof entry.url !== 'string' || entry.url.length > MAX_URL
    || typeof entry.savedAt !== 'number' || !Number.isFinite(entry.savedAt)) {
    return;
  }
  const stamped = { ...entry, floatingTabId: ulid() };
  await writeTransaction([{
    partition: PARTITION_FLOATING_GROUPS,
    mutator: (current) => {
      const arr = Array.isArray(current) ? current : [];
      return [...arr, stamped];
    },
  }]);
}
```

Caller at `background/tabs/tab-events.js:156-163` updates the field name `itemId` → `parentItemId`.

### §60.4.5 — `pruneResolvedFloatingGroups` updated

`background/tabs/floating-groups.js:171-179` — accepts a `Set<string>` of `floatingTabId` values (not `parentItemId`). Mutator filter:

```
return arr.filter((entry) => !resolvedFloatingTabIds.has(entry.floatingTabId));
```

Legacy records (no `floatingTabId`) are NEVER in the resolved set, so they survive every prune cycle. They self-evict only when their underlying tab dies and the record is otherwise pruned (or via a one-time migration; see §60.13). Acceptable: legacy records just continue rendering (post-S38 enrichment uses `parentItemId` directly when present, falling back to `itemId` for legacy records — see §60.3.2 read path).

### §60.4.6 — `assertShape` validator update

`background/storage/shapes.js:216-231` — add tolerance for the new field:

```
case PARTITION_FLOATING_GROUPS:
  if (!Array.isArray(value)) throw …;
  for (const entry of value) {
    if (!entry || typeof entry !== 'object'
      || !isString(entry.groupId) || !isNumber(entry.windowId)
      || !isNumber(entry.tabIndex) || !isString(entry.url)
      || !isNumber(entry.savedAt)) throw …;
    // floatingTabId is OPTIONAL (legacy records lack it)
    if ('floatingTabId' in entry && typeof entry.floatingTabId !== 'string') throw …;
    // parentItemId is OPTIONAL (legacy records use `itemId` instead)
    if ('parentItemId' in entry && typeof entry.parentItemId !== 'string') throw …;
    if ('itemId' in entry && typeof entry.itemId !== 'string') throw …;
  }
  return;
```

### §60.4.7 — Schema version bump (C-1 APPLIES)

`tj:meta` schema version: bump from **1 → 2**. Migration step registered in
`background/storage/migration.js` (existing migration runner, see §10.6):

```
{
  fromVersion: 1,
  toVersion: 2,
  migrate: async (storage) => {
    // For each tj:floatingGroups record without floatingTabId:
    //   - Generate a floatingTabId
    //   - Rename `itemId` → `parentItemId`
    //   - Persist
  }
}
```

**SW module-cache flush note (CHANGELOG required):** because this introduces a new shape recognized by the validator + a new partition behavior, R6 close MUST add a note in `CHANGELOG.md`: *"After updating to v1.31.0, toggle the extension OFF then ON in `chrome://extensions` to ensure the SW module cache is flushed; otherwise the new floating-tab runtime render path may not activate until the next browser restart."*

### §60.4.8 — Rationale for not deferring the schema bump

The R0 spike §58.10 noted the §58.4(i) defect "may be deferred to a future
sprint." R2 elects to fix it now because:
- Fixing it requires ~30 LOC and one migration step (small).
- Leaving it deferred means the new runtime render path is built on top of a known-broken cold-start contract (parent's claim overwritten on next browser restart) — that's a regression-ready landmine.
- The rename `itemId → parentItemId` is a clarity-preserving change that pays itself back across all future floating-groups work.

---

## §60.5 — Render destination (Q2)

### §60.5.1 — Where synthetic rows mount

Floating-tab rows render as synthetic `.item-row` elements **inside the
parent group section's `.group-items` container**, **immediately after the
last saved-item row**, **before** the inline empty-state fallback (when the
group has zero saved items but ≥ 1 floating member). Sub-groups (nested
child group sections inside the parent's `.group-items`) render after
floating-tab rows, preserving the visual hierarchy:

```
<div class="group-section">
  <div class="group-header">…</div>
  <div class="group-items">
    [saved-item rows]
    [synthetic floating-tab rows]   ← NEW
    [child group sections]
    [inline empty-state if all of the above are zero]
  </div>
</div>
```

### §60.5.2 — Visual treatment

**No visual distinction from saved-bookmark rows or Open-Tabs rows.** Per
locked Q5 (B-124 sequencing): "Floating-tab rows use the same visual
treatment as live-tab rows with a live claim — no italic, no muted text, no
dotted bar, no alternate bar color." B-124 owns visual distinction in a
later sprint.

### §60.5.3 — Affordances (parity with Open-Tabs row at `sidepanel.js:2724`)

- Selection checkbox `_createItemSelect(isSelected)` (multi-select via `tab:<tabId>` selection key, mirroring B-055).
- Favicon/letter-avatar (same `_buildOpenTabFavicon` helper).
- Title + URL block (`textContent` only, untrusted-data).
- Window badge via `_renderWindowBadge` (B-014 parity).
- Audible icon if `tab.audible`.
- ARIA label via `buildItemRowAriaLabel(openTabItem, openTabLive, false, isSelected)`.
- **Close-tab "X"**: synthetic row carries the same X-button affordance and the same `MSG_CLOSE_TABS` confirmation flow as Open-Tabs rows. Click → existing close-tab confirmation dialog (no new dialog) → `MSG_CLOSE_TABS` with `[tabId]` → on-success `chrome.tabs.onRemoved` → broadcast `LIVE_STATE` → next `refetchAndPatchLiveState` removes the row.

### §60.5.4 — Synthetic-row data attributes (sidepanel/standalone + newtab parity)

```
data-tab-id="<tabId>"            (number, required for X-button)
data-floating="true"             (R3 + R4 selector for the synthetic class)
data-parent-item-id="<itemId>"   (parent bookmark's itemId)
data-window-id="<windowId>"      (B-014 window-filter)
data-live="true"                 (always — floating tabs are live by definition)
data-live-only="true"            (excluded from saved-item patch loops; B-055 parity)
[data-active="true"]             (when the tab is the active tab in its window)
[data-audible="true"]            (when tab.audible)
[data-selected="true" + aria-selected]  (when row is in _selection)
```

`data-live-only="true"` is critical: the saved-item patch loop at
`sidepanel.js:3081` is `[data-item-id]:not([data-live-only])` — synthetic
rows must NOT match this selector, otherwise the patch loop will try to
correlate them against `liveStates[itemId]` and crash on `undefined`.
Synthetic rows get patched by the floating-section diff path (§60.6.1.b)
not by the saved-item patch loop. **Synthetic rows do NOT carry
`data-item-id`** — only `data-tab-id`. `[data-item-id]` in selectors
unambiguously means "saved-item row".

---

## §60.6 — Per-surface render plan (Q3)

### §60.6.1 — Sidepanel + Standalone (`sidepanel/sidepanel.js`)

**(a) `renderAll` signature extension** (line 2014):

```
function renderAll(items, groups, liveStates, driftRecords, openTabs, floatingMembers)
```

Accepts the new `floatingMembers` parameter (default `{}`). Cache it on a new module-level `_cachedFloatingMembers` (mirrors `_cachedOpenTabs`). The empty-state guard at line 2028 also checks `_cachedFloatingMembers` — if all saved items are zero AND no groups AND no open tabs AND no floating members, show empty state.

**(b) `buildGroupSection` signature extension** (line 2148):

```
function buildGroupSection(group, byGroup, liveStates, driftRecords, isChild, floatingMembersForGroup)
```

After the `for (const item of groupItems)` loop at 2221–2223, **before** the inline empty-state fallback at 2226: iterate `floatingMembersForGroup || []` and append synthetic rows built by a new helper `buildFloatingTabRow(member)` (which is `buildOpenTabRow(tab)` + the additional data attributes from §60.5.4).

**(c) `refetchAndPatchLiveState` extension** (line 3014): after `patchOpenTabsSection(_cachedOpenTabs)` at line 3077: call a new `patchFloatingMembersSections(itemsResp.floatingMembers || {})` helper. This helper:
- Indexes existing synthetic rows by `data-tab-id` across all group sections.
- For each `(groupId, members[])` in the new `floatingMembers`:
  - Find the group section by `[data-group-id="<groupId>"]`.
  - Find or create the synthetic-row insertion zone (the container immediately after the last `.item-row[data-item-id]:not([data-floating])`).
  - For each member: if a row with `data-tab-id="<tabId>"` exists in this group → patch attributes + title + URL. Otherwise → create + insert.
- For any existing `[data-floating="true"]` row whose `data-tab-id` is NOT in the new floatingMembers union → remove.

**(d) `_cachedFloatingMembers` updates**: just like `_setCachedOpenTabs` — a setter that defensive-copies and updates the cache. Called from `renderAll` and from `refetchAndPatchLiveState`.

**(e) Filter integration (`applyFilter`)**: synthetic rows participate in the existing filter machinery via `_rowByItemId`-like indexing. Filter matches against `data-tab-id` row's URL and title. **Out-of-scope for B-121:** advanced filter affordances on floating tabs (deferred to future sprints).

### §60.6.2 — Newtab page (`newtab/newtab.js`)

**(a) `_setItems` + module state**: add `_floatingMembers` module-level cache.

**(b) `_renderGrid` data flow**: pass `_floatingMembers` into `_buildGroupSection`.

**(c) `_buildGroupSection` extension** (line 694): after the `for (const item of items)` loop at 736–741, **before** `section.appendChild(list)` at line 743: iterate `_floatingMembers[groupKey] || []` and append synthetic rows via a new `_buildFloatingTabRow(member)`. The newtab row has slightly simpler affordances (no item-row drag, no item-row reorder — newtab is read-only by design); the X-button + `MSG_CLOSE_TABS` is included for parity per AC6.

**(d) `_refetchAndRender`** (line 471): in the destructure at line 491–497, also assign `_floatingMembers = itemsResp?.floatingMembers || {}`.

**(e) `_refetchAndPatchLiveState`** (line 518): on broadcast scope `liveState`, the simplest correct strategy is **full-grid rebuild** (newtab already does this on `items`/`groups` broadcasts). The `liveState` broadcast handler currently does per-row patches; B-121 extends it to also handle floating-row inserts/deletes. **Implementation choice: fall back to full-grid rebuild if floating-member set has changed** (cheaper than DOM diffing in newtab's smaller-DOM context) — guarded by a quick `JSON.stringify` comparison on the new vs. old floating-members map. If the floating-member set is unchanged, the existing per-row patch loop suffices.

### §60.6.3 — Standalone window

Standalone is the same `sidepanel/sidepanel.html` document — §60.6.1 changes cover it automatically. **No additional file edits.**

---

## §60.7 — `buildOpenTabs` exclusion (AC5)

### §60.7.1 — Required behavior

A tab that is a floating-group member MUST NOT appear in the `openTabs`
array. The current `buildOpenTabs` (`background/tabs/open-tabs.js:33-61`)
excludes only via `claimsMirror` membership. Add a second exclusion: any
tab whose `tabId` matches a `tj:floatingGroups` record AND whose record
resolves to a still-existing parent item.

### §60.7.2 — Implementation

Either:
- **(a) inline**: extend `buildOpenTabs` to read `PARTITION_FLOATING_GROUPS` directly (sync read from in-memory mirror — but no mirror exists today, so this would force an `await readPartition(...)` change to async, blast radius across all callers).
- **(b) builder**: precompute a `Set<number>` of "floating-tab tabIds" once per `MSG_LIST_ITEMS` call and pass it to `buildOpenTabs` as a parameter.

**Choice: (b)**. The `MSG_LIST_ITEMS` handler already sequences `buildLiveStates` → `getDriftRecords` → `buildOpenTabs` → `getWindowMap`. Insert `buildFloatingMembers(items)` before `buildOpenTabs` and pass the union `Set<number>` of all floating-member tabIds:

```
const floatingMembers = await buildFloatingMembers(items);
const floatingTabIds = new Set();
for (const arr of Object.values(floatingMembers)) {
  for (const m of arr) floatingTabIds.add(m.tabId);
}
const openTabs = buildOpenTabs(floatingTabIds);
```

`buildOpenTabs` signature update:

```
export function buildOpenTabs(floatingTabIds = new Set()) {
  ...
  for (const [tabId, entry] of index) {
    if (claimedTabIds.has(tabId)) continue;
    if (floatingTabIds.has(tabId)) continue;   // NEW
    ...
  }
}
```

Default-empty set keeps existing test callers (`buildOpenTabs()` no-arg) working.

### §60.7.3 — Edge cases

- **Orphaned floating-group record (parent deleted)**: `buildFloatingMembers` returns no entry for that group → tab is NOT in `floatingTabIds` → tab falls through to Open Tabs (gracefully degrades, AC8(ii)).
- **Live tab not in any floating-group record**: `floatingTabIds.has(tabId)` is false → tab appears in Open Tabs as today.
- **Floating tab promoted via `MSG_PROMOTE_TAB`**: new claim added to `claimsMirror` → `claimedTabIds.has(tabId)` is true → tab excluded by the existing claim check (the floating-group record is also pruned by `pruneResolvedFloatingGroups` in the same operation). **No double-exclusion concern.**
- **Stale floating-group record after browser restart**: `reassociateFloatingGroups` (§60.4.3) prunes records whose tab has been claimed; surviving records are runtime-rendered on next `MSG_LIST_ITEMS`.

---

## §60.8 — C-9 Empty-state design (4 states from R1 AC8)

### (i) Opener-chain returns no parent

`walkOpenerChain(tabId, claimsMirror, items)` returns `null`. The
opener-chain async block at `tab-events.js:143-169` exits without calling
`appendFloatingGroup`. **No floating-group record written.** Tab appears
in Open Tabs section (existing B-013 behavior, unchanged). **No code
change required for this state.**

### (ii) Parent bookmark deleted while floating tab is open

Parent item deleted via `MSG_DELETE_ITEM` → `tj:items` updated.
`tj:floatingGroups` still contains the record pointing at the (now
deleted) `parentItemId`.

**At next `MSG_LIST_ITEMS` build:** `buildFloatingMembers` resolves
`record.parentItemId` against the items map — returns `null` (parent
missing) → record is **skipped from the floatingMembers output**. The
live tab falls through to `buildOpenTabs` (because its `tabId` is NOT in
`floatingTabIds`) and renders in the Open Tabs section.

**Pruning timing**: lazy. The floating-group record is left in storage
until the next `pruneResolvedFloatingGroups` sweep. Add a new sweep
trigger — `MSG_DELETE_ITEM` cascade — that also prunes any
floating-group record whose `parentItemId` matches the deleted item:

```
// background/messages/storage-handlers.js — MSG_DELETE_ITEM case
await deleteItem(p.id);
await pruneFloatingGroupsByParentItemId(p.id);  // NEW
```

The new helper lives in `background/tabs/floating-groups.js` (NEW export),
mirrors `pruneResolvedFloatingGroups` shape:

```
export async function pruneFloatingGroupsByParentItemId(parentItemId) {
  await writeTransaction([{
    partition: PARTITION_FLOATING_GROUPS,
    mutator: (current) => Array.isArray(current)
      ? current.filter((e) => e.parentItemId !== parentItemId)
      : current,
  }]);
}
```

This is the **eager** prune; `buildFloatingMembers` is the **lazy**
fallback (covers race conditions where deletion happens between
`MSG_DELETE_ITEM` and the next render). Both paths maintain the same
end-state contract.

### (iii) Browser restart with stale floating-group records

Cold-start runs `reassociateFloatingGroups` (§60.4.3 redesign). Per the
new logic: matched-and-unclaimed → record stays; matched-and-already-claimed
→ record pruned; no live tab → record stays per AC9 contract. **Parent's
claim is NEVER overwritten** because `claimTabForItem(parentItemId, …)`
is no longer called from this path. AC7 holds.

### (iv) Floating tab navigates to URL matching a different saved bookmark

Depends on B-125 landing first (per [scrum-master] sequencing). With
B-125's `inheritedTabs` set in place: the floating tab's tabId is in
`inheritedTabs`; the `onUpdated` URL-change debounced handler fires →
`reevaluateTab(tabId, newUrl, items)` → the new gate `if
(inheritedTabs.has(tabId)) return` skips auto-claim. The floating tab
remains a floating-group child of its original parent's group; its URL
inside the floating-row updates on the next `LIVE_STATE` broadcast (the
floating-member descriptor reads `liveEntry.url` which has been updated).

**B-121 R3 has zero work here** if B-125 R3 is already merged. AC8(iv) is
satisfied transitively through B-125's gate. R3 [frontend-engineer] adds
a defensive smoke-test (T-121-G in §60.12) that asserts: "given a
floating tab `T_child` whose URL now matches saved item `B`, on
`reevaluateTab(T_child, B.url, items)`, item `B` remains unclaimed." This
test is structurally identical to B-125's T-125-A but specifically
seeded as a floating-group-member-tab scenario.

If for any reason B-125 R3 is NOT merged before B-121 R3 starts (cross-bug
sequencing change): [scrum-master] decision. Recommendation: B-121 R3
guards AC8(iv) by **skipping `reevaluateTab` auto-claim for any tab with
an active `tj:floatingGroups` record** as a defense-in-depth measure
even after B-125 lands. R2 declines to mandate this — B-125's
`inheritedTabs` is the architecturally cleaner gate (ephemeral,
session-scoped) and B-121 should not duplicate the policy.

---

## §60.9 — R3 fix-scope (B-119 + B-126 enumeration applied)

| File | Change kind | LOC est. |
|---|---|---|
| `shared/messages.js` | Typedef expansion (`@typedef ListItemsResponse` + new `@typedef FloatingMember`) — see §60.3.3. | +20 |
| `background/messages/storage-handlers.js` | MSG_LIST_ITEMS case body extension (call `buildFloatingMembers`, pass `floatingTabIds` to `buildOpenTabs`, return `floatingMembers` in response). MSG_DELETE_ITEM cascade adds `pruneFloatingGroupsByParentItemId` call. | +30 |
| `background/tabs/floating-members.js` | **NEW FILE** — `buildFloatingMembers(items)` helper per §60.3.2. | +60 |
| `background/tabs/floating-groups.js` | (i) `appendFloatingGroup` adds `floatingTabId` ulid + renames `itemId → parentItemId`. (ii) `reassociateFloatingGroups` removes `claimTabForItem` call; instead leaves matched-unclaimed records in place and prunes matched-claimed ones. (iii) `pruneResolvedFloatingGroups` parameterized by floatingTabIds Set. (iv) NEW export `pruneFloatingGroupsByParentItemId(parentItemId)`. | +60 / -30 |
| `background/tabs/index.js:47` | Cold-start re-association call site unchanged in shape (`reassociateFloatingGroups(getLiveTabIndex(), getClaimsMirror())`); behavior changes are internal to the function. | 0 |
| `background/tabs/tab-events.js:156-163` | `appendFloatingGroup({ groupId, parentItemId: result.itemId, … })` — field name change. | ±2 |
| `background/tabs/open-tabs.js:33` | `buildOpenTabs(floatingTabIds = new Set())` signature + exclusion check. | +5 |
| `background/storage/shapes.js:216-231` | Validator tolerance for new fields per §60.4.6. | +10 |
| `background/storage/migration.js` | New migration step: schemaVersion 1 → 2 per §60.4.7. | +30 |
| `sidepanel/sidepanel.js` | (i) `renderAll` + `buildGroupSection` signature extension. (ii) NEW `buildFloatingTabRow(member)` (clone of `buildOpenTabRow` with floating attrs). (iii) NEW `patchFloatingMembersSections(floatingMembers)`. (iv) `refetchAndPatchLiveState` extension. (v) module-level `_cachedFloatingMembers` + `_setCachedFloatingMembers`. | +200 |
| `newtab/newtab.js` | (i) `_floatingMembers` module state. (ii) `_buildGroupSection` extension. (iii) NEW `_buildFloatingTabRow`. (iv) `_refetchAndRender` + `_refetchAndPatchLiveState` extension. | +120 |
| `tests/b121-floating-group-render.test.js` | **NEW FILE** — see §60.12 for cases. | +400 |
| `tests/b013-opener-chain.test.js` | AC1 / AC9 assertions extended to runtime visibility (B-119 enumeration). | +30 |
| `tests/b018-persistence.test.js` | NEW test asserting parent's claim NOT overwritten post-`reassociateFloatingGroups` (AC7). Also field-name updates: `itemId` → `parentItemId` in seed records (~10 sites). | +20 |
| `tests/b099-drift-fix.test.js` | T6 asserts `buildOpenTabs` excludes a floating-group member tab in addition to drifted-claimed tab (B-119 enumeration). | +20 |
| `tests/floating-shape.test.js` | Field rename `itemId` → `parentItemId`; assert `floatingTabId` present after `appendFloatingGroup` write. | +5 |
| `tests/floating-multi.test.js` | Field rename in seed records. | +5 |
| `tests/floating-position.test.js` | Field rename in seed records. | +5 |
| `tests/demote-item.test.js` | Field rename in seed records (lines 161, 186). | +5 |

**Total estimate**: ~1 050 LOC changed/added across 18 files.

**No `manifest.json` change**. **No new permission**. **No new message type**.

---

## §60.10 — Pre-existing test assertions to update (B-119 + B-126 enumeration — explicit subsection)

Per the B-119 fix-scope test-assertion enumeration mandate (S37 retro
action) and B-126 expansion:

- `tests/b099-drift-fix.test.js:284` (T6) — asserts `buildOpenTabs()`
  excludes a drifted-but-claimed tab. **Update to**: also seed a
  floating-group-member tab (no claim, has `tj:floatingGroups` record);
  assert `buildOpenTabs(floatingTabIds)` excludes BOTH the
  drifted-claimed tab AND the floating-member tab.

- `tests/b013-opener-chain.test.js:60-77` (AC1) — currently asserts
  `appendFloatingGroup` writes a record. **Update to**: extend to
  include `floatingTabId` field assertion (post-§60.4 schema). **Add**:
  new test asserting that immediately after `appendFloatingGroup` is
  called and `MSG_LIST_ITEMS` is dispatched, the response's
  `floatingMembers[parent.groupId]` array includes a member with
  `parentItemId: 'item-1'`. **Add**: assertion that
  `buildOpenTabs(floatingTabIds)` excludes the floating-tab tabId.

- `tests/b018-persistence.test.js:65-70` (GAP-1), `:96-97`, `:195-199`
  — current claim-state assertions reflect the OLD schema where
  `claimTabForItem(record.itemId, …)` was called. **Update to**: post-
  §60.4, `reassociateFloatingGroups` no longer writes parent claims.
  Assertions should check claims established by `reconcileClaims`
  (URL-match-based) ONLY. **Add**: NEW test (around line 372+) seeding
  a parent item P with `claimsMirror[P.id] = T_parent` already established
  by `reconcileClaims`; AND a `tj:floatingGroups` record where
  `parentItemId = P.id` and `floatingTabId = ulid` and tabId resolves to
  a different `T_child`; assert post-`reassociateFloatingGroups` that
  `claimsMirror[P.id] === T_parent` (parent claim preserved) AND the
  record is NOT pruned (still in `tj:floatingGroups` — tab T_child is
  alive and unclaimed).

- `tests/floating-shape.test.js:20-90` — field-name renames `itemId →
  parentItemId` in test fixtures (`seedPartitions`/`saveFloatingGroups`);
  **add** assertion that `floatingTabId` is auto-stamped by
  `appendFloatingGroup`. The `saveFloatingGroups` write path does NOT
  auto-stamp (it accepts caller-supplied entries verbatim — used for
  legacy migration only); R3 confirms the test expectations match
  whichever helper is called.

- `tests/floating-multi.test.js:21-77` — field-name renames in seed records.

- `tests/floating-position.test.js:23-77` — field-name renames in seed records.

- `tests/demote-item.test.js:161, 186` — field-name renames where the
  test reads `tj:floatingGroups` raw and asserts contents.

- `tests/b036-newtab.test.js:659, 701, 744, 769, 785, 807, 838, 866, 897,
  925` — stub MSG_LIST_ITEMS responses lack `floatingMembers`. **No
  mandatory update** — the receiving newtab code reads
  `itemsResp.floatingMembers || {}`. **Optional pad**: add `floatingMembers:
  {}` to one or two stubs as defensive padding (recommended at R3 for
  clarity; not required for correctness).

- All other test files asserting `MSG_LIST_ITEMS` shape — no exact-key-set
  assertions found in §60.2.5 grep. **No further updates required**.

CSS-token invariant tests (B-126 class) — **N/A**: this is a JS
message-contract + DOM-structure change, not a CSS-token change. No
theme test files affected.

---

## §60.11 — R2 Correctness Checklist (C-1..C-12)

| # | Check | Disposition |
|---|---|---|
| C-1 | Storage schema versioned | **APPLIES.** §60.4.7 — schemaVersion 1 → 2; migration step adds `floatingTabId` + renames `itemId → parentItemId`. **SW module-cache flush note required in CHANGELOG (toggle OFF/ON cycle after update).** |
| C-2 | Message contracts typed | **APPLIES.** §60.3.3 — `floatingMembers` typed as `Record<string, Array<FloatingMember>>` in `shared/messages.js` typedef. New `@typedef FloatingMember` defined. Field is OPTIONAL on response (undefined treated as `{}`). |
| C-3 | SW cold-start safe | **APPLIES.** §60.4.3 redesign of `reassociateFloatingGroups` — no longer overwrites `claimsMirror` from the floating-groups path; `claimsMirror` is solely owned by `reconcileClaims`. Cold-start ordering preserved (see `background/tabs/index.js:35-48`): `buildLiveTabIndex` → `reconcileClaims` (claims established) → `reassociateFloatingGroups` (prune-only, no claim writes). |
| C-4 | ID stability | **APPLIES.** `parentItemId` is a stable saved-item id. New `floatingTabId` is a per-record synthetic id (ulid) — stable for the record's lifetime. The actual browser `tabId` remains ephemeral (used at runtime; not persisted). |
| C-5 | Manifest paths | **N/A.** No manifest changes. |
| C-6 | Permission minimization | **N/A.** No new permissions. |
| C-7 | Allow-list direction | **N/A.** No sanitizer/exporter touched (rendered title/url use `textContent` per existing security posture). |
| C-8 | SW-context feasibility | **N/A.** No new browser API surface introduced. `buildFloatingMembers` reads existing in-memory mirrors + storage. |
| C-9 | Empty-state design | **APPLIES.** §60.8 — four states enumerated with implementation specifics. R4 [qa-reviewer] checks against this enumeration. |
| C-10 | Off-screen rect | **N/A.** No off-screen positioning / drag-image / canvas snapshot. |
| C-11 | Popup-lifecycle ordering | **N/A.** Floating-tab close ("X") fires `MSG_CLOSE_TABS` from sidepanel/standalone/newtab — none of these surfaces tear down on focus shift the way the toolbar popup (`popup/popup.js`) does. The existing `MSG_CLOSE_TABS` fire-and-forget call site (`sidepanel.js:6035`) is the same pattern used for Open-Tabs rows — already C-11 safe. |
| C-12 | Manifest declaration runtime-mutability | **N/A.** No manifest-declaration toggle behavior. |

---

## §60.12 — Test design

New test file `tests/b121-floating-group-render.test.js` covers all 10 R1 ACs:

| Test | AC | Scenario |
|---|---|---|
| T-121-A | AC1 | `MSG_LIST_ITEMS` response includes `floatingMembers` keyed by parent's `groupId` (NOT by `itemId`). Seed: parent item P in group G; `appendFloatingGroup({ groupId: G, parentItemId: P.id, … })`; live tab T_child matching the record. Assert `floatingMembers[G][0].parentItemId === P.id`, `.tabId === T_child.id`, `.url === T_child.url`. |
| T-121-B | AC5 | `buildOpenTabs(floatingTabIds)` excludes a floating-group member tab. Seed: T_child matching a floating-group record + an unrelated untracked tab T_other. Assert `T_child.id` NOT in `openTabs`; `T_other.id` IS in `openTabs`. |
| T-121-C | AC5 / AC8(ii) | Closing a floating tab (`chrome.tabs.onRemoved`) removes it from `floatingMembers` on next `MSG_LIST_ITEMS`. Seed + close tab + assert. |
| T-121-D | AC7 (also covered by T-125-D-equivalent) | `MSG_PROMOTE_TAB` on a floating-group member promotes to a saved item under the parent's group; the floating-group record is pruned. (Reuses existing promote-tab test infra.) |
| T-121-E | AC2 / DOM | `buildGroupSection` injects a `[data-floating="true"]` row when `floatingMembers[groupId]` is non-empty. DOM assertion: count of `.item-row[data-floating="true"]` inside the parent group's `.group-items` matches the floatingMembers array length. |
| T-121-F | AC3 | Newtab `_buildGroupSection` injects synthetic rows in the same way (pure DOM assertion against the newtab fragment). |
| T-121-G | AC8(iv) — defensive | A floating tab navigates to URL matching saved item B; `reevaluateTab(T_child, B.url, items)` does NOT auto-claim B. (Structurally identical to T-125-A; B-121 specific seeding scenario.) |
| T-121-H | AC7 | After `reassociateFloatingGroups`, parent's existing claim from `reconcileClaims` is NOT overwritten. Seed: P claimed via reconcileClaims to T_parent; T_child also alive with floating-group record. Assert claims unchanged. (This test ALSO lives in `b018-persistence.test.js` per §60.10 enumeration; including a B-121-specific copy here for AC traceability.) |
| T-121-I | AC8(ii) | Parent bookmark deleted → on next `MSG_LIST_ITEMS`, floating member excluded from `floatingMembers`; tab appears in `openTabs`; floating-group record pruned by `pruneFloatingGroupsByParentItemId`. |
| T-121-J | AC10 | `manifest.json` unchanged; `shared/messages.js` exports unchanged (only typedef extended); `tj:floatingGroups` schema bump documented in `tj:meta`. (Static checks; can be run as part of test suite or treated as code-review check.) |

UAT plan (separate file `docs/UAT_B-121.md`) enumerates the 8 manual test cases per §58.9.

---

## §60.13 — Rollback plan

### Schema rollback

If post-deploy a SEV2 surfaces in the floating-groups subsystem:
1. `git revert <r3-commit-sha>` — restores `tj:floatingGroups` write path to the pre-S38 shape (`itemId` field, no `floatingTabId`).
2. **Forward-compat caveat**: post-S38 records (with `floatingTabId` + `parentItemId`) written between deploy and rollback will fail `assertShape` on the rolled-back validator (which expects `itemId` not `parentItemId`). Two options:
   - **(a) Forced-empty migration step**: ship a hotfix that wipes `tj:floatingGroups` on rollback — accepts loss of post-S38 floating-group records; user-visible impact = on next browser restart, opener-chain-spawned tabs that were tracked since the deploy lose their cold-start re-association. Acceptable: floating-group cold-start re-association is best-effort by design (B-018 AC9).
   - **(b) Bidirectional read tolerance**: ship the rollback with a read-side validator that accepts BOTH old and new shapes; subsequent writes use the old shape. Records written by S38 keep functioning until the next prune sweep, then naturally evict. Recommended.

### Code rollback

`git revert <r3-commit-sha>` covers all source + test changes. CI suite re-runs cleanly post-revert (test changes are in the same commit).

### Migration rollback

The schemaVersion 1 → 2 migration is **idempotent** and **non-destructive** — it transforms records from `{itemId, …}` → `{parentItemId, …, floatingTabId}`. A rollback to v1 needs the **inverse migration** if records were written. The hotfix described above (option (b)) ships the inverse: rename `parentItemId → itemId`; drop `floatingTabId`. Records reverted lose their re-association safety (the bug returns) but do not corrupt user data.

### Rollback testing

A test pinning the pre-S38 record shape (existing `floating-shape.test.js`) is updated by R3 to the new shape. R3 keeps a copy of the original assertion form in a comment so a rollback PR can mechanically restore it.

---

## §60.14 — As-Built (R6 close)

**Built:** 2026-04-29 (Sprint 38, R3 → R4 fix-and-reproceed → R5).
**Author:** [frontend-engineer] (R3 build + R4 fixes); [test-engineer] (R5 tests + UAT plan); [solution-architect] (this R6 close).

### §60.14.1 As-built vs. as-designed summary

The R3 implementation followed the R2 plan in all structural respects:
new SW helper `background/tabs/floating-members.js` (`buildFloatingMembers`)
is the single SW-side source of truth for the synthetic-row payload; the
`MSG_LIST_ITEMS` response gained the optional `floatingMembers` field per
§60.3.3; both renderers (sidepanel + newtab) now inject `[data-floating="true"]`
rows under the parent bookmark's group section per §60.4.6;
`reassociateFloatingGroups` was redesigned per §60.4.3 to be prune-only
(no `claimsMirror` writes); `pruneFloatingGroupsByParentItemId` resolves
the §58.4(i) parent-itemId-reuse defect on every parent-bookmark delete
path. B-125's `inheritedTabs` invariant is preserved unchanged (§59.10.6).

**Two pre-authorized deviations from R2 baseline:**

1. **Schema-migration choice — lazy migration (per §60.4.5 option B).**
   R2 left the choice between a one-shot migration step (§60.4.5 option A)
   and lazy read-side normalization (option B) open. R3 chose **lazy**:
   validators in `background/storage/shapes.js` accept BOTH the v1 shape
   (`{ itemId, … }`, no `floatingTabId`) and the v2 shape
   (`{ parentItemId, …, floatingTabId }`); every new write stamps v2;
   legacy v1 records self-evict on the next prune sweep. Rationale: lower
   blast radius than a migration step that touches every record, and the
   `floatingGroups` partition is reconciled on every SW boot anyway, so
   stale v1 reads converge quickly. R4 fix round subsequently added a
   **no-op v1 → v2 migration step** in `background/storage/migration.js`
   to advance `KNOWN_VERSION` from 1 → 2 and seed v2 in
   `defaultShape(PARTITION_META)` so fresh installs skip migration entirely
   and existing installs cleanly stamp the post-S38 schema version.

2. **Newtab close-button + keyboard activation — under-scoped at R3,
   completed at R4.** R2 §60.6.2(c) AC6 specified an X close button on
   newtab synthetic rows plus ENTER/SPACE keyboard activation. R3 shipped
   only the data attributes; R4 [code-reviewer] H-1 + [qa-reviewer] H-1
   surfaced the gap as keyboard-dead floating rows on newtab. The R4 fix
   round added the explicit X button DOM, `_activateFloatingTab` /
   `_closeFloatingTab` helpers, ENTER/SPACE handlers, and the close-button
   CSS in `newtab/newtab.css`. The fix is in-scope per the R2 chapter —
   not a deviation, an R3 under-implementation corrected at R4.

### §60.14.2 Final fix-scope LOC table (actual)

| File | Region | Net LOC |
|---|---|---|
| `background/tabs/floating-members.js` | NEW — `buildFloatingMembers` + `matchedTabIds` dedupe + JSDoc | +154 |
| `background/messages/storage-handlers.js` | `MSG_LIST_ITEMS` enrichment — call `buildFloatingMembers`, add response field | edit |
| `background/tabs/floating-groups.js` | `reassociateFloatingGroups` redesigned prune-only; `appendFloatingGroup` writes v2 shape; `pruneFloatingGroupsByParentItemId` added | edit |
| `background/tabs/open-tabs.js` | `buildOpenTabs(floatingTabIds)` — exclude floating-tracked tabs | edit |
| `background/tabs/tab-events.js` | Cascade-prune from `MSG_BULK_DELETE_ITEMS` and `MSG_DELETE_GROUP` | edit |
| `background/tabs/tab-claims.js` | B-125 — preserved verbatim, no B-121 edits | (no net change) |
| `background/storage/shapes.js` | Validator allow-list reads BOTH v1 + v2 shapes; new writes stamp v2 | edit |
| `background/storage/migration.js` | No-op v1 → v2 step; `KNOWN_VERSION` 1 → 2; `defaultShape(PARTITION_META)` seeds v2 | edit |
| `shared/messages.js` | `@typedef FloatingMember` + `floatingMembers?: Record<string, FloatingMember[]>` on `MSG_LIST_ITEMS` response | edit |
| `sidepanel/sidepanel.js` | `buildGroupSection` injects `[data-floating="true"]` rows; ARIA-label fallback via `_cachedFloatingMemberByTabId`; `patchFloatingMembersSections` static anchor capture | edit |
| `newtab/newtab.js` | `_buildGroupSection` parity inject; `_activateFloatingTab` + `_closeFloatingTab` + ENTER/SPACE handlers + X close button | edit |
| `newtab/newtab.css` | Floating-row close-button styling | edit |
| `tests/b121-floating-group-render.test.js` | NEW — T-121-A..J + R4 add-ons T-121-D, T-121-F, T-121-O | +~550 |

**Test files updated (B-119 + B-126 enumeration plus KNOWN_VERSION bump):**
`tests/b099-drift-fix.test.js`, `tests/b013-opener-chain.test.js`,
`tests/b018-persistence.test.js`, `tests/floating-shape.test.js`,
`tests/floating-multi.test.js`, `tests/floating-position.test.js`,
`tests/demote-item.test.js`, `tests/b102-cross-window-demote.test.js`,
`tests/migration-steps.test.js`.

### §60.14.3 Schema-migration choice — rationale

Lazy migration was chosen over a one-shot bulk migration for three
reasons: (a) the `floatingGroups` partition is best-effort and reconciles
on every SW boot, so stale v1 records have a self-correcting upper bound;
(b) reading both shapes inside `assertShape` is a 4-line allow-list union
with zero blast radius; (c) avoids a destructive migration step that
would re-write every record on a single load — costlier on rollback. The
companion no-op v1 → v2 step + `defaultShape` seed (added at R4) is a
**bookkeeping** migration that advances `tj:meta.schemaVersion` so fresh
installs and existing installs converge on the same post-S38
`KNOWN_VERSION = 2` baseline without touching record contents.
CHANGELOG carries the SW module-cache flush note (toggle OFF/ON) per
C-1.

### §60.14.4 R4 outcome

R4 returned **FIX-AND-REPROCEED** from [code-reviewer] and [qa-reviewer];
[security-reviewer] returned PROCEED with 2 MEDIUM findings bundled into
the fix round. All findings resolved before R5. Full deduplicated table
in `docs/findings/sprint-38.md` (B-121 wave).

| Severity | # | Reviewer | Finding | Resolution (file:line) |
|---|---|---|---|---|
| CRITICAL | C-1 | code/qa | `KNOWN_VERSION` not bumped; fresh installs would re-run migration on every boot | `background/storage/migration.js` — no-op v1→v2 step + `KNOWN_VERSION = 2`; `background/storage/shapes.js` `defaultShape(PARTITION_META)` seeds v2; CHANGELOG SW module-cache flush note pre-existing |
| HIGH | H-1 | code | `buildFloatingMembers` could yield duplicate entries when two records claim the same live tab | `background/tabs/floating-members.js` — `matchedTabIds: Set<number>` per-call guard |
| HIGH | H-1 | code | Newtab floating rows keyboard-dead; no X close button | `newtab/newtab.js` — `_activateFloatingTab` / `_closeFloatingTab`, ENTER/SPACE handlers, explicit X button DOM; `newtab/newtab.css` close-button styling |
| HIGH | H-1 | qa | `_setRowSelected` ARIA label undefined for floating rows | `sidepanel/sidepanel.js` — fallback to `_cachedFloatingMemberByTabId` |
| MEDIUM | M-1 | code | `patchFloatingMembersSections` insert-loop captured anchor mid-iteration → reverse-order bug | `sidepanel/sidepanel.js` — static anchor capture before insert loop |
| MEDIUM | M-1 | security | `MSG_BULK_DELETE_ITEMS` cascade did not prune floating records per id | `background/tabs/tab-events.js` — per-id cascade prune via `pruneFloatingGroupsByParentItemId` |
| MEDIUM | M-2 | security | `MSG_DELETE_GROUP` deleted parent items before iterating; itemIds lost | `background/tabs/tab-events.js` — capture itemIds **before** delete, iterate cascade prune |

### §60.14.5 R5 outcome

Automated suite: **1,663 / 1,663 PASS** (1,646 baseline post-B-125 +
B-121 deltas). New cases land in `tests/b121-floating-group-render.test.js`
covering all 10 R1 ACs plus the R4 fix-round add-ons (T-121-D dedupe,
T-121-F newtab DOM parity, T-121-O `MSG_DELETE_GROUP` cascade prune).
B-119 + B-126 enumerated test files were updated to the v2 shape /
`floatingMembers` response shape per §60.10.

UAT plan: `docs/UAT_B-121.md` (15 cases) — pending product-owner manual
run in Edge against the unpacked extension. Plan covers all 10 ACs +
the four §60.8 empty states + the parent-itemId-reuse §58.4(i) repro.

### §60.14.6 Open follow-ups

- **LOW findings deferred** per `docs/findings/sprint-38.md` (B-121 wave).
- **`appendFloatingGroup` failure UX (§60.8 C-9(ii) gap).** When
  `appendFloatingGroup` rejects (storage write failure), the SW silently
  falls back to letting the tab become a regular Open-Tabs row. Design-
  acknowledged at R2 (§60.8 C-9(ii)); no user-visible signal. Candidate
  for a future hardening sprint — surface a transient toast or a
  one-shot status badge so the user knows opener-chain tracking failed
  for that tab.
- **Multi-window floating-member ordering.** [qa-reviewer] M-2 (earlier
  review wave) flagged that no automated test pins the sort order of
  `floatingMembers[groupId]` across windows. Today's order matches
  `buildOpenTabs` window-then-tabIndex sort by construction; a regression
  guard for that invariant is deferred to S39.

### §60.14.7 Schema / contract / permission impact

Confirmed by direct re-read of the diff and the migration step:

- **Storage schema:** `tj:floatingGroups` v1 → v2. v1 records carry
  `itemId`; v2 records carry `parentItemId` + `floatingTabId` (synthetic
  ulid). Validators read both shapes (lazy-migration union); new writes
  stamp v2. `tj:meta.schemaVersion` advanced 1 → 2 via the no-op
  migration step. CHANGELOG SW module-cache flush note (toggle OFF/ON)
  retained.
- **Message contracts:** `MSG_LIST_ITEMS` response gained the OPTIONAL
  field `floatingMembers: Record<string, FloatingMember[]>` (undefined
  treated as `{}` by both renderers). No other message types changed.
  No breaking shape change — pre-S38 stubs that omit the field continue
  to work.
- **Manifest permissions:** unchanged. No new `permissions` or
  `host_permissions` entries; verified per C-6.
- **Rollback plan:** §60.13 remains the rollback-of-record. Storage
  records are forward-readable as v1 if a downgrade is ever required
  (post-S38 records carry `parentItemId` + `floatingTabId` which a
  pre-S38 validator would reject — the §60.13(b) bidirectional read
  hotfix is the recommended path; it is a 4-line allow-list union
  identical in spirit to what S38 ships). Message contract is non-
  breaking by construction (`floatingMembers` is OPTIONAL).

---

**End of §60.**
