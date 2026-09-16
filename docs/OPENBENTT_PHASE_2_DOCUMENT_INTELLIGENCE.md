# Openbentt Phase 2 — Document Intelligence Foundation

**Status:** IMPLEMENTED (working tree only; no commits per phase rule).
**Base:** Phase 1 working tree (`openbentt@2.2.5`). **Pre-audit:** `docs/OPENBENTT_PHASE_2_PREIMPLEMENTATION.md`.
**Model reference:** `docs/OPENBENTT_DOCUMENT_MODEL.md`. **Changes:** `docs/OPENBENTT_PHASE_2_CHANGELOG.md`.

Principle: existing RAG + better representation + better provenance + better
metadata + better filters. No agents/MCP/connectors/auth, no new backend.

## 1. Architecture

```
SOURCE (file bytes / pdf pages / URL)
  ↓ VALIDATE (size caps, mime/extension, URL policy)
  ↓ IDENTIFY (pickExtractor: markdown → text → html → office → image)
  ↓ EXTRACT (per-format extractor; PDF via buildPdfContent over pdfjs pages)
  ↓ NORMALIZE (whitespace bounds, boilerplate reduction for HTML)
  ↓ STRUCTURE (detectSections: heading-led, deterministic)
  ↓ METADATA (embedded > user-provided > url > filename > inferred)
  ↓ CHUNK (canonical 480/80 + provenance attach)
  ↓ INDEX (stale-set handoff; existing RRF pipeline ranks unchanged)
  ↓ READY (or needs-ocr / unsupported / failed with safe errorCode)
```

Boundary: `src/lib/documents/service.ts` — `ingest/inspect/extract(normalize/
structure)/index(search)/get/delete/reindex`. Internal only, no network API.
Heavy parsing/indexing stays in the existing job queue/workers (unchanged).

## 2. Supported formats — PASS / PARTIAL / DEFERRED

- **PASS:** Markdown (headings/paragraphs/lists/code/links/tables),
  Plain text (line boundaries), HTML (boilerplate-reduced article),
  DOCX (paragraphs/headings/tables/metadata), PPTX (slide boundaries/text/
  notes/tables), XLSX (sheet/range/cell grid + header detection + provenance),
  PDF-intelligence wrapper (page spans, headings/refs, partial/ocr-required).
- **PARTIAL:** PDF (glyph source still pdfjs; no coordinate tables yet),
  images (registered as figure blocks with location, not understood),
  URL ingestion (single-page HTML only, no crawler).
- **DEFERRED:** OCR engine (abstraction + `ocr-required` state shipped; no
  bundled engine — would add unreasonable runtime weight), general web
  crawl, vision/chart understanding, LLM enrichment.

No new dependencies: office parsing reuses the existing `jszip`.

## 3. Extraction pipeline (actual)

`service.ingest`: SHA-256 → duplicate check (same hash + extractor version
skips reprocessing) → `pickExtractor` → extract → `enrichResearchMetadata` +
`mergeMetadata` (ranked origins) → `detectSections` → `chunkDocumentBlocks`
→ extraction-cache put (`checksum:extractorVersion`) → stale-index mark.
PDF path `ingestPdfPages` keeps `src/lib/pdfText.ts` as the glyph source
(untouched) and adds status/spans via `buildPdfContent`. URL path
`ingestUrl`: `validateIngestUrl` → `fetchPageForIngest` (timeout, size cap,
manual redirect chain, per-hop SSRF re-validation, content-type check) →
`extractHtmlArticle` → ingest.

## 4. RAG integration (preserved + extended)

Unchanged: MiniLM-L6-v2 / 384-dim / q8 / 120 chunks / 512 chars
(`embedCore.mjs`), 480/80 chunking (`corpusChunksCore.mjs`), TF-IDF + RRF
k=60 / v2 k=48 / weights .45/.55 / minFused .008/.005 (`hybridRetrieval.ts`,
`retrievalV2.ts`), job queue/workers, storage formats. Verified by the
`preserves RAG chunk constants` test. Extended: chunks carry
document/version/page/section/block/checksum; `toLegacyCorpusChunks` feeds
existing rankers; `enrichHitsWithProvenance` + `formatSourceLine` return
`Title · Section s1 · Page 14` citations. No citation without a source.

## 5. Provenance

`SourceRef{documentId, documentVersionId?, page?, section?, block?, chunkId,
sourceType, sourceUri?}` (`provenance.ts`). UI: `DocumentDetailPanel`
(title/type/metadata/status/source/pages/sections), `DocumentStatusBadge`
(explicit Queued…Failed + safe reason), `DocumentSearchPanel` (results show
Document Title + Section + Page + snippet). No vague "Loading…".

## 6. Security

Hostile-input treatment: 48 MB file cap, 100-page / 220k-char bounds, table
caps (50×500), archive caps (200 files / 64 MB expanded), URL 2 MB cap +
15 s timeout + 3-redirect limit; ZIP traversal rejection (`..`, absolute,
drive-letter); no macro/script execution (XML text only); HTML extraction is
regex-only (scripts/styles/nav stripped, never executed); SSRF denial
(private/loopback/link-local/metadata hosts, credentialed URLs, non-https);
generic safe error codes via `userMessageForCode`; logging carries id/
operation/duration/status/extractor/size only (never contents/keys/URLs).

## 7. Database

Additive migration **v7** (`migrateV7` in `electron/researchDb.mjs`):
`documents`, `document_versions`, `document_extract_cache` + indexes.
`corpus_chunks/embeddings/papers` untouched. `electron/documentsStore.mjs`
provides parameterized CRUD + cache. Tested fresh; v6-seeded and legacy
`project.json` paths preserved (`migrateLegacyProjects` unchanged).

## 8. ADRs (concise, evidence-based)

- **ADR-1 canonical representation:** smallest additive model (§model doc);
  maps to ResearchPaper instead of replacing it (preservation contract).
- **ADR-2 extraction abstraction:** `{supports, extract}` + versioned
  `EXTRACTOR_VERSION`; only locally-reliable formats implemented.
- **ADR-3 OCR boundary:** `OcrProvider` + `UnavailableOcrProvider` +
  `isOcrRequired` heuristic; never fake OCR (empty PDFs previously stored
  silently — now `ocr-required`).
- **ADR-4 identity/hash:** SHA-256 (WebCrypto/Node) for identity; FNV-1a for
  hot-path chunk checksums; `doc_<hash16>` ids; duplicate = same hash.
- **ADR-5 provenance:** SourceRef attached post-ranking; missing chunk ⇒ no
  citation (enforced in `enrichHitsWithProvenance`).
- **ADR-6 versioning:** linked-list versions (`previousVersionId`); no VCS.
- **ADR-7 invalidation:** `invalidateDocument` drops stale chunks; reindex
  rebuilds from one version; versions never mix.
- **ADR-8 URL security:** reuse Phase 1 policies + per-hop SSRF validation,
  timeout, size/content-type/redirect caps; single-page only.
- **ADR-9 office scope:** jszip-only DOCX/PPTX/XLSX with containment caps;
  XLSX keeps sheet/range/cell structure; macros never executed.

## 9. Tests / benchmarks

New: 24 vitest (extraction 8, identity 3, security 6, provenance 3, office 3,
benchmark 1) + 3 node (`documentsStore`). Existing suites must stay green
(verified in §validation). Benchmark: `npm run bench:documents` (real measured
ms printed; small/medium/large PDF-equivalent + Markdown + HTML). Fixtures:
`test/fixtures/documents/{sample.md,sample.txt,sample.html}` (synthetic).

## 10. Deferred (explicit)

OCR engine, web crawler, coordinate-precise PDF tables, vision/figure
understanding, LLM structure enrichment, cross-backend sync — all have
extension points (`OcrProvider`, block/table payloads, SourceRef chain) and
no representation rewrite is needed.
