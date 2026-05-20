# Openbentt — Senior Engineer Product Document

**Version:** 2.0.6  
**Date:** May 2026  
**Scope:** Full product — Web + Electron desktop

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [What Openbentt Does — Plain Language](#3-what-openbentt-does)
4. [System Architecture](#4-system-architecture)
5. [Feature Inventory](#5-feature-inventory)
6. [Current State Assessment](#6-current-state-assessment)
7. [UX Improvement Plan](#7-ux-improvement-plan)
8. [Testing Plan](#8-testing-plan)
9. [Phased Completion Roadmap](#9-phased-completion-roadmap)
10. [Distribution & Release Plan](#10-distribution--release-plan)
11. [Tech Debt & Known Issues](#11-tech-debt--known-issues)
12. [Success Metrics](#12-success-metrics)

---

## 1. Executive Summary

Openbentt is a **local-first, privacy-respecting multi-provider AI chat client** packaged as both a **static web app** and an **Electron desktop application**. It lets users bring their own API keys (OpenRouter, OpenAI, Anthropic, Google Gemini, or any OpenAI-compatible endpoint) and run chats, document workspaces, research pipelines, and on-device language models — all without any backend account system.

**Unique value:**
- API keys never leave the user's own browser or device
- Full on-device inference: WebGPU/WASM (in-browser via `@huggingface/transformers`) and native GGUF via `llama-server` (Electron)
- Document-grade workspaces (LaTeX → PDF via WASM or server, research citation graphs)
- Compare 2–4 models side-by-side with real timing metrics

**Current maturity (v2.0.6):** **Release-ready** for tagged distribution. Core chat, workspaces, desktop GGUF (bundled llama-server), download progress, onboarding, auto-update hooks, and unit-test coverage are in place. **Manual smoke tests** ([LOCAL_RELEASE_CHECKLIST.md](../LOCAL_RELEASE_CHECKLIST.md)) and **unsigned installers** remain the operator’s responsibility before each public release.

---

## 2. Problem Statement

### What users currently deal with

| Pain | Current tools | What Openbentt does differently |
|------|--------------|----------------------------------|
| API keys sent to third-party chat wrappers | ChatGPT wrappers, Poe | Keys stay in browser localStorage; zero server-side account system |
| No way to compare model outputs side-by-side | One model per tab | Parallel 2–4 model comparison with latency + token metrics in one UI |
| Cloud-only inference — privacy / offline concerns | All major chat UIs | On-device Gemma/Qwen (WebGPU or CPU WASM) + GGUF via llama-server |
| Academic writing tools are separate from AI | Overleaf, Zotero | Notebook workspace: AI ↔ LaTeX/PDF, BibTeX, citation graphs, in one place |
| Gated HF model tokens scattered | Manual env vars | Electron: encrypted HF token storage (OS keychain via safeStorage) |
| No way to share a conversation | Most self-hosted clients | Share URL via compressed hash snapshot (no server needed) |

---

## 3. What Openbentt Does

### 3.1 Core Chat
Users pick a provider (OpenRouter, OpenAI, etc.) and model, type a message, and get a streamed reply. Messages are kept in browser localStorage — no account, no server. Multiple chat threads supported. First message auto-names the thread.

### 3.2 Model Comparison
Send one message → get parallel replies from 2–4 models at the same time. Each reply shows Time to First Token (TTFT), total ms, and prompt/completion token counts. Good for evaluating models on your actual prompts.

### 3.3 On-Device Inference
Two paths:
- **WebGPU / WASM (web + desktop):** `@huggingface/transformers` runs Gemma, Qwen, and other models entirely inside the browser. Falls back from WebGPU → WASM CPU → smaller model automatically.
- **Local GGUF (desktop only):** Download any GGUF model from Hugging Face via the Labs panel. Electron spawns `llama-server` on localhost; chat code talks to it like a normal OpenAI-compatible API.

### 3.4 Notebook Workspace (LaTeX / PDF)
Upload a PDF or start a LaTeX document. Ask the AI to improve sections, fix errors, add citations. Changes can be applied back to the document. Compiles PDF either via BusyTeX WASM (in-browser) or a remote `pdflatex` server. Shows diff before applying.

### 3.5 Research Labs
- BibTeX management and citation graph visualization
- Hugging Face dataset card browser
- Local GGUF Hub: search, download, manage, run GGUF models
- Optional research proxy: enriches queries with Wikipedia, arXiv, Semantic Scholar, Brave search

### 3.6 LaTeX Write Workspace
KaTeX-powered preview with raster/PDF export. Lighter than full Notebook; designed for formula-heavy notes.

### 3.7 Benchmark
Run a fixed prompt N times across selected models; plot latency distributions. Useful for model selection decisions.

### 3.8 WebGPU Diagnostics
Probe the GPU, check adapter capabilities, run optional Gemma smoke test. Useful for debugging on-device issues.

### 3.9 Share
Export any chat thread as a compressed URL hash. Recipient opens `/share#…` and gets a read-only static view. No server required.

### 3.10 Settings
Full in-app settings: switch provider, change model, dark/light theme, research toggle, quota display, GGUF binary path, HF token, keyboard shortcuts.

---

## 4. System Architecture

### 4.1 Layers

```
┌──────────────────────────────────────────────────────────┐
│  React SPA (Vite)                                        │
│  Pages · ChatContext · Hooks · shadcn/ui + Tailwind      │
└─────────────┬────────────────────────┬───────────────────┘
              │                        │
     cloud APIs (HTTPS)       local inference
     openrouter.ai            ┌─────────────────┐
     openai.com               │ WebGPU/WASM      │
     anthropic.com            │ Transformers.js  │
     generativelanguage...    └────────┬─────────┘
                                       │
┌──────────────────────────────────────▼───────────────────┐
│  Electron main (Node)  [desktop only]                    │
│  app:// · IPC · hfSecretStore · localGgufService         │
│  → spawns llama-server on 127.0.0.1:<dynamic port>       │
└──────────────────────────────────────────────────────────┘
```

### 4.2 AI Provider Routing

```
ChatContext.runAssistantPipeline
 ├── aiProvider === "openrouter"       → streamOpenRouterChat (HTTPS)
 ├── aiProvider === "openai_direct"    → streamOpenRouterChat w/ base URL
 ├── aiProvider === "openai_compatible"→ streamOpenRouterChat w/ custom URL
 ├── aiProvider === "webgpu_gemma"     → streamLocalGemmaChat (in-renderer)
 └── aiProvider === "local_gguf"       → streamLocalGgufChat
                                          → IPC: ensureServer
                                          → HTTP 127.0.0.1/v1/chat/completions
```

### 4.3 Key Files

| Area | Files |
|------|-------|
| Entry & routing | `src/App.tsx`, `src/main.tsx` |
| State machine | `src/context/ChatContext.tsx` |
| Chat types | `src/types/chat.ts` |
| AI streaming | `src/lib/aiStream.ts`, `src/lib/openrouter.ts` |
| WebGPU local | `src/lib/gemmaWebGpu/*` |
| GGUF local | `src/lib/localGguf/*` |
| Notebook | `src/lib/compileNotebook.ts`, `latexWasmCompile.ts`, many `latex*` helpers |
| Research | `src/lib/researchSources.ts`, `researchProxyClient.ts`, `bibtex.ts` |
| Electron main | `electron/main.mjs`, `localGgufService.mjs`, `hfSecretStore.mjs` |
| Electron bridge | `electron/preload.cjs` |
| Server (optional) | `server/research-proxy.mjs`, `server/latex-compile.mjs` |

---

## 5. Feature Inventory

### 5.1 Complete ✅

| Feature | Evidence |
|---------|----------|
| Multi-provider chat streaming | `aiStream.ts`, `ChatContext.tsx` |
| OpenRouter model list + free-tier highlights | `openrouter.ts`, `useOpenRouterModels.ts` |
| Chat thread management (multi-thread, titles, search) | `ChatContext.tsx`, `ChatThreadBar.tsx` |
| Parallel model comparison (2–4) | `ChatContext.tsx` comparison pipeline |
| Attachments (images, audio, video frame, PDF) | `ChatInput.tsx`, `ChatContext.tsx` |
| In-chat charts (`openbentt-chart` fences) | `chartSpec.ts`, `OpenbenttChartViews.tsx` |
| Share URL (hash-based snapshot) | `shareRun.ts`, `ShareLinkButton.tsx`, `ShareViewPage` |
| Chat export (Markdown, PDF) | `chatExportMarkdown.ts`, `chatExportPdf.ts` |
| Keyboard shortcuts | `KeyboardShortcutsSheet.tsx` |
| Prompt snippets | `promptSnippets.ts`, `PromptSnippetsMenu.tsx` |
| Context window meter | `contextMeter.ts`, `ContextMeter.tsx` |
| Provider quota meter | `providerRateLimits.ts`, `ProviderQuotaMeter.tsx` |
| Dark/light theme | `ThemeContext.tsx` |
| Settings panel | `SettingsPanel.tsx` |
| WebGPU/WASM local Gemma (web + desktop) | `gemmaWebGpu/*`, `WebGpuPage.tsx` |
| Local GGUF download + llama-server (desktop) | `localGgufService.mjs`, `LocalGgufHub.tsx` |
| HF token encrypted storage (desktop) | `hfSecretStore.mjs` |
| Notebook LaTeX/PDF workspace | `NotebookPdfWorkspace.tsx`, `compileNotebook.ts` |
| Research labs (BibTeX, citation graph, HF datasets) | `ResearchLabsPage.tsx`, `bibtex.ts`, `citationGraph.ts` |
| Research proxy server (Docker) | `server/research-proxy.mjs` |
| LaTeX compile server | `server/latex-compile.mjs` |
| Docker deploy (nginx + proxy) | `Dockerfile`, `docker-compose.yml` |
| Electron packaging (AppImage, deb, NSIS, dmg) | `electron-builder` config, `RELEASING.md` |
| CI: lint + test + build | `.github/workflows/ci.yml` |
| Release pipeline (GitHub Actions) | `.github/workflows/release.yml` |
| Storage migration (legacy cogerphere-* keys) | `storageMigrate.ts` |

### 5.2 Partial / Post-release ⚠️

| Feature | What exists | What's missing |
|---------|------------|----------------|
| **Code signing** | Unsigned CI builds | Apple/Microsoft certs for frictionless install |
| **E2E (Playwright)** | Manual checklist only | Automated UI + Electron flows |
| **Component tests** | Lib/unit tests (~27 files) | No `.test.tsx` for ChatContext / ChatInput |
| **Comparison on local** | Disabled for GGUF/WebGPU | No in-UI explanation tooltip |
| **Agent workflow** | `agentWorkflow.ts` stub | Unused |
| **Mobile polish** | Responsive layout | Keyboard overlap, touch gestures |
| **Intel macOS** | arm64 llama binary in CI | x64 binary or universal fat binary |

### 5.3 Shipped in v2.0.6 ✅ (formerly gaps)

| Feature | Resolution |
|---------|------------|
| Route discovery | `/write`, `/benchmark`, `/webgpu` in sidebar |
| llama-server distribution | `download-llama-server.mjs` + CI + `extraResources` |
| Auto-update | `electron-updater` + Settings card |
| First-run desktop GGUF | Setup → Labs path |
| Download progress | Bytes, speed, ETA in Labs/composer |
| Settings tabs | General / AI / Research / Experiments |

### 5.4 Not Started / Low priority ❌

| Feature | Priority | Notes |
|---------|----------|-------|
| **E2E / integration tests** | Medium | Use Playwright; see §8 |
| **Component tests** | Medium | ChatContext still untested |
| **System prompt editor** | Medium | System prompts are workspace-injected only; no user-editable system prompt per thread |
| **Message editing (user)** | Medium | `AssistantMessageToolbar` has retry but user message edit is a pencil that reloads composer — not true inline edit |
| **Conversation branching** | Medium | No fork/branch from message; retry replaces in-place |
| **Model pinning/favorites** | Low–Medium | Model selector has no "pin" or favorites |
| **Token usage dashboard** | Low–Medium | Per-session metrics shown; no historical usage/cost tracking |
| **Plugin / tool-call display** | Low–Medium | Tool calls from models shown as text; no structured tool-call UI |
| **Voice input / TTS** | Low | Not present |
| **Sync across devices** | Low | localStorage only; no cloud sync option |
| **Multi-window (desktop)** | Low | Single `BrowserWindow`; no multiple-window support |

---

## 6. Current State Assessment

### 6.1 What works well
- The core chat loop is solid and well-tested at the unit level
- Provider abstraction (`aiStream.ts`) is clean and extensible
- Notebook workflow is genuinely powerful — LaTeX ↔ AI ↔ PDF in one surface
- The Electron shell is well-secured (context isolation, sandbox, no node in renderer)
- GGUF download and `llama-server` lifecycle management is robust (resume download, disk check, SHA-256 verify, cleanup on quit)

### 6.2 Core concerns

**Testing gap** — Unit tests cover libs and config (`canSendChat`, guardrails, placeholders, download math); `ChatContext` and full UI flows are **manual-only** ([LOCAL_RELEASE_CHECKLIST.md](../LOCAL_RELEASE_CHECKLIST.md)).

**Signing gap** — macOS and Windows builds are unsigned. Non-technical users may see Gatekeeper/SmartScreen warnings; document in release notes.

**Intel Mac gap** — CI bundles arm64 `llama-server` only; Intel Mac users rely on PATH or custom binary path.

---

## 7. UX Improvement Plan

### 7.1 Navigation and discovery

**Problem:** Three fully functional workspaces are hidden.
**Fix:** Add `/write`, `/benchmark`, `/webgpu` to `WORKSPACE_NAV_ITEMS` with appropriate icons (PenLine, BarChart2, Cpu). Also add a "Labs" sub-nav collapse for advanced items if sidebar becomes crowded.

**Problem:** Download page is reachable only from sidebar "Download" or direct URL; no contextual surface on first open.
**Fix:** Add "What's new / Download latest" callout to settings when a new GitHub Release is detected (via a lightweight version check).

### 7.2 Setup and onboarding

**Problem:** `SetupPage` tells on-device users they need GPU — but WASM/CPU path always works.
**Fix:** Rewrite the on-device setup card to say "For best speed, a GPU is recommended. Your device will work on CPU too." Show a hardware detection badge with actual result rather than a binary pass/fail.

**Problem:** No guide for desktop GGUF path.
**Fix:** Add a 3-step visual guide in the desktop first-run: "1. Download a model in Labs. 2. Pick Local GGUF in Settings. 3. Start chatting." Trigger it on first Electron launch via `userData/onboarded.json` flag.

### 7.3 Chat interface

**Problem:** User message editing reloads the composer; no branch / fork.
**Improvement:** Implement true inline edit with confirmation + auto-regenerate. Add "branch here" to fork the conversation without destroying the original.

**Problem:** Retry (regenerate) on assistant message replaces in-place with no history.
**Improvement:** Keep the original response hidden behind a "See previous" toggle (like ChatGPT retries).

**Problem:** Tool calls / structured outputs from models appear as raw text.
**Improvement:** Detect OpenAI tool-call JSON in assistant replies and render them as collapsible "tool call" cards.

### 7.4 Mobile

**Problem:** Chat input is cramped; keyboard overlaps content on iOS/Android (web app).
**Fix:** Use `visualViewport` resize handler to push input above keyboard. Set `overflow: hidden` on body when keyboard is open. Add swipe-to-switch-thread gesture on mobile.

### 7.5 Settings

**Problem:** Settings is a single large panel with no sections.
**Fix:** Split into tabbed sections: General, Models, Providers, Desktop (Electron-only section), Privacy, Advanced. This is already a natural split from the existing content.

### 7.6 Error states

**Problem:** API errors show generic text; rate limit messages are not actionable.
**Fix:** `userFacingError.ts` already translates some; extend to parse HTTP 429 `x-ratelimit-*` headers and show "You can try again in X seconds" with a countdown timer.

**Problem:** GGUF "server not found" error is hard to diagnose.
**Fix:** Add a diagnostic checklist UI in Labs when `llama-server` is not found: "✅ Downloaded model  ❌ llama-server binary not found → [Install guide]".

### 7.7 Performance

- Lazy-load the Notebook and Labs pages (currently lazy but the transformers.js chunk is large)
- Add a proper loading skeleton to `LocalGgufHub` while registry loads
- Use `startTransition` for model selector updates to avoid blocking input

---

## 8. Testing Plan

### 8.1 Current coverage (v2.0.6)

| Layer | Current | Target |
|-------|---------|--------|
| Lib unit tests | **~27 files** (Vitest) | Keep + expand |
| Config / release | `chat.test`, `releaseDownloads.test`, `composerPlaceholder.test` | ✓ |
| Download progress | `downloadProgress.test` | ✓ |
| Electron smoke | `electron/llamaBinary.test.mjs` (bundled binary) | Expand IPC tests |
| Component tests | 0 | ChatInput, SettingsPanel |
| Context/state tests | 0 | ChatContext |
| E2E | 0 | Playwright before major refactors |
| Server | 0 | research-proxy, latex-compile |

**Commands:** `npm run test` (unit + electron) · `npm run test:unit` · `npm run test:electron`

**Pre-tag manual pass:** [LOCAL_RELEASE_CHECKLIST.md](../LOCAL_RELEASE_CHECKLIST.md)

### 8.2 Unit tests to add (immediate)

**ChatContext (`src/context/ChatContext.tsx`)**
```
- canSendChat with each provider
- normalizeApiConfig migration paths
- Message append / streaming accumulation
- Error handling: network error, abort, rate limit
- Comparison mode: parallel requests, dedup
```

**Components**
```
- ChatInput: submit, shift+enter, attachment add/remove, snippet insert
- SettingsPanel: provider switching changes available models
- NotebookPdfWorkspace: apply-from-chat logic
- LocalGgufHub: download states, registry display
```

**Electron main process**
```
- resolveLlamaServerBinary: env / settings / bundled / PATH precedence
- getGgufPaths: correct userData layout
- getDiskFreeBytesApprox: parse df output
- IPC handler payloads: invalid repoId, non-gguf filename
```

### 8.3 Integration tests

Use **Vitest** + **@testing-library/react** + **MSW** (mock service worker for API mocks):

```
- Full chat send → receive → display: mock OpenRouter response
- Share flow: encode thread → decode → render
- Notebook: upload PDF text → AI apply → diff → accept
- Research: proxy returns results → context injected in next message
- Setup page: incomplete config → redirect; complete config → /chat
```

### 8.4 E2E tests (Playwright)

Priority flows to automate:

| Test | Why |
|------|-----|
| New user: set API key → send message → receive reply | Core loop |
| Compare mode: pick 2 models → send → both reply | Comparison |
| Export chat as Markdown | Data portability |
| Share → open share link | Sharing |
| Settings: switch dark mode, persist on reload | Persistence |
| Desktop: download GGUF → chat via local provider | Desktop regression |
| Setup page: enter key → redirect | Onboarding |

**Tooling:** Playwright with `@playwright/test`. For Electron, use `playwright` with `_electron` launch mode pointing at the built app.

### 8.5 Server tests

```
research-proxy.mjs:
- POST /research returns aggregated sources from mocked upstream APIs
- Brave search skipped when API key absent
- Request timeout handled

latex-compile.mjs:
- POST /compile with valid .tex returns PDF buffer
- POST /compile with invalid .tex returns error with log
- GET /health returns 200
```

### 8.6 CI integration

- Unit + integration: run on every PR (`npm run test`)
- E2E: run on `main` push and tags (can be nightly to keep PR CI fast)
- Electron E2E: run on release tag builds after packaging

---

## 9. Phased Completion Roadmap

### Phase 0 — Foundation Cleanup (1–2 weeks)

Goal: Remove confusion, fix docs drift, add minimal safety net.

**Tasks:**
- [ ] Delete unused `src/lib/agentWorkflow.ts` (no imports)
- [ ] Delete or repurpose unused `src/components/PlaygroundShell.tsx`
- [ ] Fix `electron/README.md`: `preload.mjs` → `preload.cjs`
- [ ] Fix `PRODUCTION_CHECKLIST.md`: Electron first-load path entry
- [ ] Add `/write`, `/benchmark`, `/webgpu` to `WORKSPACE_NAV_ITEMS` with icons
- [ ] Write 5 highest-value unit tests for `ChatContext` (canSendChat, normalizeApiConfig)
- [ ] Update `CHANGELOG.md` with all [Unreleased] changes
- [ ] Update `Download` page links to current version artifacts

**Definition of done:** No dead code in tree, all sidebar routes discoverable, stale docs fixed, CI passing.

---

### Phase 1 — Chat Polish (2–3 weeks)

Goal: Core chat loop is delightful and production-ready.

**Tasks:**
- [ ] True inline user message edit (replaces composer-reload behavior)
- [ ] Retry history: keep previous assistant responses; toggle "See previous"
- [ ] Mobile: `visualViewport` keyboard push-up fix
- [ ] Settings: split into tabbed sections (General, Models, Providers, Desktop, Privacy, Advanced)
- [ ] Error UX: rate-limit countdown timer; GGUF diagnostic checklist in Labs
- [ ] "No model selected" and "API key missing" empty states are actionable (button to Settings)
- [ ] Model selector: favorites / pin models to top
- [ ] Add `startTransition` to model switch to avoid input jank
- [ ] Chat search: highlight snippets scroll to correct message position
- [ ] Thread sidebar: collapse/expand by date groups

**Tests:** Component tests for ChatInput, SettingsPanel, MessageBubble interactions.

---

### Phase 2 — Local Models & Desktop (2–3 weeks)

Goal: Local inference (GGUF + WebGPU) is self-contained and works out of the box.

**Tasks:**
- [ ] Bundle `llama-server` per-platform in CI artifacts (`electron-builder` `extraResources`)
- [ ] macOS code signing + notarization secrets in GitHub Actions
- [ ] Windows Authenticode signing (optional; at least document the workflow)
- [ ] Desktop first-run guide (3-step onboarding modal gated by `userData/onboarded.json`)
- [ ] Fix Setup page messaging: WebGPU preferred but WASM/CPU always available
- [ ] Add UI explanation when comparison mode is disabled for local providers
- [ ] GGUF: download progress — show ETA + speed; support pause/resume button
- [ ] GGUF: model VRAM estimate shown before download starts
- [ ] WebGPU: show which backend (WebGPU / WASM / CPU) is currently active in the thread header
- [ ] Auto-update via `electron-updater` (check on startup, prompt user)
- [ ] Single-instance lock (`app.requestSingleInstanceLock()`)
- [ ] Deep link / protocol handler (`openbentt://`) for opening share links in desktop app

**Tests:** Electron main-process unit tests; Playwright Electron E2E for GGUF download-to-chat flow.

---

### Phase 3 — Workspaces & Research (2–3 weeks)

Goal: Notebook, Research Labs, Write, and Benchmark are polished and discoverable.

**Tasks:**
- [ ] Notebook: progress indicator during PDF compilation (WASM can be slow for large docs)
- [ ] Notebook: auto-save draft to localStorage (prevent data loss on reload)
- [ ] Notebook: diff view before apply should be side-by-side not inline
- [ ] Research Labs: allow attaching research context to a chat thread directly ("Research this topic" → adds sources to next message)
- [ ] Research Labs: GGUF Hub — add VRAM badge, parameter count from HF model card
- [ ] `/write` workspace: add to sidebar nav; upgrade PDF export to real vector PDF via `pdfFromText.ts`
- [ ] Benchmark: persist results to localStorage; export as CSV
- [ ] Benchmark: add to sidebar nav
- [ ] Agent workflow: design and implement basic multi-step (search → summarize → cite) using `agentWorkflow.ts` stub
- [ ] System prompt editor: per-thread user-editable system prompt (in addition to workspace-injected prompts)

**Tests:** Integration tests for Notebook apply-from-chat; E2E for Research proxy flow.

---

### Phase 4 — Quality & Production Hardening (2 weeks)

Goal: App is production-ready with confidence.

**Tasks:**
- [ ] Full E2E suite (Playwright): all flows from Phase 1–3
- [ ] Server tests: research-proxy, latex-compile
- [ ] Audit all IPC handlers: add Zod validation for all `localGguf:*` payloads
- [ ] CSP headers in Docker nginx config (currently absent — needed for security hardening)
- [ ] Security audit: no secrets in localStorage beyond intended API keys; no IPC path traversal
- [ ] Performance profiling: measure cold start time, first chat latency, WASM init time
- [ ] Bundle audit: check for unused dependencies (`knip` or `depcheck`)
- [ ] Accessibility: keyboard navigation, ARIA roles for chat messages, focus management in dialogs
- [ ] Error boundary recovery: current `ErrorBoundary` resets; add Sentry (or similar, opt-in) for crash reports
- [ ] Finalize `PRODUCTION_CHECKLIST.md`

---

### Phase 5 — Distribution & Launch (1–2 weeks)

Goal: Users can discover, install, and update the app with zero friction.

**Tasks:**
- [ ] GitHub Releases: ensure all platform artifacts are correctly named and checksummed
- [ ] Landing page (`HomeLandingPage`): update with current feature set; add download buttons linking to latest release
- [ ] Auto-update channel live (Electron updater configured against GitHub releases)
- [ ] Docker image: publish to GitHub Container Registry (GHCR) with version tags
- [ ] Docs site: publish `docs/` as GitHub Pages (or simple static site from `dist/docs/`)
- [ ] SEO: verify `VITE_PUBLIC_SITE_URL`, Open Graph tags, sitemap
- [ ] Version bump workflow: `npm version patch/minor/major` + tag + push triggers release pipeline

---

## 10. Distribution & Release Plan

### Current pipeline

```
git tag v2.0.7
git push origin v2.0.7
          │
          ▼
.github/workflows/release.yml
  ├── build-linux-web  → AppImage + .deb + web-dist.zip
  ├── build-windows    → NSIS .exe + zip
  └── build-macos      → .dmg + zip
          │
          ▼
publish job → single GitHub Release with all artifacts
```

### Gaps and fixes

| Gap | Fix |
|-----|-----|
| `llama-server` not in artifacts | Add `extraResources` block to `electron-builder` config; build platform binaries in CI |
| macOS unsigned | Add Apple Developer cert + notarization to `build-macos` job (secrets: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `CSC_LINK`, `CSC_KEY_PASSWORD`) |
| Windows unsigned | Add Authenticode cert (optional for now; document as "coming soon") |
| No auto-update feed | `electron-updater` reads GitHub releases; add `publish` config to `electron-builder` pointing at GitHub |
| Docker not published | Add `docker/build-push` step in release workflow targeting GHCR |
| No checksums | Add `sha256sum` step to release job; attach `checksums.txt` to release |
| Version drift in Download page | `releaseDownloads.ts` should read `package.json` version dynamically, not hardcoded URLs |

### Versioning strategy

Follow **Semantic Versioning**:
- **Patch** (`2.0.x`): bug fixes, doc updates, minor UX tweaks
- **Minor** (`2.x.0`): new features, new providers, new workspaces
- **Major** (`x.0.0`): breaking changes (storage schema, API contract changes)

---

## 11. Tech Debt & Known Issues

| Item | Severity | Where |
|------|----------|-------|
| `agentWorkflow.ts` exported but never imported | Low | `src/lib/agentWorkflow.ts` |
| `PlaygroundShell.tsx` appears unused | Low | `src/components/PlaygroundShell.tsx` |
| `src/pages/Index.tsx` dead re-export | Low | `src/pages/Index.tsx` |
| `electron/README.md` says `preload.mjs` (wrong) | Medium | `electron/README.md` |
| `PRODUCTION_CHECKLIST.md` Electron path item stale | Medium | `PRODUCTION_CHECKLIST.md` |
| No CSP in Docker nginx config | High | `docker/nginx-docker.conf` |
| IPC payloads: no Zod validation; trust renderer inputs | Medium | `electron/localGgufService.mjs` |
| `ChatContext.tsx` is ~900 lines; no unit coverage | High | `src/context/ChatContext.tsx` |
| No single-instance lock in Electron | Medium | `electron/main.mjs` |
| Download page release URLs may drift | Medium | `src/config/releaseDownloads.ts` |
| `use-toast.ts` duplicated in `src/hooks/` and `src/components/ui/` | Low | Both locations |
| Storage: no quota management; localStorage can fill up | Medium | `ChatContext` storage writes |
| No lazy loading for Notebook page heavy deps (pdfjs, busytex) | Medium | `vite.config.ts` |
| WebGPU WASM cold load can take 30–120s with no user feedback | High | `WebGpuPage`, `LocalOnDeviceModelBar` |

---

## 12. Success Metrics

### Product health indicators

| Metric | Current | Target |
|--------|---------|--------|
| Core unit test coverage (lib/) | ~22 files | +10 files including ChatContext |
| Integration test coverage | 0 | 8 happy-path flows |
| E2E scenarios | 0 | 7 (see testing plan) |
| Hidden routes made discoverable | 0/3 | 3/3 |
| Electron builds unsigned | 1/1 | macOS signed + notarized |
| llama-server bundled in release | No | Yes |
| TTFT for cloud chat (p50) | N/A (measured per session) | Expose in telemetry or benchmark export |
| On-device load time (WASM Qwen 0.5B) | ~30–60s no feedback | Progress shown; UX target < perceived wait |

### Release readiness checklist

- [ ] `npm run lint` passes
- [ ] `npm run test` passes (all unit tests)
- [ ] E2E suite passes against latest build
- [ ] No unsigned binaries (macOS)
- [ ] `llama-server` bundled for all platforms
- [ ] CHANGELOG.md updated
- [ ] Download page URLs match new release
- [ ] `PRODUCTION_CHECKLIST.md` reviewed
- [ ] Docker image builds and serves correctly

---

*This document should be updated at the start of each phase and reviewed before each release tag.*
