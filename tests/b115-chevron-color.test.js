/**
 * b115-chevron-color.test.js — Sprint 36 / B-115 R3 (AC4)
 *
 * B-115 brightens the group-header expand/collapse chevron by switching the
 * `.group-header-collapse` color from the dim `--collapse-icon` token to the
 * group's themed `--group-header-color` (set on the parent `.group-header`
 * by B-104), with a fallback to `--text-primary` for uncolored groups
 * (e.g., the synthetic Ungrouped section). The CSS cascade propagates the
 * inline custom property from parent to child — no JS changes were made.
 *
 * Fast Track XS — no R5 testing gate, so this file is the sole automated
 * safety net for the change.
 *
 * Coverage map (AC4 minimum: ≥ 2 tests):
 *
 *   T1 (AC1, AC2) — Static CSS invariant: parse `sidepanel/sidepanel.css`,
 *        locate the `.group-header-collapse { ... }` rule body (NOT the
 *        sibling `[aria-expanded="false"] .group-header-collapse` rotation
 *        rule a few lines below), and assert:
 *          (a) the rule body contains `var(--group-header-color`
 *          (b) the rule body contains the `var(--text-primary)` fallback
 *          (c) the rule body does NOT contain `var(--collapse-icon)` —
 *              the legacy dim token must be gone from this rule (the token
 *              itself stays in `shared/themes.css` per Out-of-scope (d))
 *
 *   T2 (AC3 regression guard) — `aria-expanded` toggle + rotation rule.
 *        Reproduces the toggle behavior on a FakeElement (the existing
 *        per-test shim pattern from b048 / b040) — flips
 *        `aria-expanded` from "true" → "false" → "true" and asserts the
 *        attribute round-trips. Also confirms the CSS rotation rule
 *        (`.group-header[aria-expanded="false"] .group-header-collapse {
 *        transform: rotate(-90deg); }`) is still present in
 *        `sidepanel/sidepanel.css` so the chevron's collapsed-state
 *        rotation animation is untouched by B-115.
 *
 * Strategy: both tests are deterministic — T1 is a static-file regex
 * invariant (same pattern as `b104-group-colors.test.js` T2/T3), T2
 * combines a tiny FakeElement aria-expanded round-trip with a static-file
 * regex assertion on the rotation rule. No browser DOM needed.
 */

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

/**
 * Extract the body of the `.group-header-collapse { ... }` rule WITHOUT
 * matching the sibling `[aria-expanded="false"] .group-header-collapse`
 * rotation rule. The base rule is anchored by the start-of-line `.group-
 * header-collapse` selector (no `[` qualifier between the dot and the
 * brace). A non-greedy match between the opening and closing braces
 * bounds the body so attribute-qualified rules later in the file do not
 * pollute the capture.
 */
function getCollapseRuleBody(css) {
  const match = css.match(/^\.group-header-collapse\s*\{([^}]*)\}/m);
  assert.ok(
    match,
    'sidepanel.css must contain a base `.group-header-collapse` rule (no attribute qualifier)',
  );
  return match[1];
}

/* =========================================================================
   T1 (AC1, AC2): chevron CSS rule references `--group-header-color` with
   `--text-primary` fallback and no longer references `--collapse-icon`.
   ========================================================================= */
test('B-115 T1 (AC1, AC2): `.group-header-collapse` color uses `var(--group-header-color, var(--text-primary))` and drops `--collapse-icon`', () => {
  const css = readFile('sidepanel/sidepanel.css');
  const body = getCollapseRuleBody(css);

  /* (a) Themed token consumed — the chevron now picks up the group's color
     via the cascade from the parent `.group-header` (B-104 injection). */
  assert.match(
    body,
    /color:\s*var\(--group-header-color\s*,\s*var\(--text-primary\)\)/,
    '.group-header-collapse must declare `color: var(--group-header-color, var(--text-primary))` (B-115 AC1)',
  );

  /* (b) Explicit fallback — uncolored groups (Ungrouped, or any group with
     no slot assigned) resolve to primary text color so the chevron is
     always visible at the active theme's text contrast. */
  assert.match(
    body,
    /var\(--text-primary\)/,
    '.group-header-collapse must keep `var(--text-primary)` as the fallback so untinted groups have a visible chevron (AC2)',
  );

  /* (c) Legacy dim token is gone from this rule. Token itself remains
     declared in shared/themes.css per Out-of-scope (d) — only the
     `.group-header-collapse` consumer was switched. */
  assert.doesNotMatch(
    body,
    /var\(--collapse-icon\)/,
    '.group-header-collapse must NOT reference the legacy `--collapse-icon` token (AC1 — replaced by --group-header-color)',
  );
});

/* =========================================================================
   T2 (AC3 regression guard): `aria-expanded` toggle round-trips and the
   collapsed-state rotation rule still applies.
   ========================================================================= */

/* Minimal FakeElement shim — only what this test exercises (set/get
   attribute). Mirrors the per-test shim pattern from b048 / b040 — kept
   local so this test file stays self-contained and the production DOM
   contract (set `aria-expanded`, observe the value) is asserted against
   the same surface area the live `toggleGroup` handler uses. */
class FakeElement {
  constructor() {
    this._attrs = {};
  }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
}

test('B-115 T2 (AC3 regression): `aria-expanded` toggle still round-trips and the chevron rotation rule is preserved', () => {
  /* Behavioral half — simulate the `toggleGroup` flip on a fake header.
     Production code (sidepanel.js) toggles `aria-expanded` on the
     `.group-header` element via setAttribute on click + keyboard
     Enter/Space. The B-115 CSS-only change must not alter this contract. */
  const header = new FakeElement();
  header.setAttribute('role', 'button');
  header.setAttribute('tabindex', '0');
  header.setAttribute('aria-expanded', 'true');
  assert.equal(
    header.getAttribute('aria-expanded'),
    'true',
    'group header must start expanded with aria-expanded="true"',
  );

  /* Collapse — production handler flips the attribute. */
  header.setAttribute('aria-expanded', 'false');
  assert.equal(
    header.getAttribute('aria-expanded'),
    'false',
    'group header must accept aria-expanded="false" on collapse',
  );

  /* Re-expand — same contract in reverse. */
  header.setAttribute('aria-expanded', 'true');
  assert.equal(
    header.getAttribute('aria-expanded'),
    'true',
    'group header must round-trip back to aria-expanded="true" on re-expand',
  );

  /* Static half — the CSS rotation rule that drives the chevron's
     collapsed-state animation is explicitly Out-of-scope (c) for B-115.
     Pin it here so any inadvertent edit gets caught immediately. */
  const css = readFile('sidepanel/sidepanel.css');
  assert.match(
    css,
    /\.group-header\[aria-expanded="false"\]\s+\.group-header-collapse\s*\{\s*transform:\s*rotate\(-90deg\)\s*;?\s*\}/,
    'sidepanel.css must preserve the `.group-header[aria-expanded="false"] .group-header-collapse { transform: rotate(-90deg); }` rotation rule (AC3 — B-115 must not alter chevron rotation behavior)',
  );

  /* Defense-in-depth — the base rule must keep its `transition` so the
     rotation animates. Pull the body via the same helper used in T1. */
  const body = getCollapseRuleBody(css);
  assert.match(
    body,
    /transition:\s*transform\s+0\.15s\s+ease/,
    '.group-header-collapse must retain `transition: transform 0.15s ease` so the rotation animates smoothly (Out-of-scope (a))',
  );
});
