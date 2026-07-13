/**
 * shared/render-order.js — pure resolver for B-148 interleaved render order.
 *
 * Authoritative spec: docs/superpowers/specs/2026-05-03-interleave-render-
 * order-design.md §3.4.
 *
 * Pure function: no chrome.* calls, no storage reads, no side effects.
 * Caller pre-filters items + floatingMembers to the target group; resolver
 * trusts the inputs.
 *
 * Returns an ordered array of `{ kind, ref, item?, floatingMember? }`
 * descriptors. The render-path renders in this order.
 *
 * Bootstrap path (renderOrder missing or empty): produce the saved-then-
 * floating fallback by Item.sortOrder asc, then FloatingGroup.sortOrder asc.
 * Caller is responsible for persisting the bootstrapped value back via
 * updateGroup({renderOrder: ...}) so the next call sees the persisted form.
 *
 * Stale-ref handling: refs that don't resolve to any item or floating
 * member are filtered silently (rendered as nothing). The cold-start sweep
 * at reassociateFloatingGroups (Task 11) strips stale refs from disk.
 *
 * @typedef {Object} RenderRow
 * @property {'item'|'floating'} kind
 * @property {string} ref         — `item:<id>` or `floating:<floatingTabId>`
 * @property {Object} [item]      — populated when kind === 'item'
 * @property {Object} [floatingMember] — populated when kind === 'floating'
 */

const PREFIX_ITEM = 'item:';
const PREFIX_FLOATING = 'floating:';

/**
 * @param {{ id: string, renderOrder?: string[] }} group
 * @param {Array<{ id: string, sortOrder: number }>} groupItems
 * @param {Array<{ floatingTabId: string, sortOrder: number }>} groupFloatingMembers
 * @returns {RenderRow[]}
 */
export function resolveRenderOrder(group, groupItems, groupFloatingMembers) {
  const itemById = new Map();
  for (const it of groupItems) itemById.set(it.id, it);
  const floatingById = new Map();
  for (const fm of groupFloatingMembers) floatingById.set(fm.floatingTabId, fm);

  const renderOrder = Array.isArray(group?.renderOrder) ? group.renderOrder : null;
  if (renderOrder && renderOrder.length > 0) {
    const out = [];
    for (const ref of renderOrder) {
      if (typeof ref !== 'string') continue;
      if (ref.startsWith(PREFIX_ITEM)) {
        const id = ref.slice(PREFIX_ITEM.length);
        const item = itemById.get(id);
        if (item) out.push({ kind: 'item', ref, item });
      } else if (ref.startsWith(PREFIX_FLOATING)) {
        const id = ref.slice(PREFIX_FLOATING.length);
        const floatingMember = floatingById.get(id);
        if (floatingMember) out.push({ kind: 'floating', ref, floatingMember });
      }
    }
    return out;
  }

  /* Bootstrap fallback — saved-then-floating, each by sortOrder asc. */
  const out = [];
  const sortedItems = [...groupItems].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const it of sortedItems) {
    out.push({ kind: 'item', ref: PREFIX_ITEM + it.id, item: it });
  }
  const sortedFm = [...groupFloatingMembers].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const fm of sortedFm) {
    out.push({ kind: 'floating', ref: PREFIX_FLOATING + fm.floatingTabId, floatingMember: fm });
  }
  return out;
}

/**
 * B-196 §79.3.3 — derive the runtime `__toplevel__` renderOrder owner (pure).
 *
 * The top-level catch-all region is NOT a persisted group record, so it has no
 * stored `Group.renderOrder`. This builder produces one at render time: walk the
 * saved-ungrouped head items in `sortOrder` order and, after each item, splice
 * its top-level floating children (matched by `parentItemId`, ordered by their
 * own `sortOrder`) immediately after it. The resulting `item:`/`floating:` ref
 * list is fed VERBATIM to `resolveRenderOrder` (non-empty-renderOrder branch) so
 * the region participates in the SAME render contract as named groups — no new
 * storage, no schema bump. Before B-197 lands the floating bucket is always
 * empty, so the derived order is exactly the head items by `sortOrder`
 * (byte-for-byte the former `__ungrouped__` ordering).
 *
 * Shared (B-196 fix-round F-1) so the sidepanel full-render path, the sidepanel
 * incremental floating-patch path, AND the newtab head render all resolve the
 * sentinel owner from a single source (§79.5.2 R-4 / code M-2 / qa M-1).
 *
 * Pure: no DOM, no chrome.* calls, no side effects.
 *
 * @param {Array<{ id: string, sortOrder?: number }>} headItems
 * @param {Array<{ floatingTabId: string, parentItemId?: string, sortOrder?: number }>} headFloating
 * @returns {string[]} ordered `item:`/`floating:` ref list
 */
export function deriveTopLevelRenderOrder(headItems, headFloating) {
  const items = Array.isArray(headItems) ? headItems : [];
  const floating = Array.isArray(headFloating) ? headFloating : [];
  const sortedItems = [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const childrenByParent = new Map();
  for (const fm of floating) {
    if (!fm || typeof fm.floatingTabId !== 'string') continue;
    const pid = typeof fm.parentItemId === 'string' ? fm.parentItemId : '';
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid).push(fm);
  }
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }
  const refs = [];
  for (const it of sortedItems) {
    refs.push(PREFIX_ITEM + it.id);
    const kids = childrenByParent.get(it.id);
    if (kids) for (const fm of kids) refs.push(PREFIX_FLOATING + fm.floatingTabId);
  }
  return refs;
}

/**
 * B-188 §77 (RP-B fix) — pure insert-index decision for the INCREMENTAL
 * sidepanel floating-row patch path (patchFloatingMembersSections).
 *
 * The full render path lays rows out by `resolveRenderOrder`. When a NEW
 * floating row arrives via the incremental path, it must land at the SAME
 * slot that path would give it — its position in `Group.renderOrder` —
 * instead of the bottom `staticAnchor` (the B-184 defect). This helper
 * answers "which currently-present ref must the new row be inserted BEFORE"
 * so the incremental DOM can never disagree with the full render.
 *
 * Algorithm: find `newRef` in `renderOrder`, then return the FIRST ref after
 * it that is currently present (the new row goes immediately before that
 * node). Successors that aren't present yet are skipped — the new row lands
 * before the nearest later sibling that actually exists. Returns `null` when:
 *   - `renderOrder` is missing/empty (the bootstrap path owns ordering),
 *   - `newRef` isn't in `renderOrder` (legacy / unsynced record), or
 *   - no later ref is present (append at the static anchor).
 * `null` means "append at the static anchor" — never worse than the old
 * unconditional-bottom behavior.
 *
 * `presentRefs` is any object exposing `.has(ref)` — a Set OR a Map keyed by
 * ref (the sidepanel passes a Map<ref, DOMNode> so it can map the result back
 * to a node without a second query). The decision is pure and order-of-arrival
 * independent: inserting multiple new rows one at a time converges to
 * `renderOrder` regardless of processing order.
 *
 * @param {string[]|null|undefined} renderOrder — the group's canonical ref list
 * @param {string} newRef — `floating:<floatingTabId>` (or `item:<id>`) to place
 * @param {{ has: (ref: string) => boolean }} presentRefs — refs currently rendered
 * @returns {string|null} the ref to insert BEFORE, or null to append
 */
export function resolveInsertBeforeRef(renderOrder, newRef, presentRefs) {
  if (!Array.isArray(renderOrder) || renderOrder.length === 0) return null;
  if (!presentRefs || typeof presentRefs.has !== 'function') return null;
  const k = renderOrder.indexOf(newRef);
  if (k === -1) return null;
  for (let i = k + 1; i < renderOrder.length; i++) {
    const ref = renderOrder[i];
    if (presentRefs.has(ref)) return ref;
  }
  return null;
}
