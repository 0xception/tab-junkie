# §69 — B-164 — Sleep / Discard-Restore Claim-Mirror Remap

**Status:** R6 AS-BUILT — Sprint 45 closed 2026-05-22 (v1.40.0). R2 plan locked 2026-05-21; R3 build commit `e2f3944`; R4 fix-round commit `c30e18c` (M-1 + M-2 Option B); R5 audit commit `f3914af` (no production code).
**Anchor:** B-164 (P2 / M). Sibling of B-163 (chapter §70 — drift URL fallback).
**Tier:** Full pipeline (M).
**Depends on:** §10.5 (LiveTabIndex & TabClaims architecture — defines `claimsMirror`, `inheritedTabs`, `reconcileClaims`, the four explicit claim-release triggers); §10.8 (Floating-Group Re-Association — defines the `tj:floatingGroups[].liveTabId` field and the per-tab cascade-prune contract); §59 (B-125 — `inheritedTabs` Set lifecycle); §65 (B-132 — cold-start `preMarkInheritedFromFloatingGroups` + graceful-degradation pattern at `background/tabs/index.js:58-62`); §66 (B-137 — `liveTabId` as primary join key on `tj:floatingGroups`); §70 (B-163 — sibling cold-start fix; cite the shared invariant in §69.4 verbatim); B-149 ✅ (Phase-1 URL-drift survival — no design chapter; see `docs/BACKLOG.md:184` + `CHANGELOG.md:142`); B-110 ✅ (§53 paired-clear surfaces — `tab-events.js:319,419`).
**Author:** [solution-architect] (Opus). Written BEFORE R3 build per S44 retro action item 1 (chapter-first); R6 As-Built reconciliation applied 2026-05-22.

**R6 As-Built delta summary (one-line):** R4 surfaced a real async-gap race that the R2 §69.5.4 "SW event-loop serialization" claim missed; M-2 Option B (`_reconcileActive` flag + `_pendingReplacements` queue + drain-callback pattern) was added in `c30e18c` and is now the load-bearing architecture for wake-reconcile correctness — see §69.13 audit trail and the new §69.3.2.1 subsection.

**Out-of-scope (explicit):**
(a) cold-start reconciliation — B-149 (already shipped, Phase-1 survival predicate `tabEntry && item` at `tab-claims.js:174` unchanged) and B-132 (`preMarkInheritedFromFloatingGroups` at `tab-claims.js:58-62` unchanged) already own this surface;
(b) drift URL fallback re-association — B-163 (sibling §70) is the disjoint cold-start algorithm change;
(c) runtime drift detection — `detectDriftForTab` at `background/tabs/drift.js:29-59` is unchanged; no `clearDrift` call-site additions or removals;
(d) storage schema migrations — no field added to any partition, no `KNOWN_VERSION` bump (C-1a + C-1b both N/A);
(e) message contracts — `reconcileClaims` is SW-internal; no `MSG_*` constant added; no `shared/messages.js` change; no payload shape change;
(f) UI surface changes — sidepanel / newtab / popup / standalone render unchanged. No drift bar / floating-state / claim-state visual change. The fix is purely SW-internal mirror maintenance;
(g) generation-counter content predicate (Q6 from R0) — RESOLVED here at C-14 (no counter needed; B-164 writes complete inside the SW single-thread event loop before any consumer reads);
(h) `chrome.runtime.onConnect` keep-alive port alternative to `chrome.idle` (Q3 from R0) — RESOLVED here in §69.3.3 (rejected on minimality + maintenance burden grounds; `"idle"` is the smallest-scope permission that delivers reliable SW-wake-on-active).

---

## §69.1 — Problem statement

The `TabClaims` subsystem (`background/tabs/tab-claims.js`) maintains an
in-memory mirror keyed by `itemId` to `tabId`. The mirror is the
single source of truth for "which live tab is the user's bookmark
tracking right now" — every `buildLiveStates` (sidepanel
`MSG_LIST_ITEMS` enrichment), every `buildOpenTabs` filter (`background/tabs/open-tabs.js:34-63`),
and every `buildFloatingMembers` filter (`background/tabs/floating-members.js:139`)
joins through it.

Three other in-memory structures hold tabId-keyed state that MUST stay
consistent with the mirror across the SW lifetime:

| # | Structure | File:line | Owns |
|---|-----------|-----------|------|
| 1 | `claimsMirror: Record<string, number>` | `background/tabs/tab-claims.js:19` | item → tab binding |
| 2 | `inheritedTabs: Set<number>` | `background/tabs/tab-claims.js:30` | opener-chain auto-claim suppression (B-125 §59.3) |
| 3 | `_faviconStampedItemIds: Set<string>` | `background/tabs/tab-events.js:49` | one-shot favicon-persistence guard (B-159 §A) |
| 4 | `reevalTimers: Map<number, Timeout>` | `background/tabs/tab-events.js:37` | per-tab 100ms `reevaluateTab` debounce (H2) |
| 5 | `liveTabId` field on every `tj:floatingGroups` record | `background/tabs/floating-groups.js:208-211`, persisted via `writeTransaction` | runtime join from floating record → live tab (B-137 §66.5) |

Tables 1-4 are SW-module-scoped; table 5 lives in `chrome.storage.local`
but is read into memory on every cold-start re-association sweep
(`reassociateFloatingGroups`).

Chrome rotates tabIds in two distinct event boundaries that are NOT
covered by existing listeners:

### §69.1.1 — Within-session discard / restore (Test A — empirically confirmed)

Per the R0 probe Test A (`docs/findings/sprint-45.md` § "Probe Results
— RECEIVED 2026-05-21"), modern Chromium/Edge fires `chrome.tabs.onReplaced(addedTabId,
removedTabId)` SYNCHRONOUSLY at the moment of discard, with `addedTabId
!== removedTabId`. The tab is given a NEW id at discard time; the old
id becomes a permanent dead handle.

The user-visible failure mode pre-B-164:

1. User saves bookmark X; clicks it; claim established: `claimsMirror[X] = 803725065`.
2. Edge auto-discards tab 803725065 (memory pressure / `tabs.discard()` call /
   background tab heuristic). `chrome.tabs.onReplaced(803729449, 803725065)` fires.
3. **No listener handles it.** `claimsMirror[X]` still says 803725065;
   `LiveTabIndex.get(803725065)` returns undefined (the old id is dead).
4. `buildLiveStates(X)` sees `tabId !== undefined` but `tabEntry === undefined`
   (the `if (tabEntry)` branch at `tab-claims.js:436` returns falsy);
   X falls through to the not-live default at `:453`.
5. X renders as offline despite the user's tab being alive at the new id.
   `buildOpenTabs` sees tab 803729449 as unclaimed and emits it into the
   Open Tabs section — the user now has the SAME page appearing twice
   (bookmark X as offline; tab 803729449 as a fresh open tab).
6. The user clicks X — `MSG_NAVIGATE_TO_ITEM` opens a fresh duplicate
   tab. Open Tabs accumulates. The original B-164 user-story symptom.

### §69.1.2 — Across-OS-sleep wake (Test B — inconclusive but covered)

Per the R0 probe Test B, closing the laptop lid for 30+ seconds and
reopening produced ZERO events in the SW console. Two interpretations
(both addressed by fix (c)):

- **(B-i)** SW shut down during sleep (MV3 30s-idle rule); any tab events
  that fired post-sleep were silently lost — the well-known MV3 gap
  behind B-149 / B-110.
- **(B-ii)** SW alive but Edge didn't discard any tabs in the 30s window
  — possible if no tabs hit the discard heuristic threshold during the
  brief sleep.

Either way, the consequence is the same: ANY `onReplaced`,
`onRemoved`, or `onUpdated` event that fired while the SW was asleep
is gone. The mirror tables 1-5 above retain stale references to dead
tabIds; no recovery happens until the user manually interacts in a
way that triggers a fresh URL-change or tab-removal event for the
SAME stale tabId (a vanishingly small probability).

The user-visible failure mode is identical to §69.1.1 — bookmarks
appear offline; Open Tabs accumulates; clicking a bookmark spawns a
duplicate.

### §69.1.3 — Architectural framing

B-149 closed the cold-start case (SW wakes; both sides exist and survive
URL drift). B-132 closed the cold-start claim-jump case (opener-chain
inheritance survives cold-start re-association). B-164 closes the
within-session case: **the mirror tables must remap when Chromium
rotates a tabId in-place, AND the mirror must defensively re-reconcile
when the SW wakes from a sleep window where events may have been lost.**

The fix is layered over the existing two-phase reconcile (B-149 / §10.5)
+ the runtime cascade-prune surfaces (B-110 §53 + Fix-A). No phase logic
changes; no storage schema changes; no UI changes. The fix is purely
two new chrome event listeners + one new permission.

---

## §69.2 — R0 option analysis and R2 PICK

The joint B-164 + B-163 R0 spike (`docs/findings/sprint-45.md` § "B-164
R0 Decision") locked option (a) + (c) on 2026-05-21, with (b) — the
empirical probe — as the prerequisite that produced Test A's decisive
signal. R1 ACs were locked same day post-probe (`docs/findings/sprint-45.md`
§ "R1 LOCKED — B-164").

### §69.2.1 — Options enumerated

| # | Option | Surface | Risk | R0 disposition |
|---|--------|---------|------|----------------|
| (a) | `chrome.tabs.onReplaced` listener — 5-table remap on `(addedTabId, removedTabId)` | `background/tabs/tab-events.js` + atomic write to `tj:floatingGroups` | LOW — additive listener; in-memory mirror updates + 1 conditional `writeTransaction`; backward-compatible (no schema bump); probe Test A empirically confirms `onReplaced` fires on discard | **PICKED** (within-session coverage) |
| (b) | Empirical probe — SW console listeners for `onReplaced` / `onUpdated.discarded` / `idle.onStateChanged` / `runtime.onStartup` | None (read-only diagnostic) | None — diagnostic only | **EXECUTED 2026-05-21** as a prerequisite to lock (a) + (c). Output documented in findings. |
| (c) | `chrome.idle.onStateChanged` listener — defensive `reconcileClaims` rerun on `state === 'active'` | New module `background/tabs/idle-reconciler.js` + `"idle"` permission | LOW — additive listener; one `chrome.storage.local` read on wake; covers both Test B interpretations (SW-shutdown OR no-discards-during-sleep) | **PICKED** (cross-sleep coverage) |
| (d) | `chrome.runtime.onConnect` keep-alive port to extend SW lifetime over sleep | New port management module; ongoing maintenance | MEDIUM — heartbeat ports are a known anti-pattern under MV3; complicates SW lifecycle; does not deliver a native OS-wake signal; speculative | Rejected (see §69.3.3) |
| (e) | UI-driven manual "Reconnect bookmarks" button | sidepanel surface change | LOW (additive UI) but USER-VISIBLE COST: requires user to notice + act on the bug; defeats the local-only seamless contract | Rejected (no automatic recovery) |

### §69.2.2 — R2 PICK: combination (a) + (c)

**Rationale (one sentence):** (a) is the smallest in-session fix
empirically validated by Test A (the precise event Chromium emits when
it rotates a tabId carries both the old AND new id in its payload —
sufficient to remap all five mirror tables atomically), and (c) is the
smallest defensive sweep that covers the inconclusive Test B class
(any event missed during SW sleep is repaired by rerunning the
existing B-149 / B-132 / §10.5 cold-start algorithm on the next
`'active'` transition, no new algorithm code).

**Why not (d) keep-alive port.** A `chrome.runtime.onConnect` port from
the sidepanel to the SW would extend SW lifetime past the 30s idle
shutdown — but only WHILE the sidepanel is open. The user's laptop
lid-close scenario leaves the sidepanel CLOSED behind the lock screen;
the port disconnects; the SW idles; we are back to the same gap. (c)'s
`chrome.idle` listener fires on `'active'` regardless of whether any
extension surface is open, because the OS/display state transition is
the trigger. It's also the only documented Chrome API that wakes the
SW on a non-tab-event source. Maintenance burden is one listener +
one debounce/flag check vs. ongoing port-management complexity.

**Why not (e) manual reconnect.** Defeats the local-only seamless
contract; requires the user to diagnose the problem they cannot see
(the bug is "Open Tabs slowly accumulates"; the user has no signal
that the mirror is stale until they observe the duplicate-on-click
symptom). Reactive UX is unacceptable for a correctness repair.

### §69.2.3 — R2 Correctness Checklist application

| Check | Applies? | Status |
|-------|----------|--------|
| **C-1a** — Storage schema version bump (governance) | **PARTIAL — permission-level governance only.** No partition shape changes; `KNOWN_VERSION` stays at 7 (no `MIGRATION_STEPS` entry; no `defaultShape` update for `PARTITION_META`). HOWEVER: adding `"idle"` to `manifest.json` `permissions[]` is a CLAUDE.md "C-1a-class governance" event in the permission-addition sense — the user must toggle the extension OFF→ON after update so Chromium re-evaluates the permission grant and the SW module cache is flushed. This MUST be documented in `CHANGELOG.md` v1.40.0 as a one-time install-time note. The Sprint 30 B-092 `denseLayout` precedent (storage-shape level) applies here in spirit: chrome-mock cannot reproduce permission-grant state, so a UAT-time discovery gap is closed by the explicit release note. See §69.3.3. |
| **C-1b** — Data-migration strategy (data) | N/A — no on-disk shape change. `tj:floatingGroups[].liveTabId` field already exists (B-137 §66.5). B-164 only writes the SAME field with a new value on remap. No migration step; no lazy-read tolerance change; no version-only no-op step. |
| **C-2** — Message contracts typed | N/A. Both new listeners are chrome event listeners (not `chrome.runtime` messages). The `onReplaced` handler is a SW-internal mirror update; the `idle.onStateChanged` handler invokes the existing `reconcileClaims` via the existing `initializeLiveState` plumbing. No `MSG_*` constant added; no `shared/messages.js` change. |
| **C-3** — Service worker cold-start safe | YES. Both listeners are registered SYNCHRONOUSLY at module scope per MV3 requirement (in `registerTabEventListeners` for `onReplaced`; in a new sync-register helper for `chrome.idle.onStateChanged`). The `onReplaced` handler awaits no module-scoped state (it operates on in-memory mirrors that exist from the moment `tab-claims.js` is imported). The `idle.onStateChanged` handler awaits `readyPromise` before invoking `reconcileClaims` (same gating pattern as the existing `tab-events.js:159` debounce). No assumption that the SW was already running. |
| **C-4** — ID stability | YES. The mirror is `itemId → tabId`; itemId is ulid-stable (B-001a). The B-164 remap rewrites the VALUE (tabId) while preserving the KEY (itemId). The five tables all use tabId as the join key on the value side; the remap is keyed on `(removedTabId, addedTabId)` pairs from `onReplaced`. No id-generation logic introduced. |
| **C-5** — Manifest file references | N/A. No HTML/file references added. |
| **C-6** — Permission minimization | **MANDATORY — see §69.3.3 narrative.** `"idle"` is the smallest-scope Chrome permission that delivers a SW-wake signal on OS-display `'active'` transition. Alternatives evaluated: `chrome.runtime.onConnect` keep-alive ports (rejected — does not survive lid-close + sidepanel-closed); `chrome.alarms` polling (rejected — no semantic for "wake event"; would mean periodic full reconciles on a timer, wasteful); `chrome.system.cpu` (rejected — overscoped permission, requires CPU usage queries we don't need). `"idle"` does NOT grant host access, does NOT read user data, does NOT show in the consent prompt as a "scary" permission per Chromium's UI taxonomy. R4 [security-reviewer] confirms the addition is justified. |
| **C-7** — Allow-list direction | YES. Both handlers gate on inclusive predicates: `onReplaced` handler validates `typeof addedTabId === 'number' && typeof removedTabId === 'number'` BEFORE any mirror write; the 5-table remap operates only on entries where the existing tabId matches `removedTabId` (allow-list per-entry membership). `idle.onStateChanged` handler dispatches ONLY on `state === 'active'`; `'locked'` and `'idle'` transitions are explicit no-ops (allow-list state predicate). No deny-list semantics anywhere. |
| **C-8** — SW-context feasibility | YES — both APIs are SW-reachable in MV3 per the verified probe (`docs/findings/sprint-45.md` § "Probe Results — RECEIVED 2026-05-21" demonstrated `chrome.tabs.onReplaced.addListener` works in the SW DevTools console; the `chrome.idle.*` call surface failed only because `"idle"` was not in the manifest at probe time, which is a permission state not an API-availability state). MDN + Chromium reference docs confirm both APIs accept listeners in MV3 service-worker context. |
| **C-9** — Empty-state design | YES. Four enumerated states reasoned in §69.6: (i) `onReplaced` fires for a tabId not in any mirror (chrome rotates a tabId we never claimed; no-op pass-through, no write); (ii) `onReplaced` fires DURING a cold-start before `reconcileClaims` completes (the `isClaimsReady()` check defers remap until claims are ready; queued remaps re-process on the next event); (iii) `idle.onStateChanged === 'active'` fires when no mirror entries are stale (the rerun of `reconcileClaims` is fast: Phase 1 keeps everything, Phase 2 finds nothing to claim, Phases 3-4 from B-163 are no-ops because `evictedItemIds` is empty); (iv) duplicate `'active'` transitions within the same wake window (the debounce-or-flag gate at §69.3.2 suppresses redundant reconciles). |
| **C-10** — Off-screen rect feasibility | N/A. No DOM / canvas / drag work. |
| **C-11** — Popup-lifecycle message ordering | N/A. No popup-side dispatch involved. The fix is SW-resident. |
| **C-12** — Manifest declaration runtime-mutability | N/A. `"idle"` is a non-host non-optional permission added once; behavior is uniform across the extension lifetime. No runtime ON/OFF toggle requirement. |
| **C-13** — Chrome event-feedback completeness | **MANDATORY — this IS the C-13 fix.** The CLAUDE.md C-13 contract: "every Chrome write API has a corresponding listener that updates the in-memory mirror." `chrome.tabs.discard()` is a Chrome write API that rotates tabIds; pre-B-164, NO listener was registered for the resulting `onReplaced` event; the in-memory mirror went stale; user-visible behavior broke (the original B-164 user story). B-164 registers the missing listener. This chapter IS the C-13 remediation; the precedent is the Sprint 40 B-134 H-1 missing-`onMoved` gap + Sprint 40 B-136 v1.34.1 hotfix (which added the listener post-ship). B-164 closes the same class of gap pre-ship. |
| **C-14** — Generation-counter content predicate | **RESOLVED — NO counter needed.** Q6 from R0 asked whether the 5-table remap should bump a generation counter (per the B-148 §63.8.2 precedent that gen-counter over-trips break race-guard B during legitimate drags). Resolution: the `onReplaced` handler runs synchronously inside the SW single-thread event loop; no concurrent reader of `claimsMirror` can observe a mid-remap state because (i) `buildLiveStates` is called only from `MSG_LIST_ITEMS` dispatch, which is itself serialized through the SW event loop; (ii) the sidepanel render uses its own `_cachedItemsGen` / `_cachedFloatingMembersGen` counters (`sidepanel/sidepanel.js:220,272,312`) for ITS cache-invalidation purposes, which are bumped independently when the next broadcast/MSG_LIST_ITEMS cycle fires after the remap. The B-148 over-trip class was a SIDEPANEL drag-state race against SIDEPANEL gen-counters; B-164 is an SW-side mirror update that completes before any sidepanel-visible state changes. No new counter; no over-trip risk. |
| **C-15** — Browser-API rejection-string contract verification | N/A. B-164 does not add `_classifyError` substring predicates. The `chrome.idle.setDetectionInterval()` call has a documented rejection class (`Error: detectionInterval must be at least 15 seconds`) but B-164 picks 60s by default — well above the minimum; no error-handling branch needed. |

---

## §69.3 — Architecture

### §69.3.1 — `chrome.tabs.onReplaced` listener (the fix (a))

**Purpose:** on `(addedTabId, removedTabId)`, perform an atomic 5-table
sweep that rewrites every tabId reference from `removedTabId` to
`addedTabId`. The sweep is the C-13 remediation for the
`chrome.tabs.discard` write API.

**Location:** registered inside `registerTabEventListeners` in
`background/tabs/tab-events.js`, alongside the existing `onRemoved`
listener (currently `:308-331`) and the `onMoved` listener (currently
`:495-527`). Synchronous registration at module scope per MV3.

**The 5 tables remapped, in order (atomic synchronous sweep):**

| # | Table | File:line | Remap operation |
|---|-------|-----------|-----------------|
| 1 | `claimsMirror: Record<string, number>` | `tab-claims.js:19` | scan entries; if `claimsMirror[itemId] === removedTabId`, set `claimsMirror[itemId] = addedTabId` |
| 2 | `inheritedTabs: Set<number>` | `tab-claims.js:30` | if `inheritedTabs.has(removedTabId)`: `inheritedTabs.add(addedTabId); inheritedTabs.delete(removedTabId)` |
| 3 | `_faviconStampedItemIds: Set<string>` | `tab-events.js:49` | NO REMAP REQUIRED — this Set is keyed by `itemId`, not `tabId`. The favicon stamp is one-shot per item per session; itemId stability survives the tabId rotation. (The R1 AC3 enumeration listed this for completeness; on R2 inspection of `tab-events.js:67-68` the Set is itemId-keyed. Documented here so R3 does not add unnecessary remap code.) |
| 4 | `reevalTimers: Map<number, Timeout>` | `tab-events.js:37` | see §69.3.4 — AC6 race resolution; chosen path: re-key timer to `addedTabId` |
| 5 | `liveTabId` field on every `tj:floatingGroups` record | `floating-groups.js` (persisted via `writeTransaction`) | scan records; if `record.liveTabId === removedTabId`, atomic update inside ONE `writeTransaction`; new helper `remapFloatingGroupsLiveTabId(removedTabId, addedTabId)` mirrors the existing `pruneFloatingGroupsByLiveTabId` pattern at `floating-groups.js:960-1010` |

> **Correction to the R0/R1 5-table enumeration** (caught at R2 reading code):
> The R1 LOCKED AC3 listed `_faviconStampedItemIds` as a tabId-keyed Set
> needing the same `add(added)/delete(removed)` swap. The actual code at
> `tab-events.js:49,67-68` keys the Set by `itemId` (the value passed to
> `add()` at `:68` is `itemId`, captured at `:65` via `getItemIdForTab(tabId)`).
> No remap is required for this table because itemId is stable across tabId
> rotation. The "5-table" framing is preserved for traceability against R0/R1
> — table 3 becomes an explicit no-op with a comment. **R1 AC3 PASS criteria
> remain valid** (the assertion "all 5 tables consistent with `addedTabId`
> post-handler" still holds; the third table simply needs no change because
> itemId-keyed state was never inconsistent).

**Algorithm (SKETCH, ~15 LOC — R3 owns implementation):**

```js
// background/tabs/tab-events.js — new listener registered inside
// registerTabEventListeners, alongside the existing onRemoved listener.
chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  if (typeof addedTabId !== 'number' || typeof removedTabId !== 'number') return;
  if (addedTabId === removedTabId) return;
  // C-9(ii) defer: if claims aren't ready yet, the cold-start reconcile
  // will rebuild from authoritative state — no remap needed.
  if (!isClaimsReady()) return;

  // Tables 1+2 — synchronous in-memory remap via tab-claims.js helper
  remapTabIdInClaims(removedTabId, addedTabId);

  // Table 4 — reevalTimers (AC6 contract: re-key, preserve pending fire)
  if (reevalTimers.has(removedTabId)) {
    reevalTimers.set(addedTabId, reevalTimers.get(removedTabId));
    reevalTimers.delete(removedTabId);
  }

  // Table 5 — atomic writeTransaction (fire-and-forget per B-132 pattern)
  remapFloatingGroupsLiveTabId(removedTabId, addedTabId).catch((err) => {
    console.warn('[tab-junkie] B-164 remapFloatingGroupsLiveTabId failed', err);
  });

  // Broadcast so the sidepanel re-renders (LiveTabIndex's onUpdated handler
  // will catch any subsequent URL/favicon change on the new tabId; this
  // broadcast covers the cache-signature invariant for the immediate live
  // state transition tabId remap may cause).
  broadcast(SCOPE.LIVE_STATE, 'tab/replaced', { requireClaimsReady: true });
});
```

**Why a new `remapTabIdInClaims` helper inside `tab-claims.js`.** Tables
1 and 2 are module-private to `tab-claims.js` (no external setter for
`claimsMirror` beyond `claimTabForItem` / `releaseClaimByTab`; the
Set is mutated only via `markInherited` / `pruneInherited`). A combined
helper exposes a single tested entry-point for the 1+2 swap and writes
the result to `chrome.storage.session` via the existing `writeClaims()`
path — preserving the SESSION_KEY persistence contract (claims survive
SW restart inside the same browser session).

**Why fire-and-forget on `remapFloatingGroupsLiveTabId`.** The `liveTabId`
field is a runtime hint (per B-137 §66.7.4 the cold-start resolver also
has POSITION MATCH + URL FALLBACK tiers as backstops). If the
`writeTransaction` fails (transient storage error), the next cold-start
sweep at `floating-groups.js:200-234` will re-resolve via position or
URL match. Mirror B-132 graceful-degradation pattern at
`background/tabs/index.js:58-62`.

**Why the `isClaimsReady()` defer.** During cold-start before
`reconcileClaims` resolves, `claimsMirror` is `{}` and `inheritedTabs`
is empty. An `onReplaced` event fired during this window has no
mirror entry to remap (table 1 lookup misses), no inherited tab to
swap (table 2 lookup misses), no `reevalTimer` to re-key (table 4 is
empty), and the `floating-groups` partition has not been read yet
(table 5 is about to be rebuilt by `reassociateFloatingGroups`).
Deferring the entire handler to "after claims ready" is correct —
any tabId rotation during cold-start is observationally equivalent to
"the new tabId is the one that always existed", and `reconcileClaims`
+ `reassociateFloatingGroups` will bind it correctly. Mirror the
existing `isClaimsReady()` guards at `tab-events.js:64` and the
`requireClaimsReady` flag on broadcasts.

### §69.3.2 — `chrome.idle.onStateChanged` listener (the fix (c))

**Purpose:** on `state === 'active'` (the OS/display transition out of
sleep, lock, or user-idle), defensively rerun `reconcileClaims` to
repair any mirror staleness from events that fired while the SW was
asleep or that the SW never received.

**Location:** new module `background/tabs/idle-reconciler.js`. Exports
`registerIdleReconciler(readyPromise)` invoked synchronously at module
scope from `background/service-worker.js` after `registerTabEventListeners(readyPromise)`
(same MV3 sync-register pattern).

**Why a new module.** Keeps the chrome.idle wiring isolated from
`tab-events.js` so the C-13 surface is auditable on its own.
`background/tabs/index.js` re-exports the new register function from
the barrel so `service-worker.js` imports it from the same path as
the existing live-state symbols.

**`chrome.idle.setDetectionInterval(N)` choice.** R2 picks **60 seconds**
(Chromium's documented default). Rationale: (a) MV3 SW idle shutdown
window is ~30s; setting `N` below 30s offers no benefit (events
during the 30-60s window already trigger SW wake on the next chrome
event anyway); (b) the API documents a 15s minimum so 60s is well
within bounds; (c) 60s matches the OS-level "screen off → idle"
intuition users have for laptop displays. Lower `N` would increase
spurious `'idle'`/`'active'` transitions during normal use (e.g.,
brief mouse-inactivity → false `'idle'` → false `'active'` on the
next mouse-move would cost an extra reconcile every minute).

**Debounce-or-flag semantic (R1 AC2 open question).** R2 picks the
**flag semantic** (vs setTimeout debounce). Rationale: a flag is
simpler, has no timer-cleanup concern, and the relevant window
("don't rerun within this wake event") is naturally bounded by
chrome.idle's own state-machine — once the state has transitioned
to `'active'`, the next transition to `'active'` requires an
intervening `'idle'` or `'locked'` transition (chrome.idle does not
fire `'active'` twice in a row). The flag prevents the rare case
where a `'locked' → 'active'` and a `'idle' → 'active'` could fire
in rapid succession on some OS configurations (e.g., quick unlock
after a system notification). Mirror the existing `isClaimsReady`
flag pattern at `tab-claims.js:22`.

**Algorithm (SKETCH, ~30 LOC — R3 owns implementation):**

```js
// background/tabs/idle-reconciler.js — new file.
import { reconcileClaims } from './tab-claims.js';
import { listItems } from '../storage/items.js';

let _reconcileInFlight = false;

export function registerIdleReconciler(readyPromise) {
  // R2 PICK — 60s detection interval (documented Chromium default).
  try {
    chrome.idle.setDetectionInterval(60);
  } catch (err) {
    // Permission grant race on extension update — log and proceed; the
    // listener registration below is still valid even if setDetectionInterval
    // failed, because Chromium falls back to its built-in default (60s).
    console.warn('[tab-junkie] B-164 idle.setDetectionInterval failed', err);
  }

  chrome.idle.onStateChanged.addListener((state) => {
    if (state !== 'active') return;
    // R2 flag-semantic: suppress duplicate reconciles within same wake event.
    if (_reconcileInFlight) return;
    _reconcileInFlight = true;

    (async () => {
      try {
        await readyPromise;
        const items = await listItems();
        // reconcileClaims is idempotent — Phase 1 keeps live claims, Phase 2
        // claims unclaimed tabs by URL, B-163 Phases 3+4 handle drift. A rerun
        // on a non-stale mirror is a fast no-op.
        await reconcileClaims(items);
      } catch (err) {
        console.warn('[tab-junkie] B-164 on-wake reconcileClaims failed', err);
      } finally {
        _reconcileInFlight = false;
      }
    })();
  });
}
```

**Why no `reassociateFloatingGroups` rerun on wake.** The existing
`initializeLiveState` cold-start sequence runs `reconcileClaims` BEFORE
`reassociateFloatingGroups` (`background/tabs/index.js:63-65`). The B-164
on-wake handler reruns only `reconcileClaims` because (a) re-association
is bounded by `tj:floatingGroups` partition reads, which are expensive
relative to the in-session-stale mirror repair the wake handler targets;
(b) the within-session B-164 fix (a) for `onReplaced` already handles
the `liveTabId` table-5 remap continuously — the floating-group state is
maintained continuously, not just at cold-start. If the SW was sleeping
when an `onReplaced` event fired, the table-5 record is stale, but the
`reconcileClaims` rerun will still bind the saved-item claim correctly;
the floating-group record will lazy-rewrite on the next
`reassociateFloatingGroups` cycle (which runs on the NEXT full cold-start,
not on wake). This is a conscious trade-off documented in §69.11
future-work hooks.

**Cold-start vs wake distinction.** The first `reconcileClaims` invocation
inside `initializeLiveState` runs unconditionally on SW boot — this is
the existing cold-start path; B-164 does not change it. The B-164 wake
handler invokes `reconcileClaims` only on `chrome.idle.onStateChanged ===
'active'`. The two paths share the same algorithm; the wake path is a
narrower trigger (subset of full cold-start). If the SW is asleep at
wake time, the `chrome.idle` event itself wakes the SW (per the documented
behavior: all `chrome.*` events wake the SW), `initializeLiveState`
runs first (because module-scope `await` orders it ahead of the listener
callback), AND THEN the wake handler runs — observationally a double
reconcile; functionally a no-op on the second pass because the first
just bound everything. The `_reconcileInFlight` flag does NOT suppress
the second pass in this exact case because the flag is module-scoped
and resets between cold-starts; this is acceptable (one extra
reconcile per cold-start-from-sleep is cheap).

### §69.3.2.1 — Race-guard architecture (R4 M-2 Option B, As-Built)

**R2 was wrong.** The original §69.5.4 narrative claimed that "SW event-loop serialization" made the `onReplaced` × wake-`reconcileClaims` interleaving safe. R4 qa MED-2 surfaced the real failure mode: **JavaScript's event loop only serializes synchronous blocks**. Once a function `await`s, other events can run and complete before the original function resumes. `reconcileClaims` captures `storedClaims` synchronously at `background/tabs/tab-claims.js:141`, then awaits Phase 3/4 storage reads. During those awaits, `onReplaced` can fire (because `isClaimsReady()` is true), call `remapTabIdInClaims` which rewrites `claimsMirror` in-memory + persists via `writeClaims`. When `reconcileClaims` resumes at `tab-claims.js:309-310`, it builds `reconciled` from the pre-remap snapshot and calls `writeClaims(reconciled)` — silently overwriting the post-remap `addedTabId` back to `removedTabId` in session storage. **The B-164 remap would be erased** in the narrow window of a drifted-URL tab discarded during wake-reconcile.

**Fix shipped (commit `c30e18c`).** Option B: block `onReplaced` from persisting during the wake-reconcile work; queue late events for a post-reconcile drain.

**Module-scoped state (`background/tabs/idle-reconciler.js`):**

- `let _reconcileActive = false;` at `idle-reconciler.js:74` — race-guard flag, **distinct** from the pre-existing `_reconcileInFlight` listener-entry dedup flag at `:45`.
- `const _pendingReplacements = []` at `idle-reconciler.js:76` — FIFO queue of `{addedTabId, removedTabId}` rotations.
- `let _drainCallback = null` at `idle-reconciler.js:78` — callback registered by `tab-events.js` (avoids circular import).

**Accessors exported from `idle-reconciler.js`:**

- `isReconcileActive(): boolean` at `:87` — `tab-events.js`'s `onReplaced` listener consults this to choose inline-apply vs enqueue.
- `enqueuePendingReplacement(addedTabId, removedTabId): void` at `:100` — Array push, preserves FIFO order.
- `setReplacementDrainCallback(fn): void` at `:112` — idempotent (last registration wins).

**Synchronous flag-set BEFORE the first await** (`idle-reconciler.js:160`):

```js
chrome.idle.onStateChanged.addListener((state) => {
  if (state !== 'active') return;
  if (_reconcileInFlight) return;
  _reconcileInFlight = true;
  _reconcileActive = true;  // <-- :160 — visible from the next microtask
  (async () => { try { await readyPromise; ... } finally { ... } })();
});
```

The `_reconcileActive = true` assignment is at module-level synchronous code, executed in the same tick as the listener entry. Any `onReplaced` event that fires from the next microtask onward observes `isReconcileActive() === true` and enqueues.

**Drain loop** at `idle-reconciler.js:176-182` (copy-and-clear + while-loop re-check):

```js
while (_pendingReplacements.length > 0 && _drainCallback) {
  const drain = _pendingReplacements.slice();
  _pendingReplacements.length = 0;
  for (const { addedTabId, removedTabId } of drain) {
    _drainCallback(addedTabId, removedTabId);
  }
}
```

The drain runs **inside** the `_reconcileActive = true` window. Events arriving mid-drain still observe the flag and enqueue, so they're picked up by the next iteration of the while loop. `_reconcileActive = false` is set in the `finally` block at `:186` **after** the drain has fully exhausted.

**Listener gating** (`background/tabs/tab-events.js:436-461`):

```js
chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  if (typeof addedTabId !== 'number' || typeof removedTabId !== 'number') return;
  if (addedTabId === removedTabId) return;
  if (!isClaimsReady()) return;
  if (isReconcileActive()) {           // :455 — race-guard
    enqueuePendingReplacement(addedTabId, removedTabId);
    return;
  }
  _applyTabReplacement(addedTabId, removedTabId);  // :460 — inline apply
});
```

The 5-table remap body was extracted into a module-level `_applyTabReplacement(addedTabId, removedTabId)` helper at `tab-events.js:103-134` so the same code path serves both (a) the inline-apply path when no wake-reconcile is in flight and (b) the queued-drain path inside `idle-reconciler.js`. Drain wiring happens at register-time via `setReplacementDrainCallback(_applyTabReplacement)` at `tab-events.js:434` — callback injection avoids a circular import (`idle-reconciler.js` would otherwise have to import from `tab-events.js`).

**Race-safety reasoning (4 invariants):**

1. **Drain runs INSIDE the flag-true window.** The `while` loop body executes before `_reconcileActive = false` in the `finally`, so any mid-drain `onReplaced` still observes `isReconcileActive() === true` and enqueues (does NOT bypass into inline-apply).
2. **`while`-loop re-checks queue length after each pass.** Events arriving while the drain's `for` loop is running are appended to `_pendingReplacements`; the next while iteration picks them up. The loop only exits when the queue is provably empty.
3. **`slice()` + `length = 0` is a synchronous snapshot.** No `await` between the read and the clear; no entry can be lost between snapshot and reset.
4. **Flag clear in `finally` happens AFTER the while loop exits.** Synchronous code in `tab-events.js:455` either observes `flag = true` and enqueues OR `flag = false` and inline-applies; there is no torn-read window between the two states. The transition from `true → false` is atomic in the single-threaded SW event loop.

**Why Option B over Option A (residual-risk acceptance).** Product-owner authorized the safe option because the residual risk under Option A — a drifted-URL tab discarded during the ~10ms wake-reconcile async window — was directly user-visible (the original B-164 user-story symptom). The +40 LOC for Option B closes the gap definitively at the cost of one module-state coupling (the drain callback registration). Cheaper than carrying the risk forward.

### §69.3.3 — `"idle"` permission addition (C-6 minimization)

**Manifest change:**

```json
// manifest.json line 6 — before
"permissions": ["tabs", "tabGroups", "storage", "sidePanel", "search", "favicon"],

// after
"permissions": ["tabs", "tabGroups", "storage", "sidePanel", "search", "favicon", "idle"],
```

**C-6 minimization rationale:**

| Alternative | Permission | Delivers SW-wake? | Cost |
|-------------|------------|-------------------|------|
| `chrome.idle.onStateChanged` (PICKED) | `"idle"` | YES — native OS-display-state event | minimal: no host access, no user-data read, no network |
| `chrome.runtime.onConnect` keep-alive port from sidepanel | (no new permission) | NO — only while sidepanel is open; fails on lid-close with sidepanel closed | port-management complexity; anti-pattern under MV3 |
| `chrome.alarms` polling every 60s | `"alarms"` | NO — fires on extension's own timer; does not signal OS wake | wasteful (full reconcile every 60s regardless of user state) |
| `chrome.system.cpu` query loop | `"system.cpu"` | NO — query API, not event | overscoped; reads CPU data we don't need |
| `chrome.windows.onFocusChanged` heuristic (focus = wake?) | (no new permission) | PARTIAL — only when user clicks the browser, not on OS wake itself | unreliable; doesn't fire if user wakes the laptop and immediately switches to a non-browser app |

`"idle"` is the smallest-scope permission that satisfies the on-wake
signal requirement. It is classified by Chromium as a "low-impact"
permission (no consent prompt elevation; no user-data access; appears
in `chrome://extensions` permissions list as a single line "Detect when
the user goes idle"). [security-reviewer] sign-off recorded at R4.

**One-time install-time UX (C-1a-class governance):**

Per the Sprint 30 B-092 `denseLayout` precedent, adding a new permission
requires the user to toggle the extension OFF→ON after update so
Chromium re-evaluates the permission grant and the SW module cache is
flushed. The `CHANGELOG.md` v1.40.0 entry MUST include the explicit
note:

> v1.40.0 adds the `"idle"` permission to enable on-wake claim repair.
> After updating, please toggle Tab Junkie OFF and back ON in
> `edge://extensions` (or `chrome://extensions`) to grant the new
> permission and flush the service-worker module cache.

This UAT-time discovery gap is closed by the release note. chrome-mock
cannot reproduce the permission-grant state, so the note is the only
viable mitigation for the install-time path. R5 [test-engineer] UAT
includes a step verifying the toggle-OFF-ON behavior.

### §69.3.4 — AC6 race resolution (`reevalTimers` Map entry handling)

**Race scenario:** `chrome.tabs.onUpdated` fires for URL change on
`tabId = 803725065`; the 100ms debounce timer is set at `tab-events.js:159`
(`reevalTimers.set(803725065, setTimeout(...))`); 10ms later,
`chrome.tabs.onReplaced(803729449, 803725065)` fires; 90ms later the
debounce timer fires.

**R2 PICK — re-key the timer to `addedTabId`** (R1 AC6 LOCKED preferred contract).

```js
// Inside the onReplaced handler — table 4 step:
if (reevalTimers.has(removedTabId)) {
  reevalTimers.set(addedTabId, reevalTimers.get(removedTabId));
  reevalTimers.delete(removedTabId);
}
```

**Why re-key vs clearTimeout.** The pending `setTimeout` callback closure
already captured `changeInfo.url` from the `onUpdated` event (the URL the
user navigated to before discard). When the timer fires, the body at
`tab-events.js:159-170` calls `reevaluateTab(tabId, changeInfo.url, items)`
— the `tabId` parameter is captured at `setTimeout` enqueue time from
the outer closure. **This is the load-bearing detail**: the closure
captured `tabId = 803725065` (the dead id). If we re-key the Map entry
but the closure still passes the dead id, `reevaluateTab(803725065, ...)`
finds no live tab in `LiveTabIndex` and would silently no-op the
claim binding (no `claimsMirror` write because the new-URL-claim branch
gate is `!Object.values(claimsMirror).includes(tabId)` and `tabId =
803725065` was just remapped to `803729449` — `claimsMirror` no longer
contains 803725065, so `alreadyClaimed = false`; then the matching-item
search at `tab-claims.js:389` runs and could ATTEMPT a claim against
the dead `803725065`).

**Correction to R3 implementation per R2 reading.** The R1 AC6 "re-key"
contract is necessary BUT NOT SUFFICIENT — the closure must also be
re-bound. Two options for R3:

| # | Approach | Pros | Cons |
|---|----------|------|------|
| (i) | `clearTimeout` + immediately `setTimeout` again with the new tabId captured in a fresh closure (and the same `changeInfo.url` re-read from a captured local) | Closure is correct; subsequent dispatch goes to the new tabId | Slight code duplication of the setTimeout body |
| (ii) | `clearTimeout` + `reevalTimers.delete(removedTabId)` with NO re-arm (rely on the next `onUpdated` for the new tabId, which will fire if the URL is still navigating) | Simplest; no closure issue | If `onReplaced` arrived AFTER `onUpdated` and the URL is already at its final state, no further `onUpdated` will fire — the reevaluateTab pass is lost; `reconcileClaims` on next wake repairs |
| (iii) | Re-key the Map entry AND ALSO swap the captured `tabId` inside the timer body via a getter that reads the live-remapped id at fire time | Minimal change; works for both pending and not-yet-pending timers | Adds indirection inside `setTimeout` body for a rare race; opaque |

**R2 PICK — option (ii) clearTimeout + delete, no re-arm.** Rationale:
the B-164 on-wake `reconcileClaims` (fix (c)) is the safety net for any
lost reevaluation. Adding closure-rebind complexity for a 90ms race
window post-discard provides negligible incremental coverage relative
to the on-wake sweep. Option (ii) preserves the cleanup discipline
(no orphaned timers) and is the smallest fix; the "lost reevaluation"
edge case is bounded by the next URL change OR the on-wake sweep,
whichever fires first.

**Updated SKETCH for the onReplaced handler — table 4 step:**

```js
// Table 4 — reevalTimers (R2 PICK option (ii): clearTimeout + delete).
// AC6 LOCKED preferred "re-key" contract is upgraded to "clearTimeout"
// at R2 because the captured tabId closure would otherwise stale. The
// on-wake reconcile (fix (c)) covers any reevaluation lost to this branch.
if (reevalTimers.has(removedTabId)) {
  clearTimeout(reevalTimers.get(removedTabId));
  reevalTimers.delete(removedTabId);
}
```

**R1 AC6 contract compatibility.** The R1 AC6 PASS criteria reads "no
stale claim eviction attributable to debounce race; integration test
(mocked `setTimeout`) confirms no `reevaluateTab(removedTabId)` call
post-remap." Option (ii) satisfies both: (a) no stale claim eviction
because the timer is cleared before it can fire against the dead id;
(b) no `reevaluateTab(removedTabId)` post-remap because there is no
post-remap timer at all. The "re-key" wording in R1 AC6 is contract-
intent, not contract-text — the post-condition (no stale call) is
preserved.

---

## §69.4 — Shared invariant with B-163 (claim-mirror authoritativeness)

The joint R0 spike (`docs/findings/sprint-45.md` § "Cross-Item Analysis")
identified one shared invariant that both B-164 and B-163 must cite
verbatim. Per §70.4 (B-163 chapter), the verbatim text is:

> **Claim-mirror authoritativeness.** `claimsMirror[itemId] === tabId`
> is true iff (a) the tab exists in `LiveTabIndex` AND (b) the item
> exists in `tj:items`, regardless of URL drift state (the B-149 §41
> contract). B-164 enforces this by **remapping** the mirror when
> Chromium rotates the tabId on discard/restore; B-163 enforces this
> by **re-establishing** the mirror when neither side existed at
> reconcile time but a drift-URL match exists.

**B-164's contribution to the invariant.** When Chromium rotates a
tabId, the OLD id becomes invalid in `LiveTabIndex` (the `onReplaced`
event implicitly removes the old entry via Chromium's internal tab
identity rotation; our `LiveTabIndex` is rebuilt from the new tab via
the `onUpdated` / fresh-tab-state propagation). Pre-B-164, `claimsMirror[X]
= removedTabId` violates clause (a) of the invariant from the moment
`onReplaced` fires until cold-start. Post-B-164, the `onReplaced`
handler remaps `claimsMirror[X] = addedTabId` synchronously — clause
(a) is restored before any consumer can observe the violation. The
invariant holds continuously during the within-session window.

B-164 and B-163 operate on disjoint event boundaries:
- B-164 = within-session tabId rotation (chromium discard/restore) + cross-sleep wake (chrome.idle.onStateChanged)
- B-163 = full browser restart / SW cold-start where neither side of the original mirror exists but a drift URL points at a fresh live tab

No cross-chapter implementation coupling. The two items can be merged
in any order; both chapters cite the invariant identically so the
joint authority is unambiguous.

---

## §69.5 — Fix scope: code + test enumeration

Per the `CLAUDE.md` "Fix-scope test-assertion enumeration" mandatory
subsection — this section enumerates EVERY file R3 touches AND every
test file that asserts a pre-change contract that needs updating.
**R3 cannot start until this enumeration is verified 100% complete.**

### §69.5.1 — Code files touched

| # | File | Lines (approx) | Change |
|---|------|----------------|--------|
| 1 | `manifest.json` | `:6` | Append `"idle"` to `permissions[]`. Single-line JSON change. |
| 2 | `background/tabs/tab-events.js` | new listener alongside `:308-331` `onRemoved` | Register `chrome.tabs.onReplaced` listener with the 5-table remap (tables 1, 2 via new `remapTabIdInClaims` helper; table 4 via local `clearTimeout` + delete; table 5 via fire-and-forget `remapFloatingGroupsLiveTabId`). Add `isClaimsReady` to the existing `tab-claims.js` import at `:20` (already imported). Add `remapFloatingGroupsLiveTabId` to the existing `floating-groups.js` import at `:26`. Broadcast `tab/replaced` on `SCOPE.LIVE_STATE` with `requireClaimsReady: true`. ~25 LOC added. |
| 3 | `background/tabs/tab-claims.js` | new export `remapTabIdInClaims` after `claimTabForItem` at `:477` | Synchronous helper: scan `claimsMirror` entries; rewrite `claimsMirror[itemId] = addedTabId` for any match; swap `inheritedTabs` Set membership; `await writeClaims()` to persist tables 1+2 to `chrome.storage.session`. JSDoc + ~15 LOC. |
| 4 | `background/tabs/floating-groups.js` | new export `remapFloatingGroupsLiveTabId` after `pruneFloatingGroupsByLiveTabId` at `:1010` | Mirror the `pruneFloatingGroupsByLiveTabId` pattern: pre-flight `readPartition` fast-path (return 0 if no match); single `writeTransaction` with one op (no second op needed because `renderOrder` refs use `floating:<floatingTabId>` not tabId — the prune-path's renderOrder strip is NOT needed here, the floating record IDENTITY survives, only `liveTabId` is updated in place). ~40 LOC including JSDoc. |
| 5 | `background/tabs/idle-reconciler.js` | NEW FILE | Register `chrome.idle.setDetectionInterval(60)` + `chrome.idle.onStateChanged` listener; flag-semantic suppress duplicate reconciles within same wake event; await `readyPromise` then invoke `reconcileClaims(items)`. ~50 LOC including JSDoc + module header. |
| 6 | `background/tabs/index.js` | `:15` | Add `export { registerIdleReconciler } from './idle-reconciler.js';` to the barrel. |
| 7 | `background/service-worker.js` | `:44` | Import `registerIdleReconciler` from `./tabs/index.js`; invoke `registerIdleReconciler(readyPromise)` synchronously alongside `registerTabEventListeners(readyPromise)`. ~2 LOC. |
| 8 | _(none)_ | _(none)_ | `background/tabs/live-tab-index.js` — unchanged. The `onReplaced` event implicitly rotates the live-tab-index entry via Chromium's own state machine; our index is rebuilt from `chrome.tabs.query` on cold-start and patched via `onUpdated` / `onCreated` per-event. No B-164 change to live-tab-index. |
| 9 | _(none)_ | _(none)_ | `background/tabs/drift.js`, `background/storage/migration.js`, `background/storage/shapes.js`, `shared/messages.js`, `shared/url.js`, `sidepanel/`, `newtab/`, `popup/` — all unchanged. |
| 10 | `tests/chrome-mock.js` | new event mocks | Add `tabs.onReplaced: createEventMock()` after the existing `tabs.onMoved: createEventMock()` at `:350`. Add `chrome.idle` surface: `idle: { setDetectionInterval(n) { /* noop, record arg */ }, onStateChanged: createEventMock() }`. Add `tabs.onReplaced._listeners.length = 0` and `idle.onStateChanged._listeners.length = 0` to `__resetMock()` at `:483-516`. ~20 LOC. |

**Total code surface (R2 plan):** 1 manifest change, 6 source files modified, 1 new source file, 1 test infrastructure change. Approximately +130 / -0 LOC net (purely additive).

#### §69.5.1.1 — As-Built deltas from R4 fix-round (commit `c30e18c`)

The R3 build (commit `e2f3944`) shipped the R2 plan as written. The R4 fix-round added the following on top:

| # | File | As-Built change |
|---|------|-----------------|
| 1 | `background/tabs/idle-reconciler.js` | Extended with the M-2 race-guard architecture: `_reconcileActive` flag at `:74`; `_pendingReplacements: Array` at `:76`; `_drainCallback` at `:78`; exported accessors `isReconcileActive` at `:87`, `enqueuePendingReplacement` at `:100`, `setReplacementDrainCallback` at `:112`; flag-set synchronously at `:160` BEFORE the first await; drain loop at `:176-182` (copy-and-clear + while-loop re-check); flag clear in `finally` at `:186` AFTER drain. Test hatches `__resetIdleReconciler` at `:197` extended to reset the new state; `__getPendingReplacements` at `:210` added. **~+90 LOC over R3.** |
| 2 | `background/tabs/tab-events.js` | Extracted module-level `_applyTabReplacement(addedTabId, removedTabId)` helper at `:103-134` (the 5-table remap body that previously lived inline in the `onReplaced` listener). Listener body at `:436-461` now gates on `isReconcileActive()`: true → `enqueuePendingReplacement`; false → inline `_applyTabReplacement`. Drain-callback wiring `setReplacementDrainCallback(_applyTabReplacement)` at `:434`. Imports `isReconcileActive`, `enqueuePendingReplacement`, `setReplacementDrainCallback` from `./idle-reconciler.js` at `:39-43`. **~+15 LOC net (extraction + gate); behavior-preserving for the inline path.** |
| 3 | `tests/chrome-mock.js` | Added `sessionSetCounts: {}` per-key counter at `:26`; per-key increment hook in the session-set path at `:130`; reset in `__resetMock` at `:529`; new exported helper `__getSessionSetCount(key)` at `:642-644`. Enables the M-1 dedup structural assertion. **~+5 LOC.** |
| 4 | `tests/b164-sleep-claim-remap.test.js` | T3 rewritten in place (`:192-217`) — was final-state-only; now asserts `__getSessionSetCount('tj:tabClaims') === 1` after two rapid `'active'` fires (structural dedup proof: detects `_reconcileInFlight` regression). T11 added at `:395-438` — M-2 race scenario via deferred `readyPromise`: onReplaced during wake-reconcile is queued, NOT applied inline; post-drain, `claimsMirror['item-X'] === 200` (post-remap), not 100 (pre-remap snapshot the M-2 race would have produced). T12 added at `:446-496` — multiple onReplaced events drain in FIFO order. **~+110 LOC (T11 + T12 + T3 rewrite).** |

**As-Built total code surface:** R2 plan + the 4 deltas above. R3 (`e2f3944`) + R4 fix-round (`c30e18c`) net ~+250 / -0 LOC across source + tests. Test suite count: 2048 → 2050 (T11 + T12 added; T3 modified in place).

### §69.5.2 — Test files that pin pre-change contracts (MUST update / VERIFY)

Per the CLAUDE.md subsection format: `file:line — asserts <pre-change contract>; update to <post-change contract>`.

**Grep audit run during R2 to discover the universe:**

```
$ grep -rln "manifest\.permissions\|onReplaced\|chrome\.idle" tests/
tests/b036-newtab.test.js
tests/b037-themes.test.js
tests/b043-json-export.test.js
tests/b093-import-export-rehome.test.js
tests/b097-settings-shortcut.test.js
```

(`onReplaced` and `chrome.idle` produce zero hits — confirming no test file
asserts the ABSENCE of these listeners; the only contract pins are on the
manifest permissions list.)

**Manifest permission baseline pin updates (4 files MUST change):**

| # | Test file:line | Asserts (pre-B-164) | Update (post-B-164) |
|---|----------------|---------------------|---------------------|
| 1 | `tests/b036-newtab.test.js:102-113` | `manifest.permissions === ['tabs','tabGroups','storage','sidePanel','search','favicon']` (B-036 AC22 pin to S29 baseline + B-159 favicon) | Update array to `['tabs','tabGroups','storage','sidePanel','search','favicon','idle']`. Update docstring comment at `:103-106` to read "Pre-B-164 the pin was 6 entries (S29 baseline + B-159 favicon). B-164 §69.3.3 adds `idle` for on-wake claim repair. Updated to the new baseline." Update test name suffix to `(B-164 §69.3.3 update)`. |
| 2 | `tests/b037-themes.test.js:567-577` | `manifest.permissions === ['tabs','tabGroups','storage','sidePanel','search','favicon']` (B-037 AC12 pin) | Same array update + docstring comment update at `:568-570` + test name suffix `(B-164 §69.3.3 update)`. |
| 3 | `tests/b093-import-export-rehome.test.js:528-544` | `manifest.permissions.sort() === ['favicon','search','sidePanel','storage','tabGroups','tabs'].sort()` (B-093 AC6 pin) | Update array to include `'idle'` (post-sort: `['favicon','idle','search','sidePanel','storage','tabGroups','tabs']`). Update docstring comment at `:530-531` + test name suffix `(B-164 §69.3.3 update)`. |
| 4 | `tests/b097-settings-shortcut.test.js:69-80` | `manifest.permissions.slice().sort() === expected.slice().sort()` where `expected = ['tabs','tabGroups','storage','sidePanel','search','favicon']` (B-097 AC1-c pin) | Update `expected` to `['tabs','tabGroups','storage','sidePanel','search','favicon','idle']`. Update docstring comment at `:72-73` + test name suffix `(B-164 §69.3.3 update)`. |

**Comment-only pin (no assertion change required):**

| # | Test file:line | Note | Update |
|---|----------------|------|--------|
| 5 | `tests/b043-json-export.test.js:21` | Comment string `'AC13 → no new manifest permissions (verified by R4 grep — not a unit test)'` — no assertion, just a developer note | OPTIONAL touch — update to `'AC13 → no new manifest permissions for B-043 (B-164 added `idle` for unrelated work — verified by R4 grep)'`. Not blocking; R3 may skip. |

**chrome-mock test-infrastructure additions (1 file MUST change):**

| # | Test file:line | Asserts (pre-B-164) | Update (post-B-164) |
|---|----------------|---------------------|---------------------|
| 6 | `tests/chrome-mock.js:338-351` (tabs object), `:466-476` (chromeMock), `:497-507` (__resetMock listener cleanup) | Mock surface lacks `tabs.onReplaced` and `chrome.idle.*` | Add mocks per §69.5.1 #10. Existing tests that don't use these surfaces are unaffected (presence of an additional event mock does not break any existing event-fire pattern). |

**Tests that exercise `reconcileClaims` post-B-164** (VERIFY-no-change):

Per a grep `reconcileClaims` audit (matches the §70.5.2 universe — same
function under test). All 12 test files continue to pass without
modification because the algorithm body of `reconcileClaims` is
unchanged by B-164. B-164 only adds NEW invocation triggers:
(a) `chrome.tabs.onReplaced` does not call `reconcileClaims` (the
synchronous 5-table remap is sufficient — no need to rerun the full
two-phase reconcile for a single tabId rotation); (b) `chrome.idle.onStateChanged
=== 'active'` invokes the existing function unchanged.

| File | VERIFY-no-change rationale |
|------|----------------------------|
| `tests/b110-drift-non-live-fix.test.js` | Tests exercise B-110 cold-start + §53 paired-clear (now B-163 Phase 4) — invocation source is direct `await reconcileClaims(items)` in test setup, not via wake handler. B-164 doesn't change algorithm. |
| `tests/b125-claim-jump-fix.test.js` | Tests B-125 opener-chain Set behavior — `inheritedTabs` Set lifecycle is unchanged by B-164's remap (the Set adds the new tabId + deletes the old, preserving membership). |
| `tests/b132-cold-start-inheritance.test.js` | Tests B-132 cold-start `preMarkInheritedFromFloatingGroups` — runs on cold-start path, not wake-handler. Unaffected. |
| `tests/b149-drifted-claim-survives-cold-start.test.js` | Tests B-149 Phase-1 survival predicate — unchanged. |
| `tests/b163-drift-fallback-reconcile.test.js` | Tests B-163 Phase 3/4 — added in sibling §70; B-164 does not touch these phases. |
| `tests/claims-perf.test.js` | Perf budget on `reconcileClaims` — the wake-handler is a new INVOCATION SOURCE, not an algorithm change; perf budget is per-call, unchanged. |
| `tests/drift-clear.test.js` | Runtime `detectDriftForTab` — unchanged. |
| `tests/drift-floating-perf.test.js` | Perf budget — unchanged. |
| `tests/drift-persist.test.js` | Drift write path — unchanged. |
| `tests/drift-write.test.js` | Drift write path — unchanged. |
| `tests/session-wipe-reclam.test.js` | Session wipe + reconcile — unchanged. |
| `tests/tab-claims-disambiguation.test.js` | Multi-claim disambiguation — unchanged. |
| `tests/tab-claims-reconcile.test.js` | Direct `reconcileClaims` invocation — unchanged. |

**Tests that exercise `tj:floatingGroups` writes** (VERIFY-no-change):

`tests/b121-*.test.js`, `tests/b124-*.test.js`, `tests/b125-*.test.js`,
`tests/b132-*.test.js`, `tests/b137-*.test.js`, `tests/b148-*.test.js`,
`tests/b166-*.test.js` — these exercise `appendFloatingGroup`,
`reorderFloatingMembers`, `moveFloatingTab`, `pruneFloatingGroupsByLiveTabId`,
`pruneFloatingGroupsByParentItemId`, and `pruneResolvedFloatingGroups`.
The new `remapFloatingGroupsLiveTabId` is an additional export with no
intersection in any existing test. VERIFY-no-change across the board.

**Summary:** 4 test files require assertion updates (one-line array
extension each) for the manifest permission baseline pin. 1 test file
requires infrastructure addition (`chrome-mock.js` event mocks).
1 test file has an optional comment update. **R3 cannot start until
this enumeration is verified by [solution-architect]** — the 4 baseline
pins are not optional, and the chrome-mock addition is a prerequisite
for the R5 new test file.

### §69.5.3 — New test file (R5)

| File | Estimated LOC | Cases (planned) |
|------|---------------|-----------------|
| `tests/b164-sleep-claim-remap.test.js` | ~300 | T1–T10 mapped to AC1–AC8 + 2 defensive cases. Detailed in §69.9.1. |

### §69.5.4 — Shared-surface consumer inventory (MANDATORY per CLAUDE.md)

Per the CLAUDE.md "Shared-surface consumer inventory" mandatory subsection.
The B-164 fix adds a new on-wake reader of `claimsMirror` (via
`reconcileClaims` invocation) AND a new in-session writer of
`claimsMirror` / `inheritedTabs` / `reevalTimers` / `tj:floatingGroups[].liveTabId`.
The full consumer inventory:

**`claimsMirror: Record<string, number>` (`tab-claims.js:19`)**

| Consumer | File:line | Direction | Coordination |
|----------|-----------|-----------|--------------|
| `reconcileClaims` (cold-start) | `tab-claims.js:139-327` | WRITE (rebuild) | Single-owner during cold-start window; `claimsReady` flag synchronizes downstream readers |
| `reconcileClaims` (B-164 on-wake — NEW) | `tab-claims.js:139-327` invoked from `idle-reconciler.js` | WRITE (re-validate) | Single-owner per `_reconcileInFlight` flag; serialized through SW event loop |
| `reevaluateTab` (B-099 D-1) | `tab-claims.js:369-402` | WRITE (auto-claim) | Single-owner per debounced URL change; no concurrent runner per tabId due to 100ms debounce + Map cleanup |
| `releaseClaimByTab` (4 triggers per §46.3 D-1) | `tab-claims.js:335-344` | WRITE (delete) | Single-owner per Chrome event; events serialized through SW event loop |
| `claimTabForItem` (floating-group re-association, MSG_PROMOTE_TAB) | `tab-claims.js:477-480` | WRITE (insert/update) | Single-owner per dispatch; awaits `writeClaims()` |
| **`remapTabIdInClaims` (B-164 — NEW)** | `tab-claims.js:~485` (new export) invoked from `tab-events.js` `onReplaced` | WRITE (per-entry rewrite + Set swap) | Single-owner per `onReplaced` event; events serialized through SW event loop |
| `buildLiveStates` | `tab-claims.js:421-456` | READ | Synchronous; gated on `claimsReady` flag |
| `getClaimsMirror` | `tab-claims.js:74-76` | READ | Synchronous reference (read-only contract) |
| `getItemIdForTab` | `tab-claims.js:464-467` | READ | Synchronous O(n) scan |
| Drift detection (`detectDriftForTab`) | `drift.js:29-59` | READ (via `getItemIdForTab`) | Read-only; runs in event-handler context |

**Coordination mechanism for the new consumers (As-Built per R4 M-2 Option B).** The original R2 narrative claimed that "SW event-loop serialization" made the `remapTabIdInClaims` × wake-`reconcileClaims` interleaving safe. **This was incorrect.** The JS event loop only serializes synchronous blocks; once a function `await`s, other events can run and complete before the original function resumes. `reconcileClaims` captures its `storedClaims` snapshot synchronously at `tab-claims.js:141`, then awaits Phase 3/4 storage reads — during those awaits an `onReplaced` event could fire, persist the remap, then be silently overwritten by the pre-remap snapshot when `reconcileClaims` resumes and calls `writeClaims` at `:309-310`. R4 qa MED-2 surfaced this gap; the fix-round commit `c30e18c` closed it.

The shipped coordination uses two flags plus a queue plus a callback (see §69.3.2.1 for the full architecture):

| Flag / structure | File:line | Purpose |
|------------------|-----------|---------|
| `_reconcileInFlight` | `idle-reconciler.js:45` | **Listener-entry dedup** — suppresses a second `'active'` fire before its async work begins (the original R2 flag, unchanged). |
| `_reconcileActive` | `idle-reconciler.js:74` | **Race-guard** (NEW) — set synchronously before the first `await`, cleared in `finally` AFTER the drain completes. `onReplaced` consults this to choose enqueue vs inline-apply. |
| `_pendingReplacements: Array<{addedTabId, removedTabId}>` | `idle-reconciler.js:76` | **FIFO queue** (NEW) — buffers `onReplaced` events that fire while a wake-reconcile is in flight. |
| `_drainCallback` | `idle-reconciler.js:78` | **Callback injection** (NEW) — `tab-events.js` registers `_applyTabReplacement` here at register-time, avoiding a circular import. |

The four-invariant race-safety argument is at §69.3.2.1. The net effect: any `onReplaced` event that fires between the wake-reconcile's first `await` and its final `writeClaims` commit is buffered, then replayed via the drain callback **after** `reconcileClaims` completes but **before** the race-guard flag clears. The final session-storage state reflects the post-remap binding, not the pre-remap snapshot.

For the in-session steady-state path (no wake-reconcile in flight), the original synchronous-mirror reasoning still holds: `_reconcileActive === false`; the listener takes the inline-apply branch at `tab-events.js:460`; `remapTabIdInClaims` rewrites the in-memory mirror synchronously before the `await writeClaims()` resumes; no consumer can observe a torn `claimsMirror` value. **No race-condition class introduced in the inline path.**

**`inheritedTabs: Set<number>` (`tab-claims.js:30`)**

| Consumer | File:line | Direction | Coordination |
|----------|-----------|-----------|--------------|
| `preMarkInheritedFromFloatingGroups` (cold-start) | `floating-groups.js` invoked from `index.js:59` | WRITE (rebuild) | Cold-start single-owner |
| `markInherited` (runtime, after `appendFloatingGroup`) | `tab-claims.js:38-40` invoked from `tab-events.js:266` | WRITE (add) | Single-owner per `onCreated` event |
| `pruneInherited` (`onRemoved`, `windows.onRemoved`) | `tab-claims.js:57-59` invoked from `tab-events.js:312,393` | WRITE (delete) | Single-owner per Chrome event |
| **`remapTabIdInClaims` (B-164 — NEW)** | `tab-claims.js:~485` | WRITE (swap membership: add(new), delete(old)) | Single-owner per `onReplaced` event |
| `isInherited` (reevaluateTab gate) | `tab-claims.js:48-50` invoked from `tab-claims.js:385` | READ | Synchronous Set lookup |
| `reconcileClaims` Phase 2 / Phase 3 inherited-tab skip | `tab-claims.js:219,295` | READ | Synchronous Set lookup |

**Coordination:** Set mutations are synchronous; B-164's swap pattern
(add new + delete old in the same handler tick) preserves cardinality
across the rotation — if the old id was in the Set, the new id is in
the Set after `onReplaced`; if the old id was NOT in the Set (the tab
was not inherited), no Set change occurs. The `reconcileClaims`
inherited-tab skip continues to work because it reads the Set AFTER
the rotation (events are serialized).

**`reevalTimers: Map<number, Timeout>` (`tab-events.js:37`)**

| Consumer | File:line | Direction | Coordination |
|----------|-----------|-----------|--------------|
| `chrome.tabs.onUpdated` (URL change debouncer) | `tab-events.js:156-159` | WRITE (clear+set) | Per-tab single-owner per H2 debounce contract |
| Per-fire callback (inside `setTimeout`) | `tab-events.js:160` | WRITE (delete on fire) | Single-fire per timer |
| `chrome.tabs.onRemoved` (cleanup) | `tab-events.js:313-316` | WRITE (clearTimeout + delete) | Single-owner per `onRemoved` event |
| `chrome.windows.onRemoved` per-tab loop | `tab-events.js:386-389` | WRITE (clearTimeout + delete) | Single-owner per `windows.onRemoved` event |
| **`chrome.tabs.onReplaced` (B-164 — NEW)** | `tab-events.js:~handler` | WRITE (clearTimeout + delete per §69.3.4 option (ii)) | Single-owner per `onReplaced` event |

**Coordination:** Map mutations are synchronous; the B-164 clearTimeout
+ delete pattern is identical to the `onRemoved` cleanup (same code
shape, same single-owner semantic). No new race.

**`tj:floatingGroups[].liveTabId` field (`floating-groups.js:208-211` runtime hint; persisted in `chrome.storage.local`)**

| Consumer | File:line | Direction | Coordination |
|----------|-----------|-----------|--------------|
| `appendFloatingGroup` (runtime new floating tab) | `floating-groups.js:298+` | WRITE (insert with `liveTabId`) | Single-owner per `onCreated` event |
| Cold-start lazy-rewrite (`reassociateFloatingGroups`) | `floating-groups.js:244-252` | WRITE (rewrite stale `liveTabId`) | Cold-start single-owner |
| `pruneFloatingGroupsByLiveTabId` (`onRemoved`, `windows.onRemoved`) | `floating-groups.js:960-1010` | WRITE (delete records by `liveTabId` match) | Single-owner per Chrome event |
| **`remapFloatingGroupsLiveTabId` (B-164 — NEW)** | `floating-groups.js:~1010+` (new export) | WRITE (update records by `liveTabId` match — replace old id with new id, atomic single `writeTransaction`) | Single-owner per `onReplaced` event |
| `reassociateFloatingGroups` tier (a) direct-match | `floating-groups.js:208-211` | READ | Cold-start sweep only |
| `buildFloatingMembers` runtime resolver | `floating-members.js:139` | READ | Per `MSG_LIST_ITEMS` dispatch |

**Coordination:** all write paths go through `writeTransaction` which
serializes via the `txQueue` anchor (per §6 write-boundary enforcement).
The new `remapFloatingGroupsLiveTabId` participates in the same queue;
no new race. The pre-flight `readPartition` fast-path (mirroring
`pruneFloatingGroupsByLiveTabId`) avoids `writeTransaction` invocation
when no record's `liveTabId` matches the `removedTabId` — preserving
the no-storage-write invariant for the common-case `onReplaced` on
non-floating tabs.

---

## §69.6 — Edge cases reconciled to R1 ACs

Per the R1 LOCKED block in `docs/findings/sprint-45.md` § "R1 LOCKED —
B-164 acceptance criteria", B-164 has 8 testable acceptance criteria.
The design above satisfies each as follows.

### §69.6.1 — AC1 (tab discard remap — PROBE Test A path)

Pre-condition: item X claims `tabId: 803725065` in `claimsMirror`
(`tab-claims.js:19`); tab is discarded via `chrome.tabs.discard(803725065)`.

Design satisfies:
- Chromium fires `chrome.tabs.onReplaced(803729449, 803725065)` synchronously
  (empirical Test A confirmation, `docs/findings/sprint-45.md`).
- The new listener in `tab-events.js` fires; `isClaimsReady()` returns
  `true` (post-cold-start steady state); `remapTabIdInClaims(803725065,
  803729449)` runs synchronously.
- Inside the helper: scan `claimsMirror`; find `claimsMirror[X] === 803725065`;
  rewrite to `claimsMirror[X] = 803729449`; the `inheritedTabs` Set is
  not consulted unless `has(803725065)` (X is a saved-item claim, not
  inherited — Set check is a no-op pass-through).
- `await writeClaims()` persists the new mirror to `chrome.storage.session`.
- Within one event-loop tick, `claimsMirror[X] === 803729449`.

Post-render: `buildLiveStates(X)` reads `tabId = 803729449`, finds
`tabEntry = LiveTabIndex.get(803729449)` (the new tab IS in the live
index — Chromium populated it via the same internal rotation that
fired `onReplaced`; our `onCreated` listener also fires for the new
tab if Chromium emits it, which empirical Test A did not show but the
`onReplaced` payload itself is sufficient because table 5 carries the
new id). X stays live/claimed. **AC1 satisfied.**

### §69.6.2 — AC2 (on-wake defensive reconcile — PROBE Test B class)

Pre-condition: SW may have been asleep; any `onReplaced` events fired
during sleep are silently lost (Test B-i interpretation) OR no events
fired at all (Test B-ii interpretation).

Design satisfies:
- OS/display wakes; `chrome.idle.onStateChanged('active')` fires.
- The new listener in `idle-reconciler.js` fires; `_reconcileInFlight ===
  false` (initial state OR reset post-previous-reconcile);
  `_reconcileInFlight = true`.
- `await readyPromise` resolves (already resolved if SW was alive; if
  the wake event ITSELF woke the SW, `readyPromise` resolves after the
  migration pipeline + `initializeLiveState` runs which already
  invokes `reconcileClaims` — the wake handler then runs a second
  invocation, which is idempotent).
- `const items = await listItems()` reads the items partition.
- `await reconcileClaims(items)`: Phase 1 keeps every live claim;
  Phase 2 claims any unclaimed tabs by URL; B-163 Phase 3/4 handle any
  drift records for items evicted in Phase 1. The fast-path (no items
  evicted) completes in <5ms per the §69.8 perf analysis.
- `_reconcileInFlight = false` (finally block).

Duplicate invocations within the same wake event are suppressed by
the flag. **AC2 satisfied.**

### §69.6.3 — AC3 (claimsMirror 5-table remap atomicity)

Pre-condition: `onReplaced(addedTabId, removedTabId)` fires. All 5
tables must update consistently in a single synchronous sweep.

Design satisfies (per §69.3.1 with the R2 correction on table 3):

| Table | Atomicity guarantee |
|-------|---------------------|
| 1. `claimsMirror` | Synchronous Object property rewrite inside `remapTabIdInClaims`; persisted via `await writeClaims()` BEFORE the handler returns |
| 2. `inheritedTabs` | Synchronous Set `add` + `delete` inside same helper; no async gap |
| 3. `_faviconStampedItemIds` | NO REMAP — itemId-keyed; correct at all times across rotation |
| 4. `reevalTimers` | Synchronous `clearTimeout` + Map `delete` (R2 PICK option (ii); see §69.3.4) |
| 5. `tj:floatingGroups[].liveTabId` | Single `writeTransaction` op (atomic per §6 write-boundary contract); fire-and-forget but the in-memory `LiveTabIndex` is updated independently via `onUpdated` / `onCreated` on the new tabId |

Post-handler invariant: no table retains `removedTabId` reference.
Table 3 was never inconsistent (no remap needed). Table 5 may have a
~10ms async gap between handler-return and `writeTransaction` completion
— this is the standard B-132 graceful-degradation pattern and is
acceptable because (a) the in-memory mirror tables 1+2 are correct
synchronously; (b) the floating-group `liveTabId` is a hint with
position + URL fallbacks; (c) the next `buildFloatingMembers` dispatch
reads the freshly-written record. **AC3 satisfied** (with the R2-corrected
table 3 narrative).

### §69.6.4 — AC4 (floating tab survives discard)

Pre-condition: floating tab claimed via opener-chain inheritance
(B-125 §59.3 / B-132 §65.5); `tj:floatingGroups[].liveTabId ===
removedTabId`; tab discarded.

Pre-fix: `buildFloatingMembers` filters by `claimedTabIds.has(liveTabId)`
— `liveTabId` is stale, drops the row.

Design satisfies: AC3 step (5) updates `liveTabId` atomically. The
new `remapFloatingGroupsLiveTabId` helper:
- Pre-flight `readPartition(PARTITION_FLOATING_GROUPS)`; if no record has
  `liveTabId === removedTabId`, return 0 (no-op for non-floating tabs).
- If at least one match exists, `writeTransaction` with one op: scan
  records, replace `liveTabId = addedTabId` where `liveTabId ===
  removedTabId`. Atomic per `txQueue`.

Post-handler: `tj:floatingGroups[].liveTabId === addedTabId` for the
discarded tab's record. `buildFloatingMembers` reads the fresh value;
the floating row remains visible. **AC4 satisfied.**

### §69.6.5 — AC5 (inherited-tab guard preserved after tabId rotation)

Pre-condition: `inheritedTabs` Set contains `removedTabId`; `onReplaced`
fires.

Design satisfies: `remapTabIdInClaims` inside `tab-claims.js` performs:

```js
if (inheritedTabs.has(removedTabId)) {
  inheritedTabs.add(addedTabId);
  inheritedTabs.delete(removedTabId);
}
```

Synchronous; no transient window where both ids are in the Set; no
transient window where neither is. Post-handler:
`inheritedTabs.has(addedTabId) === true` AND
`inheritedTabs.has(removedTabId) === false`. The Phase-2 skip guard at
`tab-claims.js:219` continues working with the new id; the
`reevaluateTab` gate at `:385` continues working with the new id; the
B-125 / B-132 invariant (opener-chain-inherited tabs cannot auto-claim
a saved bookmark) is preserved. **AC5 satisfied.**

### §69.6.6 — AC6 (race with reevaluateTab debounce resolved gracefully)

Per §69.3.4 R2 PICK option (ii): the pending timer is cleared and
deleted; no re-arm. Post-handler: `reevalTimers.has(removedTabId) ===
false`; `reevalTimers.has(addedTabId) === false` (unless a fresh
`onUpdated` fires for the new tabId, which legitimately repopulates).

No `reevaluateTab(removedTabId)` call post-remap (timer is dead).
No `reevaluateTab(addedTabId)` call attributable to the discard
event (the captured-closure is moot; option (ii) discards the
captured state along with the timer). The on-wake `reconcileClaims`
(fix (c)) is the safety net for any lost reevaluation. **AC6 satisfied**
with the option (ii) contract upgrade documented.

### §69.6.7 — AC7 ("idle" permission added with C-6 minimization)

Per §69.3.3: manifest line 6 appends `"idle"`. R3 must also:
- Update `CHANGELOG.md` v1.40.0 entry (responsibility of [release-manager]
  at sprint close) to include the toggle-OFF-ON note per the C-1a-class
  governance precedent.
- Update the 4 test files per §69.5.2 to extend the permission baseline
  pin.

R4 [security-reviewer] sign-off recorded in the §69.3.3 narrative.
**AC7 satisfied** at R3-completion time.

### §69.6.8 — AC8 (no B-149 / B-110 regression)

Pre-condition: existing `tests/b149-*.test.js` and `tests/b110-*.test.js`
pass on branch prior to B-164 R3.

Design satisfies:
- B-149 Phase-1 survival `tabEntry && item` at `tab-claims.js:174` is
  NOT touched by B-164. The new on-wake invocation source runs the same
  algorithm; the predicate body is unchanged.
- B-110 §53 paired-clear semantics: B-163 owns the §53 → Phase 4
  refactor. B-164 does not touch the `clearDrift` call sites in
  `reconcileClaims` (those moved to Phase 4 in B-163; the wake-handler
  invocation re-runs the same Phase-4 logic; no algorithm change).
- Runtime `detectDriftForTab` is unchanged.

Existing b149 / b110 tests continue passing without modification.
The B-164 fix is purely additive (new listener + new helper functions +
new on-wake invocation trigger). **AC8 satisfied.**

---

## §69.7 — Rollback plan

**Rollback is `git revert` + extension reload.**

- **No storage schema change.** `tj:floatingGroups` shape is unchanged
  (the `liveTabId` field already exists per B-137); `tj:tabClaims` shape
  is unchanged; `KNOWN_VERSION` stays at 7. No migration to reverse.
- **No new message type.** `shared/messages.js` unchanged.
- **No new public API.** `reconcileClaims` signature unchanged;
  `claimsMirror` access surface unchanged.
- **The `"idle"` permission requires extra step on rollback.** Per the
  C-1a-class governance precedent: after `git revert` removes `"idle"`
  from `manifest.json`, Chromium continues to show the granted permission
  in `chrome://extensions` until the user toggles the extension OFF→ON
  (or until Chromium re-evaluates the manifest on a subsequent update).
  This is a UX nit, not a correctness issue — Chromium grants only the
  permissions declared in the manifest; the SW will simply throw on
  `chrome.idle.*` calls if any reverted code accidentally still references
  them (none should, because `git revert` removes the listener code too).
- **Backward-compatible storage.** v1.39.0 reading a v1.40.0 storage
  surface reads the same `tj:floatingGroups` shape it always has; no
  `liveTabId` value semantics change. Downgrade is safe.
- **Forward-compatible behavior.** v1.40.0 reading a v1.39.0-flagged
  install runs the new listeners against the same data; pre-B-164
  storage is fully compatible.

**Rollback procedure:**
1. `git revert <B-164 commit SHA>` on `release/v2`.
2. The 5-table remap and on-wake reconcile listeners are gone; the SW
   reverts to the pre-B-164 behavior (within-session discard staleness
   returns; on-wake recovery via cold-start-only sweep).
3. Extension toggle OFF → ON in `edge://extensions` (or
   `chrome://extensions`) to flush the SW module cache and re-evaluate
   the manifest (the `"idle"` permission grant clears on next manifest
   eval).
4. No storage-level cleanup required. No SEV1 scenario plausible. The
   B-164 fix is purely additive correctness repair; reverting loses
   the repair but does not introduce data loss, incorrect binding, or
   regression in any other path.

Per §68.12 / §70.7 / §71.7 established policy: forward-fix preferred;
revert is a clean undo with no data loss.

---

## §69.8 — Performance

**`onReplaced` handler: in-memory + conditional `writeTransaction`.**

- **Table 1+2 (claimsMirror + inheritedTabs):** synchronous Object/Set
  ops + one `chrome.storage.session.set` write. Sub-ms in steady state
  per the existing `writeClaims` budget. Bounded by `O(|claimsMirror|)`
  — typically <50 entries.
- **Table 4 (reevalTimers):** synchronous Map `clearTimeout` + `delete`.
  O(1).
- **Table 5 (`tj:floatingGroups[].liveTabId`):** pre-flight read O(N
  floating records); skip-fast-path if no match; else one
  `writeTransaction` with one op (atomic single-partition update).
  Bounded by floating-group count — typically <100 records. Per the
  existing `pruneFloatingGroupsByLiveTabId` budget (same pattern), this
  is <10ms in worst case.
- **Skip-path** (`onReplaced` for a tabId not in any mirror): the
  helper scans `claimsMirror` and finds no match; returns without
  writing. The `inheritedTabs` Set check is O(1) no-op. The
  `remapFloatingGroupsLiveTabId` pre-flight read returns 0 without
  writeTransaction. **Net cost: 1 storage.session read (claimsMirror
  validation via `writeClaims` is not invoked when no match) + 1
  storage.local read (floating-groups pre-flight) + a few in-memory
  scans.** Bounded; well within budget.

**`idle.onStateChanged` handler: one `chrome.storage.local` read + one
`reconcileClaims` invocation.**

- **`listItems()`:** existing read; cost equivalent to one
  `MSG_LIST_ITEMS` dispatch. ~10-20ms on a 500-item collection.
- **`reconcileClaims(items)`:** existing function; cost bounded by
  `O(|items| + |tabs|)`. Per `tests/claims-perf.test.js:14-44` budget,
  <50ms for 500 items + 50 tabs. The fast-path (no items evicted, no
  drift records to consult) is closer to <10ms.
- **Skip-path** (state !== 'active', OR `_reconcileInFlight === true`):
  zero cost beyond the listener entry/exit.

**Cold-start total budget:** B-164 does not change cold-start sequence.
The `initializeLiveState` path runs unchanged; the new on-wake handler
adds no cost to cold-start.

**Storage write amplification:** `onReplaced` adds at most one
`storage.session.set` (`writeClaims`) + one `storage.local.set`
(`writeTransaction` for floating-groups). Per discard event. Bounded
by Chromium's own discard rate — typically <1/min under memory pressure.
Insignificant relative to the user's own tab-create / URL-navigate
write rate.

**C-14 generation-counter resolution:** NO new counter. Per the §69.2.3
C-14 row: there is no concurrent reader of `claimsMirror` during the
remap (the SW single-thread event loop serializes all consumers). The
sidepanel's own `_cachedItemsGen` / `_cachedFloatingMembersGen` /
`_cachedOpenTabsGen` counters (sidepanel.js:220,272,312) are bumped
independently by the next `MSG_LIST_ITEMS` / `tab/replaced` broadcast
cycle — they cover the sidepanel's cache-invalidation needs, not the
SW's mirror coherence. The B-148 §63.8.2 over-trip precedent (race-guard
B tripping during legitimate drag operations) does NOT apply because
B-164 writes are not visible to the sidepanel drag-state machine until
the next broadcast cycle, and broadcasts are gated on `requireClaimsReady`.

**Net effect:** zero cost in the common-case (no `onReplaced` fires;
no wake event); bounded cost per discard event (~10ms); bounded cost
per wake event (~30ms). All within budget.

---

## §69.9 — Tests planned for R5

Mirrors the §70.9 / §71.9 format. R5 [test-engineer] writes both
automated tests AND performs UAT.

### §69.9.1 — Automated tests (new file)

`tests/b164-sleep-claim-remap.test.js` — ~410 LOC As-Built (was ~300 in R2 plan), **12 cases** (R2 planned T1-T10; R4 fix-round added T11 + T12 for M-2 race coverage; T3 rewritten in place for M-1 structural dedup proof):

| # | Case | Surface | Assertion |
|---|------|---------|-----------|
| T1 | AC1: tab discard remap (saved-item claim survives) | end-to-end via `tabs.onReplaced.__fire` | Seed: 1 item X claimed to `tabId 100`. Fire `chrome.tabs.onReplaced.__fire(200, 100)`. Assert: `claimsMirror[X] === 200`; `claimsMirror[X] !== 100`; `chrome.storage.session.get('tj:tabClaims')` reflects the new id. |
| T2 | AC2: on-wake reconcile rerun | end-to-end via `chrome.idle.onStateChanged.__fire` | Seed: 1 item X claimed; simulate cold-start; fire `chrome.idle.onStateChanged.__fire('active')`. Assert: `reconcileClaims` was invoked (spy via wrap or assertion on a side-effect like `claimsMirror` rebuild count); `_reconcileInFlight` cleared after. |
| T3 | AC2 dedup: duplicate `'active'` suppression (**M-1 As-Built rewrite**) | end-to-end + per-key session-set counter | Fire `chrome.idle.onStateChanged.__fire('active')` twice rapidly. Assert: final state matches single-reconcile result AND `__getSessionSetCount('tj:tabClaims') === 1` after both fires. The counter assertion is the structural dedup proof — `writeClaims` is called exactly once per `reconcileClaims` invocation, so a broken `_reconcileInFlight` gate would yield counter = 2. (R2-planned T3 asserted final-state only — could not distinguish a working gate from a broken-but-idempotent one. M-1 closed this gap.) |
| T4 | AC3: 5-table atomicity | end-to-end | Seed: 1 item X claimed to tabId 100; 1 inherited tab 100; 1 floating-group record with `liveTabId: 100`; 1 reevalTimer for 100. Fire `onReplaced(200, 100)`. Assert: claimsMirror[X]=200, inheritedTabs.has(200) && !inheritedTabs.has(100), floating record's liveTabId=200, reevalTimers.has(100)===false && reevalTimers.has(200)===false (per option (ii)). |
| T5 | AC4: floating tab survives discard | end-to-end | Seed: floating-group record with `liveTabId: 100`, no saved-item claim; mock tabs include both 100 (about to be discarded) and 200 (new id). Fire `onReplaced(200, 100)`. Assert: `tj:floatingGroups` record's `liveTabId === 200`; subsequent `buildFloatingMembers` call returns the floating member entry for 200. |
| T6 | AC5: inheritedTabs guard preserved | end-to-end | Seed: `inheritedTabs.add(100)`. Fire `onReplaced(200, 100)`. Assert: `inheritedTabs.has(200) === true && inheritedTabs.has(100) === false`. Subsequent `reevaluateTab(200, matchingUrl, items)` early-returns at the `inheritedTabs.has(tabId)` gate (line 385); no claim binding occurs. |
| T7 | AC6: reevalTimers race resolved (no stale call) | end-to-end with mocked setTimeout | Seed: `chrome.tabs.onUpdated` fires for tabId 100 → reevalTimers entry created. Within 10ms: `onReplaced(200, 100)` fires. Advance mocked clock 200ms. Assert: `reevaluateTab` was NOT called with `tabId=100` (timer cleared by onReplaced handler per option (ii)); no `claimsMirror` mutation attributable to a stale call. |
| T8 | AC7: manifest contains "idle" | static manifest read | `JSON.parse(readFile('manifest.json')).permissions.includes('idle') === true`. (Cross-covered by the 4 existing-test docstring updates in §69.5.2; T8 is the dedicated test specifically tied to AC7.) |
| T9 | AC8: B-149 + B-110 regression guard | end-to-end | Run the canonical B-149 T1 scenario (drifted-but-live claim survives cold-start) AND the canonical B-110 T4 scenario (drift drop on missing-tab eviction) on a build that has B-164's new listeners registered. Assert: both pass identically to pre-B-164 (defense-in-depth duplicate of the b149/b110 test files; verifies B-164 listeners don't side-effect into those paths). |
| T10 | AC1 defensive: `onReplaced` for non-mirror tabId | end-to-end | Seed: no item claims tabId 100; no inherited tab 100; no floating record with liveTabId 100; no reevalTimer 100. Fire `onReplaced(200, 100)`. Assert: no `chrome.storage.session.set` call (writeClaims short-circuits because no entry needed remapping; the helper must check before writing); no `writeTransaction` call (pre-flight read fast-path short-circuits); zero side-effects. |
| **T11** | **R4 M-2 As-Built: onReplaced during wake-reconcile is queued, not silently overwritten** | end-to-end via deferred `readyPromise` + `__getPendingReplacements` test hatch | Seed: item-X claimed to tabId 100; reconcile run; `claimsMirror['item-X'] === 100`. Register `registerIdleReconciler(deferredReadyPromise)`; fire `'active'` (sets `_reconcileActive = true` synchronously, then awaits the deferred ready). While the wake-reconcile is gated, fire `onReplaced(200, 100)`. Assert: `__getPendingReplacements()` has 1 entry `{addedTabId: 200, removedTabId: 100}`; `claimsMirror['item-X']` still equals 100 (inline remap was correctly suppressed by `isReconcileActive()` gate). Resolve `readyPromise`; drain microtasks. Assert: `__getPendingReplacements()` is empty; `claimsMirror['item-X'] === 200` (post-drain remap applied); `__getSessionStore('tj:tabClaims')['item-X'] === 200` (writeClaims persisted the post-drain remap, NOT the pre-remap snapshot the M-2 race would have produced). |
| **T12** | **R4 M-2 As-Built: multiple onReplaced events drain in FIFO order** | end-to-end via deferred `readyPromise` + multi-event queue | Seed: items A/B/C claimed to tabIds 100/300/500. Register wake-reconcile gated on deferred ready. Fire `onReplaced(200, 100)`, `onReplaced(400, 300)`, `onReplaced(600, 500)` in order. Assert before drain: `__getPendingReplacements().map(p => p.removedTabId)` deeply equals `[100, 300, 500]` (FIFO insertion order preserved by Array.push). Resolve ready; drain microtasks. Assert after drain: `claimsMirror['item-A'] === 200`, `claimsMirror['item-B'] === 400`, `claimsMirror['item-C'] === 600`; queue empty. |

### §69.9.2 — Existing test deltas (per §69.5.2)

| File | Δ LOC | Change |
|------|-------|--------|
| `tests/b036-newtab.test.js` | +1/-1 + docstring | One-line array extension on AC22 permission pin + docstring update |
| `tests/b037-themes.test.js` | +1/-1 + docstring | Same on AC12 permission pin |
| `tests/b093-import-export-rehome.test.js` | +1/-1 + docstring | Same on AC6 permission pin |
| `tests/b097-settings-shortcut.test.js` | +1/-1 + docstring | Same on AC1-c permission pin |
| `tests/chrome-mock.js` | +20 | Add `tabs.onReplaced` event mock + `chrome.idle` surface mock + __resetMock cleanup additions |
| `tests/b043-json-export.test.js` | 0 (optional) | Comment-only update; skippable |

**Total existing-test deltas:** 4 mandatory assertion-array extensions
(one line each) + 4 docstring touches + 1 test-infrastructure addition
(~20 LOC).

### §69.9.3 — Net test-suite delta (As-Built)

- **12** new cases (T1-T12) in `tests/b164-sleep-claim-remap.test.js` (~410 LOC). R2 planned 10; R4 fix-round added T11 + T12 for M-2 race coverage; T3 rewritten in place for M-1 structural dedup proof.
- 4 one-line assertion updates + 4 docstring touches in existing files (R2-plan delta — shipped unchanged in R3).
- chrome-mock infrastructure additions: original R3 `tabs.onReplaced` + `chrome.idle.*` event mocks (~20 LOC) **plus** R4 As-Built `sessionSetCounts` per-key counter + `__getSessionSetCount(key)` helper (~5 LOC).
- **Total:** ~+435 LOC added across the test suite over R2 plan baseline.
- **Final suite count: 2050/2050 PASS** (R3 commit `e2f3944` produced 2048; R4 fix-round `c30e18c` added T11 + T12 to reach 2050; R5 audit `f3914af` confirmed 100% AC coverage with no further test additions needed).

---

## §69.10 — UAT plan (high-level)

The original B-164 probe script (`docs/findings/sprint-45.md` § "Probe
Script (for product-owner)") is **also the UAT smoke test** — Test A
manually discards a tab via `tjProbeDiscard(<tabId>)` and observes the
`claimsMirror` remap by clicking the discarded tab in the strip and
verifying that bookmark UI continues to show the tab as claimed; Test
B closes the laptop lid for 30+ seconds and reopens, verifying that no
bookmark appears falsely offline post-wake.

R5 [test-engineer] extends with additional UAT cases that exercise (c)
visibly:

1. **Manual discard remap (AC1)**: in SW console, call
   `chrome.tabs.discard(<tabId>)` on a claimed bookmark's tab. Verify in
   the sidepanel that the bookmark row continues to render as live
   (green border) WITHOUT a duplicate row appearing in the Open Tabs
   section. (Pre-fix: bookmark goes offline and the new tabId appears
   as an unclaimed Open Tab.) Verify in SW console: `chrome.storage.session.get('tj:tabClaims')`
   shows the new tabId.
2. **On-wake reconcile (AC2 — laptop lid close)**: close the laptop lid
   for 60+ seconds; reopen. Within ~30 seconds of wake, observe the
   sidepanel — bookmarks that were live pre-sleep continue to render
   as live post-wake. SW console should show
   `[tab-junkie]` log entries from the wake handler if any reconcile
   activity was needed.
3. **On-wake reconcile (AC2 — display lock)**: lock the screen (Win+L /
   Ctrl+Cmd+Q); wait 60s; unlock. Same observable as case 2 — no
   bookmark falsely offline.
4. **Floating tab survives discard (AC4)**: build an opener-chain
   floating group (sidepanel → click bookmark → from that tab Ctrl+click
   a link → new tab inherited into the parent's floating group). Discard
   the inherited tab via SW console. Verify the floating row stays
   visible in the sidepanel.
5. **No bookmark accumulation (B-164 user story)**: leave Edge open
   with 5+ claimed bookmarks active. Lid-close for 5+ minutes. Reopen.
   Verify Open Tabs section has NOT accumulated duplicate entries for
   the claimed bookmarks. (Pre-fix: each claim could surface a stale
   duplicate per discard event.)
6. **Permission grant flow (AC7)**: install v1.40.0 fresh (or update from
   v1.39.0). Verify `edge://extensions` → Tab Junkie card → "Permissions"
   shows "Detect when the user goes idle". Toggle the extension OFF then
   ON. Verify the permission persists; verify the SW console has no
   `chrome.idle UNAVAILABLE` errors on the next wake cycle.

UAT lean-mode smoke: case 2 with `prefersLean` ON; verify wake handler
still fires and reconciles. The wake handler is preference-independent.

**As-Built UAT script** (R5 [test-engineer] persisted 2026-05-22, commit `f3914af`): the step-by-step UAT script lives in `docs/findings/sprint-45.md` under the "R5 — B-164 UAT script (ready for product-owner execution)" section. 4 cases covering UI-observable behavior + 1 SW-console step (`chrome.tabs.discard(<id>)` is the unavoidable trigger for the `chrome.tabs.onReplaced` event class — no UI-only path exists):

- **UAT-1** — `chrome.tabs.discard` happy path via SW console (AC1 + AC3 + AC4 + AC5).
- **UAT-2** — laptop lid-close + reopen cycle smoke (AC2).
- **UAT-3** — multi-day Open-Tabs-doesn't-grow smoke (the original B-164 user-story symptom verification).
- **UAT-4** — `chrome.idle.onStateChanged` manual trigger (optional, technical; covered structurally by T2/T3 automation).

**Status:** UAT PASS pending product-owner execution. The script was authored Opus-grade by R5 [test-engineer] with a 5-10 minute runtime budget (UAT-3 is multi-day passive observation).

---

## §69.11 — Future work / known limitations

- **No `reassociateFloatingGroups` rerun on wake.** The wake handler
  only reruns `reconcileClaims`, not `reassociateFloatingGroups`. The
  conscious trade-off (per §69.3.2): floating-group `liveTabId` staleness
  from a within-sleep `onReplaced` (lost while SW asleep) is repaired
  on the NEXT full cold-start rather than on wake. If user-visible
  symptoms persist (floating rows incorrectly missing after a sleep
  cycle that included a discard), the wake handler can be extended to
  invoke `reassociateFloatingGroups` after `reconcileClaims`. Single
  line addition; bounded test extension. Filed as a future-work hook.
- **`chrome.runtime.onConnect` keep-alive alternative (Q3 from R0).**
  If `"idle"` permission is ever rejected or causes UX friction (e.g.,
  Chromium relabels it as a "scary" permission in a future taxonomy
  change), the fallback is a sidepanel ↔ SW persistent port that
  extends SW lifetime past the 30s idle threshold while the sidepanel
  is open. Does not cover the lid-close-with-sidepanel-closed scenario.
  Filed as a future-work fallback only.
- **B-149 chapter back-fill (Q7 from R0).** B-149 has no
  `docs/design/NN-*.md` chapter today; both §69 and §70 cite it via
  `docs/BACKLOG.md:184` + `CHANGELOG.md:142`. A 1-hour back-fill task
  would let both chapters cite `§NN B-149` verbatim, closing the
  documentation gap. Filed as a low-priority docs hygiene item.
- **C-14 generation-counter (Q6 from R0) — resolved as N/A.** If a
  future iteration introduces concurrent readers of `claimsMirror`
  (e.g., a sidepanel hot-path that reads the mirror without going
  through `MSG_LIST_ITEMS`), the B-148 §63.8.2 content-conditional
  setter pattern can be applied to `remapTabIdInClaims`. No action
  needed today.
- **`chrome.tabs.onReplaced` payload semantics in future Chromium
  versions.** The empirical Test A confirmation is locked to the
  modern Edge/Chromium build the probe ran on (2026-05-21). If a
  future Chromium release changes `onReplaced` semantics (e.g., fires
  on prerendering ONLY, not on discard), the within-session fix (a)
  would degrade gracefully — the listener registers but receives no
  events; on-wake fix (c) becomes the sole remedy, which is robust
  against both Test B interpretations. The probe should be re-run on
  major Chromium version bumps as a regression check.
- **`chrome.idle` `'locked'` state — no current consumer.** The R2
  design listens only for `'active'`. The `'locked'` and `'idle'`
  states are explicit no-ops. Future work could leverage `'locked'`
  for proactive state-persistence (e.g., flush in-flight broadcasts
  before screen-off) but no user-visible need exists today.
- **R5 P3 follow-ups deferred to backlog (sprint close 2026-05-22).** Three R4 LOW findings declined cheap-fix in-sprint and were filed as P3 candidates:
  - **LOW-1 — `chrome.idle.setDetectionInterval` reject-path test.** The chrome-mock helper `__setIdleSetDetectionIntervalReject` was built specifically for this branch but currently unused. The production `try/catch` at `idle-reconciler.js:139-145` is correct and B-132-pattern-aligned; an explicit test would harden the regression-guard. ~15 LOC. Filed P3.
  - **LOW-2 — `'idle'` / `'locked'` state no-op test.** Production code at `idle-reconciler.js:151` is correct (`if (state !== 'active') return;`); C-7 allow-list semantics structurally verified by inspection but not by an explicit assertion. ~10 LOC. Filed P3.
  - **LOW-5 — `openerMap` remap on `onReplaced`.** `background/tabs/opener-chain.js:12` is not remapped on `onReplaced`. Spec-aligned (R2 §69.5.1 marked `live-tab-index.js` and opener-chain explicitly unchanged). Narrow impact: only a new tab opened FROM a restored tab WITHIN the same SW lifetime would miss the opener-chain. Ephemeral state self-corrects on SW restart. Filed P3; promote to active work only if opener-chain correctness post-discard ever surfaces in UAT.

---

## §69.12 — Files to be touched (R3 summary, for the handoff)

**Source code (modified):**

- `manifest.json` — line 6: append `"idle"` to `permissions[]`.
- `background/tabs/tab-events.js` — register `chrome.tabs.onReplaced`
  listener with the 5-table remap; ~25 LOC.
- `background/tabs/tab-claims.js` — export new
  `remapTabIdInClaims(removedTabId, addedTabId)` helper; ~15 LOC + JSDoc.
- `background/tabs/floating-groups.js` — export new
  `remapFloatingGroupsLiveTabId(removedTabId, addedTabId)` helper
  mirroring `pruneFloatingGroupsByLiveTabId`; ~40 LOC + JSDoc.
- `background/tabs/index.js` — barrel re-export of `registerIdleReconciler`.
- `background/service-worker.js` — synchronous `registerIdleReconciler(readyPromise)`
  invocation.

**Source code (new):**

- `background/tabs/idle-reconciler.js` — ~50 LOC including JSDoc and
  module header; registers `chrome.idle.setDetectionInterval(60)` +
  `chrome.idle.onStateChanged` listener with the flag-semantic
  duplicate-reconcile guard.

**Source code (unchanged):** `background/tabs/drift.js`,
`background/tabs/live-tab-index.js`, `background/storage/migration.js`,
`background/storage/shapes.js`, `background/messages/storage-handlers.js`,
`shared/url.js`, `shared/messages.js`, `sidepanel/sidepanel.js`,
`newtab/newtab.js`, `popup/popup.js`.

**Tests (new):**

- `tests/b164-sleep-claim-remap.test.js` — 12 cases per §69.9.1 (R2 planned 10; R4 added T11 + T12 for M-2; T3 rewritten in place for M-1).

**Tests (modified — assertion + docstring):**

- `tests/b036-newtab.test.js:102-113` — append `'idle'` to permission baseline + docstring.
- `tests/b037-themes.test.js:567-577` — same.
- `tests/b093-import-export-rehome.test.js:528-544` — same (sorted form).
- `tests/b097-settings-shortcut.test.js:69-80` — same.

**Tests (infrastructure):**

- `tests/chrome-mock.js` — R3 added `tabs.onReplaced` + `chrome.idle` surface mocks + `__resetMock` cleanup additions; R4 fix-round added `sessionSetCounts` per-key counter + `__getSessionSetCount(key)` helper for the M-1 dedup structural assertion.

**Tests (optional comment-only):**

- `tests/b043-json-export.test.js:21` — comment touch; skippable.

**Docs:**

- This chapter (`docs/design/69-b-164-sleep-claim-remap.md`) — R2 plan written BEFORE R3 per S44 retro action item 1; R6 As-Built reconciliation applied 2026-05-22 (header status flip; §69.3.2.1 race-guard architecture; §69.5.1.1 fix-round deltas; §69.5.4 coordination-mechanism correction; §69.9 test-count update; §69.10 UAT script reference; §69.11 P3 follow-ups; §69.13 audit trail).
- `docs/SOLUTION_DESIGN.md` — TOC entry added at line 90 (above §70); R6 As-Built reconciliation flipped descriptor from "R2 Plan" → "R6 As-Built".
- (R6) `CHANGELOG.md`, `docs/RELEASES.md` — entries added at sprint close including the C-1a-class toggle-OFF-ON install-time note for the `"idle"` permission grant.
- (R5) UAT cases per §69.10 — persisted in `docs/findings/sprint-45.md` § "R5 — B-164 UAT script" (4 cases, commit `f3914af`).

---

## §69.13 — R6 As-Built audit trail

### §69.13.1 — Pipeline trace

| Round | Commit | Date | Outcome |
|-------|--------|------|---------|
| R0 spike | (findings only) | 2026-05-21 | Joint B-164 + B-163 R0 spike output, probe Test A confirmed `chrome.tabs.onReplaced` fires on discard with `addedTabId !== removedTabId`. R0 LOCKED (a) + (c). |
| R1 LOCKED | (findings only) | 2026-05-21 | 8 ACs locked post-probe. |
| R2 LOCKED | (chapter authored) | 2026-05-21 | This chapter `docs/design/69-b-164-sleep-claim-remap.md` written BEFORE R3 per S44 retro AI-1. |
| R3 build | `e2f3944` | 2026-05-22 | R2 plan shipped as written: `idle-reconciler.js` new (R2-shape, no race-guard); `tab-events.js` `onReplaced` listener registered; `tab-claims.js` `remapTabIdInClaims` helper; `floating-groups.js` `remapFloatingGroupsLiveTabId` helper; `"idle"` permission added; 4 manifest pin tests updated; chrome-mock extended; `tests/b164-sleep-claim-remap.test.js` T1-T10 added. |
| R4 review | (parallel) | 2026-05-22 | code + security + qa reviewed in parallel. Findings: **0 CRITICAL / 0 HIGH / 2 MEDIUM / 5 LOW**. security-reviewer CLEAN across all 8 focus areas. Per CLAUDE.md, only CRIT/HIGH block R5; product-owner authorized M-1 + M-2 fix-round in-sprint. |
| R4 fix-round | `c30e18c` | 2026-05-22 | M-1 (T3 dedup structural counter via `sessionSetCounts` + `__getSessionSetCount` helper) + M-2 Option B (`_reconcileActive` flag + `_pendingReplacements` queue + `_drainCallback` + `_applyTabReplacement` extraction). T11 + T12 added. Suite 2048 → 2050 PASS. |
| R5 audit | `f3914af` | 2026-05-22 | [test-engineer] Opus audit confirmed 100% AC coverage across T1-T12; no further automated tests needed. UAT script (4 cases) persisted in `docs/findings/sprint-45.md`. UAT PASS pending product-owner execution. |
| R6 close | (this chapter) | 2026-05-22 | As-Built reconciliation applied. |

### §69.13.2 — R4 findings summary

| Severity | Count | Disposition |
|----------|-------|-------------|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 2 | Both fixed in `c30e18c`. M-1 = structural dedup test gap (T3 final-state-only assertion); M-2 = async-gap race between wake-`reconcileClaims` and inline `onReplaced` remap. |
| LOW | 5 | LOW-3 (T3 misleading comment) + LOW-4 (`tab-events.js:395-398` misleading comment) — **incidentally resolved** by the M-1 / M-2 comment rewrites. LOW-1 (`setDetectionInterval` reject-path test) + LOW-2 (`'idle'`/`'locked'` no-op test) + LOW-5 (`openerMap` exclusion) — **deferred to P3 backlog** at sprint close per §69.11. |

[security-reviewer] verdict: **CLEAN** across all 8 focus areas:
1. C-6 permission minimization (`"idle"` properly justified).
2. CSP unchanged.
3. Input validation present (`typeof addedTabId === 'number'` etc.).
4. Atomicity verified via `writeTransaction` `txQueue` serialization.
5. `_reconcileInFlight` race-safe (per the original R2 reasoning, which holds for the listener-entry dedup case).
6. No PII in console output.
7. No schema bump (governance correctly N/A per C-1b; permission-level toggle-OFF-ON note correctly documented per C-1a-class governance).
8. Service-worker cold-start safe (synchronous module-scope registration).

### §69.13.3 — Behaviors shipped that the R2 chapter did not anticipate

**Primary As-Built finding: the M-2 race-guard architecture itself.** The R2 §69.5.4 narrative claimed "SW event-loop serialization" provided coordination safety. This was correct for the inline-apply path (no wake-reconcile in flight) but **incorrect** for the wake-reconcile-in-flight path: JS event-loop serialization only covers synchronous blocks, not async-await gaps. `reconcileClaims` captures `storedClaims` synchronously at `tab-claims.js:141`, then awaits Phase 3/4 storage reads; during those awaits an `onReplaced` event could persist a remap, then be silently overwritten by the pre-remap snapshot when `reconcileClaims` resumes and calls `writeClaims` at `:309-310`.

R4 qa MED-2 caught the gap. The fix-round closed it with Option B: `_reconcileActive` flag (set synchronously before the first await; cleared in `finally` AFTER the drain), `_pendingReplacements` FIFO queue, `_drainCallback` callback injection (avoids circular import), `_applyTabReplacement` extraction so the same code path serves both the inline-apply and queued-drain branches. See §69.3.2.1 for the full architecture; §69.5.4 for the corrected coordination-mechanism narrative.

**No other As-Built deltas of consequence.** The R2 plan for the inline `onReplaced` remap, the `chrome.idle` listener registration, the `"idle"` permission, the 4 test pin updates, and the new helper exports all shipped as written.

### §69.13.4 — Lessons for future R2 chapters

This is the second sprint in a row where an R2 "single-thread SW event-loop serialization" reasoning held up for the synchronous path but missed an async-gap race. (The first was Sprint 40 B-134 H-1 over-trip class, fixed via content-conditional setter guards per the C-14 generation-counter content-predicate rule.) The pattern is: an R2 author reasons correctly about the synchronous control flow but does not enumerate the await-suspension points where the synchronous reasoning breaks down. **R2 reviewers should grep for `await` in any function cited as serialized and explicitly enumerate the suspension boundaries before sign-off.** Filed as a candidate R2 Correctness Checklist addendum for the next S46 retrospective (no chapter rule change applied today — single instance of this exact framing).
