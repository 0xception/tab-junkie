## §32 — B-042 + B-043 — Collection Export (R2 Design)

### §32.1 Overview

B-042 (HTML export) and B-043 (JSON export) together establish Tab Junkie's **minimum-viable data-portability baseline**. They are designed and shipped as a single architectural unit in Sprint 17 because they share the same user-surface (one overflow-menu entry point, one confirmation-free flow), the same download-trigger plumbing, and the same "snapshot-then-serialize" read path. Neither feature performs any network I/O and neither mutates storage — both are pure read-then-serialize-then-hand-to-browser operations.

The two formats serve complementary user intents:

- **B-042 (Netscape HTML)** is an interchange format. It targets Chrome's `chrome://bookmarks` import, Firefox's Library Import HTML, and every third-party bookmark manager that speaks the Netscape 1996 spec. Fidelity is bounded by what the format can express — flat folder + item hierarchy, no colors, no per-item metadata beyond title/URL/timestamps/icon.
- **B-043 (JSON)** is a **round-trip-safe backup format**. Its canonical shape is versioned against `KNOWN_VERSION` from `background/storage/migration.js` and is the **frozen contract** that B-045 (JSON import) will consume next sprint. A file produced by B-043 on schemaVersion N, re-imported by B-045 on the same version, must produce byte-equivalent `tj:items` and `tj:groups` partitions (B-043 AC7, round-trip invariant).

The design goal of §32 is therefore twofold: (a) make the Sprint 17 export ship as a narrow, reviewable, minimum-permissions change, and (b) freeze the JSON schema precisely enough that B-045 can be built against a documented contract without re-negotiation. Section §32.5 is the authoritative schema spec.

### §32.2 Module Layout

**Decision: four files, three new directories stay shallow.** Rationale: co-locate format builders with the storage they read (`background/`), keep the schema constant in `shared/` so B-045's UI surface can import it symmetrically, and keep each builder under ~150 lines so R4 review is tractable.

```
background/
  export/
    shared.js          NEW — filename-date util, htmlEscape, blob-download trigger helpers
    html-export.js     NEW — Netscape HTML builder. Consumes shared.js + storage reads.
    json-export.js     NEW — Schema-v1 JSON builder. Consumes shared/export-schema.js.
  messages/
    storage-handlers.js  MODIFIED — one new case for MSG_EXPORT_COLLECTION.
shared/
  export-schema.js     NEW — frozen JSON shape + EXPORT_SCHEMA_VERSION constant.
                       Imported by json-export.js today, and by B-045's importer next sprint.
  messages.js          MODIFIED — add MSG_EXPORT_COLLECTION constant + typedef block.
sidepanel/
  sidepanel.html       MODIFIED — add one overflow-menu `<button id="export-html-btn">`
                       and `<button id="export-json-btn">` (or single "Export" submenu trigger).
  sidepanel.js         MODIFIED — click handlers that dispatch MSG_EXPORT_COLLECTION
                       and perform the blob + anchor download (see §32.4).
```

**Why split the schema out of `json-export.js`:** B-045 will need to *read* the same `EXPORT_SCHEMA_VERSION` and the same field enumeration to validate an uploaded file. Putting the schema constants in `shared/` means `json-export.js` (writer) and the future `background/import/json-import.js` (reader) import the identical symbols. No forking risk.

**Why not a single `background/export/index.js` dispatcher:** the two builders have zero shared logic beyond the helpers in `shared.js`. A dispatcher wrapper would add one indirection without abstraction value. The dispatch happens at the message-handler layer instead (§32.3).

### §32.3 Message Contract Decision

**Decision: Option A — single unified `MSG_EXPORT_COLLECTION` with a `format` discriminator.**

```js
// shared/messages.js — new section, appended after the State broadcast block

// ---- Data export ----
/** Export entire collection to a user-chosen file format. */
export const MSG_EXPORT_COLLECTION = 'tj/exportCollection';

/**
 * @typedef {Object} ExportCollectionRequest
 * @property {'html' | 'json'} format
 *   'html' emits Netscape Bookmark File Format 1 (B-042).
 *   'json' emits Tab Junkie schema-v1 backup (B-043).
 *
 * @typedef {Object} ExportCollectionResponse
 * @property {string} filename      e.g. 'tab-junkie-bookmarks-2026-04-18.html'
 * @property {string} mimeType      'text/html' | 'application/json'
 * @property {string} content       The serialized file body (UTF-8 string).
 * @property {number} size          content.length, in UTF-16 code units. Informational only.
 * @property {number} itemCount     Number of bookmarks included. Drives toast copy.
 * @property {number} groupCount    Number of non-empty groups included. Drives toast copy.
 *
 * On success: { ok: true, data: ExportCollectionResponse }.
 * On failure: standard { ok: false, error: { code, message } } envelope.
 */
```

**Justification for Option A over separate `MSG_EXPORT_HTML` / `MSG_EXPORT_JSON` constants:**

| Concern | Option A (unified) | Option B (split) |
|---|---|---|
| Handler count in `storage-handlers.js` | 1 `case` | 2 `case`s with near-identical scaffolding |
| Safe-mode classification | 1 read-only entry in the dispatcher | 2 entries — twice the audit surface |
| Broadcast policy | Exports never mutate — not in `MUTATION_BROADCASTS` either way; 1 confirmation vs. 2 | Same outcome, twice the declaration |
| [security-reviewer] surface | 1 payload validator: `p.format in ('html', 'json')` | 2 payload validators |
| Forward extensibility (e.g. B-X: CSV export) | Add `'csv'` to the union type; single case grows | Requires a third `MSG_EXPORT_CSV` constant + case |
| Coupling to format | Slightly more coupling: one constant knows two formats | Cleaner separation but no product value |

The unified path is strictly smaller, consistent with the project's "minimum audit surface" pattern used by `MSG_NAVIGATE_TO_ITEM` (which also branches on payload shape: `{itemId}` vs `{tabId, windowId}`, per `shared/messages.js:112–120`).

**Payload validation (handler-side, non-negotiable per C-2):**

```
- typeof p === 'object' && p !== null
- p.format === 'html' || p.format === 'json'
  → any other value → throw StorageError(ERR_VALIDATION, 'exportCollection: format must be "html" or "json"')
- No other fields read; unknown fields are ignored (forward-compat posture consistent with existing handlers).
```

### §32.4 Download Mechanism Decision

**Decision: Option A — `<a download>` + `URL.createObjectURL(blob)` in the sidepanel. Zero new manifest permissions.**

**Rationale:**

1. **Minimum permissions rule.** Non-Negotiable Rules / Security: "Request the minimum set of `manifest.json` permissions needed. Every new permission must be justified in the R2 architecture review." The current manifest (§manifest.json) declares `["tabs", "tabGroups", "storage", "sidePanel", "search"]` — **`downloads` is not present.** Adding it solely to save one line of sidepanel code is not justifiable; it would expand the extension's attack-surface narrative in the store listing for zero user benefit over the blob path.
2. **User-experience parity.** `chrome.downloads.download({url, filename})` and anchor-click-blob-URL both surface the browser's native Save-As dialog when the user has "Ask where to save each file" enabled (the default in Edge/Chrome corporate profiles). Both auto-disambiguate filename collisions (`(1)`, `(2)`). The UX is indistinguishable for a non-programmatic single-file export.
3. **SW context availability.** `URL.createObjectURL` is not available in MV3 service workers — this forces the SW/sidepanel split below **regardless** of which mechanism we pick, so the `downloads` permission would not simplify the SW side either.
4. **Payload-size feasibility at 1000 items.** B-043's JSON size budget: ~1000 items × ~250 bytes/item + 100 groups × ~150 bytes/group ≈ 265KB serialized. B-042's HTML is comparable. `chrome.runtime.sendMessage` is documented to round-trip payloads via structured-clone; Chromium's practical ceiling is ~64MB per message. 265KB — and even a 10x-larger 2.65MB "power user" collection — fits with two orders of magnitude headroom. No chunking required at v1.

**SW → sidepanel handoff (Option A architecture):**

```
┌────────────────────┐         MSG_EXPORT_COLLECTION         ┌─────────────────────┐
│ sidepanel.js       │ ──────────────────────────────────▶  │ storage-handlers.js │
│ click handler      │   { type, payload: { format } }       │ (service worker)    │
│                    │                                        │                     │
│ awaits response    │                                        │  reads items +      │
│                    │                                        │  groups partitions  │
│                    │                                        │  invokes           │
│                    │                                        │  html-export.js or │
│                    │                                        │  json-export.js    │
│                    │                                        │                     │
│                    │ ◀──────────────────────────────────── │  returns            │
│                    │   { ok: true, data: {                 │  ExportCollection-  │
│                    │     filename, mimeType,               │  Response           │
│                    │     content, size,                    │                     │
│                    │     itemCount, groupCount } }         │                     │
└────────────────────┘                                        └─────────────────────┘
         │
         │ 1. new Blob([content], { type: mimeType })
         │ 2. URL.createObjectURL(blob)
         │ 3. create hidden <a href=blobUrl download=filename>
         │ 4. a.click()
         │ 5. URL.revokeObjectURL(blobUrl)
         │ 6. show success toast with itemCount/groupCount
         ▼
   Browser download dialog (native)
```

**Key property:** the service worker **never touches DOM / URL.createObjectURL**. It only produces a UTF-8 string. The sidepanel is the single consumer that turns string → Blob → ObjectURL → anchor click → revoke. This keeps the SW's responsibilities read-only and matches the existing dispatcher's pattern (response-centric, not side-effect-centric).

**Object-URL lifecycle (AC6 — "revoke the object URL after the click", "no leaked blob URLs"):** revoke immediately after `a.click()` in a `queueMicrotask` (or `requestAnimationFrame` fallback). The browser's download pipeline has already consumed the blob reference by the time the click handler returns; revocation after this point is safe and mandatory. The helper in `background/export/shared.js` (`triggerBlobDownload` — see §32.7) encapsulates this so every caller gets the same lifecycle.

### §32.5 JSON Schema v1 (Authoritative)

**This subsection is the frozen contract.** Any change to field names, types, or the inclusion-set requires a new `schemaVersion` number and a corresponding migration path in B-045.

#### §32.5.1 Root shape

```jsonc
{
  "schemaVersion": 1,                         // integer, === KNOWN_VERSION at export time
  "exportedAt": "2026-04-18T14:30:00.000Z",   // ISO-8601 UTC, via new Date().toISOString()
  "items":       [ /* Item[]  — see §32.5.2 */ ],
  "groups":      [ /* Group[] — see §32.5.3 */ ],
  "preferences": { /* optional — see §32.5.4 */ }
}
```

**Field rules:**

- `schemaVersion`: **integer**, read dynamically from `background/storage/migration.js`'s `KNOWN_VERSION` at the moment of export (B-043 AC3). Hardcoding is a FAIL in R4. Starts at `1`.
- `exportedAt`: UTC ISO-8601 string from `new Date().toISOString()`. Used for display only; never round-tripped into a storage field. Deterministic-ordering tests (B-043 AC6) must strip this field before byte-comparing two exports.
- `items`: always present, always an array. Empty collection → `[]`, never `null` or omitted.
- `groups`: always present, always an array. Empty collection → `[]`.
- `preferences`: **present iff** `tj:prefs` has been written by the user (i.e., `MSG_SET_PREFERENCES` has ever been dispatched against this profile). If `getPreferences()` returns the `DEFAULT_PREFERENCES` constant (which means nothing has been persisted), the key is omitted. Rationale: a clean import should not force the importing profile's preferences to match the exporting profile's first-run defaults.

#### §32.5.2 Item shape

Every persisted field from `background/storage/partitions.js` typedef + the optional extension fields actually stored by `items.js`:

| Field | Type | Always present? | Source |
|---|---|---|---|
| `id` | `string` (ULID, 26 chars) | Yes | `items[i].id` verbatim |
| `title` | `string` (1..MAX_TITLE chars) | Yes | `items[i].title` verbatim |
| `url` | `string` (1..MAX_URL chars, normalized) | Yes | `items[i].url` verbatim (already `normalizeUrl`-normalized at write time) |
| `groupId` | `string \| null` | Yes | `items[i].groupId` (null means Ungrouped) |
| `sortOrder` | `number` (finite, integer in practice) | Yes | `items[i].sortOrder` |
| `createdAt` | `number` (epoch ms) | Yes | `items[i].createdAt` |
| `updatedAt` | `number` (epoch ms) | Yes | `items[i].updatedAt` |
| `lastAccessedAt` | `number` (epoch ms) | **Iff present on stored record** | `items[i].lastAccessedAt` — set by `MSG_NAVIGATE_TO_ITEM`'s updateItem call. Items never visited through the panel do not have this field; those items export without the key (not with `null`). |

**Unknown / future fields on the stored record:** per B-043 AC4 ("Unknown / unexpected fields present on the stored record are passed through verbatim to preserve forward-compat"), the serializer must iterate the actual record keys, not a hard-coded whitelist of `[id, title, url, groupId, sortOrder, createdAt, updatedAt, lastAccessedAt]`. Implementation note: a simple `{ ...item }` spread then explicit drop of any runtime-enrichment field names (§32.5.6) is the cleanest path.

#### §32.5.3 Group shape

| Field | Type | Always present? | Source |
|---|---|---|---|
| `id` | `string` (ULID) | Yes | `groups[i].id` verbatim |
| `name` | `string` (1..MAX_NAME chars) | Yes | `groups[i].name` verbatim |
| `color` | `string` (one of `GROUP_COLORS`) | Yes | `groups[i].color` verbatim |
| `parentId` | `string \| null` | Yes | `groups[i].parentId` (null = top-level) |
| `sortOrder` | `number` | Yes | `groups[i].sortOrder` |
| `collapsed` | `boolean` | Yes | `groups[i].collapsed` |
| `createdAt` | `number` (epoch ms) | Yes | `groups[i].createdAt` |
| `updatedAt` | `number` (epoch ms) | Yes | `groups[i].updatedAt` |

**Never emitted:** the `warning: 'DUPLICATE_NAME'` field on the `CreateGroupResponse` shape (§shared/messages.js:127) is a *return value flag*, not a persisted field. It exists only in the message-response envelope and never appears on the stored group record, so it cannot leak into the export by accident — but this is still noted here for explicit auditability.

#### §32.5.4 Preferences shape (conditional)

Emits `getPreferences()` verbatim when any preference has been persisted. Current fields (from `DEFAULT_PREFERENCES` in `shapes.js`):

```
{ theme: 'light' | 'dark' | 'system',
  displayMode: 'sidepanel' | 'window',
  newTabOverride: boolean,
  autoCollapseSubGroups: boolean }
```

B-045's importer must round-trip this verbatim. Unknown preference keys are passed through (forward-compat).

#### §32.5.5 Ordering

Deterministic ordering is required for B-043 AC6 ("two exports of identical storage state produce byte-identical files modulo `exportedAt`").

- **items**: sort by `(groupId ASC with null first, sortOrder ASC, id ASC)`. `null` groupId compares less than any string (implementation: stable 3-key comparator).
- **groups**: sort by `(parentId ASC with null first, sortOrder ASC, id ASC)`. Same null-first rule.
- Sort is performed in-builder, not reliant on storage read order. `listItems()` / `listGroups()` currently return partition-insertion order; the builder MUST re-sort.

#### §32.5.6 Exclusions (verified against field inventory)

The following are **never** written to the JSON export, by construction:

| Excluded field / source | Why |
|---|---|
| `tj:drift` partition entries | Transient drift state; B-043 AC2 exclusion |
| `tj:floatingGroups` partition entries | Transient session state; B-043 AC2 exclusion |
| `TabClaims` mirror (`claimsMirror`) | In-memory live state; not persisted |
| `LiveTabIndex` / open-tab data | In-memory live state |
| `live`, `active`, `audible`, `drifted` flags | Derived at read time, never stored on Item (AC11 privacy) |
| `tabId`, `windowId` | Ephemeral browser IDs (AC11 privacy) |
| `windowMap` | Session-scoped UI state (shared/messages.js:101) |
| `focus`, selection state, search state | UI-only, never persisted |

The builder reads ONLY `PARTITION_ITEMS`, `PARTITION_GROUPS`, and `PARTITION_PREFS`. It does not invoke `buildLiveStates`, `getDriftRecords`, `buildOpenTabs`, or any tab-subsystem function. This is enforced by import audit in R4 (no imports from `background/tabs/**` in `background/export/**`).

#### §32.5.7 schemaVersion bump policy

- **Additive field changes do NOT bump `schemaVersion`.** Example: adding an optional `tags: string[]` field to Item in a future sprint — old files without `tags` remain valid on the new importer (it just treats absence as `[]`), and new files with `tags` are ignored by old importers below the tags-aware code path.
- **`schemaVersion` bumps ONLY for incompatible shape changes.** Examples that would bump:
  - Renaming or removing an existing field.
  - Changing a field's type (e.g., `groupId` from `string | null` to `string[]`).
  - Changing the Root object's top-level shape.
  - Semantic redefinitions (e.g., `sortOrder` changes from "ascending wins" to "descending wins").
- When `schemaVersion` bumps, B-045's importer must know how to migrate a file at version N to the current `KNOWN_VERSION`. The migration function lives in `background/storage/migration.js` alongside `MIGRATION_STEPS` — **storage migration and export migration share the version line.** This is intentional: a persisted item's shape *is* the exported item's shape, by §32.5.2 design.
- `B-045` will enforce `importedFile.schemaVersion <= KNOWN_VERSION`; files from a *newer* version than the current extension understands are rejected with a user-visible error ("This backup was created by a newer version of Tab Junkie. Please update the extension before importing.").

### §32.6 Netscape HTML Format (B-042)

**Target spec:** Netscape Bookmark File Format 1 (1996). Accepted by Chrome (`chrome://bookmarks` Import), Firefox (Library → Import HTML), Edge, Safari, and every major third-party bookmark manager.

#### §32.6.1 Document skeleton (fixed)

```html
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks Menu</H1>
<DL><p>
  {{body}}
</DL><p>
```

Every character in this skeleton is fixed text — no interpolation, no escaping needed, because every dynamic value is injected into `{{body}}` exclusively.

#### §32.6.2 Body structure

Order of `<DT>` entries inside the root `<DL><p>`, per B-042 AC3:

1. **Ungrouped items first**, emitted as direct `<DT><A>` children of the root `<DL>` (not wrapped in a folder). This is a departure from AC3's "virtual `__ungrouped__` renders as a top-level folder literally named `Ungrouped`". **R2 clarification for PO:** AC3 says "virtual `__ungrouped__` renders as a top-level folder literally named `Ungrouped`." Implementer must pick one. **Decision: honor AC3 literal text — emit a folder named `Ungrouped` containing the ungrouped items, UNLESS there are zero ungrouped items (suppress the empty folder per AC7's `M` counting rule: "exclude the Ungrouped folder from `M` only if it contained zero items").** This keeps re-import round-trip predictable.
2. **Top-level groups** in ascending `sortOrder`, each as `<DT><H3>…</H3><DL><p>…</DL><p>`.
3. **Items inside each group** follow the group's items by ascending `sortOrder`, then sub-groups by ascending `sortOrder`. Per storage schema, depth is capped at 1 (one level of nesting, enforced by `assertDepthAndCycle`), so the builder's recursion terminates at depth 1 — but the builder still writes a depth-limited recursion guard (max depth 2 before bail-out) for defensive-programming parity with the storage-schema invariant.

#### §32.6.3 Per-entry templates

Folder (group):
```
<DT><H3 ADD_DATE="{unixSecondsCreated}" LAST_MODIFIED="{unixSecondsUpdated}">{escapedName}</H3>
<DL><p>
  {folderContents}
</DL><p>
```

Bookmark (item):
```
<DT><A HREF="{escapedAttrUrl}" ADD_DATE="{unixSecondsCreated}" LAST_MODIFIED="{unixSecondsUpdated}"{optionalIcon}>{escapedText title}</A>
```

where `{optionalIcon}` is either empty string (no favicon stored) or ` ICON="{escapedAttrFavicon}"` when `item.faviconUrl` is truthy. Per B-042 AC4: "If a cached favicon URL exists on the item, include `ICON=…`; if absent, omit the attribute entirely (do not emit empty `ICON=""`)." — **Today's storage schema does not include a `faviconUrl` field on Item (§32.5.2 field inventory).** Implementation note: the builder emits `ICON` only if `'faviconUrl' in item && typeof item.faviconUrl === 'string' && item.faviconUrl.length > 0`. If no such field is ever written by the storage layer, `ICON` is simply never emitted — AC4 remains satisfied.

#### §32.6.4 Timestamp conversion

`ADD_DATE` and `LAST_MODIFIED` attributes carry **unix-epoch seconds (integer)**, not milliseconds. Stored `createdAt` / `updatedAt` are epoch-ms; convert with `Math.floor(value / 1000)`. Browsers that import the file interpret these values as seconds by spec; emitting ms is a silent correctness bug that B-042 AC4 calls out explicitly as FAIL.

#### §32.6.5 Escaping

Every text node (group name, item title) passes through **text-context HTML escaping**: `&`, `<`, `>` → entities. Every attribute value (HREF, ICON, embedded in `H3` / `A` tags) passes through **attribute-context HTML escaping**: `&`, `<`, `>`, `"` → entities. The two variants share a single helper function (`htmlEscape` — see §32.7) that always escapes all four characters. Attribute-context and text-context are both safe against the single helper, at a negligible size cost on quote-free titles.

B-042 AC10 specifies a test probe: `title="</A><script>alert(1)</script>"`, `url="javascript:alert(1)"`. After export → Chrome re-import, the title must read as literal text `</A><script>alert(1)</script>` and the URL must remain a literal non-executing string. (Note: `javascript:` URLs are already blocked at the storage layer by `normalizeUrl`'s `ALLOWED_URL_SCHEMES` list per B-058, so reaching the builder with such a URL requires a pre-B-058 stored record — still worth the probe.)

### §32.7 Shared Download-Trigger Helper

**File: `background/export/shared.js`.** Pure functions, zero state, zero `chrome.*` API usage in the non-sidepanel portion. The sidepanel-facing helper lives separately because it touches DOM (document.createElement, URL.createObjectURL).

#### §32.7.1 `buildFilenameWithDate`

```js
/**
 * Build a download filename with a local-date suffix.
 * @param {string} prefix    e.g. 'tab-junkie-bookmarks' or 'tab-junkie-backup'
 * @param {string} extension e.g. 'html' or 'json' (no leading dot)
 * @returns {string}          e.g. 'tab-junkie-bookmarks-2026-04-18.html'
 */
export function buildFilenameWithDate(prefix, extension) {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${prefix}-${yyyy}-${mm}-${dd}.${extension}`;
}
```

- Date component uses **local time** per AC5 ("YYYY-MM-DD (local date)"). `getFullYear/Month/Date` are intentional — `toISOString()` would be UTC.
- Pure function; easy to unit-test with a `Date` mock.

#### §32.7.2 `htmlEscape`

```js
/**
 * HTML-escape for both text-node and attribute-value contexts.
 * Escapes `&`, `<`, `>`, and `"` — the superset suitable for either context.
 * Single-quote is NOT escaped because the builder always emits
 * double-quoted attributes.
 * @param {string} text
 * @returns {string}
 */
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export function htmlEscape(text) {
  return String(text).replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]);
}
```

Single regex with a character-class — one pass over the input string; O(n) for each text value. Consumed by `html-export.js` exclusively.

#### §32.7.3 `triggerBlobDownload` (sidepanel context only)

```js
/**
 * Turn an in-memory string into a downloaded file via a hidden <a download>.
 * Must be called from a DOM context (sidepanel / popup / newtab) — NOT from
 * the service worker, which has no URL.createObjectURL.
 *
 * @param {Document} doc        typically `document` in sidepanel.js
 * @param {string} filename
 * @param {string} mimeType     'text/html' or 'application/json'
 * @param {string} content
 * @throws {Error} if blob creation fails or anchor click throws
 */
export function triggerBlobDownload(doc, filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = doc.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.display = 'none';
  doc.body.appendChild(a);
  try {
    a.click();
  } finally {
    doc.body.removeChild(a);
    // Revoke *after* click so the download pipeline has the reference.
    queueMicrotask(() => URL.revokeObjectURL(url));
  }
}
```

- `doc` is injected (not a global reference) so tests can pass a JSDOM document.
- The `finally` block guarantees cleanup even when `a.click()` throws (extremely unlikely, but defensive).
- `queueMicrotask` defers revocation past the click's synchronous tail, matching Chromium's internal download-queue hand-off.

### §32.8 Performance Plan

**Target: 1000-item / 100-group collection completes end-to-end in < 500ms P95 on dev-class hardware** (B-042 AC9, B-043 AC11).

**Budget breakdown (estimated):**

| Phase | Budget | Technique |
|---|---|---|
| Storage reads: `listItems()` + `listGroups()` + `getPreferences()` | < 50ms | Single pass per partition; no nested reads. `chrome.storage.local.get` is already used at scale by B-001c. |
| Sort items + groups (ordering §32.5.5) | < 20ms | Two `Array.sort` calls, O(n log n) on 1000 + 100 elements. |
| JSON path: build payload object + `JSON.stringify(payload, null, 2)` | < 80ms | Native `JSON.stringify` is C-code; 2-space indent adds ~1.4x bytes but same asymptotic cost. Single call — never hand-build JSON. |
| HTML path: template concat | < 150ms | `Array.join('\n')` over pre-built segment strings, or a single accumulator `let out = '...'; out += segment;` — V8 optimizes both identically for <10k segments. Avoid `out = out + x + y` patterns that spawn two intermediate strings. |
| Message round-trip (SW ↔ sidepanel) | < 100ms | structured-clone over ~300KB. Well within `chrome.runtime.sendMessage` hot-path performance on MV3. |
| Blob creation + anchor click + browser dialog paint | < 100ms | Browser-owned. |
| **Total budget** | **< 500ms** | |

**Anti-patterns explicitly forbidden:**

1. **No repeated `listItems()` calls inside loops.** Read once into a const, serialize from memory.
2. **No per-item storage reads** for the favicon field (future addition). When faviconUrl is added, it lives on the Item record, not in a side partition.
3. **No hand-rolled JSON string-building.** Always `JSON.stringify(payload, null, 2)`. Hand-rolling invites escape-character bugs that invalidate AC1 ("`JSON.parse()` succeeds without error").
4. **No per-character HTML-escape loops.** Single regex replace per text value (§32.7.2).
5. **No N-pass concatenation** in the HTML builder. Collect segments into an array, `join('\n')` once at the end.

**Performance test harness (R5):** wrap the handler call in `performance.now()` delta on a seeded 1000/100 fixture, assert median of 5 runs ≤ 500ms. Add an integration test exercising the real `chrome.runtime.onMessage._listeners` dispatcher (Sprint 15 retro action item: **no shim dispatcher in tests — use the real one**).

### §32.9 Privacy + Security

Every export operation is **entirely local**. This subsection enumerates the guarantees the builder must uphold.

| Guarantee | Mechanism |
|---|---|
| **No network egress** | `background/export/**` imports zero network primitives. R4 [security-reviewer] grep sweep: `fetch\|XMLHttpRequest\|navigator\.sendBeacon\|WebSocket` must return zero hits in the diff (B-043 AC12). |
| **No telemetry** | No analytics library installed, no calls added. Same grep sweep. |
| **No PII in logs** | Builder MUST NOT `console.log`, `console.warn`, or `console.error` with item titles / URLs. Failure messages use generic phrasing ("Export failed: unable to read bookmarks" — AC8). R4 [security-reviewer] audits all `console.*` sites added in the diff. |
| **No live-state in output** | Explicit exclusion list (§32.5.6). Enforced by construction: `background/export/**` does not import from `background/tabs/**` or `background/broadcast.js`. Audit with an ESLint `no-restricted-imports` rule, or a manual R4 grep. |
| **XSS-safe HTML export** | Every interpolated text/attribute value passes through `htmlEscape` (§32.7.2). AC10 probe (literal `</A><script>…</script>` in title) verifies in R5. |
| **Strict schema-v1 boundary** | JSON output includes only fields enumerated in §32.5; no `...restOfRecord` spread would ever include, e.g., a `_rawTabClaim` private field — because such fields are not stored on the Item record in the first place. |
| **No new permissions** | `manifest.json` unchanged (§32.4 Option A decision). |
| **Read-only path** | Both builders go through `listItems() / listGroups() / getPreferences()` — no writes. Safe-mode (schema downgrade) allows reads, so export works even when writes are blocked. Handler classifies `MSG_EXPORT_COLLECTION` as a read op in the safe-mode dispatcher (parallel to `MSG_LIST_ITEMS`). |
| **Sender validation** | The existing dispatcher's AC5 sender check (§6) applies automatically to the new `case` — messages from foreign origins are rejected with `ERR_DIRECT_WRITE` before the handler runs. |

### §32.10 Out of Scope

Both B-042 and B-043 explicitly exclude (from their ACs and `Out of scope` lists):

- **Partial / per-group / filtered exports** — whole collection only (both ACs).
- **Cloud upload, sync, or network transmission** (both ACs).
- **Encryption / password-protection** (both ACs).
- **Exporting `tj:drift`, `tj:floatingGroups`, live tab claims, focus state, selection state, tab/window IDs** (both ACs, privacy).
- **HTML import** — owned by B-044, separate sprint.
- **JSON import** — owned by B-045, separate sprint. §32.5 of this document IS the contract B-045 will consume.
- **Scheduled / automatic exports** (B-042 AC13g).
- **Pretty-print toggle / compact JSON** (B-043 out-of-scope). 2-space indent is the only supported format.
- **Alternative formats (CSV, XML)** — if added later, they extend `MSG_EXPORT_COLLECTION`'s `format` union (§32.3) without a new message constant.

### §32.11 R2 Correctness Checklist

| # | Check | Verdict | Notes |
|---|-------|---------|-------|
| **C-1** | Storage schema versioned | **N/A — PASS** | Exports READ storage, never write. No partition shape change, no new persisted fields, no migration entry. Rollback = git-revert (§32.12). |
| **C-2** | Message contracts typed | **PASS** | `MSG_EXPORT_COLLECTION` typedef and payload/response shapes documented in §32.3. To be codified in `shared/messages.js` as part of R3. |
| **C-3** | Service worker cold-start safe | **PASS** | Export handler wait on the existing `readyPromise` gate (inherited from the dispatcher pattern, §storage-handlers.js). A cold-start export races no writes because it's a pure read; storage partitions self-heal to default-empty shapes on first read (§storage/partitions.js). |
| **C-4** | ID stability | **N/A — PASS** | Exports emit whatever ULIDs the storage layer has. No new ID generation. Round-trip (§32.5, B-045 contract) preserves IDs byte-for-byte. |
| **C-5** | Manifest file references resolvable | **N/A — PASS** | No new `default_path`, no new `chrome_url_overrides`, no new `default_popup`. `manifest.json` is unchanged (§32.4). |
| **C-6** | No nested state indicators double-announcing | **N/A — PASS** | No new `aria-live` surfaces introduced inside existing state-bearing rows. The Export button is a standalone `<button id="export-html-btn">` / `id="export-json-btn">` with its own `aria-label`. Post-export success toast uses the existing `role="status"` / `aria-live="polite"` toast surface (shared infra from B-049). No row-level concurrent announcements. |

### §32.12 Rollback Plan

- **Storage migration required:** none.
- **New manifest permissions:** none (§32.4 Option A).
- **New persisted fields:** none.
- **Rollback procedure:** `git revert <sprint-17-merge-sha>` on `release/v2`. Existing panels continue to function without the overflow-menu button; saved data is untouched. Users lose the Export action only. No user-facing notification needed.
- **Storage compatibility:** because no partition shape changed, a user who loaded the v1.12.0 (with export) and then downgrades to v1.11.0 (without) sees identical data on both versions.

### §32.13 Flagged Risks (MEDIUM — R4 attention)

| # | Risk | Severity | Mitigation / Deferral |
|---|---|---|---|
| **F-1** | `chrome.runtime.sendMessage` payload size at 10k+ items. 265KB (1k items) × 10 ≈ 2.65MB — still under Chromium's ~64MB cap, but structured-clone latency grows linearly. | MEDIUM | **Defer to post-ship observation.** 1k is the AC target. If telemetry ever reveals 10k+ users (currently unknowable — no telemetry exists), introduce chunked streaming: SW emits `{ type: 'export-chunk', seq: N, data }` messages; sidepanel concatenates. Out of scope today. |
| **F-2** | Filename collision with existing downloads (user already has `tab-junkie-bookmarks-2026-04-18.html` from a prior same-day export). | LOW — accepted | Browser auto-disambiguates to `...-2026-04-18 (1).html`. AC8 (B-043) explicitly states: "Collisions are resolved by the browser's standard download-disambiguation." No builder work. |
| **F-3** | Storage write concurrent with mid-build export produces inconsistent snapshot (e.g., item count and group count disagree). | MEDIUM | **Single-snapshot read:** builder performs `await listItems()` and `await listGroups()` serially, **then** serializes. A mutation landing between the two reads produces a snapshot where `items` references a `groupId` that does not exist in `groups` — low probability on a local-only extension but not zero. Mitigation: ignore orphan `groupId` references at serialization time (items retain the original `groupId`; the importer, B-045, auto-reparents to null per its AC). Alternative considered: wrap both reads in a `writeTransaction` with no mutator — rejected, too invasive for a read path. |
| **F-4** | `faviconUrl` field referenced in B-042 AC4 but not present in the current storage schema (§32.5.2 field inventory). | LOW | Builder emits `ICON` only if `'faviconUrl' in item`. If the schema never grows this field, `ICON` is simply never emitted — AC4 remains technically satisfied ("if absent, omit the attribute entirely"). Flagged for [product-manager] awareness — see §32.15. |

### §32.14 Handoff Notes for [frontend-engineer] R3

**Sprint 17 Wave 3 = B-042 (HTML), Wave 4 = B-043 (JSON).** Shared infrastructure lets Wave 3 create files Wave 4 extends. Suggested build order:

1. **Scaffold the schema constant first** — `shared/export-schema.js`. Export `EXPORT_SCHEMA_VERSION = 1` and re-export `KNOWN_VERSION` from `background/storage/migration.js` under a named export for the importer to consume. Size: ~15 lines.
2. **Build `background/export/shared.js`** — pure utilities, no state, no chrome API. Size: ~60 lines. Tested in isolation with a JSDOM document mock.
3. **Build `background/export/json-export.js`** — imports `listItems`, `listGroups`, `getPreferences`, `KNOWN_VERSION`, and `buildFilenameWithDate`. Exports `buildJsonExport(): Promise<ExportCollectionResponse>`. Size: ~90 lines.
4. **Build `background/export/html-export.js`** — imports `listItems`, `listGroups`, `htmlEscape`, `buildFilenameWithDate`. Exports `buildHtmlExport(): Promise<ExportCollectionResponse>`. Size: ~120 lines (more templating than JSON).
5. **Wire `MSG_EXPORT_COLLECTION` in `shared/messages.js`** — add constant + typedef block from §32.3. Size: +~30 lines.
6. **Wire handler in `background/messages/storage-handlers.js`** — add one `case` that switches on `p.format` and calls `buildHtmlExport` / `buildJsonExport`. Ensure it is **not** in `MUTATION_BROADCASTS` (exports don't mutate, must not trigger `MSG_STATE_CHANGED`). Ensure safe-mode dispatcher allows it (read-only). Size: +~15 lines.
7. **Sidepanel UI** — add overflow-menu `<button id="export-html-btn">` and `<button id="export-json-btn">` (or, if the menu already exists with similar items, follow its pattern). Wire click handlers in `sidepanel.js` that:
   - Dispatch `chrome.runtime.sendMessage({ type: MSG_EXPORT_COLLECTION, payload: { format: 'html' | 'json' } })`.
   - On `{ ok: true, data }`, call `triggerBlobDownload(document, data.filename, data.mimeType, data.content)`.
   - Show success toast `Exported {data.itemCount} bookmarks across {data.groupCount} groups` (B-042 AC7) / `Backup exported: {data.filename}` (B-043 AC10).
   - On `{ ok: false, error }`, show error toast `Export failed: {generic copy}` with `console.warn(error.code)` — never log titles or URLs.

**Tests to ship (R5 [test-engineer]):**

- `tests/b042-html-export.test.js` — AC1/2/3/4/5/7/8/10 (format validity, hierarchy, filename, escaping).
- `tests/b043-json-export.test.js` — AC1/2/3/4/5/6 (format, root shape, schemaVersion dynamic read, item/group shapes, deterministic ordering byte-equivalence).
- `tests/b042-b043-integration.test.js` — real `chrome.runtime.onMessage._listeners` dispatch (Sprint 15 retro action item), 1000/100 fixture for AC11 performance, XSS probe for B-042 AC10, round-trip setup for B-045 pre-contract verification (import a B-043 export into a fresh profile and byte-compare storage — even though B-045 is not built, we can simulate the round-trip by direct partition writes).

**Files changed — total diff estimate:**

- **New:** 4 files (~285 lines).
- **Modified:** 3 files (`shared/messages.js`, `background/messages/storage-handlers.js`, `sidepanel/sidepanel.html`, `sidepanel/sidepanel.js`) (~80 added lines combined).
- **Permissions:** 0 added.
- **Manifest:** unchanged.

**Sprint 15 + 16 retro action items — applied here:**

1. **CSS selector grep** — §32 does not introduce any CSS selector tightly coupled to DOM structure. The Export buttons are simple `<button id="export-html-btn">` and `<button id="export-json-btn">` with straightforward `#export-html-btn` / `#export-json-btn` CSS hooks (or no custom CSS, reusing existing overflow-menu button styles). **No CSS grep needed** — explicitly confirmed.
2. **Theme-token promotion audit** — **no new token surface**. No new colors, no new CSS variables, no new palette entries. The buttons reuse existing `--text-primary`, `--bg-surface`, `--border-subtle` tokens. The success/error toasts reuse the existing `--toast-bg` / `--toast-text` tokens from B-049.
3. **No double-announcement paths (C-6)** — **no nested state indicators introduced**. The Export button itself is a simple `aria-label="Export bookmarks"` (or visible text). The post-export toast uses the shared toast surface (`role="status"` / `aria-live="polite"`). No row-level concurrent announcement risk.

### §32.15 Open Question for [product-manager]

**Q: `faviconUrl` in B-042 AC4 references a field not currently present in the storage schema (§32.5.2 field inventory).** AC4 reads: "If a cached favicon URL exists on the item, include `ICON="{faviconUrl}"`; if absent, omit the attribute entirely."

- Today, `Item` has no `faviconUrl` field. The `buildLiveStates` helper attaches `favIconUrl` to the *live state record*, but that is runtime-only and explicitly excluded from export per AC11.
- Two interpretations:
  - **(a)** AC4 is forward-looking: a future B-XXX will add `faviconUrl` as a persisted field on Item, at which point B-042 will automatically populate `ICON`. R3 builds the conditional emit today; today the attribute is never emitted.
  - **(b)** AC4 intends the runtime `favIconUrl` from `liveStates` — but this conflicts with AC11 privacy ("a diff of exported content vs item/group storage shapes shows zero leakage of live-state").
- **R2 recommendation: interpretation (a).** Builder emits `ICON` iff `'faviconUrl' in item && typeof item.faviconUrl === 'string' && item.faviconUrl.length > 0`. Today this branch never fires. This satisfies AC4's "if absent, omit" clause and preserves AC11's privacy boundary.
- **Needs PM confirmation** at sprint kickoff: is interpretation (a) the right call, or is the PM separately scoping a "persist favicon on item" item before B-042 R3?

No other open questions.

---

### §32.16 B-042 + B-043 — Deviations From R2 (Sprint 17 as-built)

This subsection records what was actually shipped for B-042 (HTML export) and B-043 (JSON export) in Sprint 17 relative to the §32 R2 design. Both items shipped together under the unified §32 design. All deviations below were reviewed in R4 (code, security, qa) and R5 (test-engineer + UAT) and are ratified here as architecturally sound.

#### §32.16.1 Ratified R3 deviations (apply to both B-042 + B-043)

1. **§32.7 `triggerBlobDownload` relocated to `sidepanel/sidepanel.js` as `_triggerBlobDownload`.**
   The R2 design in §32.7.3 itself noted "must be called from a DOM context." The service worker has no DOM, so the helper was placed on the sidepanel module where the `chrome.runtime.sendMessage` response resolves. **Ratified.** Any future export format (CSV, Markdown, etc.) MUST also call the sidepanel-side helper and MUST NOT attempt DOM operations from the SW.

2. **§32.7.2 `htmlEscape` expanded from 4-char set to 5-char set.**
   Build also escapes single-quote (`'` → `&#39;`) as defense-in-depth beyond the §32.7.2 minimum (`&`, `<`, `>`, `"`). **Ratified.** Future export helpers SHOULD match this 5-char set.

3. **New helper `countNonEmptyGroupsForHtml` in `background/export/html-export.js`.**
   Drives AC7 toast copy ("Exported N items in M groups"). `M` is the count of non-empty custom groups plus the Ungrouped bucket iff it contains items — matching what the user visually sees in the export. Documented here so future formats compute `M` the same way.

4. **R4 Q-H1 orphan rescue (applies to BOTH HTML and JSON).**
   Items whose `groupId` refers to a deleted/missing group are rendered under Ungrouped rather than silently dropped. R4 flagged the R3 code as losing these items — a data-loss bug. The fix was applied to both `html-export.js` and `json-export.js`. **Required behavior for any future export format**: orphan items MUST be emitted under Ungrouped, never dropped.

5. **R4 M-2 Ungrouped `<H3>` Firefox interoperability.**
   The Ungrouped section header now carries `ADD_DATE="0" LAST_MODIFIED="0"` attributes even though there is no real group record behind it. This satisfies Firefox's Netscape-format parser, which requires the timestamp attributes on folder headers. **Documented as required for all Netscape HTML exports.**

6. **R4 size reports UTF-8 bytes, not UTF-16 code units.**
   The `size` field in the `exportCollectionAsHtml` / `exportCollectionAsJson` response is computed as `new TextEncoder().encode(content).length` (actual bytes on disk) rather than `content.length` (JavaScript string length). Typedef in `shared/messages.js` updated to reflect this. **Contract for consumers of `size`**: treat it as UTF-8 byte count for any future quota check, telemetry field, or user-facing size display.

#### §32.16.2 B-043-specific deviations

1. **Direct `chrome.storage.local.get(partitionKey(PARTITION_PREFS))` read in `storage-handlers.js`.**
   The handler reads the `tj:prefs` partition directly rather than calling `getPreferences()`. Rationale: `getPreferences()` merges defaults over persisted values, so it cannot answer the question "are persisted prefs present?" — it always returns defaults. The §32.5.4 rule ("preferences object present iff user has ever persisted custom prefs") requires distinguishing these two states. **Accepted as a handler-layer probe**; this is NOT a new public export from the storage module, and other modules MUST NOT copy the pattern without [solution-architect] review.

2. **`GROUP_RUNTIME_FIELDS` includes `warning` defensively.**
   Even though §32.5.3 noted `warning` is never persisted on Group records, the runtime-strip deny-list includes it as belt-and-braces. **Accepted.**

3. **Deny-list (`*_RUNTIME_FIELDS`) strip vs §32.5 allow-list.**
   R3 implemented runtime stripping via an explicit deny-list of known runtime fields rather than an allow-list on the §32.5 frozen field inventory. This leaves a defense-in-depth gap: any future Item/Group field that is added to the storage schema but forgotten in the deny-list would leak into exports. See §32.16.3 decision D-1 — this is **flipped to an allow-list as an architect ruling before B-045 ships**.

#### §32.16.3 R6 architect rulings (open decisions from R4)

- **D-1 (from B-043 sec-S-1) — Flip runtime strip to allow-list.** The deny-list-based runtime strip currently pass-through camelCase `favIconUrl` and any future non-§32.5 fields. **Ruling: freeze the §32.5 allow-list now.** `buildJsonExport` MUST be updated to explicitly emit only the §32.5-listed fields (`Item: id, title, url, groupId, createdAt, updatedAt, sortOrder, lastAccessedAt`; `Group: id, label, order, color, createdAt, updatedAt`). This is a follow-on work item for [product-manager] to file as a new B-XXX before B-045 import work begins.

- **D-2 (from B-043 sec-S-2) — `tj:prefs` unknown-key pass-through is intentional.** Exported `preferences` round-trips any keys present in storage, including keys not listed in the canonical preference schema. **Ruling: documented as forward-compat pass-through**, aligned with the "round-trip-safe" goal of §32.5.4. B-045 import MAY choose to filter unknown keys at import time. The R5 test suite pins this pass-through semantics.

- **D-3 (from B-043 code-M-2 + qa-Q-2) — `listItems → listGroups` two-read race.** Reading the two partitions in sequence creates a narrow window where a group can be deleted between the two reads. **Ruling: known race-window, acceptable for v1.** The failure mode is benign: items from a group deleted mid-read are rescued into Ungrouped by the §32.16.1 #4 orphan-rescue logic. The alternative (single cross-partition `chrome.storage.local.get` call) adds coupling and leaks partitioning concerns out of the storage module. **Future hardening opportunity — not shipped in Sprint 17.** §32.13 updated to reference this.

- **D-4 (from B-043 code-L-2) — `_handleExportError(err)` extraction deferred.** R4 flagged copy-paste of error-toast code between `_exportCollectionAsHtml` and `_exportCollectionAsJson` in `sidepanel.js`. **Ruling: ratify as-is for Sprint 17.** Keeping the two error paths separate preserves flexibility for each format to diverge in toast copy (e.g., "HTML export failed" vs "JSON export failed") or add format-specific diagnostic context. A future DRY pass can extract once the copy stabilizes.

#### §32.16.4 R5 coverage

- **B-042**: 46 tests (R3 30 + R4-fix 14 + R5 3) covering all 13 ACs plus R4 regressions (orphan rescue, Firefox interop header, UTF-8 size, 5-char escape). UAT plan: `docs/UAT_B-042.md` (14 test cases, PASS).
- **B-043**: ~39 tests (R3 32 + R5 7) covering all 13 ACs plus the sec/qa MEDIUM pins (preferences presence/absence, unknown-key pass-through, orphan rescue, runtime-field strip). UAT plan: `docs/UAT_B-043.md` (15 test cases, PASS).
- **Sprint 17 test counts**: baseline 721/721 → sprint close **806/806** (+85 new tests). Zero regressions.

#### §32.16.5 Schema v1 is now frozen

`EXPORT_SCHEMA_VERSION = 1` in `shared/export-schema.js` is shipped and frozen as of Sprint 17 close. The JSON shape documented in §32.5 is the **authoritative B-045 import contract**. Any future change to the shape — field addition, field removal, type change, ordering semantics change — MUST:

1. Bump `EXPORT_SCHEMA_VERSION` to `2` (or higher).
2. Ship a B-045-compatible migration path (importer must accept both `version: 1` and the new version).
3. Be reviewed by [solution-architect] before R3 build begins.

---
