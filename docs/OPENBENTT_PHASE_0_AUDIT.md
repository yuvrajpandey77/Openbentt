# Openbentt Phase 0 Forensic Audit

**Status:** AUDIT ONLY — zero code changes made during this phase.
**Report file:** `docs/OPENBENTT_PHASE_0_AUDIT.md` (the only file this phase was permitted to create).
**Audit date (UTC):** 2026-09-16. **Auditor method:** read-only inspection (file reads, content search, `git` metadata, byte counts). No builds, no installs, no test runs, no exploitation.

---

## 1. Executive Summary

Openbentt (repository `SecuredChatCogerphere`, `package.json` name `openbentt`, v2.2.5) is a **single application, hybrid system**: one React 18 + Vite 5 + TypeScript single-page application that ships as (a) a static **web app** and (b) an **Electron desktop app** whose Node main process adds native capability. It is **not a monorepo** (single `package.json`, no workspaces) and not a polyrepo.

What it verifiably is today:

- A **bring-your-own-key, multi-provider chat client** (OpenRouter, OpenAI direct, OpenAI-compatible/Ollama, Anthropic, Google Gemini) with SSE streaming, per-model latency/token metrics, and **parallel 2–4-model tiled comparison**. Chat history and settings persist locally.
- A **two-runtime local inference system**: in-renderer WebGPU/WASM small models via Transformers.js/ONNX, and native GGUF models via a `llama-server` (llama.cpp) child process managed over IPC.
- A **research workspace**: Notebook Studio (LaTeX→PDF), PDF reading/annotation, papers library, a **narrow corpus-scoped RAG pipeline** (MiniLM embeddings + TF-IDF hybrid retrieval, no vector DB), Zotero sync (Web API + Better BibTeX), CSL citations, drafting/revision/submission tooling, and 12 LaTeX template packs.
- A **hardened Electron shell** (context isolation, sandbox, no Node in renderer, 5 audited preload bridges, safeStorage secret vault, SQLite project store, auto-update, GPU safe-mode recovery).

What it verifiably is **not** today: there are **no agents, no tool/function calling, no MCP (client or server), no authentication/authorization, no Gmail/Drive/Slack/GitHub/Notion-type connectors, no workflow engine, no vector database, no DOCX/XLSX/PPTX/OCR support, no Redis/Postgres/ORM, no OpenTelemetry/Sentry/structured logging, and no Python anywhere**. Several of these were proven absent by zero-result repository-wide searches (details in each section).

The single largest self-acknowledged hardening gap is the **complete absence of Content-Security-Policy** (web, Electron, and nginx), compounded by plaintext provider keys in browser `localStorage` on the web build. No CRITICAL remotely-exploitable compromise was verified in audit scope; the findings below are classified accordingly.

---

## 2. Repository Identity

| Item | Evidence |
|---|---|
| Repository root | `/home/yuvraj/Downloads/Projects/SecuredChatCogerphere` |
| Project name | `openbentt` (`package.json:2`), productName `Openbentt` (`package.json:3`), description "Desktop-first local-first AI workspace (Electron) with optional web OpenRouter chat and Notebook" (`package.json:4`) |
| Git remotes | `cobentt → git@github.com:COGERPHEREAILABS/Cobentt.git`; `origin → git@github.com:yuvrajpandey77/Openbentt.git` (verified `git remote -v`) |
| Current branch | `main` (verified `git branch --show-current`) |
| Current commit (at audit) | `9abfd68a281a34ea8a72da6bd8987c564c595919` — "added system design doc…" (verified `git log -1`) |
| Git status (pre-audit) | Clean — `git status --short` printed nothing before this report was created |
| Tracked files | 597 (`git ls-files \| wc -l`): 450 under `src/`, 33 under `electron/`, 16 under `server/`+`api/`+`scripts/`+`e2e/`+`test/` |
| Source size | **55,504 lines** across `src/ + electron/ + server/ + api/ + scripts/` (`git ls-files … \| xargs wc -l`) |
| On-disk footprint | working tree ~999 MB (excl. below); `node_modules` 2.3 GB; `.git` 32 MB; `dist/` 471 MB (local build, gitignored); `release/` 9.0 GB (local installer artifacts, gitignored) |
| Package managers | **npm is canonical** (`package.json` scripts all `npm run …`, `package-lock.json` 632,586 bytes, CI uses `npm ci`). **However `bun.lockb` (198,351 bytes) is also present** — dual lockfiles, see §28 |
| Languages | TypeScript, JavaScript (ESM + `.mjs`/`.cjs`), CSS, HTML, Shell (`docker/entrypoint.sh`), Dockerfile, YAML (workflows), JSON. **No Python**: glob `**/*.py` returns zero files |
| Frameworks | React 18.3, Vite 5, Electron 41, Tailwind CSS 3.4, Radix/shadcn-ui, TanStack Query 5, React Router 6 |
| Runtimes | Node.js 22 (Docker `node:22-bookworm-slim`, CI `node 22`; local shell runs Node v24.18.0), Electron 41 (bundled Chromium + Node), evergreen browsers |
| Build systems | Vite (`vite.config.ts`), electron-builder 26 (`package.json` `build` block), `tsc` 5.5, ESLint 9 |
| System type | **Single application, hybrid**: web SPA + Electron desktop shell + two zero-dependency Node micro-servers. Not a monorepo (no `workspaces` field in `package.json`), not a polyrepo |

---

## 3. Architecture Overview

```
Web static build (Vercel/nginx) · Docker (nginx :8080 + research proxy :8787)
Electron desktop (AppImage/deb/dmg/NSIS) — custom app:// protocol → dist/
        │  Vite build → dist/ (471 MB locally incl. WASM + model chunks)
        ▼
RENDERER — React 18 SPA (src/, 450 tracked files, ~50k LOC)
  ChatContext ──► streamChatForConfig → cloud SSE (OpenRouter/OpenAI/Anthropic/Gemini)
              ──► streamLocalGemmaChat → Transformers.js WebGPU/WASM (in-process)
              ──► streamLocalGgufChat ──► IPC ──► llama-server (127.0.0.1 HTTP)
  ResearchProjectContext → MiniLM+TF-IDF RAG → prompt evidence
  Notebook Studio → CodeMirror → BusyTeX WASM / pdflatex → PDF
  localStorage · IndexedDB · Web Worker
        │  preload.cjs — exactly 5 contextBridge surfaces (CI-enforced)
        ▼
ELECTRON MAIN (electron/, 33 tracked files, Node .mjs)
  IPC: desktop:* · localGguf:* · hfSecret:* · secretVault:* · zotero:*
       zoteroSecret:* · research:* (~40 handlers)
  node:sqlite research.db · job queue + worker_threads · safeStorage vault
  llama-server child · electron-updater · GPU safe-mode relaunch
        │  user-driven HTTPS egress only
        ▼
SERVERS: server/research-proxy.mjs (:8787) · server/latex-compile.mjs (:8788)
         api/latex-compile.ts (Vercel edge forwarder, optional)
```

Data gravity is **client-side**: the renderer calls provider APIs directly from the browser/Electron (BYOK); the two Node servers are optional helpers (research aggregation, LaTeX compile). There is no application backend, no session server, no multi-user service of any kind.

---

## 4. Repository Structure

### 4.1 Top-level directory roles

| Directory | Role | Evidence |
|---|---|---|
| `src/` | Renderer SPA: pages, components, contexts, lib (~170 modules), workers, types, config | 450 tracked files |
| `electron/` | Desktop main process, preload, IPC services, worker threads, tests | 33 tracked files; `main` = `electron/main.mjs` (`package.json:12`) |
| `server/` | Two Node micro-servers | `research-proxy.mjs` (286 lines), `latex-compile.mjs` (163 lines) |
| `api/` | Single Vercel edge function | `api/latex-compile.ts` only |
| `scripts/` | Build/release/verification scripts | 8 `.mjs` + `llama-release.json` |
| `public/` | Static assets: logos, manifest, robots, marketing, `templates/` (12 LaTeX packs), `core/` (BusyTeX WASM, gitignored) | `public/templates/packs/*.json` (12 files, verified listing) |
| `docker/` | nginx conf + entrypoint | `nginx-docker.conf`, `entrypoint.sh` |
| `e2e/` | Playwright specs | 2 spec files |
| `test/` | Test fixtures + helpers | `fixtures/`, `helpers/` |
| `docs/` | Product/audit/design docs incl. `SECURITY.md`, `THREAT_MODEL.md`, `TEST_COVERAGE.md` | 26 tracked files |
| `.github/workflows/` | CI + release pipelines | `ci.yml`, `release.yml` |
| `resources/llama/` | llama-server binaries per platform (gitignored) | `.gitkeep` placeholders tracked |
| `build/` | Electron icon (`icon.png`) | tracked |
| `release/`, `dist/`, `node_modules/` | Generated/large artifacts, **gitignored** (`.gitignore:10-13`) | present on disk only |

### 4.2 Directory classification

- **Source:** `src/`, `electron/`, `server/`, `api/`, `scripts/`
- **Configuration:** repo root (`package.json`, `vite.config.ts`, `tsconfig*.json`, `tailwind.config.ts`, `eslint.config.js`, `postcss.config.js`, `components.json`, `playwright.config.ts`, `vercel.json`, `Dockerfile`, `docker-compose.yml`, `.env.example`), `docker/`, `.github/`
- **Tests:** colocated `src/**/*.test.*` (84 test files repo-wide per `git ls-files | grep -c '\.test\.'`), `electron/*.test.mjs`, `e2e/`, `test/`
- **Generated (on disk, ignored):** `dist/`, `release/`, `node_modules/`, `.cache/`, `.electron-dev-profile/`, `public/core/busytex/`, `resources/llama/*/{llama-server,*.dll}`
- **Ignored (per `.gitignore`):** above plus `.env`/`.env.*` (except `.env.example`), logs, editor files, `.vercel`

### 4.3 Important files and their apparent purpose

| File | Purpose (verified by reading) |
|---|---|
| `src/main.tsx` | Entry: unregisters stale service workers, runs `migrateAllLegacyStorage()`, mounts `<App/>` |
| `src/App.tsx` | Router + provider nesting (QueryClient→Theme→Tooltip→Chat→LocalModel→ResearchProject→Zotero); single root `ErrorBoundary`; lazy pages |
| `src/context/ChatContext.tsx` (1114 lines) | Sole chat state machine + provider dispatch + streaming + tiling + persistence |
| `src/lib/openrouter.ts` (429 lines) | Cloud SSE engine, model catalog client, message payload mapping |
| `src/lib/aiStream.ts` (262 lines) | `streamChatForConfig` dispatcher + Anthropic + Gemini clients |
| `src/types/chat.ts` | All chat domain types (`Chat`, `Message`, `ApiKeyConfig`, 7-value `AiProvider`) |
| `electron/main.mjs` (478 lines) | Window creation, `app://` protocol, GPU flags, crash recovery, IPC registration, quit cleanup |
| `electron/preload.cjs` | The only renderer↔main bridge (5 surfaces) |
| `electron/researchDb.mjs` (801 lines) | SQLite schema v1–v6 + all project persistence primitives |
| `electron/researchProjectService.mjs` (377 lines) | ~40 `research:*` IPC handlers incl. `compileProjectLatex` (spawnSync pdflatex) |
| `electron/localGgufService.mjs` | GGUF registry, HF download w/ resume, llama-server lifecycle |
| `electron/*SecretStore.mjs`, `secretVault.mjs` | safeStorage-backed secrets (HF token, provider/Brave keys, Zotero key) |
| `server/research-proxy.mjs` | Unaauthenticated POST-only research aggregator (Wikipedia/S2/arXiv/Jina/Brave) |
| `Dockerfile`, `docker-compose.yml`, `docker/nginx-docker.conf` | Two-stage image; single service :8080; SPA nginx + `/api/research` proxy |
| `.github/workflows/ci.yml`, `release.yml` | Lint+test+build+e2e gate; tag→3-OS installer publish |

---

## 5. Technology Stack

Verified from `package.json`, Docker/CI config, and imports. Versions are exact `^` ranges as pinned.

| Layer | Technology | Version | Where Used | Purpose | Evidence |
|---|---|---|---|---|---|
| Desktop shell | Electron | ^41.2.1 (dev) | `electron/` | Native app container | `package.json:144`, `electron/main.mjs` |
| Packaging | electron-builder | ^26.8.1 | release | AppImage/deb/dmg/NSIS | `package.json:145`, `build` block :158-257 |
| Auto-update | electron-updater | ^6.8.3 | main process | GitHub-release updates | `package.json:99`, `electron/updater.mjs` |
| UI framework | React + React DOM | ^18.3.1 | `src/` | All UI | `package.json:113-115` |
| Routing | react-router-dom | ^6.26.2 | `src/App.tsx` | 10 routes | `package.json:119`, `App.tsx:6,72-113` |
| Build | Vite | ^5.4.1 | root | Bundler/dev server | `package.json:155`, `vite.config.ts` |
| Language | TypeScript | ^5.5.3 | `src/` (+`.mjs` in main) | Type safety (renderer) | `package.json:154` |
| CSS | Tailwind CSS | ^3.4.11 | `src/`, `tailwind.config.ts` | Styling | `package.json:153` |
| UI primitives | Radix UI (~25 pkgs) + shadcn/ui wrappers + cmdk + vaul + embla | various 1.x/2.x/8.x/0.9.x | `src/components/ui/` | Dialogs, menus, drawers, command palette | `package.json:59-85`, `src/components/ui/` (60 files) |
| Server state | TanStack Query | ^5.56.2 | hooks, `App.tsx` | Model catalog caching | `package.json:87` |
| Cloud LLM | raw `fetch` SSE (no vendor SDK except Google) | — | `src/lib/openrouter.ts`, `aiStream.ts` | OpenRouter/OpenAI/Ollama/Anthropic streaming | `openrouter.ts:336-429`, `aiStream.ts:41-135` |
| Google LLM | `@google/generative-ai` | ^0.24.1 | `aiStream.ts:138-223` | Gemini `sendMessageStream` | `package.json:56` |
| Local SLM | `@huggingface/transformers` + `@xenova/transformers` + `onnxruntime-*` | ^4.0.1 / ^2.17.2 | `src/lib/gemmaWebGpu/`, embeddings | WebGPU/WASM inference + MiniLM embeddings | `package.json:58,92`, `vite.config.ts:137` chunk |
| Local LLM server | llama-server (llama.cpp `b9222`) | manifest `scripts/llama-release.json` | main process spawn | Native GGUF inference | `localGgufService.mjs:255`, `resources/llama/` |
| WASM LaTeX | `texlyre-busytex` | ^0.1.4-alpha | `src/lib/latexWasmCompile.ts` | In-browser pdflatex | `package.json:125`, `public/core/` |
| PDF | `pdfjs-dist` | ^4.10.38 | `src/lib/pdf*.ts` | Render + text extraction | `package.json:112` |
| Math | `katex` / `mathjs` | ^0.16.45 / ^13.2.0 | rendering, `[[calc:]]` | Math display + inline calc | `package.json:107,110` |
| Citations | `citation-js` (+bibtex/+csl plugins) | ^0.7.22 | `src/lib/research/cslEngine.ts` | CSL bibliography formatting | `package.json:93`, `vite.config.ts:103-111` aliases |
| Editor | `@uiw/react-codemirror`, `@codemirror/*` | ^4.25.10 / ^6.x | `src/components/notebook/` | LaTeX/BibTeX editing | `package.json:54,90` |
| Charts | `recharts` | ^2.12.7 | chart fences, benchmark | Data visualization | `package.json:120` |
| Markdown | `react-markdown`, `remark-gfm` | ^10.1.0 / ^4.0.1 | `AssistantContent.tsx` | Message rendering | `package.json:117,121` |
| DB | **Node built-in `node:sqlite` (`DatabaseSync`)** — no better-sqlite3, no ORM | Node 22 runtime | `electron/researchDb.mjs:8` | Projects/embeddings/jobs store | `researchDb.mjs:8,41-43` |
| Browser stores | localStorage, IndexedDB | Web APIs | contexts, `compileArtifactIdb.ts` | Chats, projects, compile cache | `projectStore.ts:26-28`, `storageMigrate.ts` |
| API framework | **None** — raw `node:http` | — | `server/*.mjs` | 2 micro-servers | `research-proxy.mjs:232`, `latex-compile.mjs` |
| Queues/jobs | **Custom only** (`researchJobQueue.mjs` + `worker_threads` + Web Worker) | — | research indexing | Background embed/rechunk | `researchJobQueue.mjs`, `src/workers/` |
| Redis/Postgres/Mongo/ORM | **NOT IMPLEMENTED** | — | — | — | Zero-result search §4 table below |
| Auth (OAuth lib) | `@react-oauth/google` ^0.12.1, `jwt-decode` ^4.0.0 | — | **Zero usage repo-wide** (dead deps) | — | Repo-wide grep: no files found |
| Telemetry | `@vercel/analytics` ^1.6.1 (opt-in, default off) | — | `PrivacyAnalytics.tsx` | Page views only | `privacyPreferences.ts:13-14,33,149-150` |
| OTel/Sentry/winston/pino | **NOT IMPLEMENTED** | — | — | — | Only hit: comment "Logs to console for Sentry/etc." (`ErrorBoundary.tsx:9`) |
| Testing | Vitest ^2.1.9, `node --test`, Playwright ^1.60.0 | — | 84 test files, 2 e2e specs | Unit/main-process/e2e | `package.json:29-31`, §23 |
| Lint | ESLint 9 + 2 custom Electron guards | — | CI | Security/pack-file gates | `package.json:14-19`, `scripts/check-*.mjs` |
| CI/CD | GitHub Actions | — | `.github/workflows/` | ci + 3-OS release | `ci.yml`, `release.yml` (7.8 KB) |
| Containers | Docker (`node:22-bookworm-slim` ×2 stages) + nginx | — | `Dockerfile`, `docker/` | Static + proxy deploy | `docker-compose.yml` (13 lines) |
| Python | **NOT PRESENT** | — | — | — | Glob `**/*.py`: no files found |
| OCR/DOCX/XLSX/PPTX | **NOT PRESENT** | — | — | — | Zero-result search (tesseract/docx/mammoth/xlsx/pptx) |

---

## 6. Electron Architecture

### 6.1 Process model (verified `electron/main.mjs`, 478 lines; `electron/preload.cjs`)

- **Main process** registers, in order: app menu, updater IPC, window IPC, HF secret, secret vault, GGUF, research project, Zotero secret, Zotero IPC (`main.mjs:439-447`); then the `app://` protocol (packaged only) and the single `BrowserWindow`.
- **Renderer** is the unmodified Vite bundle: dev loads `http://127.0.0.1:8080/projects` with retry (`waitForViteDevServer`, `loadDevUrlWithRetry`); packaged loads `app://openbentt/projects` (`main.mjs:399`) served from `dist/` with SPA fallback (`registerAppProtocolHandler`, `main.mjs:202-220`). Desktop home is `/projects`, not `/`.
- **Preload** exposes exactly **5** `contextBridge` surfaces (`openbenttDesktop`, `openbenttLocalGguf`, `openbenttSecrets`, `openbenttZotero`, `openbenttResearch`); the count is CI-enforced (`scripts/check-electron-security.mjs`).
- **Window hardening:** `contextIsolation: true, nodeIntegration: false, sandbox: true` (`main.mjs:336-338`). `webSecurity` is **not explicitly set** (Chromium default `true` applies — noted, not verified beyond absence). Single-instance lock (`main.mjs:48-52`).

### 6.2 IPC inventory (verified handler registrations)

`desktop:*` (window controls, whitelisted edit roles `undo/redo/cut/copy/paste/selectAll`, reload, devtools, quit, about, `openExternal` gated by `/^https?:\/\//i` — `desktopWindowIpc.mjs:85-89`); `localGguf:*` + `hfSecret:*` (registry, HF search/download with resume, `ensureServer`/`stopServer`, progress events); `secretVault:*` (allowlist `{provider_api_key, brave_search_api_key}`); `zotero:*` + `zoteroSecret:*` (detect, sync, BBT watch); `research:*` (~40 handlers: CRUD, PDFs ≤48 MB base64, assets, `compileProjectLatex`, embeddings, jobs, snapshots, history, chat logs, `exportFinetuneCorpus`). Validation layer `electron/ipcValidate.mjs`: ID regex `^[a-zA-Z0-9_-]{1,128}$`, 48 MB base64 cap, traversal-proof `resolveUnderDistRoot`, path allowlists, llama-binary allowlist.

### 6.3 Gaps vs. secure-practice checklist

| Practice | Status | Evidence |
|---|---|---|
| Context isolation / sandbox / no Node | IMPLEMENTED | `main.mjs:336-338` |
| Navigation / new-window lockdown | **MISSING** — no `setWindowOpenHandler`, no `will-navigate` handler | Zero-result grep in `electron/*.mjs` |
| Deep linking / custom protocol args | **NOT IMPLEMENTED** — no `setAsDefaultProtocolClient` | Zero-result grep; `app://` serves files only |
| Permission handlers | **MISSING** — no `setPermissionRequestHandler/CheckHandler`, no `webview` | Zero-result grep |
| webSecurity explicit | UNKNOWN (default applies; not set in code) | Absent from `main.mjs:330-340` |
| DevTools in production | Exposed via `desktop:toggleDevTools` IPC to renderer | `desktopWindowIpc.mjs:67-69` (LOW, desktop-normal) |
| Shell execution | `spawnSync(pdflatex)` fixed argv, no shell; `spawn(llama-server)` allowlisted path; `execFileSync(df/where/which)` | `researchProjectService.mjs:179-214`, `localGgufService.mjs:45-58,139-142,258` |
| Filesystem writes | Confined to `userData` subdirs (`research-projects/`, `gguf-models/`, `zotero/`, `.secrets/`, `research/compile-cache/`) | service modules + `THREAT_MODEL.md` |

**Architectural strengths:** untrusted-renderer model is explicit (`docs/THREAT_MODEL.md`); secrets never touch `localStorage` on desktop (`src/lib/privacy/desktopSecrets.ts`); all SQL parameterized (`db.prepare(… ? …)`, 55 matches in `researchDb.mjs`); traversal guards; single-instance lock; GPU-crash auto-relaunch guarded to fire once.
**Weaknesses:** no navigation/window-open policy; no permission policy; renderer-reachable DevTools toggle; no CSP (see §17).

---

## 7. Current UI/UX

Traced from `src/App.tsx` (routes), `src/layouts/AppLayout.tsx`, `src/components/Sidebar.tsx` (11 KB), and page/component implementations:

- **Startup:** web → marketing landing `/` (`HomeLandingPage.tsx`); desktop → `/projects` hub (`RootMarketingOrElectronRedirect`, `App.tsx:39-44`); `/download` redirects to `/projects` on desktop. Dev shows window immediately with load retry; packaged waits for `ready-to-show` with visibility watchdogs (`main.mjs:362-402`).
- **Navigation:** sidebar + top chrome (`AppChromeHeader.tsx`), native app menu (File: New Chat `CmdOrCtrl+N`→`/chat`, Projects `→/projects`, Notebook; View/Help) emitting `desktop:menuNavigate`.
- **Chat interface:** composer (`ChatInput.tsx`, 899 lines: attachments, snippets, shortcuts, context meter, quota meter) + thread (`ChatMessages.tsx`, 520 lines: streaming cursor, thinking indicator, comparison grid, metrics bars, search highlights) + thread bar (search/export) + per-message toolbar (copy/PDF).
- **Conversations:** multi-chat list, auto-titles (first user msg ≤50 chars), retry/edit/abort, markdown export, per-message PDF export.
- **Documents:** Notebook Studio file tree/tabs/outline, PDF viewer with zoom/search/annotations, LaTeX editor with error-line markers, compile→preview loop, template gallery (12 packs), projects hub grid.
- **Search UX:** in-thread search with `<mark>` highlights; PDF find panel; `cmdk` command palette (`ResearchCommandPalette.tsx`); citation/annotation retrieval panels. No verified global cross-project full-text search UI (UNKNOWN — see §31).
- **Settings:** 1139-line `SettingsPanel.tsx` — 7 providers, API keys (password inputs), comparison models, research depth/proxy/approved-domains, privacy toggles (analytics off default; local-only mode), local model profiles/paths/consent.
- **Model selection:** picker + `ModelSpecDialog` (pricing/context/modalities) + capability badges + availability states (ready/downloadable/missing/backend_unavailable/blocked_offline) + Ollama auto-probe.
- **Loading/empty states:** route suspense fallback, streaming indicators, download progress bars, project loading screen. Empty-state coverage was not exhaustively audited (UNKNOWN).
- **Keyboard:** Enter send / Shift+Enter newline / Escape stop (`ChatInput.tsx:294-304`); research shortcuts (`useResearchKeyboard.ts`).
- **Responsiveness/mobile:** `use-mobile.tsx` hook; `/chat` made installable on mobile (per git history `3174344`); desktop-first, not mobile-first.
- **Accessibility:** Radix primitives give baseline ARIA; no dedicated a11y audit found (PARTIAL/UNKNOWN).

---

## 8. Chat Architecture

Full trace verified: `ChatInput` → `ChatContext.sendMessage` (`ChatContext.tsx:963`) → validation/consent gates → PDF merge + `[[calc:]]` substitution → `buildPipelineExtras` (corpus RAG evidence via registered provider, optional web research via `gatherResearchContext`) → `buildSystemPrompts` → 3-way dispatch (`detectNotebookRoutedTask` → routed task; `local_gguf` → IPC→llama-server; `webgpu_gemma` → in-process Transformers.js; else `streamChatForConfig` cloud SSE) → RAF-batched deltas (192 chars/80 ms) → completion (metrics, title, quota snapshot, fire-and-forget chat-log persist) → UI.

- **Supported models/providers:** 7 `aiProvider` values (`types/chat.ts:112-119`): `openrouter`, `openai_direct`, `openai_compatible` (Ollama/LM Studio/vLLM via base URL), `anthropic`, `google`, `webgpu_gemma`, `local_gguf`. Catalog: live OpenRouter `/models` (public, keyless) → curated `:free` fallback (`openrouter.ts:140-163`); OpenAI/Gemini list endpoints; Ollama probe `127.0.0.1:11434`; GGUF registry; WebGPU capability probe. Config lives in `ApiKeyConfig` (`types/chat.ts:133-187`).
- **API abstraction:** PARTIAL gateway — `streamChatForConfig` (`aiStream.ts:225-262`) unifies 5 cloud transports behind `{ text, metrics, rateLimitHeaders }`; `modelRouting/` adds task-based local/cloud routing with typed errors. There is **no server-side gateway** (renderer calls vendors directly).
- **Streaming:** SSE line-buffered (`openrouter.ts:336-429`); Anthropic event deltas; Gemini SDK stream; local token streaming via `TextStreamer`/loopback SSE. TTFT on first delta; `usage` chunks captured.
- **Persistence:** `openbentt-chats`, `openbentt-current-chat-id`, `openbentt-api-config` (localStorage) + legacy `cogerphere-*` migration (`storageMigrate.ts`); desktop additionally persists turns to SQLite `chat_logs`.
- **Context/tokens:** workspace-assist + RAG (≤8000 chars) + research blocks as system prompts; local path trims to profile budgets (2500/6000/12000 chars); `ContextMeter` (~4 chars/token, 90% warn); thread virtualization >40 msgs.
- **System prompts:** `systemPrompts.ts` (chart hint, math/debug/red-team modes, research base, extended reasoning).
- **Tool/function calling: NOT IMPLEMENTED** — request body is exactly `{model, messages, temperature, stream, stream_options?}` (`openrouter.ts:310-330`); repo-wide grep for `tool_calls|function_call` in `src/`: zero files. `ToolsPopover.tsx` inserts composer templates, not model tools.
- **MCP: NOT IMPLEMENTED** — grep `[Mm][Cc][Pp]` in `src/` and `electron/`: zero files.
- **Retry/edit/cancel:** `regenerateLastResponse`, `beginEditUserMessage` (truncate + reload composer), per-request `AbortController`s + `stopStreaming`.
- **Verdict (proved): multi-model system with RAG augmentation. NOT an agent system** (no planning loop, no tools, no autonomous execution; `researchOrchestrator.ts` assembles prompts; `agentTrace` displays fetch traces).

---

## 9. Document Pipeline

Lifecycle traced end-to-end (steps that exist are cited; absent steps are stated):

`FILE → IMPORT → STORAGE → PARSING → TEXT EXTRACTION → CHUNKING → METADATA → EMBEDDING → INDEXING → RETRIEVAL → CONTEXT → LLM → RESPONSE`

| Step | Status | Evidence |
|---|---|---|
| Import | PARTIAL — PDF upload, image/audio/video attachments, `.tex/.bib/.sty`/asset project files | `ChatInput.tsx:418-450`, `NotebookFileTree.tsx`, `projectStore.ts:348` |
| Storage | IMPLEMENTED — localStorage (web) / SQLite + `userData` dirs (desktop) | §14 |
| Parsing/extraction | PARTIAL — **PDF only** via `pdfjs-dist` (`pdfText.ts`: 96k/64-page chat caps, 220k/100 notebook caps) | `src/lib/pdf*.ts` |
| DOCX/TXT/MD/CSV/XLSX/PPTX/OCR/scanned-docs | **NOT IMPLEMENTED** | Zero-result search: tesseract, `.docx`, mammoth, `.xlsx`, sheetjs, `.pptx` |
| Images/audio/video | Message parts only (image_url/input_audio/video first-frame ≤1024px), **not indexed** | `openrouter.ts:214-241`, `media.ts:21-77` |
| URLs/websites | PARTIAL — fetched via Jina/proxy into **prompt context only**, not into corpus index | `research-proxy.mjs:175-187`, `researchSources.ts` |
| Code/JSON/XML | As pasted text or project text files only (no dedicated parser) | No parser found |
| Chunking | IMPLEMENTED — 480 chars / 80 overlap; LaTeX stripped for drafts | `corpusChunksCore.mjs:5-37` |
| Metadata | IMPLEMENTED — title/authors/year/doi inference, page hints, review status | `ResearchPaper` type, `inferPdfMetadata` |
| Embedding/indexing/retrieval | IMPLEMENTED (narrow) | §10 |
| Processing location | **Local** (extract/chunk/embed/index) + **optional remote** (research fetch, cloud LLM) | code paths cited above |

---

## 10. RAG Architecture

**Verdict: YES — narrow, corpus-scoped RAG is implemented** (proven by traced path, not by package presence).

- **Embedding model:** `Xenova/all-MiniLM-L6-v2`, 384-dim, q8, mean pooling, L2-normalized (`src/lib/research/embedCore.mjs:5-7`); shared by renderer, Web Worker, and Electron worker threads.
- **Vector database: NONE** — Float32 BLOBs in SQLite `embeddings(chunk_id, project_id, dim, vector, updated_at)` (`researchVectorStore.mjs:6,20`); similarity computed client-side (`cosineNormalized`, `embedCore.mjs:38`). No ANN index.
- **Chunking:** 480 chars / 80 overlap; paper chunks `<paperId>-<i>` with `pageHint = floor(i/3)+1`; draft chunks `<projectId>:draft-<i>` (`corpusChunksCore.mjs`).
- **Metadata per hit:** chunkId, paperId, snippet, score, pageHint, method, lexical/semantic/fused scores, confidence, provenance (`SimilarityHit`, `researchProject.ts:89-103`).
- **Retrieval:** hybrid RRF (k=48), weights lexical .45 / semantic .55, `minFusedScore` .008, dedupe ≤24 (`retrievalV2.ts:6-12`); chat path uses `hybridRetrieveV2` limit 6 → `formatRetrievalForPrompt(hits, 8000)`; orchestrator path allows 24,000 chars (`researchOrchestrator.ts:104`).
- **Keyword search:** TF-IDF (`corpusIndex.ts`, `idf = log((N+1)/(n+1))+1`, draft excluded). **Semantic:** MiniLM cosine. **Reranking: NONE** (threshold-based confidence labels only: semantic ≥.55 high / ≥.42 medium; `hybridRetrieval.ts`). **Query rewriting: NONE. Filtering:** incremental fingerprints + stale pruning (`incrementalIndex.ts`), collection/tag filters in Zotero retrieval.
- **Traced path:** `ResearchProjectContext.tsx:143-195` registers `corpusRagProvider` (TF-IDF + `resolveLibraryEmbeddings` + hybrid retrieve + format) → `ChatContext.tsx:403-418` appends evidence to the workspace-assist block → `buildSystemPrompts` → model. Chat turns persist to `chat_logs` (`ChatContext.tsx:728-734`).
- **Citation/source attribution:** `researchSources` + `MessageReferences`; CSL formatting; Crossref/S2 metadata (`citationTools.ts`, `cslEngine.ts`, `crossrefClient.ts`).
- **Ceilings (structural):** `MAX_CHUNKS_INDEX = 120` per project and 500-paper cap (`projectLimits.ts:4-14`) bound recall; web drops embeddings on persist (recomputed).

---

## 11. Search Architecture

| Mechanism | Status | Evidence |
|---|---|---|
| In-conversation search + highlight | IMPLEMENTED (`<mark>`, code blocks skipped) | `ChatThreadBar.tsx:65-89`, `ChatMessages.tsx:26-34`, `highlightSearch.tsx:10-51` |
| PDF find | IMPLEMENTED | `PdfSearchPanel.tsx`, `searchPdfDocument` |
| Command palette | IMPLEMENTED (cmdk) | `ResearchCommandPalette.tsx` |
| Semantic / vector retrieval | IMPLEMENTED (corpus-scoped) | §10 |
| Keyword (TF-IDF) retrieval | IMPLEMENTED | `corpusIndex.ts` |
| Metadata filtering (collections/tags) | IMPLEMENTED | `zoteroRetrieval.ts:31-99` |
| Annotation search (TF-cosine, 20) | IMPLEMENTED | `annotationIndex.ts:37` |
| Filename / file-tree search | UNKNOWN — not verified | `NotebookFileTree.tsx` (29 KB, unread in audit) |
| Global cross-project full-text search | UNKNOWN — no verified UI path | see §31 |
| Web search | PARTIAL — Brave via optional proxy; results enter prompts, not an index | `research-proxy.mjs:116-135` |

Results reach the user as prompt grounding (visible via `researchSources`/agent-trace UI), panel lists (papers, annotations, citations), and in-document highlights.

---

## 12. AI/Model Layer

| Provider | Representative models | API | Streaming | Tool calling | Local/Remote | Config location |
|---|---|---|---|---|---|---|
| OpenRouter | 100s incl. `:free` tier (curated fallback list) | `openrouter.ai/api/v1/chat/completions` | SSE yes | No | Remote | `ApiKeyConfig` (`types/chat.ts`), Settings |
| OpenAI direct | `gpt-*`, `o*` (regex-filtered list) | `api.openai.com/v1/*` | SSE yes | No | Remote | same |
| OpenAI-compatible | Ollama/LM Studio/vLLM (probed) | configurable base + `/chat/completions` | SSE yes | No | Local or remote | `openAiCompatibleBaseUrl`, default `127.0.0.1:11434` |
| Anthropic | curated Claude ids | `api.anthropic.com/v1/messages` | SSE yes | No | Remote | same |
| Google | `models/*` w/ `generateContent` | SDK `sendMessageStream` | yes | No | Remote | same |
| On-device (Transformers.js) | `openbentt/local-qwen-0.5b` (Qwen2.5-0.5B-Instruct ONNX) | in-process | yes | No | Local | `gemmaWebGpu/models.ts:55-71` |
| Local GGUF | user registry (`openbentt/gguf:<uuid>`) | loopback OpenAI-compat via llama-server | SSE yes | No | Local | registry.json + Settings path |
| Hugging Face | model search/download (GGUF + weights) | `huggingface.co/api/*` | n/a | n/a | Remote fetch → local use | `localGgufService.mjs:298-360`, `hfDatasets.ts` |

Model abstraction: **PARTIAL** — `streamChatForConfig` + `modelManager` (availability/catalog) + `modelRouting` (task routing) form a client-side dispatch layer; no server-side gateway, no unified credentials broker, no tool/function schema anywhere (proven §8).

---

## 13. Local-First Architecture

**LOCAL DATA FLOW** (no network required): user keystrokes → React state → `localStorage` (`openbentt-chats`, projects, prefs) → on-device inference (WebGPU/WASM Qwen or `ensureServer`→`127.0.0.1` llama-server) → local SQLite (`research.db`) → local MiniLM embeddings (worker threads/Web Worker) → local TF-IDF+cosine retrieval → BusyTeX WASM or local `pdflatex` compile. Secrets live in OS keychain (`safeStorage`) or `userData/.secrets/*.blob` (0o600; plaintext `.secret` fallback only if encryption unavailable). Offline gating via `offline/mode.ts` + `connectivity.ts`; `comparisonEnabled` forced off for local providers.

**REMOTE DATA FLOW** (user-initiated only): BYOK HTTPS from renderer to OpenRouter/OpenAI/Anthropic/Google/custom base; HF Hub for GGUF/weight downloads (resumable, optional Bearer); research fetch (Wikipedia/S2/arXiv/Jina/Brave, direct or via self-hosted proxy); GitHub (release assets for `/download`, update manifests); Vercel Analytics **only if opted in** (default off). No account system, no sync server, no cloud persistence of chats/documents/embeddings.

** rests local:** documents, embeddings, models, conversations, metadata, database, secrets — all YES on both builds (web uses browser stores instead of SQLite). **Network required for:** cloud inference, research fetch, HF downloads, update checks, first-visit full model catalog (degrades to curated list offline).

---

## 14. Data Storage

| Mechanism | What is stored | Schema/keys | Encryption | Backup | Migration |
|---|---|---|---|---|---|
| localStorage (web + desktop prefs) | chats, current id, api-config (secrets stripped on desktop), projects index, project JSON (embeddings stripped), checkpoints, snippets, consent/cache flags, privacy prefs | `openbentt-*` keys (`storageMigrate.ts:6-28`, `projectStore.ts:26-28`) | None (browser) | None | `copyIfMissing` legacy `cogerphere-*` migration (`main.tsx:12`) |
| IndexedDB | compiled PDF artifacts keyed by bundle hash | `openbentt-compile-cache` / `artifacts` / keyPath `hash` | None | None | hash-keyed, self-invalidating |
| SQLite `research.db` (desktop, `node:sqlite`, WAL + FK) | projects, drafts, bibliography, papers, chunks, embeddings (Float32 BLOBs), draft_history, snapshots, `research_jobs`, `project_files`, `chat_logs`, `chat_links` (unused), app_state; schema v6 | `researchDb.mjs:92-275` | **NONE at rest** (finding §17) | `.bak` every 10 saves / 5 s debounce; auto-restore on open failure | version loop + legacy `project.json` import (`migrateLegacyProjects`) |
| Filesystem `userData/` | paper PDFs, project assets/exports, GGUF registry+files, zotero cache, compile-cache PDFs, `.secrets/` | per-service dirs | safeStorage for secrets only; data plaintext | `.bak` for DB only | registry `version:1` check |
| safeStorage vault | provider/Brave/Zotero/HF secrets | `.blob` (+`.secret` fallback, 0o600) | OS keychain | None | legacy plaintext→vault move |
| Redis / Postgres / object storage / vector DB | **NOT IMPLEMENTED** | — | — | — | — |

---

## 15. Authentication

**NOT IMPLEMENTED.** There are no local users, accounts, sessions, OAuth flows, passwords-as-credentials, roles, or token services anywhere in the codebase:

- Password-type inputs exist only for third-party keys: provider API key (`SetupPage.tsx:235`, `SettingsPanel.tsx:551,628,959`) and Zotero key (`ZoteroConnectionPanel.tsx:165`).
- `@react-oauth/google` (^0.12.1) and `jwt-decode` (^4.0.0) are declared in `package.json` but have **zero usages repository-wide** (verified search) — dead dependencies, not features.
- `README.md:3` states the model explicitly: "API keys stay in localStorage on your device—there is no Openbentt account system."
- Single-user assumption permeates storage (one `openbentt-api-config`, one active project id, no identity column in any SQLite table).

---

## 16. Authorization

**NOT IMPLEMENTED.** No permissions, roles, workspace isolation, tenant isolation, document ACLs, agent/tool permission scopes, or approval gates exist. Consequences for the enterprise target: every future multi-user, connector, or agent capability must introduce a permission model from scratch; the current `chat_links` table (defined `researchDb.mjs:188`, **unreferenced anywhere else** — verified single-match search) is dead schema, not a permission hook. The only extant allowlists are technical, not authorization: secret-vault key allowlist, edit-role allowlist, llama-binary allowlist, research deep-fetch domain allowlist.

---

## 17. Security Audit

Scope: defensive, static, no exploitation. Renderer treated as untrusted per `docs/THREAT_MODEL.md`.

### CRITICAL
- **None verified.** No remotely-exploitable RCE, auth bypass (no auth exists), or unauthenticated data-exfiltration path was found in audit scope.

### HIGH
1. **No Content-Security-Policy anywhere** — absent from `index.html`, Electron (no session CSP), and nginx (deliberately omitted for WASM/dynamic imports, `docker/nginx-docker.conf:9-11`). This compounds every injection-adjacent risk and is self-assessed as High in `docs/PRODUCT_DOC.md`.
2. **Provider API keys in plaintext `localStorage` on the web build** (`openbentt-api-config`; `desktopSecrets.ts:31-39` strips only on desktop). Any successful XSS would exfiltrate keys. Mitigations present: React escaping, no `dangerouslySetInnerHTML` observed in chat rendering path, prompt-injection boundaries (§17-MEDIUM-4); missing mitigation: CSP (above).
3. **Unsigned macOS/Windows installers** (`release.yml` sets `CSC_IDENTITY_AUTO_DISCOVERY: false`; `RELEASING.md` notes signing as future work) — SmartScreen/Gatekeeper friction and reduced tamper-evidence for desktop users (update channel itself is HTTPS GitHub, which bounds this to MEDIUM-HIGH; kept at HIGH for enterprise distribution risk).

### MEDIUM
1. **Desktop data at rest is unencrypted** — `research.db`, paper PDFs, GGUF files, assets, compile cache are plaintext under `userData/`; only secrets use `safeStorage`. Device-access threat.
2. **Research proxy is unauthenticated, un-rate-limited, CORS `*`** (`research-proxy.mjs:232-247`) — anyone reaching it can spend the operator's Brave quota; Docker binds it to `127.0.0.1:8787` behind nginx (mitigating), standalone deployments must protect it themselves.
3. **Proxy has no request-body cap** (`for await (const ch of req) raw += ch`, `:249`) — unbounded memory buffering; nginx `client_max_body_size 4m` covers Docker only.
4. **Brave key is client-visible when no proxy is configured** (key sent from browser); server-side key only inside the proxy.
5. **No window-open/navigation policy** (§6.3) — markdown links render via custom anchors (`AssistantContent.tsx:25-35`) with no `setWindowOpenHandler` to force external handling.
6. **safeStorage fallback writes plaintext `.secret` (0o600) with only a console warning** when OS encryption is unavailable (`hfSecretStore.mjs:55`, `secretVault.mjs:67`).

### LOW
1. Renderer-reachable `desktop:toggleDevTools` (`desktopWindowIpc.mjs:67-69`).
2. Single root `ErrorBoundary` (`App.tsx:63`); no per-route/per-panel boundaries (verified: only definition + one usage).
3. arXiv fetched over plain HTTP (`research-proxy.mjs:81`) — metadata only.
4. Dead `chat_links` table ships in schema v6 (attack-surface-neutral, hygiene).

### INFORMATIONAL
- All SQL parameterized; traversal/path/binary allowlists; `shell.openExternal` regex-gated; single-instance lock; GPU relaunch once-guarded; `spawnSync` fixed-argv (no shell); user URLs fetched via Jina (server never fetches user URLs directly) with HTTPS-only + domain-allowlist gating — SSRF posture is better than typical.
- Prompt-injection hygiene is real: `[UNTRUSTED_DOCUMENT_START/END]` boundaries (`security/documentPromptGuard.ts:56`), pattern warnings (`:35`), contamination detectors (`contentIntegrity.ts:8`), display guards (`displayPaperLabel.ts`).
- Security is CI-gated (`lint:electron-security`, `lint:electron-pack`) with documented threat model and security docs.

---

## 18. Agent Capabilities

| Capability | Status | Evidence |
|---|---|---|
| Agents (autonomous loop) | NOT IMPLEMENTED | No planning/act/observe loop; `researchOrchestrator.ts` assembles prompts; `agentTrace` = fetch-trace display (`types/chat.ts:50-53`) |
| Tools / function calling | NOT IMPLEMENTED | §8 (no `tools` in any request body; `ToolsPopover` = composer templates) |
| MCP | NOT IMPLEMENTED | §19 |
| Workflows (general) | NOT IMPLEMENTED | Job queue is indexing-only (§21) |
| Task planning | NOT IMPLEMENTED | `modelRouting/tasks.ts` = model selection, not task planning |
| Memory | PARTIAL | `researchMemory.ts` (entities/edges/events v1), project `knowledge`, desktop `chat_logs`; no cross-project LTM |
| Browser automation | NOT IMPLEMENTED | No CDP/puppeteer/playwright-runtime deps |
| Code execution | PARTIAL | Trusted-binary exec only (pdflatex, llama-server); in-app statement: "code execution would need additional server sandboxes — not bundled" (`CapabilitiesSheet.tsx:75`) |
| Sandbox | NOT IMPLEMENTED (app-level) | Only Chromium sandbox; no sandbox for generated actions |
| Scheduled jobs | NOT IMPLEMENTED | No scheduler found |
| Background workers | PARTIAL | `worker_threads` chunk/embed workers + Web Worker embeddings; per-project serialized queues, retry ×3, cancel, resume |

---

## 19. MCP Audit

**MCP client: NOT IMPLEMENTED. MCP server: NOT IMPLEMENTED. MCP tools/resources/prompts: NOT IMPLEMENTED. External or internal MCP integration: NOT IMPLEMENTED.** Verified by zero-result content searches for `[Mm][Cc][Pp]` across `src/`, `electron/`, `server/`, and `api/` (code files), plus absence of any MCP SDK in `package.json`. The only near-miss is a code comment noting a prompt format is "(without tools)" (`gemmaPrompt.ts:3`).

---

## 20. Integrations

| Integration | Status | Evidence |
|---|---|---|
| Gmail / Drive / Calendar / Slack / Notion / M365 / OneDrive / SharePoint / Dropbox / Linear / Jira / Discord / Telegram / GitLab / webhooks | NOT IMPLEMENTED (all) | No SDKs, no OAuth, no handlers found |
| GitHub | PARTIAL (read-only release channel) | Release-asset fetch for `/download` (`fetchLatestReleaseAssets.ts`, `releaseDownloads.ts`, `VITE_GITHUB_REPO`), updater feed; no repo/PR/issues integration |
| Zotero | IMPLEMENTED | Web API v3 sync + BBT file watch + retrieval (`electron/zoteroService.mjs`, `src/lib/zotero/`) |
| Hugging Face | PARTIAL | Model search + GGUF download + weight fetching; `hfDatasets.ts` present |
| OpenRouter / OpenAI / Anthropic / Google / Ollama | IMPLEMENTED (chat + models) | §8, §12 |
| Brave Search | PARTIAL | Client key or server proxy; no independent client SDK |
| Jina Reader / Wikipedia / Semantic Scholar / arXiv / Crossref | PARTIAL (read-only fetch) | `research-proxy.mjs:28-135`, `crossrefClient.ts` |
| Vercel Analytics | PARTIAL (opt-in) | §5 |
| Google sign-in (dead dep) | NOT IMPLEMENTED | §15 |
| REST impurity | n/a — no app server exposes REST | Only `POST /research`, `POST /compile` helper endpoints |

---

## 21. Workflow/Automation

- **Exists (narrow):** persistent background job system for research indexing — `researchJobQueue.mjs` (per-project queues, serialized drain, dedup, `AbortController` cancel, `research_jobs` persistence, resume-on-restart, 3 attempts), executed in `worker_threads` (`chunkWorker.mjs`, `embedWorker.mjs`) on desktop and a Web Worker on web; plus event-driven triggers (IPC events, `fs.watch` BBT debounce 400 ms, menu navigation, `before-quit` snapshots).
- **NOT IMPLEMENTED:** general workflows, event triggers/schedules beyond the above, event bus, webhooks, task execution engine. **No Inngest / Temporal / BullMQ / Redis queues / AMQP / Kafka** — verified zero-result search across code + config (`package.json` confirms no such dependency).

---

## 22. Observability

- **Logging:** `console.*` only — 52 call sites total (22 error, 17 warn, 8 log, 5 info) across `src/ + electron/ + server/ + api/`; unstructured, no levels policy, no log sink, no rotation. Secret redaction helper exists (`redactForLogs.ts`) but is narrowly scoped.
- **Error tracking / metrics / tracing / OpenTelemetry:** NOT IMPLEMENTED (§5).
- **Audit logs:** NOT IMPLEMENTED as an admin capability. Closest product data: per-project desktop `chat_logs` (thread, role, content, model, timestamp) and research `agentTrace` displays — insufficient to answer "who did what, when, with which tool and data" (no identities, no tool executions, no admin view).
- **AI request logs:** PARTIAL (desktop chat_logs only; web has none beyond localStorage thread content).

---

## 23. Testing

| Type | Status | Evidence |
|---|---|---|
| Unit tests | IMPLEMENTED — 84 `*.test.*` files (Vitest, node env, 30 s timeout) | `git ls-files \| grep -c '\.test\.'` = 84; `vite.config.ts:151-161` |
| Integration tests | PARTIAL — project store, retrieval, Zotero mapper, template packs (`verify-template-packs.mjs`, optional `VERIFY_TEX=1`) | `projectStore.integration.test.ts`, `scripts/` |
| Electron main-process tests | IMPLEMENTED — `node --test` over DB/vector/queue/workers/compile-artifacts/GPU/binary | `package.json:29` lists 9 test files |
| E2E | PARTIAL — Playwright Chromium, 2 specs (workspace gating/branding; template catalog ≥100 + pack integrity) | `e2e/*.spec.ts`, `playwright.config.ts` |
| API tests | MISSING (no app API exists) | n/a |
| RAG tests | PARTIAL — retrieval/synthesis/index unit tests; no live MiniLM build test (self-reported gap) | `retrievalV2.test.ts`, `semanticSearch.test.ts`, `TEST_COVERAGE.md:91-107` |
| AI evaluation | NOT IMPLEMENTED | No eval harness found |
| Security tests | PARTIAL — CI lint guards (bridge count, `nodeIntegration:false`, pack allowlist) | `scripts/check-electron-security.mjs`, `check-electron-pack-files.mjs` |
| Performance tests | PARTIAL — `perfStress.test.ts` + `test:stress` script | `package.json:30` |
| Coverage measurement | UNKNOWN — no coverage provider/thresholds found in config | `vite.config.ts` test block has no coverage section |
| CI execution | IMPLEMENTED — lint → unit+main tests → build → Chromium install → e2e | `ci.yml` |

---

## 24. Performance

Architectural observations only (no profiling performed — nothing was executed):

- **Startup:** `dist/` is 471 MB on local disk (includes BusyTeX WASM + transformer chunks); mitigated by Rollup `manualChunks` (transformers/busytex/pdfjs/katex/mathjs/markdown/ui-vendor) + `React.lazy` routes + dynamic imports for local-model code. First-load cost on slow networks is the obvious bottleneck (not measured).
- **Ingestion:** hard caps bound worst cases — 48 MB PDF upload, 4.5 MB localStorage project budget, 120 indexed chunks, 2 MB draft; oversize projects degrade rather than crash (pressure warnings at 80/100/400k).
- **Embeddings:** local MiniLM-q8; desktop parallelizes via worker threads with incremental upsert + resume; web recomputes (embeddings stripped on persist) — large web projects re-index per session.
- **Retrieval:** client-side cosine over ≤120 vectors — trivially fast; no ANN needed at this scale, but the 120-chunk ceiling with a 500-paper cap is a structural recall limit.
- **LLM latency:** streaming with RAF batching keeps UI at 60 fps; metrics (TTFT/total/tokens) are first-class. Comparison mode multiplies egress ×4 (expected, user-gated).
- **Memory/CPU/GPU:** explicit budgets (WebGPU buffer checks, deviceMemory×0.6, profile token caps, 8192 ONNX context cap); single global llama-server (one model at a time — a concurrency ceiling); `onnxruntime-node` asar-unpacked for native load.
- **Large collections/concurrency:** one embed job per project (serialized), per-project queues; no load shedding beyond caps; WAL SQLite handles concurrent reads.

---

## 25. Current Capability Matrix

Status values use verified evidence only. Quality = code/test/docs maturity observed. Production Risk = risk if relied upon in an enterprise rollout without changes.

| Capability | Status | Evidence | Quality | Production Risk |
|---|---|---|---|---|
| Desktop App | IMPLEMENTED | `electron/main.mjs`, installers in `release/` (AppImages/debs on disk) | High (hardened shell, updater, safe-mode) | Medium (unsigned macOS/Windows; no CSP) |
| Chat | IMPLEMENTED | `ChatContext.tsx` (1114 lines), 5 cloud transports | High | Medium (keys in localStorage on web) |
| Multi-model | IMPLEMENTED (2–4 tile compare) | `ChatContext.tsx:788-960` | High | Low (user-gated egress) |
| Document Import | PARTIAL (PDF/media/tex-project only) | `ChatInput.tsx:418-450` | Medium | Medium (format ceiling) |
| Document Parsing | PARTIAL (PDF text only) | `pdfText.ts` | Medium | Medium (no office/OCR) |
| RAG | PARTIAL (narrow corpus RAG, no vector DB) | §10 trace | Medium | Medium (120-chunk recall ceiling) |
| Search | PARTIAL (in-thread/PDF/palette/semantic; no verified global FTS) | §11 | Medium | Low-Medium |
| Local Models | IMPLEMENTED (WebGPU + GGUF) | `gemmaWebGpu/`, `localGgufService.mjs` | Medium-High | Low (one-model-at-a-time; binary bundling per OS) |
| Cloud Models | IMPLEMENTED | `openrouter.ts`, `aiStream.ts` | High | Medium (BYOK handling) |
| Agents | NOT IMPLEMENTED | §18 | — | Blocking for agent roadmap |
| MCP | NOT IMPLEMENTED | §19 | — | Blocking for MCP roadmap |
| Tools | NOT IMPLEMENTED | §8 | — | Blocking for tool roadmap |
| Workflows | NOT IMPLEMENTED (indexing queue only) | §21 | — | Blocking for automation roadmap |
| Gmail/Drive/Slack/GitHub/Notion | NOT IMPLEMENTED (GitHub PARTIAL, read-only) | §20 | — | Blocking for connectors roadmap |
| Authentication | NOT IMPLEMENTED | §15 | — | Blocking for multi-user |
| Authorization | NOT IMPLEMENTED | §16 | — | Blocking for enterprise boundaries |
| Encryption | PARTIAL (secrets only; data at rest plaintext) | §14, §17 | Medium | Medium (device-access) |
| Audit Logs | NOT IMPLEMENTED (product chat_logs only) | §22 | — | Blocking for compliance |
| Testing | PARTIAL-STRONG (84 files, 3 layers; gaps self-reported) | §23 | Medium-High | Low-Medium (no coverage gate, no packaged-app e2e) |
| Observability | MISSING (console-only) | §22 (52 sites) | Low | Medium (no admin visibility) |

---

## 26. Architecture Gap Analysis

Target areas from the transformation brief. Each lists current state, reusable existing code, and risks. **No implementation is proposed** (per Phase 0 rules).

1. **Data ingestion** — Current: PDF/media upload + tex project files + URL-to-context (not indexed). Reusable: `pdfText.ts` caps/layout, `media.ts`, `projectStore.addPaperToProject`, asset pipeline. Risks: no office/OCR parsers; no connector framework; ingestion is synchronous-ish (queue exists only for indexing).
2. **Document intelligence** — Current: extraction + metadata inference + annotations + review notes. Reusable: `pdfText`, `pdfAnnotations`, `displayPaperLabel`, `contentIntegrity`. Risks: layout fidelity limited (pdf.js text layer); no table/figure extraction beyond markers.
3. **Search** — Current: §11. Reusable: TF-IDF index, hybrid retrieval, palettes. Risks: no global FTS; no index service; client-side only.
4. **RAG** — Current: narrow corpus RAG (§10). Reusable: chunking, MiniLM pipeline, RRF fusion, checkpoint/resume, prompt assembly. Risks: no vector DB/ANN; 120-chunk ceiling; web recompute; no eval harness.
5. **Ontology** — Current: effectively missing (flat paper/chunk/doc model + venue/citation-style enums). Reusable: `researchMemory` entity/edge vocabulary (paper/author/term/section/citation/claim/feedback; cites/supports/contradicts…), citation graph nodes. Risks: memory is v1, project-scoped, unvalidated at scale.
6. **Knowledge graph/relationships** — Current: PARTIAL (citation graph sync + memory edges, display-only `CitationGraphPanel`). Reusable: `citationGraphSync.ts`, `citationGraph.ts`, memory edges. Risks: no graph store/query; no entity resolution.
7. **Model gateway** — Current: PARTIAL client-side dispatcher. Reusable: uniform `{text, metrics, rateLimitHeaders}` contract, router scoring, quota parsing. Risks: renderer-direct egress; no server proxy for keys/policy/logging; no tool schema.
8. **Agent runtime** — Current: missing. Reusable: abort/cancel plumbing, RAF streaming, job queue primitives, prompt assembly. Risks: greenfield; permission/sandbox model must be designed (see 12/13).
9. **Tool system** — Current: missing (composer templates only). Reusable: `ToolsPopover` UX pattern. Risks: needs schema, permissions, audit (see 15).
10. **MCP** — Current: missing entirely. Reusable: IPC bridge patterns for a future local MCP host. Risks: dependency + sandbox + permission design; upstream spec drift.
11. **Workflow automation** — Current: indexing queue only. Reusable: `researchJobQueue` (persist/resume/retry/cancel) as a proven pattern. Risks: not generalizable as-is (project-scoped, two job types); no scheduler/event bus.
12. **Secure sandbox** — Current: missing at app level (Chromium sandbox only). Reusable: `ipcValidate` allowlist style, `CapabilitiesSheet` scope statement. Risks: any code/tool execution needs a new isolation boundary.
13. **Connectors** — Current: Zotero (full), HF/GitHub/Brave/Jina (read/fetch partials). Reusable: Zotero sync + secret-store pattern as the connector template. Risks: no OAuth framework (dead `@react-oauth/google` dep signals an abandoned direction); per-connector credential UX must be built.
14. **Permissions** — Current: missing (§16). Reusable: technical allowlists as idioms. Risks: cross-cutting; must precede agents/connectors/multi-user.
15. **Auditability** — Current: missing as admin capability (`chat_logs` are product data). Reusable: `chat_logs` schema, job persistence. Risks: identity model required first.
16. **Observability** — Current: console-only (§22). Reusable: `redactForLogs` idiom. Risks: no pipeline; privacy-sensitive content needs dual-channel (ops vs content) design.
17. **Enterprise UI** — Current: single-user workspace UI, strong chat/notebook craft. Reusable: nearly all of `src/components`. Risks: admin surfaces (users, keys, audit, quotas) don't exist; ErrorBoundary coverage is root-only.
18. **Local-first operation** — Current: genuinely local-first (§13). Must-not-break: offline-capable paths, safeStorage, SQLite, WASM fallbacks. Risks: any server-ification must preserve offline Degradation (curated catalog, WASM compile, local inference).
19. **Optional cloud sync** — Current: missing (no sync protocol, no conflict model). Reusable: snapshot/history primitives, content hashing (`compileBundleHash`). Risks: E2EE vs recoverability tradeoff; schema versioning across devices.

---

## 27. Existing Functionality Inventory (preservation baseline)

Future phases MUST NOT regress these. Each entry: feature → implementation → persistence → tests.

| Feature | Implementation | Persistence | Tests |
|---|---|---|---|
| Cloud chat (5 transports) + streaming + metrics | `ChatContext`, `openrouter.ts`, `aiStream.ts` | `openbentt-chats`, `chat_logs` (desktop) | `openrouter.test.ts`, unit suite |
| 2–4 model tiled comparison | `ChatContext.tsx:788-960`, `ChatMessages.tsx:84-145` | in-message `comparisonResponses` | streaming/error tiles (unit) |
| Retry / edit / abort | `:386-392,462-547` | thread truncation | — (gap) |
| 7-provider config + custom model ids + reasoning pref | `types/chat.ts:133-187`, Settings/Setup | `openbentt-api-config` | `normalizeApiConfig` (unit, partial) |
| WebGPU/WASM local chat + auto-downgrade | `gemmaWebGpu/*` | cache/consent flags | `webGpuCaps.test.ts`, prompt/strip tests |
| GGUF local chat (download/resume/serve) | `localGguf/*` + `localGgufService.mjs` | `gguf-models/registry.json` | `guardrails/validate/ids` tests |
| Ollama-compatible endpoint support | `ollamaProbe.ts`, `resolveChatCompletionsUrl` | settings base URL | probe tests |
| Attachments (image/audio/video-frame/PDF text) | `ChatInput`, `media.ts`, `pdfText.ts` | in-message (data URLs/text) | `attachmentModelSupport.test.ts` |
| Charts from `openbentt-chart` fences (+legacy `cogerphere-chart`) | `chartSpec.ts`, `OpenbenttChartViews.tsx` | in-message text | `chartSpec.test.ts` |
| In-thread search + export .md / per-message PDF | `ChatThreadBar`, `chatExportMarkdown/Pdf.ts` | downloads | `chatExportMarkdown.test.ts` |
| Snippets, shortcuts, context + quota meters | `promptSnippets.ts`, sheets, meters | `openbentt-prompt-snippets-v1` | `composerPlaceholder.test.ts` |
| Research projects + papers + folders/files | `ResearchProjectContext`, `projectStore.ts` | localStorage / SQLite | `projectStore.integration.test.ts`, recovery tests |
| RAG evidence in chat + research fetch + sources UI | `corpusRagProvider`, `researchSources.ts`, `MessageReferences` | — (computed) | retrieval/synthesis tests |
| Zotero sync (Web API + BBT watch) + citation insert | `zoteroService.mjs`, `ZoteroContext`, panels | `zotero/*.json`, safeStorage key | `zotero*.test.ts`, mocks |
| CSL bibliographies + Crossref + citation graph | `cslEngine`, `crossrefClient`, `citationGraphSync` | bibliography text | `citationTools/bibtex` tests |
| Notebook LaTeX edit/compile/preview + autofix + error UI | `NotebookPdfWorkspace`, `latex*.ts` | project draft + artifact cache | `latex*.test.ts` (8+ files) |
| PDF view/annotate/search | `pdfViewer`, `pdfCanvasRender`, annotation libs | annotations in project | `pdfText/Annotations` tests |
| 12 template packs + gallery | `public/templates/`, `templateCatalog.ts` | static JSON | `verify-template-packs.mjs`, e2e |
| Benchmark + WebGPU diagnostics pages | `BenchmarkPage.tsx`, `WebGpuPage.tsx` | CSV download | — (gap) |
| Setup onboarding + marketing + download + share pages | `SetupPage`, `HomeLandingPage`, `DownloadPage`, `ShareViewPage`, `shareRun.ts` | URL-embedded share (lz-string) | `shareRun.test.ts`, e2e gating |
| Desktop shell: window/menu/updater/GPU-safe/quit-cleanup | `main.mjs`, `appMenu.mjs`, `updater.mjs`, `gpuSafeMode.mjs` | OS/userData | `gpuSafeMode.test.mjs`, `smokeTest.mjs` |
| Secrets vault (HF/provider/Brave/Zotero) | `*SecretStore.mjs`, `secretVault.mjs` | `.secrets/` 0o600 | — (self-reported gap) |
| Research jobs + snapshots + draft history + export (.zip) | job queue, `projectExport.ts` | SQLite + files | queue/service/worker tests |
| Privacy controls (local-only mode, analytics opt-in) | `privacyPreferences.ts`, Settings privacy | `openbentt-privacy-v1` | `privacyPreferences/mode` tests |

---

## 28. Technical Debt Inventory (no fixes applied)

1. **Dual lockfiles:** `package-lock.json` (632 KB, canonical — CI uses `npm ci`) **and** `bun.lockb` (198 KB). Manager ambiguity risks dependency drift.
2. **Dead dependencies:** `@react-oauth/google` (^0.12.1) and `jwt-decode` (^4.0.0) have zero repository-wide usages — likely an abandoned auth direction that confuses the audit surface.
3. **Near-duplicate logo components:** `src/components/ui/logo.tsx` vs `logo2.tsx` (both exactly 16,014 bytes, different hashes) — suspected duplication.
4. **Oversized modules** (measured `wc -l`): `NotebookPdfWorkspace.tsx` 1525, `ChatContext.tsx` 1114, `SettingsPanel.tsx` 1139, `ChatInput.tsx` 899, `ResearchProjectContext.tsx` 859, `researchDb.mjs` 801 — high change-coupling risk.
5. **Duplicated guardrails across the IPC boundary:** `src/lib/localGguf/guardrails.ts` mirrors `electron/ggufGuardrails.mjs` (drift risk; same pattern for `embedCore.mjs`/`corpusChunksCore.mjs`/`zoteroMapper.mjs` shared as `.mjs` under `src/`).
6. **Dead schema:** `chat_links` table (`researchDb.mjs:188`) with zero other references.
7. **Single root `ErrorBoundary`** (`App.tsx:63`) — a panel crash unmounts the whole app.
8. **Legacy compat surface (intentional but permanent):** `cogerphere-*` keys/fences migrated at boot (`storageMigrate.ts`, `chartSpec.ts`) — must be preserved, cannot be "cleaned".
9. **Generated PDFs tracked in git:** `docs/PRODUCT_DOC.pdf` (499 KB), `docs/desktop-system-design.pdf` (79 KB) — binary churn in history.
10. **No coverage gate; console-only logging; `vercel` CLI shipped in runtime `dependencies`** (`package.json:128`) — packaging/hygiene nits.
11. **Proxy hardening debt:** unauthenticated + uncapped-body + CORS-`*` research proxy; HTTPS left to the deployer (server itself warns at startup).

---

## 29. Production Readiness by Area

No overall numerical score (per instructions). Classifications: READY / NEEDS HARDENING / PARTIAL / MISSING / UNKNOWN.

| Area | Classification | Rationale (evidence) |
|---|---|---|
| Desktop | NEEDS HARDENING | Strong shell + updater + safe-mode; unsigned installers, no CSP, no nav policy |
| Frontend | NEEDS HARDENING | Mature SPA; root-only error boundary; no CSP; a11y unaudited |
| Backend | PARTIAL | No app backend by design; two helper servers lack auth/rate-limit/body caps |
| AI | NEEDS HARDENING | Robust chat + local runtimes; no gateway policy/logging; keys in localStorage (web) |
| Documents | PARTIAL | PDF pipeline solid; office/OCR formats missing |
| RAG | PARTIAL | Working narrow RAG; no vector DB/ANN/eval; recall ceilings |
| Storage | NEEDS HARDENING | SQLite+backup+migrations solid; **no at-rest encryption** for data |
| Security | NEEDS HARDENING | Good shell hygiene + threat model; CSP/auth/permission gaps (§17) |
| Integrations | PARTIAL | Zotero full; rest read-only partials or missing |
| Agents | MISSING | §18 |
| Workflows | MISSING (indexing queue excepted) | §21 |
| Testing | PARTIAL | 84 files, 3 layers, CI-gated; self-reported gaps; no coverage gate |
| Observability | MISSING | Console-only; no audit trail |
| Deployment | NEEDS HARDENING | CI/release/Docker all functional; unsigned artifacts; proxy/CSP caveats |

---

## 30. Critical Findings

### What Openbentt already does well (evidenced)
- **Local-first is real, not marketing:** offline inference (two runtimes), local stores (SQLite/localStorage/IndexedDB), safeStorage secrets, WASM fallbacks, offline mode gating, curated offline catalog.
- **Chat engineering is unusually complete:** uniform streaming contract across 7 providers + 2 local runtimes, tiling, metrics, retry/edit/abort, RAG + research augmentation, quota metering.
- **Electron security baseline is above average:** isolation/sandbox/no-Node, 5-bridge allowlist with CI enforcement, parameterized SQL, traversal guards, secret vault, documented threat model.
- **Research depth:** working RAG, resumable job queue, Zotero sync, CSL citations, LaTeX compile matrix (WASM/local/remote) with caching and autofix, 12 template packs.
- **Release engineering:** version-lock assertion, 3-OS matrix, update manifests, staged checklists, 84 test files with honest coverage docs.

### What is incomplete (evidenced)
- Document formats stop at PDF/media/text; no office formats, no OCR, URL content never indexed.
- RAG is capped (120 chunks vs 500 papers), webless on persist, unevaluated, ANN-less.
- Proxy/servers are prototype-grade (no auth/limits), observability is console-only, packaged-app e2e and coverage gates absent.

### What is fragile (evidenced)
- 4 modules >850 lines owning core flows; single root error boundary; duplicated guardrail logic across IPC; dual lockfiles; dead deps suggesting drift.
- Desktop data longevity rests on one SQLite file + `.bak` (restore can still throw on severe WAL corruption — self-reported).

### What is missing (evidenced)
- Agents, tools/function calling, MCP, authn/authz, connectors (beyond Zotero/reads), workflows/schedules, vector DB, audit logs, structured observability, CSP, signed installers, at-rest data encryption.

### What must NOT be replaced (without compelling reason)
- The uniform `{text, metrics, rateLimitHeaders}` streaming contract; the 5-surface preload boundary; safeStorage secret handling; SQLite project schema + migration chain; the RAG chunking/embedding constants (change invalidates stored embeddings); template catalog format; `cogerphere-*` backward-compat shims; offline-first degradation paths.

---

## 31. Unknowns

Items that could not be verified by read-only audit and require follow-up:

1. Exact statement coverage % (no coverage instrumentation found; not executed).
2. Real-world performance (startup, large-project indexing, GPU/CPU behavior) — no profiling performed.
3. Whether a global cross-project full-text search UI exists (`NotebookFileTree`/hub search behavior unread).
4. Empty-state and accessibility conformance depth (not exhaustively traced).
5. Live behavior of MiniLM download, Zotero Web API sync, safeStorage round-trip, and `.bak` restore under real corruption (self-reported gaps; tests use mocks/fixtures).
6. Vulnerability status of pinned dependencies (no `npm audit`/CVE review performed in Phase 0).
7. Contents/behavior of `release/linux-unpacked/` and `builder-debug.yml` (local build residue, untracked).
8. Whether `ANTHROPIC_DEFAULT_MODELS` fallback path is reachable in current UI flows (read but not traced end-to-end).
9. Exact Chromium version inside Electron 41 (not resolved; only major pinned).
10. Production traffic/error history (no telemetry exists to consult).

---

## 32. Phase 0 Conclusion

Openbentt is a **coherent, genuinely local-first, single-user AI workspace** with a hardened Electron shell, a complete BYOK multi-model chat system, two working local inference runtimes, and a narrow but real RAG-backed research studio. The codebase is large (55.5k LOC tracked source, 597 files), tested across three layers (84 test files), and ships through automated CI and 3-OS releases.

The gap to the enterprise intelligence target is structural, not cosmetic: **agents, tools, MCP, authentication, authorization, connectors, workflows, vector search at scale, auditability, and observability are absent and must be designed, not uncovered**. The strongest foundations to build on are the streaming contract, the preload/IPC boundary, the job-queue pattern, the RAG pipeline constants, the Zotero connector template, and the offline-first degradation paths — all inventoried in §27 as must-preserve.

No code, configuration, dependency, schema, or document (other than this report) was modified. Verification follows in the response. **Phase 0 ends here; no roadmap, no Phase 1 instructions, no implementation decisions are included by design.** Awaiting further instruction.
