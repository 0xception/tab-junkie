## 29. B-059 — Allow Duplicate URLs with Soft-Warn UI (R2 Design)

### 29.1 Overview

B-059 is the UI-and-contract half of the B-057 duplicate-URL policy reversal. B-058 relaxes the scheme allowlist at the data layer; B-059 removes the last remaining storage-boundary gate that contradicts PRD §3.3 — the `ERR_DUPLICATE_URL` hard-reject in `MSG_PROMOTE_TAB` — and replaces it with a pre-dispatch **soft-warn** confirmation surfaced by whichever sidepanel path initiated the save.

The data-layer change is deliberately minimal: a ~7-line deletion from `background/messages/storage-handlers.js:217-230`. The UX change is the substantive surface: two entry points (single-tab save via the Open-Tabs context menu; bulk Save-to-group via `_bulkMoveToGroup`) gain a confirmation step, and `ERR_DUPLICATE_URL` is repositioned from "blocking error" to "informational signal" — kept exported from `shared/errors.js` so the sidepanel's existing rejection-pattern code (see `sidepanel/sidepanel.js:2645,2960`) continues to compile even if a stale SW ever throws it during a deploy window.

This section binds every architectural decision before R3 so the [frontend-engineer] can build without replaying shape debates. Out-of-scope exclusions (search-result de-duplication per B-022, import duplicate handling per B-060, automatic "open existing" redirect) are enumerated in §29.9.

### 29.2 Data-Layer Changes

#### 29.2.1 `MSG_PROMOTE_TAB` handler — remove the reject

The current gate at `background/messages/storage-handlers.js:217-230`:

```js
// AC4: duplicate detection — check ALL stored items for a matching URL,
// regardless of whether the tab is currently claimed.
const normalizedTabUrl = safeNormalizeForMatch(url);
const allItems = await listItems();
const duplicate = allItems.find(
  (it) => safeNormalizeForMatch(it.url) === normalizedTabUrl,
);
if (duplicate) {
  throw new StorageError(ERR_DUPLICATE_URL, 'promoteTab: an item with this URL already exists');
}
```

is **deleted in its entirety**. The promote path becomes:

```js
// post-B-058 / B-059: scheme validation happens inside createItem → normalizeUrl;
// duplicate-URL detection is a UI concern, handled client-side BEFORE dispatch
// (§29.3). The SW unconditionally accepts a promote request for any valid URL.
const newItem = await createItem({ title: tab.title || url, url, groupId });
await claimTabForItem(newItem.id, p.tabId);
return newItem;
```

The per-item `safeNormalizeForMatch` loop over `listItems()` is eliminated — a nontrivial perf win on large collections (was O(n) per promote).

#### 29.2.2 `createItem` — verified, no change needed

`background/storage/items.js :: createItem` (entrypoint around line 25, `validateCreate` at :30, the write-transaction body below) performs **no URL-uniqueness check**. Confirmed by reading the full function and by the symmetry observation in the B-057 spike (§Memo 2 Q2): `bulkCreateItems` and `updateItem` are also duplicate-tolerant today. Post-B-059 the only ingress path that blocked duplicates (promote) joins the others. No migration, no schema bump.

#### 29.2.3 `ERR_DUPLICATE_URL` constant — retained, repurposed

`shared/errors.js:28` — `export const ERR_DUPLICATE_URL = 'ERR_DUPLICATE_URL';` — **stays**. Rationale:

1. **Compilation / import stability.** `sidepanel/sidepanel.js` imports `ERR_DUPLICATE_URL` (`sidepanel/sidepanel.js` header, plus pattern-match sites at `:2645` inside `_bulkMoveToGroup` and `:2960` inside `_openOpenTabContextMenu`). Removing the constant now forces a rename cascade in the UI layer.
2. **Deploy-window safety.** A sidepanel updated in-place against a still-stale service worker (which in turn throws the old error) must not crash. The sidepanel's existing `if (code === ERR_DUPLICATE_URL)` branches are now unreachable in steady state but remain valid fall-throughs during a deploy lag.
3. **Future re-use.** B-060 (import duplicate handling) surfaces duplicate-count reporting via the import summary; `ERR_DUPLICATE_URL` is the natural vocabulary for that path if it ever needs to emit an error-like entry.

The constant becomes **informational-only**. We document this repositioning in `shared/errors.js` itself via a JSDoc comment (see §29.5) rather than deleting-and-re-adding.

#### 29.2.4 Message contract — no new constants, no wire-shape widening

`MSG_PROMOTE_TAB`'s wire contract after B-059:

| Aspect | Status |
|---|---|
| Request shape | Unchanged: `{ tabId: number, groupId?: string \| null }` |
| Success `data` | Unchanged: the created `Item` |
| Removed error code | `ERR_DUPLICATE_URL` is no longer thrown by the SW |
| Retained error codes | `ERR_VALIDATION` (bad tabId, bad groupId, scheme-denylist hit — B-058 behaviour), `ERR_NOT_FOUND` (tab or groupId missing), `ERR_SAFE_MODE`, `ERR_NOT_READY` |
| Broadcast | Unchanged: `SCOPE.ITEMS` via `MUTATION_BROADCASTS[MSG_PROMOTE_TAB]` |
| Safe-mode classification | Unchanged: `MSG_PROMOTE_TAB` remains in `WRITE_MESSAGE_TYPES` (§26.12.4) |

**No new `MSG_*` constant is introduced.** The option of a `MSG_CHECK_DUPLICATE_URL` probe was considered and explicitly rejected (§29.3.3 — "server-side probe rejected"). The client has all the state it needs in the existing `_cachedItems` snapshot.

### 29.3 Duplicate Detection — Client-Side Pre-Check (Decision)

Three placements were evaluated:

| Placement | Pro | Con | Verdict |
|---|---|---|---|
| **A. Client-side pre-check** against `_cachedItems` + `safeNormalizeForMatch` | No IPC; instant; uses an already-maintained cache; SW stays simple | Client must import `safeNormalizeForMatch` (already shared via `shared/url.js` — no new primitive); pre-check is advisory, not authoritative | **Accepted** |
| B. Server-side response field (`{ ok: true, data: { item, isDuplicate: true } }`) | Authoritative; SW has the real item list | Promote has already committed by the time the UI sees the flag — semantically weird ("duplicate saved, undo?") | Rejected |
| C. Hybrid: client probe via new `MSG_CHECK_DUPLICATE_URL` | Authoritative AND pre-confirmation | Adds a message constant, a handler, a safe-mode classification, and an extra IPC round-trip per save; re-introduces the O(n) scan we just removed from the server side | Rejected |

#### 29.3.1 Why client-side is sufficient

The saved-items list is already broadcast-driven — `_cachedItems` (`sidepanel/sidepanel.js:115`) is refreshed on every `MSG_STATE_CHANGED` scope=ITEMS broadcast (see `renderAll` consumer at `sidepanel.js:954`). Staleness is bounded by broadcast latency; in steady state it is immediate.

The soft-warn is a UX affordance, not a correctness gate. A false negative (pre-check misses an existing duplicate because the cache is mid-refresh) results in a duplicate being created without warning — which is now the **allowed** behaviour. A false positive (pre-check flags a duplicate that was just deleted in another surface) results in the user seeing a stale dialog that they can dismiss with Cancel, at which point the duplicate-that-isn't-a-duplicate flows through normally on their next attempt. Neither mode is user-hostile.

#### 29.3.2 The detection primitive

A new pure helper in `sidepanel/sidepanel.js`:

```js
/**
 * B-059: pre-dispatch duplicate-URL detection for save flows.
 * Returns the first existing saved item whose normalized URL matches `url`,
 * or null. Uses the already-maintained `_cachedItems` snapshot and the shared
 * `safeNormalizeForMatch` helper — zero IPC, O(n) over cached items (≤ 1000
 * in realistic collections, < 1ms per call).
 *
 * @param {string} url — raw URL from the tab or form
 * @returns {Item | null}
 */
function _findDuplicateSavedItem(url) {
  const normalized = safeNormalizeForMatch(url);
  if (!normalized) return null;           // unparseable URL — no match possible
  for (const it of _cachedItems) {
    if (safeNormalizeForMatch(it.url) === normalized) return it;
  }
  return null;
}
```

Import `safeNormalizeForMatch` from `shared/url.js` at the top of `sidepanel.js`. This is a **new sidepanel import** — flag under Shared File Governance (CLAUDE.md) for R4 cross-boundary review; however no shape of `shared/url.js` is changed (pure read of an existing exported function).

#### 29.3.3 Why NOT introduce `MSG_CHECK_DUPLICATE_URL`

Evaluated and rejected:

- **Extra IPC round-trip per save.** Every save would incur SW wake-up if cold. Breaks the "single IPC per user action" pattern the sidepanel optimises for elsewhere.
- **Re-introduces the O(n) scan we just removed from the SW.** A probe handler would need to `await listItems()` and scan — exactly what B-059's data-layer change eliminates.
- **New constant, new safe-mode entry, new test surface.** All for an advisory UX hint that the client can compute locally against state it already has.
- **Staleness is worse, not better.** A "fresh" probe still races `MSG_STATE_CHANGED` broadcasts. There is no IPC-level way to serialize "read latest items + show dialog + dispatch promote" atomically.

### 29.4 Soft-Warn UI — Dialog Pattern (Decision)

Three presentations were evaluated:

| Option | Pro | Con | Verdict |
|---|---|---|---|
| **A. Modal confirm dialog** (reuse `openConfirmDialog`, B-024 C-2 pattern) | Consistent with existing destructive-action confirmations; focus-trapped; keyboard-first; a11y-ready; handles Shift+Tab/Escape correctly | Interrupts flow | **Accepted** |
| B. Inline toast with Save/Cancel buttons | Less interruption | New toast variant, no existing pattern with action buttons; accessibility requires role=alertdialog-like treatment — roughly equivalent work to A with weaker affordances | Rejected |
| C. Silent save + post-hoc "duplicate saved — open existing?" toast | Simplest | Contradicts PRD "user-initiates-intentionally" model; no way to Cancel; fails B-059 AC ("Save anyway?" confirmation required) | Rejected |

#### 29.4.1 Why Option A

`openConfirmDialog(item, onConfirm, { triggerEl, heading, body })` at `sidepanel/sidepanel.js:371` already supports:

- Custom heading + body via the options bag (B-024 C-2).
- Focus trap (via `_activateFocusTrap`).
- Keyboard navigation (Tab / Shift+Tab / Escape) with explicit focus to Cancel on open (`confirmCancelBtnEl.focus()`).
- Trigger-element focus restoration on close.
- Dialog-open guard interplay with Escape-to-clear-selection (B-024 H-1).

All of these are load-bearing invariants we would otherwise re-implement for a toast-with-action-buttons. The only affordance we give up is "feels less modal" — and for a save operation that creates persistent state, a modal is the correct weight.

#### 29.4.2 Copy and variants

Two variants of the soft-warn dialog, both routed through `openConfirmDialog`:

**Variant 1 — single-tab save (Open-Tabs row context menu "Save to group"):**

| Field | Copy |
|---|---|
| Heading | `URL already saved` |
| Body | `This URL is already saved as "${existing.title}" in ${groupLabel}. Save another copy?` |
| Cancel button | "Cancel" (the existing default) |
| Confirm button | "Save anyway" |

`groupLabel` is derived via a small helper:
```js
function _groupLabelForItem(item) {
  if (!item.groupId) return 'Ungrouped';
  const g = _cachedGroups.find((gr) => gr.id === item.groupId);
  return g ? g.name : 'Ungrouped';
}
```

The confirm button label change ("Save anyway" instead of the default "Delete") requires a third option on `openConfirmDialog`. See §29.4.4 for the minimal signature extension.

**Variant 2 — bulk Save-to-group with mixed selection (some tabs duplicate, some not):**

| Field | Copy |
|---|---|
| Heading | `${dupCount} of ${totalCount} tabs already saved` |
| Body | `${dupCount} of the ${totalCount} selected tabs have URLs that already exist in your saved items. What would you like to do?` |
| Button 1 | "Save all (${totalCount})" |
| Button 2 | "Skip duplicates (${totalCount - dupCount})" |
| Button 3 | "Cancel" |

This is **three-button**, not two. The existing `openConfirmDialog` is hard-wired to two buttons (confirmCancelBtnEl, confirmDeleteBtnEl — see `sidepanel.html`). See §29.6 for the bulk-flow decision that avoids needing a three-button dialog.

#### 29.4.3 A11y

- `heading` → `role="alertdialog"`-compatible via the existing confirm dialog structure (inherits from B-024 C-2).
- "Save anyway" is NOT a destructive action — it MUST NOT use the destructive-red treatment reserved for Delete. Use the primary-button affordance instead. Implementation: add a `variant: 'primary' | 'destructive'` option to `openConfirmDialog` (default `'destructive'` preserves backward compat for the delete path; B-059 passes `'primary'`).
- Focus: Cancel on open (existing behaviour — preserves the "safer default" convention). User must explicitly Tab or arrow-key to Save.
- Dismissal: Escape = Cancel (existing behaviour).

#### 29.4.4 Minimal `openConfirmDialog` signature extension

```js
function openConfirmDialog(item, onConfirm, {
  triggerEl = null,
  heading,
  body,
  confirmLabel,    // NEW (B-059): override default "Delete" button text
  variant = 'destructive', // NEW (B-059): 'primary' | 'destructive' — styles the confirm button
} = {}) {
  // ... existing body unchanged ...
  confirmDeleteBtnEl.textContent = confirmLabel || 'Delete';
  confirmDeleteBtnEl.dataset.variant = variant;
  // ... CSS reads [data-variant="primary"] to swap the button colour ...
}
```

Two tiny additions to the options bag. Defaults preserve existing callers. CSS: `.confirm-btn[data-variant="primary"] { background: var(--accent); color: var(--on-accent); }` mirroring the existing primary button style.

### 29.5 Error Code Semantics — `ERR_DUPLICATE_URL` Repositioned

Decision: **reposition, do not remove.** Documented via JSDoc in `shared/errors.js`:

```js
/**
 * B-059: Retained for deploy-window compatibility (stale SW may still throw this
 * during a rolling update). Post-B-059 the storage layer NEVER throws this code
 * — duplicate URLs are allowed at the data layer; the soft-warn confirmation UI
 * in the sidepanel handles user-facing disambiguation (see SOLUTION_DESIGN §29).
 * Surface any incoming ERR_DUPLICATE_URL as an informational toast, not a
 * blocking error.
 */
export const ERR_DUPLICATE_URL = 'ERR_DUPLICATE_URL';
```

The sidepanel's existing `if (code === ERR_DUPLICATE_URL) showToast('A bookmark with this URL already exists')` branches (`sidepanel.js:2645,2960`) are unreachable in steady state post-B-059 but remain valid and correct. They will be exercised only if a stale SW and new sidepanel run against each other during a deploy — benign, no user-visible regression.

#### 29.5.1 Why not a `{ isDuplicate: true }` field on the response?

Considered: having the SW return `{ ok: true, data: { item, isDuplicate: true } }` so the UI can show a post-hoc toast. Rejected because:

- The promote has already committed; there is no meaningful "undo" flow that isn't hostile.
- The soft-warn needs to come BEFORE the save so Cancel actually cancels.
- Client-side pre-check (§29.3) already achieves the correct timing.

No response-shape widening.

### 29.6 Bulk-Promote Integration

#### 29.6.1 Current state

`_bulkMoveToGroup(groupId)` at `sidepanel/sidepanel.js:2620` today:

1. Partitions `_selection` into `{ itemIds, tabIds }`.
2. Early-returns on mixed selection (AC12 intersection rule).
3. For all-tabs path: `Promise.allSettled` of `MSG_PROMOTE_TAB` calls per tab.
4. Aggregates rejection codes into a categorised toast (`duplicates`, `restrictedSchemes`, `safeModeHit`, `otherFailures`).

Post-B-059 the `duplicates` count will always be zero (the SW never rejects for duplicate). The categorised toast still handles `restrictedSchemes` (B-058 denylist — `javascript:`, `data:`) and real errors.

#### 29.6.2 Pre-filter flow (Decision)

Two flow options:

| Flow | Pro | Con | Verdict |
|---|---|---|---|
| **Pre-filter** — client scans selected tabs against `_cachedItems`; if duplicates found, show aggregate confirm; dispatch only the allowed subset | Fewer IPCs; user sees the decision BEFORE commit; matches single-tab soft-warn semantics | Requires aggregate dialog UX | **Accepted** |
| Post-result — dispatch everything, categorise rejections (pre-B-059 behaviour) | Zero new UX | Dialog-less save of duplicates contradicts the B-059 soft-warn requirement | Rejected |

#### 29.6.3 Aggregate dialog — two-button, not three

§29.4.2 Variant 2 sketched a three-button dialog. Rather than extend `openConfirmDialog` to handle three buttons, we decompose the flow into two sequential confirms using the existing two-button primitive, short-circuited on Cancel:

**Step 1 — summary + choice:**

| Field | Copy |
|---|---|
| Heading | `Save ${totalCount} tabs?` |
| Body | `${dupCount} of these ${totalCount} tabs are already saved as bookmarks. Saving will create additional copies.` |
| Cancel | "Cancel" (aborts everything — no saves) |
| Confirm | `Skip duplicates, save ${totalCount - dupCount}` (primary action) |

If the user wants to save all (duplicates included), they hold a modifier key — **rejected** as too-hidden. Instead, the dialog wires a small secondary link below the body: `Save all ${totalCount} including duplicates`. Clicking it dispatches the full selection without a second confirm.

Wait — adding a third action via a link below the body re-introduces the three-choice problem through a side door. Re-evaluating:

**Simpler decomposition (accepted):**

- If `dupCount === 0` (no duplicates): no dialog. Proceed as today (current `_bulkMoveToGroup` path).
- If `dupCount > 0`:
  1. Show a single-dialog confirm with Cancel + `Save all ${totalCount} anyway`.
  2. User chooses Cancel → abort; or `Save all` → dispatch all.

This matches the **single-tab soft-warn model** (one confirm per initiated save action). "Skip duplicates" as an opt-in variant is **deferred** (§29.9 — out of scope for B-059; can revisit if UAT or user feedback surfaces demand). The copy:

| Field | Copy |
|---|---|
| Heading | `${dupCount} of ${totalCount} tabs already saved` |
| Body | `${dupCount} of the ${totalCount} selected tabs have URLs that are already saved. Saving will create additional copies alongside the existing ones.` |
| Cancel | "Cancel" |
| Confirm | `Save all ${totalCount}` — variant: primary |

This keeps the dialog signature two-button and reuses the existing `openConfirmDialog` (with the §29.4.4 `confirmLabel` + `variant` additions). One dialog, one decision, consistent with the single-tab flow. Bulk "skip duplicates" falls out of scope; if demanded later it becomes a preference or a second button, added then.

#### 29.6.4 Implementation sketch for `_bulkMoveToGroup`

```js
async function _bulkMoveToGroup(groupId) {
  _pruneStaleSelection();
  const { itemIds, tabIds } = _partitionSelection();
  if (itemIds.length > 0 && tabIds.length > 0) return;  // mixed — hidden by UI

  if (tabIds.length > 0) {
    // B-059: client-side duplicate pre-scan.
    // Build a URL→existing-item lookup from _cachedItems, normalized.
    const duplicates = [];
    for (const tabId of tabIds) {
      const tab = _cachedOpenTabsById.get(tabId);
      if (!tab) continue;
      const existing = _findDuplicateSavedItem(tab.url);
      if (existing) duplicates.push({ tabId, existing });
    }

    const proceed = async () => {
      // ... existing Promise.allSettled dispatch unchanged ...
    };

    if (duplicates.length === 0) {
      proceed();
      return;
    }

    openConfirmDialog(
      { title: tabIds.length + ' tabs' },
      proceed,
      {
        heading: duplicates.length + ' of ' + tabIds.length + ' tabs already saved',
        body:
          duplicates.length + ' of the ' + tabIds.length + ' selected tabs have URLs that are already saved. ' +
          'Saving will create additional copies alongside the existing ones.',
        confirmLabel: 'Save all ' + tabIds.length,
        variant: 'primary',
      },
    );
    return;
  }

  // ... existing itemIds-only bulk move path unchanged ...
}
```

Changes confined to the tabIds branch. The existing `Promise.allSettled` + categorised-toast code is wrapped in `proceed` and invoked either directly (no duplicates) or as the confirm callback (duplicates present).

#### 29.6.5 Single-tab flow in `_openOpenTabContextMenu`

`saveSelect.addEventListener('change', () => ...)` at `sidepanel/sidepanel.js:2952` currently dispatches `MSG_PROMOTE_TAB` directly. Post-B-059:

```js
saveSelect.addEventListener('change', () => {
  const groupId = saveSelect.value || null;
  const tab = _cachedOpenTabsById.get(tabId);
  const existing = tab ? _findDuplicateSavedItem(tab.url) : null;
  closeContextMenu(); // close synchronously — matches B-055 H-5

  const dispatchSave = () => {
    sendMessage(MSG_PROMOTE_TAB, { tabId, groupId }).catch((err) => {
      // ... existing error handling unchanged ...
    });
  };

  if (!existing) {
    dispatchSave();
    return;
  }

  openConfirmDialog(
    { title: tab?.title || tab?.url || 'this tab' },
    dispatchSave,
    {
      heading: 'URL already saved',
      body:
        'This URL is already saved as "' + existing.title + '" in ' +
        _groupLabelForItem(existing) + '. Save another copy?',
      confirmLabel: 'Save anyway',
      variant: 'primary',
    },
  );
});
```

#### 29.6.6 Cache availability

`_cachedOpenTabsById` (`sidepanel/sidepanel.js:130`) and `_cachedItems` (`:115`) are both populated on every `MSG_LIST_ITEMS` response via `renderAll` / `_setCachedOpenTabs` / `refetchAndPatchLiveState`. Both are guaranteed non-empty at the time the context menu opens (the context menu requires rendered rows, which requires a completed `MSG_LIST_ITEMS` response). No cold-start race surface for the pre-check.

### 29.7 Floating-Group Reassociation — Verified No-Change

`background/tabs/floating-groups.js:91-96`:

```js
const normalizedStored = safeNormalizeForMatch(record.url);
for (const [tabId, entry] of liveTabIndex) {
  if (claimedTabIds.has(tabId)) continue;
  if (safeNormalizeForMatch(entry.url) === normalizedStored) {
    // ... tie-break on (windowId, tabIndex) ...
  }
}
```

Already handles the duplicate-URL case via the B-018 H-2 fix: when multiple live tabs match a single floating-group record's URL, the `(windowId, tabIndex)` tuple tie-break selects the most-likely-correct one and the `claimedTabIds` guard prevents any tabId from being claimed twice. Conversely, when a single live tab matches multiple floating-group records, the first record wins and subsequent records remain unresolved on disk until a fresh matching tab appears.

B-059's data-layer change (allowing duplicate URLs in `PARTITION_ITEMS`) widens the saved-items input to this logic but introduces no new ambiguity the existing disambiguation doesn't already handle. **No code change required** — covered by the §29.8 regression test.

### 29.8 Test Strategy for R5

| # | Path | Cases |
|---|------|-------|
| T-1 | **Single-tab save — no duplicate** (happy path regression) | Context-menu "Save to group" on a tab whose URL doesn't match any saved item → no dialog shown; `MSG_PROMOTE_TAB` dispatched directly; item appears in target group. |
| T-2 | **Single-tab save — duplicate, user confirms** | Context-menu save on a tab whose URL matches an existing item → dialog appears with correct heading/body/groupLabel; user clicks "Save anyway" → `MSG_PROMOTE_TAB` dispatched; second item created; both items now in `_cachedItems`. |
| T-3 | **Single-tab save — duplicate, user cancels** | Same setup as T-2 → user clicks Cancel → no message dispatched; no new item in storage; dialog closes; focus restored to trigger row. |
| T-4 | **Bulk save — no duplicates** | Select 3 open tabs, none matching saved items → bulk bar "Move to group" → no dialog; existing per-tab Promise.allSettled path runs; toast on failures only. |
| T-5 | **Bulk save — mixed duplicates + unique** | Select 5 open tabs where 2 URLs match existing items → aggregate dialog appears ("2 of 5 tabs already saved"); user confirms "Save all 5" → 5 `MSG_PROMOTE_TAB` calls fire; 5 new items created (the 2 duplicates produce duplicate saved items). |
| T-6 | **Bulk save — all duplicates, user cancels** | Select 3 tabs all matching saved items → dialog "3 of 3 tabs already saved" → Cancel → no messages dispatched. |
| T-7 | **Data-layer regression — SW no longer throws `ERR_DUPLICATE_URL`** | Unit test: call the `MSG_PROMOTE_TAB` handler directly with a tab URL that matches an existing item → handler returns `{ ok: true, data: <Item> }`; asserts no throw, no `ERR_DUPLICATE_URL`. |
| T-8 | **URL normalization boundary** | Two URLs differing only by fragment (`https://example.com#a` vs `https://example.com#b`) considered duplicates (per `safeNormalizeForMatch`'s `forMatch: true` stripping hashes). Document in test assertion; if PM later decides fragments should matter, change `safeNormalizeForMatch` (out of B-059 scope). |
| T-9 | **Floating-group reassociation — duplicate URLs + multiple live tabs** | Two saved items with identical URL, one floating record pointing at one of them; two live tabs matching that URL. On reconcile, the floating record resolves to the tab with matching `(windowId, tabIndex)` and the other tab remains in Open Tabs. Confirms B-018 H-2 still holds. |
| T-10 | **Client cache staleness edge case** | Create item A via the dialog; immediately (before broadcast settles) dispatch a context-menu save of a tab with A's URL. Assert: worst case no warn shown (false negative — duplicate created silently, which is the allowed behaviour); best case dialog shown. No crash, no uncaught rejection. |

Test locations:
- T-1..T-6: `tests/b059-duplicate-warn.test.js` (new, sidepanel UI tests via the chrome-mock + DOM).
- T-7: extend `tests/promote-tab.test.js` (existing file — adapt the line-57-58 duplicate check which currently asserts a reject).
- T-8: extend `tests/url-normalize.test.js` if not already covered.
- T-9: extend `tests/b010-live-state.test.js` OR a new `tests/b018-disambiguation.test.js` with a duplicate-URL scenario (grep shows B-018 coverage is currently implicit).
- T-10: unit-level in `tests/b059-duplicate-warn.test.js`.

All tests must pass `MAX_BULK_INPUTS` / safe-mode / same-origin sender gates inherited from B-024 and B-055 (no new contracts to cover there).

### 29.9 Out-of-Scope — Explicitly Excluded

The following are **not** in scope for B-059. Implementing any of them is scope creep:

- **Search-result URL de-duplication (B-022).** Quick-search and inline-filter results show all items with distinct ids, including duplicates; aggregation-by-URL with group badges is a separate product decision deferred to B-022's implementation.
- **Import duplicate handling (B-060).** B-060 owns the HTML/JSON import flow's skip-vs-allow policy, progress summary, and preference persistence. B-059 does NOT touch `MSG_BULK_CREATE_ITEMS` or the import UI.
- **"Open existing" redirect** — when the user clicks Save and a duplicate exists, offering a "Open the existing saved item instead" action is a plausible future UX but requires extra affordances (button copy, focus management) and is not required by the B-059 AC.
- **Bulk "Skip duplicates" as a distinct action.** Explored and deferred (§29.6.3). The two-button dialog handles Cancel + Save-all; a three-button variant (Skip-duplicates) would either require a primitive extension or a second dialog. Ship without it; revisit if UAT demand emerges.
- **Preference-driven global "warn on duplicate" toggle.** Not requested in the B-059 AC; user behaviour is already initiated-per-save, so always-warn-on-duplicate is the simple correct default.
- **Pre-flight duplicate check on manual `MSG_CREATE_ITEM` (B-003 bookmark dialog).** The B-003 form-submit path does NOT pre-check for duplicates today (matches the "duplicates allowed" stance retroactively). B-059 confines the soft-warn to the promote-from-tab paths. If the PM decides manual create should also warn, add a parallel call site — trivial extension — but not required by the current AC.

### 29.10 R2 Correctness Checklist

| # | Check | Status | Reasoning |
|---|-------|--------|-----------|
| C-1 | Storage schema versioned | **N/A (PASS)** | No new partition, no new field on persisted shapes, no `KNOWN_VERSION` bump, no migration. `PARTITION_ITEMS` continues to tolerate duplicate URLs as it already does today — B-059 just removes the one reject-at-ingress gate that contradicted that tolerance. `ERR_DUPLICATE_URL` string constant retained but reclassified (§29.2.3, §29.5). |
| C-2 | Message contracts typed | **PASS** | `MSG_PROMOTE_TAB` wire shape unchanged (§29.2.4). `ERR_DUPLICATE_URL` is no longer in the handler's error-throw set — documented in-line in `shared/errors.js` (§29.5). No new `MSG_*` constants introduced; `MSG_CHECK_DUPLICATE_URL` explicitly rejected (§29.3.3). No widening of any response shape. `shared/messages.js` typedef requires no edit — the contract is strictly narrower (fewer error codes), not wider. |
| C-3 | Service worker cold-start safe | **PASS** | SW changes are deletions only — the handler becomes simpler, not more cold-start-dependent. Client-side pre-check consumes `_cachedItems`, which is populated by the existing `MSG_LIST_ITEMS` cold-fetch; before that first response, no context menu or bulk action is reachable (rows not yet rendered). `_findDuplicateSavedItem` guards against empty/unparseable URL inputs (`safeNormalizeForMatch` returns `''` on failure — `if (!normalized) return null`). No assumption of SW in-memory state beyond what the existing handler already required. |
| C-4 | ID stability | **PASS** | No impact. Duplicate saved items are new `Item` records with distinct ULIDs (`background/storage/ids.js`). Item identity (`id`) is independent of URL — B-059 exercises the intended separation. No opportunity for ephemeral ids (tabId, windowId) to leak into storage via this path. Claims mirror is `itemId`-keyed, not URL-keyed (see §10.5). |
| C-5 | Manifest file references resolvable | **N/A (PASS)** | No `manifest.json` changes. No new `default_path`, no new permissions, no new `commands`. Existing sidepanel/SW entries unaffected. |

### 29.11 Rollback Plan

**No storage schema change. No permission change. No data migration. No wire-contract widening.** Rollback is a straightforward `git revert` of the B-059 commit(s).

Specifically:

- Reverting `background/messages/storage-handlers.js` restores the `ERR_DUPLICATE_URL` reject at `:217-230`. Any duplicate URLs created during B-059's lifetime remain in storage — they are not corrupt, they are user-intended duplicates (`createItem` has always tolerated them; B-059 just removed the one path that didn't). Post-rollback, a user trying to promote one of those duplicate tabs will hit `ERR_DUPLICATE_URL` as before — benign regression.
- Reverting `sidepanel/sidepanel.js` removes `_findDuplicateSavedItem`, `_groupLabelForItem`, the `openConfirmDialog` signature extension, the soft-warn dialog wiring in `_openOpenTabContextMenu` and `_bulkMoveToGroup`. Single-tab and bulk saves return to their pre-B-059 error-toast-on-reject behaviour. The unchanged `if (code === ERR_DUPLICATE_URL) showToast(...)` branches at `:2645,2960` once again do useful work.
- Reverting `shared/errors.js` JSDoc change is no-op at runtime.
- Reverting `sidepanel/sidepanel.css` removes the `[data-variant="primary"]` confirm button style. Existing destructive-variant styling unaffected.
- No `chrome.storage.local` / `chrome.storage.session` cleanup needed.

**User-visible consequence of rollback:** Any items-with-duplicate-URL created during the B-059 window remain saved; they behave normally in navigation, drift detection, claims, reassociation, delete, edit. Only re-promoting one of them (i.e., opening the same tab again post-rollback) hits the restored reject. This is acceptable — no data loss, no corruption, a minor UX regression.

### 29.12 Flagged Risks

**None warrant tier upgrade.** All architectural decisions above are local refinements of existing infrastructure; no new storage partition, no new message constant, no new manifest permission. The three most common XL-escalation triggers are absent.

**Medium-severity risks tracked (not blockers):**

1. **Overwhelming dialog on large bulk-save selections.** A selection of 50 open tabs with 40 duplicates shows a dialog "40 of 50 tabs already saved" — arguably user-hostile at that scale. Mitigation: the selection is already UI-capped by `MAX_BULK_INPUTS` at the SW boundary; realistic duplicate-heavy selections are small. If UAT surfaces pain, a second-sprint enhancement can paginate the dialog body or switch to per-duplicate toast. Out of scope for B-059.
2. **Pre-check stale against a mid-refresh `_cachedItems`.** If the user creates an item in one surface (newtab) and immediately saves the same URL from the sidepanel context menu before the `MSG_STATE_CHANGED` broadcast settles, the soft-warn will be missed. The duplicate is still created (the desired post-B-059 behaviour), just without warning. Acceptable — documented in §29.3.1 and covered by test T-10.
3. **`safeNormalizeForMatch` fragment-stripping policy.** Two URLs differing only by fragment are treated as duplicates (the warn fires). This is consistent with every other match path in the codebase (drift, claims, floating-groups) but may surprise users who intentionally bookmark `https://example.com#section-a` and `https://example.com#section-b` as distinct entries. PRD does not define fragment-sensitivity at this granularity; current unified-normalization policy wins. Document in §29.9 and the user manual as an explicit known behaviour. If PM revisits: a `forMatch` vs `forStorage` split already exists in `normalizeUrl` (`shared/url.js`) — the fix would be a new `forDuplicateCheck: true` mode that preserves fragments. Out of scope for B-059.
4. **Soft-warn vs `_openOpenTabContextMenu` close timing.** The menu is closed synchronously (matches B-055 H-5) before `openConfirmDialog` opens. This is correct — the dialog is a separate modal — but the `_dialogTriggerEl` focus-restore target should be the original row, not the (now-removed) menu item. Implementation: capture `row` (the trigger row from `_contextMenuTriggerRow` or the function parameter) and pass it as `triggerEl` to `openConfirmDialog`. Cheap; called out so the [frontend-engineer] doesn't miss it.

No SEV1/SEV2 risks identified. Proceed to R3 build.

### 29.13 Handoff Notes for [frontend-engineer] R3

**File touchpoints (exhaustive):**

| File | Nature |
|---|---|
| `background/messages/storage-handlers.js` | Delete the 7-line `ERR_DUPLICATE_URL` reject block (:217-230); `safeNormalizeForMatch` import may become unused in this file — if so, remove the import to keep the file clean (grep confirms it's used only in that block). |
| `shared/errors.js` | Add JSDoc comment above `export const ERR_DUPLICATE_URL` explaining the repositioning (see §29.5 snippet). Constant value unchanged. |
| `sidepanel/sidepanel.js` | Add `import { safeNormalizeForMatch } from '../shared/url.js'` at top. Add `_findDuplicateSavedItem(url)` + `_groupLabelForItem(item)` helpers. Extend `openConfirmDialog` signature with `confirmLabel` and `variant` options (update the one existing confirm-button render line). Wire soft-warn in `_openOpenTabContextMenu` save-select handler (:2952). Wire pre-filter + confirm in `_bulkMoveToGroup` tabIds branch (:2628). |
| `sidepanel/sidepanel.css` | Add `.confirm-btn[data-variant="primary"]` style mirroring existing primary-button colours. |
| `tests/promote-tab.test.js` | Update the existing "rejects duplicate" test to assert the new behaviour (success, not reject). Rename the test if the old name no longer describes it. |
| `tests/b059-duplicate-warn.test.js` (new) | T-1..T-6 and T-10 from §29.8. |
| `tests/b010-live-state.test.js` | Extend with T-9 floating-group duplicate-URL regression (if no better home). |

**Suggested implementation order (small → big):**

1. **Data-layer change first.** Delete the SW reject and update `tests/promote-tab.test.js`. Zero-risk; test suite must stay green. (XS)
2. **JSDoc comment on `shared/errors.js`.** No-op runtime. (XS)
3. **`openConfirmDialog` signature extension + CSS primary-button variant.** Tested in isolation by re-running the existing delete-confirm tests — should still pass. Adds new affordance for B-059. (S)
4. **`_findDuplicateSavedItem` + `_groupLabelForItem` helpers.** Pure, unit-testable. Write T-1..T-3 test cases alongside. (S)
5. **Single-tab wiring in `_openOpenTabContextMenu`.** Smaller, more contained than bulk. Exercises the helper end-to-end. Finish T-1..T-3. (S-M)
6. **Bulk wiring in `_bulkMoveToGroup`.** Builds on the helper. Finish T-4..T-6. (M)
7. **T-9 floating-group regression test** — sanity check. (XS)
8. **T-10 staleness edge case test.** (XS)
9. **R4 review prep: verify no CSP issue (no inline JS introduced), no new permissions, no new `innerHTML` writes (dialog copy goes through `textContent` via existing `confirmBodyEl.textContent` path).**

**Non-obvious gotchas:**

- **`_cachedItems` freshness in sidepanel.** Only items from `MSG_LIST_ITEMS` responses — confirmed via `renderAll` at `:954`. This cache IS kept fresh via the broadcast listener; no extra hydration needed. But if the sidepanel is opened for the first time, the context menu and bulk bar are only reachable after first render, so the cache is guaranteed populated before any save attempt.
- **`_findDuplicateSavedItem` must handle unparseable URLs.** `safeNormalizeForMatch('')` returns `''`; the function's early `if (!normalized) return null` keeps that case from falsely matching other unparseable URLs. Don't optimise this check out.
- **Dialog focus-restore on Cancel.** Existing `openConfirmDialog` restores focus to `_dialogTriggerEl` on close. Pass the invoking row element as `triggerEl` so cancelling the B-059 dialog returns focus to the Open Tabs row, not to the now-closed context menu's phantom target.
- **`confirmDeleteBtnEl`'s dataset attribute** must be cleared between calls (stale `data-variant="primary"` leaking to a subsequent delete confirm would paint the delete button blue). Cleanest: always assign `dataset.variant = variant` (where `variant` defaults to `'destructive'`) at open time — no reset-on-close needed.
- **Ordering of `closeContextMenu()` vs `openConfirmDialog()`.** Close the menu synchronously first (matches B-055 H-5); the dialog is a separate modal and does not interact with the menu's focus trap.
- **Error-toast branches at `:2645,2960`.** Leave them — they remain correct fall-throughs during deploy-window staleness (§29.5).

### 29.14 Deviations From R2 (R6 Close — As-Built Record)

All R2 decisions in §29.1–§29.13 shipped as designed. Deviations and post-build clarifications are recorded below.

#### 29.14.1 CSS selector corrected to match live markup

§29.4.4 and §29.13 proposed the primary-variant CSS rule as `.confirm-btn[data-variant="primary"]`. The confirm-button class in `sidepanel.html` is actually `.dialog-btn--danger`, so the shipped rule is `.dialog-btn--danger[data-variant="primary"]` at `sidepanel/sidepanel.css:749` (with a matching `:hover` at `:755`). Visual outcome is identical to the R2 intent; only the selector was adjusted to match the existing DOM class. The `data-variant` dataset contract on `confirmDeleteBtnEl` is unchanged from §29.4.4.

#### 29.14.2 Dark-theme primary-button contrast — deferred to B-062

R4 [qa-reviewer] UAT-9 measured `--accent: #60a5fa` on `#ffffff` at ~2.3:1 in dark theme, below WCAG AA (4.5:1). Root cause is the `--accent` token itself (set in Sprint 2 via B-003/B-006 on `.dialog-btn--primary`), not new code introduced by B-059. B-059 inherits the gap; it does not introduce it. A new backlog item **B-062** (P1, S) was filed for Sprint 16 to perform a whole-app primary-button contrast audit (light + dark) and either darken the dark-theme accent or introduce a dedicated `--accent-on-surface` token. B-059 shipped with the inherited gap; UAT-9 recorded as WARN, not FAIL, per the UAT plan at `docs/UAT_B-059.md:192-205`.

#### 29.14.3 T-7 tightened to exercise the real SW dispatcher

R4 [qa-reviewer] M-4 flagged that the original T-7 in `tests/promote-tab.test.js` wrapped `promoteTab` in a local harness rather than going through `chrome.runtime.onMessage`. A second T-7 case was added at `tests/promote-tab.test.js:212` ("B-059 T-7: MSG_PROMOTE_TAB real dispatcher does NOT throw ERR_DUPLICATE_URL on duplicate URL") that imports `registerStorageHandlers` and dispatches via `chrome.runtime.onMessage._listeners`, asserting `ok: true` on a duplicate URL. Any re-introduction of the `ERR_DUPLICATE_URL` reject inside the real dispatch path now breaks the build.

#### 29.14.4 T-9 coverage — no new test file created

§29.8 suggested extending `tests/b010-live-state.test.js` or creating `tests/b018-disambiguation.test.js` for T-9 (floating-group reassociation + duplicate URLs). [test-engineer] confirmed existing coverage is sufficient:

- `tests/tab-claims-disambiguation.test.js` — 3 items / 2 tabs same URL.
- `tests/b018-persistence.test.js:258-290` — B-018 H-2 disambiguation path with duplicate URLs.

No new test file was created. The `_reconcileFloatingRecords` / claims-mirror paths are unchanged by B-059 (§29.7), so re-asserting them would duplicate existing coverage.

#### 29.14.5 `_isUnsavableScheme` extracted to `shared/url.js` (cross-reference from B-061)

Originally inlined in `sidepanel.js`, R4 [code-reviewer] M-1 on B-061 flagged policy drift risk between the sidepanel's `UNSAVABLE_SCHEME_PATTERN` and the storage layer's `ALLOWED_URL_SCHEMES`. The helper was relocated to `shared/url.js:54` as `isUnsavableScheme(url)` — colocated with the allowlist so drift is visible at review time. This is a B-061 detail; it is documented here because B-059 and B-061 ship together in Sprint 15 and both touch the promote-tab UX entry surface.

#### 29.14.6 Storage-handler comment documents the reposition

`background/messages/storage-handlers.js:216-219` carries an in-file comment describing the B-059 reposition (soft-warn handled client-side; `ERR_DUPLICATE_URL` retained in `shared/errors.js` for deploy-window stability). This is a minor addition beyond the "delete 7 lines" footprint in §29.13 but matches §29.5's repositioning intent.

#### 29.14.7 Final test counts

Sprint 15 baseline was 575 tests. At close: **605 pass / 0 fail** (+30). Per-item breakdown is recorded in `SPRINT.md` "Completed This Sprint" (B-058 + B-027 + B-059 + B-061). B-059 contributes T-1..T-6 + T-10 in `tests/b059-duplicate-warn.test.js`, two updated cases in `tests/promote-tab.test.js` (AC4 + the tightened T-7 real-dispatcher case), and the existing `tests/tab-claims-disambiguation.test.js` + `tests/b018-persistence.test.js` cover T-9.

#### 29.14.8 Design decisions that held without deviation

For future readers auditing the R2→R3 delta, the following landed verbatim as specified:

- SW reject deletion at `background/messages/storage-handlers.js:~217` (§29.2.3).
- `ERR_DUPLICATE_URL` constant retained in `shared/errors.js` with JSDoc reposition note (§29.2.3, §29.5).
- `_findDuplicateSavedItem(url)` + `_groupLabelForItem(item)` helpers in `sidepanel.js` (§29.3.2, §29.4.2).
- `openConfirmDialog` signature extension (`confirmLabel`, `variant`) preserving backward compat for the delete path (§29.4.4).
- Single-tab dialog copy "URL already saved" / "Save anyway" (§29.4.2 Variant 1).
- Bulk-promote two-button dialog "Save all N" / "Cancel" with "Skip duplicates" explicitly deferred (§29.4.2 Variant 2, §29.6.3, §29.9).
- No storage schema change; no manifest change; no message-contract change (§29.10, §29.11).

---

