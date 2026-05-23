# Openbentt Notebook Studio — Beta 2.1

**Tags:** `v2.1.0-beta.1` (templates milestone) · `v2.1.0-beta.2` (QA milestone)  
**Companion:** [NOTEBOOK_STUDIO.md](./NOTEBOOK_STUDIO.md)

---

## Scope (PR06–PR22)

| Area | Delivered |
|------|-----------|
| Forensic PDF | Highlight annotations, in-pane search, annotation list |
| Folder taxonomy | `ProjectFolder` migration + file tree |
| Templates | 112-entry catalog, gallery, apply pack to project |
| Compile cache | Bundle hash, IndexedDB (web) + desktop file cache |
| Retrieval | Hybrid v2 defaults, incremental embed pruning |
| Chat context | Multi-PDF connections (cap 3), sources popover |
| M0 (PR01–05) | PDF/editor separation, corruption recovery, context meter |

---

## Ship checklist

1. Run `npm run test` (unit + electron)
2. Run `npm run test:e2e` (smoke + beta spec)
3. Manual pass: [NOTEBOOK_STUDIO.md](./NOTEBOOK_STUDIO.md) beta sections PR01–PR22
4. Desktop smoke: `npm run electron:dev` → create project → template → compile → PDF highlight

---

## Known limits (beta.2)

- Annotation export / redaction not yet implemented
- Template packs are starter scaffolds — verify venue packages before submission
- Compile cache invalidates on any bundle byte change (no SyncTeX)
- Web notebook remains gated; full studio is desktop-only

---

## Version history

| Tag | Notes |
|-----|-------|
| v2.1.0-beta.1 | After PR12 — template catalog + apply |
| v2.1.0-beta.2 | After PR22 — e2e + context/retrieval/cache complete |
