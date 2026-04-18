import { MSG_STATE_CHANGED } from '../shared/messages.js';
import { isClaimsReady } from './tabs/tab-claims.js';
import { SCOPE } from '../shared/scopes.js';

/* B-014 M-1: SCOPE is defined in `shared/scopes.js` so sidepanel / newtab /
   popup can import it without reaching into `background/`. Re-export here so
   existing background callers (`import { SCOPE } from './broadcast.js'`)
   continue to work unchanged. */
export { SCOPE };

export function broadcast(scope, trigger, opts = {}) {
  if (opts.requireClaimsReady && !isClaimsReady()) return;
  chrome.runtime.sendMessage({ type: MSG_STATE_CHANGED, payload: { scope, trigger } }).catch((err) => {
    console.warn('[tab-junkie:broadcast] sendMessage failed:', err?.message);
  });
}
