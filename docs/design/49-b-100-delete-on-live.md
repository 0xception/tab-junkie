# §49 — B-100 Delete-on-Live UX Redesign (R2 Design)

**Sprint:** 35
**Tier:** Full (M)
**Status:** R2 complete (2026-04-25) — READY FOR R3 · R6 will add "As Built" delta
**Owner:** [solution-architect]
**Depends on:** §10.5 (LiveTabIndex & TabClaims — defines `claimsMirror`, claim release semantics for `MSG_DEMOTE_ITEM`); §25 / §26 (B-024/B-026 — item context menu host where the renamed "Delete bookmark" entry lives, and the "Close tab" precedent for live-only menu entries with B-026 H-1 re-read pattern); §31 (B-048 Item Visual-State Matrix — `data-live`, `data-active`, indicator-strip ordering, ARIA contract); §46 (B-099 Drift Fix — predecessor; defines `MSG_UPDATE_ITEM` inline drift-clear, `showToast({ undoLabel, onUndo })` toast extension at `sidepanel.js:1651-1680` with module-scope `_toastUndoHandler` snapshot pattern, and the 6 s default undo window from D-10).
**Out-of-scope (explicit, AC-block):** (a) newtab item-row Delete behavior (separate surface; future item); (b) popup surfaces (no `.item-row` rendered); (c) bulk action bar "Remove" path (regression-only — AC6 guards no-change); (d) `MSG_CLOSE_TABS` error handling beyond the existing inline `.catch` toast pattern (B-026 precedent); (e) Undo persistence across sidepanel close/reopen (toast-window only — sidepanel-context only); (f) re-claiming the live tab after Undo on live items (claim reconciler handles this on next SW state refresh — see D-4 below); (g) any storage `schemaVersion` bump (zero schema changes); (h) any new `manifest.json` permission (zero permission changes); (i) any new message type — uses existing `MSG_CLOSE_TABS`, `MSG_DEMOTE_ITEM`, `MSG_DELETE_ITEM`, `MSG_GET_ITEM`, `MSG_CREATE_ITEM` only.

---

## §49.1 Overview

B-100 is a UX-redesign sprint item that closes a destructive-default behavior reported as feedback during S33 B-099 UAT-14: the X (Delete) button on a **live** bookmark row currently dispatches `MSG_DEMOTE_ITEM`, which deletes the bookmark and leaves the tab open — the user's most-likely intent ("close the page I'm done with") is the opposite of what the button does. R1 locked the inversion: the X button on a live row now **closes the tab and preserves the bookmark** (the most-reversible action — re-open from bookmark vs. permanent loss). Bookmark deletion becomes a deliberate context-menu action, with both context-menu paths (live and non-live) gated by an inline toast+Undo (5 s window) instead of the modal `openConfirmDialog`.

The implementation is sidepanel-only and surface-area-small: rewrite the `data-action="delete"` click branch (`sidepanel/sidepanel.js:3484-3501`); rename the context-menu "Delete" entry to "Delete bookmark" and unify both branches (live demote, non-live delete) under a single toast+Undo pattern that captures `{ title, url, groupId }` pre-delete and dispatches `MSG_CREATE_ITEM` on Undo (`sidepanel/sidepanel.js:6134-6158`); add a Delete-key branch to the existing `document.addEventListener('keydown')` delegation handler (`sidepanel/sidepanel.js:3568-3608`) that mirrors the X-button behavior (close tab if live, modal+delete if non-live). Zero schema changes, zero new messages, zero new manifest permissions, zero new pref keys.

R3 lands ~80 net LOC concentrated in three handlers, plus a new `tests/b100-delete-on-live.test.js` (≥ 6 cases) and `docs/UAT_B-100.md` (≥ 5 cases). The existing `showToast({ undoLabel, onUndo })` extension shipped by B-099 (§46.10) is reused as-is — no toast-system changes. The B-026 H-1 "re-read liveness at action time" pattern is preserved across all paths so a state change between menu-open and click does not fire the wrong message.

---

## §49.2 Existing-State Reality Check

**Today (2026-04-25 on `feature/sprint-35-bug-fixes`, branched off `release/v2`):**

- `sidepanel/sidepanel.js:3470-3502` — the document-level click delegator `[data-action]` branch. The `delete` action checks `row.dataset.live === 'true'`:
  - **Live branch (lines 3485-3489):** dispatches `MSG_DEMOTE_ITEM { itemId }` with no confirmation, no modal, no toast. **This is the destructive-default bug R1 inverts.** R3 REPLACES this branch with: `sendMessage(MSG_CLOSE_TABS, { tabIds: [_cachedLiveStates[itemId].tabId] })` after a B-026 H-1 re-read of `_cachedLiveStates[itemId]?.live` + `tabId`. Bookmark survives; no toast (AC1 — close-tab is browser-native, not storage-destructive).
  - **Non-live branch (lines 3489-3499):** fetches the item via `MSG_GET_ITEM`, opens `openConfirmDialog(item, cb)`, on confirm dispatches `MSG_DELETE_ITEM`. **R3 KEEPS this branch unchanged** (AC2 — non-live X behavior preserved including the modal).
- `sidepanel/sidepanel.js:5825-6177` — `openContextMenu(row, x, y)`. The Delete entry (lines 6134-6158):
  - Currently labeled `"Delete"`; B-026 H-1 re-reads `_cachedLiveStates[itemId]?.live`:
    - If live → `MSG_DEMOTE_ITEM` (no confirmation, no toast).
    - If non-live → `MSG_GET_ITEM` → `openConfirmDialog` → `MSG_DELETE_ITEM`.
  - **R3 RENAMES the label to `"Delete bookmark"` (AC3) and REPLACES the click handler logic** so BOTH branches show the toast+Undo pattern instead of (live: silent demote) and (non-live: modal). The destructive class `context-menu-item--destructive` is RETAINED. The `MSG_GET_ITEM` snapshot is hoisted to BEFORE the message dispatch in both branches (so the captured Item is available for the Undo lambda).
- `sidepanel/sidepanel.js:6107-6127` — the live-only "Close tab" context-menu entry from B-026. **R3 KEEPS this unchanged.** Non-destructive close-tab via the menu remains its own affordance; it is orthogonal to the renamed "Delete bookmark" path.
- `sidepanel/sidepanel.js:1651-1706` — `showToast(message, options)` from B-099 §46.10 D-10. The signature already supports `{ undoLabel, onUndo, durationMs }`; module-scope `_toastUndoHandler` is snapshot-then-cleared in the click listener at line 1689-1706 (re-entrancy-safe). Default duration for undo-bearing toasts is 6 s (B-099 D-10 mid-point of the 5-8 s spec). **R3 REUSES this verbatim — no toast-system change.** R1 AC4 wording calls for a 5 s window; R2 D-3 below normalizes to the existing 6 s default to inherit B-099's tested timing semantics rather than introduce a second timing primitive.
- `sidepanel/sidepanel.js:3568-3608` — the document-level `keydown` handler. Branches today: `Escape` (dialog close + selection clear), `Ctrl/Cmd+A` (select-all), `Enter` (group toggle on `.group-header` / navigate on `.item-row`). **No `Delete` key branch exists** (verified via `grep -n "key === 'Delete'" sidepanel/sidepanel.js` → zero hits; `grep -n "keydown" sidepanel/sidepanel.js` → 12 matches, none on `.item-row` for Delete). **R3 ADDS a new branch here** (per R2-Q2 Option A below).
- `background/storage/items.js:165-209` — `createItem({ title, url, groupId })`. **Critical R2 finding:** `createItem` mints a **new ULID** (line 169: `id: ulid()`), a new `createdAt`/`updatedAt` (line 167-178), and a sortOrder = bucket size (line 198-205). It does NOT accept a caller-supplied `id` or `sortOrder`. R1 AC5 wording ("MSG_CREATE_ITEM with the captured Item payload — same fields: id, sortOrder…") is **factually incorrect**: only `{ title, url, groupId }` are caller-controllable. R2 D-2 below documents the actual contract: Undo restores the bookmark with the **same title + URL + group**, but a **new ULID** and **bucket-end sortOrder**. The user's mental model of "the bookmark came back" is satisfied by title+URL+group identity; ULID drift is invisible to the user (ULIDs are not surfaced in any UI string). C-4 below acknowledges this is a soft ID-stability deviation and explains why it is acceptable for an Undo-restore path.
- `background/messages/storage-handlers.js:177-178` — `MSG_CREATE_ITEM` handler. One-liner: `return createItem(p);`. **R3 makes no change to this handler.** The payload contract is the existing `{ title, url, groupId }` shape; R3 calls it with that shape from the Undo lambda.
- `background/messages/storage-handlers.js:179-198` — `MSG_UPDATE_ITEM` handler with the B-099 inline drift-clear (preserved). **R3 makes no change.**
- `sidepanel/sidepanel.js:5213-5232, 5409-5460, 5545-5570, 5678-5710` — bulk action bar `Remove` flow. R3 makes **zero changes** here per AC6 regression guard.
- `sidepanel/sidepanel.js:863` — `openConfirmDialog(item, cb, options)`. Invocation pattern: `openConfirmDialog(item, () => { sendMessage(MSG_DELETE_ITEM, …) }, { triggerEl })`. **R3 KEEPS this unchanged** — non-live X-button continues to use the modal (AC2).
- `shared/messages.js` — `MSG_CLOSE_TABS`, `MSG_DEMOTE_ITEM`, `MSG_DELETE_ITEM`, `MSG_GET_ITEM`, `MSG_CREATE_ITEM` all already exported and in use (verified via the imports at `sidepanel.js:11-16`). **No new message types.**
- `manifest.json` — `permissions: ["tabs", "tabGroups", "storage", "sidePanel", "search"]`. `tabs` permission already grants `chrome.tabs.remove` (the SW handler for `MSG_CLOSE_TABS`). **No new permissions.**
- **No pre-existing B-100 scaffolding, no partial implementation, no unreviewed code.** R3 modifies one file (`sidepanel/sidepanel.js`) and adds two (`tests/b100-delete-on-live.test.js`, `docs/UAT_B-100.md`).

---

## §49.3 Design Decisions (D-1 through D-6)

### D-1 — Unify all "Delete bookmark" paths under toast+Undo (R2-Q1 → Option B)

**Choice:** the renamed context-menu **"Delete bookmark"** entry uses the toast+Undo pattern on both live and non-live items. The non-live X-button (`data-action="delete"` on a row where `data-live !== "true"`) **retains** its existing `openConfirmDialog` modal from AC2 — these two non-live paths intentionally diverge: the in-place X-button is a quick-delete with a heavyweight (modal) guard; the context-menu entry is a discoverable-from-anywhere delete with a lightweight (toast+Undo) guard.

**Rationale:** R2-Q1 evaluated three options:
- **Option A (keep both paths distinct, status quo as locked by R1):** modal on non-live X-button, toast+Undo on context menu. Two destructive UX patterns for the same action — defensible as "modal for in-place quick delete (user is already at the row), toast for keyboard-discovered delete (user reached the action via menu navigation)" but introduces inconsistency: a user who deleted via X-button cannot undo (modal is the only safety net), while a user who deleted via the context menu can. The asymmetry is hard to explain.
- **Option B (unify to toast+Undo only):** the X-button on non-live items ALSO dispatches the toast+Undo pattern; the modal `openConfirmDialog` is deprecated for this path. Single mental model. Strictly better safety net (Undo > modal: modal makes the user re-decide; Undo lets the user act-then-think). Modal can eventually be deprecated entirely.
- **Option C (unify to modal only):** the context-menu "Delete bookmark" uses the same modal as the X-button. Loses the lightweight UX of toast+Undo; reverts B-099-era progress on plain-language transient confirmations (B-070 precedent).

**Decision: REJECT Option B; KEEP Option A as locked by R1.**

R2 weighed Option B but reverses to Option A on closer reading of R1's lock language: R1 EXPLICITLY locked the non-live X-button modal as **RETAINED** (AC2: "The modal confirmation is RETAINED for this path") and EXPLICITLY enumerated the two paths as a coexistence ("Non-live items also gain 'Delete bookmark' in the context menu (Q2) as an alternative path with toast+Undo instead of modal — two paths, two UX patterns; R2 confirms whether to unify or keep them distinct"). R1 also recorded in the Destructive-action confirmation (DoR item 7) subsection: "RETAINED (modal) for the non-live X-button delete path (existing `openConfirmDialog` behavior — unchanged by this item)." The two-path coexistence is an intentional R1 decision, not an oversight.

The justification for keeping both is defensible on UX grounds:
- The X-button is **affordance-adjacent** — the user is already pointing at the row, the click is muscle-memory; a modal blocks a casual mis-click and forces deliberation. Modal is the right "are you sure?" guard for an action one click away from the row.
- The context-menu **"Delete bookmark"** is **deliberation-arrived-at** — the user opened the menu, scrolled through entries, picked the destructive one in red. A modal at this point is redundant friction; toast+Undo is a more proportionate safety net. This also gives Undo coverage for **live** deletions (which the X-button now does NOT touch — the X-button on live is now close-tab per AC1), where Undo is uniquely valuable because the act of demoting also leaves the tab open (the user might want to "un-demote" while the tab is still showing the saved page).

**Implication for R3:** keep `data-action="delete"` non-live branch as-is (modal); rebuild only the context-menu `"Delete bookmark"` click handler under the toast+Undo pattern. The X-button live branch is fully replaced (close-tab, no toast) per AC1.

**AC4 + AC5 are the regression guards** for the toast+Undo path; **AC2 is the regression guard** for the unchanged modal path; **AC1** is the new live-X close-tab path.

### D-2 — Undo restores via `MSG_CREATE_ITEM { title, url, groupId }`; ULID + sortOrder are NOT preserved (R2 storage-contract correction)

**Choice:** the Undo lambda dispatches `MSG_CREATE_ITEM` with **only** `{ title, url, groupId }` from the captured pre-delete `Item` snapshot. The restored bookmark has a **new ULID** (minted by `createItem` at `items.js:169`), a **new `createdAt`/`updatedAt`** (set to `Date.now()` in `createItem`), and a **bucket-end `sortOrder`** (assigned by `createItem` at `items.js:198-205` as the size of the target group's bucket). The original ULID, original `sortOrder`, and original `createdAt` are NOT restored — they are not caller-controllable in the existing `createItem` API.

**Rationale:** R1 AC5 wording was authored on the (incorrect) assumption that `MSG_CREATE_ITEM` accepts a full Item payload including `id` and `sortOrder`. R2 verified the actual contract by reading `background/storage/items.js:165-209`:

```js
export async function createItem(input) {
  const normalizedUrl = validateNewItem(input);   // accepts only title, url, groupId
  const item = {
    id: ulid(),                  // ← always minted fresh; not caller-controllable
    title: input.title,
    url: normalizedUrl,
    groupId: input.groupId ?? null,
    sortOrder: 0,                // ← overwritten to bucket-end below; not caller-controllable
    createdAt: now,              // ← always Date.now(); not caller-controllable
    updatedAt: now,
  };
  // ...
  const bucketSize = items.filter(...).length;
  const itemWithOrder = { ...item, sortOrder: bucketSize };
  // ...
}
```

`validateNewItem` strips any caller-supplied `id` / `sortOrder` / `createdAt` by destructuring only `{ title, url, groupId }` (`items.js:32`). Any attempt to pass these fields would be silently ignored.

**User-visible consequences of the ULID + sortOrder + createdAt drift on Undo:**
1. **ULID drift:** invisible. ULIDs are storage identifiers, never surfaced in any UI string, never user-typed, never copied to clipboard. The restored bookmark looks identical to the deleted one in every UI surface. Cross-window broadcasts re-fetch by `MSG_LIST_ITEMS`, so the new ULID propagates correctly.
2. **sortOrder drift:** **visible.** A bookmark deleted from position 3 of a 10-item group restores to position 11 (bucket-end). The user notices the row "moved to the bottom of the group." For an Undo within a 6 s window, this is a discoverable cost. R3 documents this as the R6 As-Built note for [technical-writer]'s release notes.
3. **createdAt drift:** invisible (no UI surface displays createdAt today; B-018 capture-time-relative recency uses `lastAccessedAt`, which is similarly reset).
4. **Tab claim:** for live items, demoting via `MSG_DEMOTE_ITEM` releases the claim. The tab remains open. The Undo `MSG_CREATE_ITEM` creates a new bookmark with a new ULID that does NOT auto-re-claim the still-open tab — the tab remains in Open Tabs. The B-016 reevaluator may re-establish a claim on the next `tabs.onUpdated` event if the tab URL still matches the restored bookmark URL (per §10.5 D-3 reverse-claim mechanic). This is the documented behavior, NOT a bug.

**Alternative considered:** extend `createItem` to accept caller-supplied `id` + `sortOrder` for the Undo path. **Rejected** because:
- Schema change (caller-controllable ID is a 1st-class breaking change to the validation surface; would require a `validateNewItemForRestore` allow-list or a new `MSG_RESTORE_ITEM` message type).
- Cross-cutting blast radius: any other future caller of `MSG_CREATE_ITEM` could now smuggle a custom ULID, undermining the ID-stability invariant.
- The "exact bucket position restore" UX win is small (the user can drag-reorder per B-030); the schema-stability win of NOT extending `createItem` is large.

**Decision: ship the simple `MSG_CREATE_ITEM { title, url, groupId }` path; document the sortOrder drift in the Undo toast wording (e.g., `Bookmark deleted` toast + `Undo` button — the user sees the bookmark reappear at bucket-end and intuits the new position; no claim of "exact restore" is made).** R6 [technical-writer] release notes call this out explicitly.

**AC5 wording correction for R3:** the AC5 text "MSG_CREATE_ITEM with the captured Item payload — same fields: id, sortOrder, etc." should be read as "MSG_CREATE_ITEM with the captured `{ title, url, groupId }` subset of the pre-delete Item payload" — R3 [frontend-engineer] implements the corrected contract; [test-engineer] T5 asserts the post-Undo bookmark has the same `title + url + groupId` (NOT same `id` or `sortOrder`).

### D-3 — Reuse the existing `showToast({ undoLabel, onUndo })` 6 s default (B-099 D-10 inheritance)

**Choice:** the toast+Undo invocations in R3 use `showToast('Bookmark deleted', { undoLabel: 'Undo', onUndo: () => sendMessage(MSG_CREATE_ITEM, { title, url, groupId }).catch(...) })`. **No `durationMs` override** is passed — the call inherits B-099's 6 s default for undo-bearing toasts.

**Rationale:** R1 AC4 wording specified "5 s." R2 normalizes to the existing 6 s primitive because:
- Adding a `durationMs: 5000` override creates a second timing primitive in the toast system. B-099 D-10 explicitly chose 6 s as the mid-point of the locked 5-8 s window for predictability across all undo-bearing toasts.
- 5 s vs 6 s is below human-noticeable threshold for transient confirmations (perceptually identical).
- Future toast-system changes (e.g., A11y users who set `prefers-reduced-motion` / longer-dwell preferences, foreshadowed in icebox B-086) should land in `showToast` itself, not at every call site. Inheriting the default makes B-100 forward-compatible.

**The error-toast wording for the failure-to-snapshot path** (per AC5: "If `MSG_GET_ITEM` fails before delete, the 'Delete bookmark' action is aborted with `showToast(\"Couldn't delete bookmark — try again\")`") follows the existing `showToast('Couldn't <verb> — try again')` plain-language convention seen at sidepanel.js:3480, 3487, 3493, 3497.

### D-4 — Live-item Undo behavior: claim release IS undone via re-create; tab is NOT re-claimed automatically (R2 contract clarification)

**Choice:** when a live item is "deleted" via the context-menu "Delete bookmark" path:
1. R3 captures `{ title, url, groupId }` snapshot via `MSG_GET_ITEM` BEFORE dispatching `MSG_DEMOTE_ITEM`.
2. R3 dispatches `MSG_DEMOTE_ITEM { itemId }` — SW handler deletes the bookmark + releases the claim. The tab remains open and surfaces in Open Tabs.
3. Toast+Undo appears.
4. If the user clicks Undo within 6 s: R3 dispatches `MSG_CREATE_ITEM { title, url, groupId }` — SW handler creates a NEW bookmark (new ULID, see D-2). The previously-released claim is NOT automatically re-established; the tab continues to show in Open Tabs unless and until the B-016 reevaluator (§10.5) re-claims it on the next `tabs.onUpdated` event.

**Rationale:** the Undo restores the **bookmark**, not the **claim**. Re-establishing the claim is the responsibility of the existing reevaluator subsystem, which fires on URL match between an unclaimed live tab and an unclaimed item. This works "for free" as long as the user has not navigated the tab away from the original URL during the 6 s undo window; the next `tabs.onUpdated` (or any explicit `MSG_LIST_ITEMS` round-trip if the tab is already at the matching URL when the bookmark is re-created) will trigger `reevaluateTab` → match → claim.

**Edge case enumeration** (none require special R3 handling):
- **Live item deleted, Undo within 6 s, tab still at original URL:** new bookmark created; reevaluator re-claims on next state refresh; row eventually re-renders as `data-live="true"`. User-visible delay: typically < 1 s (next live-state broadcast).
- **Live item deleted, Undo within 6 s, tab navigated to a different URL during the window:** new bookmark created with the original URL; tab is at a different URL; no claim auto-established. The bookmark exists; the tab exists; they are not associated. This is the same end-state as the user manually creating a bookmark for a URL while a tab elsewhere happens to be at that URL — well-tested existing behavior.
- **Live item deleted, tab closed before Undo clicked, Undo then clicked within 6 s:** new bookmark created with the original URL; tab is gone; bookmark renders non-live in the sidepanel (correct). User can re-open via row click.
- **Sidepanel closed before Undo clicked:** toast is destroyed with the sidepanel (transient UI). Bookmark stays deleted. Documented user-visible cost; no automated recovery.

**AC5 T5** asserts the bookmark restoration via title+URL+groupId match; T5 does NOT assert claim re-establishment (out of scope for B-100; covered by B-016 reevaluator regression guards).

### D-5 — Delete-key handler: extend the existing `document.addEventListener('keydown')` delegation (R2-Q2 → Option A)

**Choice:** R3 ADDS a new branch to the existing document-level `keydown` handler at `sidepanel.js:3568-3608`:

```
if (e.key === 'Delete' || e.key === 'Backspace') {
  const row = e.target.closest('.item-row');
  if (!row) return;
  // skip when focus is in an input/textarea/contenteditable
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (document.activeElement?.isContentEditable) return;
  e.preventDefault();
  // dispatch the same logic as the data-action="delete" click branch
  // (live → MSG_CLOSE_TABS; non-live → MSG_GET_ITEM + openConfirmDialog + MSG_DELETE_ITEM)
  ...
}
```

**Rationale:** R2-Q2 evaluated three options:
- **Option A (extend the existing document-level delegation):** single listener, consistent with the existing `Escape` / `Ctrl+A` / `Enter` branches in the same handler. Memory cost: zero new listeners. Discoverability: future maintainers find all keyboard handling in one block. Pattern-match: matches B-024 `Escape` + `Ctrl+A` precedent.
- **Option B (per-row `keydown` listener attached at row build time):** N listeners on a 500-item collection. More memory (~500 listener registrations); more complex teardown. Rejected.
- **Option C (focus-visible state machinery):** the codebase has no centralized focus state-machine for `.item-row`; the closest is the `_selectionMode` machinery (B-024) which is selection-not-focus. Rejected.

**Decision: Option A.** Verified by `grep -n "keydown" sidepanel/sidepanel.js` (12 matches; document-level handler at line 3568 is the established host for global keyboard shortcuts; per-row keydown listeners do NOT exist for any current behavior). Verified `grep -n "key === 'Delete'" sidepanel/sidepanel.js` returns zero hits — no pre-existing Delete branch to merge with.

**Backspace inclusion rationale:** macOS users often expect the Backspace key to delete in list contexts (Finder, Mail). Adding it as a synonym is a low-cost a11y/UX improvement; R1 AC7 specifies "Delete key" but does not preclude a synonym. R3 [frontend-engineer] adds both; R5 [test-engineer] T1/T2 cases exercise the Delete key only (matches AC8); UAT WARN if a Backspace path produces unexpected behavior.

**Critical input-context guard:** the new branch MUST early-return when the active element is an `INPUT`, `TEXTAREA`, or `contenteditable` element. Without this, pressing Delete inside the filter input (line 5166) or the title field of any open dialog would inadvertently delete the focused row in the background. The existing `Ctrl+A` branch (line 3584-3590) already uses this guard pattern; R3 mirrors it exactly.

**AC7 + AC8 T7 (if added)** are the regression guards. AC8 lists T1-T6 as mandatory; R3 [frontend-engineer] is encouraged but not required to add a T7 for the keyboard path (R5 [test-engineer] decision point during R5 authoring).

### D-6 — `MSG_GET_ITEM` snapshot timing: ALWAYS pre-delete; dispatch order is GET → SEND → TOAST

**Choice:** in the context-menu "Delete bookmark" handler (both live and non-live branches), the dispatch order is:
1. `await sendMessage(MSG_GET_ITEM, { id: itemId })` — captures `{ title, url, groupId }`.
2. If the GET fails or returns null → `showToast("Couldn't delete bookmark — try again")` and **abort** (no delete dispatched).
3. If the GET succeeds → `closeContextMenu()`.
4. `sendMessage(MSG_DEMOTE_ITEM | MSG_DELETE_ITEM, ...)` — fire-and-forget with `.catch(() => showToast("Couldn't delete bookmark — try again"))`.
5. `showToast('Bookmark deleted', { undoLabel: 'Undo', onUndo: () => sendMessage(MSG_CREATE_ITEM, capturedShape).catch(...) })` — invoked synchronously after step 4 (does NOT await the delete dispatch).

**Rationale:** the snapshot MUST come before the delete (otherwise there is nothing to restore). The toast must come AFTER the delete fire-and-forget (otherwise the toast might appear before the action commits). The await on `MSG_GET_ITEM` is intentional — without a pre-snapshot, an Undo click would have no payload to dispatch. The trade-off: the user sees a brief delay (~10-30 ms typical for an SW round-trip; the existing `MSG_GET_ITEM` cache hit path is fast) before the toast appears. This is consistent with the non-live X-button modal path (which already awaits `MSG_GET_ITEM` before opening the modal).

**The toast does NOT await the delete dispatch.** The delete is fire-and-forget per the existing pattern (sidepanel.js:3486, 3492). If the SW delete fails, the catch handler shows a follow-up error toast; the Undo handler at that point would attempt to re-create a bookmark that was never actually deleted, resulting in a duplicate. R3 [frontend-engineer] notes this as a known acceptable cost — the Undo path is best-effort; the user gets a duplicate, not a data-loss state, on the rare delete-then-fail-then-undo sequence.

**Live branch capture detail:** for the live path, the captured payload is `{ title, url, groupId }` from `MSG_GET_ITEM`. The `liveState.tabId` is NOT captured because the Undo does NOT close the live tab (the demote already left the tab open; the Undo creates a new bookmark for it).

**AC4 + AC5** cover this dispatch order; T3 + T4 + T5 in `tests/b100-delete-on-live.test.js` verify the order via `chrome-mock` message-log assertions.

---

## §49.4 Architecture Diagram (text)

### Path A — X-button click on a LIVE row → close tab (AC1)

```
user clicks .item-action-delete on row[data-live="true"]
   │
   ▼
document click delegator (sidepanel.js:3470)
   │   ─ matches [data-action="delete"]
   │   ─ row.dataset.live === 'true' → live branch
   │
   ▼
B-026 H-1 re-read: liveState = _cachedLiveStates[itemId]
   │   ─ if !liveState?.live OR liveState.tabId == null → silent no-op (broadcast race)
   │
   ▼
sendMessage(MSG_CLOSE_TABS, { tabIds: [liveState.tabId] })
   │   ─ fire-and-forget, .catch(() => showToast("Couldn't close tab — try again"))
   │   ─ NO toast on success
   │   ─ NO confirmation dialog
   │
   ▼
SW MSG_CLOSE_TABS handler → chrome.tabs.remove(tabId)
   │   ─ tabs.onRemoved fires → release claim (existing tab-events.js path)
   │   ─ broadcast(SCOPE.LIVE_STATE, 'tab/removed')
   │
   ▼
sidepanel: refetchAndPatchLiveState
   │   ─ row's data-live attribute flips to "false"
   │   ─ row remains in DOM with the bookmark intact
   │
   ▼
Visual result: tab closes; bookmark survives; row updates from live to non-live;
               no toast, no modal, no Undo (no bookmark was destroyed).
```

### Path B — X-button click on a NON-LIVE row → modal + delete (AC2, unchanged from today)

```
user clicks .item-action-delete on row[data-live="false"]
   │
   ▼
document click delegator (sidepanel.js:3470)
   │   ─ matches [data-action="delete"]
   │   ─ row.dataset.live !== 'true' → non-live branch
   │
   ▼
sendMessage(MSG_GET_ITEM, { id: itemId })
   │   ─ catch → showToast("Couldn't load bookmark — try again")
   │
   ▼
openConfirmDialog(item, () => sendMessage(MSG_DELETE_ITEM, { id: itemId }), { triggerEl })
   │   ─ user confirms → DELETE; cancel → no-op
   │
   ▼
SW MSG_DELETE_ITEM handler → deletes from tj:items
   │   ─ broadcast(SCOPE.ITEMS, MSG_DELETE_ITEM)
   │
   ▼
sidepanel: row removed from DOM; group bucket re-sorted.
```

### Path C — Context-menu "Delete bookmark" (LIVE) → toast+Undo (AC3, AC4, AC5)

```
user opens context menu on row[data-live="true"], clicks "Delete bookmark"
   │
   ▼
deleteBtn click handler (sidepanel.js: rebuilt block ~6140)
   │   ─ B-026 H-1 re-read: liveNow = !!_cachedLiveStates[itemId]?.live
   │   ─ liveNow === true → live-demote branch
   │
   ▼
sendMessage(MSG_GET_ITEM, { id: itemId })
   │   ─ catch → closeContextMenu(); showToast("Couldn't delete bookmark — try again"); ABORT
   │   ─ success → captured = { title, url, groupId } from item
   │
   ▼
closeContextMenu()
   │
   ▼
sendMessage(MSG_DEMOTE_ITEM, { itemId }).catch(() => showToast("Couldn't delete bookmark — try again"))
   │   ─ fire-and-forget; SW deletes bookmark + releases claim; tab remains open
   │
   ▼
showToast('Bookmark deleted', {
  undoLabel: 'Undo',
  onUndo: () => sendMessage(MSG_CREATE_ITEM, captured).catch(...)
})
   │   ─ inherits B-099 D-10 default 6 s window
   │
   ▼
[branch — user clicks Undo within 6 s]
   │
   ▼
sendMessage(MSG_CREATE_ITEM, { title, url, groupId })
   │   ─ SW mints NEW ULID, NEW createdAt, sortOrder = bucket size
   │   ─ broadcast(SCOPE.ITEMS, MSG_CREATE_ITEM)
   │
   ▼
sidepanel: bookmark reappears in same group at bucket-end;
           tab still open; reevaluator may re-claim on next URL match.

[branch — toast auto-dismisses without Undo]
   │
   ▼
Toast hides at 6 s; bookmark stays deleted; tab remains open in Open Tabs.
```

### Path D — Context-menu "Delete bookmark" (NON-LIVE) → toast+Undo (AC3, AC4, AC5)

```
Same as Path C, except:
   ─ B-026 H-1 re-read returns liveNow = false → non-live branch
   ─ Step 4 dispatches MSG_DELETE_ITEM (not MSG_DEMOTE_ITEM)
   ─ No claim was held; no claim to release; no tab to consider
   ─ Undo path identical: MSG_CREATE_ITEM { title, url, groupId } restores the bookmark
```

### Path E — Delete key on focused row (AC7) — D-5 keyboard delegation

```
user focuses .item-row (Tab navigation), presses Delete (or Backspace)
   │
   ▼
document keydown handler (sidepanel.js:3568)
   │   ─ matches new branch: e.key === 'Delete' || e.key === 'Backspace'
   │   ─ guard: skip if active element is INPUT/TEXTAREA/contenteditable
   │   ─ row = e.target.closest('.item-row') — null if focus is elsewhere → return
   │   ─ e.preventDefault()
   │
   ▼
[delegate to the same logic as Path A or Path B based on row.dataset.live]
   ─ live → MSG_CLOSE_TABS (no toast)
   ─ non-live → MSG_GET_ITEM + openConfirmDialog + MSG_DELETE_ITEM (modal)
```

---

## §49.5 R2 Correctness Checklist (C-1 through C-12)

| # | Check | Verdict | Notes |
|---|-------|---------|-------|
| C-1 | Storage schema versioned | **N/A** | Zero schema changes. `tj:items`, `tj:groups`, `tj:tabClaims`, `tj:drift` shapes all unchanged. No new pref keys, no new validator allow-list entries — therefore no SW module-cache stale-state risk per the S31 B-094 stale-SW guidance. |
| C-2 | Message contracts typed | **PASS — with documented contract correction** | All five message types reused (`MSG_CLOSE_TABS`, `MSG_DEMOTE_ITEM`, `MSG_DELETE_ITEM`, `MSG_GET_ITEM`, `MSG_CREATE_ITEM`) with their existing payload shapes. Critical R2 finding: `MSG_CREATE_ITEM` accepts ONLY `{ title: string, url: string, groupId: string\|null }` — `id`, `sortOrder`, `createdAt`, `updatedAt` are NOT caller-controllable (verified by reading `validateNewItem` at `background/storage/items.js:28-51` and `createItem` at `:165-209`). R1 AC5 wording's "captured Item payload" must be read as "captured `{ title, url, groupId }` subset" — D-2 above documents the user-visible consequences (new ULID, bucket-end sortOrder). R3 [frontend-engineer] MUST capture only those three fields; T5 asserts post-Undo bookmark by title+URL+groupId match (NOT by ULID). |
| C-3 | SW cold-start safe | **PASS** | All new logic is in the sidepanel UI bundle. SW handlers (`MSG_CLOSE_TABS`, `MSG_DEMOTE_ITEM`, `MSG_DELETE_ITEM`, `MSG_GET_ITEM`, `MSG_CREATE_ITEM`) are pre-existing and cold-start-safe per their existing tests. The sidepanel does NOT cache any state across SW restarts beyond the existing `_cachedLiveStates`/`_itemById` patterns; no new in-memory state introduced. |
| C-4 | ID stability | **PASS — with documented soft deviation on Undo** | All non-Undo paths preserve item ULIDs. The Undo path (D-2) deliberately MINTS A NEW ULID via `MSG_CREATE_ITEM` because the original was destroyed by `MSG_DEMOTE_ITEM`/`MSG_DELETE_ITEM`. This is a one-shot Undo-window behavior; no live tab claim depends on the ULID across the delete→undo cycle (the claim is released in step 1 of the demote, regardless of ULID). The user-facing identity of the restored bookmark is title+URL+groupId — invariant across the Undo. ID-stability invariant for ongoing operations (rename, move, drag, drift, reconcile) is unaffected. R6 [technical-writer] documents the new-ULID behavior in the user manual. |
| C-5 | Manifest file references resolvable | **N/A** | Zero `manifest.json` changes. No new `default_path`, `default_popup`, `chrome_url_overrides`, `web_accessible_resources` entries. |
| C-6 | Permission minimization | **N/A** | Zero new permissions. `manifest.json` `permissions` array unchanged: `["tabs", "tabGroups", "storage", "sidePanel", "search"]`. The `MSG_CLOSE_TABS` handler uses `chrome.tabs.remove` which is already covered by the pre-existing `tabs` permission. |
| C-7 | Allow-list direction | **N/A** | No new sanitizer, validator, or export surface. The Undo payload `{ title, url, groupId }` is validated by the existing `validateNewItem` allow-list (only `title`, `url`, `groupId` are accepted; everything else is destructured-away, including any stale `id`/`createdAt` the UI might inadvertently pass). The validator is **already an allow-list** by construction (destructuring + per-field checks); no deny-list path introduced. |
| C-8 | SW-context feasibility | **N/A** | UI-only changes plus reuse of existing SW handlers. All affected APIs (`document.addEventListener`, `closest`, `dataset`, `setTimeout`) are document-context APIs. SW handlers (`chrome.tabs.remove`, `chrome.storage.local.*`) are already verified SW-context-safe by their existing usage. |
| C-9 | Empty-state design | **PASS — 4 paths enumerated per R1 spec** | (a) **Undo clicked after toast auto-dismisses (>6 s):** the `toast-undo` button is inside the now-`hidden` toast; click-target is detached from rendering; second click is a no-op. The `_toastUndoHandler` module ref was already cleared by the auto-dismiss timer (sidepanel.js:1675-1679). No-op confirmed. (b) **Undo clicked twice rapidly:** the click listener at `sidepanel.js:1689-1706` snapshots the handler in a local `const handler` BEFORE clearing `_toastUndoHandler` to null; a second click within the same event loop tick finds `_toastUndoHandler === null` and the handler-call is gated by `typeof handler === 'function'` — the second click is a no-op. Re-entrancy-safe by B-099 §46.10 D-10 design. (c) **Item state mutated between delete + Undo (e.g., another window renames the bookmark via Edit dialog during the undo window):** R2 assesses this as impossible-by-construction within B-100's scope — the bookmark is DELETED in step 1 of the demote/delete; no other window can edit a non-existent bookmark; the captured snapshot is the source of truth for the Undo. If the user re-creates the same URL manually via the Add Bookmark dialog before clicking Undo, then clicks Undo: a duplicate is created (existing B-059 duplicate-URL-with-soft-warn machinery does NOT block `MSG_CREATE_ITEM` — see §29). User-visible cost; not a data integrity issue. R3 [frontend-engineer] does NOT add a duplicate-URL guard inside the Undo lambda — Undo is a best-effort restore; B-059's soft-warn is the established UX for duplicates. (d) **Sidepanel closed before Undo clicked:** toast DOM is destroyed with the sidepanel; `_toastUndoHandler` and `_toastTimer` are GC'd with the document. Bookmark stays deleted permanently. Documented user-visible cost in R6 release notes. |
| C-10 | Off-screen rect feasibility | **N/A** | No drag-image, no `setDragImage`, no `canvas.toDataURL`, no off-screen DOM positioning. All UI elements are in-flow within the sidepanel. |
| C-11 | Popup-lifecycle message ordering | **N/A** | All B-100 logic runs in the sidepanel context, NOT in any popup. The sidepanel does not tear down on focus changes; standard `await sendMessage(...)` patterns are safe. The fire-and-forget `.catch(...)` pattern for the delete dispatches (D-6) is a UX/reliability choice (don't block on the SW round-trip), not a popup-lifecycle requirement. |
| C-12 | Manifest declaration runtime-mutability | **N/A** | Zero `manifest.json` edits. |

**Summary: 1 PASS-with-contract-correction (C-2), 1 PASS (C-3), 1 PASS-with-documented-soft-deviation (C-4), 1 PASS-with-enumeration (C-9), 8 N/A.**

---

## §49.6 Performance Plan

| Path | Budget | Measurement | Rationale |
|------|--------|-------------|-----------|
| X-button live click → `MSG_CLOSE_TABS` round-trip | < 50 ms P95 (matches existing context-menu "Close tab" — sidepanel.js:6107-6127) | R5 unit test in `tests/b100-delete-on-live.test.js` T1 measures `chrome-mock` message-log latency end-to-end | Same SW handler, same payload shape as the existing context-menu Close tab. Strict no-regression. |
| X-button non-live click → modal → `MSG_DELETE_ITEM` | < 50 ms P95 for the modal open + < 50 ms for the delete dispatch (matches today's behavior — AC2 unchanged) | Existing `tests/b026-context-menu.test.js` modal-open assertions provide the regression baseline; T2 in the new `b100` suite re-verifies | Zero code change on this path. |
| Context-menu "Delete bookmark" → `MSG_GET_ITEM` snapshot → dispatch → toast | < 100 ms P95 for the full sequence (snapshot + dispatch + toast render) | T3, T4, T5 in `tests/b100-delete-on-live.test.js` measure each step | The `MSG_GET_ITEM` await is the slowest step (~10-30 ms typical SW round-trip). Toast render is sync DOM (~1 ms). Total well within the §9 perf standard. |
| Undo click → `MSG_CREATE_ITEM` → bookmark re-renders | < 100 ms P95 for re-render after the broadcast | T5 measures via `chrome-mock` broadcast assertion + DOM presence check | Standard create-item path; same as the user clicking the Add Bookmark button. |
| Delete-key handler dispatch latency | Indistinguishable from click latency (single document keydown listener) | T6 (if added) | One additional branch in an already-existing handler; cost is one `e.key` comparison + one `document.activeElement?.tagName` check. Negligible. |
| Sidepanel first-paint impact | Zero — no first-paint code touched | N/A | All R3 changes are in event-handler bodies and the keydown branch; no buildItemRow / no first-paint hot path touched. |

**Net performance effect: equal-to-current on all paths, plus one new < 100 ms path (toast+Undo) that did not exist before. No regressions.**

---

## §49.7 Accessibility Plan

| Surface | Treatment | Rationale |
|---------|-----------|-----------|
| X-button (`.item-action-delete`) | `aria-label="Delete bookmark"` (existing); `title="Delete"` (existing). **R3 keeps the existing labels** — the button's behavior changes (close-tab on live), but the label "Delete" is still correct from the user's perspective ("delete this row from the live list"). Future copy-tweak item could rename to "Close tab" on live state, but that requires reactive label-flip plumbing per row state — out of scope for B-100. | The label is already-accurate-enough for both behaviors (close-tab on live, delete-bookmark on non-live both result in "the row goes away"). UAT-1 verifies AT users find the label clear; if FAIL, Out-of-scope follow-up filed. |
| Context-menu "Delete bookmark" entry | `<button class="context-menu-item context-menu-item--destructive">` with `role="menuitem"` (existing) and `tabindex="-1"` (existing). Label changes from "Delete" to "Delete bookmark" — slightly more specific, no AT contract change. | The destructive class drives the red-text visual treatment (existing CSS); AT users navigate the menu via arrow keys and hear "Delete bookmark" explicitly — better than the previous ambiguous "Delete" (which could mean "delete row" or "delete bookmark"). |
| Toast + Undo | `<div role="alert" aria-live="assertive">` (existing — sidepanel.html:219-223 from B-099). Toast text "Bookmark deleted" is announced; Undo button is keyboard-focusable via Tab (existing `<button>` element). Auto-dismiss at 6 s — AT users who need longer dwell time would be poorly served by this, but the same 6 s window applies to the existing B-099 "Snap to this tab" toast — no new a11y concern, but worth flagging for future icebox B-086. | Reuses B-099 D-10 a11y treatment verbatim. |
| Delete key handler | The new `keydown` branch only fires when active element is NOT in an input context — preserves user's expected Delete-key behavior in text fields. The branch fires on `e.target.closest('.item-row')` so AT users who navigated to the row via Tab are correctly targeted. | Mirrors the existing `Ctrl+A` input-context guard pattern. |
| Confirm dialog (non-live X) | Unchanged — existing `openConfirmDialog` is fully a11y-compliant (focus trap, Escape, ARIA roles per B-070). | No change. |

**Net accessibility effect: minor positive (more specific menu label "Delete bookmark"); no regressions on toast / dialog / focus-management surfaces. Keyboard-first contract preserved end-to-end.**

---

## §49.8 Rollback Plan

**Single-commit revert of the S35 B-100 merge restores the pre-B-100 destructive default.** No storage migration, no manifest permission change, no message contract change — purely a UI behavior revert.

```bash
# Identify the merge SHA on release/v2:
git log --oneline release/v2 | grep "B-100"

# Single-commit revert:
git revert <merge-sha>
git push origin release/v2

# Sidepanel surfaces refresh on next reload — no data migration needed.
```

| Aspect | Rollback impact |
|--------|-----------------|
| `tj:items` partition | No-op. Item shape was unchanged by B-100. Any bookmarks deleted (and not Undo'd) during the B-100 deployment window stay deleted; rollback does NOT restore them (no audit trail). |
| `tj:tabClaims` partition | No-op. Claim release semantics for `MSG_DEMOTE_ITEM` were unchanged; only the trigger (X-button on live) was inverted. After rollback, the X-button on live reverts to the destructive demote (the original bug). |
| Manifest permissions | No-op. Untouched by B-100. |
| User-facing treatment | X-button on live reverts to silent demote (bookmark deleted, tab open) — the original bug. Users who had grown accustomed to "X means close-tab" will lose that affordance, and any subsequent X-on-live click destroys a bookmark with no Undo. **SEV severity if rollback needed: SEV3 (UX regression to a known bug; not a data loss issue beyond what already existed pre-B-100).** |

**No partial-rollback scenarios.** The three handler changes (X-button click, context-menu Delete, document keydown) are tightly coupled — partial rollback would leave the UI in an inconsistent state (e.g., context-menu "Delete bookmark" with toast+Undo but X-button reverted to silent demote = two divergent destructive UX patterns for the same affordance class). All-or-nothing revert is the only supported path.

---

## §49.9 Open Questions

**None.** R1 was fully locked by [product-manager] on 2026-04-26 (Q1-Q4 + 8 ACs + Destructive-action confirmation subsection + Selector-audit subsection). R2 resolved both R2-Qs:

- **R2-Q1 (two delete paths on non-live items): KEEP BOTH** (Option A) — rejecting the initial Option B recommendation after closer reading of R1's explicit two-path lock. Rationale documented in D-1 (UX defensibility: X-button = affordance-adjacent quick-delete with modal guard; context menu = deliberation-arrived-at delete with toast+Undo guard).
- **R2-Q2 (keyboard Delete key handler): EXTEND EXISTING DOCUMENT KEYDOWN DELEGATION** (Option A) — verified by `grep` that no existing `Delete` key branch exists on `.item-row` and that the document-level handler at `sidepanel.js:3568-3608` is the established host for global keyboard shortcuts. D-5 documents the implementation.

R2 also surfaced a critical R1 wording correction documented in D-2 (`MSG_CREATE_ITEM` accepts only `{ title, url, groupId }`; AC5's "captured Item payload" should be read as that subset, not the full Item shape including `id` + `sortOrder`). R3 [frontend-engineer] implements the corrected contract; [test-engineer] T5 asserts by title+URL+groupId match.

R3 has zero outstanding architectural decisions.

---

## §49.10 As Built (R6)

**Closed:** 2026-04-25 (R6 doc close; UAT execution pending pre-sprint-close human walk-through) · **Release:** v1.29.0 (planned) · **Branch:** `feature/sprint-35-bug-fixes`

### Files actually changed vs. expected

All R2-expected files match what shipped, plus three R3-fix scope expansions surfaced by R4 HIGH findings (helper extraction, Undo recovery, per-theme destructive token).

| File | Expected (R2 §49.2 / §49.3 / SPRINT.md) | Actual (R6) | Notes |
|------|------------------------------------------|-------------|-------|
| `sidepanel/sidepanel.js` | (a) X-button live branch rewritten to `MSG_CLOSE_TABS` w/ B-026 H-1 re-read (AC1); (b) X-button non-live modal path preserved (AC2); (c) context-menu "Delete bookmark" rename + unified toast+Undo on both live and non-live branches (AC3-5); (d) new `Delete`/`Backspace` keydown branch on document handler with input-context guard (AC7) | ✅ done — plus **R3-fix `_dispatchRowDelete(row, itemId, triggerEl)` helper** at line ~3456 | All 4 R2 implementation steps executed. **Δ vs. R2:** R3 first shipped duplicated dispatch logic across X-button click and keydown branches; R4 H-1 (code-reviewer) flagged the DRY violation; R3-fix extracted `_dispatchRowDelete` and both call sites delegate to it. Helper extraction was NOT in R2 D-3; emerged from R4. T10 in `tests/b100-delete-on-live.test.js` is the regression guard pinning `_dispatchRowDelete` defined exactly once + 2 call sites + body contains exactly one `MSG_CLOSE_TABS` reference. Net source LOC: ~+70 (R3) + ~+50/-40 (R3-fix) = ~+80 net. |
| `shared/themes.css` | No change | **Δ vs. R2** — **+30 LOC across all 14 theme blocks** (R3-fix) | R3-fix added `--color-destructive` + `--bg-destructive-hover` per-theme tokens to address R4 H-3 (qa-reviewer) — `.context-menu-item--destructive` red `#dc2626` failed WCAG AA on dark themes (~3.1:1). Light themes use `#dc2626` + `#fef2f2`; dark themes use `#f87171` + `#3d2828`; **nord** uses brighter `#fca5a5` + `#4c3c46` because nord's lighter `--bg-primary` fails AA at `#f87171`. WCAG AA verified across the 4 dark themes spot-checked: one-dark 5.13:1, dracula 5.18:1, github-dark 6.88:1, tokyo-night 6.30:1 — all ≥ 4.5:1. Token introduction was NOT in R2; emerged from R4 H-3. |
| `sidepanel/sidepanel.css` | No change | **Δ vs. R2** — ~+8/-2 LOC (R3-fix) | `.context-menu-item--destructive` swaps the hardcoded `#dc2626` / `#fef2f2` for `var(--color-destructive)` / `var(--bg-destructive-hover)` so the per-theme tokens flow through. |
| `background/storage/items.js` | No change | ✅ no change | `createItem` contract verified pre-R3 (D-2 storage correction); R3 calls it with the existing `{ title, url, groupId }` shape only. |
| `background/messages/storage-handlers.js` | No change | ✅ no change | All five message handlers reused; zero handler edits. |
| `shared/messages.js` | No change | ✅ no change | All five message symbols pre-existing. Zero new message types. |
| `manifest.json` | No change | ✅ no change | Zero new permissions; zero new declarations. |
| `tests/b100-delete-on-live.test.js` | NEW, ≥ 6 tests per AC8 | ✅ done — **10 named tests + sub-cases = 16 net new** | T1 + T1b (AC1 live X-button + B-026 H-1 race); T2 (AC2 modal flow fragment); T3 + T3b (AC3+AC4 live & non-live); T4 (AC5 / D-2 storage-contract correction); T5 + T5b/c/d (AC7 Delete + Backspace + INPUT/TEXTAREA/SELECT/contenteditable guard); T6 + T6b (R4 H-2 ERR_NOT_FOUND fallback + non-ERR_NOT_FOUND failure path); T7 (R4 M-2 deferred duplicate-on-failed-delete regression guard); T8 (R4 M-3 deferred programmatic-focus divergence regression guard); T9 (AC6 bulk-removal regression guard); T10 (R4 H-1 helper-extraction regression). Final count exceeds AC8 minimum (≥ 6) by ~167%. |
| `docs/UAT_B-100.md` | NEW, ≥ 5 cases per AC8 | ✅ done — **7 cases** | UAT-1 (AC1 B); UAT-2 (AC2 B); UAT-3 (AC3+AC4+AC5 B); UAT-3c (toast auto-dismiss H); UAT-4 (AC7 incl. input-context guard H); UAT-5 (R4 H-2 cross-window deleted-group fallback H); UAT-6 (R4 H-3 4-theme red-contrast spot-check incl. nord H); UAT-7 (filter-input keyboard guard M). Final count exceeds AC8 minimum (≥ 5) by 40%. |
| `docs/design/49-b-100-delete-on-live.md` | NEW R2 chapter; R6 fills As-Built | ✅ this file | R2 written 2026-04-25; R6 §49.10 As Built filled 2026-04-25. |

### Test counts (final)

- **Pre-S35 baseline (post-S34 v1.28.0 close):** 1,427 tests passing on `release/v2`.
- **Post-B-100 R5 contribution:** **+16 net new tests** from `tests/b100-delete-on-live.test.js` (10 named tests + 6 sub-cases per the structure above).
- **Cumulative final after all 4 Sprint 35 R5 contributions** (B-100 +16, B-102 +8, B-103 +6, B-105 +7 — minus rounding for shared lifts): **~1,464 tests passing** on `feature/sprint-35-bug-fixes` (measured by [test-engineer] at end of B-100 R5).
- **Zero regressions** in the pre-existing suite. Full suite green at 1,464.
- **R5 baseline-snapshot reconciliation note:** the R3-fix block in `SPRINT.md` recorded a "1,427" baseline which was a stale snapshot taken before B-102/B-103/B-105 R5 file contributions had landed in the working tree — the [test-engineer] R5 walk-through measured 1,448 immediately before adding `tests/b100-delete-on-live.test.js` and confirmed +16 net (1,448 → 1,464). The "+16 net new" figure is the canonical B-100 contribution.

### UAT results summary

UAT execution is a **human task** (pending sprint-close walk-through, mirroring §46.10 / §47.10 / §48.10 pattern). [test-engineer] authored the 7-case plan in `docs/UAT_B-100.md`; results are recorded in this section after walk-through.

| Case | Priority | Result | Notes |
|------|----------|--------|-------|
| UAT-1: X-button on live row closes the tab and preserves the bookmark (AC1) | B | ✅ AUTHORED — pending human walk-through during sprint close | |
| UAT-2: X-button on non-live row opens modal + deletes on confirm (AC2 regression) | B | ✅ AUTHORED — pending human walk-through during sprint close | |
| UAT-3: Context-menu "Delete bookmark" on both live & non-live shows toast+Undo; Undo restores (AC3+AC4+AC5) | B | ✅ AUTHORED — pending human walk-through during sprint close | |
| UAT-3c: Toast auto-dismisses at 6 s; bookmark stays deleted; Undo button no-op after dismiss | H | ✅ AUTHORED — pending human walk-through during sprint close | C-9 empty-state coverage |
| UAT-4: Delete + Backspace keydown on focused row mirrors X-button behavior; INPUT/TEXTAREA/SELECT/contenteditable guard (AC7) | H | ✅ AUTHORED — pending human walk-through during sprint close | D-5 keydown delegation |
| UAT-5: Cross-window race — group deleted in window B between B-100 delete and Undo in window A → fallback to Ungrouped + recovery toast (R4 H-2) | H | ✅ AUTHORED — pending human walk-through during sprint close | Undo group-deleted recovery path |
| UAT-6: Destructive-red contrast spot-check across 4 dark themes incl. nord (R4 H-3) | H | ✅ AUTHORED — pending human walk-through during sprint close | Nord uses `#fca5a5`; other dark themes use `#f87171` |
| UAT-7: Filter-input keyboard guard — Delete in `.sidepanel-filter` does NOT delete the focused row in the background | M | ✅ AUTHORED — pending human walk-through during sprint close | D-5 input-context guard regression |

**Pre-Gate-3 step:** human walks UAT-1..UAT-7 against the unpacked extension on `feature/sprint-35-bug-fixes` and updates this table with PASS/FAIL/WARN per case.

### Hardening discovered during R4 / R3-fix

R4 (3 reviewers parallel, 2026-04-25) surfaced **0 CRITICAL / 3 HIGH / 5 MEDIUM / 5 LOW** for B-100. All 3 HIGHs were closed in R3-fix; MEDIUMs split between R5 coverage and follow-up backlog filing.

**HIGH (all closed in R3-fix, [frontend-engineer]):**

- **H-1 (code-reviewer, `sidepanel/sidepanel.js:3484-3512` vs `3612-3641`) — DRY violation:** delete-dispatch logic duplicated near-verbatim across X-button click handler and keydown Delete branch. Future AC1/AC2 changes would require parallel edits with no compile-time enforcement. **Fix applied in R3-fix:** extracted `_dispatchRowDelete(row, itemId, triggerEl)` helper at line ~3456 hosting the live (`MSG_CLOSE_TABS`) / non-live (`MSG_GET_ITEM` + `openConfirmDialog` + `MSG_DELETE_ITEM`) branching. X-button click handler (now ~3531) and keydown Delete branch (now ~3638) both delegate to it. T10 is the regression guard.
- **H-2 (qa-reviewer, `sidepanel/sidepanel.js:6222-6250` Undo lambda) — Undo on item whose original group was deleted → silent failure:** `MSG_CREATE_ITEM { groupId: <gone> }` triggers `assertGroupExists` ERR_NOT_FOUND in SW; generic error toast shows but bookmark is permanently lost. C-9 enumeration in §49.5 missed this cross-window deletion race. **Fix applied in R3-fix:** Undo lambda gains an `ERR_NOT_FOUND` catch on the first dispatch and retries with `groupId: null` (Ungrouped) + recovery toast: "Bookmark restored to Ungrouped (original group was deleted)." T6 + T6b are the regression guards (ERR_NOT_FOUND fallback + non-ERR_NOT_FOUND failure path); UAT-5 covers manual repro.
- **H-3 (qa-reviewer, `sidepanel/sidepanel.css:1295-1302`) — destructive-red contrast failure:** `.context-menu-item--destructive` hardcoded `#dc2626` failed WCAG AA on dark themes (~3.1:1 on Tokyo Night `#1a1b26`, GitHub Dark `#0d1117`). B-100 was the first sprint to ship NEW usage of this destructive class (the renamed "Delete bookmark" entry), elevating the pre-existing palette gap to a blocking issue. **Fix applied in R3-fix:** introduced `--color-destructive` + `--bg-destructive-hover` per-theme tokens in `shared/themes.css` (light themes use `#dc2626` + `#fef2f2`; dark themes use `#f87171` + `#3d2828`); **nord** uses brighter `#fca5a5` + `#4c3c46` because nord's lighter `--bg-primary` fails AA at `#f87171`. WCAG AA verified across 4 dark themes (one-dark 5.13, dracula 5.18, github-dark 6.88, tokyo-night 6.30 — all ≥ 4.5:1). `sidepanel.css` rewired to consume the tokens. UAT-6 is the manual spot-check across the 4 themes.

**MEDIUM (5 — split between R3-fix inline, R5 coverage, and follow-up backlog):**

- **M-1 (code-reviewer, `sidepanel/sidepanel.js:6222-6226`) — `closeContextMenu()` order:** fired unconditionally before null-item guard, deviating from R2 D-6 step ordering. **Fix applied inline in R3-fix:** `closeContextMenu()` moved AFTER the null-item guard.
- **M-2 (qa-reviewer, `sidepanel/sidepanel.js:6222-6250`) — delete-then-fail-then-Undo creates duplicate bookmark:** acknowledged R2 D-6 tradeoff but no test pinning the behavior. **Resolution: COVERED** by R5 T7 (regression-guard test asserts the duplicate-on-failed-delete behavior is the expected current state, so any future "fix" that breaks the contract surfaces in CI).
- **M-3 (qa-reviewer, `sidepanel/sidepanel.js:3602-3645`) — Delete keydown handler `e.target.closest()` vs `document.activeElement` divergence:** if `document.activeElement` (used for input-context guard) and `e.target` diverge (programmatic focus), guard could pass while target resolves to an unintended row. **Resolution: COVERED** by R5 T8 (regression-guard test asserts current behavior correctly defends against the divergence; M-3 was deferred as a TEST not a source-fix).
- **M-4 (qa-reviewer, `sidepanel/sidepanel.js:6212` X-button aria-label) — live items have aria-label "Delete bookmark" but action is now close-tab:** WCAG 2.1 SC 4.1.2 name-role-value mismatch. §49.7 acknowledged the discrepancy but explicitly deferred reactive label-flip plumbing as out-of-scope for B-100. **Resolution: FILED AS B-107 follow-up** (see Follow-up backlog items below).
- **M-5 (code-reviewer, `sidepanel/sidepanel.js:3614`) — comment block "INPUT/TEXTAREA/SELECT/contenteditable" mismatch with R2 D-5 pseudocode "INPUT/TEXTAREA/contenteditable":** implementation is correctly stricter (`SELECT` included). **Resolution: ADDRESSED in this As-Built (Deviations #5 below).**

**LOW (5 — deferred):**

- **L-1 (code-reviewer)** — B-100 toast omits explicit `durationMs` (correct per R2 D-3 — inherits B-099 6 s default); B-099 toast at line 6112 passes `durationMs: 6000` explicitly. Pre-existing inconsistency between call sites; cosmetic. Defer.
- **L-2 (code-reviewer)** — `groupId: item.groupId ?? null` `?? null` fallback technically redundant since `validateNewItem` accepts `undefined`. Defense-in-depth retained; no action.
- **L-3 (qa-reviewer)** — Context menu stays open ~10-30 ms before toast appears (waiting for `MSG_GET_ITEM`); optimistic close pattern could improve perceived latency. Defer to a future polish item; not user-blocking.
- **L-4 (qa-reviewer)** — Inline comment mismatch: `closeContextMenu()` already fired before null check (rendered moot by M-1 fix). Comment cleaned up incidentally during M-1 fix.
- **L-5 (security-reviewer)** — Untracked `junkie-bookmarks.html` user bookmark export at repo root (PII per CLAUDE.md privacy rules). Not gitignored — `git add .` could accidentally commit it. **Resolution: out-of-scope for B-100**; flagged for separate hygiene action (add to `.gitignore` outside this sprint item; no functional change).

### Deviations from R2 plan

1. **R2 D-1 (R2-Q1) explicitly KEPT both delete paths** — the X-button modal path on non-live items (AC2) and the context-menu toast+Undo path on both live and non-live items (AC3-5) coexist intentionally. R2's narrative initially recommended "Option B (unify to toast+Undo only)" but **REVERSED to Option A** on closer reading of R1's explicit two-path lock. The defensible UX framing: X-button = affordance-adjacent quick-delete with modal guard; context menu = deliberation-arrived-at delete with toast+Undo guard.
2. **R2 D-2 storage contract correction** — R1 AC5 wording's "captured Item payload" originally implied `id` + `sortOrder` were caller-controllable. R2 verified by reading `background/storage/items.js:165-209` that `MSG_CREATE_ITEM` accepts ONLY `{ title, url, groupId }` — `id`, `sortOrder`, `createdAt`, `updatedAt` are NOT caller-controllable. R3 [frontend-engineer] implemented the corrected contract: restored bookmark gets a NEW ULID, NEW createdAt, and bucket-end sortOrder. T4 asserts post-Undo bookmark by title+URL+groupId match (NOT by ULID).
3. **Test count exceeds AC8 minimum (≥ 6) by ~167%** — landed 16 net new tests (10 named + 6 sub-cases) covering AC1-AC7 plus the R4 HIGH/MEDIUM regression-guard surfaces (T6/T6b for H-2 fallback; T7 for M-2 deferred behavior; T8 for M-3 deferred behavior; T9 for AC6 bulk regression; T10 for H-1 helper-extraction shape).
4. **UAT count exceeds AC8 minimum (≥ 5) by 40%** — landed 7 cases adding UAT-3c (toast auto-dismiss empty-state per C-9), UAT-5 (H-2 cross-window deleted-group fallback), UAT-6 (H-3 4-theme contrast spot-check incl. nord), and UAT-7 (input-context guard regression).
5. **Helper extraction `_dispatchRowDelete` was an R3-fix scope addition** — not in R2 D-3 planned implementation steps; emerged from R4 H-1 (code-reviewer DRY violation). Both X-button click and keydown Delete branches now delegate to a single helper. T10 is the regression guard.
6. **`--color-destructive` per-theme token introduction was an R3-fix scope expansion** — not in R2 (R2 §49.7 Accessibility Plan didn't anticipate the destructive-red contrast gap because B-100 reused a pre-existing CSS class); emerged from R4 H-3 (qa-reviewer). Token shipped across all 14 themes (15 entries counting the system dark-OS variant); WCAG AA verified across 4 dark themes spot-checked with nord requiring the brighter `#fca5a5` due to its lighter background.
7. **R5 keydown input-context guard list expanded vs R2 D-5 spec** — R2 D-5 pseudocode listed "INPUT/TEXTAREA/contenteditable"; R3 implementation correctly added `SELECT` (mirroring the existing `Ctrl+A` guard pattern). R4 M-5 flagged the comment-vs-pseudocode mismatch; the implementation is correctly stricter. Documented here for the historical record. Test sub-cases T5b/c/d cover Delete + Backspace + each guard tag.
8. **Live+Undo claim re-establishment behavior matches R2 D-4 prediction** — R5 T6 + T6b confirm the Undo path creates a new bookmark via `MSG_CREATE_ITEM` (new ULID) without explicitly re-claiming the still-open tab. Re-claim is delegated to the B-016 reevaluator on next URL match. UAT-5 will confirm the user-visible delay is < 1 s in the typical case (live tab still at original URL during the 6 s window).
9. **`MSG_BULK_DELETE_ITEMS` symbol clarification** — early R5 author hypothesis assumed bulk-removal symbol was `MSG_REMOVE_ITEMS`; actual symbol is `MSG_BULK_DELETE_ITEMS`. T9 (AC6 regression guard) was authored against the actual symbol. Documented for future-author reference.
10. **"Delete bookmark" string occurs 3× in source** — once as the textContent of the renamed context-menu entry (B-100 new); once in a B-100 R3 comment block; once as the pre-existing X-button aria-label at `sidepanel.js:2475` (R4 M-4 deferred as B-107 follow-up). T9 distinguishes these three call sites correctly.

### Follow-up backlog items filed from B-100 R4

- **B-107 — Live-X aria-label reactive flip (P3/XS/backlog).** Filed from R4 [qa-reviewer] MEDIUM M-4: the X button on a live bookmark row currently announces "Delete bookmark" but the action it now fires is **close tab**, creating a WCAG 2.1 SC 4.1.2 (Name, Role, Value) mismatch for assistive-tech users. R1 proposed direction: reactive `aria-label` flip via `data-live="true"`/`"false"` attribute selector OR JS-set `aria-label` on the row's X button on live-state change. Recommended path is JS-set (the aria-label is text content, not a CSS pseudo-element value, so `data-attr` selectors cannot drive it directly). Filed in `docs/BACKLOG.md` at R6.

### Rollback (if needed)

Single-commit revert of the S35 B-100 merge to `release/v2` restores the pre-B-100 destructive default (X-button on live silently demotes; context-menu "Delete" gates by modal on non-live and silently demotes on live; no Delete-key handler). No storage migration, no manifest permission change, no message contract change — purely a UI behavior revert plus the `--color-destructive` per-theme token cleanup.

**SEV severity:** SEV3 (UX regression to a known bug — the X-on-live destructive default — not a data-loss issue beyond what already existed pre-B-100). The `--color-destructive` token cleanup on rollback also reverts the destructive-red WCAG AA fix on the context-menu surface; impact contained to the destructive-class entry color only. See §49.8 for the full rollback procedure (`git revert <merge-sha>` + `git push origin release/v2`; sidepanel surfaces refresh on next reload, no data migration).

---
