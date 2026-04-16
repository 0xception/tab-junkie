/**
 * Tab Junkie service worker entry point.
 *
 * Responsibilities in B-001a:
 *  - On SW startup (cold or warm), initialize any missing storage partitions
 *    with their default empty shapes. Idempotent (AC1).
 *  - Expose a module-level `readyPromise` gate. In B-001a this is a stub
 *    that resolves as soon as partition init completes. B-001b replaces it
 *    with a migration-gated promise that can reject (ERR_NOT_READY).
 *  - Register the storage-handlers message dispatcher so UI surfaces can
 *    drive CRUD operations through `chrome.runtime.sendMessage`.
 *
 * Notes:
 *  - Service workers terminate and restart at any time. Any module-level
 *    state declared here (e.g. `readyPromise`, the txQueue anchor inside
 *    `write-transaction.js`) is re-initialized on every cold start. That is
 *    by design — there is no in-memory state that needs to survive a restart
 *    for correctness.
 *  - No `console.log` debug noise; warn/error only on genuine failures.
 */

import { initializePartitions } from './storage/index.js';
import { registerStorageHandlers } from './messages/storage-handlers.js';

/**
 * The B-001a stub readyPromise: resolves as soon as partition init finishes.
 * This will be replaced by the B-001b migration-gated promise that can
 * legitimately reject with ERR_NOT_READY while migrations run or fail.
 * @type {Promise<void>}
 */
export const readyPromise = initializePartitions().catch((err) => {
  console.error('[tab-junkie] partition init failed', err);
  throw err;
});

registerStorageHandlers(readyPromise);
