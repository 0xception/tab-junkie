# §67 — B-041 Chrome Tab Group Sync (R2 Architecture)

**Status**: R2 LOCKED 2026-05-01 — Sprint 42 anchor
**Spec**: `docs/superpowers/specs/2026-05-01-chrome-tab-group-sync-design.md` (commit `e15e8e1`)
**Plan**: `docs/superpowers/plans/2026-05-01-chrome-tab-group-sync.md` (commit `ac107a2`)
**Tier**: Full (M)
**Anchor**: B-041 (closes pre-S33 P2/L placeholder, narrowed to snapshot-only / current-window-only / top-level-groups)

---

## §67.1 Overview

B-041 introduces a one-way snapshot push from TJ's view of a window into Chrome's tab strip and tab groups. A user clicks a single button in Settings → Chrome Integration; TJ reads its current state for the window containing the Settings tab, reorders Chrome's tab strip to match TJ's order, creates or updates Chrome tab groups for each TJ group with at least one live tab, persists a `chromeTabGroupId` mapping for re-sync stability, and reports the result via the existing toast surface.

The push is unidirectional, manual, and current-window-only. Auto-sync (live mirror), Chrome → TJ pull, multi-window sync, sub-group flattening, and Chrome-group adoption are all explicitly deferred (see spec §10).

The chapter is organized as: schema impact (§67.2) → message contract (§67.3) → modules + entry point (§67.4) → orchestrator algorithm (§67.5) → R2 risks resolved (§67.6) → fix-scope test enumeration (§67.7) → checklist results (§67.8) → rollback (§67.9).

---

## §67.2 Schema impact (C-1a + C-1b explicit closure)

### §67.2.1 — C-1a Schema-version governance bump (mandatory)

`tj:groups` records gain an OPTIONAL field `chromeTabGroupId: number | null`. Per CLAUDE.md C-1a, this triggers a governance bump whether or not the data migration is eager:

| Site | Pre-B-041 (v4) | Post-B-041 (v5) |
|------|----------------|------------------|
| `background/storage/migration.js:89` `KNOWN_VERSION` | `4` | `5` |
| `background/storage/shapes.js:111` `defaultShape(PARTITION_META).schemaVersion` | `4` | `5` |
| `background/storage/migration.js` `MIGRATION_STEPS[]` | 3 entries (v1→v2, v2→v3, v3→v4) | 4 entries (+ v4→v5 no-op) |
| `CHANGELOG.md` v1.36.0 entry | n/a | MUST include "toggle OFF→ON in chrome://extensions to flush SW module cache after update" |

The migration chain assertion at `migration.js:156-158` continues to hold (`MIGRATION_STEPS[i].toVersion === MIGRATION_STEPS[i+1].fromVersion` for i = 0..2; v4→v5 is the new tail).

### §67.2.2 — C-1b Data-migration strategy (lazy — option 2)

Choice: **lazy migration**. Legacy v4 records lack the `chromeTabGroupId` field. The validator (§67.2.3) tolerates the missing field. The orchestrator (§67.5) treats `chromeTabGroupId === undefined | null` as "never synced" — first sync stamps the field via `updateGroup({chromeTabGroupId})`. Records self-evict to v5 shape as users sync each group; un-synced groups remain in v4 shape indefinitely without harm.

Why not eager: the v4→v5 transformation requires a Chrome-side roundtrip (creating Chrome tab groups for every existing TJ group), which is a side effect, not a pure data migration. Forcing it on cold start would create Chrome tab groups the user did not request. Lazy migration localizes the transition to user-driven sync calls.

### §67.2.3 — Validator extension (`background/storage/shapes.js:140-146`)

Pre-B-041:
```js
function isGroup(v) {
  return v && typeof v === 'object'
    && isString(v.id) && isString(v.name) && isString(v.color)
    && isNullableString(v.parentId)
    && isNumber(v.sortOrder) && isBool(v.collapsed)
    && isNumber(v.createdAt) && isNumber(v.updatedAt);
}
```

Post-B-041:
```js
function isGroup(v) {
  if (!v || typeof v !== 'object') return false;
  if (!isString(v.id) || !isString(v.name) || !isString(v.color)) return false;
  if (!isNullableString(v.parentId)) return false;
  if (!isNumber(v.sortOrder) || !isBool(v.collapsed)) return false;
  if (!isNumber(v.createdAt) || !isNumber(v.updatedAt)) return false;
  /* B-041 (S42 §67.2.3) — OPTIONAL v5 field. Legacy v4 groups lack it; new
     writes stamp it on first sync; null is valid (cleared after stale-mapping
     detect). Anything else is corrupt. */
  if ('chromeTabGroupId' in v
    && v.chromeTabGroupId !== null
    && !isNumber(v.chromeTabGroupId)) return false;
  return true;
}
```

Allow-list direction (C-7): allow-list (extends `validateGroupPatch` allow-list at `background/storage/groups.js:116`). New patch writes through `MSG_UPDATE_GROUP` are constrained to the documented allow-list set.

### §67.2.4 — Rollback plan (storage-schema)

If v1.36.0 must be reverted to v1.35.0 (or earlier):

1. Restore prior version's extension package.
2. Run extension cold start. Stored `tj:meta.schemaVersion === 5` is greater than the prior code's `KNOWN_VERSION === 4`. Per `migration.js:_isSafeMode` semantics, the extension enters READ-ONLY safe mode (writes blocked).
3. To exit safe mode without data loss: open Settings → Data → Export JSON → save backup; then in chrome://extensions → Storage → clear `tj:*` keys for the extension; reload. Re-import from backup.
4. Backup JSON contains `chromeTabGroupId` fields; the prior code's `validateGroupPatch` allow-list does NOT include `chromeTabGroupId`, so import via `MSG_IMPORT_COLLECTION` will reject those fields. The import path's `json-validator.js` strips unknown fields before write — confirmed allow-list direction (C-7).

---

## §67.3 Message contract

New constant in `shared/messages.js`:

```js
export const MSG_SYNC_TO_CHROME = 'tj/syncToChrome';
```

Request payload shape: `{ windowId: number }`.

Response envelope (success): `{ ok: true, data: { summary: SyncSummary } }`.
Response envelope (error): `{ ok: false, error: { code: string, message: string } }`.

`SyncSummary` shape:

```js
{
  windowId: number,
  tabsReordered: number,
  groupsCreated: number,
  groupsUpdated: number,
  skipped: Array<{ reason: 'pinned'|'tab-gone'|'permission'|'unknown', count: number }>
}
```

Note (per spec §6 reconciled): `group-gone` is NOT a skip-reason. When a stored `chromeTabGroupId` no longer corresponds to a real Chrome tab group, the orchestrator silently clears the stale mapping and creates a fresh group — counted as `groupsCreated`, not `skipped`.

Registered in `WRITE_MESSAGE_TYPES` set at `background/messages/storage-handlers.js`. Safe-mode (stored `schemaVersion > KNOWN_VERSION`) blocks the call (per existing `_isWriteType` gate).

---

## §67.4 Modules + entry point

### §67.4.1 — `background/sync/color-map.js` (new module — pure)

Exports:
- `tjColorToChromeColor(tjColor: string): ChromeTabGroupColor` — total mapping with `'grey'` defensive fallback.
- `CHROME_TAB_GROUP_COLORS: ReadonlySet<string>` — frozen palette enumeration for assertions.

Static lookup table (Q6-A):

| TJ color (`shared/constants.js:5`) | Chrome `chrome.tabGroups.update.color` |
|----|----|
| blue | blue |
| purple | purple |
| teal | cyan |
| red | red |
| orange | orange |
| pink | pink |
| indigo | blue |
| yellow | yellow |
| slate | grey |

The two inexact pairs (teal→cyan, indigo→blue, slate→grey) are documented in the module header.

### §67.4.2 — `background/sync/chrome-sync.js` (new module — orchestrator + helpers)

Public exports:
- `syncToChrome(windowId: number): Promise<SyncSummary>` — orchestrator entry called by the SW handler.
- `isSyncInFlight(): boolean` — module-level flag getter; consulted by `chrome.tabs.onMoved` listener to suppress floating-group re-bind during the bulk strip-reorder (R2 risk #6 resolution).
- `_computeTargetStripOrder(state: SyncWindowState): number[]` — pure helper, exported for unit-test access.
- `_buildSummary(input): SyncSummary` — pure helper, exported for unit-test access.

Internal helpers:
- `_collectWindowState(windowId)` — reads `chrome.tabs.query({windowId})` + `listGroups()` + `listItems()`; produces `SyncWindowState` (see §67.5.1).
- `_validateChromeGroupId(storedId)` — wraps `chrome.tabGroups.get(storedId)` in try/catch; returns `storedId | null`.
- `_applyTabsToGroup({tabIds, existingId, title, color, windowId})` — calls `chrome.tabs.group` then `chrome.tabGroups.update`; returns `{groupId, created}`.
- `_classifyError(err)` — string-match on `err.message` to map to skip-reason bucket.

### §67.4.3 — `settings/settings-chrome-sync.js` (new module — Settings-page wiring)

Initializes the click handler on `#settings-sync-chrome-btn`. On click:
1. Captures `chrome.windows.getCurrent().id` (Q8-A locked).
2. Calls `sendMessage(MSG_SYNC_TO_CHROME, {windowId})` via the existing Settings-page transport.
3. Renders the resulting `SyncSummary` into `#settings-toast` with green/yellow/red variant.
4. Disables the button while the sync is in flight; re-enables on completion (success or error).

No new toast component — reuses the existing B-049 / B-093 toast contract at `#settings-toast` (4s auto-dismiss, manual × dismiss, `role="alert"`, `aria-live="assertive"`).

### §67.4.4 — Permission and manifest

`tabGroups` permission is **already declared** at `manifest.json:6`:
```json
"permissions": ["tabs", "tabGroups", "storage", "sidePanel", "search"],
```
Verified via `grep tabGroups manifest.json` at S42 kickoff. No manifest change required for B-041. R4 [security-reviewer] gate per C-6 is satisfied by the prior approval; PM-confirmed at R1.

---

## §67.5 Orchestrator algorithm

### §67.5.1 — `SyncWindowState` shape

```js
{
  windowId: number,
  groups: TJGroupForSync[],         // pre-sorted by sortOrder
  ungroupedTabIds: number[],         // pre-ordered Open Tab IDs (by chrome tab.index)
  pinnedTabIds: Set<number>,
  settingsTabId: number | null,      // exclude from reorder
}
```

`TJGroupForSync` shape:
```js
{
  id: string,
  name: string,
  color: string,                     // TJ color slug
  sortOrder: number,
  tabIds: number[],                  // live tab IDs for this group, in TJ item-sortOrder
  chromeTabGroupId: number | null,
}
```

Top-level only (`g.parentId === null`). Sub-groups are out of scope for B-041 (deferred per spec §10).

### §67.5.2 — `_computeTargetStripOrder` algorithm

```
out = []
sortedGroups = state.groups sorted by sortOrder asc
for each g in sortedGroups:
  for each tabId in g.tabIds:
    if tabId NOT in pinnedTabIds AND tabId !== settingsTabId:
      out.push(tabId)
for each tabId in state.ungroupedTabIds:
  if tabId NOT in pinnedTabIds AND tabId !== settingsTabId:
    out.push(tabId)
return out
```

Pure function — no chrome.* calls, no mutation of inputs. Exported for unit-test access.

### §67.5.3 — `syncToChrome` flow

```
1. Set _isSyncing = true (in try/finally for guaranteed reset).
2. state = await _collectWindowState(windowId).
3. targetOrder = _computeTargetStripOrder(state).
4. Push 'pinned' onto skipReasons[] state.pinnedTabIds.size times.
5. If targetOrder.length > 0:
   a. Try chrome.tabs.move(targetOrder, {index: 0, windowId}) as bulk array call.
   b. On success: tabsReordered = targetOrder.length.
   c. On rejection: per-tab fallback loop. Each rejection is bucketed via _classifyError.
6. For each g in state.groups:
   a. liveTabIds = g.tabIds filtered to exclude pinned + settingsTabId.
   b. If liveTabIds.length === 0: continue (empty group skipped silently).
   c. validId = _validateChromeGroupId(g.chromeTabGroupId).
   d. {groupId, created} = _applyTabsToGroup({tabIds: liveTabIds, existingId: validId, title: g.name, color: tjColorToChromeColor(g.color), windowId}).
   e. If created: groupsCreated++; else: groupsUpdated++.
   f. If groupId !== g.chromeTabGroupId: updateGroup(g.id, {chromeTabGroupId: groupId}).
7. Return _buildSummary({windowId, tabsReordered, groupsCreated, groupsUpdated, skipReasons}).
```

Error semantics: each chrome.* call is wrapped in try/catch; a rejection bumps `skipReasons[]` and continues with the next operation. The orchestrator never throws — it always returns a `SyncSummary`. Catastrophic failures (the sync threw before producing a summary) are caught at the SW handler level and rendered as a red toast.

---

## §67.6 R2 risks resolved (from spec §7)

### §67.6.1 — Risk #1: `chrome.tabs.move` array atomicity (C-8)

**Resolution**: Spec §7 risk #1 noted a 30-second SW-REPL probe required at R2. R2 verification:

```
> typeof chrome.tabs.move
'function'
> chrome.tabs.move([1,2,3], {index: 0, windowId: 1}).catch(e => e.message)
```

Per Chrome MV3 documentation (https://developer.chrome.com/docs/extensions/reference/api/tabs#method-move), `chrome.tabs.move` accepts `tabId | number[]`. When given an array, Chrome moves the tabs as a contiguous block in the order specified. R3 implements this as the primary path; per-tab fallback is the rejection-recovery path (covers cases like one tab disappearing mid-move).

**Plan implication**: Task 8 step 5 (`syncToChrome`) implements both paths. The fallback is exercised by the test "Tab gone mid-sync" in `tests/sync-chrome-sync.test.js`.

### §67.6.2 — Risk #2: Settings-tab self-displacement

**Resolution**: `_collectWindowState` queries the active tab in the target window via `chrome.tabs.query({active: true, windowId})` and stores its ID as `settingsTabId`. `_computeTargetStripOrder` filters `settingsTabId` out of the move list. Caveat: this assumes the Settings tab IS the active tab when the user clicks Sync (it is, because the user just clicked a button in the Settings tab). If the user somehow activates a different tab in the same window between rendering and clicking, the wrong tab gets excluded — accepted as a corner case (R3 may add a `chrome.tabs.getCurrent()` from the Settings page itself for greater accuracy, deferred to R3 implementation discretion).

### §67.6.3 — Risk #3: `chrome.tabs.group` empty-tabIds rejection

**Resolution**: `liveTabIds.length === 0` guard in step 6b skips the call entirely for empty groups. Test `tests/sync-chrome-sync.test.js` "Empty TJ group" pins this behavior.

### §67.6.4 — Risk #4: Stale-mapping reconciliation cadence

**Resolution**: Reconcile on every sync only (cheap — `chrome.tabGroups.get` is O(1)). Cold-start reconciliation is NOT implemented for B-041; the next sync will detect any staleness. Deferred enhancement: if chromeTabGroupId staleness causes user-visible weirdness in the wild, add a cold-start `_reconcileChromeMappings` helper in S43.

### §67.6.5 — Risk #5: Chrome-group adoption (out-of-scope confirmation)

**Resolution**: Confirmed out of scope. The orchestrator always creates a fresh Chrome group when `chromeTabGroupId` is null OR stale. If the user has manually created a Chrome group with the same name as a TJ group, sync produces a second separate Chrome group — the user can drag tabs together or delete the orphan. R7 user-manual to document this behavior.

### §67.6.6 — Risk #6: `chrome.tabs.onMoved` storm during sync (`isSyncInFlight()` flag)

**Resolution**: Module-level `_isSyncing` flag in `chrome-sync.js`. `syncToChrome` sets it to `true` in a try/finally, so the flag is guaranteed to reset even on uncaught exceptions. The `chrome.tabs.onMoved` listener at `background/tabs/tab-events.js` early-returns when `isSyncInFlight()` returns true. Plan task 12 wires this.

### §67.6.7 — Risk #7: Settings page lifecycle

**Resolution**: SW continues the sync to completion regardless of Settings-page lifecycle. If Settings is closed mid-sync, the toast cannot be displayed; the next time Settings is opened, no record of the prior sync result is shown. Acceptable for an interim UI per Q7' rationale (Settings is the temporary home; auto-sync will replace this in S43).

---

## §67.7 Fix-scope test enumeration

Per CLAUDE.md "Fix-scope test-assertion enumeration" subsection: B-041 declares contract changes (storage v4→v5, new message contract, new optional group field). Pre-existing tests asserting the v4 contract that need updating:

| `file:line` | Pre-change assertion | Post-change assertion |
|-----|-----|-----|
| `tests/migration-steps.test.js` (KNOWN_VERSION pin) | `assert.equal(KNOWN_VERSION, 4)` | `assert.equal(KNOWN_VERSION, 5)` |
| `tests/migration-fresh-install.test.js` (defaultShape pin) | `assert.equal(defaultShape(PARTITION_META).schemaVersion, 4)` | `assert.equal(... === 5)` |
| `tests/b121-floating-group-render.test.js` (group shape fixtures) | groups lack `chromeTabGroupId` | unchanged (legacy shape still valid; lazy migration) |
| `tests/b007-sub-group-nesting.test.js` (group create/update) | unchanged (not affected by chromeTabGroupId) | unchanged |

R3 build round must update the two migration-pin tests as part of Task 3 (schema bump). The plan's Task 3 step 1 already includes these in the new test file; the existing pins must be located + updated.

---

## §67.8 Checklist results

| # | Check | Status |
|---|-------|--------|
| C-1a | Schema-version governance bump | ✅ §67.2.1 — KNOWN_VERSION + defaultShape + CHANGELOG flush note |
| C-1b | Data-migration strategy | ✅ §67.2.2 — lazy migration (option 2) chosen with rationale |
| C-2 | Message contracts typed | ✅ §67.3 — request + response shapes documented |
| C-3 | Service worker cold-start safe | ✅ no in-memory state assumed; `_collectWindowState` reads fresh from chrome.tabs.query + storage |
| C-4 | ID stability | ✅ `chromeTabGroupId` carries Chrome's group identity; TJ group `id` is the ulid (unchanged); cross-rename / cross-window-move not in scope |
| C-5 | Manifest file refs resolvable | ✅ no new `default_path` / `chrome_url_overrides` entries |
| C-6 | Permission minimization | ✅ `tabGroups` already declared (`manifest.json:6`); no new permission additions |
| C-7 | Allow-list direction | ✅ §67.2.3 — `validateGroupPatch` allow-list extended (not deny-list); JSON-import validator already allow-list |
| C-8 | SW-context feasibility | ✅ §67.6.1 — `chrome.tabs.move` array form documented; per-tab fallback in place |
| C-9 | Empty-state design | ✅ §67.6.3 — empty TJ group skipped silently; pinned-tab counted; toast variants for green/yellow/red |
| C-10 | Off-screen rect feasibility | ✅ N/A — no DOM measurement APIs used |
| C-11 | Popup-lifecycle message ordering | ✅ N/A — Settings page is a full tab, not a popup; no focus-shift before message send |
| C-12 | Manifest declaration runtime-mutability | ✅ N/A — no new manifest declarations |
| C-13 | Chrome event-feedback completeness | ✅ §67.6.6 — `chrome.tabs.onMoved` listener gated via `isSyncInFlight()`; `chrome.tabGroups.onCreated/onUpdated/onRemoved` are not consumed by TJ (no in-memory mirror to maintain since TJ is push-only this sprint) |
| C-14 | Generation-counter content predicate | ✅ N/A — no generation counters introduced; sync is single-shot |

---

## §67.9 Rollback plan (full)

**Scope**: revert v1.36.0 to v1.35.0.

1. **Stop sync writes**: any user that has not yet clicked Sync has no `chromeTabGroupId` field on disk; reverting code is purely a code change for them — zero data impact.
2. **Storage revert** (for users who have synced):
   - On reload, prior code loads `tj:meta.schemaVersion === 5` > `KNOWN_VERSION === 4` → enters READ-ONLY safe mode.
   - User exports JSON via Settings → Data → Export JSON.
   - User clears `tj:*` storage via DevTools.
   - User reloads extension → fresh seed at v4 → imports JSON. Import path's allow-list strips `chromeTabGroupId` automatically.
3. **Chrome side**: any Chrome tab groups created by the sync persist; the user can manually ungroup or rename them. Chrome tab groups are user-recoverable trivially.
4. **Branch revert**: `git revert ac107a2 e15e8e1 240609d` (and the R3 build commits) on `release/v2`. Tag v1.35.1 if a hotfix release is needed.

**Forward fix preferred**: a forward fix (small patch on top of v1.36.0) is preferred over rollback for any non-data-loss issue. Rollback should be reserved for SEV1/SEV2 incidents that cannot be patched in <24h.

---

## §67.10 Open questions for R3

None blocking. R3 may exercise judgement on:
- Whether to call `chrome.tabs.getCurrent()` from the Settings page directly (more accurate `settingsTabId` capture) vs `chrome.tabs.query({active: true, windowId})` from the SW (per current §67.6.2). Either is acceptable; R3 picks one and pins.
- Whether to add a small CSS rule for `.toast[data-variant]` color variants (only if visual contrast is insufficient with the existing `.toast` rule). R3 visual judgement.

---

## §67.11 To be appended at R6 (As-Built)

R6 [solution-architect] appends an `§67.12 As-Built` section recording:
- Deviations from this R2 chapter (if any).
- Final test count delta.
- Final files-changed summary.
- Any new R6 precedents or retro-actions.

The R6 As-Built section is not present at R2 lock; it is filled in after R5 testing passes and before sprint close.

---

## §67.12 As-Built (R6 close — 2026-05-01)

### §67.12.1 Final shipped state

- **Version**: v1.36.0 on `release/v2` (no `main` merge per established branching rule)
- **Test count**: 1,826 → 1,892 PASS / 0 fail / +66 net (+38 R3 build · +25 R4 fix-round · +3 R5 gap-fill)
- **Commits**: 28 total since `release/v2` (1 sprint kickoff · 2 R1+R2 + spec/plan setup · 14 R3 build · 1 R3 progress · 1 R4 progress · 6 R4 fix-round · 1 R4 fix-round close · 2 R5 gap-fill · 1 R5 close)
- **Files changed**: 40 (3 new source modules · 4 new test surfaces · 8 new test files · 11 source files modified · 4 test files modified · ~10 doc files)
- **UAT**: PASS via lean smoke test (product-owner attestation in Edge — same model as S41 close)

### §67.12.2 Deviations from R2 chapter

Three deviations recorded; all surfaced earlier than past sprints, all defensible:

**D-1 — Fix-scope test enumeration miss (R2 §67.7)**.
R2 §67.7 enumerated only the migration-pin tests for the fix-scope contract update. R3 build hit a mid-task discovery: `tests/b091-settings-page.test.js` carries two structural pins on the Settings page —
- AC3 fieldset count (`Array.from(fieldsets).length === 5`)
- AC4 section order (`['Display', 'Layout', 'Groups', 'Theme', 'Data']`)

The new "Chrome Integration" fieldset breaks both. R3 updated both pins to 6 + `[..., 'Chrome Integration', 'Data']`. This is **the correct as-built behavior** (the new section IS the AC1 contract) but R2 §67.7 should have enumerated these tests at lock time. Three sprints in a row now have this enumeration class fire (S36 B-113 D-3, S37 B-117 R3, S42 B-041 R3) — see §67.12.4 retro precedent.

**D-2 — `_classifyError` mock-vs-real Chrome string mismatch surfaced at R4**.
R2 §67.6.1 noted `chrome.tabs.move` array atomicity as a 30-second SW-REPL probe; we picked the API confirmation route via MDN. We did NOT verify that the **rejection-message string contract** is stable. R4 [code-reviewer] M-4 + [security-reviewer] M-1 + [qa-reviewer] root-cause analysis converged on this gap. The R4 fix-round fixed `_classifyError` to bucket on substrings present in BOTH the chrome-mock synthetic strings (`Tab N not found`) AND realistic Chrome rejection strings (`No tab with id: N`), and re-aligned the chrome-mock layer to emit Chrome-realistic strings going forward. New `tests/sync-classify-error.test.js` (+11 tests) pins the predicate set.

**D-3 — Toast architecture refactor surfaced at R4 (ghost timer)**.
R2 §67.4.3 documented `settings/settings-chrome-sync.js` as reusing the existing `#settings-toast` DOM (B-049 / B-093 contract) but did NOT inventory the existing toast-timer ownership (`settings/settings-import-export.js:40` `_toastTimer`). R4 [code-reviewer] H-2 caught that two modules independently `setTimeout` against the shared DOM — a sync's 4s auto-dismiss could fire after an unrelated import/export action.

Resolution at R4 fix-round: extracted a new shared module `settings/settings-toast-timer.js` that owns the single `_toastTimer` reference + provides `showToast`/`clearToastTimer` API. Both `settings-chrome-sync.js` and `settings-import-export.js` now consume the shared helper. The refactor was minimal (3 callsites in import-export per the fix-round agent's report) and shipped clean per CLAUDE.md "Shared File Governance" (multi-surface code consolidation).

This is a NEW shared module that did not exist in the R2 plan — it should be enumerated in any future R2 for similar work that touches the Settings-page toast.

### §67.12.3 New Chrome integration surface — modules summary

| Module | Status | Lines (approx) | Test coverage |
|---|---|---|---|
| `background/sync/color-map.js` | NEW (R3) | 50 | `tests/sync-color-map.test.js` (10 cases) |
| `background/sync/chrome-sync.js` | NEW (R3) — orchestrator + `_isSyncing` flag + `_classifyError` (R4-fixed) | ~310 | `tests/sync-chrome-sync.test.js` (10 integration cases) · `tests/sync-target-order.test.js` (5) · `tests/sync-build-summary.test.js` (3) · `tests/sync-classify-error.test.js` (11) |
| `settings/settings-chrome-sync.js` | NEW (R3) — button + toast wiring | ~100 | `tests/sync-settings-toast.test.js` (10+ cases) |
| `settings/settings-toast-timer.js` | **NEW (R4 fix-round D-3)** — shared singleton timer | ~75 | `tests/sync-toast-timer-shared.test.js` (5 cases) |
| `tests/chrome-mock.js` | EXTENDED (R3 + R4) — `chrome.tabGroups` API + multi-tab move + Chrome-realistic error strings | +120 net | covered by `tests/sync-chrome-mock-extensions.test.js` |

### §67.12.4 R6 retro precedents (for Sprint 42 Gate 7 retrospective + future sprints)

**Precedent #1 — R2 fix-scope test enumeration must include structural pins on shared surfaces.**
The `b091-settings-page.test.js` AC3/AC4 pin update (D-1 above) is the **third occurrence in three sprints** of this enumeration class firing at R3 instead of R2. R2 fix-scope checklists should explicitly call out:
- DOM-structure pins (count of fieldsets, list of section names, etc.)
- ARIA-contract pins
- CSS-token pins
- Selector-coverage pins

CLAUDE.md "Fix-scope test-assertion enumeration" subsection should be amended to explicitly mention "DOM-structure assertions on shared surfaces" alongside the existing CSS-token-invariant precedent. **Action item**: file as backlog candidate for Sprint 43.

**Precedent #2 — Browser-API rejection-string contract should be a discrete C-15 checklist item.**
The `_classifyError` mock-vs-real divergence (D-2 above) shows that R2's existing C-8 (SW-context feasibility) covers API reachability but NOT rejection-string contract stability. A new C-15 entry could capture: "If error classification depends on the rejection's `message` string, R2 MUST verify the actual Chrome message format (via SW REPL probe) and document it in the chapter; mock layers MUST emit the verified format." **Action item**: file as backlog candidate.

**Precedent #3 — Multi-module toast/dialog ownership must be inventoried at R2.**
The ghost-timer race (D-3 above) only surfaced because a SECOND module touched the shared toast DOM. R2 should inventory all existing consumers of any shared DOM/state/timer surface BEFORE adding a new consumer. **Action item**: amend CLAUDE.md "Shared File Governance" subsection to require an explicit "shared-surface consumer inventory" subsection in R2 chapters that touch any element with `#settings-*` / `#sidepanel-*` / etc.

### §67.12.5 Carry-over to S43 candidates

The R4 deferred MEDs/LOWs (recorded in `docs/findings/sprint-42.md`) are the natural S43 polish queue:
- `_isSyncing` re-entrancy refcounter (security L-1) — only matters if a second caller is added (e.g., auto-sync in S43).
- Duplicate-URL last-writer-wins (code M-2 + sec L-2 + qa L-5 converged) — corner case; deferred until B-148 interleave work in S43+.
- Zero-result toast copy ("nothing to sync" instead of `0 tabs · 0 groups`) (qa M-1).
- UAT script keyboard + cold-start enrichment (qa M-5/M-6 — partially closed at R5 gap-fill).
- Concurrent-sync guard (code M-1) — relevant when auto-sync ships.

The most natural S43 anchor is **auto-sync (live mirror)** — the spec §10 explicitly identifies this as the next iteration. The snapshot architecture from B-041 generalizes cleanly: every TJ mutation hooks the same `syncToChrome` orchestrator with debounce. The new `_isSyncing` flag, the persisted `chromeTabGroupId` mapping, the toast surface, the color map — all reusable.

### §67.12.6 Rollback plan validated

§67.2.4 rollback steps were not exercised in production but the architecture supports the documented procedure:
- v5 → v4 revert path: stored `schemaVersion === 5` triggers READ-ONLY safe mode under v4 code; user exports JSON; clears storage; re-imports.
- Chrome-side: any v1.36.0-created tab groups survive the rollback as orphaned Chrome tab groups; user trivially ungroups them.
- v1.35.x → v1.36.0 forward upgrade: zero data action required; `tj:groups` records lazy-stamp `chromeTabGroupId` on first sync.
