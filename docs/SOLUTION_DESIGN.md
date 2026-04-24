# Tab Junkie — Solution Design

**Version:** 2.5
**Date:** 2026-04-16
**Owner:** [solution-architect]
**Status:** Active — B-001d + B-002 + B-006 + B-016 + B-017 + B-050 + B-019 + B-020 + B-003 + B-010 + B-008 + B-021 + B-011 + B-012 + B-015 + B-053 + B-013 + B-005 + B-054 landed.

> This document is the current source of truth for what has actually shipped.
> For the R2 *plan* (pre-build design) see `docs/design/B-001a.md`; deviations
> between that plan and the build are captured in §11 below.

---

> This file is now a chapter index. Each chapter lives in its own file under `docs/design/`.

- [§1 — Project Structure](design/01-project-structure.md)
- [§2 — Storage Schema](design/02-storage-schema.md)
- [§3 — ID Strategy](design/03-id-strategy.md)
- [§4 — Write Boundary](design/04-write-boundary.md)
- [§5 — Message Contract](design/05-message-contract.md)
- [§6 — Write-Boundary Enforcement](design/06-write-boundary-enforcement.md)
- [§7 — Error Taxonomy](design/07-error-taxonomy.md)
- [§8 — Field Validation](design/08-field-validation.md)
- [§9 — Performance Standards](design/09-performance-standards.md)
- [§10 — What B-001a Did NOT Ship (updated through B-001d + B-002 + B-006 + B-016 + B-017 + B-050 + B-019 + B-020 + B-021 + B-011 + B-012 + B-015 + B-053 + B-013 + B-005 + B-054 + B-018)](design/10-what-b-001a-did-not-ship.md)
- [§10.5 — LiveTabIndex & TabClaims Architecture (B-001c)](design/10.5-livetabindex-tabclaims-architecture.md)
- [§10.6 — Migration Runner Architecture (B-001b)](design/10.6-migration-runner-architecture.md)
- [§10.7 — Drift Detection Architecture (B-001d)](design/10.7-drift-detection-architecture.md)
- [§10.8 — Floating-Group Re-association Architecture (B-002)](design/10.8-floating-group-re-association-architectu.md)
- [§10.9 — Sprint 4 Additions — B-006 + B-016 + B-017](design/10.9-sprint-4-additions-b-006-b-016-b-017.md)
- [§10.10 — Broadcast Architecture (B-050)](design/10.10-broadcast-architecture.md)
- [§11 — Build Deviations from R2 Plan](design/11-build-deviations-from-r2-plan.md)
- [§12 — Rollback Plan](design/12-rollback-plan.md)
- [§13 — Incident Log](design/13-incident-log.md)
- [§14 — Runbooks](design/14-runbooks.md)
- [§15 — B-003 — Bookmark CRUD Dialog Architecture](design/15-b-003-bookmark-crud-dialog-architecture.md)
- [§16 — B-010 — Live Tab Reflection & Active-Tab Highlight (R2 Design)](design/16-b-010-live-tab-reflection-active-tab-hig.md)
- [§17 — B-010 — Live Tab Reflection & Active-Tab Highlight (R6 Close — What Shipped)](design/17-b-010-live-tab-reflection-active-tab-hig.md)
- [§18 — B-008 — Group Reorder & Collapse/Expand Persistence (R6 Close)](design/18-b-008-group-reorder-collapseexpand-persi.md)
- [§19 — B-021 — Inline Side-Panel Filter with Debounce & Highlight (R6 Close)](design/19-b-021-inline-side-panel-filter-with-debo.md)
- [§20 — B-053 — Break Circular Dependency partitions.js / write-transaction.js (R6 Close)](design/20-b-053-break-circular-dependency-partitio.md)
- [§21 — B-013 — Opener-Chain Group Inheritance (R6 Close)](design/21-b-013-opener-chain-group-inheritance.md)
- [§22 — B-005 — Bulk-Create Saved Items (R6 Close)](design/22-b-005-bulk-create-saved-items.md)
- [§23 — B-054 — Sidepanel Shell Verification (R6 Close)](design/23-b-054-sidepanel-shell-verification.md)
- [§24 — B-018 — Floating Tab Group Persistence Across Restart (R6 Close)](design/24-b-018-floating-tab-group-persistence-acr.md)
- [§25 — B-024 — Multi-select + Bulk Action Bar (R6 Close)](design/25-b-024-multi-select-bulk-action-bar.md)
- [§26 — B-055 — Open Tabs Section (R2 Design)](design/26-b-055-open-tabs-section.md)
- [§27 — B-057 — URL-scheme and Duplicate-URL Policy (R0 Spike Pointer)](design/27-b-057-url-scheme-and-duplicate-url-polic.md)
- [§28 — B-014 — Multi-Window Awareness & Window Badge (R2 Design)](design/28-b-014-multi-window-awareness-window-badg.md)
- [§29 — B-059 — Allow Duplicate URLs with Soft-Warn UI (R2 Design)](design/29-b-059-allow-duplicate-urls-with-soft-war.md)
- [§30 — B-029 — Group Picker Modal (R2 Design)](design/30-b-029-group-picker-modal.md)
- [§31 — B-048 — Item Visual-State Matrix (R2 Design)](design/31-b-048-item-visual-state-matrix.md)
- [§32 — B-042 + B-043 — Collection Export (R2 Design)](design/32-b-042-b-043-collection-export.md)
- [§33 — B-044 + B-045 — Collection Import (R2 Design)](design/33-b-044-b-045-import.md)
- [§34 — B-052 — Fuzzy Search Index Caching + Perf Targets (R2 Design)](design/34-b-052-fuzzy-search-caching.md)
- [§35 — B-007 — Sub-group Nesting (R6 Close)](design/35-b-007-sub-group-nesting.md)
- [§36 — B-030 v2 — Item Drag-Reorder within/between Groups (R6 Close)](design/36-b-030-item-drag-reorder-v2.md)
- [§37 — B-025 — Multi-Item Drag as Single Unit (R6 Close)](design/37-b-025-multi-item-drag.md)
- [§38 — B-031 — Group Drag-Reorder + Nesting via Drag (R6 Close)](design/38-b-031-group-drag-reorder-nest.md)
- [§39 — B-022 — Quick Search Popup (R2 Design)](design/39-b-022-quick-search-popup.md)
- [§40 — B-023 — Group Jump Popup (R2 Design)](design/40-b-023-group-jump-popup.md)
