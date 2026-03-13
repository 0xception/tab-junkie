import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createChromeMock } from './chrome-mock.js';
import { createStorage } from '../background/storage.js';

describe('Storage Manager', () => {
  let chrome;
  let storage;

  beforeEach(() => {
    chrome = createChromeMock();
    storage = createStorage(chrome);
  });

  describe('bookmarks', () => {
    it('adds a bookmark and retrieves it', async () => {
      const bookmark = await storage.addBookmark({
        title: 'GitHub',
        url: 'https://github.com',
        groupId: null,
      });

      assert.ok(bookmark.id);
      assert.equal(bookmark.title, 'GitHub');
      assert.equal(bookmark.url, 'https://github.com');
      assert.equal(bookmark.groupId, null);
      assert.equal(typeof bookmark.sortOrder, 'number');
      assert.equal(typeof bookmark.createdAt, 'number');

      const all = await storage.getBookmarks();
      assert.equal(all.length, 1);
      assert.equal(all[0].id, bookmark.id);
    });

    it('removes a bookmark', async () => {
      const bookmark = await storage.addBookmark({
        title: 'Test',
        url: 'https://test.com',
        groupId: null,
      });

      await storage.removeBookmark(bookmark.id);
      const all = await storage.getBookmarks();
      assert.equal(all.length, 0);
    });

    it('updates a bookmark', async () => {
      const bookmark = await storage.addBookmark({
        title: 'Old Title',
        url: 'https://test.com',
        groupId: null,
      });

      await storage.updateBookmark(bookmark.id, { title: 'New Title' });
      const all = await storage.getBookmarks();
      assert.equal(all[0].title, 'New Title');
      assert.equal(all[0].url, 'https://test.com');
    });

    it('moves a bookmark to a different group', async () => {
      const bookmark = await storage.addBookmark({
        title: 'Test',
        url: 'https://test.com',
        groupId: 'g1',
      });

      await storage.moveBookmark(bookmark.id, 'g2', 0);
      const all = await storage.getBookmarks();
      assert.equal(all[0].groupId, 'g2');
      assert.equal(all[0].sortOrder, 0);
    });
  });

  describe('groups', () => {
    it('adds a group and retrieves it', async () => {
      const group = await storage.addGroup({
        name: 'Work Tools',
        parentId: null,
        color: '#5b91cf',
      });

      assert.ok(group.id);
      assert.equal(group.name, 'Work Tools');
      assert.equal(group.parentId, null);
      assert.equal(group.color, '#5b91cf');

      const all = await storage.getGroups();
      assert.equal(all.length, 1);
    });

    it('removes a group', async () => {
      const group = await storage.addGroup({
        name: 'Test',
        parentId: null,
        color: '#5b91cf',
      });

      await storage.removeGroup(group.id);
      const all = await storage.getGroups();
      assert.equal(all.length, 0);
    });

    it('updates a group', async () => {
      const group = await storage.addGroup({
        name: 'Old',
        parentId: null,
        color: '#5b91cf',
      });

      await storage.updateGroup(group.id, { name: 'New', color: '#b45bcf' });
      const all = await storage.getGroups();
      assert.equal(all[0].name, 'New');
      assert.equal(all[0].color, '#b45bcf');
    });

    it('enforces max one level of nesting', async () => {
      const parent = await storage.addGroup({
        name: 'Parent',
        parentId: null,
        color: '#5b91cf',
      });

      const child = await storage.addGroup({
        name: 'Child',
        parentId: parent.id,
        color: '#b45bcf',
      });

      await assert.rejects(
        () => storage.addGroup({
          name: 'Grandchild',
          parentId: child.id,
          color: '#5bcfbc',
        }),
        { message: /nesting/ }
      );
    });
  });

  describe('preferences', () => {
    it('gets and sets preferences', async () => {
      await storage.setPreference('collapsedGroups', ['g1', 'g2']);
      const value = await storage.getPreference('collapsedGroups');
      assert.deepEqual(value, ['g1', 'g2']);
    });

    it('returns default for unset preference', async () => {
      const value = await storage.getPreference('collapsedGroups');
      assert.equal(value, undefined);
    });
  });
});
