// Minimal chrome.storage.local mock for unit testing

export function createChromeMock() {
  let store = {};

  return {
    storage: {
      local: {
        get: (keys) => {
          return new Promise((resolve) => {
            if (typeof keys === 'string') keys = [keys];
            const result = {};
            for (const key of keys) {
              if (key in store) result[key] = store[key];
            }
            resolve(result);
          });
        },
        set: (items) => {
          return new Promise((resolve) => {
            Object.assign(store, items);
            resolve();
          });
        },
        getBytesInUse: () => {
          return new Promise((resolve) => {
            const size = JSON.stringify(store).length;
            resolve(size);
          });
        },
      },
      local_QUOTA_BYTES: 10485760, // 10 MB
    },
    _reset: () => { store = {}; },
    _getStore: () => ({ ...store }),
  };
}
