import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock } from './chrome-mock.js';
import { createItem, createGroup, ERR_VALIDATION } from '../background/storage/index.js';

beforeEach(() => __resetMock());

function longStr(n) { return 'a'.repeat(n); }

test('H1: title > 2048 chars → ERR_VALIDATION', async () => {
  await assert.rejects(
    createItem({ title: longStr(2049), url: 'https://example.com', groupId: null }),
    (e) => e.code === ERR_VALIDATION,
  );
});

test('H1: url > 4096 chars → ERR_VALIDATION', async () => {
  await assert.rejects(
    createItem({ title: 'ok', url: 'https://example.com/' + longStr(4100), groupId: null }),
    (e) => e.code === ERR_VALIDATION,
  );
});

test('H1: group name > 256 chars → ERR_VALIDATION', async () => {
  await assert.rejects(
    createGroup({ name: longStr(257), color: 'red', parentId: null }),
    (e) => e.code === ERR_VALIDATION,
  );
});

test('H2: javascript: url → ERR_VALIDATION', async () => {
  await assert.rejects(
    createItem({ title: 'x', url: 'javascript:alert(1)', groupId: null }),
    (e) => e.code === ERR_VALIDATION,
  );
});

test('H2: data: url → ERR_VALIDATION', async () => {
  await assert.rejects(
    createItem({ title: 'x', url: 'data:text/html,<script>', groupId: null }),
    (e) => e.code === ERR_VALIDATION,
  );
});

test('H2: http(s): url → ok', async () => {
  const it = await createItem({ title: 'x', url: 'http://example.com', groupId: null });
  assert.equal(it.url, 'http://example.com');
});

test('M5: whitespace-only title → ERR_VALIDATION', async () => {
  await assert.rejects(
    createItem({ title: '   ', url: 'https://example.com', groupId: null }),
    (e) => e.code === ERR_VALIDATION,
  );
});
