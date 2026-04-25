/**
 * Tab Junkie service worker entry point.
 *
 * Responsibilities:
 *  - On SW cold start, run the migration pipeline: initialize partitions,
 *    evaluate schema version, run pending migrations, clean up legacy keys,
 *    and evaluate quota (B-001b).
 *  - Expose a module-level `readyPromise` gate. Resolves when migrations
 *    complete successfully (including safe-mode entry). Rejects with
 *    ERR_NOT_READY-class errors on corrupt schema or failed migrations.
 *  - Register the storage-handlers message dispatcher so UI surfaces can
 *    drive CRUD operations through `chrome.runtime.sendMessage`.
 *
 * Notes:
 *  - Service workers terminate and restart at any time. Any module-level
 *    state declared here (e.g. `readyPromise`, the txQueue anchor inside
 *    `write-transaction.js`, safe-mode flag in `migration.js`) is
 *    re-initialized on every cold start. That is by design — there is no
 *    in-memory state that needs to survive a restart for correctness.
 *  - No `console.log` debug noise; warn/error only on genuine failures.
 */

import { runMigrations } from './storage/migration.js';
import { registerStorageHandlers } from './messages/storage-handlers.js';
import { registerTabEventListeners, initializeLiveState } from './tabs/index.js';
import { MSG_OPEN_STANDALONE } from '../shared/messages.js';
import { openOrFocusSettingsTab } from '../shared/settings-tab.js';

/**
 * The readyPromise gate: resolves when the migration pipeline completes
 * (including safe-mode entry for downgrade scenarios). Rejects on corrupt
 * schema version or failed migrations, causing all pending messages to
 * receive ERR_NOT_READY.
 * @type {Promise<void>}
 */
export const readyPromise = runMigrations().catch((err) => {
  console.error('[tab-junkie] migration pipeline failed', err);
  throw err;
});

// MV3: event listeners must be registered synchronously at module scope,
// before the first await. registerTabEventListeners is synchronous — it
// only calls chrome.tabs.onX.addListener / chrome.windows.onRemoved.addListener.
registerTabEventListeners(readyPromise);

registerStorageHandlers(readyPromise);

// B-001c: build LiveTabIndex + reconcile TabClaims once storage is ready.
initializeLiveState(readyPromise).catch((err) => {
  console.error('[tab-junkie] live-state initialization failed', err);
});

// B-023 — chrome.commands.onCommand dispatch for Alt+K (group-jump).
// Per §40.3 D-2: swap default_popup to the group-jump surface, programmatically
// open it (Alt+K keypress is the user gesture required by chrome.action.openPopup),
// then restore the default popup so subsequent toolbar clicks still open B-022.
// Registered synchronously at module scope — no await before addListener (MV3).
// Touches zero storage; the popup itself fetches via MSG_LIST_ITEMS/MSG_LIST_GROUPS
// which are readyPromise-gated in the handlers.
//
// B-023-H2 fix: sync listener + promise chain (no `async`/`await`). The R2 spec
// §40.3 D-2 skeleton mandates the three-call sync-chain pattern so the SW is
// not left with `default_popup` pointed at group-jump if teardown happens mid-await.
// `.finally()` guarantees the restore runs whether openPopup resolves or rejects.
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'group-jump') return;
  chrome.action.setPopup({ popup: 'popup/group-jump-popup.html' });
  chrome.action.openPopup()
    .catch((err) => {
      console.warn('[tab-junkie] group-jump openPopup failed', err);
    })
    .finally(() => {
      chrome.action.setPopup({ popup: 'popup/popup.html' });
    });
});

// B-035 — chrome.commands.onCommand dispatch for Alt+Shift+J (open-junkie-window).
// Per §41.3 D-1/D-2/D-3/D-4: open (or focus) a standalone browser window of type
// "popup" that loads sidepanel/sidepanel.html verbatim. Existing-instance
// detection is per-trigger via chrome.windows.getAll + exact URL match against
// chrome.runtime.getURL('sidepanel/sidepanel.html') — cold-start safe (D-3 opt c).
// Registered synchronously at module scope — no await before addListener (MV3).
//
// C-11 is vacuously satisfied per §41.3 D-6: the listener performs ZERO SW-side
// storage writes on the open/focus path. If a future polish item adds any write
// (position persistence, open-history recency, etc.) it MUST fire BEFORE the
// focus-shifting chrome.windows.update({focused:true}) call and the §41 chapter
// MUST be updated to re-walk C-11.
//
// No new manifest permission required: chrome.windows.* is implicit under the
// existing "tabs" permission (D-7; B-014 precedent).
const STANDALONE_URL = chrome.runtime.getURL('sidepanel/sidepanel.html');
const STANDALONE_WIDTH = 1200;
const STANDALONE_HEIGHT = 800;

async function openOrFocusStandaloneWindow() {
  // D-3 option (c): per-trigger existing-instance detection; no SW state held.
  const popupWins = await chrome.windows.getAll({ populate: true, windowTypes: ['popup'] });
  const existing = popupWins.find((w) =>
    Array.isArray(w.tabs)
    && w.tabs.length === 1
    && typeof w.tabs[0].url === 'string'
    && w.tabs[0].url === STANDALONE_URL
  );
  if (existing) {
    // Focus-path (AC3): do NOT create; focus the existing window.
    await chrome.windows.update(existing.id, { focused: true });
    return;
  }

  // D-4: compute a centered position relative to the focused browser window's
  // rect. Avoids the `system.display` permission (not granted). If no focused
  // window is found (e.g., background-only profile), omit left/top and let the
  // browser pick defaults.
  const allWins = await chrome.windows.getAll({ populate: false });
  // Exclude popup-type windows from anchor computation — prevents a newly-created
  // standalone (popup) from becoming the anchor for its own centering (M-2).
  const realWins = allWins.filter((w) => w.type !== 'popup');
  const anchor = realWins.find((w) => w.focused) || realWins[0] || null;
  const left = anchor && typeof anchor.left === 'number' && typeof anchor.width === 'number'
    ? Math.max(0, anchor.left + Math.round((anchor.width - STANDALONE_WIDTH) / 2))
    : undefined;
  const top = anchor && typeof anchor.top === 'number' && typeof anchor.height === 'number'
    ? Math.max(0, anchor.top + Math.round((anchor.height - STANDALONE_HEIGHT) / 2))
    : undefined;

  // Open-path (AC2): create a new popup-type window hosting sidepanel.html.
  await chrome.windows.create({
    url: STANDALONE_URL,
    type: 'popup',
    focused: true,
    width: STANDALONE_WIDTH,
    height: STANDALONE_HEIGHT,
    ...(left !== undefined && top !== undefined ? { left, top } : {}),
  });
}

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'open-junkie-window') return;
  openOrFocusStandaloneWindow().catch((err) => {
    console.warn('[tab-junkie] open-junkie-window failed', err);
  });
});

// B-097 — chrome.commands.onCommand dispatch for Alt+Comma (open-junkie-settings).
// Opens (or focuses) the Settings page tab via the shared openOrFocusSettingsTab
// helper (focus-existing-else-create; same pattern as B-035 B-091). Cold-start
// safe: per-trigger tab query, no SW state held. Zero storage writes on this
// path → C-11 vacuously satisfied (no storage mutation before any focus-shifting
// call). Registered synchronously at module scope — no await before addListener.
chrome.commands.onCommand.addListener((cmd) => {
  if (cmd !== 'open-junkie-settings') return;
  openOrFocusSettingsTab().catch((err) => {
    console.warn('[B-097] settings shortcut failed:', err && err.message);
  });
});

// B-038 — MSG_OPEN_STANDALONE fire-and-forget handler.
// Per §43.3 D-1.3: the quick-search popup routes toolbar-click + Alt+J to the
// standalone window when displayMode === 'window' by firing this message
// (without awaiting — C-11 discipline) then calling window.close(). The SW-side
// handler is a simple pass-through that invokes openOrFocusStandaloneWindow().
// Registered synchronously at module scope — no await before addListener (MV3).
//
// C-11 vacuous on the SW side: zero storage writes on this path (same posture
// as the open-junkie-window command listener above). The popup side is where
// C-11 matters; see popup/popup.js.
//
// Sender validation matches the storage-handlers pattern (AC5 defense-in-depth):
// only messages from THIS extension's own origin are processed. Message type is
// NOT in the `tj/*` namespace so the storage-handlers dispatcher skips it —
// this listener is the sole handler.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object' || message.type !== MSG_OPEN_STANDALONE) {
    return false;
  }
  if (!sender || sender.id !== chrome.runtime.id) {
    return false;
  }
  openOrFocusStandaloneWindow().catch((err) => {
    console.warn('[tab-junkie] MSG_OPEN_STANDALONE failed', err);
  });
  // Fire-and-forget contract: popup doesn't wait on the response. Acknowledge
  // synchronously so Chrome tears down the message channel cleanly and no
  // "receiver did not respond" console warning fires in the caller's context.
  sendResponse({ ok: true });
  return false;
});
