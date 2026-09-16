# Openbentt Phase 2 — Pre-Implementation Audit

**Status:** READ-ONLY AUDIT. No behavior changed to produce this document.
**Date (UTC):** 2026-09-16.
**Method:** file reads + content search + line-verified inspection of the current working tree (base: Phase 1 working tree, `openbentt@2.2.5`).
**Phase 0 source:** `docs/OPENBENTT_PHASE_0_AUDIT.md`. **Phase 1 sources:** `docs/OPENBENTT_PHASE_1_SECURITY_FOUNDATION.md`, `docs/OPENBENTT_PHASE_1_CHANGELOG.md`.

RAG constants below are quoted verbatim so Phase 2 can prove they were not silently changed.

---

## 1. What document formats are currently supported?

**Answer: PDF only as an indexed document. Everything else is attachments, editor files, or prompt-only context.**

- Chat composer: `file.type === "application/pdf"` else reject — `src/components/ChatInput.tsx:440,471`; `accept="image/*,audio/*,video/*,.pdf,application/pdf"`. Non-PDF docs rejected at `:446` ("Use image, audio, video, or PDF").
- Library/research: `accept="application/pdf"` — `src/components/research/LibraryPapersPanel.tsx:28`, `src/components/notebook/NotebookLeftRail.tsx:231,299`, `src/components/NotebookPdfWorkspace.tsx:531,1286,1394,1487`.
- Notebook project files (`.tex/.bib/.sty`, asset images) are editor/compile inputs, not corpus documents — `src/pages/ProjectsHubPage.tsx:262`, `src/components/notebook/NewProjectDialog.tsx:103`, `src/components/notebook/NotebookFileTree.tsx:638`.
- Zero-result searches confirm absence: `tesseract|mammoth|sheetjs|\.docx|\.xlsx|\.pptx` in `src/` + `electron/` + `package.json`. Available ZIP lib (`jszip@^3.10.1`, `package.json:106`) is used for template packs, not office extraction.
- Images/audio/video frames are `MessageAttachment` parts (`src/types/chat.ts:15-29`), never chunked/indexed.

## 2. How are PDFs extracted?

Two `pdfjs-dist@^4.10.38` paths in `src/lib/pdfText.ts` (verified read):

- `extractTextFromPdfFile(file, maxChars=96_000, maxPages=64)` (`:69-99`, chat): `getDocument({data})` → per-page `getTextContent()` → `items.map(str).join(" ")` (layout **discarded**, single line per page) → whitespace collapse → truncation note → `sanitizeDocumentTextForPrompt().text`.
- `extractNotebookSourceFromPdf(file, maxChars=220_000, maxPages=100)` (`:111-151`, library): uses `item.transform[4,5]` as x/y, `layoutPageText()` (`:43-67`, sort `b.y-a.y||a.x-b.x`, cluster `|y-rowY|<=4`, join `""` per line) → `--- PDF PAGE i / n ---` markers → truncation notes. Raw stored (no sanitizer at rest; wrapped at prompt time via `wrapDocumentTextForPrompt`).
- Worker: `pdfjs.GlobalWorkerOptions.workerSrc = pdfjs-dist/build/pdf.worker.min.mjs` (`:7-11`, skipped under Vitest).
- No coordinate retention beyond line clustering; no heading/table/link/footnote/reference detection; no `getAnnotations`/`getDestinations` usage. Caps: `MAX_CHARS_CHAT_PDF=96_000`, `MAX_PAGES_CHAT_PDF=64`, `MAX_CHARS_NOTEBOOK=220_000`, `MAX_PAGES_NOTEBOOK=100`, `MAX_CHARS_ASSIST_SNAPSHOT=96_000` (`:14-28`).

## 3. Where is extracted text stored?

- In-memory canonical: `ResearchPaper.extractedText: string` (`src/types/researchProject.ts:52-57`).
- Web: whole `ResearchProjectData` (incl. `papers[].extractedText` + `chunks`) in `localStorage` key `openbentt-research-project-<id>` (`src/lib/research/projectStore.ts:28`); embeddings stored separately (`openbentt-research-embeddings-<id>`, `:27`); persist strips embeddings (`stripEmbeddingsForWebPersist`, `:208-221`); 4.5 MB project budget (`projectLimits.ts:10`).
- Desktop: SQLite `papers.extracted_text TEXT` (`electron/researchDb.mjs:116-124`); `savePapers` (`:553-593`), `loadProject` maps `extracted_text→extractedText` (`:367-392`). Raw PDF bytes on filesystem via `storePaperPdf(projectId,paperId,pdfBase64)` (`researchDb.mjs:348-360` + `src/lib/research/researchDesktopApi.ts:179-184`).
- Transient chat PDFs: `MessageAttachment{kind:"pdf",extractedText}` (`src/types/chat.ts:23-29`) merged into prompt, never added to corpus.

## 4. How is document metadata represented?

`ResearchPaper.metadata: {title?, authors?, year?, doi?}` (`researchProject.ts:58-63`) + review fields (`reviewNotes?, reviewStatus?, lastReviewedPage?, pageNotes?, annotations?`, `:65-73`).

- Inference: `inferPdfMetadata(extractedText)` (`src/lib/research/citationTools.ts:165-191`): strips `[UNTRUSTED_DOCUMENT_*]`, scans first 4000 chars for `10.\d{4,9}/…` (DOI) and `(19|20)\d{2}` (year); title = first 8–200-char non-marker line; authors = second line if it contains `,` or ` and `. Called at upload (`src/context/ResearchProjectContext.tsx:766-777`).
- Enrichment: `bibEntryFromMetadata`, `validateDoiEntries/completeMetadataFromDoi` via Crossref (`citationTools.ts:131-213`, `crossrefClient.ts`); display fallback to `fileName` (`displayPaperLabel.ts:9-11`). No checksum, MIME, size, language, page/word counts, source URL/URI, checksum, or origin tracking anywhere.

## 5. How are research files represented?

`ProjectFile{id,path,kind,content,addedAt,updatedAt}`, `kind="tex"|"bib"|"sty"|"asset"|"other"` (`researchProject.ts:24,42-50`); `ProjectFolder{id,label,parentId?,kind,order,pathPrefix?}` (`:29-39`).

- Desktop: `project_files(id PK, project_id FK, path, kind, content, added_at, updated_at, UNIQUE(project_id,path))` (`researchDb.mjs:242-253`, migration v5); `saveProjectFiles` diff-delete+upsert (`:595-618`); binary assets via `list/store/loadProjectAssetDesktop` (`researchDesktopApi.ts:186-206`) as utf8/base64.
- Papers (PDF docs) and project files are **separate collections**; no unified Document abstraction; no version/asset/page/section/block tables.

## 6. How does indexing currently work?

- Chunk: `chunkText(text, 480, 80)` whitespace-normalized sliding window (`corpusChunksCore.mjs:5-15`); `buildCorpusChunks(papers, draftTex, projectId)` → `{id:<paperId>-<i>, paperId, text, pageHint: floor(i/3)+1}`, drafts namespaced `<projectId>:draft-<i>` with LaTeX-command strip (`:18-37`); re-exported by `corpusIndex.ts:76-87`.
- Orchestration: `rebuildProjectCorpus()` → desktop `enqueueJob` else sync (`corpusPipeline.ts:20-41`); Electron `researchJobQueue.mjs:76-346` (per-project serialized drain, embed dedup, `worker_threads` chunk/embed workers, 3 attempts, cancel, `research_jobs` persistence, `resumeInterruptedJobs`); web `researchEmbedding.worker.ts:40-78`.
- Incremental: `chunkContentFingerprint` + `pruneStaleEmbeddings` + `listChunksPendingEmbed` + `planIncrementalIndex` (`incrementalIndex.ts`); checkpoint `openbentt-index-checkpoint-*` (`indexCheckpoint.ts`); rebuild `semanticIndexRebuild.ts:38-103` (retry `[0,2000,5000]`).
- Embedding build: `buildChunkEmbeddingsFromChunks` filters drafts, slices to 120, resume-aware (`embedCore.mjs:54-76`); loader batches 32 (`embeddingLoader.ts:8-37`).
- Caps: `LIMITS{maxPapers:500, maxChunksIndexed:120, maxDraftChars:2M, maxBibliography:500k, maxLocalStorageProjectBytes:4.5M}` (`projectLimits.ts:4-14`).

## 7. Where are chunks stored?

- Desktop SQLite: `corpus_chunks(id, project_id, paper_id, text, page_hint, PK(id,project_id))` (`researchDb.mjs:203-210`, v4 composite PK + draft `projectId:` remap `:221-229`); `saveChunks` delete+insert+dedupe (`:620-641`); loaded as `CorpusChunk{id,paperId,text,pageHint}` (`:406-408`).
- Web: `ResearchProjectData.chunks: CorpusChunk[]` inlined in project JSON (`researchProject.ts:82-87,161`); desktop strips `chunks+chunkEmbeddings` before `api.saveProject` (`projectStore.ts:55-59,163`); `skipChunks||hasActiveRechunkJob` guard (`:482`).
- Shape is flat text + heuristic `pageHint`; no document/version/section/block/chunk-index/checksum columns.

## 8. How are embeddings stored?

- Model (verbatim, must not change silently): `MODEL_ID="Xenova/all-MiniLM-L6-v2"`, `MAX_CHUNKS_INDEX=120`, `MAX_EMBED_CHARS=512`, `dtype:"q8"`, mean pooling, L2-normalized 384-dim (`embedCore.mjs:5-35`).
- Desktop: `embeddings(chunk_id, project_id, dim, vector BLOB Float32, updated_at, PK(chunk_id,project_id))` (`researchDb.mjs:134-142`); `researchVectorStore.mjs:6 EMBED_DIM=384`, `float32ToBlob/blobToFloat32` (`:8-18`), `upsert/load/delete/listEmbeddedChunkIds/embeddingStats` (`:20-91`).
- Web: `chunkEmbeddings?: Record<string,number[]>` + transient `__query__` vector, separate localStorage key + checkpoint (`projectStore.ts:137-143`, `indexCheckpoint.ts`). No vector DB / ANN anywhere (client-side cosine `cosineNormalized`, `embedCore.mjs:38-43`).

## 9. How does retrieval work?

- Lexical TF-IDF: `buildTfidfIndex` (library only, `idf=log((N+1)/(df+1))+1`), `findSimilarPassages(minScore:0.08, limit:24, snippet 280 chars, method:"lexical")`, drafts excluded; draft scan separate (`scanDraftSimilarity`, 320/60 windows, `minScore:0.1`) — `corpusIndex.ts:7-140`.
- Semantic: `findSemanticSimilarPassages(minScore:0.42, limit:24, confidence ≥0.55 high / ≥0.45 medium, provenance "MiniLM cosine NN%")`, drafts excluded — `embeddingIndex.ts:94-128`.
- Hybrid RRF (verbatim constants): `DEFAULT_RRF_K=60` (`hybridRetrieval.ts:24`); `reciprocalRankFusion Σ1/(k+rank+1)` (`:40-58`); `rerankHits` term-overlap `+0.12`, short-snippet `-0.05`, dual-signal `+0.08` (`:61-104`); `confidenceFromScore(sem≥0.55||lex≥0.12 high; sem≥0.42||lex≥0.06||score≥0.012 medium)` (`:26-37`); `fuseRetrievalLists(limit:24, minFused:0.005)` (`:120-157`); `hybridRetrieve(lex minScore:0.04 limit×2; sem minScore:0.35)` (`:159-184`); async variant embeds query (`:186-212`).
- v2 (chat path): `RETRIEVAL_V2_DEFAULTS{limit:16, minFusedScore:0.008, rrfK:48, lexicalWeight:0.45, semanticWeight:0.55}` (`retrievalV2.ts:6-12`; weights stored, fusion is pure RRF); `hybridRetrieveV2` + `dedupeRetrievalHits(max 24, key paperId+snippet48)` (`:14-39`).
- Consumers: `assembleResearchContext` (TF-IDF + resolve + v2 limit 12 → draft 12k + bib 8k + hits) + `formatRetrievalForPrompt(max 24k, "- name (p.~hint) [method NN%]: snippet")` (`researchOrchestrator.ts:50-115`); chat provider limit 6 (`ResearchProjectContext.tsx:160-161`); `scanDraftHybrid` (260-step/320-win, 20 windows, top 30) (`hybridRetrieval.ts:214-245`).

## 10. How are citations/provenance represented?

- `SimilarityHit{chunkId, paperId, paperName, snippet, score, pageHint?, method?, lexicalScore?, semanticScore?, fusedScore?, confidence?, provenance?}` (`researchProject.ts:89-103`); `RetrievalHit extends +fusedScore!, confidence!, provenance!, rankFeatures?` (`hybridRetrieval.ts:7-14`).
- Provenance strings: `"lexical TF-IDF NN%" / "semantic MiniLM NN%" / "both signals agree" / "query terms match snippet" / "weak overlap — verify manually"` (`:106-118`) + rerank features (`:89-94`).
- Prompt injection format: `[RESEARCH_CORPUS_EVIDENCE — untrusted… cite by paper name only] - name (p.~hint) [method NN%]: snippet`. Chat web citations (`ResearchSourceRef{title,url?,snippet,kind?,id?,doi?}`, `chat.ts:31-48`, rendered `MessageReferences.tsx:10-42`) are a **separate** path from corpus hits. Provenance is approximate (`p.~`, heuristic `pageHint`); no document/version/section/block/chunk-id chain, no `SourceRef` object.

## 11. What happens when extraction fails?

- `pdfText.ts` has **no empty-text error**: scanned PDFs yield `""` and are stored as if extracted; corrupt PDFs reject at `getDocument` and callers toast (`ChatInput.tsx:447-449` "Attachment failed"; `NotebookPdfWorkspace.tsx:548-553` "Load failed"; truncation toasts `:559-595`). No `extractionStatus` field; no `partially extracted` / `failed` / `ocr-required` states.
- Repair nets: `migrateProjectIntegrity` (retitle corrupted, flag draft/bibliography corruption, `contentIntegrity.ts:22-54`, run on load `projectStore.ts:267`); DB `.bak` restore + debounced backup + 20 snapshots + 50 draft-history (`researchDb.mjs:55-68,306-326,650-721`). No per-stage retry of extraction; no extraction cache.

## 12. Is OCR currently present?

**No.** Zero hits for `tesseract|ocrad|ocr` engine usage in `src/ + electron/ + server/ + package.json`. Consequence (verified): a scanned PDF extracts to empty string with no signal (§11). No `ocr-required` state, provider interface, or deferred stub exists.

## 13. Are DOCX/PPTX/XLSX currently supported?

**No.** Zero hits for `docx|mammoth|xlsx|sheetjs|pptx` in code or deps. `jszip` exists (`package.json:106`) but serves template packs only. Spreadsheet risk noted in brief applies: no sheet/range/cell representation exists.

## 14. Are HTML/URL documents supported?

**No as documents.** URL content enters prompts ephemerally and is never indexed: `fetchJinaMarkdown` + Wikipedia/S2/Brave/arXiv fetchers → `contextBlock + sources` (`researchSources.ts:85-357`; proxy `server/research-proxy.mjs:28-187`). No URL document type, fetch policy in renderer, size/content-type/redirect/SSRF gating for ingestion, or boilerplate reduction. Phase 1 gates that *do* exist and must be reused: `externalUrlPolicy` (https-only, no credentials), `navigationPolicy` (nav/window/permission), `httpPolicy` (body caps, origin, rate limit, timeouts) — none currently wired to a document-ingest path.

## 15. Are images treated as documents?

**No.** Images are message parts (`image_url`, first-frame ≤1024px, `openrouter.ts:214-241`, `media.ts:21-77`) or Notebook assets; never chunked/embedded/retrieved. No figure/caption/page/location representation (only `CaptionSuggestion{kind?:figure|table}` text hints, `researchProject.ts:76-80`).

## 16. Are tables preserved?

**No.** No table parser, `TableBlock`, or sheet model exists. Tables dissolve into whitespace-collapsed text (chat) or line-joined text (notebook). Only table-aware surface is caption-kind labeling.

## 17. Are document sections represented?

**No.** No `Section/Heading/Block` model. Only structure is `--- PDF PAGE i / n ---` markers (notebook) and LaTeX-command stripping for drafts (`corpusChunksCore.mjs:32`). Markdown headings/lists/code/links/tables have no parser (Markdown is rendered via `react-markdown` for display, not structured for retrieval).

## 18. Is page-level provenance retained?

**Approximately, not exactly.** `pageHint = floor(chunkIndex/3)+1` (`corpusChunksCore.mjs:27`) — a position heuristic, not a measured page. `page_hint` column carries it (`researchDb.mjs:131`). Display renders `p.~hint`. True page mapping (which chunk came from which PDF page) is lost at chunk time because `extractTextFromPdfFile` (chat path) discards page boundaries entirely and `buildCorpusChunks` never sees page spans.

## 19. Is document-level search global or project-scoped?

**Project-scoped only.** Every retrieval entry takes `project.chunks + paperNames(project.papers)`; SQL always `WHERE project_id=?`; draft IDs namespaced per project (v4). Verified: no cross-project/global full-text UI or index; in-thread search, PDF find, palette, annotation index (`annotationIndex.ts:37`), and Zotero collection/tag filters are all scoped. Global search must be built additively (no Elasticsearch/Meilisearch per constraints; local stores first).

## 20. What existing schemas can be extended safely?

- **SQLite (`electron/researchDb.mjs`, `SCHEMA_VERSION=6`, `:10`):** additive chain `runMigrations v<vN→migrateVN` (`:70-90`): v1 projects/drafts/bibliography/papers/corpus_chunks/embeddings/draft_history/snapshots/app_state (`:92-164`); v2 `research_jobs` (`:166-184`); v3 dead `chat_links` (`:186-194`); v4 composite chunk PK + draft remap (`:196-234`); v5 `papers.review_json` + `project_files` (`:236-254`); v6 `projects.knowledge` + `chat_logs` (`:256-277`); plus `.bak` recovery (`:55-68`), debounced backup (`:306-326`), `migrateLegacyProjects` (`:723-789`). **Safe extension: new `migrateV7` with `CREATE TABLE IF NOT EXISTS documents / document_versions / document_extract_cache` + additive indexes; never alter `corpus_chunks/embeddings` shape; test fresh + v6-seeded + legacy-project DBs.**
- **Web (`projectStore.ts` + `researchProject.ts`):** `hydrate` rebuilds missing chunks (`:48-74`), `migrateProjectFolders` + `migrateProjectIntegrity` run on load, embeddings/checkpoints namespaced per project — new optional fields (`documents?`, `documentVersions?`) with hydrate-time defaults are backward compatible; `cogerphere-*` migration (`main.tsx:12`, `storageMigrate.ts`) must keep passing.
- **RAG constants that must not move:** `chunkSize 480 / overlap 80` (`corpusChunksCore.mjs:5`), `MiniLM-L6-v2 / 384-dim / q8 / MAX 120 / 512 chars` (`embedCore.mjs:5-7`, `researchVectorStore.mjs:6`), `RRF k 60 / v2 k 48 / weights .45/.55 / minFused .008/.005 / limits 16/24/6` (`hybridRetrieval.ts:24`, `retrievalV2.ts:6-12`). Any change requires a STOP-and-document per the preservation contract.
- **Reuse surface for Phase 2:** `jszip` (already dep) for ZIP-based office parsing; `httpPolicy`/`externalUrlPolicy`/`navigationPolicy` for URL ingestion; `resolveInside` pattern (`server/latex-compile.mjs`) for archive containment; `redactForLogs` + `logger` (`src/lib/log.ts`, `electron/log.mjs`) for observability; `researchJobQueue` + workers for background parsing/indexing; `pdfText.ts` caps + `projectLimits.ts` caps as resource bounds.

---

## Implications for implementation (no code changed yet)

1. Canonical representation + extraction boundary + hashing + statuses + cache + invalidation are all greenfield — nothing to replace.
2. PDF improvement must preserve both extraction entry points and caps; add page/block spans + `extracted|partial|failed|ocr-required` without changing chunk/embedding constants.
3. Office formats can be built on the existing `jszip` dependency (no new package required) with `resolveInside`-style containment; XLSX must keep sheet/range/cell structure.
4. URL ingestion is new; must reuse Phase 1 policies and add SSRF/private-network denial, timeout, size cap, redirect limit, content-type validation.
5. Retrieval stays additive: keep TF-IDF + MiniLM + RRF intact; attach `documentId/versionId/page/section/block/chunkIndex/checksum` to chunks and return a `SourceRef` chain.
