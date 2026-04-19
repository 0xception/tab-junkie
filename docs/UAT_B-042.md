# UAT — B-042 Export to HTML (Netscape bookmarks)

Sprint 17 · Full tier (M) · Round 5 UAT plan

Related artefacts:
- `docs/BACKLOG.md` — B-042 row (13 acceptance criteria)
- `docs/SOLUTION_DESIGN.md §32` — R2 design (B-042 + B-043 joint export architecture)
- `docs/SPRINT_FINDINGS.md` — Sprint 17 B-042 code / security / qa-reviewer findings + R4 fix pass (Q-H1 orphan rescue · Q-H2 perf · Q-H3 toast copy)
- `tests/b042-html-export.test.js` — 47 automated test cases (AC2 / AC3 / AC4 / AC7 / AC9 / AC10 / AC11 + M-2 + Q-H1/H2/H3 + Q-4/5/6/7/10/11/12/13 + structural parse regression + indent invariant + live-state privacy regression)

Baseline suite: 799 pass / 0 fail after R5 additions (+3 tests over the post-R4-fix 796 baseline).

## Setup

1. Load the unpacked extension from the repo root.
   - Chrome: `chrome://extensions` → Developer Mode on → "Load unpacked" → select repo root.
   - Edge: `edge://extensions` → Developer Mode on → "Load unpacked" → select repo root.
2. Open the Tab Junkie side panel.
3. Pre-create state the test cases below rely on.
   - Create at least five groups (e.g. `Work`, `Reading`, `Personal`, `Projects`, `Research`).
   - Create one sub-group nested under `Projects` (e.g. `Projects / Tab Junkie`).
   - Save at least 20 bookmarks distributed across the groups.
   - Leave at least one item ungrouped (direct add without choosing a group).
4. Have a fresh (or empty-profile) Chrome installation available for the round-trip import cases.
5. If Firefox is installed, have it available for UAT-4. Otherwise mark UAT-4 as SKIP.

Legend: **PASS** = behaviour matches expected · **FAIL** = deviation from expected · **WARN** = behaves correctly but surfaced a concern · **SKIP** = unable to execute (document why).

## Test Cases

### UAT-1: Happy path — export with 20 items across 5 groups + 1 sub-group (AC1 · AC2 · AC3 · AC5 · AC6 · AC7)

**Setup**: Use the collection from Setup step 3 (20 items + 5 groups + 1 sub-group + ≥1 ungrouped item).

**Steps**:
1. Click the sidepanel header overflow menu (kebab/more button adjacent to `#add-bookmark-btn`).
2. Choose **Export → HTML**.
3. Observe the browser download dialog, let the file save, open the file location.
4. Open the downloaded `.html` file in any text editor (not the browser).

**Expected**:
- Default filename matches `tab-junkie-bookmarks-YYYY-MM-DD.html` with today's **local** date.
- The browser's native Save-As dialog appears (or the file goes straight to Downloads if the user disabled that prompt).
- Exactly one download — no duplicates.
- Toast reads `Exported {N} bookmarks across {M} groups` where N = total saved items and M = non-empty-group count (includes `Ungrouped` folder only if it has items).
- Toast is dismissible (click or Escape) and auto-dismisses after ~4s.
- File begins with `<!DOCTYPE NETSCAPE-Bookmark-file-1>` on line 1.
- File contains `<TITLE>Bookmarks</TITLE>` and `<H1>Bookmarks Menu</H1>`.
- Every top-level group from the sidepanel is present as `<DT><H3 ...>GroupName</H3>` in the same sort order.
- The `Projects / Tab Junkie` sub-group is nested inside the `Projects` folder's `<DL><p>` block.
- Every `<A HREF="...">` anchor carries both `ADD_DATE="<unix-seconds>"` and `LAST_MODIFIED="<unix-seconds>"` (integer — not ms).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-2: Keyboard-only export (AC1 · AC6)
Covers AC1 keyboard-first requirement.

**Steps (keyboard only — do NOT use the mouse)**:
1. Press Tab until the sidepanel overflow-menu button has the focus ring.
2. Press Enter to open the menu.
3. Use Tab / Arrow keys (whichever the menu uses) to move focus to the `Export → HTML` action.
4. Press Enter to activate.

**Expected**:
- Focus ring is visible at every Tab stop.
- Export activates on Enter without the mouse.
- A file downloads as in UAT-1.
- Success toast is announced by a screen reader (role="status" / aria-live="polite") if one is running — WARN if the announcement is inaudible (tracked against a11y follow-on, not a B-042 blocker).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-3: Import the exported file into a fresh Chrome profile (AC2 · AC3)

**Setup**: UAT-1 must have produced an export file. Launch Chrome with a new/empty profile (`chrome --user-data-dir=/tmp/fresh-profile-b042` or via the profile switcher).

**Steps**:
1. In the fresh Chrome profile: open `chrome://bookmarks`.
2. Click the three-dot menu → **Import bookmarks**.
3. Choose **Bookmarks HTML file** and select the file exported in UAT-1.
4. Inspect the resulting bookmark tree.

**Expected**:
- Chrome reports a successful import (no parse-error banner).
- The imported folder tree mirrors Tab Junkie's group tree 1:1: every top-level group becomes a folder; `Projects / Tab Junkie` appears as a sub-folder under `Projects`.
- The virtual `Ungrouped` folder (if it had items) appears as a top-level folder named `Ungrouped`.
- Every bookmark has its original title and URL; no silent drops.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-4: Import the exported file into Firefox (AC2 — cross-browser)

**Setup**: Firefox installed. If unavailable, mark as SKIP.

**Steps**:
1. Open Firefox → **Bookmarks** menu → **Manage bookmarks** (or Ctrl/Cmd+Shift+O).
2. In the Library window: click the import/export icon → **Import Bookmarks from HTML…**.
3. Select the export file from UAT-1.

**Expected**:
- Firefox accepts the file without a parse error.
- The imported folder tree appears under `Bookmarks Menu` (or wherever Firefox places imported bookmarks) and mirrors the Tab Junkie tree.
- Every bookmark has its title and URL preserved.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-5: Empty collection — Export produces a valid empty file (AC2 · AC7)

**Setup**: Start from a profile with zero saved items and zero groups (or delete all items + groups before this test — **DESTRUCTIVE**, do this on a scratch profile or after a backup via UAT-1).

**Steps**:
1. Confirm the sidepanel shows no groups and no items.
2. Trigger Export → HTML.

**Expected**:
- A file still downloads with today's date in the filename.
- Toast reads `Exported 0 bookmarks across 0 groups`.
- File contents are a valid Netscape document — DOCTYPE + header + `<DL><p>` immediately followed by `</DL><p>` (no body entries between them).
- Chrome `chrome://bookmarks` import accepts the empty file without error (nothing is added).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-6: Orphan items land under Ungrouped after a group delete (Q-H1 R4 fix)

**Setup**: Ensure at least one group has ≥2 saved items (e.g. `Work`).

**Steps**:
1. Delete the `Work` group (right-click group header → Delete group → confirm). Confirm its items fall back to `Ungrouped` in the sidepanel.
2. Immediately click Export → HTML (do not reload the sidepanel first).
3. Open the downloaded file in a text editor.

**Expected**:
- Every item that was in `Work` now appears under the `Ungrouped` folder in the exported file.
- No items are silently dropped — the total anchor count matches the item count visible in the sidepanel after the delete.
- Toast `M` count accurately includes Ungrouped in the non-empty-groups total.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-7: XSS probe — malicious title / URL render as literal text (AC10)

**Setup**: Save one bookmark with title `</A><script>alert(1)</script>` and URL `https://safe.example/`.

**Steps**:
1. Click Export → HTML.
2. Open the downloaded file **directly in Chrome** by double-clicking it (so the browser parses the HTML).
3. Observe the rendered page.
4. As a second pass, import the file into a fresh Chrome profile (as in UAT-3) and navigate to the imported bookmark.

**Expected**:
- No `alert(1)` dialog fires at any point (when opening the file, or when re-importing).
- The title renders on-page as literal text `</A><script>alert(1)</script>` (entity-encoded in the HTML source).
- In Chrome's DevTools `View Source` (or a text editor): the file contains `&lt;/A&gt;&lt;script&gt;` — not a literal `<script>` tag.
- In the re-imported bookmark: clicking it opens `https://safe.example/` and nothing else.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-8: Unicode / emoji title round-trips byte-for-byte (Q-4 regression)

**Setup**: Save one bookmark with title `Café 日本語 🚀` and URL `https://unicode.example/`.

**Steps**:
1. Click Export → HTML.
2. Open the downloaded file in a UTF-8-aware editor (VS Code, Sublime, etc.).
3. Search the file for the exact title `Café 日本語 🚀`.
4. Import the file into a fresh Chrome profile (as in UAT-3) and inspect the bookmark title.

**Expected**:
- The title appears verbatim in the exported file — no mojibake, no HTML-entity-encoded code points, no truncation.
- The re-imported bookmark in Chrome shows the title as `Café 日本語 🚀`.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9: Performance — 1000 items export in well under 1 second (AC9)

**Setup**: Seed a 1000-item / 100-group collection. Use one of:
- (a) the dev seed helper if one is wired into the DevTools console for this build;
- (b) automated: `for (let i=0;i<1000;i++) { /* MSG_CREATE_ITEM */ }` via the side panel's debug console;
- (c) import a pre-prepared JSON backup (via a scratch tool) into `tj:items` / `tj:groups` directly through DevTools → Application → Storage if direct seeding is available.

If no seeding path works, mark SKIP and document.

**Steps**:
1. Open DevTools → Performance.
2. Start recording.
3. Click Export → HTML.
4. Stop the recording once the browser download dialog appears.
5. Inspect the recording: measure time from the click event to the `download` event / blob anchor click.

**Expected**:
- Measured time is under ~1000ms (AC9's hard target is 500ms; UAT allows generous jitter budget).
- No main-thread long-task warnings over 200ms during the export.
- Success toast appears normally.
- WARN if the measurement is between 500ms and 1000ms — record the number for the R6 close note so [solution-architect] can note the as-built headroom.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-10: Safe-mode (read-only) export still succeeds (Q-7 regression)

**Setup**: Force the profile into safe mode. The easiest way: DevTools → Application → Storage → `tj:meta` → set `schemaVersion` to a number higher than `KNOWN_VERSION` (e.g. `999`). Reload the sidepanel. The sidepanel should show a safe-mode banner and reject mutation attempts.

**Steps**:
1. Confirm safe mode is active (mutations rejected, banner visible, or schemaVersion above KNOWN_VERSION).
2. Click Export → HTML.

**Expected**:
- The export succeeds even though the extension is read-only.
- File downloads with today's date and correct counts.
- No `ERR_SAFE_MODE` error surfaces to the user.
- After the test: reset `schemaVersion` back to `KNOWN_VERSION` to exit safe mode.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-11: Cold service-worker export triggers ERR_NOT_READY or waits correctly (Q-6 regression)

**Setup**: Close the sidepanel. Open `chrome://extensions` and click **Service worker → stop** on Tab Junkie so the SW is idle.

**Steps**:
1. Immediately re-open the sidepanel (which wakes the SW).
2. Within the first ~100ms of the sidepanel appearing, click Export → HTML.

**Expected**:
- Either (a) the export succeeds normally (the dispatcher's `readyPromise` awaited migration before the handler ran), or (b) an error toast appears with user-friendly copy such as `Export failed — try again` and no partial file lands on disk.
- If an error toast appears: clicking Export a second time (after the SW is warm) succeeds.
- No uncaught exceptions appear in the sidepanel DevTools console (only the expected code-only `console.warn` from the error path).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-12: 10,000-character title survives (Q-11 regression · AC11 no-truncation)

**Setup**: Save one bookmark with a title that is 10,000 characters of a printable ASCII character (e.g., `x`.repeat(10000)) and URL `https://long.example/`. You can paste the long title via the title input.

**Steps**:
1. Click Export → HTML.
2. Open the downloaded file and confirm the long title is present byte-for-byte.

**Expected**:
- The 10 000-character title appears verbatim in the anchor body.
- The file opens in Chrome without errors (`chrome://bookmarks` imports cleanly).
- Export time remains bounded (no visible hang).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-13: Theme visibility — Export button focus-ring in light + dark theme (AC1)

**Steps**:
1. Switch the extension to light theme (via the theme toggle or system setting).
2. Tab to the overflow-menu button. Confirm the focus ring is visible with WCAG-AA-quality contrast.
3. Switch to dark theme.
4. Repeat the Tab / focus-ring check.
5. In both themes, open the menu and confirm the `Export → HTML` menu item is legible (text contrast ≥ 4.5:1) and its focus ring is visible.

**Expected**:
- Focus ring is visible in both themes for both the overflow trigger and the Export menu item.
- Menu-item text remains readable in both themes.
- WARN (not FAIL) if the focus ring contrast is borderline — log against a11y follow-on.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-14: Rapid repeat clicks produce one download each (AC6 — no blob leaks)

**Steps**:
1. Open DevTools → Memory tab.
2. Click Export → HTML ten times in quick succession.
3. After the downloads settle, take a heap snapshot.
4. Filter the snapshot for `Blob` objects.

**Expected**:
- Exactly 10 files download (browser may dedupe the filename with `(1)`, `(2)` etc. — that is acceptable).
- No uncaught errors in the console.
- Heap snapshot: zero retained `Blob` instances attributable to the export flow (each blob's `URL.revokeObjectURL` is called via `queueMicrotask` post-click).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

## Final UAT Summary

| # | Case | Result |
|---|------|--------|
| 1 | Happy path — 20 items × 5 groups (AC1/2/3/5/6/7) | |
| 2 | Keyboard-only invocation (AC1/6) | |
| 3 | Re-import into fresh Chrome (AC2/3) | |
| 4 | Re-import into Firefox (AC2 cross-browser) | |
| 5 | Empty collection — valid empty file (AC2/7) | |
| 6 | Orphan items land in Ungrouped (Q-H1 fix) | |
| 7 | XSS probe — literal text, no alert (AC10) | |
| 8 | Unicode / emoji round-trip (Q-4) | |
| 9 | Perf — 1000 items under 1s (AC9) | |
| 10 | Safe-mode export (Q-7) | |
| 11 | Cold SW export (Q-6) | |
| 12 | 10k-character title (Q-11) | |
| 13 | Light + dark theme focus-ring (AC1) | |
| 14 | Rapid repeats — no blob leak (AC6) | |

**Overall**: [ ] PASS / [ ] FAIL

**UAT performed by**: _______________________
**Date**: _______________________
**Browser + build**: _______________________

If any core case (UAT-1 … UAT-7) lands FAIL, B-042 returns to the [frontend-engineer] per Gate 3 — do not mark the sprint item done. UAT-8 … UAT-14 cover regressions of the R4 fix pass and R2 flagged risks; a FAIL there is also a Gate 3 blocker. UAT-4 SKIP is acceptable if Firefox is not installed; record the reason in Notes.
