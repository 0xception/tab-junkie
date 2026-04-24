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
