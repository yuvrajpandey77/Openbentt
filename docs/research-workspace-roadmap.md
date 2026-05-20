# Research workspace — status, phases, and test plan

**Positioning:** See [LAUNCH_READINESS.md](./LAUNCH_READINESS.md) and [FEATURE_COMPLETION_LOG.md](./FEATURE_COMPLETION_LOG.md) for audit-friendly status and marketing-safe wording.

## Surfaces (not 11 sidebar tabs)

| Surface | Route | Tabs / actions |
|---------|-------|----------------|
| **Notebook** | `/notebook` | Write · Citations · Similarity · Review · Submit |
| **Library** | `/labs` | Papers · Bibliography · Synthesis · Models (desktop) |
| **Chat** | `/chat` | To Notebook · Compare → Use in Notebook |

---

## Feature matrix (11 capabilities)

| # | Feature | Status | Where | Notes |
|---|---------|--------|-------|-------|
| 1 | Citation & bibliography | **completed** | Notebook → Citations, Library → Bibliography | Lint, formats, PDF→bib, cite insert · `citationTools.test.ts` |
| 2 | Draft ↔ library similarity | **partial** | Notebook → Similarity | TF–IDF + MiniLM embeddings — **overlap scoring, not plagiarism** · `corpusIndex.test.ts` |
| 3 | Abstract & keywords | **partial** | Notebook → Write | **Meridian prompts** + user's LLM; auto-import · `parseWritingAssist.test.ts` |
| 4 | Outline → draft | **partial** | Notebook → Write | Skeleton local; section expand via **chat model** |
| 5 | Thread → paper | **completed** | Chat → To Notebook | LaTeX export from thread · `threadToPaper.ts` |
| 6 | Multi-model merge | **completed** | Compare → Use in Notebook | Attribution log on project |
| 7 | Figure captions | **partial** | Notebook → Write | Float detect + caption **prompts**; user applies chat output |
| 8 | Revision tracking | **partial** | Notebook → Review | Paste comments → markers; PDF notes at upload only |
| 9 | Cross-paper theme report | **partial** | Library → Synthesis | **Heuristic term-frequency** — not LLM synthesis · `synthesis.ts` |
| 10 | Submission helper | **partial** | Notebook → Submit | Advisory venue checklist — not publisher validation |
| 11 | Fine-tune prep | **partial** | Library → Models | JSONL export (desktop); **no in-app training** |

---

## Recently added (this pass)

- **Semantic similarity:** `Xenova/all-MiniLM-L6-v2` via `@xenova/transformers` — Build index → Semantic scan.
- **Writing auto-import:** `ResearchWritingSync` parses `Abstract 1/2/3` and `Keywords:` from last assistant reply into `abstractVariants` / `keywordSuggestions`.
- **Manual import:** Write tab → “Import from last reply”.

---

## Phases still open (product hardening)

These are **not** missing UI placeholders; they are the next engineering phases for a “production-grade” research product.

### Phase A — Quality & automation ✅ (May 2026)

| Task | Status | Where |
|------|--------|-------|
| Auto-rebuild semantic index after PDF upload (background, with cancel) | **Done** | `ResearchProjectContext`, `NotebookSimilarityPanel` |
| Apply AI captions back into `\caption{}` from chat reply parser | **Done** | `parseWritingAssist`, `ResearchWritingSync`, Write tab |
| PDF annotation / comment extraction (not paste-only) | **Done** | `pdfAnnotations.ts`, upload + Review → Import |
| Citation graph ↔ project bib sync (Semantic Scholar) | **Done** | `CitationGraphPanel` in Citations tab |
| E2E Playwright: project → similarity → submit checklist | **Done** | `e2e/research-workspace.spec.ts` (`npm run test:e2e`) |

### Phase B — Scale & performance (1–2 weeks)

| Task | Why |
|------|-----|
| Cap/warn embedding index size (100+ PDFs) | Memory & first-load time |
| Persist embeddings on disk (Electron) separate from `project.json` | Large projects |
| Web: optional degraded mode message when MiniLM download blocked | Corporate networks |
| Batch embedding worker (Web Worker) | UI freeze on big libraries |

### Phase C — Meridian & models (2–4 weeks)

| Task | Why |
|------|-----|
| Optional dedicated `meridian` model preset in Settings | Only if shipping actual weights; today Meridian is **prompt templates only** |
| One-click “Apply best abstract” with diff | Faster than 3 buttons |
| In-app fine-tune wizard (optional) | #11 beyond JSONL export |

### Phase D — Collateral (ongoing)

| Task | Why |
|------|-----|
| ~~Update marketing copy~~ | Done — see `marketingContent.ts`, `LAUNCH_READINESS.md` |
| `LOCAL_RELEASE_CHECKLIST.md` research section | Release QA |
| Unit tests for `embeddingIndex` (mocked pipeline) | CI without downloading model |

---

## What to test (manual checklist)

Run desktop: `npm run electron:dev` (or web: `npm run dev` — semantic index needs model download).

### Project & Library

1. Create a second project from the project bar; switch between projects; draft/bib are isolated.
2. **Library → Papers:** Upload 2+ PDFs; confirm titles/metadata and char counts.
3. **Library → Synthesis:** Run synthesis; download `synthesis.md`; themes reference both papers.
4. **Desktop → Models:** Export finetune JSONL; file path toast appears.

### Notebook — Write

5. **Generate abstracts (chat):** Use Meridian-style prompt; reply with `Abstract 1:` … `Abstract 3:`.
6. Confirm toast **“Imported from chat”** and three **Apply abstract** buttons.
7. **Import from last reply** works if auto-import did not fire.
8. **Suggest keywords** → reply `Keywords: a, b, c` → **Insert keywords into preamble**.
9. Outline → **Build LaTeX skeleton** → valid `\documentclass` in Source.
10. **Apply reply** from chat still merges LaTeX into Source and compiles.

### Notebook — Citations

11. Paste `.bib`; `\cite{missing}` shows lint error.
12. **BibTeX from last PDF** appends an entry.
13. **Insert cite** on a suggested key updates draft.

### Notebook — Similarity

14. **TF–IDF scan** returns hits with `tfidf` label (no model download).
15. **Build semantic index** (first time downloads MiniLM ~ few MB); progress text updates.
16. **Semantic scan** returns hits with `semantic` label; scores differ from TF–IDF.
17. Add a new PDF → index cleared → must rebuild index.

### Notebook — Review & Submit

18. Paste numbered reviewer comments → list items → **Accept into source** adds `% REVIEW` markers.
19. **Submit** with venue IEEE: abstract length fail/pass reacts to `\begin{abstract}` word count.

### Chat integrations

20. Long thread → **To Notebook** → draft sections appear in Source.
21. Compare 2 models → **Use in Notebook** on one column → text in draft + attribution in project JSON.

### Privacy / offline

22. Disconnect network after index built: semantic scan still runs (cached model).
23. Confirm no research PDF text in network tab during similarity (only MiniLM CDN on first load).

---

## Code map

| Path | Role |
|------|------|
| `src/lib/research/embeddingIndex.ts` | MiniLM embed + semantic scan |
| `src/lib/research/parseWritingAssist.ts` | Abstract/keyword parsers |
| `src/lib/research/corpusIndex.ts` | TF–IDF similarity |
| `src/components/research/ResearchWritingSync.tsx` | Auto-import from chat |
| `src/context/ResearchProjectContext.tsx` | Project state |
| `electron/researchProjectService.mjs` | Desktop persistence |

---

## Known limits (honest)

- **Meridian 0.1** is a writing prompt profile, not a bundled model.
- **Synthesis** is term-frequency heuristics — do not describe as AI literature synthesis.
- **Similarity** compares draft text to **your** uploaded library — not plagiarism detection.
- Semantic index **auto-rebuilds** after PDF add/remove; cancel from Similarity tab; large libraries may be slow.
- Captions auto-import from chat; user clicks **Apply caption** to patch `\caption{}`.
- Fine-tuning is **export-only**; training runs in external tools.
- Web: `/labs` blocked — PDF library upload is desktop-only; projects use `localStorage` (size limits).
- Comparison auto-import does not parse abstracts (non-comparison assistant messages only).
