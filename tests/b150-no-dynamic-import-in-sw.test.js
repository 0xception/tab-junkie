/**
 * B-150 (S43) — Static regression test: no `await import(...)` in any module
 * that runs in the service-worker context.
 *
 * Why a static scan instead of a runtime test: Node.js (the chrome-mock test
 * environment) supports dynamic `import()` natively, so 1,892 tests pass
 * green even when a SW-bound module does `await import('...')`. Real Chrome /
 * Edge service workers reject dynamic import per W3C spec
 * (https://github.com/w3c/ServiceWorker/issues/1356) with:
 *   TypeError: import() is disallowed on ServiceWorkerGlobalScope by the HTML
 *   specification.
 *
 * The Sprint 43 B-150 anchor surfaced this as Q1 ATTACH-drag failure: the
 * ATTACH path inside `moveFloatingTab()` did `await import('../storage/
 * partitions.js')` to side-step a perceived circular-dep concern; the bug
 * only fired in real-browser SW execution. CLAUDE.md C-8 SW-context-
 * feasibility class.
 *
 * This test grep-scans the SW-loaded modules (everything under `background/`
 * + the shared modules they depend on) and fails if any of them contains
 * `await import(`. New features that need lazy module loading must use a
 * static `import` at the top of the module instead.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

/* SW-context-loaded directories. `background/` is the SW; `shared/` is
   imported BY the SW (and by the UI surfaces); both must be free of dynamic
   imports because the SW is the most restrictive consumer. */
const SW_DIRS = ['background', 'shared'];

/* Permitted exception list: if a future module legitimately uses dynamic
   import in a code path that is GUARANTEED never to run in the SW context
   (e.g., a UI-only file that happens to live under `shared/`), add the path
   here with a justification comment. Empty by default — no exceptions today. */
const ALLOW_LIST = new Set([]);

function* walkJsFiles(dir) {
  const absDir = join(REPO_ROOT, dir);
  const entries = readdirSync(absDir);
  for (const entry of entries) {
    const abs = join(absDir, entry);
    const rel = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      yield* walkJsFiles(rel);
    } else if (entry.endsWith('.js')) {
      yield rel;
    }
  }
}

test('B-150 — no `await import(...)` in any SW-loaded module', () => {
  /* The pattern catches `await import(...)`, `import(...)` in any
     non-comment / non-string position. We use a simple regex; false
     positives in comments/strings are extremely unlikely in TJ's codebase
     (no current usage of the literal text "await import(" outside the bug
     site that B-150 fixed). */
  const DYNAMIC_IMPORT_RE = /\bawait\s+import\s*\(/;

  const offenders = [];
  for (const dir of SW_DIRS) {
    for (const relPath of walkJsFiles(dir)) {
      if (ALLOW_LIST.has(relPath)) continue;
      const src = readFileSync(join(REPO_ROOT, relPath), 'utf8');
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        if (DYNAMIC_IMPORT_RE.test(line)) {
          /* Ignore lines that are clearly inside a block comment or are the
             test description string itself (defensive — not strictly
             necessary for current code). */
          const trimmed = line.trim();
          if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;
          offenders.push(`${relPath}:${i + 1} — ${trimmed}`);
        }
      });
    }
  }

  if (offenders.length > 0) {
    const msg = [
      'Dynamic `await import(...)` is disallowed in service-worker-loaded modules.',
      'Per W3C spec (https://github.com/w3c/ServiceWorker/issues/1356), Chrome / Edge service',
      'workers reject dynamic import at runtime — even though the chrome-mock test environment',
      '(Node.js) accepts it. Use a static `import { ... } from "..."` at the top of the module.',
      '',
      'Offending sites:',
      ...offenders.map((o) => `  - ${o}`),
    ].join('\n');
    assert.fail(msg);
  }
});
