# Release runbook — Openbentt v2.0.10

**Date:** 2026-05-21  
**Author / session:** release pass for Notebook Studio → `main` → tag `v2.0.10`  
**Repo:** `yuvrajpandey77/SecuredChatCogerphere`

Use this as a copy-paste checklist. For background, see [RELEASING.md](../RELEASING.md).

---

## What a “full release” does

1. **Merge** finished work into `main`
2. **Bump** `package.json` version + `CHANGELOG.md`
3. **Verify** locally (`npm run verify:release`)
4. **Push** `main`
5. **Tag** `vX.Y.Z` and **push the tag** → triggers `.github/workflows/release.yml`
6. **CI builds** Linux / Windows / macOS installers + web zip → one GitHub Release
7. `**/download`** on the site reads `releases/latest` from GitHub (no extra deploy step for installer URLs)

**Do not** create GitHub Releases manually in the UI (source-only archives, broken download links).

---

## One-time: GitHub SSH (if push fails)

```bash
# Start agent and add key (replace with your passphrase when prompted)
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# Test
ssh -T git@github.com
# Expect: "Hi yuvrajpandey77! You've successfully authenticated..."
```

Alternative: `gh auth login`

---

## Step-by-step (repeat every release)

### 1. Start from clean tree on your feature branch

```bash
cd /home/yuvraj/Downloads/Projects/SecuredChatCogerphere
git status   # should be clean
git fetch origin
```

### 2. Merge into `main`

```bash
git checkout main
git pull origin main
git merge <your-feature-branch>   # e.g. cursor/notebook-studio-projects-hub
```

If `main` moved on GitHub after your merge, rebase the release commit:

```bash
git pull --rebase origin main
```

### 3. Pick the next version

Check existing tags (don’t reuse a tag already on GitHub):

```bash
git fetch --tags
git tag -l 'v2.0.*'
git ls-remote --tags origin 'v2.0.*'
```

Example: after `v2.0.9` on remote → use `**2.0.10**` and tag `**v2.0.10**`.

Edit:

- `package.json` → `"version": "2.0.10"`
- `CHANGELOG.md` → new `## [2.0.10] — YYYY-MM-DD` section above `## [Unreleased]`

### 4. Run the release gate

```bash
npm ci
npm run verify:release
```

Runs: **lint** → **unit + electron tests** → **production build** → **Playwright e2e**.

If tests fail, fix before tagging (common fixes: stale expectations, schema version in electron tests, e2e routes that moved).

Optional heavy smoke (local Linux pack only):

```bash
npm run verify:release:pack
```

### 5. Commit version bump

```bash
git add package.json CHANGELOG.md
# include any test fixes from step 4
git commit -m "$(cat <<'EOF'
chore(release): bump version to 2.0.10 for <short summary>.

EOF
)"
```

### 6. Push `main`

```bash
git push origin main
```

### 7. Tag and push tag (this starts the multi-OS build)

```bash
git tag -a v2.0.10 -m "Openbentt 2.0.10 — <short summary>"
git push origin v2.0.10
```

**Only push a tag after `main` is pushed.** The Release workflow triggers on `v`* tag push.

### 8. Watch CI

- Actions: [https://github.com/yuvrajpandey77/SecuredChatCogerphere/actions/workflows/release.yml](https://github.com/yuvrajpandey77/SecuredChatCogerphere/actions/workflows/release.yml)
- Expect jobs: `build-linux-web`, `build-windows`, `build-macos`, then `publish`
- **ETA:** ~15–30 minutes

Quick status from terminal:

```bash
curl -s "https://api.github.com/repos/yuvrajpandey77/SecuredChatCogerphere/actions/workflows/release.yml/runs?per_page=1" \
  | python3 -c "import sys,json; r=json.load(sys.stdin)['workflow_runs'][0]; print(r['status'], r['conclusion'], r['html_url'])"
```

### 9. Verify release artifacts

When green, open:

[https://github.com/yuvrajpandey77/SecuredChatCogerphere/releases/latest](https://github.com/yuvrajpandey77/SecuredChatCogerphere/releases/latest)

Confirm files exist:


| OS          | Expected assets                                                 |
| ----------- | --------------------------------------------------------------- |
| Linux       | `Openbentt-<version>.AppImage`, `openbentt_<version>_amd64.deb` |
| Windows     | `Openbentt Setup <version>.exe`                                 |
| macOS       | `Openbentt-<version>-arm64.dmg` (and/or `.zip`)                 |
| Web         | `openbentt-web-dist.zip`                                        |
| Auto-update | `latest-linux.yml`, `latest.yml`, `latest-mac.yml`              |


### 10. Website / download page

- Production site (e.g. Vercel) redeploys when `**main**` is pushed.
- `/download` resolves installer URLs from **GitHub Releases API** at runtime — updates as soon as step 9 completes.
- Optional GitHub Actions variable: `**VITE_PUBLIC_SITE_URL`** (canonical URLs in production builds).

---

## What we did on 2026-05-21 (v2.0.10)


| Step       | Action                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Merge      | `cursor/notebook-studio-projects-hub` → `main`                                                                   |
| Version    | `2.0.8` → `2.0.10` (skipped `2.0.9` — already on remote)                                                         |
| Gate fixes | `latexNotebookImageFixup.test.ts`, `researchProjectService.test.mjs` (schema v5), skip desktop-only notebook e2e |
| Push       | `main` @ `6d66c60`                                                                                               |
| Tag        | `v2.0.10` pushed → Release workflow run started                                                                  |


---

## Troubleshooting


| Problem                         | Fix                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `Permission denied (publickey)` | `ssh-add ~/.ssh/id_ed25519` or `gh auth login`                                 |
| `main` push rejected            | `git pull --rebase origin main` then push again                                |
| Tag already exists              | Bump patch version (`2.0.11`) — never move an published tag                    |
| Release workflow failed         | Open failed job log; often BusyTeX, electron-builder, or missing artifact      |
| `/download` 404 for asset       | Release not finished or wrong filename; check `src/config/releaseDownloads.ts` |
| Manual GitHub Release           | Delete bad release; push correct `v*` tag only via CI                          |


---

## Quick reference (minimal)

```bash
git checkout main && git pull origin main
# merge feature branch, bump version + CHANGELOG
npm run verify:release
git add -A && git commit -m "chore(release): bump version to X.Y.Z"
git push origin main
git tag -a vX.Y.Z -m "Openbentt X.Y.Z"
git push origin vX.Y.Z
```

---

## Related docs

- [RELEASING.md](../RELEASING.md) — CI/release workflow details
- [PRODUCTION_CHECKLIST.md](../PRODUCTION_CHECKLIST.md) — Vercel/env before ship
- [LOCAL_RELEASE_CHECKLIST.md](../LOCAL_RELEASE_CHECKLIST.md) — manual desktop UX checks

