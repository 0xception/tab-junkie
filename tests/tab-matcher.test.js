import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, matchTabsToBookmarks, resolveTabGroup } from '../background/tab-matcher.js';

describe('normalizeUrl', () => {
  it('normalizes trailing slashes on bare domains', () => {
    // URL API always adds trailing slash for bare domains — that's fine for matching
    assert.equal(normalizeUrl('https://github.com/'), normalizeUrl('https://github.com'));
  });

  it('strips multiple trailing slashes', () => {
    assert.equal(normalizeUrl('https://github.com///'), normalizeUrl('https://github.com'));
  });

  it('preserves URL fragments (needed for SPA routing)', () => {
    assert.equal(
      normalizeUrl('https://example.com/page#section'),
      'https://example.com/page#section'
    );
  });

  it('normalizes http to https', () => {
    assert.equal(
      normalizeUrl('http://github.com'),
      normalizeUrl('https://github.com')
    );
  });

  it('handles URLs with paths', () => {
    assert.equal(
      normalizeUrl('https://github.com/user/repo/'),
      'https://github.com/user/repo'
    );
  });

  it('preserves query parameters', () => {
    assert.equal(
      normalizeUrl('https://example.com/search?q=test'),
      'https://example.com/search?q=test'
    );
  });

  it('handles URLs with no protocol gracefully', () => {
    assert.equal(normalizeUrl('github.com'), normalizeUrl('https://github.com'));
  });

  it('returns empty string for invalid input', () => {
    assert.equal(normalizeUrl(''), '');
    assert.equal(normalizeUrl(null), '');
    assert.equal(normalizeUrl(undefined), '');
  });
});

describe('matchTabsToBookmarks', () => {
  const bookmarks = [
    { id: 'bm1', title: 'GitHub', url: 'https://github.com', groupId: 'g1', sortOrder: 0, favicon: null, createdAt: 1000 },
    { id: 'bm2', title: 'Jira', url: 'https://jira.example.com/board', groupId: 'g1', sortOrder: 1, favicon: null, createdAt: 1001 },
    { id: 'bm3', title: 'Reddit', url: 'https://reddit.com', groupId: 'g2', sortOrder: 0, favicon: null, createdAt: 1002 },
  ];

  const tabs = [
    { id: 101, title: 'GitHub', url: 'https://github.com/' },
    { id: 102, title: 'Stack Overflow', url: 'https://stackoverflow.com/questions/123' },
    { id: 103, title: 'Reddit', url: 'http://reddit.com' },
  ];

  it('marks matching bookmarks as open with tabId', () => {
    const result = matchTabsToBookmarks(bookmarks, tabs);
    const github = result.bookmarks.find(b => b.id === 'bm1');
    assert.equal(github.isOpen, true);
    assert.equal(github.tabId, 101);
  });

  it('marks non-matching bookmarks as closed', () => {
    const result = matchTabsToBookmarks(bookmarks, tabs);
    const jira = result.bookmarks.find(b => b.id === 'bm2');
    assert.equal(jira.isOpen, false);
    assert.equal(jira.tabId, null);
  });

  it('normalizes URLs for matching (http vs https, trailing slash)', () => {
    const result = matchTabsToBookmarks(bookmarks, tabs);
    const reddit = result.bookmarks.find(b => b.id === 'bm3');
    assert.equal(reddit.isOpen, true);
    assert.equal(reddit.tabId, 103);
  });

  it('returns unbookmarked tabs separately', () => {
    const result = matchTabsToBookmarks(bookmarks, tabs);
    assert.equal(result.unbookmarkedTabs.length, 1);
    assert.equal(result.unbookmarkedTabs[0].id, 102);
    assert.equal(result.unbookmarkedTabs[0].title, 'Stack Overflow');
  });

  it('handles empty bookmarks', () => {
    const result = matchTabsToBookmarks([], tabs);
    assert.equal(result.bookmarks.length, 0);
    assert.equal(result.unbookmarkedTabs.length, 3);
  });

  it('handles empty tabs', () => {
    const result = matchTabsToBookmarks(bookmarks, []);
    assert.equal(result.bookmarks.every(b => !b.isOpen), true);
    assert.equal(result.unbookmarkedTabs.length, 0);
  });

  it('matches via trackedTabs when URL redirected', () => {
    const bms = [
      { id: 'bm1', title: 'AWS Console', url: 'https://console.aws.com/dynamodb#table1', groupId: 'g1', sortOrder: 0 },
    ];
    const openTabs = [
      { id: 201, title: 'Sign In', url: 'https://signin.aws.com/redirect?dest=dynamodb' },
    ];
    // Tab 201 was opened for bookmark URL, but redirected to sign-in
    const tracked = new Map([[201, 'https://console.aws.com/dynamodb#table1']]);

    const result = matchTabsToBookmarks(bms, openTabs, tracked);
    const aws = result.bookmarks.find(b => b.id === 'bm1');
    assert.equal(aws.isOpen, true);
    assert.equal(aws.tabId, 201);
    assert.equal(result.unbookmarkedTabs.length, 0);
  });

  it('returns floatingTabsByGroup as empty object when no opener chains', () => {
    const result = matchTabsToBookmarks(bookmarks, tabs);
    assert.deepEqual(result.floatingTabsByGroup, {});
  });

  it('places tab with openerTabId pointing to matched bookmark in correct group', () => {
    const bms = [
      { id: 'bm1', title: 'GitHub', url: 'https://github.com', groupId: 'g1', sortOrder: 0 },
    ];
    const openTabs = [
      { id: 101, url: 'https://github.com/', title: 'GitHub', index: 0 },
      { id: 102, url: 'https://github.com/some/repo', title: 'Repo', openerTabId: 101, index: 1 },
    ];

    const result = matchTabsToBookmarks(bms, openTabs);
    assert.equal(result.unbookmarkedTabs.length, 0);
    assert.equal(result.floatingTabsByGroup['g1'].length, 1);
    assert.equal(result.floatingTabsByGroup['g1'][0].id, 102);
  });

  it('resolves transitive opener chain: tab → tab → bookmark', () => {
    const bms = [
      { id: 'bm1', title: 'GitHub', url: 'https://github.com', groupId: 'g1', sortOrder: 0 },
    ];
    const openTabs = [
      { id: 101, url: 'https://github.com/', title: 'GitHub', index: 0 },
      { id: 102, url: 'https://github.com/org', title: 'Org', openerTabId: 101, index: 1 },
      { id: 103, url: 'https://github.com/org/repo', title: 'Repo', openerTabId: 102, index: 2 },
    ];

    const result = matchTabsToBookmarks(bms, openTabs);
    assert.equal(result.floatingTabsByGroup['g1'].length, 2);
    assert.deepEqual(
      result.floatingTabsByGroup['g1'].map(t => t.id),
      [102, 103]
    );
  });

  it('tab with no openerTabId stays in unbookmarkedTabs', () => {
    const bms = [
      { id: 'bm1', title: 'GitHub', url: 'https://github.com', groupId: 'g1', sortOrder: 0 },
    ];
    const openTabs = [
      { id: 101, url: 'https://github.com/', title: 'GitHub', index: 0 },
      { id: 102, url: 'https://stackoverflow.com', title: 'SO', index: 1 },
    ];

    const result = matchTabsToBookmarks(bms, openTabs);
    assert.equal(result.unbookmarkedTabs.length, 1);
    assert.equal(result.unbookmarkedTabs[0].id, 102);
    assert.equal(result.floatingTabsByGroup['g1'], undefined);
  });

  it('openerTabId pointing to closed/missing tab stays in unbookmarkedTabs', () => {
    const bms = [
      { id: 'bm1', title: 'GitHub', url: 'https://github.com', groupId: 'g1', sortOrder: 0 },
    ];
    const openTabs = [
      { id: 101, url: 'https://github.com/', title: 'GitHub', index: 0 },
      { id: 102, url: 'https://example.com', title: 'Example', openerTabId: 999, index: 1 },
    ];

    const result = matchTabsToBookmarks(bms, openTabs);
    assert.equal(result.unbookmarkedTabs.length, 1);
    assert.equal(result.unbookmarkedTabs[0].id, 102);
  });

  it('respects max depth limit on unresolved chains', () => {
    // maxDepth limits hops walked per tab. With memoization, once a tab is resolved,
    // its children resolve in 1 hop. So maxDepth protects against long UNRESOLVED chains.
    // Test: chain where opener leads to a non-bookmark tab with no further opener
    const bms = [
      { id: 'bm1', title: 'Root', url: 'https://root.com', groupId: 'g1', sortOrder: 0 },
    ];
    // Tab 102 opened from 101 (bookmark) → resolves
    // Tab 200 has no opener → orphan
    // Build a chain of 6 tabs hanging off 200 (non-bookmark, no opener)
    const openTabs = [
      { id: 101, url: 'https://root.com/', title: 'Root', index: 0 },
      { id: 102, url: 'https://page.com', title: 'Page', openerTabId: 101, index: 1 },
      { id: 200, url: 'https://other.com', title: 'Other', index: 2 },
    ];
    for (let i = 201; i <= 206; i++) {
      openTabs.push({ id: i, url: `https://other${i}.com`, title: `Other ${i}`, openerTabId: i - 1, index: i - 198 });
    }

    const result = matchTabsToBookmarks(bms, openTabs);
    // Tab 102 resolves to g1
    assert.equal(result.floatingTabsByGroup['g1'].length, 1);
    assert.equal(result.floatingTabsByGroup['g1'][0].id, 102);
    // All the 200-chain tabs are orphans (chain dead-ends at 200 which has no opener)
    assert.equal(result.unbookmarkedTabs.length, 7); // 200-206
  });

  it('pinnedTabGroups places tab in correct group as fallback', () => {
    const bms = [
      { id: 'bm1', title: 'GitHub', url: 'https://github.com', groupId: 'g1', sortOrder: 0 },
    ];
    // Tab 102 has no openerTabId but is pinned to g1
    const openTabs = [
      { id: 101, url: 'https://github.com/', title: 'GitHub', index: 0 },
      { id: 102, url: 'https://example.com', title: 'Example', index: 1 },
    ];
    const pinned = new Map([[102, 'g1']]);

    const result = matchTabsToBookmarks(bms, openTabs, new Map(), pinned);
    assert.equal(result.unbookmarkedTabs.length, 0);
    assert.equal(result.floatingTabsByGroup['g1'].length, 1);
    assert.equal(result.floatingTabsByGroup['g1'][0].id, 102);
  });

  it('opener chain takes precedence over pinnedTabGroups', () => {
    const bms = [
      { id: 'bm1', title: 'GitHub', url: 'https://github.com', groupId: 'g1', sortOrder: 0 },
    ];
    // Tab 102 has openerTabId pointing to bookmark in g1, but is pinned to g2
    const openTabs = [
      { id: 101, url: 'https://github.com/', title: 'GitHub', index: 0 },
      { id: 102, url: 'https://example.com', title: 'Example', openerTabId: 101, index: 1 },
    ];
    const pinned = new Map([[102, 'g2']]);

    const result = matchTabsToBookmarks(bms, openTabs, new Map(), pinned);
    // Should be in g1 (from opener chain), not g2 (from pin)
    assert.equal(result.floatingTabsByGroup['g1'].length, 1);
    assert.equal(result.floatingTabsByGroup['g2'], undefined);
  });

  it('floating tab resolves group via pinned opener (bookmark removed but tab stayed)', () => {
    // Scenario: bookmark was removed, its tab got pinned to the group.
    // A child floating tab whose openerTabId points to the pinned tab should still resolve.
    const bms = []; // No bookmarks — the bookmark was removed
    const openTabs = [
      { id: 101, url: 'https://github.com/', title: 'GitHub', index: 0 }, // was a bookmark, now pinned
      { id: 102, url: 'https://github.com/repo', title: 'Repo', openerTabId: 101, index: 1 }, // child tab
    ];
    const pinned = new Map([[101, 'g1']]); // tab 101 pinned to g1 after bookmark removal

    const result = matchTabsToBookmarks(bms, openTabs, new Map(), pinned);
    // Tab 101 is pinned → floating in g1
    // Tab 102's opener (101) is pinned → should also resolve to g1
    assert.equal(result.floatingTabsByGroup['g1'].length, 2);
    assert.equal(result.unbookmarkedTabs.length, 0);
  });

  it('floating tabs are sorted by tab.index within a group', () => {
    const bms = [
      { id: 'bm1', title: 'GitHub', url: 'https://github.com', groupId: 'g1', sortOrder: 0 },
    ];
    const openTabs = [
      { id: 101, url: 'https://github.com/', title: 'GitHub', index: 0 },
      { id: 103, url: 'https://github.com/c', title: 'C', openerTabId: 101, index: 5 },
      { id: 102, url: 'https://github.com/a', title: 'A', openerTabId: 101, index: 2 },
    ];

    const result = matchTabsToBookmarks(bms, openTabs);
    const floating = result.floatingTabsByGroup['g1'];
    assert.equal(floating[0].id, 102); // index 2
    assert.equal(floating[1].id, 103); // index 5
  });
});
