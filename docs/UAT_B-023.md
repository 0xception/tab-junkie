# UAT — B-023 Group Jump Popup

Sprint 27 · Full tier (L) · Round 1 UAT plan (authored at R1 per Sprint 22 retro HIGH-2)

Related artefacts:
- `docs/BACKLOG.md` — B-023 row (~18 acceptance criteria)
- `docs/SPRINT.md` — B-023 R1 decisions (D-1..D-7)
- `tests/b023-group-jump-popup.test.js` — automated unit + integration tests
- `docs/design/NN-b-023-group-jump-popup.md` — R6 close chapter (created at R6)
- `docs/design/39-b-022-quick-search-popup.md` — B-022 reuse surface (§39.10 As Built is critical reading — D-UAT-3 popup-lifecycle race)
- `docs/design/35-b-007-sub-group-nesting.md` — sub-group hierarchy for breadcrumb rendering
- `shared/highlight.js` — match highlighting (promoted at B-022)
- `shared/favicon.js` — favicon safety guard (promoted at B-022)

## Setup

1. Reload the extension in Edge (`edge://extensions` → Tab Junkie → reload icon).
2. Ensure ≥ 10 groups exist, including at least 2 sub-groups (depth 1). Have ≥ 3 groups with "work" in the name for UAT-5.
3. Ensure at least one group has a name containing `<script>alert(1)</script>` (XSS probe — UAT-13).
4. Ensure at least one group is empty (no bookmarks, no sub-groups) and at least one group contains only sub-groups and no direct bookmarks (for UAT-10 sub-cases).
5. Ensure at least 5 browser tabs are open (mix of saved + unsaved).
6. Leave DevTools open on the background service worker (`edge://extensions` → Inspect views → service worker) for console monitoring.
7. Keep `edge://extensions/shortcuts` open in another tab for shortcut reference.

Legend: **PASS** = behaviour matches expected · **FAIL** = deviation · **WARN** = correct but surfaced a concern · **SKIP** = unable to execute.

---

## Test Cases

### UAT-1: Shortcut open from a plain tab (AC1 · AC2 · D-2)

**Setup**: Navigate to `https://www.google.com` in the active tab.

**Steps**:
1. Press `Alt+K` (the `group-jump` command registered in `manifest.json`).
2. Observe whether the group-jump popup opens.
3. Inspect the popup: check that the query input has focus immediately.
4. Check DevTools service worker console — no errors.

**Expected**:
- Group-jump popup opens within 200 ms of keypress.
- Query input is focused (cursor active, placeholder text visible, e.g., "Search groups…").
- Full group list is shown in the results area (empty-query shows all groups).
- No console errors in the service worker or popup JS context.
- Popup body width anchored (≥ 440 px); no horizontal overflow.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-2: Shortcut open from a browser-internal page (AC1 · D-2 · security)

**Setup**: Navigate to `edge://settings` in the active tab.

**Steps**:
1. Press `Alt+K`.
2. Observe whether the popup opens (browser-internal pages may block extension shortcuts).
3. If popup opens: verify query input focuses and group list loads without errors.
4. If popup does not open: confirm this is a known Edge limitation and not a code regression.

**Expected**:
- Popup opens OR shortcut is silently blocked by Edge (WARN, not FAIL — browser-level limitation).
- If open: functions normally; no errors in service worker console.
- No uncaught exceptions regardless of outcome.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-3: Alt+K dispatch while B-022 popup is focused (AC2 · D-1 · D-6)

**Note**: Per R2 resolution — D-1 chose two separate popup surfaces (B-022 + B-023), and D-6 confirmed there is NO in-B-022 mode-toggle key. This case verifies that pressing `Alt+K` while the B-022 quick-search popup is focused cleanly hands off to B-023: the B-022 popup is dismissed by the browser on focus leave (SW command handler runs), and the SW listener dispatches a fresh B-023 popup.

**Setup**: Open the B-022 quick-search popup via `Alt+J`. Have at least one character typed in the query (so the state is non-trivial).

**Steps**:
1. Press `Alt+K` while the B-022 popup has focus.
2. Observe: B-022 closes (browser dismisses the popup when focus leaves for the SW command path).
3. Observe: B-023 opens fresh via the service-worker `onCommand` listener.
4. Type `work` in B-023 and verify the group list is filtered.

**Expected**:
- B-022 popup closes (browser behavior — focus-leave dismissal).
- B-023 popup opens within the normal first-paint budget (< 200 ms).
- B-023 query input is focused, empty, and ready for input (no stale state from B-022).
- Group list visible and responds to typing normally.
- No popup flash, blank frame, or JS exception in either popup or the service-worker console.
- NOT expected: a mode-toggle within B-022 (D-1 option (a) was rejected — no such toggle exists).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-4: Empty query — full group list as default (AC3 · C-9a,b)

**Setup**: Open the group-jump popup with `Alt+K`. Leave query blank.

**Steps**:
1. Observe the results list immediately on popup open.
2. Verify: are groups shown? Are sub-groups shown with parent breadcrumb?
3. Count approximate rows; confirm all top-level groups are represented.

**Expected**:
- All top-level groups are listed in the results area (no hiding on empty query — full group list as default, not recency mode).
- Sub-groups show parent breadcrumb context (e.g., "Work › Projects" or parent name prefix per D-3 / D-4 R2 resolution).
- Each row shows: group name, "(N bookmarks · M open)" counts.
- No "No results" empty-state shown when groups exist.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-5: Fuzzy filter narrows group list (AC4 · AC5 · AC6)

**Setup**: Ensure at least 3 groups contain "work" in their name (e.g., "Work", "Work/Projects", "Homework"). Open the popup with `Alt+K`.

**Steps**:
1. Type `work` in the query input.
2. Observe the filtered results.
3. Inspect match highlighting on the matching character sequences.

**Expected**:
- Only groups matching "work" (case-insensitive substring) appear.
- Sub-groups matching show their parent breadcrumb (e.g., "Work › Projects").
- Non-matching groups are hidden.
- Matching characters in the group name are highlighted with `<mark>` elements (visible accent colour).
- No `innerHTML` injection — `<mark>` constructed via safe DOM splitting per `shared/highlight.js`.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-6: Arrow-key navigation and wrap (AC7 · AC8 · D-4)

**Setup**: Type `a` in the popup query to produce ≥ 5 results.

**Steps**:
1. Press `ArrowDown` repeatedly; count how many rows are visited.
2. Continue pressing `ArrowDown` past the last row — confirm wrap.
3. Press `ArrowUp` from the first row — confirm wrap to last.
4. Verify the selection highlight (visible focus ring) follows the cursor.

**Expected**:
- Each `ArrowDown` moves selection to next row; wraps from last row back to first.
- Each `ArrowUp` moves selection to previous row; wraps from first row to last.
- Selected row has a visible, distinct focus ring (contrast ≥ 3:1 against background — WCAG AA).
- `aria-selected="true"` on the selected `role="option"` row; `aria-activedescendant` updated on the listbox.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-7: Enter drills into a group — group contents view (AC9 · AC10 · D-3)

**Setup**: Open popup, leave query blank (full list visible). Identify a group with ≥ 3 bookmarks and at least 1 sub-group.

**Steps**:
1. Navigate with `ArrowDown` to that group row.
2. Press `Enter`.
3. Observe the popup content area: does it show the group's contents?
4. Verify the count display on the drilled-in group header.

**Expected**:
- Popup transitions to drill-in view showing the selected group's contents: bookmarks, sub-groups.
- Header or breadcrumb shows the group name (e.g., "Work ›").
- Bookmark rows show title, URL (2nd line), favicon.
- Sub-group rows show sub-group name + their own "(N bookmarks · M open)" counts.
- "(N bookmarks · M open)" count on the group header reflects live open-tab count for that group's items.
- Back action button or affordance is visible.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-8: Back action returns to group list (AC11 · D-4)

**Setup**: Drill into a group (from UAT-7).

**Steps**:
1. Activate the Back action (button click or `ArrowLeft` at top of drill-in list, or dedicated back gesture per R2 decision on D-4).
2. Observe whether the popup returns to the group list.
3. Verify selection state on return (expected: previously-selected group row is still selected).

**Expected**:
- Popup returns to the group list view (breadcrumb collapses, full list visible or previous filter active).
- Focus returns to query input or previously-selected group row (per R2/D-4 resolution).
- No popup close — Back navigates hierarchy, does not dismiss popup.
- Breadcrumb strip updates to reflect top-level context.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9: Escape behaviour — close popup (AC12 · D-4)

**Sub-case A — Escape at group list level (not drilled-in)**:
1. Open popup with `Alt+K`; do not drill in.
2. Type a query.
3. Press `Escape`.

**Expected A**:
- Popup closes immediately.
- No navigation, no storage write.
- Focus returns to previously active browser element.

**Sub-case B — Escape while drilled into a group**:
1. Open popup, drill into a group.
2. Press `Escape`.

**Expected B** (per R1 recommendation: Escape always closes):
- Popup closes (does NOT navigate back to group list — Escape is always "close").
- Alternative: if R2 resolves D-4 as "Escape at drill-in = go back (not close)", verify that behaviour instead, and update sub-case B expected accordingly.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-10: Empty-state matrix (AC13 · C-9a–h)

Test each sub-state independently. Mark each as PASS / FAIL / WARN / SKIP.

| Sub-case | Setup | Expected | Status |
|---|---|---|---|
| (a) Zero groups (fresh profile or all groups deleted) | Delete all groups; open popup | "No groups yet" empty state with icon + CTA; no crash | |
| (b) Zero matches for query | Open popup; type `xqzwtf` | "No groups matching 'xqzwtf'" empty state; group list hidden; no crash | |
| (c) Drill into an empty group (no bookmarks, no sub-groups) | Drill into a group with 0 items | Empty group view with "No items in this group" message; back action still visible and functional | |
| (d) Drill into a group with only sub-groups and no direct bookmarks | Drill into a group containing only sub-groups | Only sub-group rows appear; no bookmark rows; counts reflect sub-group totals | |
| (e) Back action at top level (already at group list, not drilled in) | Press Back gesture/button while at group list | No-op OR no back button visible (back affordance hidden at top level); popup stays open | |
| (f) SW cold-start during popup session | Force-kill SW via DevTools; then type in the popup | Popup recovers within ≤ 2 s; re-wakes SW; no freeze or blank error | |
| (g) Concurrent group CRUD mid-drill | Drill into a group; in a separate tab, delete that group via the sidepanel | Popup does not crash; stale view remains until next interaction or popup close; no JS exception in console | |
| (h) Whitespace-only query (AC19(h)) | Open popup; type `"   "` (three spaces) into the query input | Whitespace is trimmed to empty query → full group list shown; NO "No groups matching" empty-matches state; no crash | |

**Status (overall)**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-11: Performance probe — 50+ groups, typing latency (AC15 · AC16 · perf)

**Setup**: Ensure ≥ 50 groups exist in the collection (use test fixture or create synthetic groups). Open the group-jump popup.

**Steps**:
1. Open popup with `Alt+K`; measure time from keypress to popup visible with query input focused (target < 200 ms — use DevTools Performance tab or `performance.now()` probe).
2. Type a 3-character query (e.g., `wor`); measure time from keypress to results rendered (target < 50 ms P95).
3. Continue typing; confirm no frame jank (no long tasks > 50 ms in Performance trace).
4. Drill into the largest group (most bookmarks); verify drill-in render is within the 200 ms first-paint budget.

**Expected**:
- Popup first paint (shortcut → input focused) < 200 ms P95.
- Filter latency (50+ groups, 3-char query) < 50 ms P95.
- Drill-in transition < 200 ms.
- No long tasks visible in Performance trace during typing.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-12: Accessibility walkthrough — keyboard-only + screen reader (AC17 · AC18)

**Setup**: Enable Edge's built-in narrator or use NVDA/JAWS if available. Disable mouse.

**Steps**:
1. Open popup via keyboard shortcut `Alt+K`.
2. Verify narrator announces the popup opened and the query input is announced (role="dialog" with aria-label).
3. Type `g`; verify narrator announces result count via `aria-live="polite"`.
4. Press `ArrowDown` three times; verify narrator announces each selected group name.
5. Press `Enter` on a group; verify transition to drill-in view is announced.
6. Tab through all interactive elements — verify focus never escapes the popup (focus trap).
7. Press Escape — verify popup closes and focus returns to previously active element.

**Expected**:
- Popup container: `role="dialog"` + `aria-label="Jump to Group"` (or similar) + `aria-modal="true"`.
- Query input: `role="combobox"` + `aria-expanded` + `aria-controls` → listbox id.
- Group list: `role="listbox"`. Each row: `role="option"` + `aria-selected`.
- Result count announced via `aria-live="polite"` on each query change.
- Focus trap: Tab / Shift+Tab cycle between query input and result rows only; focus does not reach browser chrome.
- Escape closes popup; focus returns to previously active element.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-13: XSS probe — malicious group name (AC6 · security)

**Setup**: Confirm a group exists whose name is exactly `<script>alert(1)</script>`.

**Steps**:
1. Open popup and type `script` as the query.
2. Observe the result row for the malicious-name group.
3. Verify no alert dialog appears.
4. Right-click → Inspect the result row — confirm the name text is a `textContent` node, not parsed HTML.

**Expected**:
- Group name `<script>alert(1)</script>` appears as literal text.
- No script executes (no alert dialog, no console execution error).
- DevTools DOM shows the name as a text node, not parsed HTML tags.
- `<mark>` highlight wrapping (on `script` substring) wraps literal characters via safe DOM splitting (`shared/highlight.js`), never via `innerHTML`.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-14: C-11 verification — popup-lifecycle message ordering (AC14 · D-7)

**Note**: B-023 is a navigational popup. If the R2 design includes any SW-side write triggered at drill-in or navigation time (e.g., jump-count tracking, recency append, or "last-visited group" write), this case verifies the C-11 invariant: write messages are dispatched BEFORE any focus-shifting API call. If the final design confirms no SW writes on navigation, mark this case SKIP with a note.

**Setup**: If B-023 tracks any persistent state (e.g., group jump recency): open popup, drill into a group, confirm the group is focused or navigated to.

**Steps**:
1. Open popup; drill into a group (or select a group item that triggers navigation per D-3 resolution).
2. Observe: popup closes (expected if navigation shifts focus).
3. Open DevTools → Application → Storage — check for any new write in the expected partition.
4. Re-open popup or refresh: confirm the write persisted.

**Expected** (if writes exist):
- Any write (e.g., jump-recency) is persisted correctly across popup close.
- No writes dropped due to popup teardown ordering (the D-UAT-3 class race is closed by C-11 compliance).
- Fire-and-forget `chrome.runtime.sendMessage` for writes is dispatched BEFORE any `chrome.tabs.update` / `chrome.windows.update` / focus-shifting call.

**Expected** (if no writes): mark SKIP with note "no SW writes on navigate in B-023 per R2 design."

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-15: Cold-start and recovery (AC13-f · SW resilience)

**Setup**: Open the group-jump popup. With popup open, force-kill the service worker via DevTools (`edge://extensions` → service worker inspect → pause and then resume, or close and reopen the inspect panel to trigger teardown).

**Steps**:
1. After SW is terminated, type a character in the popup query input.
2. Observe: does the popup freeze? Does it surface an error? Does it recover?

**Expected**:
- Popup does not freeze or blank.
- Recovery within ≤ 2 s: next user action re-wakes SW; existing UI remains interactive or gracefully degrades.
- If re-fetch is triggered on SW re-wake: group list re-renders from fresh data without user intervention.
- No uncaught JS exceptions visible in popup or SW console.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

## UAT Summary

| # | Description | Status |
|---|-------------|--------|
| UAT-1 | Shortcut open (Alt+K) from plain tab | |
| UAT-2 | Shortcut open from edge:// internal page | |
| UAT-3 | Mode-toggle from quick-search popup | |
| UAT-4 | Empty query — full group list default | |
| UAT-5 | Fuzzy filter + match highlighting | |
| UAT-6 | Arrow-key navigation + wrap | |
| UAT-7 | Enter drills into group — contents view | |
| UAT-8 | Back action returns to group list | |
| UAT-9 | Escape behaviour (close vs back per D-4) | |
| UAT-10 | Empty-state matrix (7 sub-cases) | |
| UAT-11 | Perf probe 50+ groups, typing latency | |
| UAT-12 | Accessibility keyboard-only + screen reader | |
| UAT-13 | XSS probe malicious group name | |
| UAT-14 | C-11 popup-lifecycle message ordering | |
| UAT-15 | Cold-start + recovery | |

**Overall UAT status**: PENDING — to be completed by [test-engineer] at R5.
