# Openbentt

**Desktop-first, local-first AI research workspace** — chat, Notebook LaTeX→PDF, hybrid RAG, and multi-agent execution. Bring your own keys and models; no Openbentt account required.

**Current release: [v2.5.0](./docs/releases/v2.5.0.md)** · [Feature audit](./docs/FEATURE_COMPLETION_LOG.md) · [Launch readiness](./docs/LAUNCH_READINESS.md)

---

## Why switch from OpenAI Prism (before 1 Jan)

OpenAI’s **Prism LaTeX editor is shutting down**. Openbentt is built as a durable local alternative:

| You used Prism for… | Openbentt equivalent |
|---------------------|----------------------|
| Writing papers in LaTeX | **Notebook studio** with templates |
| Compiling to PDF | **BusyTeX → local TeX → HTTP → text PDF** cascade |
| Project packs / ZIP | **One-click Import** (ZIP, folder, `.tex` / `.bib`) |
| Citations | **Bibliography + Zotero** |
| AI help while drafting | **Ollama / OpenRouter / detected agent CLIs** |

**Migrate in one click:** export Prism (or Overleaf / Codex) as a ZIP → **Projects → New → Import → Import .tex / .bib / .zip** (or **Import folder**).

---

## Screenshots

<p align="center">
  <img src="./docs/screenshots/notebook-studio.svg" alt="Notebook studio with LaTeX and PDF preview" width="100%" />
  <br /><em>Notebook — edit, compile, preview</em>
</p>

<p align="center">
  <img src="./docs/screenshots/projects-import.svg" alt="One-click project import dialog" width="72%" />
  <br /><em>Import Overleaf / Prism ZIP or a whole folder</em>
</p>

<p align="center">
  <img src="./docs/screenshots/agents-settings.svg" alt="Settings with multi-agent detection and updates" width="100%" />
  <br /><em>Settings — auto-detect agents + desktop updates</em>
</p>

---

## What’s in v2.5.0

- **Multi-agent desktop** — auto-detect **OpenCode, Claude Code, Codex CLI, Cursor Agent, Aider, Gemini CLI** on PATH; prefer any available agent under Settings → Agents (not OpenCode-only).
- **One-click import** — ZIP / folder / `.tex` / `.bib`; Zotero remains under Notebook Tools.
- **Desktop updates** — Settings card: check → download → restart & install (`electron-updater` + GitHub Releases `latest*.yml`).
- **Bombadil QA** — property-based browser exploration for release confidence.
- **Hybrid RAG** — TF-IDF + MiniLM with fair corpus budgeting for large projects.

---

## Quick start

```bash
npm install
npm run electron:dev    # Vite + Electron (hot reload)
# or web only:
npm run dev             # http://127.0.0.1:8080
```

**Requirements:** Node.js 18+ (22 in Docker), optional OpenRouter key / Ollama / local TeX.

Setup & GPU notes: **[docs/SETUP_GUIDE.md](./docs/SETUP_GUIDE.md)** · User manual: **[docs/USER_MANUAL.md](./docs/USER_MANUAL.md)**.

---

## Build, install locally, publish

### Build desktop installers (Linux example)

```bash
npm ci
npm run build
npm run download:llama-server   # once per machine / CI
# Local Linux (AppImage + latest-linux.yml) — preferred on Arch/Omarchy:
npm run electron:pack:linux:appimage
# Full Linux (AppImage + .deb) — CI Ubuntu; needs libcrypt.so.1 for fpm on some hosts:
# npm run electron:pack:linux
```

Windows / macOS: `npm run electron:pack:win` · `npm run electron:pack:mac`.

### Install the new build on this PC (Linux)

```bash
# AppImage (needs libfuse2 — or set APPIMAGE_EXTRACT_AND_RUN=1)
chmod +x release/Openbentt-2.5.0.AppImage
APPIMAGE_EXTRACT_AND_RUN=1 ./release/Openbentt-2.5.0.AppImage

# No-FUSE alternative (same build tree):
./release/linux-unpacked/openbentt

# Or use the local launcher installed for this machine:
openbentt
```

### Publish the GitHub Release (final)

Do **not** create a Release manually in the UI (source-only archives break `/download`). Tag and let CI attach installers:

```bash
# 1) Commit release work on main, then:
git tag v2.5.0
git push origin main
git push origin v2.5.0

# 2) Watch: Actions → release.yml
# 3) Confirm assets: Openbentt-2.5.0.AppImage, .deb, .exe, .dmg, latest*.yml, openbentt-web-dist.zip
# 4) Optional site env: VITE_PUBLIC_SITE_URL, VITE_DESKTOP_ASSET_VERSION=2.5.0
```

Full playbook: **[RELEASING.md](./RELEASING.md)** · local checklist: **[LOCAL_RELEASE_CHECKLIST.md](./LOCAL_RELEASE_CHECKLIST.md)**.

### Verify updates & settings after install

1. Open packaged app → **Settings**.
2. Confirm **Desktop app updates** shows `2.5.0` → **Check for updates**.
3. **Settings → Agents** → **Rescan PATH** → prefer a detected agent.
4. **Projects → New → Import** a Prism/Overleaf ZIP.

---

## Testing

```bash
npm run test            # Vitest + electron smoke
npm run test:unit
npm run test:e2e        # Playwright
npm run test:bombadil:preview   # build + preview + Bombadil (45s)
# or with an already-running server on :8080:
npm run test:bombadil
```

Bombadil docs: [installation](https://antithesishq.github.io/bombadil/browser/2.1-installation.html) · [GitHub](https://github.com/antithesishq/bombadil). Spec: `bombadil/specification.ts`.

---

## Capability map

| Capability | Description |
|------------|-------------|
| **OpenRouter chat** | Streaming completions; multi-model compare |
| **Local AI** | Ollama / llama-server GGUF on desktop |
| **Notebook** | LaTeX drafts, templates, compile cascade, PDF preview |
| **Import** | ZIP / folder / `.tex` / `.bib` / Zotero |
| **Agents** | Role allowlists + PATH-detected CLIs |
| **Research RAG** | Hybrid lexical + embeddings, project SQLite on desktop |
| **Updates** | GitHub Releases + electron-updater |

---

## Future scope

Near-term hardening and expansion after v2.5.0:

1. **Agent runners** — spawn preferred CLI (Claude / Codex / Cursor / Aider) with shared Approvals, not only detect + prefer.
2. **Deeper Prism import** — map Prism-specific metadata, figures, and multi-root packs.
3. **Cloud sync (opt-in)** — encrypted project sync; default remains local-only.
4. **Grammar / style suite** — dedicated academic writing checks beyond chat prompts.
5. **EPUB / rich PDF edit** — beyond preview; selective annotation layers.
6. **Autonomous deep-research pipelines** — multi-step literature jobs with audited tool use.
7. **Signed installers** — macOS notarization / Windows Authenticode via CI secrets (`RELEASING.md`).
8. **Live product screenshots** — replace SVG storyboards with CI-captured AppImage frames.

Honest gaps today: Acrobat-class PDF editing, full EPUB authoring, and fully autonomous multi-hour research agents.

---

## Production deploy (web)

Static `dist/` after `npm run build`, or Docker:

```bash
DOCKER_BUILDKIT=1 docker compose up --build
```

Env template: **`.env.example`**. Checklist: **`PRODUCTION_CHECKLIST.md`**.

---

## Stack

Vite · TypeScript · React · Electron · shadcn/ui · Tailwind · TanStack Query · Vitest · Playwright · Bombadil · electron-builder / electron-updater.

## License / open source

Add a `LICENSE` before publishing forks. Do not commit secrets; start from `.env.example`.
