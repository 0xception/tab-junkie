## 9. Performance Standards

| Metric | Target | Owner | Current status |
|---|---|---|---|
| Single-item read round-trip (`getItem`) | P95 < 20ms on 1k-item collection | B-001a | Verified in `tests/perf.test.js` via chrome-mock |
| Single-item write round-trip (`updateItem`) | P95 < 20ms on 1k-item collection | B-001a | Verified in `tests/perf.test.js` via chrome-mock |
| `writeTransaction` serialization under concurrent callers | No lost updates | B-001a | Verified in integration tests |
| Migration run over max realistic dataset (1k items, 100 groups) | < 500ms in chrome-mock | B-001b (AC9) | Verified in migration perf test |
| `LiveTabIndex` cold-start rebuild (50 open tabs) | < 100ms in chrome-mock | B-001c (AC1) | Verified in live-tab perf test |
| `TabClaims` reconciliation (500 items, 50-tab index) | < 50ms in chrome-mock | B-001c (AC10) | Verified in claims perf test |
| Drift write round-trip (`writeDrift`) | P95 ≤ 20ms in chrome-mock | B-001d | Verified in drift perf test |
| Floating-group re-association (50 records) | ≤ 100ms in chrome-mock | B-002 | Verified in floating-groups perf test |
| Real-browser perf (`chrome.storage.local`, not mock) | not measured | — | UAT validated correctness only — real-browser latency is unverified |
| Sidepanel first paint | < 200ms (500-item) | B-022 | Deferred — UI not yet built |
| Fuzzy search P95 | < 50ms (1k-item) | — | Deferred — search not yet in scope |

---

