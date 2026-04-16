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
