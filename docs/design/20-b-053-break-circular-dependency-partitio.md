## 20. B-053 — Break Circular Dependency partitions.js / write-transaction.js (R6 Close)

### Problem

`partitions.js` imported `writeTransaction` from `write-transaction.js`, and `write-transaction.js` imported `partitionKey`, `defaultShape`, and `assertShape` from `partitions.js`. This created a circular ES module dependency. While Chrome's V8 engine can resolve static circular imports via live bindings, the cycle made the module graph fragile and triggered false-positive warnings in `jsconfig.json`-based tooling.

### Solution: Extract `shapes.js`

A new module `background/storage/shapes.js` was extracted from `partitions.js`. It contains all partition constants, defaults, and validators that were previously co-located with the `readPartition` and `initializePartitions` functions.

**Exports from `shapes.js`:**

| Export | Kind | Description |
|--------|------|-------------|
| `PARTITION_ITEMS`, `PARTITION_GROUPS`, `PARTITION_PREFS`, `PARTITION_META`, `PARTITION_DRIFT`, `PARTITION_FLOATING_GROUPS` | `const string` | Partition name constants |
| `ALL_PARTITIONS` | `const string[]` | Ordered tuple of all six partition names |
| `MAX_TITLE`, `MAX_URL`, `MAX_NAME`, `MAX_COLOR` | `const number` | Field length caps (2048, 4096, 256, 32) |
| `MAX_BULK_INPUTS` | `const number` | Upper bound on `bulkCreateItems` inputs (500; added for B-005) |
| `DEFAULT_PREFERENCES` | `const object` | Frozen default preferences shape |
| `partitionKey(partition)` | `function` | Returns `tj:${partition}` |
| `defaultShape(partition)` | `function` | Returns the default empty value for a partition |
| `assertShape(partitionOrKey, value)` | `function` | Validates a partition value; throws `ERR_CORRUPT_DATA` on failure |

**Dependency graph (now acyclic):**

```
shapes.js ──→ errors.js
          └──→ shared/url.js (for normalizeUrl in drift validator)

write-transaction.js ──→ shapes.js (partitionKey, defaultShape, assertShape)
                     └──→ errors.js

partitions.js ──→ shapes.js (re-exports ALL shape exports)
              └──→ write-transaction.js (imports writeTransaction)
```

### Re-export pattern in `partitions.js`

`partitions.js` uses `export { ... } from './shapes.js'` to re-export every public name from `shapes.js`. This ensures existing consumers of `partitions.js` require zero import-path changes. The re-export syntax does **not** bind names into the local module scope, so `partitions.js` also has a separate `import { ALL_PARTITIONS, partitionKey, defaultShape, assertShape } from './shapes.js'` for its own `readPartition` and `initializePartitions` functions. This dual-import/re-export pattern is an intentional design decision — not duplication.

### Files changed

| File | Change |
|------|--------|
| `background/storage/shapes.js` | **New.** Extracted constants, defaults, validators from `partitions.js`. Added `MAX_BULK_INPUTS = 500` for B-005. |
| `background/storage/partitions.js` | Removed all constant/validator definitions. Re-exports from `shapes.js`. Local import for internal use. |
| `background/storage/write-transaction.js` | Changed import source from `partitions.js` to `shapes.js` for `partitionKey`, `defaultShape`, `assertShape`. |

### Manifest permissions — No changes

### Rollback plan

**Risk:** Low — pure refactor, no behavioral change. `git revert <commit-sha>` restores the original single-file layout. No storage schema changes, no migration needed.

### R2 Correctness Checklist (Post-Build Verification)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C-1 | Storage schema versioned | N/A | No schema change. Pure module extraction. |
| C-2 | Message contracts typed | N/A | No new message types. |
| C-3 | Service worker cold-start safe | PASS | Import graph is acyclic; all modules resolve before SW `install` event. |
| C-4 | ID stability | N/A | No identity changes. |
| C-5 | Manifest file references resolvable | N/A | No new manifest entries. |

---

