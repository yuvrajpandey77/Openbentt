# OPENBENTT PHASE 7 — MCP

> MCP is a CONTROLLED integration layer: MCP Server → MCP Adapter →
> Tool Definition → Registry → Policy → Executor → Audit.
> Agent → MCP directly is architecturally impossible (no path exists).

## 1. Decision: client-first

- **A. MCP client: IMPLEMENTED.** Users configure approved servers;
  discovery (tools/resources) is real JSON-RPC 2.0.
- **B. MCP server exposure: DEFERRED.** No rationale to expose the local
  workspace this phase; documented for Phase 8 consideration.

## 2. Protocol (real)

`src/lib/mcp/mcpClient.ts` implements Streamable HTTP JSON-RPC 2.0 per
https://modelcontextprotocol.io: `initialize` (+ best-effort
`notifications/initialized`), `tools/list`, `resources/list`,
`tools/call`, `resources/read`. Accepts a single JSON object or the last
`data:` line of an SSE stream. Timeouts (30s), 1MiB response cap,
128-tool / 256-resource bounds. `electron/mcpStore.mjs:mcpRpc` is the
protocol-identical main-process twin (main cannot import TS) + stdio
execution for exact-allowlisted commands only.

## 3. Security model

1. Unknown servers never trusted (explicit add; disabled by default-off? —
   enabled flag visible; disabled never executes).
2. Remote = HTTPS-only + `OPENBENTT_MCP_ALLOWED_HOSTS` operator allowlist.
3. stdio = exact command allowlist `OPENBENTT_MCP_STDIO_ALLOWLIST`, no
   shell, spawnSync timeout + maxBuffer.
4. Tool allowlist per server (optional); non-listed tools denied.
5. Adapter risk inference fail-closed: mutation hints → USER_CONFIRMATION/
   HIGH; network hints → CONFIRM/MEDIUM; malformed names denied.
6. Resources/results are untrusted: injection scan (fail-closed) +
   `[BEGIN/END UNTRUSTED TOOL DATA]` framing for the model.
7. Every call audited with server/tool/decision/duration; tokens vaulted.

## 4. Deferred transports

Raw TCP, stdio commands outside the allowlist, unallowlisted remote hosts,
OAuth dynamic client registration — DEFERRED with rationale (ambient
authority / SSRF / code execution). The current architecture cannot safely
support them without operator allowlists, so they are denied, not
implemented.

## 5. Operator setup

```sh
export OPENBENTT_MCP_ALLOWED_HOSTS="mcp.example.com"
export OPENBENTT_MCP_STDIO_ALLOWLIST="/usr/local/bin/openbentt-mcp-docs"
```

Add servers in Settings → MCP. Bearer tokens (if the server needs one) go
through `research:mcp setToken` → OS vault, never SQLite.
