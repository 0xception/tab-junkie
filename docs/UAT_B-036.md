# UAT — B-036 New Tab Page Replacement

Sprint 29 · Full tier (L) · R5 UAT plan (authored by [test-engineer])

Related artefacts:
- `docs/BACKLOG.md` — B-036 row (23 acceptance criteria)
- `docs/SPRINT.md` — B-036 R2 decisions (D-1..D-7)
- `docs/design/42-b-036-newtab-page.md` — R2 chapter (C-1..C-11 + §42.5.1 C-9 empty-state matrix)
- `tests/b036-newtab.test.js` — 41 automated tests (R5 gap-fills included)
- `newtab/newtab.html`, `newtab/newtab.js`, `newtab/newtab.css`, `newtab/theme-init.js`
- `manifest.json` — `chrome_url_overrides.newtab` unchanged; permissions unchanged

## Preconditions

1. Extension loaded unpacked from `feature/sprint-29-newtab-prefs` branch (via `edge://extensions` → "Load unpacked" → repo root).
2. Edge is the primary target browser; Chrome is secondary (execute UAT-1..UAT-23 in Edge first; re-run UAT-1, UAT-2, UAT-4, UAT-13, UAT-15, UAT-17 in Chrome as a spot check).
3. Have the side panel open in at least one window.
4. Leave DevTools open on the background service worker (`edge://extensions` → Tab Junkie → "Inspect views: service worker") and a second DevTools window on the new tab itself.
5. For any case that depends on preferences state, check `chrome.storage.local.get('tj:prefs')` in the SW console first.

## Setup — enabling the new tab override

B-036's newtab grid is OFF by default (opt-in via `newTabOverride`). Because B-039 (the Settings toggle UI) ships in Wave 1 of the same sprint, pick one of the following paths:

- **Option A (preferred)**: after B-039 R3 lands, open Settings dialog → flip "Replace the new tab page" toggle ON. Any new tab picks up the change immediately.
- **Option B (early-test before B-039 ships)**: paste the following into the SW DevTools console, then open a fresh new tab:
  ```js
  chrome.storage.local.get('tj:prefs').then(o => {
    const p = { ...(o['tj:prefs'] || {}), newTabOverride: true };
    return chrome.storage.local.set({ 'tj:prefs': p });
  }).then(() => console.log('newTabOverride = true'));
  ```
  To disable again:
  ```js
  chrome.storage.local.get('tj:prefs').then(o => {
    const p = { ...(o['tj:prefs'] || {}), newTabOverride: false };
    return chrome.storage.local.set({ 'tj:prefs': p });
  });
  ```

Have fixture data ready: at minimum 5 groups with 6-10 items each (covers AC6 ordering + AC8 indicators). For perf cases (UAT-1, UAT-21, UAT-22) seed 500–1000 items via Settings → Import OR via the SW console seed helper documented in `docs/user-manual/`.

Legend: **PASS** = behaviour matches expected · **FAIL** = deviation · **WARN** = correct but surfaced a concern · **SKIP** = unable to execute.

---

## Test Cases

### UAT-1: First paint at 500 items feels instant (AC3 · AC4 · AC17) · Priority: H

**Setup**: `newTabOverride: true`. Import a 500-item fixture via Settings (or seed via SW console).

**Steps**:
1. Close any existing new tabs.
2. Open DevTools Performance panel on a throwaway tab (for a rough timestamp reference).
3. Press `Ctrl+T` (Cmd+T on macOS) to open a new tab.
4. Observe: (a) is there any white flash before the grid appears? (b) is a skeleton visible momentarily, or does the grid appear in one shot? (c) does the page feel snappy?
5. Repeat steps 1–4 five times back-to-back.

**Expected**:
- New tab shows the Tab Junkie grid (not `about:blank`, not Edge/Chrome default).
- All 5 opens feel near-instant — subjectively < 200 ms from Ctrl+T to grid visible.
- Skeleton (grey placeholder shapes) either flashes briefly (cold start) or is invisible (warm), but never a blank white page longer than a frame.
- No errors in either the SW console or the new-tab DevTools console.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-2: Grid structure — groups in correct order with item counts + favicons (AC6 · AC8 · AC21) · Priority: B

**Setup**: `newTabOverride: true`. At least 3 groups with mixed items (some with favicons, some without).

**Steps**:
1. Open a new tab.
2. Visually compare the grid's group order + item counts to the side panel.
3. For each group header, verify the count badge matches the number of items inside.
4. Spot-check 3–5 items: favicons render correctly where the URL is http(s); letter-avatar fallback where no favicon or unsafe scheme.

**Expected**:
- Group sections appear in the same order as in the side panel (ascending `sortOrder`).
- Count badge text matches visible item count per group.
- Favicons render for http(s) items; letter-avatar fallback otherwise.
- No broken image icons, no layout shift when favicons load asynchronously.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-3: Live / active / drifted indicators render correctly (AC8) · Priority: B

**Setup**: `newTabOverride: true`. Open at least one saved bookmark in a second tab so the side panel shows a live indicator for it. Drift an item by editing its URL in the side panel without closing the browser tab.

**Steps**:
1. Open a fresh new tab.
2. Locate the saved bookmark that has a matching open tab — verify the "live" indicator dot is visible and tinted with the same token as in the side panel.
3. Make the bookmarked tab the active tab in its window (without closing the new tab). Return to the new tab; verify the "active" indicator appears on the same row.
4. Locate the drifted bookmark — verify the "drifted" indicator dot is visible.
5. Hover or focus a row with an indicator — the `aria-label` (via DevTools inspector) should contain the state word (e.g., "currently open", "currently active", "drifted").

**Expected**:
- Live, active, and drifted indicators visible on the expected rows.
- Visual styling matches the side panel (same dot colour / size).
- `aria-label` includes the state descriptor for screen readers.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-4: Click an item → activates existing tab OR opens new (AC10 · C-11) · Priority: B

**Setup**: `newTabOverride: true`. Have one bookmarked URL open in another tab; have another bookmarked URL not currently open anywhere.

**Steps**:
1. Open a fresh new tab.
2. Click the row for the URL that is already open — the browser should switch to that existing tab (not open a duplicate).
3. Open another new tab. Click the row for the URL that is not open — the browser should navigate the new tab to that URL.
4. Open another new tab. Click a row and IMMEDIATELY throw focus back to the side panel (Alt+Tab) — the navigate must still succeed even if the new tab closes mid-click. Check SW console: `MSG_NAVIGATE_TO_ITEM` received + processed.

**Expected**:
- Click on a live row activates the existing tab (no duplicate).
- Click on a non-live row navigates the new tab to the URL.
- C-11 guardrail: `MSG_NAVIGATE_TO_ITEM` dispatches synchronously without `await`; navigation succeeds even if focus leaves the new tab immediately after the click.
- No console errors on any click.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-5: Keyboard-only navigation — `/` or Tab focuses search, Enter activates rows (AC11 · AC19 · AC20) · Priority: H

**Setup**: `newTabOverride: true`. Have at least 3 groups with 3+ items each.

**Steps**:
1. Open a fresh new tab. Do not touch the mouse.
2. Confirm focus is on the web-search input (cursor blinking, visible focus ring).
3. Press `Tab` repeatedly and observe: focus should move web-search input → (web-search submit button if present) → filter input → first bookmark row → subsequent rows in DOM order → next group's rows, etc.
4. `Shift+Tab` to reverse.
5. On a focused bookmark row, press `Enter` — the row should activate (same as click).
6. On the filter input, press `Escape` — filter should clear.
7. Ensure no element traps focus (Tab eventually cycles around).

**Expected**:
- Focus lands on the web-search input on page open.
- Tab order is logical (top → down, left → right inside each group).
- Enter on a row navigates or activates the correct tab.
- Escape on filter input clears the filter.
- Every interactive element has a clearly visible focus ring in both themes.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-6: Filter input narrows results with highlighted matches (AC7 · AC14) · Priority: B

**Setup**: `newTabOverride: true`. Mixed fixture of ≥ 20 items with 3-4 items whose titles include the string "demo".

**Steps**:
1. Open a fresh new tab.
2. Focus the filter input (click or `Tab` to it).
3. Type "demo" slowly (one character at a time).
4. Observe: does the grid narrow only AFTER a 200 ms pause (debounce)? Do the matches show `<mark>`-highlighted spans around the substring?
5. Delete the query — all rows should return.
6. Type a nonsense string (e.g., "qxzzzz") — verify the "No matches for qxzzzz" state with a "Clear filter" button.
7. Click Clear filter — all rows return.

**Expected**:
- Filter narrows within ~200 ms of the last keystroke, not immediately per keystroke.
- `<mark>` highlights the substring within each matching row's title (and URL if matched there).
- "No matches" empty state appears for zero-match queries with a working Clear CTA.
- No visual flicker during typing.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-7: Web search submit → `chrome.search.query` opens results (AC5) · Priority: B

**Setup**: `newTabOverride: true`. Ensure Edge has a default search engine configured.

**Steps**:
1. Open a fresh new tab.
2. Focus the web-search input.
3. Type `tab junkie extension` and press `Enter`.
4. Observe: does a new tab open with the results page from the default search engine?
5. Return to the newtab; type `chrome.search.query test` and click the submit button (if present).

**Expected**:
- Enter submits the query; browser opens the search engine's results page in a new tab (disposition NEW_TAB).
- Submit button triggers the same behaviour.
- The newtab itself is unchanged after submit (not navigated away from).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-8: Empty / whitespace-only web-search submit is a no-op (AC5 · AC15) · Priority: M

**Setup**: `newTabOverride: true`.

**Steps**:
1. Open a fresh new tab.
2. Focus the web-search input. Leave it empty. Press `Enter`.
3. Observe — no new tab should open.
4. Type only spaces (`   `) and press `Enter`.
5. Check SW console — no `chrome.search.query` call fired.

**Expected**:
- Empty submit: no-op.
- Whitespace-only submit: no-op.
- No errors, no navigation.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9a: Empty state — zero items + zero groups (AC12 · §42.5.1 (a)) · Priority: H

**Setup**: Fresh profile, or clear `chrome.storage.local` via DevTools → Application → Storage → Clear. Keep `newTabOverride: true`.

**Steps**:
1. Open a new tab.
2. Observe the grid area — should show icon + "No bookmarks yet" + CTA "Open the side panel…".
3. Click the CTA — the side panel should open.

**Expected**:
- Empty state UI visible (not a blank screen, not a spinner).
- CTA functional — opens the side panel via `chrome.sidePanel.open`.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9b: Empty state — zero groups with items present → "Ungrouped" section (AC13 · §42.5.1 (b)) · Priority: M

**Setup**: `newTabOverride: true`. Seed a handful of items with `groupId: null` and delete all groups. (Use side panel to remove groups; items survive as ungrouped.)

**Steps**:
1. Open a new tab.
2. Verify a single section titled "Ungrouped" renders with all the items.
3. Verify items sort by `sortOrder` within the section.

**Expected**:
- Single "Ungrouped" section visible.
- All ungrouped items present, sorted correctly.
- No blank area where groups would be.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9c: Filter matches zero items → "No matches" empty state (AC14 · §42.5.1 (c)) · Priority: H

Covered in UAT-6 step 6. Re-execute here only if UAT-6 was skipped.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9d: Partial web-search input (< submit) → grid stable (AC15 · §42.5.1 (d)) · Priority: M

**Setup**: `newTabOverride: true`.

**Steps**:
1. Open a new tab.
2. Type 1–2 characters in the WEB-SEARCH input (NOT the filter input). Do NOT press Enter.
3. Observe the grid — it must remain unchanged (partial search input does not narrow bookmarks).
4. Check SW console — no extra messages fired.

**Expected**:
- Grid unchanged during partial web-search typing.
- Zero messages to SW from the web-search input before submit.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9e: Bootstrap error state (AC16 · §42.5.1 (g)) · Priority: H

**Setup**: `newTabOverride: true`. To simulate a broken SW, either: (a) re-load the extension with a deliberate throw in the `MSG_LIST_ITEMS` handler (developer-only); or (b) unregister/reload the SW while the new-tab JS is mid-fetch (best-effort).

**Steps**:
1. Trigger the broken SW state.
2. Open a new tab.
3. Observe — should show error icon + "Something went wrong — try reloading" + a Reload button.
4. Open the new-tab DevTools console — a single `[B-036] bootstrap failed:` warn should be visible with the underlying error object.
5. Click Reload — page reloads via `window.location.reload()`.
6. Restore the SW and verify the newtab recovers on next open.

**Expected**:
- Error state visible (not blank, not silent).
- Reload button functional.
- `console.warn` breadcrumb visible for dev diagnostics with both message and error object.
- No unhandled promise rejection in the console.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9f: Preferences OFF → redirect to `about:blank` (AC2 · §42.5.1 (e)) · Priority: B

**Setup**: Flip the preference back OFF: `newTabOverride: false` (via B-039 Settings toggle OR via the SW console command in the Setup section).

**Steps**:
1. Open a new tab (Ctrl+T).
2. Observe: the tab should redirect immediately to `about:blank`.
3. Verify no flash of the Tab Junkie grid before the redirect.
4. Check SW console — only `MSG_GET_PREFERENCES` fired, no `MSG_LIST_ITEMS` or `MSG_LIST_GROUPS`.

**Expected**:
- New tabs open on `about:blank` when the toggle is OFF.
- No grid flash; no blank white flash longer than one frame.
- No unnecessary storage reads beyond the pref check.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9g: SW disconnect mid-session → grid stays rendered (§42.5.1 (g) · QA-flagged) · Priority: H

**Setup**: `newTabOverride: true`. Have a populated grid already rendered in an open new tab. Trigger an SW shutdown — either by clicking "Inspect views: service worker" then closing the SW DevTools window (triggers natural teardown), or by manually reloading the extension from `edge://extensions`.

**Steps**:
1. Leave the new tab open and visible during SW teardown.
2. In the side panel (also open), make a small change — rename a group, add an item, etc. — which broadcasts `MSG_STATE_CHANGED` → items scope.
3. Observe the new tab during and after the SW restart.
4. After SW comes back up, trigger another change in the side panel — verify the new tab picks up the new state.
5. Check the new-tab DevTools console — no unhandled rejections. At most one `[B-036] broadcast handler failed:` warn entry.

**Expected**:
- During SW teardown: the new-tab grid stays rendered with the last-known state (stale, not wiped). No empty state, no error state.
- After SW restart: subsequent broadcasts successfully refetch and update the grid.
- No blank flash, no UI reset.
- At most one warn breadcrumb per disconnect event.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9h: Cold-start SW → skeleton shown, then replaced (AC4 · AC23 · §42.5.1 (f)) · Priority: H

**Setup**: `newTabOverride: true`. Ensure the SW has been idle ≥ 30s (or reload the extension to force cold start).

**Steps**:
1. Reload the extension from `edge://extensions` (forces SW teardown).
2. Wait 5 s (ensures SW has had a chance to fully terminate).
3. Open a new tab.
4. Observe the first frame: skeleton placeholders (grey shapes) should be visible briefly.
5. Observe the transition: skeleton → grid, atomic (no intermediate empty state, no error state).

**Expected**:
- Skeleton visible for the cold-start latency (~100–300 ms typical).
- Skeleton replaced by grid on SW resolution; no error state.
- No blank white page.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-10: Open a bookmark → state updates across all newtab instances (AC9 · MSG_STATE_CHANGED) · Priority: H

**Setup**: `newTabOverride: true`. Open TWO new tabs showing the grid.

**Steps**:
1. In a third browser window, open one of the bookmarked URLs.
2. Return to each of the two newtab instances within ~3 s.
3. Verify the "live" indicator now appears for that bookmark in BOTH instances.
4. Close that URL's tab. Verify the "live" indicator disappears from BOTH instances within ~3 s.

**Expected**:
- Indicator changes propagate to every open newtab instance.
- Latency < 3 s typical.
- No need to refresh any instance manually.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-11: Close tab → drifted indicator updates (AC8 · AC9) · Priority: M

**Setup**: `newTabOverride: true`. Have a drifted item (URL edited in side panel without closing the matching tab).

**Steps**:
1. Verify drifted indicator is visible on the row.
2. Close the drifted tab.
3. Within ~3 s, observe the newtab: drifted indicator state should update (may disappear or persist depending on drift-record semantics — consult the side panel for the expected state).

**Expected**:
- Drift indicator state on the newtab matches the side panel's state for that row after the broadcast settles.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-12: Rename item in sidepanel → newtab row reflects via broadcast (AC9) · Priority: M

**Setup**: `newTabOverride: true`. Side panel open.

**Steps**:
1. Pick any item visible in both the sidepanel and an open newtab.
2. Rename the item in the sidepanel (e.g., append " — renamed").
3. Within ~3 s, observe the newtab row title.

**Expected**:
- Item title on the newtab updates to the new title without a manual refresh.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-13: Accessibility — screen reader announces grid structure correctly (AC19 · QA-1 · QA-2 · QA-3) · Priority: H

**Setup**: `newTabOverride: true`. Enable a screen reader — VoiceOver on macOS (Cmd+F5) or Narrator on Windows/Edge (Ctrl+Win+Enter) or NVDA. Have ≥ 2 groups with items.

**Steps**:
1. Open a new tab.
2. Navigate the page with screen-reader-specific keys (VO+arrow keys on macOS, etc.).
3. Verify each group header announces as a heading with the group name.
4. Verify the item count badge announces as "N items" (not just "N").
5. Verify each row announces as a button with title + URL + (if applicable) live/active/drifted state.
6. Verify the grid container does NOT continually announce rows as `aria-live` events during a full render (QA-1 fix).
7. Verify the filter-empty state and error state DO announce when they appear (aria-live="polite" / role="alert").

**Expected**:
- Group headers: heading + name.
- Count badge: "<N> items" pronounced.
- Rows: button role with composed `aria-label`.
- No flood of live-region announcements during render.
- Filter-empty + error states auto-announce.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-14: Accessibility — full session without mouse (AC11 · AC20) · Priority: H

**Setup**: `newTabOverride: true`. Disconnect or ignore the mouse/trackpad.

**Steps**:
1. Open a new tab. All subsequent interaction is keyboard only.
2. Submit a web search via the search input.
3. Return to a newtab. Filter for a specific bookmark via the filter input.
4. Tab to a row and press Enter to activate.
5. Verify every action completed without needing the mouse.

**Expected**:
- Complete end-to-end session is keyboard-accessible.
- Focus is always visible on an expected element.
- No dead-ends or focus traps.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-15: Focus indicators visible in light + dark themes (AC20) · Priority: M

**Setup**: `newTabOverride: true`.

**Steps**:
1. Set theme to light (via side panel theme switch OR system preference).
2. Open a new tab. Tab to each interactive element; confirm a clear visible focus ring on each.
3. Repeat with dark theme.
4. Spot-check contrast with DevTools inspector "Accessibility → Contrast" on the focused-state outline colour.

**Expected**:
- Focus ring is visible on every interactive element in both themes.
- Contrast meets WCAG AA (> 3:1 for the outline against adjacent surfaces).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-16: WCAG AA contrast check — light theme (AC20) · Priority: M

**Setup**: `newTabOverride: true`. Light theme active.

**Steps**:
1. Open DevTools → Lighthouse tab → Run an Accessibility audit on the newtab page.
2. Spot-check text contrast on: group header, item title, item URL (muted), indicator dots, focus ring.
3. Use DevTools "Inspect → Accessibility → Contrast" on at least 5 text elements.

**Expected**:
- Lighthouse Accessibility score ≥ 95 (aim for 100).
- No critical contrast violations.
- Normal text ≥ 4.5:1; large text ≥ 3:1.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-17: WCAG AA contrast check — dark theme (AC20) · Priority: M

**Setup**: `newTabOverride: true`. Dark theme active.

Repeat UAT-16 steps for the dark theme.

**Expected**: Same thresholds as UAT-16.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-18: Light theme visual parity with sidepanel (AC21) · Priority: M

**Setup**: `newTabOverride: true`. Light theme active. Side panel open alongside.

**Steps**:
1. Open a new tab next to the side panel.
2. Compare background colour, text colour, accent colour, border colour, muted text colour between the two surfaces.
3. Look for any mismatched or unthemed element (hard-coded `#...` colours would stand out).

**Expected**:
- Newtab and sidepanel use the same CSS custom property tokens throughout; no mismatched colours.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-19: Dark theme visual parity with sidepanel (AC21) · Priority: M

Repeat UAT-18 in dark theme.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-20: System-theme auto-switch works (AC21) · Priority: M

**Setup**: `newTabOverride: true`. Theme set to "follow system" (if theme preference supports it — else SKIP).

**Steps**:
1. Open a new tab in light mode.
2. Toggle OS theme preference from light to dark (macOS System Settings → Appearance; Windows Settings → Personalisation → Colours).
3. Observe the already-open newtab: does it re-render in the new theme, or does it require a page reload?
4. If reload required: open a fresh new tab; verify it opens in the current system theme.

**Expected**:
- Either live auto-switch OR a clean reload-based switch. A stale mismatch (light content in a dark OS theme) is a WARN.
- No layout breakage after the switch.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-21: Filter response on 1000-item fixture — feels snappy (AC18) · Priority: H

**Setup**: `newTabOverride: true`. Seed a 1000-item fixture.

**Steps**:
1. Open a new tab. Wait for the grid to fully render.
2. Focus the filter input.
3. Type a multi-character query at normal speed (e.g., "proj" then "project" then "project-alpha").
4. Subjectively assess: does each post-debounce narrowing feel near-instant (< 50 ms)? Any visible stutter or jank?
5. Open DevTools Performance panel, record a 5-second profile while typing — look for long tasks.

**Expected**:
- Each filter application completes within the 200 ms debounce + < 50 ms execution budget.
- No visible stutter, no long tasks > 50 ms during typing.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-22: Scroll performance on 500-item grid — 60 FPS, no jank (AC17) · Priority: M

**Setup**: `newTabOverride: true`. 500-item fixture loaded.

**Steps**:
1. Open DevTools → Rendering → enable "Paint flashing" and "Frame rendering stats".
2. Open a new tab. Wait for the grid.
3. Scroll up and down rapidly with the mouse wheel / trackpad.
4. Observe frame rate stat overlay and visible paint flashing.

**Expected**:
- Frame rate stays close to 60 FPS during scroll.
- No excessive paint flashing (ideally only the newly-scrolled rows repaint).
- No layout shift during scroll.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-23: Rapid filter typing + broadcast mid-filter — no flicker or stale state (§42.3 D-7 · MEDIUM-5) · Priority: M

**Setup**: `newTabOverride: true`. 100+ item fixture. Side panel open.

**Steps**:
1. Open a new tab.
2. Start typing rapidly in the filter input (e.g., "p", "pr", "pro", "proj", "projec", "project").
3. While still typing, make a change in the side panel that broadcasts `MSG_STATE_CHANGED` (e.g., rename a group).
4. Observe the newtab: no visible flicker, no stale filter result, no race condition.
5. Let typing settle; verify the filter result is consistent with both the final query AND the post-broadcast items.

**Expected**:
- No flicker between the broadcast-driven refetch and the filter-driven narrowing.
- Final state is consistent (filter query applied to the post-broadcast item list).
- No console errors.
- MEDIUM-5 guard behaviour: overlapping refetches coalesce without duplicate DOM updates.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

## Sign-Off

| Case | Priority | Status |
|------|----------|--------|
| UAT-1 | H | [ ] |
| UAT-2 | B | [ ] |
| UAT-3 | B | [ ] |
| UAT-4 | B | [ ] |
| UAT-5 | H | [ ] |
| UAT-6 | B | [ ] |
| UAT-7 | B | [ ] |
| UAT-8 | M | [ ] |
| UAT-9a | H | [ ] |
| UAT-9b | M | [ ] |
| UAT-9c | H | [ ] |
| UAT-9d | M | [ ] |
| UAT-9e | H | [ ] |
| UAT-9f | B | [ ] |
| UAT-9g | H | [ ] |
| UAT-9h | H | [ ] |
| UAT-10 | H | [ ] |
| UAT-11 | M | [ ] |
| UAT-12 | M | [ ] |
| UAT-13 | H | [ ] |
| UAT-14 | H | [ ] |
| UAT-15 | M | [ ] |
| UAT-16 | M | [ ] |
| UAT-17 | M | [ ] |
| UAT-18 | M | [ ] |
| UAT-19 | M | [ ] |
| UAT-20 | M | [ ] |
| UAT-21 | H | [ ] |
| UAT-22 | M | [ ] |
| UAT-23 | M | [ ] |

**Priority legend**: B = Blocker (any failure blocks sign-off), H = High (≤ 1 failure tolerated with explicit rationale), M = Medium (non-blocking but noted).

**Pass criteria**:
- Zero B (Blocker) fails.
- ≤ 1 H (High) fail with written rationale.
- M (Medium) fails noted but non-blocking.

**UAT Engineer**: [test-engineer]
**Sprint**: 29
**Date completed**: ___________
**Overall status**: [ ] PASS / [ ] FAIL
