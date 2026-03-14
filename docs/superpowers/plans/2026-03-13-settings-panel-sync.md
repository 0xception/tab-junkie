# Settings Panel & Sync Tab Order Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a settings panel UI (toggled by the existing gear button) with a "Sync tab order" action that reorders all Chrome tabs to match Junkie's group ordering.

**Architecture:** Settings panel is a hidden `<section>` that replaces `<main>` via show/hide. A new `SYNC_ALL_TAB_ORDER` message triggers the service worker to iterate all groups from cached state and call the existing `syncTabOrderInChrome()` per group. Confirmation uses a native `<dialog>`.

**Tech Stack:** Vanilla JS, Chrome Extension APIs (`chrome.tabs.move`), native `<dialog>` element

---

## File Structure

| File | Role |
|------|------|
| `shared/messages.js` | Add `SYNC_ALL_TAB_ORDER` constant |
| `background/service-worker.js` | Handle `SYNC_ALL_TAB_ORDER`, add try/catch to existing `SYNC_TAB_ORDER` |
| `sidepanel/sidepanel.html` | Add settings panel markup + confirmation dialog |
| `sidepanel/sidepanel.css` | Styles for settings panel |
| `sidepanel/sidepanel.js` | Wire gear button, sync button, confirmation flow, feedback indicator |

---

### Task 1: Add `SYNC_ALL_TAB_ORDER` message type

**Files:**
- Modify: `shared/messages.js:18`

- [ ] **Step 1: Add the message constant**

In `shared/messages.js`, add `SYNC_ALL_TAB_ORDER` after `SYNC_TAB_ORDER`:

```js
  SYNC_TAB_ORDER: 'sync-tab-order',
  SYNC_ALL_TAB_ORDER: 'sync-all-tab-order',
```

- [ ] **Step 2: Commit**

```bash
git add shared/messages.js
git commit -m "feat: add SYNC_ALL_TAB_ORDER message type"
```

---

### Task 2: Handle `SYNC_ALL_TAB_ORDER` in service worker + harden existing handler

**Files:**
- Modify: `background/service-worker.js:142-145` (existing `SYNC_TAB_ORDER` handler)
- Modify: `background/service-worker.js:142` (add new handler before `CLOSE_TAB`)

- [ ] **Step 1: Add try/catch to existing `SYNC_TAB_ORDER` handler**

Replace lines 142-145 in `background/service-worker.js`:

```js
    case MSG.SYNC_TAB_ORDER: {
      try {
        await syncTabOrderInChrome(message.payload.tabOrder);
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
```

- [ ] **Step 2: Add `SYNC_ALL_TAB_ORDER` handler**

Add this case right after the `SYNC_TAB_ORDER` case (before `CLOSE_TAB`):

```js
    case MSG.SYNC_ALL_TAB_ORDER: {
      try {
        const state = await broadcaster.getState();
        for (const group of state.groups) {
          const groupBookmarks = state.bookmarks
            .filter(b => b.groupId === group.id)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          const floatingTabs = state.floatingTabsByGroup[group.id] || [];
          const tabOrder = [];
          for (const bm of groupBookmarks) {
            if (bm.tabId != null) tabOrder.push(bm.tabId);
          }
          for (const tab of floatingTabs) {
            tabOrder.push(tab.id);
          }
          if (tabOrder.length >= 2) {
            await syncTabOrderInChrome(tabOrder);
          }
        }
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
```

- [ ] **Step 3: Commit**

```bash
git add background/service-worker.js
git commit -m "feat: handle SYNC_ALL_TAB_ORDER, add error handling to SYNC_TAB_ORDER"
```

---

### Task 3: Add settings panel and confirmation dialog HTML

**Files:**
- Modify: `sidepanel/sidepanel.html:19` (after `</header>`, before `<main>`)
- Modify: `sidepanel/sidepanel.html:64` (after edit bookmark dialog, before bulk action bar)

- [ ] **Step 1: Add back button to header and settings panel markup**

Insert the back button inside `<header>` after `<div class="header-title">Junkie</div>` (line 12):

```html
    <button class="header-btn settings-back-btn hidden" id="settings-back-btn" title="Back">&#x2190; Settings</button>
```

Then insert the settings panel after the closing `</header>` tag (line 17) and before `<main>` (line 19):

```html
  <section id="settings-panel" class="settings-panel hidden">
    <div class="settings-body">
      <h4 class="settings-section-title">Tab Sync</h4>
      <div class="settings-item">
        <div class="settings-item-text">
          <div class="settings-item-label">Sync tab order</div>
          <div class="settings-item-desc">Reorder Chrome tabs to match Junkie</div>
        </div>
        <div class="settings-item-control">
          <button class="btn-primary" id="sync-tabs-btn">Sync now</button>
          <span id="sync-feedback" class="settings-feedback"></span>
        </div>
      </div>
    </div>
  </section>
```

- [ ] **Step 2: Add confirmation dialog markup**

Insert after the edit bookmark dialog closing `</dialog>` (line 64) and before the bulk action bar comment:

```html
  <!-- Sync Confirmation Dialog -->
  <dialog id="sync-confirm-dialog">
    <form method="dialog">
      <h3>Sync Tab Order</h3>
      <p class="dialog-text">This will reorder your Chrome tabs to match Junkie's group order. Continue?</p>
      <div class="dialog-actions">
        <button type="button" class="btn-cancel" id="sync-cancel-btn">Cancel</button>
        <button type="button" class="btn-primary" id="sync-confirm-btn">Confirm</button>
      </div>
    </form>
  </dialog>
```

- [ ] **Step 3: Commit**

```bash
git add sidepanel/sidepanel.html
git commit -m "feat: add settings panel and sync confirmation dialog markup"
```

---

### Task 4: Style the settings panel

**Files:**
- Modify: `sidepanel/sidepanel.css` (append at end of file)

- [ ] **Step 1: Add settings panel styles**

Append to the end of `sidepanel/sidepanel.css`:

```css
/* Settings Panel */
.settings-panel {
  padding: 16px;
}

.settings-panel.hidden {
  display: none;
}

.settings-section-title {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.settings-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px;
  margin-bottom: 8px;
}

.settings-item-label {
  font-size: var(--font-size-base);
  color: var(--text-primary);
}

.settings-item-desc {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-top: 2px;
}

.settings-item-control {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.settings-feedback {
  font-size: var(--font-size-sm);
  transition: opacity 0.3s;
}

.settings-feedback.success {
  color: var(--open-color);
}

.settings-feedback.error {
  color: #cf5b5b;
}

.dialog-text {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin-bottom: 16px;
  line-height: 1.4;
}
```

- [ ] **Step 2: Commit**

```bash
git add sidepanel/sidepanel.css
git commit -m "feat: add settings panel styles"
```

---

### Task 5: Wire up settings panel toggle and sync flow in JS

**Files:**
- Modify: `sidepanel/sidepanel.js` (multiple locations)

- [ ] **Step 1: Add settings panel state variable**

After line 8 (`const selectedItems = new Map();`), add:

```js
let settingsOpen = false;
let syncFeedbackTimer = null;
```

- [ ] **Step 2: Add settings toggle functions**

After the `clearSelection()` function (after line 147), add:

```js
// --- Settings Panel ---

function openSettings() {
  settingsOpen = true;
  clearSelection();
  document.getElementById('bookmark-list').classList.add('hidden');
  document.getElementById('settings-panel').classList.remove('hidden');
  // Swap header: hide normal title + actions, show back button
  document.querySelector('.header-title').classList.add('hidden');
  document.querySelector('.header-actions').classList.add('hidden');
  document.getElementById('settings-back-btn').classList.remove('hidden');
}

function closeSettings() {
  settingsOpen = false;
  clearSyncFeedback();
  document.getElementById('settings-panel').classList.add('hidden');
  document.getElementById('bookmark-list').classList.remove('hidden');
  // Restore header
  document.getElementById('settings-back-btn').classList.add('hidden');
  document.querySelector('.header-title').classList.remove('hidden');
  document.querySelector('.header-actions').classList.remove('hidden');
}

function clearSyncFeedback() {
  if (syncFeedbackTimer) {
    clearTimeout(syncFeedbackTimer);
    syncFeedbackTimer = null;
  }
  const el = document.getElementById('sync-feedback');
  if (el) {
    el.textContent = '';
    el.className = 'settings-feedback';
  }
}
```

- [ ] **Step 3: Wire up gear button, back button, and sync flow in `init()`**

Add the following inside `init()`, between `setupBulkActions();` and the closing `}`:

```js
  // Settings panel
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-back-btn').addEventListener('click', closeSettings);

  // Sync tab order
  const syncBtn = document.getElementById('sync-tabs-btn');
  const syncDialog = document.getElementById('sync-confirm-dialog');

  syncBtn.addEventListener('click', () => {
    syncDialog.showModal();
  });

  document.getElementById('sync-cancel-btn').addEventListener('click', () => {
    syncDialog.close();
  });

  document.getElementById('sync-confirm-btn').addEventListener('click', async () => {
    syncDialog.close();
    syncBtn.disabled = true;
    clearSyncFeedback();
    const feedback = document.getElementById('sync-feedback');
    try {
      const result = await sendMessage(MSG.SYNC_ALL_TAB_ORDER);
      if (result?.success) {
        feedback.textContent = '\u2713 Done';
        feedback.className = 'settings-feedback success';
        syncFeedbackTimer = setTimeout(clearSyncFeedback, 2000);
      } else {
        feedback.textContent = 'Failed';
        feedback.className = 'settings-feedback error';
        syncFeedbackTimer = setTimeout(clearSyncFeedback, 3000);
      }
    } catch {
      feedback.textContent = 'Failed';
      feedback.className = 'settings-feedback error';
      syncFeedbackTimer = setTimeout(clearSyncFeedback, 3000);
    } finally {
      syncBtn.disabled = false;
    }
  });
```

- [ ] **Step 4: Add hidden class for `<main>` in CSS**

Append to `sidepanel/sidepanel.css`:

```css
#bookmark-list.hidden {
  display: none;
}

.header-title.hidden {
  display: none;
}

.header-actions.hidden {
  display: none;
}

.settings-back-btn {
  width: auto;
  padding: 0 8px;
  gap: 4px;
  font-size: var(--font-size-base);
}

.settings-back-btn.hidden {
  display: none;
}
```

- [ ] **Step 5: Commit**

```bash
git add sidepanel/sidepanel.js sidepanel/sidepanel.css
git commit -m "feat: wire settings panel toggle, sync confirmation, and feedback"
```

---

### Task 6: Manual verification

- [ ] **Step 1: Verify settings panel toggle**
1. Open Junkie side panel
2. Click the gear icon — settings panel should appear, header shows "← Settings"
3. Click "← Settings" — should return to main view

- [ ] **Step 2: Verify sync flow**
1. Open several bookmarked pages across different groups
2. Click gear → "Sync now" → confirmation dialog appears
3. Click "Cancel" — dialog closes, nothing happens
4. Click "Sync now" again → "Confirm" — Chrome tabs reorder to match Junkie
5. "✓ Done" appears briefly next to button, then fades

- [ ] **Step 3: Verify edge cases**
1. Close a tab, immediately click Sync — no errors
2. Click Sync with no open tabs — shows "Done" (no-op)
3. Rapidly double-click Sync — button is disabled during operation
