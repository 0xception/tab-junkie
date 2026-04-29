# B-125 UAT — Tab Claim Ownership Jump on URL Navigation

**Sprint:** 38 (v1.32.0)
**Branch:** `feature/sprint-36-ui-polish` (continued)
**Spec:** `docs/design/59-b-125-claim-jump-fix.md`
**Tier:** Full (M) — UAT mandatory per CLAUDE.md Gate 2
**Build target:** `./build.sh` produces `tab-junkie.zip`; load unpacked from repo root in Edge developer mode
**R3 file changes:** `background/tabs/tab-claims.js`, `background/tabs/tab-events.js`, `tests/b125-claim-jump-fix.test.js`
**Automated test status:** 1,646/1,646 passing (5 new B-125 tests T1–T5).

Manual test cases against the unpacked extension loaded in **Edge** (Developer Mode → Load unpacked → repo root). Run **after** verifying the automated suite passes.

> **Edge gotcha (per user memory):** `chrome://` URLs do not work in Edge. Use `edge://extensions` and `edge://serviceworker-internals` equivalents. To force-reload the extension after changes, toggle the extension OFF then ON in `edge://extensions`.

> **SW inspection:** Open `edge://extensions` → "Tab Junkie" card → "Inspect views: service worker" to view SW console logs. The `inheritedTabs` Set is SW-memory only — it cannot be inspected via the side panel devtools.

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
4. Have the SW console open (per "SW inspection" above) so any thrown errors during inheritance are visible.

---

## UAT-1 — Direct user repro (xcelenergy → Workday claim-jump)

**Priority:** H — primary acceptance test for AC1 + AC5. This is the user's exact reproduction from the bug report.

**Setup:**
1. Add two saved bookmarks in the active collection:
   - **The Source** → `https://xcelenergy.sharepoint.com/`
   - **Home - Workday** → a Workday URL that the in-page link from xcelenergy will navigate to (the user knows the exact URL — typically `https://wd5.myworkday.com/xcel/d/home.htmld` or similar). Use the URL the user has previously hit when reproducing the bug.
2. Click the **The Source** bookmark in the side panel — a tab opens to xcelenergy and auto-claims the bookmark (you should see the live-state indicator on the row).
3. Confirm in the side panel: **The Source** row shows live (claimed); **Home - Workday** row is unclaimed.

**Action:**
1. With the xcelenergy tab focused, find an in-page link that navigates to the Workday URL matching **Home - Workday** (e.g., a "Workday" link in the SharePoint nav).
2. Click that link normally (left-click, no modifier). This will either open a new tab OR navigate the current tab — note which.
3. If a new tab opens, return to the side panel and observe both rows.
4. If the current tab navigates, return to the side panel and observe the row state.

**Expected result:**
- **The Source** row remains claimed by the original tab (B-099 D-1 — claim survives URL change).
- **Home - Workday** row is **NOT** claimed by the spawned/navigated tab (B-125 fix — auto-claim is gated by `inheritedTabs`).
- The spawned tab (if a new tab opened) appears under **The Source**'s parent group as a floating tab (opener-chain inheritance, B-013).

**PASS criterion:**
- Original **The Source** claim survives, AND
- **Home - Workday** is NOT claimed by the new tab, AND
- A second click of the same in-page link does NOT produce a duplicate Open-Tabs row (the secondary symptom in the original bug).

**FAIL criterion:**
- **Home - Workday** auto-claims the spawned tab (the bug returns), OR
- The original **The Source** claim is lost / re-assigned to the new tab, OR
- A second click of the same link produces a duplicate Open-Tabs row.

**Validates:** AC1 + AC5 + the user-facing acceptance gate that motivated B-125 in the first place.

---

## UAT-2 — Ctrl+click new tab in background

**Priority:** H — exercises the most common opener-chain spawn path.

**Setup:**
1. Add two saved bookmarks:
   - **Bookmark A** → any URL with outbound links (e.g., `https://example.com/`).
   - **Bookmark B** → a URL that one of Bookmark A's in-page links will hit (any link target on that page; the URL must match a saved bookmark).
2. Click **Bookmark A** to open and auto-claim it.

**Action:**
1. With Bookmark A's tab focused, **Ctrl+click** any in-page link whose href matches **Bookmark B**'s URL.
2. The new tab opens in the background — Ctrl+click does not switch focus.
3. Return to the side panel.

**Expected result:**
- **Bookmark A** remains claimed by the original tab.
- **Bookmark B** is NOT claimed by the background tab.
- The background tab appears under **Bookmark A**'s parent group (opener-chain inheritance, B-121 territory).

**PASS criterion:** Bookmark A claim survives + Bookmark B unclaimed + background tab appears under the parent group.
**FAIL criterion:** Bookmark B auto-claims the new tab, OR Bookmark A's claim transfers, OR the new tab appears in a wrong group.

**Validates:** AC1 + AC2 — Ctrl+click opener-chain spawn does not steal a different bookmark's claim.

---

## UAT-3 — Middle-click new tab

**Priority:** M — same coverage as UAT-2 with a different spawn input. Some browsers route middle-click through a different code path.

**Setup:** Same as UAT-2.

**Action:**
1. With Bookmark A's tab focused, **middle-click** an in-page link to Bookmark B's URL.
2. The new tab opens in the background.
3. Return to the side panel.

**Expected result:** Identical to UAT-2.

**PASS criterion:** Same as UAT-2.
**FAIL criterion:** Same as UAT-2.

**Validates:** AC1 + AC2 — middle-click opener-chain spawn does not steal a claim.

---

## UAT-4 — Shift+click new window

**Priority:** M — exercises cross-window opener-chain spawn (different `windowId` than the parent).

**Setup:** Same as UAT-2.

**Action:**
1. With Bookmark A's tab focused, **Shift+click** an in-page link to Bookmark B's URL.
2. A new window opens with the new tab focused.
3. Switch back to the original window (where Bookmark A is) and open the side panel there.

**Expected result:**
- **Bookmark A** remains claimed by the original tab.
- **Bookmark B** is NOT claimed by the new-window tab.
- The new-window tab appears under **Bookmark A**'s group as a floating tab (cross-window opener-chain still resolves per B-013).

**PASS criterion:** Bookmark A claim survives + Bookmark B unclaimed in both windows' side panels.
**FAIL criterion:** Bookmark B auto-claims the new-window tab, OR opener-chain inheritance fails (new-window tab appears in Open Tabs instead of under the parent group).

**WARN criterion:** New-window tab does NOT appear under Bookmark A's group BUT also does NOT auto-claim Bookmark B. This is a B-013 edge case (opener-chain across windows), not a B-125 regression — record as WARN.

**Validates:** AC1 — opener-chain inheritance works across windows AND the gate holds.

---

## UAT-5 — Window close cascade prunes inherited markers

**Priority:** M — exercises the `windows.onRemoved` per-tab cleanup path (`pruneInherited` inside the cascade loop, per §59.3 / §59.5).

**Setup:**
1. Add two saved bookmarks:
   - **Bookmark A** → a URL with outbound links.
   - **Bookmark C** → a URL that opener-chain spawning will hit.
2. Open Bookmark A in a fresh window (Shift+click the bookmark in the side panel, or open it then drag the tab out to a new window).
3. From Bookmark A's tab, Ctrl+click 3–5 in-page links so multiple inherited tabs accumulate in that window. At least one of those should match **Bookmark C**'s URL. Confirm via the side panel that none of the spawned tabs claimed **Bookmark C**.

**Action:**
1. Close the entire window (right-click the window's title bar → Close window, or click the window's X). All tabs in that window are removed at once.
2. Return to the original (other) window's side panel.
3. Open a fresh user-initiated tab to **Bookmark C**'s URL by clicking **Bookmark C** in the side panel.
4. Observe whether the new tab auto-claims **Bookmark C**.

**Expected result:** The new user-initiated tab to Bookmark C's URL auto-claims **Bookmark C** normally — the inherited markers from the closed window were correctly pruned, so even if Edge recycles a tabId from the closed window, that ID is no longer in `inheritedTabs`.

**PASS criterion:** Bookmark C auto-claims after the window close.
**FAIL criterion:** Bookmark C does NOT auto-claim — would indicate the `windows.onRemoved` cascade failed to prune `inheritedTabs` for one or more closed tabs, leaking a stale marker into a recycled tabId.

**WARN criterion:** Edge does not recycle tabIds in this session, so the test cannot definitively prove the cascade pruned. Record as WARN; the automated test T3 (pruneInherited) provides primary coverage.

**Validates:** §59.5 fix-scope row "windows.onRemoved handler — extend the per-tab loop to call pruneInherited(tabId)".

---

## UAT-6 — Tab close + reopen prunes inherited marker

**Priority:** H — direct exercise of `pruneInherited` on the `tabs.onRemoved` path. Critical for confirming the marker doesn't leak across tab lifecycles.

**Setup:**
1. Add two saved bookmarks:
   - **Bookmark A** → a URL with outbound links.
   - **Bookmark D** → a URL that opener-chain spawning will hit.
2. Click **Bookmark A** to open and auto-claim it.
3. From Bookmark A's tab, Ctrl+click an in-page link matching **Bookmark D**'s URL. A new background tab opens with the inherited marker.
4. Confirm via side panel: Bookmark D is NOT claimed (UAT-2 result).

**Action:**
1. Close the inherited tab (right-click → Close, or middle-click in the tab strip).
2. In the side panel, click **Bookmark D** directly to open a fresh user-initiated tab to the same URL.
3. Observe whether **Bookmark D** auto-claims.

**Expected result:** **Bookmark D** auto-claims the fresh user-initiated tab — the inherited marker was correctly pruned on close, so the new tab (even if it gets the same recycled tabId) is treated as a normal user-initiated tab and hits the auto-claim path.

**PASS criterion:** Bookmark D auto-claims (live-state indicator appears on the row).
**FAIL criterion:** Bookmark D does NOT auto-claim — would indicate `pruneInherited` did not run on `tabs.onRemoved`, OR the `inheritedTabs` Set has an ordering bug.

**Validates:** §59.3 "Pruning" — `pruneInherited(tabId)` adjacent to `pruneOpener(tabId)` in `chrome.tabs.onRemoved` (`tab-events.js:195-208`).

---

## UAT-7 — SW restart recovery (graceful degradation)

**Priority:** M — confirms documented cold-start behavior (§59.3 "Cold-start state", §59.4(iii)). The `inheritedTabs` Set is empty post-restart; the recovery is `tj:floatingGroups` re-association.

**Setup:**
1. Add two saved bookmarks:
   - **Bookmark A** → a URL with outbound links.
   - **Bookmark E** → a URL the in-page link will navigate to.
2. Click **Bookmark A** to open and auto-claim it.
3. Ctrl+click an in-page link matching **Bookmark E** to spawn an inherited tab. Confirm: Bookmark E is NOT claimed; the inherited tab appears under Bookmark A's group.

**Action:**
1. Toggle the extension OFF in `edge://extensions` (the SW dies and `inheritedTabs` is wiped).
2. Toggle the extension back ON (SW cold-starts; `reassociateFloatingGroups` runs).
3. Re-open the side panel.
4. Observe both rows + the live state of the inherited tab.

**Expected result (per §59.3 + §59.4(iii) — known-acceptable degradation):**
- **Bookmark A** retains its claim if the live tab still matches by URL (post-cold-start `reconcileClaims` re-establishes).
- The previously-inherited tab is re-associated into Bookmark A's group via `reassociateFloatingGroups` (the `tj:floatingGroups` storage record persists across SW restart).
- **Bookmark E** is NOT claimed — even though `inheritedTabs` is now empty, the inherited tab's URL matches Bookmark E AND `reassociateFloatingGroups` claims it via the floating-group record (so `alreadyClaimed === true` short-circuits the auto-claim path).
- **Acceptable warn**: if the inherited tab does NOT have a `tj:floatingGroups` record at restart (parent bookmark deleted, etc.), the post-restart `reevaluateTab` will see `inheritedTabs` empty and **may auto-claim Bookmark E** — this is documented as known-acceptable per §59.4(iii). Record as WARN, not FAIL.

**PASS criterion:** Bookmark A claim survives + inherited tab still under Bookmark A's group + Bookmark E not claimed.
**FAIL criterion:** Bookmark A's claim is lost AND Bookmark E claims the inherited tab — would indicate both `reassociateFloatingGroups` AND `reconcileClaims` failed on cold-start.
**WARN criterion:** Bookmark E auto-claims the inherited tab post-restart but Bookmark A still has its claim — documented as known-acceptable per §59.4(iii); the recovery contract is `tj:floatingGroups`, not `inheritedTabs`.

**Validates:** §59.3 cold-start state + §59.4(iii) edge case behavior.

---

## UAT-8 — Regression guard for B-099 (URL-change does not lose claim)

**Priority:** H — guards against B-099 regression. The B-125 gate sits inside the `!alreadyClaimed` branch (per §59.3 "Consumption"), so a tab whose URL changes mid-session must still hit the `alreadyClaimed` short-circuit before the new gate is even consulted.

**Setup:**
1. Add one saved bookmark:
   - **Bookmark F** → e.g., `https://example.com/`.
2. Click **Bookmark F** to open and auto-claim it. Confirm via side panel: Bookmark F shows live-state.

**Action:**
1. With the Bookmark F tab focused, click into the address bar and navigate the tab to a different URL — e.g., `https://example.org/` — that does NOT match any saved bookmark.
2. Wait ~1 second for `onUpdated` debounce (per `tab-events.js:116`) to fire `reevaluateTab`.
3. Return to the side panel and observe Bookmark F's row.
4. Now navigate the tab back to `https://example.com/`.
5. Observe again.

**Expected result:**
- After step 1's navigation away: Bookmark F's row shows **drift** state (dotted amber bar in the gutter) — the live tab no longer URL-matches the bookmark, but the claim is RETAINED (B-099 D-1).
- After step 4's navigation back: drift clears; row returns to normal live-state.
- At no point does Bookmark F's claim transfer to a different bookmark or get lost.

**PASS criterion:** Step-1 drift indicator appears + claim retained throughout + step-4 drift clears cleanly.
**FAIL criterion:** Bookmark F's claim is dropped after step 1 (B-099 regression), OR drift indicator does not appear (B-110 regression), OR claim is not restored after step 4.

**Validates:** B-099 D-1 (claim survives URL change) is unbroken by the B-125 gate; the four sanctioned `releaseClaimByTab` call sites (§59.2.2 AC4 invariant) remain intact.

---

## Reporting

After running UAT, record results in `docs/SPRINT.md` "Completed This Sprint" → B-125 entry, in this format:

```
- UAT-1: PASS / FAIL / WARN / SKIP — <one-line note: which Workday URL was used, what happened on second click>
- UAT-2: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-3: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-4: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-5: PASS / FAIL / WARN / SKIP — <one-line note: did Edge recycle tabIds?>
- UAT-6: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-7: PASS / FAIL / WARN / SKIP — <one-line note: did the inherited tab have a tj:floatingGroups record post-restart?>
- UAT-8: PASS / FAIL / WARN / SKIP — <one-line note>
```

**Routing rules:**
- FAIL on UAT-1, UAT-2, UAT-3, UAT-6, or UAT-8 → route back to [frontend-engineer] immediately. UAT-1 is the user's exact repro and FAIL means the fix did not ship correctly. UAT-8 FAIL means a B-099 regression.
- FAIL on UAT-4 → route back to [frontend-engineer]; cross-window opener-chain coverage is part of B-013 + B-125's contract.
- FAIL on UAT-5 → route back to [frontend-engineer] for `windows.onRemoved` cascade verification.
- FAIL on UAT-7 → route back to [solution-architect] for cold-start recovery design re-review.
- WARN on UAT-4 (cross-window opener-chain didn't resolve) → record as B-013 edge-case feedback; not a B-125 regression.
- WARN on UAT-5 (Edge did not recycle tabIds) → acceptable; rely on automated T3 + T4 for primary coverage.
- WARN on UAT-7 (auto-claim happens because no `tj:floatingGroups` record) → acceptable per §59.4(iii); documented degradation.

**Gate 3 (UAT Acceptance):** All 8 cases must reach PASS or acceptable WARN/SKIP for B-125 to pass Gate 3 and be marked done.
