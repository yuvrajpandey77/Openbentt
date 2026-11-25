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

Keys used by Orchestra (unchanged upstream):

- `GEMINI_API_KEY` or `VERTEX_AI_PROJECT` + `VERTEX_AI_LOCATION`
- `OPENAI_API_KEY`
- `SEMANTIC_SCHOLAR_API_KEY`

Openbentt may inject these from the desktop secret vault when set; Orchestra’s own
`.env` in this folder still works as fallback.

## CLI (unchanged)

```bash
python paper_writing_cli.py \
  --raw_materials_dir /path/to/raw_materials \
  --latex_template_dir templates/cvpr2025 \
  --output_dir /path/to/output \
  --use_plotting true
```
