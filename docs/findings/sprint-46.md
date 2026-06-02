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
