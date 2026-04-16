import { MSG_STATE_CHANGED } from '../shared/messages.js';
import { isClaimsReady } from './tabs/tab-claims.js';

export const SCOPE = Object.freeze({
  ITEMS: 'items',
  GROUPS: 'groups',
  PREFERENCES: 'preferences',
  LIVE_STATE: 'liveState',
});

export function broadcast(scope, trigger, opts = {}) {
  if (opts.requireClaimsReady && !isClaimsReady()) return;
  console.warn('[tab-junkie:broadcast] firing:', scope, trigger);
  chrome.runtime.sendMessage({ type: MSG_STATE_CHANGED, payload: { scope, trigger } }).catch((err) => {
    console.warn('[tab-junkie:broadcast] sendMessage failed:', err?.message);
  });
}
