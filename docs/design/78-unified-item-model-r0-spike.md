# §78 — Unified Item Model R0 Spike (bookmark × floating × open → one entity)

**Owner:** [solution-architect]
**Round:** R0 (Spike-First Tier 3 — XL; R0 mandated before R1 per the XL Spike-First pipeline)
**Sprint:** post-S48 (epic-scoping spike for B-194)
**Date:** 2026-06-30
**Branch:** `feature/sprint-46-claim-identity` off `release/v2` @ v1.42.0 (S47 close) + S48 Tier-A render-order work (B-187…B-190 done).
**Status:** R0 spike output — read-only static analysis, no product-code or test changes. Data for [scrum-master] → product-owner routing.

---

## §78.1 — Problem statement

Tab Junkie models **one conceptual entity — "a thing in a list that may or may not
have a live tab" — as THREE disjoint record types** with three separate identity
schemes and two separate top-level render pipelines. This is the direct sibling of
the B-173 identity epic (`docs/design/74-b-173-r0-spike.md`), which already collapsed
bookmark↔tab identity from six multi-homed stores to one durable authority
(`tj:itemClaims`) + derived caches. The floating-record model is the **last
identity-sized fragmentation** the 2026-06-30 state-surface audit flagged
(`docs/BACKLOG.md:194`, B-183; `:203`, B-185; `:205`, B-194).

### §78.1.1 — The three record types (confirmed in code)

- **Saved item (bookmark).** Durable row in `tj:items`. `isItem` requires
  `id`/`title`/`url` strings, `groupId` **nullable** string, `sortOrder`,
  `createdAt`, `updatedAt` (`shapes.js:201-214`; `groupId` nullable at `:204`).
  Stable identity = `itemId` (ULID). Never carries a `tabId` — its live state is
  computed at read time via the claim (`buildLiveStates`, `tab-claims.js:970-1005`).
- **Floating tab.** Durable row in `tj:floatingGroups` (partition const
  `shapes.js:37`). Read-validator (`shapes.js:349-396`) requires
  `groupId`/`windowId`/`tabIndex`/`url`/`savedAt`, and TOLERATES optional
  `floatingTabId` (`:366`), `parentItemId` (`:369`), legacy `itemId` (`:372`),
  `sortOrder` (`:379`), `liveTabId` (`:391`). It is a live tab associated *under*
  a parent saved item, persisted so it survives restart and re-associates on cold
  start (B-018, `docs/design/24-b-018-floating-tab-group-persistence-acr.md`;
  `reassociateFloatingGroups`, `floating-groups-reconcile.js:65-195`). Storage
  identity = `floatingTabId` (ULID, survives cross-group move —
  `floating-groups-mutations.js:465-469`).
- **Open tab.** Pure-live. Only in `LiveTabIndex` (in-memory `Map`,
  `live-tab-index.js:16`), **never persisted** (`open-tabs.js:8-11`). Built by
  `buildOpenTabs` as "every live tab NOT claimed by a saved item AND NOT a
  floating member" (`open-tabs.js:35-57`; exclusion predicate `:43-44`).

All three are the SAME entity — a row that may have a live tab, may have a durable
record, may be anchored under a parent/group — observed in different corners of one
state space.

### §78.1.2 — The 3-homed floating join (identity fragmentation)

The floating-record → live-tab join is resolved by `resolveRecordToTab`
(`tab-item-resolver.js:79-129`) through **three co-equal tiers behind a tolerant
validator**:

- **Tier (a) — direct `liveTabId`** (`:89-94`), the B-137 v4 primary key.
- **Tier (b) — `(windowId, tabIndex)` position** (`:97-112`), optionally
  URL-corroborated (B-132 stale-position fix, `:100-107`).
- **Tier (c) — normalized-URL fallback** (`:115-122`).

The record persists all three homing keys (`liveTabId` + `windowId`/`tabIndex` +
`url`), and the tolerant validator (`shapes.js:349-396`) accepts records missing any
of them. This is exactly the "same fact stored/re-derived in N places that must be
kept in sync" pattern B-173 catalogued (`docs/design/74-b-173-r0-spike.md:170-213`).
The audit names it explicitly: "the `tj:floatingGroups` record↔live-tab join is
still 3-homed (`liveTabId` / `(windowId,tabIndex)` / URL via
`background/tabs/tab-item-resolver.js:79-129`) behind a tolerant validator
(`shapes.js:349-396`), the unfinished sibling of the B-173 saved-item identity epic"
(`docs/BACKLOG.md:194`). B-183 (`docs/BACKLOG.md:194`) is the already-filed
delete-the-tiers-and-tighten-the-validator facet.

### §78.1.3 — The two top-level render pipelines

The panel's top level is rendered by **two structurally separate paths**:

- **Synthetic `__ungrouped__` section** — `renderAll` collects `byGroup.get(null)`
  (saved bookmarks with `groupId === null`) into a fabricated group with
  `id: '__ungrouped__'` and passes it through the shared `buildGroupSection`
  (`sidepanel.js:2285-2307`).
- **Separate Open Tabs section** — `renderAll` appends `buildOpenTabsSection`
  (`sidepanel.js:2310`), which builds its own `<section role="region">` with its
  own `<ul>` and header, structurally distinct from the group sections
  (`sidepanel.js:3455-3513`). Its incremental patcher is `patchOpenTabsSection`
  (`sidepanel.js:3528`), keyed by `(windowId, tabIndex)` order (§77.3.4,
  `docs/design/77-display-order-consolidation-r0-spike.md:144-155`).

So two live-unsaved things — a floating tab (rendered inside a group via
`resolveRenderOrder`) and a loose open tab (rendered in its own section) — live in
different DOM subtrees with different order authorities, and a saved ungrouped
bookmark lives in a third (`__ungrouped__`). Three top-level homes for one region.

### §78.1.4 — Why B-185 is structurally blocked today

"Float a tab under a top-level/ungrouped bookmark" (B-185, `docs/BACKLOG.md:203`) is
blocked in **four independent places**, all a consequence of `groupId` (not
`parentItemId`) being treated as the anchor:

1. **The ungrouped section is hard-coded to carry ZERO floating members.**
   `renderAll` passes an empty array to `buildGroupSection` for `__ungrouped__`
   with the comment "ungrouped section never carries floating members — opener-chain
   inheritance always resolves to a parent saved item with a non-null groupId"
   (`sidepanel.js:2302-2305`).
2. **`buildFloatingMembers` skips ungrouped parents and keys output by
   `parent.groupId`.** `if (typeof parent.groupId !== 'string' ||
   parent.groupId.length === 0) continue;` (`floating-members.js:94`); output map
   keyed by `parent.groupId` (`:140`).
3. **`moveFloatingTab` ATTACH resolves the anchor from the first saved item in the
   TARGET GROUP and rejects an empty group** — a top-level parent has no group to
   look up: `if (candidates.length === 0) return false;` (`floating-groups-mutations.js:413`).
4. **`resolveFloatingOpener` requires a non-empty `groupId`** to return an
   inheritance target (`opener-chain.js:107-111`), so an opener chain rooted at a
   top-level bookmark yields `null`.

The audit ties B-183 + B-185 together as "the two facets of ONE identity-sized
consolidation" (`docs/BACKLOG.md:194`, `:203`), and B-194's founding constraint #5
makes B-185 "fall out for free" once the anchor is `parentItemId` and `groupId`
becomes derived/optional.

---

## §78.2 — The unified model

### §78.2.1 — The three state axes

Per the LOCKED founding constraints, an entity's "type" is **derived** from three
orthogonal boolean axes, not stored as an enum:

- **saved?** — a durable record survives tab close (there is a row in `tj:items`
  with a stable `itemId`).
- **live?** — there is an open browser tab now (a `tabId` resolves in
  `LiveTabIndex`, `live-tab-index.js:16`).
- **anchored?** — the entity has a parent/order relationship: a `parentItemId`
  anchor (floating-under-a-bookmark) OR a non-null `groupId`. "Loose" = neither
  (belongs only to the single top-level catch-all).

### §78.2.2 — State-space table (all 8 cells, mapped to today's records)

| saved? | live? | anchored? | Today's name | Persisted? | Notes |
|:---:|:---:|:---:|---|---|---|
| Y | Y | Y | **Claimed bookmark in a group** | `tj:items` row + `tj:itemClaims` join | live via claim (`tab-claims.js:970-1005`); anchor = `groupId` |
| Y | Y | N | **Claimed ungrouped bookmark** (top-level) | `tj:items` row + claim | `groupId === null`; lives in top-level catch-all, shown "live" |
| Y | N | Y | **Dormant bookmark in a group** | `tj:items` row | no live tab → `buildLiveStates` returns `{live:false}` (`tab-claims.js:1002`) |
| Y | N | N | **Dormant ungrouped bookmark** | `tj:items` row | today's `__ungrouped__` dormant row |
| N | Y | Y | **Floating tab** | anchor only (`tj:floatingGroups`) | TODAY over-persists identity fields; constraint #2 → persist the ANCHOR, not the tab |
| N | Y | N | **Loose open tab** | **nothing** | pure-live, derived from `LiveTabIndex` (`open-tabs.js`); constraint #2 → NEVER a per-tab record |
| N | N | Y | (an anchor with no tab, no record) | **cannot persist** | constraint #2: we persist saved items + anchors, never a stray tab; this cell is transient-only and self-evicts |
| N | N | N | (nothing) | — | empty |

**Derived-state definitions (the predicates that replace the stored "type"):**

- `isBookmark` ≡ `saved` (has `itemId`).
- `isFloating` ≡ `!saved && live && anchored` (a live tab with a `parentItemId`
  anchor but no `itemId`) — today's `tj:floatingGroups` member.
- `isLoose` ≡ `!saved && live && !anchored` — today's open tab.
- `isClaimed` (a bookmark) ≡ `saved && live`.
- `isDormant` (a bookmark) ≡ `saved && !live`.

Claimed vs dormant bookmarks already share a group and are distinguished purely by
**visual state** today (the live/active/audible indicators driven by `liveStates`,
`tab-claims.js:970-1005`; row classes in `buildItemRow`, `sidepanel.js:2557+`). The
unification extends that same "one region, distinguished by visual state" treatment
to floating and loose rows at the top level (constraint #4).

### §78.2.3 — The unified record shape (field-by-field: durable vs live-derived)

One logical record; each field is either **DURABLE** (persisted, survives tab close)
or **LIVE-DERIVED** (recomputed from `LiveTabIndex` + the claim, never persisted):

| Field | Durable / Live-derived | Persists for saved? | Persists for floating? | Persists for loose? | Source |
|---|---|:---:|:---:|:---:|---|
| `itemId` | DURABLE (identity) | yes | — | — | `tj:items` (`shapes.js:203`) |
| `title` | DURABLE (saved) / LIVE (unsaved) | yes | no (live title) | no (live title) | item vs `LiveTabIndex.title` |
| `url` | DURABLE (saved) / LIVE (unsaved) | yes | no (live url) | no (live url) | item vs `LiveTabIndex.url` |
| `groupId` | DURABLE, **nullable/derived** | yes | derived from anchor | null | `shapes.js:204`; constraint #5 makes it derived |
| `parentItemId` (anchor) | DURABLE | — | **yes (the only thing floating persists)** | — | `floating-groups-schema.js:26-35` |
| `floatingTabId` (anchor storage id) | DURABLE | — | yes (ULID) | — | `floating-groups-mutations.js:95` |
| render position (`renderOrder` ref / `sortOrder`) | DURABLE for anchored/saved | yes | yes | **no** (loose = live-ordered) | `shared/render-order.js`; `open-tabs.js:51-54` |
| `favIconUrl` | DURABLE (saved) / LIVE (unsaved) | yes | no | no | `shapes.js:210-212` |
| `tabId` / `liveTabId` | **LIVE-DERIVED** | no | no (recovery hint only) | no | `LiveTabIndex`; the claim join |
| `windowId` / `tabIndex` | **LIVE-DERIVED** | no | no (recovery hint only) | no | `LiveTabIndex` (`live-tab-index.js:8`) |
| `active` / `audible` | **LIVE-DERIVED** | no | no | no | `LiveTabIndex` |

**Key inversion (constraint #2 + #6):** the durable surface of a floating entity
shrinks to just the **anchor** (`parentItemId` + `floatingTabId` + render position).
`liveTabId`/`windowId`/`tabIndex`/`url` demote from co-equal persisted authorities to
**cold-start recovery hints**. Loose entities persist NOTHING — they remain a pure
derivation of `LiveTabIndex` exactly as today (`open-tabs.js:35-57`).

---

## §78.3 — Identity & resolution

### §78.3.1 — One resolution scheme: the claim IS the join

Today three separate joins answer "which live tab is this durable/anchored entity":

- saved-item → tab: the **claim** in `tj:itemClaims` (`tab-claims.js` durable
  machinery; `claimsMirror` read-hot mirror `:45`; `getClaimedTabIds()` `:115-117`).
- floating record → tab: the **3-homed `resolveRecordToTab`**
  (`tab-item-resolver.js:79-129`).
- loose tab: no join needed (it IS the live tab; `buildOpenTabs`).

The unified scheme collapses the first two into ONE authority. **Canonical
live-side identity = `liveTabId`** (B-137 already adopted it as the primary join
key — `tab-item-resolver.js:89-94`, `floating-members.js:104-107`). **Durable-side
identity = `itemId`** (saved) / **`floatingTabId`** (anchor). **The claim is the
join** — reuse the B-173 `tj:itemClaims` durable machinery
(`hydrateClaimsMirrorFromDurable` `tab-claims.js:274-315`; W-1..W-5 PATCH helpers
`:409-570`) so a floating anchor's live binding is resolved and cached by the same
one-authority path that resolves a saved-item claim, not by an independent 3-tier
re-derivation.

### §78.3.2 — How the 3-homed join collapses

Constraint #6: position/URL become "at most a cold-start recovery fallback, not
co-equal authorities." This is the exact inversion B-173 delivered for saved items
(`docs/design/74-b-173-r0-spike.md:347-354`): tiers (b) position + (c) URL move from
"consulted on every resolve" to "consulted once at cold start when the trusted
`liveTabId` binding is unavailable." In steady state, tier (a) direct-`liveTabId` is
authoritative and the recovery tiers are dead paths. The resolver already prefers
tier (a) (`tab-item-resolver.js:89-94`); the collapse makes that preference the
**only** steady-state path and demotes the rest to a one-shot recovery invoked from
the single cold-start reconcile. B-183 (`docs/BACKLOG.md:194`) is the eventual
*deletion* of tiers (b)/(c) once a sprint of clean signal confirms zero orphans —
mirroring B-180's "keep the tiers, stop trusting them, delete later" discipline
(`docs/BACKLOG.md:214`).

### §78.3.3 — SW cold-start reassociation under the unified model (C-3)

Today's cold-start order (`initializeLiveState`, `background/tabs/index.js:37-92`):

1. `buildLiveTabIndex()` + `initWindowOrdinals()` + `listItems()` — concurrent (`:42-46`).
2. `preMarkInheritedFromFloatingGroups()` — marks floating tabs so reconcile skips
   URL-collision claim-jumps (`:61`; `floating-groups-render.js:61-105`).
3. `hydrateClaimsMirrorFromDurable()` — seeds `claimsMirror` from `tj:itemClaims`
   (`:76`; `tab-claims.js:274-315`).
4. `reconcileClaims(items)` — the 4-phase saved-item pipeline (`:80`;
   `tab-claims.js:817-860`).
5. `reassociateFloatingGroups(...)` — the SEPARATE floating re-bind (`:82`;
   `floating-groups-reconcile.js:65-195`).
6. `bootstrapAndSweepRenderOrder()` — renderOrder heal (`:88`;
   `floating-groups-render.js:125-231`).

**Unified target:** steps 4 + 5 converge. Floating anchors re-bind via the SAME
single resolver + claim machinery as saved items, in one reconcile pass, because
both are now "durable identity → recover `liveTabId` → cache in the mirror." The
`preMark` inherited-skip (step 2) folds into that one pass (it exists only because
reconcile Phase 2 and floating re-bind are two separate URL re-derivations that can
fight — remove the second re-derivation and the pre-mark guard's reason to exist
shrinks). The bootstrap/sweep (step 6) stays (it is renderOrder maintenance, a
display concern, per §77). No new cold-start step is added; one is removed. This is
the "no new additive layer" mandate the B-173 charter encoded
(`docs/design/74-b-173-r0-spike.md:391-438`).

### §78.3.4 — ID stability (C-4)

- `itemId` (ULID) is stable across URL drift, rename, cross-window move — never
  rotates. The claim is keyed by `itemId` (`tab-claims.js:45`), so identity survives
  `tabId` rotation via `remapTabIdInClaims` on `chrome.tabs.onReplaced`
  (`tab-claims.js:1068-1112`).
- `floatingTabId` (ULID) is the stable anchor identity and is deliberately
  preserved across a cross-group move (`floating-groups-mutations.js:465-469`).
- `liveTabId`/`windowId`/`tabIndex` are ephemeral (rotate on restart/discard) and
  are therefore LIVE-DERIVED, never authorities — recovered by the resolver's
  recovery tiers at cold start (`tab-item-resolver.js:97-122`) and remapped on
  `onReplaced` (`remapFloatingGroupsLiveTabId`, referenced at `tab-events.js:361-366`).

The unified model does not weaken any of these — it removes the *parallel* identity
stores, leaving `itemId` + `floatingTabId` as the two stable durable identities and
`liveTabId` as the single ephemeral live key, joined by the claim.

---

## §78.4 — Storage decision (C-1a / C-1b / C-7)

Two viable persistence layouts. **R0 recommends Option B.**

### §78.4.1 — Option A: fold floating anchors INTO `tj:items` (one physical store)

Every floating anchor becomes a row in `tj:items` with a `saved: false` (ephemeral)
flag; saved bookmarks carry `saved: true` (or the flag's absence). `isItem`
(`shapes.js:201-214`) gains the flag; one array holds bookmarks + floating anchors;
the top-level catch-all + group render read one partition.

- **Pros:** truest "one entity, one store"; the render/resolve layers read a single
  array; state axes live on one record type.
- **Cons (blast radius):** every existing `tj:items` consumer must now filter
  `saved` — the search index (`buildIndex`, `sidepanel.js:2331`), export/import
  (would serialize ephemeral rows), `bulkReorderItems`, `buildLiveStates`
  (`tab-claims.js:970`), the `isItem` REQUIRED-field contract. **"items = your
  bookmarks" clarity is lost** — a partition that was purely durable bookmarks now
  holds transient anchors that must never leak into exports or the bookmark count.
  Migration is a **cross-partition eager move** (fold `tj:floatingGroups` →
  `tj:items`) with duplicate-id and ordering hazards, touching live floating data
  during the cold-start window — exactly what B-121/B-137 avoided with lazy
  migration (`migration.js:76-87`).

### §78.4.2 — Option B (RECOMMENDED): keep `tj:floatingGroups` distinct; unify RESOLUTION + RENDER only

`tj:items` stays pure saved bookmarks. `tj:floatingGroups` stays the floating-anchor
store, but is **slimmed to anchor-only** (`floatingTabId` + `parentItemId` +
render position; `liveTabId`/`windowId`/`tabIndex`/`url` demoted to recovery hints).
The "one entity model" is achieved at the **resolution layer** (one claim-based
join, §78.3) and the **render layer** (one top-level catch-all, §78.5) — the two
physical stores remain, exactly as B-173 kept `LiveTabIndex` a distinct oracle while
collapsing the logical identity authority (`docs/design/74-b-173-r0-spike.md:134-151`,
`:356-361`) and §77.6.1 kept the floating/open persistence boundary
(`docs/design/77-display-order-consolidation-r0-spike.md:344-372`).

- **Pros:** "items = your bookmarks" clarity preserved — zero change to every
  `tj:items` consumer. Contained blast radius (floating subsystem + resolver +
  render). The record-slim is **additive-compatible** with the already-filed B-183
  validator tighten (`docs/BACKLOG.md:194`) — one schema touch, not two. Rollback is
  the B-180-style forward-readable pattern (`migration.js:317-335`).
- **Cons:** two physical stores remain (but the join, the render region, and the
  identity authority are single). A reader must still know a floating anchor lives in
  a different partition than a bookmark — the conceptual-vs-physical gap B-173
  accepted for `LiveTabIndex`.

### §78.4.3 — Recommendation, schema, migration, rollback

**Recommend Option B.** It mirrors the two shipped precedents (B-173 Option A kept
two record kinds — `docs/design/74-b-173-r0-spike.md:301-327`; §77 kept
floating/open separate). It threads B-194's locked constraints (the unification is
model + render + resolution; the persistence boundary for loose tabs stays intact
per constraint #2) without the `tj:items`-pollution and cross-partition-migration
risk of Option A.

- **C-1a (schema-version governance):** the UNIFICATION itself (demote position/URL
  to recovery-only; route floating resolution through the claim) is a **semantics
  change, not a shape change** — no `KNOWN_VERSION` bump, directly analogous to
  B-179's session-retirement (no bump, `docs/design/74-b-173-r0-spike.md:500`) and
  B-191 Option A (no bump, `docs/design/77-…:485`). The floating record still
  validates as v9. **The ONE bump in the program is the deferred anchor-only
  field-slim + validator tighten (co-landed with B-183): `KNOWN_VERSION` 9→10 in
  lock-step with `defaultShape(PARTITION_META)` (`shapes.js:171`, currently
  `schemaVersion: 9`) + `migration.js:118` (`KNOWN_VERSION = 9`), an eager v9→v10
  `MIGRATION_STEPS` entry (`migration.js:220-336`), the schema-version test pins
  (`tests/migration-fresh-install.test.js` et al.), and a CHANGELOG SW
  module-cache-flush note (toggle OFF→ON in `edge://extensions`).**
- **C-1b (data-migration strategy):** the unification step is **lazy/no-op**
  (fields stay; only authority status changes — the resolver stops trusting them on
  the hot path). The eventual field-slim (B-183 co-land) is **eager** (option 1),
  mirroring B-180's eager v8→v9 normalize (`migration.js:317-335`), and KEEPS the
  recovery tiers until a sprint of clean signal confirms zero orphans (the §74.12
  Risk-3 discipline, `docs/design/74-b-173-r0-spike.md:599-608`).
- **C-7 (allow-list direction):** the slimmed validator stays forward-permissive /
  backward-strict — the existing floatingGroups validator already tolerates
  optional-when-present fields (`shapes.js:366-395`); the tighten narrows the
  REQUIRED set to the canonical anchor fields, keeping the allow-list posture the
  audit and B-183 prescribe.
- **Rollback:** Option B reverts cleanly at every non-schema step (semantics revert
  = re-trust the tiers). The v9→v10 field-slim ships with the standard
  storage-migration rollback (v10 anchor-only records are forward-readable by v9
  code because the demoted fields were already optional-tolerated; a revert
  regenerates them lazily via the resolver, as B-180's rollback note establishes —
  `docs/design/74-b-173-r0-spike.md:501`).

---

## §78.5 — Render model: the single top-level catch-all (C-9)

### §78.5.1 — One region replaces two pipelines

Kill BOTH the synthetic `__ungrouped__` section (`sidepanel.js:2285-2307`) and the
separate `buildOpenTabsSection` (`sidepanel.js:3455-3513`). Replace with ONE
**top-level catch-all region** that holds, in order:

1. **A renderOrder-ordered head** — ungrouped saved bookmarks (`groupId === null`) +
   floating-under-top-level (`parentItemId` → an ungrouped bookmark) interleaved via
   a **top-level `renderOrder`** (the same `resolveRenderOrder` contract groups use,
   `shared/render-order.js:39-74`; needs a null-group renderOrder OWNER — see
   §78.9 Q3, and B-191's renderOrder-sole-authority interaction, `docs/BACKLOG.md:199`).
2. **A live-ordered loose tail** — loose open tabs, ordered by `(windowId, tabIndex)`
   exactly as `buildOpenTabs` does today (`open-tabs.js:51-54`). This is the
   *separate ephemeral ordering authority* §77.6.1 said to keep
   (`docs/design/77-…:311-313`) — now a tail *within* the one region instead of a
   sibling section.

Both zones distinguish saved/floating/loose by **visual state** (the live/dormant
indicator treatment already applied to claimed-vs-dormant bookmarks,
`tab-claims.js:970-1005` + `buildItemRow`, `sidepanel.js:2557+`), NOT by separate
sections — constraint #4.

### §78.5.2 — Visual variant A: fully merged (one continuous list)

```
┌───────────────────────────────────────────────┐
│ ▸ Work                              (3)         │  ← a real group (unchanged)
│    ● github.com/acme/api      (live)            │
│    ○ jira board                (dormant)        │
│    · floating: PR #204        (unsaved, live)   │
├───────────────────────────────────────────────┤
│  TOP LEVEL                          (5)         │  ← ONE catch-all, one header
│    ● reddit.com                (live bookmark)  │  ┐
│    ○ read-later.md             (dormant bkmk)  │  ├ renderOrder head
│    · floating: linked issue    (unsaved,live)  │  ┘   (saved + floating-under-top-level)
│    · localhost:3000            (loose tab)      │  ┐
│    · docs.google.com/…         (loose tab)      │  ┘ live-ordered tail (windowId,tabIndex)
└───────────────────────────────────────────────┘
```

No divider — saved/floating/loose read as one list, told apart only by the row's
visual state (dot fill, "unsaved" cue, the `+` save CTA on unsaved rows, already
built by `buildFloatingTabRow`'s save CTA, `sidepanel.js:3377-3392`).

### §78.5.3 — Visual variant B: one region, subtle saved/unsaved divider

```
┌───────────────────────────────────────────────┐
│  TOP LEVEL                          (5)         │  ← ONE section, ONE header
│    ● reddit.com                (live bookmark)  │  ┐ renderOrder head:
│    ○ read-later.md             (dormant bkmk)  │  │ saved + floating-under-top-level
│    · floating: linked issue    (unsaved,live)  │  ┘
│  · · · · · · · · · · · · · · · · · · · · · · ·  │  ← subtle hairline divider
│    · localhost:3000            (loose tab)      │  ┐ live-ordered tail:
│    · docs.google.com/…         (loose tab)      │  ┘ loose open tabs (windowId,tabIndex)
└───────────────────────────────────────────────┘
```

Same single region + single header; a hairline separates the persisted head from the
ephemeral loose tail so users retain the "saved vs just-open" cue the current Open
Tabs header gives them ("No untracked tabs — all open tabs are saved or grouped",
`sidepanel.js:3505`). Divider is CSS-only; no structural second section.

**Recommendation:** ship Variant B (keeps the saved/unsaved affordance the current UX
teaches, at near-zero structural cost); leave the divider a preference/UX call
(§78.9 Q1).

### §78.5.4 — Empty states (C-9)

The one region must enumerate: **zero-items** (no saved, no floating, no loose →
region hidden, global empty-state shows, mirroring `renderAll`'s current
all-empty guard `sidepanel.js:2226-2234`); **head-empty/tail-present** (no saved or
floating at top level, but loose tabs exist → show only the tail, no divider);
**head-present/tail-empty** (saved/floating at top level, no loose tabs → show only
the head, suppress the "no untracked tabs" placeholder or show it inline as today
`sidepanel.js:3499-3507`); **zero-groups** (all content is top-level → the region is
the whole panel). R4 [qa-reviewer] checks the built region against this enumeration.

### §78.5.5 — How `__ungrouped__` + `buildOpenTabsSection` collapse

- `renderAll`'s `__ungrouped__` synthetic-group branch (`sidepanel.js:2285-2307`) and
  the `buildOpenTabsSection` append (`:2310`) are replaced by one
  `buildTopLevelSection(headRows, looseTail)` call.
- `buildFloatingMembers` stops skipping ungrouped parents (`floating-members.js:94`)
  and can key top-level floating anchors under a sentinel/null key (§78.9 Q3).
- The incremental patchers (`patchFloatingMembersSections` `sidepanel.js:3261`;
  `patchOpenTabsSection` `sidepanel.js:3528`) must patch WITHIN the one region — the
  B-188 renderOrder-slot insert fix (`shared/render-order.js:108-118`,
  `sidepanel.js:3410-3418`) already makes floating-row insertion renderOrder-correct;
  the loose tail keeps `patchOpenTabsSection`'s order-faithful diff, now scoped to
  the tail sub-list. Cross-surface: the same collapse applies to `newtab.js`
  (`_renderGrid` / `_refetchAndPatchLiveState`, §77.3.5 RP-D/RP-E,
  `docs/design/77-…:163-164`).

### §78.5.6 — B-185 falls out for free

Once (1) the top-level region can hold floating rows (the empty-array pass at
`sidepanel.js:2305` is gone), (2) `buildFloatingMembers` no longer requires
`parent.groupId` (`floating-members.js:94`), (3) the anchor is `parentItemId` with a
top-level renderOrder owner, and (4) `resolveFloatingOpener` no longer requires a
non-empty `groupId` (`opener-chain.js:107-111`) — a link opened from a top-level
bookmark's tab floats directly under that bookmark. B-185 (`docs/BACKLOG.md:203`) is
subsumed, not a separate feature. This is the "B-185 falls out for free" the founding
constraint #5 and the epic row (`docs/BACKLOG.md:205`) promise.

---

## §78.6 — Message-contract impact (C-2)

`MSG_LIST_ITEMS` / `ListItemsResponse` (`shared/messages.js:363-395`) carries
`items`, `liveStates`, `driftRecords`, `openTabs` (`OpenTab[]`, `:375`),
`windowMap`, and optional `floatingMembers` (`Record<groupId, FloatingMember[]>`,
`:388`). The unification touches two payload facets:

- **`floatingMembers` keying (`shared/messages.js:388-391`).** Today keyed by the
  parent bookmark's `groupId` — structurally unable to express a top-level
  (`groupId === null`) anchor. **Change:** key by the anchor's owner including a
  sentinel for the top-level region (e.g. a `__toplevel__` key), OR re-key by
  `parentItemId`. This is the contract change that unblocks B-185. Additive: pre-
  unification callers already treat `undefined` as `{}` (`shared/messages.js:394`),
  so adding a sentinel key is backward-tolerant.
- **`openTabs` (`shared/messages.js:375-379`).** Stays — it IS the loose tail. No
  shape change to `OpenTab` (the B-189 `liveTabDescriptor` base already unifies the
  live fields, `live-tab-descriptor.js:31-42`). The renderer moves it from a
  separate section into the top-level region's tail (§78.5), a UI change, not a
  contract change.
- **`MSG_MOVE_FLOATING_TAB` (`shared/messages.js:246`; handler
  `floating-groups-mutations.js:376-561`).** ATTACH currently resolves the anchor
  from the target GROUP and rejects an empty group (`floating-groups-mutations.js:409-416`).
  **Change:** allow ATTACH to anchor under a **top-level parent item** (target has no
  group). The payload's `targetGroupId: string|null` semantics widen —
  `targetGroupId === null` today means DETACH-to-open (`shared/messages.js:213-216`);
  a top-level ATTACH needs a way to express "anchor under item X at top level"
  (a `targetParentItemId` field, or reuse the drag-target resolution). This is a
  **contract widening** requiring the R2 fix-scope test-assertion enumeration (the
  MSG-shape-change discipline in CLAUDE.md's R2 checklist).
- **No new `MSG_*` types are required** for the core unification — `MSG_PROMOTE_TAB`
  (`shared/messages.js:35`), `MSG_DEMOTE_ITEM` (`:38`), `MSG_MOVE_FLOATING_TAB`,
  `MSG_REORDER_FLOATING_MEMBERS` (`:205`) already cover the loose↔anchored↔saved
  transitions (constraint #3); they are widened, not added to.
- **C-13 (Chrome event-feedback completeness):** the loose tail's `(windowId,
  tabIndex)` order depends on `LiveTabIndex.index` being fresh. `removeTabEntry`
  does NOT renumber survivors (`live-tab-index.js:74-76`) and the `onRemoved`
  cascade doesn't either (`tab-events.js:343-349`) — the B-186 staleness bug
  (`docs/BACKLOG.md:201`). Under a merged region the stale index scrambles the tail
  visibly, so B-186's event-feedback fix (renumber survivors on close) becomes a
  correctness prerequisite (§78.8).

---

## §78.7 — Risk register (honest complexity accounting)

### §78.7.1 — Does this genuinely reduce complexity, or move it?

**Mostly reduces; partly moves.** Genuine reductions: (a) the 3-homed floating join
collapses to one claim-based authority (kills the parallel identity store — a real
B-173-class win); (b) two top-level render pipelines become one region (kills the
`__ungrouped__`-vs-Open-Tabs structural split); (c) B-185 stops being a feature and
becomes a consequence. **Genuinely moved (not removed) complexity:** the single
top-level region now carries **two ordering zones** (renderOrder head + live-ordered
tail) with a boundary rule between them — complexity migrates from "two sections,
each simple" to "one section, two zones + a boundary." And it needs a **null-group
renderOrder owner** that does not exist today, entangling with B-191 (renderOrder
sole authority, `docs/BACKLOG.md:199`) and B-185's ungrouped-anchor model.

### §78.7.2 — The one place this argues AGAINST full merge

§77.6.1 gave three strong, still-valid reasons to KEEP floating and open **separate**
(`docs/design/77-…:344-372`): the persistence boundary is real, the ordering
authorities answer different questions, and the semantic distinction is intentional.
**B-194 does NOT overturn those** — it threads them: loose tabs stay pure-live
(constraint #2 preserves the persistence boundary), and the loose tail keeps
`(windowId, tabIndex)` ordering distinct from renderOrder (constraint #4 preserves
the ordering boundary). So the merge is at the **model + render-region + resolution**
layers only, NOT at persistence/ordering — fully compatible with §77.6.1. **The
honest caveat:** if a future reading of "one entity model" is taken to mean "persist
loose tabs" or "fold open-tab order into renderOrder," it would violate constraint #2
/ #4 and re-introduce exactly the churn §77.6.1 warned against
(`docs/design/77-…:346-363`). The design must hold the line that "loose" means
zero-storage and live-ordered. Recommend Option B (§78.4) precisely because Option A
(fold into `tj:items`) is the version most likely to erode that line.

### §78.7.3 — Top 3 risks

- **Risk-1 — the null-group renderOrder owner is undesigned and triple-entangled.**
  The top-level head needs a renderOrder owner (today only real `Group` records carry
  `renderOrder`, `shapes.js:233-240`; `__ungrouped__` is synthetic with no record,
  `sidepanel.js:2294-2299`). This interacts with **B-191** (renderOrder-sole-authority,
  deferred, `docs/BACKLOG.md:199`) and **B-185** (ungrouped-anchor model,
  `docs/BACKLOG.md:203`). Designing the top-level renderOrder owner in isolation risks
  a three-way collision. Mitigation: a spike-confirm pass before the behavior-changing
  step, and co-design with B-185/B-191 (§78.8 sequence).
- **Risk-2 — the identity cutover is UAT-only, like B-179.** Routing floating
  resolution through the claim machinery + demoting position/URL to recovery-only is a
  cold-start-hydration change. `chrome-mock` cannot reproduce session-wipe-vs-SW-
  restart vs browser-restart tabId rotation (`docs/design/74-b-173-r0-spike.md:574-577`).
  The regression surface (floating tab lands in the loose tail instead of under its
  parent after reload/restart) is real-browser-only. Budget Edge UAT generously; fold
  the B-137/B-132 floating-reload probes (P-4/P-5, `docs/design/74-…:549-555`).
- **Risk-3 — the loose tail's correctness depends on B-186.** The live-ordered tail
  reads `LiveTabIndex.index`, which goes stale on every tab close because
  `removeTabEntry` doesn't renumber survivors (`live-tab-index.js:74-76`;
  `tab-events.js:343-349`) — the confirmed B-186 root cause (`docs/BACKLOG.md:201`).
  Merging the region makes this scramble more visible (it now sits inline with saved
  rows). B-186 (Fast-Track S) is a correctness prerequisite, not an optional cleanup.

### §78.7.4 — Blast radius

sidepanel render core (`renderAll` `:2208`, `buildGroupSection` `:2352`,
`buildOpenTabsSection` `:3455`, `patchFloatingMembersSections` `:3261`,
`patchOpenTabsSection` `:3528`); the cross-surface newtab equivalents (RP-D/RP-E,
`docs/design/77-…:163-164`); `buildFloatingMembers` keying (`floating-members.js:94,140`);
`moveFloatingTab` ATTACH rule (`floating-groups-mutations.js:409-416`);
`resolveFloatingOpener` groupId gate (`opener-chain.js:107-111`); the resolver
(`tab-item-resolver.js:79-129`); the `MSG_LIST_ITEMS` payload
(`shared/messages.js:363-395`); and, at the deferred field-slim step, the schema +
validator (`shapes.js:171,349-396`; `migration.js:118,220-336`).

---

## §78.8 — Sub-item breakdown (for [scrum-master] / product-owner)

Proposed IDs **B-195…B-199** (B-194 is the current highest, `docs/BACKLOG.md:205`).
Mirrors the B-173 discipline (safety net FIRST → structural refactors → the
behavior-changing collapse in its OWN step/sprint — `docs/design/74-b-173-r0-spike.md:442-488`)
and the §77 phasing. **Reconciles B-183 + B-185; keeps B-186 separate as a
prerequisite.**

| ID | One-line story | Effort | Behavior-changing? | Depends on | Maps to |
|----|----------------|:------:|:------------------:|------------|---------|
| **B-186** (existing) | Renumber surviving same-window `LiveTabIndex.index` on tab close so the loose tail orders correctly (the confirmed staleness bug). | **S** | Yes (bugfix) | none | prerequisite (`docs/BACKLOG.md:201`) |
| **B-195** | Safety-net integration test net: seed saved-ungrouped + floating-under-ungrouped + loose + claimed/dormant, assert the unified top-level region renders in correct head+tail order AND floating resolution is single-sourced. Folds the mock-reproducible B-185 subset. | **M** | No (test-only) | — | A0 (safety net) |
| **B-196** | Structural render merge: replace `__ungrouped__` synthetic section + `buildOpenTabsSection` with ONE top-level catch-all region (renderOrder head + live-ordered loose tail), sidepanel + newtab. Same content, one region. | **L** | Yes (UI regroup) | B-195, B-186 | A1 render collapse |
| **B-197** (absorbs **B-185**) | Enable top-level/ungrouped floating anchoring: `parentItemId` anchor, `buildFloatingMembers` no longer skips ungrouped, `moveFloatingTab` ATTACH-to-top-level, `resolveFloatingOpener` no groupId requirement, null-group renderOrder owner. | **M/L** | Yes | B-196, B-191 coordination | B-185 subsumed |
| **B-198** | Identity cutover: route floating record↔live-tab resolution through the claim machinery; canonical `liveTabId` join; demote position/URL to cold-start recovery-only (semantics, no schema bump). Its OWN sprint, full UAT. | **L** | Yes (storage semantics) | B-195, B-196, B-198-spike-confirm | B1 (the real fix) |
| **B-199** (co-lands **B-183**) | Anchor-only floating-record slim + validator tighten to canonical v4/v10; delete the now-dead recovery tiers; v9→v10 eager migration + paired KNOWN_VERSION bump. Last, after B-198 bakes. | **M/L** | Yes (schema bump) | B-198, B-183 bake | B2 + B-183 |

**Reconciliation notes:**
- **B-183** (`docs/BACKLOG.md:194`) is co-landed as **B-199** — its validator
  tighten + tier deletion is exactly the field-slim the unification's deferred schema
  step performs; do them in ONE v9→v10 touch (the §77.7.1 "pair the two schema
  touches" mandate, `docs/design/77-…:429-435`).
- **B-185** (`docs/BACKLOG.md:203`) is fully subsumed by **B-197** — it is not a
  standalone feature under the unified model.
- **B-186** (`docs/BACKLOG.md:201`) is KEPT SEPARATE (different layer —
  `LiveTabIndex`/`tab-events`, not the identity/render model) but sequenced as a
  **prerequisite** to B-196 because the loose tail depends on fresh `index`. Do NOT
  fold it into the identity epic; ship it as the small Fast-Track it already is.
- **B-191 / B-192** (display-order Tier-B, deferred, `docs/BACKLOG.md:199-200`) stay
  separate but the top-level renderOrder owner (B-197) must be co-designed with
  B-191's renderOrder-sole-authority model.

**Recommended sequence:** B-186 (prerequisite) → B-195 (net) → B-196 (render merge) →
B-197 (=B-185) → **spike-confirm** (short SA pass, re-verify the identity cutover +
the null-group renderOrder owner against the merged code before committing) → B-198
(identity cutover, own sprint, full UAT) → B-199 (=B-183 co-land, schema bump). Per
P-1 (max one L/XL active), the render bundle (B-186 + B-195 + B-196 + B-197) is one
sprint; B-198 + B-199 are a later sprint after B-183 bakes.

---

## §78.9 — Open questions / new product decisions

Respecting the LOCKED constraints, the design exposes these genuinely NEW forks:

- **Q1 (visual variant).** Variant A fully-merged single list vs Variant B one
  region with a subtle saved/unsaved hairline divider (§78.5.2/§78.5.3)? R0 leans
  Variant B (keeps the saved/unsaved affordance the current Open Tabs header
  teaches, `sidepanel.js:3505`). Product/UX decision.
- **Q2 (top-level region placement).** Does the single top-level catch-all sit
  ABOVE the groups (top of panel) or BELOW them (where Open Tabs is today,
  `sidepanel.js:2310`)? Constraint #4 fixes the region's *contents* and *internal*
  order but not its position relative to groups. New fork.
- **Q3 (null-group renderOrder owner).** How is the top-level head's `renderOrder`
  represented — a sentinel `__toplevel__` group record, a per-item order, or an
  extension of the `Group` shape to a null-id record? Interacts directly with B-191
  (`docs/BACKLOG.md:199`) and gates B-197. Decide before B-197 R1.
- **Q4 (loose→anchored transition & confirmation).** Dragging a loose open tab under
  a top-level bookmark creates a floating anchor (`parentItemId`, `groupId=null`).
  Constraint #3 makes this a real transition; confirm it reuses the existing
  `moveFloatingTab` ATTACH path (widened per §78.6). Destructive-action
  confirmation: **N/A** (non-destructive, reversible via DETACH) — but state it
  explicitly at R1 per the DoR item-7 discipline.
- **Q5 (storage A vs B).** Confirm Option B (keep `tj:floatingGroups` distinct,
  unify resolution+render; §78.4). R0 recommends B; given the "one entity model"
  ambition, an explicit product/architecture sign-off is warranted before B-196.
- **Q6 (B-186 gating).** Ship the render merge (B-196) gated on B-186 landing first
  (recommended — the loose tail is visibly wrong without it), or ship the merge with
  a documented stale-index caveat and fast-follow B-186?

---

## §78.10 — Sign-off and next round

- **R0 outputs:** this chapter (§78).
- **Feasibility:** **GREEN-with-conditions.** The unification is a faithful sibling
  of the shipped B-173 identity collapse and the S48 §77 render-order Tier-A work;
  every locked constraint maps onto an existing, cited mechanism (the claim as the
  join; `liveTabId` as the canonical live key; `parentItemId` as the anchor;
  `renderOrder` for the head; `(windowId,tabIndex)` for the tail). The conditions are
  the three risks: the null-group renderOrder owner (Risk-1, entangled with
  B-191/B-185), the UAT-only identity cutover (Risk-2), and the B-186 prerequisite
  (Risk-3).
- **Storage verdict:** **Option B** (keep `tj:floatingGroups` distinct; unify
  resolution + render; slim to anchor-only at the deferred B-199 schema step) —
  preserves "items = your bookmarks" clarity, contains blast radius, co-lands with
  B-183, mirrors both shipped precedents.
- **Schema-bump verdict:** **NO bump** for the unification (semantics change); the
  ONE bump is the deferred v9→v10 anchor-only slim + validator tighten, co-landed
  with B-183.
- **Sub-item split:** B-195 (net) + B-196 (render merge) + B-197 (=B-185) + B-198
  (identity cutover) + B-199 (=B-183 co-land); B-186 kept separate as a prerequisite.
- **Recommended next step:** [scrum-master] reviews the Q1–Q6 product-owner
  questions (especially Q3 null-group renderOrder owner and Q5 storage A-vs-B), then
  — if approved — routes **B-186 (index-freshness prerequisite)** and **B-195
  (safety net)** to R1 first, gating B-196/B-197 on them and the B-198 cutover on a
  post-B-197 spike-confirm.

**End of §78.**
