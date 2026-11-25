# Openbentt manual test script (desktop)

Use the **local launcher** after install: `openbentt`  
Binary: `release/linux-unpacked/openbentt` (v2.5.8 tree with PaperOrchestra + tectonic).

Mark each item **PASS / FAIL** and note timing or errors.

---

## 0. Preflight (once)

1. Quit any old Openbentt windows.
2. Run: `openbentt` (or from app launcher).
3. Confirm window title / About shows a current build (Settings → About / version).
4. Startup should feel snappy (sidebar within a couple of seconds). No white-screen.

**PaperOrchestra Python (for full paper runs):**

```bash
cd paper-orchestra-main
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Keys in paper-orchestra-main/.env  OR Openbentt Settings API key
# GEMINI_API_KEY=...
# OPENAI_API_KEY=...
# SEMANTIC_SCHOLAR_API_KEY=...   # optional
```

Optional: `export OPENBENTT_PAPER_ORCHESTRA_PYTHON="$PWD/.venv/bin/python"`

---

## 1. Startup & shell

| # | Action | Expect |
|---|--------|--------|
| 1.1 | Launch app cold | Window opens; no crash; sidebar visible |
| 1.2 | Watch first paint | No long freeze (>5s) after window appears |
| 1.3 | Open DevTools console (Ctrl+Shift+I if enabled) | No `ReferenceError` / `is not defined` / OOM |
| 1.4 | Quit and relaunch | Warm start still clean |

---

## 2. Every primary page

Visit each route via sidebar (or URL). Stay 5–10s. Confirm content renders, no error boundary.

| # | Page | How | Expect |
|---|------|-----|--------|
| 2.1 | Chat | Sidebar → Chat | Composer + threads |
| 2.2 | Projects | Sidebar → Projects | Hub / project list |
| 2.3 | Notebook (Orchestra) | Sidebar → Notebook | **Paper canvas** (not buried in Tools) |
| 2.4 | Notebook (Editor) | Toggle **Editor** in Notebook | LaTeX editor + preview |
| 2.5 | Agent | Sidebar → Agent | Agent UI loads |
| 2.6 | Files | Sidebar → Files | File browser |
| 2.7 | Tasks | Sidebar → Tasks | Tasks page |
| 2.8 | Documents | Sidebar → Documents | Documents UI |
| 2.9 | Diagnostics | Sidebar → Diagnostics | Diagnostics |
| 2.10 | Labs / Research | Sidebar → Research | Labs |
| 2.11 | Settings | Sidebar → Settings | Provider / compile / agents |
| 2.12 | Write | Navigate `/write` if exposed | Latex workspace |
| 2.13 | Setup | `/setup` if not configured | Provider picker (GGUF option OK on desktop) |

---

## 3. Mic / voice / VoiceDock

| # | Action | Expect |
|---|--------|--------|
| 3.1 | Open Chat | VoiceDock visible or reachable |
| 3.2 | Click mic, speak a short phrase, stop | Transcript appears in **composer** (not white-screen) |
| 3.3 | Send that message (if key configured) | No crash; reply or clear error toast |
| 3.4 | Trigger read-aloud on an assistant message (if available) | Dock shows line; no `live is not defined` |

---

## 4. LaTeX compile (fast path)

Compiler default: **Auto → tectonic** (lightweight). BusyTeX is fallback only.

| # | Action | Expect |
|---|--------|--------|
| 4.1 | Notebook → **Editor** | Editor mode |
| 4.2 | Paste minimal doc: `\documentclass{article}\begin{document}Hi\end{document}` | Editable |
| 4.3 | Compile (toolbar Compile) | First ever run may download formats (slow once) |
| 4.4 | Compile again | **Warm ~0.3–1s** typical; PDF preview updates |
| 4.5 | Add `\usepackage{amsmath}` + equation; compile | PDF shows math |
| 4.6 | Settings / pane: confirm backend label mentions tectonic / Auto | Not stuck on Remote HTTP |
| 4.7 | Force BusyTeX once (optional) | Works if `public/core/busytex` present; heavier/slower OK |

---

## 5. PaperOrchestra (core)

### 5.1 Entry points open Orchestra canvas

| # | Action | Expect |
|---|--------|--------|
| 5.1 | Sidebar → Notebook | Mode = Paper / Orchestra canvas |
| 5.2 | Projects → open or create research project | Lands on `?mode=orchestra` |
| 5.3 | Library paper → “Use in Notebook” | Opens orchestra (paper id in URL OK) |
| 5.4 | Assistant panel “Write full paper with PaperOrchestra” | Opens orchestra |
| 5.5 | Toggle Paper ↔ Editor | Canvas ↔ TeX editor without crash |

### 5.2 Engine readiness

| # | Action | Expect |
|---|--------|--------|
| 5.6 | On Paper canvas, read engine hint (top-right) | Ready **or** clear venv/setup hint — not silent fail |
| 5.7 | If not ready: create `.venv` (preflight) and relaunch | Hint becomes ready |

### 5.3 Materials dock

| # | Action | Expect |
|---|--------|--------|
| 5.8 | Enter Idea (≥20 chars) | Saved (persists after refresh) |
| 5.9 | Enter Experimental log (≥10 chars) | Same |
| 5.10 | Pick venue **CVPR 2025** then **ICLR 2025** | Toggle works |
| 5.11 | Toggle **Enable plotting agent** | Stage graph shows Plotting on/off |
| 5.12 | Optional model overrides | Fields accept text; blank = Orchestra defaults |
| 5.13 | If project has library papers | Hint: “N library paper(s) attached as evidence” |

### 5.4 Full run (needs API keys)

| # | Action | Expect |
|---|--------|--------|
| 5.14 | Click **Run PaperOrchestra** | Stages animate: Outline → Literature → (Plotting) → Sections → Refine → PDF |
| 5.15 | Watch live engine log | Streaming lines; stage label updates |
| 5.16 | Optional: **Cancel** mid-run | Process stops; UI shows cancelled/error state |
| 5.17 | On success | Toast; outline inspector available; artifacts ready |
| 5.18 | **Apply to Notebook** | Switches to Editor; draft TeX + bibliography filled |
| 5.19 | Compile applied draft | PDF via tectonic (or toast about tectonic fallback if Orchestra PDF missing) |
| 5.20 | With plotting ON | Plotting stage runs; figures may appear in output dir |
| 5.21 | Inspect on disk (optional) | `userData/paper-orchestra-runs/<id>/` has outline, lit, tex, pdf |

### 5.5 Parity checklist (artifacts after a successful run)

- [ ] `outline.json` / outline text present  
- [ ] Literature agent output present  
- [ ] Raw / refined `.tex` present  
- [ ] `references.bib` applied into project bibliography  
- [ ] Final PDF path or Editor compile PDF  
- [ ] CVPR and ICLR both selectable (re-run not required if templates listed)

### 5.6 What must NOT happen

- No TS-only “fake” paper writer replacing Orchestra  
- Streamlit not required for Openbentt UX  
- Agents under `paper-orchestra-main/methods/agents/` still on disk  
- Mic / chat still work after an Orchestra run  

---

## 6. Chat / models smoke

| # | Action | Expect |
|---|--------|--------|
| 6.1 | Settings → set provider key (or local GGUF) | Saved |
| 6.2 | Chat: short “hi” | Normal reply — **not** DELETE_FILES / destructive tooling |
| 6.3 | Chat: ask a latex tweak while project open | Secondary to Orchestra for full papers |
| 6.4 | Labs: GGUF list (if used) | Models list; download UI OK |

---

## 7. Memory / stability

| # | Action | Expect |
|---|--------|--------|
| 7.1 | Visit all pages in §2 once | No OOM; heap shouldn’t climb without bound |
| 7.2 | Compile 5× in a row | Still ~sub-second warm; no leaked temp dirs flood |
| 7.3 | Run Orchestra cancel + re-run | Second start works |
| 7.4 | Leave app open 10+ min idle | Still responsive |

---

## 8. Automated helpers (optional)

From repo root:

```bash
# Routes + heap smoke (packaged)
node scripts/perf/route-smoke.mjs /tmp/opencode/route-smoke.json

# Tectonic / latexService bench
node scripts/perf/latex-compile-bench.mjs /tmp/opencode/latex-compile-bench.json

# Notebook IPC compile via packaged app
node scripts/perf/notebook-compile-smoke.mjs /tmp/opencode/notebook-compile-smoke.json

# Unit / IPC
npm run lint
npm run test:unit
npm run test:electron
npm run test:security
```

Expect warm tectonic ~300–500ms; route smoke all OK; notebook compile warm OK.

---

## Sign-off

| Area | PASS? | Notes |
|------|-------|-------|
| Install / launch | | |
| All pages | | |
| VoiceDock / mic | | |
| LaTeX compile | | |
| PaperOrchestra UI | | |
| PaperOrchestra full run | | |
| Stability | | |

Tester: ________  Date: ________  Build: linux-unpacked / `openbentt` launcher
