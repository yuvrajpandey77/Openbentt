# Openbentt Phase 3 — Knowledge Model + Ontology Foundation

**Status:** IMPLEMENTED (working tree only; no commits per phase rule).
**Base:** Phase 2 working tree (`openbentt@2.2.5`). **Pre-audit:**
`docs/OPENBENTT_PHASE_3_PREIMPLEMENTATION.md`. **Ontology reference:**
`docs/OPENBENTT_ONTOLOGY.md`. **Changes:**
`docs/OPENBENTT_PHASE_3_CHANGELOG.md`.

Principle: durable entities + typed relationships + evidence + provenance +
versioning + safe retrieval. No agents/MCP/connectors/auth, no graph database.

## 1. Architecture

```
DOCUMENT INTELLIGENCE (Phase 2, unchanged)
  Structured Blocks
    ↓ deterministic extraction (extract.ts — no LLM)
  Entities ←→ Relationships (typed, directed, status-bearing)
    ↓ every assertion paired with Evidence
  Evidence → SourceRef (Phase 2 verbatim) → document/version/page/section/block/chunk
    ↓ durable SQLite v8 (desktop) / localStorage (web)

Retrieval: document RAG (frozen) + knowledge search/traversal → evidence-joined answers (later phase)
```

## 2. Layers

- `src/lib/knowledge/knowledgeCore.mjs` — single-source registries, limits,
  normalization, identity (shared renderer + Electron, repo `.mjs` precedent).
- `src/lib/knowledge/*.ts` — typed facades + validation (AppError) +
  extraction + traversal + export/import + `KnowledgeEnricher` stub.
- `electron/knowledgeStore.mjs` — durable CRUD/search/traverse/merge/stale/
  export over v8 tables (same DB ownership as researchDb, parameterized SQL).
- `src/lib/knowledge/webStore.ts` — same op surface on localStorage (web).
- `src/lib/research/knowledgeApi.ts` — desktop IPC with web fallback.
- IPC: single `research:knowledge` channel + op allowlist on the existing
  `openbenttResearch` bridge (preload +1 method, still 5 surfaces).

## 3. Entity types — implemented / deferred

Implemented (13): person, organization, paper, venue, method, dataset,
metric, model, technology, concept, location, event, product — each justified:
papers/authors/venues/methods/datasets/metrics from academic + Zotero +
Crossref evidence; technology/model/product/location/event from research docs.
Deferred: company/research-lab/benchmark/experiment/hypothesis/claim as named
types — registrable via `registerEntityType` without rewrites; generic
`concept` + `RELATED_TO` cover their uses today.

## 4. Relationship types — implemented / deferred

Implemented (18): AUTHORED_BY, PUBLISHED_BY, PUBLISHED_IN, CITES,
REFERENCES, USES_METHOD, EVALUATED_ON, REPORTS_METRIC, PROPOSES, EXTENDS,
REPRODUCES, BUILT_WITH, USES, DEPENDS_ON, DERIVED_FROM, PART_OF,
LOCATED_IN, RELATED_TO. Each has an evidence source (metadata, Zotero,
Crossref, DOI references, user). Deferred: finer workflow relations
(VALIDATED_BY, FUNDED_BY…) — no current evidence source; add when connectors
arrive.

## 5. Evidence + provenance

Every extracted relationship is created with Evidence carrying the full
SourceRef chain; UI panels render Document · Page · Section · quote · status.
Stale (doc advanced), retracted, and missing-source states are explicit; the
enrichment helper refuses citation-less assertions.

## 6. RAG integration (preserved)

Unchanged: MiniLM-384, 480/80, TF-IDF, RRF constants, workers, storage.
Knowledge search is a parallel local path (name/alias/identifier/type/
document), not a ranker replacement. `toLegacyCorpusChunks`/SourceRef flows
untouched.

## 7. Database

v7 → v8 additive (`migrateV8`): `knowledge_entities` (+ aliases/identifiers/
tags tables), `knowledge_relationships`, `knowledge_evidence`,
`knowledge_entity_merges`, 11 indexes (all verified via EXPLAIN QUERY PLAN).
Also fixed `initResearchStorage` returning a stale `schemaVersion: 6` literal
→ live `getSchemaVersion()` (existing test updated + documented).

## 8. ADRs

- **ADR-1 storage:** SQLite v8 tables, not a graph DB — scale fits (10k
  entities/100k rels bounded), zero deps, same ownership/backup story.
  Tradeoff: no Cypher/Gremlin; traversal is BFS in the store with hard caps.
- **ADR-2 identity:** normalize→candidates, confirm via ids/merges; similar
  strings never auto-merge. Tradeoff: duplicates possible until merged —
  accepted (merges are safe/redirecting).
- **ADR-3 directionality:** directed edges, one symmetric type. Tradeoff:
  queries specify direction — explicit and correct for citations/authorship.
- **ADR-4 provenance reuse:** SourceRef verbatim. Tradeoff: ontology inherits
  SourceRef gaps (approximate pageHint) — accepted, improves with Phase 2.
- **ADR-5 evidence model:** first-class Evidence rows (not edge properties) so
  multiple sources support one assertion and conflicts coexist. Cost: more
  rows — bounded (200/subject).
- **ADR-6 conflicts:** Relationship+Evidence suffices; no Claim table.
  Revisit if multi-party claim adjudication needs it.
- **ADR-7 merges:** redirect rows, no deletes. Cost: merged rows accumulate —
  bounded by entity cap, queryable history wins.
- **ADR-8 invalidation:** version-stamped evidence → stale, never
  auto-false/deleted; user rows immune to reindex. Tradeoff: stale rows need
  UI affordance (status shown) — shipped.
- **ADR-9 deterministic boundary:** metadata/Zotero/Crossref/BibTeX mapping
  only; `KnowledgeEnricher` is an unimplemented interface. No LLM dependency,
  no network, no telemetry — ontology works fully offline.

## 9. Tests / benchmarks

New: 27 vitest (parity 4, normalize 5, validation 5, extract 4, graph 8,
benchmark 1) + 7 node (`knowledgeStore`). Fixture:
`test/fixtures/knowledge/synthetic-graph.json`. Benchmark
(`bench:knowledge`, measured): seed 4+3 ≈ fast; 1000 entities + 999 rels
insert, lookups, 1/2/3-hop traversals printed (see validation run).

## 10. Deferred (explicit)

LLM enrichment, claim adjudication UI, connector-driven relations, IPC
wiring for `documentsStore` registry sync (Phase 2 note carries over),
cross-project knowledge federation, vector-backed entity similarity.
