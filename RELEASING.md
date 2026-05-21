# Distribution and GitHub Releases

## CI (every PR / push to `main` / `staging`)

Workflow: `.github/workflows/ci.yml`

Runs `npm run lint` (includes Electron security check), `npm run test`, `npm run build`, and `npm run test:e2e` on Ubuntu with Node 22.

## Release gate (local)

Before tagging, run the full automated gate:

```bash
npm ci
npm run verify:release
```

This runs: **lint** → **unit + electron tests** → **production build** → **Playwright e2e**.

Optional packaged smoke (Linux AppImage build, ~5–15 min, needs Electron + llama download):

```bash
npm run verify:release:pack
```

**Not in default CI** — too slow and runner-specific; use manually or add a optional workflow job if needed.

Manual UX checks: [LOCAL_RELEASE_CHECKLIST.md](./LOCAL_RELEASE_CHECKLIST.md) (sections A–G).

## Tagged releases (`v*`)

Workflow: `.github/workflows/release.yml`

**Trigger:** push a **version tag** whose name starts with `v`, for example:

```bash
git tag v1.0.0
git push origin v1.0.0
```

**Do not** create GitHub Releases manually in the UI — that publishes source-only archives with no installers and breaks `/download` links. Always let `.github/workflows/release.yml` publish after a tag push. The publish job fails if no `.AppImage` / `.exe` / `.dmg` / `.deb` files are present.

**Jobs (parallel):**

| Job | Runner | Output |
|-----|--------|--------|
| `build-linux-web` | `ubuntu-latest` | **`openbentt-web-dist.zip`** (static `dist/`), **Linux** `.AppImage` + `.deb` |
| `build-windows` | `windows-latest` | **Windows** NSIS **`.exe`** (+ helper files in `release/`) |
| `build-macos` | `macos-latest` | **macOS** **`.dmg`** and **`.zip`** (targets from `package.json`) |

Then **`publish`** downloads those artifacts and creates **one GitHub Release** with all files attached (plus generated release notes).

Shared steps on each builder: restore or download **BusyTeX** (`npm run download:busytex`, cached per OS), then **`npm run build`**, then **`npm run download:llama-server`** (platform binary), then **`electron-builder`** for that platform.

### Auto-update metadata (`latest*.yml`)

`electron-updater` needs **`latest-linux.yml`**, **`latest-mac.yml`**, and **`latest.yml`** (Windows) on each GitHub Release.

- `package.json` sets **`generateUpdatesFilesForAllChannels: true`** so YAML is emitted even when pack scripts use **`--publish never`** (build-only, no upload during pack).
- Release workflow **`publish`** job copies `latest*.yml` from artifacts into the GitHub Release.

**Updater smoke (manual, post-release):**

1. Install previous version from GitHub Releases.
2. Publish new tag; wait for CI.
3. Open installed app → **Settings → General → Check for updates**.
4. Expect “update available” or “up to date”; verify download/install on a test machine.

In **dev** (`electron:dev`), update checks may report dev-only — expected.

### Optional: absolute site URL in the build

**Settings → Secrets and variables → Actions → Variables** → add **`VITE_PUBLIC_SITE_URL`** (e.g. `https://your.domain`) for canonical / Open Graph URLs in the bundle.

## Code signing (macOS / Windows)

Current CI builds are **unsigned** (`CSC_IDENTITY_AUTO_DISCOVERY=false` on macOS). To ship signed installers:

### GitHub Actions secrets

| Secret | Platform | Purpose |
|--------|----------|---------|
| `APPLE_ID` | macOS | Apple ID email for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | macOS | App-specific password |
| `APPLE_TEAM_ID` | macOS | Developer team ID |
| `CSC_LINK` | macOS / Windows | Base64 `.p12` (mac) or `.pfx` (win) signing cert |
| `CSC_KEY_PASSWORD` | macOS / Windows | Certificate export password |

### Workflow changes (`.github/workflows/release.yml`)

**macOS job** — remove or set `CSC_IDENTITY_AUTO_DISCOVERY: false` only when secrets absent; add:

```yaml
env:
  CSC_LINK: ${{ secrets.CSC_LINK }}
  CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
  APPLE_ID: ${{ secrets.APPLE_ID }}
  APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
  APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

Add to `package.json` → `build.mac`: `"hardenedRuntime": true`, `"gatekeeperAssess": false`, `"entitlements": "build/entitlements.mac.plist"` (create entitlements file).

**Windows job** — same `CSC_LINK` / `CSC_KEY_PASSWORD`; optional `WIN_CSC_LINK` if using a separate Windows cert.

**NSIS**: consider `"signAndEditExecutable": true` under `build.win` when cert is present.

Until secrets are configured, document Gatekeeper / SmartScreen warnings in release notes.

## Troubleshooting

- **`Cannot compute electron version from installed node modules` in CI** — Usually `electron` was missing because `NODE_ENV=production` skips **devDependencies**. **`electron` and `electron-builder` must stay in `devDependencies`**. The release workflow runs **`npm ci` with `NODE_ENV=development`**. Push latest `package.json`, `package-lock.json`, and `.github/workflows/release.yml` before tagging.

- **Missing `latest*.yml` on Release** — Ensure `generateUpdatesFilesForAllChannels: true` in `package.json` and that the publish job’s `find` includes `latest*.yml`.

## Manual checks before tagging

1. **Automated:** `npm run verify:release`
2. **Optional pack smoke:** `npm run verify:release:pack`
3. **Manual:** [LOCAL_RELEASE_CHECKLIST.md](./LOCAL_RELEASE_CHECKLIST.md) (sections A–G)
4. **Version:** `package.json` `version` matches tag (e.g. `2.0.7` ↔ `v2.0.7`); update [CHANGELOG.md](./CHANGELOG.md)
5. **Host/deploy:** [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) for Vercel/Docker env vars

**Product summary:** [docs/RELEASE_OVERVIEW.md](./docs/RELEASE_OVERVIEW.md)

**Threat model:** [docs/THREAT_MODEL.md](./docs/THREAT_MODEL.md)
