/**
 * Floating-group persistence and cold-start re-association — public barrel.
 *
 * Floating groups are tabs that were spawned via opener-chain inheritance
 * (B-013) or demoted from a saved item (MSG_DEMOTE_ITEM). Their window
 * position and URL are persisted to tj:floatingGroups in storage.local so
 * they survive browser restarts (B-018 AC7/AC12).
 *
 * B-176 (§74 A2) — this file was a ~1344-line monolith with 8 jobs; it is
 * now a THIN RE-EXPORT BARREL so every existing
 * `import { … } from './floating-groups.js'` keeps working unchanged. The
 * implementations live in cohesive sibling modules:
 *
 *   - `floating-groups-schema.js`     — record field-reading (`getParentItemId`)
 *   - `floating-groups-mutations.js`  — seed / append / reorder / move writes
 *   - `floating-groups-prune.js`      — prune variants + onReplaced liveTabId remap
 *   - `floating-groups-reconcile.js`  — cold-start re-association
 *   - `floating-groups-render.js`     — cold-start renderOrder bootstrap + preMark
 *
 * B-121 (§60.4) — schema v2: each record carries a synthetic `floatingTabId`
 * (ulid) as its storage identity, plus the parent saved item's id under
 * `parentItemId`. Pre-S38 records used `itemId` instead of `parentItemId`
 * and lacked `floatingTabId`; both schemas are tolerated on read.
 *
 * Cold-start re-association (B-121 §60.4.3): position match (windowId +
 * tabIndex) first, URL fallback second. Records whose matched tab is
 * already claimed by reconcileClaims are pruned (the tab has been promoted
 * since shutdown). Records whose matched tab is NOT claimed are LEFT IN
 * PLACE — runtime visibility is delivered by buildFloatingMembers on the
 * next MSG_LIST_ITEMS dispatch. Records with no matching live tab are
 * also left in place per AC9 (the tab may reopen on a future restart).
 */

export { getParentItemId } from './floating-groups-schema.js';

export {
  saveFloatingGroups,
  appendFloatingGroup,
  reorderFloatingMembers,
  moveFloatingTab,
} from './floating-groups-mutations.js';

export {
  pruneResolvedFloatingGroups,
  pruneFloatingGroupsByParentItemId,
  pruneFloatingGroupsByLiveTabId,
  remapFloatingGroupsLiveTabId,
} from './floating-groups-prune.js';

export { reassociateFloatingGroups } from './floating-groups-reconcile.js';

export {
  preMarkInheritedFromFloatingGroups,
  bootstrapAndSweepRenderOrder,
} from './floating-groups-render.js';
