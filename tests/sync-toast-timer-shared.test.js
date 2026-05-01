/**
 * tests/sync-toast-timer-shared.test.js — Sprint 42 R4 H-2 [code].
 *
 * Pins the ghost-timer race fix: settings-chrome-sync.js and
 * settings-import-export.js both write to #settings-toast and previously
 * each owned its own _toastTimer setTimeout handle. A 4 s sync auto-dismiss
 * could fire after the user triggered a later import-export action and
 * hide the export toast mid-display.
 *
 * The fix: a shared single-owner timer in settings/settings-toast-timer.js.
 * armToastTimer() unconditionally cancels any pending timer (regardless of
 * which module armed it) before arming a fresh one. cancelToastTimer() is
 * idempotent and is called by the dismiss-button click in either module.
 *
 * These tests verify the property at the helper level (deterministic, no
 * brittle real-timer waits): two consecutive arm calls leave only ONE
 * pending timer, and cancel from either side clears it.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  armToastTimer, cancelToastTimer, _isTimerArmedForTest,
} from '../settings/settings-toast-timer.js';

beforeEach(() => {
  cancelToastTimer();
});

test('arm sets a pending timer; cancel clears it', () => {
  let fired = false;
  armToastTimer(() => { fired = true; }, 1000);
  assert.equal(_isTimerArmedForTest(), true);
  cancelToastTimer();
  assert.equal(_isTimerArmedForTest(), false);
  /* The original timer must NOT fire after a cancel. */
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(fired, false, 'cancelled timer must not fire');
      resolve();
    }, 30);
  });
});

test('a second arm cancels the pending first arm — only the second fires', async () => {
  /* This is the H-2 ghost-timer scenario: caller A arms a 4 s timer; a few
     ms later caller B arms a fresh timer. Without a shared owner, both
     would fire — A's would hide B's toast. With the shared helper, A's is
     cancelled when B arms. */
  let fireCountA = 0;
  let fireCountB = 0;
  armToastTimer(() => { fireCountA += 1; }, 50);
  /* Immediately re-arm without waiting — simulates the second module
     showing a new toast before the first's timer expires. */
  armToastTimer(() => { fireCountB += 1; }, 50);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(fireCountA, 0, 'first arm cancelled — must not fire');
  assert.equal(fireCountB, 1, 'second arm fires once');
  assert.equal(_isTimerArmedForTest(), false, 'no pending timer after fire');
});

test('cancel is idempotent — calling on no pending timer is a no-op', () => {
  cancelToastTimer();
  cancelToastTimer();
  cancelToastTimer();
  assert.equal(_isTimerArmedForTest(), false);
});

test('arm + arm + cancel — neither timer fires', async () => {
  let any = 0;
  armToastTimer(() => { any += 1; }, 30);
  armToastTimer(() => { any += 1; }, 30);
  cancelToastTimer();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(any, 0, 'no timer fires when explicitly cancelled');
});

test('a thrown callback inside the timer does not corrupt the armed state', async () => {
  let fired = 0;
  armToastTimer(() => {
    fired += 1;
    throw new Error('intentional');
  }, 20);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(fired, 1, 'callback ran exactly once even though it threw');
  assert.equal(_isTimerArmedForTest(), false, 'timer handle reset after fire');
  /* Re-arming after a throw still works. */
  armToastTimer(() => { fired += 1; }, 20);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(fired, 2, 'subsequent arm still fires');
});
