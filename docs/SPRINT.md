# Current Sprint

*Sprint 36 — UI/UX polish bundle. Planned 2026-04-26. **R1 LOCKED in BACKLOG.md for all 9 items 2026-04-26 (manual lock — pre-kickoff). Product-owner approved Wave 0 launch 2026-04-26.***

Nine-item UI/UX polish-and-bugfix sprint targeting v1.30.0. Bundles 2 carryover follow-ups from S35 (B-107, B-108) + 7 items from product-owner UI review of v1.29.0 (B-109 through B-115). Heavy by item count but only 1 M (the B-110 drift bug); rest are S/XS polish. Ships to `release/v2`. No main merge — manual product-owner task.

**Size flag**: 9 items is the heaviest sprint by count to date (S35 was 5; S34 was 2). 1 M + 4 S + 4 XS is well within P-3 limits (max 2 M parallel; we have only 1). If you'd prefer tighter scope, recommend splitting into S36 (B-110 anchor + B-107 + B-108 + B-112 + B-114 + B-115 = 1M+1S+4XS — bug + tint/chevron tweaks) and S37 (B-109 + B-111 + B-113 = 1XS+2S, the item-row visual polish set).

---

## Gate 6 — Sprint Readiness (verified 2026-04-26)

| # | Check | Status |
|---|-------|--------|
| 1 | All sprint items have passed Definition of Ready | ✅ — all 9 items R1 LOCKED in BACKLOG.md 2026-04-26 (manual lock — DoR items 1-4 + 7 satisfied for all 9; DoR items 5-6 satisfied at R2 for the 4 Full items B-108, B-110, B-111, B-113) |
| 2 | Total sprint effort fits the sprint duration | ⚠️ — 1 M + 4 S + 4 XS = within P-3 limit (1 M of max 2) but heaviest sprint by item count to date. Recommend splitting if user prefers tighter scope. |
| 3 | No unresolved blockers from S35 | ✅ |
| 4 | `SPRINT.md` "Active Items" populated | ✅ (below) |
| 5 | `BACKLOG.md` items filed | ✅ — B-107, B-108 (S35 follow-ups) + B-109, B-110, B-111, B-112, B-113, B-114, B-115 NEW |
| 6 | `BACKLOG_BOARD.md` updated | ✅ |
| 7 | Deps-resolved check | ✅ — all 9 items' deps satisfied (all dependencies are ✅ shipped) |

**Pending product-owner approval before R1 launch.**

---

## Active Items

### [B-110] Drifted-on-non-live BUG fix (anchor)
- **Tier**: Full (M) — full pipeline R1 → R7
- **Wave**: 0 (anchor — investigation-first; touches drift lifecycle in `background/tabs/`)
- **Feature Context**: Drift indicator showing on non-live bookmarks violates §10.7 invariant. User-reported with image evidence post-v1.29.0.
- **Likely fix**: defense-in-depth gate in `_ensureIndicators` (`isDrifted && live`) AND fix the underlying claim-clear leak.
- **Dependencies**: B-099 ✅, B-101 ✅
- **Risk flags**: Could uncover deeper invariant violation. Multi-window UAT may be needed.

### [B-107] Live-X aria-label reactive flip (Fast Track XS, S35 carryover)
- **Tier**: Fast Track (XS) — R1 → R3 → R4 (code + security)
- **Wave**: 0 — touches sidepanel.js item action row aria-label only
- **Feature Context**: WCAG 2.1 SC 4.1.2 — X button on live row currently announces "Delete bookmark" but action is "Close tab" (B-100 v1.29.0).

### [B-108] Solarized-light secondary text AA fix (Full S, S35 carryover)
- **Tier**: Full (S)
- **Wave**: 0 — themes.css solarized-light block only; independent of other items
- **Feature Context**: `--text-secondary` (`#657b83`) on `--bg-secondary` (`#eee8d5`) measures 3.636:1 sub-AA. Affects group counts + helper text.

### [B-112] Remove "Tab Junkie" label from sidepanel header (Fast Track XS)
- **Tier**: Fast Track (XS)
- **Wave**: 0 — sidepanel.html + sidepanel.css header section; independent of item-row work
- **Feature Context**: Browser already shows extension name in its own chrome; duplicate label wastes vertical space.

### [B-114] Group header tint v2 — brighter, especially on dark themes (Fast Track XS)
- **Tier**: Fast Track (XS)
- **Wave**: 0 — `shared/themes.css` only (per-theme tint amount overrides)
- **Feature Context**: Product-owner feedback: "very dark in dark modes; want to see it brighter." Per-theme calibration approach recommended (light themes stay at 18%, dark themes bump to 22-25% per WCAG AA ceiling).
- **R1 will lock**: per-theme values across all 14 themes; verify §47.7 WCAG AA spot-check matrix at the new defaults

### [B-115] Group-header chevron brightening (Fast Track XS)
- **Tier**: Fast Track (XS)
- **Wave**: 0 — `sidepanel/sidepanel.css` `.group-header__chevron` rule (or equivalent)
- **Feature Context**: Product-owner feedback: "items in a group are hard to identify as part of the group; might bring color of group down into items, OR simply start with making the chevron buttons brighter." LOCKED to start with chevron brightening; bring-color-into-items approach deferred to a future B-116 if needed after observing B-114 + B-115 visual impact.
- **R1 PROPOSED**: chevron color → `var(--gc-<slot>)` for group-themed chevron (matches B-104+B-114 tint cohesion); R1 picks vs solid `var(--text-primary)` if group-tinted chevron has contrast issues

### [B-109] Group header text colored to match group color (Fast Track XS)
- **Tier**: Fast Track (XS)
- **Wave**: 1 — sidepanel.css `.group-header .group-name` rule; pure CSS
- **Feature Context**: Group header background is tinted with group color (B-104+B-106+B-114); user wants the text also tinted toward the group color while clearing WCAG AA.
- **R1 proposed**: `color-mix(in srgb, var(--gc-<slot>) 60%, var(--text-primary))` formula

### [B-111] Dynamic delete icon (X for live, trashcan for non-live) (Full S)
- **Tier**: Full (S)
- **Wave**: 1 — sidepanel.js item action row + sidepanel.css icon styling
- **Feature Context**: X button icon should reflect action (close tab vs delete bookmark).
- **LOCKED 2026-04-26**: confirmation dialog scope OUT — keep B-100 v1.29.0 contract verbatim. Item is icon-swap only.
- **Recommended approach**: pure CSS via `[data-live="true"]` attribute selector with two SVG elements

### [B-113] Item-row drag handle on hover + checkbox in multi-select (Full S)
- **Tier**: Full (S) — tier upgraded from Fast Track because drag interaction + multi-select state are tested behavior surfaces with regression risk
- **Wave**: 1 — sidepanel.js item-row construction + drag handle wiring
- **Feature Context**: Current shows non-clickable checkbox border on hover. New: hover shows drag handle (`⋮⋮`); multi-select mode swaps slot to checkbox.

---

## Wave Plan

```
Wave 0 (6 items in parallel — independent surfaces, no JS conflicts)
  ├── B-110 R1 → R2 → R3 → R4 → R5 → R6 → R7    [Full M, anchor — drift bug]
  ├── B-107 R1 → R3 → R4 (Fast Track)              [Fast Track XS, sidepanel.js aria-label]
  ├── B-108 R1 → R2 → R3 → R4 → R5 → R6 → R7    [Full S, themes.css solarized-light]
  ├── B-112 R1 → R3 → R4 (Fast Track)              [Fast Track XS, sidepanel.html header]
  ├── B-114 R1 → R3 → R4 (Fast Track)              [Fast Track XS, themes.css :root + dark themes]
  └── B-115 R1 → R3 → R4 (Fast Track)              [Fast Track XS, sidepanel.css chevron]

Wave 1 (3 items — sidepanel item-row visual polish; staged to avoid CSS conflicts)
  ├── B-109 R1 → R3 → R4 (Fast Track)              [Fast Track XS, sidepanel.css .group-header .group-name]
  ├── B-111 R1 → R2 → R3 → R4 → R5 → R6 → R7    [Full S, X-button icon swap]
  └── B-113 R1 → R2 → R3 → R4 → R5 → R6 → R7    [Full S, hover drag handle + multi-select swap]

Sprint Close
  Gate 4 → Gate 7 retrospective → [release-manager] v1.30.0 → archive (release/v2 only; no main merge)
```

**P-1 / P-2 / P-3 compliance**:
- P-1 ✅ — zero L/XL items
- P-2 ✅ — S/XS items can run alongside any active item
- P-3 ✅ — only one M item (B-110); no second M

**Wave 1 sequencing rationale**: B-109 (text color) lands first to establish the formula; B-111 (X-button icons) second; B-113 (drag handle + checkbox swap) last. All three touch `sidepanel/sidepanel.{js,css}` but in different sections.

---

## Completed This Sprint

### Wave 0 — closed 2026-04-28 (UAT pending in Edge)

**[B-107]** Live-X aria-label reactive flip (Fast Track XS) — done.
- Files changed: `sidepanel/sidepanel.js` (+9 lines in `refetchAndPatchLiveState` patch loop, line 3064-3074); `tests/b107-live-x-aria.test.js` (NEW, 4 tests).
- R4: code-reviewer PASS, security-reviewer PASS.

**[B-108]** Solarized-light `--text-secondary` WCAG AA fix (Full S) — done.
- Files changed: `shared/themes.css` (lines 313, 333 — both `--text-secondary` AND `--group-count-text` darkened `#657b83` → `#546a72` per §54.3 D-2 binding correction); `tests/b108-solarized-secondary-contrast.test.js` (NEW, 5 tests T1-T5); `docs/design/54-b-108-solarized-light-secondary-fix.md` (NEW chapter, R6 close filled); root TOC.
- R4: code-reviewer PASS, security-reviewer PASS, qa-reviewer PASS-with-fixes (M-2 + M-3 doc fixes addressed in R6).
- Verified contrast: 4.6553:1 vs `--bg-secondary` (above 4.5:1 floor).

**[B-110]** Drift indicator on non-live bookmark bug fix (Full M, anchor) — done.
- Files changed: `sidepanel/sidepanel.js` (conjunctive gate at first-paint line ~2375 + `_ensureIndicators` line ~3208); `background/tabs/tab-claims.js` (new `clearDrift` import + `evictedItemIds` tracker + `Promise.allSettled` batch after `writeClaims`); `background/messages/storage-handlers.js:393` (`await clearDrift(p.itemId)` after `releaseClaimByTab` in AC3 stale-claim repair); `tests/b110-drift-non-live-fix.test.js` (NEW, 8 tests T1-T8 incl. T8 aria-label asymmetry pin); `tests/b101-drift-bar.test.js` (R4 hygiene fix — inlined stubs updated to mirror post-B-110 production gate); `docs/UAT_B-110.md` (NEW, 5 UAT cases); `docs/design/53-b-110-drift-non-live-fix.md` (NEW chapter, R6 close filled); root TOC.
- R4: code-reviewer PASS-with-fixes, security-reviewer PASS, qa-reviewer PASS-with-fixes (3 MEDIUM findings all addressed in R6).
- Two leaks fixed: PRIMARY (`reconcileClaims` cold-start eviction) + SECONDARY (`MSG_NAVIGATE_TO_ITEM` AC3 stale-claim repair). Defense-in-depth render gate added at both render sites.

**[B-112]** Remove "Tab Junkie" label from sidepanel header (Fast Track XS) — done.
- Files changed: `sidepanel/sidepanel.html` (removed `<span class="panel-header-title">`); `sidepanel/sidepanel.css` (removed `.panel-header-title` rule); `tests/b112-header-label-removed.test.js` (NEW, 3 tests).
- R4: code-reviewer PASS, security-reviewer PASS.

**[B-114]** Brighter dark-theme group-header tint v2 (Fast Track XS) — done.
- Files changed: `shared/themes.css` (added `--group-header-tint-amount: 20%` to 11 dark themes + the system-dark @media branch; light themes stay 18%, solarized-light stays 3%); `tests/b114-tint-v2.test.js` (NEW, 3 tests).
- R4: code-reviewer PASS, security-reviewer PASS. WCAG AA spot-check verified worst-case (atom-one-dark + yellow) at 4.55:1 (above 4.5:1 floor).

**[B-115]** Group-header chevron brightening (Fast Track XS) — done.
- Files changed: `sidepanel/sidepanel.css` (`.group-header-collapse` `color: var(--group-header-color, var(--text-primary))`); `tests/b115-chevron-color.test.js` (NEW, 2 tests).
- R4: code-reviewer PASS-with-fixes (M-1: `--collapse-icon` token now orphaned across 17 sites — addressed in W0-A.1 cleanup), security-reviewer PASS.

**Wave 0 cleanup (W0-A.1)**: `--collapse-icon` token removed from `shared/themes.css` (17 sites: `:root` + system @media + 14 themes); `tests/b037-themes.test.js` token-list assertion updated; B-115 inline comment in `sidepanel.css` rewritten (dropped false "retained for any future consumer" claim).

**Test count delta**: 1,464 (post-S35 baseline) → **1,489** (+25 across 6 wave-0 items). Zero regressions.

### Wave 1 — closed 2026-04-28 (UAT pending in Edge)

**[B-109]** Group-header text colored to match group color (Fast Track XS) — done.
- Files changed: `shared/themes.css` (new `--group-header-name-color` token at `:root` with 50% color-mix formula; per-theme override to `var(--text-primary)` in 10 failing-AA theme blocks: system, tomorrow, atom-one-light, tomorrow-night, atom-one-dark, solarized-light, solarized-dark, dracula, nord, one-dark); `sidepanel/sidepanel.css` (`.group-header-name` consumes `var(--group-header-name-color)`); `tests/b109-group-name-tint.test.js` (NEW, 4 tests T1-T4 incl. AA matrix verification + override-list drift guard).
- R3 discovery: 50% formula breaches WCAG AA on 10/14 themes (worst: solarized-dark+red = 2.534:1). Per R1 Q5 escape hatch, shipped per-theme overrides forcing `var(--text-primary)`. The visual ships on 4 themes (github-light, github-dark, monokai, tokyo-night) + system-OS-dark.
- R3 also surfaced a pre-existing AA defect (atom-one-dark+yellow has been below 4.5:1 since B-104 shipped at 12% tint). Filed as follow-up B-117 in BACKLOG.md.
- R4: code-reviewer PASS-with-fixes, security-reviewer PASS. M-1 (override-list drift guard test) addressed in R6.

**[B-111]** Dynamic delete icon (X for live, trash for non-live) (Full S) — done.
- Files changed: `sidepanel/sidepanel.js` (replaced single trash `<svg>` with two SVGs in `.item-action-delete`; both `aria-hidden="true"`); `sidepanel/sidepanel.css` (4 new rules near `.item-action-delete:hover` — symmetric default + live-state visibility toggles); `tests/b111-dynamic-delete-icon.test.js` (NEW, 4 tests T1-T4); `docs/design/55-b-111-dynamic-delete-icon.md` (NEW chapter, R6 close filled); root TOC.
- R2 binding correction (D-4): R1 Q5 incorrectly claimed `buildOpenTabRow` has an `.item-action-delete` button — verified false. R3 strictly limited footprint to `buildItemRow`. T7 is the static-source guard.
- R4: code-reviewer PASS-with-fixes, security-reviewer PASS, qa-reviewer PASS-with-fixes. 3 LOWs all addressed in R6 (T1 regex tightened, symmetric trash-default rule added, UAT-5 promoted to mandatory).

**[B-113]** Item-row drag handle on hover + checkbox in multi-select (Full S) — done.
- Files changed: `sidepanel/sidepanel.js` (new `<span class="item-drag-handle">` with 6-circle SVG matching `.group-drag-handle`; appended in `buildItemRow` after `.item-select`); `sidepanel/sidepanel.css` (split existing `.item-row:hover .item-select` rule clauses; new `.item-drag-handle` block with flex-overlap positioning + `prefers-reduced-motion` gate; Gmail-pattern persistent reveal); `tests/b113-drag-handle-multi-select.test.js` (NEW, 7 tests T1-T7); `tests/b048-visual-states.test.js` (header comment + AC6 assertion update for the b048 §31.5 AC6 contract change); `docs/design/56-b-113-drag-handle-multi-select.md` (NEW chapter, R6 close filled); root TOC.
- R2 binding correction (D-5): open-tab rows are NOT draggable (verified at `buildOpenTabRow`); handle omitted for honest UX. T2 is the static-source guard.
- R2 binding correction (D-3): the existing `.item-row:hover .item-select` rule split intentionally — `:focus-visible` + `[data-selected="true"]` clauses preserved together; `:hover` scoped under `#item-list.has-bulk-bar`. R3 expanded scope vs. R2's fix-scope table (which only listed b048 header comment) to also update the b048 AC6 assertion test that pinned the pre-B-113 triad.
- R4: code-reviewer PASS, security-reviewer PASS, qa-reviewer PASS-with-fixes. **M-1 was a real layout bug** — original `position: absolute; left: 12px` misaligned by 3 px on `data-live="true"` rows because absolute positioning anchors to the row's padding-edge which shifts with border-left. R6 iterated to flex-overlap (`flex: 0 0 18px; margin-left: -18px;`) — invariant across all row states.

**Wave 1 test delta**: 1,489 (post-Wave-0) → **1,504** (+15 across 3 wave-1 items). Zero regressions.

**Total Sprint 36 test delta**: 1,464 (post-S35) → **1,504** (+40 across 9 items).

---

## Sprint Retrospective — Sprint 36

### Velocity
- Planned: 9 items / 1M + 4S + 4XS effort
- Completed: 9 items / 1M + 4S + 4XS — fully on plan
- Carried over: 0
- Test delta: +40 (1,464 → 1,504); zero regressions across all rounds

### What Went Well
- **Chunked execution kept the session resilient** — after the prior session froze during a 6-agent parallel launch in Wave 0, breaking work into ~10-minute checkpoints (W0-A through W0-E + W1-A, W1-B.1+W1-B.2, W1-C.1+W1-C.2) survived the full sprint without freezes. The pause-and-confirm pattern also caught real issues earlier (W1-A 50% AA failure, W1-C.2 layout misalignment).
- **R2 binding-correction pattern proved its value, third-time** — three R1 LOCKED claims were factually wrong this sprint (B-108 D-2 token aliasing, B-111 D-4 open-tab delete buttons, B-113 D-5 open-tab draggability). Each was caught by R2 verification before R3 wasted effort. This is now a firmly-established recurring R2 quality gate.
- **CSS-cascade-driven affordance swaps shipped four times** — B-110 (drift bar conjunctive gate), B-111 (X/trash icon swap), B-113 (drag-handle/checkbox swap), and B-115 (chevron themed color) all leveraged the existing `data-*` attribute mirroring on `.item-row`. Zero new JS in any of the swap hot paths; all reactivity is declarative.

### What to Improve
- **R1 LOCKED is not always trustworthy on factual claims** — three R1 → R2 corrections this sprint indicate that R1 [product-manager] is sometimes asserting code-shape claims (selectors, function bodies, file structure) without verifying against the source. Future R1 should restrict claims to USER-FACING contract (acceptance criteria) and defer code-shape claims to R2 verification, OR adopt a "must verify against source" discipline at lock time.
- **R2 fix-scope tables can underspecify pre-existing test assertions that need updating** — B-113's R2 §56.5 listed only the b048 header comment update; R3 had to expand scope to also update the b048 AC6 assertion test that asserted the pre-B-113 triad-shared-block structure. New precedent: when R2 declares an "intentional contract modification," R2 must grep for any test that ASSERTS the pre-change contract and enumerate them in the fix-scope table.
- **The §47.7 spot-check matrix has inaccurate "PASS" verdicts** — B-109 R3 discovered atom-one-dark+yellow has been below 4.5:1 since B-104 shipped at 12% tint. The §47.7 matrix and B-114 shipping notes both claim 4.78:1 / 4.55:1 — both incorrect. Filed as B-116 follow-up with explicit goal: re-verify ALL 20 cells in the §47.7 matrix at the current shipping tint amounts and correct the design-doc claims.

### Action Items for Next Sprint
- [ ] **Add an R1 quality gate**: when R1 makes ANY claim about source code structure (line numbers, function bodies, selectors, file existence), the [product-manager] must cite the verified source location OR mark the claim "R2-VERIFY". Prevents the R1-locked-but-factually-wrong pattern.
- [ ] **Extend R2 §X.5 R3 fix-scope tables** to include a "pre-existing test assertions to update" subsection when the chapter declares a contract change. Caught after B-113 R3 had to expand scope mid-build.
- [ ] **Triage B-117 (§47.7 matrix re-verification)** in the next planning round. Pre-existing AA defect surface needs a proper audit, not just B-109's spot-check sample.

---

---

## Blockers

*None.*

---

## Out of scope (explicit triage)

- **B-041** (sync tab order, P2/L) — last big feature item; deserves its own sprint
- **B-076** (MIGRATION_STEPS hook) — passive future-work placeholder
- **B-086** (sidepanel UI/UX umbrella, P3/M) — broader umbrella; could pair with B-041 post-S36
- **Approach 2 from B-115** (bring group color into item rows) — deferred until B-114 + B-115 ship and we observe visual impact; may not be needed

---

## Pre-flight reminders for kickoff

**R1 was completed manually pre-kickoff (2026-04-26)** — all 9 items have R1 LOCKED blocks in `docs/BACKLOG.md`. Skip the formal R1 [product-manager] round; agents read R1 directly from BACKLOG.md row.

**Revised Wave 0 launch (6 agents in parallel — R2 for Full items, R3 for Fast Track items):**
- [solution-architect] R2 for **B-110** (Full M, anchor — drift bug; investigate claim-release leak paths)
- [solution-architect] R2 for **B-108** (Full S — solarized-light secondary text; token darken recipe + regression scan)
- [frontend-engineer] R3 for **B-107** (Fast Track XS — sidepanel.js aria-label flip)
- [frontend-engineer] R3 for **B-112** (Fast Track XS — sidepanel.html header span removal + sidepanel.css rule deletion)
- [frontend-engineer] R3 for **B-114** (Fast Track XS — shared/themes.css 11 dark-theme tint overrides)
- [frontend-engineer] R3 for **B-115** (Fast Track XS — sidepanel.css `.group-header-collapse` color change)

Note on file overlap: B-112 and B-115 both touch `sidepanel/sidepanel.css` but in different rule blocks (panel-header vs group-header-collapse). Edit-tool old_string targeting handles non-overlapping edits safely.

After Wave 0 completes (R3 build + R4 review for Fast Track; R2 → R3 → R4 → R5 for Full items), kick off Wave 1: B-109, B-111, B-113.

Test count baseline: 1,464 (post-S35). Target post-S36: ~1,490+ depending on item-by-item.
