# Openbentt Phase 4 — Benchmark

Measured 2026-09-16 via `npx vitest run src/lib/connectors/benchmark.test.ts`
(in-memory backend; synthetic Crossref payloads; machine: local dev host).
Results are actual console output, not estimates.

```
normalize 100 crossref items: 5.4ms
normalize 1000 crossref items: 17.4ms
identity resolution x100: 0.8ms
item hashing x100: 1.2ms
import 100 items: 9.0ms (created 100, entities 305, rels 300, ev 500)
duplicate import x100: 4.5ms (unchanged 100)
import 1000 items (5x200 batches): 230.3ms (created 1000, entities 3305)
search after import: 0.6ms (hits 1)
evidence lookup x100 subjects: 4.0ms (rows 64)
external ID scan (3305 entities): 0.4ms (doi 1100)
normalize zotero fixture x100: 1.7ms
```

Notes:

- Bulk imports are deterministically capped at 200 items per call; 1000-item
  ingestion runs as 5 sequential batches (partial failure isolated per batch
  and per item).
- Duplicate import cost is hash-compare only (no entity/relationship/evidence
  growth — asserted by integration tests).
- Evidence lookup figure covers 100 subjects against ~5.5k evidence rows.
- 10k-item scale was NOT tested; SQLite-backed (Electron) timings are expected
  to be slower than these in-memory figures and were not measured here.
- Rerun with `npm run bench:connectors` equivalent:
  `npx vitest run src/lib/connectors/benchmark.test.ts`.
