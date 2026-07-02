# Sprint 48 — R1 Definition (B-194 Render Bundle, Sprint A)

**Author:** [product-manager]  
**Date:** 2026-07-01  
**Sprint:** 48 — Unified Item Model render bundle  
**Pipeline:** B-186 (prereq) → B-195 (safety net) → B-196 (render merge) → B-197 (=B-185)  
**Design source:** `docs/design/78-unified-item-model-r0-spike.md`

---

## Summary Table

| Item | One-liner | Effort | Tier | Destructive-action status | Hard Deps |
|---|---|:---:|---|---|---|
| **B-186** | Renumber surviving same-window `LiveTabIndex.index` entries on single-tab close so the loose tail orders correctly. | S | Fast Track | N/A | none |
| **B-195** | Safety-net integration test: seed 6 fixture states, assert head+tail ordering contract + floating resolution baseline against CURRENT code. | M | Full (test-only) | N/A | none (runs first) |
| **B-196** | Merge `__ungrouped__` synthetic section + `buildOpenTabsSection` into ONE top-level catch-all region (renderOrder head + live-ordered tail), sidepanel + newtab. | L | Full | N/A | B-195, B-186 (both in-sprint) |
| **B-197** | Enable top-level/ungrouped floating anchoring: anchor = `parentItemId`; `buildFloatingMembers` stops skipping ungrouped parents; `resolveFloatingOpener`/`walkOpenerChain` drop groupId requirement; `moveFloatingTab` gains ATTACH-to-top-level. Absorbs B-185. | M/L | Full | N/A | B-196 (in-sprint) |

---

## B-186 — Renumber `LiveTabIndex.index` survivors on single-tab close

### User Story

As a user of the Open Tabs section, I want the tab rows to stay in their correct positions after I close any tab, so that the remaining open-tab rows do not jump to wrong positions on the next live-state refresh.

### Acceptance Criteria

**AC1 — Root cause addressed.** When a single tab closes, `LiveTabIndex` entries belonging to the SAME window that had an `index` value GREATER than the closed tab's `index` are decremented by 1. This keeps the in-memory `index` values consistent with the post-close browser state without an additional `chrome.tabs.query` round-trip. (`removeTabEntry`, `background/tabs/live-tab-index.js:74` — currently just calls `liveTabIndex.delete(tabId)` with no survivor renumber. The fix adds renumbering either here or at the `chrome.tabs.onRemoved` handler, `background/tabs/tab-events.js:343`. R2 chooses the minimal-touch insertion point.)

**AC2 — Scope limited to same-window survivors.** Only entries in `liveTabIndex` whose `windowId` matches the closed tab's `windowId` AND whose `index` exceeds the closed tab's `index` are decremented. Entries in other windows are unaffected.

**AC3 — Window-close path is unaffected.** When an entire window closes, `removeTabsByWindow` (`live-tab-index.js:92`) already bulk-removes all window entries. The B-186 fix must not alter this bulk-remove path (no double-decrement or error if the entry is gone).

**AC4 — Cold-start path is unaffected.** `buildLiveTabIndex` (`live-tab-index.js:23`) rebuilds from `chrome.tabs.query` and sets `index` from the Chrome response directly. No interaction with the fix.

**AC5 — `buildOpenTabs` sort is correct post-close.** After a tab at index k closes in a window with N tabs, `buildOpenTabs` returns the surviving loose tabs in `(windowId asc, tabIndex asc)` order where the survivors' indices are 0…k-1, k…N-2 (i.e., no gap at k).

**AC6 — No change to the `buildOpenTabs` exclusion logic, the `openTabs` message shape, or any render path.** Only the `LiveTabIndex.index` values change; downstream consumers are unaffected.

**AC7 — Regression test (written as part of this item per Fast-Track rules).** A test is added that seeds 4 tabs in a window at indices 0-3, closes the tab at index 1, and asserts: (a) the closed tab's entry is gone; (b) tabs at original indices 2 and 3 now carry `index` 1 and 2 respectively; (c) the tab at original index 0 is unchanged at `index` 0. All via `chrome-mock.js` (no ad-hoc stubs). Full existing test suite must pass with zero regressions.

### Destructive-action confirmation (DoR item 7)

**N/A** — This is a bugfix to an in-memory index. No storage writes, no user-visible data mutations, no deletions. No confirmation dialog is involved or required.

### Performance acceptance criteria

**Cheap path.** The renumber is an O(N\_window\_tabs) scan over the in-memory Map at close time. N is bounded in practice (≤ 50 tabs per window typical). No performance acceptance criterion beyond: the fix must not regress the existing tab-close latency budget (sub-millisecond; the Map scan is synchronous and trivially fast).

---

## B-195 — Safety-net integration test for the unified top-level region

### User Story

As an engineering team, I want a safety-net integration test suite that asserts the unified top-level region's ordering contract and floating-resolution baseline against the CURRENT codebase, so the B-196 render merge is guarded by a passing green net before it lands.

### Acceptance Criteria

**AC1 — Test file.** A new test file `tests/b195-unified-toplevel-net.test.js` exists and passes against the CURRENT (pre-B-196/B-197) codebase on the first run.

**AC2 — Six fixture states seeded.** The test suite seeds ALL of the following fixture states per B-195's scope as the A0 safety net:

| # | Fixture state | Persisted? | Seeded via |
|---|---|---|---|
| F1 | Saved ungrouped item — dormant (no live tab) | `tj:items` row, `groupId: null` | `chrome-mock.js` storage + `__resetLiveTabIndex` |
| F2 | Saved ungrouped item — claimed/live (tab in LiveTabIndex) | `tj:items` row, `groupId: null` + `claimsMirror` entry | `chrome-mock.js` |
| F3 | Floating-under-ungrouped record — `tj:floatingGroups` with `parentItemId` pointing at F1/F2 item, parent has `groupId: null` | `tj:floatingGroups` record | `chrome-mock.js` |
| F4 | Loose open tab — in `LiveTabIndex`, not claimed, not floating | in-memory only | `updateTabEntry` |
| F5 | Claimed bookmark in a named group (control) | `tj:items`, `groupId: 'g1'`, `claimsMirror` entry | `chrome-mock.js` |
| F6 | Dormant bookmark in a named group (control) | `tj:items`, `groupId: 'g1'`, no claim | `chrome-mock.js` |

**AC3 — T1: `buildOpenTabs` exclusion.** `buildOpenTabs(floatingTabIds)` returns only F4's tab (the loose tab). F2's tab (claimed) is excluded. If F3's floating record resolves to a tab, that tab is excluded via `floatingTabIds`. Result length = 1 when only F4 qualifies.

**AC4 — T2: `buildOpenTabs` sort.** When multiple loose tabs exist in the same window, `buildOpenTabs` returns them sorted by `(windowId asc, tabIndex asc)`. Seed two loose tabs at `windowId: 1, index: 3` and `windowId: 1, index: 1`; assert result[0].tabIndex = 1, result[1].tabIndex = 3.

**AC5 — T3: `buildFloatingMembers` ungrouped-parent baseline.** Today's code at `floating-members.js:94` skips any floating record whose resolved parent has `groupId === null`. Assert: `buildFloatingMembers(items)` returns a map that does NOT contain an entry keyed by `null` or the F1/F2 parent's `groupId` (because neither has one). The returned map is empty or contains only entries for named-group parents. This is the **B-197-EXTEND baseline** — mark the assertion comment `// B-197-EXTEND: after B-197, this asserts a non-null sentinel key instead`.

**AC6 — T4: loose tab not claimed as floating.** After `buildFloatingMembers` resolves, the set of tabIds it claimed as floating (passed to `buildOpenTabs`) does NOT include F4's tabId. F4 remains a loose tab.

**AC7 — T5: `resolveFloatingOpener` ungrouped baseline.** `resolveFloatingOpener(F3_tabId, floatingRecords)` returns `null` when the matched floating record's parent has `groupId === null` (`opener-chain.js:111` — the current "matched but unusable" early return). This is the **B-197-EXTEND baseline** — mark `// B-197-EXTEND: after B-197, assert returns {groupId:null, itemId:...}`.

**AC8 — T6: `walkOpenerChain` ungrouped baseline.** `walkOpenerChain(newTabId, claimsMirror, items)` returns `null` when the only claimed item in the opener chain is F2 (ungrouped, `groupId: null`), because `item.groupId !== null` check at `opener-chain.js:68` skips it. This is the **B-197-EXTEND baseline** — mark `// B-197-EXTEND: after B-197, assert returns {groupId:null, itemId:...}`.

**AC9 — T7: renderOrder head ordering.** Given two saved-ungrouped items (F1-equivalent) with `sortOrder: 20` and `sortOrder: 10`, confirm that `buildOpenTabs` and the item list ordering (sortOrder ascending) produces: sortOrder:10 item first, sortOrder:20 item second. (Asserts the ordering contract B-196 must preserve for the head.)

**AC10 — T8: B-186 fix integration (gated on B-186).** After B-186 lands: seed 3 tabs in window 1 at indices 0, 1, 2. Close index 1 (call `removeTabEntry` for that tabId, with the B-186 renumber applied). Assert `buildOpenTabs` returns 2 tabs with `tabIndex` values 0 and 1 (no gap). This test is marked `// B-186-GATE: must run AFTER B-186; skip or xfail before`.

**AC11 — Determinism and chrome-mock discipline.** Every test calls `__resetLiveTabIndex()` and resets chrome-mock storage in its setup. No ad-hoc chrome API stubs — all chrome API interactions go through `tests/chrome-mock.js`. Tests are synchronous or use the mock-async pattern.

**AC12 — Pre-merge green baseline.** The B-196 render-merge PR must not break any B-195 test (the B-197-EXTEND tests are not broken by B-196 alone — they remain baseline behavior until B-197 lands). The B-197 PR must update the B-197-EXTEND assertions to assert the NEW behavior.

**AC13 — Full existing test suite.** After writing B-195 tests, run the full suite; assert zero regressions. Report suite count (currently 2158 PASS).

### Fixture state enumeration (B-195 explicit per CLAUDE.md)

| Fixture | Saved? | Live? | Anchored? | `groupId` | Today's classification |
|---|:---:|:---:|:---:|---|---|
| F1 — dormant ungrouped saved | Y | N | N | null | `__ungrouped__` dormant |
| F2 — live ungrouped saved | Y | Y | N | null | `__ungrouped__` claimed |
| F3 — floating-under-ungrouped | N | Y | Y (parentItemId→F1/F2) | null on parent | BLOCKED today (`floating-members.js:94`) |
| F4 — loose open tab | N | Y | N | — | Open Tabs section |
| F5 — named-group claimed | Y | Y | Y | 'g1' | claimed in group — control |
| F6 — named-group dormant | Y | N | Y | 'g1' | dormant in group — control |

### Key assertions (exact contract)

- **Head order:** items with lower `sortOrder` render before items with higher `sortOrder` in the ungrouped head (mirrors current `buildGroupSection` ordering).
- **Tail order:** `buildOpenTabs` result is `(windowId asc, tabIndex asc)` sorted.
- **Floating resolution single-sourced:** a tab that appears in `buildFloatingMembers` output is excluded from `buildOpenTabs` output (mutual exclusion via the `floatingTabIds` set).
- **B-197-EXTEND markers:** T5, T6, T7 assertions are the TODAY baseline for ungrouped-parent behavior; they will invert when B-197 lands.

### Destructive-action confirmation (DoR item 7)

**N/A** — test-only item, no production code changes, no storage writes, no user-facing behavior change.

### Performance acceptance criteria

Test suite must run to completion within the existing harness timing budget (no sleep/polling; all sync or mock-async). No separate perf criterion.

---

## B-196 — Render merge — single top-level catch-all (sidepanel + newtab)

### User Story

As a user, I want my ungrouped bookmarks and open tabs in ONE top-level section instead of two, so the top level is a single catch-all where saved/live status is shown as visual state rather than as separate sections.

### Acceptance Criteria

**Structural — what is removed / what replaces it:**

**AC1 — `__ungrouped__` section removed from `renderAll`.** The synthetic-group branch at `sidepanel.js:2285-2307` (creates `syntheticGroup { id: '__ungrouped__' }`, calls `buildGroupSection`) is removed. `byGroup.get(null)` items are no longer routed through `buildGroupSection`.

**AC2 — `buildOpenTabsSection` append removed from `renderAll`.** The call at `sidepanel.js:2310` (`fragment.appendChild(buildOpenTabsSection(_cachedOpenTabs))`) is removed.

**AC3 — `buildTopLevelSection(headItems, looseTail)` introduced.** A new function is added and called ONCE from `renderAll` in place of AC1+AC2. It produces ONE `<section role="region">` element with a single header (name TBD at R2 — e.g., "Top Level" or no label per R2's visual-variant decision). This single element replaces both the former `__ungrouped__` DOM subtree and the former `open-tabs-wrapper` / `#open-tabs-section` DOM subtree.

**AC4 — Newtab parity.** The same structural change applies to `newtab/newtab.js` (`_renderGrid` / `_refetchAndPatchLiveState`). The newtab top-level region has the same content, ordering, and empty-state behavior as the sidepanel. R3 MUST perform an explicit cross-surface diff before claiming complete.

**Content and ordering:**

**AC5 — Head content and order.** The new region's head contains all saved items with `groupId === null` (today's `__ungrouped__` content), ordered by their `sortOrder` / `renderOrder` — the same ordering `buildGroupSection` applied for `__ungrouped__`. NO floating members appear in the head at this stage (B-197 adds them). This is today's correct behavior preserved.

**AC6 — Tail content and order.** The new region's tail contains all loose open tabs (`buildOpenTabs` result), ordered by `(windowId asc, tabIndex asc)`, exactly as `buildOpenTabsSection` produced today.

**AC7 — Content parity (no item lost, no item gained).** Every item that appeared in the old `__ungrouped__` section or the old Open Tabs section appears in the new region. No item that was in a named-group section appears in the new region. B-195 T3/T4 assertions enforce this.

**AC8 — No behavior change on which items appear.** The qualifications for "ungrouped saved item" (`groupId === null`) and "loose open tab" (in LiveTabIndex, not claimed, not floating) are unchanged.

**Visual variant and region placement (R2 must decide before R3):**

**AC9 — R2 selects and locks visual variant.** R2 chooses: Variant A (fully merged, no divider) OR Variant B (subtle CSS-only hairline between head and tail — R0 recommendation, `§78.5.3`). R3 implements the chosen variant; no deviation is permitted without [scrum-master] scope-change routing.

**AC10 — R2 selects and locks region placement.** R2 chooses: the top-level region placed ABOVE named groups (top of panel) OR BELOW them (where Open Tabs sits today). R3 implements the chosen placement.

**AC11 — Visual state preserved.** Saved-item rows in the head retain their existing live/dormant visual state (claimed = live dot indicator; dormant = no live indicator), driven by `liveStates` exactly as today. Loose-tab rows in the tail retain `data-live-only="true"` (or its renamed equivalent — R2 decides; R3 must not silently drop the attribute). Audible/active indicators (`data-active`, `data-audible`) are preserved on all row types.

**AC12 — Group color indicator absent.** The new top-level region's header has no group-color tint (it has no group record). The existing guard at `sidepanel.js:2293-2299` that prevented tint injection for `__ungrouped__` is replicated for the new region.

**AC13 — Group-level drag-reorder not applicable to the top-level region.** The new region's header does not participate in the group-drag reorder path.

**Empty states (§78.5.4, mandatory C-9 enumeration):**

**AC14 — Zero-items (no saved, no floating, no loose).** The top-level region is hidden; the global empty-state (`emptyStateEl`) shows. Mirrors current `renderAll` empty guard at `sidepanel.js:2226-2234` — the condition extends to cover "no items AND no groups AND no open tabs AND no floating members."

**AC15 — Head-empty / tail-present.** No saved items with `groupId === null` exist, but loose tabs do. Only the tail is rendered; no head content, no divider (if Variant B).

**AC16 — Head-present / tail-empty.** Saved ungrouped items exist but no loose tabs. Only the head is rendered. The tail's empty-state message ("No untracked tabs — all open tabs are saved or grouped", currently at `sidepanel.js:3505`) is either suppressed or shown inline as a non-list placeholder — R2 decides which.

**AC17 — Zero-groups.** All content is at top level (no named groups exist). The top-level region is the entire panel. No structural error or visual gap.

**Incremental patch paths:**

**AC18 — Tail patcher scoped to tail sub-list.** The open-tabs tail incremental patcher (`patchOpenTabsSection`-equivalent logic, now scoped to the tail `<ul>` within the new region) remains order-faithful (inserts/removes individual rows to match `buildOpenTabs` output order) and requires no full panel re-render on a single open-tab update.

**AC19 — DOM readiness check updated.** The panel-DOM readiness fallback at `sidepanel.js:3724` (`!document.getElementById(OPEN_TABS_SECTION_ID)`) is updated to test for the new region's id. The fallback-to-`renderAll` behavior is preserved.

**Reject-guards (drag):**

**AC20 — Group-drag reject-guard updated.** The `_computeGroupPromoteTarget` reject-guard at `sidepanel.js:5930-5932` (currently checks `.open-tabs-section` via `closest`) is updated to reject the new top-level region's container class/id. The guard must prevent group-drag from targeting the top-level region, preserving the same protection today's guard provides.

**No schema bump:**

**AC21 — No `KNOWN_VERSION` bump.** B-196 is a render-layer change only. No `tj:items`, `tj:floatingGroups`, or `PARTITION_META` shape changes. Schema stays v9.

### Destructive-action confirmation (DoR item 7)

**N/A** — B-196 is a UI restructuring that changes where DOM is rendered, not which items exist. No destructive writes to saved items, no deletions, no storage mutations. The user's bookmarks and open-tab state are unaffected.

### Performance acceptance criteria

- **Sidepanel first paint < 200 ms** after open on a 500-item collection (§77 Tier-A AC, preserved; the merged region is one `buildTopLevelSection` call, not two, so this should be unchanged or slightly faster).
- **No full re-render on single-item updates.** The tail patcher (AC18) targets only the tail sub-list. A saved-item update in the head does not re-render the tail, and vice versa.
- **§77 Tier-A render paths not regressed.** The B-188 renderOrder-slot insert for floating rows (`shared/render-order.js:108-118`) and the `(windowId, tabIndex)` order for open-tab rows must produce the same results after B-196 as before.

### Selector audit (REHOME item — mandatory)

B-196 removes or renames the DOM structures that the following test files reference. R3 must update every file listed here BEFORE marking B-196 complete. This is R3's checklist.

**Elements being removed / restructured:**

- `buildOpenTabsSection` function in `sidepanel.js` (creates `section#open-tabs-section`, `.open-tabs-wrapper`, `.open-tabs-section`, `.open-tabs-header`, `#open-tabs-count`, `#open-tabs-list` / `.open-tabs-list`, `#open-tabs-empty` / `.open-tabs-empty`)
- `OPEN_TABS_SECTION_ID = 'open-tabs-section'`, `OPEN_TABS_COUNT_ID = 'open-tabs-count'`, `OPEN_TABS_LIST_ID = 'open-tabs-list'`, `OPEN_TABS_EMPTY_ID = 'open-tabs-empty'` constants (`sidepanel.js:2862-2865`)
- Synthetic `__ungrouped__` group block in `renderAll` (`sidepanel.js:2285-2307`): id string `'__ungrouped__'`, `byGroup.set('__ungrouped__', ...)`
- `syntheticGroup.id: '__ungrouped__'` passed to `buildGroupSection`

**Affected test files — R3 update checklist:**

1. `tests/b102-cross-window-demote.test.js` (lines 256-257, 314-343) — asserts `.open-tabs-list` and `#open-tabs-count` by name; constructs mock DOM with `id='open-tabs-section'`, `className='open-tabs-list'`, `id='open-tabs-count'`. → Update to new top-level region's list element and count badge id/class once R2 names them.

2. `tests/b122-drag-to-root.test.js` (lines 287, 295, 303, 311) — asserts `_computeGroupPromoteTarget` source contains `.closest?.('.open-tabs-section')` and the return-null guard. → Update regex patterns to match the new reject-guard class/id after R2 names the new region.

3. `tests/b025-multi-item-drag.test.js` (lines 481, 506, 516, 564, 701, 721, 725) — multiple source-code and behavior assertions that `.open-tabs-section` reject-guard fires in `_computeGroupPromoteTarget`. → Same update as b122.

4. `tests/b133-open-tabs-dotted.test.js` (lines 46, 51-52, 84-90) — asserts `[data-live-only="true"]` CSS rule exists in `sidepanel.css` and is absent from `newtab.css` / `popup.css`. → If B-196 retains `data-live-only` on loose-tail rows (recommended), assertions remain valid and need no change. If the discriminator attribute is renamed, update to the new attribute name. R3 must confirm at cross-surface diff step.

5. `tests/b187-render-order-parity.test.js` (lines 349, 381) — line 349 references `buildOpenTabsSection` in a comment (non-asserting); line 381 asserts `src.indexOf('function buildOpenTabsSection') >= 0`. → After B-196, `buildOpenTabsSection` is removed. Line 381 assertion will fail. Update to `src.indexOf('function buildTopLevelSection')` (or whatever the replacement is named by R2/R3).

6. `tests/b036-newtab.test.js` (lines 767-781) — asserts ungrouped items render under an implicit "Ungrouped" section (`sections.length === 1`). → After B-196, the newtab `__ungrouped__` section is replaced by the new top-level region. Update section selector and assertion to the new structure.

7. `tests/b027-group-header-menu.test.js` (lines 28, 145, 327, 415-419, 430-434) — asserts `__ungrouped__` header bails early from the group menu handler (`early-return:ungrouped`); asserts `open-tabs-header` class exclusion from the menu. → After B-196, `__ungrouped__` id is retired; the bail-early guard targets the new top-level region header id/class. `open-tabs-header` class may be renamed. Update both guards to whatever R3 names the new header.

8. `tests/b023-group-jump-popup.test.js` (line 644) — passes `sourceGroupId: '__ungrouped__'` as a test fixture. → After B-196, if `__ungrouped__` is no longer used as a section/group id in the group-jump popup, update to the new top-level region sentinel or confirm the field is N/A for the new region.

9. `tests/b029-group-picker.test.js` (lines 534, 632-633) — line 534 asserts `ids.includes(null)` (Ungrouped always present when `sourceGroupId !== '__ungrouped__'`); lines 632-633 call `buildGroupPickerRows(ctx, '__ungrouped__')` as the exclusion key. → After B-196, the group picker's exclusion criterion for the top-level context changes; update the exclusion key to the new sentinel.

10. `tests/b031-group-drag.test.js` (lines 192-202) — asserts `bulkReorderGroups` rejects `parentId: '__ungrouped__'`. → After B-196, `__ungrouped__` id is retired; update the test to use the new top-level region's id (or confirm the rejection path changes to a different guard).

11. `tests/b014-multi-window.test.js` (lines 441, 450, 459, 496, 506) — queries `[data-tab-id]` and `[data-live-only="true"][data-tab-id]` to locate open-tab rows. → These query ROW ATTRIBUTES, not the container id. If B-196 retains `data-live-only` and `data-tab-id` on loose-tail rows (recommended, to preserve B-133 visual treatment), no change needed. Verify at R3 cross-surface diff.

12. `tests/b024-multi-select.test.js` (lines 167, 168, 174-175, 312, 320, 1437) — uses `[data-tab-id]` and `[data-live-only]` in selection-manager query logic. → Same as b014 — row attributes are likely preserved; verify at R3.

**No existing test files reference:** `[data-live-only]` in the newtab context (correctly excluded by B-133 as a sidepanel-only discriminator). The `buildOpenTabs` function itself (`open-tabs.js`) is unchanged by B-196 and its test coverage (`enriched-list-items.test.js`) needs no update.

**Selector audit count: 12 test files affected.** (Files like `tests/enriched-list-items.test.js`, `tests/b134-tab-drag-reorder.test.js`, `tests/b184-floating-opener-inherit.test.js` reference `buildOpenTabs` or `openTabs` DATA but not the DOM selectors being removed — they do not appear in this checklist.)

---

## B-197 — Top-level/ungrouped floating anchoring (absorbs B-185)

### User Story

As a user who opens a link from — or drags a tab under — a top-level (ungrouped) bookmark, I want the new tab to float directly under that bookmark; anchoring is by `parentItemId`, not group membership, so opener-chain inheritance and floating anchoring work for ungrouped bookmarks.

### Acceptance Criteria

**`buildFloatingMembers` — stop skipping ungrouped parents (`floating-members.js:94`):**

**AC1 — Guard removed.** The line `if (typeof parent.groupId !== 'string' || parent.groupId.length === 0) continue;` at `floating-members.js:94` is removed (or replaced by logic that handles ungrouped parents). A floating record whose resolved parent has `groupId === null` now produces a descriptor in the output map.

**AC2 — Top-level sentinel output key.** The output map entry for ungrouped-parent floating members is keyed by a sentinel string determined at R2 (e.g., `'__toplevel__'`). The sentinel: (a) does NOT collide with any real `groupId` value (which are ULIDs); (b) is forward-compatible with the B-191 renderOrder-sole-authority design; (c) is documented in the R2 chapter with the explicit forward-compat note (AC17 below).

**AC3 — `parentItemId` correctly propagated.** The `FloatingMember` descriptor for an ungrouped parent carries `parentItemId` = the parent item's `id`, exactly as for grouped parents (`floating-members.js:123`).

**AC4 — Dedup gate preserved.** The `matchedTabIds` dedup gate (`floating-members.js:84`) still applies to ungrouped-parent floating members — a tab resolved as a floating member cannot also appear as a loose tab in `buildOpenTabs`. The `floatingTabIds` set passed to `buildOpenTabs` includes ungrouped-parent resolved tabs.

**`floatingMembers` message payload key:**

**AC5 — `MSG_LIST_ITEMS` `floatingMembers` payload extended.** `floatingMembers` in the `ListItemsResponse` (`shared/messages.js:388-391`) is today keyed by `parent.groupId`. It gains a sentinel key for the top-level region (same sentinel as AC2) so the sidepanel can extract ungrouped-parent floating members from the response. The change is additive — pre-B-197 callers that treat unknown keys as `{}` are unaffected (`shared/messages.js:394`). R2 must include this as a contract-change entry in its fix-scope test-assertion enumeration.

**`resolveFloatingOpener` — drop the non-empty-`groupId` requirement (`opener-chain.js:107-111`):**

**AC6 — `resolveFloatingOpener` updated.** The guard at `opener-chain.js:107` (`if (typeof r.groupId === 'string' && r.groupId.length > 0 && typeof parentItemId === 'string' && parentItemId.length > 0)`) is updated: when the matched floating record's parent has `groupId === null` (and `parentItemId` is valid), the function returns `{ groupId: null, itemId: parentItemId }` instead of falling through to `return null` at line 111. The R1 LOCKED comment "floating-under-ungrouped support is B-184 Part 2" at `opener-chain.js:93` is removed/replaced.

**AC7 — Caller handles `{ groupId: null, itemId }` result.** The call site that handles `resolveFloatingOpener`'s result (in `tab-events.js` or equivalent) is updated to: when `groupId === null`, anchor the new tab under the top-level parent item (not create a named-group floating member). The floating record created carries `parentItemId = itemId`, `groupId = null` (or absent), and a valid top-level renderOrder position.

**`walkOpenerChain` — drop the `groupId !== null` requirement (`opener-chain.js:68`):**

**AC8 — `walkOpenerChain` updated.** The guard at `opener-chain.js:68` (`if (item && item.groupId !== null)`) is updated: when the found item has `groupId === null`, the function returns `{ groupId: null, itemId: item.id }` rather than continuing to the next chain hop and returning null. R2 specifies the exact return shape (consistent with AC6 shape).

**AC9 — Caller handles `{ groupId: null, itemId }` from `walkOpenerChain`.** Same as AC7 — a null `groupId` result from either resolver causes the new tab to float under the top-level parent item.

**`moveFloatingTab` ATTACH to top-level (`floating-groups-mutations.js:409-416`):**

**AC10 — ATTACH rejection guard updated.** The block at `floating-groups-mutations.js:409-416` (currently: if `targetGroupId !== null`, look up saved items in that group; if `candidates.length === 0`, return false) is extended: when the drag target is a top-level parent item (no `targetGroupId`, only a `targetParentItemId`), the guard allows attachment. The ATTACH does not require `candidates.length > 0` (there is no group to look up saved items from). The top-level parent item's `id` becomes `newParentItemId` directly.

**AC11 — Top-level ATTACH creates a valid `tj:floatingGroups` record.** The record written carries `parentItemId = <target parent item id>`, `groupId = null` (or absent, per R2's schema decision), `floatingTabId` (ULID), and a valid renderOrder position within the top-level head (AC13 below). The record validates against the current (v9) `tj:floatingGroups` validator (`shapes.js:349-396`) which already tolerates optional fields.

**Null-group renderOrder owner (Q3 — R2 MUST resolve before R3 begins):**

**AC12 — R2 documents the null-group renderOrder owner.** R2 Chapter (R2 is the R2 round for this item, not the R0 spike) determines the top-level head's `renderOrder` owner: a sentinel `__toplevel__` group record, per-item `sortOrder`-only (no group-level `renderOrder`), or an extension of the Group shape to a null-id record. The chosen representation is locked by R2. R3 MUST NOT deviate from it.

**AC13 — Newly attached floating members receive a valid renderOrder position.** When a floating member is attached under a top-level parent item (AC10-AC11) or created via opener-chain (AC7/AC9), it receives a `renderOrder` value or `sortOrder` that places it immediately below its parent in the head list. The position is deterministic (not random) and consistent with the renderOrder owner scheme chosen at AC12.

**B-185 falls out for free (§78.5.6):**

**AC14 — Opener-chain inheritance under a top-level bookmark (B-185 subsumed).** Opening a link from a top-level (ungrouped) bookmark's live tab causes the new tab to float directly under that bookmark in the top-level region's head. The opener resolution uses AC6 (`resolveFloatingOpener`) for the floating-opener case and AC8 (`walkOpenerChain`) for the saved-bookmark case. Both sides land this sprint.

**AC15 — Drag-under-top-level-bookmark (B-185 subsumed).** Dragging a loose open tab onto a top-level bookmark row in the top-level region creates a floating anchor under that bookmark (ATTACH path AC10-AC11). The row moves from the loose tail to the head, below its new parent.

**AC16 — Cross-surface parity.** Both opener-chain inheritance (AC14) and ATTACH (AC15) produce the same floating-anchor result in both the sidepanel and newtab surfaces. R3 cross-surface diff required.

**Forward-compatibility with B-191:**

**AC17 — Q3 representation forward-compat note.** R2 must include an explicit note in the R2 chapter documenting: (a) how the null-group renderOrder owner (AC12) interacts with B-191's renderOrder-sole-authority migration; (b) that B-191 is NOT a prerequisite to B-197; (c) that the chosen representation does not foreclose B-191's design space. This note is a gating R2 output — R3 cannot start without it.

**No schema bump:**

**AC18 — No `KNOWN_VERSION` bump.** The `tj:floatingGroups` validator at `shapes.js:349-396` already tolerates `groupId` as absent/null (optional). The anchor-use change (using `parentItemId` as the top-level anchor without a `groupId`) does not change the validator's REQUIRED set. `KNOWN_VERSION` stays at 9. The one bump (v9→v10 for field-slim + validator tighten) is deferred to B-199.

**AC19 — No `buildFloatingMembers` output shape change for named-group parents.** Floating members whose parent has a non-null `groupId` are keyed exactly as today (`out[parent.groupId]`, `floating-members.js:140`). AC1-AC4 add a SECOND key (the sentinel) without altering the existing named-group keys.

**B-195 test updates (B-197-EXTEND markers):**

**AC20 — B-195 B-197-EXTEND assertions are updated to positive assertions.** The B-197 PR must update the B-195 tests marked `// B-197-EXTEND` to assert the NEW behavior: T5 asserts `resolveFloatingOpener` returns `{ groupId: null, itemId: parentItemId }`; T6 asserts `walkOpenerChain` returns `{ groupId: null, itemId }` for an ungrouped ancestor; T3 asserts `buildFloatingMembers` returns a map with the sentinel key containing the floating member descriptor.

### Destructive-action confirmation (DoR item 7)

**N/A — explicitly per §78.9 Q4.** The loose→anchored transition (floating a tab under a top-level bookmark) is non-destructive and reversible: the user can DETACH the floating tab (returning it to the loose tail) at any time via the existing DETACH flow. No confirmation dialog is required for ATTACH or for opener-chain auto-anchor. The existing DETACH path is unchanged and remains available. This is a creating-new-record action, not a destructive one.

### Performance acceptance criteria

- `buildFloatingMembers` extended to handle ungrouped parents: the inner loop per-record cost is unchanged; the null-groupId branch adds one sentinel-key write per record at O(1). No performance regression.
- Opener-chain resolution (`resolveFloatingOpener`, `walkOpenerChain`): both are already O(N_records) and O(N_hops); the guard removal is a branch simplification. No regression.
- The top-level head re-render after a new floating member arrives must use the existing incremental insert path (`patchFloatingMembersSections`-equivalent, now within the top-level region head), not a full `renderAll`.

---

## DoR Checklist — Per Item

### B-186 Fast Track

- [x] Item 1: User story written ✅
- [x] Item 2: Acceptance criteria defined — testable, unambiguous ✅
- [x] Item 3: Priority P2, effort S ✅
- [x] Item 4: Dependencies — none ✅
- [ ] Item 5: Architecture review (R2) — SKIPPED per Fast Track (item does not touch storage schema, message passing, or extension permissions; pure `LiveTabIndex` in-memory logic)
- [x] Item 7: Destructive-action confirmation — N/A ✅

**DoR status: READY.** No blockers.

### B-195 Full (test-only)

- [x] Item 1: User story written ✅
- [x] Item 2: Acceptance criteria defined — testable, with exact fixture enumeration ✅
- [x] Item 3: Priority P2, effort M ✅
- [x] Item 4: Dependencies — none ✅
- [ ] Item 5: Architecture review (R2) — R2 is lightweight (test-only: no production code changes; no storage, message, or manifest impact). R2 should confirm the fixture shapes are consistent with current validator contracts.
- [ ] Item 6: Performance — N/A (test-only)
- [x] Item 7: Destructive-action confirmation — N/A ✅

**DoR status: READY for R2 (lightweight confirmation).** No blockers.

### B-196 Full (L)

- [x] Item 1: User story written ✅
- [x] Item 2: Acceptance criteria defined — testable, with 4 empty states, cross-surface, selector audit ✅
- [x] Item 3: Priority P2, effort L ✅
- [x] Item 4: Dependencies — B-195 and B-186 (both in-sprint) ✅
- [ ] Item 5: Architecture review (R2) — REQUIRED. R2 must resolve Q1 (visual variant) and Q2 (region placement). R2 fix-scope must enumerate pre-existing test assertions to update (the selector-audit list above is R1's input; R2 confirms/extends it). Cannot start R3 without R2.
- [x] Item 6: Performance criteria defined — first paint <200ms, no full re-render on single update ✅
- [x] Item 7: Destructive-action confirmation — N/A ✅

**DoR status: BLOCKED on R2 (Q1/Q2 decisions + fix-scope test enumeration).** Ready for R2 to start.

### B-197 Full (M/L)

- [x] Item 1: User story written ✅
- [x] Item 2: Acceptance criteria defined — testable, B-185 falls out explicit ✅
- [x] Item 3: Priority P2, effort M/L ✅
- [x] Item 4: Dependencies — B-196 (in-sprint) ✅
- [ ] Item 5: Architecture review (R2) — REQUIRED. R2 MUST resolve Q3 (null-group renderOrder owner, AC12) before R3. The Q3 design decision gates AC2, AC11, AC12, AC13. R2 must also provide the forward-compat note (AC17) and enumerate the `floatingMembers` message-contract change (AC5) in the fix-scope table. Cannot start R3 without R2.
- [x] Item 6: Performance criteria defined ✅
- [x] Item 7: Destructive-action confirmation — N/A, explicitly per §78.9 Q4 ✅

**DoR status: BLOCKED on R2 (Q3 null-group renderOrder owner resolution + forward-compat note).** Ready for R2 to start.

---

## Open Questions for R2

| # | Item | Question | Owner | Blocks |
|---|---|---|---|---|
| Q1 | B-196 | Visual variant: Variant A (fully merged) or Variant B (hairline divider between head and tail)? R0 recommends Variant B. | R2 [solution-architect] | R3 build |
| Q2 | B-196 | Region placement: top-level region above named groups or below? | R2 [solution-architect] | R3 build |
| Q3 | B-197 | Null-group renderOrder owner: sentinel `__toplevel__` group record, per-item `sortOrder`-only, or extension of Group shape to null-id? Must be forward-compat with B-191. | R2 [solution-architect] | R3 build for B-197 |
| Q4 | B-196 | Tail empty-state message: suppress entirely when head-present/tail-empty, or show inline? | R2 [solution-architect] | AC16 |
| Q5 | B-197 | Exact `floatingMembers` payload sentinel key string: `'__toplevel__'`, re-keyed by `parentItemId`, or other? | R2 [solution-architect] | AC2, AC5 |

---

*End of Sprint 48 R1 document.*
