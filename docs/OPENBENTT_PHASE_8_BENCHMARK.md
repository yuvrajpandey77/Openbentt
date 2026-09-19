# Openbentt Phase 8 — Benchmark

## Regression baseline (Phase 7 → Phase 8)

| Suite | Phase 7 baseline | Phase 8 result |
|---|---|---|
| Vitest | 510 passed / 1 skipped | 558 passed / 1 skipped (+48) |
| Electron (node --test) | 112 passed | 133 passed (+21) |
| Lint | 0 errors | 0 errors |
| Build | pass | pass |
| CSP | pass | pass |
| Electron security check | pass | pass |
| Pack manifest check | pass | pass (5 new cores added) |

Two pre-existing tests were updated for legitimate additive changes:
- tools.test.ts inventory (18 → 25 tools).
- toolStore.test.mjs counts (18 → 25) and phase7Store.test.mjs schema (v11 → v12).

## New coverage

- actionCore: 4 suites (fingerprint stability/change/key-order/transport
  exclusion, approval accept/reject/expiry, 13 target cases, preview, keys).
- Write clients: 5 suites (URLs, bodies, parsers, injection safety, slug rules).
- Tools: registration defaults, HIGH/MEDIUM mapping, policy CONFIRM, strict schemas.
- Roles: inventory, registry-subset allowlists, least-privilege mapping, runtime registration.
- Workflows: validation rejections, condition semantics + fail-closed, terminal states.
- Sync schedule: intervals, due, backoff cap, transient classification.
- MCP server: exposability, fail-closed resolution, config validation, bearer, JSON-RPC.
- Electron: v12 migration, approval lifecycle (propose/approve/consume-once/
  substitution-reject/reject/list), idempotency, write grants, refresh
  honesty, sync config + offline honesty, workflow CRUD/execute/suspend/
  resume-reject, gate (CONFIRM+preview, target DENY, grant DENY, no-approval
  CONFIRM, dedupe replay, unknown-state block), IPC allowlists, MCP config.

## Live provider verification matrix (no credentials in environment)

| Capability | Production | Live verified | Status |
|---|---|---|---|
| Gmail draft | REAL | NO | BLOCKED (no OAuth creds) |
| Gmail send | REAL | NO | BLOCKED |
| Calendar create | REAL | NO | BLOCKED |
| Slack send | REAL | NO | BLOCKED |
| GitHub issue | REAL | NO | BLOCKED |
| GitHub PR | REAL | NO | BLOCKED |
| Notion create | REAL | NO | BLOCKED |
| Background sync | REAL | NO | BLOCKED |
| MCP server | REAL | localhost-tested structure | BLOCKED (no clients) |
| OAuth refresh | REAL | NO | BLOCKED |

No mocks were used to claim any of the above. To verify live, set
OPENBENTT_<CONNECTOR>_CLIENT_ID/SECRET per PHASE_7_INTEGRATIONS.md, connect,
enable actions, approve a test action, and confirm the provider-side object.
