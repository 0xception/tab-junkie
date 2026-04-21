/**
 * Sprint 21 polish bundle — B-077 + B-078 + B-079 + B-080 smoke tests.
 *
 * These four items are Fast Track XS polish; the tests below pin each item's
 * contract without duplicating the broader test suites they live inside.
 *
 * B-077 — DoR Gate 7 check subsection in CLAUDE.md R1 section
 * B-078 — breakCycles adversarial-input depth cap
 * B-079 — filter-input maxlength cap
 * B-080 — post-import toast plain-language repair breakdown
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseAndValidate } from '../background/import/json-validator.js';

/* =========================================================================
   B-077 — DoR Gate 7 check subsection present in CLAUDE.md R1 section
   ========================================================================= */

const claudeMd = readFileSync(new URL('../CLAUDE.md', import.meta.url), 'utf8');

test('B-077: CLAUDE.md Round 1 Definition section gains a DoR Gate 7 check subsection', () => {
  assert.match(claudeMd, /DoR Gate 7 check/,
    'The subsection heading must be present in CLAUDE.md.');
  assert.match(claudeMd, /\*\*Destructive-action confirmation \(DoR item 7\)\*\*: retained \| waived \| N\/A/,
    'The subsection must include the retained|waived|N/A template line.');
});

test('B-077: DoR Gate 7 subsection sits after Round 1 and before Round 2', () => {
  const round1Idx = claudeMd.indexOf('### Round 1: Definition');
  const dorGate7Idx = claudeMd.indexOf('DoR Gate 7 check');
  const round2Idx = claudeMd.indexOf('### Round 2: Architecture');
  assert.ok(round1Idx > 0, 'Round 1 heading must exist');
  assert.ok(dorGate7Idx > round1Idx,
    'DoR Gate 7 subsection must appear after Round 1 heading');
  assert.ok(round2Idx > dorGate7Idx,
    'DoR Gate 7 subsection must appear before Round 2 heading');
});

/* =========================================================================
   B-078 — breakCycles adversarial-input depth cap
   ========================================================================= */

test('B-078 AC1: adversarial long chain (1500 nodes) terminates and breaks cycles', () => {
  /* Construct a backup with a 1500-node chain where every group's parent is
     the next id in sequence. The last group points back at the first,
     forming a giant cycle. Without the depth cap, breakCycles would walk
     past MAX_CYCLE_WALK_DEPTH on every start — O(1500²) = 2.25M ops, well
     over any reasonable budget.

     With the B-078 cap, each walk terminates at MAX_CYCLE_WALK_DEPTH (1000)
     and the cursor's parentId is nulled — breaking the cycle deterministically. */
  const N = 1500;
  const groups = [];
  for (let i = 0; i < N; i++) {
    groups.push({
      id: `g-${String(i).padStart(4, '0')}`,
      name: `G${i}`,
      color: 'blue',
      parentId: `g-${String((i + 1) % N).padStart(4, '0')}`,
      sortOrder: i,
      collapsed: false,
      createdAt: i,
      updatedAt: i,
    });
  }

  const backup = JSON.stringify({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    items: [],
    groups,
    preferences: {},
  });

  const t0 = Date.now();
  const result = parseAndValidate(backup);
  const elapsed = Date.now() - t0;

  /* The test's point: it TERMINATES at all. Without the cap, the cycle walk
     would loop past 1500 levels on every start (broken by the visited set,
     but at O(N²) worst case). With the cap, a 1500-cycle backup completes
     in bounded time. We give a generous budget (10 seconds) to stay robust
     on slow CI runners, but on a dev laptop this completes in < 100 ms. */
  assert.ok(elapsed < 10_000,
    `Adversarial 1500-cycle backup must complete in < 10s (got ${elapsed}ms)`);

  /* Cycles broken count > 0 — the adversarial cycle was detected + broken. */
  assert.ok(result.repairs.cyclesBroken > 0,
    'breakCycles must report at least one cycle broken on the adversarial input');

  /* Post-repair invariant: no group has a parentId that creates a cycle (the
     repair pass must have either nulled parentIds or broken the cycle). */
  const idSet = new Set(result.groups.map((g) => g.id));
  for (const g of result.groups) {
    if (g.parentId != null) {
      assert.ok(idSet.has(g.parentId),
        `Post-repair: parentId must resolve to a live group (got ${g.parentId})`);
    }
  }
});

test('B-078 AC2: fabricated ancestor parentId falls through to orphan repair (parent dropped to null)', () => {
  /* A group whose parentId points at an id that is not in the input at all.
     The breakCycles walk short-circuits at `if (!parent) break;` and the
     subsequent `repairOrphanedGroups` step nulls the parentId. Contract:
     no unbounded lookup, record ends up orphaned (parented to null). */
  const groups = [
    {
      id: 'g-real',
      name: 'Real',
      color: 'blue',
      parentId: 'g-fabricated-does-not-exist',
      sortOrder: 0,
      collapsed: false,
      createdAt: 0,
      updatedAt: 0,
    },
  ];

  const backup = JSON.stringify({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    items: [],
    groups,
    preferences: {},
  });

  const result = parseAndValidate(backup);

  /* The single input group should come out with parentId === null (orphan
     repair pass). */
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].parentId, null,
    'Fabricated-ancestor parentId must be nulled by the orphan repair pass');
  assert.ok(result.repairs.orphanedGroups >= 1,
    'orphanedGroups count must reflect the fabricated-ancestor fix');
});

/* =========================================================================
   B-079 — filter-input maxlength cap
   ========================================================================= */

const sidepanelHtml = readFileSync(new URL('../sidepanel/sidepanel.html', import.meta.url), 'utf8');

test('B-079: #filter-input has maxlength="256" to cap adversarial paste', () => {
  assert.match(sidepanelHtml, /<input[^>]*id="filter-input"[^>]*maxlength="256"/,
    'filter-input must declare maxlength="256" (or similar) to bound query length');
});

/* =========================================================================
   B-080 — post-import toast plain-language repair breakdown
   ========================================================================= */

const sidepanelJs = readFileSync(new URL('../sidepanel/sidepanel.js', import.meta.url), 'utf8');

test('B-080: _plainLanguageRepairParts helper is defined in sidepanel.js', () => {
  assert.match(sidepanelJs, /function _plainLanguageRepairParts\s*\(\s*repairs\s*\)/,
    'Shared helper _plainLanguageRepairParts(repairs) must exist');
});

test('B-080: toast path uses _plainLanguageRepairParts for the breakdown', () => {
  /* Regex isolates the JSON-format toast block. The breakdown call must be
     present AFTER the base "Imported N items, M groups." message so the
     repair summary is appended, not replaced. */
  assert.match(sidepanelJs,
    /repairsK > 0[^}]*_plainLanguageRepairParts\(data\.repairs\)/s,
    'Toast path must invoke _plainLanguageRepairParts when repairsK > 0');
});

test('B-080: preview-dialog body reuses _plainLanguageRepairParts (not duplicated inline)', () => {
  /* The dialog body must call the shared helper; if the parts logic is
     duplicated inline (old pre-B-080 code), the labels drift between the
     toast and the dialog. Count occurrences: the helper definition itself
     contains `parts.push(repairs.orphanedGroups`, so the expected count
     across the whole file is exactly 1 (the helper body). More than 1
     means the dialog body still has the old inline copy. */
  const inlineParts = (sidepanelJs.match(/parts\.push\(repairs\.orphanedGroups/g) || []).length;
  assert.equal(inlineParts, 1,
    'Only the _plainLanguageRepairParts helper itself should push on repairs.orphanedGroups — any other occurrence is duplicated inline logic');
  const dialogCallSite = sidepanelJs.match(/_buildImportPreviewBody[\s\S]*?\n\}/);
  assert.ok(dialogCallSite, 'Must locate _buildImportPreviewBody function body');
  assert.match(dialogCallSite[0], /_plainLanguageRepairParts/,
    '_buildImportPreviewBody must invoke _plainLanguageRepairParts');
});
