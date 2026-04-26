# UAT Plan — B-101 Dotted Drift Bar in Row Left-Edge Gutter

Sprint 34 · Full (S) · R5 UAT plan (authored by [test-engineer])

Related artefacts:

- `docs/BACKLOG.md` — B-101 row (9 acceptance criteria; R1 LOCKED 2026-04-26)
- `docs/design/48-b-101-drift-bar.md` — R2 design chapter (D-1..D-5 + C-1..C-12)
- `docs/SPRINT.md` — Sprint 34 active item
- `tests/b101-drift-bar.test.js` — 6 automated tests (T1-T5 from AC8 + T6 cache-fallback gap-fill from R4 LOW)
- `tests/b011-drift.test.js` — UPDATED in S34 R5 to track the post-B-101 `bar.hidden` flip behavior (R4 HIGH)
- `sidepanel/sidepanel.js` — `_driftTooltipFor`, `buildItemRow` drift-bar injection, `_ensureIndicators` (signature `(row, live, isDrifted, driftedToUrl)`)
- `sidepanel/sidepanel.css` — `.item-row { position: relative }`, new `.item-drift-bar` rule
- `docs/UAT_B-099.md` — predecessor UAT plan; B-099 covered drift detection + "Snap to this tab"; B-101 covers the visual treatment swap only.

## Preconditions

1. Extension loaded unpacked from `feature/sprint-34-visual-polish` via `edge://extensions` → "Load unpacked" → repo root.
2. Edge (primary target browser). Re-run UAT-1 and UAT-3/UAT-4 in Chrome as a spot check (cross-browser parity for the visual gutter).
3. Fixture: any non-empty bookmarks collection with at least one saved bookmark whose URL points to a page that can be navigated away from in-browser (e.g. a saved bookmark for `https://example.com` so you can open it, navigate to `https://example.org`, and observe drift).
4. DevTools open on the sidepanel (right-click sidepanel → Inspect) so you can inspect the row's first child element + computed `border-left` style on `.item-drift-bar`.
5. DevTools open on the background service worker (`edge://extensions` → Tab Junkie → "Inspect views: service worker") for storage inspection (`chrome.storage.local.get('tj:drift')`) — same access pattern as `docs/UAT_B-099.md`.

**C-1 stale-SW note (per CLAUDE.md B-094 extension):** B-101 introduces zero new pref keys, zero new manifest entries, and zero storage schema changes. The C-1 verdict in §48.5 is N/A — no extension toggle OFF/ON cycle is required after the update lands. Load the extension once and proceed. The B-099 drift-detection wiring already in place is the foundation B-101 sits on; B-101 only swaps the visual treatment.

**Out-of-scope (per AC9 — do not test):** (a) `--drifted-color` token value or per-theme overrides; (b) drift detection logic in `background/tabs/drift.js`; (c) the `MSG_UPDATE_ITEM` "Snap to this tab" handler from B-099; (d) newtab + popup surfaces; (e) any new pref keys, manifest entries, message types. If anomalies in those surfaces appear during UAT, file as new icebox rows — do NOT amend B-101.

Legend: **B** = blocker (zero failures tolerated) · **H** = high (at most 1 fail, documented) · **M** = medium (non-blocking)

---

## Test Cases

### Drift bar appearance + disappearance (AC1)

#### UAT-1: Drift bar appears in row left gutter when item drifts — Priority: B

**Given** a saved bookmark "Example" exists with URL `https://example.com` AND I have opened it via Tab Junkie so it is claimed (sidepanel shows the green live border on the row).
**When** I switch to that tab and navigate to a different URL in the address bar, e.g. `https://example.org`.
**Then** within ~500 ms the sidepanel row for "Example":
  - retains the green active border on the left edge (claim preserved per B-099 D-1),
  - shows a 3 px dotted amber bar in the row's left-edge gutter immediately to the right of the green border (combined ~6 px gutter),
  - the row's right-side `.item-indicators` strip does NOT contain the old warning-triangle icon (B-101 AC2 — strip is now drift-free).
**Expected**: SW console `chrome.storage.local.get('tj:drift')` shows a record `{ itemId, driftedToUrl: 'https://example.org', detectedAt }`. DevTools Elements panel on the row shows `<span class="item-drift-bar" title="Drifted to: example.org" aria-hidden="true">` as the first child of the `.item-row`, with `hidden` attribute absent. Computed style: `border-left: 3px dotted <theme amber>`, `position: absolute`, `left: 3px`.

#### UAT-2: Drift bar disappears when item navigates back to saved URL — Priority: B

**Given** a drifted bookmark from UAT-1 (dotted amber bar visible).
**When** I navigate the same live tab back to the saved URL `https://example.com`.
**Then** within ~500 ms the dotted amber bar disappears from the row, the green active border (if still active) is unchanged, and row content does NOT shift horizontally during the transition (D-3 invariant — bar is `position: absolute` and never participates in flex layout).
**Expected**: `chrome.storage.local.get('tj:drift')` no longer contains an entry for the bookmark's itemId. DevTools Elements panel shows the `<span class="item-drift-bar">` is still present in the row (D-1: always-present in the DOM) but now carries the `hidden` attribute and has no `title` attribute. The row reads as a normal claimed live bookmark.

---

### Coexistence permutations (AC3 + R4 MEDIUM coverage gap)

#### UAT-3: Active row + drifted = both bars side-by-side in 6 px gutter — Priority: H

**Given** a drifted bookmark from UAT-1 AND that bookmark's tab is the currently focused tab in its window (so the row carries `data-active="true"`).
**When** I observe the row in the sidepanel.
**Then** the row's left edge shows TWO bars side-by-side:
  - 3 px solid green at `left: 0` (the active border-left from `[data-active="true"]`),
  - 3 px dotted amber at `left: 3px` (the B-101 drift bar),
  - total gutter width: 6 px,
  - row content (favicon, title, url) is NOT shifted vs. an active-only row — `padding-left: 9px` from the active rule already accommodates the combined gutter (D-3 invariant).
**Expected**: DevTools Elements panel shows both `<span class="item-drift-bar">` (visible — no `hidden` attribute) AND the row's `border-left: 3px solid var(--active-border)`. Computed gutter: 3 + 3 = 6 px. No content-shift jitter when the row enters/exits this combined state.

#### UAT-4: Live (non-active) row + drifted = green live border + dotted amber bar coexist — Priority: H

**(R4 qa-reviewer MEDIUM coverage gap — `data-live="true"` + drifted permutation)**

**Given** a saved bookmark whose tab is OPEN (so `data-live="true"`) but NOT the currently focused tab (so `data-active="false"`). The bookmark is drifted (e.g., navigated to a different URL than its saved URL).
**When** I observe the row in the sidepanel.
**Then** the row's left edge shows TWO bars side-by-side:
  - 3 px solid green at `left: 0` (the live border-left from `[data-live="true"]` — this rule lives at `sidepanel.css:451-454` and uses `var(--live-indicator)`),
  - 3 px dotted amber at `left: 3px` (the B-101 drift bar),
  - total gutter width: 6 px (same as the active+drifted geometry from UAT-3).
**Expected**: DevTools Elements panel confirms both bars render. Switch focus to a different tab (so the row drops `data-active` but keeps `data-live` and `data-drifted`) and confirm the live+drifted geometry persists. This guards the C-9 D-3 coverage gap that R4 [qa-reviewer] flagged as MEDIUM — R6 [solution-architect] should extend D-3 enumeration to call this permutation out explicitly.

---

### Tooltip migration (AC4)

#### UAT-5: Hostname tooltip on drift bar shows "Drifted to: <hostname>" — Priority: H

**Given** a drifted saved bookmark in the sidepanel from UAT-1 (dotted amber bar visible at the row's left edge).
**When** I hover the dotted amber bar (cursor over the ~6 px gutter zone on the left edge of the drifted row).
**Then** within ~500 ms a browser-native tooltip appears reading exactly **"Drifted to: example.org"** (hostname only, no path/query/fragment).
**Expected**: DevTools inspector on `<span class="item-drift-bar">` shows the `title` attribute set to `Drifted to: example.org`. The tooltip is the same string and same hostname-extraction logic from B-099 D-7 — `try { new URL(driftedToUrl).hostname } catch { driftedToUrl }`, with the final fallback "Drifted to a different URL" only firing when the URL is missing or un-parseable. Note: `pointer-events: none` on the bar may make hovering tricky in some browsers — tooltip may also appear when hovering the immediately-adjacent ~3 px zone of the row's left padding; either trigger zone is acceptable.

---

### AC2 regression — old triangle is gone

#### UAT-6: Drift triangle icon GONE from indicators strip (AC2 regression check) — Priority: H

**Given** a drifted saved bookmark in the sidepanel (dotted amber bar visible at the row's left edge).
**When** I inspect the row's `.item-indicators` strip on the right side via DevTools Elements panel.
**Then** the strip contains only:
  - the cross-window badge (when the row's tab is in a different window than the panel's anchor window — see B-014), AND/OR
  - the audible musical-note icon (when the tab is currently playing audio),
  - and NOTHING else — no warning triangle, no `<span class="item-drifted-icon">`, no per-row drift SVG.
**Expected**: `grep`-style check via DevTools console: `document.querySelectorAll('.item-drifted-icon').length === 0`. Source-tree assertion mirror: `grep -n "item-drifted-icon" sidepanel/` returns zero hits in non-comment lines (HTML/CSS/JS). The strip is present only when needed (audible OR window-badge); a drifted-only-not-audible-same-window row may have NO `.item-indicators` strip at all (the strip is no longer created by drift transitions per B-101 §48.3 D-1 — verify via DevTools that `.item-indicators` is absent on a drift-only row that is in the panel's anchor window and not playing audio).

---

## Pass criteria

- All B-priority cases (UAT-1, UAT-2) PASS.
- All H-priority cases (UAT-3, UAT-4, UAT-5, UAT-6) PASS or have one documented FAIL with rationale.
- No M-priority cases in this plan (B-101 is a focused visual refinement; UAT scope is six cases per AC8).

A single FAIL on any B-priority case blocks the sprint close — route back to [frontend-engineer] for fix, do NOT mark B-101 done.

## Out of scope (per AC9 — do not test)

- `--drifted-color` token value or per-theme overrides (no token authoring in this item).
- Drift detection logic in `background/tabs/drift.js` (untouched by B-101).
- `MSG_UPDATE_ITEM` "Snap to this tab" handler from B-099 (untouched; right-click affordance still works).
- Newtab `.newtab-indicator-drifted` 12 px dot (per Q4 / AC6 — newtab dense-row layout has no left-gutter to host the bar).
- Popup surfaces (no item rows rendered).
- Any new pref keys, manifest entries, message types (none introduced).

If anomalies in the above surfaces appear during UAT, file as new icebox rows — do NOT amend B-101.
