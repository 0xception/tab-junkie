# UAT — B-054 Sidepanel Shell

**Sprint:** R5  
**Status:** PENDING USER  
**Tester:**  
**Date:**  
**Build / commit:**

---

## Pre-conditions

1. Clone / pull the current branch (`feature/rebuild-from-prd`).
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the repo root (`/path/to/junkie`).
4. Confirm the extension appears without errors in the extensions list.
5. Open any regular web page (e.g., `https://example.com`) so a tab is active.

---

## Opening the sidepanel

- Right-click the Tab Junkie toolbar icon → **Open side panel**, or  
- Click the icon and use the keyboard shortcut (if configured), or  
- Navigate to `chrome://extensions` → Tab Junkie → **Side panel** → open.

The panel docks to the right of the browser window.

---

## AC1 — Zero console errors on open

**Steps:**
1. Open DevTools (F12) on any page, **Console** tab.
2. Open the sidepanel as above.

**Expected:** No red errors appear in the console. Warnings about missing favicons (chrome://favicon2/) are acceptable.  
**Pass/Fail:** ___

---

## AC2 — Initial loading skeleton, then content

**Steps:**
1. In DevTools → Network, enable **Slow 3G** throttling.
2. Close and reopen the sidepanel.
3. Observe the panel immediately after opening, before data loads.

**Expected:** A shimmer skeleton (multiple grey placeholder bars, no spinner) is visible. Once data arrives both the skeleton disappears and real content is shown.  
**Pass/Fail:** ___

Reset Network throttling to **No throttling** before continuing.

---

## AC3 — Items organised by groups; ungrouped section at bottom

**Pre-condition:** Use the popup to ensure ≥2 named groups exist, each with ≥1 bookmark. Add ≥1 bookmark with no group.

**Steps:**
1. Open the sidepanel.

**Expected:**
- Each named group shows a header with the group name, a colour chip, and an item count badge.
- Items appear below their respective group header.
- An "Ungrouped" section appears **after** all named group sections.
- Items with no group appear only in the Ungrouped section.

**Pass/Fail:** ___

---

## AC4 — Sub-groups indented under parent

**Pre-condition:** Create a group (e.g., "Parent") and a second group (e.g., "Child") whose parent is set to "Parent".

**Steps:**
1. Open the sidepanel.
2. In DevTools → Elements, measure the `padding-left` of a top-level item row vs. an item row inside the Child group.

**Expected:** Child group items have `padding-left` ≥ 16 px more than top-level items. The child group header itself is visually indented under the parent group header.  
**Pass/Fail:** ___

---

## AC5 — Item rows: favicon (live) vs. letter-avatar (non-live)

**Steps:**
1. Add a bookmark for `https://github.com`.
2. Open a browser tab to `https://github.com` (item becomes "live").
3. Open the sidepanel.

**Expected for the live item:** A real favicon image is displayed (not a coloured circle with a letter).  
**Expected for a non-live item:** A coloured circle/square containing the first letter of the item's title is shown.  
Both rows show title (one truncated line) and URL (second truncated line).  
**Pass/Fail:** ___

---

## AC6 — Live / active / audible / drifted indicators

**Steps:**

### AC6a — Live indicator
1. Ensure a bookmark exists for a URL that is currently open in a tab.
2. Open the sidepanel.
3. In DevTools → Elements, confirm the row has `data-live="true"` and a visible distinct treatment (e.g., coloured left border or green dot).

**Pass/Fail:** ___

### AC6b — Active indicator
1. Click the tab matching a bookmark so that tab is the currently focused tab.
2. In the sidepanel, confirm the row has `data-active="true"` and an accent highlight that is visually distinct from the live indicator.

**Pass/Fail:** ___

### AC6c — Audible indicator
1. Open a tab that plays audio (e.g., a YouTube video, playing).
2. If a bookmark matches that URL, confirm the row has `data-audible="true"` and a speaker icon.

**Pass/Fail:** ___

### AC6d — Drifted indicator
1. Promote a tab to a bookmark, then manually change the tab's URL to something else (the stored bookmark URL no longer matches the live tab URL).
2. Confirm the row has `data-drifted="true"` and a warning/triangle icon.

**Pass/Fail:** ___

---

## AC7 — Group collapse/expand persists across panel close/reopen

**Steps:**
1. Click a group header in the sidepanel — the group's items should hide.
2. Confirm the group header's `aria-expanded` attribute is `"false"` in DevTools.
3. Close the sidepanel (click the × or use the keyboard).
4. Reopen the sidepanel.

**Expected:** The group is still collapsed (items hidden, `aria-expanded="false"`).

5. Click the header again — items reappear (`aria-expanded="true"`).

**Pass/Fail:** ___

**Note for "Ungrouped" section:** Collapse state for the Ungrouped section is stored in `sessionStorage` (`tj-ungrouped-collapsed`), not via MSG_UPDATE_GROUP. It persists within the same browser session but resets on browser restart.

---

## AC8 — Click item navigates to its tab; panel stays open

**Steps:**
1. Ensure a bookmark has a matching open tab.
2. Switch to a different tab so the bookmarked tab is not active.
3. In the sidepanel, click the item row (not the group header).

**Expected:**
- The browser switches focus to the matching tab.
- The sidepanel remains open and visible.

**Pass/Fail:** ___

---

## AC9 — Broadcast-driven re-render (no page reload)

**Steps:**
1. Open the sidepanel.
2. Open the extension popup or DevTools console.
3. Create a new bookmark via the popup UI (or dispatch MSG_CREATE_ITEM via the console).
4. Watch the sidepanel — do **not** manually refresh it.

**Expected:** Within ~100 ms the new item appears in the sidepanel without a full page reload. The skeleton does not re-appear.

For precise measurement:
1. Open DevTools on the sidepanel page.
2. In the Performance tab, record while creating a bookmark.
3. Confirm DOM mutation settles within 100 ms of the MSG_STATE_CHANGED broadcast landing.

**Pass/Fail:** ___

---

## AC10 — Empty state

**Steps:**
1. Delete all bookmarks (or open a fresh profile with no Tab Junkie data).
2. Open the sidepanel.

**Expected:**
- No group headers or item rows are visible.
- A centred icon, the text "No bookmarks yet", and a (disabled) "Add your first bookmark" button are shown.
- The loading skeleton is not visible.

**Pass/Fail:** ___

---

## AC11 — Loading skeleton (same as AC2)

Covered by AC2. Mark the same result here for traceability.

**Pass/Fail (copy from AC2):** ___

---

## AC12 — First-paint performance < 200 ms

**Pre-condition:** Create a collection of exactly 500 bookmarks across ≥5 groups (can be scripted via MSG_CREATE_ITEM loop in the console).

**Steps:**
1. Open DevTools on the sidepanel page.
2. In the **Performance** tab, click Record.
3. Close and reopen the sidepanel.
4. Stop recording.
5. In the flame chart, measure the time from `DOMContentLoaded` to the last DOM insertion (skeleton hidden, all rows painted).

**Expected:** The interval is < 200 ms.  
**Actual measured value:** ___ ms  
**Pass/Fail:** ___

---

## AC13 — Theme support

### AC13a — Explicit light theme
1. Set theme to `light` via the popup preferences.
2. Open the sidepanel.
3. Inspect `<html data-theme="...">` in DevTools.

**Expected:** `data-theme="light"` and the panel renders in light colours.  
**Pass/Fail:** ___

### AC13b — Explicit dark theme
1. Set theme to `dark`.
2. Reopen the sidepanel.

**Expected:** `data-theme="dark"` and the panel renders in dark colours.  
**Pass/Fail:** ___

### AC13c — System theme responds to OS change
1. Set theme to `system`.
2. Open the sidepanel.
3. Toggle OS appearance (macOS: System Preferences → Appearance; Windows: Settings → Colors).

**Expected:** The panel switches between light and dark rendering **without** reloading the page. `data-theme` in DevTools remains `"system"` (or updates to match, per implementation).  
**Pass/Fail:** ___

---

## AC14 — Keyboard navigation

**Steps:**
1. Click anywhere in the sidepanel to give it focus.
2. Press **Tab** repeatedly.

**Expected:** Focus moves through every group header and every item row in DOM order. No element is skipped; focus is never lost.

3. Press **Shift+Tab** to reverse through elements.

**Expected:** Focus moves back in reverse order without getting trapped.

4. Focus a group header and press **Enter**.

**Expected:** The group collapses or expands (same as clicking).

5. Focus an item row and press **Enter**.

**Expected:** The browser navigates to the item's tab (same as clicking).

**Pass/Fail:** ___

---

## AC15 — Visible focus indicators (both themes)

**Steps:**
1. With the sidepanel in **light** theme, tab through elements and confirm a visible focus ring is present on every focused element.
2. Switch to **dark** theme and repeat.

**Expected:** A visible focus ring (outline, box-shadow, or equivalent) is present in both themes. Measure contrast of the ring against the adjacent background — must be ≥ 3:1 (WCAG AA for UI components).  
**Pass/Fail (light):** ___  
**Pass/Fail (dark):** ___

---

## AC16 — ARIA roles and attributes

**Steps:**
1. Open the sidepanel.
2. Open DevTools → Elements and locate `#item-list`.

**Expected:**
- `#item-list` has `role="list"`.
- Each item row `div.item-row` has `role="listitem"`.
- Each `div.group-section` has `role="listitem"` (it is a list item in the top-level list).
- Each `div.group-header` has `role="button"`, `tabindex="0"`, `aria-expanded="true|false"`, and `aria-controls` pointing to the corresponding `.group-items` container id.
- `.group-items` has the id referenced by `aria-controls`.

**Optional (recommended):** Install the axe DevTools browser extension and run an accessibility audit on the sidepanel page — zero violations expected.

**Pass/Fail:** ___

---

## AC17 — Out-of-scope elements are absent

**Steps:**
1. Inspect the sidepanel with content loaded.

**Confirm the following are NOT present:**
- [ ] Drag handles on item rows or group headers
- [ ] Context menus (right-click produces browser default menu, not a custom one)
- [ ] A search or filter input field
- [ ] Multi-select checkboxes on item rows
- [ ] Group reorder controls
- [ ] Create/Edit/Delete bookmark dialogs

**Pass/Fail:** ___

---

## Summary table

| AC | Description | Result |
|----|-------------|--------|
| AC1 | Zero console errors | |
| AC2 | Skeleton → content | |
| AC3 | Group rendering + ungrouped at bottom | |
| AC4 | Sub-group indentation | |
| AC5 | Favicon (live) vs letter-avatar (non-live) | |
| AC6a | Live indicator | |
| AC6b | Active indicator | |
| AC6c | Audible indicator | |
| AC6d | Drifted indicator | |
| AC7 | Collapse/expand persists | |
| AC8 | Click navigates; panel stays open | |
| AC9 | Broadcast re-render ≤ 100 ms | |
| AC10 | Empty state | |
| AC11 | Skeleton (same as AC2) | |
| AC12 | First-paint < 200 ms at 500 items | |
| AC13a | Light theme | |
| AC13b | Dark theme | |
| AC13c | System theme responds to OS | |
| AC14 | Keyboard navigation | |
| AC15 | Focus indicators (light + dark) | |
| AC16 | ARIA roles correct | |
| AC17 | Out-of-scope elements absent | |

---

## Recommendations for developer (from test-engineer)

1. **Extract pure helpers to `sidepanel/helpers.js`** — `avatarColor`, the group-sort logic, and `resolveTheme` are pure functions inlined in `sidepanel.js`. Because `sidepanel.js` triggers `document.getElementById` and `chrome.runtime.onMessage.addListener` at module-evaluation time, it cannot be imported in Node.js without a DOM. Extracting these three functions to a side-effect-free `sidepanel/helpers.js` module would allow direct import in `node:test` and eliminate the need for the verbatim reproductions in `sidepanel-logic.test.js`.

2. **Collapse persistence for named groups** is sent via `MSG_UPDATE_GROUP` (async, non-critical). Verify the service worker applies the `collapsed` patch to the stored group object so that a cold reopen restores state correctly. This is a UAT-only verification (AC7) but should be confirmed with a storage-layer unit test in a future ticket.

3. **AC9 timing** — the 100 ms SLA is stated in the backlog AC but is difficult to verify manually. Consider a future automated test using a headless Chrome via `chrome-launcher` or Playwright to measure DOM-mutation latency post-broadcast.
