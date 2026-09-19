# Openbentt Phase 8 — Architecture

## Invariant (preserved)

```
MODEL → PROPOSE → RUNTIME validate → POLICY allow/deny/confirm →
EXECUTOR → REAL PROVIDER → VERIFIED RESULT → AUDIT
```

The model never becomes the authority. Every Phase 8 path flows through the
Phase 5 policy + executor and the central audit ledger. No second framework
was created for actions, approvals, sync, workflows, or MCP exposure.

## After architecture

```
CHAT / AGENTS (roles) / WORKFLOWS / MCP SERVER
  ↓ propose (tool call w/ validated input)
TOOL REGISTRY (25 tools: 18 read + 7 WRITE, toolCore.mjs SSOT)
  ↓ evaluatePolicy (CONFIRM for all writes)
ACTION GATE (toolStore.mjs, main-side only)
  ├ target-scope validation (actionCore.mjs)
  ├ write-grant check (vault scopes; incremental re-auth)
  ├ idempotency check (action_executions; BEFORE burning approvals)
  └ approval consume (single-use, fingerprint-bound, expiry-checked)
PROVIDER WRITE CLIENTS (providers/*Write.mjs, real POST endpoints)
  ↓ provider-verified response parsing (success claimed only on verify)
ACTION_EXECUTIONS row + AUDIT (lifecycle: PROPOSED/APPROVED/EXECUTED/
  SUCCEEDED/FAILED/REJECTED/EXPIRED/DEDUPLICATED/STATUS_UNKNOWN)
```

## New modules

| Module | Kind | Role |
|---|---|---|
| src/lib/actions/actionCore.mjs | pure SSOT | fingerprint, approval verify, target validation, preview |
| src/lib/connectors/providers/{gmailWrite,googleCalendarWrite,slackWrite,githubWrite,notionWrite}.mjs | pure+fetch | real endpoints, bodies, parsers |
| src/lib/agent/agentRolesCore.mjs | pure SSOT | 5 role configs (+agentRoles.ts facade) |
| src/lib/workflows/workflowCore.mjs | pure SSOT | validation, deterministic conditions |
| src/lib/sync/syncSchedule.mjs | pure SSOT | intervals, due, backoff, transient kinds |
| src/lib/mcp/mcpServerCore.mjs | pure SSOT | read-only exposure policy, JSON-RPC parse |
| electron/actionStore.mjs | main | approvals + executions tables |
| electron/syncScheduler.mjs | main | 60 s scheduler + real sync pipeline |
| electron/workflowStore.mjs | main | workflow CRUD + execution driver |
| electron/mcpServer.mjs | main | opt-in loopback MCP server |
| electron/identityLinker.mjs | main | same-namespace evidenced linking |

## Persistence (schema v12, additive)

action_approvals, action_executions, sync_config, workflows, workflow_runs,
mcp_server_config. Secrets stay in OS-vault files.

## IPC (allowlists, no generic IPC)

research:actions (get/list/approve/reject/executions/writeGrant),
research:sync (configs/get/set/runNow), research:workflows
(list/get/create/update/delete/start/resume/cancel/runs/getRun),
research:agents (list/get), research:mcpserver
(status/configure/rotateToken/start/stop). Preload exposes 5 bridges;
renderer cannot mint approvals (no propose op).

## UI

Settings → Agents & actions (Agents, Approvals, Workflows, Activity);
Settings → Integrations (+Sync dashboard, +MCP server exposure);
chat approval cards bound to agent runs; ToolPanel approval preview;
ConnectorDetail "Enable actions" re-auth.
