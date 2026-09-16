# Phase 4 Complete

## 1. Executive Summary

Phase 4 (Connector Foundation + External Knowledge Ingestion) is implemented,
tested, and regressed. A provider-neutral connector layer ingests Crossref and
Zotero records into the Phase 3 knowledge store with deterministic identity,
mandatory provenance, dry-run safety, idempotent imports, user-authored
precedence, and explicit sync state — additive only, zero new dependencies, no
LLM calls, no polling daemon, no RAG/Phase 2/Phase 3 behavior changes.

## 2. What Was Built

- `src/lib/connectors/` (21 files): shared core, types, errors, capabilities,
  security, normalization, identity, evidence, import engine, registry,
  Crossref/Zotero adapters, sync machine, web fallback, renderer API, barrel,
  fixtures, 4 test files.
- `electron/connectorStore.mjs` + `connectorStore.test.mjs`: v9 tables,
  durable import execution, sync runs, IPC-side validation.
- SQLite `SCHEMA_VERSION 8→9` (`migrateV9`, additive).
- `research:connectors` IPC (11-op allowlist) + one preload method.
- `ConnectorPanel` mounted in `KnowledgeSearchPanel` (DOI lookup → dry run →
  import with provenance display).
- Docs: pre-implementation, architecture, benchmark, completion.

## 3. Connector Architecture

Provider → Adapter → ExternalItem → Identity → Knowledge mapping → Evidence →
Store → Result. `connectorCore.mjs` is the renderer/Electron SSOT (mirrors
`knowledgeCore.mjs`). Full detail:
`docs/OPENBENTT_PHASE_4_CONNECTOR_ARCHITECTURE.md`.

## 4. Connector Registry

Static registry (`connectorRegistry.ts`): `crossref@1.0.0`,
`zotero@1.0.0` with declared capabilities/entity types/operations. Unknown ids
rejected (`invalid_connector`); no dynamic loading.

## 5. Crossref

Boundary over existing `crossrefClient` behavior: SEARCH, FETCH_ITEM,
METADATA, AUTHORS, IDENTIFIERS (CITATIONS honestly omitted). Bounded
SSRF-safe fetch, typed errors, deterministic normalization. Reuses the
polite-pool UA; no secrets.

## 6. Zotero

Boundary over the existing Zotero integration: FETCH_COLLECTION, FETCH_ITEM,
METADATA, AUTHORS, IDENTIFIERS, IMPORT. Keys stay namespaced (`zotero:<key>`);
attachments/notes excluded from fetch and never auto-downloaded; API key in
headers only via the existing `zoteroSecretStore.mjs` vault.

## 7. Normalized External Item

Bounded, sanitized, credential-free `ExternalItem` (200 items/import, 2MB
responses, 15s timeout, 3 redirects, JSON depth/breadth guards).

## 8. Identity Resolution

DOI → stable provider id → deterministic metadata → null-on-low-confidence.
Reuses `paperIdForDoi`/`entityIdFor`/normalizers verbatim; external ids stay
namespaced. Stable across re-imports (test-asserted).

## 9. Provenance

Phase 2 `SourceRef` reused verbatim (`connector_<id>` / slash-free `cc_*`
ids, both `ID_RE`-safe). Connector trail (`connectorId externalId url?
retrievedAt providerVersion?`) rides as an additive optional `connector` key
in persisted `source_json`; both validators ignore unknown keys, so all old
rows and readers are unaffected. Historical evidence is never mutated.

## 10. Evidence

Paper entities get direct connector evidence; persons are evidenced through
their AUTHORED_BY relationship evidence; provider-version marker evidence per
import enables staleness tracking. Dedupe key: chunk + type + quote.

## 11. Import Lifecycle

Validate → resolve → map via existing extractors → merge (create/enrich,
fill-missing props, union aliases/tags/externalIds) → dedupe rels/evidence →
hash + link + sync run. Per-item isolation; entities written before
relationships/evidence (no dangling refs). Statuses: created / updated /
unchanged / skipped / conflict / failed.

## 12. Dry Run

Validation + normalization + identity + hash-compare + conflict detection
with zero mutation (both renderer and Electron paths, test-asserted).

## 13. Conflict Handling

User-authored names/descriptions never overwritten; external values kept as
provider evidence; conflicts returned with both values; item status
`conflict`. No truth adjudication.

## 14. Idempotency

Content hash (`itemHashFor`) stored per connector+external id. Re-import with
identical content → `unchanged`, zero entity/relationship/evidence growth
(test-asserted on both paths).

## 15. Sync State

`never_synced → syncing → synced | partial | failed` with illegal-transition
rejection; persisted runs (latest 200/connector) with counts + redacted
errors. Missing externals marked stale, never deleted. No polling daemon.

## 16. Persistence

v9 tables: `connector_sources`, `connector_items`, `connector_sync_runs`,
`connector_item_links` (FK → knowledge entities). Parameterized SQL; EXPLAIN
confirms indexed access on all critical queries (PK lookups + `idx_crun_connector`).
Web fallback: bounded localStorage, explicitly non-durable across runtimes.

## 17. IPC

`research:connectors` with 11-op allowlist
(list/get/capabilities/preview/dryRun/import/syncStatus/sync/syncRuns/
entityFor/disconnect/reset). Unknown ops/connectors rejected (test-asserted).
Preload: one `connectors(op, payload)` method on the existing bridge.

## 18. Security

SSRF-safe URL policy reused + per-hop redirect revalidation; header
allowlisting; size/timeout/content-type/JSON-shape caps; case-folded tag
unions; `safeError` + `redactConnectorSecrets` (test-asserted); sync state
never stores secrets; external strings rendered as plain text only.
Electron security + pack-manifest gates pass.

## 19. UI

`ConnectorPanel` (status/capabilities/last sync, Crossref DOI lookup, staged
provenance, dry-run/import counts) inside `KnowledgeSearchPanel`; imported
entities surface in existing Entity/Relationship/Evidence panels. No new
routes, no marketplace.

## 20. Testing

- `connectors.test.ts`: 27 (registry, caps, normalize, identity, hash, SSRF,
  bounded fetch, errors, redaction, provenance, sync).
- `connectorImport.test.ts`: 10 (dry run, idempotency, conflicts, partial
  failure, allowCreate=false, evidence scope, dedupe, tag folding).
- `connectorIntegration.test.ts`: 1 (fixture → searchable → re-import no-op →
  update → malformed isolation).
- `benchmark.test.ts`: 1 (measured timings).
- `electron/connectorStore.test.mjs`: 7 (v9 migration + intact data,
  sources/hashes/links/runs/reset, import + evidence, dry-run/preview,
  user conflicts, failure isolation + no auto-delete, IPC allowlist).
- Synthetic fixtures only; no live-API dependency.

## 21. Benchmark

See `docs/OPENBENTT_PHASE_4_BENCHMARK.md` (actual measured output):
normalize 100 in ~5ms / 1000 in ~17ms; import 100 in ~9ms; duplicate x100 in
~4.5ms; 1000 items in 5×200 batches ~230ms; search/evidence/ID lookups
sub-millisecond. 10k scale NOT tested; Electron SQLite timings NOT measured.

## 22. Regression Results

- `npx vitest run`: 96 files, 400 passed, 1 skipped — green.
- `npm run test:electron`: 85 passed (incl. 7 new connector tests) — green.
- `npm run build` + `test:csp` + `lint:electron-security` + `lint:electron-pack` — pass.
- `npx eslint .`: 0 errors (56 pre-existing warnings, none in Phase 4 files).
- `tsc -p tsconfig.app.json`: 54 pre-existing errors, 0 in Phase 4 files
  (baseline was already red; verified via stash comparison).
- Playwright: 5 passed, 4 skipped (pre-existing gates) — green.
- Phase 2 (`src/lib/documents/`, extraction, chunking, SourceRef, URL policy),
  Phase 3 (`knowledgeCore`, identity, extract, validation, merge, traversal,
  `knowledgeStore.mjs`), and all RAG constants untouched — verified via
  `git diff` (no modifications in those paths).
- Pre-existing uncommitted Phase 3 work (untracked `src/lib/knowledge/`,
  `electron/knowledgeStore.*`, graph-panel wiring) was left as found.
- Two test-maintenance edits used the canonical version function instead of
  stale literals (`knowledgeStore.test.mjs` floor assertion,
  `researchProjectService.test.mjs` live `getSchemaVersion()`).

## 23. Files Changed

Tracked modifications (Phase 4 only):

- `electron/researchDb.mjs` — `SCHEMA_VERSION 8→9` + additive `migrateV9`.
- `electron/researchProjectService.mjs` — `research:connectors` handler.
- `electron/preload.cjs` — one `connectors(op, payload)` method.
- `electron/researchProjectService.test.mjs` — canonical version assertion.
- `package.json` — connector electron test + `connectorCore.mjs` pack entry.

New files:

- `src/lib/connectors/` — 21 files (core, adapters, engine, tests, fixtures).
- `electron/connectorStore.mjs`, `electron/connectorStore.test.mjs`.
- `src/components/knowledge/ConnectorPanel.tsx`; `KnowledgeSearchPanel.tsx`
  mount (inside previously-untracked Phase 3 directory).
- `docs/OPENBENTT_PHASE_4_{PREIMPLEMENTATION,CONNECTOR_ARCHITECTURE,BENCHMARK,COMPLETION}.md`.

Also touched (required compat): `electron/knowledgeStore.test.mjs`
(version-floor assertion; file itself is uncommitted Phase 3 work).

Migration version: 9. No commits or pushes made (per instructions).

## 24. Known Limitations

1. `tsc` baseline is red (54 pre-existing errors); Phase 4 adds none.
2. User-authored precedence keys on `provenance=user-authored` (pinned at
   creation by Phase 3); connector-imported rows later edited by the user keep
   `automatic` provenance and can be renamed by re-import (conflict path
   covers only true user-originated rows).
3. Person entities carry no direct entity evidence (Phase 3 extractor design);
   they are evidenced via AUTHORED_BY relationship evidence.
4. Zotero renderer fetch path (`zoteroFetchLibrary`) is implemented but not
   wired to a UI collection picker; DOI/Crossref is the primary UI path.
5. Single bounded retry budget for 429s is documented, not implemented.
6. 10k-item scale and Electron SQLite timings not measured.
7. Electron smoke/packaging runs not executed (headless environment).

## 25. Deferred Work

arXiv, Semantic Scholar, OpenAlex, PubMed, GitHub connectors; attachment →
Phase 2 document bridge; claim adjudication; polling/continuous sync; agents/
MCP/tools; cloud/multi-user; vector/graph stores; semantic entity matching;
LLM enrichment — all explicitly out of scope and none scaffolded.

## 26. Phase 5 Readiness

Phase 5 tools/agents can consume connector-backed knowledge through stable,
provenance-rich surfaces without touching connector internals:

```
External Sources → Connectors → Knowledge → Documents → Evidence → Future Tools/Agents
```

- `connectorApi.dryRun/import` + `research:connectors` IPC: the only
  ingestion entry points agents need.
- `ExternalItem` + `ConnectorDefinition` + capability gates: new providers
  plug in additively (extension guide §18 of the architecture doc).
- Evidence → SourceRef → connector trail gives agents verifiable provenance
  for every external fact, including retrieval time and provider version for
  staleness reasoning.
- Dry-run/conflict/idempotency semantics let future agents preview and apply
  ingestion safely with no local mutation surprises.
