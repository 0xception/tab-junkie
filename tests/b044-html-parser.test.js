/**
 * b044-html-parser.test.js — unit tests for the Netscape Bookmark File Format 1
 * parser (B-044, R3 build).
 *
 * AC coverage:
 *   - AC3 → doctype recognition, parser refuses non-Netscape input
 *   - AC6 → depth-flattening algorithm (top-level, depth-1, depth-2+)
 *   - AC7 → top-level <A> entries land with groupId = null
 *   - AC8 → deterministic color from djb2 of final display name
 *   - AC9 → ADD_DATE / LAST_MODIFIED conversion (seconds → ms, fallback)
 *   - AC10 → malformed-entry skip policy
 *   - AC11 → in-file duplicate-URL skip default
 *   - AC15 → XSS-safe: javascript: rejected, title read as literal text
 *   - Round-trip probe: a content-level compare against the B-042 exporter
 */

import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseNetscape } from '../background/import/html-parser.js';
import { buildHtmlExport } from '../background/export/html-export.js';
import { GROUP_COLORS } from '../shared/constants.js';
import { ERR_INVALID_FORMAT } from '../shared/errors.js';

/* =========================================================================
 * Fixture helpers
 * ========================================================================= */

function wrapDoc(body) {
  return (
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n'
    + '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n'
    + '<TITLE>Bookmarks</TITLE>\n'
    + '<H1>Bookmarks Menu</H1>\n'
    + '<DL><p>\n' + body + '</DL><p>\n'
  );
}

/* =========================================================================
 * AC3 — doctype
 * ========================================================================= */

test('B-044 AC3: missing doctype → ERR_INVALID_FORMAT', () => {
  const input = '<html><body>not netscape</body></html>';
  assert.throws(
    () => parseNetscape(input),
    (err) => err.code === ERR_INVALID_FORMAT,
  );
});

test('B-044 AC3: empty string → ERR_INVALID_FORMAT', () => {
  assert.throws(
    () => parseNetscape(''),
    (err) => err.code === ERR_INVALID_FORMAT,
  );
});

test('B-044 AC3: wrong doctype → ERR_INVALID_FORMAT', () => {
  const input = '<!DOCTYPE html><DL><p></DL><p>';
  assert.throws(
    () => parseNetscape(input),
    (err) => err.code === ERR_INVALID_FORMAT,
  );
});

test('B-044 AC3: lowercase doctype is accepted (case-insensitive)', () => {
  const input = wrapDoc('  <DT><A HREF="https://example.com">Example</A>\n')
    .replace('<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<!doctype netscape-bookmark-file-1>');
  const out = parseNetscape(input);
  assert.equal(out.items.length, 1);
});

test('B-044 AC3: leading whitespace + BOM tolerated', () => {
  const input = '\uFEFF  \n' + wrapDoc('  <DT><A HREF="https://a.example">A</A>\n');
  const out = parseNetscape(input);
  assert.equal(out.items.length, 1);
});

/* =========================================================================
 * AC7 — top-level <A> → groupId=null; no synthetic "Ungrouped" group record
 * ========================================================================= */

test('B-044 AC7: top-level anchors land with groupId=null, no synthetic group record', () => {
  const body = ''
    + '  <DT><A HREF="https://alpha.example">Alpha</A>\n'
    + '  <DT><A HREF="https://beta.example">Beta</A>\n';
  const out = parseNetscape(wrapDoc(body));
  assert.equal(out.items.length, 2);
  assert.equal(out.groups.length, 0);
  for (const it of out.items) assert.equal(it.groupId, null);
});

/* =========================================================================
 * AC6 — depth flattening
 * ========================================================================= */

test('B-044 AC6: depth-1 subfolder creates sub-group with parentId = top-level', () => {
  const body = ''
    + '  <DT><H3>Work</H3>\n'
    + '  <DL><p>\n'
    + '    <DT><A HREF="https://w1.example">W1</A>\n'
    + '    <DT><H3>Projects</H3>\n'
    + '    <DL><p>\n'
    + '      <DT><A HREF="https://p1.example">P1</A>\n'
    + '    </DL><p>\n'
    + '  </DL><p>\n';
  const out = parseNetscape(wrapDoc(body));
  assert.equal(out.groups.length, 2, 'Work + Projects');
  const work = out.groups.find((g) => g.name === 'Work');
  const projects = out.groups.find((g) => g.name === 'Projects');
  assert.ok(work && projects);
  assert.equal(work.parentId, null);
  assert.equal(projects.parentId, work.id);
  // Items: W1 in Work, P1 in Projects
  const w1 = out.items.find((it) => it.title === 'W1');
  const p1 = out.items.find((it) => it.title === 'P1');
  assert.equal(w1.groupId, work.id);
  assert.equal(p1.groupId, projects.id);
});

test('B-044 AC6: depth-2+ flattens via " / " joiner, no item loss', () => {
  const body = ''
    + '  <DT><H3>Work</H3>\n'
    + '  <DL><p>\n'
    + '    <DT><H3>Projects</H3>\n'
    + '    <DL><p>\n'
    + '      <DT><H3>2026</H3>\n'
    + '      <DL><p>\n'
    + '        <DT><A HREF="https://deep.example">Deep</A>\n'
    + '      </DL><p>\n'
    + '    </DL><p>\n'
    + '  </DL><p>\n';
  const out = parseNetscape(wrapDoc(body));
  const work = out.groups.find((g) => g.name === 'Work');
  const projects = out.groups.find((g) => g.name === 'Projects');
  const flat = out.groups.find((g) => g.name === 'Projects / 2026');
  assert.ok(work, 'Work top-level preserved');
  assert.ok(projects, 'Projects preserved as depth-1');
  assert.ok(flat, 'depth-2 group flattened to "Projects / 2026"');
  assert.equal(flat.parentId, work.id, 'flat group parents to the depth-1 ancestor');
  // Item preserved
  const deep = out.items.find((it) => it.title === 'Deep');
  assert.ok(deep);
  assert.equal(deep.groupId, flat.id);
});

test('B-044 AC6: item count preserved across flattened structure (3 levels, 5 items)', () => {
  const body = ''
    + '  <DT><H3>A</H3>\n'
    + '  <DL><p>\n'
    + '    <DT><A HREF="https://a1.example">A1</A>\n'
    + '    <DT><H3>B</H3>\n'
    + '    <DL><p>\n'
    + '      <DT><A HREF="https://a2.example">A2</A>\n'
    + '      <DT><H3>C</H3>\n'
    + '      <DL><p>\n'
    + '        <DT><A HREF="https://a3.example">A3</A>\n'
    + '        <DT><A HREF="https://a4.example">A4</A>\n'
    + '        <DT><A HREF="https://a5.example">A5</A>\n'
    + '      </DL><p>\n'
    + '    </DL><p>\n'
    + '  </DL><p>\n';
  const out = parseNetscape(wrapDoc(body));
  assert.equal(out.items.length, 5, 'all 5 items preserved');
});

/* =========================================================================
 * AC8 — deterministic group color
 * ========================================================================= */

test('B-044 AC8: identical input yields byte-identical group colors', () => {
  const body = '  <DT><H3>Work</H3>\n  <DL><p>\n    <DT><A HREF="https://a.example">A</A>\n  </DL><p>\n';
  const a = parseNetscape(wrapDoc(body));
  const b = parseNetscape(wrapDoc(body));
  const aColor = a.groups[0].color;
  const bColor = b.groups[0].color;
  assert.equal(aColor, bColor);
  assert.ok(GROUP_COLORS.includes(aColor), 'color is in allow-list');
});

test('B-044 AC8: group color always in GROUP_COLORS allowlist (probe 20 distinct names)', () => {
  const body = Array.from({ length: 20 }, (_, i) =>
    `  <DT><H3>Group${i}</H3>\n  <DL><p>\n    <DT><A HREF="https://g${i}.example">g${i}</A>\n  </DL><p>\n`,
  ).join('');
  const out = parseNetscape(wrapDoc(body));
  for (const g of out.groups) {
    assert.ok(GROUP_COLORS.includes(g.color), 'color ' + g.color + ' must be in GROUP_COLORS');
  }
});

/* =========================================================================
 * AC9 — timestamp conversion
 * ========================================================================= */

test('B-044 AC9: ADD_DATE seconds convert to epoch-ms', () => {
  const body = '  <DT><A HREF="https://t.example" ADD_DATE="1700000000" LAST_MODIFIED="1700000001">T</A>\n';
  const out = parseNetscape(wrapDoc(body));
  assert.equal(out.items[0].createdAt, 1_700_000_000_000);
  assert.equal(out.items[0].updatedAt, 1_700_000_001_000);
});

test('B-044 AC9: missing ADD_DATE falls back to now (not a skip)', () => {
  const before = Date.now();
  const body = '  <DT><A HREF="https://t.example">T</A>\n';
  const out = parseNetscape(wrapDoc(body));
  const after = Date.now();
  assert.equal(out.items.length, 1, 'item NOT skipped');
  assert.ok(out.items[0].createdAt >= before && out.items[0].createdAt <= after + 10);
});

test('B-044 AC9: negative ADD_DATE falls back to now', () => {
  const body = '  <DT><A HREF="https://t.example" ADD_DATE="-500">T</A>\n';
  const out = parseNetscape(wrapDoc(body));
  assert.equal(out.items.length, 1);
  // Not a year 1969 ms value.
  assert.ok(out.items[0].createdAt > 1_600_000_000_000);
});

test('B-044 AC9: non-numeric ADD_DATE falls back to now', () => {
  const body = '  <DT><A HREF="https://t.example" ADD_DATE="not-a-number">T</A>\n';
  const out = parseNetscape(wrapDoc(body));
  assert.equal(out.items.length, 1);
});

test('B-044 AC9: out-of-range ADD_DATE (> year 2100) falls back to now, not a skip', () => {
  /* 4102444801 = Jan 1 2100 UTC + 1 second — one over MAX_UNIX_SECONDS.
     Per AC9 the entry must NOT be skipped and the timestamp must NOT be
     stored as the raw out-of-range value. */
  const before = Date.now();
  const body = '  <DT><A HREF="https://t.example" ADD_DATE="4102444801">T</A>\n';
  const out = parseNetscape(wrapDoc(body));
  const after = Date.now();
  assert.equal(out.items.length, 1, 'out-of-range timestamp does NOT skip the entry');
  assert.ok(
    out.items[0].createdAt >= before && out.items[0].createdAt <= after + 10,
    'createdAt falls back to now — not the silently-multiplied future value',
  );
});

/* =========================================================================
 * AC10 — malformed-entry skip policy
 * ========================================================================= */

test('B-044 AC10: missing HREF → skipped++, not a throw', () => {
  const body = '  <DT><A>No Href</A>\n  <DT><A HREF="https://valid.example">Valid</A>\n';
  const out = parseNetscape(wrapDoc(body));
  assert.equal(out.skipped, 1);
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].title, 'Valid');
});

test('B-044 AC10: javascript: URL is skipped (caught by normalizeUrl)', () => {
  const body = '  <DT><A HREF="javascript:alert(1)">JS</A>\n  <DT><A HREF="https://ok.example">OK</A>\n';
  const out = parseNetscape(wrapDoc(body));
  assert.equal(out.skipped, 1);
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].title, 'OK');
});

test('B-044 AC10: data: URL is skipped (caught by normalizeUrl)', () => {
  const body = '  <DT><A HREF="data:text/html,<script>alert(1)</script>">DATA</A>\n';
  const out = parseNetscape(wrapDoc(body));
  assert.equal(out.skipped, 1);
  assert.equal(out.items.length, 0);
});

test('B-044 AC10: oversize title truncated (NOT skipped)', () => {
  const longTitle = 'x'.repeat(5000);
  const body = `  <DT><A HREF="https://ok.example">${longTitle}</A>\n`;
  const out = parseNetscape(wrapDoc(body));
  assert.equal(out.items.length, 1);
  assert.ok(out.items[0].title.length <= 2048);
});

test('B-044 AC10: empty title falls back to URL, not a skip', () => {
  const body = '  <DT><A HREF="https://fallback.example"></A>\n';
  const out = parseNetscape(wrapDoc(body));
  assert.equal(out.items.length, 1);
  assert.ok(out.items[0].title.length > 0);
});

/* =========================================================================
 * AC11 — in-file duplicate-URL skip default
 * ========================================================================= */

test('B-044 AC11: two entries pointing at the same normalized URL — first imports, second counts', () => {
  const body = ''
    + '  <DT><A HREF="https://ex.example/">First</A>\n'
    + '  <DT><A HREF="https://ex.example/">Second</A>\n';
  const out = parseNetscape(wrapDoc(body));
  assert.equal(out.items.length, 1);
  assert.equal(out.duplicateUrls, 1);
  assert.equal(out.items[0].title, 'First', 'document-order first occurrence wins');
});

/* =========================================================================
 * AC15 — XSS safety probes
 * ========================================================================= */

test('B-044 AC15: title with script markup round-trips as literal text', () => {
  const body = '  <DT><A HREF="https://ok.example">&lt;/A&gt;&lt;script&gt;alert(1)&lt;/script&gt;</A>\n';
  const out = parseNetscape(wrapDoc(body));
  assert.equal(out.items.length, 1);
  // Entities decoded → literal string (not DOM). No script execution can occur.
  assert.equal(out.items[0].title, '</A><script>alert(1)</script>');
});

test('B-044 AC15: javascript:alert(1) never enters storage as a URL', () => {
  const body = '  <DT><A HREF="javascript:alert(1)">JS title</A>\n';
  const out = parseNetscape(wrapDoc(body));
  assert.equal(out.items.length, 0);
  assert.equal(out.skipped, 1);
});

test('B-044 AC15: raw inline <script> in title source is tag-stripped', () => {
  /* Some adversarial exporters may emit raw markup inside <A>...</A>. The
     parser pre-strips tags from title text before decoding entities. */
  const body = '  <DT><A HREF="https://ok.example">Title<script>alert(1)</script></A>\n';
  const out = parseNetscape(wrapDoc(body));
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].title, 'Titlealert(1)');
});

/* =========================================================================
 * ULID stability — every record gets a fresh ULID, no file IDs reused
 * ========================================================================= */

test('B-044 ULID: every item and group id is a fresh ULID (26 Crockford base-32 chars)', () => {
  const body = ''
    + '  <DT><H3>G1</H3>\n'
    + '  <DL><p>\n'
    + '    <DT><A HREF="https://a.example">A</A>\n'
    + '    <DT><A HREF="https://b.example">B</A>\n'
    + '  </DL><p>\n';
  const out = parseNetscape(wrapDoc(body));
  const re = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;
  for (const it of out.items) assert.match(it.id, re);
  for (const g of out.groups) assert.match(g.id, re);
});

/* =========================================================================
 * AC19(c) — unknown / browser-specific attributes ignored gracefully
 * ========================================================================= */

test('B-044 AC19(c): unknown attrs (ICON, FEED, PERSONAL_TOOLBAR_FOLDER) do not leak into storage or skip the entry', () => {
  /* Per AC19(c) the parser must ignore browser-specific extensions
     (Firefox FEED, Chrome PERSONAL_TOOLBAR_FOLDER, any ICON payload) without
     mapping them to item/group fields. The entry still imports; none of the
     unknown attrs surface on the item or group records. */
  const body = ''
    + '  <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks Bar</H3>\n'
    + '  <DL><p>\n'
    + '    <DT><A HREF="https://ok.example/" ICON="data:image/png;base64,AAAA" FEED="true" ICON_URI="https://tracker.example/icon.ico">OK</A>\n'
    + '  </DL><p>\n';
  const out = parseNetscape(wrapDoc(body));
  assert.equal(out.items.length, 1, 'entry imported despite unknown attrs');
  assert.equal(out.groups.length, 1, 'folder imported as a normal group');
  const item = out.items[0];
  const group = out.groups[0];
  /* None of the unknown attrs may be stored on the item or group record. */
  for (const forbidden of ['ICON', 'icon', 'FEED', 'feed', 'ICON_URI', 'iconUri', 'favIconUrl']) {
    assert.equal(forbidden in item, false, `item must not carry ${forbidden}`);
  }
  for (const forbidden of ['PERSONAL_TOOLBAR_FOLDER', 'personalToolbarFolder']) {
    assert.equal(forbidden in group, false, `group must not carry ${forbidden}`);
  }
  /* Sanity: the known fields are still populated. */
  assert.equal(item.url, 'https://ok.example/');
  assert.equal(item.title, 'OK');
  assert.equal(group.name, 'Bookmarks Bar');
});

/* =========================================================================
 * Round-trip via B-042 exporter — parser inverts exporter (content-level)
 * ========================================================================= */

test('B-044 round-trip: items+groups parsed from B-042 export preserve all URLs + titles (modulo ids)', () => {
  /* All items live inside named folders — no top-level anchors — so the
     B-042 exporter emits no synthetic "Ungrouped" folder (which would itself
     become a real group on import, losing the groupId=null sentinel). That
     behaviour is observable but outside this round-trip probe. */
  const items = [
    {
      id: 'i-in-work', title: 'WorkA', url: 'https://work-a.example/',
      groupId: 'g-work', sortOrder: 0,
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
    },
    {
      id: 'i-in-sub', title: 'SubA', url: 'https://sub-a.example/',
      groupId: 'g-sub', sortOrder: 0,
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
    },
  ];
  const groups = [
    {
      id: 'g-work', name: 'Work', color: 'blue', parentId: null, sortOrder: 0,
      collapsed: false,
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
    },
    {
      id: 'g-sub', name: 'Projects', color: 'teal', parentId: 'g-work', sortOrder: 0,
      collapsed: false,
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
    },
  ];
  const html = buildHtmlExport({ items, groups });
  const out = parseNetscape(html);
  const sortByUrl = (a, b) => a.url.localeCompare(b.url);
  const inUrls = [...items].map((i) => i.url).sort();
  const outUrls = [...out.items].map((i) => i.url).sort();
  assert.deepEqual(outUrls, inUrls);
  const inTitles = [...items].sort(sortByUrl).map((i) => i.title);
  const outTitles = [...out.items].sort(sortByUrl).map((i) => i.title);
  assert.deepEqual(outTitles, inTitles);
  assert.equal(out.groups.length, 2);
  const names = out.groups.map((g) => g.name).sort();
  assert.deepEqual(names, ['Projects', 'Work']);
  // Parent chain preserved: Projects is a subgroup of Work
  const work = out.groups.find((g) => g.name === 'Work');
  const projects = out.groups.find((g) => g.name === 'Projects');
  assert.equal(work.parentId, null);
  assert.equal(projects.parentId, work.id);
});

test('B-044 round-trip: top-level item exported via Ungrouped folder surfaces as a real "Ungrouped" group on re-import', () => {
  /* Documents observed exporter/importer interaction: the B-042 exporter
     wraps ungrouped items in a synthetic <H3>Ungrouped</H3> folder, which is
     indistinguishable from a user-named "Ungrouped" folder on re-import.
     This test pins the behaviour so future work (e.g. a smart-reversal
     optimisation) has an explicit anchor. */
  const items = [
    {
      id: 'i-top', title: 'TopLevel', url: 'https://top.example/',
      groupId: null, sortOrder: 0,
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
    },
  ];
  const html = buildHtmlExport({ items, groups: [] });
  const out = parseNetscape(html);
  assert.equal(out.items.length, 1);
  assert.equal(out.groups.length, 1);
  assert.equal(out.groups[0].name, 'Ungrouped');
  assert.equal(out.items[0].groupId, out.groups[0].id);
});
