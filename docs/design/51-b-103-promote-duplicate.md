# §51 — B-103 Promote-Tab Duplicate Bug (R2 Design — Thin Pointer)

**Sprint:** 35
**Tier:** Full (S, tier-upgraded from Fast Track per BACKLOG.md to ensure regression coverage)
**Status:** R2 complete (2026-04-25) — READY FOR R3 · R6 will add "As Built" delta
**Owner:** [solution-architect]
**Depends on:** §50 (B-102/B-103 Open-Tabs Patch — **shared root cause and one-line fix**); §10.5 (LiveTabIndex & TabClaims Architecture — defines `claimsMirror`, `claimTabForItem`, the contract that a claim is established before the SW handler returns); §10.7 (Drift Detection Architecture — defines `detectDriftForTab` and the claim-required invariant); §10.10 (Broadcast Architecture — `SCOPE.ITEMS` re-render contract); §10.9 (Sprint 4 Additions — defines `MSG_PROMOTE_TAB` semantics); §26 (B-055 Open Tabs — `buildOpenTabs()` filter contract that depends on `claimsMirror`); §34 (B-052 Fuzzy Search Caching — defines `diffAndPatch` `'noop'` / `'patch'` / `'full-rebuild'` delta semantics).
**Out-of-scope (explicit, AC4 + AC5):** (a) any change to the SW-side `MSG_PROMOTE_TAB` handler in `background/messages/storage-handlers.js` — confirmed correct per §51.2 reality-check; (b) any change to `buildOpenTabs` filter logic in `background/tabs/open-tabs.js` — confirmed correct (regression guard via T3); (c) any change to `claimTabForItem` semantics — unchanged; (d) any change to multi-window broadcast delivery — owned by B-102 and §50; (e) no schema bump, no new manifest permission, no new message type.

---

## §51.1 Overview

B-103 is a single-item bug-fix sprint that resolves the "promote duplicate" defect surfaced from S33 B-099 UAT-13: after promoting an open tab → saved bookmark, BOTH the new bookmark item AND the original Open Tabs row remain visible in the sidepanel; both show as active.

**B-103 shares its root cause with B-102** — the `diffAndPatch` `'noop'` and `'patch'` fast-paths in `sidepanel/sidepanel.js` (~lines 5077, 5105) update `_cachedOpenTabs` via `_setCachedOpenTabs(itemsResp.openTabs)` but **never call `patchOpenTabsSection(_cachedOpenTabs)`** to reflect that change in the DOM. Only the `renderAll` fallback rebuilds Open Tabs. Whenever the broadcast-driven `MSG_LIST_ITEMS` round-trip produces a clean `'noop'` or `'patch'` delta — which is the typical outcome on a single-item promote — the Open Tabs DOM section silently desynchronizes from `_cachedOpenTabs`. The full architectural treatment, the one-line fix (`patchOpenTabsSection(_cachedOpenTabs)` after `_setCachedOpenTabs` in both branches), the test surface, and the rollback live in §50.

**B-103-specific concerns documented here**: (i) verification that the SW-side `MSG_PROMOTE_TAB` handler's `createItem` → `claimTabForItem` ordering is atomic from the receiver's perspective (D-2 below); (ii) confirmation that `buildOpenTabs` correctly excludes the claimed tab once `claimsMirror` is updated (D-3 below); (iii) the B-103 test surface (`tests/b103-promote-duplicate.test.js`); (iv) single-window post-promote UAT cases (`docs/UAT_B-103.md`). B-103 inherits the §50 fix verbatim — there is no B-103-specific code change beyond the shared one-liner. R3 lands ~0 net LOC for B-103 if the shared §50 fix is already merged when B-103's R3 starts; otherwise R3 lands the §50 fix and the new test/UAT files.

---

## §51.2 Existing-State Reality Check

**Today (2026-04-25 on `feature/sprint-35-bug-fixes`, branched off `release/v2`):**

### Pointer to §50 for the shared `diffAndPatch` issue

See §50.2 for the full reality-check on the `sidepanel/sidepanel.js` `diffAndPatch` `'noop'` and `'patch'` fast-path branches (~lines 5066-5123 in the current file). The summary: both branches call `_setCachedOpenTabs(itemsResp.openTabs)` (cache updated) but neither calls `patchOpenTabsSection(_cachedOpenTabs)` (DOM not updated). Only the `renderAll` fallback path (line 5128) rebuilds Open Tabs. The exact line numbers, the verbatim code quotes, and the cross-cutting impact on B-102 (cross-window demote) are all in §50.

### B-103-specific verification: SW-side `MSG_PROMOTE_TAB` atomicity

**`background/messages/storage-handlers.js` lines 242-286** — `MSG_PROMOTE_TAB` case (verified verbatim during R2):

```javascript
case MSG_PROMOTE_TAB: {
  // AC1: validate tabId
  if (typeof p.tabId !== 'number') {
    throw new StorageError(ERR_VALIDATION, 'promoteTab: tabId must be a number');
  }
  const groupId = p.groupId !== undefined ? p.groupId : null;
  if (groupId !== null && typeof groupId !== 'string') {
    throw new StorageError(ERR_VALIDATION, 'promoteTab: groupId must be string or null');
  }

  // AC2: fetch the tab — chrome.tabs.get rejects if the tab doesn't exist
  let tab;
  try {
    tab = await chrome.tabs.get(p.tabId);
  } catch {
    throw new StorageError(ERR_NOT_FOUND, 'tab not found');
  }
  if (!tab) {
    throw new StorageError(ERR_NOT_FOUND, 'tab not found');
  }

  // AC3 (B-058): scheme validation owned by normalizeUrl inside createItem
  const url = tab.url || '';
  // B-059: duplicate-URL detection moved to UI layer as a pre-dispatch soft-warn
  const newItem = await createItem({
    title: tab.title || url,
    url,
    groupId,
  });

  // AC6: immediately claim the tab
  await claimTabForItem(newItem.id, p.tabId);

  return newItem;
}
```

**Verified order of operations (CONFIRMED ATOMIC FROM RECEIVER PERSPECTIVE)**:
1. `await createItem(...)` — items partition write completes; new item exists in `tj:items`.
2. `await claimTabForItem(newItem.id, p.tabId)` — `claimsMirror[newItem.id] = p.tabId` set in-memory **AND** `await writeClaims()` persists to `chrome.storage.session.tj:tabClaims` (verified at `background/tabs/tab-claims.js:267-270`).
3. `return newItem` — the dispatcher in `storage-handlers.js` then runs `MUTATION_BROADCASTS[MSG_PROMOTE_TAB] === SCOPE.ITEMS` (line 117) and emits the broadcast.

**Key invariant**: by the time `SCOPE.ITEMS` fires, **`claimsMirror` already contains the claim entry**. Any subsequent `MSG_LIST_ITEMS` round-trip will produce an `itemsResp.openTabs` that excludes the claimed tab (because `buildOpenTabs()` filters by `Object.values(getClaimsMirror())` per `background/tabs/open-tabs.js:37, 41`).

**Conclusion: the SW-side ordering is correct. The bug is purely sidepanel-side**, in the `diffAndPatch` fast-path branches. R1 Q2's hypothesis is confirmed. No SW changes are needed for B-103 — D-2 below documents this explicitly.

### `buildOpenTabs` filter (regression guard scope)

**`background/tabs/open-tabs.js:33-61`** — `buildOpenTabs()` (verified verbatim during R2):
- Line 34: `if (!isClaimsReady()) return [];` — cold-start safety preserved.
- Line 37: `const claimedTabIds = new Set(Object.values(getClaimsMirror()));` — fresh snapshot every call.
- Line 41: `if (claimedTabIds.has(tabId)) continue;` — claimed tabs excluded from the result.

**No code change required**. The §50 fix is necessary AND sufficient: once the sidepanel correctly calls `patchOpenTabsSection(_cachedOpenTabs)` after the broadcast-driven refetch, `_cachedOpenTabs` already excludes the now-claimed tab (it was filtered out at the SW boundary by `buildOpenTabs`), and `patchOpenTabsSection` removes the corresponding row from the DOM via its `if (!nextById.has(tabId)) row.remove()` walk (sidepanel.js line 2870-2875).

### No pre-existing B-103 code

No partial implementation, no scaffolding, no unreviewed B-103 code. R3 modifies one file (`sidepanel/sidepanel.js`, the shared §50 one-liner — possibly already landed by B-102 R3 by the time B-103 R3 starts) and adds two (`tests/b103-promote-duplicate.test.js`, `docs/UAT_B-103.md`).

---

## §51.3 Design Decisions (D-1 through D-3)

### D-1 — Inherit the §50 shared fix (no B-103-specific code)

**Choice:** B-103 inherits the §50 D-1 one-line fix verbatim: in `sidepanel/sidepanel.js`, both the `'noop'` branch (~line 5077) and the `'patch'` branch (~line 5105) gain a `patchOpenTabsSection(_cachedOpenTabs)` call immediately after `_setCachedOpenTabs(itemsResp.openTabs)`. See §50.3 D-1 for the full code-change shape, line numbers, and rationale.

**B-103 does NOT introduce a separate or independent fix.** B-102 and B-103 are both manifestations of the same underlying defect — the `'noop'` / `'patch'` branches updating the openTabs cache without repainting the DOM. Solving one solves the other.

**R3 coordination note**: if B-102 R3 lands the §50 fix first, B-103 R3 has zero source-code changes and only adds the test file + UAT doc. If B-103 R3 lands first, it owns the §50 fix and B-102 R3 inherits it. The two items must coordinate via [scrum-master] to avoid double-merging the same hunk.

### D-2 — No SW-side changes needed (atomicity verified, R1 Q2 confirmed)

**Choice:** `background/messages/storage-handlers.js` `MSG_PROMOTE_TAB` case is **NOT modified**. R1 Q2 hypothesized the SW order was correct; R2 §51.2 verifies via verbatim code reading that:

1. `await createItem(...)` resolves before `await claimTabForItem(...)` begins.
2. `await claimTabForItem(...)` resolves before `return newItem` executes.
3. `return newItem` happens before the dispatcher emits `SCOPE.ITEMS`.

The receiver therefore observes a fully-claimed tab on the very first `MSG_LIST_ITEMS` round-trip after the broadcast — `itemsResp.openTabs` already correctly excludes the promoted tab. There is no race window on the SW side.

**Rationale:** the bug is exclusively in the receiver's DOM update path (the missing `patchOpenTabsSection` call). Modifying the SW would be unnecessary and would risk regressing the existing atomicity guarantee. T5 in `tests/b103-promote-duplicate.test.js` is the regression guard for this SW-side ordering invariant.

### D-3 — `buildOpenTabs` filter invariant (regression guard, no change)

**Choice:** `background/tabs/open-tabs.js` `buildOpenTabs()` is **NOT modified**. The filter at line 37 (`new Set(Object.values(getClaimsMirror()))`) and line 41 (`if (claimedTabIds.has(tabId)) continue;`) already correctly exclude any tab present in the claims mirror.

**Invariant**: `claimTabForItem(itemId, tabId)` is awaited **before** the SW handler returns AND **before** the `SCOPE.ITEMS` broadcast emits. Therefore, when the receiver's broadcast-driven `MSG_LIST_ITEMS` round-trip executes `buildOpenTabs()` on the SW, `claimsMirror` already contains the new entry — the just-promoted tab is excluded from the response.

**Rationale:** §51.2's reading of `tab-claims.js:267-270` confirms `claimTabForItem` performs both an in-memory mirror write AND `await writeClaims()` (the session-storage persist) — so even if the next `MSG_LIST_ITEMS` arrives from a different code path that re-derives state from session storage, the claim is already persisted. T3 in `tests/b103-promote-duplicate.test.js` is the regression guard.

---

## §51.4 Architecture Diagram (text)

### Promote flow (post-fix behavior)

```
User clicks "Save tab" on an Open Tabs row (or invokes via keyboard / drag)
   │
   ▼
sendMessage(MSG_PROMOTE_TAB, { tabId, groupId })
   │
   ▼  [SW boundary — background/messages/storage-handlers.js]
MSG_PROMOTE_TAB case:
   ├─ chrome.tabs.get(tabId)        — fetch live tab metadata
   ├─ await createItem(...)         — items partition write; new item ULID assigned
   ├─ await claimTabForItem(id, tabId)
   │     ├─ claimsMirror[id] = tabId        (in-memory mirror)
   │     └─ await writeClaims()             (session-storage persist)
   └─ return newItem
   │
   ▼  [dispatcher — runs after handler returns]
broadcast(SCOPE.ITEMS, MSG_PROMOTE_TAB)
   │
   ▼  [back to sidepanel — sidepanel.js broadcast receiver]
MSG_STATE_CHANGED { scope: 'items' } received
   │
   ▼
sendMessage(MSG_LIST_ITEMS) — fetch fresh items + liveStates + driftRecords + openTabs
   │
   ▼  [SW computes openTabs]
buildOpenTabs():
   │   ─ claimsMirror NOW INCLUDES the promoted tab's claim
   │   ─ Object.values(claimsMirror).has(promotedTabId) === true
   │   ─ promoted tab is EXCLUDED from the openTabs array
   │
   ▼  [back to sidepanel — diffAndPatch path]
diffAndPatch(_searchIndex, itemsResp.items)
   │   ─ delta is typically 'patch' for a single-item promote (one new item added)
   │
   ▼
'patch' branch:
   ├─ _cachedItems = itemsResp.items
   ├─ _cachedDriftRecords = itemsResp.driftRecords
   ├─ _setCachedOpenTabs(itemsResp.openTabs)         ← cache updated (existing)
   ├─ patchOpenTabsSection(_cachedOpenTabs)          ← §50 D-1 fix (NEW)
   ├─ _patchSingleRow for each affected change       — adds bookmark row to group
   └─ patched = true
   │
   ▼
Visual end-state (single-window):
   • New bookmark row visible in its assigned group with live indicator
     (data-active="true" because the tab is open AND claimed AND focused)
   • Original Open Tabs row REMOVED from the Open Tabs section
     (patchOpenTabsSection's "remove rows that no longer qualify" walk
      at sidepanel.js line 2869-2875 removes the row whose tabId is no
      longer in nextById)
   • Open Tabs count badge decremented by 1
   • No duplicate visible — invariant holds (Q1 lock from R1)
```

The cross-window post-promote propagation depends on B-102's broadcast-delivery contract; once both fixes land (the §50 shared fix + B-102's broadcast scope/receiver work), all open sidepanel windows reach the same end-state described above. AC5 (cross-window) is the SKIP-able UAT case if B-102 has not yet landed.

---

## §51.5 R2 Correctness Checklist (C-1 through C-12)

| # | Check | Verdict | Notes |
|---|-------|---------|-------|
| C-1 | Storage schema versioned | **N/A** | Zero schema changes. `tj:items`, `tj:tabClaims`, `tj:groups`, `tj:drift` shapes all unchanged. No new pref keys, no new validator allow-list entries — therefore no SW module-cache stale-state risk per the S31 B-094 stale-SW guidance. |
| C-2 | Message contracts typed | **N/A** | Zero new message types; zero edits to existing message handlers. `MSG_PROMOTE_TAB`, `MSG_LIST_ITEMS`, `SCOPE.ITEMS` all unchanged. The shared §50 fix is a sidepanel-side DOM call only — it does not touch any message contract. |
| C-3 | SW cold-start safe | **PASS** | The `buildOpenTabs()` cold-start guard (`if (!isClaimsReady()) return [];` at `open-tabs.js:34`) is preserved. On a cold sidepanel open after a promote action that occurred during SW sleep, the post-bootstrap `MSG_LIST_ITEMS` round-trip returns the correct openTabs once `reconcileClaims` re-derives `claimsMirror` from `tj:tabClaims` session storage (the persisted claim from `claimTabForItem` survives session-storage retention). The `claimsReady` gate prevents leaking saved bookmarks' tabs into Open Tabs during the bootstrap window. |
| C-4 | ID stability | **PASS** | The new bookmark gets a stable ULID via `createItem` (§3 ID strategy). The promoted `tabId` is the existing browser-session `tabId`, never persisted in any partition, used only as the `claimsMirror[newItemId] = tabId` value. The post-fix DOM correctly anchors the new bookmark row by `data-item-id="<newULID>"` and removes the Open Tabs row by `data-tab-id="<promotedTabId>"` — two different stable identifiers, no collision risk. |
| C-5 | Manifest file references resolvable | **N/A** | Zero `manifest.json` changes. No new `default_path`, `default_popup`, `chrome_url_overrides`, `web_accessible_resources` entries. |
| C-6 | Permission minimization | **N/A** | Zero new permissions. `manifest.json` `permissions` array unchanged: `["tabs", "tabGroups", "storage", "sidePanel", "search"]`. |
| C-7 | Allow-list direction | **N/A** | No new sanitizer, validator, or export surface. `MSG_PROMOTE_TAB` URL validation is already an allow-list (`normalizeUrl` allowlist `http`/`https`/`file` per §27 / B-058) — unchanged. |
| C-8 | SW-context feasibility | **N/A** | The fix is sidepanel-document-context only (`patchOpenTabsSection` runs in the sidepanel page where `document.querySelector`, `appendChild`, etc. are all available). The SW continues to run only `chrome.tabs.get`, `createItem`, `claimTabForItem`, `buildOpenTabs` — all already-in-use SW-safe APIs. |
| C-9 | Empty-state design | **PASS — 4 paths enumerated** | (a) **Promote when no group selected (`groupId === null`)**: `createItem` accepts `null` groupId; the new item is created at the root level; the bookmark row appears at root with live indicator; the Open Tabs row is removed by the §50 fix. UI behavior: accept-fully. (b) **Promote a tab that is the only Open Tab**: after promote, `_cachedOpenTabs.length === 0`; `patchOpenTabsSection` calls `_toggleOpenTabsEmpty(section, true)` (sidepanel.js line 2899) which renders the empty-state. UI behavior: accept-fully. (c) **Tab navigates mid-promote (rare race: user clicks Save tab; tab navigates to a different URL between `chrome.tabs.get` and `createItem`)**: `chrome.tabs.get` returned the OLD URL; `createItem` uses that URL; `claimTabForItem` claims the tab regardless of its current URL. The next `tabs.onUpdated` event triggers `reevaluateTab` → `detectDriftForTab` (per §10.7), which writes a drift record because the now-different URL doesn't match the saved item URL. UI behavior: accept-with-drift-indicator (the user sees a drifted bookmark immediately, which they can resolve via "Snap to this tab" per B-099). (d) **Tab closed mid-promote (rare race: user clicks Save tab; tab closes between `chrome.tabs.get` and `claimTabForItem`)**: `claimTabForItem` writes the claim with a now-stale `tabId`; the next `tabs.onRemoved` for that `tabId` calls `releaseClaimByTab` which removes the orphaned claim and returns the now-unclaimed item to its non-live state. UI behavior: accept-with-unlive-state (the bookmark exists but shows non-live; user can navigate to it via the existing `MSG_NAVIGATE_TO_ITEM` path which opens a fresh tab). |
| C-10 | Off-screen rect feasibility | **N/A** | No drag, no `setDragImage`, no `canvas.toDataURL`, no off-screen DOM positioning. The new bookmark row appears in the standard items list flow; the Open Tabs row removal is a `row.remove()` call on an in-flow element. |
| C-11 | Popup-lifecycle message ordering | **N/A** | `MSG_PROMOTE_TAB` is dispatched from the sidepanel document context, not from a `popup/*.html` surface. The popup surfaces (B-022 quick-search, B-023 group-jump) do NOT render Open Tabs rows and do NOT host a "Save tab" affordance. The sidepanel document survives the dispatch + broadcast + DOM-patch lifecycle without focus-shift teardown. |
| C-12 | Manifest declaration runtime-mutability | **N/A** | Zero `manifest.json` edits. |

**Summary: 2 PASS (C-3, C-4) + 1 PASS-with-enumeration (C-9) + 9 N/A.** Most checks are correctly N/A because B-103 inherits a tiny shared sidepanel-DOM fix from §50 — no new schema, no new message, no new permission, no SW change, no popup surface involvement.

---

## §51.6 Performance Plan

B-103 inherits the §50.6 performance budget verbatim. The shared one-line fix (`patchOpenTabsSection(_cachedOpenTabs)` after `_setCachedOpenTabs` in both `'noop'` and `'patch'` branches) adds at most one additional DOM-diff walk per broadcast — bounded by the size of the Open Tabs section (~20 rows on typical user collections; targeted by §9 perf standards). `patchOpenTabsSection` is already a keyed diff that touches only changed rows; it is not a full rebuild. No new performance budget is introduced for B-103.

| Path | Budget | Source |
|------|--------|--------|
| `patchOpenTabsSection` invocation on promote | < 5 ms on a 50-row Open Tabs section | §50.6 + §9 |
| `MSG_PROMOTE_TAB` SW round-trip | Unchanged (no SW changes) | §10.9 baseline |
| Broadcast → diffAndPatch → DOM-patch end-to-end | < 100 ms P95 | §10.10 + §34 baselines |

T1 + T2 in `tests/b103-promote-duplicate.test.js` exercise the `'noop'` and `'patch'` branches end-to-end and double as performance regression guards (they fail loudly if the round-trip exceeds reasonable bounds via test-runner timeout).

---

## §51.7 Accessibility Plan

**N/A — zero AT-visible behavior change.**

B-103 is a pure DOM-state-correctness fix on the Open Tabs section. The new bookmark row inherits the existing `buildItemRow` aria contract (per B-048 §31 visual-state matrix); the removed Open Tabs row is removed via `row.remove()`, which correctly drops it from the AT tree. No new ARIA attributes are introduced, no new keyboard-reachable elements are added, no focus management changes. The pre-existing AT contract for both surfaces is preserved verbatim.

---

## §51.8 Rollback Plan

B-103 inherits §50.8 verbatim. **Single-commit revert of the shared §50 fix restores pre-S35 behavior** — both B-102's cross-window demote bug AND B-103's promote-duplicate bug return together, since they share the same one-line root cause.

```bash
# Identify the merge SHA on release/v2:
git log --oneline release/v2 | grep -E "B-102|B-103"

# Single-commit revert of the shared fix:
git revert <merge-sha>
git push origin release/v2

# Sidepanel surfaces refresh on next reload — no data migration needed.
```

| Aspect | Rollback impact |
|--------|-----------------|
| `tj:items` / `tj:tabClaims` / `tj:groups` / `tj:drift` | No-op. Untouched by B-103. |
| Manifest permissions | No-op. Untouched by B-103. |
| User-facing breakage | Promote duplicate-row bug returns; users see the bookmark + Open Tabs row simultaneously after promote. UX regression only — no data loss. |

**SEV severity if rollback needed:** SEV3 (minor degradation) — promote-duplicate is a UI-state correctness bug, not data corruption. The underlying `tj:items` and `tj:tabClaims` partitions are correct in both pre-fix and post-fix states; only the receiver-side DOM repaint is broken pre-fix. Default response is to fix forward.

---

## §51.9 Open Questions

**None.** R1 locked all 3 product/UX questions (Q1 post-promote state invariant, Q2 atomicity contract, Q3 UAT scope). R2 §51.2 confirmed Q2 via verbatim code reading — SW-side ordering is correct; the bug is exclusively in the sidepanel `diffAndPatch` fast-paths. R2 D-1/D-2/D-3 documented the inherit-from-§50 strategy, the no-SW-changes confirmation, and the `buildOpenTabs` filter invariant. R3 has zero outstanding architectural decisions to make.

---

## §51.10 As Built (R6)

**Closed:** 2026-04-25
**Release:** v1.29.0 (planned per Sprint 35)
**Branch:** `feature/sprint-35-bug-fixes`

§51 is a thin pointer chapter — §50.10 is the source of truth for the SHARED architecture, R3 source diff, R4 hardening, and rollback. This §51.10 records ONLY the B-103-specific test-surface + UAT contributions. Cross-reference §50.10 for everything else.

### Files actually changed vs. expected

| File | Expected (R2) | Actual (R6) | Notes |
|------|---------------|-------------|-------|
| `sidepanel/sidepanel.js` | 0 source LOC for B-103 (inherits the SHARED §50 fix from B-102 R3) | ✅ 0 LOC for B-103 | The 2-line shared fix at sidepanel.js lines 5086 + 5125 (post-R3-fix moved INSIDE `if (allApplied)` AFTER `_itemById = new Map(...)` per §50.10 H-1 + M-1) was landed under B-102's R3 commit and serves both bug manifestations. B-103 R3 was effectively a no-op source change — the verification trace was the entire B-103 R3 work. |
| `background/messages/storage-handlers.js` | 0 LOC (D-2: SW handler atomicity already correct) | ✅ 0 LOC | §51.D-2 + R5 T2 confirm the existing `await createItem` → `await claimTabForItem` → `return newItem` ordering is correct as-is. No SW change. |
| `background/tabs/open-tabs.js` | 0 LOC (D-3: `buildOpenTabs` filter already correct) | ✅ 0 LOC | §51.D-3 + R5 T4 confirm the `claimsMirror` exclusion at line 41 is correct as-is. No SW change. |
| `tests/b103-promote-duplicate.test.js` | NEW, ≥ 5 tests per AC6 | ✅ NEW, **6 tests** (T1-T6) | +20% above R2 minimum. Single-window emphasis — promote round-trip + atomicity invariant + claim regression + filter regression + ordering regression + audible-promote follow-up. |
| `docs/UAT_B-103.md` | NEW, ≥ 3 cases | ✅ NEW, **4 cases** (UAT-1..UAT-4) | +33% above R2 minimum. Adds the audible-promote case (UAT-3) and the cross-window-propagation case (UAT-4, SKIP-able if B-102 not landed — but B-102 did land in this same sprint, so UAT-4 is required). |
| `docs/design/51-b-103-promote-duplicate.md` | THIS thin pointer chapter | ✅ this file (R2 + R6) | §51.10 As Built filled here. |

### Test counts (final)

B-103 contributes **+6 tests** (T1–T6 in `tests/b103-promote-duplicate.test.js`) to the cumulative Sprint 35 suite.

Per the SPRINT.md handoff trail, the cumulative suite at sprint close is **1,464 passing / 0 failing** (full Sprint 35 net = +38 from S34 baseline 1,426 across B-100 +16, B-102 +8, B-103 +6, B-105 +7, B-106 +1). Zero regressions. All 6 B-103 tests pass standalone and within the full suite. See §50.10 for the full sprint test-progression table.

### UAT results

| Case | Status | Notes |
|------|--------|-------|
| UAT-1 single-window promote happy path (B/blocker) | ✅ AUTHORED — pending human walk-through | Single-window; reproducible in any browser. |
| UAT-2 promote with B-059 duplicate-URL warn (B/blocker) | ✅ AUTHORED — pending human walk-through | Verifies the §50 fix removes the Open Tabs row even when B-059's pre-existing soft-warn confirmation path fires. |
| UAT-3 audible promote (H/high) | ✅ AUTHORED — pending human walk-through | Documented WARN tolerance for >2 s audible-icon delay (LIVE_STATE broadcast follow-up beat). T6 covers the SW-side data correctness. |
| UAT-4 cross-window propagation (M/medium) | ✅ AUTHORED — pending human walk-through | Now mandatory (SKIP-condition lifted) because B-102 also landed in S35. Requires multi-window Edge session at sprint close. |

All 4 cases are AUTHORED at sprint close; human Edge walk-through is the responsibility of the [release-manager]'s pre-publish UAT pass. R5 [test-engineer] sign-off recorded in SPRINT.md confirms the cases are well-formed and the test surface is complete.

### Hardening (R4 disposition)

B-103 inherits the §50 shared R3-fix verbatim:

- **H-1** (code-reviewer): `patchOpenTabsSection(_cachedOpenTabs)` in the `'patch'` branch was originally placed BEFORE `_itemById = new Map(...)` rebuild — risk of stale-lookup race. Fixed in R3-fix by moving the call to AFTER `_itemById` rebuild.
- **M-1** (qa-reviewer): same call was originally OUTSIDE the `if (allApplied)` guard — risk of double-render on the partial-patch abort path. Fixed in the same R3-fix ordering change by moving the call INSIDE the `if (allApplied)` block.

Both H-1 + M-1 collapse into a single ordering change. R5 T5 in `tests/b103-promote-duplicate.test.js` is the regression guard against future refactors that re-introduce the original ordering. See §50.10 for the full code-side narrative — §51 owns only the test-side regression pin.

### Deviations from R2 plan

1. **B-103 R3 was 0 LOC source change.** R2 §51.1 anticipated this could happen if B-102 R3 landed the shared §50 fix first. B-102 R3 did land first; B-103 R3 verified the source state and added only the test + UAT files. This is a planned-for outcome, not a deviation in the failure sense.
2. **R2 expected ≥ 5 tests; landed 6.** T6 (audible-promote regression) was added during R5 to provide an explicit regression guard for the §51.4 audible follow-up timing note. +20% above the R2 minimum.
3. **R2 expected ≥ 3 UAT cases; landed 4.** UAT-3 (audible promote) and UAT-4 (cross-window) were added beyond the original 3-case plan to cover the audible follow-up beat and to provide a parallel-with-B-102 cross-window manual repro now that B-102 landed in the same sprint. +33% above the R2 minimum.
4. **T2 (SW handler atomicity verification) implemented as read-only AST/text assertion** per the R5 [test-engineer] prompt rather than a runtime atomicity probe. The atomicity invariant (`await createItem` → `await claimTabForItem` → `return newItem` ordering) is structural — a text/AST regression guard against the source file is a strict superset of any runtime probe (a runtime probe could pass while the source ordering silently changes). Documented as a deliberate test-engineering choice; the alternative was rejected because mocking `createItem` to inject delays would not catch a refactor that reorders the awaits without changing their timings.
5. **T5 (B-103-specific `patchOpenTabsSection` ordering regression) provides a SECOND independent regex assertion** on the §50 H-1 + M-1 fix shape. B-102's T6 already pins the same invariant from a cross-window-demote angle; B-103's T5 pins it from a promote angle with slightly different anchor strings (`} else if (delta.deltaType === 'patch')` + `'full-rebuild' deltas fall through` sentinels). The dual-angle protection means a future refactor must keep BOTH regex assertions passing — the cost of accidentally re-introducing the original H-1 race is now visible in two different test files with two different failure messages.

### Coordination note (with §50)

§50 is the source-of-truth for the shared root cause, the 2-line code fix, the multi-context broadcast convergence trace (D-3), and the rollback procedure. §51 is the B-103-specific test surface + single-window UAT lens. R6 As Built is intentionally short here because all the heavy architectural narrative lives in §50.10. Future readers tracing the promote-duplicate bug should start at §50, then return to §51 for the test-side and UAT-side specifics.

The B-102 R3 + R3-fix landed the shared sidepanel diff once; the B-103 R3 commit was effectively a verification pass on top of it (no source delta). This avoided the double-merge risk flagged in R2 §51.D-1 R3-coordination-note. SPRINT.md's "Files Changed (R3)" entry for B-103 explicitly records "ZERO source-code changes specific to B-103" to make this coordination outcome unambiguous in the sprint history.

### Follow-up backlog items

**NONE.** All HIGH and MEDIUM R4 findings landed in R3-fix; LOW findings (L-1 DRY-comment-observation, L-2 `_itemById` ordering doc note, L-3 audible timing pre-existing gap) are intentionally deferred and acknowledged in §50.10. No new B-103-specific defects surfaced during R4/R5/R6.

### Rollback

Inherited from §50.8 — single-commit revert of the shared 2-line fix on `release/v2`. SEV3 minor degradation (UI-state divergence, no data loss). Reverting also re-introduces B-102's cross-window-demote symptom because both items share the same root cause and the same fix.

```bash
# See §50.8 for the full procedure.
git log --oneline release/v2 | grep -E "B-102|B-103"
git revert <merge-sha>
git push origin release/v2
```

---
