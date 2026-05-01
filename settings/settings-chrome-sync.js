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

let _doc = null;
let _sendMessage = null;
let _btnEl = null;
let _toastEl = null;
let _toastMessageEl = null;
let _toastTimer = null;

const TOAST_AUTO_DISMISS_MS = 4000;

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
  if (!_btnEl) return; // fieldset not present — graceful no-op
  _btnEl.addEventListener('click', _onSyncClick);
}

async function _onSyncClick() {
  _btnEl.disabled = true;
  try {
    const win = await chrome.windows.getCurrent();
    const data = await _sendMessage(MSG_SYNC_TO_CHROME, { windowId: win.id });
    const summary = data && data.summary;
    if (!summary) {
      _showToast('Sync failed - no summary returned', 'error');
      return;
    }
    _showToast(_formatSummaryMessage(summary), summary.skipped.length > 0 ? 'partial' : 'ok');
  } catch (err) {
    const reason = (err && err.message) ? err.message : 'unknown error';
    _showToast(`Sync failed - ${reason}`, 'error');
  } finally {
    _btnEl.disabled = false;
  }
}

function _formatSummaryMessage(summary) {
  const groupCount = summary.groupsCreated + summary.groupsUpdated;
  const base = `Synced - ${summary.tabsReordered} tabs - ${groupCount} groups`;
  if (summary.skipped.length === 0) return base;
  const total = summary.skipped.reduce((acc, s) => acc + s.count, 0);
  return `${base} - ${total} skipped`;
}

function _showToast(message, variant) {
  if (!_toastEl || !_toastMessageEl) return;
  if (_toastTimer) {
    clearTimeout(_toastTimer);
    _toastTimer = null;
  }
  _toastMessageEl.textContent = message;
  _toastEl.dataset.variant = variant; // 'ok' | 'partial' | 'error'
  _toastEl.hidden = false;
  _toastTimer = setTimeout(() => {
    _toastEl.hidden = true;
    _toastEl.dataset.variant = '';
    _toastTimer = null;
  }, TOAST_AUTO_DISMISS_MS);
}
