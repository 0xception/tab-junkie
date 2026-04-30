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

---

## [code-reviewer] — B-134 R4 anchor (Full M-tier)

**Date**: 2026-04-29
**Reviewer**: [code-reviewer] (Sonnet)
**Commit**: `c3e7503` on `feature/sprint-40-drag-reorder`
**Files reviewed (8 source + 4 tests)**: `shared/messages.js` (+74), `background/storage/shapes.js` (+21), `background/storage/migration.js` (+22), `background/tabs/floating-groups.js` (+289), `background/tabs/floating-members.js` (+21), `background/messages/storage-handlers.js` (+95), `sidepanel/sidepanel.js` (+672), `sidepanel/sidepanel.css` (+28), `tests/b134-tab-drag-reorder.test.js` (NEW), `tests/floating-shape.test.js` (+57), `tests/migration-steps.test.js` (+59), `tests/chrome-mock.js` (+21).

### Verdict

**APPROVE for R5.** No CRITICAL or HIGH findings. The build is clean, hits all R2 contracts, and the source-text discipline closely mirrors B-122/B-030/B-031 patterns. Twenty-six tests pass; the full suite (1772/1772) shows zero regressions. A handful of MEDIUM/LOW observations are recorded for follow-up consideration; none gate R5.

### CRITICAL (must fix before R5)

_None_

### HIGH (must fix before R5)

_None_

### MEDIUM (fix if time permits)

| # | Item | File | Finding | Fix |
|---|------|------|---------|-----|
| M-1 | Failed `moveFloatingTab` race-fail still writes a no-op | `background/tabs/floating-groups.js:399-413` | When `sourceIdx === -1` (race fail), the mutator sets `ok = false` and returns the unchanged `arr`. `writeTransaction` will still validate + perform a `chrome.storage.local.set` of the unchanged array. Wasteful but not harmful; the post-write `markInherited`/`pruneInherited` is correctly gated on `ok` via the handler-level `if (!ok) return { moved: false, reason: 'ERR_RACE' }`. | Short-circuit before `writeTransaction` by performing the source-record existence probe outside the mutator (parallel to the `targetGroupId` parent-item probe at lines 388-397), or throw a sentinel inside the mutator that writeTransaction's StorageError path can recognise. |
| M-2 | Test gap: SW-side parity-mismatch path for `reorderFloatingMembers` is unexercised | `tests/b134-tab-drag-reorder.test.js` | `reorderFloatingMembers(groupId, orderedTabIds)` returns `false` when (a) `_resolveRecordIndexByTabId` returns -1 for any supplied tabId, or (b) `storageBucketSize !== supplied.size`. T7 covers tab-vanished via `moveFloatingTab`, but **no test** asserts the reorder-handler's race behavior — e.g., supplying an `orderedTabIds` that includes a tabId not in the group, or an `orderedTabIds` that misses a tabId currently in the group. | Add T-extra: seed two floating records in group G, call `reorderFloatingMembers(G, [tab1])` (under-supply) and `reorderFloatingMembers(G, [tab1, tab2, tab3])` (over-supply with stale tabId) — both should return false and leave storage untouched. |
| M-3 | Test gap: `_validateTabDropPreflight` cross-window guard branch unexercised at runtime | `tests/b134-tab-drag-reorder.test.js:635-651` | T21 source-text-pins all three guards' presence, but no integration test invokes `_validateTabDropPreflight` with a state whose `pendingMode === 'REORDER_OPEN'` and `pendingTargetWindowId !== sourceWindowId`. The gen-counter mismatch branch is also unexercised. Source-text pins detect _disappearance_, not _logic regressions_. | Either (a) extract `_validateTabDropPreflight` to a module-level export so tests can call it directly with synthetic state, or (b) accept that this is a sidepanel-side concern and rely on UAT-13 / UAT-14 (R5) for behavior coverage. Option (b) is acceptable given the B-122 precedent of source-text pins for sidepanel-internal helpers. |
| M-4 | `MOVE_FLOATING` re-anchors `parentItemId` to the destination group's first item, deviating from R2 §63.8.2 pseudocode | `background/tabs/floating-groups.js:382-397` and `:455-464` | R2 §63.8.2 (chapter line 734) states "For MOVE_FLOATING and DETACH: re-use the source record's parentItemId". R3 instead **always** resolves `newParentItemId` from the destination group's first item when `targetGroupId !== null`, which means MOVE_FLOATING re-anchors the parent. This is arguably correct (the floating record now lives under a new group, so its parent should be that group's first item, not the now-unrelated source group's item), but it deviates from the documented design. T6 passes because the test asserts `parentItemId === itemB.id` (the destination group's item). | Either (a) update R2 §63.8.2 in R6 to reflect the actual semantics, or (b) change R3 to preserve `sourceRecord.parentItemId` for MOVE_FLOATING. The current behavior matches what the renderer expects (the floating row appears under the parent item in `targetGroupId`'s section), so option (a) is the cleaner reconciliation. Surface to [solution-architect] R6 for documentation update. |

### LOW (defer)

| # | Item | File | Finding | Notes |
|---|------|------|---------|-------|
| L-1 | `_resolveRecordIndexByTabId` invoked twice per reorder (outside + inside mutator) | `background/tabs/floating-groups.js:307-313` and `:332-337` | The outer parity-check loop walks records read OUTSIDE the writeTransaction (line 298), and the mutator re-walks them INSIDE. The two loops are functionally redundant (the outer loop is defensive belt-and-braces; the inner loop is canonical). Cost is bounded (≤ 5 records per group typical). | Keep both — the outer parity check provides an early-exit on stale data without consuming a write transaction slot. |
| L-2 | `chrome-mock`'s `tabs.get(missingId)` returns `null` instead of rejecting | `tests/chrome-mock.js:199-202` | Production Chrome rejects `chrome.tabs.get(invalidId)` with an error; the mock returns `null`. T7 exercises the null branch (`if (!liveTab) return false`) rather than the throw branch. Both branches converge on the same return value, so the bug-hunting coverage is equivalent — but the test hides the throw path. | Pre-existing chrome-mock divergence. Note in test comment; do not change. |
| L-3 | `_floatingRecordCompare` falls back to `(windowId, tabIndex)` for legacy records mid-renumber | `background/tabs/floating-groups.js:484-492` | When MOVE_FLOATING moves a record from a bucket containing legacy v2 records (no sortOrder), the renumber sorts those records by `(windowId, tabIndex)` and stamps `sortOrder` on each. This is the design-intended opportunistic upgrade per R2 §63.8.3. | Working as intended; behavior covered by T14 + T15. |
| L-4 | `_buildTabDragRectCache` reads `getBoundingClientRect` for every floating row at dragstart | `sidepanel/sidepanel.js:5945-6011` | Dragstart-time cost is O(groups + floating-rows + open-tabs-rows). Bounded in practice (≤ 50 groups × 5 floating ≈ 250 rect reads). | Within the ≤ 200 ms budget. Same pattern as B-031 / B-122. |
| L-5 | Drag mode-exclusivity guards rely on dragstart selector dispatch + state null-check; cross-handler stuck-state risk | `sidepanel/sidepanel.js:4322` and `:4630` | The defense-in-depth at line 4322 (`if (_itemDragState || _groupDragState)`) only fires when a previous drag left state non-null due to an error path. A symmetric guard at the item-drag (`if (_tabDragState || _groupDragState)`) and group-drag (`if (_tabDragState || _itemDragState)`) entry points is missing — the existing item/group-drag dragstart code presumes mode-exclusivity without reciprocal checks. | Pre-existing pattern in B-030/B-031. Could be tightened, but no observed failure mode in tests. Leave for a future drag-handler refactor sprint. |

### Notes / observations

- **Architecture / patterns (item 1):** `_tabDragState`, `_tabDragRectCache`, drag handlers compose correctly with `_groupDragState` / `_itemDragState`. Mode-exclusivity is enforced at dragstart-tab-drag-branch via the explicit guard at `sidepanel/sidepanel.js:4322`. The dragover dispatcher at `:4565-4599` and drop dispatcher at `:4626-4714` route via `if (_tabDragState)` first, mirroring the B-031 pattern. No mode-violation possible in the steady state.

- **DRY (item 2):** Three drag pipelines (item / group / tab) share structural parallelism (`_buildXDragRectCache`, `_scheduleXDragTick`, `_xDragTick`, `_cleanupXDragDom`) but diverge in hit-test logic per surface. A shared base helper would risk over-abstraction; current mirrored structure is acceptable per B-122 precedent.

- **Performance (item 3):** `_buildTabDragRectCache` is bounded (see L-4). `_computeTabDropTarget` is O(groups) for the floating-zone scan + O(1) for the Open Tabs cluster lookup (Map.get). The rAF tick coalesces dragover events at frame cadence. Skip-no-op (sidepanel.js:6043-6048) eliminates redundant DOM writes when target is unchanged.

- **Dead code / TODO / console.log (item 4):** Zero TODOs, zero `console.log`. One `console.warn` at sidepanel.js:4710 in the drop error-handler — acceptable per existing B-033 / B-001a precedent.

- **Test quality (item 5):** T1-T26 cover all 8 ACs:
  - AC1 (REORDER_OPEN literal index) → T1
  - AC2 (cross-window REJECT) → T2 + T22 (source-text)
  - AC3 (REORDER_FLOATING atomic sortOrder) → T3
  - AC4 (ATTACH + markInherited) → T4
  - AC5 (DETACH + pruneInherited) → T5
  - AC6 (MOVE_FLOATING atomic) → T6
  - AC7 (race-guards) → T7 + T21 (source-text)
  - AC8 (cleanup + UAT) → T19 + T20 (drag-state + cache)
  - **Coverage gap M-2** (SW-side reorder parity mismatch).

- **C-1a + C-1b compliance (item 6):**
  - `KNOWN_VERSION = 3` → `background/storage/migration.js:76` ✓
  - `defaultShape(PARTITION_META)` returns `{ schemaVersion: 3, ... }` → `background/storage/shapes.js:105` ✓
  - v2→v3 no-op governance step → `background/storage/migration.js:108-112` ✓
  - Lazy migration: `assertShape` PARTITION_FLOATING_GROUPS tolerates missing `sortOrder` → `background/storage/shapes.js:255-259` ✓; `buildFloatingMembers` falls back to `(windowId, tabIndex)` when sortOrder absent → `background/tabs/floating-members.js:150-160` ✓
  - SW module-cache flush note in CHANGELOG — out of R3 scope; release-manager's responsibility at sprint close. No new pref keys introduced (denseLayout was added in S30 B-092), so the SW-cache flush note may apply only to the schema-version migration path.

- **Strategy A implementation (R3-VERIFY 1, item 7):** `_resolveRecordIndexByTabId` defined at `background/tabs/floating-groups.js:254-266`; used in both `reorderFloatingMembers` (lines 309 outer parity check + 333 inside mutator) AND `moveFloatingTab` (line 409 inside mutator). ✓

- **Cascade-prune sibling-grep (item 8):** B-134 introduces no new saved-item delete paths; both new write surfaces (`reorderFloatingMembers`, `moveFloatingTab`) write to `tj:floatingGroups` only. Existing cascade-prune sites (`MSG_DELETE_ITEM`, `MSG_BULK_DELETE_ITEMS`, `MSG_DELETE_GROUP`) remain unchanged. No B-129 sibling-grep risk. ✓

- **Race-guard symmetry (item 9):** `_validateTabDropPreflight` covers all three guards (A: chrome.tabs.get; B: gen counters; C: cross-window REORDER_OPEN). Defensive double-check at storage layer: `moveFloatingTab` re-checks the live tab via `chrome.tabs.get` at line 376. ✓ Test M-3 notes the runtime guard B/C branches are not exercised at runtime, only source-text-pinned.

- **Empty-state coverage (item 10, CLAUDE.md C-9):**
  - Zero floating tabs in target group + zero saved items → ATTACH rejected (T10) ✓
  - Zero floating tabs in target group + ≥ 1 saved item → ATTACH accepted (T4) ✓
  - Same-position no-op → T18 (algorithm) + T11 (handler idempotency) ✓
  - Cross-window REJECT → T2 + T22 (source-text) ✓
  - Empty Open Tabs section → not directly tested; hit-test handles it via `cluster=null` fallback at sidepanel.js:6261 ✓

- **Cross-cutting concerns (item 11):**
  - `MSG_REORDER_FLOATING_MEMBERS` and `MSG_MOVE_FLOATING_TAB` in `MUTATION_BROADCASTS` → `background/messages/storage-handlers.js:141-142` ✓
  - Both messages in `WRITE_MESSAGE_TYPES` (safe-mode block) → `background/messages/storage-handlers.js:171-172` ✓
  - `inheritedTabs` side-effects fire post-write only: `background/messages/storage-handlers.js:746-751` — `markInherited` / `pruneInherited` called AFTER `await moveFloatingTab(...)` resolves successfully ✓

### R5 readiness

R5 may proceed. [test-engineer] should consider M-2 (SW-side parity-mismatch test) as an additive coverage candidate during R5 test authoring. M-3 may be folded into UAT (cross-window cancel + broadcast-race retry visual). M-4 should be surfaced to [solution-architect] at R6 for R2 chapter reconciliation (whether to update §63.8.2 pseudocode or change the implementation).

---

## [security-reviewer] — B-134 R4 anchor (Full M-tier)

**Date**: 2026-04-29
**Branch / commit**: `feature/sprint-40-drag-reorder` @ `c3e7503`
**Scope**: Security review of B-134 R3 build (drag-and-drop reorder for open tabs and floating tabs).
**Files audited**: `manifest.json`, `shared/messages.js`, `background/messages/storage-handlers.js`, `background/tabs/floating-groups.js`, `background/tabs/floating-members.js`, `background/storage/migration.js`, `background/storage/shapes.js`, `sidepanel/sidepanel.js` (drag handlers / hit-test / preflight).

### CRITICAL (must fix before R5)

_None._

### HIGH (must fix before R5)

_None._

### MEDIUM (fix if time permits)

| # | Item | File | Finding | Fix |
|---|------|------|---------|-----|
| M-1 | `orderedTabIds` lacks upper-bound length cap | `background/messages/storage-handlers.js:702-709` + `background/tabs/floating-groups.js:285-322` | The handler validates non-empty + dedup + element types, but does not impose an upper bound on `orderedTabIds.length` analogous to `MAX_BULK_INPUTS = 500` (B-025/B-030 precedent). A malformed (or malicious internal) caller passing an array of `>= 1e6` numbers forces `_resolveRecordIndexByTabId` to scan storage records once per supplied id (O(records × supplied)) before the `storageBucketSize !== supplied.size` parity check rejects. Memory bounded (the array does not get persisted), but CPU on the SW thread is not. Local-only extension trust boundary mitigates real-world impact (only the popup/sidepanel can dispatch this), but defense-in-depth is the project standard at write-message validators (cf. MAX_BULK_INPUTS at `shared/export-schema.js`). | Add an explicit guard: `if (p.orderedTabIds.length > MAX_BULK_INPUTS) return { reordered: false, reason: 'ERR_VALIDATION' };` before the per-element loop at `storage-handlers.js:705`. Alternatively cap at a smaller floating-bucket-realistic constant (e.g., 50) since real-world floating-member buckets are bounded by user-spawned opener-chain children. |
| M-2 | `insertIndex` lacks upper-bound check | `background/messages/storage-handlers.js:736-740` + `background/tabs/floating-groups.js:368-370` | `MSG_MOVE_FLOATING_TAB` validates `insertIndex` is finite + non-negative, but not bounded above. The `moveFloatingTab` mutator clamps via `Math.max(0, Math.min(insertIndex, tgtRecords.length))` at `floating-groups.js:444`, so the persisted record is always in-bucket-range; HOWEVER the unclamped value is also tested against `>= clampedIdx` at line 452 in a renumber loop that uses `r.sortOrder >= clampedIdx`, which is correct because clamping happens before. No actual storage corruption surface, but the missing upper cap means `insertIndex = Number.MAX_SAFE_INTEGER` is silently accepted at the message boundary instead of rejected with ERR_VALIDATION — divergence from the project's general "tight typed boundary" policy. | Add `|| p.insertIndex > MAX_BULK_INPUTS` (or a smaller realistic cap) to the validator at `storage-handlers.js:736-740`. Inert change because clamping already enforces correctness, but tightens the wire contract. |
| M-3 | `MSG_REORDER_FLOATING_MEMBERS` payload — `groupId` length unbounded | `background/messages/storage-handlers.js:699-701` | The validator accepts any non-empty string for `groupId`. Other write messages in the codebase that store groupId values gate via the storage-layer validator's MAX_NAME = 256 cap on the *group's name*, but the `groupId` itself (a ulid) has no length cap on the message wire. A ~1 MB string would fail the parity check at `floating-groups.js:298-322` (no record matches), so no persistence — just wasted SW cycles + a transient large-string allocation. Consistent with M-1: defense-in-depth at the trust boundary. Same pattern repeats at `MSG_MOVE_FLOATING_TAB` for both `sourceGroupId` and `targetGroupId` (`storage-handlers.js:722-728`). | Add a length cap (e.g., 64 or MAX_NAME) to all three groupId fields in the new validators. Low blast radius, hardens against accidental client-side bugs sending unbounded strings. |

### LOW (defer)

| # | Item | File | Finding |
|---|------|------|---------|
| L-1 | Race-guard at storage layer cannot detect cross-window source mid-drag | `background/tabs/floating-groups.js:374-380` | `moveFloatingTab` calls `chrome.tabs.get(tabId)` to verify the tab is still alive, but does NOT verify it remained in the source window for op 5 (MOVE_FLOATING). The drop-handler preflight at `sidepanel/sidepanel.js:6300-6325` checks cross-window in `_validateTabDropPreflight`, which is the primary guard. If a tab is dragged between windows by some other means after dragstart but before drop (e.g., user uses keyboard shortcut to move the tab while drag is in flight), the preflight catches it via the broadcast-race generation counter (`_cachedOpenTabsGen`/`_cachedFloatingMembersGen` advance when LiveTabIndex changes). Storage-layer second-line defense exists indirectly via `_resolveRecordIndexByTabId` re-checking `(windowId, tabIndex)` geometry against the LiveTabIndex inside the mutator; if windowId no longer matches, sourceIdx is -1 and the mutator returns `ok=false`. So this is well-defended, just opaque. Recommend adding a comment cross-referencing the three-layer guard for future readers. |
| L-2 | `errorEnvelope` does not strip `cause` field for unknown errors | `background/messages/storage-handlers.js:189-197` | Pre-existing pattern (not introduced by B-134). The unknown-error path emits `{code, message: 'Internal error', cause: err?.message}` — `cause` carries the original error message verbatim (e.g., `chrome.tabs.move` failure strings). Not a B-134 regression; B-134's new handlers explicitly catch internal failures and return typed envelopes (no path through `errorEnvelope`). No action for this sprint. Document for future review. |
| L-3 | Schema v3 governance bump requires SW module-cache flush note in CHANGELOG | `background/storage/migration.js:76` + `background/storage/shapes.js:96-105` | Per CLAUDE.md C-1a (Sprint 30 B-092 precedent), schema-version increments require an explicit "extension toggle OFF→ON after update" note in CHANGELOG so users flush the SW module cache. R6 [solution-architect] / sprint-close [release-manager] should ensure this is added. NOT a B-134 R3 build defect — the source code changes are correct. Flag for sprint-close diligence. |

### Notes / observations

- **Manifest unchanged** — `manifest.json` shows existing permissions only (`tabs`, `tabGroups`, `storage`, `sidePanel`, `search`); no new permissions requested. `chrome.tabs.move` is covered by the existing `tabs` permission. C-6 + R1 AC8 + R2 §63.11 verified clean.
- **CSP / eval / new Function / dynamic script** — Zero new occurrences in the diff. No CSP relaxation. Confirmed via grep on the 21-file diff.
- **XSS surface clean** — All tab title/URL rendering goes through `textContent` (`sidepanel.js:1611-1612`, `:1894`, `:2898`, `:2902`, `:3416-3417`, `:3449`). The B-134 changes do not introduce new innerHTML / outerHTML / template-string interpolation of tab.title or tab.url. The `setData('text/plain', ...)` calls at `sidepanel.js:4371` (tab drag) and `:4434` (item drag) carry only `String(tabId)` / item id strings; no PII serialized into dataTransfer. Drop indicator is positioned via CSS transform — no string interpolation.
- **`chrome.tabs.move` uses `tabId` only** — no URL injection surface (`sidepanel.js:4670`). Confirmed C-7 allow-list direction is unaffected.
- **Sender identity verified** — `registerStorageHandlers` at `storage-handlers.js:768-771` rejects any sender whose `id !== chrome.runtime.id`, which covers external web pages and other extensions. Both new messages route through this gate. The `tj/*` namespace is exclusively claimed by this dispatcher (`:779`); other listeners do not see them.
- **`WRITE_MESSAGE_TYPES` correctly includes both new messages** — `storage-handlers.js:171-172`. Safe-mode write-block honors them. Verified.
- **Atomic writes** — Both `reorderFloatingMembers` (`floating-groups.js:324-340`) and `moveFloatingTab` (`floating-groups.js:400-474`) wrap mutations in a single `writeTransaction`. Cross-group MOVE_FLOATING renumbers source AND target buckets inside one mutator (lines 419-422 + 449-453 + 466-469), so partial state is not persistable. C-1b lazy migration (no-op step v2→v3) correctly relies on validators tolerating the missing optional `sortOrder` (`shapes.js:251-259`) and `buildFloatingMembers` falling back to `(windowId, tabIndex)` (`floating-members.js:151-160`).
- **C-1a/C-1b compliance** — `KNOWN_VERSION = 3` (`migration.js:76`), `defaultShape(PARTITION_META)` returns `{ schemaVersion: 3 }` (`shapes.js:105`), `MIGRATION_STEPS` has both v1→v2 (B-121) and v2→v3 (B-134) no-op steps with correct fromVersion/toVersion contiguity (`migration.js:91-113`). Static F2 contiguity check at `migration.js:127-135` would have thrown on a broken chain — passes.
- **inheritedTabs side-effect ordering correct** — `markInherited` (ATTACH) and `pruneInherited` (DETACH) fire AFTER `moveFloatingTab` resolves true (`storage-handlers.js:742-751`). MOVE_FLOATING (op 5) is correctly a no-op on inheritedTabs (the dragged tab was already in the set). Verified against R2 §63.9.2 invariant.
- **Cascade-prune sibling-grep (B-129 carry-forward)** — B-134 introduces no new delete paths. Existing cascade coverage at `storage-handlers.js:226-237` (MSG_DELETE_ITEM), `:259-274` (MSG_BULK_DELETE_ITEMS), `:286-310` (MSG_DELETE_GROUP) correctly invokes `pruneFloatingGroupsByParentItemId` for any saved item whose deletion would orphan a floatingGroups record. Records written by B-134's ATTACH/MOVE_FLOATING (which carry `parentItemId`) are correctly cleaned up by the same cascade. Verified.
- **Race guard third branch (F-5)** — `_validateTabDropPreflight` at `sidepanel.js:6300-6325` checks: (A) tab still alive via `chrome.tabs.get`, (B) broadcast-race via generation counters `cachedFloatingMembersGen` / `cachedOpenTabsGen`, (C) cross-window for REORDER_OPEN. Storage-layer mutator does its own re-check at `floating-groups.js:374-380` + `_resolveRecordIndexByTabId` window/index geometry (`:254-266`). Defense-in-depth verified.
- **Drag image / setDragImage** — Native browser API, no string-interpolation surface in B-134. The B-025 multi-item drag ghost (`sidepanel.js:4469-4490`) is unchanged and uses `_buildMultiDragGhost` which itself uses `textContent`. Drop indicator (`itemDragIndicatorEl`) is a stable child element positioned via CSS transform; no innerHTML writes. Per R2 §63.14.3, ghost-quality assessment deferred to UAT — no security implication.
- **Drag-state mode-exclusivity verified** — `dragstart` handler at `sidepanel.js:4318-4348` selects exactly one of `_tabDragState`/`_itemDragState`/`_groupDragState` per drag based on data-attribute selector dispatch. Mode-exclusivity guard at `:4322-4325` bails if any other state is non-null at dragstart, preventing concurrent-state corruption.
- **Wire-shape errors do not leak internals** — Both new handlers return `{reordered:false, reason:'ERR_VALIDATION'|'ERR_RACE'}` / `{moved:false, reason:'ERR_VALIDATION'|'ERR_RACE'}` — fixed strings, no payload echo, no stack trace, no file paths. Verified at `storage-handlers.js:699-753`.
- **Sender-identity whitespace** — note that `registerStorageHandlers` checks `sender.id !== chrome.runtime.id` (`storage-handlers.js:768`). For B-134 message types (which start with `tj/` per `:779`), only this dispatcher claims them; foreign-extension messages with a `tj/*` type would be rejected at the sender-id gate. Verified.

### Verdict

**APPROVED for R5.** Zero CRITICAL or HIGH findings. Three MEDIUM defense-in-depth recommendations (M-1/M-2/M-3 — payload upper bounds) and three LOW observations (L-1 cross-window guard documentation, L-2 pre-existing errorEnvelope cause field, L-3 sprint-close CHANGELOG note). Recommend [frontend-engineer] address M-1 + M-2 + M-3 before R5 (small, low-risk additions that align with the project's tight-typed-boundary policy and `MAX_BULK_INPUTS` precedent), but none are blockers — race guards downstream of the validators already prevent any storage-corruption or DoS outcome in the realistic local-only-extension threat model.

---

## [qa-reviewer] — B-132 R4 anchor (Full M-tier)

**Date**: 2026-04-29
**Author**: [qa-reviewer]
**Scope**: Sprint 40 B-132 — cold-start floating-tab claim-jump fix. Three production files (`background/tabs/floating-groups.js`, `background/tabs/index.js`, `background/tabs/tab-claims.js`) + new test file `tests/b132-cold-start-inheritance.test.js` (8 tests) + 1 comment-only edit to `tests/floating-position.test.js`.
**Diff verified via**: `git diff HEAD background/tabs/ tests/floating-position.test.js` + Read of `tests/b132-cold-start-inheritance.test.js`.
**R2 chapter**: `docs/design/65-b-132-cold-start-claim-jump-fix.md`. **R1 LOCKED**: 8 ACs above.

### CRITICAL (must fix before R5)
_None_

### HIGH (must fix before R5)
_None_

### MEDIUM (fix if time permits)

| # | Item | File | Finding | Fix |
|---|------|------|---------|-----|
| M-1 | Missing R3-V STOP-and-escalate triggers — three pre-existing tests carry the same URL-collision pattern that R2 §65.10 explicitly addressed for `floating-position.test.js:68-91`, but R3 only commented the latter. | `tests/floating-multi.test.js:45-74` (AC11 second case — floating record at `https://x.com` + saved item `someClaimedItem` at `https://x.com`); `tests/floating-ready-gate.test.js:23-45` (AC10 — floating record + saved item both at `https://live.com`); `tests/b018-persistence.test.js:106-131` (GAP-2 — floating record + saved item both at `https://parent.com`) | All three seed a `tj:floatingGroups` record AND a saved item with the same URL — exactly the shape R1 LOCKED §314-327 enumeration flagged for STOP-and-escalate. The tests stay mechanically green only because they bypass `initializeLiveState` and call `reconcileClaims` directly (helper never runs → empty `inheritedTabs` → gate is dead code). In production with the helper, behavior would invert: the floating tab would be marked inherited, Phase 2 would skip it, the saved item would NOT be claimed, and the prune branch in `reassociateFloatingGroups` would NOT fire. The unit-level contract these tests pin is still load-bearing for the no-inheritance code path, but R3 omitted the clarifying-comment treatment R2 §65.10 explicitly applied to `floating-position.test.js:68-91`. | Add a clarifying comment block (mirroring the one at `tests/floating-position.test.js:68-77`) to each of the three tests, noting that the test bypasses the cold-start helper and that the asserted behavior is the unit-level no-inheritance contract; production behavior with the helper invokes the gate. No assertion change. ~3 LOC × 3 sites = ~9 LOC of comment-only addition. |
| M-2 | Defensive `try`/`catch` around the new cold-start helper. | `background/tabs/index.js:50` (`await preMarkInheritedFromFloatingGroups();`) | The helper invokes `readPartition(PARTITION_FLOATING_GROUPS)` (line 593) which can throw `StorageError` per `background/storage/partitions.js:71-82` if the partition is corrupt. An unwrapped throw propagates to `initializeLiveState`, which is `.catch()`-wrapped at `background/service-worker.js:49-51` — so the SW does not crash, but `reconcileClaims` and `reassociateFloatingGroups` never run, leaving `claimsMirror = {}` for the entire SW lifetime (until next reload). Pre-B-132, the same risk existed for `reassociateFloatingGroups` (post-reconcile), so this is not a NEW class of risk; B-132 adds a SECOND failure surface that can prevent `reconcileClaims` from running at all. The pre-existing `reassociateFloatingGroups` failure mode is asymmetric (claims established, only re-association skipped) whereas the new helper failure blocks every downstream step. | Either (a) wrap the helper call in `try { await preMarkInheritedFromFloatingGroups(); } catch (e) { console.warn('[tab-junkie] B-132 helper failed', e); }` so subsequent `reconcileClaims` still runs — graceful degradation to pre-fix behavior under storage corruption; OR (b) document explicitly that the helper is allowed to fail-loud since corruption is already a SEV2 condition. R2 §65.4 says "writes ZERO storage" but does not address read-side failure. Recommend (a) for defensive parity with the rest of the cold-start orchestration. |

### LOW (defer)

| # | Item | File | Finding | Fix |
|---|------|------|---------|-----|
| L-1 | `claimedTabIds` guard is dead code at cold-start time. | `background/tabs/floating-groups.js:598` (`const claimedTabIds = new Set(Object.values(claimsMirror));`) and line 628 (`!claimedTabIds.has(matchedTabId)`) | At the moment the helper runs, `claimsMirror` is module-scope `{}` (only populated by `reconcileClaims` line 200). So `claimedTabIds` is always an empty Set at helper invocation time, making the `!claimedTabIds.has(matchedTabId)` guard always true. R2 §65.6 case (ii) describes a hypothetical where `chrome.storage.session` survives reload AND `claimsMirror` hydrates earlier — but R2 §65.2 confirmed that scenario does not occur (session storage is wiped on extension reload). The guard is defensive and correct under the documented contract; it just never triggers in practice. | Either (a) keep as defensive coding (current state) — fine; OR (b) add a one-line comment noting the guard is dead-but-defensive, mirroring the §65.6 case-2 hypothetical. No code change required for correctness. |
| L-2 | Helper does not log when no records resolve. | `background/tabs/floating-groups.js:592-632` | The helper has no observability: a cold start with N records and zero matches looks identical to a cold start with zero records (both no-op). For UAT debugging when something goes wrong post-reload, a single `console.debug` (gated to be silent in production via the existing `console.warn` precedent in `tab-claims.js:125`) noting "B-132 helper marked N tabs inherited" would aid R5 UAT reproducibility. | Optional: add `if (markedCount > 0) console.debug('[tab-junkie] B-132 pre-marked', markedCount, 'inherited tabs from cold-start');`. Defer if production-noise concern outweighs UAT diagnostic value — CLAUDE.md says "no `console.log` debug noise" but `console.warn`/`console.debug` precedents exist (`tab-claims.js:125`, `service-worker.js:50`). |
| L-3 | T-132-G is source-text pin only (R2 §65.12 R3-V-5 sanctioned fallback). | `tests/b132-cold-start-inheritance.test.js:324-347` | The ordering invariant test uses `readFileSync` of `background/tabs/index.js` and `indexOf` substring matches to assert the call order. This is brittle to any future refactor (e.g., extracting `initializeLiveState` to a smaller orchestrator function, or wrapping the helper invocation in a debug-only conditional). R2 §65.12 R3-V-5 explicitly accepted this fallback because the harness does not expose an `initializeLiveState` integration spy. T-132-A + T-132-E exercise the production sequence in test code by calling `preMarkInheritedFromFloatingGroups` → `reconcileClaims` → `reassociateFloatingGroups` directly, so the behavioral coverage is pinned even without a true integration test. | Defer. Optional future work: expose a `__getInitializeLiveStateLog` spy hatch in `background/tabs/index.js` for test-only ordering pin; or refactor to a sequenced-step array that the test harness can introspect. Neither blocks B-132. |

### Notes / observations

- **Mode (b) primary fix (AC1) coverage is solid.** T-132-A pins the helper marking the floating tabId via position match; T-132-E pins the full cold-start sequence (helper → reconcile → reassociate) preserving the floating UX without claim-jump. These two together exercise the bug's failure surface and the fix mechanism end-to-end inside the chrome-mock.
- **Mode (a) shallow regression guard (AC2)** — T-132-F simulates the post-cold-start middle-click by directly invoking `markInherited(601)` rather than walking the full `tab-events.js`/`opener-chain.js` runtime path. This is faithful to the pattern B-125 uses (`tests/b125-claim-jump-fix.test.js:91`), but the AC2 contract that explicitly worried me is whether the middle-click → `appendFloatingGroup` → `markInherited` chain itself stays uncorrupted. The test instead seeds the post-chain state. Recommendation: R5 [test-engineer] explicitly walks the post-cold-start middle-click on a real tab during UAT (U-132-2 below) — the unit test alone does not exercise the chain.
- **AC3 deep-chain carve-out** is documented in the helper's JSDoc (`floating-groups.js:581-588`) and in R2 §65.7. The user-facing recovery path ("close and re-spawn from bookmarked parent") is workable but not yet documented in `docs/user-manual/`. R7 [technical-writer] should land that note.
- **B-121 / B-125 contract preservation verified by inspection** — `tests/b121-floating-group-render.test.js` T-121-A through T-121-O use distinct parent/child URLs that do not collide with any other saved item; helper invocation would mark the floating tabId but Phase 2 has no candidate to gate (no URL match), so no behavioral change. `tests/b125-claim-jump-fix.test.js` T1-T5 exercise the runtime `reevaluateTab` path which B-132 does not modify. Both test families stay green by construction.
- **Empty-state coverage (CLAUDE.md C-9) is complete** — T-132-B (empty `tj:floatingGroups`), T-132-C (records with no live-tab match), T-132-A (URL-collision happy path), T-132-E (no-collision, helper marks but Phase 2 no-op), T-132-D (gate-with-mark mechanism). The four R2 §65.9 C-9 enumerated states are pinned.
- **No new UI; no console.log debug noise; no UI regression possible** — the fix is entirely SW-side. The two new test cases that touch chrome-mock state confirm the helper writes ZERO storage (T-132-H) — this is a nice load-bearing pin against future regressions where someone might "optimize" by caching `inheritedTabs` to disk.
- **Helper handles edge cases gracefully** — the `if (!record || typeof record !== 'object') continue` guard at line 601 handles malformed records; the `records.length === 0` early return at line 594 handles the empty partition; the position-match loop with `break` correctly stops at first match (consistent with `reassociateFloatingGroups`); the URL-fallback uses `safeNormalizeForMatch` (same normalizer as the rest of the module — no normalization mismatch).
- **Race-guard analysis (R2 §65.8) is sound.** The `chrome.tabs.onUpdated` race window between `buildLiveTabIndex` and the helper resolution is < 1 ms and the failure mode (early `reevaluateTab` claim-jump) is the SAME pre-existing race that existed before B-132 — the fix narrows the window without introducing a new race surface.
- **Multi-window safety verified** — `buildLiveTabIndex` calls `chrome.tabs.query({})` with no window filter, so all windows' tabs are in `liveTabIndex`. The helper iterates the entire Map. Multi-window cold-start works correctly.
- **`floating-position.test.js:68-91` clarifying comment is helpful and accurate** — explains that the test pins the unit-level contract (gate's empty-set behavior is preserved; not the production cold-start behavior). The cross-reference to T-132-F is concrete and easy to follow.

### UAT must explicitly walk

For [test-engineer] R5 UAT plan (`docs/UAT_B-132.md`):

- **U-132-1 (AC1 primary fix repro)**: Reproduce the user's bug pre-fix, then verify the fix.
  1. Open Edge with the unpacked extension on `release/v2` (pre-B-132 commit).
  2. Save a bookmark `S` whose URL is, e.g., `https://example.com/popular-page`.
  3. Open a different bookmark in a group `G`, middle-click a link inside it that navigates to `https://example.com/popular-page`. Verify the new tab appears as a floating member of `G`.
  4. Reload the extension via `chrome://extensions` → Reload.
  5. **Pre-fix**: the floating tab disappears from `G` and the bookmark `S` shows as live (claim-jump). Confirm via the sidepanel.
  6. Switch to the B-132 build. Repeat steps 2-4.
  7. **Post-fix**: the floating tab REMAINS in `G` after reload; bookmark `S` shows as NOT live. Confirm via the sidepanel.
- **U-132-2 (AC2 shallow regression guard)**: Post-reload middle-click still inherits.
  1. With the B-132 build loaded and a bookmarked tab open, reload the extension.
  2. After reload completes, middle-click a link in the bookmarked tab.
  3. Verify the new tab appears as a floating member of the bookmark's group.
- **U-132-3 (AC3 deep-chain carve-out)**: Document the known-acceptable degradation.
  1. With B-132 build, set up a deep chain pre-reload: grandparent (claimed) → parent (floating) → child (about to spawn).
  2. Reload the extension.
  3. After reload, middle-click a link inside the parent (former-floating) tab.
  4. Verify the new child tab lands in Open Tabs (NOT in the originating group). This is the AC3 carve-out — confirm no console errors.
  5. Verify the user's recourse (close child, re-middle-click from grandparent) works.
- **U-132-4 (R2-VERIFY 1 empirical confirmation)**: Confirm `chrome.storage.session` wipe on Edge reload.
  1. Open `chrome://extensions` (Edge equivalent) → SW inspect.
  2. In the SW console: `await chrome.storage.session.set({ qaProbe: 'before-reload' })`.
  3. Click Reload on the extension card.
  4. Re-inspect the SW; in console: `await chrome.storage.session.get('qaProbe')`.
  5. Expected: `{}` (key absent — store wiped). Document the empirical verdict in the UAT log per R2 §65.2 follow-up.
- **U-132-5 (no-regression smoke test on B-121 / B-125 flows)**: Walk the existing B-121 / B-125 UAT scripts with the B-132 build to confirm nothing regressed in the runtime opener-chain path.
- **U-132-6 (multi-window cold-start)**: With two browser windows open, each containing a bookmarked tab + floating member, reload the extension. Confirm both windows' floating members survive.
- **U-132-7 (no-floating-state regression)**: With NO `tj:floatingGroups` records (fresh profile or all closed), reload the extension. Confirm cold-start completes normally (sidepanel renders, items show live state, no console errors). This pins T-132-B's empty-state guarantee under real Chrome conditions.
- **U-132-8 (URL-collision happy path with multiple candidates)**: If two live tabs share the same URL and one is in `tj:floatingGroups` while the other is not, confirm the non-inherited one is the one that gets auto-claimed by the saved item (the gate's "shift-and-skip-while-inherited" behavior leaves the next-best candidate eligible).

---

## [security-reviewer] — B-132 R4 anchor (Full M-tier)

**Date**: 2026-04-29
**Branch / commit**: `feature/sprint-40-drag-reorder` (B-132 R3 work uncommitted; reviewed via `git diff HEAD`).
**Scope**: Security review of B-132 R3 build — cold-start claim-jump fix. Three production files (~117 LOC), one new test file (391 LOC), one comment-only test edit.
**Files audited**:
- `background/tabs/floating-groups.js` (+83) — NEW `preMarkInheritedFromFloatingGroups()` export
- `background/tabs/index.js` (+7) — cold-start ordering insertion
- `background/tabs/tab-claims.js` (+22) — Phase 2 inheritance gate
- `tests/floating-position.test.js` (+10 comment-only, no assertion change)
- `tests/b132-cold-start-inheritance.test.js` (NEW, 391 LOC, 8 tests)
- Cross-checked: `manifest.json` (unchanged), `shared/messages.js` (unchanged), `background/tabs/tab-events.js`, R2 chapter `docs/design/65-b-132-cold-start-claim-jump-fix.md`, R0 chapter `docs/design/64-b-132-r0-spike.md`.

### CRITICAL (must fix before R5)

_None._

### HIGH (must fix before R5)

_None._

### MEDIUM (fix if time permits)

_None._

### LOW (defer)

| # | Item | File | Finding |
|---|------|------|---------|
| L-1 | Phantom-tabId guard relies on Set semantics, not explicit type-check | `background/tabs/floating-groups.js:628-630` | The helper guards with `if (matchedTabId !== null && !claimedTabIds.has(matchedTabId))`, then calls `markInherited(matchedTabId)`. `matchedTabId` is sourced from `liveTabIndex` `Map<tabId, entry>` keys via the `for...of` loop at `:606-611` and `:617-623`, so by construction it can only be a real live `tabId` (Chrome-allocated number) — the Map key set IS the live-tab universe. The "phantom" risk surface (e.g., `markInherited` accepting a stale or re-used tabId) is fully mitigated by this construction. No code change needed. Documenting for future reviewers — if `liveTabIndex`'s key shape ever changes (e.g., string-keyed lookup, weak-ref values), this construction-level guarantee disappears and an explicit `typeof matchedTabId === 'number' && Number.isFinite(matchedTabId)` check would be required. |
| L-2 | `markInherited` set never bounded; theoretically unbounded growth across SW lifetime | `background/tabs/tab-claims.js:30,38-40` | `inheritedTabs` is a module-scoped `Set<number>` that grows as new floating tabs spawn (B-125 runtime path) and shrinks as tabs close (`pruneInherited`). B-132 adds a NEW entry-point that adds at cold-start. Maximum cardinality is bounded by live tabs in the browser (Chrome itself caps practical browsing at hundreds of tabs), so DoS via Set growth is not a realistic threat in the local-only-extension model. No action — flagging because B-132 introduces a second adder and the symmetry table at R2 §65.6 is the authoritative invariant. |
| L-3 | URL fallback uses first-match, no priority for windowId over windowless match | `background/tabs/floating-groups.js:614-624` | The URL-fallback inner loop `for (const [tabId, entry] of liveTabIndex) { if (safeNormalizeForMatch(entry.url) === normalizedStored) { matchedTabId = tabId; break; } }` returns the FIRST tab whose normalized URL matches, regardless of windowId. If two tabs in different windows share the URL (e.g., user has the same wiki page open twice), the helper marks whichever the iterator surfaces first. This is the same algorithm `reassociateFloatingGroups` uses at `floating-groups.js:137-144` (verified — identical), so the pair stays consistent and the wrong-tab-marked outcome is benign (the wrong tab gets gated against auto-claim — soft degradation, not security or data-integrity concern). No action; the symmetry with `reassociateFloatingGroups` is the correctness anchor. |

### Notes / observations

- **Manifest unchanged.** Confirmed via `git diff HEAD -- manifest.json` (empty diff). No new permissions requested. The fix is pure SW-internal init reordering. C-6 + R1 AC8 + R2 §65.9 verified clean.
- **CSP / eval / new Function / innerHTML / outerHTML.** Zero new occurrences. `git diff HEAD` over the three production files shows no `eval`, no `new Function`, no `innerHTML`, no dynamic script construction. Confirmed by direct grep on the diff.
- **No new message contracts.** `shared/messages.js` unchanged (empty diff). The fix introduces no `MSG_*` types and adds no SW-to-sidepanel broadcasts. C-2 verified clean.
- **Storage write surface — ZERO new writes.** The new helper `preMarkInheritedFromFloatingGroups` (`floating-groups.js:592-632`) contains ZERO `writeTransaction` calls and ZERO `chrome.storage.*.set` calls. Verified via `grep -n "writeTransaction\|chrome\.storage\..*\.set"` against the helper body — only reads (`readPartition(PARTITION_FLOATING_GROUPS)` at `:593`). The Phase 2 gate in `tab-claims.js:174-198` is a read-side filter; it consumes from the existing `urlToTabs` candidate Map and writes back to `claimsMirror` exactly as before — no new write surface. Test T-132-H at `tests/b132-cold-start-inheritance.test.js:353-391` deterministically pins zero-write behavior via byte-equivalent JSON snapshots before/after. C-1a/C-1b correctly N/A — no schema bump (per R2 §65.9, R1 AC8).
- **No network calls / telemetry / new console.log.** Verified by grep — zero `console.log` additions in the diff. The single `console.warn` at `tab-events.js:114` is pre-existing. No `fetch`, no `XMLHttpRequest`, no remote URLs introduced. Privacy posture unchanged.
- **`inheritedTabs` lifecycle hardening.**
  - **Phantom-tabId guard:** the helper marks ONLY `matchedTabId` values pulled from `liveTabIndex` keys (Chrome-allocated tabIds for live tabs). Construction-level guarantee — `liveTabIndex` is `Map<tabId, entry>` populated by `buildLiveTabIndex` from `chrome.tabs.query({})`. No phantom-tabId path exists; see L-1.
  - **Existing pruning entry-points unaffected:** `pruneInherited` at `tab-events.js` (single-tab close) and the `chrome.windows.onRemoved` cascade are byte-identical post-B-132. The diff shows zero changes to `tab-events.js` related to pruning. The B-132 cold-start helper plays nicely with the existing pruning surface — every entry the helper adds is paired with a future `pruneInherited` when the tab closes (Set semantics + tabId stability across SW lifetime per R2 §65.6 verification table).
  - **`reevaluateTab` gate (B-125) preserved:** `tab-claims.js:270-272` still contains the inheritance-skip branch. The B-132 fix mirrors this gate into Phase 2 of `reconcileClaims` rather than replacing it. Two gates, one Set, no contention. `__resetTabClaims` at `tab-claims.js:81-88` correctly clears `inheritedTabs` for test symmetry (B-125 §59.2.4 invariant preserved).
- **Cold-start race conditions analyzed.**
  - **Pre-mark-then-reconcile is single async chain.** `initializeLiveState` at `background/tabs/index.js:35-54` is a serial `async` function with sequential `await` points. There is no `Promise.all` between `preMarkInheritedFromFloatingGroups` (line 50) and `reconcileClaims` (line 51). JS-side, the two cannot interleave. R2 §65.8 race-guard analysis confirmed.
  - **`chrome.tabs.onUpdated` mid-cold-start race already documented.** Per R2 §65.8 R-1: a `chrome.tabs.onUpdated` event firing during the < 1 ms window between `buildLiveTabIndex` resolving and `preMarkInheritedFromFloatingGroups` resolving could trigger a debounced `reevaluateTab` that doesn't see the new mark. This race window is 100 ms gated by the existing `setTimeout(..., 100)` debounce at `tab-events.js:105`, and the helper's < 1 ms execution time means the event would have to fire in the interleaving window AND the debounce would have to expire BEFORE the helper resolves — physically possible but practically negligible. Same posture as pre-B-132 cold-start window; B-132 narrows rather than introduces. No new architecture needed; documented at R2 §65.8 as acceptable.
  - **Single-pass cold-start sequence.** No re-entry: `initializeLiveState` is called exactly once from `background/index.js` (verified via grep — single call site). The helper is also called exactly once per cold-start. No re-entry risk.
- **Allow-list direction (C-7) — same justification as B-125 §59.7.** The Phase 2 gate at `tab-claims.js:174-198` is a skip-list ("skip auto-claim if `inheritedTabs.has(candidate)`") — a deny-list direction in CLAUDE.md C-7's framing. R2 §65.9 explicitly invokes the §59.7 same-class ruling: blast radius of false-positive is "tab not auto-claimed" (soft degradation, not security or data-integrity issue). The §59.7 [security-reviewer] ruling applies verbatim — no escalation needed. Verified.
- **AC3 deep-chain carve-out clearly documented.** Three documentation surfaces all align:
  - **R0 spike chapter** §64.6 — architectural rationale (`openerMap` ephemeral, persisting it diverges from Chrome's own contract).
  - **R2 chapter** §65.7 — explicit "structurally infeasible to fix without persisting `openerMap`" framing with reference citations to `opener-chain.js:6-9` and `:12`.
  - **Production code comment** at `floating-groups.js:581-588` — pin in the helper's JSDoc reading: *"It does NOT reconstruct pre-reload opener-chain relationships (openerMap is ephemeral — background/tabs/opener-chain.js:6-9 documents this as Chrome's own contract). A NEW middle-click inside a former-floating tab post-reload thus creates a new tab whose opener-walk returns null and which lives in Open Tabs. This is the AC3 known-acceptable degradation."*
  A future security-conscious reader sees three independent statements that this is structural (Chrome's own contract) rather than a vulnerability waiting to be patched. Documentation hygiene is excellent.
- **Cross-cutting import/attack-surface analysis.**
  - **`markInherited` import direction.** `floating-groups.js:33` adds `import { markInherited, getClaimsMirror } from './tab-claims.js';`. Both modules already live in the trusted SW context (`background/tabs/`). Confirmed via `grep -n "from.*floating-groups" background/tabs/tab-claims.js` — empty (no reverse import), so no circular-import edge. Both modules are SW-internal and not reachable from the sidepanel/popup IPC surface. Zero new attack surface introduced by the import.
  - **No new internal state exposed.** The helper is `async function ...(): Promise<void>` — zero return. The sole side effect is the `markInherited` call, which adds to the existing module-scoped `inheritedTabs` Set in `tab-claims.js`. No new exported state, no new SW-global, no new IPC-reachable channel. The set is already encapsulated behind `markInherited` / `isInherited` / `pruneInherited` / `__resetTabClaims` (no direct export of the Set itself — verified at `tab-claims.js:30-88`).
  - **No new sender/receiver paths.** No `chrome.runtime.onMessage` listeners added. No `chrome.runtime.sendMessage` calls. No broadcasts. The fix is purely internal SW orchestration.
- **R2 Correctness Checklist (C-1..C-12) sign-off** — R2 §65.9 enumerated all 12 with N/A for C-1a/C-1b (no schema change), C-2 (no message contracts), C-5 (no manifest), C-6 (no permissions), C-8 (no new browser API), C-10 (no DOM/positioning), C-11 (no popup), C-12 (no manifest declaration). Applied checks (C-3 SW cold-start, C-4 ID stability, C-7 allow-list, C-9 empty-state) all closed at design time. Independently verified by direct code Read against R3 build — every claim holds.
- **Test coverage observations.** `tests/b132-cold-start-inheritance.test.js` (391 LOC, 8 tests) covers AC1 happy path (T-132-A), AC1 empty state (T-132-B), AC1 partial state (T-132-C), AC5 gate mechanism (T-132-D), AC1+AC4+AC5 integration (T-132-E), AC2 shallow regression guard (T-132-F), AC6 ordering invariant via source-text pin (T-132-G), and zero-write contract (T-132-H). Test fixture URLs use unique hostnames (`parent.example`, `collide.example`, `nowhere.example`, `elsewhere.example`, `b.example`, `x.example`) — no PII, no real-world URLs that could leak in test logs. The comment-only edit to `tests/floating-position.test.js:67-77` adds context without changing any assertion (verified via `git diff HEAD`). T-132-G at `:324-347` reads `background/tabs/index.js` source text and asserts call-site ordering — a structural regression guard that catches future refactors. Defense-in-depth.

### Verdict

**APPROVED for R5.** Zero CRITICAL, zero HIGH, zero MEDIUM findings. Three LOW observations (L-1 phantom-tabId construction guarantee, L-2 unbounded `inheritedTabs` Set growth posture, L-3 URL fallback windowless match symmetry with `reassociateFloatingGroups`) — all documenting structural correctness rather than recommending changes. The B-132 fix is a textbook surgical SW-init reorder + read-side gate addition: zero new write paths, zero new message contracts, zero new permissions, zero new attack surface, zero new console noise. The AC3 deep-chain carve-out is documented with three reinforcing surfaces (R0/R2/inline JSDoc) so a future reviewer cannot mistake it for an unpatched vulnerability. Race-guard posture is strictly additive — B-132 narrows the cold-start race window rather than widening it.

## [code-reviewer] — B-132 R4 anchor (Full M-tier)

**Scope reviewed**: working-tree diff vs HEAD on `feature/sprint-40-drag-reorder` for B-132 R3 — 5 files (~117 production LOC + ~401 test LOC).
- `background/tabs/floating-groups.js` (+83) — new exported `preMarkInheritedFromFloatingGroups()` + import of `markInherited`/`getClaimsMirror`.
- `background/tabs/index.js` (+7) — cold-start ordering: `await preMarkInheritedFromFloatingGroups()` between Promise.all and `reconcileClaims(items)`.
- `background/tabs/tab-claims.js` (+22) — Phase 2 inheritance gate: shift-and-skip `while` pattern.
- `tests/floating-position.test.js` (+10 comment-only) — explanatory R3-DECISION block per R2 §65.10.
- `tests/b132-cold-start-inheritance.test.js` (+391, NEW) — eight tests T-132-A..H.

### CRITICAL (must fix before R5)

_None._

### HIGH (must fix before R5)

_None._

### MEDIUM (fix if time permits)

_None._

### LOW (defer)

| # | Item | File | Finding | Fix |
|---|------|------|---------|-----|
| L-1 | Stale line-ref in code comment | `background/tabs/floating-groups.js` (JSDoc on `preMarkInheritedFromFloatingGroups`) AND `background/tabs/tab-claims.js` (inline comment in Phase 2) | Both comment blocks claim "the B-125 reevaluateTab gate at line 250 above" / "the B-125 (§59.3) gate at background/tabs/tab-claims.js:250 — runtime path". The actual runtime gate sits at `tab-claims.js:270` (`if (inheritedTabs.has(tabId)) return;`). Line 250 is the `@param {number} tabId` line of the JSDoc preceding `reevaluateTab`. The fix correctly mirrors the B-125 mechanism — only the cited line numbers drifted. | Update both comment blocks to cite `tab-claims.js:270` (or simply `reevaluateTab`'s inheritedTabs gate, no line number — reduces future drift). Defer-acceptable: comments only, no behavioral impact. |
| L-2 | DRY: position+URL match logic duplicated between two cold-start helpers | `floating-groups.js:120-144` (`reassociateFloatingGroups`) and `floating-groups.js` (`preMarkInheritedFromFloatingGroups`) | The R3 helper duplicates the position-then-URL match loop from `reassociateFloatingGroups` verbatim (~21 LOC). The two helpers have different result contracts (one sets `matchedTabId` for marking; the other tracks `resolvedFloatingTabIds` for prune-decisions), so a naive shared extraction would fight both call sites. Acceptable as-is for an M-tier bug fix; the R2 §65.4 explicit "mirrors §60.4.3" framing makes the duplication an intentional algorithmic parity. | Optional follow-up: extract `_findLiveTabForRecord(record, liveTabIndex) -> tabId|null` returning the position-or-URL match. Both helpers would call it and apply their own claim-state branching. Out-of-scope for this bug fix; flag for a future cleanup item if/when the matcher gains a third caller. |
| L-3 | Source-text pin (T-132-G) is broad to refactor noise | `tests/b132-cold-start-inheritance.test.js:325-347` | The test pins relative ordering of four `indexOf` substrings: `Promise.all([`, `preMarkInheritedFromFloatingGroups()`, `reconcileClaims(items)`, `reassociateFloatingGroups(`. Brittle to: (a) renaming `preMarkInheritedFromFloatingGroups` (correctly catches a re-name without re-wire); (b) splitting `Promise.all` into a different concurrency primitive (`await x; await y;`) — would fail with a misleading message; (c) inlining `items` into `reconcileClaims(await listItems())` would change the substring. For (b) and (c) the test would fail for the *wrong* reason — not because B-132 regressed, but because the cold-start fan-out evolved. R3-V-5 sanctioned this fallback when no spy hook exists. | Defer-acceptable. The R2 §65.12 R3-V-5 path documented this as a fallback. If a future sprint adds an `initializeLiveState` spy hook (e.g., via DI), the test should be rewritten to assert call ordering through the spy, not the source text. |

### Notes / observations

- **Architecture / patterns (checklist 1)** — `preMarkInheritedFromFloatingGroups` mirrors the `reassociateFloatingGroups` algorithm exactly per R2 §65.4: same position-match loop (mirrors `floating-groups.js:126-131`), same URL fallback (mirrors `:134-143`), same `safeNormalizeForMatch` import. Verified line-by-line. Result-handling diverges as designed: `reassociateFloatingGroups` writes to `resolvedFloatingTabIds`/`legacyResolvedParentItemIds` (prune sets); `preMark` calls `markInherited` (in-memory mark only). The divergence is correct because the two helpers fire on different cold-start phases and have different invariants per R2 §65.6.

- **Circular dependency check (R3-V-1)** — Verified PASS. `floating-groups.js:33` imports `markInherited`, `getClaimsMirror` from `./tab-claims.js`. `tab-claims.js` imports `live-tab-index.js`, `shared/url.js`, `drift.js` only — no `floating-groups.js` import. One-way dependency. Both imports are confirmed used: `markInherited` at the helper's body, `getClaimsMirror` at the `claimedTabIds` Set construction.

- **Phase 2 gate correctness (checklist 1)** — `tab-claims.js:184-192`: `while (available.length > 0)` shift-and-skip pattern is correct. Handles the all-candidates-inherited case as designed: `claimedTabId` stays null, `available` is fully consumed, the saved item is left unclaimed. The `while` does not break on the first inherited candidate; it pops and continues, which is the contract per R2 §65.5 ("Pop the inherited candidate so the next-best candidate can be claimed"). Loop preserves Phase 1 sortOrder ordering.

- **Performance (checklist 3)** — Cold-start helper: one `readPartition(PARTITION_FLOATING_GROUPS)` (typically ≤ 5 records per R0 §64.4) × O(N_liveTabs) per record = bounded < 1 ms added per R2 §65 budget. The Phase 2 `while`/shift retains the prior big-O: O(items × candidates_per_url) — the gate adds only an O(1) Set lookup per skip. No performance concerns.

- **Dead code / TODOs / console.log (checklist 4)** — None. Three `/* B-132 §… */` reference comments in production code; one structured JSDoc block on the new exported helper. No `console.*` calls. No leftover scaffolding.

- **AC↔Test mapping (checklist 5)** — Verified the eight tests cover seven of the eight ACs explicitly + AC3 by carve-out documentation:
  - AC1 (Mode-b URL-collision fix): T-132-A (helper marks tabId), T-132-B (empty no-op), T-132-C (no-match no-op), T-132-E (full integration)
  - AC2 (Mode-a shallow regression guard): T-132-F (post-cold-start middle-click + `reevaluateTab`)
  - AC3 (deep-chain carve-out): documented in JSDoc on `preMarkInheritedFromFloatingGroups` + R0 §64.6 reference; not directly tested (per AC3 — not testable; structural carve-out).
  - AC4 (parent claim survives): T-132-E asserts `getClaimsMirror()['item-parent'] === 500`.
  - AC5 (Phase 2 gate fires): T-132-D (gate-mechanism unit), T-132-E (integration).
  - AC6 (No regressions, source-text pin): T-132-G (substring ordering on `index.js`).
  - AC7 (new test file scope): the file itself satisfies AC7.
  - AC8 (zero storage writes from helper): T-132-H asserts byte-equivalent `tj:floatingGroups` + `tj:tabClaims` payloads pre/post.
- AC3 carve-out documentation lives in the JSDoc block on `preMarkInheritedFromFloatingGroups` and uses the R1 LOCKED carve-out language verbatim ("AC3 known-acceptable degradation; the user's recourse is to re-spawn from the bookmarked parent"). Acceptable per AC3 PASS clause (a).

- **T-132-D actually exercises the while/shift loop** — verified: `markInherited(400)` then `reconcileClaims([{ id: 'item-collide', url: 'https://collide.example/' }])`. Single candidate, single inherited; the loop body executes the skip branch exactly once and exits with `claimedTabId === null`. No test seeds two candidates with one inherited (multi-candidate skip-then-claim) — but T-132-D + the Phase 2 logic in isolation (the `while` is straight-line correct) make this a non-blocker. R5 [test-engineer] may consider adding a multi-candidate test as a defense-in-depth against future loop-body changes; LOW priority.

- **`floating-position.test.js:68-91` R3-DECISION compliance (checklist 9)** — verified PASS: only a 10-line comment block was added (lines 68-77); the test body at `:78-101` is byte-identical to pre-R3 (confirmed via `git diff HEAD`). The comment correctly explains why the unit test still pins useful behavior post-fix (no-inheritance branch). R2 §65.10 contract honored.

- **`inheritedTabs` invariant (checklist 7)** — `if (matchedTabId !== null && !claimedTabIds.has(matchedTabId)) markInherited(matchedTabId)`. The double-guard (matched + unclaimed) is correct. At the cold-start invocation site, `claimsMirror` is empty `{}` because `reconcileClaims` has not yet run — so `claimedTabIds` will be EMPTY and every matched record passes the `!claimedTabIds.has(matchedTabId)` guard. The guard is therefore inert at the cold-start call site but semantically robust if the helper is ever reused after a partial reconcile. Not a bug; defense-in-depth.

- **Cold-start ordering invariant (checklist 8)** — `index.js:50-51`: `await preMarkInheritedFromFloatingGroups();` followed by `await reconcileClaims(items);`. The `await` is necessary — the helper's mark on the module-scoped `inheritedTabs` Set must complete before Phase 2 reads it. Sequence verified. The R2 §65.3 ordering contract is met. T-132-G pins this in source text.

- **Cross-cutting with B-134 (checklist 10)** — verified no symbol collision: B-134 added `_resolveRecordIndexByTabId` (private), `reorderFloatingMembers`, `moveFloatingTab`, `_floatingRecordCompare` (private). B-132 added `preMarkInheritedFromFloatingGroups`. All export names distinct. Both touch `floating-groups.js`'s top-level imports — B-132 adds `markInherited`, `getClaimsMirror`; B-134 added `ulid`. No conflict. The file builds cleanly at the import layer.

- **No B-125 regression on `reevaluateTab` runtime path** — checklist 10 confirmed via T-132-F. The runtime `markInherited` from `tab-events.js` continues to gate the new tab through `tab-claims.js:270`. The new cold-start gate at `:184-192` is a separate code path within the same module-scoped `inheritedTabs` Set; both gates use the same Set (correct — one persistence target, two write surfaces).

- **Test isolation hygiene** — every test in `b132-cold-start-inheritance.test.js` uses `__resetMock`, `__resetLiveTabIndex`, `__resetTabClaims` via `beforeEach`. `__resetTabClaims` includes `inheritedTabs.clear()` at `tab-claims.js:87` (B-125 already established this hygiene), so cross-test inheritance bleed is prevented.

- **Non-blocker: helper signature symmetry** — `reassociateFloatingGroups(liveTabIndex, existingClaims)` takes the index and claims as arguments (testable via DI). `preMarkInheritedFromFloatingGroups()` takes zero arguments and pulls both via module-level `getLiveTabIndex()` + `getClaimsMirror()`. The asymmetry is harmless — the helper is a fire-once cold-start step with no DI need — but R5 testers must seed via `buildLiveTabIndex` before calling. Acceptable; not worth changing.

- **Convergence with [security-reviewer] and [qa-reviewer] B-132 R4** — both reviewers also returned ZERO CRITICAL/HIGH/MEDIUM and only LOW observations on structural posture rather than behavior. Three-way agreement on: (a) the SW-init reorder is correct, (b) zero new write paths / zero attack surface added, (c) AC3 carve-out is properly documented in three reinforcing surfaces (R0/R2/inline JSDoc).

### Verdict

**APPROVED for R5.** Zero CRITICAL, HIGH, or MEDIUM findings. Three LOW observations (L-1 stale line-refs in comments, L-2 algorithmic duplication intentional per R2 §65.4, L-3 source-text-pin brittleness sanctioned by R3-V-5) — all defer-acceptable; none gate R5. Algorithm parity with `reassociateFloatingGroups` per R2 §65.4 is verified line-by-line. Phase 2 `while`/shift correctness verified (handles all-candidates-inherited and single-candidate cases). No circular dependency. No B-134 symbol collision. No B-125 regression. Test coverage maps to AC1, AC2, AC4, AC5, AC6, AC7, AC8 explicitly; AC3 covered by JSDoc carve-out per AC3 PASS clause (a). Recommend [frontend-engineer] update the L-1 line-refs in a low-priority follow-up sweep; nothing else.

---

## [qa-reviewer] — B-134 R4 anchor (Full M-tier)

**Date**: 2026-04-29
**Author**: [qa-reviewer]
**Scope**: Round 4 QA review of B-134 R3 build (commit `c3e7503`). Full M-tier.
**Inputs reviewed**: `docs/design/63-b-134-tab-drag-reorder.md` (1,103 lines, all 17 sections), `docs/BACKLOG.md` row B-134 R1 LOCKED, source delta vs `release/v2` (8 source + 4 test files, ~6,156 LOC), full test suite output (1,772 / 1,772 PASS).
**Method**: error-handling completeness audit, C-9 empty-state enumeration walk, accessibility per WCAG AA + keyboard-first rule, theme-token contrast spot check on 14 themes, race-guard regression risk under realistic chrome event traffic.

### CRITICAL (must fix before R5)

_None._

### HIGH (must fix before R5)

| # | Item | File | Finding | Fix |
|---|------|------|---------|-----|
| 1 | Race-guard B fires on every background `liveState` broadcast → most drops will fail in real-world UAT | `sidepanel/sidepanel.js:6310-6314` (`_validateTabDropPreflight` Guard B) + `sidepanel/sidepanel.js:6356-6359` + `background/tabs/tab-events.js:76,82,96,112,138,202,257,260` | `_setCachedFloatingMembers` and `_setCachedOpenTabs` increment their gen counters on EVERY assignment. `refetchAndPatchLiveState` (the `liveState` broadcast handler) calls both setters every time the SW broadcasts `liveState`. The SW broadcasts `liveState` on `tab/title-changed` (every page navigation), `tab/audible-changed` (every YouTube/etc. play/pause), `tab/updated`, `tab/created`, `tab/activated`, `tab/removed`, `window/focused`, `window/blurred`. Any of these firing during a multi-second drag (a single browser-window blur+refocus does it) bumps the gen → Guard B trips → toast "Tabs changed during drag — please retry." and the drop is aborted **even when nothing about the dragged tab changed**. UAT will hit this constantly: a user dragging while a sibling tab plays audio will fail every drop. | Make the gen counter increment **content-conditional**: bump only when the relevant projection actually changes (e.g., for `_cachedFloatingMembersGen`, hash the per-group `tabIds` arrays; bump only on diff). Alternatively, scope Guard B to "the dragged tab's sourceGroupId floating set" or "the dragged tab's sourceWindow Open Tabs set" — not the entire panel. R2 §63.10.2 said "broadcast race" should mean "another window or `chrome.tabs.onCreated`/onRemoved fired mid-drag" — the current implementation overshoots that intent and includes title-changes and focus-blurs. |
| 2 | `MSG_REORDER_FLOATING_MEMBERS` ERR_RACE silently drops user's drag with no feedback | `sidepanel/sidepanel.js:4673-4685` (REORDER_FLOATING case) | The drop dispatcher awaits `sendMessage(MSG_REORDER_FLOATING_MEMBERS, ...)` and discards the response. If the SW returns `{reordered: false, reason: 'ERR_RACE'}` (live tab vanished mid-drop, or the storage tabId set drifted), the user sees the indicator clear and the row stays in its old position with **no toast**. AC7 mandates "each guard fail surfaces a specific toast"; this branch has zero feedback. Same for `ERR_VALIDATION` (defensive case). | Inspect `resp.reordered` after the await; on `false` show a toast specific to the reason (default to "Tabs changed during drag — please retry."). Mirror the existing `MSG_MOVE_FLOATING_TAB` handling at `sidepanel.js:4697-4705` for uniformity. |
| 3 | REJECT indicator does not follow pointer once mode is REJECT | `sidepanel/sidepanel.js:6043-6048` (skip-no-op) + `sidepanel/sidepanel.js:6056-6066` (REJECT branch) | The skip-no-op short-circuit compares `target.mode + targetGroupId + insertIndex + targetWindowId`. When the user drags into W2 and stays there, hitting different rows, all four fields are identical (mode='REJECT', targetGroupId=null, insertIndex=0, targetWindowId=W2) → tick early-returns → REJECT indicator stays **frozen at the first Y position the pointer entered W2 at**, regardless of where the pointer moves inside W2. The user sees a stuck red indicator while hovering W2 rows; the visual contract "indicator follows pointer in REJECT mode" silently breaks. | Either (a) exclude REJECT mode from the skip-no-op check (always re-position when in REJECT), or (b) include `_pendingTabPointerY` (or quantized form) in the skip-no-op key for REJECT mode only. Option (a) is simpler; perf cost is one transform write per rAF tick. |
| 4 | REORDER_FLOATING does not exclude the dragged row from midline math (R2 §63.4.4 mandate violated) | `sidepanel/sidepanel.js:6167-6172` (`_computeTabDropTarget` floating-zone insertIndex computation) + R2 §63.4.4 | R2 §63.4.4 explicitly mandates: "REORDER_FLOATING: same midline math, but **with the dragged row excluded** (so dropping onto the dragged row's own slot returns the same insertIndex it started at)." R3 builds `rowMidlines` from ALL floating rows in the zone (including the dragged source row) at `sidepanel.js:5978-5982` and never excludes it during hit-test. Effect: when the user hovers over the dragged row's own original position, the indicator paints either above or below that slot depending on midline crossing — the same-position visual feedback is wrong. The drop-payload helper `_computeReorderFloatingPayload` does adjust for the source position, so the **stored** order is correct, but the **indicator** does not match the **outcome**. | In `_computeTabDropTarget` REORDER_FLOATING branch (or in `_buildTabDragRectCache`), filter out the row whose `tabId === _tabDragState.draggedTabId` from the source group's `rowMidlines`/`rowTabIds` arrays. Apply only when `groupId === sourceGroupId`; ATTACH/MOVE_FLOATING into a different group keep all target-bucket midlines intact. |

### MEDIUM (fix if time permits)

| # | Item | File | Finding | Fix |
|---|------|------|---------|-----|
| 5 | No grab/grabbing cursor on `.item-row[data-tab-id]` — drag affordance invisible | `sidepanel/sidepanel.css:282,293` (existing `.group-drag-handle` cursor) + (no new rule for tab rows) | Group-drag handles have `cursor: grab`/`grabbing`. Open Tabs rows and floating rows now have `draggable=true` per R3 build but no cursor change on hover. Browser default cursor stays as `auto`. **Discoverability**: a user has no visual signal that tab rows are draggable — they have to guess. Keyboard alternative (R1 AC8) is also out-of-scope for v1, so the only path is mouse-drag, but the affordance is invisible. | Add CSS: `.item-row[data-tab-id]:not([data-item-id]) { cursor: grab; }` and `#item-list.is-tab-dragging .item-row[data-tab-id] { cursor: grabbing; }`. The defensive selector `:not([data-item-id])` excludes saved-bookmark rows that may carry `data-tab-id` when claimed. |
| 6 | ATTACH to empty group: indicator paints valid drop, then SW rejects with toast — confusing UX | `sidepanel/sidepanel.js:6164-6200` (hit-test ATTACH branch, no client-side empty-group filter) + `background/tabs/floating-groups.js:392-397` (SW empty-group reject) + R2 §63.15 caveat | The hit-test paints the green ATTACH indicator in any group's floating zone, regardless of whether the group has saved items. The SW rejects with toast "Cannot attach to an empty group." User sees: (a) drag from Open Tabs, (b) hover over Group X, (c) green indicator confirms drop is valid, (d) release, (e) toast says no. R2 §63.15 acknowledges this and proposes the alternative of disabling ATTACH on empty groups at hit-test time — that path was deferred to "if UAT flags this". This is the UAT round; flagging. | At `_buildTabDragRectCache` time (or via a synchronous read of `_cachedItems` at hit-test time), exclude floating zones for groups that have zero saved items. The user then sees a `null` hit-test (no indicator) over empty groups — clearer "this isn't a drop target" UX. |
| 7 | `_computeReorderFloatingPayload` returning `[]` (cache miss) silently no-ops the drop | `sidepanel/sidepanel.js:6285-6286` + drop dispatcher `sidepanel.js:4679` | If `_cachedFloatingMembers[sourceGroupId]` is empty or doesn't contain the dragged tabId (e.g., cache cleared mid-drag by an unrelated `liveState` broadcast that found zero members), `_computeReorderFloatingPayload` returns `[]`. Dispatcher `if (orderedTabIds.length === 0) return;` silently aborts — no toast, no indicator clear-with-feedback. The user has no idea their drag did nothing. | Show a toast on the empty-payload branch: `showToast('Tabs changed during drag — please retry.')` — matches Guard B verbiage so user has consistent recovery instructions. |
| 8 | ATTACH side-effect race: floating record persists in storage briefly before `markInherited` fires; `chrome.tabs.onUpdated` in that microsecond window can claim the tab | `background/messages/storage-handlers.js:742-751` (post-write side-effect ordering) | `moveFloatingTab` `await writeTransaction(...)` resolves → SW returns from the mutator → `markInherited(p.tabId)` runs synchronously after the await. Between writeTransaction resolution and `markInherited`, the event loop can deliver a queued `chrome.tabs.onUpdated` (e.g., the dragged tab finished loading mid-drag). If that update's URL matches a saved bookmark in another group, auto-claim logic at `tab-claims.js` would claim the tab BEFORE `markInherited` locks it out. Window is microseconds; the precedent (B-013 opener-chain spawn) has the same shape. **Risk: LOW frequency, MEDIUM severity** — a single tab could end up claimed under the wrong group with B-134's drag never fully landing. | Either (a) move `markInherited` to run inside `moveFloatingTab` immediately AFTER writeTransaction resolves, before the function returns, or (b) eagerly call `markInherited` BEFORE the writeTransaction starts and call `pruneInherited` only on rollback. Option (b) is cleaner: lock fires before storage settles. R6 [solution-architect] should pin the chosen pattern in §63.9.2. |
| 9 | No automated test exercises end-to-end `_computeTabDropTarget` hit-test geometry — hit-test correctness depends on source-text pins (T22) only | `tests/b134-tab-drag-reorder.test.js:599-720` (T19-T26) | Test plan covers SW-side storage (T1-T15) thoroughly but the hit-test (`_computeTabDropTarget`) is only verified via source-text regex assertions (T22). No test constructs a synthetic DOM, populates `_tabDragRectCache`, and exercises the priority-order branches (1-6). Bugs like Finding #4 (REORDER_FLOATING includes dragged row in midlines) cannot be caught by source-text pins; they require behavioral assertions against synthetic geometry. | R5 [test-engineer] should add a small jsdom-driven harness or a pure-helper extraction (`_computeInsertIndex(midlines, y, excludeTabId?)`) testable directly. The pure-helper extraction is a 30-LOC refactor. Acceptable to defer to a polish item if UAT thoroughly walks the geometry. |

### LOW (defer)

| # | Item | File | Finding | Fix / Disposition |
|---|------|------|---------|--------------------|
| 10 | Tab rows do not announce drag affordance via ARIA — keyboard-only / SR users have no signal | `sidepanel/sidepanel.js:2854-2926` (`buildOpenTabRow`), `2951-3007` (`buildFloatingTabRow`) | `aria-label` on floating rows is "floating tab — <title>"; on Open Tabs rows it's the standard buildItemRowAriaLabel. `draggable="true"` is the HTML attribute but most screen readers don't announce it. Per WCAG 2.1.2 (no keyboard trap) the row remains keyboard-reachable for click; per WCAG 2.5.7 (Dragging Movements, AAA) the drag should have a single-pointer alternative — R1 AC8 explicitly waives this for v1. **Disposition: ACCEPT for v1 per AC8** but file a P3 polish item for keyboard-driven drag in a future sprint. | Backlog item — out-of-scope per R1 AC8. |
| 11 | Drop indicator color `var(--accent)` vs reject `var(--danger)` — contrast across 14 themes not formally measured | `sidepanel/sidepanel.css:301-307,325-327` + `shared/themes.css` (16 occurrences of `--danger` across 14 themes) | All 14 themes define `--danger`; typical hex values are red-spectrum and visually distinct from the accent token. Spot-check confirms acceptable in default light + default dark. Formal WCAG measurement against the panel background per theme would catch any near-miss. | Defer to UAT-time visual walk across all 14 themes. UAT case 14 covers this. |
| 12 | Cross-window REJECT toast says "Cross-window drag is not supported yet" — copy hint | `sidepanel/sidepanel.js:4648,4663` | "Yet" could imply imminent B-135 delivery. Consider "Cross-window drag is not supported in this version." | Defer to copy polish; non-blocking. |
| 13 | DETACH `pruneInherited` makes the tab eligible for auto-claim immediately — could surprise users | `background/messages/storage-handlers.js:749-750` + `background/tabs/tab-claims.js` (auto-claim on URL match) | After DETACH, the tab is no longer locked out; if its current URL matches a saved bookmark in any group, the next `chrome.tabs.onUpdated` may claim it under that other group. The user moves a tab from G1 floating area to Open Tabs, expecting it to stay free; instead it could re-attach as a saved-claim under G2. **By design** per R1 ACs, but worth surfacing in UAT as expected-behavior check. | UAT case 8; not a code fix. |
| 14 | `is-tab-dragging` class on `#item-list` only sets `user-select: none`; no source-row dimming or visual cue | `sidepanel/sidepanel.css:333-335` + R2 §63.5 | Item-drag (`is-item-dragging`) has multi-row dimming; group-drag has `dragging-src` class. Tab-drag has neither. The user can lose track of which row they're dragging. The browser-default ghost helps. | Add `#item-list.is-tab-dragging .item-row[data-tab-id][data-dragging] { opacity: 0.4; }` and set `data-dragging` on source row at dragstart, clear on cleanup. Polish item. |
| 15 | `MSG_REORDER_FLOATING_MEMBERS` and `MSG_MOVE_FLOATING_TAB` broadcast SCOPE.ITEMS even on ERR_VALIDATION / ERR_RACE soft-rejects | `background/messages/storage-handlers.js:686-687,711,743,815-836` | Handler returns success-shape envelope `{reordered: false, reason: ...}` — `dispatch` returns success → broadcast block fires `broadcast(SCOPE.ITEMS, ...)` for every soft-reject. Wasted re-fetch in every other open sidepanel; not a correctness bug. | Skip broadcast when `data?.moved === false` or `data?.reordered === false`. Polish; defer if time-pressured. |

### Notes / observations

- **R3 build quality (R4 baseline)** — overall implementation is clean and faithful to R2 §63 chapter. Drag-state shape, mode-exclusivity guards, hit-test priority order, race-guard preflight all match the design. SW helpers correctly implement Strategy A (resolve via `(windowId, tabIndex)`) per §63.14.1. Schema bump complies with C-1a (KNOWN_VERSION 2→3, defaultShape 3, no-op migration step) and C-1b (lazy validator + appendFloatingGroup stamps sortOrder).
- **Test count delta** — baseline 1,732 → 1,772 = +40 tests, exceeding the §63.13 estimate of +25-30. T-coverage maps to AC1-AC8.
- **C-9 empty-state walk** — R2 §63.15 + §63.11.C-9 enumerate 10 cases. R3 implements 7 cleanly (single-member same-position no-op T11; ATTACH to empty group ERR_RACE T10; saved-bookmark row inert; group header inert; sub-group zone separation; cross-window REJECT; multi-select tab-rows out of scope). The remaining 3 (Finding #6 confusing UX, Finding #7 cache-miss silence, Finding #2 ERR_RACE silence) are above.
- **Cross-surface coverage** — confirmed `newtab/newtab.js` and `popup/popup.js` carry zero changes. Sidepanel-only v1 scope holds.
- **Theme regression** — `var(--accent)` and `var(--danger)` exist in all 14 themes (`shared/themes.css:96-1014`); spot-check on default light + default dark shows acceptable contrast. UAT to walk all 14.
- **Performance** — `_buildTabDragRectCache` is O(N_groups + N_floating + N_openTabs) once per dragstart; `_tabDragTick` is O(1) when cache is warm + skip-no-op fires. No B-052 (search) or B-021 (filter) interaction.
- **Toast noise during drag** — every Guard B trip fires a toast (`role="alert" aria-live="assertive"` announces immediately to screen readers). Mitigated by Finding #1 fix.
- **Keyboard alternative preserved** — existing keyboard paths intact: B-007 dialog parent-picker for groups; native browser tab-strip shortcuts for tab order. R1 AC8 waives a B-134 keyboard reorder for v1.
- **Confirmation dialog correctly absent** — drag operations are reversible (drop wrong → drag back). No data deleted; tabs remain open. Verified — no dialog opens for any of the 5 ops.

### UAT must explicitly walk

R5 [test-engineer] UAT plan should include (in addition to the AC1-AC8 stock cases):

1. **UAT-RACE-1 (Guard B over-trip)** — Open one tab playing audio. Start dragging a different tab. Hold drag for 5 seconds. Release. Expected: drop succeeds. **If toast says "Tabs changed during drag — please retry"**, Finding #1 is in play.
2. **UAT-RACE-2 (window blur)** — Start dragging a tab. Click another browser window briefly to blur the sidepanel's window. Click back. Drop. Expected: drop succeeds OR a clear toast explains the abort. Finding #1 likely fires here too.
3. **UAT-REJECT-1 (REJECT indicator follow)** — Drag W1 Open Tab over W2 Open Tabs section. Move pointer between W2 rows. Expected: red REJECT indicator follows pointer. **Finding #3 — indicator stays stuck.**
4. **UAT-REORDER-FLOATING-1 (same-position)** — Drag a floating row to its own slot. Release. Expected: no visible change, no toast, no broken state.
5. **UAT-REORDER-FLOATING-2 (indicator on source slot)** — Drag a floating row, hover over its OWN current position. Expected: indicator should sit at the same slot. **Finding #4 — indicator misplaces by one row.**
6. **UAT-EMPTY-GROUP-1 (ATTACH to empty group)** — Drag an Open Tab over a group with zero saved items. Expected: indicator does NOT paint as valid OR toast says "Cannot attach to an empty group" cleanly. Finding #6.
7. **UAT-AFFORDANCE-1 (cursor)** — Hover an Open Tab row + a floating row without dragging. Expected: cursor changes to grab. **Finding #5 — cursor stays as default arrow.**
8. **UAT-DETACH-1 (auto-claim after detach)** — Set up: tab with URL X is floating member of Group A (parent URL Y). Group B has saved bookmark URL X. DETACH the floating tab from A. Within 2 seconds, observe whether the tab gets auto-claimed under B. Expected per R1: yes, auto-claim eligible (Finding #13 surface).
9. **UAT-MOVE-FLOATING-1 (cross-group inheritance preserved)** — Floating tab in G1 (inherited). Drag to G2's floating zone. Expected: tab now floating under G2 with new parentItemId; `inheritedTabs.has(tabId)` still true. Verify by triggering a `chrome.tabs.onUpdated` URL matching a G3 saved bookmark — tab must remain in G2.
10. **UAT-RACE-A1 (tab close mid-drag)** — Start dragging a floating tab. While dragging, close the tab via `chrome.tabs.remove` (DevTools console). Release. Expected: toast "Tab closed during drag — drop cancelled."
11. **UAT-CROSS-WIN-1 (cross-window snap-back)** — W1 + W2 with different tabs. Drag W1 Open Tab over W2's Open Tabs region. Expected: indicator paints reject (red); on release, toast "Cross-window drag is not supported yet."
12. **UAT-SCROLL-1 (scroll-during-drag invalidation)** — Start drag. Scroll the sidepanel mid-drag. Continue dragging. Drop. Expected: hit-test resolves correctly post-scroll (cache invalidates).
13. **UAT-A11Y-1 (toast announcement)** — With VoiceOver/Narrator enabled, perform UAT-RACE-1. Expected: toast text is announced.
14. **UAT-THEME-1 (14-theme indicator contrast)** — Walk all 14 themes. For each: trigger an ATTACH drag and a cross-window REJECT drag. Verify both indicators (accent + danger) clearly visible against panel background.
15. **UAT-CONFIRM-1 (no destructive confirmation)** — Confirm no dialog opens for any of the 5 ops. (Negative test.)
16. **UAT-MULTI-WINDOW-CONCURRENT (broadcast race genuine)** — Open the sidepanel in two browser windows. In W2, drag a floating tab. While dragging, in W1 use bulk-delete or a saved-bookmark drag to mutate items. Release the W2 drag. Expected: clean toast, no broken state.
17. **UAT-DRAGGED-ROW-VISUAL** — During drag, observe whether the source row visually de-emphasizes. Expected (per Finding #14): browser-default ghost only.
18. **UAT-ESCAPE-CANCEL** — Start drag, press Escape mid-drag. Verify dragend fires, `_tabDragState` cleared, indicator hidden, no stuck class on `#item-list`.
19. **UAT-MOUSELEAVE-CANCEL** — Start drag, move pointer outside the browser window mid-drag, release outside. Verify dragend fires cleanly, no stuck state.
20. **UAT-AUTOCLAIM-SUPPRESS** — Drag an Open Tab whose URL matches a saved bookmark in another group, ATTACH to a third group. Verify: the source group does not auto-claim it (per AC4 + B-125 inheritedTabs lock); the third group has the floating record.
