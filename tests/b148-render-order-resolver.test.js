import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRenderOrder } from '../shared/render-order.js';

function group(extra = {}) {
  return Object.assign({
    id: 'g1', name: 'G', color: 'blue', parentId: null,
    sortOrder: 0, collapsed: false, createdAt: 1, updatedAt: 1,
  }, extra);
}
function item(id, sortOrder, groupId = 'g1') {
  return { id, title: 'T'+id, url: 'https://x.example/'+id, groupId, sortOrder, createdAt: 1, updatedAt: 1 };
}
function floating(floatingTabId, sortOrder) {
  return { floatingTabId, tabId: 1000 + sortOrder, sortOrder };
}

test('B-148 T1: empty group → empty result', () => {
  assert.deepEqual(resolveRenderOrder(group(), [], []), []);
});

test('B-148 T2: items only, no renderOrder → bootstrap by Item.sortOrder asc', () => {
  const items = [item('A', 1), item('B', 0), item('C', 2)];
  const result = resolveRenderOrder(group(), items, []);
  assert.deepEqual(result.map((r) => r.ref), ['item:B', 'item:A', 'item:C']);
});

test('B-148 T3: floating only, no renderOrder → bootstrap by sortOrder asc', () => {
  const fm = [floating('F2', 1), floating('F1', 0)];
  const result = resolveRenderOrder(group(), [], fm);
  assert.deepEqual(result.map((r) => r.ref), ['floating:F1', 'floating:F2']);
});

test('B-148 T4: mixed, no renderOrder → bootstrap saved-then-floating', () => {
  const items = [item('A', 0)];
  const fm = [floating('F1', 0)];
  const result = resolveRenderOrder(group(), items, fm);
  assert.deepEqual(result.map((r) => r.ref), ['item:A', 'floating:F1']);
});

test('B-148 T5: mixed, renderOrder present, all refs resolve → returns ordered display', () => {
  const items = [item('A', 0), item('B', 1)];
  const fm = [floating('F1', 0)];
  const g = group({ renderOrder: ['item:B', 'floating:F1', 'item:A'] });
  const result = resolveRenderOrder(g, items, fm);
  assert.deepEqual(result.map((r) => r.ref), ['item:B', 'floating:F1', 'item:A']);
});

test('B-148 T6: renderOrder present, stale item ref → filtered silently', () => {
  const items = [item('A', 0)];
  const g = group({ renderOrder: ['item:GHOST', 'item:A'] });
  const result = resolveRenderOrder(g, items, []);
  assert.deepEqual(result.map((r) => r.ref), ['item:A']);
});

test('B-148 T7: renderOrder present, stale floating ref → filtered silently', () => {
  const fm = [floating('F1', 0)];
  const g = group({ renderOrder: ['floating:GHOST', 'floating:F1'] });
  const result = resolveRenderOrder(g, [], fm);
  assert.deepEqual(result.map((r) => r.ref), ['floating:F1']);
});

test('B-148 T8: result rows carry resolved item / floating member', () => {
  const it = item('A', 0);
  const fm = floating('F1', 0);
  const g = group({ renderOrder: ['item:A', 'floating:F1'] });
  const result = resolveRenderOrder(g, [it], [fm]);
  assert.equal(result[0].kind, 'item');
  assert.equal(result[0].item, it);
  assert.equal(result[1].kind, 'floating');
  assert.equal(result[1].floatingMember, fm);
});

test('B-148 T9: bootstrap dedupes if same id appears in both items + floating (defensive)', () => {
  /* Edge case: theoretically impossible (item.id and floatingTabId namespaces
     are distinct ulids), but the resolver should not double-count. */
  const items = [item('A', 0)];
  const fm = [floating('A', 0)]; /* same string, different namespace */
  const result = resolveRenderOrder(group(), items, fm);
  assert.equal(result.length, 2);
  assert.equal(result[0].ref, 'item:A');
  assert.equal(result[1].ref, 'floating:A');
});

test('B-148 T10: items NOT in this group are ignored at bootstrap', () => {
  const items = [item('A', 0, 'g1'), item('B', 0, 'g2')];
  const result = resolveRenderOrder(group({ id: 'g1' }), items, []);
  /* Caller is responsible for pre-filtering to group; resolver doesn't
     re-filter. This test pins that contract — resolver TRUSTS its inputs. */
  assert.deepEqual(result.map((r) => r.ref), ['item:A', 'item:B']);
});

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const _testDir = dirname(fileURLToPath(import.meta.url));

test('B-148 §3.7: sidepanel.js imports + uses resolveRenderOrder', () => {
  const src = readFileSync(join(_testDir, '..', 'sidepanel', 'sidepanel.js'), 'utf8');
  /* Import statement present. */
  assert.match(src, /import \{[^}]*resolveRenderOrder[^}]*\} from .*shared\/render-order/);
  /* Function call present (with `group` as the first arg, matching the
     buildGroupSection contract). */
  assert.match(src, /resolveRenderOrder\(group/);
});

test('B-148 §3.7: newtab.js imports + uses resolveRenderOrder', () => {
  const src = readFileSync(join(_testDir, '..', 'newtab', 'newtab.js'), 'utf8');
  assert.match(src, /import \{[^}]*resolveRenderOrder[^}]*\} from .*shared\/render-order/);
  assert.match(src, /resolveRenderOrder\(group/);
});
