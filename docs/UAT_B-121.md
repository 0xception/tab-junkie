# B-121 UAT — Floating Tab Opener-Chain Inheritance Render

**Sprint:** 38 (v1.32.0)
**Branch:** `feature/sprint-36-ui-polish` (continued)
**Spec:** `docs/design/60-b-121-floating-tab-render.md`
**Tier:** Spike-First (R0 + Full M) — UAT mandatory per CLAUDE.md Gate 2
**Build target:** `./build.sh` produces `tab-junkie.zip`; load unpacked from repo root in Edge developer mode
**R3 file changes:**
- `shared/messages.js` (typedef expansion: `FloatingMember` + `floatingMembers` on `MSG_LIST_ITEMS` response)
- `background/messages/storage-handlers.js` (MSG_LIST_ITEMS adds `floatingMembers`; MSG_DELETE_ITEM + MSG_BULK_DELETE_ITEMS + MSG_DELETE_GROUP all cascade-prune)
- `background/tabs/floating-members.js` (NEW — `buildFloatingMembers()` helper, dedup Set guard)
- `background/tabs/floating-groups.js` (`appendFloatingGroup` ulid + `parentItemId` rename; `reassociateFloatingGroups` no longer overwrites `claimsMirror`; `pruneFloatingGroupsByParentItemId` new export)
- `background/tabs/tab-events.js` (field name `itemId` → `parentItemId`)
- `background/tabs/open-tabs.js` (`buildOpenTabs(floatingTabIds)` exclusion)
- `background/storage/shapes.js` + `background/storage/migration.js` (schema v1→v2 lazy migration; `KNOWN_VERSION` bumped to 2)
- `sidepanel/sidepanel.js` (synthetic floating rows + `patchFloatingMembersSections` + ARIA fallback)
- `newtab/newtab.js` (synthetic floating rows + close button + ENTER/SPACE keyboard activation)
- `tests/b121-floating-group-render.test.js` (NEW — 13 cases incl. T-121-D promote-tab + T-121-F newtab DOM contract + T-121-O dedup regression guard)

**Automated test status:** 1,663/1,663 passing (13 B-121 cases).

Manual test cases against the unpacked extension loaded in **Edge** (Developer Mode → Load unpacked → repo root). Run **after** verifying the automated suite passes.

> **Edge gotcha (per user memory):** `chrome://` URLs do not work in Edge. Use `edge://extensions` and `edge://serviceworker-internals` equivalents. To force-reload the extension after changes, toggle the extension OFF then ON in `edge://extensions`.

> **SW inspection:** Open `edge://extensions` → "Tab Junkie" card → "Inspect views: service worker" to view SW console logs. The `tj:floatingGroups` storage record can be inspected via the SW devtools `chrome.storage.local.get('tj:floatingGroups')` REPL.

> **Schema migration note (per CHANGELOG / R2 §60.4.7):** The first MSG_LIST_ITEMS request after this build loads will lazy-migrate `tj:floatingGroups` from schema v1 → v2 (renames `itemId` → `parentItemId`, synthesizes `floatingTabId` ulid). If you previously had floating-group records on v1.31.0 they will be migrated transparently on first read; expect a brief one-time delay on first sidepanel render. After migration, toggle the extension OFF then ON once to flush the SW module cache (per R2 C-1).

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
4. Have the SW console open (per "SW inspection" above) so any thrown errors during render are visible.

---

## UAT-1 — Ctrl+click spawns floating row under parent group

**Priority:** H — primary acceptance test for AC1 + AC2 (sidepanel surface, Ctrl+click gesture).

**Setup:**
1. Add two saved bookmarks in the active collection, both inside the same group (e.g., **Work**):
   - **Parent A** → any URL with outbound links (e.g., `https://example.com/`).
   - (No need to seed a Bookmark B — the spawned tab should NOT match any saved bookmark; just any in-page link target.)
2. Click **Parent A** in the side panel — a tab opens, auto-claims the bookmark (live indicator on the row).
3. Confirm the side panel shows: Parent A claimed; the **Open Tabs** section is empty (or contains only unrelated tabs).

**Action:**
1. With Parent A's tab focused, find any in-page link (e.g., the IANA "More information" link on `example.com`).
2. **Ctrl+click** the link. A new tab opens in the background.
3. Switch back to the side panel.

**Expected result:**
- The spawned tab appears as a synthetic `.item-row` **directly under Parent A's row** inside the same group section.
- The synthetic row carries `data-floating="true"` (verifiable via Inspect Element if needed).
- The spawned tab does **NOT** appear in the **Open Tabs** section (AC5 exclusion).

**PASS:** Floating row visible under Parent A's group + spawned tab absent from Open Tabs section.
**FAIL:** Spawned tab appears in Open Tabs section, OR appears under a different group, OR does not appear anywhere.
**WARN:** Floating row appears but is missing the close (X) affordance — record as cosmetic; primary AC1 still PASS.

**Validates:** AC1 (synthetic row under parent group) + AC2 (Ctrl+click gesture) + AC5 (Open-Tabs exclusion).

---

## UAT-2 — Middle-click spawns floating row

**Priority:** H — covers a different opener-chain spawn path (mouse middle button vs Ctrl+click — some browsers route this through different `tabs.onCreated` flows).

**Setup:** Same as UAT-1.

**Action:**
1. With Parent A's tab focused, **middle-click** any in-page link (a link target distinct from any saved bookmark).
2. The new tab opens in the background.
3. Switch to the side panel.

**Expected result:** Identical to UAT-1.

**PASS:** Floating row visible under Parent A's group + spawned tab absent from Open Tabs.
**FAIL:** Same as UAT-1.

**Validates:** AC2 (middle-click gesture parity with Ctrl+click).

---

## UAT-3 — Shift+click new window — visible in BOTH window sidepanels

**Priority:** H — exercises cross-window opener-chain. The spawned tab has a different `windowId` than its parent; per B-013 contract the floating record should still resolve.

**Setup:** Same as UAT-1.

**Action:**
1. With Parent A's tab focused, **Shift+click** an in-page link. A new browser window opens with the spawned tab focused.
2. In the **new window**, open the side panel (toolbar icon).
3. In the **original window**, the side panel is already open from UAT-1 setup.
4. Compare both side panels.

**Expected result:**
- **Original window's side panel**: shows Parent A row + the spawned tab as a floating row under Parent A's group.
- **New window's side panel**: shows the spawned tab as a floating row under Parent A's group (cross-window consistency — the floating-group record is profile-wide, not per-window).
- In neither side panel does the spawned tab appear in Open Tabs.

**PASS:** Floating row visible under Parent A's group in **BOTH** windows' side panels.
**FAIL:** Spawned tab appears in Open Tabs in one or both windows, OR floating row missing from one window's side panel.
**WARN:** New-window side panel shows the spawned tab in Open Tabs (not under the parent group). This is a B-013 cross-window edge case unrelated to the B-121 render fix — record as WARN, not FAIL.

**Validates:** AC1 + AC2 + AC8 (cross-window opener-chain inheritance still resolves).

---

## UAT-4 — Right-click "Open in new tab"

**Priority:** M — exercises the context-menu spawn gesture. Some browsers route context-menu spawns through a separate `chrome.contextMenus` path.

**Setup:** Same as UAT-1.

**Action:**
1. With Parent A's tab focused, **right-click** an in-page link → **Open in new tab**.
2. The new tab opens in the background.
3. Switch to the side panel.

**Expected result:** Identical to UAT-1.

**PASS:** Floating row visible under Parent A's group + spawned tab absent from Open Tabs.
**FAIL:** Same as UAT-1.

**Validates:** AC2 (context-menu spawn gesture).

---

## UAT-5 — Sidepanel surface render parity

**Priority:** H — explicit confirmation that the sidepanel surface (the primary surface) renders the floating row correctly. Effectively a re-confirmation pass on UAT-1's result by inspecting attributes.

**Setup:** Continue from UAT-1 (do not close the spawned tab).

**Action:**
1. In the side panel, locate the floating row under Parent A.
2. Right-click the row → **Inspect** (or open devtools and select the element manually).
3. Verify the DOM:
   - `<div class="item-row" data-floating="true" data-tab-id="...">`
   - The row sits inside Parent A's group section (not in the Open-Tabs container).
   - The row has the live-state visual (focus/active/audible) indicator if the spawned tab is the focused tab.

**Expected result:** All three DOM checks pass.

**PASS:** All three DOM assertions hold.
**FAIL:** `data-floating="true"` missing, OR row located outside the group section, OR live-state indicator missing when the spawned tab is focused.

**Validates:** AC1 + AC4 (sidepanel surface DOM contract).

---

## UAT-6 — Newtab surface (NEW FOR B-121 FIX-ROUND)

**Priority:** H — the newtab page was previously unwired for floating groups. This case is the primary acceptance test for the **newtab parity** portion of the fix. Includes the close (X) button + keyboard-activation HIGH fixes from R4.

**Setup:**
1. Continue from UAT-1 (Parent A claimed, one floating tab spawned).
2. Open a fresh **new tab** (Ctrl+T) — the Tab Junkie newtab page loads.

**Action (a — render):**
1. On the newtab page, locate Parent A's group section.
2. Confirm the floating row appears directly under Parent A's bookmark row, inside the same group section.

**Action (b — close button):**
1. On the floating row, locate the close (X) button (right side of the row, parity with Open-Tabs row).
2. Click the X.
3. Verify the spawned tab closes (the corresponding browser tab disappears) AND the floating row disappears from the newtab page.

**Action (c — keyboard activation):**
1. Spawn a fresh floating tab (repeat UAT-1 from the newtab page if needed).
2. On the newtab page, Tab-key into the floating row until it has focus (visible focus ring).
3. Press **ENTER** — the spawned tab should activate (browser focus moves to that tab).
4. Re-spawn another floating tab and Tab-focus its row again.
5. Press **SPACE** — same expected activation behavior.

**Expected result:**
- (a) Floating row visible on the newtab page under Parent A's group.
- (b) X button visible, click closes the tab + removes the row.
- (c) ENTER and SPACE both activate (foreground) the spawned tab.

**PASS:** All three sub-actions match expected.
**FAIL:** Floating row missing from newtab, OR X button missing/non-functional, OR ENTER/SPACE do not activate the tab.
**WARN:** ENTER works but SPACE doesn't (or vice versa) — record as half-pass; route back as [frontend-engineer] LOW.

**Validates:** AC4 (newtab parity) + R4 qa H-1 fix (keyboard activation) + R4 qa H-2 fix (close button).

---

## UAT-7 — Standalone window surface

**Priority:** M — the standalone window IS `sidepanel.html` rendered in a popup window (per R0 §60.2.4). Should automatically inherit the sidepanel render path.

**Setup:** Continue from UAT-1 (Parent A claimed, one floating tab spawned).

**Action:**
1. Open the toolbar popup → click "Open in standalone window" (the existing affordance).
2. The standalone window opens, showing the same render as the sidepanel.
3. Locate Parent A's group + the floating row.

**Expected result:**
- Floating row visible under Parent A in the standalone window, identical layout to the sidepanel.
- Click the X on the floating row → spawned tab closes + row disappears.

**PASS:** Floating row visible + close affordance functional.
**FAIL:** Floating row missing, OR appears in Open Tabs section (parity broken).

**Validates:** AC4 (standalone surface — inherits sidepanel rendering automatically per R0 §60.2.4).

---

## UAT-8 — Open Tabs section exclusion (AC5)

**Priority:** H — explicit confirmation of the AC5 invariant: floating tabs MUST NOT also appear in Open Tabs.

**Setup:**
1. Continue from UAT-1 (one floating tab spawned).
2. Optionally, open one or two **unrelated** browser tabs (URLs that don't match any saved bookmark and don't have an opener-chain to a saved bookmark) so the Open Tabs section isn't empty.

**Action:**
1. In the side panel, scroll to the **Open Tabs** section (typically below all groups).
2. Inspect the list of rows.

**Expected result:**
- The floating tab from UAT-1 is **NOT** present in Open Tabs.
- Any unrelated tabs from setup step 2 ARE present in Open Tabs.
- Total Open Tabs row count = (live tab count) − (claimed tab count) − (floating tab count).

**PASS:** Floating tab absent from Open Tabs; row counts add up.
**FAIL:** Floating tab appears in BOTH the parent group AND the Open Tabs section (duplicate render; the dedup regression guard T-121-O must have failed in production).

**Validates:** AC5 (`buildOpenTabs(floatingTabIds)` exclusion).

---

## UAT-9 — Tab close removes the floating row from all surfaces

**Priority:** H — confirms the live-state event flow correctly removes the synthetic row when its underlying tab is closed.

**Setup:**
1. Continue from UAT-1 (one floating tab spawned, visible in sidepanel).
2. Open a newtab page (Ctrl+T) so both surfaces are visible.

**Action:**
1. Close the spawned floating tab (right-click → Close, OR middle-click in the tab strip, OR Ctrl+W).
2. Observe the side panel.
3. Observe the newtab page.

**Expected result:**
- Floating row **disappears from the side panel** within ~1s of the tab closing.
- Floating row **disappears from the newtab page** within ~1s.
- Parent A's row remains, still claimed and visible.

**PASS:** Floating row removed from BOTH surfaces; Parent A unchanged.
**FAIL:** Floating row persists on either surface after tab close (would indicate `MSG_LIST_ITEMS` rebroadcast or `liveState` patch did not propagate).

**Validates:** AC6 (live-state cleanup of synthetic rows).

---

## UAT-10 — Cold-start re-hydration (schema v1→v2 migration path)

**Priority:** M — confirms the lazy migration of `tj:floatingGroups` from v1 to v2 works, and that `reassociateFloatingGroups` no longer overwrites `claimsMirror` (R2 C-3 fix).

**Setup:**
1. Continue from UAT-1 (Parent A claimed, one floating tab spawned and visible as a floating row).
2. Confirm the floating row is visible in the side panel.
3. Confirm the spawned tab is still open in the browser.

**Action:**
1. Toggle the extension **OFF** in `edge://extensions` (this kills the SW; in-memory `inheritedTabs` Set is wiped).
2. Toggle the extension **ON** again. The SW cold-starts; `reassociateFloatingGroups` runs against the persisted `tj:floatingGroups` storage record.
3. Re-open the side panel.
4. Observe Parent A's group section.

**Expected result:**
- Parent A's row retains its claim (the live tab still URL-matches the bookmark; `reconcileClaims` re-establishes).
- The floating row **reappears** under Parent A's group (the persisted `tj:floatingGroups` v1 record was migrated to v2 lazily on first read; re-association resolved the spawned tab into the group).
- No errors in the SW console.

**PASS:** Parent A still claimed + floating row visible post-restart + no SW errors.
**FAIL:** Parent A's claim lost, OR floating row missing post-restart, OR migration error in SW console (e.g., `parentItemId undefined` or `KNOWN_VERSION mismatch`).
**WARN:** Floating row appears in Open Tabs instead of under the parent group AFTER cold-start. This is a known degradation if `reassociateFloatingGroups` couldn't resolve the record (e.g., parent claim dropped). Record as WARN; the recovery contract is `tj:floatingGroups`, and migration succeeded if no SW error fired.

**Validates:** AC9 (schema v1→v2 lazy migration) + R2 C-3 (cold-start safe — no claims-mirror overwrite).

---

## UAT-11 — Parent deletion cascade (AC8(ii))

**Priority:** H — when a parent bookmark is deleted, its floating-group record must be pruned. The orphaned tab should fall through to Open Tabs (lazy fallback fires).

**Setup:**
1. Continue from UAT-1 (Parent A + one floating tab spawned).
2. Confirm the floating row is visible under Parent A.

**Action:**
1. In the side panel, right-click **Parent A** → Delete (or use the inline delete affordance).
2. Confirm the destructive-action dialog.
3. Wait ~1s for the cascade to fire (`MSG_DELETE_ITEM` calls `pruneFloatingGroupsByParentItemId`).
4. Observe the side panel.

**Expected result:**
- Parent A's row disappears from its group section.
- The previously-floating tab (still open in the browser) **moves to the Open Tabs section** — the parent floating-group record was pruned; the tab no longer has a parent to attach to, so it surfaces as an unclaimed Open Tab.
- No orphaned synthetic row anywhere on the page (no row with `data-floating="true"` pointing to a deleted parent).

**PASS:** Parent A gone + orphaned tab now in Open Tabs + no orphaned synthetic rows.
**FAIL:** Synthetic floating row persists after parent deletion (would indicate cascade prune did not fire), OR the orphaned tab disappears entirely (incorrectly closed instead of demoted).

**Validates:** AC8(ii) (parent-deletion cascade) + lazy fallback for orphaned tabs.

---

## UAT-12 — Bulk delete cascade (R4 security MEDIUM M-1 fix)

**Priority:** H — confirms the `MSG_BULK_DELETE_ITEMS` handler also cascade-prunes floating-group records (R4 added this; previously only `MSG_DELETE_ITEM` cascaded).

**Setup:**
1. Add three saved bookmarks in the same group:
   - **Parent A** → URL with outbound links.
   - **Parent B** → distinct URL.
   - **Parent C** → distinct URL.
2. Click **Parent A** + Ctrl+click an in-page link to spawn a floating tab under Parent A.
3. Confirm: Parent A claimed + 1 floating row under Parent A.

**Action:**
1. In the side panel, multi-select **Parent A**, **Parent B**, **Parent C** (Ctrl+click or Shift+click — whatever the existing multi-select gesture is).
2. Press **Delete** (or use the bulk-delete affordance).
3. Confirm the destructive-action dialog.
4. Wait ~1s for the cascade.
5. Observe the side panel.

**Expected result:**
- All three rows disappear from the group section.
- The previously-floating tab (still open in the browser) **moves to Open Tabs** — `pruneFloatingGroupsByParentItemId(Parent A)` fired as part of the bulk handler.
- No orphaned synthetic rows.

**PASS:** All three deletes processed + previously-floating tab in Open Tabs + no orphaned synthetic rows.
**FAIL:** Synthetic floating row persists in any group section after bulk delete (would indicate the bulk handler did NOT call cascade-prune — the M-1 security fix regressed).

**Validates:** R4 security M-1 fix (bulk-delete cascade prune).

---

## UAT-13 — Delete-group cascade (R4 security MEDIUM M-2 fix)

**Priority:** H — confirms the `MSG_DELETE_GROUP` handler also cascade-prunes floating-group records for ALL bookmarks within the deleted group.

**Setup:**
1. Create a fresh group (e.g., **Test Group**).
2. Add two saved bookmarks inside Test Group:
   - **Parent A** → URL with outbound links.
   - **Parent B** → distinct URL.
3. Click **Parent A** + Ctrl+click an in-page link to spawn a floating tab under Parent A.
4. Confirm: Test Group contains Parent A + Parent B + 1 floating row under Parent A.

**Action:**
1. In the side panel, right-click the **Test Group** header → Delete group.
2. Confirm the destructive-action dialog.
3. Wait ~1s for the cascade and the post-delete `MSG_LIST_ITEMS` refresh.
4. Observe the side panel.

**Expected result:**
- Test Group disappears entirely (header + both child bookmarks).
- The previously-floating tab (still open in the browser) **moves to Open Tabs**.
- No orphaned synthetic rows anywhere.
- After the next `MSG_LIST_ITEMS` refresh, no `tj:floatingGroups` record exists for the deleted group (verify via SW devtools `chrome.storage.local.get('tj:floatingGroups')` if desired).

**PASS:** Group + children deleted + orphaned tab in Open Tabs + no orphaned synthetic rows after refresh.
**FAIL:** Synthetic floating row persists after group deletion (would indicate `MSG_DELETE_GROUP` did NOT cascade-prune — the M-2 security fix regressed).

**Validates:** R4 security M-2 fix (group-delete cascade prune).

---

## UAT-14 — Selection ARIA fallback (R4 qa HIGH H-1 fix)

**Priority:** M — confirms the ARIA label fallback for floating rows on selection state change. R4 qa flagged that floating rows did not announce their `(selected)` state to screen readers.

**Setup:**
1. Continue from UAT-1 (one floating row visible under Parent A).
2. Enable a screen reader:
   - **macOS**: VoiceOver (Cmd+F5).
   - **Windows**: NVDA or Narrator (Ctrl+Win+Enter).
3. (If no screen reader is available, you can validate by inspecting the row's `aria-label` attribute in devtools after each action.)

**Action:**
1. Tab-key into the floating row until it has focus.
2. Press the selection key (typically Space, OR whatever the existing selection gesture is on Open-Tabs rows — check by selecting an Open-Tabs row first to confirm the gesture).
3. Listen for the screen reader announcement (or inspect the `aria-label` attribute).
4. Press the selection key again to deselect.
5. Listen / inspect again.

**Expected result:**
- After step 2 (selected): the announced label includes the word **"selected"** (e.g., `"<tab title> (selected)"` or similar — exact wording per the existing Open-Tabs row pattern).
- After step 4 (deselected): the announced label does NOT include "selected".
- The fallback ARIA label is present even on the floating row (R4 qa H-1 explicitly added this — pre-fix the floating row had no `(selected)` state announcement).

**PASS:** Screen reader announces "selected" / "not selected" transitions on the floating row.
**FAIL:** Floating row's ARIA label has no "selected" state, OR remains stuck on one announcement regardless of state change.
**WARN:** Screen reader announces the title but the "(selected)" suffix is missing — degraded but accessible. Record as WARN; route back as [frontend-engineer] LOW.
**SKIP:** No screen reader available — record as SKIP and rely on the automated test for primary coverage.

**Validates:** R4 qa H-1 fix (ARIA label fallback for floating rows).

---

## UAT-15 — B-125 + B-121 interaction (cross-anchor regression guard)

**Priority:** H — both B-125 and B-121 ship in this sprint; their fixes touch overlapping code paths (`tab-events.js` opener-chain handling). This case verifies BOTH fixes hold simultaneously.

**Setup:**
1. Add two saved bookmarks in the same group:
   - **Bookmark X** → `https://example.com/`.
   - **Bookmark Y** → a URL that an in-page link from `example.com` will navigate to (or pick a saved bookmark whose URL matches a known link target on Bookmark X's page).
2. Click **Bookmark X** to open and auto-claim it. Confirm: Bookmark X live; Bookmark Y unclaimed.

**Action:**
1. With Bookmark X's tab focused, **Ctrl+click** an in-page link whose href matches **Bookmark Y**'s URL.
2. The new tab opens in the background.
3. Switch to the side panel.

**Expected result:**
- (a) **B-125 invariant holds**: Bookmark Y is **NOT** auto-claimed by the spawned tab — the `inheritedTabs` Set gates the auto-claim path.
- (b) **B-121 invariant holds**: the spawned tab appears as a floating row **under Bookmark X's group** (its parent in the opener chain).
- (c) Bookmark X's claim is unchanged.
- (d) The spawned tab is **NOT** in the Open Tabs section.

**PASS:** All four invariants hold.
**FAIL on (a):** Bookmark Y auto-claims — B-125 fix regressed.
**FAIL on (b):** Spawned tab appears in Open Tabs instead of under Bookmark X — B-121 fix regressed.
**FAIL on both:** The fixes cancel each other out (escalate immediately to [frontend-engineer] + [solution-architect]).

**Validates:** B-125 AC1 + B-121 AC1 + AC5 — both fixes hold together. Regression guard for the shared `tab-events.js` invariant at `tab-events.js:176` confirmed intact in R4.

---

## Reporting

After running UAT, record results in `docs/SPRINT.md` "Completed This Sprint" → B-121 entry, in this format:

```
- UAT-1: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-2: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-3: PASS / FAIL / WARN / SKIP — <one-line note: were both window sidepanels checked?>
- UAT-4: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-5: PASS / FAIL / WARN / SKIP — <one-line note: did data-floating="true" attribute appear?>
- UAT-6: PASS / FAIL / WARN / SKIP — <one-line note: render + X + ENTER/SPACE all checked?>
- UAT-7: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-8: PASS / FAIL / WARN / SKIP — <one-line note: did row counts add up?>
- UAT-9: PASS / FAIL / WARN / SKIP — <one-line note: cleanup time on each surface>
- UAT-10: PASS / FAIL / WARN / SKIP — <one-line note: any SW console errors during migration?>
- UAT-11: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-12: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-13: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-14: PASS / FAIL / WARN / SKIP — <one-line note: was a screen reader available?>
- UAT-15: PASS / FAIL / WARN / SKIP — <one-line note: which invariant tested? a/b/c/d>
```

**Routing rules:**
- FAIL on UAT-1, UAT-2, UAT-4, UAT-5, UAT-6, UAT-8, or UAT-9 → route back to [frontend-engineer] immediately. These are core acceptance gates.
- FAIL on UAT-3 (cross-window) → route back to [frontend-engineer]; B-013 cross-window contract is part of B-121's scope.
- FAIL on UAT-6 specifically (newtab) → route back to [frontend-engineer]; this is the NEW surface added by the fix-round and is the highest-risk parity case.
- FAIL on UAT-7 (standalone) → route back to [frontend-engineer]; standalone parity should be free per R0 §60.2.4.
- FAIL on UAT-10 → route back to [solution-architect] for cold-start / migration design re-review.
- FAIL on UAT-11, UAT-12, or UAT-13 → route back to [frontend-engineer]; cascade-prune logic regressed.
- FAIL on UAT-14 → route back to [frontend-engineer] as a qa H-1 regression.
- FAIL on UAT-15 → escalate to BOTH [frontend-engineer] and [solution-architect] — anchor cross-interaction broke.
- WARN on UAT-3 (new-window side panel shows in Open Tabs) → record as B-013 cross-window edge case; not a B-121 render-fix regression.
- WARN on UAT-1 / UAT-6 (cosmetic close-button missing) → record; route back as [frontend-engineer] LOW.
- WARN on UAT-10 (post-restart row appears in Open Tabs not under parent) → acceptable degradation per R2 C-3; the recovery contract is `tj:floatingGroups` re-association, not perfect parent retention.
- WARN on UAT-14 (ARIA label missing the "(selected)" suffix) → record; route back as [frontend-engineer] LOW.
- SKIP on UAT-14 (no screen reader) → acceptable; rely on automated tests for primary coverage.

**Gate 3 (UAT Acceptance):** All 15 cases must reach PASS or acceptable WARN/SKIP for B-121 to pass Gate 3 and be marked done.
