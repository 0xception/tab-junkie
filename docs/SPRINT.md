# Current Sprint

*Sprint 35 — Bug-fix queue + tint-brightness polish. Planned 2026-04-26. **Awaiting product-owner approval to kick off R1.***

Five-item bug-fix-and-polish sprint targeting v1.29.0. Clears the entire P2 carryover queue (B-100, B-102, B-103, B-105) plus a P3 polish item (B-106 group-header brightness bump). Ships to `release/v2`. No main merge — that remains a manual product-owner task.

---

## Gate 6 — Sprint Readiness (verified 2026-04-26)

| # | Check | Status |
|---|-------|--------|
| 1 | All sprint items have passed Definition of Ready | ⏳ — all 5 items have user story + priority/effort + dependencies; ACs locked at R1 by [product-manager] for B-100/B-102/B-103/B-105/B-106 |
| 2 | Total sprint effort fits the sprint duration | ✅ — 2 M (B-100, B-102) + 2 S (B-103, B-105) + 1 XS (B-106) = at the P-3 limit (max 2 M parallel) but well within Full sprint capacity |
| 3 | No unresolved blockers from S34 | ✅ — S34 closed clean, B-105 + B-106 are the natural follow-ups |
| 4 | `SPRINT.md` "Active Items" populated | ✅ (below) |
| 5 | `BACKLOG.md` items filed | ✅ — B-100, B-102, B-103, B-105 (S33/S34 follow-ups) + B-106 NEW |
| 6 | `BACKLOG_BOARD.md` updated | ✅ — Sprint 35 section added; totals refreshed (106 items, 90% complete after B-106 file) |
| 7 | Deps-resolved check | ✅ — B-100: B-026 ✅ + B-099 ✅. B-102: B-014 ✅ + B-050 ✅. B-103: B-016 ✅ + B-055 ✅. B-105: B-037 ✅. B-106: B-104 ✅ + **B-105 (must land first within this sprint)** |

**Pending product-owner approval before R1 launch.**

---

## Active Items

### [B-100] Delete-on-live UX redesign
- **Tier**: Full (M) — R1 → R2 → R3 → R4 (3 reviewers parallel) → R5 → R6 → R7
- **Status**: Backlog filed; awaiting R1 launch
- **Wave**: 0 (anchor — independent of B-102/103/105/106)
- **Feature Context**: Delete (X) on a live bookmark currently demotes (deletes the bookmark, leaves the tab open). User feedback from S33 UAT-14: this is too destructive as a default — pressing X to "close" a live row should close the tab and keep the bookmark; explicit bookmark deletion should be a deliberate context-menu action with confirmation.
- **Dependencies**: B-026 ✅ (item context menu host), B-099 ✅ (claim semantics finalized)
- **Open R1 questions**: (a) default Delete-button click action when item is live: close-tab vs. current demote behavior; (b) "Delete bookmark" location: context menu entry vs. Shift+Click modifier; (c) confirmation pattern: modal vs. toast-with-undo; (d) non-live items: Delete button stays as-is (no tab to close)
- **Files (expected)**: `sidepanel/sidepanel.js` (Delete button handler in item action row + context menu); `sidepanel/sidepanel.html` (potentially new menu entry markup); `sidepanel/sidepanel.css` (label/visual changes if needed); `tests/b100-delete-on-live.test.js` (new, ≥ 6 tests); `docs/UAT_B-100.md` (new, ≥ 5 cases); `docs/design/49-b-100-delete-on-live.md` (new R6 chapter)
- **Risk flags**: This is a UX behavior change to a destructive action. R1 must lock the destructive-action confirmation pattern explicitly (per DoR Gate 7). Existing keyboard shortcuts and bulk action bar interactions must be regression-checked.

### [B-102] Cross-window demote broadcast bug
- **Tier**: Full (M) — R1 → R2 → R3 → R4 (3 reviewers parallel) → R5 → R6 → R7
- **Status**: Backlog filed; awaiting R1 launch
- **Wave**: 0 (parallel to B-100; touches background broadcast logic + sidepanel receiver — different files than B-100)
- **Feature Context**: When a user demotes a bookmark in one window, the originating window correctly shows the item moving to Open Tabs. Other open windows show the item completely GONE (vanishes from both groups AND Open Tabs). Suggests broadcast scope filter is incorrectly suppressing the relevant scope on non-originating sidepanels.
- **Dependencies**: B-014 ✅ (multi-window awareness), B-050 ✅ (state broadcast)
- **Investigation needed at R2**: trace `MSG_DEMOTE_ITEM` broadcast scope; verify non-originating windows refetch items + openTabs on broadcast. Check if broadcast-handler scope filter is dropping the wrong scope on non-originating sidepanels.
- **Files (expected)**: `background/messages/storage-handlers.js` (`MSG_DEMOTE_ITEM` broadcast scope) OR `sidepanel/sidepanel.js` (broadcast receiver); `tests/b102-cross-window-demote.test.js` (new, ≥ 5 tests); `docs/UAT_B-102.md` (new, ≥ 4 cases incl. multi-window manual repro); `docs/design/50-b-102-cross-window-demote.md` (new R6 chapter)
- **Risk flags**: Multi-window UAT requires opening 2+ extension windows in a real browser session — chrome-mock can simulate but the bug may have a real-DOM-only manifestation. R5 [test-engineer] must execute the multi-window UAT in Edge before sprint close.

### [B-103] Promote-tab duplicate bug
- **Tier**: Full (S) — R1 → R2 → R3 → R4 (3 reviewers parallel) → R5 → R6 → R7
  - *Tier upgraded from Fast Track (S default) to Full because the bug is in claim-establishment timing — touches the same subsystem as B-099 drift fix; full pipeline ensures regression coverage.*
- **Status**: Backlog filed; awaiting R1 launch
- **Wave**: 0 (parallel to B-100/B-102; touches `MSG_PROMOTE_TAB` + `buildOpenTabs` filter — different files)
- **Feature Context**: After promoting an open tab → saved bookmark, BOTH the new bookmark item AND the original Open Tabs item are visible in the sidepanel; both show active. Indicates promote flow isn't establishing the claim atomically — there's a window where bookmark exists but claim isn't yet wired so `buildOpenTabs` doesn't filter the tab out.
- **Dependencies**: B-016 ✅ (promote tab), B-055 ✅ (Open Tabs section)
- **Investigation needed at R2**: trace `MSG_PROMOTE_TAB` → does it call `claimTabForItem` after `createItem`? Check broadcast emission timing relative to claim establishment. Likely fix: ensure the broadcast fires AFTER both `createItem` AND `claimTabForItem` resolve (atomic from receiver's perspective).
- **Files (expected)**: `background/messages/storage-handlers.js` (`MSG_PROMOTE_TAB` handler); `tests/b103-promote-duplicate.test.js` (new, ≥ 5 tests); `docs/UAT_B-103.md` (new, ≥ 3 cases); R6 chapter folded into B-099 §46 As Built or new chapter (R6 architect decides)

### [B-105] Solarized-light baseline WCAG AA contrast fix
- **Tier**: Full (S) — R1 → R2 → R3 → R4 (3 reviewers parallel) → R5 → R6 → R7
  - *Tier upgraded from Fast Track to Full because palette changes affect 1 of 14 themes and need careful regression coverage across surfaces (group headers, dialogs, picker swatches, drift indicators).*
- **Status**: Backlog filed; awaiting R1 launch
- **Wave**: 0 (parallel to B-100/102/103; touches `shared/themes.css` only)
- **Feature Context**: Solarized-light theme baseline contrast is sub-AA (`--text-primary` `#586e75` vs `--bg-secondary` `#eee8d5` = 4.392:1). B-104 worked around this by setting `--group-header-tint-amount: 0%` for solarized-light; B-105 fixes the underlying palette so future tinted-surface features can ship without 0% overrides.
- **Dependencies**: B-037 ✅ (theme system)
- **R1 proposed**: (a) darken `--text-primary` to ~`#475158` OR (b) lighten `--bg-secondary` to ~`#f5f1e3`; (c) verify chosen fix doesn't break selection/picker/dialog surfaces; (d) once landed, `--group-header-tint-amount: 0%` override on solarized-light can be removed (B-106 verifies)
- **Files (expected)**: `shared/themes.css` (solarized-light block — single token change); `docs/design/45-b-037-themes.md` (one-line palette correction note in As Built); `tests/b105-solarized-light-contrast.test.js` (new, ≥ 4 tests asserting computed AA contrast across multiple surfaces); `docs/UAT_B-105.md` (new, ≥ 3 cases)
- **Risk flags**: Solarized canonical palette purity — fixing the contrast may deviate from the published Solarized hex values. R1 must lock whether to (1) deviate slightly from Solarized canonical to gain AA OR (2) ship a new "Solarized Light (high contrast)" variant theme. Recommend (1) for simplicity (single Solarized canonical user is unlikely to spot a `~4 unit` luminance shift; AA accessibility is a stronger product value).

### [B-106] Group header tint brightness bump
- **Tier**: Fast Track (XS) — R1 → R3 → R4 (code + security parallel)
  - *Fast Track per CLAUDE.md tier rules: XS pure-CSS change. R2 + R5 + R6 + R7 skipped per Fast Track DoD.*
- **Status**: Backlog filed; awaiting R1 launch
- **Wave**: 1 (depends on B-105 — must land AFTER B-105 removes solarized-light 0% override; otherwise solarized-light silently absorbs the brighter default with no visual effect)
- **Feature Context**: Product-owner feedback after v1.28.0: group header tints are "a bit too dark, would like them a little brighter." Current default is 12%; bump to ~16-20% for more vivid identity at a glance.
- **Dependencies**: B-104 ✅ (`--group-header-tint-amount` per-theme escape hatch shipped); **B-105 (must land first in this sprint)**
- **R1 proposed**: bump default from 12% → 18% (R1 picks 16%/18%/20%); re-verify WCAG AA spot-check matrix; if any theme drops below 4.5:1 at the new default, set per-theme override using existing variable; verify solarized-light renders correctly at the new bright default after B-105 lands
- **Files (expected)**: `shared/themes.css` (single declaration in `:root` — bump default percentage); potentially a per-theme override block if any non-solarized theme drops below AA at the new default; `tests/b104-group-colors.test.js` (extend T3+T4 OR add T10 asserting new default value); `docs/design/47-b-104-themed-group-colors.md` (§47.5 spot-check matrix update)
- **Risk flags**: WCAG AA regression risk on themes that were borderline at 12%. R4 [security/qa-reviewer] must re-spot-check the 20-row matrix at the new percentage. **R1 to lock**: exact percentage (recommend 18%); whether to rename `--group-header-tint-amount` (recommend no — minimize churn).

---

## Wave Plan

```
Wave 0 (4 items in parallel — independent surfaces)
  ├── B-100 R1 → R2 → R3 → R4 → R5 → R6 → R7              [Full M, sidepanel UX]
  ├── B-102 R1 → R2 → R3 → R4 → R5 → R6 → R7              [Full M, broadcast/SW]
  ├── B-103 R1 → R2 → R3 → R4 → R5 → R6 → R7              [Full S, promote handler]
  └── B-105 R1 → R2 → R3 → R4 → R5 → R6 → R7              [Full S, themes.css palette]

Wave 1 (depends on B-105 done)
  └── B-106 R1 → R3 → R4 (code + security parallel)        [Fast Track XS, tint bump]

Sprint Close
  Gate 4 → Gate 7 retrospective → [release-manager] v1.29.0 → archive (release/v2 only; no main merge)
```

**P-1 / P-2 / P-3 compliance**:
- P-1 ✅ — zero L/XL items
- P-2 ✅ — S/XS items (B-103, B-105, B-106) run alongside any active item
- P-3 ✅ — exactly two M items (B-100, B-102) — at the P-3 limit; no third M

**Parallel opportunities**:
- Wave 0: 4 items × 3 parallel R4 reviewers = up to 12 reviewer agents simultaneously after R3 completes for each
- B-100 + B-102 R3 run in parallel (different files: sidepanel UX vs SW broadcast)
- B-103 R3 + B-105 R3 run in parallel with the above (background handler + themes CSS)

**File-conflict matrix**:
- `sidepanel/sidepanel.js`: B-100 (Delete handler) vs B-102 (broadcast receiver) vs B-103 (promote sender) — three items touch this file but different functions/sections. Risk: low; merge cleanly at line-section granularity.
- `background/messages/storage-handlers.js`: B-102 (`MSG_DEMOTE_ITEM`) + B-103 (`MSG_PROMOTE_TAB`) — different cases in the same dispatch switch. Low risk.
- `shared/themes.css`: B-105 (solarized-light block) + B-106 (default tint amount) — different sections. B-106 must follow B-105 chronologically (Wave 1) to avoid silently shipping with solarized-light still at 0%.

---

## Completed This Sprint

*(none yet — sprint not kicked off)*

---

## Blockers

*None.*

---

## Out of scope (explicit triage)

The following items were considered for S35 but deferred:

- **B-041** (sync tab order, P2/L) — last big feature item; deserves its own dedicated sprint.
- **B-076** (MIGRATION_STEPS hook) — passive future-work placeholder, activates when first migration step ships.
- **B-086** (sidepanel UI/UX umbrella, P3/M) — broader umbrella; defer until S34/S35 polish work settles to assess what's still missing.

---

## Pre-flight reminders for kickoff

When the user approves: [scrum-master] launches **4 R1 [product-manager] agents in parallel** for B-100, B-102, B-103, B-105, AND a 5th for B-106 (also R1). All five run simultaneously since R1 is pure definition (no code conflicts). Wave 1 dependency (B-106 ← B-105) is enforced at R3 — B-106 R3 cannot start until B-105 R3 is merged (or at least lands as the final hex in the same branch).

Test count baseline: 1,426 (post-S34). Target post-S35: ~1,450+ depending on item-by-item test counts.
