# Sprint 40 — R4 Findings (Deduplicated)

_Pre-created at sprint kickoff per S39 retrospective action item (toolchain hygiene to bypass agent file-write permission denials)._

---

## [product-manager] — B-131 verify-first analysis

**Date**: 2026-04-29
**Author**: [product-manager]
**Scope**: Static-analysis review of the suspected floating-tab title-displacement bug (B-131). No source code changed; no UAT performed.
**Source-citation gate**: every claim below cites `file:line` per CLAUDE.md B-118 self-applied gate.

### Verdict

**A — Structurally cannot reproduce in v1.33.1 the way the bug report describes.**

The reported symptom — a newly-rendered floating row briefly showing "the title of an unrelated sibling item" — is **structurally impossible** in the current code path. The descriptor → row mapping is keyed on strict `tabId` equality at every layer; there is no shared DOM, no array-index lookup, and no off-by-one surface that could splice a sibling's title into a freshly-built row.

What the user almost certainly saw is a **closely-related but distinct phenomenon**: a freshly-spawned floating row first paints with `tab.url` or `'Untitled tab'` because `chrome.tabs.onCreated` delivers the tab with `title === ''` (Chrome contract — title resolves only after the page's `<title>` parses). On tab activation / page-load completion, `chrome.tabs.onUpdated` fires `changeInfo.title` and the row patches to the correct title. The "wrong" title the user saw is most likely either:
- (a) the URL string (which can superficially resemble a sibling's title — same domain, similar slug), OR
- (b) the literal string `'Untitled tab'`, OR
- (c) a momentary glimpse of the *prior* tab on the same row position before the synthetic row was inserted (if hit-testing on a row in transition).

This is a **rendering-pipeline edge** the user is reading as "wrong title", but it is not a sibling-title-bleed bug.

### Key static-analysis findings (top 5 with file:line)

**F-1 — Descriptor → row mapping is strict-tabId-keyed, no off-by-one surface**
`sidepanel/sidepanel.js:3022-3025` (`patchFloatingMembersSections`) builds the `existing` Map keyed on `Number(row.dataset.tabId)`. The members loop at `sidepanel/sidepanel.js:3088` does `existing.get(member.tabId)` (strict numeric equality). There is no `members[i]` ↔ `existing[i]` index pairing that could decouple. The same pattern holds in `patchOpenTabsSection` (`sidepanel/sidepanel.js:3258-3260`).

**F-2 — `buildFloatingMembers` dedupes on `matchedTabId`, first-match-wins**
`background/tabs/floating-members.js:75-116` — the H-2 dedup gate (`matchedTabIds` Set) ensures a single live tab cannot resolve to two descriptors under the same parent group. Position-match (`liveIndex.windowId + tabIndex`) is tried first, then URL-fallback. A claimed tab is skipped at `floating-members.js:111`. The descriptor's `title` field is sourced from `liveEntry.title` at `floating-members.js:127` — a single in-memory map keyed on `tabId`. No path can substitute one tab's title for another.

**F-3 — `LiveTabIndex.title` is `tabId`-keyed and updated via `tabId`-keyed events**
`background/tabs/live-tab-index.js:16-37` (Map keyed by tabId). `background/tabs/tab-events.js:47-69` (`onUpdated` handler) propagates `changeInfo.title` AND falls back to `tab.title` at `tab-events.js:62-64` (B-055 fallback for Chromium versions that omit `changeInfo.title`). `tab-events.js:125-134` (`onCreated`) seeds the new entry with `tab.title || ''` — Chrome typically delivers `''` for a freshly-spawned tab. **This is the empty-title window.**

**F-4 — Initial floating-row render under empty-title window**
`background/tabs/floating-members.js:127` writes `descriptor.title = liveEntry.title || ''`. `sidepanel/sidepanel.js:2881-2891` (`buildFloatingTabRow`) passes `member.title || ''` to `buildOpenTabRow`. `sidepanel/sidepanel.js:2828` does `title.textContent = tab.title || tab.url || 'Untitled tab'`. **When the title is empty, the row paints with the URL string OR the literal `'Untitled tab'` — never a sibling's title.** Same path on newtab at `newtab/newtab.js:1047`.

**F-5 — Title patching on subsequent `tab/title-changed` broadcast is correctly tabId-scoped**
`sidepanel/sidepanel.js:3344-3349` (`_patchOpenTabRow`) — title patch is `titleEl.textContent = nextTitle` (where `nextTitle = tab.title || tab.url || 'Untitled tab'`) on the row resolved by tabId. `_patchOpenTabRow` is invoked from `patchFloatingMembersSections` at `sidepanel/sidepanel.js:3091-3099` with the descriptor's own title. No cross-row contamination is possible.

### B-130 hotfix impact assessment

**B-130 (v1.33.1) is orthogonal to title rendering.** Per `git show 5b3ce4a -- sidepanel/sidepanel.js`, the hotfix removed:
- a `<div class="item-floating-bar">` element creation in `buildFloatingTabRow`;
- the defensive re-attach of that element in `patchFloatingMembersSections`;
- the corresponding CSS rule, replaced by a `border-left-style: dotted` override on `.item-row[data-floating="true"]`.

**Zero changes to title-text code paths.** The hotfix touched neither `buildOpenTabRow` (the title-text producer at `sidepanel.js:2828`), `_patchOpenTabRow` (the title patcher at `sidepanel.js:3344-3349`), nor `buildFloatingMembers` (the descriptor builder at `floating-members.js:121-131`). The hotfix CANNOT have introduced or fixed B-131. Any apparent "fix" the product-owner observed post-1.33.1 is either:
- (i) coincidental timing — the empty-title window happens to be shorter on a faster page-load path, OR
- (ii) the user retried the repro on a tab whose page resolved its `<title>` quickly, OR
- (iii) the original symptom was misattributed and is the F-3/F-4 empty-title window described above.

### Latent-race assessment (incidental findings, not B-131)

**Latent-1 (LOW)** — The opener-chain inheritance walk is async (`tab-events.js:143-184`). Between `chrome.tabs.onCreated` (which broadcasts `tab/created` synchronously at `tab-events.js:138`) and `appendFloatingGroup` resolving (which broadcasts `tab/opener-inherited` at `tab-events.js:178`), there is a window where the floating record does NOT exist in storage. A `MSG_LIST_ITEMS` dispatched in this window will return `floatingMembers` without the new tab. The patch loop at `patchFloatingMembersSections` correctly handles this: the new tab is simply absent from `nextTabIds` (not reused, not mis-keyed). When the second broadcast (`tab/opener-inherited`) fires, the row is freshly built via `buildFloatingTabRow` (since `existing.get(member.tabId)` returns undefined for a not-yet-rendered tabId at `sidepanel.js:3088-3130`). **No bleed surface.** This is not B-131; it is just the architectural async window.

**Latent-2 (LOW)** — `floating-members.js:107` returns continue when `matchedTabId === null`. URL-fallback at `floating-members.js:96-105` requires a non-empty normalized URL. A floating-tab record that was written with `url: ''` (per `tab-events.js:153` reading `liveEntry.url || ''`) AND whose live `tab.url` later changes BEFORE `chrome.tabs.onUpdated` fires would briefly fail position-match if the tab moved + URL-fallback because URL is empty. The dedup gate would then NOT add it to `matchedTabIds`. This is a transient empty-state, not a title-bleed.

### Recommended next step

**Close B-131 as `wontfix-not-repro` once product-owner Edge UAT confirms.**

Suggested mini-UAT script for product-owner to run before close:
1. Open Edge with the v1.33.1 unpacked extension on `release/v2`.
2. Open a saved-bookmark tab inside a group (the parent of the inheritance chain).
3. Middle-click 3-5 different links on that page in rapid succession to spawn floating tabs.
4. Observe the freshly-rendered floating rows in the sidepanel BEFORE clicking on any of them.
5. Record what title text appears: (a) URL string, (b) `'Untitled tab'`, (c) some sibling item's title, (d) blank.

If the answer is (a), (b), or (d): **F-3/F-4 empty-title window — close as wontfix-not-repro**. Optionally file a polish item: "B-13X: floating row should display `'Loading…'` or the favicon-derived hostname during the empty-title window for nicer UX" (P3, XS).

If the answer is (c) — an actual sibling title visibly appears: **product-owner must capture screen recording**, because the static analysis cannot explain that path. In that case, escalate to R2 with the recording attached; this would constitute new evidence not covered by the current static review.

### Confidence

**HIGH** — the descriptor-to-row mapping is keyed on strict `tabId` equality at every layer (F-1, F-2, F-5), the title source is a `tabId`-keyed in-memory map (F-3), and the v1.33.1 hotfix touched zero title-rendering code (B-130 hotfix impact assessment). The structural surface for the reported bug does not exist in the codebase. The most likely user observation is the F-3/F-4 empty-title window misread as a title-bleed.

**Confidence-reducing caveats** (not enough to drop to MEDIUM):
- Static analysis cannot reproduce real-time DOM state under fast user interaction; if the product-owner has a screen recording showing a clear sibling-title appearance, the analysis would need re-evaluation.
- The opener-chain async window (Latent-1) is not a bleed surface, but a fast-clicker who opens 3-4 tabs at once could observe out-of-order broadcasts that look unusual.

### Recommendation summary for [scrum-master]

- Branch decision: **CLOSE pending product-owner UAT confirmation** (verdict A).
- Hand off the 5-step Edge UAT mini-script above to product-owner.
- If UAT (a/b/d) — close as `wontfix-not-repro` and optionally file a P3/XS polish item for empty-title-window UX.
- If UAT (c) — re-open with screen recording and escalate to R2 (new evidence territory).
- Sprint 40 effort saved: ~M-tier item closed without R2 → R3 → R4 → R5 cycle.

---

## [product-manager] — B-133 R1 LOCKED

**B-133 — Open Tabs section dotted-green indicator (visual consolidation).**
**R1 LOCKED 2026-04-30 — Sprint 40 Wave 1. Tier: Fast Track XS confirmed.**

### Cross-surface decision (LOCKED — sidepanel-only)

- **Sidepanel**: APPLIES. `buildOpenTabRow` at `sidepanel/sidepanel.js:2789` sets `row.dataset.live = 'true'` (line 2797) and `row.dataset.liveOnly = 'true'` (line 2794). The base `.item-row` rule paints a 3 px transparent left-border at `sidepanel/sidepanel.css:466`; `.item-row[data-live="true"]` (line 483-485) and `.item-row[data-live-only="true"]` (line 1682-1685) both override `border-left-color` to `var(--live-indicator)` SOLID green. B-133 changes the Open Tabs treatment to DOTTED.
- **Newtab**: NOT APPLICABLE. Newtab rows have no left-side `border-left` indicator — live state is signaled via the right-side `.newtab-indicator-live` background-color dot at `newtab/newtab.css:420-422` (per B-130 §61.X-as-built rationale at `newtab/newtab.css:471-484`).
- **Popup**: NOT APPLICABLE. Popup uses `--live-indicator` only as `background-color` on `.qs-favicon-overlay` at `popup/popup.css:333` — no left-side border.

### Source-citation gate (B-118 self-applied)

- `sidepanel/sidepanel.js:2789-2856` — `buildOpenTabRow(tab)` Open Tabs row builder.
- `sidepanel/sidepanel.js:2794` — `row.dataset.liveOnly = 'true'` (unique discriminator inherited by floating-tab rows too via `buildFloatingTabRow` at `sidepanel/sidepanel.js:2881-2891`).
- `sidepanel/sidepanel.js:2797` — `row.dataset.live = 'true'` (also set on Open Tabs rows).
- `sidepanel/sidepanel.css:466` — base `.item-row` `border-left: 3px solid transparent` (B-123 §61 placeholder invariant).
- `sidepanel/sidepanel.css:483-485` — `.item-row[data-live="true"]` overrides `border-left-color: var(--live-indicator)`.
- `sidepanel/sidepanel.css:625-628` — B-130 `.item-row[data-floating="true"]` overrides `border-left-style: dotted` + `border-left-color: var(--floating-bar-color)`.
- `sidepanel/sidepanel.css:1682-1685` — `.item-row[data-live-only="true"]` overrides `border-left-color: var(--live-indicator)` (currently SOLID — B-133 changes this rule).
- `shared/themes.css:67` — `:root` declares `--floating-bar-color: var(--live-indicator)` (token retained from B-124, falls through every per-theme `--live-indicator` value automatically).
- `tests/b124-floating-visual.test.js:70-97` — T-124-A regex-pin pattern for `.item-row[data-floating="true"]` dotted-style assertion (canonical template B-133 reuses).

### DoR carve-outs

- **Destructive-action confirmation (DoR item 7)**: N/A — visual-polish-only CSS rule shape change. No destructive write path involved.
- **Performance acceptance criteria (DoR item 6)**: N/A — pure CSS-rule shape change. No JS, no render path, no storage path.
- **Selector audit (rehome items)**: N/A — no DOM elements moved between surfaces. The change is a same-rule edit at `sidepanel/sidepanel.css:1682-1685`.

### ACCEPTANCE CRITERIA — 5 ACs (R1 LOCKED 2026-04-30)

**AC1 — Dotted-green border on Open Tabs section rows**: `.item-row[data-live-only="true"]` rule in `sidepanel/sidepanel.css` declares BOTH `border-left-style: dotted` AND `border-left-color: var(--floating-bar-color)`. PASS = computed `border-left-style` on every Open Tabs row is `dotted`; computed `border-left-color` resolves to the `--floating-bar-color` token (which falls through to `--live-indicator` per theme via `shared/themes.css:67`). FAIL = any other style (solid/dashed/none) OR any other color binding.

**AC2 — `--live-indicator` token unchanged**: `shared/themes.css` `:root` and per-theme blocks (`shared/themes.css:90, 145, 209, 260, 310, 361, 425, 498, 553, 618, 673, 732, 790, 847, 900, 960`) carry their existing `--live-indicator` values unchanged. `--floating-bar-color: var(--live-indicator)` declaration at `shared/themes.css:67` retained. PASS = `git diff shared/themes.css` for B-133 shows zero changes; FAIL = any token modification.

**AC3 — No visual regressions on saved-bookmark live rows OR floating-tab rows**: `.item-row[data-live="true"]` rule at `sidepanel/sidepanel.css:483-485` retained as SOLID green (saved-bookmark rows currently live remain SOLID per the visual taxonomy: solid-green = persistent). `.item-row[data-floating="true"]` rule at `sidepanel/sidepanel.css:625-628` retained DOTTED in `var(--floating-bar-color)` (floating-tab rows already dotted per B-130 — unchanged). Drift bar (`.item-drift-bar`, B-101) unchanged. Active state (`.item-row[data-active="true"]`) unchanged. PASS = `tests/b124-floating-visual.test.js` T-124-A passes unchanged + saved-bookmark-live UAT visual is SOLID green; FAIL = any of the three other rules altered.

**AC4 — Tests added (regex-pin template from T-124-A)**: A new test file `tests/b133-open-tabs-dotted.test.js` contains at minimum 2 source-text assertions following the B-124 T-124-A pattern at `tests/b124-floating-visual.test.js:70-97`: (a) `.item-row[data-live-only="true"]` rule body matches `/border-left-style:\s*dotted/`, (b) same rule body matches `/border-left-color:\s*var\(--floating-bar-color\)/`. Existing tests (`tests/b048-visual-states.test.js`, `tests/b124-floating-visual.test.js`, `tests/b101-*.test.js`, `tests/b014-multi-window.test.js`, `tests/b024-multi-select.test.js`) stay green unchanged. PASS = `npm test` green + ~2 test count increase + zero modifications to pre-existing test files; FAIL = any regression OR any pre-existing test file modified.

**AC5 — Out of scope (explicit)**:
(a) `--live-indicator` token unchanged across all 16 theme blocks (per AC2).
(b) `--floating-bar-color` token unchanged at `shared/themes.css:67`.
(c) `.item-drift-bar` rule (B-101) unchanged at `sidepanel/sidepanel.css:601-609`.
(d) `.item-row[data-active="true"]` rule unchanged at `sidepanel/sidepanel.css:487-490`.
(e) ARIA labels unchanged — Open Tabs rows do NOT receive the "floating tab — " prefix per B-124 §61.8 (they remain "live tab — " via `buildItemRowAriaLabel` at `sidepanel/sidepanel.js:2853`).
(f) `buildOpenTabRow` builder body unchanged — no JS edits.
(g) `buildFloatingTabRow` builder body unchanged — no JS edits.
(h) Newtab + popup surfaces unchanged — out of scope per cross-surface decision.
(i) No `manifest.json` changes — no new permissions.
(j) No version bump beyond standard sprint-close roll.

### R3 hand-off notes (for [frontend-engineer])

**Implementation site**: edit `.item-row[data-live-only="true"]` at `sidepanel/sidepanel.css:1682-1685`. Add `border-left-style: dotted;` and change `border-left-color` from `var(--live-indicator)` to `var(--floating-bar-color)`.

**Latent CSS precedence finding (NICE-TO-KNOW for R3, not an AC)**: floating-tab rows currently match BOTH `[data-floating="true"]` (line 625) AND `[data-live-only="true"]` (line 1682) at equal specificity (0,1,1,0). Source-order wins on `border-left-color`: today line 1684's `var(--live-indicator)` overrides line 627's `var(--floating-bar-color)` on floating rows. The visual is identical only because `--floating-bar-color: var(--live-indicator)` falls through (`shared/themes.css:67`) — but the precedence is fragile against any future per-theme green-vs-other-hue tweak. B-133's rule edit (changing line 1684 to `var(--floating-bar-color)`) coincidentally fixes this latent fragility — both rules will now bind the same token.

**Code-comment update**: the pre-B-133 comment at `sidepanel/sidepanel.css:1680-1681` ("Open-tab rows look like saved-item rows but with a subtler live stripe (they are ALWAYS live so always show the green accent).") should get a B-133 § note explaining the dotted-ephemeral taxonomy alignment with B-130. Suggested replacement comment: "B-133 §63: Open Tabs rows are EPHEMERAL (lost on tab/browser close) — visually consolidated with the dotted-green floating-tab cue per the ephemeral-state taxonomy. Solid-green is reserved for persistent (saved-bookmark, currently-live) rows."

### R3 risk register

- **R-1 (LOW)**: source-order check — the `[data-live-only="true"]` rule at line 1682 COMES AFTER `[data-floating="true"]` (line 625), so adding `border-left-style: dotted` to line 1682 will NOT regress floating rows (they already get dotted from line 626 — same property, line 1682 redeclares the same value). No-op for floating rows; net change applies only to non-floating Open Tabs rows.
- **R-2 (LOW)**: dense-mode (`.tj-dense`) compatibility — base `.item-row` at line 466 declares `border-left: 3px solid transparent`; both `.tj-dense .item-row` (line 558-565) and the indicator overrides preserve the 3 px placeholder. Switching style to `dotted` on a 3 px border may render slightly differently per-browser but is rendering-engine consistent with the existing B-130 `[data-floating="true"]` precedent (Edge + Chromium). No additional R3 work.
- **R-3 (LOW)**: theme compatibility — all 16 themes already declare `--live-indicator`; `--floating-bar-color` falls through. B-130 verified this on UAT for floating rows; B-133 reuses the same token chain.

### R3 test approach (regex-pin reuse from B-124 T-124-A)

```js
test('B-133: `.item-row[data-live-only="true"]` overrides border-left to dotted in --floating-bar-color', () => {
  const css = readFile('sidepanel/sidepanel.css');
  const m = css.match(/\.item-row\[data-live-only="true"\]\s*\{([^}]*)\}/);
  assert.ok(m);
  assert.match(m[1], /border-left-style:\s*dotted/);
  assert.match(m[1], /border-left-color:\s*var\(--floating-bar-color\)/);
});
```

Mirrors the canonical template at `tests/b124-floating-visual.test.js:70-97`. No DOM-load required; pure source-text grep (the established escape hatch for sidepanel CSS pinning).

---

## [solution-architect] — B-132 R0 discovery spike

**Date**: 2026-04-29
**Author**: [solution-architect]
**Scope**: Read-only static analysis of the post-extension-reload floating-tab routing regression.
**Output chapter**: `docs/design/64-b-132-r0-spike.md` (full spike; ~640 lines). TOC entry added to `docs/SOLUTION_DESIGN.md`.

### Verdict

**Recommended Tier: M (Full Pipeline). Single item, no split.**

### Top hypothesis (HIGH, ~75%)

**Mode (b) URL-collision claim-jump at cold start.** `reconcileClaims` Phase 2 (`background/tabs/tab-claims.js:149-178`) auto-claims any unclaimed live tab whose URL matches an unclaimed saved item. **The B-125 `inheritedTabs` gate (`tab-claims.js:250-252`) sits inside `reevaluateTab`, NOT inside `reconcileClaims`.** After extension reload:

1. `chrome.storage.session` is wiped (R2-VERIFY 1) → `tj:tabClaims` empty.
2. `inheritedTabs` Set is empty (in-memory only, lost on every SW restart per `tab-claims.js:24-30` JSDoc and §59.3 "Cold-start state").
3. `reconcileClaims` Phase 2 sees pre-existing floating tabs as unclaimed candidates and URL-matches them to saved items.
4. `reassociateFloatingGroups` runs next (`tabs/index.js:47`), finds the matched-and-now-claimed tab, and PRUNES the `tj:floatingGroups` record (`floating-groups.js:144-152`).
5. The pre-existing floating tab is now permanently claimed by an unrelated saved bookmark; the originating-group floating-row UX is gone.

The user's "newly-spawned floating tabs go to Open Tabs" framing is most likely **Mode (b)** masquerading as Mode (a) — the new floating tabs DO surface correctly post-reload (B-125 holds for them via `markInherited` after `appendFloatingGroup`), but the **pre-existing** floating tabs that survived the reload have been silently claim-jumped, dominating the visual diff.

### Failure-mode coverage

- **Mode (a) shallow-chain post-reload spawn (one-hop)**: structurally works. H-10 in §64.4 traces the full path — `recordOpener` → `walkOpenerChain` (claimsMirror has parent) → `appendFloatingGroup` → `markInherited` → broadcast → sidepanel `MSG_LIST_ITEMS` round-trip → render under parent's group. Refutes naïve H-1 / H-2 / H-7.
- **Mode (a) deep-chain post-reload spawn (multi-hop)**: H-1' fires. `openerMap` is empty post-reload, so a middle-click inside a former-floating tab cannot walk to a claimed ancestor. AC3 carve-out — known-acceptable degradation.
- **Mode (b) pre-existing floating tab post-reload**: §64.5 primary cause. URL-collision drives claim-jump.

### Refuted hypotheses (one-line each)

- **H-1** "openerMap lost" — refuted by synchronous `recordOpener` (`tab-events.js:141`) before async `walkOpenerChain` (`tab-events.js:148`).
- **H-2** "inheritedTabs lost breaks fresh spawn" — refuted by `markInherited` (`tab-events.js:176`) being called synchronously after `appendFloatingGroup` resolves; gate fires correctly inside `reevaluateTab`.
- **H-4** "Chrome renumbers tabIds on extension reload" — refuted by Chrome MV3 contract (tabIds are owned by the browser, not the extension).
- **H-5** "reassociateFloatingGroups cold-start broken" — refuted by `tests/floating-position.test.js` AC8 passing today (1,732/1,732 baseline).
- **H-6** "MSG_LIST_ITEMS dispatched too early post-boot" — race self-heals via subsequent broadcasts.
- **H-7** "B-125 gate fails for post-reload spawn" — refuted by ordering at `tab-events.js:163-176` (markInherited fires before any reevaluateTab can run, debounced 100 ms).
- **H-9** "SW reload non-recoverable" — Edge Reload button is a clean SW restart.
- **H-10** "Mode-a-shallow is structurally broken" — REFUTED (Mode-a-shallow works); this serves as a regression guard for AC2.

### Critical fix sketch (3 production files, ~40 LOC)

1. **NEW helper** `preMarkInheritedFromFloatingGroups()` in `background/tabs/floating-groups.js` (~25 LOC) — reads `tj:floatingGroups`, position-matches/URL-fallback-matches each record against `LiveTabIndex`, calls `markInherited(matchedTabId)` for every unclaimed match. Pure read-then-mark; no storage writes.
2. **Cold-start ordering change** in `background/tabs/index.js:35-48` (~3 LOC) — insert `await preMarkInheritedFromFloatingGroups()` BEFORE `reconcileClaims(items)` so the gate is populated before Phase 2 runs.
3. **Phase 2 gate** in `background/tabs/tab-claims.js` `reconcileClaims` (~10 LOC) — extend the `urlToTabs.get(normalized)` consumption loop to skip tabIds in `inheritedTabs`. Pop+continue pattern with a fall-back to next-candidate.

**No schema change. No message contract change. No manifest change. C-1a/C-1b governance NOT triggered.**

### Sprint-capacity verdict

B-132 absorbs into S40 without deferring B-134. Effort allocation:

- B-131 (close `wontfix-not-repro` per [product-manager] verdict A above) — 0.5 unit
- B-132 (this; M Full) — 2-3 units
- B-133 (Fast Track XS, R1 LOCKED above) — 0.5 unit
- B-134 (M Full, R1 LOCKED in BACKLOG) — 4-5 units
- **Total: 7-9 units** within the 8.5-13 budget.

The SPRINT.md "defer B-134 if B-132 R0 returns XL" trigger does NOT fire.

### R1 / R2 handoff highlights

- **AC1**: Mode (b) URL-collision is fixed at cold start (gate in Phase 2).
- **AC2**: Mode (a) shallow-chain post-reload regression guard (B-121 still holds).
- **AC3**: Mode (a) deep-chain post-reload — explicitly carved out as known-acceptable degradation. Document in the R2 chapter (recommend `docs/design/65-b-132-cold-start-inheritance.md`).
- **AC4**: cold-start invariant — `inheritedTabs` populated before `reconcileClaims` Phase 2.
- **AC5**: zero regressions on existing test suites (B-099 / B-018 / B-121 / B-125 / floating-position / floating-session-wipe / floating-url-fallback).
- **AC6**: new `tests/b132-cold-start-inheritance.test.js` with T-132-A..F covering URL-collision, shallow-chain regression guard, helper-in-isolation, URL-fallback marker, no-collision regression guard, and explicit gate-mechanism pin.
- **R2-VERIFY 1 (CRITICAL)**: empirically confirm `chrome.storage.session` is cleared on Edge extension reload. The fix is correct either way but the documentation simplifies if confirmed.
- **R2-VERIFY 2**: confirm `appendFloatingGroup` + `markInherited` ordering preserved for fresh-spawn post-reload (regression guard for B-121).
- **R2-VERIFY 3**: confirm `reassociateFloatingGroups` does NOT need to be touched. Fix introduces a NEW helper rather than modifying re-associate.

### Test-surface enumeration (B-119 fix-scope)

Pre-existing test files [solution-architect] R2 must enumerate against the new gate behavior:

- `tests/b099-drift-fix.test.js` — Phase 2 auto-claim contract; ensure no test seeds `tj:floatingGroups` + URL-collision (which would now skip).
- `tests/floating-position.test.js` — three AC8 cases. The third case (lines 68-91) tests the prune-on-claim mechanism; R2 must read it verbatim and confirm no `markInherited` seed precedes `reconcileClaims` (if not, the test is unaffected).
- `tests/floating-session-wipe.test.js` — three AC12 cases; cold-start replay (lines 36-58) should still pass.
- `tests/floating-url-fallback.test.js` — confirm no URL-collision seeding.
- `tests/b121-floating-group-render.test.js` T-121-A / T-121-K — confirm no URL-collision with other saved items.
- `tests/b018-persistence.test.js` — GAP-1 / GAP-2 / R4-H1 / R4-H2 cases. R4-H2 (line 195+) might use URL-match seeding.
- `tests/b125-claim-jump-fix.test.js` T1-T5 — runtime path; should not be affected.

### Confidence

**HIGH** on the root-cause identification (§64.5 cause 1). Five independent lines of evidence converge:

1. `inheritedTabs` JSDoc explicitly says "empty on SW cold start" (`tab-claims.js:24-30`).
2. §59.3 "Cold-start state" documents the gap as known-acceptable for single-tab cases — extending to URL-collision is the missed analysis.
3. `reassociateFloatingGroups` lacks a `markInherited` call (`floating-groups.js:105-160`) — the architecturally clean spot to plug the fix.
4. `tests/floating-position.test.js` AC8 third case (lines 68-91) directly demonstrates the prune-on-claim mechanism.
5. The fix sketch is mechanically simple (3 files, ~40 LOC) — small fixes for genuine architectural omissions are characteristic of latent-gap bugs.

### Recommendation summary for [scrum-master]

- **Tier: M Full.** Run the standard 7-round pipeline.
- **Sub-items: do NOT split.** Single item.
- **Sequencing: B-132 before B-134 preferred but not blocking.** Both can run R2 in parallel if capacity allows.
- **Schema bump: NONE.** No CHANGELOG SW module-cache flush note required.
- **R1 ACs**: lock 6 ACs per §64.11; route to R2 with the three R2-VERIFY markers.
- Sprint 40 effort fits comfortably with B-131 closing as `wontfix-not-repro`.

---

## [product-manager] — B-132 R1 LOCKED

**B-132 — Floating tabs land in Open Tabs section after extension reload (P1 bug · M Full).**
**R1 LOCKED 2026-04-29 — Sprint 40. Tier: M Full (per `docs/design/64-b-132-r0-spike.md` §64.7).**

### Tier confirmation

**M Full** confirmed per R0 verdict §64.7. NOT auto-upgraded:
- No new storage schema (`tj:floatingGroups`, `tj:tabClaims`, `tj:meta` shapes unchanged per §64.6).
- No new message types in `shared/messages.js`.
- No new `manifest.json` permissions.
- Three production files in a security-sensitive cross-cutting subsystem (`background/tabs/`) — Full pipeline R1→R2→R3→R4 (3 reviewers)→R5→R6 + R7 conditional.

### DoR carve-outs

- **Destructive-action confirmation (DoR item 7)**: **N/A** — bug fix to a runtime claim-jump path. No destructive UX surface added or removed. Rationale: a misclaimed tab is recoverable by closing the spawned tab, by `MSG_DEMOTE_ITEM` on the saved item that was claim-jumped, OR (after the fix) is simply prevented at cold start. The fix narrows existing permissive auto-claim behavior; no user-facing destructive write is introduced.
- **Performance acceptance criteria (DoR item 6)**: cold-start orchestration adds one read of `tj:floatingGroups` + one O(N_records × N_liveTabs) marker pass. Per R0 §64.7 budget: ≤ 5 records × ≤ 50 tabs typical → < 1 ms added to `initializeLiveState`. AC8 pins the budget. No regression risk against the 200 ms first-paint envelope.
- **Selector audit (rehome items)**: **N/A** — no DOM elements moved between surfaces. Fix is service-worker-only.

### Source-citation gate (B-118 self-applied)

Every claim below cites `file:line` per CLAUDE.md self-applied gate; one R2-VERIFY marker per §64.11.

- `background/tabs/index.js:35-48` — `initializeLiveState` cold-start orchestration. Current sequence at lines 40-47: `Promise.all([buildLiveTabIndex, initWindowOrdinals, listItems])` → `await reconcileClaims(items)` → `await reassociateFloatingGroups(...)`. The B-132 fix inserts a NEW `await preMarkInheritedFromFloatingGroups(...)` step BEFORE `reconcileClaims`. (Verified via Read.)
- `background/tabs/tab-claims.js:30` — `const inheritedTabs = new Set();` declared at module scope, comment at lines 24-29 explicitly states "empty on SW cold start; cold-start re-association via tj:floatingGroups is the recovery path." (Verified via Read.)
- `background/tabs/tab-claims.js:38-40` — `markInherited(tabId)` adds to set; exported. (Verified via Read.)
- `background/tabs/tab-claims.js:149-178` — `reconcileClaims` Phase 2 loop (`urlToTabs` reverse lookup at 151-162; sorted-items consumption at 169-178). **No `inheritedTabs` gate today.** B-132 Fix C inserts skip-on-`inheritedTabs.has(candidate)` here. (Verified via Read.)
- `background/tabs/tab-claims.js:250-252` — B-125 `inheritedTabs` gate inside `reevaluateTab`. The gate sits inside `!alreadyClaimed` branch and short-circuits with `return` when the tab is in the inherited set. **This is the runtime path. The cold-start path (`reconcileClaims` Phase 2) lacks the equivalent gate — the B-132 root cause.** (Verified via Read.)
- `background/tabs/floating-groups.js:105-160` — `reassociateFloatingGroups` cold-start re-bind. Position-match at 124-129; URL fallback at 131-142; matched-and-claimed prune branch at 144-152; matched-and-unclaimed leave-in-place implicit at 153 ("matched + unclaimed → leave in place"). B-132 introduces a NEW exported helper `preMarkInheritedFromFloatingGroups` in this file (NOT a modification of `reassociateFloatingGroups`). (Verified via Read.)
- `tests/floating-position.test.js:68-91` — `AC8: position match against an already-claimed tab still triggers prune` test. Calls `reconcileClaims` directly (not `initializeLiveState`), so the new orchestration helper does NOT run. **The test currently asserts the buggy URL-collision behavior** (tab 10 gets claimed by `existing-item` and the floating record is pruned). R3 must decide whether (a) the test's narrow `reconcileClaims`-only fixture remains valid because the helper is not invoked, OR (b) the test must be rewritten to seed `markInherited(10)` before the call to pin the new gate-fires-when-marked behavior. **R3-DECISION** — see B-119 fix-scope enumeration below. (Verified via Read.)
- `tests/b121-floating-group-render.test.js:264-279` — T-121-G ("inherited tabs do not auto-claim during reevaluateTab") seeds `markInherited(200)` then calls `reconcileClaims([])`. Tests the runtime gate, not the cold-start path. Should remain green unchanged. (Verified via Read.)
- **R2-VERIFY 1 (CRITICAL)**: `chrome.storage.session` wipe behavior on Edge extension reload (per §64.4 H-3). The fix is correct under either outcome (per R0), but R2 must empirically confirm before finalizing the chapter. Test method documented at `docs/design/64-b-132-r0-spike.md:332-336`. **Single CRITICAL R2-VERIFY for this item.**

### B-119/B-126 fix-scope test-assertion enumeration

Per CLAUDE.md (B-119 expanded by B-126), every R1 source-code claim must enumerate test files asserting the pre-change contract so R3 has a complete checklist. The B-132 fix changes contract behavior for `reconcileClaims` Phase 2 when `inheritedTabs` is populated. Pre-existing test files affected (R3 must walk each):

- `tests/floating-position.test.js:68-91` — **PRIMARY ENUMERATION TARGET.** Asserts the URL-collision claim-jump-and-prune sequence under direct `reconcileClaims` invocation. The narrow fixture (no `markInherited` seed; no `initializeLiveState` orchestration) means the test stays mechanically valid under the fix because the new helper is not invoked — but the asserted behavior IS the buggy behavior B-132 prevents in production. **R3 decision required**: keep test as a unit-level pin of `reconcileClaims` Phase 2 raw behavior (in which case add a comment that the orchestration layer prevents this scenario in production), OR rewrite to seed `markInherited(10)` before `reconcileClaims` and assert the new skip behavior. R2 chooses; R3 implements.
- `tests/floating-position.test.js:22-66` — first two AC8 cases (lines 22-42 and 44-66): pure position-match retention without URL collision. Should remain green unchanged.
- `tests/floating-session-wipe.test.js` (three AC12 cases, lines ~22-58 per §64.11) — cold-start replay scenario; no URL collision in fixture. Should remain green unchanged. R3 confirms by inspection.
- `tests/floating-url-fallback.test.js` — URL-fallback regressions; confirm no URL-collision seeding (i.e., no test fixture seeds a `tj:floatingGroups` record AND a saved item with the same URL). Should remain green unchanged.
- `tests/b121-floating-group-render.test.js` T-121-A (lines 83-143) and T-121-K (downstream) — both seed `tj:floatingGroups` + live tabs but use unique parent/child URLs distinct from any other saved item. Should remain green unchanged. T-121-G (lines 264-279) tests the runtime `reevaluateTab` gate; unrelated to cold-start. Should remain green unchanged.
- `tests/b125-claim-jump-fix.test.js` T1-T5 — runtime `reevaluateTab` path. Should remain green unchanged.
- `tests/b099-drift-fix.test.js` — Phase 2 auto-claim contract. Confirm no test seeds `tj:floatingGroups` + URL-collision. Should remain green unchanged.
- `tests/b018-persistence.test.js` GAP-1, GAP-2, R4-H1, R4-H2 — confirm no fixture seeds a `tj:floatingGroups` record paired with a saved item having the same URL. Should remain green unchanged. R4-H2 (line 195+) noted at §64.11 — R3 must read verbatim and confirm.

If any of the above (other than `floating-position.test.js:68-91`) is found to seed a URL collision, R3 escalates to [scrum-master] for an explicit scope-change decision.

### ACCEPTANCE CRITERIA — 8 ACs (R1 LOCKED 2026-04-29)

**AC1 — Mode (b) primary fix: pre-existing floating tabs survive extension reload when their URL collides with a saved bookmark.** After extension reload, a floating tab F that was tracked in `tj:floatingGroups` pre-reload AND whose URL matches an unclaimed saved item S (`F.url === S.url`) is **NOT** auto-claimed by S during `reconcileClaims` Phase 2. F's `tj:floatingGroups` record is **NOT** pruned by `reassociateFloatingGroups` (because matched + still-unclaimed → leave-in-place per `floating-groups.js:153`). On the next `MSG_LIST_ITEMS` round-trip, F renders under its originating parent group via `buildFloatingMembers`. PASS = post-`initializeLiveState` state has `claimsMirror[S.id] === undefined` AND `tj:floatingGroups` still contains F's record AND `inheritedTabs.has(F.tabId) === true` AND `floatingMembers[parentGroupId]` includes F. FAIL = any of the four checks fails — most often `claimsMirror[S.id] === F.tabId` (claim-jump) and the floating record absent (pruned).

**AC2 — Mode (a) shallow-chain regression guard: post-reload one-hop spawn still inherits.** After extension reload, a freshly-spawned floating tab created via direct opener-chain inheritance (single hop: middle-click a link inside an already-claimed bookmarked tab; `tab.openerTabId === parentTabId`; parent is claimed by a saved item; new tab's URL does not match any saved item) is appended to `tj:floatingGroups` via `appendFloatingGroup`, marked via `markInherited`, and surfaces under the originating group. **B-121 contract preserved.** PASS = `tests/b121-floating-group-render.test.js` T-121-A + T-121-K stay green; `tests/b125-claim-jump-fix.test.js` T1-T5 stay green; new T-132-B test (post-reload simulation) confirms the same path. FAIL = any B-121 or B-125 regression OR T-132-B fails.

**AC3 — Mode (a) deep-chain carve-out (acceptable limitation).** After extension reload, a NEW middle-click inside a tab that was a **floating tab** before the reload (multi-hop opener: grandparent claimed → parent floating → child fresh-spawn post-reload) creates a tab that lands in the Open Tabs section, NOT under the originating group. This is the **AC3 carve-out** — known-acceptable degradation per `docs/design/64-b-132-r0-spike.md` §64.5 cause (2) and §64.6 "Mode (a) deep-chain (H-1')". Root cause is architectural: Chrome does not surface pre-reload `openerTabId` chains; TJ's in-memory `openerMap` (`background/tabs/opener-chain.js:12`, ephemeral) cannot be reconstructed from any persisted state. The user's recourse is to close and re-spawn from the bookmarked parent. PASS = (a) the carve-out is documented as a code comment in the relevant cold-start helper or `tab-events.js` opener-chain block, citing `docs/design/64-b-132-r0-spike.md` §64.6 H-1' analysis; (b) the user-facing behavior is documented in §64 and (if user-facing) in `docs/user-manual/`; (c) UAT case U-132-7 confirms the new tab lands in Open Tabs without console errors. **NOT FAIL** — these tabs are simply unclaimed live tabs that correctly land in Open Tabs per the existing contract for tabs without an opener-chain ancestor in `claimsMirror`.

**AC4 — Cold-start ordering invariant: `inheritedTabs` populated before `reconcileClaims` Phase 2.** A new exported helper `preMarkInheritedFromFloatingGroups()` (or equivalent name; signature TBD by R2) is called from `background/tabs/index.js:initializeLiveState` AFTER `buildLiveTabIndex` resolves and BEFORE `reconcileClaims(items)`. The helper reads `tj:floatingGroups`, runs the same position-match-then-URL-fallback resolver as `reassociateFloatingGroups` (`floating-groups.js:124-142`), and calls `markInherited(matchedTabId)` for every record whose match resolves AND whose `matchedTabId` is not already in `claimsMirror.values()`. The helper writes ZERO storage (no claim writes; no `tj:floatingGroups` writes; no `tj:tabClaims` writes) — it is a pure read-then-mark pass. PASS = unit test (T-132-C) calls the helper in isolation, asserts `inheritedTabs.has(matchedTabId) === true` AND `chrome.storage` write count is zero AND a separate ordering test (T-132-G or asserted via call-order spy) pins that the helper runs before `reconcileClaims` in `initializeLiveState`. FAIL = any storage write detected OR ordering not pinned.

**AC5 — `reconcileClaims` Phase 2 gate: skip auto-claim for `inheritedTabs` candidates.** The Phase 2 loop in `background/tabs/tab-claims.js:169-178` is extended so that when consuming candidates from `urlToTabs.get(normalized)`, any `tabId` in `inheritedTabs` is skipped (popped from the list, not claimed; the loop falls through to the next candidate or, if none, the saved item remains unclaimed). The gate mirrors the shape of the B-125 `reevaluateTab` gate at `tab-claims.js:250-252` but lives inside the `urlToTabs` consumption block. Allow-list direction (C-7): the gate is conceptually a skip-list, narrowing existing permissive auto-claim — same allow-list ruling as §59.7 C-7 (soft-degradation blast radius). PASS = T-132-A asserts that with `inheritedTabs` pre-populated for tab 200 and a saved item S whose URL matches tab 200, `claimsMirror[S.id] === undefined` post-`reconcileClaims`. T-132-F pins the mechanism explicitly (run `reconcileClaims` once without the helper to demonstrate claim-jump fires; reset; run helper; run `reconcileClaims` again; gate fires). FAIL = either test fails OR the gate is implemented inside `reevaluateTab` instead (wrong code path).

**AC6 — No regressions: full automated test suite green.** Existing test suites stay green unchanged: `tests/b121-floating-group-render.test.js`, `tests/b125-claim-jump-fix.test.js`, `tests/b099-drift-fix.test.js`, `tests/b018-persistence.test.js`, `tests/floating-session-wipe.test.js`, `tests/floating-url-fallback.test.js`, `tests/floating-shape.test.js`, `tests/floating-multi.test.js`. **The single test file requiring an R3-decision update is `tests/floating-position.test.js:68-91` (AC8 third case)** — see B-119 enumeration above. R2 chooses one of two paths; R3 implements; if rewritten, the rewrite is the SOLE pre-existing test modification. PASS = `npm test` green AND only `tests/floating-position.test.js:68-91` is modified among pre-existing tests (and only if R2 chooses the rewrite path). FAIL = any unrelated pre-existing test modified OR any non-flagged regression.

**AC7 — Test scope: new test file `tests/b132-cold-start-inheritance.test.js`.** A new file (not a modification of an existing file) covers the following test cases at minimum:
- **T-132-A** — Mode (b) URL-collision repro post-`initializeLiveState`: parent P claimed correctly; saved item S NOT claim-jumped by floating tab F; record retained; F surfaces under parent's group.
- **T-132-B** — Mode (a) shallow-chain regression guard post-cold-start: simulates SW boot complete + middle-click → new tab appended to `tj:floatingGroups` via the existing `appendFloatingGroup`/`markInherited` path.
- **T-132-C** — `preMarkInheritedFromFloatingGroups` in isolation: seeds a record + matching live tab; asserts `inheritedTabs` populated; asserts ZERO storage writes.
- **T-132-D** — URL-fallback cold-start population: position drifts, URL preserved → helper still marks via URL fallback.
- **T-132-E** — No-collision regression guard: floating tab F whose URL has no saved-item collision → record retained, F not in `claimsMirror`, F in `inheritedTabs`.
- **T-132-F** — Phase 2 gate mechanism pin: deterministically demonstrate the gate by running `reconcileClaims` without the helper (claim-jump fires) and with the helper (gate fires).

PASS = the new file contains at least these six test cases; `npm test` green; ~6-8 tests added net. FAIL = file not created OR fewer than five of the six listed cases present OR the new tests fail.

**AC8 — Out of scope (explicit non-goals)**:
(a) **No storage schema change.** `tj:floatingGroups`, `tj:tabClaims`, `tj:meta` shapes unchanged. C-1a/C-1b governance NOT triggered. No `KNOWN_VERSION` bump. No `defaultShape` update. No `MIGRATION_STEPS` step. No CHANGELOG SW module-cache flush note required.
(b) **No new message contracts.** `shared/messages.js` unchanged. No new `MSG_*` types.
(c) **No `manifest.json` changes.** No new permissions. No host-permission expansion.
(d) **No UI changes.** No new DOM elements. No new ARIA labels. No new toasts. No CSS rule changes.
(e) **Mode (a) deep-chain carve-out per AC3** — H-1' multi-hop opener post-reload spawn is documented as known-acceptable degradation, NOT fixed.
(f) **No persistence of `openerMap`.** Following Chrome's own contract (opener relationships not persisted across SW restart) is intentional; `tj:floatingGroups` IS the persistence layer for "this tab was inherited," and re-deriving `inheritedTabs` from it on cold start is the architecturally clean direction (per §64.5 cause (1) and §64.13).
(g) **`reassociateFloatingGroups` body unchanged.** B-132 introduces a NEW exported helper rather than modifying re-associate. The §60.4.3 contract is preserved verbatim.
(h) **No version bump beyond standard sprint-close roll** to `1.34.0` at S40 release.
(i) **No B-135 cross-window territory.** Cross-window opener-chain inheritance is explicitly out of scope (B-135 deferred stub).

### R3 hand-off notes (for [frontend-engineer])

**Implementation sites** (per `docs/design/64-b-132-r0-spike.md` §64.6):
1. `background/tabs/floating-groups.js` — NEW exported function `preMarkInheritedFromFloatingGroups` (~25 LOC). Signature finalized by R2. Imports `markInherited` from `tab-claims.js` (no circular-import risk; `tab-events.js` already imports it from there).
2. `background/tabs/index.js` — insert `await preMarkInheritedFromFloatingGroups(getLiveTabIndex(), getClaimsMirror())` between line 44 (close of `Promise.all`) and line 45 (`await reconcileClaims(items)`). Add `// B-132 §64.6: cold-start inheritedTabs re-population from tj:floatingGroups.` comment.
3. `background/tabs/tab-claims.js:169-178` — extend Phase 2 candidate-consumption to skip `inheritedTabs.has(candidate)`. Pop+continue pattern per §64.6 Fix C code sketch. Add `// B-132 §64.6: skip auto-claim if cold-start re-populated inheritedTabs marks this tab as opener-chain-inherited.` comment.

**STOP-and-escalate triggers** (CLAUDE.md ROUND 3 rules):
- If R3 considers deferring AC3 (deep-chain Mode-a) to a follow-up item beyond what AC3 explicitly carves out: STOP and escalate. AC3 documents the carve-out as acceptable; do not silently widen it.
- If R3 finds the `tests/floating-position.test.js:68-91` decision unclear after reading R2: STOP and escalate. The test fixture's interpretation under the new contract is an R2 design decision, not an R3 build decision.
- Cascade-prune sibling-grep does NOT apply here (no `MSG_DELETE_*` siblings touched).

### R3 risk register

- **R-1 (LOW)** — Helper-naming collision: `preMarkInheritedFromFloatingGroups` is verbose but unambiguous. R2 may shorten (e.g., `preMarkInheritedFromFloating`); R3 reflects R2's choice.
- **R-2 (LOW)** — Performance: helper adds < 1 ms per §64.7 budget; documented in AC8.
- **R-3 (MEDIUM)** — Test fixture interpretation at `tests/floating-position.test.js:68-91`: see B-119 enumeration. R3 follows R2's decision; if R2 chooses the rewrite path, this is the only pre-existing test file modified.
- **R-4 (LOW)** — Edge `chrome.storage.session` wipe semantics (R2-VERIFY 1): the fix is correct either way per §64.6, but R2 must empirically confirm before R6 close to simplify the chapter narrative.

### Confidence

**HIGH** — root cause identified with five-lines-of-evidence convergence per R0 §64.5; fix sketch is mechanically simple (3 files, ~40 LOC); single CRITICAL R2-VERIFY (storage.session wipe) does not block the fix correctness — only the documentation cleanliness. ACs 1-8 collectively pin every behavioral and non-behavioral contract; AC3 carve-out prevents R3 over-scoping; AC6 + AC7 + AC8 collectively bound the change set tightly.

---

## [security-reviewer] — B-133 R4 (Fast Track)

**Date**: 2026-04-29
**Author**: [security-reviewer]
**Scope**: Sprint 40 B-133 — Open Tabs section dotted-green indicator. Fast Track XS. Pure CSS rule-shape change at `sidepanel/sidepanel.css:1680-1691` + new regex-pin test file `tests/b133-open-tabs-dotted.test.js`.
**Diff verified via**: `git diff release/v2 -- sidepanel/sidepanel.css tests/b133-open-tabs-dotted.test.js`.

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM
_None_

### LOW
_None_

### Notes / observations

- **Threat surface**: zero net surface change. The diff replaces a single `border-left-color` token binding (`var(--live-indicator)` → `var(--floating-bar-color)`) and adds `border-left-style: dotted` on the same rule. `--floating-bar-color` is declared as `var(--live-indicator)` at `shared/themes.css:67` (verified) and unchanged in the B-133 hotfix (`git diff release/v2 -- shared/themes.css` returns empty). No new attack surface — the resolved color value is identical per-theme.
- **Manifest / permissions** (checklist 1): no change. `git diff release/v2 -- manifest.json` is empty. Confirmed.
- **CSP / eval / new Function / innerHTML / outerHTML / dynamic script injection** (checklist 2): no occurrence introduced. Diff is CSS rule body only — no JS, no template strings, no dynamic style injection, no `style` attribute writes, no `appendChild` of style nodes. Confirmed.
- **`textContent` vs `innerHTML`** (checklist 3): N/A. No JS interpolation site touched. `git diff release/v2 -- sidepanel/sidepanel.js` is empty. The `data-live-only="true"` discriminator is inherited unchanged from the existing `buildOpenTabRow`/`buildFloatingTabRow` builders (sidepanel.js:2789, 2881; per [product-manager] R1 LOCKED source-citation block).
- **Message-passing** (checklist 4): no change. `shared/messages.js` untouched. No new contracts; existing `MSG_LIST_ITEMS` round-trip path unchanged.
- **Storage** (checklist 5): no new write surface. The B-133 change is read-only in the visual sense (CSS only) and has zero effect on `chrome.storage.local` / `chrome.storage.session` / `chrome.storage.sync` write paths. No schema change. C-1a/C-1b governance correctly noted N/A in R1 LOCKED.
- **Network** (checklist 6): no fetch/XHR/WebSocket/EventSource/sendBeacon/etc. introduced. CSS rule edit only. Local-only invariant preserved.
- **Telemetry / PII logging** (checklist 7): no `console.*` introduced. The new test file `tests/b133-open-tabs-dotted.test.js` uses only `assert.ok` / `assert.match` / `assert.doesNotMatch` (Node's built-in `node:assert/strict`). No console output, no PII leak. The CSS file has no logging surface by definition.
- **Surface change analysis** (checklist 8): the `--floating-bar-color` token-resolution path is identical to the prior `--live-indicator` binding because of the `:root` fall-through declaration at `shared/themes.css:67`. All 16 per-theme blocks (per R1 LOCKED AC2 enumeration: lines 90, 145, 209, 260, 310, 361, 425, 498, 553, 618, 673, 732, 790, 847, 900, 960) declare `--live-indicator` directly; none re-declare `--floating-bar-color`, so the indirection token resolves through `:root` for every theme. No CSS-variable shadowing surface is opened. Verified via `grep -n -- "--floating-bar-color" shared/themes.css` returning a single hit at line 67.
- **Drift bar regression guard** (checklist 9): `.item-drift-bar` rule at `sidepanel/sidepanel.css:601-609` is **UNTOUCHED** by this hotfix. The diff is bounded to lines 1680-1691; lines 601-609 are 1,070+ lines distant and not in the diff hunk. B-101 dotted-orange drift bar contract preserved.
- **Active state regression guard** (checklist 10): `.item-row[data-active="true"]` rule at `sidepanel/sidepanel.css:487-490` is **UNTOUCHED** by this hotfix. The diff is bounded to lines 1680-1691; line 487-490 is far above the diff hunk. The active-row `border-left-color: var(--active-border)` binding is preserved verbatim.
- **CSS specificity / source-order regression**: the R1-LOCKED latent precedence finding is incidentally improved by this hotfix — both `[data-floating="true"]` (line 625-628) and `[data-live-only="true"]` (line 1687-1691) now bind `border-left-color: var(--floating-bar-color)`, eliminating the prior fragile reliance on `--floating-bar-color` falling through to `--live-indicator` for floating rows that match both selectors. This is a security-neutral architectural improvement (no escalation of attack surface).
- **Test file safety**: `tests/b133-open-tabs-dotted.test.js` uses `readFileSync` to read three production CSS files (`sidepanel/sidepanel.css`, `newtab/newtab.css`, `popup/popup.css`) and runs regex assertions on the source text. No `eval`, no `Function()`, no dynamic require/import, no network. Path resolution uses `fileURLToPath(import.meta.url)` + `resolve(__dirnameLocal, '..')` — bounded to the repo root. No traversal risk. The cross-surface no-op pin (T-133-B) is a defensive regression guard, not a security boundary.
- **Local-only invariant**: preserved. No telemetry, no analytics, no remote sync introduced.

**Verdict**: **CLEAN — pass**. No CRITICAL/HIGH/MEDIUM/LOW findings. B-133 is a textbook Fast Track CSS-only visual-polish hotfix with zero security blast radius. The diff is bounded to 11 lines of CSS in `sidepanel/sidepanel.css` plus 93 lines of read-only test code; both `--floating-bar-color` and `--live-indicator` resolve to the same per-theme value via the existing `:root` fall-through, so even the visual result is unchanged for every supported theme — the only user-visible effect is the dotted border style. Recommend proceeding to existing-test-suite regression confirmation (Fast Track DoD item) and marking done.

---

## [code-reviewer] — B-133 R4 (Fast Track)

**Date**: 2026-04-29
**Author**: [code-reviewer]
**Scope**: R4 Fast Track code review of B-133 R3 build (Open Tabs section dotted-green indicator visual consolidation). Read-only review of `sidepanel/sidepanel.css:1680-1691` rule edit + `tests/b133-open-tabs-dotted.test.js` new test file.
**Reference**: R1 LOCKED block above (AC1-AC5); B-130 precedent at `sidepanel/sidepanel.css:625-628`.

### Verdict

**CLEAN — no findings at any severity.** The change is a 2-line surgical CSS edit on a pre-existing rule, mirrors the B-130 precedent shape exactly, sits at the correct source-order position to override `[data-live="true"]` and `[data-active="true"]` for Open Tabs rows, and ships with two regex-pin tests that match the canonical T-124-A template. Full suite green (1734/1734); zero regressions; zero open issues. R4 Fast Track gate: PASS.

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM
_None_

### LOW
_None_

### Notes / observations

- **Source-order / cascade interaction (verified clean)**. Open Tabs rows carry BOTH `data-live="true"` (set at `sidepanel/sidepanel.js:2797`) AND `data-live-only="true"` (set at `sidepanel/sidepanel.js:2794`), and may additionally carry `data-active="true"` when the live tab is the active tab in its window. The cascade resolution table for `border-left-style` and `border-left-color` on Open Tabs rows:

  | Rule | Line | Specificity | Property bindings |
  |------|------|-------------|-------------------|
  | `.item-row` (base) | 466 | (0,1,0) | `border-left: 3px solid transparent` |
  | `.item-row[data-live="true"]` | 483 | (0,2,0) | `border-left-color: var(--live-indicator)` |
  | `.item-row[data-active="true"]` | 487 | (0,2,0) | `border-left-color: var(--active-border)` |
  | `.item-row[data-live-only="true"]` (B-133) | 1687 | (0,2,0) | `border-left-style: dotted` + `border-left-color: var(--floating-bar-color)` |

  All three attribute-selector rules have identical specificity (0,2,0). Source order resolves the tie, so the line-1687 B-133 dotted-green binding wins on every Open Tabs row regardless of `data-live` / `data-active` state. This is the intended ephemeral-state taxonomy outcome per AC1 + AC3 (active Open Tabs still display the dotted-green ephemeral cue, not the active solid `--active-border` cue). `[data-floating="true"]` (line 625) is NOT a concern: `buildOpenTabRow` does not set `data-floating` — only saved-bookmark rows that have a matching live tab carry `data-floating`, and those rows do NOT carry `data-live-only`. Floating-tab rows are unchanged by B-133.

- **R1 latent-fragility coincidental fix (confirmed)**. R1 LOCKED §150 flagged that floating-tab rows previously matched both `[data-floating]` (line 625, binds `--floating-bar-color`) AND `[data-live-only]` (line 1682, previously bound `--live-indicator`) at equal specificity — source order made `--live-indicator` win for floating rows, and the visual was identical only because `--floating-bar-color: var(--live-indicator)` falls through (`shared/themes.css:67`). The R3 edit changes line 1690 to `var(--floating-bar-color)`, so BOTH rules now bind the same token. Any future per-theme green-vs-other-hue tweak on `--floating-bar-color` will now propagate consistently to both row variants. Positive observation, not a finding.

- **DRY consideration (declined)**. B-133 produces a second rule body identical in shape to B-130's at `sidepanel/sidepanel.css:625-628` (`border-left-style: dotted` + `border-left-color: var(--floating-bar-color)`). Could be extracted to a CSS custom-property pair or a placeholder, but: (a) only two rules share the shape; (b) the codebase uses vanilla CSS — no preprocessor, no `@apply`; (c) the duplication is 2 lines per rule (4 lines total) and the documentation comments at lines 615-624 (B-130) and 1680-1686 (B-133) intentionally document the visual taxonomy at each site — extraction would obscure the semantic distinction (floating-tab cue vs Open-Tabs cue) for a 2-line saving. DRY is not violated for cohesive intent; consistent with the codebase's CSS style throughout.

- **Comment hygiene (acceptable)**. The replacement comment at `sidepanel/sidepanel.css:1680-1686` is 7 lines (vs the 2-line pre-edit comment). Length is justified: it documents (a) the ephemeral-state taxonomy rationale, (b) the dotted/solid persistent-vs-ephemeral split, (c) cross-references to B-130 (`sidepanel.css:625-628`) and `shared/themes.css:67` per the B-118 source-citation gate, (d) the per-theme fall-through invariant. Every cited line number verified accurate. No bloat — comment density is consistent with neighboring B-123 §61 (lines 479-482), B-130 (lines 612-624), and B-101 commentary throughout the file.

- **T-133-A regex-pin (correct)**. The test at `tests/b133-open-tabs-dotted.test.js:46-65` extracts the rule body via `/\.item-row\[data-live-only="true"\]\s*\{([^}]*)\}/` then runs two independent `assert.match` calls — one for `border-left-style:\s*dotted`, one for `border-left-color:\s*var\(--floating-bar-color\)`. Mirrors the canonical T-124-A template exactly. Both regexes are tolerant of whitespace variation and resilient to comment lines inside the rule body. Pass confirmed via `node --test tests/b133-open-tabs-dotted.test.js`.

- **T-133-B cross-surface no-op pin (correct, scope appropriate)**. The test asserts `newtab/newtab.css` and `popup/popup.css` do not match `/\[data-live-only/`. The regex is intentionally narrow: `data-live-only` is the unique sidepanel-only discriminator (verified — neither newtab nor popup constructs row elements with this dataset key), so its presence in those CSS files would be definitive evidence of cross-surface drift. A broader pin (e.g., asserting "no `border-left` on Open Tabs rows") would be both noisier (newtab.css legitimately uses `border-left` elsewhere — the line-474 comment mentions it) and structurally weaker. The narrow-pin choice is correct for the cross-surface no-op invariant. Pass confirmed.

- **B-118 source-citation gate (passed)**. All `file:line` citations in the new comment block (1680-1686) verified accurate: `sidepanel.css:625-628` exists and is the B-130 precedent rule; `shared/themes.css:67` declares `--floating-bar-color: var(--live-indicator)` (verified by R1 LOCKED §115). No `R2-VERIFY` markers carried into R3. Gate passes cleanly.

- **Performance (no concerns)**. CSS-only rule-body edit — no JS, no render path changes, no storage path changes. `border-left-style: dotted` and `border-left-color` do not trigger reflow on existing painted borders. Confirmed.

- **Test suite green (1734/1734)**. `npm test` post-B-133: zero regressions. `tests/b048-visual-states.test.js`, `tests/b124-floating-visual.test.js` (54 tests), `tests/b101-*.test.js`, `tests/b014-multi-window.test.js`, `tests/b024-multi-select.test.js` all green per AC4. New B-133 tests both pass.

### R5 readiness

R4 Fast Track gate is PASS. Item proceeds to existing-suite-zero-regression check (already green per Note above) → done. No findings to fix. No fix-round required.


---

## [solution-architect] — B-134 R2 summary

**Date**: 2026-04-29  
**Author**: [solution-architect]  
**Output**: `docs/design/63-b-134-tab-drag-reorder.md` (Chapter 63, ~14 sections, ~1,250 lines)  
**TOC**: `docs/SOLUTION_DESIGN.md` updated with §63 entry.

### R2-VERIFY 1 outcome

**Case 2 confirmed.** `tj:floatingGroups` records currently REQUIRE only `{groupId, windowId, tabIndex, url, savedAt}` (`background/storage/shapes.js:221-247`); OPTIONAL `floatingTabId, parentItemId, itemId` from B-121 v2. **No positional/sortOrder field today.** `buildFloatingMembers` sorts by `(windowId, tabIndex)` from live-tab geometry (`background/tabs/floating-members.js:139-144`), NOT storage order, NOT explicit field.

**Mitigation:** B-134 ADDS `sortOrder: number` (per-bucket renormalised `[0..N-1]`). Triggers full **C-1a + C-1b**:
- C-1a: `KNOWN_VERSION` v2 → v3 in `migration.js:67`; `defaultShape(PARTITION_META)` literal v3 in `shapes.js:101`; `CHANGELOG.md` SW module-cache flush note required at sprint close.
- C-1b: **lazy migration**. v2 → v3 step is no-op governance. Reads tolerate missing `sortOrder` (legacy fallback to `(windowId, tabIndex)`). Writes always stamp `sortOrder`. Records self-evict on tab close.

### Chapter 63 sections written (14 sections)

1. §63.1 Overview — 5-op table (REORDER_OPEN, REORDER_FLOATING, ATTACH, DETACH, MOVE_FLOATING) + constraint inventory.
2. §63.2 Schema impact — Case 2 disambiguation evidence + `sortOrder` field decision + C-1a/C-1b plan + validator extension + rollback compatibility note.
3. §63.3 Drag-state contract — NEW `_tabDragState` shape; mode-exclusive with `_itemDragState` + `_groupDragState`; lifecycle table; saved-bookmark row exclusion path.
4. §63.4 Hit-test logic — `_computeTabDropTarget(x, y)` signature + 6-step priority hit-test + per-zone branches + composition with B-122 helpers (mode-exclusive, no interference).
5. §63.5 sectionBottoms cache extension — `_tabDragRectCache` shape (per-group floating zones + Open Tabs per-window clusters); build path; passive-scroll invalidation; perf acceptance vs B-052/B-021.
6. §63.6 Drop handler — pseudocode for all 5 ops; `_computeReorderFloatingPayload` helper; cross-window guard.
7. §63.7 Message contracts — `MSG_REORDER_FLOATING_MEMBERS` + `MSG_MOVE_FLOATING_TAB` (constants + JSDoc Request/Response); allow-list direction; `SCOPE.ITEMS` routing.
8. §63.8 SW handlers — case branches; new exports `reorderFloatingMembers` + `moveFloatingTab`; renumber semantics; `buildFloatingMembers` sort-path extension (sortOrder priority + legacy fallback).
9. §63.9 inheritedTabs integration — explicit op→API matrix (ATTACH=markInherited; DETACH=pruneInherited; MOVE_FLOATING=no-op); failure-mode gating (side-effects only on writeTransaction success).
10. §63.10 Race-guard third branch — three guards (tab closed, broadcast race, cross-window) + `_validateTabDropPreflight` helper.
11. §63.11 C-1..C-12 closure — explicit verdict per check; **C-1a + C-1b APPLIES**, others APPLIES (C-2 typed contracts, C-3 SW cold-start safe, C-4 ID stability, C-7 allow-list, C-8 SW context, C-9 empty-state) or N/A (C-5 manifest paths, C-6 permissions, C-10 off-screen, C-11 popup-lifecycle, C-12 manifest runtime-mutability).
12. §63.12 Fix-scope test-assertion enumeration — 13 test files identified; explicit table per surface (drag-state, message contracts, floating-record shape, schema migration); update verdicts + new file plan.
13. §63.13 R3 build plan — 8 source files (~790 LOC) + 4 test files (~530 LOC); recommended build sequence (schema → SW → renderer); test count delta +25-30 from baseline 1,732.
14. §63.14 Open R3-VERIFY markers — 6 markers including the load-bearing **R3-VERIFY 1** (tabId → floatingTabId resolution; recommended Strategy A re-resolve via `(windowId, tabIndex)`).

Plus §63.15 Edge cases (10 enumerated), §63.16 Rollback plan (code + storage + inheritedTabs + user-visible + SW flush), §63.17 Cross-references.

### C-1..C-12 closures — open issues

**No open issues at R2.** All 12 checks have explicit verdicts in §63.11. R3 must execute C-1a + C-1b mechanically (KNOWN_VERSION bump + lazy validator + CHANGELOG note); other checks are N/A or self-applying.

### Fix-scope test-assertion enumeration

**13 test files identified:**
- Drag-state pins: `tests/b122-drag-to-root.test.js` (no change), `tests/b031-group-drag.test.js` (no change).
- Message contracts: `tests/messages-held.test.js` (+2 entries).
- Floating-record shape: `tests/floating-shape.test.js` (+`sortOrder` assertion), `tests/floating-multi.test.js` (no change), `tests/floating-position.test.js` (no change), `tests/b121-floating-group-render.test.js` (no change), `tests/b125-claim-jump-fix.test.js` (no change), `tests/b018-persistence.test.js` (no change), `tests/b099-drift-fix.test.js` (no change), `tests/floating-ready-gate.test.js` (no change), `tests/floating-session-wipe.test.js` (no change), `tests/floating-url-fallback.test.js` (no change).
- Schema migration: `tests/migration-steps.test.js` (KNOWN_VERSION → 3; +1 v2→v3 test).
- NEW: `tests/b134-tab-drag-reorder.test.js` (~25 tests; ~500 LOC).

### R3 build plan summary (~3-5 file modifications expected)

Top-level diffs: `shared/messages.js` (constants + typedefs), `background/storage/{shapes.js, migration.js}` (Case 2 schema bump), `background/tabs/{floating-groups.js, floating-members.js}` (new exports + sort path), `background/messages/storage-handlers.js` (new case branches + scope routing + inheritedTabs side-effects), `sidepanel/sidepanel.js` (largest delta — `_tabDragState` + cache + hit-test + dragstart/dragover/drop wiring + race-guard helper). Estimated ~790 LOC source + ~530 LOC tests (~1,320 LOC total).

### Top R3-VERIFY markers (preview for build round)

- **R3-VERIFY 1 (CRITICAL):** tabId → floatingTabId resolution at write time. R2 recommends Strategy A (re-resolve via `(windowId, tabIndex)` inside the mutator). Strategy B (descriptor extension) rejected as higher blast radius. R3 implements Strategy A; the test harness pins the renumbered output, not the resolution mechanism.
- **R3-VERIFY 2:** `_cachedOpenTabsGen` + `_cachedFloatingMembersGen` likely DO NOT exist today; R3 adds both counters in the same pattern as `_cachedItemsGen`.
- **R3-VERIFY 3:** `setDragImage` quality — defer to UAT; do NOT add for v1.
- **R3-VERIFY 4:** `chrome.tabs.move` index semantics — R2 verdict: literal user-target index, no -1 adjustment for same-window (per Chrome docs).
- **R3-VERIFY 5:** cross-surface coverage — sidepanel-only for v1 (newtab + popup deferred per R1 LOCK).

### Anything that should escalate back to R1?

**No escalation required.** The R1 LOCKED 8-AC block is internally consistent; R2 was able to produce a complete chapter without re-opening AC text. The sole load-bearing R2 question (R2-VERIFY 1) was disambiguated to Case 2 with full C-1a/C-1b compliance, which the R1 block explicitly accommodated ("Case 2 adds ~half-effort-unit for the schema-bump compliance").

One minor R3-time UX caveat is filed (§63.15 — ATTACH to empty group rejects at SW write time; UAT may surface this as confusing, in which case R3 adds a hit-test-time guard so the indicator never shows "drop is allowed" on empty groups). This is a polish-backlog candidate, not an R1 revision.
