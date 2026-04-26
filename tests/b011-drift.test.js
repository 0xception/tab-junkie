/**
 * b011-drift.test.js — B-011 AC11: _ensureIndicators drift bar lifecycle
 *
 * UPDATED for Sprint 34 / B-101 (R4 HIGH fix): the original B-011 tests
 * targeted the pre-B-101 `_createDriftedIcon` / `.item-drifted-icon`
 * behavior. After B-101, drift is communicated via an always-present
 * `<span class="item-drift-bar" hidden>` that lives as the FIRST child of
 * every `.item-row`. `_ensureIndicators` now flips `bar.hidden` (and the
 * `title` tooltip) instead of creating/removing the icon DOM. The audible
 * branch is unchanged — these tests still cover the audible coexistence
 * paths to keep the original AC11 contract intact.
 *
 * `_ensureIndicators` is a module-scope function in sidepanel/sidepanel.js
 * and is NOT exported. Since the module also triggers DOM queries at load
 * time, it cannot be imported in Node.
 *
 * Strategy: reproduce the post-B-101 `_ensureIndicators` logic verbatim
 * (same approach as sidepanel-logic.test.js) and test the DOM behavior
 * using the same minimal in-test DOM shim that this file already used.
 *
 * NOTE: Node 18+ test runner does not include a DOM. We use a lightweight
 * in-test shim that covers the subset of DOM APIs `_ensureIndicators` uses:
 * createElement, querySelector, insertBefore, appendChild, remove,
 * isConnected, children, className, setAttribute, removeAttribute,
 * getAttribute, hidden, title.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

/* =========================================================================
   Minimal DOM shim — just enough for the post-B-101 `_ensureIndicators`
   ========================================================================= */

function createElement(tag) {
  const children = [];
  const attrs = {};
  const el = {
    tagName: tag.toUpperCase(),
    className: '',
    innerHTML: '',
    isConnected: true,
    parentNode: null,
    /* B-101: `hidden` and `title` are IDL properties on real Elements; the
       shim mirrors them as plain JS properties so production code that does
       `bar.hidden = true` / `bar.title = '...'` works unchanged. */
    hidden: false,
    title: '',
    get children() { return children; },
    setAttribute(k, v) { attrs[k] = v; },
    getAttribute(k) { return attrs[k] ?? null; },
    removeAttribute(k) { delete attrs[k]; },
    appendChild(child) {
      child.parentNode = el;
      children.push(child);
      return child;
    },
    insertBefore(child, ref) {
      child.parentNode = el;
      const idx = children.indexOf(ref);
      if (idx >= 0) children.splice(idx, 0, child);
      else children.push(child);
      return child;
    },
    remove() {
      if (el.parentNode) {
        const siblings = el.parentNode.children;
        const idx = siblings.indexOf(el);
        if (idx >= 0) siblings.splice(idx, 1);
        el.parentNode = null;
      }
    },
    querySelector(sel) {
      // Support simple class selectors only: .class-name
      const cls = sel.startsWith('.') ? sel.slice(1) : null;
      if (!cls) return null;
      function search(node) {
        for (const c of node.children) {
          if (c.className === cls) return c;
          const found = search(c);
          if (found) return found;
        }
        return null;
      }
      return search(el);
    },
  };
  return el;
}

/* =========================================================================
   Reproduced helpers — match sidepanel/sidepanel.js post-B-101.

   `_driftTooltipFor` mirrors sidepanel.js ~L2281 (B-101 §48.3 D-1).
   `_ensureIndicators` mirrors sidepanel.js ~L3164 (B-101 §48.3 D-1/D-5).

   The audible branch (lazy `.item-indicators` create + cleanup) is
   unchanged from B-099; only the drift branch was rewritten in B-101.
   ========================================================================= */

function _driftTooltipFor(driftedToUrl) {
  if (typeof driftedToUrl !== 'string' || driftedToUrl.length === 0) {
    return 'Drifted to a different URL';
  }
  let hostname = '';
  try {
    hostname = new URL(driftedToUrl).hostname;
  } catch {
    /* fall through */
  }
  return hostname ? `Drifted to: ${hostname}` : 'Drifted to a different URL';
}

function _ensureIndicators(row, live, isDrifted, driftedToUrl) {
  if (!row.isConnected) return;

  /* Audible branch — unchanged from B-011 (audible icon is still lazily
     created/removed inside `.item-indicators`; the strip is created on
     demand and torn down when empty). */
  const needsAudible = !!live?.audible;
  let audibleIcon = row.querySelector('.item-audible-icon');
  if (needsAudible && !audibleIcon) {
    let indicators = row.querySelector('.item-indicators');
    if (!indicators) {
      indicators = createElement('div');
      indicators.className = 'item-indicators';
      const actions = row.querySelector('.item-actions');
      if (actions) {
        row.insertBefore(indicators, actions);
      } else {
        row.appendChild(indicators);
      }
    }
    audibleIcon = createElement('span');
    audibleIcon.className = 'item-audible-icon';
    audibleIcon.setAttribute('aria-label', 'Playing audio');
    audibleIcon.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 5h2l3-3v10L4 9H2a1 1 0 01-1-1V6a1 1 0 011-1z" fill="currentColor"/><path d="M9.5 4.5a3.5 3.5 0 010 5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>';
    indicators.appendChild(audibleIcon);
  } else if (!needsAudible && audibleIcon) {
    audibleIcon.remove();
    const indicators = row.querySelector('.item-indicators');
    if (indicators && indicators.children.length === 0) indicators.remove();
  }

  /* B-101 §48.3 D-1 / D-5: drift bar is always present in the row DOM
     (added by `buildItemRow` / `buildRow` in tests). Transitions toggle
     the `hidden` attribute and the `title` tooltip — no DOM
     creation/removal, and the strip-cleanup contract no longer involves
     drift. */
  const bar = row.querySelector('.item-drift-bar');
  if (bar) {
    if (isDrifted) {
      bar.hidden = false;
      bar.title = _driftTooltipFor(driftedToUrl);
    } else {
      bar.hidden = true;
      bar.removeAttribute('title');
      /* The shim also exposes `title` as a JS property — clear both so
         querying either path yields the cleared state. */
      bar.title = '';
    }
  }
}

/* =========================================================================
   Helper: build a mock row element with the always-present drift-bar span
   (mirrors `buildItemRow` post-B-101 — bar is the FIRST child).
   ========================================================================= */

function buildRow({ hasActions = true } = {}) {
  const row = createElement('div');
  row.className = 'item-row';

  /* B-101 §48.3 D-1 — drift bar is always present, hidden by default. */
  const bar = createElement('span');
  bar.className = 'item-drift-bar';
  bar.setAttribute('aria-hidden', 'true');
  bar.hidden = true;
  row.appendChild(bar);

  if (hasActions) {
    const actions = createElement('div');
    actions.className = 'item-actions';
    row.appendChild(actions);
  }
  return row;
}

/* =========================================================================
   AC11 Tests — drift BAR lifecycle in `_ensureIndicators` (post-B-101)

   The original AC11 contract was "_ensureIndicators correctly toggles
   drift state on row indicator changes". After B-101, the mechanism
   changed (bar.hidden flip vs. icon DOM swap) but the underlying
   guarantee (drift true ↔ false transitions correctly visible/invisible
   without artifacts) is unchanged. These tests rewrite each AC11
   assertion to target `bar.hidden` instead of `.item-drifted-icon`
   presence.
   ========================================================================= */

test('AC11 (B-101): _ensureIndicators flips .item-drift-bar hidden=false when isDrifted true', () => {
  const row = buildRow();
  const bar = row.querySelector('.item-drift-bar');
  assert.equal(bar.hidden, true, 'bar starts hidden (buildRow default)');

  _ensureIndicators(row, null, true, 'https://example.com/foo');

  assert.equal(bar.hidden, false, 'bar revealed on isDrifted=true');
  assert.equal(bar.title, 'Drifted to: example.com', 'tooltip set to hostname');
});

test('AC11 (B-101): _ensureIndicators flips .item-drift-bar hidden=true when isDrifted false', () => {
  const row = buildRow();
  const bar = row.querySelector('.item-drift-bar');

  // First flip on
  _ensureIndicators(row, null, true, 'https://example.com/foo');
  assert.equal(bar.hidden, false);

  // Then flip off
  _ensureIndicators(row, null, false, undefined);
  assert.equal(bar.hidden, true, 'bar hidden on isDrifted=false');
  assert.equal(bar.getAttribute('title'), null, 'title attribute removed');
});

test('AC11 (B-101): _ensureIndicators does NOT create/remove .item-indicators on drift transitions', () => {
  const row = buildRow();
  // Inject drift only (no audible)
  _ensureIndicators(row, null, true, 'https://example.com/q');

  /* Per B-101 §48.3 D-1, drift transitions no longer touch the indicators
     strip — the bar is a sibling of the indicators container, not inside
     it. So the strip should remain absent on drift-only transitions. */
  assert.equal(
    row.querySelector('.item-indicators'),
    null,
    'Drift transitions must NOT create or remove .item-indicators',
  );

  _ensureIndicators(row, null, false, undefined);
  assert.equal(
    row.querySelector('.item-indicators'),
    null,
    'Strip still absent after drift removal — strip cleanup unrelated to drift now',
  );
});

test('AC11 (B-101): repeated isDrifted=true calls do not duplicate the drift bar', () => {
  const row = buildRow();
  _ensureIndicators(row, null, true, 'https://example.com/x');
  _ensureIndicators(row, null, true, 'https://example.com/x');
  _ensureIndicators(row, null, true, 'https://example.com/x');

  /* The bar is always-present; multiple calls only re-flip `hidden` and
     refresh the tooltip. There must still be exactly one `.item-drift-bar`
     in the row. */
  let barCount = 0;
  for (const child of row.children) {
    if (child.className === 'item-drift-bar') barCount++;
  }
  assert.equal(barCount, 1, 'exactly one .item-drift-bar even after multiple isDrifted=true calls');
});

test('AC11 (B-101): drift removal does NOT impact the audible icon when audible remains', () => {
  const row = buildRow();
  // Add both audible AND drift
  _ensureIndicators(row, { audible: true }, true, 'https://a.example/x');
  assert.ok(row.querySelector('.item-audible-icon'), 'audible icon present');
  const bar = row.querySelector('.item-drift-bar');
  assert.equal(bar.hidden, false, 'drift bar revealed');

  // Remove drift only — audible must still be there, bar must be hidden
  _ensureIndicators(row, { audible: true }, false, undefined);
  assert.equal(bar.hidden, true, 'drift bar hidden');
  assert.ok(row.querySelector('.item-audible-icon'), 'audible icon remains');
  assert.ok(row.querySelector('.item-indicators'), 'strip remains while audible occupies it');
});

test('AC11 (B-101): _ensureIndicators is a no-op when row is not connected', () => {
  const row = buildRow();
  row.isConnected = false;
  _ensureIndicators(row, null, true, 'https://example.com/x');
  const bar = row.querySelector('.item-drift-bar');
  /* Bar should still be hidden — _ensureIndicators bailed out before the
     drift toggle, so the buildRow default `hidden = true` is preserved. */
  assert.equal(bar.hidden, true, 'no toggle on disconnected row');
});

test('AC11 (B-101): drift bar false→true→false roundtrip leaves no artifacts', () => {
  const row = buildRow();
  const bar = row.querySelector('.item-drift-bar');
  // Initial state — hidden, no title
  assert.equal(bar.hidden, true);
  assert.equal(bar.getAttribute('title'), null);

  // false -> true
  _ensureIndicators(row, null, true, 'https://example.com/y');
  assert.equal(bar.hidden, false);

  // true -> false
  _ensureIndicators(row, null, false, undefined);
  assert.equal(bar.hidden, true);
  assert.equal(bar.getAttribute('title'), null);

  /* Crucial: the always-present `.item-drift-bar` `<span>` must still be
     in the DOM (just hidden). This is the fundamental B-101 behavioral
     change vs. B-099's icon create/remove model. */
  assert.ok(row.querySelector('.item-drift-bar'), 'bar element persists in DOM across the roundtrip');
});

test('AC11 (B-101): audible-only change leaves the drift bar untouched (regression guard)', () => {
  const row = buildRow();
  const bar = row.querySelector('.item-drift-bar');
  assert.equal(bar.hidden, true, 'drift bar starts hidden');

  // audible on, drift remains off — bar still hidden
  _ensureIndicators(row, { audible: true }, false, undefined);
  assert.equal(bar.hidden, true, 'audible-only change does not flip drift bar');

  // audible off, drift remains off — bar still hidden
  _ensureIndicators(row, null, false, undefined);
  assert.equal(bar.hidden, true);
});
