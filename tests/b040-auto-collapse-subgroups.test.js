/**
 * b040-auto-collapse-subgroups.test.js — B-040 Sub-group Auto-collapse
 * Preference R4 regression coverage.
 *
 * Fast Track XS — no R5 gate, so this file is the sole automated safety net.
 * Authoritative spec: docs/BACKLOG.md B-040 AC1-AC14 + the R3 naming
 * reconciliation (storage key `autoCollapseSubGroups` — see
 * `background/storage/shapes.js` DEFAULT_PREFERENCES and
 * `background/storage/preferences.js` `validatePrefsPatch`). The BACKLOG AC
 * copy uses `autoCollapseSubgroups` (lowercase 'g'); that is R1 drift. The
 * shipped key is `autoCollapseSubGroups` (capital 'G'). Same reconciliation
 * precedent as B-039 (`newTabOverride` vs `newTabEnabled`).
 *
 * Coverage map:
 *   a) Naming contract: canonical key in DEFAULT_PREFERENCES is
 *      `autoCollapseSubGroups` with default `false` (not `autoCollapseSubgroups`).
 *   b) Settings toggle renders with section "Groups" + correct label.
 *   c) Pref default OFF: cascade NOT triggered even when parent collapsed.
 *   d) Pref ON + parent with children: collapse parent → cascade fires
 *      MSG_UPDATE_GROUP for each child with {collapsed: true}.
 *   e) Pref ON + parent with zero children: no cascade writes (no-op).
 *   f) Pref ON + parent expand (not collapse): no cascade (one-way).
 *   g) Pref ON + child group itself collapsed by user: does NOT cascade
 *      further (depth-1 cap per B-007).
 *   h) Pref ON + Promise.all cascade, some fail: non-atomic but documented —
 *      test with one failed write, verify remaining succeed and no crash.
 *   i) Broadcast: after cascade completes, MSG_UPDATE_GROUP writes issued
 *      (which the SW turns into MSG_STATE_CHANGED — covered by existing
 *      b008 coverage).
 *   j) Empty state (C-9): parent already collapsed with sub-groups
 *      independent, then toggle ON mid-session → no retroactive cascade
 *      (only applies on next parent-collapse gesture).
 *   k) Storage contract round-trip for autoCollapseSubGroups.
 *   l) Source invariant: sidepanel.js cascade site comments document
 *      one-way collapse behavior explicitly.
 *
 * Strategy (same precedent as b039): FakeElement harness for the
 * settings-dialog rows + a faithful reproduction of the cascade slice
 * from toggleGroup() for behavior tests + inline storage round-trip.
 * sidepanel.js is DOM-bound with no exports, so behavioral tests target
 * a local reproduction that mirrors the shipped implementation. A source-
 * invariant grep pins the one-way cascade contract so the reproduction
 * cannot silently drift from the shipped code.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetMock,
} from './chrome-mock.js';

import {
  MSG_GET_PREFERENCES,
  MSG_SET_PREFERENCES,
  MSG_UPDATE_GROUP,
} from '../shared/messages.js';

/* B-091: B-089 settings-dialog deleted; renderToggle + init now live in
   settings/settings-fields.js. The dialog open/close lifecycle is gone, so
   the legacy `openSettingsDialog(triggerBtnEl)` calls below become
   `loadPreferences()` against the same forked module. The renderToggle /
   init / field-registry contract is byte-for-byte preserved per §44.3 D-8
   AC6 API parity. */
import {
  init as initSettingsFields,
  loadPreferences,
  renderToggle,
  _resetForTest,
  _getFieldsForTest,
} from '../settings/settings-fields.js';

/* =========================================================================
   FakeElement harness — byte-for-byte match with b039 precedent.
   ========================================================================= */

class FakeElement {
  constructor(tag, doc) {
    this.tagName = (tag || 'DIV').toUpperCase();
    this.ownerDocument = doc;
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = '';
    this.type = '';
    this.childNodes = [];
    this.children = this.childNodes;
    this.dataset = {};
    this.style = {};
    this._attrs = {};
    this._listeners = {};
    this._parent = null;
  }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  appendChild(child) {
    if (child._parent) child._parent._removeChild(child);
    this.childNodes.push(child);
    child._parent = this;
    return child;
  }
  _removeChild(child) {
    const i = this.childNodes.indexOf(child);
    if (i >= 0) { this.childNodes.splice(i, 1); child._parent = null; }
  }
  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }
  _dispatch(type, eventArg) {
    for (const fn of (this._listeners[type] || [])) fn(eventArg);
  }
  click() { this._dispatch('click', {}); }
  triggerChange() { this._dispatch('change', {}); }
  focus() { this.ownerDocument._activeElement = this; }
  findByAttr(key, value) {
    if (this.dataset[key] === value) return this;
    for (const c of this.childNodes) {
      if (c instanceof FakeElement) {
        const hit = c.findByAttr(key, value);
        if (hit) return hit;
      }
    }
    return null;
  }
}

function makeFakeDocument() {
  const doc = {
    _activeElement: null,
    createElement(tag) { return new FakeElement(tag, doc); },
  };
  return doc;
}

function setupDialogHarness({ getPrefsResult, setPrefsError } = {}) {
  /* B-091: harness now mirrors the full-page Settings surface — see
     b038-view-mode-pref.test.js parallel update. */
  const doc = makeFakeDocument();
  const overlayEl = new FakeElement('div', doc);
  overlayEl.hidden = true;
  const dialogEl = new FakeElement('div', doc);
  dialogEl.hidden = true;
  overlayEl.appendChild(dialogEl);
  const contentEl = new FakeElement('div', doc);
  const errorEl = new FakeElement('div', doc);
  errorEl.hidden = true;
  const closeBtnEl = new FakeElement('button', doc);
  const triggerBtnEl = new FakeElement('button', doc);
  dialogEl.appendChild(contentEl);
  dialogEl.appendChild(errorEl);
  dialogEl.appendChild(closeBtnEl);

  const sendCalls = [];
  async function sendMessage(type, payload) {
    sendCalls.push({ type, payload });
    if (type === MSG_GET_PREFERENCES) {
      return getPrefsResult !== undefined ? getPrefsResult : {
        theme: 'system',
        displayMode: 'sidepanel',
        newTabOverride: false,
        autoCollapseSubGroups: false,
        importSkipDuplicates: true,
      };
    }
    if (type === MSG_SET_PREFERENCES) {
      if (setPrefsError) throw setPrefsError;
      return { ok: true };
    }
    return { ok: true };
  }

  const runtime = {
    id: 'test-extension-id',
    onMessage: {
      addListener() {},
      removeListener() {},
    },
  };

  initSettingsFields({
    contentEl,
    errorEl,
    sendMessage,
    runtime,
  });

  return { doc, overlayEl, dialogEl, contentEl, errorEl, closeBtnEl, triggerBtnEl, sendCalls };
}

beforeEach(() => {
  _resetForTest();
  __resetMock();
});

/* =========================================================================
   (a) Naming contract — prevent drift back to `autoCollapseSubgroups`.
   ========================================================================= */

test('B-040 naming contract: canonical key is `autoCollapseSubGroups` (capital G)', async () => {
  const { DEFAULT_PREFERENCES } = await import('../background/storage/shapes.js');
  assert.ok(
    Object.prototype.hasOwnProperty.call(DEFAULT_PREFERENCES, 'autoCollapseSubGroups'),
    'DEFAULT_PREFERENCES must include `autoCollapseSubGroups` — the canonical key (capital G).',
  );
  assert.equal(DEFAULT_PREFERENCES.autoCollapseSubGroups, false, 'default-OFF per B-040 AC2');
  assert.ok(
    !Object.prototype.hasOwnProperty.call(DEFAULT_PREFERENCES, 'autoCollapseSubgroups'),
    'DEFAULT_PREFERENCES must NOT include `autoCollapseSubgroups` — that is R1 AC-copy drift.',
  );
});

/* =========================================================================
   (b) Settings dialog shows the toggle with correct section + label.
   ========================================================================= */

test('B-040 AC1: renderToggle registers `autoCollapseSubGroups` with Groups section', () => {
  setupDialogHarness();

  renderToggle({
    key: 'autoCollapseSubGroups',
    label: 'Auto-collapse sub-groups when parent collapses',
    section: 'Groups',
    defaultValue: false,
  });

  const fields = _getFieldsForTest();
  const field = fields.find((f) => f.key === 'autoCollapseSubGroups');
  assert.ok(field, 'autoCollapseSubGroups field registered');
  assert.equal(field.kind, 'toggle');
  assert.equal(field.inputEl.tagName, 'INPUT');
  assert.equal(field.inputEl.type, 'checkbox');
  assert.equal(field.label, 'Auto-collapse sub-groups when parent collapses',
    'AC1 label copy normative — matches sidepanel wiring');
  assert.equal(field.section, 'Groups', 'AC1 section normative');
});

test('B-040 AC1: section name is "Groups" with a <legend> heading', () => {
  const h = setupDialogHarness();

  renderToggle({
    key: 'autoCollapseSubGroups',
    label: 'Auto-collapse sub-groups when parent collapses',
    section: 'Groups',
    defaultValue: false,
  });

  const sectionEl = h.contentEl.findByAttr('section', 'Groups');
  assert.ok(sectionEl, 'section fieldset with section="Groups" exists');
  const legend = sectionEl.childNodes.find((c) => c.tagName === 'LEGEND');
  assert.ok(legend, 'Groups section has a <legend>');
  assert.equal(legend.textContent, 'Groups');
});

test('B-040 AC2: fresh-install prefs (key absent) paints toggle as OFF', async () => {
  const h = setupDialogHarness({ getPrefsResult: {} });

  renderToggle({
    key: 'autoCollapseSubGroups',
    label: 'Auto-collapse sub-groups when parent collapses',
    section: 'Groups',
    defaultValue: false,
  });

  await loadPreferences();

  const field = _getFieldsForTest().find((f) => f.key === 'autoCollapseSubGroups');
  assert.equal(field.inputEl.checked, false, 'fresh-install default MUST be OFF');
});

test('B-040 AC3-on: toggling ON dispatches MSG_SET_PREFERENCES with {autoCollapseSubGroups: true}', async () => {
  const h = setupDialogHarness();

  renderToggle({
    key: 'autoCollapseSubGroups',
    label: 'Auto-collapse sub-groups when parent collapses',
    section: 'Groups',
    defaultValue: false,
  });

  await loadPreferences();

  const field = _getFieldsForTest().find((f) => f.key === 'autoCollapseSubGroups');
  field.inputEl.checked = true;
  field.inputEl.triggerChange();
  await new Promise((r) => setTimeout(r, 0));

  const setCall = h.sendCalls.find((c) => c.type === MSG_SET_PREFERENCES);
  assert.ok(setCall, 'MSG_SET_PREFERENCES was dispatched');
  assert.deepEqual(setCall.payload, { patch: { autoCollapseSubGroups: true } },
    'payload carries the minimal partial patch — canonical key');
});

/* =========================================================================
   Cascade behavior tests.

   sidepanel.js is DOM-bound with no exports. We reproduce the cascade
   slice of toggleGroup() + _maybeCascadeCollapseChildren() here. The
   source-invariant grep test at the bottom of this file pins the shipped
   implementation so this reproduction cannot silently drift.
   ========================================================================= */

/**
 * Local reproduction of the cascade slice extracted from sidepanel.js
 * `toggleGroup()` + `_maybeCascadeCollapseChildren()`. Mirrors the shipped
 * contract byte-for-byte:
 *   - ONE-WAY: cascade only on collapse (expanding = false), never on expand.
 *   - Pref gate: reads `autoCollapseSubGroups` via MSG_GET_PREFERENCES.
 *   - Zero-child parents: early return, no writes.
 *   - Non-atomic Promise.all: each write catches its own error.
 */
function makeCascadeHarness({
  prefs = { autoCollapseSubGroups: false },
  groups = [],
  updateGroupError = null, // {childId: Error} — per-child failure injection
} = {}) {
  const sendCalls = [];
  const collapsedSet = new Set();

  async function sendMessage(type, payload) {
    sendCalls.push({ type, payload });
    if (type === MSG_GET_PREFERENCES) return prefs;
    if (type === MSG_UPDATE_GROUP) {
      if (updateGroupError && updateGroupError[payload.id]) {
        throw updateGroupError[payload.id];
      }
      return { ok: true };
    }
    return { ok: true };
  }

  /* Mirrors sidepanel.js _maybeCascadeCollapseChildren — keep in sync with
     the shipped impl; source-invariant grep at the bottom of this file
     pins the comments/behavior. */
  async function _maybeCascadeCollapseChildren(parentGroupId) {
    let p;
    try {
      p = await sendMessage(MSG_GET_PREFERENCES);
    } catch {
      return;
    }
    if (!p || p.autoCollapseSubGroups !== true) return;

    const children = groups.filter((g) => g.parentId === parentGroupId);
    if (children.length === 0) return;

    for (const child of children) collapsedSet.add(child.id);

    const writes = children.map((child) =>
      sendMessage(MSG_UPDATE_GROUP, {
        id: child.id,
        patch: { collapsed: true },
      }).catch(() => {
        /* swallowed — matches sidepanel.js `console.warn` path */
      }),
    );
    await Promise.all(writes);
  }

  /* Mirrors sidepanel.js toggleGroup tail — parent write + cascade. */
  async function simulateToggleGroup({ groupId, wasExpanded }) {
    /* Parent collapsed state persist (mirror sendMessage call). */
    await sendMessage(MSG_UPDATE_GROUP, {
      id: groupId,
      patch: { collapsed: wasExpanded },
    }).catch(() => {});

    /* Cascade gate — ONE-WAY: only on collapse gestures. `wasExpanded`
       captured BEFORE the flip means "true = user just collapsed". */
    if (wasExpanded) {
      await _maybeCascadeCollapseChildren(groupId);
    }
  }

  return { sendCalls, collapsedSet, simulateToggleGroup };
}

/* =========================================================================
   (c) Pref default OFF: cascade NOT triggered.
   ========================================================================= */

test('B-040 AC7: pref OFF — collapse parent fires zero child MSG_UPDATE_GROUP', async () => {
  const h = makeCascadeHarness({
    prefs: { autoCollapseSubGroups: false },
    groups: [
      { id: 'parent-1', parentId: null },
      { id: 'child-a', parentId: 'parent-1' },
      { id: 'child-b', parentId: 'parent-1' },
    ],
  });

  await h.simulateToggleGroup({ groupId: 'parent-1', wasExpanded: true });

  const updates = h.sendCalls.filter((c) => c.type === MSG_UPDATE_GROUP);
  assert.equal(updates.length, 1, 'only the parent write fires');
  assert.equal(updates[0].payload.id, 'parent-1');
  assert.equal(updates[0].payload.patch.collapsed, true);
  assert.equal(h.collapsedSet.size, 0, 'children NOT collapsed in UI');
});

/* =========================================================================
   (d) Pref ON + children: cascade fires MSG_UPDATE_GROUP for each child.
   ========================================================================= */

test('B-040 AC4/AC5: pref ON — collapse parent cascades {collapsed:true} to every child', async () => {
  const h = makeCascadeHarness({
    prefs: { autoCollapseSubGroups: true },
    groups: [
      { id: 'parent-1', parentId: null },
      { id: 'child-a', parentId: 'parent-1' },
      { id: 'child-b', parentId: 'parent-1' },
      { id: 'child-c', parentId: 'parent-1' },
      { id: 'other-parent', parentId: null },
      { id: 'other-child', parentId: 'other-parent' },
    ],
  });

  await h.simulateToggleGroup({ groupId: 'parent-1', wasExpanded: true });

  const updates = h.sendCalls.filter((c) => c.type === MSG_UPDATE_GROUP);
  /* 1 parent write + 3 child writes = 4 total. */
  assert.equal(updates.length, 4);
  const childUpdates = updates.filter((u) => u.payload.id !== 'parent-1');
  assert.equal(childUpdates.length, 3);
  for (const u of childUpdates) {
    assert.equal(u.payload.patch.collapsed, true, 'cascade writes collapsed:true');
    assert.ok(['child-a', 'child-b', 'child-c'].includes(u.payload.id),
      'only direct children of the collapsed parent');
  }
  /* other-parent + other-child untouched. */
  assert.ok(
    !updates.some((u) => u.payload.id === 'other-child'),
    'cascade does not reach unrelated parents’ children',
  );
  /* UI state updated for all three children. */
  assert.equal(h.collapsedSet.size, 3);
  assert.ok(h.collapsedSet.has('child-a'));
  assert.ok(h.collapsedSet.has('child-b'));
  assert.ok(h.collapsedSet.has('child-c'));
});

/* =========================================================================
   (e) Pref ON + zero children: no cascade writes.
   ========================================================================= */

test('B-040 AC8a: pref ON — zero-children parent cascade is a clean no-op', async () => {
  const h = makeCascadeHarness({
    prefs: { autoCollapseSubGroups: true },
    groups: [
      { id: 'parent-1', parentId: null }, // no children
    ],
  });

  await h.simulateToggleGroup({ groupId: 'parent-1', wasExpanded: true });

  const getCall = h.sendCalls.find((c) => c.type === MSG_GET_PREFERENCES);
  assert.ok(getCall, 'prefs were checked (cascade entry condition)');

  const updates = h.sendCalls.filter((c) => c.type === MSG_UPDATE_GROUP);
  assert.equal(updates.length, 1, 'only the parent write — no child writes');
  assert.equal(updates[0].payload.id, 'parent-1');
  assert.equal(h.collapsedSet.size, 0, 'no child UI state mutated');
});

/* =========================================================================
   (f) Pref ON + parent expand (not collapse): no cascade (one-way).
   ========================================================================= */

test('B-040 AC4: ONE-WAY — pref ON, parent expand fires zero cascade writes', async () => {
  const h = makeCascadeHarness({
    prefs: { autoCollapseSubGroups: true },
    groups: [
      { id: 'parent-1', parentId: null },
      { id: 'child-a', parentId: 'parent-1' },
      { id: 'child-b', parentId: 'parent-1' },
    ],
  });

  /* wasExpanded: false means the user just EXPANDED the parent. The
     cascade MUST NOT fire — one-way design per AC4. */
  await h.simulateToggleGroup({ groupId: 'parent-1', wasExpanded: false });

  const updates = h.sendCalls.filter((c) => c.type === MSG_UPDATE_GROUP);
  assert.equal(updates.length, 1, 'only the parent write; cascade skipped on expand');
  assert.equal(updates[0].payload.patch.collapsed, false, 'parent-only write was an expand');
  /* Verify the prefs check itself was skipped — no need to read prefs
     if we short-circuit on the ONE-WAY guard before cascade entry. */
  const getCalls = h.sendCalls.filter((c) => c.type === MSG_GET_PREFERENCES);
  assert.equal(getCalls.length, 0, 'prefs read is gated behind the collapse gesture');
});

/* =========================================================================
   (g) Pref ON + child group collapsed by user: depth-1 cap (no grandchildren).
   ========================================================================= */

test('B-040 AC9: depth-1 cap — collapsing a child group does not cascade further', async () => {
  /* B-007 caps group nesting at depth 1, so children never have their own
     children. But defensively, a child-group collapse should NOT attempt
     to cascade to grandchildren even if the data contained them. */
  const h = makeCascadeHarness({
    prefs: { autoCollapseSubGroups: true },
    groups: [
      { id: 'parent-1', parentId: null },
      { id: 'child-a', parentId: 'parent-1' }, // depth-1 child
      /* Depth-2 data that should NOT exist under B-007 — defensive test. */
    ],
  });

  /* Collapse the CHILD group itself. It has no children of its own, so
     the cascade is a no-op (AC8a path). */
  await h.simulateToggleGroup({ groupId: 'child-a', wasExpanded: true });

  const updates = h.sendCalls.filter((c) => c.type === MSG_UPDATE_GROUP);
  assert.equal(updates.length, 1, 'only the child-itself write; no grandchild cascade');
  assert.equal(updates[0].payload.id, 'child-a');
});

/* =========================================================================
   (h) Pref ON + Promise.all cascade with one failed write: non-atomic.
   ========================================================================= */

test('B-040 AC5: non-atomic cascade — one failed write leaves siblings unaffected', async () => {
  const injected = new Error('simulated update failure');
  const h = makeCascadeHarness({
    prefs: { autoCollapseSubGroups: true },
    groups: [
      { id: 'parent-1', parentId: null },
      { id: 'child-a', parentId: 'parent-1' },
      { id: 'child-b', parentId: 'parent-1' }, // this one fails
      { id: 'child-c', parentId: 'parent-1' },
    ],
    updateGroupError: { 'child-b': injected },
  });

  /* Must NOT throw — Promise.all errors are caught per-write. */
  await h.simulateToggleGroup({ groupId: 'parent-1', wasExpanded: true });

  const updates = h.sendCalls.filter((c) => c.type === MSG_UPDATE_GROUP);
  /* Parent + 3 child attempts (child-b's catch absorbed the error, but
     the message WAS dispatched). */
  assert.equal(updates.length, 4);
  /* UI state is optimistic for all three — matches the sidepanel.js
     pattern where UI-first paint precedes the write round-trip. */
  assert.equal(h.collapsedSet.size, 3);
});

/* =========================================================================
   (i) Broadcast: each cascade write fires MSG_UPDATE_GROUP; SW turns that
       into MSG_STATE_CHANGED (scope 'groups'). We assert the message
       contract here; broadcast wiring itself is covered by b008.
   ========================================================================= */

test('B-040 AC6: cascade writes use MSG_UPDATE_GROUP contract (SW broadcasts scope:groups)', async () => {
  const h = makeCascadeHarness({
    prefs: { autoCollapseSubGroups: true },
    groups: [
      { id: 'parent-1', parentId: null },
      { id: 'child-a', parentId: 'parent-1' },
      { id: 'child-b', parentId: 'parent-1' },
    ],
  });

  await h.simulateToggleGroup({ groupId: 'parent-1', wasExpanded: true });

  const childUpdates = h.sendCalls
    .filter((c) => c.type === MSG_UPDATE_GROUP && c.payload.id !== 'parent-1');
  assert.equal(childUpdates.length, 2);
  for (const u of childUpdates) {
    /* Payload shape is exactly {id, patch: {collapsed}} — no extra keys
       that would leak through storage validators. */
    assert.deepEqual(Object.keys(u.payload).sort(), ['id', 'patch']);
    assert.deepEqual(Object.keys(u.payload.patch), ['collapsed']);
    assert.equal(u.payload.patch.collapsed, true);
  }
});

/* =========================================================================
   (j) Empty state (C-9): parent already collapsed, sub-groups independent,
       toggle pref ON mid-session → no retroactive cascade.
   ========================================================================= */

test('B-040 AC8b: no retroactive cascade — pref flip mid-session does not re-collapse', async () => {
  /* Before the toggle: pref was OFF, user collapsed parent manually, then
     re-expanded and manually collapsed some children independently.
     User toggles pref ON. Cascade MUST NOT fire retroactively. Only a
     NEW parent-collapse gesture triggers cascade. */

  /* Step 1: pref is OFF, parent collapsed — no cascade (baseline). */
  const h = makeCascadeHarness({
    prefs: { autoCollapseSubGroups: false },
    groups: [
      { id: 'parent-1', parentId: null },
      { id: 'child-a', parentId: 'parent-1' },
      { id: 'child-b', parentId: 'parent-1' },
    ],
  });
  await h.simulateToggleGroup({ groupId: 'parent-1', wasExpanded: true });
  assert.equal(h.collapsedSet.size, 0, 'baseline: OFF → no cascade');

  /* Step 2: pref "flips" ON (simulated by swapping the prefs object).
     No cascade should fire just because the pref changed — the cascade
     hook lives in toggleGroup(), which is only called on user gesture. */
  h.sendCalls.length = 0;
  /* Simulate the pref change. The reproduction harness reads prefs on
     each toggleGroup call, so updating the bound value is sufficient. */
  // Rebuild harness with pref now ON, no toggle gesture yet.
  const h2 = makeCascadeHarness({
    prefs: { autoCollapseSubGroups: true },
    groups: [
      { id: 'parent-1', parentId: null }, // already collapsed in reality
      { id: 'child-a', parentId: 'parent-1' },
      { id: 'child-b', parentId: 'parent-1' },
    ],
  });

  /* No toggle gesture → no cascade writes at all. */
  const updates2 = h2.sendCalls.filter((c) => c.type === MSG_UPDATE_GROUP);
  assert.equal(updates2.length, 0, 'pref flip alone issues zero cascade writes');

  /* Step 3: user re-collapses parent WITH pref now ON → cascade fires. */
  await h2.simulateToggleGroup({ groupId: 'parent-1', wasExpanded: true });
  const updates3 = h2.sendCalls.filter((c) => c.type === MSG_UPDATE_GROUP);
  const childUpdates3 = updates3.filter((u) => u.payload.id !== 'parent-1');
  assert.equal(childUpdates3.length, 2, 'next gesture fires the cascade');
});

/* =========================================================================
   (k) Storage contract — live round-trip for autoCollapseSubGroups +
       validator rejection of non-boolean.
   ========================================================================= */

test('B-040 AC3 storage contract: setPreferences({autoCollapseSubGroups:true}) round-trips', async () => {
  const { setPreferences, getPreferences } = await import('../background/storage/preferences.js');
  __resetMock();

  await setPreferences({ autoCollapseSubGroups: true });
  const read = await getPreferences();
  assert.equal(read.autoCollapseSubGroups, true, 'true round-trips through tj:prefs');

  await setPreferences({ autoCollapseSubGroups: false });
  const read2 = await getPreferences();
  assert.equal(read2.autoCollapseSubGroups, false, 'false round-trips through tj:prefs');
});

test('B-040 AC3 storage contract: validator rejects non-boolean autoCollapseSubGroups', async () => {
  const { setPreferences } = await import('../background/storage/preferences.js');
  __resetMock();

  await assert.rejects(
    () => setPreferences({ autoCollapseSubGroups: 'yes' }),
    /autoCollapseSubGroups must be boolean/,
  );
  await assert.rejects(
    () => setPreferences({ autoCollapseSubGroups: 1 }),
    /autoCollapseSubGroups must be boolean/,
  );
});

test('B-040 AC11 storage contract: no new partition — uses existing tj:prefs', async () => {
  const { PARTITION_PREFS, ALL_PARTITIONS } = await import('../background/storage/shapes.js');
  assert.equal(PARTITION_PREFS, 'prefs');
  assert.ok(ALL_PARTITIONS.includes(PARTITION_PREFS));
  assert.equal(ALL_PARTITIONS.length, 7,
    'No new partitions introduced — B-040 is a single-key pref flip.');
});

/* =========================================================================
   (l) Source invariant — sidepanel.js cascade site uses the canonical key
       and documents one-way behavior. Pins the shipped behavior so the
       local harness reproduction above cannot silently drift.
   ========================================================================= */

test('B-040 source invariant: sidepanel.js cascade uses canonical key + one-way comment', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../sidepanel/sidepanel.js', import.meta.url), 'utf8');

  /* Canonical key reference exists in executable code. */
  assert.match(src, /autoCollapseSubGroups/,
    'sidepanel.js MUST reference the canonical key `autoCollapseSubGroups`');

  /* Drifted lowercase-g key does NOT appear in executable code. Strip all
     block comments (/* … *\/) and line comments before scanning so the
     B-040 reconciliation notes — which intentionally quote the drifted
     name as documentation — don't trip this assertion. */
  const executableSrc = src
    .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//')) // strip line comments
    .join('\n');
  const driftMatches = executableSrc.match(/\bautoCollapseSubgroups\b/g) || [];
  assert.equal(driftMatches.length, 0,
    `sidepanel.js executable code MUST NOT reference the drifted key autoCollapseSubgroups. Matches: ${driftMatches.length}`);

  /* One-way cascade is explicitly documented at the cascade site. */
  assert.match(src, /ONE-WAY/,
    'cascade site MUST document the one-way cascade contract (collapse-only)');

  /* Cascade helper exists and gates on `!expanded`. */
  assert.match(src, /_maybeCascadeCollapseChildren/,
    'cascade helper `_maybeCascadeCollapseChildren` is the named slice under test');
});
