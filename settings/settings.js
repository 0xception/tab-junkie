/**
 * settings/settings.js — B-091 Settings page bootstrap (§44.3 D-2 + D-3).
 *
 * Lifecycle:
 *   1. DOMContentLoaded → fetch DOM refs.
 *   2. settings-fields.init({ contentEl, errorEl, sendMessage, runtime })
 *      attaches the broadcast subscription (sender-id-validated, scope=prefs).
 *   3. Register Wave 0 controls — B-038 displayMode + B-040 autoCollapseSubGroups.
 *   4. loadPreferences() round-trip:
 *        success → focus first focusable control.
 *        failure → show top banner + focus Reload button.
 *   5. Reload button click → location.reload().
 *
 * Tab close GCs the JS realm (no explicit removeListener required — §44.3 D-5).
 */

import { renderSelect, renderToggle, init as initSettingsFields, loadPreferences, showPageError, getFirstFocusableControl, disableAllControls } from './settings-fields.js';
/* B-093: relocated import / export controls. The module wires the four
   buttons + two file inputs in the Data section + the destructive-action
   confirm dialog (B-070 §AC4 retained). */
import { init as initImportExport } from './settings-import-export.js';

/* =========================================================================
   Promise wrapper around chrome.runtime.sendMessage. Same shape as the
   sidepanel + newtab helpers — caller throws on !resp.ok with an Error that
   carries `.code` when the SW supplied one. The forked field module relies
   on this contract for its ERR_SAFE_MODE branch.
   ========================================================================= */

async function sendMessage(type, payload = {}) {
  const resp = await chrome.runtime.sendMessage({ type, payload });
  if (!resp || !resp.ok) {
    const err = new Error(resp?.error?.message ?? 'No response from service worker');
    if (resp?.error?.code) err.code = resp.error.code;
    throw err;
  }
  return resp.data;
}

/* =========================================================================
   Bootstrap on DOMContentLoaded.
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  void boot();
});

async function boot() {
  const contentEl = document.getElementById('settings-content');
  const errorBannerEl = document.getElementById('settings-error-banner');
  const reloadBtnEl = document.getElementById('settings-reload-btn');

  // Reload button — always wired (the banner is hidden until a load failure
  // surfaces it; the click handler is harmless if invoked spuriously).
  if (reloadBtnEl) {
    reloadBtnEl.addEventListener('click', () => {
      location.reload();
    });
  }

  // Initialise the field-helper module with the page's DOM + transport refs.
  initSettingsFields({
    contentEl,
    errorEl: errorBannerEl,
    sendMessage,
    runtime: chrome.runtime,
  });

  // Wave 0 controls — registered AFTER init so the broadcast listener is
  // attached when the registry mutates. Section names match the static
  // <fieldset data-section="..."> blocks in settings.html so the rows append
  // into the existing scaffold.
  //
  // B-038 displayMode select — renamed copy from §43.7 to use the more
  // user-friendly "Open Tab Junkie on click" label per B-091 R3 contract.
  renderSelect({
    key: 'displayMode',
    label: 'Open Tab Junkie on click',
    section: 'Display',
    options: [
      { value: 'sidepanel', label: 'Side panel' },
      { value: 'window', label: 'Standalone window' },
    ],
    defaultValue: 'sidepanel',
  });

  // B-040 autoCollapseSubGroups toggle — section name is "Groups" (matches
  // both the canonical pref key capitalisation and the static fieldset).
  renderToggle({
    key: 'autoCollapseSubGroups',
    label: 'Auto-collapse sub-groups when parent collapses',
    section: 'Groups',
    defaultValue: false,
  });

  // B-092 denseLayout toggle — opt-in compact rendering across all three
  // surfaces (sidepanel / newtab / standalone window). Section name "Layout"
  // matches the static <fieldset data-section="Layout"> in settings.html.
  renderToggle({
    key: 'denseLayout',
    label: 'Compact layout',
    section: 'Layout',
    defaultValue: false,
  });

  // B-093 — Import / Export controls in the Data section. The module wires
  // its own DOM (4 buttons + 2 hidden file inputs + confirm dialog overlay
  // + toast); we just hand it the document and the shared sendMessage
  // transport so it round-trips through the same SW path.
  try {
    initImportExport({ doc: document, sendMessage });
  } catch (err) {
    /* Non-blocking: a wiring failure should not block the prefs surface.
       Log code only — never PII. */
    const code = err && err.code ? String(err.code) : 'NO_CODE';
    console.warn('[B-093] settings import/export wiring failed', code);
  }

  // Fetch + paint. On success → focus first control. On error → focus Reload.
  try {
    await loadPreferences();
    const first = getFirstFocusableControl();
    if (first && typeof first.focus === 'function') {
      first.focus({ preventScroll: false });
    }
  } catch (err) {
    // HIGH-1 / AC10(a): keep all controls disabled until the user reloads.
    // _buildFieldDom builds inputs `disabled=true`; loadPreferences re-enables
    // on success. On failure, controls were never re-enabled — but be explicit
    // so a future change to the build-time default cannot silently regress.
    disableAllControls();
    // showPageError is the sole write path for the banner text (HIGH-2: the
    // previous "redundant safety net" double-write is removed).
    showPageError('Could not load settings — try reloading.');
    if (reloadBtnEl && typeof reloadBtnEl.focus === 'function') {
      reloadBtnEl.focus();
    }
    // Surface the SW error code for debugging without leaking title/URL data.
    console.warn('[B-091] settings prefs load failed', err && err.code ? err.code : 'no code');
  }
}
