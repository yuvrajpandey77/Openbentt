# PaperOrchestra inside Openbentt

This tree is the **intact** PaperOrchestra engine. Openbentt does not delete agents,
templates, autoraters, or the CLI. The desktop app drives `paper_writing_cli.py`
through Electron IPC and shows a canvas UI in Notebook.

## Local Python setup (once)

```bash
cd paper-orchestra-main
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # if present — or create .env with your keys
```

Optional env override: `OPENBENTT_PAPER_ORCHESTRA_PYTHON=/path/to/python`.

Keys used by Orchestra:

- `GEMINI_API_KEY` (optional, suggested) or `VERTEX_AI_PROJECT` + `VERTEX_AI_LOCATION`
- OpenAI-compatible: `OPENAI_API_KEY` + `OPENAI_BASE_URL` (OmniRoute / OpenCode). When Gemini is absent, Openbentt sets `OPENBENTT_PAPER_LLM_BRIDGE=openai` and maps default Gemini model names to a bridge model.
- `SEMANTIC_SCHOLAR_API_KEY` (optional; literature rate limits)

## Intended desktop flow

1. **Install Paper engine** (one-time) — Openbentt creates a userData venv and `pip install`s requirements.
2. Optionally paste a **Gemini API key** in Notebook → Paper (vault). Or rely on OpenCode/OmniRoute tokens.
3. **Auto-fill** or paste idea + experimental log; pick venue (CVPR / ICLR); optional plotting.
4. **Run** — Electron spawns `paper_writing_cli.py` with materials + env keys:
   Outline → Literature → Sections → Content refinement → PDF.
5. On success, **Apply to Notebook** imports draft TeX / bib into Editor.

Openbentt injects vault keys into the child process; Orchestra’s own `.env` in this
folder still works as fallback. Writeup failure exits non-zero so the UI does not
report a false “finished”.

## CLI (unchanged)

```bash
python paper_writing_cli.py \
  --raw_materials_dir /path/to/raw_materials \
  --latex_template_dir templates/cvpr2025 \
  --output_dir /path/to/output \
  --use_plotting true
```
