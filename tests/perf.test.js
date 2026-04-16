import './_setup.js';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { __resetMock } from './chrome-mock.js';
import { createItem, getItem, updateItem, listItems } from '../background/storage/index.js';

const N = 1000;
const ITER = 100;
const P95_MS = 20;

let ids = [];

before(async () => {
  __resetMock();
  for (let i = 0; i < N; i++) {
    const it = await createItem({
      title: `t${i}`,
      url: `https://example.com/${i}`,
      groupId: null,
    });
    ids.push(it.id);
  }
});

function p95(samples) {
  const sorted = samples.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)];
}

test('AC9: getItem P95 < 20ms over 100 iterations (in-memory smoke check)', async () => {
  const samples = [];
  for (let i = 0; i < ITER; i++) {
    const id = ids[i % ids.length];
    const t0 = performance.now();
    await getItem(id);
    samples.push(performance.now() - t0);
  }
  const result = p95(samples);
  assert.ok(result < P95_MS, `getItem P95=${result.toFixed(2)}ms exceeded ${P95_MS}ms`);
});

test('AC9: updateItem P95 < 20ms over 100 iterations (in-memory smoke check)', async () => {
  const samples = [];
  for (let i = 0; i < ITER; i++) {
    const id = ids[i % ids.length];
    const t0 = performance.now();
    await updateItem(id, { title: `upd-${i}` });
    samples.push(performance.now() - t0);
  }
  const result = p95(samples);
  assert.ok(result < P95_MS, `updateItem P95=${result.toFixed(2)}ms exceeded ${P95_MS}ms`);
});
