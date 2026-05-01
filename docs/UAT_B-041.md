# UAT — B-041 Chrome Tab Group Sync (Sprint 42)

**Sprint:** 42 (v1.36.0)
**Branch:** `feature/sprint-42-chrome-sync`
**Spec:** `docs/superpowers/specs/2026-05-01-chrome-tab-group-sync-design.md`
**R2:** `docs/design/67-b-041-chrome-tab-group-sync.md`
**Tier:** Full (M) — UAT mandatory per CLAUDE.md Gate 2 + Gate 3.

**Automated test status:** 1,892 / 1,892 passing (+66 over the 1,826 pre-S42 baseline; +3 added at R5 gap-fill). All 10 ACs have explicit PASS-criterion + FAIL-criterion coverage.

Manual test cases against the unpacked extension loaded in **Microsoft Edge** (Developer Mode → Load unpacked → repo root). Run **after** verifying the automated suite passes.

> **Edge gotcha (per user memory):** `chrome://` URLs do not work in Edge. Use `edge://extensions` and `edge://serviceworker-internals` equivalents. To force-reload the extension after changes, toggle the extension OFF then ON in `edge://extensions`.

> **Schema migration note (per CHANGELOG / R2 §67.2):** This build bumps `tj:meta.schemaVersion` from 4 → 5 and adds the optional `chromeTabGroupId: number | null` field on `tj:groups` records. Migration is **lazy**: existing v4 groups work without the field; first sync stamps it. **After updating, toggle the extension OFF then ON in `edge://extensions` once** to ensure the SW module cache is flushed before exercising sync.

> **B-041 scope:** Settings page only. Sidepanel, newtab, and popup are unchanged. Snapshot push (no live mirror), current-window only, top-level groups only. Auto-sync, Chrome → TJ pull, multi-window selector, sub-group flattening are explicitly deferred to S43+.

---

## Status legend

| Symbol | Meaning |
|---|---|
| **PASS** | Observed behavior matches PASS criterion |
| **FAIL** | Observed behavior matches FAIL criterion; route back to [frontend-engineer] |
| **WARN** | Observed but documented R2 tradeoff (not a regression) |
| **SKIP** | Could not be exercised in this run; record reason |

---

## Tester instructions

For each UAT case:
1. Read **Setup** and put the browser into the prescribed state.
2. Execute **Action** step-by-step exactly as written.
3. Compare observed behavior against **Expected** and **PASS criterion**.
4. Mark **PASS / FAIL / WARN / SKIP** in the Status column.
5. If **FAIL**: capture a screenshot of the SW console (`edge://extensions` → Tab Junkie → "Inspect views: service worker") and the Settings page, then report findings to [scrum-master] with the case number, expected vs actual, and screenshot paths.
6. Between cases, perform the **Cleanup** step at the end (or use the per-case cleanup if specified).
7. Track UAT walk-time so velocity data feeds the retrospective.

---

## Pre-conditions / Setup that applies to every case

1. **Extension load.** Load the unpacked extension from the repo root (`edge://extensions` → Developer mode ON → Load unpacked → repo root).
2. **SW console.** Open `edge://extensions` → click the Tab Junkie card → "Inspect views: service worker". Keep this tab open for every case so SW errors and warnings are visible.
3. **Schema flush.** First-time test: toggle the Tab Junkie extension OFF then ON once via `edge://extensions` to flush the SW module cache after the v4 → v5 schema bump.
4. **Baseline TJ collection.** Have a default collection with at least:
   - **Group "Work"** (color: blue) with 3 saved bookmarks whose URLs match 3 currently open live tabs in the test window.
   - **Group "Personal"** (color: pink) with 3 saved bookmarks whose URLs match 3 different currently open live tabs in the test window.
5. **Live tabs.** The test window has at least:
   - The 3 Work bookmarks open as live tabs.
   - The 3 Personal bookmarks open as live tabs.
   - 2 additional ungrouped live tabs (URLs not saved in any TJ group).
6. **Settings tab.** Open Settings via the sidepanel gear button (or `edge://extensions` → Tab Junkie → Extension options) so the test window contains a Settings tab in addition to the 8 live tabs above.

**Total per-case starting state: 9 tabs in test window** (3 Work + 3 Personal + 2 ungrouped + 1 Settings).

---

## Cleanup steps (between cases)

After each case that mutates Chrome state:
- **Reset the strip:** drag tabs back to a known order if needed (the next case's Setup will reorder them anyway).
- **Reset Chrome groups:** right-click each Chrome tab group → Ungroup. Or close the test window and reopen with the Setup-state tabs.
- **Reset stale `chromeTabGroupId`:** for tests that exercise stale-mapping recovery, the test window's Chrome tab groups must be deleted by the user but the TJ side keeps the stored mapping — this is the explicit precondition of UAT-6.
- **Verify SW console clear of errors before next case.**

For destructive-state tests (UAT-13 cold start, UAT-15 inter-window move): the case's Setup will list the specific reset.

---

## UAT-1 — First-time sync (AC1, AC4, AC5, AC6, AC8 green path)

**Priority:** H — primary acceptance test for AC1 + AC4 + AC5 + AC6 + AC8 happy path.

**Setup:**
1. Per common setup. No groups yet have a `chromeTabGroupId` (first sync after fresh install or after toggle-OFF-ON flush). Verify by opening DevTools console on the Settings page and running `chrome.storage.local.get('tj:groups').then(r => console.log(r['tj:groups'].map(g => ({name: g.name, chromeTabGroupId: g.chromeTabGroupId}))))` — all entries should have `chromeTabGroupId: undefined` or `null`.
2. Note the current order of all 9 tabs in the browser tab strip (left-to-right).

**Action:**
1. Click the **"Sync this window to Chrome"** button in Settings → **Chrome Integration**.

**Expected result:**
- The button briefly shows **"Syncing…"** with `aria-busy="true"` (cursor: progress).
- After ~1 s the button reverts to "Sync this window to Chrome" and is re-enabled.
- A green toast appears reading approximately `✓ Synced - 8 tabs - 2 groups` (count exact: 6 grouped + 2 ungrouped = 8 tabs; the Settings tab is excluded from the reorder count).
- Toast auto-dismisses after 4 seconds (or can be dismissed via the × button).
- The browser tab strip is now ordered: Work tabs (in TJ order) → Personal tabs (in TJ order) → 2 ungrouped tabs → Settings tab (the Settings tab itself is NOT moved).
- Two Chrome tab groups are visible in the strip:
  - "Work" with blue color, containing the 3 Work tabs.
  - "Personal" with pink color, containing the 3 Personal tabs.
- SW console: no errors, no warnings.

**PASS criterion:**
- Strip order matches TJ order (Work → Personal → ungrouped) AND
- Two Chrome tab groups created with correct titles + colors AND
- Toast green ✓ glyph, auto-dismisses after 4 s AND
- SW console clear.

**FAIL criterion:** Any of: wrong strip order, missing Chrome group, wrong color, red toast, SW errors, Settings tab moved.

**Validates:** AC1 (button exists + functional), AC4 (strip reorder), AC5 (Chrome group create), AC6 (color mapping blue→blue + pink→pink), AC8 green-path toast.

**Status:** _____

---

## UAT-2 — Re-sync with no changes (AC7 idempotency)

**Priority:** H — primary acceptance test for AC7 stateful mapping (re-sync uses stored `chromeTabGroupId`).

**Setup:** UAT-1 has just completed successfully. No TJ state changes; no Chrome state changes.

**Action:**
1. Click "Sync this window to Chrome" again — second consecutive click without any other intervention.

**Expected result:**
- Toast: `✓ Synced - 8 tabs - 2 groups` (same as UAT-1) but with `groupsUpdated: 2, groupsCreated: 0` semantics under the hood.
- Strip order unchanged from UAT-1.
- The TWO Chrome tab groups from UAT-1 are reused (not recreated). Verify by hovering over a Chrome tab group header — its position and color are identical to UAT-1.
- Open DevTools console → `chrome.storage.local.get('tj:groups').then(r => console.log(r['tj:groups'].map(g => g.chromeTabGroupId)))` — both groups still carry the same `chromeTabGroupId` from UAT-1.

**PASS criterion:** No duplicate Chrome groups created AND `chromeTabGroupId` values unchanged from UAT-1.

**FAIL criterion:** A 3rd or 4th Chrome tab group appears OR `chromeTabGroupId` values changed.

**Validates:** AC7 (stateful mapping reuses ID on re-sync).

**Status:** _____

---

## UAT-3 — Re-sync after TJ group rename (AC7 + TJ-wins on title)

**Priority:** M — exercises the title-overwrite path.

**Setup:** UAT-2 just completed. Two Chrome tab groups present in the strip.

**Action:**
1. In the sidepanel, rename the **Work** group to **Work-2026** (long-press header → rename, or use the edit dialog).
2. Click "Sync this window to Chrome".

**Expected result:**
- Toast: `✓ Synced - 8 tabs - 2 groups`.
- The Chrome tab group's title in the strip changes from "Work" to "Work-2026".
- Same `chromeTabGroupId` reused (no new Chrome group created).
- Personal Chrome group is unchanged.

**PASS criterion:** Chrome group renamed in place; one Chrome group with title "Work-2026"; Work's `chromeTabGroupId` unchanged in storage.

**FAIL criterion:** Chrome group keeps old "Work" title OR a new Chrome group "Work-2026" appears alongside the old "Work".

**Validates:** AC5 (`chrome.tabGroups.update` title), AC7 (mapping reused).

**Status:** _____

---

## UAT-4 — Re-sync after TJ color change (AC6 color mapping live update)

**Priority:** M — exercises the color-overwrite path including a non-identity mapping.

**Setup:** UAT-3 just completed. Work-2026 is blue.

**Action:**
1. In the sidepanel, change the Work-2026 group's color from **blue** to **teal**.
2. Click "Sync this window to Chrome".

**Expected result:**
- Toast: `✓ Synced - 8 tabs - 2 groups`.
- The Chrome tab group "Work-2026" changes color from blue to **cyan** (Chrome uses "cyan" as its label for the teal-equivalent palette slot — per the static §5 color map).

**PASS criterion:** Chrome group color is now cyan in the browser strip.

**FAIL criterion:** Color stays blue OR uses an unexpected color (grey fallback, etc).

**Validates:** AC6 (TJ teal → Chrome cyan).

**Status:** _____

---

## UAT-5 — Re-sync after manual Chrome group rename (TJ wins)

**Priority:** M — exercises Q4 "TJ wins on conflict".

**Setup:** UAT-4 just completed. Work-2026 is cyan in the Chrome strip.

**Action:**
1. In the browser tab strip, right-click the cyan **Work-2026** Chrome group → Edit group → change name to **Manual-Override** → press Enter.
2. Click "Sync this window to Chrome".

**Expected result:**
- Toast: `✓ Synced - 8 tabs - 2 groups`.
- The Chrome group's title in the strip reverts from "Manual-Override" back to "Work-2026" (TJ wins).
- `chromeTabGroupId` unchanged.

**PASS criterion:** TJ overwrites the manual rename.

**FAIL criterion:** Title stays "Manual-Override" OR a 3rd group is created.

**Validates:** AC5 (title overwrite), AC7 (mapping reused even after Chrome-side mutation).

**Status:** _____

---

## UAT-6 — Re-sync after manual Chrome group delete (AC7 stale-mapping recovery)

**Priority:** H — primary acceptance test for AC7 stale-detection branch.

**Setup:** UAT-5 just completed. Two Chrome tab groups present.

**Action:**
1. In the browser tab strip, right-click the **Work-2026** (cyan) Chrome group → **Ungroup**. The Work tabs are still open but no longer carry a Chrome group.
2. Verify in DevTools that `tj:groups[Work].chromeTabGroupId` STILL holds the now-stale numeric ID.
3. Click "Sync this window to Chrome".

**Expected result:**
- Toast: `✓ Synced - 8 tabs - 2 groups` (note: stale-mapping recovery is silent; no skip-bucket entry per spec §6 reconciled).
- A fresh Chrome tab group "Work-2026" (cyan) appears in the strip.
- Open DevTools → `chrome.storage.local.get('tj:groups')` — Work's `chromeTabGroupId` is now a NEW number, different from the pre-sync stale value.

**PASS criterion:** New Chrome group created with correct title + color; storage `chromeTabGroupId` replaced with the new ID; no error toast.

**FAIL criterion:** Sync errors out OR no Chrome group reappears OR `chromeTabGroupId` not updated.

**Validates:** AC7 stale-mapping recovery branch.

**Status:** _____

---

## UAT-7 — Sync with one pinned tab in a TJ group (AC8 partial + AC4 pinned exclusion)

**Priority:** H — primary acceptance test for AC8 yellow toast + "View details" expander.

**Setup:**
1. Reset to baseline (close test window; reopen with the Setup tab list).
2. Reset Chrome groups (Ungroup all from previous UATs).
3. **Pin** the first Work tab: right-click in the browser tab strip → **Pin**. The pinned tab now sits leftmost.
4. Verify TJ still considers the pinned tab as part of Work group (pinning is browser-side; TJ sees the URL match).

**Action:**
1. Click "Sync this window to Chrome".

**Expected result:**
- Toast appears with the **⚠** warning glyph and yellow border-left, reading approximately `⚠ Synced - 7 tabs - 2 groups - 1 skipped`.
- Below the toast text is a **View details** expander (`<details>` element, collapsed by default).
- Click "View details" — it expands to show one bullet: `1 pinned tab skipped`.
- The pinned tab remains at the leftmost position of the strip (Chrome-pinned position).
- Chrome groups: "Work" (blue, 2 tabs — without the pinned one) and "Personal" (pink, 3 tabs).

**PASS criterion:**
- Yellow toast variant with ⚠ glyph AND
- "View details" expander present AND populated with "1 pinned tab skipped" AND
- Pinned tab unmoved AND
- Pinned tab NOT a member of the Chrome "Work" group.

**FAIL criterion:** Green toast OR no expander OR pinned tab moved OR pinned tab joined a Chrome group.

**Validates:** AC4 (pinned excluded from move), AC5 (pinned excluded from group), AC8 partial yellow + expander variant.

**Cleanup:** right-click the pinned tab → **Unpin**.

**Status:** _____

---

## UAT-8 — Sync with two windows open (AC9 multi-window safety)

**Priority:** H — primary acceptance test for AC9.

**Setup:**
1. Reset baseline as in UAT-7's setup.
2. Open a **second** Edge window (Ctrl+N or right-click any tab → "Move tab to new window"). Move 3 ungrouped tabs to this second window. Note the second window's tab order.
3. Confirm the Settings tab is in the FIRST window (window A).

**Action:**
1. From Settings (in window A), click "Sync this window to Chrome".

**Expected result:**
- Toast green ✓.
- Window A's strip is reordered + 2 Chrome groups created.
- **Window B is completely untouched**: tab order matches its pre-sync order, no Chrome groups appear in window B.

**PASS criterion:** Window B's tab order is byte-identical pre/post sync AND zero Chrome groups in window B.

**FAIL criterion:** Window B's strip changes OR a Chrome group appears in window B.

**Validates:** AC9 (window targeting + multi-window safety).

**Cleanup:** close window B (its tabs may be re-merged or discarded).

**Status:** _____

---

## UAT-9 — Sync with one TJ group having zero live tabs in this window (AC5 empty-group skip)

**Priority:** M — exercises empty-group silent-skip path (R2 risk #3).

**Setup:**
1. Reset baseline.
2. In the sidepanel, create a third TJ group **"Hobbies"** with color **purple**, but DO NOT open any of its bookmarks. Hobbies has 0 live tabs in the current window.
3. Confirm Work + Personal still have their live tabs from the baseline.

**Action:**
1. Click "Sync this window to Chrome".

**Expected result:**
- Toast: `✓ Synced - 8 tabs - 2 groups`. Note: `2 groups`, not 3 — Hobbies is silently skipped because it has no live tabs.
- Chrome strip has TWO Chrome tab groups (Work, Personal). NO "Hobbies" Chrome group.
- The toast is GREEN (not yellow) — empty-group skip is NOT a `skipped[]` bucket entry per spec §6.

**PASS criterion:** Two Chrome groups in strip; Hobbies absent; green toast.

**FAIL criterion:** A purple "Hobbies" Chrome group exists in the strip with no members (Chrome rejects empty-tabIds groups; this would actually error if it slipped through), OR yellow toast with a "skipped" entry referring to the empty group.

**Validates:** AC5 empty-group skip.

**Cleanup:** Delete the Hobbies group from TJ.

**Status:** _____

---

## UAT-10 — Color mapping sweep (AC6 all 9 mappings)

**Priority:** M — pins the AC6 static map across all 9 colors. Combine into one walkthrough rather than 9 separate cases.

**Setup:**
1. Reset baseline + reset Chrome groups.
2. In TJ, ensure the test window has at least one TJ group per TJ color, each with at least one live tab matching a saved bookmark URL. The simplest setup: create 9 disposable TJ groups, each with 1 saved bookmark whose URL is one of 9 currently-open live tabs.
   - Group "Blue-test" color blue, 1 tab.
   - Group "Purple-test" color purple, 1 tab.
   - Group "Teal-test" color teal, 1 tab.
   - Group "Red-test" color red, 1 tab.
   - Group "Orange-test" color orange, 1 tab.
   - Group "Pink-test" color pink, 1 tab.
   - Group "Indigo-test" color indigo, 1 tab.
   - Group "Yellow-test" color yellow, 1 tab.
   - Group "Slate-test" color slate, 1 tab.

**Action:**
1. Click "Sync this window to Chrome".

**Expected result:** 9 Chrome tab groups appear; verify each color visually matches the mapping table:

| TJ color | Expected Chrome color label (right-click group → Edit) |
|----|----|
| blue | blue |
| purple | purple |
| teal | **cyan** |
| red | red |
| orange | orange |
| pink | pink |
| indigo | **blue** (note: indigo collapses to blue per static §5 map) |
| yellow | yellow |
| slate | **grey** |

**PASS criterion:** All 9 mappings observed correct.

**FAIL criterion:** Any mismatch (most likely a typo'd palette key falling through to grey).

**Validates:** AC6 full color-map sweep.

**Cleanup:** Delete the 9 disposable TJ groups (or close test window without saving).

**Status:** _____

---

## UAT-11 — Cold-start sync (R2 §67.6.6 SW state freshness — qa-reviewer M-6)

**Priority:** H — pins SW cold-start safety per spec §8.2.

**Setup:**
1. Reset baseline.
2. Toggle the Tab Junkie extension OFF in `edge://extensions`, then ON again. The SW is now in a **cold-restarted** state.
3. **Verify SW is fresh:** click "Inspect views: service worker" — the SW console window should show the freshly-started init log entries (e.g. messages from `runMigrations` or storage init at module-evaluation time). If the SW console has stale logs from the previous session, click the trash icon to clear.
4. Open the Settings tab via the gear button (this wakes the SW if it was suspended again).

**Action:**
1. Click "Sync this window to Chrome" — the FIRST sync after the cold start.

**Expected result:**
- Toast: `✓ Synced - 8 tabs - 2 groups` (or `groupsUpdated: 2` if the previous synced state survived the cold start).
- SW console shows the orchestrator running; no "module not loaded" or "uncaught reference" errors.
- `chromeTabGroupId` mappings persisted from previous syncs are honored (re-sync hits `chrome.tabGroups.get` then update-in-place; no duplicate groups created).

**PASS criterion:** First-sync-after-cold-start succeeds with no SW errors AND mappings honored.

**FAIL criterion:** SW console shows uncaught reference errors OR chrome.tabGroups.get throws AND the orchestrator does not recover OR duplicate Chrome groups appear.

**Validates:** Spec §8.2 SW cold-start safety; R2 §67.6.6.

**Status:** _____

---

## UAT-12 — Cold start + Chrome restarted all groups dropped (AC7 mass stale-mapping recovery)

**Priority:** M — exercises bulk stale-mapping recovery.

**Setup:**
1. Run UAT-1 to populate `chromeTabGroupId` mappings on 2 groups.
2. **Close the entire Edge browser** (File → Close, OR all Edge windows closed). This drops Chrome's tab group state but TJ keeps the stored `chromeTabGroupId` values.
3. Reopen Edge. Re-establish the 9-tab Setup (or use Edge's "Reopen recently closed" if appropriate).
4. Open Settings.

**Action:**
1. Click "Sync this window to Chrome".

**Expected result:**
- Toast: `✓ Synced - 8 tabs - 2 groups` (with `groupsCreated: 2, groupsUpdated: 0` semantically — the mappings were stale across all groups so all are "fresh creates" plus `chromeTabGroupId` replacement).
- Both Chrome tab groups appear with correct titles + colors.
- TJ storage `chromeTabGroupId` values are now NEW numbers (different from pre-restart values).

**PASS criterion:** Both Chrome groups recreated; storage IDs replaced.

**FAIL criterion:** Errors during sync OR only one group recovers.

**Validates:** AC7 bulk stale-mapping recovery across browser-restart boundary.

**Status:** _____

---

## UAT-13 — Inter-window Settings move (AC9 window capture is at click time)

**Priority:** M — exercises the "settings tab moved between syncs" edge case (R2 §67.6.2).

**Setup:**
1. Run UAT-1 in window A.
2. **Drag the Settings tab to a new window** (drag tab off the strip → drops in new window B). Window B now contains only the Settings tab.

**Action:**
1. From the Settings tab (now in window B), click "Sync this window to Chrome".

**Expected result:**
- Toast: `✓ Synced - 1 tabs - 0 groups` (the Settings tab itself is the sole tab in window B; it is excluded from the reorder, so `tabsReordered: 0` actually — refine if needed). Possibly: `Synced - 0 tabs - 0 groups` because the Settings tab is the active and only tab and is excluded.
  - **Actual expected**: window B contains 1 tab (Settings), which is the active tab and excluded from reorder via `settingsTabId`. The orchestrator finds 0 ungrouped tabs to move (Settings excluded) + 0 TJ groups with live tabs in window B (no other tabs). `tabsReordered: 0, groupsCreated: 0, groupsUpdated: 0, skipped: []`.
  - **WARN-acceptable:** the M-1 zero-result toast finding (qa-reviewer, deferred MED) means the green-toast text reads "Synced - 0 tabs - 0 groups". Future UI polish may replace with "Nothing to sync — no TJ groups with live tabs in this window". **For this UAT, the green toast with zero counts IS PASS.**
- Window A's tab strip and Chrome groups from UAT-1 are unchanged (window A was not the target).

**PASS criterion:** Window A is unchanged; window B's Settings tab is unchanged; toast appears (any green text acceptable; zero-result UX polish is a deferred enhancement).

**FAIL criterion:** Window A's strip is modified by this sync OR the Settings tab moves OR a sync error appears.

**Validates:** AC9 click-time window capture + R2 §67.6.2 Settings-self-displacement guard.

**Cleanup:** drag Settings tab back into window A; close window B.

**Status:** _____

---

## UAT-14 — Keyboard-only flow (qa-reviewer M-5 deferred)

**Priority:** M — accessibility / CLAUDE.md keyboard-first standard.

**Setup:**
1. Reset baseline. Settings tab focused.
2. Click somewhere outside the Settings page (e.g. the URL bar) to ensure no DOM focus is camped on the Sync button.

**Action:**
1. Press **Tab** repeatedly to navigate through the Settings page. Count the number of tab stops needed to reach the "Sync this window to Chrome" button.
2. When focus reaches the button, the button shows a visible focus ring (per `--focus-ring` CSS token).
3. Press **Enter** or **Space** to activate the button.

**Expected result:**
- Sync executes. Button text swaps to **"Syncing…"** during in-flight; `aria-busy="true"` is on the button (verify in DevTools → Elements panel).
- Button cursor shows as `progress` (CSS `cursor: progress` — visual cue while disabled).
- After completion: button text restored to "Sync this window to Chrome", `aria-busy` removed, button re-enabled.
- Toast appears with green/yellow/red border-left + glyph prefix.
- Focus does NOT shift away from the Sync button on toast appearance.

**PASS criterion:** Keyboard-only path works end-to-end; `aria-busy` set then cleared; focus ring visible on button.

**FAIL criterion:** Button unreachable via keyboard OR Enter/Space does not activate OR `aria-busy` not set during in-flight OR focus is stolen.

**Validates:** CLAUDE.md "Keyboard-first navigation"; qa-reviewer H-1 fix; deferred M-5.

**Status:** _____

---

## UAT-15 — Screen-reader announcement (qa-reviewer M-5 deferred — extended)

**Priority:** M — accessibility / CLAUDE.md WCAG AA.

**Setup:**
1. Reset baseline.
2. Enable a screen reader: **Windows Narrator** (Ctrl+Win+Enter on Windows) OR NVDA OR JAWS. Configure to announce text + button states.

**Action:**
1. With Narrator running, Tab to the Sync button — Narrator announces button label "Sync this window to Chrome" (plus any descriptive text like "button").
2. Activate via Enter — Narrator announces an "in-flight" cue (the button's `aria-busy="true"` + text change to "Syncing…").
3. Wait for completion. Narrator should announce the toast text via the `aria-live="assertive"` region (`role="alert"` on the toast container).

**Expected result:**
- Narrator announces "Syncing…" or equivalent when the button text swaps.
- Narrator announces the toast text (for example, "Check mark Synced 8 tabs 2 groups") after sync completes.
- The ⚠ glyph (yellow toast) or ✗ glyph (red) is announced alongside the text content for non-color WCAG 1.4.1 compliance.

**PASS criterion:** Toast text is announced; in-flight state change is audible.

**FAIL criterion:** Silent toast OR no in-flight signal.

**Note:** screen-reader announcement is intrinsically subjective. WARN with detailed observation is acceptable.

**Validates:** WCAG 1.4.1 + qa-reviewer M-5 + M-2 (non-color glyphs).

**Status:** _____

---

## UAT-16 — Concurrent dismiss + toast timer (R4 H-2 regression guard)

**Priority:** L — pins the shared toast-timer fix (R4 [code-reviewer] H-2 / commit `087f313`).

**Setup:**
1. Reset baseline + reset groups.
2. Open Settings; ensure both the **Chrome Integration** Sync button AND the Import/Export buttons are visible.

**Action:**
1. Click "Sync this window to Chrome". Toast appears (green ✓).
2. Within 2 seconds (well before the 4 s auto-dismiss), click "Export collection" (Settings → Data → Export) OR otherwise trigger an Import/Export toast.

**Expected result:**
- The Export toast appears, replacing the Sync toast.
- The Export toast remains visible for its full 4 s lifetime — it is NOT clobbered ~2 s later by the Sync toast's stale auto-dismiss timer (the H-2 ghost-timer scenario).
- After 4 s, the Export toast auto-dismisses normally.

**PASS criterion:** Export toast lives its full 4 s; no premature mid-display dismiss.

**FAIL criterion:** Export toast disappears mid-display (~2 s mark, when the Sync toast's original timer would have fired).

**Validates:** R4 H-2 [code-reviewer] ghost-timer fix.

**Status:** _____

---

## UAT-17 — Pinned tab + tab-gone mid-sync (AC8 yellow toast multi-bucket — optional)

**Priority:** L — synthetic edge case combining two skip buckets. Skip if difficult to reproduce.

**Setup:**
1. Reset baseline.
2. Pin one Work tab (as in UAT-7).
3. **Race:** stage a second Work tab to be closed mid-sync. The exact technique varies; one option: open a separate browser window to type Ctrl+W on the target tab during sync. Difficult to time reliably — **SKIP is acceptable.**

**Action:**
1. Click "Sync this window to Chrome".
2. Immediately Ctrl+W on a Work tab (other than the pinned one).

**Expected result:**
- Yellow ⚠ toast: `⚠ Synced - 6 tabs - 2 groups - 2 skipped`.
- "View details" expander: `1 pinned tab skipped` AND `1 tab closed mid-sync`.

**PASS criterion:** Both buckets present in expander.

**FAIL criterion:** Only one bucket OR sync errors out.

**WARN-acceptable:** "Could not reproduce timing" — record SKIP with reason.

**Validates:** AC8 multi-bucket yellow path; integration test `tests/sync-chrome-sync.test.js:161` covers this deterministically.

**Status:** _____

---

## Performance UAT — 50-tab sync budget (AC10 + spec §8.3)

**Priority:** M — pins the spec §8.3 "< 1 s" rough budget.

**Setup:**
1. Open ~50 tabs in the test window distributed across ~5 TJ groups (each group ~10 tabs).
2. Pre-populate matching saved bookmarks per group.

**Action:**
1. Open SW console with timing visible (DevTools → Performance tab if measuring precisely).
2. Click "Sync this window to Chrome".
3. Note start of click → toast appearance.

**Expected result:** Toast appears within ~1 s of click. SW console shows no timeout warnings.

**PASS criterion:** Wall-clock time from click to toast ≤ 1.5 s (the spec's "< 1 s" is rough; 1.5 s acceptable on Edge given mock-vs-real overhead).

**FAIL criterion:** > 5 s OR browser appears unresponsive.

**Validates:** AC10 perf budget.

**Status:** _____

---

## Sign-off checklist

- [ ] All 17 UAT cases marked PASS / WARN / SKIP (no FAIL).
- [ ] At most 2 cases marked WARN, each with a documented R2 tradeoff or known-deferred finding (e.g. M-1 zero-result toast text).
- [ ] At most 2 cases marked SKIP with reason recorded.
- [ ] No SW console errors during any sync.
- [ ] No regressions in sidepanel, newtab, or popup (open each surface and confirm ordinary navigation works).
- [ ] Performance UAT confirmed under budget on Edge.
- [ ] Tester reports findings to [scrum-master] for Gate 3 acceptance.

---

## AC ↔ UAT coverage map

| AC | Covered by |
|----|----|
| AC1 (Settings page surface) | UAT-1 (button exists + functional) + UAT-14 (keyboard reachable) |
| AC2 (schema v4→v5 governance) | Verified at extension toggle-OFF-ON in pre-conditions; storage inspectable via DevTools |
| AC3 (lazy data migration) | UAT-1 first sync stamps `chromeTabGroupId` on a previously-v4 record |
| AC4 (strip reorder) | UAT-1, UAT-7 (pinned excluded), UAT-8 (multi-window), UAT-13 (Settings excluded) |
| AC5 (Chrome group create/update) | UAT-1, UAT-3 (rename), UAT-4 (color), UAT-5 (manual rename overwrite), UAT-9 (empty skip) |
| AC6 (color mapping) | UAT-4 (teal→cyan), UAT-10 (full sweep) |
| AC7 (stateful mapping + stale detection) | UAT-2 (idempotent), UAT-3 (rename mapping reused), UAT-6 (manual delete recovery), UAT-12 (browser restart bulk recovery), UAT-11 (cold start) |
| AC8 (best-effort + summary toast) | UAT-1 (green), UAT-7 (yellow + expander), UAT-17 (multi-bucket optional) |
| AC9 (window targeting + multi-window safety) | UAT-8, UAT-13 |
| AC10 (no regressions + UAT pass) | All UAT cases + Performance UAT |
