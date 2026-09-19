# Openbentt Phase 8 — Controlled Actions

## Tool inventory (all USER_CONFIRMATION, mutation, backend-only)

| Tool | Capability | Risk | Provider endpoint |
|---|---|---|---|
| gmail.create_draft | gmail.draft | MEDIUM | POST users.drafts.create |
| gmail.send | gmail.send | HIGH | POST users.messages.send |
| calendar.create_event | calendar.create | MEDIUM | POST calendars/{id}/events |
| slack.send_message | slack.send | MEDIUM | POST chat.postMessage |
| github.create_issue | github.issue | MEDIUM | POST repos/{o}/{r}/issues |
| github.create_pull_request | github.pr | HIGH | POST repos/{o}/{r}/pulls |
| notion.create_page | notion.create | MEDIUM | POST v1/pages |

Draft-before-send is the doctrine: gmail.create_draft is MEDIUM and never
sends; gmail.send is HIGH. Slack has no provider draft API — "draft" for
Slack is a local-only UI preview, never presented as provider state.

## Confirmation binding

Fingerprint = fnv1a(tool | project | canonical(material input)).
`idempotencyKey` is transport and excluded. Approval rows carry the
fingerprint + 15-min expiry + optional run binding; consume is single-use and
re-verifies tool, project, run, fingerprint, status, expiry. Any material
change invalidates the confirmation (parameter-substitution defense).

## Target scope (fail closed, validated twice: schema + actionCore)

Emails (RFC-style check, ≤20 recipients), repo slugs (owner/name, no URLs),
Slack channels, calendar ids, branch names (head ≠ base), Notion parent ids,
event time order. Project/user/provider authorization: fingerprint binds the
project; the write grant binds the provider account scopes.

## Idempotency

Caller key or generated key per execution. Succeeded keys replay the stored
verified result (deduplicated, no provider call). Timeouts record
EXECUTION_STATUS_UNKNOWN and block blind retry — investigate with a new key.
GitHub/Gmail offer no native idempotency; the Openbentt key + executions
table is the mechanism (documented, tested).

## Result reporting

Success is claimed ONLY after provider-response parsers accept the payload
(draft/message/event/ts/number/page ids). Provider URLs shown where safe
(GitHub issue/PR, calendar link, Notion page).

## Audit lifecycle (same ledger, resourceSummary.lifecycle)

ACTION_PROPOSED → ACTION_CONFIRMATION_REQUIRED → ACTION_APPROVED →
ACTION_EXECUTED → ACTION_SUCCEEDED, or ACTION_FAILED / ACTION_REJECTED /
ACTION_EXPIRED / ACTION_DEDUPLICATED / ACTION_STATUS_UNKNOWN.
