/**
 * b032-auto-scroll.test.js — B-032 R5 tests for auto-scroll during drag.
 *
 * sidepanel.js is a browser-only module with no exports and immediate DOM
 * side-effects on load. Per the established pattern (see sidepanel-logic.test.js
 * and b054-sidepanel.test.js), the pure helper `_maybeAutoScroll` is reproduced
 * verbatim here with module state lifted to explicit parameters so the math +
 * boundary clamp + gating can be exercised deterministically.
 *
 * Source: sidepanel/sidepanel.js — `_maybeAutoScroll` (~line 4842),
 *         `AUTO_SCROLL_EDGE_ZONE_PX` (line 306), `AUTO_SCROLL_MAX_SPEED` (line 307).
 *
 * AC12 cases covered:
 *   (a) pointer at top-edge zone → scrollTop decreases
 *   (b) pointer at bottom-edge zone → scrollTop increases
 *   (c) pointer exits zone → scroll stops (no delta)
 *   (d) dragend / state cleared → scroll stops (gate on _itemDragState)
 *   (e) speed ramp: 5 px from edge > 55 px from edge
 *
 * Additional robustness:
 *   (f) scrollTop = 0 + top-edge drag → clamped to 0; returns false
 *   (g) scrollTop = maxScroll + bottom-edge drag → clamped to max; returns false
 *   (h) no activation outside drag (state = null) → no-op
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

/* =========================================================================
   Reproduced constants — sidepanel.js lines 306-307
   ========================================================================= */

const AUTO_SCROLL_EDGE_ZONE_PX = 60;
const AUTO_SCROLL_MAX_SPEED = 20;

/* =========================================================================
   Reproduced helper — sidepanel.js `_maybeAutoScroll` (~line 4842)

   Module state lifted to explicit parameters:
     - itemDragState    → sidepanel `_itemDragState`
     - dragRectCache    → sidepanel `_dragRectCache` (must have .containerRect)
     - pendingPointerY  → sidepanel `_pendingPointerY`
     - itemListEl       → sidepanel `itemListEl` (must expose scrollTop/scrollHeight/clientHeight)

   Logic is byte-for-byte identical to the production helper — the only
   change is parameterisation. Keep in sync if sidepanel.js is refactored.
   ========================================================================= */

function maybeAutoScroll(itemDragState, dragRectCache, pendingPointerY, itemListEl) {
  if (!itemDragState || !dragRectCache) return false;
  const containerRect = dragRectCache.containerRect;
  const distanceFromTop = pendingPointerY - containerRect.top;
  const distanceFromBottom = containerRect.bottom - pendingPointerY;

  let delta = 0;
  if (distanceFromTop >= 0 && distanceFromTop < AUTO_SCROLL_EDGE_ZONE_PX) {
    const speed = Math.round(
      AUTO_SCROLL_MAX_SPEED * (1 - distanceFromTop / AUTO_SCROLL_EDGE_ZONE_PX),
    );
    delta = -speed;
  } else if (distanceFromBottom >= 0 && distanceFromBottom < AUTO_SCROLL_EDGE_ZONE_PX) {
    const speed = Math.round(
      AUTO_SCROLL_MAX_SPEED * (1 - distanceFromBottom / AUTO_SCROLL_EDGE_ZONE_PX),
    );
    delta = speed;
  }

  if (delta === 0) return false;

  const maxScroll = itemListEl.scrollHeight - itemListEl.clientHeight;
  const prev = itemListEl.scrollTop;
  const next = Math.max(0, Math.min(maxScroll, prev + delta));
  if (next === prev) return false;
  itemListEl.scrollTop = next;
  return true;
}

/* =========================================================================
   Test helpers — build a fake itemListEl + dragRectCache.

   Container geometry: top=0, bottom=400, clientHeight=400, scrollHeight=2000,
   starting scrollTop=500 (room to scroll in either direction).
   ========================================================================= */

function makeItemList(overrides = {}) {
  return {
    scrollTop: 500,
    scrollHeight: 2000,
    clientHeight: 400,
    ...overrides,
  };
}

function makeDragRectCache(overrides = {}) {
  return {
    containerRect: {
      top: 0,
      bottom: 400,
      ...overrides.containerRect,
    },
    ...overrides,
  };
}

const DRAG_STATE_ACTIVE = { rafHandle: null };

/* =========================================================================
   AC12(a) — pointer at top-edge zone → scrollTop decreases (upward scroll)
   ========================================================================= */

test('B-032 AC12(a): pointer at top-edge zone decreases scrollTop', () => {
  const list = makeItemList();           /* scrollTop: 500 */
  const cache = makeDragRectCache();     /* top: 0, bottom: 400 */
  const pointerY = 30;                   /* 30 px from top → inside 60 px zone */

  const prev = list.scrollTop;
  const applied = maybeAutoScroll(DRAG_STATE_ACTIVE, cache, pointerY, list);

  assert.equal(applied, true, 'helper reports auto-scroll applied');
  assert.ok(list.scrollTop < prev, `scrollTop must decrease (was ${prev}, now ${list.scrollTop})`);
});

/* =========================================================================
   AC12(b) — pointer at bottom-edge zone → scrollTop increases (downward scroll)
   ========================================================================= */

test('B-032 AC12(b): pointer at bottom-edge zone increases scrollTop', () => {
  const list = makeItemList();           /* scrollTop: 500 */
  const cache = makeDragRectCache();     /* top: 0, bottom: 400 */
  const pointerY = 370;                  /* 30 px from bottom → inside 60 px zone */

  const prev = list.scrollTop;
  const applied = maybeAutoScroll(DRAG_STATE_ACTIVE, cache, pointerY, list);

  assert.equal(applied, true, 'helper reports auto-scroll applied');
  assert.ok(list.scrollTop > prev, `scrollTop must increase (was ${prev}, now ${list.scrollTop})`);
});

/* =========================================================================
   AC12(c) — pointer exits zone → scroll stops
   ========================================================================= */

test('B-032 AC12(c): pointer outside both edge zones — no scroll, returns false', () => {
  const list = makeItemList();           /* scrollTop: 500 */
  const cache = makeDragRectCache();     /* top: 0, bottom: 400 */
  const pointerY = 200;                  /* centre — 200 px from either edge */

  const prev = list.scrollTop;
  const applied = maybeAutoScroll(DRAG_STATE_ACTIVE, cache, pointerY, list);

  assert.equal(applied, false, 'helper reports no auto-scroll');
  assert.equal(list.scrollTop, prev, 'scrollTop unchanged');
});

/* =========================================================================
   AC12(d) — dragend fires → state nulled → scroll stops
   ========================================================================= */

test('B-032 AC12(d): _itemDragState === null — helper is a no-op even in edge zone', () => {
  const list = makeItemList();
  const cache = makeDragRectCache();
  const pointerY = 5;                    /* extreme top-edge — would scroll if active */

  const prev = list.scrollTop;
  const applied = maybeAutoScroll(null, cache, pointerY, list);

  assert.equal(applied, false, 'no auto-scroll when drag state is null (dragend path)');
  assert.equal(list.scrollTop, prev, 'scrollTop unchanged after dragend');
});

/* =========================================================================
   AC12(e) — speed ramp: 5 px from edge > 55 px from edge
   ========================================================================= */

test('B-032 AC12(e): speed ramp — 5 px from top edge produces larger delta than 55 px from top edge', () => {
  /* Top-edge ramp */
  const listNear = makeItemList();
  const listFar = makeItemList();
  const cache = makeDragRectCache();

  maybeAutoScroll(DRAG_STATE_ACTIVE, cache, 5, listNear);    /* 5 px from top */
  maybeAutoScroll(DRAG_STATE_ACTIVE, cache, 55, listFar);    /* 55 px from top */

  const deltaNear = Math.abs(listNear.scrollTop - 500);
  const deltaFar = Math.abs(listFar.scrollTop - 500);

  assert.ok(deltaNear > deltaFar,
    `5 px delta (${deltaNear}) must exceed 55 px delta (${deltaFar})`);

  /* Also assert the exact formula per AC3:
       speed = round(20 * (1 - distance/60))
       distance=5  → round(20 * 55/60) = round(18.333) = 18
       distance=55 → round(20 *  5/60) = round(1.6667) = 2  */
  assert.equal(deltaNear, 18, 'exact formula @ 5px from top edge');
  assert.equal(deltaFar, 2, 'exact formula @ 55px from top edge');
});

test('B-032 AC12(e): speed ramp — same symmetry on bottom edge (5 px > 55 px)', () => {
  const listNear = makeItemList();
  const listFar = makeItemList();
  const cache = makeDragRectCache();

  maybeAutoScroll(DRAG_STATE_ACTIVE, cache, 395, listNear);  /* 5 px from bottom (400-395) */
  maybeAutoScroll(DRAG_STATE_ACTIVE, cache, 345, listFar);   /* 55 px from bottom (400-345) */

  const deltaNear = listNear.scrollTop - 500;
  const deltaFar = listFar.scrollTop - 500;

  assert.ok(deltaNear > deltaFar,
    `5 px bottom-delta (${deltaNear}) must exceed 55 px bottom-delta (${deltaFar})`);
  assert.equal(deltaNear, 18);
  assert.equal(deltaFar, 2);
});

/* =========================================================================
   AC6 boundary clamp robustness — top
   ========================================================================= */

test('B-032 AC6: scrollTop = 0 + top-edge drag — clamped to 0, returns false (no negative scroll)', () => {
  const list = makeItemList({ scrollTop: 0 });
  const cache = makeDragRectCache();
  const pointerY = 5;                    /* 5 px from top — would produce delta -18 */

  const applied = maybeAutoScroll(DRAG_STATE_ACTIVE, cache, pointerY, list);

  assert.equal(applied, false, 'clamp at top extreme must return false');
  assert.equal(list.scrollTop, 0, 'no negative scrollTop');
});

/* =========================================================================
   AC6 boundary clamp robustness — bottom
   ========================================================================= */

test('B-032 AC6: scrollTop = maxScroll + bottom-edge drag — clamped, returns false (no over-scroll)', () => {
  /* maxScroll = scrollHeight(2000) - clientHeight(400) = 1600 */
  const list = makeItemList({ scrollTop: 1600 });
  const cache = makeDragRectCache();
  const pointerY = 395;                  /* 5 px from bottom — would produce delta +18 */

  const applied = maybeAutoScroll(DRAG_STATE_ACTIVE, cache, pointerY, list);

  assert.equal(applied, false, 'clamp at bottom extreme must return false');
  assert.equal(list.scrollTop, 1600, 'no over-scroll past maxScroll');
});

test('B-032 AC6: partial clamp — scrollTop near 0 with top-edge drag clamps delta without overshooting', () => {
  /* scrollTop = 5, pointerY = 5 → raw delta = -18 → would go to -13; clamp to 0. */
  const list = makeItemList({ scrollTop: 5 });
  const cache = makeDragRectCache();
  const pointerY = 5;

  const applied = maybeAutoScroll(DRAG_STATE_ACTIVE, cache, pointerY, list);

  assert.equal(applied, true, 'partial clamp still applies the clamped delta');
  assert.equal(list.scrollTop, 0, 'scrollTop lands exactly at floor');
});

/* =========================================================================
   AC11 — no activation outside drag (state null + pointer in zone)
   ========================================================================= */

test('B-032 AC11: no drag state + pointer in top-edge zone — no-op (hover without drag)', () => {
  const list = makeItemList();
  const cache = makeDragRectCache();

  const prev = list.scrollTop;
  const applied = maybeAutoScroll(null, cache, 5, list);

  assert.equal(applied, false);
  assert.equal(list.scrollTop, prev, 'plain hover must not move scrollTop');
});

test('B-032 AC11: no drag state + pointer in bottom-edge zone — no-op', () => {
  const list = makeItemList();
  const cache = makeDragRectCache();

  const prev = list.scrollTop;
  const applied = maybeAutoScroll(null, cache, 395, list);

  assert.equal(applied, false);
  assert.equal(list.scrollTop, prev);
});

/* =========================================================================
   Guard: missing dragRectCache — helper short-circuits
   ========================================================================= */

test('B-032 guard: dragRectCache null — helper returns false (cache not yet built)', () => {
  const list = makeItemList();
  const applied = maybeAutoScroll(DRAG_STATE_ACTIVE, null, 5, list);

  assert.equal(applied, false, 'missing cache must not throw and must not scroll');
  assert.equal(list.scrollTop, 500, 'scrollTop unchanged when cache is null');
});

/* =========================================================================
   Zone boundary — at exactly EDGE_ZONE_PX, helper is OUT of the zone.
   ========================================================================= */

test('B-032 zone boundary: distanceFromTop === 60 (EDGE_ZONE_PX) is outside the zone', () => {
  const list = makeItemList();
  const cache = makeDragRectCache();
  const pointerY = AUTO_SCROLL_EDGE_ZONE_PX;  /* 60 — strict `<` means NOT in zone */

  const prev = list.scrollTop;
  const applied = maybeAutoScroll(DRAG_STATE_ACTIVE, cache, pointerY, list);

  assert.equal(applied, false, 'boundary at EDGE_ZONE_PX is exclusive');
  assert.equal(list.scrollTop, prev);
});

test('B-032 zone boundary: distanceFromTop === 59 is inside the zone but rounds to speed 0', () => {
  /* At 59 px from edge: speed = round(20 * 1/60) = round(0.333) = 0. Delta = 0
     → helper returns false (no-op). This documents that the rounded ramp can
     produce a zero-speed frame near the zone exit — expected behaviour, no
     spurious scroll events. */
  const list = makeItemList();
  const cache = makeDragRectCache();
  const pointerY = AUTO_SCROLL_EDGE_ZONE_PX - 1;  /* 59 */

  const prev = list.scrollTop;
  const applied = maybeAutoScroll(DRAG_STATE_ACTIVE, cache, pointerY, list);

  assert.equal(applied, false, 'rounded speed 0 at 59 px from edge → returns false');
  assert.equal(list.scrollTop, prev, 'no scroll when rounded speed is 0');
});

test('B-032 zone boundary: distanceFromTop === 50 produces positive upward scroll', () => {
  const list = makeItemList();
  const cache = makeDragRectCache();
  const pointerY = 50;

  const prev = list.scrollTop;
  const applied = maybeAutoScroll(DRAG_STATE_ACTIVE, cache, pointerY, list);

  /* speed = round(20 * 10/60) = round(3.333) = 3  →  delta = -3 */
  assert.equal(applied, true);
  assert.equal(prev - list.scrollTop, 3, 'exact ramp value at 50 px from edge');
});

/* =========================================================================
   Max-speed cap (AC4) — at edge (distance = 0), speed = MAX.
   ========================================================================= */

test('B-032 AC4: distanceFromTop === 0 produces max speed (20 px/frame)', () => {
  const list = makeItemList();
  const cache = makeDragRectCache();
  const pointerY = 0;  /* exactly at top edge */

  const prev = list.scrollTop;
  const applied = maybeAutoScroll(DRAG_STATE_ACTIVE, cache, pointerY, list);

  assert.equal(applied, true);
  assert.equal(prev - list.scrollTop, AUTO_SCROLL_MAX_SPEED, 'max speed at distance=0');
});

test('B-032 AC4: distanceFromBottom === 0 produces max downward speed', () => {
  const list = makeItemList();
  const cache = makeDragRectCache();
  const pointerY = 400;  /* exactly at bottom edge */

  const prev = list.scrollTop;
  const applied = maybeAutoScroll(DRAG_STATE_ACTIVE, cache, pointerY, list);

  assert.equal(applied, true);
  assert.equal(list.scrollTop - prev, AUTO_SCROLL_MAX_SPEED, 'max speed at bottom edge');
});
