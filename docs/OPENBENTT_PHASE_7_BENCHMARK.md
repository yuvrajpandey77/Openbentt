# OPENBENTT PHASE 7 — BENCHMARK

> Local application performance only. Provider latency is NOT benchmarked
> (no live credentials; network calls are stubbed in tests).

## Method

`node --input-type=module` micro-measurements (Apple/Linux CI comparable)
+ existing vitest benchmark suites (`benchmark.test.ts` × 3). Machine:
repo CI container, Node 24, single run (indicative, not statistical).

## New Phase 7 paths (this phase)

| Operation | Scale | Time |
|---|---|---|
| `externalResourceId` | ×1000 | 5.5 ms |
| connection transition | ×1000 | 8.8 ms |
| Drive normalize | ×1000 | 7.9 ms |
| Drive URL build | ×1000 | 37.3 ms |

## Regression baselines (unchanged code, re-measured)

| Suite | Result |
|---|---|
| Agent prompt assembly ×1000 | 71.5 ms |
| Agent proposal parsing ×1000 | 3.9 ms |
| Agent no-tool run (median/p95, ×50) | 0.19 / 0.51 ms |
| Tool registry lookup ×1000 | 0.4 ms |
| Tool schema validation ×1000 | 10.8 ms |
| Tool policy evaluation ×1000 | 2.8 ms |
| `knowledge.search` (median/p95, ×50) | 0.13 / 0.47 ms |
| Crossref normalize ×100 / ×1000 | 12.1 / 77.1 ms |
| Identity resolution ×100 | 2.7 ms |
| Item hashing ×100 | 5.4 ms |
| Duplicate import ×100 | 13.9 ms (100 unchanged) |
| Knowledge insert/lookup/search/traversal | 16.8 s suite (unchanged scale) |

No Phase 0–6 benchmark regressed beyond run-to-run noise (policy +2.8 ms
vs 2.1 ms documented — same order, larger registry of 18 tools).

## Budgets

All new local paths are sub-50 µs/op; unified-search merge is O(n log n)
over ≤ 200 bounded hits. No new dependency, no bundle change of note
(UI components are route-lazy with Settings).
