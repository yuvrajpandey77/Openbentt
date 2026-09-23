# OmniRoute Phase 2 — Local AI Gateway + Production Hardening

**Openbentt owns authority. OpenCode performs execution. OmniRoute routes models. The user authorizes.**

## 1. Architecture

```text
User → OpenCodePanel / Harness → agent:* IPC → opencodeService (main)
  → OmniRoute (localhost:20128/v1) → provider → OpenCode
  → permission bridge (actionStore, fingerprint-bound, single-use)
  → agent:event stream → UI → durable taskStore (SQLite v13) → audit
```

* New: `electron/omniRouteService.mjs` — supervised loopback-only gateway lifecycle.
* New: `electron/taskStore.mjs` — durable tasks/sessions/events/runtime-meta on the shared SQLite singleton (v13, additive). NOT an approval authority.
* Modified: `opencodeService.mjs` — `buildChildEnv()` consumes the OmniRoute base URL (single source of truth), provider attribution on tasks, checkpointed pause/resume, crash/reconcile/shutdown, new `agent:*` handlers.
* Shared pure core (`openCodeCore.mjs`): OmniRoute endpoint/state-machine/model-normalization/redaction helpers — zero divergence between main and renderer.
* Preload `openbenttAgent` extended (same 7th surface, no new bridge): `detectOmniRoute/getRuntimeStatus/getModels/ensureRuntime/restartRuntime`. No `execute/spawn/readFile/writeFile/request`.

## 2. Files created

* `electron/omniRouteService.mjs`
* `electron/omniRouteService.test.mjs` (13 tests)
* `electron/taskStore.mjs`
* `electron/taskStore.test.mjs` (5 tests)
* `electron/agentChain.test.mjs` (7 E2E/adversarial tests)
* `src/lib/agent/omniRouteCore.test.ts` (4 tests)
* `docs/OMNIROUTE_PHASE2.md` (this file)

## 3. Files modified

* `src/lib/agent/openCodeCore.mjs` — OmniRoute constants/state-machine/endpoint/model-bounds; JSON-secret redaction; secret-key metadata redaction; broader injection pattern. All additive.
* `src/lib/agent/openCodeTypes.ts` — `RuntimeModel`, `OmniRouteStatus/State/Detection`, `CombinedAgentStatus`, task provider fields.
* `src/lib/agent/openCodeAgentApi.ts` — OmniRoute bridge methods.
* `src/components/agent/OpenCodePanel.tsx` — Execution Runtime section (OpenCode/OmniRoute/Model/Provider/Gateway/Endpoint, Refresh/Start/Retry, honest free-route copy, degraded notice); hooks-order fix.
* `electron/opencodeService.mjs` — provider-aware env, persistence hooks, checkpointed pause/resume, approve→consume fix (§8), DELETE_FILES step, crash/reconcile/shutdown, new IPC.
* `electron/researchDb.mjs` — v13 additive tables (`agent_tasks/sessions/events/runtime_meta`).
* `electron/secretVault.mjs` — `omniroute_local_key` + lazy safeStorage (plain-node testable, same fallback semantics).
* `electron/main.mjs` — OmniRoute event target, startup reconcile, bounded shutdown (tasks→OpenCode→OmniRoute→flush, 8s cap).
* `electron/preload.cjs` — 5 narrow methods on existing `openbenttAgent`.
* `electron/opencodeService.test.mjs` — strict WAITING assertions (no vacuous passes), multi-approval completion, HIGH-risk delete deny.
* `electron/phase7Store.test.mjs` — schema v13.
* `package.json` — 3 new suites in `test:electron`.
* `docs/THREAT_MODEL.md` — 7 surfaces + agent bridge row.

## 4. OmniRoute lifecycle

`detectOmniRoute()` (env override → managed → system → PATH → missing) → `startOmniRoute()` (port check → spawn `--host 127.0.0.1 --port N` → health-verify → READY) → `getOmniRouteModels()` → `stopOmniRoute()` (SIGTERM→5s→SIGKILL) / `restartOmniRoute()` (≤3, exponential backoff) → `markOmniRouteCrashed()` → `cleanupOmniRouteOnQuit()`.

States: `NOT_INSTALLED/DETECTED/STARTING/READY/DEGRADED/STOPPING/STOPPED/CRASHED`; illegal transitions refused (pure `isValidOmniRouteTransition`, tested). READY only after `/v1/models` identity verification. Fast-exit binaries → DEGRADED task mode, never false READY. Missing binary → NOT_INSTALLED, app fully functional degraded.

## 5. OpenCode integration

Single seam: `buildChildEnv()` reads live OmniRoute status — READY base URL wins (`OPENAI_BASE_URL` + `OPENBENTT_PROVIDER=omniroute`), else operator `OPENBENTT_PROVIDER_BASE_URL`, else unset. Policy/permission code untouched. Tasks stamped `{provider: "omniroute", model, providerStatus}` for audit.

## 6. Provider routing

UI shows Connected/Degraded/Unavailable + model list + `Free route · N model(s)` + `Limitations: provider limits may apply`. No unlimited-free claims. No rotation/evasion/account-creation/rate-limit code anywhere. Provider failure (`UNAVAILABLE`) is distinct from OpenCode failure (`CRASHED`).

## 7. Runtime state machine + events

Normalized runtime events on existing `agent:event` channel: `runtime.detected/starting/ready/degraded/provider.available/provider.unavailable/model.available/model.unavailable/error/stopping/stopped`. Bounded + redacted like all agent events.

## 8. Permission integration (critical fix found by Phase 2 tests)

Phase 2 testing proved Phase 1's permission pause was nominal: `requestPermissionBridge` recorded approvals but execution fell through to COMPLETED, and `respondToPermission` consumed `proposed` approvals directly (always threw `approval is proposed` — old tests passed vacuously by observing COMPLETED).

Fixed, reusing `actionStore` (still the sole authority):
* Checkpointed runs (`task.checkpoint`): each sensitive step pauses (`WAITING_FOR_PERMISSION`); resume continues forward only. Destructive steps never auto-replay.
* `respondToPermission` = `approveAction` (trusted-UI decision at the IPC boundary) → `consumeApprovalForExecution` (fingerprint-bound, single-use). Expired/consumed/wrong-task fail closed.
* New `DELETE_FILES` (HIGH) step for delete/remove prompts; old delete test now exercises a real denial.
* Old tests upgraded to strict assertions (must observe WAITING; multi-approval to COMPLETED).

## 9. SQLite schema (v13, additive)

`agent_tasks` (task snapshot + provider/model/error), `agent_sessions`, `agent_events` (500/task cap, secret-redacted payloads ≤8KB), `agent_runtime_meta`. Startup `reconcileInterruptedTasks()` marks `QUEUED/STARTING/RUNNING/WAITING` → `UNKNOWN` with a verification warning; never →COMPLETED.

## 10. Security controls

* Loopback-only: `127.0.0.1` enforced + verified; `0.0.0.0`/`::`/LAN refused. Port conflicts: occupant identity verified via `/v1/models` shape before any credential flows; strangers → DEGRADED + warn, never hijacked.
* Credential: 256-bit random, vault-only (`omniroute_local_key`), env-to-own-child only, never logged/emitted/persisted elsewhere (tested).
* Child envs minimal allowlists for both services (tested with probe vars).
* Workspace boundary unchanged (Phase 1 realpath+lexical); adversarial suite covers traversal/symlink/drive/UNC/`~/.ssh`.
* Prompt injection: broadened detector + `[UNTRUSTED]` wrapping retained; provider metadata instruction-keys withheld, secret-keys redacted (tested).
* Renderer: `nodeIntegration:false, contextIsolation:true, sandbox:true` unchanged; 7 bridges; security/pack gates pass.

## 11. Port/service-identity protection

`getOmniRoutePort()` validated (1–65535); conflict → `checkPortFree` + `verifyServiceIdentity` (bounded fetch, size-capped, JSON-strict). Malformed/oversized/wrong-shape/partial/reset → `{ours:false}` → DEGRADED. No creds to strangers (tested with hijack stub).

## 12. Crash recovery

OpenCode crash → tasks CRASHED + error (never success). OmniRoute crash → tasks keep status but `providerStatus=UNAVAILABLE` + explicit event (OpenCode vs provider distinguishable). Both crash → both markers. Restart → reconcile → UNKNOWN + guidance. Shutdown → cancel tasks → stop OpenCode → stop OmniRoute → flush (8s cap, managed tree only).

## 13. UI changes

`OpenCodePanel` Execution Runtime block: status dots, model, provider, gateway, endpoint, model list (5 + overflow), Refresh/Start/Retry, degraded banner, honest free-route limitations line. Advanced details now include runtime + model count.

## 14. Tests executed

* `node --test electron/omniRouteService.test.mjs` — 13 passed (detection, version, degraded start, identity/hijack, malformed/injection models, loopback refusal, bounded restart, crash notify, env isolation, vault credential, state machine, ports, metadata bounds).
* `node --test electron/taskStore.test.mjs` — 5 passed (CRUD, sessions/meta, 560-event eviction, reconcile, redaction).
* `node --test electron/agentChain.test.mjs` — 7 passed (full approve→approve→COMPLETED chain + SQLite + audit; omni-crash UNAVAILABLE; restart UNKNOWN; injection/traversal/symlink; destructive classification + cancel-intact; port hijack).
* `node --test electron/opencodeService.test.mjs` — 10 passed (strict).
* `npx vitest run src/lib/agent/openCodeCore.test.ts src/lib/agent/omniRouteCore.test.ts` — 25 passed.
* `npm run test:electron` — 168 passed, 0 failed.
* `npm run lint` — 0 errors (58 pre-existing warnings). `lint:electron-security` / `lint:electron-pack` — pass. `npm run build` + CSP — pass. `tsc` — no new errors. `npm run test:e2e` — 5 passed, 4 skipped, 0 failed.
* Pre-existing failures (unchanged, verified via `git stash`): 10 vitest collect errors on clean tree (vite transform), 1 flaky `semanticIndexRebuild` timeout.

## 15. Known limitations

* No real OmniRoute binary in CI — lifecycle exercised with version-stub executables + HTTP stubs; READY-adopt path verified against shape-compatible stub.
* Task event mirror is best-effort async (hot path never blocks on SQLite).
* In-memory run state is authoritative during life; SQLite is history + recovery input.
* Provider preference engine deferred (OmniRoute routes; Openbentt records).
* No voice/computer-use/remote execution (explicit non-goals).

## 16. Phase 3 readiness

Voice plugs in as: mic permission (navigationPolicy allowlist extension) → worker STT → `decideRoute` (VOICE→content category) → existing task/approval/event/durable chain → TTS summary. No permission, IPC, or persistence redesign needed: voice transcription enters `createTask`, spoken summaries consume `agent.completed` events.
