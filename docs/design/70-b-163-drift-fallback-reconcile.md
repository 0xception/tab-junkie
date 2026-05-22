# §70 — B-163 — Drift URL Fallback on Cold-Start Re-Association

**Status:** R2 LOCKED — Sprint 45 (v1.40.0 target, 2026-05-21).
**Anchor:** B-163 (P2 / M). Sibling of B-164 (chapter §69, reserved — not yet authored).
**Tier:** Full pipeline (M).
**Depends on:** §10.5 (LiveTabIndex & TabClaims architecture — defines `claimsMirror`, `reconcileClaims`, `releaseClaimByTab`); §10.7 (Drift Detection Architecture — the **invariant** "drift records only exist for claimed items" that B-163 preserves with surgical timing change, NOT contract change); §46 (B-099 — Option B claim preservation; four-trigger release surface; the runtime D-1 contract that the cold-start path must mirror); §53 (B-110 — §53 paired-clear; the contract whose TIMING B-163 modifies); §65 (B-132 — cold-start claim-jump fix + inherited-tab Phase-2 skip precedent at `tab-claims.js:188-206` that B-163 mirrors in Phase-3); B-149 ✅ (Phase-1 URL-drift survival contract — `tabEntry && item` predicate; no design chapter, see `docs/BACKLOG.md:184` + `CHANGELOG.md:142`).
**Author:** [solution-architect] (Opus). Written BEFORE R3 build per S44 retro action item 1 (chapter-first).

**Out-of-scope (explicit):**
(a) re-introducing URL-match as a Phase-1 survival predicate — B-149 specifically inverted that and `tests/b149-drifted-claim-survives-cold-start.test.js:94-170` regression-guards it;
(b) `detectDriftForTab` runtime logic — `background/tabs/drift.js:29-59` unchanged;
(c) drift record schema — no new fields, no `KNOWN_VERSION` bump (C-1a + C-1b both N/A; lazy reuse of existing `{itemId, driftedToUrl, detectedAt}` shape at `background/storage/shapes.js:258-282`);
(d) `manifest.json` permission additions — none;
(e) new message types or message-payload shape changes — none. `reconcileClaims` is a SW-internal function with no message surface;
(f) TTL on drift records used as Phase-3 fallback keys — AC7 RESOLVED 2026-05-21 (product-owner picked option (i) NO TTL; rely on AC2 primary-URL-wins + AC3 one-tab-per-drift-record cap as sufficient hijack mitigations). Future-work hook documented in §70.11;
(g) B-164 (sleep/wake desync — sibling, chapter §69) — disjoint event boundary;
(h) C-14 generation-counter discipline — `reconcileClaims` runs at cold-start before any consumer reads; no concurrent reader; no counter needed.

---

## §70.1 — Problem statement

Today the cold-start re-association loop in `background/tabs/tab-claims.js`
`reconcileClaims` is a **two-phase pipeline**:

| Phase | What it does | Predicate | Source |
|-------|--------------|-----------|--------|
| 1 | Validate persisted claims | `tabEntry && item` (B-149 inverted to drop URL-match clause) | `tab-claims.js:152-161` |
| 2 | Assign unclaimed items to unclaimed tabs by URL | `safeNormalizeForMatch(item.url) === normalized` | `tab-claims.js:163-212` |
| §53 paired-clear | Drop drift records for every evicted item | unconditional `clearDrift(itemId)` per evicted | `tab-claims.js:223-225` |

Under MV3 the SW idles after ~30 s and cold-starts when any tab event
fires. **B-149** (S41) closed the case where a drifted-but-live claim
loses tracking across an SW idle restart — the tab is still alive in
`LiveTabIndex`, the persisted claim points at it, Phase 1 keeps it.

**B-163 closes a different case**: when the SW idles AND the live tab is
ALSO torn down between idle and the next cold-start (the SW slept, the
user closed the tab, the SW slept-and-respawned on a different event, the
user opened a fresh tab at the same drifted URL). The user-visible bug:

1. Saved item X has `item.url = https://github.com/repos/A`.
2. The claimed tab navigates to `https://github.com/repos/B`. Runtime
   `detectDriftForTab` writes `tj:drift['X'] = {driftedToUrl: 'https://github.com/repos/B'}`.
   `claimsMirror['X'] = tabId(N)`. UI shows X as live + drifted.
3. SW idles. User closes tab N. SW wakes. `chrome.tabs.onRemoved` did NOT
   fire while the SW was asleep — the claim-release + `clearDrift` chain
   at `tab-events.js:319,419` never ran. `claimsMirror['X']` still
   points at the dead tabId N; `tj:drift['X']` still holds the drift
   record.
4. User opens a fresh tab at `https://github.com/repos/B` (the drifted
   URL — could be from a Ctrl+Shift+T undo, an opener-chain
   inheritance, or simply navigating back to the page they were
   reading). Tab gets a fresh tabId M.
5. Next event wakes the SW for real: cold-start. `reconcileClaims` runs.
6. **Phase 1** at `tab-claims.js:152-161`: `tabEntry = index.get(N)` →
   `undefined` (N is dead). X is added to `evictedItemIds`. X is NOT in
   `reconciled`.
7. **Phase 2** at `tab-claims.js:163-212`: builds `urlToTabs` against
   `safeNormalizeForMatch(entry.url)` from `LiveTabIndex`. Tab M's URL
   is `https://github.com/repos/B`. `item.url` for X is
   `https://github.com/repos/A` — Phase 2's lookup MISSES.
   X stays unbound. Tab M stays unclaimed.
8. **§53 paired-clear** at `tab-claims.js:223-225`: unconditional
   `clearDrift('X')` fires. The drift record is gone. Even a subsequent
   navigation back to `repos/B` cannot recover X's association with M
   via the drift partition (no record to consult).
9. `buildOpenTabs` at `background/tabs/open-tabs.js:34-63`: tab M passes
   the `claimedTabIds` filter (no claim), passes the floating filter
   (no floating record), and shows as an unclaimed live tab in the Open
   Tabs section. X renders as offline.

The user's mental model — "I had a tab on this drifted URL, and my
bookmark was tracking it" — is broken on every cold-start. The drift
information that would close the loop (`tj:drift['X'].driftedToUrl =
'https://github.com/repos/B'`) was discarded at step 8 before any code
path could use it for re-binding.

**The architectural framing:** `reconcileClaims` Phase 2 has access to
exactly one URL candidate per item — `item.url`. The drift partition
records the OTHER candidate the user is most likely to be viewing
post-restart — `driftedToUrl`. B-163 reads the drift partition as a
secondary URL-candidate source for evicted items, **after** Phase 2's
primary `item.url` pass, **before** any drift drops. The §53 invariant
("drift records only exist for claimed items") is preserved by
deferring the drop until after the secondary pass has either re-bound
the item (drift naturally clears on the next `detectDriftForTab` cycle)
or confirmed that BOTH URLs failed (drift truly orphaned, safe to drop).

---

## §70.2 — R0 option analysis and R2 PICK

The BACKLOG row for B-163 (`docs/BACKLOG.md:197`) pre-enumerated three
R0 candidates. The joint B-164 + B-163 R0 spike (`docs/findings/sprint-45.md`
§ "B-163 R0 Decision") locked option (a) on 2026-05-21. R1 ACs were
locked same day (`docs/findings/sprint-45.md` § "R1 LOCKED"). AC7
(TTL question) was the only open product-owner decision; resolved
same day, NO TTL.

### §70.2.1 — Options enumerated

| # | Option | Surface | Risk | R0 disposition |
|---|--------|---------|------|----------------|
| (a) | Defer §53 paired-clear + Phase-3 drift-URL fallback + Phase-4 conditional drift drop | `reconcileClaims` only | LOW — algorithmic; preserves §10.7 invariant by deferring drop ONE phase; no schema change | **PICKED** |
| (b) | Phase-2 fallback lookup — after `item.url` URL→tabIds lookup misses, try `driftedToUrl` in the same Phase-2 loop body | `reconcileClaims` Phase 2 inner loop | MEDIUM — fuses two concerns (primary + fallback) in one pass; harder to reason about AC2 precedence (primary always wins); §53 paired-clear timing still must change OR the drift is dropped before Phase 2's fallback can read it | Rejected — same surface as (a) with worse separation-of-concerns |
| (c) | Persist `lastClaimedUrl` rolling field on Items, separate from drift partition | New `Item.lastClaimedUrl` field, schema bump v7→v8, migration, validator extension, write-site enumeration across every claim-mutation path | HIGH — schema bump, cross-cutting write-site discipline, decouples claim-tracking from drift-state-lifecycle but introduces a redundant data trail | Rejected — speculative-generality; no second consumer; schema-bump cost asymmetric with delivered value |

### §70.2.2 — R2 PICK: option (a)

**Rationale (one sentence):** option (a) is the smallest algorithmic
extension that satisfies all 7 R1 ACs by reading drift records as a
secondary URL-candidate source after Phase 2 misses, with the existing
`urlToTabs` map already in hand, no schema change, no new message
contract, and the only structural change being the **timing** of the
existing §53 `clearDrift` calls — same calls, deferred one phase, gated
on a content predicate.

**Why not (b).** Fusing the primary `item.url` pass and the fallback
`driftedToUrl` pass in one Phase-2 loop body forces AC2 (primary URL
always wins) into in-loop precedence logic that is harder to read and
test, and forces the §53 paired-clear timing to change anyway (the drop
must happen AFTER the fallback). Option (a) lifts the fallback into its
own clearly-named Phase 3 with the same `urlToTabs` map; AC2 is
trivially satisfied because Phase 3 only runs for items NOT YET BOUND
after Phase 2. The two passes share a data structure but not a control
flow — a strictly cleaner decomposition.

**Why not (c).** Persisting `lastClaimedUrl` on every Item record is a
v7→v8 schema bump, a multi-write-site discipline burden (`createItem`,
`updateItem`, every `reevaluateTab`-triggered auto-claim — at minimum
4 sites; per the C-1a + C-1b precedent in §68 B-148 this is a 12-site
audit minimum), and creates a redundant data trail (drift partition
already knows the most-recent-pre-eviction URL; adding `lastClaimedUrl`
duplicates that signal at higher storage cost). The asymmetry — schema
bump + migration + cross-cutting writes vs. a single algorithmic
extension in one function — fails the smallest-fix principle.

### §70.2.3 — R2 Correctness Checklist application

| Check | Applies? | Status |
|-------|----------|--------|
| **C-1a/b** — Storage schema version + migration strategy | NO. Drift record shape `{itemId, driftedToUrl, detectedAt}` is unchanged. `KNOWN_VERSION` stays at 7 (no `background/storage/migration.js` change). `defaultShape(PARTITION_DRIFT)` remains `{}` (no per-version split). The drift partition is a **read-only consumer change** inside `reconcileClaims` — Phase-3 reads via the existing `getDriftRecords()` helper at `background/tabs/drift.js:102-104`, no new writer, no new field. Both C-1a (governance) and C-1b (data-strategy) are formally N/A; no migration is required. |
| **C-2** — Message contracts typed | N/A. `reconcileClaims` is a SW-internal function called from `background/tabs/index.js` `initializeLiveState`; it has no message surface. No `MSG_*` constant added, no `shared/messages.js` change, no payload shape change. |
| **C-3** — SW cold-start safe | YES. `reconcileClaims` IS the cold-start path. The new Phase 3/4 logic lives entirely inside that path; no module-scoped state added, no assumption that the SW was already running. `getDriftRecords()` reads from `chrome.storage.local` (persistent across SW restarts AND browser restarts) — the data is guaranteed present at cold-start when it would have been useful pre-eviction. |
| **C-4** — ID stability | YES. `itemId` is ulid-stable (B-001a); `driftedToUrl` is normalized at write time via `normalizeUrl({forStorage:true})` (`drift.js:46-53`) and re-normalized for match via `safeNormalizeForMatch` (`shared/url.js:65-72`). Phase-3's lookup keys are identical-form to Phase-2's. The `itemId` join key is the same one Phase-1 used to add the eviction to `evictedItemIds`. |
| **C-5** — Manifest file references | N/A. No manifest changes. |
| **C-6** — Permission minimization | N/A. No new permissions. |
| **C-7** — Allow-list direction | YES. Phase 3 reads the drift partition and filters strictly by (a) `itemId in drift`, (b) `safeNormalizeForMatch(driftedToUrl)` lookup in `urlToTabs` (a Map already populated only by URL-matchable live tabs in Phase 2), (c) inherited-tab skip per AC5. Every gate is an inclusion-allow predicate. The shape validator at `shapes.js:258-282` already rejects malformed drift records on read; corrupt entries cannot reach Phase 3. No deny-list semantics introduced. |
| **C-8** — SW-context feasibility | N/A. No browser API additions. Phase 3 uses only `Map.get`, `Array.shift`, and the existing `getDriftRecords()` helper. |
| **C-9** — Empty-state design | YES. Five enumerated empty-states reasoned in §70.6: (i) no drift records at all (Phase 3 no-op fast-path); (ii) drift record exists but its `driftedToUrl` matches no live tab (Phase 4 clears, item stays unclaimed → renders as offline correctly); (iii) drift record's `driftedToUrl` matches an inherited tab (AC5 — skip; pop candidate but do not bind; if no other candidate remains, item stays unclaimed); (iv) two items' drift records collide on the same `driftedToUrl` with only one live tab (AC3 — first qualifier in sortOrder pops; second iteration finds empty list and stays unclaimed; Phase 4 clears the second's drift); (v) both `item.url` AND `driftedToUrl` have a live tab (AC2 — Phase 2 binds primary; Phase 3 never runs for this item). |
| **C-10** — Off-screen rect feasibility | N/A. No DOM / canvas / drag work. |
| **C-11** — Popup-lifecycle message ordering | N/A. No popup-side dispatch. |
| **C-12** — Manifest declaration runtime-mutability | N/A. No manifest declaration. |
| **C-13** — Chrome event-feedback completeness | YES — verified no new write API → no new listener required. The B-163 fix is purely a consumer of (`getDriftRecords`) and a writer to `claimsMirror` via the existing `writeClaims()` path at `tab-claims.js:103-105`. Drift records continue to be written by `detectDriftForTab` and cleared by `clearDrift` from the four existing surfaces: `tab-events.js:319,419` (`tabs.onRemoved`, `windows.onRemoved` per-tab loop), `storage-handlers.js:272` (`MSG_UPDATE_ITEM` post-`url`-patch inline clear per B-099 D-2), `storage-handlers.js:461` (`MSG_DELETE_ITEM` cascade per B-110 §53 hardening), `storage-handlers.js:559` (`MSG_NAVIGATE_TO_ITEM` AC3 stale-claim repair per B-110 §53.3). Phase 4 in `reconcileClaims` is the fifth and final clear surface; it replaces (not adds to) the §53 paired-clear at `tab-claims.js:223-225`. No new chrome event listener is required. |
| **C-14** — Generation-counter content predicate | N/A. `reconcileClaims` runs once at cold-start before any consumer reads `claimsMirror` (per the `claimsReady` flip at `tab-claims.js:216`); no concurrent reader; no counter trip surface. The `_cachedItemsGen` counter (per B-148 §68.8.1) is consumed by the sidepanel renderer downstream of `MSG_LIST_ITEMS`; B-163's writes to `claimsMirror` complete BEFORE the first `MSG_LIST_ITEMS` dispatch can return. |
| **C-15** — Browser-API rejection-string contract verification | N/A. No `_classifyError` substring predicates added. `clearDrift` is best-effort with `Promise.allSettled` (existing pattern preserved). |

---

## §70.3 — Architecture

### §70.3.1 — Phase 3 (drift-URL fallback sweep)

**Purpose:** for each item evicted in Phase 1 AND not bound in Phase 2,
consult its drift record (if any) and attempt to bind the item to a
live tab whose URL matches `driftedToUrl` — using the same
`urlToTabs` map Phase 2 already built.

**Inputs (already in scope at the call site):**

- `evictedItemIds: string[]` — populated by Phase 1 at `tab-claims.js:159`. Pre-existing.
- `reconciled: Record<string, number>` — populated by Phase 1 + Phase 2. Pre-existing.
- `claimedTabIds: Set<number>` — populated by Phase 1 + Phase 2. Pre-existing.
- `urlToTabs: Map<string, number[]>` — built in Phase 2 at `tab-claims.js:165-176`. Pre-existing; reused.
- `inheritedTabs` (module-private `Set<number>`) — populated by `preMarkInheritedFromFloatingGroups`; consumed by Phase 2 at `:200`. Pre-existing; reused.
- `items: Array<{id, url, sortOrder}>` — the function parameter. Pre-existing.

**New inputs:**

- `driftRecords: Record<string, {itemId, driftedToUrl, detectedAt}>` — fetched via a single `await getDriftRecords()` call. Cached locally for the loop.

**Algorithm (SKETCH, 5-15 LOC — actual code is R3):**

```js
// Phase 3 (B-163): drift-URL fallback. Runs ONLY for items still unbound
// after Phase 2. Skipped entirely if no items were evicted in Phase 1 OR
// no items remain unbound after Phase 2.
const stillUnbound = evictedItemIds.filter((id) => !(id in reconciled));
let driftRebound = []; // itemIds bound in Phase 3 (consumed by Phase 4 gating)

if (stillUnbound.length > 0) {
  const driftRecords = await getDriftRecords(); // single read, drift.js:102-104
  // Iterate in sortOrder so that drift hijack-collisions resolve deterministically.
  const itemBySortOrder = items
    .filter((it) => stillUnbound.includes(it.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  for (const item of itemBySortOrder) {
    const record = driftRecords[item.id];
    if (!record) continue; // no drift candidate → cannot recover
    const normalized = safeNormalizeForMatch(record.driftedToUrl);
    if (!normalized) continue;
    const available = urlToTabs.get(normalized);
    if (!available || available.length === 0) continue;
    // AC5: inherited-tab skip (mirrors Phase-2 while-loop at :198-206).
    let claimedTabId = null;
    while (available.length > 0) {
      const candidate = available[0];
      if (inheritedTabs.has(candidate)) { available.shift(); continue; }
      claimedTabId = available.shift();
      break;
    }
    if (claimedTabId !== null) {
      reconciled[item.id] = claimedTabId;
      claimedTabIds.add(claimedTabId);
      driftRebound.push(item.id);
    }
  }
}
```

**Why iterate in sortOrder.** AC3 caps "one tab per drift record"; the
hijack collision case (two items drifted to the same URL, only one live
tab) requires a deterministic precedence. Phase 2's first-unclaimed-wins
loop at `:178-181` already uses `sortOrder ascending` — Phase 3 uses
the same ordering for consistency. This makes Phase 3's behavior
predictable in the rare two-items-one-tab case.

**Why reuse `urlToTabs`.** The map is built once in Phase 2 from the
live tab set minus tabs already claimed in Phase 1. Phase 3 needs the
same set (live tabs minus tabs already claimed in Phase 1 OR Phase 2,
which the map naturally reflects after Phase 2's `available.shift()`
pops). Building a second map would double the cost and risk drift between
the two views.

**Why the `getDriftRecords()` call is single and conditional.** The
read is bounded by the `stillUnbound.length > 0` gate. The typical case
(every Phase-1-evicted item is re-bound in Phase 2, OR no items were
evicted) skips the read entirely. When the read IS made, it is a
single `chrome.storage.local.get('tj:drift')` round-trip — same cost
as the existing `MSG_LIST_ITEMS` driftRecords fetch
(`storage-handlers.js:292`).

### §70.3.2 — Phase 4 (conditional drift drop)

**Purpose:** drop drift records for evicted items that are STILL
unbound after Phase 3 — i.e. drift is truly orphaned, no live tab
matches either URL, no recovery is possible.

**Replaces (not adds to):** the unconditional `clearDrift` block at
`tab-claims.js:223-225`. That block currently fires for every
`evictedItemIds` entry. Post-B-163, the block fires only for items
that BOTH (a) were evicted in Phase 1 AND (b) were not bound by
Phase 3.

**Algorithm (SKETCH):**

```js
// Phase 4 (B-163): conditional drift drop. Replaces the unconditional
// §53 paired-clear. An item enters Phase 4 only if Phase 1 evicted it
// AND Phase 3 could not recover it. Both URL candidates failed — drift
// is truly orphaned; safe to drop per §10.7 invariant.
const unrecovered = evictedItemIds.filter((id) => !(id in reconciled));
if (unrecovered.length > 0) {
  await Promise.allSettled(unrecovered.map((itemId) => clearDrift(itemId)));
}
```

**Why `Promise.allSettled` is preserved.** The B-110 §53 contract used
`allSettled` so that an individual `clearDrift` failure does not block
reconcile completion. B-163 preserves this — same best-effort semantic,
same retry-on-next-cold-start fallback if any clear fails.

**Why the `unrecovered` recomputation is necessary.** `evictedItemIds`
is populated only in Phase 1; the boundary between Phase 3's binds and
the remaining unrecovered items is the `reconciled` map. Recomputing
the filter post-Phase-3 is cheaper (O(N)) than threading a parallel
`driftRebound` set forward — and it preserves the "single source of
truth" invariant (which items are bound is determined by `reconciled`,
nothing else).

### §70.3.3 — Pre-existing §53 paired-clear deferral

**What was §53 doing.** §53 (B-110, S36) added the
`evictedItemIds` collection in Phase 1 AND the unconditional
`Promise.allSettled(evictedItemIds.map(clearDrift))` block after
`writeClaims()` resolves. The intent: enforce the §10.7 invariant
("drift records only exist for claimed items") at the cold-start
boundary, preventing orphan drift records from persisting past a
cold-start reconcile.

**What changes about the §53 contract post-B-163.** The CONTRACT is
preserved — drift records still cannot persist for items that have no
live claim. The TIMING shifts: instead of an unconditional drop the
moment Phase 1 evicted an item, the drop is deferred until BOTH the
primary `item.url` (Phase 2) AND the secondary `driftedToUrl`
(Phase 3) have been tried. The invariant is asserted at the END of
`reconcileClaims`, not in the middle.

**Post-B-163 §53 narrative.** §53's chapter (`docs/design/53-b-110-drift-non-live-fix.md`)
should be cross-referenced from §70 but does NOT need a textual edit
inside its own chapter — the §53 PRIMARY-leak fix continues to apply
verbatim (the leak path is the same; what changes is the recovery
attempt that runs before the drop). When B-163 ships, the §53 R6
narrative becomes "B-110 added the paired-clear; B-163 deferred its
timing by one phase to enable drift-URL fallback re-binding before the
drop." A one-line cross-reference is added to §53 at R6 close.

**Why §53 still passes.** The §53 PRIMARY-leak test
(`tests/b110-drift-non-live-fix.test.js:217-241` T4) seeds the scenario
"claim persisted, drift record persisted, tab GONE, no live tab matches
the drifted URL" — under B-163's Phase 3, no candidate is found in
`urlToTabs` (the mock has zero tabs), Phase 3 does not bind, Phase 4
fires `clearDrift` for the item. The assertion `'item-A' in drift ===
false` continues to hold. §53's spirit — drift cannot persist past a
failed reconcile — is preserved.

### §70.3.4 — Drift partition shape unchanged

The `tj:drift` partition shape remains `Record<string, {itemId,
driftedToUrl, detectedAt}>` per `background/storage/shapes.js:258-282`.

- **No new fields.** B-163 reads only `itemId` (implicit — it is the
  key) and `driftedToUrl`. `detectedAt` is NOT consulted (AC7 RESOLVED:
  no TTL).
- **No version bump.** `KNOWN_VERSION` remains 7 (per the B-148 S44
  bump). No `MIGRATION_STEPS` entry. No `defaultShape` update for
  `PARTITION_META`. The B-159 / B-148 four-time precedent for
  schema-bump discipline is NOT triggered here.
- **No validator change.** The existing `assertShape(PARTITION_DRIFT,
  value)` block at `shapes.js:258-282` continues to enforce the same
  field contract (itemId string, driftedToUrl string with valid scheme
  + length ≤ MAX_URL, detectedAt number, key === itemId).
- **No write-site change.** `writeDrift` at `drift.js:67-79` and
  `clearDrift` at `drift.js:86-96` are unchanged. The B-163 fix is
  read-only on the drift partition (Phase 3) and reuses the existing
  `clearDrift` writer (Phase 4) — same `writeTransaction` path.

C-1a (governance — `KNOWN_VERSION` bump) is N/A because shape is
unchanged. C-1b (data-migration strategy) is N/A for the same reason.
Both checklist items are formally answered "not applicable" in §70.2.3.

---

## §70.4 — Shared invariant with B-164 (claim-mirror authoritativeness)

The joint R0 spike (`docs/findings/sprint-45.md` § "Cross-Item
Analysis") identified one shared invariant that both B-163 and B-164
must cite verbatim, because both items operate on different boundaries
of the same claim-mirror lifecycle:

> **Claim-mirror authoritativeness.** `claimsMirror[itemId] === tabId`
> is true iff (a) the tab exists in `LiveTabIndex` AND (b) the item
> exists in `tj:items`, regardless of URL drift state (the B-149 §41
> contract). B-164 enforces this by **remapping** the mirror when
> Chromium rotates the tabId on discard/restore; B-163 enforces this
> by **re-establishing** the mirror when neither side existed at
> reconcile time but a drift-URL match exists.

B-163's contribution to the invariant: when Phase 1 evicts an item
because the persisted tabId is dead, the mirror entry is gone — but
the AUTHORITY (a fresh live tab whose URL matches the item's drift
record) may still be present. Phase 3 reads that authority from the
drift partition and re-establishes the mirror entry. The invariant
post-Phase-3 says: every entry in `claimsMirror` corresponds to a real
tab in `LiveTabIndex` AND a real item in `tj:items`, regardless of
whether that tab's CURRENT URL matches the item's CURRENT URL (drift
is independent — owned by `detectDriftForTab`).

B-164's chapter §69 (reserved, not yet authored) MUST cite the same
invariant in its own §69.4. The two chapters share the invariant but
NOT the implementation — they operate on disjoint event boundaries
(B-164 = within-session OS sleep; B-163 = full browser restart /
SW idle + tab teardown). No cross-chapter implementation coupling.

---

## §70.5 — Fix scope: code + test enumeration

Per the `CLAUDE.md` "Fix-scope test-assertion enumeration" mandatory
subsection — this section enumerates EVERY file R3 touches AND every
test file that asserts a pre-change contract that needs updating.
**R3 cannot start until this enumeration is verified 100% complete.**

### §70.5.1 — Code files touched

| # | File | Lines (approx) | Change |
|---|------|----------------|--------|
| 1 | `background/tabs/tab-claims.js` | `121-226` | Insert Phase 3 (drift-URL fallback) between Phase 2 and `claimsMirror = reconciled` (currently `:214`). Replace the unconditional `Promise.allSettled(evictedItemIds.map(clearDrift))` at `:223-225` with Phase 4 (`Promise.allSettled(unrecovered.map(clearDrift))` after computing the post-Phase-3 unrecovered set). Add `getDriftRecords` to the existing `import { clearDrift } from './drift.js'` at `:14` (single import update). JSDoc at `:107-120` extended to describe Phases 3 + 4. |
| 2 | _(none)_ | _(none)_ | `background/tabs/drift.js` unchanged — Phase 3 consumes the existing `getDriftRecords()` helper. Phase 4 consumes the existing `clearDrift()` helper. |
| 3 | _(none)_ | _(none)_ | `background/storage/shapes.js` unchanged — drift record shape and validator unchanged. |
| 4 | _(none)_ | _(none)_ | `background/storage/migration.js` unchanged — no `KNOWN_VERSION` bump. |
| 5 | _(none)_ | _(none)_ | `shared/url.js`, `shared/messages.js` unchanged — Phase 3 uses the existing `safeNormalizeForMatch` helper. |
| 6 | _(none)_ | _(none)_ | `background/messages/storage-handlers.js` unchanged — the MSG_LIST_ITEMS drift consumer at `:292` continues to read drift records the same way; the drift-bar UI per B-110 §53 continues to render correctly because the drift record is preserved across reconcile when the item is re-bound. |
| 7 | _(none)_ | _(none)_ | `sidepanel/sidepanel.js`, `newtab/newtab.js`, `popup/popup.js` unchanged — no UI surface change. |
| 8 | _(none)_ | _(none)_ | `manifest.json` unchanged — no new permissions. |

**Total code surface:** 1 file modified (`tab-claims.js`), approximately
+30 / -3 LOC net (the §53 unconditional clearDrift block deletes; Phase
3 + Phase 4 add). One added import. One JSDoc block extended.

### §70.5.2 — Test files that pin pre-change contracts (MUST update / VERIFY)

Per the CLAUDE.md subsection format: `file:line — asserts <pre-change contract>; update to <post-change contract>`.

| # | Test file:line | Asserts (pre-B-163) | Update or VERIFY-no-change (post-B-163) |
|---|----------------|---------------------|------------------------------------------|
| 1 | `tests/b110-drift-non-live-fix.test.js:217-241` (T4) | "B-110 PRIMARY: drift record for evicted claim MUST be cleared (pre-fix this would have remained as #657b83-style orphan)" — seeds claim+drift, mock-tabs empty, asserts `'item-A' in drift === false` after `reconcileClaims`. The docstring at `:34-37` describes the PRE-B-163 §53 paired-clear MECHANISM ("paired-cleared drift").| **VERIFY-no-change in assertion** (still passes because Phase 4 fires when Phase 3 finds no candidate). **UPDATE the docstring** at `:36-37` and the inline comment at `:6-13` to describe the new mechanism: "drift record for evicted-AND-unrecovered claim MUST be cleared (B-163: Phase 4 fires when both Phase 2 primary URL and Phase 3 drift URL fail)." The PRIMARY leak fix continues to apply; the mechanism is now Phase 4, not §53 paired-clear. |
| 2 | `tests/b110-drift-non-live-fix.test.js:299-331` (T6) | "B-110 (legitimate eviction): missing-tab eviction still clears the paired drift record" — two items, item-A's tab alive (B-149 survival), item-B's tab GONE, no live tab at item-B's drifted URL, asserts `'item-A' in drift === true` AND `'item-B' in drift === false`. | **VERIFY-no-change in assertion** (still passes — item-B's drift URL `https://drifted-b.com/` has no live tab in the mock, Phase 3 misses, Phase 4 clears). **UPDATE the inline docstring** at `:291-298` similarly — "B-163: Phase 4 fires when both URL candidates fail". |
| 3 | `tests/b149-drifted-claim-survives-cold-start.test.js:177-206` (T2) | "B-110 PRIMARY (still applies post-B-149): missing-tab eviction continues to drop the claim" + "B-110: drift record paired-cleared on legitimate (missing-tab) eviction" — same shape as b110 T4. | **VERIFY-no-change in assertion** (Phase 3 has no candidate; Phase 4 clears). **UPDATE the inline docstring** at `:199` to read "B-163: Phase 4 fires when both URL candidates fail". |
| 4 | `tests/b149-drifted-claim-survives-cold-start.test.js:94-170` (T1) | B-149 primary repro: drifted-but-live claim SURVIVES cold-start; drift record retained. | **VERIFY-no-change** — Phase 1 keeps the claim (B-149 contract intact); Phase 3 never runs for this item (already in `reconciled`); Phase 4 sees the item is in `reconciled` so does not clear. No assertion change, no docstring change. This is the AC6 regression guard at the test-source level. |
| 5 | `tests/b149-drifted-claim-survives-cold-start.test.js:214-238` (T3) | Happy-path: URL-matching live claim survives Phase 1. | **VERIFY-no-change** — Phase 1 keeps the claim; Phase 3 never runs; Phase 4 no-op. |
| 6 | `tests/b149-drifted-claim-survives-cold-start.test.js:248+` (T4) | Durability: drifted claim survives 2 successive cold-start reconciles. | **VERIFY-no-change** — same reasoning as T1 (Phase 1 keeps the claim across two cycles). |
| 7 | `tests/tab-claims-reconcile.test.js:14-49` | "AC2 (post-B-149): reconcileClaims drops claims for missing tabs but PRESERVES URL-mismatched-but-live claims (B-099 D-1 cold-start)" | **VERIFY-no-change** — the URL-mismatched-but-live claim is NOT evicted by Phase 1 (`tabEntry && item` is true), so does not enter Phase 3. The stale-tab claim (tabId 999) IS evicted by Phase 1; no drift record is seeded; Phase 3 finds no record for it; Phase 4 has nothing to clear. Both outcomes match the existing assertion. |
| 8 | `tests/tab-claims-reconcile.test.js:51-68` | "AC2: unclaimed items are re-claimed in sortOrder (first-unclaimed-wins)" | **VERIFY-no-change** — pure Phase 2 path, no eviction, no drift, no Phase 3 / 4 invocation. |
| 9 | `tests/tab-claims-reconcile.test.js:70-78` | claimsReady flips after `reconcileClaims([])` | **VERIFY-no-change** — empty items, no eviction, Phase 3 / 4 no-op. |
| 10 | `tests/tab-claims-reconcile.test.js:80-90` | H3 buildLiveStates returns all-false before reconcile | **VERIFY-no-change** — does not invoke reconcile. |
| 11 | `tests/session-wipe-reclam.test.js:14-40` | "AC8: session wiped — `reconcileClaims` rebuilds from scratch" | **VERIFY-no-change** — empty session, Phase 1 has zero entries to evict, Phase 3 / 4 no-op (no drift records seeded). |
| 12 | `tests/session-wipe-reclam.test.js:42-59` | "AC8: no stale claims" | **VERIFY-no-change** — same reasoning. |
| 13 | `tests/drift-clear.test.js` (3 tests) | Runtime `detectDriftForTab` clear-on-navigate-back paths (`reconcileClaims` is called once for initial claim establishment but no drift exists at that point). | **VERIFY-no-change** — Phase 3 / 4 are not in scope for these tests; runtime drift detection path is unchanged. |
| 14 | `tests/drift-persist.test.js` (entire file) | Drift record write + persistence semantics. `reconcileClaims` is called for initial setup. | **VERIFY-no-change** — these tests assert that `writeDrift` persists; B-163 does not change the writer. |
| 15 | `tests/drift-write.test.js` (entire file, ≥5 tests) | Drift write path semantics: only on URL mismatch, fragment-only no-op, AC6 unclaimed no-op. | **VERIFY-no-change** — runtime drift write path is unchanged. |
| 16 | `tests/drift-floating-perf.test.js` | Performance budget on `reconcileClaims` + drift detection at scale. | **VERIFY-no-change** OR **MINOR UPDATE** — Phase 3 adds at most one additional `getDriftRecords()` call per cold-start, gated on `stillUnbound.length > 0`. The perf budget should still hold (drift partition is bounded; the existing budget assumes a single drift read in `MSG_LIST_ITEMS`). R5 [test-engineer] confirms via re-run. If the assertion threshold is tight, the test may need a 5-10% margin bump — left to R5 verification. |
| 17 | `tests/claims-perf.test.js:14-44` | "AC10: reconcileClaims with 500 items and 50 tabs completes in under 50ms" | **VERIFY-no-change** OR **MINOR UPDATE** — no drift records are seeded in this test, so Phase 3's `stillUnbound.length > 0` gate prevents the `getDriftRecords()` read entirely; Phase 4 sees empty `unrecovered` set (Phase 1 evicts zero items because the test seeds matching tabs+items). The 50ms budget should hold trivially. R5 [test-engineer] re-runs; if any margin pressure surfaces, bump by 5ms (one drift read overhead allowance). |
| 18 | `tests/b011-drift.test.js`, `tests/b099-drift-fix.test.js`, `tests/b101-drift-bar.test.js` | Drift UI and write semantics under the older drift-fix specs. | **VERIFY-no-change** — none of these test files exercise `reconcileClaims` Phase 1/2/3/4 transitions; they pin runtime detect/clear and UI render. |

**Grep audit confirms the universe** (run during R2):

```
$ grep -ln "reconcileClaims" tests/
b110-drift-non-live-fix.test.js
b125-claim-jump-fix.test.js
b132-cold-start-inheritance.test.js
b149-drifted-claim-survives-cold-start.test.js
claims-perf.test.js
drift-clear.test.js
drift-floating-perf.test.js
drift-persist.test.js
drift-write.test.js
session-wipe-reclam.test.js
tab-claims-disambiguation.test.js
tab-claims-reconcile.test.js
```

Two files in the universe NOT enumerated above:
- `tests/b125-claim-jump-fix.test.js` — B-125 / §59 opener-chain inheritance tests. `reconcileClaims` is called as part of test setup but the assertions pin opener-chain Set behavior, NOT Phase 1/2/3/4 transitions. **VERIFY-no-change** — Phase 3's inherited-tab skip per AC5 is a pure-inclusion guard; no `b125` assertion is invalidated.
- `tests/b132-cold-start-inheritance.test.js` — B-132 / §65 cold-start claim-jump fix. Same shape as b125 — exercises `preMarkInheritedFromFloatingGroups` and the Phase-2 inherited-tab skip. **VERIFY-no-change** — Phase 3 mirrors the same skip per AC5, no regression.
- `tests/tab-claims-disambiguation.test.js` — multi-claim disambiguation by sortOrder. **VERIFY-no-change** — no drift seeded, no Phase 3 entry, pure Phase 2.

**Summary:** 0 test files require an assertion change. 3 test files require docstring updates only (T4 + T6 in b110, T2 in b149) — the assertions all continue to pass because Phase 3 (no live tab at the drifted URL in those scenarios) falls through to Phase 4 (which clears the drift exactly as the §53 paired-clear used to). R3 cannot start until this enumeration is verified by [solution-architect] / acknowledged in the test docstring updates.

### §70.5.3 — New test file (R5)

| File | Estimated LOC | Cases (planned) |
|------|---------------|-----------------|
| `tests/b163-drift-fallback-reconcile.test.js` | ~250 | T1–T8 mapped to AC1–AC7 + AC7-NO-TTL guard + Phase-4 deferral guard. Detailed in §70.9.1. |

### §70.5.4 — Shared-surface consumer inventory (MANDATORY per CLAUDE.md)

Per the CLAUDE.md "Shared-surface consumer inventory" mandatory subsection
(applies because Phase 3 introduces a new READER of the drift partition
`tj:drift` inside `reconcileClaims`):

| Consumer | File:line | Direction | Coordination |
|----------|-----------|-----------|--------------|
| `detectDriftForTab` → `writeDrift` | `background/tabs/drift.js:29-79` | WRITE | Runtime URL-change event; single writer per `(tabId, url)` tuple; guarded by `getItemIdForTab` reverse lookup so unclaimed tabs no-op |
| `clearDrift` from `tab-events.js` `tabs.onRemoved` | `background/tabs/tab-events.js:319` | WRITE (delete) | Per-tab; runs after `releaseClaimByTab` resolves |
| `clearDrift` from `tab-events.js` `windows.onRemoved` per-tab loop | `background/tabs/tab-events.js:419` | WRITE (delete) | Per-tab; runs inside `Promise.allSettled` over removed tabs |
| `clearDrift` from `storage-handlers.js` `MSG_UPDATE_ITEM` inline | `background/messages/storage-handlers.js:272` | WRITE (delete) | Per B-099 D-2: gated on `patch.url` changed; runs after `updateItem` resolves |
| `clearDrift` from `storage-handlers.js` `MSG_DELETE_ITEM` cascade | `background/messages/storage-handlers.js:461` | WRITE (delete) | Per B-110 §53.3: best-effort; runs after `deleteItem` and `pruneFloatingGroupsByParentItemId` resolve |
| `clearDrift` from `storage-handlers.js` `MSG_NAVIGATE_TO_ITEM` AC3 stale-claim repair | `background/messages/storage-handlers.js:559` | WRITE (delete) | Per B-110 §53.3: runs after `releaseClaimByTab` in the stale-claim branch |
| `clearDrift` from `reconcileClaims` §53 paired-clear | `background/tabs/tab-claims.js:223-225` | WRITE (delete) — UNCONDITIONAL over `evictedItemIds` | **REPLACED by Phase 4 (B-163)**: same call site, same writer, but now gated on `unrecovered = evictedItemIds \ Phase-3-bound` |
| `MIGRATION_STEPS` partition reset on import (replace mode) | `background/import/commit.js:119` | WRITE (overwrite — `mutator: () => ({})`) | Atomic with the rest of the import transaction; replaces ALL drift records |
| `getDriftRecords` (UI enrichment) | `background/messages/storage-handlers.js:292` | READ | Per `MSG_LIST_ITEMS` dispatch; returns records to UI for drift-bar render per B-101 / B-110 |
| `getDriftRecords` (Phase 3 fallback) — **NEW (B-163)** | `background/tabs/tab-claims.js:~213` (insertion point) | READ | Per `reconcileClaims` cold-start; gated on `stillUnbound.length > 0`; single read per cold-start |

**Coordination mechanism for the new reader.** B-163's Phase-3 read is
**inside the single-cold-start window** (`reconcileClaims` is called
exactly once per cold-start by `initializeLiveState` per B-001c §10.5).
There is no concurrent reader inside the same window — `MSG_LIST_ITEMS`
cannot dispatch until `claimsReady = true` is set at `tab-claims.js:216`,
which happens AFTER Phase 4 in the post-B-163 sequence. There is no
concurrent writer inside the same window — the runtime writers
(`detectDriftForTab`, the four `clearDrift` callers) are gated on
chrome events that have NOT yet fired (the SW just woke; the listener
queue is empty until `reconcileClaims` resolves).

The only possible interleave is: SW wakes, `reconcileClaims` begins,
Phase 3 calls `getDriftRecords()` and the read is fulfilled, THEN a
chrome event listener fires (e.g. `tabs.onUpdated` for a URL change
that landed mid-cold-start). This is the same interleave that already
exists pre-B-163 — `reconcileClaims` Phase 1 reads `tj:tabClaims` from
`chrome.storage.session` while runtime listeners may begin firing.
The existing `claimsReady` flag is the synchronization primitive:
runtime writers' downstream consumers (`buildLiveStates` at
`tab-claims.js:320-355`) gate on `claimsReady === true` and return
all-false defaults until reconcile completes. Phase 3's drift read
does not change this contract — it just reads one more partition
inside the same single-owner window.

**No new generation counter required.** Per C-14: there is no
concurrent reader of `claimsMirror` during reconcile (the
`claimsReady` flag prevents `buildLiveStates` from returning live
data); there is no concurrent writer of the drift partition during
reconcile (the runtime writers are quiescent until reconcile
resolves and downstream listeners fire); no mid-sweep read can
observe a torn `claimsMirror` value.

**No race-condition class introduced.** B-163 does not weaken any
existing invariant. The post-B-163 sequence is strictly:
Phase 1 → Phase 2 → Phase 3 (single drift READ) → `writeClaims()` →
`claimsReady = true` → Phase 4 (drift WRITEs). The drift partition is
read and written within the same cold-start window, with no concurrent
consumer.

---

## §70.6 — Edge cases reconciled to R1 ACs

Per the R1 LOCKED block in `docs/findings/sprint-45.md` § "R1 LOCKED",
B-163 has 7 testable acceptance criteria. The design above satisfies
each as follows.

### §70.6.1 — AC1 (happy path: cold-start drift re-association via `driftedToUrl`)

Pre-condition: item X saved with `item.url = https://saved.com/A`; tab
drifts to `https://saved.com/B`; `detectDriftForTab` writes drift
record (`drift.js:54`); SW idles + cold-starts; tab is closed +
recreated (or surviving but Phase 1 evicted on `tabEntry` miss).

Design satisfies:
- Phase 1 at `tab-claims.js:152-161` evicts X (`tabEntry` missing) →
  `evictedItemIds.push('X')`.
- Phase 2 at `tab-claims.js:163-212` misses (`urlToTabs.get(safeNormalizeForMatch(item.url))` returns undefined
  OR returns an unrelated tab's tabId that is bound by a higher-priority item).
- Phase 3 at the new insertion point: reads `driftRecords` (single call);
  finds `driftRecords.X.driftedToUrl = 'https://saved.com/B'`; normalizes;
  `urlToTabs.get` returns `[M]` (M = the fresh tab at the drifted URL);
  inherited-tab skip passes (M is not in `inheritedTabs`); `available.shift()`
  pops M; writes `reconciled.X = M`.
- `writeClaims()` persists `claimsMirror.X = M`.

Post-render: `buildOpenTabs` sees M in `claimedTabIds`, excludes it from
the Open Tabs section. `buildLiveStates(X)` returns `{live: true,
tabId: M}`. The drifted bookmark renders as live + drifted.
**AC1 satisfied.**

### §70.6.2 — AC2 (primary `item.url` wins over drift URL when both match)

Pre-condition: item X has live tabs at BOTH `item.url` AND `driftedToUrl`.

Design satisfies:
- Phase 1 evicts X (the persisted tabId is dead, or X has no claim yet
  — both routes funnel into Phase 2's unclaimed set).
- Phase 2 at `:183-212` iterates items in sortOrder; for X, looks up
  `safeNormalizeForMatch(item.url)`, finds a candidate, pops it. X is
  in `reconciled` post-Phase-2.
- Phase 3's gate `stillUnbound.filter((id) => !(id in reconciled))`
  excludes X. Phase 3 never runs for X. The drift URL tab remains
  unclaimed at end of Phase 3 (subject to Phase 2 binding it to a
  different item OR remaining as an Open Tabs entry).

Primary URL always wins; no possibility of Phase 3 over-binding the
drift URL. **AC2 satisfied.**

### §70.6.3 — AC3 (one-tab-per-drift-record cap — hijack mitigation)

Pre-condition: items X + Y both have drift records pointing at the same
`driftedToUrl`; only one live tab post-restart.

Design satisfies:
- Phase 3 iterates `itemBySortOrder` deterministically; first qualifier
  (lower `sortOrder`) finds `urlToTabs.get(normalized) = [M]`, pops M
  via `available.shift()`, adds M to `claimedTabIds`. X (or Y, whichever
  has lower sortOrder) is bound.
- Second qualifier finds `urlToTabs.get(normalized) = []` (the list was
  mutated by Phase 3's shift). `available.length === 0`; the `if (!available
  || available.length === 0) continue;` early-return fires. Second item
  remains unbound; enters `unrecovered`; Phase 4 clears its drift.

Exactly one of X / Y binds. The second's drift is dropped (the live
tab was already claimed; the drift record is now genuinely orphaned).
**AC3 satisfied.**

### §70.6.4 — AC4 (drift dropped only when both URLs fail — §10.7 invariant preserved)

**Scenario A**: Phase 3 binds X.
- Phase 1 evicts X; Phase 2 misses; Phase 3 binds X to tab M.
- Phase 4's `unrecovered.filter((id) => !(id in reconciled))` excludes X.
  `clearDrift('X')` is NOT called.
- Drift record for X remains in `tj:drift` post-reconcile.
- On the next `detectDriftForTab` cycle (tab M is the same drifted URL),
  `claimedItemId = getItemIdForTab(M) = 'X'`; `normalizedSaved` !=
  `normalizedCurrent` (tab is at `driftedToUrl`, item is at `item.url`);
  `writeDrift` overwrites the existing record (same content, same
  timestamp updated). No invariant violation: drift records still
  correspond only to claimed items (X IS claimed by M).
- If the tab navigates back to `item.url`, `detectDriftForTab` calls
  `clearDrift('X')`. Standard runtime cleanup.

**Scenario B**: Phase 3 finds no live tab at `driftedToUrl`.
- Phase 1 evicts X; Phase 2 misses; Phase 3 finds no candidate.
- Phase 4's `unrecovered.filter((id) => !(id in reconciled))` includes X.
  `clearDrift('X')` fires.
- Drift record for X is dropped. §10.7 invariant restored.

**Pass criteria.** Scenario A: drift record retained, claim re-established,
no orphan. Scenario B: drift record dropped, claim absent, no orphan.
**AC4 satisfied.**

### §70.6.5 — AC5 (inherited-tab skip in Phase 3 — parity with Phase 2)

Pre-condition: tab M is in `inheritedTabs` Set (per B-125 §59.3 / B-132
§65.5 cold-start re-association `preMarkInheritedFromFloatingGroups`).
M's URL matches a drift record's `driftedToUrl`.

Design satisfies: Phase 3's `while (available.length > 0)` loop mirrors
Phase 2's `:198-206` exactly — inherited candidates are `available.shift()`-
popped without binding; the `continue` re-enters the loop with the next
candidate. If every candidate in the list is inherited, the inner loop
exits with `claimedTabId === null`; the outer `if (claimedTabId !==
null)` guard skips the `reconciled` write; the item stays in
`stillUnbound`. Phase 4 clears its drift if no other recovery path
exists (Scenario B above).

The B-125 / B-132 invariant — opener-chain-inherited tabs cannot
auto-claim a saved bookmark — is preserved at the Phase-3 boundary
identically to Phase 2. **AC5 satisfied.**

### §70.6.6 — AC6 (no regression on B-149 Phase-1 survival contract)

Pre-condition: stored claim `(itemId, tabId)` where tab URL drifted
away from `item.url` but tab exists + item exists.

Design satisfies: the B-149 contract lives at `tab-claims.js:155`
(`if (tabEntry && item)` predicate). B-163 does NOT touch this
predicate. The item is added to `reconciled` in Phase 1; it is not in
`evictedItemIds`; it does not enter Phase 3 or Phase 4. The drift
record (if any) is retained because Phase 4 only fires on
`unrecovered ⊆ evictedItemIds`.

Existing B-149 tests at `tests/b149-drifted-claim-survives-cold-start.test.js:94-238`
continue to pass without modification (per §70.5.2 #4-6).
**AC6 satisfied.**

### §70.6.7 — AC7 (TTL on drift records used as Phase-3 fallback keys)

**RESOLVED 2026-05-21 — product-owner picked option (i) NO TTL.** Rationale
per the R1 LOCKED block: rely on AC2 (primary URL wins) and AC3
(one-tab-per-drift-record cap) as sufficient hijack mitigations; simpler
implementation; lower regression surface.

Design satisfies: Phase 3 does NOT consult `record.detectedAt`. No
`Date.now()` comparison, no environment-time dependency, no TTL
configuration surface. Phase 3 evaluates every drift record for every
`stillUnbound` item regardless of record age.

**Residual hijack analysis.** Under no-TTL semantics, a months-old
drift record for item X (drifted to `https://github.com/issues/123`)
could match a freshly-opened tab at the same URL post-restart. Mitigations:

1. **AC2 primary-URL-wins** — if the user has visited `item.url` since
   the original drift AND the tab is still alive at `item.url`, Phase 2
   binds X to that tab; Phase 3 never runs for X. The drift URL tab is
   left unclaimed (becomes an Open Tabs entry) — correct outcome.
2. **AC3 one-tab-per-record-cap** — if two stale drift records point at
   the same fresh URL, only the first-by-sortOrder binds. The second's
   drift is cleared by Phase 4; no double-binding.
3. **Item deletion clears drift** — `MSG_DELETE_ITEM` cascade at
   `storage-handlers.js:461` runs `clearDrift(p.itemId)`. If the user
   deletes a saved item, its drift record is gone; no Phase 3 candidate.
4. **`MSG_UPDATE_ITEM` URL change clears drift** — B-099 D-2 inline
   clear at `storage-handlers.js:272`. If the user edits the bookmark
   URL (e.g. "Snap to this tab" per B-099), drift is cleared.
5. **Runtime navigate-back clears drift** — if the tab navigates back
   to `item.url` post-bind, `detectDriftForTab` clears the record.

A pathological case requires: (a) drift record exists for item X for an
extended period, (b) X's primary URL has no live tab at cold-start (Phase
2 misses), (c) the user opens a fresh tab at the drift URL that is
SEMANTICALLY UNRELATED to X (i.e., the user is no longer browsing X's
content but happens to be on the same domain/path). In this case X
would bind to the unrelated tab. **Recovery is trivial**: a user-facing
"Snap to this tab" action (B-099) OR an edit-URL action OR a tab close
+ reopen at `item.url` all restore correct association. The product-
owner accepted this residual risk.

**Future-work hook**: if the residual case becomes problematic, a single
date-comparison line in Phase 3 (`if (Date.now() - record.detectedAt > TTL_MS) continue;`)
restores TTL semantics without revisiting the broader design. See §70.11.

**AC7 satisfied** (NO-TTL design; mitigation chain documented; future-work
hook reserved).

---

## §70.7 — Rollback plan

**No rollback is required beyond reverting the commit.**

- **No schema change.** `tj:drift` shape unchanged; `KNOWN_VERSION`
  stays at 7. No `MIGRATION_STEPS` entry. No `defaultShape` update for
  `PARTITION_META`.
- **No migration.** No on-disk shape changes; no data eviction path.
- **No new permission.** `manifest.json` unchanged.
- **No new message type.** `shared/messages.js` unchanged.
- **No new public API.** `reconcileClaims` is SW-internal; its signature
  is unchanged.
- **Backward-compatible storage.** A v1.40.0 install reading a v1.39.0
  drift partition reads the same `{itemId, driftedToUrl, detectedAt}`
  shape it always has. A v1.39.0 install reading a v1.40.0 drift
  partition does the same — no field added, no field removed.
- **Forward-compatible behavior.** A v1.39.0 install runs the
  unconditional §53 paired-clear; any drift records dropped become
  unrecoverable, but no incorrect binding ever occurs (the pre-B-163
  behavior is "lose some recoverable claims" — never "make wrong
  claims"). Downgrade is safe.

**Rollback procedure:**
1. `git revert <B-163 commit SHA>` on `release/v2`.
2. The §53 paired-clear at `tab-claims.js:223-225` returns to
   unconditional form. Any drifted-but-tab-gone items at next cold-start
   will lose their drift records (the pre-B-163 leak path) and migrate
   to Open Tabs as unclaimed live tabs.
3. No storage-level cleanup required. Drift records that B-163 retained
   post-reconcile (Scenario A above) are continuously valid drift
   records (they correspond to claimed items, per §10.7 invariant);
   they will be cleared on next runtime navigate-back OR next cold-start
   missing-tab eviction. No orphan accumulates.
4. No SEV1 scenario plausible. The B-163 fix is purely additive recovery
   logic; reverting loses recovery but does not introduce data loss or
   incorrect binding.

Per §68.12 / §71.7 / S38–S44 established policy: forward-fix preferred;
revert is a clean undo with no data loss.

---

## §70.8 — Performance

**One additional `chrome.storage.local.get` call per cold-start, conditional
on Phase 1 having evicted at least one item that was not re-bound in
Phase 2.**

- **Phase 3 read cost**: a single `getDriftRecords()` call =
  `readPartition(PARTITION_DRIFT)` = one `chrome.storage.local.get('tj:drift')`.
  The drift partition typically holds 0-50 records (drift records are
  bounded by the number of currently-claimed-and-drifted items). Per the
  existing `MSG_LIST_ITEMS` enrichment at `storage-handlers.js:292`, this
  same read happens on every UI list dispatch and is already inside the
  documented perf budget (`docs/design/09-performance-standards.md`).
- **Phase 3 algorithmic cost**: O(M × C) where M = `stillUnbound.length`
  and C = average length of `urlToTabs` candidate lists. In the typical
  case `M ≤ 5` (few items lose their claim across cold-start) and
  `C ≤ 3` (few live tabs per URL). The cost is dominated by the existing
  Phase 2 loop, which already iterates the entire items array in
  sortOrder.
- **Phase 4 cost**: same as the pre-B-163 §53 paired-clear, but on a
  smaller set (`unrecovered ⊆ evictedItemIds`). Net storage writes are
  the same or fewer than pre-B-163 (each clearDrift is a writeTransaction).
- **Skip-path** (no Phase 1 evictions OR no drift records to consult):
  Phase 3 is gated by `stillUnbound.length > 0`; the `getDriftRecords()`
  read is skipped. Phase 4's `unrecovered` set is empty; the
  `Promise.allSettled([])` is a no-op.
- **Cold-start total budget**: per `docs/design/09-performance-standards.md`
  the cold-start path must hydrate UI in < 200ms first-paint on a
  500-item collection. The B-163 addition adds ~5-10ms in the worst
  case (single storage read + bounded loop) — well within budget.
  The `tests/claims-perf.test.js` 50ms `reconcileClaims` budget is
  expected to hold with no margin pressure (Phase 3 / 4 are no-ops
  in that test's seed).

**Net effect:** same or fewer storage writes than pre-B-163; one
additional bounded read in the eviction-recovery path; zero cost in
the no-eviction happy path.

---

## §70.9 — Tests planned for R5

Mirrors the §68.10 / §71.9 format. R5 [test-engineer] writes both
automated tests AND performs UAT.

### §70.9.1 — Automated tests (new file)

`tests/b163-drift-fallback-reconcile.test.js` — ~250 LOC, 8 cases:

| # | Case | Surface | Assertion |
|---|------|---------|-----------|
| T1 | AC1: cold-start drift re-association via `driftedToUrl` | end-to-end via `reconcileClaims` (`tests/b149-*` helper pattern) | Seed: `__setMockTabs([{id: 200, url: 'https://drifted.com/B'}])`, `__setSessionStore('tj:tabClaims', {'item-X': 999})` (dead tabId), `seedPartitions({items: [{id: 'item-X', url: 'https://saved.com/A', ...}], drift: {'item-X': {driftedToUrl: 'https://drifted.com/B', detectedAt: 1}}})`. After `reconcileClaims`: `__getSessionStore('tj:tabClaims')['item-X'] === 200` (Phase 3 bound). Drift record retained (`'item-X' in drift === true`). |
| T2 | AC2: primary `item.url` wins | end-to-end | Seed: `item-X` with `item.url = https://A.com`, drift to `https://B.com`; two live tabs (one at A, one at B). After reconcile: `claimsMirror['item-X'] === tabIdOfA` (Phase 2 bound to A, Phase 3 never ran for item-X). The B-tab remains unclaimed (visible as Open Tab) OR claimed by another item if one matches. |
| T3 | AC3: one-tab-per-drift-record cap | end-to-end | Seed: two items X (sortOrder 0) + Y (sortOrder 1) both with drift records pointing at the same `driftedToUrl`; one live tab at that URL. After reconcile: exactly one of X/Y is bound (by sortOrder: X). The other's drift is cleared (`'item-Y' in drift === false`). The bound tab is in `claimedTabIds` once. |
| T4 | AC4 Scenario A: Phase 3 binds → drift retained | end-to-end | Seed: same as T1. Assert: `'item-X' in drift === true` post-reconcile (Phase 4 did NOT clear because Phase 3 bound). |
| T5 | AC4 Scenario B: Phase 3 misses → drift dropped | end-to-end | Seed: item X with drift record, but NO live tab at either `item.url` OR `driftedToUrl`. After reconcile: `claimsMirror['item-X'] === undefined`, `'item-X' in drift === false` (Phase 4 cleared). |
| T6 | AC5: inherited-tab skip in Phase 3 | end-to-end | Seed: same as T1 but mark tab 200 as inherited via `markInherited(200)` before `reconcileClaims`. After reconcile: `claimsMirror['item-X'] === undefined` (Phase 3 skipped the inherited candidate; no other candidate available), `'item-X' in drift === false` (Phase 4 cleared per AC4 Scenario B). Inherited tab's status undisturbed (no claim entry binding it to item-X). |
| T7 | AC6: B-149 Phase-1 contract preserved (regression guard) | end-to-end | Seed: drifted-but-live claim (B-149 T1 pattern). After reconcile: claim survives Phase 1, drift retained, Phase 3 never runs for the item, Phase 4 never clears (per AC6). The B-149 test file `tests/b149-drifted-claim-survives-cold-start.test.js` is the authoritative regression suite; T7 here is a defense-in-depth duplicate. |
| T8 | AC7 NO-TTL guard | end-to-end | Seed: drift record with `detectedAt: 1` (epoch 1 ms, ~1970). Phase 3 should still evaluate it; assertion: same outcome as T1 (Phase 3 binds the matching live tab). Test the OTHER half: `detectedAt: Date.now()` (recent) — same outcome. The two cases produce identical behavior; if either changes outcome, NO-TTL contract is violated. |

### §70.9.2 — Existing test deltas (per §70.5.2)

| File | Δ LOC | Change |
|------|-------|--------|
| `tests/b110-drift-non-live-fix.test.js` | +5/-5 (docstring updates only) | Update T4 + T6 docstrings to describe Phase 4 mechanism; assertions unchanged. |
| `tests/b149-drifted-claim-survives-cold-start.test.js` | +1/-1 (docstring update only) | Update T2 docstring; assertion unchanged. |
| `tests/drift-floating-perf.test.js` | 0 or +1 margin bump | Verify perf budget holds; minor margin bump if needed. |
| `tests/claims-perf.test.js` | 0 or +1 margin bump | Same. |
| _(all other listed in §70.5.2)_ | 0 | VERIFY-no-change. |

### §70.9.3 — UAT script (planned, R5)

UAT script will be created at `docs/UAT_B-163.md` (mirroring
`docs/UAT_B-148.md` / `docs/UAT_B-110.md`) with the following test
cases:

1. **Happy path drift re-association across browser restart**: save a
   bookmark to `https://github.com/anthropic/claude` (or any safe
   domain). Click it from the sidepanel — tab opens, claim established.
   Navigate the tab to `https://github.com/anthropic/claude/issues`
   (a drift). Verify the drift bar appears on the bookmark row. **Close
   the browser entirely (Edge → File → Exit, or equivalent).** Re-open
   the browser. The tab strip will restore the tab at the drifted URL
   (per session restore). Open the sidepanel. Verify: the bookmark row
   shows as live (green border) AND drifted (drift bar). Open Tabs
   section does NOT contain the restored tab.
2. **No drift, no re-association**: save a bookmark; close the browser
   without opening the bookmark. Re-open the browser. Verify the
   bookmark renders as non-live (no green border, no drift bar); no
   incorrect binding occurred.
3. **Drift drop on truly orphaned record (Phase 4)**: save a bookmark
   to `https://saved.com/A`; click to open; navigate the tab to
   `https://saved.com/B`; verify drift bar appears. **Close the tab**.
   Close the browser. Re-open the browser (do NOT manually open any
   tab at `https://saved.com/B`). Open the sidepanel. Verify: the
   bookmark renders as non-live (no drift bar, no green border). Open
   SW console (`edge://extensions` → service worker inspect), run
   `chrome.storage.local.get('tj:drift', console.log)`. Verify:
   `tj:drift` does NOT contain a record for the bookmark (Phase 4
   cleared it).
4. **Primary URL wins (AC2)**: save bookmark with `item.url =
   https://A.com`; click to open; drift to `https://B.com`. Manually
   open a fresh tab at `https://A.com` in another window. **Toggle the
   extension OFF, then ON** (forces SW restart + cold-start
   reconcile). Open the sidepanel. Verify: the bookmark is bound to
   the `https://A.com` tab (Phase 2 won); the `https://B.com` tab is
   in Open Tabs.
5. **Inherited-tab skip (AC5)**: requires a manual opener-chain setup
   (sidepanel → open bookmark → from that tab, Ctrl+click a link;
   the new tab is inherited by the parent saved-item's floating
   group). Drift that new tab to a URL Z. Save a different bookmark
   with `item.url = Z`. Close + restart the browser. Verify: the
   inherited tab is NOT auto-claimed by the new bookmark (the
   inherited marker survives via floating-group cold-start
   re-association); the bookmark remains non-live.
6. **One-tab-per-drift-record cap (AC3)**: save two bookmarks X
   (sortOrder lower) + Y (sortOrder higher); click X, drift its tab
   to Z; click Y, drift its tab to Z (same URL). **Close one of the
   two tabs** (the user is left with one tab at Z; both bookmarks have
   drift records pointing at Z). Toggle the extension OFF/ON. Verify:
   exactly one of X/Y is bound to the remaining Z-tab (the
   sortOrder-lower one — X). The other's drift is cleared; it renders
   as non-live.
7. **NO-TTL guard (AC7)**: save a bookmark, drift it, close the
   browser, wait at least 7 days OR manually edit `tj:drift` in the
   SW console to set `detectedAt: 1` (epoch). Re-open the browser
   with the tab restored at the drifted URL. Verify: the bookmark
   re-binds to the drifted-URL tab (no TTL gate triggered).

UAT lean-mode smoke: case 1 with `prefersLean` ON; verify the
re-association still works (it should — `reconcileClaims` is
preference-independent).

---

## §70.10 — UAT plan (high-level)

Per the §70.9.3 cases above. Three risk areas to focus UAT instrumentation
on:

1. **Browser-restart reproducibility.** UAT cases 1, 3, 4, 6, 7 all
   require a full browser exit + restart. The MV3 SW cold-start path
   is the load-bearing primitive; if the user's environment (Edge vs
   Chrome vs Brave; session-restore on/off; private/normal window)
   affects whether `reconcileClaims` runs at the expected time, UAT
   may need an explicit toggle-OFF/ON shortcut as an alternative
   trigger (case 4 already uses this pattern).
2. **Drift partition observability.** UAT cases 3 and 7 require SW
   console inspection of `tj:drift`. R5 [test-engineer] should
   document a one-liner (`chrome.storage.local.get('tj:drift', r =>
   console.log(r))`) at the top of the UAT script.
3. **Inherited-tab manual repro.** UAT case 5 is the trickiest — it
   requires the user to build an opener-chain manually. If repro is
   unreliable, fall back to a code-level assertion via the automated
   T6 test and note "covered by automated test" in the UAT case.

Detailed UAT script with step-by-step actions deferred to R5 [test-engineer].

---

## §70.11 — Future work / known limitations

- **TTL hook for AC7.** If the AC7 product-owner decision is later
  reversed (drift-URL hijack becomes problematic in practice), the
  hook point is exactly one line inside Phase 3's per-record loop:
  ```js
  if (Date.now() - record.detectedAt > TTL_MS) continue;
  ```
  Inserting this after the `const record = driftRecords[item.id]; if
  (!record) continue;` guard would gate drift records by age. The
  `TTL_MS` constant could live in a new `background/tabs/drift.js`
  export or in a preference (per-user toggle). The existing AC4
  Scenario B path handles the skipped records correctly — Phase 4
  clears them on the next cold-start (the skip is observationally
  equivalent to "drift not found"). No design re-architecture needed;
  this is a single-line addition with one test.
- **Drift-URL as Phase 2 secondary on FIRST-run (not just eviction-
  recovery).** Today Phase 3 runs only for `evictedItemIds` — items
  that had a claim before reconcile. A fresh-install user who restores
  a `tj:drift` partition via import (`background/import/commit.js:119`
  zeroes the partition on replace-mode import; merge-mode preserves
  records) would have drift records but no prior claims; Phase 3
  would not run for them. The current scope (AC1) is "drifted-tab
  claims survive cold-start re-association" — fresh-install drift
  records without prior claims are out of scope. If this case becomes
  user-visible, Phase 3 could be widened to run for all items in
  `tj:items` (not just `evictedItemIds`); this is a one-line scope
  change (replace `evictedItemIds` with `items.map(it => it.id)`).
- **B-164 sibling.** The chapter §69 (B-164 sleep/wake desync) shares
  the claim-mirror-authoritativeness invariant per §70.4 but uses a
  disjoint mechanism (chrome.tabs.onReplaced listener + chrome.idle
  reconciler). B-164 R2 chapter will cite §70.4 verbatim. No
  cross-chapter implementation coupling; the two items can be merged
  in any order.
- **B-150 Q2 lost-sync continuation.** The B-149 hypothesis space
  (mechanisms a/b/d still open per `docs/BACKLOG.md:185`) remains an
  R0 spike candidate. B-163 narrows the explored surface: any "lost
  sync" symptom across a full browser restart that involved a drifted
  URL is now mitigated by B-163's Phase 3. If symptoms persist after
  B-163 ships, the B-150 Q2 mechanism space narrows accordingly.
- **No drift index by URL (read pattern).** Phase 3 reads
  `driftRecords` keyed by `itemId` and resolves URL → tab via
  `urlToTabs`. There is no inverse index `driftedToUrl → [itemId,...]`.
  In the rare two-items-one-URL collision (AC3), the iteration over
  `itemBySortOrder` is O(M); if the drift partition ever grows to
  thousands of records (it shouldn't — drift is bounded by claimed
  items), the cost may become noticeable. Out of scope for B-163;
  filed as a low-priority optimization candidate.

---

## §70.12 — Files to be touched (R3 summary, for the handoff)

**Source code (modified):**

- `background/tabs/tab-claims.js` — `reconcileClaims` at `:121-226`:
  add `getDriftRecords` to the existing drift.js import; insert Phase
  3 (drift-URL fallback sweep) between Phase 2 and `claimsMirror =
  reconciled` (currently `:214`); replace the unconditional §53
  paired-clear at `:223-225` with Phase 4 (conditional drift drop on
  `unrecovered` set). JSDoc at `:107-120` extended to describe the
  4-phase pipeline.

**Source code (new):** _none_

**Source code (unchanged):** `background/tabs/drift.js`,
`background/storage/shapes.js`, `background/storage/migration.js`,
`background/messages/storage-handlers.js`, `shared/url.js`,
`shared/messages.js`, `background/tabs/floating-groups.js`,
`background/tabs/floating-members.js`, `background/tabs/open-tabs.js`,
`background/tabs/live-tab-index.js`, `background/tabs/tab-events.js`,
`sidepanel/sidepanel.js`, `newtab/newtab.js`, `popup/popup.js`,
`manifest.json`.

**Tests (new):**

- `tests/b163-drift-fallback-reconcile.test.js` — 8 cases per §70.9.1.

**Tests (modified — docstring only):**

- `tests/b110-drift-non-live-fix.test.js` — T4 + T6 docstrings per §70.5.2 #1, #2.
- `tests/b149-drifted-claim-survives-cold-start.test.js` — T2 docstring per §70.5.2 #3.

**Tests (perf margin verify):**

- `tests/claims-perf.test.js`, `tests/drift-floating-perf.test.js` — re-run; minor margin bump only if needed.

**Docs:**

- This chapter (`docs/design/70-b-163-drift-fallback-reconcile.md`) — R2 plan, written BEFORE R3 per S44 retro action item 1.
- `docs/SOLUTION_DESIGN.md` — TOC entry added at line 90 (above §71).
- §53 cross-reference one-line addition at R6 close (`docs/design/53-b-110-drift-non-live-fix.md`).
- (R6) `CHANGELOG.md`, `docs/RELEASES.md` — entries added at sprint close.
- (R5) `docs/UAT_B-163.md` — UAT script per §70.9.3.
