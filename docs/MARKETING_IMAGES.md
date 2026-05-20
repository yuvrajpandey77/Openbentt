# Marketing images — filenames & AI prompts

Openbentt’s landing page loads images from **`public/marketing/`**.  
Until you add a `.webp` or `.png`, the site shows the matching **`.svg` placeholder** (already committed).

## Recommended specs

| Slot | Filename | Aspect | Size (export) |
|------|----------|--------|----------------|
| Hero (optional) | `hero-workspace.webp` | 16:9 | 1920×1080 or 1600×900 |
| Run locally | `run-locally.webp` | 16:10 | 1280×800 |
| Model arena | `model-arena.webp` | 16:10 | 1280×800 |
| Notebook | `notebook.webp` | 16:10 | 1280×800 |
| Research | `research.webp` | 16:10 | 1280×800 |
| Desktop GGUF | `desktop-gguf.webp` | 16:10 | 1280×800 |

**Format:** WebP (quality ~85) or PNG. Keep files under ~400 KB each when possible.  
**Style:** Real product screenshots beat AI art. If you use AI, match teal accent `#0d9488` / `#14b8a6`, clean UI, no fake logos.

---

## Option A — Real screenshots (best)

1. Run `npm run dev`, open the app at 1280×800 or use a 1440p window.
2. Capture:
   - **run-locally:** `/chat` with a thread, model pill visible, one assistant reply streaming or complete.
   - **model-arena:** Settings → enable comparison, send one prompt, show 2–4 columns.
   - **notebook:** `/notebook` with Source + Preview or split view.
   - **research:** `/chat` with research on + sources panel in a message.
   - **desktop-gguf:** Desktop app Labs → local model hub with a download row (or Settings GGUF picker).
   - **hero-workspace:** Wide crop of chat + sidebar (hide personal data).
3. Crop to 16:10, slight rounded corners optional (page adds border-radius).
4. Save as the filenames above into `public/marketing/`.

---

## Option B — AI image prompts

Use the same filenames when exporting. Add to every prompt:

> Clean modern SaaS UI screenshot style, soft shadows, teal accent color #0d9488, light gray background, no watermarks, no third-party logos, fictional app name "Openbentt", high resolution, photorealistic monitor mockup, 16:10 composition.

### 1. `hero-workspace.webp`

```
Wide hero banner of a desktop productivity app for AI chat. Left sidebar with thread list labeled "Paper draft" and "Model compare". Main area shows a user message and a long assistant reply with subtle streaming indicator. Top bar shows model chips "claude-sonnet · openrouter". Teal accent buttons, white and slate UI, professional Notion/Linear quality, 16:9, no browser chrome clutter.
```

### 2. `run-locally.webp`

```
Screenshot-style image of an AI chat application dark mode optional. Single conversation with code-friendly assistant answer, attachment chip for PDF, composer at bottom with send button. Sidebar shows Openbentt logo area. Emphasize "local-first" trustworthy devtool aesthetic, teal highlights, 16:10.
```

### 3. `model-arena.webp`

```
UI mockup showing four vertical columns side by side, each headed with a different model name (e.g. Model A, B, C, D), same user question at top, four different assistant answers below. Small latency labels under headers "1.2s · 412 tokens". Clean grid layout, comparison feature for developers, teal accent on active column, light theme, 16:10.
```

### 4. `notebook.webp`

```
Split-screen academic workspace: left pane LaTeX source code with \documentclass and \section, right pane PDF preview of a research paper. Top tabs "Source" and "Preview". Button "Apply reply" visible. Research/lab aesthetic, teal accent, white UI, 16:10.
```

### 5. `research.webp`

```
Chat interface with expandable "Sources" section listing Wikipedia and arXiv-style citations under an assistant message. Toggle or badge "Research" enabled. Muted cards for each source title and snippet. Dark or light theme, teal accent, credible research tool, 16:10.
```

### 6. `desktop-gguf.webp`

```
Desktop app screen for downloading AI models: list of GGUF files from Hugging Face with progress bar, file size, "Download" buttons. Section title "Local model hub". Linux or cross-platform desktop window frame subtle. Teal primary buttons, offline/local emphasis, 16:10.
```

---

## Option C — Abstract marketing art (if screenshots are not ready)

Softer illustrations without fake UI text:

```
Abstract 3D illustration, floating laptop with chat bubbles and document pages, teal and slate color palette, soft gradient background #f4f7f9, minimal, no text, suitable for SaaS hero, 16:10.
```

Use one illustration per feature with the same palette for consistency.

---

## Dark mode variants (optional)

If you ship dark marketing assets, use `-dark` suffix and extend `marketingImages.ts` later, e.g. `run-locally-dark.webp`. Not wired by default.

---

## After adding files

1. Place files in `public/marketing/`.
2. Hard-refresh the landing page (cache).
3. No code change needed if filenames match the table above.

To add a new slot: edit `src/config/marketingImages.ts` and `showcaseBlocks` in `src/config/marketingContent.ts`.
