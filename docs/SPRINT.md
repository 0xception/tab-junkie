# Current Sprint

*Sprint 13 — Open Tabs section + selection polish. Closed 2026-04-17.*

---

## Active Items

*(none — all items done; awaiting R6/R7 close)*

---

## Completed This Sprint

### [B-055] Open Tabs section: render live-only ungrouped tabs in the sidepanel
- **Tier**: Full (M)
- **Status**: R1 ✅ → R2 ✅ → R3 ✅ → R4 ✅ → R5 ✅ → R6 (pending) → DONE
- **Feature Context**: New pinned Open Tabs section at bottom of sidepanel for live-only ungrouped tabs. Extends `MSG_LIST_ITEMS` with `openTabs[]` array (no new message constant). Integrates with B-021 filter, B-024 multi-select, B-026 context menu. Unblocks B-033 and B-022's search-results section. 17 ACs, all met.
- **Files Changed**: `shared/messages.js`, `background/tabs/open-tabs.js` (new), `background/tabs/live-tab-index.js`, `background/tabs/tab-events.js`, `background/messages/storage-handlers.js`, `background/storage/items.js`, `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`, `tests/enriched-list-items.test.js`, `tests/live-tab-index.test.js`, `tests/b010-live-state.test.js`, `tests/b024-multi-select.test.js`, `tests/navigate-to-item.test.js`
- **UAT Result**: PASS
  - Block 1 (basics): 7/7 PASS
  - Block 2 (advanced): 3/3 PASS + 2 SKIPPED (safe-mode AC14 — requires manual storage corruption to test; code path verified by review instead)
  - Block 3 (mixed selection + filter): 6/6 PASS
- **Notes**: Interactive UAT surfaced two follow-up items added to the backlog: **B-056** (visually distinguish unsavable tabs — restricted schemes + URL duplicates) and **B-057** (SPIKE: URL-scheme allowlist + duplicate-URL policy review). Both scheduled for Sprint 14. Also revealed the "Couldn't save N tabs — check URL scheme or duplicates" toast was insufficiently diagnostic; fixed in-sprint with categorized toast (`"…(X already saved, Y restricted URL, Z other error)"`).

### [B-028] Selection context menu
- **Tier**: Fast Track (S)
- **Status**: R1 ✅ → R3 ✅ → R4 ✅ → DONE
- **Feature Context**: Right-click while multi-selection active opens a selection-aware context menu (Move to group, Close tabs, Remove). Reuses B-026 menu infrastructure; dispatch branches by `_selection.size >= 2`. Extracted bulk-bar handlers into shared `_bulkMoveToGroup` / `_bulkClose` / `_bulkRemove` helpers so bar + menu share a single code path.
- **Files Changed**: `sidepanel/sidepanel.js`, `tests/b028-selection-context-menu.test.js` (new, 12 tests)
- **UAT Result**: PASS (verified as part of B-055 Block 3 step 16)

### [B-047] In-panel keyboard shortcuts (Ctrl+A / Escape)
- **Tier**: Fast Track (XS)
- **Status**: R1 ✅ → R3 ✅ (verify-only) → R4 ✅ → DONE
- **Feature Context**: Audited B-024's existing keydown handlers. All 3 ACs already met (Ctrl/Cmd+A on visible items, Escape clears selection, text-input guard via tagName block-list + filter-input `stopPropagation`). Zero production code changes. Added 12 regression tests; R4 remediation added 5 more covering the open-tab mixed-row path and dialog-open guard.
- **Files Changed**: `tests/b024-multi-select.test.js` (+17 tests total)
- **UAT Result**: PASS (verified as part of B-055 Block 3 keyboard interactions)

### [B-051] Sort-order normalisation & selection pruning
- **Tier**: Fast Track (S)
- **Status**: R1 ✅ → R3 ✅ → R4 ✅ → DONE
- **Feature Context**: `normaliseGroupSortOrders` runs after every create/delete/bulk-create/bulk-update. Sequential 0..N−1 per bucket, idempotent fast-path skips writes when already normalised. `pruneSelection` helper in new `shared/selection.js` wired into sidepanel bulk-action path per AC3.
- **Files Changed**: `background/storage/items.js`, `shared/selection.js` (new), `sidepanel/sidepanel.js`, `tests/b051-normalisation.test.js` (new, 18 tests), `tests/b005-bulk-create.test.js`
- **UAT Result**: PASS (implicitly verified by B-055 Block 2 step 9 promote flow — which exercises the bulk-update + normalisation path)

---

## Sprint Retrospective — Sprint 13

### Velocity
- Planned: 4 items / M + S + XS + S = ~7 points
- Completed: 4 items / ~7 points
- Carried over: 0
- New items created mid-sprint: 2 (B-056, B-057 — both scheduled for Sprint 14)

### What Went Well
- Parallel pipeline: B-055 R3 alone first (to land the atomic prefix-key refactor), then Fast Track trio in parallel worked cleanly despite all three Fast Tracks touching `sidepanel.js` concurrently — the Edit tool's mid-flight modification detection prevented lost writes.
- 9-agent R4 R4 pass produced actionable findings. Cross-agent consensus on B-055 H-1 (safe-mode write-gate) strengthened confidence. Only 2 CRITICAL-adjacent findings (both qa) and both caught a bug that code/security review missed.
- UAT surfaced a real product-design question (unsavable tabs in Open Tabs section) that led to adding a SPIKE item (B-057) — the agile pipeline correctly produces new backlog from UAT discoveries.

### What to Improve
- The generic "check URL scheme or duplicates" toast in `_bulkMoveToGroup` was too vague for UAT diagnosis — had to add categorised toast mid-UAT. Prior sprint [qa-reviewer] should have flagged this since it's the same pattern as the B-055 context-menu single-tab path (which correctly distinguishes error types).
- Cross-item code attribution was noisy: [code-reviewer] B-028 flagged findings that belonged to B-055's `_openOpenTabContextMenu`. Future R4 prompts should clarify each reviewer's file-and-function scope more tightly.
- Safe-mode testing required skipping 2/18 UAT steps. Consider adding a developer-only "force safe mode" toggle (hidden behind a URL param or devtools command) for future UAT rounds.

### Action Items for Next Sprint
- [ ] When dispatching R4 reviewers, include a mapping from each item to its specific function/section markers in shared files like `sidepanel.js` to reduce cross-attribution.
- [ ] Audit other bulk-action toasts for the same pattern: any Promise.allSettled path where failures are uncategorised should be updated to report the dominant failure reason.
- [ ] Consider a dev-only safe-mode toggle (task backlog candidate) or document how to force safe mode in the UAT playbook.
