# Openbentt Phase 8 — Security

## Threat coverage (tested or structurally enforced)

- Prompt injection: MCP content scanned + DATA-wrapped (Phase 7, reused);
  tool output never becomes instructions (agent DATA observations, unchanged).
- Fake approval: no renderer propose path; approvals minted main-side only;
  consume verifies tool/project/run/fingerprint/status/expiry, single-use.
- Cross-project actions: fingerprint binds projectId; agent forces scope;
  mismatches denied (tested).
- Wrong account/workspace/repo/calendar/recipient: target validation +
  repo-slug allowlist (no URLs) + write-grant scope binding + exact preview.
- Tool/parameter substitution: fingerprint re-verified at consume (tested).
- Replay/duplicate: single-use approvals + idempotency ledger (tested:
  dedupe replay, unknown-state block).
- Expired/modified approval: TTL + fingerprint (tested).
- MCP bypass: server exposes read-only only, rechecked at call time (tested);
  OFF default, loopback, bearer, rate-limited.
- Connector/policy bypass: all writes flow through policy + gate (no direct
  provider path exists in any runtime; web fallback refuses honestly).
- Secret leakage: tokens never cross IPC/renderer/audit/DB (vault only);
  audit uses redacted summaries; MCP token shown once; approval previews
  contain only user-authorized action data. Verified by zero-mock grep +
  existing redaction tests.
- SSRF: providerPostJson assertProviderUrl + per-connector host allowlists;
  calendar/repo/channel ids pattern-validated; redirects manual (fail closed).
- Oversized/malformed payloads: strict schemas (unknown keys rejected),
  bounded bodies (4–20 KiB caps), 2 MiB response cap, output validation.
- Autonomous behavior: no scheduler-triggered actions (sync is read-only;
  workflow tool steps suspend for approval); no shell/code/browser agents.

## Electron

5 new preload bridges → 5 allowlisted channels with op switches
(security check passed). No renderer access to secrets. Scheduler timers
unref'd; shutdown stops schedulers + MCP server + jobs + DB.

## What was NOT built (still prohibited)

Arbitrary shell/code, browser automation, autonomous finance/destructive
actions, hidden background actions, credential extraction, self-modifying
agents, multi-agent swarms, fake IAM. Single-user desktop: no multi-user
authorization model is claimed (documented boundary).

## Residual risks

- approval input_json stores full action bodies in local SQLite (same trust
  boundary as chat logs; acceptable, documented).
- OAuth refresh for GitHub/Notion fails honestly (no refresh flow) → re-auth.
- MCP bearer is a long-lived token (rotation supported; expiry not imposed —
  documented limitation).
