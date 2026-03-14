# Settings Panel & Sync Tab Order

## Problem

When a user wants to force-sync all Junkie group orders into Chrome's tab strip, there's no way to trigger it. More broadly, Junkie has no settings UI despite having a gear button in the header and a preferences storage system ready to go.

## Solution

Add a settings panel that replaces the main content (show/hide, no animation for v1), starting with a single "Sync tab order" action. This establishes the settings area pattern for future features.

## Design

### Settings Panel

A full-height view that replaces the main content when the gear button is clicked. Simple show/hide toggle — hide `<main>` and normal header actions, show `#settings-panel`.

**Layout:**
- Header: `<button>` with Unicode left arrow (← `\u2190`) + "Settings" title, using existing `header-btn` pattern
- Body: scrollable list of settings sections, each with a heading, items with labels, descriptions, and controls

**First section — "Tab Sync":**
- Label: "Sync tab order"
- Description: "Reorder Chrome tabs to match Junkie"
- Control: "Sync now" button

**On panel open:** clear any active selection (`clearSelection()`) since the main content is hidden.

### Confirmation Dialog

Clicking "Sync now" shows a native `<dialog>` element via `showModal()`, consistent with existing Add Group and Edit Bookmark dialogs. This preserves keyboard accessibility (Escape to close, focus trapping).

- Text: "This will reorder your Chrome tabs to match Junkie's group order. Continue?"
- Buttons: Cancel (secondary), Confirm (primary)

Dialog setup lives in `sidepanel.js` inline (not `dialogs.js`) since it's a simple confirm/cancel with no form fields.

### Message Plumbing

New message type `SYNC_ALL_TAB_ORDER` (no payload). This is distinct from the existing `SYNC_TAB_ORDER` which takes a specific `tabOrder` array for per-group drag-and-drop sync. `SYNC_ALL_TAB_ORDER` has no payload because the service worker reads state itself.

The service worker handler:

1. Calls `broadcaster.getState()` to get the fully merged state (includes `floatingTabsByGroup` already computed). Cached state may be slightly stale (e.g., a tab closed since last broadcast), but this is safe because `syncTabOrderInChrome` already handles missing tabs via `.catch(() => null)`.
2. For each group, collects tab IDs in Junkie display order: bookmarked items by `sortOrder`, then floating tabs (which reflect their current Chrome `tab.index` position — floating tabs have no Junkie-defined order)
3. Calls `syncTabOrderInChrome(tabOrder)` for each group that has 2+ open tabs
4. Wraps logic in try/catch — returns `{ success: true }` or `{ success: false, error: message }`

### Post-Sync Feedback

After sync completes, show a brief inline status next to the button. This status is managed in JS state (a variable tracking feedback timeout), not as a DOM element that could be wiped by a state rebroadcast re-render. The render function checks this state and re-applies the indicator if a re-render occurs during the feedback window.

- Success: checkmark + "Done" that clears after 2 seconds
- Failure: "Failed" in red that clears after 3 seconds

**Button disabled state:** the sync button is disabled while the async operation is in flight. Re-enabled on both success and failure. Navigating away and back resets to default enabled state (the JS state is cleared on panel hide).

### Existing `SYNC_TAB_ORDER` handler fix

The existing handler (added in the tab-order sync PR) should also get a try/catch wrapper for consistency, returning `{ success: false }` on error instead of letting exceptions propagate.

## Files to Modify

| File | Change |
|------|--------|
| `shared/messages.js` | Add `SYNC_ALL_TAB_ORDER` constant |
| `background/service-worker.js` | Handle `SYNC_ALL_TAB_ORDER` — get state, iterate groups, collect tab IDs, call `syncTabOrderInChrome` for each. Add try/catch to existing `SYNC_TAB_ORDER` handler. |
| `sidepanel/sidepanel.html` | Add settings panel markup (hidden by default) + confirmation `<dialog>` |
| `sidepanel/sidepanel.css` | Styles for settings panel, settings items, back button |
| `sidepanel/sidepanel.js` | Wire gear button to toggle settings panel visibility (with `clearSelection()`), sync button to show confirmation dialog then send message, inline feedback with re-render resilience |

## Edge Cases

- No open tabs in any group: sync is a no-op, show "Done" anyway
- Tab closed between confirmation and execution: `syncTabOrderInChrome` already handles this via `.catch(() => null)`
- User clicks sync rapidly: button disabled during sync to prevent double-fire, re-enabled on success or failure
- State rebroadcast during feedback window: feedback indicator survives re-render via JS state

## Out of Scope

- Settings persistence (no toggle preferences yet — sync is an action, not a setting)
- Animated panel transitions
- Settings search
- Any settings beyond sync tab order
