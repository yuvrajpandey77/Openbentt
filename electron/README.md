# Openbentt Desktop (Electron)

This folder hosts the **desktop shell only**. The React UI lives in `src/` and is unchanged; Electron loads the same Vite dev server (development) or the production `dist/` bundle (packaged app).

## Development

Terminal 1 — Vite (required first):

```bash
npm run dev
```

One command (starts Vite + Electron; `OPENBENTT_ELECTRON_DEV=1` loads the dev server):

```bash
npm run electron:dev
```

## Production-like desktop build

Build the web app, bundle **llama-server**, then package Electron:

```bash
npm run electron:build
```

`electron:build` runs `download:llama-server` for the current OS (~8–50 MB from [llama.cpp releases](https://github.com/ggml-org/llama.cpp/releases)). CI does the same per runner before `electron:pack:*`.

Installers / artifacts appear under `release/` (platform-dependent). GitHub Releases feed **Settings → Check for updates** via `electron-updater`.

## How routing works

- **Dev:** `BrowserRouter` works against the Vite dev server.
- **Packaged:** the main process registers a custom `app://` protocol that serves files from `dist/` and falls back to `index.html` for client-side routes — no changes to `src/` were required.

## Files

| File        | Role                                      |
|------------|-------------------------------------------|
| `main.mjs` | Window, dev URL vs `app://`, SPA protocol |
| `preload.cjs` | `contextBridge` — GGUF IPC, updates |
| `localGgufService.mjs` | HF downloads, registry, llama-server |
| `updater.mjs` | GitHub Releases auto-update |
