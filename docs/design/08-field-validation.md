## 8. Field Validation

Caps are enforced at the storage boundary and exported from `partitions.js`
so UI code can mirror them without redeclaring numbers.

| Field | Constraint |
|---|---|
| `item.title` | Non-empty after `.trim()`; `length <= MAX_TITLE (2048)` |
| `item.url` | Non-empty; `length <= MAX_URL (4096)`; parseable via `new URL(url)`; protocol in `{http:, https:, ftp:, mailto:}` |
| `item.groupId` | `string \| null`; if non-null, must reference an existing group in the same serialized snapshot (FK check via cross-partition tx op) |
| `item.sortOrder` | Finite number; default `0` on create (ruling #2) |
| `group.name` | Non-empty after `.trim()`; `length <= MAX_NAME (256)` |
| `group.color` | Must be a member of `GROUP_COLORS` — the 9-color allowlist defined in `shared/constants.js` (B-006); enforced in `groups.js` at create and update time; `ERR_VALIDATION` if not in palette |
| `group.parentId` | `string \| null`; depth must stay `<= 1`; no cycles; target must exist |
| `prefs.theme` | `'light' \| 'dark' \| 'system'` |
| `prefs.displayMode` | `'sidepanel' \| 'window'` |
| `prefs.newTabOverride` | `boolean`, default `false` (H3 fix) |
| `prefs.autoCollapseSubGroups` | `boolean`, default `false` |

**Disallowed URL schemes** (rejected at storage boundary as XSS prophylactic,
H2 fix): `javascript:`, `data:`, `chrome:`, `chrome-extension:`,
`blob:`, and anything else not explicitly allowlisted. The scheme allowlist (B-001d) is: `http`, `https`, `file`. Storage is the
chokepoint — downstream UI cannot be trusted to sanitize href attributes.

**URL normalization via `shared/url.js` (B-001d).** `normalizeUrl(url, mode)` is the canonical normalization entry point:
- **`forStorage` mode:** strips fragment (`#…`), applies protocol defaulting (bare hostnames without scheme get `https://` prepended), lowercases hostname. Used when writing drift records to `tj:drift`.
- **`forMatch` mode:** all `forStorage` transforms plus trailing-slash removal on path-only URLs without a query string. Used for claim matching and drift comparison in `tab-claims.js` and `drift.js`.
- Both modes reject URLs whose scheme is not in the allowlist (`http`, `https`, `file`) with `ERR_VALIDATION`.
- `shared/url.js` replaces the inline `normalizeForMatch` helper that was previously local to `tab-claims.js`.

**Immutable fields.** `id` and `createdAt` are rejected as patch fields in
both `updateItem` and `updateGroup`. `updatedAt` is stripped from the allowed
patch list (M2 fix) and always recomputed by the mutator.

---

