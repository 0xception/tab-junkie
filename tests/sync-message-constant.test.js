import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MSG_SYNC_TO_CHROME } from '../shared/messages.js';

test('MSG_SYNC_TO_CHROME constant is defined and uses tj/ namespace', () => {
  assert.equal(typeof MSG_SYNC_TO_CHROME, 'string');
  assert.match(MSG_SYNC_TO_CHROME, /^tj\//);
  assert.equal(MSG_SYNC_TO_CHROME, 'tj/syncToChrome');
});
