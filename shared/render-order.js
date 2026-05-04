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
