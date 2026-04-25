# UAT Plan — B-099 Drift Fix (Option B + Reconcile Action)

Sprint 33 · Full (M) · R5 UAT plan (authored by [test-engineer])

Related artefacts:

- `docs/BACKLOG.md` — B-099 row (13 acceptance criteria)
- `docs/design/46-b-099-drift-fix.md` — R2 design chapter (D-1..D-10 + C-1..C-12)
- `docs/SPRINT.md` — Sprint 33 active item
- `tests/b099-drift-fix.test.js` — 11 automated tests (T1-T9 from R3/R4, T10-T11 gap-fills from R5)
- `background/tabs/tab-claims.js` — `reevaluateTab` (URL-mismatch release branch removed per D-1)
- `background/messages/storage-handlers.js` — `MSG_UPDATE_ITEM` case (inline drift-clear per D-2)
- `background/tabs/drift.js` — `clearDrift` (no structural change; consumed by SW handler)
- `sidepanel/sidepanel.js` — `_createDriftedIcon` (16 px + tooltip), `_ensureIndicators`, `openContextMenu` ("Snap to this tab"), `showToast` (Undo affordance)
- `sidepanel/sidepanel.html` — `#toast-undo` button slot
- `sidepanel/sidepanel.css` — `.toast-undo` styling
- `newtab/newtab.js` — drift dot tooltip via `_buildIndicators`

## Preconditions

1. Extension loaded unpacked from `feature/sprint-33-drift-fix` via `edge://extensions` → "Load unpacked" → repo root.
2. Edge (primary target browser). Re-run UAT-1, UAT-3, UAT-4 in Chrome as a spot check (cross-browser parity for the central reconcile flow).
3. Fixture: any non-empty bookmarks collection with at least one saved bookmark whose URL points to a page that can be navigated away from in-browser (e.g. a saved bookmark for `https://example.com` so you can open it, navigate to `https://example.org`, and observe drift).
4. DevTools open on the background service worker (`edge://extensions` → Tab Junkie → "Inspect views: service worker") for storage inspection.
5. Confirm starting state: in the SW console run `chrome.storage.session.get('tj:tabClaims')` and `chrome.storage.local.get('tj:drift')` — note the current claim and drift records before each test (and after, where called out).

**C-1 stale-SW note (per CLAUDE.md B-094 extension):** B-099 introduces zero new pref keys, zero new manifest entries, and zero storage schema changes. The C-1 verdict in §46.5 is N/A — no "reload the extension after updating" prompt is required before UAT. The existing `MSG_UPDATE_ITEM` and `clearDrift` paths are cold-start safe per §46.5 C-3. Load the extension once and proceed.

**Automated-only (no UAT case required):** C-9(c) — race between drift write and MSG_UPDATE_ITEM SW handler — is internal to the SW and cannot be reproduced via manual interaction. Covered by T4/T5 automated tests. C-9(d) is covered by UAT-8. C-9(e) (Undo dispatched after live tab closes) is a minor edge case with graceful no-op behavior; no dedicated UAT case needed given T3 covers the tab-close clear path and UAT-14 mirrors it.

Legend: **B** = blocker (zero failures tolerated) · **H** = high (at most 1 fail, documented) · **M** = medium (non-blocking)

---

## Test Cases

### Drift fix core (AC1, AC2, AC3, AC4)

#### UAT-1: Drift detected and claim preserved on URL change — Priority: B

**Given** a saved bookmark "Example" exists with URL `https://example.com` AND I have opened it via Tab Junkie so it is claimed (sidepanel shows the green live dot on the row).
**When** I switch to that tab and navigate to a different URL in the address bar, e.g. `https://example.org`.
**Then** within ~500 ms the sidepanel row for "Example":
  - retains the green live dot (claim preserved per D-1),
  - shows the orange drift indicator (warning triangle) at the right edge of the row,
  - does NOT appear in the Open Tabs section (it would have under the pre-S33 bug).
**Expected**: SW console `chrome.storage.session.get('tj:tabClaims')` still shows the `Example → tab id` mapping. `chrome.storage.local.get('tj:drift')` shows a record `{ itemId, driftedToUrl: 'https://example.org', detectedAt }`. The Open Tabs section in the sidepanel does NOT list `https://example.org` as an entry.

#### UAT-2: Drift indicator clears when navigating back — Priority: B

**Given** a drifted bookmark from UAT-1 (warning triangle visible).
**When** I navigate the same live tab back to the saved URL `https://example.com`.
**Then** within ~500 ms the warning triangle disappears from the row, the green live dot is unchanged.
**Expected**: `chrome.storage.local.get('tj:drift')` no longer contains an entry for the bookmark's itemId. The row reads as a normal claimed live bookmark.

#### UAT-3: Indicators are additive (live + audible + drifted) — Priority: H

**Given** a saved bookmark for a page that auto-plays audio (e.g. a YouTube watch URL or `https://soundcloud.com/<something>` that you can start playing).
**When** I open the saved bookmark, start audio playback (so the live tab is audible), then navigate the tab to a different URL on the same domain (so the bookmark drifts but the audio keeps playing — for SoundCloud this works on most pages).
**Then** the sidepanel row simultaneously shows: green live dot, audible musical-note icon, AND orange drift triangle. None of the three suppresses any other.
**Expected**: All three indicator nodes are present in the row's `.item-indicators` strip in the order: window badge (if cross-window) → audible icon → drift triangle. Right-click the row and confirm "Snap to this tab" entry is also present (drift detected).

#### UAT-4: Drifted-but-claimed tab does NOT appear in Open Tabs — Priority: B

**Given** the drifted bookmark from UAT-1.
**When** I scroll the sidepanel to the Open Tabs section.
**Then** the drifted tab does NOT appear as an entry there. (Pre-S33 it would have, as an orphaned live tab — which is the bug B-099 fixes.)
**Expected**: The Open Tabs section contains only tabs that are not claimed by any saved bookmark. The drifted tab is still present in the saved bookmarks list with the warning triangle.

---

### Reconcile action — "Snap to this tab" (AC5, AC6, AC7, AC8)

#### UAT-5: Context menu entry visible only when item is drifted — Priority: B

**Given** a non-drifted saved bookmark AND a drifted saved bookmark visible in the sidepanel.
**When** I right-click each row in turn.
**Then** the non-drifted item's context menu shows: Navigate, Edit, Move to group, (optional Close tab if live), Delete — and NO "Snap to this tab" entry.
**And** the drifted item's context menu shows the same entries PLUS "Snap to this tab" inserted between Edit and Move to group.
**Expected**: "Snap to this tab" is completely absent from the DOM (not disabled, not visually muted) when no drift record exists. Use DevTools Elements panel on `#context-menu` to verify.

#### UAT-6: Snap to this tab updates the saved URL — Priority: B

**Given** the drifted bookmark from UAT-1 (right-click menu open, "Snap to this tab" visible).
**When** I click "Snap to this tab".
**Then**:
  - within ~300 ms, the warning triangle disappears from the row,
  - the row's URL line updates to show the drifted-to URL (`https://example.org`),
  - a toast appears at the bottom of the sidepanel reading **"Bookmark snapped to current tab"** with an "Undo" button on the left of the dismiss × button,
  - opening the Edit dialog on the row shows the URL field populated with the new (snapped) URL.
**Expected**: SW console `chrome.storage.local.get('tj:items')` shows the item's `url` is now `https://example.org`. `chrome.storage.local.get('tj:drift')` no longer contains the drift record. Claim is unchanged in `tj:tabClaims`.

#### UAT-7: Undo reverts the snap within the toast window — Priority: B

**Given** the toast from UAT-6 is visible (within ~6 seconds of the snap).
**When** I click the "Undo" button on the toast.
**Then**:
  - the toast hides immediately,
  - the row's URL line reverts to the original saved URL (`https://example.com`),
  - within ~500 ms the warning triangle reappears on the row (drift re-detected on the next tab event because the live tab is still at the drifted URL).
**Expected**: SW console `chrome.storage.local.get('tj:items')` shows the item's `url` is back to `https://example.com`. A fresh drift record reappears in `tj:drift`. The claim is still in `tj:tabClaims`.

#### UAT-8: Toast auto-dismisses after ~6 seconds without Undo — Priority: H

**Given** the toast from UAT-6 is visible.
**When** I do not click Undo and wait 6+ seconds.
**Then** the toast hides automatically. Clicking the row position where Undo was no longer triggers any reversal (the button is gone from the DOM).
**Expected**: `tj:items` retains the snapped URL after the auto-dismiss; the action is permanent.

---

### Visual prominence (AC9, AC10)

#### UAT-9: Drift indicator size, color, and tooltip — Priority: H

**Given** a drifted saved bookmark in the sidepanel.
**When** I hover the warning triangle icon at the right of the row.
**Then** within ~500 ms a browser-native tooltip appears reading exactly "Drifted to: example.org" (hostname only, no path/query).
**And** the triangle visually reads as orange/amber (matching the theme's `--drifted-color`) and is noticeably larger than 14 px (now 16 px — visibly weightier than the audible musical-note icon at 14 px).
**Expected**: DevTools inspector on `.item-drifted-icon` shows `width="16"` and `height="16"` on the inner `<svg>`; the `title` attribute on the span equals `Drifted to: example.org`; computed CSS `color` resolves to the active theme's `--drifted-color`.

#### UAT-10: Newtab dense row drift dot tooltip — Priority: M

**Given** the same drifted bookmark visible in the new-tab page (open a new tab — `edge://newtab` in Edge, or the equivalent — if Tab Junkie's new-tab override is enabled — otherwise SKIP).
**When** I hover the small drift dot to the right of the row.
**Then** the tooltip reads "Drifted to: example.org" (hostname only, same hostname-only contract as the sidepanel icon).
**Expected**: The newtab dot remains 12 px (dense layout); only the tooltip is added. `aria-label="Tab has navigated away from its saved URL"` is preserved as the AT carrier.

---

### Re-claim contention (AC2)

#### UAT-11: Second matching item does NOT auto-claim a drifted tab — Priority: H

**Given** two saved bookmarks: A `https://example.com` (claimed by tab T) and B `https://example.org` (unclaimed).
**When** I navigate tab T from `https://example.com` to `https://example.org`.
**Then**:
  - bookmark A retains its claim on tab T (live dot stays on row A) AND shows the drift indicator,
  - bookmark B remains unclaimed (no live dot on row B).
**Expected**: SW console `chrome.storage.session.get('tj:tabClaims')` shows `A → T` and no entry for B. This is the explicit D-3 / AC2 contract — original claim wins.

---

### Cross-window + demote regression guards (AC11/T8 mirror)

#### UAT-12: Drift survives moving the tab to another window — Priority: M

**Given** the drifted bookmark from UAT-1 (warning triangle visible, tab in window A).
**When** I drag the drifted tab from window A to a new window B (or use right-click → "Move tab to" → "New window").
**Then**:
  - the warning triangle stays on the row in the sidepanel,
  - the cross-window badge updates to point at window B's ordinal,
  - SW console: `tj:tabClaims` still shows the original `itemId → tabId` (tab id is stable across window moves; only `windowId` changes).
**Expected**: Drift state is independent of window membership.

#### UAT-13: "Close tab & unsave" on a drifted bookmark clears drift cleanly — Priority: H

**Precondition:** The item must be live (have an active claim) for "Delete" to act as demote. If the item is not live, Delete performs a plain unsave and does not trigger the drift-clear path. Verify the green live dot is visible on the row before clicking Delete.

**Given** the drifted bookmark from UAT-1 (warning triangle visible, claim present).
**When** I right-click the row and choose "Delete" (which acts as demote-when-live, dispatching `MSG_DEMOTE_ITEM`).
**Then** the row disappears, the live tab closes, and SW console shows:
  - `tj:items` no longer contains the item,
  - `tj:drift` no longer contains the drift record,
  - `tj:tabClaims` no longer contains the claim entry.
**Expected**: Clean tear-down across all three storage partitions in a single round-trip.

---

### C-9(b) coverage — tab close auto-clears drift (T3 UAT mirror)

#### UAT-14: Closing the live tab auto-clears drift — Priority: H

**Note**: This UAT case covers §46.5 C-9 path (b) — tab closed while item is drifted. The automated regression guard is T3; this UAT confirms the full wiring is live in Edge.

**Given** the drifted bookmark from UAT-1 (warning triangle visible, claim present — verified via `chrome.storage.session.get('tj:tabClaims')` and `chrome.storage.local.get('tj:drift')`).
**When** I close the live tab directly (click the × on the tab in the tab bar, NOT via Tab Junkie UI).
**Then** within ~500 ms:
  - the warning triangle disappears from the bookmark row in the sidepanel,
  - the green live dot disappears (claim released),
  - the row reads as a normal saved (non-live) bookmark.
**Expected**: SW console shows `tj:tabClaims` no longer contains the item's claim entry AND `tj:drift` no longer contains the item's drift record. Both cleared atomically by the `tabs.onRemoved` → `releaseClaimByTab` → `clearDrift` wiring at `tab-events.js:202-203`. No stale drift indicator remains after the tab close event propagates.

---

## Pass criteria

- All B-priority cases (UAT-1, UAT-2, UAT-4, UAT-5, UAT-6, UAT-7) PASS.
- All H-priority cases (UAT-3, UAT-8, UAT-9, UAT-11, UAT-13, UAT-14) PASS or have one documented FAIL with rationale.
- All M-priority cases (UAT-10, UAT-12) PASS or SKIP (with reason — e.g., feature not enabled in test environment).

A single FAIL on any B-priority case blocks the sprint close — route back to [frontend-engineer] for fix, do NOT mark B-099 done.

## Out of scope (per AC13 — do not test)

- Push notifications or browser badge counts on drift detection.
- "Restore tab to bookmark URL" (navigate the live tab back to the saved URL).
- "Save as new bookmark" from the drift indicator.
- Drift record auto-expiry after N hours/days.
- Aggregate "N items drifted" count badge.
- Dedicated "Drifted Items" section/filter in the sidepanel.

If the user requests any of the above during UAT, file as a new icebox row, do NOT amend B-099.
