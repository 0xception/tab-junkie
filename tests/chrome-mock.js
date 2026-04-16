/**
 * Minimal chrome.* mock for the Tab Junkie storage layer tests.
 *
 * Provides in-memory chrome.storage.local, chrome.runtime, chrome.tabs.
 * Sets `chrome.__tabJunkieTestMock = true` so write-transaction.js bypasses
 * the ServiceWorkerGlobalScope guard (H5 test hatch).
 */

const state = {
  /** @type {Record<string, any>} */
  store: {},
  setCallCount: 0,
  /** If true, the next `set` rejects with a quota-like error. */
  quotaReject: false,
  /** Force arbitrary set rejection. */
  setError: null,
};

function deepClone(v) {
  if (v === null || typeof v !== 'object') return v;
  return JSON.parse(JSON.stringify(v));
}

const storageLocal = {
  async get(keys) {
    if (keys === null || keys === undefined) {
      return deepClone(state.store);
    }
    if (typeof keys === 'string') {
      const out = {};
      if (keys in state.store) out[keys] = deepClone(state.store[keys]);
      return out;
    }
    if (Array.isArray(keys)) {
      const out = {};
      for (const k of keys) {
        if (k in state.store) out[k] = deepClone(state.store[k]);
      }
      return out;
    }
    if (typeof keys === 'object') {
      const out = {};
      for (const k of Object.keys(keys)) {
        out[k] = k in state.store ? deepClone(state.store[k]) : keys[k];
      }
      return out;
    }
    return {};
  },
  async set(obj) {
    state.setCallCount += 1;
    if (state.quotaReject) {
      state.quotaReject = false;
      const e = new Error('QUOTA_BYTES quota exceeded');
      throw e;
    }
    if (state.setError) {
      const e = state.setError;
      state.setError = null;
      throw e;
    }
    for (const [k, v] of Object.entries(obj)) {
      state.store[k] = deepClone(v);
    }
  },
  async remove(keys) {
    const arr = Array.isArray(keys) ? keys : [keys];
    for (const k of arr) delete state.store[k];
  },
  async clear() {
    state.store = {};
  },
  async getBytesInUse(_keys) {
    return JSON.stringify(state.store).length;
  },
};

const runtime = {
  id: 'test-extension-id',
  lastError: null,
  onMessage: {
    _listeners: [],
    addListener(fn) { this._listeners.push(fn); },
    removeListener(fn) {
      const i = this._listeners.indexOf(fn);
      if (i >= 0) this._listeners.splice(i, 1);
    },
  },
};

const tabs = {
  async query() { return []; },
  async get() { return null; },
};

const chromeMock = {
  __tabJunkieTestMock: true,
  storage: { local: storageLocal },
  runtime,
  tabs,
};

export function installChromeMock() {
  globalThis.chrome = chromeMock;
  return chromeMock;
}

export function __resetMock() {
  state.store = {};
  state.setCallCount = 0;
  state.quotaReject = false;
  state.setError = null;
  runtime.lastError = null;
  runtime.onMessage._listeners = [];
}

export function __setCallCount() {
  return state.setCallCount;
}

export function __resetSetCallCount() {
  state.setCallCount = 0;
}

export function __triggerQuotaOnNextSet() {
  state.quotaReject = true;
}

export function __setRawStore(key, value) {
  state.store[key] = value;
}

export function __getRawStore(key) {
  return deepClone(state.store[key]);
}

/** Seed `tj:*` partition keys directly, bypassing validation. */
export function seedPartitions(partitions) {
  for (const [k, v] of Object.entries(partitions)) {
    const key = k.startsWith('tj:') ? k : `tj:${k}`;
    state.store[key] = deepClone(v);
  }
}

// Install immediately on import so storage modules see chrome at load time.
installChromeMock();
