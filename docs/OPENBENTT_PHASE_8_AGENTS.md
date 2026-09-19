# Openbentt Phase 8 — Role Agents

Roles are configurations, not runtimes. The Phase 6 driveLoop is untouched;
`agentDefinitions.ts` registers all five roles over the same loop, policy,
and audit.

| Role | Access | Write proposals | Task categories |
|---|---|---|---|
| research-assistant | read-only | none (import only) | ask, search, analyze, summarize |
| executive-assistant | read-draft | gmail drafts, calendar events, gmail.send (HIGH) | briefing, triage, draft, schedule |
| marketing-assistant | read-actions | drafts, slack.send, notion.create | research, draft, outreach, content |
| engineering-assistant | read-actions | github issues, PRs (HIGH), notion.create | investigate, triage, issue, pull-request |
| operations-assistant | read-actions | standard writes + gmail.send | coordinate, schedule, follow-up, summarize |

Rules enforced structurally: allowlists are registry subsets (tested); write
tools stay USER_CONFIRMATION + fingerprint-bound regardless of role; the
model cannot confirm (resume path consumes only trusted-UI approvals);
project scope is forced from context; AI CEO/CMO-style exposure is these
same gated roles — no unrestricted company access exists anywhere.

Chat uses the role selected in Settings → Agents (persisted, validated,
research-assistant fallback). Agents UI shows name, sources, tools,
permissions, risk, limits, status per role.
