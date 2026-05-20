# Local release checklist — test before you tag

Use this **on your machine** before `git push origin vX.Y.Z`. Check boxes as you go. Estimated time: **45–90 minutes** (full pass).

**Automated gate (run first):**

```bash
cd /path/to/SecuredChatCogerphere
npm ci
npm run lint
npm run test          # Vitest + electron llama binary smoke
npm run build
```

All must pass with no errors.

---

## A. Web app (browser)

Start dev server:

```bash
npm run dev
# Open http://localhost:8080
```

| # | Test | Pass? |
|---|------|-------|
| A1 | Landing `/` loads; logo and copy visible | ☐ |
| A2 | `/setup` — pick **OpenRouter**, enter a valid key, land on `/chat` | ☐ |
| A3 | Send a message → **streaming** assistant reply appears | ☐ |
| A4 | Model picker lists models **without** requiring key on fresh profile (incognito) | ☐ |
| A5 | **Settings** → change model, dark mode toggles | ☐ |
| A6 | New thread + thread search highlights a word in messages | ☐ |
| A7 | Attach a small **image** → send → model sees it (vision model) | ☐ |
| A8 | Enable **comparison** (2 models) → one prompt → two columns stream | ☐ |
| A9 | `/download` page shows GitHub release links (not 404 URLs) | ☐ |
| A10 | `/share` — export share link from a thread → open in new tab → read-only view | ☐ |

---

## B. Workspaces (web)

| # | Test | Pass? |
|---|------|-------|
| B1 | Sidebar → **Notebook** opens; upload or edit LaTeX | ☐ |
| B2 | Sidebar → **Research labs** — Papers, Bibliography (citation graph), Synthesis | ☐ |
| B2a | **Notebook → Citations** — Build graph from bib → Import S2 papers (network) | ☐ |
| B2b | **Notebook → Similarity** — add PDF in Library; semantic index auto-rebuilds; Cancel works | ☐ |
| B2c | **Notebook → Review** — Import PDF annotations after uploading annotated PDF | ☐ |
| B2d | **Notebook → Write** — AI caption → Apply caption patches `\\caption{}` | ☐ |
| B3 | Sidebar → **LaTeX write** (`/write`) opens | ☐ |
| B4 | Sidebar → **Benchmark** — run once with API key | ☐ |
| B5 | Sidebar → **WebGPU lab** — probe runs (GPU or CPU fallback message) | ☐ |

---

## C. Desktop — development build

```bash
npm run download:llama-server   # once per machine / after clean clone
npm run electron:dev:safe       # use :safe if GPU/Vulkan issues on Linux
```

| # | Test | Pass? |
|---|------|-------|
| C1 | App window opens on **`/chat`** (not marketing 404) | ☐ |
| C2 | First run → **Setup** offers **Local GGUF (recommended)** | ☐ |
| C3 | Setup → Local GGUF → redirects to **Labs** | ☐ |
| C4 | Labs → checklist shows **llama-server** with path (ideally **bundled** badge) | ☐ |
| C5 | Labs → **Recommended** → download a small model → progress shows **% + speed + bytes** | ☐ |
| C6 | After download → **Use in chat** or Settings → pick model | ☐ |
| C7 | Send chat message → **local GGUF streams** a reply | ☐ |
| C8 | Settings → General → **Check for updates** (may say dev-only in unpackaged — OK) | ☐ |
| C9 | Launch app **twice** → second instance focuses first window (single-instance) | ☐ |
| C10 | Settings → on-device WebGPU path still works if selected | ☐ |

---

## D. Desktop — packaged build (closest to users)

```bash
npm run electron:build
# Install from release/Openbentt-*.AppImage (Linux) or run installer on Win/Mac
```

| # | Test | Pass? |
|---|------|-------|
| D1 | Installed app launches without devtools | ☐ |
| D2 | **Local GGUF chat** works without manual llama.cpp install | ☐ |
| D3 | Model file persists in app data after restart | ☐ |
| D4 | Delete model in Labs → removed from disk | ☐ |

---

## E. Regression / edge cases

| # | Test | Pass? |
|---|------|-------|
| E1 | **No model selected** (GGUF) → composer shows banner; send disabled | ☐ |
| E2 | Invalid OpenRouter key → clear error, no white screen | ☐ |
| E3 | Stop generation (square button) mid-stream | ☐ |
| E4 | Error boundary: no crash loop on bad state (optional: force via devtools) | ☐ |

---

## F. Before `git tag`

| # | Action | Done? |
|---|--------|-------|
| F1 | `package.json` **version** matches tag (e.g. `2.0.6` ↔ `v2.0.6`) | ☐ |
| F2 | `CHANGELOG.md` updated under `[X.Y.Z]` | ☐ |
| F3 | No `.env` or API keys committed | ☐ |
| F4 | `git status` clean (or only intentional release commits) | ☐ |
| F5 | Read [RELEASING.md](./RELEASING.md) — push tag triggers CI | ☐ |

**Tag and push:**

```bash
git add -A
git commit -m "chore: release v2.0.6"
git tag v2.0.6
git push origin main
git push origin v2.0.6
```

**After CI finishes:** open GitHub **Releases** → verify assets (AppImage, exe, dmg, web zip, `latest*.yml`).

---

## G. Post-release smoke (5 min)

| # | Test | Pass? |
|---|------|-------|
| G1 | Download **web zip** or open production URL | ☐ |
| G2 | Download **desktop** installer from Releases → install → open → one chat | ☐ |
| G3 | Desktop → Settings → Check for updates → “up to date” or offers new version | ☐ |

---

## Issues log (fill if something fails)

| ID | Area | What happened | Severity | Fixed? |
|----|------|---------------|----------|--------|
| | | | P0 / P1 / P2 | ☐ |

**P0** = blocks release · **P1** = ship with known issue in release notes · **P2** = follow-up

---

When A–F are checked, you are clear to push the tag.
