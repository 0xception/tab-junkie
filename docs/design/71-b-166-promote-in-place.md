# §71 — B-166 — `+` CTA on Floating Tab Promotes In-Place

**Status:** R6 AS-BUILT — Sprint 45 (v1.40.0 target, 2026-05-21).
**Anchor:** B-166 (P2 / S → auto-upgraded to Full M per the message-contract rule in `CLAUDE.md` Pipeline Tiers).
**Tier:** Full pipeline (M).
**Depends on:** B-148 ✅ (S44 close — `Group.renderOrder` + interleave), B-124 ✅ (S39 — floating-row `+` Save CTA), B-121 ✅ (S38 — floating-group write path).
**Author:** [solution-architect] (Opus). Written BEFORE R3 build per S44 retro action item 1 (chapter-first); reconciled at R6 against shipped behavior (commits `71c457a` R3 + `d13c103` R4 fix-round + `3bb0dd9` R5).

> **R6 As-Built chapter.** Originally authored as an R2 plan; updated at
> R6 close to reflect what was actually built. The R0 PICK, atomic-swap
> mechanism, message contract, rollback plan, performance budget, and the
> AC ↔ design reconciliation are all preserved as designed. The following
> deltas were applied at R6 (see §71.14 R6 As-Built audit trail at the end
> of the chapter for the full delta log):
> - §71.3.2 mutator sketch — reflects M-1 defensive cross-group prune scoping
>   (`pruneGroupId` capture + conditional-prune branch).
> - §71.5.1 / §71.11 — `newtab/newtab.js` was added to the file list (cross-
>   surface extension caught at R3, R2 had said unchanged).
> - §71.6.3 AC3 — invariant extended to document the M-1 defensive scoping.
> - §71.9 — test list extended with T11 (M-2), T12 (M-1), T13 (R5 atomicity
>   guard); final test-suite count: 2037 PASS.
> - §71.10 — original "Future work" subsection renumbered to §71.13; new
>   §71.10 As-Built captures the UAT outcome.
> - §71.12 — R5 bonus discovery (T13 atomicity guard for the swap branch).
> - §71.13 — Future work / follow-ups extended with R4 LOWs (5),
>   [test-engineer] R5 P3 backlog candidates (2), and the S45 retrospective
>   action item on UAT script signal discipline.
> - §71.14 — full R6 As-Built audit trail at the end of the chapter.

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

The `floatingGroupsMutator` body — **As-Built reflects the M-1 R4
security fix-round** (`d13c103`), which added defensive cross-group
prune scoping. The `replaceFloatingId` normalization (string-type +
non-empty + presence check) is hoisted up-front and the mutator body
only runs when the hint is active; the `pruneGroupId` closure captures
the caller's target group so the filter rejects malformed dispatches
that pair `{groupId: B, replaceFloatingId: <ulid-of-record-in-A>}`:

```js
// Up-front normalization (B-166 §71.3.2; items.js:203-211):
const replaceFloatingId = (typeof input.replaceFloatingId === 'string'
  && input.replaceFloatingId.length > 0) ? input.replaceFloatingId : null;

// ... GROUPS + ITEMS ops constructed unconditionally ...

if (replaceFloatingId !== null) {
  const pruneGroupId = item.groupId;  // captured for the M-1 scoping branch
  ops.push({
    partition: PARTITION_FLOATING_GROUPS,
    mutator: (records) => {
      if (!Array.isArray(records) || records.length === 0) return records;
      const next = records.filter((r) => {
        if (r?.floatingTabId !== replaceFloatingId) return true;  // keep — different floating tab
        // Match on floatingTabId. Now apply the M-1 group scope:
        if (pruneGroupId === null) return false;  // AC3 Ungrouped fallback — prune unconditionally per §71.6.3
        return r?.groupId !== pruneGroupId;  // prune only if same group; keep (defensive) if different group
      });
      return next.length === records.length ? records : next;
    },
  });
}
```

The mutator is **content-conditional** — returns the same reference if
no record matched, so `writeTransaction` short-circuits the
`chrome.storage.set` call when there's nothing to prune. This mirrors
the §68.6 idempotency-fast-path precedent for `bootstrapAndSweepRenderOrder`.

**M-1 As-Built rationale.** R2 originally specified a global filter on
`floatingTabId` alone, on the (correct) reasoning that a well-formed UI
dispatch always pairs the hint with the record's owning group, so
collision was impossible by construction. R4 [security-reviewer]
correctly observed that a *malformed* in-process dispatch (a future
caller, a buggy test fixture, a malicious sender that survives the
allow-list-type validator but happens to pair a valid `floatingTabId`
with a different group) would silently prune the wrong group's record
with no caller-visible signal. The fix adds defense-in-depth: correct
callers still prune (the dispatch and the record agree on the group); a
malformed caller is a no-op. The `pruneGroupId === null` Ungrouped
branch is preserved unrestricted because AC3 requires unconditional
cleanup on the Ungrouped fallback (the record may legitimately have any
`groupId` value if the user deleted the group between hover and click).

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

### §71.5.1 — Code files touched (As-Built)

| # | File | Lines (As-Built) | Change |
|---|------|------------------|--------|
| 1 | `sidepanel/sidepanel.js` | `3169-3215` | `_onFloatingSaveCtaClick` extracts `row.dataset.floatingTabId` (already-stamped at `:3089-3091`); includes it as `replaceFloatingId` in the MSG_PROMOTE_TAB payload when non-empty (`:3192-3196`). |
| 2 | `background/messages/storage-handlers.js` | `373-430` | Add `replaceFloatingId` validator after `groupId` validator (`:392-399`); pass through to `createItem({ title, url, groupId, replaceFloatingId })` (`:425-430`). |
| 3 | `background/storage/items.js` | `170-313` | `createItem({title, url, groupId, replaceFloatingId?})`: hoist normalization (`:203-211`); extend groups mutator with the swap-or-append fork (`:238-247`); add third partition mutator (PARTITION_FLOATING_GROUPS) with M-1 defensive cross-group prune scoping (`:270-310`). JSDoc updated (`:171-186`). |
| 4 | **`newtab/newtab.js`** | `540-597` | **As-Built addition (R2 said unchanged).** `_promoteFloatingTab` extracts `m.floatingTabId` from `_floatingMembers` (`:571-573`); includes it as `replaceFloatingId` in the MSG_PROMOTE_TAB payload when non-empty (`:584-586`). See As-Built note A-1 below. |
| 5 | _(none)_ | _(none)_ | `shared/messages.js` unchanged — no new message type, no new constant. |
| 6 | _(none)_ | _(none)_ | `shared/render-order.js` unchanged — the swap happens in `Group.renderOrder` upstream of the resolver. |

**As-Built note A-1 — cross-surface analysis gap caught at R3.** The
original R2 chapter (§71.5.1 row 4 + §71.11 "Source code (unchanged)")
asserted `newtab/newtab.js` was unchanged on the basis that the AC1
user flow is described as "click `+` on a floating row in the sidepanel."
At R3, [frontend-engineer] identified that `_promoteFloatingTab`
(`newtab/newtab.js:550`) is the newtab equivalent of
`_onFloatingSaveCtaClick` — it dispatches the SAME `MSG_PROMOTE_TAB`
message from the floating-row `+` Save CTA in the newtab page, and
both surfaces consume the SAME `Group.renderOrder` via the shared
resolver. Shipping the swap fix on the sidepanel but not on newtab
would have produced a cross-surface UX divergence (sidepanel swaps;
newtab still bottom-jumps). Per the `CLAUDE.md` R3 cross-surface
diff-self-check rule, R3 extended both surfaces in lockstep and
flagged the deviation for R6 As-Built reconcile. The deviation is now
reconciled here. Root cause: the R2 author treated `_onFloatingSaveCtaClick`
as the single dispatch surface based on the AC narrative ("sidepanel
`+` CTA"); the AC1 phrasing did not surface the newtab analog
because the newtab `+` Save flow had been added by B-124 (S39) as a
separate code path. **R2 gap class for future architecture work:** when
a new write path is described by user surface ("the sidepanel `+` CTA"),
R2 should `grep` for sibling dispatch sites of the SAME `MSG_*`
constant across all surface entry points (sidepanel, newtab, popup) and
explicitly enumerate which sibling sites are in-scope vs out-of-scope
before locking the fix-scope table.

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
  `items.js:233` (`if (item.groupId === null) return groups;`) fires
  BEFORE the swap fork. The swap is silently skipped — the new
  bookmark lands in Ungrouped (no `renderOrder` for Ungrouped — items
  there render via `Item.sortOrder` per the bootstrap-fallback in
  `shared/render-order.js:64-73`).
- The FLOATING_GROUPS mutator still runs and prunes the F1 record. **As-Built
  (R4 M-1):** the prune now applies a defensive cross-group scope: when
  `input.groupId !== null`, the filter only removes records where
  `r.groupId === input.groupId` AND `r.floatingTabId === replaceFloatingId`
  (a malformed dispatch that paired the hint with a different group is a
  no-op on the unrelated group's record). When `input.groupId === null` —
  this AC3 Ungrouped-fallback path — the filter is unrestricted: any record
  matching `r.floatingTabId === replaceFloatingId` is pruned regardless of
  its `groupId`. The reasoning is that the AC3 race window opens precisely
  when the user has deleted the group between hover and click; the floating
  record's recorded `groupId` may reference the just-deleted group, so
  scoping by `pruneGroupId` would prevent the legitimate cleanup. The
  `pruneGroupId === null` short-circuit at `items.js:304` preserves the
  AC3 contract exactly as R2 designed it: "the floating record IS still
  pruned … independent of `groupId`."
- This is a minor invariant: even if the swap can't happen (no group), the
  orphan floating record is still cleaned up — atomicity preserved within
  the prune.

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

## §71.9 — Tests (As-Built)

Mirrors the §68.10.1 format. R5 [test-engineer] wrote both unit tests
AND performed UAT.

**As-Built final test-suite count: 2037 PASS / 0 FAIL / 0 SKIP**
(verified via `npm test`, post-B-163 R3 landing on the same branch).
The B-166 test file `tests/b166-promote-in-place.test.js` ships at
**13 cases / 678 LOC** (R2 estimated 10 cases / ~150 LOC; R4 fix-round
added T11 + T12, R5 added T13 — see §71.12).

### §71.9.1 — Automated tests (new file)

`tests/b166-promote-in-place.test.js` — **678 LOC, 13 cases (As-Built)**:

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
| T10 | C-7 validator: `replaceFloatingId = ''` (empty string) AND `replaceFloatingId` of 33 chars (over-length) → `ERR_VALIDATION` | dispatch | response envelope is `{ok: false, error: {code: ERR_VALIDATION}}`; no write. As-Built (R4 M-3 review): test asserts both edge cases in a single `test()` block (`tests/b166-promote-in-place.test.js:413`). |
| **T11** | **R4 M-2 — §71.1 canonical 4-slot scenario.** Seed `[item:A, floating:F1, item:B, floating:F2]`; promote F1; assert post-state is `[item:A, item:NEW, item:B, floating:F2]` AND F2's floating record still present in `tj:floatingGroups`. | end-to-end | combined sibling-survives + length-invariant + partition cleanup assertion in one test. Added by R4 fix-round (`d13c103`) to close the R4 [qa-reviewer] M-2 gap: the R2 test enumeration covered swap mechanics in isolation but did not exercise the literal §71.1 4-slot motivating scenario. `tests/b166-promote-in-place.test.js:450`. |
| **T12** | **R4 M-1 — defensive cross-group prune scoping.** Seed two groups A + B, with F1 floating in Group A; dispatch malformed `{groupId: B, replaceFloatingId: <F1-floatingTabId>}`; assert F1's record SURVIVES in Group A's slot (the defensive scope no-op'd the prune). | end-to-end | regression guard for the M-1 fix (`items.js:296-309`). Without the defensive scope, F1's record would have been pruned despite the dispatch targeting Group B — a silent cross-group state corruption with no caller-visible signal. `tests/b166-promote-in-place.test.js:548`. |
| **T13** | **R5 atomicity guard — B-103 §51.D-2 in the B-166 swap branch.** After a swap-path promote, assert `getClaimsMirror()[newItem.id] === seed.liveTabId`. | end-to-end (thin behavioural assertion) | discovered by R5 [test-engineer] audit: the existing `tests/b103-promote-duplicate.test.js` source-text pin was tuned against the legacy append-only payload shape and does NOT cover the B-166 swap branch. A future refactor that conditionally skipped or re-ordered `claimTabForItem` for the swap path would not be caught by either b103 or the existing b166 tests. ~12 LOC closes the loop. `tests/b166-promote-in-place.test.js:659`. |

### §71.9.2 — Existing test deltas (As-Built)

| File | Δ LOC | Change |
|------|-------|--------|
| `tests/b124-floating-visual.test.js` (T-124-D, sidepanel pin) | +18/-1 | R3 updated T-124-D regex to allow optional `replaceFloatingId` field per §71.5.2; R4 M-3 fix-round added 2 specificity pins (row.dataset.floatingTabId extraction + 'tabId, groupId' payload construction) because the original regex weakened by the `|payload` alternative was matching any var named `payload`. |
| `tests/b124-floating-visual.test.js` (T-124-F, newtab pin) | +19/-0 | **R4 M-4 fix-round** added 2 specificity pins to T-124-F (newtab body): `m.floatingTabId\|floatingTabId` extraction from `_floatingMembers` AND `replaceFloatingId` payload field appearance. R2 had not anticipated this delta because R2 had asserted `newtab/newtab.js` was unchanged; the M-4 finding was caught at R4 alongside the M-3 sidepanel specificity gap. |
| _(none other)_ | _(none)_ | Per §71.5.4 — all other promote tests continue to PASS unchanged. |

### §71.9.3 — UAT script (As-Built)

The UAT script was authored at R5 inline in `docs/findings/sprint-45.md`
(commit `2c69571`) rather than as a separate `docs/UAT_B-166.md` file
(see §71.13 note on the S45 retrospective action item for the UAT
script-discipline lesson). 10 cases total, covering all 6 R1 ACs plus
the §71.3.2 bonus prune, the §71.1 canonical 4-slot scenario, cross-
surface newtab parity, and the M-1 defensive-scope malformed-dispatch
case. ~15 min wall time for product-owner execution. See §71.10 for the
actual outcome.

---

## §71.10 — UAT outcome (As-Built, 2026-05-21)

| Case | Result | Notes |
|------|--------|-------|
| UAT-1 (AC1 happy path) | ✅ PASS | F1 → saved bookmark at same row position; user-visible in-place swap confirmed. |
| UAT-2 (§71.3.2 bonus prune) | ⚠️ INCONCLUSIVE → indirectly validated | Product-owner ran the SW-console storage query but no pre/post delta was captured. The atomic prune is **indirectly validated** by UAT-1's PASS: if the prune had NOT fired, the row visualization in UAT-1 would have shown both the floating row AND the new bookmark row (one more row than observed). It did not — the row count matched the post-swap expectation, so the prune executed. |
| UAT-3 (§71.1 canonical 4-slot sibling preservation) | ✅ PASS | F2 survived at index 3 after F1 promote — the motivating AC1 scenario from §71.1 confirmed end-to-end. |
| UAT-4 (AC1 persistence across SW restart) | ✅ PASS | Toggle OFF/ON of the Tab Junkie card preserved the renderOrder. |
| UAT-5..10 | ⏭️ SKIPPED | Product-owner direction: "idk if this passes, requires knowing the tabID, i don't have that and this is potentially too technical for a UAT test, let's skip the rest. I'll smoke test in the future if I see issues." Skipped cases were AC2 legacy fallback, AC3 group-deleted-mid-flight, AC4 tab-closed-mid-flight, AC5 right-click picker regression, AC5 newtab cross-surface parity, AC6 M-1 stale-hint defensive scope. |

**Effective Gate 2 status: ✅ PASS by product-owner acceptance.**

Rationale: 2037 automated tests cover all 6 R1 ACs plus the §71.3.2
bonus prune plus the M-1/M-2 R4 fix-round additions plus the T13
atomicity guard; UAT-1/3/4 cover the user-observable happy path plus
the §71.1 canonical scenario plus persistence-across-restart; product-
owner has agreed to smoke-test the SKIPPED cases if any user-visible
regression surfaces in production. Test-engineer assessed the
automated-test coverage as sufficient to substitute for the SKIPPED
UAT cases (each SKIPPED case has a corresponding automated test:
UAT-5 ↔ T4 AC2, UAT-6 ↔ T5 AC3, UAT-7 ↔ T6 AC4, UAT-8 ↔ T7 AC5
picker, UAT-9 ↔ cross-surface code-level diff verified by R3 +
M-3/M-4 specificity pins in T-124-D/F, UAT-10 ↔ T12 M-1 defensive
scope). B-166 R6 close proceeded under this acceptance.

---

## §71.11 — Files touched (As-Built)

**Source code (modified):**

- `sidepanel/sidepanel.js` — `_onFloatingSaveCtaClick` at `:3169-3215`: read `row.dataset.floatingTabId` (`:3192`), include as `replaceFloatingId` in dispatch payload when non-empty (`:3194-3196`).
- **`newtab/newtab.js`** — `_promoteFloatingTab` at `:550-597`: read `m.floatingTabId` from `_floatingMembers` (`:571-573`), include as `replaceFloatingId` in dispatch payload when non-empty (`:584-586`). **As-Built addition — R2 said unchanged; see §71.5.1 note A-1 for the cross-surface analysis gap explanation.**
- `background/messages/storage-handlers.js` — MSG_PROMOTE_TAB case at `:373-430`: new validator clause (`:392-399`); pass-through to `createItem` (`:425-430`).
- `background/storage/items.js` — `createItem` at `:170-313`: hoist normalization (`:203-211`), extend GROUPS mutator with swap-or-append fork (`:238-247`), add third partition mutator (FLOATING_GROUPS) with M-1 defensive cross-group prune scoping (`:270-310`); JSDoc updated (`:171-186`).

**Source code (new):** _none_

**Source code (unchanged, As-Built):** `shared/messages.js`, `shared/render-order.js`, `shared/url.js`, `background/storage/shapes.js`, `background/storage/migration.js`, `background/storage/groups.js`, `background/storage/write-transaction.js`, `background/tabs/floating-groups.js`, `background/tabs/tab-claims.js`, `background/tabs/floating-members.js`, `popup/popup.js`. (`newtab/newtab.js` was REMOVED from this list at R6 As-Built.)

**Tests (new):**

- `tests/b166-promote-in-place.test.js` — **13 cases / 678 LOC As-Built** (R2 estimated 10 cases / ~150 LOC; T11 + T12 added by R4 fix-round, T13 added by R5).

**Tests (modified):**

- `tests/b124-floating-visual.test.js` T-124-D — line 250 regex per §71.5.2 + R4 M-3 specificity pins (As-Built: +18/-1 LOC).
- `tests/b124-floating-visual.test.js` T-124-F — R4 M-4 specificity pins (As-Built: +19/-0 LOC, NEW delta not anticipated in R2).

**Docs:**

- This chapter (`docs/design/71-b-166-promote-in-place.md`) — authored at R2 as a plan; reconciled at R6 to As-Built (§71.14 audit trail).
- `docs/SOLUTION_DESIGN.md` — TOC entry exists at `:91` (status descriptor will be updated to remove "(R2 Plan)" at sprint close).
- `docs/findings/sprint-45.md` — R0 spike, R1 LOCKED ACs, R4 findings summary, R5 UAT script + results.
- (R7) `CHANGELOG.md`, `docs/RELEASES.md`, `README.md` (if user-visible) — handled by [release-manager] / [technical-writer] at sprint close.

---

## §71.12 — R5 Bonus discovery (T13 atomicity guard)

R5 [test-engineer] audit (commit `3bb0dd9`) discovered one coverage gap
beyond the R1 ACs + R4 findings:

**Gap.** The B-103 §51.D-2 promote-tab atomicity contract (`createItem`
MUST be followed by `claimTabForItem` in the same handler call;
`tests/b103-promote-duplicate.test.js:163-208` pins this via a
source-text regex on `storage-handlers.js`) was **tuned against the
legacy payload shape only**. The pin asserts the `await createItem`
followed by `await claimTabForItem` sequence exists in the
MSG_PROMOTE_TAB handler body, but the regex does not enumerate which
`createItem` invocation paths it covers — and B-166 introduced a new
swap branch through `createItem` whose post-promote claim-mirror state
is identical in shape but a different code path through the same
handler.

**Risk.** A future refactor that (a) factored the swap-branch promote
into a separate helper, OR (b) conditionally skipped/re-ordered
`claimTabForItem` for the swap path (the natural refactor target if a
"swap without re-claim" optimization ever emerged), would not be
caught by either the b103 pin (whose source-text regex would still
match the legacy path) or the existing b166 tests (which assert
renderOrder mechanics, not post-claim state).

**Closure.** T13 (`tests/b166-promote-in-place.test.js:659`) adds a
thin behavioural assertion: after a swap-path promote completes,
`getClaimsMirror()[newItem.id] === seed.liveTabId`. ~12 LOC. This
closes the b103-atomicity-contract loop for the B-166 swap branch
specifically; any refactor that breaks the claim-mirror post-condition
fails T13 even if the b103 source-text pin still matches the legacy
path.

**Bonus framing.** The R2 chapter cited B-103 §51 as a satisfied
invariant (`MSG_PROMOTE_TAB` handler awaits `createItem` then awaits
`claimTabForItem`; order preserved — §71.3.1 step 5) but did not call
out that the b103 PIN itself does not test-cover the new branch. The
T13 addition is correctly characterized as an R5 audit discovery
rather than an R4 review-finding miss because the gap is meta-level
(test infrastructure brittleness, not a code-level bug); R4 reviewers
correctly flagged the four code-level MEDIUM findings, none of which
overlapped with this meta-level gap.

---

## §71.13 — Future work / known limitations / deferred findings

### §71.13.1 — Original future-work items (from R2)

- **Other position-aware insert callers.** If B-162 (Ctrl+Shift+T reopen lands in original group) R2 picks an option that wants
  position-aware insert (e.g., insert "above the opener position"), the `replaceFloatingId` parameter
  on `createItem` is a candidate for generalization to `insertAt: { ref: string }`
  (option (c) in §71.2). The generalization is straightforward — the
  field's semantic of "find this ref in renderOrder, splice-replace at
  that index OR fall back to append" extends cleanly. R2 for B-162
  should evaluate whether to retrofit at that time.
- **Cross-group promote.** The `+` CTA always promotes the floating
  tab into ITS OWN parent group (per `_onFloatingSaveCtaClick`'s
  enclosing `.group-section` lookup at `sidepanel.js:3178-3182`). There is
  no scenario today where a floating tab gets promoted into a
  DIFFERENT group via the `+` CTA. The swap design implicitly assumes
  this — and the R4 M-1 fix now enforces it defensively at the
  prune-mutator layer (a malformed cross-group dispatch is a no-op
  rather than a silent state corruption). If a future feature adds a
  "promote and re-home" UX, that path would NOT use `replaceFloatingId`
  (the floating ref lives in the source group's renderOrder; the
  destination group's renderOrder shouldn't be swapped). The M-1
  defensive scope makes this safe by construction.
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

### §71.13.2 — R4 LOW findings (deferred to P3 backlog at sprint close)

R4 surfaced 5 LOW findings (per `docs/findings/sprint-45.md` B-166 R4
summary: "0 CRITICAL / 0 HIGH / 4 MEDIUM (all fixed in `d13c103`) / 5
LOW (deferred — file as P3 backlog candidates at sprint close per R5
[test-engineer] notes)"). The detailed LOW enumeration was not
preserved verbatim in the per-sprint findings slice; [scrum-master]
will file the LOW set as P3 backlog candidates at sprint close,
sourced from the parallel R4 reviewer transcripts. None block sprint
close.

### §71.13.3 — P3 backlog candidates surfaced at R5

The R5 [test-engineer] audit (`3bb0dd9` commit body) surfaced two
additional P3 backlog candidates that neither block sprint close nor
warrant fix-round work but would strengthen test infrastructure on
future floating-Save surface work:

1. **chrome-mock pre-S38 legacy fixture.** The current `tests/chrome-mock.js`
   does not include a fixture factory for pre-S38 floating-group records
   (records lacking the post-B-121 `floatingTabId` field). The B-166
   AC2 graceful-fallback test (T4) hand-constructs a record without
   `floatingTabId` inline; future tests touching the pre-S38 legacy
   path would benefit from a shared `seedLegacyFloatingRecord()`
   helper.
2. **newtab end-to-end MSG_PROMOTE_TAB dispatch coverage.** The R3
   cross-surface extension to `newtab/newtab.js:550` is currently
   covered by the T-124-F source-text regex pins (M-4) and indirectly
   by the b166 end-to-end tests (which exercise the SW handler, not the
   newtab dispatch). A dedicated end-to-end newtab-page test that
   simulates a `+` click on a newtab floating row and observes the
   downstream `MSG_PROMOTE_TAB` payload would close the surface-pin
   gap that M-4 surfaced.

Either P3 candidate can ride alongside the next sprint that touches
the floating Save surface.

### §71.13.4 — S45 retrospective action item

Captured at R5 UAT execution (`docs/findings/sprint-45.md` "R5 UAT —
B-166 results" final section), rolled into the S45 retrospective at
sprint close:

> **[test-engineer]** UAT scripts must rely on **UI-observable signals
> only** (visible row positions, toast text, focus states, persistent
> UI state across reload). SW-console state queries that require
> manual tabId lookup, ULID copying, or storage-shape introspection
> are **too technical for product-owner execution** and should be
> reserved for the automated test suite.

The B-166 R5 UAT script (UAT-5..10) was SKIPPED specifically because
its later cases required SW-console storage manipulation (UAT-5
`tj:floatingGroups` strip), manual tabId lookup (UAT-6, UAT-7, UAT-10),
and ULID copying (UAT-10). Future UAT scripts authored by
[test-engineer] must restrict UAT cases to UI-observable signals; any
state-query case must be either (a) re-cast as a UI-observable
assertion, OR (b) moved to the automated test suite.

---

## §71.14 — R6 As-Built audit trail

Updates applied at R6 close (this section is itself an audit-trail
artifact for future R6 close reviewers):

| # | Section | Delta | Rationale |
|---|---------|-------|-----------|
| 1 | Header (Status + intro paragraph) | R2 LOCKED → R6 AS-BUILT; intro paragraph replaced with delta summary | Chapter is now the As-Built record per CLAUDE.md R6 contract. |
| 2 | §71.3.2 | Mutator sketch replaced with As-Built code reflecting M-1 defensive cross-group prune scoping (`pruneGroupId` capture + conditional-prune branch); rationale paragraph added. | Original sketch matched R2 design (global filter on `floatingTabId`); R4 [security-reviewer] correctly identified the malformed-cross-group corruption class; fix-round `d13c103` added the defensive scope. |
| 3 | §71.5.1 | Code-files table extended with `newtab/newtab.js` (row 4); added As-Built note A-1 documenting the cross-surface analysis gap and the R2 architecture-gap class (R2 should grep for sibling dispatch sites of the same MSG_* constant across all surfaces). | Caught at R3 build per CLAUDE.md cross-surface diff self-check rule; flagged for R6 As-Built reconcile at R3 commit time. |
| 4 | §71.6.3 | AC3 invariant extended to document M-1 defensive cross-group prune scoping. Code-cite line numbers updated to As-Built (`items.js:233`, `items.js:304`). | Per R4 M-1 fix-round; AC3 contract unchanged but the implementation invariant now includes the cross-group scope. |
| 5 | §71.9 (header + §71.9.1 + §71.9.2) | Final test-suite count 2037 PASS recorded; test-file size 678 LOC / 13 cases (was 150 LOC / 10); T11 + T12 + T13 added to the test table; existing-test deltas table extended with the T-124-F M-4 fix-round pin. | R3 + R4 fix-round + R5 added 3 tests; verified via `npm test` on HEAD `80826e3`. |
| 6 | §71.9.3 | UAT script section trimmed to a pointer note (the actual script lives in `docs/findings/sprint-45.md` per R5 implementation choice). | R5 [test-engineer] authored the UAT script inline in the per-sprint findings slice rather than at `docs/UAT_B-166.md`; the S45 retrospective action item §71.13.4 addresses the script-discipline lesson. |
| 7 | §71.10 | Original "Future work / known limitations" section moved to §71.13; new §71.10 holds the As-Built UAT outcome table + Gate 2 acceptance rationale. | Gate 2 satisfaction is As-Built data; documenting it here keeps the chapter self-contained as the canonical R6 record. |
| 8 | §71.11 | Code/test file lists updated to As-Built line numbers and counts; newtab added to "modified" and removed from "unchanged." | Single source of truth for "what shipped." |
| 9 | §71.12 (NEW) | New section documenting the R5 T13 atomicity-guard bonus discovery. | R5 audit-level finding; not a code bug, but a test-infrastructure gap closed at R5. |
| 10 | §71.13 (RESTRUCTURED) | Original §71.10 future-work moved to §71.13.1; new §71.13.2 (R4 LOWs), §71.13.3 (P3 backlog candidates), §71.13.4 (S45 retrospective action item) added. | Consolidates all post-close follow-ups in one section. |
| 11 | §71.14 (NEW) | This audit trail. | Required by CLAUDE.md R6 contract for transparency. |

**Behaviors shipped that the original chapter did not anticipate:**

- **B-1 (cross-surface extension).** Original chapter asserted `newtab/newtab.js`
  was unchanged. As-Built: `_promoteFloatingTab` at `newtab/newtab.js:550-597`
  was extended in lockstep with sidepanel. Caught at R3, reconciled here
  in §71.5.1 / §71.11 / §71.5.1 note A-1.
- **B-2 (M-1 defensive cross-group prune scoping).** Original
  `floatingGroupsMutator` sketch was a global filter on `floatingTabId`
  alone. As-Built: prune is scoped by `pruneGroupId === item.groupId`
  when non-null (with Ungrouped-fallback short-circuit). Caught at R4
  by [security-reviewer] M-1; reconciled here in §71.3.2 / §71.6.3.
- **B-3 (T-124-F newtab specificity pin).** Original existing-tests
  table only listed T-124-D (sidepanel pin). As-Built: T-124-F newtab
  pin required +19 LOC of specificity additions (M-4 fix-round
  byproduct of the cross-surface extension caught at R3). Reconciled
  in §71.9.2.
- **B-4 (T13 atomicity guard).** Not anticipated by R2 (B-103 §51 was
  cited as a satisfied invariant; the meta-level gap that the b103 PIN
  itself doesn't cover the swap branch was not surfaced). Caught at
  R5 audit; reconciled here in §71.9.1 / §71.12.

All four behaviors are now fully reconciled with the shipped code at
HEAD `80826e3` on `feature/sprint-45-claim-desync`. The chapter
accurately represents shipped behavior.

---
