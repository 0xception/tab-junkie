# UAT — B-035 Standalone Window Display Mode

Sprint 28 · Full tier (M) · Round 1 UAT plan (authored at R1 per Sprint 22 retro HIGH-2)

Related artefacts:
- `docs/BACKLOG.md` — B-035 row (~18 acceptance criteria)
- `docs/SPRINT.md` — B-035 R1 decisions (D-1..D-8)
- `tests/b035-standalone-window.test.js` — automated unit + integration tests
- `docs/design/NN-b-035-standalone-window.md` — R6 close chapter (created at R6)
- `docs/design/39-b-022-quick-search-popup.md` — B-022 popup-surface patterns (C-11 precedent)
- `docs/design/40-b-023-group-jump-popup.md` — B-023 popup-surface patterns + C-11 application
- `background/service-worker.js` — `open-junkie-window` command listener
- `manifest.json` — `open-junkie-window` at Alt+Shift+J

## Setup

1. Reload the extension in Edge (`edge://extensions` → Tab Junkie → reload icon).
2. Ensure ≥ 5 groups exist with ≥ 2 items each. Include one empty group for empty-state coverage.
3. Leave DevTools open on the background service worker (`edge://extensions` → Inspect views → service worker) for console monitoring throughout all tests.
4. Keep `edge://extensions/shortcuts` open in another tab for shortcut reference.
5. Have the side panel open in at least one test window for state-sync cases (UAT-4).
6. For UAT-6 (secondary monitor): only execute if a second monitor is attached; otherwise SKIP.
7. Close any existing standalone Tab Junkie windows before each test case unless the test specifically requires a pre-existing window.

Legend: **PASS** = behaviour matches expected · **FAIL** = deviation · **WARN** = correct but surfaced a concern · **SKIP** = unable to execute.

---

## Test Cases

### UAT-1: Fresh profile — Alt+Shift+J opens standalone window (AC1 · AC5 · AC6)

**Setup**: No standalone Tab Junkie window is open. Ensure ≥ 5 groups exist.

**Steps**:
1. Press `Alt+Shift+J` from any http/https tab.
2. Observe whether a standalone window opens (type: popup, no address bar).
3. Verify window dimensions are sensible (approximately 1200×800 or as R2 specifies).
4. Verify window is positioned relative to the active browser window (not off-screen).
5. Check DevTools service worker console — no errors.

**Expected**:
- Standalone window opens within 300 ms of keypress.
- Window renders sidepanel content (groups and items visible).
- Window type is `popup` (no tab bar, no URL/address bar).
- Initial size is approximately 1200×800; position is on the active monitor, not off-screen.
- No errors in the service worker console.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-2: Standalone already open — Alt+Shift+J focuses existing, no duplicate (AC2 · AC3)

**Setup**: A standalone Tab Junkie window is already open and visible on-screen.

**Steps**:
1. Click into a different browser window so the standalone window is not focused.
2. Press `Alt+Shift+J`.
3. Observe whether a new window opens or the existing standalone window gains focus.
4. Count the number of Tab Junkie standalone windows open after the keypress.
5. Check DevTools service worker console — no errors, no `chrome.windows.create` call.

**Expected**:
- Exactly ONE standalone Tab Junkie window remains open (no duplicate created).
- The existing window receives focus (`chrome.windows.update({focused: true})`).
- No errors in the service worker console.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-3: Standalone visually matches sidepanel (AC8 · AC9)

**Setup**: Side panel is open. Standalone window is opened via Alt+Shift+J.

**Steps**:
1. Compare the group list, item list, and visual layout between the sidepanel and the standalone window.
2. Verify drag-and-drop is functional in the standalone window (drag an item within a group).
3. Right-click an item in the standalone window — verify context menu appears.
4. Right-click a group header in the standalone window — verify context menu appears.

**Expected**:
- Same groups and items visible in both surfaces.
- Same visual layout (no misaligned elements, no missing icons).
- Drag-and-drop works as in the sidepanel.
- Context menus appear and function correctly.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-4: State sync — edit in sidepanel reflects in standalone within seconds (AC10)

**Setup**: Both the sidepanel and standalone window are open.

**Steps**:
1. In the sidepanel, rename a group (or move an item to a different group).
2. Observe the standalone window within 3 seconds.
3. Reverse the action in the standalone window; observe the sidepanel.

**Expected**:
- Changes made in the sidepanel appear in the standalone window within ~1–3 seconds (no manual refresh required).
- Changes made in the standalone window appear in the sidepanel within ~1–3 seconds.
- No duplicate entries or stale data visible in either surface.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-5: Close standalone — SW state cleared; reopen opens fresh window (AC11 · AC12)

**Setup**: Standalone window is open.

**Steps**:
1. Close the standalone window via the window's close button (X).
2. Check DevTools service worker console — confirm any tracked window-id state is cleared.
3. Press `Alt+Shift+J` again.
4. Verify a new standalone window opens (not a focus of a ghost/closed window).

**Expected**:
- After close, no SW in-memory tracking of the closed window id persists (or storage entry is cleared).
- Alt+Shift+J after close opens a fresh standalone window without error.
- No errors in the service worker console during close or reopen.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-6: Secondary monitor — window opens on active monitor; resizable (AC6 · AC7)

**Setup**: Two monitors attached. Active browser window is on the secondary monitor.

**Steps**:
1. Move the active browser window to the secondary monitor.
2. Press `Alt+Shift+J`.
3. Observe which monitor the standalone window appears on.
4. Resize the standalone window manually.

**Expected**:
- Standalone window opens on the same monitor as the active browser window (not always on the primary monitor).
- Window is user-resizable (drag edges/corners changes dimensions).
- No errors in the service worker console.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-7: SW cold-start mid-window-session — window recovers on next action (AC13 · AC14)

**Setup**: Standalone window is open.

**Steps**:
1. In `edge://extensions`, click the service worker "Inspect" link, then close the SW DevTools to trigger a natural SW shutdown (or wait ~30 s of inactivity).
2. In the standalone window, perform any action (expand a group, scroll, or interact with an item).
3. Observe whether the window recovers gracefully (re-hydrates from storage).
4. Press `Alt+Shift+J` again — verify focus-existing path still works after cold-start recovery.

**Expected**:
- After SW cold-start, interacting with the standalone window does not produce unhandled errors.
- The window re-hydrates from `chrome.storage.local` and displays correct content.
- Alt+Shift+J after cold-start correctly finds the still-open standalone window and focuses it (D-3 option (c) — `chrome.windows.getAll` + URL match is cold-start safe).
- No errors in the service worker console after recovery.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-8: Context menu B-063 verification — menu closes on window.blur (AC15)

**Setup**: Standalone window is open. At least one item with a context menu is visible.

**Steps**:
1. Right-click an item in the standalone window to open its context menu.
2. Press `Alt+Tab` to switch focus to a different window (or click outside the standalone window).
3. Observe whether the context menu closes on `window.blur`.
4. Return focus to the standalone window — verify normal operation resumes.

**Expected**:
- Context menu closes when the standalone window loses focus (same behavior as sidepanel per B-063 forward checklist).
- No stale menu remains visible after Alt+Tab.
- No errors in the service worker console.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9: Perf probe — first paint < 300 ms P95 over 5 opens (AC16)

**Setup**: Standalone window is NOT open. ≥ 10 groups with ≥ 3 items each loaded in storage.

**Steps**:
1. Open DevTools Performance tab in a regular window (for rough timing reference).
2. Press `Alt+Shift+J` — observe or timestamp window appearance.
3. Close the standalone window.
4. Repeat steps 2–3 five times, noting each open latency subjectively (or via DevTools).

**Expected**:
- All 5 opens feel near-instantaneous (sub-300 ms).
- No single open takes noticeably longer than the others (no cold-start outlier).
- No errors across all 5 opens.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-10: Keyboard navigation — Tab/Shift+Tab cycles in standalone, parity with sidepanel (AC17)

**Setup**: Standalone window is open with ≥ 3 groups visible.

**Steps**:
1. Click into the standalone window to focus it.
2. Press `Tab` repeatedly — observe focus ring movement through interactive elements.
3. Press `Shift+Tab` to reverse.
4. Press `Enter` on a focused item — verify it activates (navigates to tab or opens bookmark).
5. Compare keyboard behavior with the sidepanel.

**Expected**:
- Focus ring is visible on all interactive elements (buttons, items, group headers).
- Tab order is logical (top-to-bottom, left-to-right within groups).
- Enter activates the focused item.
- Keyboard behavior matches sidepanel parity.
- No focus traps (Tab cycles through all elements without getting stuck).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-11: Accessibility — ARIA roles and visible focus parity with sidepanel (AC18)

**Setup**: Standalone window is open.

**Steps**:
1. Open DevTools → Elements → inspect group list container — verify `role="tree"` or `role="list"` is present.
2. Inspect individual items — verify `role="treeitem"` or `role="listitem"` with `aria-label` where applicable.
3. Enable high-contrast mode in OS settings — verify text remains readable (color contrast ≥ WCOG AA).
4. (Optional) Run axe-core via DevTools extension or browser built-in accessibility checker.

**Expected**:
- ARIA roles on tree/list structure match sidepanel markup.
- Focus indicators are visible at 200% zoom.
- No critical axe-core violations (WCAG AA).
- No accessibility regressions compared to sidepanel.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-12: Concurrent usage — popup (Alt+J) + standalone (Alt+Shift+J) both work independently (AC19)

**Setup**: No Tab Junkie surfaces open.

**Steps**:
1. Press `Alt+Shift+J` — standalone window opens.
2. Press `Alt+J` — quick-search popup opens.
3. Interact with each independently (search in popup, scroll in standalone).
4. Close the popup (Escape or click away).
5. Verify the standalone window is unaffected.
6. Repeat Alt+J — popup opens again without issue.

**Expected**:
- Both surfaces open and operate independently without interfering with each other.
- Closing the popup does not close or disturb the standalone window.
- SW console shows no errors during concurrent operation.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-13: Empty profile — standalone opens with sidepanel empty-states (AC20 · C-9)

**Setup**: Use a fresh browser profile with no bookmarks saved in Tab Junkie (or clear `chrome.storage.local` via DevTools → Application → Storage → Clear).

**Steps**:
1. Press `Alt+Shift+J`.
2. Observe the standalone window content.
3. Verify the empty-state UI (icon + message + CTA) is shown, not a blank window or spinner.

**Expected**:
- Standalone window opens successfully.
- Empty-state UI renders: icon, "No groups yet" (or equivalent) message, and a prominent CTA.
- No errors in the service worker console.
- Window dimensions and position are correct even with empty content.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

## Sign-Off

| Item | Status |
|------|--------|
| UAT-1 | [ ] |
| UAT-2 | [ ] |
| UAT-3 | [ ] |
| UAT-4 | [ ] |
| UAT-5 | [ ] |
| UAT-6 | [ ] |
| UAT-7 | [ ] |
| UAT-8 | [ ] |
| UAT-9 | [ ] |
| UAT-10 | [ ] |
| UAT-11 | [ ] |
| UAT-12 | [ ] |
| UAT-13 | [ ] |

**UAT Engineer**: [test-engineer]
**Sprint**: 28
**Date completed**: ___________
**Overall status**: [ ] PASS / [ ] FAIL (all core flows must be PASS to close sprint item)
