# Distribution and GitHub Releases

## CI (every PR / push to `main`)

Workflow: `.github/workflows/ci.yml`

Runs `npm run lint`, `npm run test`, and `npm run build` on Ubuntu with Node 22.

## Tagged releases (`v*`)

Workflow: `.github/workflows/release.yml`

**Trigger:** push a **version tag** whose name starts with `v`, for example:

```bash
git tag v1.0.0
git push origin v1.0.0
```

**Jobs (parallel):**

| Job | Runner | Output |
|-----|--------|--------|
| `build-linux-web` | `ubuntu-latest` | **`openbentt-web-dist.zip`** (static `dist/`), **Linux** `.AppImage` + `.deb` |
| `build-windows` | `windows-latest` | **Windows** NSIS **`.exe`** (+ helper files in `release/`) |
| `build-macos` | `macos-latest` | **macOS** **`.dmg`** and **`.zip`** (targets from `package.json`) |

Then **`publish`** downloads those artifacts and creates **one GitHub Release** with all files attached (plus generated release notes).

Shared steps on each builder: restore or download **BusyTeX** (`npm run download:busytex`, cached per OS), then **`npm run build`**, then **`npm run download:llama-server`** (platform binary), then **`electron-builder`** for that platform.

### Optional: absolute site URL in the build

**Settings → Secrets and variables → Actions → Variables** → add **`VITE_PUBLIC_SITE_URL`** (e.g. `https://your.domain`) for canonical / Open Graph URLs in the bundle.

### Code signing (macOS / Windows)

- **macOS:** CI sets **`CSC_IDENTITY_AUTO_DISCOVERY=false`** so the build **does not** require Apple certificates. Installers are **unsigned**; users may see **Gatekeeper** warnings. For distribution outside the Mac App Store, add Apple Developer **signing + notarization** (Certificates & secrets in GitHub Actions) in a follow-up.
- **Windows:** NSIS builds are typically **unsigned** unless you add a **Windows code-signing** certificate and wire `CSC_LINK` / `CSC_KEY_PASSWORD` (or equivalent) in the workflow.

## Troubleshooting

- **`Cannot compute electron version from installed node modules` in CI** — Usually `electron` was missing because `NODE_ENV=production` skips **devDependencies**. **`electron` and `electron-builder` must stay in `devDependencies`** (electron-builder rejects them in `dependencies`). The release workflow runs **`npm ci` with `NODE_ENV=development`** so dev deps install, and uses **`npm run electron:pack:…`** (not `npx electron-builder` alone). **Push the latest `package.json`, `package-lock.json`, and `.github/workflows/release.yml`** before tagging—old workflows still show `npx electron-builder` in the log.

## Manual checks before tagging

1. **Automated:**
   ```bash
   npm ci
   npm run lint
   npm run test
   npm run build
   npm run download:llama-server   # optional locally; CI runs per OS
   ```
2. **Manual:** complete [LOCAL_RELEASE_CHECKLIST.md](./LOCAL_RELEASE_CHECKLIST.md) (sections A–F).
3. **Version:** `package.json` `version` matches tag (e.g. `2.0.6` ↔ `v2.0.6`); update [CHANGELOG.md](./CHANGELOG.md).
4. **Host/deploy:** [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) for Vercel/Docker env vars.

**Product summary:** [docs/RELEASE_OVERVIEW.md](./docs/RELEASE_OVERVIEW.md)
