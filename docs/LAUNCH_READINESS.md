# Openbentt — launch readiness

**Audience:** product, marketing, release operators  
**Companion:** [FEATURE_COMPLETION_LOG.md](./FEATURE_COMPLETION_LOG.md)  
**Last updated:** May 2026

---

## Terminology (use in all copy)

| Say | Do not say | Reality |
|-----|------------|---------|
| Desktop app (primary) | “Cloud workspace” / “web-first” | Electron is the full product |
| Web app (optional) | Parity with desktop | OpenRouter + Notebook; no `/labs` offline stack |
| Meridian **writing prompts** / **profile** | Meridian **model** / “our best model” | `MERIDIAN_MODEL_HINT` in `writingPrompts.ts` — persona text sent to **your** chat model |
| Cross-paper **theme report** (local heuristics) | AI synthesis / literature review AI | `buildCrossPaperSynthesis()` — term frequency only (`synthesis.ts`) |
| Draft **similarity** / **overlap** with library | Plagiarism detection | TF–IDF + optional MiniLM cosine similarity (`corpusIndex.ts`, `embeddingIndex.ts`) |
| Run **your** GGUF / OpenRouter models | Openbentt fine-tuned models | No proprietary weights shipped; JSONL export for external training |

---

## Shippable now (safe to market)

These are **completed** on **desktop** with manual smoke per [LOCAL_RELEASE_CHECKLIST.md](../LOCAL_RELEASE_CHECKLIST.md):

1. **Download & install** — Windows, Linux, macOS artifacts from GitHub Releases (`releaseDownloads.ts`).
2. **BYOK multi-provider chat** — OpenRouter and direct APIs; keys in localStorage only.
3. **Model arena** — 2–4 cloud models, TTFT and token metrics.
4. **Notebook** — LaTeX ↔ PDF, apply-from-chat, BusyTeX WASM compile.
5. **Meridian prompts** — Structured LaTeX writing prompts + import parsers (requires user’s LLM).
6. **Offline GGUF** — HF download, llama-server, encrypted HF token (desktop).
7. **Research project (Notebook tabs)** — Citations, similarity scans, review markers, submit checklist, writing assist.
8. **Library (desktop `/labs`)** — PDF corpus, heuristic theme report, bibliography, JSONL export.
9. **Privacy story** — No Openbentt account; local-first storage; optional self-hosted proxy.

**Secondary (web) — qualify in copy:**

- OpenRouter chat, setup, share links, Notebook with Meridian prompts.
- No Research Labs route, no local GGUF, no benchmark/write/webgpu routes (`platformSurface.ts`).

---

## Risky (ship with disclosure)

| Area | Risk | Mitigation in copy / ops |
|------|------|---------------------------|
| **Unsigned installers** | macOS Gatekeeper, Windows SmartScreen | Release notes: right-click open / “More info” |
| **Intel macOS** | CI bundles arm64 `llama-server` only | Document PATH / custom binary |
| **WebGPU/WASM cold start** | 30–120s, large downloads | “On-device models load in-browser; first run is slow” |
| **MiniLM semantic index** | CDN model fetch on first use | “Downloads a small embedding model once” |
| **Research proxy** | Optional; needs Docker + keys | Not required for core desktop story |
| **No E2E automation** | Regressions caught manually only | Run LOCAL_RELEASE_CHECKLIST before each tag |
| **localStorage limits** | Large PDF extracts on web | Recommend desktop for big libraries |
| **Comparison + local models** | Compare disabled for GGUF/WebGPU | Do not claim “compare local models side by side” |

---

## Do not market yet

| Claim | Why |
|-------|-----|
| “Meridian 0.1 model” / “fine-tuned Meridian weights” | No dedicated model artifact or Settings route |
| “AI-powered literature synthesis” | Synthesis is local term-frequency heuristics |
| “Plagiarism checker” | Similarity is overlap scoring vs your own library only |
| “Built-in fine-tuning” | JSONL export only; training is external |
| “Full research labs in the browser” | `/labs` redirects to `/chat` on web |
| “Production-grade publisher submission validation” | Venue checklist is advisory (`submissionRules.ts`) |
| “Automatic plagiarism-safe guarantee” | No third-party corpus or Turnitin-style workflow |
| “Web parity with desktop” | Intentionally reduced web surface |
| “Signed, frictionless install everywhere” | Signing not in CI |

---

## Known limitations (honest footnotes)

- **ChatContext** has no automated integration tests (~900 lines).
- **Agent workflow** stub unused (`agentWorkflow.ts`).
- **Caption AI** prompts chat; does not auto-patch `\caption{}` without user apply.
- **Citation graph** enrichment uses Semantic Scholar over the network; not fully offline.
- **Review workflow** is paste-first; PDF annotation → review notes only at upload time.
- **Semantic index** on very large libraries may freeze UI; no disk-persisted embeddings on web yet (see roadmap Phase B).
- **Message edit** reloads composer; not true inline edit (see PRODUCT_DOC §7).
- **Cloud inference** still sends prompts to provider APIs when user selects cloud models — “local-first” means data stays on device for storage/history, not that all inference is on-device.

---

## Release checklist pointer

Before tagging `v*`:

1. [LOCAL_RELEASE_CHECKLIST.md](../LOCAL_RELEASE_CHECKLIST.md) (all sections)
2. [PRODUCTION_CHECKLIST.md](../PRODUCTION_CHECKLIST.md)
3. Update [FEATURE_COMPLETION_LOG.md](./FEATURE_COMPLETION_LOG.md) if scope changed
4. Scan marketing strings in `src/config/marketingContent.ts` against the terminology table above

---

## Roadmap alignment

Engineering phases for research hardening: [research-workspace-roadmap.md](./research-workspace-roadmap.md)  
Product phases (chat polish, signing, E2E): [PRODUCT_DOC.md](./PRODUCT_DOC.md) §9

Deferred items called out in the completion log should not appear in launch hero copy until status moves to **completed**.
