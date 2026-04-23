# UAT — B-022 Quick Search Popup

Sprint 26 · Full tier (L) · Round 1 UAT plan (authored at R1 per Sprint 22 retro HIGH-2)

Related artefacts:
- `docs/BACKLOG.md` — B-022 row (~20 acceptance criteria)
- `docs/SPRINT.md` — B-022 R1 decisions (D-1..D-6)
- `tests/b022-quick-search.test.js` — automated unit + integration tests
- `docs/design/NN-b-022-quick-search-popup.md` — R6 close chapter (created at R6)
- `docs/design/34-b-052-fuzzy-search-caching.md` — B-052 cached index architecture (reused)

## Setup

1. Reload the extension in Edge (`edge://extensions` → Tab Junkie → reload icon).
2. Have at least 20 saved bookmarks across ≥ 3 groups; at least 5 open tabs (mix of saved + unsaved).
3. Have at least one bookmark whose title contains `<script>alert(1)</script>` (XSS probe — UAT-12).
4. Leave DevTools open on the background service worker (Inspect views → service worker) for console monitoring.
5. Keep `edge://extensions/shortcuts` open in another tab for shortcut reference.

Legend: **PASS** = behaviour matches expected · **FAIL** = deviation · **WARN** = correct but surfaced a concern · **SKIP** = unable to execute.

---

## Test Cases

### UAT-1: Shortcut open from a plain tab (AC1 · AC2 · D-2)

**Setup**: Navigate to `https://www.google.com` in the active tab.

**Steps**:
1. Press `Alt+J` (default shortcut registered via manifest `commands._execute_action`).
2. Observe whether the popup opens.
3. Inspect the popup: check that the query input has focus immediately.
4. Check DevTools console — no errors.

**Expected**:
- Popup opens within 200 ms of keypress.
- Query input is focused (cursor active, placeholder text visible).
- No console errors in the service worker or popup.
- Popup dimensions are fixed width (e.g., 480 px); max-height with internal scroll visible if results exceed viewport.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-2: Shortcut open from a browser-internal page (AC1 · D-2 · security)

**Setup**: Navigate to `edge://settings` in the active tab.

**Steps**:
1. Press `Alt+J`.
2. Observe whether the popup opens (browser-internal pages may block extension shortcuts).
3. If popup opens: verify query input focuses and results load without errors.
4. If popup does not open: verify this is a known browser limitation and is not a code regression.

**Expected**:
- Popup opens OR the shortcut is silently blocked by Edge (browser-level limitation — WARN, not FAIL).
- If it opens: functions normally; no errors in service worker console.
- No uncaught exceptions regardless of outcome.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-3: Shortcut open from a Tab Junkie-owned page (AC1 · dogfood)

**Setup**: Open the Tab Junkie side panel; optionally navigate to `newtab/newtab.html` in a tab.

**Steps**:
1. Press `Alt+J` while a Tab Junkie page is the active context.
2. Observe popup behaviour.

**Expected**:
- Popup opens normally; no infinite recursion or focus loop.
- Query input focused on open; no console errors.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-4: Empty-query recency mode — populated and fresh-profile states (AC13 · C-9c · D-3)

**Setup A (populated recency)**: Use the popup to open/focus at least 10 items across prior sessions or interactions.

**Steps A**:
1. Open popup with `Alt+J`.
2. Leave query blank.
3. Inspect the results list.

**Expected A**:
- A list of recently accessed items is shown (≥ 1 row visible), grouped under a "Recent" header or similar label.
- Each row shows favicon, title, URL, and group breadcrumb.
- No "Bookmarks" / "Open Tabs" section headers visible (recency mode replaces search-result mode).

**Setup B (zero recency — fresh profile or cleared recency)**: Clear recency storage or use a fresh profile.

**Steps B**:
1. Open popup with `Alt+J`.
2. Leave query blank.

**Expected B**:
- Empty state is shown: icon + message ("No recent items yet") + CTA or instruction.
- No item rows rendered; no errors.
- Empty state visually consistent with established B-049 empty-state pattern.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-5: Fuzzy search narrows results into two grouped sections (AC3 · AC4 · AC5 · AC6)

**Setup**: Ensure ≥ 3 bookmarks and ≥ 1 open tab contain "github" in title or URL.

**Steps**:
1. Open popup with `Alt+J`.
2. Type `github` in the query input.
3. Observe the result list.

**Expected**:
- Two sections appear: "Bookmarks" header above matching saved items, "Open Tabs" header above matching live tabs.
- Each result row shows: favicon, title, URL, group breadcrumb.
- Match characters in title and URL are highlighted with `<mark>` elements (visible accent colour); no raw HTML injected.
- If no bookmarks match: "Bookmarks" section is absent (or shows "No matches").
- If no open tabs match: "Open Tabs" section is absent (or shows "No matches").
- Max 50 total rows visible; overflow shows scroll indicator.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-6: Arrow-key navigation — cycle and wrap (AC7 · AC8 · D-4)

**Setup**: Type `a` in the popup query to produce ≥ 5 results.

**Steps**:
1. Press `ArrowDown` repeatedly; count how many rows are visited.
2. Continue pressing `ArrowDown` past the last row.
3. Press `ArrowUp` from the first row.
4. Verify the selection highlight (visible focus ring WCAG AA contrast) follows the cursor.

**Expected**:
- Each `ArrowDown` moves selection to the next row; selection wraps from last row back to first.
- Each `ArrowUp` moves selection to the previous row; selection wraps from first row to last.
- Selected row has a distinct, visible focus ring (contrast ≥ 3:1 against adjacent background).
- `role="option"` on the selected row has `aria-selected="true"`.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-7: Enter activates selected item — three sub-scenarios (AC9 · AC10)

**Setup A**: Select a saved bookmark that is NOT currently open in any tab.

**Steps A**:
1. Press `Enter`.
2. Observe: new tab opened? Popup closed?

**Expected A**:
- A new browser tab opens to the bookmark URL.
- Popup closes immediately after `Enter`.
- Recency entry for the item is updated.

**Setup B**: Select a saved bookmark that IS currently open in a tab.

**Steps B**:
1. Press `Enter`.

**Expected B**:
- Existing tab is focused (no new tab opened); the correct window is also focused.
- Popup closes immediately.
- Recency entry updated.

**Setup C**: Select a row from the "Open Tabs" section (live-only tab, not saved).

**Steps C**:
1. Press `Enter`.

**Expected C**:
- Existing tab is focused; correct window focused.
- Popup closes immediately.
- No new tab opened.
- Recency entry updated.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-8: Escape dismisses with zero mutation (AC11 · C-9g)

**Setup**: Open popup, type a query, select a result row via `ArrowDown`.

**Steps**:
1. Press `Escape`.
2. Verify popup closed.
3. Open `edge://extensions` → DevTools → Service Worker console → check Application → Storage inspector for any unexpected writes.

**Expected**:
- Popup closes immediately; no item opened, no tab focused, no navigation.
- Zero storage writes triggered by the Escape action (recency NOT updated when Escape is used).
- No console errors.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9: Performance probe — 500 bookmarks + 20 open tabs, 4-char query (AC16 · AC17 · perf)

**Setup**: Load a collection with exactly 500 saved items (use the test fixture or import); open 20 tabs.

**Steps**:
1. Open popup with `Alt+J`; measure time from keypress to popup visible with query input focused (target < 200 ms — use DevTools Performance tab or `performance.now()` probe in popup.js temporarily).
2. Type a 4-character query (e.g., `http`).
3. Observe filter latency: time from last keypress to results rendered (target < 50 ms P95).
4. Type additional characters; confirm no frame jank (no long tasks > 50 ms in Performance trace).

**Expected**:
- Popup first paint < 200 ms from shortcut trigger.
- Filter latency (500 items + 20 open tabs) < 50 ms P95 — the B-052 cached index (`_searchIndex` in `sidepanel/search-index.js`) is reused; no re-scan.
- No long tasks in the Performance trace during typing.
- Results appear within the same animation frame as query debounce fires.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-10: Accessibility walkthrough — keyboard-only + screen reader (AC14 · AC15)

**Setup**: Enable Edge's built-in narrator or use NVDA/JAWS if available. Disable mouse.

**Steps**:
1. Open popup via keyboard shortcut.
2. Verify narrator announces the popup opened and the query input is announced.
3. Type `g` — verify narrator announces result count (e.g., "12 results").
4. Press `ArrowDown` three times; verify narrator announces each selected item's title and type (Bookmark / Open Tab).
5. Tab through all interactive elements — verify focus never escapes the popup (focus trap).
6. Press Escape — verify popup closes and focus returns to the previously active tab/element.

**Expected**:
- Focus trap is active: Tab and Shift+Tab cycle through query input and result rows only; focus does not reach browser chrome.
- Result count is announced via `aria-live="polite"` region on each query change.
- Selected item is announced via `aria-selected` + `aria-activedescendant` on the listbox container.
- Popup container has `role="dialog"` and `aria-label="Quick Search"`.
- Result list has `role="listbox"`; each row `role="option"`.
- Escape closes popup; focus returns to the element that was active before popup opened.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-11: Dedupe scenario — saved bookmark + live open tab at same URL (AC12 · D-6)

**Setup**: Navigate to a URL that is also saved as a bookmark (e.g., `https://github.com`).

**Steps**:
1. Open popup and type `github`.
2. Observe results: does the URL appear once or twice?
3. If twice: verify the Bookmarks row shows the saved item's group breadcrumb; the Open Tabs row shows the live-tab window/tab indicator.

**Expected**:
- Item appears TWICE: once under "Bookmarks", once under "Open Tabs".
- Bookmarks row shows the item's group breadcrumb.
- Open Tabs row shows the live-tab indicator (e.g., active tab accent or window badge).
- Both rows are individually activatable: Enter on the Bookmarks row navigates via saved-item path; Enter on the Open Tabs row focuses the existing tab directly.
- Visual distinction between the two rows is clear (not just a colour difference — must include a label or icon differential).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-12: XSS probe — malicious bookmark title (AC6 · security)

**Setup**: Create or confirm a saved bookmark whose title is exactly `<script>alert(1)</script>`.

**Steps**:
1. Open popup and type `script` as the query.
2. Observe the result row for the malicious-title bookmark.
3. Verify no alert dialog appears.
4. Right-click → Inspect the result row element — verify the title text is in a `textContent` node, not injected via `innerHTML`.

**Expected**:
- The title `<script>alert(1)</script>` appears as literal text in the result row.
- No script executes (no alert dialog, no console execution error).
- DevTools DOM inspector shows the title characters as a text node, not parsed HTML tags.
- `<mark>` highlight wrapping (if `script` matches) wraps the literal characters — the `<mark>` elements are constructed via safe DOM splitting (B-021 pattern), never via `innerHTML` with the query or title string.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

## UAT Summary

| # | Description | Status |
|---|-------------|--------|
| UAT-1 | Shortcut open from plain tab | |
| UAT-2 | Shortcut open from edge:// internal page | |
| UAT-3 | Shortcut open from Tab Junkie page | |
| UAT-4 | Empty-query recency (populated + fresh) | |
| UAT-5 | Fuzzy search grouped results + highlighting | |
| UAT-6 | Arrow-key navigation + wrap | |
| UAT-7 | Enter activates (saved not-open / saved+live / open-only) | |
| UAT-8 | Escape dismisses with zero mutation | |
| UAT-9 | Perf probe 500 items + 20 tabs | |
| UAT-10 | Accessibility keyboard-only + screen reader | |
| UAT-11 | Dedupe saved+live same URL | |
| UAT-12 | XSS probe malicious title | |

**Overall UAT status**: PENDING — to be completed by [test-engineer] at R5.
