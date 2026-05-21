# §71 — B-166 — `+` CTA on Floating Tab Promotes In-Place

**Status:** R2 LOCKED — Sprint 45 (v1.40.0 target, 2026-05-21).
**Anchor:** B-166 (P2 / S → auto-upgraded to Full M per the message-contract rule in `CLAUDE.md` Pipeline Tiers).
**Tier:** Full pipeline (M).
**Depends on:** B-148 ✅ (S44 close — `Group.renderOrder` + interleave), B-124 ✅ (S39 — floating-row `+` Save CTA), B-121 ✅ (S38 — floating-group write path).
**Author:** [solution-architect] (Opus). Written BEFORE R3 build per S44 retro action item 1 (chapter-first).

> **R2 plan chapter** (not an R6 as-built — this is the design that R3
> implements). Records the R0 PICK among the three pre-enumerated options,
> the atomic-swap mechanism inside the writeTransaction, the exhaustive
> test-assertion fix-scope enumeration (mandatory per the
> `CLAUDE.md` fix-scope subsection), and the AC ↔ design reconciliation
> matrix. R3 cannot start until the fix-scope table at §71.5 is verified
> 100% complete.

---

## §71.1 — Problem statement

Post-B-148 (S44, v1.39.0) a group's saved bookmarks and floating tabs
share a single ordered render slot vocabulary via `Group.renderOrder:
string[]` of prefix-encoded refs (`item:<id>` / `floating:<floatingTabId>`).
The B-148 design correctly maintains the array across 12 multi-partition
write sites (§68.5) — but one path was missed: **promoting a floating
tab to a saved bookmark via the floating-row `+` Save CTA**.

The current flow:

1. User has built an interleaved order, e.g., `[item:A, floating:F1, item:B, floating:F2]`.
2. User clicks the `+` button on `floating:F1`'s row.
3. `_onFloatingSaveCtaClick` (`sidepanel/sidepanel.js:3169-3196`) reads
   `row.dataset.tabId` and the enclosing `.group-section`'s `data-group-id`,
   dispatches `MSG_PROMOTE_TAB({ tabId, groupId })`.
4. SW handler at `background/messages/storage-handlers.js:373-413` calls
   `createItem({title, url, groupId})` — no positioning hint.
5. `createItem` at `background/storage/items.js:174-230` UNCONDITIONALLY
   appends: `renderOrder.push('item:' + item.id)` at `:207` and
   `sortOrder: bucketSize` at `:220`.

The result: `renderOrder` becomes `[item:A, floating:F1, item:B, floating:F2, item:NEW]`
— the new saved bookmark lands at the BOTTOM of the group instead of
taking over `F1`'s position. The visible row order collapses to
`[A, F1-orphan-row-hidden, B, F2, NEW]` because `buildFloatingMembers`
(`background/tabs/floating-members.js:139`) silently filters `F1` out
of the floatingMembers map (the tab is now claimed by `NEW`) — the
`floating:F1` ref in `renderOrder` resolves to nothing via the silent
stale-ref filter at `shared/render-order.js:55-57`.

The user-visible symptom: every `+` click on an interleaved floating
tab causes the new bookmark to **jump to the bottom** of the group.
The interleave order the user built up is destroyed one promote at a time.

**Architectural framing.** B-148 §68.5 was disciplined about maintaining
`renderOrder` across the 12 write sites it enumerated, but `MSG_PROMOTE_TAB`
was implicitly assumed to be a pass-through to `createItem` (which IS
B-148-compliant — it appends correctly). The miss is that **promote is
semantically a SWAP, not an append**: an existing slot in `renderOrder`
(the `floating:<id>` slot the user clicked) should become the new slot
(`item:<newId>`) at the same index. The fix is a thirteenth write-site
pattern (the SWAP) layered on top of the existing append behavior.

---

## §71.2 — R0 option analysis and PICK

The BACKLOG row for B-166 (`docs/BACKLOG.md:194`) pre-enumerated three
investigation candidates. R0 was implicit in the filing (no separate
spike was needed — the design surface is narrow and well-bounded by
B-148's renderOrder contract). R2 picks among the three.

### §71.2.1 — Options enumerated

| # | Option | Surface | Reusability | Risk |
|---|--------|---------|-------------|------|
| (a) | UI-side `replaceFloatingId: string` hint on MSG_PROMOTE_TAB payload | UI dataset + payload field + handler validator + `createItem` parameter | Scoped to MSG_PROMOTE_TAB caller only | LOW — additive optional field, backward-compatible fallback to append |
| (b) | SW-side detection — handler looks up `tabId` in `tj:floatingGroups` and infers the swap semantic | Handler only (UI unchanged) | Scoped to MSG_PROMOTE_TAB | MEDIUM — implicit; risks accidentally re-anchoring tabs that should append (e.g., URL-claim of a tab whose stale `tj:floatingGroups` record happens to remain) |
| (c) | General-purpose `createItem({insertAt: { groupId, ref: 'floating:<id>' }})` parameter | `createItem` API extension; first caller is MSG_PROMOTE_TAB | High — usable by future B-162 / Ctrl+Shift+T placement, manual "insert above" UX, etc. | MEDIUM — larger API surface change; speculative-generality risk (one caller today) |

### §71.2.2 — PICK: option (a)

R2 picks **option (a) — UI-side `replaceFloatingId` hint**.

**Rationale (one sentence):** option (a) is the smallest additive
extension that delivers the AC1 behavior with explicit intent (UI is
the layer that knows "this `+` was on `floating:F1`"), preserves full
backward compatibility for every other MSG_PROMOTE_TAB caller via
optional-field semantics, and stays within the established B-148
pattern of one additive optional field per write-path extension.

**Why not (b).** SW-side inference is implicit. A non-floating
promotion path (none exists today, but `MSG_PROMOTE_TAB` is also called
by the Open-Tabs Save flow via `_promoteFloatingTab` and other
candidate callers in the future) would inadvertently trigger the swap
if its `tabId` happens to be in `tj:floatingGroups` due to a stale or
orphaned record. The `tj:floatingGroups` partition is read-mostly at
runtime and can carry stale records between cold-start sweeps
(`floating-groups.js:120-220` reassociation only runs on SW boot).
A floating record for `tabId=N` could persist for the duration of an
SW lifetime even after `N` is claimed by an unrelated saved item.
Option (b) would treat that as a swap signal — wrong.

The UI surface, by contrast, has a single explicit handler
(`_onFloatingSaveCtaClick` at `sidepanel/sidepanel.js:3169`) that
fires ONLY when the user clicks the `+` on a `.item-row[data-floating="true"]`
row, and the row carries an EXPLICIT `dataset.floatingTabId` stamped
at row build (`sidepanel/sidepanel.js:3089-3091`). The intent is
unambiguous at the dispatch site; passing it through is one extra
field, not an inference.

**Why not (c).** `createItem({insertAt})` is a general-purpose API
change for a single caller. Speculative-generality argument fails: there
is no second caller queued. B-162 (Ctrl+Shift+T reopen) is still in R0
spike with three pre-enumerated options of its own; none of them
prescribe `insertAt` semantics. If B-162 R2 picks an option that wants
position-aware insert, retrofitting (c) on top of the option (a) field
is straightforward — the `replaceFloatingId` parameter can be
generalized to `insertAt` without breaking the existing single caller.
Building (c) now would commit to an API surface that hasn't been
validated by a second caller. Per `CLAUDE.md` Pipeline Tiers
"smallest-fix" principle, defer the generalization until a second
caller demands it.

### §71.2.3 — R2 Correctness Checklist application

| Check | Applies? | Status |
|-------|----------|--------|
| **C-1a/b** — Storage schema version + migration strategy | NO — `Group.renderOrder` field is unchanged; no new shape; no `KNOWN_VERSION` bump. The swap reuses the existing `renderOrder: string[]` field that schema v7 already declares. |
| **C-2** — Message contract typed | YES — MSG_PROMOTE_TAB payload extended from `{tabId, groupId}` to `{tabId, groupId, replaceFloatingId?: string}`. Field is OPTIONAL; absent payload preserves the current append behavior. Sender → SW contract documented at §71.4. |
| **C-3** — SW cold-start safe | YES — no new module-scoped state. The swap is per-call inside `createItem`'s writeTransaction; no cold-start hydration required. |
| **C-4** — ID stability | YES — `replaceFloatingId` is the `floatingTabId` (a ulid stamped at `appendFloatingGroup`-time, §60.4 D-1), which is stable across SW idle / wake / restart cycles per B-137 §66 contract. The hint outlives any tabId rotation Chromium may perform. |
| **C-5** — Manifest file references | N/A — no manifest changes. |
| **C-6** — Permission minimization | N/A — no new permissions. |
| **C-7** — Allow-list direction | YES — handler validator at `storage-handlers.js:373-413` adds an explicit type check: `replaceFloatingId` must be a non-empty string of length ≤ 32 (ulid length + buffer; the existing `MAX_REF_LENGTH = 64` from `shapes.js:30` covers the prefix+id combined ref but the field here is the bare id, not the prefixed ref). Any other type → `ERR_VALIDATION`. Defaults to no-op (absent → append). Allow-list (whitelist exact predicate), not deny-list. |
| **C-8** — SW-context feasibility | N/A — no new browser APIs. |
| **C-9** — Empty-state design | YES — see AC2 / AC3 / AC4 / AC5 in §71.6. Three carve-outs reasoned through: legacy pre-S38 records (no `floatingTabId`), group-deleted-mid-flight (Ungrouped fallback), tab-closed-mid-flight (ERR_NOT_FOUND toast). |
| **C-10** — Off-screen rect feasibility | N/A — no canvas / setDragImage. |
| **C-11** — Popup-lifecycle message ordering | N/A — MSG_PROMOTE_TAB fires from the sidepanel, not the popup; no focus-shift teardown. |
| **C-12** — Manifest declaration runtime-mutability | N/A — no manifest declaration. |
| **C-13** — Chrome event-feedback completeness | YES — no new `chrome.*` write APIs; the existing claim machinery (`claimTabForItem` at `tab-claims.js:376`) handles the claim mirror update, and the existing `buildFloatingMembers` claim-filter (`floating-members.js:137-139`) hides the now-orphaned floating record from the floatingMembers map. The new `replaceFloatingId` parameter on `createItem` strips the `floating:<id>` ref from `Group.renderOrder` AND prunes the `tj:floatingGroups` record in the same writeTransaction — see §71.3.2 for the third-partition mutator. |
| **C-14** — Generation-counter content predicate | N/A — no new generation counters; this work uses the existing `Group.renderOrder` field that is already counter-aware via the B-148 broadcast fast-path (§68.8.1). |
| **C-15** — Browser-API rejection-string contract | N/A — no `_classifyError` substring predicates added. |

---

## §71.3 — Architecture: the atomic-swap mechanism

### §71.3.1 — Sequence

1. User clicks `+` on `floating:F1`'s row. `_onFloatingSaveCtaClick`
   (`sidepanel/sidepanel.js:3169`) extracts `tabId = Number(row.dataset.tabId)`
   AND `replaceFloatingId = row.dataset.floatingTabId || undefined`.
2. UI dispatches `sendMessage(MSG_PROMOTE_TAB, { tabId, groupId, replaceFloatingId })`.
   The field is omitted if the row is a pre-S38 legacy floating record
   that lacks `floatingTabId` (the `dataset.floatingTabId` attribute is
   stamped only when `member.floatingTabId` is a non-empty string;
   see `sidepanel/sidepanel.js:3089-3091`).
3. SW handler validates the new optional field per §71.4, fetches the
   tab via `chrome.tabs.get(tabId)`, and calls
   `createItem({ title, url, groupId, replaceFloatingId })`.
4. `createItem` runs its existing 2-partition `writeTransaction`
   (`background/storage/items.js:193-229`) with two changes:
   - The `PARTITION_GROUPS` mutator (currently appends `'item:' + item.id`
     at `:207`) is extended: if `input.replaceFloatingId` is set AND
     the group's `renderOrder` contains `'floating:' + input.replaceFloatingId`,
     SPLICE-REPLACE that slot in-place (1-for-1). Otherwise fall back to
     the current append behavior. The mutator stays a single pass over
     `renderOrder`.
   - A THIRD partition mutator (`PARTITION_FLOATING_GROUPS`) is added
     when `input.replaceFloatingId` is set, that strips the record
     whose `floatingTabId === input.replaceFloatingId` from the
     floating-groups partition. Idempotent — no-op if the record is
     already gone (e.g., concurrent prune).
5. `MSG_PROMOTE_TAB` handler awaits `createItem` then awaits
   `claimTabForItem(newItem.id, p.tabId)` per the existing B-103 §51
   atomicity invariant. Order is preserved.
6. The handler returns `newItem`; the broadcast (`SCOPE.ITEMS`) fires;
   the sidepanel re-fetches via MSG_LIST_ITEMS and renders the new
   `renderOrder` via `resolveRenderOrder` — the `item:<newId>` now sits
   at `F1`'s old index, no bottom-jump.

### §71.3.2 — The three-partition atomic transaction

The B-148 §68.5 pattern: every write site that adds/removes/repositions
records participates in a multi-partition `writeTransaction` (single
`chrome.storage.local.set()` call internally — see
`background/storage/write-transaction.js`). The B-166 swap extends
`createItem`'s writeTransaction from 2 partitions to 3 (only when
`replaceFloatingId` is set):

```
writeTransaction([
  { partition: PARTITION_GROUPS,          mutator: groupsMutator         },
  { partition: PARTITION_ITEMS,           mutator: itemsMutator          },
  { partition: PARTITION_FLOATING_GROUPS, mutator: floatingGroupsMutator }, // NEW (B-166)
]);
```

The `groupsMutator` body becomes a small SKETCH:

```js
mutator: (groups) => {
  groupsSnapshot = groups;
  if (item.groupId === null) return groups;
  const idx = groups.findIndex((g) => g.id === item.groupId);
  if (idx < 0) return groups;
  const g = groups[idx];
  const renderOrder = Array.isArray(g.renderOrder) ? [...g.renderOrder] : [];
  // B-166 swap-or-append fork:
  let didSwap = false;
  if (typeof input.replaceFloatingId === 'string' && input.replaceFloatingId.length > 0) {
    const swapRef = 'floating:' + input.replaceFloatingId;
    const swapIdx = renderOrder.indexOf(swapRef);
    if (swapIdx >= 0) {
      renderOrder[swapIdx] = 'item:' + item.id;
      didSwap = true;
    }
  }
  if (!didSwap) renderOrder.push('item:' + item.id);  // fallback — preserves current behavior
  const next = [...groups];
  next[idx] = { ...g, renderOrder, updatedAt: Date.now() };
  return next;
}
```

The `floatingGroupsMutator` body is even simpler:

```js
mutator: (records) => {
  if (!Array.isArray(records) || records.length === 0) return records;
  if (typeof input.replaceFloatingId !== 'string') return records;
  const next = records.filter((r) => r?.floatingTabId !== input.replaceFloatingId);
  return next.length === records.length ? records : next;
}
```

The mutator is **content-conditional** — returns the same reference if
no record matched, so `writeTransaction` short-circuits the
`chrome.storage.set` call when there's nothing to prune. This mirrors
the §68.6 idempotency-fast-path precedent for `bootstrapAndSweepRenderOrder`.

The `itemsMutator` is unchanged from current behavior (still appends
the new item with `sortOrder = bucketSize` and runs
`normaliseGroupSortOrders`). `Item.sortOrder` semantically defers to
`renderOrder` post-B-148 anyway — the visible interleave is driven by
`renderOrder`, not `sortOrder`. The `Item.sortOrder` value of "appended
at end of bucket" is preserved because changing it would require a
fourth-mutator extension AND would conflict with the renderOrder-driven
visible position (which is exactly the point — `sortOrder` is now a
fallback-only field for groups WITHOUT renderOrder, per B-148 §68.4
bootstrap path).

### §71.3.3 — Why an in-transaction swap (and not a follow-on prune)

Three alternatives considered and rejected:

1. **Post-promote follow-on writeTransaction** — `MSG_PROMOTE_TAB`
   handler calls `createItem` then runs a SECOND writeTransaction that
   rewrites `Group.renderOrder` (swap the appended ref into place).
   REJECTED: violates B-148 §68.5 atomicity precedent (every other
   write site keeps renderOrder consistent in the same transaction);
   exposes a window where `renderOrder` has `[item:A, floating:F1, ..., item:NEW]`
   (NEW appended to bottom, F1 still present) — if the SW dies between
   the two transactions, the user sees the bottom-jump bug AND has a
   stale `floating:F1` slot in renderOrder. Cold-start sweep would heal
   it, but the user-visible UX is wrong until then.
2. **Resolver-side dedup** — let `createItem` append blindly, but
   teach `shared/render-order.js:46-60` to detect `[..., floating:F1, ..., item:NEW]`
   where `NEW.url === F1.url` (or where the tab claimed by NEW is the
   same tabId F1 resolves to) and visually slot NEW at F1's index.
   REJECTED: pushes the swap semantic into the resolver, which is a
   PURE function with no chrome.* / no storage / no side-effects
   (§68.4) — adding claim-mirror awareness would break the purity
   contract. Also, the resolver runs on every render, including
   broadcast fast-path — the cost of N url-comparison passes per
   render is unbounded.
3. **`updateItem` extension on the newly-created item** — let
   `createItem` append, then call `updateItem(newItem.id, { renderOrderRef: 'floating:F1' })`
   to swap. REJECTED: `updateItem`'s current allow-list
   (`background/storage/groups.js:119`, `background/storage/items.js:57-114`)
   doesn't accept renderOrder mutations on items (only on groups,
   per B-148 §68.3.3) — adding it would widen the validator surface
   AND introduce a non-atomic 2-step flow.

The in-transaction swap is the only design that satisfies (a) atomicity,
(b) resolver purity, (c) single-call API for the dispatch surface, and
(d) zero exposure window for the stale `floating:F1` ref.

---

## §71.4 — Message contract delta

### §71.4.1 — Payload extension

| Aspect | Pre-B-166 (v1.39.0) | Post-B-166 (v1.40.0) |
|--------|---------------------|----------------------|
| Type | `MSG_PROMOTE_TAB = 'tj/promoteTab'` (`shared/messages.js:35`) | unchanged |
| Required fields | `tabId: number`, `groupId: string \| null` | unchanged |
| Optional fields | _none_ | `replaceFloatingId?: string` |
| Response (on success) | `{ ok: true, data: Item }` | unchanged |
| Response (on failure) | `{ ok: false, error: { code, message } }` | unchanged |

### §71.4.2 — Validator

The handler at `background/messages/storage-handlers.js:373-417` adds
one validator clause AFTER the existing `tabId` and `groupId` checks
(§71.5 lists the precise line range):

```js
// B-166 — OPTIONAL replaceFloatingId. Reject any value of the field that
// is present but not a non-empty string. Allow-list direction per C-7.
if (p.replaceFloatingId !== undefined) {
  if (typeof p.replaceFloatingId !== 'string' || p.replaceFloatingId.length === 0) {
    throw new StorageError(ERR_VALIDATION, 'promoteTab: replaceFloatingId must be a non-empty string');
  }
  if (p.replaceFloatingId.length > 32) {
    // ulid is 26 chars; guard against accidental over-long payloads
    throw new StorageError(ERR_VALIDATION, 'promoteTab: replaceFloatingId too long');
  }
}
```

The hint is then passed through to `createItem` as `replaceFloatingId`
on the input object. `createItem`'s `validateNewItem`
(`background/storage/items.js:28-55`) ignores the field by design (the
existing validator is shape-allow-list for `title`/`url`/`groupId`;
unknown fields pass through without write). The mutators consume the
field directly.

### §71.4.3 — Backward compatibility

The contract is strictly additive. Pre-B-166 callers (every existing
test, the Open-Tabs Save flow at `sidepanel.js:6233`, the right-click
Save-to-group picker) dispatch `{ tabId, groupId }` with NO
`replaceFloatingId` — the handler's optional-field check passes (the
field is `undefined`); `createItem` enters the original append branch
unchanged. No existing caller breaks.

The B-148 §68.7.3 precedent for additive payload extension
(`MSG_REORDER_FLOATING_MEMBERS` accepting BOTH legacy `orderedTabIds`
AND new `renderOrder`) is the closest analog. Same pattern applied
here.

---

## §71.5 — Fix scope: code + test enumeration

Per the `CLAUDE.md` "Fix-scope test-assertion enumeration" mandatory
subsection — this section enumerates EVERY file R3 touches AND every
test file that asserts a pre-change contract that needs updating.
**R3 cannot start until this enumeration is complete and verified.**

### §71.5.1 — Code files touched

| # | File | Lines (approx) | Change |
|---|------|----------------|--------|
| 1 | `sidepanel/sidepanel.js` | `3169-3196` | `_onFloatingSaveCtaClick` extracts `row.dataset.floatingTabId` (already-stamped at `:3089-3091`); includes it as `replaceFloatingId` in the MSG_PROMOTE_TAB payload when non-empty. |
| 2 | `background/messages/storage-handlers.js` | `373-417` | Add `replaceFloatingId` validator after `groupId` validator; pass through to `createItem({ title, url, groupId, replaceFloatingId })`. |
| 3 | `background/storage/items.js` | `170-230` | `createItem({title, url, groupId, replaceFloatingId?})`: extend groups mutator with the swap-or-append fork; add third partition mutator (PARTITION_FLOATING_GROUPS) that strips the record by `floatingTabId` when `replaceFloatingId` is set. JSDoc updated. |
| 4 | _(none)_ | _(none)_ | `shared/messages.js` unchanged — no new message type, no new constant. |
| 5 | _(none)_ | _(none)_ | `shared/render-order.js` unchanged — the swap happens in `Group.renderOrder` upstream of the resolver. |

### §71.5.2 — Test files that pin pre-change contracts (MUST update)

Format per the CLAUDE.md subsection: `file:line — asserts <pre-change contract>; update to <post-change contract>`.

| # | Test file:line | Asserts (pre-B-166) | Update (post-B-166) |
|---|----------------|---------------------|---------------------|
| 1 | `tests/b124-floating-visual.test.js:218-252` | T-124-D regex pins the EXACT dispatch shape `sendMessage(MSG_PROMOTE_TAB, { tabId, groupId })` at `:250`. | Update the regex to accept `{ tabId, groupId }` OR `{ tabId, groupId, replaceFloatingId }` (the latter is what B-166 emits when the row has `dataset.floatingTabId`). Suggested regex: `/sendMessage\(MSG_PROMOTE_TAB,\s*\{\s*tabId,\s*groupId(?:,\s*replaceFloatingId)?\s*\}\)/`. The test header docstring at `:215` and `:25` should also mention the optional third field. |

That is the ONLY existing test assertion that pins the changed contract.
A grep audit confirms:

```
$ grep -rn "MSG_PROMOTE_TAB\|replaceFloatingId\|floatingTabId" tests/
```

returns:
- `tests/b124-floating-visual.test.js:250` — the pin above (MUST update).
- `tests/promote-tab.test.js:225` + `tests/b103-promote-duplicate.test.js:126,226,348` + `tests/b121-floating-group-render.test.js:531` — all dispatch `{ tabId, groupId }` WITHOUT `replaceFloatingId`; the optional-field design preserves backward compatibility so these tests continue to PASS unchanged (the append branch still fires).
- `tests/b148-renderorder-write-paths.test.js:10-28` — `createItem` append-to-renderOrder tests; ALL pass `{title, url, groupId}` WITHOUT `replaceFloatingId`; the append branch still fires; no update needed.
- `tests/b029-group-picker.test.js:309-333` — Open-Tabs menu group-picker flow; surface-mocked (`dispatchSave = () => saved.push({tabId, groupId})`); not a source-text pin on the actual dispatch shape; unchanged.
- `tests/b059-duplicate-warn.test.js:14-200` — duplicate-warn flow; surface-mocked via `ctx._dispatched.push({ payload })`; not a source-text pin; unchanged.
- `tests/b124-floating-visual.test.js:344-350` — `_promoteFloatingTab` (newtab Open-Tabs path); regex pin is the coarse `/type:\s*MSG_PROMOTE_TAB/` which accepts any payload shape; unchanged.

Total enumerated: 1 test file requires an update (T-124-D regex), 6 additional test files continue to PASS unchanged. R3 must run the full test suite post-edit to confirm.

### §71.5.3 — New test file (R5)

| File | Estimated LOC | Cases (planned) |
|------|---------------|-----------------|
| `tests/b166-promote-in-place.test.js` | ~150 | T1 (AC1): swap happens — renderOrder `[item:A, floating:F1, item:B]` + promote F1 → `[item:A, item:NEW, item:B]`. T2 (AC1): swap preserves slots before/after F1 unchanged. T3 (AC6): `tj:floatingGroups` record for F1 is pruned in the same transaction. T4 (AC2): legacy row WITHOUT `dataset.floatingTabId` → payload omits `replaceFloatingId` → append fallback. T5 (AC3): `groupId === null` + `replaceFloatingId` set → mutator's `item.groupId === null` early-return guard fires; no swap attempted (Ungrouped has no renderOrder). T6 (AC4): tab closed mid-flight → `chrome.tabs.get` rejects → ERR_NOT_FOUND surfaces; no partial write. T7 (AC5): existing pre-B-166 payload shape `{tabId, groupId}` (no `replaceFloatingId`) → append behavior unchanged (regression guard for the duplicate-URL / Open-Tabs Save path). T8 (AC6): `replaceFloatingId` set but the ref is NOT in `renderOrder` (race or stale UI snapshot) → fallback to append; no orphan / no duplicate created. T9 (C-7): `replaceFloatingId` is not a string (number / boolean / object) → `ERR_VALIDATION`. T10 (C-7): `replaceFloatingId` is an empty string → `ERR_VALIDATION`. |

### §71.5.4 — Tests that should continue to PASS unchanged

Listed for R3's reproduction-confidence:

- `tests/promote-tab.test.js` (entire file, 9 tests) — all use `{tabId, groupId}` payloads; the optional-field design keeps every test green.
- `tests/b103-promote-duplicate.test.js` (entire file, 5 tests including the source-text atomicity pin at `:163-208`) — the source-text pin asserts `await createItem` and `await claimTabForItem` exist; R3 must preserve both awaits in order. The MSG_PROMOTE_TAB handler body grows by ~10 lines (the validator clause) but the await sequence is unchanged.
- `tests/b121-floating-group-render.test.js:477-595` (T-121-D) — promote with explicit `{tabId, groupId: 'group-D'}`; renderOrder for `group-D` is empty in the test seed, so the swap-or-append fork falls through to append; the test continues to assert the floating record is dropped from `buildFloatingMembers` (the claim mirror filter handles that, unchanged).
- `tests/b148-renderorder-write-paths.test.js:10-28` — `createItem` append-only tests; the input `{title, url, groupId}` lacks `replaceFloatingId` so the original append branch fires.
- All other `tests/b148-*.test.js`, `tests/b121-*.test.js`, `tests/floating-*.test.js` — none reference MSG_PROMOTE_TAB or the `replaceFloatingId` field; unaffected.

---

## §71.6 — AC ↔ design reconciliation

Per the R1 LOCKED AC summary in `docs/SPRINT.md:88-101`, B-166 has 6
testable acceptance criteria. The design above satisfies each as
follows.

### §71.6.1 — AC1 (happy path: in-place position preservation)

When the user clicks `+` on `floating:F1` in `renderOrder = [item:A, floating:F1, item:B, floating:F2]`:

- UI handler reads `row.dataset.floatingTabId = F1.floatingTabId` (a
  ulid), passes it as `replaceFloatingId` in the MSG_PROMOTE_TAB
  payload.
- SW handler validates per §71.4.2; calls `createItem` with the hint.
- `createItem`'s GROUPS mutator finds `'floating:' + F1.floatingTabId`
  at index 1 of `renderOrder`; splices `'item:' + newItem.id` in place
  (1-for-1 replacement, NOT insert).
- FLOATING_GROUPS mutator strips the F1 record from `tj:floatingGroups`.
- ITEMS mutator appends `newItem` with `sortOrder = bucketSize`.
- All three mutators run inside a single `writeTransaction` → atomic.
- Post-render: `renderOrder = [item:A, item:NEW, item:B, floating:F2]`
  — F1's interleaved position is preserved by `NEW`. **AC1 satisfied.**

### §71.6.2 — AC2 (pre-S38 legacy fallback: no `floatingTabId` → append)

Pre-S38 (before B-121 §60.4 D-1, which introduced the stamped ulid
`floatingTabId`) floating-group records lack the `floatingTabId` field.
The row builder at `sidepanel/sidepanel.js:3089-3091` ONLY stamps
`row.dataset.floatingTabId` when `member.floatingTabId` is a non-empty
string. So for a legacy member:

- `_onFloatingSaveCtaClick` extracts `row.dataset.floatingTabId` →
  `undefined`. The handler omits `replaceFloatingId` from the dispatched
  payload.
- SW handler's validator passes (optional field absent).
- `createItem` enters the original append branch (no swap attempted).
- Post-render: new bookmark appends to the group's end — the legacy
  pre-B-148 behavior. **AC2 satisfied** (graceful degradation; legacy
  records simply don't benefit from the swap, which matches the
  pre-fix UX and is documented as known-acceptable in the AC).

### §71.6.3 — AC3 (group-deleted-mid-flight: defensive Ungrouped fallback)

Per the existing C-9 empty-state defense at `sidepanel/sidepanel.js:3178-3182`:

```js
const section = row.closest('.group-section[data-group-id]');
let groupId = section?.dataset.groupId || null;
if (groupId && !_cachedGroups.some((g) => g.id === groupId)) {
  groupId = null;
}
```

If the group has been deleted between row-hover and `+` click, `groupId`
becomes `null`. The handler still dispatches the payload (possibly with
`replaceFloatingId` if the row had `floatingTabId`). The SW path:

- `createItem` runs the GROUPS mutator; the early-return at
  `items.js:202` (`if (item.groupId === null) return groups;`) fires
  BEFORE the swap fork. The swap is silently skipped — the new
  bookmark lands in Ungrouped (no `renderOrder` for Ungrouped — items
  there render via `Item.sortOrder` per the bootstrap-fallback in
  `shared/render-order.js:64-73`).
- The FLOATING_GROUPS mutator still runs and prunes the F1 record (the
  prune is independent of `groupId`). This is a minor invariant: even
  if the swap can't happen (no group), the orphan floating record is
  still cleaned up — atomicity preserved within the prune.

**AC3 satisfied** — defensive Ungrouped fallback works; no exception,
no orphan, no bottom-of-group jump (because there's no group).

### §71.6.4 — AC4 (tab-closed-mid-flight: ERR_NOT_FOUND toast path)

If the user closes the tab between `+` hover and click, or
`chrome.tabs.onRemoved` fires between dispatch and handler entry:

- SW handler runs `chrome.tabs.get(p.tabId)` at `storage-handlers.js:386-389`
  — rejects with `tab not found`. Wrapped as `StorageError(ERR_NOT_FOUND, 'tab not found')`.
- Handler returns BEFORE calling `createItem` — no partial write, no
  renderOrder mutation.
- UI catches via `.catch(err => ... showToast('Couldn't save tab — try again'))`
  at `sidepanel/sidepanel.js:3192-3193`.

The `pruneFloatingGroupsByLiveTabId` cleanup for the closed tab fires
via the existing tab-events listener at `background/tabs/tab-events.js:328-329`
— the orphan floating record is cleaned up by the existing mechanism,
not by B-166's swap mutator. **AC4 satisfied** — error path unchanged
from pre-B-166; the new field doesn't interfere.

### §71.6.5 — AC5 (out-of-scope paths regression-free)

Two paths are explicitly OUT OF SCOPE for B-166:

1. **Right-click `_openOpenTabContextMenu` "Save to group" picker** —
   this path dispatches MSG_PROMOTE_TAB from a context menu with a
   user-picked group, NOT from a floating-row `+` click. The dispatch
   site (a different sidepanel function entirely) does NOT include
   `replaceFloatingId`. The handler validator's optional-field check
   passes (field is `undefined`); the append branch fires. No
   regression: the cross-group save UX intentionally appends at the
   target group's end.
2. **Open-Tabs Save flow** — `_promoteFloatingTab` at
   `sidepanel/sidepanel.js:~6233` (B-124 T-124-G test pins the dispatch
   shape). Open-Tabs rows have NO group, so `groupId === null` and the
   swap mutator's group early-return fires regardless of whether
   `replaceFloatingId` is set. No regression: Open-Tabs save lands the
   new bookmark in the user-picked group (via a separate group picker
   flow), and that flow appends.

A grep of the codebase for `MSG_PROMOTE_TAB` reveals these two as the
only sender sites outside `_onFloatingSaveCtaClick`. **AC5 satisfied**.

### §71.6.6 — AC6 (renderOrder integrity: 1-for-1 swap, no orphans/duplicates)

The mutator design ensures:

- The swap is a SPLICE-REPLACE (`renderOrder[swapIdx] = 'item:' + item.id`),
  NOT a splice-insert. The `renderOrder.length` is invariant across
  the swap. No duplication of slots.
- Both the `floating:<id>` removal AND the `item:<id>` addition happen
  in the same array operation, in the same mutator, in the same
  writeTransaction. No interleaved read can see a state where both
  refs exist OR neither exists.
- The FLOATING_GROUPS mutator strips the corresponding `floatingGroup`
  record in the same writeTransaction. No orphan record persists.
- The `didSwap = false` fallback to append fires only when
  `replaceFloatingId` was set but the ref was NOT in `renderOrder`
  (e.g., the user dragged F1 out of this group between dispatch and
  handler entry, OR the row's `dataset.floatingTabId` was stale). The
  append branch produces no duplicate (the new `item:<id>` is fresh).
- The B-148 resolver's silent-stale-ref filter
  (`shared/render-order.js:55-57`) is a no-op in the swap case — there
  are no stale refs after the splice-replace.
- The cold-start `bootstrapAndSweepRenderOrder` pass
  (`floating-groups.js:1142-1248`) re-validates renderOrder against
  the live items + floating records on next SW boot; any pathological
  state (which the design prevents) would self-heal there.

**AC6 satisfied** — 1-for-1 swap, atomic, no orphans, no duplicates.

---

## §71.7 — Rollback plan

**No rollback is required beyond reverting the commit.**

- **No schema change.** `Group.renderOrder` already exists from B-148
  (schema v7); the swap reuses the existing field. `KNOWN_VERSION`
  stays at 7.
- **No migration.** No on-disk shape changes; no `MIGRATION_STEPS`
  entry needed.
- **No new permission.** `manifest.json` unchanged.
- **No new message type.** `shared/messages.js` unchanged.
- **Backward-compatible payload.** Pre-B-166 builds reading a v1.40.0
  storage profile see the same `renderOrder: string[]` field they
  already know about. v1.39.0 dispatch sites continue to dispatch the
  old `{tabId, groupId}` payload; the v1.40.0 handler accepts both.
- **Forward-compatible payload.** v1.40.0 dispatch site sends
  `{tabId, groupId, replaceFloatingId}` — but a downgraded v1.39.0
  handler simply ignores the extra field (the v1.39.0 handler at
  `storage-handlers.js:373-413` reads only `p.tabId` and `p.groupId`,
  per the read at `:375,378`). No throw, no error envelope.

Rollback procedure:

1. `git revert <B-166 commit SHA>` on `release/v2`.
2. Existing `Group.renderOrder` field continues to function under
   v1.39.0 semantics (append-only on promote).
3. Any `tj:floatingGroups` record that the v1.40.0 swap pruned BEFORE
   rollback is permanently gone — but the corresponding `item:<newId>`
   is still in storage as a valid saved bookmark with a working claim.
   No data loss (the bookmark itself is intact; only the now-redundant
   pre-promote floating record is gone, and that record was never
   user-visible after the promote).

Per the §68.12 / S38–S44 established policy: forward-fix preferred.
SEV1 would require manual `tj:meta.schemaVersion` reset, but no schema
change is involved here, so no SEV1 scenario is plausible.

---

## §71.8 — Performance

**Zero additional storage reads. Zero net new partition touches per call.**

- The 2-partition writeTransaction (`PARTITION_GROUPS` + `PARTITION_ITEMS`)
  that `createItem` already runs becomes a 3-partition writeTransaction
  ONLY when `replaceFloatingId` is set. The third partition
  (`PARTITION_FLOATING_GROUPS`) is read+written inside the same
  internal `chrome.storage.local.get` and `chrome.storage.local.set`
  cycle (`background/storage/write-transaction.js` batches per-partition
  reads into a single `get([...keys])` call and per-partition writes
  into a single `set({...})` call).
- For the legacy path (`replaceFloatingId === undefined`), the
  writeTransaction is unchanged — same 2 partitions, same latency.
- The groups mutator adds one `Array.indexOf` call (O(N) over the
  group's `renderOrder` length, typically < 50 refs). Negligible.
- The floating-groups mutator adds one `Array.filter` (O(M) over the
  whole `tj:floatingGroups` partition, typically < 200 records).
  Negligible; content-conditional skip returns the same reference
  when nothing matched.
- No new broadcast scope. `MSG_PROMOTE_TAB` already broadcasts
  `SCOPE.ITEMS` per the existing `MUTATION_BROADCASTS` table
  (`storage-handlers.js:137`). The B-148 fast-path
  `renderOrderChanged` predicate (§68.8.1) already detects renderOrder
  drift on this broadcast and forces a full `renderAll` — the new
  swap shows up correctly without any patch-path change.

Performance budget per the `CLAUDE.md` "Performance Standards" — well
inside the 50ms search target and the 200ms first-paint target. No
new full-collection reads. No N+1 patterns. No new generation counter
trips (the existing `_cachedItemsGen` / renderOrder bump per the B-148
fast-path is the single trip that already happens).

---

## §71.9 — Tests planned for R5

Mirrors the §68.10.1 format. R5 [test-engineer] writes both unit
tests AND performs UAT.

### §71.9.1 — Automated tests (new file)

`tests/b166-promote-in-place.test.js` — ~150 LOC, ~10 cases:

| # | Case | Surface | Assertion |
|---|------|---------|-----------|
| T1 | AC1: swap happens — interleaved `[item:A, floating:F1, item:B]` + promote F1 → `[item:A, item:NEW, item:B]` | end-to-end via SW dispatch (`tests/promote-tab.test.js` helper pattern) | `getGroup(g.id).renderOrder` deep-equals the expected post-swap array |
| T2 | AC1: slots before AND after the swap target are preserved (no shift, no duplication) | end-to-end | `renderOrder.length` unchanged; slot[0] and slot[2] are byte-identical to pre-swap |
| T3 | AC6: `tj:floatingGroups` record for F1 is pruned atomically | end-to-end | `readPartition(PARTITION_FLOATING_GROUPS)` does NOT contain the F1 record post-promote |
| T4 | AC2: legacy row without `dataset.floatingTabId` → payload omits `replaceFloatingId` → append fallback fires; renderOrder grows by 1 with `item:NEW` at the end | end-to-end | renderOrder post-promote is `[item:A, floating:F1, item:B, item:NEW]` (F1 retained because hint was absent) |
| T5 | AC3: `groupId === null` + `replaceFloatingId` set → no swap (Ungrouped early-return) | end-to-end | new item is in `tj:items` with `groupId === null`; no group's renderOrder changed |
| T6 | AC4: tab closed mid-flight → `chrome.tabs.get` rejects → ERR_NOT_FOUND surfaces; no partial write | end-to-end | response envelope is `{ok: false, error: {code: ERR_NOT_FOUND}}`; `tj:items` unchanged; `tj:groups[g].renderOrder` unchanged; `tj:floatingGroups` unchanged |
| T7 | AC5 regression guard: pre-B-166 dispatch shape `{tabId, groupId}` (no `replaceFloatingId`) → append branch fires | end-to-end | renderOrder post-promote has `item:NEW` appended at the end (NOT swapped) |
| T8 | AC6 stale-hint guard: `replaceFloatingId = 'NONEXISTENT_ULID'` → no swap, append fallback fires; no orphan / no duplicate; FLOATING_GROUPS mutator no-op | end-to-end | renderOrder ends with `item:NEW` appended; `tj:floatingGroups` unchanged from pre-call |
| T9 | C-7 validator: `replaceFloatingId = 42` (number) → `ERR_VALIDATION` | dispatch | response envelope is `{ok: false, error: {code: ERR_VALIDATION}}`; no write |
| T10 | C-7 validator: `replaceFloatingId = ''` (empty string) → `ERR_VALIDATION` | dispatch | same as T9 |

### §71.9.2 — Existing test deltas

| File | Δ LOC | Change |
|------|-------|--------|
| `tests/b124-floating-visual.test.js` | +2/-2 (line 250 regex) | Update T-124-D regex to allow optional `replaceFloatingId` field per §71.5.2 |
| _(none other)_ | _(none)_ | Per §71.5.4 — all other promote tests continue to PASS unchanged. |

### §71.9.3 — UAT script (planned, R5)

UAT script will be created at `docs/UAT_B-166.md` (mirroring `docs/UAT_B-148.md`)
with the following test cases:

1. **Happy path interleave**: build `[item:A, floating:F1, item:B, floating:F2]` via drag (B-148 path); click `+` on F1's row; verify the row sequence post-render is `[A, NEW, B, F2]` (NEW replaces F1 at the same index) AND that the row is now a saved bookmark (no dotted-bar, no `+` CTA visible).
2. **Persistence across reload**: repeat case 1; reload the extension via `edge://extensions` toggle OFF→ON; verify the rendered order is unchanged.
3. **Legacy floating member (pre-S38 simulation)**: manually edit `tj:floatingGroups` in the SW console to strip a record's `floatingTabId` field; click `+` on its row; verify graceful append-to-bottom (AC2 documented degradation).
4. **Group deleted mid-flight**: open `+` hover on F1; delete the group via context menu (R-click → Delete group, confirm dialog); click `+`; verify the new bookmark lands in Ungrouped (AC3) AND verify the floating record is gone from `tj:floatingGroups`.
5. **Tab closed mid-flight**: open `+` hover on F1; in the tab strip, close the corresponding tab; click `+`; verify the toast "Couldn't save tab — try again" appears AND no partial write surfaces in `tj:items` / `tj:groups` / `tj:floatingGroups` (AC4).
6. **Right-click "Save to group" picker NOT regressed (AC5)**: right-click an Open-Tabs row, pick "Save to group" → target group; verify the new bookmark lands at the BOTTOM of the target group (pre-B-166 behavior preserved; cross-group save intentionally appends).
7. **Open-Tabs Save flow NOT regressed (AC5)**: hover an Open-Tabs row; click its `+`; pick a group via the group picker; verify the new bookmark lands at the BOTTOM of the picked group.

UAT lean-mode smoke (case 8): toggle `prefersLean` ON; repeat case 1; verify the lean-mode path still routes through MSG_PROMOTE_TAB and the swap still works.

---

## §71.10 — Future work / known limitations

- **Other position-aware insert callers.** If B-162 (Ctrl+Shift+T reopen lands in original group) R2 picks an option that wants
  position-aware insert (e.g., insert "above the opener position"), the `replaceFloatingId` parameter
  on `createItem` is a candidate for generalization to `insertAt: { ref: string }`
  (option (c) in §71.2). The generalization is straightforward — the
  field's semantic of "find this ref in renderOrder, splice-replace at
  that index OR fall back to append" extends cleanly. R2 for B-162
  should evaluate whether to retrofit at that time.
- **Cross-group promote.** The `+` CTA always promotes the floating
  tab into ITS OWN parent group (per `_onFloatingSaveCtaClick`'s
  enclosing `.group-section` lookup at `sidepanel.js:3178`). There is
  no scenario today where a floating tab gets promoted into a
  DIFFERENT group via the `+` CTA. The swap design implicitly assumes
  this. If a future feature adds a "promote and re-home" UX, that
  path would NOT use `replaceFloatingId` (the floating ref lives in
  the source group's renderOrder; the destination group's renderOrder
  shouldn't be swapped). The handler validator correctly silently
  ignores the field when no match is found — fallback to append fires.
- **Bulk promote.** B-067 backlog candidate "promote multiple floating
  tabs at once" is unaffected — there is no MSG_BULK_PROMOTE today,
  and if one is added it would need its own swap-or-append per-target
  pattern. Out of scope for B-166.
- **Demote round-trip.** MSG_DEMOTE_ITEM (`storage-handlers.js:418`)
  is the inverse — it deletes a saved item, calls `saveFloatingGroups`
  to create a new floating-group record for the now-orphaned tab. The
  current demote path appends a FRESH `floating:<newFloatingTabId>`
  ref to renderOrder (per `appendFloatingGroup` at `floating-groups.js:298-440`).
  An analogous swap on demote (replace `item:<id>` with `floating:<newId>`
  at the same index) would round-trip-symmetric the promote — but
  demote is its own AC scope and is NOT part of B-166. Filed for
  product-owner consideration in a future sprint.

---

## §71.11 — Files to be touched (R3 summary, for the handoff)

**Source code (modified):**

- `sidepanel/sidepanel.js` — `_onFloatingSaveCtaClick` at `:3169-3196`: read `row.dataset.floatingTabId`, include as `replaceFloatingId` in dispatch payload when non-empty.
- `background/messages/storage-handlers.js` — MSG_PROMOTE_TAB case at `:373-417`: new validator clause; pass-through to `createItem`.
- `background/storage/items.js` — `createItem` at `:170-230`: extend GROUPS mutator with swap-or-append fork; add third partition mutator (FLOATING_GROUPS) when `replaceFloatingId` is set; JSDoc update.

**Source code (new):** _none_

**Source code (unchanged):** `shared/messages.js`, `shared/render-order.js`, `shared/url.js`, `background/storage/shapes.js`, `background/storage/migration.js`, `background/storage/groups.js`, `background/storage/write-transaction.js`, `background/tabs/floating-groups.js`, `background/tabs/tab-claims.js`, `background/tabs/floating-members.js`, `newtab/newtab.js`, `popup/popup.js`.

**Tests (new):**

- `tests/b166-promote-in-place.test.js` — 10 cases per §71.9.1.

**Tests (modified):**

- `tests/b124-floating-visual.test.js` — line 250 regex (1 line + comment update) per §71.5.2.

**Docs:**

- This chapter (`docs/design/71-b-166-promote-in-place.md`) — R2 plan, written BEFORE R3 per S44 retro action item 1.
- `docs/SOLUTION_DESIGN.md` — TOC entry added.
- (R6) `CHANGELOG.md`, `docs/RELEASES.md` — entries added at sprint close.
- (R5) `docs/UAT_B-166.md` — UAT script per §71.9.3.

---
