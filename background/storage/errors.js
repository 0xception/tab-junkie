/**
 * Typed storage error class and error-code constants.
 *
 * Canonical definitions now live in shared/errors.js. This file re-exports
 * everything so existing background/ imports continue to work unchanged.
 */

export {
  ERR_NOT_READY,
  ERR_NOT_FOUND,
  ERR_DEPTH_EXCEEDED,
  ERR_CIRCULAR_REF,
  ERR_DIRECT_WRITE,
  ERR_CORRUPT_DATA,
  ERR_ID_COLLISION,
  ERR_QUOTA_EXCEEDED,
  ERR_VALIDATION,
  ERR_TX_CONFLICT,
  ERR_SAFE_MODE,
  ERR_DUPLICATE_URL,
  StorageError,
  isQuotaError,
} from '../../shared/errors.js';
