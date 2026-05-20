# Openbentt — feature completion log

**Product name:** Openbentt (repo: SecuredChatCogerphere)  
**Primary surface:** Electron desktop  
**Secondary surface:** static web app (OpenRouter chat, Notebook; no offline GGUF / Labs)  
**Last audited:** May 2026 · app version `2.0.7` (`package.json`)

Use this log to audit claims in marketing, README, and release notes. Each row links to code or tests as evidence.

**Status legend**

| Status | Meaning |
|--------|---------|
| **completed** | Works end-to-end for the intended surface; copy-safe |
| **partial** | UI or logic exists; limited surface, manual steps, or depends on external LLM/API |
| **deferred** | Planned; not blocking current desktop release |
| **missing** | Not implemented |

---

## Platform & distribution

| Feature | Status | Surface | Evidence | Notes |
|---------|--------|---------|----------|-------|
| Electron desktop (primary) | completed | desktop | `electron/main.mjs`, `package.json` `main` | Landing skipped; opens `/chat` |
| Static web app (secondary) | completed | web | `src/App.tsx`, `vite build` | Marketing at `/`; workspaces guarded |
| Web route guard (desktop-only paths) | completed | web | `src/config/platformSurface.ts`, `WebWorkspaceRouteGuard.tsx` | `/labs`, `/write`, `/benchmark`, `/webgpu` → `/chat` on web |
| GitHub Release installers | completed | desktop | `RELEASING.md`, `.github/workflows/release.yml` | Unsigned macOS/Windows |
| Auto-update (electron-updater) | partial | desktop | `DesktopUpdateCard.tsx`, `electron/main.mjs` | Needs `latest*.yml` on release |
| Code signing | missing | desktop | `PRODUCTION_CHECKLIST.md`, `RELEASING.md` | Gatekeeper / SmartScreen friction |
| Docker (web + research proxy) | completed | deploy | `docker-compose.yml`, `Dockerfile` | Optional; not the primary product story |

---

## Core chat

| Feature | Status | Surface | Evidence | Notes |
|---------|--------|---------|----------|-------|
| OpenRouter streaming chat | completed | both | `src/lib/aiStream.ts`, `ChatContext.tsx` | User BYOK |
| Multi-provider (OpenAI, Anthropic, Google, compatible) | completed | desktop | `SettingsPanel.tsx`, `types/chat.ts` | Web: subset in `WEB_AI_PROVIDERS` |
| Multi-thread + localStorage persistence | completed | both | `ChatContext.tsx`, `ChatThreadBar.tsx` | No cloud sync |
| Model comparison (2–4 models) | completed | both | `ChatContext.tsx` | Local GGUF/WebGPU disabled in compare |
| Attachments (image, audio, video frame, PDF) | completed | both | `ChatInput.tsx` | Vision needs capable model |
| In-chat charts | completed | both | `chartSpec.ts` | |
| Share URL (hash snapshot) | completed | both | `ShareViewPage.tsx`, `shareRun.ts` | Read-only; no server |
| Chat export (MD/PDF) | completed | both | `chatExportMarkdown.ts`, `chatExportPdf.ts` | |
| Research mode (proxy enrichment) | partial | both | `researchProxyClient.ts`, `server/research-proxy.mjs` | Optional Docker/proxy; not default |

---

## On-device inference

| Feature | Status | Surface | Evidence | Notes |
|---------|--------|---------|----------|-------|
| WebGPU/WASM Transformers.js | partial | both | `src/lib/gemmaWebGpu/*` | Long cold start; CPU fallback |
| Local GGUF + llama-server | completed | desktop | `electron/localGgufService.mjs`, `LocalGgufHub.tsx` | Bundled binary in CI `extraResources` |
| HF token OS encryption | completed | desktop | `electron/hfSecretStore.mjs` | |
| Curated GGUF hub UI | completed | desktop | `LibraryModelsPanel.tsx`, `LocalGgufHub.tsx` | Training is export-only |

---

## Notebook & LaTeX

| Feature | Status | Surface | Evidence | Notes |
|---------|--------|---------|----------|-------|
| LaTeX source + PDF preview | completed | both | `NotebookPdfWorkspace.tsx` | |
| Apply assistant reply to source | completed | both | `NotebookPdfWorkspace.tsx` | Uses user's chat model |
| BusyTeX WASM compile | completed | both | `latexWasmCompile.ts` | |
| Remote pdflatex server | partial | deploy | `server/latex-compile.mjs` | Optional `VITE_LATEX_COMPILE_URL` |
| **Meridian 0.1** (LaTeX writing) | **partial** | both | `writingPrompts.ts`, `NotebookWritingPanel.tsx` | **Prompt persona only** — not a separate model weights bundle; uses whatever model is in Settings |
| Abstract/keyword import from chat | completed | both | `parseWritingAssist.ts`, `ResearchWritingSync.tsx` | Tests: `parseWritingAssist.test.ts` |
| Outline → LaTeX skeleton | completed | both | `latexTools.ts` | Tests: `latexTools.test.ts` |

---

## Research workspace

| Feature | Status | Surface | Evidence | Notes |
|---------|--------|---------|----------|-------|
| Research projects (multi-project) | completed | both | `ResearchProjectContext.tsx`, `projectStore.ts` | Desktop: `electron/researchProjectService.mjs`; web: localStorage |
| Library → Papers (PDF upload) | **partial** | desktop | `LibraryPapersPanel.tsx`, `/labs` route | **Web:** `/labs` blocked — upload only via desktop Library |
| Citation lint + BibTeX tools | completed | both | `NotebookCitationsPanel.tsx`, `citationTools.ts` | Tests: `citationTools.test.ts` |
| Citation graph (Semantic Scholar) | partial | desktop | `CitationGraphPanel.tsx` | Network for enrichment; standalone from project bib |
| **Cross-paper synthesis** | **partial** | desktop | `synthesis.ts`, `LibrarySynthesisPanel.tsx` | **Term-frequency heuristics** — not LLM synthesis; do not market as “AI synthesis” |
| **Draft ↔ library similarity** | **partial** | both | `corpusIndex.ts`, `embeddingIndex.ts`, `NotebookSimilarityPanel.tsx` | TF–IDF + optional MiniLM embeddings; **overlap scoring, not plagiarism detection** |
| Semantic index auto-rebuild | completed | both | `semanticIndexRebuild.ts`, `ResearchProjectContext.tsx` | First load downloads MiniLM |
| Review comment markers | partial | both | `NotebookReviewPanel.tsx` | Paste-based; PDF annotation import partial |
| Submission venue checklist | partial | both | `submissionRules.ts`, `NotebookSubmitPanel.tsx` | Rule-of-thumb checks, not publisher validation |
| Thread → Notebook export | completed | both | `threadToPaper.ts`, `CompareUseInNotebook.tsx` | |
| Fine-tune JSONL export | partial | desktop | `LibraryModelsPanel.tsx` | Export only; no in-app training |
| Revision tracking | partial | both | `revisionTools.ts`, `NotebookReviewPanel.tsx` | Manual paste workflow |

---

## Other workspaces (desktop-primary)

| Feature | Status | Surface | Evidence | Notes |
|---------|--------|---------|----------|-------|
| Research Labs (`/labs`) | completed | desktop | `ResearchLabsPage.tsx` | Hidden on web |
| LaTeX Write (`/write`) | completed | desktop | `LatexWorkspacePage.tsx` | Hidden on web |
| Benchmark (`/benchmark`) | completed | desktop | `BenchmarkPage.tsx` | Hidden on web |
| WebGPU lab (`/webgpu`) | completed | desktop | `WebGpuPage.tsx` | Hidden on web |
| Legacy BibTeX / HF datasets on Labs page | completed | desktop | `ResearchLabsPage.tsx` (pre-project UI may coexist) | See `ResearchLabsPage` vs `LibraryWorkspace` |

---

## Marketing & docs alignment

| Item | Status | Evidence | Action |
|------|--------|----------|--------|
| Desktop-first positioning | partial → **completed** (this pass) | `marketingContent.ts`, `LAUNCH_READINESS.md` | Primary CTA = download |
| Meridian labeled as “model” | **fixed** (this pass) | `marketingContent.ts`, `NotebookWritingPanel.tsx` | Now “writing prompts” / profile |
| Synthesis labeled as AI | **fixed** (this pass) | `LibrarySynthesisPanel.tsx` (already local); roadmap + marketing | Heuristic disclosure |
| Similarity as plagiarism | **fixed** (this pass) | `NotebookSimilarityPanel.tsx` | Overlap / similarity language only |
| Fine-tuned SLMs shipped by Openbentt | **fixed** (this pass) | `marketingContent.ts` | User-run GGUF / HF models |

---

## Test evidence index

| Area | Test files |
|------|------------|
| Research corpus / citations | `corpusIndex.test.ts`, `citationTools.test.ts`, `citationGraphSync.test.ts` |
| Writing assist parsers | `parseWritingAssist.test.ts`, `latexTools.test.ts` |
| Chat / release / downloads | `chat.test.ts`, `releaseDownloads.test.ts`, `composerPlaceholder.test.ts` |
| Local GGUF guardrails | `guardrails.test.ts` |
| E2E / ChatContext | **missing** | See `PRODUCT_DOC.md` §8 |

---

## Related documents

- [LAUNCH_READINESS.md](./LAUNCH_READINESS.md) — what to ship and what not to say yet  
- [research-workspace-roadmap.md](./research-workspace-roadmap.md) — engineering phases  
- [PRODUCT_DOC.md](./PRODUCT_DOC.md) — architecture and inventory (updated for desktop-first)
