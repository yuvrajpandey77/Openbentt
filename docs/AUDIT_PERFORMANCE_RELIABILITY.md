# Openbentt desktop — performance, reliability & security audit (2026-11-24)

## 1. Executive summary

This audit covered the Electron main process, preload bridge, renderer bootstrap/state, the Notebook page, IPC security, packaging, and measured startup/runtime behaviour. It produced reproducible profiling harnesses, a staged set of small fixes, regression tests, and before/after measurements.

**Most important finding.** The reported full-app quit on the Notebook page could not be reproduced in this environment. The strongest static candidate was an unguarded `process.nextTick` persistence write in the sql.js research database: a synchronous filesystem error there terminates the Electron main process and takes every window with it. That path is now contained, reported via `getPersistenceError()`, and covered by a node test. The GPU-crash relaunch path, service-worker rejection, and renderer render-loop triggers were also hardened.

**Measured outcome.** Reliability and security improved; measured startup time did **not** materially improve on this machine. Warm `cdpReadyMs` stayed around 330–340 ms (baseline 329 ms) and Notebook-ready around 1.55 s (baseline 1.55 s). The browser made fewer startup resource requests (4 → 2) and no longer modulepreloads mathjs/PDF.js/charts, but total main-chunk size was essentially unchanged (4,410.7 → 4,406.6 KB). Claims of large startup wins would be dishonest; the wins here are crash containment, attack-surface reduction, and removal of unnecessary eager fetches.

All verification passes: unit 754 passed / 1 skipped, Electron node tests 218 passed / 0 failed / 2 skipped, Electron smoke E2E 2 passed (serial workers), build + CSP check + security gates pass. `npm run lint` exits 0 with 79 pre-existing warnings.

## 2. Environment and method

| Item | Value |
|------|-------|
| Host | Linux, Wayland/nvidia; app forced into software rendering at startup |
| Node | v20.20.2 (x64) |
| Electron | 32.3.3 |
| Renderer source | built `dist/`, loaded through the app's custom scheme |
| Profiling | `scripts/perf/app-profile.mjs` (CDP, Performance timings, `/proc` RSS sampling) |
| Stability | `scripts/perf/notebook-stress.mjs` (6 Chat↔Notebook cycles, resize, LaTeX compile) |
| Isolation | unique `--user-data-dir` per run; onboarding seeded via init script |
| Artifacts | `/tmp/opencode/baseline7.json`, `/tmp/opencode/final-profile.json`, `/tmp/opencode/final-stress.json`, logs under `/tmp/opencode/` |

The harnesses launch the real built app, attach over CDP, and report JSON. They are intentionally checked into `scripts/perf/` so the numbers can be reproduced rather than asserted from memory.

## 3. Measured baseline and final profile

Baseline = one recorded iteration (`baseline7.json`); final = three iterations (`final-profile.json`). Timings are milliseconds.

| Metric | Baseline | Final (3 iterations) | Interpretation |
|--------|----------|----------------------|----------------|
| `cdpReadyMs` | 329 | 530 (cold first run), 338, 332 | Warm runs unchanged; first-run variance is large |
| `pageAttachedMs` | 836 | 1152, 832, 817 | Warm runs unchanged |
| DOMContentLoaded | 374 | 405, 386, 380 | Slightly slower/noise, not an improvement |
| First paint | 218 | 220, 32, 39 | Harness/timing noise across runs |
| First contentful paint | 409 | 452, 422, 417 | Essentially unchanged |
| Sidebar ready | 994 | 1332, 1029, 973 | Warm runs unchanged |
| Notebook click → ready | 48 / 1550 | 44–60 / 1545–1562 | Unchanged |
| JS heap (chat) | 31.7 MB | 30.8–33.6 MB | Unchanged |
| Startup resource requests | 4 | 2–3 | Real reduction: eager heavy chunks removed |
| Page errors | `InvalidStateError` service worker | none | Fixed |

Process RSS (sampled mean at ~1.5 s idle): main ~204 MB, renderer ~171 MB, GPU ~100 MB — effectively the same before and after. The renderer reaches ~260–270 MB after Notebook/PDF work in both runs. This is a single-machine, small-sample result, not a fleet benchmark.

### Bundle / load changes

| Asset | Before | After |
|-------|--------|-------|
| Main entry chunk | 4,410.69 KB | 4,406.63 KB |
| recharts chunk (statically pulled into entry) | 527.59 KB | 391.01 KB and no longer statically imported by entry |
| mathjs chunk | 633.20 KB | 640.70 KB (moved to dynamic import; size unchanged) |
| `<link rel="modulepreload">` count in `dist/index.html` | 5 | 0 |
| `dist/` total | 471 MB | 471 MB |

`modulePreload: false` removes eager fetches of mathjs/PDF.js/charts in the local `app://` build. Dynamic imports still work on demand. Trade-off: web deployments lose speculative preloading of lazy route chunks, so route transitions may start slightly later in the browser.

## 4. Notebook crash investigation

Ranked hypotheses at the start of the audit:

1. **sql.js persistence failure in `process.nextTick` (highest).** `persistDb()` wrote the whole in-memory database synchronously from a next-tick callback. An I/O error there is an uncaught exception in the main process, which quits the app with no renderer error boundary involved. Now: errors are caught, stored in `getPersistenceError()`, the in-memory DB stays usable, and `schedulePersist()` has a second defensive catch. `closeDb()`/backup/restore paths are guarded too. Regression test: `electron/researchDb.test.mjs` → "persistence I/O failure is contained and recoverable".
2. **GPU crash burst relaunch.** The app relaunched itself on GPU crashes, including while a window was live. Now it only applies the software-render relaunch at startup and never calls `app.exit(0)` with a live window; `app.whenReady()` has a rejection handler.
3. **Renderer render loops.** `registerNotebookActions()` and `setSectionHeadings()` produced new object identities on every effect, re-rendering the provider and re-running the registering effect. Now the provider compares contents/keys and preserves identity; `NotebookPdfWorkspace` reads volatile editor state through a ref and depends only on stable callbacks. Regression test: `src/context/ResearchWorkspaceContext.test.tsx`.
4. **Service-worker unregister rejection.** Visible on every baseline startup (`InvalidStateError` from `app://`). Now handled with explicit rejection callbacks; absent from final profiles.
5. **Explicit `desktop:quit` IPC.** Reviewed: it is user-initiated and not called from the Notebook crash path. Not changed beyond the new confirmation policy on `desktop:openPath`.

**Honest limitation:** six stress cycles (plus three profile iterations with Notebook navigation) did not reproduce a full application quit. Root cause is therefore *strongly indicated by static evidence and fixed defensively*, not proven by a captured production crash. The new Electron smoke test asserts the app process stays alive across repeated Notebook navigation and closes no window.

## 5. Changes made

### Batch 1 — reliability / crash containment

- `electron/researchDb.mjs`: sql.js init captured (no top-level await crash), persistence and scheduled writes guarded, backup/close hardened, explicit persistence-error status.
- `electron/main.mjs`: startup GPU software-render decision only; no live-session relaunch/`app.exit(0)`; `whenReady()` rejection handling.
- `src/main.tsx`: service-worker rejection handling.
- `src/context/ChatContext.tsx`: duplicate-send ref lock and async `substituteInlineCalc` error handling.
- `src/context/ZoteroContext.tsx`: snapshot refresh loop guard.
- `src/context/ResearchProjectContext.tsx`, `src/components/ChatHome.tsx`, `src/layouts/AppLayout.tsx`: lifecycle/promise cleanup associated with the above paths. The latter two already contained pre-existing user edits; see §10 for ownership notes.
- `src/components/notebook/NotebookStudioPreview.tsx`: PDF document + worker destroyed on unmount.
- `src/components/NotebookPdfWorkspace.tsx`, `src/context/ResearchWorkspaceContext.tsx`: stable action/heading identities (see §4).

### Batch 2 — IPC / filesystem hardening

- `electron/desktopWindowIpc.mjs`: `desktop:openPath` requires an absolute path and an explicit native confirmation dialog showing the target; OS handler errors returned.
- `electron/ocrService.mjs`: `documents:ocr` path inputs confined to `userData` or the OS temp directory via `assertPathUnderRoots`; byte input remains the normal path.
- `electron/researchProjectService.mjs`: LaTeX `mainPath` traversal guard.
- `electron/localGgufService.mjs`: renderer-supplied `binaryOverride` must satisfy the bundled-binary allowlist.
- `scripts/check-electron-security.mjs`, `scripts/check-electron-pack-files.mjs`, `docs/THREAT_MODEL.md`: bridge surface count 8, sql.js WASM in pack manifest, documented residual IPC-origin risk.

### Batch 3 — renderer lazy loading

- `src/lib/mathInline.ts`: mathjs already lazy; import failure resets the cached promise.
- `src/lib/pdfText.ts`: exports a shared cached `getPdfJs()`; `src/lib/documents/pdfPageExtract.ts` now uses it instead of a top-level `import * as pdfjs`.
- `src/components/AssistantContent.tsx`: Recharts chart view is `React.lazy` and only mounted when a reply contains a chart.

### Batch 4 — bundling

- `vite.config.ts`: React runtime isolated in `react-vendor` (prevents duplicate React helpers being pulled into feature chunks) and `build.modulePreload: false`.

### Batch 5 — regression tests and toolchain

- `electron/researchDb.test.mjs`: persistence failure containment/recovery.
- `e2e/electron-smoke.spec.ts`: app stays alive across repeated Notebook navigation; documented `--workers=1` (parallel Electron launches raced for the desktop session).
- `src/context/ResearchWorkspaceContext.test.tsx`: identity/no-rerender guard.
- `package.json` / `package-lock.json`: dev-only `jsdom` pinned from `^30.1.0` to `^29.1.1`. jsdom 30 requires Node ≥22 (`webidl.util.markAsUncloneable` is unavailable on the project's Node 20), which made the entire unit suite fail during collection. Four stale `composerPlaceholder` expectations were synced to the current committed copy so the suite is green.

## 6. Security report

Audit found 173 IPC registrations / 169 unique channels, all `handle`/`invoke`; duplicate names only in mutually exclusive updater branches. Sender/origin is used for targeting and progress, **not authorization**. This remains an accepted residual risk: with `contextIsolation` and a fixed bridge, ordinary page code reaches only enumerated channels, but a renderer compromise would inherit them. `docs/THREAT_MODEL.md` now records this explicitly, together with compensating controls: confirmation dialog for OS path opening, path allowlists for OCR/LaTeX/GGUF, external URL/navigation policies, and no generic execute/read/write/request bridge. A future hardening step is per-channel sender-frame/origin allowlisting and narrower research IPC scopes.

Security gates: `node scripts/check-electron-security.mjs` and `npm run lint:electron-pack` pass.

## 7. Stability / memory observations

- Six-cycle stress run: 16 steps, zero step errors, zero page errors, zero renderer crashes; only the harness's intentional `page-close` event; app exit code 0 at teardown.
- Renderer JS heap during stress: 40.9 → 45.9 → 48.2 → 49.4 → 47.0 → 49.0 → 51.3 MB. There is an upward trend, but it is not monotonic and does not prove a sustained leak. DOM node count stayed at 454 across all Notebook visits. Longer soak tests are still recommended.
- PDF viewer teardown and reader-audio listener cleanup are the two remaining lifecycle areas worth another pass (audio cleanup not changed in this batch).

## 8. Verification results

| Check | Result | Log |
|-------|--------|-----|
| `npm run build` (incl. CSP postbuild) | pass | `/tmp/opencode/build-final.log` |
| `npm run lint` | exit 0, 79 pre-existing warnings | `/tmp/opencode/lint-final.log` |
| `npm run test:unit` | 140 files, 754 passed, 1 skipped | `/tmp/opencode/unit-final.log` |
| `npm run test:electron` | 220 tests, 218 passed, 2 skipped, 0 failed | `/tmp/opencode/electron-tests-postdeps.log` |
| `OPENBENTT_E2E_ELECTRON=1 npx playwright test --project=electron --workers=1 e2e/electron-smoke.spec.ts` | 2 passed | `/tmp/opencode/e2e-smoke-final-serial.log` |
| `app-profile.mjs` ×3 | pass, no page errors | `/tmp/opencode/final-profile.json` |
| `notebook-stress.mjs` ×6 | pass, no crashes | `/tmp/opencode/final-stress.json` |
| Electron security + pack gates | pass | console output |

## 9. Remaining debt / recommendations

1. **Startup architecture:** the entry chunk is still ~4.4 MB; the entire provider stack (`ChatContext`, `LocalAI`, `Zotero`, `ResearchProject`, toasts, AppLayout) is eager. Splitting cold-only providers behind route-level boundaries is the next high-impact, higher-risk change.
2. **IPC authorization:** implement per-channel origin/sender checks and workspace-scoped research channels; the current design relies on the bridge as the boundary.
3. **Renderer state:** OpenRouter API key is still part of a query key (cache identity concern); Ollama status polls every 90 s; OpenCode duplicate detection/`ensure` logic deserves another pass; narration audio listeners need explicit cleanup on unmount.
4. **Packaging:** `dist/` is 471 MB (`dist/core/busytex` 435 MB), AppImage ~876 MB, `app.asar` ~1.1 GB. `sql.js/**/*` packaging is broad (~31 MB local); narrow it to the runtime files.
5. **Data integrity:** persistence failures are now reported but not automatically retried or surfaced in the UI. Consider a visible "unsaved research changes" state using `getPersistenceError()`.
6. **Profiling limits:** one machine, software-rendered Wayland, 1–3 iterations. Validate on Windows/macOS and packaged builds before claiming general performance targets. Longer memory-soak and real-user crash telemetry are still needed.

## 10. Change ownership / git state

All work is uncommitted; no commits, pushes, branches, or PRs were created. The working tree also contains **pre-existing** user changes and untracked paths (including `electron/researchDb.mjs`, `package.json`, `package-lock.json`, `src/components/AssistantContent.tsx`, `src/components/ChatHome.tsx`, `src/layouts/AppLayout.tsx`, `.agents/`, `mise.toml`, `package.json.backup`, `paper-orchestra-main/`, `skills-lock.json`, `src/components/composer/`). These were preserved; this audit's edits were layered on top and are listed in §5.
