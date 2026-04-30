# UAT — B-132 Cold-Start Claim-Jump Fix (Floating Tabs Land in Open Tabs After Extension Reload)

**Sprint:** 40 (v1.34.0)
**Branch:** `feature/sprint-40-drag-reorder`
**Spec:** `docs/design/65-b-132-cold-start-claim-jump-fix.md` (R2) · `docs/design/64-b-132-r0-spike.md` (R0)
**Tier:** Full (M) — UAT mandatory per CLAUDE.md Gate 2
**R3 file changes:**
- `background/tabs/floating-groups.js` (+83 — NEW exported `preMarkInheritedFromFloatingGroups()`)
- `background/tabs/index.js` (+7 — cold-start ordering insertion between `buildLiveTabIndex` and `reconcileClaims`)
- `background/tabs/tab-claims.js` (+22 — Phase 2 inheritance gate via shift-and-skip `while`)
- `tests/b132-cold-start-inheritance.test.js` (NEW, 391 LOC, 8 tests T-132-A..H)
- `tests/floating-position.test.js` (+10 comment-only, no assertion change)

**Automated test status:** 1,778/1,778 passing.

Manual test cases against the unpacked extension loaded in **Edge** (Developer Mode → Load unpacked → repo root). Run **after** verifying the automated suite passes.

> **Edge gotcha (per user memory):** `chrome://` URLs do not work in Edge. Use `edge://extensions` and `edge://serviceworker-internals` equivalents. To force-reload the extension after changes, toggle the extension OFF then ON in `edge://extensions`.

> **SW inspection:** Open `edge://extensions` → "Tab Junkie" card → "Inspect views: service worker" to view SW console logs. The `inheritedTabs` Set is SW-memory only — it cannot be inspected via the side-panel devtools. The `tj:floatingGroups` storage record can be inspected via `chrome.storage.local.get('tj:floatingGroups')` from the SW REPL.

> **Reload-vs-restart:** B-132 fixes the **extension-reload** failure mode (the user clicks Reload on the extension card, which tears down + re-creates the SW runtime and wipes `chrome.storage.session`). Browser-restart triggers the same wipe and is exercised by UAT-6.

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

## UAT-1 — Mode (b) primary repro: floating tab survives extension reload when its URL collides with a saved bookmark

**Priority:** H — primary acceptance test for AC1 + AC5. Reproduces the user's exact bug.

**Setup:**
1. In the active collection, create a group **G** (e.g., name "Reading"). Add one saved bookmark **Parent A** under **G** with any URL containing outbound links (e.g., `https://example.com/`).
2. Add a SECOND saved bookmark **Saved S** in **G** (or any other group) with a URL that an in-page link from **Parent A** will hit. The URL must be the same as the URL the spawned floating tab will have (e.g., the IANA "more information" link target `https://www.iana.org/help/example-domains`). For best repro, pick a URL the user can confirm both the in-page link and **Saved S** point at.
3. Click **Parent A** in the side panel — a tab opens, auto-claims **Parent A** (live indicator on the row).
4. Confirm the side panel: **Parent A** is claimed; **Saved S** is unclaimed.
5. Inside Parent A's tab, **middle-click** the in-page link whose URL matches **Saved S**. A new background tab opens.
6. Switch back to the side panel. Confirm:
   - The spawned tab appears as a synthetic floating row directly under **Parent A** in **G** (B-121 contract).
   - **Saved S** is **NOT** claimed by the spawned tab (B-125 runtime gate).

This pre-state is the input to the cold-start test below.

**Action:**
1. With the floating row visible under **Parent A** and **Saved S** unclaimed, go to `edge://extensions`.
2. Click the **Reload** button on the Tab Junkie card.
3. Re-open the side panel (it may auto-restore; if not, click the side panel toolbar icon).
4. Inspect the rendered state.

**Expected result:**
- The spawned floating tab REMAINS visible as a synthetic floating row under **Parent A** inside group **G** (post-reload re-render via `buildFloatingMembers`).
- **Saved S** stays unclaimed in the side panel (the row does NOT show the live indicator).
- The spawned tab does NOT appear in the **Open Tabs** section.
- SW console: no errors from `preMarkInheritedFromFloatingGroups`, `reconcileClaims`, or `reassociateFloatingGroups`.

**PASS criterion:** Floating tab still under **Parent A** + **Saved S** still unclaimed + no Open Tabs surface for that tab + no SW errors.

**FAIL criterion:** Floating tab disappears from under **Parent A** AND/OR **Saved S** shows live (claim-jumped to the spawned tab) AND/OR the tab appears in Open Tabs section. (This is the pre-fix bug returning.)

**Validates:** AC1 (Mode (b) primary fix) + AC5 (Phase 2 gate fires).

---

## UAT-2 — Mode (a) shallow-chain regression guard: post-reload middle-click still inherits

**Priority:** H — primary acceptance test for AC2. Confirms B-121/B-125 runtime path is not broken by the cold-start helper.

**Setup:**
1. With UAT-1's state (floating tab under **Parent A**, **Saved S** unclaimed), reload the extension via `edge://extensions` → Reload.
2. Re-open the side panel. UAT-1's state should hold per AC1.

**Action:**
1. After reload completes (give ~1 second for `initializeLiveState` to finish), focus **Parent A**'s tab.
2. **Middle-click** ANOTHER in-page link inside Parent A — pick a link whose URL does NOT match any saved bookmark (e.g., a link to a sub-page of `example.com`).
3. Switch back to the side panel.

**Expected result:**
- The newly spawned tab appears as a synthetic floating row under **Parent A** inside **G**.
- The new tab is NOT in the Open Tabs section.
- SW console: `tab/opener-inherited` broadcast fires (or the related debug message); no errors.

**PASS criterion:** New floating row appears under Parent A + tab absent from Open Tabs.

**FAIL criterion:** New tab lands in Open Tabs OR appears under a different group OR triggers a console error in the opener-chain code.

**Validates:** AC2 (B-121 / B-125 runtime contract preserved post-cold-start).

---

## UAT-3 — Mode (a) deep-chain carve-out (acceptable limitation, AC3)

**Priority:** M — documents the known-acceptable degradation. Confirms no console errors and confirms the user-recovery path works.

**Setup (pre-reload, build a multi-hop chain):**
1. Click **Parent A** to open and claim it.
2. Inside **Parent A**'s tab, middle-click a link to spawn a **child floating tab F1**. Confirm F1 appears as a floating row under **Parent A**.
3. Focus F1's tab. Inside F1, middle-click a NEW link (its URL must not match any saved bookmark) to spawn another tab F2. Per B-121's recursive opener-chain inheritance, F2 should also surface as a floating row under **Parent A**'s group.

**Action (the carve-out):**
1. Reload the extension via `edge://extensions` → Reload.
2. After reload, F1 should still be a floating row under **Parent A** (UAT-1 contract holds for F1; F1's record was in `tj:floatingGroups`).
3. Focus **F1**'s tab (the former-floating tab from pre-reload).
4. **Middle-click** any new in-page link inside F1 — this triggers a NEW spawn whose `openerTabId === F1.id`.
5. Switch to the side panel.

**Expected result (the carve-out):**
- The newly spawned tab (call it **F3**) lands in the **Open Tabs** section, NOT under **Parent A**'s group.
- This is the AC3 known-acceptable degradation — `openerMap` was wiped at extension reload, so the chain F1 → Parent A is no longer reconstructable.
- SW console: NO errors. The opener-chain walk simply returns null and the tab takes the unclaimed-Open-Tabs path.

**Recovery (verify the documented user recourse works):**
6. Close F3 (the misrouted tab).
7. Focus **Parent A**'s tab and middle-click the same link.
8. The new tab should now appear under **Parent A**'s group as a floating row (the post-reload runtime path works for spawns from a still-claimed parent).

**PASS criterion:** F3 lands in Open Tabs cleanly (no console errors); the close-and-respawn-from-bookmarked-parent recovery works.

**FAIL criterion:** F3 triggers a SW console error OR the recovery flow does not surface the new tab under Parent A.

**WARN criterion:** F3 lands in the wrong group (any group other than Open Tabs OR Parent A's group) — record as anomaly; not the AC3 expected behavior.

**Validates:** AC3 (deep-chain carve-out documented + user-recovery path).

---

## UAT-4 — R2-VERIFY 1 empirical confirmation (`chrome.storage.session` wipe on extension reload)

**Priority:** L — documentation hygiene. The fix is correct under either verdict per R2 §65.2.

**Setup:**
1. Open `edge://extensions` and click **Inspect views: service worker** on the Tab Junkie card. Wait for the SW console to open.

**Action:**
1. In the SW console, run: `await chrome.storage.session.set({ qaProbeB132: 'before-reload' })`.
2. Verify the write: `await chrome.storage.session.get('qaProbeB132')` should return `{ qaProbeB132: 'before-reload' }`.
3. Click the **Reload** button on the Tab Junkie card.
4. The SW console will close (the SW is torn down). Re-open it via **Inspect views: service worker**.
5. In the new SW console, run: `await chrome.storage.session.get('qaProbeB132')`.

**Expected result:** Step 5 returns `{}` (the key is absent — the session store was wiped).

**PASS criterion:** Step 5 returns `{}`.

**FAIL criterion:** Step 5 returns `{ qaProbeB132: 'before-reload' }` (session storage survived — contradicts R2 §65.2 verdict). The B-132 fix is still correct (per R2 §65.2 final paragraph), but R6 documentation should be amended to reflect the empirical anomaly.

**WARN criterion:** SW inspect view does not auto-reopen after the reload — manually navigate to it and try again before recording FAIL.

**Validates:** R2-VERIFY 1 / R3-V-4 — confirms the documented Chrome MV3 contract empirically on Edge.

---

## UAT-5 — Multi-window cold-start

**Priority:** M — confirms the helper iterates all windows' tabs, not just the active window.

**Setup:**
1. Open two browser windows: **W1** and **W2**. Open the side panel (or a separate sidepanel instance) in each.
2. In W1: click **Parent A** to claim it; inside that tab, middle-click a link to spawn a floating tab **F-W1** under Parent A's group.
3. In W2: click **Parent A** (it will activate the existing claim — or open a different bookmark there if you have multiple). Inside that tab, middle-click another link to spawn a floating tab **F-W2** under that bookmark's group.
4. Confirm via the side panel in either window: BOTH F-W1 (in W1) and F-W2 (in W2) show as floating rows.

**Action:**
1. Reload the extension via `edge://extensions` → Reload.
2. Re-open the side panel in BOTH windows.

**Expected result:** Both **F-W1** and **F-W2** still appear as floating rows under their respective parent groups in both side panels.

**PASS criterion:** Both floating rows surface correctly in both windows.

**FAIL criterion:** Either floating row disappears OR is misrouted to Open Tabs.

**Validates:** AC1 multi-window cold-start (the helper's `liveTabIndex` iteration covers all windows per R2 §65 + qa-reviewer notes / observations multi-window safety).

---

## UAT-6 — Empty `tj:floatingGroups` regression guard (no-floating-state cold-start)

**Priority:** M — confirms the helper does not crash or mis-render when there are zero floating records.

**Setup:**
1. Close ALL bookmarked tabs in all windows. Confirm via the side panel: zero floating rows everywhere; the **Open Tabs** section may have unrelated tabs but no `[data-floating="true"]` rows.
2. Inspect SW: `await chrome.storage.local.get('tj:floatingGroups')` should return either `{}` or `{ 'tj:floatingGroups': [] }`.

**Action:**
1. Reload the extension via `edge://extensions` → Reload.
2. Re-open the side panel.

**Expected result:**
- The side panel renders normally: groups, saved bookmarks, Open Tabs section all populated correctly.
- No SW console errors.
- The cold-start sequence completes without throwing.

**PASS criterion:** Side panel renders + no errors.

**FAIL criterion:** SW throws an error OR the side panel shows broken state OR the claimsMirror is empty when it should not be (saved items that match live tabs should still auto-claim — Phase 1 reconcile is unaffected by an empty `tj:floatingGroups`).

**Validates:** AC1 empty-state branch (T-132-B equivalent, per R2 §65.9 C-9 enumerated state (i)).

---

## UAT-7 — Concurrent reload + tab activity

**Priority:** L — race-window posture per R2 §65.8 R-1. Window is < 1 ms in practice; we look for any visible regression.

**Setup:**
1. UAT-1 setup: floating tab under Parent A, Saved S unclaimed.
2. Open ONE additional tab to a slow-loading page (e.g., a SPA that updates the title several times after initial load — `https://twitter.com` works; or any large page).

**Action:**
1. Just as the slow-loading page is updating its title (e.g., 1-2 seconds after the page settles, but while DOM is still rendering), click **Reload** on the Tab Junkie card in `edge://extensions`.
2. Re-open the side panel.

**Expected result:** UAT-1's state holds (floating tab still under Parent A; Saved S unclaimed). The cold-start sequence absorbed the in-flight `chrome.tabs.onUpdated` events without misrouting.

**PASS criterion:** UAT-1 contract still holds.

**FAIL criterion:** Floating tab is misrouted OR Saved S is claim-jumped OR a SW error fires.

**WARN criterion:** A flicker in the side panel where the floating tab briefly appears in Open Tabs and then snaps back to under Parent A — record as observed; the cold-start ordering is sequential per R2 §65.8 so a brief race is bounded but possible.

**Validates:** AC1 + R2 §65.8 race-guard analysis — the fix narrows the race window without introducing a new race surface.

---

## UAT-8 — Helper failure graceful-degradation (post-Wave-3a M-2 fix simulation)

**Priority:** M — exercises the qa-reviewer M-2 deferred finding (helper try/catch). Tests defensive corruption tolerance.

**Setup:**
1. UAT-1 setup: floating tab under Parent A, Saved S unclaimed.
2. Open the SW console.

**Action:**
1. In the SW console, write a corrupt `tj:floatingGroups` value to force the next read to throw:
   ```
   await chrome.storage.local.set({ 'tj:floatingGroups': 'this-is-not-an-array' })
   ```
2. Click **Reload** on the Tab Junkie card.
3. Re-open the side panel.
4. Inspect the SW console for any thrown error or warning.

**Expected result (per Wave 3a M-2 fix posture):**
- SW console shows a warning (e.g., `[tab-junkie] B-132 helper failed`) OR the helper short-circuits gracefully.
- `reconcileClaims` and `reassociateFloatingGroups` still run — the side panel renders saved bookmarks with normal claim state.
- Open Tabs section still surfaces unrelated live tabs.
- The corrupt floating-groups partition self-heals on the next write OR the user has to reset (per the documented SEV2 corruption recovery — see `docs/design/13-incident-log.md`).

**PASS criterion:** Warning logged AND side panel renders without an entirely-broken claims state (some claims should still surface, even if floating-groups data is unrecoverable).

**FAIL criterion:** SW throws an unhandled error AND `claimsMirror` is empty for the entire SW lifetime (the entire downstream cold-start sequence aborted on the helper's read failure).

**Cleanup:** After the test, restore a clean state: `await chrome.storage.local.remove('tj:floatingGroups')` and reload.

**Validates:** qa-reviewer B-132 M-2 — defensive corruption tolerance for the new cold-start helper read path. Records whether the Wave-3a fix shipped or remains as a deferred MEDIUM.

---

## UAT-9 — No-regression smoke test on B-121 / B-125 flows

**Priority:** M — confirms B-132 does not regress the B-121 floating-tab render or the B-125 runtime claim-jump fix.

**Setup:** A typical user collection with 2-3 groups, 4-6 saved bookmarks, 1-2 open bookmarked tabs.

**Action:**
1. **B-121 spot-check (without reload):** Click a saved bookmark to claim it. Inside that tab, middle-click an in-page link. Confirm the new tab appears as a floating row under the parent group (B-121 AC1).
2. **B-125 spot-check (without reload):** Set up two saved bookmarks A and B. Click A. From A's tab, click an in-page link whose URL matches B's URL. Confirm A stays claimed and B is NOT claim-jumped (B-125 AC1, per UAT_B-125 UAT-1).
3. **B-099 D-1 spot-check (without reload):** From A's claimed tab, navigate the URL bar to a new URL that does NOT match any saved bookmark. Confirm A stays claimed (B-099 D-1 — claim survives URL change).

**Expected result:** All three spot-checks pass — B-121, B-125, and B-099 D-1 contracts intact.

**PASS criterion:** All three flows behave per their original contracts.

**FAIL criterion:** Any of the three flows regresses (e.g., B-121 floating row missing; B-125 claim-jumps; B-099 claim drops on URL change).

**Validates:** AC6 (no regressions) + protects the B-121/B-125/B-099 contracts that B-132 borrows from.

---

## Summary

| Case | Priority | AC mapping | Status |
|------|----------|------------|--------|
| UAT-1 | H | AC1 + AC5 | _to record_ |
| UAT-2 | H | AC2 | _to record_ |
| UAT-3 | M | AC3 carve-out | _to record_ |
| UAT-4 | L | R2-VERIFY 1 (R3-V-4) | _to record_ |
| UAT-5 | M | AC1 multi-window | _to record_ |
| UAT-6 | M | AC1 empty-state (T-132-B parity) | _to record_ |
| UAT-7 | L | AC1 + R2 §65.8 race | _to record_ |
| UAT-8 | M | qa M-2 — helper try/catch posture | _to record_ |
| UAT-9 | M | AC6 — no regressions | _to record_ |

**Acceptance gate:** UAT-1, UAT-2, UAT-3 (carve-out documented), UAT-5, UAT-6, UAT-9 must PASS before sprint close. UAT-4 + UAT-7 + UAT-8 may record as PASS/WARN/SKIP at product-owner discretion.

**Re-test trigger:** any UAT FAIL routes the item back to [frontend-engineer] per CLAUDE.md Gate 2.
