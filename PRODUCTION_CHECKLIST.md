# Openbentt — production checklist

Use this before tagging a release or deploying. Mark items as you complete them.

## Build & quality

- [x] `npm run build` completes without errors
- [x] `npm run test` passes (Vitest + `test:electron` llama binary smoke)
- [x] `npm run lint` passes (no errors)
- [x] **GitHub Actions**: CI on `main`/`master`; **release** workflow on tag `v*` (see `RELEASING.md`)
- [x] Product name **Openbentt** reflected in UI (sidebar, welcome, meta title, OpenRouter `X-Title`)
- [x] Top-level **`ErrorBoundary`** catches render crashes with a reload / clear-state fallback
- [x] Build is code-split by heavy deps (transformers, busytex, pdfjs, katex, markdown, ui-vendor)

## Configuration & secrets

- [ ] **OpenRouter**: production keys only via in-app Settings; never commit keys
- [ ] **Vercel / host**: environment variables set (`VITE_PUBLIC_SITE_URL`, optional `VITE_LATEX_COMPILE_URL`, `VITE_LATEX_REMOTE`, `VITE_RESEARCH_PROXY_URL`)
- [ ] **Download page**: `VITE_GITHUB_REPO=owner/repo` and optional `VITE_DESKTOP_ASSET_VERSION` match published release filenames (see `.env.example`)
- [ ] **Research proxy**: `BRAVE_SEARCH_API_KEY` set only in Docker / host env if Brave search is required; **not** a `VITE_*` var so it never lands in the bundle
- [ ] **CSP / headers**: reverse proxy ok (nginx sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`). Add a stricter CSP at the edge if your deployment allows it (WASM + dynamic imports require permissive `script-src`/`worker-src`)

## Models (OpenRouter)

- [x] `DEFAULT_MODEL_ID` points at a **currently-served** free model: `meta-llama/llama-3.3-70b-instruct:free`
- [x] **Deprecated defaults** (`DEPRECATED_DEFAULT_MODEL_IDS`) are auto-migrated for returning users
- [x] `/models` is fetched **without** requiring an API key (public endpoint) so first-time visitors see the picker populated
- [x] **Curated free-model fallback** (`CURATED_FREE_MODEL_IDS`) ships in the bundle, covering current OpenRouter `:free` IDs as a last-resort default when the models endpoint is unreachable
- [ ] **Smoke test**: load app → model picker shows free models without an API key → add key → send chat → streaming works

## Assets & HTML

- [x] `index.html`: title, description, favicon (`/openbentt-favicon.svg`)
- [x] Sidebar logo: `/openbentt-logo.svg`
- [x] SEO plugin: canonical, OG/Twitter, JSON-LD, `robots.txt`, `site.webmanifest`, `/openbentt-og.svg`
- [ ] Production: set **`VITE_PUBLIC_SITE_URL`** so Open Graph images use **absolute** URLs (see `.env.example`)
- [ ] Run **Lighthouse** on the production URL and fix regressions

## Runtime behavior

- [x] **Electron / desktop**: first load opens `/chat` workspace (`electron/main.mjs` `START_PATH`); packaged app uses `app://openbentt/chat`
- [x] **Electron / llama-server**: `npm run download:llama-server` before pack; CI runs it per OS; bundled under `resources/llama/<platform>/`
- [x] **Electron / updates**: Settings → General → “Check for updates”; GitHub Release should include `latest*.yml` for `electron-updater`
- [x] **Electron / single instance**: second launch focuses existing window
- [ ] **Window chrome**: `build/icon.png` present; `package.json` `build.icon` set; taskbar/window uses Openbentt artwork
- [ ] Tiled comparison: 2+ models, grid + metrics
- [ ] Notebook: PDF load, compile path (BusyTeX or `npm run latex-compile`); invalid PDF preview shows **Apply fixes & recompile** for LaTeX source
- [ ] Legacy users: existing chats load after `cogerphere-*` → `openbentt-*` migration (first visit)
- [ ] Thread search: filters messages **and** highlights matches with a yellow background (user + assistant text; not fenced code)

## Security & privacy

- [ ] No third-party scripts required for core app (review `index.html` before ship)
- [ ] User content stays in **localStorage** unless they use cloud features you add later
- [ ] nginx serves static assets `immutable`; `index.html` is `no-cache`
- [ ] `LICENSE` file present with your copyright

## Docker

- [ ] `docker compose up --build` serves app on expected port (8080)
- [ ] Optional `BRAVE_SEARCH_API_KEY` supplied in compose env when research+Brave is required
- [ ] Image tagged **`openbentt`** for registry pushes

---

**Status:** **Release-ready** — run [LOCAL_RELEASE_CHECKLIST.md](./LOCAL_RELEASE_CHECKLIST.md) before each tag. See [docs/RELEASE_OVERVIEW.md](./docs/RELEASE_OVERVIEW.md).

**Manual smoke (required before tag):** sections A–F in LOCAL_RELEASE_CHECKLIST.md.
