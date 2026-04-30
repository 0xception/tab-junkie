# Sprint 39 — R4 Findings (Deduplicated)

---

## [code-reviewer] — Wave 1 bundle (B-123 + B-127 + B-128 + B-129)

**Reviewed:**
- `sidepanel/sidepanel.css` (uncommitted diff — base `.item-row` placeholder + `[data-live]/[data-active]` overrides + `.tj-dense .item-row` padding update)
- `tests/b123-row-alignment.test.js` (new file, 6 tests T1-T6)
- `CLAUDE.md` (uncommitted diff — C-1 row split into C-1a + C-1b at lines 365-366; two new R3 Build bullets at lines 394-395)

**Test suite:** 1669/1669 PASS · `node --test tests/b123-row-alignment.test.js` 6/6 PASS

---

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM
_None_

### LOW

| # | Item | File | Finding | Fix |
|---|------|------|---------|-----|
| L-1 | B-123 | `tests/b123-row-alignment.test.js:235` | T6's popup regex `\.qs-(item\|result-row\|row)[^{]*\{[^}]*border-left\s*:` is loosely scoped. The popup's actual row container is `<li id="qs-row-N">` — an ID, not a class — and the popup CSS has no class-based row selector at all (`popup.js:787` confirms `li.id = qs-row-${index}`; `popup.css` exposes only descendant classes `.qs-row-text/title/url/meta`). The regex's `\.qs-row` alternative will scan `.qs-row-text { ... }`, `.qs-row-title { ... }`, etc., for inline `border-left:` declarations. This is a *defensive over-match* (correct direction — false positives possible, false negatives unlikely on the row-itself surface), but the stated intent in the docblock — "popup rows must not declare `border-left`" — is not actually being checked, since popup has no row class. If a future engineer added `#qs-row-N { border-left: ... }` (ID-scoped), T6 would silently miss it. | Either (a) widen regex to also pin `#qs-row-` with a `border-left` declaration, or (b) tighten the docblock to say "no row-descendant `.qs-row-*` rule declares `border-left`" so the regex's actual scope matches its stated purpose. Acceptable to defer — current pin still adds *some* regression coverage and aligns with R1 R2-VERIFY no-op verdict (no left-side indicator exists today). |
| L-2 | B-123 | `sidepanel/sidepanel.css:465` | The base `.item-row` 4-value padding `6px 12px 6px 9px` is now asymmetric (left=9px, right=12px) versus the prior symmetric `6px 12px`. This is *intended* (the 3 px transparent border-left + 9 px padding-left = 12 px to match the 12 px right padding), but the asymmetry only "balances" if the border-left is actually present at width 3px. If a future modifier ever sets `border-left-width: 0` or `border: none` on `.item-row`, content origin shifts to 9 px instead of 12 px. The structural-placeholder pattern is correct but creates an implicit width-coupling that isn't otherwise documented. | None required — the explanatory comment at `:447-460` already explains the math. Optional: add a note to the comment that any future "remove left indicator" modifier MUST also restore `padding-left: 12px` to keep content origin invariant. |

### Notes / observations

- **B-123 architecture/patterns:** Structural-placeholder approach (transparent base + color-only override) is the right pattern and is cleaner than the prior `border-left: 3px solid <color>; padding-left: 9px` redeclaration in indicator variants. It composes correctly with `.item-row[data-live-only="true"]` at `sidepanel.css:1621` (already uses the new `border-left-color` override pattern — implicit cross-rule consistency, not a finding) and with the absolute-positioned `.item-drift-bar` at `:601-609` (`left: 3px` anchor sits at the right edge of the placeholder border — comments at `:592-596` document the geometry).
- **B-123 DRY:** No duplication introduced. The change *removes* duplication — the prior `[data-live]` and `[data-active]` rules each redeclared `border-left: 3px solid <color>; padding-left: 9px;`; the new pattern declares the 3 px footprint once on the base.
- **B-123 performance:** CSS-only, no layout/paint regression. Adding a transparent border to every row is constant additional layout cost (no new computed-style branches), and the prior rules already created left-border + padding-left declarations on indicator rows — the change moves that cost up to the base rule rather than introducing it. Existing `contain: layout style` at `:469` is unchanged.
- **B-123 dead code / TODOs:** None. No commented-out blocks introduced.
- **B-123 test quality:**
  - T1 regex `\b\.item-row\s*\{` correctly anchors to the bare base rule (excludes `.item-row[...]` and `.item-row:hover`). The `(^|\n)` boundary in T1 plus the `[^}]*` body match is robust against comment text containing the same string (verified — no comment in the file currently matches the literal `border-left: 3px solid transparent` in a way that would false-fire outside the rule body).
  - T2's `border-left:` shorthand-rejection check correctly distinguishes `border-left-color:` (allowed) from `border-left:` (forbidden) via the `\s*:` boundary — `border-left-color` is `border-left` + `-color` so does not match `\s*:`. Correct.
  - T3 dense-mode regex `padding:\s*\d+px\s+\d+px\s+\d+px\s+9px` correctly pins the 4-value form ending in 9px. Robust to whitespace variation.
  - T4 / T5 regression guards are appropriately scoped to `.item-drift-bar` and `.item-audible-icon` rule bodies only — won't false-fire on neighbor rules.
  - T6 has the L-1 fragility noted above; otherwise serves its R2-VERIFY no-op pin purpose.
  - All six tests pass (`node --test tests/b123-row-alignment.test.js`).
- **B-127 documentation quality:** New bullet at `CLAUDE.md:394` is clear, unambiguous, and follows the bold-bullet pattern of the surrounding list (`No dead code, no commented-out blocks, no console.log left behind.`). Cites Sprint 38 B-121 R3 silently-deferred newtab close-button affordance + R2 §60.6.2(c) AC6 — precedent is specific and verifiable from `docs/findings/sprint-38.md` H-1. Self-application: B-127 is a process-rule change that affects R3 only, with no implementation deferral; not subject to its own "stop-and-escalate" gate. Pass.
- **B-128 documentation quality:** Split of C-1 into C-1a (governance — schema-version bump) + C-1b (data — migration strategy choice) at `CLAUDE.md:365-366` cleanly separates the two concerns. C-1a retains all of the original prose (DEFAULT_PREFERENCES + validator allow-list note + Sprint 30 B-092 precedent), and adds the explicit `KNOWN_VERSION` + `defaultShape` for `PARTITION_META` mechanical requirements. C-1b enumerates the three valid migration strategies (eager / lazy / no-op) and cites Sprint 38 B-121 as the blocking precedent. Self-application: the split itself is a satisfactory implementation of the new C-1a + C-1b structure — C-1a covers governance independently of strategy, C-1b lists discrete strategy choices. **One minor verifiable observation:** C-1a's prose calls out "the `defaultShape` for `PARTITION_META`" as a fixed seed location, but Sprint 38 B-121 used a different storage key (`tj:partitions:meta` vs `tj:items` validator). The C-1a wording assumes `PARTITION_META` is the canonical seed location — this is correct *for current Sprint-38-vintage code* but may not hold for future schema additions to other storage keys. Not a finding (C-1a says "or equivalent"), just an observation.
- **B-129 documentation quality:** New bullet at `CLAUDE.md:395` is parallel in form to B-127. Cites Sprint 38 B-121 R3 single-delete-only cascade-prune (missing `MSG_BULK_DELETE_ITEMS` + `MSG_DELETE_GROUP` siblings) — precedent is specific, severity (MEDIUM x2) accurately reflected from `docs/findings/sprint-38.md`. The wildcard examples (`MSG_DELETE_*`, `MSG_BULK_*`, `MSG_*_GROUP`) are clear and generalizable. Self-application: B-129 is a process-rule change with no cascade implications; not subject to its own gate.
- **B-127 + B-129 parallelism check:** Both new bullets follow the same prose template — bold rule name, mechanic, then "[Sprint] R3 [...] is the blocking precedent" closing — matching the precedents at B-118/B-119/B-126 (the latter at `:378-388` "Fix-scope test-assertion enumeration"). Consistent house style.
- **Net assessment:** Bundle is clean. No CRITICAL/HIGH/MEDIUM. Two LOW observations (L-1 test-pin scope, L-2 implicit width-coupling) are deferrable. Existing test suite passes 1669/1669 with zero regressions.

---

## [security-reviewer] — Wave 1 bundle (B-123 + B-127 + B-128 + B-129)

**Reviewed:**
- B-123 — `sidepanel/sidepanel.css` (lines 446–469, 478–490, 556–566 — diff) + `tests/b123-row-alignment.test.js` (new, 242 lines)
- B-127 — `CLAUDE.md` line 394 (new R3 charter bullet — STOP-and-escalate)
- B-128 — `CLAUDE.md` lines 365–366 (C-1 row split into C-1a governance + C-1b data strategy)
- B-129 — `CLAUDE.md` line 395 (new R3 charter bullet — cascade-prune sibling-grep)

**Surface analysis:**
- B-123 — pure CSS rule shape change (transparent-border placeholder + color-only overrides + dense padding adjustment). New regex-pin test file using `readFileSync` only. NO JS change, NO `innerHTML`/`outerHTML`/template-string DOM injection, NO new message contract, NO storage-write surface, NO new manifest permission, NO network call, NO `eval`/`new Function`.
- B-127 / B-128 / B-129 — `CLAUDE.md` prose edits only. No code, no manifest, no message contract, no storage schema, no test selector change, no surface that crosses a trust boundary.

**Verdict:** PROCEED — no CRITICAL / HIGH / MEDIUM security findings. One LOW observation overlapping with [code-reviewer] L-1.

---

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM
_None_

### LOW

| # | Item | File | Finding | Fix |
|---|------|------|---------|-----|
| L-1 | B-123 | `tests/b123-row-alignment.test.js:235` | (Overlaps with [code-reviewer] L-1.) T6 popup-side regex `\.qs-(item\|result-row\|row)[^{]*\{[^}]*border-left\s*:` does not match the actual popup row container. Verified via `grep -nE "createElement\|className" popup/popup.js` — popup row is created as a bare `<li>` (popup.js:784) with no row-level class, styled by `#qs-results-scroll li` (no class-based row selector exists in popup.css). Future regression where a developer adds `border-left:` to an ID-scoped or `#qs-results-scroll li`-scoped rule would NOT be caught by T6. The no-op verdict is preserved by the actual absence of `border-left` anywhere in `popup/popup.css` today (verified — `grep -n "border-left" popup/popup.css` returns zero matches), so this is a regex-soundness gap rather than a current-day defect. From a security/data-hygiene angle: not a confidentiality/integrity/availability concern; just regression-coverage tightness. | Defer-and-monitor: if popup ever introduces a row-level class or ID-scoped row rule, expand the T6 regex enum to include `#qs-row-` and `#qs-results-scroll\s+li`. Current pin still adds *some* coverage and aligns with R1 R2-VERIFY no-op verdict. |

### Notes / observations

**B-123 security surface (CSS + regex-pin test):**
- CSS-only change. No XSS surface introduced — no template, no interpolated user input, no DOM manipulation. The CSS rule shape (`border-left: 3px solid transparent` + `padding-left: 9px`) is structural and does not render any user-controlled string.
- The new test file uses `readFileSync` (synchronous, read-only) against three repo CSS files. No network, no shell exec, no `eval`, no `new Function`, no dynamic `import()`. The `path.resolve(__dirnameLocal, '..')` hop is bounded to the repo root by construction (test runner cwd). No path-traversal surface.
- T2's `assert.doesNotMatch` guards against `border-left:` shorthand and `padding-left:` redeclaration in indicator variants are tight — they catch any future regression that re-introduces the pre-B-123 width/style/padding asymmetry.
- T1 / T3 OR-form padding match (`/padding:\s*\d+px\s+\d+px\s+\d+px\s+9px/.test || /padding-left:\s*9px/.test`) accommodates either 4-value shorthand or longhand follow-up — resilient to refactor-style.
- Verified: 1669/1669 test suite passing per [code-reviewer] (consistent with my read of the diff).

**B-127 (R3 STOP-and-escalate gate, CLAUDE.md:394):**
- Documentation-only addition. Closes a real process-integrity gap from S38 B-121 H-1 — verified against `SPRINT_ARCHIVE.md:2226` ("HIGH H-1: newtab close-button affordance was deferred as 'future enhancement' by R3 — escalated and fixed in R4 reproceed") and `SPRINT_ARCHIVE.md:2252` (retro lesson: "when R3 sees a 'future enhancement' temptation, the right action is to STOP and escalate to [scrum-master], not silently defer past R4").
- The cited B-121 H-1 was a `newtab/newtab.css` close-button affordance — UX/scope-control concern, not a security-confidentiality concern, but data-integrity-adjacent (a deferred destructive-action affordance could leave the close path partially-implemented). The new bullet correctly aligns this with the existing "Scope Change Control" section.
- Wording is unambiguous: "STOP-and-escalate", "MUST stop", "is forbidden". No literal-AC-reading wiggle room (Sprint 19 B-070 / Sprint 20 B-007 precedents avoided).
- Does NOT weaken any pre-existing security gate or invariant — strengthens the R3 charter. The pre-existing R3 rules ("No dead code, no commented-out blocks, no `console.log` left behind") remain intact above it.

**B-128 (C-1a / C-1b split, CLAUDE.md:365–366) — storage-schema governance:**
- Storage-schema governance is a security-data-integrity concern (data loss / corruption from missed migrations). The split STRENGTHENS the gate.
- C-1a explicitly states the governance requirements as MANDATORY when shape changes: `KNOWN_VERSION` increment in `background/storage/migration.js`; `defaultShape` for `PARTITION_META` (or equivalent) updated; `CHANGELOG.md` SW module-cache flush note. Critically: "Schema-version increment is governance and is independent of whether the data-migration strategy is eager or lazy." This load-bearing clause prevents conflation of the two concerns.
- C-1b enumerates the three valid migration strategies (eager / lazy / no-op) and explicitly states: "choosing a lazy data strategy is correct, but it does NOT exempt the version bump under C-1a." Verified against `SPRINT_ARCHIVE.md:2253` (S38 B-121 retro lesson: "schema-version increments are independent of data-rewrite strategy. R2 designs should split these into two checkbox items so R3 can't conflate them.") — direct match.
- Pre-existing prose preserved in C-1a (the `denseLayout` SW module-cache flush note + S30 B-092 `chrome-mock` UAT-time discovery gap precedent) is intact — no regression of S30 coverage.
- Net effect: the new C-1a + C-1b explicitly closes the "lazy migration → no version bump" conflation that produced S38 B-121 CRITICAL C-1.

**B-129 (R3 cascade-prune sibling-grep gate, CLAUDE.md:395) — security-data-hygiene:**
- The bullet enumerates `MSG_DELETE_*`, `MSG_BULK_*`, `MSG_*_GROUP` as the surfaces R3 must grep when a cascade-prune is added to one entry-point. Verified against `SPRINT_ARCHIVE.md:2216` (B-121 fixed cascade-prune across `MSG_DELETE_ITEM` + `MSG_BULK_DELETE_ITEMS` + `MSG_DELETE_GROUP`) and `SPRINT_ARCHIVE.md:2227` (M-1 + M-2 cascade-prune asymmetry between single-delete and bulk/group-delete).
- Cascade-prune misses are a real data-hygiene concern: orphaned floating-tab records on bulk/group delete pre-fix could leak partial state into rendered UI. The gate is preventive for the next equivalent class of bug.
- The "(or any other side-effect)" parenthetical broadens the rule beyond cascade-prune to any cross-entry-point write side-effect — good defense-in-depth wording.
- "verify cascade parity before claiming complete" gives the gate clear teeth (R3 cannot self-attest done without grep).
- Wildcard examples (`MSG_DELETE_*`, `MSG_BULK_*`, `MSG_*_GROUP`) are clear and generalizable — they cover the canonical extension write-path naming convention used in `shared/messages.js`.

**Cross-cutting threat-surface analysis:**
- Manifest / permissions: zero new permissions across all four items.
- CSP / `eval` / `new Function` / `innerHTML` / `outerHTML`: zero new occurrences. CSS-only and prose-only changes do not touch any of these.
- Message-passing: zero new `chrome.runtime.onMessage` payloads, zero new `chrome.runtime.sendMessage` callsites, zero new message contract types.
- Storage: zero new write surfaces. The B-128 C-1a/C-1b split is *meta-rules about future storage changes*, not a storage change itself.
- Network: zero new fetches, zero new XHR.
- Telemetry: zero new logging, zero new analytics.
- XSS via user-provided strings: B-123 is CSS-only. Verified — no `textContent`-vs-`innerHTML` substitution, no template-string-into-DOM, no bookmark-title or URL rendering changes. Indicator variants are bound to `data-live="true"` / `data-active="true"` attributes — these are extension-controlled, not user-controlled, and CSS attribute selectors don't enable XSS regardless.

**Documentation gates wording integrity (B-127 / B-128 / B-129):**
- All three new gates use unambiguous MUST language with no literal-AC-reading escape hatches. Compared against the Sprint 19 B-070 / Sprint 20 B-007 failure modes (where literal AC readings silently waived destructive-action confirmation), these gates are written defensively:
  - B-127: "MUST stop", "is forbidden" — explicit prohibition of silent deferral.
  - B-128 C-1a: "MUST be incremented", "MUST be updated", "MUST include" — three independent governance must-haves.
  - B-128 C-1b: "MUST document the migration strategy explicitly" — explicit documentation requirement; cannot be silently inferred.
  - B-129: "MUST grep", "verify cascade parity before claiming complete" — explicit pre-flight check; clear "before claiming complete" boundary.
- Each gate cites a real, specific Sprint 38 B-121 precedent (verified against `SPRINT_ARCHIVE.md:2226-2253` and `SPRINT.md:71-89`). Citation accuracy: PASS.

**Test quality (B-123 T6 specifically):**
- The L-1 finding above documents the regex-soundness gap. From a security/data-hygiene angle: not actionable — the popup currently has zero `border-left` declarations anywhere in `popup/popup.css`, so the no-op verdict is correct today; future divergence would require a separate ad-hoc reviewer catch. T6 functions as a *partial* regression pin only — adequate for current scope, tighten if popup grows row-level styling.

**Net assessment:** No security findings. Bundle is clean from a security / data-integrity / process-integrity perspective. The three new CLAUDE.md gates (B-127 / B-128 / B-129) measurably strengthen the pipeline against the specific failure modes that produced S38 B-121's HIGH + CRITICAL + 2× MEDIUM findings.

---

## [security-reviewer] — Wave 3 anchors (B-124 + B-122)

**Reviewed:**
- `shared/themes.css` (B-124: new `--floating-bar-color` token in `:root`, lines 56-65)
- `shared/sort-order.js` (B-122: new `computeGroupPromote` pure helper, lines 419-512)
- `sidepanel/sidepanel.css` (B-124: floating-row CSS at lines 611-682)
- `sidepanel/sidepanel.js` (B-124: `buildFloatingTabRow` extension, `_applyFloatingRowAriaLabel`, `_onFloatingSaveCtaClick`, `patchFloatingMembersSections` re-application; B-122: drag-state extension at line 357+, `_computeGroupPromoteTarget`, `_buildGroupDragRectCache` extension, drop-handler PROMOTE race-guard branch + dispatch)
- `newtab/newtab.css` (B-124: `.newtab-floating-bar` + `.newtab-floating-save` rules)
- `newtab/newtab.js` (B-124: `_buildFloatingTabRow` extension + `_promoteFloatingTab` helper + `_onGridClick` save-floating intercept)
- `tests/b124-floating-visual.test.js` (new — 9 tests T-124-A..I)
- `tests/b122-drag-to-root.test.js` (new — 6 tests T1-T6)
- `tests/sort-order.test.js` (9 new B-122 helper tests)
- `background/messages/storage-handlers.js:297-340` (MSG_PROMOTE_TAB receiver — payload validation re-verified)
- `background/storage/groups.js:294-407` (bulkReorderGroups receiver — payload validation re-verified)

**Test suite:** 15/15 PASS for the two new B-122 + B-124 test files (`node --test tests/b122-drag-to-root.test.js tests/b124-floating-visual.test.js`).

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM
_None_

### LOW

| # | Item | File | Finding | Fix |
|---|------|------|---------|-----|
| L-1 | B-124 | `newtab/newtab.js:1089` | The newtab Save-CTA's `aria-label` interpolates `member.title` directly: `Save as bookmark: ${member.title || member.url || 'Untitled tab'}`. Tab titles are untrusted (controlled by the loaded webpage). The interpolation is delivered via `setAttribute('aria-label', ...)` which is NOT parsed as HTML, so XSS is impossible — but a hostile or very-long page title could produce an aria-label that screen readers narrate verbatim. Matches the existing precedent at `:1105` (`closeBtn` does the same for `Close tab: ${title}`); inheriting that posture is consistent. | Optional: clamp `member.title` to a short prefix (e.g. first 80 chars). Defer — not a regression; matches existing pattern. No XSS path. |
| L-2 | B-122 | `sidepanel/sidepanel.js:5278-5318` | `_groupDragTick`'s PROMOTE branch reads `_groupDragRectCache.topLevelOrder[0]` + `topLevelTopY.get(firstId)` after entering on `promote` truthy. `_computeGroupPromoteTarget` already guards `topLevelOrder.length === 0` and returns null, so the tick branch is only entered when at least one top-level group exists — but the tick branch's first-element access is implicitly relying on that caller invariant rather than re-asserting it. Defense-in-depth observation only. | Optional: add an explicit `if (firstId === undefined) return;` short-circuit before the transform write, or document the invariant in a comment. Current code is safe by construction. |

### Notes / observations

**Generic threat surface:**
- Manifest / permissions: no `manifest.json` changes (verified via `git diff`). PASS.
- CSP: zero `eval`, `new Function`, dynamic `<script>` injection, or `setTimeout(string)` introduced. PASS.
- `innerHTML` / `outerHTML` / `insertAdjacentHTML` on user-provided strings: the new "Save as bookmark" CTA label is hardcoded in both surfaces. Sidepanel `saveCta.textContent = '+'` and `saveCta.setAttribute('aria-label', 'Save as bookmark')` — both literal. Newtab same except aria-label interpolates title via setAttribute (see L-1). No `innerHTML` introduced. PASS.
- `textContent` for bookmark titles: `_buildFloatingTabRow` uses `titleEl.textContent` / `urlEl.textContent`. PASS.
- URL handling: no new URL-into-HTML interpolation. Promote flow validates URL via `normalizeUrl` + `ALLOWED_URL_SCHEMES` allow-list inside `createItem`. PASS.
- Network: zero new `fetch`/`XHR`/`WebSocket`/`EventSource`/dynamic remote `import()`. PASS.
- PII logging: no new `console.log` of titles/URLs. `_promoteFloatingTab` deliberately silent-degrades. PASS.

**Message-passing:**
- New message types: **none added**. Both items reuse existing `MSG_PROMOTE_TAB` and `MSG_BULK_REORDER_GROUPS`. `shared/messages.js` not modified. PASS.
- Payload validation:
  - `MSG_PROMOTE_TAB` at `storage-handlers.js:297-305` validates `tabId` is `number` and `groupId` is `string|null` before any storage write.
  - `bulkReorderGroups` at `groups.js:294-311` validates array non-empty, ≤ MAX_BULK_INPUTS, every element has string id, finite sortOrder, and `parentId` (when present) is `string|null`. Depth + cycle + no-children-on-NEST invariants enforced inside the writeTransaction at `groups.js:338-349`.
  Both receivers are robust against malformed renderer payloads. PASS.
- Sender identity: extension-internal only. PASS.

**Storage:**
- Both items use atomic `writeTransaction` boundaries (existing). No new direct storage writes. PASS.
- **No schema shape changes**. C-1a/C-1b not applicable per R2 chapters. PASS.
- Race conditions: B-122 §62.9 F-5 race-guard third branch verified at `sidepanel.js:4643-4662` (re-validates `freshDragged.parentId !== null` + anchor still top-level). `cachedGroupsGen` capture at dragstart + recheck at drop is unchanged. Two-layer defense — even if guard does not abort, `computeGroupPromote` at `shared/sort-order.js:441` returns `[]` for already-top-level dragged group (short-circuited at `if (updates.length === 0) return;`). PASS.

**Drag-and-drop:**
- `setDragImage` / off-screen rect: none touched; B-122 reuses existing `.group-reorder-indicator` element via `transform: translateY(...)`. C-10 N/A. PASS.
- DataTransfer: no new `setData()`/`getData()` calls. PASS.

**XSS-specific (B-124):**
- Save CTA innerHTML: confirmed hardcoded text. PASS.
- ARIA label `"floating tab — <title>"`: title interpolated then passed via `setAttribute` — auto-encoded for attribute context, no HTML parsing. PASS.
- Dotted-bar via CSS only: confirmed. No JS-injected style strings. PASS.

**Drag-state (B-122):**
- `pendingInsertAfterGroupId` validation: two-layer defense at drop boundary. PASS.
- `computeGroupPromote` argument trust: type-checks `Array.isArray(groups)` + `typeof draggedId === 'string'`; defenses for self-insert, malformed entries, undefined `sortOrder`. No crash path. PASS.

**B-122 §62.7 C-1..C-12 + B-124 §61.9 C-1..C-12 verification:** no deviation from R2 self-assessment. C-9 empty-state defense verified in both surfaces (`sidepanel.js:2980-2982` + `newtab.js:564-566`).

**Net assessment:** Both anchors ship clean from a security perspective. Existing message contracts with verified payload validation, established atomic write boundaries, hardcoded CTA text + `setAttribute` for the only title interpolation. Two LOW notes are defense-in-depth observations, not actionable for R5.

---

## [code-reviewer] — Wave 3 anchors (B-124 + B-122)

**Reviewed:**
- B-124: `shared/themes.css:67` (`:root` `--floating-bar-color: var(--live-indicator)` token), `sidepanel/sidepanel.css:611-682` (override + `.item-floating-bar` + `.floating-row-save-cta` + `:hover`/`:focus-within` reveal pair), `sidepanel/sidepanel.js:2878-2996` + `:3083-3127`, `newtab/newtab.css:295-525`, `newtab/newtab.js:375-420` + `:549-585` + `:1004-1123`, `tests/b124-floating-visual.test.js` (9 tests T-124-A..I).
- B-122: `shared/sort-order.js:419-512` (new `computeGroupPromote`), `sidepanel/sidepanel.js:355-366` (drag-state shape), `:4383-4406` (dragstart init), `:4604-4694` (drop handler PROMOTE branch + race-guard third branch), `:5225-5263` (cache extension), `:5272-5394` (tick PROMOTE intercept), `:5538-5625` (`_computeGroupPromoteTarget`), `tests/sort-order.test.js:577-712` (9 helper tests), `tests/b122-drag-to-root.test.js` (6 tests T1..T6).

**Test suite:** `node --test tests/b124-floating-visual.test.js tests/b122-drag-to-root.test.js`: 15/15 PASS. Full suite: PASS.

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | Item | File | Finding | Fix |
|---|------|------|---------|-----|
| M-1 | B-124 | `sidepanel/sidepanel.js:2964-2967` | Docstring claim "duplicate-warn is NOT shown here because the floating tab's parent is already a saved bookmark; this CTA promotes a SIBLING (different URL by construction)" is *factually incorrect*. Verified: `background/tabs/floating-members.js:111` only excludes tabs already-claimed by another saved item — but a floating tab's URL CAN match a different saved bookmark in another group. Open-Tabs Save flow at `sidepanel.js:6559-6594` does `_findDuplicateSavedItem` pre-dispatch + `openConfirmDialog` soft-warn (B-059 contract); floating Save bypasses this. SW still rejects via ERR_DUPLICATE_URL fall-through (safety preserved); UX diverges (Open-Tabs shows pre-dispatch group-context "replace?" confirm; Floating dispatches blind, post-dispatch toast only). | (a) Wire `_findDuplicateSavedItem` + `openConfirmDialog` into `_onFloatingSaveCtaClick` for parity (preferred), OR (b) update lines 2963-2967 to accurately read "duplicate detection deferred to SW; ERR_DUPLICATE_URL translated to toast post-dispatch." Misleading "different URL by construction" wording must be removed regardless. |
| M-2 | B-124 | `newtab/newtab.js:570-580` | `_promoteFloatingTab` silent-degrade swallows ALL failures including ERR_VALIDATION (e.g., `chrome://`, `javascript:`). R2 §61.2.3 sanctioned silent degrade, but user gets zero feedback when click had no effect — floating row stays, CTA stays, no SCOPE.ITEMS broadcast. Hard to debug. | Acceptable per R2; defer as polish. Optional: brief CSS error flash (200 ms) on Save button on rejection. Log in §61.10.7 deferred polish. |
| M-3 | B-124 | `sidepanel/sidepanel.js:2918-2924` and `:3119-3125` | `.item-indicators` container creation duplicated across initial-build + patch-path defensive re-attach. Both copies have identical `if (!indicators) { create + append }` then `appendChild(saveCta)`. The patch-path defensive rebuild is unreachable in practice (today nothing strips indicators) — masks rather than exposes any future `_patchOpenTabRow` bug that drops them. | Extract `_ensureSaveCtaOnFloatingRow(row)` helper used by both call sites (~20 lines saved). Comment the defensive rebuild as belt-and-suspenders since today the branch is unreachable. |
| M-4 | B-122 | `sidepanel/sidepanel.js:5566-5625` | `_computeGroupPromoteTarget` does NOT explicitly reject the Open Tabs section as a promote target despite R2 §62.8 F-1 explicitly flagging this UX risk ("if pointer is over Open Tabs section, hit-test maps to 'below the last top-level group' → `insertAfterGroupId = lastTopLevelId`"). R2 §62.9 F-1 deferred to UAT. T3 doesn't cover this case. | Pre-emptive fix: add `const hit = document.elementFromPoint(x, y); if (hit?.closest?.('.open-tabs-section')) return null;` after the `containerRect` X-bounds check at line 5574. Matches existing `_computeGroupDropTarget:5462` pattern. Eliminates UAT-discovery risk; minor refactor (helper does not currently invoke `elementFromPoint`). |

### LOW

| # | Item | File | Finding | Fix |
|---|------|------|---------|-----|
| L-1 | B-124 | `sidepanel/sidepanel.js:2916` and `newtab/newtab.js:1091` | Save CTA uses literal `'+'` text content. Functional, accessible name via aria-label, but `+` is platform-font-dependent. Existing icon-button precedent (`.icon-action-trash`/`.icon-action-close`) uses inline SVG. Floating CTA is the only icon-button using textContent. | Optional polish: replace `textContent = '+'` with inline SVG plus icon for visual parity with delete/close affordances. |
| L-2 | B-124 | `newtab/newtab.js:1117` vs `sidepanel/sidepanel.js:2946-2956` | aria-label parity gap. Sidepanel: `"floating tab — <title>, active tab, ..."`. Newtab: `"floating tab — <title>, <url>, active tab, ..."`. Newtab adds URL; sidepanel does not. Neither test pin asserts cross-surface format — divergence silent. R2 §61.8 prescribes the title-only sidepanel form. | Drop URL from newtab to match sidepanel + R2 spec (preferred). Add cross-surface parity assertion to T-124-F or T-124-B. |
| L-3 | B-124 | `sidepanel/sidepanel.css:626-628` | `.item-row[data-floating="true"] { border-left-color: transparent; }` creates implicit ordering dependency on the `[data-live="true"]` rule. Consistent with existing override patterns. | Optional: tighten selector to `.item-row[data-live="true"][data-floating="true"]` for explicitness. |
| L-4 | B-122 | `sidepanel/sidepanel.js:5615-5623` | The `anchorId === null` fallback to PROMOTE-to-top conflates two cases: (a) pointer-over-parent's-REORDER_ABOVE zone (intended), and (b) pointer-inside-first-top-level-section's-body (e.g., over its items area). Case (b) currently maps to PROMOTE-to-top, which may surprise users dragging over a different group's items. R2 §62.3 hit-test does not enumerate (b). | Acceptable per F-1 UAT disposition. Update comment to distinguish the two cases; add UAT step "drag sub-group over first top-level group's body (NOT header) and verify promote-to-top is intuitive." |
| L-5 | B-122 | `sidepanel/sidepanel.js:4683-4694` | The PROMOTE/REORDER ternary inlines into the `const updates =` assignment. Concise but obscures the symmetry — both branches dispatch through `MSG_BULK_REORDER_GROUPS` at line 4710 (single dispatch site verified). | Optional: extract to two named locals or small dispatch helper for readability. |
| L-6 | B-122 | `tests/b122-drag-to-root.test.js:230-247` | T5 PROMOTE race-guard pin uses `[\s\S]*?freshDragged\.parentId[\s\S]*?anchorStillTopLevel`. The `anchorStillTopLevel` local is the only race-guard semantics anchor. A future rename (e.g., `anchorStillValid`) would silently pass without asserting anything meaningful. | Tighten to assert the literal `freshDragged.parentId ?? null) === null` early-return + `showToast(` call inside the PROMOTE branch — semantic, not name-based. |
| L-7 | B-124 | `tests/b124-floating-visual.test.js:73-100` | T-124-A regex assumes the bar is created inline within `buildFloatingTabRow`. A future refactor extracting bar creation into a helper would fail T-124-A even though the contract (bar exists) is preserved. | Acceptable per established source-text-pin pattern (b101, b048, b113). Strengthen via JSDOM smoke test if/when the surface gains a test harness. |

### Notes / observations

- **DRY (sidepanel + newtab `buildFloatingTabRow`):** Duplication is justified — different DOM shapes (`<li>` vs `<button>`), different child structures, different click semantics. The shared `--floating-bar-color` token + `data-floating="true"` selector contract are the right cross-surface coupling points. The aria-label format (L-2) is the one piece that COULD be consolidated into `shared/aria-label.js`.
- **Performance (B-124):** `.item-floating-bar` is `position: absolute; pointer-events: none` — out of flow, no parent reflow. Defensive re-attach at `sidepanel.js:3105-3110` doesn't reflow either. `.floating-row-save-cta` uses `visibility: hidden; opacity: 0` (layout slot reserved); no transition (instant flip per AC11(c)). Zero hover-jank.
- **Performance (B-122):** Cache extension adds two outputs in the same header-iteration loop; per-tick lookup is O(1) Map.get. Per-dragstart cost O(n²) bounded ≤ 50 in practice. Negligible.
- **Accessibility (B-124):** T-124-H verifies `:focus-within` reveal pair in BOTH sidepanel.css AND newtab.css. aria-label correctly re-applied in patch path at `sidepanel.js:3101`. CTA accessible name OK in both. Newtab `<button>` inside `<button>` is technically invalid HTML but ARIA 1.2 permits for keyboard reach; pattern inherited from B-121 close-button (not a B-124 regression).
- **Drag-state contract (B-122):** F-5 race-guard third branch verified at `sidepanel.js:4643-4662` — both invariants present. F-1 Open Tabs section pointer-mapping NOT explicitly guarded (M-4). Q4 outcome cleanly handled by existing `validReorderTargetIds` filter excluding the parent.
- **Cross-cutting:** `MSG_PROMOTE_TAB` semantics match the 3 existing callers; `MSG_BULK_REORDER_GROUPS` atomic single `writeTransaction` per B-031 §38.4.3 (unchanged).
- **Empty-state:** B-124 zero floating tabs path verified (early-return + empty-Set fallthrough). B-122 sole-sub-group-of-sole-top-level-parent verified to produce correct update spec.
- **Test quality:** B-124 9/9 PASS; coverage maps directly to R2 §61.5.4. B-122 has 9 helper tests + 6 integration tests; T3 is structural-pin only (does not exercise the actual hit-test code path under `_groupDragTick`). UAT is critical for B-122 behavioral correctness given the no-import constraint on `sidepanel.js`.

**Net assessment:** Both items pass the bundle-review bar with no CRITICAL or HIGH findings. Four MEDIUM findings: M-1 docstring inaccuracy + M-3 duplication (both polish); M-2 newtab silent-degrade (accepted per R2); M-4 pre-emptive Open-Tabs reject-guard for B-122 (avoids F-1 UAT discovery cost). M-1 + M-4 are most actionable for R5/UAT-readiness; M-2 + M-3 can defer.

---

## [qa-reviewer] — Wave 3 anchors (B-124 + B-122)

**Reviewed:** B-124 (`sidepanel/sidepanel.css:611-684`, `sidepanel/sidepanel.js:2878-2996` + `:3098-3126`, `newtab/newtab.css:302-526`, `newtab/newtab.js:375-388` + `:537-588` + `:1014-1120`, `shared/themes.css:56-67`, `tests/b124-floating-visual.test.js`); B-122 (`sidepanel/sidepanel.js:357-365` + `:4394-4406` + `:4604-4694` + `:5225-5260` + `:5278-5328` + `:5530-5625`, `shared/sort-order.js:418-512`, `tests/b122-drag-to-root.test.js`, `tests/sort-order.test.js`).

**Test suite:** 1693/1693 PASS.

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

**M-1 (B-124) — Newtab Save CTA error UX is fully silent.** `newtab/newtab.js:561-584` `_promoteFloatingTab` swallows ALL `MSG_PROMOTE_TAB` rejections (`ERR_SAFE_MODE`, `ERR_DUPLICATE_URL`, `ERR_VALIDATION`, etc.) without ANY user feedback — no toast, no animation, no focus-return cue, no row-state change. R2 §61.2.3 marked silent-degrade as `R3-VERIFY`; R3 picked it without UAT confirmation. Sidepanel CTA surfaces specific toasts via `showToast`. Cross-surface UX divergence; for keyboard-only users there is no recovery path. Fix: add a minimal `aria-live="polite"` announcer surface OR a brief visual error flash on the row. (Overlaps with [code-reviewer] M-2.)

**M-2 (B-122) — Drop on Open Tabs section silently promotes to "after last top-level group".** `sidepanel/sidepanel.js:5530-5625` `_computeGroupPromoteTarget` does not exclude `.open-tabs-section` from the hit-test. When the user releases the pointer over Open Tabs (which sits below all `.group-section` in DOM order), the helper falls into the "below last sectionBottom" branch (`:5571-5575`) and returns `{mode:'PROMOTE', insertAfterGroupId: lastTopLevelId}`. R2 §62.8 documented this as F-1 UAT-time risk; the indicator translateY anchors at the last top-level group's bottom — far above the user's pointer over Open Tabs — so there is NO visual signal during drag. Pre-emptive fix: add `const hit = document.elementFromPoint(x, y); if (hit?.closest?.('.open-tabs-section')) return null;` after the X-bounds check at line 5574. (Overlaps with [code-reviewer] M-4.)

**M-3 (B-124) — WCAG AA contrast matrix (R2 §61.6) was pre-computed at R2 but is NOT encoded as test assertions.** R2 §61.6.1 produced a 17-cell Dimension 1 matrix (16 PASS / 1 FAIL solarized-light); R2 §61.6.3 prescribed `ACCEPTED_LIMITATIONS` allow-list mirroring B-117 §57.5.1; R2 §61.6.2 mandated R3 COMPUTE the 14-cell Dimension 2 hover-CTA matrix and assert each cell ≥4.5:1. None of these assertions appear in `tests/b124-floating-visual.test.js`. T-124-G regex-pins the `--floating-bar-color: var(--live-indicator)` token but does NOT pin per-theme color values nor verify any contrast-ratio computation. A future change to `--live-indicator` on any theme will not produce a test signal. B-117 set the precedent (themes get matrix-pin tests with `ACCEPTED_LIMITATIONS` arrays). Fix: add `tests/b124-floating-bar-contrast.test.js` mirroring `tests/b105-solarized-light-contrast.test.js` shape — iterate 14 themes × `--floating-bar-color` vs `--bg-primary` ≥3:1 with the solarized-light carve-out; add Dimension 2 assertion for `--text-primary` on `--bg-hover` ≥4.5:1.

### LOW

- **L-1 (B-124)** — Cross-surface aria-label inconsistency for Save CTA. Sidepanel `"Save as bookmark"` constant; newtab `"Save as bookmark: ${title}"` interpolated. Pick one and apply uniformly. (Overlaps with [code-reviewer] L-2 + [security-reviewer] L-1.)
- **L-2 (B-124)** — Save CTA construction logic duplicated between `buildFloatingTabRow` (`sidepanel.js:2911-2924`) and the patch-path defensive branch (`:3111-3125`). Extract `_buildFloatingSaveCta()` helper. (Overlaps with [code-reviewer] M-3.)
- **L-3 (B-124)** — `.item-floating-bar` defensively recreated in patch path (`sidepanel.js:3105-3109`) despite no documented stripper code path. Document the suspected stripper or remove the defensive block.
- **L-4 (B-124)** — Save CTA appears BEFORE Close button in newtab floating row (`newtab/newtab.js:1083-1107`). `+` and `×` are visually similar and adjacent — keyboard arrow-key users could pick the wrong action. Verify in UAT; consider visible separation.
- **L-5 (B-122)** — `_computeGroupPromoteTarget` "fallback to insert at top" (`sidepanel.js:5601-5621`) silently triggers for ANY in-section pointer, not just the documented "above-own-parent" case. Dragging over a different top-level group's body falls back to insert-at-top. Distinguish (a) above first-section.top → insert at top, (b) inside a section body → use previous group's id as anchor. (Overlaps with [code-reviewer] L-4.)
- **L-6 (B-122)** — Test coverage missing for two F-class risks. No integration tests for drop-on-Open-Tabs (M-2) or drag-over-non-parent-section-body (L-5). Add T7 + T8.
- **L-7 (B-124)** — Active+floating row loses the `--active-border` color cue (`sidepanel/sidepanel.css:626-628`). Source order means `[data-floating]` wins → `border-left-color: transparent`; active state communicated via background tint only. UAT must verify perceptibility on each of the 14 themes.
- **L-8 (B-124)** — T-124-B asserts helper structure but does NOT exercise the runtime aria-label string. A future regression where `parts.join(', ')` separator changes would not be caught. Add a unit test that calls `_applyFloatingRowAriaLabel` with all flags set, asserts the literal string output.
- **L-9 (B-124)** — Save CTA missing `flex-shrink: 0` (`sidepanel.css:660-674`). Inheritance is benign today but a future refactor losing parent's `flex-shrink: 0` could collapse the CTA. One-line defensive add.
- **L-10 (B-122)** — PROMOTE carve-out from `!state.pendingTargetGroupId` check (`sidepanel.js:4615-4620`) has subtle ordering coupling. A future engineer adding a 4th mode might miss the conditional. Refactor to a named local: `const needsTarget = state.pendingMode !== 'PROMOTE'`.
- **L-11 (B-124)** — Docstring inaccuracy at `sidepanel.js:2964-2967` claims "this CTA promotes a SIBLING (different URL by construction)". Per [code-reviewer] M-1, factually incorrect. Either add `_findDuplicateSavedItem` pre-check (UX parity with Open-Tabs Save) or update docstring to describe the SW post-dispatch ERR_DUPLICATE_URL fallback.

### Notes / observations

**Empty-state coverage (CLAUDE.md C-9, B-124):** zero-floating-tabs / collapsed-parent / deleted-group-mid-click paths all handled correctly in code (`sidepanel.js:2980-2982` + `newtab.js:564-566` fall back to `groupId: null`). Missing: a unit test for the deleted-group fallback. Defer-acceptable.

**Accessibility checklist (B-124):** Dotted-vs-solid non-color cue OK (AC5). `:focus-within` reveal OK (T-124-H). Save CTA `:focus-visible` outline OK. Tab order requires 2 Tab presses to reach the CTA — note in UAT. WCAG Dimension 1: 16 PASS / 1 FAIL (solarized-light pre-existing per B-117 precedent); R7 user-manual `themes.md` entry not yet authored.

**Race-guard correctness (B-122):** F-5 third branch verified at `sidepanel.js:4643-4662` — both invariants present. Toast UX consistent with NEST + REORDER. T5 source-text pin only, not behavioral.

**Drop-zone fallback (B-122):** Documented "covers F-1 above-parent edge" actually fires for any in-section pointer (see L-5). F-1 Open Tabs section drop NOT excluded (see M-2 — both reviewers flagged independently). Mid-drag scroll: cache + pointer Y are both viewport-relative — relationship preserved correctly.

**Keyboard parity (AC6):** Unchanged. T4 regression-guards `filterGroupParentCandidates`. B-007 dialog parent-picker promotion path unaffected.

**Drag indicator visibility (Q2):** PROMOTE reuses `groupReorderIndicatorEl` — single DOM element, single CSS class `.group-reorder-indicator`. T3 verified by source-text + CSS regex. AC2 satisfied.

**Cross-item:** Both satisfy DoR/DoD structurally. R6 close stubs (§61.10, §62.11) to be populated post-R5. Both integrate cleanly with B-123 row-alignment work landing in the same sprint. No new permissions, no manifest changes, no new message types, no storage schema impact. All 1693 tests pass.

### UAT must explicitly walk

1. Newtab Save CTA error paths (per M-1) — verify each error code (ERR_SAFE_MODE / ERR_DUPLICATE_URL / ERR_VALIDATION) on the newtab surface and capture PASS/FAIL on the error-feedback dimension.
2. Drop-on-Open-Tabs gesture (per M-2 / [code-reviewer] M-4).
3. Drop-on-non-parent-top-level-section-body gesture (per L-5).
4. Active+floating row state perception across all 14 themes (per L-7).
5. Keyboard reach to Save CTA via Tab — verify 2-tab-presses path (row → CTA) is intuitive.

**Net QA assessment:** Bundle is largely clean — no CRITICAL or HIGH findings. Three MEDIUM (M-1 newtab silent error UX, M-2 Open Tabs drop ambiguity, M-3 missing WCAG contrast tests) reflect real polish-tier expectations not met; M-1 + M-2 each overlap a [code-reviewer] MEDIUM, increasing confidence that they are the correct gates to address. Eleven LOW findings document maintainability + coverage gaps that can be deferred.

---

## Wave 3 fix-round scoping ([scrum-master] decision 2026-04-29)

Per CLAUDE.md tier rules, MEDIUM is "fix if time permits" — not blocking R5. But cross-reviewer convergence is a strong fix signal:

**Fix in Wave 3a (small fix-round, before R5):**
1. **Open Tabs section reject-guard** ([code] M-4 + [qa] M-2) — pre-emptive UAT-cost saver; R2 §62.9 F-1 explicitly deferred to UAT but the fix is a 5-line addition matching the existing `_computeGroupDropTarget:5462` pattern.
2. **Docstring inaccuracy** ([code] M-1 + [qa] L-11) — replace the "different URL by construction" claim with accurate description of SW post-dispatch ERR_DUPLICATE_URL handling. (Skip the alternative fix of wiring `_findDuplicateSavedItem` into `_onFloatingSaveCtaClick` — that is a behavior change beyond R2 §61.4 scope.)
3. **aria-label cross-surface parity** ([code] L-2 + [qa] L-1 + [security] L-1) — drop URL from newtab to match sidepanel + R2 §61.8 spec. Add T-124-? cross-surface parity assertion.
4. **WCAG contrast matrix tests** ([qa] M-3 only) — add `tests/b124-floating-bar-contrast.test.js` mirroring B-117 / B-105 pattern. R2 §61.6 pre-computed the matrix; encoding as test assertions closes the regression-coverage gap.

**Defer (R2-sanctioned or low-impact):**
- Newtab silent-degrade ([qa] M-1 / [code] M-2) — R2 §61.2.3 sanctioned silent-degrade; revisit in polish if UAT surfaces it.
- `.item-indicators` duplication refactor ([code] M-3 / [qa] L-2) — refactor opportunity, not a bug.
- All other LOW findings (8 items) — maintainability + coverage gaps; defer to polish backlog.


