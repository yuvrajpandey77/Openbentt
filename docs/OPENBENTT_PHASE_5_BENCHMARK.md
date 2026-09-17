# Openbentt Phase 5 — Benchmark

Measured 2026-09-17 via `npx vitest run src/lib/tools/benchmark.test.ts`
(in-memory web backends; local dev host). Actual console output, not estimates.

```
registry lookup x1000: 0.2ms
schema validation x1000: 3.8ms
policy evaluation x1000: 0.9ms
knowledge.search x50: median 0.08ms p95 0.24ms
knowledge.get_entity x50: median 0.02ms p95 0.03ms
knowledge.get_relationships(depth2) x20: median 0.03ms p95 0.34ms
document.search x50: median 0.01ms p95 0.03ms
utility.calculate x100: median 0.02ms p95 0.05ms
100 mixed tool executions: 2.1ms (46549/s)
1000 calculate executions: 10.7ms (93522/s)
```

Notes:

- Overhead layers (lookup/validation/policy) are sub-microsecond per call;
  tool cost is dominated by the underlying service, as designed.
- Bulk figures include full input/output validation + audit event building
  (noop sink in this benchmark; SQLite/localStorage persistence not measured).
- `connector.search` (network) and `connector.import` (write path) are
  excluded from bulk benchmarks: their cost is provider/DB-bound, so
  throughput numbers would not be meaningful. Both are covered for
  correctness + idempotency in unit/integration tests.
- Rerun: `npx vitest run src/lib/tools/benchmark.test.ts`.
