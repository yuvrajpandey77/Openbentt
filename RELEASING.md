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

The workflow will:

1. Restore or download **BusyTeX** assets (`npm run download:busytex`, cached between runs).
2. Run **`npm run build`** (set optional repo variable `VITE_PUBLIC_SITE_URL` below for correct OG URLs in the bundle).
3. Create **`openbentt-web-dist.zip`** — contents of `dist/` for static hosting.
4. Run **electron-builder** for **Linux** — **AppImage** and **deb** in `release/`.
5. Create a **GitHub Release** for that tag and attach:
   - `openbentt-web-dist.zip`
   - `*.AppImage`
   - `*.deb`

### Optional: absolute site URL in the build

In GitHub: **Settings → Secrets and variables → Actions → Variables**  
Add **`VITE_PUBLIC_SITE_URL`** (e.g. `https://your.domain`) so the SEO plugin emits canonical / Open Graph URLs. If unset, the build uses relative URLs as in local builds.

## Windows / macOS desktop installers

The default release job runs on **ubuntu-latest** and only produces **Linux** artifacts. To ship `.exe` / `.dmg`, add jobs that run `electron-builder` on `windows-latest` and `macos-latest` (signing/notarization for Mac is a separate setup).

## Manual checks before tagging

- `npm run lint` and `npm run test` pass locally.
- `PRODUCTION_CHECKLIST.md` items relevant to your host are done.
