# Production-readiness assessment — Phase 3 gap closure (2026-11-24)

## Verdict

**Conditional / not yet signed off for release.** The security, persistence,
instrumentation, and packaged-recovery gaps addressed in this batch are
implemented and verified with the tests below. One verification gap remains
open at the time of writing: the corrected 2-hour endurance run. The final
`dist/` was repackaged and passed the same 19/19 packaged recovery checks;
no release claim is made from the earlier partial artifacts.

## What is verified

| Area | Evidence | Result |
| --- | --- | --- |
| Unit tests | `npm run test:unit` → `/tmp/opencode/final-unit-4.log` | 140 files, 754 passed, 1 skipped, exit 0 |
| Electron/node tests | `npm run test:electron` → `/tmp/opencode/final-electron-3.log` | 242 passed, 2 skipped, 0 failed, exit 0 |
| IPC authorization | `node --test electron/ipcAuthorization.test.mjs` | 16/16 passed |
| Persistence fault injection | `node --test electron/researchDb.test.mjs` | 17/17 passed (included in Electron total) |
| Electron E2E | `OPENBENTT_E2E_ELECTRON=1 npx playwright test --project=electron --workers=1 e2e/electron-smoke.spec.ts` after final build | 5/5 passed (added repeated lazy Settings-chunk regression) |
| Build + CSP | `npm run build` → `/tmp/opencode/final-build-3.log` | exit 0, CSP check passed |
| Lint | `npm run lint` → `/tmp/opencode/final-lint-4.log` | exit 0, 0 errors, 79 pre-existing warnings |
| IPC static gate | `npm run lint:electron-security` | “174 IPC registrations covered by 170 policy entries”, exit 0 |
| IPC coverage report | `npm run audit:ipc` / `docs/IPC_SECURITY_COVERAGE.md` | all 174 registrations / 170 channels documented |
| Startup profile | `/tmp/opencode/startup-profile-final.json` | cold CDP 324/322 ms, warm 328/321 ms; sidebar 940–976 ms |
| Notebook profile | `/tmp/opencode/notebook-profile-final.json` | four scenarios, no scenario/page errors or mark timeouts |
| Lazy chunk regression | repeated Chat↔Settings navigation in E2E + `/tmp/opencode/repro-settings-after.log` | 12/12 navigations with zero network/page errors after direct-read fix |
| Packaged recovery (final build) | `/tmp/opencode/packaged-app-check-current.json` | 19 passed, 0 failed, 0 warned (current unpacked Linux build) |
| Packaged recovery (earlier artifact) | `/tmp/opencode/packaged-app-check.json` | 19 passed, 0 failed, 0 warned |
| Endurance smoke | `/tmp/opencode/endurance-smoke.json` | 141.75 s, 24 cycles, 0 warnings/fatal |
| Recovery-path smoke | `/tmp/opencode/endurance-recover-smoke.json` | 121.87 s, 25 cycles, 0 warnings/fatal |

## What is not yet verified

1. **Corrected 2-hour endurance.** The first configured 2-hour attempt stopped
   after 8 m 6 s when the app exited code 0 during an idle period; the old
   harness misclassified it as a normal completion. The harness now records and
   recovers from that event and continues to the deadline. The corrected run is
   at `/tmp/opencode/endurance-full-final.json` and is not yet complete. An
   intermediate corrected run was stopped because it exercised a build with
   the intermittent `app://` lazy-chunk fetch failure described below. Until
   the final run finishes, no ≥2-hour stability claim is made.
2. **Cross-platform installers.** `.deb`, Windows, and macOS were not executed.
   The AppImage cannot self-launch on this host (`libfuse.so.2` absent; V8
   snapshots were zero-length in the extracted copy); runtime checks used the
   matching current `linux-unpacked` binary.
3. **Typecheck.** `npx tsc --noEmit -p tsconfig.app.json` exits 2 with errors
   that predate this batch in the dirty tree. Build and lint pass; a clean
   typecheck is not claimed.
4. **Leak status.** Post-GC JS heap rose 17.86 → 32.07 MB by smoke cycle 24 and
   18.31 → 32.55 MB by cycle 30 in the partial long run, with listener and DOM
   growth that is partly harness-induced. This is a **possible retention
   signal**, not a confirmed leak; the full run must determine whether it
   plateaus.

## Release gates that are met

- Every IPC registration is wrapped before service registration, default-deny
  for unknown channels, trusted-window/main-frame/origin checks, scoped grants,
  and channel payload/size validation. Static gate and runtime tests pass.
- Research DB writes have explicit states, serialized atomic writes, bounded
  retry, flush/retry IPC, in-memory preservation, validated backup recovery,
  and a UI banner. Eight fault-injection scenarios pass.
- Notebook/startup timings are measured with stable marks and no fabricated
  values; missing intervals remain `null`.
- No artificial delays were added to the startup path. Heavy AI/document/model
  services are registered but not initialized until used; startup requests
  fell from 4 to 2 in the earlier audit.
- The `app://` protocol handler now reads renderer assets directly from disk
  instead of `net.fetch(file://…)`, removing an intermittent `ERR_FAILED` on
  lazy route chunks under sustained navigation. Repeated Chat↔Settings
  navigation and a new E2E regression test pass with zero page errors.
- All harnesses use isolated `/tmp/opencode` profiles; no real user data was
  touched. No commit, reset, stash, push, or branch was created.

## Recommendation

Treat the desktop build as **feature-complete for Phase 3 gap closure but
release-blocked on the completed corrected 2-hour endurance report**. The
packaged check against a freshly built artifact has passed 19/19; the remaining
known debt is `tsc` cleanliness, cross-platform installer coverage, base64
service-side caps, and the unexplained ~550 ms renderer interval before
sidebar-ready — all documented in
[TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md).
