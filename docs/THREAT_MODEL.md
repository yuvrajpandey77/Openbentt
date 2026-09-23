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

Renderer reaches main only through **`electron/preload.cjs`** (`contextBridge`). Audited surfaces (7):

| Global | Purpose |
|--------|---------|
| `openbenttDesktop` | Version, auto-update |
| `openbenttLocalGguf` | llama-server, HF downloads |
| `openbenttSecrets` | Provider / Brave vault |
| `openbenttResearch` | SQLite projects, jobs, embeddings, snapshots |
| `openbenttZotero` | Zotero sync, BBT watch |
| `openbenttOllama` | Phase 9: Ollama status/tags/ps/pull on loopback only; model-name allowlist; installer flow opens the official download URL and verifies — never downloads+executes binaries |
| `openbenttAgent` | Phase 10/11: OpenCode task/session/permission IPC + OmniRoute runtime/model IPC; capability-specific only — no `execute`/`spawn`/`readFile`/`writeFile`/`request`; every sensitive op goes through `actionStore` approvals. Phase 12 adds narrow `voice:*` methods on the same surface (sessions, PCM16 chunks ≤256 KiB, speak ≤4000 chars); transcripts are untrusted input; voice cannot approve |
| `userData/voice-models/` | transformers cache (Whisper ONNX) | Post-consent download only; missing/corrupt → DEGRADED, never executed as code |

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

## Voice attack surface (Phase 12)

| Vector | Control |
|--------|---------|
| Mic eavesdropping / background listening | Default OFF; Chromium `media` granted only with live main-side voice grant, audio-only (camera/video refused); grant auto-clears; no hidden listeners |
| Malicious transcript ("ignore permissions…") | Classified + approval-gated exactly like typed text; injection patterns extended for spoken forms |
| Spoken "yes/allow it" as approval | No code path: `voiceService.mjs` has zero approval/execution calls (statically asserted); visual dialog remains sole authority |
| Oversized/stale audio | ≤256 KiB chunks, ≤60 s utterances, utterance binding, state checks — all fail closed |
| STT-injected secrets spoken aloud | TTS input secret-redacted (incl. spoken `key is X` forms); summaries event-derived and bounded (≤500 chars), never raw tool output |
| Raw audio exfiltration/persistence | Memory-only, zeroed after use; never SQLite/events/audit/disk/network (statically asserted: no `fetch`/URLs in voiceService) |
| STT/TTS crash → stuck mic/speech | ERROR states, deterministic stop, barge-in INTERRUPTED path, quit cleanup kills all |
| Model supply chain (Whisper ONNX) | Post-consent HF Hub download to `userData/voice-models`, never bundled/executed as code; corrupt → DEGRADED |

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
