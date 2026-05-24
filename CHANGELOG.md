# Changelog

All notable changes to this project are documented in this file.

## [2.2.0] — 2026-05-24

### Added

- **Persistent Knowledge Context:** Every project now has a "Knowledge" panel in the Notebook Studio. Write insights, hypotheses, and findings — they are automatically injected into every AI chat for that project, giving the model full continuity across sessions. Includes an "AI update" button that synthesizes your papers and draft into a fresh context block.
- **Auto-RAG on every message:** When PDFs are loaded in a project, each chat message automatically triggers hybrid semantic + keyword retrieval over the full paper library. The top-6 most relevant passages are silently appended to the model context — no buttons, no configuration.
- **Chat transcript persistence:** Every conversation in a project is now saved to the project SQLite database (`chat_logs` table), so nothing is ever lost. The Projects Hub now shows a linked chat count on each project card.
- **SQLite schema v6:** Added `knowledge` column to `projects` table and a new `chat_logs` table with full indexes. Migration runs automatically on first launch, safe for existing data.
- **No-GPU smoke test:** `npm run electron:test:safe` builds the app and launches it with GPU disabled, verifying it stays alive for 12 seconds — catches GPU-related startup crashes before release.

### Changed

- **Tools panel UX (Notebook Studio):** The Tools tab in the left-rail explorer now shows labeled cards with descriptions for every research panel. Clicking a tool opens its content **inline inside the explorer panel** (back arrow to return to the list) — no more right-side Sheet drawer, no modal blocking the editor. Works like VS Code's extension panel system.
- **Tools dialog (Chat):** The "Tools" button in the chat composer now opens a centered dialog instead of a cramped right-side popover. Organized into AI Modes and Utilities sections with clear descriptions, active-state highlighting, and a copy button on calculator results.
- **Banner overflow fixed:** The OpenRouter API key banner on the Projects page no longer causes horizontal scroll at any screen width.
- **Version bump:** `2.1.0-beta.4` → `2.2.0`.

### Fixed

- `electron:dev` ERR_FAILED loading on devices without GPU — isolated dev profile, `--disable-http-cache`, `SingletonLock` cleanup, `127.0.0.1` instead of `localhost`.
- Electron exits immediately in `concurrently` — bypassed `requestSingleInstanceLock` in dev mode, fixed stdin close causing early exit.
- Window not appearing despite Electron running — explicit `win.show()` + `win.focus()` in dev mode.

## [2.0.6] — 2026-05-19

### Added

- **Bundled llama-server:** Download script (`npm run download:llama-server`), CI bundling per OS, `extraResources` in electron-builder.
- **Desktop auto-update:** `electron-updater`, Settings → General → check/download/install from GitHub Releases.
- **Single-instance desktop:** Second launch focuses existing window.
- **Download UX:** Bytes, transfer speed, and ETA for GGUF downloads; shared `ModelDownloadProgressBar`.
- **Desktop onboarding:** Setup path for Local GGUF → Labs; `canSendMessage` vs `canSendChat` for model selection.
- **Workspace nav:** LaTeX write, Benchmark, WebGPU lab in sidebar.
- **Tests:** `composerPlaceholder`, `releaseDownloads`, `downloadProgress`, `canSendMessage`, electron llama binary smoke; `npm test` runs unit + electron suites.
- **Docs:** [RELEASE_OVERVIEW.md](docs/RELEASE_OVERVIEW.md), [LOCAL_RELEASE_CHECKLIST.md](LOCAL_RELEASE_CHECKLIST.md).

### Changed

- **Local GGUF:** `canSendChat` allows entering app without a model; composer banner guides Labs/Settings.
- **Windows disk space:** Labs shows free space via PowerShell.
- **Release download URLs:** Version fallback aligned with package.json.
- **Loading states:** App bootstrap, route fallback, llama-server install checklist in Labs.

### Fixed

- Composer placeholders provider-aware (GGUF, WebGPU, local server).
- PRODUCTION_CHECKLIST / electron README drift (`/chat` start path, `preload.cjs`).

### Known at release

- macOS/Windows installers are **unsigned** (Gatekeeper / SmartScreen warnings).
- macOS **Intel** users may need PATH `llama-server` (CI ships arm64 binary).
- No Playwright E2E; use [LOCAL_RELEASE_CHECKLIST.md](LOCAL_RELEASE_CHECKLIST.md) before tagging.

---

## [2.0.7] - 2026-05-20

### Added

- **Marketing site:** Composed hero (live headline, full-bleed color blobs, app card), desktop-first landing and download CTAs, web workspace surface guards.
- **Brand:** Purple Openbentt logo/favicon, Plus Jakarta Sans typography, showcase SVG illustrations (Notebook, Model arena, Local GGUF).
- **Assets:** `public/marketing/openbentt-hero.png`, `openbentt-app-card.png`, marketing component library.

### Changed

- Landing page simplified (hero, three feature blocks, updates list, install CTA).
- Horizontal scroll fix on marketing pages; header and hero spacing polish.

---

## [2.0.8] — 2026-05-20

### Added

- **Desktop research persistence (SQLite v4):** Composite `corpus_chunks` keys, debounced draft save → background rechunk, SQLite-only project index on desktop.
- **Main-process embedding jobs:** Shared `embedCore.mjs`, incremental embed/prune, batched vector load (vectors stay in SQLite, not React state).
- **Research orchestrator:** Notebook writing/citation prompts use hybrid corpus retrieval + model routing hints.
- **Testing:** Electron IPC smoke, failure tests (corrupt DB, cancel embed/rechunk), `verify:release` gate; Playwright e2e in CI.
- **Production hardening:** `docs/THREAT_MODEL.md`, Electron security lint, debounced DB backups, Ctrl+S snapshot, Zotero apply-after-sync UX.
- **Release:** `latest*.yml` for auto-update; `npm run verify:release` / optional `verify:release:pack`.

### Changed

- Unified draft save indicator in workspace chrome; honest similarity/synthesis labels (lexical vs MiniLM).
- Staged research DB init (non-blocking app shell); web Zotero creds cleared on desktop connect.

### Fixed

- Embed worker illegal top-level return; DB auto-recovery on corrupt open; rechunk race when job pending.

---

## [2.0.13] — 2026-05-21

### Added

- **Linux GPU safe mode:** Auto software rendering when `/dev/dri` is missing or `OPENBENTT_DISABLE_GPU=1`, preventing blank windows on GPU-disabled systems.
- **Desktop onboarding:** Default provider is OpenRouter with the free Llama 3.3 70B model; setup pre-selects cloud; Projects hub prompts for API key.

### Changed

- Desktop app starts on `**/projects`** (not `/chat`).
- Setup lists OpenRouter first; local GGUF/WebGPU are advanced options.

### Fixed

- Blank Electron window on GNOME/Linux with disabled or broken GPU drivers.

---

## [2.0.12] — 2026-05-21

### Fixed

- **Desktop startup crash:** Packaged builds now include `src/lib/zotero/zoteroMapper.mjs` and other Electron main-process shared modules omitted from `app.asar`.
- **Research workers in production:** Bundle `corpusChunksCore` / `embedCore` plus `@xenova/transformers` runtime deps for packaged desktop.

---

## [2.0.11] — 2026-05-21

### Fixed

- **Windows release CI:** llama.cpp `b9222` Windows zip uses a flat layout (`llama-server.exe` at archive root). Download script updated; runtime DLLs are bundled beside the exe.

---

## [2.0.10] — 2026-05-21

### Added

- **Notebook Studio:** Projects hub, multi-file LaTeX editor (CodeMirror), PDF preview, compile pipeline (WASM + optional server), file tree CRUD, citation/bib tools, and floating chat dock.
- **Desktop chrome:** Compact 28px dark title bar with Openbentt logo, File/Edit/View/Help menus, and frameless Linux window controls.
- **Download page:** Live GitHub Release asset resolution for OS-specific installer links.
- **Global settings dock:** App-wide settings + pane layout controls (bottom-left / bottom-right).

### Changed

- Notebook compile errors surface as compact toasts with “Fix in chat” instead of blocking banners.
- Explorer flyout, editor tabs, and research workspace layout refactored for Notebook Studio.

### Fixed

- LaTeX compile stack overflow on large binary assets (chunked base64).
- Electron title bar matches app-shell dark theme (`#1f1f1f`).

---

## [2.1.0-beta.4] — 2026-05-24

### Added

- **LaTeX auto compile:** BusyTeX-first `auto` backend with smart escalation to local pdflatex for IEEE/TikZ-style docs; missing `pdflatex` falls back to WASM instead of hard-failing on desktop.
- **Electron launch helper:** `electron/launch.mjs` applies GPU-disable flags before the binary starts (reduces early NVIDIA GBM noise on Linux).
- **Tests:** `latexCompileClient.test.ts` for auto engine order and full-TeX detection.

### Changed

- **Compile settings label:** Auto → “BusyTeX → local TeX when needed”.
- **Software rendering banner:** Dismissible Close control; persists in localStorage.

### Fixed

- **Linux NVIDIA + Wayland:** Auto software rendering (`nvidia-on-wayland`); native Wayland ozone path in safe mode (avoids `XGetWindowAttributes` blank-window glitches).
- **Desktop dev scripts:** `electron:dev` / `electron:start` route through `launch.mjs`.

---

## [Unreleased]

### Added (prior work merged into 2.0.6)

- **Local GGUF guardrails:** Parameter cap (8B default, 16B in Settings), file-size limits, F16 block for large models.
- **Curated model list:** Recommended tab in Labs with one-click downloads.
- **Desktop — Hugging Face token:** Electron `safeStorage` via `hfSecretStore.mjs`.
- **Local GGUF Labs:** Quantization label, VRAM hints, gated-repo handling.

### Changed

- **Local GGUF hub:** Stored HF token from main process; shared `hf-secret-status` query key.