# Openbentt Phase 8 — Pre-Implementation Forensic Audit

Version: 2.2.5 → Phase 8. Schema v11. Date: 2026-09-17.
Rule: NO source modified before this document. Zero-mock rule in force.

## 1. Current architecture (Phase 7 end-state)

```
USER / AGENT (renderer, ChatContext + agentRuntime driveLoop)
  ↓ toolApi.execute (Phase 5 executor, renderer or IPC)
REGISTRY (TOOL_DEFINITIONS in toolCore.mjs + connectorRegistry)
  ↓ evaluatePolicy (deterministic, shared core)
EXECUTOR (toolHandlers.ts renderer / toolStore.mjs main)
  ↓ providers (providers/*.mjs, main-side authorizedFetchFor bearer)
AUDIT (tool_audit_events, SQLite v10, bounded 2000, redacted)
```

- 18 tools, all read/search/import-gated. `connector.import` + `mcp.tool.execute`
  are the only USER_CONFIRMATION/MEDIUM/mutation tools.
- Single agent runtime (`agentRuntime.ts` driveLoop), one definition
  (`research-assistant`, 18-tool allowlist). Model proposes fenced
  ` ```tool {...}` / `FINAL:`; resumeAgentRun() confirmation is app-only,
  bound to exact pending tool id.
- Connectors: 8 ids (crossref, zotero + 6 Tier-1 OAuth). Tier-1 = READ-ONLY.
- MCP = CLIENT only (stdio exact-allowlist + remote allowlisted hosts).
  No MCP server. No workflow engine. No approval center. No activity feed.

## 2. Current connector capabilities

SSOT: `connectorCore.mjs` (CONNECTOR_IDS/CAPABILITIES/CONNECTION_STATES 8-state,
SYNC_STAGES 9-stage), `enterpriseConnectors.ts` (apiBase, OAuth endpoints,
read-only scopes, deferredWriteScopes, rate notes, docsUrl),
`providers/*.mjs` (URL builders + normalizers + *VerifyConnection),
`providerHttp.mjs` (allowlisted hosts, 15 s timeout, 2 MiB cap, 1 Retry-After retry).

## 3. Current read-only capabilities

Drive v3 (get/list/search), Gmail v1 (list/get metadata), Calendar v3
(list/search), Slack Web API (search), GitHub REST (search issues),
Notion v1 (search/read blocks). All via main-side bearer, never in renderer.

## 4. Current MCP capabilities

Client only: `mcp.resource.read` (READ_ONLY/LOW, injection-scanned, DATA-wrapped),
`mcp.tool.execute` (USER_CONFIRMATION/MEDIUM, allowlist+policy+audit).
Servers in `mcp_servers` table; tokens in vault. No server exposure.

## 5. Current agent runtime

Renderer-side bounded loop, 8 steps / 6 tools / 120 s run / 30 s per-tool,
in-mem 50-run registry, audit events `agent.run` start/suspend/finish.
No planner/memory/shell/code/browser. Project scope forced from context.
Cross-project input rejected. One attempt per call, no retries.

## 6. Current policy model

`evaluatePolicy(tool, ctx)`: unknown tool/cap/perm/risk → DENY; READ_ONLY → ALLOW;
SYSTEM_INTERNAL → ALLOW w/ flag; USER_INITIATED_WRITE → DENY unless initiated
(+CONFIRM if non-LOW); USER_CONFIRMATION → ALLOW only w/ matching
userConfirmed+confirmedToolId else CONFIRM. Confirmation binds to TOOL ID only
(Phase 8 must bind to full action fingerprint).

## 7. Current audit model

`ToolAuditEvent`: eventId/toolId/version/requestId/timestamp/source/projectId/
permission/risk/decision/status/durationMs/resourceSummary/errorCategory.
Redacted + truncated. Every execution incl. DENY/CONFIRM audited. Lifecycle
ACTION_PROPOSED/CONFIRMATION_REQUIRED/APPROVED/EXECUTED/SUCCEEDED/FAILED/
REJECTED/EXPIRED does NOT exist yet — Phase 8 adds it on the SAME ledger
(new columns? No: reuse resourceSummary + status vocabulary extension is
forbidden to diverge; instead new `action_approvals`/`action_executions`
tables reference audit event ids).

## 8. Current authentication

OAuth main-side only: state/PKCE (`oauthCore.ts` pure + `connectorAuthStore.mjs`
vault `oauth-<id>.blob` 0600). Scopes main-side registry
(`oauthScopeFor` in researchProjectService.mjs) — READ-ONLY least privilege.
Token exchange → vault → real provider verify → CONNECTED.
Gaps found: **no refresh_token grant anywhere** (isTokenExpired only reports);
write scopes deliberately never requested (`deferredWriteScopes`).

## 9. Current sync

Pipeline stages defined; import engine real (hash idempotency, conflicts,
user-authored precedence). BUT `research:connectors sync` op is a metadata stub
(upsert source + return status — no provider fetch). Cursors table exists
(`connector_cursors`) but nothing advances them. No scheduler, no daemon,
no polling. ConnectionWizard copy explicitly promises "manual + on-demand".

## 10. Current persistence

SQLite v11, file-per-project + shared app DB, `getDb` singleton main-serialized,
parameterized SQL, backup debounce. Secrets NEVER in SQLite (OS vault files).

## 11. Current background jobs

`researchJobQueue.mjs`: per-project in-mem queues, worker_threads for
chunk/embed, job types chunk/embed/rechunk/compile/zotero-sync. `research_jobs`
table persists. No connector job type, no scheduler, no cron. Reuse: enqueueJob
+ progress plumbing + shutdown/resume patterns.

## 12. Current UI

Chat (toggle + confirm block + traces), Settings → Integrations hub
(CONNECTED/AVAILABLE/NEEDS ATTENTION, wizard, SyncProgress, SourceFilter,
McpManager, SecurityCenter), ToolPanel (18 tools + audit tail), KnowledgePanel,
ConnectorPanel. No Agents/Workflows/Approvals/Activity/Sync screens.

## 13. Current Electron architecture

5 preload surfaces; one generic channel per domain with switch(op) allowlist
(`research:knowledge|connectors|connectorAuth|mcp|tools`). Tokens never cross
IPC. SSRF-safe fetches, ipcValidate, externalUrlPolicy, navigationPolicy.

## 14. Existing write/action infrastructure (reusable)

- `connector.import` CONFIRM flow (policy → CONFIRM result → ToolPanel/
  ChatMessages confirm block → re-execute w/ userConfirmed) — the UX pattern.
- `resumeAgentRun` exact-tool binding — extend to fingerprint binding.
- Vault + authorizedFetchFor host allowlist — reuse for writes.
- providerHttp bounded fetch — reuse.
- Audit ledger + record/list — reuse, extend resourceSummary.

## 15. What can be reused

toolCore (schemas/policy/audit-scrub), toolStore executor + timeout + audit,
agentRuntime loop + suspension, connector providers pattern, vault, IPC
allowlist pattern, researchJobQueue progress/shutdown, connectorStore import/
identity/normalize/evidence, knowledge graph + traversal, unifiedSearch fan-out.

## 16. What must be extended

- toolCore: 7 new capabilities + 7 WRITE tool definitions + fingerprint helpers.
- Providers: 5 new write client modules (real POST endpoints).
- connectorAuthStore: refresh grant + write-scope re-auth mode.
- researchProjectService: write scopes, new IPC domains (actions/sync/
  workflows/agents/mcpserver).
- researchDb: v12 (action_approvals, action_executions, sync_config,
  workflows, workflow_runs, mcp_server_config).
- agentDefinitions: 5 role configs (same AgentDefinition shape).
- knowledgeCore/entityTypes/relationshipTypes: +8 entity types, +new rel types.
- UI: Agents/Sync/Workflows/Approvals/Activity + chat approval cards.

## 17. What is missing (must be built)

Approval-bound confirmation (fingerprint, expiry, single-use, idempotency
dedupe); real sync pipeline + scheduler; workflow engine + triggers;
MCP server; role configs + UI; ontology additions; entity resolution helper.

## 18. Security implications

Write OAuth scopes expand blast radius → incremental re-auth, verify-after-
upgrade, scope display. Refresh tokens in vault. Approval forgery →
fingerprint binding + main-side single-use consume + expiry. Replay/duplicate
→ idempotency keys + executions table + provider idempotency where supported
(GitHub no native idempotency → Openbentt key + pre-check; Gmail send no native
→ key + unknown-state handling). MCP server → OFF default, localhost-only,
vault bearer, read-only default, writes need pre-existing approval. SSRF →
extend ENTERPRISE_HOSTS reuse, no new hosts except provider bases already used.

## 19. Exact Phase 8 scope

8B action framework (7 tools, fingerprint, idempotency); 8C approvals;
8D provider writes (draft-first; Gmail draft/send, Calendar create, Slack send,
GitHub issue/PR, Notion page — only where real API verified); 8E sync pipeline
+scheduler+dashboard; 8F 5 roles + Agents UI; 8G workflows (manual/schedule/
sync_completed, tool/approval steps) + UI; 8H Approval Center; 8I Activity;
8J ontology + same-namespace resolution; 8K MCP server (opt-in); 8L chat UX;
8M integration; 8N security tests; 8O live matrix (cred-gated, else BLOCKED);
8P Electron checks; 8Q regression; 8R docs.

## 20. Explicitly deferred

calendar.update, gmail.modify/labels, drive writes, slack channels:manage,
github merge, notion update, social publish, finance actions, visual workflow
builder, multi-user IAM (single-user desktop: document boundary), autonomous
background actions (sync is read-only; workflow actions create approvals).

## 21. Protected files (extend, don't rewrite)

toolCore.mjs (additive), agentRuntime.ts (untouched; roles are config),
knowledgeCore.mjs + entity/relationshipTypes (additive ids only),
connectorCore.mjs (untouched), connectorStore import/identity (reuse),
researchDb migrations (additive v12 only), preload surface shape.

## 22. Expected files to change / create

CREATE: src/lib/actions/actionCore.mjs, providers/{gmailWrite,
googleCalendarWrite, slackWrite, githubWrite, notionWrite}.mjs,
src/lib/agents/agentRoles.ts, src/lib/workflows/workflowCore.mjs,
src/lib/sync/syncSchedule.mjs, src/lib/mcp/mcpServerCore.mjs,
electron/{actionStore, syncScheduler, workflowStore, mcpServer}.mjs,
UI: AgentsPanel, SyncDashboard, WorkflowsPanel, ApprovalsCenter,
ActivityFeed, ActionApprovalCard + tests + 8 docs.
EDIT: toolCore.mjs, toolStore.mjs, toolHandlers.ts, toolApi/toolWebStore,
connectorAuthStore.mjs, researchProjectService.mjs, researchDb.mjs,
preload.cjs, agentDefinitions.ts (registry add), ChatContext/ChatMessages/
ChatInput/SettingsPanel, enterpriseConnectors.ts (write-scope docs),
knowledge entity/relationship types, package.json test:electron script.
