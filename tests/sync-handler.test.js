import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './_setup.js';
import { __resetMock, __setMockTabs, __setMockWindows } from './chrome-mock.js';
import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import { MSG_SYNC_TO_CHROME } from '../shared/messages.js';
import { createGroup } from '../background/storage/groups.js';
import { createItem } from '../background/storage/items.js';

beforeEach(() => {
  __resetMock();
});

function getListener() {
  const listeners = chrome.runtime.onMessage._listeners;
  return listeners[listeners.length - 1];
}

async function dispatchMessage(payload) {
  return await new Promise((resolve) => {
    getListener()(
      { type: MSG_SYNC_TO_CHROME, payload },
      { id: chrome.runtime.id },
      resolve,
    );
  });
}

test('MSG_SYNC_TO_CHROME dispatches to syncToChrome and returns ok envelope', async () => {
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([{ id: 11, windowId: 100, index: 0, url: 'https://a.example/' }]);
  const g = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: g.id, sortOrder: 0 });

  registerStorageHandlers(Promise.resolve());
  const resp = await dispatchMessage({ windowId: 100 });
  assert.equal(resp.ok, true);
  assert.equal(resp.data.summary.windowId, 100);
  assert.equal(resp.data.summary.groupsCreated, 1);
});

test('MSG_SYNC_TO_CHROME with non-numeric windowId returns error envelope', async () => {
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatchMessage({ windowId: 'abc' });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_VALIDATION');
});
