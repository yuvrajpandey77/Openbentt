# OPENBENTT PHASE 7 — SECURITY

## 1. Threat model additions (extends docs/THREAT_MODEL.md)

| Threat | Control |
|---|---|
| Credential exposure to model | Tokens vault-only; IPC/renderer/audit carry metadata; `redactTokenForStatus`; audit `summarizeForAudit` pattern redaction |
| Fake connection status | CONNECTED only after real provider verify; UI reads main state |
| OAuth CSRF / scope escalation | Single-use 10-min state, connector-bound; scopes main-side registry only; PKCE S256; loopback callback; secrets from operator env |
| SSRF via provider/MCP URLs | `assertProviderUrl` + `isEnterpriseProviderHost` allowlists; MCP remote HTTPS-only + operator host allowlist; manual redirects with per-hop revalidation |
| Malicious provider/MCP content | Bounded JSON (depth/size), sanitizers, injection scan (`scanMcpContentForInjection`) fail-closed, `[BEGIN/END UNTRUSTED TOOL DATA]` framing |
| MCP privilege escalation | Adapter risk inference (mutation→CONFIRM/HIGH); allowlist denial; unknown tools denied; disabled servers never execute; stdio only exact-allowlisted commands, no shell |
| Silent external mutation | All Phase 7 capabilities READ_ONLY; `mcp.tool.execute` USER_CONFIRMATION; no send/merge/delete paths exist in any provider module |
| Cross-project leakage | `projectId` validated + audited per call; enterprise fan-out carries context project; knowledge import preserves project scoping |
| Single-source outage | Per-source try/catch → `skippedSources`/`failedSources`; agent runtime unaffected |
| Stale-data confusion | `verifiedAt`/`lastSyncAt` surfaced; local vs remote labeled in Security Center |

## 2. What was audited

- `connectorSecurity.fetchConnectorJson` header filter **fixed**: explicit
  `CREDENTIAL_HEADER_ALLOWLIST` (`zotero-api-key`) instead of blanket
  `api[_-]?key` strip — renderer Zotero auth was silently broken.
- All 6 provider modules verified to contain zero write endpoints
  (grep: no `POST|PUT|PATCH|DELETE` except Notion `/search` + `/query`
  read POSTs and the main-side OAuth token exchange).
- `validateExternalUrl` + `assertProviderUrl` dual layer; `githubGetFile`
  path traversal guard (`..` rejected, segments encoded).
- Preload: 5 surfaces preserved (`check-electron-security` green).
- IPC: 2 new channels, both op-allowlisted, unknown op → throw.
- Vault files 0600/dir 0700; fallback reported to UI.

## 3. Security test inventory (all passing)

Renderer (vitest): SSRF host rejection, 401/429/oversized/non-JSON
mapping, OAuth state mismatch/expiry, callback error paths, PKCE shape,
MCP config rejection (http/plaintext/bad id/transport), endpoint
non-allowlist denial, non-allowlisted tool denial, malformed tool denial,
injection detection (8 patterns), secret redaction in audit, CONFIRM
suspension for `mcp.tool.execute`, no-fabrication web fallback.
Main (node:test): unknown-connector rejection, token vault round-trip +
safe status (no token leakage assertion), single-use state, v11 tables,
connection meta without secrets, cursor tracking, MCP CRUD + vault/token
separation, unified_search empty+skipped (never fabricated), per-source
failure isolation, audit project scoping, unknown-server/tool denial,
unconfirmed CONFIRM suspension.

## 4. Residual risks (honest)

1. Web BYOK keys remain localStorage-plaintext (Phase 1 documented).
2. Gmail/Slack snippets may contain sensitive user content — bounded
   (400 chars/hit) and provenance-labeled, but operators should scope sync.
3. OS-vault fallback file is restricted-permission plaintext when
   `safeStorage` is unavailable — reported in UI per connector.
4. Live provider verification requires operator credentials (BLOCKED by
   default; setup in INTEGRATIONS doc).
