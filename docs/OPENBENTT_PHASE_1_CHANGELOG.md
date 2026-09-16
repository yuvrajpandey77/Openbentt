# Openbentt Phase 1 Changelog — Security Foundation

Base: `9abfd68a`. No commits made by the implementation (working tree only).
Conventions: `M` modified, `A` added, `D` deleted.

## Modified files (25)

- M `vite.config.ts` — `openbenttCspPlugin()` injects canonical CSP `<meta>` on `vite build` only.
- M `docker/nginx-docker.conf` — serves the identical CSP as an HTTP header (+ `frame-ancestors`).
- M `package.json` — `test:csp` + `postbuild` gate; `test:electron` extended with 5 new suites;
  removed `@react-oauth/google`, `jwt-decode`.
- M `package-lock.json` — removals only (2 entries + references); no version changes.
- M `scripts/check-electron-security.mjs` — asserts navigation-policy wiring + URL-policy tokens.
- M `electron/main.mjs` — `registerNavigationPolicy(win)` in `createWindow`.
- M `electron/desktopWindowIpc.mjs` — `desktop:openExternal` uses centralized HTTPS-only policy.
- M `electron/secretVault.mjs` — `vaultStatus` reports per-key plaintext-`fallback` presence.
- M `electron/hfSecretStore.mjs` — `hfSecret:status` reports `fallback`.
- M `electron/zoteroSecretStore.mjs` — `zoteroSecret:status` reports `fallback`.
- M `server/research-proxy.mjs` — body cap, content-type/origin/rate gates, upstream timeouts,
  input caps, generic 500s, import-safe (no listen on import).
- M `server/latex-compile.mjs` — body cap, content-type allowlist, bundle validation,
  `resolveInside` traversal containment, per-pass compile timeout, generic 500s, import-safe.
- M `api/latex-compile.ts` — https-only upstream, 8 MB cap, 120 s timeout, generic 502s.
- M `src/App.tsx` — 10 route-level `FeatureErrorBoundary` wrappers.
- M `src/context/ChatContext.tsx` — persist path honors memory-only keys (web opt-in).
- M `src/components/SettingsPanel.tsx` — desktop-aware storage notes, vault/HF fallback warnings,
  memory-only keys switch (web), HF fallback-aware note.
- M `src/lib/userFacingError.ts` — outputs scrubbed via `redactSecretsInText`.
- M `src/lib/privacy/redactForLogs.ts` — added `redactSecretsInText`.
- M `src/lib/privacy/privacyPreferences.ts` — added `memoryOnlyApiKeys` (default false).
- M `src/lib/privacy/desktopSecrets.ts` — `VaultStatus.fallback`, `apiConfigForMemoryOnlyStorage`.
- M `src/lib/localGguf/desktopApi.ts` — `HfSecretStatus.fallback?`.
- M `src/lib/zotero/desktopApi.ts` — `secretStatus` gains `fallback?`.
- M `src/lib/offline/mode.test.ts` — fixture literal extended for the new pref field (no weakening).
- M `.env.example` — commented Phase 1 proxy/compile env knobs (docs only).

## Added files (24)

- A `scripts/csp-policy.mjs` + `scripts/csp-policy.d.mts` — canonical CSP (single source of truth).
- A `scripts/check-csp-artifacts.mjs` — dist + nginx CSP verification gate.
- A `electron/externalUrlPolicy.mjs` (+ `.test.mjs`, 6 tests) — centralized URL policy.
- A `electron/navigationPolicy.mjs` (+ `.test.mjs`, 4 tests) — nav/window/permission policy.
- A `electron/log.mjs` (+ `.test.mjs`, 3 tests) — main-process structured logger.
- A `server/httpPolicy.mjs` (+ `.test.mjs`, 8 tests) — body caps, origin policy, rate limit, timeouts.
- A `server/research-proxy.test.mjs` (8 tests), `server/latex-compile.test.mjs` (9 tests).
- A `src/lib/appError.ts` (+ `.test.ts`, 7 tests) — error taxonomy.
- A `src/lib/log.ts` (+ `.test.ts`, 3 tests) — renderer structured logger.
- A `src/components/FeatureErrorBoundary.tsx` (+ `.test.ts`, 5 tests).
- A `src/lib/privacy/redactForLogs.test.ts` (6 tests), `src/lib/privacy/desktopSecrets.test.ts` (2 tests).
- A `docs/OPENBENTT_PHASE_1_SECURITY_FOUNDATION.md`, `docs/OPENBENTT_PHASE_1_CHANGELOG.md` (this file).

## Removed

- D `bun.lockb` — zero bun references anywhere; npm (`package-lock.json`, CI `npm ci`) is canonical.
- Deps `@react-oauth/google@^0.12.1`, `jwt-decode@^4.0.0` — zero usages repo-wide (code, scripts, CI,
  docs); no auth implemented (deferred to its dedicated phase).

## Security changes

CSP enforced (web/Electron/nginx) with build gate; Electron navigation/window/permission lockdown;
centralized HTTPS-only external-URL policy; secret scrubbing in errors + logs; explicit vault
fallback reporting; memory-only web keys opt-in; proxy origin/rate/body/timeout hardening; LaTeX
traversal + timeout + validation hardening; edge-forwarder https/cap/timeout hardening.

## Test changes

+61 new tests (13 Electron/node URL+nav, 3 main logger, 25 server, 23 renderer incl. taxonomy,
logger, boundary, redaction, memory-only); 5 suites added to `test:electron`; `test:csp` gate added
and wired to `postbuild`; static electron-security gate extended. No existing test weakened
(one fixture literal extended for a new required pref field).

## Dependency changes

Two removals (above). Zero additions. Zero version bumps.

## Behavior changes (intentional, documented)

1. `desktop:openExternal` rejects `http:` (previously regex-allowed); no in-app caller used http.
2. Helper-server misuse responses: 415/403/429/400 JSON (research), 415/400/504 + connection
   termination on over-cap bodies (both servers); success/error payload shapes for legitimate
   callers unchanged (200/503/500-tex-log paths preserved).
3. LaTeX catch-all errors are generic "compile failed" (was: exception text with tmpdir paths).
4. Research proxy catch-all is generic "research failed" (was: upstream error text).
5. Dev server (`vite dev`) intentionally carries no CSP (HMR requirement); all builds do.

## Explicitly NOT in Phase 1

Agents, tools, MCP, connectors (Gmail/Drive/Slack/Notion/…), authentication, authorization,
ontology, workflows, enterprise sync, scalable RAG, UI redesign, large-file refactors,
database/ORM changes, new backends or microservices.
