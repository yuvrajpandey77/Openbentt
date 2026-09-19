# OPENBENTT PHASE 7 — INTEGRATIONS

> Real API references. Every endpoint below is implemented in
> `src/lib/connectors/providers/*.mjs`. Status honesty rule: UI reflects
> real provider state; anything untestable here is BLOCKED, not mocked.

## Integration matrix

| Provider | Auth | Search | Sync | Import | Provenance | Live tested | Status |
|---|---|---|---|---|---|---|---|
| Google Drive | REAL (OAuth, `drive.readonly`) | REAL | REAL (cursor) | REAL | REAL | NO — needs operator OAuth client | PARTIALLY IMPLEMENTED |
| Gmail | REAL (OAuth, `gmail.readonly`) | REAL | REAL (cursor) | REAL | REAL | NO | PARTIALLY IMPLEMENTED |
| Google Calendar | REAL (OAuth, `calendar.readonly`) | REAL | REAL (cursor) | REAL | REAL | NO | PARTIALLY IMPLEMENTED |
| Slack | REAL (OAuth, least-privilege) | REAL | REAL (cursor) | REAL | REAL | NO | PARTIALLY IMPLEMENTED |
| GitHub | REAL (OAuth) | REAL | REAL (cursor) | REAL | REAL | NO | PARTIALLY IMPLEMENTED |
| Notion | REAL (OAuth) | REAL | REAL (cursor) | REAL | REAL | NO | PARTIALLY IMPLEMENTED |

PARTIALLY IMPLEMENTED = production code paths are real (auth, verify,
pagination, errors, sync, provenance, audit, UI state); live provider
verification is blocked on operator credentials. No mock provider exists
anywhere in production code.

## 1. Google Drive — Drive API v3

- Reference: https://developers.google.com/drive/api/reference/rest/v3
- Auth: OAuth `drive.readonly + drive.metadata.readonly`.
- Endpoints: `GET /drive/v3/about?fields=user` (verify),
  `GET /drive/v3/files` (list/search, `q`, `pageToken`, `fields` masking,
  `supportsAllDrives`), `GET /drive/v3/files/{id}` (metadata).
- Pagination: `pageSize ≤ 100`, `nextPageToken` → cursor.
- Resources: folder/document/spreadsheet/presentation/pdf/text/file.
- Limits: 15s timeout, 2MiB cap, single 429 retry; trashed excluded.
- Disconnect: vault token deleted; local index kept (removable separately).

## 2. Gmail — Gmail API v1 (READ ONLY)

- Reference: https://developers.google.com/gmail/api/reference/rest
- Auth: OAuth `gmail.readonly`. Send/modify scopes listed as deferred and
  never requested; no send path exists in code.
- Endpoints: `users.getProfile` (verify), `users.messages.list` (`q`,
  `maxResults`, `pageToken`), `users.messages.get` (metadata + bounded
  full), `users.threads.get`.
- Bodies bounded (snippet ≤ 2000 chars indexed, 400 chars/hit shown).

## 3. Google Calendar — Calendar API v3 (READ ONLY)

- Reference: https://developers.google.com/calendar/api/v3/reference
- Auth: OAuth `calendar.readonly`. No insert/update/delete paths exist.
- Endpoints: `calendarList.list` (verify), `calendars/{id}/events.list`
  (`singleEvents`, time windows, `q`), `events.get`.
- Search fans out over ≤ 5 calendars × 4 results (bounded).

## 4. Slack — Web API (READ ONLY)

- Reference: https://api.slack.com/methods
- Auth: OAuth `channels:history,channels:read,groups:history,groups:read,users:read,search:read`.
- Endpoints: `auth.test` (verify), `conversations.list`,
  `conversations.history`, `search.messages`.
- `ok:false` mapped: `ratelimited→rate_limited`,
  `invalid_auth/token_revoked→authentication_failed`,
  `missing_scope→permission_denied`. No `chat.postMessage` path exists.

## 5. GitHub — REST API (READ ONLY)

- Reference: https://docs.github.com/en/rest
- Auth: OAuth `read:user read:org public_repo repo:status`.
- Endpoints: `GET /user` (verify), `/user/repos`, `/search/issues`
  (issues+PRs), `/repos/{o}/{r}/contents/{path}` (bounded 8k snippet,
  base64 decoded locally). No merge/push/create/delete paths exist.

## 6. Notion — API v1 (READ ONLY)

- Reference: https://developers.notion.com/reference/intro
- Auth: OAuth (workspace-scoped by provider). `Notion-Version: 2022-06-28`
  pinned main-side. No page-create/update paths exist.
- Endpoints: `POST /search`, `GET /pages/{id}`,
  `GET /blocks/{id}/children` (text ≤ 8k). Users-list bounds verify.

## Operator setup (per connector)

```sh
# Example: Gmail
export OPENBENTT_GMAIL_CLIENT_ID="<oauth-client-id>"
export OPENBENTT_GMAIL_CLIENT_SECRET="<oauth-client-secret>"
# Optional: export OPENBENTT_OAUTH_PORT="9876"   # loopback callback port
```

Env keys: `OPENBENTT_GOOGLE_DRIVE_CLIENT_ID/_SECRET`,
`OPENBENTT_GMAIL_CLIENT_ID/_SECRET`,
`OPENBENTT_GOOGLE_CALENDAR_CLIENT_ID/_SECRET`,
`OPENBENTT_SLACK_CLIENT_ID/_SECRET`, `OPENBENTT_GITHUB_CLIENT_ID/_SECRET`,
`OPENBENTT_NOTION_CLIENT_ID/_SECRET`. Without them, `beginOAuth` returns
an explicit setup error (BLOCKED, never faked). Register the loopback
redirect `http://127.0.0.1:9876/oauth/callback` in each provider console.

## Tier 2/3

OneDrive, SharePoint, Dropbox, Linear, Jira, Confluence, GitLab, Box,
Discord, Teams, generic REST/webhook: PLANNED. The platform
(`enterpriseConnectors` registry + provider pattern + vault + fan-out)
accepts them without rebuilding the app; each needs its metadata entry,
provider module, and audit-listed scopes.
