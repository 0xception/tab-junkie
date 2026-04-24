# UAT — B-046 Global Keyboard Shortcuts (Popup + Standalone)

Sprint 28 · Fast Track XS · **DEFERRED for user execution** (B-035 SW handler dependency must ship first)

Related artefacts:
- `docs/BACKLOG.md` — B-046 row
- `manifest.json` — `commands` block (lines 25–46)
- `background/service-worker.js` — `chrome.commands.onCommand` listener (B-023 / `group-jump` handler; `open-junkie-window` pending B-035)

Legend: **PASS** = matches expected · **FAIL** = deviation · **WARN** = passes but with a concern to log · **SKIP** = unable to execute (document why).

## Setup

The user runs **Microsoft Edge**, not Chrome. All browser URLs below use `edge://`; if the tester happens to run Chrome, substitute `chrome://`.

1. Load the unpacked extension: `edge://extensions` → Developer Mode on → "Load unpacked" → select the repo root.
2. Confirm Tab Junkie loads without errors in the extension's service-worker console.
3. Open any regular browser tab (e.g., `edge://newtab`) so keyboard shortcuts are not blocked by browser-reserved pages.
4. To verify remapping: `edge://extensions/shortcuts` — scroll to Tab Junkie.

---

## Test Cases

### UAT-1: Alt+J opens quick-search popup (B-022 regression check)

**Steps**:
1. Focus any normal browser tab.
2. Press **Alt+J**.
3. Observe whether the Tab Junkie quick-search popup appears.

**Expected**:
- Quick-search popup opens immediately.
- No console errors in the extension service worker.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-2: Alt+K opens group-jump popup (B-023 regression check)

**Steps**:
1. Focus any normal browser tab.
2. Press **Alt+K**.
3. Observe whether the Tab Junkie group-jump popup appears.

**Expected**:
- Group-jump popup opens immediately.
- No console errors in the extension service worker.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-3: Alt+Shift+J opens standalone Tab Junkie window (B-035 dependency)

**Prerequisite**: B-035 SW handler must be shipped and wired before this case can pass. If B-035 is not yet merged, mark **SKIP** with note "B-035 not yet landed."

**Steps**:
1. Focus any normal browser tab.
2. Press **Alt+Shift+J**.
3. Observe whether the standalone Tab Junkie window opens.

**Expected**:
- Standalone Tab Junkie window opens.
- No console errors in the extension service worker.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-4: Remap a shortcut and verify new binding works

**Steps**:
1. Navigate to `edge://extensions/shortcuts`.
2. Locate Tab Junkie. Find the "Open quick search popup" entry (currently Alt+J).
3. Click the edit field and record a new key (e.g., **Alt+Shift+Q**). Save.
4. Focus a normal browser tab. Press **Alt+Shift+Q**.
5. Confirm the quick-search popup opens.
6. Press **Alt+J** — confirm it no longer triggers the popup (binding has moved).
7. After testing, restore the original Alt+J binding via `edge://extensions/shortcuts`.

**Expected**:
- Remapped binding (Alt+Shift+Q) opens the popup.
- Old binding (Alt+J) no longer fires.
- No extension reload required for the change to take effect.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-5: Fresh profile — defaults are registered as expected

**Steps**:
1. Navigate to `edge://extensions/shortcuts` and scroll to Tab Junkie.
2. Confirm the displayed default bindings match:
   - "Open quick search popup" → **Alt+J**
   - "Jump to group" → **Alt+K**
   - "Open Tab Junkie window" → **Alt+Shift+J**
   - "Open side panel" → *(no default — blank)*
3. Confirm no two commands share the same key binding.

**Expected**:
- All three defaulted shortcuts are visible and correct.
- Side-panel entry is present with no default key (user-configurable only).
- Zero key conflicts.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

## Final UAT Summary

| # | Case | Result |
|---|------|--------|
| 1 | Alt+J opens quick-search popup (B-022 regression) | |
| 2 | Alt+K opens group-jump popup (B-023 regression) | |
| 3 | Alt+Shift+J opens standalone window (B-035 dependency) | |
| 4 | Remap via edge://extensions/shortcuts → new binding works | |
| 5 | Fresh profile defaults registered correctly, no conflicts | |

**Overall**: [ ] PASS / [ ] FAIL

**UAT performed by**: _______________________
**Date**: _______________________
**Browser + build**: _______________________

UAT-3 cannot be marked PASS until B-035 is merged. If UAT-3 is SKIP at sprint close, B-046 may still close as PASS on the remaining four cases — with a note that UAT-3 is deferred to B-035's UAT run.
