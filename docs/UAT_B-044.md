# UAT — B-044 Import from HTML (Netscape Bookmark File Format 1)

Sprint 18 · Full tier (M) · Round 5 UAT plan · **DEFERRED for user execution**

Related artefacts:
- `docs/BACKLOG.md` — B-044 row (19 acceptance criteria)
- `docs/SOLUTION_DESIGN.md §33` — Import pipeline (preview/commit round-trip, atomic writeTransaction, SW-side 10 MiB cap)
- `docs/SPRINT_FINDINGS.md` — Sprint 18 B-044 R4 findings (code/security/qa) and R4 fix-up notes
- `tests/b044-html-parser.test.js` (29 tests), `tests/b044-import-dispatch.test.js` (13 tests), `tests/b044-commit.test.js` (7 tests), `tests/b044-e2e-import.test.js` (3 tests) — 52 automated cases total after R5 gap-fill.

Automated-suite baseline: **859 pass / 0 fail** after R5 additions (+2 over the post-R4 857 baseline — AC9 out-of-range seconds branch, AC19(c) unknown-attribute graceful-ignore).

This document is not executed in this session — like `docs/UAT_B-042.md`, `docs/UAT_B-043.md`, `docs/UAT_B-048.md`, `docs/UAT_B-029.md`, `docs/UAT_B-059.md`, it is staged for the user to run against the ~v1.13.0 build on a real Edge profile.

## Setup

The user runs **Microsoft Edge**, not Chrome. All browser URLs below use `edge://`; if the tester happens to run Chrome, substitute `chrome://`.

1. Load the unpacked extension from the repo root.
   - Edge: `edge://extensions` → Developer Mode on → "Load unpacked" → select repo root.
   - Chrome: `chrome://extensions` → Developer Mode on → "Load unpacked" → select repo root.
2. Confirm Tab Junkie loads without any permission prompt and without any errors in the extension's service-worker console.
3. Open the Tab Junkie side panel.
4. Before running any REPLACE case below, **take a backup via B-043 JSON export** — B-044 commits a full replace and there is no post-commit undo.
5. Have ready:
   - `tab-junkie-good.html` — the Netscape HTML file you export from the test browser's bookmarks manager (Edge: `edge://favorites` → Manage favorites → Export). Any major-browser export (Edge, Chrome, Firefox, Safari) is valid.
   - `tab-junkie-mixed.html` — a small hand-crafted file with 1–2 javascript:/data: URLs, a `<script>` inside a title, a duplicate URL, and one 5000-character title (see fixtures in the Appendix).
   - `tab-junkie-1k.html` — a 1000-bookmark / 50-folder stress file (see Appendix for build recipe).
   - `tab-junkie-empty.html` — a valid Netscape file with `<DL><p></DL><p>` and zero `<DT>` entries (see Appendix).
   - `tab-junkie-not-netscape.html` — any `<html>` document without the Netscape DOCTYPE.
   - `tab-junkie-fake.json` — any JSON file renamed to `.html` (to test AC19 / JSON-format rejection paths in combination with filename-based filtering).
6. Open DevTools on the side panel (right-click inside the panel → Inspect). Keep the **Console** and **Network** tabs available — several cases inspect network traffic and SW log lines.

Legend: **PASS** = matches expected · **FAIL** = deviation · **WARN** = passes but with a concern to log · **SKIP** = unable to execute (document why).

## AC Coverage Summary

| AC | Description | Automated coverage | UAT case(s) | Notes |
|----|-------------|--------------------|-------------|-------|
| 1 | Entry point — `#import-html-btn` with `aria-label`, keyboard-activatable | STRUCTURAL (button markup reviewed at R4) | UAT-1, UAT-2 | UI / DOM property, not unit-testable |
| 2 | File-picker accept filter `.html,.htm,text/html`; non-HTML rejected with toast | STRUCTURAL + sidepanel recheck reviewed at R4 | UAT-3, UAT-4 | UI/browser-native filter |
| 3 | Netscape doctype recognition; malformed → error toast, zero mutation | `b044-html-parser.test.js` AC3 × 5, `b044-import-dispatch.test.js` non-Netscape bubble, `b044-e2e-import.test.js` | UAT-5 | |
| 4 | Pre-commit preview dialog with N/M/K/D counts, REPLACE emphasised, `role="dialog"`/`aria-modal="true"`, zero-bookmark guard | STRUCTURAL + response shape (preview handler) + zero-count guard test | UAT-6, UAT-7 | Dialog is UI; counts match e2e response |
| 5 | Cancel default-focused, Escape cancels, backdrop cancels, Replace all commits, focus returned to trigger | STRUCTURAL (R4 inspection) | UAT-8, UAT-9 | Pure DOM/focus behaviour |
| 6 | Folder flattening — depth ≥ 2 joined with ` / ` | `b044-html-parser.test.js` AC6 × 3 | UAT-10 | |
| 7 | Top-level `<A>` → `groupId = null`; no synthetic Ungrouped group record | `b044-html-parser.test.js` AC7 | UAT-11 | |
| 8 | Deterministic group color via djb2; same file → same colors | `b044-html-parser.test.js` AC8 × 2 | UAT-12 | |
| 9 | `ADD_DATE` / `LAST_MODIFIED` seconds → ms; missing/bad/out-of-range → `Date.now()`, NOT a skip | `b044-html-parser.test.js` AC9 × 5 (incl. R5 out-of-range branch) | UAT-13 | |
| 10 | Malformed-entry skip policy (no HREF, javascript:, data:, empty title, oversize title truncated not skipped) | `b044-html-parser.test.js` AC10 × 5 | UAT-14 | |
| 11 | In-file duplicate URL default-skip — first wins, rest count toward D | `b044-html-parser.test.js` AC11; `b044-e2e-import.test.js` e2e AC13 | UAT-15 | |
| 12 | Atomic REPLACE via single `writeTransaction`; safe-mode aborts cleanly; partial failure rolls back | `b044-commit.test.js` × 7, `b044-import-dispatch.test.js` safe-mode, `b044-e2e-import.test.js` replace | UAT-16, UAT-17, UAT-18 | |
| 13 | Post-import summary toast — `"Imported N bookmarks into M groups. K skipped."`; `role="status"`/`aria-live="polite"`; no PII in console | PARTIAL — `b044-e2e-import.test.js` AC13 counts; toast copy/ARIA structural | UAT-19 | |
| 14 | 1000 items / 50 folders end-to-end < 2000ms P95; parse < 500ms | `b044-e2e-import.test.js` AC14 | UAT-20 | |
| 15 | XSS safety — `textContent` for titles, `normalizeUrl` for URLs, `<script>` / javascript: / data: inert | `b044-html-parser.test.js` AC15 × 3 | UAT-21 | |
| 16 | Zero network during import (no fetch / XHR / beacon / favicon) | STRUCTURAL — runtime-observable only | UAT-22 | Must be verified via DevTools Network |
| 17 | No new `manifest.json` permissions | STRUCTURAL — diff review at R4 | UAT-23 | Verified by permission prompt on load |
| 18 | `MSG_IMPORT_COLLECTION` contract: `{format, content, options?, commit?}` + typed error envelope | `b044-import-dispatch.test.js` × 13, `b044-e2e-import.test.js` | UAT-24 | |
| 19 | Out of scope — no merge, JSON rejected with format error, unknown attrs ignored, no undo | `b044-import-dispatch.test.js` JSON → ERR_INVALID_FORMAT; `b044-html-parser.test.js` AC19(c) unknown-attr graceful ignore | UAT-25, UAT-26 | |

**R4 fix-up coverage (additional UAT cases):**

| Fix-up | Description | UAT case |
|--------|-------------|----------|
| #1 (qa) | Dark-mode REPLACE contrast | UAT-27 |
| #2 (qa) | Double-click defense + keyboard-only flow + focus return | UAT-9, UAT-28 |
| #3 (qa) | Zero-bookmark guard — "File contains no bookmarks" | UAT-6 |
| #4 (security) | SW-side 10 MiB content cap | UAT-29 (optional) |

## Test Cases

### UAT-1: Entry point — `#import-html-btn` exists and is keyboard-activatable (AC1)

**Steps**:
1. Open the side panel. With focus in the panel header, press **Tab** repeatedly.
2. Observe the focus ring walk across the header buttons.
3. Continue until the Import-HTML button (upward-arrow icon, immediately after the "Add bookmark" button) receives focus.
4. Read the focused element's accessible name via a screen-reader probe: the DevTools Accessibility pane's "Name" field, or hover in DevTools → Inspect → focused element.

**Expected**:
- The button exists at `#import-html-btn`.
- Accessible name: **"Import bookmarks from HTML"**.
- Focus ring visible in both light and dark themes.
- Tab order is stable — does not skip the button.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-2: Activate via Enter AND Space (AC1)

**Steps**:
1. Tab to `#import-html-btn`. Press **Enter**.
2. Observe the native Open-File picker opens.
3. Cancel the picker. Re-focus the button. Press **Space**.
4. Observe the picker opens again.

**Expected**:
- Both Enter and Space open the native file picker.
- No visible mouse interaction required.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-3: File-picker filter accepts `.html` / `.htm` / `.HTML` / `.HTM` (AC2)

**Steps**:
1. Click `#import-html-btn` → picker opens.
2. In the picker, note the file-type dropdown. (Edge may show "HTML files" by default.)
3. Navigate to a folder and try to select `tab-junkie-good.html`. Confirm it's selectable.
4. Rename a copy to `tab-junkie-good.HTML` (upper-case). Try to select it. Cancel.
5. Rename a copy to `tab-junkie-good.htm`. Try to select it. Cancel.
6. Rename a copy to `tab-junkie-good.HTM`. Try to select it.

**Expected**:
- All four extensions selectable through the picker (or via "All files" fallback, then imported).
- Selecting a mixed-case variant does **not** produce the "Select an .html or .htm file" toast.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-4: Non-HTML file rejected before parse with toast (AC2)

**Steps**:
1. Click `#import-html-btn`.
2. In the picker, switch the file-type filter to "All files" and pick `tab-junkie-fake.json` (a JSON file renamed with a `.json` extension). Alternatively: a plain `.txt` file.
3. Observe the result.
4. Repeat with a file whose name has no extension at all (e.g. `README`).
5. Repeat with a `.html.txt` file (name ends in `.txt`, not `.html`).

**Expected**:
- Toast appears: **"Select an .html or .htm file"**.
- No confirmation dialog opens. No storage mutation occurs.
- The side panel still shows the original bookmark state.
- Service-worker console shows no log lines about parse or commit.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-5: Parse-error paths — not-Netscape / empty / truncated (AC3, AC10)

**Setup**: Have three files — `tab-junkie-not-netscape.html` (valid HTML but no Netscape DOCTYPE), a zero-byte `.html` file, and a `.html` file truncated mid-body (e.g. the Netscape export with its last 200 characters chopped off and the closing `</DL>` tags removed).

**Steps**:
1. Import `tab-junkie-not-netscape.html`. Observe toast.
2. Import the zero-byte `.html` file. Observe toast.
3. Import the truncated file. Observe toast.

**Expected**:
- Not-Netscape: error toast with user-friendly copy (e.g. `"Import failed — invalid file format"`), mapped from `ERR_INVALID_FORMAT`.
- Empty file: toast `"File is empty"` (mapped from `ERR_EMPTY_FILE`), or equivalent.
- Truncated file: either parses what's present (partial success with counts in preview — treat as PASS if state remains consistent) or rejects with `ERR_INVALID_FORMAT`. Either is acceptable as long as **zero storage mutation** occurs before user confirms Replace all.
- DevTools console never logs titles or URLs — only error codes.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-6: Zero-bookmark file blocked before dialog opens (AC4, qa fix-up #3)

**Setup**: `tab-junkie-empty.html` — valid Netscape DOCTYPE + an empty `<DL><p></DL><p>`.

**Steps**:
1. Take a B-043 JSON backup of the current collection (sanity check — this case should not mutate, but the backup is free insurance).
2. Import `tab-junkie-empty.html`.
3. Observe — the Replace-all confirmation dialog **must not** open.
4. Check storage: `edge://extensions` → service worker → Inspect → DevTools → Application → Storage → Extension storage → Local → `tj:items` and `tj:groups` untouched.

**Expected**:
- Toast: **"File contains no bookmarks"**.
- No confirmation dialog opens.
- `tj:items` and `tj:groups` identical to pre-import state.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-7: Preview dialog surfaces exact counts + REPLACE emphasis + ARIA roles (AC4)

**Setup**: `tab-junkie-mixed.html` — known contents. Something like: 10 valid bookmarks across 3 folders, 1 javascript: URL, 1 no-HREF anchor, 1 duplicate URL.

**Steps**:
1. Import `tab-junkie-mixed.html`.
2. Observe the confirmation dialog. Read the body text carefully.
3. In DevTools, inspect the dialog root: it must have `role="dialog"` and `aria-modal="true"`.
4. Confirm the phrase **"This will REPLACE all existing bookmarks and groups."** is visually emphasised (bold weight + warning color).
5. Verify counts:
   - "Import 10 bookmarks across 3 folders from tab-junkie-mixed.html."
   - "2 malformed entries will be skipped." (javascript: + no-HREF)
   - "1 item has duplicate URLs — duplicates will be skipped."

**Expected**:
- All counts match the file's known contents.
- REPLACE line visually distinct (confirm by inspecting the `<strong class="import-replace-emphasis">` node).
- `role="dialog"` and `aria-modal="true"` present on the dialog container.
- Cancel button visible and carries default focus (see UAT-8 for focus tests).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-8: Cancel default-focused; Escape and backdrop click cancel; no mutation (AC5)

**Steps (keyboard-only for the Escape path)**:
1. Import `tab-junkie-mixed.html` to reopen the dialog. Note the initially focused element.
2. Verify: the **Cancel** button has focus on open — NOT Replace all.
3. Press **Escape**.
4. Confirm: dialog closes, no toast mutation message, storage untouched.
5. Re-import `tab-junkie-mixed.html`.
6. Click the **grey overlay backdrop** outside the dialog.
7. Confirm: dialog closes as if Cancel was pressed, storage untouched.
8. Re-import `tab-junkie-mixed.html`. Click **Cancel** with the mouse.
9. Confirm: dialog closes, storage untouched.

**Expected**:
- Cancel is default-focused each time the dialog opens.
- Escape, backdrop, and explicit Cancel all dismiss without any mutation.
- No "Imported N bookmarks" toast on any of the three cancellation paths.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9: Focus returns to `#import-html-btn` after dialog closes (AC5, qa fix-up #2)

**Steps**:
1. Tab to `#import-html-btn`. Press Enter → picker opens.
2. Pick `tab-junkie-mixed.html`. Dialog opens with Cancel focused.
3. Press **Escape**. Dialog closes.
4. Without moving the mouse, check which element has focus (DevTools Elements tab `:focus` indicator, or press Enter to see what activates).
5. Repeat for the Cancel-button-click path and the Replace-all-click path.

**Expected**:
- After Cancel / Escape: focus returns to `#import-html-btn`.
- After Replace all: focus returns to `#import-html-btn` once the commit finishes (OK if focus briefly sits on the button while it's disabled/aria-busy).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-10: Depth-2+ folder flattened with ` / ` separator (AC6)

**Setup**: Hand-craft `tab-junkie-deep.html`:

```html
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>Work</H3>
  <DL><p>
    <DT><A HREF="https://w1.example">W1</A>
    <DT><H3>Projects</H3>
    <DL><p>
      <DT><A HREF="https://p1.example">P1</A>
      <DT><H3>2026</H3>
      <DL><p>
        <DT><A HREF="https://d1.example">Deep1</A>
        <DT><A HREF="https://d2.example">Deep2</A>
      </DL><p>
    </DL><p>
  </DL><p>
</DL><p>
```

**Steps**:
1. Import. In the preview, confirm "Import 4 bookmarks across 3 folders".
2. Click Replace all.
3. In the side panel, expand the resulting groups.

**Expected**:
- Three groups: `Work` (top-level), `Projects` (sub-group with parent `Work`), `Projects / 2026` (sub-group with parent `Work`, its name contains ` / `).
- `W1` sits inside `Work` (parent-level item).
- `P1` sits inside `Projects`.
- `Deep1`, `Deep2` both sit inside `Projects / 2026`.
- No items were dropped.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-11: Top-level `<A>` → Ungrouped (AC7)

**Setup**: Hand-craft a file with two top-level `<A>` entries and one named folder:

```html
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><A HREF="https://top1.example">Top1</A>
  <DT><A HREF="https://top2.example">Top2</A>
  <DT><H3>Work</H3>
  <DL><p>
    <DT><A HREF="https://w.example">W</A>
  </DL><p>
</DL><p>
```

**Steps**:
1. Import → Replace all.
2. Inspect the side panel layout.
3. In DevTools Application → Storage, examine `tj:items` and `tj:groups`.

**Expected**:
- Two top-level items `Top1` and `Top2` land in the Ungrouped pinned section.
- `tj:items` shows those two rows with `groupId: null`.
- `tj:groups` does **not** contain a group literally named "Ungrouped" — only `Work`.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-12: Deterministic group colors across re-imports (AC8)

**Steps**:
1. Import `tab-junkie-mixed.html` → Replace all. Note the assigned colors for 2–3 distinctly named groups (screenshot if helpful).
2. Re-import the SAME file → Replace all.
3. Compare the colors for the same group names.

**Expected**:
- Each group's color is byte-identical across the two imports.
- No color outside `GROUP_COLORS` (palette entries) is used.
- A folder named `Work` always maps to the same palette entry regardless of ordering within the file.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-13: Timestamps preserved when `ADD_DATE` present; now() fallback when missing (AC9)

**Setup**: Hand-craft a file with two entries — one `ADD_DATE="1700000000"` (seconds), one with no attribute.

**Steps**:
1. Import → Replace all.
2. Open DevTools Application → Storage → `tj:items`.
3. Inspect `createdAt` on both items.

**Expected**:
- The `ADD_DATE="1700000000"` item has `createdAt === 1700000000000` (note the three trailing zeroes — seconds × 1000, not stored in seconds).
- The no-attribute item has a `createdAt` close to the current timestamp (within ±5 seconds of when you clicked Replace all).
- Neither item is skipped.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-14: Malformed entries skipped; valid entries still import (AC10)

**Setup**: `tab-junkie-mixed.html` containing: 3 valid entries, 1 javascript: URL, 1 data: URL, 1 `<A>` with no HREF, 1 `<A>` with empty title, 1 `<A>` with a 5000-character title.

**Steps**:
1. Import. In the preview dialog, read the skip count.
2. Confirm → inspect resulting items.

**Expected**:
- Preview reports `"3 malformed entries will be skipped."` (javascript, data, no-HREF).
- Empty-title `<A>` is imported with a URL-derived fallback title — NOT skipped.
- 5000-char title is imported truncated (to ≤ `MAX_TITLE` which is 2048) — NOT skipped.
- Final stored `tj:items` has 5 entries (3 fully-valid + 1 fallback-titled + 1 truncated-titled).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-15: In-file duplicate URLs — first wins, rest skip (AC11)

**Setup**: File with two `<A HREF="https://ex.example/">` entries — title "First" and "Second" in that order.

**Steps**:
1. Import. Read the preview.
2. Replace all. Inspect `tj:items`.

**Expected**:
- Preview shows "1 item has duplicate URLs — duplicates will be skipped."
- Exactly one item in storage with URL `https://ex.example/` and title **"First"**.
- "Second" is not in storage.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-16: Atomic replace — successful commit wipes all pre-existing data (AC12)

**Setup**: A profile with ≥ 10 bookmarks across ≥ 3 groups, at least one Ungrouped item. **TAKE A B-043 JSON BACKUP FIRST.**

**Steps**:
1. Note current item count and group count from the side panel.
2. Import `tab-junkie-good.html` → Replace all.
3. Inspect the side panel after the success toast.
4. Inspect `tj:items` and `tj:groups` in DevTools.

**Expected**:
- None of the original items/groups remain.
- All imported items/groups are present.
- The sidepanel fully re-renders.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-17: Atomic replace — commit failure leaves pre-import data intact (AC12)

**Setup**: Manufactured-failure path. The cleanest reproduction: seed `tj:items` with a JSON blob that's near the quota (e.g. stuff one item with a massive `title` via DevTools → Application → Storage, so the next write would exceed quota). Alternative: start the commit and kill the extension mid-transaction (hard to time; treat as SKIP if unreachable).

**Steps**:
1. Backup via B-043 export.
2. Engineer the quota-near state.
3. Import `tab-junkie-good.html` → Replace all.
4. Observe the error toast.
5. Inspect `tj:items` and `tj:groups`.

**Expected**:
- Error toast (e.g. `"Import failed — storage full"`).
- Pre-import items and groups are **byte-for-byte preserved**. No half-replaced state.
- If you can't engineer a quota failure reliably, mark **SKIP** with a note — the automated `b044-commit.test.js` quota rollback test covers the same code path.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-18: Safe-mode import aborts with explicit message (AC12)

**Setup**: Force safe mode. DevTools → Application → Storage → extension local storage → `tj:meta` → set `schemaVersion` to a number higher than `KNOWN_VERSION` (e.g. `999`). Reload the side panel.

**Steps**:
1. Confirm safe mode: the sidepanel shows a read-only banner.
2. Click `#import-html-btn` → pick `tab-junkie-good.html`.

**Expected**:
- Import rejects before commit. Error toast matches `ERR_SAFE_MODE` mapping (e.g. `"Cannot import while in safe mode"`).
- `tj:items` / `tj:groups` unchanged.
- After the test, reset `tj:meta.schemaVersion` back to `KNOWN_VERSION` to exit safe mode.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-19: Success toast copy + ARIA live-region + no PII in console (AC13)

**Setup**: Open DevTools → Console. Clear console. Enable the "Verbose" log level.

**Steps**:
1. Import `tab-junkie-mixed.html` → Replace all.
2. Read the success toast. Count the content words against expectations below.
3. In DevTools, inspect the toast's container — it must carry `role="status"` and `aria-live="polite"`.
4. Scroll through the console output during import — from the moment of click through ~5 seconds after the toast appears.

**Expected**:
- Toast text matches template: `"Imported {N} bookmarks into {M} groups. {K} skipped."` (omit skipped clause if K === 0).
- `role="status"` + `aria-live="polite"` present on the toast container.
- Toast auto-dismisses around 4 seconds after appearing.
- Console shows **zero** log lines containing any imported bookmark title or URL. The only console output acceptable during import is code-only error warnings if something fails.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-20: Performance — 1000-item / 50-folder file ends within ~3s perceived (AC14)

**Setup**: `tab-junkie-1k.html` — see Appendix for a build recipe (50 folders × 20 items = 1000 entries, nested to 3 levels to exercise flattening).

**Steps**:
1. Open DevTools → Performance tab.
2. Start recording.
3. Click `#import-html-btn` → pick `tab-junkie-1k.html`. When the preview dialog opens, click **Replace all**.
4. Stop recording once the success toast appears.
5. In the recording, measure elapsed time from the final click to the success toast.
6. Open `tj:items` in storage — confirm 1000 items landed.
7. Run the same import a second time (Replace all again) and observe perceived responsiveness.

**Expected**:
- End-to-end elapsed time < **3000ms** on a dev-class machine (AC14 target is 2000ms P95; UAT allows jitter budget).
- Parse phase alone < 500ms — visible in the Performance timeline as the span between file-read completion and dialog open.
- No main-thread long-tasks > 200ms during parse.
- The sidepanel UI does not freeze — you can still scroll the side panel during commit (or the trigger button is visibly disabled/aria-busy).
- WARN if elapsed is between 2000ms and 3000ms — log the number for the R6 architecture review.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-21: XSS probe — javascript: / data: / inline `<script>` all inert (AC15)

**Setup**: Hand-craft a file with: `<A HREF="javascript:alert(1)">JS</A>`, `<A HREF="data:text/html,<script>alert(1)</script>">D</A>`, `<A HREF="https://ok.example">Hello<script>alert(1)</script></A>`, `<A HREF="https://ok2.example">&lt;script&gt;alert(1)&lt;/script&gt;</A>`.

**Steps**:
1. Import the file.
2. Observe the preview dialog. Check that no alert fires.
3. Click Replace all.
4. After the side panel re-renders, hover each imported item to read titles. Confirm no alert fires.
5. Check `tj:items`: no item has a `javascript:` or `data:` URL.
6. Open the side panel DevTools console — confirm no script execution warnings.

**Expected**:
- Zero `alert()` calls at any point (preview, commit, render, hover).
- Only `https://ok.example` and `https://ok2.example` land in storage.
- `https://ok.example`'s title is literal text containing the string `Hello` (raw `<script>` tag-stripped by the parser) — inspect the row DOM to confirm it was written via `textContent`, not `innerHTML`.
- `https://ok2.example`'s title is the literal string `<script>alert(1)</script>` — entity-decoded but NOT executed.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-22: Zero network traffic during import (AC16)

**Steps**:
1. Open DevTools → Network tab. Click Clear. Ensure "Preserve log" is on and no filters are active.
2. Import `tab-junkie-good.html` → Replace all.
3. After the success toast and the sidepanel re-render, read the Network tab.

**Expected**:
- **Zero** network requests originate from the extension during the import flow.
- No favicon fetches. Imported items render with letter-avatar fallback until live tab-match (B-010) supplies favicons.
- No `chrome-extension://`-origin `fetch`, XHR, or beacon requests — only activity unrelated to the extension (e.g. the DevTools itself) is acceptable. If you're not sure, right-click a request and check its Initiator.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-23: No new manifest permissions (AC17)

**Steps**:
1. Reload the extension at `edge://extensions` (the Reload button under the Tab Junkie card).
2. Observe whether any new permission prompt appears.
3. Click **Details** under the extension card, then **Permissions**. Review the listed permissions.
4. Compare against the previous build — a git diff of `manifest.json` on this branch vs `release/v2`'s tip should be empty.

**Expected**:
- No new permission prompt on reload.
- Permissions list matches the prior build.
- `git diff release/v2 -- manifest.json` shows zero changes.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-24: Two-round message contract observable via SW logs (AC18)

**Steps**:
1. Open the service-worker console: `edge://extensions` → Tab Junkie → **Service worker (Inspect)** → DevTools → Console.
2. Clear the console.
3. Import `tab-junkie-mixed.html`. **Cancel** the preview dialog (do not Replace all).
4. Read the SW console for any dispatch log lines.
5. Re-import → click **Replace all** this time. Read the SW console again.

**Expected**:
- Round 1 (preview): at most a single dispatch line for `MSG_IMPORT_COLLECTION` with no `commit` flag. Storage NOT mutated (verify in Storage tab).
- Round 2 (commit): a second dispatch line for `MSG_IMPORT_COLLECTION` with `commit: true`. Storage mutated atomically.
- No titles / URLs printed. Only message-type codes and generic counts are acceptable in SW logs.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-25: JSON file through "Import HTML" rejected (AC19)

**Steps**:
1. Take a B-043 JSON backup of the current state. The resulting file is `tab-junkie-backup-YYYY-MM-DD.json`.
2. Rename a copy to `backup.html` (just the extension — leave the content as JSON).
3. Click `#import-html-btn` → pick `backup.html`.

**Expected** (two acceptable paths — either counts as PASS):
- (a) The parser's DOCTYPE check rejects with the "invalid file format" toast (`ERR_INVALID_FORMAT`).
- (b) If a future build decides to peek at content before DOCTYPE, an equivalent format-rejection toast appears.
- In either case, zero storage mutation.
- The straight-up JSON-via-`Import HTML` path is distinct from the future B-045 Import-JSON feature, which will have its own entry point.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-26: Unknown browser-specific attrs ignored gracefully (AC19(c))

**Setup**: Hand-craft a file with `ICON`, `FEED`, and `PERSONAL_TOOLBAR_FOLDER` attrs on `<A>` / `<H3>` elements. Example:

```html
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks Bar</H3>
  <DL><p>
    <DT><A HREF="https://ok.example" ICON="data:image/png;base64,AAAA" FEED="true" ICON_URI="https://tracker.example/icon.ico">OK</A>
  </DL><p>
</DL><p>
```

**Steps**:
1. Import → Replace all.
2. Inspect `tj:items` and `tj:groups` in DevTools storage.
3. Open the DevTools Network tab while importing again.

**Expected**:
- The entry imports normally with URL `https://ok.example` and title "OK".
- The group "Bookmarks Bar" imports normally.
- Stored item has none of: `ICON`, `FEED`, `ICON_URI`, `favIconUrl` — the unknown attrs are dropped at parse, not stored.
- Stored group has no `PERSONAL_TOOLBAR_FOLDER` field.
- Network tab shows zero requests to `tracker.example` or any other host (the `ICON_URI` is never fetched).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-27: Dark-mode contrast on REPLACE emphasis (R4 qa fix-up #1)

**Steps**:
1. Switch the extension theme to dark.
2. Import `tab-junkie-mixed.html`. When the confirmation dialog opens, DO NOT click Replace yet.
3. In DevTools → Elements, select the `<strong class="import-replace-emphasis">` node.
4. Switch to the Accessibility pane. Check the "Contrast ratio" measurement against its background.
5. Switch theme back to light. Repeat.

**Expected**:
- Contrast ratio ≥ **4.5:1** against the effective background in both themes (WCAG AA for normal text).
- The REPLACE emphasis is visually distinct — legible at a glance, not washed out.
- WARN (not FAIL) if the ratio is between 3.0:1 and 4.5:1 — log under a11y follow-on, not a B-044 blocker.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-28: Double-click defense — no double-import (R4 qa fix-up #2)

**Steps**:
1. With `tab-junkie-1k.html` loaded (larger file makes the race more observable).
2. Rapidly double-click (or triple-click) `#import-html-btn`.
3. After the picker opens, pick the file.
4. In the preview dialog, rapidly double-click **Replace all**.
5. Wait for the success toast.

**Expected**:
- Only one file picker opens.
- Only one preview dialog opens.
- Only one commit runs. The success toast says `"Imported 1000 bookmarks into 50 groups."` — NOT `2000` or `100 groups`.
- `tj:items.length === 1000`, `tj:groups.length === 50`.
- While the commit is in flight, the trigger button is visibly disabled (`aria-busy="true"` or disabled attribute).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-29: SW-side 10 MiB content cap (R4 security fix-up #4) — OPTIONAL

Crafting a valid 15 MiB Netscape HTML file is painful to do manually. This case is primarily covered by the automated `b044-dispatch` test `content > 10 MiB rejected with ERR_VALIDATION`. Manual runs are **optional**.

**If you want to run it**:
1. Use the build recipe in the Appendix to produce `tab-junkie-15mb.html` (e.g. 70,000 bookmarks).
2. Import. Observe.

**Expected**:
- Extension-side size check kicks in **before** read completes (UI cap is 5 MiB, so you'll likely hit the UI toast first: `"File too large (max 5 MiB)"`).
- If the UI cap is bypassed (e.g. via direct SW message injection), the SW rejects with `ERR_VALIDATION`.
- Zero storage mutation; the pre-existing collection is preserved.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

## Final UAT Summary

| # | Case | Result |
|---|------|--------|
| 1 | Entry point / button exists / keyboard-reachable (AC1) | |
| 2 | Enter AND Space activate (AC1) | |
| 3 | Accept filter accepts .html / .htm case-insensitive (AC2) | |
| 4 | Non-HTML rejected pre-parse with toast (AC2) | |
| 5 | Parse-error paths — not-Netscape / empty / truncated (AC3, AC10) | |
| 6 | Zero-bookmark guard (AC4, qa #3) | |
| 7 | Preview dialog counts + REPLACE emphasis + ARIA (AC4) | |
| 8 | Cancel default focus; Escape & backdrop cancel (AC5) | |
| 9 | Focus returns to trigger after close (AC5, qa #2) | |
| 10 | Depth-2+ flattening with ` / ` (AC6) | |
| 11 | Top-level → Ungrouped sentinel (AC7) | |
| 12 | Deterministic group colors across re-imports (AC8) | |
| 13 | Timestamps in ms / fallback to now() (AC9) | |
| 14 | Malformed skipped; valid preserved (AC10) | |
| 15 | In-file duplicate-URL skip (AC11) | |
| 16 | Atomic replace — success path (AC12) | |
| 17 | Atomic replace — failure rollback (AC12) | |
| 18 | Safe-mode aborts import (AC12) | |
| 19 | Success toast + ARIA + no PII logs (AC13) | |
| 20 | 1000-item performance (AC14) | |
| 21 | XSS — javascript: / data: / `<script>` inert (AC15) | |
| 22 | Zero network during import (AC16) | |
| 23 | No new manifest permissions (AC17) | |
| 24 | Two-round message contract via SW logs (AC18) | |
| 25 | JSON-via-HTML-importer rejected (AC19) | |
| 26 | Unknown browser-specific attrs ignored (AC19(c)) | |
| 27 | Dark-mode REPLACE contrast (qa fix-up #1) | |
| 28 | Double-click defense (qa fix-up #2) | |
| 29 | SW-side 10 MiB content cap (security fix-up #4) — OPTIONAL | |

**Overall**: [ ] PASS / [ ] FAIL

**UAT performed by**: _______________________
**Date**: _______________________
**Browser + build**: _______________________

If any case UAT-1 … UAT-16, UAT-18 … UAT-22, UAT-24 lands FAIL, B-044 returns to the [frontend-engineer] per Gate 3 — do not mark the sprint item done. UAT-17 (commit rollback) has a SKIP path if the failure mode can't be reproduced manually — the automated quota rollback test in `b044-commit.test.js` is authoritative. UAT-27 (dark-mode contrast) and UAT-28 (double-click) are fix-up regressions that must stay green; a FAIL is a Gate 3 blocker. UAT-29 is OPTIONAL.

## Risks surfaced by this UAT plan (recommend as backlog candidates)

- **R-1**: No first-class filename in the SW-side error envelope. If UAT-5 or UAT-25 ever surfaces a misleading toast (user picked file A but the message refers to the previous file B), file a B-0xx to carry `fileName` through the error envelope for better diagnostic UX.
- **R-2**: UAT-29 (SW-side 10 MiB cap) is not easily manually reproducible without tooling. Consider adding a DevTools-console helper (guarded behind a dev flag) that lets QA dispatch `MSG_IMPORT_COLLECTION` directly with a synthesised oversize string so the SW-cap branch can be exercised without a real 15 MiB file.
- **R-3**: UAT-17 (quota-rollback) depends on ability to engineer near-quota state. If this turns out to be SKIPped repeatedly across B-044 / future import items, consider a small dev-only "seed quota" helper or promote the automated `b044-commit.test.js` quota rollback to the definition-of-done as the sole acceptable signal.

## Appendix — fixture build recipes

### `tab-junkie-mixed.html`

Copy-paste the below into an editor, save as `tab-junkie-mixed.html`:

```html
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks Menu</H1>
<DL><p>
  <DT><H3>Work</H3>
  <DL><p>
    <DT><A HREF="https://w1.example">W1</A>
    <DT><A HREF="https://w2.example" ADD_DATE="1700000000">W2 with date</A>
    <DT><A HREF="https://w3.example"></A>
  </DL><p>
  <DT><H3>Reading</H3>
  <DL><p>
    <DT><A HREF="https://r1.example">R1</A>
    <DT><A HREF="https://r2.example">R2</A>
    <DT><A HREF="https://r1.example">R1 dup</A>
    <DT><A>no href</A>
    <DT><A HREF="javascript:alert(1)">JS</A>
  </DL><p>
  <DT><H3>Misc</H3>
  <DL><p>
    <DT><A HREF="https://m1.example">M1</A>
    <DT><A HREF="https://m2.example">M2</A>
  </DL><p>
</DL><p>
```

### `tab-junkie-empty.html`

```html
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
</DL><p>
```

### `tab-junkie-1k.html` — build with Node

Save as `build-1k.mjs`, run `node build-1k.mjs > tab-junkie-1k.html`:

```js
const parts = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<DL><p>'];
for (let f = 0; f < 50; f += 1) {
  parts.push(`  <DT><H3>Folder${f}</H3>`, '  <DL><p>');
  for (let i = 0; i < 20; i += 1) {
    const idx = f * 20 + i;
    parts.push(`    <DT><A HREF="https://site-${idx}.example/">Item ${idx}</A>`);
  }
  parts.push('  </DL><p>');
}
parts.push('</DL><p>');
console.log(parts.join('\n'));
```

### `tab-junkie-15mb.html` — build with Node (OPTIONAL)

```js
const parts = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<DL><p>'];
for (let i = 0; i < 70000; i += 1) {
  parts.push(`  <DT><A HREF="https://site-${i}.example/item-${'x'.repeat(200)}">I${i}</A>`);
}
parts.push('</DL><p>');
console.log(parts.join('\n'));
```

Check the resulting file size with `ls -lh tab-junkie-15mb.html` — it should be > 15 MiB. If not, raise the inner-URL length until it is.
