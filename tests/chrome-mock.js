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
  /** If set, getBytesInUse returns this value instead of computing. */
  bytesInUseOverride: null,
  /** @type {Record<string, any>} session storage (chrome.storage.session) */
  sessionStore: {},
  /** @type {Array<{id: number, url: string, windowId: number, active: boolean, audible: boolean}>} */
  mockTabs: [],
  /** @type {Array<{id: number}>} B-014 — window-ordinal test fixtures */
  mockWindows: [],
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
    if (state.bytesInUseOverride !== null) return state.bytesInUseOverride;
    return JSON.stringify(state.store).length;
  },
  QUOTA_BYTES: 5242880,
};

/**
 * In-memory chrome.storage.session mock.
 */
const storageSession = {
  async get(keys) {
    if (keys === null || keys === undefined) {
      return deepClone(state.sessionStore);
    }
    if (typeof keys === 'string') {
      const out = {};
      if (keys in state.sessionStore) out[keys] = deepClone(state.sessionStore[keys]);
      return out;
    }
    if (Array.isArray(keys)) {
      const out = {};
      for (const k of keys) {
        if (k in state.sessionStore) out[k] = deepClone(state.sessionStore[k]);
      }
      return out;
    }
    if (typeof keys === 'object') {
      const out = {};
      for (const k of Object.keys(keys)) {
        out[k] = k in state.sessionStore ? deepClone(state.sessionStore[k]) : keys[k];
      }
      return out;
    }
    return {};
  },
  async set(obj) {
    for (const [k, v] of Object.entries(obj)) {
      state.sessionStore[k] = deepClone(v);
    }
  },
  async remove(keys) {
    const arr = Array.isArray(keys) ? keys : [keys];
    for (const k of arr) delete state.sessionStore[k];
  },
  async clear() {
    state.sessionStore = {};
  },
};

/**
 * Create an event-emitter mock compatible with chrome.* event APIs.
 * Supports addListener, removeListener, and __fire for programmatic dispatch.
 */
function createEventMock() {
  const listeners = [];
  return {
    _listeners: listeners,
    addListener(fn) { listeners.push(fn); },
    removeListener(fn) {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    __fire(...args) {
      for (const fn of listeners) fn(...args);
    },
  };
}

/** @type {Array<any[]>} recorded sendMessage calls for spy assertions */
const sendMessageCalls = [];

const runtime = {
  id: 'test-extension-id',
  lastError: null,
  sendMessage(...args) { sendMessageCalls.push(args); return Promise.resolve(); },
  /* B-091: extension-page surfaces (settings/, newtab/, popup/) call
     chrome.runtime.getURL to resolve their own page paths. Mock returns a
     deterministic chrome-extension://-style URL that the chrome.tabs.query
     `url` filter can match against. */
  getURL(path) { return `chrome-extension://test-extension-id/${path}`; },
  onMessage: {
    _listeners: [],
    addListener(fn) { this._listeners.push(fn); },
    removeListener(fn) {
      const i = this._listeners.indexOf(fn);
      if (i >= 0) this._listeners.splice(i, 1);
    },
  },
};

let _nextTabId = 1000;

const tabs = {
  async query(filter) {
    let result = state.mockTabs;
    if (filter && typeof filter === 'object') {
      if ('windowId' in filter) {
        result = result.filter((t) => t.windowId === filter.windowId);
      }
      if ('active' in filter) {
        result = result.filter((t) => t.active === filter.active);
      }
      if ('url' in filter) {
        // B-091 §44.3 D-2: dispatcher uses chrome.tabs.query({url}). Real
        // Chrome accepts a string or an array (with optional wildcards); the
        // mock supports exact match on the string form, sufficient for the
        // settings-page dispatcher tests.
        const wanted = filter.url;
        if (typeof wanted === 'string') {
          result = result.filter((t) => t.url === wanted);
        } else if (Array.isArray(wanted)) {
          result = result.filter((t) => wanted.includes(t.url));
        }
      }
    }
    return deepClone(result);
  },
  async get(tabId) {
    const tab = state.mockTabs.find((t) => t.id === tabId);
    return tab ? deepClone(tab) : null;
  },
  async update(tabId, props) {
    const tab = state.mockTabs.find((t) => t.id === tabId);
    if (!tab) throw new Error(`Tab ${tabId} not found`);
    Object.assign(tab, props);
    return deepClone(tab);
  },
  async create({ url }) {
    const id = _nextTabId++;
    const tab = { id, url: url || '', windowId: 1, active: true, audible: false, index: state.mockTabs.length };
    state.mockTabs.push(tab);
    return deepClone(tab);
  },
  async remove(tabIds) {
    const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
    for (const id of ids) {
      const idx = state.mockTabs.findIndex((t) => t.id === id);
      if (idx >= 0) state.mockTabs.splice(idx, 1);
    }
  },
  onCreated: createEventMock(),
  onUpdated: createEventMock(),
  onActivated: createEventMock(),
  onRemoved: createEventMock(),
  /* B-014 H-3: onDetached / onAttached fire when a tab is dragged between
     windows. Chrome does NOT fire onUpdated for this motion. */
  onDetached: createEventMock(),
  onAttached: createEventMock(),
};

/* B-091: track windows.update calls so dispatcher tests can assert
   focus-existing-tab path. */
const windowsUpdateCalls = [];

const windows = {
  WINDOW_ID_NONE: -1,
  async update(windowId, props) {
    windowsUpdateCalls.push({ windowId, props });
    return { id: windowId };
  },
  /* B-014: window-ordinal tests seed `state.mockWindows` via __setMockWindows. */
  async getAll(_opts) {
    return deepClone(state.mockWindows);
  },
  async getCurrent() {
    // First entry, if any — otherwise a synthetic id
    if (state.mockWindows.length > 0) return deepClone(state.mockWindows[0]);
    return { id: 1 };
  },
  onCreated: createEventMock(),
  onRemoved: createEventMock(),
  onFocusChanged: createEventMock(),
};

/** B-082: minimal chrome.sidePanel mock for popup side-panel button tests. */
const sidePanelState = {
  /** If true, the next chrome.sidePanel.open() rejects. */
  openReject: false,
  openCalls: [],
};

const sidePanel = {
  async open(options) {
    sidePanelState.openCalls.push(options);
    if (sidePanelState.openReject) {
      sidePanelState.openReject = false;
      throw new Error('sidePanel.open failed');
    }
  },
};

const chromeMock = {
  __tabJunkieTestMock: true,
  storage: { local: storageLocal, session: storageSession },
  runtime,
  tabs,
  windows,
  sidePanel,
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
  state.bytesInUseOverride = null;
  state.sessionStore = {};
  state.mockTabs = [];
  state.mockWindows = [];
  _nextTabId = 1000;
  runtime.lastError = null;
  runtime.onMessage._listeners = [];
  sendMessageCalls.length = 0;
  tabs.onCreated._listeners.length = 0;
  tabs.onUpdated._listeners.length = 0;
  tabs.onActivated._listeners.length = 0;
  tabs.onRemoved._listeners.length = 0;
  tabs.onDetached._listeners.length = 0;
  tabs.onAttached._listeners.length = 0;
  windows.onCreated._listeners.length = 0;
  windows.onRemoved._listeners.length = 0;
  windows.onFocusChanged._listeners.length = 0;
  /* B-091 */
  windowsUpdateCalls.length = 0;
  /* B-082 */
  sidePanelState.openReject = false;
  sidePanelState.openCalls = [];
}

/** B-082: force the next chrome.sidePanel.open() to reject. */
export function __setSidePanelOpenReject(reject) {
  sidePanelState.openReject = reject;
}

/** B-082: return recorded chrome.sidePanel.open() calls. */
export function __getSidePanelOpenCalls() {
  return [...sidePanelState.openCalls];
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

export function __setBytesInUse(n) {
  state.bytesInUseOverride = n;
}

/** Set mock tabs returned by chrome.tabs.query. */
export function __setMockTabs(tabs) {
  state.mockTabs = deepClone(tabs);
}

/** B-091: return recorded chrome.windows.update() calls. */
export function __getWindowsUpdateCalls() {
  return [...windowsUpdateCalls];
}

/** B-014: seed the windows returned by chrome.windows.getAll(). */
export function __setMockWindows(wins) {
  state.mockWindows = deepClone(wins);
}

/** Seed session storage keys directly. */
export function __setSessionStore(key, value) {
  state.sessionStore[key] = deepClone(value);
}

/** Read a session storage key directly. */
export function __getSessionStore(key) {
  return deepClone(state.sessionStore[key]);
}

/** Return recorded sendMessage calls for spy assertions. */
export function __getSendMessageCalls() {
  return sendMessageCalls;
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
