# UAT — B-045 Import JSON backup

Sprint 18 · Full tier (M) · Round 5 UAT plan · **DEFERRED for user execution**

Related artefacts:
- `docs/BACKLOG.md` — B-045 row (17 acceptance criteria)
- `docs/SOLUTION_DESIGN.md §32.5 / §33` — JSON import allow-list, validator, repair routines, multi-partition atomic writeTransaction
- `docs/SPRINT_FINDINGS.md` — Sprint 18 Wave 4 (B-045) R4 findings (code/security/qa) and R4 fix-up notes
- `tests/b045-json-validator.test.js` (47 tests, incl. 3 prototype-pollution regression cases sec-proto-1/2/3), `tests/b045-import-dispatch.test.js` (10 tests), `tests/b045-e2e-import.test.js` (7 tests) — 64 automated cases total covering parse/validation, repair, dispatch, e2e round-trip, allow-list, XSS, prefs, and pollution defense.

Automated-suite baseline: **923 pass / 0 fail** after B-045 R5 additions (+5 over the 918 post-R4 baseline — three pollution regression tests + two structural/repair coverage fills).

This document is not executed in this session — like `docs/UAT_B-042.md`, `docs/UAT_B-043.md`, `docs/UAT_B-044.md`, `docs/UAT_B-048.md`, `docs/UAT_B-029.md`, `docs/UAT_B-059.md`, it is staged for the user to run against the ~v1.13.0 build on a real Edge profile at their convenience, before the v2 → main merge.

## Setup

The user runs **Microsoft Edge**, not Chrome. All browser URLs below use `edge://`; if the tester happens to run Chrome, substitute `chrome://`.

1. Produce the release build: `./build.sh` → `tab-junkie.zip` (~184 K). For local UAT you may load the repo root directly; the zip path is the Chrome-Web-Store artefact.
2. Load the unpacked extension:
   - Edge: `edge://extensions` → Developer Mode on → "Load unpacked" → select the repo root (or an unzipped copy of `tab-junkie.zip`).
   - Chrome: `chrome://extensions` → Developer Mode on → "Load unpacked" → select repo root.
3. Confirm Tab Junkie loads without any permission prompt and without any errors in the extension's service-worker console.
4. Open the Tab Junkie side panel.
5. **Before running any REPLACE case below, take a B-043 JSON backup** — B-045 commits a full replace and there is no post-commit undo. Use that backup as your `tab-junkie-roundtrip.json` baseline wherever "export via B-043" is called for.
6. Have ready the fixtures listed in the Appendix:
   - `tab-junkie-roundtrip.json` — minimal valid backup (5 items, 2 groups, preferences).
   - `tab-junkie-repairs.json` — backup exercising all four repair routines (orphan group, cycle, dup IDs, orphan item).
   - `tab-junkie-schemaversion-future.json` — `schemaVersion: 999`.
   - `tab-junkie-prefs-only.json` — empty items/groups, populated preferences.
   - `tab-junkie-proto-pollution.json` — `__proto__` probe input.
   - `tab-junkie-perf-1000.json` — 1000-item / 100-group perf fixture (build with the generator script in the Appendix).
   - `tab-junkie-xss.json` — javascript:/data:/`<script>` probes.
   - `tab-junkie-malformed.json` — truncated at the 200th character (mid-object, invalid JSON).
   - `tab-junkie-empty.json` — zero-byte file renamed `.json`.
   - `tab-junkie-array-root.json` — top-level `[ ]` (wrong shape).
   - `tab-junkie-dup-url.json` — two items with the same URL.
   - `tab-junkie-unknown-fields.json` — items carrying `live`, `tabId`, `favIconUrl`, `active`, `__futureField`.
7. Open DevTools on the side panel (right-click inside the panel → Inspect). Keep the **Console** and **Network** tabs available — several cases inspect network traffic and SW log lines.
8. For storage inspection, open the service-worker DevTools: `edge://extensions` → Tab Junkie → **Service worker (Inspect)** → DevTools → Application → Storage → Extension storage → Local. You can also run `await chrome.storage.local.get('tj:items')` in the SW console.

Legend: **PASS** = matches expected · **FAIL** = deviation · **WARN** = passes but with a concern to log · **SKIP** = unable to execute (document why).

## AC Coverage Summary

| AC | Description | Automated coverage | UAT case(s) | Notes |
|----|-------------|--------------------|-------------|-------|
| 1 | Entry point — Import JSON action in sidepanel header; keyboard-reachable; accept=".json"; non-JSON rejected | STRUCTURAL (button markup reviewed at R4) + `b045-import-dispatch.test.js` format-gate | UAT-1, UAT-2 | UI / file-picker filter is browser-native |
| 2 | Root-shape validation — `schemaVersion` / `exportedAt` / `items` / `groups` / optional `preferences`; rejects malformed/wrong-type | `b045-json-validator.test.js` AC2 × 11 (malformed JSON, empty, array root, primitive root, missing/mistyped keys) | UAT-4 | |
| 3 | schemaVersion gate — `=` proceeds, `<` migrates, `>` rejects with explicit toast; non-integer rejects as malformed | `b045-json-validator.test.js` AC3 × 3; `b045-import-dispatch.test.js` unknown-version dispatch | UAT-5 | |
| 4 | Count preview dialog — N items / M groups; REPLACE emphasis; Cancel default-focused; Escape cancels | STRUCTURAL + `b045-e2e-import.test.js` preview counts | UAT-3, UAT-6, UAT-7 | Dialog markup is UI; counts come from handler response |
| 5 | Auto-repair: orphaned sub-groups → parentId null; counted | `b045-json-validator.test.js` AC5 × 2 | UAT-8 | |
| 6 | Auto-repair: circular group refs → junior edge broken; self-loop → null | `b045-json-validator.test.js` AC6 × 2 + deep-nest no-overflow | UAT-9, UAT-10, UAT-24 | |
| 7 | Auto-repair: duplicate IDs — first keeps, rest re-minted; cross-refs rewritten | `b045-json-validator.test.js` AC7 × 2 + cross-ref-follow-last-written | UAT-11 | |
| 8 | Auto-repair: orphaned items → groupId null; counted | `b045-json-validator.test.js` AC8 | UAT-12 | |
| 9 | Allow-list filter — unknown fields dropped; not counted as repair | `b045-json-validator.test.js` AC9 × 2 + C-7 20-field probe | UAT-13, UAT-26 | |
| 10 | Preferences apply atomically on valid shape; invalid/missing → skipped with warning; prefs never clobber on bad input | `b045-json-validator.test.js` AC10 × 4 | UAT-14 | |
| 11 | Atomic writeTransaction across items+groups (+ prefs when AC10 applies); rollback on failure | `b045-e2e-import.test.js` atomic-replace | UAT-3, UAT-22 | |
| 12 | Duplicate-URL default-skip — first wins, rest counted | `b045-json-validator.test.js` AC12 × 2 (exact dup + normalize-equivalent dup) | UAT-15 | |
| 13 | Performance — 1000 items / 100 groups end-to-end ≤ 1000ms P95 | `b045-e2e-import.test.js` perf-budget | UAT-16 | UAT uses 2s allowance for jitter |
| 14 | Zero network — no fetch/XHR/beacon/WebSocket on import path | STRUCTURAL — runtime-observable only | UAT-17 | Verified via DevTools Network |
| 15 | XSS safety — javascript:/data: URLs dropped; `<script>` in title survives as literal text via textContent | `b045-json-validator.test.js` AC15 × 2 | UAT-18 | |
| 16 | Success toast — `"Imported N items, M groups. K repairs."` (K omitted when 0); `role="status"`/`aria-live="polite"` | PARTIAL — `b045-e2e-import.test.js` toast-copy; ARIA structural | UAT-19 | |
| 17 | Out of scope — replace-only, no merge, no downgrade, no undo | N/A — negative scope | UAT-27 (round-trip illustrates replace-only) | |

**R4 fix-up / additional coverage UAT cases:**

| Topic | Description | UAT case |
|-------|-------------|----------|
| Prototype pollution | `__proto__` probe at item / root / preferences — `Object.prototype.polluted` remains undefined | `b045-json-validator.test.js` sec-proto-1, sec-proto-2, sec-proto-3 (automated) + UAT-25 (manual confirmation) |
| Focus return | Focus returns to Import JSON button after dialog close (Cancel / Escape / Replace) | UAT-7 |
| Double-click defense | Rapid-click on Import JSON and Replace — no double-import | UAT-21 |
| Dark-mode contrast | REPLACE emphasis readable in dark theme | UAT-20 |
| Keyboard-only flow | End-to-end Tab/Enter/Escape path with no mouse | UAT-28 |
| Preferences-only backup | Current behavior is "Backup contains no bookmarks" + abort — prefs NOT applied; DOCUMENT for Sprint 18 ship | UAT-23 |
| Large-file SW cap | 11 MiB JSON rejected with `ERR_VALIDATION`; 9 MiB accepted | UAT-29 |
| UNREPAIRABLE threshold | Craft a backup that survives parse + root check but repairs can't resolve → `ERR_UNREPAIRABLE` | UAT-30 |

## Test Cases

### UAT-1: Entry point — Import JSON button visible & keyboard-reachable (AC1)

**Steps**:
1. Open the side panel. With focus in the panel header, press **Tab** repeatedly.
2. Observe the focus ring walk across the header buttons.
3. Continue until the Import-JSON action receives focus (in the same overflow menu as B-044's Import HTML — submenu labeled "Import → JSON backup").
4. Read the focused element's accessible name via DevTools Accessibility pane → "Name" field.

**Expected**:
- The Import JSON button/menu-item is reachable via Tab only (no mouse).
- Accessible name contains "Import" and "JSON" (e.g. "Import JSON backup").
- Focus ring visible in both light and dark themes.
- Tab order is stable — does not skip the action.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-2: Activate via Enter AND Space (AC1)

**Steps**:
1. Tab to the Import JSON action. Press **Enter**.
2. Observe the native Open-File picker opens with the `.json` filter active.
3. Cancel the picker. Re-focus the action. Press **Space**.
4. Observe the picker opens again.

**Expected**:
- Both Enter and Space open the native file picker.
- Picker's default file-type filter shows `JSON` / `.json` — non-JSON files are either hidden or visibly greyed.
- No visible mouse interaction required.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-3: File-picker filter — `.json` accepted; non-JSON rejected pre-parse (AC1)

**Steps**:
1. Click the Import JSON action → picker opens.
2. Select `tab-junkie-roundtrip.json`. Confirm it's selectable.
3. Cancel. Reopen the picker. Switch filter to "All files" and select a plain `.txt` file.
4. Repeat with a `.html` file (e.g. an HTML bookmarks export).
5. Repeat with an extension-less file.

**Expected**:
- `.json` file opens the preview dialog cleanly.
- Non-JSON extensions trigger the inline toast **"Please select a .json file"** — no parse is attempted, no confirmation dialog opens.
- `tj:items` / `tj:groups` remain byte-identical to pre-test state in every rejection path.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-4: Parse / root-shape errors — malformed JSON, empty file, wrong root, missing keys (AC2)

**Setup**: `tab-junkie-malformed.json` (truncated mid-object), `tab-junkie-empty.json` (zero bytes, `.json` extension), `tab-junkie-array-root.json` (top-level `[]`).

**Steps**:
1. Import `tab-junkie-malformed.json`. Observe toast.
2. Import `tab-junkie-empty.json`. Observe toast.
3. Import `tab-junkie-array-root.json`. Observe toast.
4. Using an editor, hand-craft a JSON with only `{"schemaVersion": 1}` (missing `exportedAt`/`items`/`groups`), save as `tab-junkie-missing-keys.json`, and import. Observe toast.
5. Craft another JSON with `items` as a string instead of an array. Import. Observe.
6. Check `edge://extensions` → SW Inspect → Console — confirm no titles or URLs are logged.

**Expected**:
- Malformed JSON → toast mapped from `ERR_INVALID_FORMAT` (e.g. `"File is not valid JSON and cannot be imported"`).
- Empty file → toast mapped from `ERR_EMPTY_FILE` (e.g. `"File is empty"`).
- Wrong root / missing required keys / mistyped keys → toast mapped from `ERR_MALFORMED_ROOT` (e.g. `"Backup file is malformed and cannot be imported"`).
- In every case: no preview dialog opens, no storage mutation, SW console only logs error codes (no PII).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-5: schemaVersion gate — future-version rejected with explicit copy (AC3)

**Setup**: `tab-junkie-schemaversion-future.json` — a valid backup with `"schemaVersion": 999`.

**Steps**:
1. Backup current state via B-043 (`tab-junkie-pre-uat5.json`) as insurance.
2. Import `tab-junkie-schemaversion-future.json`.
3. Observe the result.
4. Inspect `tj:items` / `tj:groups` in SW storage — must be unchanged.
5. Dismiss the toast (click × / press Escape). Confirm it goes away without any follow-on mutation.

**Expected**:
- Toast matches exactly: **"Backup was created in a newer version. Please update Tab Junkie before importing."** (mapped from `ERR_UNKNOWN_SCHEMA_VERSION`).
- No preview dialog opens.
- Zero storage mutation (confirm via pre/post `chrome.storage.local.get`).
- Toast is dismissible.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-6: Preview dialog surfaces exact counts + REPLACE emphasis + ARIA roles (AC4)

**Setup**: `tab-junkie-roundtrip.json` — known contents (5 items across 2 groups, preferences present).

**Steps**:
1. Import `tab-junkie-roundtrip.json`.
2. Observe the confirmation dialog. Read the body text.
3. In DevTools Elements, inspect the dialog root — must carry `role="dialog"` and `aria-modal="true"`.
4. Verify the phrase containing **REPLACE** is visually emphasised (bold + warning color). Inspect the emphasised node in the Elements panel.
5. Verify the count line contains **"5 items in 2 groups"** (or equivalent post-repair counts for the fixture you prepared).
6. Verify both the filename (`tab-junkie-roundtrip.json`) and the counts are visible in the dialog body.

**Expected**:
- Dialog counts match the fixture's post-repair totals.
- REPLACE emphasis visually distinct.
- `role="dialog"` + `aria-modal="true"` present.
- Cancel button visible and default-focused (confirm in UAT-7).
- Primary "Replace and import" button visible, destructive-styled per B-062 dark-theme contrast.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-7: Cancel default-focused; Escape cancels; focus returns to trigger (AC4, fix-up)

**Steps (keyboard-only)**:
1. Tab to Import JSON → Enter → picker opens. Pick `tab-junkie-roundtrip.json`.
2. When the dialog opens, verify **Cancel** has default focus (NOT Replace).
3. Press **Escape**.
4. Confirm: dialog closes, no mutation toast fires, storage untouched.
5. Without moving the mouse, check that focus has returned to the Import JSON trigger (DevTools Elements tab `:focus` indicator works).
6. Repeat, this time pressing **Enter** on Cancel — focus should again return to Import JSON.
7. Repeat once more, this time clicking the grey backdrop outside the dialog — same focus-return behavior.

**Expected**:
- Cancel is default-focused every open.
- Escape, backdrop click, and explicit Cancel all close the dialog without any storage mutation.
- After close, focus returns to the Import JSON trigger in all three paths.
- No "Imported N items" toast on any cancellation path.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-8: Auto-repair — orphaned sub-groups → null parent (AC5)

**Setup**: Hand-craft `tab-junkie-orphan-group.json`:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-04-19T00:00:00Z",
  "items": [],
  "groups": [
    {"id":"01H00000000000000000000001","name":"Child","parentId":"01H99999999999999999999999","color":"#4F46E5","sortOrder":0,"collapsed":false,"createdAt":1700000000000,"updatedAt":1700000000000}
  ]
}
```

(`parentId` points at an ID that does NOT exist in `groups`.)

**Steps**:
1. Take a B-043 backup of current state.
2. Import `tab-junkie-orphan-group.json`. In the preview dialog, look for any repair-summary line (even if the header toast counts them, the preview may name them).
3. Click "Replace and import".
4. Read the success toast — expect `"Imported 0 items, 1 groups. 1 repair."` (or similar wording; key field is `1 repair`).
5. Inspect `tj:groups` in SW storage.
6. In the side panel, confirm the group "Child" now appears at the top level (parentId null).

**Expected**:
- Orphaned group survives the import (not dropped).
- Stored `parentId` is `null`.
- Success toast includes at least `1 repair`.
- No console errors.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9: Auto-repair — circular group references broken (AC6)

**Setup**: Hand-craft `tab-junkie-cycle.json` with two groups A and B that point at each other:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-04-19T00:00:00Z",
  "items": [],
  "groups": [
    {"id":"01H0AAAAAAAAAAAAAAAAAAAAAA","name":"A","parentId":"01H0BBBBBBBBBBBBBBBBBBBBBB","color":"#4F46E5","sortOrder":0,"collapsed":false,"createdAt":1700000000000,"updatedAt":1700000000000},
    {"id":"01H0BBBBBBBBBBBBBBBBBBBBBB","name":"B","parentId":"01H0AAAAAAAAAAAAAAAAAAAAAA","color":"#059669","sortOrder":1,"collapsed":false,"createdAt":1700000001000,"updatedAt":1700000001000}
  ]
}
```

**Steps**:
1. Backup via B-043.
2. Import `tab-junkie-cycle.json`.
3. In the preview, confirm counts show 0 items and 2 groups.
4. Replace and import.
5. Success toast: `"Imported 0 items, 2 groups. 1 repair."` (one edge broken).
6. Inspect `tj:groups` — at least one of {A,B} now has `parentId: null`. Traverse the tree in the side panel: no infinite expand, no crash.

**Expected**:
- Both A and B survive in storage.
- The cycle is broken: at least one `parentId` becomes `null`.
- Junior-side edge is broken (the one with the greater `createdAt` — in this fixture, group B's `parentId` is the one nulled).
- Sidepanel renders without hanging.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-10: Auto-repair — self-loop parentId=self → null (AC6)

**Setup**: Hand-craft `tab-junkie-self-loop.json`:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-04-19T00:00:00Z",
  "items": [],
  "groups": [
    {"id":"01H0CCCCCCCCCCCCCCCCCCCCCC","name":"SelfLoop","parentId":"01H0CCCCCCCCCCCCCCCCCCCCCC","color":"#4F46E5","sortOrder":0,"collapsed":false,"createdAt":1700000000000,"updatedAt":1700000000000}
  ]
}
```

**Steps**:
1. Import → Replace.
2. Read the repair count in the success toast (should be ≥ 1).
3. Inspect `tj:groups` in SW storage.

**Expected**:
- Group survives. `parentId` is `null`.
- Repair count includes this break.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-11: Auto-repair — duplicate item IDs re-minted (AC7)

**Setup**: Hand-craft `tab-junkie-dup-ids.json`:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-04-19T00:00:00Z",
  "items": [
    {"id":"01H0DDDDDDDDDDDDDDDDDDDDDD","title":"First","url":"https://one.example/","groupId":null,"sortOrder":0,"createdAt":1700000000000,"updatedAt":1700000000000},
    {"id":"01H0DDDDDDDDDDDDDDDDDDDDDD","title":"Second","url":"https://two.example/","groupId":null,"sortOrder":1,"createdAt":1700000001000,"updatedAt":1700000001000}
  ],
  "groups": []
}
```

**Steps**:
1. Import → Replace.
2. Inspect `tj:items` in SW storage.
3. Confirm both "First" and "Second" are present; each has a unique `id`.
4. Read the success toast — repair count ≥ 1.

**Expected**:
- Both items survive; neither is dropped or silently merged.
- IDs are unique in storage.
- Repair count reported in toast.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-12: Auto-repair — orphaned item → Ungrouped (AC8)

**Setup**: Hand-craft `tab-junkie-orphan-item.json`:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-04-19T00:00:00Z",
  "items": [
    {"id":"01H0EEEEEEEEEEEEEEEEEEEEEE","title":"Orphan","url":"https://orphan.example/","groupId":"01H0ZZZZZZZZZZZZZZZZZZZZZZ","sortOrder":0,"createdAt":1700000000000,"updatedAt":1700000000000}
  ],
  "groups": []
}
```

(`groupId` points at a non-existent group.)

**Steps**:
1. Import → Replace.
2. Confirm success toast shows `1 item, 0 groups. 1 repair.`
3. Inspect `tj:items` — "Orphan" has `groupId: null`.
4. In the side panel, confirm "Orphan" appears in the Ungrouped pinned section.

**Expected**:
- Item survives with `groupId: null`.
- Repair count includes the re-parent.
- Sidepanel renders the item under Ungrouped.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-13: Allow-list filter drops unknown fields (AC9)

**Setup**: `tab-junkie-unknown-fields.json` — item records carrying `favIconUrl`, `live`, `active`, `tabId`, `__futureField`, and group records carrying `__metaField`.

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-04-19T00:00:00Z",
  "items": [
    {"id":"01H0FFFFFFFFFFFFFFFFFFFFFF","title":"AllowList","url":"https://ok.example/","groupId":null,"sortOrder":0,"createdAt":1700000000000,"updatedAt":1700000000000,"favIconUrl":"https://tracker.example/f.ico","live":true,"active":true,"tabId":42,"__futureField":"snake-oil"}
  ],
  "groups": []
}
```

**Steps**:
1. Import → Replace.
2. Open the SW DevTools console. Run:
   ```js
   await chrome.storage.local.get('tj:items')
   ```
3. Inspect the returned object. Read every key on the single item.

**Expected**:
- Item exists in storage with only the allow-listed keys: `id`, `title`, `url`, `groupId`, `sortOrder`, `createdAt`, `updatedAt`, and (when present) `lastAccessedAt`.
- None of: `favIconUrl`, `live`, `active`, `tabId`, `__futureField` appear in the stored row.
- Repair count does NOT include the dropped keys (per AC9 they are silently dropped, not counted).
- Network tab shows **zero** requests to `tracker.example` (the `favIconUrl` is never fetched).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-14: Preferences apply / skip / fill defaults (AC10)

**Setup**: Three hand-crafted files:

- `tab-junkie-prefs-valid.json` — items:[{one valid item}], groups:[{one valid group}], `preferences: { "theme": "dark", "displayMode": "sidepanel", "newTabOverride": false, "autoCollapseSubGroups": false }`.
- `tab-junkie-prefs-bad-theme.json` — same structure but `preferences.theme: 42` (wrong type).
- `tab-junkie-prefs-partial.json` — same structure, `preferences: { "theme": "dark" }` (missing optional keys).

**Steps**:
1. Reset preferences to default (clear `tj:prefs` in SW storage, or launch a fresh profile).
2. Import `tab-junkie-prefs-valid.json` → Replace. Confirm side panel switches to dark theme. Inspect `tj:prefs` — matches the imported object.
3. Reset prefs. Import `tab-junkie-prefs-bad-theme.json` → Replace. Confirm success toast notes `"preferences skipped (invalid shape)"` (non-blocking). Items/groups still import. Theme does NOT change.
4. Reset prefs. Import `tab-junkie-prefs-partial.json` → Replace. Confirm `theme: "dark"` is applied AND missing keys fall back to defaults (don't clobber to undefined).

**Expected**:
- Valid prefs apply atomically alongside items + groups (single writeTransaction).
- Bad-shape prefs are skipped with a soft warning; items/groups still import.
- Partial-shape prefs merge with defaults (no clobber on missing keys).
- On any failure path, storage is never left in a half-written state (items+groups+prefs either all commit or none commit).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-15: Duplicate-URL default-skip (AC12)

**Setup**: `tab-junkie-dup-url.json`:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-04-19T00:00:00Z",
  "items": [
    {"id":"01H0GGGGGGGGGGGGGGGGGGGGGG","title":"First","url":"https://same.example/","groupId":null,"sortOrder":0,"createdAt":1700000000000,"updatedAt":1700000000000},
    {"id":"01H0HHHHHHHHHHHHHHHHHHHHHH","title":"Second","url":"https://same.example/","groupId":null,"sortOrder":1,"createdAt":1700000001000,"updatedAt":1700000001000}
  ],
  "groups": []
}
```

**Steps**:
1. Import → Replace.
2. Inspect `tj:items`. Count items with URL `https://same.example/`.

**Expected**:
- Exactly one item in storage with URL `https://same.example/`. Title is **"First"** (document-order-first wins).
- "Second" is not in storage.
- Repair count in the success toast accounts for the skip.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-16: Performance — 1000 items / 100 groups ≤ 2s perceived end-to-end (AC13)

**Setup**: Build `tab-junkie-perf-1000.json` with the generator in the Appendix (1000 items, 100 groups, no defects).

**Steps**:
1. Open DevTools → Performance tab. Start recording.
2. Click Import JSON → pick `tab-junkie-perf-1000.json` → when preview opens, click **Replace and import**.
3. Stop recording once the success toast appears.
4. Measure the elapsed time from the Replace-and-import click to the success toast.
5. Check `tj:items.length === 1000`, `tj:groups.length === 100`.
6. Import again (same file, Replace) and observe perceived responsiveness.

**Expected**:
- End-to-end wall-clock < **2000ms** on a dev-class machine (AC13 target is 1000ms P95; UAT allows a 2x jitter budget).
- Parse + validate + repair phase alone < 500ms (visible as the span from file-read to dialog-open).
- No long-tasks > 200ms during the commit phase.
- Sidepanel UI remains responsive — scroll works during commit (or trigger is visibly disabled / aria-busy).
- WARN (not FAIL) if elapsed lands between 1000ms and 2000ms — log the number for R6 review.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-17: Zero network traffic during import (AC14)

**Steps**:
1. Open DevTools → Network tab. Click Clear. Ensure "Preserve log" is on and no filters are active.
2. Import `tab-junkie-roundtrip.json` → Replace and import.
3. After the success toast and the sidepanel re-render, read the Network tab.

**Expected**:
- **Zero** network requests originate from the extension during the import flow.
- No favicon fetches — items render with letter-avatar fallback until live tab-match supplies favicons.
- No `chrome-extension://`-origin `fetch`, XHR, or beacon requests.
- Right-click any network entry that appears and check the Initiator — must not be the extension.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-18: XSS probe — javascript: / data: dropped; `<script>` in title survives as literal text (AC15)

**Setup**: `tab-junkie-xss.json`:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-04-19T00:00:00Z",
  "items": [
    {"id":"01H0IIIIIIIIIIIIIIIIIIIIII","title":"jsprobe","url":"javascript:alert(1)","groupId":null,"sortOrder":0,"createdAt":1700000000000,"updatedAt":1700000000000},
    {"id":"01H0JJJJJJJJJJJJJJJJJJJJJJ","title":"dataprobe","url":"data:text/html,<script>alert(1)</script>","groupId":null,"sortOrder":1,"createdAt":1700000000000,"updatedAt":1700000000000},
    {"id":"01H0KKKKKKKKKKKKKKKKKKKKKK","title":"</div><script>alert(1)</script>","url":"https://ok.example/","groupId":null,"sortOrder":2,"createdAt":1700000000000,"updatedAt":1700000000000}
  ],
  "groups": []
}
```

**Steps**:
1. Import → observe preview. No `alert()` fires at preview time.
2. Click Replace and import. No `alert()` fires during commit.
3. Scroll the side panel to the imported items. No `alert()` fires during render.
4. Hover each imported row. No `alert()` fires.
5. Inspect `tj:items` in SW storage.
6. In the DOM, find the `https://ok.example/` row. Inspect its title-rendering node — confirm the text is set via `textContent` (no child `<script>` node present).

**Expected**:
- Zero `alert()` calls at any stage (preview, commit, render, hover).
- `tj:items` contains **only** the `https://ok.example/` row.
- The stored title is the literal string `</div><script>alert(1)</script>` — untouched entity-wise, never interpreted as markup.
- SW console logs no PII; only error codes appear for the two dropped items.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-19: Success toast format + ARIA live-region + no PII (AC16)

**Setup**: Open DevTools → Console. Clear. Enable "Verbose" log level.

**Steps**:
1. Import `tab-junkie-roundtrip.json` → Replace and import.
2. Read the success toast.
3. In DevTools, inspect the toast container — must carry `role="status"` and `aria-live="polite"`.
4. Scroll through the console output during the import — from click through ~5 seconds after the toast appears.
5. Repeat with `tab-junkie-repairs.json` (has non-zero repair count) — confirm toast includes the `K repairs` segment.
6. Repeat with a clean backup that needed zero repairs — confirm the `K repairs` segment is omitted.

**Expected**:
- Toast copy: `"Imported N items, M groups. K repairs."` (K omitted when zero).
- `role="status"` + `aria-live="polite"` present on the toast container.
- Auto-dismisses around 4 seconds.
- Console contains **zero** log lines with any imported bookmark title or URL. Only error/type codes acceptable.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-20: Dark-mode contrast on REPLACE emphasis (R4 fix-up)

**Steps**:
1. Switch the extension theme to dark.
2. Import `tab-junkie-roundtrip.json`. When the confirmation dialog opens, DO NOT click Replace.
3. In DevTools → Elements, select the node carrying the REPLACE emphasis.
4. Switch to the Accessibility pane. Check the "Contrast ratio" measurement against the effective background.
5. Switch theme back to light. Repeat.
6. Cancel the dialog at the end.

**Expected**:
- Contrast ratio ≥ **4.5:1** in both themes (WCAG AA normal text).
- The REPLACE emphasis is visually distinct — legible at a glance, not washed out.
- WARN (not FAIL) if ratio is between 3.0:1 and 4.5:1 — log as a11y follow-on, not a B-045 blocker.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-21: Double-click defense — no double-import (R4 fix-up)

**Setup**: `tab-junkie-perf-1000.json` (larger file amplifies the race window).

**Steps**:
1. Rapidly double-click (or triple-click) the Import JSON action.
2. When the picker opens, pick `tab-junkie-perf-1000.json`.
3. In the preview dialog, rapidly double-click **Replace and import**.
4. Wait for the success toast.
5. Inspect `tj:items.length` and `tj:groups.length`.

**Expected**:
- Only one file picker opens.
- Only one preview dialog opens.
- Only one commit runs. Success toast reads `"Imported 1000 items, 100 groups."` (or `+ K repairs` if the fixture has defects) — NOT 2000 items or 200 groups.
- `tj:items.length === 1000`, `tj:groups.length === 100`.
- While commit is in flight, the Replace button is visibly disabled (`aria-busy="true"` or disabled attribute).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-22: Atomic rollback — safe-mode aborts import cleanly (AC11)

**Setup**: Force safe mode. DevTools → Application → Storage → extension local → `tj:meta` → set `schemaVersion` to a number higher than `KNOWN_VERSION` (e.g. `999`). Reload the side panel.

**Steps**:
1. Confirm safe mode: sidepanel shows a read-only banner.
2. Click Import JSON → pick `tab-junkie-roundtrip.json`.
3. Observe.
4. Read `tj:items` and `tj:groups` — must be unchanged.
5. Reset `tj:meta.schemaVersion` back to `KNOWN_VERSION` to exit safe mode.

**Expected**:
- Import rejects before commit. Error toast matches the safe-mode mapping (e.g. `"Cannot import while in safe mode"`).
- `tj:items` / `tj:groups` identical to pre-test state.
- No partial writes observable.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-23: Preferences-only backup — current behavior (QA MEDIUM #1 — DOCUMENT)

**Setup**: `tab-junkie-prefs-only.json`:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-04-19T00:00:00Z",
  "items": [],
  "groups": [],
  "preferences": {
    "theme": "dark",
    "displayMode": "sidepanel",
    "newTabOverride": false,
    "autoCollapseSubGroups": false
  }
}
```

**Steps**:
1. Reset theme to light (or system).
2. Import `tab-junkie-prefs-only.json`. Observe the toast.
3. Check `tj:prefs` — has the theme changed?
4. Check `tj:items` / `tj:groups` — unchanged?

**Expected (current Sprint 18 ship behavior)**:
- Toast: `"Backup contains no bookmarks"` (or equivalent empty-backup guard) — import is aborted.
- `tj:prefs` is **not** updated — the dark theme in the file is NOT applied.
- `tj:items` / `tj:groups` are unchanged.

**Decision point**: this is the QA MEDIUM #1 finding. Scrum-master deferred it for user judgment. If you want prefs-only imports to apply prefs in a future sprint, file a follow-on B-0xx from UAT. PASS here means **current behavior matches this specification** — it is **not** a failure of AC10 because AC10 only guarantees valid-shape prefs apply when the backup is otherwise non-empty.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-24: Deeply nested parent chain (50 levels, no cycle) survives without overflow

**Setup**: `tab-junkie-deep-chain.json` — 50 groups where `group[i].parentId === group[i-1].id` and `group[0].parentId === null`. Use this generator (save as `build-deep.mjs`, run `node build-deep.mjs > tab-junkie-deep-chain.json`):

```js
const groups = [];
for (let i = 0; i < 50; i += 1) {
  groups.push({
    id: `01H0XXXXXXXXXXXXXXXXXX${String(i).padStart(4, '0')}`,
    name: `L${i}`,
    parentId: i === 0 ? null : `01H0XXXXXXXXXXXXXXXXXX${String(i - 1).padStart(4, '0')}`,
    color: '#4F46E5',
    sortOrder: i,
    collapsed: false,
    createdAt: 1700000000000 + i,
    updatedAt: 1700000000000 + i,
  });
}
console.log(JSON.stringify({
  schemaVersion: 1,
  exportedAt: '2026-04-19T00:00:00Z',
  items: [],
  groups,
}, null, 2));
```

**Steps**:
1. Import → preview should open without hanging.
2. Click Replace and import. Wait for success toast.
3. Inspect `tj:groups.length` — should equal 50 (no groups dropped).

**Expected**:
- No stack overflow.
- No RangeError in console.
- All 50 groups land in storage.
- Repair count depends on whether depth-cap flattening applies — document observed behavior.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-25: Prototype-pollution probe — `Object.prototype` not mutated

**Setup**: `tab-junkie-proto-pollution.json`:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-04-19T00:00:00Z",
  "items": [
    {"id":"01H0PPPPPPPPPPPPPPPPPPPPPP","title":"Probe","url":"https://probe.example/","groupId":null,"sortOrder":0,"createdAt":1700000000000,"updatedAt":1700000000000,"__proto__":{"polluted":true}}
  ],
  "groups": []
}
```

**Steps**:
1. Open the SW DevTools console. Clear it.
2. Import `tab-junkie-proto-pollution.json` → Replace.
3. In the SW console, run:
   ```js
   Object.prototype.polluted
   ```
4. Also run:
   ```js
   ({}).polluted
   ```
5. Inspect `tj:items` — the Probe item should be present with only allow-listed keys.

**Expected**:
- Both `Object.prototype.polluted` and `({}).polluted` return **`undefined`**.
- The `__proto__` payload never made it to `Object.prototype`.
- Allow-list iteration by construction prevents pollution (automated tests sec-proto-1/2/3 cover this — UAT confirms behavior in a real extension).
- The Probe item exists in storage without `__proto__` or `polluted` keys.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-26: Unknown-field drop confirmation via storage inspection (AC9)

**Steps**:
1. After UAT-13 has run (or re-run it now with `tab-junkie-unknown-fields.json`).
2. In SW DevTools console, run:
   ```js
   const {['tj:items']: items} = await chrome.storage.local.get('tj:items');
   console.log(items.map(it => Object.keys(it).sort()));
   ```
3. Read the array of key lists printed.

**Expected**:
- Every item's key list contains **only** the allow-listed fields: `createdAt`, `groupId`, `id`, `sortOrder`, `title`, `updatedAt`, `url` (plus `lastAccessedAt` when stored).
- No `favIconUrl`, `live`, `active`, `tabId`, `__futureField`, `__proto__` keys.
- Same check on `tj:groups` yields only: `collapsed`, `color`, `createdAt`, `id`, `name`, `parentId`, `sortOrder`, `updatedAt`.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-27: Round-trip B-043 → B-045 — content preserved, IDs re-minted (AC11)

**Steps**:
1. In a seeded profile with ~20 items across 3-4 groups, export via B-043 → `roundtrip-1.json`.
2. Note the number of items and groups in the side panel.
3. Change one or two things (add an item, rename a group, toggle an item's group assignment).
4. Import `roundtrip-1.json` → Replace and import.
5. Confirm the sidepanel now matches the **pre-change** state content-wise (same titles, URLs, group names, parent relationships).
6. Compare the stored IDs with those in `roundtrip-1.json` — **they will differ** (ULIDs are re-minted on import per the documented R3 deviation; see `b045-json-validator.test.js` ULID C-4 tests).

**Expected**:
- Content round-trip preserved: titles, URLs, group names, parent relationships.
- IDs differ (documented expected deviation — every imported item/group gets a fresh ULID, and cross-references are rewritten consistently).
- Repair count may be 0 (clean export).
- No data loss.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-28: Keyboard-only end-to-end flow

**Steps** (no mouse from step 1 onward):
1. Focus the side panel (click once to enter focus; then hands off mouse).
2. Tab to the Import JSON action.
3. Enter → picker opens.
4. Use arrow keys / keyboard to select `tab-junkie-roundtrip.json` → Enter.
5. Dialog opens; Cancel is focused.
6. Tab to "Replace and import" → Enter.
7. Wait for success toast.

**Expected**:
- Entire flow completable by keyboard.
- At no point is a mouse click required.
- Focus is explicit at every step (Cancel default-focus on dialog open; Tab moves to Replace).
- On dialog close, focus returns to the Import JSON trigger.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-29: Large-file SW cap — 9 MiB accepted, 11 MiB rejected (OPTIONAL manual, automated covered)

The SW-side 10 MiB cap is primarily covered by the automated `b045-import-dispatch.test.js` content-size test. Crafting an 11 MiB valid JSON file by hand is painful; this case is **OPTIONAL** for manual runs.

**If you want to run it**:
1. Adapt the 1000-item generator in the Appendix to produce a file of ~9 MiB (pad item titles or URLs to increase size). Save as `tab-junkie-9mb.json`.
2. Adapt again for ~11 MiB → `tab-junkie-11mb.json`.
3. Import `tab-junkie-9mb.json` → expect successful import.
4. Import `tab-junkie-11mb.json` → expect rejection toast (mapped from `ERR_VALIDATION`).

**Expected**:
- 9 MiB file: imports cleanly within perceptual performance budget.
- 11 MiB file: rejection toast; zero storage mutation.
- If the UI-side cap kicks in first (e.g. 5 MiB UI cap), that's also acceptable — mark PASS with a note.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-30: UNREPAIRABLE case — survives parse+root, defeats repairs (OPTIONAL)

Crafting a genuine UNREPAIRABLE case (one that survives `JSON.parse` + root validation but cannot be repaired) is non-trivial. The automated test `b045-json-validator.test.js` case **"non-empty source that survives neither normalize nor repair → ERR_UNREPAIRABLE"** exercises this path.

**If you want to reproduce manually**: craft a file where every item has an invalid URL (e.g., `javascript:` on every row) AND no groups. Every item gets dropped, yielding an empty post-repair collection but a non-empty source — this is the documented "UNREPAIRABLE" threshold.

Example fixture `tab-junkie-unrepairable.json`:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-04-19T00:00:00Z",
  "items": [
    {"id":"01H0UUUUUUUUUUUUUUUUUUUUUU","title":"Bad1","url":"javascript:alert(1)","groupId":null,"sortOrder":0,"createdAt":1700000000000,"updatedAt":1700000000000},
    {"id":"01H0VVVVVVVVVVVVVVVVVVVVVV","title":"Bad2","url":"data:text/html,foo","groupId":null,"sortOrder":1,"createdAt":1700000000000,"updatedAt":1700000000000}
  ],
  "groups": []
}
```

**Steps**:
1. Import.
2. Observe toast / dialog behavior.

**Expected**:
- Either the validator raises `ERR_UNREPAIRABLE` with a user-visible toast (e.g. `"Backup could not be repaired — no items survived validation"`), OR the preview dialog shows `0 items, 0 groups` and user may Cancel.
- No storage mutation in either outcome.
- If behavior differs from the automated test's `ERR_UNREPAIRABLE` expectation, flag as a FAIL for R3 review.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

## Final UAT Summary

| # | Case | Result |
|---|------|--------|
| 1 | Entry point / button exists / keyboard-reachable (AC1) | |
| 2 | Activate via Enter AND Space (AC1) | |
| 3 | File-picker `.json` accepted; non-JSON rejected (AC1) | |
| 4 | Parse / root-shape errors (AC2) | |
| 5 | schemaVersion gate — future rejected with explicit copy (AC3) | |
| 6 | Preview dialog counts + REPLACE + ARIA (AC4) | |
| 7 | Cancel default-focus; Escape cancels; focus returns (AC4, fix-up) | |
| 8 | Auto-repair: orphaned sub-groups (AC5) | |
| 9 | Auto-repair: circular group refs (AC6) | |
| 10 | Auto-repair: self-loop (AC6) | |
| 11 | Auto-repair: duplicate IDs (AC7) | |
| 12 | Auto-repair: orphaned items (AC8) | |
| 13 | Allow-list filter — unknown fields dropped (AC9) | |
| 14 | Preferences — valid / invalid / partial (AC10) | |
| 15 | Duplicate-URL default-skip (AC12) | |
| 16 | Performance — 1000 items / 100 groups (AC13) | |
| 17 | Zero network traffic (AC14) | |
| 18 | XSS — javascript:/data:/`<script>` inert (AC15) | |
| 19 | Success toast format + ARIA + no PII (AC16) | |
| 20 | Dark-mode REPLACE contrast (fix-up) | |
| 21 | Double-click defense (fix-up) | |
| 22 | Atomic rollback — safe-mode aborts (AC11) | |
| 23 | Preferences-only backup (QA MEDIUM #1 — DOCUMENT) | |
| 24 | Deeply nested parent chain (no-overflow) | |
| 25 | Prototype-pollution probe (sec-proto confirmation) | |
| 26 | Unknown-field drop confirmation via storage (AC9) | |
| 27 | Round-trip B-043 → B-045 content (IDs re-mint) | |
| 28 | Keyboard-only end-to-end flow | |
| 29 | SW-side 10 MiB cap (security) — OPTIONAL | |
| 30 | UNREPAIRABLE threshold — OPTIONAL | |

**Overall**: [ ] PASS / [ ] FAIL

**UAT performed by**: _______________________
**Date**: _______________________
**Browser + build**: _______________________

If any case UAT-1 … UAT-22, UAT-24 … UAT-28 lands FAIL, B-045 returns to the [frontend-engineer] per Gate 3 — do not mark the sprint item done. UAT-23 (preferences-only) is a DOCUMENTATION case reflecting current ship behavior: FAIL here should result in a new backlog item (whether to allow prefs-only imports) but does NOT block B-045. UAT-29 (10 MiB cap) and UAT-30 (UNREPAIRABLE) are OPTIONAL — the automated suite is authoritative.

## Risks surfaced by this UAT plan (recommend as backlog candidates)

- **R-1 (QA MEDIUM #1 carry-through)**: If UAT-23 surfaces user feedback that prefs-only imports should apply prefs (instead of aborting), file a backlog item "allow preferences-only JSON import" with AC for the new behavior and a decision point on whether to surface via a distinct "Import preferences" action or to relax the empty-backup guard in B-045.
- **R-2**: UAT-29 (SW-side 10 MiB cap) is hard to manually reproduce without tooling. Consider a dev-only console helper that synthesises oversize `MSG_IMPORT_COLLECTION` payloads so QA can exercise the SW-cap branch without a real 11 MiB file (applies equally to B-044 and B-045).
- **R-3**: ID re-mint is an intentional R3 deviation from B-043's export-preserves-ID spec; UAT-27 documents this. Long-term users may want an "identity-preserving import" mode (e.g., for restore-from-same-profile). File as a future backlog item if users raise it.
- **R-4**: UAT-30 (UNREPAIRABLE threshold) depends on behavior of an edge case that is expensive to exercise by hand. If future repairs ever lower the threshold (e.g., more defects become auto-recoverable), this UAT case may need rewriting. Automated coverage is authoritative.

## Appendix — fixture build recipes

### `tab-junkie-roundtrip.json`

The recommended source is a real B-043 export — take one from your seeded profile before UAT begins. Alternatively, hand-craft a minimal valid backup:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-04-19T12:00:00Z",
  "items": [
    {"id":"01H0R1AAAAAAAAAAAAAAAAAAAA","title":"One","url":"https://one.example/","groupId":"01H0G1AAAAAAAAAAAAAAAAAAAA","sortOrder":0,"createdAt":1700000000000,"updatedAt":1700000000000},
    {"id":"01H0R2AAAAAAAAAAAAAAAAAAAA","title":"Two","url":"https://two.example/","groupId":"01H0G1AAAAAAAAAAAAAAAAAAAA","sortOrder":1,"createdAt":1700000000000,"updatedAt":1700000000000},
    {"id":"01H0R3AAAAAAAAAAAAAAAAAAAA","title":"Three","url":"https://three.example/","groupId":"01H0G2AAAAAAAAAAAAAAAAAAAA","sortOrder":0,"createdAt":1700000000000,"updatedAt":1700000000000},
    {"id":"01H0R4AAAAAAAAAAAAAAAAAAAA","title":"Four","url":"https://four.example/","groupId":null,"sortOrder":0,"createdAt":1700000000000,"updatedAt":1700000000000},
    {"id":"01H0R5AAAAAAAAAAAAAAAAAAAA","title":"Five","url":"https://five.example/","groupId":null,"sortOrder":1,"createdAt":1700000000000,"updatedAt":1700000000000}
  ],
  "groups": [
    {"id":"01H0G1AAAAAAAAAAAAAAAAAAAA","name":"Alpha","parentId":null,"color":"#4F46E5","sortOrder":0,"collapsed":false,"createdAt":1700000000000,"updatedAt":1700000000000},
    {"id":"01H0G2AAAAAAAAAAAAAAAAAAAA","name":"Beta","parentId":null,"color":"#059669","sortOrder":1,"collapsed":false,"createdAt":1700000000000,"updatedAt":1700000000000}
  ],
  "preferences": {
    "theme": "light",
    "displayMode": "sidepanel",
    "newTabOverride": false,
    "autoCollapseSubGroups": false
  }
}
```

### `tab-junkie-repairs.json`

Hand-crafted backup exercising all four repair routines in a single file — orphan group, cycle, duplicate IDs, orphan item.

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-04-19T12:00:00Z",
  "items": [
    {"id":"01H0I1AAAAAAAAAAAAAAAAAAAA","title":"DupA","url":"https://dup.example/a","groupId":"01H0G1AAAAAAAAAAAAAAAAAAAA","sortOrder":0,"createdAt":1700000000000,"updatedAt":1700000000000},
    {"id":"01H0I1AAAAAAAAAAAAAAAAAAAA","title":"DupB","url":"https://dup.example/b","groupId":"01H0G1AAAAAAAAAAAAAAAAAAAA","sortOrder":1,"createdAt":1700000001000,"updatedAt":1700000001000},
    {"id":"01H0I2AAAAAAAAAAAAAAAAAAAA","title":"Orphan","url":"https://orphan.example/","groupId":"01H0ZZZZZZZZZZZZZZZZZZZZZZ","sortOrder":0,"createdAt":1700000000000,"updatedAt":1700000000000}
  ],
  "groups": [
    {"id":"01H0G1AAAAAAAAAAAAAAAAAAAA","name":"Normal","parentId":null,"color":"#4F46E5","sortOrder":0,"collapsed":false,"createdAt":1700000000000,"updatedAt":1700000000000},
    {"id":"01H0G2AAAAAAAAAAAAAAAAAAAA","name":"OrphanChild","parentId":"01H0YYYYYYYYYYYYYYYYYYYYYY","color":"#059669","sortOrder":1,"collapsed":false,"createdAt":1700000001000,"updatedAt":1700000001000},
    {"id":"01H0G3AAAAAAAAAAAAAAAAAAAA","name":"CycleA","parentId":"01H0G4AAAAAAAAAAAAAAAAAAAA","color":"#DC2626","sortOrder":2,"collapsed":false,"createdAt":1700000002000,"updatedAt":1700000002000},
    {"id":"01H0G4AAAAAAAAAAAAAAAAAAAA","name":"CycleB","parentId":"01H0G3AAAAAAAAAAAAAAAAAAAA","color":"#D97706","sortOrder":3,"collapsed":false,"createdAt":1700000003000,"updatedAt":1700000003000}
  ]
}
```

Expected repairs: 1 dup-id, 1 orphan item, 1 orphan group, 1 cycle-break = 4 repairs (plus any duplicate-URL sweep if normalize collapses the two dup-example URLs — they won't in this fixture because paths differ).

### `tab-junkie-schemaversion-future.json`

```json
{
  "schemaVersion": 999,
  "exportedAt": "2026-04-19T12:00:00Z",
  "items": [],
  "groups": []
}
```

### `tab-junkie-prefs-only.json`

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-04-19T12:00:00Z",
  "items": [],
  "groups": [],
  "preferences": {
    "theme": "dark",
    "displayMode": "sidepanel",
    "newTabOverride": false,
    "autoCollapseSubGroups": false
  }
}
```

### `tab-junkie-proto-pollution.json`

See UAT-25 for the inline fixture.

### `tab-junkie-perf-1000.json` — build with Node

Save as `build-perf.mjs`, run `node build-perf.mjs > tab-junkie-perf-1000.json`:

```js
const groups = [];
const items = [];
for (let g = 0; g < 100; g += 1) {
  groups.push({
    id: `01H0GRP${String(g).padStart(22, '0')}`,
    name: `Group${g}`,
    parentId: null,
    color: '#4F46E5',
    sortOrder: g,
    collapsed: false,
    createdAt: 1700000000000 + g,
    updatedAt: 1700000000000 + g,
  });
  for (let i = 0; i < 10; i += 1) {
    const idx = g * 10 + i;
    items.push({
      id: `01H0ITM${String(idx).padStart(22, '0')}`,
      title: `Item ${idx}`,
      url: `https://site-${idx}.example/`,
      groupId: `01H0GRP${String(g).padStart(22, '0')}`,
      sortOrder: i,
      createdAt: 1700000000000 + idx,
      updatedAt: 1700000000000 + idx,
    });
  }
}
console.log(JSON.stringify({
  schemaVersion: 1,
  exportedAt: '2026-04-19T12:00:00Z',
  items,
  groups,
}, null, 2));
```

Result: 1000 items × 100 groups, no defects. Used for UAT-16 and UAT-21.

### `tab-junkie-xss.json`

See UAT-18 for the inline fixture.

### `tab-junkie-unknown-fields.json`

See UAT-13 for the inline fixture.

### `tab-junkie-dup-url.json`

See UAT-15 for the inline fixture.

### `tab-junkie-malformed.json`

Take any valid JSON fixture from the list above, open it in a text editor, delete the last 100+ characters (so the JSON is unparseable), save.

### `tab-junkie-empty.json`

Create a zero-byte file with `.json` extension:

```bash
: > tab-junkie-empty.json
```

### `tab-junkie-array-root.json`

```json
[]
```

### `tab-junkie-9mb.json` / `tab-junkie-11mb.json` (OPTIONAL)

Adapt `build-perf.mjs` above to emit an item count × padded title length that lands between 9 MiB and 11 MiB. `ls -lh` to verify size.
