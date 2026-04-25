# New Tab Page

The new tab page replaces your browser's default new-tab surface with a Tab Junkie bookmark grid. Every new tab you open lands directly on your bookmarks — organised by group, with the same live indicators you see in the side panel, plus a prominent web-search input at the top.

Tab Junkie replaces your new tab page whenever the extension is installed. There is no in-app toggle to turn it off. To restore your browser's default new tab behavior, disable or uninstall Tab Junkie via your browser's extension management page (e.g., `edge://extensions` or `chrome://extensions`).

> **Why no in-app toggle?** The Manifest V3 platform does not allow an extension to give the new-tab surface back to the browser at runtime once the extension declares the override. Earlier builds of Tab Junkie shipped a Settings toggle that "turned the page off", but the OFF state could only show a blank page or a small disabled-state surface — neither one was the user's actual configured default new tab. Removing the toggle in favor of an explicit "uninstall to restore" workflow eliminates the false promise. (Sprint 29 retro: B-039 dropped.)

---

## Layout

The new tab page is divided into three regions from top to bottom:

1. **Web-search input** — a large search bar at the top centre of the page. Pressing **Enter** submits the query to your browser's default search engine and opens the results in a new tab, leaving the new-tab surface itself untouched.
2. **Filter input** — a narrower input below the search bar that filters the bookmark grid in real time. Typing narrows the visible rows to matches in either the title or the URL.
3. **Bookmark grid** — a responsive multi-column grid of group sections. Each section shows the group name, a count of items, and the items themselves as clickable rows. The column count adapts to your window width (typically three to five columns on a standard desktop display).

When you have no bookmarks yet, the grid area shows a friendly empty state with a button that opens the side panel so you can add your first bookmark.

---

## Web search

Focus the web-search input and type any query. Press **Enter** to submit. The results open in a new tab — the Tab Junkie new-tab page stays where it is, ready for your next search.

The search uses whatever default engine you have configured in your browser (Bing on Edge by default, configurable in `edge://settings/searchEngines`). Tab Junkie does not alter the engine or collect queries.

You can also focus the web-search input at any time by pressing **/** (forward slash) anywhere on the page. The slash shortcut is ignored while you are already typing into a text field.

---

## Filter

The filter input narrows the bookmark grid without navigating anywhere. Matches in both the title and the URL are highlighted with a subtle background. Group sections whose items all drop out of the current filter hide automatically.

Pressing **Escape** while the filter input has focus clears the filter and restores all rows. You can also click the **×** button inside the filter input to clear it.

If a query returns zero matches, the grid is replaced with a "No matches" message and a **Clear filter** button.

---

## Bookmark rows

Each row shows a favicon (or a letter avatar when no safe favicon URL is available), the title, and the URL. Clicking a row navigates to it using the same logic as the side panel:

- If you already have that URL open in another tab, Tab Junkie focuses that tab instead of opening a duplicate.
- If you don't have it open, Tab Junkie opens it in a new tab.

Either way, the new-tab page stays available in the background — switch back to it via the tab strip.

### Live state indicators

The same indicators you see in the side panel appear on the new tab grid:

- **Green dot** — the bookmark is currently open as a live tab.
- **Blue dot** — the bookmark is the currently active tab in your browser.
- **Amber dot** — the bookmark's live tab has drifted away from the saved URL.
- **♪ icon** — the live tab is playing audio.

Indicator changes appear within a few seconds of the underlying tab event, without any page reload.

---

## Keyboard navigation

- **/** — focuses the web-search input from anywhere on the page.
- **Enter** inside the web-search input — submits the query.
- **Enter** or **Space** on a focused bookmark row — activates the bookmark (same as clicking).
- **Escape** inside the filter input — clears the filter.
- **Tab** / **Shift+Tab** — cycle between the web-search input, filter input, and each bookmark row in DOM order.

All interactive elements show a visible focus ring in your current theme.

---

## Restoring your browser's default new tab page

Tab Junkie's new tab page is always on while the extension is installed. To restore your browser's default new tab behavior, disable or uninstall Tab Junkie via your browser's extension management page:

- **Microsoft Edge:** open `edge://extensions`, find Tab Junkie, then toggle it off (to keep your data and re-enable later) or click **Remove** (to uninstall).
- **Google Chrome:** open `chrome://extensions`, find Tab Junkie, then toggle it off or click **Remove**.

Disabling the extension is non-destructive — your bookmarks, groups, and preferences remain in browser storage. Re-enabling the extension restores everything exactly as it was.

> **Why no in-app toggle?** The Manifest V3 platform does not let an extension give the new-tab surface back to the browser at runtime once it declares the override. The extension management page is the only place where the platform actually hands new-tab control back to the browser.

---

## What it does NOT do

The new tab page is intentionally a read-only grid. It does not:

- Create, rename, or delete bookmarks or groups — use the side panel for those actions.
- Support drag-to-reorder on the grid.
- Track recently-opened items (that lives in the [Quick-Search popup](quick-search-popup.md) only).
- Customise its own layout (columns, spacing, background image, widgets) — the layout follows your global Tab Junkie theme.

For richer management, open the side panel alongside the new tab page — both surfaces stay in sync.
