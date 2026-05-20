# OpenBenTT test coverage (QA evidence)

Last updated: 2026-05-20

## How to run

| Suite | Command | What it exercises |
|-------|---------|-------------------|
| Unit + integration (Vitest) | `npm run test:unit` | Renderer research libs, PDF helpers, Zotero merge, project store |
| Electron / main process | `npm run test:electron` | SQLite DB, vector store, job queue, chunk worker |
| E2E (Playwright) | `npm run test:e2e:install && npm run test:e2e` | Built web app routes + localStorage project seed |
| All (CI default) | `npm test` | Vitest + Electron node tests (no Playwright) |

## Added / updated tests (this pass)

### Unit (`src/**/*.test.ts`)

| File | Behavior covered |
|------|----------------|
| `submissionRules.test.ts` | Venue abstract limits, missing cites, float checks |
| `synthesis.test.ts` | Cross-paper themes, empty corpus |
| `revisionTools.test.ts` | Reviewer parse, `% REVIEW` markers, PDF comment regex |
| `semanticIndexRebuild.test.ts` | Abort → `null`, model failure rethrow, empty library |
| `embeddingIndex.test.ts` | Cosine similarity with real vectors (no MiniLM download) |
| `base64.test.ts` | PDF base64 chunking round-trip |
| `citationTools.test.ts` | Extended bad/missing cites, `inferPdfMetadata` |
| `threadToPaper.test.ts` | Chat → LaTeX / markdown export |
| `researchSources.offline.test.ts` | URL extraction, depth limits, proxy fetch errors |
| `pdfText.test.ts` | Valid PDF text, corruption error, truncation note |
| `pdfAnnotations.test.ts` | Review note formatting |
| `zotero/betterBibTeX.test.ts` | BBT detect, merge, partial sync conflicts |
| `zotero/zoteroSync.test.ts` | `buildSyncResult`, citation recommendations |
| `zotero/zoteroWebApi.test.ts` | Mock API → snapshot mapping |

### Integration / stress

| File | Behavior covered |
|------|----------------|
| `projectStore.integration.test.ts` | Create/switch/delete, legacy chunk rebuild, embedding clear on new paper |
| `corpusIndex.stress.test.ts` | 200-paper corpus build + similarity under time budget |

### Electron (`electron/**/*.test.mjs`)

| File | Behavior covered |
|------|----------------|
| `researchDb.test.mjs` | Schema v3, snapshot restore, legacy `project.json` import, DB backup recovery, concurrent draft patch |
| `researchVectorStore.test.mjs` | Float32 BLOB round-trip, stats, delete |
| `researchJobQueue.test.mjs` | `rechunk` worker job completion, cancel pending job |
| `researchWorkers/chunkWorker.test.mjs` | Worker-thread chunking, unknown type error |

### E2E (`e2e/research-workspace.spec.ts`)

- `/`, `/labs`, `/notebook` load after production build
- Seeds a research project in `localStorage` (web persistence path)

### Fixtures / helpers

- `test/fixtures/pdf.ts` — minimal valid + corrupted PDF bytes
- `test/helpers/localStorage.ts`, `test/helpers/vectors.ts`

## Critical workflows covered

| Workflow | Tests |
|----------|-------|
| Create / switch / delete research project (web) | `projectStore.integration.test.ts` |
| Desktop SQLite save / load / migrate legacy JSON | `researchDb.test.mjs` |
| Crash restore via snapshot | `researchDb.test.mjs` |
| Corrupt DB → backup file restore (manual copy) | `researchDb.test.mjs` |
| Legacy `project.json` migration | `researchDb.test.mjs` |
| Background rechunk (worker + queue) | `chunkWorker.test.mjs`, `researchJobQueue.test.mjs` |
| Embedding persistence (desktop) | `researchVectorStore.test.mjs` |
| TF–IDF + semantic similarity math | `corpusIndex.test.ts`, `embeddingIndex.test.ts` |
| Interrupted semantic index (renderer) | `semanticIndexRebuild.test.ts` |
| PDF extract + corrupt PDF | `pdfText.test.ts` |
| Zotero / BBT bibliography partial sync | `betterBibTeX.test.ts`, `zoteroSync.test.ts` |
| Bad citations / submission checklist | `citationTools.test.ts`, `submissionRules.test.ts` |
| Large library stress | `corpusIndex.stress.test.ts` |
| Offline-safe helpers | `researchSources.offline.test.ts` |

## Failures explicitly asserted

- Corrupted PDF → `extractTextFromPdfFile` rejects
- Missing `\cite` keys → `lintCitations` / `runSubmissionChecks`
- Semantic index abort → `null` (not fake success)
- Model load failure → promise rejects
- Unknown worker job type → error message
- Truncated PDF → truncation note in extract output
- Zotero citekey conflict → `conflicts` + `partial` sync flag
- Invalid proxy URL / fetch failure → thrown errors

## Remaining gaps (honest)

| Gap | Why untested here |
|-----|-------------------|
| **Live MiniLM embedding build** | Downloads ~tens of MB from CDN; covered via vector math + abort wiring only |
| **Electron window E2E** | Playwright `_electron` launch not wired in CI; web build smoke only |
| **Real Zotero Web API** | Uses `createMockZoteroFetch`; no API key in CI |
| **Zotero local connector / SQLite** | OS-specific Zotero desktop paths |
| **`safeStorage` API key round-trip** | Requires Electron `app` + OS keychain |
| **Full PDF annotation layer parse** | Needs PDFs with real annotation objects; only text formatter tested |
| **LaTeX compile / BusyTeX WASM** | Heavy WASM + optional `latex-compile` server |
| **OpenRouter / live research gather** | Network-dependent; proxy error path only |
| **GPU / llama-server inference** | `llamaBinary.test.mjs` skips without downloaded binary |
| **Auto-rebuild semantic index on upload** | Product gap (Phase A); not implemented |
| **SQLite auto-open recovery from `.bak`** | `openDb` may still throw on heavily corrupted WAL DB; backup validity tested via manual restore |
| **Playwright in default `npm test`** | Kept optional (`test:e2e`) due to build time (~3 min) |
| **`privacyPreferences` local-only loopback** | 2 tests may fail if implementation changed — verify `isCloudInferenceAllowed` |

## Test honesty notes

- Mocks are used **only** where external systems are unavailable (Zotero HTTP, `buildChunkEmbeddings` abort path, `fetch` failure). Assertions target observable outcomes (DB rows, chunk counts, merged bib text, similarity ordering).
- Tests that spy on `buildChunkEmbeddings` verify **controller** behavior (abort → `null`), not model quality.
- Electron DB recovery test restores from `.bak` after truncating `research.db` — exercises real `openDb` fallback code.
