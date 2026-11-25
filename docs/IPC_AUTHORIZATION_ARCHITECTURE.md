# IPC authorization architecture (Phase 3)

## Problem

Phase 2 recorded 173 IPC registrations (159 direct `ipcMain.handle` calls plus 14 delegated through `registerDesktopWindowIpc`) covering 169 unique channels; Phase 3 added `research:persistenceStatus`, so the verified current totals are **174 registrations / 170 unique channels** (160 direct + 14 delegated). Sender/origin was used only for window targeting and progress events; possession of the preload bridge granted every capability to any renderer frame that could reach it.

## Model

`electron/ipcAuthorization.mjs` is imported and installed from `electron/main.mjs` **before** any service registration function runs. It monkey-patches `ipcMain.handle`, `handleOnce`, `on`, and `once` so every present and future handler is wrapped. There is no opt-out: a channel absent from the policy is denied at runtime and fails the static gate.

A request is accepted only when all of these hold:

1. **Policy match.** The channel exists in the centralized policy with capability, schema, and size-limit metadata.
2. **Expected window.** `event.sender` is object-identical to the `webContents` of the single `BrowserWindow` registered by `registerTrustedWindow(win)` in `createWindow()`. Window id and webContents id must both match. Unregistered windows are rejected even if they loaded the same origin and preload.
3. **Expected webContents/main frame.** `event.senderFrame` (or `sender.mainFrame`) must be alive, have `parent === null`, and match `sender.mainFrame.routingId`. Child frames (including iframes) are rejected.
4. **Trusted origin.** Both the frame URL origin and `frame.origin` must be `app://openbentt`, or the configured Vite loopback origin in development. `about:blank`, `data:`, `null`, and arbitrary HTTP origins are rejected.
5. **Capability grants.** Each required capability must be present in a grant issued by main-process code and scoped to the channel prefix. Grants are stored in a module-private `Map`; there is no IPC channel, preload method, or renderer setting that can modify them.
6. **Payload schema.** Per-channel argument validators check ids, approval tokens, op names, paths, URLs, base64/audio limits, plain-object shape, required arguments, nesting depth, and serialized size. Oversized, non-plain, or wrongly typed payloads are rejected before the service runs.
7. **Main-issued evidence.** Approval-gated operations (`agent:permission`, `computer:confirm`, `workspace:writeConfirm`, `workspace:undoConfirm`) require a well-formed main-issued `act_…` approval id. Workspace filesystem operations require a root that main has vouched for through `desktop:pickWorkspaceFolder`, `workspace:resolve`, `agent:defaultWorkspace`, or `agent:createTask`; those roots are registered by observing successful main-process results, not by trusting renderer claims. Roots are canonicalized with `realpath()` (falling back to `path.resolve()`) so equivalent spellings cannot bypass or falsely fail the check. `agent:createTask` is itself a bootstrap channel because main canonicalizes/validates `workspaceRoot` and returns the resulting root as `workspace.rootPath`.

Denials are logged through `console.error` with channel, reason, sender id, and URL, and are retained in a bounded in-memory ring (up to 200) for diagnostics.

## Capability scopes (main-issued only)

| Capability | Representative channels |
|---|---|
| `window.control` | desktop window/edit/reload/quit/clipboard/version |
| `external.path` | `desktop:openPath`, `workspace` picker, LaTeX/PDF/Zotero paths |
| `external.url` | `desktop:openExternal` |
| `workspace.fs` | `workspace:*`, `latex:*`, `agent:createTask` |
| `document.access` | OCR, PDF/asset import and retrieval |
| `research.data` | all `research:*` channels |
| `secrets.write` | secret vault, HF/Zotero secrets |
| `localBinary.exec` | GGUF server, model pulls, LaTeX compile |
| `terminal.exec` | agent runtime start/restart, tool/action execution |
| `computer.use` | `computer:*` |
| `voice.input` | `voice:*` microphone/audio/synthesis |
| `narration.audio` | `narration:*` |
| `zotero.sync` | `zotero:*` |
| `ollama.local` | `ollama:*` |
| `agent.tasks` | `agent:*`, `agents:detect` |
| `updater.control` | update check/download/install |

This is a *capability grant to the trusted main-window context*, not a renderer-controlled permission flag. Sensitive operations still pass through their existing controls: native confirmation for OS path opening, `actionStore` single-use approvals for writes/agent permissions, path allowlists for OCR/LaTeX/GGUF, and URL/navigation policies.

## Regression tests

- `electron/ipcAuthorization.test.mjs` — 16 enforcement tests: trusted request; untrusted sender; incorrect origin; iframe-origin request; invalid payload; oversized payload; unauthorized filesystem access (then authorized after main registers the root); workspace bootstrap via main-owned `workspace:resolve` (and rejection of a never-vouched root); unauthorized approval/execution request; unknown channel; wrapper applied to future `ipcMain.handle`/`on`; grant isolation; destroyed-window unregistration; canonicalized/symlinked root equivalence; `agent:createTask` root registration; real large payloads (2M-char draft, 20 MiB base64 OCR batch), empty Zotero path, and HTTPS-only external URL.
- `e2e/electron-smoke.spec.ts` — real packaged-style `app://` renderer: authorized `getAppVersion` succeeds, unregistered workspace root is rejected, and a second app-origin renderer with the same preload is rejected.
- `scripts/check-electron-security.mjs` — static gate: guard installed before registrations, trusted window registration present, every registered channel has a policy entry, no unused policy entries, no renderer `ipcMain`, no bridge capability-grant API.
- `scripts/inventory-ipc.mjs` — regenerates the full 174-registration / 170-channel coverage report (`docs/IPC_SECURITY_COVERAGE.md`).

Run:

```sh
npm run test:security
npm run audit:ipc
OPENBENTT_E2E_ELECTRON=1 npx playwright test --project=electron --workers=1 e2e/electron-smoke.spec.ts
```

## Payload contract reconciliation

A read-only audit compared every policy validator with the real preload and
service signatures. The following concrete mismatches were fixed in
`electron/ipcAuthorization.mjs`:

- Root extraction now accepts `workspaceRoot` as well as `root`, canonicalizes
  both sides, and registers the canonical root returned by `agent:createTask`.
- Size caps were aligned with the app's own limits, accounting for
  `plainValueBytes()` counting each string character as two bytes:
  `research:patchDraft` 2→8 MiB, `workspace:write` 2→8 MiB, `documents:ocr`
  32→320 MiB, and the four base64 research channels (`storePaperPdf`,
  `storeProjectAsset`, `compileProjectLatex`, `putCompileArtifact`) raised so
  main's allowed decoded PDF/asset sizes are not rejected at the guard.
- `desktop:openExternal` now requires HTTPS (matching `externalUrlPolicy.mjs`);
  `desktop:copyText` allows the full `longText` range.
- Zotero path channels accept `""` (clear configured path) and an omitted
  watch path via `pathOrEmpty`, matching main and the UI.

`registerTrustedWindow()` now returns the `webContents` id so the `closed`
handler can unregister by id; touching `win.webContents` after Electron has
destroyed the window caused an uncaught main-process `TypeError` in an earlier
run. `unregisterTrustedWindow()` also removes the window's capability grants.

## Known limitations

- A fully compromised renderer process can still call the channels intentionally exposed to the trusted main frame; the guard constrains *which frame/origin/window* may do so, not whether the trusted UI itself is malicious. Deep mitigation requires moving more operations into main with user-mediated approval, which is tracked as remaining debt.
- The custom `app://openbentt` scheme reports `frame.origin === "null"` in this Electron build. The guard accepts that only when the frame URL is the trusted scheme **and** the frame is the registered main frame; arbitrary opaque origins remain rejected.
- Synthetic unit events exercise sender/origin/frame logic directly; the E2E tests exercise a real unregistered window and real app-origin renderer. There is no separate malicious-iframe E2E because the app prohibits cross-origin frames by policy; the iframe case is covered by the synthetic frame test.
