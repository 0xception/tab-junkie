# Sprint 38 — R4 Findings (Deduplicated)

---

## Wave 1 — B-120 + B-126 — [code-reviewer]

**Reviewed:** `tests/b114-tint-v2.test.js` (docblock lines 4–15), `tests/b104-group-colors.test.js` (T10 docblock lines 382–396), `CLAUDE.md` (lines 378–388)
**Test suite:** 1,641/1,641 PASS · `./build.sh` exit 0

---

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM
_None_

### LOW
_None_

---

### AC Verification Summary

#### B-120

| AC | Description | Status |
|----|-------------|--------|
| AC1 | `tests/b114-tint-v2.test.js` file-header docblock updated | PASS — lines 8–15 now cite `2.806:1` (FAIL at 20%) and `4.639:1` (PASS at 7%); old "4.55:1 PASS, +0.049" claim removed |
| AC2 | `tests/b104-group-colors.test.js` T10 docblock updated | PASS — lines 387–395 now cite `2.806:1` (FAIL) and `4.639:1` (PASS); reference to B-117 §57.2.3 + §57.3.1 added |
| AC3 | Numerical values match design chapter | PASS — `docs/design/57-b-117-gc-matrix-audit.md` §57.2.3 row 8 confirms `2.806:1` for `atom-one-dark` + `yellow` at 20%; §57.3.1 verification table line 139 confirms `4.639:1` at 7% |
| AC4 | Zero assertion-body changes | PASS — `assert`, `expect`, and `test()` bodies are entirely unchanged in both files; only `/* … */` comment blocks modified |
| AC5 | No other test files touched | PASS — out-of-scope files (`b025`, `b109`) confirmed untouched per BACKLOG.md B-120 AC scope exclusion |

#### B-126

| AC | Description | Status |
|----|-------------|--------|
| AC1 | "CSS-token invariants" category added to contract-change-types enumeration | PASS — `CLAUDE.md:380` now includes `**CSS-token invariants asserted in test files (regex-pin tests on \`shared/themes.css\`, structural assertions on \`--<token>\` values, count-of-N assertions on token declarations)**` in the parenthetical list of contract-modification types |
| AC2 | Sprint 37 B-117 R3 b114 T1 escalation added as second blocking precedent | PASS — `CLAUDE.md:387` adds the bullet `**Sprint 37 B-117 R3 b114 T1 escalation**` with the exact mid-build failure description and file:line citation (`tests/b114-tint-v2.test.js:100`) |
| AC3 | Prose grammatically correct, consistent with sibling subsections | PASS — phrasing matches the bold-bullet pattern used by the existing Sprint 36 B-113 D-3 precedent; em-dash and comma usage consistent with surrounding text |
| AC4 | No other CLAUDE.md sections altered | PASS — verified by reading CLAUDE.md lines 340–399: only lines 378–388 (the Fix-scope subsection) contain changes; all other subsections (source-citation gate, R1/R2/R3/R4 round descriptions, etc.) unchanged |
| AC5 | Self-application of source-citation gate | PASS — the B-126 text cites "Sprint 37 B-117 R3" by name as a sprint-archive event reference (not a code claim); the B-118 `file:line` gate applies to source-code structure claims, not sprint-history references. `tests/b114-tint-v2.test.js:100` is cited inline as the test file:line. Gate correctly applied. |

---

### Notes

- Both ratio values (`2.806:1` and `4.639:1`) confirmed against `docs/design/57-b-117-gc-matrix-audit.md` as the canonical source. The design chapter is the only authoritative location for these computed values.
- The `+0.139 above the 4.5:1 floor` margin cited in `b114-tint-v2.test.js:13` is arithmetically correct (4.639 − 4.5 = 0.139).
- The SPRINT_ARCHIVE.md entry at line 2154 ("B-119 R2 contract-change definition was too narrow — missed `tests/b114-tint-v2.test.js` T1 active structural assertion") confirms the real-world precedent motivating B-126 is accurately described.
- The b104 T10 docblock now correctly distinguishes `§57.2.3 row 8` (2.806:1 FAIL source) from `§57.3.1` (4.639:1 PASS source). Cross-referencing with the design chapter confirms these section identifiers are accurate.

---

## Wave 1 — B-120 + B-126 — [security-reviewer]

**Reviewed:** `tests/b114-tint-v2.test.js` (docblock lines 4–15), `tests/b104-group-colors.test.js` (T10 docblock lines 382–396), `CLAUDE.md` (lines 378–388)
**Surface:** docs/test-comment only — no runtime code, no manifest changes, no message-passing changes, no storage-schema changes, no DOM-render changes.

**Verdict:** PROCEED — no security findings.

---

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM
_None_

### LOW
_None_

---

### Security Surface Audit

| # | Check | Result |
|---|-------|--------|
| 1 | Information leakage — secrets, credentials, internal URLs, PII | PASS — new prose cites only issue/precedent IDs (`B-113 D-3`, `B-117 R3 b114 T1`), section numbers (`§57.2.3`, `§57.3.1`), and computed contrast ratios (`2.806:1`, `4.639:1`). No secrets, tokens, credentials, internal hostnames, or PII introduced. |
| 2 | Untrusted-string / XSS — user-controllable data in new content | PASS — N/A. New content is hand-authored prose. No `innerHTML`-rendered paths affected. No bookmark titles, URLs, or any user-controllable strings introduced. |
| 3 | Security-policy drift — does new prose weaken existing CLAUDE.md security policy? | PASS — B-126 adds a new contract-change-type category (CSS-token invariants) and a new precedent bullet to the Fix-scope test-assertion enumeration subsection. No edits to "Security (Extension-Specific)", "Privacy & Compliance", "Code Quality", or any of the C-1..C-12 R2 correctness checks. Pure additive process gate. |
| 4 | Build-artifact integrity — zip shape preserved | PASS — `tab-junkie.zip` is 333K (341,134 bytes) / 86 files (`unzip -l` confirms `1036771` total bytes / 86 files). File count matches S37 baseline (86 files); content-byte delta is consistent with CLAUDE.md text expansion (~+1.5KB) plus the two test-file docblock edits. CLAUDE.md included (`40506` bytes); no `tests/` paths in zip listing (verified via `unzip -l … \| grep tests/` returning empty). |
| 5 | Permission minimization (C-6) | N/A — no `manifest.json` changes. Verified: zip listing shows manifest.json `1494` bytes unchanged from S37 baseline. |
| 6 | CSP / XSS / message-passing (C-2, C-3) | N/A — no runtime code, no message contracts, no service-worker changes. |
| 7 | Allow-list direction (C-7) | N/A — no sanitizer/validator/export surface changes. |
| 8 | Cross-reference accuracy — B-113 D-3 + B-117 R3 b114 T1 cites | PASS — verified against `docs/SPRINT_ARCHIVE.md`: line 2104 confirms B-113 R3 mid-build scope expansion to update `b048` AC6 assertion (matches CLAUDE.md:386 cite); line 2168 confirms B-117 R3 mid-R3 operational clarification needed for b114 active-assertion update (matches CLAUDE.md:387 cite). Both precedents are real and correctly described. |
| 9 | Numerical-claim verifiability — `2.806:1` and `4.639:1` ratios | PASS — both values cited match `docs/design/57-b-117-gc-matrix-audit.md` §57.2.3 row 8 (2.806:1 FAIL at 20%) and §57.3.1 verification table (4.639:1 PASS at 7%). Self-citation gate (B-118) satisfied. |

---

### Notes

- This is a pure-prose / pure-comment Wave 1 — there is no runtime attack surface introduced. Security review is a clean PASS.
- The CLAUDE.md addition strengthens process discipline (CSS-token invariants now explicitly require fix-scope enumeration), which is net-positive for downstream R2 → R3 correctness; no security-policy regression.
- Build-zip baseline confirmed: 86 files, CLAUDE.md present, tests excluded — same shape as S35/S36/S37 releases. No untracked files leaked into the artifact.
- No new external dependencies introduced. No `chrome.*` API usage changes. No CSP or `manifest.json` modifications.

---

## Anchor — B-125 — [code-reviewer] / [security-reviewer] / [qa-reviewer]

**Reviewed:** `background/tabs/tab-claims.js` (+48 LOC), `background/tabs/tab-events.js` (+15 LOC), `tests/b125-claim-jump-fix.test.js` (NEW, 5 cases)
**Test suite:** 1,646/1,646 PASS (1,641 baseline + 5 new B-125 tests)

**Verdict (all three reviewers):** PROCEED — 0 CRITICAL, 0 HIGH

---

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | Reviewer | File:line | Finding | Action |
|---|----------|-----------|---------|--------|
| M-1 | code-reviewer | `tab-events.js:147` | Pre-existing local `claimsMirror` shadows the module-level name in `tab-claims.js`. R3 added code adjacent (line 169) without flagging. | Defer — pre-existing, not introduced by B-125; rename to `claimsSnapshot` deferred to a future refactor sprint. |
| M-1 | security-reviewer | `tab-events.js:156-169` | Race window: `markInherited` runs after `await appendFloatingGroup`. The 100 ms `reevaluateTab` debounce provides adequate margin in practice but is not enforced by code. | **Fixed inline** — added explicit warning comment at the call site documenting the coupling and the "do not lower the debounce" invariant. |
| M-1 | qa-reviewer | `b125-claim-jump-fix.test.js:154-159` | T3 Phase 3's mid-test `__resetTabClaims()` clears `inheritedTabs` again, masking the `pruneInherited` runtime-through-reevaluateTab assertion. Phase 1/2 still verify the API contract directly. | Defer — Phase 1/2 cover the core contract; risk LOW given duplicate cleanup at the API level. |
| M-2 | qa-reviewer | (absence) | No test for `appendFloatingGroup` throw path (C-9(ii)). T1–T5 simulate the success path; the failure path where `markInherited` is never called is covered only by code-reading. | Defer — partial coverage via T2 regression guard; integration-level test deferred to UAT. |

### LOW
- code-reviewer L-1: `inheritedTabs.has(tabId)` direct access in `reevaluateTab` (vs exported `isInherited`) — design-intentional, same-module call. Defer.
- code-reviewer L-3 / security-reviewer L-3 / qa-reviewer L-1: T4 regex `/releaseClaimByTab\(/g` could false-positive on future comment-form call sites. Current source clean. Defer.
- security-reviewer L-1: pre-existing `console.warn` in opener-chain catch may surface PII. Predates B-125. Defer to documentation hygiene sweep.
- security-reviewer L-2: `markInherited` accepts any `number` without range validation. Trusted upstream input. Defer.
- qa-reviewer L-2: no multi-tab concurrent inheritance test (rapid Ctrl+click). `Set.add` guarantees this works. Defer.
- qa-reviewer L-3: §59.7 C-7 allow-list verification has no automated test. Integration concern. Defer to UAT.
- qa-reviewer L-4: accessibility N/A (SW-only change). Confirmed.

---

### AC Verification Summary (B-125)

| AC | Description | Status |
|----|-------------|--------|
| AC1 | Inherited tab does NOT auto-claim a URL-matching saved bookmark | PASS — T1 + T5 directly assert; gate at `tab-claims.js:250` placed inside `!alreadyClaimed` branch as designed |
| AC2 | User-initiated tab DOES still auto-claim | PASS — T2 regression guard |
| AC3 | `inheritedTabs` pruned on tab close | PASS — T3 Phase 1/2 (with M-1 caveat for Phase 3 robustness) |
| AC4 | B-099 D-1 invariant: exactly 4 `releaseClaimByTab` call sites | PASS — T4 static-analysis assertion |
| AC5 | User repro (xcelenergy → Workday) | PASS — T5 |
| AC6 | Symmetric prune in `windows.onRemoved` cascade | PASS — `tab-events.js:280` confirmed by [security-reviewer] |
| AC7 | `__resetTabClaims` clears the Set (test isolation) | PASS — `tab-claims.js:87` |

---

### Notes

- Security M-1 race comment added inline at `tab-events.js:169` before R5 to lock the debounce/storage coupling for future readers.
- All other MEDIUM/LOW findings are documentation-quality or pre-existing concerns, not B-125 regressions.
- `releaseClaimByTab` call-site count verified at exactly 4 by both T4 and the production grep.

