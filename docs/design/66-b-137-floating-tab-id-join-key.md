# §66 — B-137 `tj:floatingGroups` v3 → v4: `liveTabId` Adopted as Primary Live-Tab Join Key (R2 Architecture)

**Sprint:** 41 · **Tier:** Full (M)
**Status:** R2 LOCKED 2026-04-29 — ready for R3
**Owner:** [solution-architect]
**Closes / Subsumes:** B-131 (sibling-title displacement, originally wontfix-not-repro at S40 Wave 0; re-opened by post-S40 spike Issue 2). Subsumes Issue 3 (race-toast on rapid floating reorder) per the post-S40 R0 spike re-evaluation.
**Depends on (all done):** §60 B-121 (`tj:floatingGroups` v2 schema; `floatingTabId` ulid; `parentItemId` rename; `buildFloatingMembers` resolver), §63 B-134 (`sortOrder` v3 schema bump; `_resolveRecordIndexByTabId` helper; `reorderFloatingMembers` / `moveFloatingTab` helpers; cascade-prune sibling-grep precedent), §64 B-132 R0 spike, §65 B-132 (`preMarkInheritedFromFloatingGroups` cold-start helper; `(windowId, tabIndex)`-then-URL fallback contract), §62 B-122 (cache extension precedent — sectionBottoms cache).
**Related code (citation gate, B-118):**
- `background/storage/migration.js:76` — `KNOWN_VERSION = 3` (B-134 §63.2.3) → bumps to **4**.
- `background/storage/migration.js:90-113` — `MIGRATION_STEPS` (v1→v2, v2→v3 governance bumps) → appended **v3→v4** no-op.
- `background/storage/shapes.js:105` — `defaultShape(PARTITION_META)` returns `{ schemaVersion: 3, … }` → bumps to **4**.
- `background/storage/shapes.js:225-260` — `assertShape(PARTITION_FLOATING_GROUPS)` validator → gains OPTIONAL `liveTabId` finite-number check.
- `background/tabs/floating-groups.js:177-220` — `appendFloatingGroup` — gains `liveTabId` stamp.
- `background/tabs/floating-groups.js:107-162` — `reassociateFloatingGroups` — gains lazy `liveTabId` rewrite (R2-VERIFY 1 LOCK).
- `background/tabs/floating-groups.js:254-266` — `_resolveRecordIndexByTabId` — gains direct `liveTabId` fast-path; legacy fallback retained.
- `background/tabs/floating-groups.js:434-441` — `moveFloatingTab` `floatingTabId` preservation block — extended to also preserve `liveTabId`.
- `background/tabs/floating-groups.js:592-632` — `preMarkInheritedFromFloatingGroups` (B-132) — read-only contract preserved verbatim per R2-VERIFY 1 LOCK rationale.
- `background/tabs/floating-members.js:47-164` — `buildFloatingMembers` — gains 3-tier join (direct → position → URL).
- `background/tabs/tab-events.js:140-184` — `chrome.tabs.onCreated` opener-chain block — caller of `appendFloatingGroup` at lines 156-163; passes `liveTabId: tab.id` per R2-VERIFY 7 LOCK.

---

## §66.1 Overview

B-137 adopts the numeric live-session `tabId` (added to each `tj:floatingGroups` record at write time as `liveTabId`) as the **primary join key** between persisted floating-group records and live tabs. The change closes a structural correctness defect documented in `docs/findings/post-s40-smoke-triage.md` Issue 2 (sibling-title displacement) and Issue 3 (race-toast on rapid floating reorder) — both of which root-cause to the brittle `(windowId, tabIndex)` position-heuristic join used today inside `buildFloatingMembers` (§60.3.2 read path) and `_resolveRecordIndexByTabId` (§63.14.1).

**Schema bump:** `tj:floatingGroups` v3 → v4. C-1a APPLIES (governance: `KNOWN_VERSION` 3→4 + `defaultShape(PARTITION_META).schemaVersion` 4 + new no-op `MIGRATION_STEPS` entry + CHANGELOG SW module-cache flush note at sprint close). C-1b APPLIES with **lazy migration** (option 2): writes always stamp `liveTabId`; reads tolerate v3 records via the existing position+URL fallback; legacy records lazily rewrite their `liveTabId` on the next cold-start re-bind via `reassociateFloatingGroups` (§66.7).

**Constraints (per R1 LOCK · 8 ACs):**
- The `(windowId, tabIndex)` position fallback REMAINS in all four reader sites for legacy v3 records during the cold-start re-bind window (B-138 cleans this up later).
- No behavioral change to drag-reorder UX — this is a **correctness fix**, not a feature.
- No change to `inheritedTabs` (B-125) or `claimsMirror` (B-018 / B-099) contracts.
- No change to `MSG_LIST_ITEMS` response shape (`FloatingMember` descriptor unchanged per R2-VERIFY 3 LOCK).
- No new `MSG_*` contracts. Existing `MSG_REORDER_FLOATING_MEMBERS` / `MSG_MOVE_FLOATING_TAB` payload shapes unchanged.
- No new `manifest.json` permissions.
- No newtab/popup parity changes — `MSG_LIST_ITEMS` consumers unchanged.

**Key constraints surfaced by R0 spike + R1 LOCK:**
- The `floatingTabId` ulid (added by B-121 §60.4) is a **storage identity** — survives cross-group moves, drives prune lookups. It is NOT the live-session join key. B-137 introduces `liveTabId` as the live-session join.
- Cold-start sequencing: on SW boot, `liveTabId` from the previous session is ALWAYS suspect (Chrome may reuse the same numeric id for a different tab). The 3-tier join must defend against this — see §66.9 stale-`liveTabId` defense.

**Out of scope (explicit, per R1 AC8):**
1. Removing the `(windowId, tabIndex)` fallback (B-138 cleanup).
2. Cross-window floating-tab drag (B-135 stub).
3. `inheritedTabs` / `claimsMirror` / `tj:items` / `tj:groups` contract changes.
4. `MSG_*` contract changes.
5. Newtab / popup behavior changes.
6. Drag-reorder UX changes.

---

## §66.2 Schema impact (C-1a + C-1b explicit closure)

### §66.2.1 — C-1a Schema-version governance bump (mandatory)

The `tj:floatingGroups` record shape changes (new OPTIONAL `liveTabId` field on writes from B-137 onward; OPTIONAL on the read-side validator to preserve backward compatibility with v3 records that survive the upgrade). Per CLAUDE.md C-1a:

- **`KNOWN_VERSION` v3 → v4** in `background/storage/migration.js:76`. Add a fourth `MigrationStep` entry `{fromVersion: 3, toVersion: 4, migrate: (snapshot) => snapshot}` (no-op governance bump — actual data convergence is lazy per §66.2.2). The F2 contiguity check at `migration.js:127-135` validates the chain at boot — R3 must verify the chain still passes after the new step is appended.
- **`defaultShape(PARTITION_META)` v3 → v4** in `background/storage/shapes.js:105` — the seed for `tj:meta.schemaVersion` on fresh installs. **Hardcoded literal** (per the existing comment: *"not imported from migration.js to keep the storage layer independent of the migration runner — bumping this when KNOWN_VERSION bumps is a deliberate, paired change"*).
- **`CHANGELOG.md` SW module-cache flush note** required at sprint close (technical-writer R7): *"After updating to v1.35.0, toggle the extension OFF then ON in `chrome://extensions` to ensure the SW module cache is flushed; otherwise the new floating-tab `liveTabId` join path may not activate until the next browser restart."* Same note pattern as B-121 §60.4.7 / B-134 §63.2.3.

### §66.2.2 — C-1b Data-migration strategy (lazy — option 2)

**Chosen strategy: lazy migration.** The v3 → v4 step is a no-op governance bump (advances `tj:meta.schemaVersion` to 4). Data convergence happens incrementally:

- **Reads (validator):** `liveTabId` is OPTIONAL on the read-side validator (`shapes.js:225-260`). v3 records (no `liveTabId`) survive validation. `buildFloatingMembers` (§66.6) and `_resolveRecordIndexByTabId` (§66.8) fall back to the existing position-then-URL match for legacy records.
- **Writes:** Every new `appendFloatingGroup` write stamps `liveTabId` (§66.5). `moveFloatingTab` cross-group moves preserve `liveTabId` (§66.10 atomic invariants — extends the existing `floatingTabId` preservation block at `floating-groups.js:437-441`).
- **Cold-start re-bind (lazy rewrite):** When `reassociateFloatingGroups` (§66.7) successfully resolves a legacy v3 record via position+URL fallback AND the matched tab is unclaimed, the matched `tabId` is written back into `record.liveTabId` as part of the same `pruneResolvedFloatingGroups` writeTransaction. Subsequent reads use the direct-tabId path (§66.6 path (a)).
- **Eviction:** Legacy v3 records self-evict naturally when the underlying tab closes (the record is pruned via `pruneResolvedFloatingGroups` if its match becomes claimed; otherwise it persists until its tab closes — same lifecycle as v2/v3 records).
- **Why lazy over eager:** matches B-121 §60.14.3 and B-134 §63.2.4 precedents. The `floatingGroups` partition is best-effort and reconciles on every SW boot; rewriting every record on cold-start is destructive and unnecessary. The `KNOWN_VERSION` bump is governance-only — independent of the data strategy.

### §66.2.3 — Validator extension (`background/storage/shapes.js:225-260`)

R3 MUST extend the `PARTITION_FLOATING_GROUPS` case to tolerate `liveTabId` as OPTIONAL on reads (matches the pattern for `floatingTabId` + `parentItemId` from B-121 §60.4.6 and `sortOrder` from B-134 §63.2.5):

```js
/* B-137 §66.4 — OPTIONAL liveTabId field (schema v4). Legacy v3
   records lack the field; new writes from B-137 stamp it. The validator
   tolerates both shapes; buildFloatingMembers + _resolveRecordIndexByTabId
   prefer liveTabId direct-match when present, falling back to (windowId,
   tabIndex) for legacy records. */
if ('liveTabId' in entry) {
  if (typeof entry.liveTabId !== 'number' || !Number.isFinite(entry.liveTabId)) {
    throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition} — liveTabId`);
  }
}
```

The validator does NOT reject extra keys (verified at B-134 §63.2.6 — current `assertShape` checks documented allow-list fields but does not enforce closed-shape). Forward-compat is therefore symmetric: a downgraded v3 validator silently ignores `liveTabId`.

### §66.2.4 — Rollback plan (storage-schema)

If a v4 record makes it to disk and a forced rollback to v3 is required:
- Pre-S41 (v3) validator silently ignores `liveTabId` (extra keys not rejected; verified `shapes.js:225-260`).
- Reverse data-shape compatibility = trivial. Records carrying `liveTabId` continue to function in v3 mode (the field is unused on read).
- **Procedure:** `git revert <r3-commit-sha>` reverses all production code; manual `KNOWN_VERSION` reset to 3 in `migration.js`. Records with `liveTabId` continue to function as v3 records.

See §66.16 for the full rollback procedure.

---

## §66.3 Schema definition (v4 record shape)

### §66.3.1 — Persisted record (post-S41)

```js
{
  /* IDENTITY (B-121) */
  floatingTabId: string,    // ulid — storage identity (preserved across cross-group moves)
  parentItemId: string,     // parent saved item's id

  /* GROUPING + POSITION (B-121 / B-134) */
  groupId: string,          // group bucket
  windowId: number,         // last-known windowId (write-time snapshot)
  tabIndex: number,         // last-known position in window (write-time snapshot)
  url: string,              // last-known URL (write-time snapshot)
  savedAt: number,          // creation timestamp
  sortOrder: number,        // B-134 — per-bucket integer ordering, 0..N-1

  /* B-137 LIVE-SESSION JOIN KEY — NEW (v4) */
  liveTabId: number,        // numeric tabId at write time; suspect across SW restart;
                            //   primary join key for in-session render path; OPTIONAL on
                            //   reads to preserve backward compat with v3 records.
}
```

### §66.3.2 — Legacy v3 record (still tolerated on read)

```js
{
  floatingTabId: string,    // ulid — storage identity
  parentItemId: string,     // parent saved item's id
  groupId: string,
  windowId: number,
  tabIndex: number,
  url: string,
  savedAt: number,
  sortOrder: number,        // B-134 — may also be absent (v2 legacy)
  /* NO liveTabId — read paths must fall back to position+URL match */
}
```

### §66.3.3 — JSDoc typedef extension (`background/tabs/floating-groups.js`)

R3 adds a JSDoc typedef in `floating-groups.js` for the persisted record. The existing `appendFloatingGroup` JSDoc at lines 172-176 currently documents the input shape; extend the docstring (or add a new `@typedef` alongside `getParentItemId`) to enumerate the post-write record shape including `liveTabId`. The `FloatingMember` descriptor typedef in `floating-members.js:25-39` does **not** change (R2-VERIFY 3 LOCK — see §66.6.4).

---

## §66.4 Validator extension (R2-VERIFY 6 LOCK)

### §66.4.1 — OPTIONAL `liveTabId` finite-number check

R3 inserts the new branch inside the existing `case PARTITION_FLOATING_GROUPS:` block at `background/storage/shapes.js:225-260`, immediately after the existing OPTIONAL `sortOrder` block at `:251-259`. The placement matters because every OPTIONAL check shares the same `for (const entry of value)` loop — adding it at the end keeps the validator structure linear.

### §66.4.2 — Allow-list direction (C-7)

The validator continues to follow the **allow-list** discipline established at B-067 / §60.4.6 / §63.2.5:
- Required fields are enforced positively (`!isString(entry.groupId)` rejects).
- OPTIONAL fields use the `'fieldName' in entry`-guarded type check pattern (when present, must be the documented type; when absent, the record is still valid).
- Unknown keys are NOT rejected — preserves forward-compat for incremental rollouts and matches the existing shape-compatibility contract documented at B-121 §60.4.6.

`liveTabId` follows the OPTIONAL pattern: when present, MUST be a finite number; when absent, the record is treated as legacy v3 and routed through the position+URL fallback. This matches the precedent set by `floatingTabId` (B-121), `parentItemId`/`itemId` (B-121), and `sortOrder` (B-134).

### §66.4.3 — Read-path tolerance algorithm

```
on read of tj:floatingGroups[i]:
  required: groupId, windowId, tabIndex, url, savedAt   (else ERR_CORRUPT_DATA)
  optional: floatingTabId  → if present, must be string (else ERR_CORRUPT_DATA)
  optional: parentItemId   → if present, must be string (else ERR_CORRUPT_DATA)
  optional: itemId         → if present, must be string (else ERR_CORRUPT_DATA) — legacy v1
  optional: sortOrder      → if present, must be finite number (else ERR_CORRUPT_DATA)
  optional: liveTabId      → if present, must be finite number (else ERR_CORRUPT_DATA) — NEW v4
  unknown keys: silently tolerated
```

R3 must verify the validator does NOT reject any pre-existing legacy fixtures from `tests/floating-shape.test.js`, `tests/floating-position.test.js`, `tests/floating-multi.test.js`, `tests/floating-url-fallback.test.js`, `tests/floating-session-wipe.test.js` after the new branch is added — those fixtures lack `liveTabId` and must continue to validate (the OPTIONAL `'in'` guard guarantees this).

---

## §66.5 Write-path: `appendFloatingGroup` — caller-supplies `liveTabId` (R2-VERIFY 7 LOCK)

### §66.5.1 — Decision: caller-supplies via the `entry` object

R1 R2-VERIFY 7 picked between (a) caller-supplies `liveTabId` in the `entry` object [recommended] vs. (b) `appendFloatingGroup` performs an internal `getLiveTabIndex()` lookup. **R2 LOCKS option (a) — caller-supplies.**

Rationale:
- The fresh tab's `tab.id` (numeric) is **already in scope** at the call site `background/tabs/tab-events.js:156-163` (verified — the `tab` parameter from `chrome.tabs.onCreated` is available; `liveEntry` is read at lines 151-155 to populate `liveUrl`/`liveIndex`/`liveWindowId`).
- A caller-supplied `liveTabId` is **explicit at the call site** — readers see exactly what numeric id is being persisted.
- An internal `getLiveTabIndex()` lookup inside `appendFloatingGroup` would require an additional position-match traversal (O(N_liveTabs) per write) that duplicates work already done by the caller. The caller already has the `liveEntry` from `getLiveTabIndex().get(tab.id)` (line 151) — passing the `tab.id` numerically is free.
- Option (a) avoids the implicit "look-up-using-the-write-time-fields" behavior, which is exactly the brittle position-heuristic that B-137 is removing.

### §66.5.2 — Signature change

```js
/**
 * B-121 §60.4.4 / B-134 §63.13.1 / B-137 §66.5: stamps a fresh
 * `floatingTabId` (ulid), the caller-supplied `liveTabId` (numeric tabId
 * at write time — primary live-session join key per B-137), and a per-
 * bucket `sortOrder` (current_max + 1) onto every record.
 *
 * Required field: `parentItemId` (the parent saved item's id) AND
 * `liveTabId` (numeric tabId at write time). Records supplied with a
 * legacy `itemId` field are migrated transparently. Records supplied
 * without `liveTabId` are rejected at the input validator (R3 LOCKS the
 * required-field check — see §66.5.3 below).
 *
 * @param {{groupId: string, parentItemId?: string, itemId?: string,
 *          windowId: number, tabIndex: number, url: string,
 *          savedAt: number, liveTabId: number}} entry
 * @returns {Promise<void>}
 */
export async function appendFloatingGroup(entry) { ... }
```

### §66.5.3 — Input validation extension

The existing `appendFloatingGroup` input validator at `floating-groups.js:178-185` checks `groupId`, `windowId`, `tabIndex`, `url`, `savedAt`. R3 extends it to also require `liveTabId`:

```js
if (typeof entry.liveTabId !== 'number' || !Number.isFinite(entry.liveTabId)) {
  return; // silent rejection — matches the existing input-validator pattern
}
```

The silent rejection (early `return`) matches the existing behavior of the function. The caller — `tab-events.js:156-163` — is the only production call site and ALWAYS has `tab.id` in scope, so this is not a regression for production code paths. It is, however, a behavioral change for tests (see §66.12 for the fix-scope enumeration). Tests that previously called `appendFloatingGroup` without `liveTabId` MUST be updated to supply it.

### §66.5.4 — Write payload shape

```js
const stamped = {
  floatingTabId: ulid(),
  groupId: entry.groupId,
  parentItemId: parentId,
  windowId: entry.windowId,
  tabIndex: entry.tabIndex,
  url: entry.url,
  savedAt: entry.savedAt,
  liveTabId: entry.liveTabId,    // NEW (v4)
  // sortOrder is computed inside the mutator (B-134 §63.13.1)
};
```

### §66.5.5 — Caller update (`background/tabs/tab-events.js:156-163`)

```js
// Pre-B-137:
await appendFloatingGroup({
  groupId: result.groupId,
  parentItemId: result.itemId,
  windowId: liveWindowId,
  tabIndex: typeof liveIndex === 'number' ? liveIndex : 0,
  url: liveUrl,
  savedAt: Date.now(),
});

// Post-B-137:
await appendFloatingGroup({
  groupId: result.groupId,
  parentItemId: result.itemId,
  windowId: liveWindowId,
  tabIndex: typeof liveIndex === 'number' ? liveIndex : 0,
  url: liveUrl,
  savedAt: Date.now(),
  liveTabId: tab.id,                 // NEW (v4) — numeric tabId at write time
});
```

`tab.id` is in scope from the `chrome.tabs.onCreated` callback at `tab-events.js:124` (the `tab` parameter). Writing the numeric id directly is correct because the inner `(async () => { ... })()` block re-validates `getLiveTabIndex().get(tab.id)` at line 151 (the `liveEntry` check) — if the tab vanished between `onCreated` and the `appendFloatingGroup` await, the entire block bails before reaching the write.

---

## §66.6 Read-path: `buildFloatingMembers` — 3-tier join (CRITICAL contract change)

### §66.6.1 — Algorithm

The resolver in `background/tabs/floating-members.js:47-164` adopts a **3-tier join order**:

```
for each record in tj:floatingGroups:

  parentItemId = getParentItemId(record)         // B-121 §60.4 read shim
  if !parentItemId: skip
  parent = itemsById.get(parentItemId)
  if !parent || !parent.groupId: skip            // parent deleted (AC8(ii))

  matchedTabId = null

  /* TIER (a) — DIRECT TABID MATCH (B-137 §66.6) ------------------ */
  if record.liveTabId is finite number AND liveIndex.has(record.liveTabId):
    candidateEntry = liveIndex.get(record.liveTabId)
    /* Stale-liveTabId defense (§66.9) — when staleTabId-defense=URL-guard is
       active, additionally verify normalized URL match before committing.
       Default disposition: NO URL guard (§66.9 verdict — let next render
       self-correct). R3 ships without the guard; R3-VERIFY 1 reconfirms. */
    matchedTabId = record.liveTabId

  /* TIER (b) — POSITION MATCH (legacy fallback, existing) -------- */
  if matchedTabId === null:
    for [tabId, entry] in liveIndex:
      if entry.windowId === record.windowId AND entry.index === record.tabIndex:
        matchedTabId = tabId
        break

  /* TIER (c) — URL FALLBACK (legacy fallback, existing) ---------- */
  if matchedTabId === null:
    normalizedStored = safeNormalizeForMatch(record.url)
    if normalizedStored:
      for [tabId, entry] in liveIndex:
        if safeNormalizeForMatch(entry.url) === normalizedStored:
          matchedTabId = tabId
          break

  if matchedTabId === null: continue              // no live tab; skip
  if claimedTabIds.has(matchedTabId): continue    // already promoted; skip
  if matchedTabIds.has(matchedTabId): continue    // H-2 dedup gate (§60 H-2)
  matchedTabIds.add(matchedTabId)

  // ... build descriptor (unchanged) ...
```

The tiers (b) and (c) match the **existing** algorithm verbatim (verified at `floating-members.js:90-109`). Tier (a) is the **new** O(1) Map.get fast path; legacy records (no `liveTabId`) skip past it via the `record.liveTabId is finite number` guard.

### §66.6.2 — Performance characteristics

- **Pre-B-137**: O(N_records × N_liveTabs) per dispatch (every record iterates `liveIndex` for position match + URL fallback).
- **Post-B-137 (v4 records, common case)**: O(N_records) per dispatch — each tier-(a) match is a single Map.get. For v3 legacy records, falls back to O(N_records × N_liveTabs).
- Bound: ≤ 5 records × ≤ 50 tabs typical (§60.2.8), so the savings are measurable but small in absolute terms (< 1 ms total). The win is **correctness**, not perf.

### §66.6.3 — Tie-breaking + dedup

The H-2 dedup gate at `floating-members.js:118-119` (`matchedTabIds.has(matchedTabId)` skip) is preserved verbatim. Two records resolving to the same tabId — possible when a v3 legacy record AND a v4 record exist for the same parent (transitional state) — fire the dedup; first match wins. **No behavior change.**

The tier-(a) ordering also implicitly tie-breaks: if record X's `liveTabId` resolves to tab T, and record Y's `(windowId, tabIndex)` ALSO resolves to tab T via tier-(b), record Y is dropped by the H-2 dedup because record X claimed T first. This is correct: tier-(a) is the more reliable signal.

### §66.6.4 — `FloatingMember` descriptor unchanged (R2-VERIFY 3 LOCK)

The `FloatingMember` typedef at `floating-members.js:25-39` is **unchanged**. The descriptor's existing `tabId` field is the live-session join from the renderer's perspective; the schema change is on the storage record (input to the resolver), not on the descriptor (output). Renderers read `descriptor.tabId` (already a numeric tabId) — no DOM change required, no `MSG_LIST_ITEMS` shape change, no newtab/popup parity work.

Per AC8(e): "No change to `MSG_LIST_ITEMS` response shape — the `FloatingMember` descriptor produced by `buildFloatingMembers` is unchanged."

### §66.6.5 — Sort path unchanged

The post-B-134 sort path at `floating-members.js:150-161` (sortOrder ascending, `(windowId, tabIndex)` legacy fallback) is unchanged. `sortOrder` is the order key; `liveTabId` is the join key — separate concerns.

---

## §66.7 Cold-start re-bind owner — `reassociateFloatingGroups` (R2-VERIFY 1 LOCK)

### §66.7.1 — Decision

R1 R2-VERIFY 1 picked between:
- **Option A** — `reassociateFloatingGroups` (`floating-groups.js:107-162`): the cold-start re-association helper that already runs `pruneResolvedFloatingGroups` (already writes back to `tj:floatingGroups` storage). Piggybacking the lazy `liveTabId` upgrade on the existing write transaction avoids adding a new write path.
- **Option B** — `preMarkInheritedFromFloatingGroups` (`floating-groups.js:592-632`): the cold-start helper added by B-132 §65.4. Currently pure-read-then-mark per its B-132 contract.

**R2 LOCKS Option A.** `reassociateFloatingGroups` becomes the lazy-rewrite owner. `preMarkInheritedFromFloatingGroups` retains its B-132 §65.4 pure-read-then-mark contract verbatim.

### §66.7.2 — Rationale

1. **Existing write surface.** `reassociateFloatingGroups` already invokes `pruneResolvedFloatingGroups` (`floating-groups.js:159-161`) when a record's match resolves to a claimed tab. R3 extends the existing prune mutator to **also** patch matched-but-unclaimed records with their resolved `liveTabId`. This is a single writeTransaction; no new write path.
2. **Pure contract preservation.** B-132 §65.4 explicitly documents `preMarkInheritedFromFloatingGroups` as "Pure read+mark — writes ZERO storage." Adding a write here would violate that contract and require updating B-132 chapter 65 + the JSDoc + the test `tests/b132-cold-start-inheritance.test.js:353` (T-132-H pins "writes ZERO storage"). Avoiding contract drift in B-132 is load-bearing.
3. **Sequencing alignment.** `preMarkInheritedFromFloatingGroups` runs BEFORE `reconcileClaims` (per B-132 §65.3) — its job is to populate `inheritedTabs` so Phase 2 of `reconcileClaims` skips opener-chain-inherited tabs. The tab-id mapping isn't needed for that gate (the mark uses the already-resolved tabId — `markInherited(tabId)`). Lazy `liveTabId` rewrite is purely a storage-layer concern; it belongs in `reassociateFloatingGroups`.
4. **Single-pass economy.** `reassociateFloatingGroups` already iterates records and runs the position+URL fallback — adding the lazy `liveTabId` write is incremental work inside the same loop, not a new pass over the partition.

### §66.7.3 — Algorithm extension

Current `reassociateFloatingGroups` body (`floating-groups.js:107-162`) classifies records into three buckets:
- **matched + claimed** → add to `resolvedFloatingTabIds` (or `legacyResolvedParentItemIds` if no `floatingTabId`); record is pruned in the writeTransaction at `:159-161`.
- **matched + unclaimed** → leave in place (runtime path renders it).
- **unmatched** → leave in place per AC9 (B-018).

B-137 extends this to add a fourth bookkeeping case:
- **matched + unclaimed + missing-or-stale `liveTabId`** → add to `staleLiveTabIdRecords` (a new `Map<floatingTabId, newLiveTabId>` collected during the iteration); the writeTransaction also patches these records with the resolved `liveTabId`.

The "missing or stale" predicate covers both:
- Legacy v3 record with no `liveTabId` field at all.
- v4 record whose stored `liveTabId` is no longer in `liveIndex` (Chrome teardown across SW restart) — the record matched via tier (b) or (c), and the resolved tabId differs from `record.liveTabId`.

### §66.7.4 — Pseudo-diff

```js
export async function reassociateFloatingGroups(liveTabIndex, existingClaims) {
  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  if (!Array.isArray(records) || records.length === 0) return;

  const claimedTabIds = new Set(Object.values(existingClaims));
  const resolvedFloatingTabIds = new Set();
  const legacyResolvedParentItemIds = new Set();
  const staleLiveTabIdRecords = new Map();   // NEW: floatingTabId → resolved tabId

  for (const record of records) {
    if (!record || typeof record !== 'object') continue;

    let matchedTabId = null;

    /* B-137: tier (a) — direct liveTabId fast path. Used to skip the position
       loop when the v4 record's liveTabId is still valid in this session. */
    if (typeof record.liveTabId === 'number' && Number.isFinite(record.liveTabId)
        && liveTabIndex.has(record.liveTabId)) {
      matchedTabId = record.liveTabId;
    }

    /* tier (b) — POSITION MATCH (existing) */
    if (matchedTabId === null) {
      for (const [tabId, entry] of liveTabIndex) {
        if (entry.windowId === record.windowId && entry.index === record.tabIndex) {
          matchedTabId = tabId;
          break;
        }
      }
    }

    /* tier (c) — URL FALLBACK (existing) */
    if (matchedTabId === null) {
      const normalizedStored = safeNormalizeForMatch(record.url);
      if (normalizedStored) {
        for (const [tabId, entry] of liveTabIndex) {
          if (safeNormalizeForMatch(entry.url) === normalizedStored) {
            matchedTabId = tabId;
            break;
          }
        }
      }
    }

    if (matchedTabId !== null && claimedTabIds.has(matchedTabId)) {
      // matched + claimed → prune (existing)
      if (typeof record.floatingTabId === 'string' && record.floatingTabId.length > 0) {
        resolvedFloatingTabIds.add(record.floatingTabId);
      } else {
        const parentId = getParentItemId(record);
        if (parentId) legacyResolvedParentItemIds.add(parentId);
      }
    } else if (matchedTabId !== null
               && record.liveTabId !== matchedTabId    // NEW: differs from stored
               && typeof record.floatingTabId === 'string'
               && record.floatingTabId.length > 0) {
      /* B-137: matched + unclaimed + (missing OR stale) liveTabId →
         lazy-rewrite the resolved tabId. floatingTabId is the storage
         identity for the patch lookup. */
      staleLiveTabIdRecords.set(record.floatingTabId, matchedTabId);
    }
    // matched + unclaimed + liveTabId already correct → leave in place
    // unmatched → leave in place per AC9
  }

  /* Single combined writeTransaction: prunes resolved-claimed records AND
     patches resolved-unclaimed records with their lazy liveTabId. */
  if (resolvedFloatingTabIds.size > 0
      || legacyResolvedParentItemIds.size > 0
      || staleLiveTabIdRecords.size > 0) {
    await pruneOrPatchResolvedFloatingGroups(
      resolvedFloatingTabIds,
      legacyResolvedParentItemIds,
      staleLiveTabIdRecords,
    );
  }
}
```

### §66.7.5 — `pruneResolvedFloatingGroups` extension

The existing `pruneResolvedFloatingGroups` (`floating-groups.js:508-527`) needs to handle BOTH operations atomically. R3 has two implementation choices:

- **Option (i)** — extend the existing function to accept a third optional argument (`staleLiveTabIdRecords`) and patch records inline with the prune filter. Smallest blast radius; matches B-121 §60.4.5 precedent of extending the function with optional parameters.
- **Option (ii)** — add a new `pruneOrPatchResolvedFloatingGroups` function that wraps both behaviors. Cleaner separation, but introduces an additional export.

**R2 prefers Option (i) — extend in place.** The existing function name implies "prune", but B-121 already treats it as "the cold-start storage-update helper" (the `legacyResolvedParentItemIds` parameter is also a write-back semantic, not strictly "prune"). Option (i) keeps the cold-start storage-update logic in one place. R3 may rename the function in a follow-up if scope expands; for B-137, extension is sufficient.

```js
export async function pruneResolvedFloatingGroups(
  resolvedFloatingTabIds,
  legacyResolvedParentItemIds = new Set(),
  staleLiveTabIdRecords = new Map(),    // NEW (B-137)
) {
  if (resolvedFloatingTabIds.size === 0
      && legacyResolvedParentItemIds.size === 0
      && staleLiveTabIdRecords.size === 0) return;

  await writeTransaction([{
    partition: PARTITION_FLOATING_GROUPS,
    mutator: (current) => {
      const arr = Array.isArray(current) ? current : [];
      return arr.reduce((acc, entry) => {
        if (!entry || typeof entry !== 'object') return acc;

        // Prune branch (existing)
        if (typeof entry.floatingTabId === 'string' && entry.floatingTabId.length > 0) {
          if (resolvedFloatingTabIds.has(entry.floatingTabId)) return acc;  // dropped
          // Patch branch (NEW — v3 → v4 lazy-rewrite OR stale liveTabId fix)
          if (staleLiveTabIdRecords.has(entry.floatingTabId)) {
            acc.push({ ...entry, liveTabId: staleLiveTabIdRecords.get(entry.floatingTabId) });
            return acc;
          }
        } else {
          const parentId = getParentItemId(entry);
          if (legacyResolvedParentItemIds.has(parentId)) return acc;  // dropped
        }

        acc.push(entry);
        return acc;
      }, []);
    },
  }]);
}
```

### §66.7.6 — `pruneResolvedFloatingGroups` callers

The function has a single production caller — `reassociateFloatingGroups` at `floating-groups.js:159-161`. The third parameter is OPTIONAL (`new Map()` default), so existing calls in tests do not need to be updated. R3 must verify no test stubs the function directly with a 2-arg signature that would break (none found at R2).

### §66.7.7 — `preMarkInheritedFromFloatingGroups` contract preservation

B-132 §65.4 explicitly documents this helper as pure-read-then-mark. R3 does **NOT** modify it. Its iteration over records continues to use position+URL fallback (which is correct — `preMark` runs BEFORE `reconcileClaims`, so `claimsMirror` is empty at this point; the helper just marks every resolvable tab, regardless of join key). The B-132 test `T-132-H` (`tests/b132-cold-start-inheritance.test.js:353`) which pins "writes ZERO storage" continues to pass after B-137 ships.

R3-VERIFY: re-grep `preMarkInheritedFromFloatingGroups` after R3 to confirm the body is unchanged in production code (only typedef-level edits permitted).

---

## §66.8 `_resolveRecordIndexByTabId` refactor + cascade-grep parity (R2-VERIFY 2 + R2-VERIFY 4 LOCK)

### §66.8.1 — Helper extension (`background/tabs/floating-groups.js:254-266`)

The existing helper iterates records by `(windowId, tabIndex)` geometry. R3 extends it to a **2-tier resolver**:

```js
function _resolveRecordIndexByTabId(arr, tabId, groupId, liveIndex) {
  /* B-137 §66.8 — TIER (a): direct liveTabId match. O(1) for v4 records. */
  for (let i = 0; i < arr.length; i++) {
    const rec = arr[i];
    if (!rec || typeof rec !== 'object') continue;
    if (rec.groupId !== groupId) continue;
    if (typeof rec.liveTabId === 'number' && rec.liveTabId === tabId) {
      return i;
    }
  }

  /* TIER (b): legacy fallback — (windowId, tabIndex) geometry against
     LiveTabIndex. Required for v3 records lacking liveTabId AND for v4
     records whose liveTabId is stale (Chrome restart edge case) but whose
     stored (windowId, tabIndex) still matches the resolved tab. */
  const live = liveIndex.get(tabId);
  if (!live) return -1;
  for (let i = 0; i < arr.length; i++) {
    const rec = arr[i];
    if (!rec || typeof rec !== 'object') continue;
    if (rec.groupId !== groupId) continue;
    if (rec.windowId === live.windowId && rec.tabIndex === live.index) {
      return i;
    }
  }
  return -1;
}
```

### §66.8.2 — Tier (a) is O(N_records), not O(1)

The note in the R0 spike that B-137 makes the resolver "O(1) Map.get" is **slightly aspirational**. The `arr` parameter is a flat array of all records (across all groupIds); tier (a) iterates the array linearly to find the entry whose `liveTabId === tabId AND groupId === groupId`. For typical bounds (≤ 5 records per group, ≤ 20 groups), the iteration is ≤ 100 comparisons — still well under any perf budget.

A true O(1) lookup would require a precomputed `Map<liveTabId, recordIndex>` — but that map would need to be invalidated on every write to `tj:floatingGroups`, and the helper is called from inside `writeTransaction` mutators (where `arr` is the in-mutator snapshot). Building the map per-mutator-invocation is more overhead than the linear scan, given the small N. **R3 ships the linear scan**; a future optimization could add a memoized index if perf measurement ever justifies it.

### §66.8.3 — Caller parity (R2-VERIFY 4 LOCK)

The helper has three production call sites (`floating-groups.js:309`, `:333`, `:409`):

| Site | Function | Description | Behavior change |
|------|----------|-------------|-----------------|
| `:309` | `reorderFloatingMembers` (outer parity check) | Pre-flight resolution to detect race before opening writeTransaction. | None — helper signature unchanged; faster + more correct lookup for v4 records. |
| `:333` | `reorderFloatingMembers` (mutator inner-loop) | Re-resolves indices inside the mutator (defense against concurrent mutations). | None — same. |
| `:409` | `moveFloatingTab` (source resolution) | Resolves the source record before splicing it out of `arr`. | None — same. |

All three call sites get the v4 fast-path automatically. **No caller-side changes required.** This is the cascade-grep parity outcome (R1 Risk #3): every helper consumer benefits from the join-key upgrade without per-site edits.

### §66.8.4 — `moveFloatingTab` cross-group `liveTabId` preservation (R2-VERIFY 2 LOCK)

The existing `floatingTabId` preservation block at `floating-groups.js:434-441` reads:

```js
const floatingTabId = (sourceRecord
  && typeof sourceRecord.floatingTabId === 'string'
  && sourceRecord.floatingTabId.length > 0)
  ? sourceRecord.floatingTabId
  : ulid();
```

R3 extends this to **also** preserve `liveTabId`:

```js
const floatingTabId = (sourceRecord
  && typeof sourceRecord.floatingTabId === 'string'
  && sourceRecord.floatingTabId.length > 0)
  ? sourceRecord.floatingTabId
  : ulid();

/* B-137 §66.8.4 — preserve liveTabId across the cross-group move. The
   live tab itself does not close during MOVE_FLOATING (the drop-handler
   guard A at sidepanel.js + the chrome.tabs.get pre-flight at floating-
   groups.js:374-380 ensure the tab is alive); the join must remain
   intact. ATTACH (sourceRecord === null) stamps the tabId argument as
   the new record's liveTabId. */
const liveTabIdForRecord = sourceRecord
  && typeof sourceRecord.liveTabId === 'number'
  && Number.isFinite(sourceRecord.liveTabId)
  ? sourceRecord.liveTabId
  : tabId;    // ATTACH path — caller-supplied tabId is the live id
```

And the new record-push at lines 455-464 includes `liveTabId`:

```js
arr.push({
  floatingTabId,
  groupId: targetGroupId,
  parentItemId: newParentItemId,
  windowId,
  tabIndex,
  url,
  savedAt: Date.now(),
  sortOrder: clampedIdx,
  liveTabId: liveTabIdForRecord,   // NEW (v4)
});
```

R3-VERIFY (cascade-grep): grep for every record-write site in `floating-groups.js` to confirm the `liveTabId` is preserved on every cross-group write. The Sprint 38 B-121 R3 cascade-prune sibling-grep precedent (CLAUDE.md ROUND 3 build note) applies: every `floatingTabId`-preserving site MUST also be a `liveTabId`-preserving site post-B-137.

### §66.8.5 — `reorderFloatingMembers` — NO contract change (R2-VERIFY 4 LOCK)

`reorderFloatingMembers` (`floating-groups.js:285-343`) only stamps `sortOrder`; it does NOT mutate `liveTabId`, `windowId`, `tabIndex`, or `url`. The post-B-137 mutator at `:333-336` continues to read each record's `liveTabId` (preserved through the spread `{ ...arr[idx], sortOrder: newSortOrder }`) — the field is automatically carried forward. **No edits needed.**

This is verified by the spread operation: `arr[idx] = { ...arr[idx], sortOrder: newSortOrder }` preserves every field except the explicitly overwritten `sortOrder`. `liveTabId`, `floatingTabId`, `parentItemId`, etc. all flow through unchanged.

### §66.8.6 — `saveFloatingGroups` — NO contract change

`saveFloatingGroups` (`floating-groups.js:68-84`) writes caller-supplied entries verbatim — it explicitly does NOT auto-stamp `floatingTabId` (per `tests/floating-shape.test.js:189-202` "B-121: saveFloatingGroups does NOT auto-stamp a floatingTabId"). It is used by `MSG_DEMOTE_ITEM` and tests that seed pre-stamped fixtures. R3 does NOT add `liveTabId` requirement here — callers may supply it (in which case it is persisted) or omit it (in which case the record is written as v3-shaped). This preserves the B-121 contract verbatim.

---

## §66.9 Stale-`liveTabId` defense

### §66.9.1 — The risk

Across SW restart (or after a tab close that fires `chrome.tabs.onRemoved` but the corresponding `tj:floatingGroups` record was not pruned in time), a record's stored `liveTabId` may point at a numeric tabId that Chrome has since reused for a **different tab**. The 3-tier join's tier (a) (`liveIndex.has(record.liveTabId)`) returns `true` because `liveIndex` has the new tab at that id; the descriptor is built from the wrong tab's metadata. Failure mode: same as Issue 2 (sibling-title displacement), but now driven by stale `liveTabId` instead of stale position.

### §66.9.2 — Defense options

**Option A — URL-guard on tier (a) cache hit.** Compare `safeNormalizeForMatch(record.url)` against `safeNormalizeForMatch(liveIndex.get(record.liveTabId).url)`. If mismatch, fall through to tier (b). Defense-in-depth: catches the edge case where Chrome reuses a tabId AND the new tab's URL differs from the record's stored URL.

- Pros: Bullet-proof for the common case.
- Cons: Adds an extra `safeNormalizeForMatch` per record per render — small but non-zero overhead. Also: the URL-guard fails if the user navigates the original tab to a new URL (the record's `url` is the write-time URL; we'd misjoin via tier (a) and the URL-guard would correctly drop it).

**Option B — No URL-guard; rely on Chrome lifecycle correctness + cold-start re-bind.** The risk window is narrow:
- Chrome's `chrome.tabs.onRemoved` listener at `tab-events.js:208-224` already calls `removeTabEntry(tabId)`, which removes the closed tab from `LiveTabIndex`. After `onRemoved` fires, `liveIndex.has(staleId)` returns false → tier (a) misses → tier (b)/(c) fallback runs → cold-start re-bind rewrites `liveTabId` (§66.7).
- Within a single SW lifetime, Chrome does NOT reuse tabIds (verified at B-132 §64.4 H-4 — Chrome preserves tabIds across extension reload but does not recycle them within a session).
- Across SW restart, `tj:floatingGroups` is reconciled by `reassociateFloatingGroups` BEFORE any `MSG_LIST_ITEMS` dispatch (the B-132 §65.3 cold-start sequence), so the lazy-rewrite path runs first.

**R2 LOCKS Option B — no URL-guard at tier (a)** for v1. The lifecycle guarantees + cold-start lazy rewrite + the H-2 dedup gate already make stale-`liveTabId` misjoins effectively impossible for the realistic timing windows. Adding a URL-guard adds complexity and overhead without a demonstrated failure mode.

**R3-VERIFY 1**: if R5 [test-engineer] UAT discovers any wrong-tab-title rendering driven by `liveTabId` reuse (e.g., rapid-close-then-reopen scenarios), R3 has clear instructions to add the URL-guard at tier (a) — see §66.14 for the deferred-defense block.

### §66.9.3 — Self-correction window

If a stale `liveTabId` misjoin somehow surfaces (e.g., during the narrow window between Chrome closing a tab and the SW processing `onRemoved`):
- The misjoin is **transient** — the next `chrome.tabs.onRemoved` (or `onUpdated`, `onActivated`, `onMoved`) fires `broadcast(SCOPE.LIVE_STATE, ...)`, which triggers `_refetchAndPatchLiveState` in the sidepanel. The sidepanel re-issues `MSG_LIST_ITEMS`, which re-runs `buildFloatingMembers`, which re-runs `reassociateFloatingGroups` on the next cold-start cycle.
- The `liveIndex.has(staleId)` guard in tier (a) returns false the moment `removeTabEntry(staleId)` runs.
- The H-2 dedup gate at `floating-members.js:118-119` prevents two records from rendering against the same tabId in a single dispatch.

**Verdict**: stale-`liveTabId` is a self-correcting transient. R5 UAT may detect a single-frame visual glitch in a contrived rapid-close-open sequence; this is acceptable v1 behavior given the cost of the URL-guard. B-138 (cleanup item) may revisit if needed.

---

## §66.10 Atomic invariants — every write preserves `liveTabId` correctly (cascade-grep enumeration)

R3 must audit every write to `PARTITION_FLOATING_GROUPS` for `liveTabId` invariant compliance. The cascade-grep targets:

| # | Site | Operation | `liveTabId` invariant | Action required (R3) |
|---|------|-----------|----------------------|----------------------|
| 1 | `appendFloatingGroup` (`floating-groups.js:177-220`) | New record write | Stamps `liveTabId: entry.liveTabId` (caller-supplied) | **EDIT** (§66.5) |
| 2 | `saveFloatingGroups` (`:68-84`) | Verbatim write | Whatever caller supplies (may be absent) | None — preserved by spread/filter |
| 3 | `pruneResolvedFloatingGroups` (`:508-527`) | Filter-based prune; B-137 also patches with new `liveTabId` | Records that survive the filter retain their `liveTabId`; staleLiveTabIdRecords entries are patched | **EDIT** (§66.7.5) |
| 4 | `pruneFloatingGroupsByParentItemId` (`:541-550`) | Filter-based cascade prune (B-129) | Records that survive the filter retain their `liveTabId` | None — preserved by `arr.filter` |
| 5 | `reorderFloatingMembers` (`:285-343`) | Mutator at `:333-336` | `arr[idx] = { ...arr[idx], sortOrder: newSortOrder }` — spread preserves `liveTabId` | None — preserved by spread |
| 6 | `moveFloatingTab` source-removal (`:415`) | `arr.splice(sourceIdx, 1)` removes record entirely; new record is pushed in target bucket | Source record's `liveTabId` is captured into local `sourceRecord` BEFORE splice; flowed into target via `liveTabIdForRecord` (§66.8.4) | **EDIT** (§66.8.4) |
| 7 | `moveFloatingTab` target-renumber-and-push (`:425-470`) | Target bucket renumber — only mutates `sortOrder` on existing records (line 422, 450, 469); new record push at `:455-464` | Existing records: only `sortOrder` mutated; `liveTabId` preserved by direct mutation. New record: `liveTabId: liveTabIdForRecord` per §66.8.4 | **EDIT** (§66.8.4) |
| 8 | `reassociateFloatingGroups` lazy-rewrite (`:107-162` + new branch) | Patches `liveTabId` on matched-unclaimed records via the extended pruneResolvedFloatingGroups | Spread preserves all other fields | **EDIT** (§66.7) |

### §66.10.1 — Cascade-grep verification step (R3 self-check)

Per the CLAUDE.md "Cascade-prune sibling-grep" rule (B-141 carry-forward), R3 MUST grep `floating-groups.js` for every literal that could indicate a record-write site:
```bash
grep -nE "arr\.push|writeTransaction|return arr" background/tabs/floating-groups.js
```
Every match site must be audited against the table above. A new write surface introduced post-R2 (e.g., a future B-138 helper) inherits the `liveTabId` invariant by default; B-141's STOP-and-escalate-on-cascade-grep applies if R3 discovers a new site not enumerated here.

### §66.10.2 — Invariant statement

> Every write to `tj:floatingGroups` post-S41 either:
> (a) stamps `liveTabId` from a fresh `chrome.tabs.onCreated`/`MSG_MOVE_FLOATING_TAB` source (numeric tabId is in scope), OR
> (b) preserves `liveTabId` from the source record (cross-group MOVE / reorder / lazy rewrite), OR
> (c) is a verbatim test fixture write via `saveFloatingGroups` where the caller is explicitly responsible for shape.

No write surface omits `liveTabId` for a new record where the numeric tabId is available.

---

## §66.11 C-1..C-12 Correctness Checklist closure

| # | Check | R2 verdict |
|---|-------|-----------|
| **C-1a** | Storage schema versioned (governance) | **APPLIES — closed.** `KNOWN_VERSION` 3 → 4 in `migration.js:76`; `defaultShape(PARTITION_META).schemaVersion` 3 → 4 at `shapes.js:105`; new no-op v3→v4 step at `migration.js:90-113`; CHANGELOG SW module-cache flush note flagged for R7 [technical-writer]. F2 contiguity check at `migration.js:127-135` validates the chain at boot. |
| **C-1b** | Data-migration strategy chosen (data) | **APPLIES — closed lazy.** Per §66.2.2: writes always stamp `liveTabId`; reads tolerate v3 records via existing position+URL fallback; `reassociateFloatingGroups` lazy-rewrites `liveTabId` on matched-unclaimed records during cold-start (§66.7). Choice independently verifiable by R3 via the new tier-(a) tests (§66.13). |
| **C-2** | Message contracts typed | **APPLIES — N/A delta.** B-137 does NOT modify `MSG_*` shapes. `MSG_LIST_ITEMS`, `MSG_REORDER_FLOATING_MEMBERS`, `MSG_MOVE_FLOATING_TAB` payload + response shapes unchanged (R2-VERIFY 3 / AC8(e)). |
| **C-3** | SW cold-start safe | **APPLIES — closed.** All B-137 SW state is ephemeral (re-read partitions on every dispatch); the stored `liveTabId` field is **always** revalidated against `liveIndex.has(...)` before being trusted; cold-start lazy rewrite (§66.7) handles the reload case explicitly. |
| **C-4** | ID stability | **APPLIES — closed.** `floatingTabId` ulid (storage identity) is preserved unconditionally across all write surfaces (cascade-grep §66.10). `liveTabId` is explicitly **session-scoped, suspect-across-restart** by design — the 3-tier join's tier-(a) `liveIndex.has(...)` check is the trust boundary; cold-start re-bind rewrites stale values. `parentItemId` is preserved per B-121 §60.4. |
| **C-5** | Manifest file references resolvable | **N/A — confirmed.** No `manifest.json` edits. |
| **C-6** | Permission minimization | **N/A — confirmed.** Zero permission additions. `chrome.tabs.onCreated` covered by existing `tabs` permission. |
| **C-7** | Allow-list direction | **APPLIES — closed.** Validator extension at `shapes.js:225-260` follows the OPTIONAL `'fieldName' in entry` allow-list pattern (§66.4.2). No deny-list. Matches `floatingTabId`/`parentItemId`/`sortOrder` precedents. |
| **C-8** | SW-context feasibility | **APPLIES — closed.** All new logic runs in the SW context: `chrome.storage.local.{get,set}` via `readPartition`/`writeTransaction`, `Map.has(...)`/`Map.get(...)` are SW-reachable. No `DOMParser`/`document`/`window` usage. |
| **C-9** | Empty-state design | **APPLIES — closed.** Empty cases enumerated: zero records (resolver returns `{}`); all-records-v3 (every record falls through to tier (b)/(c)); all-records-v4 (every record hits tier (a)); mixed v3+v4 (resolver tolerates both); record's `liveTabId` matches a claimed tab (skip per existing claimed-filter); unmatched records (no live tab to render). See §66.15 for full enumeration. |
| **C-10** | Off-screen rect feasibility | **N/A — confirmed.** No DOM/canvas/setDragImage usage. Pure SW-side logic. |
| **C-11** | Popup-lifecycle message ordering | **N/A — confirmed.** No focus-shifting `chrome.tabs.update`/`chrome.windows.update`/`chrome.sidePanel.open` calls. The `chrome.tabs.onCreated` caller is in the SW (`tab-events.js`), not a popup. |
| **C-12** | Manifest declaration runtime-mutability | **N/A — confirmed.** No `chrome_url_overrides`/`action`/`side_panel`/`devtools_page` declaration changes. |
| **C-13** (post-B-139) | Chrome event-feedback completeness | **APPLIES — N/A delta.** B-137 does NOT introduce a new `chrome.tabs.*` write API; it consumes the existing `chrome.tabs.onCreated` listener (which has been registered since S1). The new join key is purely a storage-layer concern. B-136 already closed the `chrome.tabs.onMoved` gap that previously made `liveIndex.entry.index` stale; this is the **enabling fix** for B-137 — without onMoved, tier (b) would still misroute even if tier (a) was correct. |
| **C-14** (post-B-140) | Generation-counter content predicate | **N/A — confirmed.** B-137 does NOT add new generation counters or modify existing ones (`_cachedItemsGen`, `_cachedOpenTabsGen`, `_cachedFloatingMembersGen`). The descriptor shape is unchanged (R2-VERIFY 3 LOCK), so the existing `_floatingMembersSignature` content-conditional predicate (B-134 Wave 3a H-1) continues to work without modification. |

**No C-1..C-14 violations detected at R2 close.**

---

## §66.12 Fix-scope test-assertion enumeration (CLAUDE.md mandatory subsection)

Per CLAUDE.md "Fix-scope test-assertion enumeration" mandatory subsection (B-119/B-126/B-117 R3 escalation precedent), R3 MUST update every test below before claiming complete. Each test is classified as:
- **(a) Gains v4 assertion** — adds new assertions that pin the post-B-137 contract.
- **(b) Updates v3-shape pin to tolerate v4** — existing assertion needs minor edit to allow `liveTabId` field's presence.
- **(c) Unaffected** — exercises a v2/v3 fallback path that B-137 explicitly preserves.

| # | File:Line | Pre-change contract | Post-change contract | Class |
|---|-----------|--------------------|---------------------|-------|
| 1 | `tests/floating-shape.test.js:99-114` | `appendFloatingGroup` auto-stamps `floatingTabId` (only) | Same; PLUS new test pinning `appendFloatingGroup` rejects calls without `liveTabId` (silent rejection per §66.5.3); PLUS new test pinning `liveTabId` is auto-stamped from the supplied `entry.liveTabId` argument | **(a)** + **(b)** — existing test gets a `liveTabId: 100` argument; two new tests added |
| 2 | `tests/floating-shape.test.js:116-145` | `appendFloatingGroup` stamps numeric `sortOrder` | Same; tests need `liveTabId: 100`/`liveTabId: 101` arguments to satisfy the new required field | **(b)** — argument addition only |
| 3 | `tests/floating-shape.test.js:147-171` | `appendFloatingGroup` `sortOrder` is per-bucket | Same; tests need `liveTabId: <unique>` arguments | **(b)** |
| 4 | `tests/floating-shape.test.js:173-187` | `appendFloatingGroup` tolerates legacy `itemId` field | Same; test needs `liveTabId: <numeric>` argument | **(b)** |
| 5 | `tests/floating-shape.test.js:189-202` | `saveFloatingGroups` does NOT auto-stamp `floatingTabId` | Same; `saveFloatingGroups` also does NOT auto-stamp `liveTabId` (verbatim writes preserved per §66.8.6); add new assertion `assert.equal(records[0].liveTabId, undefined)` | **(a)** — new assertion |
| 6 | `tests/floating-position.test.js:22-66` (3 tests) | `reassociateFloatingGroups` position-match priority over URL fallback for v3 records | **(c) UNAFFECTED.** Test fixtures lack `liveTabId` → exercise tier (b)/(c) legacy-fallback paths; B-137 preserves these verbatim. Plus new test: `reassociateFloatingGroups` writes `liveTabId` onto matched-unclaimed legacy v3 records via the lazy-rewrite path (§66.7) | **(c)** + **(a)** new lazy-rewrite test |
| 7 | `tests/floating-position.test.js:78-101` | Position match against already-claimed → prune | **(c) UNAFFECTED.** Pruning behavior unchanged | **(c)** |
| 8 | `tests/floating-multi.test.js:25-...` (3 tests) | Multi-record scenarios; `floatingTabId`-keyed prune; multi-group records | **(c) + (a)**. Existing tests with v3 fixtures continue to pass via tier (b). NEW critical test: T1 from R1 AC7 — deliberate position-collision fixture: record A has `liveTabId: 100` + `(windowId: 1, tabIndex: 0)`; live tab 100 has been moved to a different position so a different tab (101) now occupies `(windowId: 1, tabIndex: 0)`. `buildFloatingMembers` MUST resolve record A to tab 100 (tier (a) direct match), NOT tab 101 (tier (b) position match). Asserts the descriptor's `title` field equals tab 100's title | **(c)** + **(a)** new sibling-displacement test |
| 9 | `tests/floating-url-fallback.test.js:26-...` (4 tests) | URL fallback path triggered when position match fails | **(c) UNAFFECTED.** Tests use v3 fixtures; URL fallback (tier (c)) preserved verbatim. Possibly add ONE new test: tier (a) takes priority over tier (c) when both would resolve | **(c)** + optional **(a)** |
| 10 | `tests/floating-session-wipe.test.js:22-...` | After `chrome.storage.session.clear()` (extension reload), `tj:floatingGroups` records re-resolve | **(c) UNAFFECTED.** Records persist in `chrome.storage.local`, not session. The lazy `liveTabId` rewrite via `reassociateFloatingGroups` runs as part of the existing cold-start sequence; existing test assertions (record counts, claim mirror state) remain correct | **(c)** |
| 11 | `tests/floating-ready-gate.test.js:33-...` | `buildLiveStates` reflects re-associated claims after `reassociateFloatingGroups` resolves | **(c) UNAFFECTED.** v2 legacy fixture (no `liveTabId`); existing assertions remain correct | **(c)** |
| 12 | `tests/b121-floating-group-render.test.js` (multiple tests, 19 `floatingTabId` references) | Floating-row render via `buildFloatingMembers`; descriptor shape; `floatingMembers` map structure | **(c) MOSTLY UNAFFECTED.** `FloatingMember` descriptor unchanged (R2-VERIFY 3); the `floatingMembers` map shape unchanged; render assertions hold. NEW: ONE test pinning `liveTabId`-direct-match produces the correct descriptor when both tier (a) AND tier (b) would resolve to different tabs | **(c)** + **(a)** new direct-match test |
| 13 | `tests/b125-claim-jump-fix.test.js` | `inheritedTabs` runtime gate behavior; opener-chain claim protection | **(c) UNAFFECTED.** B-137 does NOT modify `inheritedTabs` or `claimsMirror` (per AC8(c)); existing assertions hold | **(c)** |
| 14 | `tests/b132-cold-start-inheritance.test.js` (5 `floatingTabId` references; T-132-A through T-132-H) | Cold-start `preMarkInheritedFromFloatingGroups` behavior; AC6 ordering pin (T-132-G); pure-read-then-mark contract (T-132-H) | **(c) UNAFFECTED.** `preMarkInheritedFromFloatingGroups` body is **unchanged** per R2-VERIFY 1 LOCK rationale (§66.7.7). T-132-G ordering pin still passes. T-132-H "writes ZERO storage" still passes (the helper does not touch storage). Existing test fixtures lack `liveTabId` and continue to exercise legacy fallback. **PLUS** ONE NEW test: `reassociateFloatingGroups` lazy-rewrites `liveTabId` onto a matched-unclaimed legacy v3 record (the cold-start lazy migration owner per §66.7) | **(c)** + **(a)** new lazy-rewrite cold-start test |
| 15 | `tests/b134-tab-drag-reorder.test.js` (5 `floatingTabId` references; T1-T31 + Wave 3a regression pins) | `_resolveRecordIndexByTabId` via `(windowId, tabIndex)` geometry; `reorderFloatingMembers` parity check; `moveFloatingTab` cross-group `floatingTabId` preservation; sort fallback | **(b) + (c) + (a) MIXED.** Existing tests use v3 fixtures (no `liveTabId`) so tier (b) legacy fallback continues to work — no edits to existing fixtures BUT need to keep them v3-shaped to continue exercising the legacy path. Some test fixtures may need a `liveTabId` field added to test the v4 fast path explicitly. NEW: T2 from R1 AC7 — race-toast scenario from post-S40 Issue 3: drag-reorder a floating tab whose record carries `liveTabId` while `LiveTabIndex.entry.index` is artificially stale; `MSG_REORDER_FLOATING_MEMBERS` MUST resolve via tier (a) AND succeed (`reordered: true`) without `ERR_RACE`. NEW: cross-group MOVE_FLOATING preserves `liveTabId` (mirrors the existing T6 `floatingTabId` preservation assertion at line 294) | **(b)** existing fixtures need v4 pin tests; **(a)** new T2 race-toast test + new MOVE_FLOATING `liveTabId` preservation test |
| 16 | `tests/migration-steps.test.js:88-95` | `KNOWN_VERSION === 3` (B-134 governance bump) | `KNOWN_VERSION === 4` (B-137 governance bump). UPDATE the message string in the assertion | **(b)** — value update |
| 17 | `tests/migration-steps.test.js:97-145` | v2 → v3 lazy migration: stored v2 advances to v3 with no data rewrite | NEW PARALLEL TEST: v3 → v4 lazy migration: stored v3 advances to v4 with no data rewrite. Existing v2→v3 test still valid (the chain `1→2→3→4` continues to flow through every step) | **(a)** new v3→v4 step test |
| 18 | `tests/migration-fresh-install.test.js:28, 37` | `meta.schemaVersion` equals `KNOWN_VERSION` | Same — value implicitly bumped (test reads `KNOWN_VERSION` constant) | **(c)** |
| 19 | `tests/migration-normal.test.js:23-29, 35-45` | Normal startup: stored equals `KNOWN_VERSION`, no steps run | Same — value implicitly bumped | **(c)** |

**Total: ~14 test files affected.**
- Class **(a) gains v4 assertion**: 6 files (floating-shape, floating-position, floating-multi, floating-url-fallback, b121-floating-group-render, b132-cold-start-inheritance, b134-tab-drag-reorder, migration-steps).
- Class **(b) updates v3-shape pin to tolerate v4 / accept new arg**: 4 files (floating-shape, b134-tab-drag-reorder, migration-steps).
- Class **(c) unaffected**: ~8 files (floating-position 2/3 tests; floating-url-fallback 4/4 tests; floating-session-wipe; floating-ready-gate; b125-claim-jump-fix; most b121/b132/b134 tests; migration-fresh-install; migration-normal).

R3 must update every Class (a) and Class (b) entry before R4 can pass. Pre-existing Class (c) tests are regression guards — they MUST continue to pass without edits to their fixtures (the R2 invariant is "v3 records still work").

---

## §66.13 R3 build plan

### §66.13.1 — File modifications (production)

| File | Change | LOC est | Anchor |
|------|--------|---------|--------|
| `background/storage/migration.js` | `KNOWN_VERSION` 3→4; new no-op v3→v4 `MIGRATION_STEPS` entry; JSDoc note on the v4 bump | +20 | §66.2.1 |
| `background/storage/shapes.js` | `defaultShape(PARTITION_META).schemaVersion` 3→4; OPTIONAL `liveTabId` finite-number check in `assertShape` PARTITION_FLOATING_GROUPS branch; JSDoc | +12 | §66.2.3 / §66.4 |
| `background/tabs/floating-groups.js` | (a) `appendFloatingGroup` input validator + payload extension (§66.5); (b) `_resolveRecordIndexByTabId` 2-tier extension (§66.8); (c) `moveFloatingTab` `liveTabId` preservation block (§66.8.4); (d) `reassociateFloatingGroups` lazy-rewrite collection + extended writeTransaction (§66.7); (e) `pruneResolvedFloatingGroups` 3rd-arg + patch branch (§66.7.5); (f) JSDoc updates | +85 | §66.5–§66.8 |
| `background/tabs/floating-members.js` | `buildFloatingMembers` tier-(a) direct-match block prepended to existing position+URL fallback (§66.6) | +18 | §66.6 |
| `background/tabs/tab-events.js` | `appendFloatingGroup` call-site at line 156-163 — add `liveTabId: tab.id` (§66.5.5) | +1 | §66.5.5 |

**Total production: ~136 LOC** across 5 files (within R1 estimate of 150-200 LOC).

### §66.13.2 — File modifications (tests)

| File | Change | LOC est |
|------|--------|---------|
| `tests/floating-shape.test.js` | Update existing tests to supply `liveTabId`; add new `liveTabId` auto-stamp test; add `appendFloatingGroup` rejects no-`liveTabId` test; add `saveFloatingGroups` does-NOT-stamp-`liveTabId` test | +50 |
| `tests/floating-position.test.js` | Add new lazy-rewrite test: `reassociateFloatingGroups` writes `liveTabId` onto matched-unclaimed v3 record | +30 |
| `tests/floating-multi.test.js` | Add T1 sibling-displacement test (tier (a) wins over tier (b) when stored position is stale) | +35 |
| `tests/floating-url-fallback.test.js` | Optional — add tier (a) priority over tier (c) test | +15 |
| `tests/b121-floating-group-render.test.js` | Add tier (a) direct-match render test | +25 |
| `tests/b132-cold-start-inheritance.test.js` | Add lazy-rewrite cold-start test | +30 |
| `tests/b134-tab-drag-reorder.test.js` | Add T2 race-toast race-resolution test; add MOVE_FLOATING `liveTabId` preservation test; possibly add `_resolveRecordIndexByTabId` v4 fast-path direct test | +60 |
| `tests/migration-steps.test.js` | Update KNOWN_VERSION assertion to 4; add v3→v4 lazy migration test | +35 |

**Total test: ~280 LOC**, ~15-20 new tests + ~10 fixture updates (within R1 estimate of 15-20 new tests).

### §66.13.3 — Build sequence (R3)

R3 should build in dependency order:

1. **Schema layer** — bump `KNOWN_VERSION`; update `defaultShape`; extend validator. Run `npm test` to confirm migration-steps + migration-fresh-install + migration-normal continue to pass with the new constant. Add the v3→v4 lazy migration test.
2. **Write path** — extend `appendFloatingGroup` signature; update tab-events.js caller; update `tests/floating-shape.test.js` fixtures. Run `npm test tests/floating-shape.test.js`.
3. **Read path** — extend `buildFloatingMembers` 3-tier; add tier (a) test in floating-multi (T1 sibling-displacement). Run `npm test tests/b121-floating-group-render.test.js tests/floating-multi.test.js`.
4. **Cold-start re-bind** — extend `reassociateFloatingGroups` + `pruneResolvedFloatingGroups`; add lazy-rewrite test in floating-position. Run `npm test tests/floating-position.test.js tests/b132-cold-start-inheritance.test.js`.
5. **Helper refactor** — extend `_resolveRecordIndexByTabId` + `moveFloatingTab` `liveTabId` preservation; add T2 race-toast test in b134. Run `npm test tests/b134-tab-drag-reorder.test.js`.
6. **Full suite** — `npm test`. Confirm zero regressions. Verify all 14 test files in §66.12 pass.

### §66.13.4 — Quality bar

- Zero TODOs, no `console.log`, no `setDragImage`-class new ergonomic concerns.
- `liveTabId` invariant per §66.10 holds across every audited write surface.
- Per CLAUDE.md "Cascade-prune sibling-grep" rule (B-141), grep `arr.push|writeTransaction` in `floating-groups.js` post-build to confirm no missed write site.
- Per CLAUDE.md B-118 source-citation gate, every JSDoc comment in the new code cites the chapter section (§66.X) it implements.

---

## §66.14 R3-VERIFY markers

Markers R2 explicitly defers to R3:

| # | Marker | Disposition | Risk if wrong |
|---|--------|-------------|---------------|
| **R3-VERIFY 1** | URL-guard at tier (a) for stale-`liveTabId` defense | **R2 LOCKS no-guard** (§66.9.2 Option B). R3 ships without the URL-guard. R5 [test-engineer] UAT may surface the rapid-close-reopen race; if observed, R3 adds the guard as a 5-line addition: `if (tier-a-hit && safeNormalizeForMatch(record.url) !== safeNormalizeForMatch(liveEntry.url)) tierAMatchedTabId = null;` | LOW — self-correcting transient (§66.9.3). Worst case: single-frame visual glitch in a contrived scenario. |
| **R3-VERIFY 2** | `pruneResolvedFloatingGroups` extension — Option (i) extend in place vs. Option (ii) new `pruneOrPatchResolvedFloatingGroups` | **R2 prefers Option (i)** (§66.7.5 rationale). R3 may switch to (ii) if extending the existing function's semantics becomes unwieldy at build time. | NONE — purely a code-organization choice; behavior is identical. |
| **R3-VERIFY 3** | New `Map<liveTabId, recordIndex>` precomputed cache for `_resolveRecordIndexByTabId` true-O(1) lookup | **R2 ships linear scan** (§66.8.2 rationale). R3 must NOT add the precomputed cache without explicit perf measurement; bounded N makes the optimization premature. | NONE — perf budget unaffected at typical bounds. |
| **R3-VERIFY 4** | `tests/b134-tab-drag-reorder.test.js` fixture classification — which existing fixtures get `liveTabId`, which stay v3-shaped | R3 follows §66.12 enumeration. Per-fixture classification is deferred to R3 (some fixtures may need both shapes — pin both paths). | LOW — incorrect classification weakens coverage but does not break behavior. |
| **R3-VERIFY 5** | `chrome-mock.js` parity for `tab.id` propagation through `chrome.tabs.onCreated` mock | R2 verified `tests/chrome-mock.js` already supports `__setMockTabs` with explicit `id` field; B-137 does NOT need new mock plumbing. R3 reconfirms after first test write. | LOW — if mock parity gap exists, R3 adds. |

---

## §66.15 Edge cases (C-9 closure)

| # | Case | Behavior |
|---|------|----------|
| 1 | **Empty `tj:floatingGroups`** | `buildFloatingMembers` returns `{}`; `reassociateFloatingGroups` early-returns at line 109; `_resolveRecordIndexByTabId` returns -1. **No changes.** |
| 2 | **All records v3 (legacy)** | Every record's `liveTabId` is undefined → tier (a) misses → tier (b)/(c) fallback runs. `reassociateFloatingGroups` lazy-rewrites every matched-unclaimed record's `liveTabId` over time. After ≥1 cold-start cycle with all matches resolving, all records have v4 shape. |
| 3 | **All records v4 (post-migration)** | Every record's `liveTabId` is a finite number → tier (a) hits (assuming `liveIndex.has(...)` is true). O(N_records) read cost; correctness preserved against position changes mid-session. |
| 4 | **Mixed v3 + v4** | Each record routes independently through the 3-tier join. H-2 dedup gate prevents two records from rendering against the same tab. |
| 5 | **Record's `liveTabId` is stale (Chrome reuse across SW restart)** | `liveIndex.has(staleId)` is true (Chrome may have reassigned the id to a different tab). Tier (a) commits the misjoin. Self-correction window (§66.9.3): next `chrome.tabs.onRemoved`/`onUpdated`/`onActivated` triggers a re-render; `reassociateFloatingGroups` lazy-rewrites the corrected `liveTabId` on the next cold-start. |
| 6 | **Tab-close-during-rebind race** | `reassociateFloatingGroups` reads `liveTabIndex` snapshot at line 108. Mid-loop, a tab close fires `onRemoved` → `removeTabEntry(tabId)`. The captured `liveTabIndex` Map reference is unchanged (Map is mutated, not replaced). Subsequent records may see the closed tab in their `liveTabIndex.get(...)` calls — they'll mismatch the position-then-URL fallback and the record stays in place. **Correct behavior** — record will be reconciled on next cold-start. |
| 7 | **`chrome.storage.local` write-conflict during cold-start** | `writeTransaction` is atomic per-partition (B-001b). If a concurrent `appendFloatingGroup` writes between `readPartition` (§66.7 algorithm step 1) and the writeTransaction commit, the writeTransaction's mutator re-reads `current` — so the patch+prune operates on the latest snapshot. Worst case: a freshly-appended v4 record (with valid `liveTabId`) is briefly seen by `reassociateFloatingGroups` as a "matched-unclaimed v4 record with `liveTabId` already correct" → no patch needed → mutator returns the array unchanged for that entry. **Correct behavior.** |
| 8 | **`liveTabId` matches but parent deleted** | `getParentItemId(record)` resolves to a now-stale id; `itemsById.get(parentItemId)` returns undefined → record is skipped per existing AC8(ii) at `floating-members.js:87`. **Existing behavior preserved.** |
| 9 | **`liveTabId` matches but tab is claimed** | Tier (a) sets `matchedTabId`; the existing `claimedTabIds.has(matchedTabId)` filter at `floating-members.js:114` skips the record. **Existing behavior preserved.** |
| 10 | **`liveTabId` matches but H-2 dedup hits** | A v3 legacy record AND a v4 record both resolve to the same tab. Tier (a) processes the v4 record first (the order is array-iteration order; in practice v4 records are written more recently and appear later, but the H-2 gate prevents double-render either way). **Existing H-2 behavior preserved.** |

---

## §66.16 Rollback plan

### §66.16.1 — Single-revert procedure

```bash
# Identify the B-137 commits on release/v2 (after sprint merge):
git log --oneline release/v2 | grep -E "B-137"

# Single-commit revert (B-137 lands as one R3 build commit):
git revert <b-137-r3-commit-sha-on-release-v2>
git push origin release/v2
```

### §66.16.2 — Code rollback removes

- `KNOWN_VERSION` returns to 3; new v3→v4 step removed from `MIGRATION_STEPS`.
- `defaultShape(PARTITION_META).schemaVersion` returns to 3.
- OPTIONAL `liveTabId` validator branch removed from `shapes.js`.
- `liveTabId` argument removed from `appendFloatingGroup`; `tab-events.js` call site reverts to v3 payload.
- `_resolveRecordIndexByTabId` returns to single-tier `(windowId, tabIndex)` lookup.
- `moveFloatingTab` `liveTabId` preservation block removed.
- `reassociateFloatingGroups` lazy-rewrite collection removed; `pruneResolvedFloatingGroups` 3rd-arg removed.
- `buildFloatingMembers` tier (a) block removed; tier (b)/(c) (current behavior) restored.

### §66.16.3 — Storage rollback (lazy self-revert)

The lazy-migration design self-rolls-back automatically:
- v3 reader silently ignores `liveTabId` field (validator does not reject extra keys; verified §66.4.2).
- Records carrying `liveTabId` continue to function as v3 records under the rolled-back code.
- New writes from the rolled-back `appendFloatingGroup` emit v3 payloads (no `liveTabId`).
- Existing `liveTabId` fields persist on disk indefinitely but are unread.
- No data corruption; no `chrome.storage.local` cleanup required.

### §66.16.4 — Storage forced-cleanup (optional)

If a forced strip of `liveTabId` from existing records is required (e.g., to reduce storage footprint post-rollback), R3 may add a one-shot rewrite step. **NOT required** for correctness — the lazy-tolerance behavior makes the field safely ignorable.

```js
// Optional hot-fix migration (NOT shipped with R3 build, NOT in B-137 scope):
async function stripLiveTabIdFromAllRecords() {
  await writeTransaction([{
    partition: PARTITION_FLOATING_GROUPS,
    mutator: (current) => {
      const arr = Array.isArray(current) ? current : [];
      return arr.map((r) => {
        if (r && typeof r === 'object' && 'liveTabId' in r) {
          const { liveTabId, ...rest } = r;
          return rest;
        }
        return r;
      });
    },
  }]);
}
```

---

## §66.17 Cross-references

| Chapter | Topic | Relationship to B-137 |
|---------|-------|----------------------|
| §10.5 | LiveTabIndex & TabClaims architecture | Unchanged — B-137 consumes `LiveTabIndex` Map.has/Map.get for tier (a) join. |
| §10.6 | Migration runner architecture | B-137 appends one no-op step (v3→v4) to `MIGRATION_STEPS`; F2 contiguity check preserved. |
| §10.8 | Floating-group re-association architecture | **Extended** — `reassociateFloatingGroups` becomes the lazy-`liveTabId`-rewrite owner per R2-VERIFY 1 LOCK (§66.7). |
| §24 | B-018 Floating-Tab Persistence Across Restart | AC9 (no-match → leave in place) preserved verbatim. |
| §59 | B-125 Claim-Jump Fix | `inheritedTabs` runtime gate behavior unchanged (per AC8(c)). |
| §60 | B-121 Floating-Tab Render Pipeline | **Extends** the v2 schema design — `liveTabId` is the v4 addition; `floatingTabId` (storage identity) and `parentItemId` rename preserved verbatim. |
| §62 | B-122 Sub-Group Drag-to-Root | Cache-extension precedent — referenced for sectionBottoms cache pattern (no cache addition needed for B-137 per §66.8.2 verdict). |
| §63 | B-134 Tab Drag-Reorder | **Extends** the v3 schema bump precedent — same lazy-migration shape, same C-1a/C-1b governance pattern. `_resolveRecordIndexByTabId` helper extended. `moveFloatingTab` `floatingTabId` preservation block extended. |
| §64 | B-132 R0 Spike | Filing-source for the cold-start re-bind behavior; `preMarkInheritedFromFloatingGroups` ordering pin preserved. |
| §65 | B-132 Cold-Start Claim-Jump Fix | **Closely related** — `preMarkInheritedFromFloatingGroups` body is unchanged per R2-VERIFY 1 rationale; B-132 contract preserved. |
| `docs/findings/post-s40-smoke-triage.md` | Post-S40 spike — Issue 2 (sibling-title displacement) + Issue 3 (race-toast) | Filing source for B-137 (and B-138 cleanup). |

---

_R2 LOCKED 2026-04-29 by [solution-architect]. Ready for R3 [frontend-engineer]. R6 close will append "As Built" delta following R3 build + R4 review + R5 test._

---

## §66.18 As-Built (R6 Close)

**Closed:** 2026-04-30 · **Sprint:** 41 (anchor) · **Branch:** `feature/sprint-41-floating-tab-id`
**Tier:** Full (M) · **Pipeline rounds executed:** R1 (LOCKED) → R2 → R3 → R4 (parallel × 3) → R5 (UAT plan + L-2/L-3 closures) → R6
**Closing version:** v1.35.0 (release/v2 only — no main merge per established branching strategy)

### §66.18.1 — Files actually changed vs. R2 expected (§66.13 build plan)

| File | Expected (R2 §66.13.1 / §66.13.2) | Actual (R6) | Notes |
|------|------------------------------------|-------------|-------|
| `background/storage/migration.js` | `KNOWN_VERSION` 3 → 4 + new no-op `MIGRATION_STEPS` v3→v4 step (~+15 LOC) | ✅ done — +27 LOC | R3 added an expanded JSDoc block + an inline rationale comment for the new step. The constant moved from line 76 (R2 cite) to line 89 (post-build) due to the JSDoc expansion above the declaration; structural identifier matches exactly. |
| `background/storage/shapes.js` | `defaultShape(PARTITION_META)` literal 3 → 4 + OPTIONAL `liveTabId` finite-number validator branch (~+10 LOC) | ✅ done — +18 LOC at `shapes.js:111` (defaultShape) + `:266-277` (validator) | Within budget. Validator branch mirrors the existing `floatingTabId` / `sortOrder` / `parentItemId` OPTIONAL precedents at lines 248-265. Allow-list direction (C-7) preserved. |
| `background/tabs/floating-groups.js` | `appendFloatingGroup` stamps `liveTabId`; `_resolveRecordIndexByTabId` 2-tier helper; `moveFloatingTab` cross-group preservation; `reassociateFloatingGroups` lazy-rewrite owner; `pruneResolvedFloatingGroups` patch-branch extension (~+100 LOC) | ✅ done — +150 LOC net | Overshoot driven by JSDoc expansion citing the §66.X chapter sections each block implements (R3 source-citation discipline per B-118). The `staleLiveTabIdRecords: Map<floatingTabId, newLiveTabId>` patch bucket (R2-VERIFY 1 Option A) is added inside `reassociateFloatingGroups` body; the existing `pruneResolvedFloatingGroups` writeTransaction is extended in-place per R3-VERIFY 2 Option (i). |
| `background/tabs/floating-members.js` | 3-tier join (a direct → b position → c URL); H-2 dedup gate retained (~+25 LOC) | ✅ done — +27 LOC | Tier (a) at `:97-106` includes a §66.9.2 Option B "no URL-guard" rationale comment block so future readers can trace the deferred R3-VERIFY 1 stale-defense reasoning. Tier (b) and (c) bodies preserved verbatim. |
| `background/tabs/tab-events.js` | Caller-supplied `liveTabId: tab.id` in the `chrome.tabs.onCreated` opener-chain block (~+3 LOC) | ✅ done — +5 LOC at `tab-events.js:163-167` | R2-VERIFY 7 LOCK honored (caller-supplies via the `entry` object). |
| `tests/floating-shape.test.js` | New tests: auto-stamp + legacy tolerance | ✅ done — +4 new tests | Auto-stamp from caller-supplied entry (`:212-225`); silent reject on missing `liveTabId` (`:227-243`); silent reject on `NaN`/string (`:245-271`); v3 legacy fixture survives validator (`:273-292`). |
| `tests/floating-position.test.js` | New tests: tier (a) direct match + legacy fallback | ✅ done — +3 new tests | Cold-start lazy-rewrite onto v3 (`:84-119`); rewrite stale v4 (`:122-149`); no-op when correct (`:152-176`). Existing comment block preserved verbatim. |
| `tests/floating-multi.test.js` | T1 sibling-displacement regression pin | ✅ done — +3 new tests | T1 tier-(a)-wins (`:97-141`); tier-(a)-miss → tier-(b) fallback (`:142-187`); legacy v3 → tier (b) tolerant (`:189-201`). R5 [test-engineer] added +70 LOC for qa L-2 Case 10 H-2 dedup pin (v3 + v4 record both resolving to same tabId; H-2 dedup keeps one descriptor). |
| `tests/floating-url-fallback.test.js` | Regression guard — URL fallback still triggers when both `liveTabId` absent AND position match fails | ✅ done | Existing tests pass unchanged (legacy fixtures explicitly omit `liveTabId`); no new tests needed per R2 §66.12 class (c). |
| `tests/b121-floating-group-render.test.js` | Tolerate new `liveTabId` field | ✅ done — fixture updates at `:344, :356` | All existing assertions hold; no shape change to `FloatingMember` descriptor. |
| `tests/b132-cold-start-inheritance.test.js` | Pin: legacy v3 records still mark inherited; T-132-H zero-storage-write pin survives | ✅ done — +1 new test | Cold-start cooperation test at `:393-438` runs `preMarkInheritedFromFloatingGroups` BEFORE `reassociateFloatingGroups` (matching production sequence). T-132-H pin at `:353-391` continues to pass — confirmed `preMarkInheritedFromFloatingGroups` body unchanged. |
| `tests/b134-tab-drag-reorder.test.js` | T32 race-toast (post-S40 Issue 3); T33 MOVE_FLOATING preserves `liveTabId`; T34 ATTACH seeds `liveTabId` | ✅ done — +3 new tests | T32 (`:1037-1080`) corrupts `LiveTabIndex.entry.index` post-write to simulate stale index; verifies `reorderFloatingMembers` returns `true` via tier (a). T33 (`:1083-1121`) cross-group move; asserts `after[0].liveTabId === 1500`. T34 (`:1124-1143`) ATTACH seeds from caller. T14 retained as legacy v2 fixture (R3-VERIFY 4 LOCK). |
| `tests/migration-steps.test.js` | KNOWN_VERSION === 4 + v3→v4 round-trip | ✅ done — +59 LOC | KNOWN_VERSION pin (`:88-95`); v2→v4 lazy round-trip (`:97-145`) — v2 fixture survives `runMigrations` intact; v3→v4 lazy round-trip (`:148-198`) — v3 fixture survives intact. Migration chain `1→2→3→4` contiguity verified. |
| `tests/b013-opener-chain.test.js` | Fixture updates only | ✅ done | Existing fixtures supplied with `liveTabId` argument so the new input-validator silent-rejection in `appendFloatingGroup` doesn't drop the test record. No assertion changes. |
| `tests/b018-persistence.test.js` | Fixture updates only | ✅ done | Same pattern as b013 — fixture-only updates to feed the new validator contract. |
| `tests/migration-fresh-install.test.js` | R5 additive (qa L-3 closure) | ✅ done — +21 LOC at sprint close | NEW assertion: `defaultShape(PARTITION_META).schemaVersion === 4` (literal) AND `=== KNOWN_VERSION` (lock-step). Hardens the C-1a paired-bump invariant against future drift in `defaultShape`. |
| `docs/UAT_B-137.md` | Not in R2 plan (R5 deliverable) | NEW — 15 cases | UAT plan authored at R5 by [test-engineer]. Covers UAT-1 (qa M-1 mandatory B-131 user-visible repro) through UAT-15 (B-138 fallback-boundary user-visible verification). Sprint 36/37/38/39/40/41 carry-forward UAT pattern. |
| `manifest.json` | No changes (R2 C-6 verified) | ✅ confirmed — no edits | C-6 permission-minimization gate satisfied. |
| `shared/messages.js` | No changes (R2 §66.6.4 R2-VERIFY 3 LOCK — descriptor unchanged) | ✅ confirmed — no edits | C-2 message-contract gate satisfied. `MSG_LIST_ITEMS` response shape preserved. |

**Totals (B-137 only):** 5 production files (+~227 LOC including JSDoc); 9 test files (+15 new tests, +~608 LOC including fixture updates); R5 additions (qa L-2 + L-3 closures: +91 LOC test-only); 1 NEW UAT plan (`docs/UAT_B-137.md`).

### §66.18.2 — Deviations from R2 plan

**No architectural deviations beyond fixture classification.** The B-141 self-application gate did NOT fire — all R2-cited line numbers matched reality at R3 implementation time. Three documentation drifts recorded for future reader benefit:

1. **R3-VERIFY 4 fixture classification — T14 retained as legacy v2 fixture (sanctioned by R2 §66.12 class (c))**: Test T14 in `tests/b134-tab-drag-reorder.test.js` was deliberately preserved without `liveTabId` augmentation, vs. R2's "v4 auto-stamp via appendFloatingGroup" guidance for tests targeting v4 behavior. Rationale: T14 explicitly exercises the lazy-fallback path for legacy records — adding `liveTabId` would silently weaken the test's coverage of the migration-tolerance contract. R5 [test-engineer] confirmed the classification matches the §66.12 enumeration intent (class (c) "unaffected — exercises legacy path"). T14 stays mechanically green; pin is load-bearing for the lazy-migration arc until B-138 closes the v3 cohort entirely.

2. **R2 line-number drift due to JSDoc expansion (non-deviation, documentation drift only)**: R2 cited `KNOWN_VERSION` at `migration.js:76`; R3 reported the same constant at `migration.js:89` post-build (+13 line drift). Cause: R3 added four version-history paragraphs of JSDoc above the declaration. Same pattern observed across 5 R2-cited identifiers in `floating-groups.js` (`appendFloatingGroup` 177-220 → 223-276; `reassociateFloatingGroups` 107-162 → 115-201; `_resolveRecordIndexByTabId` 254-266 → 322-345; `moveFloatingTab` `floatingTabId` block 437-441 → cross-group preservation at 519-533; `preMarkInheritedFromFloatingGroups` 592-632 → 711-751). All structural identifiers (function names, block boundaries) match exactly. The B-141 STOP-and-escalate gate correctly did not fire because R3 followed each anchor identifier to the right code; the absolute line numbers shifted but the relative anchors all hit. This is the first successful self-application of the B-141 gate at scale (the B-139..B-143 bundle was a smaller test).

3. **qa M-1 routed to UAT (R5), not in-build fix**: The R4 [qa-reviewer] M-1 finding observed that T1 verifies the structural fix (tier (a) wins over tier (b)) but does NOT walk B-131's documented user-visible repro (opener-chain spawn-from-bookmark) end-to-end through `tab-events.js:140-188`. The structural fix itself is sound; M-1 was routed to R5 [test-engineer] UAT plan as the mandatory UAT-1 case. Documented in `docs/UAT_B-137.md` UAT-1.

### §66.18.3 — R3-VERIFY marker outcomes

| # | Marker | R6 verification |
|---|--------|-----------------|
| **R3-V-1** | Stale-`liveTabId` defense at tier (a): URL-guard or no-guard | **CONFIRMED — shipped without URL-guard per R2 §66.9.2 Option B LOCK.** At `floating-members.js:97-106`, the tier (a) match commits the resolved `record.liveTabId` directly into `matchedTabId`. The §66.9.2 Option B rationale comment at lines 100-104 cites three defense layers in lieu of the URL-guard: (a) `chrome.tabs.onRemoved` drops stale ids → `liveIndex.has` returns false; (b) cold-start lazy rewrite via `reassociateFloatingGroups`; (c) the H-2 dedup gate at `:135-138`. The R3-VERIFY 1 deferred-defense block from §66.14 is referenced cleanly. UAT-13 (LOW L-4 follow-up) walks the navigate-after-binding scenario — if a single-frame visual glitch surfaces, R3-V-1 unlocks the URL-guard option (5-line addition). |
| **R3-V-2** | `pruneResolvedFloatingGroups` extend-in-place vs. new function | **CONFIRMED — Option (i) extend-in-place chosen per R2 LOCK.** The function at `floating-groups.js:610-646` adds a 3rd argument (`staleLiveTabIdRecords: Map<floatingTabId, newLiveTabId>`) and a new branch in the existing `arr.reduce` mutator: `staleLiveTabIdRecords.has(entry.floatingTabId)` → push patched record `{ ...entry, liveTabId: <new id> }` (spread preserves `sortOrder` / `floatingTabId` / `parentItemId`). All three branches (resolved-claimed prune; stale-`liveTabId` patch; legacy-resolved-by-parent-id prune) operate inside one `writeTransaction(...)` — single atomic write. |
| **R3-V-3** | `_resolveRecordIndexByTabId` linear-scan vs. precomputed cache | **CONFIRMED — linear scan retained per R2 §66.8.2 LOCK.** `floating-groups.js:323-331` implements a single `for` loop iterating `arr` with `groupId + liveTabId` predicate. No precomputed `Map<liveTabId, recordIndex>` cache. Bounded N (≤ 5 records per group, ≤ 20 groups → ≤ 100 comparisons typical) makes this acceptable. JSDoc at `:309-314` documents the perf rationale. |
| **R3-V-4** | B-134 fixture classification: which existing tests gain `liveTabId` vs. retain legacy shape | **CONFIRMED — classification matches R2 §66.12 enumeration exactly.** T1-T31 existing tests gain `liveTabId: <numeric>` arguments to `appendFloatingGroup` calls so the input-validator silent-reject doesn't fire. T14 retained as legacy v2 fixture (deviation #1 above). T32/T33/T34 added as net-new tests pinning the v4 contract (race-toast, MOVE_FLOATING preservation, ATTACH seed). Numeric ids deliberately distinct (100, 101, 200, 800, 801, 1500, 1600, etc.) to prevent accidental cross-test sharing. |
| **R3-V-5** | `chrome-mock.js` parity: `__setMockTabs` supports explicit `id` field | **CONFIRMED.** R3 verified the existing `__setMockTabs` helper accepts an explicit `id` field per the existing chrome.tabs.Tab Map; no harness modification required. New B-137 tests construct test fixtures with explicit `id` values mirroring the production `tab.id` semantics. No DI-via-spy fallback was needed (contrast with B-132 §65.14.4 R3-V-5 which used the source-text-pin fallback). |

### §66.18.4 — R4 reviewer findings (B-137 anchor)

R4 launched all three reviewers in parallel against R3 commit `ab82845` per CLAUDE.md Gate 1.

| Reviewer | CRIT | HIGH | MEDIUM | LOW | Verdict |
|----------|:----:|:----:|:------:|:---:|---------|
| [code-reviewer] | 0 | 0 | 0 | 0 | **APPROVE** — clean Full M-tier R3 build of the highest-blast-radius schema migration since v1.32.0 (B-121). |
| [security-reviewer] | 0 | 0 | 0 | 1 | **PROCEED** — schema v3→v4 migration is governance-clean and atomicity-clean. The single LOW (L-1) is an advisory observation about pre-S38 v1 records' lazy-rewrite carve-out — no fix required. |
| [qa-reviewer] | 0 | 0 | 1 | 4 | **PROCEED** — R3 build cleanly implements the R2-locked 3-tier join + lazy-rewrite. Single MEDIUM (M-1) is a UAT-plan coverage gap, not an in-build defect. |

**[security-reviewer] L-1** — pre-S38 v1 records (no `floatingTabId`) excluded from lazy-rewrite, by design. Documented at §66.7.4. **NO ACTION REQUIRED**; advisory only.

**[qa-reviewer] M-1** (UAT plan coverage gap) — T1 verifies the structural tier-(a)-wins fix but does not walk B-131's documented user-visible repro (opener-chain spawn-from-bookmark) through `tab-events.js:140-188` end-to-end. **ROUTED TO R5 [test-engineer] UAT plan as mandatory UAT-1 case.** Closed at R5 in `docs/UAT_B-137.md` UAT-1.

**[qa-reviewer] L-1** (`_resolveRecordIndexByTabId` tier (a) JSDoc clarifying caller contract) — no defensive `liveIndex.has(tabId)` check at tier (a); relies on caller pre-validation. **ROUTED TO R6 As-Built §66.18.5** (this section).

**[qa-reviewer] L-2** (C-9 case 10 explicit pin) — H-2 dedup with mixed v3 + v4 record both resolving to same tab. **CLOSED AT R5** as additive coverage in `tests/floating-multi.test.js` (+70 LOC).

**[qa-reviewer] L-3** (`migration-fresh-install.test.js` literal pin) — `defaultShape(PARTITION_META).schemaVersion === 4` literal assertion to harden against future drift. **CLOSED AT R5** as additive coverage in `tests/migration-fresh-install.test.js` (+21 LOC).

**[qa-reviewer] L-4** (UAT corner: tab navigated to different URL after binding) — perception question; technically correct behavior (tab identity preserved via `liveTabId`). **ROUTED TO R5 UAT plan as UAT-13 input.**

Full deduplicated R4 tables in `docs/findings/sprint-41.md` ([code-reviewer] B-137 R4 anchor at line 302; [security-reviewer] B-137 R4 anchor at line 387; [qa-reviewer] B-137 R4 anchor at line 543).

### §66.18.5 — qa L-1 closure: `_resolveRecordIndexByTabId` tier (a) caller contract

Per R5 routing decision, the caller contract is documented here as the durable record:

> **Caller contract for `_resolveRecordIndexByTabId` tier (a)** (`background/tabs/floating-groups.js:323-339`):
>
> Tier (a) does NOT defensively check `liveIndex.has(tabId)` before returning a record-index match. The helper trusts that callers pre-validate that `liveTabId` corresponds to a currently-live tab in `LiveTabIndex`. The helper is `_`-prefixed (file-internal) and the caller-contract is implicit in the file scope.
>
> **Why no defensive check is added:**
> (a) Every production caller already pre-validates: `reorderFloatingMembers` outer parity check (`floating-groups.js:388`) consumes `tabId` values that originate from `LiveTabIndex` itself; `reorderFloatingMembers` mutator inner-loop (`:412`) likewise; `moveFloatingTab` source-resolution (`:488`) consumes a `tabId` validated by `chrome.tabs.get` pre-flight in the SW handler. R4 [code-reviewer] performed a cascade-grep verifying this for all three call sites.
> (b) Adding a defensive check would require a contrived caller path for testing (the helper is file-internal; no public API surface accepts a closed `tabId`). The defensive code would never execute in normal control flow.
>
> **Future-caller convention**: any new caller MUST follow the same pre-validation discipline. If a non-validating caller emerges, refactor the helper to consume `LiveTabIndex` directly via dependency injection (signature change: pass `liveIndex` as an additional argument and add the `liveIndex.has(tabId)` guard at tier (a)). Do NOT bolt the defensive check onto the current signature without the DI refactor — that would silently couple the helper to the module-scoped `liveIndex` import (a contract regression).

This documentation addresses the [qa-reviewer] L-1 finding as a closed contract decision. Future R4 reviewers reading the helper see this section's rationale rather than re-discovering the question.

### §66.18.6 — C-1..C-14 Correctness Checklist closure verification

| # | Check | R6 closure verdict |
|---|-------|--------------------|
| C-1a | Storage schema versioned (governance) | **PASS — confirmed.** `KNOWN_VERSION = 4` at `background/storage/migration.js:89` (R2 cited line 76; +13 drift due to JSDoc expansion); `defaultShape(PARTITION_META)` returns `{ schemaVersion: 4, createdAt: Date.now() }` at `background/storage/shapes.js:111`; new no-op v3→v4 entry in `MIGRATION_STEPS` at `migration.js:137-141`; chain `1→2→3→4` contiguous; F2 contiguity check at `migration.js:157-164` validates the chain. **CHANGELOG SW module-cache flush note required at sprint close** — flagged for [release-manager] / [technical-writer] R7. |
| C-1b | Data-migration strategy chosen (data) | **PASS — confirmed lazy (option 2).** Validator OPTIONAL on `liveTabId` (`shapes.js:266-277`); `buildFloatingMembers` 3-tier join falls back to position+URL when tier (a) misses (`floating-members.js:90-128`); writes always stamp `liveTabId` via `appendFloatingGroup` (`floating-groups.js:236-238` validator + `:252` stamp); cold-start lazy rewrite via `reassociateFloatingGroups` (`:115-201`). Legacy v3 records self-evict on tab close OR get `liveTabId` populated on next cold-start re-bind. No bulk rewrite. |
| C-2 | Message contracts typed | **PASS — confirmed.** No new `MSG_*` types. `MSG_LIST_ITEMS` response shape unchanged per R2-VERIFY 3 LOCK. `FloatingMember` descriptor unchanged. `git diff release/v2 HEAD -- shared/messages.js` empty. |
| C-3 | SW cold-start safe | **PASS — confirmed.** All B-137 cold-start logic is idempotent: `reassociateFloatingGroups` reads partition snapshot, classifies records into three buckets, commits a single atomic writeTransaction. Re-running on subsequent cold-starts is a no-op for already-rewritten records. No re-entry surface. |
| C-4 | ID stability | **PASS — confirmed.** `tabId` runtime identity preserved (Chrome-allocated). `floatingTabId` storage identity preserved (B-121 contract unchanged). New `liveTabId` is the live-session join key — explicitly NOT a stable identity (rewritten across SW restarts via lazy rewrite; this is the design intent, not a regression). |
| C-5 | Manifest file references resolvable | **N/A — confirmed.** No `manifest.json` edits. |
| C-6 | Permission minimization | **N/A — confirmed.** Zero permission additions. [security-reviewer] R4 verified clean. |
| C-7 | Allow-list direction | **PASS — confirmed.** Validator at `shapes.js:266-277` follows positive-check `'liveTabId' in entry` guard pattern. Type guard rejects strings, `NaN`, `Infinity`/`-Infinity`, arrays, objects, booleans, `null`/`undefined`. Allow-list discipline maintained. |
| C-8 | SW-context feasibility | **PASS — confirmed.** All B-137 paths use SW-reachable APIs only (`readPartition`, `writeTransaction`, `chrome.tabs.get`, `chrome.tabs.onCreated`). No DOM/window/document access. |
| C-9 | Empty-state design | **PASS — 10 cases enumerated; cases 1-6 directly pinned; cases 7-10 implicitly covered or pinned at R5.** Cases 1-6: empty bucket (`floating-members.js:59` short-circuit); all-v3 fallback (`tests/floating-multi.test.js`); all-v4 happy path (T1); mixed transitional via tier-(a)+tier-(b); stale-`liveTabId`; lazy-rewrite. Case 7 (storage write-conflict) implicit via atomic writeTransaction. Case 8 (parent deleted) preserved via `floating-members.js:87`. Case 9 (claimed-tab skip) preserved via `:133`. Case 10 (H-2 dedup mixed v3+v4) **pinned at R5** in `tests/floating-multi.test.js` (+70 LOC). |
| C-10 | Off-screen rect feasibility | **N/A — confirmed.** No DOM/positioning; SW-side only. |
| C-11 | Popup-lifecycle message ordering | **N/A — confirmed.** SW-side fix. No popup involvement. No focus-shifting API calls. |
| C-12 | Manifest declaration runtime-mutability | **N/A — confirmed.** No manifest declaration changes. |
| C-13 | Chrome event-feedback completeness *(new in S41 B-139)* | **N/A — confirmed.** B-137 does NOT add a Chrome write API. Existing `chrome.tabs.move` (B-134) and `chrome.tabs.onMoved` listener (B-136) are unchanged. The schema v3→v4 work is read-side join + lazy-write-on-cold-start only. |
| C-14 | Generation-counter content predicate *(new in S41 B-140)* | **APPLIES — confirmed unchanged.** B-137 does not introduce new gen counters. The existing `_cachedFloatingMembersGen` content-conditional setter (B-134's `_setCachedFloatingMembers` with `_floatingMembersSignature`) continues to use content-conditional bumps; B-137's read-path changes (3-tier join) produce identical descriptor shapes for the same input → same signature → no spurious bumps. The B-134 H-1 over-trip class is structurally avoided. |

**No C-1..C-14 violations detected at R6 close.**

### §66.18.7 — Cascade-prune sibling-grep verification (B-129 carry-forward)

R3 [frontend-engineer] performed the cascade-grep per CLAUDE.md ROUND 3 Build cascade-prune-sibling-grep rule. R4 [security-reviewer] independently re-verified all 8 enumerated record-write surfaces in `floating-groups.js`:

| # | Site | `liveTabId` handling | Verdict |
|---|------|---------------------|---------|
| 1 | `appendFloatingGroup` mutator (`:223-276`) | Stamped from `entry.liveTabId` (caller-supplied; required) at `:252` | PASS |
| 2 | `saveFloatingGroups` (`:68-84`) | Verbatim writes — caller-controlled shape (legacy migration path); test pin at `tests/floating-shape.test.js:273-292` | PASS — preserved by spread |
| 3 | `pruneResolvedFloatingGroups` (`:610-646`) | Filter+patch via `arr.reduce`; `staleLiveTabIdRecords.has(...)` patch branch + `arr.push({ ...entry, liveTabId: ... })` spread at `:631-634` | PASS |
| 4 | `pruneFloatingGroupsByParentItemId` (`:660-669`) | `arr.filter(...)` — `liveTabId` preserved by reference | PASS |
| 5 | `reorderFloatingMembers` mutator (`:411-417`) | `arr[idx] = { ...arr[idx], sortOrder: newSortOrder }` at `:415` — spread preserves `liveTabId` | PASS |
| 6 | `moveFloatingTab` source removal (`:494`) | `arr.splice(sourceIdx, 1)` removes record; `liveTabId` captured into `sourceRecord` BEFORE splice (line 493) | PASS |
| 7 | `moveFloatingTab` target push (`:547-558`) | New record explicitly stamps `liveTabId: liveTabIdForRecord` at `:557` (preserved from source for MOVE_FLOATING; caller-arg for ATTACH) | PASS |
| 8 | `reassociateFloatingGroups` lazy-rewrite (`:115-201` → calls `pruneResolvedFloatingGroups`) | Patches via the extended `pruneResolvedFloatingGroups` (site #3) | PASS |

The B-121 Sprint 38 cascade-prune-sibling-grep precedent (`MSG_DELETE_ITEM` → `MSG_BULK_DELETE_ITEMS` + `MSG_DELETE_GROUP`) is satisfied here by inheritance: all three handlers route through `pruneFloatingGroupsByParentItemId` (site #4 — `storage-handlers.js:233, 268, 305`), which uses `arr.filter(...)` and preserves `liveTabId` by reference. No new cascade-prune entry-point required.

The atomic invariant from §66.10.2 (every write to `tj:floatingGroups` post-S41 either stamps fresh, preserves from source, or is a verbatim test-fixture write via `saveFloatingGroups`) holds across all 8 sites.

### §66.18.8 — Test count delta (final)

- **Pre-S41 baseline** (post-v1.34.1 hotfix close): **1,782 tests passing**.
- **B-137 R3 contribution**: +15 new tests across 8 test files → 1,797.
- **R5 [test-engineer] additions**: qa L-2 Case 10 H-2 dedup pin (+1 in `floating-multi.test.js`); qa L-3 `defaultShape` literal pin (+1 in `migration-fresh-install.test.js`) → **1,799 final**.
- **B-137 total delta: +17 tests across the lifecycle** (15 R3 + 2 R5).
- **Zero regressions** in the pre-existing suite at every checkpoint. All B-013/B-018/B-121/B-125/B-130/B-132/B-134/B-136 contracts preserved verbatim or via fixture-only updates that surface the new `liveTabId` field without changing assertions.

### §66.18.9 — Schema / contract / permission impact

Confirmed by direct re-read of the diff:
- **Storage schema:** **CHANGED — v3 → v4.** New OPTIONAL `liveTabId: number | undefined` field on `tj:floatingGroups` records. C-1a/C-1b governance fully complied (KNOWN_VERSION + defaultShape + no-op MIGRATION_STEPS entry + lazy validator + CHANGELOG flush note pending sprint close).
- **Message contracts:** **UNCHANGED.** No new `MSG_*` types. `MSG_LIST_ITEMS` response shape preserved per R2-VERIFY 3 LOCK. `FloatingMember` descriptor unchanged.
- **Manifest permissions:** **UNCHANGED.** Zero new entries. C-6 verified clean by [security-reviewer] R4.
- **Validation surfaces:** Single new positive validator branch in `assertShape(PARTITION_FLOATING_GROUPS)` for OPTIONAL `liveTabId` finite-number check. C-7 compliant.
- **Manifest declarations:** **UNCHANGED.** No new entries.

### §66.18.10 — Rollback plan (single-revert)

The B-137 R3 work is consolidated in commit `ab82845` (R3 build) on `feature/sprint-41-floating-tab-id`; R5 additions in `9fbb206`.

```bash
# Identify the B-137 commits on release/v2 (after sprint merge):
git log --oneline release/v2 | grep -E "B-137|S41 checkpoint"

# Two-commit revert (R5 first to preserve build coherence):
git revert <9fbb206-equivalent-on-release-v2>  # R5 UAT plan + L-2/L-3 test gaps
git revert <ab82845-equivalent-on-release-v2>  # R3 build (schema + join key)
git push origin release/v2
```

**Code rollback removes:**
- `liveTabId` field stamp + validator + `staleLiveTabIdRecords` patch bucket from `background/tabs/floating-groups.js`.
- Tier (a) direct-tabId match from `background/tabs/floating-members.js` (reverts to 2-tier position+URL).
- Caller-supplied `liveTabId: tab.id` from `background/tabs/tab-events.js`.
- `KNOWN_VERSION` 4 → 3 in `migration.js`; v3→v4 step removed.
- `defaultShape(PARTITION_META)` literal 4 → 3 in `shapes.js`; validator `liveTabId` branch removed.
- All 15 R3 tests + 2 R5 tests (delete from `floating-shape`, `floating-position`, `floating-multi`, `b132-cold-start-inheritance`, `b134-tab-drag-reorder`, `migration-steps`, `migration-fresh-install`).
- Fixture updates in `b013-opener-chain.test.js`, `b018-persistence.test.js`, `b121-floating-group-render.test.js`.
- `docs/UAT_B-137.md` (R5 deliverable).

**Storage rollback (lazy self-revert — forward-readable):**
- v4 records carrying `liveTabId` continue to function under the v3 validator (no `extraKey` rejection clause at `shapes.js:225` per R2 §66.16.3 — verified). Reads on rolled-back code use 2-tier position+URL; the extra `liveTabId` field is silently ignored.
- `tj:meta.schemaVersion` reverts to 3 via the rollback commit's `defaultShape` literal.
- Lazy migration self-rolls-back: any post-rollback write skips the `liveTabId` stamp (`appendFloatingGroup` validator branch removed); any read tolerates the field's presence on legacy-v4 records by ignoring it.
- **Zero data loss; SEV3 rollback at worst** (re-introduces post-S40 Issue 2 + Issue 3 user-visible bugs the migration was filed to fix).

**SW module-cache flush note (mandatory per C-1a):**
- After rollback, the user MUST toggle the extension OFF then ON in `chrome://extensions` to flush the SW module cache. Same note required at the FORWARD upgrade. [release-manager] / [technical-writer] R7 must include this in `CHANGELOG.md` for v1.35.0 release.

**`inheritedTabs` / `claimsMirror` rollback:**
- `inheritedTabs` is ephemeral (SW-memory only). Rollback resets it on the next SW cold start; no persistent impact. `claimsMirror` contract unchanged.

**User-visible rollback impact:**
- Post-S40 Issue 2 (sibling-title displacement) returns: a freshly opened bookmark spawned via opener-chain may show a sibling's title in the floating row.
- Post-S40 Issue 3 (race-toast on rapid floating reorder) returns: `MSG_REORDER_FLOATING_MEMBERS` may fail with `ERR_RACE` toast under stale-`LiveTabIndex.entry.index` conditions.
- B-138 cleanup item (post-B-137 fallback removal) becomes inapplicable.
- No data loss; no broken flows for legacy v3 records.

### §66.18.11 — Open follow-ups (deferred to backlog)

- **B-138 — Post-B-137 `(windowId, tabIndex)` callers cleanup**: **DEFERRED.** Per S41 plan, B-138 was a Wave 1 Fast Track XS item with R3-time fold/defer decision delegated to the [frontend-engineer]. R3's actual disposition: **NOT folded into B-137 R3** because the position-fallback is required for legacy v3 records during the lazy-migration window. Removing the fallback now would break v3 → v4 self-healing at cold-start (the lazy-rewrite owner `reassociateFloatingGroups` consumes the position+URL fallback as the rebind heuristic per §66.7.4). The fallback can only be removed once telemetry / passage of time confirms zero v3 records remain in the wild — explicitly deferred per AC8(a) and §66.1 "Out of scope". B-138 status remains `in-progress` at sprint-close pending product-owner decision: (a) defer to Sprint 42+ pending observation window OR (b) close as `won't-fix-by-design` if the fallback is permanent due to the inability to guarantee zero-v3-cohort externally. **Recommendation: option (a) — defer to a future sprint when sufficient time has passed (e.g., S45+)** so the cleanup can be scheduled with confidence. R5 UAT-15 explicitly verifies the fallback REMAINS active for legacy v3 records as a regression guard for the deferred state.
- **[security-reviewer] L-1 — pre-S38 v1 records excluded from lazy-rewrite by design**: **NO ACTION REQUIRED.** Documented at §66.7.4. v1 records are now ≥ 4 sprints old; cumulative natural turnover has likely emptied this cohort. Records continue to render correctly via tier (b)/(c) fallback. Filed as advisory only.
- **[qa-reviewer] L-4 — UAT corner: tab navigated to different URL after binding**: **ROUTED TO R5 UAT-13.** Technically correct behavior (tab identity preserved via `liveTabId`); UAT confirms user perception matches. If single-frame visual glitch surfaces, R3-VERIFY 1 unlocks the URL-guard option (5-line addition to `floating-members.js` tier (a)).
- **R7 [technical-writer] CHANGELOG SW module-cache flush note**: flagged in C-1a (§66.2.1) and re-flagged in §66.18.10 above. Sprint 30 B-092 / Sprint 38 B-121 / Sprint 40 B-134 are precedents — all required this exact note. [scrum-master] should verify R7 work item is on the sprint-close checklist before [release-manager] cuts v1.35.0.
- **[security-reviewer] T-1 / T-2 UAT case suggestions**: routed to R5 UAT-5 + UAT-6 (close-during-cold-start; rapid close-and-reopen). Difficult-to-reproduce UAT-only signal classes; SHOULD be enumerated as SKIP if the product-owner UAT walkthrough cannot reproduce deterministically.

---

**End of §66.**
