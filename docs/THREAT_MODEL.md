# Threat model — Openbentt desktop + web

High-level trust boundaries for the research workspace. See also [SECURITY.md](./SECURITY.md) for privacy toggles and storage paths.

## Assets

| Asset | Sensitivity | Location |
|-------|-------------|----------|
| Provider / Brave / HF API keys | High | Desktop: `userData/.secrets/*.blob` via `safeStorage`. Web: `localStorage` (DevTools-visible). |
| Zotero API key | High | Desktop: `zotero_api_key.blob` + main-process sync. Web fallback: `openbentt-zotero-web-creds` in `localStorage` (cleared on desktop connect). |
| Research SQLite + PDFs | Medium | `userData/research-projects/` (plaintext; rely on disk encryption). |
| Chat threads | Medium | `localStorage` (`openbentt-chats`). |
| Draft LaTeX / bibliography | Medium | SQLite (desktop) or `localStorage` (web). |

## Electron IPC surface

Renderer reaches main only through **`electron/preload.cjs`** (`contextBridge`). Audited surfaces (5):

| Global | Purpose |
|--------|---------|
| `openbenttDesktop` | Version, auto-update |
| `openbenttLocalGguf` | llama-server, HF downloads |
| `openbenttSecrets` | Provider / Brave vault |
| `openbenttResearch` | SQLite projects, jobs, embeddings, snapshots |
| `openbenttZotero` | Zotero sync, BBT watch |

**Not exposed to renderer** (main-only): `research:storePaperPdfPath` — path copy with `userData` allowlist.

Validation: `electron/ipcValidate.mjs` (IDs, PDF base64 size, dist-root paths, llama binary allowlist).

CI gate: `npm run lint:electron-security` — asserts `nodeIntegration: false`, `contextIsolation: true`, preload bridge count.

## Filesystem

| Path | Writer | Risk |
|------|--------|------|
| `userData/research-projects/{id}/papers/` | `storePaperPdf` (base64) | PDF bomb → size cap in IPC |
| `userData/.secrets/` | secret vault IPC | Renderer can set keys user supplies |
| `dist/` via `app://` | static handler only | Traversal blocked by `resolveUnderDistRoot` |
| GGUF models | local GGUF IPC | Downloads from user-selected HF repos |

## PDF parsing

- **Renderer**: `pdfjs-dist` extracts text for corpus + annotations.
- **Limits**: page/size caps in `src/lib/pdfText.ts`.
- **Prompt injection**: extracted text wrapped in `[UNTRUSTED_DOCUMENT_*]` (`documentPromptGuard.ts`); models instructed to treat as untrusted.

## Prompts & model calls

- User LaTeX, PDF text, Zotero notes, and chat history are attacker-controlled.
- Cloud calls (OpenRouter, etc.) only when **local-only off** and **cloud opt-in on** (or compatible loopback URL).
- Share links: PDF text redacted when sharing allowed.

## Secrets vault (desktop)

- Electron **`safeStorage`** encrypts blobs when OS keychain available; else `0o600` plaintext + console warning.
- Renderer never reads raw key material from disk — only invoke/set/clear via preload.

## Zotero credentials

| Mode | Storage | Notes |
|------|---------|-------|
| Desktop connect | `safeStorage` + main Zotero service | Web `localStorage` keys cleared on connect/mount |
| Web-only | `openbentt-zotero-web-creds` (+ `-key`) | Visible in DevTools; acceptable for browser-only use |
| Better BibTeX | Export file path in main | File watch; no API key |

## Deferred / known gaps

| Item | Status |
|------|--------|
| `chat_links` table (schema v3) | **Deferred** — thread↔project links live in `projects.linked_thread_ids` JSON; normalized table unused |
| macOS notarization / Windows Authenticode | Documented in [RELEASING.md](../RELEASING.md); CI builds unsigned |
| Full Electron E2E (packaged app) | Manual — [LOCAL_RELEASE_CHECKLIST.md](../LOCAL_RELEASE_CHECKLIST.md) §C–D |
| 500-PDF corpus proof | Optional `OPENBENTT_STRESS_PDFS=500 npm run test:stress` (not in default CI) |

## Reporting

Do not commit `.env` or keys. Report vulnerabilities privately to maintainers before public disclosure.
