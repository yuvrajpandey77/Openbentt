# Openbentt Setup Guide

This guide is a quick, practical path for getting Openbentt running on web and desktop, plus a Linux troubleshooting section for GPU-process crashes and lag.

## 1) Prerequisites

- Node.js 18+ (Node 22 recommended)
- npm 9+
- Git
- OpenRouter API key (optional until first message send)

Check your environment:

```bash
node -v
npm -v
```

## 2) Local web setup (fastest path)

```bash
git clone <your-fork-or-repo-url>
cd Openbentt
npm install
npm run dev
```

Open: `http://localhost:8080`.

## 3) Desktop setup (Electron)

From repo root:

```bash
npm install
npm run electron:dev
```

If your machine has GPU stack instability (common on some Linux laptops/VMs):

```bash
npm run electron:dev:safe
```

This enables software rendering and is the recommended fallback when the GPU process crashes.

## 4) Production build checks

```bash
npm run build
npm run test
```

Optional packaged desktop build:

```bash
npm run electron:build
```

## 5) Linux lag/crash troubleshooting (no dedicated GPU)

If you see logs like:

- `GPU process exited unexpectedly: exit_code=139`
- `ContextResult::kTransientFailure: Failed to send GpuControl.CreateCommandBuffer`
- `XGetWindowAttributes failed for window 1`

then Chromium/Electron GPU initialization is failing and repeatedly restarting the GPU process.

### Recommended fixes (in order)

1. **Run safe mode immediately**

   ```bash
   npm run electron:dev:safe
   ```

2. **Force software rendering manually (if needed)**

   ```bash
   OPENBENTT_DISABLE_GPU=1 npm run electron:dev
   ```

3. **Avoid bad Wayland/XWayland combinations**

   ```bash
   OPENBENTT_OZONE_PLATFORM=wayland npm run electron:dev
   # or
   OPENBENTT_OZONE_PLATFORM=x11 npm run electron:dev
   ```

4. **Use a clean dev profile** (if startup behavior is inconsistent)

   ```bash
   rm -rf .electron-dev-profile
   npm run electron:dev
   ```

5. **Use CPU/software GL on Mesa-only machines**

   ```bash
   LIBGL_ALWAYS_SOFTWARE=1 npm run electron:dev
   ```

### Why this happens on some Linux machines

- Systems without a dedicated GPU often rely on Mesa/software rendering or iGPU drivers.
- On Wayland/XWayland, Chromium’s Vulkan/ANGLE path can crash on some driver stacks.
- When that happens, Electron repeatedly tries to create GPU command buffers, causing lag/stutter and eventual UI failure.

Openbentt already contains GPU safe-mode detection for Linux and can auto-disable GPU for known-bad conditions.

## 6) Notes on warnings in your log

- `ExperimentalWarning: SQLite is an experimental feature` — warning only, not typically the cause of the crash.
- `DEP0180 fs.Stats constructor is deprecated` — deprecation warning; usually unrelated to the GPU crash path.

## 7) Quick support checklist

When reporting issues, include:

- Linux distro + version
- Desktop session type (`echo $XDG_SESSION_TYPE`)
- GPU details (`lspci | rg -i 'vga|3d|display'`)
- Command used (`electron:dev` vs `electron:dev:safe`)
- Full startup logs

