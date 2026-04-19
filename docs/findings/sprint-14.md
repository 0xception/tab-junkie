# Sprint 14 — R4 Findings (Deduplicated)

> Items reviewed: B-014 (Full M, 3 reviewers). B-057 is research-only (no code); no R4.
>
> Cross-reviewer convergence: [code-reviewer] H-1 and [qa-reviewer] M-1 are the same `Number(raw) || null` bug. [qa-reviewer] H-1 (window-filter loss after renderAll) converges with [qa-reviewer] M-3 (same root cause on the fallback path). Merged below.

## B-014 — Multi-window awareness & window badge

### CRITICAL
_None_

### HIGH (must fix before R5)

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| H-1 | `sidepanel/sidepanel.js:1982` | **`Number(raw) \|\| null` silently maps windowId=0 to "All windows"**: `Number("0") === 0` is falsy → `0 \|\| null → null`. A real windowId=0 would behave as if the All chip were active. Latent today (registerWindow rejects negative but not 0), but semantically unsafe. | `_activeWindowFilter = raw === 'all' ? null : (Number.isFinite(Number(raw)) ? Number(raw) : null);` |
| H-2 | `sidepanel/sidepanel.js:1042` + all `renderAll` call sites (406, 1684, 2406) | **Window filter silently lost after broadcast-driven renderAll**: `renderAll` only re-applies `applyFilter()` when `_filterQuery` is truthy. If a user has a window chip active but no text query, any `scope: items \| groups` broadcast rebuilds the DOM with all rows visible; the chip shows selected but no rows are filtered. Silent state mismatch. | Change line 1042 from `if (_filterQuery) applyFilter()` to `if (_filterQuery \|\| _activeWindowFilter !== null) applyFilter()`. Covers all call sites. |
| H-3 | `background/tabs/tab-events.js` | **AC13 gap — `tabs.onDetached` / `tabs.onAttached` not registered**: Chrome fires these events (NOT `onUpdated`) when a user drags a tab between windows. `LiveTabIndex.windowId` never updates → `liveStates[id].windowId` is wrong → badge stays stale until the next full reload. The badge-update infrastructure (`_patchItemWindowBadge`, `_applyWindowMapToUI`, `SCOPE.WINDOW_MAP`) is complete but never triggered for this case. | Register `onDetached` → mark transitional; register `onAttached` → `updateTabEntry(tabId, {windowId: newWindowId, index: newPosition})` + broadcast `SCOPE.LIVE_STATE` and `SCOPE.WINDOW_MAP` (latter last so sidepanel re-fetches with fresh windowId before patching badges). |

### MEDIUM (selected fixes this sprint)

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| M-1 | `sidepanel/sidepanel.js:2378` + broadcast.js | Scope comparison uses bare string `'windowMap'` instead of imported `SCOPE.WINDOW_MAP` constant. Hidden coupling; silent breakage on rename. | Export `SCOPE` from `background/broadcast.js` (or a thin `shared/scopes.js`), import into sidepanel, compare against constant. |
| M-2 | `background/tabs/window-ordinals.js:85–87` | Bootstrap guard comment is misleading — suggests `getAll()` re-captures post-bootstrap, but it doesn't. Race window exists where a window opened during the getAll await gets interleaved ordinals. | Correct the comment to describe actual best-effort behaviour (security reviewer L-1 also flags this as a defense-in-depth concern). |
| M-3 | `sidepanel/sidepanel.js:2378–2391` (windowMap broadcast handler) | Handler calls `_setCachedOpenTabs` + `_applyWindowMapToUI` but NOT `patchOpenTabsSection`. DOM `data-window-id` attributes can be stale when a tab moves between windows and the windowMap broadcast arrives before the liveState broadcast. Badge reads stale attribute → brief UX flicker. | In the `windowMap` scope handler, call `patchOpenTabsSection(_cachedOpenTabs)` after `_setCachedOpenTabs` and BEFORE `_applyWindowMapToUI()`. |
| M-4 | `background/tabs/tab-claims.js:204` | `buildLiveStates` JSDoc return-type annotation predates B-014 — doesn't mention `tabId` or `windowId`. Future maintainers will be misled. | Widen the `@returns` typedef to include the optional `tabId?: number` + `windowId?: number`. |

### LOW (defer)

| # | File:line | Finding |
|---|-----------|---------|
| L-1 | `background/tabs/tab-events.js:297` | `registerWindow` returns existing ordinal on idempotent replay — broadcast still fires. Wastes one IPC round-trip per duplicate `onCreated`. Benign. |
| L-2 | `sidepanel/sidepanel.css` | `.item-window-badge` and `.open-tab-window-badge` are 100% duplicate CSS today — intentional for future divergence, note for next CSS pass. |
| L-3 | `background/tabs/window-ordinals.js:150–154` | Test hatch `__resetWindowOrdinals` redundantly resets `bootstrapping=false`. Harmless. |
| L-4 | `sidepanel/sidepanel.js` | `_refreshPanelWindowId` called up to 2-3× during cold open — fire-and-forget pattern; idempotent; no dedupe. |
| L-5 | `sidepanel/sidepanel.js:696–703` | `clearFilter()` doesn't reset `_activeWindowFilter`. Arguably correct (orthogonal filters) but UX-ambiguous. Product review. |
| L-6 (security) | `window-ordinals.js` | Same as M-2 — first-seen-order invariant not strictly held during bootstrap race. Defense-in-depth only; no security impact. |

### ACs requiring UAT

| AC | UAT check |
|----|-----------|
| AC5 | First-paint race: open panel with 2 windows, observe any flash of badges on same-window rows before suppression kicks in |
| AC13 | Tab drag between windows → badge updates without full re-render (blocked until H-3 fix lands) |
| AC16 | B-035 standalone-window cross-panel consistency — SKIP (B-035 not yet shipped) |
| AC18 | Out-of-scope exclusions — confirm cross-device sync / named windows / multi-profile code paths do not exist |
| Visual | Double-digit ordinals (W10+) render without wrapping; filter row layout in narrow panel |
| Layout shift | Opening 2nd window mid-session — confirm no focus jump / scroll jump when filter row appears |

## Rollup — items to fix before R5

- **CRITICAL: 0**
- **HIGH (must fix): 3** (B-014 H-1, H-2, H-3)
- **MEDIUM (selected): 4** (M-1, M-2, M-3, M-4)

All LOW findings deferred to future sprints.


---

