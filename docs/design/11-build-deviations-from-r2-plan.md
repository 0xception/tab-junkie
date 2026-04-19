## 11. Build Deviations from R2 Plan

Per CLAUDE.md R6, every deviation between `docs/design/B-001a.md` and the
shipped code is captured here.

### C-level (CRITICAL fixes, from R4)

- **C1 — `initializePartitions` routes through `writeTransaction`.**
  R2 §8 said "all single-partition writes in `items.js`/`groups.js`/
  `preferences.js` internally route through `writeTransaction`" but did
  **not** mention init. R3 originally used a bare `chrome.storage.local.set`
  there. R4 code-reviewer caught that as an AC6 violation. Now init builds
  an array of read-only mutator ops and passes them through the
  transaction; quota errors surface as `ERR_QUOTA_EXCEEDED` through the
  normal tx layer (which also subsumed H7).

- **C2 — FK validation for `groupId` is a cross-partition read inside
  `writeTransaction`.** R2 §4 did not specify that `createItem`/`updateItem`
  must verify that a non-null `groupId` points at an existing group. R4
  qa-reviewer caught the silent-corruption risk. The fix adds a `PARTITION_GROUPS`
  read-only mutator op immediately before the `PARTITION_ITEMS` mutator op;
  the groups snapshot is captured in a closure and consumed by
  `assertGroupExists()` inside the items mutator. Both ops execute inside
  the same single get → mutate → set cycle, so the check and the mutation
  observe the same serialized state.

### H-level (HIGH fixes)

- **H2 — URL scheme allowlist.** R2 said "canonical saved URL"; not
  scheme-gated. Now parsed with `new URL` and restricted to `http:`, `https:`,
  `ftp:`, `mailto:`.
- **H1 — Field length caps.** `MAX_TITLE=2048`, `MAX_URL=4096`, `MAX_NAME=256`,
  `MAX_COLOR=32`, exported from `partitions.js`. Not in R2.
- **H3 — `newTabOverride` default flipped to `false`.** R2 had it `true`
  (and so did R3's first draft); contradicted B-039 AC. Fixed.
- **H4 — `MSG_GET_GROUP` added to the message registry.** R2 §4 exposed
  `getGroup(id)` as a public API but R2 §5 omitted the message. Now present
  in `shared/messages.js` and wired through `storage-handlers.js`.
- **H5 — Test hatch `chrome.__tabJunkieTestMock` sentinel.** R2's
  `assertServiceWorkerContext` left no escape for the Node/jsdom test
  environment. The sentinel + `isTestEnvironment()` short-circuit were not
  in R2; they are now a documented, inert-in-production hatch.
- **H6 — `deleteItem` / `deleteGroup` idempotent silent no-op** (ruling #3).
  R2 §7 implied `ERR_NOT_FOUND`; the shipped contract is `void` with no
  mutation. Matches `getItem()→null` semantics.
- **H7 — Quota-error classification on init path.** Superseded by C1; the
  init write now shares `writeTransaction`'s `isQuotaError` handling.

### Rulings (design decisions made during R4)

- **Ruling #1 — `updateGroup` blocks nesting a group that already has
  children.** Stricter than R2 §4 but correct under the locked depth-1
  invariant (R0 decision #4). Kept.
- **Ruling #2 — `createItem.sortOrder` defaults to `0`.** R2 left it
  unspecified; R3's first cut used `Date.now()` (non-deterministic, broke
  perf test determinism). Now `0`. Explicit `sortOrder` will arrive with
  drag-reorder (B-030).
- **Ruling #4 — `createGroup` / `updateGroup` with unknown `parentId` →
  `ERR_NOT_FOUND`** (reclassified from `ERR_VALIDATION`). Taxonomy hygiene
  — every missing-id situation uses `ERR_NOT_FOUND` consistently.
- **Ruling #5 — `ERR_ID_COLLISION` kept as a reserved unreachable code.**
  Documented inline in `errors.js`.

### M-level tightenings (also landed before R5)

- **M2** — `updatedAt` removed from the `allowed` patch list in both
  `items.js` and `groups.js`; always recomputed by the mutator.
- **M3** — `writeTransaction` is no longer re-exported from
  `background/storage/index.js`. It is a storage-internal concern.
- **M5** — Whitespace-only titles/names rejected (`title.trim().length === 0`).
- **M7** — `StorageError` messages no longer interpolate raw user input;
  offending identifiers go into the structured `cause` metadata to avoid
  log-injection footguns.
- **M8** — `deleteGroup` captures `Date.now()` once and reuses it across
  both mutators so cascaded `updatedAt` stamps are consistent.

### Deferred (tracked as debt)

- **M1** — ESLint denylist → allowlist refactor (deferred to B-053).
- **M6** — `isQuotaError` string-match hardening (secondary `bytesInUse`
  signal) deferred — low risk under current Chrome wording.
- **M9** — Documented the `sender.id` sufficiency invariant (no
  `externally_connectable`). See §6.

### B-006 / B-016 / B-017 Deviations and Rulings (Sprint 4)

- **S4-D1 — `shared/constants.js` introduced for GROUP_COLORS.** Not in any prior design doc. Required to share the palette between `groups.js` (enforcement) and future UI components without crossing the write-boundary denylist.

- **S4-D2 — Duplicate-name check is non-blocking (warning only).** Earlier drafts considered rejecting duplicate names outright. Ruled non-blocking: groups are identified by ULID, not name; duplicate names are user intent (e.g., "Work" under different parent groups). Warning field keeps the caller informed without breaking the flow.

- **S4-D3 — `file:` scheme is specifically blocked for MSG_PROMOTE_TAB.** The general URL allowlist permits `file:` for stored items (§8). However, promoting a `file:` tab is blocked because file URLs are local to the machine and are not meaningful to share or restore across devices. This is stricter than the stored-item allowlist and is enforced only in the promote handler.

- **S4-D4 — MSG_DEMOTE_ITEM partial atomicity accepted as documented limitation.** Multi-partition atomicity would require restructuring the demote operation into a single `writeTransaction` op array. The current split is intentional for code clarity; the orphan-record failure modes are all inert and self-healing. Tracked in §10.9.

### Unanticipated additions (not in R2 at all)

- **Placeholder HTML stubs** in `newtab/` and `popup/` (sidepanel stub replaced by full implementation in B-054).
  Chrome's manifest validator resolves `chrome_url_overrides.newtab` and
  `action.default_popup` at extension load time — loading the unpacked
  extension for UAT failed until the stubs existed. Remaining stubs will
  be overwritten by B-035 / B-036.
- **`jsconfig.json`** — added to suppress TypeScript-checker false-positive
  warnings arising from a circular import (`partitions.js` imports
  `writeTransaction` for the init path, and `write-transaction.js` imports
  `partitionKey`/`defaultShape`/`assertShape` from `partitions.js`). The
  circular is benign at runtime (both are ESM modules with lazy resolution),
  but the checker complained. **B-053** will extract the shared primitives
  into a separate module and drop the shim.

---

### B-001b Deviations and Rulings

#### R4 fixes landed during B-001b build

- **F2 — Static migration chain assertion.** The R2 design doc implied the runner would detect a broken step registry at runtime during migration execution. Shipped code validates the chain at module load time (static assertion in `migration.js` module scope) so a misconfigured registry fails immediately and loudly on SW cold start rather than during a user-triggered migration path.

- **F3 — Multi-partition atomicity scaffold documented, not implemented.** The R2 design spec called for "atomic multi-partition migration steps". The shipped runner wraps steps in a `writeTransaction` that currently covers only `PARTITION_META`. This is correct for v1 (no steps exist yet). The limitation is documented inline (see §10.6). Multi-partition step support must be added before any step that mutates data partitions.

- **F5 — Legacy import URL validation mirrors createItem.** R2 AC7 said "copy recoverable data or discard if shape is unrecognisable." Shipped code applies the same URL scheme-allowlist + length check used by `createItem` to each legacy bookmark before import. Invalid URLs are silently discarded. This is stricter than R2's unspecified "shape check" but correct per the storage boundary's XSS prophylaxis invariant (§8).

- **F6 — Deep-clone before passing snapshot to step.migrate().** Not specified in R2. Added as a defensive measure against prototype pollution from a malformed migration step modifying the live snapshot object while the runner is iterating.

#### B-001b Rulings

- **Ruling B1b-1 — `MSG_GET_STATUS` bypasses `readyPromise` gate.** The R2 plan did not specify the ordering between the gate and the status query. Ruled: `MSG_GET_STATUS` is handled before the gate so callers can observe migration progress/failure without being blocked by `ERR_NOT_READY`. Consistent with the purpose of the status endpoint.

- **Ruling B1b-2 — `evaluateQuota` falls back to `getBytesInUse` on first cold start.** `_peekQuotaSample()` returns null on first cold start because no write has run yet. Rather than skipping the quota check entirely, the runner does a one-time direct `chrome.storage.local.getBytesInUse(null)` call. This is best-effort; failure leaves `quotaBytesInUse` at 0 (no warning).

- **Ruling B1b-3 — `migrateLegacyKeys` uses known-key allowlist, not wildcard.** R2 said "remove all `junkie_*` keys". Shipped code only fetches and removes the four specific known keys (`KNOWN_LEGACY_KEYS`). This avoids unintended removal of user data stored under unexpected `junkie_*` keys by a third-party or future code.

---

### B-001d Deviations and Rulings

#### Fixes and deviations landed during B-001d build

- **D1 — `shared/errors.js` as canonical error home.** R2 placed `StorageError` + `ERR_*` constants in `background/storage/errors.js`. B-001d moved the canonical definition to `shared/errors.js` so `drift.js` and `url.js` (both under `shared/` or `background/tabs/`) can import error types without crossing the write-boundary denylist. `background/storage/errors.js` now re-exports everything from `shared/errors.js`; no call sites were changed.

- **D2 — `shared/url.js` replaces local `normalizeForMatch`.** The inline `normalizeForMatch` helper in `tab-claims.js` was promoted to `shared/url.js` as `normalizeUrl(url, mode)`. The `forStorage` mode is new (adds protocol defaulting; used by drift writes). The `forMatch` mode is functionally equivalent to the old helper. `tab-claims.js` now imports from `shared/url.js`.

- **D3 — `index` field added to `LiveTabIndex` entry shape.** Not in the original B-001c spec. Required by B-002's position-match strategy. Added to `updateTabEntry` and `buildLiveTabIndex` in B-001d rather than waiting for B-002, so both land atomically.

- **D4 — Drift write is best-effort (no throw on scheme/length violation).** R2's drift spec did not specify the failure mode for invalid URLs. Ruled: drift is a non-critical annotation; scheme or length violations log a warning and silently skip the write rather than throwing `ERR_VALIDATION` (which would surface to the caller as a UI error for a background event they did not initiate).

#### B-001d Rulings

- **Ruling B1d-1 — Fragment stripped before storage, not before comparison.** Fragment stripping happens in `normalizeUrl` forStorage mode, which runs before the drift record is written. The item's stored URL is also fragment-free (enforced by the `createItem` path). Comparison therefore uses fragment-free URLs on both sides consistently.

- **Ruling B1d-2 — Unclaimed-tab URL changes are no-ops in drift.js.** R2 did not specify this edge case. If a tab changes URL but holds no claim, there is no item to associate drift to, so `drift.js` exits immediately without reading `tj:drift`. This avoids a spurious storage read on every unclaimed tab navigation.

---

### B-002 Deviations and Rulings

#### Fixes and deviations landed during B-002 build

- **B2-D1 — No TTL on unresolved FloatingGroup records.** R2 implied a cleanup pass on window close. Shipped code retains unresolved records indefinitely. Cleanup on `MSG_DELETE_GROUP` or a periodic alarm is tracked as tech debt (see §10.8).

- **B2-D2 — `claimTabForItem` added to `tab-claims.js` rather than inline in `floating-groups.js`.** Keeping the write path in `tab-claims.js` ensures the single-mirror invariant is not duplicated. `floating-groups.js` is a pure orchestrator that calls into `tab-claims.js` for all claim mutations.

#### B-002 Rulings

- **Ruling B2-1 — First-in-array-wins for tie-break.** R2 did not specify tie-break order when multiple floating groups match the same tab. Ruled: the record appearing first in the `tj:floatingGroups` array wins. This is deterministic, cheap (no scoring), and consistent with the existing `reconcileClaims` first-unclaimed-wins approach.

- **Ruling B2-2 — Position-match requires both `windowId` and `tabIndex` match.** URL match alone is insufficient for position-match because the same URL may be open in multiple windows. The position-match phase requires an exact (`windowId`, `tabIndex`) pair; URL is then verified as a confirmation. If position matches but URL diverged, the record falls through to URL-fallback.

---

### B-001c Deviations and Rulings

#### R4 fixes landed during B-001c build

- **H1 — `onUpdated` guard: only reevaluate on non-empty URL string.** R2 did not specify the filter. Chrome fires `onUpdated` with `changeInfo.url` set to empty string in some loading states. Shipped code checks `typeof changeInfo.url === 'string' && changeInfo.url !== ''` before scheduling a reevaluate debounce.

- **H2 — Per-tab 100ms debounce on `reevaluateTab`.** R2 implied immediate reevaluation on each `onUpdated` URL change. Rapid redirects (HTTP → HTTPS, SPA client-side routing) can fire multiple `onUpdated` events in quick succession. The debounce collapses these into a single evaluation, reducing spurious claim churn.

- **H3 — `isClaimsReady()` guard in `buildLiveStates`.** R2 did not specify behavior when `buildLiveStates` is called before `reconcileClaims` has completed. Shipped code returns explicit `{ live: false, active: false, audible: false }` defaults for all items when `claimsReady === false`, rather than returning stale or partial state.

- **M2 — `buildLiveTabIndex` and `readyPromise.then(listItems)` run concurrently in `initializeLiveState`.** R2 implied sequential init (index first, then claims). Shipped code uses `Promise.all` to overlap the `tabs.query` call with the storage migration so cold-start latency is minimized.

- **M3 — Explicit `hostname.toLowerCase()` in `normalizeForMatch`.** The `URL` constructor normalizes hostnames to lowercase per spec, but the explicit assignment was added defensively in case a non-standard environment or future spec change affects this.

- **M4 — `windows.onRemoved` early return when claims not yet ready.** R2 did not specify this guard. If `onRemoved` fires before `reconcileClaims` completes (edge case on very fast window close during startup), the handler short-circuits — `reconcileClaims` will handle all cleanup when it runs.

- **M5 — Warning when `reconcileClaims` is called with 0 items but stored claims exist.** Defensive log added to catch misconfigured call sites. Does not block or alter behavior.

#### B-001c Rulings

- **Ruling B1c-1 — `windowId` captured in LiveTabIndex entry.** R0 design spec shape was `Map<tabId, {url, active, audible}>`. Shipped shape is `Map<tabId, {url, windowId, active, audible}>`. `windowId` is required for `windows.onRemoved` batch cleanup and for `onActivated` deactivation of the previous tab in the same window. Backward-compatible addition.

- **Ruling B1c-2 — `buildLiveTabIndex` + `listItems` run concurrently rather than sequentially.** Correct because `buildLiveTabIndex` reads from `chrome.tabs` (independent of storage) and `readyPromise.then(listItems)` reads from storage. The two can safely overlap.

- **Ruling B1c-3 — `chrome.storage.local.remove` is the allowed exception for legacy keys; `chrome.storage.session.set` is the allowed exception for TabClaims.** The single-writer invariant (`writeTransaction` is the sole path to `chrome.storage.local.set`) is not violated by either: legacy key removal operates on foreign `junkie_*` keys (not `tj:*` partitions), and TabClaims live in `storage.session`, a separate storage area not governed by the `writeTransaction` serializer.

---

