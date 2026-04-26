# UAT Plan — B-100 Delete-on-Live UX Redesign

Sprint 35 · Full (M) · R5 UAT plan (authored by [test-engineer])

Related artefacts:

- `docs/BACKLOG.md` — B-100 row (8 acceptance criteria; R1 LOCKED 2026-04-26)
- `docs/design/49-b-100-delete-on-live.md` — R2 design chapter (D-1..D-6 + C-1..C-12)
- `docs/findings/sprint-35.md` — R4 findings (3 HIGH all fixed in R3-fix; 5 MEDIUM with 2 deferred to R5 [M-2 + M-3])
- `docs/SPRINT.md` — Sprint 35 active item
- `tests/b100-delete-on-live.test.js` — 16 automated tests (T1-T10 from AC8 + R4 H-2/M-2/M-3 + T1b/T3b/T5b-d/T6b sub-cases)
- `sidepanel/sidepanel.js` — `_dispatchRowDelete` helper (~L3456), document click delegator delete branch (~L3531), document keydown Delete branch (~L3638), context-menu "Delete bookmark" handler (~L6224)
- `shared/themes.css` — new `--color-destructive` + `--bg-destructive-hover` tokens across 14 theme blocks (R4 H-3 fix)
- `sidepanel/sidepanel.css` — `.context-menu-item--destructive` rule rewired to use the new tokens

## Preconditions

1. Extension loaded unpacked from `feature/sprint-35-bug-fixes` via `edge://extensions` → "Load unpacked" → repo root.
2. Edge (primary target browser). Re-run UAT-1 and UAT-3 in Chrome as a spot check (cross-browser parity for the central live X-button + context-menu flows).
3. Fixture: any non-empty bookmarks collection with at least one saved group containing 2+ bookmarks. At least one bookmark URL should be openable (e.g. `https://example.com`) so live/non-live state can be flipped during testing. UAT-5 requires the ability to delete a group from another window — set up a second sidepanel window via `edge://extensions` → side panel → Open in new window (or via the popup's "open sidepanel" affordance).
4. DevTools open on the sidepanel (right-click sidepanel → Inspect) so you can inspect the row's DOM, the toast element, and computed styles on the context-menu's "Delete bookmark" entry.
5. DevTools open on the background service worker (`edge://extensions` → Tab Junkie → "Inspect views: service worker") for storage inspection (`chrome.storage.local.get('tj:items')`, `chrome.storage.session.get('tj:tabClaims')`).

**C-1 stale-SW note (per CLAUDE.md B-094 extension):** B-100 introduces zero new pref keys, zero new manifest entries, and zero storage schema changes. The C-1 verdict in §49.5 is N/A — no extension toggle OFF/ON cycle is required after the update lands. Load the extension once and proceed.

**Out-of-scope (per AC's explicit exclusions and §49 out-of-scope block):** newtab item-row delete behavior; popup surfaces; bulk action bar "Remove" path (regression-only — UAT does not exercise its UX, only confirms it still works structurally per T9); MSG_CLOSE_TABS error handling beyond the existing inline `.catch` toast pattern; Undo persistence across sidepanel close/reopen (toast-window only); re-claiming a live tab after Undo on a live item (covered by B-016 reevaluator regression guards). If anomalies in those surfaces appear during UAT, file as new icebox rows — do NOT amend B-100.

**Automated-only (no UAT case required):** R4 M-3 programmatic-focus divergence (T8) — programmatic focus on a row without a corresponding `e.target` inside it cannot be triggered by manual interaction. R4 M-2 delete-then-fail-then-Undo (T7) — requires SW failure injection; covered by automated regression guard.

Legend: **B** = blocker (zero failures tolerated) · **H** = high (at most 1 fail, documented) · **M** = medium (non-blocking)

---

## Test Cases

### Live X-button → close tab (AC1)

#### UAT-1: Live X-button closes the tab AND preserves the bookmark — Priority: B

**Given** a saved bookmark "Example" with URL `https://example.com` AND I have opened it via Tab Junkie so it is claimed (sidepanel shows the green active border on the row, `data-live="true"` in DevTools).
**When** I click the **X** button on that row in the sidepanel.
**Then** within ~500 ms:
  - the live tab CLOSES from the browser tab strip,
  - the bookmark row REMAINS in the sidepanel under its group (no row removal, no toast, no modal dialog),
  - the row's green live border disappears (`data-live` flips to `"false"`),
  - the row reads as a normal saved (non-live) bookmark.
**Expected**: SW console `chrome.storage.local.get('tj:items')` STILL contains the item. `chrome.storage.session.get('tj:tabClaims')` no longer contains the claim entry. `chrome.tabs.query({})` no longer lists the closed tab. **AC1 contract**: the X-button on a live row dispatches `MSG_CLOSE_TABS`, NOT `MSG_DEMOTE_ITEM` — bookmark survives, tab dies. (Pre-B-100 behavior was the inverse — B-100 closes the destructive-default bug from S33 B-099 UAT-14 feedback.)

---

### Non-live X-button → modal-confirm delete (AC2 regression)

#### UAT-2: Non-live X-button still shows modal confirm and deletes on confirm — Priority: B

**Given** a saved bookmark "Static" with no open tab claim (the tab is closed; row reads `data-live="false"`).
**When** I click the **X** button on that row in the sidepanel.
**Then** the modal confirmation dialog opens with: "Delete bookmark? This action cannot be undone." (or current AC2 wording from `openConfirmDialog`), with focus moved to the **Cancel** button (per existing B-070 modal a11y contract).
**And** when I click **Delete** in the modal, the row is removed from the sidepanel and the bookmark is destroyed.
**And** when I click **Cancel** instead (UAT-2 should be repeated with a fresh bookmark to test cancel), the modal closes with no destructive action and focus returns to the X button (existing `triggerEl` restoration).
**Expected**: SW console `chrome.storage.local.get('tj:items')` shows the item removed only after **Delete** is clicked; clicking Cancel leaves it intact. AC2 path is unchanged from pre-B-100 — this is a regression guard for the modal flow per the explicit two-path coexistence locked in §49.3 D-1.

---

### Context-menu "Delete bookmark" + Undo (AC3, AC4, AC5)

#### UAT-3: Context-menu "Delete bookmark" + Undo restores within 6 s — Priority: B

**Given** a saved bookmark "Restorable" in a group "Reading" — the bookmark may be live or non-live (test both: run UAT-3a with live, UAT-3b with non-live).
**When** I right-click the row → click the red **Delete bookmark** entry at the bottom of the context menu.
**Then** within ~300 ms:
  - the row disappears from the sidepanel (or, if live, the bookmark is demoted — the row drops out of the saved list and the underlying tab remains open in the browser tab strip and may appear in Open Tabs),
  - a toast appears at the bottom of the sidepanel reading **"Bookmark deleted"** with a left-side **Undo** button before the dismiss × button.
**And** when I click the **Undo** button within ~6 s:
  - the toast hides immediately,
  - within ~500 ms the bookmark reappears in the same group (note: it lands at the bottom of the group, not at its original position, because `MSG_CREATE_ITEM` mints a bucket-end sortOrder per §49.3 D-2 — this is the documented user-visible cost of Undo).
**Expected**: SW console `chrome.storage.local.get('tj:items')` initially loses the item, then regains an item with the same `title`, `url`, and `groupId` but a NEW `id` (ULID), NEW `createdAt`, and `sortOrder` equal to the destination group's bucket size at restore time. For the live variant, `tj:tabClaims` loses the original claim entry; the B-016 reevaluator may re-establish a claim on the next `tabs.onUpdated` event if the tab is still at the matching URL — but T5 in `b099-drift-fix.test.js` and the §49.3 D-4 enumeration cover this; the UAT pass criterion is only that the bookmark itself reappears.

#### UAT-3c: Toast auto-dismisses after ~6 s without Undo — Priority: H

**Given** the toast from UAT-3 is visible.
**When** I do not click Undo and wait 6+ seconds.
**Then** the toast hides automatically. The bookmark stays deleted (no row reappears, SW storage shows no restore).
**Expected**: `tj:items` retains the post-delete state after the auto-dismiss; the action is permanent.

---

### Keyboard Delete + Backspace mirror X-button (AC7)

#### UAT-4: Delete and Backspace keys on a focused row mirror the X-button — Priority: H

**Given** a saved bookmark visible in the sidepanel. Focus the row with Tab navigation (the row should show the visible focus ring per existing keyboard-first contract).
**When (4a, live)** the row is live AND I press the **Delete** key.
**Then** the live tab closes; the bookmark survives (same outcome as UAT-1 X-button click).
**When (4b, live)** I repeat the test pressing **Backspace** instead of **Delete** (macOS Finder/Mail synonym per §49.3 D-5).
**Then** the same outcome — Backspace mirrors Delete.
**When (4c, non-live)** the row is non-live AND I press **Delete**.
**Then** the modal-confirm dialog opens (same outcome as UAT-2 X-button click on non-live). Click Cancel; no destructive action.
**When (4d, input-context guard)** I focus the filter input at the top of the sidepanel, type some text, then press **Delete** to delete a character.
**Then** ONLY the character at the caret is deleted from the input — NO bookmark row is deleted in the background. (Verifies the §49.3 D-5 input-context guard at sidepanel.js:3640.)
**Expected**: For 4a/4b/4c the dispatched messages match the X-button paths exactly (MSG_CLOSE_TABS for live; MSG_GET_ITEM + openConfirmDialog + MSG_DELETE_ITEM for non-live confirm). For 4d, no SW message is dispatched and no row is removed.

---

### R4 H-2 Undo recovery — deleted-group fallback to Ungrouped

#### UAT-5: Undo restores to Ungrouped when original group was deleted in another window — Priority: H

**(R4 H-2 specific — covers the §49.5 C-9 enumeration gap closed by R3-fix.)**

**Pre**:
1. Create a group "Temp Group" with one bookmark "Recoverable" inside it.
2. Open a second sidepanel window (the same Tab Junkie sidepanel hosted in a separate browser window — Edge supports this via the side panel's "Open in new window" affordance).

**Given** both sidepanel windows show the "Temp Group" with the "Recoverable" bookmark.
**When** in window A, I right-click "Recoverable" → click **Delete bookmark** (the toast with **Undo** appears at the bottom of window A's sidepanel).
**And** in window B (within ~3 s of the delete), I right-click the "Temp Group" header → click **Delete group** → confirm the modal.
**And** then in window A, I click the **Undo** button on the still-visible toast.
**Then** within ~500 ms:
  - the bookmark "Recoverable" reappears in the **Ungrouped** section (NOT in "Temp Group", which no longer exists),
  - a SECOND recovery toast appears at the bottom of window A reading **"Bookmark restored to Ungrouped (original group was deleted)"**.
**Expected**: SW console `chrome.storage.local.get('tj:items')` shows the restored item with `groupId: null`. `tj:groups` no longer contains "Temp Group". The §49.3 H-2 fallback is verified — the bookmark was NOT silently lost when the original group was destroyed mid-undo-window. (Pre-R3-fix, this scenario produced a generic "Couldn't restore — try again" toast and the bookmark stayed permanently deleted.)

---

### R4 H-3 destructive red contrast — multi-theme spot check

#### UAT-6: "Delete bookmark" entry has comfortable red contrast across light + dark themes — Priority: H

**(R4 H-3 specific — verifies the new `--color-destructive` + `--bg-destructive-hover` tokens applied across 14 theme blocks per the R3-fix.)**

**Given** the sidepanel is open with at least one saved bookmark and the theme picker is reachable (Settings or theme toggle).
**When** I right-click any bookmark row → observe the red **Delete bookmark** entry.
**And** I cycle through these four themes in turn, each time re-opening the context menu and observing the entry:
  1. **one-dark** — dark background; expect bright red text comfortably readable, hover background is a slightly redder tint.
  2. **dracula** — dark purple-tinted background; expect bright red text comfortably readable.
  3. **github-dark** — near-black background; expect bright red text comfortably readable.
  4. **nord** — bluish-dark background; expect a brighter red (`#fca5a5`) than the other dark themes' `#f87171` (per R3-fix flag — nord is the brightest dark-theme red because the nord palette desaturates `#f87171` below the comfortable contrast threshold).
**Then** for each of the four themes, the "Delete bookmark" text is visually unmistakable as a destructive action — readable from a normal viewing distance with no eye strain. The hover background flashes a subtle red-tinted highlight.
**Expected**: DevTools Elements panel on `.context-menu-item--destructive` shows `color: var(--color-destructive)` resolving to the per-theme red value. WCAG AA contrast (≥ 4.5:1 for normal text) is met against the resolved menu background. Manual eyeballing is the primary signal; if any theme produces a "muddy" or "low-contrast" red, FAIL with the theme name and HEX values from DevTools.

---

### Input-context guard regression — keyboard Delete in filter

#### UAT-7: Filter input Delete key only edits text, never deletes a row — Priority: M

**Given** the filter input at the top of the sidepanel is focused with a typed query (e.g. `exa`). At least one bookmark row matches the filter (the filter narrows the visible bookmarks). The matched row is NOT keyboard-focused — only the filter input is.
**When** I press the **Delete** key while the caret is in the filter input (mid-text — e.g. caret between `e` and `x`).
**Then** ONLY the character to the right of the caret is deleted from the input text (`exa` → `ea`). NO bookmark row is removed from the visible list. NO toast appears. NO modal opens.
**And** when I separately press **Backspace** in the same input.
**Then** ONLY the character to the left of the caret is deleted. Again, NO row removal, NO toast, NO modal.
**Expected**: The §49.3 D-5 + R3-fix input-context guard (`document.activeElement?.tagName === 'INPUT' || 'TEXTAREA' || 'SELECT' || isContentEditable`) early-returns for both keys. Visible behavior is indistinguishable from typing in any other text input. SW console `chrome.runtime.onMessage` log shows zero new dispatches. (The reactive aria-label on the X button — R4 M-4 deferred — is NOT in scope for this UAT case; that's a separate follow-up.)

---

## Pass criteria

- All B-priority cases (UAT-1, UAT-2, UAT-3) PASS.
- All H-priority cases (UAT-3c, UAT-4, UAT-5, UAT-6) PASS or have one documented FAIL with rationale.
- All M-priority cases (UAT-7) PASS or SKIP (with reason — e.g., filter input not present in current build).

A single FAIL on any B-priority case blocks the sprint close — route back to [frontend-engineer] for fix, do NOT mark B-100 done.

## Out of scope (per §49 out-of-scope block — do not test)

- Newtab item-row Delete behavior (separate surface; future item).
- Popup surfaces (no `.item-row` rendered).
- Bulk action bar "Remove" path (regression-only — covered by T9 automated guard).
- `MSG_CLOSE_TABS` error handling beyond the existing inline `.catch` toast pattern.
- Undo persistence across sidepanel close/reopen (toast-window only — sidepanel-context only).
- Re-claiming the live tab after Undo on live items (B-016 reevaluator handles this on next SW state refresh — see §49.3 D-4).
- Any storage `schemaVersion` bump (zero schema changes).
- Any new `manifest.json` permission (zero permission changes).
- Any new message type (uses existing `MSG_CLOSE_TABS`, `MSG_DEMOTE_ITEM`, `MSG_DELETE_ITEM`, `MSG_GET_ITEM`, `MSG_CREATE_ITEM` only).

If the user requests any of the above during UAT, file as a new icebox row, do NOT amend B-100.

## R4 deferred MEDIUMs — automated coverage only

- **M-2 (delete-then-fail-then-Undo creates duplicate)**: covered by `tests/b100-delete-on-live.test.js` T7 as a regression guard documenting the §49.3 D-6 known-acceptable-cost. No UAT case authored — requires SW failure injection that cannot be reproduced via manual interaction.
- **M-3 (programmatic-focus divergence in keydown)**: covered by `tests/b100-delete-on-live.test.js` T8 as a regression guard documenting the R3-fix decision to keep `e.target.closest('.item-row')` for row resolution while reading `document.activeElement?.tagName` for the input-context guard. No UAT case authored — programmatic focus without a corresponding e.target cannot be triggered through normal user interaction.
- **M-4 (X-button aria-label "Delete bookmark" stale on live rows)**: NOT in scope for B-100; tracked as a follow-up backlog item per R4 [qa-reviewer] for reactive aria-label flip (`aria-label="Close tab"` when `data-live="true"`, `aria-label="Delete bookmark"` otherwise). UAT-1 should mark a WARN in observations if a screen reader user finds the label confusing during AT testing — but no PASS/FAIL bearing on B-100 close.
