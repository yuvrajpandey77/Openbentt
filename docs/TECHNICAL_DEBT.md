# Technical debt after Phase 3 gap closure (2026-11-24)

This list separates debt that was **observed and measured** from work that is
merely speculative. Items already fixed in Phase 3 are listed only where a
residual risk remains.

## P1 — verification gaps

1. **Full 2-hour endurance run.** The first configured 2-hour attempt ended
   after 8 m 6 s because the app exited code 0 during cycle-35 idle; the harness
   mislabelled it as a normal end-of-workload. `scripts/perf/endurance.mjs` was
   fixed to log and recover from mid-workload exits and continue to the budget;
   a 2m02s recovery smoke passed with 0 warnings/fatal events. The first
   corrected run exposed an intermittent `app://` lazy-chunk `ERR_FAILED`, fixed
   by direct file reads in the protocol handler. That post-fix run's JSON/log
   (`/tmp/opencode/endurance-full-final.*`) were lost when `/tmp` was cleared
   during the 2026-11-26 host reboot, so no result is inferred from it. After
   rebuilding current HEAD, the harness was updated for the collapsed sidebar,
   nested Settings dialog and Models section; a 2m32s validation smoke passed
   with 10 cycles, 29 samples, 6 post-GC checkpoints and 0 warnings/fatal
   (`/tmp/opencode/endurance-rerun-smoke3.json`). Two shell-background full runs
   were cancelled by OpenCode server restarts, so the active run is now a user
   systemd unit writing `/tmp/opencode/endurance-full-systemd.json`. The
   post-GC retained JS heap rose from 17.86 MB to 32.07 MB by cycle 24 in the
   earlier smoke; this is a retention signal, not a confirmed leak. Do not close
   the endurance gap until the systemd run is reviewed.
2. **Packaged artifact from an earlier build — resolved.** The earlier 19/19
   check statically inspected `Openbentt-2.5.8.AppImage` built at 15:26. A fresh
   unpacked Linux build from the final `dist/` was produced in
   `/tmp/opencode/packaged-current` and passed the same harness 19/19 with 0
   warnings/failures. Cross-platform caveats remain in item 3.
3. **AppImage self-execution and other platforms.** On this host the AppImage
   cannot launch (`libfuse.so.2` missing; extracted V8 snapshots zero-length).
   `.deb` installation and Windows/macOS installers/updaters were not executed.
   Only the extracted `linux-unpacked` packaged runtime was exercised.
4. **Typecheck.** `npx tsc --noEmit -p tsconfig.app.json` still exits 2 with
   errors that predate this batch in the dirty working tree. `npm run build`
   and lint pass; a clean typecheck is not claimed.

## P2 — architecture / performance

5. **Entry chunk is still ~4.4 MB.** `modulePreload: false` removed 5 eager
   modulepreloads (startup resources 4 → 2), but the main chunk size is
   effectively unchanged. The provider stack (Chat, LocalAI, ResearchProject,
   Zotero, Workspace, LocalModel, TaskCenter) is eager at ~390 ms. Splitting
   cold-only providers behind route boundaries is the next high-impact change,
   but it is risky and was not done without evidence.
6. **Unexplained renderer interval.** Startup marks show providers mounted at
   ~390 ms and sidebar ready at ~940–976 ms. The ~550 ms gap is not attributed
   by the current marks. Add finer renderer long-task/React commit profiling
   before optimizing it.
7. **Notebook nav→route mount dominates.** 82.7–209.1 ms in the final profile,
   versus 0–0.2 ms from route mount to hydration. Lazy route chunk load and
   sidebar event work are the candidate areas; no optimization was attempted.
8. **Base64 caps are guard-side only.** Policy caps were raised to match
   main's decoded PDF/asset limits, but `research:storeProjectAsset`,
   `research:compileProjectLatex`, and `research:putCompileArtifact` still
   have no explicit main-side decoded byte cap. Add symmetric service-level
   limits so the guard and service enforce the same contract.

## P3 — reliability / UX

9. **Service-worker diagnostic.** Packaged sessions log a benign
   `InvalidStateError: Failed to get ServiceWorkerRegistration objects`. The
   harness filters it; suppressing it at source would reduce false alarms.
10. **Audio/listener lifecycle.** Renderer-audio cleanup on unmount and PDF
    viewer teardown remain lifecycle areas worth another pass (the PDF viewer
    destroy path was fixed in the earlier audit).
11. **Persistence status UI coverage.** Phase 3 added an explicit state
    machine, retry/flush IPC, validated backups, and a banner. Confirm that
    every service that writes through `researchDb` surfaces `saving`/`failed`
    states through the banner under fault injection in a packaged build.
12. **IPC residual risk.** A fully compromised trusted renderer can still call
    the intentionally exposed channels. The guard limits frame/window/origin
    and payload scope; deeper mitigation requires moving more operations into
    main behind user-mediated approval.

## P4 — data / tooling hygiene

13. **Working tree state.** Many modified/untracked files predate this work
    (including `paper-orchestra-main/`, `.agents/`, `mise.toml`,
    `package.json.backup`, `skills-lock.json`, `src/components/composer/`).
    They were preserved; no commit, reset, stash, push, or branch was created.
    Separate them before any release commit.
14. **Lint warnings.** `npm run lint` exits 0 with 79 pre-existing warnings,
    mostly `react-hooks/exhaustive-deps`. These are not new but remain a
    source of stale-closure bugs.
15. **Packaging size.** `dist/` is ~471 MB (`busytex` corpus dominates),
    AppImage ~876 MB, `app.asar` ~1.1 GB. `sql.js/**/*` packaging is broad;
    narrow it to runtime files when time permits.

## Explicitly not debt

- IPC authorization is enforced at runtime for all 174 registrations / 170
  channels, with a static gate that fails on unknown or bypassed channels.
- Persistence fault-injection cases from Phase B are covered in
  `electron/researchDb.test.mjs` (17 tests).
- Notebook timing marks are `null` when unavailable; no number is fabricated.
- Intermittent lazy-chunk fetch failures (`Failed to fetch dynamically imported
  module: app://openbentt/assets/SettingsPage-*.js` / `net::ERR_FAILED`) were
  traced to `net.fetch(file://…)` in the `app://` protocol handler and fixed by
  direct async file reads with explicit MIME types. The new repeated Settings
  navigation E2E test passes; this is no longer open debt.
