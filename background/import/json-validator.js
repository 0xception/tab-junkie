/**
 * B-045 JSON backup validator — STUB (scope-deferred).
 *
 * Sprint 18 Wave 3 ships ONLY B-044 (Netscape HTML import). This file is a
 * deliberate placeholder so the dispatcher in `index.js` can reference the
 * symbol without a module-not-found error. The real implementation lands in
 * Wave 4 (B-045) on a separate feature branch.
 *
 * R4 reviewers: this stub is NOT unreviewed production code. Calling it is
 * an error by design — the dispatcher routes away from this path at v1 and
 * the message handler's payload validator rejects `format: 'json'` until
 * B-045 flips the switch.
 */

import { StorageError, ERR_INVALID_FORMAT } from '../../shared/errors.js';

/**
 * @returns {never}
 */
export function validateAndRepair(/* rootObject */) {
  throw new StorageError(
    ERR_INVALID_FORMAT,
    'JSON import is not yet supported (B-045 — Sprint 18 Wave 4).',
  );
}
