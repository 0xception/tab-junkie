# UAT — B-059 Allow Duplicate URLs with Soft-Warn UI

Sprint 15 · Full tier (M) · Round 5 UAT plan

Related artefacts:
- `docs/SOLUTION_DESIGN.md §29` (design)
- `docs/SPRINT_FINDINGS.md` Sprint 15 — B-059 (R4 findings)
- `tests/b059-duplicate-warn.test.js` (T-1..T-6, T-8, T-10)
- `tests/promote-tab.test.js` (T-7 real-dispatcher regression + AC4 flip)

## Setup

1. Load the unpacked extension from the repo root.
   - Chrome: `chrome://extensions` → Developer Mode on → "Load unpacked" → select repo root.
   - Edge: `edge://extensions` → Developer Mode on → "Load unpacked" → select repo root.
2. Open the Tab Junkie side panel.
3. Pre-create state the test cases below rely on:
   - Create two groups, e.g. `Work` and `Reading`.
   - Save one item to `Work` with URL `https://example.com` (title: `Example Site`).
   - Save one item to the top level (no group) with URL `https://docs.example.com` (title: `Docs`).
   - Open at least six non-Tab-Junkie tabs you are willing to re-promote, including:
     - One tab at `https://example.com` (duplicate of the saved Work item).
     - One tab at `https://docs.example.com#section-a` (fragment-only differs from saved `Docs`).
     - One tab at `https://docs.example.com#section-b`.
     - Three tabs at unique URLs you have not saved.

Legend: PASS = behaviour matches expected · FAIL = deviation from expected · WARN = behaves correctly but surfaced a concern · SKIP = unable to execute.

## Test Cases

### UAT-1: Single-tab save — no duplicate (happy path)
Covers AC1, T-1.

**Steps**:
1. In the Open Tabs section of the sidepanel, right-click a row whose URL is NOT already saved.
2. Choose "Save to group" → select `Work`.

**Expected**:
- No confirm dialog appears.
- Item is immediately saved to `Work`.
- Toast (if any) is success-coloured; no error copy.
- The Open Tabs row for that tab disappears (it now has a saved item claim).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-2: Single-tab save — duplicate URL, user confirms "Save anyway"
Covers AC2, AC3, T-2.

**Steps**:
1. Right-click the open tab at `https://example.com` in Open Tabs.
2. Choose "Save to group" → select `Reading`.
3. When the confirm dialog appears, read its contents carefully.
4. Click **Save anyway**.

**Expected**:
- Dialog heading: `URL already saved`.
- Dialog body mentions the existing item title (`Example Site`) and the existing group label (`Work`).
- Primary button label: `Save anyway` (blue / primary colour, NOT red).
- Cancel button present with default label.
- After confirming, a second saved item appears under `Reading` with the same URL.
- Both copies coexist (one in `Work`, one in `Reading`).
- No error toast fires.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-3: Single-tab save — duplicate URL, user cancels
Covers AC2, AC4, T-3.

**Steps**:
1. Open another tab at `https://example.com` (or re-open the original).
2. Right-click the row → "Save to group" → select `Work`.
3. Press **Cancel** (or Escape).

**Expected**:
- No new item created.
- Dialog closes, focus returns to the originating row (focus ring visible on the Open Tabs row).
- Context menu does NOT reappear (per R4 QA M-2 / design §29).
- Existing `Example Site` item in `Work` is untouched (not renamed, not moved).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-4: Bulk save — all tabs unique, no duplicates
Covers AC5, T-4.

**Steps**:
1. In Open Tabs, multi-select three rows whose URLs are NOT already saved.
2. From the bulk action bar, choose "Move to group" → select `Reading`.

**Expected**:
- No confirm dialog appears.
- All three items saved to `Reading`.
- Selection clears after the bulk operation.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-5: Bulk save — mixed duplicates + uniques, confirm all
Covers AC5, AC6, T-5.

**Steps**:
1. In Open Tabs, select five rows total: two URLs that match saved items (e.g., `https://example.com` and `https://docs.example.com`) + three unique URLs.
2. Bulk action bar → "Move to group" → select `Reading`.
3. On the confirm dialog, click **Save all 5**.

**Expected**:
- Dialog heading: `2 of 5 tabs already saved`.
- Dialog body explains that saving will create additional copies.
- Primary button label: `Save all 5`.
- After confirm: five new items appear in `Reading` (two of which duplicate existing URLs).
- Total saved items in the collection increases by exactly 5.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-6: Bulk save — all tabs are duplicates, user cancels
Covers AC5, T-6.

**Steps**:
1. Open three more tabs at URLs you already have saved (mix of `https://example.com` and `https://docs.example.com` variants).
2. Multi-select those three tabs in Open Tabs.
3. Bulk action bar → "Move to group" → select `Work`.
4. On the confirm dialog, click **Cancel** (or Escape).

**Expected**:
- Dialog heading: `3 of 3 tabs already saved`.
- Primary button label: `Save all 3`.
- After cancel: no new items created, selection preserved (per §29.6).
- Focus returns cleanly; no stuck dialog overlay.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-7: Fragment-only differs — warn still fires
Covers T-8 (URL normalization boundary).

**Steps**:
1. Ensure the saved `Docs` item has URL `https://docs.example.com` (no fragment).
2. Open a tab at `https://docs.example.com#section-a`.
3. Right-click that tab in Open Tabs → "Save to group" → `Reading`.

**Expected**:
- Duplicate-warn dialog appears — `safeNormalizeForMatch` strips fragments.
- Body cites the existing `Docs` item title.
- Confirming saves a second copy (URL may be stored with or without the fragment; check it's a distinct item).
- Cancelling does not save.
- Repeat with `#section-b` — same behaviour.

Note: This is documented as intentional in design §29.9 / §29.12. If a user later requests fragment-distinct bookmarks, it becomes a new backlog item.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-8: Floating-group reassociation with duplicate URLs
Covers T-9 (B-018 H-2 regression).

**Steps**:
1. Ensure two saved items share the URL `https://example.com` (from UAT-2 + setup).
2. Close the sidepanel tab (or reload the extension at `chrome://extensions` → reload).
3. Re-open the sidepanel.
4. Open two browser tabs at `https://example.com`.
5. Observe the Open Tabs section and the two saved items.

**Expected**:
- After reconciliation settles, each of the two saved items either shows a live tab claim or remains saved-but-not-live (depending on which tab wins per sortOrder / ordinal disambiguation).
- No crash. No duplicated claim (one live tabId does not claim both items).
- No orphan "ghost" item appears in Open Tabs for a tab that should be associated with a saved item.

Underlying data-layer invariants verified by `tests/tab-claims-disambiguation.test.js` and `tests/b018-persistence.test.js`. UAT is a smoke check.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9: Dark-theme primary-button contrast — KNOWN GAP (B-062)
**Do not fix as part of B-059.** Tracked in `BACKLOG.md` as B-062 for Sprint 16.

**Steps**:
1. Switch the OS or browser theme to dark mode.
2. Re-open the sidepanel and trigger UAT-2 to surface the duplicate-warn dialog.
3. Visually inspect the primary `Save anyway` button contrast against the dialog background.

**Expected**:
- Button is usable (clickable, focusable, keyboard-reachable).
- Colour contrast may not meet WCAG AA in dark theme — accepted gap.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP (record as WARN if contrast is visibly low)
**Notes**: Expected WARN. File any observations against B-062, not B-059.

---

### UAT-10: Regression — destructive delete dialog still red
Covers R4 QA L-1/L-4: ensure the new `data-variant="primary"` extension did NOT bleed into the destructive path.

**Steps**:
1. In the sidepanel, right-click a saved item → choose Delete (or select and use bulk Delete).
2. Observe the confirm dialog.

**Expected**:
- Primary button label is a destructive verb (e.g., `Delete`).
- Primary button background remains red / destructive colour — NOT blue.
- `dataset.variant` on that button is `destructive`, not leaked to `primary` from a prior B-059 dialog (verify by opening a B-059 dialog first, cancelling, then triggering this delete).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-11: Regression — group-delete cascade dialog still behaves
Covers the same dataset-variant concern at group granularity.

**Steps**:
1. Right-click a group header → Delete group.
2. Confirm the destructive dialog appearance matches UAT-10.

**Expected**:
- Red destructive button. No variant leak.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-12: Keyboard-only flow through the soft-warn
Covers the accessibility / keyboard-first requirement (CLAUDE.md frontend standards).

**Steps**:
1. Using keyboard only (no mouse): Tab to an Open Tabs row whose URL is saved.
2. Trigger the row context menu via keyboard (Shift+F10 or the context-menu key).
3. Arrow-navigate to "Save to group" → select a group via keyboard.
4. In the confirm dialog: Tab between Cancel / Save anyway. Press Enter on each across two runs.

**Expected**:
- Focus is visible at every step.
- Dialog traps focus within itself.
- Escape cancels; Enter activates the focused button.
- On close (either path) focus returns to the originating Open Tabs row.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

## Final UAT Summary

| # | Case | Result |
|---|------|--------|
| 1 | Single-tab save — no duplicate | |
| 2 | Single-tab save — duplicate, confirm | |
| 3 | Single-tab save — duplicate, cancel | |
| 4 | Bulk save — all unique | |
| 5 | Bulk save — mixed, confirm | |
| 6 | Bulk save — all duplicates, cancel | |
| 7 | Fragment-only differs — warn fires | |
| 8 | Floating-group reassociation | |
| 9 | Dark-theme contrast (KNOWN GAP / B-062) | |
| 10 | Regression — delete dialog still red | |
| 11 | Regression — group-delete dialog still red | |
| 12 | Keyboard-only flow | |

**Overall**: [ ] PASS / [ ] FAIL

**UAT performed by**: _______________________
**Date**: _______________________
**Browser + build**: _______________________

If any core case (UAT-1..UAT-6) lands FAIL, B-059 returns to the [frontend-engineer] per Gate 3 — do not mark the sprint item done.
