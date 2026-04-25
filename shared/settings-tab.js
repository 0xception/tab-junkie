/**
 * settings-tab.js — Shared Settings page tab dispatcher (B-097).
 *
 * Exports a single function used by three callers:
 *   1. sidepanel/sidepanel.js  — gear-button click handler (B-091)
 *   2. popup/popup.js          — Settings button click handler (B-095)
 *   3. background/service-worker.js — Alt+Comma keyboard shortcut (B-097)
 *
 * Focus-existing-else-create pattern (same as B-035 §41 D-3 (c)):
 *   • If a Settings tab is already open → focus it (tabs.update + windows.update).
 *   • Otherwise → create a new tab (tabs.create).
 *
 * C-11 note: callers in popup.js MUST NOT await this function before
 * calling window.close() — use `openOrFocusSettingsTab().catch(() => {})`
 * (fire-and-forget) so the popup is not torn down mid-await. The SW and
 * sidepanel callers may await normally.
 *
 * No console.log debug noise — warn only on genuine failures.
 */

/**
 * Open or focus the Settings page tab.
 *
 * @returns {Promise<void>} resolves when dispatch completes
 */
export async function openOrFocusSettingsTab() {
  const url = chrome.runtime.getURL('settings/settings.html');
  try {
    const tabs = await chrome.tabs.query({ url });
    if (tabs && tabs.length > 0) {
      const t = tabs[0];
      await chrome.tabs.update(t.id, { active: true });
      if (t.windowId != null) {
        await chrome.windows.update(t.windowId, { focused: true });
      }
      return;
    }
    await chrome.tabs.create({ url });
  } catch (err) {
    console.warn('[settings-tab] dispatcher failed:', err && err.message);
    throw err;
  }
}
