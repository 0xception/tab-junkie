/**
 * Typed storage error class and error-code constants.
 *
 * Every rejection from the storage layer is a `StorageError` instance with
 * a stable `code` drawn from the set below. See R2 §7 for the full taxonomy
 * and caller recovery guidance.
 */

export const ERR_NOT_READY = 'ERR_NOT_READY';
export const ERR_NOT_FOUND = 'ERR_NOT_FOUND';
export const ERR_DEPTH_EXCEEDED = 'ERR_DEPTH_EXCEEDED';
export const ERR_CIRCULAR_REF = 'ERR_CIRCULAR_REF';
export const ERR_DIRECT_WRITE = 'ERR_DIRECT_WRITE';
export const ERR_CORRUPT_DATA = 'ERR_CORRUPT_DATA';
// Intentionally unreachable — defensive reserved code for future collision
// detection. ULID generation is effectively collision-free, but keeping the
// code in the taxonomy lets callers pattern-match on it without a breaking
// change later (R2 §1, scrum-master ruling #5).
export const ERR_ID_COLLISION = 'ERR_ID_COLLISION';
export const ERR_QUOTA_EXCEEDED = 'ERR_QUOTA_EXCEEDED';
export const ERR_VALIDATION = 'ERR_VALIDATION';
export const ERR_TX_CONFLICT = 'ERR_TX_CONFLICT';
export const ERR_SAFE_MODE = 'ERR_SAFE_MODE';

export class StorageError extends Error {
  /**
   * @param {string} code   one of the ERR_* constants
   * @param {string} message
   * @param {unknown} [cause]
   */
  constructor(code, message, cause) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }

  /** Serialize to the wire envelope used by storage-handlers. */
  toJSON() {
    return { code: this.code, message: this.message };
  }
}

/**
 * Classifier for `chrome.storage.local.set` rejections. Chrome reports quota
 * failures via `chrome.runtime.lastError.message` containing "quota".
 * @param {unknown} err
 */
export function isQuotaError(err) {
  const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
  return /quota/i.test(msg);
}
