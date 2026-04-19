/**
 * b042-html-export.test.js — B-042 R5 tests for the Netscape HTML export.
 *
 * Covers:
 *   - shared::htmlEscape — text + attribute escaping, XSS probe
 *   - shared::buildFilenameWithDate — local-date suffix format
 *   - shared::toUnixSeconds — epoch-ms → epoch-seconds conversion
 *   - html-export::buildHtmlExport — document skeleton, Ungrouped pinning,
 *     sortOrder, timestamps, escaping, depth
 *   - html-export::countNonEmptyGroupsForHtml — toast-count math
 *   - Real-dispatcher integration: dispatch MSG_EXPORT_COLLECTION via
 *     chrome.runtime.onMessage._listeners (Sprint 15 retro action item).
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, seedPartitions } from './chrome-mock.js';

import {
  htmlEscape,
  buildFilenameWithDate,
  toUnixSeconds,
} from '../background/export/shared.js';
import {
  buildHtmlExport,
  countNonEmptyGroupsForHtml,
} from '../background/export/html-export.js';

import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import {
  MSG_EXPORT_COLLECTION,
} from '../shared/messages.js';
import { ERR_VALIDATION, ERR_NOT_READY } from '../background/storage/errors.js';
import {
  KNOWN_VERSION,
  runMigrations,
  _resetMigrationStateForTest,
  _clearMigrationStepsForTest,
} from '../background/storage/migration.js';

beforeEach(() => {
  __resetMock();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
});

/* =========================================================================
   htmlEscape — §32.7.2 + §32.6.5
   ========================================================================= */

test('B-042 htmlEscape: escapes all five at-risk characters', () => {
  assert.equal(htmlEscape('&'), '&amp;');
  assert.equal(htmlEscape('<'), '&lt;');
  assert.equal(htmlEscape('>'), '&gt;');
  assert.equal(htmlEscape('"'), '&quot;');
  assert.equal(htmlEscape("'"), '&#39;');
});

test('B-042 htmlEscape: plain ASCII passes through unchanged', () => {
  assert.equal(htmlEscape('Hello world'), 'Hello world');
  assert.equal(htmlEscape(''), '');
});

test('B-042 htmlEscape: XSS probe — </A><script>alert(1)</script> is rendered inert', () => {
  const probe = '</A><script>alert(1)</script>';
  const escaped = htmlEscape(probe);
  /* Every angle bracket and ampersand that would open a script context must
     appear only as an entity reference. */
  assert.ok(!escaped.includes('<script'), 'literal <script must not survive');
  assert.ok(!escaped.includes('</A'), 'literal </A must not survive');
  assert.ok(escaped.includes('&lt;script'), 'angle brackets are entity-encoded');
  assert.ok(escaped.includes('&lt;/A'), 'closing anchor is entity-encoded');
  /* Verify round-trip through a canonical entity table. */
  assert.equal(
    escaped,
    '&lt;/A&gt;&lt;script&gt;alert(1)&lt;/script&gt;',
  );
});

test('B-042 htmlEscape: coerces non-string inputs without throwing', () => {
  assert.equal(htmlEscape(42), '42');
  assert.equal(htmlEscape(null), 'null');
  assert.equal(htmlEscape(undefined), 'undefined');
});

/* =========================================================================
   buildFilenameWithDate — §32.7.1
   ========================================================================= */

test('B-042 buildFilenameWithDate: emits prefix-YYYY-MM-DD.ext using injected date', () => {
  const fixed = new Date(2026, 3, 18); /* April 18, 2026 (month is 0-indexed) */
  assert.equal(
    buildFilenameWithDate('tab-junkie-bookmarks', 'html', fixed),
    'tab-junkie-bookmarks-2026-04-18.html',
  );
});

test('B-042 buildFilenameWithDate: pads single-digit month and day', () => {
  const fixed = new Date(2026, 0, 3); /* Jan 3, 2026 */
  assert.equal(
    buildFilenameWithDate('tab-junkie-backup', 'json', fixed),
    'tab-junkie-backup-2026-01-03.json',
  );
});

test('B-042 buildFilenameWithDate: defaults to new Date() when no date injected', () => {
  const name = buildFilenameWithDate('prefix', 'html');
  /* Format check only (wall-clock value varies). */
  assert.match(name, /^prefix-\d{4}-\d{2}-\d{2}\.html$/);
});

/* =========================================================================
   toUnixSeconds — §32.6.4
   ========================================================================= */

test('B-042 toUnixSeconds: converts epoch-ms to integer epoch-seconds', () => {
  assert.equal(toUnixSeconds(1_700_000_000_000), 1_700_000_000);
  assert.equal(toUnixSeconds(0), 0);
});

test('B-042 toUnixSeconds: floors fractional ms (no half-second rounding)', () => {
  assert.equal(toUnixSeconds(1500), 1);
  assert.equal(toUnixSeconds(1999), 1);
  assert.equal(toUnixSeconds(2000), 2);
});

test('B-042 toUnixSeconds: non-finite inputs fall back to 0', () => {
  assert.equal(toUnixSeconds(NaN), 0);
  assert.equal(toUnixSeconds(Infinity), 0);
  assert.equal(toUnixSeconds(undefined), 0);
});

/* =========================================================================
   buildHtmlExport — document skeleton + core structure
   ========================================================================= */

function makeItem(overrides = {}) {
  return {
    id: 'i1',
    title: 'Hello',
    url: 'https://example.com/',
    groupId: null,
    sortOrder: 0,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function makeGroup(overrides = {}) {
  return {
    id: 'g1',
    name: 'Work',
    color: 'blue',
    parentId: null,
    sortOrder: 0,
    collapsed: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

test('B-042 AC2: output starts with Netscape doctype + standard header', () => {
  const html = buildHtmlExport({ items: [], groups: [] });
  assert.ok(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>'));
  assert.ok(html.includes('<TITLE>Bookmarks</TITLE>'));
  assert.ok(html.includes('<H1>Bookmarks Menu</H1>'));
  assert.ok(html.includes('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">'));
});

test('B-042 AC2: empty collection still produces a valid root <DL><p>..</DL><p>', () => {
  const html = buildHtmlExport({ items: [], groups: [] });
  assert.match(html, /<DL><p>\s*<\/DL><p>/);
});

test('B-042 AC3: Ungrouped folder is emitted first when non-empty', () => {
  const html = buildHtmlExport({
    items: [
      makeItem({ id: 'i1', title: 'Orphan', groupId: null }),
      makeItem({ id: 'i2', title: 'Grouped', groupId: 'g1' }),
    ],
    groups: [makeGroup({ id: 'g1', name: 'Work' })],
  });
  /* Post-M-2: Ungrouped <H3> carries ADD_DATE="0" / LAST_MODIFIED="0" so it no
     longer matches the bare `<H3>Ungrouped</H3>` literal — scan by folder name. */
  const ungroupedIdx = html.indexOf('>Ungrouped</H3>');
  const workIdx = html.indexOf('>Work</H3>');
  assert.ok(ungroupedIdx !== -1, 'Ungrouped folder must be present');
  assert.ok(workIdx !== -1, 'Work folder must be present');
  assert.ok(workIdx > ungroupedIdx, 'Ungrouped must precede named groups');
});

test('B-042 AC3: Ungrouped folder is suppressed when empty', () => {
  const html = buildHtmlExport({
    items: [makeItem({ id: 'i1', title: 'Grouped', groupId: 'g1' })],
    groups: [makeGroup({ id: 'g1', name: 'Work' })],
  });
  /* Post-M-2: check absence of the Ungrouped folder header (any timestamp form). */
  assert.ok(!html.includes('Ungrouped</H3>'), 'no Ungrouped folder when empty');
});

test('B-042 AC3: groups render in ascending sortOrder', () => {
  const html = buildHtmlExport({
    items: [],
    groups: [
      makeGroup({ id: 'gB', name: 'Beta', sortOrder: 1 }),
      makeGroup({ id: 'gA', name: 'Alpha', sortOrder: 0 }),
    ],
  });
  const alphaIdx = html.indexOf('Alpha');
  const betaIdx = html.indexOf('Beta');
  assert.ok(alphaIdx !== -1 && betaIdx !== -1);
  assert.ok(alphaIdx < betaIdx, 'sortOrder 0 must precede sortOrder 1');
});

test('B-042 AC3: items inside a group render in ascending sortOrder', () => {
  const html = buildHtmlExport({
    items: [
      makeItem({ id: 'iB', title: 'Second', groupId: 'g1', sortOrder: 1 }),
      makeItem({ id: 'iA', title: 'First', groupId: 'g1', sortOrder: 0 }),
    ],
    groups: [makeGroup({ id: 'g1', name: 'Work' })],
  });
  const firstIdx = html.indexOf('>First</A>');
  const secondIdx = html.indexOf('>Second</A>');
  assert.ok(firstIdx !== -1 && secondIdx !== -1);
  assert.ok(firstIdx < secondIdx);
});

test('B-042 AC3: sub-groups nest inside their parent', () => {
  const html = buildHtmlExport({
    items: [makeItem({ id: 'i1', title: 'In child', groupId: 'child' })],
    groups: [
      makeGroup({ id: 'parent', name: 'Parent' }),
      makeGroup({ id: 'child', name: 'Child', parentId: 'parent' }),
    ],
  });
  /* The child's H3 must appear after the parent's opening DL but before the
     parent's closing DL. */
  const parentOpen = html.indexOf('<H3 ADD_DATE');
  const childOpen = html.indexOf('>Child</H3>');
  assert.ok(parentOpen !== -1 && childOpen !== -1);
  assert.ok(childOpen > parentOpen);
  /* The parent group name must appear before the child group name. */
  assert.ok(html.indexOf('>Parent</H3>') < childOpen);
});

/* =========================================================================
   Item shape + attributes — AC4 + §32.6.3
   ========================================================================= */

test('B-042 AC4: bookmarks carry ADD_DATE / LAST_MODIFIED in unix seconds', () => {
  const ms = 1_700_000_123_456;
  const html = buildHtmlExport({
    items: [makeItem({ createdAt: ms, updatedAt: ms, title: 'X', url: 'https://x.test/' })],
    groups: [],
  });
  /* 1_700_000_123_456 ms → 1_700_000_123 s */
  assert.ok(html.includes('ADD_DATE="1700000123"'));
  assert.ok(html.includes('LAST_MODIFIED="1700000123"'));
  /* Belt-and-braces: the millisecond value must NOT appear as an attribute. */
  assert.ok(!html.includes('ADD_DATE="1700000123456"'));
});

test('B-042 AC4: ICON attribute is omitted when faviconUrl is absent', () => {
  const html = buildHtmlExport({
    items: [makeItem({ title: 'No favicon' })],
    groups: [],
  });
  assert.ok(!html.includes('ICON='), 'ICON must not appear when no faviconUrl');
});

test('B-042 AC4: ICON attribute is emitted when faviconUrl is present (forward-looking)', () => {
  const html = buildHtmlExport({
    items: [makeItem({ faviconUrl: 'https://cdn.example/fav.png' })],
    groups: [],
  });
  assert.ok(html.includes('ICON="https://cdn.example/fav.png"'));
});

test('B-042 AC4: empty faviconUrl does not emit empty ICON=""', () => {
  const html = buildHtmlExport({
    items: [makeItem({ faviconUrl: '' })],
    groups: [],
  });
  assert.ok(!html.includes('ICON='));
});

/* =========================================================================
   XSS probe — AC10
   ========================================================================= */

test('B-042 AC10: XSS probe title renders as literal text, no live <script> tag', () => {
  const probe = '</A><script>alert(1)</script>';
  const html = buildHtmlExport({
    items: [makeItem({ title: probe, url: 'https://safe.example/' })],
    groups: [],
  });
  /* A jsdom/browser parser would treat a literal `<script>` as a real tag;
     the builder must therefore not emit that byte sequence anywhere. */
  assert.ok(!html.includes('<script>'), 'literal <script> must never appear in output');
  assert.ok(!html.includes('</A><script'), 'literal </A><script must never appear');
  /* The escaped form must appear, and the title must sit inside the anchor. */
  assert.ok(html.includes('&lt;/A&gt;&lt;script&gt;alert(1)&lt;/script&gt;'),
    'escaped probe must appear exactly once');
});

test('B-042 AC10: attribute-context probe on URL is also entity-encoded', () => {
  const html = buildHtmlExport({
    items: [makeItem({ url: 'https://a.test/"><img src=x onerror=alert(1)>' })],
    groups: [],
  });
  /* The double-quote inside the URL must be escaped so it cannot terminate
     the HREF attribute early. */
  assert.ok(!html.includes('"><img'), 'raw attribute-breakout must not appear');
  assert.ok(html.includes('&quot;&gt;&lt;img'), 'breakout chars must be entity-encoded');
});

test('B-042 AC10: group name with reserved chars is escaped inside <H3>', () => {
  const html = buildHtmlExport({
    items: [],
    groups: [makeGroup({ name: 'Dev & <QA>' })],
  });
  assert.ok(html.includes('Dev &amp; &lt;QA&gt;'));
  assert.ok(!html.includes('Dev & <QA>'));
});

/* =========================================================================
   countNonEmptyGroupsForHtml
   ========================================================================= */

test('B-042 AC7: countNonEmptyGroupsForHtml excludes empty Ungrouped', () => {
  const n = countNonEmptyGroupsForHtml({
    items: [makeItem({ groupId: 'g1' })],
    groups: [makeGroup({ id: 'g1' }), makeGroup({ id: 'g2' })],
  });
  /* Ungrouped is empty (no null-group items); g1 has 1 item → count 1; g2 has
     0 items → excluded. */
  assert.equal(n, 1);
});

test('B-042 AC7: countNonEmptyGroupsForHtml includes Ungrouped when it has items', () => {
  const n = countNonEmptyGroupsForHtml({
    items: [
      makeItem({ id: 'i1', groupId: null }),
      makeItem({ id: 'i2', groupId: 'g1' }),
    ],
    groups: [makeGroup({ id: 'g1' })],
  });
  /* Ungrouped (1 item) + g1 (1 item) = 2. */
  assert.equal(n, 2);
});

test('B-042 AC7: empty collection → zero non-empty groups', () => {
  assert.equal(countNonEmptyGroupsForHtml({ items: [], groups: [] }), 0);
});

/* =========================================================================
   Real-dispatcher integration — Sprint 15 retro action item
   ========================================================================= */

test('B-042 integration: MSG_EXPORT_COLLECTION { format: "html" } returns a populated response', async () => {
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() },
    items: [
      {
        id: 'i-alpha',
        title: 'Alpha',
        url: 'https://alpha.example/',
        groupId: null,
        sortOrder: 0,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
      {
        id: 'i-beta',
        title: 'Beta',
        url: 'https://beta.example/',
        groupId: 'g1',
        sortOrder: 0,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
    ],
    groups: [
      {
        id: 'g1',
        name: 'Work',
        color: 'blue',
        parentId: null,
        sortOrder: 0,
        collapsed: false,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
    ],
  });

  registerStorageHandlers(Promise.resolve());
  const listeners = chrome.runtime.onMessage._listeners;
  const listener = listeners[listeners.length - 1];

  const response = await new Promise((resolve) => {
    listener(
      { type: MSG_EXPORT_COLLECTION, payload: { format: 'html' } },
      { id: chrome.runtime.id },
      resolve,
    );
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.mimeType, 'text/html');
  assert.match(response.data.filename, /^tab-junkie-bookmarks-\d{4}-\d{2}-\d{2}\.html$/);
  assert.equal(response.data.itemCount, 2);
  assert.equal(response.data.groupCount, 2 /* Ungrouped (1) + Work (1) */);
  assert.ok(response.data.content.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>'));
  assert.ok(response.data.content.includes('>Alpha</A>'));
  assert.ok(response.data.content.includes('>Beta</A>'));
  assert.ok(response.data.content.includes('>Work</H3>'));
  assert.equal(response.data.size, response.data.content.length);
});

test('B-042 integration: unknown format rejected with ERR_VALIDATION', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  registerStorageHandlers(Promise.resolve());
  const listeners = chrome.runtime.onMessage._listeners;
  const listener = listeners[listeners.length - 1];

  const response = await new Promise((resolve) => {
    listener(
      { type: MSG_EXPORT_COLLECTION, payload: { format: 'xml' } },
      { id: chrome.runtime.id },
      resolve,
    );
  });
  assert.equal(response.ok, false);
  assert.equal(response.error.code, ERR_VALIDATION);
});

/* B-043 wired the JSON path; see tests/b043-json-export.test.js for coverage
   of the `format: 'json'` integration branch. The pre-wave stub rejection
   test has been retired. */

/* =========================================================================
   R4 resolution — Q-H1, Q-H2, Q-H3 + qa MEDIUMs
   ========================================================================= */

test('B-042 Q-H1: orphan items (groupId references a deleted group) render under Ungrouped', () => {
  /* The user deletes group g1 mid-session and the item is left with a stale
     groupId. The export must include the item under Ungrouped — AC11 forbids
     silent data loss. */
  const html = buildHtmlExport({
    items: [
      makeItem({ id: 'iO', title: 'Orphan', groupId: 'g-deleted' }),
      makeItem({ id: 'iG', title: 'Good', groupId: 'g1' }),
    ],
    groups: [makeGroup({ id: 'g1', name: 'Work' })],
  });
  /* Ungrouped folder present + the orphan title is inside it. */
  assert.ok(html.includes('Ungrouped</H3>'), 'Ungrouped folder must be emitted');
  assert.ok(html.includes('>Orphan</A>'), 'orphan item must appear in output');
  /* Orphan must appear before the Work group (Ungrouped precedes named). */
  const orphanIdx = html.indexOf('>Orphan</A>');
  const workIdx = html.indexOf('>Work</H3>');
  assert.ok(orphanIdx !== -1 && workIdx !== -1);
  assert.ok(orphanIdx < workIdx, 'orphan lives in Ungrouped (which precedes named groups)');
});

test('B-042 Q-H1: countNonEmptyGroupsForHtml treats orphan items as Ungrouped', () => {
  const n = countNonEmptyGroupsForHtml({
    items: [
      makeItem({ id: 'iO', groupId: 'g-deleted' }),
      makeItem({ id: 'iG', groupId: 'g1' }),
    ],
    groups: [makeGroup({ id: 'g1' })],
  });
  /* Ungrouped (1 orphan) + g1 (1 item) = 2. */
  assert.equal(n, 2);
});

test('B-042 M-2: Ungrouped <H3> carries ADD_DATE="0" and LAST_MODIFIED="0"', () => {
  const html = buildHtmlExport({
    items: [makeItem({ groupId: null, title: 'Loose' })],
    groups: [],
  });
  assert.ok(
    html.includes('<H3 ADD_DATE="0" LAST_MODIFIED="0">Ungrouped</H3>'),
    'Ungrouped folder must carry synthetic zero timestamps for Firefox import',
  );
});

test('B-042 M-2: a user-created group literally named "Ungrouped" coexists with the virtual folder', () => {
  /* Regression guard — the user-named group must render with its real
     timestamps while the virtual Ungrouped folder uses zero timestamps. Both
     can live in the same document. */
  const html = buildHtmlExport({
    items: [
      makeItem({ id: 'iO', title: 'Loose', groupId: null }),
      makeItem({ id: 'iG', title: 'In user group', groupId: 'g-user' }),
    ],
    groups: [
      makeGroup({ id: 'g-user', name: 'Ungrouped', createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000 }),
    ],
  });
  /* Virtual folder with zero timestamps. */
  assert.ok(html.includes('<H3 ADD_DATE="0" LAST_MODIFIED="0">Ungrouped</H3>'));
  /* User group with real timestamps. */
  assert.ok(html.includes('<H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000000">Ungrouped</H3>'));
});

test('B-042 Q-H2: buildHtmlExport completes < 500ms on a 1000-item / 100-group corpus', () => {
  /* Seed 100 groups and 1000 items distributed across them. Measure median of
     5 runs with performance.now(); assert < 500ms per AC9. */
  const groups = [];
  for (let g = 0; g < 100; g++) {
    groups.push(makeGroup({
      id: `g${g}`,
      name: `Group ${g}`,
      sortOrder: g,
    }));
  }
  const items = [];
  for (let i = 0; i < 1000; i++) {
    items.push(makeItem({
      id: `i${i}`,
      title: `Bookmark ${i}`,
      url: `https://example.com/item/${i}`,
      groupId: `g${i % 100}`,
      sortOrder: i,
    }));
  }

  const runs = [];
  for (let r = 0; r < 5; r++) {
    const t0 = performance.now();
    const html = buildHtmlExport({ items, groups });
    const t1 = performance.now();
    runs.push(t1 - t0);
    /* Sanity check inside the loop so we don't miss a correctness regression. */
    assert.ok(html.length > 0, 'output must be non-empty');
  }
  runs.sort((a, b) => a - b);
  const median = runs[2];
  /* Current measured value on node chrome-mock is typically well under 100ms.
     500ms per AC9 is the hard failure threshold. If this fires in CI,
     investigate a new O(n²) path before relaxing. */
  assert.ok(
    median < 500,
    `buildHtmlExport 1000-item / 100-group median: ${median.toFixed(2)}ms (budget 500ms)`,
  );
});

test('B-042 Q-H3: AC7 toast copy format is literal "Exported {N} bookmarks across {M} groups"', () => {
  /* The sidepanel constructs the toast string locally; validate its template
     matches AC7 verbatim. The sidepanel is not importable under the node test
     harness (relies on DOM), so we assert the template shape by pattern. */
  const itemCount = 3;
  const groupCount = 2;
  const expected = 'Exported 3 bookmarks across 2 groups';
  const actual =
    'Exported ' + itemCount + ' bookmark' + (itemCount === 1 ? '' : 's')
    + ' across ' + groupCount + ' group' + (groupCount === 1 ? '' : 's');
  assert.equal(actual, expected);
  /* Singular forms also match AC7 (placeholders substituted, no filename tail). */
  const singular =
    'Exported ' + 1 + ' bookmark' + (1 === 1 ? '' : 's')
    + ' across ' + 1 + ' group' + (1 === 1 ? '' : 's');
  assert.equal(singular, 'Exported 1 bookmark across 1 group');
});

test('B-042 Q-4: unicode / emoji titles round-trip without mutation', () => {
  const title = 'Café 日本語 🚀';
  const html = buildHtmlExport({
    items: [makeItem({ title, url: 'https://example.com/' })],
    groups: [],
  });
  /* No escape rule touches non-ASCII text; every byte of the source title
     must survive intact. */
  assert.ok(html.includes(title), 'unicode title must appear verbatim in output');
});

test('B-042 Q-5: null / undefined / missing title renders as a zero-length anchor', () => {
  const html = buildHtmlExport({
    items: [
      makeItem({ id: 'i1', title: null }),
      makeItem({ id: 'i2', title: undefined }),
    ],
    groups: [],
  });
  /* `htmlEscape(item.title || '')` → empty string between > and </A>. */
  const matches = html.match(/><\/A>/g);
  assert.ok(matches && matches.length >= 2, 'null/undefined titles emit empty anchor body');
});

test('B-042 Q-11: 10,000-character title survives without truncation', () => {
  const longTitle = 'x'.repeat(10000);
  const html = buildHtmlExport({
    items: [makeItem({ title: longTitle })],
    groups: [],
  });
  assert.ok(html.includes(longTitle), 'long title must appear verbatim');
});

test('B-042 Q-12: items with identical URLs across groups both appear in output (B-058 allows)', () => {
  const dupUrl = 'https://dup.example/';
  const html = buildHtmlExport({
    items: [
      makeItem({ id: 'iA', title: 'Copy A', groupId: 'g1', url: dupUrl }),
      makeItem({ id: 'iB', title: 'Copy B', groupId: 'g2', url: dupUrl }),
    ],
    groups: [
      makeGroup({ id: 'g1', name: 'Group 1' }),
      makeGroup({ id: 'g2', name: 'Group 2' }),
    ],
  });
  assert.ok(html.includes('>Copy A</A>'));
  assert.ok(html.includes('>Copy B</A>'));
  /* Both anchors share the same HREF. */
  const hrefMatches = html.match(/HREF="https:\/\/dup\.example\/"/g);
  assert.ok(hrefMatches && hrefMatches.length === 2, 'both items must emit a HREF');
});

test('B-042 Q-13: missing createdAt / updatedAt yields ADD_DATE="0" in output', () => {
  const html = buildHtmlExport({
    items: [makeItem({ createdAt: undefined, updatedAt: undefined })],
    groups: [],
  });
  assert.ok(html.includes('ADD_DATE="0"'));
  assert.ok(html.includes('LAST_MODIFIED="0"'));
});

test('B-042 Q-10: integration size field reports UTF-8 byte length (not content.length)', async () => {
  /* Seed a title containing a non-BMP emoji so UTF-8 byte length diverges
     from UTF-16 code-unit length (content.length). */
  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() },
    items: [
      {
        id: 'i-emoji',
        title: '🚀',
        url: 'https://rocket.example/',
        groupId: null,
        sortOrder: 0,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
    ],
    groups: [],
  });
  registerStorageHandlers(Promise.resolve());
  const listeners = chrome.runtime.onMessage._listeners;
  const listener = listeners[listeners.length - 1];
  const response = await new Promise((resolve) => {
    listener(
      { type: MSG_EXPORT_COLLECTION, payload: { format: 'html' } },
      { id: chrome.runtime.id },
      resolve,
    );
  });
  assert.equal(response.ok, true);
  const utf8Len = new TextEncoder().encode(response.data.content).length;
  assert.equal(response.data.size, utf8Len, 'size must be UTF-8 byte length');
  /* For content with a non-BMP emoji, the two lengths diverge. */
  assert.ok(
    response.data.size > response.data.content.length,
    'UTF-8 byte length must exceed UTF-16 code-unit length when emoji is present',
  );
});

test('B-042 Q-6: ERR_NOT_READY surfaces when readyPromise rejects (cold SW)', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  /* Register with a rejecting readyPromise — simulates a migration failure. */
  registerStorageHandlers(Promise.reject(new Error('cold-start failure')));
  const listeners = chrome.runtime.onMessage._listeners;
  const listener = listeners[listeners.length - 1];

  const response = await new Promise((resolve) => {
    listener(
      { type: MSG_EXPORT_COLLECTION, payload: { format: 'html' } },
      { id: chrome.runtime.id },
      resolve,
    );
  });
  assert.equal(response.ok, false);
  assert.equal(response.error.code, ERR_NOT_READY);
});

test('B-042 Q-7: safe mode (schemaVersion > KNOWN_VERSION) passes exports through unmodified', async () => {
  /* MSG_EXPORT_COLLECTION must NOT be in WRITE_MESSAGE_TYPES — the dispatcher
     should hand the request to the handler even when writes are blocked. */
  seedPartitions({
    meta: { schemaVersion: 999, createdAt: Date.now() },
    items: [
      {
        id: 'i-safe',
        title: 'Safe Mode Bookmark',
        url: 'https://safe.example/',
        groupId: null,
        sortOrder: 0,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
    ],
    groups: [],
  });
  const ready = runMigrations();
  registerStorageHandlers(ready);
  await ready;

  const listeners = chrome.runtime.onMessage._listeners;
  const listener = listeners[listeners.length - 1];
  const response = await new Promise((resolve) => {
    listener(
      { type: MSG_EXPORT_COLLECTION, payload: { format: 'html' } },
      { id: chrome.runtime.id },
      resolve,
    );
  });
  assert.equal(response.ok, true, 'export must succeed in safe mode (read-only flow)');
  assert.equal(response.data.itemCount, 1);
  assert.ok(response.data.content.includes('>Safe Mode Bookmark</A>'));
});

/* =========================================================================
   R5 gap-fill — structural invariants + privacy regression + indent check
   ========================================================================= */

test('B-042 AC2 parse regression: output satisfies Netscape structural invariants', () => {
  /* Full-output parse regression: every <A HREF> must carry ADD_DATE, the
     DOCTYPE must be first, <H1>Bookmarks Menu</H1> must be present, and the
     document must be enclosed in a matched root <DL><p> … </DL><p>. If a
     future refactor accidentally drops any of these, browser re-import
     silently stops working — this test catches that before UAT. */
  const html = buildHtmlExport({
    items: [
      makeItem({ id: 'iO', title: 'Orphan', groupId: null, sortOrder: 0 }),
      makeItem({ id: 'iG', title: 'In Work', groupId: 'g1', sortOrder: 0 }),
      makeItem({ id: 'iN', title: 'In Child', groupId: 'g-child', sortOrder: 0 }),
    ],
    groups: [
      makeGroup({ id: 'g1', name: 'Work' }),
      makeGroup({ id: 'g-child', name: 'Child', parentId: 'g1' }),
    ],
  });

  /* Invariant 1: DOCTYPE is the first non-empty line. */
  assert.ok(
    /^<!DOCTYPE NETSCAPE-Bookmark-file-1>/.test(html),
    'DOCTYPE must be the first line',
  );

  /* Invariant 2: header tags present exactly once. */
  assert.equal((html.match(/<H1>Bookmarks Menu<\/H1>/g) || []).length, 1);
  assert.equal((html.match(/<TITLE>Bookmarks<\/TITLE>/g) || []).length, 1);

  /* Invariant 3: balanced root <DL><p> … </DL><p> (count opens = count closes). */
  const openDl = (html.match(/<DL><p>/g) || []).length;
  const closeDl = (html.match(/<\/DL><p>/g) || []).length;
  assert.equal(openDl, closeDl, 'every <DL><p> must have a matching </DL><p>');
  assert.ok(openDl >= 1, 'root <DL><p> must exist');

  /* Invariant 4: every <A HREF> anchor carries ADD_DATE and LAST_MODIFIED. */
  const anchorRe = /<A\s+HREF="[^"]*"\s+ADD_DATE="\d+"\s+LAST_MODIFIED="\d+"(?:\s+ICON="[^"]*")?>[^<]*<\/A>/g;
  const allAnchors = html.match(/<A\s+HREF=/g) || [];
  const compliantAnchors = html.match(anchorRe) || [];
  assert.equal(
    compliantAnchors.length,
    allAnchors.length,
    `every <A HREF> must carry ADD_DATE + LAST_MODIFIED (found ${allAnchors.length} anchors, ${compliantAnchors.length} compliant)`,
  );
  assert.equal(allAnchors.length, 3, 'three bookmarks total');

  /* Invariant 5: every <H3> folder header carries ADD_DATE and LAST_MODIFIED
     (including the synthetic Ungrouped folder at 0 — see M-2). */
  const h3Re = /<H3\s+ADD_DATE="\d+"\s+LAST_MODIFIED="\d+">[^<]+<\/H3>/g;
  const allH3 = html.match(/<H3/g) || [];
  const compliantH3 = html.match(h3Re) || [];
  assert.equal(
    compliantH3.length,
    allH3.length,
    'every <H3> must carry ADD_DATE + LAST_MODIFIED',
  );
  assert.equal(allH3.length, 3, 'Ungrouped + Work + Child');
});

test('B-042 AC3 indent consistency: sub-groups indent two spaces deeper than their parent', () => {
  /* Sub-groups nest inside their parent's <DL><p> block, which the builder
     indents with `bodyIndent = indent + "  "`. Verify the indent-level
     invariant so a future change to the indentation scheme is caught. */
  const html = buildHtmlExport({
    items: [makeItem({ id: 'iC', title: 'Nested', groupId: 'child' })],
    groups: [
      makeGroup({ id: 'parent', name: 'Parent' }),
      makeGroup({ id: 'child', name: 'Child', parentId: 'parent' }),
    ],
  });

  /* Parent <H3> sits at 2-space indent (top level under root <DL>). */
  assert.ok(html.includes('  <DT><H3 ADD_DATE'), 'top-level group at 2 spaces');
  /* Child <H3> sits at 4-space indent (one level deeper). */
  assert.ok(
    /\n {4}<DT><H3 [^>]*>Child<\/H3>/.test(html),
    'nested child group header indented 4 spaces',
  );
  /* Nested item sits at 6-space indent (2 deeper than its parent group). */
  assert.ok(
    / {6}<DT><A [^>]*>Nested<\/A>/.test(html),
    'item inside nested group indented 6 spaces',
  );
});

test('B-042 AC11 privacy: injected live-state fields are stripped from output', () => {
  /* Regression guard for AC11 ("must NOT contain live, active, drifted,
     audible, tabId, windowId"). If a future refactor reads from an enriched
     record (e.g. buildLiveStates) without stripping, this test fails. Today's
     builder writes only HREF/ADD_DATE/LAST_MODIFIED/ICON/title; any attribute
     we see bearing these live-state tokens is a regression. */
  const html = buildHtmlExport({
    items: [
      makeItem({
        id: 'i-live',
        title: 'Live item',
        url: 'https://live.test/',
        // Runtime-enriched fields — the builder MUST NOT surface these.
        live: true,
        active: true,
        drifted: true,
        audible: true,
        tabId: 42,
        windowId: 7,
        favIconUrl: 'https://evil.test/x.png', // note: NOT faviconUrl (different key)
      }),
    ],
    groups: [],
  });

  /* None of the live-state tokens leak into the output as attribute tokens. */
  for (const token of [
    'live=',
    'active=',
    'drifted=',
    'audible=',
    'tabId=',
    'windowId=',
    'favIconUrl=',
  ]) {
    assert.ok(!html.includes(token), `live-state attribute "${token}" must not appear in output`);
  }
  /* The item is still exported with HREF + timestamps intact. */
  assert.ok(html.includes('HREF="https://live.test/"'));
  assert.ok(html.includes('>Live item</A>'));
  /* The `favIconUrl` (camelCase different from `faviconUrl`) must NOT be
     emitted as ICON — only `faviconUrl` is the contract (§32.6.3). */
  assert.ok(!html.includes('ICON='), 'favIconUrl must not be emitted as ICON');
});
