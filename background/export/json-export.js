/**
 * Tab Junkie JSON backup builder — B-043.
 *
 * Consumes a pre-fetched snapshot of items + groups (+ optional preferences)
 * read once by the message handler and produces a pretty-printed UTF-8 JSON
 * string. No I/O, no chrome.* API usage — deterministic given its inputs
 * (except `exportedAt`, which is read from `new Date().toISOString()` so
 * callers may inject a fixed date via the `now` parameter for deterministic
 * byte-compare tests per AC6).
 *
 * The emitted shape is the **authoritative frozen contract** defined in
 * SOLUTION_DESIGN §32.5 and is the import contract B-045 will consume.
 *
 * Exclusion invariants (§32.5.6) enforced here by construction:
 *   - Only `PARTITION_ITEMS`, `PARTITION_GROUPS`, `PARTITION_PREFS` are read.
 *   - No imports from `background/tabs/**` (no live state, no claims, no
 *     drift, no floating groups, no window ordinals).
 *   - Sanitization is an explicit ALLOW-LIST derived from §32.5.2 (Item) and
 *     §32.5.3 (Group). Any field not in the allow-list — including runtime
 *     enrichments (`live`, `active`, `audible`, `drifted`, `tabId`, `windowId`,
 *     `highlight`), tracking hints (`favIconUrl` camelCase), and any future
 *     storage addition — is dropped unconditionally. This is stricter than
 *     the prior deny-list (B-067 Sprint 18 Wave 1, resolving B-043 sec-S-1).
 */

/**
 * §32.5.2 Item allow-list. Exactly these keys may appear on an exported item.
 * `lastAccessedAt` is optional per §32.5.2 — emitted iff `'lastAccessedAt'`
 * is an own-key on the input record (distinguishes "never accessed" absence
 * from "accessed at epoch 0" presence).
 */
const ITEM_ALLOWED_FIELDS = [
  'id', 'title', 'url', 'groupId', 'sortOrder', 'createdAt', 'updatedAt',
];
const ITEM_ALLOWED_OPTIONAL_FIELDS = ['lastAccessedAt'];

/**
 * §32.5.3 Group allow-list. Exactly these keys may appear on an exported group.
 */
const GROUP_ALLOWED_FIELDS = [
  'id', 'name', 'color', 'parentId', 'sortOrder', 'collapsed',
  'createdAt', 'updatedAt',
];

/**
 * Null-first string comparator used by the 3-key sort (§32.5.5).
 * Returns < 0 when a precedes b, > 0 when a follows b, 0 when equal.
 * `null` compares less than any string; two nulls are equal.
 */
function compareNullFirst(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function finiteOrZero(n) {
  return Number.isFinite(n) ? n : 0;
}

function compareItems(a, b) {
  const g = compareNullFirst(a.groupId, b.groupId);
  if (g !== 0) return g;
  const so = finiteOrZero(a.sortOrder) - finiteOrZero(b.sortOrder);
  if (so !== 0) return so;
  return compareNullFirst(String(a.id ?? ''), String(b.id ?? ''));
}

function compareGroups(a, b) {
  const p = compareNullFirst(a.parentId, b.parentId);
  if (p !== 0) return p;
  const so = finiteOrZero(a.sortOrder) - finiteOrZero(b.sortOrder);
  if (so !== 0) return so;
  return compareNullFirst(String(a.id ?? ''), String(b.id ?? ''));
}

/**
 * Shallow-copy a record, emitting ONLY the §32.5.2 Item allow-list keys.
 * Any input key not in the allow-list — runtime enrichments, tracking hints
 * (`favIconUrl` camelCase), future storage additions — is dropped
 * unconditionally. The optional `lastAccessedAt` key is included iff the
 * input record has it as an own-key (B-067 AC1 + §32.5.2).
 */
function sanitizeItem(item) {
  const out = {};
  for (const key of ITEM_ALLOWED_FIELDS) {
    if (key in item) out[key] = item[key];
  }
  for (const key of ITEM_ALLOWED_OPTIONAL_FIELDS) {
    if (key in item) out[key] = item[key];
  }
  return out;
}

/**
 * Shallow-copy a record, emitting ONLY the §32.5.3 Group allow-list keys.
 * Any input key not in the allow-list — including the non-persisted
 * `warning: DUPLICATE_NAME` response-only flag and any runtime decoration —
 * is dropped unconditionally (B-067 AC2 + §32.5.3).
 */
function sanitizeGroup(group) {
  const out = {};
  for (const key of GROUP_ALLOWED_FIELDS) {
    if (key in group) out[key] = group[key];
  }
  return out;
}

/**
 * Build a pretty-printed JSON backup for the given collection snapshot.
 *
 * @param {Object} args
 * @param {Object[]} args.items      Pre-read `tj:items` partition.
 * @param {Object[]} args.groups     Pre-read `tj:groups` partition.
 * @param {Object|null} [args.preferences]
 *        If the user has ever persisted a preferences patch, the caller passes
 *        the raw `tj:prefs` partition here; the key lands in the root. Pass
 *        `null` or omit to suppress the `preferences` field entirely (§32.5.4).
 * @param {number} args.schemaVersion
 *        Integer pulled dynamically from `KNOWN_VERSION` in
 *        `background/storage/migration.js` at the moment of export — per
 *        AC3, hardcoding is a FAIL.
 * @param {Date} [args.now]          Deterministic-test hook for `exportedAt`.
 * @returns {string} Pretty-printed UTF-8 JSON (2-space indent, trailing newline).
 */
export function buildJsonExport({ items, groups, preferences, schemaVersion, now }) {
  const safeItems = Array.isArray(items) ? items : [];
  const safeGroups = Array.isArray(groups) ? groups : [];

  // Build the live-group-ID set so orphan items (groupId references a deleted
  // group) are rescued to Ungrouped (`groupId: null`) — mirrors the B-042
  // rescue logic (Q-H1) and prevents silent data loss on export (AC11).
  const liveGroupIds = new Set();
  for (const g of safeGroups) {
    if (g && typeof g === 'object' && g.id != null) liveGroupIds.add(g.id);
  }

  // Orphan rescue: a group whose `parentId` does not resolve to a live group
  // is re-parented to top-level (`parentId: null`). Documented here rather
  // than in the schema spec because storage's depth/cycle guard makes this
  // path impossible today — it exists defensively for any future schema that
  // loosens the invariant, keeping the JSON export round-trip-safe.
  const sortedItems = safeItems
    .filter((it) => it && typeof it === 'object')
    .map((it) => {
      const sanitized = sanitizeItem(it);
      if (sanitized.groupId != null && !liveGroupIds.has(sanitized.groupId)) {
        sanitized.groupId = null;
      }
      return sanitized;
    })
    .sort(compareItems);

  const sortedGroups = safeGroups
    .filter((g) => g && typeof g === 'object')
    .map((g) => {
      const sanitized = sanitizeGroup(g);
      if (sanitized.parentId != null && !liveGroupIds.has(sanitized.parentId)) {
        sanitized.parentId = null;
      }
      return sanitized;
    })
    .sort(compareGroups);

  const exportedAt = (now instanceof Date ? now : new Date()).toISOString();

  /** @type {Object} */
  const root = {
    schemaVersion,
    exportedAt,
    items: sortedItems,
    groups: sortedGroups,
  };

  // §32.5.4: preferences key is present iff the user has persisted at least
  // one preference — distinguishing "has written `tj:prefs`" from "getPreferences
  // synthesised defaults on read" is the handler's responsibility. When
  // supplied, we emit the value verbatim (forward-compat for unknown keys).
  if (preferences && typeof preferences === 'object') {
    root.preferences = preferences;
  }

  // AC1: 2-space indent + trailing newline. JSON.stringify's 2-arg space param
  // drives the pretty-print; the newline is appended explicitly because
  // stringify never emits one.
  return JSON.stringify(root, null, 2) + '\n';
}
