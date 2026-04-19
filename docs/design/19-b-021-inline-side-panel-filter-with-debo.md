## 19. B-021 — Inline Side-Panel Filter with Debounce & Highlight (R6 Close)

### 19.1 Summary

B-021 adds an inline filter input to the sidepanel header that provides instant, client-side substring matching across all bookmark titles and URLs. The filter operates entirely on cached data held in module-level variables — no service worker messages are sent, no storage reads occur during filtering, and no new manifest permissions are required.

### 19.2 State Model

Six module-level variables support the filter subsystem:

| Variable | Type | Populated in | Purpose |
|----------|------|-------------|---------|
| `_filterQuery` | `string` | `input` event listener | Raw filter input value; drives show/hide logic |
| `_filterTimer` | `number \| null` | `input` event listener | `setTimeout` handle for 150ms debounce; cleared on each keystroke |
| `_cachedItems` | `Item[]` | `renderAll()` | Full item list; never re-fetched during filter |
| `_cachedGroups` | `Group[]` | `renderAll()` | Full group list; cached alongside items |
| `_cachedLiveStates` | `object` | `renderAll()` | Live tab states; cached alongside items |
| `_cachedDriftRecords` | `object` | `renderAll()` | Drift records; cached alongside items |
| `_itemById` | `Map<id, Item>` | `renderAll()` | O(1) lookup by item ID; built as `new Map(items.map(it => [it.id, it]))` |

**Cache strategy:** All six variables are populated at the top of `renderAll()`, which runs on initial load and on every `MSG_BROADCAST_MUTATION` re-render. The filter never triggers its own data fetch — it reads `_itemById` to resolve `data-item-id` attributes on DOM rows. This ensures filter latency is pure DOM + Map lookup, well under the 50ms P95 target.

### 19.3 `buildHighlightedText` — XSS-Safe Highlight Rendering

```
buildHighlightedText(text: string, query: string) → DocumentFragment
```

**Algorithm:** Linear scan using `String.prototype.indexOf` on lowercased copies. For each match, slices the original (case-preserved) text into a `<mark>` element via `.textContent` assignment. Non-matching segments use `document.createTextNode()`. Returns a `DocumentFragment`.

**Security properties:**
- Zero `innerHTML` usage — all user-provided strings (bookmark titles, URLs) flow through `createTextNode` or `.textContent`
- XSS-safe by construction: no HTML parsing of untrusted data
- Uses `lowerQuery.length` for slice extent, which is Unicode-safe for BMP characters (sufficient for URL/title content)

**Complexity:** O(n) per text string where n = `text.length`. Each character is visited at most twice (once in `indexOf`, once in `slice`).

### 19.4 `applyFilter` — Visibility Algorithm

**Algorithm:**
1. Iterate all `.group-section` elements in the item list
2. Within each section, iterate all `[data-item-id]` rows
3. For each row, perform O(1) lookup via `_itemById.get(row.dataset.itemId)`
4. Test `item.title.toLowerCase().includes(query)` and `item.url.toLowerCase().includes(query)`
5. Set `row.hidden = true/false` based on match
6. For matching rows, replace title/URL text nodes with highlighted fragments via `buildHighlightedText`
7. Update group count badge to show filtered count (or restore original count when filter cleared)
8. Hide group sections with zero visible items
9. Show `#filter-empty-state` when total visible count is zero and query is non-empty
10. Reset `itemListEl.scrollTop = 0` unconditionally

**Complexity:** O(n) where n = total item rows. Each row involves one Map lookup (O(1)) and two `String.includes` calls. No DOM creation — only show/hide toggling and text node replacement.

**Clear path:** When `query` is empty, all rows are unhidden, highlights are replaced with plain `textContent` from the cached item, group sections are shown, and the original `data-item-count` badge value is restored.

### 19.5 Event Flow

```
User types in #filter-input
  → input event fires
  → _filterQuery = filterInputEl.value
  → clearTimeout(_filterTimer)         // cancel pending debounce
  → _filterTimer = setTimeout(applyFilter, 150)  // 150ms debounce
  → ... 150ms elapses ...
  → applyFilter() runs (O(n) DOM visibility pass)
```

**Escape key:** `keydown` listener on `#filter-input` intercepts Escape, calls `e.preventDefault()` + `e.stopPropagation()` (prevents panel close), clears query, and calls `applyFilter()` synchronously (no debounce).

**Clear button:** `click` on `#filter-clear-btn` clears query, calls `applyFilter()` synchronously, returns focus to the input via `filterInputEl.focus()`.

**Re-render resilience:** At the end of `renderAll()`, if `_filterQuery` is non-empty, `applyFilter()` is called to re-apply the active filter to the freshly rebuilt DOM. This handles broadcast-driven re-renders without losing filter state.

### 19.6 HTML Additions

Added to `sidepanel.html` inside `#panel-header`:

- `#filter-container` — flex wrapper containing the input and clear button
- `#filter-input` — `type="search"`, `aria-label="Filter bookmarks"`, `autocomplete="off"`, `spellcheck="false"`
- `#filter-clear-btn` — `aria-label="Clear filter"`, initially `hidden`
- `#filter-empty-state` — `role="status"`, `aria-live="polite"`, `aria-atomic="true"`, initially `hidden`

### 19.7 CSS Additions

- `#filter-container`, `#filter-input`, `#filter-clear-btn`, `#filter-empty-state` layout and theming styles
- `mark` element highlight color via `--mark-bg` CSS custom property:
  - Light theme: `#fef08a` (yellow-200)
  - Dark theme: `#713f12` (yellow-900)

### 19.8 Service Worker & Message Contracts — No Changes

The filter operates entirely within the sidepanel JavaScript context. No new message types were introduced. No messages are sent to or received from the service worker during filter operations. The existing `MSG_BROADCAST_MUTATION` flow triggers `renderAll()`, which re-populates the cache and re-applies the active filter — no filter-specific SW coordination is needed.

### 19.9 Manifest Permissions — No Changes

No new permissions required. The filter reads only from in-memory cached data populated by the existing storage fetch in `renderAll()`.

### 19.10 Rollback Plan

**Risk:** None — no storage schema changes, no new message types, no manifest changes.

**Rollback procedure:** `git revert <commit-sha>` removes all filter UI and logic. No data migration needed. The cached variables (`_cachedItems`, `_itemById`, etc.) are inert when the filter code is absent — they are populated in `renderAll()` but never read outside of `applyFilter`/`buildHighlightedText`.

### 19.11 Deferred Items

| Item | Description | Candidate backlog ID |
|------|-------------|---------------------|
| Fuzzy search | Replace substring matching with Fuse.js or similar for typo tolerance | B-052 |
| Filter persistence | Preserve filter query across panel close/reopen via `sessionStorage` | Future backlog item |
| Filter by group/live-state | Scoped filter modes (e.g., "only live tabs", "only group X") | Future backlog item |
| Filter keyboard shortcut | Global `Ctrl+F` or `/` to focus the filter input | Future backlog item |

### 19.12 R2 Correctness Checklist (Post-Build Verification)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C-1 | Storage schema versioned | N/A | No storage schema changes. Filter state is ephemeral (module-level variables only). |
| C-2 | Message contracts typed | N/A | No new message types. Filter is entirely client-side. |
| C-3 | Service worker cold-start safe | PASS | No SW dependency. If SW restarts, `renderAll()` re-populates the cache from a fresh storage fetch, and `applyFilter()` re-runs. |
| C-4 | ID stability | PASS | Uses existing `item.id` via `data-item-id` attributes and `_itemById` Map. No new identity concerns. |
| C-5 | Manifest file references resolvable | N/A | No new files or manifest entries. |

---

