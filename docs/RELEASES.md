# Tab Junkie — Release Notes

Local reference copy. Source of truth: GitHub Releases.

---

## v1.0.0 — Foundation Storage Layer (2026-04-15)

### What's new
- Partitioned storage schema: six isolated keys (`tj:meta`, `tj:items`, `tj:groups`, `tj:prefs`, `tj:drift`, `tj:floatingGroups`) under `chrome.storage.local`
- Full item and group CRUD with validation and strict group-depth enforcement (max depth 1)
- ULID-based IDs: sortable, stable, collision-free, never derived from URL or title
- Atomic writes via `writeTransaction()`: multi-step ops commit in a single `storage.local.set`, safe against mid-write service worker termination
- Service worker as sole writer: all UI surfaces send messages; the SW serializes all writes
- Message contract in `shared/messages.js` for UI-to-SW communication (12 message types)
- Placeholder UI stubs for sidepanel, newtab, and popup (extension loads cleanly)

### Internal
- Storage module: `background/storage/` (~910 LoC, 8 modules)
- Message handler: `background/messages/storage-handlers.js` (~145 LoC)
- ESLint `no-restricted-imports` enforcing write-boundary at lint time
- Test suite: 34 automated tests, all passing (node:test runner, zero deps)
- UAT: PASS (2026-04-15)

### Known limitations
- No UI: sidepanel, newtab, and popup are empty stubs
- No schema migration runner or downgrade safe-mode (B-001b)
- No live tab tracking or tab-claims disambiguation (B-001c)
- No drift tracking or floating-tab re-association (B-001d)

### Test results
- Automated: 34/34 passing
- UAT: PASS
