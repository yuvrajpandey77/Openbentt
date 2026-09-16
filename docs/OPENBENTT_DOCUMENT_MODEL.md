# Openbentt Document Model (Phase 2)

Canonical source: `src/lib/documents/types.ts`. This file explains the model;
the code is authoritative on field shapes.

## Entities

- **Document** (`OpenbenttDocument`): normalized identity — id (`doc_<hash16>`),
  title, source, sourceType, mimeType, size, timestamps, SHA-256 checksum,
  extractorVersion, metadata (origin-tagged), extractionStatus, pipeline status,
  errorCode, projectId, version + previousVersionId. Smallest representation
  compatible with the existing architecture: one concept, persisted in SQLite
  `documents` (v7) on desktop and mapped to `ResearchPaper` in memory on web.
- **DocumentVersion**: `{id: <docId>@v<N>, documentId, version, checksum,
  createdAt, source, extractorVersion, previousVersionId}`. Versions are a
  linked list, not version control. Desktop table `document_versions`.
- **DocumentAsset**: `{id, documentId, kind: source|thumbnail|attachment,
  mimeType, size, uri?}` — binary stays on disk/object URLs, never inlined.
- **DocumentPage**: `{pageNumber, text, charCount, empty}`. `empty` marks
  scan candidates; drives the `ocr-required` state.
- **DocumentSection**: `{id, title, level, page?, blockIds[]}` — produced by
  deterministic `detectSections` (heading-led grouping, no LLM).
- **DocumentBlock**: `{id, kind, text, page?, sectionId?, level?, table?,
  figure?}`. Kinds: paragraph|heading|list|table|code|quote|image|formula|
  caption|footnote|reference. Tables keep `{columns, rows, caption?, page?}`;
  chunking uses a `col | col` text fallback while the structured form is
  preserved separately.
- **DocumentChunk**: `{id, documentId, documentVersionId, paperId?, projectId?,
  page?, sectionId?, blockId?, chunkIndex, text, checksum}`. Chunk text windows
  reuse the canonical 480/80 core; this layer only attaches provenance.
- **DocumentReference**: `{id, text, page?, doi?, arxivId?}` — deterministic
  `[N]`-style detection + DOI regex; never hallucinated.
- **DocumentExtraction**: cached `{documentId, versionId, extractor,
  extractorVersion, status, content, metadata, createdAt}` keyed by
  `checksum:extractorVersion`. Desktop table `document_extract_cache`.
- **DocumentIndex**: `{documentId, versionId, chunkIds, embeddingModel,
  indexedAt, stale}` — invalidation drops stale chunks; versions never mix.

## Relationships

```
Document 1──* DocumentVersion (linked list via previousVersionId)
Document 1──1 DocumentContent { pages[], sections[], blocks[], references[] }
Document 1──* DocumentAsset
Document 1──* DocumentChunk (all carry documentVersionId)
DocumentChunk *──1 SourceRef (provenance chain for every retrieval hit)
```

## Status machines

Pipeline: `queued → validating → extracting → normalizing → structuring →
chunking → indexing → ready`, plus terminal `needs-ocr | unsupported |
failed`. Extraction: `extracted | partial | failed | ocr-required |
unsupported`. A scanned PDF yields `ocr-required` + `needs-ocr`, never
`extracted`. Truncated PDFs yield `partial`.

## RAG mapping (additive)

`toLegacyCorpusChunks` maps DocumentChunk → `{id, paperId, text, pageHint}` so
existing TF-IDF + MiniLM + RRF paths rank unchanged; `SourceRef` enrichment
(`provenance.ts`) attaches document/version/page/section/block/chunkId after
ranking. No RAG constant moved (480/80, MiniLM-384, RRF k=60/v2 k=48).
