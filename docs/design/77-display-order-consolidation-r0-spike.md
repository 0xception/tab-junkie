# §77 — Display-Order / Floating-Tab-Model Consolidation R0 Spike

**Owner:** [solution-architect]
**Round:** R0 (Spike-First discovery — read-only static analysis, no product-code or test changes)
**Sprint:** post-S47 (epic-scoping spike)
**Date:** 2026-06-29
**Branch:** `fix/opener-chain-inheritance` off `release/v2` @ v1.42.0 (S47 close). HEAD `5fafc0e` (B-184 positioning fix).
**Status:** R0 spike output for [scrum-master] → product-owner routing.

---

## §77.1 — Purpose and scope

The B-173 epic (v1.42.0) collapsed bookmark↔tab **IDENTITY** from six multi-homed
stores into one durable authority (`tj:itemClaims`) + derived caches, via an
R0-spike→retirement-plan process with zero regressions (`docs/design/76-b-173-epic-as-built.md`).
The product-owner now asks whether the **same class of problem** — "the same fact
stored or re-derived in N places that must be kept in sync" — exists for **DISPLAY
ORDER + drag/drop/move + the floating-tab model**, and whether to consolidate it.

The trigger is the B-184 positioning bug, just fixed at HEAD (`5fafc0e`): a tab
opened from a floating child rendered at the **BOTTOM** of its group instead of
under its opener. Root cause was NOT a storage error — the persisted
`Group.renderOrder` was **correct** (the diag at the now-removed instrumentation
confirmed `anchorInRenderOrder=true`). The bug was that the inheritance broadcast
used `SCOPE.LIVE_STATE`, which routed the sidepanel to an **incremental** render
path (`patchFloatingMembersSections`) that drops new rows at the bottom
`staticAnchor` and never consults `renderOrder`, instead of the **full** path
(`renderAll`→`resolveRenderOrder`) that respects it. The fix re-tagged the
broadcast to `SCOPE.ITEMS`. **That is a symptom, not the disease**: two render
paths disagree about row order, and which one runs is decided by a `SCOPE` string
constant at the broadcast call site, far from the order logic.

The S47 architectural review already flagged this and **deferred it** as Tier-C:
"single source of truth for display order (`renderOrder` vs the two `sortOrder`
fields)" (`docs/design/74-b-173-r0-spike.md:457-462`). There is also a filed
**B-183** (delete the floating-groups fallback tiers + tighten the validator,
post-bake) and a filed **B-185** (ungrouped floating support). This spike scopes
the broader display-order consolidation and its interaction with both.

This R0 delivers: (1) the empirical display-order multi-homing map with `file:line`
drift points; (2) the SSOT target for display order; (3) the floating-vs-open
recommendation the product-owner asked for explicitly; (4) a phased M/L sub-item
split; (5) migration / rollback / schema impact; (6) risk flags + open questions.
House style mirrors §74 (confirm-with-citations, then recommend tier + sub-items).

---

## §77.2 — Investigation method

Read-only static analysis. Files walked in full or in scope:

- `background/storage/shapes.js` (432 lines) — `isItem`/`isGroup` validators,
  `Item.sortOrder` (`:205`), `FloatingGroup.sortOrder` (`:375-383`),
  `Group.renderOrder` (`:233-240`), `defaultShape`, `KNOWN_VERSION` literal source.
- `shared/render-order.js` (75 lines) — `resolveRenderOrder` (renderOrder authority
  `:45-61` + sortOrder bootstrap fallback `:63-73`).
- `sidepanel/sidepanel.js` (8625 lines, scoped) — `renderAll` (`:2208`),
  `buildGroupSection` (`:2352`), the `resolveRenderOrder` call (`:2434`),
  `patchFloatingMembersSections` (`:3225`), `buildOpenTabsSection` (`:3408`),
  `patchOpenTabsSection` (`:3481`), the `renderOrderChanged`/`canPatch` full-vs-
  incremental gate (`:7270-7295`).
- `newtab/newtab.js` (1500 lines, scoped) — `_handleBroadcast` (`:624`),
  `_refetchAndPatchLiveState` (`:715`), `_renderGrid` (`:781`), the
  `resolveRenderOrder` call (`:991`).
- `background/tabs/floating-members.js` (186 lines) — `buildFloatingMembers`
  (sortOrder sort `:152-163`), `collectFloatingTabIds` (`:176-185`).
- `background/tabs/open-tabs.js` (63 lines) — `buildOpenTabs` ((windowId,tabIndex)
  sort `:57-60`, floating exclusion `:43`).
- `background/tabs/floating-groups-mutations.js` (577 lines) —
  `appendFloatingGroup` (sortOrder stamp `:171`, renderOrder splice `:189-207`),
  `reorderFloatingMembers` (sortOrder renumber `:347-348`), `moveFloatingTab`
  (sortOrder renumber `:450,491-513`; renderOrder strip/append `:526-557`).
- `background/messages/storage-handlers.js` (937 lines) — `MUTATION_BROADCASTS`
  (`:124-146`), the `MSG_REORDER_FLOATING_MEMBERS` renderOrder vs legacy-tabIds
  branch (`:741-792`), `MSG_MOVE_FLOATING_TAB` (`:793-833`).
- `background/broadcast.js` (17 lines) + `shared/scopes.js` (21 lines) — the
  5-value `SCOPE` taxonomy.
- `background/tabs/tab-events.js` — the B-184 fix (`broadcast(SCOPE.ITEMS,
  'tab/opener-inherited')`, was `SCOPE.LIVE_STATE`).
- Design context: `docs/design/68-b-148-interleave-render-order.md` (the renderOrder
  design + its 12 write sites + the §68.8/§68.9 hotfix sequence),
  `docs/findings/sprint-47.md` (Tier-C deferral + B-183), `docs/design/74-b-173-r0-spike.md`
  (the identity-consolidation precedent + process), `docs/BACKLOG.md:194-196`
  (B-183 / B-184 / B-185 rows).
- Commit context: `git show 5fafc0e` (the B-184 broadcast-scope fix, HEAD).

---

## §77.3 — The display-order multi-homing map

Analogous to B-173's six-store identity map. The single fact *"what order do rows
appear in within a group"* is **stored or re-derived in 4 authorities and applied
through 5 render paths.** The drift surface is the cross product: every render
path that re-derives order independently can disagree with every other.

### §77.3.1 — Order Authority 1: `Item.sortOrder` (persisted, REQUIRED)

- **What:** per-item integer, ascending within a group. The pre-B-148 saved-bookmark
  order.
- **Validator:** `shapes.js:205` — `if (!isNumber(v.sortOrder) ...) return false`.
  **REQUIRED on every Item** (not optional) — load-bearing for `isItem`.
- **Written:** `createItem` (stamp at group tail), `bulkReorderItems` (the
  saved-bookmark drag — `items.js`, the f96662a hotfix that writes BOTH sortOrder
  AND renderOrder, §68.5 site 6), `updateItem({sortOrder})`.
- **Read:** `renderAll` byGroup sort (`sidepanel.js:2245-2247`); `resolveRenderOrder`
  **bootstrap fallback only** (`render-order.js:65`). When `renderOrder` is present
  it is **ignored for display** (resolver returns the renderOrder walk, never
  consulting sortOrder — `render-order.js:45-61`).
- **Status:** since B-148, a **shadow** display authority — maintained on every
  write, but read only by the bootstrap fallback + the (subsequently overridden)
  `renderAll` sort. Vestigial for display, but still REQUIRED structurally.

### §77.3.2 — Order Authority 2: `FloatingGroup.sortOrder` (persisted, OPTIONAL v3+)

- **What:** per-floating-record integer, ascending within a group's floating bucket.
  The pre-B-148 floating-tab order (B-134 §63.8.4).
- **Validator:** `shapes.js:375-383` — OPTIONAL; legacy v2 records lack it.
- **Written:** `appendFloatingGroup` (`max+1` stamp, `floating-groups-mutations.js:171`),
  `reorderFloatingMembers` (`indexOf` renumber `:347-348`), `moveFloatingTab`
  (source + target bucket renumber `:450,491-513`).
- **Read:** `buildFloatingMembers` sort (`floating-members.js:152-163`);
  `resolveRenderOrder` **bootstrap fallback only** (`render-order.js:69`). Same as
  OA-1 — overridden whenever `renderOrder` is non-empty.
- **Status:** the SECOND shadow display authority. Note `reorderFloatingMembers`
  and `moveFloatingTab` **renormalize sortOrder AND renderOrder in the same write**
  (storage-handlers + mutations) — the dual-write that DO-1 (§77.4) is about.

### §77.3.3 — Order Authority 3: `Group.renderOrder` (persisted, OPTIONAL v7+) — TODAY'S AUTHORITY

- **What:** the B-148 interleaved ref list — `['item:<id>', 'floating:<floatingTabId>', ...]`
  on the parent Group record. The user-defined, persisted, cross-reload display order.
- **Validator:** `shapes.js:233-240` — OPTIONAL prefix-encoded refs, `MAX_REF_LENGTH=64`.
- **Written:** 12 atomic multi-partition write sites (`docs/design/68...:216-245`) +
  the cold-start `bootstrapAndSweepRenderOrder`. Every item/floating mutation that
  adds/removes/repositions a row also mutates `renderOrder` in the same
  `writeTransaction`.
- **Read:** `resolveRenderOrder` (`render-order.js:45-61`) — **WINS whenever
  non-empty.** Consumed by both full render paths (sidepanel `:2434`, newtab `:991`).
- **Status:** the de-facto sole display authority for non-legacy profiles. The
  problem is it is NOT structurally sole — OA-1/OA-2 still exist and must be kept
  consistent, and the incremental render paths bypass it (§77.3.6).

### §77.3.4 — Order Authority 4: `(windowId, tabIndex)` open-tab order (derived, EPHEMERAL)

- **What:** the live browser tab-strip order. Open (unaffiliated) tabs render in a
  separate Open Tabs section in this order.
- **Source:** `buildOpenTabs` sort (`open-tabs.js:57-60`) — derived from
  `LiveTabIndex`, **never persisted**, never in `renderOrder`.
- **Read:** `buildOpenTabsSection` (`sidepanel.js:3408`) builds rows in array order;
  `patchOpenTabsSection` (`:3481`) re-orders to match the next array.
- **Status:** a genuinely **separate** ordering authority answering a different
  question ("the browser's own tab order"). The floating-vs-open question (§77.5)
  is about whether this should be unified with OA-3.

### §77.3.5 — The 5 render paths (where order is APPLIED)

| Path | Surface | Trigger | Order source | renderOrder-respecting? |
|------|---------|---------|--------------|--------------------------|
| **RP-A** `renderAll`→`buildGroupSection`→`resolveRenderOrder` | sidepanel | full render / `SCOPE.ITEMS`/`GROUPS` / `renderOrderChanged` | OA-3 (fallback OA-1/OA-2) | **YES** (`sidepanel.js:2434`). *Also* independently sorts byGroup by OA-1 at `:2245` — dead work when renderOrder present. |
| **RP-B** `patchFloatingMembersSections` | sidepanel | `SCOPE.LIVE_STATE` / items-noop fast-path | `staticAnchor` (bottom of saved zone) | **PARTIAL — the bug.** EXISTING rows left in place iff group has renderOrder (`:3368`); **NEW rows ALWAYS inserted at `staticAnchor`** (`:3366-3367`), ignoring renderOrder. |
| **RP-C** `patchOpenTabsSection` | sidepanel | `SCOPE.LIVE_STATE` / fast-path | OA-4 next-array order | **N/A** — open tabs, consistent with `buildOpenTabs`. |
| **RP-D** `_renderGrid`→`resolveRenderOrder` | newtab | `SCOPE.ITEMS`/`GROUPS` (`_refetchAndRender`) | OA-3 (fallback OA-1/OA-2) | **YES** (`newtab.js:991`). |
| **RP-E** `_refetchAndPatchLiveState` | newtab | `SCOPE.LIVE_STATE` | full rebuild on floating-set change; else per-row patch | **YES (by escape hatch)** — `floatingChanged` (`newtab.js:740-746`) forces a full `_renderGrid` on ANY floating-set change. **Safer than RP-B.** |

### §77.3.6 — The decisive structural finding

**The two surfaces apply DIFFERENT rules to the same broadcast.** On a structural
floating change tagged `SCOPE.LIVE_STATE`:

- **newtab (RP-E)** detects the changed floating-set (`JSON.stringify` compare,
  `newtab.js:740`) and **falls back to a full renderOrder-respecting rebuild** — so
  newtab placed the B-184 tab correctly even before the fix.
- **sidepanel (RP-B)** patches in place and **drops the new row at `staticAnchor`
  (bottom)** — the B-184 bug.

So the B-184 fix (re-tag to `SCOPE.ITEMS`) routed the sidepanel to RP-A, masking
the RP-B defect. The defect itself — *RP-B is not renderOrder-respecting for new
rows* — remains. Any future structural change mis-tagged `SCOPE.LIVE_STATE`
reintroduces a B-184-class bug on the sidepanel. **The broadcast `SCOPE` tag is a
hidden, implicit display-order authority**: it decides full-vs-incremental, and
mis-classifying a structural change as `LIVE_STATE` silently routes to the
order-ignoring path. This is the exact analogue of B-173's "ownership re-derived
instead of read from one authority" pattern (`docs/design/74...:274-279`).

### §77.3.7 — Summary table

| # | Authority / path | Layer | Write/derive sites | Read sites | Verdict |
|---|------------------|-------|--------------------|------------|---------|
| OA-1 | `Item.sortOrder` | persisted (REQUIRED) | createItem / bulkReorderItems / updateItem | `sidepanel.js:2245`, `render-order.js:65` (bootstrap) | **Demote to bootstrap-seed (keep field)** |
| OA-2 | `FloatingGroup.sortOrder` | persisted (OPTIONAL) | `floating-groups-mutations.js:171,347,450,491` | `floating-members.js:152`, `render-order.js:69` (bootstrap) | **Demote to bootstrap-seed (keep field)** |
| OA-3 | `Group.renderOrder` | persisted (OPTIONAL) | 12 write sites (§68.5) | `render-order.js:45-61` | **PROMOTE to sole persisted display SSOT** |
| OA-4 | `(windowId, tabIndex)` | ephemeral (derived) | `open-tabs.js:57` | `sidepanel.js:3408,3481` | **KEEP separate (open-tab order ≠ group order)** |
| RP-A | sidepanel full | render | — | `:2434` | renderOrder-respecting (canonical) |
| RP-B | sidepanel incremental floating | render | — | `:3366` | **FIX or DELETE (the B-184 defect)** |
| RP-C | sidepanel incremental open | render | — | `:3508` | OK (open tabs) |
| RP-D | newtab full | render | — | `:991` | renderOrder-respecting |
| RP-E | newtab incremental | render | — | `:740` | OK (full-rebuild escape hatch) |

**4 order authorities + 5 render paths. Two authorities (OA-1/OA-2) are redundant
shadows of OA-3. One render path (RP-B) silently bypasses OA-3. The two surfaces
(sidepanel/newtab) disagree on the incremental-path rule.** This is the same
multi-homing shape B-173 collapsed for identity.

---

## §77.4 — Drift-point catalog (where two authorities/paths disagree)

Each is a window in which two sources hold different answers to "what order."

- **DO-1 — OA-3 `renderOrder` vs OA-1/OA-2 `sortOrder`, dual-write skew.** Every
  reorder writes BOTH the sortOrder field AND `renderOrder` (e.g. `bulkReorderItems`
  hotfix f96662a; `reorderFloatingMembers` renumbers sortOrder while the
  `MSG_REORDER_FLOATING_MEMBERS` renderOrder path writes `Group.renderOrder` via
  `updateGroup` — `storage-handlers.js:759-779`). If a write updates one and not
  the other (a legacy path, a partial failure, a future write site that forgets the
  sortOrder leg), the two disagree. Today `resolveRenderOrder` masks it (renderOrder
  wins), but the bootstrap fallback (DO-5) and any re-bootstrap surface the stale
  sortOrder. **This is the direct analogue of B-173's D-1 dual-write skew**
  (`docs/design/74...:223-231`).

- **DO-2 — RP-A (full) vs RP-B (incremental), the B-184 bug.** The persisted
  `renderOrder` was correct; `patchFloatingMembersSections` inserts NEW floating
  rows at `staticAnchor` (`sidepanel.js:3366-3367`) without consulting renderOrder.
  Which path runs is decided by the broadcast `SCOPE` (DO-4). Fixed for the
  opener-inherited trigger by re-tagging to `SCOPE.ITEMS`; the RP-B defect persists
  for any other `LIVE_STATE`-tagged structural change.

- **DO-3 — RP-B (sidepanel) vs RP-E (newtab) cross-surface asymmetry.** On a
  floating-set change, newtab full-rebuilds (`newtab.js:740-746`) while sidepanel
  patches at the static anchor. The two surfaces implement DIFFERENT rules for the
  same broadcast — exactly the cross-surface divergence the B-148 §68 / B-124 §61
  cross-surface-diff discipline exists to catch (`CLAUDE.md` R3 "Cross-surface diff
  self-check").

- **DO-4 — broadcast `SCOPE` tag as an implicit order authority.** The full-vs-
  incremental decision is encoded in the `SCOPE` enum at each `broadcast()` call
  site (`tab-events.js` opener-inherited was `SCOPE.LIVE_STATE`, now `SCOPE.ITEMS`;
  `MUTATION_BROADCASTS` maps message types to scopes at `storage-handlers.js:124-146`).
  The tag lives far from the order logic; mis-tagging a structural change as
  `LIVE_STATE` routes the sidepanel to the order-ignoring RP-B. There is no
  single place that asserts "structural change ⇒ renderOrder-respecting render."

- **DO-5 — bootstrap fallback re-derivation (OA-1/OA-2 → display).** When a group's
  `renderOrder` is empty/missing, `resolveRenderOrder` reverts to sortOrder order
  (`render-order.js:63-73`). If `renderOrder` is ever cleared — the stale-ref sweep
  strips ALL refs, a race empties it, or a corrupt-patch recovery — the next render
  silently reverts to sortOrder, which may have drifted from the user's last
  renderOrder. The fallback is a safety net AND a divergence surface.

- **DO-6 — OA-4 open-tab order vs floating membership, double-home.** A tab that is
  a floating member is excluded from Open Tabs by `collectFloatingTabIds` →
  `buildOpenTabs` exclusion (`floating-members.js:176-185`, `open-tabs.js:43`). The
  exclusion runs at `MSG_LIST_ITEMS` build time. Between the SW event that creates
  a floating record and the next list build, a tab can appear in BOTH the floating
  zone and Open Tabs — the display-order analogue of B-173's D-4 identity
  double-home (`docs/design/74...:246-253`).

- **DO-7 — `renderAll`'s own redundant sort.** `renderAll` sorts `byGroup` by
  `Item.sortOrder` (`sidepanel.js:2245-2247`) and `buildFloatingMembers` sorts by
  `FloatingGroup.sortOrder` (`floating-members.js:152-163`), then
  `buildGroupSection` calls `resolveRenderOrder` which **discards both orders** when
  renderOrder is present. Dead work that also encodes the false impression that
  sortOrder drives display — a maintenance trap (a future edit "fixing" the sort
  would have no effect, or worse, would matter only on the fallback path).

**Pattern (identical to B-173):** five of the seven drift points exist because
order is *re-derived* (by sortOrder, by static-anchor position, by scope-tag
routing) instead of *read from one authority*. The render-path hotfix sequence
(§68.8 `renderOrderChanged` predicate, §68.9 commits `51f0db6`/`db8f13e`, and now
B-184) is all adjudication machinery for disagreements a single authority + a
single render contract would make impossible.

---

## §77.5 — Single-source-of-truth target for display order

**`Group.renderOrder` becomes the sole PERSISTED display-order authority for
in-group content (saved items + floating tabs); `Item.sortOrder` and
`FloatingGroup.sortOrder` are demoted from independent display authorities to
bootstrap-only seeds (the field stays on disk for migration safety but is never
read for display once renderOrder exists); the incremental render path RP-B is
made renderOrder-respecting — or deleted in favor of always-full-render on
structural change — so it can never disagree with RP-A; and `(windowId, tabIndex)`
remains the SEPARATE ephemeral ordering authority for the Open Tabs section.** The
inversion mirrors B-173 exactly: order derivation moves off the hot render path
(every broadcast) onto a one-shot bootstrap path (cold-start only), and the "which
render path runs" decision stops being a free `SCOPE`-tag choice and becomes a
single enforced contract: *any structural change renders via `resolveRenderOrder`.*

Precise target:

1. **Persistence layer.** `renderOrder` is sole. `Item.sortOrder` /
   `FloatingGroup.sortOrder` are written-but-not-read-for-display (Option A,
   §77.7 B-190) — OR derived from the renderOrder index at write time so they can
   never skew (a stricter variant). No write site re-derives display order from
   sortOrder; `resolveRenderOrder`'s bootstrap branch is the ONLY sortOrder reader.

2. **Render layer (the single contract).** Every drag/move/reorder and every
   structural tab event funnels through ONE renderOrder-mutation contract
   (`updateGroup({renderOrder})` for in-group order; the existing 12-site
   `writeTransaction` discipline) AND broadcasts a scope that routes to a
   renderOrder-respecting render. RP-B either (a) computes its insert index from the
   group's `renderOrder` (consult `resolveRenderOrder` for position, not
   `staticAnchor`) so new rows land correctly, or (b) is removed and structural
   changes always take RP-A — matching newtab's RP-E full-rebuild escape hatch. The
   `renderOrderChanged`/`canPatch` gate (`sidepanel.js:7270-7295`) is generalized so
   that *membership* changes (new/removed floating rows), not only `renderOrder`
   array changes, force the full path.

3. **Open-tab layer (unchanged).** `(windowId, tabIndex)` stays the Open Tabs
   authority. It is NOT folded into renderOrder (§77.6).

End-state: ONE persisted display authority (`renderOrder`) + ONE ephemeral
open-tab authority (`(windowId,tabIndex)`) + render paths that cannot diverge
because in-group position is always computed from `renderOrder`, never
re-derived. Two shadow authorities (OA-1/OA-2) demoted to bootstrap seeds; one
render-path defect (RP-B) closed; one implicit authority (the scope tag)
constrained by an enforced structural-change ⇒ full-render rule.

---

## §77.6 — The floating-vs-open question (product-owner asked explicitly)

**Recommendation: KEEP the two models SEPARATE at the data/persistence/ordering
layer, but UNIFY the cheap duplication — the live-tab DESCRIPTOR and the live-tab
ROW builder/patcher.** This is the B-173 lesson applied verbatim: B-173 collapsed
the identity/resolution layer into one resolver but deliberately KEPT `LiveTabIndex`
as a distinct oracle because it answers a categorically different question
(`docs/design/74...:134-151`). The same applies here.

Definitions (confirmed in code):

- **Floating tab** = a live tab with a `tj:floatingGroups` record anchoring it to a
  parent saved item inside a group (born from opener-chain inheritance or demote).
  Renders as a synthetic row UNDER its parent group, interleaved via `renderOrder`.
  Descriptor: `FloatingMember` (`floating-members.js:30-45`) — carries
  `parentItemId`, `sortOrder`, `floatingTabId`, plus the live fields.
- **Open tab** = a live tab NOT claimed by a saved item AND NOT a floating member
  (`buildOpenTabs` exclusion, `open-tabs.js:34-54`). Renders in the separate Open
  Tabs section, ordered by `(windowId, tabIndex)`. Descriptor: `OpenTab` — the
  same live fields MINUS `parentItemId`/`sortOrder`/`floatingTabId`.

### §77.6.1 — Three strongest reasons to KEEP them separate

1. **The persistence boundary is real and load-bearing.** Floating records PERSIST
   in `tj:floatingGroups` and re-associate across reload/restart via the entire
   B-121/B-137/B-148/B-180 machinery (the 3-tier join, `liveTabId`, cold-start
   `reassociateFloatingGroups`). Open tabs are **zero-storage, purely ephemeral** —
   derived live from `LiveTabIndex` on every `MSG_LIST_ITEMS`. Unifying forces one
   of two bad outcomes: (a) start persisting open-tab order — but the order key is an
   ephemeral `tabId`/`tabIndex` that rotates on every restart, so "persisted open-tab
   order" is meaningless across the exact boundary that matters, and it adds storage
   churn on every tab move; or (b) make floating ephemeral — losing the cross-reload
   re-association that four sprints of work built. Neither is acceptable.

2. **The ordering authorities answer genuinely different questions.** Floating order
   = user-defined `renderOrder` (a deliberate interleave under a parent, persisted).
   Open order = `(windowId, tabIndex)` = the browser's own tab strip, self-maintaining
   and mirroring reality. Forcing open tabs into `renderOrder` means either fighting
   the browser (the user reorders a row but the tab strip says otherwise) or writing
   back `chrome.tabs.move` on every reorder (a new write surface + a new failure mode
   + C-13 event-feedback burden). The two orders are not the same kind of fact.

3. **The semantic/UX distinction is intentional and already correctly modeled.**
   Floating = "in the family" (has a `parentItemId` + `groupId`). Open = "the
   unaffiliated tray." A tab crosses the boundary ONLY via an explicit drag — and
   that path already exists: `moveFloatingTab` handles ATTACH (open→floating) and
   DETACH (floating→open) between Open Tabs and a group
   (`floating-groups-mutations.js:359-360,394-416`). The boundary is a feature, not
   an accident, and it has a working transition.

### §77.6.2 — What SHOULD be unified (the cheap, safe win)

There is real, citable duplication that unification SHOULD collapse — without
touching the model boundary:

- **The descriptor.** `FloatingMember` and `OpenTab` share every live field
  (`tabId`, `windowId`, `tabIndex`, `url`, `title`, `favIconUrl`, `audible`,
  `active`). Extract ONE `LiveTabDescriptor` base; floating extends it with
  `parentItemId`/`sortOrder`/`floatingTabId`.
- **The row builder/patcher.** `buildFloatingTabRow` ≈ `buildOpenTabRow`, and
  `patchFloatingMembersSections` **already reuses** `_patchOpenTabRow`
  (`sidepanel.js:3314`) — the duplication is half-collapsed already. Finish it: ONE
  row builder + ONE patcher, parameterized by descriptor kind.
- **The classifier.** "is this live tab claimed / floating / open" is decided in
  `buildFloatingMembers` + `collectFloatingTabIds` + `buildOpenTabs` as a 3-way
  filter over the same `LiveTabIndex` population. Name it once (one `classifyLiveTab`
  / one build pass) — analogous to B-173's single resolver.

This is a Tier-A refactor (B-188, §77.7): it removes duplication and shrinks the
render surface WITHOUT collapsing the persistence/ordering models, so it carries
none of the unification risk while capturing most of the maintenance benefit. It
also directly de-risks B-185 (ungrouped floating), which will need the floating
row to render outside a `Group.renderOrder` owner — a unified descriptor/row makes
that a smaller change.

**Net floating-vs-open verdict: keep the models separate (persistence + ordering +
semantics all differ); unify the descriptor + row builder + classifier. Do NOT
fold open-tab order into `renderOrder`.**

---

## §77.7 — Phased sub-item split (for [scrum-master] / product-owner)

Proposed IDs B-186…B-191 (B-185 is the current highest). Tier-A = safe refactors
+ the safety net first; Tier-B = the structural collapse; Tier-C = full field
removal, deferred.

| ID | Name | Maps to | Tier | Behavior change? | Depends on | Risk |
|----|------|---------|------|------------------|------------|------|
| **B-186** | Render-order PARITY integration test net (full path RP-A/RP-D vs incremental RP-B/RP-E produce identical DOM order for the same seeded state; mock-reproducible subset of the B-184 class) | A0 analogue | **M** | No (test-only) | — | **Low**. Pure test. The safety net — nothing structural proceeds until this exists + passes against current code. |
| **B-187** | Make `patchFloatingMembersSections` (RP-B) renderOrder-respecting: NEW floating rows insert at the renderOrder-correct index, not `staticAnchor`; generalize the B-184 fix so a mis-tagged `LIVE_STATE` structural change can't drop rows at the bottom | A1 (the direct fix) | **M** | **Yes (render-position bugfix)** | B-186 | **Low-Med**. Touches the hottest sidepanel patch path; UAT-verifiable; guarded by B-186. |
| **B-188** | Unify the live-tab descriptor + row builder/patcher + classifier (`FloatingMember`≈`OpenTab`, `buildFloatingTabRow`≈`buildOpenTabRow`, the 3-way classify) — the §77.6.2 cheap win | floating-vs-open (keep-separate, unify-cheap) | **M** | No (pure refactor) | B-186 | **Low-Med**. Mechanical extraction; cross-surface (sidepanel+newtab) diff discipline applies. De-risks B-185. |
| **B-189** | Broadcast-`SCOPE` classification audit: enumerate every `broadcast()` call site, classify structural (renderOrder/membership) vs non-structural (liveState), document the canonical table, add the structural⇒full-render assertion in both render listeners | A3 analogue (name the fan-out) | **S/M** | No (audit + comments; ≤2 re-tags possible) | B-186 | **Low**. Closes DO-4; the B-184 mis-tag is the motivating precedent. |
| **B-190** | Retire `Item.sortOrder` + `FloatingGroup.sortOrder` as DISPLAY authorities — `Group.renderOrder` becomes sole persisted display SSOT; sortOrder demoted to bootstrap-seed (Option A: keep field, stop reading for display) | B1 (the real collapse) | **L** | **Yes (storage semantics)** | B-186, B-187, B-189, **B-183** (validator coordination), **B-185** (ungrouped-anchor model) | **High**. The structural collapse. UAT-heavy; entangled with two in-flight items. Needs a B1-style spike-confirm first. |
| **B-191** | Collapse the render contract: delete/neutralize the divergent incremental path on structural change (always full-render structural; incremental only for non-structural in-place patches) | B1 finalize | **M/L** | **Yes (render path)** | B-190 | **Med-High**. Decide whether RP-B earns its keep (perf) or is removed once B-187 makes it equivalent. |

**Tier-C deferrals (NOT split here; return to BACKLOG icebox):**

- **Full removal of the `sortOrder` fields from the schema** (v9→v10 eager
  migration + `isItem` validator change — `Item.sortOrder` is REQUIRED today at
  `shapes.js:205`). Gated on B-190 baking one sprint with clean signal, exactly as
  B-183 gates on B-180. Pair this with B-183's floatingGroups validator tighten so
  the two schema touches land together.
- **Folding open-tab order into `renderOrder`** — rejected (§77.6); revisit only if
  product demand for cross-section interleave surfaces.

### §77.7.1 — Interaction with the filed B-183 + B-185

- **B-183** (delete the floating fallback tiers + tighten the `tj:floatingGroups`
  validator, post-B-180-bake) is IDENTITY-side but touches the **same floatingGroups
  shape/validator** B-190 demotes (`FloatingGroup.sortOrder`). The Tier-C field
  removal MUST coordinate with B-183's validator tighten — do them in one schema
  touch, not two. B-190 (Option A, keep-field) does not conflict; only the Tier-C
  field-removal does.
- **B-185** (ungrouped floating support) needs a floating row to render under a
  TOP-LEVEL bookmark that has **no `Group.renderOrder` owner** (`BACKLOG.md:196`
  enumerates this exact gap: ungrouped items don't have renderOrder). If display
  order collapses to renderOrder-only (B-190), B-185 must FIRST establish an
  anchoring mechanism for the ungrouped section (a sentinel/null-group renderOrder
  owner, or a per-item order). **B-190's SSOT design must account for the ungrouped
  case, or B-185 must land first.** B-188 (unified descriptor/row) reduces B-185's
  surface either way. Recommend co-designing B-190 + B-185, or sequencing B-185
  before B-190.

---

## §77.8 — Recommended execution sequence

Mirrors B-173's §74.9 (safety net → consolidating refactor → spike-confirm →
behavior-changing collapse in its own sprint):

1. **B-186 (test net) FIRST** — the render-order parity net. Nothing structural
   proceeds until it exists and passes against current code (it would have caught
   B-184 at the mock-reproducible layer).
2. **B-187 (the direct fix)** — make RP-B renderOrder-respecting. Stops the bleeding
   generally (not just for opener-inherited); guarded by B-186. High value, low risk.
3. **B-188 + B-189 (parallelizable refactors)** — unified descriptor/row +
   broadcast-scope audit. Both M/S, behavior-preserving; interleave as capacity allows.
4. **Spike-confirm B1** — a short [solution-architect] pass after B-187/B-188 land:
   re-verify the B-190 collapse against the now-consolidated render layer, and
   resolve the B-185 ungrouped-anchor interaction, BEFORE committing the storage-
   semantics change.
5. **B-190 (the collapse)** — sole persisted display authority. In its OWN sprint,
   after B-183 bakes and the B-185 model is decided. Full UAT.
6. **B-191 (render-contract collapse)** — last, after B-190.

**Sprint-fit recommendation:** B-186 + B-187 + B-188 + B-189 are a clean, mostly-
low-risk Tier-A sprint that hardens the render layer and prevents B-184-class
regressions — do these NOW while the B-173 playbook is fresh. Defer B-190 + B-191
(the behavior-changing L items) to a later sprint that follows B-183 + B-185, per
P-1 (max one L/XL active). **This is incremental, not a single epic** (§77.10).

---

## §77.9 — Schema / migration / rollback (C-1a / C-1b)

| Sub-item | Persisted shape change? | KNOWN_VERSION | Strategy | Rollback |
|----------|------------------------|---------------|----------|----------|
| B-186 (test net) | No | 9 (unchanged) | n/a | n/a |
| B-187 (RP-B fix) | No | 9 | n/a | git revert (render-only) |
| B-188 (unify descriptor/row) | No | 9 | n/a | git revert (pure refactor) |
| B-189 (scope audit) | No | 9 | n/a | git revert |
| B-190 (sortOrder demote, **Option A**) | **No** — sortOrder FIELDS stay on disk; only the READ-for-display semantics change (renderOrder sole reader). | 9 (unchanged) | n/a (no shape change — a read-path/semantics change, not a storage change) | git revert restores sortOrder-as-display-fallback; renderOrder data is a superset, no loss. |
| B-191 (render-contract collapse) | No | 9 | n/a | git revert |
| **Tier-C** (full `sortOrder` field removal) | **Yes** — drop `Item.sortOrder` (REQUIRED→gone) + `FloatingGroup.sortOrder`; tighten `isItem`/floatingGroups validators | **9→10** | **Eager** `MIGRATION_STEPS` v9→v10 stripping the fields + validator tighten | Revert to v9 needs the field re-stamped; bootstrap-from-renderOrder can regenerate it. **Pair with B-183.** |

**C-1a/C-1b verdict:** the entire B-186…B-191 program ships with **NO schema bump**
under the recommended Option A. `Group.renderOrder` and both `sortOrder` fields
already exist on the v9 shape; B-190 changes only which one is *read for display*,
not the stored shape — that is a semantics change, not a `tj:meta` schema concern
(directly analogous to B-179's session-retirement needing no bump,
`docs/design/74...:500`). The ONLY bump in the whole display-order program is the
**Tier-C field removal (v9→v10, eager)**, deferred and paired with B-183 — which
requires, in lock-step: `KNOWN_VERSION` 9→10 (`migration.js`),
`defaultShape(PARTITION_META)` literal 9→10 (`shapes.js:171`), a v9→v10
`MIGRATION_STEPS` eager entry, the `isItem` REQUIRED-field change, the five
schema-version test pins (`tests/migration-fresh-install.test.js`,
`tests/b148-schema-v7.test.js`, `tests/sync-schema-v5.test.js`, etc.), and a
CHANGELOG SW module-cache flush note (toggle OFF→ON in `edge://extensions`).

**Rollback discipline:** B-190 Option A reverts cleanly (sortOrder still on disk,
re-reading it for display is the pre-change behavior). The forward-fix policy
(S38–S47) applies: any non-data-loss render-order issue is patched forward on
`release/v2`, not rolled back.

---

## §77.10 — Risk flags & open questions

### Top 3 risk flags

- **Risk-1 — Display positioning is UAT-only; `chrome-mock` cannot fully reproduce
  the two render paths diverging.** The B-184 bug shipped through the FULL SUITE
  GREEN because the tests asserted SW `renderOrder` correctness, not the rendered
  DOM order under an incremental `LIVE_STATE` broadcast (the RP-B `staticAnchor`
  insert + the broadcast-scope routing need real DOM + real broadcast timing). The
  parity net (B-186) closes the mock-reproducible subset — it asserts RP-A and RP-B
  produce IDENTICAL DOM order for the same state — but the cross-broadcast routing
  + focus/timing classes remain real-browser-only (Edge UAT). Budget UAT generously
  on B-187 and B-190.

- **Risk-2 — `Item.sortOrder` is a REQUIRED field with deep coupling.** It is
  required by `isItem` (`shapes.js:205`), stamped by `createItem`, sorted in
  `renderAll` (`:2245`), written by `bulkReorderItems`, and pinned by dozens of test
  fixtures. "Retiring it as a display authority" (B-190) must be scoped to *stop
  reading it for display* (Option A), NOT *remove the field* — a literal reading
  that deletes the field breaks `isItem` + every fixture. This is the B-173
  Option-A-vs-Option-B lesson re-applied (`docs/design/74...:301-327`): collapse at
  the read/semantics layer first; defer the field removal to a separate gated
  Tier-C bump. The contract-vs-implementation narrowing gate (`CLAUDE.md` B-170)
  applies — "sole display authority" must not silently narrow to "sole authority,
  field deleted."

- **Risk-3 — B-190 is entangled with two in-flight items (B-183 + B-185).** B-183
  tightens the same floatingGroups validator B-190 touches; B-185 needs an
  ungrouped-anchor model that renderOrder-sole-authority does not yet provide
  (ungrouped items have no `Group.renderOrder` owner — `BACKLOG.md:196`). Doing
  B-190 in isolation risks a design collision with both. Mitigation: the B1-style
  spike-confirm (step 4) runs AFTER the Tier-A refactors AND after the B-185 model
  is decided; the Tier-C field removal pairs with B-183 in one schema touch.

### Recommend epic NOW vs defer?

**Recommend INCREMENTAL, not an epic-now.** Reasoning: (1) the B-184 fix already
stopped the user-visible bleeding; (2) the highest-value, lowest-risk next step is
the Tier-A bundle (B-186 net + B-187 the general RP-B fix + B-188/B-189 refactors)
— a clean 3-4 item sprint that hardens the render layer and prevents the NEXT
mis-tagged-broadcast B-184; (3) the genuine structural collapse (B-190/B-191) is
entangled with B-183 + B-185 and should WAIT for them, so opening a single
all-in-one epic now would force a premature sequencing of three interacting
storage/schema changes. This mirrors B-173 §74.9 Risk-1 (Tier-A now; the
behavior-changing collapse in its own later sprint with full UAT). The display-order
problem IS the same class B-173 solved for identity, but it is **less acute** (the
authority — `renderOrder` — already exists and already wins; the work is demoting
shadows + closing one render-path defect, not building a new authority), so it
earns incremental treatment rather than a parallel XL epic.

### Open questions (product-owner input before B-190 R1)

- **Q1 (timeline):** Tier-A-now-as-a-small-sprint + Tier-B-later (recommended) vs a
  single multi-sprint display-order EPIC? R0 recommends the former (Risk-3).
- **Q2 (sortOrder model):** Option A (keep the `sortOrder` fields, stop reading for
  display — no schema bump, recommended) vs going straight to the Tier-C field
  removal (v9→v10 eager, bigger blast radius, breaks `isItem` REQUIRED)? Decide
  before B-190.
- **Q3 (B-185 sequencing):** design B-190's SSOT WITH the ungrouped-anchor case, or
  land B-185 first to establish the ungrouped renderOrder-owner model? They interact
  directly.
- **Q4 (RP-B fate):** after B-187 makes the incremental path renderOrder-respecting,
  does it earn its keep on perf grounds, or should B-191 delete it and always
  full-render structural changes (matching newtab's RP-E)? A perf measurement on a
  500-item collection (the §Performance budget) decides this.

---

## §77.11 — Sign-off and next round

- **R0 outputs:** this chapter (§77).
- **Display-order multi-homing map:** **4 order authorities** (`Item.sortOrder`,
  `FloatingGroup.sortOrder`, `Group.renderOrder`, `(windowId,tabIndex)`) applied
  through **5 render paths** (3 sidepanel + 2 newtab). Two authorities (OA-1/OA-2)
  are redundant shadows of OA-3; one render path (RP-B) bypasses OA-3 for new rows
  (the B-184 defect); the two surfaces disagree on the incremental rule (DO-3); the
  broadcast `SCOPE` tag is an implicit fifth authority (DO-4). **7 drift points
  catalogued.**
- **SSOT target:** `Group.renderOrder` = sole persisted display authority; the two
  `sortOrder` fields demoted to bootstrap seeds; RP-B made renderOrder-respecting
  (or deleted); `(windowId,tabIndex)` kept separate for Open Tabs.
- **Floating-vs-open:** **KEEP separate** (persistence + ordering + semantics all
  genuinely differ); **unify the descriptor + row builder/patcher + classifier**
  (the cheap, safe win that de-risks B-185).
- **Sub-item split:** B-186…B-191 (4 Tier-A + 2 Tier-B); Tier-C field removal
  deferred + paired with B-183.
- **Schema-bump verdict:** **NO bump** for the whole B-186…B-191 program under
  Option A; the only bump (v9→v10 eager) is the deferred Tier-C field removal.
- **Recommendation:** **incremental, not epic-now** — Tier-A bundle as a near-term
  sprint; Tier-B collapse in its own later sprint after B-183 + B-185.
- **Recommended next step:** [scrum-master] reviews the Q1–Q4 product-owner
  questions, then (if Tier-A approved) routes **B-186 (parity test net) to R1** as
  the first sub-item (safety net before any render-path change), with B-187 R1
  following. B-190/B-191 R1s gate on the post-Tier-A spike-confirm + the Q2/Q3
  decisions.

**End of §77.**
