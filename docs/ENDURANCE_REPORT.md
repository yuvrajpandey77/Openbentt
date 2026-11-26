# Endurance stability report (Phase D)

**Status: smoke + two partial attempts measured; current 2-hour run in progress.** The first 2-hour attempt ended after 8 m 6 s because the app exited spontaneously; the harness mislabelled that as a normal end-of-workload. The harness was fixed to record and recover from mid-run exits. The first corrected run then exposed an intermittent `app://` lazy-chunk fetch failure (`Failed to fetch dynamically imported module: app://openbentt/assets/SettingsPage-*.js`), which was fixed by reading assets directly from disk. That post-fix run's JSON/log (`/tmp/opencode/endurance-full-final.*`) were lost when `/tmp` was cleared during a host reboot on 2026-11-26 (uptime 17 min at inspection; PID 609288 gone; `/tmp/opencode` empty). No result is inferred from that loss.

After rebuilding current HEAD, the harness needed another update: the desktop chrome now starts with a collapsed icon rail, Settings is a nested dialog, and provider controls live under the Models section. `scripts/perf/endurance.mjs` now expands the sidebar for labelled navigation, opens Settings via the dock/shortcut, selects Models, and closes overlays before continuing. A 2m32s validation smoke passed with 10 cycles, 29 samples, 6 post-GC checkpoints, 0 warnings and 0 fatal events (`/tmp/opencode/endurance-rerun-smoke3.json`). Two attempts to run the full 2-hour workload as shell background jobs were cancelled by repeated OpenCode server restarts (their JSON/log were empty or absent). The run was therefore relaunched as a user systemd unit, `openbentt-endurance.service`, which is independent of the agent server process. Expected artifacts are `/tmp/opencode/endurance-full-systemd.json` and `/tmp/opencode/endurance-full-systemd.log`; final results are reported only from that JSON.

Interim observation at 2026-11-26 20:01:28 IST: the systemd unit was active/running for 14 min 37 s (Main PID 115521; current Electron child PID 169930 started at 19:56:39 IST). Session logs were present through `/tmp/opencode/obt-endurance-115521-s30.log`; the unit reported 1.1 G current RSS (peak 2.9 G) and 16 min 27.916 s CPU. This confirms the durable executor survived agent restarts; it is **not** a completed 2-hour result.

## Harness and scope

- Harness: `scripts/perf/endurance.mjs`
- Launches the real built Electron app from the repository root with CDP enabled and an isolated `--user-data-dir` under `/tmp/opencode` (`/tmp/opencode/obt-endurance-<pid>`).
- Default budget: `OPENBENTT_ENDURANCE_MS=7200000` (2 hours). Default JSON output: `/tmp/opencode/endurance.json`.
- Workload per cycle: Chat ↔ Notebook navigation, synthetic long conversation growth via CDP, PDF-heavy notebook content, provider switching through the Settings UI, safe status calls, safe tool executions, research project listing, and idle time.
- Real PDF fixtures are used when present in `docs/`; otherwise the harness labels content `SYNTHETIC`.
- `ensureRuntime`, `narration.ensure`, and local GGUF server start are **not** called unless `OPENBENTT_ENDURANCE_ALLOW_ENSURE=1`.
- Sampling: `/proc` process-tree RSS/CPU/child counts plus CDP Performance, Memory, Runtime, DOM counters, and process info. GC checkpoints call `HeapProfiler.collectGarbage` before and after equivalent workload segments.
- Exit behavior: page errors, page crashes, unexpected app exits, and harness errors are fatal (nonzero exit). Nonfatal warnings are reported as `completed-with-warnings`.

No commits were made. The endurance-specific code changes are in `scripts/perf/endurance.mjs` and this report, but the working tree also contains many parallel uncommitted changes (IPC authorization, GPU safe mode, paper orchestra, model routing, privacy preferences, settings/chat UI, A2UI, and others). Those changes were preserved and are not attributed to this endurance task.

## Commands run

Syntax check:

```sh
node --check scripts/perf/endurance.mjs
```

Validated smoke command (2–5 minute budget; observed runtime 141.75 s):

```sh
OPENBENTT_ENDURANCE_MS=180000 OPENBENTT_ENDURANCE_SAMPLE_MS=15000 OPENBENTT_ENDURANCE_IDLE_MS=4000 OPENBENTT_ENDURANCE_OUT=/tmp/opencode/endurance-smoke.json node scripts/perf/endurance.mjs > /tmp/opencode/endurance-smoke-run.log 2>&1
```

The wrapper printed `EXIT=0`. Console output:

```json
{
  "output": "/tmp/opencode/endurance-smoke.json",
  "status": "completed",
  "durationObservedMs": 141750,
  "cycles": 24,
  "samples": 51,
  "checkpoints": 8,
  "warningCount": 0,
  "fatalEvents": [],
  "interpretation": "Post-GC retained JS heap increased across equivalent workloads and event-listener count also rose. This is consistent with retention (possible leak), but caches, fixtures and harness-injected synthetic DOM can also explain part of it; confirm with a longer run before assigning root cause."
}
```

Raw report: `/tmp/opencode/endurance-smoke.json`; harness console log: `/tmp/opencode/endurance-smoke-run.log`.

## Measured smoke result

| Item | Measured value |
| --- | --- |
| Started / finished (UTC) | `2026-11-24T11:45:33.204Z` / `2026-11-24T11:47:54.954Z` |
| Configured budget | 180,000 ms |
| Observed duration | 141,750 ms |
| Cycles / samples / checkpoints | 24 / 51 / 8 |
| Status / fatal / warnings | `completed` / 0 / 0 |
| Event counts | `page-close`: 2, `app-exit`: 2 |
| Session exits | Session 0 `end-of-workload`, code 0; session 1 `final`, code 0 |
| Crashes or page errors | None observed |
| Graceful restart | Completed on the same isolated profile; verification Chat/Notebook/status steps completed |

The observed duration is shorter than the 180 s budget because the harness reserves time for shutdown, restart, and final verification.

### Fixture and workload mode

- Mode: `fixture`.
- Real PDFs stored and loaded through `openbenttResearch.storePaperPdf` / `loadPaperPdf`:
  - `PRODUCT_DOC.pdf` — 499,219 bytes
  - `desktop-system-design.pdf` — 79,467 bytes
- Additional volume was supplied by hidden synthetic notebook-page markup, explicitly labelled `SYNTHETIC`.
- Synthetic conversation injection retained up to 600 hidden messages; the smoke reached 24 cycles.
- Provider switching used `google` / `OpenRouter` through the Settings UI without starting helper processes.
- 453 explicit harness bridge IPC calls were counted during the smoke. Renderer bridge wrappers were frozen, so renderer-side call counting was unavailable; optional CDP IPC tracing was not enabled.

### Raw metric ranges

Values are from 51 samples unless otherwise noted. CPU is summed across the app process tree using 100 Hz `/proc` ticks, so values above 100% are possible.

| Metric | Min | Max |
| --- | ---: | ---: |
| Total process-tree RSS | 640.54 MB | 1043.17 MB |
| Main process RSS | 180.84 MB | 332.22 MB |
| Renderer RSS | 150.80 MB | 571.36 MB |
| GPU process RSS | 89.57 MB | 93.85 MB |
| Process-tree CPU | 0.00% | 141.59% (mean 23.89%) |
| Renderer processes | 1 | 1 |
| GPU processes | 1 | 1 |
| Child processes | 6 | 8 |
| JS used heap (CDP Performance) | 17.86 MB | 204.20 MB |
| DOM nodes | 486 | 26083 |
| CDP `jsEventListeners` | 360 | 15492 |
| External-memory proxy | 132.94 MB | 451.04 MB |

`externalMemoryProxyMb` is explicitly `renderer RSS - JS used heap`. It is a coarse proxy that includes native bindings, PDF/worker memory, and allocator effects; it is **not** V8's external-memory counter, which CDP did not expose here.

### GC checkpoints

Each checkpoint samples equivalent workload state before and after `HeapProfiler.collectGarbage`. RSS values are process-tree totals.

| Checkpoint | Cycle | Pre-GC heap | Post-GC heap | GC freed heap | Pre-GC RSS | Post-GC RSS | Post-GC listeners | Post-GC DOM nodes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 0 | 23.61 MB | 17.86 MB | 5.75 MB | 652.14 MB | 640.54 MB | 360 | 486 |
| cycle-5 | 5 | 56.78 MB | 26.36 MB | 30.42 MB | 746.01 MB | 675.61 MB | 4031 | 5796 |
| cycle-10 | 10 | 75.35 MB | 28.39 MB | 46.96 MB | 811.48 MB | 679.65 MB | 7025 | 11223 |
| cycle-15 | 15 | 97.84 MB | 29.60 MB | 68.24 MB | 906.28 MB | 689.20 MB | 9991 | 16546 |
| cycle-20 | 20 | 203.51 MB | 31.35 MB | 172.16 MB | 989.04 MB | 701.39 MB | 12985 | 21973 |
| cycle-23 | 23 | 120.32 MB | 31.56 MB | 88.76 MB | 1042.05 MB | 711.55 MB | 14759 | 24966 |
| cycle-24 | 24 | 204.20 MB | 32.07 MB | 172.13 MB | 913.32 MB | 716.44 MB | 15369 | 26033 |
| post-restart | 25 | 29.53 MB | 30.57 MB | -1.04 MB | 806.24 MB | 706.93 MB | 1192 | 812 |

Post-GC heap rose from 17.86 MB at baseline to 32.07 MB at cycle 24 (+14.21 MB) and the harness's first-to-last checkpoint delta, which includes the post-restart checkpoint, is +12.71 MB. Post-GC listener count rose from 360 to 15369 by cycle 24, then reset to 1192 after restart; the harness reports +832 for first-to-last checkpoint including that restart reset. Post-GC RSS rose from 640.54 MB to 716.44 MB by cycle 24 (+75.90 MB).

## Conservative interpretation

- Most pre-GC growth was reclaimed: GC freed 5.75–172.16 MB of JS heap per checkpoint. That pattern is consistent with caches and transient allocations rather than an immediate leak.
- A smaller amount survived GC and grew slowly across equivalent cycles: post-GC JS heap increased by 14.21 MB by cycle 24 (12.71 MB first-to-last including the post-restart checkpoint). This is a **possible retention signal**, not proof of a leak.
- Listener and DOM counts rose substantially during the session, but the harness intentionally retains synthetic hidden conversation and PDF-page markup and switches providers every cycle. Those are known confounders. The post-restart checkpoint reset DOM nodes to 812 and listeners to 1192, consistent with a fresh renderer.
- RSS and the external-memory proxy also rose, but they are coarse process-level measures and can reflect native PDF/GPU bindings, allocator behavior, and caches.
- A 2-hour run is required to determine whether the post-GC values plateau or continue to grow before assigning root cause.

## First 2-hour attempt — partial (superseded)

**This attempt did not complete its configured 2-hour budget. No full-run results are claimed from it.** The corrected rerun is described at the end of this report.

Foreground command:

```sh
OPENBENTT_ENDURANCE_MS=7200000 OPENBENTT_ENDURANCE_OUT=/tmp/opencode/endurance.json node scripts/perf/endurance.mjs
```

Background command:

```sh
nohup env OPENBENTT_ENDURANCE_MS=7200000 OPENBENTT_ENDURANCE_OUT=/tmp/opencode/endurance.json node scripts/perf/endurance.mjs > /tmp/opencode/endurance-full.log 2>&1 &
```

Optional knobs for the full run:

- `OPENBENTT_ENDURANCE_SAMPLE_MS` — sampling interval, default 30000 ms.
- `OPENBENTT_ENDURANCE_IDLE_MS` — idle per cycle, default 12000 ms.
- `OPENBENTT_ENDURANCE_PDF_DIR` — PDF fixture directory, default `docs/`.
- `OPENBENTT_ENDURANCE_IPC_TRACE=1` — enable a short CDP IPC tracing window.
- `OPENBENTT_ENDURANCE_ALLOW_ENSURE=1` — opt in to helper-spawning ensure paths (not used in the smoke).

After a full run, inspect `/tmp/opencode/endurance.json` and compare the post-GC checkpoint series, especially whether heap/listener/RSS growth continues or plateaus over the full interval.

## First 2-hour attempt (2026-11-24, 8 m 6 s)

Command actually run:

```sh
nohup env OPENBENTT_ENDURANCE_MS=7200000 \
  OPENBENTT_ENDURANCE_OUT=/tmp/opencode/endurance-full.json \
  node scripts/perf/endurance.mjs > /tmp/opencode/endurance-full.log 2>&1 &
```

| Item | Measured value |
| --- | --- |
| Configured budget | 7,200,000 ms |
| Observed duration | 485,996 ms |
| Cycles before exit / samples / checkpoints | 35 / 69 / 8 |
| Status printed by harness | `completed`, 0 warnings, 0 fatal events |
| Session 0 exit | code `0`, `signal: null`, at 471,022 ms, during cycle 35 idle |
| Event record | `page-close` then `app-exit` for session 0; no crash, page error, or harness error |

This is **not** a 2-hour result. The app left the `app-exit` event at 471 s, but the harness's loop ended at the next break without emitting `unexpected-exit`; it then performed its planned restart and final checkpoint. The fixed harness now records that class of exit as fatal, relaunches on the same isolated profile, and continues applying the workload until the deadline.

Post-GC data from the 35 cycles is still useful as a bounded observation: heap rose 18.31 → 32.55 MB by cycle 30, listeners 360 → 18,899, DOM nodes 486 → 31,822, then reset after restart to 30.18 MB / 1,177 / 787. The retained growth remains a **possible retention signal**, confounded by the harness's intentionally retained synthetic DOM and conversation fixtures. No leak root cause is claimed.

Raw report: `/tmp/opencode/endurance-full.json`; log: `/tmp/opencode/endurance-full.log`.

## Harness recovery fix and validation

`scripts/perf/endurance.mjs` now:

- emits `unexpected-exit` / `workload-aborted` when a session is lost mid-workload;
- records the exit and attempts relaunch on the same profile, then a fresh isolated profile;
- reseeds PDF fixtures when a fresh profile is used and takes a recovery checkpoint;
- continues the cycle loop until the configured wall-clock deadline;
- counts `session-recovery` / `recovery-failed` as warnings and failed recovery as fatal.

Validation (short budget, `OPENBENTT_ENDURANCE_IDLE_MS=3000`):

```sh
OPENBENTT_ENDURANCE_MS=150000 OPENBENTT_ENDURANCE_IDLE_MS=3000 \
  OPENBENTT_ENDURANCE_OUT=/tmp/opencode/endurance-recover-smoke.json \
  node scripts/perf/endurance.mjs
```

Result: `completed`, 121,868 ms observed, 25 cycles, 49 samples, 9 checkpoints, 0 warnings, 0 fatal events, clean shutdown/restart. Raw report: `/tmp/opencode/endurance-recover-smoke.json`.

Corrected full run (intermediate, superseded) was started at
`/tmp/opencode/endurance-full-2h.json`. It was stopped because the build it
exercised still used `net.fetch(file://…)` for `app://` assets, which
intermittently failed for the lazily imported Settings chunk. After that fix
and a fresh build, a post-fix run was started at
`/tmp/opencode/endurance-full-final.json`, but its JSON/log were erased with
`/tmp` during the 2026-11-26 host reboot. After rebuilding current HEAD and updating the harness for the new chrome, the
full run was relaunched outside the agent process:

```sh
systemd-run --user --unit=openbentt-endurance --collect \
  --property=WorkingDirectory="$PWD" \
  --property=StandardOutput=append:/tmp/opencode/endurance-full-systemd.log \
  --property=StandardError=append:/tmp/opencode/endurance-full-systemd.log \
  --setenv=OPENBENTT_ENDURANCE_MS=7200000 \
  --setenv=OPENBENTT_ENDURANCE_OUT=/tmp/opencode/endurance-full-systemd.json \
  /bin/bash -lc 'exec node scripts/perf/endurance.mjs'
```

Expected output: `/tmp/opencode/endurance-full-systemd.json`. Until that file
reports a full-duration `finishedAt`, this document does **not** claim a
completed 2-hour endurance test. The asset-loading fix is covered by 12 repeated
Chat↔Settings navigations (`/tmp/opencode/repro-settings-after.log`, zero errors)
and by a new E2E regression test that passed in the 5/5 Electron smoke suite
before those artifacts were also cleared with `/tmp`.
