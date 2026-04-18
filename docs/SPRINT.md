# Current Sprint

*Sprint 14 — Policy spike + multi-window polish. Closed 2026-04-17.*

---

## Active Items

*(none — all items done; awaiting R6/R7 close)*

---

## Completed This Sprint

### [B-057] SPIKE: URL-scheme allowlist + duplicate-URL policy review ✅ DONE
- **Tier**: Spike-First (XL)
- **Status**: R0 ✅ → DONE
- **Spike Output**: `docs/spikes/B-057-url-policy-spike.md` (277 lines)
- **Decisions accepted**: (1) Expand allowlist to include `chrome://`, `edge://`, `chrome-extension://`, `about:`, `view-source:`; keep hard-reject for `javascript:`/`data:`. (2) Remove `ERR_DUPLICATE_URL` reject from `MSG_PROMOTE_TAB`; replace with soft-warn UI.
- **Spin-off items created** (Sprint 15): B-058 (S), B-059 (M), B-060 (S), B-061 (XS, replaces B-056).
- **Retired**: B-056 → icebox.

### [B-014] Multi-window awareness & window badge ✅ DONE
- **Tier**: Full (M)
- **Status**: R1 ✅ → R2 ✅ → R3 ✅ → R4 ✅ → R5 ✅ → R6 (pending) → DONE
- **Feature Context**: Session-ordinal window numbering (W1, W2, …) mapped from raw Chromium windowIds; gap-preserving on close. Window badge on saved-item + open-tab rows for tabs in non-current-window. Window filter row (absorbed B-034) — `role="tablist"`, keyboard-navigable (Arrow/Home/End/Enter/Space). Extends `MSG_LIST_ITEMS` with `windowMap`; new `SCOPE.WINDOW_MAP` broadcast; `tabs.onAttached` handler added for cross-window drag.
- **Files Changed**: `shared/messages.js`, `shared/scopes.js` (new, SSOT for broadcast scopes), `background/broadcast.js`, `background/tabs/window-ordinals.js` (new, 154 lines), `background/tabs/index.js`, `background/tabs/tab-claims.js`, `background/tabs/tab-events.js`, `background/messages/storage-handlers.js`, `sidepanel/sidepanel.js`, `sidepanel/sidepanel.html`, `sidepanel/sidepanel.css`, `tests/window-ordinals.test.js` (new, 12 tests), `tests/b014-multi-window.test.js` (new, 25 tests), `tests/b010-live-state.test.js`, `tests/enriched-list-items.test.js`, `tests/chrome-mock.js`.
- **UAT Result**: PASS (12/14 steps; 2 skipped — 3+ window edge cases AC14 gap-preservation not exercised, but logic is covered by `tests/window-ordinals.test.js`)
- **In-pipeline UAT fixes**:
  - **UAT-D1**: Window filter chip `:focus-visible` was invisible in dark mode (`--accent-subtle` = `#1e293b`, too close to panel background). Switched to explicit `outline: 2px solid var(--accent)`.
  - **UAT-D2**: Dragging a tab between windows while a window filter was active left the row visible in the wrong filter view. `refetchAndPatchLiveState` and the `SCOPE.WINDOW_MAP` broadcast handler both patch `data-window-id` but never re-ran `applyFilter()`. Added `if (_filterQuery || _activeWindowFilter !== null) applyFilter();` to both paths.
- **Deferred follow-ups**: Task #7 (B-049 error-toast UAT) still open from Sprint 12.

---

## Sprint Retrospective — Sprint 14

### Velocity
- Planned: 2 items / XL (spike, research-only) + M (B-014)
- Completed: 2 items / same
- Carried over: 0
- Spin-offs: 4 new items (B-058, B-059, B-060, B-061); 1 retired (B-056 → icebox)

### What Went Well
- Spike-First pipeline worked as designed: B-057 produced concrete decision memos, proposed 4 tightly-scoped follow-on items, and correctly recommended deferring implementation. No wasted effort.
- B-014 R2 architecture was thorough enough that R3 implementation landed on the first pass — all 18 ACs addressed, no tier upgrade required mid-sprint.
- Interactive UAT caught two real defects (focus-visible invisibility, filter-not-reapplied-on-broadcast) that neither code-review nor qa-review surfaced.
- `shared/scopes.js` refactor (part of B-014 M-1 fix) creates a SSOT for broadcast scopes that future sprints can leverage to eliminate bare-string comparisons throughout the sidepanel.

### What to Improve
- Dark-mode `:focus-visible` using `--accent-subtle` (a dark neutral) was an anti-pattern that slipped through multiple prior sprints — there are other elements using the same pattern per `grep box-shadow var(--accent-subtle)`. Consider a cross-sprint audit.
- Window-filter-active-during-broadcast path was missed by two reviewers because the broken code paths (`refetchAndPatchLiveState`, `SCOPE.WINDOW_MAP` handler) didn't TOUCH the filter at all — reviewers looked for broken filter code, not missing filter invocations. For future R4 review prompts, consider including "where does filter state need to be re-applied" as an explicit checklist item.
- B-014's shared file changes (`shared/scopes.js` is a new cross-boundary module) landed without being flagged in R4 under Shared File Governance — worth an R4 prompt update.

### Action Items for Next Sprint
- [ ] Audit `sidepanel/sidepanel.css` for other `:focus-visible` rules using `--accent-subtle` in dark mode; replace with explicit `outline: solid`.
- [ ] Sweep sidepanel broadcast handler `scope === '…'` bare-string comparisons to use `SCOPE.*` constants from `shared/scopes.js`.
- [ ] Sprint 15 candidate scope: B-058 (S) + B-059 (M) + one more small item (B-060 or other). Revisit during Sprint 15 planning.
