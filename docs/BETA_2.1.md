# Openbentt Notebook Studio — Beta 2.1

**Tags:** `v2.1.0-beta.1` (templates milestone) · `v2.1.0-beta.2` (QA milestone) · `v2.1.0-beta.3` (studio UX + release)  
**Companion:** [NOTEBOOK_STUDIO.md](./NOTEBOOK_STUDIO.md)

---

## Scope (PR06–PR22 + launch polish)

| Area | Delivered |
|------|-----------|
| Forensic PDF | Highlight annotations, in-pane search, annotation list |
| PDF reading mode | Collapsible notes/annotations/thumbnails (default maximized) |
| Folder taxonomy | `ProjectFolder` migration + file tree |
| Templates | 112-entry catalog, gallery, apply pack; **projects home create-from-template** |
| Compile cache | Bundle hash, IndexedDB (web) + desktop file cache |
| Bibliography | `references.bib` in hero packs; compile hints; cite dropdown in toolbar |
| Retrieval | Hybrid v2 defaults, incremental embed pruning |
| Chat context | Multi-PDF connections (cap 10), sources popover |
| Streaming chat | Plain-text stream, pinned scroll, thinking indicator |
| Studio layout | Resizable editor/preview split; sidebar Settings/Panes footer |
| UI theme | Unified primary-purple accents across app chrome |
| M0 (PR01–05) | PDF/editor separation, corruption recovery, context meter |
| Keyboard | J/K PDF nav ignores CodeMirror editor focus |

---

## Ship checklist

1. Run `npm run verify:templates`
2. Run `VERIFY_TEX=1 npm run verify:templates:tex` (optional, needs pdflatex)
3. Run `npm run test` (unit + electron)
4. Run `npm run test:e2e` (smoke + beta spec)
5. Manual pass: [NOTEBOOK_STUDIO.md](./NOTEBOOK_STUDIO.md) production launch checklist
6. Desktop smoke: Projects → template → compile → PDF reading mode → highlight

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
| v2.1.0-beta.3 | Studio UX polish — streaming chat, purple theme, layout, templates launch |
