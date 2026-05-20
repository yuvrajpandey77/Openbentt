# Changelog

All notable changes to this project are documented in this file.

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

## [Unreleased]

### Added (prior work merged into 2.0.6)

- **Local GGUF guardrails:** Parameter cap (8B default, 16B in Settings), file-size limits, F16 block for large models.
- **Curated model list:** Recommended tab in Labs with one-click downloads.
- **Desktop — Hugging Face token:** Electron `safeStorage` via `hfSecretStore.mjs`.
- **Local GGUF Labs:** Quantization label, VRAM hints, gated-repo handling.

### Changed

- **Local GGUF hub:** Stored HF token from main process; shared `hf-secret-status` query key.
