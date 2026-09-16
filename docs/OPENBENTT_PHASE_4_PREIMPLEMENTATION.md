# Openbentt Phase 4 — Pre-Implementation Reconnaissance

Version: openbentt@2.2.5 · Schema v8 · Date: 2026-09-16
Status: reconnaissance for Phase 4 (Connector Foundation + External Knowledge Ingestion).

## 1. Discovered connector-related code

| Area | Files | Notes |
|---|---|---|
| Crossref client | `src/lib/research/crossrefClient.ts` | `lookupDoi` direct `fetch https://api.crossref.org/works/<doi>`; no timeout/size cap; `bibEntryFromCrossref`, `mergeCrossrefIntoEntry` (fill-missing only). DOI regex `^10\.\d{4,9}\/[^\s"<>]+$`. |
| Crossref → knowledge | `src/lib/knowledge/extract.ts:extractFromCrossref` | Deterministic Paper + Person + Organization(PUBLISHED_BY) + evidence. DOI-anchored `paperIdForDoi`. |
| Zotero web API | `src/lib/zotero/zoteroWebApi.ts` | `https://api.zotero.org` paginated items/collections/tags, `Zotero-API-Key` header. |
| Zotero mapping | `src/lib/zotero/zoteroMapper.mjs` | `mapZoteroApiToSnapshot`, `zoteroItemToBibtex`, citekey logic. |
| Zotero sync | `src/lib/zotero/zoteroSync.ts`, `desktopApi.ts`, `mockZotero.ts`, `betterBibTeX.ts`, `annotationIndex.ts`, `zoteroRetrieval.ts` | Renderer sync + BBT merge (prefer-incoming/preserve-citekeys + conflicts). |
| Zotero desktop | `electron/zoteroService.mjs`, `electron/zoteroSecretStore.mjs` | `userData/zotero/{config,library}.json`; sync web/BBT; IPC `zotero:*`; events `zotero:syncProgress|libraryChanged`. |
| Zotero → knowledge | `src/lib/knowledge/extract.ts:extractFromZotero` | Stable `zotero:<key>` external id; DOI preferred when present. |
| Citation graph | `src/lib/citationGraph.ts`, `src/lib/research/citationGraphSync.ts`, `semanticEngine.ts:351` | Transient display graph; S2 fetch ≤5 DOIs; durable successor is Phase 3 `CITES` relationships. |
| Research proxy (server) | `server/research-proxy.mjs`, `server/httpPolicy.mjs` | Host-allowlisted fetch, 256k body cap, 15s timeout, rate limiter. Reference pattern for connector fetch. |

## 2. Existing external integrations

- Crossref: public, no secret, polite-pool UA `OpenBenTT/2.0`.
- Zotero: userId + API key; desktop in `safeStorage` vault (`zotero_api_key.blob|secret`, 0o600); web in `localStorage openbentt-zotero-web-creds(-key)`, cleared on desktop connect.
- S2/arXiv/Wikipedia/Jina/Brave: via `server/research-proxy.mjs` only (not durable knowledge). Out of Phase 4 scope; architecture must allow future providers without redesign.

## 3. Identity mechanisms

- Documents: `doc_<sha256[0:16]>`, versions `<id>@v<N>`, chunks `<docId>:<blockId>:<chunkIdx>` (`src/lib/documents/{hashing,service,chunking}.ts`).
- Knowledge: `ent_<type>_<fnv1a8(type:normalized)>` and DOI papers `ent_paper_<fnv8(paper:doi:<norm>)>` (`src/lib/knowledge/knowledgeCore.mjs` shared with Electron). Namespaced `externalIds[]` (`doi:`, `zotero:`, `crossref:`, `citekey:`, `arxiv:`). Person comma-flip normalization. Merge = `status=merged + mergedInto`, history preserved.
- Zotero stable identity: `zotero:<library>/<key>` concept; current code stores `namespace=zotero value=<key>`.
- Crossref stable identity: `doi:<normalized-doi>`.

## 4. Persistence boundaries

- Desktop SQLite `research.db` (`electron/researchDb.mjs`, SCHEMA_VERSION=8, WAL+FK, `getDb` singleton, backup `.bak` + debounced copy): projects/drafts/bibliography/papers/corpus_chunks/embeddings/jobs/chat/documents(v7)/knowledge(v8: entities+aliases+identifiers+tags+relationships+evidence+merges).
- Documents desktop: `electron/documentsStore.mjs` (v7 tables). Knowledge desktop: `electron/knowledgeStore.mjs` (v8 tables, parameterized SQL, safe generic `Knowledge:` errors, user-authored name protection).
- Web fallback: `localStorage` — projects `openbentt-research-project-*` (4.5MB budget), knowledge `openbentt-knowledge-graph` (10k entities/100k rels), Zotero creds keys. No durability claims beyond profile.
- Files: `projectDir/<id>/papers|assets|exports`, zotero `userData/zotero/`, secrets `userData/.secrets/` (0o700/0o600).

## 5. Security primitives (must reuse)

- URL: `src/lib/documents/urlIngest.ts` (HTTPS-only, no creds/control-chars, SSRF blocklist incl. 10/8, 127/8, 169.254, 192.168, 172.16-31, 0/8, ::1/fc/fd/fe80, metadata.google.internal, *.local|internal|lan; manual redirect + per-hop revalidation, `text/html` only, 2MB/15s/3 hops).
- Electron: `externalUrlPolicy.mjs` (HTTPS-only nav), `navigationPolicy.mjs` (default-deny 15 permissions), `ipcValidate.mjs` (`assertSafeId`, `assertBase64Pdf` 48MB, path guards).
- Server: `server/httpPolicy.mjs` (origin allowlist, 120/min rate limit, 413 body cap, 15s fetch timeout).
- Errors: `src/lib/appError.ts` taxonomy (`validation|network|provider|authentication|rate-limit|local-model|document-processing|storage|ipc|security|configuration|unknown`).
- Logging: `src/lib/log.ts` + `electron/log.mjs` + `src/lib/privacy/redactForLogs.ts` (secret key/value regexes, truncation, depth cap).
- Prompt guard: `src/lib/security/documentPromptGuard.ts` (`[UNTRUSTED_DOCUMENT_*]` wrapping).
- Secrets: `secretVault.mjs`, `zoteroSecretStore.mjs`, `hfSecretStore.mjs` (safeStorage encrypt + fallback-plain warning); renderer `src/lib/privacy/desktopSecrets.ts`.
- IPC: single-channel allowlists — `research:knowledge` (19 ops) pattern to copy for `research:connectors`.
- Knowledge validation: `src/lib/knowledge/validation.ts` (+ `ID_RE`, `NAMESPACE_RE`, limits facade over `knowledgeCore.mjs`).
- RAG constants (PROTECTED — do not touch): 480/80 chunking, MiniLM-L6-v2, 384 dims, q8, 120 chunk cap, 512 embed batch, TF-IDF, RRF k=60 / v2 k=48 + weights + min fused score, workers/storage.

## 6. Compatibility constraints

1. No changes to RAG constants, retrieval behavior, Phase 2 extraction pipeline, Phase 3 identity/merge algorithms (except namespaced connector identity mapping which reuses them).
2. Reuse `SourceRef` verbatim for connector evidence; extension only if connector origin cannot be represented — minimal additive optional fields.
3. Reuse `extractFromZotero`/`extractFromCrossref` mapping logic via connector normalization layer, not duplication.
4. Zero new npm dependencies. No LLM calls. No polling daemon, agents, MCP, cloud, vector/graph DB, auth, multi-user.
5. Additive SQLite migration v8→v9 only; never rewrite prior migrations.
6. `research:connectors` single IPC channel + op allowlist on existing `openbenttResearch` bridge; preload adds one method only.
7. External data: untrusted; size/timeout/redirect/content-type caps; SSRF-safe; sanitize before render; never execute; no auto attachment download; no auto deletion; user-authored precedence.

## 7. Files expected to change / add

Added:
- `src/lib/connectors/*` (core, registry, crossref/zotero adapters, import, web fallback, renderer API, tests, fixtures)
- `src/lib/connectors/connectorCore.mjs` (shared plain-JS core for Electron parity)
- `electron/connectorStore.mjs` + `electron/connectorStore.test.mjs` (v9 tables + import execution)
- `src/components/knowledge/ConnectorPanel.tsx` (minimal UI)
- `docs/OPENBENTT_PHASE_4_{PREIMPLEMENTATION,CONNECTOR_ARCHITECTURE,BENCHMARK,COMPLETION}.md`

Modified:
- `electron/researchDb.mjs` (SCHEMA_VERSION 8→9 + `migrateV9`, export it)
- `electron/researchProjectService.mjs` (register `research:connectors` handler)
- `electron/preload.cjs` (one `connectors(op,payload)` method on `openbenttResearch`)
- `package.json` (`test:electron` add connectorStore test; `build.files` add connectorCore.mjs)
- `src/components/research/ResearchSidePanel.tsx` or knowledge search panel (mount ConnectorPanel; minimal)
- `src/lib/research/knowledgeApi.ts` (no change expected; connector API is separate module)

## 8. Files explicitly protected from modification

- RAG: retrieval/chunking/embedding constants, weights, `corpusChunksCore.mjs`, `embedCore.mjs`, workers, vector store.
- Phase 2: `src/lib/documents/{service,pipeline,extractors,chunking,hashing,limits,urlIngest,provenance,search}.ts`.
- Phase 3: `src/lib/knowledge/{knowledgeCore.mjs,identity,normalize,extract,validation,traversal,webStore}.ts`, `electron/knowledgeStore.mjs` logic (call, don't edit), `electron/documentsStore.mjs`.
- Migrations v1–v8 in `electron/researchDb.mjs` (append-only).
- Existing IPC channels and preload surfaces (extend only additively).
- Unrelated UI, lockfiles, unrelated formatting.
