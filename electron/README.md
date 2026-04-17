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

Build the web app, then package Electron:

```bash
npm run electron:build
```

Installers / artifacts appear under `release/` (platform-dependent).

## How routing works

- **Dev:** `BrowserRouter` works against the Vite dev server.
- **Packaged:** the main process registers a custom `app://` protocol that serves files from `dist/` and falls back to `index.html` for client-side routes — no changes to `src/` were required.

## Files

| File        | Role                                      |
|------------|-------------------------------------------|
| `main.mjs` | Window, dev URL vs `app://`, SPA protocol |
| `preload.mjs` | `contextBridge` — safe desktop hints   |
