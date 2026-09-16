# Openbentt Phase 3 Changelog — Knowledge Model + Ontology Foundation

No commits made by the implementation (working tree only).
Conventions: `M` modified, `A` added.

## Added (renderer `src/lib/knowledge/`, 16 files)

- A `types.ts` — KnowledgeEntity/Relationship/Evidence/MergeRecord/type
  definitions, origins, statuses, confidence, `KnowledgeEnricher` stub.
- A `knowledgeCore.mjs` — single-source registries/limits/normalize/identity
  shared with Electron (packed via `build.files`, assert in pack gate).
- A `entityTypes.ts`, `relationshipTypes.ts`, `normalize.ts`, `identity.ts`,
  `limits.ts` — typed facades over the core (parity-tested).
- A `validation.ts` (+ `validationTypes.ts`) — AppError-coded input boundary.
- A `stale.ts` — version-stamp stale semantics + version-id parsing.
- A `traversal.ts` — cycle-safe bounded BFS core (depth ≤3, nodes ≤500).
- A `extract.ts` — deterministic document/Zotero/Crossref extraction.
- A `exportImport.ts` — `openbentt-knowledge-v1` JSON round-trip.
- A `webStore.ts` — localStorage backend (same op surface, offline-first).
- A `index.ts` — barrel.
- A `core-parity.test.ts`, `normalize.test.ts`, `validation.test.ts`,
  `extract.test.ts`, `graph.test.ts`, `benchmark.test.ts` (27 tests).

## Added (knowledge services + UI)

- A `electron/knowledgeStore.mjs` (+ `.test.mjs`, 7 tests) — durable v8 store.
- A `src/lib/research/knowledgeApi.ts` — desktop IPC + web fallback.
- A `src/components/knowledge/{EntityPanel,EvidenceList,RelationshipList,KnowledgeSearchPanel}.tsx`
- A `test/fixtures/knowledge/synthetic-graph.json`

## Added (docs, 4 files)

- A `docs/OPENBENTT_PHASE_3_PREIMPLEMENTATION.md` (16-question audit)
- A `docs/OPENBENTT_ONTOLOGY.md`
- A `docs/OPENBENTT_PHASE_3_KNOWLEDGE_MODEL.md` (incl. ADRs)
- A `docs/OPENBENTT_PHASE_3_CHANGELOG.md` (this file)

## Modified (8 files)

- M `electron/researchDb.mjs` — `SCHEMA_VERSION 7→8`, `migrateV8` (7 tables,
  11 indexes), new `getSchemaVersion()` export. Nothing else touched.
- M `electron/researchProjectService.mjs` — `initResearchStorage` returns live
  schema version; new `research:knowledge` IPC (16-op allowlist, existing bridge).
- M `electron/preload.cjs` — `openbenttResearch.knowledge(op, payload)` (+1
  method; still 5 bridge surfaces).
- M `electron/researchProjectService.test.mjs` — schemaVersion 6→8 (intentional;
  literal was stale since Phase 2 v7).
- M `scripts/check-electron-pack-files.mjs` + `package.json` (`build.files`,
  `test:electron` += knowledgeStore, `bench:knowledge`) — pack coverage for
  `knowledgeCore.mjs`. No dependency changes.
- M `src/vite-env.d.ts` — `knowledge` on `OpenbenttResearchApi`.
- M `src/lib/research/workspaceLayout.ts` + `src/config/researchPanelNav.ts` +
  `src/components/research/ResearchSidePanel.tsx` — additive `"graph"`
  ("Knowledge graph") panel; existing `"knowledge"` panel untouched.

## Dependencies

Zero additions, zero removals, zero version bumps.

## Behavior changes (intentional, documented)

1. New SQLite tables on desktop first-run (v8; old data preserved; `.bak`
   recovery unchanged).
2. New `research:knowledge` IPC op namespace (allowlisted; validated; generic
   errors only).
3. New optional `graph` side panel (opt-in via rail; no layout/route changes).
4. `research:init` reports the real schema version (8, was stale 6).
