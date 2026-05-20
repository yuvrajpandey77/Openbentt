# Research intelligence — real vs heuristic

OpenBenTT research workspace combines **production-grade local tooling** with **transparent heuristics**. This document distinguishes what is real (deterministic algorithms, CSL/citeproc, Crossref, MiniLM) from what remains pattern-based or requires human verification.

## Citation engine

| Feature | Implementation | Status |
|---------|----------------|--------|
| CSL formatting (APA, MLA, IEEE, Chicago, ACM, Nature) | `citation-js` → citeproc via `src/lib/research/cslEngine.ts` | **Real** |
| BibTeX parsing | Balanced-brace parser in `src/lib/bibtex.ts` | **Real** |
| DOI lookup & metadata completion | Crossref REST API in `src/lib/research/crossrefClient.ts` | **Real** (network) |
| DOI validation | Format check + optional Crossref existence check | **Real** |
| Duplicate detection | Key and DOI dedup in `lintBibliographyHealth()` | **Real** |
| Missing field lint | Per-entry-type required fields | **Real** |
| PDF metadata inference | First-lines regex in `inferPdfMetadata()` | **Heuristic** |
| Citation suggestions | Title overlap in draft text | **Heuristic** (with confidence + reason) |

### Key files

- `src/lib/research/citationTools.ts` — lint, health report, Crossref enrichment
- `src/lib/research/cslEngine.ts` — CSL/citeproc formatting
- `src/lib/research/crossrefClient.ts` — DOI normalize, lookup, BibTeX merge

## Semantic research engine

| Feature | Implementation | Status |
|---------|----------------|--------|
| Lexical retrieval | Corpus TF-IDF with IDF in `corpusIndex.ts` | **Real** |
| Semantic retrieval | MiniLM-L6-v2 via `@xenova/transformers` | **Real** (on-device) |
| Hybrid fusion | Reciprocal Rank Fusion in `hybridRetrieval.ts` | **Real** |
| Reranking | Term overlap + dual-signal boost | **Real** (lightweight) |
| Topic extraction | TF-IDF term aggregation | **Real** |
| Paper clustering | Shared-term greedy clustering | **Heuristic** |
| Claim extraction | Regex patterns (`we show`, `results indicate`) | **Heuristic** |
| Contradiction detection | Opposing term pairs in shared topics | **Heuristic** — verify manually |
| Methodology comparison | Method keyword sentences per paper | **Heuristic** |
| Research gaps | Topics in library absent from draft | **Heuristic** |
| Timeline evolution | Year grouping + topic themes | **Real** structure, heuristic themes |
| Related papers | Shared topic overlap scoring | **Real** |
| Citation graph (project bib) | Author/venue edges + Semantic Scholar API | **Mixed** |

### Key files

- `src/lib/research/corpusIndex.ts` — TF-IDF index and lexical search
- `src/lib/research/embeddingIndex.ts` — MiniLM embeddings
- `src/lib/research/hybridRetrieval.ts` — RRF fusion, reranking, provenance
- `src/lib/research/semanticEngine.ts` — topics, clusters, claims, gaps, timeline

## Research memory

| Feature | Implementation | Status |
|---------|----------------|--------|
| Entity graph (papers, authors, terms, citations, sections) | `researchMemory.ts` | **Real** (local, rebuilt on hydrate) |
| Relationship edges | cites, authored_by, mentions, related_to | **Real** |
| Thesis structure | Parsed from `\section{}` + cite keys | **Real** |
| Event log | Last 100 events (extensible) | **Real** |
| Semantic embeddings in memory | Text hints only (512 chars) | **Partial** — full vectors in `chunkEmbeddings` |

Persisted in `ResearchProjectData.researchMemory`, rebuilt on every project hydrate/save.

## UX: provenance and confidence

- **Similarity panel**: each hit shows method (`lexical` / `semantic` / `hybrid`), TF-IDF and MiniLM scores when available, confidence tier, and a `Why:` provenance string.
- **Citations panel**: bibliography health score, suggestion reasons, CSL-formatted preview.
- **Synthesis panel**: claims labeled with confidence; contradictions flagged for manual verification.

## Reliability principles

1. **Missing metadata** — Crossref enrichment fills gaps; lint reports missing fields; formatting falls back gracefully.
2. **Partial matches** — Hybrid retrieval returns low-confidence hits with explicit provenance instead of hiding weak results.
3. **Messy PDFs / OCR** — Chunking tolerates noise; semantic embeddings help; synthesis never invents paper content.
4. **No hallucinated synthesis** — Cross-paper reports cite extracted sentences and TF-IDF topics only; no LLM generation in the analysis pipeline.
5. **Source preservation** — Snippets link to paper chunks; DOIs and bib keys preserved through enrichment.

## Tests

```bash
npm run test:unit -- src/lib/research/
```

Covers: BibTeX/CSL formatting, bibliography health, TF-IDF retrieval, hybrid RRF, semantic topic extraction, research memory graph.

## What is NOT included (future work)

- Cross-encoder reranking (e.g. ms-marco-MiniLM)
- LLM claim verification or abstractive synthesis
- Zotero / BibLaTeX sync
- Automatic embedding rebuild on library change (manual index build still required)
- Web Worker batch embedding (main thread today)

See also: `docs/research-workspace-roadmap.md` for UI surface and phase plan.
