# Openbentt

A **desktop-first, local-first** AI workspace (Electron) with an optional **web build** for **[OpenRouter](https://openrouter.ai/)** chat and Notebook. Pick models, stream replies, and compare **2–4 models** side by side with **latency and token metrics**. API keys stay in **localStorage** on your device—there is **no Openbentt account system**.

**Product audit (May 2026):** [docs/FEATURE_COMPLETION_LOG.md](./docs/FEATURE_COMPLETION_LOG.md) · [docs/LAUNCH_READINESS.md](./docs/LAUNCH_READINESS.md)

## Who it’s for

- **Developers and power users** who want a polished OpenRouter client with **multi-model comparison**, **research-oriented workspaces**, and **Notebook LaTeX → PDF** flows—without handing keys to a third-party chat product.
- **Privacy-minded users** who prefer **local chat history** (localStorage) and **bring-your-own-key** usage.
- **Teams self-hosting** a static or Docker deployment behind their own domain (see **Production** below).

## What this project offers

| Capability | Description |
|------------|-------------|
| **OpenRouter chat** | Uses `https://openrouter.ai/api/v1/chat/completions` with streaming. |
| **Model directory** | Loads models from OpenRouter’s API (public `/models` endpoint → works **without** an API key on first visit). Highlights **free-tier** models (`:free` / $0-style pricing). Curated fallback list when offline. |
| **Custom model IDs** | Add any OpenRouter model id (including paid) in Settings. |
| **Tiled comparison** | One user message → parallel requests to multiple models → **grid of answers** with per-model **TTFT**, **total ms**, **tokens** (when the API returns usage). |
| **Chats** | Multiple conversations, titles from the first user message, persist locally. |
| **Specs** | **Specs** button next to the model opens pricing, context, modalities, and link to OpenRouter. |
| **Attachments** | Images, audio, and video (first-frame preview) → multimodal `messages` for OpenRouter. |
| **Charts** | Assistant can output fenced ` ```openbentt-chart` JSON → **Recharts** bar/line/area in the thread. Legacy ` ```cogerphere-chart` fences are still parsed. |
| **Workspaces** | **Notebook** (LaTeX/PDF), **Research labs**, **LaTeX preview**, **Benchmark**, **WebGPU** — route-aware system prompts. |
| **Retry / Edit** | **Retry** on the last assistant reply; **Edit** (pencil on user bubble) reloads the composer. |
| **Thread tools (Home)** | **Search** (with **in-message highlights**), **Export .md**, **Shortcuts**; composer **Snippets** (saved prompts, local only). |
| **Theme** | Light default; dark mode in Settings. |
| **Analytics** | Vercel Analytics (if deployed on Vercel). |

### Branding note

The product name is **Openbentt**. Older localStorage keys and chart fences may still use the legacy `cogerphere-*` prefix; the app migrates storage on first load.

## Setup guide

For a step-by-step install and Linux GPU crash troubleshooting guide, see **[docs/SETUP_GUIDE.md](./docs/SETUP_GUIDE.md)**.

## Requirements

- **Node.js** 18+ (repo uses **22** in Docker) and **npm**
- An **OpenRouter API key** ([openrouter.ai/keys](https://openrouter.ai/keys)) — optional until you send a message; required for API calls.

No server-side OpenRouter key is required to **run** the app; keys are entered in the UI.

## Scripts

```bash
npm install       # dependencies
npm run dev       # dev server (http://localhost:8080)
npm run build     # production bundle → dist/
npm run preview   # serve dist/ locally (same port config as dev; useful before deploy)
npm run test      # Vitest unit tests + electron llama-server smoke
npm run test:unit # Vitest only
npm run lint      # ESLint
```

### Desktop (Electron)

The **same UI** runs in a desktop window; the shell lives under `electron/` and does **not** modify `src/`.

```bash
npm run electron:dev    # Vite + Electron (hot reload; DevTools open)
npm run electron:dev:safe  # same; OPENBENTT_DISABLE_GPU=1 if GPU process crashes (Linux/NVIDIA)
npm run electron:start  # npm run build, then open Electron loading dist/ (app://)
npm run download:llama-server  # bundle llama.cpp server for local GGUF (once per machine)
npm run electron:build  # web build + llama-server + installers → release/
```

Details: **`electron/README.md`**.

### Releasing

Before tagging `v*`, run **`npm run test`** and follow **[LOCAL_RELEASE_CHECKLIST.md](./LOCAL_RELEASE_CHECKLIST.md)**. Overview: **[docs/RELEASE_OVERVIEW.md](./docs/RELEASE_OVERVIEW.md)** · CI: **[RELEASING.md](./RELEASING.md)**.

## Production (instant setup paths)

Pick one; all assume `npm ci` (or `npm install`) has run at least once.

### A. Static hosting (Vercel, Netlify, Cloudflare Pages, S3 + CDN, any nginx)

1. **Set build-time env** (see **Environment variables**): at minimum plan **`VITE_PUBLIC_SITE_URL`** for correct canonical and social preview URLs.
2. Build: `npm run build`.
3. Deploy the **`dist/`** folder. Configure the host for a **single-page app**: every unknown path should serve **`index.html`** (history fallback).

**Note:** Chat and OpenRouter calls are **from the user’s browser**. Optional features that need a small server (**research proxy**, **remote LaTeX compile**) are not included in a plain static upload unless you add those endpoints and set the matching `VITE_*` values or in-app URLs.

### B. Docker (static UI + nginx + research proxy)

Includes **nginx** on **:8080** and the **research** proxy (Brave search optional).

```bash
DOCKER_BUILDKIT=1 docker compose up --build
# or: npm run docker:build && docker run --rm -p 8080:8080 openbentt
```

**Why the first build feels slow:** the image runs `npm ci` and, unless BusyTeX is already present, downloads **~175MB** of WASM assets (`texlyre-busytex`). Expect **several minutes** the first time; later builds reuse Docker layer cache. To **skip the download** on your machine, run once in the repo root: `npm run download:busytex` (creates `public/core/busytex/`), then build again — the Dockerfile detects `busytex.wasm` and skips fetching.

For everyday UI work, **`npm run dev`** is much faster than rebuilding the image.

- Service name: **openbentt** (see `docker-compose.yml`).
- **Optional:** set `BRAVE_SEARCH_API_KEY` in the compose environment (or `.env` next to compose) for Brave-backed search in the bundled proxy.
- The image bakes **`VITE_RESEARCH_PROXY_URL=/api`** so the browser calls same-origin `/api/research` → nginx → `server/research-proxy.mjs`.

Rebuild the image if you change `VITE_*` build args.

### C. Self-check before tagging a release

- `npm run build` and `npm run test`
- **`PRODUCTION_CHECKLIST.md`** — host-specific items (env, smoke tests, Lighthouse)


## Product reach metrics (privacy-first)

If you need to track growth without invasive telemetry:

- **Site visits:** enable Vercel Analytics and read totals in your Vercel dashboard.
- **App downloads:** use GitHub Releases asset download counts per installer.
- **Active users:** not collected by default (privacy-first).

See release playbook notes in **`docs/releases/v2.2.5.md`**.

## Environment variables

| Variable | When to set | Purpose |
|----------|-------------|---------|
| `VITE_PUBLIC_SITE_URL` | **Build** (CI / `npm run build`) | Canonical URL, Open Graph / Twitter **absolute** image URLs. No trailing slash. |
| `VITE_RESEARCH_PROXY_URL` | Build (optional) | Base URL for the research HTTP proxy; Docker defaults to same-origin `/api`. |
| `VITE_LATEX_COMPILE_URL` | Build (optional) | Remote `POST /compile` endpoint for full-document LaTeX PDF (see `server/latex-compile.mjs`). |
| `VITE_LATEX_REMOTE` | Build (optional) | Set to `1` to prefer HTTP compile over in-browser WASM. |
| `BRAVE_SEARCH_API_KEY` | **Runtime** (Docker / proxy host only) | Not a `VITE_` var; enables Brave search inside `server/research-proxy.mjs`. |

Authoritative commented template: **`.env.example`**.

## Stack

Vite, TypeScript, React, shadcn/ui, Tailwind CSS, TanStack Query, React Markdown, Vitest.

## Open source

This repo is suitable for **public open source**: there is **no server-side login** in the app; users bring their own **OpenRouter** key (stored in the browser). Before publishing:

- Add a **`LICENSE`** file (e.g. MIT) with your copyright line.
- Do **not** commit `.env` with real secrets; start from **`.env.example`**.
- Review **third-party scripts** and analytics (e.g. Vercel Analytics) for your policy.

### GitHub: CI and releases

- **CI** (`.github/workflows/ci.yml`) runs lint, tests, and `vite build` on pushes and PRs to `main` / `master`.
- **Releases** (`.github/workflows/release.yml`): push a tag `v1.2.3` to publish a GitHub Release with **`openbentt-web-dist.zip`**, **Linux** (AppImage + deb), **Windows** (NSIS `.exe`), and **macOS** (`.dmg` / `.zip`). Optional repo variable **`VITE_PUBLIC_SITE_URL`** for canonical/OG URLs. macOS CI builds are unsigned (no Apple cert); see **`RELEASING.md`** for signing/notarization notes.

Full steps: **`RELEASING.md`**.

## SEO & social previews

Build injects **canonical**, **Open Graph**, **Twitter Card**, **theme-color**, **Web App Manifest**, **`robots.txt`**, and **JSON-LD** (`WebApplication`). Example:

```bash
export VITE_PUBLIC_SITE_URL=https://your.domain
npm run build
```

**Lighthouse “SEO”** is usually strong on a static deploy with a real `<title>`, meta description, crawlable document, and valid `robots.txt`; verify on your production URL in Chrome DevTools → Lighthouse.
