# Openbentt Phase 6 — Benchmark

Measured 2026-09-17 via `npx vitest run src/lib/agent/benchmark.test.ts`
(stubbed instant model; in-memory backends; local dev host). Actual console
output — runtime overhead only, never provider latency.

```
system prompt assembly x1000: 16.8ms
proposal parsing x1000: 0.9ms
no-tool run x50: median 0.02ms p95 0.11ms
2-tool run x20: median 0.02ms p95 0.33ms
audit record x200 (localStorage): 21.5ms
```

Notes:

- Runtime overhead is sub-millisecond per turn; total run latency in
  production is dominated by model provider latency (not measured here by
  design — see instructions §24) and tool execution (measured in Phase 5:
  knowledge.search median 0.08ms; full tool figures in
  `OPENBENTT_PHASE_5_BENCHMARK.md`).
- SQLite audit persistence cost not measured here (ledger writes are one
  indexed INSERT per event; Phase 5 migration verified index use via
  EXPLAIN).
- Rerun: `npx vitest run src/lib/agent/benchmark.test.ts`.
