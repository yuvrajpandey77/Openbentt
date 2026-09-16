# Openbentt Phase 2 Changelog — Document Intelligence Foundation

No commits made by the implementation (working tree only).
Conventions: `M` modified, `A` added.

## Added (renderer `src/lib/documents/`, 14 files)

- A `types.ts` — canonical model (Document/Version/Asset/Page/Section/Block/
  Chunk/Reference/Extraction/Index, SourceRef, statuses).
- A `hashing.ts` — SHA-256 identity (WebCrypto/Node) + FNV-1a hot-path checksums.
- A `limits.ts` — resource bounds + safe `DocumentErrorCode` → user messages.
- A `ocr.ts` — `OcrProvider`, `UnavailableOcrProvider`, `isOcrRequired`.
- A `officeExtract.ts` — jszip-only DOCX/PPTX/XLSX (existing dep, zero new).
- A `extractors.ts` — `DocumentExtractor` boundary, PlainText/Markdown/HTML/
  Image/Office extractors, `EXTRACTOR_VERSION=doc-extract-v1`,
  `buildPdfContent` PDF-intelligence wrapper, `pickExtractor`.
- A `metadata.ts` — origin-tagged metadata + ranked merge (never fabricated).
- A `structure.ts` — deterministic heading-led `detectSections`.
- A `chunking.ts` — 480/80 provenance-attach wrapper + legacy mapper.
- A `provenance.ts` — SourceRef builder, citation lines, hit enrichment.
- A `pipeline.ts` — lifecycle stages + resume semantics.
- A `urlIngest.ts` — SSRF-safe validate + fetch (timeout/size/redirect/
  content-type caps).
- A `search.ts` — global document search (project/type/author/date filters).
- A `service.ts` — `DocumentService` (ingest/inspect/index/search/get/delete/
  reindex, duplicate detection, extraction cache, invalidation).
- A `index.ts` — barrel.

## Added (UI `src/components/documents/`, 3 files)

- A `DocumentStatusBadge.tsx`, `DocumentDetailPanel.tsx`, `DocumentSearchPanel.tsx`
  (accessible, explicit states, provenance-exposing; no redesign).

## Added (tests/fixtures/scripts, 9 files)

- A `extraction.test.ts`, `identity.test.ts`, `security.test.ts`,
  `provenance.test.ts`, `office.test.ts`, `benchmark.test.ts`
- A `electron/documentsStore.mjs` (+ `.test.mjs`, 3 tests)
- A `test/fixtures/documents/{sample.md,sample.txt,sample.html}`
- A `scripts/bench-documents.mjs` (+ `bench:documents` script)

## Added (docs, 4 files)

- A `docs/OPENBENTT_PHASE_2_PREIMPLEMENTATION.md` (20-question audit)
- A `docs/OPENBENTT_DOCUMENT_MODEL.md`
- A `docs/OPENBENTT_PHASE_2_DOCUMENT_INTELLIGENCE.md` (this phase incl. ADRs)
- A `docs/OPENBENTT_PHASE_2_CHANGELOG.md` (this file)

## Modified (3 files)

- M `electron/researchDb.mjs` — `SCHEMA_VERSION 6→7` + additive `migrateV7`
  (documents/document_versions/document_extract_cache). Nothing else touched.
- M `package.json` — `test:electron` gains `documentsStore.test.mjs`;
  new `bench:documents` script. No dependency changes (zero additions/removals).
- M `package-lock.json` — untouched (no dep changes).

## Dependencies

Zero additions, zero removals, zero version bumps. Office support reuses the
existing `jszip@^3.10.1`.

## Behavior changes (intentional, documented)

1. New SQLite tables on desktop first-run (v7 migration; old data preserved).
2. New import states exist (`needs-ocr`, `unsupported`) — previously silent
   empty/corrupt outcomes now surface explicitly. No existing flow removed.
