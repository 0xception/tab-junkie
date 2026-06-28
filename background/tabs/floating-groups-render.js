/**
 * Floating-group cold-start render-order bootstrap + inherited pre-mark.
 *
 * The cold-start render slice of the floating-groups subsystem (B-176 §74 A2
 * split). Both exports run once per cold start, after reassociation:
 *
 * - `preMarkInheritedFromFloatingGroups` — pure read+mark (writes ZERO
 *   storage). Marks live tabs whose floating record resolves so
 *   reconcileClaims Phase 2 skips the URL-collision auto-claim (B-132 §65.4).
 * - `bootstrapAndSweepRenderOrder` — bootstraps missing/empty Group
 *   `renderOrder` from items + floating records and sweeps stale refs
 *   (B-148 §3.6).
 */

import { writeTransaction } from '../storage/write-transaction.js';
import { readPartition, PARTITION_FLOATING_GROUPS, PARTITION_GROUPS, PARTITION_ITEMS } from '../storage/partitions.js';
import { getLiveTabIndex } from './live-tab-index.js';
import { markInherited, getClaimsMirror } from './tab-claims.js';
import { resolveRecordToTab } from './tab-item-resolver.js';

/**
 * B-132 §65.4: cold-start re-population of inheritedTabs from
 * tj:floatingGroups. For every record whose match resolves AND whose
 * matched tabId is NOT already claimed, call markInherited(matchedTabId)
 * so reconcileClaims Phase 2 (background/tabs/tab-claims.js:169-178) skips
 * the URL-collision auto-claim. Mirrors the B-125 (§59.3) gate at
 * background/tabs/tab-claims.js:250 — runtime path — extended into the
 * cold-start claim path.
 *
 * Pure read+mark — writes ZERO storage. The mark on the module-scoped
 * `inheritedTabs` Set in tab-claims.js is the sole side effect.
 *
 * Algorithm (mirrors reassociateFloatingGroups §60.4.3):
 *   1. Read tj:floatingGroups records.
 *   2. POSITION MATCH per record: find live tab where windowId AND
 *      tabIndex match.
 *   3. URL FALLBACK if no position match: find live tab whose
 *      normalized URL equals the record's normalized URL.
 *   4. If matched AND matchedTabId NOT in claimsMirror.values(): call
 *      markInherited(matchedTabId).
 *   5. If matched AND already claimed: SKIP (reconcileClaims Phase 1
 *      preserved the claim; reassociateFloatingGroups will prune the
 *      now-stale record at floating-groups.js:145-153).
 *   6. If unmatched: SKIP (no live tab to mark).
 *
 * Invariant: this helper MUST run after buildLiveTabIndex resolves and
 * BEFORE reconcileClaims executes. See background/tabs/index.js for the
 * call-site ordering (between the Promise.all and reconcileClaims).
 *
 * B-132 §65.7 AC3 carve-out: this helper marks live tabs whose
 * tj:floatingGroups record resolves. It does NOT reconstruct pre-reload
 * opener-chain relationships (openerMap is ephemeral —
 * background/tabs/opener-chain.js:6-9 documents this as Chrome's own
 * contract). A NEW middle-click inside a former-floating tab post-reload
 * thus creates a new tab whose opener-walk returns null and which lives
 * in Open Tabs. This is the AC3 known-acceptable degradation; the user's
 * recourse is to re-spawn from the bookmarked parent.
 *
 * @returns {Promise<void>}
 */
export async function preMarkInheritedFromFloatingGroups() {
  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  if (!Array.isArray(records) || records.length === 0) return;

  const liveTabIndex = getLiveTabIndex();
  const claimsMirror = getClaimsMirror();
  const claimedTabIds = new Set(Object.values(claimsMirror));

  for (const record of records) {
    if (!record || typeof record !== 'object') continue;

    /* preMark resolves via the shared resolver (B-175 §74) with two
       site-specific flags:
         • useDirectTier: false — preMark predates the B-137 v4 `liveTabId`
           join key and marks by position/URL ONLY (it never consulted a
           direct tabId tier).
         • corroborateUrlOnPosition: true — the B-132 fix (S45 post-UAT
           2026-05-22). A stale record's `(windowId, tabIndex)` could
           coincidentally match an unrelated tab that drifted into the slot;
           the falsely-marked tab was then skipped by the inheritedTabs guards
           in reconcile Phase 2 + Phase 3, breaking the B-163 relief. Requiring
           URL corroboration on the position hit rejects that false positive;
           the URL-fallback tier may still match by URL alone. Records without
           `url` fall through to position-only matching (backward-compatible).
       `excludeClaimedTabIds` makes a record resolving to an already-claimed
       tab report as no-match, so only matched + unclaimed candidates are
       marked — the already-claimed case is the reassociateFloatingGroups
       prune-target (§60.4.3 step 3).

       NOTE (B-175 M-2): at cold start, preMark runs BEFORE reconcileClaims, so
       `claimsMirror` (and thus `claimedTabIds`) is ALWAYS empty here — the flag
       is an intentional no-op at this call site, carried only for semantic
       symmetry with the pre-B-175 inline code (which threaded the same
       claimed-tab guard). It earns its keep if preMark is ever invoked after a
       claims-bearing phase; keeping it documents the resolver contract. */
    const matchedTabId = resolveRecordToTab(record, liveTabIndex, {
      useDirectTier: false,
      corroborateUrlOnPosition: true,
      excludeClaimedTabIds: claimedTabIds,
    });
    if (matchedTabId !== null) {
      markInherited(matchedTabId);
    }
  }
}

/**
 * B-148 §3.6 (S44, v6→v7) — cold-start bootstrap + sweep of Group.renderOrder.
 *
 * Runs after reassociateFloatingGroups so the floating-group records are
 * already reconciled (resolved records pruned, stale liveTabIds rewritten,
 * duplicates merged). For each group:
 *
 * - Missing or empty renderOrder → bootstrap from items + floating-records
 *   sortOrder (saved-then-floating, each by sortOrder asc).
 * - Present renderOrder → filter out refs that don't resolve to any item
 *   or floating record (stale-ref sweep).
 *
 * Single PARTITION_GROUPS writeTransaction. Skips the write entirely when
 * no group changed (avoids storage churn on repeat cold starts where every
 * group is already bootstrapped + clean).
 *
 * @returns {Promise<void>}
 */
export async function bootstrapAndSweepRenderOrder() {
  /* Read items + floating records OUTSIDE the writeTransaction — those
     partitions aren't being mutated by this call, so a snapshot read is
     safe and minor staleness reconciles on the next sweep cycle. The
     CRITICAL race is the groups partition which we're about to write —
     that read MUST happen inside the mutator to use the writeTransaction's
     current snapshot (S44 R4 [code-reviewer] HIGH finding #1; pre-fix the
     derivation ran outside the transaction then committed via
     `mutator: () => updatedGroups`, a blind replace that clobbered any
     concurrent group write landing in the narrow cold-start window
     between readyPromise resolving and the first user gesture). */
  const [items, floatingRecords] = await Promise.all([
    readPartition(PARTITION_ITEMS),
    readPartition(PARTITION_FLOATING_GROUPS),
  ]);

  /* Pre-index items + floating records by groupId for O(N) total work.
     MEDIUM fix (S44 R4 finding #2): defensive filter against pre-S38
     legacy floating records that lack a floatingTabId — without this the
     bootstrap path emits the literal ref 'floating:undefined' which the
     shape validator accepts but the resolver silently filters on render. */
  const itemsByGroup = new Map();
  if (Array.isArray(items)) {
    for (const it of items) {
      if (!it || typeof it.groupId !== 'string') continue;
      if (!itemsByGroup.has(it.groupId)) itemsByGroup.set(it.groupId, []);
      itemsByGroup.get(it.groupId).push(it);
    }
  }
  const floatingByGroup = new Map();
  if (Array.isArray(floatingRecords)) {
    for (const fr of floatingRecords) {
      if (!fr || typeof fr.groupId !== 'string') continue;
      if (typeof fr.floatingTabId !== 'string' || fr.floatingTabId.length === 0) continue;
      if (!floatingByGroup.has(fr.groupId)) floatingByGroup.set(fr.groupId, []);
      floatingByGroup.get(fr.groupId).push(fr);
    }
  }

  /* Build per-group resolution sets for the stale-ref sweep. */
  const itemIdsByGroup = new Map();
  for (const [gid, arr] of itemsByGroup) {
    itemIdsByGroup.set(gid, new Set(arr.map((it) => it.id)));
  }
  const floatingIdsByGroup = new Map();
  for (const [gid, arr] of floatingByGroup) {
    floatingIdsByGroup.set(gid, new Set(arr.map((fr) => fr.floatingTabId)));
  }

  await writeTransaction([
    {
      partition: PARTITION_GROUPS,
      mutator: (currentGroups) => {
        if (!Array.isArray(currentGroups) || currentGroups.length === 0) {
          return currentGroups;
        }

        let anyChanged = false;
        const updatedGroups = currentGroups.map((g) => {
          if (!g || typeof g.id !== 'string') return g;
          const groupItems = itemsByGroup.get(g.id) || [];
          const groupFloating = floatingByGroup.get(g.id) || [];
          const itemIds = itemIdsByGroup.get(g.id) || new Set();
          const floatingIds = floatingIdsByGroup.get(g.id) || new Set();

          let nextRenderOrder;
          if (!Array.isArray(g.renderOrder) || g.renderOrder.length === 0) {
            /* Bootstrap path. */
            const sortedItems = [...groupItems].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
            const sortedFloating = [...groupFloating].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
            nextRenderOrder = [
              ...sortedItems.map((it) => 'item:' + it.id),
              ...sortedFloating.map((fr) => 'floating:' + fr.floatingTabId),
            ];
          } else {
            /* Sweep path — keep refs that resolve. */
            nextRenderOrder = g.renderOrder.filter((ref) => {
              if (typeof ref !== 'string') return false;
              if (ref.startsWith('item:')) {
                return itemIds.has(ref.slice('item:'.length));
              }
              if (ref.startsWith('floating:')) {
                return floatingIds.has(ref.slice('floating:'.length));
              }
              return false;
            });
          }

          /* Same array content → no change. */
          const before = Array.isArray(g.renderOrder) ? g.renderOrder : null;
          const sameLength = before && before.length === nextRenderOrder.length;
          const sameContent = sameLength && before.every((v, i) => v === nextRenderOrder[i]);
          if (sameContent) return g;
          anyChanged = true;
          return { ...g, renderOrder: nextRenderOrder, updatedAt: Date.now() };
        });

        /* No-op when nothing changed — return the snapshot unmodified so
           writeTransaction can short-circuit the write (avoids storage
           churn on repeat cold starts where every group is already
           bootstrapped + clean). */
        if (!anyChanged) return currentGroups;
        return updatedGroups;
      },
    },
  ]);
}
