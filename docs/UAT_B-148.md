# UAT — B-148 Interleave Floating Tabs with Saved Bookmarks (Sprint 44)

**Sprint:** 44 (v1.39.0)
**Branch:** `feature/sprint-44-interleave`
**Spec:** `docs/superpowers/specs/2026-05-03-interleave-render-order-design.md`
**Plan:** `docs/superpowers/plans/2026-05-03-interleave-render-order.md`
**Tier:** Spike-First (XL) — R0 spike A+B+C completed before implementation.

**Automated test status:** 1,998 / 1,998 passing (+68 over the 1,930 pre-S44 baseline). 9 schema tests, 10 resolver tests, 22 write-path integration tests, 7 cold-start bootstrap tests, 3 mixed-type drag pin tests, 3 patch-validator tests, 1 newtab pin, 1 sidepanel pin, 12 misc.

Manual test cases against the unpacked extension loaded in **Microsoft Edge** (Developer Mode → Load unpacked → repo root). Run **after** verifying the automated suite passes.

> **Edge gotcha:** `chrome://` URLs do not work in Edge. Use `edge://extensions` and `edge://serviceworker-internals` equivalents. To force-reload the extension after changes, toggle the extension OFF then ON in `edge://extensions`.

> **Schema migration note:** This build bumps `tj:meta.schemaVersion` from 6 → 7 and adds the optional `renderOrder: string[]` field on `tj:groups` records. Migration is **lazy**: existing v6 groups work without the field; the cold-start `bootstrapAndSweepRenderOrder()` pass derives renderOrder from current Item.sortOrder + FloatingGroup.sortOrder on first cold-start post-upgrade. **After updating, toggle the extension OFF then ON in `edge://extensions` once** to flush the SW module cache before exercising drag.

> **B-148 scope:** Sidepanel + newtab render paths consume the new resolver. Sidepanel drag hit-test extended for mixed-type drops within a group's floating zone. Saved-bookmark drag-reorder unchanged (separate code path). MOVE_FLOATING / ATTACH / DETACH unchanged (server-side renderOrder updates via moveFloatingTab). Popup quick-search unchanged.

---

## Status legend

| Symbol | Meaning |
|---|---|
| **PASS** | Observed behavior matches PASS criterion |
| **FAIL** | Observed behavior matches FAIL criterion; route back to [frontend-engineer] |
| **WARN** | Observed but documented tradeoff (not a regression) |
| **SKIP** | Could not be exercised in this run; record reason |

---

## Tester instructions

For each UAT case:
1. Read **Setup** and put the browser into the prescribed state.
2. Execute **Action** step-by-step exactly as written.
3. Compare observed behavior against **Expected** and **PASS criterion**.
4. Mark **PASS / FAIL / WARN / SKIP** in the Status column.
5. If **FAIL**: capture a screenshot of the SW console + sidepanel, then report findings to [scrum-master].
6. Between cases, perform the **Cleanup** step at the end (or use the per-case cleanup if specified).

---

## Pre-conditions / Setup that applies to every case

1. **Extension load.** Load the unpacked extension from the repo root (`edge://extensions` → Developer mode ON → Load unpacked → repo root).
2. **SW console.** Open `edge://extensions` → click the Tab Junkie card → "Inspect views: service worker". Keep this tab open so SW errors and warnings are visible.
3. **Sidepanel open.** Click the Tab Junkie toolbar icon to open the sidepanel.
4. **Profile state.** A pre-existing test profile with **at least 2 groups, each containing 2-3 saved bookmarks**, is helpful but not required (cases include bootstrap from an empty profile).

---

## Test cases

### Case 1 — Cold-start bootstrap of legacy v6 groups (P0)

**Setup:** Existing profile from v1.38.x (schema v6) with at least one group containing 2+ saved bookmarks. NO floating tabs in any group yet.

**Action:**
1. Toggle the extension OFF in `edge://extensions`, then ON.
2. Open the sidepanel.
3. Open SW console; type `await chrome.storage.local.get('tj:groups')` and inspect any group's record.

**Expected:** Each group object now has a `renderOrder` field — an array of `'item:<id>'` strings, in Item.sortOrder ascending order. SW console shows no errors during cold-start.

**PASS criterion:** `renderOrder` populated on every group (sized to match each group's saved-bookmark count); refs are all `'item:*'` (no `'floating:*'`); no SW errors.
**FAIL criterion:** `renderOrder` missing on any group OR refs malformed OR SW errors during cold-start.

---

### Case 2 — Sidepanel render order matches renderOrder (P0)

**Setup:** Profile from Case 1 (post-bootstrap v7).

**Action:**
1. Open the sidepanel. Note the visible row order in the first group with multiple bookmarks.
2. In SW console: `(await chrome.storage.local.get('tj:groups')).['tj:groups'].find(g => g.id === '<that-group-id>').renderOrder`.

**Expected:** The visible row order (top to bottom) matches the `renderOrder` array indices (left to right).

**PASS criterion:** Visible row order matches renderOrder index order.
**FAIL criterion:** Visible row order differs from renderOrder.

---

### Case 3 — Floating-tab append goes to end of renderOrder (P0)

**Setup:** A group with 2-3 saved bookmarks, NO floating tabs. Bookmark 1 is the parent for inheritance.

**Action:**
1. Right-click bookmark 1 → "Open link in new tab" (creates a floating tab via opener-chain).
2. Verify the new tab appears as a floating row at the BOTTOM of the group's row list.
3. SW console: re-fetch `renderOrder` for that group.

**Expected:** A new `'floating:<floatingTabId>'` ref is appended at the END of the renderOrder. Visible row order: saved bookmarks (in pre-existing order), then the new floating row.

**PASS criterion:** Floating ref appended at end; visible order matches.
**FAIL criterion:** Ref inserted elsewhere OR visible order out of sync with renderOrder.

---

### Case 4 — Drag a floating tab BETWEEN two saved bookmarks (P0)

**Setup:** A group with 2 saved bookmarks (A, B) + 1 floating tab (F1) — initial order: A, B, F1.

**Action:**
1. Drag F1 upward and drop between A and B.
2. Visible new order should be: A, F1, B.
3. SW console: re-fetch `renderOrder`.

**Expected:** `renderOrder` is `['item:<A>', 'floating:<F1>', 'item:<B>']`. Visible row order matches. No toast errors.

**PASS criterion:** renderOrder updated to interleaved order; visible matches; no errors.
**FAIL criterion:** Drop is rejected OR floating tab returns to bottom OR error toast appears.

---

### Case 5 — Drag floating tab ABOVE all saved bookmarks (P1)

**Setup:** Same as Case 4 (A, B, F1).

**Action:**
1. Drag F1 to the very top of the group (above A).
2. Visible new order: F1, A, B.

**Expected:** `renderOrder` is `['floating:<F1>', 'item:<A>', 'item:<B>']`.

**PASS criterion:** Floating ref now first.
**FAIL criterion:** Drop rejected OR landed elsewhere.

---

### Case 6 — Reload browser, verify renderOrder persists (P0)

**Setup:** Profile from Case 4 (group with interleaved A, F1, B).

**Action:**
1. Close ALL browser windows (closes the floating tab F1).
2. Reopen the browser. Open the sidepanel.
3. SW console: re-fetch `renderOrder`.
4. Right-click bookmark A → "Open in new tab" — the new tab inherits as a floating tab.

**Expected:** After step 3, `renderOrder` should be `['item:<A>', 'item:<B>']` (the floating ref was stripped by `pruneFloatingGroupsByLiveTabId` on tab close, and the cold-start sweep also cleans stale refs). The visible sidepanel row order at step 4 should show A, B, then the new F (after inheritance), reflecting the persisted order with the new floating appended at end.

**PASS criterion:** Stale floating ref cleaned up; saved-bookmark order preserved across restart.
**FAIL criterion:** Stale ref persists OR saved-bookmark order changes unexpectedly.

---

### Case 7 — Newtab page renders interleaved order (P0)

**Setup:** Profile from Case 4 (interleaved order in some group).

**Action:**
1. Open a new tab (Ctrl+T or new-tab button).
2. Visually compare the order of rows in that group's section to the sidepanel.

**Expected:** Newtab renders the SAME interleaved order as the sidepanel.

**PASS criterion:** Newtab row order matches sidepanel.
**FAIL criterion:** Newtab order differs.

---

### Case 8 — Cross-group MOVE_FLOATING preserves renderOrder semantics (P1)

**Setup:** Group A with 2 saved + 1 floating; Group B with 1 saved + 0 floating.

**Action:**
1. Drag the floating tab from Group A's floating zone to a position in Group B.
2. SW console: fetch BOTH `renderOrder` arrays.

**Expected:** Group A.renderOrder no longer contains the `'floating:<F>'` ref. Group B.renderOrder gains it (preserved floatingTabId per §66.8.4) at the dropped position.

**PASS criterion:** Source strips, target appends/inserts at correct position.
**FAIL criterion:** Stale ref left in source OR ref missing from target.

---

### Case 9 — Delete a saved bookmark mid-list strips its ref (P1)

**Setup:** Group with renderOrder `['item:<A>', 'floating:<F>', 'item:<B>']`.

**Action:**
1. Delete bookmark B (right-click → Delete, confirm).
2. SW console: fetch renderOrder.

**Expected:** `renderOrder` is now `['item:<A>', 'floating:<F>']`. Visible row order: A, F.

**PASS criterion:** Stripped ref; siblings preserved in order.
**FAIL criterion:** Wrong ref stripped OR multiple stripped.

---

### Case 10 — Schema downgrade safety (P2 / SKIP if unable)

**Setup:** Profile with v7 schema (post-S44 install). Manual test only — requires a v1.38.x build for downgrade.

**Action:** SKIP unless an explicit downgrade test is run.

**Expected:** v7 → v6 downgrade is NOT supported; KNOWN_VERSION mismatch should be detected (existing safe-mode trigger). The sidepanel should refuse to write.

**PASS criterion:** Safe-mode kicks in.
**FAIL criterion:** Unprotected write proceeds.

---

### Case 11 — Lean-mode smoke (product-owner override, P0)

**Setup:** Real working profile.

**Action:** Open sidepanel; drag a floating tab to a new position between saved bookmarks; close & reopen the browser; verify the position persists.

**Expected:** End-to-end "drag-to-interleave-and-it-stays" flow works.

**PASS criterion:** Drag → new position → reopen → position retained. (Same lean-mode pattern as S42 / S43.)
**FAIL criterion:** Position is lost on reopen OR drag fails.

---

## Cleanup (between cases or final)

1. Reset storage if a case left state inconsistent: `chrome.storage.local.clear()` then `chrome.storage.session.clear()` in SW console.
2. Toggle extension OFF then ON to clear in-memory state.
3. Re-bootstrap by opening the sidepanel.

---

## Outcome record (filled at UAT time)

| Case | Status | Notes |
|------|--------|-------|
| 1    |        |       |
| 2    |        |       |
| 3    |        |       |
| 4    |        |       |
| 5    |        |       |
| 6    |        |       |
| 7    |        |       |
| 8    |        |       |
| 9    |        |       |
| 10   |        |       |
| 11   |        |       |
