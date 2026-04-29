# UAT — B-110 Drift Indicator on Non-Live Bookmark Bug Fix

**Sprint:** 36
**Branch:** `feature/sprint-36-ui-polish`
**Spec:** `docs/design/53-b-110-drift-non-live-fix.md` §53.6
**Tier:** Full (M) — UAT mandatory per CLAUDE.md Gate 2

Manual test cases against the unpacked extension loaded in Edge. Run **after** verifying the automated suite (`node --test tests/*.test.js`) passes 1,488/1,488 (or current post-S36 baseline).

| Symbol | Meaning |
|---|---|
| **PASS** | Observed behavior matches PASS criteria |
| **FAIL** | Observed behavior matches FAIL criteria; route back to [frontend-engineer] |
| **WARN** | Observed but documented R2 tradeoff (not a regression) |
| **SKIP** | Could not be exercised in this run; record reason |

---

## UAT-1 — Primary repro (drift bar disappears on tab-close-while-SW-asleep)

**Priority:** H — primary acceptance test for AC1 + AC2.

**Steps:**
1. Open a saved bookmark from the sidepanel — item becomes live (row gets the live treatment; no drift bar).
2. In the opened tab, navigate to a different URL — item becomes drifted (dotted amber bar appears in the row's left gutter alongside the live treatment).
3. Wait ~30 seconds with no browser activity. The MV3 service worker will go idle. Optional: confirm via `edge://serviceworker-internals` (see "running" → "stopped" transition).
4. Close the live tab via the browser tab strip (NOT via a sidepanel action).
5. Bring focus back to the sidepanel. This wakes the SW.

**PASS criterion:**
- Dotted drift bar is **GONE** from the affected item's row.
- Row shows non-live state (no live treatment).
- DevTools → Application → Storage → `chrome-extension://...` → Local Storage → `tj:drift` does **NOT** contain an entry for the item's id.

**FAIL criterion:**
- Drift bar still visible OR `tj:drift` still contains the item's id.

**Validates:** AC1 (defense-in-depth gate) + AC2 (PRIMARY source patch — `reconcileClaims` cold-start eviction clears drift).

---

## UAT-2 — Storage verification (post-UAT-1)

**Priority:** H — confirms the source patch (not just the render gate) cleared storage.

**Steps:**
1. Complete UAT-1 through step 5.
2. Open DevTools → Application → Storage → Local Storage → expand the extension origin → click the row for the `tj:drift` key.
3. Inspect the JSON value.

**PASS criterion:** `tj:drift` does NOT contain the affected item's id as a key.

**FAIL criterion:** Item id is present as a key in `tj:drift` (orphan record persisted — source patch did not run; render gate is masking the symptom but the storage leak is still real).

**Validates:** AC2 source-patch verification — distinguishes "render-only fix" from "storage cleanup."

---

## UAT-3 — Regression: live + drifted row still surfaces the bar

**Priority:** H — guards against the conjunctive gate over-suppressing the bar.

**Steps:**
1. Open a saved bookmark from the sidepanel.
2. Navigate the live tab to a different URL.
3. Leave the tab open. Do NOT wait for SW sleep.
4. Sidepanel row remains visible.

**PASS criterion:**
- Dotted drift bar **visible** in the row's left gutter alongside the live treatment.
- Hover the bar → tooltip shows `Drifted to: <hostname>`.

**FAIL criterion:** Bar absent OR tooltip missing — would indicate the conjunctive gate over-suppressed the bar, breaking the B-099 + B-101 contract.

**Validates:** AC3 — B-099 + B-101 contract preserved post-B-110.

---

## UAT-4 — Multi-window propagation

**Priority:** M — confirms the broadcast path delivers the cleared state to other windows.

**Steps:**
1. Open the sidepanel in two browser windows (Window A and Window B), each viewing the same collection.
2. In Window A, open a saved bookmark; navigate the tab to drift; wait ~30s for SW sleep; close the tab via the browser tab strip.
3. Bring focus to Window B (do NOT touch Window A's sidepanel).

**PASS criterion:** Window B's sidepanel row reflects cleared drift state (no dotted bar) within ~1 s of focus change. Broadcast (per §10.10) propagates the cleared `tj:drift` state.

**FAIL criterion:** Window B still shows the drift bar after Window A's tab close, even after the SW wakes.

**Validates:** Cross-window consistency under SW-sleep + cold-start scenarios.

---

## UAT-5 — MSG_NAVIGATE_TO_ITEM stale-claim repair clears drift (SECONDARY leak)

**Priority:** M — extra coverage for the SECONDARY leak path. Timing-sensitive; if not reproducible, downgrade to SKIP and rely on automated T7.

**Steps:**
1. Open a saved bookmark; navigate to drift; wait ~30s for SW sleep; close the tab.
2. **Without bringing focus to the sidepanel first** (avoid waking the SW via sidepanel render), click the affected row directly. The SW wakes via `MSG_NAVIGATE_TO_ITEM`. If the AC3 stale-claim repair branch fires (race between `reconcileClaims` and message dispatch), the SECONDARY leak fix runs.

**PASS criterion:**
- New tab opens at the saved URL.
- Sidepanel row eventually shows live again (newly claimed).
- `tj:drift` no longer contains the item id (verified via DevTools).

**FAIL criterion:** `tj:drift` still contains the item id after the navigate-to-item flow completes (leak survived).

**Notes:**
- This case may not always reach the AC3 branch (the SW may finish `reconcileClaims` first, in which case the PRIMARY patch covers the cleanup). If the SW order varies and the AC3 branch never fires in 3 attempts, mark as **SKIP** — automated T7 statically asserts the patch site.

**Validates:** AC2 SECONDARY leak fix — `MSG_NAVIGATE_TO_ITEM` AC3 stale-claim repair calls `clearDrift`.

---

## Reporting

After running UAT, record results in `docs/SPRINT.md` "Completed This Sprint" → B-110 entry, in this format:

```
- UAT-1: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-2: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-3: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-4: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-5: PASS / FAIL / WARN / SKIP — <one-line note>
```

Any FAIL on UAT-1, UAT-2, or UAT-3 routes the item back to [frontend-engineer]. UAT-4 / UAT-5 are extra coverage; SKIP is acceptable on those if they cannot be reproduced.
