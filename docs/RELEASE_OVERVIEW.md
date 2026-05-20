# Openbentt — Release overview (v2.0.6)

**Status:** Release-ready for tagged distribution. Automated unit tests cover core libraries and config; **manual smoke tests** are required before each tag (see [LOCAL_RELEASE_CHECKLIST.md](../LOCAL_RELEASE_CHECKLIST.md)).

---

## What ships

| Surface | Deliverable |
|---------|-------------|
| **Web** | Static SPA (`dist/`) — Vercel, Docker/nginx, or any static host |
| **Desktop** | Electron installers: Linux AppImage/deb, Windows NSIS, macOS dmg/zip |
| **Local AI (desktop)** | Bundled **llama-server** (llama.cpp b9222) + Labs GGUF hub |
| **Local AI (web/desktop)** | WebGPU/WASM models via Transformers.js |
| **Cloud AI** | OpenRouter, OpenAI-compatible (Ollama, LM Studio), direct OpenAI/Anthropic/Google |

---

## Core user journeys

1. **Cloud chat** — Setup → OpenRouter key → pick model → stream replies → threads persist in localStorage.
2. **Compare models** — Enable comparison → 2–4 models → one prompt → grid with latency/token metrics.
3. **Desktop local GGUF** — Setup → Local GGUF → Labs download → Settings pick model → chat (llama-server auto-started).
4. **On-device (browser GPU)** — Setup → Run on device → consent → first message downloads weights → chat.
5. **Notebook** — PDF/LaTeX workspace, AI assist, compile (WASM or server).
6. **Research labs** — BibTeX, citation graph, HF datasets, local model hub.

---

## Architecture (one page)

```
React SPA (Vite) ──HTTPS──► OpenRouter / cloud APIs
        │
        ├── WebGPU/WASM ──► @huggingface/transformers (in-browser)
        │
        └── Electron IPC ──► main process
                ├── HF downloads + registry (localGgufService)
                ├── llama-server @ 127.0.0.1 (bundled or PATH)
                ├── HF token (safeStorage)
                └── electron-updater → GitHub Releases
```

---

## What is tested automatically

| Suite | Command | Coverage |
|-------|---------|----------|
| **Unit (Vitest)** | `npm run test:unit` | Chat config, GGUF guardrails, download progress, placeholders, OpenRouter helpers, LaTeX/notebook parsers, ~27 files |
| **Electron smoke** | `npm run test:electron` | Bundled `llama-server` binary present after download script |
| **CI** | `.github/workflows/ci.yml` | lint + test + build on every PR |
| **Release CI** | `.github/workflows/release.yml` on `v*` tag | Per-OS build + `download:llama-server` + GitHub Release |

**Not automated (manual only):** full chat streaming, Electron window, GGUF end-to-end inference, installer install, auto-update apply, macOS Gatekeeper.

---

## Known limitations at release

| Item | Impact | Workaround |
|------|--------|------------|
| **Unsigned macOS/Windows builds** | OS security warnings | User: right-click → Open; or add signing certs in CI later |
| **macOS Intel** | CI bundles **arm64** llama-server only | Intel Mac: install llama.cpp to PATH or set binary in Settings |
| **No E2E/Playwright** | Regressions in UI flow not caught in CI | Follow manual checklist |
| **Research orchestrator** | Hybrid retrieval in notebook AI prompts | Full multi-step agent loop not shipped |
| **Cloud sync** | localStorage only | Export .md / share URL |

---

## Release artifacts (tag `v2.0.6`)

After `git push origin v2.0.6`, GitHub Actions publishes:

- `openbentt-web-dist.zip`
- `Openbentt-2.0.6.AppImage`, `openbentt_2.0.6_amd64.deb`
- `Openbentt Setup 2.0.6.exe`, Windows zip
- `Openbentt-2.0.6-arm64.dmg`, mac zip
- `latest-linux.yml`, `latest-mac.yml`, `latest.yml` (for desktop auto-update)

---

## Docs map

| Document | Use |
|----------|-----|
| [LOCAL_RELEASE_CHECKLIST.md](../LOCAL_RELEASE_CHECKLIST.md) | **You** — step-by-step local testing before tag |
| [RELEASING.md](../RELEASING.md) | Tag push + CI troubleshooting |
| [PRODUCTION_CHECKLIST.md](../PRODUCTION_CHECKLIST.md) | Host/deploy env items |
| [PRODUCT_DOC.md](./PRODUCT_DOC.md) | Full product spec (historical roadmap included) |
| [electron/README.md](../electron/README.md) | Desktop dev & build |

---

## Version bump before tag

```bash
# 1. Bump version in package.json (and lockfile if needed)
# 2. Update CHANGELOG.md
# 3. Commit, then:
git tag v2.0.6
git push origin main
git push origin v2.0.6
```

Replace `v2.0.6` with your target version. CI must run on the commit that contains the matching `package.json` version.
