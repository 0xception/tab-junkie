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
/* B-041 (S42 §3.5) — Chrome Integration single-button surface. Wires the
   Sync button → SW → result toast. */
import { init as initChromeSync } from './settings-chrome-sync.js';
import { MSG_GET_PREFERENCES, MSG_STATE_CHANGED } from '../shared/messages.js';
import { SCOPE } from '../shared/scopes.js';
/* B-088 fix #1 — Live theme application is shared with sidepanel/newtab/popup
   via shared/surface-prefs.js. The settings page subscribes to
   MSG_STATE_CHANGED below so theme changes from any other surface (or this
   page) apply within 500 ms (B-037 §45.3 D-4 / AC10(a)). */
import { applyTheme as _applyTheme } from '../shared/surface-prefs.js';

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

  // B-037 theme select — 13 slugs grouped under three optgroups (Auto / Light
  // / Dark) per §45.3 D-1 + D-6. Section name "Theme" matches the static
  // <fieldset data-section="Theme"> placeholder slot that B-091 reserved.
  renderSelect({
    key: 'theme',
    label: 'Theme',
    section: 'Theme',
    optgroups: [
      { label: 'Auto', options: [
        { value: 'system', label: 'System Default' },
      ]},
      { label: 'Light', options: [
        { value: 'github-light',    label: 'GitHub Light' },
        { value: 'tomorrow',        label: 'Tomorrow' },
        { value: 'atom-one-light',  label: 'Atom One Light' },
        { value: 'solarized-light', label: 'Solarized Light' },
      ]},
      { label: 'Dark', options: [
        { value: 'github-dark',     label: 'GitHub Dark' },
        { value: 'tomorrow-night',  label: 'Tomorrow Night' },
        { value: 'atom-one-dark',   label: 'Atom One Dark' },
        { value: 'solarized-dark',  label: 'Solarized Dark' },
        { value: 'dracula',         label: 'Dracula' },
        { value: 'nord',            label: 'Nord' },
        { value: 'one-dark',        label: 'One Dark' },
        { value: 'monokai',         label: 'Monokai' },
        { value: 'tokyo-night',     label: 'Tokyo Night' },
      ]},
    ],
    defaultValue: 'system',
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

  /* B-041 (S42) — Chrome Integration: Sync button.
     Single-click, snapshot push to chrome.tabs + chrome.tabGroups.
     Result is rendered via the existing #settings-toast surface. */
  try {
    initChromeSync({ doc: document, sendMessage });
  } catch (err) {
    const code = err && err.code ? String(err.code) : 'NO_CODE';
    console.warn('[B-041] settings chrome-sync wiring failed', code);
  }

  /* B-037 — listen for prefs broadcast and re-apply the theme. The
     settings-fields module already subscribes to refresh control values;
     this listener runs in parallel so the page repaints alongside the
     control re-sync (well within the 500 ms AC10(a) budget). */
  if (chrome?.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener((msg, sender) => {
      if (!sender || sender.id !== chrome.runtime.id) return;
      if (!msg || msg.type !== MSG_STATE_CHANGED) return;
      const scope = msg.payload && msg.payload.scope;
      if (scope !== SCOPE.PREFERENCES) return;
      sendMessage(MSG_GET_PREFERENCES).then((prefs) => {
        if (prefs && typeof prefs.theme === 'string') _applyTheme(prefs.theme);
      }).catch(() => { /* best-effort; next broadcast retries */ });
    });
  }

  // Fetch + paint. On success → focus first control. On error → focus Reload.
  try {
    const prefs = await loadPreferences();
    if (prefs && typeof prefs.theme === 'string') _applyTheme(prefs.theme);
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
