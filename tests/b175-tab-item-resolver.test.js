/**
 * b175-tab-item-resolver.test.js — Sprint 47 / B-175 R5
 *
 * Dedicated unit tests for the shared tab↔item resolver
 * (background/tabs/tab-item-resolver.js) — the ONE tab-resolution surface that
 * B-175 lifted out of six call sites. The R4 reviewers (code + qa) flagged that
 * the resolver's individual flag-combination paths were only exercised
 * INDIRECTLY through the b174 cold-start e2e test; specific tiers + flag combos
 * (notably `useDirectTier:false` skipping tier (a) while a valid liveTabId is
 * present, and the post-resolution `excludeClaimedTabIds` no-fall-through
 * semantic) had no direct assertion. This file closes that gap.
 *
 * The resolver is a PURE module — it imports only `safeNormalizeForMatch` from
 * `shared/url.js` and owns no state, makes no chrome API calls, and reads no
 * storage. So these tests construct plain `Map`/`Set` fixtures and call the
 * three exports directly: NO chrome-mock, NO `_setup.js`, NO timers.
 *
 *   resolveRecordToTab(record, liveTabIndex, options)
 *   buildUnclaimedUrlIndex(liveTabIndex, claimedTabIds)
 *   takeUnclaimedTabForUrl(urlToTabs, normalizedUrl, inheritedTabs)
 *
 * Live-index entries mirror the shape built by live-tab-index.js
 * (`{url, title, windowId, active, audible, index, favIconUrl}`); the resolver
 * reads only `url`, `windowId`, `index`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveRecordToTab,
  buildUnclaimedUrlIndex,
  takeUnclaimedTabForUrl,
} from '../background/tabs/tab-item-resolver.js';
import { safeNormalizeForMatch } from '../shared/url.js';

// ---- Factories ------------------------------------------------------------

/** Live-tab-index entry (live-tab-index.js shape). The resolver reads only
 *  url/windowId/index; the rest is carried for realism. */
function liveEntry(url, windowId, index, overrides = {}) {
  return {
    url, title: '', windowId, active: false, audible: false, index,
    favIconUrl: '', ...overrides,
  };
}

/** Build a `Map<tabId, entry>` from `[tabId, url, windowId, index]` rows.
 *  Insertion order is significant — it is the live-index iteration order the
 *  resolver's first-match tiers and the unclaimed-bucket builder depend on. */
function buildIndex(rows) {
  const map = new Map();
  for (const [tabId, url, windowId, index] of rows) {
    map.set(tabId, liveEntry(url, windowId, index));
  }
  return map;
}

/** Floating-group record (tj:floatingGroups shape). `liveTabId` omitted ⇒
 *  legacy v3 record (no direct join key). */
function floatingRecord(props) {
  return { savedAt: 1000, ...props };
}

// ===========================================================================
// resolveRecordToTab — three-tier join + flag combinations
// ===========================================================================

/* T1 — TIER ORDERING: direct liveTabId (tier a) wins over position (tier b)
   AND url (tier c) when all three point to DIFFERENT live tabs, default flags.
   Closes the code-reviewer "no dedicated tier-ordering assertion" gap. */
test('B-175 T1: tier (a) direct liveTabId wins over position and URL when all three differ (default flags)', () => {
  const record = floatingRecord({ liveTabId: 10, windowId: 1, tabIndex: 5, url: 'https://url-tab.example/' });
  const index = buildIndex([
    [10, 'https://direct.example/', 9, 9],   // tier (a) target — different window/index/url
    [20, 'https://position.example/', 1, 5], // tier (b) position match for the record
    [30, 'https://url-tab.example/', 7, 7],  // tier (c) URL match for the record
  ]);

  assert.equal(resolveRecordToTab(record, index), 10,
    'direct liveTabId tier resolves first even though position(→20) and URL(→30) also match different tabs');
});

/* T2 — `useDirectTier:false` SKIPS tier (a) even when the liveTabId is valid +
   present; position (tier b) then wins. Proves tier (a) was actively skipped
   (would have returned the liveTabId), not merely absent. This is the
   M-1 / qa-reviewer gap (preMark's no-direct-tier behaviour). */
test('B-175 T2 (M-1/qa gap): useDirectTier:false skips tier (a) even with a valid+present liveTabId — position tier wins', () => {
  const record = floatingRecord({ liveTabId: 10, windowId: 1, tabIndex: 5, url: 'https://url-tab.example/' });
  const index = buildIndex([
    [10, 'https://direct.example/', 9, 9],   // valid+present liveTabId — would win if tier (a) ran
    [20, 'https://position.example/', 1, 5], // position match — must win when tier (a) is skipped
  ]);

  // Control: with the default (tier a on), the liveTabId would win.
  assert.equal(resolveRecordToTab(record, index, { useDirectTier: true }), 10,
    'control: tier (a) on ⇒ liveTabId 10 wins');
  // useDirectTier:false ⇒ tier (a) skipped ⇒ position tier (→20) wins.
  assert.equal(resolveRecordToTab(record, index, { useDirectTier: false }), 20,
    'useDirectTier:false skips tier (a); position match 20 wins (proves the skip, not an absence)');
});

/* T3 — `corroborateUrlOnPosition:true` REJECTS a position hit whose live URL
   mismatches the record URL; the URL fallback (tier c) then finds the correct
   same-URL tab. The B-132 §65 stale-position false-positive fix. */
test('B-175 T3 (B-132): corroborateUrlOnPosition:true rejects a URL-mismatched position hit; URL fallback finds the same-URL tab', () => {
  const record = floatingRecord({ windowId: 1, tabIndex: 2, url: 'https://record.example/' });
  const index = buildIndex([
    [40, 'https://drifted.example/', 1, 2],  // position match (1,2) BUT URL mismatches the record
    [50, 'https://record.example/', 8, 8],   // same-URL tab elsewhere — the correct fallback
  ]);

  // Control: without corroboration the stale position hit (40) wins — the bug.
  assert.equal(resolveRecordToTab(record, index, { corroborateUrlOnPosition: false }), 40,
    'control: no corroboration ⇒ the drifted position hit 40 is (wrongly) accepted');
  // With corroboration the position tier is rejected; URL fallback ⇒ 50.
  assert.equal(resolveRecordToTab(record, index, { corroborateUrlOnPosition: true }), 50,
    'corroboration rejects position tier on URL mismatch; tier (c) URL fallback resolves 50');
});

/* T4 — `corroborateUrlOnPosition:true` with a record that has NO / empty /
   non-normalizable URL: the position tier STILL matches (backward-compat —
   corroboration only blocks when a normalizable record URL exists + mismatches). */
test('B-175 T4 (backward-compat): corroborateUrlOnPosition:true still matches by position when the record URL is empty/absent/non-normalizable', () => {
  const index = buildIndex([
    [40, 'https://whatever.example/', 1, 2], // position (1,2) match; URL irrelevant when record has none
  ]);

  // No url field at all.
  assert.equal(
    resolveRecordToTab(floatingRecord({ windowId: 1, tabIndex: 2 }), index, { corroborateUrlOnPosition: true }),
    40, 'record without a url ⇒ corroboration does not block; position tier matches 40');
  // Empty-string url.
  assert.equal(
    resolveRecordToTab(floatingRecord({ windowId: 1, tabIndex: 2, url: '' }), index, { corroborateUrlOnPosition: true }),
    40, 'empty-string url ⇒ corroboration does not block; position tier matches 40');
  // Non-normalizable url (javascript:) normalizes to '' ⇒ no corroboration block.
  assert.equal(
    resolveRecordToTab(floatingRecord({ windowId: 1, tabIndex: 2, url: 'javascript:void(0)' }), index, { corroborateUrlOnPosition: true }),
    40, 'non-normalizable url normalizes to "" ⇒ corroboration does not block; position tier matches 40');
});

/* T5 — `excludeClaimedTabIds` POST-RESOLUTION exclusion with NO fall-through:
   the tier-(a) resolved tab is in the excluded set, and a DIFFERENT unclaimed
   tab shares the record URL. The resolver returns null — it does NOT fall
   through to the unclaimed URL match. qa gap + the L-1 no-fall-through semantic. */
test('B-175 T5 (qa gap + L-1 no-fall-through): excludeClaimedTabIds rejects the resolved tab as null without falling through to a different same-URL tab', () => {
  const record = floatingRecord({ liveTabId: 10, windowId: 1, tabIndex: 5, url: 'https://shared.example/' });
  const index = buildIndex([
    [10, 'https://shared.example/', 1, 5],  // tier (a) resolves here — but this tab is CLAIMED
    [99, 'https://shared.example/', 7, 7],  // a DIFFERENT, UNCLAIMED tab at the same URL
  ]);
  const claimed = new Set([10]);

  // Sanity: without exclusion the record resolves to the claimed tab 10.
  assert.equal(resolveRecordToTab(record, index), 10,
    'sanity: tier (a) resolves to tab 10');
  // With exclusion: 10 is claimed ⇒ null. MUST NOT fall through to 99.
  assert.equal(resolveRecordToTab(record, index, { excludeClaimedTabIds: claimed }), null,
    'post-resolution exclusion returns null; it does NOT scan on for the unclaimed same-URL tab 99');
});

/* T6 — URL fallback returns null when the record has no normalizable URL AND
   neither the direct nor the position tier matches. Guards the
   `matchedTabId === null && normalizedRecordUrl` tier-(c) entry condition. */
test('B-175 T6: resolver returns null when there is no direct/position match and the record URL is non-normalizable', () => {
  const index = buildIndex([
    [40, 'https://a.example/', 1, 0],
  ]);

  // Non-normalizable url + position miss + no liveTabId ⇒ tier (c) skipped ⇒ null.
  assert.equal(
    resolveRecordToTab(floatingRecord({ windowId: 99, tabIndex: 99, url: 'javascript:void(0)' }), index),
    null, 'non-normalizable url ⇒ tier (c) skipped; no direct/position match ⇒ null');
  // No url at all + position miss ⇒ null.
  assert.equal(
    resolveRecordToTab(floatingRecord({ windowId: 99, tabIndex: 99 }), index),
    null, 'absent url + position miss ⇒ null');
});

// ===========================================================================
// buildUnclaimedUrlIndex — reverse URL→tabIds index, claimed-skip on build
// ===========================================================================

/* T7 — claimed tabs are absent from the buckets; two unclaimed tabs at the same
   normalized URL preserve live-index iteration order; non-normalizable URLs are
   skipped. Closes the buildUnclaimedUrlIndex direct-coverage gap. */
test('B-175 T7: buildUnclaimedUrlIndex skips claimed tabs + non-normalizable URLs and preserves iteration order in shared buckets', () => {
  const index = buildIndex([
    [1, 'https://dup.example/', 1, 0],      // unclaimed — bucket order [1, ...]
    [2, 'https://dup.example/', 1, 1],      // unclaimed — same normalized URL ⇒ [1, 2]
    [3, 'https://claimed.example/', 1, 2],  // CLAIMED ⇒ skipped on build
    [4, 'javascript:void(0)', 1, 3],        // non-normalizable ⇒ skipped (no bucket)
    [5, 'https://solo.example/', 1, 4],     // unclaimed — lone bucket
  ]);
  const claimed = new Set([3]);

  const urlToTabs = buildUnclaimedUrlIndex(index, claimed);

  const normDup = safeNormalizeForMatch('https://dup.example/');
  const normClaimed = safeNormalizeForMatch('https://claimed.example/');
  const normSolo = safeNormalizeForMatch('https://solo.example/');

  // Two unclaimed tabs at the same URL: order preserved (live-index iteration).
  assert.deepEqual(urlToTabs.get(normDup), [1, 2],
    'same-URL bucket preserves live-index iteration order [1, 2]');
  // Claimed tab's URL has no bucket (it was the only tab at that URL).
  assert.equal(urlToTabs.has(normClaimed), false,
    'claimed tab 3 skipped on build ⇒ no bucket for its URL');
  // Non-normalizable URL produced no '' bucket.
  assert.equal(urlToTabs.has(''), false,
    'non-normalizable URL (tab 4) skipped ⇒ no empty-string bucket');
  // Lone unclaimed tab present.
  assert.deepEqual(urlToTabs.get(normSolo), [5], 'lone unclaimed tab bucketed');
  // The claimed tabId appears in NO bucket anywhere.
  const allBucketed = [...urlToTabs.values()].flat();
  assert.equal(allBucketed.includes(3), false, 'claimed tabId 3 is absent from every bucket');
});

// ===========================================================================
// takeUnclaimedTabForUrl — single-winner pop + inherited-skip + order
// ===========================================================================

/* T8a — INHERITED-SKIP: a bucket whose ONLY candidate is inherited returns null
   AND the bucket is mutated (shifted) to length 0. */
test('B-175 T8a: takeUnclaimedTabForUrl returns null and drains the bucket when its only candidate is inherited', () => {
  const norm = safeNormalizeForMatch('https://x.example/');
  const urlToTabs = new Map([[norm, [7]]]);
  const inherited = new Set([7]);

  assert.equal(takeUnclaimedTabForUrl(urlToTabs, norm, inherited), null,
    'only candidate is inherited ⇒ null');
  assert.equal(urlToTabs.get(norm).length, 0,
    'the inherited candidate was shifted off ⇒ bucket drained to length 0');
});

/* T8b — SINGLE-WINNER POP: the first non-inherited candidate is returned and
   REMOVED, so a later call on the same shared map cannot re-grab it. This is the
   reconcile Phase-2/Phase-3 shared-map invariant (one tab bound at most once). */
test('B-175 T8b: takeUnclaimedTabForUrl pops the winner so a second call on the shared map cannot re-grab it', () => {
  const norm = safeNormalizeForMatch('https://x.example/');
  const urlToTabs = new Map([[norm, [8, 9]]]);
  const inherited = new Set();

  assert.equal(takeUnclaimedTabForUrl(urlToTabs, norm, inherited), 8, 'first call pops 8');
  assert.deepEqual(urlToTabs.get(norm), [9], 'bucket now [9] (8 removed)');
  assert.equal(takeUnclaimedTabForUrl(urlToTabs, norm, inherited), 9, 'second call pops 9 — cannot re-grab 8');
  assert.deepEqual(urlToTabs.get(norm), [], 'bucket drained');
  assert.equal(takeUnclaimedTabForUrl(urlToTabs, norm, inherited), null, 'third call on the empty bucket ⇒ null');
  // Absent key ⇒ null, no throw.
  assert.equal(takeUnclaimedTabForUrl(urlToTabs, safeNormalizeForMatch('https://absent.example/'), inherited), null,
    'absent bucket ⇒ null (no throw)');
});

/* T8c — ORDER is driven by bucket order, NOT re-sorted inside the function: the
   first element wins even when it is not the numeric minimum; inherited entries
   are shifted past while preserving the remaining bucket order. */
test('B-175 T8c: takeUnclaimedTabForUrl honours bucket order (no internal re-sort) and shifts past inherited candidates', () => {
  const norm = safeNormalizeForMatch('https://x.example/');
  // Deliberately NOT ascending — proves the function does not min-sort.
  const urlToTabs = new Map([[norm, [30, 10, 20]]]);
  const inherited = new Set();

  assert.equal(takeUnclaimedTabForUrl(urlToTabs, norm, inherited), 30,
    'first bucket element (30) wins — NOT the numeric minimum (10)');
  assert.deepEqual(urlToTabs.get(norm), [10, 20], 'remaining bucket order preserved');

  // Inherited-skip preserves order: skip the leading inherited entry, take the
  // next in bucket order (30), not the numeric min (10).
  const norm2 = safeNormalizeForMatch('https://y.example/');
  const urlToTabs2 = new Map([[norm2, [5, 30, 10]]]);
  const inherited2 = new Set([5]);
  assert.equal(takeUnclaimedTabForUrl(urlToTabs2, norm2, inherited2), 30,
    'leading inherited 5 shifted off; next-in-order 30 wins (not min 10)');
  assert.deepEqual(urlToTabs2.get(norm2), [10], 'bucket drained past 5 and 30 ⇒ [10]');
});
