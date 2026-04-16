/**
 * writeTransaction — the ONLY write path for Tab Junkie storage.
 *
 * Guarantees (R2 §8):
 *  - Atomicity: a single `chrome.storage.local.set({k1,k2,...})` commits all
 *    affected partitions or none. Chrome's storage API guarantees the set is
 *    applied as a whole.
 *  - Serialization (AC10): concurrent callers are chained through a
 *    module-level promise queue so call N's get/mutate/set runs strictly
 *    after call N-1's set resolves.
 *  - Crash safety: SW termination between get and set leaves pre-tx state
 *    untouched. Module-level txQueue is re-initialized on cold start — the
 *    queue only serializes in-flight callers within one SW lifetime, and
 *    that is the only window in which serialization matters.
 *  - Failure isolation: any mutator throw is wrapped as ERR_TX_CONFLICT and
 *    aborts the entire transaction before `set` is called. Quota rejections
 *    bubble as ERR_QUOTA_EXCEEDED.
 *
 * Direct `chrome.storage.local.set` calls anywhere else in `background/`
 * would violate AC6. All item/group/preferences writes route through here.
 */

import {
  StorageError,
  isQuotaError,
  ERR_TX_CONFLICT,
  ERR_QUOTA_EXCEEDED,
  ERR_DIRECT_WRITE,
} from './errors.js';
import { partitionKey, defaultShape, assertShape } from './partitions.js';

/**
 * Module-level serialization anchor. Re-initialized to a resolved promise
 * on every service-worker cold start (modules re-evaluate on cold start).
 * @type {Promise<unknown>}
 */
let txQueue = Promise.resolve();

/**
 * Non-exported telemetry hook for B-001b quota-warning work. Holds the most
 * recent `chrome.storage.local.getBytesInUse()` sample observed during a
 * write. Not surfaced to users in B-001a (per R2 §1 ruling).
 * @type {{ bytesInUse: number, at: number } | null}
 */
let lastQuotaSample = null;

/**
 * Test hatch (H5): the chrome-mock used by `tests/` sets a sentinel field
 * `chrome.__tabJunkieTestMock === true` so the guard below recognizes test
 * runs and permits writes without a real ServiceWorkerGlobalScope. Production
 * code paths never set this sentinel, so the hatch is inert at runtime.
 */
function isTestEnvironment() {
  return typeof chrome !== 'undefined'
    && chrome !== null
    && chrome.__tabJunkieTestMock === true;
}

/**
 * Guard for AC5 / AC6 runtime enforcement: the write path must only ever be
 * invoked inside the extension service-worker context. If the module somehow
 * loads elsewhere (ServiceWorkerGlobalScope absent), reject every write.
 */
function assertServiceWorkerContext() {
  if (isTestEnvironment()) return;
  // `self` exists in SW and window contexts, but `ServiceWorkerGlobalScope`
  // only exists as a global constructor in SW contexts. `chrome.runtime.id`
  // being present is an additional sanity check that we're inside the ext.
  const inSw = typeof ServiceWorkerGlobalScope !== 'undefined'
    && typeof self !== 'undefined'
    && self instanceof ServiceWorkerGlobalScope;
  const hasRuntime = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
  if (!inSw || !hasRuntime) {
    throw new StorageError(ERR_DIRECT_WRITE, 'writeTransaction invoked outside service worker');
  }
}

/**
 * @param {import('./partitions.js').TxOp[]} ops
 * @returns {Promise<void>}
 */
export function writeTransaction(ops) {
  const run = async () => {
    assertServiceWorkerContext();
    if (!Array.isArray(ops) || ops.length === 0) return;

    // 1. Collect unique namespaced keys for this transaction.
    const keys = [...new Set(ops.map((o) => partitionKey(o.partition)))];

    // 2. Single atomic get.
    let current;
    try {
      current = await chrome.storage.local.get(keys);
    } catch (e) {
      throw new StorageError(ERR_TX_CONFLICT, 'storage.get failed', e);
    }

    // 3. Apply mutators in declared order, seeding missing keys with defaults.
    const next = { ...current };
    for (const op of ops) {
      const k = partitionKey(op.partition);
      const input = next[k] ?? defaultShape(op.partition);
      try {
        next[k] = op.mutator(input);
      } catch (e) {
        if (e instanceof StorageError) throw e;
        throw new StorageError(ERR_TX_CONFLICT, e && e.message ? e.message : String(e), e);
      }
    }

    // 4. Validate post-mutation shapes — corrupt output never reaches storage.
    for (const k of keys) assertShape(k, next[k]);

    // 5. Single atomic set.
    try {
      await chrome.storage.local.set(next);
    } catch (e) {
      if (isQuotaError(e)) {
        throw new StorageError(ERR_QUOTA_EXCEEDED, 'chrome.storage.local quota exceeded', e);
      }
      throw new StorageError(ERR_TX_CONFLICT, 'storage.set failed', e);
    }

    // 6. Opportunistic telemetry sample for B-001b. Failure here must not
    // affect the successful commit above, so we swallow errors silently.
    try {
      const bytes = await chrome.storage.local.getBytesInUse(null);
      lastQuotaSample = { bytesInUse: bytes, at: Date.now() };
    } catch {
      // telemetry-only; ignore
    }
  };

  // Chain onto the queue. We want the next caller to wait for this one's
  // resolution regardless of outcome, so we attach the same `run` to both
  // the fulfilled and rejected branches — but only for queue continuity.
  // The returned promise `p` still carries the true outcome to the caller.
  const p = txQueue.then(run, run);
  txQueue = p.catch(() => {});
  return p;
}

/** Test/diagnostic hook — NOT exported from the barrel. */
export function _peekQuotaSample() {
  return lastQuotaSample;
}
