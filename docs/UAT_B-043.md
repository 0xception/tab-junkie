# UAT — B-043 Export to JSON backup

Sprint 17 · Full tier (M) · Round 5 UAT plan

Related artefacts:
- `docs/BACKLOG.md` — B-043 row (13 acceptance criteria)
- `docs/SOLUTION_DESIGN.md §32.5` — Authoritative frozen JSON schema v1 (the contract B-045 will import against)
- `docs/SPRINT_FINDINGS.md` — Sprint 17 B-043 code / security / qa-reviewer findings (0 CRITICAL / 0 HIGH / 11 MEDIUM / 9 LOW; MEDIUMs absorbed at R5)
- `tests/b043-json-export.test.js` — 39 automated test cases (32 from R3 + 7 from R5 gap-fill: qa-Q-1 nested sort · qa-Q-3 null/empty titles · qa-Q-4 preferences=undefined · qa-Q-7 CJK size probe · sec-S-1 favIconUrl strip pin · sec-S-2 prefs unknown-key passthrough pin · qa-Q-2 listGroups partial-read failure)

Baseline suite: 806 pass / 0 fail after R5 additions (+7 tests over the post-R4 799 baseline).

Export file is the **frozen import contract** for B-045 (JSON import, next sprint). Any field leaking into the file today becomes a field B-045 must handle — UAT therefore prioritises shape + privacy cases.

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
4. Have a JSON validator / formatter handy: VS Code, `jq .`, or `python -m json.tool`.

Legend: **PASS** = behaviour matches expected · **FAIL** = deviation from expected · **WARN** = behaves correctly but surfaced a concern · **SKIP** = unable to execute (document why).

## Test Cases

### UAT-1: Happy path — export with 20 items across 5 groups + 1 sub-group (AC1 · AC2 · AC4 · AC5 · AC6 · AC8 · AC9 · AC10)

**Setup**: Use the collection from Setup step 3 (20 items + 5 groups + 1 sub-group + ≥1 ungrouped item).

**Steps**:
1. Click the sidepanel header overflow menu (kebab/more button adjacent to `#add-bookmark-btn`).
2. Choose **Export → JSON backup**.
3. Observe the browser download dialog, let the file save, open the file location.
4. Open the downloaded `.json` file in a UTF-8-aware editor.

**Expected**:
- Default filename matches `tab-junkie-backup-YYYY-MM-DD.json` with today's **local** date.
- The browser's native Save-As dialog appears (or the file goes straight to Downloads if the user disabled that prompt).
- Exactly one download — no duplicates.
- Toast reads `Backup exported: tab-junkie-backup-YYYY-MM-DD.json` (the full filename, not just the extension).
- Toast is dismissible (click or Escape) and auto-dismisses after ~4s.
- File is valid UTF-8 JSON with 2-space indentation.
- File ends with a trailing newline (not two, not zero).
- Root object has exactly these keys: `schemaVersion`, `exportedAt`, `items`, `groups` (plus `preferences` only if you've ever changed a setting — see UAT-6).
- `items` array has 20 entries; `groups` array has 6 entries (5 top-level + 1 sub-group).
- Every item has `id`, `title`, `url`, `groupId`, `sortOrder`, `createdAt`, `updatedAt`.
- Every group has `id`, `name`, `color`, `parentId`, `sortOrder`, `collapsed`, `createdAt`, `updatedAt`.
- The sub-group's `parentId` matches the `id` of the `Projects` group.
- The ungrouped item has `groupId: null`.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-2: Round-trip sanity — JSON.parse the file (AC1 · AC7)

**Setup**: Use the file from UAT-1.

**Steps**:
1. Copy the file contents.
2. In the sidepanel DevTools console (or any JS console), run `JSON.parse(<pasted string>)`.
3. Alternatively: `jq . tab-junkie-backup-YYYY-MM-DD.json` from a shell.

**Expected**:
- `JSON.parse` returns an object with zero errors thrown.
- `jq .` pretty-prints without syntax errors.
- The resulting object's top-level keys match UAT-1's expected set.
- `typeof parsed.schemaVersion === 'number'` (integer, not string).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-3: Schema version authenticity (AC3)

**Steps**:
1. Open the UAT-1 file.
2. Inspect the `schemaVersion` field.

**Expected**:
- `"schemaVersion": 1` (integer, matches `KNOWN_VERSION` in `background/storage/migration.js`).
- Value is a JSON number (no quotes). FAIL if it's `"1"` (string).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-4: Orphan items — group delete mid-session (AC12 parity with B-042 UAT-6)

**Setup**: Ensure at least one group has ≥2 saved items (e.g. `Work`).

**Steps**:
1. Delete the `Work` group (right-click group header → Delete group → confirm). Confirm its items remain in the sidepanel as Ungrouped.
2. Immediately click Export → JSON backup (do not reload the sidepanel first).
3. Open the downloaded file in a text editor.

**Expected**:
- Every item that was in `Work` now has `"groupId": null` in the exported file.
- No items are silently dropped — the total `items` array length matches the item count in the sidepanel post-delete.
- The deleted group's `id` does NOT appear in `groups` array.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-5: Orphan sub-groups — parent deletion symmetry with B-042 R4 fix (AC12)

**Setup**: Create a 3-level nest: `Parent → Middle → Leaf`, with at least one item in `Leaf`.

**Steps**:
1. Delete the `Middle` group (not the parent, not the leaf — the intermediate).
2. Storage's depth/cycle guard may reparent `Leaf` automatically — if so, record the observed behaviour under Notes.
3. If `Leaf` is still listed in the sidepanel as existing, export → open the file.

**Expected** (defensive rescue verification):
- If the storage delete reparents `Leaf` to top-level automatically: `"parentId": null` in the exported group. PASS.
- If the storage delete leaves `Leaf` orphaned (future schema relaxation): the JSON export STILL rescues it to `"parentId": null`. PASS.
- FAIL if `Leaf` is missing from `groups` or its `parentId` still references the deleted `Middle` id.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-6: Preferences omission — first-run profile (AC2 · §32.5.4)

**Setup**: A fresh profile where Settings has never been opened, OR manually remove `tj:prefs` via DevTools → Application → Storage → `chrome.storage.local` → delete the `tj:prefs` row.

**Steps**:
1. Confirm `tj:prefs` is absent from storage.
2. Export → JSON backup.
3. Inspect the downloaded file's root.

**Expected**:
- The root object has NO `preferences` key at all (not `"preferences": {}`, not `"preferences": null` — absent entirely).
- `Object.keys(parsed)` returns exactly `['schemaVersion', 'exportedAt', 'items', 'groups']` (order-insensitive).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-7: Preferences present — after a persisted change (AC2 · §32.5.4)

**Setup**: Open Settings and change the theme to dark (or any other persisted preference).

**Steps**:
1. Confirm `tj:prefs` now exists in storage and contains your change.
2. Export → JSON backup.
3. Inspect the downloaded file's root.

**Expected**:
- `parsed.preferences` is present and is an object.
- `parsed.preferences.theme === 'dark'` (or whatever value you set).
- Other standard preference keys (e.g., `displayMode`, `newTabOverride`, `autoCollapseSubGroups`) appear if they are part of the persisted patch.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-8: Unicode + emoji titles round-trip byte-for-byte (Q-4 / Q-7 regression)

**Setup**: Save two bookmarks:
- Title `Café 日本語 🚀`, URL `https://unicode.example/`
- Title `日本語のブックマーク` (CJK-only), URL `https://cjk.example/`

**Steps**:
1. Export → JSON backup.
2. Open the file in a UTF-8-aware editor.
3. Run `JSON.parse` on the content in a console; inspect the titles.

**Expected**:
- Both titles appear verbatim in the file — no mojibake, no `\uXXXX` escape sequences that fail to round-trip.
- `JSON.parse(contents).items.find(i => i.url.startsWith('https://unicode')).title === 'Café 日本語 🚀'`.
- `JSON.parse(contents).items.find(i => i.url.startsWith('https://cjk')).title === '日本語のブックマーク'`.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9: Empty collection — zero items + zero groups (AC2 · AC7)

**Setup**: Start from a profile with zero saved items, zero groups, and no `tj:prefs` (fresh / empty). **DESTRUCTIVE** on a real profile — do this on a scratch profile or after backing up via UAT-1.

**Steps**:
1. Confirm the sidepanel shows no groups and no items.
2. Trigger Export → JSON backup.
3. Open the file.

**Expected**:
- A file downloads with today's date in the filename.
- Toast reads `Backup exported: tab-junkie-backup-YYYY-MM-DD.json`.
- File content parses: `{ schemaVersion: 1, exportedAt: "...", items: [], groups: [] }`.
- No `preferences` key.
- File ends with exactly one trailing newline.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-10: Large collection — 1000 items (AC11 perf)

**Setup**: Seed a 1000-item / 100-group collection. Use one of:
- (a) the dev seed helper if one is wired into the DevTools console for this build;
- (b) automated: `for (let i = 0; i < 1000; i++) { /* MSG_CREATE_ITEM via chrome.runtime.sendMessage */ }` in the side-panel DevTools console;
- (c) import a pre-prepared backup (via a scratch tool) into `tj:items` / `tj:groups` directly through DevTools → Application → Storage.

If no seeding path works, mark SKIP and document.

**Steps**:
1. Open DevTools → Performance tab.
2. Start recording.
3. Click Export → JSON backup.
4. Stop the recording once the browser download dialog appears.
5. Inspect the recording: measure time from the click event to the `download` event / blob anchor click.
6. Open the downloaded file to verify it still parses (`JSON.parse`).

**Expected**:
- Measured time is under ~1000ms (AC11 hard target is 500ms; UAT allows jitter budget).
- No main-thread long-task warnings over 200ms.
- File parses cleanly; `parsed.items.length === 1000` and `parsed.groups.length === 100`.
- File size is reasonable (roughly 150–250 KB for 1000 items).
- WARN if measurement is between 500ms and 1000ms — record the number for R6 so [solution-architect] can note as-built headroom.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-11: Determinism — export twice, diff shows only `exportedAt` (AC6)

**Setup**: Use the UAT-1 collection. No mutations between the two exports.

**Steps**:
1. Export → JSON backup. Save as `export-1.json`.
2. Without any state change, immediately Export → JSON backup again. Save as `export-2.json`.
3. Run `diff export-1.json export-2.json` in a shell.

**Expected**:
- The diff shows exactly one line differ: the `"exportedAt": "..."` field.
- All other bytes are identical — item order, group order, field order, whitespace, trailing newline.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-12: Safe-mode (read-only) export still succeeds (Q-7 regression)

**Setup**: Force the profile into safe mode. The easiest way: DevTools → Application → Storage → `tj:meta` → set `schemaVersion` to a number higher than `KNOWN_VERSION` (e.g. `999`). Reload the sidepanel. The sidepanel should show a safe-mode banner and reject mutation attempts.

**Steps**:
1. Confirm safe mode is active (mutations rejected, banner visible, or schemaVersion above KNOWN_VERSION).
2. Click Export → JSON backup.

**Expected**:
- The export succeeds even though the extension is read-only.
- File downloads with today's date and correct item/group counts.
- Toast reads `Backup exported: ...`.
- No `ERR_SAFE_MODE` toast — JSON export is intentionally absent from `WRITE_MESSAGE_TYPES`.
- After the test: reset `schemaVersion` back to `KNOWN_VERSION` (= 1) to exit safe mode.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-13: Cold service-worker export — first click after extension reload

**Setup**: Close the sidepanel. Open `chrome://extensions` and click **Service worker → stop** on Tab Junkie so the SW is idle.

**Steps**:
1. Immediately re-open the sidepanel (which wakes the SW).
2. Within the first ~100ms of the sidepanel appearing, click Export → JSON backup.

**Expected**:
- Either (a) the export succeeds normally (the dispatcher's `readyPromise` awaited migration before the handler ran), or (b) an error toast appears with user-friendly copy such as `Export failed — try again` and no partial file lands on disk.
- If an error toast appears: clicking Export a second time (after the SW is warm) succeeds.
- No uncaught exceptions in the sidepanel DevTools console (only the expected code-only `console.warn` from the error path).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-14: Keyboard-only invocation + theme focus-ring visibility (AC9 · WCAG AA)

**Steps (keyboard only — do NOT use the mouse)**:
1. Switch the extension to light theme.
2. Press Tab repeatedly until the overflow-menu button has the focus ring.
3. Press Enter to open the menu.
4. Use Tab / Arrow keys (whichever the menu uses) to move focus to the `Export → JSON backup` action. Confirm `#export-json-btn` receives a visible focus ring.
5. Press Enter to activate. File should download.
6. Switch to dark theme. Repeat steps 2–5.

**Expected**:
- Focus ring is visible at every Tab stop in both themes.
- Export activates on Enter without the mouse.
- A file downloads as in UAT-1.
- Focus-ring contrast ≥ 3:1 against the button's effective background in both themes (WCAG AA for non-text indicators).
- Menu-item text contrast ≥ 4.5:1 in both themes (WCAG AA for text).
- WARN (not FAIL) if the focus ring contrast is borderline — log against a11y follow-on, not a B-043 blocker.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-15: B-045 import-contract readiness — manual edit tolerance (note, not scored)

This case is informational — it documents the frozen-schema contract for B-045 (next sprint). It is not scored PASS/FAIL but the findings should be recorded so B-045's importer can handle them.

**Setup**: Use the file from UAT-1 or UAT-7.

**Steps**:
1. Copy the file. In a text editor, delete the entire `"preferences": { ... },` line from the root.
2. Re-save. Run `JSON.parse` on the edited file.
3. Separately: re-edit the original file and remove the trailing newline. Re-parse.
4. Re-edit: replace `"schemaVersion": 1` with `"schemaVersion": 2` (simulating a future-version file). Re-parse.

**Expected / observations to record**:
- Step 2: `JSON.parse` succeeds. The edited file (preferences removed) should be a valid B-045 input when that feature ships.
- Step 3: `JSON.parse` succeeds whether or not the trailing newline is present — the newline is a nicety, not required for parsing.
- Step 4: `JSON.parse` succeeds. B-045 will need to validate `schemaVersion <= importer's KNOWN_VERSION` and reject future-version files with a user-visible error (per AC3); note this here as a B-045 TODO.

**Status**: [ ] INFO (not scored)
**Notes**:

---

## Final UAT Summary

| # | Case | Result |
|---|------|--------|
| 1 | Happy path — 20 items × 5 groups + sub-group (AC1/2/4/5/6/8/9/10) | |
| 2 | JSON.parse round-trip (AC1/7) | |
| 3 | schemaVersion = 1 (integer) (AC3) | |
| 4 | Orphan items on group delete (AC12) | |
| 5 | Orphan sub-groups defensive rescue (AC12) | |
| 6 | Preferences omitted on first-run (§32.5.4) | |
| 7 | Preferences present after persisted change (§32.5.4) | |
| 8 | Unicode + CJK + emoji round-trip (Q-4/Q-7) | |
| 9 | Empty collection (AC2/7) | |
| 10 | 1000-item performance (AC11) | |
| 11 | Determinism — diff shows only exportedAt (AC6) | |
| 12 | Safe-mode export (Q-7) | |
| 13 | Cold SW export | |
| 14 | Keyboard-only + theme focus-ring (AC9 / WCAG AA) | |
| 15 | B-045 import-contract manual-edit (informational) | |

**Overall**: [ ] PASS / [ ] FAIL

**UAT performed by**: _______________________
**Date**: _______________________
**Browser + build**: _______________________

If any core case (UAT-1 … UAT-7, UAT-9, UAT-11, UAT-12) lands FAIL, B-043 returns to the [frontend-engineer] per Gate 3 — do not mark the sprint item done. UAT-8, UAT-10, UAT-13, UAT-14 cover regressions and performance acceptance; a FAIL there is also a Gate 3 blocker. UAT-15 is informational only and captures B-045 follow-up notes rather than blocking B-043 close.
