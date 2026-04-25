/**
 * settings/settings-import-export.js — B-093 Wave 1.
 *
 * Hosts the four Import / Export controls relocated from the sidepanel
 * header into the Settings page Data section. The SW message contracts
 * (`MSG_EXPORT_COLLECTION` / `MSG_IMPORT_COLLECTION`) are unchanged; only
 * the host surface moved. Behaviour is byte-identical to the prior
 * sidepanel-hosted handlers — including:
 *
 *   - the §33.10 5 MiB pre-dispatch oversize guard
 *   - the §33.4 preview → confirm → commit two-round-trip flow
 *   - the B-070 §AC4 destructive-action confirmation dialog (RETAINED)
 *   - the B-070 R4 F-1 prefs-only confirmation variant
 *   - the B-060 "Import duplicates anyway" checkbox + preference persist
 *   - the B-080 plain-language repair breakdown
 *   - the AC11/AC13 privacy guarantee — never log titles/URLs/file content
 *
 * Inputs:
 *   init({ doc, sendMessage })
 *     doc          — the document for the settings page (production: window.document)
 *     sendMessage  — promise wrapper around chrome.runtime.sendMessage; same
 *                    signature as settings/settings.js so the two modules share
 *                    one transport.
 *
 * The SW dialog overlay + toast DOM elements live in settings/settings.html —
 * see `#settings-dialog-overlay`, `#settings-confirm-dialog`, `#settings-toast`.
 */

import { MSG_EXPORT_COLLECTION, MSG_IMPORT_COLLECTION, MSG_GET_PREFERENCES, MSG_SET_PREFERENCES } from '../shared/messages.js';

/* §33.10 oversize guard upper bound — pre-read reject. */
const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

/* Module state — the page is single-document, single-tab, so module-level
   state is safe (no cross-tab pollution). Settings page tab close GCs the
   realm, no explicit teardown needed. */
let _doc = null;
let _sendMessage = null;
let _importInFlight = false;
let _toastTimer = null;
let _pendingConfirmCallback = null;
let _dialogTriggerEl = null;

/* M-1: tracks (event, flag) keys for non-element targets (e.g. document)
   that have no `dataset`. Cleared by _internal.reset() for test isolation. */
const _wireOnceSet = new Set();

/* DOM refs — populated by `_resolveDom` on init. */
let exportHtmlBtnEl = null;
let exportJsonBtnEl = null;
let importHtmlBtnEl = null;
let importJsonBtnEl = null;
let importFileInputEl = null;
let importJsonFileInputEl = null;
let dialogOverlayEl = null;
let confirmDialogEl = null;
let confirmHeadingEl = null;
let confirmBodyEl = null;
let confirmCancelBtnEl = null;
let confirmDeleteBtnEl = null;
let toastEl = null;
let toastMessageEl = null;
let toastDismissEl = null;

/* =========================================================================
   Toast — lives in `#settings-toast`. Mirrors the B-049 sidepanel contract:
   one toast at a time, 4-second auto-dismiss, manual × dismiss button.
   ========================================================================= */

function showToast(message) {
  if (!toastEl || !toastMessageEl) return;
  clearTimeout(_toastTimer);
  toastMessageEl.textContent = message;
  toastEl.hidden = false;
  _toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4000);
}

/* =========================================================================
   Confirm-dialog primitive — focus trap + open/close. Forked verbatim from
   the sidepanel pattern (§33.4 Q-2) but scoped to the settings overlay so
   we don't entangle with the sidepanel's `#dialog-overlay`.
   ========================================================================= */

function _activateFocusTrap(activeDialogEl) {
  if (!_doc) return;
  for (const child of _doc.body.children) {
    if (child !== dialogOverlayEl) child.setAttribute('inert', '');
  }
  for (const child of dialogOverlayEl.children) {
    if (child !== activeDialogEl) child.setAttribute('inert', '');
  }
}

function _deactivateFocusTrap() {
  if (!_doc) return;
  for (const child of _doc.body.children) child.removeAttribute('inert');
  if (dialogOverlayEl) {
    for (const child of dialogOverlayEl.children) child.removeAttribute('inert');
  }
}

function _closeDialog() {
  if (!dialogOverlayEl) return;
  dialogOverlayEl.hidden = true;
  dialogOverlayEl.setAttribute('aria-hidden', 'true');
  if (confirmDialogEl) confirmDialogEl.hidden = true;
  _deactivateFocusTrap();
  _pendingConfirmCallback = null;
  /* M-2: clear in-flight flag when dialog closes via cancel/overlay/Escape.
     On confirm, _commitImport re-sets the flag immediately and clears it in
     its own finally, so clearing here is safe for both code paths. */
  _setImportInFlight(false);
  if (_dialogTriggerEl) {
    if (typeof _dialogTriggerEl.focus === 'function') _dialogTriggerEl.focus();
    _dialogTriggerEl = null;
  }
}

/* =========================================================================
   Export — B-042 (HTML), B-043 (JSON). Pure relocation: the SW handlers are
   untouched. The blob-download helper still lives client-side because the
   MV3 service worker has no `URL.createObjectURL`.
   ========================================================================= */

function _triggerBlobDownload(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = _doc.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  _doc.body.appendChild(a);
  try {
    a.click();
  } finally {
    _doc.body.removeChild(a);
    /* Defer revoke until after the click tail has handed the blob to the
       browser's download pipeline. */
    queueMicrotask(() => URL.revokeObjectURL(url));
  }
}

function _exportErrorToast(code) {
  switch (code) {
    case 'ERR_NOT_READY':
      return 'Export failed \u2014 extension is still starting, try again in a moment';
    case 'ERR_SAFE_MODE':
      return 'Export failed \u2014 read-only mode';
    case 'ERR_VALIDATION':
      return 'Export failed \u2014 invalid request';
    default:
      return 'Export failed \u2014 try again';
  }
}

async function _exportCollectionAsHtml() {
  try {
    const data = await _sendMessage(MSG_EXPORT_COLLECTION, { format: 'html' });
    _triggerBlobDownload(data.filename, data.mimeType, data.content);
    const itemCount = data.itemCount;
    const groupCount = data.groupCount;
    /* B-042 AC7 literal copy. */
    showToast(
      'Exported ' + itemCount + ' bookmark' + (itemCount === 1 ? '' : 's')
      + ' across ' + groupCount + ' group' + (groupCount === 1 ? '' : 's'),
    );
  } catch (err) {
    /* AC11 privacy: titles/URLs are never logged — code only. */
    const code = err && err.code ? String(err.code) : 'ERR_UNKNOWN';
    console.warn('export failed:', code);
    showToast(_exportErrorToast(code));
  }
}

async function _exportCollectionAsJson() {
  try {
    const data = await _sendMessage(MSG_EXPORT_COLLECTION, { format: 'json' });
    _triggerBlobDownload(data.filename, data.mimeType, data.content);
    /* B-043 AC10 literal copy. Filename is system-generated. */
    showToast('Backup exported: ' + data.filename);
  } catch (err) {
    const code = err && err.code ? String(err.code) : 'ERR_UNKNOWN';
    console.warn('export failed:', code);
    showToast(_exportErrorToast(code));
  }
}

/* =========================================================================
   Import — B-044 (HTML), B-045 (JSON). The two-round-trip flow (§33.4)
   is preserved verbatim: pre-dispatch preview (zero storage mutation) →
   confirm dialog (B-070 §AC4 RETAINED) → commit on confirm.
   ========================================================================= */

function _setImportInFlight(inFlight) {
  _importInFlight = inFlight;
  if (importHtmlBtnEl) {
    importHtmlBtnEl.disabled = inFlight;
    if (inFlight) {
      importHtmlBtnEl.setAttribute('aria-busy', 'true');
    } else {
      importHtmlBtnEl.removeAttribute('aria-busy');
    }
  }
  if (importJsonBtnEl) {
    importJsonBtnEl.disabled = inFlight;
    if (inFlight) {
      importJsonBtnEl.setAttribute('aria-busy', 'true');
    } else {
      importJsonBtnEl.removeAttribute('aria-busy');
    }
  }
}

function _importErrorToast(code, format) {
  switch (code) {
    case 'ERR_INVALID_FORMAT':
      return format === 'json'
        ? 'Backup file is malformed and cannot be imported'
        : 'Not a valid Netscape bookmarks file';
    case 'ERR_EMPTY_FILE':
      return 'File is empty';
    case 'ERR_MALFORMED_ROOT':
      return 'Backup file is malformed and cannot be imported';
    case 'ERR_UNKNOWN_SCHEMA_VERSION':
      return 'Backup was created in a newer version. Please update Tab Junkie before importing.';
    case 'ERR_UNREPAIRABLE':
      return 'Backup file contains unrecoverable errors';
    case 'ERR_QUOTA_EXCEEDED':
      return 'Import failed: not enough storage space. Delete items and try again.';
    case 'ERR_SAFE_MODE':
      return 'Cannot import while in safe mode. Please update Tab Junkie.';
    case 'ERR_VALIDATION':
      return 'Import failed: invalid request';
    default:
      return 'Import failed: invalid file format';
  }
}

function _sumRepairs(repairs) {
  if (!repairs || typeof repairs !== 'object') return 0;
  return (repairs.orphanedGroups || 0)
    + (repairs.cyclesBroken || 0)
    + (repairs.duplicateIds || 0)
    + (repairs.orphanedItems || 0)
    + (repairs.duplicateUrls || 0);
}

function _plainLanguageRepairParts(repairs) {
  if (!repairs || typeof repairs !== 'object') return [];
  const parts = [];
  if (repairs.orphanedGroups > 0) {
    parts.push(repairs.orphanedGroups + ' group'
      + (repairs.orphanedGroups === 1 ? '' : 's')
      + ' had missing parents, moved to the top level');
  }
  if (repairs.cyclesBroken > 0) {
    parts.push(repairs.cyclesBroken + ' group loop'
      + (repairs.cyclesBroken === 1 ? '' : 's') + ' fixed');
  }
  if (repairs.duplicateIds > 0) {
    parts.push(repairs.duplicateIds + ' duplicate group/item ID'
      + (repairs.duplicateIds === 1 ? '' : 's') + ' renumbered');
  }
  if (repairs.orphanedItems > 0) {
    parts.push(repairs.orphanedItems + ' item'
      + (repairs.orphanedItems === 1 ? '' : 's')
      + ' with no group moved to Ungrouped');
  }
  return parts;
}

/* B-070 AC1 — detect a populated `preferences` object in a JSON backup. */
function _hasPopulatedPreferences(content) {
  if (typeof content !== 'string' || content.length === 0) return false;
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const prefs = parsed.preferences;
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return false;
  return Object.keys(prefs).length > 0;
}

function _buildImportPreviewBody(counts, filename, format, opts) {
  const { itemsImported, groupsImported, duplicatesSkipped = 0, skipped = 0, repairs } = counts;
  const isJson = format === 'json';
  const includeDupToggle = !!(opts && opts.includeDupToggle);
  const dupSkipDefault = !(opts && opts.dupToggleDefault === false);
  const frag = _doc.createDocumentFragment();
  const line1 = _doc.createElement('span');
  const itemNoun = isJson
    ? (itemsImported === 1 ? 'item' : 'items')
    : (itemsImported === 1 ? 'bookmark' : 'bookmarks');
  const groupNoun = isJson
    ? (groupsImported === 1 ? 'group' : 'groups')
    : (groupsImported === 1 ? 'folder' : 'folders');
  line1.textContent =
    'Import ' + itemsImported + ' ' + itemNoun
    + ' in ' + groupsImported + ' ' + groupNoun
    + (filename ? ' from ' + filename : '') + '. ';
  frag.appendChild(line1);
  const strong = _doc.createElement('strong');
  strong.className = 'import-replace-emphasis';
  strong.textContent = 'This will REPLACE all existing bookmarks and groups.';
  frag.appendChild(strong);
  const line2 = _doc.createElement('span');
  line2.textContent = ' Continue?';
  frag.appendChild(line2);
  if (skipped > 0) {
    const extra = _doc.createElement('span');
    extra.className = 'import-extra-line';
    extra.textContent = ' ' + skipped + ' malformed entr'
      + (skipped === 1 ? 'y' : 'ies') + ' will be skipped.';
    frag.appendChild(extra);
  }
  if (duplicatesSkipped > 0) {
    const dup = _doc.createElement('span');
    dup.className = 'import-extra-line';
    dup.textContent = ' ' + duplicatesSkipped + ' item'
      + (duplicatesSkipped === 1 ? '' : 's')
      + ' have duplicate URLs.';
    frag.appendChild(dup);
  }
  if (isJson && repairs) {
    const parts = _plainLanguageRepairParts(repairs);
    if (repairs.preferencesSkipped) {
      parts.push('preferences skipped (invalid shape)');
    }
    if (parts.length > 0) {
      const rep = _doc.createElement('span');
      rep.className = 'import-extra-line import-repair-line';
      rep.textContent = ' Repairs: ' + parts.join(', ') + '.';
      frag.appendChild(rep);
    }
  }
  if (includeDupToggle) {
    const row = _doc.createElement('span');
    row.className = 'import-extra-line import-dup-toggle';
    const label = _doc.createElement('label');
    label.className = 'import-dup-toggle__label';
    const checkbox = _doc.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'settings-import-dup-checkbox';
    checkbox.className = 'import-dup-toggle__input';
    checkbox.checked = !dupSkipDefault;
    checkbox.setAttribute('aria-describedby', 'settings-import-dup-checkbox-help');
    label.appendChild(checkbox);
    const labelText = _doc.createElement('span');
    labelText.className = 'import-dup-toggle__label-text';
    labelText.textContent = ' Import duplicates anyway';
    label.appendChild(labelText);
    row.appendChild(label);
    const help = _doc.createElement('span');
    help.id = 'settings-import-dup-checkbox-help';
    help.className = 'import-dup-toggle__help';
    help.textContent = 'By default, items with URLs that already exist in'
      + ' this file are skipped. Check this to import them anyway.';
    row.appendChild(help);
    frag.appendChild(row);
  }
  return frag;
}

function _buildPrefsOnlyImportBody(filename) {
  const frag = _doc.createDocumentFragment();
  const line1 = _doc.createElement('span');
  line1.textContent = 'This backup contains only preferences (0 items, 0 groups)'
    + (filename ? ' from ' + filename : '') + '. Importing will ';
  frag.appendChild(line1);
  const strong = _doc.createElement('strong');
  strong.className = 'import-replace-emphasis';
  strong.textContent = 'REPLACE';
  frag.appendChild(strong);
  const line2 = _doc.createElement('span');
  line2.textContent = ' all your existing bookmarks and groups with an empty'
    + ' collection. Your preferences will be updated. Continue?';
  frag.appendChild(line2);
  return frag;
}

function _openImportPreviewDialog(
  { counts, filename, onConfirm, triggerEl, format, prefsOnly, skipDuplicatesDefault },
) {
  if (!confirmDialogEl) return;
  _pendingConfirmCallback = onConfirm;
  _dialogTriggerEl = triggerEl || null;
  if (prefsOnly === true) {
    confirmHeadingEl.textContent = 'Import preferences-only backup?';
    confirmBodyEl.replaceChildren();
    confirmBodyEl.appendChild(_buildPrefsOnlyImportBody(filename));
    confirmDeleteBtnEl.textContent = 'Replace and apply preferences';
  } else {
    confirmHeadingEl.textContent = format === 'json'
      ? 'Replace all data?'
      : 'Replace all bookmarks?';
    confirmBodyEl.replaceChildren();
    confirmBodyEl.appendChild(_buildImportPreviewBody(counts, filename, format, {
      includeDupToggle: true,
      dupToggleDefault: skipDuplicatesDefault !== false,
    }));
    confirmDeleteBtnEl.textContent = format === 'json' ? 'Replace and import' : 'Replace all';
  }
  confirmDeleteBtnEl.dataset.variant = 'destructive';
  confirmDialogEl.hidden = false;
  dialogOverlayEl.hidden = false;
  dialogOverlayEl.removeAttribute('aria-hidden');
  _activateFocusTrap(confirmDialogEl);
  /* B-044 AC5: Cancel default-focused. */
  if (typeof confirmCancelBtnEl.focus === 'function') confirmCancelBtnEl.focus();
}

function _readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsText(file);
  });
}

function _beginImportHtml() {
  if (!importFileInputEl) return;
  importFileInputEl.accept = '.html,.htm,text/html';
  importFileInputEl.value = '';
  importFileInputEl.click();
}

function _beginImportJson() {
  if (!importJsonFileInputEl) return;
  importJsonFileInputEl.accept = 'application/json,.json';
  importJsonFileInputEl.value = '';
  importJsonFileInputEl.click();
}

async function _handleImportFile(file, triggerEl, format) {
  const fmt = format === 'json' ? 'json' : 'html';
  const lowerName = (file.name || '').toLowerCase();
  if (fmt === 'html') {
    if (!lowerName.endsWith('.html') && !lowerName.endsWith('.htm')) {
      showToast('Select an .html or .htm file');
      return;
    }
  } else if (!lowerName.endsWith('.json')) {
    showToast('Please select a .json file');
    return;
  }
  if (file.size > IMPORT_MAX_BYTES) {
    showToast('File too large (max 5 MiB)');
    return;
  }

  _setImportInFlight(true);
  let content;
  try {
    /* B-088 fix #7 — nested try/catch collapsed into a single Promise resolve.
       File-read failures map to `null`, which the explicit empty-content
       check below converts into the same toast (distinct from ERR_EMPTY_FILE,
       so the user can tell "couldn't open" from "file is blank"). */
    content = await _readFileAsText(file).then((c) => c, () => null);
    if (content === null) {
      showToast('Couldn\u2019t read file \u2014 try again');
      return;
    }
    if (content.length === 0) {
      showToast(_importErrorToast('ERR_EMPTY_FILE', fmt));
      return;
    }

    /* B-060 — read user's stored duplicate-handling default before preview. */
    let importSkipDuplicatesPref = true;
    try {
      const prefs = await _sendMessage(MSG_GET_PREFERENCES);
      if (prefs && typeof prefs.importSkipDuplicates === 'boolean') {
        importSkipDuplicatesPref = prefs.importSkipDuplicates;
      }
    } catch {
      /* Fall through with the `true` default — non-blocking. */
    }

    let previewData;
    try {
      previewData = await _sendMessage(MSG_IMPORT_COLLECTION, {
        format: fmt,
        content,
        options: { skipDuplicates: importSkipDuplicatesPref },
      });
    } catch (err) {
      const code = err && err.code ? String(err.code) : 'ERR_UNKNOWN';
      console.warn('import preview failed:', code);
      showToast(_importErrorToast(code, fmt));
      return;
    }

    /* Reject "valid but empty" file before opening confirm dialog. B-070 AC1
       — JSON with zero items + zero groups but a populated preferences
       object routes through the prefs-only confirm variant. */
    if ((previewData.itemsImported || 0) === 0 && (previewData.groupsImported || 0) === 0) {
      if (fmt === 'json' && _hasPopulatedPreferences(content)) {
        const capturedContent = content;
        const capturedFilename = file.name;
        _openImportPreviewDialog({
          counts: previewData,
          filename: file.name,
          triggerEl,
          format: 'json',
          prefsOnly: true,
          onConfirm: () => {
            if (_importInFlight) return;
            void _commitImport({
              content: capturedContent,
              filename: capturedFilename,
              format: 'json',
              prefsOnly: true,
            });
          },
        });
        return;
      }
      showToast(fmt === 'json' ? 'Backup contains no bookmarks' : 'File contains no bookmarks');
      return;
    }

    const capturedContent = content;
    const capturedFilename = file.name;
    const capturedFormat = fmt;
    const capturedPrefDefault = importSkipDuplicatesPref;
    _openImportPreviewDialog({
      counts: previewData,
      filename: file.name,
      triggerEl,
      format: fmt,
      skipDuplicatesDefault: importSkipDuplicatesPref,
      onConfirm: () => {
        if (_importInFlight) return;
        const cb = _doc.getElementById('settings-import-dup-checkbox');
        const userSkipDuplicates = cb && typeof cb.checked === 'boolean'
          ? !cb.checked
          : capturedPrefDefault;
        void _commitImport({
          content: capturedContent,
          filename: capturedFilename,
          format: capturedFormat,
          skipDuplicates: userSkipDuplicates,
          pendingPrefDefault: capturedPrefDefault,
        });
      },
    });
  } finally {
    /* M-2: Do NOT clear _importInFlight here. The flag must stay true while
       the preview dialog is open so buttons remain disabled. It is cleared by
       _closeDialog (cancel / overlay / Escape) or by _commitImport's finally
       (confirm → success or failure). On error / early-return paths above the
       dialog open, _closeDialog is not called, so explicitly clear here only
       if the dialog was never opened (i.e. _importInFlight is still true but
       dialogOverlayEl is hidden). */
    if (_importInFlight && (!dialogOverlayEl || dialogOverlayEl.hidden)) {
      _setImportInFlight(false);
    }
  }
}

async function _commitImport(pending) {
  if (!pending || typeof pending.content !== 'string') return;
  const fmt = pending.format === 'json' ? 'json' : 'html';
  const prefsOnly = pending.prefsOnly === true;
  const skipDuplicates = pending.skipDuplicates !== false;
  _setImportInFlight(true);
  try {
    const data = await _sendMessage(MSG_IMPORT_COLLECTION, {
      format: fmt,
      content: pending.content,
      commit: true,
      ...(prefsOnly ? {} : { options: { skipDuplicates } }),
    });
    let msg;
    if (fmt === 'json') {
      if (prefsOnly
        && (data.itemsImported || 0) === 0
        && (data.groupsImported || 0) === 0
        && !(data.repairs && data.repairs.preferencesSkipped)) {
        msg = 'Imported 0 items, 0 groups. Preferences applied.';
      } else {
        const repairsK = _sumRepairs(data.repairs);
        msg = 'Imported ' + data.itemsImported + ' item'
          + (data.itemsImported === 1 ? '' : 's')
          + ', ' + data.groupsImported + ' group'
          + (data.groupsImported === 1 ? '' : 's') + '.';
        if (repairsK > 0) {
          msg += ' ' + repairsK + ' repair' + (repairsK === 1 ? '' : 's') + ':';
          const repairParts = _plainLanguageRepairParts(data.repairs);
          msg += ' ' + repairParts.join(', ') + '.';
        }
        const dupCount = data.duplicatesSkipped || 0;
        if (dupCount > 0) {
          msg += skipDuplicates
            ? ' ' + dupCount + ' duplicate' + (dupCount === 1 ? '' : 's') + ' skipped.'
            : ' ' + dupCount + ' duplicate' + (dupCount === 1 ? '' : 's') + ' included.';
        }
        if (data.repairs && data.repairs.preferencesSkipped) {
          msg += ' Preferences skipped (invalid shape).';
        }
      }
    } else {
      msg = 'Imported ' + data.itemsImported + ' bookmark'
        + (data.itemsImported === 1 ? '' : 's')
        + ' into ' + data.groupsImported + ' group'
        + (data.groupsImported === 1 ? '' : 's') + '.';
      const malformed = data.skipped || 0;
      if (malformed > 0) {
        msg += ' ' + malformed + ' malformed entr'
          + (malformed === 1 ? 'y' : 'ies') + ' skipped.';
      }
      const dupCount = data.duplicatesSkipped || 0;
      if (dupCount > 0) {
        msg += skipDuplicates
          ? ' ' + dupCount + ' duplicate' + (dupCount === 1 ? '' : 's') + ' skipped.'
          : ' ' + dupCount + ' duplicate' + (dupCount === 1 ? '' : 's') + ' included.';
      }
    }
    showToast(msg);
    /* B-060 — persist the user's choice when it differs from the stored
       default. Best-effort. */
    if (!prefsOnly && typeof pending.pendingPrefDefault === 'boolean'
      && pending.pendingPrefDefault !== skipDuplicates) {
      _sendMessage(MSG_SET_PREFERENCES, {
        patch: { importSkipDuplicates: skipDuplicates },
      }).catch((err) => {
        const code = err && err.code ? String(err.code) : 'ERR_UNKNOWN';
        console.warn('import preference persist failed:', code);
      });
    }
  } catch (err) {
    const code = err && err.code ? String(err.code) : 'ERR_UNKNOWN';
    console.warn('import commit failed:', code);
    showToast(_importErrorToast(code, fmt));
  } finally {
    _setImportInFlight(false);
  }
}

/* =========================================================================
   Init / wire DOM. Idempotency: a second `init` call against the same DOM
   refreshes the cached elements but does NOT double-attach listeners — each
   element only ever has one of each kind because we skip wiring on
   already-listened elements via the dataset flag.
   ========================================================================= */

function _resolveDom() {
  exportHtmlBtnEl = _doc.getElementById('settings-export-html-btn');
  exportJsonBtnEl = _doc.getElementById('settings-export-json-btn');
  importHtmlBtnEl = _doc.getElementById('settings-import-html-btn');
  importJsonBtnEl = _doc.getElementById('settings-import-json-btn');
  importFileInputEl = _doc.getElementById('settings-import-file-input');
  importJsonFileInputEl = _doc.getElementById('settings-import-json-file-input');
  dialogOverlayEl = _doc.getElementById('settings-dialog-overlay');
  confirmDialogEl = _doc.getElementById('settings-confirm-dialog');
  confirmHeadingEl = _doc.getElementById('settings-confirm-heading');
  confirmBodyEl = _doc.getElementById('settings-confirm-body');
  confirmCancelBtnEl = _doc.getElementById('settings-confirm-cancel-btn');
  confirmDeleteBtnEl = _doc.getElementById('settings-confirm-delete-btn');
  toastEl = _doc.getElementById('settings-toast');
  toastMessageEl = _doc.getElementById('settings-toast-message');
  toastDismissEl = _doc.getElementById('settings-toast-dismiss');
}

function _wireOnce(el, eventName, handler) {
  if (!el) return;
  const flag = 'tjB093Wired_' + eventName;
  if (el.dataset) {
    if (el.dataset[flag] === '1') return;
    el.dataset[flag] = '1';
  } else {
    /* M-1: non-element targets (e.g. document) have no dataset; use the
       module-scope Set keyed by stable flag+event to guard double-attach. */
    const key = flag + '::' + eventName;
    if (_wireOnceSet.has(key)) return;
    _wireOnceSet.add(key);
  }
  el.addEventListener(eventName, handler);
}

export function init({ doc, sendMessage }) {
  if (!doc || typeof sendMessage !== 'function') {
    throw new Error('settings-import-export.init requires { doc, sendMessage }');
  }
  _doc = doc;
  _sendMessage = sendMessage;
  _resolveDom();

  _wireOnce(exportHtmlBtnEl, 'click', () => {
    void _exportCollectionAsHtml();
  });
  _wireOnce(exportJsonBtnEl, 'click', () => {
    void _exportCollectionAsJson();
  });
  _wireOnce(importHtmlBtnEl, 'click', () => {
    if (_importInFlight) return;
    _beginImportHtml();
  });
  _wireOnce(importFileInputEl, 'change', (e) => {
    const input = e.target;
    const file = input && input.files && input.files[0];
    if (!file) return;
    void _handleImportFile(file, importHtmlBtnEl, 'html');
    input.value = '';
  });
  _wireOnce(importJsonBtnEl, 'click', () => {
    if (_importInFlight) return;
    _beginImportJson();
  });
  _wireOnce(importJsonFileInputEl, 'change', (e) => {
    const input = e.target;
    const file = input && input.files && input.files[0];
    if (!file) return;
    void _handleImportFile(file, importJsonBtnEl, 'json');
    input.value = '';
  });

  /* Confirm dialog buttons + overlay click. */
  _wireOnce(confirmCancelBtnEl, 'click', () => {
    _closeDialog();
  });
  _wireOnce(confirmDeleteBtnEl, 'click', () => {
    const cb = _pendingConfirmCallback;
    _closeDialog();
    if (cb) cb();
  });
  _wireOnce(dialogOverlayEl, 'click', (e) => {
    if (e.target === dialogOverlayEl) _closeDialog();
  });

  /* Toast dismiss. */
  _wireOnce(toastDismissEl, 'click', () => {
    clearTimeout(_toastTimer);
    if (toastEl) toastEl.hidden = true;
  });

  /* Global Escape closes the confirm dialog. */
  _wireOnce(_doc, 'keydown', (e) => {
    if (e.key === 'Escape' && dialogOverlayEl && !dialogOverlayEl.hidden) {
      _closeDialog();
    }
  });
}

/* =========================================================================
   Test hooks (B-093 R5) — exported under explicit `_*ForTest` names so
   production callers don't accidentally consume them.
   ========================================================================= */

export const _internal = {
  /* Reset module state between tests. */
  reset() {
    _doc = null;
    _sendMessage = null;
    _importInFlight = false;
    clearTimeout(_toastTimer);
    _toastTimer = null;
    _pendingConfirmCallback = null;
    _dialogTriggerEl = null;
    _wireOnceSet.clear(); /* M-1: clear non-element listener guard for test isolation. */
    exportHtmlBtnEl = null;
    exportJsonBtnEl = null;
    importHtmlBtnEl = null;
    importJsonBtnEl = null;
    importFileInputEl = null;
    importJsonFileInputEl = null;
    dialogOverlayEl = null;
    confirmDialogEl = null;
    confirmHeadingEl = null;
    confirmBodyEl = null;
    confirmCancelBtnEl = null;
    confirmDeleteBtnEl = null;
    toastEl = null;
    toastMessageEl = null;
    toastDismissEl = null;
  },
  triggerExportHtml: () => _exportCollectionAsHtml(),
  triggerExportJson: () => _exportCollectionAsJson(),
  triggerBeginImportHtml: () => _beginImportHtml(),
  triggerBeginImportJson: () => _beginImportJson(),
  triggerHandleImportFile: (file, triggerEl, format) => _handleImportFile(file, triggerEl, format),
  isImportInFlight: () => _importInFlight,
};
