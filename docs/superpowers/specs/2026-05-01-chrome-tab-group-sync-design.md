# Chrome tab group sync — snapshot push (Sprint 42)

**Status:** Brainstorm complete · awaiting user spec review · pre-R0/R1
**Anchor item:** Closes B-041 (P2/L pre-S33 placeholder for Chrome tab-group integration)
**Tier:** Tier 2 — Full M
**Author:** [solution-architect] (brainstorm with product owner, 2026-05-01)

## 1 · Goal

A single user action — "Sync this window to Chrome" in the Settings page — makes Chrome's tab strip in the user's current window match TJ's view of that window:

- TJ groups become Chrome tab groups (title from TJ group name, color via static palette mapping).
- Tabs are reordered in the strip to match TJ's order.
- Ungrouped Open Tabs land in the strip in their TJ order, but stay ungrouped in Chrome.

The push is a snapshot. No continuous mirroring this sprint.

## 2 · Locked design decisions (brainstorm log)

| # | Decision | Choice |
|---|----------|--------|
| Q1 | Sync direction | TJ → Chrome only |
| Q2 | Trigger model | Snapshot (explicit user action), not live mirror |
| Q3 | Push contents & window scope | Current window only · live tabs only · no opening unclaimed bookmarks |
| Q4 | Re-push & mapping | Stateful update-in-place; persist `chromeTabGroupId` per TJ group; TJ wins on conflict |
| Q5 | Tab strip ordering | Match TJ order (push reorders the strip) |
| Q6 | Color mapping | Static table |
| Q7' | Trigger location | Settings page only (no main-panel UI changes — keeps S43 auto-sync work clean) |
| Q8 | Window targeting | The window the Settings tab is in |
| Q9 | Failure handling | Best-effort with summary toast |
| Reframe | Strip coverage | Full window strip — groups + ungrouped Open Tabs (not just groups) |

## 3 · Architecture

### 3.1 New modules

| File | Purpose |
|------|---------|
| `background/sync/chrome-sync.js` | Push orchestrator. Single public entry: `syncToChrome(windowId): Promise<SyncSummary>`. |
| `background/sync/color-map.js` | Pure function `tjColorToChromeColor(tjColor): ChromeTabGroupColor`. Static table per Q6. |

### 3.2 New manifest permission

`tabGroups`. Required for `chrome.tabGroups.update/create/get`. No lower-scoped alternative — `tabs` permission alone does not include tab-group APIs. R4 [security-reviewer] gate per C-6.

### 3.3 New storage field

`tj:groups` records gain optional `chromeTabGroupId: number | null`.

- `KNOWN_VERSION` 4 → 5 (per C-1a governance).
- `defaultShape(PARTITION_META).schemaVersion = 5`.
- New `MIGRATION_STEPS` v4 → v5 entry: no-op step (lazy migration per C-1b — validators tolerate missing field; writes always emit).
- `CHANGELOG.md` ships the SW module-cache flush note (extension toggle OFF → ON after update).

### 3.4 New message contract

```
MSG_SYNC_TO_CHROME
  request:  { windowId: number }
  response: { ok: boolean, summary: SyncSummary } | { ok: false, error: string }
```

`SyncSummary` shape:

```
{
  windowId: number,
  tabsReordered: number,
  groupsCreated: number,
  groupsUpdated: number,
  skipped: Array<{ reason: 'pinned' | 'tab-gone' | 'permission' | 'unknown', count: number }>
}
```

### 3.5 Settings-page UI

New section "Chrome Integration":

- **Heading + brief description.**
- **Button:** "Sync this window to Chrome" — captures `chrome.windows.getCurrent().id` at click time, sends `MSG_SYNC_TO_CHROME`.
- **Result toast** using the Settings page's existing toast (`#settings-toast` — B-049 contract: one toast at a time, 4s auto-dismiss, manual × dismiss; same pattern as Import/Export at `settings/settings-import-export.js`):
  - Success (no skipped): "Synced · 12 tabs · 3 groups"
  - Partial (skipped > 0): "Synced · 11 tabs · 3 groups · 2 skipped" with a "View details" expander listing each skip reason and count (e.g., "1 pinned tab skipped · 1 tab closed mid-sync"). Yellow accent.
  - Failed: "Sync failed · `<reason>`." Red accent.

  The "View details" expander is a new variant on the existing toast — R3 confirms whether it lives inside the toast component or as an adjacent inline panel.

### 3.6 No changes to sidepanel, newtab, popup

Per Q7' rationale: the Settings page is a temporary home for the manual trigger. Putting it in the main panels would create UI we'd have to revert when S43 introduces auto-sync.

## 4 · Data flow

1. User clicks Sync in Settings page.
2. Settings page calls `chrome.windows.getCurrent({populate: false})` → `windowId`.
3. Settings → SW: `chrome.runtime.sendMessage({ type: MSG_SYNC_TO_CHROME, windowId })`.
4. SW handler invokes `syncToChrome(windowId)`. Inside:
   1. **Read TJ state for this window**: groups (in TJ order), claims, floating members, ungrouped Open Tabs. Reuse existing helpers (`getGroups`, `claimsMirror`, `buildFloatingMembers`).
   2. **Compute target strip order** (filtered to live tabs in this window):
      - For each TJ group in TJ order, append its live tabs in TJ order (claimed bookmarks + floating members).
      - Append ungrouped Open Tabs in TJ order at the end.
      - Skip pinned tabs (Chrome rule — cannot belong to tab groups).
      - Skip empty TJ groups (no live tabs in this window).
      - Exclude the Settings tab itself from the move (see §7 risk).
   3. **Reorder strip**: single `chrome.tabs.move(tabIdsArray, { index: 0, windowId })` call. (R2 to verify single-call atomicity per C-8 / SW REPL probe.)
   4. **Apply each TJ group with ≥1 live tab**:
      - Resolve `chromeTabGroupId` from storage. If set, verify via `chrome.tabGroups.get` — if it 404s, clear stored ID and treat as new.
      - `chrome.tabs.group({ tabIds, groupId: existingId | undefined, createProperties: { windowId } })` → returns groupId.
      - `chrome.tabGroups.update(groupId, { title: tjGroup.name, color: tjColorToChromeColor(tjGroup.color) })`.
      - If newly created, persist `chromeTabGroupId` back to the TJ group record.
   5. **Build summary** (see §3.4 shape).
5. SW response → Settings page → toast.

## 5 · Color mapping table (Q6-A)

| TJ color | Chrome color |
|----------|--------------|
| blue | blue |
| purple | purple |
| teal | cyan |
| red | red |
| orange | orange |
| pink | pink |
| indigo | blue |
| yellow | yellow |
| slate | grey |

Implemented as a frozen lookup object in `background/sync/color-map.js`. Default fallback for unknown input: `grey` (defensive — should never trigger because TJ validates against `GROUP_COLORS`).

## 6 · Error handling (Q9-A)

Each `chrome.*` call wrapped in try/catch. Failures are bucketed into `summary.skipped[]` by reason:

- `pinned` — pre-filtered before `chrome.tabs.move`; counted at filter time.
- `tab-gone` — `chrome.tabs.move` or `chrome.tabs.group` rejects because tab no longer exists.
- `permission` — `chrome.tabGroups.*` rejects with permission error (theoretically impossible after manifest update; defensive).
- `unknown` — anything else.

Note: the `group-gone` path (stored `chromeTabGroupId` no longer maps to a real Chrome group) is a recovery, not a skip — the spec clears the stale mapping and creates a fresh group transparently. It does not appear in `summary.skipped[]`. The `SyncSummary.skipped` reason union in §3.4 reflects this: `pinned | tab-gone | permission | unknown`.

Toast color logic:
- `summary.skipped.length === 0` → green
- `summary.skipped.length > 0` → yellow, "View details" link
- Catastrophic failure (sync threw before producing summary) → red

## 7 · Risks · R2 must resolve

1. **`chrome.tabs.move` array-atomicity (C-8)** — confirm at R2 via 30-second SW REPL probe whether passing a full ordered tab-id array to one `chrome.tabs.move` call works as intended in MV3, or whether per-tab moves are required. Spec assumes single-call works; fallback is per-tab.
2. **Settings-tab self-displacement** — the Settings tab is itself in the target window. If we don't exclude it, the reorder will move it. R2 confirms exclusion: filter out the Settings tab ID from the move list before issuing.
3. **`chrome.tabs.group` empty-tabIds rejection** — API rejects empty arrays. Spec pre-filters empty TJ groups; R2 documents the explicit guard with a unit test.
4. **Stale-mapping reconciliation cadence** — current spec verifies on every sync (cheap). R2 picks whether to also reconcile on SW cold start (proactive) or leave it lazy. Decision recorded in R2 chapter.
5. **Existing-Chrome-group adoption (out-of-scope confirmation)** — we always create new Chrome tab groups; we do NOT detect a pre-existing same-named Chrome group and adopt it. R2 confirms this is the right call (avoids ambiguous adoption logic) and documents the user-visible behavior: if the user manually creates a Chrome group with the same name as a TJ group, sync produces a second, separate Chrome group.
6. **chrome.tabs.onMoved storm during sync** — our reorder triggers `chrome.tabs.onMoved` events. The B-134 / B-136 listener will see them and could try to update floating-group state. R2 either (a) introduces a "syncing" flag that suppresses the listener for the duration, or (b) confirms the listener is idempotent and safe to fire. Decision recorded.
7. **Settings page lifecycle** — Settings is a full-page tab (B-091). If the user closes Settings mid-sync, the toast can't display. R2 confirms: SW continues the sync to completion regardless; the next time Settings is reopened, no record of the prior sync result is shown (toast is ephemeral). Acceptable for an interim UI.

## 8 · Testing

### 8.1 Unit tests

- `tjColorToChromeColor` — 9 inputs map to expected Chrome colors; unknown input returns `grey`.
- `_computeTargetStripOrder` — given a mock TJ state (2 groups + 3 ungrouped + 1 pinned + 1 group with no live tabs), returns the expected ordered tab-ID list with pinned tabs excluded and empty groups dropped.
- `_buildSummary` — given operation results, returns a correctly-shaped `SyncSummary`.

### 8.2 Integration tests (chrome-mock)

- **Happy path**: 2 groups (3 + 2 live tabs) + 4 ungrouped tabs in current window → 1 strip-reorder call, 2 group calls, 2 tabGroups.update calls, summary `{ tabsReordered: 9, groupsCreated: 2, groupsUpdated: 0, skipped: [] }`.
- **Re-sync (in-place update)**: same state but with `chromeTabGroupId` already persisted. Expect 0 creates, 2 updates, no duplicate Chrome groups.
- **Stale mapping**: stored `chromeTabGroupId` 404s in `chrome.tabGroups.get`. Expect mapping cleared, fresh group created, mapping re-persisted.
- **Pinned tab in TJ group**: verify pre-filter; pinned tab excluded from move and group; `summary.skipped` includes `{ reason: 'pinned', count: 1 }`.
- **Tab gone mid-sync**: `chrome.tabs.move` rejects for one tab. Verify other tabs still moved; `summary.skipped` includes `{ reason: 'tab-gone', count: 1 }`.
- **Empty TJ group**: TJ group has 0 live tabs in current window. Verify skipped silently; not counted in `summary.skipped`.
- **Multi-window safety**: TJ group has live tabs in 2 windows. Sync targets window A only. Verify only window A's tabs are touched; window B is untouched and tabs in window B are not added to the Chrome group.
- **SW cold-start sync**: simulate SW restart between message receive and handler invocation; verify in-memory state rehydrates and sync produces correct results.

### 8.3 UAT (Edge browser)

- Fresh first sync — verify Chrome strip + groups match TJ.
- Re-sync after TJ group rename — verify Chrome group renamed (TJ wins).
- Re-sync after TJ group color change — verify Chrome color updated.
- Re-sync after user manually renames Chrome group — verify TJ wins (overwrites manual rename).
- Re-sync after user manually deletes Chrome group — verify fresh group created, mapping re-persisted.
- Sync with one pinned tab in a TJ group — verify skipped, toast shows count.
- Sync with multi-window state — verify only the Settings-tab window is affected.
- Permission install prompt UX — verify the `tabGroups` permission update path on extension reload.

## 9 · Tier rationale (Tier 2 — Full M)

- **New permission** (`tabGroups`) — security review required.
- **New storage field with schema bump** (v4 → v5) — governance + data migration both required.
- **New module + new message contract** — full architecture review required.
- **Settings UI changes** — minor but real.
- **No novel architecture, no spike-class unknowns** — does not require Tier 3 (Spike-First).

R0 spike is **not** required. The spec already addresses the C-8 verification (single-vs-per-tab move) as a 30-second R2 task, not a multi-day spike.

## 10 · Out of scope · deferred to S43+

- **Auto-sync / live mirror** (Q2-A) — likely S43 anchor item once snapshot ships and we know how Chrome behaves under repeated mutation.
- **Chrome → TJ pull** (Q1-B/C, full bidirectional) — S44+.
- **Multi-window sync / window picker / "sync all windows"** (Q8-C/D) — small follow-on.
- **Per-group opt-in toggles** (Q2-D) — only meaningful once auto-sync exists.
- **Sync status badges on TJ group headers** (Q7-D variant) — only meaningful once we track "TJ state at last push" for divergence detection.
- **Color-mapping override UI** (Q6-C) — yields little value while only 2 of 9 mappings are inexact.
- **"Open all unclaimed bookmarks first then sync"** (Q3-D) — separate user-action ("Open all in group"), not part of sync.
- **Chrome-group adoption** (matching same-named pre-existing Chrome groups) — see §7 risk 5.
- **B-148** (interleave floating tabs with saved bookmarks in unified group order) — already separately backlogged from S41 retro.

## 11 · Acceptance criteria preview (formalized at R1)

1. New manifest permission `tabGroups` declared and justified.
2. New storage schema v5 with lazy migration; CHANGELOG ships SW flush note.
3. Settings page exposes "Chrome Integration" section with Sync button and result toast.
4. Sync action targets the Settings tab's window, reorders strip in TJ order, creates/updates Chrome tab groups for each TJ group with live tabs.
5. Color mapping per the §5 table.
6. Stateful `chromeTabGroupId` mapping persists; re-sync updates in place; stale mappings are detected and replaced.
7. Pinned tabs and empty TJ groups skipped per §6.
8. Best-effort failure handling per §6; summary toast shape per §3.4.
9. No changes to sidepanel, newtab, or popup UI.
10. Full unit + integration coverage per §8; UAT per §8.3.

**Destructive-action confirmation (DoR item 7)**: N/A — sync is a one-way push from TJ state. No TJ data is destroyed; existing Chrome tab groups in the target window may be modified or replaced (creating a new Chrome group for the same TJ group name), but Chrome groups are user-recoverable trivially (re-grouping is one drag). No destructive-action confirmation dialog required for this anchor item.

## 12 · References

- `CLAUDE.md` — project pipeline, gates, R2 correctness checklist (C-1a, C-1b, C-2 through C-14)
- `docs/SOLUTION_DESIGN.md` — chapter index (chapter for sync will be authored at R6 close)
- `docs/BACKLOG.md` — B-041 anchor placeholder
- Prior spec `docs/superpowers/specs/2026-03-13-chrome-tab-groups-sync-design.md` — historical record from earlier design phase; supersedes/replaces with this spec
