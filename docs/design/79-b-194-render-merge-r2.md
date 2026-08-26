# §79 — Unified Top-Level Region: Render-Merge (B-196) + Top-Level Floating Anchoring (B-197) R2

**Owner:** [solution-architect]
**Round:** R2 (Architecture) — DESIGN only; no product-code or test changes.
**Sprint:** 48 — B-194 render bundle (Sprint A)
**Date:** 2026-07-01
**Branch:** `feature/sprint-46-claim-identity` off `release/v2` @ v1.42.0 (S47 close) + S48 Tier-A (B-186 in-progress, B-188/B-190 done).
**Parent design:** `docs/design/78-unified-item-model-r0-spike.md` (R0 spike; Option B storage LOCKED).
**R1 source:** `docs/sprint-48-r1.md` (ACs + the 12-file selector audit).
**Covers:** B-196 (render merge), B-197 (top-level floating anchoring, absorbs B-185), and a one-pass fixture-contract check for B-195. B-186 is Fast Track (no R2).

---

## §79.1 — Scope and locked decisions

This chapter designs the two behavior-changing render items of the Sprint 48 bundle and
resolves the five R1 open questions (Q1–Q5). It is grounded on the §78 R0 spike, whose
storage verdict (Option B) is LOCKED. B-186 (loose-tail index-freshness) and B-195
(safety net) are prerequisites; their R2 needs are limited to the fixture-contract check
in §79.9 and the C-13 dependency note in §79.7.

### §79.1.1 — LOCKED (do not relitigate)

- **Storage: Option B** (§78.4.2/§78.4.3). `tj:floatingGroups` stays a distinct
  partition; the unification is at the **model + resolution + render** layers only. Loose
  open tabs stay pure-live (derived from `LiveTabIndex`, never persisted —
  `open-tabs.js:8-11,35-57`). **NO schema bump this sprint** (see §79.7 C-1a/C-1b).
- **Q1 = Variant A, FULLY MERGED (no divider).** The top-level catch-all is ONE
  continuous list. Saved / floating / loose rows are distinguished ONLY by visual state
  (live-dot fill, the unsaved cue, the `+` save CTA on unsaved rows —
  `sidepanel.js:3377-3392`). NO hairline divider between head and tail.
- **Q2 = BELOW the named groups.** The single top-level catch-all renders after all named
  groups, preserving today's top-to-bottom order (groups → merged top-level region), i.e.
  where the Open Tabs section sits today (`sidepanel.js:2310`).

### §79.1.2 — Resolved this chapter (gate R3)

| Q | Decision | Section |
|---|----------|---------|
| **Q3** null-group renderOrder owner | Sentinel `__toplevel__` renderOrder owner; **runtime-derived** (not persisted) this sprint via the existing `resolveRenderOrder` contract. B-191-forward-compatible. | §79.3 |
| **Q4** empty-state under no-divider | Region renders **only when it has ≥1 row**; no standalone empty placeholder; the `sidepanel.js:3505` "No untracked tabs…" copy is retired. Global empty-state guard extended. | §79.6 |
| **Q5** `floatingMembers` payload key for top-level | Sentinel string key **`'__toplevel__'`** (additive; named-group keys unchanged). | §79.4 |
| region header label / identity | Header label **"Top Level"**; region `data-group-id="__toplevel__"`, DOM id `top-level-section`. | §79.2 |

### §79.1.3 — R1 factual correction (source-citation gate)

R1 AC11 and AC18 assert the current `tj:floatingGroups` validator "already tolerates
`groupId` as absent/null (optional)." **This is incorrect.** `assertShape(PARTITION_FLOATING_GROUPS)`
requires `isString(entry.groupId)` at `shapes.js:361` — a `null` or absent `groupId`
throws `ERR_CORRUPT_DATA`. Additionally the record's `groupId` field is load-bearing in
the reconcile tripleKey (`floating-groups-reconcile.js:126-127`), the render bootstrap
bucketing (`floating-groups-render.js:157-160`), and every `moveFloatingTab` bucket filter
(`floating-groups-mutations.js:448,484,511` et al.). **Consequence:** a top-level floating
record MUST persist a non-empty **string** `groupId`. The `__toplevel__` sentinel (§79.3)
is precisely what makes AC18's "no schema bump" true — it satisfies the existing validator
verbatim and keeps every groupId-keyed machinery working. R3 MUST NOT write `groupId: null`
to `tj:floatingGroups`.

---

## §79.2 — Component structure: three pipelines collapse into `buildTopLevelSection`

### §79.2.1 — Today's three top-level pipelines (confirmed in code)

Per §78.1.3, the panel's top level is three structurally-separate things:

1. **Synthetic `__ungrouped__` section** — `renderAll` (`sidepanel.js:2208`) collects
   `byGroup.get(null)` (saved items, `groupId === null`) into a fabricated group
   `{ id: '__ungrouped__' }` and routes it through the shared `buildGroupSection`
   (`sidepanel.js:2285-2307`). It passes an **empty floating array** with the comment
   "ungrouped section never carries floating members" (`sidepanel.js:2302-2305`) — the
   exact line B-197 unblocks.
2. **Separate Open Tabs section** — `renderAll` appends `buildOpenTabsSection(_cachedOpenTabs)`
   (`sidepanel.js:2310`), a distinct `<section id="open-tabs-section">` with its own
   `<ul.open-tabs-list>`, header ("Open Tabs"), count badge, and empty placeholder
   (`sidepanel.js:3455-3513`). Its live-ordered content is `buildOpenTabs`
   (`open-tabs.js:35-57`, `(windowId, tabIndex)` sort at `:51-54`).
3. **Floating members inside named groups** — resolved by `buildFloatingMembers`
   (`floating-members.js:54-162`), keyed by `parent.groupId` (`:140`), skipping ungrouped
   parents (`:94`), interleaved via `Group.renderOrder` (`resolveRenderOrder`).

### §79.2.2 — The collapse (B-196)

Replace the `__ungrouped__` branch (`sidepanel.js:2285-2307`) AND the
`buildOpenTabsSection` append (`sidepanel.js:2310`) with **one** call:

```
buildTopLevelSection(headRows, looseTail)   // placed BELOW all named groups
```

- **`headRows`** — the renderOrder-ordered interleave of saved-ungrouped items
  (`byGroup.get(null)`) + top-level floating members (`_cachedFloatingMembers['__toplevel__']`,
  populated by B-197). For B-196 alone (before B-197 lands) the top-level floating bucket is
  always empty, so the head is exactly today's `__ungrouped__` content — **content parity**
  (AC5/AC7). Ordering authority = the `__toplevel__` renderOrder owner (§79.3), which reduces
  to the sortOrder bootstrap fallback when no floating members are present (i.e. today's
  `__ungrouped__` ordering, byte-for-byte).
- **`looseTail`** — `_cachedOpenTabs` (the `buildOpenTabs` result), rendered as a tail
  sub-list in `(windowId, tabIndex)` order (AC6). This is the *separate ephemeral ordering
  authority* §77.6.1/§78.5.1 mandate keeping — now a tail **within** the one region rather
  than a sibling section. No fold into renderOrder.

The single region is ONE `<section role="region">` wrapped in a `role="listitem"` div (the
same ARIA wrapper `buildOpenTabsSection` uses at `sidepanel.js:3455-3458`, satisfying the
`#item-list` `role="list"` → `role="listitem"` contract). One header ("Top Level"), one
count badge (head rows + tail rows), one row container. Variant A: head rows and tail rows
are siblings in one flow with **no divider element** (§79.6). Save/floating/loose status is
purely visual (dot fill, save CTA, `data-live-only`), per Q1.

### §79.2.3 — Region identity and the `__ungrouped__` retirement

The merged region's `data-group-id` is the new sentinel **`__toplevel__`** (DOM id
`top-level-section`; the `OPEN_TABS_*` id constants at `sidepanel.js:2862-2865` are retired
and replaced by `TOP_LEVEL_*` equivalents). `__ungrouped__` appears at **13 sidepanel
sites + search-index + group-picker + newtab + popup** (enumerated below). R3 MUST classify
each as one of:

- **Render/section identity → migrate to `__toplevel__`**: `sidepanel.js:2295` (synthetic
  group id — removed), `:2298` + `:8631` (collapse state), `:2375` (drag-handle guard),
  `:8542` (header event guard), and the header-menu bail (`b027` guard). The region stays
  collapsible (keyed `__toplevel__`), gets no drag handle, no group-color tint (AC12 — the
  `GROUP_COLORS.includes(group.color)` guard at `sidepanel.js:2293-2299` evaluates false for
  the tint-less region), and does not participate in group-drag reorder (AC13).
- **"No-group / move-to-top-level destination" product concept → KEEP or align**:
  `search-index.js:51,126` (search bucketing key — orthogonal to render; KEEP `__ungrouped__`
  OR rename to `__toplevel__` for consistency — R3's call, no behavior change either way),
  `group-picker-core.js:36,55,65-74` (the "Ungrouped" pinned move destination is keyed by
  `null`; `'__ungrouped__'` is only the source-exclusion sentinel at `:67` — align to
  `__toplevel__` if the region id is renamed), the drag-to-root path (`sidepanel.js:6388-6393`,
  B-031 H-4 — "drop to root" = set `groupId=null`, a demote concept; keep semantics, align
  sentinel string).

This retirement is exactly the surface the R1 selector audit anticipates ("After B-196,
`__ungrouped__` id is retired" — items 7/8/10). See §79.8 for the test-file enumeration.

### §79.2.4 — Newtab parity (AC4) — SCOPE CLARIFICATION (R3 blocker candidate)

**Finding:** `newtab/newtab.js` does **NOT render open/loose tabs today.** There is no
`openTabs` / `buildOpenTabs` / open-tab-row path in newtab — `_renderGrid`
(`newtab.js:781-830`) renders only saved items (grouped + the implicit `UNGROUPED_KEY`
section) + floating members (`_floatingMembers`); the `openTabs` field of `MSG_LIST_ITEMS`
is ignored. A literal reading of AC4 ("the newtab top-level region has the same content …
as the sidepanel") would require **adding an entire loose-tail render pipeline to newtab**
(row builder, keyed patcher, window-badge, drag handling) — none of which exist there — a
net-new feature well outside the B-196 "merge two *existing* pipelines" charter.

**R2 DECISION (surfacing the AC4 ambiguity per the R3 STOP-and-escalate discipline, not
silently deviating):** On **newtab**, `buildTopLevelSection` renders the **HEAD ONLY**
(saved-ungrouped items + top-level floating members from B-197). There is **no loose tail on
newtab**, exactly as today (newtab has never shown open tabs). This loses **zero** newtab
content. The loose tail remains **sidepanel-only**, consistent with the current
sidepanel-only Open Tabs section and the B-133 `data-live-only` "sidepanel-only
discriminator" decision (`b133-open-tabs-dotted.test.js:84-90`). The newtab change is a
**rename/restructure** of the implicit "Ungrouped" section into the `__toplevel__` head
(head becomes floating-capable via B-197). [scrum-master] / product-owner: if a newtab
loose tail is actually desired, it is a separate backlog item (new pipeline), not B-196.

R3 cross-surface diff self-check still applies to the **head** (saved+floating interleave
must match sidepanel).

---

## §79.3 — Q3 decision: the null-group renderOrder owner

### §79.3.1 — Constraints the decision must satisfy

1. The top-level head must place a newly-attached top-level floating member **immediately
   below its parent item** (B-197 AC13), i.e. **interleave** saved + floating — which the
   `resolveRenderOrder` **bootstrap fallback cannot do** (it emits all saved, then all
   floating — `render-order.js:63-73`).
2. It must be **forward-compatible with B-191** (`docs/BACKLOG.md:199`), which will make
   `Group.renderOrder` the SOLE persisted display authority and demote both `sortOrder`
   fields to bootstrap-seeds (Option A: keep field, stop reading). §77.7.1 explicitly warns:
   "B-190/B-191's SSOT design must account for the ungrouped case, or B-185 must land first
   … a sentinel/null-group renderOrder owner, **or** a per-item order."
3. It must **not** require a schema bump this sprint (Option B / AC12/AC18/AC21).

### §79.3.2 — Options and the choice

| Option | Description | Verdict |
|--------|-------------|---------|
| (a) sentinel `__toplevel__` group record | A real `tj:groups` row `{id:'__toplevel__', renderOrder}` | Persisting it pollutes `tj:groups`: the named-group render loop, group pickers, group-drag, `isGroup` count pins, and b029/b023/b031 all treat it as a group. Heavy + many exclusion guards. **Rejected as a persisted row this sprint.** |
| (b) per-item `sortOrder`-only | No group-level renderOrder for the head; order by `Item.sortOrder` + `FloatingGroup.sortOrder` | **NOT B-191-forward-compatible** — B-191 demotes `sortOrder` to a bootstrap-seed and stops reading it for display; a head that *depends* on `sortOrder` for display would break under B-191. Also can't interleave (constraint 1). **Rejected.** |
| (c) sentinel `__toplevel__` renderOrder **owner**, runtime-derived | The head is ordered by passing a synthetic `{ id: '__toplevel__', renderOrder }` to the existing `resolveRenderOrder`, where `renderOrder` is **derived at build time** (not persisted): walk saved-ungrouped items in `sortOrder` asc, splice each item's top-level floating children (matched by `parentItemId`, ordered by `FloatingGroup.sortOrder`) immediately after it. | **CHOSEN.** |

**Q3 = Option (c): a sentinel `__toplevel__` renderOrder owner, runtime-derived this sprint
via the existing `resolveRenderOrder` renderOrder-present branch.**

### §79.3.3 — How it works (no new storage, no schema bump)

- The renderer (sidepanel `buildTopLevelSection`; newtab `_renderGrid`) builds a synthetic
  ref list `['item:<id>', 'floating:<floatingTabId>', 'item:<id>', …]` by iterating
  `byGroup.get(null)` in `sortOrder` order and, after each item, appending the
  `_cachedFloatingMembers['__toplevel__']` entries whose `parentItemId === item.id`
  (ordered by their `sortOrder`, exactly as `buildFloatingMembers` already sorts —
  `floating-members.js:148-158`). It then calls
  `resolveRenderOrder({ id:'__toplevel__', renderOrder: <synthetic> }, headItems, headFloating)`.
  This reuses `resolveRenderOrder` **verbatim** (the non-empty-renderOrder branch,
  `render-order.js:46-61`) and the incremental helper `resolveInsertBeforeRef`
  (`render-order.js:108-118`) unchanged — the top-level region participates in the SAME
  render contract as named groups.
- Nothing is written to `tj:groups` or `tj:floatingGroups` for ordering. The floating
  record persists only its anchor (`parentItemId` + `floatingTabId` + `sortOrder` +
  `groupId:'__toplevel__'`), per Option B.
- Floating members with no matching top-level parent (stale) are filtered silently by
  `resolveRenderOrder`, matching today's stale-ref discipline (`render-order.js:19-21`).

### §79.3.4 — B-191 forward-compatibility proof

B-191 (`docs/BACKLOG.md:199`) makes `Group.renderOrder` the sole persisted display
authority. Option (c) is forward-compatible because:

1. **The render contract is already B-191's contract.** The head is ordered by
   `resolveRenderOrder(owner, items, floating)` where `owner.renderOrder` is authoritative —
   identical to how named groups render under B-191. The only difference is *where the
   renderOrder array comes from*: derived-at-build now vs persisted later.
2. **The seam is a one-line swap.** When B-191 lands, it promotes the `__toplevel__` derived
   order into a persisted `__toplevel__` `renderOrder` (either on a real sentinel group
   record it introduces, or on whatever null-group owner B-191 designs). The renderer's call
   site (`resolveRenderOrder({id:'__toplevel__', renderOrder}, …)`) is unchanged — it simply
   reads a persisted array instead of a derived one. No sentinel change, no contract change.
3. **The sentinel is reserved now** across all three surfaces (record `groupId`, payload key,
   render-owner id), so B-191 inherits a single, already-threaded `__toplevel__` identity
   rather than having to introduce one. This is the "B-185 must FIRST establish an anchoring
   mechanism for the ungrouped section" that §77.7.1 requires — done here as the reserved
   sentinel + the owner contract.
4. **We do NOT foreclose B-191's design space.** Option (c) makes no persisted commitment;
   B-191 remains free to choose a real sentinel group record, a dedicated null-group owner,
   or a per-region renderOrder store. Because this sprint persists no top-level renderOrder,
   there is no migration to unwind. (B-170 narrowing gate: "null-group renderOrder owner"
   is implemented as an *owner contract*, not silently narrowed to "no owner / sortOrder
   only" — the owner exists; its backing store is deferred.)

### §79.3.5 — Cold-start interaction (C-3) — R3 verification point

`bootstrapAndSweepRenderOrder` (`floating-groups-render.js:125-231`) and
`reassociateFloatingGroups` bucket floating records by `record.groupId`
(`floating-groups-render.js:157-160`; reconcile tripleKey `:126-127`). With
`groupId:'__toplevel__'`, records bucket under `'__toplevel__'`; the renderOrder splice
`groups.findIndex(g => g.id === '__toplevel__')` (`floating-groups-mutations.js:192`,
render `:149-192`) returns **-1** (no such group record). **R3 MUST verify** the sweep/splice
paths **skip gracefully on `findIndex === -1`** (no throw, no phantom write) — since Option
(c) intentionally has no persisted `__toplevel__` renderOrder to heal. This is the single
behavioral edge the runtime-derived owner introduces; it is a no-op-on-miss check, not new
logic.

---

## §79.4 — Message contract (C-2): the `floatingMembers` payload key (Q5)

### §79.4.1 — Current contract

`MSG_LIST_ITEMS` → `ListItemsResponse.floatingMembers` is
`Record<string, FloatingMember[]>`, **keyed by the parent bookmark's `groupId`**
(`shared/messages.js:388-394`; producer `floating-members.js:140`, `out[parent.groupId]`).
It is OPTIONAL; renderers treat `undefined` as `{}` (`shared/messages.js:394`;
`sidepanel.js:2220` `_setCachedFloatingMembers` coerces; `newtab.js:162-164,728-730`).

### §79.4.2 — Q5 decision: additive sentinel key `'__toplevel__'`

| Candidate | Verdict |
|-----------|---------|
| Re-key the whole map by `parentItemId` | **Rejected** — breaks every consumer that reads `floatingMembers[group.id]` (`sidepanel.js:2268,2276`; `newtab.js:818,957`) and violates AC19 (named-group keys must be unchanged). A whole-contract rewrite for no gain. |
| Sentinel string key **`'__toplevel__'`** | **CHOSEN** — additive; named-group keys stay `parent.groupId` (ULID); top-level floating (parent's `groupId === null`) emits under `'__toplevel__'`. |

**Exact change (B-197):**

- **Producer** `buildFloatingMembers` (`background/tabs/floating-members.js`):
  - Remove the ungrouped-skip guard at `:94`
    (`if (typeof parent.groupId !== 'string' || parent.groupId.length === 0) continue;`).
  - Compute the output key: `const key = (typeof parent.groupId === 'string' && parent.groupId.length > 0) ? parent.groupId : '__toplevel__';`
    then `out[key].push(descriptor)` (replacing `out[parent.groupId]` at `:140`). The
    per-bucket sort at `:148-158` is unchanged (the sentinel bucket sorts like any other).
  - `collectFloatingTabIds` (`:172-181`) already iterates `Object.values(...)` → the
    sentinel bucket's tabIds are included in the `floatingTabIds` set passed to
    `buildOpenTabs` **with no change**, satisfying AC4 (a top-level floating tab is excluded
    from the loose tail — mutual exclusion preserved).
- **Contract/typedef** `shared/messages.js:388-394`: extend the JSDoc — "Key = parent
  bookmark's `groupId` for grouped parents, OR the sentinel `'__toplevel__'` for top-level
  (ungrouped) parents (B-197). `'__toplevel__'` never collides with a real groupId (ULIDs).
  Still OPTIONAL; still additive; `undefined` ≡ `{}`." This is the **contract-change entry**
  requiring the §79.8 fix-scope enumeration.
- **Consumers:**
  - sidepanel `buildTopLevelSection` reads `_cachedFloatingMembers['__toplevel__']` for the
    head (new consumer; the `__toplevel__` key is the same sentinel as the region id).
  - newtab `_renderGrid`: the `UNGROUPED_KEY` head section reads
    `_floatingMembers['__toplevel__']` (was empty before B-197 because the producer skipped
    ungrouped parents).
  - `patchFloatingMembersSections` (`sidepanel.js:3261-3445`): its `nextTabIds` union
    (`:3277-3282`) and drop/insert loops iterate `Object.entries(next)` — the `'__toplevel__'`
    bucket flows through. The per-group section lookup at `:3296-3299`
    (`.group-section[data-group-id="${groupId}"]`) resolves against the merged region
    (`data-group-id="__toplevel__"`, §79.2.3) — see §79.5 for the head-vs-tail scoping.

### §79.4.3 — Back-compat / shim (C-2)

No shim required. The field was already optional and consumers already tolerate
unknown/absent keys (`shared/messages.js:394`; `collectFloatingTabIds` iterates values;
`patchFloatingMembersSections` iterates entries). Adding one sentinel key is
forward-tolerant for any pre-B-197 reader (which simply never looks up `'__toplevel__'`).
Sender/receiver: producer is the SW (`buildFloatingMembers` inside the `MSG_LIST_ITEMS`
handler); receivers are the sidepanel and newtab renderers. No new message type; no scope
change to the broadcast taxonomy (structural floating changes already route to
`SCOPE.ITEMS` post-B-190).

---

## §79.5 — Render / patch paths

### §79.5.1 — Full render (RP-A sidepanel / RP-D newtab)

`renderAll` (`sidepanel.js:2208`): delete the `__ungrouped__` branch (`:2285-2307`) and the
`buildOpenTabsSection` append (`:2310`); after the named-group loop, append
`buildTopLevelSection(headRows, looseTail)`. `headRows` = `resolveRenderOrder` over the
`__toplevel__` derived owner (§79.3.3). `looseTail` = `_cachedOpenTabs` rendered via the
existing `buildOpenTabRow` (reused verbatim; B-188 §77.6.2 unified descriptor). Newtab
`_renderGrid` (`newtab.js:781`) already routes the `UNGROUPED_KEY` bucket through
`resolveRenderOrder` (`newtab.js:991`); the only change is that its floating input becomes
`_floatingMembers['__toplevel__']` (head-only, no tail — §79.2.4).

### §79.5.2 — Incremental live-state patch (RP-B / RP-C)

`_refetchAndPatchLiveState` (`sidepanel.js:~3690-3740`) currently calls
`patchOpenTabsSection(_cachedOpenTabs)` (`:3736`) then
`patchFloatingMembersSections(_cachedFloatingMembers)` (`:3740`). Under the merge:

- **Loose tail** — `patchOpenTabsSection` (`sidepanel.js:3528-3586`) is retargeted from
  `#open-tabs-section` / `.open-tabs-list` to the merged region's **tail sub-list**
  (`#top-level-section` → the tail `<ul>`). Its keyed, order-faithful diff (index-for-index
  against `nextOpenTabs`, `:3554-3573`) is unchanged in logic — AC18. It stays the SEPARATE
  `(windowId, tabIndex)` authority. **The tail sub-list is a distinct child container from
  the head** so the tail patcher and the head/floating patcher never fight over the same
  nodes (see §79.5.4).
- **Top-level floating (head)** — `patchFloatingMembersSections` (`sidepanel.js:3261`) walks
  `Object.entries(next)`; for the `'__toplevel__'` entry it finds the merged region
  (`data-group-id="__toplevel__"`) and reconciles synthetic rows into the **head
  container**, at their `__toplevel__` renderOrder slot via `_resolveFloatingRowAnchor` +
  `resolveInsertBeforeRef` (`sidepanel.js:3230-3247`, `render-order.js:108-118`). Because
  Option (c) gives the region a (derived) renderOrder, the B-188 renderOrder-slot insert
  applies to the top-level head **identically** to named groups — the B-184-class
  bottom-drop cannot recur. Note: the derived renderOrder is not on `_cachedGroups`, so the
  `groupRecord`/`groupHasRenderOrder` lookup at `sidepanel.js:3310-3313` must be taught the
  `__toplevel__` owner (R3: source the derived renderOrder for the sentinel from the same
  builder the full path uses).
- **Structural changes** (a new/removed floating member, or a saved-ungrouped
  add/remove/reorder) route to `SCOPE.ITEMS` (post-B-190 audit — `docs/BACKLOG.md:198`),
  forcing the full renderOrder-respecting path (RP-A/RP-D). Live-only patches
  (title/active/audible) stay on the incremental path. No new scope-tag needed.

### §79.5.3 — Interaction with §77 Tier-A and B-186

- **§77 `resolveInsertBeforeRef`** (`render-order.js:108-118`) is reused unchanged for the
  head; the `__toplevel__` owner's derived renderOrder is a valid input.
- **B-186 (loose-tail index fix)** is the ordering prerequisite for the tail. The tail reads
  `(windowId, tabIndex)` from `LiveTabIndex` (`open-tabs.js:51-54`); `removeTabEntry`
  (`live-tab-index.js:74`) does not renumber survivors on tab close, so the tail scrambles
  after any close until B-186 lands (§79.7 C-13). B-186 must merge **before** B-196 so the
  merged tail is correct at UAT.

### §79.5.4 — DOM readiness + reject-guards

- **AC19 readiness fallback** (`sidepanel.js:3723-3724`): the
  `!document.getElementById(OPEN_TABS_SECTION_ID)` test becomes
  `!document.getElementById('top-level-section')`. Under "render-when-nonempty" (§79.6) the
  region may be absent; the fallback then full-renders to mount it when a first row appears —
  the existing escape-hatch behavior, preserved.
- **AC20 group-drag reject-guard** (`_computeGroupPromoteTarget`, `sidepanel.js:5928-5933`
  and the `b025`/`b122` `.closest('.open-tabs-section')` guard): retarget to reject the
  merged region's container class/id (`.top-level-section` / the tail sub-list). The guard's
  purpose (group-drag must not target the top-level region) is preserved.
- **Head/tail container split:** `buildTopLevelSection` MUST render the head rows and the
  loose-tail rows into **two distinct child `<ul>`/containers** inside the one section so
  that (a) `patchOpenTabsSection` scopes cleanly to the tail, (b)
  `patchFloatingMembersSections` scopes cleanly to the head, and (c) the saved-item live-state
  patch loop (`sidepanel.js:3744`, `[data-item-id]:not([data-live-only])`) touches only head
  saved rows. Variant A (no divider) is a **visual** merge (one continuous list, no
  separator element) achieved via CSS on two adjacent containers — the containers stay
  distinct in the DOM for patch isolation. This is the key structural nuance: **visually one
  list, structurally head-container + tail-container**, so the three patch paths never
  collide.

---

## §79.6 — Empty-state enumeration (Q4 / C-9)

Variant A (no divider) + placement below groups. The region renders **only when it has ≥1
row** (head or tail); it has **no standalone empty placeholder**. The current Open Tabs
inline empty copy ("No untracked tabs — all open tabs are saved or grouped",
`sidepanel.js:3505`) is **retired** — under a merged catch-all there is no separate "Open
Tabs" concept whose emptiness needs narrating.

| # | State | saved-ungrouped | top-level floating | loose tabs | UI |
|---|-------|:---:|:---:|:---:|----|
| E1 | whole region empty | 0 | 0 | 0 | Region **not rendered** (no header, no placeholder). If ALSO no named groups → global empty-state (`emptyStateEl`). If named groups exist → they render; no top-level region appears. |
| E2 | head-present / tail-empty | ≥1 (or ≥1 floating) | ≥0 | 0 | Region renders **head only** (saved+floating interleave). No tail container populated, no divider, **no "No untracked tabs" placeholder** (AC16 → suppress). Header count = head rows. |
| E3 | tail-only | 0 | 0 | ≥1 | Region renders **tail only** (loose tabs, `(windowId,tabIndex)`). Header "Top Level", count = tail rows. No head, no divider. |
| E4 | zero-groups | any | any | any | Region is the whole panel; renders normally (head and/or tail per above). No structural gap. |

**Global empty-state guard (AC14):** `renderAll`'s all-empty guard
(`sidepanel.js:2226-2227`) already tests `!items.length && !groups.length &&
_cachedOpenTabs.length === 0 && _cachedFloatingMemberByTabId.size === 0`. This already covers
top-level floating (via `_cachedFloatingMemberByTabId`) and loose tabs (via
`_cachedOpenTabs`), so it needs **no change** for E1 — it is already the correct "nothing
anywhere" predicate. R3 verifies the guard still fires when the only content would have been
a `__toplevel__` floating member (it does — that member is in `_cachedFloatingMemberByTabId`).

**Rationale for dropping the placeholder:** today the always-mounted Open Tabs section shows
"No untracked tabs…" to explain an empty *dedicated* section. With the section gone, an empty
merged region is just absence — a lone empty header would be noise in a no-divider merged
list. Newtab already renders its ungrouped section only when non-empty (`newtab.js:821`
`continue` on empty), so "render-when-nonempty" also **aligns the two surfaces** (today they
differ: sidepanel Open Tabs is always-mounted, newtab ungrouped is conditional).

---

## §79.7 — R2 Correctness Checklist

| # | Check | Verdict |
|---|-------|---------|
| **C-1a** | Schema-version governance | **NO bump.** The merge is a render-layer change (B-196) + a runtime-keying/anchor change (B-197). No `tj:items` / `tj:groups` / `tj:floatingGroups` / `PARTITION_META` shape change. Top-level floating records persist `groupId:'__toplevel__'` (a string — validates under the existing `shapes.js:361` REQUIRED-string rule) + the already-optional `parentItemId`/`floatingTabId`/`sortOrder`. `KNOWN_VERSION` stays **9**. The one program-level bump (v9→v10 anchor-only slim + validator tighten) is deferred to B-199/B-183 (§78.4.3), NOT this sprint. |
| **C-1b** | Data-migration strategy | **No-op / none.** No records change shape. Existing floating records (grouped) are untouched; new top-level records are written in the already-valid v9 shape with the `__toplevel__` sentinel groupId. No `MIGRATION_STEPS` entry. |
| **C-2** | Message contracts typed | **PASS.** `floatingMembers` gains the additive `'__toplevel__'` sentinel key (§79.4); typedef updated at `shared/messages.js:388-394`; producer/consumers specified; back-compat via existing optional-field tolerance (no shim). No new message type. `openTabs` shape unchanged (§78.6). |
| **C-3** | Service-worker cold-start safe | **PASS with one R3 verification.** `buildTopLevelSection` reads only in-memory caches hydrated per-request; `buildOpenTabs` already returns `[]` when claims aren't ready (`open-tabs.js:36`). The one edge: the cold-start renderOrder sweep/splice buckets `__toplevel__` records but finds no `__toplevel__` group record — R3 MUST confirm `findIndex === -1` is skipped gracefully (§79.3.5). Runtime-derived order needs no persisted heal, so this is a no-op-on-miss check. |
| **C-4** | ID stability | **PASS.** `itemId` (ULID) and `floatingTabId` (ULID) remain the durable identities; a top-level floating record keeps its `floatingTabId` across DETACH/ATTACH exactly as grouped records do (`floating-groups-mutations.js:465-469`). Anchor = `parentItemId` (stable across URL drift/rename/cross-window). `groupId:'__toplevel__'` is a fixed sentinel, not an identity. No identity weakened. |
| **C-9** | Empty-state design | **PASS.** Four states enumerated (§79.6: E1 whole-empty, E2 head-only, E3 tail-only, E4 zero-groups) with exact UI; placeholder retirement justified; global guard confirmed. R4 [qa-reviewer] checks the built region against E1–E4. |
| **C-13** | Chrome event-feedback completeness | **PASS via B-186 prerequisite.** The loose tail's `(windowId, tabIndex)` order depends on `LiveTabIndex.index` freshness. `removeTabEntry` (`live-tab-index.js:74`) does NOT renumber survivors on close and Chrome emits no `onMoved` for the implicit shift (the `onRemoved` cascade at `tab-events.js:343` also skips it) — the confirmed B-186 root cause. Merged inline with saved rows, the scramble is more visible, so **B-186 is a correctness prerequisite** (must land before B-196). Tab add/activate/move already feed `LiveTabIndex` via existing listeners; the merge adds no new write API, so no new listener is required beyond B-186's close-path renumber. |
| **C-14** | Gen-counter predicate for the merged-region cache | **PASS — no new counter.** The merged region reuses the existing `_cachedItemsGen` / `_cachedOpenTabs` / `_cachedFloatingMembers` caches (`sidepanel.js:2210-2220`). `_setCachedFloatingMembers` gains the `'__toplevel__'` bucket transparently (it caches the whole map). No new generation counter is introduced; therefore the B-134 H-1 over-trip class (gen bumped on ambient liveState patches) is not reachable here — the merge does not add a gen-gated race-guard. R3 must NOT add one; live-only patches stay on the incremental path (§79.5.2) without a gen bump. |

---

## §79.8 — Fix-scope test-assertion enumeration (MANDATORY GATE)

B-196 changes DOM/selectors (retires `#open-tabs-section` / `.open-tabs-list` /
`open-tabs-header` / the `__ungrouped__` render identity) and B-197 changes the
`floatingMembers` message contract + the two opener-chain resolver contracts. Per CLAUDE.md,
R3 cannot start until every pre-change assertion is enumerated. Verified against the R1
12-file selector audit (line numbers confirmed/corrected below) and extended for B-197.

### §79.8.1 — B-196 (DOM / selector / `__ungrouped__` retirement) — 12 files

1. `tests/b102-cross-window-demote.test.js:256` — asserts `section.querySelector('.open-tabs-list')`; `:257` `'#open-tabs-count'`; `:315` builds `id='open-tabs-section'`, `:317` `className='open-tabs-list'`, `:319` `id='open-tabs-count'`; update to the merged region's **tail** list class + count id (`#top-level-section` tail `<ul>` / `#top-level-count`).
2. `tests/b122-drag-to-root.test.js:280,284,287,291,295,299,303,304,307,311` — source-text pins that `_computeGroupPromoteTarget` calls `.closest?.('.open-tabs-section')` and returns null; update the regexes to the merged region's reject class/id (`.top-level-section`).
3. `tests/b025-multi-item-drag.test.js:481,506,516,517,543,564,567,581,701,704,706,721,725` — `.open-tabs-section` reject-guard behavior + `ShimEl('open-tabs-section')` fixtures; update to `.top-level-section`.
4. `tests/b133-open-tabs-dotted.test.js:46,51-52,84-90` — asserts `.item-row[data-live-only="true"]` rule exists in `sidepanel.css` and is absent from `newtab.css`/`popup.css`; **LOCKED: retain `data-live-only` on loose-tail rows** → assertions stay valid, **no change**, but R3 confirms the attribute survives the merge at the cross-surface diff.
5. `tests/b187-render-order-parity.test.js:349` (comment ref), `:381` asserts `src.indexOf('function buildOpenTabsSection') >= 0`; update `:381` to `src.indexOf('function buildTopLevelSection') >= 0` (and the `:349` comment).
6. `tests/b036-newtab.test.js:767,780,781,782,783` — asserts ungrouped items render under an implicit "Ungrouped" section (`sections.length === 1`, header text `/Ungrouped/`); update the section selector + header text to the newtab top-level region (head-only, label "Top Level" per §79.2.4).
7. `tests/b027-group-header-menu.test.js:145,415,417,419,430,432-436` — `:145` `groupId === '__ungrouped__'` → `'early-return:ungrouped'`; `:415-419` right-click `__ungrouped__` header bails; `:430-436` `open-tabs-header` class excluded from the group menu; update the bail sentinel to `__toplevel__` and retire/rename the `open-tabs-header` class guard.
8. `tests/b023-group-jump-popup.test.js:644` — passes `sourceGroupId: '__ungrouped__'` as the zero-row exclusion fixture; update to `'__toplevel__'` (or confirm N/A for the merged region).
9. `tests/b029-group-picker.test.js:534,632-633` — `:534` asserts `ids.includes(null)` when `sourceGroupId !== '__ungrouped__'`; `:632-633` `buildGroupPickerRows(ctx, '__ungrouped__')` as the source-exclusion key; align the exclusion sentinel to `__toplevel__` if the region id is renamed (the `null` Ungrouped *destination* row is unchanged — §79.2.3).
10. `tests/b031-group-drag.test.js:192,195,197,202` — T-7 asserts `bulkReorderGroups` rejects NEST into the `__ungrouped__` pseudo-id (`ERR_NOT_FOUND`); update the pseudo-id to `__toplevel__` (the reject must cover the new sentinel).
11. `tests/b014-multi-window.test.js:441,450,459,496,506` — queries `[data-tab-id]` and `[data-live-only="true"][data-tab-id]` for open-tab rows (row attributes, not container id); **LOCKED: retain both attributes on loose-tail rows** → **no change expected**; R3 verifies at cross-surface diff.
12. `tests/b024-multi-select.test.js:167-168,174-175,312,320,1437` — `[data-tab-id]`/`[data-live-only]` in selection-manager query logic; row attributes retained → **no change expected**; verify at R3.

### §79.8.2 — B-197 (`floatingMembers` contract + resolver contracts) — 3 files

13. `tests/b184-floating-opener-inherit.test.js:75-77` — T4 asserts `resolveFloatingOpener` returns **`null`** for a record whose parent is ungrouped ("Part 2 territory"). **INVERT** per AC6: assert it returns `{ groupId: null, itemId: parentItemId }`. Also remove/replace the `opener-chain.js:93` "floating-under-ungrouped support is B-184 Part 2" comment the test's intent tracks.
14. `tests/b013-opener-chain.test.js:170-176` — AC6 asserts `walkOpenerChain` returns **`null`** when the claimed ancestor has `groupId === null` (guard at `opener-chain.js:68`). **INVERT** per AC8: assert it returns `{ groupId: null, itemId: item.id }`.
15. `tests/b121-floating-group-render.test.js:82-137` — T-121-A asserts `floatingMembers` is keyed by `parent.groupId` (`:137` "keyed by parent groupId, not parent itemId"). **PRESERVE** the named-group assertion (AC19) and **ADD** a case asserting an ungrouped-parent floating member emits under the `'__toplevel__'` key. T-121-N (`:466,676`, parent-deleted skip) is unaffected — verify it still passes.

### §79.8.3 — In-sprint updates (authored this sprint, not pre-existing)

- `tests/b195-unified-toplevel-net.test.js` — the T3 / T5 / T6 assertions marked
  `// B-197-EXTEND` (R1 AC5/AC7/AC8; B-195 AC12/AC20) invert from the today-baseline to the
  B-197 behavior in the B-197 PR: T5 → `resolveFloatingOpener` returns `{groupId:null,…}`;
  T6 → `walkOpenerChain` returns `{groupId:null,…}`; T3 → `buildFloatingMembers` returns a
  map with the `'__toplevel__'` key. Listed for completeness; owned by B-195/B-197, not the
  pre-existing-contract gate.

### §79.8.4 — Checked, no update needed (absence made explicit)

`tests/b134-tab-drag-reorder.test.js`, `tests/b124-floating-visual.test.js`
(`:320` uses a `groupId:null` fixture item for CSS/visual assertions only),
`tests/b190-broadcast-scope-audit.test.js`, `tests/floating-multi.test.js`,
`tests/enriched-list-items.test.js` — reference `buildFloatingMembers` / `openTabs` /
`floatingMembers` data but do **not** assert the ungrouped-skip, the `parent.groupId`-keying,
or the retired DOM selectors. No pre-change contract assertion → no update. R3 re-confirms
during the build.

**Fix-scope test-file count: 15 pre-existing files** (12 B-196 selector + 3 B-197 contract)
**+ 1 in-sprint** (`b195`). R3 checklist complete.

---

## §79.9 — B-195 fixture-contract check (validators)

R1 B-195 seeds six fixtures (F1–F6, `docs/sprint-48-r1.md:64-73,99-106`). Checked against
the current validators (`background/storage/shapes.js`):

| Fixture | Shape | Validator verdict |
|---------|-------|-------------------|
| F1 saved-ungrouped dormant | `tj:items` row, `groupId:null` | **OK** — `isItem` accepts `groupId:null` (`shapes.js:204` `isNullableString`; requires `id/title/url/sortOrder/createdAt/updatedAt`). Seed MUST include `sortOrder`+timestamps (REQUIRED). |
| F2 saved-ungrouped claimed | `tj:items` row `groupId:null` + `claimsMirror` entry | **OK** — item as F1; claim is in-memory (`claimsMirror`, not a validated partition) or `tj:itemClaims` (`isItemClaims`, `shapes.js:278-293`). |
| F3 floating-under-ungrouped | `tj:floatingGroups` record, `parentItemId`→F1/F2 | **MISMATCH — flag.** The current validator REQUIRES `isString(groupId)` (`shapes.js:361`); a record with `groupId:null` or absent **throws `ERR_CORRUPT_DATA`**. **B-195 must seed F3 with `groupId:'__toplevel__'`** (the §79.3 sentinel) + `windowId`/`tabIndex`/`url`/`savedAt` (all REQUIRED, `:360-363`) + `parentItemId` (validated-if-present, `:369`). Do NOT seed `groupId:null`. This is the same correction as §79.1.3; B-195's T3/T5/T6 `B-197-EXTEND` markers assume this sentinel. |
| F4 loose open tab | `LiveTabIndex` only, not claimed/floating | **OK** — no persisted shape; seeded via `updateTabEntry`/`__resetLiveTabIndex` (`live-tab-index.js`). |
| F5 named-group claimed | `tj:items` `groupId:'g1'` + claim | **OK** — `isItem` + a `tj:groups` row for `g1` (`isGroup`, `shapes.js:216-242`, needs `name/color/parentId/sortOrder/collapsed/createdAt/updatedAt`). |
| F6 named-group dormant | `tj:items` `groupId:'g1'`, no claim | **OK** — as F5 minus the claim. |

**Net:** F1/F2/F4/F5/F6 are consistent with the current validators. **F3 is the one
contract point:** the floating record MUST carry a non-empty string `groupId` — B-195 seeds
`'__toplevel__'`. B-195 AC5's baseline (today `buildFloatingMembers` skips it via
`floating-members.js:94`) still holds against current code because the skip is on the
**parent's** `groupId === null`, independent of what the record's own `groupId` is — so the
`'__toplevel__'`-seeded record is correctly skipped **today** (parent is ungrouped) and
correctly emitted under the `'__toplevel__'` key **after B-197**. No validator change needed
for B-195 to pass green against current code.

---

## §79.10 — Risks + R3 handoff

### §79.10.1 — Risks

- **R-1 (newtab AC4 ambiguity).** §79.2.4 resolves AC4 as **head-only on newtab** (no loose
  tail — newtab never rendered open tabs). This is a deliberate, surfaced R2 decision, not a
  silent deviation. If product wants a newtab loose tail, it is a **separate item**. [scrum-master]
  should confirm before R3 to avoid an R4 "cross-surface divergence" finding.
- **R-2 (`__ungrouped__` retirement surface).** 13 sidepanel sites + search-index +
  group-picker + newtab + popup reference `__ungrouped__` (§79.2.3). Mis-classifying a
  "move-to-top-level destination" site as a "render-identity" site (or vice versa) is the
  main B-196 correctness risk. R3 MUST classify each per §79.2.3 and the §79.8 test list.
- **R-3 (head/tail patch isolation).** Variant A is *visually* one list but MUST be
  *structurally* head-container + tail-container (§79.5.4) so the three patch paths
  (`patchOpenTabsSection` tail, `patchFloatingMembersSections` head, saved-item live loop)
  do not collide. Collapsing to a single `<ul>` would reintroduce cross-path node fighting.
- **R-4 (runtime-derived `__toplevel__` renderOrder on the incremental path).** The
  incremental floating patch reads `groupRecord.renderOrder` from `_cachedGroups`
  (`sidepanel.js:3310-3313`); the `__toplevel__` owner is NOT in `_cachedGroups`. R3 must
  source the derived order for the sentinel from the same builder the full path uses, else
  new top-level floating rows fall back to the static anchor (a B-184-class bottom-drop
  scoped to the top-level head). Guarded by B-195's parity assertions.
- **R-5 (cold-start splice on a missing group, C-3).** `findIndex(g => g.id==='__toplevel__')`
  returns -1; R3 verifies graceful skip (§79.3.5).

### §79.10.2 — Per-item build order (R3 handoff)

Per §78.8 sequence, in-sprint order is **B-186 → B-195 → B-196 → B-197**:

1. **B-186** (Fast Track, prerequisite) — renumber same-window `LiveTabIndex.index`
   survivors on single-tab close (`live-tab-index.js:74` / `tab-events.js:343`). Must land
   first so the merged loose tail (§79.5.3) orders correctly at UAT (C-13).
2. **B-195** (test-only, safety net) — seed F1–F6 (F3 with `groupId:'__toplevel__'` per
   §79.9), assert head+tail ordering + floating-resolution baseline against **current** code;
   green before B-196.
3. **B-196** (render merge) — `buildTopLevelSection` (head-container + tail-container, one
   section, Variant A, below groups); retire `#open-tabs-section` + `__ungrouped__` render
   identity → `__toplevel__` (§79.2.3); retarget `patchOpenTabsSection` to the tail, the
   readiness fallback + reject-guards to the merged region; newtab head-only restructure;
   empty-states E1–E4; update the 12 selector test files (§79.8.1). No B-197 behavior yet
   (top-level floating bucket stays empty).
4. **B-197** (top-level floating, absorbs B-185) — remove the `floating-members.js:94` skip;
   key ungrouped-parent floating under `'__toplevel__'` (§79.4); invert
   `resolveFloatingOpener`/`walkOpenerChain` guards (`opener-chain.js:68,107-111`) to return
   `{groupId:null,itemId}`; `moveFloatingTab` ATTACH-to-top-level via a `targetParentItemId`
   payload field (there is no `targetGroupId` to resolve a parent from —
   `floating-groups-mutations.js:409-416`); persist top-level records with
   `groupId:'__toplevel__'`; runtime-derived `__toplevel__` renderOrder owner places floating
   members immediately below their parent (§79.3.3, AC13); update the 3 contract test files
   (§79.8.2) + the in-sprint b195 EXTEND markers.

### §79.10.3 — Sign-off

- **Storage:** Option B, **NO schema bump** (`KNOWN_VERSION` stays 9); `groupId:'__toplevel__'`
  keeps the existing validator + all groupId-keyed machinery working.
- **Contracts resolved:** Q3 (runtime-derived `__toplevel__` renderOrder owner,
  B-191-forward-compatible), Q4 (render-when-nonempty, no placeholder, retire the "No
  untracked tabs" copy), Q5 (additive `'__toplevel__'` payload key). Q1/Q2 restated LOCKED.
- **Gate:** §79.8 fix-scope enumeration complete (15 pre-existing + 1 in-sprint). R3 is
  unblocked pending the R-1 newtab-scope confirmation.

**End of §79.**
