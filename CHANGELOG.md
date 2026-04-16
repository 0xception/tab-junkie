# Changelog

All notable changes to Tab Junkie are documented in this file.

## [1.0.0] — 2026-04-15

### Added
- Partitioned `chrome.storage.local` schema with six isolated keys
- Item CRUD: create, read, update, delete with URL scheme validation and length caps
- Group CRUD: create, read, update, delete with max-depth-1 enforcement
- Preferences CRUD with default merging
- ULID-based identity: sortable, stable, collision-free
- `writeTransaction()` atomic batcher: serialized, all-or-nothing writes
- Service-worker-as-sole-writer architecture with message-passing boundary
- 12 typed message constants in `shared/messages.js`
- ESLint `no-restricted-imports` rule enforcing write boundary
- 34 automated tests (node:test, zero runtime deps)
- Placeholder HTML stubs for sidepanel, newtab, popup
