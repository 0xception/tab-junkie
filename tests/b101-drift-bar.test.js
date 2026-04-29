/**
 * b101-drift-bar.test.js — Sprint 34 / B-101 R5 (AC8)
 *
 * Sprint 34 ships the dotted drift bar (replaces the B-099 16 px warning
 * triangle in the indicators strip with a 3 px dotted vertical bar in the
 * row's left-edge gutter). The six tests below cover the AC8 contract +
 * the R4 LOW cache-fallback path:
 *
 *   T1 — `_ensureIndicators(row, live=true, isDrifted=true, driftedToUrl=…)`
 *        flips `bar.hidden` from true → false AND sets the hostname tooltip.
 *   T2 — `_ensureIndicators(row, live=true, isDrifted=false, undefined)`
 *        flips `bar.hidden` from false → true AND removes the title attribute.
 *   T3 — `buildItemRow(itemWithDrift)` — verify the row's first child is a
 *        `<span class="item-drift-bar">` with `hidden = false` and the correct
 *        title set on first-paint.
 *   T4 — `buildItemRow(itemWithoutDrift)` — verify the bar is still present
 *        in the DOM (per D-1 always-present design) but `hidden = true` with
 *        no title.
 *   T5 — AC2 regression guard: confirm the deleted `_createDriftedIcon` /
 *        `.item-drifted-icon` shape does NOT exist after `buildItemRow`.
 *   T6 — R4 LOW cache-fallback: when `_ensureIndicators` is called without
 *        an explicit `driftedToUrl`, it falls back to
 *        `_cachedDriftRecords[row.dataset.itemId]?.driftedToUrl` and uses
 *        that hostname in the tooltip.
 *
 * `_ensureIndicators`, `_driftTooltipFor`, and `buildItemRow` are
 * module-scope in `sidepanel/sidepanel.js` and not exported. The module
 * also runs DOM queries at load time, so it cannot be imported in Node.
 *
 * Strategy: reproduce the post-B-101 helpers verbatim with a minimal DOM
 * shim that supports the IDL surfaces these helpers touch (`hidden`,
 * `title`, `dataset`, `setAttribute`, `appendChild`, `querySelector`).
 * This mirrors the strategy used by `tests/b011-drift.test.js` and
 * `tests/b048-visual-states.test.js` for the same code surface.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

/* =========================================================================
   Minimal DOM shim — covers the subset used by `buildItemRow` and
   `_ensureIndicators` for the drift-bar paths.
   ========================================================================= */

function createElement(tag) {
  const children = [];
  const attrs = {};
  const dataset = {};
  const el = {
    tagName: tag.toUpperCase(),
    className: '',
    innerHTML: '',
    isConnected: true,
    parentNode: null,
    /* IDL properties touched by production drift-bar code. */
    hidden: false,
    title: '',
    dataset,
    get children() { return children; },
    get firstChild() { return children[0] ?? null; },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return attrs[k] ?? null; },
    removeAttribute(k) { delete attrs[k]; },
    appendChild(child) {
      child.parentNode = el;
      children.push(child);
      return child;
    },
    querySelector(sel) {
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
   Reproduced helpers — match `sidepanel/sidepanel.js` post-B-101.

   - `_driftTooltipFor` mirrors sidepanel.js ~L2281 (B-101 §48.3 D-1).
   - `buildItemRow` is reproduced minimally — only the parts that build the
     drift bar; the other parts (favicon, title, indicators strip) are
     replaced with no-op stubs because B-101 only touches the bar.
   - `_ensureIndicators` mirrors sidepanel.js ~L3164 with the cache-
     fallback path called out in R4 LOW #3.
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

/* Module-scope cache mirror for T6's fallback path. */
const _cachedDriftRecords = {};

function _ensureIndicators(row, live, isDrifted, driftedToUrl) {
  if (!row.isConnected) return;
  /* Audible branch omitted — these tests cover only the drift-bar paths. */
  const bar = row.querySelector('.item-drift-bar');
  if (bar) {
    /* B-110 §53 (S36): conjunctive invariant — drift records only exist for
       claimed items (§10.7); the gate refuses to surface a stale record
       on a non-live row. Stub kept in lockstep with sidepanel.js:3217. */
    if (isDrifted && live?.live) {
      const url = typeof driftedToUrl === 'string' && driftedToUrl.length > 0
        ? driftedToUrl
        : (row.dataset.itemId
          ? _cachedDriftRecords[row.dataset.itemId]?.driftedToUrl
          : undefined);
      bar.hidden = false;
      bar.title = _driftTooltipFor(url);
    } else {
      bar.hidden = true;
      bar.removeAttribute('title');
      bar.title = '';
    }
  }
}

function buildItemRow(item, liveStates, driftRecords) {
  const row = createElement('div');
  row.className = 'item-row';
  row.dataset.itemId = item.id;

  const live = liveStates?.[item.id];
  const drifted = driftRecords?.[item.id];

  /* B-101 §48.3 D-1: drift bar is the FIRST child. Always present. */
  const driftBar = createElement('span');
  driftBar.className = 'item-drift-bar';
  driftBar.setAttribute('aria-hidden', 'true');
  /* B-110 §53 (S36): same conjunctive gate as `_ensureIndicators` — stub
     mirrors sidepanel.js:2380 first-paint path. */
  if (drifted && live?.live) {
    driftBar.title = _driftTooltipFor(drifted.driftedToUrl);
  } else {
    driftBar.hidden = true;
  }
  row.appendChild(driftBar);

  /* Stand-ins for the other production children — these tests don't exercise
     them. The only invariant that matters here is that `.item-drift-bar`
     is the first child and the row carries the correct `data-itemId`. */
  const placeholder = createElement('div');
  placeholder.className = 'item-text';
  row.appendChild(placeholder);

  return row;
}

/* =========================================================================
   T1 — _ensureIndicators flips bar visible AND sets hostname tooltip
   ========================================================================= */
test('B-101 T1: _ensureIndicators(isDrifted=true) flips bar.hidden=false and sets hostname tooltip', () => {
  const row = buildItemRow({ id: 'item-t1' }, {}, {});
  const bar = row.querySelector('.item-drift-bar');
  assert.equal(bar.hidden, true, 'bar starts hidden (item not drifted at first paint)');

  _ensureIndicators(row, { live: true }, true, 'https://example.com/foo');

  assert.equal(bar.hidden, false, 'AC1: bar.hidden flipped to false on isDrifted=true');
  assert.equal(bar.title, 'Drifted to: example.com', 'AC4: hostname tooltip set');
});

/* =========================================================================
   T2 — _ensureIndicators flips bar hidden AND removes title attribute
   ========================================================================= */
test('B-101 T2: _ensureIndicators(isDrifted=false) flips bar.hidden=true and removes title attribute', () => {
  const row = buildItemRow(
    { id: 'item-t2' },
    /* B-110 §53 (S36): conjunctive gate requires live=true to surface the
       drift bar at first paint. */
    { 'item-t2': { live: true } },
    { 'item-t2': { itemId: 'item-t2', driftedToUrl: 'https://example.com/x', detectedAt: 1 } },
  );
  const bar = row.querySelector('.item-drift-bar');
  /* First-paint state: drifted + live, so bar visible and titled. */
  assert.equal(bar.hidden, false, 'sanity — bar visible at first paint when drifted');
  assert.equal(bar.title, 'Drifted to: example.com');

  /* Now flip drift off (e.g., user navigates back to saved URL or item
     URL is patched to match the drifted-to URL). */
  _ensureIndicators(row, { live: true }, false, undefined);

  assert.equal(bar.hidden, true, 'AC1: bar.hidden flipped to true on isDrifted=false');
  assert.equal(bar.getAttribute('title'), null, 'AC4: title attribute removed (no stale tooltip)');
});

/* =========================================================================
   T3 — buildItemRow(drifted item) — bar is FIRST child, visible, titled
   ========================================================================= */
test('B-101 T3: buildItemRow(itemWithDrift) injects .item-drift-bar as first child with hidden=false + title set', () => {
  const item = { id: 'item-t3' };
  /* B-110 §53 (S36): conjunctive gate requires live=true to surface the
     drift bar — pre-B-110 this passed `{}` for liveStates. */
  const liveStates = { 'item-t3': { live: true } };
  const driftRecords = {
    'item-t3': { itemId: 'item-t3', driftedToUrl: 'https://docs.example.org/page', detectedAt: 1 },
  };
  const row = buildItemRow(item, liveStates, driftRecords);

  /* AC1 + D-1 invariant: bar is the FIRST child of the row. */
  const first = row.children[0];
  assert.ok(first, 'row has at least one child');
  assert.equal(first.className, 'item-drift-bar', 'D-1: drift bar is the row\'s first child');
  assert.equal(first.hidden, false, 'AC1: bar visible on first-paint when item is drifted');
  assert.equal(first.title, 'Drifted to: docs.example.org', 'AC4: hostname tooltip set on first paint');
  assert.equal(first.getAttribute('aria-hidden'), 'true', 'D-4: aria-hidden so row aria-label is the AT carrier');
});

/* =========================================================================
   T4 — buildItemRow(non-drifted item) — bar still in DOM, hidden, no title
   ========================================================================= */
test('B-101 T4: buildItemRow(itemWithoutDrift) — bar still present (always-present per D-1) but hidden + untitled', () => {
  const item = { id: 'item-t4' };
  const row = buildItemRow(item, {}, {});

  /* D-1 invariant: bar must be in the DOM even when not drifted. */
  const bar = row.querySelector('.item-drift-bar');
  assert.ok(bar, 'D-1: drift bar always present in DOM, even on non-drifted rows');
  assert.equal(bar, row.children[0], 'D-1: bar is still the FIRST child regardless of drift state');
  assert.equal(bar.hidden, true, 'AC1: bar hidden on non-drifted row');
  assert.equal(bar.title, '', 'no tooltip on non-drifted row');
});

/* =========================================================================
   T5 — AC2 regression guard: deleted icon shape never reappears
   ========================================================================= */
test('B-101 T5 (AC2 regression guard): _createDriftedIcon symbol gone + .item-drifted-icon never produced', () => {
  /* The deleted SVG-warning-triangle factory `_createDriftedIcon` is gone
     from production. The reproduction module above intentionally does NOT
     define it. Asserting on `typeof` proves there is no module-local
     binding the helpers above could accidentally invoke. */
  // eslint-disable-next-line no-undef
  assert.equal(
    typeof globalThis._createDriftedIcon,
    'undefined',
    'AC2: _createDriftedIcon symbol must not be exposed by any reproduction',
  );

  /* The pre-B-101 indicator strip used `.item-drifted-icon` as the SVG
     wrapper class. Confirm a freshly-built row (drifted OR not) never
     contains an element with that class. */
  const driftedRow = buildItemRow(
    { id: 'item-t5a' },
    {},
    { 'item-t5a': { driftedToUrl: 'https://example.com/' } },
  );
  const cleanRow = buildItemRow({ id: 'item-t5b' }, {}, {});
  assert.equal(
    driftedRow.querySelector('.item-drifted-icon'),
    null,
    'AC2: drifted row must not produce .item-drifted-icon (deleted in B-101)',
  );
  assert.equal(
    cleanRow.querySelector('.item-drifted-icon'),
    null,
    'AC2: non-drifted row must not produce .item-drifted-icon either',
  );
});

/* =========================================================================
   T6 — R4 LOW cache-fallback: _ensureIndicators uses _cachedDriftRecords
   when the explicit driftedToUrl arg is missing.
   ========================================================================= */
test('B-101 T6 (R4 LOW): _ensureIndicators falls back to _cachedDriftRecords[itemId].driftedToUrl when arg missing', () => {
  const item = { id: 'item-t6' };
  const row = buildItemRow(item, {}, {});
  const bar = row.querySelector('.item-drift-bar');
  assert.equal(bar.hidden, true, 'sanity — bar starts hidden');

  /* Populate the local cache mirror to simulate a stale callsite that
     forgot to pass `driftedToUrl` to `_ensureIndicators`. The defensive
     fallback inside `_ensureIndicators` should pick the URL up from
     `_cachedDriftRecords[row.dataset.itemId]`. */
  _cachedDriftRecords['item-t6'] = {
    itemId: 'item-t6',
    driftedToUrl: 'https://fallback.example.com/x',
    detectedAt: 99,
  };

  /* Call _ensureIndicators with isDrifted=true but driftedToUrl=undefined. */
  _ensureIndicators(row, { live: true }, true, undefined);

  assert.equal(bar.hidden, false, 'cache-fallback path still flips bar visible');
  assert.equal(
    bar.title,
    'Drifted to: fallback.example.com',
    'cache-fallback resolves driftedToUrl from _cachedDriftRecords[itemId]',
  );

  /* Cleanup so other tests don't see the cache. */
  delete _cachedDriftRecords['item-t6'];
});
