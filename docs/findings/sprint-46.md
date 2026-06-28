# Sprint 46 — Findings

> R0 spike + R1 LOCKED blocks for the Sprint 46 active items. R4 deduplicated findings will be appended below after the review round runs.

---

## R0 — Durable claim identity (B-167) spike

**Author**: [solution-architect] (Opus) · **Date**: 2026-06-02 · **Branch**: `feature/sprint-46-claim-identity` @ `144d8bb` · **Tier**: Spike-First XL confirmed.

### Storage-wipe scenario survey (TL;DR per scenario)

- **S-1 Extension reload** (toggle OFF/ON / ↻ / unpacked code change): `chrome.storage.session` wiped; tab IDs persist. Current Phase 1 = no-op (storedClaims empty); Phase 2/3 URL inference reconstructs. *Canonical example of inference-layer cascade bug — B-163 R3 narrowing was invisible in tests because fixtures seeded storedClaims; durable storage would have made the predicate moot.*
- **S-2 Browser restart** (incl. "Continue where you left off"): both session storage wiped AND tab IDs rotated. Inference identical to S-1 + `floating-groups.js:liveTabId` direct match also misses. **`chrome.sessions.getRecentlyClosed()` does NOT bridge pre-restart → post-restart tab IDs — R2-VERIFY.**
- **S-3 OS sleep / lid-close**: per S45 Test B inconclusive evidence — session storage MAY survive a short lid-close if SW stays warm. Events that fire during sleep are NOT queued for stateless listeners. B-164 idle-reconciler rerun catches this.
- **S-4 SW crash**: indistinguishable from S-1 path; B-163 R4 HIGH-1 graceful-degradation guard already covers corrupt-partition class.
- **S-5 Profile resume**: equivalent to S-2.

**Pattern**: every S45 cascade bug had inference-layer DNA. Durable identity removes the reconstruction step.

### R2 PICK — combination (d): durable partition + Phase 1/2/3/4 backstop

**REJECTED**: `chrome.sessions` API integration (no public surface bridges old→new tabId across restore).

**New partition `tj:itemClaims`** (schema v8):
```js
{
  schemaVersion: 1,
  sessionTag: string,          // crypto.randomUUID() per browser session
  entries: {
    [itemId]: { tabId, claimedAt, sessionTag }
  }
}
```

`sessionTag` discriminates "same browser session" (trust durable tabId direct-match) from "fresh browser session" (durable record is a hint; fall through to Phase 2/3 URL inference). Heuristic for session-detection: ≥50% of stamped tabIds resolve in fresh LiveTabIndex.

**Schema bump v7 → v8** (C-1a paired bump in `shapes.js` + `migration.js`). Lazy migration (C-1b option 2 — no eager rewrite step).

**Read precedence**:
1. Durable direct match (sessionMatches AND `entries[itemId].tabId` resolves)
2. Phase 1 validation of stale durable entries (!sessionMatches)
3. Phase 2 primary-URL match
4. Phase 3 drift-URL fallback
5. Phase 4 conditional drift drop + opener-chain `markInherited` preserved

**Write path**: every existing `tj:tabClaims` write site mirrors per-item PATCH to `tj:itemClaims` (atomic via `writeTransaction`). Cold-start `reconcileClaims` does one full-replace at Phase 4 end.

### R3 effort estimate

~610 LOC across 5 production files + 1 new test file (`tests/b167-*.test.js` ~12-15 cases). **Fits in Sprint 46** if scoped to core (drop URL-history candidate — see Q1).

### Open R1 questions

- **Q1 (HIGH, product-owner decision)**: URL-history per claim — include in v1 (storage cost 5×4KB×500 items = up to 10MB worst-case, MAY exceed quota) or defer to follow-up?
- **Q2 (MEDIUM, R2-time)**: sessionTag heuristic — `≥50%` of stamped tabIds resolve = "same session" (aggressive durable-trust) vs `≥80%` (safer).
- **Q3 (MEDIUM, R2-time)**: `MSG_DEMOTE_ITEM` durable-clear semantics — sync before `releaseClaimByTab` vs best-effort sequential (matches today).
- **Q4 (LOW, R2-time)**: telemetry counter for durable-hit-rate (`tj:meta.durableHits` / `inferenceHits`).
- **Q5 (LOW, R2-time)**: drop `tj:tabClaims` session-storage path entirely after Sprint 48, or retain as defense-in-depth fallback for corrupt-durable-partition case.

### Tier confirmation

**Spike-First XL confirmed.** R3 scope cap recommended: durable partition + sessionTag + Phase 1/2/3/4 backstop preservation. Drop URL-history (defer per Q1). Keeps S46 deliverable in one sprint.

---

## R1 LOCKED — Durable claim identity (B-167) — post-R0

**Tier: Full Spike-First (XL). Approach: R2-LOCKED combination (d) — durable `tj:itemClaims` partition + `sessionTag` discriminator + Phase 1/2/3/4 inference as backstop. URL-history per claim DEFERRED per Q1 product-owner decision (filed as B-172 follow-up).**

**Scope**: Introduce a new durable `tj:itemClaims` partition in `chrome.storage.local` that records a per-item claim (`tabId`, `claimedAt`, `sessionTag`) persisted across extension reload and browser restart. On cold start, a `sessionMatches` predicate determines whether the stored `sessionTag` matches the current browser session; if yes, the durable tabId is trusted directly (S-1 extension-reload happy path); if no, the Phase 1/2/3/4 inference pipeline runs as the backstop (S-2 browser restart, S-3 sleep, S-4 crash). Every existing `tj:tabClaims` write site gains a parallel PATCH to `tj:itemClaims` via `writeTransaction`. Schema bumps from v7 to v8 (governance + lazy data migration, C-1a/C-1b option 2). `chrome.sessions` API rejected — no public surface bridges old→new tabId across restore.

**DoR-7**: N/A — additive writes to a new partition; existing `tj:tabClaims` (session) writes preserved unchanged.
**Selector audit**: N/A — no DOM.
**Source-citation completeness**: all claims cite `file:line`; two R2-VERIFY items (`crypto.randomUUID()` call site; `sessionMatches` heuristic threshold per Q2).

### AC1 — Schema v7 → v8 + new `tj:itemClaims` partition shape
Paired changes: `migration.js:100` `KNOWN_VERSION` 7→8 + new v7→v8 no-op step (C-1b option 2 lazy) + `shapes.js:35` new `PARTITION_ITEM_CLAIMS = 'itemClaims'` constant + `shapes.js:91` `defaultShape('itemClaims')` returns `{schemaVersion: 1, sessionTag: '', entries: {}}` + `shapes.js:135` `defaultShape(PARTITION_META).schemaVersion` literal 7→8 (C-1a paired-bump, `tests/migration-fresh-install.test.js` pins this) + `shapes.js` new `isItemClaims(v)` validator (allow-list per C-7: `entries[k]` requires `tabId: finite-int`, `claimedAt: finite-int`, `sessionTag: string`; extra fields tolerated). **PASS**: `defaultShape` returns correct shape; `assertShape` accepts well-formed + throws ERR_CORRUPT_DATA on malformed; existing migration test passes with updated literal.

### AC2 — Write-site mirror (5 sites, each PATCHes `tj:itemClaims`)
W-1 `reconcileClaims` end-of-Phase-4 full-replace (`tab-claims.js:327`) — replaces entire `entries` + stamps current `sessionTag`. W-2 `releaseClaimByTab` (`tab-claims.js:356`) — deletes `entries[itemId]`. W-3 `reevaluateTab` new-claim branch (`tab-claims.js:417`) — upserts `entries[itemId]`. W-4 `claimTabForItem` (`tab-claims.js:494-496`) — upserts. W-5 `remapTabIdInClaims` (`tab-claims.js:531`) — updates `entries[itemId].tabId` preserving `claimedAt`+`sessionTag`. All 5 via `writeTransaction`. **Q3 R2-DECISION-PENDING**: `MSG_DEMOTE_ITEM` durable-clear sync (within `storage-handlers.js:485` transaction) vs best-effort sequential. **PASS**: each write-site fires correct `tj:itemClaims` state; `tj:tabClaims` still updated (Q5-pending defense-in-depth retention).

### AC3 — Cold-start read with `sessionMatches` discrimination
`initializeLiveState` (`background/tabs/index.js:37`) reads `tj:itemClaims` before `reconcileClaims`. New pure function `sessionMatches(durablePartition, liveTabIndex, threshold?)` computes ratio of stamped entries (same-sessionTag) whose tabId resolves in liveTabIndex. **Q2 R2-DECISION-PENDING**: threshold `≥50%` (aggressive) vs `≥80%` (safer). `sessionMatches === true` → pre-populate `claimsMirror[itemId] = entry.tabId` before reconcile; Phase 2/3 short-circuit. `false` → stale-hint mode; full Phase 1/2/3/4 runs; entries overwritten by W-1. **PASS**: two scenarios — (a) seed with current sessionTag + 3/4 tabIds resolve → pre-populated claims survive; (b) seed with old sessionTag + 0 tabIds resolve → inference runs, old entries overwritten.

### AC4 — Durable direct match: extension-reload (S-1) happy path
Given saved item with `entries[itemId] = {tabId: 42, claimedAt: T, sessionTag: current}` where tabId 42 in LiveTabIndex: `sessionMatches` true → `claimsMirror[itemId] = 42` pre-populated → Phase 1 validates (B-149 contract: URL NOT re-checked) → Phase 2/3 skip itemId. **Zero URL inference operations for this item.** **PASS**: `getItemIdForTab(42)` returns itemId; no `getDriftRecords()` call for this item.

### AC5 — Phase 1/2/3/4 backstop preservation (no regression)
Existing 4-phase pipeline (`tab-claims.js:139`) preserved intact. Durable pre-population is additive — pre-populated items treated as already-claimed entering Phase 1. No phase removed/reordered. Phase 3 drift-URL fallback (B-163), Phase 4 conditional drift-drop (B-163), B-149 URL-mismatch claim-preservation contract — all unchanged. **PASS**: full existing suites `tests/b149-*`, `tests/b163-*`, `tests/b164-*` pass without modification post-R3.

### AC6 — Graceful degradation on `tj:itemClaims` corrupt-data read
Reading `tj:itemClaims` wrapped in try/catch (B-163 R4 HIGH-1 pattern at `background/tabs/index.js:60-64`). Catch path: `console.warn`; proceed with empty `durablePartition`; `sessionMatches` returns false; Phase 1/2/3/4 runs normally; corrupt partition overwritten by W-1. **PASS**: seed corrupt `entries: 'not-an-object'`; cold-start runs; `isClaimsReady()` true; no unhandled rejection.

### AC7 — `chrome.tabs.onReplaced` 5-table remap extended (6th table: `tj:itemClaims`)
W-5 (AC2) extends `remapTabIdInClaims` to also patch `entries[itemId].tabId`. Additive to B-164 §69.3.1 5-table remap. Fire-and-forget `.catch` (`tab-events.js:119-121`) covers durable-PATCH failure — non-fatal; in-memory mirror update is synchronous and authoritative for current session. **PASS**: `remapTabIdInClaims(old, new)` test verifies `tj:itemClaims.entries[itemId].tabId` updates old→new.

### AC8 — Migration: lazy, no eager rewrite
v7→v8 `MIGRATION_STEPS` entry is no-op (identity function; same pattern as v6→v7 at `migration.js:191-195`). No eager rewrite of any existing partition. `tj:itemClaims` additive — `initializePartitions()` seeds default shape on profiles lacking the key. Existing partitions untouched by migration. **PASS**: `tests/migration-fresh-install.test.js` passes with updated literal; migration-runner test seeded at v7 lands at v8 with other partition data unchanged.

### AC9 — CHANGELOG SW-flush note (C-1a)
`CHANGELOG.md` v1.X.0 entry must include: "After update, toggle the extension OFF then ON in `edge://extensions` to flush the SW module cache and apply the schema v8 migration." Sprint 30 B-092 `denseLayout` precedent. [technical-writer] owns at R7. **PASS**: `CHANGELOG.md` contains SW-flush note in the v1.X.0 entry that ships KNOWN_VERSION=8.

### AC10 — Rollback constraint documented
R6 chapter must document: rollback to pre-v8 build requires manual `tj:meta.schemaVersion` reset to 7 (DevTools `chrome.storage.local.set({'tj:meta': {..., schemaVersion: 7}})`) before installing prior build, OR clear `tj:itemClaims` key entirely. Without reset, prior build (`KNOWN_VERSION=7`) enters safe-mode (`migration.js:382`). **No immediate data-loss risk** — `tj:items` + `tj:groups` untouched; `tj:itemClaims` is derived cache (pre-B-167 inference reconstructs from `tj:tabClaims` session storage as before). **PASS**: rollback plan in R6 chapter with exact `chrome.storage.local.set` command.

### AC11 — URL-history per claim: explicitly out of scope
`entries[itemId]` shape is `{tabId, claimedAt, sessionTag}` ONLY. No `urlHistory` field. R0 candidate (c) deferred to follow-up item B-172 per Q1 product-owner decision. Schema v8 design must not preclude adding `urlHistory` as optional field in future v9 bump. `isItemClaimEntry` validator does not require urlHistory; entries with urlHistory pass validator without error (extra-fields tolerated per C-7 allow-list). **PASS**: validator accepts both shapes; B-172 lands as additive v9 bump if/when product-owner promotes it.

**Out of scope**: `chrome.sessions` API integration (REJECTED — `docs/findings/sprint-46.md:23`); URL-history per claim (deferred to B-172); removal of `tj:tabClaims` session-storage path (Q5 R2-DECISION-PENDING); telemetry counter for durable-hit-rate (Q4 R2-DECISION-PENDING); any sidepanel/newtab/popup UI changes; changes to B-149 claim-preservation contract or B-163 Phase 3/4 drift logic beyond additive pre-population.

---

## R1 LOCKED — Jump to active window (B-168)

**Tier: Full (S — may auto-upgrade if manifest `commands` interaction surfaces a permission concern at R2). Approach: both triggers (toolbar icon + keyboard shortcut) per product-owner direction.**

**Scope**: When the user clicks the new "Jump to current window" button in the popup footer OR presses the new keyboard shortcut (default `Alt+W`), the sidepanel scrolls smoothly to the first row belonging to the currently-focused browser window (first `[data-window-id="<activeWindowId>"]` row in `itemListEl`) and briefly flashes the destination row. If no rows for the active window exist, a short toast is shown instead of silent no-op. Purely additive — no existing sidepanel controls moved or removed.

**DoR-7**: N/A (read-only scroll+focus action).
**Selector audit**: N/A (additive within popup and sidepanel surfaces, no rehome).

### AC1 — Toolbar icon click triggers scroll
New button `<button id="popup-jump-to-window-btn">` in `#qs-footer` (`popup/popup.html`). Click → `chrome.windows.getCurrent({populate:false})` (same pattern as `popup.js:933`) → `chrome.runtime.sendMessage({type: MSG_JUMP_TO_ACTIVE_WINDOW, payload: {windowId}})` fire-and-forget per C-11 → `window.close()`. **PASS**: popup closes + sidepanel scrolls within 500ms.

### AC2 — Keyboard shortcut triggers scroll
New `commands` entry `"jump-to-active-window"` with `"suggested_key": {"default": "Alt+W"}` in `manifest.json` (after `open-junkie-settings` at `:47-51`). New `chrome.commands.onCommand.addListener` block in `background/service-worker.js` (after the existing `:157-162` listener). Handler resolves active window via `chrome.windows.getLastFocused({populate:false})` (R2-VERIFY: confirm vs `getCurrent`). **PASS**: pressing `Alt+W` from any surface scrolls sidepanel within 500ms.

### AC3 — Scroll target is correct row
Sidepanel `chrome.runtime.onMessage` branch (in existing `addListener` at `sidepanel.js:7130`) for `MSG_JUMP_TO_ACTIVE_WINDOW`. `itemListEl.querySelector('[data-window-id="<windowId>"]')` — `data-window-id` stamped at `sidepanel.js:2578-2579` (saved-item rows) + `:3549` (open-tab rows). `.scrollIntoView({block: 'start', behavior: 'smooth'})`. **PASS**: matched row at/near top; content above scrolled out.

### AC4 — Visual feedback on arrival
After scroll, toggle CSS class `item-row--jump-highlight` for 600ms (added immediately, removed via `setTimeout`). `@keyframes` animation in `sidepanel.css` — background-color pulse from `--active-bg` (R2-VERIFY exact token name) back to transparent. **PASS**: visible flash in both light/dark themes.

### AC5 — Empty-state behavior
If `querySelector` returns null (active window has no claimed saved-item rows AND no open-tab rows with that windowId), show toast "No tabs from the current window are visible here." Auto-dismiss 3s. No scroll. **PASS**: toast appears + disappears; sidepanel scroll unchanged; no JS error.

### AC6 — Default keyboard binding chosen + collision-free
Binding `Alt+W` (W for "window"). Verified non-collision against `manifest.json:25-51`: `Alt+J`/`Alt+Shift+J`/`Alt+K`/`Alt+Comma` + browser `Alt+Left/Right/F4`. **PASS**: only this command fires on `Alt+W`.

### AC7 — New message constant registered
`MSG_JUMP_TO_ACTIVE_WINDOW = 'tj/jumpToActiveWindow'` exported from `shared/messages.js` (after `MSG_SYNC_TO_CHROME` at `:297`) with JSDoc payload shape `{windowId: number}`. **PASS**: importable from both `popup/popup.js` and `sidepanel/sidepanel.js` without circular deps.

**Out of scope**: filtering sidepanel to ONLY active window (different UX item), multi-window cycling, popup-side window jump (popup is flat list), changes to `_activeWindowFilter` chip (`sidepanel.js:354`), persisting scroll/jump to storage.

---

## R1 LOCKED — Ways-of-working: human names in discussion (B-169)

**Tier: Fast Track (XS). CLAUDE.md edit only.**

**Scope**: Add a "Discussion & Planning Discipline" subsection to CLAUDE.md placed at `CLAUDE.md:30` (under "Agent Bracket Notation — MANDATORY") OR `CLAUDE.md:442` (under "Non-Negotiable Rules"). No code/test changes.

**DoR-7**: N/A. **Selector audit**: N/A.

### AC1 — Subsection exists
New subsection at one of the two verified anchor points (`CLAUDE.md:30` OR `:442`). Placement rationale noted in commit/R3 handoff.

### AC2 — Core rule stated
In conversation, planning docs, agent prompts, retrospective narratives, and any prose discussing sprint work, the human-identifiable name MUST lead with the ticket ID appended in parens. Example: "Durable claim identity (B-167)" not bare "B-167". Subsection includes a ✅ do / ❌ don't example pair drawn from real item names.

### AC3 — Greppable-surfaces exception listed
Subsection explicitly enumerates contexts where ticket ID alone is acceptable: commit message subject lines, inline code comments cross-referencing items, BACKLOG.md ID column, chapter section markers (e.g., `§70.13`). Rationale (machine-greppability) stated.

### AC4 — Scope of rule is prose-only
Subsection clarifies the rule applies to prose communication, not machine-readable references. Retroactive renaming of prior commit messages, chapter section markers, test file names, or BACKLOG.md IDs explicitly out of scope.

### AC5 — All-agents applicability
Subsection applies to every agent in the 10-agent roster, not scoped to a single role.

**Out of scope**: retroactive edits to prior sprint docs, commit history, chapter titles, test names, or BACKLOG.md ID column values.

---

## R1 LOCKED — R4 contract-vs-implementation diff gate (B-170)

**Tier: Fast Track (XS). CLAUDE.md edit only.**

**Scope**: Add "Contract-vs-implementation diff gate" subsection under "Round 4: Review" (`CLAUDE.md:403`), mandatory check for [code-reviewer]. No code/test changes.

**DoR-7**: N/A. **Selector audit**: N/A.

### AC1 — Subsection exists and placed correctly
Subsection inside "Round 4: Review" section (`CLAUDE.md:403–408`), scoped to [code-reviewer], mandatory not optional.

### AC2 — Three-step procedure specified
[code-reviewer] follows for every implementation predicate: (a) locate R1 AC or R2 contract wording for that predicate; (b) trace actual implementation predicate verbatim against that wording; (c) flag any narrowing — defined as substituting a strict subset where the contract specifies the full set (e.g., "all unbound items" → "evictedItemIds only"; "position OR URL" → "position only") — as HIGH-severity finding. Three steps enumerated explicitly.

### AC3 — Three S45 precedents cited
(1) B-163 Phase 3 narrowing — "all unbound items" → "evictedItemIds only", surfaced post-UAT; (2) M-1 dedup test verifying final-state rather than invocation count per contract, surfaced via cross-reviewer overlap; (3) preMark position-only match where R2 specified "position OR URL", surfaced via deeper UAT trace. Each precedent identifies the item/behavior + narrowing pattern.

### AC4 — Severity and escalation path explicit
Narrowing findings classified HIGH; must be fixed by [frontend-engineer] before R5 proceeds (consistent with `CLAUDE.md:408` HIGH-finding enforcement). If no narrowing found, [code-reviewer] states "contract-vs-implementation diff: clean".

**Out of scope**: retroactive re-running of R4 for prior sprints; applying gate to [security-reviewer]/[qa-reviewer]; defining "widening" as a finding.

---

## R1 LOCKED — Reusable diagnostic-trace helper (B-171)

**Tier: Fast Track (XS). New `shared/diag.js` module + CLAUDE.md subsection.**

**Scope**: Create `shared/diag.js` exporting three functions (`recordTrace`, `readTraces`, `clearTraces`). Add "Diagnostic patterns" CLAUDE.md subsection. Unit tests covering each public function.

**DoR-7**: N/A (`clearTraces` removes only `_diag_*` namespaced keys; ephemeral debug data only). **Selector audit**: N/A.

### AC1 — Module API shape
`shared/diag.js` exports exactly three named functions: `recordTrace(key, payload)`, `readTraces(prefix)`, `clearTraces(prefix)`. `prefix` is optional (defaults to `''`). No default export. Module header follows JSDoc style of `shared/errors.js:1-11`.

### AC2 — `recordTrace` append semantics
Writes to `chrome.storage.local` under key `'_diag_' + key`. MUST append, not overwrite: stored value is array; each call pushes `{ts: Date.now(), payload}`. Initializes to `[]` if key doesn't exist. Returns the `Promise` from `chrome.storage.local.set`.

### AC3 — `readTraces` semantics
Reads all `chrome.storage.local` keys starting with `'_diag_' + (prefix ?? '')`. Returns `Promise` resolving to plain object mapping each matching key (sans `_diag_` prefix) to its stored array. Empty match → `{}`.

### AC4 — `clearTraces` semantics
Removes all `chrome.storage.local` keys starting with `'_diag_' + (prefix ?? '')`. Returns `Promise` from `chrome.storage.local.remove`. Does not touch non-`_diag_*` keys.

### AC5 — CLAUDE.md "Diagnostic patterns" subsection
New subsection states: (a) `shared/diag.js` is canonical for SW-console-readable instrumentation; (b) ad-hoc `chrome.storage.local` debug keys outside `_diag_*` namespace forbidden in committed code; (c) all `_diag_*` keys must be cleared before sprint item marked done. Cites S45 ad-hoc precedents (`_b163_debug`, `_s45_premark_trace`, `_s45_reconcile_trace`) as motivation.

### AC6 — Test coverage
New `tests/b171-diag.test.js` covers: `recordTrace` initializes array on first call · `recordTrace` appends on subsequent calls · `readTraces` no-prefix returns all `_diag_*` entries · `readTraces` with prefix filters correctly · `clearTraces` removes only matched keys · `clearTraces` does not remove non-`_diag_*` keys. All six cases pass deterministically.

**Out of scope**: long-lived telemetry, log retention policy, UI visualization of traces, `chrome.storage.session`/`chrome.storage.sync` variants, log rotation/size-capping.

---

## R4 — Deduplicated review findings

_To be populated after R4 review round runs._

---

## B-168 UAT plan — Jump to active window (R5)

Authoritative spec: `docs/design/72-b-168-jump-to-active-window.md` §72.10.

**Discipline (S45 retrospective rule)** — every step uses UI-observable signals only. No DevTools, no console reads, no `chrome.storage` dumps. If a check cannot be confirmed visually, the test case is FAIL.

**Pre-flight setup (apply once before UAT-1)**:
1. Load the unpacked extension from the repo root in `edge://extensions` (Developer Mode ON).
2. Open **at least two** browser windows.
3. In window A: open ~10 tabs across two `chrome.tabGroups` groups.
4. In window B: open ~6 tabs (any sites).
5. Open the Tab Junkie sidepanel in window A. Confirm rows are visible for both windows' tabs (each row should carry `data-window-id` matching its host window — visible by inspecting the rendered group separators per window).
6. Scroll the sidepanel until the current window's first row is OFF-screen (scroll position elsewhere) so the jump produces a visible scroll.

| # | Scenario | Steps | Expected (UI-observable) | Status |
|---|----------|-------|--------------------------|--------|
| UAT-1 | Toolbar icon path (AC1) | (a) Focus window A. (b) Click the Tab Junkie toolbar icon to open the popup. (c) Click "Jump to current window". | Popup closes. Sidepanel scrolls to and briefly flashes (~600 ms colour pulse) the first row whose `data-window-id` matches window A. | _pending_ |
| UAT-2 | Keyboard shortcut path (AC2) | (a) Focus window A (click any non-input element so focus is in the browser chrome). (b) Press **Alt+W**. | Sidepanel scrolls to and flashes the first row for window A. Same visual as UAT-1. | _pending_ |
| UAT-3 | No-match toast (AC5 / C-9) | (a) In the sidepanel search box, type a string that excludes every row for window A (e.g., a unique substring only present in window B titles). (b) Press Alt+W (or click the popup button). | A toast appears at the bottom of the sidepanel with text exactly: `No tabs from the current window are visible here.` Toast remains visible for ~3 seconds, then fades. No row scroll or flash occurs. | _pending_ |
| UAT-4 | Rapid-click guard (M-2) | (a) Open the popup. (b) Rapidly click "Jump to current window" three times in quick succession (faster than the popup tear-down). | Exactly ONE scroll+flash occurs. No double-flash, no second-time toast. Popup closes after the first click; the subsequent clicks have no observable effect. | _pending_ |
| UAT-5 | Alt-tab no-browser-focus (H-1) | (a) Alt-tab away from the browser to another application entirely (any non-browser app — terminal, finder, etc.). (b) Without re-focusing the browser, press **Alt+W**. | Nothing visible happens. No error toast, no spurious scroll/flash on next browser focus, no crash banner. The Edge command system delivers the shortcut, but the SW silently no-ops because `getLastFocused` returns WINDOW_ID_NONE (-1). | _pending_ |
| UAT-6 | Keyboard focus after jump (L-1) | (a) Trigger UAT-2 (Alt+W jump). (b) Without clicking, press **Tab**. | Focus has landed on the scrolled-into-view row (visible focus ring on the matched row immediately after the flash). Pressing Tab moves focus forward into the next row's interactive controls inside the same window's group — NOT back to the top of the sidepanel. | _pending_ |
| UAT-7 | prefers-reduced-motion (a11y) | (a) Enable reduced-motion in the OS: macOS → System Settings → Accessibility → Display → "Reduce motion" ON; Windows → Settings → Accessibility → Visual effects → "Animation effects" OFF. (b) Reload the sidepanel so the media query re-evaluates. (c) Trigger Alt+W. | Scroll behavior is instant (no smooth-scroll animation tween — row appears at the target position immediately). Flash highlight appears as an instant solid colour for ~600 ms then disappears instantly (no fade). | _pending_ |

**Pass criteria**: all 7 cases recorded with `PASS`. Any `FAIL` on UAT-1, UAT-2, UAT-3, UAT-4, UAT-5 returns the item to R3. UAT-6 and UAT-7 `FAIL` results are tracked as polish backlog candidates if non-blocking on the core flow (per Sprint 45 a11y-deferral precedent).

**Test-engineer note on R5 gap-fillers**: `tests/b168-jump-to-active-window.test.js` was expanded from 12 → 18 cases. The 6 added cases (T8/T9/T9b/T10/T10b/T11) cover the M-2 rapid-click guard, the M-1 explicit `durationMs:3000` toast contract, the L-1 `focus({ preventScroll: true })` call, and the prefers-reduced-motion CSS override. T9b/T10b also pin the live source via regex assertions so the inline-shim tests cannot drift from production without the source assertion catching it.

---

## B-167 UAT plan — Durable claim identity (R5)

Maps to `docs/design/73-b-167-durable-claim-identity.md` §73.16 acceptance scenarios. **UI-observable signals only per S45 retro discipline** — the product-owner is not asked to read `chrome.storage.local`, dump JSON, or interpret SW-console output. Every PASS/FAIL signal is read off the sidepanel UI surface (claim indicator, drift indicator, the Open Tabs section's row count).

### Pre-UAT setup (once)

1. Load the unpacked extension in Edge from the repo root via `edge://extensions` → Developer Mode → "Load unpacked".
2. Pin the toolbar icon and open the sidepanel.
3. Confirm a group with at least one saved bookmark exists. If not, create a group named "UAT-S46" and add one bookmark pointing at `https://music.youtube.com/` (title "YT Music").

### Test cases

| # | Scenario | Steps | UI-observable expected result | Status |
|---|----------|-------|------------------------------|--------|
| UAT-1 | S-1 happy path — extension reload preserves binding (§73.16 UAT-1, AC3 + AC4) | (a) In the sidepanel, click the "YT Music" bookmark in UAT-S46 — a new tab opens at `https://music.youtube.com/`. (b) Confirm the row shows the live-claim indicator (live badge / coloured dot — whichever v1 surface uses) AND that the YT Music tab does NOT appear duplicated in the Open Tabs section. (c) In `edge://extensions`, toggle Tab Junkie OFF, wait 2 seconds, toggle ON. (d) Reopen the sidepanel. | The "YT Music" row still shows the live-claim indicator pointing at the same open tab. No drift indicator persists. The YT Music tab is NOT listed in Open Tabs as if unclaimed. **FAIL** if the row shows offline / the YT Music tab appears in Open Tabs as orphan / a drift indicator persists >2 seconds after sidepanel renders. | _pending_ |
| UAT-2 | S-2 backstop — browser restart with restored tabs (§73.16 UAT-2, AC3 + AC5) | (a) Start from the UAT-1 end-state. (b) Close Edge completely (`File → Exit`) with "Continue where you left off" enabled in Edge settings. (c) Reopen Edge — the YT Music tab restores automatically. (d) Open the sidepanel. | The steady-state "YT Music" row shows the live-claim indicator. A drift indicator may flicker briefly during reconcile, but the steady end-state is live-claimed. YT Music is not listed in Open Tabs as orphaned. **FAIL** if the steady-state row shows offline OR a persistent drift indicator remains after the sidepanel has fully rendered (>2 seconds). | _pending_ |
| UAT-3 | Corrupt-partition graceful degradation (§73.16 UAT-3, AC6) | (a) Open SW DevTools (edge://extensions → Tab Junkie "service worker" link → Console). (b) Paste and run: `chrome.storage.local.set({ 'tj:itemClaims': { schemaVersion: 1, sessionTag: 'x', entries: 'not-an-object' } })`. (c) Close SW DevTools. (d) Toggle Tab Junkie OFF then ON in `edge://extensions`. (e) Reopen the sidepanel. | The sidepanel renders normally — all groups visible, all saved bookmarks visible, no error toast, no red banner, no crash overlay. Previously-claimed bookmarks recover their claim within ~2 seconds via the Phase 2/3 inference backstop. **FAIL** if the sidepanel shows blank, throws an error overlay, displays a red error toast, or any saved group/bookmark is missing. | _pending_ |
| UAT-4 | Rollback safety — schema v8 → v7 downgrade (§73.16 UAT-4, AC10) | (a) Note the current sprint's version (sidepanel footer or `edge://extensions` card). (b) Remove the current build from `edge://extensions`. (c) Load the prior shipped build (v1.40.0 or the build that immediately precedes this sprint's release) unpacked. (d) Open the sidepanel. | Extension loads without errors; sidepanel shows the same groups + bookmarks as before the rollback; no safe-mode banner; no data-loss banner; no crash. **FAIL** if the extension enters safe-mode (banner visible), the sidepanel renders blank, saved bookmarks are missing, or an error toast appears on load. **Recovery if FAIL**: follow §73.13 rollback procedure (manual `chrome.storage.local.set` reset of `tj:meta.schemaVersion` to 7) — this is documented operator follow-up, not a UAT regression. | _pending_ |

**Pass criteria**: UAT-1, UAT-2, UAT-3 must record PASS. UAT-4 may record `SKIP` if the test environment cannot tolerate rollback (rolling back exits the test environment); the §73.13 rollback procedure is treated as documented-and-untested in that case. Any FAIL on UAT-1, UAT-2, UAT-3 returns B-167 to R3.

**Test-engineer note on R5 gap-fillers**: `tests/b167-durable-claim-identity.test.js` was expanded from 17 → 22 cases. The 5 added cases (T17–T21) cover the public-API end-to-end cold-start contract (`isClaimsReady` + `getItemIdForTab` post-reconcile), Q3 MSG_DEMOTE_ITEM ordering invariants, zero-tab cold start, scale (50-entry durable partition), and the claim-then-immediate-release race case. Existing T1–T16 already covered all R5 charter items from §73.15 verbatim plus the R4 CONV-1 regression guard.
