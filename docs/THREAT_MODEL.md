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

Renderer reaches main only through **`electron/preload.cjs`** (`contextBridge`). Audited surfaces (9):

| Global | Purpose |
|--------|---------|
| `openbenttDesktop` | Version, auto-update |
| `openbenttLocalGguf` | llama-server, HF downloads |
| `openbenttNarration` | Phase 12: read-aloud status/model ensure/synthesize + progress event only; no filesystem, exec or generic IPC |
| `openbenttPaperOrchestra` | Intact PaperOrchestra Python CLI: status/venues/start/cancel/importArtifacts + progress events; spawn confined to vendored tree; no generic exec |
| `openbenttSecrets` | Provider / Brave vault |
| `openbenttResearch` | SQLite projects, jobs, embeddings, snapshots |
| `openbenttZotero` | Zotero sync, BBT watch |
| `openbenttOllama` | Phase 9: Ollama status/tags/ps/pull on loopback only; model-name allowlist; installer flow opens the official download URL and verifies — never downloads+executes binaries |
| `openbenttAgent` | Phase 10/11: OpenCode task/session/permission IPC + OmniRoute runtime/model IPC; capability-specific only — no `execute`/`spawn`/`readFile`/`writeFile`/`request`; every sensitive op goes through `actionStore` approvals. Phase 12 adds narrow `voice:*` methods on the same surface (sessions, PCM16 chunks ≤256 KiB, speak ≤4000 chars); transcripts are untrusted input; voice cannot approve |

Related asset (not a preload global): `userData/voice-models/` — transformers cache (Whisper ONNX); post-consent download only; missing/corrupt → DEGRADED, never executed as code.

**Not exposed to renderer** (main-only): `research:storePaperPdfPath` — path copy with `userData` allowlist.

Validation: `electron/ipcValidate.mjs` (IDs, PDF base64 size, dist-root paths, llama binary allowlist).

CI gate: `npm run lint:electron-security` — asserts `nodeIntegration: false`, `contextIsolation: true`, the 9-bridge count, that IPC authorization is installed before service registration, that the trusted window is registered, and that all IPC registrations/channels have a policy entry (plus `npm run test:security` for the 16 runtime enforcement tests and `npm run audit:ipc` for the generated coverage report).

### Renderer-origin authorization: enforced (Phase 3)

Every `ipcMain.handle`/`on`/`once`/`handleOnce` registration is wrapped by `installIpcAuthorization(ipcMain)` before services register. Requests must come from the single main-owned `BrowserWindow`, from its main frame, from `app://openbentt` (or the configured Vite loopback origin in development), with a policy-listed channel, valid payload schema, and a main-issued channel-scoped capability grant. There is no renderer API or IPC channel that can add or escalate a capability. Unknown channels, child frames, wrong origins, unregistered windows, invalid/oversized payloads, unapproved execution evidence, and unauthorized workspace roots are rejected before the service runs. See [IPC_AUTHORIZATION_ARCHITECTURE.md](./IPC_AUTHORIZATION_ARCHITECTURE.md) and the generated [IPC_SECURITY_COVERAGE.md](./IPC_SECURITY_COVERAGE.md).

Compensating controls still enforced in main:

- `desktop:openPath` accepts only absolute paths and requires an explicit native confirmation dialog naming the target; the OS handler result is returned to the caller.
- `documents:ocr` accepts renderer-named image files only inside `userData` or the OS temp directory; base64 byte input is the normal path.
- LaTeX `mainPath` is confined to the project directory (no traversal); llama `binaryOverride` must match the bundled-binary allowlist.
- External URLs and navigation are restricted by `externalUrlPolicy.mjs` / `navigationPolicy.mjs`.
- Approval-gated writes use single-use `actionStore` approvals; workspace roots must be vouched for by a main-owned picker/resolve/default/task result and are canonicalized with `realpath()` before comparison.
- The bridge exposes no generic `execute`, `spawn`, `readFile`, `writeFile` or `request` primitive.

Residual risk: a compromised *trusted* renderer can still invoke the intentionally exposed channels. Origin/frame authorization does not make the trusted UI itself trustworthy; further reduction requires moving more user-mediated operations into main.

### Persistence integrity (Phase B)

Research writes use an explicit `clean → pending → saving → failed` state
machine, serialized atomic temp-write + fsync + rename, generation-based
coalescing, bounded retries, and a main-owned `flushPersistence()` /
`retryPersistence()` path. Failures preserve in-memory state, surface a UI
banner via `research:persistenceStatus`, and never fall back to destructive
overwrites. Backups are validated before use. Fault injection for disk-full,
permission-denied, interrupted write, invalid DB, backup corruption, shutdown
mid-write, repeated failures, and concurrent modifications is covered by 17
tests in `electron/researchDb.test.mjs`. Remaining risk: filesystem-level
power-loss durability and non-research writers are not covered.

### Packaged recovery evidence (Phase E)

The packaged Linux runtime was exercised with strictly isolated profiles:
clean first start, synthetic v5→v14 migration, SIGKILL during in-flight draft
writes followed by successful reopen, and invalid-DB recovery from a validated
`.bak` all passed (19/19 checks). No real user profile was used. AppImage
self-execution, `.deb`, and Windows/macOS installers remain unverified here;
the exact artifact and limitations are recorded in
[PACKAGED_INSTALLATION_UPGRADE_REPORT.md](./PACKAGED_INSTALLATION_UPGRADE_REPORT.md).

## Filesystem

| Path | Writer | Risk |
|------|--------|------|
| `userData/research-projects/{id}/papers/` | `storePaperPdf` (base64) | PDF bomb → size cap in IPC |
| `userData/.secrets/` | secret vault IPC | Renderer can set keys user supplies |
| `dist/` via `app://` | static handler only | Traversal blocked by `resolveUnderDistRoot`; assets are read from disk with explicit MIME types instead of `net.fetch(file://…)`, removing intermittent `ERR_FAILED` on lazy route chunks under sustained navigation |
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
