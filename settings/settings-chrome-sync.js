/**
 * settings/settings-chrome-sync.js — Sprint 42 / B-041.
 *
 * Wires the "Sync this window to Chrome" button in the Settings page's
 * Chrome Integration fieldset. Captures chrome.windows.getCurrent().id at
 * click time, sends MSG_SYNC_TO_CHROME, renders the SyncSummary into the
 * existing #settings-toast surface. No new toast component — reuses the
 * B-093 / B-049 contract (one toast at a time, 4s auto-dismiss).
 *
 * Public API:
 *   init({ doc, sendMessage }) — locate the button + toast in `doc`, attach
 *   click handler. Graceful no-op when the button is absent (defensive: a
 *   future refactor that removes the fieldset must not crash the page).
 */

import { MSG_SYNC_TO_CHROME } from '../shared/messages.js';
/* B-041 (S42 R4 H-2 code) — shared single-owner toast auto-dismiss timer.
   Both this module and settings-import-export.js write to #settings-toast;
   without a shared timer, a 4 s sync auto-dismiss could hide a later
   import-export toast (and vice-versa). */
import { armToastTimer, cancelToastTimer } from './settings-toast-timer.js';

let _doc = null;
let _sendMessage = null;
let _btnEl = null;
let _btnOriginalText = '';
let _toastEl = null;
let _toastMessageEl = null;
let _toastDetailsEl = null;
let _toastDetailsListEl = null;

const TOAST_AUTO_DISMISS_MS = 4000;

/* B-041 (S42 §3.5 / AC8) — human-readable copy for each skip-reason bucket
   surfaced in the partial-toast "View details" expander. Singular vs plural
   forms only diverge for "tab" / "tabs". */
const _SKIP_REASON_LABEL = {
  pinned: { singular: 'pinned tab skipped', plural: 'pinned tabs skipped' },
  'tab-gone': { singular: 'tab closed mid-sync', plural: 'tabs closed mid-sync' },
  permission: { singular: 'permission denied', plural: 'permission denied' },
  unknown: { singular: 'unknown error', plural: 'unknown errors' },
};

/* B-041 (S42 R4 M-2 qa) — WCAG 1.4.1 (Use of Color, Level A) compliance.
   The three toast variants previously differed by 4 px left-border color
   only; sighted low-vision users had no non-color signal. A unicode glyph
   prefix carries the variant aurally and visually without depending on
   color. Applied via textContent (not innerHTML) — strings are static and
   not user-supplied. */
const _VARIANT_GLYPH = {
  ok: '✓ ',       // U+2713 CHECK MARK
  partial: '⚠ ',  // U+26A0 WARNING SIGN
  error: '✗ ',    // U+2717 BALLOT X
};

/**
 * Initialize the Chrome Integration sync button + toast wiring.
 *
 * @param {{ doc: Document, sendMessage: (type: string, payload?: object) => Promise<any> }} args
 */
export function init({ doc, sendMessage }) {
  if (!doc || typeof sendMessage !== 'function') {
    throw new Error('settings-chrome-sync init: doc + sendMessage required');
  }
  _doc = doc;
  _sendMessage = sendMessage;
  _btnEl = doc.getElementById('settings-sync-chrome-btn');
  _toastEl = doc.getElementById('settings-toast');
  _toastMessageEl = doc.getElementById('settings-toast-message');
  _toastDetailsEl = doc.getElementById('settings-toast-details');
  _toastDetailsListEl = doc.getElementById('settings-toast-details-list');
  if (!_btnEl) return; // fieldset not present — graceful no-op
  _btnOriginalText = _btnEl.textContent;
  _btnEl.addEventListener('click', _onSyncClick);
}

async function _onSyncClick() {
  /* B-041 (S42 R4 H-1 qa) — visible + assistive-tech in-flight feedback.
     aria-busy + button-text swap; reset in finally so any throw still
     restores the original state. */
  _btnEl.disabled = true;
  _btnEl.setAttribute('aria-busy', 'true');
  _btnEl.textContent = 'Syncing…';
  try {
    const win = await chrome.windows.getCurrent();
    const data = await _sendMessage(MSG_SYNC_TO_CHROME, { windowId: win.id });
    const summary = data && data.summary;
    if (!summary) {
      _showToast({ message: 'Sync failed - no summary returned', variant: 'error' });
      return;
    }
    const variant = summary.skipped.length > 0 ? 'partial' : 'ok';
    _showToast({
      message: _formatSummaryMessage(summary),
      variant,
      skipped: summary.skipped,
    });
  } catch (err) {
    const reason = (err && err.message) ? err.message : 'unknown error';
    _showToast({ message: `Sync failed - ${reason}`, variant: 'error' });
  } finally {
    _btnEl.disabled = false;
    _btnEl.removeAttribute('aria-busy');
    _btnEl.textContent = _btnOriginalText;
  }
}

function _formatSummaryMessage(summary) {
  const groupCount = summary.groupsCreated + summary.groupsUpdated;
  const base = `Synced - ${summary.tabsReordered} tabs - ${groupCount} groups`;
  if (summary.skipped.length === 0) return base;
  const total = summary.skipped.reduce((acc, s) => acc + s.count, 0);
  return `${base} - ${total} skipped`;
}

/* B-041 (S42 §3.5 / AC8) — render one human-readable line per skip reason
   for the partial-toast "View details" expander. Numeric counts and a fixed
   enum keep this safe under textContent — no user-controlled strings. */
function _skipReasonLine({ reason, count }) {
  const labels = _SKIP_REASON_LABEL[reason]
    ?? { singular: `${reason}`, plural: `${reason}` };
  const word = count === 1 ? labels.singular : labels.plural;
  return `${count} ${word}`;
}

function _showToast({ message, variant, skipped }) {
  if (!_toastEl || !_toastMessageEl) return;
  /* H-2: a single shared timer is owned by settings-toast-timer.js. Calling
     cancel + arm here also cancels any pending import-export auto-dismiss,
     guaranteeing this toast gets its full 4-second window. */
  cancelToastTimer();
  /* M-2: prepend the variant glyph so the variant is signalled via text
     (and thus to screen readers + low-vision users) rather than by color
     alone. The glyph map is exhaustive over the three variants the toast
     supports; an unknown variant falls through to no prefix. */
  const glyph = _VARIANT_GLYPH[variant] ?? '';
  _toastMessageEl.textContent = glyph + message;
  _toastEl.dataset.variant = variant; // 'ok' | 'partial' | 'error'
  /* B-041 AC8 — populate the View-details expander only on partial variant
     with at least one skip entry; otherwise hide + clear the list. The
     expander always starts collapsed so the toast renders single-line by
     default; clicking "View details" expands the per-reason breakdown. */
  if (_toastDetailsEl && _toastDetailsListEl) {
    _toastDetailsListEl.replaceChildren();
    if (variant === 'partial' && Array.isArray(skipped) && skipped.length > 0) {
      for (const entry of skipped) {
        const li = _doc.createElement('li');
        li.className = 'toast-details-item';
        li.textContent = _skipReasonLine(entry);
        _toastDetailsListEl.appendChild(li);
      }
      _toastDetailsEl.open = false;
      _toastDetailsEl.hidden = false;
    } else {
      _toastDetailsEl.open = false;
      _toastDetailsEl.hidden = true;
    }
  }
  _toastEl.hidden = false;
  armToastTimer(() => {
    _toastEl.hidden = true;
    _toastEl.dataset.variant = '';
    if (_toastDetailsEl) {
      _toastDetailsEl.open = false;
      _toastDetailsEl.hidden = true;
    }
  }, TOAST_AUTO_DISMISS_MS);
}
