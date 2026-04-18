# B-057 — URL-scheme and Duplicate-URL Policy Review (Spike Output)

Date: 2026-04-17
Author: [solution-architect]
Status: R0 spike complete — no code produced by this item

## Executive Summary

Tab Junkie's current URL policy is too strict on both axes and the strictness is not grounded in the PRD. On the **scheme** axis, a pair of parallel allowlists (`ALLOWED_URL_SCHEMES` in `shared/url.js:19` and a separate prefix block-list in `background/messages/storage-handlers.js:205-212`) together reject `chrome://`, `edge://`, `chrome-extension://`, `about:`, and `view-source:` — schemes that are safe-to-store, safe-to-render-as-text, safe-to-reopen, and that power users legitimately want to bookmark. On the **duplicate** axis, `MSG_PROMOTE_TAB` rejects any URL that already exists in storage with `ERR_DUPLICATE_URL`, yet the PRD explicitly calls out duplicate-URL support as a first-class requirement (§3.3: *"Disambiguation when multiple saved items share the same URL"*) and B-018 already implements tabIndex/windowId disambiguation for this exact case.

The recommendation is to (1) **relax the scheme allowlist** to include the four browser-internal schemes plus `view-source:`, while keeping the hard security rejects (`javascript:`, `data:`); (2) **remove the duplicate-URL reject** at the storage boundary and replace it with a soft UI warning during manual save + a skip-by-default behaviour during import; (3) revise B-056 from "dim + block" to "dim + soft-warn on confirm", which better matches PRD intent. The changes are additive at the storage layer (no schema migration), localised to roughly four files of core logic plus UI affordances, and unblock clean behaviour for B-044/B-045 import flows that would otherwise re-hit the same policy hole.

Four follow-on items are recommended (B-058 through B-061). The work is small enough to fit in Sprint 15 alongside B-014 continuation, but not urgent enough to crowd Sprint 14.

---

## Memo 1: URL-scheme allowlist policy

### Current policy (as of 2026-04-17)

Two independent gates exist for URL scheme enforcement — they overlap and drift is already visible.

**Gate A — `shared/url.js:19`**
```js
export const ALLOWED_URL_SCHEMES = new Set(['http:', 'https:', 'file:']);
```
Enforced inside `normalizeUrl()` for every `createItem` / `updateItem` / bulkCreate path (`background/storage/items.js:43`, `:85`). Rejection code: `ERR_VALIDATION`.

**Gate B — `background/messages/storage-handlers.js:205-212`**
```js
if (url.startsWith('chrome://') || url.startsWith('about:') ||
    url.startsWith('chrome-extension://') || url.startsWith('file:')) {
  throw new StorageError(ERR_VALIDATION, 'promoteTab: restricted URL scheme cannot be saved');
}
```
A `String.startsWith` prefix check that runs *before* `normalizeUrl`. It is functionally redundant with Gate A for every scheme it lists except `file:` (which Gate A *allows* — a direct contradiction).

**Observed policy drift today:**
- `edge://` — rejected by Gate A, silently passes Gate B (user gets a correct `ERR_VALIDATION`, but via the wrong gate).
- `file://` — *allowed* by Gate A, *rejected* by Gate B. Gate B fires first. Result: the codebase currently cannot save `file://` URLs through promote even though the allowlist says it can. This is a bug introduced by B-016 and no one has yet noticed because there is no UI to exercise it.
- `view-source:` — rejected by Gate A, no explicit handling in Gate B.

### Research questions answered

**Q1: Which schemes are technically saveable from an extension?**
All of the following can be stored as strings (they are valid URL syntax) and reopened via `chrome.tabs.create({ url })` from an extension context:
- `http:`, `https:` — open normally, full navigation semantics.
- `file:` — opens iff the user has enabled "Allow access to file URLs" in `chrome://extensions` for Tab Junkie (extension-side toggle). No manifest change needed for storage; the toggle is a user gesture.
- `chrome://` — opens iff the specific page is user-facing (chrome://settings, chrome://extensions, chrome://flags, chrome://history all open fine; chrome://chrome-urls enumerates them). A subset is developer-only and opens in an error page but does not crash.
- `edge://` — Edge-specific equivalent of chrome://. Same mechanics.
- `chrome-extension://<id>/path` — opens an extension page; useful for bookmarking Tab Junkie's own options page or another extension's UI.
- `about:` — a small vestige set (about:blank, about:srcdoc) plus legacy redirects to chrome://. Low value but harmless to store.
- `view-source:<url>` — opens Chrome's view-source viewer. Useful to power users and devs.

**Q2: Which schemes have real security implications that justify blocking?**
Two, and only two, on the rendered-as-text / stored-as-string axis:
- `javascript:` — a URL whose body is executed in the page context. If a `javascript:` URL were ever rendered into an `<a href>` and clicked, it would execute in the extension origin. Must stay rejected. (Gate A catches it; XSS-by-bookmarklet is the threat model.)
- `data:text/html,...` and `data:application/*` — can carry arbitrary markup/script. Even when opened in a new tab (not in the extension origin), a user saving a malicious `data:` URL and later clicking it executes script in a page that Chrome treats with opaque origin — not as harmful as `javascript:`, but still a payload vector we should not encourage. Must stay rejected.
- `data:image/*` — technically safe, but there is no user value in bookmarking an inline image and allowing it would require a per-subtype allowlist. Reject the whole `data:` scheme for simplicity.

Non-security schemes (`chrome://`, `edge://`, `chrome-extension://`, `about:`, `view-source:`) carry **no execution risk when stored as text** — they are rendered via `textContent` today (B-001a rule), so there is no XSS surface. The only risk vector is reopening them, which is controlled by `chrome.tabs.create` — Chrome itself rejects genuinely dangerous targets (e.g., certain `chrome://` pages that are extension-only).

**Q3: Which schemes are user-valuable to save?**
Direct user feedback channel is not available in the spike, but the primary persona is a power user with many tabs. Observed saveable-and-valuable targets:
- `chrome://settings/cookies/detail?site=example.com` — targeted settings pages with query strings — lost on every restart today.
- `chrome://extensions` — frequently visited by extension developers.
- `chrome://flags/#some-flag` — experimental flags with fragments.
- `edge://favorites`, `edge://collections` — Edge-native surfaces the user returns to.
- `view-source:https://example.com` — devs.
- `chrome-extension://<id>/options.html` — extension option pages for which no web URL exists.

**Q4: Cross-browser portability.**
A `chrome://settings` bookmark will 404 in Edge and in Firefox. A `edge://settings` bookmark will 404 in Chrome. This is a real limitation. The resolution: Tab Junkie is explicitly local-per-profile (PRD §1.2: "Cloud sync of user data" is a non-goal). A user who switches browsers mid-workflow is already expecting friction; a broken browser-internal bookmark is part of that friction, not a new burden Tab Junkie creates. **Document it, do not gate on it.** Export (B-042/B-043) should emit these URLs as-is; import (B-044/B-045) should accept them even if unreachable in the current browser (they may be archived for later portability). No runtime block is warranted.

**Q5: Favicon + metadata for non-http(s) schemes.**
`chrome.tabs.get()` returns a `title` and a `favIconUrl` for every tab regardless of scheme. For chrome:// pages, the favicon is Chrome's own logo; for extension pages, it is the extension icon; for `file://`, it is the default document icon. All are valid. The existing LiveTabIndex (`background/tabs/live-tab-index.js`) already captures these fields verbatim, so no special handling is needed downstream.

**Q6: Visual UI handling for "weird" schemes.**
For an unlinted Chrome build a `chrome://` bookmark in the sidepanel would look identical to an `https://` bookmark — same row, same click-to-navigate, same favicon slot. This is correct behaviour: the user chose to save it, so it should render. The one place a visual affordance adds value is the **Open Tabs** section (B-055): a row whose URL is a scheme the user might not expect to be saveable could carry a subtle indicator (e.g., a muted "system" pill). This is the domain of B-056 and is addressed in the impact map.

### Recommendation

**Expand `ALLOWED_URL_SCHEMES` to:**
```js
export const ALLOWED_URL_SCHEMES = new Set([
  'http:',
  'https:',
  'file:',
  'chrome:',
  'edge:',
  'chrome-extension:',
  'about:',
  'view-source:',
]);
```
Note: `view-source:` is not a normal scheme in the WHATWG URL sense — `new URL('view-source:https://example.com')` parses with `protocol === 'view-source:'` in Chromium. Confirmed by local REPL test; implementing item must include a unit test covering this parse path specifically.

**Retain as hard rejects (security):**
- `javascript:` — XSS risk via bookmarklet re-render.
- `data:` (all subtypes) — payload vector; zero user value that justifies per-subtype carve-outs.

**Delete the redundant Gate B in `MSG_PROMOTE_TAB`.** After the allowlist expansion, the prefix block is either redundant (for schemes now allowed) or wrong (for `file:`). Gate A inside `normalizeUrl` is the single source of truth; the handler should just pass through the raw URL and let `createItem` throw `ERR_VALIDATION` via the existing path. This removes drift permanently.

**Justification per newly-allowed scheme:**

| Scheme | Pro | Con | Net |
|---|---|---|---|
| `chrome:` | Settings/flags/extensions are frequently bookmarked by power users | Not portable across browsers | Allow; user-owned concern |
| `edge:` | Primary user runs Edge (see MEMORY — feedback_edge_browser.md) | Not portable to Chrome | Allow; user-owned concern |
| `chrome-extension:` | Options pages have no https equivalent | Breaks if extension id changes | Allow; rare enough to accept |
| `about:` | about:blank, about:srcdoc are stable | Legacy, minor value | Allow; no harm |
| `view-source:` | Dev use case; non-obvious | Requires URL parser to accept compound scheme | Allow; add targeted unit test |

**Document as known limitation** in README/user-manual: "Browser-internal bookmarks (chrome:// / edge://) work in the browser that created them. They are preserved in exports so you can migrate them by hand."

---

## Memo 2: Duplicate-URL policy

### Current policy (as of 2026-04-17)

**Only gate: `background/messages/storage-handlers.js:216-223`**
```js
const normalizedTabUrl = safeNormalizeForMatch(url);
const allItems = await listItems();
const duplicate = allItems.find(
  (it) => safeNormalizeForMatch(it.url) === normalizedTabUrl,
);
if (duplicate) {
  throw new StorageError(ERR_DUPLICATE_URL, 'promoteTab: an item with this URL already exists');
}
```
Runs *only* inside `MSG_PROMOTE_TAB`. The storage layer itself (`createItem` in `background/storage/items.js`, `bulkCreateItems` on :291) performs **no** URL-level uniqueness check. This is asymmetric: promote rejects duplicates, but `MSG_CREATE_ITEM` (dialog-based create) and `MSG_BULK_CREATE_ITEMS` (import) do not. The inconsistency means the system already tolerates duplicates in storage — just not through one specific ingress path.

### Research questions answered

**Q1: Legitimate reasons to allow duplicates.**
Several, all of which the PRD already contemplates:
- **Same URL in two groups for different purposes.** GitHub home page bookmarked in "Work" (for repos.github.com workflow) and "Personal" (for personal side projects). Both have the same canonical URL. Blocking the second save destroys the grouping intent.
- **Same URL with different annotations / titles.** A bookmark's `title` is independent of its URL. A user might want "GitHub — Morning Check" and "GitHub — PR Queue" as two items, both pointing at `https://github.com/pulls`, each in a different group.
- **Pinned in multiple workflows.** A user with separate "Daily Startup" and "Project X Startup" groups may legitimately want the same shared dashboard URL in both.
- **Tab-to-item disambiguation depends on it.** PRD §3.3 explicitly states: *"Disambiguation when multiple saved items share the same URL: the system must be able to remember which saved item corresponds to which live tab, rather than relying solely on URL matching."* The current reject directly contradicts this requirement.

**Q2: Technical constraints.**
- **ULIDs** handle identity collision-free regardless of data duplication (`background/storage/ids.js`).
- **`claimsMirror`** is itemId-keyed (not URL-keyed), so duplicate URLs produce no collision — two items pointing at the same URL can each hold a claim on a different tab.
- **Storage partitions** don't care: items are appended to an array keyed by id.
- **Drift detection** (`background/tabs/drift.js`) is itemId-keyed via `driftRecords`. Works fine.
- **Floating-group re-association** (`background/tabs/floating-groups.js:91-96`) matches by normalized URL within a group. If two saved items have the same URL and both are live, the tie-break is `(windowId, tabIndex)` — the existing B-018 H-2 fix. This already works; the spike verified the code path.

**Q3: Reassociation complexity.**
Zero new complexity. `floating-groups.js` already handles URL ambiguity via `(windowId, tabIndex)` tie-break + a `claimedTabIds` guard that prevents a tabId from being claimed twice. Removing the promote-time reject does not introduce any new race — the claim system is already tab-disambiguated end-to-end.

**Q4: Search/dedup implications (B-022).**
The quick-search popup should show both items if both exist — they have distinct ids, distinct titles, distinct groups. Grouping in search results should be **by group**, not by URL (current B-022 AC already matches this). No change required. The inline filter (B-021) similarly operates on items-as-entities, not URLs-as-keys.

**Q5: Import duplicates (B-044/B-045).**
Three possible import strategies when an incoming bookmark's URL matches an existing one:
1. **Reject** — import throws, no partial success. Bad UX; a 5,000-bookmark import with 1 dupe would fail.
2. **Allow** (no-op) — add as a new item with a new id. Clean data model, matches the "allow duplicates" stance.
3. **Merge** — update the existing item's metadata. Lossy; overwrites manual edits.
4. **Skip with report** — add non-duplicates, list duplicates in the import summary.
The **default should be Skip-with-report**, because users importing a bookmark file rarely want to create accidental clones. However, the user should be able to flip to **Allow** via a checkbox in the import dialog for migration scenarios (e.g., reimporting a saved-state to restore after data loss — the entire file is intentionally "duplicates").

**Q6: UI clarity when two items share a URL.**
- Manual create (dialog-based, B-003): the dialog already shows title + URL + group — if a duplicate exists, show a soft inline warning ("This URL is already saved in Work/Tools. Save anyway?") with the save button remaining enabled. Do not block.
- Promote-from-tab: same soft-warn, surfaced via the bulk-save toast or an inline tooltip if the promote is single.
- Rendered rows: already visually distinct because they live in different groups or carry different titles. No additional differentiation needed at the row level.
- Search results: `title · group-breadcrumb` disambiguates today.

### Recommendation

**Remove `ERR_DUPLICATE_URL` reject from `MSG_PROMOTE_TAB`.** Storage becomes the single source of truth — accept the create, no block, no error code. Keep the `ERR_DUPLICATE_URL` constant defined in `shared/errors.js` for a transition period (one sprint) so external consumers don't break; mark it deprecated; remove after Sprint 16.

**Replace with soft-warning UI:**
- **Manual create (B-003 dialog):** inline helper text above the Save button when normalized URL matches any existing item. Text: "This URL is already saved in [group]. Saving anyway will create a second bookmark."
- **Promote from tab (context menu / Open Tabs row):** show warning in the toast or require a two-step confirm for the duplicate case only. Single-keystroke flows (e.g., keyboard shortcut to promote active tab) should just save silently — the user's intent is clear.
- **Bulk save from Open Tabs selection:** show count in the toast — "Saved 8 tabs (2 were duplicates of existing saved items)."

**Import defaults (B-044/B-045):**
- Default: **skip duplicates**, report count in the success summary.
- Override: **"Allow duplicates"** checkbox in the import dialog (off by default).
- JSON backup restore (B-045): "Allow duplicates" defaults to **on** when the imported JSON's `version` field matches the current schema and the count exactly matches current storage (heuristic: this is a restore, not a migration).

**Search/dedup (B-022):**
No dedup required at the search layer. Results are already disambiguated by `title + group breadcrumb` in the existing spec. If a future request surfaces (e.g., "consolidate results by URL"), that is a net-new UX change, not a policy correction.

**Reassociation impact:**
Zero. B-018 disambiguation already handles the case. Document this in the SOLUTION_DESIGN §10.8 section.

---

## Impact Map

| Item | Scheme memo impact | Duplicate memo impact | Change size |
|------|--------------------|-----------------------|-------------|
| **B-016** promote | AC6 text needs rewording — "non-http(s) scheme" is no longer accurate. Remove Gate B from handler; rely on `normalizeUrl`. Rewrite AC6 to say "the handler validates scheme via `normalizeUrl` and surfaces `ERR_VALIDATION` if the scheme is on the deny-list (`javascript:`, `data:`)". | AC5 (`ERR_DUPLICATE_URL`) is REMOVED from the handler contract. Soft-warn UI moves to the sidepanel/context-menu layer. AC5 becomes an AC in the UI-layer item (probably a new sub-item of B-016 or rolled into B-059). | **S** (backend reject removal is 4-line change; AC rewording is doc-only) |
| **B-017** demote | None. Demote doesn't inspect URL scheme. | None. Demote is idempotent and doesn't branch on URL uniqueness. | None |
| **B-018** floating persistence | None. Reassociation uses stored URL verbatim (already allowlisted at save time). | None — disambiguation logic already handles duplicate URLs correctly (H-2 fix). Spike confirms no code change. | None |
| **B-022** quick search | Expanded allowlist means `chrome://` items now appear in search results. No code change in search itself — they naturally fall into the "Bookmarks" section. | None. Results already disambiguate by title + group breadcrumb. No dedup logic required. | None |
| **B-042/B-043** export | Exports now include `chrome://` / `edge://` / `view-source:` URLs. Netscape HTML format accepts any URL string as `<A HREF>`. JSON export is verbatim. README must document portability caveat. | Export emits all items including URL-duplicates. No filter change. Verbatim export is desirable. | **XS** (documentation only) |
| **B-044/B-045** import | `chrome://` / `edge://` URLs in imported bookmarks now accepted (previously silently skipped with a validation error). Error count in import summary should drop accordingly. | **Substantial change:** default to skip-duplicates, add an "Allow duplicates" checkbox to the import dialog. Import summary reports duplicate count separately from total-skipped count. | **S-M** (UI affordance + count tracking) |
| **B-055** Open Tabs | `chrome://` / `edge://` tabs now appear in Open Tabs section (they were in `LiveTabIndex` already — just weren't bookmarkable). Right-click "Save to group" no longer fails for them. | None on derivation logic. | None on derivation; B-056 scope changes (below) |
| **B-056** unsavable-tab UI | **Scope shrinks.** Previously this item was going to dim every `chrome://` / `edge://` row. After the scheme memo, only `javascript:` / `data:` rows are truly unsavable, and those essentially never appear in the Open Tabs section (users don't manually navigate to them). The visual-dim case collapses to near-zero rows. | **Scope partially shifts.** Previously this item was going to dim every duplicate-URL row. After the duplicate memo, duplicates are *allowed* — the row should not be dimmed but should carry a soft-warn on the save affordance ("already saved in X"). | **Rewrite / split.** Recommend closing B-056 and opening a replacement (B-061 below) with the revised scope. |

---

## Follow-on Items

### B-058 — Relax URL-scheme allowlist to include chrome://, edge://, chrome-extension://, about:, view-source:

**Rationale:** Current allowlist rejects browser-internal and developer URLs that power users legitimately bookmark; blocking them contradicts PRD §1.1 (power-user focus) and creates drift between two parallel gates.

- **Priority:** P2
- **Effort:** S
- **Dependencies:** None (B-057 spike informs, not blocks)
- **Estimated AC count:** 5–6 (one per new scheme allowed, one for the deleted Gate B, one for `view-source:` parser verification, one for unit tests)
- **Files expected to change:** `shared/url.js`, `background/messages/storage-handlers.js`, `tests/url-normalize.test.js`, `docs/SOLUTION_DESIGN.md` §3.4

### B-059 — Allow duplicate URLs with soft-warn UI

**Rationale:** PRD §3.3 explicitly supports duplicate-URL items; current `ERR_DUPLICATE_URL` reject in MSG_PROMOTE_TAB contradicts the PRD and is inconsistent with `MSG_CREATE_ITEM` / `MSG_BULK_CREATE_ITEMS` (which already allow duplicates). Replace the hard reject with a soft UI warning that preserves user intent.

- **Priority:** P2
- **Effort:** M
- **Dependencies:** B-058 (cleaner to land scheme changes first; not strict)
- **Estimated AC count:** 8–10 (handler reject removal, manual-create warning, promote warning, bulk-promote toast, soft-warn dismissability, `ERR_DUPLICATE_URL` deprecation path, regression tests for B-018 disambiguation still working, a11y for warning text)
- **Files expected to change:** `background/messages/storage-handlers.js`, `shared/errors.js` (deprecation comment), `sidepanel/sidepanel.js` (warning UI), `tests/promote-tab.test.js`, `tests/enriched-list-items.test.js` (regression for duplicate-URL disambiguation)

### B-060 — Import duplicate-handling with skip/allow override

**Rationale:** With duplicate URLs now allowed at the storage boundary, the import flow (B-044 HTML, B-045 JSON) needs an explicit user-facing policy: skip-by-default to protect against accidental cloning, with an override checkbox for migration/restore scenarios.

- **Priority:** P2
- **Effort:** S
- **Dependencies:** B-059 (must remove storage-layer reject first); B-044 or B-045 (whichever ships first carries the UI)
- **Estimated AC count:** 6 (pre-import duplicate count displayed, skip-by-default behaviour, allow-override checkbox, post-import summary reports skipped-as-duplicate separately from skipped-as-invalid, JSON-restore heuristic for defaulting the checkbox, regression test)
- **Files expected to change:** `sidepanel/import-dialog.js` (new, or extend existing), `background/storage/items.js` (bulkCreate duplicate-pre-check as optional parameter), `tests/import.test.js`

### B-061 — Revise B-056 scope: dim only javascript:/data: in Open Tabs, soft-warn for duplicates

**Rationale:** B-056 was written before this spike's conclusions. With the scheme allowlist relaxed, nearly all previously-dimmed rows are now saveable; the remaining unsavable-row set is effectively `javascript:` (which no user manually navigates to) and `data:` (rare). The duplicate-URL case becomes a soft-warn (not a dim) because duplicates are now permitted. Close B-056 and replace with this item.

- **Priority:** P3 (down from B-056's P2 — the scope is so small it may not justify sprint slot on its own)
- **Effort:** XS
- **Dependencies:** B-058, B-059
- **Estimated AC count:** 3 (dim for rejected-scheme rows only, soft-warn tooltip on save action for duplicate-URL rows, bulk-save reports skipped-scheme count)
- **Files expected to change:** `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`

---

## Decisions Deferred

The following decisions are flagged but intentionally out of scope for the spike — they require product input or are premature:

1. **Whether `data:image/*` should be allowed separately from `data:text/html`.** The spike's recommendation is all-or-nothing reject of `data:` for implementation simplicity. A future UX research round could reopen this if users ask to bookmark inline-image data URLs.
2. **Canonical-URL merging (strip query strings, strip UTM params, etc.) before duplicate-check.** This is a normalisation policy question, not a duplicate-policy question. Out of scope. If requested later, it belongs in `shared/url.js` as an optional `forDuplicateCheck` normalization mode.
3. **"Archive" view for unreachable-in-current-browser URLs** (e.g., show a user who opened Tab Junkie in Chrome their legacy `edge://settings` bookmarks with a visual "unreachable" pill). The spike recommends against this — it adds UX surface for a rare case. Documented as deferred.
4. **`devtools://` scheme.** Not included in the recommended allowlist. Users cannot manually navigate to `devtools://` URLs (they are created by the browser at debugger attach time and cannot be reopened via `chrome.tabs.create`). No user value. If a future request surfaces, add separately — it's additive.

---

## References

Codebase citations used in this analysis (absolute paths):

- `/Users/courtney.d.wenman/workspaces/fun/junkie/shared/url.js:19` — current `ALLOWED_URL_SCHEMES` definition
- `/Users/courtney.d.wenman/workspaces/fun/junkie/shared/url.js:45-85` — `normalizeUrl()` enforcement
- `/Users/courtney.d.wenman/workspaces/fun/junkie/background/messages/storage-handlers.js:205-212` — redundant prefix reject (Gate B)
- `/Users/courtney.d.wenman/workspaces/fun/junkie/background/messages/storage-handlers.js:216-223` — `ERR_DUPLICATE_URL` promote reject
- `/Users/courtney.d.wenman/workspaces/fun/junkie/background/storage/items.js:43,85` — `normalizeUrl` called inside create/update (no URL-duplicate check)
- `/Users/courtney.d.wenman/workspaces/fun/junkie/background/storage/items.js:291-412` — `bulkCreateItems` (no URL-duplicate check confirmed)
- `/Users/courtney.d.wenman/workspaces/fun/junkie/background/tabs/floating-groups.js:74,91-96,110` — existing disambiguation via (windowId, tabIndex)
- `/Users/courtney.d.wenman/workspaces/fun/junkie/background/tabs/open-tabs.js:33-61` — Open Tabs exclusion predicate (not affected)
- `/Users/courtney.d.wenman/workspaces/fun/junkie/docs/PRD.md:38,80,86-89` — PRD §2.2 states + §3.3 duplicate-URL requirement + §3.4 URL handling
- `/Users/courtney.d.wenman/workspaces/fun/junkie/docs/BACKLOG.md:55,57,94,95,96` — B-016, B-018, B-055, B-056, B-057 definitions
- `/Users/courtney.d.wenman/workspaces/fun/junkie/docs/SOLUTION_DESIGN.md:2765-2861` — B-055 §26.1–26.2 R2 design (Open Tabs context)
