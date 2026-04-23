# Sprint 26 — R4 Findings (Deduplicated)

Single-item sprint — B-022 Quick Search Popup (Full L tier). Findings from 3 parallel R4 reviewers: [code-reviewer], [security-reviewer], [qa-reviewer].

---

## B-022 — Quick search popup

### CRITICAL
_None._

### HIGH (must fix before R5)

| # | File:Line | Finding | Fix | Flagged by |
|---|-----------|---------|-----|------------|
| B-022-H1 | `popup/popup.js:721` (`_faviconUrlForItem`) | **Outbound network call to google.com — violates CLAUDE.md non-negotiable rule** ("No network requests from the extension"). Constructs `https://www.google.com/s2/favicons?sz=32&domain=<hostname>` as `<img src>`, which issues an HTTP request to Google's favicon service for every saved item lacking a live `favIconUrl`. Sidepanel does NOT do this — it renders browser-supplied `favIconUrl` guarded by `isSafeFaviconUrl` and falls back to letter-avatar when absent. (Security-reviewer L-1 mis-read as "consistent with sidepanel" — incorrect; code-reviewer H-1 correctly flagged as new surface.) | Remove the Google URL construction entirely. Use `item.favIconUrl` / `liveState.favIconUrl` if present and safe (promote `isSafeFaviconUrl` from `sidepanel/sidepanel.js:90` to `shared/favicon.js` or inline the check). Fall back to the existing letter-avatar pattern. | code-reviewer |
| B-022-H2 | `popup/popup.js:451` (`_onKeyDown`) | **No focus trap on Tab/Shift+Tab** — WCAG 2.1.2 + spec §39.3 D-4 violation. Current code explicitly lets Tab pass through; single Tab press from the input exits the popup into browser chrome. Spec says Tab should cycle query input ↔ result rows only. | Intercept Tab/Shift+Tab on `#qs-root`: when on `#qs-input`, Tab moves logical selection to first row + `preventDefault`; on a row, Tab wraps back to input. Shift+Tab is the reverse. Use `aria-activedescendant` for selection (not DOM focus on rows, per D-4). | qa-reviewer |
| B-022-H3 | `popup/popup.js` row rendering + `popup/popup.css` | **No icon differential between saved vs open-tab rows** — AC12 + D-6 require "label + icon differential, not color only". Currently: saved rows get breadcrumb text; open-tab rows conditionally get `.qs-badge-active` + window badge (only when `tab.active` or `ordinal > 1`). A non-active open tab in the primary window has NO visual indicator beyond section placement. If scroll pushes the section header off-screen, the two rows are indistinguishable. | Per R2 §39.3 D-6, add: (a) small bookmark-icon overlay on `.qs-favicon` for saved rows, (b) small live-dot indicator overlay on `.qs-favicon` for open-tab rows (unconditional — not gated on `tab.active`). CSS overlay via `::after` or a child `<span>` positioned absolute in the `.qs-favicon` container. | qa-reviewer |

### MEDIUM (quick wins — fix inline with HIGH)

| # | File:Line | Finding | Fix | Flagged by |
|---|-----------|---------|-----|------------|
| B-022-M1 | `popup/popup.html:12-21` (`#qs-input`) | No `maxlength` attribute — paste of 10k+ char query triggers O(N·M) substring scan. B-079 precedent sidepanel uses `maxlength="256"`. | Add `maxlength="256"` to match sidepanel. | security-reviewer |
| B-022-M2 | `popup/popup.html:26` + popup.js empty-state | `#qs-empty` uses `role="status"` but its content is injected AFTER `hidden` attribute removal, which can suppress screen-reader announcements on some AT combinations. Dedicated `#qs-status` visually-hidden live-region already exists and is more reliable. | Route empty-state messages through `#qs-status` live region (`aria-live="polite"` + `aria-atomic="true"`), not `#qs-empty`. Keep `#qs-empty` for visual rendering only. | qa-reviewer |

### MEDIUM (deferred to S27+ hygiene — accepted)

| # | File:Line | Finding | Flagged by |
|---|-----------|---------|------------|
| B-022-DM-1 | `popup/popup.js:15` | Misleading JSDoc module header — says `chrome.tabs.update/create → MSG_RECENCY_ADD` but popup never calls `chrome.tabs.*` directly (routes via `MSG_NAVIGATE_TO_ITEM`). Fix with a comment rewrite. | code-reviewer M-1 |
| B-022-DM-2 | `popup/popup.js:254–258` | Unnecessary intermediate object construction in `_scoreEntry` caller; ~5 ops per result × 1000 = minor GC pressure. Refactor to flat params or avoid intermediate. | code-reviewer M-2 |
| B-022-DM-3 | `popup/popup.js:699–703` (`_groupBreadcrumb`) | Dead conditional — always returns literal `'Group'`. Caller already handles the Ungrouped path. Remove inner conditional; return `'Group'` unconditionally. Flag as UAT-5 WARN in §39.10 (simplified breadcrumb). | code-reviewer M-3, qa-reviewer M-2 |
| B-022-DM-4 | `popup/popup.js:151` | `_tabById` Map built but never read anywhere. Dead code — remove. | qa-reviewer L-1 |
| B-022-DM-5 | `popup/popup.js:_resetSelection` | Auto-selects first row on load + every filter change. Enter with no ArrowDown activates the first result. Behavior is a product choice; either document in AC/UAT or change to "no initial selection; Enter does nothing until ArrowDown". | qa-reviewer M-1 |
| B-022-DM-6 | `popup/popup.js` | Proportional split comment misleading ("up to half to each"); actual logic gives shorter section its full set and fills remainder from larger. Comment accuracy only; logic correct. | qa-reviewer M-4 |

### LOW (defer)

| # | File:Line | Finding | Flagged by |
|---|-----------|---------|------------|
| B-022-L1 | `popup/popup.html:26` vs spec §39.4.1 | `#qs-empty` nested inside `#qs-results-scroll` instead of being a direct child of `#qs-root`. Centring still works (nearest positioned ancestor), minor spec drift. Flag in R6 for §39.10 doc update. | code-reviewer L-1 |
| B-022-L2 | `shared/` | `isSafeFaviconUrl` helper should be promoted to `shared/favicon.js` (or similar) once B-022-H1 is fixed so popup + sidepanel share the guard. | code-reviewer L-2 |
| B-022-L3 | `popup/popup.js:589` | Empty-state message interpolates raw user query verbatim into text via `textContent` (XSS-safe but bounded by M-1 maxlength fix). | security-reviewer L-2 |
| B-022-L4 | `popup/popup.js:189-201` | Popup-side `_readRecencyPartition` reads `tj:recency` without `assertShape`; defensive per-entry checks at render time catch malformed entries. SW-side write path DOES validate. Graceful-degrade acceptable. | security-reviewer L-3 |
| B-022-L5 | `popup/popup.js:752` (`_updateStatus`) | `aria-live` announce says `No results for ${q}` (no quotes around q) while visual `#qs-empty` shows `No results for "${q}"` (with quotes). Minor presentation inconsistency. | qa-reviewer L-2 |
| B-022-L6 | `docs/UAT_B-022.md` UAT-4A | Expected output doesn't explicitly require "Recent · N" section header. Tester could pass without noticing header absence. Add note at R5 UAT. | qa-reviewer L-3 |

---

## Disposition

- **Fix in-sprint (HIGH + quick MEDIUM)**: H-1 (google favicon), H-2 (focus trap), H-3 (icon differential), M-1 (maxlength), M-2 (live-region routing)
- **Deferred to S27+ hygiene bundle**: DM-1 through DM-6, plus L-1 through L-6
- **Accepted as-is**: L-4 (graceful-degrade recency read)

**Security posture**: once H-1 is resolved, the popup introduces zero new network surfaces. Other security checks (SEC-1 through SEC-10) all PASS. XSS surface fully closed by construction (`textContent` throughout, `shared/highlight.js` byte-for-byte promoted from B-021).
