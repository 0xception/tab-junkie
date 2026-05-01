# UAT — B-137 Floating-Tab `liveTabId` Join-Key Adoption (Schema v3 → v4)

**Sprint:** 41 (v1.35.0)
**Branch:** `feature/sprint-41-floating-tab-id`
**Spec:** `docs/design/66-b-137-floating-tab-id-join-key.md` (R2)
**Tier:** Full (M) — UAT mandatory per CLAUDE.md Gate 2
**Subsumes:** B-131 (sibling-title displacement), Issue 2 (post-S40 R0 spike), Issue 3 (floating reorder race toast)

**R3 file changes (production):**
- `background/storage/migration.js` (KNOWN_VERSION 3→4 + v3→v4 no-op step)
- `background/storage/shapes.js` (defaultShape v4 + OPTIONAL `liveTabId` validator)
- `background/tabs/floating-groups.js` (`appendFloatingGroup` stamp · `_resolveRecordIndexByTabId` 2-tier · `moveFloatingTab` preservation · `reassociateFloatingGroups` lazy-rewrite · `pruneResolvedFloatingGroups` patch branch)
- `background/tabs/floating-members.js` (3-tier join: liveTabId → position → URL)
- `background/tabs/tab-events.js` (caller passes `tab.id` to `appendFloatingGroup`)

**R5 test additions:** +17 net new tests over S41 baseline (1,782 → 1,799). Includes T1 sibling-displacement, T32 race-toast, T33 MOVE_FLOATING preservation, T34 ATTACH-seed, B-137 §66.15 case 10 mixed v3+v4 dedup, defaultShape literal pin (L-3), v3→v4 lazy-migration step, lazy-rewrite cold-start.

**Automated test status:** **1,799 / 1,799 PASS** (3.1 s; clean baseline; no flake).

Manual test cases against the unpacked extension loaded in **Edge** (Developer Mode → Load unpacked → repo root). Run **after** verifying the automated suite passes.

> **Edge gotcha (per user memory):** `chrome://` URLs do not work in Edge. Use `edge://extensions` and the Inspect-views pattern below. To force-reload the extension after changes, toggle the extension OFF then ON in `edge://extensions` (NOT just the Reload button — see UAT-12 for the SW module-cache flush procedure).

> **SW inspection:** Open `edge://extensions` → "Tab Junkie" card → "Inspect views: service worker" to view SW console logs. The `tj:floatingGroups` storage record can be inspected via `await chrome.storage.local.get('tj:floatingGroups')` from the SW REPL. The `tj:meta` schema version: `await chrome.storage.local.get('tj:meta')`.

> **Reload-vs-toggle:** B-137 is a schema bump (v3 → v4). The "Reload" button on the extension card is sufficient for **most** cases. UAT-12 specifically exercises the **OFF then ON** toggle that flushes the SW module cache — required after a real update from v1.34.1 → v1.35.0 because Chrome MV3 caches the previous SW module bytecode.

| Symbol | Meaning |
|---|---|
| **PASS** | Observed behavior matches PASS criteria |
| **FAIL** | Observed behavior matches FAIL criteria; route back to [frontend-engineer] |
| **WARN** | Observed but documented R2 tradeoff (not a regression) |
| **SKIP** | Could not be exercised in this run; record reason |

**Setup that applies to every case below:**
1. Load unpacked extension from repo root.
2. Open the side panel.
3. Have at least the bookmarks listed per case seeded in the active collection. Add bookmarks via the existing Add-Bookmark flow if missing.
4. Have the SW console open (per "SW inspection" above) so any thrown errors during cold-start are visible.

---

## UAT-1 — B-131 spawn-from-bookmark repro: opener-chain new tab title is correct (M-1 mandatory)

**Priority:** H — primary acceptance test. Walks the actual user-visible flow that filed B-131. The unit-test `T1` covers the structural-fix mechanism (`tier (a) liveTabId direct-match wins over tier (b) position-match`) but does NOT walk the `chrome.tabs.onCreated` → `walkOpenerChain` → `appendFloatingGroup` end-to-end path that the user actually triggers.

**Setup:**
1. Create a group **G** (e.g., name "B-131 Repro"). Add ONE saved bookmark **Parent A** under **G** with a URL containing outbound links (e.g., `https://example.com/`).
2. Click **Parent A** in the side panel — a tab opens, **Parent A** auto-claims (live indicator on the row).
3. Inside Parent A's tab, **middle-click** the in-page link to spawn a child tab **Child-1**. **Child-1** appears as a floating row under **Parent A** in **G** (B-121 contract).
4. Repeat step 3 to spawn **Child-2**, **Child-3** under **Parent A**. The side panel now shows three floating rows under **Parent A**: Child-1, Child-2, Child-3 (each with the spawned tab's actual title).
5. Confirm via SW REPL: `await chrome.storage.local.get('tj:floatingGroups')` returns three records. Each record carries a `liveTabId: <numeric>` field (v4 shape).

**Action (the actual B-131 user-visible repro):**
1. With Child-1, Child-2, Child-3 floating rows visible, focus Child-1's tab and **drag-reorder** Child-1 to position 2 (between Child-2 and Child-3). The side panel updates the visual order.
2. Now focus **Parent A**'s tab and **middle-click** a NEW in-page link to spawn **Child-4**. The new tab opens.
3. Switch back to the side panel.

**Expected result:**
- **Child-4** appears as a NEW floating row under **Parent A** (NOT replacing any sibling).
- **Child-4's title matches the new tab's title** (NOT a sibling's title — Child-1, Child-2, or Child-3's title).
- The three pre-existing floating rows (Child-1, Child-2, Child-3) retain THEIR original titles.
- SW console: no errors.

**PASS criterion:** Child-4 row title matches the new live tab's title; siblings' titles unchanged; four floating rows visible under Parent A.

**FAIL criterion:** Child-4's row shows a sibling's title (Child-1 / Child-2 / Child-3) — this is the B-131 bug pre-fix. OR any sibling's title silently changes to Child-4's title.

**Validates:** AC1 + AC2 + AC7 (T1 unit-test) — the structural fix (`liveTabId` join key) eliminates the position-collision misjoin that B-131 reported.

---

## UAT-2 — Mode-b primary fix carry-forward (B-132): pre-existing floating tabs survive extension reload

**Priority:** H — confirms B-132 contract still holds post-B-137; validates lazy `liveTabId` rewrite during cold-start re-bind (AC5).

**Setup:**
1. With UAT-1's state (4 floating rows under Parent A), inspect SW REPL: `await chrome.storage.local.get('tj:floatingGroups')`. Note the four records and their `liveTabId` values. ALL four should carry `liveTabId: <numeric>` (v4 shape).

**Action:**
1. Click the **Reload** button on the Tab Junkie card in `edge://extensions`.
2. Re-open the side panel.

**Expected result:**
- All four floating rows STILL appear under **Parent A**.
- Each row's title still matches its live tab's title (no displacement).
- SW REPL post-reload: `await chrome.storage.local.get('tj:floatingGroups')` — all four records STILL carry `liveTabId` (the v4 field). Cold-start `reassociateFloatingGroups` ran and re-validated; if any tab id was reused / changed, the field was lazily rewritten.
- `await chrome.storage.local.get('tj:meta')` — `{ schemaVersion: 4, ... }`.

**PASS criterion:** Four floating rows visible; all four storage records carry `liveTabId`; `tj:meta.schemaVersion === 4`.

**FAIL criterion:** Any floating row disappears OR any `liveTabId` is missing OR `tj:meta.schemaVersion !== 4`.

**Validates:** B-132 cold-start contract preserved + AC5 (cold-start lazy rewrite).

---

## UAT-3 — Issue 3 root cause structural fix: floating drag-reorder does NOT fire ERR_RACE toast under load

**Priority:** H — confirms the post-S40 race-toast at `tests/b134-tab-drag-reorder.test.js` T32 maps to a real-world clean run.

**Setup:**
1. UAT-1 setup: 4 floating rows under Parent A.
2. Open ONE additional unrelated tab to a slow-loading page (e.g., a SPA that takes ~2-3 seconds to settle: a Twitter / Mastodon profile, or a heavy doc page).

**Action:**
1. Just as the slow-loading page is settling (the title is updating, content is rendering), rapidly drag-reorder the four floating rows under Parent A: Child-1 → end of list, then Child-3 → start of list, then Child-4 → middle. Do this within ~2 seconds (rapid sequence of drops).
2. Observe the side panel for any error toast.
3. Inspect SW console for errors.

**Expected result:**
- All four reorders complete cleanly.
- No `ERR_RACE` toast fires.
- The final ordering matches the user's drop sequence.
- SW console: no errors.

**PASS criterion:** No race toast; final ordering matches drops; no SW errors.

**FAIL criterion:** `ERR_RACE` toast fires OR final ordering does NOT match the drop sequence OR SW logs an error.

**WARN criterion:** A brief visual "snap-back" mid-drag (a row rendering at its old position for a frame after drop) — record as observed; the structural fix prevents the race-error but does not eliminate every SW round-trip.

**Validates:** Issue 3 structural fix — tier (a) `liveTabId` direct-match resolves drag-reorder targets without depending on `LiveTabIndex.entry.index` parity. T32 (`tests/b134-tab-drag-reorder.test.js:1027-1071`) covers this with a mocked stale-index; UAT-3 confirms the realistic race window is also clean.

---

## UAT-4 — Mixed v3+v4 transitional state: storage inspection during the migration window

**Priority:** H — confirms C-9 case 4 (mixed v3+v4 transitional records) under realistic update conditions.

**Setup (build an artificial v3 record alongside v4 records):**
1. UAT-1 setup: 4 v4 floating rows under Parent A. Confirm via SW REPL all four records carry `liveTabId`.
2. In the SW console, write an EXTRA legacy v3 record (no `liveTabId`) into the `tj:floatingGroups` partition, simulating a record left over from v1.34.1:
   ```
   const cur = (await chrome.storage.local.get('tj:floatingGroups'))['tj:floatingGroups'] || [];
   const sample = cur[0]; // any v4 record to copy parent context from
   if (!sample) throw new Error('UAT-4: setup needs a v4 record to copy context — re-run UAT-1');
   const v3Record = {
     floatingTabId: 'ft-uat4-legacy',
     groupId: sample.groupId,
     parentItemId: sample.parentItemId,
     windowId: 999,           // unmatched window — record cannot resolve
     tabIndex: 999,
     url: 'https://uat4-legacy.example/no-such-tab',
     savedAt: Date.now() - 86400000, // pretend it was saved a day ago
     /* deliberately NO liveTabId — legacy v3 record */
   };
   await chrome.storage.local.set({ 'tj:floatingGroups': [...cur, v3Record] });
   ```
3. Verify: `await chrome.storage.local.get('tj:floatingGroups')` shows 5 records — 4 with `liveTabId`, 1 without.

**Action:**
1. Click **Reload** on the Tab Junkie card.
2. Re-open the side panel.
3. Inspect storage: `await chrome.storage.local.get('tj:floatingGroups')`.

**Expected result:**
- The 4 v4 records render normally as floating rows under Parent A.
- The 1 v3 record (`ft-uat4-legacy`) does NOT render (no matching live tab — `(windowId 999, tabIndex 999)` does not exist; URL also unmatched).
- The v3 record REMAINS in storage post-cold-start (per AC9 — record kept for future re-resolution).
- No "phantom row" double-render under Parent A — the H-2 dedup gate holds.
- `tj:meta.schemaVersion === 4`.

**PASS criterion:** 4 floating rows render; the 5th (v3 unmatched) does not render but persists in storage; `tj:meta.schemaVersion === 4`; no SW errors.

**FAIL criterion:** Phantom row appears OR a v4 record's title is taken by the v3 record's URL OR the v3 record is deleted from storage (would break AC9).

**Cleanup:** `await chrome.storage.local.set({ 'tj:floatingGroups': cur });` (restore the original 4-record state).

**Validates:** C-9 case 4 (mixed v3+v4) + qa LOW L-2 (now also pinned in `tests/floating-multi.test.js` via the new B-137 §66.15 case 10 test).

---

## UAT-5 — Stale `liveTabId` race: rapid close + reopen of a floating tab (security T-2)

**Priority:** M — exercises the §66.9 self-correction window (security-reviewer T-2 advisory). Confirms no persistent wrong-tab association.

**Setup:**
1. UAT-1 setup: 4 floating rows under Parent A.
2. Note the current tab id of **Child-2** in the side panel (or the SW REPL: `await chrome.tabs.query({})` and find the matching url).

**Action:**
1. Close **Child-2**'s tab via the browser tab strip (NOT via the side panel).
2. Within ~1 second, focus Parent A's tab and **middle-click** a new in-page link to spawn a new tab **Child-2'**.
3. Switch back to the side panel.
4. Observe the floating-row list for ~5 seconds.

**Expected result:**
- The Child-2 floating row disappears (the tab was closed; record may persist briefly per AC9 but does NOT render).
- A new floating row appears for **Child-2'** with the new tab's title.
- The new row's title MATCHES Child-2's live title (the new tab); it does NOT show Child-2 (closed)'s old title persistently.
- SW console: no errors.

**PASS criterion:** New row title matches Child-2'; no persistent old-title display; no SW errors.

**FAIL criterion:** The new row shows Child-2's old title for more than one render frame OR a SW error fires OR the new row is missing entirely.

**WARN criterion:** A single-frame visual flicker where the new row briefly shows Child-2's old title before snapping to Child-2''s title — record as observed; the §66.9.3 self-correcting transient is acceptable per R2 LOCK Option B (no URL-guard at tier (a)).

**Validates:** §66.9 stale-`liveTabId` defense + R3-VERIFY 1 LOCK Option B self-correction.

---

## UAT-6 — Tab-close during cold-start re-bind window (security T-1)

**Priority:** M — exercises atomic write transaction during a tab close + cold-start race. The integration-test `chrome-mock` cannot reproduce this; UAT is the only signal class.

**Setup:**
1. UAT-1 setup: 4 floating rows under Parent A.
2. Confirm 4 records in storage via SW REPL.

**Action:**
1. Open `edge://extensions`.
2. Set up the action sequence so step 3 + 4 happen as close together as humanly possible (ideally < 1 second apart):
   - Step 3: Close **Child-3**'s tab via the browser tab strip.
   - Step 4: Click the **Reload** button on the Tab Junkie card.
3. CLOSE Child-3's tab.
4. CLICK Reload immediately.
5. Wait ~3 seconds for cold-start to complete.
6. Re-open the side panel.
7. Inspect SW REPL: `await chrome.storage.local.get('tj:floatingGroups')`.

**Expected result:**
- The side panel renders cleanly (no error toast, no broken layout).
- Child-1, Child-2, Child-4 floating rows visible (3 rows); Child-3 row may or may not appear depending on whether the cold-start ran before or after the close (both outcomes are correct per AC9).
- Storage shows EITHER 3 records (Child-3 was pruned because its live tab was closed before the writeTransaction committed) OR 4 records (Child-3's record persisted because it was already in the patch set at the moment of writeTransaction commit). NEVER a partial-mutation state (e.g., a record with `liveTabId` set to an invalid value or missing fields).
- SW console: no errors.

**PASS criterion:** Side panel renders cleanly; storage is in one of the two valid end-states (3 or 4 records, each fully shaped).

**FAIL criterion:** Storage contains a partially-shaped record (e.g., `liveTabId` set to a closed tab id with no other field changed) OR the side panel renders an error toast OR the SW console logs an unhandled error.

**WARN criterion:** Race could not be reproduced — record as SKIP with a note that the race window is small.

**Validates:** §66.7 cold-start atomicity (B-001b writeTransaction guarantee) + security T-1.

---

## UAT-7 — Schema migration fresh install: new install lands at v4 directly

**Priority:** M — confirms C-1a fresh-install seeding (no v3 → v4 step required).

**Setup:**
1. WIPE the extension's storage to simulate a fresh install. From the SW console:
   ```
   await chrome.storage.local.clear();
   await chrome.storage.session.clear();
   ```
2. Click **Reload** on the Tab Junkie card to re-trigger the cold-start.

**Action:**
1. Re-open the side panel (it should show the empty / first-run state).
2. Inspect storage:
   ```
   await chrome.storage.local.get('tj:meta');
   await chrome.storage.local.get('tj:floatingGroups');
   ```

**Expected result:**
- `tj:meta.schemaVersion === 4` (the literal pinned in `defaultShape(PARTITION_META)`).
- `tj:floatingGroups` is `undefined` or `[]` (no records yet on a fresh install).
- The side panel shows the empty / first-run state cleanly (no error).

**PASS criterion:** `schemaVersion === 4` on fresh install; no v3 records exist.

**FAIL criterion:** `schemaVersion !== 4` (defaultShape literal regression) OR a v3 record exists OR SW throws.

**Cleanup:** Re-create your test bookmarks via the side panel UI to restore your typical UAT setup.

**Validates:** C-1a paired-bump invariant (defaultShape literal) — also pinned automatically by the new R5 L-3 test.

---

## UAT-8 — Update from v3 (v1.34.1) to v4 (v1.35.0): real-world update flow

**Priority:** H — exercises the most realistic upgrade path. **REQUIRES** a saved v1.34.1 install (or an artificial v3-shaped storage state).

**Setup A (real-world — preferred):**
1. Before installing v1.35.0, back up the extension state at v1.34.1: from a v1.34.1 install, ensure several floating rows exist under various parents (UAT-1-style state).
2. Confirm `tj:meta.schemaVersion === 3` and storage records do NOT carry `liveTabId`.

**Setup B (artificial — fallback if no v1.34.1 install available):**
1. From a v1.35.0 install, force the storage to a v3 shape:
   ```
   const cur = (await chrome.storage.local.get('tj:floatingGroups'))['tj:floatingGroups'] || [];
   const v3Records = cur.map(({ liveTabId, ...rest }) => rest);
   await chrome.storage.local.set({ 'tj:floatingGroups': v3Records });
   await chrome.storage.local.set({ 'tj:meta': { schemaVersion: 3, createdAt: Date.now() } });
   ```
2. Confirm: `await chrome.storage.local.get('tj:meta')` → `{ schemaVersion: 3, ... }`. Records do NOT carry `liveTabId`.

**Action:**
1. (Setup A only) Update the extension to v1.35.0 by replacing the unpacked source: `git pull` to the v1.35.0 commit. Click **Reload** on the Tab Junkie card.
2. (Setup B) Click **Reload** on the Tab Junkie card.
3. Wait ~2 seconds for cold-start to complete.
4. Re-open the side panel.

**Expected result:**
- All pre-existing floating rows STILL render correctly (legacy v3 records resolve via tier (b) position fallback in `buildFloatingMembers`).
- `await chrome.storage.local.get('tj:meta')` → `{ schemaVersion: 4, ... }` (the v3 → v4 no-op migration step ran).
- After cold-start `reassociateFloatingGroups`, the records that matched a live tab were lazy-rewritten to carry `liveTabId`. Verify: `await chrome.storage.local.get('tj:floatingGroups')` — at least the records whose live tabs were resolved during cold-start now have `liveTabId: <numeric>`.
- Records whose live tabs were NOT resolved (e.g., the live tab was closed) remain v3 (no `liveTabId`); they will be lazy-rewritten on the NEXT cold-start when their live tab is matched.
- SW console: no errors.

**PASS criterion:** `schemaVersion === 4` post-update; floating rows still render; resolved records carry `liveTabId`.

**FAIL criterion:** `schemaVersion !== 4` (migration step did not run) OR floating rows disappear (validator rejected v3 records — would break C-7 allow-list direction) OR SW throws.

**Validates:** AC4 (v3→v4 lazy migration) + AC5 (cold-start lazy rewrite) + C-1b (lazy migration semantics).

---

## UAT-9 — B-130 dotted-green visual unaffected (regression guard)

**Priority:** M — confirms B-130 floating-row visual is preserved.

**Setup:**
1. UAT-1 setup: 4 floating rows under Parent A.

**Action:**
1. Visually inspect the floating rows in the side panel.

**Expected result:**
- Each floating row has the dotted-green left border (B-130 visual contract).
- No visual regression (no new background tint, no missing border, no spacing change).

**PASS criterion:** Dotted-green border present on each floating row; no other visual change.

**FAIL criterion:** Border missing OR color changed OR spacing changed.

**Validates:** B-130 visual contract — B-137 production diff has zero CSS/HTML changes (per security review §16).

---

## UAT-10 — B-122 drag-to-root unaffected (regression guard)

**Priority:** M — confirms the B-122 sub-group drag-to-root flow does not regress.

**Setup:**
1. Create two groups: parent **G1** and child sub-group **G2** under G1.
2. Add some saved bookmarks to G2.

**Action:**
1. Drag G2 from under G1 to the root level.
2. Confirm G2 appears at root with its saved bookmarks intact.
3. No `ERR_RACE` toast fires.
4. SW console: no errors.

**Expected result:**
- G2 now at root level with all bookmarks present.
- No race toast.
- No SW errors.

**PASS criterion:** Drag-to-root succeeds cleanly; G2 at root; no race toast.

**FAIL criterion:** Race toast OR G2 lands incorrectly OR bookmarks lost.

**Validates:** B-122 contract preserved.

---

## UAT-11 — Multi-window: floating tabs across W1 + W2 post-update

**Priority:** M — confirms B-137 cold-start `reassociateFloatingGroups` correctly iterates all windows' tabs.

**Setup:**
1. Open two browser windows: **W1** and **W2**. Open the side panel in each.
2. In W1: build UAT-1 state (Parent A claimed; 2 floating rows under it).
3. In W2: click any saved bookmark (or a different one); spawn a floating tab via middle-click.
4. Confirm both windows' side panels show their respective floating rows.

**Action:**
1. Click **Reload** on the Tab Junkie card in `edge://extensions`.
2. Re-open the side panel in BOTH windows.

**Expected result:**
- Both W1's and W2's floating rows survive the reload.
- Each row's title matches its live tab.
- Storage: all records carry `liveTabId` (or are lazy-rewritten on cold-start).
- SW console: no errors.

**PASS criterion:** All floating rows visible in both windows post-reload; titles correct.

**FAIL criterion:** Any floating row missing OR misrouted to the wrong window's panel OR title displaced.

**Validates:** AC5 multi-window cold-start coverage.

---

## UAT-12 — SW module-cache flush: toggle OFF then ON (mandatory after real update)

**Priority:** H — confirms the user-facing flush instruction (CHANGELOG note for v1.35.0). Without this toggle, Chrome MV3 may cache the v1.34.1 SW bytecode and the new tier-(a) join code may not activate until the next browser restart.

**Setup:**
1. After installing v1.35.0 (or after a `git pull` + Reload), confirm UAT-8 PASS.
2. UAT-1 setup: 4 floating rows under Parent A.

**Action:**
1. In `edge://extensions`, find the Tab Junkie card.
2. Toggle the extension OFF (the slider). Wait ~2 seconds.
3. Toggle the extension ON. Wait ~3 seconds for cold-start to complete.
4. Re-open the side panel.
5. Drag-reorder one of the floating rows under Parent A.
6. SW REPL: `await chrome.storage.local.get('tj:floatingGroups')`.

**Expected result:**
- All four floating rows visible under Parent A post-toggle.
- Drag-reorder completes successfully (no race toast, no error).
- All records carry `liveTabId` (post-cold-start lazy rewrite).
- SW console: no errors.

**PASS criterion:** Floating rows render; drag-reorder works; all records have `liveTabId`; no errors.

**FAIL criterion:** Drag-reorder triggers `ERR_RACE` toast (would suggest the SW module cache did not flush; would fall back to pre-B-137 stale code paths).

**Validates:** CHANGELOG SW module-cache flush note (R7 deferral per Sprint 30 B-092 / Sprint 38 B-121 / Sprint 40 B-134 precedent).

---

## UAT-13 — Tab-navigate after binding: floating row reflects new URL/title (LOW L-4)

**Priority:** L — confirms tab-identity preservation through URL navigation. The §66.9.2 Option B (no URL-guard at tier (a)) is correct user-perceived behavior.

**Setup:**
1. UAT-1 setup: at least one floating row (e.g., Child-1) under Parent A. Note its current URL/title.

**Action:**
1. Focus Child-1's tab.
2. In the URL bar, navigate to a completely different URL (e.g., `https://www.wikipedia.org`).
3. Wait for the new page to load and the title to settle.
4. Switch back to the side panel.

**Expected result:**
- Child-1's floating row now reflects the new URL/title (Wikipedia title).
- The row REMAINS a floating row under Parent A (tab identity preserved via `liveTabId`).
- No row count change.
- SW console: no errors.

**PASS criterion:** Floating row updates to new URL/title; row count unchanged; row stays under Parent A.

**FAIL criterion:** Floating row disappears OR is duplicated OR is moved to a different group.

**WARN criterion:** Row title flickers between old URL and new URL for more than one frame — record as observed; could indicate broadcast race not fully suppressed.

**Validates:** §66.9.2 Option B — tab identity (via `liveTabId`) preserved through URL change. Tab metadata (URL, title) re-renders from `liveIndex.get(matchedTabId)` per descriptor.

---

## UAT-14 — Stale `liveTabId` cross-restart self-correction (security T-2)

**Priority:** L — exercises §66.9.3 self-correction across browser restart. Difficult to deterministically reproduce because Chrome rarely reuses tab IDs across restarts. Document as **SKIP** if not reproducible; the structural fix (cold-start lazy rewrite) is verified in unit tests.

**Setup:**
1. UAT-1 setup: 4 floating rows under Parent A.
2. Note the `liveTabId` of each record via SW REPL.

**Action:**
1. Close the entire browser (all windows, all tabs).
2. Re-open the browser. The session-restore prompt may appear.
3. **Decline session restore** (or close all restored tabs immediately so Chrome assigns new tab IDs).
4. Manually re-open the same tabs by clicking the same bookmarks again.
5. Open the side panel.
6. SW REPL: `await chrome.storage.local.get('tj:floatingGroups')`.

**Expected result:**
- Floating rows render correctly under Parent A (cold-start `reassociateFloatingGroups` + lazy rewrite).
- Each record's `liveTabId` is updated to the NEW tab id assigned by Chrome post-restart (NOT the stale id from the pre-restart session).
- SW console: no errors.

**PASS criterion:** Floating rows correct + `liveTabId` values updated.

**FAIL criterion:** Floating rows misroute (a record's title is taken from a different tab) OR `liveTabId` values are clearly stale (do not match the current live tabs).

**SKIP criterion:** Could not reproduce a tab-id collision (Chrome did not reuse any IDs). Acceptable — the unit test `tests/floating-multi.test.js` "tier (a) skipped when record.liveTabId is not in liveIndex" + the cold-start lazy-rewrite test in `tests/floating-position.test.js` cover the structural correctness.

**Validates:** §66.9.3 self-correction window + AC5 cold-start lazy rewrite.

---

## UAT-15 — B-138 follow-up boundary: legacy v3 records still render via fallback

**Priority:** L — confirms the lazy-migration arc allows v3 records to coexist with v4 records indefinitely until B-138 cleanup. (This case overlaps UAT-4 but specifically confirms the v3-only "user never closes/reopens browser" path.)

**Setup:**
1. From a v1.35.0 install, force the storage to a v3 shape (Setup B from UAT-8).
2. Do NOT click Reload yet — keep `tj:meta.schemaVersion === 3` so the migration step has not run.
3. Open the side panel.

**Action:**
1. Observe the floating rows in the side panel.

**Expected result:**
- All v3 records render correctly via tier (b) position fallback in `buildFloatingMembers`.
- No SW errors.
- `tj:meta.schemaVersion` is still 3 (migration runs at SW startup; not triggered by side-panel render).

**PASS criterion:** v3 records render; no error.

**FAIL criterion:** v3 records do not render OR validator throws.

**Note:** This case demonstrates that v3 records continue to work indefinitely without forcing the user to update — B-138 will remove the position fallback once telemetry confirms no v3 records remain in the wild.

**Validates:** AC4 (lazy migration) — backward-compat with pre-B-137 records.

---

## Summary

| Case | Priority | AC mapping | Status |
|------|----------|------------|--------|
| UAT-1 | H | AC1 + AC2 + AC7 (B-131 user repro) | _to record_ |
| UAT-2 | H | B-132 carry-forward + AC5 | _to record_ |
| UAT-3 | H | Issue 3 race-toast structural fix | _to record_ |
| UAT-4 | H | C-9 case 4 (mixed v3+v4) + L-2 | _to record_ |
| UAT-5 | M | §66.9.3 self-correction + security T-2 | _to record_ |
| UAT-6 | M | §66.7 atomicity + security T-1 | _to record_ |
| UAT-7 | M | C-1a fresh install + L-3 | _to record_ |
| UAT-8 | H | AC4 + AC5 + C-1b lazy migration | _to record_ |
| UAT-9 | M | B-130 visual regression guard | _to record_ |
| UAT-10 | M | B-122 regression guard | _to record_ |
| UAT-11 | M | Multi-window cold-start (AC5) | _to record_ |
| UAT-12 | H | SW module-cache flush (CHANGELOG note) | _to record_ |
| UAT-13 | L | LOW L-4 (tab-navigate after binding) | _to record_ |
| UAT-14 | L | §66.9.3 cross-restart self-correction | _to record_ |
| UAT-15 | L | AC4 (lazy migration backward-compat) | _to record_ |

**Acceptance gate:** UAT-1, UAT-2, UAT-3, UAT-4, UAT-8, UAT-12 must PASS before sprint close. UAT-5, UAT-6, UAT-7, UAT-9, UAT-10, UAT-11 must PASS or WARN. UAT-13, UAT-14, UAT-15 may record as PASS / WARN / SKIP at product-owner discretion.

**Re-test trigger:** any UAT FAIL routes the item back to [frontend-engineer] per CLAUDE.md Gate 2.
