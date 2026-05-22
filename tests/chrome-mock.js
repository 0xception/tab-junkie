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
  /** S42 R4 — set of tab IDs that chrome.tabs.move should reject with a
   *  Chrome-realistic "No tab with id: N" error so the per-tab fallback +
   *  _classifyError predicate are exercised end-to-end. */
  moveRejectIds: new Set(),
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
  /* B-134 §63.13.2 — chrome.tabs.move mock. Records the call (for spy
     assertions) and updates the in-memory mockTabs array's `index` fields
     to mimic Chrome's same-window reorder. Cross-window moves are out of
     scope for B-134 (rejected at sidepanel layer).

     B-136 — same-window moves now fire `chrome.tabs.onMoved` after the
     mockTabs index is updated AND sibling tabs are renumbered to match
     Chrome's actual shift behaviour. This lets tests exercise the full
     listener path end-to-end (background/tabs/tab-events.js onMoved).

     S42 R4 — `__setMoveRejectIds` lets a test mark specific tab IDs as
     "rejecting" for chrome.tabs.move; the mock throws an error string that
     matches the real Chrome rejection ("No tab with id: N") so the
     production _classifyError predicate is exercised end-to-end. */
  _moveCalls: [],
  async move(tabIds, props) {
    tabs._moveCalls.push({ tabIds, props });
    if (Array.isArray(tabIds)) {
      /* B-041 (S42) — multi-move support. Chrome moves the tabs en bloc to
         the target index in the order specified by the array; subsequent
         tabs in the destination shift right. The mock approximates this by
         performing per-tab moves to consecutive indices starting from
         props.index, in the order of the input array.

         S42 R4 — if the array contains any tab id flagged via
         __setMoveRejectIds, the bulk call rejects with a Chrome-realistic
         error so chrome-sync's per-tab fallback path runs. */
      for (let i = 0; i < tabIds.length; i++) {
        if (state.moveRejectIds.has(tabIds[i])) {
          throw new Error(`No tab with id: ${tabIds[i]}.`);
        }
      }
      const baseIndex = (props && typeof props.index === 'number') ? props.index : 0;
      const winId = (props && typeof props.windowId === 'number') ? props.windowId : null;
      const moved = [];
      for (let i = 0; i < tabIds.length; i++) {
        const tab = state.mockTabs.find((t) => t.id === tabIds[i]);
        if (!tab) throw new Error(`No tab with id: ${tabIds[i]}.`);
        const fromIndex = tab.index;
        const fromWindow = tab.windowId;
        const toIndex = baseIndex + i;
        const toWindow = winId ?? fromWindow;
        if (toWindow === fromWindow && toIndex !== fromIndex) {
          if (fromIndex < toIndex) {
            for (const t of state.mockTabs) {
              if (t.id === tab.id) continue;
              if (t.windowId !== fromWindow) continue;
              if (t.index > fromIndex && t.index <= toIndex) t.index -= 1;
            }
          } else {
            for (const t of state.mockTabs) {
              if (t.id === tab.id) continue;
              if (t.windowId !== fromWindow) continue;
              if (t.index >= toIndex && t.index < fromIndex) t.index += 1;
            }
          }
          tab.index = toIndex;
          tabs.onMoved.__fire(tab.id, { windowId: fromWindow, fromIndex, toIndex });
        } else {
          tab.index = toIndex;
          tab.windowId = toWindow;
        }
        moved.push(deepClone(tab));
      }
      return moved;
    }
    if (typeof tabIds !== 'number') return null;
    /* S42 R4 — per-tab fallback rejection hook. Chrome's actual error text
       for a missing tab is "No tab with id: N", so we mirror that here to
       exercise chrome-sync's _classifyError predicate end-to-end. */
    if (state.moveRejectIds.has(tabIds)) {
      throw new Error(`No tab with id: ${tabIds}.`);
    }
    const tab = state.mockTabs.find((t) => t.id === tabIds);
    if (!tab) {
      throw new Error(`No tab with id: ${tabIds}.`);
    }
    const fromIndex = tab.index;
    const fromWindowId = tab.windowId;
    let toIndex = fromIndex;
    let toWindowId = fromWindowId;
    if (props && typeof props.index === 'number') {
      toIndex = props.index;
    }
    if (props && typeof props.windowId === 'number') {
      toWindowId = props.windowId;
    }
    /* Same-window move — renumber siblings to match Chrome's shift. */
    if (toWindowId === fromWindowId && toIndex !== fromIndex) {
      if (fromIndex < toIndex) {
        for (const t of state.mockTabs) {
          if (t.id === tab.id) continue;
          if (t.windowId !== fromWindowId) continue;
          if (t.index > fromIndex && t.index <= toIndex) t.index -= 1;
        }
      } else {
        for (const t of state.mockTabs) {
          if (t.id === tab.id) continue;
          if (t.windowId !== fromWindowId) continue;
          if (t.index >= toIndex && t.index < fromIndex) t.index += 1;
        }
      }
      tab.index = toIndex;
      tabs.onMoved.__fire(tab.id, { windowId: fromWindowId, fromIndex, toIndex });
    } else {
      /* Cross-window move (rejected by drop-handler in production but the
         mock still records the index/windowId for completeness). */
      tab.index = toIndex;
      tab.windowId = toWindowId;
    }
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
  /* B-136: onMoved fires when a tab is moved within a window. The
     chrome.tabs.move mock above fires this event after renumbering the
     in-memory mockTabs to match Chrome's shift behaviour. Tests can also
     dispatch directly via tabs.onMoved.__fire(tabId, moveInfo). */
  onMoved: createEventMock(),
  /* B-164 §69.3.1 — onReplaced fires when Chromium rotates a tabId on
     discard/restore (empirically verified via Test A probe). The
     `__triggerOnReplaced(added, removed)` helper below is the test-side
     dispatch surface; production listener registers via
     chrome.tabs.onReplaced.addListener(handler). Tests can also call
     tabs.onReplaced.__fire(added, removed) directly per the existing
     createEventMock contract. */
  onReplaced: createEventMock(),
};

// ============================================================================
// B-041 (S42) — chrome.tabGroups + chrome.tabs.group/ungroup mock surface.
// ============================================================================

let _nextGroupId = 1000;
const _mockGroups = new Map(); // groupId -> { id, windowId, title, color, collapsed }

const TAB_GROUP_ID_NONE = -1;

// Add `group` and `ungroup` to the tabs object.
tabs.group = async function tabsGroup({ tabIds, groupId, createProperties }) {
  const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
  let gid = groupId;
  if (typeof gid !== 'number') {
    gid = _nextGroupId++;
    const winId = createProperties && createProperties.windowId;
    if (typeof winId !== 'number') {
      throw new Error('chrome.tabs.group: createProperties.windowId required for new group');
    }
    _mockGroups.set(gid, {
      id: gid,
      windowId: winId,
      title: '',
      color: 'grey',
      collapsed: false,
    });
  } else if (!_mockGroups.has(gid)) {
    throw new Error(`chrome.tabs.group: groupId ${gid} not found`);
  }
  for (const id of ids) {
    const t = state.mockTabs.find((x) => x.id === id);
    if (!t) throw new Error(`chrome.tabs.group: tab ${id} not found`);
    t.groupId = gid;
  }
  return gid;
};

tabs.ungroup = async function tabsUngroup(tabIds) {
  const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
  for (const id of ids) {
    const t = state.mockTabs.find((x) => x.id === id);
    if (t) t.groupId = TAB_GROUP_ID_NONE;
  }
};

const tabGroups = {
  TAB_GROUP_ID_NONE,
  async get(groupId) {
    const g = _mockGroups.get(groupId);
    if (!g) throw new Error(`chrome.tabGroups.get: groupId ${groupId} not found`);
    return deepClone(g);
  },
  async update(groupId, props) {
    const g = _mockGroups.get(groupId);
    if (!g) throw new Error(`chrome.tabGroups.update: groupId ${groupId} not found`);
    Object.assign(g, props);
    return deepClone(g);
  },
  async query(filter = {}) {
    const out = [];
    for (const g of _mockGroups.values()) {
      if (typeof filter.windowId === 'number' && g.windowId !== filter.windowId) continue;
      out.push(deepClone(g));
    }
    return out;
  },
  async remove(groupId) {
    _mockGroups.delete(groupId);
  },
  onCreated: createEventMock(),
  onUpdated: createEventMock(),
  onRemoved: createEventMock(),
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

/* B-164 §69.3.2 — minimal chrome.idle mock for the on-wake reconcile
   listener. `setDetectionInterval` records arg + supports a reject hook
   for graceful-degradation tests; `onStateChanged` is a standard
   createEventMock so tests dispatch via __fire('active'|'idle'|'locked')
   directly OR via the __triggerIdleState helper below. */
const idleState = {
  detectionInterval: null,
  setDetectionIntervalReject: false,
  setDetectionIntervalCalls: [],
};

const idle = {
  setDetectionInterval(seconds) {
    idleState.setDetectionIntervalCalls.push(seconds);
    if (idleState.setDetectionIntervalReject) {
      idleState.setDetectionIntervalReject = false;
      throw new Error('chrome.idle.setDetectionInterval failed');
    }
    idleState.detectionInterval = seconds;
  },
  onStateChanged: createEventMock(),
};

const chromeMock = {
  __tabJunkieTestMock: true,
  storage: { local: storageLocal, session: storageSession },
  runtime,
  tabs,
  tabGroups,
  windows,
  sidePanel,
  idle,
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
  state.moveRejectIds.clear();
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
  tabs.onMoved._listeners.length = 0;
  /* B-164 §69.3.1 — onReplaced listener cleanup. */
  tabs.onReplaced._listeners.length = 0;
  tabs._moveCalls.length = 0;
  /* B-164 §69.3.2 — chrome.idle state cleanup. */
  idleState.detectionInterval = null;
  idleState.setDetectionIntervalReject = false;
  idleState.setDetectionIntervalCalls.length = 0;
  idle.onStateChanged._listeners.length = 0;
  windows.onCreated._listeners.length = 0;
  windows.onRemoved._listeners.length = 0;
  windows.onFocusChanged._listeners.length = 0;
  /* B-091 */
  windowsUpdateCalls.length = 0;
  /* B-082 */
  sidePanelState.openReject = false;
  sidePanelState.openCalls = [];
  /* B-041 (S42) — clear tabGroups state. */
  _mockGroups.clear();
  _nextGroupId = 1000;
  tabGroups.onCreated._listeners.length = 0;
  tabGroups.onUpdated._listeners.length = 0;
  tabGroups.onRemoved._listeners.length = 0;
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

/** S42 R4 — flag tab IDs whose chrome.tabs.move calls should reject with
 *  a Chrome-realistic "No tab with id: N" error. Cleared on __resetMock. */
export function __setMoveRejectIds(tabIds) {
  state.moveRejectIds = new Set(tabIds);
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

/**
 * B-164 §69.3.1 — convenience helper to dispatch chrome.tabs.onReplaced.
 * Equivalent to `chrome.tabs.onReplaced.__fire(added, removed)`.
 *
 * @param {number} addedTabId
 * @param {number} removedTabId
 */
export function __triggerOnReplaced(addedTabId, removedTabId) {
  tabs.onReplaced.__fire(addedTabId, removedTabId);
}

/**
 * B-164 §69.3.2 — convenience helper to dispatch chrome.idle.onStateChanged.
 * Equivalent to `chrome.idle.onStateChanged.__fire(state)`.
 *
 * @param {'active'|'idle'|'locked'} state
 */
export function __triggerIdleState(state) {
  idle.onStateChanged.__fire(state);
}

/**
 * B-164 §69.3.2 — force the next chrome.idle.setDetectionInterval() to
 * throw, exercising the graceful-degradation path.
 *
 * @param {boolean} reject
 */
export function __setIdleSetDetectionIntervalReject(reject) {
  idleState.setDetectionIntervalReject = reject;
}

/**
 * B-164 §69.3.2 — recorded chrome.idle.setDetectionInterval() arguments,
 * for assertion of the R2-locked 60s interval choice.
 *
 * @returns {Array<number>}
 */
export function __getIdleSetDetectionIntervalCalls() {
  return [...idleState.setDetectionIntervalCalls];
}

// Install immediately on import so storage modules see chrome at load time.
installChromeMock();
