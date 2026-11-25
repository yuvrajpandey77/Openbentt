# Packaged installation, upgrade and recovery verification (PHASE E)

Date: 2026-11-24 (UTC)  
Harness: `scripts/perf/packaged-app-check.mjs`  
Machine JSON result: `/tmp/opencode/packaged-app-check.json`  
Console log: `/tmp/opencode/packaged-app-check-run.log`

## 1. Scope and honesty about the artifact

No new package was built. The harness selected the newest usable Linux artifact already in `release/`:

**Later note:** this artifact predates the final IPC validator/typing/instrumentation changes in this batch. A fresh unpacked Linux build was produced from the final `dist/` under `/tmp/opencode/packaged-current` and rechecked with the same harness: **19 passed, 0 failed, 0 warned, 0 skipped** (`/tmp/opencode/packaged-app-check-current.json`, log `/tmp/opencode/packaged-app-check-current.log`). The 19/19 result below remains valid for the stated 2.5.8 artifact; the current-build result supersedes it for release sign-off. Cross-platform installers and AppImage self-execution remain unverified here.

| Field | Value |
| --- | --- |
| Selected artifact | `release/Openbentt-2.5.8.AppImage` |
| Absolute path | `/run/media/yuvraj/7f0fc2c0-5860-4630-83d8-18239d450d0d/home/yuvraj/Downloads/Projects/Openbentt_Monorepo/release/Openbentt-2.5.8.AppImage` |
| Size | 876,073,326 bytes (835.5 MiB) |
| mtime | 2026-11-24T09:56:22.104Z |
| Harness mode | `appimage` (selected), runtime fallback to packaged `linux-unpacked` |

Important limitation: the AppImage itself could not be executed on this host.

- Direct launch fails because `libfuse.so.2` is unavailable: `dlopen(): error loading libfuse.so.2`.
- `--appimage-extract-and-run` starts extracting into the isolated `TMPDIR` but never exposes a CDP endpoint.
- A full manual extraction showed `snapshot_blob.bin` and `v8_context_snapshot.bin` were zero-length in this AppImage; launching the extracted tree aborts with `FATAL:v8_initializer.cc(641)] Error mapping V8 startup snapshot file`.
- Full extraction costs roughly 1.8 GiB on a shared `/tmp` tmpfs, so the harness disables it by default. It can be forced with `OPENBENTT_APPIMAGE_EXTRACT=1`.

Therefore:

1. The AppImage bytes were **statically inspected** (targeted extraction of `resources/app.asar`).
2. Runtime, migration, persistence and recovery checks were run against `release/linux-unpacked/openbentt` from the same 2.5.8 build. This is a packaged Electron build with `resources/app.asar`, not a dev-server launch.
3. No claim is made that AppImage self-execution, `.deb` installation, or Windows/macOS installers were exercised here.

## 2. Exact command and result

```bash
node scripts/perf/packaged-app-check.mjs /tmp/opencode/packaged-app-check.json
```

The harness was iterated during development (conversation seeding, isolated-`TMPDIR` cleanup and legacy-summary compatibility were corrected). The figures below are from the final verification run, which is the run saved in the JSON file.

Exit code: `0`

Result: **19 passed, 0 failed, 0 warned, 0 skipped**.

Run window: `2026-11-24T11:45:17.329Z` → `2026-11-24T11:47:01.993Z` (~104.7 s).  
Environment: Node `v20.20.2`, Linux `x64`, `DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-1`, `XDG_SESSION_TYPE=wayland`.

## 3. Isolation and safety

All browser profiles and child-process environments were isolated:

- Work directory: `/tmp/opencode/packaged-check-QnCk4k`
- Profile: `/tmp/opencode/packaged-check-QnCk4k/profile`
- Redirected into the work directory: `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME`, `XDG_RUNTIME_DIR`, `TMPDIR`
- `--user-data-dir` always pointed inside `/tmp/opencode`
- The harness refuses an explicitly supplied profile outside `/tmp/opencode` and refuses one that resolves through a symlink into the real home directory.
- No real user profile was read, copied or modified.

Backups were made before any migration or corruption injection:

| Backup | Contents | Size |
| --- | --- | --- |
| `backups/before-upgrade` | 52 files | 3,854,538 bytes |
| `backups/before-corruption` | 55 files | 3,806,828 bytes |

## 4. Static package inspection

Source: `appimage:extracted-app.asar`  
ASAR: 1,134,050,898 bytes, 32,096 entries.

| Check | Result |
| --- | --- |
| `electron/main.mjs` present | yes |
| Built `dist/index.html` present | yes |
| CSP exact canonical tag in built HTML | yes |
| `node_modules/sql.js/dist/sql-wasm.wasm` | present, 688,280 bytes |
| PDF.js source worker | `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` |
| PDF.js built worker | `dist/assets/pdf.worker.min-yatZIOMy.mjs` |
| PDF.js cmaps | 169 files |
| Native `.node` files | 17 total, 17 unpacked and non-empty |
| Native dependency groups | 7 (`sharp`, `@napi-rs/canvas`, `onnxruntime-node`, `@xenova/transformers`, etc.) |

The CSP in the built HTML matched `scripts/csp-policy.mjs` exactly. The renderer also reported the same policy at runtime.

## 5. Runtime checks

| Check | Result | Evidence |
| --- | --- | --- |
| `isolated-profile` | pass | isolated workdir/profile as above |
| `artifact-found` | pass | selected 2.5.8 AppImage |
| `package-native-deps` | pass | 17 unpacked `.node` files |
| `package-sqljs-wasm` | pass | 688,280 bytes |
| `package-pdfjs-resources` | pass | source worker + built worker + 169 cmaps |
| `csp-in-built-files` | pass | exact canonical tag |
| `clean-install-first-start` | pass | `app://openbentt/chat`, 8 bridges, 8 nav items, schema 14 |
| `runtime-csp` | pass | DOM CSP equals built CSP |
| `graceful-shutdown` | pass | SIGTERM exit code 0 |
| `backup-before-migration` | pass | 52 files / 3.85 MiB |
| `old-profile-seeded` | pass | synthetic v5 DB, valid, 1 project, 2 chat-log rows |
| `upgrade-migration` | pass | schema 14, all seeded markers preserved |
| `abnormal-termination` | pass | SIGKILL during in-flight draft writes |
| `reopen-after-crash` | pass | valid DB, schema 14, conversation preserved |
| `corrupt-db-injected` | pass | invalid SQLite header confirmed |
| `corrupt-db-recovery` | pass | restored from `research.db.bak`, markers preserved |
| `graceful-shutdown-after-recovery` | pass | SIGTERM exit code 0 |
| `app-process-stayed-alive-during-checks` | pass | no renderer crash; one intentional SIGKILL only |
| `logs-collected` | pass | 5 phase logs under run `logs/` |

### 5.1 Clean install / first start

- Runtime binary: `release/linux-unpacked/openbentt`
- Runtime mode: `unpacked-sibling`
- CDP ready: 473 ms; page ready: 1,049 ms
- URL: `app://openbentt/chat`
- Title: `Openbentt | desktop-first AI workspace for researchers`
- Bridges visible: `openbenttAgent`, `openbenttDesktop`, `openbenttLocalGguf`, `openbenttNarration`, `openbenttOllama`, `openbenttResearch`, `openbenttSecrets`, `openbenttZotero`
- `research:init`: `{ migrated: 0, schemaVersion: 14, resumed: 0 }`
- Seeded conversation marker present in isolated `localStorage`
- Process alive during checks; SIGTERM exited `0` after 1,110 ms

A non-fatal renderer line was observed in each session:

```text
InvalidStateError: Failed to get ServiceWorkerRegistration objects: The document is in an invalid state.
```

It is filtered as a known benign Electron/service-worker diagnostic. No `page-crash`, `FATAL`, unhandled exception or fatal shared-library error appeared in any passing session.

### 5.2 Seeded old profile and upgrade

A synthetic v5 profile was created in the isolated profile (no real user data was copied):

- `research.db` with schema version `5`
- project `upgrade-demo-1`
- legacy draft text, bibliography, paper, corpus chunk, project file and two chat-log rows
- legacy `research-projects/legacy-upgrade/project.json` with project `legacy-import-1`

After relaunch and `research:init`:

- schema version `14`
- projects `upgrade-demo-1` and `legacy-import-1` both listed
- legacy `project.json` was consumed/imported
- draft, bibliography, paper extracted text, corpus chunk, project file and chat logs all preserved through `research:loadProject` / `research:listChatLogs`
- conversation marker from `localStorage` preserved across restart

Note: `research:init` reported `migrated: 0` because this packaged build imports `project.json` during startup, before the harness's explicit init call. Verification therefore used the observable result (imported project present and source file removed), not just the returned counter.

### 5.3 Interrupted persistence and reopen

Five fire-and-forget `research:patchDraft` writes (each ~4 KiB) were issued, then the app was killed with `SIGKILL` immediately (after 50 ms).

- Kill result: signal `SIGKILL` after 3,015 ms
- Reopen CDP ready: 430 ms; page ready: 2,940 ms
- Reopened DB: valid SQLite, schema `14`
- Draft after reopen: the last in-flight write (`interrupted write 4 …`, 4,116 chars) had been persisted
- Projects, legacy JSON import, paper, file, chunk, chat logs and pre-migration snapshot remained intact
- Conversation marker still present in `localStorage`
- Process alive; SIGTERM exited `0` after 3,022 ms

This verifies recovery from an abnormal termination with interrupted writes, not power-loss durability of the underlying filesystem.

### 5.4 Corrupt DB recovery

In the isolated profile only:

1. A verified-good `research.db` was copied to `research.db.bak`.
2. `research.db` was overwritten with an invalid header (`NOT-A-SQLITE-DATABASE…`).
3. The app was relaunched.

Result:

- `openDb()` restored from `research.db.bak`
- DB valid, schema `14`
- all upgrade markers preserved
- `research:init` returned no persistence error
- process alive; SIGTERM exited `0` after 2,941 ms

## 6. Logs and artifacts

Per-phase logs:

```text
/tmp/opencode/packaged-check-QnCk4k/logs/unpacked-sibling.log
/tmp/opencode/packaged-check-QnCk4k/logs/upgrade.log
/tmp/opencode/packaged-check-QnCk4k/logs/reopen-after-crash.log
/tmp/opencode/packaged-check-QnCk4k/logs/recovery-from-backup.log
```

Machine-readable result:

```text
/tmp/opencode/packaged-app-check.json
```

The JSON contains full check details, launch attempts, static package inventory, per-phase IPC responses, DB summaries, process exits, log tails, backup paths and environment.

## 7. Remaining gaps and OS limits

- **Linux was practical and executed.** The .deb package was located but not installed or executed; no root/apt installation was attempted.
- **Windows/macOS were not executed here.** Installers, code signing, Gatekeeper/SMART Screen, user-data locations, updater flows and native binary variants require separate machines. The harness deliberately refuses to guess those paths.
- **AppImage self-execution remains unverified on this host** because `libfuse.so.2` is missing and this specific 2.5.8 AppImage has zero-length V8 snapshot files. A fixed/rebuilt AppImage should be retested with the override below.
- The "old profile" was synthesized from the documented v5 schema plus a legacy `project.json`; it was not a real historical user profile.
- Native dependencies and PDF.js/sql.js assets were verified by package contents plus successful app startup. Exhaustive functional loading of every native module and every PDF/cmap asset was not performed.
- Auto-update from a release feed was not exercised; only local installation/upgrade/recovery behavior was checked.

## 8. Exact fresh-build and rerun commands

The harness was run against an existing artifact; no package was rebuilt for this report. To produce a fresh Linux package and rerun the same verification:

```bash
npm run build && npm run download:llama-server && npm run electron:pack:linux
```

Then, replacing `<version>` with the newly built version:

```bash
OPENBENTT_PACKAGED_BINARY=release/Openbentt-<version>.AppImage \
  node scripts/perf/packaged-app-check.mjs /tmp/opencode/packaged-app-check.json
```

Use `OPENBENTT_PACKAGED_PROFILE=/tmp/opencode/...` only when an explicit isolated profile is required; it must stay under `/tmp/opencode`.

## 9. Files added by this work

- `scripts/perf/packaged-app-check.mjs`
- `docs/PACKAGED_INSTALLATION_UPGRADE_REPORT.md`

No other tracked file was edited by this work, and no commit was created. Pre-existing dirty/untracked working-tree changes were left untouched.
