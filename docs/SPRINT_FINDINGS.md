# Sprint 9 — R4 Findings (Deduplicated)

## CRITICAL (must fix before R5)
_None_

## HIGH (must fix before R5)

| # | File | Finding | Fix |
|---|------|---------|-----|
| H-1 | `background/tabs/tab-events.js:122–127` | **B-015 single-tab drift race**: `clearDrift(releasedItemId)` is called but its Promise is not awaited before `broadcast()` fires. Broadcast reaches sidepanel before drift record cleared from storage — `refetchAndPatchLiveState` reads stale drift state. Bulk `windows.onRemoved` path correctly awaits. | Make `.then` callback `async`; add `await` before `clearDrift`. |
| H-2 | `sidepanel/sidepanel.js` (catch block in `refetchAndPatchLiveState`) | **B-011 catch-path cleanup race**: removes `.item-drifted-icon` and `.item-audible-icon` individually then checks `indicators.children.length`. If concurrent DOM mutation altered children between removes and check, container might not be cleaned. | Use `indicators?.replaceChildren()` to clear all children atomically, then `indicators?.remove()` unconditionally. |
| H-3 | `sidepanel/sidepanel.js:897` | **B-011 aria-label "URL drifted" is cryptic jargon** — WCAG 4.1.2 Name/Role/Value: screen reader users get no context. Compare audible's self-explanatory "Playing audio". | Change to `"Tab has navigated away from its saved URL"` |

## MEDIUM (fix if time permits)

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `sidepanel/sidepanel.js` (`_ensureIndicators`) | No `row.isConnected` guard — future call sites that skip the containment check could silently mutate detached nodes. | Add `if (!row.isConnected) return;` as first line of `_ensureIndicators`. |
| M-2 | `sidepanel/sidepanel.css:25` | `--drifted-color: #d97706` (amber-600) in light mode has ~3.0:1 contrast on white — borderline below WCAG AA 3:1 for non-text. | Shift to `#b45309` (amber-700, ~4.5:1). |
| M-3 | `sidepanel/sidepanel.js` (`_ensureIndicators`, `buildItemRow`) | SVG markup and indicator container creation duplicated between `buildItemRow` and `_ensureIndicators`. | Extract `_getOrCreateIndicators(row)`, `_createAudibleIcon()`, `_createDriftedIcon()` helpers. |
| M-4 | `sidepanel/sidepanel.js:872-873, 898-899` | `innerHTML` used for hardcoded SVG icons — not exploitable today but maintenance hazard (future interpolation risk). | Add `/* SECURITY: static SVG — do not interpolate user data */` comment, or build via `createElementNS`. |
| M-5 | `background/tabs/tab-events.js:183` | `Promise.all` in `windows.onRemoved` — one failing `clearDrift` blocks broadcast and other clears. | Use `Promise.allSettled` so partial failures don't suppress broadcast. |

## LOW (defer to future sprint)

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `sidepanel/sidepanel.js:862–867` | Fallback `row.appendChild(indicators)` when `.item-actions` absent — silent incorrect DOM order if row ever lacks actions. | Assert/warn if `actions` is null. |
| L-2 | `sidepanel/sidepanel.js:770–772` | `console.warn` logs internal message constant name — violates "no implementation detail in console" rule. | Shorten to `'[tab-junkie] Live state refresh failed — clearing indicators'`. |
| L-3 | `background/tabs/tab-events.js:70–72` | B-012 `tab/audible-changed` broadcast has no payload — sidepanel re-fetches ALL items per audible event. Consistent with favicon pattern, but inefficient at scale. | Future: targeted audible patch by tabId. |
