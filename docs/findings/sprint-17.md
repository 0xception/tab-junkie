## Sprint 17 — B-065 [security-reviewer]

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM
_None_

### LOW
_None_

### Verdict

**PASS — clean.** 0 CRITICAL, 0 HIGH, 0 MEDIUM, 0 LOW. Pure refactor, zero attack-surface delta. **(1)** `manifest.json` and `shared/messages.js` untouched (`git status` confirms neither file appears in working tree) — zero permission delta, zero new message contracts. **(2)** Both new modules (`shared/aria-label.js` 35 lines, `shared/group-picker-core.js` 128 lines) are pure functions: grep for `chrome\.|console\.|innerHTML|eval|Function\(|fetch\(|XMLHttpRequest` returns zero hits in `aria-label.js` and one hit in `group-picker-core.js` which is the literal string "chrome.*" inside a doc-comment describing what the module *doesn't* do. No I/O, no storage, no network, no module-level mutable state. **(3)** XSS posture preserved: all 8 `buildItemRowAriaLabel` consumers in `sidepanel.js` (lines 1450, 1458, 2073, 2239, 2458, 2568, etc.) feed the return value into `row.setAttribute('aria-label', ...)` — attribute sink, never an HTML sink; no new `.innerHTML =` assignments introduced (grep clean). **(4)** The extracted helpers still treat all inputs as untrusted — the null-item guard (`if (!item) return 'Untitled'`) *tightens* the contract vs. callers having to guard individually, which is a defense-in-depth win, not a regression. `normalizeGroupPickerQuery` trims+lowercases the query; no regex construction from the query, no prototype pollution vector. **(5)** `buildGroupPickerRows` uses `Map` (not object literal) for `savedByGroup`/`openByGroup`/`groupById` — immune to prototype-pollution via a malicious `groupId` like `__proto__` or `constructor`. **(6)** Sentinel `'__ungrouped__'` is handled as an exclusion-only value; it is never used as an attacker-controlled key since it's a hardcoded constant. No findings, no nits. Ship it.

---

## Sprint 17 — B-065 [code-reviewer]

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `shared/group-picker-core.js:124–128` | `applyGroupPickerFilter` is exported but never imported by `sidepanel/sidepanel.js`. The sidepanel's `_applyGroupPickerFilter()` delegates only `normalizeGroupPickerQuery` from the shared module; the filter-predicate (`row.searchKey.includes(lower)`) remains re-implemented inline in the DOM-side function and again inside the test's local `applyFilter` wrapper — the false-green drift risk AC2 was meant to eliminate persists for this code path. The export is dead relative to the two consumers it was designed to serve. | In `sidepanel.js::_applyGroupPickerFilter`, import and call `applyGroupPickerFilter(rows, query)` using the last-built row descriptors to produce the visibility decisions, then apply `row.hidden` from the result. In `tests/b029-group-picker.test.js::applyFilter`, replace the local `includes(lower)` loop with a call to the shared export. DOM mutation (setting `row.hidden`, highlight reset, `aria-activedescendant` clearing) stays local as the architect intended. |
| M-2 | `shared/group-picker-core.js:82–84` | When `g.parentId` is set but `groupById.get(g.parentId)` returns `undefined` (orphaned child — parent was deleted between writes), `breadcrumb` silently remains `''` and `searchKey` drops to just the child's lowercase name. This matches the pre-refactor sidepanel behaviour exactly, so it is not a regression, but now that this is the canonical shared implementation future callers will rely on it without access to the sidepanel history that explains the silent fallback. | Add an inline comment at `group-picker-core.js:83`: "If parentId does not resolve (orphaned child), breadcrumb is empty and the row renders as top-level." No behaviour change required. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `tests/b027-group-header-menu.test.js:31` | The deferral comment is present and readable, satisfying AC3. However it does not cite the follow-up backlog id that AC7 requires ("filed as future tech-debt" without a `B-0??` anchor makes the deferral non-discoverable via backlog search). | Once the follow-up item is filed per AC7, update the comment to include the new backlog id, e.g. `// B-065 deferral: see B-0XX — extracting this helper requires consumer refactor (DOM + _pendingConfirm state).` |
| L-2 | `sidepanel/sidepanel.js:44–48` | The import aliases `_buildGroupPickerRowsShared` and `_normalizeGroupPickerQueryShared` carry a leading underscore. In this codebase underscore-prefix conventionally signals module-private functions defined in the file; imported bindings are neither. The `Shared` suffix is already sufficient disambiguation. A future reader doing a grep for private function definitions will get false hits. | Drop the leading underscore from the aliases: `buildGroupPickerRows as _buildGroupPickerRowsShared` could become `buildGroupPickerRows as buildGroupPickerRowsCore` or simply remove the underscore: `_buildGroupPickerRowsShared` -> `buildGroupPickerRowsShared`. |
| L-3 | `shared/group-picker-core.js:109–111` | `normalizeGroupPickerQuery` has a correctly typed JSDoc but no `@example`. Given it is now shared across production and tests, a one-line example (`normalizeGroupPickerQuery(' Docs ') // => 'docs'`) would match the documentation quality set by `buildItemRowAriaLabel` and aid discoverability for future callers. | Add one `@example` line to the JSDoc block. |

### Verdict

**PASS — READY FOR FAST TRACK CLOSE with M-1 and M-2 addressed before merge.** 0 CRITICAL, 0 HIGH. Both core invariants hold: no circular imports (both new shared files have zero import statements, confirmed by grep), and behavior is preserved byte-for-byte (function bodies in `shared/aria-label.js` and `shared/group-picker-core.js` are verbatim lifts confirmed against the removed diff blocks; 721/721 tests unchanged). The B-027 deferral comment is present at `tests/b027-group-header-menu.test.js:31`. The `normalizeGroupPickerQuery` split is architecturally defensible. M-1 (the `applyGroupPickerFilter` export is dead code relative to both intended consumers — filter-predicate drift risk survives) and M-2 (orphaned-parent edge case undocumented in the now-canonical shared location) must be resolved before merge. L-1 through L-3 are nits at author discretion.

---

## Sprint 17 — B-064 [code-reviewer]

### CRITICAL

_None_

### HIGH

_None_

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `docs/a11y-audit-B-064.md §7, row 1` | The audit correctly flags `.group-drag-handle` (L381) as out-of-scope non-text, but records dark `:hover` at 2.86:1 — below the non-text 3.0:1 minimum — and marks it only as "borderline; monitored" with no follow-up backlog id. Per the deferral-comment pattern established in B-027, an unanchored "monitored" note is non-discoverable via backlog search and risks being lost between sprints. | File a follow-up backlog item (e.g. B-065) covering the group-drag-handle and the other non-text borderline consumers, and annotate §7 row 1 with that id. No CSS change required for B-064 itself. |
| M-2 | `sidepanel/sidepanel.css:1396–1399` | The compound selector `.item-row[data-live-only="true"][data-unsavable="true"] .item-title, ... .item-url` promotes `.item-title` to `var(--text-secondary)` as a side effect of the token flip, but the audit's §5.2 blast-radius table lists only `.item-url` in the "After" column; `.item-title` is not acknowledged. In practice `.item-title` normally resolves to `--text-primary` through the base rule, so this compound selector's specificity overrides it to `--text-secondary` on unsavable rows — which may be intentional (B-061 dimming intent) but is undocumented. | Add a row in audit §5.2 explicitly acknowledging that `.item-title` on the unsavable variant is also promoted to `--text-secondary` by this rule and confirm this is intentional. If unintentional, split the compound selector to target only `.item-url`. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `docs/a11y-audit-B-064.md §6.4` | The after-state table for `data-unsavable="true"` rows documents base pre-opacity ratios but explicitly declines to make an AA commitment for the 0.55-opacity-dimmed state. This is defensible given B-061's intentional-semantic-cue framing, but leaves the effective pixel contrast unmeasured. A future auditor has no baseline to regression-test against. | Add an informational non-normative row estimating the effective ratio at 0.55 opacity against `--bg-primary` (e.g. L ~2.4:1 estimated, D ~3.6:1 estimated), annotated as "visual-cue surface, not AA-normative." This makes the trade-off explicit and auditable in future sprints. |
| L-2 | `docs/a11y-audit-B-064.md §7, rows 6, 8, 11` | Four out-of-scope body-text consumers are described as "flagged for future sweep." Row 4 names a candidate id ("B-065+") but rows 6 (`group-items-empty`), 8 (`.context-menu-label`), and 11 (`.open-tabs-empty`) have no backlog anchor, leaving three known AA gaps untracked. | Assign a single follow-up backlog id to all four body-text consumers and update each row's Notes column with that id. |

### Verdict

**PASS — READY FOR FAST TRACK CLOSE.** 0 CRITICAL, 0 HIGH. The 3-line CSS diff is correct, minimal, and precisely scoped. All 8 non-selected AC1/AC2 cells pass at or above 5.25:1 (AA floor 4.5:1). AC3 italic live-only variant is covered in §6.3 with its own table showing AA compliance while retaining italic. AC4 consumer inventory enumerates all 11 `--text-tertiary` rules with 3 fixed and 8 correctly triaged out-of-scope. AC5 audit file is present and complete across all 11 sections. AC6 option rationale is documented in §5. No dead code, no stray changes, 721/721 tests unaffected. M-1 (unanchored non-text borderline gap on drag handle) and M-2 (undocumented `.item-title` side-effect in the compound selector) should be resolved before sprint close; neither blocks merge. L-1 and L-2 are documentation nits at author discretion.

---

## Sprint 17 — B-064 [security-reviewer]
### CRITICAL
_None_
### HIGH
_None_
### MEDIUM
_None_
### LOW
_None_
### Verdict

**PASS — CLEAN.** Attack surface confirmed empty. `git diff sidepanel/sidepanel.css` shows exactly three hunks, each a single-token swap `var(--text-tertiary)` → `var(--text-secondary)` on `.item-url` selectors (lines 512, 1383, 1396) — no new selectors, no `url()`/`@import`/`expression()`/external fetches introduced, no CSS variables defined or redirected. Zero JS changes attributable to B-064 (sidepanel.js / shared/ / background/ deltas belong to B-065 and are out of scope for this review). Zero `manifest.json` changes — confirmed via `git diff --stat`. No new user-input surfaces; CSS custom properties are hardcoded design tokens with no user-controlled path reaching them. `docs/a11y-audit-B-064.md` is plain Markdown documentation (no executable content, no embedded scripts, no fetchable links that alter extension behavior). No CSP implications — no `style-src` relaxation, no inline-style injection vectors, and Manifest V3 CSP remains strict. No privacy implications — no telemetry, no logging of URLs/titles added. Safe to merge from a security standpoint.

---

## Sprint 17 — B-042 [security-reviewer]
### CRITICAL
_None_
### HIGH
_None_
### MEDIUM
_None_
### LOW
_None_
### Verdict

**PASS — CLEAN.** XSS surface systematically reviewed against every injection vector.

**Text-context escaping (H-1):** Every `title`/`name` insertion in `background/export/html-export.js` routes through `htmlEscape`: `renderItem` line 64 (`item.title`), `renderFolder` line 91 (`group.name`), top-level Ungrouped line 157 (constant, still escaped defensively). No raw concatenation bypasses — verified by grep for `item.title`/`group.name` across the file.

**Attribute-context escaping (H-2, H-3):** `HREF`, `ICON`, `ADD_DATE`, `LAST_MODIFIED` all flow through `htmlEscape` which encodes the five critical chars including `"` → `&quot;` and `'` → `&#39;` (shared.js lines 23-32). An attacker-supplied URL like `https://a.test/"><img src=x onerror=alert(1)>` is rendered inert (test line 307 proves `"><img` does not appear in output; `&quot;&gt;&lt;img` does). Timestamps pass through `toUnixSeconds` → integer, then through template literal — defense-in-depth confirmed.

**XSS test coverage (H-5):** `tests/b042-html-export.test.js` covers the text probe `</A><script>alert(1)</script>` (line 291) AND the attribute-breakout probe (line 305). Both assertions confirm the raw byte sequences are absent from output. Group-name escaping also tested (line 316 — `Dev & <QA>` → `Dev &amp; &lt;QA&gt;`).

**Sidepanel Blob handling (H-6):** `sidepanel.js:1408` — the MIME type is sourced from `data.mimeType` (SW response), which the dispatcher hardcodes to `EXPORT_MIME_TYPES.html` (`text/html`). No caller path passes user-controlled MIME. `_triggerBlobDownload` is only invoked from `_exportCollectionAsHtml` with SW-returned values. Blob URL is revoked via `queueMicrotask` after click — no lifetime leak.

**Payload size (H-7):** Response is a single string; 1000-item collection ≈ 265KB, well below Chrome's ~64MB `sendMessage` cap. `size: content.length` is informational only, no DoS surface.

**Network egress (H-8):** Grep for `fetch|XMLHttpRequest|xhr|WebSocket` in `background/export/` returns zero. Export is 100% local.

**PII in console (H-9):** Grep for `console.(log|info|debug|warn)` in `background/export/` returns zero. Sidepanel `_exportCollectionAsHtml` catch block uses a "code-only fallback message" per AC11 privacy comment (sidepanel.js:1418) — no title/URL logging.

**Manifest permissions (H-10):** `git diff main..HEAD -- manifest.json` shows only a version bump (`0.2.0` → `1.11.0`); permissions array unchanged (`["tabs", "tabGroups", "storage", "sidePanel", "search"]`). Zero new permissions for export functionality — as claimed.

**Dispatcher validation:** `storage-handlers.js:399-410` enforces `format === 'html'` via `ERR_VALIDATION`. AC5 sender gate (`sender.id !== chrome.runtime.id`) blocks foreign-origin export requests — no external exfil vector.

**Defensive depth guard:** `MAX_GROUP_DEPTH = 2` recursion cap in `renderFolder` prevents a runaway render if storage invariants are ever relaxed. No stack-exhaustion or ReDoS vectors identified — `htmlEscape` uses a linear regex with no backtracking.

Safe to merge from a security standpoint.

---

## Sprint 17 — B-042 [code-reviewer]

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `background/messages/storage-handlers.js:403` | **Format guard duplicates `EXPORT_FORMATS`**. The inline check `p.format !== 'html' && p.format !== 'json'` is a second source of truth for the canonical `EXPORT_FORMATS` array defined in `shared/export-schema.js` (line 25). When B-043 ships a third format the guard must be updated separately, risking drift. | Replace the two-part inequality with `!EXPORT_FORMATS.includes(p.format)`. Import `EXPORT_FORMATS` and add it to the existing import from `export-schema.js` on lines 48–51. |
| M-2 | `background/export/html-export.js:157` | **Ungrouped `<H3>` missing `ADD_DATE`/`LAST_MODIFIED` attributes**. Named group folders emit `<H3 ADD_DATE="..." LAST_MODIFIED="...">` (line 97). The Ungrouped folder header at line 157 emits a bare `<H3>Ungrouped</H3>` with no timestamp attributes. Importers that require valid timestamps on all `<H3>` nodes (e.g. Firefox) will either substitute `0` or reject the folder. AC4 requires all entries to carry unix-second timestamps. | Use a synthetic epoch of `0` for both attributes: `<DT><H3 ADD_DATE="0" LAST_MODIFIED="0">Ungrouped</H3>`. This matches how browsers emit the "Other Bookmarks" folder when timestamps are unavailable. Update the AC3 Ungrouped-suppressed test to assert the attributes are absent only when the folder itself is absent. |
| M-3 | `sidepanel/sidepanel.js:1427` | **`_exportCollectionAsHtml()` return promise is silently dropped**. The click handler `() => { _exportCollectionAsHtml(); }` discards the returned Promise. An async rejection that escapes the internal `try/catch` (e.g. an unexpected throw before the `try` block) becomes an unhandled rejection with no user feedback. | Add `void` before the call — `void _exportCollectionAsHtml()` — to signal intentional fire-and-forget and silence linter warnings. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `background/messages/storage-handlers.js:420` | **`'html'` extension is hardcoded rather than derived from format**. `buildFilenameWithDate(EXPORT_FILENAME_PREFIXES.html, 'html')` passes the extension as a literal. When B-043 adds the `'json'` branch the extension will need a parallel literal, creating a second copy-paste opportunity. | Add `EXPORT_FILENAME_EXTENSIONS: Object.freeze({ html: 'html', json: 'json' })` to `shared/export-schema.js` and use it in the handler. Not blocking for B-042. |
| L-2 | `background/export/html-export.js:89` | **Over-depth group suppression is silent**. `if (depth > MAX_GROUP_DEPTH) return ''` correctly guards against runaway recursion but drops the group and all its descendants with no diagnostic trace. A future storage relaxation allowing depth-3 groups would silently omit them from the export without any signal to the developer testing the extension. | Add a `console.warn('buildHtmlExport: group depth exceeded, skipping', group.id)` (code and ID only — no title, no URL) inside the guard. |
| L-3 | `sidepanel/sidepanel.js:1414–1415` | **`itemCount` / `groupCount` declared as separate `const` lines then used inline**. Minor style inconsistency with the destructuring pattern used elsewhere in the file. | Replace with `const { filename, mimeType, content, itemCount, groupCount } = data;` and call `_triggerBlobDownload(filename, mimeType, content)`. |
| L-4 | `shared/messages.js:78` | **`size` typedef comment says "UTF-16 code units" without byte-budget context**. For a future JSON export with many non-ASCII bookmark titles this distinction matters to any consumer computing byte budgets for storage or transfer limits. | Amend to `content.length (UTF-16 code units; not equal to byte length for non-ASCII content)`. |

### Verdict

**PASS with MEDIUM findings — READY FOR R5 after M-1, M-2, and M-3 are fixed.** 0 CRITICAL, 0 HIGH. Architecture is sound: `_triggerBlobDownload` lives in the sidepanel (not SW) per §32.7.3; `htmlEscape` escaping single-quote as defense-in-depth is safe and test-verified; `countNonEmptyGroupsForHtml` correctly drives AC7 toast copy; safe-mode classification is confirmed correct. The real-dispatcher integration test is present per Sprint 15 retro. XSS probes are non-trivial and cover title, URL attribute-context, and group-name vectors. M-1 (format guard diverges from `EXPORT_FORMATS`) and M-2 (Ungrouped `<H3>` missing AC4-required timestamps) are required fixes before R5. M-3 (unhandled promise on click handler) is a low-risk reliability gap also recommended before R5. L-1 through L-4 are at author discretion.

---

## Sprint 17 — B-042 [qa-reviewer]

### CRITICAL
_None._

### HIGH

| # | File | Finding | Fix |
|---|------|---------|-----|
| Q-1 | `background/export/html-export.js:122-173` + `background/messages/storage-handlers.js:413-415` | **Orphan items silently dropped, contradicting handler contract.** Handler comment says "items whose group no longer exists fall through to Ungrouped on re-import" but the builder does not implement that rescue: items with a non-null `groupId` are bucketed into `itemsByGroupId.get(<missing-id>)`, which no `renderFolder` call ever reads because the group record is absent from `childrenByParentId`. If the storage state ever has a stale `item.groupId` (race between `deleteGroup` + export, recovery from a partial migration, or a future bug), those items disappear from the exported file without warning — AC11 says we ship all saved data. Zero test covers this. **Fix (pick one):** (a) After bucketing, spill unresolved-groupId items into `ungrouped`; (b) Emit a dedicated `Orphans` folder; (c) Treat as a validation error and surface via `ERR_CORRUPT_DATA`. Update the handler comment to match whatever the builder does, and add a regression test with one orphan item. |
| Q-2 | `tests/b042-html-export.test.js` (absent) | **No timing test for AC9 (< 500ms P95 on 1000-item / 100-group corpus).** AC9 is an explicit PASS/FAIL metric; R5 coverage should wrap `buildHtmlExport` + `countNonEmptyGroupsForHtml` on a seeded 1000-item / 100-group fixture with `performance.now()` and assert median of 5 runs is under a CI-headroom threshold (e.g., `< 1500ms` to absorb jitter). The test-engineer owns this at R5 — flagging it now because no such case exists yet. |
| Q-3 | `sidepanel/sidepanel.js:1412-1416` | **Toast copy diverges from AC7 literal.** AC7 specifies exactly `Exported {N} bookmarks across {M} groups`. Implementation appends ` to {filename}`. Useful UX, but it is AC-literal drift that [test-engineer] will catch at UAT. Either update AC7 to bless the filename suffix (PM call) or strip the suffix to match AC7 literally. |

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| Q-4 | `tests/b042-html-export.test.js` (absent) | **No test for unicode / emoji title preservation.** Regression where the builder accidentally ASCII-escapes non-BMP code points wouldn't be caught. Add a test with title `Café 日本語 🚀` asserting exact byte survival in output. |
| Q-5 | `tests/b042-html-export.test.js` (absent) | **No test for items with null / undefined title.** `renderItem` does `htmlEscape(item.title \|\| '')`, emitting `<A ...></A>` — a zero-length anchor. Add a test asserting current behavior (empty anchor) and decide if we should fall back to `item.url` as the visible label. AC4 does not document this fallback; PM decision needed. |
| Q-6 | `tests/b042-html-export.test.js` (absent) | **No test covering `ERR_NOT_READY` / cold service worker.** `registerStorageHandlers(Promise.resolve())` bypasses the readyPromise in every test; the real production path awaits storage init. Add one test that passes an unresolved promise and asserts the dispatch awaits it (or, if the handler short-circuits with `ERR_NOT_READY`, that the sidepanel toast is user-friendly — see Q-8). |
| Q-7 | `tests/b042-html-export.test.js` (absent) | **No test asserting safe-mode passthrough for read-only export.** SOLUTION_DESIGN §32.3 relies on `MSG_EXPORT_COLLECTION` being absent from `WRITE_MESSAGE_TYPES`. Add a test that enters safe-mode (schema downgrade) and confirms a `format: 'html'` dispatch still succeeds. Protects the invariant against a future refactor accidentally adding export to `WRITE_MESSAGE_TYPES`. |
| Q-8 | `sidepanel/sidepanel.js:1421` | **AC8 error toast copy is generic for every failure.** AC8 says "a brief human reason (e.g., `Export failed: unable to read bookmarks`)". Implementation shows the same `Export failed — try again` for every `err.code` including `ERR_VALIDATION`, `ERR_NOT_READY`, and (hypothetically) `ERR_SAFE_MODE`. Map the top 2-3 error codes to human strings with a generic fallback. |
| Q-9 | `background/messages/storage-handlers.js:406-410` + `sidepanel/sidepanel.js:1417-1422` | **`format: 'json'` error is integration-tested but never surfaces in a friendly way.** The `ERR_VALIDATION` "JSON export is not yet available" string only lands in `console.warn`; user sees "Export failed — try again". No current sidepanel UI dispatches JSON, so this is moot today — but when B-043 lands in Wave 4 the path becomes user-visible. Either defer or map now to shrink the Wave 4 lift. |
| Q-10 | `background/messages/storage-handlers.js:427` | **`size` is reported as `content.length` (UTF-16 code units), not UTF-8 byte length.** For ASCII content the values match, but any emoji / non-BMP title diverges. Either rename to `charCount`, or compute `new TextEncoder().encode(content).length`. Informational today (no consumer acts on `size`), but a latent correctness bug — and overlaps with [code-reviewer] L-4 on the typedef comment. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| Q-11 | `tests/b042-html-export.test.js` (absent) | **No test for 10k-character title.** Defensive; `htmlEscape` is O(n) so not a hot risk, but worth one assertion that a 10k title survives without truncation and without perf collapse. |
| Q-12 | `tests/b042-html-export.test.js` (absent) | **No test for items with identical URLs across groups** — B-058 policy permits them. Confirm both entries are emitted. |
| Q-13 | `tests/b042-html-export.test.js` (absent) | **No `buildHtmlExport`-level test for missing `createdAt` / `updatedAt`.** `toUnixSeconds(undefined) → 0` is unit-tested in isolation; add an end-to-end builder test asserting `ADD_DATE="0"` lands in output when the item has no timestamp. |
| Q-14 | `tests/b042-html-export.test.js` (absent) | **No test for a sub-group whose parent record is missing (orphan sub-group).** Sibling to Q-1 but for groups — a `childrenByParentId` entry whose parent group record is absent is never rendered. Intentional? Document or fix. |
| Q-15 | `tests/b042-html-export.test.js` (absent) | **No test for a group literally named `Ungrouped`.** Overlaps with [code-reviewer] M-2: once Ungrouped gains `ADD_DATE`/`LAST_MODIFIED`, confirm a user-created `Ungrouped` group doesn't collide with the virtual folder during re-import. Add a regression test that documents the behavior. |
| Q-16 | `sidepanel/sidepanel.css:582-593` | **No explicit `:focus-visible` rule on `.header-add-btn`.** Button is focusable (AC1 satisfied) but relies on browser-default ring; sibling controls like `.group-header` (line 542) have explicit focus-visible styles. Consistency nit; not an AC-blocker. |
| Q-17 | `background/export/html-export.js:182-204` | **`countNonEmptyGroupsForHtml` walks items twice** (once inside build, once in count). Negligible at 1000 items; could be fused with `buildHtmlExport` returning the count as a tuple. Tech-debt note. |

### UAT scenarios

Proposed UAT cases for [test-engineer] at R5 (load unpacked in Edge + dev fixtures):

1. **UAT-01 Happy path.** Seed 3 items across 2 named groups + 1 ungrouped. Click Export → HTML. File downloads with today's local-date filename; toast reads `Exported 3 bookmarks across 3 groups to tab-junkie-bookmarks-…`. PASS if counts + filename correct.
2. **UAT-02 Keyboard-only invocation (AC1).** Tab into the header. Focus ring lands on Export button. Press Enter. File downloads. PASS if activation works with zero mouse and focus indicator is visible.
3. **UAT-03 Edge/Chrome re-import round-trip (AC2 + AC3).** Take the UAT-01 export → Edge `edge://favorites` → Import bookmarks from HTML. PASS if Tab Junkie group tree mirrors 1:1 (name, nesting, order, item titles, URLs).
4. **UAT-04 Firefox re-import cross-browser (AC2).** Repeat UAT-03 in Firefox → Library → Import HTML. PASS if accepted without errors.
5. **UAT-05 XSS probe (AC10).** Seed item with title `</A><script>alert(1)</script>` + URL `https://safe.example/`. Export → re-import into Chrome → click the re-imported bookmark. PASS if title displays as literal text and NO alert fires.
6. **UAT-06 Empty collection.** Clear all items and groups. Click Export. PASS if a valid HTML file still downloads (root DL only), toast reads `Exported 0 bookmarks across 0 groups…`, and Chrome re-import accepts it without error.
7. **UAT-07 Large-collection perf (AC9).** Seed 1000 items / 100 groups via dev fixture. Click Export, measure with DevTools Performance. PASS if median of 5 runs ≤ 500ms.
8. **UAT-08 Unicode preservation.** Seed item with title `Café 日本語 🚀`. Export. Open file in UTF-8-aware editor. PASS if bytes match exactly; re-import and confirm title renders.
9. **UAT-09 Failure path — SW killed mid-export.** DevTools → Application → Service Workers → Stop, then click Export. PASS if error toast appears and no partial file lands on disk.
10. **UAT-10 No blob leak (AC6).** Click Export 10× rapidly. PASS if 10 downloads complete and DevTools Memory snapshot shows no retained `Blob` / `ObjectURL` references.
11. **UAT-11 Download prompt / pop-up blocker.** If Edge enforces an extensions-initiated-download prompt, confirm one activation = exactly one download. PASS if user can suppress/allow without breaking the flow.
12. **UAT-12 Safe-mode passthrough (Q-7 confirmation).** Force safe-mode (manual schema-version bump via DevTools). Click Export. PASS if HTML export succeeds even though item writes are blocked with `ERR_SAFE_MODE`.

### Verdict

**CONDITIONAL PASS — 3 HIGH findings block R5.** Q-1 (orphan items silently dropped) is a functional correctness gap that needs code + regression test before [test-engineer] absorbs UAT; Q-2 (perf timing test for AC9) and Q-3 (toast copy literal drift) must also land before R5 is declared done. MEDIUM findings Q-4…Q-10 are predominantly test-coverage and user-facing-copy gaps that [test-engineer] can absorb at R5 in a single pass. LOW findings can defer. The feature shape is sound and closely matches the R2 design; the one behavioral deviation (Q-1) slipped because the handler comment assumed a rescue the builder doesn't perform.

---

## Sprint 17 — B-043 [code-reviewer]

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `background/export/json-export.js:43–49` | **`compareNullFirst` accepts `undefined` but the schema contract uses `null` only.** The comparator treats `undefined` and `null` identically (`return -1` for either). If any stored record ever carries `groupId: undefined` (e.g., a migration gap or a malformed create) it sorts as null-first rather than exposing the anomaly. The sort silently masks a data quality issue that the importer B-045 would then have to handle. | Restrict the guard to `a === null` and `b === null`; add a defensive `console.warn` (key-only, no PII) if `undefined` is encountered so the data quality gap surfaces during development. |
| M-2 | `background/messages/storage-handlers.js:415–416` | **`listItems()` + `listGroups()` are two sequential reads with no consistency guarantee.** A concurrent `MSG_DELETE_GROUP` arriving between the two calls could produce an items snapshot that references a group ID absent from the groups snapshot, triggering orphan rescue in `buildJsonExport` for a group that was live at read time. The handler comment acknowledges the race but misclassifies it as "rare" with no mitigation. For a read-only export this is acceptable only if documented as a known limitation in `SOLUTION_DESIGN.md`. | Either (a) wrap both reads in a single `chrome.storage.local.get` across the two partition keys (guaranteed atomic snapshot), or (b) document the race explicitly in `SOLUTION_DESIGN §32.13 F-3` as a known limitation with justification. This is a correctness-vs-simplicity tradeoff that [solution-architect] should record. |
| M-3 | `background/export/json-export.js:167` | **`preferences` truthiness check silently drops a stored empty-object `{}`.** `if (preferences && typeof preferences === 'object')` is false when `preferences` is `{}` because `{}` is truthy — actually this is correct — but `null` and `undefined` are the only falsy non-object values the handler can pass. The real gap is that a persisted `tj:prefs = {}` (an empty patch written by `setPreferences({})`) passes the truthy check and emits `"preferences": {}` which is technically correct per §32.5.4 but may confuse B-045 importers expecting the key to carry at least one field. | Change the guard to `if (preferences !== null && preferences !== undefined)` for explicitness. Add a comment documenting that an empty `{}` preferences object is a valid edge case (user explicitly reset all prefs) and that B-045 must handle it. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `background/export/json-export.js:61` | **`compareItems` coerces `id` to string via `String(a.id ?? '')` but `makeItem` fixtures always use string IDs.** ULID IDs are always strings, so the coercion is dead code in practice. The `?? ''` fallback means a null/undefined `id` sorts identically to an item with id `''` — a vacuous tiebreak that hides a corrupt record. | Replace with a direct `a.id < b.id ? -1 : a.id > b.id ? 1 : 0` and add a `|| ''` fallback only with a comment that an absent `id` is a schema violation. |
| L-2 | `sidepanel/sidepanel.js:1476` | **`console.warn('export failed:', code)` in the JSON error path duplicates the same warn in the HTML path (line 1443).** Both branches call the same `_exportErrorToast` and produce identical console output. The warn pattern is correct (code-only, no PII), but both branches should ideally route through a single shared warn-then-toast helper to prevent the two copies from diverging in future sprints. | Extract `_handleExportError(err)` — one `console.warn` + `showToast(_exportErrorToast(code))` — and call it from both `_exportCollectionAsHtml` and `_exportCollectionAsJson`. |
| L-3 | `tests/b043-json-export.test.js:9–22` | **AC9 is labelled as the button-to-download-prompt wall-clock test, but the test only measures `buildJsonExport` CPU time.** The storage reads (`listItems`, `listGroups`, the `tj:prefs` probe) are excluded from the budget. The in-process chrome-mock is synchronous so omitting them is harmless for the automated test, but the AC text says "wall-clock measured from trigger to download-prompt" which would include the storage reads. | Add a comment in the test acknowledging that the chrome-mock's synchronous storage makes the storage-read latency negligible; the CPU-only measurement is therefore a conservative lower bound. No code change needed, just inline documentation. |
| L-4 | `tests/b043-json-export.test.js:22` | **AC9 (button → download-prompt) is listed in the AC-mapping comment but no test covers the sidepanel-level flow (button click → dispatch → blob download).** The 500ms budget is asserted at the builder level only. A future regression in the handler or the blob-trigger path wouldn't be caught. | Add a shallow integration test that stubs `_triggerBlobDownload` (or asserts `URL.createObjectURL` was called) via the real listener path, wrapped in a `performance.now()` probe. Low priority since B-042 has an equivalent gap and the builder test covers the dominant CPU cost. |

### Verdict

**PASS — no CRITICAL or HIGH findings. READY FOR R5 as-is.** The pure `buildJsonExport` function is well-structured, deterministic, and correctly strips all runtime enrichments. The handler's direct `chrome.storage.local.get` probe for `tj:prefs` (flagged deviation #1) is the correct design choice for §32.5.4 preference-presence semantics and does not need to change. The `GROUP_RUNTIME_FIELDS` inclusion of `warning` (flagged deviation #2) is correct belt-and-braces and should be kept. All 13 ACs are covered by the 32-test suite; the real-dispatcher integration test is present per Sprint 15 retro. M-1 through M-3 are recommended pre-R5 for correctness hygiene but are not blocking. L-1 through L-4 are at author discretion.

---

## Sprint 17 — B-043 [security-reviewer]

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM
| # | File | Finding | Fix |
|---|------|---------|-----|
| S-1 | `background/export/json-export.js:31-33` | **Block-list strategy for runtime-field exclusion.** `sanitizeItem` spreads all `Object.keys(item)` through to output, excluding only names in `ITEM_RUNTIME_FIELDS`. This is the risky pattern flagged by review-concern #4: the primary defense is that the export handler calls raw `listItems()` (no enrichment), but the in-file comment (L76-78) explicitly frames the deny-list as defense-in-depth against future memory decorations. Any future refactor that accidentally threads enriched items (e.g., via `buildLiveStates` merge, MSG_LIST_ITEMS reuse) into `buildJsonExport` would silently leak any field not listed. The deny-list is also not exhaustive relative to known enrichments — `favIconUrl` (capital `I`) returned by `buildLiveStates` (`tab-claims.js:229`) and `open-tabs.js:47` is NOT in the set, and the schema-allowlist logic in `live-tab-index.js` also uses `favIconUrl`. | Either (a) switch to an allow-list based on the documented persisted `Item` / `Group` shape (§32.5 frozen contract), OR (b) add `favIconUrl` to `ITEM_RUNTIME_FIELDS` and add a test asserting the deny-list covers every key enumerated in the Sprint 14 `buildLiveStates` return type. Option (a) is preferred for a frozen schema — unknown persisted fields are actually a signal of corruption, not forward-compat data. |
| S-2 | `background/messages/storage-handlers.js:426-428` | **Preferences probe is correctly scoped, but value is re-emitted verbatim with no shape filter.** `buildJsonExport` line 167-169 writes `root.preferences = preferences` without filtering. If the on-disk `tj:prefs` partition has ever been written with an unrecognised key (corruption, interrupted migration, future dev-only flag), the export leaks it to a shared backup file. Analogous to S-1 — current persisted-prefs shape is small and local-only, so blast radius is minimal, but a schema-frozen `preferences` allow-list would be consistent with §32.5.4. | Filter `preferences` through the set of documented keys before emission, or note the forward-compat pass-through decision explicitly in the schema spec. |

### LOW
| # | File | Finding | Fix |
|---|------|---------|-----|
| S-3 | `background/export/json-export.js:174` | JSON serialisation uses `JSON.stringify` — safe (no manual concat, no HTML escape surface, no injection risk). Note: a downstream consumer that pipes the export into an HTML `<pre>` or `innerHTML` would re-introduce XSS; the export path itself is clean. No action — documented as confirmation. |
| S-4 | `background/messages/storage-handlers.js:445` | `TextEncoder().encode(jsonContent).length` is deterministic and does not allocate persistently (encoder instance GC'd). No DoS surface beyond the already-unbounded export size itself. No action. |

### Verdict

**PASS — no CRITICAL or HIGH findings. READY FOR R5.** All 10 review vectors clear: JSON.stringify handles quoting safely (#1), exclusion is correctly enforced by raw-read + deny-list (#2-3), `schemaVersion` sources from `KNOWN_VERSION` (not user input) (#5), prefs probe is single-key scoped (#6), `TextEncoder` size is deterministic (#7), no PII logging (#8), manifest diff is empty (#9), and `MSG_EXPORT_COLLECTION` remains correctly absent from `WRITE_MESSAGE_TYPES` with a dedicated regression test at `tests/b043-json-export.test.js:638` (#10). The one genuine defense-in-depth gap (S-1, review-concern #4) — block-list vs. allow-list for runtime-field exclusion — is MEDIUM because the primary defense holds today and the gap is a future-refactor hazard only. Recommend switching to an allow-list before B-045 import lands so the frozen-schema contract is enforced symmetrically on both sides.

---

## Sprint 17 — B-043 [qa-reviewer]

Scope: `background/export/json-export.js` (176 LOC), `tests/b043-json-export.test.js` (720 LOC, 24 tests), `background/messages/storage-handlers.js` MSG_EXPORT_COLLECTION JSON branch (lines 403–454), `sidepanel/sidepanel.{html,js}` wiring for `#export-json-btn`.

### CRITICAL

_None._

### HIGH

_None._ All 13 ACs have matching assertions; the 3-HIGH gap that blocked B-042 at R4 (orphan rescue, perf timing, toast-copy literal) is explicitly covered here: orphan rescue tests land on lines 387–420, AC11 5-run-median perf at 426–455, AC10 copy is literal `'Backup exported: ' + data.filename` matching the AC's "e.g." exemplar.

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| Q-1 | `tests/b043-json-export.test.js` | Deeply-nested sub-groups (≥ 3 levels) untested. Current AC5 nesting test only exercises parent→child; §32.5.5 determinism claim over `(parentId, sortOrder, id)` is unverified when the `parentId` chain is long enough to cross multiple sort partitions. | Add a 3-level nest fixture (A → B → C → D) and assert sorted output has the expected chain order. |
| Q-2 | `tests/b043-json-export.test.js` | No storage-read-fails-mid-build test. `ERR_NOT_READY` (cold SW) and `ERR_VALIDATION` (bad format) are covered, but `listItems()` resolving then `listGroups()` rejecting (partial snapshot) never surfaces — would wrap in a dispatcher-level StorageError with an unknown code. | Stub `chrome.storage.local.get` to reject on the 2nd call; assert `ok: false` and no blob leaks. |
| Q-3 | `tests/b043-json-export.test.js` | Null / empty title never exercised. JSON spec permits `"title": ""` and `"title": null`; B-045 import contract will need both. Builder passes through verbatim today, but no regression test pins it. | Add `makeItem({ title: '' })` + `makeItem({ title: null })` round-trip assertions. |
| Q-4 | `tests/b043-json-export.test.js` | `preferences: undefined` (vs. `null` / omitted) is not pinned. The `if (preferences && typeof preferences === 'object')` check suppresses correctly today, but an explicit test enforces intent against future refactors. | Add `buildJsonExport({ ..., preferences: undefined })` → assert `!('preferences' in parsed)`. |
| Q-5 | `sidepanel/sidepanel.js:1481–1485` | `#export-json-btn` keyboard activation (Tab → focus ring → Enter/Space triggers export) has no automated assertion. Inherits from `header-add-btn` pattern shared with `#export-html-btn`, but B-042 caught a regression here; symmetry warrants explicit UAT coverage. | UAT-03 below covers it; no code fix needed. |
| Q-6 | `background/export/json-export.js` | Non-palette `color` on groups (e.g., `"color": "#ff00ff"`) passes through unchanged. AC5 says "every persisted field as stored" so passthrough is correct, but B-045 will need to decide reject vs. rescue. | Document in SOLUTION_DESIGN §32.5 that color validation is an import-time (B-045) concern. No code fix here. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| Q-7 | `tests/b043-json-export.test.js:461–497` | UTF-8 `size` probe uses a single emoji (🚀). CJK-only titles also diverge (3B utf-8 vs 1 code unit). Low-value coverage gain. | Optional: add Café 日本語 size assertion. |
| Q-8 | `background/messages/storage-handlers.js:426–428` | `preferences` probe uses direct `chrome.storage.local.get(prefsKey)` — bypasses the partition abstraction. Works today; if prefs ever move to a composite sub-key, this snaps. | Note in SOLUTION_DESIGN §32.5.4 as a known coupling. |
| Q-9 | `sidepanel/sidepanel.js:1472` | `'Backup exported: ' + data.filename` concatenates filename into a text-context toast. `showToast` assumed to use `textContent` (per B-042); worth a one-line assumption comment. | Optional inline comment citing `showToast` uses `textContent`. |

### UAT scenarios

Proposed UAT cases for [test-engineer] at R5 (load unpacked in Edge + dev fixtures):

1. **UAT-01 Happy path.** Seed 5 items across 2 named groups + ungrouped. Click `#export-json-btn`. File downloads as `tab-junkie-backup-YYYY-MM-DD.json`; toast reads `Backup exported: tab-junkie-backup-…json`. PASS if filename + toast match.
2. **UAT-02 JSON.parse round-trip.** Open the downloaded file in a JSON validator (or `jq .`). PASS if it parses with zero errors and root keys are `schemaVersion`, `exportedAt`, `items`, `groups` (plus `preferences` only when user has customized settings).
3. **UAT-03 Keyboard-only invocation.** Tab into header until focus lands on `#export-json-btn`. Focus ring must be visible. Press Enter. File downloads. PASS with zero mouse.
4. **UAT-04 Empty collection.** Clear all items and groups. Click Export. PASS if file downloads with `"items": []` and `"groups": []` and toast still appears.
5. **UAT-05 Only-ungrouped items.** Seed 3 items, no named groups. PASS if `items` has 3 entries (all `groupId: null`) and `groups: []`.
6. **UAT-06 Deep nesting.** Create A → B → C (3-level hierarchy) with 1 item per group. PASS if all 3 groups round-trip with correct `parentId` chain; export twice → diffs show only `exportedAt`.
7. **UAT-07 Orphan rescue — item.** Via DevTools → storage, manually corrupt one item's `groupId` to a non-existent group ID. Click Export. PASS if the orphan appears in output with `groupId: null` (no data loss, no silent drop).
8. **UAT-08 Preferences omission (first run).** Fresh profile, Settings never opened. Export. PASS if exported root has NO `preferences` key.
9. **UAT-09 Preferences present (customized).** Change theme to dark. Export. PASS if root has `"preferences": { theme: "dark", … }`.
10. **UAT-10 Unicode round-trip.** Seed item with title `Café 日本語 🚀`. Export. Open file in a UTF-8-aware editor. PASS if title is preserved exactly; `JSON.parse` succeeds; response `size` exceeds `content.length`.
11. **UAT-11 Large-collection perf (AC11).** Seed 1000 items / 100 groups. Export. PASS if median of 5 runs (DevTools Performance) < 500ms wall-clock from click to download prompt.
12. **UAT-12 schemaVersion authenticity.** Inspect downloaded file. PASS if `"schemaVersion"` equals current `KNOWN_VERSION` (1) and is an integer (not string).
13. **UAT-13 Safe-mode passthrough.** Force safe-mode (manual schema bump via DevTools). Click Export. PASS if JSON export succeeds and file downloads even though writes are blocked (MSG_EXPORT_COLLECTION absent from WRITE_MESSAGE_TYPES).
14. **UAT-14 SW cold-start failure.** DevTools → Application → Service Workers → Stop; click Export within 500ms of page load. PASS if toast reads "Export failed — extension is still starting, try again in a moment" and no partial file lands on disk.

### Verdict

**PASS — ready for R5.** All 13 ACs have matching assertions; the three HIGH findings that gated B-042 (orphan rescue, perf timing, toast-copy literal) are explicitly covered here. Six MEDIUM findings are test-coverage gaps that [test-engineer] can absorb in a single R5 pass alongside UAT; three LOW findings can defer to B-045 or a hygiene sprint. The builder's `exportedAt` injection via a `now` parameter is a standout — it unlocks the byte-identical determinism tests that make this one of the cleanest review targets of the sprint. No code changes required before R5.
