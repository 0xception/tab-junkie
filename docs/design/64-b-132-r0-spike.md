# §64 — B-132 R0 Spike (Floating Tabs Land in Open Tabs After Extension Reload)

**Owner:** [solution-architect]
**Round:** R0 (Spike-First Tier 3 — likely M Full but R0 mandated by §58/§59/§60 subsystem-risk precedent)
**Sprint:** 40
**Date:** 2026-04-29
**Status:** R0 spike output — read-only static analysis, no code changes.

---

## §64.1 — Purpose and scope

Single-item R0 spike for **B-132** (P1/TBD, filed 2026-04-30 from
product-owner observation post-v1.33.0 ship). Repro per BACKLOG row B-132:

> Open extension fresh → floating tabs appear in originating group correctly
> (per B-121 contract). Reload extension via Edge `Reload` button → newly-
> spawned floating tabs route to Open Tabs section instead of the originating
> group.

The bug sits squarely in the §58/§59/§60 subsystem (tab-claims +
opener-chain + floating-groups + cold-start re-association). R0 mirrors the
§58 merged R0 spike pattern — distinguish failure modes, surface root cause
with `file:line` citations and confidence ratings, recommend Tier and
sub-item structure for [scrum-master].

- BACKLOG row: `docs/BACKLOG.md:171` (B-132 in-progress | 40).
- Companion R1-LOCKED spike for B-131 verify-first lives at
  `docs/findings/sprint-40.md` (verdict A — wontfix-not-repro pending UAT).
- Subsystem As-Built chapters: §58 (R0), §59 (B-125 `inheritedTabs` Set),
  §60 (B-121 floating-tab runtime render + lazy v1→v2 schema migration).

---

## §64.2 — Investigation method

Read-only static analysis. Files walked in full or in scope:

- `background/service-worker.js` (188 lines) — SW cold-start orchestration:
  `runMigrations` → `registerTabEventListeners` → `initializeLiveState`.
- `background/tabs/index.js` (48 lines) — `initializeLiveState` sequence:
  `buildLiveTabIndex` → `reconcileClaims` → `reassociateFloatingGroups`.
- `background/tabs/tab-claims.js` (337 lines) — `claimsMirror`,
  `inheritedTabs` Set (B-125 §59.3), `reconcileClaims` Phase 1 + Phase 2,
  `reevaluateTab`, the B-125 inheritedTabs gate at line 250-252.
- `background/tabs/opener-chain.js` (85 lines) — `openerMap`,
  `walkOpenerChain`, `recordOpener`, `pruneOpener`.
- `background/tabs/tab-events.js` (353 lines) — `chrome.tabs.onCreated`
  opener-chain async block at lines 125-185; `chrome.tabs.onRemoved`
  pruneInherited at 209-212; `chrome.tabs.onUpdated` debounced
  `reevaluateTab` at 100-117.
- `background/tabs/floating-groups.js` (262 lines) — schema v1/v2
  bidirectional read tolerance via `getParentItemId`;
  `reassociateFloatingGroups` cold-start path (position-match + URL
  fallback, no claim writes); `appendFloatingGroup` v2 stamping.
- `background/tabs/floating-members.js` (167 lines) — runtime
  `buildFloatingMembers` resolver called on every `MSG_LIST_ITEMS`;
  position-match-then-URL-fallback against the same data.
- `background/tabs/live-tab-index.js` (104 lines) — `buildLiveTabIndex`
  via `chrome.tabs.query({})` cold-start population.
- `background/storage/migration.js` (360 lines) — `runMigrations`
  cold-start hook; `KNOWN_VERSION = 2` (B-121 §60.4.7); v1→v2 no-op
  governance step.
- `background/messages/storage-handlers.js:200-250` — `MSG_LIST_ITEMS`
  case body: `buildFloatingMembers(items)` →
  `collectFloatingTabIds(floatingMembers)` →
  `buildOpenTabs(floatingTabIds)` → response shape includes
  `floatingMembers`.
- `background/broadcast.js` (16 lines) — `requireClaimsReady` gate.
- `tests/floating-position.test.js` — AC8 cold-start position-match tests
  (3 cases including the B-125-collision case at line 68-91).
- `tests/floating-session-wipe.test.js` — AC12 storage.session-wipe replay
  cases proving `tj:floatingGroups` survives `chrome.storage.session.clear()`.
- `tests/b121-floating-group-render.test.js:83-143` — T-121-A cold-start
  replay scenario (`seedPartitions` + `__setMockTabs` + `reconcileClaims` +
  `MSG_LIST_ITEMS` round-trip).
- `tests/floating-shape.test.js`, `tests/floating-multi.test.js`,
  `tests/floating-url-fallback.test.js` (skim) — schema invariants and
  URL-fallback regressions.

Recent commit context surveyed via the §60.14 As-Built table. No code
changes since v1.33.1; B-121 + B-125 shipped at v1.32.0 in Sprint 38;
B-124 + B-122 at v1.33.0 in Sprint 39; B-130 hotfix at v1.33.1 affected
only the dotted-bar CSS / DOM shape, not any runtime resolver.

---

## §64.3 — Failure-mode disambiguation

The BACKLOG row asks R0 to distinguish two modes:

- **Mode (a) — Post-reload spawn only.** Tabs that were already floating
  before the reload still render correctly inside their group. Tabs spawned
  AFTER the reload (e.g., a fresh middle-click on a now-claimed parent
  bookmark) land in Open Tabs.
- **Mode (b) — Pre-existing also affected.** Tabs that were floating before
  the reload also vanish from their group on reload, ending up in Open Tabs
  (or wherever else).

R0's static analysis predicts **BOTH MODES are observable**, with
**different root causes that share a single cross-cutting precondition**
(SW-memory wipe on extension reload). The BACKLOG row's repro phrasing
("newly-spawned floating tabs now go to Open Tabs section instead of the
originating group") most cleanly matches **Mode (a)**, but **Mode (b)** has
a real failure surface that R0 confidently locates and that R5 UAT must
exercise.

Both modes resolve at root from the same architectural fact: the
**ephemeral SW-memory state required to inherit a floating-tab into a
parent group is destroyed on extension reload.** Specifically:

1. `openerMap` (`background/tabs/opener-chain.js:12`) — in-memory
   `Map<number, number>`, never persisted, lost on every SW restart.
2. `inheritedTabs` (`background/tabs/tab-claims.js:30`) — in-memory
   `Set<number>`, never persisted, lost on every SW restart (documented as
   the B-125 cold-start trade-off in §59.3 "Cold-start state").
3. `claimsMirror` (`background/tabs/tab-claims.js:19`) — in-memory mirror,
   re-read from `chrome.storage.session.tj:tabClaims` on cold start.
   **`chrome.storage.session` is documented (per Chrome MV3) as cleared on
   browser restart AND on extension reload.** §10.5 line 14 states:
   *"`chrome.storage.session` under key `tj:tabClaims`, cleared by Chrome
   on browser restart (AC8)"*. The "extension reload" wipe is implicit in
   the same Chrome contract — see §64.4 H-3 (R2-VERIFY) below.

Only `tj:floatingGroups` (in `chrome.storage.local`) is durable across
extension reload — see §64.5.

---

## §64.4 — Hypothesis enumeration with refutations

### H-1 — `openerMap` lost on SW restart → post-reload `chrome.tabs.onCreated` cannot find a parent group → no `appendFloatingGroup` → tab lands in Open Tabs

**(Mode-a primary cause — HIGH confidence, ~85%.)**

- **Static-source citation**:
  - `background/tabs/opener-chain.js:12` — `const openerMap = new Map();`
    declared at module scope, NEVER persisted. Comment at lines 6-9:
    *"Ephemeral: the openerMap is lost on SW restart — consistent with
    Chrome's own behavior (opener relationships are not persisted across
    restarts)."*
  - `background/tabs/opener-chain.js:22-25` — `recordOpener` writes
    in-memory only.
  - `background/tabs/tab-events.js:140-141` — `if (typeof tab.openerTabId
    === 'number') { recordOpener(tab.id, tab.openerTabId); }`. Called only
    from inside `chrome.tabs.onCreated`.
  - `background/tabs/tab-events.js:148` —
    `walkOpenerChain(tab.id, claimsMirror, items)`. Walks **in-memory
    openerMap** only; if `openerMap.get(tab.id)` returns `undefined`,
    `walkOpenerChain` returns null (loop at lines 63-77 short-circuits).
  - `background/tabs/tab-events.js:149` — `if (result) { ... }` gates
    `appendFloatingGroup`. **Null result → no floating-group record
    written → no `markInherited` call → no opener-chain inheritance.**
- **Failure mechanism**:
  - User reloads extension. SW dies. `openerMap` is empty on next SW
    cold start.
  - User middle-clicks a link inside an already-open bookmarked tab
    (parent tab is already claimed by `reconcileClaims` at cold-start
    via URL match — see H-3).
  - Chrome fires `chrome.tabs.onCreated` for the NEW spawned tab. The
    `tab.openerTabId` IS set (Chrome populates `openerTabId` from the
    spawning tab — opener-chain at the Chrome layer is preserved, but
    that's NOT TJ's `openerMap`).
  - `recordOpener(newTab.id, parentTab.id)` runs — adds an entry FOR
    the new tab.
  - `walkOpenerChain(newTab.id, claimsMirror, items)` runs. It looks up
    `openerMap.get(newTab.id)` which IS the parent tab id (just added).
    So far so good — H-1 is NOT triggered for the new tab itself.

  **Wait — this refutes H-1 as stated.** Re-examining:

  - `walkOpenerChain` at `opener-chain.js:61` — `let currentTabId =
    openerMap.get(tabId);` returns the parent's tabId.
  - At `opener-chain.js:65-72` — searches `claimsMirror` for an item that
    claims `currentTabId`. If the parent is claimed, returns the parent's
    `{groupId, itemId}`.
  - The parent IS claimed at this point (because `reconcileClaims` ran at
    cold-start and matched the parent's URL).
  - So `walkOpenerChain` returns the parent's `{groupId, itemId}` → the
    `if (result)` block runs → `appendFloatingGroup` writes the new tab's
    record → `markInherited(newTab.id)` runs → broadcast fires.

- **Refutation of H-1 as initially stated**: H-1 in its "openerMap lost"
  framing **is not the root cause** because each fresh `onCreated` event
  AFTER the SW boot re-populates openerMap synchronously before the async
  walk (`recordOpener` is called at line 141; `walkOpenerChain` runs after
  `await readyPromise` at line 145). The new tab's opener IS in the map
  by the time the walk runs.

- **Likelihood for H-1-as-stated**: **LOW (~5%)** — refuted by the
  synchronous-recordOpener-before-async-walk ordering at lines 141-148.

But there is a **subtler version** of H-1 that survives:

### H-1' — `openerMap` lost → if the user spawns from a **descendant** of a bookmarked tab (more than one hop), the chain is broken

**(Mode-a secondary surface — MEDIUM, ~15%.)**

- **Static-source citation**: `opener-chain.js:58` — `walkOpenerChain`
  default `maxHops = 3`. The walk follows
  `openerMap.get(currentTabId)` repeatedly looking for a claimed ancestor.
- **Failure mechanism (post-reload)**:
  - Pre-reload: parent P (claimed) → child A (floating, in `openerMap`,
    in `inheritedTabs`) → grandchild B (floating, openerMap[B] = A,
    inheritedTabs has B).
  - SW reloads. `openerMap` empty. `inheritedTabs` empty.
  - Post-reload, the browser still has P, A, B all open.
  - `reconcileClaims` runs. P's URL matches saved bookmark → P claimed
    again. A and B are unclaimed (URLs don't match any saved item).
  - `reassociateFloatingGroups` runs. A's record matches A's tab
    (position match), unclaimed → record retained. B's record matches B's
    tab, unclaimed → record retained. **Good news.**
  - `buildFloatingMembers` on next `MSG_LIST_ITEMS` resolves both A and B
    correctly via position match → both render under P's group.
    **Pre-existing tabs A and B are fine — Mode (b) is NOT triggered for
    this hop pattern.**
  - User now middle-clicks a link in tab B (the grandchild). Chrome fires
    `onCreated` for new tab C with `openerTabId = B.id`.
  - `recordOpener(C, B)` runs synchronously. openerMap = `{C → B}`.
  - `walkOpenerChain(C, claimsMirror, items)` walks: `openerMap.get(C) =
    B`. Searches `claimsMirror` for B → not present (B is unclaimed; B is
    a floating tab, not a saved item). Loops to next hop:
    `openerMap.get(B) = undefined` (because `recordOpener(B, A)` was
    NEVER called in this SW lifetime — that recording only happened in
    the previous SW lifetime which was destroyed). **Walk returns null.**
  - C is treated as a user-initiated tab. No `appendFloatingGroup` is
    called. `reevaluateTab` (when C's URL resolves) is NOT gated by
    `inheritedTabs` (C is not marked) — auto-claims any URL-matching
    saved item if applicable, otherwise falls into Open Tabs.
- **Likelihood**: **MEDIUM (~15%)** — this captures the deep-chain case
  but the BACKLOG repro is described as "middle-click a link inside a
  group" (one hop from a bookmarked parent), not "middle-click inside an
  already-floating tab". H-1' is a real bug but probably not the primary
  observation.

### H-2 — `inheritedTabs` Set lost on SW restart → no semantic effect on Mode (a) freshly-spawned tabs (the set is repopulated on each `appendFloatingGroup` write within the same SW lifetime)

**(Mode-a refuted — LOW confidence, < 5%.)**

- **Static-source citation**:
  - `tab-claims.js:30` — `const inheritedTabs = new Set();` declared at
    module scope, NEVER persisted.
  - `tab-claims.js:38-40` — `markInherited(tabId)` adds to set.
  - `tab-events.js:176` — `markInherited(tab.id)` is called immediately
    after `appendFloatingGroup` resolves for every newly-spawned floating
    tab.
- **Failure mechanism (post-reload)**:
  - User reloads extension. SW dies. `inheritedTabs` empty.
  - User middle-clicks. New tab C spawns. `appendFloatingGroup` writes.
    `markInherited(C.id)` runs → `inheritedTabs = {C.id}`.
  - C's URL resolves. `reevaluateTab(C, C.url, items)` runs.
    `if (inheritedTabs.has(C.id)) return;` short-circuits. **No
    auto-claim. C remains a floating tab.**
  - Subsequent `MSG_LIST_ITEMS` → `buildFloatingMembers` → C surfaces
    under parent's group. **Mode (a) NOT triggered for this path.**
- **Refutation**: post-reload Mode (a) for tabs whose opener resolves
  through the `walkOpenerChain` happy path is NOT broken by `inheritedTabs`
  loss. The set is correctly repopulated within each SW lifetime.
- **Likelihood**: **LOW (~5%)** — H-2-as-stated does not explain the
  observed bug.

But H-2 has a **secondary surface for pre-existing tabs (Mode b)**:

### H-2' — `inheritedTabs` Set lost → pre-existing floating tabs that navigate to a URL matching a saved item are auto-claim-eligible

**(Mode-b primary cause — MEDIUM-HIGH, ~50%.)**

- **Static-source citation**:
  - `tab-claims.js:250-252` — the B-125 gate inside `reevaluateTab`.
  - §59.3 "Cold-start state" — *"`inheritedTabs` is empty on SW
    cold-restart. ... Inherited tabs that fail re-association become
    eligible for auto-claim — documented as known-acceptable per
    §59.4(iii)."*
- **Failure mechanism (post-reload, Mode b)**:
  - Pre-reload: tab F is floating under parent P's group (P claimed, F in
    `inheritedTabs`, F has a `tj:floatingGroups` record at position
    `(W, idx)` with URL `https://floating.com`).
  - User reloads extension. SW dies. `inheritedTabs` empty. F is still
    open in the browser at the same position with the same URL.
  - SW boots. `buildLiveTabIndex` populates F at `(W, idx, url:
    https://floating.com)`.
  - `reconcileClaims` Phase 2 runs (lines 149-178). It builds a
    `urlToTabs` map of every UNCLAIMED tab keyed by normalized URL. F is
    unclaimed (claims live in `tj:tabClaims` which has been cleared by
    extension reload — see H-3 below; or even if claims persisted, F was
    never in claims). It iterates saved items in sortOrder and tries to
    claim each.
  - **If a saved item S exists with URL `https://floating.com` (same as
    F), `reconcileClaims` claims S to F.**
  - `reassociateFloatingGroups` runs next. F's `tj:floatingGroups`
    record's position match resolves to F's tabId. F is now in
    `claimsMirror` values. Per `floating-groups.js:144-152` — record is
    PRUNED ("matched + already-claimed → prune").
  - F is now claimed by saved item S. The user sees S's row become
    "live" with F's tabId. The originating-group floating-tab UX is
    LOST.
  - This is the §58.3(e) B-125 claim-jump bug, but happening at
    **cold-start** rather than at runtime — and the B-125 gate
    (`inheritedTabs.has(tabId)`) does NOT cover `reconcileClaims` Phase 2
    (the gate sits inside `reevaluateTab`, lines 234-267, which is a
    different code path).

- **Sub-case**: If no saved item's URL matches F's URL, `reconcileClaims`
  Phase 2 does not claim F. `reassociateFloatingGroups` then leaves F's
  record in place (matched + unclaimed). `buildFloatingMembers` next
  `MSG_LIST_ITEMS` → F surfaces under P's group correctly. **Mode (b)
  is NOT triggered when no URL collision exists.** This is why
  `tests/floating-session-wipe.test.js` AC12 (line 36-58) passes — the
  test's seed URL has no saved-item collision.

- **Likelihood**: **MEDIUM-HIGH (~50%)** — fires whenever (a) the
  floating tab's URL coincidentally matches a saved bookmark, AND (b)
  the user reloads the extension. The product-owner's repro (BACKLOG row
  B-132) doesn't explicitly call out URL-collision, but a multi-tab user
  with several bookmarks sharing domains is realistically prone to this.

### H-3 — `chrome.storage.session.tj:tabClaims` is wiped by extension reload

**(Cross-cutting precondition — HIGH, ~95% pending R2-VERIFY.)**

- **Static-source citation**:
  - `tab-claims.js:4-6` — *"Persisted in `chrome.storage.session` under
    key `tj:tabClaims` so claims survive SW restarts within the same
    browser session but are wiped on browser restart (AC8)."*
  - `docs/design/10.5-livetabindex-tabclaims-architecture.md:14` —
    same statement.
  - **R2-VERIFY**: per Chrome MV3 documentation, `chrome.storage.session`
    is also cleared on **extension reload** (the developer tools
    "Reload" button on `chrome://extensions`). This is implicit in the
    SW-lifecycle model: extension reload tears down the entire extension
    runtime context, which includes the SW process AND all session
    storage. Confirm via direct test in Edge: load the unpacked
    extension, write `chrome.storage.session.set({foo: 'bar'})` from the
    SW console, click Reload, observe `chrome.storage.session.get('foo')`
    returns `undefined`. **R2 must verify this empirically before
    finalizing the fix.**
- **Failure mechanism (post-reload, both modes)**:
  - Pre-reload state: `tj:tabClaims = {item-X: tabId-Y}` for every
    bookmark whose URL matches an open tab.
  - User reloads extension. Per H-3, `tj:tabClaims` is empty
    post-reload.
  - `reconcileClaims` Phase 1 (validate existing claims) finds an empty
    map → nothing to validate → empty `reconciled`.
  - `reconcileClaims` Phase 2 (claim unclaimed items) runs against ALL
    live tabs and ALL saved items. **This is full re-association from
    scratch every time the extension reloads.** It's expected behavior
    — the SW correctly handles this. But it interacts badly with
    floating tabs whose URL collides with a saved item's URL, because
    Phase 2 has no concept of `inheritedTabs` (B-125's gate sits in
    `reevaluateTab`, not in `reconcileClaims`).
- **Likelihood**: **HIGH (~95%)** — this is a documented Chrome contract.
  R2-VERIFY adds the empirical confirmation.

### H-4 — Chrome assigns NEW tabIds on extension reload, breaking position-keyed floating-group records

**(Refuted — LOW, < 1%.)**

- **Static-source citation**: not directly testable from source; relies
  on the Chrome MV3 lifecycle contract.
- **Falsification**: extension reload tears down the EXTENSION's process
  but does NOT close user-facing tabs. Tab IDs are owned by the BROWSER,
  not by the extension. Chrome preserves tabIds across extension reload.
  Empirical evidence: every tab event handler in `tab-events.js`
  receives the same `tab.id` after a reload as before; if tabIds were
  renumbered, every `chrome.tabs.onUpdated` post-reload would see
  unfamiliar tabIds and the entire `LiveTabIndex` rebuild path would
  not converge — users would see a cascade of "new tab" events on
  reload, which they don't.
- **Likelihood**: **LOW (~1%)**.

### H-5 — `reassociateFloatingGroups` cold-start re-bind is broken (e.g., position match fails because LiveTabIndex was not yet built)

**(Refuted — LOW, ~2%.)**

- **Static-source citation**:
  - `background/tabs/index.js:35-48` — `initializeLiveState` sequence:
    `Promise.all([buildLiveTabIndex(), initWindowOrdinals(),
    listItems()])` → `await reconcileClaims(items)` → `await
    reassociateFloatingGroups(getLiveTabIndex(), getClaimsMirror())`.
    **Ordering is correct** — the live tab index is fully built before
    re-associate runs.
- **Falsification**: `tests/floating-position.test.js` AC8 first case
  (lines 22-42) — seed `tj:floatingGroups`, `__setMockTabs` to put the
  floating tab back, `buildLiveTabIndex`, `reassociateFloatingGroups` →
  record retained. Test passes (1,732/1,732 baseline).
- **Likelihood**: **LOW (~2%)** — re-associate is structurally correct
  per §60.4.3.

### H-6 — `buildFloatingMembers` runtime resolver fails post-reload due to async race between SW boot and first sidepanel `MSG_LIST_ITEMS` dispatch

**(Refuted — LOW, ~2%.)**

- **Static-source citation**:
  - `background/messages/storage-handlers.js` (the dispatcher) —
    `readyPromise` gating ensures every `MSG_LIST_ITEMS` awaits the SW's
    `runMigrations` (and the migration runner waits for partition init).
    `initializeLiveState` runs in parallel with `registerStorageHandlers`
    but `MSG_LIST_ITEMS` does NOT directly await `initializeLiveState`'s
    completion. **R2-VERIFY** whether there's a race where the sidepanel
    dispatches `MSG_LIST_ITEMS` before `reconcileClaims` finishes.
  - `tab-claims.js:280-287` — `buildLiveStates` returns "not ready"
    defaults when `claimsReady === false`. Sidepanel renders rows as
    not-live and re-fetches on next broadcast.
- **Failure mechanism**: theoretically possible if the sidepanel
  receives MSG_LIST_ITEMS response with empty `floatingMembers` (because
  `claimsMirror` is still empty during Phase 2's await window). On
  the subsequent broadcast (after `claimsReady = true`), a re-fetch
  re-renders correctly.
- **Refutation**: even if this race fires, the sidepanel re-fetches on
  the next `MSG_STATE_CHANGED` broadcast (which fires after every
  `appendFloatingGroup` and after every `reevaluateTab`). The race
  window is bounded by one round-trip and self-heals. Not the
  sustained Mode (a) symptom the user reports.
- **Likelihood**: **LOW (~2%)** — possible transient surface, not
  sustained bug.

### H-7 — Mode (a) primary cause: `inheritedTabs` Set is empty, but `reconcileClaims` Phase 2 has already claimed parent P at cold start, AND a freshly-spawned floating tab F's URL matches a different saved item S → `reevaluateTab` auto-claims F to S because the B-125 gate is bypassed (gate not yet set; SW just booted; no `appendFloatingGroup` has yet run for the freshly-spawned tab)

**(Refuted as "primary" — LOW, ~5%.)**

- **Static-source citation**: same as H-2.
- **Failure mechanism**: the user spawns a floating tab AFTER the SW has
  fully booted. `appendFloatingGroup` writes; `markInherited(F.id)` runs
  immediately after; the `inheritedTabs` set HAS the entry by the time
  `reevaluateTab` runs (debounced 100ms after `onUpdated`).
- **Refutation**: `tab-events.js:176` — `markInherited` is called
  synchronously after `await appendFloatingGroup(...)` resolves, in the
  same async block as the opener-chain walk. The 100ms debounce on
  `reevaluateTab` (line 116) provides the temporal margin documented in
  the §59.10.1 R4 M-1 comment. **The B-125 gate IS effective for
  freshly-spawned post-reload tabs.** H-7 is refuted.
- **Likelihood**: **LOW (~5%)**.

### H-8 — Mode (a) primary cause: post-reload sidepanel state is stale; the sidepanel was open BEFORE the reload, lost its connection, never re-fetched MSG_LIST_ITEMS, so it doesn't see the floating-member that the SW knows about

**(Possible Mode-a UI-side surface — MEDIUM, ~25%.)**

- **Static-source citation**:
  - `sidepanel/sidepanel.js:5676-5678` — `chrome.runtime.onMessage`
    listener for `MSG_STATE_CHANGED`.
  - On extension reload, the EXTENSION-PAGE sidepanel context is also
    torn down (the sidepanel is hosted in the extension's process). When
    the user re-opens the sidepanel post-reload, it re-renders from
    scratch via cold-start `MSG_LIST_ITEMS`.
  - **But**: per Edge UX, the sidepanel may auto-reload within milliseconds
    of the extension reload — the page reloads, message listeners
    re-register, and the cold-start `boot` path runs `MSG_LIST_ITEMS`.
    This is the same path that T-121-A exercises in unit tests.
- **Failure mechanism**: if the sidepanel's first post-reload
  `MSG_LIST_ITEMS` dispatch fires BEFORE the SW's `initializeLiveState`
  completes (`reconcileClaims` + `reassociateFloatingGroups`), the
  response will have an empty/incomplete `floatingMembers`. Subsequent
  broadcasts trigger re-fetches that converge to the correct state.
- **Refutation as primary**: the convergence point is bounded by
  ~100-300ms (SW cold-start orchestration time). The user reports a
  PERSISTENT misroute ("newly-spawned floating tabs NOW go to Open Tabs
  section" — sustained, not transient). H-8 cannot explain a sustained
  failure; the sidepanel WOULD self-heal on the next `tab/created`
  broadcast.
- **Likelihood**: **MEDIUM (~25%)** as a **transient UX confusion** that
  the user might mis-report as the bug, but **LOW (~5%)** as the actual
  sustained-state bug.

### H-9 — Mode (a) primary cause: the sidepanel page survived the extension reload but the SW crashed and could not be re-established; the sidepanel sees stale data and broadcasts are silently dropped

**(Refuted — LOW, ~2%.)**

- **Static-source citation**: not directly observable; would require
  reproduction.
- **Failure mechanism**: extension reload via `chrome://extensions`
  Reload button is a clean SW restart — the SW comes back up. Edge does
  not leave SW in a non-recoverable state on Reload; this is a
  developer-supported workflow.
- **Likelihood**: **LOW (~2%)**.

### H-10 — Mode (a) NEW PRIMARY: the `MSG_LIST_ITEMS` round-trip post-reload fires too early — before `reassociateFloatingGroups` writes the floatingTabId-stamped record. The pre-reload record IS present in `tj:floatingGroups` storage and `buildFloatingMembers` would surface it correctly. So Mode (a) is NOT actually broken for tabs spawned post-reload **as long as `appendFloatingGroup` runs and `tj:floatingGroups` gets the new record.**

**(Self-refutation through deeper code-trace — LOW, ~3%.)**

This is the synthesis: the cold-start flow IS structurally sound for the
freshly-spawned-post-reload case. Trace it:

1. SW boots. `initializeLiveState` runs `buildLiveTabIndex` →
   `reconcileClaims(items)` → `reassociateFloatingGroups(...)`.
2. User middle-clicks a link. Chrome fires `chrome.tabs.onCreated` for
   new tab C with `openerTabId = parentTab.id`.
3. `recordOpener(C, parentTab)` runs. Async block awaits `readyPromise`
   (already resolved) and `listItems()`.
4. `walkOpenerChain(C, claimsMirror, items)` runs with `claimsMirror`
   populated by `reconcileClaims`. Returns `{groupId, itemId}` of
   parent.
5. `appendFloatingGroup({...})` writes a new record to
   `tj:floatingGroups` (which already has any pre-reload records).
6. `markInherited(C.id)` runs.
7. `broadcast(LIVE_STATE, 'tab/opener-inherited')` fires.
8. Sidepanel's `MSG_STATE_CHANGED` listener triggers
   `refetchAndPatchLiveState` → `MSG_LIST_ITEMS` → response includes
   `floatingMembers[parentGroupId]` with the new tab descriptor.
9. Sidepanel renders the synthetic row under parent's group section.

**Every step in this sequence works structurally.** H-10 thus refutes
Mode (a) as a B-121-runtime-pipeline failure. So if the bug is real,
its mechanism must be in the **interactions between H-2' (Mode b URL
collision) and H-1' (Mode a deep-chain) and H-3 (claims wipe).**

- **Likelihood for H-10 as a refutation**: **HIGH (~80%)** — Mode (a)
  for shallow-chain (one-hop) cases should structurally work. The
  product-owner repro is most likely either:
  - (a) deep-chain (multi-hop opener) → H-1' fires.
  - (b) URL-collision pre-existing tab → H-2' fires (this is **Mode b**
    masquerading as Mode a in the report).
  - (c) sidepanel UI race → H-8 fires (transient, self-healing).

---

## §64.5 — Most-likely root cause synthesis

Given the H-X enumeration, R0 surfaces a **two-cause root mechanism**
that fits both modes the user reports:

### (1) — Mode (b) primary: `reconcileClaims` Phase 2 has no `inheritedTabs` gate; pre-existing floating tabs get auto-claimed by URL-matching saved items at cold start

**HIGH confidence (~75% — pending UAT confirmation).**

The B-125 fix (§59.3) gates `reevaluateTab` (the URL-change
re-evaluation path), but `reconcileClaims` Phase 2 (the cold-start
URL-matching path at `tab-claims.js:149-178`) has NO such gate. After
extension reload:

- `tj:tabClaims` is wiped by the platform (H-3, R2-VERIFY).
- `inheritedTabs` is wiped (in-memory, every SW boot).
- `reconcileClaims` Phase 2 builds `urlToTabs` from EVERY unclaimed
  tab, including pre-existing floating tabs.
- Any saved item whose URL matches a floating tab's URL gets that
  floating tab auto-claimed.
- `reassociateFloatingGroups` then prunes the floating-group record
  (matched + already-claimed → prune at `floating-groups.js:144-152`).
- The floating tab is now in `claimsMirror` → `buildOpenTabs` excludes
  it → `buildFloatingMembers` skips it (record gone, plus the matched
  tabId is in claimedTabIds at `floating-members.js:111`) → the saved
  item shows live with the floating tab's tabId, and the originating
  group's floating-row UX is GONE.

**Failure surface citation**:
- `tab-claims.js:149-178` — `reconcileClaims` Phase 2 (no
  `inheritedTabs` check, no `tj:floatingGroups` check).
- `floating-groups.js:144-152` — `reassociateFloatingGroups` prunes
  the matched-claimed record.
- `floating-members.js:111` — `if (claimedTabIds.has(matchedTabId))
  continue;` — runtime resolver skips claimed tabs.
- B-125 gate at `tab-claims.js:250-252` — only inside `reevaluateTab`,
  not in `reconcileClaims`.

This explains the BACKLOG repro phrasing ("newly-spawned floating tabs
now go to Open Tabs section") **if** the freshly-middle-clicked link's
URL matches a saved bookmark — the new tab IS spawned post-reload, but
the bug fires the moment its URL resolves: `reevaluateTab` is GATED
correctly (B-125 holds for the new tab because `markInherited` ran), but
**the pre-existing floating tabs that survived the reload may have
already been claim-jumped by `reconcileClaims` Phase 2** at SW boot — and
the user observes a UI in which the post-reload-spawn floating tab
appears CORRECTLY under its parent (B-125 holds), but pre-existing
floating tabs have moved to other saved items' rows. The user reads this
as "floating tabs are landing in Open Tabs after reload" because the
visual signal (the floating-row UX) is gone — even though the post-
reload-spawn case is technically working, the pre-existing-floating
case is broken in a way that DOMINATES the visual diff.

**Note (M-7 R2-VERIFY)**: the user might also be reporting Mode (a) for
the deep-chain case (H-1'). UAT must distinguish.

### (2) — Mode (a) deep-chain case: `openerMap` lost → second-hop opener-walks return null → fresh middle-click on a floating tab post-reload goes to Open Tabs

**MEDIUM confidence (~20%).**

If the user's repro involves middle-clicking inside a tab that was
ALREADY a floating tab before the reload (rather than middle-clicking
inside the saved-bookmark parent), H-1' fires. The opener walk returns
null because the FORMER floating tab is unclaimed and has no entry in
`openerMap` post-reload. The new tab is treated as user-initiated.

Less likely than (1) because the BACKLOG repro implies one-hop chains,
but worth covering with UAT.

### Why both causes share a fix family

Both causes are downstream of the same single architectural fact:
**the cold-start re-establishment path does not honor floating-group
inheritance.** Specifically:

- `reconcileClaims` is unaware that some live tabs are
  floating-group-tracked.
- `inheritedTabs` is not re-populated from `tj:floatingGroups` at
  cold-start (which would be a one-line addition to
  `reassociateFloatingGroups`).
- `openerMap` cannot reasonably be reconstructed (Chrome doesn't expose
  pre-reload opener relationships) — but cold-start re-population of
  `inheritedTabs` from the persisted `tj:floatingGroups` records would
  cover the contractual gap (mark every tab that has an
  un-promoted floating-group record as "inherited").

---

## §64.6 — Recommended fix sketch

**Two-line architectural change** (one production line in
`floating-groups.js`, one production line in `tab-claims.js`):

### Fix A — Cold-start population of `inheritedTabs` from `tj:floatingGroups`

In `background/tabs/floating-groups.js` `reassociateFloatingGroups`:
after the position-match → URL-fallback resolution, for every record
that is **matched + unclaimed** (the "leave in place" branch at line
153), call `markInherited(matchedTabId)`. This re-establishes the B-125
contract for every pre-existing floating tab on every SW cold start.

```js
// background/tabs/floating-groups.js — inside the records loop, after
// matched/claimed/prune branch, in the "matched + unclaimed → leave in
// place" implicit-fall-through branch:
if (matchedTabId !== null && !claimedTabIds.has(matchedTabId)) {
  markInherited(matchedTabId);  // NEW — B-132
}
```

This requires an import of `markInherited` from `tab-claims.js`. Since
`floating-groups.js` already exists in the same subsystem and
`tab-events.js` already imports `markInherited` from there, the import
direction is clean and circular-import-free.

**Effect**: pre-existing floating tabs are marked `inheritedTabs` at SW
boot. **However**, this alone does NOT fix Mode (b) because
`reconcileClaims` Phase 2 runs BEFORE `reassociateFloatingGroups` (per
`tabs/index.js:45-47`). The claim-jump has already happened by the time
Fix A would run.

### Fix B — Reorder cold-start: read `tj:floatingGroups` BEFORE `reconcileClaims` Phase 2; populate `inheritedTabs` first

In `background/tabs/index.js`, swap the order:

```js
// background/tabs/index.js — initializeLiveState
const [, , items] = await Promise.all([
  buildLiveTabIndex(),
  initWindowOrdinals(),
  readyPromise.then(() => listItems()),
]);
// NEW: pre-populate inheritedTabs from floatingGroups before reconcile
await preMarkInheritedFromFloatingGroups();  // NEW helper
await reconcileClaims(items);
await reassociateFloatingGroups(getLiveTabIndex(), getClaimsMirror());
```

The new helper `preMarkInheritedFromFloatingGroups()` reads
`tj:floatingGroups`, walks each record, finds the live tab via
position-match-then-URL-fallback (same algorithm as
`reassociateFloatingGroups`), and calls `markInherited(matchedTabId)`
for every unclaimed match. **It does NOT write claims** — purely a
marker pass.

### Fix C — Gate `reconcileClaims` Phase 2 on `inheritedTabs`

In `background/tabs/tab-claims.js` `reconcileClaims`, Phase 2 loop at
lines 169-178: skip any `tabId` that is in `inheritedTabs`.

```js
for (const item of sorted) {
  const normalized = safeNormalizeForMatch(item.url);
  if (!normalized) continue;
  const available = urlToTabs.get(normalized);
  if (available && available.length > 0) {
    // B-132: skip auto-claim if the candidate tab is opener-chain-inherited
    // (re-established at cold-start by Fix B above).
    let claimed = false;
    while (available.length > 0) {
      const candidate = available[0];
      if (inheritedTabs.has(candidate)) {
        available.shift();  // skip this one, try the next
        continue;
      }
      const tabId = available.shift();
      reconciled[item.id] = tabId;
      claimedTabIds.add(tabId);
      claimed = true;
      break;
    }
    if (!claimed) continue;
  }
}
```

Combined: Fix B + Fix C close Mode (b). Fix B alone (without Fix C)
does NOT close Mode (b) because `reconcileClaims` ignores
`inheritedTabs`. Fix C alone (without Fix B) does not close Mode (b)
because `inheritedTabs` is empty at the time Phase 2 runs.

### Mode (a) deep-chain (H-1')

H-1' is harder to fix architecturally because Chrome doesn't surface
pre-reload opener relationships. **R0 recommendation**: accept H-1' as a
known-acceptable degradation post-reload and document it. The
`inheritedTabs` marker (re-populated by Fix B) DOES protect deep-chain
tabs from being claim-jumped (Fix C), but a NEW middle-click inside a
former-floating tab post-reload still cannot inherit through an opener
chain that no longer exists. The user's recourse is to close the tab and
re-spawn from the bookmarked parent. This trade-off is documented at
§59.3 ("Cold-start state") for the single-tab case; B-132 R6 should
extend the documentation to cover multi-hop deep chains.

### Production LOC estimate

- `background/tabs/index.js` — +3 LOC (helper call + comment).
- `background/tabs/floating-groups.js` — NEW export
  `preMarkInheritedFromFloatingGroups()` (~25 LOC) OR refactor existing
  `reassociateFloatingGroups` to expose a "marker-only" mode (~10 LOC).
  Recommendation: NEW export — single-purpose, smaller blast radius.
- `background/tabs/tab-claims.js` — `reconcileClaims` Phase 2 gate
  (~10 LOC including comment).
- `background/storage/migration.js` — **NO CHANGE.** No storage schema
  change. C-1a/C-1b governance does NOT apply.
- `shared/messages.js` — **NO CHANGE.** No message contract change.
- `manifest.json` — **NO CHANGE.** No new permissions.

**Total production LOC**: ~40 LOC across 3 files.

**Test LOC**: ~150-200 LOC in a new `tests/b132-cold-start-inheritance.test.js`
covering Mode (a) shallow-chain (regression guard), Mode (b) URL-
collision pre-existing case, mixed-mode integration test, and the new
helper's behavior in isolation.

---

## §64.7 — Tier recommendation

**Recommended Tier: M (Full Pipeline).**

Rationale:
- **Not XL Spike-First**: R0 has surfaced the root cause with HIGH
  confidence; the fix sketch is concrete and bounded; no new subsystem
  is introduced. The "two-line architectural change" framing is real
  — Fix B + Fix C together are well-bounded.
- **Not XS/S Fast Track**: the change touches three production files in
  a security-sensitive cross-cutting subsystem (claims + opener-chain +
  floating-groups). All three R4 reviewers (code, security, qa) MUST
  run per CLAUDE.md Gate 1.
- **No schema change**: confirmed at §64.6 — `tj:floatingGroups`,
  `tj:tabClaims`, `tj:meta` all unchanged. C-1a/C-1b not triggered. No
  CHANGELOG SW module-cache flush note needed (a UAT-cycle benefit).
- **Performance budget**: the new `preMarkInheritedFromFloatingGroups`
  helper is O(N_records × N_liveTabs), bounded as in §60.3.2 (≤ 5
  records × ≤ 50 tabs typical). Adds < 1 ms to cold-start
  orchestration. No regression risk against the 200 ms first-paint
  budget.

---

## §64.8 — Sub-item candidates

**R0 RECOMMENDATION: KEEP AS ONE ITEM.** Do not split.

- B-132 has a single, narrow fix surface (cold-start ordering + gate).
- Splitting Mode (a) and Mode (b) into separate items would force
  duplicate test scaffolding (both modes need the same chrome-mock
  cold-start fixture).
- The fix is a 2-3-file change; CLAUDE.md M-tier supports up to ~150
  LOC easily. No need to split.

If R2 surfaces an unexpectedly large blast radius (e.g., a cascading
need to introduce a new storage partition, or an `IntersectionObserver`-
type SW-context feasibility issue), [scrum-master] may upgrade to
Spike-First retroactively per CLAUDE.md "Auto-upgrade rule."

**Companion item already filed**: B-135 (cross-window Open Tabs drag,
deferred from B-134). Not a B-132 sub-item.

---

## §64.9 — Sequencing risk vs B-134

B-134 (drag-reorder) calls `markInherited(tabId)` and `pruneInherited(tabId)`
on ATTACH/DETACH/MOVE operations (per BACKLOG row B-134 ACs 4-6). It does
NOT depend on the cold-start `inheritedTabs` re-population mechanism —
those operations are runtime-only, with both production and test SW
lifetimes already booted.

**B-132 and B-134 can ship in either order.** They touch different code
paths:
- B-132 fix: `tabs/index.js` cold-start ordering + new helper +
  `tab-claims.js reconcileClaims` Phase 2 gate.
- B-134: `sidepanel/sidepanel.js` drag handlers + new SW message
  handlers (`MSG_REORDER_FLOATING_MEMBERS`, `MSG_MOVE_FLOATING_TAB`).

If sequencing must be chosen, **B-132 first** is preferable because it
hardens the contract that B-134 implicitly depends on (`inheritedTabs`
correctly tracks every floating-group-member tab, including post-reload).

---

## §64.10 — Sprint-capacity risk assessment

Given M-tier verdict and the 8.5-13 effort-unit S40 budget (per SPRINT.md
Gate 6), **B-132 can absorb into S40 without deferring B-134.** Effort
allocation:

- B-131 verify-first → close as `wontfix-not-repro` per
  `docs/findings/sprint-40.md` verdict A. **Effort: 0.5 unit.**
- B-132 (this) at M Full → **Effort: 2-3 units** (R1 + R2 + R3 + R4 +
  R5 + R6, no R7 unless docs need updating).
- B-133 Fast Track XS → **Effort: 0.5 unit.**
- B-134 M Full → **Effort: 4-5 units** (R1 LOCKED already; R2-R7).

**Total: 7-9 units.** Within the 8.5-13 budget. No defer-to-S41
recommendation.

The SPRINT.md "mitigation: defer B-134 to S41 if B-132 R0 spike comes
back as XL" trigger does NOT fire — R0 returns M Full.

---

## §64.11 — R1 / R2 handoff

### R1 [product-manager] — what to lock

- **AC1** — After extension reload, a floating tab F that was tracked
  in `tj:floatingGroups` pre-reload AND whose URL matches an unclaimed
  saved item S (`F.url === S.url`) is **NOT** auto-claimed by S during
  `reconcileClaims` Phase 2. F remains a floating-group child of its
  original parent's group.
- **AC2** — After extension reload, a freshly-spawned floating tab
  (post-reload, one-hop opener from a saved bookmark) renders under its
  parent group correctly per B-121's contract. **Regression guard
  against breaking H-10.**
- **AC3** — After extension reload, a NEW middle-click inside a
  pre-existing floating tab F (deep-chain, multi-hop opener) creates a
  tab that lives in Open Tabs (NOT under F's parent's group). **AC3 is
  the H-1' known-acceptable degradation** — explicitly enumerated as a
  CARVE-OUT so R3 doesn't accidentally chase it. **R1 destructive-action
  confirmation status**: N/A (no destructive action; the tab is correctly
  shown live in Open Tabs even if not under the desired group).
- **AC4** — `inheritedTabs` membership for every pre-existing floating
  tab is established post-cold-start, before any opportunity for
  `reevaluateTab` to fire. (Implementation contract: cold-start
  ordering preserves the invariant.)
- **AC5** — Existing tests pass: `tests/floating-position.test.js`,
  `tests/floating-session-wipe.test.js`, `tests/b121-floating-group-render.test.js`,
  `tests/b125-claim-jump-fix.test.js`, `tests/b099-drift-fix.test.js`,
  `tests/b018-persistence.test.js`. **Zero regressions.**
- **AC6** — New test file
  `tests/b132-cold-start-inheritance.test.js` covers the URL-collision
  cold-start path (Mode b primary), the shallow-chain regression guard
  (AC2), the new helper's behavior in isolation, and the
  `inheritedTabs` cold-start population invariant.
- **Destructive-action confirmation (DoR item 7)**: N/A — claim
  mutations and inheritedTabs Set membership do not surface destructive
  UX. Rationale: a misclaimed tab is recoverable by closing the
  spawned tab or running MSG_DEMOTE_ITEM.
- **Selector audit (rehome items)**: N/A — no DOM rehoming.
- **Performance acceptance criteria**: cold-start orchestration
  (`initializeLiveState`) MUST NOT regress; new helper adds < 5 ms on a
  10-record / 50-tab fixture. R5 captures.

### R2 [solution-architect] — what to design

- **C-1a/C-1b**: **N/A** — no schema change. No KNOWN_VERSION bump. No
  CHANGELOG SW module-cache flush note.
- **C-2 (message contracts)**: **N/A** — no message changes.
- **C-3 (SW cold-start safe)**: **APPLIES — central concern.** R2 must
  document the new ordering invariant: `buildLiveTabIndex` →
  `preMarkInheritedFromFloatingGroups` → `reconcileClaims` →
  `reassociateFloatingGroups`. Justify why the new helper is read-only
  and does not require any storage write.
- **C-4 (ID stability)**: **APPLIES.** Confirm tabIds are preserved
  across extension reload (per H-4 falsification). Add an empirical
  R2-VERIFY note in the chapter for [security-reviewer] sign-off.
- **C-7 (allow-list direction)**: APPLIES — the new gate in
  `reconcileClaims` Phase 2 is conceptually a skip-list (skip auto-claim
  if `inheritedTabs.has(candidate)`). Same allow-list ruling as
  §59.7 C-7 — narrows existing permissive default; soft degradation
  blast radius.
- **C-9 (empty-state design)**: APPLIES — enumerate (i) extension
  reload with no floating tabs in storage, (ii) extension reload with
  floating tabs whose URL matches saved items (the critical path), (iii)
  extension reload with floating tabs whose URL has no collision
  (regression guard), (iv) deep-chain new spawn post-reload (AC3
  carve-out).
- **R2-VERIFY 1 (CRITICAL)**: confirm empirically that
  `chrome.storage.session` is wiped on extension reload (per H-3). The
  fix design assumes this; if it turns out session storage IS preserved
  through extension reload in current Edge versions, the fix is still
  correct (Mode b URL-collision can ALSO fire if claims happen to point
  at a tabId that no longer exists — `reconcileClaims` Phase 1 would
  evict that claim and Phase 2 would re-claim from scratch). But the
  storyline simplifies if we know the answer.
- **R2-VERIFY 2**: confirm `appendFloatingGroup` + `markInherited`
  ordering is preserved for freshly-spawned-post-reload tabs. Cite §59.3
  "Cold-start state" trade-off discussion. Document what the
  user-visible behavior is for AC2.
- **R2-VERIFY 3**: confirm `reassociateFloatingGroups` does NOT need
  to be touched by B-132. Fix B introduces a NEW helper rather than
  modifying re-associate. R2 must explicitly call out that re-associate
  is unchanged (avoids re-treading §60.4.3 territory).
- **B-119 fix-scope test-assertion enumeration**: enumerate every test
  asserting `reconcileClaims` behavior or the cold-start
  initializeLiveState ordering. Pre-existing test files affected:
  - `tests/b099-drift-fix.test.js` — Phase 2 auto-claim contract;
    ensure no test seeds a `tj:floatingGroups` record + a saved-item
    URL collision (which would now be skipped by the new gate).
  - `tests/floating-position.test.js` — three AC8 cases. The third case
    (lines 68-91) ASSERTS that a pre-existing claim is preserved and the
    floating record is pruned when `reconcileClaims` claims a tab. This
    test is structurally about claim-survival, not about
    `inheritedTabs`-protected tabs — but R2 must confirm whether the
    test seeds a `markInherited` for that tab BEFORE `reconcileClaims`.
    If yes, the test would FAIL post-fix (claim wouldn't be established
    because gate fires); if no, the test still passes. **R2 must read
    the test verbatim and disambiguate.**
  - `tests/floating-session-wipe.test.js` — three AC12 cases. The
    second case (lines 36-58) is the cold-start replay scenario;
    confirm it still passes.
  - `tests/floating-url-fallback.test.js` — confirm no URL-collision
    seeding.
  - `tests/b121-floating-group-render.test.js` T-121-A / T-121-K — both
    seed `tj:floatingGroups` + live tabs. Confirm no URL-collision with
    other saved items.
  - `tests/b018-persistence.test.js` — GAP-1 / GAP-2 / R4-H1 / R4-H2
    cases. R4-H2 (line 195+) might use URL-match seeding.
  - `tests/b125-claim-jump-fix.test.js` T1-T5 — runtime path; should not
    be affected.

---

## §64.12 — Test surface for the regression

### New unit/integration tests (R5 will write)

**`tests/b132-cold-start-inheritance.test.js`** (new file, ~250 LOC):

- **T-132-A** — Mode (b) URL-collision repro:
  - Seed `tj:floatingGroups` with one record at position (1, 5), url
    `https://floating.com`, parentItemId 'P', floatingTabId 'ft-A'.
  - Seed `tj:items` with two saved items: P (url `https://parent.com`,
    groupId 'G') and S (url `https://floating.com`, groupId 'G2').
  - Seed `__setMockTabs` with three tabs: tab 100 at parent.com (claims P),
    tab 200 at floating.com (the floating tab), tab 300 at unrelated.com.
  - Run `initializeLiveState(readyPromise)`.
  - Assert: `claimsMirror['P'] === 100` (parent claim correct).
  - Assert: `claimsMirror['S'] === undefined` (S NOT auto-claimed by
    floating tab — B-132 fix).
  - Assert: `tj:floatingGroups` still contains the record (NOT pruned).
  - Assert: `inheritedTabs.has(200) === true` (cold-start re-population).
  - Assert: `buildFloatingMembers(items)` returns `{ G: [{ tabId: 200,
    parentItemId: 'P', ... }] }`.
  - Assert: `buildOpenTabs(floatingTabIds)` excludes 200.

- **T-132-B** — Mode (a) shallow-chain regression guard:
  - Set up SW boot with no floating-group records (clean slate).
  - User middle-click simulation: `recordOpener(101, 100)` then run the
    `tab-events.js` async block (or mock it).
  - Assert: post-async, `inheritedTabs.has(101) === true` and
    `tj:floatingGroups` has the new record.
  - Assert: dispatching `MSG_LIST_ITEMS` returns
    `floatingMembers[parentGroupId]` containing tab 101.

- **T-132-C** — `preMarkInheritedFromFloatingGroups` in isolation:
  - Seed a record + a matching live tab.
  - Call `preMarkInheritedFromFloatingGroups()` directly.
  - Assert: `inheritedTabs.has(matchedTabId) === true`.
  - Assert: NO writes to `claimsMirror`, NO writes to
    `tj:floatingGroups`, NO writes to `tj:tabClaims`.

- **T-132-D** — URL-fallback cold-start population:
  - Seed a record at position (1, 5) with url X. Live tab is at position
    (1, 99) with url X (position changed but URL preserved). Assert that
    `preMarkInheritedFromFloatingGroups` finds it via URL fallback and
    marks `inheritedTabs.has(matchedTabId) === true`.

- **T-132-E** — No-collision cold-start (regression guard for
  AC2's positive case):
  - Seed a record + matching live tab whose URL doesn't match any saved
    item.
  - Assert: post-`initializeLiveState`, the record survives, the tab is
    in `inheritedTabs`, and the tab does NOT appear in
    `claimsMirror.values()`.

- **T-132-F** — Phase 2 gate for cleanly-tracked tabs:
  - Identical setup to T-132-A but explicitly call `reconcileClaims` on
    its own (without `preMarkInheritedFromFloatingGroups` first).
  - Assert: S would have been auto-claimed.
  - Then call `__resetTabClaims()`, run
    `preMarkInheritedFromFloatingGroups()`, run `reconcileClaims` again.
  - Assert: S now NOT auto-claimed (gate fires).
  - This pins the fix mechanism explicitly.

### UAT cases (R5)

**`docs/UAT_B-132.md`** (new, 8-10 cases):

- **U-132-1** — Pre-reload URL-collision setup:
  - Seed: bookmark P at parent.com, bookmark S at workday.com (or
    similar real URL). NO live tabs initially.
  - Open both tabs. Click bookmark P in sidepanel. Tab opens at
    parent.com → claimed by P.
  - From parent.com, middle-click a link that resolves to workday.com.
    Floating tab F appears under P's group section in sidepanel (per
    B-121).
  - Click `chrome://extensions` → Reload Tab Junkie.
  - **Assert UI**: P's row still shows live with parent.com tab. F still
    appears under P's group, NOT in Open Tabs section, NOT under S's row.

- **U-132-2** — Post-reload fresh middle-click (B-121 regression guard):
  - With both tabs open and the extension just reloaded, middle-click a
    new link from parent.com.
  - **Assert UI**: new tab appears under P's group section (not in Open
    Tabs).

- **U-132-3** — Mixed-state pre-existing AND post-reload spawn:
  - Pre-reload: 3 floating tabs under P's group (one URL-collision with
    S, two not).
  - Reload extension.
  - Post-reload: middle-click another link from parent.com.
  - **Assert UI**: all 4 floating tabs appear under P's group; none in
    Open Tabs; S's row still shows not-live.

- **U-132-4** — Pre-existing tab whose URL has CHANGED to match S
  pre-reload but no claim was established (because B-125 gate held):
  - Pre-reload: floating tab F with original URL `https://other.com`
    navigated to `https://workday.com` (matches S). B-125 gate prevented
    auto-claim. F is still under P's group.
  - Reload extension.
  - **Assert UI**: F still under P's group, NOT under S.

- **U-132-5** — Standalone window parity: same as U-132-1 but in the
  standalone window.

- **U-132-6** — Newtab page parity: same as U-132-1 but with newtab
  page open.

- **U-132-7** — H-1' deep-chain known-acceptable degradation:
  - Pre-reload: parent P → floating tab F → grandchild G under P's
    group.
  - Reload extension.
  - From the now-reloaded extension, middle-click a link inside F (the
    floating tab).
  - **Assert UI**: NEW tab appears in Open Tabs section (NOT under P's
    group). This is the AC3 carve-out — documented degradation. Verify
    no console errors.

- **U-132-8** — No-floating-state regression guard:
  - Open extension fresh (no floating tabs).
  - Reload extension.
  - **Assert UI**: no errors; saved-item rows render normally; Open
    Tabs section shows expected tabs.

- **U-132-9** — Edge browser-restart preserves the fix:
  - Set up Mode (b) URL-collision floating tab.
  - **Close Edge entirely** (not just the tab). Reopen. Open extension.
  - **Assert UI**: NOTE — this is browser restart, not extension reload.
    Per `chrome.storage.session` contract, `tj:tabClaims` is wiped, so
    `reconcileClaims` re-runs from scratch. The fix should still hold.
    `inheritedTabs` was empty pre-restart but is re-populated by
    `preMarkInheritedFromFloatingGroups` post-restart. F should appear
    under P's group again. (This case strictly tests browser-restart
    behavior, which is the legitimate B-018 cold-start path.)

- **U-132-10** — Multi-window parity:
  - Mode (b) URL-collision floating tab in Window 2 (parent in Window 1).
  - Reload extension.
  - **Assert UI**: floating tab still appears under parent's group;
    window-badge correctly shows W2; no claim-jump.

---

## §64.13 — Out of scope (B-132 R0 carve-outs)

- **Cross-window opener-chain inheritance** (B-135 territory) — separate
  item.
- **Persistent `openerMap` storage** — not pursued. Chrome's own
  contract says opener relationships are not persisted; following
  Chrome's lead is correct. The H-1' deep-chain degradation is
  acceptable per AC3.
- **Visual indicator that a floating row is "post-reload re-associated"
  vs "fresh"** — not pursued. The user shouldn't need to distinguish.
- **Schema-version migration to add an "inheritance marker" to
  `tj:floatingGroups`** — not pursued. Pre-marking from the existing
  schema is sufficient.
- **Extending the B-125 `inheritedTabs` Set to be persisted** — not
  pursued. `tj:floatingGroups` IS the persistence layer for "this tab
  was inherited"; re-deriving the in-memory set from it on cold start
  is the architecturally clean direction.

---

## §64.14 — Recent-commit context

`git log --oneline -- background/tabs/` (relevant commits since v1.32.0):

| Commit | Sprint | Items | Plausibly introduced B-132? |
|---|---|---|---|
| `872ad95` | v1.33.1 | B-130 hotfix | **NO** — CSS/DOM dotted-bar shape change only; no tabs/ subsystem touch. |
| `d9869ff` | S38 | B-125 + B-121 + B-120 + B-126 | **YES, latent design gap.** §59.3 explicitly documents `inheritedTabs` being empty on cold start as known-acceptable. The §59.4(iii) "parent bookmark deleted post-inheritance" branch covers part of this, but the URL-collision Mode (b) was not anticipated. The §60.4.3 redesign of `reassociateFloatingGroups` removed the claim-write path (good) but did not add a `markInherited` cold-start re-population step. |
| earlier commits | pre-S38 | B-013 + B-018 | **N/A** — B-125 is the gate that B-132 needs; pre-B-125 there was no `inheritedTabs` concept at all. |

**Conclusion**: B-132 is a **latent design gap** in the §59 + §60
architecture. The merged R0 spike at §58 surfaced the runtime claim-jump
contract (B-125) and the runtime render path (B-121), but did NOT walk
the cold-start side of the contract. The Sprint 38 closure was correct
for runtime behavior but left this cold-start surface unwalked.

The product-owner's "this is a regression" framing is correct in user-
expectation terms but technically the bug is a latent gap that became
observable only after B-121 made the floating-tab UX prominent in v1.32.0.

---

## §64.15 — Sign-off and next round

- **R0 outputs**: this chapter (§64).
- **Recommended Tier**: **M Full** (per §64.7).
- **Sub-item structure**: **single item, no split** (per §64.8).
- **Sequencing with B-134**: B-132 first preferred but not blocking
  (per §64.9).
- **Sprint capacity**: B-132 absorbs into S40 without B-134 deferral
  (per §64.10).
- **Top hypothesis**: §64.5 cause (1) — **Mode (b) URL-collision auto-
  claim during `reconcileClaims` Phase 2 at cold-start; HIGH ~75% pending
  UAT.**
- **Refuted hypotheses**: H-1 (refuted by ordering), H-2-as-stated
  (refuted by `markInherited` synchronous call), H-4 (Chrome
  preserves tabIds), H-5 (re-associate is structurally correct), H-6
  (race self-heals), H-9 (SW reload is clean), H-10 (Mode-a-shallow
  works structurally).
- **Surviving secondary hypothesis**: H-1' deep-chain (~15%, AC3 carve-
  out) and H-2' Mode (b) URL-collision (which is folded into the §64.5
  primary cause).
- **Next round**: R1 [product-manager] for ACs per §64.11. R2
  [solution-architect] (this agent on a return visit) — produce the R2
  design chapter (recommend `docs/design/65-b-132-cold-start-inheritance.md`
  if R2 finalizes the pattern).

**End of §64.**
