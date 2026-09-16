# Openbentt Phase 1 — Security Foundation

**Status:** IMPLEMENTED. Base commit `9abfd68a` (Phase 0 audit at `docs/OPENBENTT_PHASE_0_AUDIT.md`).
**Principle applied:** SECURITY > CLEAN CODE. No product capability removed, no large-module refactors,
no new backends, no agents/MCP/connectors/auth (all explicitly deferred).

---

## 1. Scope

What Phase 1 changed, by objective:

- **A — CSP:** canonical policy (`scripts/csp-policy.mjs`) injected as `<meta>` into every production
  build (web + Electron dist), served as an nginx header in Docker, and verified by a build gate
  (`scripts/check-csp-artifacts.mjs` via `postbuild`).
- **B — Electron:** centralized external-URL policy (`electron/externalUrlPolicy.mjs`); navigation /
  window-open / redirect guards + default-deny permission policy (`electron/navigationPolicy.mjs`,
  wired in `createWindow`); `desktop:openExternal` routed through the same policy; static CI gate
  extended to assert the wiring.
- **C — Secrets:** secret-value scrubbing for all user-facing error strings and both loggers;
  explicit plaintext-fallback reporting in all three OS-vault status payloads + UI distinction;
  opt-in memory-only API keys on web (never persisted); desktop vault interfaces unchanged.
- **D — Helper servers:** shared hardening module (`server/httpPolicy.mjs`: body caps, origin policy,
  in-process rate limiting, upstream timeouts); research proxy gated (415/403/429/400, generic 500s);
  LaTeX server hardened (containment-checked bundle writes, per-pass compile timeout, body/content-type
  validation, generic 500s); edge forwarder requires https upstream + caps + timeout.
- **E — Reliability:** per-route `FeatureErrorBoundary` (10 feature seams, redacted diagnostics, retry +
  reload); internal error taxonomy (`AppError`); structured logging boundaries for renderer
  (`src/lib/log.ts`) and main process (`electron/log.mjs`), both redacting.
- **F — Debt (safety-relevant only):** removed `bun.lockb` (npm is canonical; zero bun references);
  removed dead `@react-oauth/google` + `jwt-decode` (zero usages repo-wide).

What Phase 1 deliberately did **not** change: chat flows, streaming contract, providers, comparison mode,
local inference (WebGPU + GGUF), RAG constants, SQLite schema, Zotero, Notebook/PDF, templates,
offline behavior, `cogerphere-*` compatibility, existing storage keys.

---

## 2. Security model

Boundaries after Phase 1 (renderer remains untrusted):

1. **Renderer sandbox** — context isolation, no Node, sandboxed preload (unchanged) **+ CSP**
   (new: strict `script-src`, no inline scripts) **+ navigation/window/permission policy** (new).
2. **Preload bridge** — still exactly 5 surfaces; no new bridges, no new channels added.
3. **Main process** — IPC validation unchanged; `shell.openExternal` now centralized behind the URL
   policy; `spawnSync`/`spawn` call sites unchanged in shape (LaTeX adds timeout + containment).
4. **Secrets** — desktop: OS vault (unchanged interface) with explicit fallback reporting (new);
   web: localStorage default (unchanged) + memory-only opt-in (new) + scrubbed errors/logs (new).
5. **Helper servers** — loopback/dev daemons with origin policy, rate limits, body caps, timeouts (new).
6. **Supply chain** — one lockfile (npm), two dead deps removed, pack-file + security lint gates extended.

---

## 3. CSP

Exact policy (`scripts/csp-policy.mjs`, single source of truth):

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval' https://va.vercel-scripts.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' data: https://fonts.gstatic.com;
img-src 'self' data: blob: https:;
media-src 'self' blob: data:;
connect-src 'self' https: http://127.0.0.1:* http://localhost:*;
worker-src 'self' blob:;
child-src 'none'; frame-src 'none'; object-src 'none';
base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

Rationale per directive (evidence in `csp-policy.mjs` header comments):

- `script-src` has **no `unsafe-inline`** (verified: `dist/index.html` contains zero inline scripts —
  one module script + preloads + JSON-LD, which is CSP-exempt). `wasm-unsafe-eval` (not `unsafe-eval`)
  permits `WebAssembly.compile` for onnxruntime-web and BusyTeX without permitting JS `eval()`.
  `va.vercel-scripts.com` loads only when the user opts into analytics.
- `style-src 'unsafe-inline'` is required and documented: shadcn chart theme blocks inject `<style>`
  at runtime (`ui/chart.tsx:78`), KaTeX emits styled spans, Radix injects positioning styles.
  `fonts.googleapis.com` serves the `@import` in `src/index.css:1`.
- `connect-src` includes bare `https:` deliberately: this is a BYOK client and Settings invites
  arbitrary user-configured OpenAI-compatible HTTPS bases (`https://api.x.ai/v1` placeholder).
  Enumerating hosts would break that feature. Compensations: strict `script-src` (exfiltration still
  needs user action), keys sent only to user-configured URLs, loopback restricted to
  `127.0.0.1:*`/`localhost:*` (covers llama-server, Ollama, dev proxies).
- `frame-ancestors 'none'` is enforced via the nginx header only (stripped from `<meta>`, where the
  spec ignores it — avoids console noise; verified clean console scan).
- Dev server is exempt (HMR needs ws:/inline) — dev stays localhost-only by default.

Verified: `npm run build` → `postbuild` → `test:csp` passes; Playwright e2e passes under the enforced
policy; a 6-route Chromium console scan reported zero CSP violations, page errors, or failed requests.

---

## 4. Electron security

- **Navigation:** `will-navigate` + `will-redirect` handlers classify every URL as `allow`
  (`app://openbentt/*`, Vite dev origin in dev) / `open-external` (validated https → OS browser) /
  `deny` (everything else, with redacted logging).
- **Windows:** `setWindowOpenHandler` always returns `{action:'deny'}`; allowed-https URLs open via
  `shell.openExternal`. No renderer-controlled windows.
- **External URLs:** `parseAllowedExternalUrl` allows only `https:` with hostname and no embedded
  credentials; denies `http:`, `file:`, `javascript:`, `data:`, `blob:`, custom schemes, control
  characters, non-strings. `desktop:openExternal` reuses it (behavior preserved for https, tightened
  for http — previously allowed by regex).
- **Permissions:** `setPermissionRequestHandler` + `setPermissionCheckHandler` default-deny all
  (camera, microphone, geolocation, notifications, clipboard-read, USB/serial/HID, bluetooth, …).
  Verified no feature needs a grant: no `getUserMedia`/`Notification`/`clipboard.read` in `src/`;
  `clipboard.writeText` (copy buttons) is not permission-gated.
- **Regression protection:** `lint:electron-security` now also asserts `registerNavigationPolicy(win)`
  in `main.mjs` plus the handler tokens in the policy modules; unit tests cover classification,
  allowlist, credentials, malformed input, and every evaluated permission (13 tests).

---

## 5. Secret handling

**Desktop (unchanged interfaces, explicit fallback):** `secretVault:status`, `hfSecret:status`, and
`zoteroSecret:status` each gained a `fallback` signal (per-key map for the vault, boolean for
HF/Zotero) reporting whether a restricted-permission plaintext `.secret` file exists on disk.
Settings distinguishes "stored encrypted" from "stored as restricted fallback" for provider keys
(new) and the HF token (extended), including re-save guidance. Permissions (0600 files, 0700 dir),
read/decrypt precedence, and migration behavior are untouched; existing setups keep working.

**Web (BYOK preserved, lifetime minimized):** default remains localStorage (honest limitation
documented below), plus a Privacy opt-in **Memory-only API keys**: when enabled, the persisted
`openbentt-api-config` carries blanked secrets while in-memory state keeps working until reload.
Pure helper `apiConfigForMemoryOnlyStorage` is unit-tested; the ChatContext persist path selects it
(3 lines); desktop ignores the toggle (vault is already the secure path).

**Web secret-storage threat model (stated plainly):** `localStorage`/`sessionStorage`/IndexedDB are
equally readable by any executed XSS and by anyone with disk access — no browser mechanism fixes
that without an account/key server, which Phase 1 refuses to build (local-first). Mitigations that
*are* real: CSP (no inline scripts), no secret logging (below), memory-only opt-in (disk lifetime),
vault on desktop. This is documented here rather than oversold.

**Redaction:** `redactSecretsInText` (provider key shapes: `sk-*`, `sk-or-v1-*`, `sk-ant-*`,
`AIza*`, `xox*`, `hf_*`, `Bearer …`) now wraps every `formatUserFacingError` output and both
loggers; object-key redaction (`redactForLogs`) is reused, not duplicated. Unit-tested (9 tests).

---

## 6. Proxy hardening

**Research proxy** (`server/research-proxy.mjs` + shared `server/httpPolicy.mjs`):

- Body cap 256 KB default (`RESEARCH_PROXY_MAX_BODY_BYTES`) with socket destruction on overflow.
- `Content-Type: application/json` required (415) — matches the real client (`researchProxyClient.ts:43`).
- Origin policy (403): missing/`null` origin, same-origin (Host match — covers nginx deployments),
  loopback, `app://openbentt`, or exact `RESEARCH_PROXY_ALLOWED_ORIGINS` entries. No ambient authority
  exists on the endpoint (no cookies), so residual quota-abuse risk is bounded by rate limiting.
- In-process sliding-window rate limit, 120 req/min/IP default (`RESEARCH_PROXY_RATE_PER_MIN`),
  keyed on `X-Real-IP` → `X-Forwarded-For` → socket; 429 carries `retryAfterMs`.
- 15 s upstream timeouts on all five fetchers (`RESEARCH_PROXY_UPSTREAM_TIMEOUT_MS`); query capped
  at 2000 chars; approved domains validated + capped at 20; generic 500s (details server-side only).
- Importable without side effects (main-module guard) → 17 hermetic `node --test` tests, including a
  hanging-upstream timeout test and an empty-query test that proves no egress.

**LaTeX server** (`server/latex-compile.mjs`): body cap 8 MB; content-type allowlist
(text/plain + application/json — exactly what `latexCompileClient` sends); bundle shape validation
(≤100 files, ≤2 MB each, path length caps); **`resolveInside` containment** for every written path
(closes a `a/../../escape` + absolute-path traversal the old prefix-strip regex missed);
per-pass `spawnSync` timeout (120 s default, SIGKILL); generic 500s (no tmpdir reflection); CORS
kept permissive with a documented rationale (127.0.0.1-bound dev helper; callers are loopback).
Validated by 9 tests including a real `pdflatex` compile and traversal rejection.

**Edge forwarder** (`api/latex-compile.ts`): `LATEX_UPSTREAM_URL` must parse as `https:` (refuses
misconfigured plain-http/internal targets), 8 MB body cap, 120 s upstream timeout, generic 502s.

---

## 7. Logging

What is logged: JSON lines with ISO timestamp, level, component, redacted message, redacted meta —
renderer via `src/lib/log.ts` (`logger.debug/info/warn/error`), main process via `electron/log.mjs`
(`createLogger`). Debug is dev/verbose-only (`import.meta.env.DEV`, `OPENBENTT_VERBOSE=1`);
production emits info and above; logging never throws.

What is prohibited: API keys, bearer tokens, credential-shaped values (scrubbed in messages *and*
meta), document/chat contents (unchanged policy — nothing new is logged about content), secret file
paths beyond directory level. Existing `console.*` call sites were intentionally left in place;
new/touched code uses the boundary. Tests: 3 + 3 redaction/level tests.

---

## 8. Error handling

- **Boundaries:** `FeatureErrorBoundary` wraps 10 route-level feature seams (home, download, share,
  setup, projects, notebook, chat, labs, write, benchmark, on-device models). Fallback names the
  feature, shows a redacted ≤300-char message + reference id, and offers Try again (state reset) and
  Reload (desktop `reloadPage` IPC → `location.reload` fallback). Root `ErrorBoundary` retained.
  Unit-tested without DOM (derived state, fallback content, redaction, truncation).
- **Taxonomy:** `AppError` (`code` ∈ validation/network/provider/authentication/rate-limit/
  local-model/document-processing/storage/ipc/security/configuration/unknown, retryable defaults,
  safe details) + `toAppError` translation (StreamHttpError 429/401-403/5xx mapping, aborts, network
  TypeErrors, never-throws fallback). Additive: no existing error strings changed. Unit-tested (7).

---

## 9. Tests

Added (all passing; counts verified in validation):

- CSP: `test:csp` artifact gate (runs on every `npm run build` via `postbuild`) + 6-route Chromium
  console scan (ad-hoc, clean; documented here).
- Electron (node --test): `externalUrlPolicy` (6), `navigationPolicy` (4), `log` (3).
- Servers (node --test): `httpPolicy` (8), `research-proxy` (8), `latex-compile` (9).
- Renderer (vitest): `redactForLogs` (6), `desktopSecrets` (2), `FeatureErrorBoundary` (5),
  `appError` (7), `log` (3).
- Extended static gate: `lint:electron-security` asserts navigation-policy wiring.
- Full results: tsc PASS · eslint 0 errors · vitest 80 files / 310 passed (1 pre-existing skip) ·
  node --test 68/68 · build+CSP PASS · Playwright 5 passed / 4 pre-existing skips · Electron smoke
  (xvfb, GPU-disabled) PASS · `electron:pack:linux` (AppImage+deb 2.2.5) PASS.

---

## 10. Compatibility

Preserved verbatim: streaming contract, provider dispatch, comparison tiling, WebGPU + GGUF runtimes,
RAG constants (model/dim/chunk/overlap/RRF), SQLite schema + migration chain, GGUF registry format,
Zotero data shapes, template catalog, export formats, all `localStorage` keys, `cogerphere-*`
migration paths, offline degradation, privacy defaults (new prefs default off/false). Two intentional,
documented behavior tightenings: `desktop:openExternal` now rejects `http:` (was regex-allowed;
no in-app caller used http), and server misuse responses changed shape (404/415/403/429/400 JSON or
connection termination — clients only depend on 200/503/500 paths, which are unchanged).

---

## 11. Remaining security gaps

Intentionally deferred (not oversights):

1. No CSP `require-trusted-types` / Trusted Types (React escaping + KaTeX `trust:false` cover today).
2. `style-src 'unsafe-inline'` retained (Radix/KaTeX/chart requirement) — revisit if those move to CSSOM.
3. `connect-src https:` is intentionally broad (BYOK) — a future server-side gateway could narrow it.
4. Desktop data-at-rest encryption (SQLite/PDFs/GGUF) still absent — recommend OS full-disk encryption
   (now stated in Settings).
5. Unsigned macOS/Windows installers; macOS/Windows CI pack not re-validated here (Linux pack only).
6. No request authentication on helper servers (by design: no identities yet — arrives with auth phase).
7. Console-only legacy call sites remain; no metrics/tracing (enterprise observability is later).
8. Interactive desktop validation (chat streaming, model pickers, Zotero sync UX) not exercised
   headless — covered by unit/e2e surface instead; documented in §12/validation report.

---

## 12. Phase 2 prerequisites

What Phase 1 now enables: a strict script-execution baseline for future tool/agent code; a navigation
choke point future deep-links can extend; a permission-deny default future capabilities must
explicitly punch through (auditable); secret-handling primitives (vault status, redaction, memory-only
pattern) the auth/permissions phase can build on; hardened local servers with env-driven policy the
connector phase can reuse; error/logging seams the observability phase can attach to.

---

## Appendix A — Security Decision Records

**A1. CSP shape.** Problem: generic strict CSP breaks WASM + Google Fonts + user-configured HTTPS
endpoints. Options: (a) no CSP (status quo ante), (b) maximal CSP breaking features, (c) evidenced
CSP. Selected (c): tight `script-src` (no inline), `wasm-unsafe-eval` for the two WASM runtimes,
documented `unsafe-inline` for styles, broad `https:` in `connect-src` only. Tradeoff: style injection
and arbitrary-HTTPS exfiltration remain theoretically possible — accepted because keys move only on
user action and scripts cannot be injected. Future: server-side gateway narrows `connect-src`.

**A2. Web secret storage.** Problem: no browser store resists XSS. Options: (a) keep localStorage
only, (b) WebCrypto "encryption" theater, (c) localStorage default + honest docs + memory-only
opt-in. Selected (c). Reason: (b) is false security (key must live in JS); (c) reduces disk lifetime
without pretending XSS protection. Future: credential server arrives with the auth phase — only if
the local-first model explicitly allows it.

**A3. Electron navigation.** Problem: renderer could navigate/create windows arbitrarily. Options:
(a) leave defaults, (b) deny-all breaking research links, (c) allowlist + OS-escalation. Selected
(c): app origins allowed, validated https escalated to the OS browser, everything else denied with
redacted logs. Tradeoff: none observed — legitimate flows (research/source links, docs) use https.

**A4. Permissions.** Problem: Chromium permission surface. Options: (a) defaults, (b) selective
grants, (c) default-deny. Selected (c) after verifying zero feature needs (no mic/camera/geolocation/
notifications/clipboard-read in `src/`). Future capabilities must add explicit, documented grants.

**A5. Proxy CORS.** Problem: `*` lets any site spend operator quota. Options: (a) keep `*`,
(b) closed list breaking Docker/Electron, (c) same-origin + loopback + app + env allowlist.
Selected (c). Reason: covers every legitimate caller with zero configuration; remote static hosts
opt in explicitly. No-auth design retained (no identities exist yet).

**A6. Proxy limits.** Problem: unbounded bodies, no rate limit, no timeouts. Options: (a) Redis-backed
controls, (b) in-process controls. Selected (b): sliding-window limiter, 256 KB cap with socket
destruction, 15 s upstream timeouts. Reason: single-daemon deployment has no shared-state need;
Redis would add an unneeded dependency for a helper. Revisit if the proxy ever becomes multi-instance.
