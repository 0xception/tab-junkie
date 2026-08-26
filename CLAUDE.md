# Tab Junkie

A Chromium extension that puts bookmark management and live tab management in one persistent surface. Vanilla JavaScript (ES modules), HTML, CSS, Manifest V3. No framework, no bundler, no backend, no network calls. Every byte of state lives in the user's local browser profile.

Browser APIs in use: `chrome.bookmarks`, `chrome.tabs`, `chrome.tabGroups`, `chrome.windows`, `chrome.storage`, `chrome.sidePanel`, `chrome.runtime`.

## Build & load

There is no compile step and no `dist/`. Load the repo root unpacked from `edge://extensions` (or `chrome://extensions`) with Developer Mode on. `./build.sh` produces `tab-junkie.zip` for Chrome Web Store submission only — you never need it for development.

Two things that will waste an hour if you forget them:

- Every `default_path`, `default_popup`, and `chrome_url_overrides` entry in `manifest.json` must point to a file that exists, or the extension refuses to load. A stub HTML file is enough.
- The service worker caches ES modules aggressively. After changing module-level constants (`DEFAULT_PREFERENCES`, validator allow-lists, schema constants), reloading the extension is not always enough — toggle it off and back on to flush the cache.

Note the user runs Edge. `chrome://` URLs don't resolve there; use the `edge://` equivalents.

## Layout

```
background/     service worker, storage layer, message handlers, tab tracking
sidepanel/      the main UI surface
newtab/         new-tab page override
popup/          toolbar popup + group-jump popup
settings/       settings page
shared/         modules imported by more than one surface
tests/          node --test suites, 177 files
docs/           architecture, backlog, sprint history, user manual
```

## Architecture invariants

These are load-bearing. Breaking one breaks the extension in ways that are hard to trace.

**The service worker is the sole writer.** Every write to `chrome.storage.local` goes through `writeTransaction(ops)` in `background/storage/write-transaction.js`. No other code path calls `chrome.storage.local.set`. The transaction does one `get`, applies mutators in declared order, validates shapes, then does one atomic `set`. A module-level promise chain serializes transactions so N's read follows N-1's write.

**UI surfaces cannot import storage.** Code in `sidepanel/`, `newtab/`, `popup/`, and `settings/` talks to the background through `shared/messages.js` + `chrome.runtime.sendMessage`, never by importing `background/storage/**` or `background/messages/**`. ESLint blocks this statically (`.eslintrc.json`); the dispatcher rejects it at runtime.

**`shared/messages.js` is an API.** Roughly 40 `MSG_*` constants define the contract between surfaces and the service worker. Changing a message shape is a breaking change — check every caller.

**Storage partitions** are namespaced under `tj:` — `tj:items`, `tj:groups`, `tj:floatingGroups`, `tj:itemClaims`, `tj:tabClaims`, `tj:recency`, `tj:meta`. Schema version lives in `KNOWN_VERSION` (`background/storage/migration.js`), currently **9**. Any change to a partition's shape means bumping that constant, updating the `defaultShape` seed for fresh installs, and writing down how to roll back.

**Cold starts are the normal case.** The service worker dies constantly. No entry point may assume in-memory state survived; everything re-hydrates from storage.

**Item identity must survive drift.** A saved item keeps its identity across URL changes, renames, and cross-window moves. That's what the claim/drift machinery in `background/tabs/` exists for.

## Security

Non-negotiable. This is an extension with broad tab access.

- Request the minimum `manifest.json` permissions. Current set: `tabs`, `tabGroups`, `storage`, `sidePanel`, `search`, `favicon`, `idle`. Adding one needs an explicit justification.
- No remote code. No `eval`, no `new Function`, no scripts loaded from URLs. CSP stays `script-src 'self'; object-src 'self'`.
- Bookmark titles and URLs are untrusted input. Render them with `textContent`, never `innerHTML`.
- Validate every `chrome.runtime.onMessage` payload. Never trust the shape or the sender.
- No network requests. If one is ever proposed it needs a user-facing privacy disclosure first.
- Sanitizers and validators use allow-lists, not deny-lists. Permit known-good fields; don't try to enumerate the bad ones.

## Privacy

Tab Junkie is local-only. No telemetry, no analytics, no crash reporting, no remote sync. Nothing leaves the browser.

Titles and URLs can contain personal data — don't log them to the console in code that ships.

## Code quality

- No TODOs in committed code. Finish it or leave it out.
- No commented-out blocks. Git remembers.
- No leftover `console.log`.
- Wrap `chrome.*` calls in real error handling. A missing or denied permission is a state to handle, not an exception to swallow.
- Handle every state a surface can be in: loading, empty, error, success, drifted, audible.
- Shared modules touch several entry points at once. Before changing something in `shared/`, check who imports it.

## Testing

`npm test` runs `node --test tests/*.test.js`. All of it must pass before a change is done — the suite currently sits around 2,200 assertions across 177 files.

- All Chrome API interaction in tests goes through `tests/chrome-mock.js`. Never stub `chrome.*` ad hoc.
- Every confirmed bug gets a regression test, written before the fix.
- Tests must be deterministic. A flaky test is a broken test.
- Fixtures should include the awkward states, not just the happy path: drifted items, audible tabs, nested groups, cross-window moves.

The mock has real limits. It cannot reproduce service-worker module-cache staleness, popup teardown when focus shifts away, or genuine Chrome rejection-string formats. Those need a manual pass in the browser.

## Performance budgets

- Sidepanel first paint under 200ms on a 500-item collection.
- Fuzzy search under 50ms P95 on 1,000 items.
- No full re-render for a single-item update. Patch the DOM.
- Scope storage reads to the affected partition rather than reading everything.
- Service-worker startup must not block the UI. Surfaces hydrate incrementally.

## Frontend & accessibility

Desktop Chromium only — no mobile layouts.

- Skeleton loaders for content areas, not spinners.
- Empty states get an icon, a message, and a clear call to action.
- Destructive actions (deleting groups, bulk removal) get a confirmation dialog.
- Every primary action is reachable by keyboard, with explicit focus management.
- ARIA roles on the tree and list structures. Visible focus indicators. Contrast at WCAG AA or better.

## Diagnostics

`shared/diag.js` is the only sanctioned diagnostic channel: `recordTrace(key, payload)`, `readTraces(prefix?)`, `clearTraces(prefix?)`. Entries live under `_diag_*` in `chrome.storage.local` and survive service-worker restarts.

Don't invent one-off debug keys outside that namespace. Clear traces before considering an investigation finished — diagnostic data must not ship.

Read them from the service-worker DevTools console:

```js
chrome.storage.local.get(null).then(r =>
  console.log(JSON.stringify(Object.fromEntries(
    Object.entries(r).filter(([k]) => k.startsWith('_diag_'))
  ), null, 2)))
```

## Debugging

Find all the plausible causes before fixing any of them. The first thing you spot is often one of several. This codebase in particular tends to fail in cascades: stale `chrome.storage` entries, missing manifest permissions, service-worker lifetime, message-passing races, tab and bookmark ID drift, event ordering. List the candidates, then propose a fix.

## Branching

- `main` — the shipped v1. Don't push v2 work here.
- `release/v2` — integration branch for the v2 rewrite. All feature work targets this.
- Feature branches cut from `release/v2` and PR back into it (`gh pr create --base release/v2`).

`release/v2` merges into `main` only when v2 is done and the user says so explicitly.

## Where things are documented

| Path | Contents |
|------|----------|
| `docs/SOLUTION_DESIGN.md` | Index of 80 architecture chapters. Read the specific chapter under `docs/design/`, not the index. |
| `docs/design/` | The chapters themselves. Storage schema, ID strategy, write boundary, message contract, error taxonomy, plus one per major feature. |
| `docs/BACKLOG.md` | User stories and acceptance criteria, including unstarted work. Large file — grep it. |
| `docs/user-manual/` | End-user how-to guides. |
| `CHANGELOG.md`, `docs/RELEASES.md` | Shipped history. |
| `docs/SPRINT_ARCHIVE.md`, `docs/findings/`, `docs/UAT_B-*.md` | Historical record of how it was built. |
| `docs/archive/sdlc/` | The retired multi-agent SDLC framework that produced all of the above. Reference only — none of it applies now. |

Historical documents use the old vocabulary: B-IDs, numbered rounds, gates, `[agent-name]` brackets. That's archaeology, not instruction.

## Current state

Shipped: **v1.42.1** on `release/v2`.

The branch `feature/sprint-48-unified-item-model` is ahead of `release/v2` and unmerged. It merges the two split top-level render pipelines — the synthetic `__ungrouped__` section for saved ungrouped bookmarks and the separate Open Tabs section for live unsaved tabs — into one top-level region, and lets floating tabs anchor under top-level bookmarks. Four items landed there (B-186, B-195, B-196, B-197). Reviews are clean, the suite passes, and there's no schema bump.

What it's waiting on: a manual pass in Edge. That's the only gate left before it can merge and ship as v1.43.0.

Known follow-ups, described in `docs/BACKLOG.md`: B-200 (drag-under-top-level hit-testing), B-198 and B-199 (the identity cutover and schema slim that were deliberately deferred out of this branch).
