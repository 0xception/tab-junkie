# UAT Plan — B-082: Popup "Open Side Panel" Button

**Sprint**: 28 · **Tier**: Fast Track XS · **Date**: 2026-04-23

---

## UAT-1 — Button renders and is focusable

**Steps**: Open the toolbar popup (keyboard shortcut or toolbar click).  
**Expected**: An "Open side panel" button is visible in the popup and reachable via Tab key. Focus ring is visible in both light and dark themes.  
**PASS / FAIL / WARN / SKIP**

---

## UAT-2 — Click opens side panel in active window

**Steps**: Open popup → click "Open side panel" button.  
**Expected**: Side panel opens in the currently active window. Popup closes automatically (standard browser-action behavior). No console errors.  
**PASS / FAIL / WARN / SKIP**

---

## UAT-3 — Full keyboard flow end-to-end

**Steps**: Activate popup via keyboard shortcut → press Tab to land on button → press Enter.  
**Expected**: Side panel opens in active window. Popup closes. No mouse interaction required at any step.  
**PASS / FAIL / WARN / SKIP**

---

## UAT-4 — Side panel already open

**Steps**: Open side panel manually → open popup → click "Open side panel" button.  
**Expected**: `chrome.sidePanel.open()` is a no-op (browser-native); side panel remains open and focused. Popup closes. No error shown.  
**PASS / FAIL / WARN / SKIP**

---

## UAT-5 — Error path: sidePanel.open() rejection

**Steps**: Simulate or observe a rejection from `chrome.sidePanel.open()` (e.g., by temporarily revoking the sidePanel permission in a dev build or triggering an unsupported context).  
**Expected**: Popup stays open. An inline error message is displayed (friendly text, not a raw stack trace). No unhandled exception in the service worker console.  
**PASS / FAIL / WARN / SKIP**
