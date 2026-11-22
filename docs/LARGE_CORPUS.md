# Large corpora (≈1000 pages + many docs)

How Openbentt stores, indexes, and retrieves evidence when a project grows far beyond a single paper — and how **local** vs **cloud** models consume that evidence.

## Pipeline (what happens on upload)

1. **Ingest** — PDF / DOCX / MD / HTML / Office / TeX / Bib go through document adapters; originals stay intact; derived text enters the project.
2. **Chunk** — Overlapping ~480-character passages (`corpusChunksCore.mjs`), scoped per paper + draft. Desktop rechunks in a worker thread and persists rows in SQLite (`corpus_chunks`).
3. **Lexical index** — TF-IDF + inverted postings rebuilt in memory for search (`corpusIndex.ts`). Large libraries score **candidates** from postings instead of every chunk.
4. **Semantic index** — MiniLM-L6-v2 (384-d, q8):
   - **Desktop:** Electron embed job → worker → SQLite `embeddings` BLOBs. Cap **50 000** passages, fair round-robin across papers.
   - **Web:** In-memory / Indexed paths with a **2 000** fair-sample cap (browser RAM). Prefer the desktop app for thousand-page libraries.
5. **Retrieve (RAG)** — Hybrid RRF: lexical + semantic → rerank → top-K snippets with provenance (`hybridRetrieval.ts` / `retrievalV2.ts`).
6. **Prompt injection** — Only those snippets enter the model context (`formatRetrievalForPrompt`), never the full PDF dump.

## Storage map

| Layer | Desktop | Web |
|-------|---------|-----|
| Paper text + chunks | SQLite `research.db` under userData | Project JSON / limited localStorage |
| Embeddings | SQLite `embeddings` (Float32 BLOBs) | Inline / rebuilt; capped sample |
| Draft / bib | SQLite + autosave | Same project blob |
| Chat logs | SQLite chat log (optional) | Browser chat storage |

Retrieval speed comes from **indexes + top-K**, not from stuffing 1000 pages into the LLM.

## Local AI vs cloud

| Provider | Evidence budget (hits / chars) | Notes |
|----------|--------------------------------|--------|
| WebGPU Gemma | 4 / 4k | Tiny window — retrieval must be sharp |
| Local GGUF | 6 / 6k | llama-server context still limited |
| Ollama / openai_compatible | 8 / 10k | Mid local context |
| OpenRouter / OpenAI / Anthropic / Google | 12 / 18k | Larger context; still RAG, not full dump |

Web research (`researchEnabled`) is separate: network fetches for cloud routes only (or when `researchWithLocalModel` is on). Corpus RAG always runs from the local index.

## Accuracy principles

- Cite only retrieved chunk provenance — models are instructed not to invent DOIs/pages.
- Fair embedding sample when over cap (round-robin papers) so one long PDF cannot own the index.
- Lexical + semantic fusion recovers synonyms that TF-IDF alone misses.
- Pressure warnings fire at soft limits (`projectLimits.ts`) before hard failures.

## Practical expectation for ~1000 pages

- **Upload & chunk:** fine on desktop (SQLite + workers).
- **First semantic index:** minutes on CPU (MiniLM); incremental resume skips already-embedded chunks.
- **Each chat turn:** millisecond–second hybrid search + a few KB of evidence in the prompt.
- **Web-only:** usable for smaller libraries; for multi-hundred-page corpora use **Electron desktop**.

See also: `docs/research-intelligence.md`.

## Compile (Notebook)

Compile always tries to produce a PDF: BusyTeX → local TeX Live (Electron) → HTTP pdflatex → **text PDF fallback** if every TeX engine fails. Open **Notebook** from the main sidebar to write, compile, and preview.
