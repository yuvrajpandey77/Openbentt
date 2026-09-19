# OPENBENTT PHASE 7 — ARCHITECTURE

> Enterprise Connectivity + MCP + Integration Experience.
> Base: v2.2.5, schema v11. All Phase 0–6 capabilities preserved.

## 1. Before / after

**Before (Phase 6):** 2 research connectors (Crossref public, Zotero api-key) →
normalize → identity → import → knowledge; 15 static tools; 1 agent;
no OAuth, no enterprise providers, no MCP, no integration UI.

**After (Phase 7):** the same pipeline, extended:

```
USER / AGENT
  ↓
CONNECTOR / MCP TOOL            (Tier-1 providers, MCP servers)
  ↓
REGISTRY                        (connectorRegistry + TOOL_DEFINITIONS, static)
  ↓
POLICY                          (Phase 5 evaluatePolicy, unchanged)
  ↓
EXECUTOR                        (toolStore main / toolHandlers web)
  ↓
AUDIT                           (tool_audit_events, unchanged shape)
```

The model is never the security boundary. No Agent→provider or
Agent→MCP direct path exists.

## 2. Connector platform

- **Contract:** `connectorCore.mjs` — `CONNECTOR_IDS` (8: 2 research + 6
  Tier-1), `CONNECTOR_META` (authMode `oauth` for Tier-1),
  `CONNECTOR_CAPABILITIES`, `CONNECTION_STATES` (8-state machine with
  explicit transitions), `SYNC_STAGES` (9 observable stages),
  `validateExternalResource` / `externalResourceId` (unified model).
- **Metadata:** `enterpriseConnectors.ts` — per provider: real `apiBase`,
  OAuth endpoints, least-privilege `scopes`, `deferredWriteScopes`
  (never requested), `supportedResources`, rate-limit notes, docs URLs.
- **Provider clients** (`providers/*.mjs`, plain-JS SSOT shared by renderer
  + main): `providerHttp.mjs` (allowlisted hosts, 15s timeout, 2MiB cap,
  single Retry-After retry, stable error kinds) + 6 clients:
  Drive v3, Gmail v1, Calendar v3, Slack Web API, GitHub REST, Notion v1.
  Each exports pure URL builders + normalizers (unit-tested) and
  `*VerifyConnection` (real authenticated request — the ONLY path to
  CONNECTED).
- **Auth:** `oauthCore.ts` (state/PKCE/scopes/callback/expiry, pure) +
  `electron/connectorAuthStore.mjs` (OS-vault tokens
  `oauth-<id>.blob`, single-use CSRF states, `authorizedFetchFor`
  allowlisted-host bearer attach). Tokens never enter SQLite/IPC/renderer.
- **Sync:** Phase 4 engine reused unchanged; `connector_connections`
  (metadata) + `connector_cursors` (incremental, per-scope) added in v11.
  No daemon — explicit user-initiated sync only.
- **Search:** `unifiedSearch.ts` — fan-out orchestrator over per-source
  searches with per-source bounds, failure isolation, provenance on every
  hit. Knowledge mapping (`mapExternalResourceToKnowledge`) targets the
  EXISTING 13-type/18-relation ontology — no second graph.

## 3. Tool surface (18 tools, +3)

| Tool | Permission | Risk | Path |
|---|---|---|---|
| `connector.unified_search` | READ_ONLY | LOW | main fans out to connected providers; web searches real local data, reports enterprise skipped |
| `mcp.resource.read` | READ_ONLY | LOW | main only; injection-scanned + DATA-wrapped |
| `mcp.tool.execute` | USER_CONFIRMATION | MEDIUM | main only; allowlist + policy + audit |

All 15 Phase 5 tools unchanged. `connector.get` pattern extended to Tier-1.

## 4. MCP

`src/lib/mcp/`: `mcpTypes` (config validation, https-only remote),
`mcpClient` (JSON-RPC 2.0 Streamable HTTP: initialize/list/call/read,
SSE-tolerant, timeouts + 1MiB caps), `mcpAdapter` (tool→ToolDefinition,
fail-closed risk inference, allowlist denial), `mcpSecurity`
(allowlist assert, injection scan, DATA wrap, redaction).
`electron/mcpStore.mjs`: metadata CRUD (v11 `mcp_servers`), vault tokens,
main-side RPC twin (protocol-identical), stdio only for exact-allowlisted
commands (`OPENBENTT_MCP_STDIO_ALLOWLIST`), remote only for allowlisted
hosts (`OPENBENTT_MCP_ALLOWED_HOSTS`).

## 5. UI

Settings → Integrations (`IntegrationsHub`: CONNECTED/AVAILABLE/NEEDS
ATTENTION), `ConnectorDetail` (identity/scopes/verify/disconnect-confirm),
`ConnectionWizard` (6-step consent flow, OS-browser OAuth), `SyncProgress`
(stage display, real counts), `McpManager` (add/enable/disable/remove),
`SecurityCenter` (what-can-access), `SourceFilter` (agent-mode chat scope
as trusted app state via `ChatContext.sourceScope`, persisted).

## 6. Electron / IPC

Preload stays at 5 surfaces; `openbenttResearch` gains metadata-only
`connectorAuth(op)` + `mcp(op)` methods. New channels
`research:connectorAuth` (status/beginOAuth/completeOAuth/disconnect/
setCursor) and `research:mcp` (list/get/add/remove/setEnabled/setToken/
hasToken) are op-allowlisted. `beginOAuth` fails with setup instructions
when operator client-id env is absent — never a fake flow. `completeOAuth`
= state check → main-side exchange → vault → REAL verify → CONNECTED.

## 7. Files changed / added

Modified (16): connectorCore, connectorSecurity (Zotero header-allowlist
fix), connectorRegistry, toolCore (+3 defs), toolHandlers (+3 web
handlers), agentDefinitions (allowlist), connectorStore (Tier-1 ids +
connection/cursor ops), toolStore (+3 executors + unified search fan-out),
researchDb (v11), researchProjectService (+2 channels + OAuth completion),
preload (+2 methods), ChatContext (+sourceScope), ChatInput (+SourceFilter),
SettingsPanel (+Integrations tab), package.json (tests + pack files).
New (27): enterpriseConnectors, oauthCore, providers×7, unifiedSearch,
connectorAuthApi, mcp×5, connectorAuthStore, mcpStore, 7 UI components,
3 test files. Dependencies added: **zero**.
