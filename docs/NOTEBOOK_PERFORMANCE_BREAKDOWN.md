# Notebook performance breakdown (Phase C)

This report describes **measured** Notebook startup phases, not optimization
results. No load path was restructured to make a number look better; this
batch added instrumentation and a repeatable CDP harness, then wired the two
previously missing project-load hooks.

Generated: 2026-11-24 · raw JSON: `/tmp/opencode/notebook-profile-final.json` ·
schema: `openbentt.notebook.profile.v1`.

## What is instrumented

`src/lib/perf/notebookMarks.ts` records real `performance.mark()` entries and
mirrors them into `window.__openbenttNotebookMarks`. Native mark names are
`openbentt.notebook.<key>`; collector names are the stable labels below.
`markOnce()` keeps the first occurrence, so repeated visits do not overwrite
the start of a scenario. The collector is installed at renderer entry
(`src/main.tsx`), so startup project loads are captured before any route mounts.

| Stable mark | Emitted by | Fidelity / caveat |
| --- | --- | --- |
| navigation initiated | `src/layouts/AppLayout.tsx` `handleNavigate` before Notebook navigation; the CDP harness also calls the same helper as a fallback | Real click proxy; `markOnce()` prevents double counting. |
| route mounted | `ResearchWorkspaceProvider` (Notebook route) with `NotebookPdfWorkspace` as fallback | Commit-time effect on the real route. |
| project loading started | `src/context/ResearchProjectContext.tsx` `loadProjectWithMarks()` around startup load, no-active fallback, and project switching | Covers the real `loadResearchProject()` path. |
| database response received | Same wrapper, after `loadResearchProject()` resolves | IPC round trip only; no time is estimated. |
| project data hydrated | `NotebookPdfWorkspace` when `researchProject.id` is available | React commit after the project is in context. |
| editor initialized | Callback ref on the real `NotebookLatexEditor` wrapper (studio) / Source textarea (tabs) | DOM mount, not an async CodeMirror-ready signal. |
| PDF.js loaded | `pdfText.getPdfJs()` on successful dynamic import, or co-located with `openPdfDocument()` in `NotebookStudioPreview` | The studio viewer owns its own import, so its stamp is an upper bound at `openPdfDocument()` resolution. |
| PDF document opened | `NotebookStudioPreview` after `openPdfDocument()` resolves | Includes pdf.js module load + `getDocument()`. |
| first page rendered | `NotebookStudioPreview` after `renderPdfPage()` resolves (studio), or after `renderPdfPages()` resolves (tabs) | Canvases exist in the DOM before the promise resolves; render cancellation is guarded by generation counters. |
| first meaningful notebook content displayed | `NotebookPdfWorkspace`, double `requestAnimationFrame` after real editor/preview/draft content is committed | Paint-opportunity proxy, not a browser frame-timing API. |
| notebook interactive | `NotebookPdfWorkspace`, `requestAnimationFrame` after content + editor (+ first PDF page when a PDF is open) | Definition only; it never gates input. |

`performance.measure()` entries named `openbentt.notebook.segment.<key>` are
also emitted for adjacent phase pairs. Missing marks are reported as `null`
rather than estimated.

## Reproduce

The app must be built first — CDP attaches to the Electron app loading
`dist/index.html`. Each scenario launches its own process with a free debug
port and an isolated `--user-data-dir`, seeds the research DB through the app's
own IPC, and separates a cold navigation from a warm one in the same renderer.

```bash
npm run build
node scripts/perf/notebook-profile.mjs /tmp/opencode/notebook-profile-final.json
# optional: comma-separated subset, e.g.
node scripts/perf/notebook-profile.mjs /tmp/opencode/notebook-profile-final.json empty,pdf-heavy
```

Read a breakdown directly from a live renderer:

```js
window.__openbenttNotebookMarks.getBreakdown()
window.__openbenttNotebookMarks.getEntries()
window.__openbenttNotebookMarks.navigationInitiated({ source: "AppLayout sidebar" })
```

## Measured results

One sample per phase (single run, software rendering, Wayland/Chromium in this
workspace). All durations are milliseconds from the renderer's `performance.now()`
timeline, copied by CDP from the collector — not stopwatch estimates.

| Scenario | nav → route (cold / warm) | route → hydrated (cold / warm) | content → interactive (cold / warm) | nav → interactive (cold / warm) | route → interactive (cold / warm) |
| --- | --- | --- | --- | --- | --- |
| empty (default project, 0 papers) | 183.8 / 116.2 | 0.1 / 0.0 | 15.1 / 38.7 | 264.5 / 203.6 | 80.7 / 87.4 |
| existing (~24.5k draft chars) | 175.1 / 82.7 | 0.2 / 0.0 | 12.2 / 31.0 | 258.9 / 151.0 | 83.8 / 68.3 |
| large (~400.4k draft chars) | 194.4 / 106.0 | 0.0 / 0.0 | 25.6 / 23.7 | 328.3 / 207.3 | 133.9 / 101.3 |
| PDF-heavy (~24.5k chars + 24-page PDF) | 209.1 / 93.1 | 0.1 / 0.0 | 38.8 / 34.5 | 338.5 / 164.8 | 129.4 / 71.7 |

The harness resets the collector before each navigation, so the startup
project load is captured separately into `runs[].startupLoad` before the reset.
Those measurements are:

| Scenario | startup `databaseRoundTrip` |
| --- | --- |
| empty (default project) | 4.7 ms |
| existing (~24.5k draft chars) | 2.4 ms |
| large (~400.4k draft chars) | 5.3 ms |
| PDF-heavy (1 paper / 24 pages) | 14.1 ms |

`databaseResponseToHydrated` is `null` in this run because the startup project
hydrates before the harness attaches the `projectDataHydrated` observer; it is
not inferred. During warm navigation the project is already in context, so no
new DB round trip is emitted — the reported warm intervals are route/CDP work,
not database time.

PDF-heavy scenario, after opening the seeded paper via the app's `?paper=`
route (collector reset first, so earlier navigation work is excluded):

| Segment | Duration |
| --- | --- |
| PDF.js loaded → PDF document opened | 0.0 ms |
| PDF document opened → first page rendered | 48.4 ms |
| navigation initiated → notebook interactive | 244.3 ms |

The final run recorded zero page errors, zero scenario errors, and zero
mark-wait timeouts across all four scenarios.

## Where the time goes

- **Largest measured segment:** navigation initiated → route mounted
  (82.7–209.1 ms). This includes sidebar event handling, React Router work,
  and lazy chunk load/first mount. It is the only candidate bottleneck visible
  in this data.
- Route mounted → hydrated is effectively instantaneous (0–0.2 ms) once the
  project is already in context.
- Content → interactive is 12.2–38.7 ms; the large draft (400k chars) costs
  ~13 ms more than the 24.5k draft on the cold path.
- Opening the PDF adds ~48 ms for the first rendered page after the document
  is opened; PDF.js itself was already loaded in this sample.

These are single-sample observations on one machine. They identify where to
look next; they do **not** justify a general performance target or an
optimization claim. Repeated cold/warm runs and a packaged build are needed
before changing the load path.
