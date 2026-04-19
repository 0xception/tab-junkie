/**
 * b063-blur-close.test.js — B-063 R5 regression tests for the
 * window.blur -> close-context-menu behavior.
 *
 * sidepanel.js is a browser-only module with no exports. Following the
 * pattern from b027-group-header-menu.test.js / b028-selection-context-menu.test.js
 * / b061-unsavable-dim.test.js, the minimal blur-handler contract is reproduced
 * here verbatim so the decision logic can be exercised deterministically
 * without a real browser.
 *
 * Source: sidepanel/sidepanel.js — closeContextMenu() (~L3013) and the
 *         window.addEventListener('blur', ...) handler added after the
 *         itemListEl scroll close.
 *
 * Coverage (B-063 ACs):
 *   AC1 — blur with menu open -> contextMenuEl.hidden becomes true
 *         synchronously and _contextMenuTriggerRow is null
 *   AC3 — trigger.focus() is NOT called during a blur-close
 *   AC4 — applies uniformly to item / group-header / selection / open-tabs
 *         trigger shapes (all go through the same single listener)
 *   AC5 — dialog state (overlay hidden, confirm callback, create-dialog form)
 *         is unchanged by blur
 *   AC6 — filter input text persists across blur
 *   AC7 — blur when menu already closed is a no-op (idempotent)
 *   AC8 — broadcast-close path still calls the focus-restoring close
 *         (the blur handler does not intercept direct closeContextMenu() calls)
 */

import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

/* =========================================================================
   Minimal shim: reproduce the sidepanel state that the blur handler touches.
   ========================================================================= */

function makeTrigger(label) {
  let focusCalls = 0;
  return {
    label,
    get focusCalls() { return focusCalls; },
    focus() { focusCalls += 1; },
  };
}

/**
 * Build a fresh sidepanel-like world per test. Mirrors the closeContextMenu()
 * body (sidepanel.js ~L3013-3021) and the B-063 blur handler verbatim.
 */
function makeWorld() {
  const state = {
    contextMenuEl: {
      hidden: true,
      children: ['placeholder'],
      replaceChildren() { this.children = []; },
    },
    _contextMenuTriggerRow: null,
    /* Dialog state (AC5). Must not be mutated by blur. */
    dialogOverlay: { hidden: true },
    _pendingConfirmCallback: null,
    createDialogFormValue: '',
    /* Filter state (AC6). Must not be mutated by blur. */
    filterInput: { value: '' },
  };

  function closeContextMenu() {
    /* Mirrors sidepanel.js closeContextMenu(). */
    if (state.contextMenuEl.hidden) return;
    state.contextMenuEl.hidden = true;
    state.contextMenuEl.replaceChildren();
    if (state._contextMenuTriggerRow) {
      state._contextMenuTriggerRow.focus();
      state._contextMenuTriggerRow = null;
    }
  }

  /* The B-063 blur handler — exact copy of the logic in sidepanel.js. */
  function onWindowBlur() {
    if (state.contextMenuEl.hidden) return;
    state._contextMenuTriggerRow = null;
    closeContextMenu();
  }

  /* Helper: open the menu with a given trigger. Mirrors the shared prologue
     inside _openItemContextMenu / _openGroupContextMenu / _openSelectionContextMenu
     / _openTabContextMenu (they all set contextMenuEl.hidden = false and
     assign _contextMenuTriggerRow). */
  function openMenuWith(trigger) {
    state.contextMenuEl.hidden = false;
    state.contextMenuEl.children = ['menuitem-1', 'menuitem-2'];
    state._contextMenuTriggerRow = trigger;
  }

  return { state, closeContextMenu, onWindowBlur, openMenuWith };
}

/* =========================================================================
   AC1 — blur with menu open closes synchronously and nulls trigger
   ========================================================================= */

test('B-063 AC1: window.blur with open menu hides contextMenuEl synchronously', () => {
  const w = makeWorld();
  w.openMenuWith(makeTrigger('item-row'));
  assert.equal(w.state.contextMenuEl.hidden, false);

  w.onWindowBlur();

  assert.equal(w.state.contextMenuEl.hidden, true);
  assert.equal(w.state._contextMenuTriggerRow, null);
  assert.deepEqual(w.state.contextMenuEl.children, []);
});

/* =========================================================================
   AC3 — no focus restoration on blur-close
   ========================================================================= */

test('B-063 AC3: trigger.focus() is NOT called when blur closes the menu', () => {
  const w = makeWorld();
  const trigger = makeTrigger('item-row');
  w.openMenuWith(trigger);

  w.onWindowBlur();

  assert.equal(trigger.focusCalls, 0, 'blur-close must not yank focus back');
});

test('B-063 AC3 invariant: _contextMenuTriggerRow is null BEFORE closeContextMenu runs', () => {
  /* Guardrail test: capture the trigger-row assignment ordering by
     intercepting closeContextMenu() to inspect state.*/
  const w = makeWorld();
  const trigger = makeTrigger('item-row');
  w.openMenuWith(trigger);

  let triggerAtCloseEntry;
  const realClose = w.closeContextMenu;
  const instrumented = () => {
    triggerAtCloseEntry = w.state._contextMenuTriggerRow;
    return realClose();
  };
  /* Re-wire the blur handler to use the instrumented close. */
  const onBlur = () => {
    if (w.state.contextMenuEl.hidden) return;
    w.state._contextMenuTriggerRow = null;
    instrumented();
  };

  onBlur();

  assert.equal(triggerAtCloseEntry, null,
    'trigger must be cleared before closeContextMenu() so focus restoration no-ops');
  assert.equal(trigger.focusCalls, 0);
});

/* =========================================================================
   AC4 — uniform behavior across all four trigger shapes
   ========================================================================= */

test('B-063 AC4: item-row trigger — blur closes the menu', () => {
  const w = makeWorld();
  const trigger = makeTrigger('item-row');
  w.openMenuWith(trigger);
  w.onWindowBlur();
  assert.equal(w.state.contextMenuEl.hidden, true);
  assert.equal(trigger.focusCalls, 0);
});

test('B-063 AC4: group-header trigger — blur closes the menu', () => {
  const w = makeWorld();
  const trigger = makeTrigger('group-header');
  w.openMenuWith(trigger);
  w.onWindowBlur();
  assert.equal(w.state.contextMenuEl.hidden, true);
  assert.equal(trigger.focusCalls, 0);
});

test('B-063 AC4: selection trigger — blur closes the menu', () => {
  const w = makeWorld();
  const trigger = makeTrigger('selection-anchor');
  w.openMenuWith(trigger);
  w.onWindowBlur();
  assert.equal(w.state.contextMenuEl.hidden, true);
  assert.equal(trigger.focusCalls, 0);
});

test('B-063 AC4: open-tab-row trigger — blur closes the menu', () => {
  const w = makeWorld();
  const trigger = makeTrigger('open-tab-row');
  w.openMenuWith(trigger);
  w.onWindowBlur();
  assert.equal(w.state.contextMenuEl.hidden, true);
  assert.equal(trigger.focusCalls, 0);
});

/* =========================================================================
   AC5 — dialogs unaffected
   ========================================================================= */

test('B-063 AC5: blur does NOT close or mutate dialog state', () => {
  const w = makeWorld();
  /* Simulate a dialog being open (overlay visible, callback pending, form has input). */
  w.state.dialogOverlay.hidden = false;
  w.state._pendingConfirmCallback = () => 'confirmed';
  w.state.createDialogFormValue = 'New Bookmark Title';
  /* And ALSO a context menu open — blur must close the menu but not the dialog. */
  w.openMenuWith(makeTrigger('item-row'));

  w.onWindowBlur();

  assert.equal(w.state.contextMenuEl.hidden, true, 'menu closes');
  assert.equal(w.state.dialogOverlay.hidden, false, 'dialog overlay stays open');
  assert.equal(typeof w.state._pendingConfirmCallback, 'function', 'pending confirm callback preserved');
  assert.equal(w.state.createDialogFormValue, 'New Bookmark Title', 'create-dialog form value preserved');
});

/* =========================================================================
   AC6 — filter input persists
   ========================================================================= */

test('B-063 AC6: blur does NOT clear the filter input', () => {
  const w = makeWorld();
  w.state.filterInput.value = 'react';
  w.openMenuWith(makeTrigger('item-row'));

  w.onWindowBlur();

  assert.equal(w.state.contextMenuEl.hidden, true, 'menu closes');
  assert.equal(w.state.filterInput.value, 'react', 'filter text persists across blur');
});

/* =========================================================================
   AC7 — idempotent when menu already closed
   ========================================================================= */

test('B-063 AC7: blur with menu already closed is a no-op', () => {
  const w = makeWorld();
  assert.equal(w.state.contextMenuEl.hidden, true, 'precondition: menu closed');
  /* Track any state mutation by snapshotting the children array identity. */
  const childrenBefore = w.state.contextMenuEl.children;

  assert.doesNotThrow(() => w.onWindowBlur());

  assert.equal(w.state.contextMenuEl.hidden, true);
  assert.equal(w.state.contextMenuEl.children, childrenBefore,
    'no redundant replaceChildren() when menu was already hidden');
  assert.equal(w.state._contextMenuTriggerRow, null);
});

test('B-063 AC7: repeated blur events do not throw or re-execute close work', () => {
  const w = makeWorld();
  w.openMenuWith(makeTrigger('item-row'));

  w.onWindowBlur();               /* first closes the menu */
  const childrenAfterFirst = w.state.contextMenuEl.children;
  w.onWindowBlur();               /* second is a no-op */
  w.onWindowBlur();               /* third is a no-op */

  assert.equal(w.state.contextMenuEl.hidden, true);
  assert.equal(w.state.contextMenuEl.children, childrenAfterFirst,
    'subsequent blurs do not re-run replaceChildren()');
});

/* =========================================================================
   AC8 — broadcast-close path keeps focus restoration
   ========================================================================= */

test('B-063 AC8: direct closeContextMenu() call (broadcast path) still restores focus', () => {
  /* The broadcast close (e.g., state-changed while a menu is open) calls
     closeContextMenu() directly WITHOUT nulling the trigger first. That code
     path is unchanged by B-063 — verify its contract. */
  const w = makeWorld();
  const trigger = makeTrigger('item-row');
  w.openMenuWith(trigger);

  /* Simulate a broadcast mutation handler — calls closeContextMenu() directly. */
  w.closeContextMenu();

  assert.equal(w.state.contextMenuEl.hidden, true);
  assert.equal(trigger.focusCalls, 1, 'broadcast-close restores focus to the trigger');
  assert.equal(w.state._contextMenuTriggerRow, null, 'trigger is cleared by closeContextMenu itself');
});
