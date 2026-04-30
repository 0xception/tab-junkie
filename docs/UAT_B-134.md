# UAT — B-134 Drag-and-Drop Reorder for Open Tabs and Floating Tabs

**Sprint:** 40 (v1.34.0)
**Branch:** `feature/sprint-40-drag-reorder`
**Spec:** `docs/design/63-b-134-tab-drag-reorder.md` (R2)
**Tier:** Full (M) — UAT mandatory per CLAUDE.md Gate 2

**R3 file changes (8 source + 4 tests):**
- `shared/messages.js` (+74 — `MSG_REORDER_FLOATING_MEMBERS` + `MSG_MOVE_FLOATING_TAB`)
- `background/storage/shapes.js` (+21 — `sortOrder` validator extension + `defaultShape` v3)
- `background/storage/migration.js` (+22 — `KNOWN_VERSION` 2 → 3 + no-op governance step)
- `background/tabs/floating-groups.js` (+289 — `reorderFloatingMembers`, `moveFloatingTab`, mutator helpers, sortOrder stamping)
- `background/tabs/floating-members.js` (+21 — sort path prefers explicit `sortOrder`)
- `background/messages/storage-handlers.js` (+95 — two new case branches + scope routing + post-write `markInherited`/`pruneInherited`)
- `sidepanel/sidepanel.js` (+672 — `_tabDragState`, `_tabDragRectCache`, `_computeTabDropTarget`, `_validateTabDropPreflight`, drop dispatcher branches, dragstart/dragover/drop wiring, gen-counter content-conditional bumping)
- `sidepanel/sidepanel.css` (+28 — `.is-tab-dragging`, REJECT indicator class, grab cursor)
- `tests/b134-tab-drag-reorder.test.js` (NEW — 32 tests T1..T31 + helpers)
- `tests/floating-shape.test.js` (+57 — sortOrder stamping)
- `tests/migration-steps.test.js` (+59 — v2→v3 chain)
- `tests/chrome-mock.js` (+21 — drag harness)

**Automated test status:** 1,778/1,778 passing. 32 B-134 tests; 32/32 PASS.

Manual test cases against the unpacked extension loaded in **Edge** (Developer Mode → Load unpacked → repo root). Run **after** verifying the automated suite passes.

> **Edge gotcha (per user memory):** `chrome://` URLs do not work in Edge. Use `edge://extensions` and `edge://serviceworker-internals` equivalents. To force-reload the extension after changes, toggle the extension OFF then ON in `edge://extensions`.

> **Schema migration note (per CHANGELOG / R2 §63.2.3):** This build bumps `tj:meta.schemaVersion` from 2 → 3 and adds a new `sortOrder?: number` field on `tj:floatingGroups` records. Migration is **lazy**: existing v2 records work without `sortOrder` (sort fallback uses `(windowId, tabIndex)`); new writes stamp `sortOrder`. **After updating, toggle the extension OFF then ON in `edge://extensions` once** to ensure the SW module cache is flushed before exercising drag operations.

> **B-134 scope:** sidepanel only. Newtab and popup are unchanged (no drag UX). Cross-window Open Tabs drag is **B-135** (deferred stub — out of v1 scope).

| Symbol | Meaning |
|---|---|
| **PASS** | Observed behavior matches PASS criteria |
| **FAIL** | Observed behavior matches FAIL criteria; route back to [frontend-engineer] |
| **WARN** | Observed but documented R2 tradeoff (not a regression) |
| **SKIP** | Could not be exercised in this run; record reason |

**Setup that applies to every case below:**
1. Load unpacked extension from repo root.
2. Open the side panel.
3. Have at least one collection seeded with 3 groups (e.g., **G1**, **G2**, **G3**) and 2-3 saved bookmarks per group.
4. Have at least 4-6 open tabs across at least 2 windows. The **Open Tabs** section in the side panel should surface these.
5. Have the SW console open (`edge://extensions` → "Tab Junkie" → Inspect views: service worker) so SW errors are visible.

---

## UAT-1 — Op 1: Open Tabs reorder same-window (AC1)

**Priority:** H — primary acceptance test for AC1.

**Setup:**
1. Single browser window **W1** with at least 4 open tabs surfacing in the **Open Tabs** section of the side panel.
2. Note the current order of the rows in the Open Tabs section (top-to-bottom).
3. Note the current order of the tabs in the browser tab strip (left-to-right).

**Action:**
1. Hover an Open Tabs row — confirm the cursor changes to a **grab** cursor (per qa-reviewer M-5 "drag affordance" fix).
2. Click and hold the third Open Tabs row (call it **T3**).
3. Drag **T3** upward over the first row. Observe the drop indicator (a colored line at the insertion point).
4. Release the pointer above the first row.

**Expected result:**
- During drag: cursor switches to **grabbing**; a drop indicator line is visible at the target insertion point.
- After drop: the side panel's Open Tabs section reflects the new order (T3 now at top).
- The browser tab strip reflects the same reorder (T3's tab is now leftmost in W1's strip).
- SW console: no errors.

**PASS criterion:** Side-panel order changed + browser tab strip order changed identically + no SW errors.

**FAIL criterion:** Side-panel order does not change OR browser tab strip does not match the side-panel order OR `chrome.tabs.move` fires with the wrong index.

**Validates:** AC1.

---

## UAT-2 — Op 1 cross-window reject (AC2)

**Priority:** H — primary acceptance test for AC2 + Wave 3a H-3 (REJECT indicator follows pointer).

**Setup:**
1. Two browser windows **W1** and **W2**, each with at least 2 open tabs.
2. Both windows' tabs visible in the side panel's Open Tabs section.

**Action:**
1. Click and hold an Open Tabs row from **W1** (call it **T-W1**).
2. Drag the row downward over **W2**'s Open Tabs rows.
3. While the pointer is over W2's rows, **move the pointer between several different W2 rows**. Observe the REJECT indicator visual.
4. Release the pointer.

**Expected result:**
- During drag over W2: the drop indicator paints in a **REJECT** style (red/danger color, distinct from the normal accent color).
- The REJECT indicator **follows the pointer** as it moves between W2 rows (per Wave 3a H-3 fix; previously the indicator stuck at the first Y position).
- On release: a toast appears with text similar to "Cross-window drag is not supported yet." (or "in this version" — see Note below).
- No `chrome.tabs.move` call fires (verify in SW console — no `chrome.tabs.move` log line appears for this drag).
- The side panel's Open Tabs section is unchanged.
- The browser tab strip is unchanged.

**PASS criterion:** REJECT indicator follows the pointer + toast appears + no tab move occurs.

**FAIL criterion:** REJECT indicator stays stuck at one position (Wave 3a H-3 regressed) OR `chrome.tabs.move` fires with `windowId !== source` OR no toast appears (silent failure).

**WARN criterion:** Toast says "in this version" instead of "yet" — accept as polish-copy variation.

**Validates:** AC2 + AC7 cross-window guard + Wave 3a H-3 fix.

---

## UAT-3 — Op 2: floating reorder within group (AC3)

**Priority:** H — primary acceptance test for AC3 + Wave 3a H-4 (REORDER_FLOATING own-slot insertion).

**Setup:**
1. Pick a saved bookmark **Parent A** in group **G1**. Click it to claim.
2. From Parent A's tab, middle-click 3 different in-page links (each to a distinct URL) to spawn 3 floating tabs **F1**, **F2**, **F3** under Parent A.
3. Confirm in the side panel: Parent A's group section now contains 3 floating rows in some initial order (call them in-order F1, F2, F3 top-to-bottom).

**Action (basic reorder):**
1. Hover a floating row — cursor should be **grab**.
2. Drag **F1** down past **F2**'s midline. Observe the drop indicator.
3. Release between **F2** and **F3**.

**Expected result:**
- Side-panel new order: F2, F1, F3 (top-to-bottom).
- Reload the extension via `edge://extensions` → Reload to confirm persistence: order should still be F2, F1, F3 (sortOrder persisted to `tj:floatingGroups`).
- Reopen side panel.

**PASS criterion:** Reorder visible + persists across SW restart.

**FAIL criterion:** Reorder does not stick OR ordering reverts after reload OR `chrome.tabs.move` accidentally fires (verify SW console — should see `MSG_REORDER_FLOATING_MEMBERS`, NOT `chrome.tabs.move`).

**Action (own-slot insertion — Wave 3a H-4):**
4. With current order F2, F1, F3, start dragging **F1** again.
5. Hover the pointer just over F1's own current row position (its own slot).
6. Observe the drop indicator.

**Expected result:** The indicator does NOT misplace by one slot — it should sit at F1's current position (the slot between F2 and F3), not falsely above F2 or below F3. Releasing here is a same-position no-op (no visible reorder).

**PASS criterion:** Indicator stays on F1's own slot when hovering own slot; release is a clean no-op.

**FAIL criterion:** Indicator paints above F2 OR below F3 when hovering F1's own slot (Wave 3a H-4 regression).

**Validates:** AC3 + AC7 (broadcast guard does not fire on own movement) + Wave 3a H-4 fix.

---

## UAT-4 — Op 3 ATTACH: Open Tab → group's floating area (AC4)

**Priority:** H — primary acceptance test for AC4.

**Setup:**
1. Group **G1** with at least one saved bookmark.
2. An open tab **T-attach** that is currently surfacing in the Open Tabs section (its URL does NOT match any saved bookmark).

**Action:**
1. Hover **T-attach** in Open Tabs — cursor should be **grab**.
2. Drag **T-attach** upward over **G1**'s floating area (the space below the saved bookmarks in G1's group section, where floating rows would render).
3. Observe the drop indicator (should paint as a normal/accent green/blue indicator, not REJECT).
4. Release the pointer in G1's floating area.

**Expected result:**
- The row immediately leaves the Open Tabs section.
- The row appears as a synthetic floating row inside **G1**'s group section, below G1's saved bookmarks.
- SW console: `MSG_MOVE_FLOATING_TAB { tabId: <T-attach.id>, sourceGroupId: null, targetGroupId: G1.id, insertIndex: <0..N> }` dispatched; `markInherited` log line (or `tab/opener-inherited` broadcast) follows the successful write.
- Reload via `edge://extensions` → Reload. Re-open side panel.
- After reload: the row STILL appears as a floating row under G1 (the `tj:floatingGroups` record persists with `sortOrder` stamped + the B-132 cold-start helper marks it inherited).

**PASS criterion:** Row moves to G1's floating area + persists across reload + `markInherited` side-effect fires.

**FAIL criterion:** Row stays in Open Tabs OR appears in the wrong group OR `chrome.tabs.move` accidentally fires (sidepanel-only metadata — not a tab-strip operation) OR `markInherited` does not fire (verify by claim-jumping the tab to a colliding bookmark immediately post-attach; if the claim succeeds when it should be locked out, the side-effect was not wired).

**Validates:** AC4 + B-125 inheritedTabs lock interplay.

---

## UAT-5 — Op 4 DETACH: floating row → Open Tabs (AC5)

**Priority:** H — primary acceptance test for AC5.

**Setup:**
1. Continue from UAT-4's state: **T-attach** is a floating row under **G1**.

**Action:**
1. Hover **T-attach**'s floating row — cursor should be **grab**.
2. Drag the row downward into the **Open Tabs** section interior.
3. Observe the drop indicator (normal / accent style, not REJECT).
4. Release.

**Expected result:**
- The row leaves G1's group section.
- The row appears in the Open Tabs section.
- SW console: `MSG_MOVE_FLOATING_TAB { tabId: <T-attach.id>, sourceGroupId: G1.id, targetGroupId: null, insertIndex: <N> }` dispatched; `pruneInherited` side-effect fires (no broadcast log; verify by next sub-step).
- Reload via `edge://extensions` → Reload. Re-open side panel.
- After reload: the row stays in Open Tabs (no `tj:floatingGroups` record exists for it).

**PASS criterion:** Row moves to Open Tabs + persists + `pruneInherited` fires (validated by UAT-13 follow-up below).

**FAIL criterion:** Row stays under G1 OR an unrelated group OR the floating record persists in `tj:floatingGroups` (verify via SW REPL: `await chrome.storage.local.get('tj:floatingGroups')` — should NOT contain T-attach's tabId).

**Validates:** AC5.

---

## UAT-6 — Op 5 cross-group MOVE_FLOATING (AC6)

**Priority:** H — primary acceptance test for AC6.

**Setup:**
1. Floating tab **F-MV** is currently a member of group **G1** (set up via UAT-3 or UAT-4 above).
2. Group **G2** exists and has at least one saved bookmark (G2 must NOT be empty — see UAT-12 for the empty-group case).

**Action:**
1. Hover **F-MV**'s floating row in G1.
2. Drag the row toward **G2**'s floating area.
3. Observe the drop indicator (normal accent style).
4. Release in G2's floating area.

**Expected result:**
- The row leaves G1's group section.
- The row appears as a floating row under **G2**.
- SW console: a SINGLE `MSG_MOVE_FLOATING_TAB { tabId: <F-MV>, sourceGroupId: G1.id, targetGroupId: G2.id, insertIndex: <N> }` dispatched (NOT two separate detach + attach messages).
- The `tj:floatingGroups` record for F-MV updates atomically: old record removed, new record under G2 written, in a single `chrome.storage.local.set` call (R2 §63.6 atomicity contract).
- `inheritedTabs` membership preserved — F-MV was inherited under G1; remains inherited under G2 (the lock against auto-claim by an unrelated bookmark is preserved).

**Verify atomicity (optional):** In the SW console before the drag, run `let writeCount = 0; const orig = chrome.storage.local.set; chrome.storage.local.set = (...args) => { writeCount++; return orig.apply(chrome.storage.local, args); }`. Perform the drag. Check `writeCount` — should increase by exactly 1 for the move.

**PASS criterion:** Single message + atomic write + record correctly under G2 + inheritedTabs preserved.

**FAIL criterion:** Two messages fire OR storage written more than once OR row appears under wrong group OR row gets claim-jumped immediately after the move (inheritance lock dropped).

**Validates:** AC6.

---

## UAT-7 — Race-guard A: tab closed mid-drag (AC7-A)

**Priority:** H — race-guard third branch, qa-reviewer "UAT must explicitly walk" UAT-RACE-A1.

**Setup:**
1. A floating row **F-X** under group **G1**.
2. The SW console open with the live tab list visible (run `chrome.tabs.query({}).then(t => console.log(t.map(x => x.id)))` to note the tab IDs).

**Action:**
1. Start dragging **F-X** (click and hold).
2. **WHILE THE DRAG IS IN FLIGHT** (do not release), in the SW console, run: `await chrome.tabs.remove(<F-X.tabId>)` (replace `<F-X.tabId>` with the actual id).
3. Release the drag.

**Expected result:**
- A toast appears with text similar to "Tab closed during drag — drop cancelled." (Guard A).
- No write to `tj:floatingGroups` (verify via `await chrome.storage.local.get('tj:floatingGroups')` — F-X's record should already be gone via `pruneResolvedFloatingGroups` from `chrome.tabs.onRemoved`, but the drop itself produces no new record / no MOVE message succeeds).
- SW console: no errors.

**PASS criterion:** Toast shown + no write + no error.

**FAIL criterion:** No toast (silent failure) OR a stale write to `tj:floatingGroups` for the now-closed tab OR a SW error.

**Validates:** AC7 Guard A (`chrome.tabs.get` pre-write check).

---

## UAT-8 — Race-guard B: broadcast race (AC7-B + Wave 3a H-1 content-conditional gen bump)

**Priority:** H — primary regression guard for the Wave 3a H-1 fix. Without the fix, every ambient liveState broadcast (audio play/pause, title change, focus blur) bumps the gen counter and trips Guard B → user's drop is rejected with a confusing toast.

**Setup:**
1. Open a tab playing audio (e.g., a YouTube video — start playback, then mute or un-mute periodically — title may also change). Let it play in the background.
2. A floating row **F-bg** in some group.

**Action (test that ambient liveState does NOT trip Guard B — Wave 3a H-1):**
1. Start dragging **F-bg**.
2. **HOLD THE DRAG FOR ~5 SECONDS** to allow ambient liveState broadcasts to fire (audio state changes, title changes, focus updates).
3. Release the pointer at a valid drop target (say, a different position within the same group's floating area).

**Expected result (post Wave 3a H-1 fix):**
- The drop SUCCEEDS. No "Tabs changed during drag — please retry." toast appears.
- Storage is updated to reflect the drop.
- Wave 3a H-1 fix: gen counter only bumps on actual signature changes (per-group `tabIds` arrays), not on every liveState assignment.

**PASS criterion:** Drop succeeds, no toast, ordering reflects the drop.

**FAIL criterion:** Drop is rejected with a "Tabs changed during drag" toast (Wave 3a H-1 regressed; gen counter is bumping on every ambient liveState).

**Action (test that GENUINE concurrent mutation DOES trip Guard B):**
4. Open a SECOND browser window / a different surface (the Edit dialog) where you can mutate the floating-group state.
5. Start dragging **F-bg** in window 1.
6. While dragging, in window 2 (or via SW REPL): manually mutate the relevant `tj:floatingGroups` group — e.g., add an unrelated floating tab to the same group (middle-click a fresh link in a tab claimed by that group's parent bookmark).
7. Release the drag in window 1.

**Expected result (genuine race):** Toast appears with "Tabs changed during drag — please retry." OR similar Guard B verbiage. Storage NOT mutated by the rejected drop.

**PASS criterion:** Genuine mutation trips Guard B; ambient liveState does not.

**FAIL criterion:** Genuine mutation does NOT trip Guard B (broadcast race-guard broken) OR ambient liveState DOES trip it (Wave 3a H-1 regression).

**Validates:** AC7 Guard B + Wave 3a H-1 (`_setCachedFloatingMembers` / `_setCachedOpenTabs` content-conditional bump).

---

## UAT-9 — REJECT indicator follows pointer (Wave 3a H-3 regression guard)

**Priority:** H — direct regression guard for Wave 3a H-3.

**Setup:** Two windows **W1** and **W2** each with multiple Open Tabs rows.

**Action:**
1. Start dragging an Open Tabs row from **W1**.
2. Move the pointer over **W2**'s Open Tabs region — the indicator should immediately switch to REJECT (red).
3. **Without releasing**, move the pointer up and down between different W2 rows, then between rows and gaps in W2.
4. Observe the REJECT indicator's Y position.

**Expected result:** The REJECT indicator's Y coordinate updates as the pointer moves through different rows of W2. It does NOT stay frozen at the first Y position the pointer entered W2.

**PASS criterion:** REJECT indicator tracks pointer through W2.

**FAIL criterion:** REJECT indicator stays at one position regardless of pointer movement inside W2 (Wave 3a H-3 regressed; the skip-no-op short-circuit is treating REJECT as no-op).

**Validates:** Wave 3a H-3 fix (`_tabDragTick` skip-no-op excludes REJECT mode).

---

## UAT-10 — REORDER_FLOATING own-slot insertion (Wave 3a H-4 regression guard)

**Priority:** H — direct regression guard for Wave 3a H-4 (already covered as a sub-step of UAT-3, called out separately here for clarity).

**Setup:** A group **G1** with 3 floating rows F1, F2, F3.

**Action:**
1. Start dragging **F2** (the middle row).
2. Without moving much, hover the pointer over **F2's own current slot** (the position F2 currently occupies).
3. Observe the drop indicator.

**Expected result:** The indicator paints between F1 and F3 (where F2 currently sits). It does NOT misplace by one row (paint above F1 OR below F3) when hovering own slot.

**PASS criterion:** Indicator at F2's own current position when hovering own slot.

**FAIL criterion:** Indicator misplaced by one row (Wave 3a H-4 regressed; midline math includes the dragged row instead of excluding it).

**Validates:** Wave 3a H-4 fix (`_computeTabDropTarget` REORDER_FLOATING branch + `_resolveTabDragIndicatorY` filter `zone.rowMidlines.filter((_, i) => zone.rowTabIds[i] !== draggedTabId)`).

---

## UAT-11 — REORDER_FLOATING ERR_RACE toast (Wave 3a H-2 regression guard)

**Priority:** M — direct regression guard for Wave 3a H-2.

**Setup:** A group **G1** with 2 floating rows F1, F2.

**Action:**
1. Start dragging **F1**.
2. **WHILE THE DRAG IS IN FLIGHT**, in the SW console run: `await chrome.tabs.remove(<F1.tabId>)` to close F1.
3. Release the drag at any drop target.

**Expected result:** A toast appears with text similar to "Floating-tab list changed during drag — please retry." (or the Wave 3a H-2 designated copy). Without the H-2 fix, the user would see a silent abort with no feedback.

**PASS criterion:** Toast appears explaining the race.

**FAIL criterion:** Silent abort (no toast) OR a generic "something went wrong" message instead of the specific race copy.

**Validates:** Wave 3a H-2 fix (REORDER_FLOATING dispatcher inspects response.reordered and surfaces a specific toast).

---

## UAT-12 — ATTACH to empty group (R2 §63.15 + qa M-2 deferred)

**Priority:** M — confirms the documented edge case behavior.

**Setup:**
1. Create a NEW group **G-empty** with ZERO saved items. (If your collection's UI does not allow zero-item groups directly, find one whose only saved item you can temporarily delete, or create one and skip seeding items.)
2. An open tab **T-empty-target** in Open Tabs.

**Action:**
1. Drag **T-empty-target** from Open Tabs into **G-empty**'s floating area.
2. Observe the drop indicator + release.

**Expected result (per R2 §63.15 disposition):**
- The hit-test paints a normal indicator (not REJECT) — the client cannot easily know the group is empty without an extra read; this is documented R2 behavior.
- On release: the SW returns ERR_RACE / `moved: false`. A toast appears with text similar to "Cannot attach to an empty group." OR "Floating-tab list changed during drag — please retry." (depending on which disposition shipped).
- No record written to `tj:floatingGroups` (verify via SW REPL).

**PASS criterion:** ATTACH is rejected (no record persisted) AND a toast appears.

**FAIL criterion:** Record gets written without a parent bookmark (data corruption — would orphan the floating record) OR no toast (silent failure).

**WARN criterion:** Hit-test indicator paints "valid drop" then SW rejects with a toast — this is the documented R2 §63.15 caveat. Acknowledge as expected; confusing UX may file a polish item.

**Validates:** R2 §63.15 ATTACH-to-empty-group disposition.

---

## UAT-13 — Schema migration compatibility (C-1a / C-1b)

**Priority:** M — confirms lazy migration from v2 records to v3 reads + writes.

**Setup (build a v2 record artificially):**
1. In the SW console, write a v2-shaped `tj:floatingGroups` record (no `sortOrder`):
   ```
   await chrome.storage.local.set({
     'tj:floatingGroups': [{
       floatingTabId: 'test-flo-001',
       parentItemId: 'pre-existing-bookmark-id',
       groupId: '<pick a real group id>',
       windowId: 1, tabIndex: 5,
       url: 'https://test.example/v2-record',
       savedAt: Date.now()
     }]
   })
   ```
2. Simulate the matching live tab existing (or open a real tab to that URL so `chrome.tabs.query` surfaces it).
3. Note: this is an artificial test — typically you'd just upgrade from a v1.32.0 / v1.33.x install where v2 records exist naturally.

**Action:**
1. Reload the extension via `edge://extensions` → Reload.
2. Re-open the side panel.

**Expected result:**
- The synthetic floating row appears under the parent bookmark's group (lazy migration: `buildFloatingMembers` falls back to `(windowId, tabIndex)` ordering for records lacking `sortOrder`; B-132 cold-start helper marks the tab inherited).
- `tj:meta.schemaVersion` is now 3 (verify via SW REPL: `await chrome.storage.local.get('tj:meta')` → should show `{ tj:meta: { schemaVersion: 3, ... } }`).
- After UAT-3 (or any new ATTACH/REORDER write), the v2 record is opportunistically upgraded — the next read shows it carries `sortOrder` (renumber stamp).

**PASS criterion:** Mixed v2/v3 records render correctly; schema version is 3; new writes stamp `sortOrder`.

**FAIL criterion:** v2 record fails validator on read OR triggers a SW error OR `tj:meta.schemaVersion` is still 2.

**Validates:** R2 §63.2.3 C-1a + §63.2.4 C-1b.

---

## UAT-14 — Composition with active / drift / floating tab states

**Priority:** M — confirms B-134 plays nicely with B-099/B-110 drift, B-018 floating-state, and the active-tab indicator.

**Setup:**
1. Build a small mixed scenario:
   - Tab **T-active** is currently the active tab in a window AND a floating row under some group.
   - Tab **T-drift** is a saved bookmark whose live tab has drifted (URL changed).
   - Tab **T-clean** is a normal floating row.

**Action:**
1. Drag **T-active** within its current floating group (REORDER_FLOATING). Confirm:
   - The drag completes.
   - After drop, the active-tab indicator (e.g., the active row highlight or `[data-active="true"]` style) is still on T-active's row.
2. Drag **T-drift** (if it surfaces as a floating row) — verify the drift indicator (typically a pulsed border or yellow tint) survives the drop.
3. Drag **T-clean** ATTACH from Open Tabs into a group. Confirm the row's standard floating-tab visual cue (B-130 `--floating-bar-color`) appears on the new floating row.

**Expected result:** All visual states (active, drift, floating-cue) are preserved across drag operations.

**PASS criterion:** No visual state regressions.

**FAIL criterion:** Active indicator drops OR drift indicator drops OR floating-bar styling is missing on the new row.

**Validates:** Cross-feature composition (B-134 + B-099 + B-110 + B-130).

---

## UAT-15 — Drag affordance discoverability (qa M-1 cursor)

**Priority:** L — confirms the qa-reviewer M-5 cursor / qa M-1 affordance fix.

**Setup:** Side panel with at least one Open Tabs row and at least one floating row.

**Action:**
1. Hover an **Open Tabs row** without dragging. Observe the cursor.
2. Hover a **floating row** without dragging. Observe the cursor.
3. Hover a **saved-bookmark row** (non-floating) without dragging. Observe the cursor.
4. Hover a **group header** drag handle. Observe the cursor.

**Expected result:**
- Open Tabs row: **grab** cursor.
- Floating row: **grab** cursor.
- Saved-bookmark row: default arrow / pointer cursor (saved-bookmark rows are NOT draggable per AC8(e); the existing item-drag uses its own drag-handle).
- Group-header drag handle: **grab** cursor (B-031 / B-122 unchanged).

**PASS criterion:** All four cursors match expectations.

**FAIL criterion:** Open Tabs / floating rows show default cursor (qa M-5 fix not shipped) OR saved-bookmark rows accidentally show grab (incorrectly draggable).

**Validates:** qa M-5 / M-1 affordance.

---

## UAT-16 — Multi-window concurrent drags + broadcast race

**Priority:** M — qa-reviewer "UAT-MULTI-WINDOW-CONCURRENT".

**Setup:** Two browser windows W1 and W2, each with the side panel open. Same collection visible. At least one floating row visible in both panels.

**Action:**
1. In W1: start dragging a floating row.
2. While W1's drag is in flight, in W2: trigger a mutation (e.g., bulk-delete a saved bookmark, or use the Edit dialog to change a group).
3. Release W1's drag.

**Expected result:** W1's drag either succeeds (if the mutation did not overlap the dragged tab's group) OR is rejected with a Guard B toast. The two panels reconcile after liveState broadcasts.

**PASS criterion:** No SW errors; W1 panel converges to correct state; no orphaned floating records.

**FAIL criterion:** Stale state in either panel; SW errors; orphaned floating record.

**Validates:** AC7 Guard B (broadcast race) + multi-window concurrent operation safety.

---

## UAT-17 — DETACH auto-claim posture (qa LOW L-13)

**Priority:** L — documents expected (per AC) but potentially surprising behavior.

**Setup:**
1. Group **G1** with parent bookmark **Parent A** (claimed) and a floating tab **F-X** whose URL is `https://example.com/foo`.
2. Group **G2** with saved bookmark **Saved Z** whose URL is also `https://example.com/foo`. **Saved Z** is currently unclaimed.

**Action:**
1. DETACH **F-X** from G1 (drag to Open Tabs). Per AC5, `pruneInherited(F-X.tabId)` fires.
2. Wait 2-3 seconds. Observe **Saved Z** in the side panel.

**Expected result (per AC5 + B-125 contract):** **Saved Z** auto-claims the now-unlocked tab. The user moved the tab from G1 floating area expecting it to stay free; instead it re-attaches as a saved-claim under G2. **This is by design** — `pruneInherited` returns the tab to ordinary auto-claim eligibility.

**PASS criterion:** Behavior matches design (auto-claim under G2 fires).

**WARN criterion:** Behavior is correct but surprising — record as expected. May file a P3 polish item (e.g., a brief grace period, or a toast explaining the auto-claim).

**FAIL criterion:** Auto-claim does NOT fire when the URL clearly matches Saved Z (would indicate `pruneInherited` did not fire — AC5 regression).

**Validates:** AC5 + qa LOW L-13 documentation surface.

---

## UAT-18 — Escape / mouse-leave cancel

**Priority:** L — qa-reviewer UAT-ESCAPE-CANCEL + UAT-MOUSELEAVE-CANCEL.

**Setup:** Any draggable row.

**Action (Escape):**
1. Start dragging a row.
2. Press **Escape**.

**Expected result:**
- `dragend` fires; `_tabDragState` cleared; indicator hidden.
- No write occurs.
- Cursor returns to default.
- No SW error.

**Action (mouse-leave):**
1. Start dragging a row.
2. Move the pointer outside the browser window.
3. Release the pointer outside the window.

**Expected result:** Same as Escape — clean cancel, no state stuck.

**PASS criterion:** Both flows cancel cleanly.

**FAIL criterion:** Drag state stuck (e.g., `is-tab-dragging` class persists on `#item-list`; cursor stays as grabbing; subsequent drags blocked).

**Validates:** Standard drag-cancel hygiene.

---

## UAT-19 — Theme contrast walk (qa LOW L-11)

**Priority:** L — confirms the drop indicator and REJECT indicator are visible across all 14 themes.

**Setup:** Theme switcher in the settings surface.

**Action:** For EACH of the 14 themes:
1. Switch to the theme.
2. Start dragging an Open Tabs row.
3. Hover a valid drop target — observe the **accent** indicator color against the panel background.
4. Hover a cross-window region — observe the **REJECT** (danger) indicator color.
5. Cancel the drag (Escape).

**Expected result:** Both indicators are clearly visible (contrast ratio sufficient) on every theme.

**PASS criterion:** All 14 themes pass visual inspection.

**FAIL criterion:** Any theme has an indicator that is invisible / nearly invisible / indistinguishable from the panel background.

**Validates:** qa LOW L-11 theme contrast.

---

## Summary

| Case | Priority | AC mapping | Status |
|------|----------|------------|--------|
| UAT-1 | H | AC1 (REORDER_OPEN) | _to record_ |
| UAT-2 | H | AC2 (cross-window REJECT) + Wave 3a H-3 | _to record_ |
| UAT-3 | H | AC3 (REORDER_FLOATING) + Wave 3a H-4 | _to record_ |
| UAT-4 | H | AC4 (ATTACH + markInherited) | _to record_ |
| UAT-5 | H | AC5 (DETACH + pruneInherited) | _to record_ |
| UAT-6 | H | AC6 (cross-group MOVE atomic) | _to record_ |
| UAT-7 | H | AC7 Guard A (tab closed mid-drag) | _to record_ |
| UAT-8 | H | AC7 Guard B + Wave 3a H-1 (content-conditional gen) | _to record_ |
| UAT-9 | H | Wave 3a H-3 regression guard | _to record_ |
| UAT-10 | H | Wave 3a H-4 regression guard | _to record_ |
| UAT-11 | M | Wave 3a H-2 regression guard | _to record_ |
| UAT-12 | M | R2 §63.15 ATTACH-empty-group | _to record_ |
| UAT-13 | M | C-1a / C-1b schema migration | _to record_ |
| UAT-14 | M | Composition with active / drift / floating | _to record_ |
| UAT-15 | L | qa M-5 / M-1 cursor affordance | _to record_ |
| UAT-16 | M | AC7 Guard B multi-window | _to record_ |
| UAT-17 | L | AC5 + qa L-13 auto-claim posture | _to record_ |
| UAT-18 | L | Drag cancel hygiene | _to record_ |
| UAT-19 | L | qa L-11 theme contrast | _to record_ |

**Acceptance gate (must PASS for sprint close):** UAT-1 through UAT-11 (all H priority + the four Wave 3a regression guards). UAT-12 through UAT-19 are documentation / polish surfaces and may record as PASS / WARN / SKIP at product-owner discretion.

**Re-test trigger:** any H-priority FAIL routes the item back to [frontend-engineer] per CLAUDE.md Gate 2.
