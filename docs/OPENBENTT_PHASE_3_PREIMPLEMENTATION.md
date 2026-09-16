# Openbentt Phase 3 — Pre-Implementation Audit

**Status:** READ-ONLY AUDIT. No behavior changed to produce this document.
**Date (UTC):** 2026-09-16.
**Method:** file reads + content search + line-verified inspection of the working
tree (Phase 2 implemented, uncommitted; `openbentt@2.2.5`).
**Sources re-read:** Phase 0 audit, Phase 1 foundation + changelog, Phase 2
pre-implementation + intelligence + changelog + document model doc.

---

## 1. What entity-like concepts already exist?

Three proveniences, none a durable ontology:

- `src/lib/research/researchMemory.ts:4-63` — in-memory `ResearchMemory{v1,
  entities[], edges[], events[], thesis}` with `MemoryEntityKind =
  paper|author|term|section|citation|claim|feedback` (`:4-11`),
  `MemoryEntity{id,kind,label,sourceId?,metadata?,embeddingHint?,updatedAt}`
  (`:13-22`), `MemoryEdge{id,from,to,relation: cites|authored_by|mentions|
  related_to|contradicts|supports|draft_section|feedback_on, weight,
  provenance}` (`:24-39`). Ephemeral (rebuilt per project, persisted inside
  project JSON), no lifecycle/merge/stale semantics. Deterministic ID minting
  (`paper:${id}`, `author:${slug}`, `cite:${key}` — `:117-243`).
- `src/lib/citationGraph.ts:3-13` — `GraphNode{id,label,doi?}` /
  `GraphEdge{from,to,label?}` built from bibliography order + Semantic Scholar
  neighborhoods (max 5 DOIs, 4 cites + 4 refs each).
- Phase 2 `src/lib/documents/types.ts` — `DocumentReference{id,text,page?,
  doi?,arxivId?}` (deterministic `[N]` detection, never hallucinated).
- Implication: the ontology must be a **new durable layer**, reusing ID-minting
  conventions and relation names where compatible, not a copy of any of these.

## 2. Where are papers represented?

`ResearchPaper{id,fileName,addedAt,extractedText,pageCount?,metadata:{title?,
authors?,year?,doi?},reviewNotes?,reviewStatus?,pageNotes?,annotations?}`
(`src/types/researchProject.ts:52-74`); desktop `papers(id,project_id,
file_name,metadata_json,extracted_text,page_count,review_json)`
(`electron/researchDb.mjs:117-124,238-240`); web project JSON
(`projectStore.ts`). Phase 2 maps `OpenbenttDocument ↔ ResearchPaper` via
`paperId = documentId` (`chunking.ts:47-54`). Ontology `Paper` entities must
reference — not duplicate — these IDs.

## 3. Where are authors represented?

Nowhere as entities. Author strings live in `ResearchPaper.metadata.authors`
(free text from `inferPdfMetadata`), `BibEntry.author`
(`src/lib/bibtex.ts:3-14`), `ZoteroItem.creators: string[]`
(`src/types/zotero.ts:73-91`), and `CrossrefWork.authors`
(`crossrefClient.ts:4-19`). Author→Paper linkage exists only transiently in
`researchMemory` (`authored_by` edges) and `zoteroRetrieval` recommendations.
Deterministic author normalization is greenfield — required for Phase 3.

## 4. Where are citation relationships represented?

Transiently: `citationGraph.ts` sequential + S2 neighborhoods;
`researchMemory` `cites` edges; `cslEngine`/CSL formatting (display only);
`NotebookCitationsPanel` (UI). No durable CITES table. `DocumentReference`
(Phase 2) carries per-paper reference text + DOI — the deterministic evidence
source for `Paper—CITES→Paper` without new fetching.

## 5. Does Zotero already provide stable external identifiers?

Yes. `ZoteroItem.key` (8-char stable key) is the canonical identity
(`zoteroMapper.mjs:134-162`, top-level items only, children via `parentItem`);
citekeys from `Extra`/BBT or `author+year+key[0:6]` (`:25-33`);
`ZoteroCollection{key,name,parentCollection,itemCount}` + `ZoteroTag{tag}`
(`zotero.ts:30-40`); annotations/notes/attachments keyed by parent
(`:42-57`). Sync paths: Web API paginated (`zoteroService.mjs:150-214`) +
BBT file watch (`:244-360`); renderer bridge `desktopApi.ts`. **Do not alter
sync** — map `key → externalIds(zotero:key)`, `citekey → identifiers`,
collections/tags → entity tags.

## 6. Does Crossref provide identifiers that should be preserved?

Yes. `CrossrefWork{doi,title,authors,year,journal,publisher,url,type,volume,
issue,page,issn,isValid}` (`crossrefClient.ts:4-19`); `normalizeDoi` +
`isValidDoiFormat /^10\.\d{4,9}\/.../` (`:30-39`); `mergeCrossrefIntoEntry`
is **fill-missing only** (`:151`) — the in-repo precedent for origin
precedence (user/Zotero first, Crossref fills gaps). DOI is the Paper-identity
anchor (`doi:<value>` namespace).

## 7. Where are tags/categories stored?

Research types have **zero native tags**: `ResearchPaper`/`ProjectFile` carry
no tags field; `ProjectFolder{pathPrefix?}` only *matches* tags by path
(`researchProject.ts:29-39`, `folderMigration.ts:27-37`). The sole tag taxonomy
is Zotero's (`tags:string[]`, `collectionKeys` — `zotero.ts:82-83`). Ontology
entities need their own lightweight `tags` (deterministic extraction assigns;
user can add) — additive, no research-type changes.

## 8. How are research metadata fields represented?

`ResearchPaper.metadata{title?,authors?,year?,doi?}` (inferred at upload);
`BibEntry{key,type,title?,author?,year?,doi?,url?,journal?,booktitle?,raw}`;
Phase 2 `DocumentMetadata` origin-tagged (`embedded|filename|user-provided|
url|external|inferred`). Origin precedence observed in-repo: user-provided >
embedded/Zotero > Crossref(fill-missing) > filename > inferred. Phase 3
adopts exactly this ordering (documented, no invention).

## 9. How are SourceRefs currently represented?

`SourceRef{documentId,documentVersionId?,page?,section?,block?,chunkId,
sourceType,sourceUri?,title?}` (`documents/types.ts:199-209`);
`sourceRefForChunk / formatSourceLine / enrichHitsWithProvenance`
(`provenance.ts`). Evidence reuses this struct verbatim — no second system.

## 10. Can existing document IDs be reused directly?

Yes. `doc_<sha256hex[0:16]>` (`hashing.ts:58-60`), versions `<id>@v<N>`
(`service.ts:93-94`), chunks `<docId>:<blockId>:<chunkIdx>`
(`chunking.ts:27-29`), legacy corpus `<paperId>-<i>` / `<projectId>:draft-<i>`
with v4 remap (`researchDb.mjs:198-235`, `normalizeChunkId :670-675`).
Evidence stores all three plus the document **version int** for stale checks.

## 11. Can existing chunk IDs be reused directly?

Yes — chunk IDs are content-derived and stable per extractor version; cache
key `checksum:extractorVersion` (`service.ts:154`) gives invalidation for
free. Evidence must record `documentVersionId` + extractor version so v1
evidence is distinguishable after re-extraction (stale, not false).

## 12. What SQLite schema version is currently present?

`SCHEMA_VERSION = 7` (`researchDb.mjs:10`); chain v1 (core) → v2 (jobs) →
v3 (dead `chat_links`) → v4 (composite chunk PK + draft remap) → v5
(review_json + project_files) → v6 (knowledge + chat_logs) → v7 (documents,
document_versions, document_extract_cache). Recovery: `.bak` restore on open
failure + debounced backup + snapshots. Note: `researchProjectService.mjs`
`initResearchStorage` still returns hardcoded `schemaVersion: 6` — stale
literal Phase 3 will correct to the exported constant.

## 13. What migration patterns does the repository use?

`runMigrations` version-loop with `CREATE TABLE IF NOT EXISTS` + column
guards (`PRAGMA table_info` checks in v5/v6/v7), index creation, data remap
inside the migration (v4 draft IDs), legacy `project.json` import
(`migrateLegacyProjects`), `.bak` safety net. Phase 3 follows: `migrateV8`
additive tables + indexes only, no alters of existing tables.

## 14. Is any graph-like structure already present?

Display/ephemeral only (see §1): `citationGraph` (bib-order + S2),
`researchMemory` edges (rebuilt, project-JSON-persisted), annotation search
index. No durable graph tables, no traversal API, no cycle handling. The
`knowledge_entities/relationships/evidence` tables are greenfield.

## 15. What search/indexing capabilities already exist?

`searchDocuments` (title-boost + term overlap, project/type/author/date
filters — `documents/search.ts:26`); TF-IDF `findSimilarPassages` + MiniLM
`findSemanticSimilarPassages` + RRF `hybridRetrieve(V2)` (frozen constants);
`searchAnnotations` (TF-cosine); Zotero `recommendCitations`
(collection/tag-filtered). Knowledge search is new but mirrors
`searchDocuments` filter shapes; graph traversal (`getNeighbors` depth ≤3) is
new with hard caps.

## 16. What existing UI can expose knowledge without redesign?

- `ResearchPanelId` already includes `"knowledge"` (`workspaceLayout.ts:8`)
  rendering free-text `KnowledgePanel` — ontology UI must be **separate
  components**, not a takeover (avoid user confusion with the AI-context box).
- `DocumentDetailPanel` / `DocumentSearchPanel` (Phase 2, standalone) mount
  beside `NotebookPdfWorkspace` / similarity panels.
- Natural slots: `ResearchSidePanel` panel switch (`:20`), `NotebookExplorerDock`
  tabs, `CitationGraphPanel` detail views; routes need no changes.
- Plan: `src/components/knowledge/{EntityPanel,EvidenceList,RelationshipList,
  KnowledgeSearchPanel}.tsx` mounted as an `"knowledge"`-adjacent tab or Dock
  entry with bounded lists + pagination; no route/layout changes.

## Implications (no code changed yet)

1. New durable layer: `electron/knowledgeStore.mjs` + `migrateV8`, renderer
   pure core `src/lib/knowledge/`, IPC `research:knowledge*` on the existing
   `openbenttResearch` bridge (no new preload surface).
2. Deterministic extractors map metadata/Zotero/Crossref/BibTeX →
   entities/relationships/evidence; no LLM boundary executed.
3. Stale semantics via recorded doc-version vs current doc-version; merges via
   redirect rows; soft status lifecycle everywhere.
