import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, matchTabsToBookmarks } from '../background/tab-matcher.js';

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
});
