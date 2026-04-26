# UAT Plan — B-102 Cross-Window Demote Broadcast

Sprint 35 · Full (M) · R5 UAT plan (authored by [test-engineer])

Related artefacts:

- `docs/BACKLOG.md` — B-102 row (6 acceptance criteria)
- `docs/design/50-b-102-103-open-tabs-patch.md` — shared R2 design chapter (D-1..D-4 + C-1..C-12)
- `docs/findings/sprint-35.md` — R4 findings (B-102 H-1 + M-1 fixed in R3-fix)
- `docs/SPRINT.md` — Sprint 35 active item B-102
- `tests/b102-cross-window-demote.test.js` — 8 automated tests (T1-T8; T5 documented skip with mapping to UAT-1)
- `tests/b099-drift-fix.test.js` T8 — pre-existing demote regression test (carried unchanged per AC5)
- `sidepanel/sidepanel.js` lines ~5121-5206 — diffAndPatch fast-path branches (`'noop'` ~5124-5148; `'patch'` ~5149-5202) carrying the §50 D-1 fix
- `background/messages/storage-handlers.js` lines ~287-335 — `MSG_DEMOTE_ITEM` SW handler (unchanged by B-102)
- `background/broadcast.js` — `broadcast(scope, trigger)` (unchanged by B-102)

## Preconditions

1. Extension loaded unpacked from `feature/sprint-35-bug-fixes` via `edge://extensions` → "Load unpacked" → repo root.
2. Edge (primary target browser; the user runs Edge per CLAUDE.md / MEMORY).
3. Fixture: any non-empty bookmarks collection with at least 2 saved bookmarks in the same group, each pointing to URLs you can open in real tabs (e.g. `https://example.com` and `https://example.org`).
4. DevTools open on the background service worker (`edge://extensions` → Tab Junkie → "Inspect views: service worker") for storage / claim inspection.
5. Confirm starting state: in the SW console run `chrome.storage.session.get('tj:tabClaims')` and `chrome.storage.local.get('tj:items')` — note baseline before each test.

**C-1 stale-SW note (per CLAUDE.md B-094 extension):** B-102 introduces zero new pref keys, zero new manifest entries, and zero storage schema changes. The C-1 verdict in §50.5 is N/A — no extension toggle-OFF-then-ON cycle is required after update. Load the extension once and proceed.

**Multi-window UAT mandate (B-102 R1 Q2 LOCKED):** UAT-1, UAT-2, UAT-3, and UAT-5 below REQUIRE A REAL BROWSER SESSION WITH AT LEAST 2 SIDEPANEL WINDOWS OPEN SIMULTANEOUSLY. The B-102 symptom (item GONE from BOTH group AND Open Tabs on non-originating windows) ONLY reproduces in a true multi-context browser session. `chrome-mock` cannot model two independent sidepanel contexts each running their own `diffAndPatch` and `patchOpenTabsSection`. The automated `tests/b102-cross-window-demote.test.js` T5 explicitly documents this skip and maps to UAT-1.

**How to open a second sidepanel window in Edge:**
1. With Tab Junkie's sidepanel already open in window A, open a NEW Edge browser window (Ctrl+N).
2. In window B's toolbar, click the Tab Junkie extension icon to open its sidepanel.
3. Confirm BOTH windows have the Tab Junkie sidepanel visible side-by-side.
4. Both sidepanel contexts run their own copy of `sidepanel.js` and maintain their own `_cachedItems` + `_cachedOpenTabs`.

Legend: **B** = blocker (zero failures tolerated) · **H** = high (at most 1 fail, documented) · **M** = medium (non-blocking)

---

## Test Cases

### Multi-window cross-window demote (AC1, AC2, AC3, AC4) — REQUIRES MANUAL EDGE EXECUTION

#### UAT-1: Demoted bookmark moves to Open Tabs section in non-originating windows — Priority: B (BLOCKER) — REQUIRES MULTI-WINDOW

**REQUIRES MANUAL EDGE EXECUTION** — cannot be reproduced single-window; cannot be reproduced via `chrome-mock`. This is the symptom that B-102 fixes.

**Given** at least 2 Edge windows open, each with Tab Junkie's sidepanel visible (Window A and Window B per "How to open a second sidepanel window in Edge" above).
**And** at least one saved bookmark "Demote-target" exists in a group, with a live tab open and claimed by it (the row shows the green live dot in BOTH sidepanels).
**When** in Window A, I right-click the bookmark row "Demote-target" and click "Demote bookmark" (or use the X-button affordance — whichever the current B-100 wiring exposes for live-bookmark demote).
**Then** within ~500 ms in WINDOW B (the non-originating window):
  - The "Demote-target" row DISAPPEARS from its group section.
  - The tab that was previously claimed by "Demote-target" APPEARS as a row in the Open Tabs section of Window B.
  - The bookmark does NOT vanish entirely from both sections (this was the pre-fix bug).
**And** the same end-state appears in Window A within ~500 ms (originating-window behavior unchanged per AC5).
**Expected**: SW console `chrome.storage.session.get('tj:tabClaims')` shows the claim is gone for the demoted item id. `chrome.storage.local.get('tj:items')` no longer contains the demoted item. Both sidepanels' DOM `querySelectorAll('.item-row[data-item-id="<demoted-id>"]')` returns empty NodeList. Both sidepanels' DOM `querySelector('#open-tabs-section [data-tab-id="<formerly-claimed-tab-id>"]')` returns the Open-Tabs row.

**FAIL conditions** (any one is a blocker):
- Window B shows the bookmark gone from BOTH the group AND the Open Tabs section (pre-fix B-102 symptom).
- Window B shows the bookmark still in its group after > 500 ms.
- Open Tabs section in Window B does not contain the formerly-claimed tab after > 500 ms.
- Window B's sidepanel requires a manual reload to pick up the change.

---

#### UAT-2: Cross-window state convergence within ~500 ms — Priority: B (BLOCKER) — REQUIRES MULTI-WINDOW

**REQUIRES MANUAL EDGE EXECUTION** — same setup as UAT-1.

**Given** the same multi-window setup as UAT-1, with a live claimed bookmark "Convergence-target" visible in both windows.
**When** I demote "Convergence-target" in Window A.
**Then** within ~500 ms (visible by stopwatch or visual perception — should feel instantaneous, well below 1 s):
  - Window A's items DOM and Open Tabs DOM reach their post-demote end-state.
  - Window B's items DOM and Open Tabs DOM ALSO reach their post-demote end-state.
  - Both windows show the SAME items list (sans the demoted item) AND the SAME Open Tabs list (with the formerly-claimed tab now visible).
**Expected**: After the demote, focus Window B (just to switch active focus — do not click any sidepanel control yet). Open the SW console and confirm `chrome.storage.local.get('tj:items')` matches what Window B's DOM shows. Re-run after a short delay (~5 s); state must be stable (no late updates).

**FAIL conditions**:
- Latency > 500 ms in Window B.
- Window A and Window B show different items lists or different Open Tabs lists at any moment after the broadcast settles.
- One window's state requires a sidepanel reload to converge.

---

#### UAT-3: No flicker / smooth update on visible non-originating window — Priority: H — REQUIRES MULTI-WINDOW

**REQUIRES MANUAL EDGE EXECUTION** — same setup as UAT-1.

**Given** the same multi-window setup; Window B is positioned so its sidepanel is fully visible and watched directly during the action.
**When** I demote a live bookmark in Window A.
**Then** in Window B:
  - The demoted row disappears from its group with a single, smooth visual transition (no double-render flicker, no visible "blink").
  - The Open Tabs section grows by exactly one row (the formerly-claimed tab), inserted in the correct sorted position.
  - The Open Tabs count badge updates to reflect the new count.
  - No section flashes or briefly shows incorrect intermediate state.
**Expected**: The R3-fix places `patchOpenTabsSection` inside the `if (allApplied)` block (per R4 M-1), preventing the partial-patch abort path from double-rendering Open Tabs. UAT-3 verifies this produces a smooth visual update.

**FAIL conditions** (high — at most 1 may fail with documented justification):
- Visible flicker / double-render on Window B's Open Tabs section.
- Open Tabs count badge briefly shows an incorrect value (e.g. flashes the post-state count then the pre-state count then settles to post-state).
- Either section shows a brief intermediate state with the demoted row absent AND the formerly-claimed tab absent (the pre-fix symptom — fix should eliminate this entirely).

---

### Single-window regression (AC5) — single-context

#### UAT-4: Single-window demote regression vs S33 baseline — Priority: H

**Given** ONLY ONE Edge window with a Tab Junkie sidepanel open. A live claimed bookmark "Single-target" is visible.
**When** I demote "Single-target" via the right-click context menu (or the live X-button per the B-100 wiring).
**Then** within ~500 ms:
  - "Single-target" disappears from its group section.
  - The formerly-claimed tab appears in the Open Tabs section.
  - This matches the pre-S35 (Sprint 33 B-099) baseline exactly — no regression.
**Expected**: The B-102 fix is purely additive (one new function call inside two fast-path branches). It must not break any pre-existing single-window flow. `tests/b099-drift-fix.test.js` T8 (the SW-side automated regression test) is also re-run by the full test suite and passes.

**FAIL conditions**:
- Single-window demote no longer moves the item to Open Tabs (regression vs Sprint 33 baseline).
- Single-window demote produces visual flicker that did not exist in Sprint 33.
- Any change to the originating-window end-state shape vs the Sprint 33 baseline.

---

### Edge cases (B-102 §50.5 C-9 enumeration) — REQUIRES MANUAL EDGE EXECUTION

#### UAT-5: Demote on collapsed group section in non-originating window — Priority: M — REQUIRES MULTI-WINDOW

**REQUIRES MANUAL EDGE EXECUTION** — multi-window setup as UAT-1.

**Given** the same multi-window setup, with a live claimed bookmark "Collapsed-target" inside a group whose section is COLLAPSED in Window B (click the group header chevron in Window B to collapse it, but leave it expanded in Window A).
**When** I demote "Collapsed-target" in Window A.
**Then** within ~500 ms:
  - In Window A (group expanded): "Collapsed-target" disappears from the group; formerly-claimed tab appears in Open Tabs.
  - In Window B (group collapsed): the items inside the collapsed group are NOT visible; the Open Tabs section in Window B updates correctly to show the formerly-claimed tab.
  - When I expand the group in Window B, the demoted item is correctly absent from the (now-visible) group section.
**Expected**: Per §50.5 C-9 case (d), `patchOpenTabsSection` operates on the section regardless of expand/collapse — the row is added to the (collapsed) DOM, ready for when the user expands. The Open Tabs section in Window B is independent of the group's collapse state. Verifies the Open Tabs update converges across windows even when the group section is hidden.

**FAIL conditions** (medium — non-blocking but should be documented if observed):
- Open Tabs section in Window B does not update when the source group is collapsed.
- Expanding the group in Window B reveals the demoted item still present.
- Inconsistent end-state between windows depending on collapse state.

---

## UAT result template

Tester: ____________________  Date: ____________________  Browser: Edge ____________________  Build: feature/sprint-35-bug-fixes commit ____________________

| Case | Priority | Result | Latency observed | Notes |
|------|----------|--------|------------------|-------|
| UAT-1 (Demoted bookmark moves to Open Tabs in non-originating windows) | B | PASS / FAIL / WARN / SKIP | ms | |
| UAT-2 (Cross-window state convergence within ~500 ms) | B | PASS / FAIL / WARN / SKIP | ms | |
| UAT-3 (No flicker / smooth update) | H | PASS / FAIL / WARN / SKIP | n/a | |
| UAT-4 (Single-window regression vs S33) | H | PASS / FAIL / WARN / SKIP | ms | |
| UAT-5 (Collapsed group, multi-window) | M | PASS / FAIL / WARN / SKIP | ms | |

**Pass criteria for sprint close:**
- UAT-1 + UAT-2 (priority B): zero FAIL; both must be PASS.
- UAT-3 (priority H): PASS preferred; documented WARN acceptable.
- UAT-4 (priority H): PASS required (regression guard).
- UAT-5 (priority M): PASS preferred; FAIL routes to a follow-up backlog item.

**Definition of Done dependency**: per CLAUDE.md Gate 3 (UAT Acceptance Gate), B-102 cannot be marked done until all priority-B cases (UAT-1 + UAT-2) are PASS.
