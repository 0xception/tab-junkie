# Current Sprint

*Sprint 6 — Sidepanel Shell. B-054 (Full L) — the UI foundation. Kicked off 2026-04-15.*

---

## Active Items

### [B-054] Sidepanel shell: item/group rendering + live states + broadcasts
- **Tier**: Full (L)
- **Status**: ✅ R1 · ✅ R2 → R3 Build in progress
- **Assigned To**: [frontend-engineer] (R3)
- **Blockers**: none (all data-layer deps satisfied)
- **Feature Context**:
  - Replace stub `sidepanel/sidepanel.html` with real UI
  - New `sidepanel/sidepanel.js` + `sidepanel/sidepanel.css`
  - Fetches data via MSG_LIST_ITEMS, MSG_LIST_GROUPS, MSG_GET_PREFERENCES
  - Renders items organized by groups with live/active/audible/drifted indicators
  - Group headers with collapse/expand, color chip, item count
  - Click item → MSG_NAVIGATE_TO_ITEM
  - Listens for MSG_STATE_CHANGED → re-fetches affected scope
  - Empty state, loading skeleton, theme support (light/dark/system)
  - First paint < 200ms on 500-item collection
- **Handoff Notes**: This is the first real UI work. All 18 message types are ready in the SW. The sidepanel communicates exclusively via chrome.runtime.sendMessage — no direct storage imports (ESLint enforces this). Theme system uses tj:prefs.theme. Item visual states come from the `liveStates` + `driftRecords` fields in the MSG_LIST_ITEMS response.

---

## Execution Plan

**B-054 (Full L):** R1 → R2 → R3 → R4 (3 reviewers) → R4 fix → R5 → R6

This is the first item where **UAT must NOT be skipped** (Sprint 2 retro action item). The sidepanel must be visually verified in Chrome.

---

## Gate 6: ✅ READY

## Completed This Sprint

*(none yet)*
