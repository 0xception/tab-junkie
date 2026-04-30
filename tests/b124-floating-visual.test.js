/**
 * b124-floating-visual.test.js — B-124 R5 (Sprint 39, anchor item #1)
 *
 * Authoritative spec: docs/design/61-b-124-floating-visual.md (§61.5.4 test
 * plan T-124-A through T-124-I).
 *
 * Sprint 38 / B-121 shipped synthetic floating-tab rows (`data-floating="true"`)
 * with VISUAL parity to saved-bookmark live rows. B-124 fills the visual-
 * distinction gap:
 *   1. 3 px DOTTED left bar in `var(--floating-bar-color)` (defaults to
 *      `var(--live-indicator)`) replaces the SOLID live-bar.
 *   2. Hover/focus-within "Save as bookmark" CTA dispatching MSG_PROMOTE_TAB.
 *   3. `aria-label` switches from `"... live tab ..."` to `"floating tab — ..."`.
 *   4. WCAG AA contrast posture preserved across all 14 themes (Dimension 1
 *      pre-computed at R2 §61.6.1).
 *
 * Coverage (maps directly to §61.5.4):
 *   T-124-A — `.item-floating-bar` element exists in `buildFloatingTabRow`
 *             output (source-text assertion on sidepanel.js).
 *   T-124-B — aria-label override pattern exists in `buildFloatingTabRow`:
 *             "floating tab — " prefix + "live tab" suffix omission.
 *   T-124-C — `.floating-row-save-cta` button is appended in
 *             `buildFloatingTabRow`.
 *   T-124-D — Save CTA click handler dispatches MSG_PROMOTE_TAB with
 *             `{ tabId, groupId }` payload (source-text assertion).
 *   T-124-E — Drift-skip invariant (§61.7 Q2 contract): floating tabs are
 *             not in `claimsMirror`, so `detectDriftForTab` exits at the
 *             unclaimed-tab guard at `background/tabs/drift.js:31-34`.
 *             Regression guard.
 *   T-124-F — Newtab parity: `_buildFloatingTabRow` includes the dotted-bar
 *             element, the Save CTA, and the new aria-label format.
 *   T-124-G — `--floating-bar-color: var(--live-indicator)` declared in
 *             `:root` block of `shared/themes.css` (CSS regex assertion).
 *   T-124-H — Hover CTA reachable via keyboard: CSS rule pair includes
 *             `:focus-within` reveal alongside `:hover` reveal.
 *   T-124-I — CSS contract: floating-row override transparents the
 *             inherited live-bar so the dotted-bar paints alone; bar
 *             selector is `position: absolute; left: 0`.
 *
 * Strategy: regex-pin source-text assertions on production files (mirrors
 * b123-row-alignment, b101-drift-bar, b048 patterns). The sidepanel module
 * cannot be imported in Node (DOM queries at load), so source-text grep is
 * the established escape hatch for this code surface.
 */

import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = dirname(__filename);
const REPO_ROOT = resolve(__dirnameLocal, '..');

function readFile(rel) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

/* =========================================================================
   T-124-A (B-130 hotfix rewrite) — `.item-row[data-floating="true"]`
   re-styles the row's existing `border-left` (the live indicator) as
   DOTTED in `var(--floating-bar-color)`. The previous separate
   `.item-floating-bar` element was removed by B-130 to eliminate the
   visual collision with the dotted-orange drift bar that sits in the
   same x-column.
   ========================================================================= */

test('B-124 T-124-A (B-130): `.item-row[data-floating="true"]` overrides border-left to dotted in --floating-bar-color', () => {
  const css = readFile('sidepanel/sidepanel.css');

  /* The override rule body must declare BOTH border-left-style: dotted
     AND border-left-color: var(--floating-bar-color). */
  const overrideMatch = css.match(/\.item-row\[data-floating="true"\]\s*\{([^}]*)\}/);
  assert.ok(overrideMatch, '`.item-row[data-floating="true"]` rule must exist');
  const overrideBody = overrideMatch[1];

  assert.match(
    overrideBody,
    /border-left-style:\s*dotted/,
    'floating-row override must declare border-left-style: dotted',
  );
  assert.match(
    overrideBody,
    /border-left-color:\s*var\(--floating-bar-color\)/,
    'floating-row override must declare border-left-color: var(--floating-bar-color)',
  );

  /* B-130 AC2: the previous separate `.item-floating-bar` rule MUST NOT
     exist anywhere in sidepanel.css. */
  assert.doesNotMatch(
    css,
    /\.item-floating-bar\s*\{/,
    'B-130 AC2: `.item-floating-bar` CSS rule must be removed (was the pre-hotfix separate-bar element)',
  );
});

test('B-124 T-124-A.2 (B-130): buildFloatingTabRow no longer injects an `.item-floating-bar` element', () => {
  const js = readFile('sidepanel/sidepanel.js');

  const fnMatch = js.match(/function buildFloatingTabRow\(member\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, 'buildFloatingTabRow function must exist in sidepanel.js');
  const fnBody = fnMatch[1];

  /* B-130 AC2: the className assignment for the now-removed bar element
     must not appear in the build path. */
  assert.doesNotMatch(
    fnBody,
    /\.className\s*=\s*['"]item-floating-bar['"]/,
    'B-130 AC2: buildFloatingTabRow must not assign className="item-floating-bar" (separate-bar element removed)',
  );

  /* The defensive re-attach inside patchFloatingMembersSections must
     also be gone (B-130 AC2). */
  const patchMatch = js.match(/function patchFloatingMembersSections\(nextFloatingMembers\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(patchMatch, 'patchFloatingMembersSections must exist');
  assert.doesNotMatch(
    patchMatch[1],
    /\.className\s*=\s*['"]item-floating-bar['"]/,
    'B-130 AC2: patchFloatingMembersSections must not defensively re-attach an `.item-floating-bar` element',
  );
});

/* =========================================================================
   T-124-B — aria-label override: "floating tab — <title>", no "live tab".
   ========================================================================= */

test('B-124 T-124-B: buildFloatingTabRow overrides aria-label with "floating tab — " prefix; "live tab" suffix dropped', () => {
  const js = readFile('sidepanel/sidepanel.js');

  /* The aria-label override is implemented via the
     `_applyFloatingRowAriaLabel` helper. Verify the helper exists. */
  const helperMatch = js.match(/function _applyFloatingRowAriaLabel\(row, member\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(helperMatch, '_applyFloatingRowAriaLabel helper must exist');
  const helperBody = helperMatch[1];

  /* The helper must construct a label starting with "floating tab — ". */
  assert.match(
    helperBody,
    /['"`]floating tab — \$\{title\}['"`]|['"`]floating tab — ['"`]/,
    '_applyFloatingRowAriaLabel must compose label with "floating tab — " prefix',
  );

  /* The helper must NOT push the "live tab" suffix anywhere — that is the
     B-124 §61.8 contract change. */
  assert.doesNotMatch(
    helperBody,
    /['"`]live tab['"`]/,
    '_applyFloatingRowAriaLabel must NOT include "live tab" — floating ≠ saved-claimed-live',
  );

  /* The suffix order must mirror buildItemRowAriaLabel: active → audible
     → selected. */
  const activeIdx = helperBody.indexOf('active tab');
  const audibleIdx = helperBody.indexOf('playing audio');
  const selectedIdx = helperBody.indexOf('selected');
  assert.ok(activeIdx > 0, 'helper must push "active tab" suffix');
  assert.ok(audibleIdx > activeIdx, 'helper must push "playing audio" AFTER "active tab"');
  assert.ok(selectedIdx > audibleIdx, 'helper must push "selected" AFTER "playing audio"');

  /* buildFloatingTabRow must call _applyFloatingRowAriaLabel before
     returning the row (otherwise the buildOpenTabRow-emitted label
     ("...live tab...") leaks through). */
  const fnMatch = js.match(/function buildFloatingTabRow\(member\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, 'buildFloatingTabRow must exist');
  assert.match(
    fnMatch[1],
    /_applyFloatingRowAriaLabel\(row,\s*member\)/,
    'buildFloatingTabRow must call _applyFloatingRowAriaLabel(row, member)',
  );
});

/* =========================================================================
   T-124-C — `.floating-row-save-cta` button child element.
   ========================================================================= */

test('B-124 T-124-C: buildFloatingTabRow appends a `.floating-row-save-cta` button', () => {
  const js = readFile('sidepanel/sidepanel.js');

  const fnMatch = js.match(/function buildFloatingTabRow\(member\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, 'buildFloatingTabRow must exist');
  const fnBody = fnMatch[1];

  /* The Save CTA must be a <button>, classed `floating-row-save-cta`,
     with an explicit aria-label. */
  assert.match(
    fnBody,
    /createElement\(['"]button['"]\)/,
    'buildFloatingTabRow must create a <button> for the Save CTA',
  );
  assert.match(
    fnBody,
    /\.className\s*=\s*['"]floating-row-save-cta['"]/,
    'buildFloatingTabRow must set className="floating-row-save-cta"',
  );
  assert.match(
    fnBody,
    /setAttribute\(['"]aria-label['"],\s*['"]Save as bookmark['"]\)/,
    'Save CTA must carry aria-label="Save as bookmark"',
  );

  /* The CSS rule for the CTA must hide it by default (visibility hidden
     + opacity 0) so the row's existing layout is unchanged when the user
     is not hovering / focused. */
  const css = readFile('sidepanel/sidepanel.css');
  const ctaRuleMatch = css.match(/\.floating-row-save-cta\s*\{([^}]*)\}/);
  assert.ok(ctaRuleMatch, '.floating-row-save-cta CSS rule must exist');
  const ctaBody = ctaRuleMatch[1];
  assert.match(ctaBody, /visibility:\s*hidden/, 'CTA hidden by default');
  assert.match(ctaBody, /opacity:\s*0/, 'CTA opacity 0 by default');
});

/* =========================================================================
   T-124-D — Save CTA click dispatches MSG_PROMOTE_TAB with {tabId, groupId}.
   ========================================================================= */

test('B-124 T-124-D: Save-CTA click handler dispatches MSG_PROMOTE_TAB with `{ tabId, groupId }`', () => {
  const js = readFile('sidepanel/sidepanel.js');

  /* The click handler is `_onFloatingSaveCtaClick`. Verify its body
     reads tabId from the row's dataset and groupId from the enclosing
     .group-section, then dispatches MSG_PROMOTE_TAB. */
  const handlerMatch = js.match(/function _onFloatingSaveCtaClick\(ev\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(handlerMatch, '_onFloatingSaveCtaClick handler must exist');
  const body = handlerMatch[1];

  assert.match(
    body,
    /ev\.stopPropagation\(\)/,
    'click handler must stopPropagation so row activation does not also fire',
  );
  assert.match(
    body,
    /\.closest\(['"]\.item-row\[data-floating="true"\]['"]\)/,
    'click handler must resolve the floating row via .closest',
  );
  assert.match(
    body,
    /Number\(row\.dataset\.tabId\)/,
    'click handler must read tabId from row.dataset.tabId',
  );
  assert.match(
    body,
    /\.closest\(['"]\.group-section\[data-group-id\]['"]\)/,
    'click handler must resolve enclosing .group-section for groupId',
  );
  assert.match(
    body,
    /sendMessage\(MSG_PROMOTE_TAB,\s*\{\s*tabId,\s*groupId\s*\}\)/,
    'click handler must dispatch MSG_PROMOTE_TAB with { tabId, groupId } payload',
  );

  /* The error-translation block must use imported error constants
     (matches the Open-Tabs Save CTA pattern at sidepanel.js:6233). */
  assert.match(body, /ERR_SAFE_MODE/, 'error path must reference ERR_SAFE_MODE');
  assert.match(body, /ERR_DUPLICATE_URL/, 'error path must reference ERR_DUPLICATE_URL');
  assert.match(body, /ERR_VALIDATION/, 'error path must reference ERR_VALIDATION');
  assert.match(body, /showToast/, 'error path must call showToast for user feedback');
});

/* =========================================================================
   T-124-E — Drift-skip invariant: floating tabs (not in claimsMirror)
   exit detectDriftForTab at the unclaimed-tab guard. Regression guard
   against a future change that relaxes the guard at drift.js:29-34.
   ========================================================================= */

test('B-124 T-124-E: detectDriftForTab returns early for unclaimed tabIds (floating-tab drift-skip invariant)', async () => {
  const { __resetMock } = await import('./chrome-mock.js');
  __resetMock();

  const driftMod = await import('../background/tabs/drift.js');
  const { __resetTabClaims } = await import('../background/tabs/tab-claims.js');
  __resetTabClaims();

  /* Sanity: the guard is present at the top of detectDriftForTab. The
     production source must contain the early-return on unclaimed tabs
     (claimedItemId === null) — pin it to catch a future regression. */
  const driftSource = readFile('background/tabs/drift.js');
  assert.match(
    driftSource,
    /if\s*\(\s*claimedItemId\s*===\s*null\s*\)\s*return/,
    'detectDriftForTab must early-return when claimedItemId === null (unclaimed tab guard)',
  );

  /* Behavioural: call detectDriftForTab for a tabId that was never
     claimed (no entries in claimsMirror) — must return without throwing
     and without writing tj:drift. We cannot trivially assert "no write"
     in a single line without mocking the writer, but the pin above
     covers the structural guard which is what B-124 depends on. */
  const items = [
    { id: 'item-X', title: 'X', url: 'https://x.example/', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 },
  ];
  /* Should not throw. */
  await driftMod.detectDriftForTab(99999, 'https://x.example/', items);
  assert.ok(true, 'detectDriftForTab tolerates unclaimed tabId without throwing');
});

/* =========================================================================
   T-124-F (B-130 hotfix rewrite) — Newtab parity: _buildFloatingTabRow
   includes the Save CTA + floating-tab aria-label, and the right-side
   `.newtab-indicator-live` dot signals live-state. Per B-130, newtab no
   longer has a `.newtab-floating-bar` left-side element — the rationale:
   sidepanel rows have an inherited `border-left` live indicator (B-130
   re-styles it dotted on floating rows); newtab rows have no left-side
   border indicator at all (live state is signaled via the right-side
   `.newtab-indicator-*` dots in `.newtab-item-indicators`). Adding a
   left-side bar provided no extra cue and re-introduced the same
   x-column collision concern that motivated B-130 on sidepanel.
   ========================================================================= */

test('B-124 T-124-F (B-130): newtab _buildFloatingTabRow appends Save CTA + new aria-label; no separate floating bar element', () => {
  const js = readFile('newtab/newtab.js');

  const fnMatch = js.match(/function _buildFloatingTabRow\(member\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, 'newtab _buildFloatingTabRow must exist');
  const fnBody = fnMatch[1];

  /* B-130 AC2: the `.newtab-floating-bar` element creation must be gone. */
  assert.doesNotMatch(
    fnBody,
    /\.className\s*=\s*['"]newtab-floating-bar['"]/,
    'B-130 AC2: newtab _buildFloatingTabRow must not append `.newtab-floating-bar` element',
  );

  /* Save CTA button (retained — Save flow is unchanged). */
  assert.match(
    fnBody,
    /\.className\s*=\s*['"]newtab-floating-save['"]/,
    'newtab _buildFloatingTabRow must append `.newtab-floating-save` button',
  );
  assert.match(
    fnBody,
    /dataset\.action\s*=\s*['"]save-floating['"]/,
    'newtab Save CTA must carry data-action="save-floating" for click delegation',
  );

  /* New aria-label format (retained). */
  assert.match(
    fnBody,
    /['"`]floating tab — \$\{titleText\}['"`]/,
    'newtab _buildFloatingTabRow aria-label must use "floating tab — <title>" prefix',
  );
  /* MSG_PROMOTE_TAB import + dispatch helper. */
  const promoteMatch = js.match(/function _promoteFloatingTab\(tabId, row\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(promoteMatch, 'newtab must define _promoteFloatingTab dispatcher');
  assert.match(
    promoteMatch[1],
    /type:\s*MSG_PROMOTE_TAB/,
    '_promoteFloatingTab must send MSG_PROMOTE_TAB',
  );

  /* Newtab CSS — B-130 AC2: `.newtab-floating-bar` rule must be removed.
     Save CTA rule retained. */
  const css = readFile('newtab/newtab.css');
  assert.doesNotMatch(
    css,
    /\.newtab-floating-bar\s*\{/,
    'B-130 AC2: `.newtab-floating-bar` CSS rule must be removed',
  );

  const saveMatch = css.match(/\.newtab-floating-save\s*\{([^}]*)\}/);
  assert.ok(saveMatch, '.newtab-floating-save CSS rule must exist');
  assert.match(saveMatch[1], /visibility:\s*hidden/, 'newtab Save CTA hidden by default');
});

/* =========================================================================
   T-124-G — `--floating-bar-color: var(--live-indicator)` declared in
   :root block of shared/themes.css.
   ========================================================================= */

test('B-124 T-124-G: shared/themes.css :root declares `--floating-bar-color: var(--live-indicator)`', () => {
  const css = readFile('shared/themes.css');

  /* Match the :root block specifically (NOT a per-theme block). */
  const rootMatch = css.match(/(^|\n):root\s*\{([\s\S]*?)\n\}/);
  assert.ok(rootMatch, ':root block must exist in shared/themes.css');
  const rootBody = rootMatch[2];

  assert.match(
    rootBody,
    /--floating-bar-color:\s*var\(--live-indicator\)/,
    ':root must declare `--floating-bar-color: var(--live-indicator)` so the per-theme green carries through automatically',
  );
});

/* =========================================================================
   T-124-H — Hover CTA reachable via keyboard: CSS rule pair includes
   :focus-within reveal alongside :hover reveal.
   ========================================================================= */

test('B-124 T-124-H: floating-row Save CTA is keyboard-reachable via :focus-within reveal', () => {
  const css = readFile('sidepanel/sidepanel.css');

  /* Both :hover and :focus-within selectors must reveal the CTA. The
     :focus-within rule is the keyboard-accessibility invariant — without
     it, the CTA is mouse-only and would be a CRITICAL qa-reviewer find. */
  assert.match(
    css,
    /\.item-row\[data-floating="true"\]:hover\s+\.floating-row-save-cta/,
    ':hover reveal selector must exist',
  );
  assert.match(
    css,
    /\.item-row\[data-floating="true"\]:focus-within\s+\.floating-row-save-cta/,
    ':focus-within reveal selector must exist (keyboard accessibility)',
  );

  /* Both selectors must be in the same rule body that flips visibility
     to visible + opacity to 1. */
  const revealRuleMatch = css.match(
    /\.item-row\[data-floating="true"\]:hover\s+\.floating-row-save-cta,\s*\.item-row\[data-floating="true"\]:focus-within\s+\.floating-row-save-cta\s*\{([^}]*)\}/,
  );
  assert.ok(revealRuleMatch, ':hover + :focus-within combined rule must exist');
  assert.match(revealRuleMatch[1], /visibility:\s*visible/, 'reveal flips visibility to visible');
  assert.match(revealRuleMatch[1], /opacity:\s*1/, 'reveal flips opacity to 1');

  /* Newtab parity: same :hover + :focus-within pair. */
  const newtabCss = readFile('newtab/newtab.css');
  assert.match(
    newtabCss,
    /\.newtab-item-row\[data-floating="true"\]:hover\s+\.newtab-floating-save/,
    'newtab :hover reveal selector must exist',
  );
  assert.match(
    newtabCss,
    /\.newtab-item-row\[data-floating="true"\]:focus-within\s+\.newtab-floating-save/,
    'newtab :focus-within reveal selector must exist (keyboard accessibility)',
  );
});

/* =========================================================================
   T-124-I (B-130 hotfix rewrite) — CSS contract: the floating-row
   override re-styles the row's existing `border-left` (painted by
   `.item-row[data-live]`) as DOTTED in `var(--floating-bar-color)` — the
   visual cue lives in the same x-column slot as the saved-bookmark live
   cue, no separate element. The override must NOT transparent the
   border-left-color anymore (that was the pre-hotfix behavior); the
   dotted style ON the token color IS the cue.
   ========================================================================= */

test('B-124 T-124-I (B-130): floating-row override re-styles the live-bar as dotted in the floating token color', () => {
  const css = readFile('sidepanel/sidepanel.css');

  const overrideMatch = css.match(/\.item-row\[data-floating="true"\]\s*\{([^}]*)\}/);
  assert.ok(overrideMatch, '`.item-row[data-floating="true"]` rule must exist');
  const overrideBody = overrideMatch[1];

  /* B-130: dotted style + floating-bar-color ON the existing border-left
     slot. NOT transparent (the pre-hotfix override transparented the
     inherited solid border so the separate `.item-floating-bar` element
     could paint over it; that element is gone). */
  assert.match(
    overrideBody,
    /border-left-style:\s*dotted/,
    'B-130: floating override must declare border-left-style: dotted',
  );
  assert.match(
    overrideBody,
    /border-left-color:\s*var\(--floating-bar-color\)/,
    'B-130: floating override must declare border-left-color: var(--floating-bar-color)',
  );
  assert.doesNotMatch(
    overrideBody,
    /border-left-color:\s*transparent/,
    'B-130: floating override must NOT set border-left-color: transparent (pre-hotfix shape removed)',
  );

  /* The override rule MUST NOT redeclare the full `border-left:`
     shorthand — that would re-introduce the pre-B-123 width/style/padding
     asymmetry. Mirrors the b123 §61 placeholder invariant. */
  assert.doesNotMatch(
    overrideBody,
    /(^|;|\n)\s*border-left\s*:/,
    'floating override must NOT redeclare full `border-left:` shorthand (B-123 placeholder invariant)',
  );

  /* B-130 AC2: the previous separate-bar rule must be gone. */
  assert.doesNotMatch(
    css,
    /\.item-floating-bar\s*\{/,
    'B-130 AC2: `.item-floating-bar` CSS rule must be removed',
  );
});

/* =========================================================================
   T-124-J — Cross-surface aria-label parity (R4 fix-round; [code] L-2 +
   [qa] L-1 + [security] L-1 3-way convergence).

   Before the fix-round, sidepanel and newtab diverged on TWO aria-labels:
     1. Save CTA: sidepanel = constant `"Save as bookmark"`;
                  newtab    = `"Save as bookmark: ${title}"` (interpolated).
     2. Floating-row aria-label:
                  sidepanel = `"floating tab — <title>, <suffixes>"`;
                  newtab    = `"floating tab — <title>, <url>, <suffixes>"`.

   R2 §61.8 prescribes the title-only form on both surfaces. The fix-round
   drops the title interpolation from the newtab Save CTA AND drops the URL
   interpolation from the newtab floating-row aria-label. This test pins
   both invariants so a future divergence fails fast in CI rather than
   waiting for a screen-reader UAT signal.
   ========================================================================= */

test('B-124 T-124-J: Save CTA aria-label is constant "Save as bookmark" on both surfaces (R4 fix-round)', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');
  const newtabJs = readFile('newtab/newtab.js');

  /* Sidepanel: literal string assignment via setAttribute. The
     buildFloatingTabRow body must contain the bare constant; T-124-C
     already pins this but we double-pin here for the parity contract. */
  const sidepanelFnMatch = sidepanelJs.match(/function buildFloatingTabRow\(member\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(sidepanelFnMatch, 'sidepanel buildFloatingTabRow must exist');
  assert.match(
    sidepanelFnMatch[1],
    /setAttribute\(['"]aria-label['"],\s*['"]Save as bookmark['"]\)/,
    'sidepanel Save CTA aria-label must be the constant "Save as bookmark" (no title interpolation)',
  );

  /* Newtab: locate the saveBtn block and assert the constant aria-label. */
  const newtabFnMatch = newtabJs.match(/function _buildFloatingTabRow\(member\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(newtabFnMatch, 'newtab _buildFloatingTabRow must exist');
  const newtabBody = newtabFnMatch[1];
  assert.match(
    newtabBody,
    /saveBtn\.setAttribute\(['"]aria-label['"],\s*['"]Save as bookmark['"]\)/,
    'newtab Save CTA aria-label must be the constant "Save as bookmark" (cross-surface parity per R2 §61.8)',
  );
  /* Belt-and-suspenders: explicitly reject the pre-fix-round interpolation
     on the Save CTA. A future regression that reintroduces
     `Save as bookmark: ${...}` fails fast. */
  assert.doesNotMatch(
    newtabBody,
    /saveBtn\.setAttribute\(['"]aria-label['"],\s*`Save as bookmark:\s*\$\{/,
    'newtab Save CTA must NOT interpolate the title into the aria-label',
  );
});

test('B-124 T-124-K (qa Notes — C-9 empty-state): _onFloatingSaveCtaClick falls back to groupId=null when enclosing group has been deleted', () => {
  /* §61.9 C-9 empty-state defense — narrow race: the parent group is
     deleted between hover and click. The handler reads the enclosing
     `.group-section[data-group-id]`, then re-validates that the resolved
     groupId is still in `_cachedGroups`; if not, it falls back to `null`
     (Ungrouped). This guard prevents a stale-group write through
     MSG_PROMOTE_TAB. Source-text assertion mirrors the b122 T7 pattern. */
  const sidepanelJs = readFile('sidepanel/sidepanel.js');

  /* Locate the click handler body. */
  const handlerMatch = sidepanelJs.match(/function _onFloatingSaveCtaClick\(ev\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(handlerMatch, '_onFloatingSaveCtaClick handler must exist');
  const body = handlerMatch[1];

  /* The handler must read the enclosing group via `.group-section[data-group-id]`. */
  assert.match(
    body,
    /\.closest\(['"]\.group-section\[data-group-id\]['"]\)/,
    'handler must read groupId from enclosing .group-section[data-group-id]',
  );

  /* The handler must validate against `_cachedGroups` (deleted-group fallback). */
  assert.match(
    body,
    /_cachedGroups\.some\(\s*\(g\)\s*=>\s*g\.id\s*===\s*groupId\s*\)/,
    'handler must re-validate groupId against _cachedGroups',
  );

  /* The fallback path MUST set groupId = null when the group is missing. */
  assert.match(
    body,
    /groupId\s*=\s*null/,
    'handler must fall back to groupId = null when the group has been deleted',
  );
});

test('B-124 T-124-J: floating-row aria-label is title-only on both surfaces (no URL on newtab) (R4 fix-round)', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');
  const newtabJs = readFile('newtab/newtab.js');

  /* Sidepanel helper: parts array starts with `floating tab — ${title}`,
     then active / audible / selected suffixes only. The URL must NOT
     appear as a parts.push entry. */
  const sidepanelHelperMatch = sidepanelJs.match(/function _applyFloatingRowAriaLabel\(row, member\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(sidepanelHelperMatch, 'sidepanel _applyFloatingRowAriaLabel helper must exist');
  const sidepanelHelperBody = sidepanelHelperMatch[1];
  assert.doesNotMatch(
    sidepanelHelperBody,
    /parts\.push\(\s*member\.url/,
    'sidepanel floating-row aria-label must NOT push member.url (title-only form per R2 §61.8)',
  );

  /* Newtab: the aria-label assembly block must NOT push member.url
     before the active/audible suffixes — that was the pre-fix-round
     divergence. The post-fix-round form is `parts = [\`floating tab —
     ${titleText}\`]` followed only by active/audible pushes. */
  const newtabFnMatch = newtabJs.match(/function _buildFloatingTabRow\(member\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(newtabFnMatch, 'newtab _buildFloatingTabRow must exist');
  const newtabBody = newtabFnMatch[1];
  assert.doesNotMatch(
    newtabBody,
    /if\s*\(member\.url\)\s*parts\.push\(member\.url\)/,
    'newtab floating-row aria-label must NOT push member.url (cross-surface parity with sidepanel per R2 §61.8)',
  );

  /* Both surfaces must construct the title-only prefix. */
  assert.match(
    sidepanelHelperBody,
    /['"`]floating tab — \$\{title\}['"`]/,
    'sidepanel must construct `floating tab — ${title}` prefix',
  );
  assert.match(
    newtabBody,
    /['"`]floating tab — \$\{titleText\}['"`]/,
    'newtab must construct `floating tab — ${titleText}` prefix',
  );
});
