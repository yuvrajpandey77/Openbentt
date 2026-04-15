# Openbentt — production checklist

Use this before tagging a release or deploying. Mark items as you complete them.

## Build and quality

- [x] `npm run build` completes without errors
- [x] `npm run test` passes
- [ ] `npm run lint` passes (project may have pre-existing UI/eslint issues; fix blockers before ship)
- [x] Product name **Openbentt** reflected in UI (sidebar, welcome, meta title, OpenRouter `X-Title`)

## Configuration and secrets

- [ ] **OpenRouter**: production keys only via Settings; never commit keys
- [ ] **Vercel / host**: environment variables set (`VITE_*` as needed, e.g. `VITE_LATEX_COMPILE_URL` if using remote LaTeX)
- [ ] **Research proxy**: `BRAVE_SEARCH_API_KEY` set in Docker/host if Brave search is required
- [ ] **CORS / API**: OpenRouter calls are client-side; confirm CSP / headers if using a strict CDN

## Assets and HTML

- [x] `index.html`: title, description, favicon (`/openbentt-favicon.svg`)
- [x] Sidebar logo: `/openbentt-logo.svg`
- [ ] Optional: set `og:image` / `twitter:image` to a hosted preview image

## Runtime behavior

- [ ] Smoke test: Settings → save API key → send chat → streaming works
- [ ] Tiled comparison: 2+ models, grid + metrics
- [ ] Notebook: PDF load, compile path (BusyTeX or `npm run latex-compile`)
- [ ] Legacy users: existing chats load after `cogerphere-*` → `openbentt-*` migration (first visit)

## Security and privacy

- [ ] No third-party scripts required for core app (review `index.html` before ship)
- [ ] User content stays in **localStorage** unless they use cloud features you add later

## Docker

- [ ] `docker compose up --build` serves app on expected port
- [ ] Image tagged **`openbentt`** for registry pushes

---

**Status:** Ready for production pending host-specific items (env vars, OG image, manual smoke tests).
