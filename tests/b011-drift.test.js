/**
 * b011-drift.test.js — B-011 AC11: _ensureIndicators drift icon lifecycle
 *
 * _ensureIndicators is a module-scope function in sidepanel/sidepanel.js and
 * is NOT exported. Since the module also triggers DOM queries at load time,
 * it cannot be imported in Node.
 *
 * Strategy: reproduce the _ensureIndicators logic verbatim (same approach as
 * sidepanel-logic.test.js) and test the DOM behavior using a minimal JSDOM-
 * like environment built from the chrome-mock's globalThis.document shim.
 *
 * NOTE: Node 18+ test runner does not include a DOM. We use a lightweight
 * in-test shim that covers the subset of DOM APIs _ensureIndicators uses:
 * createElement, querySelector, insertBefore, appendChild, remove, isConnected,
 * children, className, setAttribute, innerHTML.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

/* =========================================================================
   Minimal DOM shim — just enough for _ensureIndicators
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
    get children() { return children; },
    setAttribute(k, v) { attrs[k] = v; },
    getAttribute(k) { return attrs[k] ?? null; },
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
   Reproduced _ensureIndicators (verbatim from sidepanel/sidepanel.js ~L853)
   ========================================================================= */

function _ensureIndicators(row, live, isDrifted) {
  if (!row.isConnected) return;
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

  const needsDrifted = !!isDrifted;
  let driftedIcon = row.querySelector('.item-drifted-icon');
  if (needsDrifted && !driftedIcon) {
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
    driftedIcon = createElement('span');
    driftedIcon.className = 'item-drifted-icon';
    driftedIcon.setAttribute('aria-label', 'Tab has navigated away from its saved URL');
    driftedIcon.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1l6 11H1L7 1z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round"/><path d="M7 5v3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="7" cy="10" r="0.8" fill="currentColor"/></svg>';
    indicators.appendChild(driftedIcon);
  } else if (!needsDrifted && driftedIcon) {
    driftedIcon.remove();
    const indicators = row.querySelector('.item-indicators');
    if (indicators && indicators.children.length === 0) indicators.remove();
  }
}

/* =========================================================================
   Helper: build a mock row element
   ========================================================================= */

function buildRow({ hasActions = true } = {}) {
  const row = createElement('div');
  row.className = 'item-row';
  if (hasActions) {
    const actions = createElement('div');
    actions.className = 'item-actions';
    row.appendChild(actions);
  }
  return row;
}

/* =========================================================================
   AC11 Tests — drift icon lifecycle in _ensureIndicators
   ========================================================================= */

test('AC11: _ensureIndicators injects .item-drifted-icon when isDrifted is true and icon not present', () => {
  const row = buildRow();
  _ensureIndicators(row, null, true);

  const icon = row.querySelector('.item-drifted-icon');
  assert.ok(icon, 'Drift icon should be injected');
  assert.equal(icon.getAttribute('aria-label'), 'Tab has navigated away from its saved URL');

  const indicators = row.querySelector('.item-indicators');
  assert.ok(indicators, '.item-indicators container should be created');
});

test('AC11: _ensureIndicators removes .item-drifted-icon when isDrifted is false and icon was present', () => {
  const row = buildRow();
  // First inject
  _ensureIndicators(row, null, true);
  assert.ok(row.querySelector('.item-drifted-icon'), 'Drift icon should exist after true transition');

  // Then remove
  _ensureIndicators(row, null, false);
  assert.equal(row.querySelector('.item-drifted-icon'), null, 'Drift icon should be removed');
});

test('AC11: _ensureIndicators cleans up empty .item-indicators container on removal', () => {
  const row = buildRow();
  // Inject drift icon only (no audible)
  _ensureIndicators(row, null, true);
  assert.ok(row.querySelector('.item-indicators'), 'Indicators container should exist');

  // Remove drift icon — container should also be removed since it is now empty
  _ensureIndicators(row, null, false);
  assert.equal(row.querySelector('.item-indicators'), null, 'Empty indicators container should be removed');
});

test('AC11: _ensureIndicators does not duplicate drift icon on repeated true calls', () => {
  const row = buildRow();
  _ensureIndicators(row, null, true);
  _ensureIndicators(row, null, true);
  _ensureIndicators(row, null, true);

  const indicators = row.querySelector('.item-indicators');
  let driftCount = 0;
  for (const child of indicators.children) {
    if (child.className === 'item-drifted-icon') driftCount++;
  }
  assert.equal(driftCount, 1, 'Should have exactly one drift icon even after multiple calls');
});

test('AC11: _ensureIndicators keeps .item-indicators when audible icon remains after drift removal', () => {
  const row = buildRow();
  // Add both audible and drift
  _ensureIndicators(row, { audible: true }, true);
  assert.ok(row.querySelector('.item-audible-icon'), 'Audible icon should exist');
  assert.ok(row.querySelector('.item-drifted-icon'), 'Drift icon should exist');

  // Remove drift only — container should remain because audible icon is still there
  _ensureIndicators(row, { audible: true }, false);
  assert.equal(row.querySelector('.item-drifted-icon'), null, 'Drift icon should be removed');
  assert.ok(row.querySelector('.item-audible-icon'), 'Audible icon should remain');
  assert.ok(row.querySelector('.item-indicators'), 'Container should remain with audible icon inside');
});

test('AC11: _ensureIndicators is a no-op when row is not connected', () => {
  const row = buildRow();
  row.isConnected = false;
  _ensureIndicators(row, null, true);
  assert.equal(row.querySelector('.item-drifted-icon'), null, 'No icon should be injected on disconnected row');
});

test('AC11: _ensureIndicators inserts indicators before .item-actions', () => {
  const row = buildRow({ hasActions: true });
  _ensureIndicators(row, null, true);

  const actionIdx = row.children.findIndex(c => c.className === 'item-actions');
  const indicatorIdx = row.children.findIndex(c => c.className === 'item-indicators');
  assert.ok(indicatorIdx < actionIdx, 'Indicators should appear before actions in DOM order');
});

test('AC11: _ensureIndicators appends indicators when no .item-actions exists', () => {
  const row = buildRow({ hasActions: false });
  _ensureIndicators(row, null, true);

  const indicators = row.querySelector('.item-indicators');
  assert.ok(indicators, 'Indicators should be appended when no actions element exists');
  assert.equal(row.children[row.children.length - 1], indicators, 'Indicators should be last child');
});

test('AC11: drift icon false-to-true-to-false roundtrip leaves no artifacts', () => {
  const row = buildRow();
  // Initial state — no icons
  assert.equal(row.querySelector('.item-drifted-icon'), null);
  assert.equal(row.querySelector('.item-indicators'), null);

  // false -> true
  _ensureIndicators(row, null, true);
  assert.ok(row.querySelector('.item-drifted-icon'));

  // true -> false
  _ensureIndicators(row, null, false);
  assert.equal(row.querySelector('.item-drifted-icon'), null);
  assert.equal(row.querySelector('.item-indicators'), null, 'No artifacts should remain');
});
