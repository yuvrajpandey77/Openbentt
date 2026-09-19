# Openbentt Phase 8 — Workflows, Approvals, Activity, Sync

## Workflow engine (minimal, deterministic, real)

Model: TRIGGER → CONDITION → AGENT/TOOL → APPROVAL → ACTION → AUDIT.
Triggers (real only): manual, schedule (5–1440 min interval, 60 s tick),
sync_completed (dispatched by the sync scheduler with real run detail).
No simulated events exist in any path.

Steps: tool_call (executes via executeToolMain, policy enforced),
approval_wait (resumes only on approved/consumed), condition (tiny
`field op value` evaluator over run state; anything else is false).
A CONFIRM decision suspends the run as awaiting_approval with the minted
approval id; resume binds the resolved approval from persisted run state
(stepApprovals) and re-verifies the fingerprint at consume time.
Rejected/expired approvals fail the run loudly — never silently.

## Approval Center

Central queue: pending action, agent/run, provider, target preview, risk,
created, expiry. Approve / Reject / Inspect. Polls every 15 s. Chat shows
the same card inline for the suspended run (Approve & continue resumes it).

## Activity

Verified actions (executions table: provider, external id, timestamp),
workflow runs, and the audit trail (60 latest events incl. lifecycle tags)
in one traceable feed.

## Background sync (real pipeline, user-controlled)

Off by default; per-connector enable + 5–1440 min interval. 60 s tick,
sequential, one connector at a time, bounded pages (25/run):
token check → provider list primitives → normalize → Phase 4 import
(hash dedupe, conflicts, user-authored precedence) → evidenced
same-namespace identity linking (≤10/run) → cursor advance → sync-run
record → audit (toolId connector.sync) → sync_completed dispatch.
Only transient failures retry (interval×2^failures, ≤24 h cap); auth
failures surface as needs-attention without hot retry. Per-source and
per-item failure isolation throughout.

## MCP server exposure

OFF by default, loopback-only (127.0.0.1), vault bearer (rotated in UI,
shown once), 60 req/min, 64 KiB bodies, JSON-RPC tools/list + tools/call.
Only user-selected READ_ONLY tools are exposed (write tools refused even if
configured); every call runs through policy + audit as source mcp-server.
