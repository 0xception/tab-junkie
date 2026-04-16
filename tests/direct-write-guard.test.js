import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { __resetMock } from './chrome-mock.js';
import { createItem, ERR_DIRECT_WRITE } from '../background/storage/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

beforeEach(() => __resetMock());

test('AC5: with test mock sentinel disabled, createItem throws ERR_DIRECT_WRITE', async () => {
  const prev = globalThis.chrome.__tabJunkieTestMock;
  globalThis.chrome.__tabJunkieTestMock = false;
  try {
    await assert.rejects(
      createItem({ title: 'x', url: 'https://example.com', groupId: null }),
      (err) => err.code === ERR_DIRECT_WRITE,
    );
  } finally {
    globalThis.chrome.__tabJunkieTestMock = prev;
  }
});

test('AC5: ESLint no-restricted-imports rule scopes storage imports away from UI dirs', () => {
  const cfgPath = path.join(__dirname, '..', '.eslintrc.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const overrides = cfg.overrides || [];
  assert.ok(overrides.length > 0, 'expected overrides block');
  const ui = overrides.find((o) =>
    (o.files || []).some((f) =>
      f.startsWith('sidepanel') || f.startsWith('newtab') || f.startsWith('popup') || f.startsWith('components'),
    ),
  );
  assert.ok(ui, 'expected an override targeting UI dirs');
  const rule = ui.rules['no-restricted-imports'];
  assert.ok(rule, 'expected no-restricted-imports rule');
  const patterns = rule[1].patterns;
  const groups = patterns.flatMap((p) => p.group);
  assert.ok(groups.some((g) => g.includes('background/storage')));
  assert.ok(groups.some((g) => g.includes('background/messages')));
});
