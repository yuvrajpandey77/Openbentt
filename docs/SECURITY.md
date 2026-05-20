# OpenBenTT / Openbentt — Security & privacy

This document describes what stays on the device, what can leave it, and the trust boundaries for the desktop and web clients.

## Trust boundaries

| Layer | Trust level | Notes |
|-------|-------------|--------|
| **Electron main process** | High | Holds `safeStorage` secrets, research SQLite, PDF files on disk. Not exposed to arbitrary web content. |
| **Preload (`contextBridge`)** | Medium | Fixed IPC surface only — no Node in the renderer. |
| **Renderer (React)** | Untrusted | Treat all user input, PDF text, LaTeX, and shared URLs as hostile. |
| **Third-party APIs** | External | OpenRouter, Anthropic, Google, Brave, Wikipedia, Semantic Scholar, Jina, Hugging Face CDN, optional research/LaTeX proxies. |

## Electron hardening

Configured in `electron/main.mjs`:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- Custom `app://` handler resolves files only under `dist/` (`electron/ipcValidate.mjs` → `resolveUnderDistRoot`)
- Single-instance lock

Preload exposes only: `openbenttDesktop`, `openbenttLocalGguf`, `openbenttSecrets`, `openbenttResearch`, `openbenttZotero`.

Research IPC validates project/paper IDs and PDF base64 size before writing under `userData/research-projects/`.

## Secure storage path (desktop)

| Secret / data | Location |
|---------------|----------|
| Provider API key | `userData/.secrets/provider-api-key.blob` (or `.secret` fallback) |
| Brave Search key | `userData/.secrets/brave-search-api-key.blob` |
| Hugging Face token | `userData/.secrets/hf_token.blob` |
| Zotero API key | `userData/.secrets/zotero_api_key.blob` |
| Research DB + PDFs | `userData/research-projects/research.db`, `…/{projectId}/papers/` |

On Linux, `userData` is typically under `~/.config/Openbentt/` (app name from Electron).

Encryption uses Electron **`safeStorage`** (OS keychain / Secret Service) when available; otherwise a `0o600` plaintext fallback file is written with a console warning.

**Not** stored in `localStorage` on desktop: `apiKey`, `braveSearchApiKey`, `huggingFaceToken` (migrated on load).

## Privacy settings

Stored in `localStorage` key `openbentt-privacy-v1` (non-secret toggles only):

| Setting | Default (desktop) | Effect |
|---------|-------------------|--------|
| **Local-only mode** | On | Blocks cloud inference, network research, share links; syncs `apiConfig.offlineFirst`. |
| **Cloud inference opt-in** | Off | Requires explicit enable before OpenRouter / vendor APIs / remote compatible URLs. |
| **Usage analytics** | Off | Vercel Analytics component not mounted unless enabled. |
| **Share run links** | Off when local-only | Blocks URL hash snapshots; PDF text redacted when sharing is allowed. |

UI: **Settings → Privacy**.

Implementation: `src/lib/privacy/privacyPreferences.ts`, `src/lib/offline/mode.ts`.

## Telemetry behavior

| Source | Default | Data sent |
|--------|---------|-----------|
| **Vercel Analytics** | Off | Page views / Web Vitals to Vercel when user opts in (`PrivacyAnalytics.tsx`). |
| **Crash / error reporting** | None | Sentry not integrated; errors stay in DevTools / OS logs. |
| **Model providers** | User-driven | Full prompts + completions when cloud provider is used (BYOK). |

No silent background telemetry beyond what the user configures.

## What is local

- Chat history (`openbentt-chats` in `localStorage` on all platforms)
- Research projects (SQLite + PDFs on desktop; `localStorage` on web)
- On-device inference (WebGPU Gemma, desktop GGUF via `127.0.0.1`)
- PDF parsing (`pdfjs-dist` in the renderer)
- LaTeX compile via BusyTeX WASM (unless `VITE_LATEX_COMPILE_URL` is set)
- Embeddings index (MiniLM in-browser; model weights cached after first download)

## What can be sent externally

When **local-only** and **cloud opt-in** allow it:

| Destination | Trigger |
|-------------|---------|
| OpenRouter / OpenAI / Anthropic / Google | User sends chat with cloud provider + API key |
| OpenAI-compatible URL | User-configured base (loopback allowed in local-only) |
| Wikipedia, Semantic Scholar, Jina reader | Research enabled + network allowed |
| Brave (via proxy) | Research proxy + server-side key |
| Hugging Face Hub | GGUF download, embedding model CDN, gated models |
| Research / LaTeX proxy | User-configured HTTPS URLs |
| Share URL recipients | User copies link; chat in URL hash (PDF text redacted) |
| GitHub | Desktop auto-update (packaged builds only) |

## Input safety

- **PDF**: Size/page caps (`src/lib/pdfText.ts`); extracted text wrapped in `[UNTRUSTED_DOCUMENT_*]` boundaries (`src/lib/security/documentPromptGuard.ts`).
- **Prompt injection**: Pattern warnings on document text; instructions treat document blocks as untrusted.
- **LaTeX preview**: KaTeX with `trust: false`, `strict: "warn"` (`src/lib/security/safeRender.ts`).
- **Chat markdown**: `react-markdown` (no raw HTML from model by default).
- **Logs**: `redactForLogs()` helper for dev logging of objects containing key-like fields.

## Web client caveats

In a normal browser tab, API keys remain in `localStorage` (visible in DevTools). Use the **desktop app** for OS-backed secret storage. Deploy with CSP and HTTPS per `PRODUCTION_CHECKLIST.md`.

## Reporting issues

Do not commit `.env`, API keys, or tokens. For vulnerabilities, contact the maintainers privately before public disclosure.
