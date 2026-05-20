# Research workspace — Phase A audit (Openbentt)

**Date:** 2026-05-20  
**Scope:** Phase A — Quality & automation (`docs/research-workspace-roadmap.md`)

## Checklist

| # | Requirement | Evidence |
|---|-------------|----------|
| A1 | Auto-rebuild semantic index after PDF upload | `ResearchProjectContext.uploadPaperPdf` → `runSemanticRebuild`; `updateProject({ papers })` also triggers rebuild |
| A2 | Cancel in-flight rebuild | `cancelSemanticIndexRebuild` + `buildChunkEmbeddings(..., signal)` + `ResearchTaskStatus` progress UI |
| A3 | Caption chat parser → apply `\caption{}` | `parseCaptionSuggestions`, `ResearchWritingSync`, **AI assist** panel **Apply caption** + `applyCaption` |
| A4 | PDF annotation extraction | `extractPdfReviewAnnotations` at upload; Review **Import PDF annotations** |
| A5 | Citation graph ↔ project bib | `CitationGraphPanel` + `bibEntriesFromGraphNodes` + `buildCitationGraphFromBib` |
| A6 | E2E regression | `e2e/research-workspace.spec.ts` — notebook tabs, TF–IDF, submit, graph button |

## Commands

```bash
npm run test:unit          # includes parseWritingAssist, citationGraphSync, latexTools
npm run test:e2e:install   # once per machine
npm run test:e2e           # needs dev server or CI webServer
```

## Desktop note

Library PDF upload + auto-index runs on Electron (`/labs`) and web `/notebook` project corpus. E2E seeds `localStorage` for web `/notebook` only.
