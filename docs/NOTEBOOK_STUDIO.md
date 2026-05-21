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

## Known gaps (not blocking core flow)

- Shared projects / import ZIP — not implemented
- Thumbnails capped at 24 pages
- Web notebook intentionally disabled

## Dev run

```bash
npm run electron:dev
```

Opens Vite + Electron; hot reload on save.
