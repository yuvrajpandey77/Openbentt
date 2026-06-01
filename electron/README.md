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

### GPU crashes on Linux (NVIDIA / Wayland)

If you see `GBM-DRV error`, `driver (null)`, or `GPU process exited unexpectedly: exit_code=139`, Chromium’s GPU stack is failing (common on **NVIDIA + Wayland** laptops, including Kali):

```bash
npm run electron:dev:safe   # software rendering — window opens reliably
```

Dev loads Vite at **`http://127.0.0.1:8080`** (not `localhost`) to avoid IPv6 mismatches. Dev mode uses an isolated profile at **`.electron-dev-profile/`** (not `~/.config/Openbentt`) plus `--disable-http-cache`. Optional: `OPENBENTT_ELECTRON_DEVTOOLS=1` opens DevTools on start. If loading still fails, delete `.electron-dev-profile/` or ensure port 8080 is free.

From this release onward, if hardware rendering starts but the GPU process crashes repeatedly at startup, Openbentt **auto-relaunches once** in software-render mode (`OPENBENTT_DISABLE_GPU=1`) to reduce hangs and blank-window failures on unstable Linux driver stacks.

From v2.2.4 onward, packaged apps and `electron:dev` **auto-enable** software rendering on Linux when:

- NVIDIA GPU is on a **Wayland** session, or
- NVIDIA GPU is present but the **proprietary driver is not loaded** (`driver (null)`), or
- No GPU device / software GL env vars are set.

Safe mode uses **native Wayland** (not XWayland), a **standard window frame**, and the **system menu bar** (File / Edit / View / Help) — not the in-app title strip.

To force hardware acceleration anyway:

```bash
OPENBENTT_DISABLE_GPU=0 npm run electron:dev
```

If the window misbehaves, try `OPENBENTT_DISABLE_GPU=1` or `OPENBENTT_OZONE_PLATFORM=x11`.

Harmless log lines you can ignore in safe mode: `Browserslist`, `SQLite is an experimental feature`, `GBM-DRV error`, `pci id … driver (null)`.

Other overrides: `OPENBENTT_OZONE_PLATFORM=wayland|auto|x11`, `OPENBENTT_DISABLE_WEBGPU_FLAGS=1`.

Production install: see [docs/releases/v2.2.5.md](../docs/releases/v2.2.5.md) on GitHub Releases.

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
