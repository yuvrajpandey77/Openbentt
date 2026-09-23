# OpenCode Phase 1 — Runtime Integration

**Openbentt owns authority. OpenCode performs execution. Electron owns the process boundary. The renderer never receives arbitrary system access.**

## Architecture

```
User → OpenCodePanel / harness → agent:* IPC → opencodeService (main)
  → classifyTask → createTask → startTask → session + bounded inspection
  → permission bridge (actionStore propose/consume) → agent:event stream
  → allow/deny → completion → audit (toolStore ledger)
```

* Shared pure core: `src/lib/agent/openCodeCore.mjs` (classifier, capability
  policy, command risk, lexical workspace checks, event normalization,
  redaction, injection scan, version compare). No Node APIs.
* Main service: `electron/opencodeService.mjs` (detection, minimal env,
  realpath containment, sessions, tasks, permission bridge, crash handling,
  `agent:*` IPC, bounded logs/events).
* Renderer: `openCodeTypes.ts` (types), `openCodeEvents.ts` (facade +
  `wrapUntrustedContent`), `openCodeAgentApi.ts` (bridge),
  `openCodeHarness.ts` (`decideRoute`/`enrichPrompt`/`submitHarnessTask`),
  `components/agent/OpenCodePanel.tsx` (execution pane + timeline +
  permission dialog + advanced details).
* Preload: `openbenttAgent` — capability-specific only. No `ipcRenderer`,
  no `fs`, no `child_process`, no generic execute.
* Approvals reuse `electron/actionStore.mjs` (`opencode.execute` tool id,
  fingerprint-bound, single-use, idempotent). No second permission DB.
* Audit reuses `electron/toolStore.mjs` ledger.

## Files changed

* `src/lib/agent/openCodeCore.mjs` (new)
* `src/lib/agent/openCodeTypes.ts` (new)
* `src/lib/agent/openCodeEvents.ts` (new)
* `src/lib/agent/openCodeHarness.ts` (new)
* `src/lib/agent/openCodeAgentApi.ts` (new)
* `src/lib/agent/openCodeCore.test.ts` (new, 21 vitest tests)
* `src/components/agent/OpenCodePanel.tsx` (new)
* `electron/opencodeService.mjs` (new)
* `electron/opencodeService.test.mjs` (new, 10 node:test tests)
* `electron/preload.cjs` (add `openbenttAgent`)
* `electron/main.mjs` (register IPC, event target, quit cleanup)
* `scripts/check-electron-security.mjs` (7 bridges)
* `scripts/check-electron-pack-files.mjs` + `package.json` build.files
  (cover `openCodeCore.mjs`, add `opencodeService.test.mjs` to test:electron)

## OpenCode runtime

* Detection: `OPENBENTT_OPENCODE_PATH` → well-known paths per-OS → `PATH`
  `opencode --version` (no shell). Returns
  `{installed, executablePath, version, source, compatible}`.
* Min version `1.0.0` (`isSupportedVersion`).
* Process: `spawn(exe, ["serve","--port","0"], {env: minimal, stdio ignore/pipe})`.
  Early exit → `DEGRADED` task mode (never fake success); late exit →
  `CRASHED` + running tasks marked `CRASHED` with exit reason.
* Env allowlist: `PATH/HOME/USER/LANG/LC_ALL/TERM/TMPDIR/TEMP/TMP/SystemRoot/windir/NUMBER_OF_PROCESSORS/OS`
  + `OPENBENTT_OPENCODE_MODEL` + Phase-2 hook `OPENBENTT_PROVIDER_BASE_URL→OPENAI_BASE_URL`.
* Sessions: `CREATING/READY/RUNNING/WAITING_FOR_PERMISSION/COMPLETED/FAILED/CANCELLED/CRASHED/UNKNOWN`,
  max 8. Tasks: `QUEUED/STARTING/RUNNING/WAITING_FOR_PERMISSION/COMPLETED/FAILED/CANCELLED/CRASHED/UNKNOWN`,
  max 50, max 500 events/task, Openbentt-owned `otask_*` ids.
* Quit: `cleanupOpenCodeOnQuit()` SIGTERM→SIGKILL, no orphans, no unrelated kills.

## Permissions

* Capabilities (Phase 1): `READ_FILES/WRITE_FILES/DELETE_FILES/RUN_COMMANDS/NETWORK_ACCESS`.
  Policy: read-in-workspace ALLOW, everything else CONFIRM, unknown DENY (main-side).
* Sensitive ops become `opencode.execute` approvals with
  `actionFingerprint(tool, workspaceId, {capability,target|command,cwd,workspace})`,
  15-min TTL, single-use consume, idempotency key, task-grant scope for "allow for task".
* UI: `WAITING_FOR_PERMISSION` + Allow once / Allow for task / Deny. Deny →
  structured failure, project untouched.
* Commands: `parseCommand` + `classifyCommand`
  (`READ_ONLY/LOW/MODERATE/HIGH/SYSTEM`); sudo/su, `rm -rf`, fork-bombs,
  `~/.ssh`, credential paths → HIGH/SYSTEM; unknown → MODERATE (confirm).
  cwd validated inside workspace before approval.

## Security

* Workspace: `resolveWorkspaceRoot` (must be dir) + `assertPathInWorkspace`
  (lexical `checkPathContainedLexical` + ancestor-aware realpath → catches
  `../`, absolute, symlink, drive, UNC escapes). Fail closed.
* Injection: `scanForPromptInjection` + `wrapUntrustedContent` (`[UNTRUSTED]`
  blocks treated as data; tools never infer auth from content).
* Redaction: `redactSecretsFromText` on logs/events/payloads; bounded
  (`MAX_LOG_CHARS`, per-task event cap).
* IPC: `agent:*` allowlist, `assertSafeId`, prompt/workspace length caps,
  fail-closed errors. Renderer cannot spawn, read fs, or self-approve.

## UI

`OpenCodePanel`: workspace input (explicit), prompt, plan/build toggle,
run/cancel/refresh, status, permission dialog, timeline
(`agent.started→thinking→tool.output→permission.requested→completed`),
collapsible advanced JSON. Fits existing design system (Tailwind + shadcn
primitives via classes).

## Tests

* `npx vitest run src/lib/agent/openCodeCore.test.ts` — 21 passed.
* `node --test electron/opencodeService.test.mjs` — 10 passed
  (detection, containment+symlink, lifecycle allow, deny-intact,
  sessions, cancel, crash, IPC fail-closed, env isolation, bounds).
* `npm run lint:electron-security` — passed. `lint:electron-pack` — passed.
* Full suite + `npm run build` + `npm run test:e2e` should be run before release
  (Playwright needs browsers/network; run `npm run verify:release` in CI).

## Known limitations

* No real `opencode serve` wire protocol yet — the supervisor probe degrades
  to bounded local inspection + permission bridge. All authority/policy paths
  are real; engine streaming will attach in a follow-up without policy changes.
* Provider configuration is manual (`OPENBENTT_OPENCODE_MODEL`,
  `OPENBENTT_PROVIDER_BASE_URL`); no auto routing until Phase 2.
* Task persistence is in-memory (main); durable SQLite task table is Phase 2.
* No computer-use, browser control, or voice (explicitly out of scope).

## Phase 2 readiness (OmniRoute plug-in)

Single seam, no policy changes: `buildChildEnv()` in
`electron/opencodeService.mjs` maps `OPENBENTT_PROVIDER_BASE_URL →
OPENAI_BASE_URL` for the child. Phase 2 adds
`electron/omniRouteService.mjs` (localhost-only `:20128`, health,
`/v1/models`, vault credential) which sets that env + reports provider
status via `agent:status`; permission/workspace/event/audit layers are untouched.
