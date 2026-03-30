import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  fromEnrichedBookmark,
  fromFloatingTab,
  fromUnbookmarkedTab,
  searchItemFromBookmark,
  searchItemFromTab,
  isTabItem,
  isBookmarkItem,
  getTabIdFromItemId,
} from '../shared/display-item.js';

const windowLabelMap = new Map([[1, '1'], [2, '2']]);
const uiContext = { activeTabId: 101, windowLabelMap, myWindowId: 1 };

describe('fromEnrichedBookmark', () => {
  const bookmark = {
    id: 'bm1', title: 'GitHub', url: 'https://github.com', groupId: 'g1',
    sortOrder: 0, favicon: 'data:img', createdAt: 1000,
    isOpen: true, isDrifted: false, tabId: 101, tabLastAccessed: 2000, windowId: 1,
  };

  it('sets type and isBookmarked correctly', () => {
    const item = fromEnrichedBookmark(bookmark, uiContext);
    assert.equal(item.type, 'bookmark');
    assert.equal(item.isBookmarked, true);
  });

  it('computes isActive from activeTabId', () => {
    assert.equal(fromEnrichedBookmark(bookmark, uiContext).isActive, true);
    assert.equal(fromEnrichedBookmark(bookmark, { ...uiContext, activeTabId: 999 }).isActive, false);
  });

  it('sets windowLabel for other-window items', () => {
    const otherWindow = { ...bookmark, windowId: 2 };
    assert.equal(fromEnrichedBookmark(otherWindow, uiContext).windowLabel, '2');
  });

  it('sets windowLabel to null for same-window items', () => {
    assert.equal(fromEnrichedBookmark(bookmark, uiContext).windowLabel, null);
  });

  it('spreads all bookmark fields through', () => {
    const item = fromEnrichedBookmark(bookmark, uiContext);
    assert.equal(item.id, 'bm1');
    assert.equal(item.title, 'GitHub');
    assert.equal(item.url, 'https://github.com');
    assert.equal(item.groupId, 'g1');
    assert.equal(item.tabId, 101);
    assert.equal(item.isOpen, true);
  });
});

describe('fromFloatingTab', () => {
  const tab = { id: 201, title: 'Repo Page', url: 'https://github.com/repo', favIconUrl: 'https://favicon.ico', windowId: 2, index: 3 };

  it('creates display item with tab- prefixed id', () => {
    const item = fromFloatingTab(tab, uiContext);
    assert.equal(item.id, 'tab-201');
  });

  it('sets type and isBookmarked correctly', () => {
    const item = fromFloatingTab(tab, uiContext);
    assert.equal(item.type, 'floating-tab');
    assert.equal(item.isBookmarked, false);
  });

  it('normalizes favIconUrl to favicon', () => {
    const item = fromFloatingTab(tab, uiContext);
    assert.equal(item.favicon, 'https://favicon.ico');
    assert.equal(item.favIconUrl, undefined);
  });

  it('falls back title to url when title is empty', () => {
    const noTitle = { ...tab, title: '' };
    assert.equal(fromFloatingTab(noTitle, uiContext).title, noTitle.url);
  });

  it('is always isOpen', () => {
    assert.equal(fromFloatingTab(tab, uiContext).isOpen, true);
  });

  it('computes windowLabel for other-window tabs', () => {
    assert.equal(fromFloatingTab(tab, uiContext).windowLabel, '2');
  });

  it('handles null favIconUrl', () => {
    const noFav = { ...tab, favIconUrl: null };
    assert.equal(fromFloatingTab(noFav, uiContext).favicon, null);
  });
});

describe('fromUnbookmarkedTab', () => {
  const tab = { id: 301, title: 'Stack Overflow', url: 'https://stackoverflow.com', favIconUrl: null, windowId: 1, index: 5 };

  it('creates display item with correct type', () => {
    const item = fromUnbookmarkedTab(tab, uiContext);
    assert.equal(item.type, 'unbookmarked-tab');
    assert.equal(item.id, 'tab-301');
    assert.equal(item.isBookmarked, false);
  });

  it('sets windowLabel null for same-window tab', () => {
    assert.equal(fromUnbookmarkedTab(tab, uiContext).windowLabel, null);
  });
});

describe('searchItemFromBookmark', () => {
  const bookmark = { id: 'bm1', title: 'GitHub', url: 'https://github.com', favicon: 'data:img', isOpen: true, tabId: 101 };

  it('creates search item with correct fields', () => {
    const item = searchItemFromBookmark(bookmark, { breadcrumb: 'Dev Tools' });
    assert.equal(item.type, 'bookmark');
    assert.equal(item.bookmarkId, 'bm1');
    assert.equal(item.title, 'GitHub');
    assert.equal(item.breadcrumb, 'Dev Tools');
    assert.equal(item.recency, undefined);
  });

  it('includes recency when provided', () => {
    const item = searchItemFromBookmark(bookmark, { breadcrumb: '', recency: 5000 });
    assert.equal(item.recency, 5000);
  });

  it('defaults breadcrumb to empty string', () => {
    assert.equal(searchItemFromBookmark(bookmark).breadcrumb, '');
  });
});

describe('searchItemFromTab', () => {
  const tab = { id: 201, title: 'Reddit', url: 'https://reddit.com', favIconUrl: 'https://reddit.ico', lastAccessed: 3000 };

  it('creates search item with normalized favicon', () => {
    const item = searchItemFromTab(tab, { breadcrumb: 'Not bookmarked' });
    assert.equal(item.type, 'tab');
    assert.equal(item.favicon, 'https://reddit.ico');
    assert.equal(item.tabId, 201);
    assert.equal(item.breadcrumb, 'Not bookmarked');
  });

  it('falls back title to url', () => {
    const noTitle = { ...tab, title: '' };
    assert.equal(searchItemFromTab(noTitle).title, noTitle.url);
  });

  it('includes recency when provided', () => {
    const item = searchItemFromTab(tab, { recency: 3000 });
    assert.equal(item.recency, 3000);
  });
});

describe('type guards', () => {
  it('isTabItem returns true for floating and unbookmarked tabs', () => {
    assert.equal(isTabItem({ type: 'floating-tab' }), true);
    assert.equal(isTabItem({ type: 'unbookmarked-tab' }), true);
    assert.equal(isTabItem({ type: 'bookmark' }), false);
  });

  it('isBookmarkItem returns true only for bookmarks', () => {
    assert.equal(isBookmarkItem({ type: 'bookmark' }), true);
    assert.equal(isBookmarkItem({ type: 'floating-tab' }), false);
    assert.equal(isBookmarkItem({ type: 'unbookmarked-tab' }), false);
  });
});

describe('getTabIdFromItemId', () => {
  it('extracts tab ID from tab- prefixed string', () => {
    assert.equal(getTabIdFromItemId('tab-123'), 123);
    assert.equal(getTabIdFromItemId('tab-0'), 0);
  });

  it('returns null for non-tab IDs', () => {
    assert.equal(getTabIdFromItemId('bm-abc-123'), null);
    assert.equal(getTabIdFromItemId('some-uuid'), null);
  });

  it('returns null for non-string inputs', () => {
    assert.equal(getTabIdFromItemId(123), null);
    assert.equal(getTabIdFromItemId(null), null);
    assert.equal(getTabIdFromItemId(undefined), null);
  });
});
