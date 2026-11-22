# Openbentt user manual

Desktop-first AI workspace for chat, research projects, and LaTeX Notebook.

## Quick start

1. Launch **Openbentt** (`openbentt` or the AppImage).
2. Open **Settings** (sidebar) → confirm a model:
   - **Local (recommended):** Ollama running with at least one model, *or* a GGUF in the local hub.
   - **Cloud (optional):** OpenRouter / OpenAI / Anthropic / Google — only if you want cloud models.
3. You do **not** need an OpenRouter key to use Ollama or local GGUF. If Ollama is ready and no cloud key is set, Openbentt switches to local automatically.
4. Use **New chat** or open **Projects** → create/import a project → **Notebook** to write and compile.

## Sidebar

| Item | What it does |
|------|----------------|
| **New chat** | Starts a blank conversation |
| **Chat** | Home chat |
| **Projects** | Research project hub (PDFs, RAG, Notebook) |
| **Notebook** | LaTeX editor + PDF preview |
| **Settings** | Models, agents, updates, privacy |
| **More** | Documents, Research labs, Files, Tasks, Agent, Diagnostics |

Unfinished or niche tools stay under **More** so the main rail stays short.

## Chat

- Type in the composer and press **Enter** to send (**Shift+Enter** for a new line).
- Attach files with the paperclip when the provider supports multimodal input.
- Model picker lives near the composer / Settings — pick Ollama, GGUF, or a cloud provider.

## Projects & Notebook

1. **Projects → New** — blank, template, or **Import** (`.tex` / `.bib` / `.zip` / folder).
2. Open the project → **Notebook** to edit `main.tex`, bibliography, and project files.
3. **Compile** uses BusyTeX → local TeX → remote HTTP → text PDF fallback.
4. Upload PDFs into the project library for hybrid RAG (lexical + embeddings).

### Importing from Prism / Overleaf

OpenAI Prism is shutting down (~1 Jan). Export a ZIP (or copy the folder) → **Projects → New → Import**.

### Zotero

Connect under Notebook tools / Integrations when you need library sync.

## Local AI vs cloud

| Goal | Do this |
|------|---------|
| Fully local | Install [Ollama](https://ollama.com), pull a model, leave Settings on **OpenAI-compatible** / Ollama URL |
| Offline GGUF | Desktop → Settings / Labs hub → download GGUF → select **local_gguf** |
| Cloud models | Add API key for OpenRouter (or vendor) in Settings |

Openbentt never requires a cloud key just to open the app or use local inference.

## Agents

**Settings → Agents** scans PATH for OpenCode, Claude Code, Codex, Cursor, Aider, Gemini. Prefer any detected agent. Approvals still apply.

## Updates

**Settings → Desktop app updates** → Check / Download / Restart & install (packaged builds).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| “Need API key” with Ollama running | Settings → provider **OpenAI-compatible**, base `http://127.0.0.1:11434/v1`, pick a listed model |
| Notebook feels stuck after heavy typing | Draft saves without re-embedding every keystroke (v2.5.x+). Restart once if an old build was mid-index |
| App window closes on Linux | Often renderer OOM / GPU; app quits when the last window closes. Prefer software-safe mode; avoid huge PDF + compile + full re-embed at once |
| AppImage needs FUSE | `APPIMAGE_EXTRACT_AND_RUN=1 ./Openbentt-*.AppImage` or run `release/linux-unpacked/openbentt` |

## More docs

- [Setup guide](./SETUP_GUIDE.md)
- [Release notes v2.5.0](./releases/v2.5.0.md)
- In-app: **`/news`** on the marketing site
