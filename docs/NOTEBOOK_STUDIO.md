# Notebook studio — desktop testing guide

Desktop-only workspace at `/notebook` (opened from `/projects`). Web users see a “Get desktop app” gate.

## Layout

| Region | Role |
|--------|------|
| **Explorer rail** (left) | Files, Chats, Outline, Tools — collapsible |
| **Editor** (center) | One active text file at a time |
| **Preview** (right) | Compiled LaTeX PDF **or** selected paper PDF |
| **Chat dock** (bottom) | Collapsed composer bar; click **Chat** to slide thread up (max ~36vh) |

Research tool panels (Citations, Zotero, Notes, etc.) open in a **right-side drawer**, not over the file tree.

### Navigation (chat vs notebook)

The **chat sidebar** (`/chat`) is icon-first: logo, New chat, Projects, Library, scrollable history (initials + hover tooltips), Settings, and Clear chats. No research tools or section headers there — hover any icon for its label.

Full research tooling lives in **notebook studio → Explorer → Tools tab** (expanded list or icon column when the rail is collapsed). Pick a tool to open it in the right drawer while keeping the file tree visible.

### Chat dock behavior

- **Default:** slim composer bar only (~48px) — editor + preview get full height.
- **Chat button:** expands thread **upward** above the composer (does not permanently shrink the workspace).
- **Hide:** collapses thread again; Abstract/Keywords strip returns when chat is closed.
- Empty thread shows one line of help — not the full home-page welcome cards.

## What can be open at once?

| Item | Limit | Notes |
|------|-------|-------|
| **Editor file** | **1** | `main.tex`, `references.bib`, or one project file (e.g. `chapters/foo.tex`) |
| **Preview PDF** | **1** | Compiled output **or** one paper from `papers/` |
| **Paper library** | **Up to 500** | Stored per project; only one previewed at a time |
| **Project files** | **Unlimited** | Extra `.tex` / `.bib` paths in the tree |
| **Chats** | **Many** | Switch in rail → Chats tab; one active thread in dock |
| **Tool drawer** | **1** | One research panel visible on the right |

Switching files in the tree updates the editor immediately. Selecting a paper loads its PDF into the preview pane.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| **J** / **K** | Next / previous PDF in review queue (when not typing) |
| **⌘/Ctrl+K** | Command palette (from header) |

## File tree

- **main.tex** — primary LaTeX draft
- **references.bib** — bibliography
- **chapters/**, **figures/**, **includes/** — optional project files
- **papers/** — uploaded PDFs for proofreading
- **assets/** — images/files on disk (desktop IPC)

Use **+** to bulk-upload PDFs, **Upload asset** for images, **Add** field for new paths like `chapters/intro.tex`.

## LaTeX workflow

1. Edit source in the center pane (autosaves).
2. Click **Compile** (toolbar) — uses busytex in-browser.
3. Preview updates on the right with page navigation and zoom.

Requires `npm run download:busytex` once before first compile.

## PDF proofreading workflow

1. Upload PDFs to **papers/**.
2. Click a paper in the tree.
3. Use page controls, fit-width, zoom, thumbnails (first 24 pages).
4. Add per-page notes; **Mark reviewed**.
5. Filter queue: All / Unread / Reviewed.

## Limits (see `src/lib/research/projectLimits.ts`)

| Resource | Hard cap | Soft warn |
|----------|----------|-----------|
| Papers per project | 500 | 80 |
| Draft size | 2M chars | 400k chars |
| Bibliography | 500k chars | — |
| Semantic index chunks | 120 indexed | 100 |

## Beta launch — M0 data integrity (v2.1)

### PR14 — Compile cache storage (IndexedDB + desktop)

- [ ] Desktop stores compiled PDFs under userData compile-cache by hash
- [ ] Web uses IndexedDB `openbentt-compile-cache`

### PR13 — Compile bundle hash

- [ ] Identical compile inputs produce stable SHA-256 cache key

### PR12 — Apply template from gallery

- [ ] **Apply template** replaces main.tex (+ bib/chapters when pack includes them)
- [ ] Release target: **v2.1.0-beta.1**

### PR11 — Template gallery UI

- [ ] Explorer → **Templates** opens searchable gallery dialog
- [ ] Catalog count shown in gallery header

### PR10 — Template catalog + packs

- [ ] `public/templates/catalog.json` lists 100+ starters
- [ ] Pack JSON under `public/templates/packs/` loads via fetch

### PR09 — File tree uses folder taxonomy

- [ ] Tree folders match project `folders` labels (chapters, figures, includes, papers, assets)

### PR08 — Folder taxonomy migration

- [ ] Legacy projects gain default `folders` on load (chapters, figures, includes, papers, assets)

### PR07 — PDF search + annotation list

- [ ] **Search** toggle opens in-pane search; results jump to page
- [ ] Annotation list stub shows saved highlights below preview

### PR06 — Forensic PDF annotations

- [ ] Drag **Highlight** on PDF preview creates persisted yellow overlay
- [ ] Re-open paper → highlights still visible on correct pages

### PR05 — Context meter in studio

- [ ] Circular context ring visible beside Commands in notebook header
- [ ] Meter increases when connected LaTeX / workspace assist is large

### PR04 — Smooth PDF preview loading

- [ ] Switching papers shows **Loading PDF…** until first page renders (no stale canvas flash)
- [ ] Page changes after load use subtle spinner (canvas stays visible)

### PR03 — Corruption recovery

- [ ] Project with bad paper titles auto-repairs on load
- [ ] Corrupted main.tex shows toast with **Restore main.tex** (desktop draft history)
- [ ] Restore picks a history entry that is real LaTeX, not PDF extract

### PR02 — Raw PDF extract + clean paper titles

- [ ] Upload PDF → tree label is filename or inferred title (**no** `[UNTRUSTED_DOCUMENT…]`)
- [ ] Re-open project → paper titles still clean
- [ ] Legacy tabs mode: PDF in Source is raw text; model assist still gets trust wrappers at prompt time

### PR01 — PDF / editor separation

- [ ] Open paper from **papers/** tree → preview updates; **main.tex unchanged** in editor and on disk
- [ ] Switch between 5+ papers (J/K) → editor content stays the active LaTeX/bib/chapter file
- [ ] **Choose PDF** in studio → adds to **papers/** + preview only (no Source overwrite)
- [ ] Switch main.tex ↔ references.bib ↔ chapter tab → each file keeps its own content
- [ ] Legacy tabs notebook (non-studio): PDF can still replace Source when explicitly loaded via file picker

## Manual test checklist

### Projects hub (`/projects`)

- [ ] Desktop launch lands on All projects
- [ ] Create project → opens studio
- [ ] Import `.tex` → draft loaded
- [ ] Search / list / grid views work

### Studio shell

- [ ] Explorer rail collapses (icon-only mode)
- [ ] Tools tab opens panel on the **right** (not left)
- [ ] Command palette opens same panels
- [ ] Projects header link returns to hub

### Editor

- [ ] Switch main.tex ↔ references.bib ↔ chapter file — correct content each time
- [ ] Save status shows Saved / Unsaved / Saving

### Compile

- [ ] Compile renders PDF in preview
- [ ] No PDF.js canvas errors in console when zooming / paging

### Papers

- [ ] Bulk upload 3+ PDFs
- [ ] J/K cycles papers
- [ ] Page notes persist after reopen
- [ ] Mark reviewed updates badge in tree

### Chat

- [ ] New chat from rail
- [ ] Ask for LaTeX fix → apply from toolbar

## Compile pipeline (Phases 0–1)

- **Multi-file bundle:** Compile sends `main.tex` + `references.bib` + `chapters/*.tex` + `assets/*` to BusyTeX or local TeX.
- **Backends:** Settings ⚙️ → **All** tab → Auto (local TeX on desktop, else WASM) / Browser BusyTeX / Local TeX Live / Remote HTTP.
- **IEEE / TikZ:** Use **Local TeX Live** backend (requires `pdflatex` on PATH). WASM remains limited.
- **Assets:** Upload under **assets/** → reference `\includegraphics{assets/name.png}` → included in compile bundle.
- **Export:** Download icon in file tree → ZIP (`main.tex`, bib, chapters, assets).

## Pane settings (bottom-right ⚙️)

Fixed gear left of the chat launcher. Tabs: **All** (compile backend, document class, font), **Editor** (font size, wrap), **Preview** (zoom, text layer), **Files**, **Chat** (citation style).

## Manual test scenarios

### 1. Multi-file + BibTeX compile

1. Open a project → add `chapters/intro.tex` via file tree footer.
2. In `main.tex` add `\input{chapters/intro}` and `\bibliography{references}`.
3. Add entries to `references.bib`.
4. Click **Compile** → check toast shows bundle summary (`main.tex + references.bib + chapters/...`).
5. Preview PDF should include chapter content.

### 2. Asset figures

1. **Upload asset** → pick a PNG.
2. Click asset in tree → image preview dialog → **Copy includegraphics path**.
3. Paste into `main.tex`, compile → image appears (local TeX) or in WASM if bundled.

### 3. Compile backends

1. Open ⚙️ → set **Browser BusyTeX** → compile minimal article (should work).
2. Set **Local TeX Live** → compile IEEE template (needs TeX Live installed).
3. Set **Auto** → desktop tries local first, falls back to WASM on failure.

### 4. Editor toolbar + formatting

1. Select text in editor → click **B** / *I* → `\textbf{}` / `\textit{}` inserted.
2. Use **Section**, **Equation**, **Table** buttons.
3. ⚙️ → Editor → increase font size → editor text grows.

### 5. Error line fix

1. Add `\usepackage{algorithmic}` to preamble → Compile.
2. Red line gutter + **Fix** button → comment out line → recompile.

### 6. Floating chat + connections

1. Chat bubble (bottom-right) → drag header to move, corner to resize.
2. Drag sky dot → green tab dot → cable connects; chat gets file context.

### 7. Export project

1. File tree → **Download** icon → saves `{project}-export.zip`.
2. Unzip → verify `main.tex`, `references.bib`, `assets/`.

### 8. Per-file tabs

1. Click `references.bib` in tree → new tab.
2. Compile still uses **main.tex** bundle (toast warns if editing fragment).

## Known gaps (not blocking core flow)

- PDF text layer toggle in settings (UI present; full pdf.js text layer optional follow-up)
- SyncTeX source↔PDF jump
- Drag-to-connect only (click-to-connect works)
- Shared projects / import ZIP — export only for now
- Thumbnails capped at 24 pages
- Web notebook intentionally disabled

## Dev run

```bash
npm run download:busytex   # once, for WASM compile
npm run latex-compile      # optional, terminal 2 — full TeX HTTP fallback
npm run electron:dev
```
