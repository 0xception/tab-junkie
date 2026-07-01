/**
 * b190-broadcast-scope-audit.test.js — B-190 (display-order consolidation
 * Tier-A, docs/design/77 §77, drift point DO-4).
 *
 * THE DEFECT CLASS (DO-4): the broadcast `SCOPE` tag is an IMPLICIT authority
 * that decides which sidepanel render path runs. `SCOPE.ITEMS`/`SCOPE.GROUPS`
 * route to the full, renderOrder-respecting render (RP-A); `SCOPE.LIVE_STATE`
 * routes to the incremental floating patch (RP-B). The B-184 bug was a
 * STRUCTURAL change (new floating member + a `Group.renderOrder` splice)
 * mis-tagged `SCOPE.LIVE_STATE`, so the new row was dropped at the bottom of
 * the floating zone instead of under its opener. It was fixed by re-tagging the
 * opener-inheritance broadcast to `SCOPE.ITEMS` (tab-events.js:305).
 *
 * This suite is the standing regression net that pins the invariant the audit
 * established: *every structural mutation (renderOrder / floating-membership /
 * item-membership / group-structure) broadcasts a STRUCTURAL scope
 * (ITEMS/GROUPS); only genuinely live-status mutations (active / audible /
 * title / favicon) broadcast LIVE_STATE.* It guards against a future structural
 * mutation being mis-tagged LIVE_STATE (a B-184-class regression) AND against a
 * future over-correction promoting a high-frequency live-only event to a
 * structural full-render (a perf regression).
 *
 * Two layers:
 *   - BEHAVIORAL (T1–T3): drive the REAL renderOrder-changing paths through the
 *     registered SW handler / the real onCreated listener, capture the emitted
 *     broadcast via the chrome-mock sendMessage spy, and assert the scope is
 *     structural. The reorder / move / append paths (the §77.4 DO-4 set) are
 *     exercised end-to-end, not just asserted against source text.
 *   - SOURCE-TEXT (T4–T5): pin the canonical `MUTATION_BROADCASTS` table +
 *     the manual tab-event broadcast sites so the classification is greppable
 *     and a wrong-scope edit fails the suite even when the path is not mock-
 *     reproducible.
 *
 * tab/removed STOP-and-escalate note (§77.10): the orphan-floating prune on
 * `chrome.tabs.onRemoved` DOES strip a `floating:` ref from `Group.renderOrder`
 * (floating-groups-prune.js:233-259), so it is structural-by-data. It is
 * nonetheless correctly LIVE_STATE and is deliberately NOT re-tagged: (a) it is
 * a pure REMOVAL — the incremental path (refetchAndPatchLiveState →
 * patchFloatingMembersSections) removes the row and leaves the remaining rows in
 * place, so it cannot reproduce the B-184 new-row-misplacement defect; (b) it
 * fires on EVERY tab close, so forcing a full renderAll would be a perf
 * regression on a hot path. T5 pins that it stays LIVE_STATE.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  __resetMock,
  __setMockTabs,
  __getSendMessageCalls,
} from './chrome-mock.js';
import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import { registerTabEventListeners } from '../background/tabs/tab-events.js';
import { createGroup } from '../background/storage/groups.js';
import { appendFloatingGroup } from '../background/tabs/floating-groups.js';
import {
  __resetLiveTabIndex,
  buildLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import { __resetTabClaims } from '../background/tabs/tab-claims.js';
import { __resetOpenerMap } from '../background/tabs/opener-chain.js';
import {
  MSG_STATE_CHANGED,
  MSG_REORDER_FLOATING_MEMBERS,
  MSG_MOVE_FLOATING_TAB,
} from '../shared/messages.js';
import { SCOPE } from '../shared/scopes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const STORAGE_HANDLERS_SRC = readFileSync(
  join(REPO_ROOT, 'background/messages/storage-handlers.js'),
  'utf8',
);
const TAB_EVENTS_SRC = readFileSync(
  join(REPO_ROOT, 'background/tabs/tab-events.js'),
  'utf8',
);

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
  __resetOpenerMap();
});

/* Dispatch a message through the SW onMessage listener registerStorageHandlers
   attaches (mirrors the b102 / b099 pattern). */
function getListener() {
  const listeners = chrome.runtime.onMessage._listeners;
  return listeners[listeners.length - 1];
}
function dispatch(type, payload) {
  return new Promise((resolve) => {
    getListener()({ type, payload }, { id: chrome.runtime.id }, resolve);
  });
}

/* Capture the MSG_STATE_CHANGED broadcast produced AFTER `preIdx` for a given
   trigger. The dispatcher fires chrome.runtime.sendMessage(MSG_STATE_CHANGED)
   after sendResponse, so it is recorded by the spy by the time dispatch
   resolves. */
function broadcastFor(trigger, preIdx) {
  return __getSendMessageCalls()
    .slice(preIdx)
    .map((args) => args[0])
    .find((m) => m && m.type === MSG_STATE_CHANGED && m.payload && m.payload.trigger === trigger);
}

/* ── T1 — REORDER (renderOrder write) routes STRUCTURAL ─────────────────── */
test('B-190 T1: MSG_REORDER_FLOATING_MEMBERS (renderOrder write) broadcasts SCOPE.ITEMS, not LIVE_STATE', async () => {
  registerStorageHandlers(Promise.resolve());
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });

  const preIdx = __getSendMessageCalls().length;
  const resp = await dispatch(MSG_REORDER_FLOATING_MEMBERS, {
    groupId: g.id,
    renderOrder: ['item:i1', 'floating:f1'],
  });
  assert.equal(resp.ok, true, 'reorder dispatch must succeed');

  const bc = broadcastFor(MSG_REORDER_FLOATING_MEMBERS, preIdx);
  assert.ok(bc, 'a reorder must emit a MSG_STATE_CHANGED broadcast');
  assert.equal(
    bc.payload.scope, SCOPE.ITEMS,
    'DO-4: a renderOrder write is structural — must route to the full render via SCOPE.ITEMS',
  );
  assert.notEqual(
    bc.payload.scope, SCOPE.LIVE_STATE,
    'DO-4: a renderOrder write must NOT route to the incremental LIVE_STATE path (the B-184 defect class)',
  );
});

/* ── T2 — MOVE / DETACH (floating-membership change) routes STRUCTURAL ───── */
test('B-190 T2: MSG_MOVE_FLOATING_TAB (floating-membership change) broadcasts SCOPE.ITEMS, not LIVE_STATE', async () => {
  registerStorageHandlers(Promise.resolve());
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  /* Seed a floating record (liveTabId 40) under the group + the matching live
     tab so a real DETACH (targetGroupId: null) succeeds. */
  await appendFloatingGroup({
    groupId: g.id,
    parentItemId: 'i1',
    windowId: 1,
    tabIndex: 0,
    url: 'https://child.example/',
    savedAt: 1,
    liveTabId: 40,
    floatingTabId: 'f-40',
  });
  __setMockTabs([
    { id: 40, url: 'https://child.example/', title: 'Child', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  const preIdx = __getSendMessageCalls().length;
  const resp = await dispatch(MSG_MOVE_FLOATING_TAB, {
    tabId: 40,
    sourceGroupId: g.id,
    targetGroupId: null,
    insertIndex: 0,
  });
  assert.equal(resp.ok, true, 'move dispatch must succeed');
  assert.equal(resp.data.moved, true, 'the DETACH must actually mutate floating membership (real structural change)');

  const bc = broadcastFor(MSG_MOVE_FLOATING_TAB, preIdx);
  assert.ok(bc, 'a floating move must emit a MSG_STATE_CHANGED broadcast');
  assert.equal(
    bc.payload.scope, SCOPE.ITEMS,
    'DO-4: a floating-membership move is structural — must route to the full render via SCOPE.ITEMS',
  );
  assert.notEqual(bc.payload.scope, SCOPE.LIVE_STATE, 'DO-4: must not route LIVE_STATE');
});

/* ── T3 — APPEND via opener-inheritance routes STRUCTURAL (the B-184 path) ─ */
test('B-190 T3: opener-inheritance APPEND (new floating member + renderOrder splice) broadcasts SCOPE.ITEMS, not LIVE_STATE', async () => {
  /* Seed tab 30 as an existing FLOATING child under g/item-1; a new tab 31 is
     opened FROM it. walkOpenerChain misses the (unclaimed) floating opener, so
     only the B-184 floating-opener fallback rescues it — the append path that
     was the original DO-4 mis-tag. */
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  await appendFloatingGroup({
    groupId: g.id,
    parentItemId: 'item-1',
    windowId: 1,
    tabIndex: 1,
    url: 'https://child.example/',
    savedAt: 1,
    liveTabId: 30,
    floatingTabId: 'f-30',
  });
  __setMockTabs([
    { id: 30, url: 'https://child.example/', windowId: 1, active: true, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();

  registerTabEventListeners(Promise.resolve());
  const preIdx = __getSendMessageCalls().length;
  globalThis.chrome.tabs.onCreated.__fire({
    id: 31,
    openerTabId: 30,
    url: 'https://grandchild.example/',
    windowId: 1,
    active: true,
    index: 2,
  });
  // Let the fire-and-forget inheritance IIFE settle.
  await new Promise((r) => setTimeout(r, 300));

  const bc = broadcastFor('tab/opener-inherited', preIdx);
  assert.ok(bc, 'opener-inheritance must emit a tab/opener-inherited broadcast');
  assert.equal(
    bc.payload.scope, SCOPE.ITEMS,
    'DO-4 / B-184: opener-inheritance appends a floating member + splices renderOrder — must route SCOPE.ITEMS so the new row lands under its opener',
  );
  /* No LIVE_STATE broadcast may carry this structural trigger. */
  const liveStateMistag = __getSendMessageCalls()
    .slice(preIdx)
    .map((args) => args[0])
    .find((m) => m && m.type === MSG_STATE_CHANGED && m.payload
      && m.payload.trigger === 'tab/opener-inherited' && m.payload.scope === SCOPE.LIVE_STATE);
  assert.equal(liveStateMistag, undefined, 'opener-inheritance must NEVER broadcast LIVE_STATE (the B-184 mis-tag)');
});

/* ── T4 — canonical MUTATION_BROADCASTS table is structural-correct ──────── */
test('B-190 T4: MUTATION_BROADCASTS maps every structural message type to a structural scope (source-text pin)', () => {
  /* Extract the MUTATION_BROADCASTS object body so we only assert against the
     classification table, not incidental matches elsewhere in the file. */
  const tableMatch = STORAGE_HANDLERS_SRC.match(/const MUTATION_BROADCASTS = \{([\s\S]*?)\n\};/);
  assert.ok(tableMatch, 'MUTATION_BROADCASTS table must be present');
  const table = tableMatch[1];

  /* Structural mutations → SCOPE.ITEMS (membership / renderOrder / item shape). */
  const itemsStructural = [
    'MSG_CREATE_ITEM', 'MSG_UPDATE_ITEM', 'MSG_DELETE_ITEM',
    'MSG_BULK_CREATE_ITEMS', 'MSG_BULK_DELETE_ITEMS', 'MSG_BULK_UPDATE_ITEMS',
    'MSG_BULK_REORDER_ITEMS', 'MSG_PROMOTE_TAB', 'MSG_DEMOTE_ITEM',
    'MSG_REORDER_FLOATING_MEMBERS', 'MSG_MOVE_FLOATING_TAB',
  ];
  for (const key of itemsStructural) {
    const re = new RegExp(`\\[${key}\\]:\\s*SCOPE\\.ITEMS`);
    assert.match(table, re, `${key} must map to SCOPE.ITEMS (structural)`);
  }

  /* Structural group mutations → SCOPE.GROUPS. */
  const groupsStructural = ['MSG_CREATE_GROUP', 'MSG_UPDATE_GROUP', 'MSG_DELETE_GROUP', 'MSG_BULK_REORDER_GROUPS'];
  for (const key of groupsStructural) {
    const re = new RegExp(`\\[${key}\\]:\\s*SCOPE\\.GROUPS`);
    assert.match(table, re, `${key} must map to SCOPE.GROUPS (structural)`);
  }

  /* No structural mutation may be tagged LIVE_STATE in the table. */
  assert.doesNotMatch(
    table, /SCOPE\.LIVE_STATE/,
    'No MUTATION_BROADCASTS entry may use SCOPE.LIVE_STATE — every storage write is structural',
  );
});

/* ── T5 — manual tab-event broadcast classification (positive + negative) ── */
test('B-190 T5: tab-events.js manual broadcasts — structural append uses ITEMS; live-only + removal-only stay LIVE_STATE (source-text pin)', () => {
  /* Positive: the one structural manual broadcast — opener-inheritance append. */
  assert.match(
    TAB_EVENTS_SRC, /broadcast\(\s*SCOPE\.ITEMS\s*,\s*'tab\/opener-inherited'/,
    'opener-inheritance must broadcast SCOPE.ITEMS',
  );
  /* Canary: no LIVE_STATE variant of the structural trigger may exist. */
  assert.doesNotMatch(
    TAB_EVENTS_SRC, /broadcast\(\s*SCOPE\.LIVE_STATE\s*,\s*'tab\/opener-inherited'/,
    'opener-inheritance must NOT broadcast LIVE_STATE (the B-184 mis-tag must never return)',
  );

  /* Negative / perf guard: genuinely live-status triggers must stay LIVE_STATE.
     Promoting any of these high-frequency events to a structural full-render
     would be a perf regression (§77.10 Risk-1). `tab/removed` is included
     deliberately: it is structural-by-data (the orphan-floating prune strips a
     renderOrder ref) but is a pure REMOVAL the incremental path handles
     correctly, and re-tagging it would full-render on every tab close — the
     §77.10 STOP-and-escalate case. */
  const liveOnlyTriggers = [
    'tab/favicon-changed', 'tab/audible-changed', 'tab/title-changed',
    'tab/updated', 'tab/created', 'tab/activated', 'tab/removed',
    'tab/attached', 'tab/moved',
  ];
  for (const trigger of liveOnlyTriggers) {
    const escaped = trigger.replace('/', '\\/');
    const live = new RegExp(`broadcast\\(\\s*SCOPE\\.LIVE_STATE\\s*,\\s*'${escaped}'`);
    assert.match(
      TAB_EVENTS_SRC, live,
      `${trigger} must stay SCOPE.LIVE_STATE (live-status / removal-only — promoting it would be a perf regression)`,
    );
  }
});
