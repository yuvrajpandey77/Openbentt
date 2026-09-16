# Openbentt Phase 5 — Pre-Implementation Reconnaissance

Version: openbentt@2.2.5 · SQLite SCHEMA_VERSION=9 · Date: 2026-09-17
Status: reconnaissance for Phase 5 (Tools Foundation + Controlled Execution).
No agents, no MCP, no agent loop — substrate only; caller is UI / deterministic service / explicit user action.

## 1. Current callable operations (wrap-only inventory)

### Knowledge reads (Phase 3)
- `knowledgeApi` (`src/lib/research/knowledgeApi.ts`): upsertEntity, getEntity,
  resolveEntity, searchEntities, setEntityStatus, mergeEntities,
  upsertRelationship, listRelationships, addEvidence, getEvidenceFor,
  listEvidenceForDocument, traverse, stats. Desktop `research:knowledge` else
  `knowledgeWebStore`.
- `knowledgeWebStore` (`src/lib/knowledge/webStore.ts`): same surface over
  `localStorage:openbentt-knowledge-graph` (10k entities / 100k rels / 200
  evidence per subject).
- `traversal.ts`: `boundedTraverse` (BFS, cycle-safe, depth≤3, nodes≤500).
- `exportImport.ts`: `exportKnowledge` / `importKnowledge`
  (format `openbentt-knowledge-v1`, re-validated).
- Electron `knowledgeStore.mjs`: parameterized SQL, user-authored precedence,
  `checkId/checkText/checkMap/checkList/checkSourceRef`.

### Knowledge mutations (gated paths only)
- `upsertEntity/setEntityStatus/mergeEntities/upsertRelationship/
  setRelationshipStatus/addEvidence/setEvidenceStatus/
  markEvidenceStaleForDocument` — validated, evidence-capped, merge-preserving.
- Phase 4 import engine (`connectorImport.ts` / `connectorStore.mjs`):
  dryRun + idempotent import, 200-item cap, conflict surface, never deletes.

### Document reads (Phase 2)
- `DocumentService` (`src/lib/documents/service.ts`, in-memory registry):
  `getDocument`, `listDocuments(projectId?)`, `findDuplicate`,
  `getChunks(docId)`, `inspect(id)` (doc+content+chunks), `staleDocuments`.
- `searchDocuments` (`src/lib/documents/search.ts`): substring + term overlap,
  title boost, default limit 20, filters project/sourceType/author/dates.
- Electron `documentsStore.mjs`: upsert/get/list/findByChecksum/delete +
  extraction cache (desktop persistence).

### Document mutations (NOT exposed as tools in Phase 5)
- `ingest/ingestPdfPages/ingestUrl` (HTTPS-only, 48MB/2MB caps),
  `markIndexed/invalidateDocument/deleteDocument/reindex`. Deferred: no
  document-ingest tool in Phase 5 (read-only document tools only).

### Connector operations (Phase 4)
- Reads: `listConnectorDefinitions`, `capabilitiesFor/supportsCapability`,
  `crossrefSearch/FetchItem/NormalizeMessage`, `zoteroFetchLibrary/FetchItem/
  NormalizeApiItem`, `previewConnectorItems`, `dryRunImport`, sync status/runs,
  `entityIdForConnectorItem`.
- Mutations: `importExternalItems/importConnectorItems` (dryRun flag,
  allowCreate/Update, preserveUserData), hash/link tracking, sync-run
  recording, `resetConnector`. Never deletes KG rows.
- `connectorApi` (`src/lib/connectors/connectorApi.ts`): desktop
  `research:connectors` else web fallback.

### Project operations
- `projectStore.ts`: list/get-active/set-active/create/load/save/patch-draft/
  patch-bibliography/patch-knowledge/delete/addPaper (desktop IPC else
  `localStorage:openbentt-research-project-*`). Phase 5 exposes `project.get`
  (bounded summary) only; no new mutation semantics.

### Retrieval / synthesis (pure reads)
- `buildTfidfIndex/findSimilarPassages/hybridRetrieveV2/dedupeRetrievalHits/
  findSemanticSimilarPassages/extractTopics/ Claims/clusterPapers/
  compareMethodologies/detectContradictions/Gaps/buildTimeline/
  discoverRelatedPapers/runSemanticAnalysis/buildCrossPaperSynthesis/
  literatureReviewContext/recommendCitations`. Not wrapped in Phase 5
  (deferred; document.search covers retrieval needs).

### Citations (pure + bounded net)
- `extractCiteKeys/lintBibliographyHealth/lintCitations/formatCitation/
  validateDoiEntries(≤12)/completeMetadataFromDoi/lookupDoi/
  bibEntryFromCrossref/mergeCrossrefIntoEntry/appendBibEntry/
  suggestRelatedKeys/bibliographyHealthReport/buildCitationGraphFromBib`.
  Not wrapped in Phase 5 (deferred).

### Exports (pure builders)
- `exportKnowledge`, `exportProjectZip`, `buildChatMarkdownExport`,
  `compileTextToPdfBlob`, `hashCompileBundle`. Phase 5 wraps
  `exportKnowledge` only (`export.create`, format `knowledge-json`).

### Utilities
- `mathInline.ts`: `substituteInlineCalc` (mathjs `create(all)` + `evaluate`
  inside `[[calc:]]`, try/catch only). Full-battery `evaluate()` permits
  `import()`/symbol-access patterns unsuitable for a tool boundary, and
  importing mathjs into the Electron main process is unwanted. Decision:
  `utility.calculate` uses a small audited bounded expression parser in
  shared `toolCore.mjs` (numbers, + - * / % ^, parens, unary minus, sqrt/abs/
  round/floor/ceil, length/digit-run/nesting caps) instead of wrapping mathjs.
  `substituteInlineCalc` stays as the UI affordance, untouched.

## 2. Reusable services (tool handlers delegate, never duplicate)

- Knowledge: `knowledgeApi` (renderer) / `knowledgeStore.mjs` (main).
- Documents: `DocumentService` + `searchDocuments` (renderer) /
  `documentsStore.mjs` (main, metadata only; chunk text stays renderer-side —
  document tools execute against the renderer registry via DocumentService on
  both runtimes: main-process document tools read metadata via
  documentsStore and return bounded summaries without chunk text; full
  inspect stays renderer-side. Simpler: document tools are renderer-executed
  even on desktop (local registry), documented as executionMode "local").
- Connectors: `connectorApi` (renderer) / `connectorStore.mjs` (main).
- Projects: `projectStore` (renderer) / `researchDb.mjs` loadProject (main,
  summarized).
- Export: `exportKnowledge` (both runtimes, pure).
- Calculator: new bounded parser in `toolCore.mjs` (both runtimes).

## 3. Existing security boundaries (reused)

- `AppError` taxonomy + `ConnectorError` mapping + `DocumentErrorCode`.
- SSRF: `validateIngestUrl/fetchPageForIngest`,
  `connectorCore.validateExternalUrl`, `fetchConnectorJson` (15s/2MB/3 hops,
  per-hop revalidation, JSON-only), `externalUrlPolicy.mjs`.
- Validation: `ID_RE/NAMESPACE_RE`, knowledge `validation.ts`, store-level
  `check*`, connector `validateExternalItem`, `ipcValidate.mjs:assertSafeId`.
- Redaction: `logger`/`createLogger` + `redactForLogs` + `redactConnectorSecrets`
  + `safeError`.
- Injection hygiene: `documentPromptGuard`, `safeRender`.
- Caps: knowledge (depth3/nodes500/page100/ev200), connectors (200/import,
  15s/2MB/3 redirects), documents (48MB/100pp/220k chars/2MB URL).
- Secrets: `secretVault/hfSecret/zoteroSecret` (main only); tools never accept
  key/token args; connector tables never store secrets.

## 4. Existing mutation paths (all gated, none silent)

- KG writes via knowledge stores (user-authored precedence + caps).
- Connector imports (idempotent hash, conflicts, never delete).
- Document reindex (drops stale chunks only), project granular patches +
  snapshots + debounced backups. Phase 5 adds exactly one mutation tool
  (`connector.import`, USER_CONFIRMATION); everything else is READ_ONLY.

## 5. Existing IPC boundaries

- `research:knowledge` (19 ops), `research:connectors` (11 ops): single-channel
  + op allowlist on `openbenttResearch` bridge; safe generic errors.
- `secretVault/zotero/localGguf/desktop` fixed-arity channels.
- Preload exposes no `ipcRenderer`/shell/fs. Phase 5 adds `research:tools`
  (`list/get/execute/audit`) + one `tools(op, payload)` preload method.

## 6. Proposed tool categories / inventory (15 tools, all wrapping §1)

- KNOWLEDGE: `knowledge.search`, `knowledge.get_entity`,
  `knowledge.get_relationships` (depth1=list, depth>1=traverse),
  `knowledge.get_evidence` — READ_ONLY, LOW.
- DOCUMENT: `document.search`, `document.get`, `document.inspect` —
  READ_ONLY, LOW, bounded content.
- CONNECTOR: `connector.list`, `connector.get`, `connector.preview`,
  `connector.search` (crossref, rows≤20) — READ_ONLY, LOW;
  `connector.import` — USER_CONFIRMATION, MEDIUM, via Phase 4 engine.
- PROJECT: `project.get` (bounded summary, no full draft/embedding blobs) —
  READ_ONLY, LOW.
- EXPORT: `export.create` (format `knowledge-json`, entity cap, byte cap) —
  READ_ONLY, LOW.
- UTILITY: `utility.calculate` (bounded parser) — READ_ONLY, LOW.
- No SHELL / CODE_EXECUTION / BROWSER_AUTONOMY. No project.update, no
  document ingest, no retrieval/synthesis/citation tools (deferred openly).

## 7. Compatibility constraints

1. Zero new npm dependencies; no LLM; deterministic tools (connector.search
   returns retrieval metadata since external data varies).
2. No changes to RAG constants, retrieval, Phase 2 extraction/chunking/
   SourceRef, Phase 3 identity/merge/traversal/evidence, Phase 4
   normalization/identity/import/provenance/sync.
3. Additive SQLite migration v9→v10 (`tool_audit_events`) only.
4. Shared `toolCore.mjs` stays plain JS, no Node APIs (dual runtime like
   `knowledgeCore`/`connectorCore`); web fallbacks for audit + execution.
5. Tool contract identical on Web/Electron; only storage/execution backend
   differs. Pure-local tools (`utility.calculate`, `document.*`) execute in
   the caller runtime even on desktop (documented executionMode).
6. Policy is deterministic data-driven logic in shared core; no dynamic
   capability requests; unknown tools/capabilities deny closed.
7. Audit records identifiers + bounded summaries only (no secrets, keys,
   full documents, raw payloads, raw inputs).

## 8. Files likely to change / add

Add: `src/lib/tools/` (core, types, errors, schema, policy, context, audit,
definitions, registry, handlers, executor, webstore, api, barrel, fixtures,
tests, benchmark), `electron/toolStore.mjs` + test, `ToolPanel` component,
3 Phase 5 docs.
Modify (additive): `electron/researchDb.mjs` (v10), `electron/researchProjectService.mjs`
(`research:tools`), `electron/preload.cjs` (one method), `package.json`
(test/pack entries), `workspaceLayout.ts` + `researchPanelNav.ts` +
`ResearchSidePanel.tsx` (one `tools` tab line each, mirroring Phase 3 graph wiring).

## 9. Files explicitly protected

- RAG: chunking/embedding/retrieval constants, weights, workers, vector store.
- Phase 2: service/pipeline/extractors/chunking/hashing/limits/urlIngest/
  provenance/search, `documentsStore.mjs`.
- Phase 3: `knowledgeCore.mjs`, identity/normalize/extract/validation/
  traversal/webStore, `knowledgeStore.mjs` logic, `knowledgeApi.ts` surface.
- Phase 4: `connectorCore.mjs`, registry/normalize/identity/evidence/import/
  security/sync, `connectorStore.mjs` logic, `connectorApi.ts` surface.
- Migrations v1–v9 (append-only); existing IPC channels/preload (extend only);
  `mathInline.ts`, exporters, citation/synthesis modules (call, don't edit).
